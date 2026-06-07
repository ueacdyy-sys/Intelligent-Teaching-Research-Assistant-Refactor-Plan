import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  auditAgentSkillContracts,
  formatAgentSkillContractAudit,
} from "./agent-skill-contract-audit.mjs";

const root = process.cwd();

function loadCurrentInputs() {
  return {
    skillSchema: loadJson("contracts/agent/skill-manifest.schema.json"),
    skillExamples: loadJson("contracts/agent/skill-manifest.examples.json"),
    sharedContextSchema: loadJson("contracts/agent/shared-context.schema.json"),
    sharedContextExample: loadJson("contracts/agent/shared-context.example.json"),
    agentTaskSchema: loadJson("contracts/agent/agent-task.schema.json"),
    agentTaskExample: loadJson("contracts/agent/agent-task.example.json"),
    routeDecisionSchema: loadJson("contracts/agent/agent-route-decision.schema.json"),
    routeDecisionExample: loadJson("contracts/agent/agent-route-decision.example.json"),
    guardrailResultSchema: loadJson("contracts/agent/guardrail-result.schema.json"),
    guardrailResultExample: loadJson("contracts/agent/guardrail-result.example.json"),
    searchTeachingMaterialInputSchema: loadJson("contracts/agent/skills/search-teaching-material.input.schema.json"),
    searchTeachingMaterialOutputSchema: loadJson("contracts/agent/skills/search-teaching-material.output.schema.json"),
    searchTeachingMaterialInputExample: loadJson("contracts/agent/skills/search-teaching-material.input.example.json"),
    searchTeachingMaterialOutputExample: loadJson("contracts/agent/skills/search-teaching-material.output.example.json"),
    teachingReadonlyAdapterSchema: loadJson("contracts/agent/teaching-agent-readonly-adapter.schema.json"),
    teachingReadonlyAdapterExample: loadJson("contracts/agent/teaching-agent-readonly-adapter.example.json"),
  };
}

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

