import fs from "node:fs";
import path from "node:path";

export const WORKFLOW_PLUGIN_HUMAN_APPROVAL_COMMAND_PORT = "WorkflowApprovalCommandPort.recordWorkflowPluginHumanApproval";
export const WORKFLOW_PLUGIN_HUMAN_APPROVED_REGISTRY_ADMISSION_READY = "HUMAN_APPROVED_REGISTRY_ADMISSION_READY";
export const WORKFLOW_PLUGIN_HUMAN_REVIEW_REVISION_REQUIRED = "HUMAN_REVIEW_REVISION_REQUIRED";

const schemaVersion = "2026-06-05.workflow-plugin.human-approval.v1";
const resultSchemaVersion = "2026-06-05.workflow-plugin.human-approval-recorded.v1";
const defaultCommandLogPath = "reports/workflow-command-log/workflow-plugin-human-approvals.jsonl";
const requiredEvidenceFields = [
  "draftIntentRecordRef",
  "sandboxResultRecordRef",
  "sharedContextRef",
  "guardrailResultRef",
  "routeDecisionRef",
  "inputHash",
  "outputSummary",
  "performanceEvidenceRef",
  "effectEvidenceRef",
  "rollbackPlanRef",
  "auditTraceRef",
  "idempotencyKey",
];

