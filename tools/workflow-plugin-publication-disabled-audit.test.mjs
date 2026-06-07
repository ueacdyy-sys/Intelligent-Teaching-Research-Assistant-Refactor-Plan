import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditWorkflowPluginPublicationDisabledRuntime,
  formatWorkflowPluginPublicationDisabledAudit,
} from "./workflow-plugin-publication-disabled-audit.mjs";

describe("Workflow plugin publication disabled runtime audit", () => {
  it("passes when publication remains blocked by policy and execution isolation", () => {
    const report = auditWorkflowPluginPublicationDisabledRuntime(currentInputs(), {
      generatedAt: "2026-06-05T05:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "WORKFLOW_PLUGIN_PUBLICATION_DISABLED_RUNTIME");
    assert.equal(report.boundary.workflowPublishAllowed, false);
    assert.equal(report.boundary.pluginMarketplaceExposureAllowed, false);
    assert.equal(report.runtimeProbes.blocked.status, "PASS");
    assert.match(formatWorkflowPluginPublicationDisabledAudit(report), /Workflow plugin publication disabled runtime: READY/u);
  });

  it("fails when publication policy allows publication", () => {
    const inputs = currentInputs();
    const schema = JSON.parse(inputs.publicationPolicySchema);
    schema.properties.publicationAllowed.const = true;
    inputs.publicationPolicySchema = JSON.stringify(schema);

    const report = auditWorkflowPluginPublicationDisabledRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "publication_policy.default_blocks_publication").passed, false);
  });

  it("fails when runtime claims marketplace exposure is enabled", () => {
    const inputs = currentInputs();
    inputs.runtime += "\nconst unsafe = { pluginMarketplaceExposureAllowed: true, workflowPublishAllowed: true };\n";

    const report = auditWorkflowPluginPublicationDisabledRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.append_only_no_publish_or_execution").passed, false);
  });

  it("fails when root workflow coverage does not require publication disabled evidence", () => {
    const inputs = currentInputs();
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("workflowPluginPublicationDisabled", "missingPublicationDisabled");

    const report = auditWorkflowPluginPublicationDisabledRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_publication_disabled_report").passed, false);
  });

  it("fails when execution isolation evidence no longer blocks candidates", () => {
    const inputs = currentInputs();
    const isolation = JSON.parse(inputs.executionIsolationReport);
    isolation.runtimeProbes.blocked.result.boundary.executionCandidateAllowed = true;
    isolation.runtimeProbes.blocked.result.boundary.executionCandidateCount = 1;
    isolation.runtimeProbes.blocked.result.executionCandidateView.candidateCount = 1;
    inputs.executionIsolationReport = JSON.stringify(isolation);

    const report = auditWorkflowPluginPublicationDisabledRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.blocked_probe_records_publication_disabled").passed, false);
  });
});

function currentInputs() {
  return {
    publicationPolicySchema: JSON.stringify({
      properties: {
        mode: { const: "BLOCK_PUBLICATION" },
        publicationAllowed: { const: false },
        publicationChannel: { const: "DISABLED" },
        registryExposure: { const: "INTERNAL_DRY_RUN_CATALOG_ONLY" },
        requiresExecutionIsolation: { const: true },
        requiresFutureSdd: { const: true },
        auditLogRequired: { const: true },
      },
    }),
    publicationPolicyExample: JSON.stringify(publicationPolicy()),
    registryEntryExample: JSON.stringify(registryEntry()),
    executionIsolationReport: JSON.stringify(executionIsolationReport()),
    runtime: [
      "authorizePublicationRecorder",
      "AGENT_INTERNAL",
      "ADMIN_SYSTEM",
      "role === \"STUDENT\"",
      "subjectType === \"REMOTE_CHANNEL\"",
      "registryAdmissionRecordRef",
      "executionIsolationRecordRef",
      "humanApprovalRecordRef",
      "sandboxResultRecordRef",
      "sharedContextRef",
      "guardrailResultRef",
      "routeDecisionRef",
      "rollbackPlanRef",
      "auditTraceRef",
      "idempotencyKey",
      "registry entries must remain DRY_RUN_ONLY with localExecutionEnabled=false",
      "execution isolation must block candidates before publication can be considered",
      "execution isolation result must keep candidates, publish, local execution, process launch, and host writes disabled",
      "BLOCK_PUBLICATION",
      "INTERNAL_DRY_RUN_CATALOG_ONLY",
      "DISABLED",
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
      "localGeneratedCodeExecuted: false",
      "generatedCodeExecutedOnHost: false",
    ].join("\n"),
    runtimeTest: [
      "records a blocked publication precheck",
      "rejects publication policies that allow publication",
      "rejects execution isolation results that expose candidates",
      "rejects registry entries that enable local execution",
      "rejects ordinary teacher principals",
      "replays an idempotent publication precheck",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:workflow-plugin-publication-disabled": "node tools/workflow-plugin-publication-disabled-audit.mjs --out reports/workflow-plugin-publication-disabled.current.json",
      },
    }),
    qualityGate: "Workflow plugin publication disabled runtime audit",
    rootWorkflowCoverage: [
      "workflowPluginPublicationDisabled",
      "workflow-plugin-publication-disabled.current.json",
      "[\"workflowPluginPublicationDisabled\", \"READY\"]",
    ].join("\n"),
    verifyStructure: [
      "workflow-plugin-publication-policy.schema.json",
      "workflow-plugin-publication-policy.example.json",
      "workflow-plugin-publication-disabled-runtime.mjs",
      "workflow-plugin-publication-disabled-runtime.test.mjs",
      "workflow-plugin-publication-disabled-audit.mjs",
      "workflow-plugin-publication-disabled-audit.test.mjs",
      "0233-workflow-plugin-publication-disabled-gate.md",
    ].join("\n"),
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

function executionIsolationReport() {
  return {
    readiness: "READY",
    runtimeProbes: {
      blocked: {
        status: "PASS",
        result: {
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
        },
      },
    },
  };
}
