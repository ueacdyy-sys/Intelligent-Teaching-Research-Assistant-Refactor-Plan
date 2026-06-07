import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  WORKFLOW_PLUGIN_MANAGEMENT_DISABLED_VIEW_COMMAND_PORT,
  recordWorkflowPluginManagementDisabledView,
} from "./workflow-plugin-management-disabled-view-runtime.mjs";

describe("WorkflowManagementViewCommandPort.recordWorkflowPluginManagementDisabledView", () => {
  it("records a management disabled view with every risky action disabled", () => {
    const commandLogPath = tempCommandLogPath();
    const result = recordWorkflowPluginManagementDisabledView(baseInput(), {
      commandLogPath,
      generatedAt: "2026-06-05T06:00:00.000Z",
    });

    assert.equal(result.commandPort, WORKFLOW_PLUGIN_MANAGEMENT_DISABLED_VIEW_COMMAND_PORT);
    assert.equal(result.status, "WORKFLOW_PLUGIN_MANAGEMENT_VIEW_DISABLED");
    assert.equal(result.view.surface, "ADMIN_WORKFLOW_PLUGIN_MANAGEMENT");
    assert.equal(result.view.disabledActionCount, 4);
    assert.equal(result.view.actions.every((action) => action.enabled === false), true);
    assert.deepEqual(result.view.actions.map((action) => action.actionId), [
      "publish",
      "enableLocalExecution",
      "createExecutionCandidate",
      "exposeMarketplace",
    ]);
    assert.equal(result.boundary.allActionsDisabled, true);
    assert.equal(result.boundary.workflowPublishAllowed, false);
    assert.equal(result.boundary.executionCandidateAllowed, false);

    const records = readRecords(commandLogPath);
    assert.equal(records.length, 1);
    assert.equal(records[0].recordType, "WORKFLOW_PLUGIN_MANAGEMENT_DISABLED_VIEW");
    assert.equal(records[0].view.badges.includes("PUBLICATION_DISABLED"), true);
  });

  it("rejects publication evidence that allows marketplace exposure", () => {
    const commandLogPath = tempCommandLogPath();
    const input = baseInput({
      publicationDisabledResult: {
        ...publicationDisabledResult(),
        boundary: {
          ...publicationDisabledResult().boundary,
          pluginMarketplaceExposureAllowed: true,
        },
      },
    });

    assert.throws(
      () => recordWorkflowPluginManagementDisabledView(input, { commandLogPath }),
      /marketplace/u,
    );
    assert.equal(existsSync(commandLogPath), false);
  });

  it("rejects execution isolation evidence that exposes candidates", () => {
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
      () => recordWorkflowPluginManagementDisabledView(input, { commandLogPath }),
      /candidates, publish, local execution/u,
    );
    assert.equal(existsSync(commandLogPath), false);
  });

  it("rejects executable registry entries", () => {
    const commandLogPath = tempCommandLogPath();
    const input = baseInput({
      registryEntry: {
        ...registryEntry(),
        executionMode: "HOST_EXECUTION",
        localExecutionEnabled: true,
      },
    });

    assert.throws(
      () => recordWorkflowPluginManagementDisabledView(input, { commandLogPath }),
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
      () => recordWorkflowPluginManagementDisabledView(input, { commandLogPath }),
      /internal service or admin/u,
    );
    assert.equal(existsSync(commandLogPath), false);
  });

  it("replays an idempotent disabled view without duplicating the log", () => {
    const commandLogPath = tempCommandLogPath();
    const first = recordWorkflowPluginManagementDisabledView(baseInput(), {
      commandLogPath,
      generatedAt: "2026-06-05T06:00:00.000Z",
    });
    const second = recordWorkflowPluginManagementDisabledView(baseInput(), {
      commandLogPath,
      generatedAt: "2026-06-05T06:01:00.000Z",
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
    publicationDisabledResult: publicationDisabledResult(),
    registryAdmissionRecordRef: "workflow-registry-admission:audit-registry-admission",
    executionIsolationRecordRef: "workflow-plugin-execution-isolation:workflow_plugin_execution_isolation_audit-workflow-execution-isolation",
    publicationDisabledRecordRef: "workflow-plugin-publication-disabled:workflow_plugin_publication_disabled_audit_workflow_publication_disabled",
    humanApprovalRecordRef: "workflow-human-approval:audit-human-approval",
    sandboxResultRecordRef: "workflow-sandbox-result:audit-sandbox-result",
    auditTraceRef: "audit:audit-workflow-management-disabled-view",
    idempotencyKey: "workflow-management-disabled-view-idempotency-001",
    ...overrides,
  };
}

function servicePrincipal() {
  return {
    principalId: "workflow_management_disabled_view_service",
    role: "SERVICE",
    subjectType: "SERVICE",
    entryPoint: "AGENT_INTERNAL",
    scopes: ["ADMIN_SYSTEM"],
    requiresHarnessApproval: false,
    sessionId: "management_disabled_view_service_session_001",
  };
}

function registryEntry() {
  return {
    schemaVersion: "2026-05-30.workflow-plugin.registry-entry.v1",
    registryEntryId: "workflow_registry_lesson_archive_review",
    draftId: "workflow_draft_lesson_archive_review",
    artifactKind: "WORKFLOW",
    capabilityKind: "WORKFLOW",
    status: "ACTIVE",
    executionMode: "DRY_RUN_ONLY",
    localExecutionEnabled: false,
  };
}

function executionIsolationResult() {
  return {
    recordId: "workflow_plugin_execution_isolation_audit-workflow-execution-isolation",
    status: "EXECUTION_CANDIDATE_BLOCKED_BY_ISOLATION",
    registryEntry: {
      registryEntryId: "workflow_registry_lesson_archive_review",
    },
    executionCandidateView: {
      candidateCount: 0,
      blockedReason: "real local execution is disabled by current SDD",
    },
    boundary: {
      executionCandidateAllowed: false,
      executionCandidateCount: 0,
      workflowPublishAllowed: false,
      localExecutionEnabled: false,
      processLaunchAllowed: false,
      hostWriteAllowed: false,
      requiresFutureSdd: true,
    },
  };
}

function publicationDisabledResult() {
  return {
    recordId: "workflow_plugin_publication_disabled_audit_workflow_publication_disabled",
    status: "WORKFLOW_PLUGIN_PUBLICATION_BLOCKED_BY_POLICY",
    registryEntry: {
      registryEntryId: "workflow_registry_lesson_archive_review",
    },
    boundary: {
      workflowPublishAllowed: false,
      pluginMarketplaceExposureAllowed: false,
      executionCandidateAllowed: false,
      localExecutionEnabled: false,
      processLaunchAllowed: false,
      hostWriteAllowed: false,
      requiresFutureSdd: true,
    },
  };
}

function tempCommandLogPath() {
  return join(mkdtempSync(join(tmpdir(), "workflow-plugin-management-disabled-view-")), "command-log.jsonl");
}

function readRecords(commandLogPath) {
  return readFileSync(commandLogPath, "utf8")
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
