import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_answer_scoring_result_persistence_bridge_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_PORT =
  "StudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridgePort.recordAIGradingResult";

const inputSchemaVersion = "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge.v1";
const outputSchemaVersion = "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge-recorded.v1";
const sourceRuntimeId = "student_app_ai_tutor_question_bank_draft_answer_controlled_scoring_artifact_runtime";
const sourceCommandPort = "StudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifactPort.recordControlledScoringArtifact";
const sourceWorkloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT";
const sourceStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_RECORDED";
const sourceExecutionState = "SCORING_ARTIFACT_RECORDED_NOT_PERSISTED";
const persistedStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTED";
const persistedExecutionState = "SCORING_RESULT_PERSISTED_VIA_RECORD_AI_GRADING_RESULT";
const defaultResultLogPath =
  "reports/student-command-log/student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge.jsonl";
const leakedFieldNames = [
  "answerText",
  "expectedAnswer",
  "explanation",
  "answerKey",
  "correctAnswer",
  "rawModelOutput",
  "modelOutput",
  "modelResponse",
  "feedback",
  "learnerFeedback",
  "detailedFeedback",
  "directSql",
  "dbUrl",
  "internalError",
  "errorMessage",
];

export async function recordStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(input, options = {}) {
  const recordedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const resultLogPath = options.resultLogPath ?? defaultResultLogPath;
  const existing = findExistingRecordByIdempotencyKey(resultLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const port = assertRecordAIGradingResultPort(options.recordAIGradingResultPort);
  const portRequest = buildPortRequest(normalized);
  const portResult = await port.recordAIGradingResult(portRequest);
  const persistedResult = assertPortResult(portResult, normalized.recordAIGradingResultInput);
  const record = buildRecord(normalized, portRequest, persistedResult, recordedAt);
  appendRecord(resultLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(result) {
  return [
    `Student App AI Tutor question-bank answer scoring result persistence bridge: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Target: ${result.recordAIGradingResultCommand.targetUseCase}`,
    `Request: ${result.recordAIGradingResultCommand.recordAIGradingResultInput.requestId}`,
    `Persisted: ${result.boundary.resultPersistenceCommitted}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const persistenceInvocationId = requireToken(input.persistenceInvocationId, "input.persistenceInvocationId", "qbank_answer_scoring_result_persist_");
  const sourceReport = assertControlledScoringArtifactReport(input.controlledScoringArtifactReport);
  const sourceRecord = assertControlledScoringArtifactRecord(sourceReport);
  const principal = assertPrincipal(input.principal);
  const policy = assertPersistencePolicy(input.resultPersistencePolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 600);
  if (!evidenceRefs.some((ref) => ref.includes("student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact"))) {
    throw persistenceBridgeError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_RESULT_PERSISTENCE_MISSING_SOURCE_EVIDENCE", "controlled scoring artifact evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 420);
  const recordAIGradingResultInput = buildRecordAIGradingResultInput(sourceRecord);
  const inputHash = hashInput({
    persistenceInvocationId,
    sourceRecordId: sourceRecord.recordId,
    sourceArtifactId: sourceRecord.scoreArtifact.artifactId,
    principalId: principal.principalId,
    recordAIGradingResultInput,
    policy,
  });
  return {
    persistenceInvocationId,
    sourceReport,
    sourceRecord,
    principal,
    policy,
    evidenceRefs,
    idempotencyKey,
    recordAIGradingResultInput,
    inputHash,
  };
}

function assertControlledScoringArtifactReport(report) {
  rejectLeakedFields(report, "input.controlledScoringArtifactReport");
  assertPlainObject(report, "input.controlledScoringArtifactReport");
  requireConst(report.readiness, "READY", "input.controlledScoringArtifactReport.readiness");
  requireConst(report.workloadType, sourceWorkloadType, "input.controlledScoringArtifactReport.workloadType");
  requireConst(report.runtime?.runtimeId, sourceRuntimeId, "input.controlledScoringArtifactReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, sourceCommandPort, "input.controlledScoringArtifactReport.runtime.commandPort");
  requireConst(report.runtime?.status, sourceStatus, "input.controlledScoringArtifactReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.controlledScoringArtifactReport.runtimeSlo.totalErrors");
  const invariants = report.safetyInvariants ?? {};
  for (const field of [
    "sourceModelExecutionPrecheckRequired",
    "sourceScoringInputFoundationRequired",
    "internalServiceOnly",
    "protectedAnswerPackageConsumedByWorkerOnly",
    "controlledModelScoringArtifactOnly",
  ]) {
    requireConst(invariants[field], true, `input.controlledScoringArtifactReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "answerTextDisclosed",
    "expectedAnswerDisclosed",
    "explanationDisclosed",
    "answerKeyDisclosed",
    "rawModelOutputStored",
    "resultPersistenceAllowed",
    "feedbackGenerationAllowed",
    "studentVisiblePublishAllowed",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "swarmAllowed",
  ]) {
    requireConst(invariants[field], false, `input.controlledScoringArtifactReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertControlledScoringArtifactRecord(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerControlledScoringArtifact?.result;
  rejectLeakedFields(result, "source.controlledScoringArtifact.result");
  assertPlainObject(result, "source.controlledScoringArtifact.result");
  requireConst(result.runtimeId, sourceRuntimeId, "source.runtimeId");
  requireConst(result.commandPort, sourceCommandPort, "source.commandPort");
  requireConst(result.status, sourceStatus, "source.status");
  requireConst(result.boundary?.resultPersistenceStarted, false, "source.boundary.resultPersistenceStarted");
  requireConst(result.boundary?.feedbackGenerationStarted, false, "source.boundary.feedbackGenerationStarted");
  requireConst(result.boundary?.studentVisiblePublished, false, "source.boundary.studentVisiblePublished");
  requireConst(result.boundary?.requiresFutureRecordAIGradingResult, true, "source.boundary.requiresFutureRecordAIGradingResult");
  const artifact = assertScoreArtifact(result.scoreArtifact);
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "source.recordId", 1, 420),
    inputHash: requireHex(result.inputHash, "source.inputHash"),
    scoringAttempt: assertScoringAttempt(result.scoringAttempt, artifact),
    scoreArtifact: artifact,
    evidenceRefs: dedupeStringArray(result.evidenceRefs ?? [], "source.evidenceRefs", 1, 1200),
  };
}

function assertScoreArtifact(artifact) {
  rejectLeakedFields(artifact, "source.scoreArtifact");
  assertPlainObject(artifact, "source.scoreArtifact");
  requireConst(artifact.executionState, sourceExecutionState, "source.scoreArtifact.executionState");
  requireConst(artifact.status, "REVIEWED_MODEL_SCORE_ARTIFACT_RECORDED_NOT_PERSISTED", "source.scoreArtifact.status");
  requireConst(artifact.resultPersistenceStarted, false, "source.scoreArtifact.resultPersistenceStarted");
  requireConst(artifact.feedbackGenerationStarted, false, "source.scoreArtifact.feedbackGenerationStarted");
  requireConst(artifact.studentVisiblePublished, false, "source.scoreArtifact.studentVisiblePublished");
  const itemScores = assertItemScores(artifact.itemScores);
  const scoreSummary = assertScoreSummary(artifact.scoreSummary, itemScores);
  return {
    artifactId: requireToken(artifact.artifactId, "source.scoreArtifact.artifactId", "qbank_answer_scoring_artifact_"),
    requestId: requireToken(artifact.requestId, "source.scoreArtifact.requestId", "grading_req_"),
    submissionId: requireToken(artifact.submissionId, "source.scoreArtifact.submissionId", "qbank_ans_sub_"),
    questionBankDraftRef: requireQuestionBankDraftRef(artifact.questionBankDraftRef, "source.scoreArtifact.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireToken(artifact.tutoringAnalysisRequestId, "source.scoreArtifact.tutoringAnalysisRequestId", "tutor_req_"),
    archiveItemId: requireToken(artifact.archiveItemId, "source.scoreArtifact.archiveItemId", "tarch_"),
    workerId: requireToken(artifact.workerId, "source.scoreArtifact.workerId", "ai_grading_worker_"),
    modelRoute: requireConst(artifact.modelRoute, "StudentTutorAgent.score_question_bank_answer", "source.scoreArtifact.modelRoute"),
    attemptId: requireToken(artifact.attemptId, "source.scoreArtifact.attemptId", "qbank_answer_scoring_model_attempt_"),
    executionState: sourceExecutionState,
    status: "REVIEWED_MODEL_SCORE_ARTIFACT_RECORDED_NOT_PERSISTED",
    itemScores,
    scoreSummary,
    resultPersistenceStarted: false,
    feedbackGenerationStarted: false,
    studentVisiblePublished: false,
  };
}

function assertItemScores(itemScores) {
  if (!Array.isArray(itemScores) || itemScores.length === 0 || itemScores.length > 100) {
    throw persistenceBridgeError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_RESULT_PERSISTENCE_ITEM_SCORES_INVALID", "source.scoreArtifact.itemScores must contain 1-100 items");
  }
  const seen = new Set();
  return itemScores.map((score, index) => {
    rejectLeakedFields(score, `source.scoreArtifact.itemScores[${index}]`);
    assertPlainObject(score, `source.scoreArtifact.itemScores[${index}]`);
    const itemId = requireToken(score.itemId, `source.scoreArtifact.itemScores[${index}].itemId`, "qbank_plan_item_");
    if (seen.has(itemId)) throw persistenceBridgeError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_RESULT_PERSISTENCE_DUPLICATE_SCORE", `duplicate item score ${itemId}`);
    seen.add(itemId);
    const maxScore = requireNumberBetween(score.maxScore, `source.scoreArtifact.itemScores[${index}].maxScore`, 1, 100);
    return {
      itemId,
      score: requireNumberBetween(score.score, `source.scoreArtifact.itemScores[${index}].score`, 0, maxScore),
      maxScore,
      confidence: requireNumberBetween(score.confidence, `source.scoreArtifact.itemScores[${index}].confidence`, 0, 1),
      rubricCode: requireToken(score.rubricCode, `source.scoreArtifact.itemScores[${index}].rubricCode`, "rubric_"),
    };
  });
}

function assertScoreSummary(summary, itemScores) {
  rejectLeakedFields(summary, "source.scoreArtifact.scoreSummary");
  assertPlainObject(summary, "source.scoreArtifact.scoreSummary");
  const totalScore = round2(itemScores.reduce((sum, item) => sum + item.score, 0));
  const maxScore = round2(itemScores.reduce((sum, item) => sum + item.maxScore, 0));
  requireConst(summary.totalScore, totalScore, "source.scoreArtifact.scoreSummary.totalScore");
  requireConst(summary.maxScore, maxScore, "source.scoreArtifact.scoreSummary.maxScore");
  const percentage = round2((totalScore / maxScore) * 100);
  requireConst(summary.percentage, percentage, "source.scoreArtifact.scoreSummary.percentage");
  return {
    totalScore,
    maxScore,
    percentage,
    level: requireOneOf(summary.level, "source.scoreArtifact.scoreSummary.level", ["NEEDS_PRACTICE", "DEVELOPING", "PROFICIENT", "ADVANCED"]),
  };
}

function assertScoringAttempt(attempt, artifact) {
  assertPlainObject(attempt, "source.scoringAttempt");
  return {
    attemptId: requireConst(attempt.attemptId, artifact.attemptId, "source.scoringAttempt.attemptId"),
    requestId: requireConst(attempt.requestId, artifact.requestId, "source.scoringAttempt.requestId"),
    workerId: requireConst(attempt.workerId, artifact.workerId, "source.scoringAttempt.workerId"),
    modelRoute: requireConst(attempt.modelRoute, artifact.modelRoute, "source.scoringAttempt.modelRoute"),
    queueRef: requireToken(attempt.queueRef, "source.scoringAttempt.queueRef", "qbank_answer_scoring_model_queue_"),
    providerClass: requireOneOf(attempt.providerClass, "source.scoringAttempt.providerClass", ["CONTROLLED_AI_WORKER", "LOCAL_SANDBOXED_AI_WORKER"]),
    attemptNo: requireIntegerBetween(attempt.attemptNo, "source.scoringAttempt.attemptNo", 1, 1),
  };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 2, 18);
  for (const scope of ["TEACHING_WRITE", "AGENT_COMMAND_SUBMIT"]) {
    if (!scopes.includes(scope)) {
      throw persistenceBridgeError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_RESULT_PERSISTENCE_SCOPE_MISSING", `input.principal.scopes must include ${scope}`);
    }
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
  for (const field of [
    "controlledScoringArtifactRequired",
    "existingRecordAIGradingResultUseCaseRequired",
    "injectedRecordAIGradingResultPortRequired",
    "metadataOnlyResultAllowed",
    "resultPersistenceAllowed",
    "idempotentPersistenceRequired",
  ]) {
    requireConst(policy[field], true, `input.resultPersistencePolicy.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "feedbackGenerationAllowed",
    "studentVisiblePublishAllowed",
    "answerTextAllowed",
    "expectedAnswerAllowed",
    "explanationAllowed",
    "answerKeyAllowed",
    "rawModelOutputStored",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.resultPersistencePolicy.${field}`);
  }
  return { ...policy };
}

function buildRecordAIGradingResultInput(sourceRecord) {
  const artifact = sourceRecord.scoreArtifact;
  const summary = artifact.scoreSummary;
  const itemCount = artifact.itemScores.length;
  const scoreSummary = `Question-bank answer score ${summary.totalScore}/${summary.maxScore} (${summary.percentage}%, ${summary.level}); items=${itemCount}; artifact=${artifact.artifactId}`;
  const resultRef = `controlled-score-artifact://${artifact.artifactId}?request=${artifact.requestId}&hash=sha256_${sourceRecord.inputHash}`;
  return {
    requestId: artifact.requestId,
    workerId: artifact.workerId,
    status: "SUCCEEDED",
    scoreSummary,
    resultRef,
  };
}

function buildPortRequest(normalized) {
  return {
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_PORT,
    targetUseCase: "RecordAIGradingResult.Execute",
    targetOperationId: "recordTeachingAIGradingWorkerResult",
    persistenceInvocationId: normalized.persistenceInvocationId,
    principal: normalized.principal,
    sourceControlledScoringArtifact: {
      recordId: normalized.sourceRecord.recordId,
      artifactId: normalized.sourceRecord.scoreArtifact.artifactId,
      requestId: normalized.sourceRecord.scoreArtifact.requestId,
      workerId: normalized.sourceRecord.scoreArtifact.workerId,
      scoreSummary: normalized.sourceRecord.scoreArtifact.scoreSummary,
      itemScoreCount: normalized.sourceRecord.scoreArtifact.itemScores.length,
    },
    recordAIGradingResultInput: normalized.recordAIGradingResultInput,
    resultPersistencePolicy: normalized.policy,
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
  };
}

function assertPortResult(result, expectedInput) {
  rejectLeakedFields(result, "RecordAIGradingResult port result");
  assertPlainObject(result, "RecordAIGradingResult port result");
  const persisted = result.aiGradingResult ?? result.recordAIGradingResult;
  rejectLeakedFields(persisted, "RecordAIGradingResult port result.aiGradingResult");
  assertPlainObject(persisted, "RecordAIGradingResult port result.aiGradingResult");
  requireConst(persisted.requestId, expectedInput.requestId, "portResult.aiGradingResult.requestId");
  requireConst(persisted.workerId, expectedInput.workerId, "portResult.aiGradingResult.workerId");
  requireConst(persisted.status, "SUCCEEDED", "portResult.aiGradingResult.status");
  requireConst(persisted.scoreSummary, expectedInput.scoreSummary, "portResult.aiGradingResult.scoreSummary");
  requireConst(persisted.resultRef, expectedInput.resultRef, "portResult.aiGradingResult.resultRef");
  requireConst(persisted.recordAIGradingResultUseCaseInvoked, true, "portResult.aiGradingResult.recordAIGradingResultUseCaseInvoked");
  requireConst(persisted.resultPersistenceCommitted, true, "portResult.aiGradingResult.resultPersistenceCommitted");
  requireConst(persisted.feedbackGenerationStarted, false, "portResult.aiGradingResult.feedbackGenerationStarted");
  requireConst(persisted.studentVisiblePublished, false, "portResult.aiGradingResult.studentVisiblePublished");
  return {
    requestId: persisted.requestId,
    workerId: persisted.workerId,
    status: "SUCCEEDED",
    scoreSummary: persisted.scoreSummary,
    resultRef: persisted.resultRef,
    recordAIGradingResultUseCaseInvoked: true,
    resultPersistenceCommitted: true,
    feedbackGenerationStarted: false,
    studentVisiblePublished: false,
  };
}

function buildRecord(normalized, portRequest, persistedResult, recordedAt) {
  return {
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_PORT,
    status: persistedStatus,
    recordId: `student_app_ai_tutor_question_bank_draft_answer_scoring_result_persistence_bridge_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
    sourceControlledScoringArtifact: {
      runtimeId: sourceRuntimeId,
      recordId: normalized.sourceRecord.recordId,
      artifactId: normalized.sourceRecord.scoreArtifact.artifactId,
      requestId: normalized.sourceRecord.scoreArtifact.requestId,
      submissionId: normalized.sourceRecord.scoreArtifact.submissionId,
      workerId: normalized.sourceRecord.scoreArtifact.workerId,
      priorExecutionState: sourceExecutionState,
    },
    recordAIGradingResultCommand: portRequest,
    persistedAIGradingResult: persistedResult,
    executionState: persistedExecutionState,
    evidenceRefs: [
      ...normalized.evidenceRefs,
      ...normalized.sourceRecord.evidenceRefs,
      `evidence:question-bank-answer-scoring-result-persistence-input-hash:sha256:${normalized.inputHash}`,
      `evidence:runtime:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_RUNTIME_ID}`,
      `evidence:command-port:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_PORT}`,
      "evidence:target-use-case:RecordAIGradingResult.Execute",
    ],
    boundary: {
      sourceControlledScoringArtifactRequired: true,
      existingRecordAIGradingResultUseCaseRequired: true,
      recordAIGradingResultUseCaseInvoked: true,
      resultPersistenceStarted: true,
      resultPersistenceCommitted: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      answerTextDisclosed: false,
      expectedAnswerDisclosed: false,
      explanationDisclosed: false,
      answerKeyDisclosed: false,
      rawModelOutputStored: false,
      feedbackGenerationStarted: false,
      studentVisiblePublished: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureReviewedFeedbackPublication: true,
    },
    runtimeSlo: {
      targetP99Ms: 50,
      evidenceClass: "STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_BOUNDARY",
    },
    nextAction: "Use this persisted score result as the source for reviewed feedback generation and student-visible publication in later reviewed slices.",
  };
}

function buildResult(record, { idempotentReplay }) {
  return {
    schemaVersion: outputSchemaVersion,
    ...record,
    idempotentReplay,
  };
}

function assertRecordAIGradingResultPort(port) {
  if (!port || typeof port.recordAIGradingResult !== "function") {
    throw persistenceBridgeError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_RESULT_PERSISTENCE_MISSING_PORT", "ResultPersistenceBridgePort.recordAIGradingResult is required");
  }
  return port;
}

function findExistingRecordByIdempotencyKey(logPath, idempotencyKey) {
  if (!fs.existsSync(logPath)) return null;
  const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/u).filter(Boolean);
  for (const line of lines) {
    const record = JSON.parse(line);
    if (record.idempotencyKey === idempotencyKey) return record;
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.inputHash !== normalized.inputHash) {
    throw persistenceBridgeError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_RESULT_PERSISTENCE_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different scoring result persistence bridge input");
  }
}

function appendRecord(logPath, record) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`);
}

function rejectLeakedFields(value, label) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (leakedFieldNames.includes(key)) {
      throw persistenceBridgeError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_RESULT_PERSISTENCE_LEAKED_FIELD", `${label}.${key} is not allowed`);
    }
    rejectLeakedFields(child, `${label}.${key}`);
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw persistenceBridgeError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_RESULT_PERSISTENCE_INVALID_OBJECT", `${label} must be an object`);
  }
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw persistenceBridgeError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_RESULT_PERSISTENCE_CONST_MISMATCH", `${label} must be ${expected}`);
  }
  return actual;
}

