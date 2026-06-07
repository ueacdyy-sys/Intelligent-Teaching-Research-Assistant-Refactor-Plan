import fs from "node:fs";
import path from "node:path";

export const WORKFLOW_PLUGIN_PUBLICATION_DISABLED_COMMAND_PORT = "WorkflowPublicationCommandPort.recordWorkflowPluginPublicationDisabledPrecheck";
export const WORKFLOW_PLUGIN_PUBLICATION_BLOCKED = "WORKFLOW_PLUGIN_PUBLICATION_BLOCKED_BY_POLICY";

const schemaVersion = "2026-06-05.workflow-plugin.publication-disabled-runtime.v1";
const resultSchemaVersion = "2026-06-05.workflow-plugin.publication-disabled-recorded.v1";
const defaultCommandLogPath = "reports/workflow-command-log/workflow-plugin-publication-disabled.jsonl";
const requiredEvidenceFields = [
  "registryAdmissionRecordRef",
  "executionIsolationRecordRef",
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

export function recordWorkflowPluginPublicationDisabledPrecheck(input, options = {}) {
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

export function formatWorkflowPluginPublicationDisabledPrecheck(result) {
  return [
    `Workflow plugin publication gate: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Registry entry: ${result.registryEntry.registryEntryId}`,
    `Publication allowed: ${result.boundary.workflowPublishAllowed}`,
    `Registry exposure: ${result.boundary.registryExposure}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  const principal = assertPrincipal(input.principal);
  authorizePublicationRecorder(principal);
  const registryEntry = assertRegistryEntry(input.registryEntry);
  const executionIsolationResult = assertExecutionIsolationResult(input.executionIsolationResult, registryEntry);
  const publicationPolicy = assertPublicationPolicy(input.publicationPolicy, registryEntry);
  const evidence = assertEvidence(input, publicationPolicy);
  return {
    principal,
    registryEntry,
    executionIsolationResult,
    publicationPolicy,
    ...evidence,
  };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "principal");
  const required = ["principalId", "role", "subjectType", "entryPoint", "scopes", "requiresHarnessApproval", "sessionId"];
  for (const field of required) {
    if (principal[field] === undefined || principal[field] === null || principal[field] === "") {
      throw publicationError("WORKFLOW_PUBLICATION_MISSING_PRINCIPAL", `principal.${field} is required`);
    }
  }
  if (!Array.isArray(principal.scopes) || principal.scopes.length === 0) {
    throw publicationError("WORKFLOW_PUBLICATION_MISSING_SCOPE", "principal.scopes must be non-empty");
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

function authorizePublicationRecorder(principal) {
  if (principal.role === "STUDENT" || principal.subjectType === "REMOTE_CHANNEL") {
    throw publicationError("WORKFLOW_PUBLICATION_FORBIDDEN_PRINCIPAL", "students and remote channels cannot record publication prechecks");
  }
  const isInternalService = principal.role === "SERVICE" &&
    principal.subjectType === "SERVICE" &&
    principal.entryPoint === "AGENT_INTERNAL";
  const isAdmin = principal.role === "ADMIN";
  if (!isInternalService && !isAdmin) {
    throw publicationError("WORKFLOW_PUBLICATION_FORBIDDEN_PRINCIPAL", "publication prechecks must be recorded by an internal service or admin");
  }
  if (!principal.scopes.includes("ADMIN_SYSTEM")) {
    throw publicationError("WORKFLOW_PUBLICATION_MISSING_PERMISSION", "ADMIN_SYSTEM scope is required for publication prechecks");
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
      throw publicationError("WORKFLOW_PUBLICATION_INVALID_REGISTRY_ENTRY", `registryEntry.${field} is required`);
    }
  }
  if (registryEntry.schemaVersion !== "2026-05-30.workflow-plugin.registry-entry.v1") {
    throw publicationError("WORKFLOW_PUBLICATION_INVALID_REGISTRY_ENTRY", "unsupported registry entry schemaVersion");
  }
  if (registryEntry.executionMode !== "DRY_RUN_ONLY" || registryEntry.localExecutionEnabled !== false) {
    throw publicationError("WORKFLOW_PUBLICATION_EXECUTABLE_ENTRY", "registry entries must remain DRY_RUN_ONLY with localExecutionEnabled=false");
  }
  if (registryEntry.status !== "ACTIVE") {
    throw publicationError("WORKFLOW_PUBLICATION_INVALID_REGISTRY_ENTRY", "registry entry must be ACTIVE for publication precheck");
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

function assertExecutionIsolationResult(result, registryEntry) {
  assertPlainObject(result, "executionIsolationResult");
  assertPlainObject(result.registryEntry, "executionIsolationResult.registryEntry");
  assertPlainObject(result.boundary, "executionIsolationResult.boundary");
  assertPlainObject(result.executionCandidateView, "executionIsolationResult.executionCandidateView");
  if (result.status !== "EXECUTION_CANDIDATE_BLOCKED_BY_ISOLATION") {
    throw publicationError("WORKFLOW_PUBLICATION_ISOLATION_NOT_BLOCKED", "execution isolation must block candidates before publication can be considered");
  }
  if (result.registryEntry.registryEntryId !== registryEntry.registryEntryId) {
    throw publicationError("WORKFLOW_PUBLICATION_ISOLATION_MISMATCH", "execution isolation result must reference the same registry entry");
  }
  if (result.executionCandidateView.candidateCount !== 0 ||
    result.boundary.executionCandidateAllowed !== false ||
    result.boundary.executionCandidateCount !== 0 ||
    result.boundary.workflowPublishAllowed !== false ||
    result.boundary.localExecutionEnabled !== false ||
    result.boundary.processLaunchAllowed !== false ||
    result.boundary.hostWriteAllowed !== false ||
    result.boundary.requiresFutureSdd !== true) {
    throw publicationError("WORKFLOW_PUBLICATION_UNSAFE_ISOLATION", "execution isolation result must keep candidates, publish, local execution, process launch, and host writes disabled");
  }
  return {
    recordId: String(result.recordId ?? ""),
    status: result.status,
    registryEntryId: String(result.registryEntry.registryEntryId),
    executionCandidateView: {
      candidateCount: result.executionCandidateView.candidateCount,
      blockedReason: String(result.executionCandidateView.blockedReason ?? ""),
    },
    boundary: {
      executionCandidateAllowed: false,
      executionCandidateCount: 0,
      workflowPublishAllowed: false,
      localExecutionEnabled: false,
      processLaunchAllowed: false,
      hostWriteAllowed: false,
      networkPolicy: String(result.boundary.networkPolicy ?? "DEFAULT_DENY"),
      requiresFutureSdd: true,
    },
  };
}

function assertPublicationPolicy(policy, registryEntry) {
  assertPlainObject(policy, "publicationPolicy");
  const required = [
    "schemaVersion",
    "policyId",
    "registryEntryId",
    "executionIsolationRecordRef",
    "mode",
    "publicationAllowed",
    "publicationChannel",
    "registryExposure",
    "requiresExecutionIsolation",
    "requiresFutureSdd",
    "auditLogRequired",
  ];
  for (const field of required) {
    if (policy[field] === undefined || policy[field] === null || policy[field] === "") {
      throw publicationError("WORKFLOW_PUBLICATION_INVALID_POLICY", `publicationPolicy.${field} is required`);
    }
  }
  if (policy.schemaVersion !== "2026-06-05.workflow-plugin.publication-policy.v1") {
    throw publicationError("WORKFLOW_PUBLICATION_INVALID_POLICY", "unsupported publication policy schemaVersion");
  }
  if (policy.registryEntryId !== registryEntry.registryEntryId) {
    throw publicationError("WORKFLOW_PUBLICATION_POLICY_MISMATCH", "publication policy must reference the same registry entry");
  }
  if (policy.mode !== "BLOCK_PUBLICATION" ||
    policy.publicationAllowed !== false ||
    policy.publicationChannel !== "DISABLED" ||
    policy.registryExposure !== "INTERNAL_DRY_RUN_CATALOG_ONLY" ||
    policy.requiresExecutionIsolation !== true ||
    policy.requiresFutureSdd !== true ||
    policy.auditLogRequired !== true) {
    throw publicationError("WORKFLOW_PUBLICATION_UNSAFE_POLICY", "publication policy must block publication, marketplace exposure, and require execution isolation plus a future SDD");
  }
  return {
    schemaVersion: policy.schemaVersion,
    policyId: String(policy.policyId),
    registryEntryId: String(policy.registryEntryId),
    executionIsolationRecordRef: String(policy.executionIsolationRecordRef),
    mode: policy.mode,
    publicationAllowed: policy.publicationAllowed,
    publicationChannel: policy.publicationChannel,
    registryExposure: policy.registryExposure,
    requiresExecutionIsolation: policy.requiresExecutionIsolation,
    requiresFutureSdd: policy.requiresFutureSdd,
    auditLogRequired: policy.auditLogRequired,
  };
}

function assertEvidence(input, publicationPolicy) {
  const evidence = {};
  for (const field of requiredEvidenceFields) {
    if (!input[field]) {
      throw publicationError("WORKFLOW_PUBLICATION_MISSING_EVIDENCE", `${field} is required`);
    }
    evidence[field] = String(input[field]);
  }
  if (!evidence.inputHash.startsWith("sha256:")) {
    throw publicationError("WORKFLOW_PUBLICATION_INVALID_EVIDENCE", "inputHash must be a sha256 reference");
  }
  if (evidence.executionIsolationRecordRef !== publicationPolicy.executionIsolationRecordRef) {
    throw publicationError("WORKFLOW_PUBLICATION_EVIDENCE_MISMATCH", "executionIsolationRecordRef must match publication policy");
  }
  return evidence;
}

function buildCommandRecord(normalized, recordedAt) {
  return {
    schemaVersion,
    recordType: "WORKFLOW_PLUGIN_PUBLICATION_DISABLED_PRECHECK",
    recordId: `workflow_plugin_publication_disabled_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    commandPort: WORKFLOW_PLUGIN_PUBLICATION_DISABLED_COMMAND_PORT,
    status: WORKFLOW_PLUGIN_PUBLICATION_BLOCKED,
    principal: normalized.principal,
    registryEntry: {
      registryEntryId: normalized.registryEntry.registryEntryId,
      draftId: normalized.registryEntry.draftId,
      artifactKind: normalized.registryEntry.artifactKind,
      capabilityKind: normalized.registryEntry.capabilityKind,
      executionMode: normalized.registryEntry.executionMode,
      localExecutionEnabled: normalized.registryEntry.localExecutionEnabled,
    },
    executionIsolationResult: normalized.executionIsolationResult,
    publicationPolicy: normalized.publicationPolicy,
    evidence: {
      registryAdmissionRecordRef: normalized.registryAdmissionRecordRef,
      executionIsolationRecordRef: normalized.executionIsolationRecordRef,
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
    boundary: publicationDisabledBoundary(),
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
    publicationPolicy: record.publicationPolicy,
    executionIsolation: {
      status: record.executionIsolationResult.status,
      candidateCount: record.executionIsolationResult.executionCandidateView.candidateCount,
    },
    evidence: record.evidence,
    boundary: record.boundary,
    nextAction: "Keep workflow/plugin publication disabled; a future SDD must explicitly enable executable isolation, signing, rollout, and rollback before publication.",
  };
}

function publicationDisabledBoundary() {
  return {
    publicationGateRecorded: true,
    workflowPublishAllowed: false,
    pluginMarketplaceExposureAllowed: false,
    registryExposure: "INTERNAL_DRY_RUN_CATALOG_ONLY",
    executionCandidateAllowed: false,
    executionCandidateCount: 0,
    localExecutionEnabled: false,
    localGeneratedCodeExecuted: false,
    generatedCodeExecutedOnHost: false,
    processLaunchAllowed: false,
    hostWriteAllowed: false,
    networkPolicy: "DEFAULT_DENY",
    requiresExecutionIsolation: true,
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
    if (record?.recordType === "WORKFLOW_PLUGIN_PUBLICATION_DISABLED_PRECHECK" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.registryEntry?.registryEntryId !== normalized.registryEntry.registryEntryId ||
    existing.publicationPolicy?.policyId !== normalized.publicationPolicy.policyId ||
    existing.evidence?.inputHash !== normalized.inputHash) {
    throw publicationError("WORKFLOW_PUBLICATION_IDEMPOTENCY_CONFLICT", "idempotency key already exists with different publication precheck content");
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw publicationError("WORKFLOW_PUBLICATION_INVALID_INPUT", `${label} must be an object`);
  }
}

function publicationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function safeToken(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "record";
}
