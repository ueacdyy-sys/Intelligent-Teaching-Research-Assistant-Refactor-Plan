import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditWorkflowPluginExecutionIsolationRuntime,
  formatWorkflowPluginExecutionIsolationAudit,
} from "./workflow-plugin-execution-isolation-audit.mjs";

describe("Workflow plugin execution isolation runtime audit", () => {
  it("passes when execution candidates remain blocked by isolation policy", () => {
    const report = auditWorkflowPluginExecutionIsolationRuntime(currentInputs(), {
      generatedAt: "2026-06-05T04:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "WORKFLOW_PLUGIN_EXECUTION_ISOLATION_RUNTIME");
    assert.equal(report.boundary.executionCandidateAllowed, false);
    assert.equal(report.boundary.processLaunchAllowed, false);
    assert.equal(report.runtimeProbes.blocked.status, "PASS");
    assert.equal(report.runtimeProbes.blocked.result.executionCandidateView.candidateCount, 0);
    assert.match(formatWorkflowPluginExecutionIsolationAudit(report), /Workflow plugin execution isolation runtime: READY/u);
  });

  it("fails when isolation policy allows process launch", () => {
    const inputs = currentInputs();
    const schema = JSON.parse(inputs.isolationPolicySchema);
    schema.properties.processLaunchAllowed.const = true;
    inputs.isolationPolicySchema = JSON.stringify(schema);

    const report = auditWorkflowPluginExecutionIsolationRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "isolation_policy.default_blocks_host_execution").passed, false);
  });

  it("fails when execution candidate view can expose candidates", () => {
    const inputs = currentInputs();
    const schema = JSON.parse(inputs.executionCandidateViewSchema);
    schema.properties.candidateCount.const = 1;
    schema.properties.candidates.maxItems = 1;
    inputs.executionCandidateViewSchema = JSON.stringify(schema);

    const report = auditWorkflowPluginExecutionIsolationRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "candidate_view.contract_blocks_candidates").passed, false);
  });

  it("fails when runtime claims local execution is enabled", () => {
    const inputs = currentInputs();
    inputs.runtime += "\nconst unsafe = { localExecutionEnabled: true, processLaunchAllowed: true };\n";

    const report = auditWorkflowPluginExecutionIsolationRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.append_only_no_execution_or_publish").passed, false);
  });

  it("fails when root workflow coverage does not require execution isolation evidence", () => {
    const inputs = currentInputs();
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("workflowPluginExecutionIsolation", "missingExecutionIsolation");

    const report = auditWorkflowPluginExecutionIsolationRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_execution_isolation_report").passed, false);
  });
});

