import fs from "node:fs";
import path from "node:path";

export const WORKFLOW_PLUGIN_DRAFT_INTENT_REVIEW_REQUIRED = "REVIEW_REQUIRED";
export const WORKFLOW_PLUGIN_DRAFT_INTENT_EVENT_TYPE = "AGENT_WRITE_INTENT_REVIEW_REQUIRED";
export const WORKFLOW_PLUGIN_DRAFT_INTENT_COMMAND_PORT = "WorkflowDraftCommandPort.submitWorkflowPluginDraftIntent";

const schemaVersion = "2026-06-05.workflow-plugin.draft-intent.v1";
const resultSchemaVersion = "2026-06-05.workflow-plugin.draft-intent-result.v1";
const defaultCommandLogPath = "reports/workflow-command-log/workflow-plugin-draft-intents.jsonl";
const requiredEvidenceFields = [
  "sharedContextRef",
  "guardrailResultRef",
  "routeDecisionRef",
  "inputHash",
  "outputSummary",
  "approvalArtifactRef",
  "rollbackPlanRef",
  "auditTraceRef",
  "idempotencyKey",
];
const allowedLanguages = new Set(["typescript", "python", "powershell", "json", "yaml", "markdown"]);
const allowedRoles = new Set(["ENTRYPOINT", "TEST", "MANIFEST", "DOCUMENTATION", "SCRIPT"]);

