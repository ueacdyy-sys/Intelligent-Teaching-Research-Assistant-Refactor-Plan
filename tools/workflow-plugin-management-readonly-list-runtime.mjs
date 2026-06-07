export const WORKFLOW_PLUGIN_MANAGEMENT_READONLY_LIST_READ_PORT = "WorkflowManagementReadPort.renderWorkflowPluginManagementReadonlyList";
export const WORKFLOW_PLUGIN_MANAGEMENT_READONLY_LIST_READY = "WORKFLOW_PLUGIN_MANAGEMENT_READONLY_LIST_READY";

const listSchemaVersion = "2026-06-05.workflow-plugin.management-readonly-list.v1";
const resultSchemaVersion = "2026-06-05.workflow-plugin.management-readonly-list-rendered.v1";
const requiredActionIds = ["publish", "enableLocalExecution", "createExecutionCandidate", "exposeMarketplace"];

export function renderWorkflowPluginManagementReadonlyList(input, options = {}) {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const list = buildReadonlyList(normalized, generatedAt);
  return {
    schemaVersion: resultSchemaVersion,
    readPort: WORKFLOW_PLUGIN_MANAGEMENT_READONLY_LIST_READ_PORT,
    status: WORKFLOW_PLUGIN_MANAGEMENT_READONLY_LIST_READY,
    generatedAt,
    list,
    boundary: list.boundary,
    nextAction: "Render the workflow/plugin management list as read-only; executable isolation, signing, rollout, rollback, and publication remain future SDD work.",
  };
}

