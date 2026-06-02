import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  auditWorkflowPluginRuntimeSlo,
  formatWorkflowPluginRuntimeSloAudit,
} from "./workflow-plugin-runtime-slo-audit.mjs";

const root = process.cwd();

describe("workflow plugin runtime SLO audit", () => {
  it("passes the current dry-run workflow/plugin runtime chain", () => {
    const report = auditWorkflowPluginRuntimeSlo(currentInputs({ targetP99Ms: 50 }), {
      now: clock([0, 10, 10, 30, 30, 60, 60, 100]),
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "WORKFLOW_PLUGIN_RUNTIME_SLO");
    assert.equal(report.runtimeSlo.p95Ms, 40);
    assert.equal(report.runtimeSlo.p99Ms, 40);
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.deepEqual(report.runtimeSlo.steps.map((step) => step.name), [
      "contract_flow",
      "registry_admission",
      "approved_revision_feedback",
      "failed_sandbox_revision_feedback",
    ]);
    assert.equal(report.safetyInvariants.localGeneratedCodeExecuted, false);
    assert.equal(report.safetyInvariants.localExecutionEnabled, false);
    assert.equal(report.safetyInvariants.failedSandboxRevisionRequired, true);
    assert.match(formatWorkflowPluginRuntimeSloAudit(report), /Workflow Plugin runtime SLO: READY/u);
  });

  it("fails when the runtime chain exceeds the P99 target", () => {
    const report = auditWorkflowPluginRuntimeSlo(currentInputs({ targetP99Ms: 25 }), {
      now: clock([0, 10, 10, 30, 30, 60, 60, 100]),
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.p99_within_target").passed, false);
  });

  it("fails when sandbox evidence would write to the host", () => {
    const inputs = currentInputs({ targetP99Ms: 50 });
    inputs.sandboxRun.noHostWrite = false;
    inputs.flow.examples.sandboxRun.noHostWrite = false;

    const report = auditWorkflowPluginRuntimeSlo(inputs, {
      now: clock([0, 10, 10, 30, 30, 60, 60, 100]),
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.runtimeSlo.totalErrors, 1);
    assert.equal(report.findings.find((finding) => finding.id === "safety.sandbox_boundaries").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "registry.admission_allowed").passed, false);
  });

  it("fails if an approved path unexpectedly asks for revision", () => {
    const inputs = currentInputs({ targetP99Ms: 50 });
    inputs.approval.decision = "REVISION_REQUESTED";
    inputs.approval.registrySaveDecision = "BLOCK_SAVE";
    inputs.approval.comments = "Needs another human pass.";

    const report = auditWorkflowPluginRuntimeSlo(inputs, {
      now: clock([0, 10, 10, 30, 30, 60, 60, 100]),
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "revision.approved_path_clean").passed, false);
  });
});

function currentInputs(overrides = {}) {
  const draft = loadJson("contracts/workflow/workflow-draft.example.json");
  const pluginDraft = loadJson("contracts/workflow/plugin-draft.example.json");
  const sandboxRun = loadJson("contracts/workflow/workflow-plugin-sandbox-run.example.json");
  const approval = loadJson("contracts/workflow/workflow-plugin-approval.example.json");
  const registryEntry = loadJson("contracts/workflow/workflow-plugin-registry-entry.example.json");
  return {
    targetP99Ms: overrides.targetP99Ms,
    draft,
    sandboxRun,
    approval,
    flow: {
      draftSchema: loadJson("contracts/workflow/workflow-plugin-draft.schema.json"),
      sandboxRunSchema: loadJson("contracts/workflow/workflow-plugin-sandbox-run.schema.json"),
      approvalSchema: loadJson("contracts/workflow/workflow-plugin-approval.schema.json"),
      registryEntrySchema: loadJson("contracts/workflow/workflow-plugin-registry-entry.schema.json"),
      examples: {
        workflowDraft: draft,
        pluginDraft,
        sandboxRun,
        approval,
        registryEntry,
      },
    },
  };
}

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function clock(values) {
  const ticks = [...values];
  return () => {
    assert(ticks.length > 0, "test clock exhausted");
    return ticks.shift();
  };
}
