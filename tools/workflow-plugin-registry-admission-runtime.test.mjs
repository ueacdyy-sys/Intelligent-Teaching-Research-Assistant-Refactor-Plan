import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  WORKFLOW_PLUGIN_REGISTRY_ADMISSION_COMMAND_PORT,
  recordWorkflowPluginRegistryAdmission,
} from "./workflow-plugin-registry-admission-runtime.mjs";

describe("WorkflowRegistryCommandPort.recordWorkflowPluginRegistryAdmission", () => {
  it("persists an approved workflow/plugin registry entry as dry-run only", () => {
    const commandLogPath = tempJsonlPath("workflow-registry-command");
    const registryStorePath = tempJsonlPath("workflow-registry-store");
    const result = recordWorkflowPluginRegistryAdmission(baseInput(), {
      commandLogPath,
      registryStorePath,
      generatedAt: "2026-06-05T03:00:00.000Z",
    });

    assert.equal(result.commandPort, WORKFLOW_PLUGIN_REGISTRY_ADMISSION_COMMAND_PORT);
    assert.equal(result.status, "REGISTRY_ADMISSION_SAVED_DRY_RUN_ONLY");
    assert.equal(result.admissionDecision, "ALLOW_SAVE");
    assert.equal(result.boundary.registryEntryPersisted, true);
    assert.equal(result.boundary.executionMode, "DRY_RUN_ONLY");
    assert.equal(result.boundary.localExecutionEnabled, false);
    assert.equal(result.boundary.executionCandidateAllowed, false);
    assert.equal(result.registryEntry.executionMode, "DRY_RUN_ONLY");
    assert.equal(result.registryEntry.localExecutionEnabled, false);

    const commandRecords = readRecords(commandLogPath);
    const registryEntries = readRecords(registryStorePath);
    assert.equal(commandRecords.length, 1);
    assert.equal(registryEntries.length, 1);
    assert.equal(registryEntries[0].registryEntryId, "workflow_registry_lesson_archive_review_runtime");
  });

  it("rejects non-admin teachers before writing command log or registry store", () => {
    const commandLogPath = tempJsonlPath("workflow-registry-command");
    const registryStorePath = tempJsonlPath("workflow-registry-store");
    const input = baseInput({
      principal: {
        ...servicePrincipal(),
        role: "TEACHER",
        subjectType: "USER",
        entryPoint: "DESKTOP_TEACHER",
        scopes: ["HARNESS_APPROVE"],
      },
    });

    assert.throws(
      () => recordWorkflowPluginRegistryAdmission(input, { commandLogPath, registryStorePath }),
      /internal service or admin/u,
    );
    assert.equal(existsSync(commandLogPath), false);
    assert.equal(existsSync(registryStorePath), false);
  });

  it("rejects human approval that requested revision", () => {
    const commandLogPath = tempJsonlPath("workflow-registry-command");
    const registryStorePath = tempJsonlPath("workflow-registry-store");
    const input = baseInput({
      approval: {
        ...approvedApproval(),
        decision: "REVISION_REQUESTED",
        registrySaveDecision: "BLOCK_SAVE",
        comments: "Human review requested another iteration.",
      },
    });

    assert.throws(
      () => recordWorkflowPluginRegistryAdmission(input, { commandLogPath, registryStorePath }),
      /APPROVED with ALLOW_SAVE/u,
    );
    assert.equal(existsSync(commandLogPath), false);
    assert.equal(existsSync(registryStorePath), false);
  });

  it("rejects failed sandbox evidence before registry persistence", () => {
    const commandLogPath = tempJsonlPath("workflow-registry-command");
    const registryStorePath = tempJsonlPath("workflow-registry-store");
    const input = baseInput({
      sandboxRun: {
        ...passingSandboxRun(),
        status: "FAIL",
      },
    });

    assert.throws(
      () => recordWorkflowPluginRegistryAdmission(input, { commandLogPath, registryStorePath }),
      /passing sandbox result/u,
    );
    assert.equal(existsSync(commandLogPath), false);
    assert.equal(existsSync(registryStorePath), false);
  });

  it("replays an idempotent registry admission without duplicating registry entries", () => {
    const commandLogPath = tempJsonlPath("workflow-registry-command");
    const registryStorePath = tempJsonlPath("workflow-registry-store");
    const first = recordWorkflowPluginRegistryAdmission(baseInput(), {
      commandLogPath,
      registryStorePath,
      generatedAt: "2026-06-05T03:00:00.000Z",
    });
    const second = recordWorkflowPluginRegistryAdmission(baseInput(), {
      commandLogPath,
      registryStorePath,
      generatedAt: "2026-06-05T03:01:00.000Z",
    });

    assert.equal(first.recordId, second.recordId);
    assert.equal(second.idempotentReplay, true);
    assert.equal(readRecords(commandLogPath).length, 1);
    assert.equal(readRecords(registryStorePath).length, 1);
  });
});

function baseInput(overrides = {}) {
  return {
    principal: servicePrincipal(),
    draft: workflowDraft(),
    sandboxRun: passingSandboxRun(),
    approval: approvedApproval(),
    registry: {
      registryEntryId: "workflow_registry_lesson_archive_review_runtime",
      name: "Lesson Archive Review",
      version: "0.1.0",
      rollbackPlan: "Disable the dry-run registry entry and keep all review evidence for audit.",
    },
    draftIntentRecordRef: "workflow-draft-intent:workflow_draft_lesson_archive_review",
    sandboxResultRecordRef: "workflow-sandbox-result:sandbox_run_lesson_archive_review_001",
    humanApprovalRecordRef: "workflow-human-approval:workflow_plugin_approval_001",
    sharedContextRef: "shared-context:workflow-registry-admission-001",
    guardrailResultRef: "guardrail:workflow-registry-admission-001",
    routeDecisionRef: "route:workflow-registry-admission-001",
    inputHash: "sha256:workflow-registry-admission-input",
    outputSummary: "Dry-run registry admission recorded without enabling local execution.",
    rollbackPlanRef: "rollback:workflow-registry-admission-001",
    auditTraceRef: "audit:workflow-registry-admission-001",
    idempotencyKey: "workflow-registry-admission-idempotency-001",
    ...overrides,
  };
}

function servicePrincipal() {
  return {
    principalId: "workflow_registry_admission_service",
    role: "SERVICE",
    subjectType: "SERVICE",
    entryPoint: "AGENT_INTERNAL",
    scopes: ["ADMIN_SYSTEM"],
    requiresHarnessApproval: false,
    sessionId: "registry_service_session_001",
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
    comments: "Sandbox evidence is acceptable for dry-run registry admission.",
  };
}

function tempJsonlPath(prefix) {
  return join(mkdtempSync(join(tmpdir(), `${prefix}-`)), "records.jsonl");
}

function readRecords(filePath) {
  return readFileSync(filePath, "utf8")
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
