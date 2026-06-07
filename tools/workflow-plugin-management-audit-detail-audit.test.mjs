import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditWorkflowPluginManagementAuditDetail,
  formatWorkflowPluginManagementAuditDetailAudit,
} from "./workflow-plugin-management-audit-detail-audit.mjs";

describe("Workflow plugin management audit detail audit", () => {
  it("passes when read-only audit detail explains the full workflow/plugin evidence chain", () => {
    const report = auditWorkflowPluginManagementAuditDetail(currentInputs(), {
      generatedAt: "2026-06-05T07:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "WORKFLOW_PLUGIN_MANAGEMENT_AUDIT_DETAIL");
    assert.equal(report.boundary.readOnly, true);
    assert.equal(report.boundary.evidenceStageCount, 7);
    assert.equal(report.boundary.disabledActionCount, 4);
    assert.equal(report.runtimeProbes.detail.status, "PASS");
    assert.match(formatWorkflowPluginManagementAuditDetailAudit(report), /Workflow plugin management audit detail: READY/u);
  });

  it("fails when the detail schema can change the production hot path", () => {
    const inputs = currentInputs();
    const schema = JSON.parse(inputs.auditDetailSchema);
    schema.properties.boundary.properties.productionHotPathChanged.const = true;
    inputs.auditDetailSchema = JSON.stringify(schema);

    const report = auditWorkflowPluginManagementAuditDetail(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "audit_detail.contract_is_readonly_detail").passed, false);
  });

  it("fails when runtime claims file writes or enabled controls", () => {
    const inputs = currentInputs();
    inputs.runtime += "\nfs.writeFileSync('x', 'y'); const unsafe = { enabled: true };\n";

    const report = auditWorkflowPluginManagementAuditDetail(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.readonly_no_side_effects_or_enabled_controls").passed, false);
  });

  it("fails when management disabled view evidence enables an action", () => {
    const inputs = currentInputs();
    const management = JSON.parse(inputs.managementDisabledViewReport);
    management.runtimeProbes.disabledView.result.view.actions[0].enabled = true;
    inputs.managementDisabledViewReport = JSON.stringify(management);

    const report = auditWorkflowPluginManagementAuditDetail(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.detail_probe_renders_complete_blocking_timeline").passed, false);
  });

  it("fails when root workflow coverage does not require management audit detail evidence", () => {
    const inputs = currentInputs();
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("workflowPluginManagementAuditDetail", "missingManagementAuditDetail");

    const report = auditWorkflowPluginManagementAuditDetail(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_management_audit_detail_report").passed, false);
  });
});

function currentInputs() {
  return {
    auditDetailSchema: JSON.stringify(auditDetailSchema()),
    auditDetailExample: JSON.stringify({ schemaVersion: "2026-06-05.workflow-plugin.management-audit-detail.v1" }),
    draftIntentReport: JSON.stringify(draftIntentReport()),
    sandboxResultReport: JSON.stringify(sandboxResultReport()),
    humanApprovalReport: JSON.stringify(humanApprovalReport()),
    registryAdmissionReport: JSON.stringify(registryAdmissionReport()),
    executionIsolationReport: JSON.stringify(executionIsolationReport()),
    publicationDisabledReport: JSON.stringify(publicationDisabledReport()),
    managementDisabledViewReport: JSON.stringify(managementDisabledViewReport()),
    runtime: [
      "authorizeManagementDetailReader",
      "AGENT_INTERNAL",
      "ADMIN_SYSTEM",
      "role === \"STUDENT\"",
      "subjectType === \"REMOTE_CHANNEL\"",
      "draftIntent",
      "sandboxResult",
      "humanApproval",
      "registryAdmission",
      "executionIsolation",
      "publicationDisabled",
      "managementDisabledView",
      "readOnly: true",
      "productionHotPathChanged: false",
      "workflowPublishAllowed: false",
      "pluginMarketplaceExposureAllowed: false",
      "executionCandidateAllowed: false",
      "localExecutionEnabled: false",
      "processLaunchAllowed: false",
      "hostWriteAllowed: false",
      "enabled: false",
    ].join("\n"),
    runtimeTest: [
      "renders read-only audit detail from the workflow/plugin evidence chain",
      "rejects ordinary teacher principals",
      "rejects management views with enabled actions",
      "rejects publication evidence that allows marketplace exposure",
      "rejects execution isolation evidence that exposes candidates",
      "rejects missing ready evidence reports",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:workflow-plugin-management-audit-detail": "node tools/workflow-plugin-management-audit-detail-audit.mjs --out reports/workflow-plugin-management-audit-detail.current.json",
      },
    }),
    qualityGate: "Workflow plugin management audit detail audit",
    rootWorkflowCoverage: [
      "workflowPluginManagementAuditDetail",
      "workflow-plugin-management-audit-detail.current.json",
      "[\"workflowPluginManagementAuditDetail\", \"READY\"]",
    ].join("\n"),
    verifyStructure: [
      "workflow-plugin-management-audit-detail.schema.json",
      "workflow-plugin-management-audit-detail.example.json",
      "workflow-plugin-management-audit-detail-runtime.mjs",
      "workflow-plugin-management-audit-detail-runtime.test.mjs",
      "workflow-plugin-management-audit-detail-audit.mjs",
      "workflow-plugin-management-audit-detail-audit.test.mjs",
      "0235-workflow-plugin-management-audit-detail.md",
    ].join("\n"),
  };
}

function auditDetailSchema() {
  return {
    properties: {
      surface: { const: "ADMIN_WORKFLOW_PLUGIN_AUDIT_DETAIL" },
      evidenceTimeline: { minItems: 7, maxItems: 7 },
      controlActions: {
        items: {
          properties: {
            enabled: { const: false },
          },
        },
      },
      boundary: {
        properties: {
          readOnly: { const: true },
          allActionsDisabled: { const: true },
          workflowPublishAllowed: { const: false },
          pluginMarketplaceExposureAllowed: { const: false },
          executionCandidateAllowed: { const: false },
          localExecutionEnabled: { const: false },
          processLaunchAllowed: { const: false },
          hostWriteAllowed: { const: false },
          productionHotPathChanged: { const: false },
          requiresFutureSdd: { const: true },
        },
      },
    },
  };
}

function draftIntentReport() {
  return {
    readiness: "READY",
    boundary: {
      status: "REVIEW_REQUIRED",
      executionCandidateAllowed: false,
      localGeneratedCodeExecuted: false,
      workflowPublishAllowed: false,
      registrySaveAllowed: false,
      directDatabaseWriteAllowed: false,
    },
    runtimeProbe: { result: { status: "REVIEW_REQUIRED", recordId: "draft-record" } },
  };
}

function sandboxResultReport() {
  return {
    readiness: "READY",
    boundary: {
      registrySaveAllowed: false,
      workflowPublishAllowed: false,
      executionCandidateAllowed: false,
      localGeneratedCodeExecuted: false,
      humanApprovalRequiredBeforeRegistry: true,
    },
    runtimeProbes: { pass: { result: { status: "SANDBOX_PASSED_REVIEW_REQUIRED", recordId: "sandbox-record" } } },
  };
}

function humanApprovalReport() {
  return {
    readiness: "READY",
    boundary: {
      registrySaveAllowed: false,
      workflowPublishAllowed: false,
      executionCandidateAllowed: false,
      localGeneratedCodeExecuted: false,
      registryAdmissionCandidateRequiresApproval: true,
    },
    runtimeProbes: { approved: { result: { status: "HUMAN_APPROVED_REGISTRY_ADMISSION_READY", recordId: "approval-record" } } },
  };
}

function registryAdmissionReport() {
  return {
    readiness: "READY",
    boundary: {
      registryEntryPersisted: true,
      executionMode: "DRY_RUN_ONLY",
      localExecutionEnabled: false,
      workflowPublishAllowed: false,
      executionCandidateAllowed: false,
      localGeneratedCodeExecuted: false,
    },
    runtimeProbes: { allow: { result: { status: "REGISTRY_ADMISSION_SAVED_DRY_RUN_ONLY", recordId: "registry-record" } } },
  };
}

function executionIsolationReport() {
  return {
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
    runtimeProbes: { blocked: { result: { status: "EXECUTION_CANDIDATE_BLOCKED_BY_ISOLATION", recordId: "isolation-record" } } },
  };
}

function publicationDisabledReport() {
  return {
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
    runtimeProbes: { blocked: { result: { status: "WORKFLOW_PLUGIN_PUBLICATION_BLOCKED_BY_POLICY", recordId: "publication-record" } } },
  };
}

function managementDisabledViewReport() {
  const result = managementDisabledViewResult();
  return {
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
    runtimeProbes: { disabledView: { result } },
  };
}

function managementDisabledViewResult() {
  return {
    status: "WORKFLOW_PLUGIN_MANAGEMENT_VIEW_DISABLED",
    recordId: "management-record",
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
        disabledAction("publish"),
        disabledAction("enableLocalExecution"),
        disabledAction("createExecutionCandidate"),
        disabledAction("exposeMarketplace"),
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

function disabledAction(actionId) {
  return {
    actionId,
    enabled: false,
    disabledReason: "Disabled by current SDD.",
    evidenceRef: `evidence:${actionId}`,
  };
}
