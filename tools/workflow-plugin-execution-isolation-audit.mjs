import fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { recordWorkflowPluginExecutionIsolationPrecheck } from "./workflow-plugin-execution-isolation-runtime.mjs";

const defaultOutPath = "reports/workflow-plugin-execution-isolation.current.json";
const sourceFiles = {
  isolationPolicySchema: "contracts/workflow/workflow-plugin-execution-isolation-policy.schema.json",
  isolationPolicyExample: "contracts/workflow/workflow-plugin-execution-isolation-policy.example.json",
  registryEntryExample: "contracts/workflow/workflow-plugin-registry-entry.example.json",
  executionCandidateViewSchema: "contracts/harness/execution-candidate-view.schema.json",
  executionCandidateViewExample: "contracts/harness/execution-candidate-view.example.json",
  runtime: "tools/workflow-plugin-execution-isolation-runtime.mjs",
  runtimeTest: "tools/workflow-plugin-execution-isolation-runtime.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
};

const forbiddenRuntimeClaims = [
  "workflowPublishAllowed: true",
  "executionCandidateAllowed: true",
  "localExecutionEnabled: true",
  "processLaunchAllowed: true",
  "hostWriteAllowed: true",
  "localGeneratedCodeExecuted: true",
  "generatedCodeExecutedOnHost: true",
  "execSync(",
  "spawn(",
  "execFile(",
];

