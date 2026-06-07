import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditWorkflowPluginManagementReadonlyList,
  formatWorkflowPluginManagementReadonlyListAudit,
} from "./workflow-plugin-management-readonly-list-audit.mjs";

describe("Workflow plugin management read-only list audit", () => {
  it("passes when the management list is read-only and backed by audit detail evidence", () => {
    const report = auditWorkflowPluginManagementReadonlyList(currentInputs(), {
      generatedAt: "2026-06-05T08:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "WORKFLOW_PLUGIN_MANAGEMENT_READONLY_LIST");
    assert.equal(report.boundary.readOnly, true);
    assert.equal(report.boundary.listItemCount, 1);
    assert.equal(report.boundary.evidenceStageCountPerItem, 7);
    assert.equal(report.boundary.disabledActionCountPerItem, 4);
    assert.equal(report.runtimeProbes.list.status, "PASS");
    assert.match(formatWorkflowPluginManagementReadonlyListAudit(report), /Workflow plugin management read-only list: READY/u);
  });

  it("fails when the list schema can change the production hot path", () => {
    const inputs = currentInputs();
    const schema = JSON.parse(inputs.readonlyListSchema);
    schema.properties.boundary.properties.productionHotPathChanged.const = true;
    inputs.readonlyListSchema = JSON.stringify(schema);

    const report = auditWorkflowPluginManagementReadonlyList(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "readonly_list.contract_is_admin_list_projection").passed, false);
  });

  it("fails when runtime claims file writes or enabled controls", () => {
    const inputs = currentInputs();
    inputs.runtime += "\nfs.writeFileSync('x', 'y'); const unsafe = { enabled: true };\n";

    const report = auditWorkflowPluginManagementReadonlyList(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.readonly_no_side_effects_or_enabled_controls").passed, false);
  });

  it("fails when audit detail evidence enables an action", () => {
    const inputs = currentInputs();
    const detail = JSON.parse(inputs.auditDetailReport);
    detail.runtimeProbes.detail.result.detail.controlActions[0].enabled = true;
    inputs.auditDetailReport = JSON.stringify(detail);

    const report = auditWorkflowPluginManagementReadonlyList(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.list_probe_renders_readonly_rows").passed, false);
  });

  it("fails when root workflow coverage does not require read-only list evidence", () => {
    const inputs = currentInputs();
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("workflowPluginManagementReadonlyList", "missingReadonlyList");

    const report = auditWorkflowPluginManagementReadonlyList(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_readonly_list_report").passed, false);
  });
});

function currentInputs() {
  return {
    readonlyListSchema: JSON.stringify(readonlyListSchema()),
    readonlyListExample: JSON.stringify({ schemaVersion: "2026-06-05.workflow-plugin.management-readonly-list.v1" }),
    auditDetailReport: JSON.stringify(auditDetailReport()),
    runtime: [
      "authorizeManagementListReader",
      "AGENT_INTERNAL",
      "ADMIN_SYSTEM",
      "role === \"STUDENT\"",
      "subjectType === \"REMOTE_CHANNEL\"",
      "auditDetails",
      "ADMIN_WORKFLOW_PLUGIN_AUDIT_DETAIL",
      "READONLY_AUDIT_READY",
      "EXECUTION_CANDIDATES_DISABLED",
      "PUBLICATION_DISABLED",
      "ALL_ACTIONS_DISABLED",
      "readOnly: true",
      "allEntriesReadOnly: true",
      "allActionsDisabled: true",
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
      "renders a read-only management list from audit detail evidence",
      "rejects ordinary teacher principals",
      "rejects empty audit detail lists",
      "rejects audit details with enabled control actions",
      "rejects audit details that expose execution candidates",
      "rejects duplicate registry entries",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:workflow-plugin-management-readonly-list": "node tools/workflow-plugin-management-readonly-list-audit.mjs --out reports/workflow-plugin-management-readonly-list.current.json",
      },
    }),
    qualityGate: "Workflow plugin management read-only list audit",
    rootWorkflowCoverage: [
      "workflowPluginManagementReadonlyList",
      "workflow-plugin-management-readonly-list.current.json",
      "[\"workflowPluginManagementReadonlyList\", \"READY\"]",
    ].join("\n"),
    verifyStructure: [
      "workflow-plugin-management-readonly-list.schema.json",
      "workflow-plugin-management-readonly-list.example.json",
      "workflow-plugin-management-readonly-list-runtime.mjs",
      "workflow-plugin-management-readonly-list-runtime.test.mjs",
      "workflow-plugin-management-readonly-list-audit.mjs",
      "workflow-plugin-management-readonly-list-audit.test.mjs",
      "0236-workflow-plugin-management-readonly-list.md",
    ].join("\n"),
  };
}

function readonlyListSchema() {
  return {
    properties: {
      surface: { const: "ADMIN_WORKFLOW_PLUGIN_MANAGEMENT_LIST" },
      entries: {
        minItems: 1,
        items: {
          properties: {
            evidenceStageCount: { const: 7 },
            disabledActionCount: { const: 4 },
            controlActions: {
              items: {
                properties: {
                  enabled: { const: false },
                },
              },
            },
          },
        },
      },
      summary: {
        properties: {
          allEntriesReadOnly: { const: true },
          allActionsDisabled: { const: true },
        },
      },
      boundary: {
        properties: {
          readOnly: { const: true },
          allEntriesReadOnly: { const: true },
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

function auditDetailReport() {
  return {
    readiness: "READY",
    runtimeProbes: {
      detail: {
        result: auditDetailResult(),
      },
    },
  };
}

function auditDetailResult() {
  return {
    status: "WORKFLOW_PLUGIN_MANAGEMENT_AUDIT_DETAIL_READONLY",
    detail: {
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
        allowedToAdvance: stage === "DRAFT_INTENT",
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
