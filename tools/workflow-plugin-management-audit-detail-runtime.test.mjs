import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  WORKFLOW_PLUGIN_MANAGEMENT_AUDIT_DETAIL_READ_PORT,
  renderWorkflowPluginManagementAuditDetail,
} from "./workflow-plugin-management-audit-detail-runtime.mjs";

describe("WorkflowManagementReadPort.renderWorkflowPluginManagementAuditDetail", () => {
  it("renders read-only audit detail from the workflow/plugin evidence chain", () => {
    const result = renderWorkflowPluginManagementAuditDetail(baseInput(), {
      generatedAt: "2026-06-05T07:00:00.000Z",
    });

    assert.equal(result.readPort, WORKFLOW_PLUGIN_MANAGEMENT_AUDIT_DETAIL_READ_PORT);
    assert.equal(result.status, "WORKFLOW_PLUGIN_MANAGEMENT_AUDIT_DETAIL_READONLY");
    assert.equal(result.detail.surface, "ADMIN_WORKFLOW_PLUGIN_AUDIT_DETAIL");
    assert.equal(result.detail.evidenceTimeline.length, 7);
    assert.deepEqual(result.detail.evidenceTimeline.map((stage) => stage.stage), [
      "DRAFT_INTENT",
      "SANDBOX_RESULT",
      "HUMAN_APPROVAL",
      "REGISTRY_ADMISSION",
      "EXECUTION_ISOLATION",
      "PUBLICATION_DISABLED",
      "MANAGEMENT_DISABLED_VIEW",
    ]);
    assert.equal(result.detail.controlActions.length, 4);
    assert.equal(result.detail.controlActions.every((action) => action.enabled === false), true);
    assert.equal(result.boundary.readOnly, true);
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
      () => renderWorkflowPluginManagementAuditDetail(input),
      /internal service or admin/u,
    );
  });

  it("rejects management views with enabled actions", () => {
    const view = managementDisabledViewResult();
    view.view.actions[0] = {
      ...view.view.actions[0],
      enabled: true,
    };
    const input = baseInput({ managementDisabledViewResult: view });

    assert.throws(
      () => renderWorkflowPluginManagementAuditDetail(input),
      /exactly four disabled control actions/u,
    );
  });

  it("rejects publication evidence that allows marketplace exposure", () => {
    const reports = evidenceReports();
    reports.publicationDisabled = {
      ...reports.publicationDisabled,
      boundary: {
        ...reports.publicationDisabled.boundary,
        pluginMarketplaceExposureAllowed: true,
      },
    };
    const input = baseInput({ evidenceReports: reports });

    assert.throws(
      () => renderWorkflowPluginManagementAuditDetail(input),
      /publication disabled report/u,
    );
  });

  it("rejects execution isolation evidence that exposes candidates", () => {
    const reports = evidenceReports();
    reports.executionIsolation = {
      ...reports.executionIsolation,
      boundary: {
        ...reports.executionIsolation.boundary,
        executionCandidateAllowed: true,
        executionCandidateCount: 1,
      },
    };
    const input = baseInput({ evidenceReports: reports });

    assert.throws(
      () => renderWorkflowPluginManagementAuditDetail(input),
      /execution isolation/u,
    );
  });

  it("rejects missing ready evidence reports", () => {
    const reports = evidenceReports();
    reports.sandboxResult = {
      ...reports.sandboxResult,
      readiness: "NEEDS_REMEDIATION",
    };
    const input = baseInput({ evidenceReports: reports });

    assert.throws(
      () => renderWorkflowPluginManagementAuditDetail(input),
      /sandboxResult report must be READY/u,
    );
  });
});

function baseInput(overrides = {}) {
  return {
    principal: servicePrincipal(),
    managementDisabledViewResult: managementDisabledViewResult(),
    evidenceReports: evidenceReports(),
    ...overrides,
  };
}

function servicePrincipal() {
  return {
    principalId: "workflow_management_audit_detail_service",
    role: "SERVICE",
    subjectType: "SERVICE",
    entryPoint: "AGENT_INTERNAL",
    scopes: ["ADMIN_SYSTEM"],
    requiresHarnessApproval: false,
    sessionId: "workflow_management_audit_detail_service_session_001",
  };
}

