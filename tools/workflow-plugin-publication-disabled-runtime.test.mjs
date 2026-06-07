import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  WORKFLOW_PLUGIN_PUBLICATION_DISABLED_COMMAND_PORT,
  recordWorkflowPluginPublicationDisabledPrecheck,
} from "./workflow-plugin-publication-disabled-runtime.mjs";

describe("WorkflowPublicationCommandPort.recordWorkflowPluginPublicationDisabledPrecheck", () => {
  it("records a blocked publication precheck without publishing or exposing candidates", () => {
    const commandLogPath = tempCommandLogPath();
    const result = recordWorkflowPluginPublicationDisabledPrecheck(baseInput(), {
      commandLogPath,
      generatedAt: "2026-06-05T05:00:00.000Z",
    });

    assert.equal(result.commandPort, WORKFLOW_PLUGIN_PUBLICATION_DISABLED_COMMAND_PORT);
    assert.equal(result.status, "WORKFLOW_PLUGIN_PUBLICATION_BLOCKED_BY_POLICY");
    assert.equal(result.boundary.workflowPublishAllowed, false);
    assert.equal(result.boundary.pluginMarketplaceExposureAllowed, false);
    assert.equal(result.boundary.executionCandidateAllowed, false);
    assert.equal(result.boundary.executionCandidateCount, 0);
    assert.equal(result.boundary.localExecutionEnabled, false);
    assert.equal(result.boundary.processLaunchAllowed, false);
    assert.equal(result.boundary.hostWriteAllowed, false);
    assert.equal(result.boundary.registryExposure, "INTERNAL_DRY_RUN_CATALOG_ONLY");

    const records = readRecords(commandLogPath);
    assert.equal(records.length, 1);
    assert.equal(records[0].recordType, "WORKFLOW_PLUGIN_PUBLICATION_DISABLED_PRECHECK");
    assert.equal(records[0].boundary.requiresFutureSdd, true);
  });

  it("rejects publication policies that allow publication", () => {
    const commandLogPath = tempCommandLogPath();
    const input = baseInput({
      publicationPolicy: {
        ...publicationPolicy(),
        publicationAllowed: true,
      },
    });

    assert.throws(
      () => recordWorkflowPluginPublicationDisabledPrecheck(input, { commandLogPath }),
      /block publication/u,
    );
    assert.equal(existsSync(commandLogPath), false);
  });

  it("rejects execution isolation results that expose candidates", () => {
    const commandLogPath = tempCommandLogPath();
    const input = baseInput({
      executionIsolationResult: {
        ...executionIsolationResult(),
        executionCandidateView: {
          ...executionIsolationResult().executionCandidateView,
          candidateCount: 1,
        },
        boundary: {
          ...executionIsolationResult().boundary,
          executionCandidateAllowed: true,
          executionCandidateCount: 1,
        },
      },
    });

    assert.throws(
      () => recordWorkflowPluginPublicationDisabledPrecheck(input, { commandLogPath }),
      /candidates, publish, local execution/u,
    );
    assert.equal(existsSync(commandLogPath), false);
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
      () => recordWorkflowPluginPublicationDisabledPrecheck(input, { commandLogPath }),
      /DRY_RUN_ONLY/u,
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
      () => recordWorkflowPluginPublicationDisabledPrecheck(input, { commandLogPath }),
      /internal service or admin/u,
    );
    assert.equal(existsSync(commandLogPath), false);
  });

  it("replays an idempotent publication precheck without duplicating the log", () => {
    const commandLogPath = tempCommandLogPath();
    const first = recordWorkflowPluginPublicationDisabledPrecheck(baseInput(), {
      commandLogPath,
      generatedAt: "2026-06-05T05:00:00.000Z",
    });
    const second = recordWorkflowPluginPublicationDisabledPrecheck(baseInput(), {
      commandLogPath,
      generatedAt: "2026-06-05T05:01:00.000Z",
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
    executionIsolationResult: executionIsolationResult(),
    publicationPolicy: publicationPolicy(),
    registryAdmissionRecordRef: "workflow-registry-admission:workflow_registry_lesson_archive_review",
    executionIsolationRecordRef: "workflow-plugin-execution-isolation:workflow_plugin_execution_isolation_workflow_execution_isolation_idempotency_001",
    humanApprovalRecordRef: "workflow-human-approval:workflow_plugin_approval_001",
    sandboxResultRecordRef: "workflow-sandbox-result:sandbox_run_lesson_archive_review_001",
    sharedContextRef: "shared-context:workflow-publication-disabled-001",
    guardrailResultRef: "guardrail:workflow-publication-disabled-001",
    routeDecisionRef: "route:workflow-publication-disabled-001",
    inputHash: "sha256:workflow-publication-disabled-input",
    outputSummary: "Publication remains blocked until a future SDD enables executable isolation, signing, rollout, and rollback.",
    rollbackPlanRef: "rollback:workflow-publication-disabled-001",
    auditTraceRef: "audit:workflow-publication-disabled-001",
    idempotencyKey: "workflow-publication-disabled-idempotency-001",
    ...overrides,
  };
}

function servicePrincipal() {
  return {
    principalId: "workflow_publication_disabled_service",
    role: "SERVICE",
    subjectType: "SERVICE",
    entryPoint: "AGENT_INTERNAL",
    scopes: ["ADMIN_SYSTEM"],
    requiresHarnessApproval: false,
    sessionId: "publication_disabled_service_session_001",
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

function executionIsolationResult() {
  return {
    recordId: "workflow_plugin_execution_isolation_workflow_execution_isolation_idempotency_001",
    status: "EXECUTION_CANDIDATE_BLOCKED_BY_ISOLATION",
    registryEntry: {
      registryEntryId: "workflow_registry_lesson_archive_review",
      executionMode: "DRY_RUN_ONLY",
      localExecutionEnabled: false,
    },
    executionCandidateView: {
      candidateCount: 0,
      blockedReason: "real local execution is disabled by current SDD",
      blockedPreconditions: [
        "future SDD must explicitly enable execution candidates",
      ],
    },
    boundary: {
      executionCandidateAllowed: false,
      executionCandidateCount: 0,
      workflowPublishAllowed: false,
      localExecutionEnabled: false,
      processLaunchAllowed: false,
      hostWriteAllowed: false,
      networkPolicy: "DEFAULT_DENY",
      requiresFutureSdd: true,
    },
  };
}

function publicationPolicy() {
  return {
    schemaVersion: "2026-06-05.workflow-plugin.publication-policy.v1",
    policyId: "workflow_plugin_publication_policy_lesson_archive_review",
    registryEntryId: "workflow_registry_lesson_archive_review",
    executionIsolationRecordRef: "workflow-plugin-execution-isolation:workflow_plugin_execution_isolation_workflow_execution_isolation_idempotency_001",
    mode: "BLOCK_PUBLICATION",
    publicationAllowed: false,
    publicationChannel: "DISABLED",
    registryExposure: "INTERNAL_DRY_RUN_CATALOG_ONLY",
    requiresExecutionIsolation: true,
    requiresFutureSdd: true,
    auditLogRequired: true,
  };
}

function tempCommandLogPath() {
  return join(mkdtempSync(join(tmpdir(), "workflow-plugin-publication-disabled-")), "command-log.jsonl");
}

function readRecords(commandLogPath) {
  return readFileSync(commandLogPath, "utf8")
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
