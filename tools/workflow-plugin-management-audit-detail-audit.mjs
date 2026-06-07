import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { renderWorkflowPluginManagementAuditDetail } from "./workflow-plugin-management-audit-detail-runtime.mjs";

const defaultOutPath = "reports/workflow-plugin-management-audit-detail.current.json";
const sourceFiles = {
  auditDetailSchema: "contracts/workflow/workflow-plugin-management-audit-detail.schema.json",
  auditDetailExample: "contracts/workflow/workflow-plugin-management-audit-detail.example.json",
  draftIntentReport: "reports/workflow-plugin-draft-intent.current.json",
  sandboxResultReport: "reports/workflow-plugin-sandbox-result.current.json",
  humanApprovalReport: "reports/workflow-plugin-human-approval.current.json",
  registryAdmissionReport: "reports/workflow-plugin-registry-admission-runtime.current.json",
  executionIsolationReport: "reports/workflow-plugin-execution-isolation.current.json",
  publicationDisabledReport: "reports/workflow-plugin-publication-disabled.current.json",
  managementDisabledViewReport: "reports/workflow-plugin-management-disabled-view.current.json",
  runtime: "tools/workflow-plugin-management-audit-detail-runtime.mjs",
  runtimeTest: "tools/workflow-plugin-management-audit-detail-runtime.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
};

const forbiddenRuntimeClaims = [
  "appendFileSync",
  "writeFileSync",
  "mkdirSync",
  "readFileSync",
  "workflowPublishAllowed: true",
  "pluginMarketplaceExposureAllowed: true",
  "executionCandidateAllowed: true",
  "localExecutionEnabled: true",
  "processLaunchAllowed: true",
  "hostWriteAllowed: true",
  "productionHotPathChanged: true",
  "enabled: true",
  "execSync(",
  "spawn(",
  "execFile(",
];

