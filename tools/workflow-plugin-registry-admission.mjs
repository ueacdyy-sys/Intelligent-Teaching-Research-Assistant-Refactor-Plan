import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ADMISSION_SCHEMA_VERSION = "2026-05-30.workflow-plugin.registry-admission.v1";
const REGISTRY_ENTRY_SCHEMA_VERSION = "2026-05-30.workflow-plugin.registry-entry.v1";

export function admitWorkflowPluginRegistryEntry(input) {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const issues = validateAdmissionInput(input);
  const registryEntry = issues.length === 0 ? buildRegistryEntry(input, generatedAt) : null;
  return {
    schemaVersion: ADMISSION_SCHEMA_VERSION,
    generatedAt,
    decision: issues.length === 0 ? "ALLOW_SAVE" : "BLOCK_SAVE",
    issues,
    registryEntry,
  };
}

export class JsonlWorkflowPluginRegistryStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  append(entry) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`);
  }

  readAll() {
    if (!fs.existsSync(this.filePath)) return [];
    return fs.readFileSync(this.filePath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
}

function validateAdmissionInput(input) {
  const issues = [];
  const draft = input.draft ?? {};
  const sandboxRun = input.sandboxRun ?? {};
  const approval = input.approval ?? {};

  requireValue(issues, draft.draftId, "draftId is required");
  requireValue(issues, sandboxRun.runId, "sandbox runId is required");
  requireValue(issues, approval.approvalId, "approvalId is required");

  if (sandboxRun.draftId !== draft.draftId) {
    issues.push("sandbox draftId must match draft draftId");
  }
  if (approval.draftId !== draft.draftId) {
    issues.push("approval draftId must match draft draftId");
  }
  if (approval.sandboxRunId !== sandboxRun.runId) {
    issues.push("approval sandboxRunId must match sandbox runId");
  }
  if (draft.executionMode !== "DRY_RUN_ONLY" || draft.sandboxRequired !== true || draft.humanApprovalRequired !== true) {
    issues.push("draft must remain dry-run with sandbox and human approval required");
  }
  if (sandboxRun.status !== "PASS") {
    issues.push("sandbox run must pass before registry save");
  }
  if (sandboxRun.executedInSandbox !== true) {
    issues.push("sandbox run must execute in sandbox");
  }
  if (sandboxRun.noHostWrite !== true) {
    issues.push("sandbox run must not write to host");
  }
  if (sandboxRun.networkPolicy !== "DEFAULT_DENY") {
    issues.push("sandbox network policy must be default-deny");
  }
  if (approval.decision !== "APPROVED" || approval.registrySaveDecision !== "ALLOW_SAVE") {
    issues.push("approval must allow registry save");
  }
  if (approval.performanceReviewed !== true || approval.effectReviewed !== true) {
    issues.push("approval must include performance and effect review");
  }

  return issues;
}

function buildRegistryEntry(input, generatedAt) {
  const draft = input.draft;
  const sandboxRun = input.sandboxRun;
  const approval = input.approval;
  return {
    schemaVersion: REGISTRY_ENTRY_SCHEMA_VERSION,
    registryEntryId: input.registryEntryId ?? `registry_${draft.draftId}`,
    draftId: draft.draftId,
    sandboxRunId: sandboxRun.runId,
    approvalId: approval.approvalId,
    artifactKind: draft.artifactKind,
    capabilityKind: draft.capabilityKind,
    name: input.name ?? titleFromIntent(draft.userIntent),
    version: input.version ?? "0.1.0",
    status: "ACTIVE",
    executionMode: "DRY_RUN_ONLY",
    localExecutionEnabled: false,
    rollbackPlan: input.rollbackPlan ?? "Disable this registry entry and keep the generated draft plus sandbox evidence for review.",
    provenance: {
      origin: draft.origin,
      generatedAt,
      approvedAt: approval.reviewedAt,
    },
  };
}

function requireValue(issues, value, message) {
  if (typeof value !== "string" || value.length === 0) {
    issues.push(message);
  }
}

function titleFromIntent(value) {
  if (typeof value !== "string" || value.trim().length === 0) return "Generated Workflow Plugin";
  return value.trim().slice(0, 80);
}

function loadCurrentInputs(root) {
  return {
    draft: loadJson(root, "contracts/workflow/workflow-draft.example.json"),
    sandboxRun: loadJson(root, "contracts/workflow/workflow-plugin-sandbox-run.example.json"),
    approval: loadJson(root, "contracts/workflow/workflow-plugin-approval.example.json"),
    registryEntryId: "workflow_registry_lesson_archive_review",
    name: "Lesson Archive Review",
    version: "0.1.0",
  };
}

function loadJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  return {
    outPath: outIndex === -1 ? undefined : argv[outIndex + 1],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = admitWorkflowPluginRegistryEntry(loadCurrentInputs(process.cwd()));
    if (args.outPath) {
      fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
      fs.writeFileSync(args.outPath, `${JSON.stringify(result, null, 2)}\n`);
    }
    console.log(`Workflow Plugin registry admission: ${result.decision}`);
    for (const issue of result.issues) {
      console.log(`- ${issue}`);
    }
    process.exit(result.decision === "ALLOW_SAVE" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