describe("Agent Skill contract audit", () => {
  it("passes the current Agent Skill, SharedContext, RouteDecision, and Guardrail contracts", () => {
    const report = auditAgentSkillContracts(loadCurrentInputs());

    assert.equal(report.readiness, "READY");
    assert.equal(report.summary.directDatabaseWriteAllowed, false);
    assert.equal(report.summary.teachingReadOnlySkill.skillId, "search_teaching_material");
    assert.equal(report.summary.teachingReadOnlySkill.schemaRefsReady, true);
    assert.equal(report.summary.teachingReadOnlySkill.inputBoundaryReady, true);
    assert.equal(report.summary.teachingReadOnlySkill.outputBoundaryReady, true);
    assert.equal(report.summary.teachingReadOnlyAdapter.adapterId, "teaching_agent_search_material_readonly_adapter");
    assert.equal(report.summary.teachingReadOnlyAdapter.readPortReady, true);
    assert.equal(report.summary.teachingReadOnlyAdapter.guardsReady, true);
    assert.equal(report.summary.teachingReadOnlyAdapter.evidenceSloReady, true);
    assert.match(formatAgentSkillContractAudit(report), /Agent Skill contracts: READY/u);
    assert.match(formatAgentSkillContractAudit(report), /Teaching read-only adapter/u);
  });

  it("fails when a Skill can write directly to the main database", () => {
    const inputs = loadCurrentInputs();
    const skillExamples = clone(inputs.skillExamples);
    skillExamples.skills[0].directDatabaseWriteAllowed = true;

    const report = auditAgentSkillContracts({ ...inputs, skillExamples });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "skill.examples_no_direct_database_write").passed, false);
  });

  it("fails when dangerous permissions bypass Harness", () => {
    const inputs = loadCurrentInputs();
    const skillExamples = clone(inputs.skillExamples);
    const dangerousSkill = skillExamples.skills.find((skill) => skill.skillId === "run_benchmark");
    dangerousSkill.harnessRequired = false;

    const report = auditAgentSkillContracts({ ...inputs, skillExamples });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "skill.dangerous_permissions_require_harness").passed, false);
  });

  it("fails when a required Agent domain is missing", () => {
    const inputs = loadCurrentInputs();
    const skillExamples = clone(inputs.skillExamples);
    skillExamples.skills = skillExamples.skills.filter((skill) => skill.domain !== "ModelExperiment");

    const report = auditAgentSkillContracts({ ...inputs, skillExamples });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "skill.domain_coverage").passed, false);
  });

  it("fails when SharedContext drops root anchors or the 50ms latency budget", () => {
    const inputs = loadCurrentInputs();
    const sharedContextExample = clone(inputs.sharedContextExample);
    sharedContextExample.rootRequirementAnchors = [];
    sharedContextExample.latencyBudgetMs = 300;

    const report = auditAgentSkillContracts({ ...inputs, sharedContextExample });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "shared_context.example_root_and_budget").passed, false);
  });

  it("fails when write-intent tasks do not show human approval", () => {
    const inputs = loadCurrentInputs();
    const agentTaskExample = clone(inputs.agentTaskExample);
    agentTaskExample.tasks = agentTaskExample.tasks.map((task) => ({ ...task, requiresHumanApproval: false }));

    const report = auditAgentSkillContracts({ ...inputs, agentTaskExample });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "task.write_intent_requires_approval_example").passed, false);
  });

  it("fails when Swarm routing evidence is missing", () => {
    const inputs = loadCurrentInputs();
    const routeDecisionExample = clone(inputs.routeDecisionExample);
    routeDecisionExample.decisions = routeDecisionExample.decisions.filter((decision) => decision.mode !== "SWARM");

    const report = auditAgentSkillContracts({ ...inputs, routeDecisionExample });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "route.examples_single_and_swarm").passed, false);
  });

  it("fails when guardrails lose deny coverage", () => {
    const inputs = loadCurrentInputs();
    const guardrailResultExample = clone(inputs.guardrailResultExample);
    guardrailResultExample.results = guardrailResultExample.results.filter((result) => result.decision !== "DENY");

    const report = auditAgentSkillContracts({ ...inputs, guardrailResultExample });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "guardrail.examples_decision_coverage").passed, false);
  });

  it("fails when TeachingAgent read-only schema refs are missing", () => {
    const inputs = loadCurrentInputs();
    const skillExamples = clone(inputs.skillExamples);
    const teachingSkill = skillExamples.skills.find((skill) => skill.skillId === "search_teaching_material");
    teachingSkill.inputSchemaRef = "contracts/agent/skills/missing.input.schema.json";

    const report = auditAgentSkillContracts({ ...inputs, skillExamples });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "teaching_readonly_skill.schema_refs").passed, false);
  });

  it("fails when TeachingAgent read-only input can request writes or student archives", () => {
    const inputs = loadCurrentInputs();
    const inputSchema = clone(inputs.searchTeachingMaterialInputSchema);
    inputSchema.properties.writeIntent.const = true;
    inputSchema.properties.filters.properties.includeStudentArchive.const = true;

    const report = auditAgentSkillContracts({ ...inputs, searchTeachingMaterialInputSchema: inputSchema });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "teaching_readonly_skill.input_boundary").passed, false);
  });

  it("fails when TeachingAgent read-only output can return student data or skip runtime evidence", () => {
    const inputs = loadCurrentInputs();
    const outputSchema = clone(inputs.searchTeachingMaterialOutputSchema);
    outputSchema.properties.safety.properties.studentDataReturned.const = true;
    outputSchema.properties.slo.properties.runtimeEvidenceRequiredBeforePromotion.const = false;

    const report = auditAgentSkillContracts({ ...inputs, searchTeachingMaterialOutputSchema: outputSchema });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "teaching_readonly_skill.output_boundary").passed, false);
  });

  it("fails when TeachingAgent read-only examples exceed the 50ms budget", () => {
    const inputs = loadCurrentInputs();
    const inputExample = clone(inputs.searchTeachingMaterialInputExample);
    const outputExample = clone(inputs.searchTeachingMaterialOutputExample);
    inputExample.latencyBudgetMs = 80;
    outputExample.slo.p99BudgetMs = 80;

    const report = auditAgentSkillContracts({
      ...inputs,
      searchTeachingMaterialInputExample: inputExample,
      searchTeachingMaterialOutputExample: outputExample,
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "teaching_readonly_skill.examples_safe_fast_path").passed, false);
  });

  it("fails when TeachingAgent read-only adapter bypasses the read port", () => {
    const inputs = loadCurrentInputs();
    const adapterSchema = clone(inputs.teachingReadonlyAdapterSchema);
    const adapterExample = clone(inputs.teachingReadonlyAdapterExample);
    adapterSchema.properties.readPort.properties.directDatabaseAccessAllowed.const = true;
    adapterExample.readPort.directDatabaseAccessAllowed = true;

    const report = auditAgentSkillContracts({
      ...inputs,
      teachingReadonlyAdapterSchema: adapterSchema,
      teachingReadonlyAdapterExample: adapterExample,
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "teaching_readonly_adapter.read_port").passed, false);
  });

  it("fails when TeachingAgent read-only adapter can access student archives or local tools", () => {
    const inputs = loadCurrentInputs();
    const adapterSchema = clone(inputs.teachingReadonlyAdapterSchema);
    const adapterExample = clone(inputs.teachingReadonlyAdapterExample);
    adapterSchema.properties.guards.properties.denyOnStudentArchiveRequest.const = false;
    adapterSchema.properties.guards.properties.dataScopes.properties.student.const = "ASSIGNED";
    adapterExample.guards.denyOnStudentArchiveRequest = false;
    adapterExample.guards.dataScopes.student = "ASSIGNED";
    adapterExample.guards.dataScopes.localTool = "MUTATING";

    const report = auditAgentSkillContracts({
      ...inputs,
      teachingReadonlyAdapterSchema: adapterSchema,
      teachingReadonlyAdapterExample: adapterExample,
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "teaching_readonly_adapter.guards_and_scopes").passed, false);
  });

  it("fails when TeachingAgent read-only adapter can skip runtime timing evidence before promotion", () => {
    const inputs = loadCurrentInputs();
    const adapterSchema = clone(inputs.teachingReadonlyAdapterSchema);
    const adapterExample = clone(inputs.teachingReadonlyAdapterExample);
    adapterSchema.properties.evidence.properties.runtimeTimingRequired.const = false;
    adapterSchema.properties.promotion.properties.runtimeEvidenceRequiredBeforePromotion.const = false;
    adapterExample.evidence.runtimeTimingRequired = false;
    adapterExample.promotion.runtimeEvidenceRequiredBeforePromotion = false;

    const report = auditAgentSkillContracts({
      ...inputs,
      teachingReadonlyAdapterSchema: adapterSchema,
      teachingReadonlyAdapterExample: adapterExample,
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "teaching_readonly_adapter.evidence_slo_promotion").passed, false);
  });
});
