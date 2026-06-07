import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  WORKFLOW_PLUGIN_SANDBOX_RESULT_COMMAND_PORT,
  recordWorkflowPluginSandboxRunResult,
} from "./workflow-plugin-sandbox-result-runtime.mjs";

describe("WorkflowSandboxCommandPort.recordWorkflowPluginSandboxRunResult", () => {
  it("records a passing sandbox result without enabling registry save", () => {
    const commandLogPath = tempCommandLogPath();
    const result = recordWorkflowPluginSandboxRunResult(baseInput(), {
      commandLogPath,
      generatedAt: "2026-06-05T01:00:00.000Z",
    });

    assert.equal(result.commandPort, WORKFLOW_PLUGIN_SANDBOX_RESULT_COMMAND_PORT);
    assert.equal(result.status, "SANDBOX_PASSED_REVIEW_REQUIRED");
    assert.equal(result.revisionRequired, false);
    assert.equal(result.boundary.registrySaveAllowed, false);
    assert.equal(result.boundary.localGeneratedCodeExecuted, false);
    assert.equal(result.boundary.humanApprovalRequiredBeforeRegistry, true);

    const records = readRecords(commandLogPath);
    assert.equal(records.length, 1);
    assert.equal(records[0].recordType, "WORKFLOW_PLUGIN_SANDBOX_RUN_RESULT");
    assert.equal(records[0].boundary.workflowPublishAllowed, false);
  });

  it("records a failing sandbox result and produces revision feedback", () => {
    const input = baseInput({ sandboxRun: failedSandboxRun() });

    const result = recordWorkflowPluginSandboxRunResult(input, {
      commandLogPath: tempCommandLogPath(),
      generatedAt: "2026-06-05T01:00:00.000Z",
    });

    assert.equal(result.status, "SANDBOX_FAILED_REVISION_REQUIRED");
    assert.equal(result.revisionRequired, true);
    assert.equal(result.revisionRequest.revisionDecision, "REVISION_REQUIRED");
    assert.equal(result.revisionRequest.saveBlocked, true);
    assert.match(result.revisionRequest.issues.join("\n"), /sandbox test failed/u);
  });

  it("rejects non-service principals before writing the command log", () => {
    const commandLogPath = tempCommandLogPath();
    const input = baseInput({
      principal: {
        ...servicePrincipal(),
        role: "TEACHER",
        subjectType: "USER",
        entryPoint: "DESKTOP_TEACHER",
      },
    });

    assert.throws(
      () => recordWorkflowPluginSandboxRunResult(input, { commandLogPath }),
      /internal service or admin/u,
    );
    assert.equal(existsSync(commandLogPath), false);
  });

  it("rejects sandbox evidence that wrote to the host", () => {
    const commandLogPath = tempCommandLogPath();
    const input = baseInput({
      sandboxRun: {
        ...passingSandboxRun(),
        noHostWrite: false,
      },
    });

    assert.throws(
      () => recordWorkflowPluginSandboxRunResult(input, { commandLogPath }),
      /no host writes/u,
    );
    assert.equal(existsSync(commandLogPath), false);
  });

  it("replays an existing idempotent sandbox result without duplicating the log", () => {
    const commandLogPath = tempCommandLogPath();
    const first = recordWorkflowPluginSandboxRunResult(baseInput(), {
      commandLogPath,
      generatedAt: "2026-06-05T01:00:00.000Z",
    });
    const second = recordWorkflowPluginSandboxRunResult(baseInput(), {
      commandLogPath,
      generatedAt: "2026-06-05T01:01:00.000Z",
    });

    assert.equal(first.recordId, second.recordId);
    assert.equal(second.idempotentReplay, true);
    assert.equal(readRecords(commandLogPath).length, 1);
  });
});

function baseInput(overrides = {}) {
  return {
    principal: servicePrincipal(),
    draft: workflowDraft(),
    sandboxRun: passingSandboxRun(),
    draftIntentRecordRef: "workflow-draft-intent:workflow_draft_lesson_archive_review",
    sandboxManifestRef: "sandbox-manifest:default-deny-rust-runner",
    sharedContextRef: "shared-context:workflow-sandbox-result-001",
    guardrailResultRef: "guardrail:workflow-sandbox-result-001",
    routeDecisionRef: "route:workflow-sandbox-result-001",
    inputHash: "sha256:workflow-sandbox-result-input",
    outputSummary: "Sandbox result is recorded for review without registry save.",
    rollbackPlanRef: "rollback:workflow-sandbox-result-001",
    auditTraceRef: "audit:workflow-sandbox-result-001",
    idempotencyKey: "workflow-sandbox-result-idempotency-001",
    ...overrides,
  };
}

function servicePrincipal() {
  return {
    principalId: "workflow_sandbox_runner",
    role: "SERVICE",
    subjectType: "SERVICE",
    entryPoint: "AGENT_INTERNAL",
    scopes: ["AGENT_COMMAND_SUBMIT"],
    requiresHarnessApproval: false,
    sessionId: "service_session_001",
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

function failedSandboxRun() {
  return {
    ...passingSandboxRun(),
    runId: "sandbox_run_lesson_archive_review_fail_001",
    status: "FAIL",
    tests: [
      {
        name: "workflow dry-run contract test",
        status: "FAIL",
        durationMs: 90,
        logRef: "reports/workflow-plugin/sandbox-run-fail-001.log",
      },
    ],
    feedback: ["Generated workflow missed the archive ownership guard."],
  };
}

function tempCommandLogPath() {
  return join(mkdtempSync(join(tmpdir(), "workflow-plugin-sandbox-result-")), "command-log.jsonl");
}

function readRecords(commandLogPath) {
  return readFileSync(commandLogPath, "utf8")
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
