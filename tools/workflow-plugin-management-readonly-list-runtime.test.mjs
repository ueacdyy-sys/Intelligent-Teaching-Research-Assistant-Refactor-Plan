import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  WORKFLOW_PLUGIN_MANAGEMENT_READONLY_LIST_READ_PORT,
  renderWorkflowPluginManagementReadonlyList,
} from "./workflow-plugin-management-readonly-list-runtime.mjs";

describe("WorkflowManagementReadPort.renderWorkflowPluginManagementReadonlyList", () => {
  it("renders a read-only management list from audit detail evidence", () => {
    const result = renderWorkflowPluginManagementReadonlyList(baseInput(), {
      generatedAt: "2026-06-05T08:00:00.000Z",
    });

    assert.equal(result.readPort, WORKFLOW_PLUGIN_MANAGEMENT_READONLY_LIST_READ_PORT);
    assert.equal(result.status, "WORKFLOW_PLUGIN_MANAGEMENT_READONLY_LIST_READY");
    assert.equal(result.list.surface, "ADMIN_WORKFLOW_PLUGIN_MANAGEMENT_LIST");
    assert.equal(result.list.summary.itemCount, 1);
    assert.equal(result.list.entries.length, 1);
    assert.equal(result.list.entries[0].evidenceStageCount, 7);
    assert.equal(result.list.entries[0].disabledActionCount, 4);
    assert.deepEqual(result.list.entries[0].blockedActionIds, [
      "publish",
      "enableLocalExecution",
      "createExecutionCandidate",
      "exposeMarketplace",
    ]);
    assert.equal(result.list.entries[0].controlActions.every((action) => action.enabled === false), true);
    assert.equal(result.boundary.readOnly, true);
    assert.equal(result.boundary.allEntriesReadOnly, true);
    assert.equal(result.boundary.allActionsDisabled, true);
    assert.equal(result.boundary.productionHotPathChanged, false);
    assert.equal(result.boundary.workflowPublishAllowed, false);
    assert.equal(result.boundary.executionCandidateAllowed, false);
  });

  it("rejects ordinary teacher principals", () => {
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
      () => renderWorkflowPluginManagementReadonlyList(input),
      /internal service or admin/u,
    );
  });

  it("rejects empty audit detail lists", () => {
    const input = baseInput({ auditDetails: [] });

    assert.throws(
      () => renderWorkflowPluginManagementReadonlyList(input),
      /at least one management audit detail/u,
    );
  });

  it("rejects audit details with enabled control actions", () => {
    const detailResult = auditDetailResult();
    detailResult.detail.controlActions[0] = {
      ...detailResult.detail.controlActions[0],
      enabled: true,
    };
    const input = baseInput({ auditDetails: [detailResult] });

    assert.throws(
      () => renderWorkflowPluginManagementReadonlyList(input),
      /exactly four disabled control actions/u,
    );
  });

  it("rejects audit details that expose execution candidates", () => {
    const detailResult = auditDetailResult();
    detailResult.detail.boundary.executionCandidateAllowed = true;
    const input = baseInput({ auditDetails: [detailResult] });

    assert.throws(
      () => renderWorkflowPluginManagementReadonlyList(input),
      /publication, execution, process launch/u,
    );
  });

  it("rejects duplicate registry entries", () => {
    const input = baseInput({ auditDetails: [auditDetailResult(), auditDetailResult()] });

    assert.throws(
      () => renderWorkflowPluginManagementReadonlyList(input),
      /duplicate registryEntryId/u,
    );
  });
});

function baseInput(overrides = {}) {
  return {
    principal: servicePrincipal(),
    auditDetails: [auditDetailResult()],
    ...overrides,
  };
}

function servicePrincipal() {
  return {
    principalId: "workflow_management_readonly_list_service",
    role: "SERVICE",
    subjectType: "SERVICE",
    entryPoint: "AGENT_INTERNAL",
    scopes: ["ADMIN_SYSTEM"],
    requiresHarnessApproval: false,
    sessionId: "workflow_management_readonly_list_service_session_001",
  };
}

function auditDetailResult() {
  return {
    status: "WORKFLOW_PLUGIN_MANAGEMENT_AUDIT_DETAIL_READONLY",
    detail: auditDetail(),
    boundary: auditDetail().boundary,
  };
}

function auditDetail() {
  return {
    schemaVersion: "2026-06-05.workflow-plugin.management-audit-detail.v1",
    detailId: "workflow_plugin_management_audit_detail_workflow_registry_lesson_archive_review",
    generatedAt: "2026-06-05T07:00:00.000Z",
    surface: "ADMIN_WORKFLOW_PLUGIN_AUDIT_DETAIL",
    registryEntry: {
      registryEntryId: "workflow_registry_lesson_archive_review",
      draftId: "workflow_draft_lesson_archive_review",
      artifactKind: "WORKFLOW",
      capabilityKind: "WORKFLOW",
      status: "ACTIVE",
      executionMode: "DRY_RUN_ONLY",
      localExecutionEnabled: false,
    },
    summary: {
      detailReadiness: "READONLY_AUDIT_READY",
      executionStatus: "EXECUTION_CANDIDATES_DISABLED",
      publicationStatus: "PUBLICATION_DISABLED",
      managementStatus: "ALL_ACTIONS_DISABLED",
      nextRequiredSdd: "EXECUTABLE_ISOLATION_SIGNING_ROLLOUT_ROLLBACK",
    },
    evidenceTimeline: [
      "DRAFT_INTENT",
      "SANDBOX_RESULT",
      "HUMAN_APPROVAL",
      "REGISTRY_ADMISSION",
      "EXECUTION_ISOLATION",
      "PUBLICATION_DISABLED",
      "MANAGEMENT_DISABLED_VIEW",
    ].map((stage) => ({
      stage,
      status: `${stage}_STATUS`,
      reportRef: `reports/${stage.toLowerCase()}.json`,
      recordRef: `${stage.toLowerCase()}_record`,
      allowedToAdvance: !["EXECUTION_ISOLATION", "PUBLICATION_DISABLED", "MANAGEMENT_DISABLED_VIEW"].includes(stage),
    })),
    controlActions: [
      disabledAction("publish", "Publication is blocked by the current SDD.", "workflow-plugin-publication-disabled:publication"),
      disabledAction("enableLocalExecution", "Local execution requires a future executable isolation SDD.", "workflow-plugin-execution-isolation:isolation"),
      disabledAction("createExecutionCandidate", "Execution candidates are disabled by the current SDD.", "workflow-plugin-execution-isolation:isolation"),
      disabledAction("exposeMarketplace", "Marketplace exposure is blocked by the current SDD.", "workflow-plugin-publication-disabled:publication"),
    ],
    boundary: {
      readOnly: true,
      managementDetailRendered: true,
      allActionsDisabled: true,
      workflowPublishAllowed: false,
      pluginMarketplaceExposureAllowed: false,
      executionCandidateAllowed: false,
      localExecutionEnabled: false,
      processLaunchAllowed: false,
      hostWriteAllowed: false,
      productionHotPathChanged: false,
      requiresFutureSdd: true,
    },
  };
}

function disabledAction(actionId, disabledReason, evidenceRef) {
  return {
    actionId,
    enabled: false,
    disabledReason,
    evidenceRef,
  };
}
