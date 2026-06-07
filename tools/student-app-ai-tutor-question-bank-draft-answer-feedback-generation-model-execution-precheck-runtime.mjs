import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECK_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_answer_feedback_generation_model_execution_precheck_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECK_PORT =
  "StudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheckPort.recordFeedbackGenerationModelExecutionPrecheck";

const inputSchemaVersion = "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck.v1";
const outputSchemaVersion = "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-prechecked.v1";
const sourcePrecheckRuntimeId = "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_runtime";
const sourcePrecheckWorkload = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_RUNTIME";
const precheckedStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECKED";
const modelRoute = "StudentTutorAgent.generate_question_bank_answer_feedback";
const defaultLogPath =
  "reports/student-command-log/student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck.jsonl";

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
  "learnerFeedback",
  "detailedFeedback",
  "publishedAt",
  "publicationStatus",
  "directSql",
  "dbUrl",
  "internalError",
  "errorMessage",
];

export async function recordStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck(input, options = {}) {
  const precheckedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const commandLogPath = options.commandLogPath ?? defaultLogPath;
  const existing = findExistingRecordByIdempotencyKey(commandLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }
  const port = assertPrecheckPort(options.feedbackGenerationModelExecutionPrecheckPort);
  const portResult = await port.recordFeedbackGenerationModelExecutionPrecheck(buildPortRequest(normalized));
  const recorded = assertPortResult(portResult, normalized);
  const record = buildRecord(normalized, recorded, precheckedAt);
  appendRecord(commandLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck(result) {
  return [
    `Student App AI Tutor question-bank feedback generation model execution precheck: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Submission: ${result.feedbackGenerationModelPrecheck.submissionId}`,
    `Route: ${result.feedbackGenerationModelPrecheck.modelRoute}`,
    `Model started: ${result.boundary.modelInferenceStarted}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const precheckInvocationId = requireToken(input.precheckInvocationId, "input.precheckInvocationId", "feedback_generation_model_precheck_");
  const feedbackPublicationPrecheckReport = assertFeedbackPublicationPrecheckReport(input.feedbackPublicationPrecheckReport);
  const sourcePrecheckResult = assertFeedbackPublicationPrecheckResult(feedbackPublicationPrecheckReport);
  const principal = assertPrincipal(input.principal);
  const approval = assertApproval(input.approval, sourcePrecheckResult);
  const modelExecutionPolicy = assertModelExecutionPolicy(input.modelExecutionPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 3, 420);
  for (const required of [
    "answer-feedback-publication-precheck",
    "answer-scoring-result-persistence-bridge",
    "feedback-generation-model-execution-approval",
  ]) {
    if (!evidenceRefs.some((ref) => ref.includes(required))) {
      throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_FEEDBACK_GENERATION_MODEL_PRECHECK_MISSING_EVIDENCE", `${required} evidence ref is required`);
    }
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 420);
  const inputHash = hashInput({
    precheckInvocationId,
    sourceRecordId: sourcePrecheckResult.recordId,
    submissionId: sourcePrecheckResult.studentScoringResult.submissionId,
    requestId: sourcePrecheckResult.studentScoringResult.requestId,
    approvalId: approval.approvalId,
    modelExecutionPolicy,
  });
  return {
    precheckInvocationId,
    feedbackPublicationPrecheckReport,
    sourcePrecheckResult,
    principal,
    approval,
    modelExecutionPolicy,
    evidenceRefs,
    idempotencyKey,
    inputHash,
  };
}

function assertFeedbackPublicationPrecheckReport(report) {
  rejectLeakedFields(report, "input.feedbackPublicationPrecheckReport");
  assertPlainObject(report, "input.feedbackPublicationPrecheckReport");
  requireConst(report.readiness, "READY", "input.feedbackPublicationPrecheckReport.readiness");
  requireConst(report.workloadType, sourcePrecheckWorkload, "input.feedbackPublicationPrecheckReport.workloadType");
  requireConst(report.runtime?.runtimeId, sourcePrecheckRuntimeId, "input.feedbackPublicationPrecheckReport.runtime.runtimeId");
  requireConst(report.runtime?.decision, "BLOCK_UNTIL_REVIEWED_FEEDBACK", "input.feedbackPublicationPrecheckReport.runtime.decision");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.feedbackPublicationPrecheckReport.runtimeSlo.totalErrors");
  const invariants = report.safetyInvariants ?? {};
  for (const field of ["scoringResultPersistenceRequired", "safeStudentResultRequired", "humanReviewRequired", "feedbackArtifactRequired"]) {
    requireConst(invariants[field], true, `input.feedbackPublicationPrecheckReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "studentVisibleFeedbackAllowed",
    "answerKeyDisclosureAllowed",
    "workerMetadataDisclosureAllowed",
    "rawModelOutputDisclosureAllowed",
    "resultRefDisclosureAllowed",
    "modelInferenceAllowed",
  ]) {
    requireConst(invariants[field], false, `input.feedbackPublicationPrecheckReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertFeedbackPublicationPrecheckResult(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationPrecheck?.result;
  rejectLeakedFields(result, "source.feedbackPublicationPrecheckResult");
  assertPlainObject(result, "source.feedbackPublicationPrecheckResult");
  requireConst(result.runtimeId, sourcePrecheckRuntimeId, "source.feedbackPublicationPrecheckResult.runtimeId");
  requireConst(result.precheckDecision?.feedbackPublicationDecision, "BLOCK_UNTIL_REVIEWED_FEEDBACK", "source.feedbackPublicationPrecheckResult.precheckDecision.feedbackPublicationDecision");
  requireConst(result.precheckDecision?.scoringResultPersistenceVerified, true, "source.feedbackPublicationPrecheckResult.precheckDecision.scoringResultPersistenceVerified");
  requireConst(result.precheckDecision?.safeStudentResultVerified, true, "source.feedbackPublicationPrecheckResult.precheckDecision.safeStudentResultVerified");
  requireConst(result.boundary?.feedbackPublicationPrecheckOnly, true, "source.feedbackPublicationPrecheckResult.boundary.feedbackPublicationPrecheckOnly");
  requireConst(result.boundary?.feedbackGenerated, false, "source.feedbackPublicationPrecheckResult.boundary.feedbackGenerated");
  requireConst(result.boundary?.studentVisibleFeedbackPublished, false, "source.feedbackPublicationPrecheckResult.boundary.studentVisibleFeedbackPublished");
  requireConst(result.boundary?.modelInferenceStarted, false, "source.feedbackPublicationPrecheckResult.boundary.modelInferenceStarted");
  const scoring = assertStudentScoringResult(result.studentScoringResult);
  return {
    recordId: requireBoundedString(result.recordId, "source.feedbackPublicationPrecheckResult.recordId", 1, 420),
    precheckInvocationId: requireToken(result.precheckInvocationId, "source.feedbackPublicationPrecheckResult.precheckInvocationId", "feedback_pub_precheck_"),
    sourceScoringResultPersistenceBridge: assertSourceScoringResultPersistenceBridge(result.sourceScoringResultPersistenceBridge, scoring),
    studentScoringResult: scoring,
    evidenceRefs: uniqueStringArray(result.evidenceRefs ?? [], "source.feedbackPublicationPrecheckResult.evidenceRefs", 1, 160),
  };
}

function assertSourceScoringResultPersistenceBridge(source, scoring) {
  rejectLeakedFields(source, "source.feedbackPublicationPrecheckResult.sourceScoringResultPersistenceBridge");
  assertPlainObject(source, "source.feedbackPublicationPrecheckResult.sourceScoringResultPersistenceBridge");
  return {
    runtimeId: requireConst(source.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_scoring_result_persistence_bridge_runtime", "source.feedbackPublicationPrecheckResult.sourceScoringResultPersistenceBridge.runtimeId"),
    recordId: requireBoundedString(source.recordId, "source.feedbackPublicationPrecheckResult.sourceScoringResultPersistenceBridge.recordId", 1, 420),
    requestId: requireConst(source.requestId, scoring.requestId, "source.feedbackPublicationPrecheckResult.sourceScoringResultPersistenceBridge.requestId"),
    submissionId: requireConst(source.submissionId, scoring.submissionId, "source.feedbackPublicationPrecheckResult.sourceScoringResultPersistenceBridge.submissionId"),
  };
}

function assertStudentScoringResult(result) {
  rejectLeakedFields(result, "source.feedbackPublicationPrecheckResult.studentScoringResult");
  assertPlainObject(result, "source.feedbackPublicationPrecheckResult.studentScoringResult");
  return {
    submissionId: requireToken(result.submissionId, "source.studentScoringResult.submissionId", "qbank_ans_sub_"),
    requestId: requireToken(result.requestId, "source.studentScoringResult.requestId", "grading_req_"),
    questionBankDraftRef: requireQuestionBankDraftRef(result.questionBankDraftRef, "source.studentScoringResult.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireToken(result.tutoringAnalysisRequestId, "source.studentScoringResult.tutoringAnalysisRequestId", "tutor_req_"),
    archiveItemId: requireToken(result.archiveItemId, "source.studentScoringResult.archiveItemId", "tarch_"),
    status: requireConst(result.status, "SUCCEEDED", "source.studentScoringResult.status"),
    scoreSummary: requireSafeText(result.scoreSummary, "source.studentScoringResult.scoreSummary", 1, 2000),
    requestedAt: requireIsoString(result.requestedAt, "source.studentScoringResult.requestedAt"),
    completedAt: requireIsoString(result.completedAt, "source.studentScoringResult.completedAt"),
    updatedAt: requireIsoString(result.updatedAt, "source.studentScoringResult.updatedAt"),
  };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 4, 18);
  for (const scope of ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT", "FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECK_APPROVE"]) {
    if (!scopes.includes(scope)) throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_FEEDBACK_GENERATION_MODEL_PRECHECK_SCOPE_MISSING", `input.principal.scopes must include ${scope}`);
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

function assertApproval(approval, source) {
  rejectLeakedFields(approval, "input.approval");
  assertPlainObject(approval, "input.approval");
  const reviewerRole = requireBoundedString(approval.reviewerRole, "input.approval.reviewerRole", 1, 32);
  if (!["TEACHER", "ADMIN"].includes(reviewerRole)) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_FEEDBACK_GENERATION_MODEL_PRECHECK_APPROVER_ROLE", "approval reviewer must be TEACHER or ADMIN");
  }
  return {
    approvalId: requireToken(approval.approvalId, "input.approval.approvalId", "feedback_generation_model_approval_"),
    reviewerPrincipalId: requireBoundedString(approval.reviewerPrincipalId, "input.approval.reviewerPrincipalId", 1, 128),
    reviewerRole,
    approved: requireConst(approval.approved, true, "input.approval.approved"),
    approvalScope: requireConst(approval.approvalScope, "FEEDBACK_GENERATION_MODEL_QUEUE_ONLY", "input.approval.approvalScope"),
    modelRoute: requireConst(approval.modelRoute, modelRoute, "input.approval.modelRoute"),
    requestId: requireConst(approval.requestId, source.studentScoringResult.requestId, "input.approval.requestId"),
    submissionId: requireConst(approval.submissionId, source.studentScoringResult.submissionId, "input.approval.submissionId"),
    approvedAt: requireIsoString(approval.approvedAt, "input.approval.approvedAt"),
    allowsStudentVisiblePublication: requireConst(approval.allowsStudentVisiblePublication, false, "input.approval.allowsStudentVisiblePublication"),
    allowsAnswerKeyDisclosure: requireConst(approval.allowsAnswerKeyDisclosure, false, "input.approval.allowsAnswerKeyDisclosure"),
  };
}

function assertModelExecutionPolicy(policy) {
  assertPlainObject(policy, "input.modelExecutionPolicy");
  for (const field of [
    "feedbackGenerationModelPrecheckOnly",
    "feedbackGenerationQueueAdmissionOnly",
    "futureFeedbackDraftGenerationApproved",
    "scoringResultPersistenceRequired",
    "safeStudentResultRequired",
    "humanReviewRequiredAfterGeneration",
  ]) requireConst(policy[field], true, `input.modelExecutionPolicy.${field}`);
  for (const field of [
    "modelInferenceStarted",
    "feedbackDraftGenerated",
    "reviewedFeedbackArtifactRecorded",
    "studentVisiblePublicationAllowed",
    "answerKeyDisclosureAllowed",
    "rawModelOutputPersistenceAllowed",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) requireConst(policy[field], false, `input.modelExecutionPolicy.${field}`);
  return {
    feedbackGenerationModelPrecheckOnly: true,
    feedbackGenerationQueueAdmissionOnly: true,
    futureFeedbackDraftGenerationApproved: true,
    scoringResultPersistenceRequired: true,
    safeStudentResultRequired: true,
    humanReviewRequiredAfterGeneration: true,
    modelRoute: requireConst(policy.modelRoute, modelRoute, "input.modelExecutionPolicy.modelRoute"),
    maxPromptTokens: requireIntegerBetween(policy.maxPromptTokens, "input.modelExecutionPolicy.maxPromptTokens", 1, 12000),
    maxCompletionTokens: requireIntegerBetween(policy.maxCompletionTokens, "input.modelExecutionPolicy.maxCompletionTokens", 1, 4000),
  };
}

function buildPortRequest(normalized) {
  const scoring = normalized.sourcePrecheckResult.studentScoringResult;
  return {
    precheckInvocationId: normalized.precheckInvocationId,
    modelRoute,
    requestId: scoring.requestId,
    submissionId: scoring.submissionId,
    questionBankDraftRef: scoring.questionBankDraftRef,
    tutoringAnalysisRequestId: scoring.tutoringAnalysisRequestId,
    archiveItemId: scoring.archiveItemId,
    sourcePrecheckRecordId: normalized.sourcePrecheckResult.recordId,
    sourceScoringResultPersistenceRecordId: normalized.sourcePrecheckResult.sourceScoringResultPersistenceBridge.recordId,
    queueAdmissionOnly: true,
    modelInferenceStarted: false,
    feedbackDraftGenerated: false,
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
  };
}

function assertPortResult(result, normalized) {
  rejectLeakedFields(result, "feedbackGenerationModelExecutionPrecheckPort.result");
  assertPlainObject(result, "feedbackGenerationModelExecutionPrecheckPort.result");
  const scoring = normalized.sourcePrecheckResult.studentScoringResult;
  return {
    precheckId: requireToken(result.precheckId, "feedbackGenerationModelExecutionPrecheckPort.result.precheckId", "feedback_generation_model_precheck_"),
    queueRef: requireToken(result.queueRef, "feedbackGenerationModelExecutionPrecheckPort.result.queueRef", "feedback_generation_model_queue_"),
    modelRoute: requireConst(result.modelRoute, modelRoute, "feedbackGenerationModelExecutionPrecheckPort.result.modelRoute"),
    requestId: requireConst(result.requestId, scoring.requestId, "feedbackGenerationModelExecutionPrecheckPort.result.requestId"),
    submissionId: requireConst(result.submissionId, scoring.submissionId, "feedbackGenerationModelExecutionPrecheckPort.result.submissionId"),
    status: requireConst(result.status, "FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECKED_NOT_STARTED", "feedbackGenerationModelExecutionPrecheckPort.result.status"),
    queueAdmissionOnly: requireConst(result.queueAdmissionOnly, true, "feedbackGenerationModelExecutionPrecheckPort.result.queueAdmissionOnly"),
    modelInferenceStarted: requireConst(result.modelInferenceStarted, false, "feedbackGenerationModelExecutionPrecheckPort.result.modelInferenceStarted"),
    feedbackDraftGenerated: requireConst(result.feedbackDraftGenerated, false, "feedbackGenerationModelExecutionPrecheckPort.result.feedbackDraftGenerated"),
    studentVisiblePublished: requireConst(result.studentVisiblePublished, false, "feedbackGenerationModelExecutionPrecheckPort.result.studentVisiblePublished"),
  };
}

function buildRecord(normalized, recorded, precheckedAt) {
  const scoring = normalized.sourcePrecheckResult.studentScoringResult;
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECK",
    recordId: stableRecordId("student_app_ai_tutor_question_bank_draft_answer_feedback_generation_model_execution_precheck", normalized.idempotencyKey),
    precheckedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECK_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECK_PORT,
    status: precheckedStatus,
    precheckInvocationId: normalized.precheckInvocationId,
    principal: normalized.principal,
    sourceFeedbackPublicationPrecheck: {
      runtimeId: sourcePrecheckRuntimeId,
      recordId: normalized.sourcePrecheckResult.recordId,
      precheckInvocationId: normalized.sourcePrecheckResult.precheckInvocationId,
    },
    sourceScoringResultPersistenceBridge: normalized.sourcePrecheckResult.sourceScoringResultPersistenceBridge,
    studentScoringResult: scoring,
    approval: normalized.approval,
    feedbackGenerationModelPrecheck: {
      ...recorded,
      questionBankDraftRef: scoring.questionBankDraftRef,
      tutoringAnalysisRequestId: scoring.tutoringAnalysisRequestId,
      archiveItemId: scoring.archiveItemId,
      scoreSummary: scoring.scoreSummary,
    },
    boundary: {
      feedbackPublicationPrecheckVerified: true,
      scoringResultPersistenceVerified: true,
      safeStudentResultOnly: true,
      feedbackGenerationQueueAdmitted: true,
      feedbackGenerationModelPrecheckOnly: true,
      modelInferenceStarted: false,
      feedbackDraftGenerated: false,
      reviewedFeedbackArtifactRecorded: false,
      studentVisibleFeedbackPublished: false,
      answerKeyDisclosed: false,
      workerMetadataDisclosed: false,
      rawModelOutputDisclosed: false,
      resultRefDisclosed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      ...normalized.evidenceRefs,
      ...normalized.sourcePrecheckResult.evidenceRefs,
      `evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck-input-hash:${normalized.inputHash}`,
    ],
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
  };
}

function buildResult(record, { idempotentReplay }) {
  return { ...record, idempotentReplay };
}

function assertPrecheckPort(port) {
  if (!port || typeof port.recordFeedbackGenerationModelExecutionPrecheck !== "function") {
    throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_FEEDBACK_GENERATION_MODEL_PRECHECK_PORT_MISSING", "feedback generation model execution precheck port is required");
  }
  return port;
}

function findExistingRecordByIdempotencyKey(logPath, idempotencyKey) {
  if (!fs.existsSync(logPath)) return null;
  return fs.readFileSync(logPath, "utf8").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line)).find((record) => record.idempotencyKey === idempotencyKey) ?? null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.inputHash !== normalized.inputHash) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_FEEDBACK_GENERATION_MODEL_PRECHECK_IDEMPOTENCY_CONFLICT", "idempotency key already exists with different input hash");
  }
}

function appendRecord(logPath, record) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`);
}

function rejectLeakedFields(value, context) {
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    if (leakedFieldNames.includes(key)) throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_FEEDBACK_GENERATION_MODEL_PRECHECK_LEAKED_FIELD", `${context}.${key} is not allowed`);
  }
}

function assertPlainObject(value, context) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_FEEDBACK_GENERATION_MODEL_PRECHECK_INVALID_OBJECT", `${context} must be an object`);
  }
}

