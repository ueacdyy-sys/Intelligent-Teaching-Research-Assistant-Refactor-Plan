import fs from "node:fs";
import path from "node:path";

import {
  JsonlWorkflowPluginRegistryStore,
  admitWorkflowPluginRegistryEntry,
} from "./workflow-plugin-registry-admission.mjs";

export const WORKFLOW_PLUGIN_REGISTRY_ADMISSION_COMMAND_PORT = "WorkflowRegistryCommandPort.recordWorkflowPluginRegistryAdmission";
export const WORKFLOW_PLUGIN_REGISTRY_SAVED_DRY_RUN_ONLY = "REGISTRY_ADMISSION_SAVED_DRY_RUN_ONLY";
export const WORKFLOW_PLUGIN_REGISTRY_BLOCKED_REVISION_REQUIRED = "REGISTRY_ADMISSION_BLOCKED_REVISION_REQUIRED";

const schemaVersion = "2026-06-05.workflow-plugin.registry-admission-runtime.v1";
const resultSchemaVersion = "2026-06-05.workflow-plugin.registry-admission-recorded.v1";
const defaultCommandLogPath = "reports/workflow-command-log/workflow-plugin-registry-admissions.jsonl";
const defaultRegistryStorePath = "reports/workflow-plugin-registry/entries.jsonl";
const requiredEvidenceFields = [
  "draftIntentRecordRef",
  "sandboxResultRecordRef",
  "humanApprovalRecordRef",
  "sharedContextRef",
  "guardrailResultRef",
  "routeDecisionRef",
  "inputHash",
  "outputSummary",
  "rollbackPlanRef",
  "auditTraceRef",
  "idempotencyKey",
];

export function recordWorkflowPluginRegistryAdmission(input, options = {}) {
  const recordedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const commandLogPath = options.commandLogPath ?? defaultCommandLogPath;
  const registryStorePath = options.registryStorePath ?? defaultRegistryStorePath;
  const existing = findExistingRecordByIdempotencyKey(commandLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true, registryStorePath });
  }

  const admission = admitWorkflowPluginRegistryEntry({
    draft: normalized.draft,
    sandboxRun: normalized.sandboxRun,
    approval: normalized.approval,
    registryEntryId: normalized.registry.registryEntryId,
    name: normalized.registry.name,
    version: normalized.registry.version,
    rollbackPlan: normalized.registry.rollbackPlan,
    generatedAt: recordedAt,
  });
  const record = buildCommandRecord(normalized, admission, recordedAt, registryStorePath);
  if (admission.decision === "ALLOW_SAVE") {
    const store = new JsonlWorkflowPluginRegistryStore(path.resolve(registryStorePath));
    store.append(record.registryEntry);
  }
  appendCommandIntent(commandLogPath, record);
  return buildResult(record, { idempotentReplay: false, registryStorePath });
}

