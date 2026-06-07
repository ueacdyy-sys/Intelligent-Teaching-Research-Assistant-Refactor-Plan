import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_controlled_draft_source_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE_COMMAND_PORT =
  "StudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSourcePort.recordFeedbackDeliveryEnvelopeFromControlledDraftSource";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE_READY =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_READY";

const inputSchemaVersion = "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source.v1";
const outputSchemaVersion = "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source-recorded.v1";
const approvalRuntimeId = "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_controlled_draft_source_runtime";
const approvalCommandPort = "StudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSourcePort.recordFeedbackPublicationApprovalFromControlledDraftSource";
const approvalWorkloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_CONTROLLED_DRAFT_SOURCE";
const approvedStatus =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVED_FROM_CONTROLLED_DRAFT_SOURCE_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED";
const readyStatus =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_READY_NOT_PERSISTED";
const defaultCommandLogPath =
  "reports/student-command-log/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source.jsonl";

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
  "studentArchivePersistenceResult",
];
const forbiddenText = /(answer key|correct answer|expected answer|raw model|internal error|resultref|result ref|标准答案|参考答案|正确答案|答案解析)/iu;

export function recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource(input, options = {}) {
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

export function formatStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource(result) {
  return [
    `Student App AI Tutor question-bank draft answer feedback delivery envelope from controlled draft source: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Envelope: ${result.studentFeedbackDeliveryEnvelope.envelopeId}`,
    `Source controlled draft: ${result.studentFeedbackDeliveryEnvelope.sourceControlledDraft.artifactId}`,
    `Persisted: ${result.boundary.durableStudentArchivePersistenceStarted}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const deliveryInvocationId = requireToken(input.deliveryInvocationId, "input.deliveryInvocationId", "feedback_delivery_controlled_draft_");
  const principal = assertDeliveryPrincipal(input.principal);
  const approvalReport = assertApprovalReport(input.feedbackPublicationApprovalControlledDraftSourceReport);
  const approvalRecord = assertApprovalRecord(approvalReport);
  const deliveryRequest = assertDeliveryRequest(input.feedbackDeliveryRequest, approvalRecord);
  const policy = assertDeliveryPolicy(input.feedbackDeliveryPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 260);
  for (const required of ["feedback-publication-approval-controlled-draft-source", "feedback-delivery-envelope-controlled-draft-source"]) {
    if (!evidenceRefs.some((ref) => ref.includes(required))) {
      throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_FROM_DRAFT_MISSING_EVIDENCE", `${required} evidence ref is required`);
    }
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const inputHash = hashInput({
    deliveryInvocationId,
    principalId: principal.principalId,
    approvalRecordId: approvalRecord.recordId,
    sourceControlledDraftArtifactId: approvalRecord.sourceControlledFeedbackDraft.artifactId,
    approvalId: approvalRecord.approval.approvalId,
    approvedFeedbackArtifactId: approvalRecord.approvedFeedbackArtifact.artifactId,
    deliveryRequest,
    policy,
  });
  return { deliveryInvocationId, principal, approvalReport, approvalRecord, deliveryRequest, policy, evidenceRefs, idempotencyKey, inputHash };
}

function assertDeliveryPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  requireConst(principal.subjectType, "SERVICE", "input.principal.subjectType");
  requireConst(principal.role, "SERVICE", "input.principal.role");
  requireConst(principal.entryPoint, "STUDENT_DELIVERY_RUNTIME", "input.principal.entryPoint");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  for (const scope of ["TEACHING_READ", "STUDENT_DELIVERY_ENVELOPE", "STUDENT_APP_DELIVERY"]) {
    if (!scopes.includes(scope)) throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_FROM_DRAFT_MISSING_SCOPE", `${scope} is required`);
  }
  return {
    principalId: requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128),
    subjectType: "SERVICE",
    role: "SERVICE",
    entryPoint: "STUDENT_DELIVERY_RUNTIME",
    scopes,
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 160),
  };
}

function assertApprovalReport(report) {
  rejectLeakedFields(report, "input.feedbackPublicationApprovalControlledDraftSourceReport");
  assertPlainObject(report, "input.feedbackPublicationApprovalControlledDraftSourceReport");
  requireConst(report.readiness, "READY", "input.feedbackPublicationApprovalControlledDraftSourceReport.readiness");
  requireConst(report.workloadType, approvalWorkloadType, "input.feedbackPublicationApprovalControlledDraftSourceReport.workloadType");
  requireConst(report.runtime?.runtimeId, approvalRuntimeId, "input.feedbackPublicationApprovalControlledDraftSourceReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, approvalCommandPort, "input.feedbackPublicationApprovalControlledDraftSourceReport.runtime.commandPort");
  requireConst(report.runtime?.status, "APPROVED_FROM_CONTROLLED_DRAFT_SOURCE_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED", "input.feedbackPublicationApprovalControlledDraftSourceReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.feedbackPublicationApprovalControlledDraftSourceReport.runtimeSlo.totalErrors");
  const invariants = report.safetyInvariants ?? {};
  for (const field of [
    "reviewedFeedbackArtifactRequired",
    "controlledDraftSourceRequired",
    "safeStudentResultRequired",
    "humanReviewRequired",
    "humanPublicationApprovalRequired",
    "approvedForStudentVisibleDelivery",
    "futureStudentVisibleDeliveryRuntimeRequired",
  ]) {
    requireConst(invariants[field], true, `input.feedbackPublicationApprovalControlledDraftSourceReport.safetyInvariants.${field}`);
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
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(invariants[field], false, `input.feedbackPublicationApprovalControlledDraftSourceReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertApprovalRecord(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource?.result;
  rejectLeakedFields(result, "input.feedbackPublicationApprovalControlledDraftSourceReport.runtimeProbes.result");
  assertPlainObject(result, "input.feedbackPublicationApprovalControlledDraftSourceReport.runtimeProbes.result");
  requireConst(result.schemaVersion, "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source-recorded.v1", "approval.schemaVersion");
  requireConst(result.recordType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_CONTROLLED_DRAFT_SOURCE", "approval.recordType");
  requireConst(result.runtimeId, approvalRuntimeId, "approval.runtimeId");
  requireConst(result.commandPort, approvalCommandPort, "approval.commandPort");
  requireConst(result.status, approvedStatus, "approval.status");
  for (const field of [
    "controlledDraftSourceVerified",
    "publicationApprovalGranted",
    "approvedForStudentVisibleDelivery",
    "requiresFutureStudentVisibleDeliveryRuntime",
  ]) {
    requireConst(result.boundary?.[field], true, `approval.boundary.${field}`);
  }
  for (const field of [
    "studentVisibleFeedbackPublished",
    "studentVisibleDeliveryEnvelopeCreated",
    "durableStudentArchivePersistenceStarted",
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
    requireConst(result.boundary?.[field], false, `approval.boundary.${field}`);
  }
  const sourceControlledFeedbackDraft = assertSourceControlledDraft(result.sourceControlledFeedbackDraft);
  const artifact = assertApprovedFeedbackArtifact(result.approvedFeedbackArtifact, sourceControlledFeedbackDraft);
  const approval = assertApproval(result.approval, artifact, sourceControlledFeedbackDraft);
  return {
    recordId: requireBoundedString(result.recordId, "approval.recordId", 1, 420),
    approvalInvocationId: requireToken(result.approvalInvocationId, "approval.approvalInvocationId", "feedback_publication_approval_controlled_draft_"),
    sourceControlledFeedbackDraft,
    approval,
    approvedFeedbackArtifact: artifact,
    evidenceRefs: uniqueStringArray(result.evidenceRefs ?? [], "approval.evidenceRefs", 1, 2800),
    inputHash: requireBoundedString(result.inputHash, "approval.inputHash", 12, 128),
  };
}

function assertSourceControlledDraft(draft) {
  assertPlainObject(draft, "approval.sourceControlledFeedbackDraft");
  return {
    runtimeId: requireConst(draft.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_feedback_controlled_draft_runtime", "approval.sourceControlledFeedbackDraft.runtimeId"),
    recordId: requireBoundedString(draft.recordId, "approval.sourceControlledFeedbackDraft.recordId", 1, 420),
    artifactId: requireToken(draft.artifactId, "approval.sourceControlledFeedbackDraft.artifactId", "feedback_controlled_draft_"),
    generationAttemptId: requireToken(draft.generationAttemptId, "approval.sourceControlledFeedbackDraft.generationAttemptId", "feedback_generation_attempt_"),
    executionState: requireConst(draft.executionState, "CONTROLLED_FEEDBACK_DRAFT_RECORDED_NOT_REVIEWED", "approval.sourceControlledFeedbackDraft.executionState"),
    inputHash: requireBoundedString(draft.inputHash, "approval.sourceControlledFeedbackDraft.inputHash", 12, 128),
  };
}

function assertApproval(approval, artifact, sourceControlledFeedbackDraft) {
  assertPlainObject(approval, "approval.approval");
  requireConst(approval.decision, "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY", "approval.approval.decision");
  requireConst(approval.reviewedFeedbackArtifactId, artifact.artifactId, "approval.approval.reviewedFeedbackArtifactId");
  requireConst(approval.sourceControlledDraftArtifactId, sourceControlledFeedbackDraft.artifactId, "approval.approval.sourceControlledDraftArtifactId");
  for (const field of ["submissionId", "requestId", "questionBankDraftRef", "tutoringAnalysisRequestId", "archiveItemId"]) {
    requireConst(approval[field], artifact[field], `approval.approval.${field}`);
  }
  for (const field of [
    "reviewedFeedbackArtifactVerified",
    "controlledDraftSourceVerified",
    "learnerFeedbackReviewed",
    "ageAppropriateConfirmed",
    "studentOwnScopeConfirmed",
    "answerKeyDisclosureBlocked",
    "workerMetadataDisclosureBlocked",
    "rawModelOutputDisclosureBlocked",
    "resultRefDisclosureBlocked",
    "internalErrorsDisclosureBlocked",
    "futureStudentVisibleDeliveryRuntimeRequired",
  ]) {
    requireConst(approval[field], true, `approval.approval.${field}`);
  }
  return {
    approvalId: requireToken(approval.approvalId, "approval.approval.approvalId", "feedback_publication_approval_"),
    reviewedAt: requireIsoString(approval.reviewedAt, "approval.approval.reviewedAt"),
    reviewerPrincipalId: requireBoundedString(approval.reviewerPrincipalId, "approval.approval.reviewerPrincipalId", 1, 128),
    sourceControlledDraftArtifactId: sourceControlledFeedbackDraft.artifactId,
  };
}

function assertApprovedFeedbackArtifact(artifact, sourceControlledFeedbackDraft) {
  rejectLeakedFields(artifact, "approval.approvedFeedbackArtifact");
  assertPlainObject(artifact, "approval.approvedFeedbackArtifact");
  requireConst(artifact.artifactKind, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_ANSWER_REVIEWED_FEEDBACK", "approval.approvedFeedbackArtifact.artifactKind");
  requireConst(artifact.audience, "STUDENT_APP_LEARNING_SUPPORT", "approval.approvedFeedbackArtifact.audience");
  requireConst(artifact.previousVisibilityState, "REVIEWED_NOT_PUBLISHED", "approval.approvedFeedbackArtifact.previousVisibilityState");
  requireConst(artifact.approvalState, "APPROVED_FROM_CONTROLLED_DRAFT_SOURCE_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED", "approval.approvedFeedbackArtifact.approvalState");
  const sourceControlledDraft = assertArtifactSourceControlledDraft(artifact.sourceControlledDraft, sourceControlledFeedbackDraft);
  return {
    artifactId: requireToken(artifact.artifactId, "approval.approvedFeedbackArtifact.artifactId", "feedback_artifact_"),
    artifactKind: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_ANSWER_REVIEWED_FEEDBACK",
    sourceControlledDraft,
    submissionId: requireToken(artifact.submissionId, "approval.approvedFeedbackArtifact.submissionId", "qbank_ans_sub_"),
    requestId: requireToken(artifact.requestId, "approval.approvedFeedbackArtifact.requestId", "grading_req_"),
    questionBankDraftRef: requireQuestionBankDraftRef(artifact.questionBankDraftRef, "approval.approvedFeedbackArtifact.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireToken(artifact.tutoringAnalysisRequestId, "approval.approvedFeedbackArtifact.tutoringAnalysisRequestId", "tutor_req_"),
    archiveItemId: requireToken(artifact.archiveItemId, "approval.approvedFeedbackArtifact.archiveItemId", "tarch_"),
    audience: "STUDENT_APP_LEARNING_SUPPORT",
    scoreSummary: requireSafeText(artifact.scoreSummary, "approval.approvedFeedbackArtifact.scoreSummary", 1, 2000),
    learnerFeedback: assertLearnerFeedback(artifact.learnerFeedback),
  };
}

function assertArtifactSourceControlledDraft(ref, sourceControlledFeedbackDraft) {
  assertPlainObject(ref, "approval.approvedFeedbackArtifact.sourceControlledDraft");
  for (const field of ["runtimeId", "recordId", "artifactId", "generationAttemptId", "inputHash"]) {
    requireConst(ref[field], sourceControlledFeedbackDraft[field], `approval.approvedFeedbackArtifact.sourceControlledDraft.${field}`);
  }
  return {
    ...sourceControlledFeedbackDraft,
    draftFeedbackHash: requireBoundedString(ref.draftFeedbackHash, "approval.approvedFeedbackArtifact.sourceControlledDraft.draftFeedbackHash", 12, 128),
  };
}

function assertLearnerFeedback(feedback) {
  rejectLeakedFields(feedback, "approval.approvedFeedbackArtifact.learnerFeedback");
  assertPlainObject(feedback, "approval.approvedFeedbackArtifact.learnerFeedback");
  return {
    summary: requireSafeText(feedback.summary, "approval.approvedFeedbackArtifact.learnerFeedback.summary", 1, 1200),
    encouragement: requireSafeText(feedback.encouragement, "approval.approvedFeedbackArtifact.learnerFeedback.encouragement", 1, 600),
    nextSteps: uniqueSafeTextArray(feedback.nextSteps, "approval.approvedFeedbackArtifact.learnerFeedback.nextSteps", 1, 8, 1, 500),
    misconceptionTags: uniqueSafeTextArray(feedback.misconceptionTags ?? [], "approval.approvedFeedbackArtifact.learnerFeedback.misconceptionTags", 0, 12, 1, 80),
    practiceSuggestions: uniqueSafeTextArray(feedback.practiceSuggestions ?? [], "approval.approvedFeedbackArtifact.learnerFeedback.practiceSuggestions", 0, 8, 1, 300),
  };
}

function assertDeliveryRequest(request, approvalRecord) {
  assertPlainObject(request, "input.feedbackDeliveryRequest");
  const artifact = approvalRecord.approvedFeedbackArtifact;
  requireConst(request.deliveryMode, "STUDENT_APP_RENDERABLE_FEEDBACK_ENVELOPE", "input.feedbackDeliveryRequest.deliveryMode");
  requireConst(request.channel, "STUDENT_APP", "input.feedbackDeliveryRequest.channel");
  requireConst(request.audienceKind, "STUDENT_APP_LEARNING_SUPPORT", "input.feedbackDeliveryRequest.audienceKind");
  requireConst(request.visibilityState, "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_NOT_PERSISTED", "input.feedbackDeliveryRequest.visibilityState");
  requireConst(request.approvalRecordId, approvalRecord.recordId, "input.feedbackDeliveryRequest.approvalRecordId");
  requireConst(request.approvalId, approvalRecord.approval.approvalId, "input.feedbackDeliveryRequest.approvalId");
  requireConst(request.sourceControlledDraftArtifactId, approvalRecord.sourceControlledFeedbackDraft.artifactId, "input.feedbackDeliveryRequest.sourceControlledDraftArtifactId");
  requireConst(request.approvedFeedbackArtifactId, artifact.artifactId, "input.feedbackDeliveryRequest.approvedFeedbackArtifactId");
  for (const field of ["submissionId", "requestId", "questionBankDraftRef", "tutoringAnalysisRequestId", "archiveItemId"]) {
    requireConst(request[field], artifact[field], `input.feedbackDeliveryRequest.${field}`);
  }
  requireConst(request.studentOwnScopeConfirmed, true, "input.feedbackDeliveryRequest.studentOwnScopeConfirmed");
  requireConst(request.controlledDraftSourceVerified, true, "input.feedbackDeliveryRequest.controlledDraftSourceVerified");
  return {
    envelopeId: requireToken(request.envelopeId, "input.feedbackDeliveryRequest.envelopeId", "feedback_delivery_env_controlled_draft_"),
    deliveryMode: "STUDENT_APP_RENDERABLE_FEEDBACK_ENVELOPE",
    channel: "STUDENT_APP",
    audienceKind: "STUDENT_APP_LEARNING_SUPPORT",
    visibilityState: "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_NOT_PERSISTED",
    scopeRef: requireStudentScopeRef(request.scopeRef, "input.feedbackDeliveryRequest.scopeRef"),
    approvalRecordId: approvalRecord.recordId,
    approvalId: approvalRecord.approval.approvalId,
    sourceControlledDraftArtifactId: approvalRecord.sourceControlledFeedbackDraft.artifactId,
    approvedFeedbackArtifactId: artifact.artifactId,
    submissionId: artifact.submissionId,
    requestId: artifact.requestId,
    questionBankDraftRef: artifact.questionBankDraftRef,
    tutoringAnalysisRequestId: artifact.tutoringAnalysisRequestId,
    archiveItemId: artifact.archiveItemId,
    studentOwnScopeConfirmed: true,
    controlledDraftSourceVerified: true,
  };
}

function assertDeliveryPolicy(policy) {
  assertPlainObject(policy, "input.feedbackDeliveryPolicy");
  for (const field of [
    "publicationApprovalControlledDraftSourceRequired",
    "controlledDraftSourceRequired",
    "studentDeliveryEnvelopeAllowed",
    "studentVisibleFeedbackAllowed",
    "studentOwnScopeRequired",
    "safeLearnerFeedbackRequired",
    "sourceControlledDraftEvidencePreserved",
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
  const sourceControlledDraft = normalized.approvalRecord.sourceControlledFeedbackDraft;
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE",
    recordId: stableRecordId("student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_controlled_draft_source", normalized.idempotencyKey),
    deliveredAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE_COMMAND_PORT,
    status: readyStatus,
    deliveryInvocationId: normalized.deliveryInvocationId,
    principal: normalized.principal,
    sourcePublicationApproval: {
      runtimeId: approvalRuntimeId,
      recordId: normalized.approvalRecord.recordId,
      approvalInvocationId: normalized.approvalRecord.approvalInvocationId,
      approvalId: normalized.approvalRecord.approval.approvalId,
      approvedFeedbackArtifactId: artifact.artifactId,
      sourceControlledDraftArtifactId: sourceControlledDraft.artifactId,
      controlledDraftSourceVerified: true,
    },
    sourceControlledFeedbackDraft: sourceControlledDraft,
    studentFeedbackDeliveryEnvelope: buildEnvelope(normalized),
    boundary: {
      reviewedFeedbackArtifactVerified: true,
      controlledDraftSourceVerified: true,
      publicationApprovalVerified: true,
      safeLearnerFeedbackOnly: true,
      studentOwnScopeEnforced: true,
      sourceControlledDraftEvidencePreserved: true,
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
      `evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source-input-hash:${normalized.inputHash}`,
      `evidence:source-runtime:${approvalRuntimeId}`,
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
    envelopeKind: "STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE",
    deliveryMode: request.deliveryMode,
    channel: request.channel,
    audience: request.audienceKind,
    visibilityState: request.visibilityState,
    deliveryState: "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED",
    scopeRef: request.scopeRef,
    approvalRecordId: request.approvalRecordId,
    approvalId: request.approvalId,
    sourceControlledDraft: artifact.sourceControlledDraft,
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
    controlledDraftSourceEvidencePreserved: true,
    studentOwnScopeEnforced: true,
  };
}

function buildResult(record, replay) {
  return { ...record, ...replay };
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
    throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_FROM_DRAFT_IDEMPOTENCY_CONFLICT", "idempotency key already exists with different controlled-draft-source feedback delivery envelope input");
  }
}

function appendRecord(commandLogPath, record) {
  const absolute = path.resolve(commandLogPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.appendFileSync(absolute, `${JSON.stringify(record)}\n`);
}

function rejectLeakedFields(value, context) {
  if (!value || typeof value !== "object") return;
  const stack = [{ value, path: context }];
  while (stack.length) {
    const current = stack.pop();
    for (const [key, nested] of Object.entries(current.value)) {
      if (leakedFieldNames.includes(key)) throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_FROM_DRAFT_LEAKED_FIELD", `${current.path}.${key} is not allowed`);
      if (nested && typeof nested === "object") stack.push({ value: nested, path: `${current.path}.${key}` });
    }
  }
}

function assertPlainObject(value, context) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_FROM_DRAFT_INVALID_OBJECT", `${context} must be an object`);
}

function requireConst(actual, expected, context) {
  if (actual !== expected) throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_FROM_DRAFT_CONST_MISMATCH", `${context} must be ${expected}`);
  return actual;
}

function requireBoundedString(value, context, min, max) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_FROM_DRAFT_INVALID_STRING", `${context} must be a string with length ${min}-${max}`);
  return value.trim();
}

function requireSafeText(value, context, min, max) {
  const text = requireBoundedString(value, context, min, max);
  if (/[<>]/u.test(text) || forbiddenText.test(text)) throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_FROM_DRAFT_UNSAFE_TEXT", `${context} must not contain HTML, answer keys, raw model details, result refs, or internal errors`);
  return text;
}

function requireToken(value, context, prefix) {
  const token = requireBoundedString(value, context, prefix.length + 1, 420);
  if (!token.startsWith(prefix)) throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_FROM_DRAFT_INVALID_TOKEN", `${context} must start with ${prefix}`);
  return token;
}

function requireQuestionBankDraftRef(value, context) {
  const ref = requireBoundedString(value, context, 12, 420);
  if (!ref.startsWith("local://question-bank-drafts/")) throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_FROM_DRAFT_INVALID_DRAFT_REF", `${context} must use local question-bank draft ref`);
  return ref;
}

function requireStudentScopeRef(value, context) {
  const ref = requireBoundedString(value, context, 9, 160);
  if (!ref.startsWith("student:")) throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_FROM_DRAFT_INVALID_SCOPE_REF", `${context} must be a student scope ref`);
  return ref;
}

function requireIsoString(value, context) {
  const text = requireBoundedString(value, context, 20, 80);
  if (Number.isNaN(Date.parse(text))) throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_FROM_DRAFT_INVALID_TIME", `${context} must be an ISO timestamp`);
  return text;
}

function uniqueStringArray(values, context, min, max) {
  if (!Array.isArray(values) || values.length < min || values.length > max) throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_FROM_DRAFT_INVALID_ARRAY", `${context} must contain ${min}-${max} values`);
  const out = [];
  for (const value of values) {
    const text = requireBoundedString(value, context, 1, 900);
    if (!out.includes(text)) out.push(text);
  }
  return out;
}

function uniqueSafeTextArray(values, context, minItems, maxItems, minLength, maxLength) {
  if (!Array.isArray(values) || values.length < minItems || values.length > maxItems) throw deliveryError("STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_FROM_DRAFT_INVALID_ARRAY", `${context} must contain ${minItems}-${maxItems} values`);
  return [...new Set(values.map((value, index) => requireSafeText(value, `${context}[${index}]`, minLength, maxLength)))];
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function stableRecordId(prefix, idempotencyKey) {
  return `${prefix}_${idempotencyKey.replace(/[^a-zA-Z0-9]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 160)}`;
}

function deliveryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
