import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  auditResearchAgentReadonlyContracts,
  formatResearchAgentReadonlyContractAudit,
} from "./research-agent-readonly-contract-audit.mjs";

const root = process.cwd();

describe("ResearchAgent read-only contract audit", () => {
  it("passes the current ResearchAgent search_knowledge fast-path contracts", () => {
    const report = auditResearchAgentReadonlyContracts(currentInputs());

    assert.equal(report.readiness, "READY");
    assert.equal(report.summary.researchReadOnlySkill.skillId, "search_knowledge");
    assert.equal(report.summary.researchReadOnlySkill.schemaRefsReady, true);
    assert.equal(report.summary.researchReadOnlySkill.inputBoundaryReady, true);
    assert.equal(report.summary.researchReadOnlySkill.outputBoundaryReady, true);
    assert.equal(report.summary.researchReadOnlyAdapter.adapterId, "research_agent_search_knowledge_readonly_adapter");
    assert.equal(report.summary.researchReadOnlyAdapter.readPortReady, true);
    assert.equal(report.summary.researchReadOnlyAdapter.guardsReady, true);
    assert.match(formatResearchAgentReadonlyContractAudit(report), /ResearchAgent read-only contracts: READY/u);
  });

  it("fails when the search_knowledge manifest can access student data", () => {
    const inputs = currentInputs();
    const skill = inputs.skillExamples.skills.find((candidate) => candidate.skillId === "search_knowledge");
    skill.dataScopes.student = "ASSIGNED";

    const report = auditResearchAgentReadonlyContracts(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "research_readonly_skill.manifest").passed, false);
  });

  it("fails when input can request synthesis or student archives", () => {
    const inputs = currentInputs();
    inputs.inputSchema.properties.synthesisAllowed.const = true;
    inputs.inputSchema.properties.filters.properties.includeStudentArchive.const = true;

    const report = auditResearchAgentReadonlyContracts(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "research_readonly_skill.input_boundary").passed, false);
  });

  it("fails when output can return student archive data or skip policy safety", () => {
    const inputs = currentInputs();
    inputs.outputSchema.properties.items.items.properties.classification.enum.push("STUDENT_ARCHIVE");
    inputs.outputSchema.properties.safety.properties.returnedWithinPolicy.const = false;

    const report = auditResearchAgentReadonlyContracts(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "research_readonly_skill.output_boundary").passed, false);
  });

  it("fails when examples exceed the 50ms budget", () => {
    const inputs = currentInputs();
    inputs.inputExample.latencyBudgetMs = 80;
    inputs.outputExample.slo.p99BudgetMs = 80;

    const report = auditResearchAgentReadonlyContracts(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "research_readonly_skill.examples_safe_fast_path").passed, false);
  });

  it("fails when the adapter bypasses the knowledge read port", () => {
    const inputs = currentInputs();
    inputs.adapterSchema.properties.readPort.properties.directDatabaseAccessAllowed.const = true;
    inputs.adapterExample.readPort.directDatabaseAccessAllowed = true;

    const report = auditResearchAgentReadonlyContracts(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "research_readonly_adapter.identity_and_port").passed, false);
  });

  it("fails when adapter guards allow tool mutation", () => {
    const inputs = currentInputs();
    inputs.adapterSchema.properties.guards.properties.denyOnLocalToolMutation.const = false;
    inputs.adapterExample.guards.denyOnLocalToolMutation = false;
    inputs.adapterExample.guards.dataScopes.localTool = "MUTATING";

    const report = auditResearchAgentReadonlyContracts(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "research_readonly_adapter.guards_evidence_slo").passed, false);
  });
});

function currentInputs() {
  return {
    skillExamples: loadJson("contracts/agent/skill-manifest.examples.json"),
    inputSchema: loadJson("contracts/agent/skills/search-knowledge.input.schema.json"),
    outputSchema: loadJson("contracts/agent/skills/search-knowledge.output.schema.json"),
    inputExample: loadJson("contracts/agent/skills/search-knowledge.input.example.json"),
    outputExample: loadJson("contracts/agent/skills/search-knowledge.output.example.json"),
    adapterSchema: loadJson("contracts/agent/research-agent-readonly-adapter.schema.json"),
    adapterExample: loadJson("contracts/agent/research-agent-readonly-adapter.example.json"),
  };
}

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}
