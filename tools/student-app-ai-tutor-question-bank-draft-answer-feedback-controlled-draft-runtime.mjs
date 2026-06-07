import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_answer_feedback_controlled_draft_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_PORT =
  "StudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraftPort.recordControlledFeedbackDraft";

const inputSchemaVersion = "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-controlled-draft.v1";
const outputSchemaVersion = "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-controlled-draft-recorded.v1";
const sourcePrecheckSchemaVersion = "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-prechecked.v1";
const sourcePrecheckRuntimeId = "student_app_ai_tutor_question_bank_draft_answer_feedback_generation_model_execution_precheck_runtime";
const sourcePrecheckWorkload = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECK_RUNTIME";
const sourcePrecheckPort = "StudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheckPort.recordFeedbackGenerationModelExecutionPrecheck";
const modelRoute = "StudentTutorAgent.generate_question_bank_answer_feedback";
const recordedStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_RECORDED";
const defaultCommandLogPath =
  "reports/student-command-log/student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft.jsonl";

const leakedFieldNames = [
  "answerText",
  "expectedAnswer",
  "explanation",
  "answerKey",
  "correctAnswer",
  "resultRef",
  "rawModelOutput",
  "modelOutput",
  "modelResponse",
  "workerTrace",
  "directSql",
  "dbUrl",
  "internalError",
  "errorMessage",
  "publishedAt",
  "publicationStatus",
];

const forbiddenFeedbackText = /(answer key|correct answer|expected answer|raw model|internal error|resultref|标准答案|参考答案|正确答案|答案解析)/iu;

