import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_ACTIONS = ["FILE_READ", "FILE_WRITE", "PROCESS_START", "BROWSER_NAVIGATE"];
const REQUIRED_DECISION_OUTCOMES = ["ALLOW_DRY_RUN", "APPROVAL_REQUIRED", "DENY"];
const EXECUTION_DISABLED_REASON = "real local execution is disabled by current SDD";
const FUTURE_SDD_PRECONDITION = "future SDD must explicitly enable execution candidates";

const HARNESS_JSON_FILES = {
  permissionManifest: "contracts/harness/permission-manifest.current.json",
  auditEvidenceSchema: "contracts/harness/audit-evidence.schema.json",
  approvalArtifactSchema: "contracts/harness/approval-artifact.schema.json",
  approvalDecisionSchema: "contracts/harness/approval-decision.schema.json",
  approvalDecisionCorrelationSchema: "contracts/harness/approval-decision-correlation.schema.json",
  approvalQueueSnapshotSchema: "contracts/harness/approval-queue-snapshot.schema.json",
  executionCandidateViewSchema: "contracts/harness/execution-candidate-view.schema.json",
};

const HARNESS_RUST_FILES = [
  "services/agent-harness/src/lib.rs",
  "services/agent-harness/src/approval_decision.rs",
  "services/agent-harness/src/approval_correlation.rs",
  "services/agent-harness/src/approval_queue.rs",
  "services/agent-harness/src/execution_candidate.rs",
];

