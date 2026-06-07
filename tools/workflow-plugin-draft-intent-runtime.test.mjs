import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  WORKFLOW_PLUGIN_DRAFT_INTENT_COMMAND_PORT,
  submitWorkflowPluginDraftIntent,
} from "./workflow-plugin-draft-intent-runtime.mjs";

describe("WorkflowDraftCommandPort.submitWorkflowPluginDraftIntent", () => {
  it("appends a review-only command intent for a generated plugin draft", () => {
    const commandLogPath = tempCommandLogPath();
    const result = submitWorkflowPluginDraftIntent(baseInput(), {
      commandLogPath,
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(result.status, "REVIEW_REQUIRED");
    assert.equal(result.commandPort, WORKFLOW_PLUGIN_DRAFT_INTENT_COMMAND_PORT);
    assert.equal(result.boundary.executionCandidateAllowed, false);
    assert.equal(result.boundary.registrySaveAllowed, false);
    assert.equal(result.boundary.localGeneratedCodeExecuted, false);
    assert.equal(result.draft.draftId, "plugin_draft_retry_failed_archive_export");

    const records = readRecords(commandLogPath);
    assert.equal(records.length, 1);
    assert.equal(records[0].recordType, "WORKFLOW_PLUGIN_DRAFT_INTENT");
    assert.equal(records[0].status, "REVIEW_REQUIRED");
    assert.equal(records[0].boundary.workflowPublishAllowed, false);
  });

  it("rejects missing review evidence before writing the command log", () => {
    const commandLogPath = tempCommandLogPath();
    const input = baseInput();
    delete input.guardrailResultRef;

    assert.throws(
      () => submitWorkflowPluginDraftIntent(input, { commandLogPath }),
      /guardrailResultRef is required/u,
    );
    assert.equal(existsSync(commandLogPath), false);
  });

  it("rejects student principals before writing the command log", () => {
    const commandLogPath = tempCommandLogPath();
    const input = baseInput({
      principal: {
        ...basePrincipal(),
        role: "STUDENT",
        scopes: ["TEACHING_READ"],
      },
    });

    assert.throws(
      () => submitWorkflowPluginDraftIntent(input, { commandLogPath }),
      /student principals cannot submit/u,
    );
    assert.equal(existsSync(commandLogPath), false);
  });

  it("replays an existing idempotent command intent without duplicating the log", () => {
    const commandLogPath = tempCommandLogPath();
    const input = baseInput();
    const first = submitWorkflowPluginDraftIntent(input, {
      commandLogPath,
      generatedAt: "2026-06-05T00:00:00.000Z",
    });
    const second = submitWorkflowPluginDraftIntent(input, {
      commandLogPath,
      generatedAt: "2026-06-05T00:01:00.000Z",
    });

    assert.equal(first.recordId, second.recordId);
    assert.equal(second.idempotentReplay, true);
    assert.equal(readRecords(commandLogPath).length, 1);
  });

  it("rejects unsafe drafts that try to save to registry immediately", () => {
    const input = baseInput({
      draft: {
        ...baseDraft(),
        registrySaveAllowed: true,
      },
    });

    assert.throws(
      () => submitWorkflowPluginDraftIntent(input, { commandLogPath: tempCommandLogPath() }),
      /registry-save disabled/u,
    );
  });
});

function baseInput(overrides = {}) {
  return {
    intentId: "draft_workflow_plugin",
    principal: basePrincipal(),
    draft: baseDraft(),
    sharedContextRef: "shared-context:workflow-plugin-draft-001",
    guardrailResultRef: "guardrail:workflow-plugin-draft-001",
    routeDecisionRef: "route:workflow-agent-001",
    inputHash: "sha256:workflow-plugin-draft-input",
    outputSummary: "Generated plugin draft is queued for review only.",
    approvalArtifactRef: "approval-artifact:workflow-plugin-draft-001",
    rollbackPlanRef: "rollback:workflow-plugin-draft-001",
    auditTraceRef: "audit:workflow-plugin-draft-001",
    idempotencyKey: "workflow-plugin-draft-idempotency-001",
    ...overrides,
  };
}

function basePrincipal() {
  return {
    principalId: "teacher_001",
    role: "TEACHER",
    subjectType: "USER",
    entryPoint: "DESKTOP_TEACHER",
    scopes: ["TEACHING_READ", "AGENT_COMMAND_SUBMIT"],
    requiresHarnessApproval: false,
    sessionId: "session_001",
  };
}

function baseDraft() {
  return {
    schemaVersion: "2026-05-30.workflow-plugin.draft.v1",
    draftId: "plugin_draft_retry_failed_archive_export",
    artifactKind: "PLUGIN",
    capabilityKind: "SKILL",
    origin: "TASK_FAILURE_LEARNING",
    status: "DRAFT",
    userIntent: "Prevent repeated archive export failures by adding a validation plugin.",
    generatedBy: {
      agentKind: "DEVELOPMENT_AGENT",
      modelRef: "configured-plugin-generator",
    },
    failureContext: {
      taskFailureId: "task_failure_archive_export_timeout",
      preventionRule: "Validate export size and split large archive batches before running the task.",
    },
    generatedFiles: [
      {
        path: "plugins/archive-export-guard/plugin.ts",
        language: "typescript",
        role: "ENTRYPOINT",
        contentRef: "sha256:plugin-entrypoint-placeholder",
      },
      {
        path: "plugins/archive-export-guard/plugin.test.ts",
        language: "typescript",
        role: "TEST",
        contentRef: "sha256:plugin-test-placeholder",
      },
    ],
    executionMode: "DRY_RUN_ONLY",
    sandboxRequired: true,
    humanApprovalRequired: true,
    allowedHostAccess: "NONE",
    registrySaveAllowed: false,
  };
}

function tempCommandLogPath() {
  return join(mkdtempSync(join(tmpdir(), "workflow-plugin-draft-intent-")), "command-log.jsonl");
}

function readRecords(commandLogPath) {
  return readFileSync(commandLogPath, "utf8")
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
