import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_COMMAND_PORT =
  "StudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheckPort.recordFeedbackPublicationPrecheck";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_READY =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_READY";

const inputSchemaVersion = "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-publication-precheck.v2";
const outputSchemaVersion = "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-publication-prechecked.v2";
const scoringResultPersistenceRuntimeId = "student_app_ai_tutor_question_bank_draft_answer_scoring_result_persistence_bridge_runtime";
const scoringResultPersistenceCommandPort = "StudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridgePort.recordAIGradingResult";
const scoringResultPersistenceWorkloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_RUNTIME";
const scoringResultPersistedStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTED";
const blockedStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_BLOCKED_UNTIL_REVIEWED_FEEDBACK";
const defaultCommandLogPath = "reports/student-command-log/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck.jsonl";
const leakedFieldNames = [
  "answerText",
  "expectedAnswer",
  "explanation",
  "resultRef",
  "workerId",
  "claimedByWorkerId",
  "claimExpiresAt",
  "rawModelOutput",
  "modelOutput",
  "feedback",
  "detailedFeedback",
  "publishedAt",
  "publicationStatus",
  "errorMessage",
];

export function recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheck(input, options = {}) {
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

export function formatStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheck(result) {
  return [
    `Student App AI Tutor question-bank draft answer feedback publication precheck: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Submission: ${result.studentScoringResult.submissionId}`,
    `Decision: ${result.precheckDecision.feedbackPublicationDecision}`,
    `Student-visible feedback allowed: ${result.precheckDecision.studentVisibleFeedbackAllowed}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const precheckInvocationId = requireToken(input.precheckInvocationId, "input.precheckInvocationId", "feedback_pub_precheck_");
  const principal = assertStudentPrincipal(input.principal);
  const scoringResultPersistenceBridge = assertScoringResultPersistenceBridgeReport(input.scoringResultPersistenceBridgeReport);
  const studentScoringResult = assertStudentScoringResult(input.studentScoringResult);
  requireConst(studentScoringResult.requestId, scoringResultPersistenceBridge.requestId, "input.studentScoringResult.requestId");
  requireConst(studentScoringResult.submissionId, scoringResultPersistenceBridge.submissionId, "input.studentScoringResult.submissionId");
  const feedbackPublicationPolicy = assertFeedbackPublicationPolicy(input.feedbackPublicationPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 160);
  if (!evidenceRefs.some((ref) => ref.includes("student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge"))) {
    throw precheckError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_PRECHECK_MISSING_PERSISTED_SCORING_EVIDENCE", "scoring result persistence bridge evidence ref is required");
  }
  if (studentScoringResult.status !== "SUCCEEDED") {
    throw precheckError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_PRECHECK_REQUIRES_SUCCEEDED_SCORING", "feedback publication precheck requires a succeeded scoring result");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 260);
  const inputHash = hashInput({
    precheckInvocationId,
    principalId: principal.principalId,
    ownStudentId: principal.studentAccess.ownStudentId,
    persistedScoringResultRecordId: scoringResultPersistenceBridge.recordId,
    submissionId: studentScoringResult.submissionId,
    requestId: studentScoringResult.requestId,
    scoreSummary: studentScoringResult.scoreSummary,
    feedbackPublicationPolicy,
  });
  return {
    precheckInvocationId,
    principal,
    scoringResultPersistenceBridge,
    studentScoringResult,
    feedbackPublicationPolicy,
    evidenceRefs,
    idempotencyKey,
    inputHash,
  };
}

function assertStudentPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const principalId = requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128);
  requireConst(principal.subjectType, "USER", "input.principal.subjectType");
  requireConst(principal.role, "STUDENT", "input.principal.role");
  requireConst(principal.entryPoint, "STUDENT_APP", "input.principal.entryPoint");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  if (!scopes.includes("STUDENT_OWN_READ")) {
    throw precheckError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_PRECHECK_MISSING_SCOPE", "STUDENT_OWN_READ is required");
  }
  assertPlainObject(principal.studentAccess, "input.principal.studentAccess");
  requireConst(principal.studentAccess.mode, "OWN", "input.principal.studentAccess.mode");
  const ownStudentId = requireBoundedString(principal.studentAccess.ownStudentId, "input.principal.studentAccess.ownStudentId", 1, 128);
  return {
    ...principal,
    principalId,
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 128),
    scopes,
    studentAccess: { mode: "OWN", ownStudentId },
  };
}

function assertScoringResultPersistenceBridgeReport(report) {
  rejectLeakedFields(report, "input.scoringResultPersistenceBridgeReport", { allowFields: ["resultRef", "workerId"] });
  assertPlainObject(report, "input.scoringResultPersistenceBridgeReport");
  requireConst(report.readiness, "READY", "input.scoringResultPersistenceBridgeReport.readiness");
  requireConst(report.workloadType, scoringResultPersistenceWorkloadType, "input.scoringResultPersistenceBridgeReport.workloadType");
  assertPlainObject(report.runtime, "input.scoringResultPersistenceBridgeReport.runtime");
  requireConst(report.runtime.runtimeId, scoringResultPersistenceRuntimeId, "input.scoringResultPersistenceBridgeReport.runtime.runtimeId");
  requireConst(report.runtime.commandPort, scoringResultPersistenceCommandPort, "input.scoringResultPersistenceBridgeReport.runtime.commandPort");
  requireConst(report.runtime.targetUseCase, "RecordAIGradingResult.Execute", "input.scoringResultPersistenceBridgeReport.runtime.targetUseCase");
  requireConst(report.runtime.status, scoringResultPersistedStatus, "input.scoringResultPersistenceBridgeReport.runtime.status");
  assertPlainObject(report.safetyInvariants, "input.scoringResultPersistenceBridgeReport.safetyInvariants");
  for (const field of [
    "sourceControlledScoringArtifactRequired",
    "existingRecordAIGradingResultUseCaseRequired",
    "metadataOnlyResultAllowed",
    "recordAIGradingResultUseCaseInvoked",
    "resultPersistenceAllowed",
    "resultPersistenceCommitted",
  ]) {
    requireConst(report.safetyInvariants[field], true, `input.scoringResultPersistenceBridgeReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "answerTextDisclosed",
    "expectedAnswerDisclosed",
    "explanationDisclosed",
    "answerKeyDisclosed",
    "rawModelOutputStored",
    "feedbackGenerationAllowed",
    "studentVisiblePublishAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(report.safetyInvariants[field], false, `input.scoringResultPersistenceBridgeReport.safetyInvariants.${field}`);
  }
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerScoringResultPersistenceBridge?.result;
  rejectLeakedFields(result, "input.scoringResultPersistenceBridgeReport.runtimeProbes.result", { allowFields: ["resultRef", "workerId"] });
  assertPlainObject(result, "input.scoringResultPersistenceBridgeReport.runtimeProbes.result");
  requireConst(result.runtimeId, scoringResultPersistenceRuntimeId, "input.scoringResultPersistenceBridgeReport.runtimeProbes.result.runtimeId");
  requireConst(result.commandPort, scoringResultPersistenceCommandPort, "input.scoringResultPersistenceBridgeReport.runtimeProbes.result.commandPort");
  requireConst(result.status, scoringResultPersistedStatus, "input.scoringResultPersistenceBridgeReport.runtimeProbes.result.status");
  requireConst(result.executionState, "SCORING_RESULT_PERSISTED_VIA_RECORD_AI_GRADING_RESULT", "input.scoringResultPersistenceBridgeReport.runtimeProbes.result.executionState");
  requireConst(result.boundary?.resultPersistenceCommitted, true, "input.scoringResultPersistenceBridgeReport.runtimeProbes.result.boundary.resultPersistenceCommitted");
  requireConst(result.boundary?.feedbackGenerationStarted, false, "input.scoringResultPersistenceBridgeReport.runtimeProbes.result.boundary.feedbackGenerationStarted");
  requireConst(result.boundary?.studentVisiblePublished, false, "input.scoringResultPersistenceBridgeReport.runtimeProbes.result.boundary.studentVisiblePublished");
  requireConst(result.boundary?.answerKeyDisclosed, false, "input.scoringResultPersistenceBridgeReport.runtimeProbes.result.boundary.answerKeyDisclosed");
  requireConst(result.boundary?.rawModelOutputStored, false, "input.scoringResultPersistenceBridgeReport.runtimeProbes.result.boundary.rawModelOutputStored");
  requireConst(result.boundary?.directDatabaseAccessAllowed, false, "input.scoringResultPersistenceBridgeReport.runtimeProbes.result.boundary.directDatabaseAccessAllowed");
  requireConst(result.boundary?.executeHttpRequestAllowed, false, "input.scoringResultPersistenceBridgeReport.runtimeProbes.result.boundary.executeHttpRequestAllowed");
  requireConst(result.boundary?.swarmAllowed, false, "input.scoringResultPersistenceBridgeReport.runtimeProbes.result.boundary.swarmAllowed");
  assertPlainObject(result.sourceControlledScoringArtifact, "input.scoringResultPersistenceBridgeReport.runtimeProbes.result.sourceControlledScoringArtifact");
  assertPlainObject(result.persistedAIGradingResult, "input.scoringResultPersistenceBridgeReport.runtimeProbes.result.persistedAIGradingResult");
  requireConst(result.persistedAIGradingResult.status, "SUCCEEDED", "input.scoringResultPersistenceBridgeReport.runtimeProbes.result.persistedAIGradingResult.status");
  requireConst(result.persistedAIGradingResult.resultPersistenceCommitted, true, "input.scoringResultPersistenceBridgeReport.runtimeProbes.result.persistedAIGradingResult.resultPersistenceCommitted");
  requireConst(result.persistedAIGradingResult.feedbackGenerationStarted, false, "input.scoringResultPersistenceBridgeReport.runtimeProbes.result.persistedAIGradingResult.feedbackGenerationStarted");
  requireConst(result.persistedAIGradingResult.studentVisiblePublished, false, "input.scoringResultPersistenceBridgeReport.runtimeProbes.result.persistedAIGradingResult.studentVisiblePublished");
  return {
    recordId: requireBoundedString(result.recordId, "input.scoringResultPersistenceBridgeReport.runtimeProbes.result.recordId", 1, 420),
    requestId: requireToken(result.persistedAIGradingResult.requestId, "input.scoringResultPersistenceBridgeReport.runtimeProbes.result.persistedAIGradingResult.requestId", "grading_req_"),
    submissionId: requireToken(result.sourceControlledScoringArtifact.submissionId, "input.scoringResultPersistenceBridgeReport.runtimeProbes.result.sourceControlledScoringArtifact.submissionId", "qbank_ans_sub_"),
  };
}

function assertStudentScoringResult(result) {
  rejectLeakedFields(result, "input.studentScoringResult");
  assertPlainObject(result, "input.studentScoringResult");
  const normalized = {
    submissionId: requireToken(result.submissionId, "input.studentScoringResult.submissionId", "qbank_ans_sub_"),
    requestId: requireToken(result.requestId, "input.studentScoringResult.requestId", "grading_req_"),
    questionBankDraftRef: requireQuestionBankDraftRef(result.questionBankDraftRef, "input.studentScoringResult.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireToken(result.tutoringAnalysisRequestId, "input.studentScoringResult.tutoringAnalysisRequestId", "tutor_req_"),
    archiveItemId: requireToken(result.archiveItemId, "input.studentScoringResult.archiveItemId", "tarch_"),
    status: requireBoundedString(result.status, "input.studentScoringResult.status", 1, 32),
    scoreSummary: "",
    errorCode: "",
    requestedAt: requireIsoString(result.requestedAt, "input.studentScoringResult.requestedAt"),
    completedAt: requireIsoString(result.completedAt, "input.studentScoringResult.completedAt"),
    updatedAt: requireIsoString(result.updatedAt, "input.studentScoringResult.updatedAt"),
  };
  if (normalized.status === "SUCCEEDED") {
    normalized.scoreSummary = requireBoundedString(result.scoreSummary, "input.studentScoringResult.scoreSummary", 1, 2000);
  } else if (normalized.status === "FAILED") {
    normalized.errorCode = requireBoundedString(result.errorCode, "input.studentScoringResult.errorCode", 1, 128);
  } else {
    throw precheckError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_PRECHECK_UNSUPPORTED_STATUS", "student scoring result must be SUCCEEDED or FAILED");
  }
  return normalized;
}

function assertFeedbackPublicationPolicy(policy) {
  assertPlainObject(policy, "input.feedbackPublicationPolicy");
  requireConst(policy.feedbackPublicationPrecheckOnly, true, "input.feedbackPublicationPolicy.feedbackPublicationPrecheckOnly");
  requireConst(policy.scoringResultPersistenceRequired, true, "input.feedbackPublicationPolicy.scoringResultPersistenceRequired");
  requireConst(policy.safeStudentResultRequired, true, "input.feedbackPublicationPolicy.safeStudentResultRequired");
  requireConst(policy.humanReviewRequired, true, "input.feedbackPublicationPolicy.humanReviewRequired");
  requireConst(policy.feedbackArtifactRequired, true, "input.feedbackPublicationPolicy.feedbackArtifactRequired");
  requireConst(policy.detailedFeedbackAvailable, false, "input.feedbackPublicationPolicy.detailedFeedbackAvailable");
  requireConst(policy.publicationApproved, false, "input.feedbackPublicationPolicy.publicationApproved");
  for (const field of [
    "studentVisibleFeedbackAllowed",
    "answerKeyDisclosureAllowed",
    "workerMetadataDisclosureAllowed",
    "rawModelOutputDisclosureAllowed",
    "resultRefDisclosureAllowed",
    "modelInferenceAllowed",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.feedbackPublicationPolicy.${field}`);
  }
  return { ...policy };
}

function buildPrecheckRecord(normalized, checkedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK",
    recordId: `student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_${safeToken(normalized.idempotencyKey)}`,
    checkedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_COMMAND_PORT,
    status: blockedStatus,
    precheckInvocationId: normalized.precheckInvocationId,
    principal: normalized.principal,
    sourceScoringResultPersistenceBridge: {
      runtimeId: scoringResultPersistenceRuntimeId,
      recordId: normalized.scoringResultPersistenceBridge.recordId,
      requestId: normalized.scoringResultPersistenceBridge.requestId,
      submissionId: normalized.scoringResultPersistenceBridge.submissionId,
    },
    studentScoringResult: normalized.studentScoringResult,
    precheckDecision: {
      feedbackPublicationDecision: "BLOCK_UNTIL_REVIEWED_FEEDBACK",
      scoringResultPersistenceVerified: true,
      safeStudentResultVerified: true,
      humanReviewRequired: true,
      feedbackArtifactRequired: true,
      detailedFeedbackAvailable: false,
      publicationApproved: false,
      studentVisibleFeedbackAllowed: false,
      reason: "Question-bank answer scoring result is persisted, but reviewed feedback artifacts and publication approval are not present.",
    },
    boundary: {
      ownStudentOnly: true,
      scoringResultPersistenceVerified: true,
      safeStudentResultOnly: true,
      feedbackPublicationPrecheckOnly: true,
      feedbackGenerated: false,
      humanReviewCompleted: false,
      studentVisibleFeedbackPublished: false,
      answerKeyDisclosed: false,
      workerMetadataDisclosed: false,
      rawModelOutputDisclosed: false,
      resultRefDisclosed: false,
      modelInferenceStarted: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: normalized.evidenceRefs,
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
  };
}

function buildResult(record, replay) {
  return { ...record, ...replay };
}

function appendRecord(commandLogPath, record) {
  fs.mkdirSync(path.dirname(commandLogPath), { recursive: true });
  fs.appendFileSync(commandLogPath, `${JSON.stringify(record)}\n`);
}

function findExistingRecordByIdempotencyKey(commandLogPath, idempotencyKey) {
  if (!fs.existsSync(commandLogPath)) return null;
  const lines = fs.readFileSync(commandLogPath, "utf8").split(/\r?\n/u).filter(Boolean);
  for (const line of lines) {
    const record = JSON.parse(line);
    if (record.idempotencyKey === idempotencyKey) return record;
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.inputHash !== normalized.inputHash) {
    throw precheckError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_PRECHECK_IDEMPOTENCY_CONFLICT", "idempotency key already exists with different input");
  }
}

function rejectLeakedFields(value, label, options = {}) {
  if (!value || typeof value !== "object") return;
  const allowedFields = new Set(options.allowFields ?? []);
  const keys = collectKeys(value);
  for (const field of leakedFieldNames) {
    if (keys.has(field) && !allowedFields.has(field)) {
      throw precheckError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_PRECHECK_LEAKED_FIELD", `${label}.${field} is not allowed`);
    }
  }
}

function collectKeys(value, keys = new Set()) {
  if (!value || typeof value !== "object") return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.add(key);
    collectKeys(child, keys);
  }
  return keys;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw precheckError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_PRECHECK_INVALID_OBJECT", `${label} must be an object`);
  }
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw precheckError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_PRECHECK_CONST", `${label} must be ${String(expected)}`);
  }
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string") {
    throw precheckError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_PRECHECK_STRING", `${label} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw precheckError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_PRECHECK_STRING_LENGTH", `${label} length is invalid`);
  }
  return trimmed;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 260);
  if (!token.startsWith(prefix)) {
    throw precheckError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_PRECHECK_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireQuestionBankDraftRef(value, label) {
  const ref = requireBoundedString(value, label, 1, 1000);
  if (!ref.startsWith("local://question-bank-drafts/")) {
    throw precheckError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_PRECHECK_DRAFT_REF", `${label} must be a local question-bank draft ref`);
  }
  return ref;
}

function requireIsoString(value, label) {
  const text = requireBoundedString(value, label, 20, 80);
  if (Number.isNaN(Date.parse(text))) {
    throw precheckError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_PRECHECK_TIME", `${label} must be an ISO timestamp`);
  }
  return text;
}

function uniqueStringArray(values, label, min, max) {
  if (!Array.isArray(values)) {
    throw precheckError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_PRECHECK_ARRAY", `${label} must be an array`);
  }
  const normalized = [...new Set(values.map((value, index) =>
    requireBoundedString(value, `${label}[${index}]`, 1, max),
  ))];
  if (normalized.length < min) {
    throw precheckError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_PRECHECK_ARRAY_LENGTH", `${label} must contain at least ${min} item`);
  }
  return normalized;
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeToken(value) {
  return value.replace(/[^a-zA-Z0-9]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 180);
}

function precheckError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
