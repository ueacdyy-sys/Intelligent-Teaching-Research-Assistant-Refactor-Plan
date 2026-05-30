import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  buildWorkflowPluginRevisionRequest,
} from "./workflow-plugin-revision-feedback.mjs";

const root = process.cwd();

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function loadCurrentInputs() {
  return {
    draft: loadJson("contracts/workflow/workflow-draft.example.json"),
    sandboxRun: loadJson("contracts/workflow/workflow-plugin-sandbox-run.example.json"),
    approval: loadJson("contracts/workflow/workflow-plugin-approval.example.json"),
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

describe("workflow plugin revision feedback", () => {
  it("builds a revision request from failed sandbox evidence", () => {
    const inputs = loadCurrentInputs();
    const sandboxRun = clone(inputs.sandboxRun);
    sandboxRun.status = "FAIL";
    sandboxRun.feedback = ["contract test failed: missing archive item guard"];

    const result = buildWorkflowPluginRevisionRequest({
      draft: inputs.draft,
      sandboxRun,
      generatedAt: "2026-05-30T13:20:00Z",
    });

    assert.equal(result.revisionDecision, "REVISION_REQUIRED");
    assert.equal(result.saveBlocked, true);
    assert.equal(result.draftId, inputs.draft.draftId);
    assert.equal(result.sourceKind, "SANDBOX_FAILURE");
    assert.equal(result.sourceEvidenceId, sandboxRun.runId);
    assert(result.issues.includes("contract test failed: missing archive item guard"));
  });

  it("builds a revision request from human revision approval", () => {
    const inputs = loadCurrentInputs();
    const approval = clone(inputs.approval);
    approval.decision = "REVISION_REQUESTED";
    approval.registrySaveDecision = "BLOCK_SAVE";
    approval.comments = "Improve effect on large classes before save.";

    const result = buildWorkflowPluginRevisionRequest({
      draft: inputs.draft,
      sandboxRun: inputs.sandboxRun,
      approval,
    });

    assert.equal(result.revisionDecision, "REVISION_REQUIRED");
    assert.equal(result.sourceKind, "HUMAN_REVISION_REQUEST");
    assert.equal(result.sourceEvidenceId, approval.approvalId);
    assert(result.issues.includes("Improve effect on large classes before save."));
  });

  it("does not request revision when sandbox and approval are both save-ready", () => {
    const result = buildWorkflowPluginRevisionRequest(loadCurrentInputs());

    assert.equal(result, null);
  });

  it("does not turn a rejected approval into a revision request", () => {
    const inputs = loadCurrentInputs();
    const approval = clone(inputs.approval);
    approval.decision = "REJECTED";
    approval.registrySaveDecision = "BLOCK_SAVE";
    approval.comments = "Do not save this generated artifact.";

    const result = buildWorkflowPluginRevisionRequest({
      draft: inputs.draft,
      sandboxRun: inputs.sandboxRun,
      approval,
    });

    assert.equal(result, null);
  });

  it("prefers sandbox failure before human approval feedback", () => {
    const inputs = loadCurrentInputs();
    const sandboxRun = clone(inputs.sandboxRun);
    const approval = clone(inputs.approval);
    sandboxRun.status = "FAIL";
    sandboxRun.feedback = ["sandbox failed before review"];
    approval.decision = "REVISION_REQUESTED";
    approval.comments = "human wants changes";

    const result = buildWorkflowPluginRevisionRequest({
      draft: inputs.draft,
      sandboxRun,
      approval,
    });

    assert.equal(result.sourceKind, "SANDBOX_FAILURE");
    assert.equal(result.sourceEvidenceId, sandboxRun.runId);
  });
});