function requireOneOf(actual, label, allowed) {
  if (!allowed.includes(actual)) {
    throw persistenceBridgeError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_RESULT_PERSISTENCE_ENUM_INVALID", `${label} must be one of ${allowed.join(", ")}`);
  }
  return actual;
}

function requireToken(value, label, prefix) {
  const normalized = requireBoundedString(value, label, prefix.length + 1, 260);
  if (!normalized.startsWith(prefix)) {
    throw persistenceBridgeError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_RESULT_PERSISTENCE_TOKEN_INVALID", `${label} must start with ${prefix}`);
  }
  if (!/^[A-Za-z0-9_:/?=&.-]+$/u.test(normalized)) {
    throw persistenceBridgeError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_RESULT_PERSISTENCE_TOKEN_INVALID", `${label} contains unsupported characters`);
  }
  return normalized;
}

function requireQuestionBankDraftRef(value, label) {
  const normalized = requireBoundedString(value, label, 12, 1000);
  if (!normalized.includes("question-bank-drafts/")) {
    throw persistenceBridgeError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_RESULT_PERSISTENCE_REF_INVALID", `${label} must reference question-bank-drafts`);
  }
  return normalized;
}

function requireHex(value, label) {
  const normalized = requireBoundedString(value, label, 64, 64);
  if (!/^[a-f0-9]{64}$/u.test(normalized)) {
    throw persistenceBridgeError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_RESULT_PERSISTENCE_HASH_INVALID", `${label} must be a sha256 hex digest without prefix`);
  }
  return normalized;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string") {
    throw persistenceBridgeError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_RESULT_PERSISTENCE_STRING_INVALID", `${label} must be a string`);
  }
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw persistenceBridgeError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_RESULT_PERSISTENCE_STRING_INVALID", `${label} length must be ${min}-${max}`);
  }
  return normalized;
}

