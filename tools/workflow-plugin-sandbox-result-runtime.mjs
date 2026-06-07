import fs from "node:fs";
import path from "node:path";

import { buildWorkflowPluginRevisionRequest } from "./workflow-plugin-revision-feedback.mjs";

export const WORKFLOW_PLUGIN_SANDBOX_RESULT_COMMAND_PORT = "WorkflowSandboxCommandPort.recordWorkflowPluginSandboxRunResult";
export const WORKFLOW_PLUGIN_SANDBOX_PASSED_REVIEW_REQUIRED = "SANDBOX_PASSED_REVIEW_REQUIRED";
export const WORKFLOW_PLUGIN_SANDBOX_FAILED_REVISION_REQUIRED = "SANDBOX_FAILED_REVISION_REQUIRED";

const schemaVersion = "2026-06-05.workflow-plugin.sandbox-result.v1";
const resultSchemaVersion = "2026-06-05.workflow-plugin.sandbox-result-recorded.v1";
const defaultCommandLogPath = "reports/workflow-command-log/workflow-plugin-sandbox-results.jsonl";
const requiredEvidenceFields = [
  "draftIntentRecordRef",
  "sandboxManifestRef",
  "sharedContextRef",
  "guardrailResultRef",
  "routeDecisionRef",
  "inputHash",
  "outputSummary",
  "rollbackPlanRef",
  "auditTraceRef",
  "idempotencyKey",
];

