import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  auditWorkflowPluginFlowContracts,
  formatWorkflowPluginFlowAudit,
} from "./workflow-plugin-flow-audit.mjs";

const root = process.cwd();

function loadCurrentInputs() {
  return {
    draftSchema: loadJson("contracts/workflow/workflow-plugin-draft.schema.json"),
    sandboxRunSchema: loadJson("contracts/workflow/workflow-plugin-sandbox-run.schema.json"),
    approvalSchema: loadJson("contracts/workflow/workflow-plugin-approval.schema.json"),
    registryEntrySchema: loadJson("contracts/workflow/workflow-plugin-registry-entry.schema.json"),
    examples: {
      workflowDraft: loadJson("contracts/workflow/workflow-draft.example.json"),
      pluginDraft: loadJson("contracts/workflow/plugin-draft.example.json"),
      sandboxRun: loadJson("contracts/workflow/workflow-plugin-sandbox-run.example.json"),
      approval: loadJson("contracts/workflow/workflow-plugin-approval.example.json"),
      registryEntry: loadJson("contracts/workflow/workflow-plugin-registry-entry.example.json"),
    },
  };
}

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

describe("workflow plugin flow audit", () => {
  it("passes the current generated workflow/plugin contract flow", () => {
    const report = auditWorkflowPluginFlowContracts(loadCurrentInputs());

    assert.equal(report.readiness, "READY");
    assert.match(formatWorkflowPluginFlowAudit(report), /Workflow Plugin flow: READY/);
  });

  it("fails when plugin drafts cannot originate from task-failure learning", () => {
    const inputs = loadCurrentInputs();
    const draftSchema = clone(inputs.draftSchema);
    draftSchema.properties.origin.enum = ["USER_REQUEST"];

    const report = auditWorkflowPluginFlowContracts({ ...inputs, draftSchema });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "draft.origin.task_failure_learning").passed, false);
  });

  it("fails when sandbox runs can write to the host", () => {
    const inputs = loadCurrentInputs();
    const sandboxRunSchema = clone(inputs.sandboxRunSchema);
    sandboxRunSchema.properties.noHostWrite.const = false;

    const report = auditWorkflowPluginFlowContracts({ ...inputs, sandboxRunSchema });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "sandbox.no_host_write").passed, false);
  });

  it("fails when registry entries can skip sandbox and approval references", () => {
    const inputs = loadCurrentInputs();
    const registryEntrySchema = clone(inputs.registryEntrySchema);
    registryEntrySchema.required = registryEntrySchema.required.filter((field) => (
      field !== "sandboxRunId" && field !== "approvalId"
    ));

    const report = auditWorkflowPluginFlowContracts({ ...inputs, registryEntrySchema });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "registry.requires_sandbox_and_approval").passed, false);
  });

  it("fails when the plugin example is not a generated self-evolution artifact", () => {
    const inputs = loadCurrentInputs();
    const examples = clone(inputs.examples);
    examples.pluginDraft.origin = "USER_REQUEST";
    examples.pluginDraft.artifactKind = "WORKFLOW";

    const report = auditWorkflowPluginFlowContracts({ ...inputs, examples });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "examples.plugin_failure_learning").passed, false);
  });
});