export function auditWorkflowPluginExecutionIsolationRuntime(inputs, options = {}) {
  const findings = [];
  const policySchema = parseJson(inputs.isolationPolicySchema, {});
  const policyExample = parseJson(inputs.isolationPolicyExample, {});
  const registryEntryExample = parseJson(inputs.registryEntryExample, {});
  const candidateSchema = parseJson(inputs.executionCandidateViewSchema, {});
  const candidateExample = parseJson(inputs.executionCandidateViewExample, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const blockedProbe = runRuntimeProbe(registryEntryExample, policyExample, candidateExample, options);

  addFinding(findings, {
    id: "isolation_policy.default_blocks_host_execution",
    passed: policySchema.properties?.mode?.const === "BLOCK_HOST_EXECUTION" &&
      policySchema.properties?.hostWritePolicy?.const === "DENY" &&
      policySchema.properties?.networkPolicy?.const === "DEFAULT_DENY" &&
      policySchema.properties?.processLaunchAllowed?.const === false &&
      policySchema.properties?.candidateExposure?.const === "DISABLED" &&
      policySchema.properties?.requiresFutureSdd?.const === true &&
      policySchema.properties?.auditLogRequired?.const === true,
    actual: summarizePolicyContract(policySchema),
    expected: "policy blocks host execution, host writes, network, process launch, candidate exposure, and requires future SDD",
    remediation: "Execution preflight must stay deny-by-default until a future executable isolation SDD exists.",
  });

  addFinding(findings, {
    id: "candidate_view.contract_blocks_candidates",
    passed: candidateSchema.properties?.candidateCount?.const === 0 &&
      candidateSchema.properties?.candidates?.maxItems === 0 &&
      candidateSchema.properties?.blockedReason?.const === "real local execution is disabled by current SDD",
    actual: summarizeCandidateContract(candidateSchema),
    expected: "candidateCount=0, maxItems=0, and blockedReason=current SDD disabled",
    remediation: "Execution candidate views must remain empty before executable isolation is explicitly introduced.",
  });

  addFinding(findings, {
    id: "runtime.requires_internal_admin_and_evidence",
    passed: includesAll(inputs.runtime, [
      "authorizeIsolationRecorder",
      "AGENT_INTERNAL",
      "ADMIN_SYSTEM",
      "role === \"STUDENT\"",
      "subjectType === \"REMOTE_CHANNEL\"",
      "registryAdmissionRecordRef",
      "humanApprovalRecordRef",
      "sandboxResultRecordRef",
      "sharedContextRef",
      "guardrailResultRef",
      "routeDecisionRef",
      "rollbackPlanRef",
      "auditTraceRef",
      "idempotencyKey",
    ]),
    actual: "runtime authorization and evidence symbols scanned",
    expected: "internal service/admin with ADMIN_SYSTEM plus registry, human approval, sandbox, context, rollback, audit, and idempotency evidence",
    remediation: "Execution preflight should only be recorded by trusted writers with full evidence.",
  });

  addFinding(findings, {
    id: "runtime.enforces_dry_run_registry_policy_and_empty_candidates",
    passed: includesAll(inputs.runtime, [
      "registry entries must remain DRY_RUN_ONLY with localExecutionEnabled=false",
      "policy must block host execution, host writes, process launch, candidate exposure, and require a future SDD",
      "execution candidates must remain empty",
      "future SDD must explicitly enable execution candidates",
      "BLOCK_HOST_EXECUTION",
      "DEFAULT_DENY",
      "DISABLED",
    ]),
    actual: summarizePresence(inputs.runtime, ["DRY_RUN_ONLY", "localExecutionEnabled=false", "future SDD", "DEFAULT_DENY"]),
    expected: "runtime rejects executable registry entries, unsafe policies, and non-empty candidate views",
    remediation: "Do not allow registry entries to become execution candidates without a future SDD and executable isolation.",
  });

  addFinding(findings, {
    id: "runtime.append_only_no_execution_or_publish",
    passed: includesAll(inputs.runtime, [
      "appendCommandIntent",
      "fs.appendFileSync",
      "findExistingRecordByIdempotencyKey",
      "workflow-command-log",
      "workflowPublishAllowed: false",
      "executionCandidateAllowed: false",
      "localExecutionEnabled: false",
      "processLaunchAllowed: false",
      "hostWriteAllowed: false",
      "localGeneratedCodeExecuted: false",
      "generatedCodeExecutedOnHost: false",
    ]) && !hasForbiddenRuntimeClaim(inputs.runtime),
    actual: summarizePresence(inputs.runtime, ["appendFileSync", "executionCandidateAllowed: true", "processLaunchAllowed: true", "execSync("]),
    expected: "append-only preflight evidence; no publish, candidate exposure, process launch, host write, or generated code execution",
    remediation: "Execution isolation runtime must record blocking evidence only.",
  });

  addFinding(findings, {
    id: "runtime.blocked_probe_records_zero_candidates",
    passed: blockedProbe.status === "PASS" &&
      blockedProbe.result?.status === "EXECUTION_CANDIDATE_BLOCKED_BY_ISOLATION" &&
      blockedProbe.result?.executionCandidateView?.candidateCount === 0 &&
      blockedProbe.result?.boundary?.executionCandidateAllowed === false &&
      blockedProbe.result?.boundary?.processLaunchAllowed === false &&
      blockedProbe.logRecordCount === 1,
    actual: blockedProbe.status === "PASS"
      ? `status=${blockedProbe.result.status};candidates=${blockedProbe.result.executionCandidateView.candidateCount};records=${blockedProbe.logRecordCount};process=${blockedProbe.result.boundary.processLaunchAllowed}`
      : blockedProbe.error,
    expected: "preflight records a blocked decision with zero candidates and no process launch",
    remediation: "Execution isolation preflight should block executable candidates and persist exactly one command record.",
  });

  addFinding(findings, {
    id: "tests.cover_policy_candidate_and_idempotency_paths",
    passed: includesAll(inputs.runtimeTest, [
      "records a blocked execution-candidate precheck",
      "rejects registry entries that enable local execution",
      "rejects isolation policies that allow process launch",
      "rejects execution candidate views that expose candidates",
      "rejects ordinary teacher principals",
      "replays an idempotent precheck",
    ]),
    actual: "runtime test negative paths scanned",
    expected: "blocked precheck, executable entry, unsafe policy, exposed candidate, unauthorized principal, and idempotency replay are tested",
    remediation: "Keep execution isolation safety regressions covered.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime_audit",
    passed: packageJson.scripts?.["audit:workflow-plugin-execution-isolation"]?.includes("workflow-plugin-execution-isolation-audit.mjs") &&
      inputs.qualityGate.includes("Workflow plugin execution isolation runtime audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + inputs.qualityGate, [
      "audit:workflow-plugin-execution-isolation",
      "Workflow plugin execution isolation runtime audit",
    ]),
    expected: "npm script and strict quality command include workflow plugin execution isolation audit",
    remediation: "Add this runtime audit to the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_execution_isolation_report",
    passed: includesAll(inputs.rootWorkflowCoverage, [
      "workflowPluginExecutionIsolation",
      "workflow-plugin-execution-isolation.current.json",
      "[\"workflowPluginExecutionIsolation\", \"READY\"]",
    ]),
    actual: summarizePresence(inputs.rootWorkflowCoverage, ["workflowPluginExecutionIsolation", "workflow-plugin-execution-isolation.current.json"]),
    expected: "workflow_plugin_self_evolution root coverage requires execution isolation preflight report",
    remediation: "Root workflow coverage should include execution isolation preflight evidence.",
  });

  addFinding(findings, {
    id: "quality.structure_tracks_slice",
    passed: includesAll(inputs.verifyStructure, [
      "workflow-plugin-execution-isolation-policy.schema.json",
      "workflow-plugin-execution-isolation-policy.example.json",
      "workflow-plugin-execution-isolation-runtime.mjs",
      "workflow-plugin-execution-isolation-runtime.test.mjs",
      "workflow-plugin-execution-isolation-audit.mjs",
      "workflow-plugin-execution-isolation-audit.test.mjs",
      "0232-workflow-plugin-execution-isolation-precheck.md",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires policy contract, runtime, audit, tests, and SDD",
    remediation: "Add the execution isolation slice to structure verification.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "WORKFLOW_PLUGIN_EXECUTION_ISOLATION_RUNTIME",
    commandPort: "WorkflowExecutionIsolationCommandPort.recordWorkflowPluginExecutionIsolationPrecheck",
    boundary: {
      status: "EXECUTION_CANDIDATE_BLOCKED_BY_ISOLATION",
      executionCandidateAllowed: false,
      executionCandidateCount: 0,
      localExecutionEnabled: false,
      workflowPublishAllowed: false,
      processLaunchAllowed: false,
      hostWriteAllowed: false,
      networkPolicy: "DEFAULT_DENY",
      localGeneratedCodeExecuted: false,
      requiresFutureSdd: true,
    },
    runtimeProbes: {
      blocked: blockedProbe,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as execution-candidate isolation preflight evidence; publishing and host execution remain future gated slices."
      : "Fix execution isolation runtime boundaries before allowing any workflow/plugin execution candidate work.",
  };
}

export function formatWorkflowPluginExecutionIsolationAudit(report) {
  const lines = [
    `Workflow plugin execution isolation runtime: ${report.readiness}`,
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

function runRuntimeProbe(registryEntry, isolationPolicy, executionCandidateView, options = {}) {
  try {
    const commandLogPath = path.join(
      mkdtempSync(path.join(tmpdir(), "workflow-plugin-execution-isolation-")),
      "workflow-plugin-execution-isolation.jsonl",
    );
    const result = recordWorkflowPluginExecutionIsolationPrecheck({
      principal: {
        principalId: "workflow_execution_isolation_audit_service",
        role: "SERVICE",
        subjectType: "SERVICE",
        entryPoint: "AGENT_INTERNAL",
        scopes: ["ADMIN_SYSTEM"],
        requiresHarnessApproval: false,
        sessionId: "workflow_execution_isolation_audit_session",
      },
      registryEntry,
      isolationPolicy,
      executionCandidateView,
      registryAdmissionRecordRef: "workflow-registry-admission:audit-registry-admission",
      humanApprovalRecordRef: "workflow-human-approval:audit-human-approval",
      sandboxResultRecordRef: "workflow-sandbox-result:audit-sandbox-result",
      sharedContextRef: "shared-context:audit-workflow-execution-isolation",
      guardrailResultRef: "guardrail:audit-workflow-execution-isolation",
      routeDecisionRef: "route:audit-workflow-execution-isolation",
      inputHash: "sha256:audit-workflow-execution-isolation",
      outputSummary: "Audit execution isolation preflight blocked candidates.",
      rollbackPlanRef: "rollback:audit-workflow-execution-isolation",
      auditTraceRef: "audit:audit-workflow-execution-isolation",
      idempotencyKey: "audit-workflow-execution-isolation",
    }, {
      commandLogPath,
      generatedAt: options.generatedAt ?? "2026-06-05T04:00:00.000Z",
    });
    const logRecordCount = fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).filter(Boolean).length;
    return { status: "PASS", result, logRecordCount };
  } catch (error) {
    return { status: "FAIL", error: error.message };
  }
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

function summarizePolicyContract(schema = {}) {
  return [
    `mode=${stringifyScalar(schema.properties?.mode?.const)}`,
    `hostWrite=${stringifyScalar(schema.properties?.hostWritePolicy?.const)}`,
    `network=${stringifyScalar(schema.properties?.networkPolicy?.const)}`,
    `process=${stringifyScalar(schema.properties?.processLaunchAllowed?.const)}`,
    `candidate=${stringifyScalar(schema.properties?.candidateExposure?.const)}`,
    `futureSdd=${stringifyScalar(schema.properties?.requiresFutureSdd?.const)}`,
  ].join(";");
}

function summarizeCandidateContract(schema = {}) {
  return [
    `candidateCount=${stringifyScalar(schema.properties?.candidateCount?.const)}`,
    `maxItems=${stringifyScalar(schema.properties?.candidates?.maxItems)}`,
    `blockedReason=${stringifyScalar(schema.properties?.blockedReason?.const)}`,
  ].join(";");
}

function summarizePresence(text = "", needles = []) {
  return needles.map((needle) => `${needle}=${text.includes(needle)}`).join(";");
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
    const report = auditWorkflowPluginExecutionIsolationRuntime(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatWorkflowPluginExecutionIsolationAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
