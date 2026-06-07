import fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { recordWorkflowPluginManagementDisabledView } from "./workflow-plugin-management-disabled-view-runtime.mjs";

const defaultOutPath = "reports/workflow-plugin-management-disabled-view.current.json";
const sourceFiles = {
  managementViewSchema: "contracts/workflow/workflow-plugin-management-disabled-view.schema.json",
  managementViewExample: "contracts/workflow/workflow-plugin-management-disabled-view.example.json",
  registryEntryExample: "contracts/workflow/workflow-plugin-registry-entry.example.json",
  executionIsolationReport: "reports/workflow-plugin-execution-isolation.current.json",
  publicationDisabledReport: "reports/workflow-plugin-publication-disabled.current.json",
  runtime: "tools/workflow-plugin-management-disabled-view-runtime.mjs",
  runtimeTest: "tools/workflow-plugin-management-disabled-view-runtime.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
};

const forbiddenRuntimeClaims = [
  "workflowPublishAllowed: true",
  "pluginMarketplaceExposureAllowed: true",
  "executionCandidateAllowed: true",
  "localExecutionEnabled: true",
  "processLaunchAllowed: true",
  "hostWriteAllowed: true",
  "enabled: true",
  "execSync(",
  "spawn(",
  "execFile(",
];

export function auditWorkflowPluginManagementDisabledView(inputs, options = {}) {
  const findings = [];
  const viewSchema = parseJson(inputs.managementViewSchema, {});
  const registryEntryExample = parseJson(inputs.registryEntryExample, {});
  const executionIsolationReport = parseJson(inputs.executionIsolationReport, {});
  const publicationDisabledReport = parseJson(inputs.publicationDisabledReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const disabledViewProbe = runRuntimeProbe(
    registryEntryExample,
    executionIsolationReport,
    publicationDisabledReport,
    options,
  );

  addFinding(findings, {
    id: "management_view.contract_disables_all_risky_actions",
    passed: viewSchema.properties?.surface?.const === "ADMIN_WORKFLOW_PLUGIN_MANAGEMENT" &&
      viewSchema.properties?.actions?.minItems === 4 &&
      viewSchema.properties?.actions?.maxItems === 4 &&
      viewSchema.properties?.actions?.items?.properties?.enabled?.const === false &&
      viewSchema.properties?.disabledActionCount?.const === 4 &&
      includesAll(JSON.stringify(viewSchema), [
        "\"publish\"",
        "\"enableLocalExecution\"",
        "\"createExecutionCandidate\"",
        "\"exposeMarketplace\"",
      ]),
    actual: summarizeViewContract(viewSchema),
    expected: "admin management view has exactly four risky actions and every action is disabled",
    remediation: "Management UI contracts must not expose an enabled publish, local execution, execution candidate, or marketplace action.",
  });

  addFinding(findings, {
    id: "management_view.boundary_blocks_publish_execution_and_host_effects",
    passed: viewSchema.properties?.boundary?.properties?.managementViewRendered?.const === true &&
      viewSchema.properties?.boundary?.properties?.allActionsDisabled?.const === true &&
      viewSchema.properties?.boundary?.properties?.workflowPublishAllowed?.const === false &&
      viewSchema.properties?.boundary?.properties?.pluginMarketplaceExposureAllowed?.const === false &&
      viewSchema.properties?.boundary?.properties?.executionCandidateAllowed?.const === false &&
      viewSchema.properties?.boundary?.properties?.localExecutionEnabled?.const === false &&
      viewSchema.properties?.boundary?.properties?.processLaunchAllowed?.const === false &&
      viewSchema.properties?.boundary?.properties?.hostWriteAllowed?.const === false &&
      viewSchema.properties?.boundary?.properties?.requiresFutureSdd?.const === true,
    actual: summarizeBoundaryContract(viewSchema),
    expected: "view boundary renders management evidence while blocking publish, marketplace, execution candidates, local execution, process launch, and host writes",
    remediation: "Keep management view as evidence-only until a future SDD explicitly enables safe execution and publication.",
  });

  addFinding(findings, {
    id: "runtime.requires_internal_admin_and_upstream_evidence",
    passed: includesAll(inputs.runtime, [
      "authorizeManagementViewRecorder",
      "AGENT_INTERNAL",
      "ADMIN_SYSTEM",
      "role === \"STUDENT\"",
      "subjectType === \"REMOTE_CHANNEL\"",
      "registryAdmissionRecordRef",
      "executionIsolationRecordRef",
      "publicationDisabledRecordRef",
      "humanApprovalRecordRef",
      "sandboxResultRecordRef",
      "auditTraceRef",
      "idempotencyKey",
    ]),
    actual: "runtime authorization and evidence symbols scanned",
    expected: "internal service/admin with ADMIN_SYSTEM plus registry, execution isolation, publication disabled, human approval, sandbox, audit, and idempotency evidence",
    remediation: "Management disabled view records should only be written by trusted control-plane writers with upstream blocking evidence.",
  });

  addFinding(findings, {
    id: "runtime.consumes_blocked_isolation_and_publication_reports",
    passed: includesAll(inputs.runtime, [
      "execution isolation must block candidates before management view rendering",
      "execution isolation result must keep candidates, publish, local execution, process launch, and host writes disabled",
      "publication disabled result must block publication before management view rendering",
      "publication disabled result must keep publish, marketplace, execution, process launch, and host writes disabled",
      "WORKFLOW_PLUGIN_PUBLICATION_BLOCKED_BY_POLICY",
      "EXECUTION_CANDIDATE_BLOCKED_BY_ISOLATION",
    ]),
    actual: summarizePresence(inputs.runtime, [
      "EXECUTION_CANDIDATE_BLOCKED_BY_ISOLATION",
      "WORKFLOW_PLUGIN_PUBLICATION_BLOCKED_BY_POLICY",
      "management view rendering",
    ]),
    expected: "runtime refuses to render management view unless execution candidates and publication are already blocked",
    remediation: "Do not show workflow/plugin management affordances without execution-isolation and publication-disabled evidence.",
  });

  addFinding(findings, {
    id: "runtime.append_only_no_ui_enable_or_execution",
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
      "enabled: false",
    ]) && !hasForbiddenRuntimeClaim(inputs.runtime),
    actual: summarizePresence(inputs.runtime, ["appendFileSync", "enabled: true", "workflowPublishAllowed: true", "execSync("]),
    expected: "append-only management evidence; no enabled UI action, publish, marketplace, execution candidate, process launch, or host write",
    remediation: "Management disabled view runtime must record disabled UI evidence only.",
  });

  addFinding(findings, {
    id: "runtime.disabled_view_probe_records_all_actions_disabled",
    passed: disabledViewProbe.status === "PASS" &&
      disabledViewProbe.result?.status === "WORKFLOW_PLUGIN_MANAGEMENT_VIEW_DISABLED" &&
      disabledViewProbe.result?.view?.disabledActionCount === 4 &&
      disabledViewProbe.result?.view?.actions?.every((action) => action.enabled === false) &&
      disabledViewProbe.result?.boundary?.allActionsDisabled === true &&
      disabledViewProbe.result?.boundary?.workflowPublishAllowed === false &&
      disabledViewProbe.result?.boundary?.pluginMarketplaceExposureAllowed === false &&
      disabledViewProbe.result?.boundary?.executionCandidateAllowed === false &&
      disabledViewProbe.logRecordCount === 1,
    actual: disabledViewProbe.status === "PASS"
      ? `status=${disabledViewProbe.result.status};disabled=${disabledViewProbe.result.view.disabledActionCount};publish=${disabledViewProbe.result.boundary.workflowPublishAllowed};records=${disabledViewProbe.logRecordCount}`
      : disabledViewProbe.error,
    expected: "runtime probe records one management disabled view with four disabled actions and no publish/execution affordance",
    remediation: "Management disabled view should persist exactly one disabled-view record and keep all risky actions disabled.",
  });

  addFinding(findings, {
    id: "tests.cover_disabled_view_unsafe_evidence_and_idempotency_paths",
    passed: includesAll(inputs.runtimeTest, [
      "records a management disabled view with every risky action disabled",
      "rejects publication evidence that allows marketplace exposure",
      "rejects execution isolation evidence that exposes candidates",
      "rejects executable registry entries",
      "rejects ordinary teacher principals",
      "replays an idempotent disabled view",
    ]),
    actual: "runtime test positive and negative paths scanned",
    expected: "disabled view, unsafe publication, unsafe isolation, executable entry, unauthorized principal, and idempotency replay are tested",
    remediation: "Keep management UI disabled-state regressions covered.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_management_disabled_view_audit",
    passed: packageJson.scripts?.["audit:workflow-plugin-management-disabled-view"]?.includes("workflow-plugin-management-disabled-view-audit.mjs") &&
      inputs.qualityGate.includes("Workflow plugin management disabled view audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + inputs.qualityGate, [
      "audit:workflow-plugin-management-disabled-view",
      "Workflow plugin management disabled view audit",
    ]),
    expected: "npm script and strict quality command include workflow plugin management disabled view audit",
    remediation: "Add this management view audit to the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_management_disabled_view_report",
    passed: includesAll(inputs.rootWorkflowCoverage, [
      "workflowPluginManagementDisabledView",
      "workflow-plugin-management-disabled-view.current.json",
      "[\"workflowPluginManagementDisabledView\", \"READY\"]",
    ]),
    actual: summarizePresence(inputs.rootWorkflowCoverage, [
      "workflowPluginManagementDisabledView",
      "workflow-plugin-management-disabled-view.current.json",
    ]),
    expected: "workflow_plugin_self_evolution root coverage requires management disabled view report",
    remediation: "Root workflow coverage should include management disabled view evidence before UI management claims.",
  });

  addFinding(findings, {
    id: "quality.structure_tracks_slice",
    passed: includesAll(inputs.verifyStructure, [
      "workflow-plugin-management-disabled-view.schema.json",
      "workflow-plugin-management-disabled-view.example.json",
      "workflow-plugin-management-disabled-view-runtime.mjs",
      "workflow-plugin-management-disabled-view-runtime.test.mjs",
      "workflow-plugin-management-disabled-view-audit.mjs",
      "workflow-plugin-management-disabled-view-audit.test.mjs",
      "0234-workflow-plugin-management-disabled-view.md",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires management view contract, runtime, audit, tests, and SDD",
    remediation: "Add the management disabled view slice to structure verification.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "WORKFLOW_PLUGIN_MANAGEMENT_DISABLED_VIEW",
    commandPort: "WorkflowManagementViewCommandPort.recordWorkflowPluginManagementDisabledView",
    boundary: {
      status: "WORKFLOW_PLUGIN_MANAGEMENT_VIEW_DISABLED",
      managementViewRendered: true,
      allActionsDisabled: true,
      disabledActionCount: 4,
      workflowPublishAllowed: false,
      pluginMarketplaceExposureAllowed: false,
      executionCandidateAllowed: false,
      localExecutionEnabled: false,
      processLaunchAllowed: false,
      hostWriteAllowed: false,
      requiresFutureSdd: true,
    },
    runtimeProbes: {
      disabledView: disabledViewProbe,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as management disabled-view evidence; real workflow/plugin UI enablement, publication, marketplace exposure, and host execution remain future gated slices."
      : "Fix management disabled view boundaries before showing workflow/plugin management controls.",
  };
}

export function formatWorkflowPluginManagementDisabledViewAudit(report) {
  const lines = [
    `Workflow plugin management disabled view: ${report.readiness}`,
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

function runRuntimeProbe(registryEntry, executionIsolationReport, publicationDisabledReport, options = {}) {
  try {
    const commandLogPath = path.join(
      mkdtempSync(path.join(tmpdir(), "workflow-plugin-management-disabled-view-")),
      "workflow-plugin-management-disabled-view.jsonl",
    );
    const executionIsolationResult = executionIsolationReport.runtimeProbes?.blocked?.result ?? executionIsolationReport;
    const publicationDisabledResult = publicationDisabledReport.runtimeProbes?.blocked?.result ?? publicationDisabledReport;
    const result = recordWorkflowPluginManagementDisabledView({
      principal: {
        principalId: "workflow_management_disabled_view_audit_service",
        role: "SERVICE",
        subjectType: "SERVICE",
        entryPoint: "AGENT_INTERNAL",
        scopes: ["ADMIN_SYSTEM"],
        requiresHarnessApproval: false,
        sessionId: "workflow_management_disabled_view_audit_session",
      },
      registryEntry,
      executionIsolationResult,
      publicationDisabledResult,
      registryAdmissionRecordRef: "workflow-registry-admission:audit-registry-admission",
      executionIsolationRecordRef: `workflow-plugin-execution-isolation:${executionIsolationResult.recordId}`,
      publicationDisabledRecordRef: `workflow-plugin-publication-disabled:${publicationDisabledResult.recordId}`,
      humanApprovalRecordRef: "workflow-human-approval:audit-human-approval",
      sandboxResultRecordRef: "workflow-sandbox-result:audit-sandbox-result",
      auditTraceRef: "audit:audit-workflow-management-disabled-view",
      idempotencyKey: "audit-workflow-management-disabled-view",
    }, {
      commandLogPath,
      generatedAt: options.generatedAt ?? "2026-06-05T06:00:00.000Z",
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

function summarizeViewContract(schema = {}) {
  return [
    `surface=${stringifyScalar(schema.properties?.surface?.const)}`,
    `minActions=${stringifyScalar(schema.properties?.actions?.minItems)}`,
    `maxActions=${stringifyScalar(schema.properties?.actions?.maxItems)}`,
    `enabled=${stringifyScalar(schema.properties?.actions?.items?.properties?.enabled?.const)}`,
    `disabledCount=${stringifyScalar(schema.properties?.disabledActionCount?.const)}`,
  ].join(";");
}

function summarizeBoundaryContract(schema = {}) {
  const boundary = schema.properties?.boundary?.properties ?? {};
  return [
    `rendered=${stringifyScalar(boundary.managementViewRendered?.const)}`,
    `allDisabled=${stringifyScalar(boundary.allActionsDisabled?.const)}`,
    `publish=${stringifyScalar(boundary.workflowPublishAllowed?.const)}`,
    `market=${stringifyScalar(boundary.pluginMarketplaceExposureAllowed?.const)}`,
    `candidate=${stringifyScalar(boundary.executionCandidateAllowed?.const)}`,
    `hostWrite=${stringifyScalar(boundary.hostWriteAllowed?.const)}`,
    `futureSdd=${stringifyScalar(boundary.requiresFutureSdd?.const)}`,
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
    const report = auditWorkflowPluginManagementDisabledView(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatWorkflowPluginManagementDisabledViewAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
