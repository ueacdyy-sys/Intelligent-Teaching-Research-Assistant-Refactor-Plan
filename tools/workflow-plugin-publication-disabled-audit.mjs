import fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { recordWorkflowPluginPublicationDisabledPrecheck } from "./workflow-plugin-publication-disabled-runtime.mjs";

const defaultOutPath = "reports/workflow-plugin-publication-disabled.current.json";
const sourceFiles = {
  publicationPolicySchema: "contracts/workflow/workflow-plugin-publication-policy.schema.json",
  publicationPolicyExample: "contracts/workflow/workflow-plugin-publication-policy.example.json",
  registryEntryExample: "contracts/workflow/workflow-plugin-registry-entry.example.json",
  executionIsolationReport: "reports/workflow-plugin-execution-isolation.current.json",
  runtime: "tools/workflow-plugin-publication-disabled-runtime.mjs",
  runtimeTest: "tools/workflow-plugin-publication-disabled-runtime.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
};

const forbiddenRuntimeClaims = [
  "workflowPublishAllowed: true",
  "pluginMarketplaceExposureAllowed: true",
  "publicationAllowed: true",
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

export function auditWorkflowPluginPublicationDisabledRuntime(inputs, options = {}) {
  const findings = [];
  const policySchema = parseJson(inputs.publicationPolicySchema, {});
  const policyExample = parseJson(inputs.publicationPolicyExample, {});
  const registryEntryExample = parseJson(inputs.registryEntryExample, {});
  const executionIsolationReport = parseJson(inputs.executionIsolationReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const blockedProbe = runRuntimeProbe(registryEntryExample, policyExample, executionIsolationReport, options);

  addFinding(findings, {
    id: "publication_policy.default_blocks_publication",
    passed: policySchema.properties?.mode?.const === "BLOCK_PUBLICATION" &&
      policySchema.properties?.publicationAllowed?.const === false &&
      policySchema.properties?.publicationChannel?.const === "DISABLED" &&
      policySchema.properties?.registryExposure?.const === "INTERNAL_DRY_RUN_CATALOG_ONLY" &&
      policySchema.properties?.requiresExecutionIsolation?.const === true &&
      policySchema.properties?.requiresFutureSdd?.const === true &&
      policySchema.properties?.auditLogRequired?.const === true,
    actual: summarizePublicationPolicy(policySchema),
    expected: "policy blocks publication, disables channel, keeps internal dry-run exposure, and requires execution isolation plus future SDD",
    remediation: "Publication policy must remain deny-by-default before executable isolation, signing, rollout, and rollback are designed.",
  });

  addFinding(findings, {
    id: "runtime.requires_internal_admin_and_full_evidence",
    passed: includesAll(inputs.runtime, [
      "authorizePublicationRecorder",
      "AGENT_INTERNAL",
      "ADMIN_SYSTEM",
      "role === \"STUDENT\"",
      "subjectType === \"REMOTE_CHANNEL\"",
      "registryAdmissionRecordRef",
      "executionIsolationRecordRef",
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
    expected: "internal service/admin with ADMIN_SYSTEM plus registry, execution isolation, human approval, sandbox, context, rollback, audit, and idempotency evidence",
    remediation: "Publication prechecks should only be recorded by trusted writers with complete evidence.",
  });

  addFinding(findings, {
    id: "runtime.enforces_dry_run_registry_and_blocked_isolation",
    passed: includesAll(inputs.runtime, [
      "registry entries must remain DRY_RUN_ONLY with localExecutionEnabled=false",
      "execution isolation must block candidates before publication can be considered",
      "execution isolation result must keep candidates, publish, local execution, process launch, and host writes disabled",
      "BLOCK_PUBLICATION",
      "INTERNAL_DRY_RUN_CATALOG_ONLY",
      "DISABLED",
    ]),
    actual: summarizePresence(inputs.runtime, ["DRY_RUN_ONLY", "localExecutionEnabled=false", "block candidates", "BLOCK_PUBLICATION"]),
    expected: "runtime rejects executable registry entries, unblocked isolation, and unsafe publication policies",
    remediation: "Do not allow dry-run registry entries to become published assets before a future executable isolation SDD.",
  });

  addFinding(findings, {
    id: "runtime.append_only_no_publish_or_execution",
    passed: includesAll(inputs.runtime, [
      "appendCommandIntent",
      "fs.appendFileSync",
      "findExistingRecordByIdempotencyKey",
      "workflow-command-log",
      "workflowPublishAllowed: false",
      "pluginMarketplaceExposureAllowed: false",
      "executionCandidateAllowed: false",
      "localExecutionEnabled: false",
      "processLaunchAllowed: false",
      "hostWriteAllowed: false",
      "localGeneratedCodeExecuted: false",
      "generatedCodeExecutedOnHost: false",
    ]) && !hasForbiddenRuntimeClaim(inputs.runtime),
    actual: summarizePresence(inputs.runtime, ["appendFileSync", "workflowPublishAllowed: true", "publicationAllowed: true", "execSync("]),
    expected: "append-only publication blocking evidence; no publish, marketplace exposure, candidate exposure, process launch, host write, or generated code execution",
    remediation: "Publication disabled runtime must record blocking evidence only.",
  });

  addFinding(findings, {
    id: "runtime.blocked_probe_records_publication_disabled",
    passed: blockedProbe.status === "PASS" &&
      blockedProbe.result?.status === "WORKFLOW_PLUGIN_PUBLICATION_BLOCKED_BY_POLICY" &&
      blockedProbe.result?.boundary?.workflowPublishAllowed === false &&
      blockedProbe.result?.boundary?.pluginMarketplaceExposureAllowed === false &&
      blockedProbe.result?.boundary?.executionCandidateAllowed === false &&
      blockedProbe.logRecordCount === 1,
    actual: blockedProbe.status === "PASS"
      ? `status=${blockedProbe.result.status};publish=${blockedProbe.result.boundary.workflowPublishAllowed};market=${blockedProbe.result.boundary.pluginMarketplaceExposureAllowed};records=${blockedProbe.logRecordCount}`
      : blockedProbe.error,
    expected: "precheck records a blocked publication decision with no marketplace exposure and no execution candidates",
    remediation: "Publication disabled precheck should block publish and persist exactly one command record.",
  });

  addFinding(findings, {
    id: "tests.cover_publication_policy_isolation_and_idempotency_paths",
    passed: includesAll(inputs.runtimeTest, [
      "records a blocked publication precheck",
      "rejects publication policies that allow publication",
      "rejects execution isolation results that expose candidates",
      "rejects registry entries that enable local execution",
      "rejects ordinary teacher principals",
      "replays an idempotent publication precheck",
    ]),
    actual: "runtime test negative paths scanned",
    expected: "blocked precheck, publish-allowed policy, exposed candidates, executable entry, unauthorized principal, and idempotency replay are tested",
    remediation: "Keep publication safety regressions covered.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime_audit",
    passed: packageJson.scripts?.["audit:workflow-plugin-publication-disabled"]?.includes("workflow-plugin-publication-disabled-audit.mjs") &&
      inputs.qualityGate.includes("Workflow plugin publication disabled runtime audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + inputs.qualityGate, [
      "audit:workflow-plugin-publication-disabled",
      "Workflow plugin publication disabled runtime audit",
    ]),
    expected: "npm script and strict quality command include workflow plugin publication disabled audit",
    remediation: "Add this runtime audit to the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_publication_disabled_report",
    passed: includesAll(inputs.rootWorkflowCoverage, [
      "workflowPluginPublicationDisabled",
      "workflow-plugin-publication-disabled.current.json",
      "[\"workflowPluginPublicationDisabled\", \"READY\"]",
    ]),
    actual: summarizePresence(inputs.rootWorkflowCoverage, ["workflowPluginPublicationDisabled", "workflow-plugin-publication-disabled.current.json"]),
    expected: "workflow_plugin_self_evolution root coverage requires publication disabled precheck report",
    remediation: "Root workflow coverage should include publication disabled gate evidence.",
  });

  addFinding(findings, {
    id: "quality.structure_tracks_slice",
    passed: includesAll(inputs.verifyStructure, [
      "workflow-plugin-publication-policy.schema.json",
      "workflow-plugin-publication-policy.example.json",
      "workflow-plugin-publication-disabled-runtime.mjs",
      "workflow-plugin-publication-disabled-runtime.test.mjs",
      "workflow-plugin-publication-disabled-audit.mjs",
      "workflow-plugin-publication-disabled-audit.test.mjs",
      "0233-workflow-plugin-publication-disabled-gate.md",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires publication policy, runtime, audit, tests, and SDD",
    remediation: "Add the publication disabled slice to structure verification.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "WORKFLOW_PLUGIN_PUBLICATION_DISABLED_RUNTIME",
    commandPort: "WorkflowPublicationCommandPort.recordWorkflowPluginPublicationDisabledPrecheck",
    boundary: {
      status: "WORKFLOW_PLUGIN_PUBLICATION_BLOCKED_BY_POLICY",
      workflowPublishAllowed: false,
      pluginMarketplaceExposureAllowed: false,
      registryExposure: "INTERNAL_DRY_RUN_CATALOG_ONLY",
      executionCandidateAllowed: false,
      executionCandidateCount: 0,
      localExecutionEnabled: false,
      processLaunchAllowed: false,
      hostWriteAllowed: false,
      networkPolicy: "DEFAULT_DENY",
      localGeneratedCodeExecuted: false,
      requiresExecutionIsolation: true,
      requiresFutureSdd: true,
    },
    runtimeProbes: {
      blocked: blockedProbe,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as publication-disabled evidence; signing, rollout, marketplace exposure, and host execution remain future gated slices."
      : "Fix publication disabled runtime boundaries before allowing any workflow/plugin publication work.",
  };
}

export function formatWorkflowPluginPublicationDisabledAudit(report) {
  const lines = [
    `Workflow plugin publication disabled runtime: ${report.readiness}`,
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

function runRuntimeProbe(registryEntry, publicationPolicy, executionIsolationReport, options = {}) {
  try {
    const commandLogPath = path.join(
      mkdtempSync(path.join(tmpdir(), "workflow-plugin-publication-disabled-")),
      "workflow-plugin-publication-disabled.jsonl",
    );
    const executionIsolationResult = executionIsolationReport.runtimeProbes?.blocked?.result ?? executionIsolationReport;
    const result = recordWorkflowPluginPublicationDisabledPrecheck({
      principal: {
        principalId: "workflow_publication_disabled_audit_service",
        role: "SERVICE",
        subjectType: "SERVICE",
        entryPoint: "AGENT_INTERNAL",
        scopes: ["ADMIN_SYSTEM"],
        requiresHarnessApproval: false,
        sessionId: "workflow_publication_disabled_audit_session",
      },
      registryEntry,
      executionIsolationResult,
      publicationPolicy,
      registryAdmissionRecordRef: "workflow-registry-admission:audit-registry-admission",
      executionIsolationRecordRef: publicationPolicy.executionIsolationRecordRef,
      humanApprovalRecordRef: "workflow-human-approval:audit-human-approval",
      sandboxResultRecordRef: "workflow-sandbox-result:audit-sandbox-result",
      sharedContextRef: "shared-context:audit-workflow-publication-disabled",
      guardrailResultRef: "guardrail:audit-workflow-publication-disabled",
      routeDecisionRef: "route:audit-workflow-publication-disabled",
      inputHash: "sha256:audit-workflow-publication-disabled",
      outputSummary: "Audit publication disabled gate blocked publish.",
      rollbackPlanRef: "rollback:audit-workflow-publication-disabled",
      auditTraceRef: "audit:audit-workflow-publication-disabled",
      idempotencyKey: "audit-workflow-publication-disabled",
    }, {
      commandLogPath,
      generatedAt: options.generatedAt ?? "2026-06-05T05:00:00.000Z",
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

function summarizePublicationPolicy(schema = {}) {
  return [
    `mode=${stringifyScalar(schema.properties?.mode?.const)}`,
    `allowed=${stringifyScalar(schema.properties?.publicationAllowed?.const)}`,
    `channel=${stringifyScalar(schema.properties?.publicationChannel?.const)}`,
    `exposure=${stringifyScalar(schema.properties?.registryExposure?.const)}`,
    `isolation=${stringifyScalar(schema.properties?.requiresExecutionIsolation?.const)}`,
    `futureSdd=${stringifyScalar(schema.properties?.requiresFutureSdd?.const)}`,
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
    const report = auditWorkflowPluginPublicationDisabledRuntime(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatWorkflowPluginPublicationDisabledAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
