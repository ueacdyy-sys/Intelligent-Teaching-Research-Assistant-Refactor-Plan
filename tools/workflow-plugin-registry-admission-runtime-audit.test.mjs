import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditWorkflowPluginRegistryAdmissionRuntime,
  formatWorkflowPluginRegistryAdmissionRuntimeAudit,
} from "./workflow-plugin-registry-admission-runtime-audit.mjs";

describe("Workflow plugin registry admission runtime audit", () => {
  it("passes when approved registry admission persists dry-run entries only", () => {
    const report = auditWorkflowPluginRegistryAdmissionRuntime(currentInputs(), {
      generatedAt: "2026-06-05T03:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "WORKFLOW_PLUGIN_REGISTRY_ADMISSION_RUNTIME");
    assert.equal(report.boundary.localExecutionEnabled, false);
    assert.equal(report.runtimeProbes.allow.status, "PASS");
    assert.equal(report.runtimeProbes.allow.registryEntryCount, 1);
    assert.equal(report.runtimeProbes.rejected.status, "REJECTED");
    assert.match(formatWorkflowPluginRegistryAdmissionRuntimeAudit(report), /Workflow plugin registry admission runtime: READY/u);
  });

  it("fails when registry entries can enable local execution", () => {
    const inputs = currentInputs();
    const schema = JSON.parse(inputs.registryEntrySchema);
    schema.properties.localExecutionEnabled.const = true;
    inputs.registryEntrySchema = JSON.stringify(schema);

    const report = auditWorkflowPluginRegistryAdmissionRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "registry_entry_contract.dry_run_only").passed, false);
  });

  it("fails when runtime no longer requires ADMIN_SYSTEM", () => {
    const inputs = currentInputs();
    inputs.runtime = inputs.runtime.replace("ADMIN_SYSTEM", "MISSING_ADMIN_SCOPE");

    const report = auditWorkflowPluginRegistryAdmissionRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.requires_internal_admin_and_evidence").passed, false);
  });

  it("fails when runtime claims execution candidates are enabled", () => {
    const inputs = currentInputs();
    inputs.runtime += "\nconst unsafe = { executionCandidateAllowed: true, localExecutionEnabled: true };\n";

    const report = auditWorkflowPluginRegistryAdmissionRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.no_publish_execution_or_host_run").passed, false);
  });

  it("fails when root workflow coverage does not require registry runtime evidence", () => {
    const inputs = currentInputs();
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("workflowPluginRegistryAdmissionRuntime", "missingRegistryAdmissionRuntime");

    const report = auditWorkflowPluginRegistryAdmissionRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_registry_runtime_report").passed, false);
  });
});