export function submitWorkflowPluginDraftIntent(input, options = {}) {
  const now = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeIntentInput(input);
  const commandLogPath = options.commandLogPath ?? defaultCommandLogPath;
  const existing = findExistingRecordByIdempotencyKey(commandLogPath, normalized.idempotencyKey);
  if (existing) {
    assertIdempotencyReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const record = buildCommandRecord(normalized, now);
  appendCommandIntent(commandLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatWorkflowPluginDraftIntentResult(result) {
  return [
    `Workflow plugin draft intent: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Draft: ${result.draft.draftId} ${result.draft.artifactKind}/${result.draft.capabilityKind}`,
    `Execution candidates: ${result.boundary.executionCandidateAllowed ? "enabled" : "disabled"}`,
    `Registry save: ${result.boundary.registrySaveAllowed ? "enabled" : "disabled"}`,
  ].join("\n");
}

function normalizeIntentInput(input) {
  assertPlainObject(input, "input");
  if (input.intentId !== "draft_workflow_plugin") {
    throw intentError("WORKFLOW_DRAFT_INTENT_UNKNOWN_INTENT", "intentId must be draft_workflow_plugin");
  }
  const principal = assertPrincipal(input.principal);
  const draft = assertDraftSafety(input.draft);
  const evidence = assertEvidence(input);
  authorizePrincipal(principal);
  return {
    intentId: input.intentId,
    principal,
    draft,
    ...evidence,
  };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "principal");
  const required = ["principalId", "role", "subjectType", "entryPoint", "scopes", "requiresHarnessApproval", "sessionId"];
  for (const field of required) {
    if (principal[field] === undefined || principal[field] === null || principal[field] === "") {
      throw intentError("WORKFLOW_DRAFT_INTENT_MISSING_PRINCIPAL", `principal.${field} is required`);
    }
  }
  if (!Array.isArray(principal.scopes) || principal.scopes.length === 0) {
    throw intentError("WORKFLOW_DRAFT_INTENT_MISSING_PRINCIPAL_SCOPE", "principal.scopes must be non-empty");
  }
  return {
    principalId: String(principal.principalId),
    role: String(principal.role),
    subjectType: String(principal.subjectType),
    entryPoint: String(principal.entryPoint),
    scopes: [...principal.scopes].map(String),
    requiresHarnessApproval: principal.requiresHarnessApproval === true,
    sessionId: String(principal.sessionId),
  };
}

function authorizePrincipal(principal) {
  if (principal.role === "STUDENT") {
    throw intentError("WORKFLOW_DRAFT_INTENT_FORBIDDEN_PRINCIPAL", "student principals cannot submit workflow/plugin draft intents");
  }
  if (!principal.scopes.includes("AGENT_COMMAND_SUBMIT") && !principal.scopes.includes("ADMIN_SYSTEM")) {
    throw intentError("WORKFLOW_DRAFT_INTENT_MISSING_PERMISSION", "AGENT_COMMAND_SUBMIT or ADMIN_SYSTEM scope is required");
  }
  if ((principal.subjectType === "REMOTE_CHANNEL" || principal.entryPoint === "REMOTE_SOCIAL") &&
    principal.requiresHarnessApproval !== true) {
    throw intentError("WORKFLOW_DRAFT_INTENT_REMOTE_REQUIRES_HARNESS", "remote workflow/plugin draft intents require Harness approval");
  }
}

function assertDraftSafety(draft) {
  assertPlainObject(draft, "draft");
  const required = [
    "schemaVersion",
    "draftId",
    "artifactKind",
    "capabilityKind",
    "origin",
    "status",
    "userIntent",
    "generatedBy",
    "generatedFiles",
    "executionMode",
    "sandboxRequired",
    "humanApprovalRequired",
    "allowedHostAccess",
    "registrySaveAllowed",
  ];
  for (const field of required) {
    if (draft[field] === undefined || draft[field] === null || draft[field] === "") {
      throw intentError("WORKFLOW_DRAFT_INTENT_INVALID_DRAFT", `draft.${field} is required`);
    }
  }
  if (draft.schemaVersion !== "2026-05-30.workflow-plugin.draft.v1") {
    throw intentError("WORKFLOW_DRAFT_INTENT_INVALID_DRAFT", "unsupported workflow/plugin draft schemaVersion");
  }
  if (!["WORKFLOW", "PLUGIN"].includes(draft.artifactKind)) {
    throw intentError("WORKFLOW_DRAFT_INTENT_INVALID_DRAFT", "draft.artifactKind must be WORKFLOW or PLUGIN");
  }
  if (!["WORKFLOW", "MCP_TOOL", "SKILL", "SCRIPT"].includes(draft.capabilityKind)) {
    throw intentError("WORKFLOW_DRAFT_INTENT_INVALID_DRAFT", "draft.capabilityKind is not allowed");
  }
  if (!["USER_REQUEST", "TASK_FAILURE_LEARNING"].includes(draft.origin)) {
    throw intentError("WORKFLOW_DRAFT_INTENT_INVALID_DRAFT", "draft.origin is not allowed");
  }
  if (draft.origin === "TASK_FAILURE_LEARNING" && !draft.failureContext?.taskFailureId) {
    throw intentError("WORKFLOW_DRAFT_INTENT_INVALID_DRAFT", "task failure learning drafts require failureContext.taskFailureId");
  }
  if (draft.status !== "DRAFT" ||
    draft.executionMode !== "DRY_RUN_ONLY" ||
    draft.sandboxRequired !== true ||
    draft.humanApprovalRequired !== true ||
    draft.allowedHostAccess !== "NONE" ||
    draft.registrySaveAllowed !== false) {
    throw intentError("WORKFLOW_DRAFT_INTENT_UNSAFE_DRAFT", "draft must remain DRAFT, DRY_RUN_ONLY, sandboxed, approval-gated, no host access, and registry-save disabled");
  }
  assertPlainObject(draft.generatedBy, "draft.generatedBy");
  if (!draft.generatedBy.agentKind || !draft.generatedBy.modelRef) {
    throw intentError("WORKFLOW_DRAFT_INTENT_INVALID_DRAFT", "draft.generatedBy.agentKind and modelRef are required");
  }
  if (!Array.isArray(draft.generatedFiles) || draft.generatedFiles.length === 0) {
    throw intentError("WORKFLOW_DRAFT_INTENT_INVALID_DRAFT", "draft.generatedFiles must be non-empty");
  }
  for (const file of draft.generatedFiles) {
    assertGeneratedFile(file);
  }
  return {
    schemaVersion: draft.schemaVersion,
    draftId: String(draft.draftId),
    artifactKind: String(draft.artifactKind),
    capabilityKind: String(draft.capabilityKind),
    origin: String(draft.origin),
    status: draft.status,
    userIntent: String(draft.userIntent),
    generatedBy: {
      agentKind: String(draft.generatedBy.agentKind),
      modelRef: String(draft.generatedBy.modelRef),
    },
    failureContext: draft.failureContext ?? null,
    generatedFiles: draft.generatedFiles.map((file) => ({
      path: String(file.path),
      language: String(file.language),
      role: String(file.role),
      contentRef: String(file.contentRef),
    })),
    executionMode: draft.executionMode,
    sandboxRequired: draft.sandboxRequired,
    humanApprovalRequired: draft.humanApprovalRequired,
    allowedHostAccess: draft.allowedHostAccess,
    registrySaveAllowed: draft.registrySaveAllowed,
  };
}

function assertGeneratedFile(file) {
  assertPlainObject(file, "draft.generatedFiles[]");
  for (const field of ["path", "language", "role", "contentRef"]) {
    if (!file[field]) {
      throw intentError("WORKFLOW_DRAFT_INTENT_INVALID_DRAFT", `generated file ${field} is required`);
    }
  }
  if (path.isAbsolute(String(file.path)) || String(file.path).split(/[\\/]+/u).includes("..")) {
    throw intentError("WORKFLOW_DRAFT_INTENT_UNSAFE_DRAFT", "generated file paths must stay relative and cannot traverse directories");
  }
  if (!allowedLanguages.has(String(file.language))) {
    throw intentError("WORKFLOW_DRAFT_INTENT_INVALID_DRAFT", `generated file language ${file.language} is not allowed`);
  }
  if (!allowedRoles.has(String(file.role))) {
    throw intentError("WORKFLOW_DRAFT_INTENT_INVALID_DRAFT", `generated file role ${file.role} is not allowed`);
  }
}

function assertEvidence(input) {
  const evidence = {};
  for (const field of requiredEvidenceFields) {
    if (!input[field]) {
      throw intentError("WORKFLOW_DRAFT_INTENT_MISSING_EVIDENCE", `${field} is required`);
    }
    evidence[field] = String(input[field]);
  }
  if (!evidence.inputHash.startsWith("sha256:")) {
    throw intentError("WORKFLOW_DRAFT_INTENT_INVALID_EVIDENCE", "inputHash must be a sha256 reference");
  }
  return evidence;
}

function buildCommandRecord(normalized, submittedAt) {
  return {
    schemaVersion,
    recordType: "WORKFLOW_PLUGIN_DRAFT_INTENT",
    recordId: `workflow_plugin_draft_intent_${safeToken(normalized.idempotencyKey)}`,
    submittedAt,
    intentId: normalized.intentId,
    commandPort: WORKFLOW_PLUGIN_DRAFT_INTENT_COMMAND_PORT,
    status: WORKFLOW_PLUGIN_DRAFT_INTENT_REVIEW_REQUIRED,
    eventType: WORKFLOW_PLUGIN_DRAFT_INTENT_EVENT_TYPE,
    principal: normalized.principal,
    draft: normalized.draft,
    evidence: {
      sharedContextRef: normalized.sharedContextRef,
      guardrailResultRef: normalized.guardrailResultRef,
      routeDecisionRef: normalized.routeDecisionRef,
      inputHash: normalized.inputHash,
      outputSummary: normalized.outputSummary,
      approvalArtifactRef: normalized.approvalArtifactRef,
      rollbackPlanRef: normalized.rollbackPlanRef,
      auditTraceRef: normalized.auditTraceRef,
      idempotencyKey: normalized.idempotencyKey,
    },
    boundary: reviewOnlyBoundary(),
  };
}

function buildResult(record, options) {
  return {
    schemaVersion: resultSchemaVersion,
    intentId: record.intentId,
    commandPort: record.commandPort,
    status: record.status,
    eventType: record.eventType,
    recordId: record.recordId,
    submittedAt: record.submittedAt,
    idempotencyKey: record.evidence.idempotencyKey,
    idempotentReplay: options.idempotentReplay === true,
    draft: {
      draftId: record.draft.draftId,
      artifactKind: record.draft.artifactKind,
      capabilityKind: record.draft.capabilityKind,
      origin: record.draft.origin,
    },
    evidence: record.evidence,
    boundary: record.boundary,
    nextAction: "Queue the draft for Harness review, sandbox result inspection, human performance/effect evaluation, and later registry admission.",
  };
}

function reviewOnlyBoundary() {
  return {
    commandIntentRecorded: true,
    approvalRequired: true,
    sandboxRequired: true,
    executionCandidateAllowed: false,
    localGeneratedCodeExecuted: false,
    workflowPublishAllowed: false,
    registrySaveAllowed: false,
    directDatabaseWriteAllowed: false,
    localToolMutationAllowed: false,
    finalEvaluationWriteAllowed: false,
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
    if (record?.recordType === "WORKFLOW_PLUGIN_DRAFT_INTENT" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertIdempotencyReplayMatches(existing, normalized) {
  if (existing.draft?.draftId !== normalized.draft.draftId ||
    existing.evidence?.inputHash !== normalized.inputHash) {
    throw intentError("WORKFLOW_DRAFT_INTENT_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different draft or input hash");
  }
}

function assertPlainObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw intentError("WORKFLOW_DRAFT_INTENT_INVALID_INPUT", `${name} must be an object`);
  }
}

function safeToken(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9_-]+/gu, "_").replace(/^_+|_+$/gu, "") || "unknown";
}

function intentError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