export function recordWorkflowPluginHumanApproval(input, options = {}) {
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

export function formatWorkflowPluginHumanApproval(result) {
  return [
    `Workflow plugin human approval: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Approval: ${result.approval.approvalId} ${result.approval.decision}`,
    `Registry admission ready: ${result.registryAdmissionReady}`,
    `Registry save: ${result.boundary.registrySaveAllowed ? "enabled" : "disabled"}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  const principal = assertPrincipal(input.principal);
  authorizeHumanReviewer(principal);
  const draft = assertDraft(input.draft);
  const sandboxRun = assertSandboxRun(input.sandboxRun, draft);
  const approval = assertApproval(input.approval, principal, draft, sandboxRun);
  const evidence = assertEvidence(input);
  return {
    principal,
    draft,
    sandboxRun,
    approval,
    ...evidence,
  };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "principal");
  const required = ["principalId", "role", "subjectType", "entryPoint", "scopes", "requiresHarnessApproval", "sessionId"];
  for (const field of required) {
    if (principal[field] === undefined || principal[field] === null || principal[field] === "") {
      throw approvalError("WORKFLOW_HUMAN_APPROVAL_MISSING_PRINCIPAL", `principal.${field} is required`);
    }
  }
  if (!Array.isArray(principal.scopes) || principal.scopes.length === 0) {
    throw approvalError("WORKFLOW_HUMAN_APPROVAL_MISSING_SCOPE", "principal.scopes must be non-empty");
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

function authorizeHumanReviewer(principal) {
  if (principal.role === "STUDENT" || principal.role === "SERVICE" || principal.subjectType === "REMOTE_CHANNEL") {
    throw approvalError("WORKFLOW_HUMAN_APPROVAL_FORBIDDEN_PRINCIPAL", "human workflow/plugin approval requires a non-student human reviewer");
  }
  if (!principal.scopes.includes("HARNESS_APPROVE") && !principal.scopes.includes("ADMIN_SYSTEM")) {
    throw approvalError("WORKFLOW_HUMAN_APPROVAL_MISSING_PERMISSION", "HARNESS_APPROVE or ADMIN_SYSTEM scope is required");
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
      throw approvalError("WORKFLOW_HUMAN_APPROVAL_INVALID_DRAFT", `draft.${field} is required`);
    }
  }
  if (draft.schemaVersion !== "2026-05-30.workflow-plugin.draft.v1" ||
    draft.status !== "DRAFT" ||
    draft.executionMode !== "DRY_RUN_ONLY" ||
    draft.sandboxRequired !== true ||
    draft.humanApprovalRequired !== true ||
    draft.allowedHostAccess !== "NONE" ||
    draft.registrySaveAllowed !== false) {
    throw approvalError("WORKFLOW_HUMAN_APPROVAL_UNSAFE_DRAFT", "draft must remain review-only before human approval recording");
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
      throw approvalError("WORKFLOW_HUMAN_APPROVAL_INVALID_SANDBOX_RUN", `sandboxRun.${field} is required`);
    }
  }
  if (sandboxRun.schemaVersion !== "2026-05-30.workflow-plugin.sandbox-run.v1") {
    throw approvalError("WORKFLOW_HUMAN_APPROVAL_INVALID_SANDBOX_RUN", "unsupported sandbox run schemaVersion");
  }
  if (sandboxRun.draftId !== draft.draftId) {
    throw approvalError("WORKFLOW_HUMAN_APPROVAL_DRAFT_MISMATCH", "sandboxRun.draftId must match draft.draftId");
  }
  if (sandboxRun.status !== "PASS") {
    throw approvalError("WORKFLOW_HUMAN_APPROVAL_SANDBOX_NOT_PASSED", "human approval requires a passing sandbox result");
  }
  if (sandboxRun.executedInSandbox !== true ||
    sandboxRun.noHostWrite !== true ||
    sandboxRun.networkPolicy !== "DEFAULT_DENY") {
    throw approvalError("WORKFLOW_HUMAN_APPROVAL_UNSAFE_SANDBOX_RUN", "sandbox result must prove sandbox execution, no host writes, and default-deny networking");
  }
  if (!Array.isArray(sandboxRun.tests) || sandboxRun.tests.length === 0) {
    throw approvalError("WORKFLOW_HUMAN_APPROVAL_INVALID_SANDBOX_RUN", "sandboxRun.tests must be non-empty");
  }
  const tests = sandboxRun.tests.map(assertSandboxTest);
  if (tests.some((test) => test.status !== "PASS")) {
    throw approvalError("WORKFLOW_HUMAN_APPROVAL_INCONSISTENT_SANDBOX_RUN", "human approval cannot proceed with failing sandbox tests");
  }
  assertPlainObject(sandboxRun.performanceSummary, "sandboxRun.performanceSummary");
  if (!Number.isInteger(sandboxRun.performanceSummary.p95Ms) ||
    !Number.isInteger(sandboxRun.performanceSummary.maxMemoryMb) ||
    sandboxRun.performanceSummary.p95Ms < 0 ||
    sandboxRun.performanceSummary.maxMemoryMb < 0) {
    throw approvalError("WORKFLOW_HUMAN_APPROVAL_INVALID_SANDBOX_RUN", "performanceSummary requires non-negative p95Ms and maxMemoryMb");
  }
  return {
    ...sandboxRun,
    runId: String(sandboxRun.runId),
    draftId: String(sandboxRun.draftId),
    status: String(sandboxRun.status),
    tests,
    performanceSummary: {
      p95Ms: sandboxRun.performanceSummary.p95Ms,
      maxMemoryMb: sandboxRun.performanceSummary.maxMemoryMb,
    },
  };
}

function assertSandboxTest(test) {
  assertPlainObject(test, "sandboxRun.tests[]");
  for (const field of ["name", "status", "durationMs", "logRef"]) {
    if (test[field] === undefined || test[field] === null || test[field] === "") {
      throw approvalError("WORKFLOW_HUMAN_APPROVAL_INVALID_SANDBOX_RUN", `sandbox test ${field} is required`);
    }
  }
  if (!["PASS", "FAIL"].includes(test.status)) {
    throw approvalError("WORKFLOW_HUMAN_APPROVAL_INVALID_SANDBOX_RUN", "sandbox test status must be PASS or FAIL");
  }
  if (!Number.isInteger(test.durationMs) || test.durationMs < 0) {
    throw approvalError("WORKFLOW_HUMAN_APPROVAL_INVALID_SANDBOX_RUN", "sandbox test durationMs must be a non-negative integer");
  }
  return {
    name: String(test.name),
    status: String(test.status),
    durationMs: test.durationMs,
    logRef: String(test.logRef),
  };
}

function assertApproval(approval, principal, draft, sandboxRun) {
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
      throw approvalError("WORKFLOW_HUMAN_APPROVAL_INVALID_APPROVAL", `approval.${field} is required`);
    }
  }
  if (approval.schemaVersion !== "2026-05-30.workflow-plugin.approval.v1") {
    throw approvalError("WORKFLOW_HUMAN_APPROVAL_INVALID_APPROVAL", "unsupported approval schemaVersion");
  }
  if (!["APPROVED", "REJECTED", "REVISION_REQUESTED"].includes(approval.decision)) {
    throw approvalError("WORKFLOW_HUMAN_APPROVAL_INVALID_APPROVAL", "approval.decision is not allowed");
  }
  if (approval.draftId !== draft.draftId || approval.sandboxRunId !== sandboxRun.runId) {
    throw approvalError("WORKFLOW_HUMAN_APPROVAL_DRAFT_MISMATCH", "approval must reference the same draft and sandbox run");
  }
  if (approval.reviewerPrincipalId !== principal.principalId) {
    throw approvalError("WORKFLOW_HUMAN_APPROVAL_REVIEWER_MISMATCH", "approval reviewerPrincipalId must match the principal");
  }
  if (approval.performanceReviewed !== true || approval.effectReviewed !== true) {
    throw approvalError("WORKFLOW_HUMAN_APPROVAL_MISSING_REVIEW", "performanceReviewed and effectReviewed must both be true");
  }
  if (approval.decision === "APPROVED" && approval.registrySaveDecision !== "ALLOW_SAVE") {
    throw approvalError("WORKFLOW_HUMAN_APPROVAL_INCONSISTENT_DECISION", "approved reviews must set registrySaveDecision=ALLOW_SAVE");
  }
  if (approval.decision !== "APPROVED" && approval.registrySaveDecision !== "BLOCK_SAVE") {
    throw approvalError("WORKFLOW_HUMAN_APPROVAL_INCONSISTENT_DECISION", "non-approved reviews must block registry save");
  }
  if (approval.decision !== "APPROVED" && String(approval.comments ?? "").trim().length === 0) {
    throw approvalError("WORKFLOW_HUMAN_APPROVAL_MISSING_FEEDBACK", "rejected or revision-requested reviews require comments");
  }
  return {
    schemaVersion: approval.schemaVersion,
    approvalId: String(approval.approvalId),
    draftId: String(approval.draftId),
    sandboxRunId: String(approval.sandboxRunId),
    reviewerPrincipalId: String(approval.reviewerPrincipalId),
    decision: String(approval.decision),
    performanceReviewed: approval.performanceReviewed === true,
    effectReviewed: approval.effectReviewed === true,
    registrySaveDecision: String(approval.registrySaveDecision),
    reviewedAt: String(approval.reviewedAt),
    comments: approval.comments === undefined ? "" : String(approval.comments),
  };
}

function assertEvidence(input) {
  const evidence = {};
  for (const field of requiredEvidenceFields) {
    if (!input[field]) {
      throw approvalError("WORKFLOW_HUMAN_APPROVAL_MISSING_EVIDENCE", `${field} is required`);
    }
    evidence[field] = String(input[field]);
  }
  if (!evidence.inputHash.startsWith("sha256:")) {
    throw approvalError("WORKFLOW_HUMAN_APPROVAL_INVALID_EVIDENCE", "inputHash must be a sha256 reference");
  }
  return evidence;
}

function buildCommandRecord(normalized, recordedAt) {
  const approved = normalized.approval.decision === "APPROVED";
  return {
    schemaVersion,
    recordType: "WORKFLOW_PLUGIN_HUMAN_APPROVAL",
    recordId: `workflow_plugin_human_approval_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    commandPort: WORKFLOW_PLUGIN_HUMAN_APPROVAL_COMMAND_PORT,
    status: approved
      ? WORKFLOW_PLUGIN_HUMAN_APPROVED_REGISTRY_ADMISSION_READY
      : WORKFLOW_PLUGIN_HUMAN_REVIEW_REVISION_REQUIRED,
    principal: normalized.principal,
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
      p95Ms: normalized.sandboxRun.performanceSummary.p95Ms,
      maxMemoryMb: normalized.sandboxRun.performanceSummary.maxMemoryMb,
    },
    approval: normalized.approval,
    evidence: {
      draftIntentRecordRef: normalized.draftIntentRecordRef,
      sandboxResultRecordRef: normalized.sandboxResultRecordRef,
      sharedContextRef: normalized.sharedContextRef,
      guardrailResultRef: normalized.guardrailResultRef,
      routeDecisionRef: normalized.routeDecisionRef,
      inputHash: normalized.inputHash,
      outputSummary: normalized.outputSummary,
      performanceEvidenceRef: normalized.performanceEvidenceRef,
      effectEvidenceRef: normalized.effectEvidenceRef,
      rollbackPlanRef: normalized.rollbackPlanRef,
      auditTraceRef: normalized.auditTraceRef,
      idempotencyKey: normalized.idempotencyKey,
    },
    boundary: humanApprovalBoundary(approved),
  };
}

