import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  JsonlWorkflowPluginRegistryStore,
  admitWorkflowPluginRegistryEntry,
} from "./workflow-plugin-registry-admission.mjs";

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

function tempPath(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`)), "registry.jsonl");
}

describe("workflow plugin registry admission", () => {
  it("allows the current approved sandboxed workflow example into the registry", () => {
    const result = admitWorkflowPluginRegistryEntry({
      ...loadCurrentInputs(),
      generatedAt: "2026-05-30T13:10:00Z",
      registryEntryId: "workflow_registry_lesson_archive_review",
      name: "Lesson Archive Review",
      version: "0.1.0",
    });

    assert.equal(result.decision, "ALLOW_SAVE");
    assert.equal(result.issues.length, 0);
    assert.equal(result.registryEntry.draftId, "workflow_draft_lesson_archive_review");
    assert.equal(result.registryEntry.executionMode, "DRY_RUN_ONLY");
    assert.equal(result.registryEntry.localExecutionEnabled, false);
  });

  it("blocks failed sandbox runs", () => {
    const inputs = loadCurrentInputs();
    const sandboxRun = clone(inputs.sandboxRun);
    sandboxRun.status = "FAIL";

    const result = admitWorkflowPluginRegistryEntry({ ...inputs, sandboxRun });

    assert.equal(result.decision, "BLOCK_SAVE");
    assert(result.issues.includes("sandbox run must pass before registry save"));
  });

  it("blocks approvals that do not allow registry save", () => {
    const inputs = loadCurrentInputs();
    const approval = clone(inputs.approval);
    approval.decision = "REVISION_REQUESTED";
    approval.registrySaveDecision = "BLOCK_SAVE";

    const result = admitWorkflowPluginRegistryEntry({ ...inputs, approval });

    assert.equal(result.decision, "BLOCK_SAVE");
    assert(result.issues.includes("approval must allow registry save"));
  });

  it("blocks mismatched draft, sandbox, and approval ids", () => {
    const inputs = loadCurrentInputs();
    const approval = clone(inputs.approval);
    approval.draftId = "different_draft";

    const result = admitWorkflowPluginRegistryEntry({ ...inputs, approval });

    assert.equal(result.decision, "BLOCK_SAVE");
    assert(result.issues.includes("approval draftId must match draft draftId"));
  });

  it("appends registry entries and reads them back in order", () => {
    const pathName = tempPath("workflow-plugin-registry");
    const store = new JsonlWorkflowPluginRegistryStore(pathName);
    const first = admitWorkflowPluginRegistryEntry({
      ...loadCurrentInputs(),
      registryEntryId: "registry_first",
      name: "First",
      version: "0.1.0",
    }).registryEntry;
    const second = { ...first, registryEntryId: "registry_second", name: "Second" };

    store.append(first);
    store.append(second);

    assert.deepEqual(store.readAll().map((entry) => entry.registryEntryId), ["registry_first", "registry_second"]);
  });
});
