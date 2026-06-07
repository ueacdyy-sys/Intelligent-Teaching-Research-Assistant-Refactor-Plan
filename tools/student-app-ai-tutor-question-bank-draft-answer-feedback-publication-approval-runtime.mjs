import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_COMMAND_PORT =
  "StudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalPort.recordFeedbackPublicationApproval";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_READY =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_READY";

const inputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-feedback-publication-approval.v1";
const outputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-feedback-publication-approval-recorded.v1";
const reviewedArtifactRuntimeId = "student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_runtime";
const reviewedArtifactWorkloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_RUNTIME";
const approvedDecision = "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY";
const approvedStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED";
const defaultCommandLogPath = "reports/student-command-log/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval.jsonl";
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
  "deliveredAt",
  "studentDeliveryEnvelope",
];

export function recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApproval(input, options = {}) {
  const approvedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const commandLogPath = options.commandLogPath ?? defaultCommandLogPath;
  const existing = findExistingRecordByIdempotencyKey(commandLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const record = buildRecord(normalized, approvedAt);
  appendRecord(commandLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApproval(result) {
  return [
    `Student App AI Tutor question-bank draft answer feedback publication approval: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Approval: ${result.approval.approvalId}`,
    `Artifact: ${result.approvedFeedbackArtifact.artifactId}`,
    `Student-visible feedback published: ${result.boundary.studentVisibleFeedbackPublished}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const approvalInvocationId = requireToken(input.approvalInvocationId, "input.approvalInvocationId", "feedback_publication_approval_");
  const principal = assertApproverPrincipal(input.principal);
  const reviewedFeedbackReport = assertReviewedFeedbackReport(input.reviewedFeedbackArtifactReport);
  const reviewedFeedbackRecord = assertReviewedFeedbackRecord(reviewedFeedbackReport);
  const approval = assertApproval(input.feedbackPublicationApproval, principal, reviewedFeedbackRecord);
  const policy = assertApprovalPolicy(input.feedbackPublicationApprovalPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 180);
  if (!evidenceRefs.some((ref) => ref.includes("student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact"))) {
    throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_MISSING_REVIEWED_ARTIFACT_EVIDENCE", "reviewed feedback artifact evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 260);
  const inputHash = hashInput({
    approvalInvocationId,
    approverPrincipalId: principal.principalId,
    reviewedArtifactRecordId: reviewedFeedbackRecord.recordId,
    reviewedArtifactId: reviewedFeedbackRecord.reviewedFeedbackArtifact.artifactId,
    approval,
    policy,
  });
  return {
    approvalInvocationId,
    principal,
    reviewedFeedbackReport,
    reviewedFeedbackRecord,
    approval,
    policy,
    evidenceRefs,
    idempotencyKey,
    inputHash,
  };
}

function assertApproverPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const principalId = requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128);
  requireConst(principal.subjectType, "USER", "input.principal.subjectType");
  const role = requireEnum(principal.role, "input.principal.role", ["TEACHER", "ADMIN"]);
  const entryPoint = requireEnum(principal.entryPoint, "input.principal.entryPoint", ["DESKTOP_TEACHER", "ADMIN_CONSOLE"]);
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  if (role === "TEACHER" && !scopes.includes("TEACHING_READ")) {
    throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_MISSING_SCOPE", "TEACHING_READ is required");
  }
  if (!scopes.includes("FEEDBACK_PUBLISH_APPROVE") && !scopes.includes("ADMIN_SYSTEM")) {
    throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_MISSING_SCOPE", "FEEDBACK_PUBLISH_APPROVE or ADMIN_SYSTEM is required");
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

function assertReviewedFeedbackReport(report) {
  rejectLeakedFields(report, "input.reviewedFeedbackArtifactReport");
  assertPlainObject(report, "input.reviewedFeedbackArtifactReport");
  requireConst(report.readiness, "READY", "input.reviewedFeedbackArtifactReport.readiness");
  requireConst(report.workloadType, reviewedArtifactWorkloadType, "input.reviewedFeedbackArtifactReport.workloadType");
  assertPlainObject(report.runtime, "input.reviewedFeedbackArtifactReport.runtime");
  requireConst(report.runtime.runtimeId, reviewedArtifactRuntimeId, "input.reviewedFeedbackArtifactReport.runtime.runtimeId");
  requireConst(report.runtime.status, "READY_NOT_PUBLISHED", "input.reviewedFeedbackArtifactReport.runtime.status");
  assertPlainObject(report.safetyInvariants, "input.reviewedFeedbackArtifactReport.safetyInvariants");
  for (const field of [
    "feedbackPublicationPrecheckRequired",
    "safeStudentResultRequired",
    "humanReviewRequired",
    "feedbackArtifactRecorded",
    "publicationApprovalRequired",
  ]) {
    requireConst(report.safetyInvariants[field], true, `input.reviewedFeedbackArtifactReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "studentVisibleFeedbackAllowed",
    "answerKeyDisclosureAllowed",
    "workerMetadataDisclosureAllowed",
    "rawModelOutputDisclosureAllowed",
    "resultRefDisclosureAllowed",
    "modelInferenceAllowed",
  ]) {
    requireConst(report.safetyInvariants[field], false, `input.reviewedFeedbackArtifactReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertReviewedFeedbackRecord(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifact?.result;
  rejectLeakedFields(result, "input.reviewedFeedbackArtifactReport.runtimeProbes.result");
  assertPlainObject(result, "input.reviewedFeedbackArtifactReport.runtimeProbes.result");
  requireConst(result.runtimeId, reviewedArtifactRuntimeId, "input.reviewedFeedbackArtifactReport.runtimeProbes.result.runtimeId");
  requireConst(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_READY_NOT_PUBLISHED", "input.reviewedFeedbackArtifactReport.runtimeProbes.result.status");
  requireConst(result.boundary?.humanReviewCompleted, true, "input.reviewedFeedbackArtifactReport.runtimeProbes.result.boundary.humanReviewCompleted");
  requireConst(result.boundary?.publicationApprovalRequired, true, "input.reviewedFeedbackArtifactReport.runtimeProbes.result.boundary.publicationApprovalRequired");
  requireConst(result.boundary?.publicationApproved, false, "input.reviewedFeedbackArtifactReport.runtimeProbes.result.boundary.publicationApproved");
  requireConst(result.boundary?.studentVisibleFeedbackPublished, false, "input.reviewedFeedbackArtifactReport.runtimeProbes.result.boundary.studentVisibleFeedbackPublished");
  const artifact = assertReviewedFeedbackArtifact(result.reviewedFeedbackArtifact);
  return {
    recordId: requireBoundedString(result.recordId, "input.reviewedFeedbackArtifactReport.runtimeProbes.result.recordId", 1, 260),
    reviewInvocationId: requireToken(result.reviewInvocationId, "input.reviewedFeedbackArtifactReport.runtimeProbes.result.reviewInvocationId", "feedback_artifact_review_"),
    reviewedFeedbackArtifact: artifact,
    evidenceRefs: uniqueStringArray(result.evidenceRefs, "input.reviewedFeedbackArtifactReport.runtimeProbes.result.evidenceRefs", 1, 200),
  };
}

function assertReviewedFeedbackArtifact(artifact) {
  rejectLeakedFields(artifact, "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact");
  assertPlainObject(artifact, "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact");
  requireConst(artifact.artifactKind, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_ANSWER_REVIEWED_FEEDBACK", "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact.artifactKind");
  requireConst(artifact.audience, "STUDENT_APP_LEARNING_SUPPORT", "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact.audience");
  requireConst(artifact.visibilityState, "REVIEWED_NOT_PUBLISHED", "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact.visibilityState");
  requireConst(artifact.publicationApproved, false, "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact.publicationApproved");
  requireConst(artifact.studentVisibleFeedbackPublished, false, "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact.studentVisibleFeedbackPublished");
  const review = assertSourceReview(artifact.review);
  return {
    artifactId: requireToken(artifact.artifactId, "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact.artifactId", "feedback_artifact_"),
    artifactKind: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_ANSWER_REVIEWED_FEEDBACK",
    submissionId: requireToken(artifact.submissionId, "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact.submissionId", "qbank_ans_sub_"),
    requestId: requireToken(artifact.requestId, "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact.requestId", "grading_req_"),
    questionBankDraftRef: requireQuestionBankDraftRef(artifact.questionBankDraftRef, "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireToken(artifact.tutoringAnalysisRequestId, "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact.tutoringAnalysisRequestId", "tutor_req_"),
    archiveItemId: requireToken(artifact.archiveItemId, "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact.archiveItemId", "tarch_"),
    audience: "STUDENT_APP_LEARNING_SUPPORT",
    visibilityState: "REVIEWED_NOT_PUBLISHED",
    scoreSummary: requireSafeText(artifact.scoreSummary, "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact.scoreSummary", 1, 2000),
    learnerFeedback: assertLearnerFeedback(artifact.learnerFeedback),
    review,
    publicationApproved: false,
    studentVisibleFeedbackPublished: false,
  };
}

function assertSourceReview(review) {
  assertPlainObject(review, "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact.review");
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
    requireConst(review[field], true, `input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact.review.${field}`);
  }
  requireConst(review.publicationApproved, false, "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact.review.publicationApproved");
  return {
    reviewId: requireToken(review.reviewId, "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact.review.reviewId", "feedback_review_"),
    reviewerPrincipalId: requireBoundedString(review.reviewerPrincipalId, "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact.review.reviewerPrincipalId", 1, 128),
    reviewedAt: requireIsoString(review.reviewedAt, "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact.review.reviewedAt"),
  };
}

function assertLearnerFeedback(feedback) {
  assertPlainObject(feedback, "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact.learnerFeedback");
  return {
    summary: requireSafeText(feedback.summary, "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact.learnerFeedback.summary", 1, 1200),
    encouragement: requireSafeText(feedback.encouragement, "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact.learnerFeedback.encouragement", 1, 600),
    nextSteps: uniqueSafeTextArray(feedback.nextSteps, "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact.learnerFeedback.nextSteps", 1, 8, 1, 500),
    misconceptionTags: uniqueSafeTextArray(feedback.misconceptionTags ?? [], "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact.learnerFeedback.misconceptionTags", 0, 12, 1, 80),
    practiceSuggestions: uniqueSafeTextArray(feedback.practiceSuggestions ?? [], "input.reviewedFeedbackArtifactReport.reviewedFeedbackArtifact.learnerFeedback.practiceSuggestions", 0, 8, 1, 300),
  };
}

function assertApproval(approval, principal, reviewedFeedbackRecord) {
  assertPlainObject(approval, "input.feedbackPublicationApproval");
  const artifact = reviewedFeedbackRecord.reviewedFeedbackArtifact;
  requireConst(approval.decision, approvedDecision, "input.feedbackPublicationApproval.decision");
  requireConst(approval.reviewerPrincipalId, principal.principalId, "input.feedbackPublicationApproval.reviewerPrincipalId");
  requireConst(approval.reviewedFeedbackArtifactId, artifact.artifactId, "input.feedbackPublicationApproval.reviewedFeedbackArtifactId");
  requireConst(approval.submissionId, artifact.submissionId, "input.feedbackPublicationApproval.submissionId");
  requireConst(approval.requestId, artifact.requestId, "input.feedbackPublicationApproval.requestId");
  requireConst(approval.questionBankDraftRef, artifact.questionBankDraftRef, "input.feedbackPublicationApproval.questionBankDraftRef");
  requireConst(approval.tutoringAnalysisRequestId, artifact.tutoringAnalysisRequestId, "input.feedbackPublicationApproval.tutoringAnalysisRequestId");
  requireConst(approval.archiveItemId, artifact.archiveItemId, "input.feedbackPublicationApproval.archiveItemId");
  for (const field of [
    "reviewedFeedbackArtifactVerified",
    "learnerFeedbackReviewed",
    "ageAppropriateConfirmed",
    "studentOwnScopeConfirmed",
    "answerKeyDisclosureBlocked",
    "workerMetadataDisclosureBlocked",
    "rawModelOutputDisclosureBlocked",
    "internalErrorsDisclosureBlocked",
    "futureStudentVisibleDeliveryRuntimeRequired",
  ]) {
    requireConst(approval[field], true, `input.feedbackPublicationApproval.${field}`);
  }
  for (const field of [
    "studentVisibleFeedbackPublished",
    "studentVisibleDeliveryEnvelopeCreated",
    "databaseWriteApproved",
    "modelInferenceApproved",
    "remoteDeviceControlApproved",
    "localToolMutationApproved",
    "swarmApproved",
  ]) {
    requireConst(approval[field], false, `input.feedbackPublicationApproval.${field}`);
  }
  return {
    approvalId: requireToken(approval.approvalId, "input.feedbackPublicationApproval.approvalId", "feedback_publication_approval_"),
    reviewerPrincipalId: principal.principalId,
    decision: approvedDecision,
    reviewedAt: requireIsoString(approval.reviewedAt, "input.feedbackPublicationApproval.reviewedAt"),
    reviewedFeedbackArtifactId: artifact.artifactId,
    submissionId: artifact.submissionId,
    requestId: artifact.requestId,
    questionBankDraftRef: artifact.questionBankDraftRef,
    tutoringAnalysisRequestId: artifact.tutoringAnalysisRequestId,
    archiveItemId: artifact.archiveItemId,
    reviewedFeedbackArtifactVerified: true,
    learnerFeedbackReviewed: true,
    ageAppropriateConfirmed: true,
    studentOwnScopeConfirmed: true,
    answerKeyDisclosureBlocked: true,
    workerMetadataDisclosureBlocked: true,
    rawModelOutputDisclosureBlocked: true,
    internalErrorsDisclosureBlocked: true,
    futureStudentVisibleDeliveryRuntimeRequired: true,
    comments: requireSafeText(approval.comments, "input.feedbackPublicationApproval.comments", 1, 1200),
  };
}

function assertApprovalPolicy(policy) {
  assertPlainObject(policy, "input.feedbackPublicationApprovalPolicy");
  for (const field of [
    "reviewedFeedbackArtifactRequired",
    "humanPublicationApprovalRequired",
    "safeStudentResultRequired",
    "studentOwnScopeRequired",
    "futureStudentVisibleDeliveryRuntimeRequired",
    "approvalEvidenceRequired",
  ]) {
    requireConst(policy[field], true, `input.feedbackPublicationApprovalPolicy.${field}`);
  }
  for (const field of [
    "studentVisibleFeedbackPublished",
    "studentVisibleDeliveryEnvelopeCreated",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "modelInferenceAllowed",
    "answerKeyDisclosureAllowed",
    "workerMetadataDisclosureAllowed",
    "rawModelOutputDisclosureAllowed",
    "resultRefDisclosureAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.feedbackPublicationApprovalPolicy.${field}`);
  }
  return { ...policy };
}

function buildRecord(normalized, approvedAt) {
  const artifact = normalized.reviewedFeedbackRecord.reviewedFeedbackArtifact;
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL",
    recordId: `student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_${safeToken(normalized.idempotencyKey)}`,
    approvedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_COMMAND_PORT,
    status: approvedStatus,
    approvalInvocationId: normalized.approvalInvocationId,
    principal: normalized.principal,
    sourceReviewedFeedbackArtifact: {
      runtimeId: reviewedArtifactRuntimeId,
      recordId: normalized.reviewedFeedbackRecord.recordId,
      reviewInvocationId: normalized.reviewedFeedbackRecord.reviewInvocationId,
      artifactId: artifact.artifactId,
    },
    approval: normalized.approval,
    approvedFeedbackArtifact: {
      artifactId: artifact.artifactId,
      artifactKind: artifact.artifactKind,
      submissionId: artifact.submissionId,
      requestId: artifact.requestId,
      questionBankDraftRef: artifact.questionBankDraftRef,
      tutoringAnalysisRequestId: artifact.tutoringAnalysisRequestId,
      archiveItemId: artifact.archiveItemId,
      audience: artifact.audience,
      previousVisibilityState: artifact.visibilityState,
      approvalState: "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED",
      scoreSummary: artifact.scoreSummary,
      learnerFeedback: artifact.learnerFeedback,
    },
    boundary: {
      reviewedFeedbackArtifactVerified: true,
      safeStudentResultOnly: true,
      humanReviewCompleted: true,
      publicationApprovalRecorded: true,
      publicationApprovalGranted: true,
      approvedForStudentVisibleDelivery: true,
      requiresFutureStudentVisibleDeliveryRuntime: true,
      studentVisibleFeedbackPublished: false,
      studentVisibleDeliveryEnvelopeCreated: false,
      durableStudentArchivePersistenceStarted: false,
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
      ...normalized.reviewedFeedbackRecord.evidenceRefs,
      `evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-input-hash:${normalized.inputHash}`,
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
    throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_IDEMPOTENCY_CONFLICT", "idempotency key already exists with different publication approval input");
  }
}

function rejectLeakedFields(value, label) {
  if (!value || typeof value !== "object") return;
  const keys = collectKeys(value);
  for (const field of leakedFieldNames) {
    if (keys.has(field)) {
      throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_LEAKED_FIELD", `${label}.${field} is not allowed`);
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
    throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_INVALID_OBJECT", `${label} must be an object`);
  }
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_CONST", `${label} must be ${String(expected)}`);
  }
  return expected;
}

function requireEnum(value, label, allowed) {
  const text = requireBoundedString(value, label, 1, 80);
  if (!allowed.includes(text)) {
    throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_ENUM", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string") {
    throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_STRING", `${label} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_STRING_LENGTH", `${label} length is invalid`);
  }
  return trimmed;
}

function requireSafeText(value, label, min, max) {
  const text = requireBoundedString(value, label, min, max);
  if (/[<>]/u.test(text)) {
    throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_UNSAFE_TEXT", `${label} must be encoded safe text`);
  }
  return text;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 260);
  if (!token.startsWith(prefix)) {
    throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireQuestionBankDraftRef(value, label) {
  const ref = requireBoundedString(value, label, 1, 1000);
  if (!ref.startsWith("local://question-bank-drafts/")) {
    throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_DRAFT_REF", `${label} must be a local question-bank draft ref`);
  }
  return ref;
}

function requireIsoString(value, label) {
  const text = requireBoundedString(value, label, 20, 80);
  if (Number.isNaN(Date.parse(text))) {
    throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_TIME", `${label} must be an ISO timestamp`);
  }
  return text;
}

function uniqueStringArray(values, label, min, max) {
  if (!Array.isArray(values) || values.length < min) {
    throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_ARRAY", `${label} must contain at least ${min} item`);
  }
  const normalized = [...new Set(values.map((value, index) =>
    requireBoundedString(value, `${label}[${index}]`, 1, max),
  ))];
  if (normalized.length < min) {
    throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_ARRAY_LENGTH", `${label} must contain at least ${min} item`);
  }
  return normalized;
}

function uniqueSafeTextArray(values, label, minItems, maxItems, minLength, maxLength) {
  if (!Array.isArray(values) || values.length < minItems || values.length > maxItems) {
    throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_ARRAY_LENGTH", `${label} length is invalid`);
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

function approvalError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
