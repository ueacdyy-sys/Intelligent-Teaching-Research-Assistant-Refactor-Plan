import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditWorkflowPluginManagementDisabledView,
  formatWorkflowPluginManagementDisabledViewAudit,
} from "./workflow-plugin-management-disabled-view-audit.mjs";

describe("Workflow plugin management disabled view audit", () => {
  it("passes when management view renders every workflow/plugin action disabled", () => {
    const report = auditWorkflowPluginManagementDisabledView(currentInputs(), {
      generatedAt: "2026-06-05T06:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "WORKFLOW_PLUGIN_MANAGEMENT_DISABLED_VIEW");
    assert.equal(report.boundary.allActionsDisabled, true);
    assert.equal(report.boundary.workflowPublishAllowed, false);
    assert.equal(report.boundary.pluginMarketplaceExposureAllowed, false);
    assert.equal(report.runtimeProbes.disabledView.status, "PASS");
    assert.equal(report.runtimeProbes.disabledView.result.view.disabledActionCount, 4);
    assert.match(formatWorkflowPluginManagementDisabledViewAudit(report), /Workflow plugin management disabled view: READY/u);
  });

  it("fails when the management view schema can enable an action", () => {
    const inputs = currentInputs();
    const schema = JSON.parse(inputs.managementViewSchema);
    schema.properties.actions.items.properties.enabled.const = true;
    inputs.managementViewSchema = JSON.stringify(schema);

    const report = auditWorkflowPluginManagementDisabledView(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "management_view.contract_disables_all_risky_actions").passed, false);
  });

  it("fails when runtime claims marketplace exposure is enabled", () => {
    const inputs = currentInputs();
    inputs.runtime += "\nconst unsafe = { pluginMarketplaceExposureAllowed: true, enabled: true };\n";

    const report = auditWorkflowPluginManagementDisabledView(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.append_only_no_ui_enable_or_execution").passed, false);
  });

  it("fails when execution isolation evidence no longer blocks candidates", () => {
    const inputs = currentInputs();
    const isolation = JSON.parse(inputs.executionIsolationReport);
    isolation.runtimeProbes.blocked.result.boundary.executionCandidateAllowed = true;
    isolation.runtimeProbes.blocked.result.boundary.executionCandidateCount = 1;
    isolation.runtimeProbes.blocked.result.executionCandidateView.candidateCount = 1;
    inputs.executionIsolationReport = JSON.stringify(isolation);

    const report = auditWorkflowPluginManagementDisabledView(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.disabled_view_probe_records_all_actions_disabled").passed, false);
  });

  it("fails when root workflow coverage does not require management disabled view evidence", () => {
    const inputs = currentInputs();
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("workflowPluginManagementDisabledView", "missingManagementDisabledView");

    const report = auditWorkflowPluginManagementDisabledView(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_management_disabled_view_report").passed, false);
  });
});

function currentInputs() {
  return {
    managementViewSchema: JSON.stringify(managementViewSchema()),
    managementViewExample: JSON.stringify(managementViewExample()),
    registryEntryExample: JSON.stringify(registryEntry()),
    executionIsolationReport: JSON.stringify(executionIsolationReport()),
    publicationDisabledReport: JSON.stringify(publicationDisabledReport()),
    runtime: [
      "authorizeManagementViewRecorder",
      "AGENT_INTERNAL",
      "ADMIN_SYSTEM",
      "role === \"STUDENT\"",
      "subjectType === \"REMOTE_CHANNEL\"",
      "registryAdmissionRecordRef",
      "executionIsolationRecordRef",
      "publicationDisabledRecordRef",
      "humanApprovalRecordRef",
      "sandboxResultRecordRef",
      "auditTraceRef",
      "idempotencyKey",
      "execution isolation must block candidates before management view rendering",
      "execution isolation result must keep candidates, publish, local execution, process launch, and host writes disabled",
      "publication disabled result must block publication before management view rendering",
      "publication disabled result must keep publish, marketplace, execution, process launch, and host writes disabled",
      "WORKFLOW_PLUGIN_PUBLICATION_BLOCKED_BY_POLICY",
      "EXECUTION_CANDIDATE_BLOCKED_BY_ISOLATION",
      "appendCommandIntent",
      "fs.appendFileSync",
      "findExistingRecordByIdempotencyKey",
      "workflow-command-log",
      "workflowPublishAllowed: false",
      "pluginMarketplaceExposureAllowed: false",
      "executionCandidateAllowed: false",
      "localExecutionEnabled: false",
      "processLaunchAllowed: false",
      "hostWriteAllowed: false",
      "enabled: false",
    ].join("\n"),
    runtimeTest: [
      "records a management disabled view with every risky action disabled",
      "rejects publication evidence that allows marketplace exposure",
      "rejects execution isolation evidence that exposes candidates",
      "rejects executable registry entries",
      "rejects ordinary teacher principals",
      "replays an idempotent disabled view",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:workflow-plugin-management-disabled-view": "node tools/workflow-plugin-management-disabled-view-audit.mjs --out reports/workflow-plugin-management-disabled-view.current.json",
      },
    }),
    qualityGate: "Workflow plugin management disabled view audit",
    rootWorkflowCoverage: [
      "workflowPluginManagementDisabledView",
      "workflow-plugin-management-disabled-view.current.json",
      "[\"workflowPluginManagementDisabledView\", \"READY\"]",
    ].join("\n"),
    verifyStructure: [
      "workflow-plugin-management-disabled-view.schema.json",
      "workflow-plugin-management-disabled-view.example.json",
      "workflow-plugin-management-disabled-view-runtime.mjs",
      "workflow-plugin-management-disabled-view-runtime.test.mjs",
      "workflow-plugin-management-disabled-view-audit.mjs",
      "workflow-plugin-management-disabled-view-audit.test.mjs",
      "0234-workflow-plugin-management-disabled-view.md",
    ].join("\n"),
  };
}

function managementViewSchema() {
  return {
    properties: {
      surface: { const: "ADMIN_WORKFLOW_PLUGIN_MANAGEMENT" },
      actions: {
        minItems: 4,
        maxItems: 4,
        items: {
          properties: {
            actionId: {
              enum: ["publish", "enableLocalExecution", "createExecutionCandidate", "exposeMarketplace"],
            },
            enabled: { const: false },
          },
        },
      },
      disabledActionCount: { const: 4 },
      boundary: {
        properties: {
          managementViewRendered: { const: true },
          allActionsDisabled: { const: true },
          workflowPublishAllowed: { const: false },
          pluginMarketplaceExposureAllowed: { const: false },
          executionCandidateAllowed: { const: false },
          localExecutionEnabled: { const: false },
          processLaunchAllowed: { const: false },
          hostWriteAllowed: { const: false },
          requiresFutureSdd: { const: true },
        },
      },
    },
  };
}

function managementViewExample() {
  return {
    schemaVersion: "2026-06-05.workflow-plugin.management-disabled-view.v1",
    viewId: "workflow_plugin_management_disabled_view_lesson_archive_review",
    surface: "ADMIN_WORKFLOW_PLUGIN_MANAGEMENT",
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
  };
}

function executionIsolationReport() {
  return {
    readiness: "READY",
    runtimeProbes: {
      blocked: {
        status: "PASS",
        result: {
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
        },
      },
    },
  };
}

function publicationDisabledReport() {
  return {
    readiness: "READY",
    runtimeProbes: {
      blocked: {
        status: "PASS",
        result: {
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
        },
      },
    },
  };
}
