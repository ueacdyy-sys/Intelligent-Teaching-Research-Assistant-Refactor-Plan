import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_COMMAND_PORT =
  "StudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopePort.recordFeedbackDeliveryEnvelope";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_READY =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_READY";

const inputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-feedback-delivery-envelope.v1";
const outputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-recorded.v1";
const approvalRuntimeId = "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_runtime";
const approvalWorkloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_RUNTIME";
const approvedStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED";
const readyStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_READY_NOT_PERSISTED";
const defaultCommandLogPath = "reports/student-command-log/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope.jsonl";
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
  "databaseWriteResult",
  "studentArchivePersistenceResult",
];

export function recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope(input, options = {}) {
  const deliveredAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const commandLogPath = options.commandLogPath ?? defaultCommandLogPath;
  const existing = findExistingRecordByIdempotencyKey(commandLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const record = buildRecord(normalized, deliveredAt);
  appendRecord(commandLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope(result) {
  return [
    `Student App AI Tutor question-bank draft answer feedback delivery envelope: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Envelope: ${result.studentFeedbackDeliveryEnvelope.envelopeId}`,
    `Artifact: ${result.studentFeedbackDeliveryEnvelope.approvedFeedbackArtifactId}`,
    `Persisted: ${result.boundary.durableStudentArchivePersistenceStarted}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const deliveryInvocationId = requireToken(input.deliveryInvocationId, "input.deliveryInvocationId", "feedback_delivery_");
  const principal = assertDeliveryPrincipal(input.principal);
  const approvalReport = assertApprovalReport(input.feedbackPublicationApprovalReport);
  const approvalRecord = assertApprovalRecord(approvalReport);
  const deliveryRequest = assertDeliveryRequest(input.feedbackDeliveryRequest, approvalRecord);
  const policy = assertDeliveryPolicy(input.feedbackDeliveryPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 180);
  if (!evidenceRefs.some((ref) => ref.includes("student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval"))) {
    throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_MISSING_APPROVAL_EVIDENCE", "feedback publication approval evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 260);
  const inputHash = hashInput({
    deliveryInvocationId,
    principalId: principal.principalId,
    approvalRecordId: approvalRecord.recordId,
    approvalId: approvalRecord.approval.approvalId,
    approvedFeedbackArtifactId: approvalRecord.approvedFeedbackArtifact.artifactId,
    deliveryRequest,
    policy,
  });
  return {
    deliveryInvocationId,
    principal,
    approvalReport,
    approvalRecord,
    deliveryRequest,
    policy,
    evidenceRefs,
    idempotencyKey,
    inputHash,
  };
}

function assertDeliveryPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  requireConst(principal.subjectType, "SERVICE", "input.principal.subjectType");
  requireConst(principal.role, "SERVICE", "input.principal.role");
  requireConst(principal.entryPoint, "STUDENT_DELIVERY_RUNTIME", "input.principal.entryPoint");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  for (const scope of ["TEACHING_READ", "STUDENT_DELIVERY_ENVELOPE", "STUDENT_APP_DELIVERY"]) {
    if (!scopes.includes(scope)) {
      throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_MISSING_SCOPE", `${scope} is required`);
    }
  }
  return {
    principalId: requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128),
    subjectType: "SERVICE",
    role: "SERVICE",
    entryPoint: "STUDENT_DELIVERY_RUNTIME",
    scopes,
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 128),
  };
}

function assertApprovalReport(report) {
  rejectLeakedFields(report, "input.feedbackPublicationApprovalReport");
  assertPlainObject(report, "input.feedbackPublicationApprovalReport");
  requireConst(report.readiness, "READY", "input.feedbackPublicationApprovalReport.readiness");
  requireConst(report.workloadType, approvalWorkloadType, "input.feedbackPublicationApprovalReport.workloadType");
  assertPlainObject(report.runtime, "input.feedbackPublicationApprovalReport.runtime");
  requireConst(report.runtime.runtimeId, approvalRuntimeId, "input.feedbackPublicationApprovalReport.runtime.runtimeId");
  requireConst(report.runtime.status, "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED", "input.feedbackPublicationApprovalReport.runtime.status");
  assertPlainObject(report.safetyInvariants, "input.feedbackPublicationApprovalReport.safetyInvariants");
  for (const field of [
    "reviewedFeedbackArtifactRequired",
    "safeStudentResultRequired",
    "humanReviewRequired",
    "humanPublicationApprovalRequired",
    "approvedForStudentVisibleDelivery",
    "futureStudentVisibleDeliveryRuntimeRequired",
  ]) {
    requireConst(report.safetyInvariants[field], true, `input.feedbackPublicationApprovalReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "studentVisibleFeedbackPublished",
    "studentVisibleDeliveryEnvelopeCreated",
    "durableStudentArchivePersistenceStarted",
    "answerKeyDisclosureAllowed",
    "workerMetadataDisclosureAllowed",
    "rawModelOutputDisclosureAllowed",
    "resultRefDisclosureAllowed",
    "modelInferenceAllowed",
  ]) {
    requireConst(report.safetyInvariants[field], false, `input.feedbackPublicationApprovalReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertApprovalRecord(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApproval?.result;
  rejectLeakedFields(result, "input.feedbackPublicationApprovalReport.runtimeProbes.result");
  assertPlainObject(result, "input.feedbackPublicationApprovalReport.runtimeProbes.result");
  requireConst(result.runtimeId, approvalRuntimeId, "input.feedbackPublicationApprovalReport.runtimeProbes.result.runtimeId");
  requireConst(result.status, approvedStatus, "input.feedbackPublicationApprovalReport.runtimeProbes.result.status");
  requireConst(result.boundary?.publicationApprovalGranted, true, "input.feedbackPublicationApprovalReport.runtimeProbes.result.boundary.publicationApprovalGranted");
  requireConst(result.boundary?.approvedForStudentVisibleDelivery, true, "input.feedbackPublicationApprovalReport.runtimeProbes.result.boundary.approvedForStudentVisibleDelivery");
  requireConst(result.boundary?.requiresFutureStudentVisibleDeliveryRuntime, true, "input.feedbackPublicationApprovalReport.runtimeProbes.result.boundary.requiresFutureStudentVisibleDeliveryRuntime");
  requireConst(result.boundary?.studentVisibleFeedbackPublished, false, "input.feedbackPublicationApprovalReport.runtimeProbes.result.boundary.studentVisibleFeedbackPublished");
  requireConst(result.boundary?.studentVisibleDeliveryEnvelopeCreated, false, "input.feedbackPublicationApprovalReport.runtimeProbes.result.boundary.studentVisibleDeliveryEnvelopeCreated");
  requireConst(result.boundary?.durableStudentArchivePersistenceStarted, false, "input.feedbackPublicationApprovalReport.runtimeProbes.result.boundary.durableStudentArchivePersistenceStarted");
  const artifact = assertApprovedFeedbackArtifact(result.approvedFeedbackArtifact);
  const approval = assertApproval(result.approval, artifact);
  return {
    recordId: requireBoundedString(result.recordId, "input.feedbackPublicationApprovalReport.runtimeProbes.result.recordId", 1, 260),
    approvalInvocationId: requireToken(result.approvalInvocationId, "input.feedbackPublicationApprovalReport.runtimeProbes.result.approvalInvocationId", "feedback_publication_approval_"),
    approval,
    approvedFeedbackArtifact: artifact,
    evidenceRefs: uniqueStringArray(result.evidenceRefs, "input.feedbackPublicationApprovalReport.runtimeProbes.result.evidenceRefs", 1, 220),
  };
}

function assertApproval(approval, artifact) {
  assertPlainObject(approval, "input.feedbackPublicationApprovalReport.approval");
  requireConst(approval.decision, "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY", "input.feedbackPublicationApprovalReport.approval.decision");
  requireConst(approval.reviewedFeedbackArtifactId, artifact.artifactId, "input.feedbackPublicationApprovalReport.approval.reviewedFeedbackArtifactId");
  requireConst(approval.submissionId, artifact.submissionId, "input.feedbackPublicationApprovalReport.approval.submissionId");
  requireConst(approval.requestId, artifact.requestId, "input.feedbackPublicationApprovalReport.approval.requestId");
  requireConst(approval.questionBankDraftRef, artifact.questionBankDraftRef, "input.feedbackPublicationApprovalReport.approval.questionBankDraftRef");
  requireConst(approval.tutoringAnalysisRequestId, artifact.tutoringAnalysisRequestId, "input.feedbackPublicationApprovalReport.approval.tutoringAnalysisRequestId");
  requireConst(approval.archiveItemId, artifact.archiveItemId, "input.feedbackPublicationApprovalReport.approval.archiveItemId");
  for (const field of [
    "learnerFeedbackReviewed",
    "ageAppropriateConfirmed",
    "studentOwnScopeConfirmed",
    "answerKeyDisclosureBlocked",
    "workerMetadataDisclosureBlocked",
    "rawModelOutputDisclosureBlocked",
    "internalErrorsDisclosureBlocked",
    "futureStudentVisibleDeliveryRuntimeRequired",
  ]) {
    requireConst(approval[field], true, `input.feedbackPublicationApprovalReport.approval.${field}`);
  }
  return {
    approvalId: requireToken(approval.approvalId, "input.feedbackPublicationApprovalReport.approval.approvalId", "feedback_publication_approval_"),
    reviewedAt: requireIsoString(approval.reviewedAt, "input.feedbackPublicationApprovalReport.approval.reviewedAt"),
    reviewerPrincipalId: requireBoundedString(approval.reviewerPrincipalId, "input.feedbackPublicationApprovalReport.approval.reviewerPrincipalId", 1, 128),
  };
}

function assertApprovedFeedbackArtifact(artifact) {
  rejectLeakedFields(artifact, "input.feedbackPublicationApprovalReport.approvedFeedbackArtifact");
  assertPlainObject(artifact, "input.feedbackPublicationApprovalReport.approvedFeedbackArtifact");
  requireConst(artifact.artifactKind, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_ANSWER_REVIEWED_FEEDBACK", "input.feedbackPublicationApprovalReport.approvedFeedbackArtifact.artifactKind");
  requireConst(artifact.audience, "STUDENT_APP_LEARNING_SUPPORT", "input.feedbackPublicationApprovalReport.approvedFeedbackArtifact.audience");
  requireConst(artifact.previousVisibilityState, "REVIEWED_NOT_PUBLISHED", "input.feedbackPublicationApprovalReport.approvedFeedbackArtifact.previousVisibilityState");
  requireConst(artifact.approvalState, "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED", "input.feedbackPublicationApprovalReport.approvedFeedbackArtifact.approvalState");
  return {
    artifactId: requireToken(artifact.artifactId, "input.feedbackPublicationApprovalReport.approvedFeedbackArtifact.artifactId", "feedback_artifact_"),
    artifactKind: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_ANSWER_REVIEWED_FEEDBACK",
    submissionId: requireToken(artifact.submissionId, "input.feedbackPublicationApprovalReport.approvedFeedbackArtifact.submissionId", "qbank_ans_sub_"),
    requestId: requireToken(artifact.requestId, "input.feedbackPublicationApprovalReport.approvedFeedbackArtifact.requestId", "grading_req_"),
    questionBankDraftRef: requireQuestionBankDraftRef(artifact.questionBankDraftRef, "input.feedbackPublicationApprovalReport.approvedFeedbackArtifact.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireToken(artifact.tutoringAnalysisRequestId, "input.feedbackPublicationApprovalReport.approvedFeedbackArtifact.tutoringAnalysisRequestId", "tutor_req_"),
    archiveItemId: requireToken(artifact.archiveItemId, "input.feedbackPublicationApprovalReport.approvedFeedbackArtifact.archiveItemId", "tarch_"),
    audience: "STUDENT_APP_LEARNING_SUPPORT",
    scoreSummary: requireSafeText(artifact.scoreSummary, "input.feedbackPublicationApprovalReport.approvedFeedbackArtifact.scoreSummary", 1, 2000),
    learnerFeedback: assertLearnerFeedback(artifact.learnerFeedback),
  };
}

function assertLearnerFeedback(feedback) {
  assertPlainObject(feedback, "input.feedbackPublicationApprovalReport.approvedFeedbackArtifact.learnerFeedback");
  return {
    summary: requireSafeText(feedback.summary, "input.feedbackPublicationApprovalReport.approvedFeedbackArtifact.learnerFeedback.summary", 1, 1200),
    encouragement: requireSafeText(feedback.encouragement, "input.feedbackPublicationApprovalReport.approvedFeedbackArtifact.learnerFeedback.encouragement", 1, 600),
    nextSteps: uniqueSafeTextArray(feedback.nextSteps, "input.feedbackPublicationApprovalReport.approvedFeedbackArtifact.learnerFeedback.nextSteps", 1, 8, 1, 500),
    misconceptionTags: uniqueSafeTextArray(feedback.misconceptionTags ?? [], "input.feedbackPublicationApprovalReport.approvedFeedbackArtifact.learnerFeedback.misconceptionTags", 0, 12, 1, 80),
    practiceSuggestions: uniqueSafeTextArray(feedback.practiceSuggestions ?? [], "input.feedbackPublicationApprovalReport.approvedFeedbackArtifact.learnerFeedback.practiceSuggestions", 0, 8, 1, 300),
  };
}

function assertDeliveryRequest(request, approvalRecord) {
  assertPlainObject(request, "input.feedbackDeliveryRequest");
  const artifact = approvalRecord.approvedFeedbackArtifact;
  requireConst(request.deliveryMode, "STUDENT_APP_RENDERABLE_FEEDBACK_ENVELOPE", "input.feedbackDeliveryRequest.deliveryMode");
  requireConst(request.channel, "STUDENT_APP", "input.feedbackDeliveryRequest.channel");
  requireConst(request.audienceKind, "STUDENT_APP_LEARNING_SUPPORT", "input.feedbackDeliveryRequest.audienceKind");
  requireConst(request.visibilityState, "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED", "input.feedbackDeliveryRequest.visibilityState");
  requireConst(request.approvalRecordId, approvalRecord.recordId, "input.feedbackDeliveryRequest.approvalRecordId");
  requireConst(request.approvalId, approvalRecord.approval.approvalId, "input.feedbackDeliveryRequest.approvalId");
  requireConst(request.approvedFeedbackArtifactId, artifact.artifactId, "input.feedbackDeliveryRequest.approvedFeedbackArtifactId");
  requireConst(request.submissionId, artifact.submissionId, "input.feedbackDeliveryRequest.submissionId");
  requireConst(request.requestId, artifact.requestId, "input.feedbackDeliveryRequest.requestId");
  requireConst(request.questionBankDraftRef, artifact.questionBankDraftRef, "input.feedbackDeliveryRequest.questionBankDraftRef");
  requireConst(request.tutoringAnalysisRequestId, artifact.tutoringAnalysisRequestId, "input.feedbackDeliveryRequest.tutoringAnalysisRequestId");
  requireConst(request.archiveItemId, artifact.archiveItemId, "input.feedbackDeliveryRequest.archiveItemId");
  requireConst(request.studentOwnScopeConfirmed, true, "input.feedbackDeliveryRequest.studentOwnScopeConfirmed");
  return {
    envelopeId: requireToken(request.envelopeId, "input.feedbackDeliveryRequest.envelopeId", "feedback_delivery_env_"),
    deliveryMode: "STUDENT_APP_RENDERABLE_FEEDBACK_ENVELOPE",
    channel: "STUDENT_APP",
    audienceKind: "STUDENT_APP_LEARNING_SUPPORT",
    visibilityState: "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED",
    scopeRef: requireStudentScopeRef(request.scopeRef, "input.feedbackDeliveryRequest.scopeRef"),
    approvalRecordId: approvalRecord.recordId,
    approvalId: approvalRecord.approval.approvalId,
    approvedFeedbackArtifactId: artifact.artifactId,
    submissionId: artifact.submissionId,
    requestId: artifact.requestId,
    questionBankDraftRef: artifact.questionBankDraftRef,
    tutoringAnalysisRequestId: artifact.tutoringAnalysisRequestId,
    archiveItemId: artifact.archiveItemId,
    studentOwnScopeConfirmed: true,
  };
}

function assertDeliveryPolicy(policy) {
  assertPlainObject(policy, "input.feedbackDeliveryPolicy");
  for (const field of [
    "publicationApprovalRequired",
    "studentDeliveryEnvelopeAllowed",
    "studentVisibleFeedbackAllowed",
    "studentOwnScopeRequired",
    "safeLearnerFeedbackRequired",
    "futureDurableArchivePersistenceReviewRequired",
  ]) {
    requireConst(policy[field], true, `input.feedbackDeliveryPolicy.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed",
    "mainDatabaseWriteAllowed",
    "studentArchiveWriteAllowed",
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
    requireConst(policy[field], false, `input.feedbackDeliveryPolicy.${field}`);
  }
  return { ...policy };
}

function buildRecord(normalized, deliveredAt) {
  const artifact = normalized.approvalRecord.approvedFeedbackArtifact;
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE",
    recordId: `student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_${safeToken(normalized.idempotencyKey)}`,
    deliveredAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_COMMAND_PORT,
    status: readyStatus,
    deliveryInvocationId: normalized.deliveryInvocationId,
    principal: normalized.principal,
    sourcePublicationApproval: {
      runtimeId: approvalRuntimeId,
      recordId: normalized.approvalRecord.recordId,
      approvalInvocationId: normalized.approvalRecord.approvalInvocationId,
      approvalId: normalized.approvalRecord.approval.approvalId,
      approvedFeedbackArtifactId: artifact.artifactId,
    },
    studentFeedbackDeliveryEnvelope: buildEnvelope(normalized),
    boundary: {
      reviewedFeedbackArtifactVerified: true,
      publicationApprovalVerified: true,
      safeLearnerFeedbackOnly: true,
      studentOwnScopeEnforced: true,
      studentVisibleFeedbackDeliveryEnvelopeCreated: true,
      studentVisibleFeedbackPublished: true,
      studentVisibleFeedbackDelivered: true,
      durableStudentArchivePersistenceStarted: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
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
      requiresFutureDurableArchivePersistenceReview: true,
    },
    evidenceRefs: [
      ...normalized.evidenceRefs,
      ...normalized.approvalRecord.evidenceRefs,
      `evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-input-hash:${normalized.inputHash}`,
    ],
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
  };
}

function buildEnvelope(normalized) {
  const artifact = normalized.approvalRecord.approvedFeedbackArtifact;
  const request = normalized.deliveryRequest;
  return {
    envelopeId: request.envelopeId,
    envelopeKind: "STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE",
    deliveryMode: request.deliveryMode,
    channel: request.channel,
    audience: request.audienceKind,
    visibilityState: request.visibilityState,
    deliveryState: "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED",
    scopeRef: request.scopeRef,
    approvalRecordId: request.approvalRecordId,
    approvalId: request.approvalId,
    approvedFeedbackArtifactId: artifact.artifactId,
    submissionId: artifact.submissionId,
    requestId: artifact.requestId,
    questionBankDraftRef: artifact.questionBankDraftRef,
    tutoringAnalysisRequestId: artifact.tutoringAnalysisRequestId,
    archiveItemId: artifact.archiveItemId,
    scoreSummary: artifact.scoreSummary,
    learnerFeedback: artifact.learnerFeedback,
    evidencePreserved: true,
    approvalPreserved: true,
    studentOwnScopeEnforced: true,
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
    throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_IDEMPOTENCY_CONFLICT", "idempotency key already exists with different feedback delivery envelope input");
  }
}

function rejectLeakedFields(value, label) {
  if (!value || typeof value !== "object") return;
  const keys = collectKeys(value);
  for (const field of leakedFieldNames) {
    if (keys.has(field)) {
      throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_LEAKED_FIELD", `${label}.${field} is not allowed`);
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
    throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_INVALID_OBJECT", `${label} must be an object`);
  }
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_CONST", `${label} must be ${String(expected)}`);
  }
  return expected;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string") {
    throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_STRING", `${label} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_STRING_LENGTH", `${label} length is invalid`);
  }
  return trimmed;
}