export function auditAgentHarnessFlowContracts(inputs) {
  const findings = [];
  const permissionManifest = inputs.permissionManifest ?? {};
  const auditEvidenceSchema = inputs.auditEvidenceSchema ?? {};
  const approvalArtifactSchema = inputs.approvalArtifactSchema ?? {};
  const approvalDecisionSchema = inputs.approvalDecisionSchema ?? {};
  const approvalDecisionCorrelationSchema = inputs.approvalDecisionCorrelationSchema ?? {};
  const approvalQueueSnapshotSchema = inputs.approvalQueueSnapshotSchema ?? {};
  const executionCandidateViewSchema = inputs.executionCandidateViewSchema ?? {};
  const rustFiles = inputs.rustFiles ?? {};

  addFinding(findings, {
    id: "manifest.schema_version",
    passed: permissionManifest.schemaVersion === "2026-05-29.agent-harness.permission-manifest.v1",
    actual: permissionManifest.schemaVersion,
    expected: "2026-05-29.agent-harness.permission-manifest.v1",
    remediation: "Keep the Agent Harness permission manifest on the current v1 schema.",
  });

  addFinding(findings, {
    id: "manifest.default_deny",
    passed: permissionManifest.defaultDecision === "DENY",
    actual: permissionManifest.defaultDecision,
    expected: "DENY",
    remediation: "Local control must remain default-deny unless a later SDD changes the safety model.",
  });

  const fileRules = Array.isArray(permissionManifest.fileRules) ? permissionManifest.fileRules : [];
  addFinding(findings, {
    id: "manifest.file_dry_run_rules",
    passed: fileRules.some((rule) => hasAll(rule.actions, ["FILE_READ", "FILE_WRITE"])),
    actual: summarizeRuleCount(fileRules),
    expected: "at least one FILE_READ + FILE_WRITE dry-run rule",
    remediation: "Keep a bounded file dry-run rule for the refactor workspace.",
  });

  const processRules = Array.isArray(permissionManifest.processRules) ? permissionManifest.processRules : [];
  addFinding(findings, {
    id: "manifest.process_dry_run_only",
    passed: processRules.some((rule) => rule.mode === "DRY_RUN_ONLY"),
    actual: processRules.map((rule) => rule.mode).join(","),
    expected: "DRY_RUN_ONLY",
    remediation: "Process rules must remain dry-run-only before real execution is explicitly enabled.",
  });

  const browserRules = Array.isArray(permissionManifest.browserRules) ? permissionManifest.browserRules : [];
  addFinding(findings, {
    id: "manifest.browser_local_origin",
    passed: browserRules.some((rule) => String(rule.origin ?? "").startsWith("http://127.0.0.1")),
    actual: browserRules.map((rule) => rule.origin).join(","),
    expected: "local browser origin rule",
    remediation: "Keep a bounded local browser dry-run origin for Harness tests.",
  });

  addFinding(findings, {
    id: "evidence.required_boundary_fields",
    passed: hasAll(requiredFields(auditEvidenceSchema), [
      "principalId",
      "sessionId",
      "action",
      "target",
      "outcome",
      "dryRun",
      "manifestSchemaVersion",
    ]),
    actual: requiredFields(auditEvidenceSchema).join(","),
    expected: "principal/session/action/target/outcome/dryRun/manifestSchemaVersion",
    remediation: "Audit evidence must keep enough fields for later rollback and incident review.",
  });

  addFinding(findings, {
    id: "evidence.decision_vocabulary",
    passed: hasAll(enumValues(auditEvidenceSchema, "outcome"), REQUIRED_DECISION_OUTCOMES),
    actual: enumValues(auditEvidenceSchema, "outcome").join(","),
    expected: REQUIRED_DECISION_OUTCOMES.join(","),
    remediation: "Audit evidence must keep the same decision vocabulary as the permission evaluator.",
  });

  addFinding(findings, {
    id: "evidence.action_vocabulary",
    passed: hasAll(enumValues(auditEvidenceSchema, "action"), REQUIRED_ACTIONS),
    actual: enumValues(auditEvidenceSchema, "action").join(","),
    expected: REQUIRED_ACTIONS.join(","),
    remediation: "Audit evidence must keep file, process, and browser action kinds visible.",
  });

  addFinding(findings, {
    id: "approval.artifact.pending_only",
    passed: hasAll(requiredFields(approvalArtifactSchema), ["approvalId", "evidenceId", "status"]) &&
      hasAll(enumValues(approvalArtifactSchema, "status"), ["PENDING"]),
    actual: enumValues(approvalArtifactSchema, "status").join(","),
    expected: "PENDING",
    remediation: "Approval artifacts must remain pending review records, not execution records.",
  });

  addFinding(findings, {
    id: "approval.decision.execution_ready_false",
    passed: approvalDecisionSchema.properties?.executionReady?.const === false &&
      hasAll(requiredFields(approvalDecisionSchema), ["approvalId", "outcome", "executionReady"]),
    actual: approvalDecisionSchema.properties?.executionReady?.const,
    expected: false,
    remediation: "Approval decisions must not become execution-ready until a later SDD changes the contract.",
  });

  addFinding(findings, {
    id: "approval.correlation.execution_ready_guard",
    passed: nestedStatusEnum(approvalDecisionCorrelationSchema).includes("EXECUTION_READY_DECISION"),
    actual: nestedStatusEnum(approvalDecisionCorrelationSchema).join(","),
    expected: "EXECUTION_READY_DECISION",
    remediation: "Correlation must flag approval decisions that try to become execution-ready.",
  });

  addFinding(findings, {
    id: "approval.queue.no_execution_candidates",
    passed: approvalQueueSnapshotSchema.properties?.executionCandidateCount?.const === 0 &&
      hasAll(requiredFields(approvalQueueSnapshotSchema), ["executionCandidateCount", "executionDisabledReason"]),
    actual: approvalQueueSnapshotSchema.properties?.executionCandidateCount?.const,
    expected: 0,
    remediation: "Approval queue snapshots must stay review-only and expose zero execution candidates.",
  });

  addFinding(findings, {
    id: "execution.view.no_candidates",
    passed: executionCandidateViewSchema.properties?.candidateCount?.const === 0 &&
      executionCandidateViewSchema.properties?.candidates?.maxItems === 0,
    actual: `candidateCount=${stringifyScalar(executionCandidateViewSchema.properties?.candidateCount?.const)} maxItems=${stringifyScalar(executionCandidateViewSchema.properties?.candidates?.maxItems)}`,
    expected: "candidateCount=0 maxItems=0",
    remediation: "Execution candidate views must not expose local action candidates yet.",
  });

  addFinding(findings, {
    id: "execution.view.future_sdd_precondition",
    passed: executionCandidateViewSchema.properties?.blockedReason?.const === EXECUTION_DISABLED_REASON &&
      executionCandidateViewSchema.properties?.blockedPreconditions?.contains?.const === FUTURE_SDD_PRECONDITION,
    actual: executionCandidateViewSchema.properties?.blockedReason?.const,
    expected: EXECUTION_DISABLED_REASON,
    remediation: "The view must explicitly state that a future SDD is required before execution candidates exist.",
  });

  const libText = rustFiles["services/agent-harness/src/lib.rs"] ?? "";
  addFinding(findings, {
    id: "rust.harness_facades_present",
    passed: libText.includes("pub struct DryRunHarness") &&
      libText.includes("pub struct PersistentDryRunHarness") &&
      libText.includes("pub struct JsonlEvidenceStore") &&
      libText.includes("pub struct JsonlApprovalStore"),
    actual: summarizeRustSymbols(libText, [
      "pub struct DryRunHarness",
      "pub struct PersistentDryRunHarness",
      "pub struct JsonlEvidenceStore",
      "pub struct JsonlApprovalStore",
    ]),
    expected: "dry-run, persistent dry-run, evidence, and approval stores",
    remediation: "Keep Harness review flow behind explicit facades and append-only stores.",
  });

  const approvalDecisionText = rustFiles["services/agent-harness/src/approval_decision.rs"] ?? "";
  addFinding(findings, {
    id: "rust.approval_decision.execution_ready_false",
    passed: approvalDecisionText.includes("execution_ready: false"),
    actual: approvalDecisionText.includes("execution_ready: false"),
    expected: true,
    remediation: "Rust approval decisions must keep execution_ready false.",
  });

  const approvalQueueText = rustFiles["services/agent-harness/src/approval_queue.rs"] ?? "";
  addFinding(findings, {
    id: "rust.approval_queue.review_only",
    passed: approvalQueueText.includes("execution_candidate_count: 0") &&
      approvalQueueText.includes("approval queue is review-only; execution candidates are disabled"),
    actual: summarizeRustSymbols(approvalQueueText, [
      "execution_candidate_count: 0",
      "approval queue is review-only; execution candidates are disabled",
    ]),
    expected: "review-only queue with zero execution candidates",
    remediation: "Approval queue snapshots must not project executable local actions.",
  });

  const executionCandidateText = rustFiles["services/agent-harness/src/execution_candidate.rs"] ?? "";
  addFinding(findings, {
    id: "rust.execution_candidate.empty_projection",
    passed: executionCandidateText.includes("candidate_count: 0") &&
      executionCandidateText.includes("candidates: Vec::new()") &&
      executionCandidateText.includes(EXECUTION_DISABLED_REASON),
    actual: summarizeRustSymbols(executionCandidateText, [
      "candidate_count: 0",
      "candidates: Vec::new()",
      EXECUTION_DISABLED_REASON,
    ]),
    expected: "candidate_count: 0 + candidates: Vec::new() + disabled reason",
    remediation: "Execution candidate projection must stay empty until a later SDD explicitly enables it.",
  });

  return {
    generatedAt: new Date().toISOString(),
    readiness: findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION",
    findings,
  };
}