function requireNumberBetween(value, label, min, max) {
  if (typeof value !== "number" || Number.isNaN(value) || value < min || value > max) {
    throw persistenceBridgeError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_RESULT_PERSISTENCE_NUMBER_INVALID", `${label} must be between ${min} and ${max}`);
  }
  return value;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw persistenceBridgeError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_RESULT_PERSISTENCE_INTEGER_INVALID", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function uniqueStringArray(value, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw persistenceBridgeError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_RESULT_PERSISTENCE_ARRAY_INVALID", `${label} must contain ${min}-${max} strings`);
  }
  const seen = new Set();
  const normalized = value.map((entry, index) => requireBoundedString(entry, `${label}[${index}]`, 1, 1200));
  for (const entry of normalized) {
    if (seen.has(entry)) {
      throw persistenceBridgeError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_RESULT_PERSISTENCE_DUPLICATE", `${label} contains duplicate entries`);
    }
    seen.add(entry);
  }
  return normalized;
}

function dedupeStringArray(value, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw persistenceBridgeError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_RESULT_PERSISTENCE_ARRAY_INVALID", `${label} must contain ${min}-${max} strings`);
  }
  const seen = new Set();
  const normalized = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = requireBoundedString(value[index], `${label}[${index}]`, 1, 1200);
    if (seen.has(entry)) continue;
    seen.add(entry);
    normalized.push(entry);
  }
  if (normalized.length < min) {
    throw persistenceBridgeError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_RESULT_PERSISTENCE_ARRAY_INVALID", `${label} must contain at least ${min} strings after dedupe`);
  }
  return normalized;
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeToken(value) {
  return value.replace(/[^A-Za-z0-9_]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 180);
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function persistenceBridgeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