export async function recordStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft(input, options = {}) {
  const recordedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const commandLogPath = options.commandLogPath ?? defaultCommandLogPath;
  const existing = findExistingRecordByIdempotencyKey(commandLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const port = assertControlledFeedbackDraftPort(options.controlledFeedbackDraftPort);
  const portResult = await port.recordControlledFeedbackDraft(buildPortRequest(normalized));
  const feedbackDraft = assertPortResult(portResult, normalized);
  const record = buildRecord(normalized, feedbackDraft, recordedAt);
  appendRecord(commandLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft(result) {
  return [
    `Student App AI Tutor question-bank answer controlled feedback draft: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Draft: ${result.feedbackDraft.artifactId}`,
    `Submission: ${result.feedbackDraft.submissionId}`,
    `Student-visible published: ${result.boundary.studentVisibleFeedbackPublished}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const generationInvocationId = requireToken(input.generationInvocationId, "input.generationInvocationId", "feedback_controlled_draft_");
  const modelExecutionPrecheckReport = assertModelExecutionPrecheckReport(input.feedbackGenerationModelExecutionPrecheckReport);
  const modelExecutionPrecheckResult = assertModelExecutionPrecheckResult(modelExecutionPrecheckReport);
  const principal = assertPrincipal(input.principal);
  const generationAttempt = assertGenerationAttempt(input.generationAttempt, modelExecutionPrecheckResult);
  const outputPolicy = assertOutputPolicy(input.outputPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 520);
  for (const required of ["feedback-generation-model-execution-precheck", "controlled-feedback-draft-generation"]) {
    if (!evidenceRefs.some((ref) => ref.includes(required))) {
      throw feedbackDraftError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_FEEDBACK_CONTROLLED_DRAFT_MISSING_EVIDENCE", `${required} evidence ref is required`);
    }
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 420);
  const inputHash = hashInput({
    generationInvocationId,
    precheckId: modelExecutionPrecheckResult.feedbackGenerationModelPrecheck.precheckId,
    requestId: modelExecutionPrecheckResult.feedbackGenerationModelPrecheck.requestId,
    submissionId: modelExecutionPrecheckResult.feedbackGenerationModelPrecheck.submissionId,
    generationAttempt,
    outputPolicy,
  });
  return {
    generationInvocationId,
    modelExecutionPrecheckReport,
    modelExecutionPrecheckResult,
    principal,
    generationAttempt,
    outputPolicy,
    evidenceRefs,
    idempotencyKey,
    inputHash,
  };
}

function assertModelExecutionPrecheckReport(report) {
  rejectLeakedFields(report, "input.feedbackGenerationModelExecutionPrecheckReport");
  assertPlainObject(report, "input.feedbackGenerationModelExecutionPrecheckReport");
  requireConst(report.readiness, "READY", "input.feedbackGenerationModelExecutionPrecheckReport.readiness");
  requireConst(report.workloadType, sourcePrecheckWorkload, "input.feedbackGenerationModelExecutionPrecheckReport.workloadType");
  requireConst(report.runtime?.runtimeId, sourcePrecheckRuntimeId, "input.feedbackGenerationModelExecutionPrecheckReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, sourcePrecheckPort, "input.feedbackGenerationModelExecutionPrecheckReport.runtime.commandPort");
  requireConst(report.runtime?.modelRoute, modelRoute, "input.feedbackGenerationModelExecutionPrecheckReport.runtime.modelRoute");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.feedbackGenerationModelExecutionPrecheckReport.runtimeSlo.totalErrors");
  const invariants = report.safetyInvariants ?? {};
  for (const field of [
    "sourceFeedbackPublicationPrecheckRequired",
    "scoringResultPersistenceRequired",
    "safeStudentResultRequired",
    "approvalRequired",
    "feedbackGenerationQueueAdmissionOnly",
    "futureFeedbackDraftGenerationApproved",
  ]) requireConst(invariants[field], true, `input.feedbackGenerationModelExecutionPrecheckReport.safetyInvariants.${field}`);
  for (const field of [
    "modelInferenceStarted",
    "feedbackDraftGenerated",
    "reviewedFeedbackArtifactRecorded",
    "studentVisibleFeedbackAllowed",
    "answerKeyDisclosureAllowed",
    "rawModelOutputPersistenceAllowed",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "swarmAllowed",
  ]) requireConst(invariants[field], false, `input.feedbackGenerationModelExecutionPrecheckReport.safetyInvariants.${field}`);
  return report;
}

function assertModelExecutionPrecheckResult(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck?.result;
  rejectLeakedFields(result, "source.feedbackGenerationModelExecutionPrecheckResult");
  assertPlainObject(result, "source.feedbackGenerationModelExecutionPrecheckResult");
  requireConst(result.schemaVersion, sourcePrecheckSchemaVersion, "source.precheck.schemaVersion");
  requireConst(result.runtimeId, sourcePrecheckRuntimeId, "source.precheck.runtimeId");
  requireConst(result.commandPort, sourcePrecheckPort, "source.precheck.commandPort");
  requireConst(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECKED", "source.precheck.status");
  requireConst(result.boundary?.feedbackGenerationQueueAdmitted, true, "source.precheck.boundary.feedbackGenerationQueueAdmitted");
  requireConst(result.boundary?.modelInferenceStarted, false, "source.precheck.boundary.modelInferenceStarted");
  requireConst(result.boundary?.feedbackDraftGenerated, false, "source.precheck.boundary.feedbackDraftGenerated");
  requireConst(result.boundary?.reviewedFeedbackArtifactRecorded, false, "source.precheck.boundary.reviewedFeedbackArtifactRecorded");
  requireConst(result.boundary?.studentVisibleFeedbackPublished, false, "source.precheck.boundary.studentVisibleFeedbackPublished");
  const scoring = assertStudentScoringResult(result.studentScoringResult);
  const precheck = assertFeedbackGenerationModelPrecheck(result.feedbackGenerationModelPrecheck, scoring);
  return {
    recordId: requireBoundedString(result.recordId, "source.precheck.recordId", 1, 420),
    precheckInvocationId: requireToken(result.precheckInvocationId, "source.precheck.precheckInvocationId", "feedback_generation_model_precheck_"),
    studentScoringResult: scoring,
    feedbackGenerationModelPrecheck: precheck,
    evidenceRefs: uniqueStringArray(result.evidenceRefs ?? [], "source.precheck.evidenceRefs", 1, 2600),
  };
}

function assertStudentScoringResult(result) {
  rejectLeakedFields(result, "source.precheck.studentScoringResult");
  assertPlainObject(result, "source.precheck.studentScoringResult");
  return {
    submissionId: requireToken(result.submissionId, "source.studentScoringResult.submissionId", "qbank_ans_sub_"),
    requestId: requireToken(result.requestId, "source.studentScoringResult.requestId", "grading_req_"),
    questionBankDraftRef: requireQuestionBankDraftRef(result.questionBankDraftRef, "source.studentScoringResult.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireToken(result.tutoringAnalysisRequestId, "source.studentScoringResult.tutoringAnalysisRequestId", "tutor_req_"),
    archiveItemId: requireToken(result.archiveItemId, "source.studentScoringResult.archiveItemId", "tarch_"),
    status: requireConst(result.status, "SUCCEEDED", "source.studentScoringResult.status"),
    scoreSummary: requireLearnerSafeText(result.scoreSummary, "source.studentScoringResult.scoreSummary", 1, 2000),
    requestedAt: requireIsoString(result.requestedAt, "source.studentScoringResult.requestedAt"),
    completedAt: requireIsoString(result.completedAt, "source.studentScoringResult.completedAt"),
    updatedAt: requireIsoString(result.updatedAt, "source.studentScoringResult.updatedAt"),
  };
}

function assertFeedbackGenerationModelPrecheck(precheck, scoring) {
  rejectLeakedFields(precheck, "source.precheck.feedbackGenerationModelPrecheck");
  assertPlainObject(precheck, "source.precheck.feedbackGenerationModelPrecheck");
  return {
    precheckId: requireToken(precheck.precheckId, "source.feedbackGenerationModelPrecheck.precheckId", "feedback_generation_model_precheck_"),
    queueRef: requireToken(precheck.queueRef, "source.feedbackGenerationModelPrecheck.queueRef", "feedback_generation_model_queue_"),
    modelRoute: requireConst(precheck.modelRoute, modelRoute, "source.feedbackGenerationModelPrecheck.modelRoute"),
    requestId: requireConst(precheck.requestId, scoring.requestId, "source.feedbackGenerationModelPrecheck.requestId"),
    submissionId: requireConst(precheck.submissionId, scoring.submissionId, "source.feedbackGenerationModelPrecheck.submissionId"),
    questionBankDraftRef: requireConst(precheck.questionBankDraftRef, scoring.questionBankDraftRef, "source.feedbackGenerationModelPrecheck.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireConst(precheck.tutoringAnalysisRequestId, scoring.tutoringAnalysisRequestId, "source.feedbackGenerationModelPrecheck.tutoringAnalysisRequestId"),
    archiveItemId: requireConst(precheck.archiveItemId, scoring.archiveItemId, "source.feedbackGenerationModelPrecheck.archiveItemId"),
    scoreSummary: requireConst(precheck.scoreSummary, scoring.scoreSummary, "source.feedbackGenerationModelPrecheck.scoreSummary"),
    status: requireConst(precheck.status, "FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECKED_NOT_STARTED", "source.feedbackGenerationModelPrecheck.status"),
    queueAdmissionOnly: requireConst(precheck.queueAdmissionOnly, true, "source.feedbackGenerationModelPrecheck.queueAdmissionOnly"),
    modelInferenceStarted: requireConst(precheck.modelInferenceStarted, false, "source.feedbackGenerationModelPrecheck.modelInferenceStarted"),
    feedbackDraftGenerated: requireConst(precheck.feedbackDraftGenerated, false, "source.feedbackGenerationModelPrecheck.feedbackDraftGenerated"),
    studentVisiblePublished: requireConst(precheck.studentVisiblePublished, false, "source.feedbackGenerationModelPrecheck.studentVisiblePublished"),
  };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 4, 18);
  for (const scope of ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT", "FEEDBACK_DRAFT_GENERATE"]) {
    if (!scopes.includes(scope)) throw feedbackDraftError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_FEEDBACK_CONTROLLED_DRAFT_SCOPE_MISSING", `input.principal.scopes must include ${scope}`);
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

function assertGenerationAttempt(attempt, source) {
  rejectLeakedFields(attempt, "input.generationAttempt");
  assertPlainObject(attempt, "input.generationAttempt");
  const precheck = source.feedbackGenerationModelPrecheck;
  return {
    attemptId: requireToken(attempt.attemptId, "input.generationAttempt.attemptId", "feedback_generation_attempt_"),
    precheckId: requireConst(attempt.precheckId, precheck.precheckId, "input.generationAttempt.precheckId"),
    modelRoute: requireConst(attempt.modelRoute, precheck.modelRoute, "input.generationAttempt.modelRoute"),
    queueRef: requireConst(attempt.queueRef, precheck.queueRef, "input.generationAttempt.queueRef"),
    providerClass: requireOneOf(attempt.providerClass, "input.generationAttempt.providerClass", ["CONTROLLED_AI_WORKER", "LOCAL_SANDBOXED_AI_WORKER"]),
    maxPromptTokens: requireIntegerBetween(attempt.maxPromptTokens, "input.generationAttempt.maxPromptTokens", 128, 12000),
    maxOutputTokens: requireIntegerBetween(attempt.maxOutputTokens, "input.generationAttempt.maxOutputTokens", 64, 4000),
    attemptNo: requireIntegerBetween(attempt.attemptNo, "input.generationAttempt.attemptNo", 1, 2),
  };
}

function assertOutputPolicy(policy) {
  assertPlainObject(policy, "input.outputPolicy");
  for (const field of [
    "sanitizedFeedbackDraftOnly",
    "sourceScoreSummaryOnly",
    "requiresFutureHumanReview",
    "requiresFutureReviewedArtifact",
    "requiresFuturePublicationApproval",
  ]) requireConst(policy[field], true, `input.outputPolicy.${field}`);
  for (const field of [
    "rawModelOutputStored",
    "answerKeyDisclosureAllowed",
    "resultRefDisclosureAllowed",
    "reviewedFeedbackArtifactRecorded",
    "studentVisiblePublicationAllowed",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) requireConst(policy[field], false, `input.outputPolicy.${field}`);
  return { ...policy };
}

function buildPortRequest(normalized) {
  const source = normalized.modelExecutionPrecheckResult;
  const precheck = source.feedbackGenerationModelPrecheck;
  return {
    generationInvocationId: normalized.generationInvocationId,
    modelRoute,
    sourceModelPrecheck: precheck,
    sourceStudentScoringResult: source.studentScoringResult,
    generationAttempt: normalized.generationAttempt,
    outputPolicy: normalized.outputPolicy,
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
  };
}

function assertPortResult(result, normalized) {
  rejectLeakedFields(result, "controlledFeedbackDraftPort.result");
  assertPlainObject(result, "controlledFeedbackDraftPort.result");
  const draft = result.feedbackDraft;
  rejectLeakedFields(draft, "controlledFeedbackDraftPort.result.feedbackDraft");
  assertPlainObject(draft, "controlledFeedbackDraftPort.result.feedbackDraft");
  const scoring = normalized.modelExecutionPrecheckResult.studentScoringResult;
  const precheck = normalized.modelExecutionPrecheckResult.feedbackGenerationModelPrecheck;
  return {
    artifactId: requireToken(draft.artifactId, "portResult.feedbackDraft.artifactId", "feedback_controlled_draft_"),
    precheckId: requireConst(draft.precheckId, precheck.precheckId, "portResult.feedbackDraft.precheckId"),
    requestId: requireConst(draft.requestId, scoring.requestId, "portResult.feedbackDraft.requestId"),
    submissionId: requireConst(draft.submissionId, scoring.submissionId, "portResult.feedbackDraft.submissionId"),
    questionBankDraftRef: requireConst(draft.questionBankDraftRef, scoring.questionBankDraftRef, "portResult.feedbackDraft.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireConst(draft.tutoringAnalysisRequestId, scoring.tutoringAnalysisRequestId, "portResult.feedbackDraft.tutoringAnalysisRequestId"),
    archiveItemId: requireConst(draft.archiveItemId, scoring.archiveItemId, "portResult.feedbackDraft.archiveItemId"),
    generationAttemptId: requireConst(draft.generationAttemptId, normalized.generationAttempt.attemptId, "portResult.feedbackDraft.generationAttemptId"),
    modelRoute: requireConst(draft.modelRoute, modelRoute, "portResult.feedbackDraft.modelRoute"),
    status: requireConst(draft.status, "CONTROLLED_FEEDBACK_DRAFT_READY_FOR_REVIEW_NOT_PUBLISHED", "portResult.feedbackDraft.status"),
    executionState: requireConst(draft.executionState, "CONTROLLED_FEEDBACK_DRAFT_RECORDED_NOT_REVIEWED", "portResult.feedbackDraft.executionState"),
    sourceScoreSummary: requireConst(draft.sourceScoreSummary, scoring.scoreSummary, "portResult.feedbackDraft.sourceScoreSummary"),
    draftFeedback: assertDraftFeedback(draft.draftFeedback),
    rawModelOutputStored: requireConst(draft.rawModelOutputStored, false, "portResult.feedbackDraft.rawModelOutputStored"),
    answerKeyDisclosed: requireConst(draft.answerKeyDisclosed, false, "portResult.feedbackDraft.answerKeyDisclosed"),
    resultRefDisclosed: requireConst(draft.resultRefDisclosed, false, "portResult.feedbackDraft.resultRefDisclosed"),
    reviewedFeedbackArtifactRecorded: requireConst(draft.reviewedFeedbackArtifactRecorded, false, "portResult.feedbackDraft.reviewedFeedbackArtifactRecorded"),
    studentVisibleFeedbackPublished: requireConst(draft.studentVisibleFeedbackPublished, false, "portResult.feedbackDraft.studentVisibleFeedbackPublished"),
  };
}

function assertDraftFeedback(feedback) {
  rejectLeakedFields(feedback, "portResult.feedbackDraft.draftFeedback");
  assertPlainObject(feedback, "portResult.feedbackDraft.draftFeedback");
  return {
    summary: requireLearnerSafeText(feedback.summary, "portResult.feedbackDraft.draftFeedback.summary", 1, 1200),
    encouragement: requireLearnerSafeText(feedback.encouragement, "portResult.feedbackDraft.draftFeedback.encouragement", 1, 600),
    nextSteps: uniqueLearnerSafeTextArray(feedback.nextSteps, "portResult.feedbackDraft.draftFeedback.nextSteps", 1, 8, 1, 500),
    misconceptionTags: uniqueLearnerSafeTextArray(feedback.misconceptionTags ?? [], "portResult.feedbackDraft.draftFeedback.misconceptionTags", 0, 12, 1, 80),
    practiceSuggestions: uniqueLearnerSafeTextArray(feedback.practiceSuggestions ?? [], "portResult.feedbackDraft.draftFeedback.practiceSuggestions", 0, 8, 1, 300),
  };
}

function buildRecord(normalized, feedbackDraft, recordedAt) {
  const source = normalized.modelExecutionPrecheckResult;
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT",
    recordId: stableRecordId("student_app_ai_tutor_question_bank_draft_answer_feedback_controlled_draft", normalized.idempotencyKey),
    recordedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_PORT,
    status: recordedStatus,
    generationInvocationId: normalized.generationInvocationId,
    principal: normalized.principal,
    sourceModelPrecheck: {
      runtimeId: sourcePrecheckRuntimeId,
      recordId: source.recordId,
      precheckId: source.feedbackGenerationModelPrecheck.precheckId,
      queueRef: source.feedbackGenerationModelPrecheck.queueRef,
      status: source.feedbackGenerationModelPrecheck.status,
    },
    studentScoringResult: source.studentScoringResult,
    generationAttempt: normalized.generationAttempt,
    feedbackDraft,
    boundary: {
      sourceModelPrecheckVerified: true,
      safeStudentResultOnly: true,
      controlledFeedbackDraftRecorded: true,
      modelInferenceStarted: true,
      feedbackDraftGenerated: true,
      rawModelOutputStored: false,
      answerKeyDisclosed: false,
      resultRefDisclosed: false,
      reviewedFeedbackArtifactRecorded: false,
      studentVisibleFeedbackPublished: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureHumanReview: true,
      requiresFutureReviewedArtifact: true,
      requiresFuturePublicationApproval: true,
    },
    evidenceRefs: [
      ...normalized.evidenceRefs,
      ...source.evidenceRefs,
      `evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft-input-hash:${normalized.inputHash}`,
      `evidence:runtime:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_RUNTIME_ID}`,
      `evidence:command-port:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_PORT}`,
      `evidence:source-runtime:${sourcePrecheckRuntimeId}`,
    ],
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
  };
}

function buildResult(record, replay) {
  return {
    ...record,
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: 10,
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_PROBE",
    },
    idempotentReplay: replay.idempotentReplay,
  };
}

function assertControlledFeedbackDraftPort(port) {
  if (!port || typeof port.recordControlledFeedbackDraft !== "function") {
    throw feedbackDraftError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_FEEDBACK_CONTROLLED_DRAFT_PORT_MISSING", "ControlledFeedbackDraftPort.recordControlledFeedbackDraft is required");
  }
  return port;
}

function findExistingRecordByIdempotencyKey(logPath, idempotencyKey) {
  if (!fs.existsSync(logPath)) return null;
  return fs.readFileSync(logPath, "utf8").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line)).find((record) => record.idempotencyKey === idempotencyKey) ?? null;
}

function assertReplayMatches(record, normalized) {
  requireConst(record.inputHash, normalized.inputHash, "record.inputHash");
  requireConst(record.status, recordedStatus, "record.status");
  requireConst(record.feedbackDraft.precheckId, normalized.modelExecutionPrecheckResult.feedbackGenerationModelPrecheck.precheckId, "record.feedbackDraft.precheckId");
}

function appendRecord(logPath, record) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`);
}

function rejectLeakedFields(value, context) {
  if (!value || typeof value !== "object") return;
  const stack = [{ value, path: context }];
  while (stack.length) {
    const current = stack.pop();
    for (const [key, nested] of Object.entries(current.value)) {
      if (leakedFieldNames.includes(key)) {
        throw feedbackDraftError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_FEEDBACK_CONTROLLED_DRAFT_LEAKED_FIELD", `${current.path}.${key} is not allowed`);
      }
      if (nested && typeof nested === "object") stack.push({ value: nested, path: `${current.path}.${key}` });
    }
  }
}

function assertPlainObject(value, context) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw feedbackDraftError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_FEEDBACK_CONTROLLED_DRAFT_INVALID_OBJECT", `${context} must be an object`);
  }
}

