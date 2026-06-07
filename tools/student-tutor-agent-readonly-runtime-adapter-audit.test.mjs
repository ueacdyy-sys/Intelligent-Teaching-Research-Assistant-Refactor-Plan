import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentTutorAgentReadonlyRuntimeAdapter,
  formatStudentTutorAgentReadonlyRuntimeAdapterAudit,
} from "./student-tutor-agent-readonly-runtime-adapter-audit.mjs";

describe("StudentTutorAgent read-only runtime adapter audit", () => {
  it("passes when the real adapter is read-only, scoped, injected, and root-tracked", async () => {
    const report = await auditStudentTutorAgentReadonlyRuntimeAdapter(currentInputs(), {
      generatedAt: "2026-06-05T10:00:00.000Z",
      probeP99Ms: 4,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_TUTOR_AGENT_READONLY_RUNTIME_ADAPTER");
    assert.equal(report.adapter.readPort, "StudentLearningReadPort.recommendPracticeContext");
    assert.equal(report.runtimeSlo.p99Ms, 4);
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeProbes.invoke.status, "PASS");
    assert.match(formatStudentTutorAgentReadonlyRuntimeAdapterAudit(report), /StudentTutorAgent read-only runtime adapter: READY/u);
  });

  it("fails when the adapter contract can write through the read port", async () => {
    const inputs = currentInputs();
    const adapter = JSON.parse(inputs.adapterExample);
    adapter.readPort.writeOperationAllowed = true;
    inputs.adapterExample = JSON.stringify(adapter);

    const report = await auditStudentTutorAgentReadonlyRuntimeAdapter(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "contract.adapter_identity_and_read_port").passed, false);
  });

  it("fails when input boundaries allow zero-length recommendation reasons", async () => {
    const inputs = currentInputs();
    const inputSchema = JSON.parse(inputs.skillInputSchema);
    inputSchema.properties.limits.properties.maxReasonChars.minimum = 0;
    inputs.skillInputSchema = JSON.stringify(inputSchema);

    const report = await auditStudentTutorAgentReadonlyRuntimeAdapter(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "contract.skill_input_output_boundaries").passed, false);
  });

  it("fails when runtime code claims raw archive access or direct SQL", async () => {
    const inputs = currentInputs();
    inputs.runtime += "\nconst sql = 'SELECT * FROM student_archive'; const rawStudentArchiveReturned = true;\n";

    const report = await auditStudentTutorAgentReadonlyRuntimeAdapter(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.no_side_effects_direct_db_model_or_raw_archive").passed, false);
  });

  it("fails when quality gate registration is missing", async () => {
    const inputs = currentInputs();
    const packageJson = JSON.parse(inputs.packageJson);
    delete packageJson.scripts["audit:student-tutor-agent-readonly-runtime-adapter"];
    inputs.packageJson = JSON.stringify(packageJson);

    const report = await auditStudentTutorAgentReadonlyRuntimeAdapter(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_tracks_runtime_adapter").passed, false);
  });

  it("fails when root workflow coverage does not require the adapter report", async () => {
    const inputs = currentInputs();
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("studentTutorAgentReadonlyRuntimeAdapter", "missingStudentTutorAdapter");

    const report = await auditStudentTutorAgentReadonlyRuntimeAdapter(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_runtime_adapter_report").passed, false);
  });
});

function currentInputs() {
  return {
    adapterSchema: JSON.stringify(adapterSchema()),
    adapterExample: JSON.stringify(adapterExample()),
    skillInputSchema: JSON.stringify(skillInputSchema()),
    skillOutputSchema: JSON.stringify(skillOutputSchema()),
    runtime: [
      "readPort.recommendPracticeContext",
      "buildReadPortRequest",
      "assertPrincipalContext",
      "assertSharedContext",
      "assertGuardrailResult",
      "assertRouteDecision",
      "requireConst(sharedContext.dataScopes.student, \"ASSIGNED\"",
      "requireConst(sharedContext.dataScopes.knowledge, \"PUBLIC\"",
      "requireConst(sharedContext.dataScopes.teaching, \"READ\"",
      "requireConst(sharedContext.dataScopes.research, \"NONE\"",
      "requireConst(guardrailResult.decision, \"ALLOW\"",
      "requireConst(routeDecision.mode, \"SINGLE_WORKER\"",
      "directDatabaseAccessAllowed: false",
      "writeOperationAllowed: false",
      "crossStudentDataReturned: false",
      "rawStudentArchiveReturned: false",
      "finalEvaluationReturned: false",
      "externalModelUsed: false",
      "localToolMutationAllowed: false",
      "returnedWithinStudentScope: true",
    ].join("\n"),
    runtimeTest: [
      "invokes the injected read port and maps scoped practice recommendations",
      "returns NO_MATCH",
      "rejects write, external model, final evaluation, and cross-student requests",
      "enforces OWN and ASSIGNED principal scopes",
      "rejects unsafe SharedContext scopes",
      "rejects guardrail deny and wrong route decisions",
      "requires an injected read port and rejects unsafe rows",
      "truncates recommendations and reasons",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:student-tutor-agent-readonly-runtime-adapter": "node tools/student-tutor-agent-readonly-runtime-adapter-audit.mjs --out reports/student-tutor-agent-readonly-runtime-adapter.current.json",
      },
    }),
    qualityGate: "StudentTutorAgent read-only runtime adapter audit",
    rootWorkflowCoverage: [
      "studentTutorAgentReadonlyRuntimeAdapter",
      "student-tutor-agent-readonly-runtime-adapter.current.json",
      "[\"studentTutorAgentReadonlyRuntimeAdapter\", \"READY\"]",
      "student_tutor_agent_readonly_runtime_adapter",
    ].join("\n"),
    verifyStructure: [
      "student-tutor-agent-readonly-runtime-adapter.mjs",
      "student-tutor-agent-readonly-runtime-adapter.test.mjs",
      "student-tutor-agent-readonly-runtime-adapter-audit.mjs",
      "student-tutor-agent-readonly-runtime-adapter-audit.test.mjs",
      "0239-student-tutor-agent-readonly-runtime-adapter.md",
    ].join("\n"),
  };
}