export function recordWorkflowPluginSandboxRunResult(input, options = {}) {
  const recordedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const commandLogPath = options.commandLogPath ?? defaultCommandLogPath;
  const existing = findExistingRecordByIdempotencyKey(commandLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const revisionRequest = buildWorkflowPluginRevisionRequest({
    draft: normalized.draft,
    sandboxRun: normalized.sandboxRun,
    generatedAt: recordedAt,
  });
  const record = buildCommandRecord(normalized, revisionRequest, recordedAt);
  appendCommandIntent(commandLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatWorkflowPluginSandboxResult(result) {
  return [
    `Workflow plugin sandbox result: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Sandbox run: ${result.sandboxRun.runId} for ${result.sandboxRun.draftId}`,
    `Revision required: ${result.revisionRequired}`,
    `Registry save: ${result.boundary.registrySaveAllowed ? "enabled" : "disabled"}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  const principal = assertPrincipal(input.principal);
  authorizeSandboxRecorder(principal);
  const draft = assertDraft(input.draft);
  const sandboxRun = assertSandboxRun(input.sandboxRun, draft);
  const evidence = assertEvidence(input);
  return {
    principal,
    draft,
    sandboxRun,
    ...evidence,
  };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "principal");
  const required = ["principalId", "role", "subjectType", "entryPoint", "scopes", "requiresHarnessApproval", "sessionId"];
  for (const field of required) {
    if (principal[field] === undefined || principal[field] === null || principal[field] === "") {
      throw sandboxError("WORKFLOW_SANDBOX_RESULT_MISSING_PRINCIPAL", `principal.${field} is required`);
    }
  }
  if (!Array.isArray(principal.scopes) || principal.scopes.length === 0) {
    throw sandboxError("WORKFLOW_SANDBOX_RESULT_MISSING_SCOPE", "principal.scopes must be non-empty");
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

function authorizeSandboxRecorder(principal) {
  if (principal.role === "STUDENT" || principal.subjectType === "REMOTE_CHANNEL") {
    throw sandboxError("WORKFLOW_SANDBOX_RESULT_FORBIDDEN_PRINCIPAL", "students and remote channels cannot record sandbox results");
  }
  const isServiceRecorder = principal.role === "SERVICE" &&
    principal.subjectType === "SERVICE" &&
    principal.entryPoint === "AGENT_INTERNAL";
  const isAdminRecorder = principal.role === "ADMIN" && principal.scopes.includes("ADMIN_SYSTEM");
  if (!isServiceRecorder && !isAdminRecorder) {
    throw sandboxError("WORKFLOW_SANDBOX_RESULT_FORBIDDEN_PRINCIPAL", "sandbox results must be recorded by an internal service or admin");
  }
  if (!principal.scopes.includes("AGENT_COMMAND_SUBMIT") && !principal.scopes.includes("ADMIN_SYSTEM")) {
    throw sandboxError("WORKFLOW_SANDBOX_RESULT_MISSING_PERMISSION", "AGENT_COMMAND_SUBMIT or ADMIN_SYSTEM is required");
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
    "generatedFiles",
    "executionMode",
    "sandboxRequired",
    "humanApprovalRequired",
    "allowedHostAccess",
    "registrySaveAllowed",
  ];
  for (const field of required) {
    if (draft[field] === undefined || draft[field] === null || draft[field] === "") {
      throw sandboxError("WORKFLOW_SANDBOX_RESULT_INVALID_DRAFT", `draft.${field} is required`);
    }
  }
  if (draft.schemaVersion !== "2026-05-30.workflow-plugin.draft.v1" ||
    draft.status !== "DRAFT" ||
    draft.executionMode !== "DRY_RUN_ONLY" ||
    draft.sandboxRequired !== true ||
    draft.humanApprovalRequired !== true ||
    draft.allowedHostAccess !== "NONE" ||
    draft.registrySaveAllowed !== false) {
    throw sandboxError("WORKFLOW_SANDBOX_RESULT_UNSAFE_DRAFT", "draft must remain review-only before sandbox result recording");
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
    "startedAt",
    "finishedAt",
    "status",
    "executedInSandbox",
    "noHostWrite",
    "networkPolicy",
    "tests",
    "performanceSummary",
    "feedback",
  ];
  for (const field of required) {
    if (sandboxRun[field] === undefined || sandboxRun[field] === null || sandboxRun[field] === "") {
      throw sandboxError("WORKFLOW_SANDBOX_RESULT_INVALID_RUN", `sandboxRun.${field} is required`);
    }
  }
  if (sandboxRun.schemaVersion !== "2026-05-30.workflow-plugin.sandbox-run.v1") {
    throw sandboxError("WORKFLOW_SANDBOX_RESULT_INVALID_RUN", "unsupported sandbox run schemaVersion");
  }
  if (sandboxRun.draftId !== draft.draftId) {
    throw sandboxError("WORKFLOW_SANDBOX_RESULT_DRAFT_MISMATCH", "sandboxRun.draftId must match draft.draftId");
  }
  if (!["PASS", "FAIL"].includes(sandboxRun.status)) {
    throw sandboxError("WORKFLOW_SANDBOX_RESULT_INVALID_RUN", "sandboxRun.status must be PASS or FAIL");
  }
  if (sandboxRun.executedInSandbox !== true ||
    sandboxRun.noHostWrite !== true ||
    sandboxRun.networkPolicy !== "DEFAULT_DENY") {
    throw sandboxError("WORKFLOW_SANDBOX_RESULT_UNSAFE_RUN", "sandbox result must prove sandbox execution, no host writes, and default-deny networking");
  }
  if (!Array.isArray(sandboxRun.tests) || sandboxRun.tests.length === 0) {
    throw sandboxError("WORKFLOW_SANDBOX_RESULT_INVALID_RUN", "sandboxRun.tests must be non-empty");
  }
  const tests = sandboxRun.tests.map(assertSandboxTest);
  if (sandboxRun.status === "PASS" && tests.some((test) => test.status !== "PASS")) {
    throw sandboxError("WORKFLOW_SANDBOX_RESULT_INCONSISTENT_RUN", "PASS sandbox run cannot contain failing tests");
  }
  if (sandboxRun.status === "FAIL" &&
    tests.every((test) => test.status !== "FAIL") &&
    (!Array.isArray(sandboxRun.feedback) || sandboxRun.feedback.length === 0)) {
    throw sandboxError("WORKFLOW_SANDBOX_RESULT_INCONSISTENT_RUN", "FAIL sandbox run must include a failed test or feedback");
  }
  assertPlainObject(sandboxRun.performanceSummary, "sandboxRun.performanceSummary");
  if (!Number.isInteger(sandboxRun.performanceSummary.p95Ms) ||
    !Number.isInteger(sandboxRun.performanceSummary.maxMemoryMb) ||
    sandboxRun.performanceSummary.p95Ms < 0 ||
    sandboxRun.performanceSummary.maxMemoryMb < 0) {
    throw sandboxError("WORKFLOW_SANDBOX_RESULT_INVALID_RUN", "performanceSummary requires non-negative p95Ms and maxMemoryMb");
  }
  return {
    ...sandboxRun,
    runId: String(sandboxRun.runId),
    draftId: String(sandboxRun.draftId),
    status: String(sandboxRun.status),
    tests,
    feedback: Array.isArray(sandboxRun.feedback) ? sandboxRun.feedback.map(String) : [],
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
      throw sandboxError("WORKFLOW_SANDBOX_RESULT_INVALID_RUN", `sandbox test ${field} is required`);
    }
  }
  if (!["PASS", "FAIL"].includes(test.status)) {
    throw sandboxError("WORKFLOW_SANDBOX_RESULT_INVALID_RUN", "sandbox test status must be PASS or FAIL");
  }
  if (!Number.isInteger(test.durationMs) || test.durationMs < 0) {
    throw sandboxError("WORKFLOW_SANDBOX_RESULT_INVALID_RUN", "sandbox test durationMs must be a non-negative integer");
  }
  return {
    name: String(test.name),
    status: String(test.status),
    durationMs: test.durationMs,
    logRef: String(test.logRef),
  };
}

function assertEvidence(input) {
  const evidence = {};
  for (const field of requiredEvidenceFields) {
    if (!input[field]) {
      throw sandboxError("WORKFLOW_SANDBOX_RESULT_MISSING_EVIDENCE", `${field} is required`);
    }
    evidence[field] = String(input[field]);
  }
  if (!evidence.inputHash.startsWith("sha256:")) {
    throw sandboxError("WORKFLOW_SANDBOX_RESULT_INVALID_EVIDENCE", "inputHash must be a sha256 reference");
  }
  return evidence;
}

function buildCommandRecord(normalized, revisionRequest, recordedAt) {
  const status = normalized.sandboxRun.status === "PASS"
    ? WORKFLOW_PLUGIN_SANDBOX_PASSED_REVIEW_REQUIRED
    : WORKFLOW_PLUGIN_SANDBOX_FAILED_REVISION_REQUIRED;
  return {
    schemaVersion,
    recordType: "WORKFLOW_PLUGIN_SANDBOX_RUN_RESULT",
    recordId: `workflow_plugin_sandbox_result_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    commandPort: WORKFLOW_PLUGIN_SANDBOX_RESULT_COMMAND_PORT,
    status,
    principal: normalized.principal,
    draft: {
      draftId: normalized.draft.draftId,
      artifactKind: normalized.draft.artifactKind,
      capabilityKind: normalized.draft.capabilityKind,
      origin: normalized.draft.origin,
    },
    sandboxRun: normalized.sandboxRun,
    evidence: {
      draftIntentRecordRef: normalized.draftIntentRecordRef,
      sandboxManifestRef: normalized.sandboxManifestRef,
      sharedContextRef: normalized.sharedContextRef,
      guardrailResultRef: normalized.guardrailResultRef,
      routeDecisionRef: normalized.routeDecisionRef,
      inputHash: normalized.inputHash,
      outputSummary: normalized.outputSummary,
      rollbackPlanRef: normalized.rollbackPlanRef,
      auditTraceRef: normalized.auditTraceRef,
      idempotencyKey: normalized.idempotencyKey,
    },
    revisionRequest,
    boundary: sandboxResultBoundary(),
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
    draft: record.draft,
    sandboxRun: {
      runId: record.sandboxRun.runId,
      draftId: record.sandboxRun.draftId,
      status: record.sandboxRun.status,
      p95Ms: record.sandboxRun.performanceSummary.p95Ms,
      maxMemoryMb: record.sandboxRun.performanceSummary.maxMemoryMb,
      failedTestCount: record.sandboxRun.tests.filter((test) => test.status === "FAIL").length,
    },
    revisionRequired: record.revisionRequest?.revisionDecision === "REVISION_REQUIRED",
    revisionRequest: record.revisionRequest,
    boundary: record.boundary,
    nextAction: record.revisionRequest
      ? "Revise generated files from sandbox feedback, then submit a new review-only draft intent."
      : "Request human performance/effect review before registry admission.",
  };
}

function sandboxResultBoundary() {
  return {
    sandboxResultRecorded: true,
    generatedCodeExecutedInSandbox: true,
    localGeneratedCodeExecuted: false,
    noHostWriteRequired: true,
    networkPolicyRequired: "DEFAULT_DENY",
    humanApprovalRequiredBeforeRegistry: true,
    registrySaveAllowed: false,
    workflowPublishAllowed: false,
    executionCandidateAllowed: false,
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
    if (record?.recordType === "WORKFLOW_PLUGIN_SANDBOX_RUN_RESULT" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.sandboxRun?.runId !== normalized.sandboxRun.runId ||
    existing.evidence?.inputHash !== normalized.inputHash) {
    throw sandboxError("WORKFLOW_SANDBOX_RESULT_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different sandbox run or input hash");
  }
}

function assertPlainObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw sandboxError("WORKFLOW_SANDBOX_RESULT_INVALID_INPUT", `${name} must be an object`);
  }
}

function safeToken(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9_-]+/gu, "_").replace(/^_+|_+$/gu, "") || "unknown";
}

function sandboxError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