function requireConst(actual, expected, context) {
  if (actual !== expected) throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_FEEDBACK_GENERATION_MODEL_PRECHECK_CONST_MISMATCH", `${context} must be ${expected}`);
  return actual;
}

function requireBoundedString(value, context, min, max) {
  if (typeof value !== "string" || value.length < min || value.length > max) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_FEEDBACK_GENERATION_MODEL_PRECHECK_INVALID_STRING", `${context} must be a string with length ${min}-${max}`);
  }
  return value;
}

function requireToken(value, context, prefix) {
  const token = requireBoundedString(value, context, prefix.length + 1, 420);
  if (!token.startsWith(prefix)) throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_FEEDBACK_GENERATION_MODEL_PRECHECK_INVALID_TOKEN", `${context} must start with ${prefix}`);
  return token;
}

function requireQuestionBankDraftRef(value, context) {
  const ref = requireBoundedString(value, context, 12, 420);
  if (!ref.startsWith("local://question-bank-drafts/")) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_FEEDBACK_GENERATION_MODEL_PRECHECK_INVALID_DRAFT_REF", `${context} must use local question-bank draft ref`);
  }
  return ref;
}

function requireIsoString(value, context) {
  const text = requireBoundedString(value, context, 20, 80);
  if (Number.isNaN(Date.parse(text))) throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_FEEDBACK_GENERATION_MODEL_PRECHECK_INVALID_TIME", `${context} must be an ISO timestamp`);
  return text;
}

function requireSafeText(value, context, min, max) {
  const text = requireBoundedString(value, context, min, max);
  if (/[<>]/u.test(text)) throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_FEEDBACK_GENERATION_MODEL_PRECHECK_UNSAFE_TEXT", `${context} must not contain HTML-like text`);
  return text;
}

function requireIntegerBetween(value, context, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_FEEDBACK_GENERATION_MODEL_PRECHECK_INVALID_INTEGER", `${context} must be an integer ${min}-${max}`);
  }
  return value;
}

function uniqueStringArray(values, context, min, max) {
  if (!Array.isArray(values) || values.length < min || values.length > max) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_FEEDBACK_GENERATION_MODEL_PRECHECK_INVALID_ARRAY", `${context} must contain ${min}-${max} values`);
  }
  const out = [];
  for (const value of values) {
    const text = requireBoundedString(value, context, 1, 900);
    if (!out.includes(text)) out.push(text);
  }
  return out;
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function stableRecordId(prefix, idempotencyKey) {
  return `${prefix}_${idempotencyKey.replace(/[^a-zA-Z0-9]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 160)}`;
}

function precheckError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
