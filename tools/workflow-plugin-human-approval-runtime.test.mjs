import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  WORKFLOW_PLUGIN_HUMAN_APPROVAL_COMMAND_PORT,
  recordWorkflowPluginHumanApproval,
} from "./workflow-plugin-human-approval-runtime.mjs";

describe("WorkflowApprovalCommandPort.recordWorkflowPluginHumanApproval", () => {
  it("records an approved human performance/effect review without saving registry entries", () => {
    const commandLogPath = tempCommandLogPath();
    const result = recordWorkflowPluginHumanApproval(baseInput(), {
      commandLogPath,
      generatedAt: "2026-06-05T02:00:00.000Z",
    });

    assert.equal(result.commandPort, WORKFLOW_PLUGIN_HUMAN_APPROVAL_COMMAND_PORT);
    assert.equal(result.status, "HUMAN_APPROVED_REGISTRY_ADMISSION_READY");
    assert.equal(result.registryAdmissionReady, true);
    assert.equal(result.revisionRequired, false);
    assert.equal(result.boundary.registryAdmissionCandidate, true);
    assert.equal(result.boundary.registrySaveAllowed, false);
    assert.equal(result.boundary.localGeneratedCodeExecuted, false);
    assert.equal(result.boundary.workflowPublishAllowed, false);

    const records = readRecords(commandLogPath);
    assert.equal(records.length, 1);
    assert.equal(records[0].recordType, "WORKFLOW_PLUGIN_HUMAN_APPROVAL");
    assert.equal(records[0].approval.performanceReviewed, true);
    assert.equal(records[0].approval.effectReviewed, true);
  });

  it("records a revision-requested human review and blocks registry admission", () => {
    const input = baseInput({
      approval: revisionRequestedApproval(),
      idempotencyKey: "workflow-human-approval-revision-001",
    });

    const result = recordWorkflowPluginHumanApproval(input, {
      commandLogPath: tempCommandLogPath(),
      generatedAt: "2026-06-05T02:00:00.000Z",
    });

    assert.equal(result.status, "HUMAN_REVIEW_REVISION_REQUIRED");
    assert.equal(result.registryAdmissionReady, false);
    assert.equal(result.revisionRequired, true);
    assert.equal(result.approval.registrySaveDecision, "BLOCK_SAVE");
    assert.equal(result.boundary.registryAdmissionCandidate, false);
  });

  it("rejects reviewers without Harness approval permission before writing the command log", () => {
    const commandLogPath = tempCommandLogPath();
    const input = baseInput({
      principal: {
        ...teacherReviewer(),
        scopes: ["AGENT_COMMAND_SUBMIT"],
      },
    });

    assert.throws(
      () => recordWorkflowPluginHumanApproval(input, { commandLogPath }),
      /HARNESS_APPROVE or ADMIN_SYSTEM/u,
    );
    assert.equal(existsSync(commandLogPath), false);
  });

  it("rejects service principals because approval must be human-reviewed", () => {
    const commandLogPath = tempCommandLogPath();
    const input = baseInput({
      principal: {
        ...teacherReviewer(),
        role: "SERVICE",
        subjectType: "SERVICE",
        entryPoint: "AGENT_INTERNAL",
      },
      approval: {
        ...approvedApproval(),
        reviewerPrincipalId: "principal_teacher_admin",
      },
    });

    assert.throws(
      () => recordWorkflowPluginHumanApproval(input, { commandLogPath }),
      /human reviewer/u,
    );
    assert.equal(existsSync(commandLogPath), false);
  });

  it("rejects approval when the sandbox result failed", () => {
    const commandLogPath = tempCommandLogPath();
    const input = baseInput({
      sandboxRun: {
        ...passingSandboxRun(),
        status: "FAIL",
        tests: [
          {
            name: "workflow dry-run contract test",
            status: "FAIL",
            durationMs: 90,
            logRef: "reports/workflow-plugin/sandbox-run-fail-001.log",
          },
        ],
      },
    });

    assert.throws(
      () => recordWorkflowPluginHumanApproval(input, { commandLogPath }),
      /passing sandbox result/u,
    );
    assert.equal(existsSync(commandLogPath), false);
  });

  it("rejects approval without both performance and effect review", () => {
    const commandLogPath = tempCommandLogPath();
    const input = baseInput({
      approval: {
        ...approvedApproval(),
        performanceReviewed: false,
      },
    });

    assert.throws(
      () => recordWorkflowPluginHumanApproval(input, { commandLogPath }),
      /performanceReviewed and effectReviewed/u,
    );
    assert.equal(existsSync(commandLogPath), false);
  });

  it("replays an existing idempotent human approval without duplicating the log", () => {
    const commandLogPath = tempCommandLogPath();
    const first = recordWorkflowPluginHumanApproval(baseInput(), {
      commandLogPath,
      generatedAt: "2026-06-05T02:00:00.000Z",
    });
    const second = recordWorkflowPluginHumanApproval(baseInput(), {
      commandLogPath,
      generatedAt: "2026-06-05T02:01:00.000Z",
    });

    assert.equal(first.recordId, second.recordId);
    assert.equal(second.idempotentReplay, true);
    assert.equal(readRecords(commandLogPath).length, 1);
  });
});

function baseInput(overrides = {}) {
  return {
    principal: teacherReviewer(),
    draft: workflowDraft(),
    sandboxRun: passingSandboxRun(),
    approval: approvedApproval(),
    draftIntentRecordRef: "workflow-draft-intent:workflow_draft_lesson_archive_review",
    sandboxResultRecordRef: "workflow-sandbox-result:sandbox_run_lesson_archive_review_001",
    sharedContextRef: "shared-context:workflow-human-approval-001",
    guardrailResultRef: "guardrail:workflow-human-approval-001",
    routeDecisionRef: "route:workflow-human-approval-001",
    inputHash: "sha256:workflow-human-approval-input",
    outputSummary: "Human review recorded performance and effect approval without registry save.",
    performanceEvidenceRef: "perf-evidence:workflow-plugin-runtime-slo-001",
    effectEvidenceRef: "effect-evidence:lesson-archive-review-human-sample-001",
    rollbackPlanRef: "rollback:workflow-human-approval-001",
    auditTraceRef: "audit:workflow-human-approval-001",
    idempotencyKey: "workflow-human-approval-idempotency-001",
    ...overrides,
  };
}

function teacherReviewer() {
  return {
    principalId: "principal_teacher_admin",
    role: "TEACHER",
    subjectType: "USER",
    entryPoint: "DESKTOP_TEACHER",
    scopes: ["HARNESS_APPROVE"],
    requiresHarnessApproval: false,
    sessionId: "teacher_session_001",
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

function passingSandboxRun() {
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

function approvedApproval() {
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

function revisionRequestedApproval() {
  return {
    ...approvedApproval(),
    approvalId: "workflow_plugin_approval_revision_001",
    decision: "REVISION_REQUESTED",
    registrySaveDecision: "BLOCK_SAVE",
    comments: "The generated workflow needs clearer teacher rollback steps.",
  };
}

function tempCommandLogPath() {
  return join(mkdtempSync(join(tmpdir(), "workflow-plugin-human-approval-")), "command-log.jsonl");
}

function readRecords(commandLogPath) {
  return readFileSync(commandLogPath, "utf8")
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