export function formatWorkflowPluginRegistryAdmission(result) {
  return [
    `Workflow plugin registry admission runtime: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Decision: ${result.admissionDecision}`,
    `Registry entry persisted: ${result.boundary.registryEntryPersisted}`,
    `Local execution: ${result.boundary.localExecutionEnabled ? "enabled" : "disabled"}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  const principal = assertPrincipal(input.principal);
  authorizeRegistryWriter(principal);
  const draft = assertDraft(input.draft);
  const sandboxRun = assertSandboxRun(input.sandboxRun, draft);
  const approval = assertApproval(input.approval, draft, sandboxRun);
  const registry = assertRegistryMetadata(input.registry);
  const evidence = assertEvidence(input);
  return {
    principal,
    draft,
    sandboxRun,
    approval,
    registry,
    ...evidence,
  };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "principal");
  const required = ["principalId", "role", "subjectType", "entryPoint", "scopes", "requiresHarnessApproval", "sessionId"];
  for (const field of required) {
    if (principal[field] === undefined || principal[field] === null || principal[field] === "") {
      throw registryError("WORKFLOW_REGISTRY_ADMISSION_MISSING_PRINCIPAL", `principal.${field} is required`);
    }
  }
  if (!Array.isArray(principal.scopes) || principal.scopes.length === 0) {
    throw registryError("WORKFLOW_REGISTRY_ADMISSION_MISSING_SCOPE", "principal.scopes must be non-empty");
  }
  return {
    principalId: String(principal.principalId),
    role: String(principal.role),
    subjectType: String(principal.subjectType),
    entryPoint: String(principal.entryPoint),
    scopes: principal.scopes.map(String),
    requiresHarnessApproval: principal.requiresHarnessApproval === true,
    sessionId: String(principal.sessionId),
  };
}

function authorizeRegistryWriter(principal) {
  if (principal.role === "STUDENT" || principal.subjectType === "REMOTE_CHANNEL") {
    throw registryError("WORKFLOW_REGISTRY_ADMISSION_FORBIDDEN_PRINCIPAL", "students and remote channels cannot record registry admission");
  }
  const isInternalService = principal.role === "SERVICE" &&
    principal.subjectType === "SERVICE" &&
    principal.entryPoint === "AGENT_INTERNAL";
  const isAdmin = principal.role === "ADMIN";
  if (!isInternalService && !isAdmin) {
    throw registryError("WORKFLOW_REGISTRY_ADMISSION_FORBIDDEN_PRINCIPAL", "registry admission must be recorded by an internal service or admin");
  }
  if (!principal.scopes.includes("ADMIN_SYSTEM")) {
    throw registryError("WORKFLOW_REGISTRY_ADMISSION_MISSING_PERMISSION", "ADMIN_SYSTEM scope is required for registry admission");
  }
}

function assertDraft(draft) {
  assertPlainObject(draft, "draft");
  const required = [
    "schemaVersion",
    "draftId",
    "artifactKind",
    "capabilityKind",
    "origin",
    "status",
    "userIntent",
    "executionMode",
    "sandboxRequired",
    "humanApprovalRequired",
    "allowedHostAccess",
    "registrySaveAllowed",
  ];
  for (const field of required) {
    if (draft[field] === undefined || draft[field] === null || draft[field] === "") {
      throw registryError("WORKFLOW_REGISTRY_ADMISSION_INVALID_DRAFT", `draft.${field} is required`);
    }
  }
  if (draft.schemaVersion !== "2026-05-30.workflow-plugin.draft.v1" ||
    draft.status !== "DRAFT" ||
    draft.executionMode !== "DRY_RUN_ONLY" ||
    draft.sandboxRequired !== true ||
    draft.humanApprovalRequired !== true ||
    draft.allowedHostAccess !== "NONE" ||
    draft.registrySaveAllowed !== false) {
    throw registryError("WORKFLOW_REGISTRY_ADMISSION_UNSAFE_DRAFT", "draft must remain review-only before registry admission");
  }
  return {
    ...draft,
    draftId: String(draft.draftId),
    artifactKind: String(draft.artifactKind),
    capabilityKind: String(draft.capabilityKind),
    origin: String(draft.origin),
  };
}

function assertSandboxRun(sandboxRun, draft) {
  assertPlainObject(sandboxRun, "sandboxRun");
  const required = [
    "schemaVersion",
    "runId",
    "draftId",
    "status",
    "executedInSandbox",
    "noHostWrite",
    "networkPolicy",
    "tests",
    "performanceSummary",
  ];
  for (const field of required) {
    if (sandboxRun[field] === undefined || sandboxRun[field] === null || sandboxRun[field] === "") {
      throw registryError("WORKFLOW_REGISTRY_ADMISSION_INVALID_SANDBOX_RUN", `sandboxRun.${field} is required`);
    }
  }
  if (sandboxRun.schemaVersion !== "2026-05-30.workflow-plugin.sandbox-run.v1") {
    throw registryError("WORKFLOW_REGISTRY_ADMISSION_INVALID_SANDBOX_RUN", "unsupported sandbox run schemaVersion");
  }
  if (sandboxRun.draftId !== draft.draftId) {
    throw registryError("WORKFLOW_REGISTRY_ADMISSION_DRAFT_MISMATCH", "sandboxRun.draftId must match draft.draftId");
  }
  if (sandboxRun.status !== "PASS") {
    throw registryError("WORKFLOW_REGISTRY_ADMISSION_SANDBOX_NOT_PASSED", "registry admission requires a passing sandbox result");
  }
  if (sandboxRun.executedInSandbox !== true ||
    sandboxRun.noHostWrite !== true ||
    sandboxRun.networkPolicy !== "DEFAULT_DENY") {
    throw registryError("WORKFLOW_REGISTRY_ADMISSION_UNSAFE_SANDBOX_RUN", "sandbox result must prove sandbox execution, no host writes, and default-deny networking");
  }
  if (!Array.isArray(sandboxRun.tests) || sandboxRun.tests.length === 0) {
    throw registryError("WORKFLOW_REGISTRY_ADMISSION_INVALID_SANDBOX_RUN", "sandboxRun.tests must be non-empty");
  }
  const tests = sandboxRun.tests.map(assertSandboxTest);
  if (tests.some((test) => test.status !== "PASS")) {
    throw registryError("WORKFLOW_REGISTRY_ADMISSION_INCONSISTENT_SANDBOX_RUN", "registry admission cannot proceed with failing sandbox tests");
  }
  assertPlainObject(sandboxRun.performanceSummary, "sandboxRun.performanceSummary");
  return {
    ...sandboxRun,
    runId: String(sandboxRun.runId),
    draftId: String(sandboxRun.draftId),
    status: String(sandboxRun.status),
    tests,
  };
}

function assertSandboxTest(test) {
  assertPlainObject(test, "sandboxRun.tests[]");
  for (const field of ["name", "status", "durationMs", "logRef"]) {
    if (test[field] === undefined || test[field] === null || test[field] === "") {
      throw registryError("WORKFLOW_REGISTRY_ADMISSION_INVALID_SANDBOX_RUN", `sandbox test ${field} is required`);
    }
  }
  if (!["PASS", "FAIL"].includes(test.status)) {
    throw registryError("WORKFLOW_REGISTRY_ADMISSION_INVALID_SANDBOX_RUN", "sandbox test status must be PASS or FAIL");
  }
  if (!Number.isInteger(test.durationMs) || test.durationMs < 0) {
    throw registryError("WORKFLOW_REGISTRY_ADMISSION_INVALID_SANDBOX_RUN", "sandbox test durationMs must be a non-negative integer");
  }
  return {
    name: String(test.name),
    status: String(test.status),
    durationMs: test.durationMs,
    logRef: String(test.logRef),
  };
}

function assertApproval(approval, draft, sandboxRun) {
  assertPlainObject(approval, "approval");
  const required = [
    "schemaVersion",
    "approvalId",
    "draftId",
    "sandboxRunId",
    "reviewerPrincipalId",
    "decision",
    "performanceReviewed",
    "effectReviewed",
    "registrySaveDecision",
    "reviewedAt",
  ];
  for (const field of required) {
    if (approval[field] === undefined || approval[field] === null || approval[field] === "") {
      throw registryError("WORKFLOW_REGISTRY_ADMISSION_INVALID_APPROVAL", `approval.${field} is required`);
    }
  }
  if (approval.schemaVersion !== "2026-05-30.workflow-plugin.approval.v1") {
    throw registryError("WORKFLOW_REGISTRY_ADMISSION_INVALID_APPROVAL", "unsupported approval schemaVersion");
  }
  if (approval.draftId !== draft.draftId || approval.sandboxRunId !== sandboxRun.runId) {
    throw registryError("WORKFLOW_REGISTRY_ADMISSION_DRAFT_MISMATCH", "approval must reference the same draft and sandbox run");
  }
  if (approval.decision !== "APPROVED" || approval.registrySaveDecision !== "ALLOW_SAVE") {
    throw registryError("WORKFLOW_REGISTRY_ADMISSION_APPROVAL_NOT_READY", "approval must be APPROVED with ALLOW_SAVE before registry admission");
  }
  if (approval.performanceReviewed !== true || approval.effectReviewed !== true) {
    throw registryError("WORKFLOW_REGISTRY_ADMISSION_MISSING_REVIEW", "performanceReviewed and effectReviewed must both be true");
  }
  return {
    ...approval,
    approvalId: String(approval.approvalId),
    draftId: String(approval.draftId),
    sandboxRunId: String(approval.sandboxRunId),
    reviewerPrincipalId: String(approval.reviewerPrincipalId),
    decision: String(approval.decision),
    registrySaveDecision: String(approval.registrySaveDecision),
    reviewedAt: String(approval.reviewedAt),
    performanceReviewed: approval.performanceReviewed === true,
    effectReviewed: approval.effectReviewed === true,
  };
}

function assertRegistryMetadata(registry) {
  assertPlainObject(registry, "registry");
  for (const field of ["registryEntryId", "name", "version", "rollbackPlan"]) {
    if (registry[field] === undefined || registry[field] === null || registry[field] === "") {
      throw registryError("WORKFLOW_REGISTRY_ADMISSION_INVALID_REGISTRY", `registry.${field} is required`);
    }
  }
  const registryEntryId = String(registry.registryEntryId);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,127}$/.test(registryEntryId)) {
    throw registryError("WORKFLOW_REGISTRY_ADMISSION_INVALID_REGISTRY", "registryEntryId must be a stable safe token");
  }
  return {
    registryEntryId,
    name: String(registry.name),
    version: String(registry.version),
    rollbackPlan: String(registry.rollbackPlan),
  };
}

function assertEvidence(input) {
  const evidence = {};
  for (const field of requiredEvidenceFields) {
    if (!input[field]) {
      throw registryError("WORKFLOW_REGISTRY_ADMISSION_MISSING_EVIDENCE", `${field} is required`);
    }
    evidence[field] = String(input[field]);
  }
  if (!evidence.inputHash.startsWith("sha256:")) {
    throw registryError("WORKFLOW_REGISTRY_ADMISSION_INVALID_EVIDENCE", "inputHash must be a sha256 reference");
  }
  return evidence;
}

function buildCommandRecord(normalized, admission, recordedAt, registryStorePath) {
  const allowed = admission.decision === "ALLOW_SAVE";
  return {
    schemaVersion,
    recordType: "WORKFLOW_PLUGIN_REGISTRY_ADMISSION",
    recordId: `workflow_plugin_registry_admission_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    commandPort: WORKFLOW_PLUGIN_REGISTRY_ADMISSION_COMMAND_PORT,
    status: allowed
      ? WORKFLOW_PLUGIN_REGISTRY_SAVED_DRY_RUN_ONLY
      : WORKFLOW_PLUGIN_REGISTRY_BLOCKED_REVISION_REQUIRED,
    principal: normalized.principal,
    admissionDecision: admission.decision,
    issues: admission.issues,
    draft: {
      draftId: normalized.draft.draftId,
      artifactKind: normalized.draft.artifactKind,
      capabilityKind: normalized.draft.capabilityKind,
      origin: normalized.draft.origin,
    },
    sandboxRun: {
      runId: normalized.sandboxRun.runId,
      draftId: normalized.sandboxRun.draftId,
      status: normalized.sandboxRun.status,
    },
    approval: {
      approvalId: normalized.approval.approvalId,
      reviewerPrincipalId: normalized.approval.reviewerPrincipalId,
      decision: normalized.approval.decision,
      performanceReviewed: normalized.approval.performanceReviewed,
      effectReviewed: normalized.approval.effectReviewed,
      registrySaveDecision: normalized.approval.registrySaveDecision,
      reviewedAt: normalized.approval.reviewedAt,
    },
    registryEntry: admission.registryEntry,
    registryStorePath,
    evidence: {
      draftIntentRecordRef: normalized.draftIntentRecordRef,
      sandboxResultRecordRef: normalized.sandboxResultRecordRef,
      humanApprovalRecordRef: normalized.humanApprovalRecordRef,
      sharedContextRef: normalized.sharedContextRef,
      guardrailResultRef: normalized.guardrailResultRef,
      routeDecisionRef: normalized.routeDecisionRef,
      inputHash: normalized.inputHash,
      outputSummary: normalized.outputSummary,
      rollbackPlanRef: normalized.rollbackPlanRef,
      auditTraceRef: normalized.auditTraceRef,
      idempotencyKey: normalized.idempotencyKey,
    },
    boundary: registryAdmissionBoundary(allowed),
  };
}

