import fs from "node:fs";
import path from "node:path";

export const WORKFLOW_PLUGIN_EXECUTION_ISOLATION_COMMAND_PORT = "WorkflowExecutionIsolationCommandPort.recordWorkflowPluginExecutionIsolationPrecheck";
export const WORKFLOW_PLUGIN_EXECUTION_ISOLATION_BLOCKED = "EXECUTION_CANDIDATE_BLOCKED_BY_ISOLATION";

const schemaVersion = "2026-06-05.workflow-plugin.execution-isolation-runtime.v1";
const resultSchemaVersion = "2026-06-05.workflow-plugin.execution-isolation-recorded.v1";
const defaultCommandLogPath = "reports/workflow-command-log/workflow-plugin-execution-isolation.jsonl";
const executionCandidateSchemaVersion = "2026-05-29.agent-harness.execution-candidate-view.v1";
const blockedReason = "real local execution is disabled by current SDD";
const futureSddPrecondition = "future SDD must explicitly enable execution candidates";
const requiredEvidenceFields = [
  "registryAdmissionRecordRef",
  "humanApprovalRecordRef",
  "sandboxResultRecordRef",
  "sharedContextRef",
  "guardrailResultRef",
  "routeDecisionRef",
  "inputHash",
  "outputSummary",
  "rollbackPlanRef",
  "auditTraceRef",
  "idempotencyKey",
];

