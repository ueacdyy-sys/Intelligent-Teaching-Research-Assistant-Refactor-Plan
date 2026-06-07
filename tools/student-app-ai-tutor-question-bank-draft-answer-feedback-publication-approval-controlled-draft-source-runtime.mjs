import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_controlled_draft_source_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_CONTROLLED_DRAFT_SOURCE_PORT =
  "StudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSourcePort.recordFeedbackPublicationApprovalFromControlledDraftSource";

const inputSchemaVersion = "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source.v1";
const outputSchemaVersion = "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source-recorded.v1";
const sourceRuntimeId = "student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_controlled_draft_source_runtime";
const sourceCommandPort = "StudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSourcePort.recordReviewedFeedbackArtifactFromControlledDraft";
const sourceWorkloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_CONTROLLED_DRAFT_SOURCE";
const approvedDecision = "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY";
const approvedStatus =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVED_FROM_CONTROLLED_DRAFT_SOURCE_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED";
const defaultCommandLogPath =
  "reports/student-command-log/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source.jsonl";

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
  "publishedAt",
  "deliveredAt",
  "studentDeliveryEnvelope",
];
const forbiddenText = /(answer key|correct answer|expected answer|raw model|internal error|resultref|result ref|标准答案|参考答案|正确答案|答案解析)/iu;

