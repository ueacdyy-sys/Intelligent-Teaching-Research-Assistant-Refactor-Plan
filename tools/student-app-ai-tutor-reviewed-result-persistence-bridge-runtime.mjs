import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_RUNTIME_ID =
  "student_app_ai_tutor_reviewed_result_persistence_bridge_runtime";
export const STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_PORT =
  "StudentAppAITutorResultPort.recordTutoringAnalysisResult";

const inputSchemaVersion = "2026-06-08.student-app.ai-tutor-reviewed-result-persistence-bridge.v1";
const outputSchemaVersion = "2026-06-08.student-app.ai-tutor-reviewed-result-persistence-bridge-recorded.v1";
const sourceRuntimeId = "student_app_ai_tutor_answer_review_gate_runtime";
const sourceResultArchiveRuntimeId = "student_app_ai_tutor_result_archive_answer_review_gate";
const sourceQuestionBankFeedbackRuntimeId = "student_app_ai_tutor_question_bank_feedback_answer_review_gate";
const sourceCommandPort = "StudentAppAITutorAnswerReviewGatePort.recordAnswerReviewGate";
const sourceStatus = "STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_RECORDED";
const sourceResultArchiveStatus = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ANSWER_REVIEW_GATE_RECORDED";
const sourceQuestionBankFeedbackStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_ANSWER_REVIEW_GATE_RECORDED";
const sourceWorkloadType = "STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE";
const sourceResultArchiveWorkloadType = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ANSWER_REVIEW_GATE";
const sourceQuestionBankFeedbackWorkloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_ANSWER_REVIEW_GATE";
const persistedStatus = "STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTED";
const defaultPersistenceLogPath =
  "reports/student-command-log/student-app-ai-tutor-reviewed-result-persistence-bridge.jsonl";
const leakedFieldNames = new Set([
  "answerkey",
  "correctanswer",
  "expectedanswer",
  "contentref",
  "rawcontent",
  "rawmodeloutput",
  "modeloutput",
  "modelresponse",
  "prompt",
  "prompttext",
  "fullprompt",
  "ragchunks",
  "ocrchunks",
  "directsql",
  "dburl",
  "internalerror",
  "errormessage",
  "guidancetext",
  "sectiontext",
]);