function requireConst(actual, expected, context) {
  if (actual !== expected) {
    throw feedbackDraftError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_FEEDBACK_CONTROLLED_DRAFT_CONST_MISMATCH", `${context} must be ${expected}`);
  }
  return actual;
}

function requireOneOf(actual, context, allowed) {
  if (!allowed.includes(actual)) {
    throw feedbackDraftError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_FEEDBACK_CONTROLLED_DRAFT_INVALID_ENUM", `${context} must be one of ${allowed.join(",")}`);
  }
  return actual;
}

function requireBoundedString(value, context, min, max) {
  if (typeof value !== "string" || value.length < min || value.length > max) {
    throw feedbackDraftError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_FEEDBACK_CONTROLLED_DRAFT_INVALID_STRING", `${context} must be a string with length ${min}-${max}`);
  }
  return value;
}

function requireToken(value, context, prefix) {
  const token = requireBoundedString(value, context, prefix.length + 1, 420);
  if (!token.startsWith(prefix)) {
    throw feedbackDraftError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_FEEDBACK_CONTROLLED_DRAFT_INVALID_TOKEN", `${context} must start with ${prefix}`);
  }
  return token;
}

function requireQuestionBankDraftRef(value, context) {
  const ref = requireBoundedString(value, context, 12, 420);
  if (!ref.startsWith("local://question-bank-drafts/")) {
    throw feedbackDraftError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_FEEDBACK_CONTROLLED_DRAFT_INVALID_DRAFT_REF", `${context} must use local question-bank draft ref`);
  }
  return ref;
}