export function formatWorkflowPluginManagementReadonlyList(result) {
  return [
    `Workflow plugin management read-only list: ${result.status}`,
    `Read port: ${result.readPort}`,
    `Entries: ${result.list.entries.length}`,
    `All entries read-only: ${result.boundary.allEntriesReadOnly}`,
    `All actions disabled: ${result.boundary.allActionsDisabled}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  const principal = assertPrincipal(input.principal);
  authorizeManagementListReader(principal);
  const auditDetails = assertAuditDetails(input.auditDetails);
  return {
    principal,
    auditDetails,
  };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "principal");
  const required = ["principalId", "role", "subjectType", "entryPoint", "scopes", "requiresHarnessApproval", "sessionId"];
  for (const field of required) {
    if (principal[field] === undefined || principal[field] === null || principal[field] === "") {
      throw listError("WORKFLOW_MANAGEMENT_READONLY_LIST_MISSING_PRINCIPAL", `principal.${field} is required`);
    }
  }
  if (!Array.isArray(principal.scopes) || principal.scopes.length === 0) {
    throw listError("WORKFLOW_MANAGEMENT_READONLY_LIST_MISSING_SCOPE", "principal.scopes must be non-empty");
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

function authorizeManagementListReader(principal) {
  if (principal.role === "STUDENT" || principal.subjectType === "REMOTE_CHANNEL") {
    throw listError("WORKFLOW_MANAGEMENT_READONLY_LIST_FORBIDDEN_PRINCIPAL", "students and remote channels cannot read workflow/plugin management lists");
  }
  const isInternalService = principal.role === "SERVICE" &&
    principal.subjectType === "SERVICE" &&
    principal.entryPoint === "AGENT_INTERNAL";
  const isAdmin = principal.role === "ADMIN";
  if (!isInternalService && !isAdmin) {
    throw listError("WORKFLOW_MANAGEMENT_READONLY_LIST_FORBIDDEN_PRINCIPAL", "management lists must be read by an internal service or admin");
  }
  if (!principal.scopes.includes("ADMIN_SYSTEM")) {
    throw listError("WORKFLOW_MANAGEMENT_READONLY_LIST_MISSING_PERMISSION", "ADMIN_SYSTEM scope is required for management lists");
  }
}

function assertAuditDetails(auditDetails) {
  if (!Array.isArray(auditDetails) || auditDetails.length === 0) {
    throw listError("WORKFLOW_MANAGEMENT_READONLY_LIST_EMPTY", "auditDetails must contain at least one management audit detail");
  }
  const seenRegistryEntryIds = new Set();
  return auditDetails.map((item, index) => {
    const detail = assertAuditDetail(item, index);
    const registryEntryId = detail.registryEntry.registryEntryId;
    if (seenRegistryEntryIds.has(registryEntryId)) {
      throw listError("WORKFLOW_MANAGEMENT_READONLY_LIST_DUPLICATE_ENTRY", `duplicate registryEntryId ${registryEntryId}`);
    }
    seenRegistryEntryIds.add(registryEntryId);
    return detail;
  });
}

function assertAuditDetail(item, index) {
  assertPlainObject(item, `auditDetails[${index}]`);
  const detail = item.detail ?? item;
  assertPlainObject(detail, `auditDetails[${index}].detail`);
  assertPlainObject(detail.registryEntry, `auditDetails[${index}].detail.registryEntry`);
  assertPlainObject(detail.summary, `auditDetails[${index}].detail.summary`);
  assertPlainObject(detail.boundary, `auditDetails[${index}].detail.boundary`);
  if (item.detail && item.status !== "WORKFLOW_PLUGIN_MANAGEMENT_AUDIT_DETAIL_READONLY") {
    throw listError("WORKFLOW_MANAGEMENT_READONLY_LIST_DETAIL_NOT_READY", "management list entries must come from read-only audit detail results");
  }
  if (detail.surface !== "ADMIN_WORKFLOW_PLUGIN_AUDIT_DETAIL") {
    throw listError("WORKFLOW_MANAGEMENT_READONLY_LIST_INVALID_SURFACE", "management list entries must reference audit detail surfaces");
  }
  if (detail.summary.detailReadiness !== "READONLY_AUDIT_READY" ||
    detail.summary.executionStatus !== "EXECUTION_CANDIDATES_DISABLED" ||
    detail.summary.publicationStatus !== "PUBLICATION_DISABLED" ||
    detail.summary.managementStatus !== "ALL_ACTIONS_DISABLED" ||
    detail.summary.nextRequiredSdd !== "EXECUTABLE_ISOLATION_SIGNING_ROLLOUT_ROLLBACK") {
    throw listError("WORKFLOW_MANAGEMENT_READONLY_LIST_UNSAFE_SUMMARY", "management list details must keep execution, publication, and actions blocked");
  }
  if (!Array.isArray(detail.evidenceTimeline) || detail.evidenceTimeline.length !== 7) {
    throw listError("WORKFLOW_MANAGEMENT_READONLY_LIST_INCOMPLETE_EVIDENCE", "management list entries require seven audit detail evidence stages");
  }
  if (!Array.isArray(detail.controlActions) ||
    detail.controlActions.length !== 4 ||
    !detail.controlActions.every((action) => action.enabled === false) ||
    !sameActionSet(detail.controlActions.map((action) => action.actionId))) {
    throw listError("WORKFLOW_MANAGEMENT_READONLY_LIST_UNSAFE_ACTIONS", "management list entries require exactly four disabled control actions");
  }
  if (detail.boundary.readOnly !== true ||
    detail.boundary.allActionsDisabled !== true ||
    detail.boundary.workflowPublishAllowed !== false ||
    detail.boundary.pluginMarketplaceExposureAllowed !== false ||
    detail.boundary.executionCandidateAllowed !== false ||
    detail.boundary.localExecutionEnabled !== false ||
    detail.boundary.processLaunchAllowed !== false ||
    detail.boundary.hostWriteAllowed !== false ||
    detail.boundary.productionHotPathChanged !== false ||
    detail.boundary.requiresFutureSdd !== true) {
    throw listError("WORKFLOW_MANAGEMENT_READONLY_LIST_UNSAFE_BOUNDARY", "management list entries must remain read-only with publication, execution, process launch, and host writes disabled");
  }
  return detail;
}

function buildReadonlyList(normalized, generatedAt) {
  const entries = normalized.auditDetails.map((detail) => buildListEntry(detail));
  return {
    schemaVersion: listSchemaVersion,
    listId: "workflow_plugin_management_readonly_list",
    generatedAt,
    surface: "ADMIN_WORKFLOW_PLUGIN_MANAGEMENT_LIST",
    summary: {
      listReadiness: "READONLY_LIST_READY",
      itemCount: entries.length,
      allEntriesReadOnly: true,
      allActionsDisabled: true,
      executionStatus: "EXECUTION_CANDIDATES_DISABLED",
      publicationStatus: "PUBLICATION_DISABLED",
      nextRequiredSdd: "EXECUTABLE_ISOLATION_SIGNING_ROLLOUT_ROLLBACK",
    },
    entries,
    boundary: managementReadonlyListBoundary(),
  };
}

function buildListEntry(detail) {
  return {
    rowId: `workflow_plugin_management_readonly_list_${safeToken(detail.registryEntry.registryEntryId)}`,
    detailRef: detail.detailId,
    registryEntry: detail.registryEntry,
    statuses: detail.summary,
    evidenceStageCount: detail.evidenceTimeline.length,
    disabledActionCount: detail.controlActions.length,
    blockedActionIds: requiredActionIds,
    controlActions: detail.controlActions.map((action) => ({
      actionId: action.actionId,
      enabled: false,
      disabledReason: action.disabledReason,
      evidenceRef: action.evidenceRef,
    })),
    boundary: {
      readOnly: true,
      managementListRendered: true,
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
  };
}

function managementReadonlyListBoundary() {
  return {
    readOnly: true,
    managementListRendered: true,
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
  };
}

function sameActionSet(actionIds) {
  const unique = new Set(actionIds);
  return requiredActionIds.length === unique.size && requiredActionIds.every((actionId) => unique.has(actionId));
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw listError("WORKFLOW_MANAGEMENT_READONLY_LIST_INVALID_INPUT", `${label} must be an object`);
  }
}

function listError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function safeToken(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "entry";
}
