import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_content_precheck_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_COMMAND_PORT =
  "StudentAppAITutorQuestionBankDraftContentPrecheckPort.recordContentRetrievalPrecheck";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_READY =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_READY";

const inputSchemaVersion = "2026-06-05.student-app.ai-tutor-question-bank-draft-content-precheck.v1";
const outputSchemaVersion = "2026-06-05.student-app.ai-tutor-question-bank-draft-content-prechecked.v1";
const visibilitySchemaVersion = "2026-06-05.student-app.ai-tutor-question-bank-draft-visibility-listed.v1";
const visibilityRuntimeId = "student_app_ai_tutor_question_bank_draft_visibility_runtime";
const visibilityReadPort = "StudentAppAITutorQuestionBankDraftVisibilityPort.listStudentAppQuestionBankDrafts";
const visibilityStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_LISTED";
const blockedStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_BLOCKED_UNTIL_CONTENT_STORE";
const defaultCommandLogPath = "reports/student-command-log/student-app-ai-tutor-question-bank-draft-content-precheck.jsonl";

export function recordStudentAppAITutorQuestionBankDraftContentPrecheck(input, options = {}) {
  const checkedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const commandLogPath = options.commandLogPath ?? defaultCommandLogPath;
  const existing = findExistingRecordByIdempotencyKey(commandLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const record = buildPrecheckRecord(normalized, checkedAt);
  appendRecord(commandLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftContentPrecheck(result) {
  return [
    `Student App AI Tutor question-bank draft content precheck: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Draft: ${result.selectedDraft.questionBankDraftRef}`,
    `Decision: ${result.precheckDecision.contentAccessDecision}`,
    `Content read allowed: ${result.precheckDecision.contentReadAllowed}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const precheckInvocationId = requireString(input.precheckInvocationId, "input.precheckInvocationId");
  const principal = assertPrincipal(input.principal);
  const draftVisibilityResult = assertDraftVisibilityResult(input.draftVisibilityResult);
  const selectedDraft = assertSelectedDraft(input.selectedDraft, draftVisibilityResult);
  const contentPrecheckPolicy = assertContentPrecheckPolicy(input.contentPrecheckPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 160);
  if (!evidenceRefs.some((ref) => ref.includes("student-app-ai-tutor-question-bank-draft-visibility"))) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_MISSING_VISIBILITY_EVIDENCE", "visibility evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 260);
  const inputHash = hashInput({
    precheckInvocationId,
    principalId: principal.principalId,
    ownStudentId: principal.studentAccess.ownStudentId,
    selectedDraft,
    contentPrecheckPolicy,
  });
  return {
    precheckInvocationId,
    principal,
    draftVisibilityResult,
    selectedDraft,
    contentPrecheckPolicy,
    evidenceRefs,
    idempotencyKey,
    inputHash,
  };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const principalId = requireString(principal.principalId, "input.principal.principalId");
  requireConst(principal.subjectType, "USER", "input.principal.subjectType");
  requireConst(principal.role, "STUDENT", "input.principal.role");
  requireConst(principal.entryPoint, "STUDENT_APP", "input.principal.entryPoint");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  if (!scopes.includes("STUDENT_OWN_READ")) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_MISSING_SCOPE", "STUDENT_OWN_READ is required");
  }
  assertPlainObject(principal.studentAccess, "input.principal.studentAccess");
  requireConst(principal.studentAccess.mode, "OWN", "input.principal.studentAccess.mode");
  const ownStudentId = requireBoundedString(principal.studentAccess.ownStudentId, "input.principal.studentAccess.ownStudentId", 1, 128);
  return {
    ...principal,
    principalId,
    sessionId: requireString(principal.sessionId, "input.principal.sessionId"),
    scopes,
    studentAccess: { mode: "OWN", ownStudentId },
  };
}

function assertDraftVisibilityResult(result) {
  rejectLeakedFields(result, "input.draftVisibilityResult");
  assertPlainObject(result, "input.draftVisibilityResult");
  requireConst(result.schemaVersion, visibilitySchemaVersion, "input.draftVisibilityResult.schemaVersion");
  requireConst(result.runtimeId, visibilityRuntimeId, "input.draftVisibilityResult.runtimeId");
  requireConst(result.readPort, visibilityReadPort, "input.draftVisibilityResult.readPort");
  requireConst(result.status, visibilityStatus, "input.draftVisibilityResult.status");
  assertVisibilitySource(result.source);
  assertVisibilityBoundary(result.boundary);
  assertPlainObject(result.draftVisibilityPage, "input.draftVisibilityResult.draftVisibilityPage");
  if (!Array.isArray(result.draftVisibilityPage.items)) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_VISIBILITY_ITEMS", "draftVisibilityPage.items must be an array");
  }
  const items = result.draftVisibilityPage.items.map((item, index) => assertVisibleDraftItem(item, `input.draftVisibilityResult.draftVisibilityPage.items[${index}]`));
  return { ...result, draftVisibilityPage: { ...result.draftVisibilityPage, items } };
}

function assertVisibilitySource(source) {
  assertPlainObject(source, "input.draftVisibilityResult.source");
  requireConst(source.targetUseCase, "ListStudentAppQuestionBankDrafts.Execute", "input.draftVisibilityResult.source.targetUseCase");
  requireConst(source.repositoryOperation, "ArchiveRepository.ListTutoringAnalysisRequests", "input.draftVisibilityResult.source.repositoryOperation");
  requireConst(source.openApiOperation, "listStudentAppQuestionBankDrafts", "input.draftVisibilityResult.source.openApiOperation");
  requireConst(source.sourceStatusRequired, "SUCCEEDED", "input.draftVisibilityResult.source.sourceStatusRequired");
  requireConst(source.sourceOwnerTypeRequired, "STUDENT", "input.draftVisibilityResult.source.sourceOwnerTypeRequired");
  requireConst(source.ownStudentOnly, true, "input.draftVisibilityResult.source.ownStudentOnly");
  requireConst(source.questionBankDraftRefRequired, true, "input.draftVisibilityResult.source.questionBankDraftRefRequired");
}

function assertVisibilityBoundary(boundary) {
  assertPlainObject(boundary, "input.draftVisibilityResult.boundary");
  for (const field of ["ownStudentOnly", "succeededAnalysisOnly", "questionBankDraftRefRequired"]) {
    requireConst(boundary[field], true, `input.draftVisibilityResult.boundary.${field}`);
  }
  for (const field of [
    "draftContentRead",
    "questionGenerationStarted",
    "studentAnsweringStarted",
    "scoringStarted",
    "studentVisiblePublished",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(boundary[field], false, `input.draftVisibilityResult.boundary.${field}`);
  }
}

function assertVisibleDraftItem(item, label) {
  assertPlainObject(item, label);
  return {
    tutoringAnalysisRequestId: requireTutorRequestId(item.tutoringAnalysisRequestId, `${label}.tutoringAnalysisRequestId`),
    archiveItemId: requireArchiveItemId(item.archiveItemId, `${label}.archiveItemId`),
    sourceArchiveMaterial: optionalBoundedString(item.sourceArchiveMaterial, `${label}.sourceArchiveMaterial`, 128),
    resultSummary: requireBoundedString(item.resultSummary, `${label}.resultSummary`, 1, 2000),
    resultRef: requireBoundedString(item.resultRef, `${label}.resultRef`, 1, 1000),
    questionBankDraftRef: requireQuestionBankDraftRef(item.questionBankDraftRef, `${label}.questionBankDraftRef`),
    createdAt: requireString(item.createdAt, `${label}.createdAt`),
    completedAt: requireString(item.completedAt, `${label}.completedAt`),
  };
}

function assertSelectedDraft(selectedDraft, draftVisibilityResult) {
  rejectLeakedFields(selectedDraft, "input.selectedDraft");
  assertPlainObject(selectedDraft, "input.selectedDraft");
  const normalized = {
    tutoringAnalysisRequestId: requireTutorRequestId(selectedDraft.tutoringAnalysisRequestId, "input.selectedDraft.tutoringAnalysisRequestId"),
    archiveItemId: requireArchiveItemId(selectedDraft.archiveItemId, "input.selectedDraft.archiveItemId"),
    resultRef: requireBoundedString(selectedDraft.resultRef, "input.selectedDraft.resultRef", 1, 1000),
    questionBankDraftRef: requireQuestionBankDraftRef(selectedDraft.questionBankDraftRef, "input.selectedDraft.questionBankDraftRef"),
  };
  const visible = draftVisibilityResult.draftVisibilityPage.items.some((item) =>
    item.tutoringAnalysisRequestId === normalized.tutoringAnalysisRequestId &&
    item.archiveItemId === normalized.archiveItemId &&
    item.resultRef === normalized.resultRef &&
    item.questionBankDraftRef === normalized.questionBankDraftRef,
  );
  if (!visible) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_NOT_VISIBLE", "selectedDraft must come from the verified visibility page");
  }
  return normalized;
}

function assertContentPrecheckPolicy(policy) {
  assertPlainObject(policy, "input.contentPrecheckPolicy");
  requireConst(policy.sourceVisibilityRuntime, visibilityRuntimeId, "input.contentPrecheckPolicy.sourceVisibilityRuntime");
  requireConst(policy.sourceVisibilityStatus, visibilityStatus, "input.contentPrecheckPolicy.sourceVisibilityStatus");
  requireConst(policy.sourceVisibilityReadPort, visibilityReadPort, "input.contentPrecheckPolicy.sourceVisibilityReadPort");
  requireConst(policy.contentPrecheckOnly, true, "input.contentPrecheckPolicy.contentPrecheckOnly");
  requireConst(policy.contentStoreRequiredBeforeRead, true, "input.contentPrecheckPolicy.contentStoreRequiredBeforeRead");
  requireConst(policy.authoritativeContentStoreAvailable, false, "input.contentPrecheckPolicy.authoritativeContentStoreAvailable");
  requireConst(policy.futureContentUseCase, "ReadStudentAppQuestionBankDraftContent.Execute", "input.contentPrecheckPolicy.futureContentUseCase");
  requireConst(policy.futureContentRepository, "QuestionBankDraftContentRepository.GetOwnDraftContent", "input.contentPrecheckPolicy.futureContentRepository");
  requireConst(policy.ownStudentOnly, true, "input.contentPrecheckPolicy.ownStudentOnly");
  for (const field of [
    "draftContentReadAllowed",
    "questionGenerationAllowed",
    "studentAnsweringAllowed",
    "scoringAllowed",
    "studentVisiblePublishAllowed",
    "modelInferenceAllowed",
    "vectorSearchAllowed",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.contentPrecheckPolicy.${field}`);
  }
  return { ...policy };
}

function buildPrecheckRecord(normalized, checkedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK",
    recordId: `student_app_ai_tutor_question_bank_draft_content_precheck_${safeToken(normalized.idempotencyKey)}`,
    checkedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_COMMAND_PORT,
    status: blockedStatus,
    precheckInvocationId: normalized.precheckInvocationId,
    principal: normalized.principal,
    selectedDraft: normalized.selectedDraft,
    precheckDecision: {
      contentAccessDecision: "BLOCK_UNTIL_CONTENT_STORE",
      contentStoreAvailable: false,
      contentReadAllowed: false,
      requiresFutureContentStore: true,
      requiresFutureReadUseCase: true,
      reason: "No authoritative question-bank draft content store exists in the current baseline.",
    },
    boundary: {
      ownStudentOnly: true,
      visibilityEvidenceVerified: true,
      contentPrecheckOnly: true,
      contentStoreAvailable: false,
      draftContentReadStarted: false,
      questionGenerationStarted: false,
      studentAnsweringStarted: false,
      scoringStarted: false,
      studentVisiblePublished: false,
      modelInferenceStarted: false,
      vectorSearchStarted: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: uniq([
      ...normalized.evidenceRefs,
      `evidence:student-app-ai-tutor-question-bank-draft-content-precheck-input-hash:${normalized.inputHash}`,
      `evidence:runtime:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_RUNTIME_ID}`,
      `evidence:source-runtime:${visibilityRuntimeId}`,
    ]),
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: 6,
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_PROBE",
    },
  };
}

function buildResult(record, options) {
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: record.runtimeId,
    commandPort: record.commandPort,
    status: record.status,
    selectedDraft: record.selectedDraft,
    precheckDecision: record.precheckDecision,
    boundary: record.boundary,
    evidenceRefs: record.evidenceRefs,
    runtimeSlo: record.runtimeSlo,
    idempotentReplay: options.idempotentReplay === true,
    nextAction: "Add a real question-bank draft content store, own-student read use case, and reviewed publication/answering/scoring slices before any draft content can be returned.",
  };
}