export function recordWorkflowPluginExecutionIsolationPrecheck(input, options = {}) {
  const recordedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const commandLogPath = options.commandLogPath ?? defaultCommandLogPath;
  const existing = findExistingRecordByIdempotencyKey(commandLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const record = buildCommandRecord(normalized, recordedAt);
  appendCommandIntent(commandLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatWorkflowPluginExecutionIsolationPrecheck(result) {
  return [
    `Workflow plugin execution isolation: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Registry entry: ${result.registryEntry.registryEntryId}`,
    `Candidate count: ${result.executionCandidateView.candidateCount}`,
    `Local execution: ${result.boundary.localExecutionEnabled ? "enabled" : "disabled"}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  const principal = assertPrincipal(input.principal);
  authorizeIsolationRecorder(principal);
  const registryEntry = assertRegistryEntry(input.registryEntry);
  const isolationPolicy = assertIsolationPolicy(input.isolationPolicy, registryEntry);
  const executionCandidateView = assertExecutionCandidateView(input.executionCandidateView);
  const evidence = assertEvidence(input);
  return {
    principal,
    registryEntry,
    isolationPolicy,
    executionCandidateView,
    ...evidence,
  };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "principal");
  const required = ["principalId", "role", "subjectType", "entryPoint", "scopes", "requiresHarnessApproval", "sessionId"];
  for (const field of required) {
    if (principal[field] === undefined || principal[field] === null || principal[field] === "") {
      throw isolationError("WORKFLOW_EXECUTION_ISOLATION_MISSING_PRINCIPAL", `principal.${field} is required`);
    }
  }
  if (!Array.isArray(principal.scopes) || principal.scopes.length === 0) {
    throw isolationError("WORKFLOW_EXECUTION_ISOLATION_MISSING_SCOPE", "principal.scopes must be non-empty");
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

function authorizeIsolationRecorder(principal) {
  if (principal.role === "STUDENT" || principal.subjectType === "REMOTE_CHANNEL") {
    throw isolationError("WORKFLOW_EXECUTION_ISOLATION_FORBIDDEN_PRINCIPAL", "students and remote channels cannot record execution isolation prechecks");
  }
  const isInternalService = principal.role === "SERVICE" &&
    principal.subjectType === "SERVICE" &&
    principal.entryPoint === "AGENT_INTERNAL";
  const isAdmin = principal.role === "ADMIN";
  if (!isInternalService && !isAdmin) {
    throw isolationError("WORKFLOW_EXECUTION_ISOLATION_FORBIDDEN_PRINCIPAL", "execution isolation prechecks must be recorded by an internal service or admin");
  }
  if (!principal.scopes.includes("ADMIN_SYSTEM")) {
    throw isolationError("WORKFLOW_EXECUTION_ISOLATION_MISSING_PERMISSION", "ADMIN_SYSTEM scope is required for execution isolation prechecks");
  }
}

function assertRegistryEntry(registryEntry) {
  assertPlainObject(registryEntry, "registryEntry");
  const required = [
    "schemaVersion",
    "registryEntryId",
    "draftId",
    "sandboxRunId",
    "approvalId",
    "artifactKind",
    "capabilityKind",
    "status",
    "executionMode",
    "localExecutionEnabled",
    "rollbackPlan",
  ];
  for (const field of required) {
    if (registryEntry[field] === undefined || registryEntry[field] === null || registryEntry[field] === "") {
      throw isolationError("WORKFLOW_EXECUTION_ISOLATION_INVALID_REGISTRY_ENTRY", `registryEntry.${field} is required`);
    }
  }
  if (registryEntry.schemaVersion !== "2026-05-30.workflow-plugin.registry-entry.v1") {
    throw isolationError("WORKFLOW_EXECUTION_ISOLATION_INVALID_REGISTRY_ENTRY", "unsupported registry entry schemaVersion");
  }
  if (registryEntry.executionMode !== "DRY_RUN_ONLY" || registryEntry.localExecutionEnabled !== false) {
    throw isolationError("WORKFLOW_EXECUTION_ISOLATION_EXECUTABLE_ENTRY", "registry entries must remain DRY_RUN_ONLY with localExecutionEnabled=false");
  }
  if (registryEntry.status !== "ACTIVE") {
    throw isolationError("WORKFLOW_EXECUTION_ISOLATION_INVALID_REGISTRY_ENTRY", "registry entry must be ACTIVE for precheck");
  }
  return {
    ...registryEntry,
    registryEntryId: String(registryEntry.registryEntryId),
    draftId: String(registryEntry.draftId),
    sandboxRunId: String(registryEntry.sandboxRunId),
    approvalId: String(registryEntry.approvalId),
    artifactKind: String(registryEntry.artifactKind),
    capabilityKind: String(registryEntry.capabilityKind),
    executionMode: registryEntry.executionMode,
    localExecutionEnabled: registryEntry.localExecutionEnabled,
  };
}

function assertIsolationPolicy(policy, registryEntry) {
  assertPlainObject(policy, "isolationPolicy");
  const required = [
    "schemaVersion",
    "policyId",
    "registryEntryId",
    "mode",
    "hostWritePolicy",
    "networkPolicy",
    "processLaunchAllowed",
    "candidateExposure",
    "requiresFutureSdd",
    "maxRuntimeMs",
    "maxMemoryMb",
    "auditLogRequired",
  ];
  for (const field of required) {
    if (policy[field] === undefined || policy[field] === null || policy[field] === "") {
      throw isolationError("WORKFLOW_EXECUTION_ISOLATION_INVALID_POLICY", `isolationPolicy.${field} is required`);
    }
  }
  if (policy.schemaVersion !== "2026-06-05.workflow-plugin.execution-isolation-policy.v1") {
    throw isolationError("WORKFLOW_EXECUTION_ISOLATION_INVALID_POLICY", "unsupported isolation policy schemaVersion");
  }
  if (policy.registryEntryId !== registryEntry.registryEntryId) {
    throw isolationError("WORKFLOW_EXECUTION_ISOLATION_POLICY_MISMATCH", "isolation policy must reference the same registry entry");
  }
  if (policy.mode !== "BLOCK_HOST_EXECUTION" ||
    policy.hostWritePolicy !== "DENY" ||
    policy.networkPolicy !== "DEFAULT_DENY" ||
    policy.processLaunchAllowed !== false ||
    policy.candidateExposure !== "DISABLED" ||
    policy.requiresFutureSdd !== true ||
    policy.auditLogRequired !== true) {
    throw isolationError("WORKFLOW_EXECUTION_ISOLATION_UNSAFE_POLICY", "policy must block host execution, host writes, process launch, candidate exposure, and require a future SDD");
  }
  if (!Number.isInteger(policy.maxRuntimeMs) || policy.maxRuntimeMs <= 0 ||
    !Number.isInteger(policy.maxMemoryMb) || policy.maxMemoryMb <= 0) {
    throw isolationError("WORKFLOW_EXECUTION_ISOLATION_INVALID_POLICY", "policy requires positive maxRuntimeMs and maxMemoryMb");
  }
  return {
    schemaVersion: policy.schemaVersion,
    policyId: String(policy.policyId),
    registryEntryId: String(policy.registryEntryId),
    mode: policy.mode,
    hostWritePolicy: policy.hostWritePolicy,
    networkPolicy: policy.networkPolicy,
    processLaunchAllowed: policy.processLaunchAllowed,
    candidateExposure: policy.candidateExposure,
    requiresFutureSdd: policy.requiresFutureSdd,
    maxRuntimeMs: policy.maxRuntimeMs,
    maxMemoryMb: policy.maxMemoryMb,
    auditLogRequired: policy.auditLogRequired,
  };
}

function assertExecutionCandidateView(view) {
  assertPlainObject(view, "executionCandidateView");
  const required = [
    "schemaVersion",
    "generatedAt",
    "sourceQueueGeneratedAt",
    "sourceApprovalDecisionCount",
    "sourceUncorrelatedDecisionCount",
    "candidateCount",
    "candidates",
    "blockedReason",
    "blockedPreconditions",
  ];
  for (const field of required) {
    if (view[field] === undefined || view[field] === null || view[field] === "") {
      throw isolationError("WORKFLOW_EXECUTION_ISOLATION_INVALID_CANDIDATE_VIEW", `executionCandidateView.${field} is required`);
    }
  }
  if (view.schemaVersion !== executionCandidateSchemaVersion) {
    throw isolationError("WORKFLOW_EXECUTION_ISOLATION_INVALID_CANDIDATE_VIEW", "unsupported execution candidate view schemaVersion");
  }
  if (view.candidateCount !== 0 || !Array.isArray(view.candidates) || view.candidates.length !== 0) {
    throw isolationError("WORKFLOW_EXECUTION_ISOLATION_CANDIDATE_EXPOSED", "execution candidates must remain empty");
  }
  if (view.blockedReason !== blockedReason ||
    !Array.isArray(view.blockedPreconditions) ||
    !view.blockedPreconditions.includes(futureSddPrecondition)) {
    throw isolationError("WORKFLOW_EXECUTION_ISOLATION_INVALID_CANDIDATE_VIEW", "candidate view must be blocked by the current SDD future-precondition");
  }
  return {
    schemaVersion: view.schemaVersion,
    generatedAt: String(view.generatedAt),
    sourceQueueGeneratedAt: String(view.sourceQueueGeneratedAt),
    sourceApprovalDecisionCount: Number(view.sourceApprovalDecisionCount),
    sourceUncorrelatedDecisionCount: Number(view.sourceUncorrelatedDecisionCount),
    candidateCount: view.candidateCount,
    candidates: [],
    blockedReason: view.blockedReason,
    blockedPreconditions: view.blockedPreconditions.map(String),
  };
}

function assertEvidence(input) {
  const evidence = {};
  for (const field of requiredEvidenceFields) {
    if (!input[field]) {
      throw isolationError("WORKFLOW_EXECUTION_ISOLATION_MISSING_EVIDENCE", `${field} is required`);
    }
    evidence[field] = String(input[field]);
  }
  if (!evidence.inputHash.startsWith("sha256:")) {
    throw isolationError("WORKFLOW_EXECUTION_ISOLATION_INVALID_EVIDENCE", "inputHash must be a sha256 reference");
  }
  return evidence;
}

function buildCommandRecord(normalized, recordedAt) {
  return {
    schemaVersion,
    recordType: "WORKFLOW_PLUGIN_EXECUTION_ISOLATION_PRECHECK",
    recordId: `workflow_plugin_execution_isolation_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    commandPort: WORKFLOW_PLUGIN_EXECUTION_ISOLATION_COMMAND_PORT,
    status: WORKFLOW_PLUGIN_EXECUTION_ISOLATION_BLOCKED,
    principal: normalized.principal,
    registryEntry: {
      registryEntryId: normalized.registryEntry.registryEntryId,
      draftId: normalized.registryEntry.draftId,
      artifactKind: normalized.registryEntry.artifactKind,
      capabilityKind: normalized.registryEntry.capabilityKind,
      executionMode: normalized.registryEntry.executionMode,
      localExecutionEnabled: normalized.registryEntry.localExecutionEnabled,
    },
    isolationPolicy: normalized.isolationPolicy,
    executionCandidateView: normalized.executionCandidateView,
    evidence: {
      registryAdmissionRecordRef: normalized.registryAdmissionRecordRef,
      humanApprovalRecordRef: normalized.humanApprovalRecordRef,
      sandboxResultRecordRef: normalized.sandboxResultRecordRef,
      sharedContextRef: normalized.sharedContextRef,
      guardrailResultRef: normalized.guardrailResultRef,
      routeDecisionRef: normalized.routeDecisionRef,
      inputHash: normalized.inputHash,
      outputSummary: normalized.outputSummary,
      rollbackPlanRef: normalized.rollbackPlanRef,
      auditTraceRef: normalized.auditTraceRef,
      idempotencyKey: normalized.idempotencyKey,
    },
    boundary: executionIsolationBoundary(),
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
    registryEntry: record.registryEntry,
    isolationPolicy: record.isolationPolicy,
    executionCandidateView: {
      candidateCount: record.executionCandidateView.candidateCount,
      blockedReason: record.executionCandidateView.blockedReason,
      blockedPreconditions: record.executionCandidateView.blockedPreconditions,
    },
    evidence: record.evidence,
    boundary: record.boundary,
    nextAction: "Keep workflow/plugin execution candidates disabled; a future SDD must explicitly introduce executable isolation before publishing or host execution.",
  };
}

function executionIsolationBoundary() {
  return {
    executionIsolationRecorded: true,
    registryEntryPrechecked: true,
    executionMode: "DRY_RUN_ONLY",
    localExecutionEnabled: false,
    workflowPublishAllowed: false,
    executionCandidateAllowed: false,
    executionCandidateCount: 0,
    localGeneratedCodeExecuted: false,
    generatedCodeExecutedOnHost: false,
    processLaunchAllowed: false,
    hostWriteAllowed: false,
    networkPolicy: "DEFAULT_DENY",
    requiresFutureSdd: true,
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
    if (record?.recordType === "WORKFLOW_PLUGIN_EXECUTION_ISOLATION_PRECHECK" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.registryEntry?.registryEntryId !== normalized.registryEntry.registryEntryId ||
    existing.isolationPolicy?.policyId !== normalized.isolationPolicy.policyId ||
    existing.evidence?.inputHash !== normalized.inputHash) {
    throw isolationError("WORKFLOW_EXECUTION_ISOLATION_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different registry entry, policy, or input hash");
  }
}

function assertPlainObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw isolationError("WORKFLOW_EXECUTION_ISOLATION_INVALID_INPUT", `${name} must be an object`);
  }
}

function safeToken(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9_-]+/gu, "_").replace(/^_+|_+$/gu, "") || "unknown";
}

function isolationError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
