import fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { recordWorkflowPluginRegistryAdmission } from "./workflow-plugin-registry-admission-runtime.mjs";

const defaultOutPath = "reports/workflow-plugin-registry-admission-runtime.current.json";
const sourceFiles = {
  registryEntrySchema: "contracts/workflow/workflow-plugin-registry-entry.schema.json",
  workflowDraftExample: "contracts/workflow/workflow-draft.example.json",
  sandboxRunExample: "contracts/workflow/workflow-plugin-sandbox-run.example.json",
  approvalExample: "contracts/workflow/workflow-plugin-approval.example.json",
  staticAdmission: "tools/workflow-plugin-registry-admission.mjs",
  runtime: "tools/workflow-plugin-registry-admission-runtime.mjs",
  runtimeTest: "tools/workflow-plugin-registry-admission-runtime.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
};

const forbiddenRuntimeClaims = [
  "workflowPublishAllowed: true",
  "executionCandidateAllowed: true",
  "localExecutionEnabled: true",
  "localGeneratedCodeExecuted: true",
  "generatedCodeExecutedOnHost: true",
  "execSync(",
  "spawn(",
  "execFile(",
];

export function auditWorkflowPluginRegistryAdmissionRuntime(inputs, options = {}) {
  const findings = [];
  const registryEntrySchema = parseJson(inputs.registryEntrySchema, {});
  const workflowDraftExample = parseJson(inputs.workflowDraftExample, {});
  const sandboxRunExample = parseJson(inputs.sandboxRunExample, {});
  const approvalExample = parseJson(inputs.approvalExample, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const allowProbe = runAllowedProbe(workflowDraftExample, sandboxRunExample, approvalExample, options);
  const rejectProbe = runRejectedProbe(workflowDraftExample, sandboxRunExample, revisionApproval(approvalExample), options);

  addFinding(findings, {
    id: "registry_entry_contract.dry_run_only",
    passed: registryEntrySchema.properties?.executionMode?.const === "DRY_RUN_ONLY" &&
      registryEntrySchema.properties?.localExecutionEnabled?.const === false &&
      hasAll(requiredFields(registryEntrySchema), ["registryEntryId", "executionMode", "localExecutionEnabled", "rollbackPlan"]),
    actual: summarizeRegistryEntryContract(registryEntrySchema),
    expected: "registry entries require executionMode=DRY_RUN_ONLY, localExecutionEnabled=false, rollback plan, and stable ids",
    remediation: "Registry admission must not create executable workflow/plugin entries.",
  });

  addFinding(findings, {
    id: "runtime.requires_internal_admin_and_evidence",
    passed: includesAll(inputs.runtime, [
      "authorizeRegistryWriter",
      "AGENT_INTERNAL",
      "ADMIN_SYSTEM",
      "role === \"STUDENT\"",
      "subjectType === \"REMOTE_CHANNEL\"",
      "humanApprovalRecordRef",
      "draftIntentRecordRef",
      "sandboxResultRecordRef",
      "sharedContextRef",
      "guardrailResultRef",
      "routeDecisionRef",
      "rollbackPlanRef",
      "auditTraceRef",
      "idempotencyKey",
    ]),
    actual: "runtime writer authorization and evidence symbols scanned",
    expected: "internal service/admin with ADMIN_SYSTEM plus full draft/sandbox/human approval evidence",
    remediation: "Registry admission should only be recorded by trusted writers with complete review evidence.",
  });

  addFinding(findings, {
    id: "runtime.uses_static_admission_and_append_only_registry",
    passed: includesAll(inputs.runtime + inputs.staticAdmission, [
      "admitWorkflowPluginRegistryEntry",
      "JsonlWorkflowPluginRegistryStore",
      "store.append",
      "appendCommandIntent",
      "findExistingRecordByIdempotencyKey",
      "APPEND_ONLY_JSONL",
      "executionMode: \"DRY_RUN_ONLY\"",
      "localExecutionEnabled: false",
    ]),
    actual: summarizePresence(inputs.runtime + inputs.staticAdmission, [
      "admitWorkflowPluginRegistryEntry",
      "JsonlWorkflowPluginRegistryStore",
      "store.append",
      "APPEND_ONLY_JSONL",
    ]),
    expected: "runtime reuses static admission validation and persists only append-only dry-run registry entries",
    remediation: "Keep registry admission validation centralized and persistence append-only.",
  });

  addFinding(findings, {
    id: "runtime.no_publish_execution_or_host_run",
    passed: includesAll(inputs.runtime, [
      "workflowPublishAllowed: false",
      "executionCandidateAllowed: false",
      "localExecutionEnabled: false",
      "localGeneratedCodeExecuted: false",
      "generatedCodeExecutedOnHost: false",
      "directDatabaseWriteAllowed: false",
    ]) && !hasForbiddenRuntimeClaim(inputs.runtime),
    actual: summarizePresence(inputs.runtime, ["workflowPublishAllowed: true", "executionCandidateAllowed: true", "localExecutionEnabled: true", "execSync("]),
    expected: "registry admission must not publish, expose execution candidates, enable local execution, or shell out",
    remediation: "Registry admission stores catalog evidence only; real execution must remain a future explicit gate.",
  });

  addFinding(findings, {
    id: "runtime.allow_probe_persists_one_dry_run_entry",
    passed: allowProbe.status === "PASS" &&
      allowProbe.result?.status === "REGISTRY_ADMISSION_SAVED_DRY_RUN_ONLY" &&
      allowProbe.result?.registryEntry?.executionMode === "DRY_RUN_ONLY" &&
      allowProbe.result?.registryEntry?.localExecutionEnabled === false &&
      allowProbe.commandRecordCount === 1 &&
      allowProbe.registryEntryCount === 1,
    actual: allowProbe.status === "PASS"
      ? `status=${allowProbe.result.status};entries=${allowProbe.registryEntryCount};commands=${allowProbe.commandRecordCount};local=${allowProbe.result.registryEntry.localExecutionEnabled}`
      : allowProbe.error,
    expected: "approved sandboxed workflow/plugin persists exactly one dry-run registry entry and one command record",
    remediation: "Approved registry admission should save a dry-run catalog entry once, with idempotent command evidence.",
  });

  addFinding(findings, {
    id: "runtime.rejected_probe_blocks_persistence",
    passed: rejectProbe.status === "REJECTED" &&
      rejectProbe.error?.includes("APPROVED with ALLOW_SAVE") &&
      rejectProbe.commandRecordCount === 0 &&
      rejectProbe.registryEntryCount === 0,
    actual: `status=${rejectProbe.status};commands=${rejectProbe.commandRecordCount};entries=${rejectProbe.registryEntryCount};error=${rejectProbe.error}`,
    expected: "non-approved human review is rejected before command or registry persistence",
    remediation: "Human revision requests must go back through revision feedback instead of registry admission.",
  });

  addFinding(findings, {
    id: "tests.cover_authorization_safety_and_idempotency",
    passed: includesAll(inputs.runtimeTest, [
      "persists an approved workflow/plugin registry entry as dry-run only",
      "rejects non-admin teachers",
      "rejects human approval that requested revision",
      "rejects failed sandbox evidence",
      "replays an idempotent registry admission",
    ]),
    actual: "runtime test negative paths scanned",
    expected: "approved persistence, unauthorized writer, revision approval, failed sandbox, and idempotency replay are tested",
    remediation: "Keep registry admission authorization and safety regressions covered.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime_audit",
    passed: packageJson.scripts?.["audit:workflow-plugin-registry-admission-runtime"]?.includes("workflow-plugin-registry-admission-runtime-audit.mjs") &&
      inputs.qualityGate.includes("Workflow plugin registry admission runtime audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + inputs.qualityGate, [
      "audit:workflow-plugin-registry-admission-runtime",
      "Workflow plugin registry admission runtime audit",
    ]),
    expected: "npm script and strict quality command include workflow plugin registry admission runtime audit",
    remediation: "Add this runtime audit to the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_registry_runtime_report",
    passed: includesAll(inputs.rootWorkflowCoverage, [
      "workflowPluginRegistryAdmissionRuntime",
      "workflow-plugin-registry-admission-runtime.current.json",
      "[\"workflowPluginRegistryAdmissionRuntime\", \"READY\"]",
    ]),
    actual: summarizePresence(inputs.rootWorkflowCoverage, ["workflowPluginRegistryAdmissionRuntime", "workflow-plugin-registry-admission-runtime.current.json"]),
    expected: "workflow_plugin_self_evolution root coverage requires registry admission runtime report",
    remediation: "Root workflow coverage should include dry-run registry admission runtime evidence.",
  });

  addFinding(findings, {
    id: "quality.structure_tracks_slice",
    passed: includesAll(inputs.verifyStructure, [
      "workflow-plugin-registry-admission-runtime.mjs",
      "workflow-plugin-registry-admission-runtime.test.mjs",
      "workflow-plugin-registry-admission-runtime-audit.mjs",
      "workflow-plugin-registry-admission-runtime-audit.test.mjs",
      "0231-workflow-plugin-registry-admission-runtime.md",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires runtime, audit, tests, and SDD",
    remediation: "Add the registry admission runtime slice to structure verification.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "WORKFLOW_PLUGIN_REGISTRY_ADMISSION_RUNTIME",
    commandPort: "WorkflowRegistryCommandPort.recordWorkflowPluginRegistryAdmission",
    boundary: {
      savedStatus: "REGISTRY_ADMISSION_SAVED_DRY_RUN_ONLY",
      registryEntryPersisted: true,
      executionMode: "DRY_RUN_ONLY",
      localExecutionEnabled: false,
      workflowPublishAllowed: false,
      executionCandidateAllowed: false,
      localGeneratedCodeExecuted: false,
    },
    runtimeProbes: {
      allow: allowProbe,
      rejected: rejectProbe,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as dry-run registry admission evidence; publishing and execution candidate runtimes remain future gated slices."
      : "Fix registry admission runtime boundaries before persisting workflow/plugin registry entries.",
  };
}

export function formatWorkflowPluginRegistryAdmissionRuntimeAudit(report) {
  const lines = [
    `Workflow plugin registry admission runtime: ${report.readiness}`,
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

function runAllowedProbe(draft, sandboxRun, approval, options = {}) {
  const paths = tempPaths("allow");
  try {
    const result = recordWorkflowPluginRegistryAdmission(baseInput(draft, sandboxRun, approval, "allow"), {
      commandLogPath: paths.commandLogPath,
      registryStorePath: paths.registryStorePath,
      generatedAt: options.generatedAt ?? "2026-06-05T03:00:00.000Z",
    });
    return {
      status: "PASS",
      result,
      commandRecordCount: readRecordCount(paths.commandLogPath),
      registryEntryCount: readRecordCount(paths.registryStorePath),
    };
  } catch (error) {
    return {
      status: "FAIL",
      error: error.message,
      commandRecordCount: readRecordCount(paths.commandLogPath),
      registryEntryCount: readRecordCount(paths.registryStorePath),
    };
  }
}

function runRejectedProbe(draft, sandboxRun, approval, options = {}) {
  const paths = tempPaths("reject");
  try {
    const result = recordWorkflowPluginRegistryAdmission(baseInput(draft, sandboxRun, approval, "reject"), {
      commandLogPath: paths.commandLogPath,
      registryStorePath: paths.registryStorePath,
      generatedAt: options.generatedAt ?? "2026-06-05T03:00:00.000Z",
    });
    return {
      status: "PASS",
      result,
      commandRecordCount: readRecordCount(paths.commandLogPath),
      registryEntryCount: readRecordCount(paths.registryStorePath),
    };
  } catch (error) {
    return {
      status: "REJECTED",
      error: error.message,
      commandRecordCount: readRecordCount(paths.commandLogPath),
      registryEntryCount: readRecordCount(paths.registryStorePath),
    };
  }
}

function baseInput(draft, sandboxRun, approval, scenario) {
  return {
    principal: {
      principalId: "workflow_registry_admission_audit_service",
      role: "SERVICE",
      subjectType: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      scopes: ["ADMIN_SYSTEM"],
      requiresHarnessApproval: false,
      sessionId: "workflow_registry_admission_audit_session",
    },
    draft,
    sandboxRun,
    approval,
    registry: {
      registryEntryId: `workflow_registry_audit_${scenario}`,
      name: "Lesson Archive Review",
      version: "0.1.0",
      rollbackPlan: "Disable the dry-run registry entry and keep all review evidence for audit.",
    },
    draftIntentRecordRef: "workflow-draft-intent:audit-workflow-draft",
    sandboxResultRecordRef: "workflow-sandbox-result:audit-sandbox-result",
    humanApprovalRecordRef: "workflow-human-approval:audit-human-approval",
    sharedContextRef: "shared-context:audit-workflow-registry-admission",
    guardrailResultRef: "guardrail:audit-workflow-registry-admission",
    routeDecisionRef: "route:audit-workflow-registry-admission",
    inputHash: `sha256:audit-workflow-registry-admission-${scenario}`,
    outputSummary: `Audit ${scenario} registry admission recorded.`,
    rollbackPlanRef: "rollback:audit-workflow-registry-admission",
    auditTraceRef: "audit:audit-workflow-registry-admission",
    idempotencyKey: `audit-workflow-registry-admission-${scenario}`,
  };
}

function revisionApproval(approval) {
  return {
    ...approval,
    approvalId: `${approval.approvalId}_revision`,
    decision: "REVISION_REQUESTED",
    registrySaveDecision: "BLOCK_SAVE",
    comments: "Human review requested another iteration.",
  };
}

function tempPaths(scenario) {
  const dir = mkdtempSync(path.join(tmpdir(), `workflow-registry-admission-${scenario}-`));
  return {
    commandLogPath: path.join(dir, "command-log.jsonl"),
    registryStorePath: path.join(dir, "registry.jsonl"),
  };
}

function readRecordCount(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  return fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/u).filter(Boolean).length;
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

function summarizeRegistryEntryContract(schema = {}) {
  return [
    `executionMode=${stringifyScalar(schema.properties?.executionMode?.const)}`,
    `localExecution=${stringifyScalar(schema.properties?.localExecutionEnabled?.const)}`,
    `required=${requiredFields(schema).filter((field) => ["registryEntryId", "executionMode", "localExecutionEnabled", "rollbackPlan"].includes(field)).join(",")}`,
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
    const report = auditWorkflowPluginRegistryAdmissionRuntime(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatWorkflowPluginRegistryAdmissionRuntimeAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