export function recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource(input, options = {}) {
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

export function formatStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource(result) {
  return [
    `Student App AI Tutor question-bank draft answer feedback publication approval from controlled draft source: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Source reviewed artifact: ${result.sourceReviewedFeedbackArtifact.artifactId}`,
    `Source controlled draft: ${result.sourceControlledFeedbackDraft.artifactId}`,
    `Student-visible feedback published: ${result.boundary.studentVisibleFeedbackPublished}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const approvalInvocationId = requireToken(input.approvalInvocationId, "input.approvalInvocationId", "feedback_publication_approval_controlled_draft_");
  const principal = assertApproverPrincipal(input.principal);
  const sourceReport = assertSourceReport(input.reviewedFeedbackArtifactControlledDraftSourceReport);
  const sourceRecord = assertSourceRecord(sourceReport);
  const approval = assertApproval(input.feedbackPublicationApproval, principal, sourceRecord);
  const policy = assertApprovalPolicy(input.feedbackPublicationApprovalPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 260);
  for (const required of ["reviewed-feedback-artifact-controlled-draft-source", "feedback-publication-approval-controlled-draft-source"]) {
    if (!evidenceRefs.some((ref) => ref.includes(required))) {
      throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_FROM_DRAFT_MISSING_EVIDENCE", `${required} evidence ref is required`);
    }
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const inputHash = hashInput({
    approvalInvocationId,
    approverPrincipalId: principal.principalId,
    sourceReviewedArtifactRecordId: sourceRecord.recordId,
    sourceControlledDraftArtifactId: sourceRecord.sourceControlledFeedbackDraft.artifactId,
    reviewedArtifactId: sourceRecord.reviewedFeedbackArtifact.artifactId,
    approval,
    policy,
  });
  return { approvalInvocationId, principal, sourceReport, sourceRecord, approval, policy, evidenceRefs, idempotencyKey, inputHash };
}

function assertApproverPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  const role = requireOneOf(principal.role, "input.principal.role", ["TEACHER", "ADMIN"]);
  if (role === "TEACHER" && !scopes.includes("TEACHING_READ")) {
    throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_FROM_DRAFT_SCOPE_MISSING", "TEACHER approver must include TEACHING_READ");
  }
  if (!scopes.includes("FEEDBACK_PUBLISH_APPROVE") && !scopes.includes("ADMIN_SYSTEM")) {
    throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_FROM_DRAFT_SCOPE_MISSING", "FEEDBACK_PUBLISH_APPROVE or ADMIN_SYSTEM is required");
  }
  return {
    principalId: requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128),
    subjectType: requireConst(principal.subjectType, "USER", "input.principal.subjectType"),
    role,
    entryPoint: requireOneOf(principal.entryPoint, "input.principal.entryPoint", ["DESKTOP_TEACHER", "ADMIN_CONSOLE"]),
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 160),
    scopes,
  };
}

function assertSourceReport(report) {
  rejectLeakedFields(report, "input.reviewedFeedbackArtifactControlledDraftSourceReport");
  assertPlainObject(report, "input.reviewedFeedbackArtifactControlledDraftSourceReport");
  requireConst(report.readiness, "READY", "input.reviewedFeedbackArtifactControlledDraftSourceReport.readiness");
  requireConst(report.workloadType, sourceWorkloadType, "input.reviewedFeedbackArtifactControlledDraftSourceReport.workloadType");
  requireConst(report.runtime?.runtimeId, sourceRuntimeId, "input.reviewedFeedbackArtifactControlledDraftSourceReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, sourceCommandPort, "input.reviewedFeedbackArtifactControlledDraftSourceReport.runtime.commandPort");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.reviewedFeedbackArtifactControlledDraftSourceReport.runtimeSlo.totalErrors");
  const invariants = report.safetyInvariants ?? {};
  for (const field of ["controlledFeedbackDraftRequired", "controlledDraftSourceVerified", "safeStudentResultRequired", "humanReviewRequired", "reviewedFeedbackArtifactRecorded", "publicationApprovalRequired"]) {
    requireConst(invariants[field], true, `input.reviewedFeedbackArtifactControlledDraftSourceReport.safetyInvariants.${field}`);
  }
  for (const field of ["studentVisibleFeedbackAllowed", "answerKeyDisclosureAllowed", "workerMetadataDisclosureAllowed", "rawModelOutputDisclosureAllowed", "resultRefDisclosureAllowed", "modelInferenceAllowed", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "remoteDeviceControlAllowed", "localToolMutationAllowed", "swarmAllowed"]) {
    requireConst(invariants[field], false, `input.reviewedFeedbackArtifactControlledDraftSourceReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertSourceRecord(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource?.result;
  rejectLeakedFields(result, "source.reviewedFeedbackArtifactControlledDraftSourceResult");
  assertPlainObject(result, "source.reviewedFeedbackArtifactControlledDraftSourceResult");
  requireConst(result.schemaVersion, "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source-recorded.v1", "source.schemaVersion");
  requireConst(result.recordType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_CONTROLLED_DRAFT_SOURCE", "source.recordType");
  requireConst(result.runtimeId, sourceRuntimeId, "source.runtimeId");
  requireConst(result.commandPort, sourceCommandPort, "source.commandPort");
  requireConst(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_FROM_CONTROLLED_DRAFT_RECORDED", "source.status");
  for (const field of ["controlledFeedbackDraftSourceVerified", "reviewedFeedbackArtifactRecorded", "humanReviewCompleted", "publicationApprovalRequired"]) {
    requireConst(result.boundary?.[field], true, `source.boundary.${field}`);
  }
  for (const field of ["publicationApproved", "studentVisibleFeedbackPublished", "answerKeyDisclosed", "workerMetadataDisclosed", "rawModelOutputStored", "rawModelOutputDisclosed", "resultRefDisclosed", "modelInferenceStarted", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "remoteDeviceControlAllowed", "localToolMutationAllowed", "swarmAllowed"]) {
    requireConst(result.boundary?.[field], false, `source.boundary.${field}`);
  }
  const sourceDraft = assertSourceControlledDraft(result.sourceControlledFeedbackDraft);
  const artifact = assertReviewedFeedbackArtifact(result.reviewedFeedbackArtifact, sourceDraft);
  return {
    recordId: requireBoundedString(result.recordId, "source.recordId", 1, 420),
    reviewInvocationId: requireToken(result.reviewInvocationId, "source.reviewInvocationId", "feedback_controlled_draft_review_"),
    sourceControlledFeedbackDraft: sourceDraft,
    studentScoringResult: assertStudentScoringResult(result.studentScoringResult, artifact),
    reviewedFeedbackArtifact: artifact,
    evidenceRefs: uniqueStringArray(result.evidenceRefs ?? [], "source.evidenceRefs", 1, 2600),
    inputHash: requireBoundedString(result.inputHash, "source.inputHash", 12, 128),
  };
}

function assertSourceControlledDraft(draft) {
  assertPlainObject(draft, "source.sourceControlledFeedbackDraft");
  return {
    runtimeId: requireConst(draft.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_feedback_controlled_draft_runtime", "source.sourceControlledFeedbackDraft.runtimeId"),
    recordId: requireBoundedString(draft.recordId, "source.sourceControlledFeedbackDraft.recordId", 1, 420),
    artifactId: requireToken(draft.artifactId, "source.sourceControlledFeedbackDraft.artifactId", "feedback_controlled_draft_"),
    generationAttemptId: requireToken(draft.generationAttemptId, "source.sourceControlledFeedbackDraft.generationAttemptId", "feedback_generation_attempt_"),
    executionState: requireConst(draft.executionState, "CONTROLLED_FEEDBACK_DRAFT_RECORDED_NOT_REVIEWED", "source.sourceControlledFeedbackDraft.executionState"),
    inputHash: requireBoundedString(draft.inputHash, "source.sourceControlledFeedbackDraft.inputHash", 12, 128),
  };
}

function assertStudentScoringResult(scoring, artifact) {
  assertPlainObject(scoring, "source.studentScoringResult");
  requireConst(scoring.submissionId, artifact.submissionId, "source.studentScoringResult.submissionId");
  requireConst(scoring.requestId, artifact.requestId, "source.studentScoringResult.requestId");
  requireConst(scoring.questionBankDraftRef, artifact.questionBankDraftRef, "source.studentScoringResult.questionBankDraftRef");
  requireConst(scoring.tutoringAnalysisRequestId, artifact.tutoringAnalysisRequestId, "source.studentScoringResult.tutoringAnalysisRequestId");
  requireConst(scoring.archiveItemId, artifact.archiveItemId, "source.studentScoringResult.archiveItemId");
  return {
    submissionId: artifact.submissionId,
    requestId: artifact.requestId,
    questionBankDraftRef: artifact.questionBankDraftRef,
    tutoringAnalysisRequestId: artifact.tutoringAnalysisRequestId,
    archiveItemId: artifact.archiveItemId,
    status: requireConst(scoring.status, "SUCCEEDED", "source.studentScoringResult.status"),
    scoreSummary: requireConst(scoring.scoreSummary, artifact.scoreSummary, "source.studentScoringResult.scoreSummary"),
  };
}

function assertReviewedFeedbackArtifact(artifact, sourceDraft) {
  rejectLeakedFields(artifact, "source.reviewedFeedbackArtifact");
  assertPlainObject(artifact, "source.reviewedFeedbackArtifact");
  const sourceControlledDraft = assertArtifactSourceControlledDraft(artifact.sourceControlledDraft, sourceDraft);
  const review = assertSourceReview(artifact.review);
  return {
    artifactId: requireToken(artifact.artifactId, "source.reviewedFeedbackArtifact.artifactId", "feedback_artifact_"),
    artifactKind: requireConst(artifact.artifactKind, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_ANSWER_REVIEWED_FEEDBACK", "source.reviewedFeedbackArtifact.artifactKind"),
    sourceControlledDraft,
    submissionId: requireToken(artifact.submissionId, "source.reviewedFeedbackArtifact.submissionId", "qbank_ans_sub_"),
    requestId: requireToken(artifact.requestId, "source.reviewedFeedbackArtifact.requestId", "grading_req_"),
    questionBankDraftRef: requireQuestionBankDraftRef(artifact.questionBankDraftRef, "source.reviewedFeedbackArtifact.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireToken(artifact.tutoringAnalysisRequestId, "source.reviewedFeedbackArtifact.tutoringAnalysisRequestId", "tutor_req_"),
    archiveItemId: requireToken(artifact.archiveItemId, "source.reviewedFeedbackArtifact.archiveItemId", "tarch_"),
    audience: requireConst(artifact.audience, "STUDENT_APP_LEARNING_SUPPORT", "source.reviewedFeedbackArtifact.audience"),
    visibilityState: requireConst(artifact.visibilityState, "REVIEWED_NOT_PUBLISHED", "source.reviewedFeedbackArtifact.visibilityState"),
    scoreSummary: requireSafeText(artifact.scoreSummary, "source.reviewedFeedbackArtifact.scoreSummary", 1, 2000),
    learnerFeedback: assertLearnerFeedback(artifact.learnerFeedback, "source.reviewedFeedbackArtifact.learnerFeedback"),
    review,
    reviewedFromControlledDraft: requireConst(artifact.reviewedFromControlledDraft, true, "source.reviewedFeedbackArtifact.reviewedFromControlledDraft"),
    publicationApproved: requireConst(artifact.publicationApproved, false, "source.reviewedFeedbackArtifact.publicationApproved"),
    studentVisibleFeedbackPublished: requireConst(artifact.studentVisibleFeedbackPublished, false, "source.reviewedFeedbackArtifact.studentVisibleFeedbackPublished"),
  };
}

function assertArtifactSourceControlledDraft(ref, sourceDraft) {
  assertPlainObject(ref, "source.reviewedFeedbackArtifact.sourceControlledDraft");
  requireConst(ref.runtimeId, sourceDraft.runtimeId, "source.reviewedFeedbackArtifact.sourceControlledDraft.runtimeId");
  requireConst(ref.recordId, sourceDraft.recordId, "source.reviewedFeedbackArtifact.sourceControlledDraft.recordId");
  requireConst(ref.artifactId, sourceDraft.artifactId, "source.reviewedFeedbackArtifact.sourceControlledDraft.artifactId");
  requireConst(ref.generationAttemptId, sourceDraft.generationAttemptId, "source.reviewedFeedbackArtifact.sourceControlledDraft.generationAttemptId");
  requireConst(ref.inputHash, sourceDraft.inputHash, "source.reviewedFeedbackArtifact.sourceControlledDraft.inputHash");
  return {
    runtimeId: sourceDraft.runtimeId,
    recordId: sourceDraft.recordId,
    artifactId: sourceDraft.artifactId,
    generationAttemptId: sourceDraft.generationAttemptId,
    inputHash: sourceDraft.inputHash,
    draftFeedbackHash: requireBoundedString(ref.draftFeedbackHash, "source.reviewedFeedbackArtifact.sourceControlledDraft.draftFeedbackHash", 12, 128),
  };
}

function assertSourceReview(review) {
  assertPlainObject(review, "source.reviewedFeedbackArtifact.review");
  for (const field of ["humanReviewed", "controlledDraftSourceVerified", "ageAppropriate", "studentOwnScopeConfirmed", "answerKeyRemoved", "workerMetadataRemoved", "rawModelOutputRemoved", "resultRefRemoved", "internalErrorsRemoved", "publicationApprovalRequired"]) {
    requireConst(review[field], true, `source.reviewedFeedbackArtifact.review.${field}`);
  }
  requireConst(review.publicationApproved, false, "source.reviewedFeedbackArtifact.review.publicationApproved");
  return {
    reviewId: requireToken(review.reviewId, "source.reviewedFeedbackArtifact.review.reviewId", "feedback_review_"),
    reviewerPrincipalId: requireBoundedString(review.reviewerPrincipalId, "source.reviewedFeedbackArtifact.review.reviewerPrincipalId", 1, 128),
    reviewedAt: requireIsoString(review.reviewedAt, "source.reviewedFeedbackArtifact.review.reviewedAt"),
    controlledDraftSourceVerified: true,
  };
}

function assertLearnerFeedback(feedback, context) {
  rejectLeakedFields(feedback, context);
  assertPlainObject(feedback, context);
  return {
    summary: requireSafeText(feedback.summary, `${context}.summary`, 1, 1200),
    encouragement: requireSafeText(feedback.encouragement, `${context}.encouragement`, 1, 600),
    nextSteps: uniqueSafeTextArray(feedback.nextSteps, `${context}.nextSteps`, 1, 8, 1, 500),
    misconceptionTags: uniqueSafeTextArray(feedback.misconceptionTags ?? [], `${context}.misconceptionTags`, 0, 12, 1, 80),
    practiceSuggestions: uniqueSafeTextArray(feedback.practiceSuggestions ?? [], `${context}.practiceSuggestions`, 0, 8, 1, 300),
  };
}

function assertApproval(approval, principal, sourceRecord) {
  assertPlainObject(approval, "input.feedbackPublicationApproval");
  const artifact = sourceRecord.reviewedFeedbackArtifact;
  requireConst(approval.decision, approvedDecision, "input.feedbackPublicationApproval.decision");
  requireConst(approval.reviewerPrincipalId, principal.principalId, "input.feedbackPublicationApproval.reviewerPrincipalId");
  requireConst(approval.reviewedFeedbackArtifactId, artifact.artifactId, "input.feedbackPublicationApproval.reviewedFeedbackArtifactId");
  requireConst(approval.sourceControlledDraftArtifactId, sourceRecord.sourceControlledFeedbackDraft.artifactId, "input.feedbackPublicationApproval.sourceControlledDraftArtifactId");
  for (const field of ["submissionId", "requestId", "questionBankDraftRef", "tutoringAnalysisRequestId", "archiveItemId"]) {
    requireConst(approval[field], artifact[field], `input.feedbackPublicationApproval.${field}`);
  }
  for (const field of ["reviewedFeedbackArtifactVerified", "controlledDraftSourceVerified", "learnerFeedbackReviewed", "ageAppropriateConfirmed", "studentOwnScopeConfirmed", "answerKeyDisclosureBlocked", "workerMetadataDisclosureBlocked", "rawModelOutputDisclosureBlocked", "resultRefDisclosureBlocked", "internalErrorsDisclosureBlocked", "futureStudentVisibleDeliveryRuntimeRequired"]) {
    requireConst(approval[field], true, `input.feedbackPublicationApproval.${field}`);
  }
  for (const field of ["studentVisibleFeedbackPublished", "studentVisibleDeliveryEnvelopeCreated", "databaseWriteApproved", "modelInferenceApproved", "remoteDeviceControlApproved", "localToolMutationApproved", "swarmApproved"]) {
    requireConst(approval[field], false, `input.feedbackPublicationApproval.${field}`);
  }
  return { ...approval, approvalId: requireToken(approval.approvalId, "input.feedbackPublicationApproval.approvalId", "feedback_publication_approval_"), comments: requireSafeText(approval.comments, "input.feedbackPublicationApproval.comments", 1, 1200) };
}

function assertApprovalPolicy(policy) {
  assertPlainObject(policy, "input.feedbackPublicationApprovalPolicy");
  for (const field of ["reviewedFeedbackArtifactRequired", "controlledDraftSourceRequired", "humanPublicationApprovalRequired", "safeStudentResultRequired", "studentOwnScopeRequired", "futureStudentVisibleDeliveryRuntimeRequired", "approvalEvidenceRequired"]) {
    requireConst(policy[field], true, `input.feedbackPublicationApprovalPolicy.${field}`);
  }
  for (const field of ["studentVisibleFeedbackPublished", "studentVisibleDeliveryEnvelopeCreated", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "answerKeyDisclosureAllowed", "workerMetadataDisclosureAllowed", "rawModelOutputDisclosureAllowed", "resultRefDisclosureAllowed", "remoteDeviceControlAllowed", "localToolMutationAllowed", "swarmAllowed"]) {
    requireConst(policy[field], false, `input.feedbackPublicationApprovalPolicy.${field}`);
  }
  return { ...policy };
}

function buildRecord(normalized, approvedAt) {
  const artifact = normalized.sourceRecord.reviewedFeedbackArtifact;
  const sourceDraft = normalized.sourceRecord.sourceControlledFeedbackDraft;
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_CONTROLLED_DRAFT_SOURCE",
    recordId: stableRecordId("student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_controlled_draft_source", normalized.idempotencyKey),
    approvedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_CONTROLLED_DRAFT_SOURCE_PORT,
    status: approvedStatus,
    approvalInvocationId: normalized.approvalInvocationId,
    principal: normalized.principal,
    sourceReviewedFeedbackArtifact: {
      runtimeId: sourceRuntimeId,
      recordId: normalized.sourceRecord.recordId,
      reviewInvocationId: normalized.sourceRecord.reviewInvocationId,
      artifactId: artifact.artifactId,
      reviewedFromControlledDraft: true,
    },
    sourceControlledFeedbackDraft: sourceDraft,
    approval: normalized.approval,
    approvedFeedbackArtifact: {
      artifactId: artifact.artifactId,
      artifactKind: artifact.artifactKind,
      sourceControlledDraft: artifact.sourceControlledDraft,
      submissionId: artifact.submissionId,
      requestId: artifact.requestId,
      questionBankDraftRef: artifact.questionBankDraftRef,
      tutoringAnalysisRequestId: artifact.tutoringAnalysisRequestId,
      archiveItemId: artifact.archiveItemId,
      audience: artifact.audience,
      previousVisibilityState: artifact.visibilityState,
      approvalState: "APPROVED_FROM_CONTROLLED_DRAFT_SOURCE_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED",
      scoreSummary: artifact.scoreSummary,
      learnerFeedback: artifact.learnerFeedback,
    },
    boundary: {
      reviewedFeedbackArtifactVerified: true,
      controlledDraftSourceVerified: true,
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
      ...normalized.sourceRecord.evidenceRefs,
      `evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source-input-hash:${normalized.inputHash}`,
      `evidence:source-runtime:${sourceRuntimeId}`,
    ],
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
  };
}

function buildResult(record, replay) {
  return { ...record, ...replay };
}

function findExistingRecordByIdempotencyKey(logPath, idempotencyKey) {
  const absolute = path.resolve(logPath);
  if (!fs.existsSync(absolute)) return null;
  return fs.readFileSync(absolute, "utf8").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line)).find((record) => record.idempotencyKey === idempotencyKey) ?? null;
}

function assertReplayMatches(record, normalized) {
  requireConst(record.inputHash, normalized.inputHash, "record.inputHash");
  requireConst(record.status, approvedStatus, "record.status");
}

function appendRecord(logPath, record) {
  const absolute = path.resolve(logPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.appendFileSync(absolute, `${JSON.stringify(record)}\n`);
}

function rejectLeakedFields(value, context) {
  if (!value || typeof value !== "object") return;
  const stack = [{ value, path: context }];
  while (stack.length) {
    const current = stack.pop();
    for (const [key, nested] of Object.entries(current.value)) {
      if (leakedFieldNames.includes(key)) throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_FROM_DRAFT_LEAKED_FIELD", `${current.path}.${key} is not allowed`);
      if (nested && typeof nested === "object") stack.push({ value: nested, path: `${current.path}.${key}` });
    }
  }
}

function assertPlainObject(value, context) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_FROM_DRAFT_INVALID_OBJECT", `${context} must be an object`);
}

function requireConst(actual, expected, context) {
  if (actual !== expected) throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_FROM_DRAFT_CONST_MISMATCH", `${context} must be ${expected}`);
  return actual;
}

function requireOneOf(actual, context, allowed) {
  if (!allowed.includes(actual)) throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_FROM_DRAFT_INVALID_ENUM", `${context} must be one of ${allowed.join(",")}`);
  return actual;
}

function requireBoundedString(value, context, min, max) {
  if (typeof value !== "string" || value.length < min || value.length > max) throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_FROM_DRAFT_INVALID_STRING", `${context} must be a string with length ${min}-${max}`);
  return value;
}

function requireSafeText(value, context, min, max) {
  const text = requireBoundedString(value, context, min, max);
  if (/[<>]/u.test(text) || forbiddenText.test(text)) throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_FROM_DRAFT_UNSAFE_TEXT", `${context} must not contain HTML, answer keys, raw model details, result refs, or internal errors`);
  return text;
}

function requireToken(value, context, prefix) {
  const token = requireBoundedString(value, context, prefix.length + 1, 420);
  if (!token.startsWith(prefix)) throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_FROM_DRAFT_INVALID_TOKEN", `${context} must start with ${prefix}`);
  return token;
}

function requireQuestionBankDraftRef(value, context) {
  const ref = requireBoundedString(value, context, 12, 420);
  if (!ref.startsWith("local://question-bank-drafts/")) throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_FROM_DRAFT_INVALID_DRAFT_REF", `${context} must use local question-bank draft ref`);
  return ref;
}

function requireIsoString(value, context) {
  const text = requireBoundedString(value, context, 20, 80);
  if (Number.isNaN(Date.parse(text))) throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_FROM_DRAFT_INVALID_TIME", `${context} must be an ISO timestamp`);
  return text;
}

function uniqueStringArray(values, context, min, max) {
  if (!Array.isArray(values) || values.length < min || values.length > max) throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_FROM_DRAFT_INVALID_ARRAY", `${context} must contain ${min}-${max} values`);
  const out = [];
  for (const value of values) {
    const text = requireBoundedString(value, context, 1, 900);
    if (!out.includes(text)) out.push(text);
  }
  return out;
}

function uniqueSafeTextArray(values, context, minItems, maxItems, minLength, maxLength) {
  if (!Array.isArray(values) || values.length < minItems || values.length > maxItems) throw approvalError("STUDENT_APP_AI_TUTOR_FEEDBACK_PUBLICATION_APPROVAL_FROM_DRAFT_INVALID_ARRAY", `${context} must contain ${minItems}-${maxItems} values`);
  return [...new Set(values.map((value, index) => requireSafeText(value, `${context}[${index}]`, minLength, maxLength)))];
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function stableRecordId(prefix, idempotencyKey) {
  return `${prefix}_${idempotencyKey.replace(/[^a-zA-Z0-9]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 160)}`;
}

function approvalError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
