import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditWorkflowPluginDraftIntentRuntime,
  formatWorkflowPluginDraftIntentAudit,
} from "./workflow-plugin-draft-intent-audit.mjs";

describe("Workflow plugin draft intent runtime audit", () => {
  it("passes when workflow/plugin drafts are review-only command intents", () => {
    const report = auditWorkflowPluginDraftIntentRuntime(currentInputs(), {
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "WORKFLOW_PLUGIN_DRAFT_INTENT_RUNTIME");
    assert.equal(report.boundary.workflowPublishAllowed, false);
    assert.equal(report.boundary.registrySaveAllowed, false);
    assert.equal(report.runtimeProbe.status, "PASS");
    assert.match(formatWorkflowPluginDraftIntentAudit(report), /Workflow plugin draft intent runtime: READY/u);
  });

  it("fails when the gateway drops the workflow plugin draft intent", () => {
    const inputs = currentInputs();
    const gateway = JSON.parse(inputs.gateway);
    gateway.acceptedIntents = gateway.acceptedIntents.filter((intent) => intent.intentId !== "draft_workflow_plugin");
    inputs.gateway = JSON.stringify(gateway);

    const report = auditWorkflowPluginDraftIntentRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "contract.gateway_allowlists_workflow_plugin_draft").passed, false);
  });

  it("fails when runtime claims generated-code execution", () => {
    const inputs = currentInputs();
    inputs.runtime += "\nconst unsafe = { executionCandidateAllowed: true, localGeneratedCodeExecuted: true };\n";

    const report = auditWorkflowPluginDraftIntentRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.append_only_no_execution_or_registry_save").passed, false);
  });

  it("fails when the runtime probe cannot submit a safe plugin draft", () => {
    const inputs = currentInputs();
    const draft = JSON.parse(inputs.pluginDraftExample);
    draft.registrySaveAllowed = true;
    inputs.pluginDraftExample = JSON.stringify(draft);

    const report = auditWorkflowPluginDraftIntentRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.probe_returns_review_required").passed, false);
  });
});

function currentInputs() {
  return {
    gateway: JSON.stringify({
      acceptedIntents: [
        {
          intentId: "draft_workflow_plugin",
          workerAgent: "WorkflowAgent",
          commandPort: {
            portName: "WorkflowDraftCommandPort",
            operation: "submitWorkflowPluginDraftIntent",
          },
          approvalRequired: true,
          executionCandidateAllowed: false,
          directDatabaseWriteAllowed: false,
          finalEvaluationWriteAllowed: false,
        },
      ],
    }),
    draftSchema: JSON.stringify({
      required: [
        "userIntent",
        "generatedFiles",
        "executionMode",
        "sandboxRequired",
        "humanApprovalRequired",
        "allowedHostAccess",
        "registrySaveAllowed",
      ],
      properties: {
        executionMode: { const: "DRY_RUN_ONLY" },
        sandboxRequired: { const: true },
        humanApprovalRequired: { const: true },
        allowedHostAccess: { const: "NONE" },
        registrySaveAllowed: { const: false },
      },
    }),
    pluginDraftExample: JSON.stringify(pluginDraft()),
    runtime: [
      "requiredEvidenceFields",
      "authorizePrincipal",
      "assertDraftSafety",
      "AGENT_COMMAND_SUBMIT",
      "REMOTE_SOCIAL",
      "WORKFLOW_PLUGIN_DRAFT_INTENT_REVIEW_REQUIRED",
      "approvalArtifactRef",
      "rollbackPlanRef",
      "auditTraceRef",
      "idempotencyKey",
      "appendCommandIntent",
      "fs.appendFileSync",
      "findExistingRecordByIdempotencyKey",
      "workflow-command-log",
      "registrySaveAllowed: false",
      "executionCandidateAllowed: false",
      "localGeneratedCodeExecuted: false",
      "workflowPublishAllowed: false",
    ].join("\n"),
    runtimeTest: [
      "rejects missing review evidence",
      "rejects student principals",
      "replays an existing idempotent command intent",
      "rejects unsafe drafts",
      "registrySaveAllowed: true",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:workflow-plugin-draft-intent": "node tools/workflow-plugin-draft-intent-audit.mjs --out reports/workflow-plugin-draft-intent.current.json",
      },
    }),
    qualityGate: "Workflow plugin draft intent runtime audit",
    rootWorkflowCoverage: [
      "workflowPluginDraftIntent",
      "workflow-plugin-draft-intent.current.json",
      "[\"workflowPluginDraftIntent\", \"READY\"]",
    ].join("\n"),
    verifyStructure: [
      "workflow-plugin-draft-intent-runtime.mjs",
      "workflow-plugin-draft-intent-runtime.test.mjs",
      "workflow-plugin-draft-intent-audit.mjs",
      "workflow-plugin-draft-intent-audit.test.mjs",
      "0228-workflow-plugin-draft-command-intent-runtime.md",
    ].join("\n"),
  };
}

function pluginDraft() {
  return {
    schemaVersion: "2026-05-30.workflow-plugin.draft.v1",
    draftId: "plugin_draft_retry_failed_archive_export",
    artifactKind: "PLUGIN",
    capabilityKind: "SKILL",
    origin: "TASK_FAILURE_LEARNING",
    status: "DRAFT",
    userIntent: "Prevent repeated archive export failures by adding a validation plugin.",
    generatedBy: {
      agentKind: "DEVELOPMENT_AGENT",
      modelRef: "configured-plugin-generator",
    },
    failureContext: {
      taskFailureId: "task_failure_archive_export_timeout",
      preventionRule: "Validate export size and split large archive batches before running the task.",
    },
    generatedFiles: [
      {
        path: "plugins/archive-export-guard/plugin.ts",
        language: "typescript",
        role: "ENTRYPOINT",
        contentRef: "sha256:plugin-entrypoint-placeholder",
      },
    ],
    executionMode: "DRY_RUN_ONLY",
    sandboxRequired: true,
    humanApprovalRequired: true,
    allowedHostAccess: "NONE",
    registrySaveAllowed: false,
  };
}
