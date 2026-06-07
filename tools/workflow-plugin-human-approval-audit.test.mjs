import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditWorkflowPluginHumanApprovalRuntime,
  formatWorkflowPluginHumanApprovalAudit,
} from "./workflow-plugin-human-approval-audit.mjs";

describe("Workflow plugin human approval runtime audit", () => {
  it("passes when human approval is append-only review evidence", () => {
    const report = auditWorkflowPluginHumanApprovalRuntime(currentInputs(), {
      generatedAt: "2026-06-05T02:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "WORKFLOW_PLUGIN_HUMAN_APPROVAL_RUNTIME");
    assert.equal(report.boundary.registrySaveAllowed, false);
    assert.equal(report.runtimeProbes.approved.status, "PASS");
    assert.equal(report.runtimeProbes.approved.result.registryAdmissionReady, true);
    assert.equal(report.runtimeProbes.revision.result.revisionRequired, true);
    assert.match(formatWorkflowPluginHumanApprovalAudit(report), /Workflow plugin human approval runtime: READY/u);
  });

  it("fails when approval contract does not require performance review", () => {
    const inputs = currentInputs();
    const schema = JSON.parse(inputs.approvalSchema);
    schema.properties.performanceReviewed.const = false;
    inputs.approvalSchema = JSON.stringify(schema);

    const report = auditWorkflowPluginHumanApprovalRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "approval_contract.requires_performance_and_effect_review").passed, false);
  });

  it("fails when runtime can save registry entries directly", () => {
    const inputs = currentInputs();
    inputs.runtime += "\nconst unsafe = { registrySaveAllowed: true, workflowPublishAllowed: true };\n";

    const report = auditWorkflowPluginHumanApprovalRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.append_only_no_registry_publish").passed, false);
  });

  it("fails when runtime no longer requires Harness approval", () => {
    const inputs = currentInputs();
    inputs.runtime = inputs.runtime.replace("HARNESS_APPROVE", "MISSING_HARNESS_SCOPE");

    const report = auditWorkflowPluginHumanApprovalRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.requires_human_harness_reviewer_and_evidence").passed, false);
  });

  it("fails when root workflow coverage does not require human approval evidence", () => {
    const inputs = currentInputs();
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("workflowPluginHumanApproval", "missingHumanApproval");

    const report = auditWorkflowPluginHumanApprovalRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_human_approval_report").passed, false);
  });
});

function currentInputs() {
  return {
    approvalSchema: JSON.stringify({
      required: ["decision", "registrySaveDecision", "reviewedAt"],
      properties: {
        performanceReviewed: { const: true },
        effectReviewed: { const: true },
        decision: { enum: ["APPROVED", "REJECTED", "REVISION_REQUESTED"] },
        registrySaveDecision: { enum: ["ALLOW_SAVE", "BLOCK_SAVE"] },
      },
    }),
    approvalExample: JSON.stringify(approval()),
    workflowDraftExample: JSON.stringify(workflowDraft()),
    sandboxRunExample: JSON.stringify(sandboxRun()),
    runtime: [
      "authorizeHumanReviewer",
      "HARNESS_APPROVE",
      "ADMIN_SYSTEM",
      "role === \"STUDENT\"",
      "role === \"SERVICE\"",
      "requiredEvidenceFields",
      "draftIntentRecordRef",
      "sandboxResultRecordRef",
      "sharedContextRef",
      "guardrailResultRef",
      "routeDecisionRef",
      "performanceEvidenceRef",
      "effectEvidenceRef",
      "rollbackPlanRef",
      "auditTraceRef",
      "idempotencyKey",
      "human approval requires a passing sandbox result",
      "executedInSandbox !== true",
      "noHostWrite !== true",
      "networkPolicy !== \"DEFAULT_DENY\"",
      "human approval cannot proceed with failing sandbox tests",
      "performanceReviewed and effectReviewed must both be true",
      "approved reviews must set registrySaveDecision=ALLOW_SAVE",
      "non-approved reviews must block registry save",
      "appendCommandIntent",
      "fs.appendFileSync",
      "findExistingRecordByIdempotencyKey",
      "workflow-command-log",
      "registrySaveAllowed: false",
      "workflowPublishAllowed: false",
      "executionCandidateAllowed: false",
      "localGeneratedCodeExecuted: false",
      "generatedCodeExecutedOnHost: false",
    ].join("\n"),
    runtimeTest: [
      "records a revision-requested human review",
      "rejects reviewers without Harness approval permission",
      "rejects service principals",
      "rejects approval when the sandbox result failed",
      "rejects approval without both performance and effect review",
      "replays an existing idempotent human approval",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:workflow-plugin-human-approval": "node tools/workflow-plugin-human-approval-audit.mjs --out reports/workflow-plugin-human-approval.current.json",
      },
    }),
    qualityGate: "Workflow plugin human approval runtime audit",
    rootWorkflowCoverage: [
      "workflowPluginHumanApproval",
      "workflow-plugin-human-approval.current.json",
      "[\"workflowPluginHumanApproval\", \"READY\"]",
    ].join("\n"),
    verifyStructure: [
      "workflow-plugin-human-approval-runtime.mjs",
      "workflow-plugin-human-approval-runtime.test.mjs",
      "workflow-plugin-human-approval-audit.mjs",
      "workflow-plugin-human-approval-audit.test.mjs",
      "0230-workflow-plugin-human-approval-runtime.md",
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
    comments: "Sandbox evidence is acceptable for registry admission.",
  };
}