function adapterSchema() {
  return {
    properties: {
      adapterId: { const: "student_tutor_recommend_practice_readonly_adapter" },
      workerAgent: { const: "StudentTutorAgent" },
      skillId: { const: "recommend_practice" },
      routeMode: { const: "SINGLE_WORKER" },
    },
  };
}

function adapterExample() {
  return {
    adapterId: "student_tutor_recommend_practice_readonly_adapter",
    workerAgent: "StudentTutorAgent",
    skillId: "recommend_practice",
    routeMode: "SINGLE_WORKER",
    readPort: {
      portName: "StudentLearningReadPort",
      operation: "recommendPracticeContext",
      directDatabaseAccessAllowed: false,
      writeOperationAllowed: false,
    },
  };
}

function skillInputSchema() {
  return {
    properties: {
      writeIntent: { const: false },
      studentDataAccess: { const: "OWN_OR_ASSIGNED" },
      externalModelAllowed: { const: false },
      finalEvaluationAllowed: { const: false },
      latencyBudgetMs: { maximum: 50 },
      targetStudentScope: {
        properties: {
          crossStudentComparisonAllowed: { const: false },
        },
      },
      filters: {
        properties: {
          includeOtherStudents: { const: false },
        },
      },
      limits: {
        properties: {
          maxReasonChars: { minimum: 1 },
        },
      },
    },
  };
}

function skillOutputSchema() {
  return {
    properties: {
      safety: {
        properties: {
          directDatabaseWriteAllowed: { const: false },
          crossStudentDataReturned: { const: false },
          rawStudentArchiveReturned: { const: false },
          finalEvaluationReturned: { const: false },
          externalModelUsed: { const: false },
          localToolMutationAllowed: { const: false },
          returnedWithinStudentScope: { const: true },
        },
      },
    },
  };
}