function managementDisabledViewResult() {
  return {
    status: "WORKFLOW_PLUGIN_MANAGEMENT_VIEW_DISABLED",
    recordId: "workflow_plugin_management_disabled_view_audit_workflow_management_disabled_view",
    view: {
      surface: "ADMIN_WORKFLOW_PLUGIN_MANAGEMENT",
      registryEntry: {
        registryEntryId: "workflow_registry_lesson_archive_review",
        draftId: "workflow_draft_lesson_archive_review",
        artifactKind: "WORKFLOW",
        capabilityKind: "WORKFLOW",
        status: "ACTIVE",
        executionMode: "DRY_RUN_ONLY",
        localExecutionEnabled: false,
      },
      disabledActionCount: 4,
      actions: [
        disabledAction("publish", "Publication is blocked by the current SDD.", "workflow-plugin-publication-disabled:publication"),
        disabledAction("enableLocalExecution", "Local execution requires a future executable isolation SDD.", "workflow-plugin-execution-isolation:isolation"),
        disabledAction("createExecutionCandidate", "Execution candidates are disabled by the current SDD.", "workflow-plugin-execution-isolation:isolation"),
        disabledAction("exposeMarketplace", "Marketplace exposure is blocked by the current SDD.", "workflow-plugin-publication-disabled:publication"),
      ],
    },
    boundary: {
      allActionsDisabled: true,
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

function evidenceReports() {
  return {
    draftIntent: {
      readiness: "READY",
      boundary: {
        status: "REVIEW_REQUIRED",
        executionCandidateAllowed: false,
        localGeneratedCodeExecuted: false,
        workflowPublishAllowed: false,
        registrySaveAllowed: false,
        directDatabaseWriteAllowed: false,
      },
      runtimeProbe: {
        result: {
          status: "REVIEW_REQUIRED",
          recordId: "workflow_plugin_draft_intent_audit-workflow-plugin-draft-intent",
        },
      },
    },
    sandboxResult: {
      readiness: "READY",
      boundary: {
        registrySaveAllowed: false,
        workflowPublishAllowed: false,
        executionCandidateAllowed: false,
        localGeneratedCodeExecuted: false,
        humanApprovalRequiredBeforeRegistry: true,
      },
      runtimeProbes: {
        pass: {
          result: {
            status: "SANDBOX_PASSED_REVIEW_REQUIRED",
            recordId: "workflow_plugin_sandbox_result_audit-workflow-sandbox-result-pass",
          },
        },
      },
    },
    humanApproval: {
      readiness: "READY",
      boundary: {
        registrySaveAllowed: false,
        workflowPublishAllowed: false,
        executionCandidateAllowed: false,
        localGeneratedCodeExecuted: false,
        registryAdmissionCandidateRequiresApproval: true,
      },
      runtimeProbes: {
        approved: {
          result: {
            status: "HUMAN_APPROVED_REGISTRY_ADMISSION_READY",
            recordId: "workflow_plugin_human_approval_audit-workflow-human-approval-approved",
          },
        },
      },
    },
    registryAdmission: {
      readiness: "READY",
      boundary: {
        registryEntryPersisted: true,
        executionMode: "DRY_RUN_ONLY",
        localExecutionEnabled: false,
        workflowPublishAllowed: false,
        executionCandidateAllowed: false,
        localGeneratedCodeExecuted: false,
      },
      runtimeProbes: {
        allow: {
          result: {
            status: "REGISTRY_ADMISSION_SAVED_DRY_RUN_ONLY",
            recordId: "workflow_plugin_registry_admission_audit-workflow-registry-admission-allow",
          },
        },
      },
    },
    executionIsolation: {
      readiness: "READY",
      boundary: {
        executionCandidateAllowed: false,
        executionCandidateCount: 0,
        localExecutionEnabled: false,
        workflowPublishAllowed: false,
        processLaunchAllowed: false,
        hostWriteAllowed: false,
        requiresFutureSdd: true,
      },
      runtimeProbes: {
        blocked: {
          result: {
            status: "EXECUTION_CANDIDATE_BLOCKED_BY_ISOLATION",
            recordId: "workflow_plugin_execution_isolation_audit-workflow-execution-isolation",
          },
        },
      },
    },
    publicationDisabled: {
      readiness: "READY",
      boundary: {
        workflowPublishAllowed: false,
        pluginMarketplaceExposureAllowed: false,
        executionCandidateAllowed: false,
        localExecutionEnabled: false,
        processLaunchAllowed: false,
        hostWriteAllowed: false,
        requiresFutureSdd: true,
      },
      runtimeProbes: {
        blocked: {
          result: {
            status: "WORKFLOW_PLUGIN_PUBLICATION_BLOCKED_BY_POLICY",
            recordId: "workflow_plugin_publication_disabled_audit_workflow_publication_disabled",
          },
        },
      },
    },
    managementDisabledView: {
      readiness: "READY",
      boundary: {
        allActionsDisabled: true,
        disabledActionCount: 4,
        workflowPublishAllowed: false,
        pluginMarketplaceExposureAllowed: false,
        executionCandidateAllowed: false,
        localExecutionEnabled: false,
        processLaunchAllowed: false,
        hostWriteAllowed: false,
        requiresFutureSdd: true,
      },
      runtimeProbes: {
        disabledView: {
          result: {
            status: "WORKFLOW_PLUGIN_MANAGEMENT_VIEW_DISABLED",
            recordId: "workflow_plugin_management_disabled_view_audit_workflow_management_disabled_view",
          },
        },
      },
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
