export const WORKFLOW_PLUGIN_MANAGEMENT_AUDIT_DETAIL_READ_PORT = "WorkflowManagementReadPort.renderWorkflowPluginManagementAuditDetail";
export const WORKFLOW_PLUGIN_MANAGEMENT_AUDIT_DETAIL_READONLY = "WORKFLOW_PLUGIN_MANAGEMENT_AUDIT_DETAIL_READONLY";

const detailSchemaVersion = "2026-06-05.workflow-plugin.management-audit-detail.v1";
const resultSchemaVersion = "2026-06-05.workflow-plugin.management-audit-detail-rendered.v1";

export function renderWorkflowPluginManagementAuditDetail(input, options = {}) {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const detail = buildAuditDetail(normalized, generatedAt);
  return {
    schemaVersion: resultSchemaVersion,
    readPort: WORKFLOW_PLUGIN_MANAGEMENT_AUDIT_DETAIL_READ_PORT,
    status: WORKFLOW_PLUGIN_MANAGEMENT_AUDIT_DETAIL_READONLY,
    generatedAt,
    detail,
    boundary: detail.boundary,
    nextAction: "Render workflow/plugin audit detail as read-only; executable isolation, signing, rollout, rollback, and publication remain future SDD work.",
  };
}

export function formatWorkflowPluginManagementAuditDetail(result) {
  return [
    `Workflow plugin management audit detail: ${result.status}`,
    `Read port: ${result.readPort}`,
    `Registry entry: ${result.detail.registryEntry.registryEntryId}`,
    `Timeline stages: ${result.detail.evidenceTimeline.length}`,
    `All actions disabled: ${result.boundary.allActionsDisabled}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  const principal = assertPrincipal(input.principal);
  authorizeManagementDetailReader(principal);
  const managementDisabledViewResult = assertManagementDisabledViewResult(input.managementDisabledViewResult);
  const evidenceReports = assertEvidenceReports(input.evidenceReports);
  return {
    principal,
    managementDisabledViewResult,
    evidenceReports,
  };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "principal");
  const required = ["principalId", "role", "subjectType", "entryPoint", "scopes", "requiresHarnessApproval", "sessionId"];
  for (const field of required) {
    if (principal[field] === undefined || principal[field] === null || principal[field] === "") {
      throw detailError("WORKFLOW_MANAGEMENT_AUDIT_DETAIL_MISSING_PRINCIPAL", `principal.${field} is required`);
    }
  }
  if (!Array.isArray(principal.scopes) || principal.scopes.length === 0) {
    throw detailError("WORKFLOW_MANAGEMENT_AUDIT_DETAIL_MISSING_SCOPE", "principal.scopes must be non-empty");
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

function authorizeManagementDetailReader(principal) {
  if (principal.role === "STUDENT" || principal.subjectType === "REMOTE_CHANNEL") {
    throw detailError("WORKFLOW_MANAGEMENT_AUDIT_DETAIL_FORBIDDEN_PRINCIPAL", "students and remote channels cannot read workflow/plugin management audit details");
  }
  const isInternalService = principal.role === "SERVICE" &&
    principal.subjectType === "SERVICE" &&
    principal.entryPoint === "AGENT_INTERNAL";
  const isAdmin = principal.role === "ADMIN";
  if (!isInternalService && !isAdmin) {
    throw detailError("WORKFLOW_MANAGEMENT_AUDIT_DETAIL_FORBIDDEN_PRINCIPAL", "management audit details must be read by an internal service or admin");
  }
  if (!principal.scopes.includes("ADMIN_SYSTEM")) {
    throw detailError("WORKFLOW_MANAGEMENT_AUDIT_DETAIL_MISSING_PERMISSION", "ADMIN_SYSTEM scope is required for management audit details");
  }
}

function assertManagementDisabledViewResult(result) {
  assertPlainObject(result, "managementDisabledViewResult");
  assertPlainObject(result.view, "managementDisabledViewResult.view");
  assertPlainObject(result.view.registryEntry, "managementDisabledViewResult.view.registryEntry");
  assertPlainObject(result.boundary, "managementDisabledViewResult.boundary");
  if (result.status !== "WORKFLOW_PLUGIN_MANAGEMENT_VIEW_DISABLED") {
    throw detailError("WORKFLOW_MANAGEMENT_AUDIT_DETAIL_VIEW_NOT_DISABLED", "management view must be disabled before audit detail rendering");
  }
  if (result.view.surface !== "ADMIN_WORKFLOW_PLUGIN_MANAGEMENT" ||
    result.view.disabledActionCount !== 4 ||
    !Array.isArray(result.view.actions) ||
    result.view.actions.length !== 4 ||
    !result.view.actions.every((action) => action.enabled === false)) {
    throw detailError("WORKFLOW_MANAGEMENT_AUDIT_DETAIL_UNSAFE_ACTIONS", "management view must expose exactly four disabled control actions");
  }
  if (result.boundary.allActionsDisabled !== true ||
    result.boundary.workflowPublishAllowed !== false ||
    result.boundary.pluginMarketplaceExposureAllowed !== false ||
    result.boundary.executionCandidateAllowed !== false ||
    result.boundary.localExecutionEnabled !== false ||
    result.boundary.processLaunchAllowed !== false ||
    result.boundary.hostWriteAllowed !== false ||
    result.boundary.requiresFutureSdd !== true) {
    throw detailError("WORKFLOW_MANAGEMENT_AUDIT_DETAIL_UNSAFE_BOUNDARY", "management disabled view boundary must keep publish, marketplace, execution, process launch, and host writes disabled");
  }
  return result;
}

function assertEvidenceReports(reports) {
  assertPlainObject(reports, "evidenceReports");
  const required = [
    "draftIntent",
    "sandboxResult",
    "humanApproval",
    "registryAdmission",
    "executionIsolation",
    "publicationDisabled",
    "managementDisabledView",
  ];
  const normalized = {};
  for (const key of required) {
    assertPlainObject(reports[key], `evidenceReports.${key}`);
    if (sourceStatus(reports[key]) !== "READY") {
      throw detailError("WORKFLOW_MANAGEMENT_AUDIT_DETAIL_REPORT_NOT_READY", `${key} report must be READY`);
    }
    normalized[key] = reports[key];
  }
  assertDraftIntentReport(normalized.draftIntent);
  assertSandboxResultReport(normalized.sandboxResult);
  assertHumanApprovalReport(normalized.humanApproval);
  assertRegistryAdmissionReport(normalized.registryAdmission);
  assertExecutionIsolationReport(normalized.executionIsolation);
  assertPublicationDisabledReport(normalized.publicationDisabled);
  assertManagementDisabledViewReport(normalized.managementDisabledView);
  return normalized;
}

function assertDraftIntentReport(report) {
  const boundary = assertBoundary(report);
  if (boundary.executionCandidateAllowed !== false ||
    boundary.localGeneratedCodeExecuted !== false ||
    boundary.workflowPublishAllowed !== false ||
    boundary.registrySaveAllowed !== false ||
    boundary.directDatabaseWriteAllowed !== false) {
    throw detailError("WORKFLOW_MANAGEMENT_AUDIT_DETAIL_UNSAFE_DRAFT", "draft intent must remain review-only");
  }
}

function assertSandboxResultReport(report) {
  const boundary = assertBoundary(report);
  if (boundary.registrySaveAllowed !== false ||
    boundary.workflowPublishAllowed !== false ||
    boundary.executionCandidateAllowed !== false ||
    boundary.localGeneratedCodeExecuted !== false ||
    boundary.humanApprovalRequiredBeforeRegistry !== true) {
    throw detailError("WORKFLOW_MANAGEMENT_AUDIT_DETAIL_UNSAFE_SANDBOX", "sandbox result must not enable registry, publication, execution, or host code");
  }
}

function assertHumanApprovalReport(report) {
  const boundary = assertBoundary(report);
  if (boundary.registrySaveAllowed !== false ||
    boundary.workflowPublishAllowed !== false ||
    boundary.executionCandidateAllowed !== false ||
    boundary.localGeneratedCodeExecuted !== false ||
    boundary.registryAdmissionCandidateRequiresApproval !== true) {
    throw detailError("WORKFLOW_MANAGEMENT_AUDIT_DETAIL_UNSAFE_APPROVAL", "human approval must still require registry admission and keep execution disabled");
  }
}

function assertRegistryAdmissionReport(report) {
  const boundary = assertBoundary(report);
  if (boundary.registryEntryPersisted !== true ||
    boundary.executionMode !== "DRY_RUN_ONLY" ||
    boundary.localExecutionEnabled !== false ||
    boundary.workflowPublishAllowed !== false ||
    boundary.executionCandidateAllowed !== false ||
    boundary.localGeneratedCodeExecuted !== false) {
    throw detailError("WORKFLOW_MANAGEMENT_AUDIT_DETAIL_UNSAFE_REGISTRY", "registry admission must persist dry-run entries only");
  }
}

function assertExecutionIsolationReport(report) {
  const boundary = assertBoundary(report);
  if (boundary.executionCandidateAllowed !== false ||
    boundary.executionCandidateCount !== 0 ||
    boundary.localExecutionEnabled !== false ||
    boundary.workflowPublishAllowed !== false ||
    boundary.processLaunchAllowed !== false ||
    boundary.hostWriteAllowed !== false ||
    boundary.requiresFutureSdd !== true) {
    throw detailError("WORKFLOW_MANAGEMENT_AUDIT_DETAIL_UNSAFE_ISOLATION", "execution isolation must keep candidates and host effects disabled");
  }
}

function assertPublicationDisabledReport(report) {
  const boundary = assertBoundary(report);
  if (boundary.workflowPublishAllowed !== false ||
    boundary.pluginMarketplaceExposureAllowed !== false ||
    boundary.executionCandidateAllowed !== false ||
    boundary.localExecutionEnabled !== false ||
    boundary.processLaunchAllowed !== false ||
    boundary.hostWriteAllowed !== false ||
    boundary.requiresFutureSdd !== true) {
    throw detailError("WORKFLOW_MANAGEMENT_AUDIT_DETAIL_UNSAFE_PUBLICATION", "publication disabled report must keep publish, marketplace, and execution disabled");
  }
}

function assertManagementDisabledViewReport(report) {
  const boundary = assertBoundary(report);
  if (boundary.allActionsDisabled !== true ||
    boundary.disabledActionCount !== 4 ||
    boundary.workflowPublishAllowed !== false ||
    boundary.pluginMarketplaceExposureAllowed !== false ||
    boundary.executionCandidateAllowed !== false ||
    boundary.localExecutionEnabled !== false ||
    boundary.processLaunchAllowed !== false ||
    boundary.hostWriteAllowed !== false ||
    boundary.requiresFutureSdd !== true) {
    throw detailError("WORKFLOW_MANAGEMENT_AUDIT_DETAIL_UNSAFE_MANAGEMENT_VIEW", "management disabled report must keep every control action disabled");
  }
}

function buildAuditDetail(normalized, generatedAt) {
  const view = normalized.managementDisabledViewResult.view;
  return {
    schemaVersion: detailSchemaVersion,
    detailId: `workflow_plugin_management_audit_detail_${safeToken(view.registryEntry.registryEntryId)}`,
    generatedAt,
    surface: "ADMIN_WORKFLOW_PLUGIN_AUDIT_DETAIL",
    registryEntry: view.registryEntry,
    summary: {
      detailReadiness: "READONLY_AUDIT_READY",
      executionStatus: "EXECUTION_CANDIDATES_DISABLED",
      publicationStatus: "PUBLICATION_DISABLED",
      managementStatus: "ALL_ACTIONS_DISABLED",
      nextRequiredSdd: "EXECUTABLE_ISOLATION_SIGNING_ROLLOUT_ROLLBACK",
    },
    evidenceTimeline: buildEvidenceTimeline(normalized.evidenceReports),
    controlActions: view.actions.map((action) => ({
      actionId: action.actionId,
      enabled: false,
      disabledReason: action.disabledReason,
      evidenceRef: action.evidenceRef,
    })),
    boundary: managementAuditDetailBoundary(),
  };
}

function buildEvidenceTimeline(reports) {
  return [
    timelineStage("DRAFT_INTENT", reports.draftIntent, "reports/workflow-plugin-draft-intent.current.json", reportRecordRef(reports.draftIntent, ["runtimeProbe", "result"]), true),
    timelineStage("SANDBOX_RESULT", reports.sandboxResult, "reports/workflow-plugin-sandbox-result.current.json", reportRecordRef(reports.sandboxResult, ["runtimeProbes", "pass", "result"]), true),
    timelineStage("HUMAN_APPROVAL", reports.humanApproval, "reports/workflow-plugin-human-approval.current.json", reportRecordRef(reports.humanApproval, ["runtimeProbes", "approved", "result"]), true),
    timelineStage("REGISTRY_ADMISSION", reports.registryAdmission, "reports/workflow-plugin-registry-admission-runtime.current.json", reportRecordRef(reports.registryAdmission, ["runtimeProbes", "allow", "result"]), true),
    timelineStage("EXECUTION_ISOLATION", reports.executionIsolation, "reports/workflow-plugin-execution-isolation.current.json", reportRecordRef(reports.executionIsolation, ["runtimeProbes", "blocked", "result"]), false),
    timelineStage("PUBLICATION_DISABLED", reports.publicationDisabled, "reports/workflow-plugin-publication-disabled.current.json", reportRecordRef(reports.publicationDisabled, ["runtimeProbes", "blocked", "result"]), false),
    timelineStage("MANAGEMENT_DISABLED_VIEW", reports.managementDisabledView, "reports/workflow-plugin-management-disabled-view.current.json", reportRecordRef(reports.managementDisabledView, ["runtimeProbes", "disabledView", "result"]), false),
  ];
}

function timelineStage(stage, report, reportRef, recordRef, allowedToAdvance) {
  return {
    stage,
    status: reportStatusValue(report),
    reportRef,
    recordRef,
    allowedToAdvance,
  };
}

function managementAuditDetailBoundary() {
  return {
    readOnly: true,
    managementDetailRendered: true,
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

function reportRecordRef(report, pathSegments) {
  let cursor = report;
  for (const segment of pathSegments) cursor = cursor?.[segment];
  return String(cursor?.recordId ?? cursor?.view?.viewId ?? `${pathSegments.join(".")}:missing-record`);
}

function reportStatusValue(report) {
  const result = report.runtimeProbe?.result ??
    report.runtimeProbes?.pass?.result ??
    report.runtimeProbes?.approved?.result ??
    report.runtimeProbes?.allow?.result ??
    report.runtimeProbes?.blocked?.result ??
    report.runtimeProbes?.disabledView?.result;
  return String(result?.status ?? report.boundary?.status ?? sourceStatus(report));
}

function assertBoundary(report) {
  assertPlainObject(report.boundary, "report.boundary");
  return report.boundary;
}

function sourceStatus(report) {
  if (typeof report.readiness === "string") return report.readiness;
  if (typeof report.status === "string") return report.status;
  if (report.decision === "ALLOW_SAVE") return "READY";
  if (report.allPassed === true) return "READY";
  return "MISSING";
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw detailError("WORKFLOW_MANAGEMENT_AUDIT_DETAIL_INVALID_INPUT", `${label} must be an object`);
  }
}

function detailError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function safeToken(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "detail";
}
