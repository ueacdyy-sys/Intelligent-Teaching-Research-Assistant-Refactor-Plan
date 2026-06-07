import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_persistence_command_controlled_draft_source_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE_PORT =
  "StudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSourcePort.recordFeedbackArchivePersistenceCommandFromControlledDraftSource";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE_READY =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE_READY";

const inputSchemaVersion =
  "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source.v1";
const outputSchemaVersion =
  "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source-recorded.v1";
const deliveryRuntimeId =
  "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_controlled_draft_source_runtime";
const deliveryCommandPort =
  "StudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSourcePort.recordFeedbackDeliveryEnvelopeFromControlledDraftSource";
const deliveryWorkloadType =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE_RUNTIME";
const deliveryStatus =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_READY_NOT_PERSISTED";
const deliveryVisibilityState =
  "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_NOT_PERSISTED";
const sourceApprovalRuntimeId =
  "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_controlled_draft_source_runtime";
const commandStatus =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED";
const desiredArchiveState = "PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED";
const defaultCommandLogPath =
  "reports/student-command-log/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source.jsonl";

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
  "modelResponse",
  "workerTrace",
  "internalError",
  "errorMessage",
  "databaseWriteResult",
  "archiveCommitResult",
  "studentArchivePersistenceResult",
];
const forbiddenText = /(answer key|correct answer|expected answer|raw model|internal error|resultref|result ref|标准答案|参考答案|正确答案|答案解析)/iu;