function currentInputs() {
  return {
    registryEntrySchema: JSON.stringify({
      required: ["registryEntryId", "executionMode", "localExecutionEnabled", "rollbackPlan"],
      properties: {
        executionMode: { const: "DRY_RUN_ONLY" },
        localExecutionEnabled: { const: false },
      },
    }),
    workflowDraftExample: JSON.stringify(workflowDraft()),
    sandboxRunExample: JSON.stringify(sandboxRun()),
    approvalExample: JSON.stringify(approval()),
    staticAdmission: [
      "admitWorkflowPluginRegistryEntry",
      "JsonlWorkflowPluginRegistryStore",
      "executionMode: \"DRY_RUN_ONLY\"",
      "localExecutionEnabled: false",
    ].join("\n"),
    runtime: [
      "authorizeRegistryWriter",
      "AGENT_INTERNAL",
      "ADMIN_SYSTEM",
      "role === \"STUDENT\"",
      "subjectType === \"REMOTE_CHANNEL\"",
      "humanApprovalRecordRef",
      "draftIntentRecordRef",
      "sandboxResultRecordRef",
      "sharedContextRef",
      "guardrailResultRef",
      "routeDecisionRef",
      "rollbackPlanRef",
      "auditTraceRef",
      "idempotencyKey",
      "admitWorkflowPluginRegistryEntry",
      "JsonlWorkflowPluginRegistryStore",
      "store.append",
      "appendCommandIntent",
      "findExistingRecordByIdempotencyKey",
      "APPEND_ONLY_JSONL",
      "executionMode: \"DRY_RUN_ONLY\"",
      "localExecutionEnabled: false",
      "workflowPublishAllowed: false",
      "executionCandidateAllowed: false",
      "localGeneratedCodeExecuted: false",
      "generatedCodeExecutedOnHost: false",
      "directDatabaseWriteAllowed: false",
    ].join("\n"),
    runtimeTest: [
      "persists an approved workflow/plugin registry entry as dry-run only",
      "rejects non-admin teachers",
      "rejects human approval that requested revision",
      "rejects failed sandbox evidence",
      "replays an idempotent registry admission",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:workflow-plugin-registry-admission-runtime": "node tools/workflow-plugin-registry-admission-runtime-audit.mjs --out reports/workflow-plugin-registry-admission-runtime.current.json",
      },
    }),
    qualityGate: "Workflow plugin registry admission runtime audit",
    rootWorkflowCoverage: [
      "workflowPluginRegistryAdmissionRuntime",
      "workflow-plugin-registry-admission-runtime.current.json",
      "[\"workflowPluginRegistryAdmissionRuntime\", \"READY\"]",
    ].join("\n"),
    verifyStructure: [
      "workflow-plugin-registry-admission-runtime.mjs",
      "workflow-plugin-registry-admission-runtime.test.mjs",
      "workflow-plugin-registry-admission-runtime-audit.mjs",
      "workflow-plugin-registry-admission-runtime-audit.test.mjs",
      "0231-workflow-plugin-registry-admission-runtime.md",
    ].join("\n"),
  };
}

function workflowDraft() {
  return {
    schemaVersion: "2026-05-30.workflow-plugin.draft.v1",
    draftId: "workflow_draft_lesson_archive_review",
    artifactKind: "WORKFLOW",
    capabilityKind: "WORKFLOW",
    origin: "USER_REQUEST",
    status: "DRAFT",
    userIntent: "Create a workflow that reviews lesson archive quality.",
    generatedBy: {
      agentKind: "DEVELOPMENT_AGENT",
      modelRef: "configured-workflow-generator",
    },
    generatedFiles: [
      {
        path: "workflows/lesson-archive-review/workflow.yaml",
        language: "yaml",
        role: "MANIFEST",
        contentRef: "sha256:workflow-manifest-placeholder",
      },
    ],
    executionMode: "DRY_RUN_ONLY",
    sandboxRequired: true,
    humanApprovalRequired: true,
    allowedHostAccess: "NONE",
    registrySaveAllowed: false,
  };
}

function sandboxRun() {
  return {
    schemaVersion: "2026-05-30.workflow-plugin.sandbox-run.v1",
    runId: "sandbox_run_lesson_archive_review_001",
    draftId: "workflow_draft_lesson_archive_review",
    startedAt: "2026-05-30T13:00:00Z",
    finishedAt: "2026-05-30T13:00:03Z",
    status: "PASS",
    executedInSandbox: true,
    noHostWrite: true,
    networkPolicy: "DEFAULT_DENY",
    tests: [
      {
        name: "workflow dry-run contract test",
        status: "PASS",
        durationMs: 120,
        logRef: "reports/workflow-plugin/sandbox-run-001.log",
      },
    ],
    performanceSummary: {
      p95Ms: 40,
      maxMemoryMb: 64,
    },
    feedback: [],
  };
}

function approval() {
  return {
    schemaVersion: "2026-05-30.workflow-plugin.approval.v1",
    approvalId: "workflow_plugin_approval_001",
    draftId: "workflow_draft_lesson_archive_review",
    sandboxRunId: "sandbox_run_lesson_archive_review_001",
    reviewerPrincipalId: "principal_teacher_admin",
    decision: "APPROVED",
    performanceReviewed: true,
    effectReviewed: true,
    registrySaveDecision: "ALLOW_SAVE",
    reviewedAt: "2026-05-30T13:05:00Z",
    comments: "Sandbox evidence is acceptable for dry-run registry admission.",
  };
}