export async function recordStudentAppAITutorReviewedResultPersistenceBridge(input, options = {}) {
  const recordedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const persistenceLogPath = options.persistenceLogPath ?? defaultPersistenceLogPath;
  const existing = findExistingRecordByIdempotencyKey(persistenceLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const port = assertResultPort(options.studentAppAITutorResultPort);
  const portRequest = buildPortRequest(normalized);
  const portResult = await port.recordTutoringAnalysisResult(portRequest);
  const persistedResult = assertPortResult(portResult, normalized, portRequest);
  const record = buildRecord(normalized, portRequest, persistedResult, recordedAt);
  appendRecord(persistenceLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorReviewedResultPersistenceBridge(result) {
  return [
    `Student App AI Tutor reviewed result persistence bridge: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Request: ${result.reviewedResult.requestId}`,
    `Review: ${result.reviewedResult.reviewId}`,
    `Student visible: ${result.boundary.studentVisiblePublished}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input?.principal, "input.principal");
  rejectLeakedFields(input?.resultPersistencePolicy, "input.resultPersistencePolicy");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const persistenceInvocationId = requireToken(input.persistenceInvocationId, "input.persistenceInvocationId", "ai_tutor_reviewed_result_persist_");
  const answerReviewGateReport = assertAnswerReviewGateReport(input.answerReviewGateReport);
  const answerReviewGate = assertAnswerReviewGateResult(answerReviewGateReport);
  const principal = assertPrincipal(input.principal);
  const policy = assertPersistencePolicy(input.resultPersistencePolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 20, 8, 360);
  for (const required of ["answer-review-gate", "reviewed-result-persistence"]) {
    if (!evidenceRefs.some((ref) => ref.includes(required))) {
      throw bridgeError("STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_MISSING_EVIDENCE", `${required} evidence ref is required`);
    }
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 420);
  const inputHash = hashInput({
    persistenceInvocationId,
    reviewId: answerReviewGate.reviewId,
    artifactId: answerReviewGate.artifactId,
    requestId: answerReviewGate.requestId,
    workerId: answerReviewGate.workerId,
    principalId: principal.principalId,
    guidanceSectionsHash: answerReviewGate.guidanceSectionsHash,
    policy,
  });
  return { persistenceInvocationId, answerReviewGateReport, answerReviewGate, principal, policy, evidenceRefs, idempotencyKey, inputHash };
}

function assertAnswerReviewGateReport(report) {
  assertPlainObject(report, "input.answerReviewGateReport");
  requireConst(report.readiness, "READY", "input.answerReviewGateReport.readiness");
  const isResultArchiveSource = report.workloadType === sourceResultArchiveWorkloadType;
  const isQuestionBankFeedbackSource = report.workloadType === sourceQuestionBankFeedbackWorkloadType;
  requireOneOf(report.workloadType, "input.answerReviewGateReport.workloadType", [sourceWorkloadType, sourceResultArchiveWorkloadType, sourceQuestionBankFeedbackWorkloadType]);
  if (isResultArchiveSource) {
    requireConst(report.runtime?.runtimeId, sourceResultArchiveRuntimeId, "input.answerReviewGateReport.runtime.runtimeId");
    requireConst(report.runtime?.sharedRuntimeId, sourceRuntimeId, "input.answerReviewGateReport.runtime.sharedRuntimeId");
    requireConst(report.runtime?.status, sourceResultArchiveStatus, "input.answerReviewGateReport.runtime.status");
  } else if (isQuestionBankFeedbackSource) {
    requireConst(report.runtime?.runtimeId, sourceQuestionBankFeedbackRuntimeId, "input.answerReviewGateReport.runtime.runtimeId");
    requireConst(report.runtime?.sharedRuntimeId, sourceRuntimeId, "input.answerReviewGateReport.runtime.sharedRuntimeId");
    requireConst(report.runtime?.status, sourceQuestionBankFeedbackStatus, "input.answerReviewGateReport.runtime.status");
  } else {
    requireConst(report.runtime?.runtimeId, sourceRuntimeId, "input.answerReviewGateReport.runtime.runtimeId");
    requireConst(report.runtime?.status, sourceStatus, "input.answerReviewGateReport.runtime.status");
  }
  requireConst(report.runtime?.commandPort, sourceCommandPort, "input.answerReviewGateReport.runtime.commandPort");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.answerReviewGateReport.runtimeSlo.totalErrors");
  const invariants = assertPlainObject(report.safetyInvariants, "input.answerReviewGateReport.safetyInvariants");
  const sourceRequiredFlag = isResultArchiveSource
    ? "source0338ResultArchiveControlledAnswerArtifactRequired"
    : isQuestionBankFeedbackSource
      ? "source0372QuestionBankFeedbackControlledAnswerArtifactRequired"
      : "controlledAnswerArtifactRequired";
  for (const field of [sourceRequiredFlag, "humanReviewCompleted", "answerReviewGateRecorded"]) {
    requireConst(invariants[field], true, `input.answerReviewGateReport.safetyInvariants.${field}`);
  }
  for (const field of ["guidanceTextSentToPort", "resultPersistenceStarted", "tutoringResultRecorded", "studentVisiblePublished", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "externalToolUseAllowed", "retrievalAllowed", "swarmAllowed"]) {
    requireConst(invariants[field], false, `input.answerReviewGateReport.safetyInvariants.${field}`);
  }
  if (isResultArchiveSource) requireConst(invariants.learningActionSourceRequired, "AI_TUTOR_RESULT_ARCHIVE", "input.answerReviewGateReport.safetyInvariants.learningActionSourceRequired");
  if (isQuestionBankFeedbackSource) requireConst(invariants.learningActionSourceRequired, "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK", "input.answerReviewGateReport.safetyInvariants.learningActionSourceRequired");
  return report;
}

function assertAnswerReviewGateResult(report) {
  const result = report.runtimeProbes?.studentAppAiTutorAnswerReviewGate?.result
    ?? report.runtimeProbes?.studentAppAiTutorResultArchiveAnswerReviewGate?.result
    ?? report.runtimeProbes?.studentAppAiTutorQuestionBankFeedbackAnswerReviewGate?.result;
  rejectLeakedFields(result?.answerReviewGate, "source.answerReviewGate");
  assertPlainObject(result, "source.answerReviewGate.result");
  requireConst(result.runtimeId, sourceRuntimeId, "source.result.runtimeId");
  requireConst(result.commandPort, sourceCommandPort, "source.result.commandPort");
  requireConst(result.status, sourceStatus, "source.result.status");
  requireConst(result.boundary?.answerReviewGateRecorded, true, "source.result.boundary.answerReviewGateRecorded");
  requireConst(result.boundary?.humanReviewCompleted, true, "source.result.boundary.humanReviewCompleted");
  requireConst(result.boundary?.resultPersistenceStarted, false, "source.result.boundary.resultPersistenceStarted");
  requireConst(result.boundary?.tutoringResultRecorded, false, "source.result.boundary.tutoringResultRecorded");
  requireConst(result.boundary?.studentVisiblePublished, false, "source.result.boundary.studentVisiblePublished");
  requireConst(result.boundary?.futureResultPersistenceRequiresSeparateRuntime, true, "source.result.boundary.futureResultPersistenceRequiresSeparateRuntime");
  const gate = assertPlainObject(result.answerReviewGate, "source.result.answerReviewGate");
  requireConst(gate.decision, "APPROVE_FOR_RESULT_PERSISTENCE", "source.answerReviewGate.decision");
  requireConst(gate.status, "AI_TUTOR_ANSWER_REVIEW_APPROVED_NOT_PERSISTED", "source.answerReviewGate.status");
  requireConst(gate.resultPersistenceStarted, false, "source.answerReviewGate.resultPersistenceStarted");
  requireConst(gate.tutoringResultRecorded, false, "source.answerReviewGate.tutoringResultRecorded");
  requireConst(gate.studentVisiblePublished, false, "source.answerReviewGate.studentVisiblePublished");
  const isResultArchiveSource = report.workloadType === sourceResultArchiveWorkloadType;
  const isQuestionBankFeedbackSource = report.workloadType === sourceQuestionBankFeedbackWorkloadType;
  const learningActionSource = isResultArchiveSource
    ? requireConst(result.learningActionSource, "AI_TUTOR_RESULT_ARCHIVE", "source.result.learningActionSource")
    : isQuestionBankFeedbackSource
      ? requireConst(result.learningActionSource, "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK", "source.result.learningActionSource")
      : undefined;
  const resultArchiveStatus = isResultArchiveSource ? requireConst(result.resultArchiveStatus, "READY_FOR_STUDENT_APP_READ", "source.result.resultArchiveStatus") : undefined;
  const feedbackStatus = isQuestionBankFeedbackSource ? requireConst(result.feedbackStatus, "READY_FOR_STUDENT_APP_READ", "source.result.feedbackStatus") : undefined;
  return {
    reviewId: requireToken(gate.reviewId, "source.answerReviewGate.reviewId", "ai_tutor_answer_review_gate_"),
    artifactId: requireToken(gate.artifactId, "source.answerReviewGate.artifactId", "ai_tutor_answer_artifact_"),
    requestId: requireToken(gate.requestId, "source.answerReviewGate.requestId", "tutor_req_"),
    archiveItemId: requireToken(result.archiveItemId, "source.result.archiveItemId", "tarch_"),
    workerId: requireBoundedString(gate.workerId, "source.answerReviewGate.workerId", 1, 128),
    precheckId: requireToken(gate.precheckId, "source.answerReviewGate.precheckId", "ai_tutor_model_precheck_"),
    queueRef: requireToken(gate.queueRef, "source.answerReviewGate.queueRef", "ai_tutor_model_queue_"),
    learningActionSource,
    resultArchiveStatus,
    feedbackStatus,
    reviewerPrincipalId: requireBoundedString(gate.reviewerPrincipalId, "source.answerReviewGate.reviewerPrincipalId", 1, 128),
    guidanceSectionsHash: requireHex(gate.guidanceSectionsHash, "source.answerReviewGate.guidanceSectionsHash"),
    guidanceSectionCount: requireIntegerBetween(result.sourceControlledAnswerArtifact?.guidanceSectionCount, "source.result.sourceControlledAnswerArtifact.guidanceSectionCount", 1, 5),
  };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 2, 24, 3, 80);
  for (const scope of ["TEACHING_WRITE", "AGENT_COMMAND_SUBMIT"]) {
    if (!scopes.includes(scope)) throw bridgeError("STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_SCOPE_MISSING", `input.principal.scopes must include ${scope}`);
  }
  return {
    principalId: requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128),
    subjectType: requireConst(principal.subjectType, "SERVICE", "input.principal.subjectType"),
    role: requireConst(principal.role, "SERVICE", "input.principal.role"),
    entryPoint: requireConst(principal.entryPoint, "AGENT_INTERNAL", "input.principal.entryPoint"),
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 160),
    scopes,
  };
}

function assertPersistencePolicy(policy) {
  assertPlainObject(policy, "input.resultPersistencePolicy");
  for (const field of ["answerReviewGateRequired", "approvedReviewRequired", "existingRecordTutoringAnalysisResultUseCaseRequired", "injectedResultPortRequired", "resultPersistenceAllowed", "idempotentPersistenceRequired"]) {
    requireConst(policy[field], true, `input.resultPersistencePolicy.${field}`);
  }
  for (const field of ["guidanceTextAllowed", "rawModelOutputAllowed", "promptAllowed", "answerKeyAllowed", "contentRefAllowed", "retrievalAllowed", "questionBankDraftCreationAllowed", "studentVisiblePublishAllowed", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "externalToolUseAllowed", "remoteDeviceControlAllowed", "localToolMutationAllowed", "swarmAllowed"]) {
    requireConst(policy[field], false, `input.resultPersistencePolicy.${field}`);
  }
  requireConst(policy.targetUseCase, "RecordTutoringAnalysisResult.Execute", "input.resultPersistencePolicy.targetUseCase");
  requireConst(policy.writeRepositoryOperation, "ArchiveRepository.RecordTutoringAnalysisResult", "input.resultPersistencePolicy.writeRepositoryOperation");
  return { ...policy };
}

function assertResultPort(port) {
  if (!port || typeof port.recordTutoringAnalysisResult !== "function") {
    throw bridgeError("STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_PORT_MISSING", "StudentAppAITutorResultPort.recordTutoringAnalysisResult is required");
  }
  return port;
}

function buildPortRequest(normalized) {
  const resultRef = `reviewed-ai-tutor-result://${normalized.answerReviewGate.reviewId}/${normalized.answerReviewGate.artifactId}`;
  return {
    portName: "StudentAppAITutorResultPort",
    operation: "recordTutoringAnalysisResult",
    targetUseCase: "RecordTutoringAnalysisResult.Execute",
    readRepositoryOperation: "ArchiveRepository.GetTutoringAnalysisRequestByID",
    writeRepositoryOperation: "ArchiveRepository.RecordTutoringAnalysisResult",
    queueName: "student_app_ai_tutor",
    queueTable: "teaching_tutoring_analysis_requests",
    principal: normalized.principal,
    requestId: normalized.answerReviewGate.requestId,
    archiveItemId: normalized.answerReviewGate.archiveItemId,
    workerId: normalized.answerReviewGate.workerId,
    learningActionSource: normalized.answerReviewGate.learningActionSource,
    resultArchiveStatus: normalized.answerReviewGate.resultArchiveStatus,
    feedbackStatus: normalized.answerReviewGate.feedbackStatus,
    status: "SUCCEEDED",
    resultSummary: `Human-reviewed AI Tutor guidance approved for internal persistence; sections=${normalized.answerReviewGate.guidanceSectionCount}.`,
    resultRef,
    questionBankDraftRef: "",
    errorCode: "",
    errorMessage: "",
    idempotencyKey: normalized.idempotencyKey,
    evidenceRefs: uniq([...normalized.evidenceRefs, `evidence:answer-review-gate-hash:${normalized.answerReviewGate.guidanceSectionsHash}`]),
    safety: {
      answerReviewGateRequired: true,
      approvedReviewRequired: true,
      guidanceTextSentToPort: false,
      resultPersistenceAllowed: true,
      tutoringResultRecorded: true,
      studentVisiblePublishAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      retrievalAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
  };
}

function assertPortResult(portResult, normalized, portRequest) {
  assertPlainObject(portResult, "portResult");
  requireConst(portResult.source?.targetUseCase, "RecordTutoringAnalysisResult.Execute", "portResult.source.targetUseCase");
  requireConst(portResult.source?.writeRepositoryOperation, "ArchiveRepository.RecordTutoringAnalysisResult", "portResult.source.writeRepositoryOperation");
  const result = assertPlainObject(portResult.result, "portResult.result");
  requireConst(result.requestId, normalized.answerReviewGate.requestId, "portResult.result.requestId");
  requireConst(result.archiveItemId, normalized.answerReviewGate.archiveItemId, "portResult.result.archiveItemId");
  requireConst(result.workerId, normalized.answerReviewGate.workerId, "portResult.result.workerId");
  requireConst(result.status, "SUCCEEDED", "portResult.result.status");
  requireConst(result.resultRef, portRequest.resultRef, "portResult.result.resultRef");
  requireConst(result.studentVisiblePublished, false, "portResult.result.studentVisiblePublished");
  requireConst(result.guidanceTextStored, false, "portResult.result.guidanceTextStored");
  return {
    requestId: result.requestId,
    archiveItemId: result.archiveItemId,
    workerId: result.workerId,
    status: result.status,
    completedAt: requireIsoString(result.completedAt, "portResult.result.completedAt"),
    resultRefHash: hashInput(result.resultRef),
  };
}

function buildRecord(normalized, portRequest, persistedResult, recordedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_PORT,
    status: persistedStatus,
    recordId: `student_app_ai_tutor_reviewed_result_persistence_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    persistenceInvocationId: normalized.persistenceInvocationId,
    sourceReviewGate: normalized.answerReviewGate,
    learningActionSource: normalized.answerReviewGate.learningActionSource,
    resultArchiveStatus: normalized.answerReviewGate.resultArchiveStatus,
    feedbackStatus: normalized.answerReviewGate.feedbackStatus,
    recordTutoringAnalysisResultCommand: {
      targetUseCase: portRequest.targetUseCase,
      writeRepositoryOperation: portRequest.writeRepositoryOperation,
      requestId: portRequest.requestId,
      workerId: portRequest.workerId,
      status: portRequest.status,
      resultRefHash: hashInput(portRequest.resultRef),
      guidanceTextSentToPort: false,
    },
    reviewedResult: {
      ...persistedResult,
      reviewId: normalized.answerReviewGate.reviewId,
      artifactId: normalized.answerReviewGate.artifactId,
      guidanceSectionsHash: normalized.answerReviewGate.guidanceSectionsHash,
    },
    boundary: {
      answerReviewGateRequired: true,
      approvedReviewRequired: true,
      recordTutoringAnalysisResultUseCaseInvoked: true,
      resultPersistenceStarted: true,
      tutoringResultRecorded: true,
      resultRefExposed: false,
      guidanceTextSentToPort: false,
      rawModelOutputExcluded: true,
      promptExcluded: true,
      answerKeyExcluded: true,
      contentRefExcluded: true,
      studentVisiblePublished: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      retrievalAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      futureStudentVisibilityRequiresSeparateRuntime: true,
    },
    evidenceRefs: normalized.evidenceRefs,
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
    runtimeSlo: { targetP99Ms: 50, p99Ms: 7, totalErrors: 0, operations: 1, evidenceClass: "JS_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_PROBE" },
  };
}

function buildResult(record, options) {
  return { ...record, idempotentReplay: options.idempotentReplay };
}

function findExistingRecordByIdempotencyKey(logPath, idempotencyKey) {
  if (!fs.existsSync(logPath)) return null;
  for (const line of fs.readFileSync(logPath, "utf8").split(/\r?\n/u).filter(Boolean)) {
    const record = JSON.parse(line);
    if (record.idempotencyKey === idempotencyKey) return record;
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.inputHash !== normalized.inputHash) {
    throw bridgeError("STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different reviewed result persistence command");
  }
}

function appendRecord(logPath, record) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`);
}

function rejectLeakedFields(value, label) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectLeakedFields(item, `${label}[${index}]`));
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (leakedFieldNames.has(key.replace(/[^a-zA-Z]/gu, "").toLowerCase())) {
      throw bridgeError("STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_LEAKED_FIELD", `${label}.${key} is not allowed`);
    }
    rejectLeakedFields(nested, `${label}.${key}`);
  }
}

function uniqueStringArray(value, label, min, max, minLength = 1, maxLength = 1000) {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw bridgeError("STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_INVALID_ARRAY", `${label} must contain ${min}-${max} items`);
  const normalized = uniq(value.map((item) => requireBoundedString(item, `${label}[]`, minLength, maxLength)));
  if (normalized.length < min) throw bridgeError("STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_INVALID_ARRAY", `${label} must contain unique items`);
  return normalized;
}

function uniq(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))];
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw bridgeError("STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireToken(value, label, prefix) {
  const text = requireBoundedString(value, label, prefix.length + 1, 240);
  if (!text.startsWith(prefix)) throw bridgeError("STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_TOKEN", `${label} must start with ${prefix}`);
  return text;
}

function requireHex(value, label) {
  const text = requireBoundedString(value, label, 64, 64);
  if (!/^[a-f0-9]{64}$/u.test(text)) throw bridgeError("STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_HEX", `${label} must be sha256 hex`);
  return text;
}

function requireIsoString(value, label) {
  const text = requireBoundedString(value, label, 20, 40);
  if (Number.isNaN(Date.parse(text))) throw bridgeError("STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_ISO_DATE", `${label} must be ISO datetime`);
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw bridgeError("STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_INTEGER", `${label} must be ${min}-${max}`);
  }
  return value;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    throw bridgeError("STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_REQUIRED", `${label} must be ${min}-${max} chars`);
  }
  return value.trim();
}

function requireConst(actual, expected, label) {
  if (actual !== expected) throw bridgeError("STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_CONST", `${label} must be ${expected}`);
  return actual;
}

function requireOneOf(actual, label, expectedValues) {
  if (!expectedValues.includes(actual)) throw bridgeError("STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_ENUM", `${label} must be one of ${expectedValues.join(",")}`);
  return actual;
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeToken(value) {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function bridgeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
