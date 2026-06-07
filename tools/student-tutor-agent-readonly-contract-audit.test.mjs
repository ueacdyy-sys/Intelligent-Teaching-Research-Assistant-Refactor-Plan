import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  auditStudentTutorAgentReadonlyContracts,
  formatStudentTutorAgentReadonlyContractAudit,
} from "./student-tutor-agent-readonly-contract-audit.mjs";

const root = process.cwd();

describe("StudentTutorAgent read-only contract audit", () => {
  it("passes the current StudentTutorAgent recommend_practice fast-path contracts", () => {
    const report = auditStudentTutorAgentReadonlyContracts(currentInputs());

    assert.equal(report.readiness, "READY");
    assert.equal(report.summary.studentTutorReadOnlySkill.skillId, "recommend_practice");
    assert.equal(report.summary.studentTutorReadOnlySkill.schemaRefsReady, true);
    assert.equal(report.summary.studentTutorReadOnlySkill.inputBoundaryReady, true);
    assert.equal(report.summary.studentTutorReadOnlySkill.outputBoundaryReady, true);
    assert.equal(report.summary.studentTutorReadOnlyAdapter.adapterId, "student_tutor_recommend_practice_readonly_adapter");
    assert.equal(report.summary.studentTutorReadOnlyAdapter.readPortReady, true);
    assert.equal(report.summary.studentTutorReadOnlyAdapter.guardsReady, true);
    assert.match(formatStudentTutorAgentReadonlyContractAudit(report), /StudentTutorAgent read-only contracts: READY/u);
  });

  it("fails when the recommend_practice manifest allows broad student access", () => {
    const inputs = currentInputs();
    const skill = inputs.skillExamples.skills.find((candidate) => candidate.skillId === "recommend_practice");
    skill.dataScopes.student = "ALL";

    const report = auditStudentTutorAgentReadonlyContracts(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "student_tutor_readonly_skill.manifest").passed, false);
  });

  it("fails when input can request cross-student comparison or final evaluation", () => {
    const inputs = currentInputs();
    inputs.inputSchema.properties.targetStudentScope.properties.crossStudentComparisonAllowed.const = true;
    inputs.inputSchema.properties.finalEvaluationAllowed.const = true;

    const report = auditStudentTutorAgentReadonlyContracts(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "student_tutor_readonly_skill.input_boundary").passed, false);
  });

  it("fails when output can return raw archive data or final evaluations", () => {
    const inputs = currentInputs();
    inputs.outputSchema.properties.safety.properties.rawStudentArchiveReturned.const = true;
    inputs.outputSchema.properties.safety.properties.finalEvaluationReturned.const = true;

    const report = auditStudentTutorAgentReadonlyContracts(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "student_tutor_readonly_skill.output_boundary").passed, false);
  });

  it("fails when examples exceed the 50ms budget", () => {
    const inputs = currentInputs();
    inputs.inputExample.latencyBudgetMs = 80;
    inputs.outputExample.slo.p99BudgetMs = 80;

    const report = auditStudentTutorAgentReadonlyContracts(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "student_tutor_readonly_skill.examples_safe_fast_path").passed, false);
  });

  it("fails when the adapter bypasses the student learning read port", () => {
    const inputs = currentInputs();
    inputs.adapterSchema.properties.readPort.properties.directDatabaseAccessAllowed.const = true;
    inputs.adapterExample.readPort.directDatabaseAccessAllowed = true;

    const report = auditStudentTutorAgentReadonlyContracts(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "student_tutor_readonly_adapter.identity_and_port").passed, false);
  });

  it("fails when adapter guards allow local tool mutation", () => {
    const inputs = currentInputs();
    inputs.adapterSchema.properties.guards.properties.denyOnLocalToolMutation.const = false;
    inputs.adapterExample.guards.denyOnLocalToolMutation = false;
    inputs.adapterExample.guards.dataScopes.localTool = "MUTATING";

    const report = auditStudentTutorAgentReadonlyContracts(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "student_tutor_readonly_adapter.guards_evidence_slo").passed, false);
  });
});

function currentInputs() {
  return {
    skillExamples: loadJson("contracts/agent/skill-manifest.examples.json"),
    inputSchema: loadJson("contracts/agent/skills/recommend-practice.input.schema.json"),
    outputSchema: loadJson("contracts/agent/skills/recommend-practice.output.schema.json"),
    inputExample: loadJson("contracts/agent/skills/recommend-practice.input.example.json"),
    outputExample: loadJson("contracts/agent/skills/recommend-practice.output.example.json"),
    adapterSchema: loadJson("contracts/agent/student-tutor-agent-readonly-adapter.schema.json"),
    adapterExample: loadJson("contracts/agent/student-tutor-agent-readonly-adapter.example.json"),
  };
}

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}
