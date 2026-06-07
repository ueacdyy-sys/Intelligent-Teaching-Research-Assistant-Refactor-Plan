import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_COMMAND_PORT =
  "StudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactPort.recordReviewedFeedbackArtifact";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_READY =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_READY";

const inputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact.v1";
const outputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-recorded.v1";
const precheckRuntimeId = "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_runtime";
const precheckWorkloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_RUNTIME";
const statusReadyNotPublished = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_READY_NOT_PUBLISHED";
const defaultCommandLogPath = "reports/student-command-log/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact.jsonl";
const leakedFieldNames = [
  "answerText",
  "answerKey",
  "correctAnswer",
  "expectedAnswer",
  "explanation",
  "resultRef",
  "workerId",
  "claimedByWorkerId",
  "claimExpiresAt",
  "rawModelOutput",
  "modelOutput",
  "internalError",
  "errorMessage",
  "publishedAt",
  "publicationStatus",
];

export function recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact(input, options = {}) {
  const reviewedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const commandLogPath = options.commandLogPath ?? defaultCommandLogPath;
  const existing = findExistingRecordByIdempotencyKey(commandLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const record = buildRecord(normalized, reviewedAt);
  appendRecord(commandLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact(result) {
  return [
    `Student App AI Tutor question-bank draft answer reviewed feedback artifact: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Artifact: ${result.reviewedFeedbackArtifact.artifactId}`,
    `Submission: ${result.reviewedFeedbackArtifact.submissionId}`,
    `Student-visible feedback published: ${result.boundary.studentVisibleFeedbackPublished}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const reviewInvocationId = requireToken(input.reviewInvocationId, "input.reviewInvocationId", "feedback_artifact_review_");
  const principal = assertReviewerPrincipal(input.principal);
  const precheckReport = assertPrecheckReport(input.feedbackPublicationPrecheckReport);
  const precheckResult = assertPrecheckResult(precheckReport);
  const artifact = assertReviewedFeedbackArtifact(input.reviewedFeedbackArtifact, principal, precheckResult);
  const policy = assertArtifactPolicy(input.feedbackArtifactPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 160);
  if (!evidenceRefs.some((ref) => ref.includes("student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck"))) {
    throw artifactError("STUDENT_APP_AI_TUTOR_REVIEWED_FEEDBACK_ARTIFACT_MISSING_PRECHECK_EVIDENCE", "feedback publication precheck evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 260);
  const inputHash = hashInput({
    reviewInvocationId,
    reviewerPrincipalId: principal.principalId,
    precheckRecordId: precheckResult.recordId,
    artifact,
    policy,
  });
  return {
    reviewInvocationId,
    principal,
    precheckReport,
    precheckResult,
    artifact,
    policy,
    evidenceRefs,
    idempotencyKey,
    inputHash,
  };
}

function assertReviewerPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const principalId = requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128);
  requireConst(principal.subjectType, "USER", "input.principal.subjectType");
  const role = requireEnum(principal.role, "input.principal.role", ["TEACHER", "ADMIN"]);
  const entryPoint = requireEnum(principal.entryPoint, "input.principal.entryPoint", ["DESKTOP_TEACHER", "ADMIN_CONSOLE"]);
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  if (role === "TEACHER" && !scopes.includes("TEACHING_READ")) {
    throw artifactError("STUDENT_APP_AI_TUTOR_REVIEWED_FEEDBACK_ARTIFACT_MISSING_SCOPE", "TEACHING_READ is required");
  }
  if (!scopes.includes("FEEDBACK_REVIEW") && !scopes.includes("ADMIN_SYSTEM")) {
    throw artifactError("STUDENT_APP_AI_TUTOR_REVIEWED_FEEDBACK_ARTIFACT_MISSING_SCOPE", "FEEDBACK_REVIEW or ADMIN_SYSTEM is required");
  }
  return {
    principalId,
    subjectType: "USER",
    role,
    entryPoint,
    scopes,
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 128),
  };
}

function assertPrecheckReport(report) {
  rejectLeakedFields(report, "input.feedbackPublicationPrecheckReport");
  assertPlainObject(report, "input.feedbackPublicationPrecheckReport");
  requireConst(report.readiness, "READY", "input.feedbackPublicationPrecheckReport.readiness");
  requireConst(report.workloadType, precheckWorkloadType, "input.feedbackPublicationPrecheckReport.workloadType");
  assertPlainObject(report.runtime, "input.feedbackPublicationPrecheckReport.runtime");
  requireConst(report.runtime.runtimeId, precheckRuntimeId, "input.feedbackPublicationPrecheckReport.runtime.runtimeId");
  requireConst(report.runtime.decision, "BLOCK_UNTIL_REVIEWED_FEEDBACK", "input.feedbackPublicationPrecheckReport.runtime.decision");
  assertPlainObject(report.safetyInvariants, "input.feedbackPublicationPrecheckReport.safetyInvariants");
  for (const field of [
    "scoringResultPersistenceRequired",
    "safeStudentResultRequired",
    "humanReviewRequired",
    "feedbackArtifactRequired",
  ]) {
    requireConst(report.safetyInvariants[field], true, `input.feedbackPublicationPrecheckReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "studentVisibleFeedbackAllowed",
    "answerKeyDisclosureAllowed",
    "workerMetadataDisclosureAllowed",
    "rawModelOutputDisclosureAllowed",
    "resultRefDisclosureAllowed",
    "modelInferenceAllowed",
  ]) {
    requireConst(report.safetyInvariants[field], false, `input.feedbackPublicationPrecheckReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertPrecheckResult(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationPrecheck?.result;
  rejectLeakedFields(result, "input.feedbackPublicationPrecheckReport.runtimeProbes.result");
  assertPlainObject(result, "input.feedbackPublicationPrecheckReport.runtimeProbes.result");
  requireConst(result.runtimeId, precheckRuntimeId, "input.feedbackPublicationPrecheckReport.runtimeProbes.result.runtimeId");
  requireConst(result.precheckDecision?.feedbackPublicationDecision, "BLOCK_UNTIL_REVIEWED_FEEDBACK", "input.feedbackPublicationPrecheckReport.runtimeProbes.result.precheckDecision.feedbackPublicationDecision");
  requireConst(result.precheckDecision?.studentVisibleFeedbackAllowed, false, "input.feedbackPublicationPrecheckReport.runtimeProbes.result.precheckDecision.studentVisibleFeedbackAllowed");
  requireConst(result.boundary?.feedbackPublicationPrecheckOnly, true, "input.feedbackPublicationPrecheckReport.runtimeProbes.result.boundary.feedbackPublicationPrecheckOnly");
  requireConst(result.boundary?.studentVisibleFeedbackPublished, false, "input.feedbackPublicationPrecheckReport.runtimeProbes.result.boundary.studentVisibleFeedbackPublished");
  const scoring = assertStudentScoringResult(result.studentScoringResult);
  return {
    recordId: requireBoundedString(result.recordId, "input.feedbackPublicationPrecheckReport.runtimeProbes.result.recordId", 1, 260),
    precheckInvocationId: requireToken(result.precheckInvocationId, "input.feedbackPublicationPrecheckReport.runtimeProbes.result.precheckInvocationId", "feedback_pub_precheck_"),
    studentScoringResult: scoring,
    evidenceRefs: uniqueStringArray(result.evidenceRefs, "input.feedbackPublicationPrecheckReport.runtimeProbes.result.evidenceRefs", 1, 160),
  };
}

function assertStudentScoringResult(result) {
  rejectLeakedFields(result, "studentScoringResult");
  assertPlainObject(result, "studentScoringResult");
  const normalized = {
    submissionId: requireToken(result.submissionId, "studentScoringResult.submissionId", "qbank_ans_sub_"),
    requestId: requireToken(result.requestId, "studentScoringResult.requestId", "grading_req_"),
    questionBankDraftRef: requireQuestionBankDraftRef(result.questionBankDraftRef, "studentScoringResult.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireToken(result.tutoringAnalysisRequestId, "studentScoringResult.tutoringAnalysisRequestId", "tutor_req_"),
    archiveItemId: requireToken(result.archiveItemId, "studentScoringResult.archiveItemId", "tarch_"),
    status: requireConst(result.status, "SUCCEEDED", "studentScoringResult.status"),
    scoreSummary: requireSafeText(result.scoreSummary, "studentScoringResult.scoreSummary", 1, 2000),
    requestedAt: requireIsoString(result.requestedAt, "studentScoringResult.requestedAt"),
    completedAt: requireIsoString(result.completedAt, "studentScoringResult.completedAt"),
    updatedAt: requireIsoString(result.updatedAt, "studentScoringResult.updatedAt"),
  };
  return normalized;
}

function assertReviewedFeedbackArtifact(artifact, principal, precheckResult) {
  rejectLeakedFields(artifact, "input.reviewedFeedbackArtifact");
  assertPlainObject(artifact, "input.reviewedFeedbackArtifact");
  const scoring = precheckResult.studentScoringResult;
  requireConst(artifact.artifactKind, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_ANSWER_REVIEWED_FEEDBACK", "input.reviewedFeedbackArtifact.artifactKind");
  requireConst(artifact.submissionId, scoring.submissionId, "input.reviewedFeedbackArtifact.submissionId");
  requireConst(artifact.requestId, scoring.requestId, "input.reviewedFeedbackArtifact.requestId");
  requireConst(artifact.questionBankDraftRef, scoring.questionBankDraftRef, "input.reviewedFeedbackArtifact.questionBankDraftRef");
  requireConst(artifact.tutoringAnalysisRequestId, scoring.tutoringAnalysisRequestId, "input.reviewedFeedbackArtifact.tutoringAnalysisRequestId");
  requireConst(artifact.archiveItemId, scoring.archiveItemId, "input.reviewedFeedbackArtifact.archiveItemId");
  requireConst(artifact.audience, "STUDENT_APP_LEARNING_SUPPORT", "input.reviewedFeedbackArtifact.audience");
  requireConst(artifact.visibilityState, "REVIEWED_NOT_PUBLISHED", "input.reviewedFeedbackArtifact.visibilityState");
  requireConst(artifact.publicationApproved, false, "input.reviewedFeedbackArtifact.publicationApproved");
  requireConst(artifact.studentVisibleFeedbackPublished, false, "input.reviewedFeedbackArtifact.studentVisibleFeedbackPublished");
  const review = assertReview(artifact.review, principal);
  const learnerFeedback = assertLearnerFeedback(artifact.learnerFeedback);
  return {
    artifactId: requireToken(artifact.artifactId, "input.reviewedFeedbackArtifact.artifactId", "feedback_artifact_"),
    artifactKind: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_ANSWER_REVIEWED_FEEDBACK",
    submissionId: scoring.submissionId,
    requestId: scoring.requestId,
    questionBankDraftRef: scoring.questionBankDraftRef,
    tutoringAnalysisRequestId: scoring.tutoringAnalysisRequestId,
    archiveItemId: scoring.archiveItemId,
    audience: "STUDENT_APP_LEARNING_SUPPORT",
    visibilityState: "REVIEWED_NOT_PUBLISHED",
    scoreSummary: scoring.scoreSummary,
    learnerFeedback,
    review,
    publicationApproved: false,
    studentVisibleFeedbackPublished: false,
  };
}

function assertReview(review, principal) {
  assertPlainObject(review, "input.reviewedFeedbackArtifact.review");
  requireConst(review.reviewerPrincipalId, principal.principalId, "input.reviewedFeedbackArtifact.review.reviewerPrincipalId");
  for (const field of [
    "humanReviewed",
    "ageAppropriate",
    "studentOwnScopeConfirmed",
    "answerKeyRemoved",
    "workerMetadataRemoved",
    "rawModelOutputRemoved",
    "internalErrorsRemoved",
    "publicationApprovalRequired",
  ]) {
    requireConst(review[field], true, `input.reviewedFeedbackArtifact.review.${field}`);
  }
  requireConst(review.publicationApproved, false, "input.reviewedFeedbackArtifact.review.publicationApproved");
  return {
    reviewId: requireToken(review.reviewId, "input.reviewedFeedbackArtifact.review.reviewId", "feedback_review_"),
    reviewerPrincipalId: principal.principalId,
    reviewedAt: requireIsoString(review.reviewedAt, "input.reviewedFeedbackArtifact.review.reviewedAt"),
    humanReviewed: true,
    ageAppropriate: true,
    studentOwnScopeConfirmed: true,
    answerKeyRemoved: true,
    workerMetadataRemoved: true,
    rawModelOutputRemoved: true,
    internalErrorsRemoved: true,
    publicationApprovalRequired: true,
    publicationApproved: false,
  };
}

function assertLearnerFeedback(feedback) {
  assertPlainObject(feedback, "input.reviewedFeedbackArtifact.learnerFeedback");
  return {
    summary: requireSafeText(feedback.summary, "input.reviewedFeedbackArtifact.learnerFeedback.summary", 1, 1200),
    encouragement: requireSafeText(feedback.encouragement, "input.reviewedFeedbackArtifact.learnerFeedback.encouragement", 1, 600),
    nextSteps: uniqueSafeTextArray(feedback.nextSteps, "input.reviewedFeedbackArtifact.learnerFeedback.nextSteps", 1, 8, 1, 500),
    misconceptionTags: uniqueSafeTextArray(feedback.misconceptionTags ?? [], "input.reviewedFeedbackArtifact.learnerFeedback.misconceptionTags", 0, 12, 1, 80),
    practiceSuggestions: uniqueSafeTextArray(feedback.practiceSuggestions ?? [], "input.reviewedFeedbackArtifact.learnerFeedback.practiceSuggestions", 0, 8, 1, 300),
  };
}

function assertArtifactPolicy(policy) {
  assertPlainObject(policy, "input.feedbackArtifactPolicy");
  for (const field of [
    "feedbackPublicationPrecheckRequired",
    "safeStudentResultRequired",
    "humanReviewRequired",
    "feedbackArtifactAllowed",
    "publicationApprovalRequired",
  ]) {
    requireConst(policy[field], true, `input.feedbackArtifactPolicy.${field}`);
  }
  for (const field of [
    "studentVisibleFeedbackAllowed",
    "publicationApproved",
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
    requireConst(policy[field], false, `input.feedbackArtifactPolicy.${field}`);
  }
  return { ...policy };
}

function buildRecord(normalized, reviewedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT",
    recordId: `student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_${safeToken(normalized.idempotencyKey)}`,
    reviewedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_COMMAND_PORT,
    status: statusReadyNotPublished,
    reviewInvocationId: normalized.reviewInvocationId,
    principal: normalized.principal,
    sourcePrecheck: {
      runtimeId: precheckRuntimeId,
      recordId: normalized.precheckResult.recordId,
      precheckInvocationId: normalized.precheckResult.precheckInvocationId,
    },
    reviewedFeedbackArtifact: normalized.artifact,
    boundary: {
      feedbackPublicationPrecheckVerified: true,
      safeStudentResultOnly: true,
      reviewedFeedbackArtifactRecorded: true,
      humanReviewCompleted: true,
      publicationApprovalRequired: true,
      publicationApproved: false,
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
    evidenceRefs: [
      ...normalized.evidenceRefs,
      ...normalized.precheckResult.evidenceRefs,
      `evidence:student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-input-hash:${normalized.inputHash}`,
    ],
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
  };
}

function buildResult(record, replay) {
  return { ...record, ...replay };
}

function appendRecord(commandLogPath, record) {
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
    if (record.idempotencyKey === idempotencyKey) return record;
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.inputHash !== normalized.inputHash) {
    throw artifactError("STUDENT_APP_AI_TUTOR_REVIEWED_FEEDBACK_ARTIFACT_IDEMPOTENCY_CONFLICT", "idempotency key already exists with different reviewed feedback artifact input");
  }
}

function rejectLeakedFields(value, label) {
  if (!value || typeof value !== "object") return;
  const keys = collectKeys(value);
  for (const field of leakedFieldNames) {
    if (keys.has(field)) {
      throw artifactError("STUDENT_APP_AI_TUTOR_REVIEWED_FEEDBACK_ARTIFACT_LEAKED_FIELD", `${label}.${field} is not allowed`);
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
    throw artifactError("STUDENT_APP_AI_TUTOR_REVIEWED_FEEDBACK_ARTIFACT_INVALID_OBJECT", `${label} must be an object`);
  }
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw artifactError("STUDENT_APP_AI_TUTOR_REVIEWED_FEEDBACK_ARTIFACT_CONST", `${label} must be ${String(expected)}`);
  }
  return expected;
}

function requireEnum(value, label, allowed) {
  const text = requireBoundedString(value, label, 1, 80);
  if (!allowed.includes(text)) {
    throw artifactError("STUDENT_APP_AI_TUTOR_REVIEWED_FEEDBACK_ARTIFACT_ENUM", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string") {
    throw artifactError("STUDENT_APP_AI_TUTOR_REVIEWED_FEEDBACK_ARTIFACT_STRING", `${label} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw artifactError("STUDENT_APP_AI_TUTOR_REVIEWED_FEEDBACK_ARTIFACT_STRING_LENGTH", `${label} length is invalid`);
  }
  return trimmed;
}

function requireSafeText(value, label, min, max) {
  const text = requireBoundedString(value, label, min, max);
  if (/[<>]/u.test(text)) {
    throw artifactError("STUDENT_APP_AI_TUTOR_REVIEWED_FEEDBACK_ARTIFACT_UNSAFE_TEXT", `${label} must be encoded safe text`);
  }
  return text;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 260);
  if (!token.startsWith(prefix)) {
    throw artifactError("STUDENT_APP_AI_TUTOR_REVIEWED_FEEDBACK_ARTIFACT_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireQuestionBankDraftRef(value, label) {
  const ref = requireBoundedString(value, label, 1, 1000);
  if (!ref.startsWith("local://question-bank-drafts/")) {
    throw artifactError("STUDENT_APP_AI_TUTOR_REVIEWED_FEEDBACK_ARTIFACT_DRAFT_REF", `${label} must be a local question-bank draft ref`);
  }
  return ref;
}

function requireIsoString(value, label) {
  const text = requireBoundedString(value, label, 20, 80);
  if (Number.isNaN(Date.parse(text))) {
    throw artifactError("STUDENT_APP_AI_TUTOR_REVIEWED_FEEDBACK_ARTIFACT_TIME", `${label} must be an ISO timestamp`);
  }
  return text;
}

function uniqueStringArray(values, label, min, max) {
  if (!Array.isArray(values) || values.length < min) {
    throw artifactError("STUDENT_APP_AI_TUTOR_REVIEWED_FEEDBACK_ARTIFACT_ARRAY", `${label} must contain at least ${min} item`);
  }
  const normalized = [...new Set(values.map((value, index) =>
    requireBoundedString(value, `${label}[${index}]`, 1, max),
  ))];
  if (normalized.length < min) {
    throw artifactError("STUDENT_APP_AI_TUTOR_REVIEWED_FEEDBACK_ARTIFACT_ARRAY_LENGTH", `${label} must contain at least ${min} item`);
  }
  return normalized;
}

function uniqueSafeTextArray(values, label, minItems, maxItems, minLength, maxLength) {
  if (!Array.isArray(values) || values.length < minItems || values.length > maxItems) {
    throw artifactError("STUDENT_APP_AI_TUTOR_REVIEWED_FEEDBACK_ARTIFACT_ARRAY_LENGTH", `${label} length is invalid`);
  }
  return [...new Set(values.map((value, index) =>
    requireSafeText(value, `${label}[${index}]`, minLength, maxLength),
  ))];
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeToken(value) {
  return value.replace(/[^a-zA-Z0-9]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 180);
}

function artifactError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
