import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { renderWorkflowPluginManagementReadonlyList } from "./workflow-plugin-management-readonly-list-runtime.mjs";

const defaultOutPath = "reports/workflow-plugin-management-readonly-list.current.json";
const sourceFiles = {
  readonlyListSchema: "contracts/workflow/workflow-plugin-management-readonly-list.schema.json",
  readonlyListExample: "contracts/workflow/workflow-plugin-management-readonly-list.example.json",
  auditDetailReport: "reports/workflow-plugin-management-audit-detail.current.json",
  runtime: "tools/workflow-plugin-management-readonly-list-runtime.mjs",
  runtimeTest: "tools/workflow-plugin-management-readonly-list-runtime.test.mjs",
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

export function auditWorkflowPluginManagementReadonlyList(inputs, options = {}) {
  const findings = [];
  const schema = parseJson(inputs.readonlyListSchema, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const auditDetailReport = parseJson(inputs.auditDetailReport, {});
  const listProbe = runRuntimeProbe(auditDetailReport, options);

  addFinding(findings, {
    id: "readonly_list.contract_is_admin_list_projection",
    passed: schema.properties?.surface?.const === "ADMIN_WORKFLOW_PLUGIN_MANAGEMENT_LIST" &&
      schema.properties?.entries?.minItems === 1 &&
      schema.properties?.entries?.items?.properties?.evidenceStageCount?.const === 7 &&
      schema.properties?.entries?.items?.properties?.disabledActionCount?.const === 4 &&
      schema.properties?.entries?.items?.properties?.controlActions?.items?.properties?.enabled?.const === false &&
      schema.properties?.boundary?.properties?.readOnly?.const === true &&
      schema.properties?.boundary?.properties?.productionHotPathChanged?.const === false,
    actual: summarizeListContract(schema),
    expected: "admin workflow/plugin management list projection with read-only rows, seven evidence stages, four disabled actions, and no hot-path change",
    remediation: "Management list must stay a read-only projection over audit detail evidence.",
  });

  addFinding(findings, {
    id: "readonly_list.contract_keeps_all_entries_blocked",
    passed: schema.properties?.summary?.properties?.allEntriesReadOnly?.const === true &&
      schema.properties?.summary?.properties?.allActionsDisabled?.const === true &&
      schema.properties?.boundary?.properties?.allEntriesReadOnly?.const === true &&
      schema.properties?.boundary?.properties?.allActionsDisabled?.const === true &&
      schema.properties?.boundary?.properties?.workflowPublishAllowed?.const === false &&
      schema.properties?.boundary?.properties?.pluginMarketplaceExposureAllowed?.const === false &&
      schema.properties?.boundary?.properties?.executionCandidateAllowed?.const === false &&
      schema.properties?.boundary?.properties?.localExecutionEnabled?.const === false &&
      schema.properties?.boundary?.properties?.processLaunchAllowed?.const === false &&
      schema.properties?.boundary?.properties?.hostWriteAllowed?.const === false &&
      schema.properties?.boundary?.properties?.requiresFutureSdd?.const === true,
    actual: summarizeBoundaryContract(schema),
    expected: "management list blocks publish, marketplace, execution candidates, local execution, process launch, and host writes for every row",
    remediation: "Do not use the list projection to enable workflow/plugin control actions.",
  });

  addFinding(findings, {
    id: "runtime.requires_admin_read_and_audit_detail_source",
    passed: includesAll(inputs.runtime, [
      "authorizeManagementListReader",
      "AGENT_INTERNAL",
      "ADMIN_SYSTEM",
      "role === \"STUDENT\"",
      "subjectType === \"REMOTE_CHANNEL\"",
      "auditDetails",
      "ADMIN_WORKFLOW_PLUGIN_AUDIT_DETAIL",
      "READONLY_AUDIT_READY",
      "EXECUTION_CANDIDATES_DISABLED",
      "PUBLICATION_DISABLED",
      "ALL_ACTIONS_DISABLED",
    ]),
    actual: "runtime authorization and audit-detail source symbols scanned",
    expected: "internal service/admin read boundary plus audit detail source validation",
    remediation: "Management list should render only from complete read-only audit detail evidence.",
  });

  addFinding(findings, {
    id: "runtime.readonly_no_side_effects_or_enabled_controls",
    passed: includesAll(inputs.runtime, [
      "readOnly: true",
      "allEntriesReadOnly: true",
      "allActionsDisabled: true",
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
    remediation: "Keep the management list runtime as a pure projection over audit detail reports.",
  });

  addFinding(findings, {
    id: "runtime.list_probe_renders_readonly_rows",
    passed: listProbe.status === "PASS" &&
      listProbe.result?.status === "WORKFLOW_PLUGIN_MANAGEMENT_READONLY_LIST_READY" &&
      listProbe.result?.list?.surface === "ADMIN_WORKFLOW_PLUGIN_MANAGEMENT_LIST" &&
      listProbe.result?.list?.entries?.length >= 1 &&
      listProbe.result?.list?.entries?.every((entry) => entry.evidenceStageCount === 7 &&
        entry.disabledActionCount === 4 &&
        entry.controlActions.every((action) => action.enabled === false) &&
        entry.boundary.readOnly === true &&
        entry.boundary.workflowPublishAllowed === false &&
        entry.boundary.executionCandidateAllowed === false) &&
      listProbe.result?.boundary?.allEntriesReadOnly === true &&
      listProbe.result?.boundary?.allActionsDisabled === true &&
      listProbe.result?.boundary?.productionHotPathChanged === false,
    actual: listProbe.status === "PASS"
      ? `status=${listProbe.result.status};entries=${listProbe.result.list.entries.length};allDisabled=${listProbe.result.boundary.allActionsDisabled};hotPath=${listProbe.result.boundary.productionHotPathChanged}`
      : listProbe.error,
    expected: "runtime probe renders at least one read-only management row with disabled actions and no hot-path change",
    remediation: "Management list must summarize audit detail evidence without enabling actions.",
  });

  addFinding(findings, {
    id: "tests.cover_list_unauthorized_empty_unsafe_and_duplicate_paths",
    passed: includesAll(inputs.runtimeTest, [
      "renders a read-only management list from audit detail evidence",
      "rejects ordinary teacher principals",
      "rejects empty audit detail lists",
      "rejects audit details with enabled control actions",
      "rejects audit details that expose execution candidates",
      "rejects duplicate registry entries",
    ]),
    actual: "runtime test positive and negative paths scanned",
    expected: "read-only list, unauthorized principal, empty list, enabled action, execution exposure, and duplicate entry paths are tested",
    remediation: "Keep list-view regressions covered before any real UI is added.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_readonly_list",
    passed: packageJson.scripts?.["audit:workflow-plugin-management-readonly-list"]?.includes("workflow-plugin-management-readonly-list-audit.mjs") &&
      inputs.qualityGate.includes("Workflow plugin management read-only list audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + inputs.qualityGate, [
      "audit:workflow-plugin-management-readonly-list",
      "Workflow plugin management read-only list audit",
    ]),
    expected: "npm script and strict quality command include workflow plugin management read-only list audit",
    remediation: "Add this read-only list slice to the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_readonly_list_report",
    passed: includesAll(inputs.rootWorkflowCoverage, [
      "workflowPluginManagementReadonlyList",
      "workflow-plugin-management-readonly-list.current.json",
      "[\"workflowPluginManagementReadonlyList\", \"READY\"]",
    ]),
    actual: summarizePresence(inputs.rootWorkflowCoverage, [
      "workflowPluginManagementReadonlyList",
      "workflow-plugin-management-readonly-list.current.json",
    ]),
    expected: "workflow_plugin_self_evolution root coverage requires management read-only list report",
    remediation: "Root workflow coverage should include read-only list evidence before UI list claims.",
  });

  addFinding(findings, {
    id: "quality.structure_tracks_slice",
    passed: includesAll(inputs.verifyStructure, [
      "workflow-plugin-management-readonly-list.schema.json",
      "workflow-plugin-management-readonly-list.example.json",
      "workflow-plugin-management-readonly-list-runtime.mjs",
      "workflow-plugin-management-readonly-list-runtime.test.mjs",
      "workflow-plugin-management-readonly-list-audit.mjs",
      "workflow-plugin-management-readonly-list-audit.test.mjs",
      "0236-workflow-plugin-management-readonly-list.md",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires management read-only list contract, runtime, audit, tests, and SDD",
    remediation: "Add the management read-only list slice to structure verification.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "WORKFLOW_PLUGIN_MANAGEMENT_READONLY_LIST",
    readPort: "WorkflowManagementReadPort.renderWorkflowPluginManagementReadonlyList",
    boundary: {
      status: "WORKFLOW_PLUGIN_MANAGEMENT_READONLY_LIST_READY",
      readOnly: true,
      listItemCount: listProbe.result?.list?.entries?.length ?? 0,
      evidenceStageCountPerItem: 7,
      disabledActionCountPerItem: 4,
      allEntriesReadOnly: true,
      allActionsDisabled: true,
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
      list: listProbe,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as read-only workflow/plugin management list evidence; real UI controls, publication, marketplace exposure, and host execution remain future gated slices."
      : "Fix workflow/plugin management read-only list boundaries before adding a UI list surface.",
  };
}

export function formatWorkflowPluginManagementReadonlyListAudit(report) {
  const lines = [
    `Workflow plugin management read-only list: ${report.readiness}`,
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

function runRuntimeProbe(auditDetailReport, options = {}) {
  try {
    const detailResult = auditDetailReport.runtimeProbes?.detail?.result;
    const result = renderWorkflowPluginManagementReadonlyList({
      principal: {
        principalId: "workflow_management_readonly_list_service",
        role: "SERVICE",
        subjectType: "SERVICE",
        entryPoint: "AGENT_INTERNAL",
        scopes: ["ADMIN_SYSTEM"],
        requiresHarnessApproval: false,
        sessionId: "workflow_management_readonly_list_session",
      },
      auditDetails: [detailResult],
    }, {
      generatedAt: options.generatedAt ?? "2026-06-05T08:00:00.000Z",
    });
    return { status: "PASS", result };
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

function summarizeListContract(schema = {}) {
  const entry = schema.properties?.entries?.items?.properties ?? {};
  return [
    `surface=${stringifyScalar(schema.properties?.surface?.const)}`,
    `entriesMin=${stringifyScalar(schema.properties?.entries?.minItems)}`,
    `stages=${stringifyScalar(entry.evidenceStageCount?.const)}`,
    `disabledActions=${stringifyScalar(entry.disabledActionCount?.const)}`,
    `actionEnabled=${stringifyScalar(entry.controlActions?.items?.properties?.enabled?.const)}`,
    `readOnly=${stringifyScalar(schema.properties?.boundary?.properties?.readOnly?.const)}`,
    `hotPath=${stringifyScalar(schema.properties?.boundary?.properties?.productionHotPathChanged?.const)}`,
  ].join(";");
}

function summarizeBoundaryContract(schema = {}) {
  const boundary = schema.properties?.boundary?.properties ?? {};
  return [
    `allEntriesReadOnly=${stringifyScalar(boundary.allEntriesReadOnly?.const)}`,
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
    const report = auditWorkflowPluginManagementReadonlyList(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatWorkflowPluginManagementReadonlyListAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
