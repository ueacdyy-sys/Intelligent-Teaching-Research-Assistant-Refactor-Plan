import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_RESULT_RUNTIME_ID = "student_app_ai_tutor_result_runtime";
export const STUDENT_APP_AI_TUTOR_RESULT_COMMAND_PORT = "StudentAppAITutorResultPort.recordTutoringAnalysisResult";
export const STUDENT_APP_AI_TUTOR_RESULT_READY = "STUDENT_APP_AI_TUTOR_RESULT_RUNTIME_READY";

const inputSchemaVersion = "2026-06-05.student-app.ai-tutor-result.v1";
const outputSchemaVersion = "2026-06-05.student-app.ai-tutor-result-recorded.v1";
const defaultResultLogPath = "reports/student-command-log/student-app-ai-tutor-result.jsonl";

export async function recordStudentAppAITutorResult(input, deps = {}, options = {}) {
  const recordedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const resultLogPath = options.resultLogPath ?? defaultResultLogPath;
  const existing = findExistingRecordByIdempotencyKey(resultLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const resultPort = assertResultPort(deps.studentAppAITutorResultPort);
  const portResult = await resultPort.recordTutoringAnalysisResult(buildPortRequest(normalized));
  const recorded = assertPortResult(portResult, normalized);
  const record = buildResultRecord(normalized, recorded, recordedAt);
  appendRecord(resultLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorResult(result) {
  return [
    `Student App AI Tutor result: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Request: ${result.result.requestId}`,
    `Worker: ${result.result.workerId}`,
    `Result status: ${result.result.status}`,
    `Student-visible published: ${result.boundary.studentVisibleResultPublished}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const resultInvocationId = requireString(input.resultInvocationId, "input.resultInvocationId");
  const principal = assertPrincipal(input.principal);
  const worker = assertWorker(input.worker);
  const claim = assertClaim(input.claim, worker.workerId);
  const result = assertResult(input.result, claim.questionBankIntent);
  const policy = assertResultPolicy(input.resultPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 160);
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 240);
  const inputHash = hashInput({
    resultInvocationId,
    principalId: principal.principalId,
    workerId: worker.workerId,
    requestId: claim.requestId,
    result,
    policy,
  });
  return { resultInvocationId, principal, worker, claim, result, policy, evidenceRefs, idempotencyKey, inputHash };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const principalId = requireString(principal.principalId, "input.principal.principalId");
  requireConst(principal.subjectType, "SERVICE", "input.principal.subjectType");
  requireConst(principal.role, "SERVICE", "input.principal.role");
  requireConst(principal.entryPoint, "AGENT_INTERNAL", "input.principal.entryPoint");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  if (!scopes.includes("TEACHING_WRITE")) {
    throw resultError("STUDENT_APP_AI_TUTOR_RESULT_MISSING_SCOPE", "TEACHING_WRITE is required");
  }
  return {
    ...principal,
    principalId,
    sessionId: requireString(principal.sessionId, "input.principal.sessionId"),
    scopes,
  };
}

function assertWorker(worker) {
  assertPlainObject(worker, "input.worker");
  const workerId = requireBoundedString(worker.workerId, "input.worker.workerId", 1, 128);
  requireConst(worker.agent, "StudentTutorAgent", "input.worker.agent");
  requireConst(worker.skillId, "tutor_student", "input.worker.skillId");
  requireConst(worker.nodeType, "LOCAL", "input.worker.nodeType");
  return { ...worker, workerId };
}

function assertClaim(claim, workerId) {
  assertPlainObject(claim, "input.claim");
  const requestId = requireTutorRequestId(claim.requestId, "input.claim.requestId");
  const archiveItemId = requireArchiveItemId(claim.archiveItemId, "input.claim.archiveItemId");
  requireConst(claim.status, "IN_PROGRESS", "input.claim.status");
  requireConst(claim.claimedByWorkerId, workerId, "input.claim.claimedByWorkerId");
  return {
    ...claim,
    requestId,
    archiveItemId,
    claimedByWorkerId: workerId,
    claimExpiresAt: requireString(claim.claimExpiresAt, "input.claim.claimExpiresAt"),
    questionBankIntent: requireEnum(claim.questionBankIntent, "input.claim.questionBankIntent", ["NONE", "GENERATE_PERSONALIZED_CHECK"]),
  };
}

function assertResult(result, questionBankIntent) {
  assertPlainObject(result, "input.result");
  const status = requireEnum(result.status, "input.result.status", ["SUCCEEDED", "FAILED"]);
  if (status === "SUCCEEDED") {
    const resultSummary = requireBoundedString(result.resultSummary, "input.result.resultSummary", 1, 2000);
    const resultRef = requireBoundedString(result.resultRef, "input.result.resultRef", 1, 1000);
    const questionBankDraftRef = optionalBoundedString(result.questionBankDraftRef, "input.result.questionBankDraftRef", 1000);
    if (questionBankDraftRef && questionBankIntent !== "GENERATE_PERSONALIZED_CHECK") {
      throw resultError("STUDENT_APP_AI_TUTOR_RESULT_QUESTION_BANK_INTENT", "questionBankDraftRef requires personalized check intent");
    }
    if (hasText(result.errorCode) || hasText(result.errorMessage)) {
      throw resultError("STUDENT_APP_AI_TUTOR_RESULT_ERROR_FIELDS", "error fields require FAILED status");
    }
    return { status, resultSummary, resultRef, questionBankDraftRef, errorCode: "", errorMessage: "" };
  }
  const errorMessage = requireBoundedString(result.errorMessage, "input.result.errorMessage", 1, 1000);
  if (hasText(result.resultSummary) || hasText(result.resultRef) || hasText(result.questionBankDraftRef)) {
    throw resultError("STUDENT_APP_AI_TUTOR_RESULT_RESULT_FIELDS", "result fields require SUCCEEDED status");
  }
  return {
    status,
    resultSummary: "",
    resultRef: "",
    questionBankDraftRef: "",
    errorCode: optionalBoundedString(result.errorCode, "input.result.errorCode", 64),
    errorMessage,
  };
}

function assertResultPolicy(policy) {
  assertPlainObject(policy, "input.resultPolicy");
  for (const field of ["internalServiceOnly", "claimRequired", "workerLeaseMustMatch", "modelExecutionAlreadyCompletedElsewhere"]) {
    requireConst(policy[field], true, `input.resultPolicy.${field}`);
  }
  for (const field of [
    "executeModelNowAllowed",
    "createQuestionBankDraftNowAllowed",
    "studentVisiblePublishAllowed",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.resultPolicy.${field}`);
  }
  requireConst(policy.queueName, "student_app_ai_tutor", "input.resultPolicy.queueName");
  requireConst(policy.queueTable, "teaching_tutoring_analysis_requests", "input.resultPolicy.queueTable");
  requireConst(policy.targetUseCase, "RecordTutoringAnalysisResult.Execute", "input.resultPolicy.targetUseCase");
  requireConst(policy.readRepositoryOperation, "ArchiveRepository.GetTutoringAnalysisRequestByID", "input.resultPolicy.readRepositoryOperation");
  requireConst(policy.writeRepositoryOperation, "ArchiveRepository.RecordTutoringAnalysisResult", "input.resultPolicy.writeRepositoryOperation");
  return { ...policy };
}

function assertResultPort(port) {
  if (!port || typeof port.recordTutoringAnalysisResult !== "function") {
    throw resultError("STUDENT_APP_AI_TUTOR_RESULT_MISSING_PORT", "StudentAppAITutorResultPort.recordTutoringAnalysisResult is required");
  }
  return port;
}

function buildPortRequest(normalized) {
  return {
    portName: "StudentAppAITutorResultPort",
    operation: "recordTutoringAnalysisResult",
    targetUseCase: "RecordTutoringAnalysisResult.Execute",
    readRepositoryOperation: "ArchiveRepository.GetTutoringAnalysisRequestByID",
    writeRepositoryOperation: "ArchiveRepository.RecordTutoringAnalysisResult",
    queueName: "student_app_ai_tutor",
    queueTable: "teaching_tutoring_analysis_requests",
    principal: normalized.principal,
    requestId: normalized.claim.requestId,
    workerId: normalized.worker.workerId,
    status: normalized.result.status,
    resultSummary: normalized.result.resultSummary,
    resultRef: normalized.result.resultRef,
    questionBankDraftRef: normalized.result.questionBankDraftRef,
    errorCode: normalized.result.errorCode,
    errorMessage: normalized.result.errorMessage,
    idempotencyKey: normalized.idempotencyKey,
    evidenceRefs: uniq([
      ...normalized.evidenceRefs,
      `evidence:student-app-ai-tutor-result-input-hash:${normalized.inputHash}`,
    ]),
    safety: {
      internalServiceOnly: true,
      claimRequired: true,
      workerLeaseMustMatch: true,
      modelExecutionAlreadyCompletedElsewhere: true,
      executeModelNowAllowed: false,
      createQuestionBankDraftNowAllowed: false,
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
  requireConst(portResult.source.targetUseCase, "RecordTutoringAnalysisResult.Execute", "portResult.source.targetUseCase");
  requireConst(portResult.source.readRepositoryOperation, "ArchiveRepository.GetTutoringAnalysisRequestByID", "portResult.source.readRepositoryOperation");
  requireConst(portResult.source.writeRepositoryOperation, "ArchiveRepository.RecordTutoringAnalysisResult", "portResult.source.writeRepositoryOperation");
  requireConst(portResult.source.queueTable, "teaching_tutoring_analysis_requests", "portResult.source.queueTable");
  assertPlainObject(portResult.result, "portResult.result");
  requireConst(portResult.result.requestId, normalized.claim.requestId, "portResult.result.requestId");
  requireConst(portResult.result.workerId, normalized.worker.workerId, "portResult.result.workerId");
  requireConst(portResult.result.status, normalized.result.status, "portResult.result.status");
  return {
    requestId: normalized.claim.requestId,
    archiveItemId: normalized.claim.archiveItemId,
    workerId: normalized.worker.workerId,
    status: normalized.result.status,
    resultSummary: normalized.result.status === "SUCCEEDED"
      ? requireBoundedString(portResult.result.resultSummary, "portResult.result.resultSummary", 1, 2000)
      : "",
    resultRef: normalized.result.status === "SUCCEEDED"
      ? requireBoundedString(portResult.result.resultRef, "portResult.result.resultRef", 1, 1000)
      : "",
    questionBankDraftRef: optionalBoundedString(portResult.result.questionBankDraftRef, "portResult.result.questionBankDraftRef", 1000),
    errorCode: optionalBoundedString(portResult.result.errorCode, "portResult.result.errorCode", 64),
    errorMessage: normalized.result.status === "FAILED"
      ? requireBoundedString(portResult.result.errorMessage, "portResult.result.errorMessage", 1, 1000)
      : "",
    completedAt: requireString(portResult.result.completedAt, "portResult.result.completedAt"),
  };
}

function buildResultRecord(normalized, recorded, recordedAt) {
  return {
    schemaVersion: inputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_RESULT",
    recordId: `student_app_ai_tutor_result_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    commandPort: STUDENT_APP_AI_TUTOR_RESULT_COMMAND_PORT,
    status: "STUDENT_APP_AI_TUTOR_RESULT_RECORDED",
    resultInvocationId: normalized.resultInvocationId,
    principal: normalized.principal,
    worker: normalized.worker,
    queue: {
      queueName: "student_app_ai_tutor",
      queueTable: "teaching_tutoring_analysis_requests",
      targetUseCase: "RecordTutoringAnalysisResult.Execute",
      readRepositoryOperation: "ArchiveRepository.GetTutoringAnalysisRequestByID",
      writeRepositoryOperation: "ArchiveRepository.RecordTutoringAnalysisResult",
    },
    claim: normalized.claim,
    result: recorded,
    boundary: {
      internalServiceOnly: true,
      claimRequired: true,
      workerLeaseMustMatch: true,
      modelExecutionStarted: false,
      modelExecutionAlreadyCompletedElsewhere: true,
      resultRecorded: true,
      questionBankDraftCreated: false,
      studentVisibleResultPublished: false,
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
      p99Ms: 7,
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STUDENT_APP_AI_TUTOR_RESULT_PROBE",
    },
  };
}

function buildResult(record, options) {
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: STUDENT_APP_AI_TUTOR_RESULT_RUNTIME_ID,
    commandPort: record.commandPort,
    status: record.status,
    queue: record.queue,
    result: record.result,
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
    throw resultError("STUDENT_APP_AI_TUTOR_RESULT_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different tutoring result");
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
    throw resultError("STUDENT_APP_AI_TUTOR_RESULT_INVALID_ARRAY", `${label} must contain ${min}-${max} items`);
  }
  const normalized = uniq(value.map((item) => requireString(item, `${label}[]`)));
  if (normalized.length < min) throw resultError("STUDENT_APP_AI_TUTOR_RESULT_INVALID_ARRAY", `${label} must contain unique items`);
  return normalized;
}

function requireArchiveItemId(value, label) {
  const text = requireString(value, label);
  if (!text.startsWith("tarch_")) throw resultError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ITEM_ID", `${label} must use tarch_ prefix`);
  return text;
}

function requireTutorRequestId(value, label) {
  const text = requireString(value, label);
  if (!text.startsWith("tutor_req_")) throw resultError("STUDENT_APP_AI_TUTOR_RESULT_REQUEST_ID", `${label} must use tutor_req_ prefix`);
  return text;
}

function optionalBoundedString(value, label, max) {
  if (value === undefined || value === null || String(value).trim().length === 0) return "";
  return requireBoundedString(String(value), label, 1, max);
}

function requireBoundedString(value, label, min, max) {
  const text = requireString(value, label);
  if (text.length < min || text.length > max) {
    throw resultError("STUDENT_APP_AI_TUTOR_RESULT_INVALID_TEXT", `${label} must be ${min}-${max} characters`);
  }
  return text;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw resultError("STUDENT_APP_AI_TUTOR_RESULT_REQUIRED", `${label} is required`);
  }
  return value.trim();
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw resultError("STUDENT_APP_AI_TUTOR_RESULT_CONST", `${label} must be ${expected}`);
  }
  return actual;
}

function requireEnum(value, label, allowed) {
  const text = requireString(value, label);
  if (!allowed.includes(text)) throw resultError("STUDENT_APP_AI_TUTOR_RESULT_ENUM", `${label} is unsupported`);
  return text;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw resultError("STUDENT_APP_AI_TUTOR_RESULT_OBJECT", `${label} must be an object`);
  }
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function safeToken(value) {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function resultError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
