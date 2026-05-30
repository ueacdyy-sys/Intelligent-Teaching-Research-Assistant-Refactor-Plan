import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REVISION_SCHEMA_VERSION = "2026-05-30.workflow-plugin.revision-request.v1";

export function buildWorkflowPluginRevisionRequest(input) {
  const draft = input.draft ?? {};
  const sandboxRun = input.sandboxRun ?? {};
  const approval = input.approval ?? {};
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  if (sandboxRun.status === "FAIL") {
    return revisionRequest({
      generatedAt,
      draftId: draft.draftId,
      sourceKind: "SANDBOX_FAILURE",
      sourceEvidenceId: sandboxRun.runId,
      issues: sandboxIssues(sandboxRun),
      recommendedActions: [
        "Revise generated files using the preserved sandbox feedback.",
        "Re-run sandbox tests before requesting human approval again.",
      ],
    });
  }

  if (approval.decision === "REVISION_REQUESTED") {
    return revisionRequest({
      generatedAt,
      draftId: draft.draftId,
      sourceKind: "HUMAN_REVISION_REQUEST",
      sourceEvidenceId: approval.approvalId,
      issues: approvalIssues(approval),
      recommendedActions: [
        "Revise generated files using the human review comments.",
        "Preserve sandbox evidence and request review only after the new run passes.",
      ],
    });
  }

  return null;
}

function revisionRequest(input) {
  return {
    schemaVersion: REVISION_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    draftId: input.draftId,
    sourceKind: input.sourceKind,
    sourceEvidenceId: input.sourceEvidenceId,
    revisionDecision: "REVISION_REQUIRED",
    saveBlocked: true,
    issues: nonEmptyList(input.issues, "revision source did not include a concrete issue"),
    recommendedActions: input.recommendedActions,
  };
}

function sandboxIssues(sandboxRun) {
  const feedback = Array.isArray(sandboxRun.feedback) ? sandboxRun.feedback.filter(Boolean) : [];
  const failedTests = Array.isArray(sandboxRun.tests)
    ? sandboxRun.tests
      .filter((test) => test.status === "FAIL")
      .map((test) => `sandbox test failed: ${test.name}`)
    : [];
  return [...feedback, ...failedTests];
}

function approvalIssues(approval) {
  if (typeof approval.comments === "string" && approval.comments.trim().length > 0) {
    return [approval.comments.trim()];
  }
  return ["human review requested revision before registry save"];
}

function nonEmptyList(values, fallback) {
  return values.length > 0 ? values : [fallback];
}

function loadCurrentInputs(root) {
  const sandboxRun = loadJson(root, "contracts/workflow/workflow-plugin-sandbox-run.example.json");
  return {
    draft: loadJson(root, "contracts/workflow/workflow-draft.example.json"),
    sandboxRun: {
      ...sandboxRun,
      status: "FAIL",
      feedback: ["contract test failed: missing archive item guard"],
    },
    generatedAt: "2026-05-30T13:20:00Z",
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
    const result = buildWorkflowPluginRevisionRequest(loadCurrentInputs(process.cwd()));
    if (args.outPath) {
      fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
      fs.writeFileSync(args.outPath, `${JSON.stringify(result, null, 2)}\n`);
    }
    console.log(`Workflow Plugin revision feedback: ${result?.revisionDecision ?? "NO_REVISION_REQUIRED"}`);
    process.exit(result ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
