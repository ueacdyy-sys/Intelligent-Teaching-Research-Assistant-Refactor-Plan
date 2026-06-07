import fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { submitWorkflowPluginDraftIntent } from "./workflow-plugin-draft-intent-runtime.mjs";

const defaultOutPath = "reports/workflow-plugin-draft-intent.current.json";
const sourceFiles = {
  gateway: "contracts/agent/controlled-write-intent-gateway.example.json",
  draftSchema: "contracts/workflow/workflow-plugin-draft.schema.json",
  pluginDraftExample: "contracts/workflow/plugin-draft.example.json",
  runtime: "tools/workflow-plugin-draft-intent-runtime.mjs",
  runtimeTest: "tools/workflow-plugin-draft-intent-runtime.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
};

const forbiddenRuntimeClaims = [
  "admitWorkflowPluginRegistryEntry",
  "ALLOW_SAVE",
  "registrySaveDecision",
  "executionCandidateAllowed: true",
  "localGeneratedCodeExecuted: true",
  "workflowPublishAllowed: true",
  "execSync(",
  "spawn(",
];

export function auditWorkflowPluginDraftIntentRuntime(inputs, options = {}) {
  const findings = [];
  const gateway = parseJson(inputs.gateway, {});
  const draftSchema = parseJson(inputs.draftSchema, {});
  const pluginDraftExample = parseJson(inputs.pluginDraftExample, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const runtimeProbe = runRuntimeProbe(pluginDraftExample, options);

  addFinding(findings, {
    id: "contract.gateway_allowlists_workflow_plugin_draft",
    passed: (gateway.acceptedIntents ?? []).some((intent) =>
      intent.intentId === "draft_workflow_plugin" &&
      intent.workerAgent === "WorkflowAgent" &&
      intent.commandPort?.portName === "WorkflowDraftCommandPort" &&
      intent.commandPort?.operation === "submitWorkflowPluginDraftIntent" &&
      intent.approvalRequired === true &&
      intent.executionCandidateAllowed === false &&
      intent.directDatabaseWriteAllowed === false &&
      intent.finalEvaluationWriteAllowed === false
    ),
    actual: summarizeGateway(gateway),
    expected: "draft_workflow_plugin -> WorkflowDraftCommandPort.submitWorkflowPluginDraftIntent, review-only",
    remediation: "Keep workflow/plugin drafts behind the shared controlled write-intent gateway.",
  });

  addFinding(findings, {
    id: "draft_contract.generated_review_only",
    passed: hasAll(requiredFields(draftSchema), [
      "userIntent",
      "generatedFiles",
      "executionMode",
      "sandboxRequired",
      "humanApprovalRequired",
      "allowedHostAccess",
      "registrySaveAllowed",
    ]) &&
      draftSchema.properties?.executionMode?.const === "DRY_RUN_ONLY" &&
      draftSchema.properties?.sandboxRequired?.const === true &&
      draftSchema.properties?.humanApprovalRequired?.const === true &&
      draftSchema.properties?.allowedHostAccess?.const === "NONE" &&
      draftSchema.properties?.registrySaveAllowed?.const === false,
    actual: summarizeDraftContract(draftSchema),
    expected: "generated files + DRY_RUN_ONLY + sandbox + human approval + no host access + no registry save",
    remediation: "Workflow/plugin draft command intent must not weaken generated artifact safety constraints.",
  });

  addFinding(findings, {
    id: "runtime.requires_principal_permission_and_evidence",
    passed: includesAll(inputs.runtime, [
      "requiredEvidenceFields",
      "authorizePrincipal",
      "assertDraftSafety",
      "AGENT_COMMAND_SUBMIT",
      "REMOTE_SOCIAL",
      "WORKFLOW_PLUGIN_DRAFT_INTENT_REVIEW_REQUIRED",
      "approvalArtifactRef",
      "rollbackPlanRef",
      "auditTraceRef",
      "idempotencyKey",
    ]),
    actual: "runtime principal, permission, draft safety, and evidence symbols scanned",
    expected: "principal authorization plus shared context, guardrail, route, approval, rollback, audit, hash, summary, and idempotency evidence",
    remediation: "Do not accept workflow/plugin draft intents without full review evidence and authorization.",
  });

  addFinding(findings, {
    id: "runtime.append_only_no_execution_or_registry_save",
    passed: includesAll(inputs.runtime, [
      "appendCommandIntent",
      "fs.appendFileSync",
      "findExistingRecordByIdempotencyKey",
      "workflow-command-log",
      "registrySaveAllowed: false",
      "executionCandidateAllowed: false",
      "localGeneratedCodeExecuted: false",
      "workflowPublishAllowed: false",
    ]) && !hasForbiddenRuntimeClaim(inputs.runtime),
    actual: summarizePresence(inputs.runtime, ["appendFileSync", "ALLOW_SAVE", "execSync(", "executionCandidateAllowed: true"]),
    expected: "append-only command log; no registry admission, generated-code execution, workflow publish, or execution candidate",
    remediation: "This runtime may record a review intent only; sandbox execution and registry admission remain separate later gates.",
  });

  addFinding(findings, {
    id: "runtime.probe_returns_review_required",
    passed: runtimeProbe.status === "PASS" &&
      runtimeProbe.result?.status === "REVIEW_REQUIRED" &&
      runtimeProbe.result?.boundary?.registrySaveAllowed === false &&
      runtimeProbe.logRecordCount === 1,
    actual: runtimeProbe.status === "PASS"
      ? `status=${runtimeProbe.result.status};records=${runtimeProbe.logRecordCount};registry=${runtimeProbe.result.boundary.registrySaveAllowed}`
      : runtimeProbe.error,
    expected: "REVIEW_REQUIRED with one command-log record and registrySaveAllowed=false",
    remediation: "The runtime probe must prove the command intent path appends evidence without publishing a workflow/plugin.",
  });

  addFinding(findings, {
    id: "tests.cover_negative_and_idempotency_paths",
    passed: includesAll(inputs.runtimeTest, [
      "rejects missing review evidence",
      "rejects student principals",
      "replays an existing idempotent command intent",
      "rejects unsafe drafts",
      "registrySaveAllowed: true",
    ]),
    actual: "runtime test negative paths scanned",
    expected: "missing evidence, forbidden student, idempotency replay, and unsafe registry save are tested",
    remediation: "Keep failure modes covered before adding any generated-code execution path.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime_audit",
    passed: packageJson.scripts?.["audit:workflow-plugin-draft-intent"]?.includes("workflow-plugin-draft-intent-audit.mjs") &&
      inputs.qualityGate.includes("Workflow plugin draft intent runtime audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + inputs.qualityGate, [
      "audit:workflow-plugin-draft-intent",
      "Workflow plugin draft intent runtime audit",
    ]),
    expected: "npm script and strict quality command include workflow plugin draft intent audit",
    remediation: "Add this runtime audit to the strict quality gate so the slice cannot silently disappear.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_draft_intent_report",
    passed: includesAll(inputs.rootWorkflowCoverage, [
      "workflowPluginDraftIntent",
      "workflow-plugin-draft-intent.current.json",
      "[\"workflowPluginDraftIntent\", \"READY\"]",
    ]),
    actual: summarizePresence(inputs.rootWorkflowCoverage, ["workflowPluginDraftIntent", "workflow-plugin-draft-intent.current.json"]),
    expected: "workflow_plugin_self_evolution root coverage requires workflow plugin draft intent report",
    remediation: "Root workflow coverage should include the new command-intent runtime evidence.",
  });

  addFinding(findings, {
    id: "quality.structure_tracks_slice",
    passed: includesAll(inputs.verifyStructure, [
      "workflow-plugin-draft-intent-runtime.mjs",
      "workflow-plugin-draft-intent-runtime.test.mjs",
      "workflow-plugin-draft-intent-audit.mjs",
      "workflow-plugin-draft-intent-audit.test.mjs",
      "0228-workflow-plugin-draft-command-intent-runtime.md",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires runtime, audit, tests, and SDD",
    remediation: "Add the slice to structure verification.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "WORKFLOW_PLUGIN_DRAFT_INTENT_RUNTIME",
    commandPort: "WorkflowDraftCommandPort.submitWorkflowPluginDraftIntent",
    boundary: {
      status: "REVIEW_REQUIRED",
      executionCandidateAllowed: false,
      localGeneratedCodeExecuted: false,
      workflowPublishAllowed: false,
      registrySaveAllowed: false,
      directDatabaseWriteAllowed: false,
    },
    runtimeProbe,
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the workflow/plugin controlled write-intent runtime slice; continue module-by-module refactor without reopening production10k pressure tests."
      : "Fix workflow/plugin draft command-intent runtime boundaries before adding sandbox execution or registry publish paths.",
  };
}

export function formatWorkflowPluginDraftIntentAudit(report) {
  const lines = [
    `Workflow plugin draft intent runtime: ${report.readiness}`,
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

function runRuntimeProbe(pluginDraftExample, options = {}) {
  try {
    const commandLogPath = path.join(
      mkdtempSync(path.join(tmpdir(), "workflow-plugin-draft-intent-audit-")),
      "workflow-plugin-draft-intents.jsonl",
    );
    const result = submitWorkflowPluginDraftIntent({
      intentId: "draft_workflow_plugin",
      principal: {
        principalId: "teacher_audit_001",
        role: "TEACHER",
        subjectType: "USER",
        entryPoint: "DESKTOP_TEACHER",
        scopes: ["AGENT_COMMAND_SUBMIT"],
        requiresHarnessApproval: false,
        sessionId: "session_audit_001",
      },
      draft: pluginDraftExample,
      sharedContextRef: "shared-context:audit-workflow-plugin-draft",
      guardrailResultRef: "guardrail:audit-workflow-plugin-draft",
      routeDecisionRef: "route:audit-workflow-plugin-draft",
      inputHash: "sha256:audit-workflow-plugin-draft-input",
      outputSummary: "Audit probe generated workflow/plugin draft intent for review only.",
      approvalArtifactRef: "approval-artifact:audit-workflow-plugin-draft",
      rollbackPlanRef: "rollback:audit-workflow-plugin-draft",
      auditTraceRef: "audit:audit-workflow-plugin-draft",
      idempotencyKey: "audit-workflow-plugin-draft-intent",
    }, {
      commandLogPath,
      generatedAt: options.generatedAt ?? "2026-06-05T00:00:00.000Z",
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

function summarizeGateway(gateway = {}) {
  return (gateway.acceptedIntents ?? []).map((intent) =>
    `${intent.intentId}:${intent.workerAgent}:${intent.commandPort?.portName}.${intent.commandPort?.operation}:approval=${intent.approvalRequired}:execute=${intent.executionCandidateAllowed}`,
  ).join(";");
}

function summarizeDraftContract(schema = {}) {
  return [
    `required=${requiredFields(schema).filter((field) => ["generatedFiles", "executionMode", "sandboxRequired", "humanApprovalRequired", "allowedHostAccess", "registrySaveAllowed"].includes(field)).join(",")}`,
    `executionMode=${stringifyScalar(schema.properties?.executionMode?.const)}`,
    `sandbox=${stringifyScalar(schema.properties?.sandboxRequired?.const)}`,
    `approval=${stringifyScalar(schema.properties?.humanApprovalRequired?.const)}`,
    `host=${stringifyScalar(schema.properties?.allowedHostAccess?.const)}`,
    `registry=${stringifyScalar(schema.properties?.registrySaveAllowed?.const)}`,
  ].join(" ");
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
    const report = auditWorkflowPluginDraftIntentRuntime(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatWorkflowPluginDraftIntentAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
