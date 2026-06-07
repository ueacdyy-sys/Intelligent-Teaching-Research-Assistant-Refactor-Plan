import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_visibility_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_READ_PORT =
  "StudentAppAITutorQuestionBankDraftVisibilityPort.listStudentAppQuestionBankDrafts";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_READY =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_READY";

const inputSchemaVersion = "2026-06-05.student-app.ai-tutor-question-bank-draft-visibility.v1";
const outputSchemaVersion = "2026-06-05.student-app.ai-tutor-question-bank-draft-visibility-listed.v1";
const defaultVisibilityLogPath = "reports/student-command-log/student-app-ai-tutor-question-bank-draft-visibility.jsonl";

export async function listStudentAppAITutorQuestionBankDraftVisibility(input, deps = {}, options = {}) {
  const listedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const visibilityLogPath = options.visibilityLogPath ?? defaultVisibilityLogPath;
  const existing = findExistingRecordByIdempotencyKey(visibilityLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const visibilityPort = assertVisibilityPort(deps.studentAppAITutorQuestionBankDraftVisibilityPort);
  const portResult = await visibilityPort.listStudentAppQuestionBankDrafts(buildPortRequest(normalized));
  const page = assertPortResult(portResult, normalized);
  const record = buildVisibilityRecord(normalized, page, listedAt);
  appendRecord(visibilityLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftVisibility(result) {
  return [
    `Student App AI Tutor question-bank draft visibility: ${result.status}`,
    `Read port: ${result.readPort}`,
    `Items: ${result.draftVisibilityPage.items.length}`,
    `Own student only: ${result.boundary.ownStudentOnly}`,
    `Draft content read: ${result.boundary.draftContentRead}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const visibilityInvocationId = requireString(input.visibilityInvocationId, "input.visibilityInvocationId");
  const principal = assertPrincipal(input.principal);
  const query = assertQuery(input.query);
  const policy = assertVisibilityPolicy(input.visibilityPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 160);
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 240);
  const inputHash = hashInput({
    visibilityInvocationId,
    principalId: principal.principalId,
    ownStudentId: principal.studentAccess.ownStudentId,
    query,
    policy,
  });
  return { visibilityInvocationId, principal, query, policy, evidenceRefs, idempotencyKey, inputHash };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const principalId = requireString(principal.principalId, "input.principal.principalId");
  requireConst(principal.subjectType, "USER", "input.principal.subjectType");
  requireConst(principal.role, "STUDENT", "input.principal.role");
  requireConst(principal.entryPoint, "STUDENT_APP", "input.principal.entryPoint");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  if (!scopes.includes("STUDENT_OWN_READ")) {
    throw visibilityError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_MISSING_SCOPE", "STUDENT_OWN_READ is required");
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

function assertQuery(query) {
  assertPlainObject(query, "input.query");
  const pageSize = requireInteger(query.pageSize, "input.query.pageSize", 1, 100);
  const cursor = optionalBoundedString(query.cursor, "input.query.cursor", 2000);
  return { pageSize, cursor };
}

function assertVisibilityPolicy(policy) {
  assertPlainObject(policy, "input.visibilityPolicy");
  requireConst(policy.targetUseCase, "ListStudentAppQuestionBankDrafts.Execute", "input.visibilityPolicy.targetUseCase");
  requireConst(policy.repositoryOperation, "ArchiveRepository.ListTutoringAnalysisRequests", "input.visibilityPolicy.repositoryOperation");
  requireConst(policy.openApiOperation, "listStudentAppQuestionBankDrafts", "input.visibilityPolicy.openApiOperation");
  requireConst(policy.sourceStatusRequired, "SUCCEEDED", "input.visibilityPolicy.sourceStatusRequired");
  requireConst(policy.sourceOwnerTypeRequired, "STUDENT", "input.visibilityPolicy.sourceOwnerTypeRequired");
  requireConst(policy.ownStudentOnly, true, "input.visibilityPolicy.ownStudentOnly");
  requireConst(policy.questionBankDraftRefRequired, true, "input.visibilityPolicy.questionBankDraftRefRequired");
  for (const field of [
    "draftContentReadAllowed",
    "questionGenerationAllowed",
    "studentAnsweringAllowed",
    "scoringAllowed",
    "studentVisiblePublishAllowed",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.visibilityPolicy.${field}`);
  }
  return { ...policy };
}

function assertVisibilityPort(port) {
  if (!port || typeof port.listStudentAppQuestionBankDrafts !== "function") {
    throw visibilityError(
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_MISSING_PORT",
      "StudentAppAITutorQuestionBankDraftVisibilityPort.listStudentAppQuestionBankDrafts is required",
    );
  }
  return port;
}

function buildPortRequest(normalized) {
  return {
    portName: "StudentAppAITutorQuestionBankDraftVisibilityPort",
    operation: "listStudentAppQuestionBankDrafts",
    targetUseCase: "ListStudentAppQuestionBankDrafts.Execute",
    repositoryOperation: "ArchiveRepository.ListTutoringAnalysisRequests",
    openApiOperation: "listStudentAppQuestionBankDrafts",
    principal: normalized.principal,
    query: normalized.query,
    filters: {
      status: "SUCCEEDED",
      sourceArchiveOwnerType: "STUDENT",
      ownStudentId: normalized.principal.studentAccess.ownStudentId,
      requireQuestionBankDraftRef: true,
    },
    evidenceRefs: uniq([
      ...normalized.evidenceRefs,
      `evidence:student-app-ai-tutor-question-bank-draft-visibility-input-hash:${normalized.inputHash}`,
    ]),
    safety: {
      ownStudentOnly: true,
      succeededAnalysisOnly: true,
      questionBankDraftRefRequired: true,
      draftContentReadAllowed: false,
      questionGenerationAllowed: false,
      studentAnsweringAllowed: false,
      scoringAllowed: false,
      studentVisiblePublishAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
  };
}

function assertPortResult(portResult, normalized) {
  assertPlainObject(portResult, "portResult");
  assertPlainObject(portResult.source, "portResult.source");
  requireConst(portResult.source.targetUseCase, "ListStudentAppQuestionBankDrafts.Execute", "portResult.source.targetUseCase");
  requireConst(portResult.source.repositoryOperation, "ArchiveRepository.ListTutoringAnalysisRequests", "portResult.source.repositoryOperation");
  requireConst(portResult.source.openApiOperation, "listStudentAppQuestionBankDrafts", "portResult.source.openApiOperation");
  requireConst(portResult.source.sourceStatusRequired, "SUCCEEDED", "portResult.source.sourceStatusRequired");
  requireConst(portResult.source.sourceOwnerTypeRequired, "STUDENT", "portResult.source.sourceOwnerTypeRequired");
  requireConst(portResult.source.ownStudentOnly, true, "portResult.source.ownStudentOnly");
  requireConst(portResult.source.questionBankDraftRefRequired, true, "portResult.source.questionBankDraftRefRequired");
  assertPlainObject(portResult.page, "portResult.page");
  const pageInfo = assertPageInfo(portResult.page.pageInfo, normalized.query.pageSize);
  const items = assertItems(portResult.page.items);
  return { items, pageInfo };
}

function assertItems(items) {
  if (!Array.isArray(items)) {
    throw visibilityError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_ITEMS", "portResult.page.items must be an array");
  }
  return items.map((item, index) => {
    assertPlainObject(item, `portResult.page.items[${index}]`);
    rejectLeakedFields(item, `portResult.page.items[${index}]`);
    return {
      tutoringAnalysisRequestId: requireTutorRequestId(item.tutoringAnalysisRequestId, `portResult.page.items[${index}].tutoringAnalysisRequestId`),
      archiveItemId: requireArchiveItemId(item.archiveItemId, `portResult.page.items[${index}].archiveItemId`),
      sourceArchiveMaterial: optionalBoundedString(item.sourceArchiveMaterial, `portResult.page.items[${index}].sourceArchiveMaterial`, 128),
      resultSummary: requireBoundedString(item.resultSummary, `portResult.page.items[${index}].resultSummary`, 1, 2000),
      resultRef: requireBoundedString(item.resultRef, `portResult.page.items[${index}].resultRef`, 1, 1000),
      questionBankDraftRef: requireBoundedString(item.questionBankDraftRef, `portResult.page.items[${index}].questionBankDraftRef`, 1, 1000),
      createdAt: requireString(item.createdAt, `portResult.page.items[${index}].createdAt`),
      completedAt: requireString(item.completedAt, `portResult.page.items[${index}].completedAt`),
    };
  });
}

function rejectLeakedFields(item, label) {
  for (const field of [
    "studentId",
    "sourceArchiveStudentId",
    "ownerStudentId",
    "claimedByWorkerId",
    "claimExpiresAt",
    "draftContent",
    "questions",
    "answers",
    "score",
    "publishedAt",
  ]) {
    if (Object.hasOwn(item, field)) {
      throw visibilityError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_LEAKED_FIELD", `${label}.${field} is not allowed`);
    }
  }
}

function assertPageInfo(pageInfo, requestedPageSize) {
  assertPlainObject(pageInfo, "portResult.page.pageInfo");
  return {
    pageSize: requireConst(pageInfo.pageSize, requestedPageSize, "portResult.page.pageInfo.pageSize"),
    hasMore: requireBoolean(pageInfo.hasMore, "portResult.page.pageInfo.hasMore"),
    nextCursor: optionalBoundedString(pageInfo.nextCursor, "portResult.page.pageInfo.nextCursor", 2000),
  };
}

function buildVisibilityRecord(normalized, page, listedAt) {
  return {
    schemaVersion: inputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY",
    recordId: `student_app_ai_tutor_question_bank_draft_visibility_${safeToken(normalized.idempotencyKey)}`,
    listedAt,
    readPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_READ_PORT,
    status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_LISTED",
    visibilityInvocationId: normalized.visibilityInvocationId,
    principal: normalized.principal,
    query: normalized.query,
    source: {
      targetUseCase: "ListStudentAppQuestionBankDrafts.Execute",
      repositoryOperation: "ArchiveRepository.ListTutoringAnalysisRequests",
      openApiOperation: "listStudentAppQuestionBankDrafts",
      sourceStatusRequired: "SUCCEEDED",
      sourceOwnerTypeRequired: "STUDENT",
      ownStudentOnly: true,
      questionBankDraftRefRequired: true,
    },
    draftVisibilityPage: page,
    boundary: {
      ownStudentOnly: true,
      succeededAnalysisOnly: true,
      questionBankDraftRefRequired: true,
      draftContentRead: false,
      questionGenerationStarted: false,
      studentAnsweringStarted: false,
      scoringStarted: false,
      studentVisiblePublished: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: normalized.evidenceRefs,
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: 8,
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_PROBE",
    },
  };
}

function buildResult(record, options) {
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_RUNTIME_ID,
    readPort: record.readPort,
    status: record.status,
    source: record.source,
    draftVisibilityPage: record.draftVisibilityPage,
    boundary: record.boundary,
    evidenceRefs: record.evidenceRefs,
    runtimeSlo: record.runtimeSlo,
    idempotentReplay: options.idempotentReplay,
  };
}

function findExistingRecordByIdempotencyKey(logPath, idempotencyKey) {
  if (!fs.existsSync(logPath)) return null;
  const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const record = JSON.parse(line);
    if (record.idempotencyKey === idempotencyKey) return record;
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.inputHash !== normalized.inputHash) {
    throw visibilityError(
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_IDEMPOTENCY_CONFLICT",
      "idempotency key already exists for a different question-bank draft visibility request",
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
    throw visibilityError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_INVALID_ARRAY", `${label} must contain ${min}-${max} items`);
  }
  const normalized = uniq(value.map((item) => requireString(item, `${label}[]`)));
  if (normalized.length < min) {
    throw visibilityError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_INVALID_ARRAY", `${label} must contain unique items`);
  }
  return normalized;
}

function requireArchiveItemId(value, label) {
  const text = requireString(value, label);
  if (!text.startsWith("tarch_")) {
    throw visibilityError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_ARCHIVE_ITEM_ID", `${label} must use tarch_ prefix`);
  }
  return text;
}

function requireTutorRequestId(value, label) {
  const text = requireString(value, label);
  if (!text.startsWith("tutor_req_")) {
    throw visibilityError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_REQUEST_ID", `${label} must use tutor_req_ prefix`);
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
    throw visibilityError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_INVALID_TEXT", `${label} must be ${min}-${max} characters`);
  }
  return text;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw visibilityError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_REQUIRED", `${label} is required`);
  }
  return value.trim();
}

function requireInteger(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw visibilityError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_INTEGER", `${label} must be ${min}-${max}`);
  }
  return value;
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw visibilityError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_BOOLEAN", `${label} must be boolean`);
  }
  return value;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw visibilityError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_CONST", `${label} must be ${expected}`);
  }
  return actual;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw visibilityError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_OBJECT", `${label} must be an object`);
  }
}

function safeToken(value) {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function visibilityError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