function rejectLeakedFields(value, label) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectLeakedFields(item, `${label}[${index}]`));
    return;
  }
  for (const [field, child] of Object.entries(value)) {
    if ([
      "studentId",
      "sourceArchiveStudentId",
      "ownerStudentId",
      "claimedByWorkerId",
      "claimExpiresAt",
      "draftContent",
      "questions",
      "answers",
      "answerKey",
      "studentAnswer",
      "score",
      "publishedAt",
      "generatedQuestion",
      "questionItems",
    ].includes(field)) {
      throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_LEAKED_FIELD", `${label}.${field} is not allowed`);
    }
    rejectLeakedFields(child, `${label}.${field}`);
  }
}

function findExistingRecordByIdempotencyKey(logPath, idempotencyKey) {
  if (!fs.existsSync(logPath)) return null;
  const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const record = JSON.parse(line);
    if (record.recordType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK" &&
      record.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.inputHash !== normalized.inputHash) {
    throw precheckError(
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_IDEMPOTENCY_CONFLICT",
      "idempotency key already exists for a different question-bank draft content precheck",
    );
  }
}

function appendRecord(logPath, record) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`);
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function uniq(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))];
}

function uniqueStringArray(value, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_INVALID_ARRAY", `${label} must contain ${min}-${max} items`);
  }
  const normalized = uniq(value.map((item) => requireString(item, `${label}[]`)));
  if (normalized.length < min) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_INVALID_ARRAY", `${label} must contain unique items`);
  }
  return normalized;
}

function requireArchiveItemId(value, label) {
  const text = requireString(value, label);
  if (!text.startsWith("tarch_")) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_ARCHIVE_ITEM_ID", `${label} must use tarch_ prefix`);
  }
  return text;
}

function requireTutorRequestId(value, label) {
  const text = requireString(value, label);
  if (!text.startsWith("tutor_req_")) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_REQUEST_ID", `${label} must use tutor_req_ prefix`);
  }
  return text;
}

function requireQuestionBankDraftRef(value, label) {
  const text = requireBoundedString(value, label, 1, 1000);
  if (!text.startsWith("local://question-bank-drafts/")) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_DRAFT_REF", `${label} must use local://question-bank-drafts/ prefix`);
  }
  return text;
}

function optionalBoundedString(value, label, max) {
  if (value === undefined || value === null || String(value).trim().length === 0) return "";
  return requireBoundedString(String(value), label, 1, max);
}

function requireBoundedString(value, label, min, max) {
  const text = requireString(value, label);
  if (text.length < min || text.length > max) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_INVALID_TEXT", `${label} must be ${min}-${max} characters`);
  }
  return text;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_REQUIRED", `${label} is required`);
  }
  return value.trim();
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_CONST", `${label} must be ${expected}`);
  }
  return actual;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_OBJECT", `${label} must be an object`);
  }
}

function safeToken(value) {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function precheckError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
