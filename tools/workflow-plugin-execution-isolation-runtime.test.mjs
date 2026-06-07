import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  WORKFLOW_PLUGIN_EXECUTION_ISOLATION_COMMAND_PORT,
  recordWorkflowPluginExecutionIsolationPrecheck,
} from "./workflow-plugin-execution-isolation-runtime.mjs";

describe("WorkflowExecutionIsolationCommandPort.recordWorkflowPluginExecutionIsolationPrecheck", () => {
  it("records a blocked execution-candidate precheck without exposing candidates", () => {
    const commandLogPath = tempCommandLogPath();
    const result = recordWorkflowPluginExecutionIsolationPrecheck(baseInput(), {
      commandLogPath,
      generatedAt: "2026-06-05T04:00:00.000Z",
    });

    assert.equal(result.commandPort, WORKFLOW_PLUGIN_EXECUTION_ISOLATION_COMMAND_PORT);
    assert.equal(result.status, "EXECUTION_CANDIDATE_BLOCKED_BY_ISOLATION");
    assert.equal(result.boundary.executionCandidateAllowed, false);
    assert.equal(result.boundary.executionCandidateCount, 0);
    assert.equal(result.boundary.localExecutionEnabled, false);
    assert.equal(result.boundary.generatedCodeExecutedOnHost, false);
    assert.equal(result.boundary.processLaunchAllowed, false);
    assert.equal(result.boundary.networkPolicy, "DEFAULT_DENY");
    assert.equal(result.executionCandidateView.candidateCount, 0);

    const records = readRecords(commandLogPath);
    assert.equal(records.length, 1);
    assert.equal(records[0].recordType, "WORKFLOW_PLUGIN_EXECUTION_ISOLATION_PRECHECK");
    assert.equal(records[0].boundary.requiresFutureSdd, true);
  });

  it("rejects registry entries that enable local execution", () => {
    const commandLogPath = tempCommandLogPath();
    const input = baseInput({
      registryEntry: {
        ...registryEntry(),
        executionMode: "HOST_EXECUTION",
        localExecutionEnabled: true,
      },
    });

    assert.throws(
      () => recordWorkflowPluginExecutionIsolationPrecheck(input, { commandLogPath }),
      /DRY_RUN_ONLY/u,
    );
    assert.equal(existsSync(commandLogPath), false);
  });

  it("rejects isolation policies that allow process launch", () => {
    const commandLogPath = tempCommandLogPath();
    const input = baseInput({
      isolationPolicy: {
        ...isolationPolicy(),
        processLaunchAllowed: true,
      },
    });

    assert.throws(
      () => recordWorkflowPluginExecutionIsolationPrecheck(input, { commandLogPath }),
      /process launch/u,
    );
    assert.equal(existsSync(commandLogPath), false);
  });

  it("rejects execution candidate views that expose candidates", () => {
    const commandLogPath = tempCommandLogPath();
    const input = baseInput({
      executionCandidateView: {
        ...executionCandidateView(),
        candidateCount: 1,
        candidates: [
          {
            candidateId: "candidate_unsafe",
            action: "PROCESS_START",
            target: "generated/workflow.js",
          },
        ],
      },
    });

    assert.throws(
      () => recordWorkflowPluginExecutionIsolationPrecheck(input, { commandLogPath }),
      /candidates must remain empty/u,
    );
    assert.equal(existsSync(commandLogPath), false);
  });

  it("rejects ordinary teacher principals before writing the log", () => {
    const commandLogPath = tempCommandLogPath();
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
      () => recordWorkflowPluginExecutionIsolationPrecheck(input, { commandLogPath }),
      /internal service or admin/u,
    );
    assert.equal(existsSync(commandLogPath), false);
  });

  it("replays an idempotent precheck without duplicating the log", () => {
    const commandLogPath = tempCommandLogPath();
    const first = recordWorkflowPluginExecutionIsolationPrecheck(baseInput(), {
      commandLogPath,
      generatedAt: "2026-06-05T04:00:00.000Z",
    });
    const second = recordWorkflowPluginExecutionIsolationPrecheck(baseInput(), {
      commandLogPath,
      generatedAt: "2026-06-05T04:01:00.000Z",
    });

    assert.equal(first.recordId, second.recordId);
    assert.equal(second.idempotentReplay, true);
    assert.equal(readRecords(commandLogPath).length, 1);
  });
});

function baseInput(overrides = {}) {
  return {
    principal: servicePrincipal(),
    registryEntry: registryEntry(),
    isolationPolicy: isolationPolicy(),
    executionCandidateView: executionCandidateView(),
    registryAdmissionRecordRef: "workflow-registry-admission:workflow_registry_lesson_archive_review",
    humanApprovalRecordRef: "workflow-human-approval:workflow_plugin_approval_001",
    sandboxResultRecordRef: "workflow-sandbox-result:sandbox_run_lesson_archive_review_001",
    sharedContextRef: "shared-context:workflow-execution-isolation-001",
    guardrailResultRef: "guardrail:workflow-execution-isolation-001",
    routeDecisionRef: "route:workflow-execution-isolation-001",
    inputHash: "sha256:workflow-execution-isolation-input",
    outputSummary: "Execution candidate precheck is blocked until a future SDD enables executable isolation.",
    rollbackPlanRef: "rollback:workflow-execution-isolation-001",
    auditTraceRef: "audit:workflow-execution-isolation-001",
    idempotencyKey: "workflow-execution-isolation-idempotency-001",
    ...overrides,
  };
}

function servicePrincipal() {
  return {
    principalId: "workflow_execution_isolation_service",
    role: "SERVICE",
    subjectType: "SERVICE",
    entryPoint: "AGENT_INTERNAL",
    scopes: ["ADMIN_SYSTEM"],
    requiresHarnessApproval: false,
    sessionId: "execution_isolation_service_session_001",
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

function tempCommandLogPath() {
  return join(mkdtempSync(join(tmpdir(), "workflow-plugin-execution-isolation-")), "command-log.jsonl");
}

function readRecords(commandLogPath) {
  return readFileSync(commandLogPath, "utf8")
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