export function formatAgentHarnessFlowAudit(report) {
  const lines = [
    `Agent Harness flow: ${report.readiness}`,
    "",
    "Findings:",
  ];
  for (const finding of report.findings) {
    lines.push(
      `- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`,
    );
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  return lines.join("\n");
}

function loadCurrentInputs(root) {
  return {
    ...Object.fromEntries(
      Object.entries(HARNESS_JSON_FILES).map(([key, relativePath]) => [
        key,
        JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8")),
      ]),
    ),
    rustFiles: Object.fromEntries(
      HARNESS_RUST_FILES.map((relativePath) => [
        relativePath,
        fs.readFileSync(path.join(root, relativePath), "utf8"),
      ]),
    ),
  };
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

function requiredFields(schema) {
  return Array.isArray(schema.required) ? schema.required : [];
}

function enumValues(schema, propertyName) {
  const values = schema.properties?.[propertyName]?.enum;
  return Array.isArray(values) ? values : [];
}

function nestedStatusEnum(schema) {
  const values = schema.properties?.entries?.items?.properties?.status?.enum;
  return Array.isArray(values) ? values : [];
}

function hasAll(values, required) {
  return required.every((item) => values.includes(item));
}

function summarizeRuleCount(values) {
  return Array.isArray(values) ? `${values.length} rule(s)` : "not-array";
}

function summarizeRustSymbols(text, symbols) {
  return symbols
    .map((symbol) => `${symbol}=${text.includes(symbol)}`)
    .join(",");
}

function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return String(value);
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
    const report = auditAgentHarnessFlowContracts(loadCurrentInputs(process.cwd()));
    if (args.outPath) {
      fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
      fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(formatAgentHarnessFlowAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
