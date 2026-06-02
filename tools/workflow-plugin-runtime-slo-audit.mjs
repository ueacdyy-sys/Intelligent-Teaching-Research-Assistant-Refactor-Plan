import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { auditWorkflowPluginFlowContracts } from "./workflow-plugin-flow-audit.mjs";
import { admitWorkflowPluginRegistryEntry } from "./workflow-plugin-registry-admission.mjs";
import { buildWorkflowPluginRevisionRequest } from "./workflow-plugin-revision-feedback.mjs";

const defaultOutPath = "reports/workflow-plugin-runtime-slo.current.json";
const defaultTargetP99Ms = 300;

const FLOW_JSON_FILES = {
  draftSchema: "contracts/workflow/workflow-plugin-draft.schema.json",
  sandboxRunSchema: "contracts/workflow/workflow-plugin-sandbox-run.schema.json",
  approvalSchema: "contracts/workflow/workflow-plugin-approval.schema.json",
  registryEntrySchema: "contracts/workflow/workflow-plugin-registry-entry.schema.json",
};

const FLOW_EXAMPLE_FILES = {
  workflowDraft: "contracts/workflow/workflow-draft.example.json",
  pluginDraft: "contracts/workflow/plugin-draft.example.json",
  sandboxRun: "contracts/workflow/workflow-plugin-sandbox-run.example.json",
  approval: "contracts/workflow/workflow-plugin-approval.example.json",
  registryEntry: "contracts/workflow/workflow-plugin-registry-entry.example.json",
};

export function auditWorkflowPluginRuntimeSlo(inputs, options = {}) {
  const now = options.now ?? (() => performance.now());
  const targetP99Ms = numberOrDefault(inputs.targetP99Ms, defaultTargetP99Ms);
  const steps = [];

  const flowReport = measureStep(steps, now, "contract_flow", () => {
    const result = auditWorkflowPluginFlowContracts(inputs.flow);
    if (result.readiness !== "READY") {
      throw new Error(`workflow/plugin flow audit is ${result.readiness}`);
    }
    return result;
  });

  const admission = measureStep(steps, now, "registry_admission", () => {
    const result = admitWorkflowPluginRegistryEntry({
      draft: inputs.draft,
      sandboxRun: inputs.sandboxRun,
      approval: inputs.approval,
      registryEntryId: "workflow_registry_lesson_archive_review",
      name: "Lesson Archive Review",
      version: "0.1.0",
    });
    if (result.decision !== "ALLOW_SAVE") {
      throw new Error(`registry admission ${result.decision}: ${result.issues.join(";")}`);
    }
    return result;
  });

  const approvedPathRevision = measureStep(steps, now, "approved_revision_feedback", () => {
    const result = buildWorkflowPluginRevisionRequest({
      draft: inputs.draft,
      sandboxRun: inputs.sandboxRun,
      approval: inputs.approval,
    });
    if (result !== null) {
      throw new Error("approved sandbox path unexpectedly requested revision");
    }
    return { revisionRequired: false };
  });

  const failedSandboxRevision = measureStep(steps, now, "failed_sandbox_revision_feedback", () => {
    const failedSandboxRun = {
      ...inputs.sandboxRun,
      status: "FAIL",
      feedback: ["runtime SLO negative path: sandbox failure must block registry save"],
    };
    const result = buildWorkflowPluginRevisionRequest({
      draft: inputs.draft,
      sandboxRun: failedSandboxRun,
      approval: inputs.approval,
    });
    if (result?.revisionDecision !== "REVISION_REQUIRED" || result.saveBlocked !== true) {
      throw new Error("failed sandbox path did not produce a blocking revision request");
    }
    return result;
  });

  const durations = steps.map((step) => step.durationMs);
  const p95Ms = percentile(durations, 95);
  const p99Ms = percentile(durations, 99);
  const totalErrors = steps.filter((step) => step.status !== "PASS").length;
  const safetyInvariants = buildSafetyInvariants({
    draft: inputs.draft,
    sandboxRun: inputs.sandboxRun,
    admission,
    approvedPathRevision,
    failedSandboxRevision,
  });
  const findings = buildFindings({
    flowReport,
    admission,
    safetyInvariants,
    targetP99Ms,
    p99Ms,
    totalErrors,
  });
  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";

  return {
    generatedAt: new Date().toISOString(),
    readiness,
    workloadType: "WORKFLOW_PLUGIN_RUNTIME_SLO",
    runtimeSlo: {
      targetP99Ms,
      p95Ms,
      p99Ms,
      totalErrors,
      steps,
    },
    safetyInvariants,
    findings,
    nextAction: readiness === "READY"
      ? "Use this as workflow/plugin self-evolution runtime SLO evidence while keeping generated-code execution disabled."
      : "Fix workflow/plugin runtime SLO or safety findings before promoting this root workflow beyond contract-only evidence.",
  };
}