export function recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource(input, options = {}) {
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

export function formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource(result) {
  return [
    `Student App AI Tutor feedback archive persistence command from controlled draft source: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Command: ${result.feedbackArchivePersistenceCommand.commandId}`,
    `Source controlled draft: ${result.sourceControlledFeedbackDraft.artifactId}`,
    `Committed: ${result.boundary.durableStudentArchiveCommitStarted}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const persistenceInvocationId = requireToken(input.persistenceInvocationId, "input.persistenceInvocationId", "feedback_archive_persist_controlled_draft_");
  const principal = assertPersistencePrincipal(input.principal);
  const deliveryReport = assertDeliveryReport(input.feedbackDeliveryEnvelopeControlledDraftSourceReport);
  const deliveryRecord = assertDeliveryRecord(deliveryReport);
  const persistenceRequest = assertPersistenceRequest(input.feedbackArchivePersistenceRequest, deliveryRecord);
  const policy = assertPersistencePolicy(input.feedbackArchivePersistencePolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 280);
  for (const required of ["feedback-delivery-envelope-controlled-draft-source", "feedback-archive-persistence-command-controlled-draft-source"]) {
    if (!evidenceRefs.some((ref) => ref.includes(required))) {
      throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_FROM_DRAFT_MISSING_EVIDENCE", `${required} evidence ref is required`);
    }
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const inputHash = hashInput({
    persistenceInvocationId,
    principalId: principal.principalId,
    deliveryRecordId: deliveryRecord.recordId,
    deliveryEnvelopeId: deliveryRecord.studentFeedbackDeliveryEnvelope.envelopeId,
    sourceControlledDraftArtifactId: deliveryRecord.sourceControlledFeedbackDraft.artifactId,
    persistenceRequest,
    policy,
  });
  return { persistenceInvocationId, principal, deliveryReport, deliveryRecord, persistenceRequest, policy, evidenceRefs, idempotencyKey, inputHash };
}

function assertPersistencePrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  requireConst(principal.subjectType, "SERVICE", "input.principal.subjectType");
  requireConst(principal.role, "SERVICE", "input.principal.role");
  requireConst(principal.entryPoint, "STUDENT_ARCHIVE_PERSISTENCE_RUNTIME", "input.principal.entryPoint");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  for (const scope of ["TEACHING_READ", "STUDENT_ARCHIVE_WRITE", "STUDENT_APP_DELIVERY"]) {
    if (!scopes.includes(scope)) throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_FROM_DRAFT_MISSING_SCOPE", `${scope} is required`);
  }
  return {
    principalId: requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128),
    subjectType: "SERVICE",
    role: "SERVICE",
    entryPoint: "STUDENT_ARCHIVE_PERSISTENCE_RUNTIME",
    scopes,
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 160),
  };
}

function assertDeliveryReport(report) {
  rejectLeakedFields(report, "input.feedbackDeliveryEnvelopeControlledDraftSourceReport");
  assertPlainObject(report, "input.feedbackDeliveryEnvelopeControlledDraftSourceReport");
  requireConst(report.readiness, "READY", "input.feedbackDeliveryEnvelopeControlledDraftSourceReport.readiness");
  requireConst(report.workloadType, deliveryWorkloadType, "input.feedbackDeliveryEnvelopeControlledDraftSourceReport.workloadType");
  requireConst(report.runtime?.runtimeId, deliveryRuntimeId, "input.feedbackDeliveryEnvelopeControlledDraftSourceReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, deliveryCommandPort, "input.feedbackDeliveryEnvelopeControlledDraftSourceReport.runtime.commandPort");
  requireConst(report.runtime?.status, deliveryVisibilityState, "input.feedbackDeliveryEnvelopeControlledDraftSourceReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.feedbackDeliveryEnvelopeControlledDraftSourceReport.runtimeSlo.totalErrors");
  const invariants = report.safetyInvariants ?? {};
  for (const field of [
    "publicationApprovalControlledDraftSourceRequired",
    "controlledDraftSourceRequired",
    "safeLearnerFeedbackRequired",
    "sourceControlledDraftEvidencePreserved",
    "studentDeliveryEnvelopeAllowed",
    "studentVisibleFeedbackAllowed",
    "studentOwnScopeRequired",
    "studentVisibleFeedbackDeliveryEnvelopeCreated",
    "futureDurableArchivePersistenceReviewRequired",
  ]) {
    requireConst(invariants[field], true, `input.feedbackDeliveryEnvelopeControlledDraftSourceReport.safetyInvariants.${field}`);
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
    requireConst(invariants[field], false, `input.feedbackDeliveryEnvelopeControlledDraftSourceReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertDeliveryRecord(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource?.result;
  rejectLeakedFields(result, "input.feedbackDeliveryEnvelopeControlledDraftSourceReport.runtimeProbes.result");
  assertPlainObject(result, "input.feedbackDeliveryEnvelopeControlledDraftSourceReport.runtimeProbes.result");
  requireConst(result.schemaVersion, "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source-recorded.v1", "delivery.schemaVersion");
  requireConst(result.recordType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE", "delivery.recordType");
  requireConst(result.runtimeId, deliveryRuntimeId, "delivery.runtimeId");
  requireConst(result.commandPort, deliveryCommandPort, "delivery.commandPort");
  requireConst(result.status, deliveryStatus, "delivery.status");
  for (const field of [
    "controlledDraftSourceVerified",
    "publicationApprovalVerified",
    "safeLearnerFeedbackOnly",
    "studentOwnScopeEnforced",
    "sourceControlledDraftEvidencePreserved",
    "studentVisibleFeedbackDeliveryEnvelopeCreated",
    "studentVisibleFeedbackDelivered",
  ]) {
    requireConst(result.boundary?.[field], true, `delivery.boundary.${field}`);
  }
  for (const field of [
    "durableStudentArchivePersistenceStarted",
    "mainDatabaseWriteStarted",
    "studentArchiveWriteStarted",
    "answerKeyDisclosed",
    "workerMetadataDisclosed",
    "rawModelOutputDisclosed",
    "resultRefDisclosed",
    "modelInferenceStarted",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(result.boundary?.[field], false, `delivery.boundary.${field}`);
  }
  const sourceControlledFeedbackDraft = assertSourceControlledDraft(result.sourceControlledFeedbackDraft, "delivery.sourceControlledFeedbackDraft");
  const envelope = assertFeedbackDeliveryEnvelope(result.studentFeedbackDeliveryEnvelope, sourceControlledFeedbackDraft);
  const sourcePublicationApproval = assertSourcePublicationApproval(result.sourcePublicationApproval, envelope, sourceControlledFeedbackDraft);
  return {
    recordId: requireBoundedString(result.recordId, "delivery.recordId", 1, 420),
    deliveryInvocationId: requireToken(result.deliveryInvocationId, "delivery.deliveryInvocationId", "feedback_delivery_controlled_draft_"),
    sourcePublicationApproval,
    sourceControlledFeedbackDraft,
    studentFeedbackDeliveryEnvelope: envelope,
    evidenceRefs: uniqueStringArray(result.evidenceRefs ?? [], "delivery.evidenceRefs", 1, 2800),
    inputHash: requireBoundedString(result.inputHash, "delivery.inputHash", 12, 128),
  };
}

function assertSourcePublicationApproval(approval, envelope, sourceControlledFeedbackDraft) {
  assertPlainObject(approval, "delivery.sourcePublicationApproval");
  requireConst(approval.runtimeId, sourceApprovalRuntimeId, "delivery.sourcePublicationApproval.runtimeId");
  requireConst(approval.approvedFeedbackArtifactId, envelope.approvedFeedbackArtifactId, "delivery.sourcePublicationApproval.approvedFeedbackArtifactId");
  requireConst(approval.sourceControlledDraftArtifactId, sourceControlledFeedbackDraft.artifactId, "delivery.sourcePublicationApproval.sourceControlledDraftArtifactId");
  requireConst(approval.controlledDraftSourceVerified, true, "delivery.sourcePublicationApproval.controlledDraftSourceVerified");
  return {
    runtimeId: sourceApprovalRuntimeId,
    recordId: requireBoundedString(approval.recordId, "delivery.sourcePublicationApproval.recordId", 1, 420),
    approvalInvocationId: requireToken(approval.approvalInvocationId, "delivery.sourcePublicationApproval.approvalInvocationId", "feedback_publication_approval_controlled_draft_"),
    approvalId: requireToken(approval.approvalId, "delivery.sourcePublicationApproval.approvalId", "feedback_publication_approval_"),
    approvedFeedbackArtifactId: envelope.approvedFeedbackArtifactId,
    sourceControlledDraftArtifactId: sourceControlledFeedbackDraft.artifactId,
    controlledDraftSourceVerified: true,
  };
}

function assertSourceControlledDraft(draft, label) {
  assertPlainObject(draft, label);
  return {
    runtimeId: requireConst(draft.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_feedback_controlled_draft_runtime", `${label}.runtimeId`),
    recordId: requireBoundedString(draft.recordId, `${label}.recordId`, 1, 420),
    artifactId: requireToken(draft.artifactId, `${label}.artifactId`, "feedback_controlled_draft_"),
    generationAttemptId: requireToken(draft.generationAttemptId, `${label}.generationAttemptId`, "feedback_generation_attempt_"),
    executionState: requireConst(draft.executionState, "CONTROLLED_FEEDBACK_DRAFT_RECORDED_NOT_REVIEWED", `${label}.executionState`),
    inputHash: requireBoundedString(draft.inputHash, `${label}.inputHash`, 12, 128),
    draftFeedbackHash: typeof draft.draftFeedbackHash === "string" ? requireBoundedString(draft.draftFeedbackHash, `${label}.draftFeedbackHash`, 12, 128) : undefined,
  };
}

function assertFeedbackDeliveryEnvelope(envelope, sourceControlledFeedbackDraft) {
  rejectLeakedFields(envelope, "delivery.studentFeedbackDeliveryEnvelope");
  assertPlainObject(envelope, "delivery.studentFeedbackDeliveryEnvelope");
  requireConst(envelope.envelopeKind, "STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE", "delivery.studentFeedbackDeliveryEnvelope.envelopeKind");
  requireConst(envelope.deliveryMode, "STUDENT_APP_RENDERABLE_FEEDBACK_ENVELOPE", "delivery.studentFeedbackDeliveryEnvelope.deliveryMode");
  requireConst(envelope.channel, "STUDENT_APP", "delivery.studentFeedbackDeliveryEnvelope.channel");
  requireConst(envelope.audience, "STUDENT_APP_LEARNING_SUPPORT", "delivery.studentFeedbackDeliveryEnvelope.audience");
  requireConst(envelope.visibilityState, deliveryVisibilityState, "delivery.studentFeedbackDeliveryEnvelope.visibilityState");
  requireConst(envelope.deliveryState, "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED", "delivery.studentFeedbackDeliveryEnvelope.deliveryState");
  requireConst(envelope.evidencePreserved, true, "delivery.studentFeedbackDeliveryEnvelope.evidencePreserved");
  requireConst(envelope.approvalPreserved, true, "delivery.studentFeedbackDeliveryEnvelope.approvalPreserved");
  requireConst(envelope.controlledDraftSourceEvidencePreserved, true, "delivery.studentFeedbackDeliveryEnvelope.controlledDraftSourceEvidencePreserved");
  requireConst(envelope.studentOwnScopeEnforced, true, "delivery.studentFeedbackDeliveryEnvelope.studentOwnScopeEnforced");
  const sourceControlledDraft = assertSourceControlledDraft(envelope.sourceControlledDraft, "delivery.studentFeedbackDeliveryEnvelope.sourceControlledDraft");
  requireConst(sourceControlledDraft.artifactId, sourceControlledFeedbackDraft.artifactId, "delivery.studentFeedbackDeliveryEnvelope.sourceControlledDraft.artifactId");
  return {
    envelopeId: requireToken(envelope.envelopeId, "delivery.studentFeedbackDeliveryEnvelope.envelopeId", "feedback_delivery_env_controlled_draft_"),
    envelopeKind: "STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE",
    deliveryMode: "STUDENT_APP_RENDERABLE_FEEDBACK_ENVELOPE",
    channel: "STUDENT_APP",
    audience: "STUDENT_APP_LEARNING_SUPPORT",
    visibilityState: deliveryVisibilityState,
    deliveryState: "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED",
    scopeRef: requireStudentScopeRef(envelope.scopeRef, "delivery.studentFeedbackDeliveryEnvelope.scopeRef"),
    approvalRecordId: requireBoundedString(envelope.approvalRecordId, "delivery.studentFeedbackDeliveryEnvelope.approvalRecordId", 1, 420),
    approvalId: requireToken(envelope.approvalId, "delivery.studentFeedbackDeliveryEnvelope.approvalId", "feedback_publication_approval_"),
    sourceControlledDraft,
    approvedFeedbackArtifactId: requireToken(envelope.approvedFeedbackArtifactId, "delivery.studentFeedbackDeliveryEnvelope.approvedFeedbackArtifactId", "feedback_artifact_"),
    submissionId: requireToken(envelope.submissionId, "delivery.studentFeedbackDeliveryEnvelope.submissionId", "qbank_ans_sub_"),
    requestId: requireToken(envelope.requestId, "delivery.studentFeedbackDeliveryEnvelope.requestId", "grading_req_"),
    questionBankDraftRef: requireQuestionBankDraftRef(envelope.questionBankDraftRef, "delivery.studentFeedbackDeliveryEnvelope.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireToken(envelope.tutoringAnalysisRequestId, "delivery.studentFeedbackDeliveryEnvelope.tutoringAnalysisRequestId", "tutor_req_"),
    archiveItemId: requireToken(envelope.archiveItemId, "delivery.studentFeedbackDeliveryEnvelope.archiveItemId", "tarch_"),
    scoreSummary: requireSafeText(envelope.scoreSummary, "delivery.studentFeedbackDeliveryEnvelope.scoreSummary", 1, 2000),
    learnerFeedback: assertLearnerFeedback(envelope.learnerFeedback),
  };
}

function assertLearnerFeedback(feedback) {
  rejectLeakedFields(feedback, "delivery.studentFeedbackDeliveryEnvelope.learnerFeedback");
  assertPlainObject(feedback, "delivery.studentFeedbackDeliveryEnvelope.learnerFeedback");
  return {
    summary: requireSafeText(feedback.summary, "delivery.studentFeedbackDeliveryEnvelope.learnerFeedback.summary", 1, 1200),
    encouragement: requireSafeText(feedback.encouragement, "delivery.studentFeedbackDeliveryEnvelope.learnerFeedback.encouragement", 1, 600),
    nextSteps: uniqueSafeTextArray(feedback.nextSteps, "delivery.studentFeedbackDeliveryEnvelope.learnerFeedback.nextSteps", 1, 8, 1, 500),
    misconceptionTags: uniqueSafeTextArray(feedback.misconceptionTags ?? [], "delivery.studentFeedbackDeliveryEnvelope.learnerFeedback.misconceptionTags", 0, 12, 1, 80),
    practiceSuggestions: uniqueSafeTextArray(feedback.practiceSuggestions ?? [], "delivery.studentFeedbackDeliveryEnvelope.learnerFeedback.practiceSuggestions", 0, 8, 1, 300),
  };
}

function assertPersistenceRequest(request, deliveryRecord) {
  assertPlainObject(request, "input.feedbackArchivePersistenceRequest");
  const envelope = deliveryRecord.studentFeedbackDeliveryEnvelope;
  requireConst(request.persistenceMode, "APPEND_ONLY_STUDENT_ARCHIVE_COMMAND", "input.feedbackArchivePersistenceRequest.persistenceMode");
  requireConst(request.targetArchiveKind, "STUDENT_AI_TUTOR_FEEDBACK_ARCHIVE", "input.feedbackArchivePersistenceRequest.targetArchiveKind");
  requireConst(request.desiredArchiveState, desiredArchiveState, "input.feedbackArchivePersistenceRequest.desiredArchiveState");
  requireConst(request.scopeRef, envelope.scopeRef, "input.feedbackArchivePersistenceRequest.scopeRef");
  requireConst(request.deliveryEnvelopeRecordId, deliveryRecord.recordId, "input.feedbackArchivePersistenceRequest.deliveryEnvelopeRecordId");
  requireConst(request.deliveryEnvelopeId, envelope.envelopeId, "input.feedbackArchivePersistenceRequest.deliveryEnvelopeId");
  requireConst(request.approvalRecordId, envelope.approvalRecordId, "input.feedbackArchivePersistenceRequest.approvalRecordId");
  requireConst(request.approvalId, envelope.approvalId, "input.feedbackArchivePersistenceRequest.approvalId");
  requireConst(request.sourceControlledDraftArtifactId, envelope.sourceControlledDraft.artifactId, "input.feedbackArchivePersistenceRequest.sourceControlledDraftArtifactId");
  requireConst(request.approvedFeedbackArtifactId, envelope.approvedFeedbackArtifactId, "input.feedbackArchivePersistenceRequest.approvedFeedbackArtifactId");
  for (const field of ["submissionId", "requestId", "questionBankDraftRef", "tutoringAnalysisRequestId", "archiveItemId"]) {
    requireConst(request[field], envelope[field], `input.feedbackArchivePersistenceRequest.${field}`);
  }
  return {
    commandId: requireToken(request.commandId, "input.feedbackArchivePersistenceRequest.commandId", "feedback_archive_cmd_controlled_draft_"),
    persistenceMode: "APPEND_ONLY_STUDENT_ARCHIVE_COMMAND",
    targetArchiveKind: "STUDENT_AI_TUTOR_FEEDBACK_ARCHIVE",
    desiredArchiveState,
    scopeRef: envelope.scopeRef,
    deliveryEnvelopeRecordId: deliveryRecord.recordId,
    deliveryEnvelopeId: envelope.envelopeId,
    approvalRecordId: envelope.approvalRecordId,
    approvalId: envelope.approvalId,
    sourceControlledDraftArtifactId: envelope.sourceControlledDraft.artifactId,
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
    "feedbackDeliveryEnvelopeControlledDraftSourceRequired",
    "sourceControlledDraftEvidenceRequired",
    "appendOnlyCommandLogRequired",
    "studentOwnScopeRequired",
    "preserveControlledDraftSourceEvidenceRequired",
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
  const envelope = normalized.deliveryRecord.studentFeedbackDeliveryEnvelope;
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE",
    recordId: stableRecordId("student_app_ai_tutor_question_bank_draft_answer_feedback_archive_persistence_command_controlled_draft_source", normalized.idempotencyKey),
    recordedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE_PORT,
    status: commandStatus,
    persistenceInvocationId: normalized.persistenceInvocationId,
    principal: normalized.principal,
    sourceFeedbackDeliveryEnvelope: {
      runtimeId: deliveryRuntimeId,
      recordId: normalized.deliveryRecord.recordId,
      deliveryInvocationId: normalized.deliveryRecord.deliveryInvocationId,
      envelopeId: envelope.envelopeId,
      sourceControlledDraftArtifactId: envelope.sourceControlledDraft.artifactId,
      controlledDraftSourceVerified: true,
    },
    sourcePublicationApproval: normalized.deliveryRecord.sourcePublicationApproval,
    sourceControlledFeedbackDraft: envelope.sourceControlledDraft,
    feedbackArchivePersistenceCommand: buildCommand(normalized),
    boundary: {
      feedbackDeliveryEnvelopeControlledDraftSourceVerified: true,
      controlledDraftSourceVerified: true,
      publicationApprovalPreserved: true,
      sourceControlledDraftEvidencePreserved: true,
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
      `evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source-input-hash:${normalized.inputHash}`,
      `evidence:source-runtime:${deliveryRuntimeId}`,
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
    commandKind: "STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE",
    persistenceMode: request.persistenceMode,
    targetArchiveKind: request.targetArchiveKind,
    desiredArchiveState: request.desiredArchiveState,
    commitState: "NOT_COMMITTED_TO_STUDENT_ARCHIVE",
    scopeRef: request.scopeRef,
    sourceFeedbackDeliveryRecordId: request.deliveryEnvelopeRecordId,
    sourceFeedbackDeliveryEnvelopeId: request.deliveryEnvelopeId,
    approvalRecordId: request.approvalRecordId,
    approvalId: request.approvalId,
    sourceControlledDraftArtifactId: request.sourceControlledDraftArtifactId,
    approvedFeedbackArtifactId: request.approvedFeedbackArtifactId,
    submissionId: request.submissionId,
    requestId: request.requestId,
    questionBankDraftRef: request.questionBankDraftRef,
    tutoringAnalysisRequestId: request.tutoringAnalysisRequestId,
    archiveItemId: request.archiveItemId,
    scoreSummary: envelope.scoreSummary,
    learnerFeedback: envelope.learnerFeedback,
    sourceControlledDraft: envelope.sourceControlledDraft,
    evidencePreserved: true,
    approvalEvidencePreserved: true,
    sourceControlledDraftEvidencePreserved: true,
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
    throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_FROM_DRAFT_IDEMPOTENCY_CONFLICT", "idempotency key already exists with different controlled-source archive persistence input");
  }
}

function rejectLeakedFields(value, label) {
  if (!value || typeof value !== "object") return;
  const keys = collectKeys(value);
  for (const field of leakedFieldNames) {
    if (keys.has(field)) throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_FROM_DRAFT_LEAKED_FIELD", `${label}.${field} is not allowed`);
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
    throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_FROM_DRAFT_INVALID_OBJECT", `${label} must be an object`);
  }
}

function requireConst(actual, expected, label) {
  if (actual !== expected) throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_FROM_DRAFT_CONST", `${label} must be ${String(expected)}`);
  return expected;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string") throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_FROM_DRAFT_STRING", `${label} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_FROM_DRAFT_STRING_LENGTH", `${label} length is invalid`);
  }
  return trimmed;
}

function requireSafeText(value, label, min, max) {
  const text = requireBoundedString(value, label, min, max);
  if (/[<>]/u.test(text) || forbiddenText.test(text)) {
    throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_FROM_DRAFT_UNSAFE_TEXT", `${label} must be encoded safe learner feedback text`);
  }
  return text;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 420);
  if (!token.startsWith(prefix)) throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_FROM_DRAFT_TOKEN", `${label} must start with ${prefix}`);
  return token;
}

function requireQuestionBankDraftRef(value, label) {
  const ref = requireBoundedString(value, label, 1, 1000);
  if (!ref.startsWith("local://question-bank-drafts/")) {
    throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_FROM_DRAFT_DRAFT_REF", `${label} must be a local question-bank draft ref`);
  }
  return ref;
}

function requireStudentScopeRef(value, label) {
  const ref = requireBoundedString(value, label, 1, 160);
  if (!ref.startsWith("student:")) throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_FROM_DRAFT_SCOPE_REF", `${label} must be a student scope ref`);
  return ref;
}

function uniqueStringArray(values, label, min, max) {
  if (!Array.isArray(values) || values.length < min) {
    throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_FROM_DRAFT_ARRAY", `${label} must contain at least ${min} item`);
  }
  const normalized = [...new Set(values.map((value, index) => requireBoundedString(value, `${label}[${index}]`, 1, max)))];
  if (normalized.length < min) {
    throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_FROM_DRAFT_ARRAY_LENGTH", `${label} must contain at least ${min} item`);
  }
  return normalized;
}

function uniqueSafeTextArray(values, label, minItems, maxItems, minLength, maxLength) {
  if (!Array.isArray(values) || values.length < minItems || values.length > maxItems) {
    throw persistenceError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_FROM_DRAFT_ARRAY_LENGTH", `${label} length is invalid`);
  }
  return [...new Set(values.map((value, index) => requireSafeText(value, `${label}[${index}]`, minLength, maxLength)))];
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function stableRecordId(prefix, key) {
  return `${prefix}_${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
}

function persistenceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