export function auditWorkflowPluginManagementAuditDetail(inputs, options = {}) {
  const findings = [];
  const schema = parseJson(inputs.auditDetailSchema, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const reports = parseEvidenceReports(inputs);
  const detailProbe = runRuntimeProbe(reports, options);

  addFinding(findings, {
    id: "audit_detail.contract_is_readonly_detail",
    passed: schema.properties?.surface?.const === "ADMIN_WORKFLOW_PLUGIN_AUDIT_DETAIL" &&
      schema.properties?.evidenceTimeline?.minItems === 7 &&
      schema.properties?.evidenceTimeline?.maxItems === 7 &&
      schema.properties?.controlActions?.items?.properties?.enabled?.const === false &&
      schema.properties?.boundary?.properties?.readOnly?.const === true &&
      schema.properties?.boundary?.properties?.productionHotPathChanged?.const === false,
    actual: summarizeDetailContract(schema),
    expected: "read-only audit detail surface with seven evidence stages, disabled control actions, and no production hot-path change",
    remediation: "Management audit detail must remain a read-only projection, not a command surface.",
  });

  addFinding(findings, {
    id: "audit_detail.contract_keeps_execution_and_publication_blocked",
    passed: schema.properties?.boundary?.properties?.allActionsDisabled?.const === true &&
      schema.properties?.boundary?.properties?.workflowPublishAllowed?.const === false &&
      schema.properties?.boundary?.properties?.pluginMarketplaceExposureAllowed?.const === false &&
      schema.properties?.boundary?.properties?.executionCandidateAllowed?.const === false &&
      schema.properties?.boundary?.properties?.localExecutionEnabled?.const === false &&
      schema.properties?.boundary?.properties?.processLaunchAllowed?.const === false &&
      schema.properties?.boundary?.properties?.hostWriteAllowed?.const === false &&
      schema.properties?.boundary?.properties?.requiresFutureSdd?.const === true,
    actual: summarizeBoundaryContract(schema),
    expected: "audit detail blocks publish, marketplace, execution candidates, local execution, process launch, and host writes",
    remediation: "Do not use management detail rendering to smuggle in executable workflow/plugin controls.",
  });

  addFinding(findings, {
    id: "runtime.requires_admin_read_and_full_evidence_chain",
    passed: includesAll(inputs.runtime, [
      "authorizeManagementDetailReader",
      "AGENT_INTERNAL",
      "ADMIN_SYSTEM",
      "role === \"STUDENT\"",
      "subjectType === \"REMOTE_CHANNEL\"",
      "draftIntent",
      "sandboxResult",
      "humanApproval",
      "registryAdmission",
      "executionIsolation",
      "publicationDisabled",
      "managementDisabledView",
    ]),
    actual: "runtime authorization and evidence-chain symbols scanned",
    expected: "internal service/admin read boundary plus draft, sandbox, human approval, registry, isolation, publication, and management disabled reports",
    remediation: "Management audit detail should only render from the complete workflow/plugin evidence chain.",
  });

  addFinding(findings, {
    id: "runtime.readonly_no_side_effects_or_enabled_controls",
    passed: includesAll(inputs.runtime, [
      "readOnly: true",
      "productionHotPathChanged: false",
      "workflowPublishAllowed: false",
      "pluginMarketplaceExposureAllowed: false",
      "executionCandidateAllowed: false",
      "localExecutionEnabled: false",
      "processLaunchAllowed: false",
      "hostWriteAllowed: false",
      "enabled: false",
    ]) && !hasForbiddenRuntimeClaim(inputs.runtime),
    actual: summarizePresence(inputs.runtime, ["appendFileSync", "writeFileSync", "enabled: true", "productionHotPathChanged: true"]),
    expected: "pure read-only projection; no file append/write, no enabled controls, no execution, and no hot-path change",
    remediation: "Keep the runtime as a pure projection over existing reports.",
  });

  addFinding(findings, {
    id: "runtime.detail_probe_renders_complete_blocking_timeline",
    passed: detailProbe.status === "PASS" &&
      detailProbe.result?.status === "WORKFLOW_PLUGIN_MANAGEMENT_AUDIT_DETAIL_READONLY" &&
      detailProbe.result?.detail?.evidenceTimeline?.length === 7 &&
      detailProbe.result?.detail?.controlActions?.length === 4 &&
      detailProbe.result?.detail?.controlActions?.every((action) => action.enabled === false) &&
      detailProbe.result?.boundary?.readOnly === true &&
      detailProbe.result?.boundary?.workflowPublishAllowed === false &&
      detailProbe.result?.boundary?.executionCandidateAllowed === false &&
      detailProbe.result?.boundary?.productionHotPathChanged === false,
    actual: detailProbe.status === "PASS"
      ? `status=${detailProbe.result.status};stages=${detailProbe.result.detail.evidenceTimeline.length};actions=${detailProbe.result.detail.controlActions.length};hotPath=${detailProbe.result.boundary.productionHotPathChanged}`
      : detailProbe.error,
    expected: "runtime probe renders one read-only detail with seven evidence stages, four disabled actions, and no hot-path change",
    remediation: "Management audit detail must explain the whole evidence chain while keeping all risky actions disabled.",
  });

  addFinding(findings, {
    id: "tests.cover_detail_unauthorized_unsafe_and_missing_report_paths",
    passed: includesAll(inputs.runtimeTest, [
      "renders read-only audit detail from the workflow/plugin evidence chain",
      "rejects ordinary teacher principals",
      "rejects management views with enabled actions",
      "rejects publication evidence that allows marketplace exposure",
      "rejects execution isolation evidence that exposes candidates",
      "rejects missing ready evidence reports",
    ]),
    actual: "runtime test positive and negative paths scanned",
    expected: "read-only detail, unauthorized principal, enabled action, unsafe publication, unsafe isolation, and missing report paths are tested",
    remediation: "Keep detail-view regressions covered before any real UI is added.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_management_audit_detail",
    passed: packageJson.scripts?.["audit:workflow-plugin-management-audit-detail"]?.includes("workflow-plugin-management-audit-detail-audit.mjs") &&
      inputs.qualityGate.includes("Workflow plugin management audit detail audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + inputs.qualityGate, [
      "audit:workflow-plugin-management-audit-detail",
      "Workflow plugin management audit detail audit",
    ]),
    expected: "npm script and strict quality command include workflow plugin management audit detail audit",
    remediation: "Add this audit detail slice to the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_management_audit_detail_report",
    passed: includesAll(inputs.rootWorkflowCoverage, [
      "workflowPluginManagementAuditDetail",
      "workflow-plugin-management-audit-detail.current.json",
      "[\"workflowPluginManagementAuditDetail\", \"READY\"]",
    ]),
    actual: summarizePresence(inputs.rootWorkflowCoverage, [
      "workflowPluginManagementAuditDetail",
      "workflow-plugin-management-audit-detail.current.json",
    ]),
    expected: "workflow_plugin_self_evolution root coverage requires management audit detail report",
    remediation: "Root workflow coverage should include read-only audit detail evidence before UI detail claims.",
  });

  addFinding(findings, {
    id: "quality.structure_tracks_slice",
    passed: includesAll(inputs.verifyStructure, [
      "workflow-plugin-management-audit-detail.schema.json",
      "workflow-plugin-management-audit-detail.example.json",
      "workflow-plugin-management-audit-detail-runtime.mjs",
      "workflow-plugin-management-audit-detail-runtime.test.mjs",
      "workflow-plugin-management-audit-detail-audit.mjs",
      "workflow-plugin-management-audit-detail-audit.test.mjs",
      "0235-workflow-plugin-management-audit-detail.md",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires management audit detail contract, runtime, audit, tests, and SDD",
    remediation: "Add the management audit detail slice to structure verification.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "WORKFLOW_PLUGIN_MANAGEMENT_AUDIT_DETAIL",
    readPort: "WorkflowManagementReadPort.renderWorkflowPluginManagementAuditDetail",
    boundary: {
      status: "WORKFLOW_PLUGIN_MANAGEMENT_AUDIT_DETAIL_READONLY",
      readOnly: true,
      evidenceStageCount: 7,
      disabledActionCount: 4,
      workflowPublishAllowed: false,
      pluginMarketplaceExposureAllowed: false,
      executionCandidateAllowed: false,
      localExecutionEnabled: false,
      processLaunchAllowed: false,
      hostWriteAllowed: false,
      productionHotPathChanged: false,
      requiresFutureSdd: true,
    },
    runtimeProbes: {
      detail: detailProbe,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as read-only workflow/plugin management audit detail evidence; real UI controls, publication, marketplace exposure, and host execution remain future gated slices."
      : "Fix workflow/plugin management audit detail boundaries before adding a UI detail surface.",
  };
}

export function formatWorkflowPluginManagementAuditDetailAudit(report) {
  const lines = [
    `Workflow plugin management audit detail: ${report.readiness}`,
    `Read port: ${report.readPort}`,
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

function runRuntimeProbe(reports, options = {}) {
  try {
    const result = renderWorkflowPluginManagementAuditDetail({
      principal: {
        principalId: "workflow_management_audit_detail_service",
        role: "SERVICE",
        subjectType: "SERVICE",
        entryPoint: "AGENT_INTERNAL",
        scopes: ["ADMIN_SYSTEM"],
        requiresHarnessApproval: false,
        sessionId: "workflow_management_audit_detail_session",
      },
      managementDisabledViewResult: reports.managementDisabledView.runtimeProbes.disabledView.result,
      evidenceReports: reports,
    }, {
      generatedAt: options.generatedAt ?? "2026-06-05T07:00:00.000Z",
    });
    return { status: "PASS", result };
  } catch (error) {
    return { status: "FAIL", error: error.message };
  }
}

function parseEvidenceReports(inputs) {
  return {
    draftIntent: parseJson(inputs.draftIntentReport, {}),
    sandboxResult: parseJson(inputs.sandboxResultReport, {}),
    humanApproval: parseJson(inputs.humanApprovalReport, {}),
    registryAdmission: parseJson(inputs.registryAdmissionReport, {}),
    executionIsolation: parseJson(inputs.executionIsolationReport, {}),
    publicationDisabled: parseJson(inputs.publicationDisabledReport, {}),
    managementDisabledView: parseJson(inputs.managementDisabledViewReport, {}),
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

function summarizeDetailContract(schema = {}) {
  return [
    `surface=${stringifyScalar(schema.properties?.surface?.const)}`,
    `timeline=${stringifyScalar(schema.properties?.evidenceTimeline?.minItems)}-${stringifyScalar(schema.properties?.evidenceTimeline?.maxItems)}`,
    `actionEnabled=${stringifyScalar(schema.properties?.controlActions?.items?.properties?.enabled?.const)}`,
    `readOnly=${stringifyScalar(schema.properties?.boundary?.properties?.readOnly?.const)}`,
    `hotPath=${stringifyScalar(schema.properties?.boundary?.properties?.productionHotPathChanged?.const)}`,
  ].join(";");
}

function summarizeBoundaryContract(schema = {}) {
  const boundary = schema.properties?.boundary?.properties ?? {};
  return [
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
    const report = auditWorkflowPluginManagementAuditDetail(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatWorkflowPluginManagementAuditDetailAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
