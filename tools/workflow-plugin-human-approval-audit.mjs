import fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { recordWorkflowPluginHumanApproval } from "./workflow-plugin-human-approval-runtime.mjs";

const defaultOutPath = "reports/workflow-plugin-human-approval.current.json";
const sourceFiles = {
  approvalSchema: "contracts/workflow/workflow-plugin-approval.schema.json",
  approvalExample: "contracts/workflow/workflow-plugin-approval.example.json",
  workflowDraftExample: "contracts/workflow/workflow-draft.example.json",
  sandboxRunExample: "contracts/workflow/workflow-plugin-sandbox-run.example.json",
  runtime: "tools/workflow-plugin-human-approval-runtime.mjs",
  runtimeTest: "tools/workflow-plugin-human-approval-runtime.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
};

const forbiddenRuntimeClaims = [
  "registrySaveAllowed: true",
  "workflowPublishAllowed: true",
  "executionCandidateAllowed: true",
  "localGeneratedCodeExecuted: true",
  "generatedCodeExecutedOnHost: true",
  "JsonlWorkflowPluginRegistryStore",
  "admitWorkflowPluginRegistryEntry(",
  "execSync(",
  "spawn(",
  "execFile(",
];

export function auditWorkflowPluginHumanApprovalRuntime(inputs, options = {}) {
  const findings = [];
  const approvalSchema = parseJson(inputs.approvalSchema, {});
  const approvalExample = parseJson(inputs.approvalExample, {});
  const workflowDraftExample = parseJson(inputs.workflowDraftExample, {});
  const sandboxRunExample = parseJson(inputs.sandboxRunExample, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const approvedProbe = runRuntimeProbe(workflowDraftExample, sandboxRunExample, approvalExample, "APPROVED", options);
  const revisionProbe = runRuntimeProbe(workflowDraftExample, sandboxRunExample, revisionApproval(approvalExample), "REVISION", options);

  addFinding(findings, {
    id: "approval_contract.requires_performance_and_effect_review",
    passed: approvalSchema.properties?.performanceReviewed?.const === true &&
      approvalSchema.properties?.effectReviewed?.const === true &&
      hasAll(requiredFields(approvalSchema), ["decision", "registrySaveDecision", "reviewedAt"]) &&
      approvalSchema.properties?.decision?.enum?.includes("APPROVED") &&
      approvalSchema.properties?.decision?.enum?.includes("REVISION_REQUESTED") &&
      approvalSchema.properties?.registrySaveDecision?.enum?.includes("ALLOW_SAVE") &&
      approvalSchema.properties?.registrySaveDecision?.enum?.includes("BLOCK_SAVE"),
    actual: summarizeApprovalContract(approvalSchema),
    expected: "approval contract requires performance/effect review, decision, registry save decision, and reviewedAt",
    remediation: "Human approval must prove both performance and effect review before registry admission can be considered.",
  });

  addFinding(findings, {
    id: "runtime.requires_human_harness_reviewer_and_evidence",
    passed: includesAll(inputs.runtime, [
      "authorizeHumanReviewer",
      "HARNESS_APPROVE",
      "ADMIN_SYSTEM",
      "role === \"STUDENT\"",
      "role === \"SERVICE\"",
      "requiredEvidenceFields",
      "draftIntentRecordRef",
      "sandboxResultRecordRef",
      "sharedContextRef",
      "guardrailResultRef",
      "routeDecisionRef",
      "performanceEvidenceRef",
      "effectEvidenceRef",
      "rollbackPlanRef",
      "auditTraceRef",
      "idempotencyKey",
    ]),
    actual: "runtime reviewer and evidence symbols scanned",
    expected: "non-student human reviewer with HARNESS_APPROVE/admin plus full context, review, rollback, audit, and idempotency evidence",
    remediation: "Human approval must not be accepted from students, services, remote channels, or untraceable callers.",
  });

  addFinding(findings, {
    id: "runtime.requires_passing_sandbox_before_approval",
    passed: includesAll(inputs.runtime, [
      "human approval requires a passing sandbox result",
      "executedInSandbox !== true",
      "noHostWrite !== true",
      "networkPolicy !== \"DEFAULT_DENY\"",
      "human approval cannot proceed with failing sandbox tests",
      "performanceReviewed and effectReviewed must both be true",
      "approved reviews must set registrySaveDecision=ALLOW_SAVE",
      "non-approved reviews must block registry save",
    ]),
    actual: summarizePresence(inputs.runtime, ["passing sandbox", "DEFAULT_DENY", "performanceReviewed", "registrySaveDecision"]),
    expected: "human approval only consumes safe PASS sandbox evidence and explicit performance/effect review",
    remediation: "Block human approval until sandbox isolation and human review evidence are both complete.",
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
      "generatedCodeExecutedOnHost: false",
    ]) && !hasForbiddenRuntimeClaim(inputs.runtime),
    actual: summarizePresence(inputs.runtime, ["appendFileSync", "registrySaveAllowed: true", "admitWorkflowPluginRegistryEntry(", "execSync("]),
    expected: "append-only human approval evidence; no registry save, publish, execution candidate, host execution, or shell execution",
    remediation: "This runtime should only record review evidence; registry admission and execution remain separate gated steps.",
  });

  addFinding(findings, {
    id: "runtime.approved_probe_prepares_registry_admission_only",
    passed: approvedProbe.status === "PASS" &&
      approvedProbe.result?.status === "HUMAN_APPROVED_REGISTRY_ADMISSION_READY" &&
      approvedProbe.result?.registryAdmissionReady === true &&
      approvedProbe.result?.boundary?.registryAdmissionCandidate === true &&
      approvedProbe.result?.boundary?.registrySaveAllowed === false &&
      approvedProbe.logRecordCount === 1,
    actual: approvedProbe.status === "PASS"
      ? `status=${approvedProbe.result.status};admission=${approvedProbe.result.registryAdmissionReady};records=${approvedProbe.logRecordCount};registry=${approvedProbe.result.boundary.registrySaveAllowed}`
      : approvedProbe.error,
    expected: "approved human review records evidence and prepares registry admission without saving registry entries",
    remediation: "Approval should unlock only the later registry admission check, not direct save or execution.",
  });

  addFinding(findings, {
    id: "runtime.revision_probe_blocks_registry_admission",
    passed: revisionProbe.status === "PASS" &&
      revisionProbe.result?.status === "HUMAN_REVIEW_REVISION_REQUIRED" &&
      revisionProbe.result?.registryAdmissionReady === false &&
      revisionProbe.result?.revisionRequired === true &&
      revisionProbe.result?.boundary?.registryAdmissionCandidate === false &&
      revisionProbe.logRecordCount === 1,
    actual: revisionProbe.status === "PASS"
      ? `status=${revisionProbe.result.status};revision=${revisionProbe.result.revisionRequired};records=${revisionProbe.logRecordCount};admission=${revisionProbe.result.boundary.registryAdmissionCandidate}`
      : revisionProbe.error,
    expected: "human revision feedback blocks registry admission",
    remediation: "Human effect/performance concerns must send generated artifacts back to revision.",
  });

  addFinding(findings, {
    id: "tests.cover_safety_review_and_idempotency_paths",
    passed: includesAll(inputs.runtimeTest, [
      "records a revision-requested human review",
      "rejects reviewers without Harness approval permission",
      "rejects service principals",
      "rejects approval when the sandbox result failed",
      "rejects approval without both performance and effect review",
      "replays an existing idempotent human approval",
    ]),
    actual: "runtime test negative paths scanned",
    expected: "revision, unauthorized reviewer, service reviewer, failed sandbox, missing review, and idempotency replay are tested",
    remediation: "Keep human review authorization and safety regressions covered before connecting registry admission runtime.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime_audit",
    passed: packageJson.scripts?.["audit:workflow-plugin-human-approval"]?.includes("workflow-plugin-human-approval-audit.mjs") &&
      inputs.qualityGate.includes("Workflow plugin human approval runtime audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + inputs.qualityGate, [
      "audit:workflow-plugin-human-approval",
      "Workflow plugin human approval runtime audit",
    ]),
    expected: "npm script and strict quality command include workflow plugin human approval audit",
    remediation: "Add this runtime audit to the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_human_approval_report",
    passed: includesAll(inputs.rootWorkflowCoverage, [
      "workflowPluginHumanApproval",
      "workflow-plugin-human-approval.current.json",
      "[\"workflowPluginHumanApproval\", \"READY\"]",
    ]),
    actual: summarizePresence(inputs.rootWorkflowCoverage, ["workflowPluginHumanApproval", "workflow-plugin-human-approval.current.json"]),
    expected: "workflow_plugin_self_evolution root coverage requires human approval runtime report",
    remediation: "Root workflow coverage should include the human performance/effect approval runtime evidence.",
  });

  addFinding(findings, {
    id: "quality.structure_tracks_slice",
    passed: includesAll(inputs.verifyStructure, [
      "workflow-plugin-human-approval-runtime.mjs",
      "workflow-plugin-human-approval-runtime.test.mjs",
      "workflow-plugin-human-approval-audit.mjs",
      "workflow-plugin-human-approval-audit.test.mjs",
      "0230-workflow-plugin-human-approval-runtime.md",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires runtime, audit, tests, and SDD",
    remediation: "Add the human approval slice to structure verification.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "WORKFLOW_PLUGIN_HUMAN_APPROVAL_RUNTIME",
    commandPort: "WorkflowApprovalCommandPort.recordWorkflowPluginHumanApproval",
    boundary: {
      approvedStatus: "HUMAN_APPROVED_REGISTRY_ADMISSION_READY",
      revisionStatus: "HUMAN_REVIEW_REVISION_REQUIRED",
      registrySaveAllowed: false,
      workflowPublishAllowed: false,
      executionCandidateAllowed: false,
      localGeneratedCodeExecuted: false,
      registryAdmissionCandidateRequiresApproval: true,
    },
    runtimeProbes: {
      approved: approvedProbe,
      revision: revisionProbe,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as workflow/plugin human performance/effect approval evidence; next slice can connect registry admission runtime without enabling host execution."
      : "Fix human approval runtime boundaries before using approval evidence for registry admission.",
  };
}

export function formatWorkflowPluginHumanApprovalAudit(report) {
  const lines = [
    `Workflow plugin human approval runtime: ${report.readiness}`,
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

function runRuntimeProbe(draft, sandboxRun, approval, scenario, options = {}) {
  try {
    const commandLogPath = path.join(
      mkdtempSync(path.join(tmpdir(), `workflow-plugin-human-approval-${scenario.toLowerCase()}-`)),
      "workflow-plugin-human-approvals.jsonl",
    );
    const result = recordWorkflowPluginHumanApproval({
      principal: {
        principalId: approval.reviewerPrincipalId,
        role: "TEACHER",
        subjectType: "USER",
        entryPoint: "DESKTOP_TEACHER",
        scopes: ["HARNESS_APPROVE"],
        requiresHarnessApproval: false,
        sessionId: "workflow_human_approval_audit_session",
      },
      draft,
      sandboxRun,
      approval,
      draftIntentRecordRef: "workflow-draft-intent:audit-workflow-draft",
      sandboxResultRecordRef: "workflow-sandbox-result:audit-sandbox-result",
      sharedContextRef: "shared-context:audit-workflow-human-approval",
      guardrailResultRef: "guardrail:audit-workflow-human-approval",
      routeDecisionRef: "route:audit-workflow-human-approval",
      inputHash: `sha256:audit-workflow-human-approval-${scenario.toLowerCase()}`,
      outputSummary: `Audit ${scenario} human approval recorded for review.`,
      performanceEvidenceRef: "perf-evidence:audit-workflow-runtime-slo",
      effectEvidenceRef: "effect-evidence:audit-human-effect-review",
      rollbackPlanRef: "rollback:audit-workflow-human-approval",
      auditTraceRef: "audit:audit-workflow-human-approval",
      idempotencyKey: `audit-workflow-human-approval-${scenario.toLowerCase()}`,
    }, {
      commandLogPath,
      generatedAt: options.generatedAt ?? "2026-06-05T02:00:00.000Z",
    });
    const logRecordCount = fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).filter(Boolean).length;
    return { status: "PASS", result, logRecordCount };
  } catch (error) {
    return { status: "FAIL", error: error.message };
  }
}

function revisionApproval(approval) {
  return {
    ...approval,
    approvalId: `${approval.approvalId}_revision`,
    decision: "REVISION_REQUESTED",
    registrySaveDecision: "BLOCK_SAVE",
    comments: "Human review found missing rollback clarity.",
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

function summarizeApprovalContract(schema = {}) {
  return [
    `performance=${stringifyScalar(schema.properties?.performanceReviewed?.const)}`,
    `effect=${stringifyScalar(schema.properties?.effectReviewed?.const)}`,
    `decision=${(schema.properties?.decision?.enum ?? []).join("|")}`,
    `registry=${(schema.properties?.registrySaveDecision?.enum ?? []).join("|")}`,
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
    const report = auditWorkflowPluginHumanApprovalRuntime(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatWorkflowPluginHumanApprovalAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
