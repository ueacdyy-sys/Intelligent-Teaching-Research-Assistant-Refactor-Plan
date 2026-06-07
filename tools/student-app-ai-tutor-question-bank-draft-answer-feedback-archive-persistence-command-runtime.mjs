import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_persistence_command_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_PORT =
  "StudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandPort.recordFeedbackArchivePersistenceCommand";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_READY =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_READY";

const inputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command.v1";
const outputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-recorded.v1";
const deliveryRuntimeId = "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_runtime";
const deliveryWorkloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_RUNTIME";
const deliveryStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_READY_NOT_PERSISTED";
const commandStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED";
const defaultCommandLogPath = "reports/student-command-log/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command.jsonl";
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
  "archiveCommitResult",
  "studentArchivePersistenceResult",
];

export function recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand(input, options = {}) {
  const recordedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const commandLogPath = options.commandLogPath ?? defaultCommandLogPath;
  const existing = findExistingRecordByIdempotencyKey(commandLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const record = buildRecord(normalized, recordedAt);
  appendRecord(commandLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand(result) {
  return [
    `Student App AI Tutor feedback archive persistence command: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Command: ${result.feedbackArchivePersistenceCommand.commandId}`,
    `Envelope: ${result.feedbackArchivePersistenceCommand.sourceFeedbackDeliveryEnvelopeId}`,
    `Committed: ${result.boundary.durableStudentArchiveCommitStarted}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const persistenceInvocationId = requireToken(input.persistenceInvocationId, "input.persistenceInvocationId", "feedback_archive_persist_");
  const principal = assertPersistencePrincipal(input.principal);
  const deliveryReport = assertDeliveryReport(input.feedbackDeliveryEnvelopeReport);
  const deliveryRecord = assertDeliveryRecord(deliveryReport);
  const persistenceRequest = assertPersistenceRequest(input.feedbackArchivePersistenceRequest, deliveryRecord);
  const policy = assertPersistencePolicy(input.feedbackArchivePersistencePolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 200);
  if (!evidenceRefs.some((ref) => ref.includes("student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope"))) {
    throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_MISSING_DELIVERY_EVIDENCE", "feedback delivery envelope evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 260);
  const inputHash = hashInput({
    persistenceInvocationId,
    principalId: principal.principalId,
    deliveryRecordId: deliveryRecord.recordId,
    deliveryEnvelopeId: deliveryRecord.studentFeedbackDeliveryEnvelope.envelopeId,
    persistenceRequest,
    policy,
  });
  return {
    persistenceInvocationId,
    principal,
    deliveryReport,
    deliveryRecord,
    persistenceRequest,
    policy,
    evidenceRefs,
    idempotencyKey,
    inputHash,
  };
}

function assertPersistencePrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  requireConst(principal.subjectType, "SERVICE", "input.principal.subjectType");
  requireConst(principal.role, "SERVICE", "input.principal.role");
  requireConst(principal.entryPoint, "STUDENT_ARCHIVE_PERSISTENCE_RUNTIME", "input.principal.entryPoint");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  for (const scope of ["TEACHING_READ", "STUDENT_ARCHIVE_WRITE", "STUDENT_APP_DELIVERY"]) {
    if (!scopes.includes(scope)) {
      throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_MISSING_SCOPE", `${scope} is required`);
    }
  }
  return {
    principalId: requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128),
    subjectType: "SERVICE",
    role: "SERVICE",
    entryPoint: "STUDENT_ARCHIVE_PERSISTENCE_RUNTIME",
    scopes,
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 128),
  };
}

function assertDeliveryReport(report) {
  rejectLeakedFields(report, "input.feedbackDeliveryEnvelopeReport");
  assertPlainObject(report, "input.feedbackDeliveryEnvelopeReport");
  requireConst(report.readiness, "READY", "input.feedbackDeliveryEnvelopeReport.readiness");
  requireConst(report.workloadType, deliveryWorkloadType, "input.feedbackDeliveryEnvelopeReport.workloadType");
  assertPlainObject(report.runtime, "input.feedbackDeliveryEnvelopeReport.runtime");
  requireConst(report.runtime.runtimeId, deliveryRuntimeId, "input.feedbackDeliveryEnvelopeReport.runtime.runtimeId");
  requireConst(report.runtime.status, "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED", "input.feedbackDeliveryEnvelopeReport.runtime.status");
  assertPlainObject(report.safetyInvariants, "input.feedbackDeliveryEnvelopeReport.safetyInvariants");
  for (const field of [
    "publicationApprovalRequired",
    "safeLearnerFeedbackRequired",
    "studentDeliveryEnvelopeAllowed",
    "studentVisibleFeedbackAllowed",
    "studentOwnScopeRequired",
    "studentVisibleFeedbackDeliveryEnvelopeCreated",
    "futureDurableArchivePersistenceReviewRequired",
  ]) {
    requireConst(report.safetyInvariants[field], true, `input.feedbackDeliveryEnvelopeReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "durableStudentArchivePersistenceStarted",
    "mainDatabaseWriteStarted",
    "studentArchiveWriteStarted",
    "answerKeyDisclosureAllowed",
    "workerMetadataDisclosureAllowed",
    "rawModelOutputDisclosureAllowed",
    "resultRefDisclosureAllowed",
    "modelInferenceAllowed",
  ]) {
    requireConst(report.safetyInvariants[field], false, `input.feedbackDeliveryEnvelopeReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertDeliveryRecord(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope?.result;
  rejectLeakedFields(result, "input.feedbackDeliveryEnvelopeReport.runtimeProbes.result");
  assertPlainObject(result, "input.feedbackDeliveryEnvelopeReport.runtimeProbes.result");
  requireConst(result.runtimeId, deliveryRuntimeId, "input.feedbackDeliveryEnvelopeReport.runtimeProbes.result.runtimeId");
  requireConst(result.status, deliveryStatus, "input.feedbackDeliveryEnvelopeReport.runtimeProbes.result.status");
  requireConst(result.boundary?.studentVisibleFeedbackDeliveryEnvelopeCreated, true, "input.feedbackDeliveryEnvelopeReport.runtimeProbes.result.boundary.studentVisibleFeedbackDeliveryEnvelopeCreated");
  requireConst(result.boundary?.studentVisibleFeedbackDelivered, true, "input.feedbackDeliveryEnvelopeReport.runtimeProbes.result.boundary.studentVisibleFeedbackDelivered");
  requireConst(result.boundary?.studentOwnScopeEnforced, true, "input.feedbackDeliveryEnvelopeReport.runtimeProbes.result.boundary.studentOwnScopeEnforced");
  requireConst(result.boundary?.durableStudentArchivePersistenceStarted, false, "input.feedbackDeliveryEnvelopeReport.runtimeProbes.result.boundary.durableStudentArchivePersistenceStarted");
  requireConst(result.boundary?.mainDatabaseWriteStarted, false, "input.feedbackDeliveryEnvelopeReport.runtimeProbes.result.boundary.mainDatabaseWriteStarted");
  requireConst(result.boundary?.studentArchiveWriteStarted, false, "input.feedbackDeliveryEnvelopeReport.runtimeProbes.result.boundary.studentArchiveWriteStarted");
  const envelope = assertFeedbackDeliveryEnvelope(result.studentFeedbackDeliveryEnvelope);
  return {
    recordId: requireBoundedString(result.recordId, "input.feedbackDeliveryEnvelopeReport.runtimeProbes.result.recordId", 1, 260),
    deliveryInvocationId: requireToken(result.deliveryInvocationId, "input.feedbackDeliveryEnvelopeReport.runtimeProbes.result.deliveryInvocationId", "feedback_delivery_"),
    sourcePublicationApproval: assertSourcePublicationApproval(result.sourcePublicationApproval, envelope),
    studentFeedbackDeliveryEnvelope: envelope,
    evidenceRefs: uniqueStringArray(result.evidenceRefs, "input.feedbackDeliveryEnvelopeReport.runtimeProbes.result.evidenceRefs", 1, 260),
  };
}

function assertSourcePublicationApproval(approval, envelope) {
  assertPlainObject(approval, "input.feedbackDeliveryEnvelopeReport.sourcePublicationApproval");
  requireConst(approval.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_runtime", "input.feedbackDeliveryEnvelopeReport.sourcePublicationApproval.runtimeId");
  requireConst(approval.approvedFeedbackArtifactId, envelope.approvedFeedbackArtifactId, "input.feedbackDeliveryEnvelopeReport.sourcePublicationApproval.approvedFeedbackArtifactId");
  return {
    recordId: requireBoundedString(approval.recordId, "input.feedbackDeliveryEnvelopeReport.sourcePublicationApproval.recordId", 1, 260),
    approvalId: requireToken(approval.approvalId, "input.feedbackDeliveryEnvelopeReport.sourcePublicationApproval.approvalId", "feedback_publication_approval_"),
    approvedFeedbackArtifactId: envelope.approvedFeedbackArtifactId,
  };
}

function assertFeedbackDeliveryEnvelope(envelope) {
  rejectLeakedFields(envelope, "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope");
  assertPlainObject(envelope, "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope");
  requireConst(envelope.envelopeKind, "STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE", "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.envelopeKind");
  requireConst(envelope.deliveryMode, "STUDENT_APP_RENDERABLE_FEEDBACK_ENVELOPE", "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.deliveryMode");
  requireConst(envelope.channel, "STUDENT_APP", "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.channel");
  requireConst(envelope.audience, "STUDENT_APP_LEARNING_SUPPORT", "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.audience");
  requireConst(envelope.visibilityState, "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED", "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.visibilityState");
  requireConst(envelope.deliveryState, "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED", "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.deliveryState");
  requireConst(envelope.evidencePreserved, true, "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.evidencePreserved");
  requireConst(envelope.approvalPreserved, true, "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.approvalPreserved");
  requireConst(envelope.studentOwnScopeEnforced, true, "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.studentOwnScopeEnforced");
  return {
    envelopeId: requireToken(envelope.envelopeId, "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.envelopeId", "feedback_delivery_env_"),
    envelopeKind: "STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE",
    deliveryMode: "STUDENT_APP_RENDERABLE_FEEDBACK_ENVELOPE",
    channel: "STUDENT_APP",
    audience: "STUDENT_APP_LEARNING_SUPPORT",
    visibilityState: "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED",
    deliveryState: "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED",
    scopeRef: requireStudentScopeRef(envelope.scopeRef, "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.scopeRef"),
    approvalRecordId: requireBoundedString(envelope.approvalRecordId, "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.approvalRecordId", 1, 260),
    approvalId: requireToken(envelope.approvalId, "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.approvalId", "feedback_publication_approval_"),
    approvedFeedbackArtifactId: requireToken(envelope.approvedFeedbackArtifactId, "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.approvedFeedbackArtifactId", "feedback_artifact_"),
    submissionId: requireToken(envelope.submissionId, "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.submissionId", "qbank_ans_sub_"),
    requestId: requireToken(envelope.requestId, "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.requestId", "grading_req_"),
    questionBankDraftRef: requireQuestionBankDraftRef(envelope.questionBankDraftRef, "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireToken(envelope.tutoringAnalysisRequestId, "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.tutoringAnalysisRequestId", "tutor_req_"),
    archiveItemId: requireToken(envelope.archiveItemId, "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.archiveItemId", "tarch_"),
    scoreSummary: requireSafeText(envelope.scoreSummary, "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.scoreSummary", 1, 2000),
    learnerFeedback: assertLearnerFeedback(envelope.learnerFeedback),
  };
}

function assertLearnerFeedback(feedback) {
  assertPlainObject(feedback, "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.learnerFeedback");
  return {
    summary: requireSafeText(feedback.summary, "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.learnerFeedback.summary", 1, 1200),
    encouragement: requireSafeText(feedback.encouragement, "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.learnerFeedback.encouragement", 1, 600),
    nextSteps: uniqueSafeTextArray(feedback.nextSteps, "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.learnerFeedback.nextSteps", 1, 8, 1, 500),
    misconceptionTags: uniqueSafeTextArray(feedback.misconceptionTags ?? [], "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.learnerFeedback.misconceptionTags", 0, 12, 1, 80),
    practiceSuggestions: uniqueSafeTextArray(feedback.practiceSuggestions ?? [], "input.feedbackDeliveryEnvelopeReport.studentFeedbackDeliveryEnvelope.learnerFeedback.practiceSuggestions", 0, 8, 1, 300),
  };
}

function assertPersistenceRequest(request, deliveryRecord) {
  assertPlainObject(request, "input.feedbackArchivePersistenceRequest");
  const envelope = deliveryRecord.studentFeedbackDeliveryEnvelope;
  requireConst(request.persistenceMode, "APPEND_ONLY_STUDENT_ARCHIVE_COMMAND", "input.feedbackArchivePersistenceRequest.persistenceMode");
  requireConst(request.targetArchiveKind, "STUDENT_AI_TUTOR_FEEDBACK_ARCHIVE", "input.feedbackArchivePersistenceRequest.targetArchiveKind");
  requireConst(request.desiredArchiveState, "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED", "input.feedbackArchivePersistenceRequest.desiredArchiveState");
  requireConst(request.scopeRef, envelope.scopeRef, "input.feedbackArchivePersistenceRequest.scopeRef");
  requireConst(request.deliveryEnvelopeRecordId, deliveryRecord.recordId, "input.feedbackArchivePersistenceRequest.deliveryEnvelopeRecordId");
  requireConst(request.deliveryEnvelopeId, envelope.envelopeId, "input.feedbackArchivePersistenceRequest.deliveryEnvelopeId");
  requireConst(request.approvedFeedbackArtifactId, envelope.approvedFeedbackArtifactId, "input.feedbackArchivePersistenceRequest.approvedFeedbackArtifactId");
  requireConst(request.submissionId, envelope.submissionId, "input.feedbackArchivePersistenceRequest.submissionId");
  requireConst(request.requestId, envelope.requestId, "input.feedbackArchivePersistenceRequest.requestId");
  requireConst(request.questionBankDraftRef, envelope.questionBankDraftRef, "input.feedbackArchivePersistenceRequest.questionBankDraftRef");
  requireConst(request.tutoringAnalysisRequestId, envelope.tutoringAnalysisRequestId, "input.feedbackArchivePersistenceRequest.tutoringAnalysisRequestId");
  requireConst(request.archiveItemId, envelope.archiveItemId, "input.feedbackArchivePersistenceRequest.archiveItemId");
  return {
    commandId: requireToken(request.commandId, "input.feedbackArchivePersistenceRequest.commandId", "feedback_archive_cmd_"),
    persistenceMode: "APPEND_ONLY_STUDENT_ARCHIVE_COMMAND",
    targetArchiveKind: "STUDENT_AI_TUTOR_FEEDBACK_ARCHIVE",
    desiredArchiveState: "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
    scopeRef: envelope.scopeRef,
    deliveryEnvelopeRecordId: deliveryRecord.recordId,
    deliveryEnvelopeId: envelope.envelopeId,
    approvedFeedbackArtifactId: envelope.approvedFeedbackArtifactId,
    submissionId: envelope.submissionId,
    requestId: envelope.requestId,
    questionBankDraftRef: envelope.questionBankDraftRef,
    tutoringAnalysisRequestId: envelope.tutoringAnalysisRequestId,
    archiveItemId: envelope.archiveItemId,
  };
}

function assertPersistencePolicy(policy) {
  assertPlainObject(policy, "input.feedbackArchivePersistencePolicy");
  for (const field of [
    "feedbackDeliveryEnvelopeRequired",
    "appendOnlyCommandLogRequired",
    "studentOwnScopeRequired",
    "preserveApprovalEvidenceRequired",
    "preserveLearnerFeedbackRequired",
    "futureDurableArchiveCommitReviewRequired",
  ]) {
    requireConst(policy[field], true, `input.feedbackArchivePersistencePolicy.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed",
    "mainDatabaseWriteAllowed",
    "studentArchiveWriteAllowed",
    "durableArchiveCommitAllowed",
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
    requireConst(policy[field], false, `input.feedbackArchivePersistencePolicy.${field}`);
  }
  return { ...policy };
}

function buildRecord(normalized, recordedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND",
    recordId: `student_app_ai_tutor_question_bank_draft_answer_feedback_archive_persistence_command_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_PORT,
    status: commandStatus,
    persistenceInvocationId: normalized.persistenceInvocationId,
    principal: normalized.principal,
    sourceFeedbackDeliveryEnvelope: {
      runtimeId: deliveryRuntimeId,
      recordId: normalized.deliveryRecord.recordId,
      deliveryInvocationId: normalized.deliveryRecord.deliveryInvocationId,
      envelopeId: normalized.deliveryRecord.studentFeedbackDeliveryEnvelope.envelopeId,
    },
    feedbackArchivePersistenceCommand: buildCommand(normalized),
    boundary: {
      feedbackDeliveryEnvelopeVerified: true,
      publicationApprovalPreserved: true,
      safeLearnerFeedbackOnly: true,
      studentOwnScopeEnforced: true,
      feedbackArchivePersistenceCommandRecorded: true,
      appendOnlyCommandLogRecorded: true,
      durableStudentArchivePersistenceStarted: false,
      durableStudentArchiveCommitStarted: false,
      studentArchivePersisted: false,
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
      requiresFutureDurableArchiveCommitReview: true,
    },
    evidenceRefs: [
      ...normalized.evidenceRefs,
      ...normalized.deliveryRecord.evidenceRefs,
      `evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-input-hash:${normalized.inputHash}`,
    ],
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
  };
}

function buildCommand(normalized) {
  const envelope = normalized.deliveryRecord.studentFeedbackDeliveryEnvelope;
  const request = normalized.persistenceRequest;
  return {
    commandId: request.commandId,
    commandKind: "STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND",
    persistenceMode: request.persistenceMode,
    targetArchiveKind: request.targetArchiveKind,
    desiredArchiveState: request.desiredArchiveState,
    commitState: "NOT_COMMITTED_TO_STUDENT_ARCHIVE",
    scopeRef: request.scopeRef,
    sourceFeedbackDeliveryRecordId: request.deliveryEnvelopeRecordId,
    sourceFeedbackDeliveryEnvelopeId: request.deliveryEnvelopeId,
    approvedFeedbackArtifactId: request.approvedFeedbackArtifactId,
    submissionId: request.submissionId,
    requestId: request.requestId,
    questionBankDraftRef: request.questionBankDraftRef,
    tutoringAnalysisRequestId: request.tutoringAnalysisRequestId,
    archiveItemId: request.archiveItemId,
    scoreSummary: envelope.scoreSummary,
    learnerFeedback: envelope.learnerFeedback,
    evidencePreserved: true,
    approvalEvidencePreserved: true,
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
    throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_IDEMPOTENCY_CONFLICT", "idempotency key already exists with different feedback archive persistence command input");
  }
}

function rejectLeakedFields(value, label) {
  if (!value || typeof value !== "object") return;
  const keys = collectKeys(value);
  for (const field of leakedFieldNames) {
    if (keys.has(field)) {
      throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_LEAKED_FIELD", `${label}.${field} is not allowed`);
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
    throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_INVALID_OBJECT", `${label} must be an object`);
  }
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_CONST", `${label} must be ${String(expected)}`);
  }
  return expected;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string") {
    throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_STRING", `${label} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_STRING_LENGTH", `${label} length is invalid`);
  }
  return trimmed;
}

function requireSafeText(value, label, min, max) {
  const text = requireBoundedString(value, label, min, max);
  if (/[<>]/u.test(text)) {
    throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_UNSAFE_TEXT", `${label} must be encoded safe text`);
  }
  return text;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 260);
  if (!token.startsWith(prefix)) {
    throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireQuestionBankDraftRef(value, label) {
  const ref = requireBoundedString(value, label, 1, 1000);
  if (!ref.startsWith("local://question-bank-drafts/")) {
    throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_DRAFT_REF", `${label} must be a local question-bank draft ref`);
  }
  return ref;
}

function requireStudentScopeRef(value, label) {
  const ref = requireBoundedString(value, label, 1, 160);
  if (!ref.startsWith("student:")) {
    throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_SCOPE_REF", `${label} must be a student scope ref`);
  }
  return ref;
}

function uniqueStringArray(values, label, min, max) {
  if (!Array.isArray(values) || values.length < min) {
    throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_ARRAY", `${label} must contain at least ${min} item`);
  }
  const normalized = [...new Set(values.map((value, index) =>
    requireBoundedString(value, `${label}[${index}]`, 1, max),
  ))];
  if (normalized.length < min) {
    throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_ARRAY_LENGTH", `${label} must contain at least ${min} item`);
  }
  return normalized;
}

function uniqueSafeTextArray(values, label, minItems, maxItems, minLength, maxLength) {
  if (!Array.isArray(values) || values.length < minItems || values.length > maxItems) {
    throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_ARRAY_LENGTH", `${label} length is invalid`);
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

function persistenceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