function requireSafeText(value, label, min, max) {
  const text = requireBoundedString(value, label, min, max);
  if (/[<>]/u.test(text)) {
    throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_UNSAFE_TEXT", `${label} must be encoded safe text`);
  }
  return text;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 260);
  if (!token.startsWith(prefix)) {
    throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireQuestionBankDraftRef(value, label) {
  const ref = requireBoundedString(value, label, 1, 1000);
  if (!ref.startsWith("local://question-bank-drafts/")) {
    throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_DRAFT_REF", `${label} must be a local question-bank draft ref`);
  }
  return ref;
}

function requireStudentScopeRef(value, label) {
  const ref = requireBoundedString(value, label, 1, 160);
  if (!ref.startsWith("student:")) {
    throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_SCOPE_REF", `${label} must be a student scope ref`);
  }
  return ref;
}

function requireIsoString(value, label) {
  const text = requireBoundedString(value, label, 20, 80);
  if (Number.isNaN(Date.parse(text))) {
    throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_TIME", `${label} must be an ISO timestamp`);
  }
  return text;
}

function uniqueStringArray(values, label, min, max) {
  if (!Array.isArray(values) || values.length < min) {
    throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_ARRAY", `${label} must contain at least ${min} item`);
  }
  const normalized = [...new Set(values.map((value, index) =>
    requireBoundedString(value, `${label}[${index}]`, 1, max),
  ))];
  if (normalized.length < min) {
    throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_ARRAY_LENGTH", `${label} must contain at least ${min} item`);
  }
  return normalized;
}

function uniqueSafeTextArray(values, label, minItems, maxItems, minLength, maxLength) {
  if (!Array.isArray(values) || values.length < minItems || values.length > maxItems) {
    throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_ARRAY_LENGTH", `${label} length is invalid`);
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

function deliveryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