export function formatWorkflowPluginRuntimeSloAudit(report) {
  const lines = [
    `Workflow Plugin runtime SLO: ${report.readiness}`,
    `P95/P99: ${report.runtimeSlo.p95Ms}/${report.runtimeSlo.p99Ms} ms`,
    `Errors: ${report.runtimeSlo.totalErrors}`,
    "",
    "Steps:",
  ];
  for (const step of report.runtimeSlo.steps) {
    lines.push(`- ${step.status} ${step.name}: ${step.durationMs}ms${step.error ? ` (${step.error})` : ""}`);
  }
  lines.push("", "Findings:");
  for (const finding of report.findings) {
    lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function measureStep(steps, now, name, fn) {
  const startedAt = now();
  try {
    const result = fn();
    const durationMs = roundedDuration(now() - startedAt);
    steps.push({ name, status: "PASS", durationMs, error: null });
    return result;
  } catch (error) {
    const durationMs = roundedDuration(now() - startedAt);
    steps.push({ name, status: "FAIL", durationMs, error: error.message });
    return null;
  }
}

function buildSafetyInvariants({ draft, sandboxRun, admission, approvedPathRevision, failedSandboxRevision }) {
  const registryEntry = admission?.registryEntry ?? null;
  return {
    dryRunOnly: draft?.executionMode === "DRY_RUN_ONLY" && registryEntry?.executionMode === "DRY_RUN_ONLY",
    localExecutionEnabled: registryEntry?.localExecutionEnabled ?? null,
    localGeneratedCodeExecuted: false,
    sandboxExecuted: sandboxRun?.executedInSandbox === true,
    sandboxNoHostWrite: sandboxRun?.noHostWrite === true,
    networkPolicy: sandboxRun?.networkPolicy ?? null,
    approvedPathRevisionRequired: approvedPathRevision === null ? null : approvedPathRevision.revisionRequired,
    failedSandboxRevisionRequired: failedSandboxRevision?.revisionDecision === "REVISION_REQUIRED" &&
      failedSandboxRevision?.saveBlocked === true,
  };
}

function buildFindings({ flowReport, admission, safetyInvariants, targetP99Ms, p99Ms, totalErrors }) {
  const findings = [];
  addFinding(findings, {
    id: "runtime.steps_passed",
    passed: totalErrors === 0,
    actual: totalErrors,
    expected: 0,
    remediation: "Every workflow/plugin runtime SLO dry-run audit step must pass.",
  });
  addFinding(findings, {
    id: "runtime.p99_within_target",
    passed: Number.isFinite(p99Ms) && p99Ms <= targetP99Ms,
    actual: p99Ms,
    expected: `<=${targetP99Ms}`,
    remediation: "Keep the workflow/plugin dry-run runtime chain within the target P99 before using it as root workflow SLO evidence.",
  });
  addFinding(findings, {
    id: "contract.flow_ready",
    passed: flowReport?.readiness === "READY",
    actual: flowReport?.readiness ?? "missing",
    expected: "READY",
    remediation: "Workflow/plugin contract flow must remain ready.",
  });
  addFinding(findings, {
    id: "registry.admission_allowed",
    passed: admission?.decision === "ALLOW_SAVE",
    actual: admission?.decision ?? "missing",
    expected: "ALLOW_SAVE",
    remediation: "Registry admission must pass only after sandbox and human approval evidence.",
  });
  addFinding(findings, {
    id: "safety.dry_run_only",
    passed: safetyInvariants.dryRunOnly === true,
    actual: safetyInvariants.dryRunOnly,
    expected: true,
    remediation: "Workflow/plugin registry entries must remain dry-run-only in this slice.",
  });
  addFinding(findings, {
    id: "safety.local_execution_disabled",
    passed: safetyInvariants.localExecutionEnabled === false,
    actual: safetyInvariants.localExecutionEnabled,
    expected: false,
    remediation: "Runtime SLO evidence must not enable local generated-code execution.",
  });
  addFinding(findings, {
    id: "safety.no_generated_code_execution",
    passed: safetyInvariants.localGeneratedCodeExecuted === false,
    actual: safetyInvariants.localGeneratedCodeExecuted,
    expected: false,
    remediation: "The audit may inspect contracts and examples only; it must not execute generated code.",
  });
  addFinding(findings, {
    id: "safety.sandbox_boundaries",
    passed: safetyInvariants.sandboxExecuted === true &&
      safetyInvariants.sandboxNoHostWrite === true &&
      safetyInvariants.networkPolicy === "DEFAULT_DENY",
    actual: `sandbox=${safetyInvariants.sandboxExecuted};noHostWrite=${safetyInvariants.sandboxNoHostWrite};network=${safetyInvariants.networkPolicy}`,
    expected: "sandbox=true;noHostWrite=true;network=DEFAULT_DENY",
    remediation: "Sandbox evidence must keep no-host-write and default-deny networking.",
  });
  addFinding(findings, {
    id: "revision.approved_path_clean",
    passed: safetyInvariants.approvedPathRevisionRequired === false,
    actual: safetyInvariants.approvedPathRevisionRequired,
    expected: false,
    remediation: "Approved sandbox evidence should not request revision.",
  });
  addFinding(findings, {
    id: "revision.failed_sandbox_blocks_save",
    passed: safetyInvariants.failedSandboxRevisionRequired === true,
    actual: safetyInvariants.failedSandboxRevisionRequired,
    expected: true,
    remediation: "Failed sandbox evidence must produce a blocking revision request.",
  });
  return findings;
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

function percentile(values, percentileValue) {
  const finite = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (finite.length === 0) return null;
  const index = Math.min(finite.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * finite.length) - 1));
  return finite[index];
}

function roundedDuration(value) {
  return Number(Math.max(0, value).toFixed(2));
}

function numberOrDefault(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return String(value);
}

function loadCurrentInputs(root) {
  const flow = {
    ...Object.fromEntries(Object.entries(FLOW_JSON_FILES).map(([key, relativePath]) => [
      key,
      loadJson(root, relativePath),
    ])),
    examples: Object.fromEntries(Object.entries(FLOW_EXAMPLE_FILES).map(([key, relativePath]) => [
      key,
      loadJson(root, relativePath),
    ])),
  };
  return {
    targetP99Ms: defaultTargetP99Ms,
    flow,
    draft: loadJson(root, "contracts/workflow/workflow-draft.example.json"),
    sandboxRun: loadJson(root, "contracts/workflow/workflow-plugin-sandbox-run.example.json"),
    approval: loadJson(root, "contracts/workflow/workflow-plugin-approval.example.json"),
  };
}

function loadJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function writeReport(root, reportPath, report) {
  const absolute = path.join(root, reportPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  const targetIndex = argv.indexOf("--target-p99-ms");
  return {
    outPath: outIndex === -1 ? defaultOutPath : argv[outIndex + 1],
    targetP99Ms: targetIndex === -1 ? defaultTargetP99Ms : Number(argv[targetIndex + 1]),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const inputs = {
      ...loadCurrentInputs(process.cwd()),
      targetP99Ms: args.targetP99Ms,
    };
    const report = auditWorkflowPluginRuntimeSlo(inputs);
    writeReport(process.cwd(), args.outPath, report);
    console.log(formatWorkflowPluginRuntimeSloAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