function buildResult(record, options) {
  const registryAdmissionReady = record.status === WORKFLOW_PLUGIN_HUMAN_APPROVED_REGISTRY_ADMISSION_READY;
  return {
    schemaVersion: resultSchemaVersion,
    commandPort: record.commandPort,
    status: record.status,
    recordId: record.recordId,
    recordedAt: record.recordedAt,
    idempotencyKey: record.evidence.idempotencyKey,
    idempotentReplay: options.idempotentReplay === true,
    draft: record.draft,
    sandboxRun: record.sandboxRun,
    approval: {
      approvalId: record.approval.approvalId,
      decision: record.approval.decision,
      performanceReviewed: record.approval.performanceReviewed,
      effectReviewed: record.approval.effectReviewed,
      registrySaveDecision: record.approval.registrySaveDecision,
      reviewedAt: record.approval.reviewedAt,
    },
    registryAdmissionReady,
    revisionRequired: !registryAdmissionReady,
    evidence: record.evidence,
    boundary: record.boundary,
    nextAction: registryAdmissionReady
      ? "Use this append-only approval evidence as input to registry admission; generated code still stays dry-run and non-executable."
      : "Revise the generated workflow/plugin from human feedback, then submit a new review-only draft and sandbox run.",
  };
}

function humanApprovalBoundary(approved) {
  return {
    humanApprovalRecorded: true,
    performanceReviewedRequired: true,
    effectReviewedRequired: true,
    registryAdmissionCandidate: approved,
    registrySaveAllowed: false,
    workflowPublishAllowed: false,
    executionCandidateAllowed: false,
    localGeneratedCodeExecuted: false,
    generatedCodeExecutedOnHost: false,
    directDatabaseWriteAllowed: false,
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
    if (record?.recordType === "WORKFLOW_PLUGIN_HUMAN_APPROVAL" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.approval?.approvalId !== normalized.approval.approvalId ||
    existing.evidence?.inputHash !== normalized.inputHash ||
    existing.approval?.decision !== normalized.approval.decision) {
    throw approvalError("WORKFLOW_HUMAN_APPROVAL_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different approval, decision, or input hash");
  }
}

function assertPlainObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw approvalError("WORKFLOW_HUMAN_APPROVAL_INVALID_INPUT", `${name} must be an object`);
  }
}

function safeToken(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9_-]+/gu, "_").replace(/^_+|_+$/gu, "") || "unknown";
}

function approvalError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
