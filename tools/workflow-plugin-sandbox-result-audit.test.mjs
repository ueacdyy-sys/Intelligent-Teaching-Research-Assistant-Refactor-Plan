import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditWorkflowPluginSandboxResultRuntime,
  formatWorkflowPluginSandboxResultAudit,
} from "./workflow-plugin-sandbox-result-audit.mjs";

describe("Workflow plugin sandbox result runtime audit", () => {
  it("passes when sandbox results are append-only review evidence", () => {
    const report = auditWorkflowPluginSandboxResultRuntime(currentInputs(), {
      generatedAt: "2026-06-05T01:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "WORKFLOW_PLUGIN_SANDBOX_RESULT_RUNTIME");
    assert.equal(report.boundary.registrySaveAllowed, false);
    assert.equal(report.runtimeProbes.pass.status, "PASS");
    assert.equal(report.runtimeProbes.fail.result.revisionRequired, true);
    assert.match(formatWorkflowPluginSandboxResultAudit(report), /Workflow plugin sandbox result runtime: READY/u);
  });

  it("fails when sandbox contract can write to the host", () => {
    const inputs = currentInputs();
    const schema = JSON.parse(inputs.sandboxRunSchema);
    schema.properties.noHostWrite.const = false;
    inputs.sandboxRunSchema = JSON.stringify(schema);

    const report = auditWorkflowPluginSandboxResultRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "sandbox_contract.default_deny_no_host_write").passed, false);
  });

  it("fails when runtime claims registry save", () => {
    const inputs = currentInputs();
    inputs.runtime += "\nconst unsafe = { registrySaveAllowed: true, workflowPublishAllowed: true };\n";

    const report = auditWorkflowPluginSandboxResultRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.append_only_no_registry_publish").passed, false);
  });

  it("fails when failing sandbox probe cannot produce revision feedback", () => {
    const inputs = currentInputs();
    const runtime = inputs.runtime;
    inputs.runtime = runtime.replace("buildWorkflowPluginRevisionRequest", "missingRevisionBuilder");

    const report = auditWorkflowPluginSandboxResultRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.revision_feedback_wired").passed, false);
  });
});

function currentInputs() {
  return {
    sandboxRunSchema: JSON.stringify({
      required: ["tests", "performanceSummary", "feedback"],
      properties: {
        executedInSandbox: { const: true },
        noHostWrite: { const: true },
        networkPolicy: { const: "DEFAULT_DENY" },
      },
    }),
    workflowDraftExample: JSON.stringify(workflowDraft()),
    sandboxRunExample: JSON.stringify(sandboxRun()),
    revisionFeedback: "buildWorkflowPluginRevisionRequest revisionDecision REVISION_REQUIRED",
    runtime: [
      "buildWorkflowPluginRevisionRequest",
      "authorizeSandboxRecorder",
      "SERVICE",
      "AGENT_INTERNAL",
      "ADMIN_SYSTEM",
      "requiredEvidenceFields",
      "draftIntentRecordRef",
      "sandboxManifestRef",
      "guardrailResultRef",
      "routeDecisionRef",
      "rollbackPlanRef",
      "auditTraceRef",
      "idempotencyKey",
      "appendCommandIntent",
      "fs.appendFileSync",
      "findExistingRecordByIdempotencyKey",
      "workflow-command-log",
      "registrySaveAllowed: false",
      "workflowPublishAllowed: false",
      "executionCandidateAllowed: false",
      "localGeneratedCodeExecuted: false",
      "humanApprovalRequiredBeforeRegistry: true",
    ].join("\n"),
    runtimeTest: [
      "records a failing sandbox result",
      "rejects non-service principals",
      "rejects sandbox evidence that wrote to the host",
      "replays an existing idempotent sandbox result",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:workflow-plugin-sandbox-result": "node tools/workflow-plugin-sandbox-result-audit.mjs --out reports/workflow-plugin-sandbox-result.current.json",
      },
    }),
    qualityGate: "Workflow plugin sandbox result runtime audit",
    rootWorkflowCoverage: [
      "workflowPluginSandboxResult",
      "workflow-plugin-sandbox-result.current.json",
      "[\"workflowPluginSandboxResult\", \"READY\"]",
    ].join("\n"),
    verifyStructure: [
      "workflow-plugin-sandbox-result-runtime.mjs",
      "workflow-plugin-sandbox-result-runtime.test.mjs",
      "workflow-plugin-sandbox-result-audit.mjs",
      "workflow-plugin-sandbox-result-audit.test.mjs",
      "0229-workflow-plugin-sandbox-result-runtime.md",
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