function buildResult(record, options) {
  return {
    schemaVersion: resultSchemaVersion,
    commandPort: record.commandPort,
    status: record.status,
    recordId: record.recordId,
    recordedAt: record.recordedAt,
    idempotencyKey: record.evidence.idempotencyKey,
    idempotentReplay: options.idempotentReplay === true,
    admissionDecision: record.admissionDecision,
    issues: record.issues,
    draft: record.draft,
    sandboxRun: record.sandboxRun,
    approval: record.approval,
    registryEntry: record.registryEntry,
    registryStorePath: options.registryStorePath,
    evidence: record.evidence,
    boundary: record.boundary,
    nextAction: record.admissionDecision === "ALLOW_SAVE"
      ? "Keep this registry entry dry-run only; publishing and execution candidates remain disabled until a later explicit runtime slice."
      : "Revise the generated workflow/plugin or approval evidence before attempting registry admission again.",
  };
}

function registryAdmissionBoundary(allowed) {
  return {
    registryAdmissionRecorded: true,
    registryEntryPersisted: allowed,
    registryPersistenceMode: "APPEND_ONLY_JSONL",
    executionMode: "DRY_RUN_ONLY",
    localExecutionEnabled: false,
    workflowPublishAllowed: false,
    executionCandidateAllowed: false,
    localGeneratedCodeExecuted: false,
    generatedCodeExecutedOnHost: false,
    directDatabaseWriteAllowed: false,
  };
}

function appendCommandIntent(commandLogPath, record) {
  const absolute = path.resolve(commandLogPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.appendFileSync(absolute, `${JSON.stringify(record)}\n`);
}

function findExistingRecordByIdempotencyKey(commandLogPath, idempotencyKey) {
  const absolute = path.resolve(commandLogPath);
  if (!fs.existsSync(absolute)) return null;
  const lines = fs.readFileSync(absolute, "utf8").split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const record = JSON.parse(lines[index]);
    if (record?.recordType === "WORKFLOW_PLUGIN_REGISTRY_ADMISSION" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.registryEntry?.registryEntryId !== normalized.registry.registryEntryId ||
    existing.evidence?.inputHash !== normalized.inputHash ||
    existing.approval?.approvalId !== normalized.approval.approvalId) {
    throw registryError("WORKFLOW_REGISTRY_ADMISSION_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different registry entry, approval, or input hash");
  }
}

function assertPlainObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw registryError("WORKFLOW_REGISTRY_ADMISSION_INVALID_INPUT", `${name} must be an object`);
  }
}

function safeToken(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9_-]+/gu, "_").replace(/^_+|_+$/gu, "") || "unknown";
}

function registryError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
