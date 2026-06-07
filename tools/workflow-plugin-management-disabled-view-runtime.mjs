import fs from "node:fs";
import path from "node:path";

export const WORKFLOW_PLUGIN_MANAGEMENT_DISABLED_VIEW_COMMAND_PORT = "WorkflowManagementViewCommandPort.recordWorkflowPluginManagementDisabledView";
export const WORKFLOW_PLUGIN_MANAGEMENT_VIEW_DISABLED = "WORKFLOW_PLUGIN_MANAGEMENT_VIEW_DISABLED";

const schemaVersion = "2026-06-05.workflow-plugin.management-disabled-view-runtime.v1";
const viewSchemaVersion = "2026-06-05.workflow-plugin.management-disabled-view.v1";
const resultSchemaVersion = "2026-06-05.workflow-plugin.management-disabled-view-recorded.v1";
const defaultCommandLogPath = "reports/workflow-command-log/workflow-plugin-management-disabled-view.jsonl";
const requiredEvidenceFields = [
  "registryAdmissionRecordRef",
  "executionIsolationRecordRef",
  "publicationDisabledRecordRef",
  "humanApprovalRecordRef",
  "sandboxResultRecordRef",
  "auditTraceRef",
  "idempotencyKey",
];

export function recordWorkflowPluginManagementDisabledView(input, options = {}) {
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

export function formatWorkflowPluginManagementDisabledView(result) {
  return [
    `Workflow plugin management disabled view: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Registry entry: ${result.view.registryEntry.registryEntryId}`,
    `Disabled actions: ${result.view.disabledActionCount}`,
    `All actions disabled: ${result.view.boundary.allActionsDisabled}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  const principal = assertPrincipal(input.principal);
  authorizeManagementViewRecorder(principal);
  const registryEntry = assertRegistryEntry(input.registryEntry);
  const executionIsolationResult = assertExecutionIsolationResult(input.executionIsolationResult, registryEntry);
  const publicationDisabledResult = assertPublicationDisabledResult(input.publicationDisabledResult, registryEntry);
  const evidence = assertEvidence(input, executionIsolationResult, publicationDisabledResult);
  return {
    principal,
    registryEntry,
    executionIsolationResult,
    publicationDisabledResult,
    ...evidence,
  };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "principal");
  const required = ["principalId", "role", "subjectType", "entryPoint", "scopes", "requiresHarnessApproval", "sessionId"];
  for (const field of required) {
    if (principal[field] === undefined || principal[field] === null || principal[field] === "") {
      throw viewError("WORKFLOW_MANAGEMENT_VIEW_MISSING_PRINCIPAL", `principal.${field} is required`);
    }
  }
  if (!Array.isArray(principal.scopes) || principal.scopes.length === 0) {
    throw viewError("WORKFLOW_MANAGEMENT_VIEW_MISSING_SCOPE", "principal.scopes must be non-empty");
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

function authorizeManagementViewRecorder(principal) {
  if (principal.role === "STUDENT" || principal.subjectType === "REMOTE_CHANNEL") {
    throw viewError("WORKFLOW_MANAGEMENT_VIEW_FORBIDDEN_PRINCIPAL", "students and remote channels cannot record management disabled views");
  }
  const isInternalService = principal.role === "SERVICE" &&
    principal.subjectType === "SERVICE" &&
    principal.entryPoint === "AGENT_INTERNAL";
  const isAdmin = principal.role === "ADMIN";
  if (!isInternalService && !isAdmin) {
    throw viewError("WORKFLOW_MANAGEMENT_VIEW_FORBIDDEN_PRINCIPAL", "management disabled views must be recorded by an internal service or admin");
  }
  if (!principal.scopes.includes("ADMIN_SYSTEM")) {
    throw viewError("WORKFLOW_MANAGEMENT_VIEW_MISSING_PERMISSION", "ADMIN_SYSTEM scope is required for management disabled views");
  }
}

function assertRegistryEntry(registryEntry) {
  assertPlainObject(registryEntry, "registryEntry");
  const required = [
    "schemaVersion",
    "registryEntryId",
    "draftId",
    "artifactKind",
    "capabilityKind",
    "status",
    "executionMode",
    "localExecutionEnabled",
  ];
  for (const field of required) {
    if (registryEntry[field] === undefined || registryEntry[field] === null || registryEntry[field] === "") {
      throw viewError("WORKFLOW_MANAGEMENT_VIEW_INVALID_REGISTRY_ENTRY", `registryEntry.${field} is required`);
    }
  }
  if (registryEntry.schemaVersion !== "2026-05-30.workflow-plugin.registry-entry.v1") {
    throw viewError("WORKFLOW_MANAGEMENT_VIEW_INVALID_REGISTRY_ENTRY", "unsupported registry entry schemaVersion");
  }
  if (registryEntry.status !== "ACTIVE" ||
    registryEntry.executionMode !== "DRY_RUN_ONLY" ||
    registryEntry.localExecutionEnabled !== false) {
    throw viewError("WORKFLOW_MANAGEMENT_VIEW_EXECUTABLE_ENTRY", "management view registry entries must remain ACTIVE, DRY_RUN_ONLY, and localExecutionEnabled=false");
  }
  return {
    ...registryEntry,
    registryEntryId: String(registryEntry.registryEntryId),
    draftId: String(registryEntry.draftId),
    artifactKind: String(registryEntry.artifactKind),
    capabilityKind: String(registryEntry.capabilityKind),
    status: registryEntry.status,
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
    throw viewError("WORKFLOW_MANAGEMENT_VIEW_ISOLATION_NOT_BLOCKED", "execution isolation must block candidates before management view rendering");
  }
  if (result.registryEntry.registryEntryId !== registryEntry.registryEntryId) {
    throw viewError("WORKFLOW_MANAGEMENT_VIEW_ISOLATION_MISMATCH", "execution isolation result must reference the same registry entry");
  }
  if (result.executionCandidateView.candidateCount !== 0 ||
    result.boundary.executionCandidateAllowed !== false ||
    result.boundary.executionCandidateCount !== 0 ||
    result.boundary.workflowPublishAllowed !== false ||
    result.boundary.localExecutionEnabled !== false ||
    result.boundary.processLaunchAllowed !== false ||
    result.boundary.hostWriteAllowed !== false ||
    result.boundary.requiresFutureSdd !== true) {
    throw viewError("WORKFLOW_MANAGEMENT_VIEW_UNSAFE_ISOLATION", "execution isolation result must keep candidates, publish, local execution, process launch, and host writes disabled");
  }
  return result;
}

function assertPublicationDisabledResult(result, registryEntry) {
  assertPlainObject(result, "publicationDisabledResult");
  assertPlainObject(result.registryEntry, "publicationDisabledResult.registryEntry");
  assertPlainObject(result.boundary, "publicationDisabledResult.boundary");
  if (result.status !== "WORKFLOW_PLUGIN_PUBLICATION_BLOCKED_BY_POLICY") {
    throw viewError("WORKFLOW_MANAGEMENT_VIEW_PUBLICATION_NOT_BLOCKED", "publication disabled result must block publication before management view rendering");
  }
  if (result.registryEntry.registryEntryId !== registryEntry.registryEntryId) {
    throw viewError("WORKFLOW_MANAGEMENT_VIEW_PUBLICATION_MISMATCH", "publication disabled result must reference the same registry entry");
  }
  if (result.boundary.workflowPublishAllowed !== false ||
    result.boundary.pluginMarketplaceExposureAllowed !== false ||
    result.boundary.executionCandidateAllowed !== false ||
    result.boundary.localExecutionEnabled !== false ||
    result.boundary.processLaunchAllowed !== false ||
    result.boundary.hostWriteAllowed !== false ||
    result.boundary.requiresFutureSdd !== true) {
    throw viewError("WORKFLOW_MANAGEMENT_VIEW_UNSAFE_PUBLICATION", "publication disabled result must keep publish, marketplace, execution, process launch, and host writes disabled");
  }
  return result;
}

function assertEvidence(input, executionIsolationResult, publicationDisabledResult) {
  const evidence = {};
  for (const field of requiredEvidenceFields) {
    if (!input[field]) {
      throw viewError("WORKFLOW_MANAGEMENT_VIEW_MISSING_EVIDENCE", `${field} is required`);
    }
    evidence[field] = String(input[field]);
  }
  if (!evidence.executionIsolationRecordRef.includes(String(executionIsolationResult.recordId ?? ""))) {
    throw viewError("WORKFLOW_MANAGEMENT_VIEW_EVIDENCE_MISMATCH", "executionIsolationRecordRef must include the execution isolation record id");
  }
  if (!evidence.publicationDisabledRecordRef.includes(String(publicationDisabledResult.recordId ?? ""))) {
    throw viewError("WORKFLOW_MANAGEMENT_VIEW_EVIDENCE_MISMATCH", "publicationDisabledRecordRef must include the publication disabled record id");
  }
  return evidence;
}

function buildCommandRecord(normalized, recordedAt) {
  const view = buildDisabledView(normalized, recordedAt);
  return {
    schemaVersion,
    recordType: "WORKFLOW_PLUGIN_MANAGEMENT_DISABLED_VIEW",
    recordId: `workflow_plugin_management_disabled_view_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    commandPort: WORKFLOW_PLUGIN_MANAGEMENT_DISABLED_VIEW_COMMAND_PORT,
    status: WORKFLOW_PLUGIN_MANAGEMENT_VIEW_DISABLED,
    principal: normalized.principal,
    view,
    evidence: {
      registryAdmissionRecordRef: normalized.registryAdmissionRecordRef,
      executionIsolationRecordRef: normalized.executionIsolationRecordRef,
      publicationDisabledRecordRef: normalized.publicationDisabledRecordRef,
      humanApprovalRecordRef: normalized.humanApprovalRecordRef,
      sandboxResultRecordRef: normalized.sandboxResultRecordRef,
      auditTraceRef: normalized.auditTraceRef,
      idempotencyKey: normalized.idempotencyKey,
    },
    boundary: view.boundary,
  };
}

function buildDisabledView(normalized, generatedAt) {
  const publicationEvidenceRef = normalized.publicationDisabledRecordRef;
  const isolationEvidenceRef = normalized.executionIsolationRecordRef;
  const actions = [
    disabledAction("publish", "Publish", "Publication is blocked by the current SDD.", publicationEvidenceRef),
    disabledAction("enableLocalExecution", "Enable Local Execution", "Local execution requires a future executable isolation SDD.", isolationEvidenceRef),
    disabledAction("createExecutionCandidate", "Create Execution Candidate", "Execution candidates are disabled by the current SDD.", isolationEvidenceRef),
    disabledAction("exposeMarketplace", "Expose Marketplace", "Marketplace exposure is blocked by the current SDD.", publicationEvidenceRef),
  ];
  return {
    schemaVersion: viewSchemaVersion,
    viewId: `workflow_plugin_management_disabled_view_${safeToken(normalized.registryEntry.registryEntryId)}`,
    generatedAt,
    surface: "ADMIN_WORKFLOW_PLUGIN_MANAGEMENT",
    registryEntry: {
      registryEntryId: normalized.registryEntry.registryEntryId,
      draftId: normalized.registryEntry.draftId,
      artifactKind: normalized.registryEntry.artifactKind,
      capabilityKind: normalized.registryEntry.capabilityKind,
      status: normalized.registryEntry.status,
      executionMode: normalized.registryEntry.executionMode,
      localExecutionEnabled: normalized.registryEntry.localExecutionEnabled,
    },
    badges: [
      "DRY_RUN_ONLY",
      "EXECUTION_CANDIDATES_DISABLED",
      "PUBLICATION_DISABLED",
      "FUTURE_SDD_REQUIRED",
    ],
    actions,
    disabledActionCount: actions.filter((action) => action.enabled === false).length,
    evidence: {
      registryAdmissionRecordRef: normalized.registryAdmissionRecordRef,
      executionIsolationRecordRef: normalized.executionIsolationRecordRef,
      publicationDisabledRecordRef: normalized.publicationDisabledRecordRef,
      humanApprovalRecordRef: normalized.humanApprovalRecordRef,
      sandboxResultRecordRef: normalized.sandboxResultRecordRef,
      auditTraceRef: normalized.auditTraceRef,
    },
    boundary: managementDisabledBoundary(),
  };
}

function disabledAction(actionId, label, disabledReason, evidenceRef) {
  return {
    actionId,
    label,
    enabled: false,
    disabledReason,
    evidenceRef,
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
    view: record.view,
    boundary: record.boundary,
    nextAction: "Render workflow/plugin management as disabled until a future SDD enables executable isolation, signing, rollout, and rollback.",
  };
}

function managementDisabledBoundary() {
  return {
    managementViewRendered: true,
    allActionsDisabled: true,
    workflowPublishAllowed: false,
    pluginMarketplaceExposureAllowed: false,
    executionCandidateAllowed: false,
    localExecutionEnabled: false,
    processLaunchAllowed: false,
    hostWriteAllowed: false,
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
    if (record?.recordType === "WORKFLOW_PLUGIN_MANAGEMENT_DISABLED_VIEW" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.view?.registryEntry?.registryEntryId !== normalized.registryEntry.registryEntryId ||
    existing.evidence?.publicationDisabledRecordRef !== normalized.publicationDisabledRecordRef ||
    existing.evidence?.executionIsolationRecordRef !== normalized.executionIsolationRecordRef) {
    throw viewError("WORKFLOW_MANAGEMENT_VIEW_IDEMPOTENCY_CONFLICT", "idempotency key already exists with different management view content");
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw viewError("WORKFLOW_MANAGEMENT_VIEW_INVALID_INPUT", `${label} must be an object`);
  }
}

function viewError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function safeToken(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "record";
}
