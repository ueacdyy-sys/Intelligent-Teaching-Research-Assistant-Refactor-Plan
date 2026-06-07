import fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { recordWorkflowPluginSandboxRunResult } from "./workflow-plugin-sandbox-result-runtime.mjs";

const defaultOutPath = "reports/workflow-plugin-sandbox-result.current.json";
const sourceFiles = {
  sandboxRunSchema: "contracts/workflow/workflow-plugin-sandbox-run.schema.json",
  workflowDraftExample: "contracts/workflow/workflow-draft.example.json",
  sandboxRunExample: "contracts/workflow/workflow-plugin-sandbox-run.example.json",
  revisionFeedback: "tools/workflow-plugin-revision-feedback.mjs",
  runtime: "tools/workflow-plugin-sandbox-result-runtime.mjs",
  runtimeTest: "tools/workflow-plugin-sandbox-result-runtime.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
};

const forbiddenRuntimeClaims = [
  "admitWorkflowPluginRegistryEntry",
  "ALLOW_SAVE",
  "registrySaveAllowed: true",
  "workflowPublishAllowed: true",
  "executionCandidateAllowed: true",
  "localGeneratedCodeExecuted: true",
  "execSync(",
  "spawn(",
  "execFile(",
];

export function auditWorkflowPluginSandboxResultRuntime(inputs, options = {}) {
  const findings = [];
  const sandboxRunSchema = parseJson(inputs.sandboxRunSchema, {});
  const workflowDraftExample = parseJson(inputs.workflowDraftExample, {});
  const sandboxRunExample = parseJson(inputs.sandboxRunExample, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const passProbe = runRuntimeProbe(workflowDraftExample, sandboxRunExample, "PASS", options);
  const failProbe = runRuntimeProbe(workflowDraftExample, failingSandboxRun(sandboxRunExample), "FAIL", options);

  addFinding(findings, {
    id: "sandbox_contract.default_deny_no_host_write",
    passed: sandboxRunSchema.properties?.executedInSandbox?.const === true &&
      sandboxRunSchema.properties?.noHostWrite?.const === true &&
      sandboxRunSchema.properties?.networkPolicy?.const === "DEFAULT_DENY" &&
      hasAll(requiredFields(sandboxRunSchema), ["tests", "performanceSummary", "feedback"]),
    actual: summarizeSandboxContract(sandboxRunSchema),
    expected: "executedInSandbox=true, noHostWrite=true, networkPolicy=DEFAULT_DENY, tests/performance/feedback required",
    remediation: "Sandbox result evidence must prove isolation before it can feed human review.",
  });

  addFinding(findings, {
    id: "runtime.requires_internal_recorder_and_evidence",
    passed: includesAll(inputs.runtime, [
      "authorizeSandboxRecorder",
      "SERVICE",
      "AGENT_INTERNAL",
      "ADMIN_SYSTEM",
      "requiredEvidenceFields",
      "draftIntentRecordRef",
      "sandboxManifestRef",
      "guardrailResultRef",
      "routeDecisionRef",
      "rollbackPlanRef",
      "auditTraceRef",
      "idempotencyKey",
    ]),
    actual: "runtime recorder and evidence symbols scanned",
    expected: "internal service/admin recorder plus sandbox manifest, context, guardrail, route, rollback, audit, and idempotency evidence",
    remediation: "Sandbox results should not be accepted from students, remote channels, or untraceable callers.",
  });

  addFinding(findings, {
    id: "runtime.append_only_no_registry_publish",
    passed: includesAll(inputs.runtime, [
      "appendCommandIntent",
      "fs.appendFileSync",
      "findExistingRecordByIdempotencyKey",
      "workflow-command-log",
      "registrySaveAllowed: false",
      "workflowPublishAllowed: false",
      "executionCandidateAllowed: false",
      "localGeneratedCodeExecuted: false",
      "humanApprovalRequiredBeforeRegistry: true",
    ]) && !hasForbiddenRuntimeClaim(inputs.runtime),
    actual: summarizePresence(inputs.runtime, ["appendFileSync", "ALLOW_SAVE", "registrySaveAllowed: true", "execSync("]),
    expected: "append-only sandbox evidence; no registry save, publish, local execution, or execution candidate",
    remediation: "This runtime records sandbox results only; registry admission remains a later human-approved gate.",
  });

  addFinding(findings, {
    id: "runtime.revision_feedback_wired",
    passed: inputs.runtime.includes("buildWorkflowPluginRevisionRequest") &&
      inputs.revisionFeedback.includes("revisionDecision") &&
      inputs.revisionFeedback.includes("REVISION_REQUIRED"),
    actual: summarizePresence(inputs.runtime + inputs.revisionFeedback, [
      "buildWorkflowPluginRevisionRequest",
      "revisionDecision",
      "REVISION_REQUIRED",
    ]),
    expected: "failing sandbox results use the revision feedback builder and block save",
    remediation: "Wire failed sandbox results into revision feedback instead of silently recording failures.",
  });

  addFinding(findings, {
    id: "runtime.pass_probe_requires_human_review",
    passed: passProbe.status === "PASS" &&
      passProbe.result?.status === "SANDBOX_PASSED_REVIEW_REQUIRED" &&
      passProbe.result?.revisionRequired === false &&
      passProbe.result?.boundary?.registrySaveAllowed === false &&
      passProbe.logRecordCount === 1,
    actual: passProbe.status === "PASS"
      ? `status=${passProbe.result.status};revision=${passProbe.result.revisionRequired};records=${passProbe.logRecordCount};registry=${passProbe.result.boundary.registrySaveAllowed}`
      : passProbe.error,
    expected: "passing sandbox result is recorded and still requires human review before registry save",
    remediation: "Passing sandbox evidence must not bypass human performance/effect review.",
  });

  addFinding(findings, {
    id: "runtime.fail_probe_blocks_save_with_revision",
    passed: failProbe.status === "PASS" &&
      failProbe.result?.status === "SANDBOX_FAILED_REVISION_REQUIRED" &&
      failProbe.result?.revisionRequired === true &&
      failProbe.result?.revisionRequest?.saveBlocked === true &&
      failProbe.logRecordCount === 1,
    actual: failProbe.status === "PASS"
      ? `status=${failProbe.result.status};revision=${failProbe.result.revisionRequired};saveBlocked=${failProbe.result.revisionRequest?.saveBlocked};records=${failProbe.logRecordCount}`
      : failProbe.error,
    expected: "failing sandbox result creates blocking revision feedback",
    remediation: "Failed sandbox tests must produce revision feedback instead of moving toward registry save.",
  });

  addFinding(findings, {
    id: "tests.cover_safety_and_idempotency_paths",
    passed: includesAll(inputs.runtimeTest, [
      "records a failing sandbox result",
      "rejects non-service principals",
      "rejects sandbox evidence that wrote to the host",
      "replays an existing idempotent sandbox result",
    ]),
    actual: "runtime test negative paths scanned",
    expected: "failed sandbox, non-service recorder, host write rejection, and idempotency replay are tested",
    remediation: "Keep sandbox failure and authorization regressions covered before adding any real execution runner.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime_audit",
    passed: packageJson.scripts?.["audit:workflow-plugin-sandbox-result"]?.includes("workflow-plugin-sandbox-result-audit.mjs") &&
      inputs.qualityGate.includes("Workflow plugin sandbox result runtime audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + inputs.qualityGate, [
      "audit:workflow-plugin-sandbox-result",
      "Workflow plugin sandbox result runtime audit",
    ]),
    expected: "npm script and strict quality command include workflow plugin sandbox result audit",
    remediation: "Add this runtime audit to the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_sandbox_result_report",
    passed: includesAll(inputs.rootWorkflowCoverage, [
      "workflowPluginSandboxResult",
      "workflow-plugin-sandbox-result.current.json",
      "[\"workflowPluginSandboxResult\", \"READY\"]",
    ]),
    actual: summarizePresence(inputs.rootWorkflowCoverage, ["workflowPluginSandboxResult", "workflow-plugin-sandbox-result.current.json"]),
    expected: "workflow_plugin_self_evolution root coverage requires sandbox result runtime report",
    remediation: "Root workflow coverage should include the sandbox result runtime evidence.",
  });

  addFinding(findings, {
    id: "quality.structure_tracks_slice",
    passed: includesAll(inputs.verifyStructure, [
      "workflow-plugin-sandbox-result-runtime.mjs",
      "workflow-plugin-sandbox-result-runtime.test.mjs",
      "workflow-plugin-sandbox-result-audit.mjs",
      "workflow-plugin-sandbox-result-audit.test.mjs",
      "0229-workflow-plugin-sandbox-result-runtime.md",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires runtime, audit, tests, and SDD",
    remediation: "Add the sandbox result slice to structure verification.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "WORKFLOW_PLUGIN_SANDBOX_RESULT_RUNTIME",
    commandPort: "WorkflowSandboxCommandPort.recordWorkflowPluginSandboxRunResult",
    boundary: {
      passingStatus: "SANDBOX_PASSED_REVIEW_REQUIRED",
      failingStatus: "SANDBOX_FAILED_REVISION_REQUIRED",
      registrySaveAllowed: false,
      workflowPublishAllowed: false,
      executionCandidateAllowed: false,
      localGeneratedCodeExecuted: false,
      humanApprovalRequiredBeforeRegistry: true,
    },
    runtimeProbes: {
      pass: passProbe,
      fail: failProbe,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as workflow/plugin sandbox result runtime evidence; next slice can connect human performance/effect approval without enabling registry execution."
      : "Fix sandbox result runtime boundaries before adding human approval or registry admission runtime paths.",
  };
}

export function formatWorkflowPluginSandboxResultAudit(report) {
  const lines = [
    `Workflow plugin sandbox result runtime: ${report.readiness}`,
    `Command port: ${report.commandPort}`,
    "",
    "Findings:",
  ];
  for (const finding of report.findings) {
    lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function runRuntimeProbe(draft, sandboxRun, scenario, options = {}) {
  try {
    const commandLogPath = path.join(
      mkdtempSync(path.join(tmpdir(), `workflow-plugin-sandbox-result-${scenario.toLowerCase()}-`)),
      "workflow-plugin-sandbox-results.jsonl",
    );
    const result = recordWorkflowPluginSandboxRunResult({
      principal: {
        principalId: "workflow_sandbox_runner_audit",
        role: "SERVICE",
        subjectType: "SERVICE",
        entryPoint: "AGENT_INTERNAL",
        scopes: ["AGENT_COMMAND_SUBMIT"],
        requiresHarnessApproval: false,
        sessionId: "workflow_sandbox_audit_session",
      },
      draft,
      sandboxRun,
      draftIntentRecordRef: "workflow-draft-intent:audit-workflow-draft",
      sandboxManifestRef: "sandbox-manifest:audit-default-deny",
      sharedContextRef: "shared-context:audit-workflow-sandbox-result",
      guardrailResultRef: "guardrail:audit-workflow-sandbox-result",
      routeDecisionRef: "route:audit-workflow-sandbox-result",
      inputHash: `sha256:audit-workflow-sandbox-result-${scenario.toLowerCase()}`,
      outputSummary: `Audit ${scenario} sandbox result recorded for review.`,
      rollbackPlanRef: "rollback:audit-workflow-sandbox-result",
      auditTraceRef: "audit:audit-workflow-sandbox-result",
      idempotencyKey: `audit-workflow-sandbox-result-${scenario.toLowerCase()}`,
    }, {
      commandLogPath,
      generatedAt: options.generatedAt ?? "2026-06-05T01:00:00.000Z",
    });
    const logRecordCount = fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).filter(Boolean).length;
    return { status: "PASS", result, logRecordCount };
  } catch (error) {
    return { status: "FAIL", error: error.message };
  }
}

function failingSandboxRun(sandboxRun) {
  return {
    ...sandboxRun,
    runId: `${sandboxRun.runId}_fail`,
    status: "FAIL",
    tests: Array.isArray(sandboxRun.tests) && sandboxRun.tests.length > 0
      ? sandboxRun.tests.map((test, index) => index === 0 ? { ...test, status: "FAIL" } : test)
      : [{ name: "generated contract test", status: "FAIL", durationMs: 1, logRef: "reports/workflow-plugin/sandbox-fail.log" }],
    feedback: ["Sandbox failure blocked registry save."],
  };
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => [
    key,
    fs.readFileSync(path.join(root, relativePath), "utf8"),
  ]));
}

function writeReport(root, reportPath, report) {
  const absolute = path.join(root, reportPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  return {
    outPath: outIndex === -1 ? defaultOutPath : argv[outIndex + 1],
  };
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function summarizeSandboxContract(schema = {}) {
  return [
    `executed=${stringifyScalar(schema.properties?.executedInSandbox?.const)}`,
    `noHostWrite=${stringifyScalar(schema.properties?.noHostWrite?.const)}`,
    `network=${stringifyScalar(schema.properties?.networkPolicy?.const)}`,
    `required=${requiredFields(schema).filter((field) => ["tests", "performanceSummary", "feedback"].includes(field)).join(",")}`,
  ].join(";");
}

function summarizePresence(text = "", needles = []) {
  return needles.map((needle) => `${needle}=${text.includes(needle)}`).join(";");
}

function requiredFields(schema = {}) {
  return Array.isArray(schema.required) ? schema.required : [];
}

function hasAll(values = [], required = []) {
  return required.every((item) => values.includes(item));
}

function includesAll(text = "", needles = []) {
  return needles.every((needle) => text.includes(needle));
}

function hasForbiddenRuntimeClaim(text = "") {
  return forbiddenRuntimeClaims.some((claim) => text.includes(claim));
}

function addFinding(findings, finding) {
  findings.push({
    id: finding.id,
    passed: Boolean(finding.passed),
    severity: finding.passed ? "info" : "error",
    actual: finding.actual ?? null,
    expected: finding.expected,
    remediation: finding.remediation,
  });
}

function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return String(value);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = auditWorkflowPluginSandboxResultRuntime(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatWorkflowPluginSandboxResultAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