function currentInputs() {
  return {
    isolationPolicySchema: JSON.stringify({
      properties: {
        mode: { const: "BLOCK_HOST_EXECUTION" },
        hostWritePolicy: { const: "DENY" },
        networkPolicy: { const: "DEFAULT_DENY" },
        processLaunchAllowed: { const: false },
        candidateExposure: { const: "DISABLED" },
        requiresFutureSdd: { const: true },
        auditLogRequired: { const: true },
      },
    }),
    isolationPolicyExample: JSON.stringify(isolationPolicy()),
    registryEntryExample: JSON.stringify(registryEntry()),
    executionCandidateViewSchema: JSON.stringify({
      properties: {
        candidateCount: { const: 0 },
        candidates: { maxItems: 0 },
        blockedReason: { const: "real local execution is disabled by current SDD" },
      },
    }),
    executionCandidateViewExample: JSON.stringify(executionCandidateView()),
    runtime: [
      "authorizeIsolationRecorder",
      "AGENT_INTERNAL",
      "ADMIN_SYSTEM",
      "role === \"STUDENT\"",
      "subjectType === \"REMOTE_CHANNEL\"",
      "registryAdmissionRecordRef",
      "humanApprovalRecordRef",
      "sandboxResultRecordRef",
      "sharedContextRef",
      "guardrailResultRef",
      "routeDecisionRef",
      "rollbackPlanRef",
      "auditTraceRef",
      "idempotencyKey",
      "registry entries must remain DRY_RUN_ONLY with localExecutionEnabled=false",
      "policy must block host execution, host writes, process launch, candidate exposure, and require a future SDD",
      "execution candidates must remain empty",
      "future SDD must explicitly enable execution candidates",
      "BLOCK_HOST_EXECUTION",
      "DEFAULT_DENY",
      "DISABLED",
      "appendCommandIntent",
      "fs.appendFileSync",
      "findExistingRecordByIdempotencyKey",
      "workflow-command-log",
      "workflowPublishAllowed: false",
      "executionCandidateAllowed: false",
      "localExecutionEnabled: false",
      "processLaunchAllowed: false",
      "hostWriteAllowed: false",
      "localGeneratedCodeExecuted: false",
      "generatedCodeExecutedOnHost: false",
    ].join("\n"),
    runtimeTest: [
      "records a blocked execution-candidate precheck",
      "rejects registry entries that enable local execution",
      "rejects isolation policies that allow process launch",
      "rejects execution candidate views that expose candidates",
      "rejects ordinary teacher principals",
      "replays an idempotent precheck",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:workflow-plugin-execution-isolation": "node tools/workflow-plugin-execution-isolation-audit.mjs --out reports/workflow-plugin-execution-isolation.current.json",
      },
    }),
    qualityGate: "Workflow plugin execution isolation runtime audit",
    rootWorkflowCoverage: [
      "workflowPluginExecutionIsolation",
      "workflow-plugin-execution-isolation.current.json",
      "[\"workflowPluginExecutionIsolation\", \"READY\"]",
    ].join("\n"),
    verifyStructure: [
      "workflow-plugin-execution-isolation-policy.schema.json",
      "workflow-plugin-execution-isolation-policy.example.json",
      "workflow-plugin-execution-isolation-runtime.mjs",
      "workflow-plugin-execution-isolation-runtime.test.mjs",
      "workflow-plugin-execution-isolation-audit.mjs",
      "workflow-plugin-execution-isolation-audit.test.mjs",
      "0232-workflow-plugin-execution-isolation-precheck.md",
    ].join("\n"),
  };
}

function registryEntry() {
  return {
    schemaVersion: "2026-05-30.workflow-plugin.registry-entry.v1",
    registryEntryId: "workflow_registry_lesson_archive_review",
    draftId: "workflow_draft_lesson_archive_review",
    sandboxRunId: "sandbox_run_lesson_archive_review_001",
    approvalId: "workflow_plugin_approval_001",
    artifactKind: "WORKFLOW",
    capabilityKind: "WORKFLOW",
    name: "Lesson Archive Review",
    version: "0.1.0",
    status: "ACTIVE",
    executionMode: "DRY_RUN_ONLY",
    localExecutionEnabled: false,
    rollbackPlan: "Disable the dry-run registry entry and keep review evidence.",
    provenance: {
      origin: "USER_REQUEST",
      generatedAt: "2026-06-05T03:00:00.000Z",
      approvedAt: "2026-05-30T13:05:00Z",
    },
  };
}

function isolationPolicy() {
  return {
    schemaVersion: "2026-06-05.workflow-plugin.execution-isolation-policy.v1",
    policyId: "workflow_plugin_execution_policy_lesson_archive_review",
    registryEntryId: "workflow_registry_lesson_archive_review",
    mode: "BLOCK_HOST_EXECUTION",
    hostWritePolicy: "DENY",
    networkPolicy: "DEFAULT_DENY",
    processLaunchAllowed: false,
    candidateExposure: "DISABLED",
    requiresFutureSdd: true,
    maxRuntimeMs: 1000,
    maxMemoryMb: 64,
    auditLogRequired: true,
  };
}

function executionCandidateView() {
  return {
    schemaVersion: "2026-05-29.agent-harness.execution-candidate-view.v1",
    generatedAt: "2026-05-29T11:00:00Z",
    sourceQueueGeneratedAt: "2026-05-29T10:00:00Z",
    sourceApprovalDecisionCount: 1,
    sourceUncorrelatedDecisionCount: 0,
    candidateCount: 0,
    candidates: [],
    blockedReason: "real local execution is disabled by current SDD",
    blockedPreconditions: [
      "future SDD must explicitly enable execution candidates",
    ],
  };
}