function requireIsoString(value, context) {
  const text = requireBoundedString(value, context, 20, 80);
  if (Number.isNaN(Date.parse(text))) {
    throw feedbackDraftError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_FEEDBACK_CONTROLLED_DRAFT_INVALID_TIME", `${context} must be an ISO timestamp`);
  }
  return text;
}

function requireLearnerSafeText(value, context, min, max) {
  const text = requireBoundedString(value, context, min, max);
  if (/[<>]/u.test(text) || forbiddenFeedbackText.test(text)) {
    throw feedbackDraftError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_FEEDBACK_CONTROLLED_DRAFT_UNSAFE_TEXT", `${context} must not contain HTML, answer keys, raw model details, result refs, or internal errors`);
  }
  return text;
}

function requireIntegerBetween(value, context, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw feedbackDraftError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_FEEDBACK_CONTROLLED_DRAFT_INVALID_INTEGER", `${context} must be an integer ${min}-${max}`);
  }
  return value;
}

function uniqueStringArray(values, context, min, max) {
  if (!Array.isArray(values) || values.length < min || values.length > max) {
    throw feedbackDraftError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_FEEDBACK_CONTROLLED_DRAFT_INVALID_ARRAY", `${context} must contain ${min}-${max} values`);
  }
  const out = [];
  for (const value of values) {
    const text = requireBoundedString(value, context, 1, 900);
    if (!out.includes(text)) out.push(text);
  }
  return out;
}

function uniqueLearnerSafeTextArray(values, context, minItems, maxItems, minLength, maxLength) {
  if (!Array.isArray(values) || values.length < minItems || values.length > maxItems) {
    throw feedbackDraftError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_FEEDBACK_CONTROLLED_DRAFT_INVALID_ARRAY", `${context} must contain ${minItems}-${maxItems} values`);
  }
  const seen = new Set();
  return values.map((value, index) => {
    const text = requireLearnerSafeText(value, `${context}[${index}]`, minLength, maxLength);
    if (seen.has(text)) {
      throw feedbackDraftError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_FEEDBACK_CONTROLLED_DRAFT_DUPLICATE_TEXT", `${context}[${index}] is duplicated`);
    }
    seen.add(text);
    return text;
  });
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function stableRecordId(prefix, idempotencyKey) {
  return `${prefix}_${idempotencyKey.replace(/[^a-zA-Z0-9]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 160)}`;
}

function feedbackDraftError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
