import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_controlled_draft_source_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_CONTROLLED_DRAFT_SOURCE_PORT =
  "StudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSourcePort.recordReviewedFeedbackArtifactFromControlledDraft";

const inputSchemaVersion = "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source.v1";
const outputSchemaVersion = "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source-recorded.v1";
const sourceControlledDraftSchemaVersion = "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-controlled-draft-recorded.v1";
const sourceControlledDraftRuntimeId = "student_app_ai_tutor_question_bank_draft_answer_feedback_controlled_draft_runtime";
const sourceControlledDraftCommandPort = "StudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraftPort.recordControlledFeedbackDraft";
const sourceControlledDraftWorkloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT";
const recordedStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_FROM_CONTROLLED_DRAFT_RECORDED";
const defaultCommandLogPath =
  "reports/student-command-log/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source.jsonl";

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
  "workerId",
  "claimedByWorkerId",
  "claimExpiresAt",
  "directSql",
  "dbUrl",
  "internalError",
  "errorMessage",
  "publishedAt",
  "publicationStatus",
];

const forbiddenFeedbackText = /(answer key|correct answer|expected answer|raw model|internal error|resultref|result ref|标准答案|参考答案|正确答案|答案解析)/iu;

export async function recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource(input, options = {}) {
  const reviewedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const commandLogPath = options.commandLogPath ?? defaultCommandLogPath;
  const existing = findExistingRecordByIdempotencyKey(commandLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const port = assertReviewedFeedbackArtifactPort(options.reviewedFeedbackArtifactPort);
  const portResult = await port.recordReviewedFeedbackArtifactFromControlledDraft(buildPortRequest(normalized));
  const reviewedFeedbackArtifact = assertPortResult(portResult, normalized);
  const record = buildRecord(normalized, reviewedFeedbackArtifact, reviewedAt);
  appendRecord(commandLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource(result) {
  return [
    `Student App AI Tutor question-bank answer reviewed feedback artifact from controlled draft: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Source draft: ${result.sourceControlledFeedbackDraft.artifactId}`,
    `Reviewed artifact: ${result.reviewedFeedbackArtifact.artifactId}`,
    `Student-visible published: ${result.boundary.studentVisibleFeedbackPublished}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const reviewInvocationId = requireToken(input.reviewInvocationId, "input.reviewInvocationId", "feedback_controlled_draft_review_");
  const controlledDraftReport = assertControlledDraftReport(input.controlledFeedbackDraftReport);
  const controlledDraftResult = assertControlledDraftResult(controlledDraftReport);
  const principal = assertReviewerPrincipal(input.principal);
  const artifact = assertReviewedFeedbackArtifact(input.reviewedFeedbackArtifact, principal, controlledDraftResult);
  const policy = assertFeedbackArtifactPolicy(input.feedbackArtifactPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 520);
  for (const required of ["feedback-controlled-draft", "reviewed-feedback-artifact-controlled-draft-source"]) {
    if (!evidenceRefs.some((ref) => ref.includes(required))) {
      throw artifactError("STUDENT_APP_AI_TUTOR_QBANK_REVIEWED_FEEDBACK_FROM_DRAFT_MISSING_EVIDENCE", `${required} evidence ref is required`);
    }
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 420);
  const inputHash = hashInput({
    reviewInvocationId,
    reviewerPrincipalId: principal.principalId,
    sourceControlledDraftRecordId: controlledDraftResult.recordId,
    sourceControlledDraftArtifactId: controlledDraftResult.feedbackDraft.artifactId,
    sourceControlledDraftHash: controlledDraftResult.inputHash,
    artifact,
    policy,
  });
  return {
    reviewInvocationId,
    controlledDraftReport,
    controlledDraftResult,
    principal,
    artifact,
    policy,
    evidenceRefs,
    idempotencyKey,
    inputHash,
  };
}

function assertControlledDraftReport(report) {
  rejectLeakedFields(report, "input.controlledFeedbackDraftReport");
  assertPlainObject(report, "input.controlledFeedbackDraftReport");
  requireConst(report.readiness, "READY", "input.controlledFeedbackDraftReport.readiness");
  requireConst(report.workloadType, sourceControlledDraftWorkloadType, "input.controlledFeedbackDraftReport.workloadType");
  requireConst(report.runtime?.runtimeId, sourceControlledDraftRuntimeId, "input.controlledFeedbackDraftReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, sourceControlledDraftCommandPort, "input.controlledFeedbackDraftReport.runtime.commandPort");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.controlledFeedbackDraftReport.runtimeSlo.totalErrors");
  const invariants = report.safetyInvariants ?? {};
  for (const field of [
    "sourceModelExecutionPrecheckRequired",
    "safeStudentResultRequired",
    "internalServiceOnly",
    "controlledFeedbackDraftRecorded",
    "modelInferenceAllowed",
    "feedbackDraftGenerationAllowed",
  ]) requireConst(invariants[field], true, `input.controlledFeedbackDraftReport.safetyInvariants.${field}`);
  for (const field of [
    "rawModelOutputStored",
    "answerKeyDisclosureAllowed",
    "resultRefDisclosureAllowed",
    "reviewedFeedbackArtifactRecorded",
    "studentVisibleFeedbackAllowed",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) requireConst(invariants[field], false, `input.controlledFeedbackDraftReport.safetyInvariants.${field}`);
  return report;
}

function assertControlledDraftResult(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackControlledDraft?.result;
  rejectLeakedFields(result, "source.controlledFeedbackDraftResult");
  assertPlainObject(result, "source.controlledFeedbackDraftResult");
  requireConst(result.schemaVersion, sourceControlledDraftSchemaVersion, "source.controlledDraft.schemaVersion");
  requireConst(result.recordType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT", "source.controlledDraft.recordType");
  requireConst(result.runtimeId, sourceControlledDraftRuntimeId, "source.controlledDraft.runtimeId");
  requireConst(result.commandPort, sourceControlledDraftCommandPort, "source.controlledDraft.commandPort");
  requireConst(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_RECORDED", "source.controlledDraft.status");
  for (const field of ["controlledFeedbackDraftRecorded", "modelInferenceStarted", "feedbackDraftGenerated"]) {
    requireConst(result.boundary?.[field], true, `source.controlledDraft.boundary.${field}`);
  }
  for (const field of [
    "rawModelOutputStored",
    "answerKeyDisclosed",
    "resultRefDisclosed",
    "reviewedFeedbackArtifactRecorded",
    "studentVisibleFeedbackPublished",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) requireConst(result.boundary?.[field], false, `source.controlledDraft.boundary.${field}`);
  const scoring = assertStudentScoringResult(result.studentScoringResult);
  const feedbackDraft = assertControlledFeedbackDraft(result.feedbackDraft, scoring);
  return {
    recordId: requireBoundedString(result.recordId, "source.controlledDraft.recordId", 1, 420),
    inputHash: requireBoundedString(result.inputHash, "source.controlledDraft.inputHash", 12, 128),
    generationInvocationId: requireToken(result.generationInvocationId, "source.controlledDraft.generationInvocationId", "feedback_controlled_draft_"),
    studentScoringResult: scoring,
    generationAttempt: assertGenerationAttempt(result.generationAttempt, feedbackDraft),
    feedbackDraft,
    evidenceRefs: uniqueStringArray(result.evidenceRefs ?? [], "source.controlledDraft.evidenceRefs", 1, 2600),
  };
}

function assertStudentScoringResult(result) {
  rejectLeakedFields(result, "source.controlledDraft.studentScoringResult");
  assertPlainObject(result, "source.controlledDraft.studentScoringResult");
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

function assertControlledFeedbackDraft(draft, scoring) {
  rejectLeakedFields(draft, "source.controlledDraft.feedbackDraft");
  assertPlainObject(draft, "source.controlledDraft.feedbackDraft");
  return {
    artifactId: requireToken(draft.artifactId, "source.feedbackDraft.artifactId", "feedback_controlled_draft_"),
    precheckId: requireToken(draft.precheckId, "source.feedbackDraft.precheckId", "feedback_generation_model_precheck_"),
    requestId: requireConst(draft.requestId, scoring.requestId, "source.feedbackDraft.requestId"),
    submissionId: requireConst(draft.submissionId, scoring.submissionId, "source.feedbackDraft.submissionId"),
    questionBankDraftRef: requireConst(draft.questionBankDraftRef, scoring.questionBankDraftRef, "source.feedbackDraft.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireConst(draft.tutoringAnalysisRequestId, scoring.tutoringAnalysisRequestId, "source.feedbackDraft.tutoringAnalysisRequestId"),
    archiveItemId: requireConst(draft.archiveItemId, scoring.archiveItemId, "source.feedbackDraft.archiveItemId"),
    generationAttemptId: requireToken(draft.generationAttemptId, "source.feedbackDraft.generationAttemptId", "feedback_generation_attempt_"),
    modelRoute: requireConst(draft.modelRoute, "StudentTutorAgent.generate_question_bank_answer_feedback", "source.feedbackDraft.modelRoute"),
    status: requireConst(draft.status, "CONTROLLED_FEEDBACK_DRAFT_READY_FOR_REVIEW_NOT_PUBLISHED", "source.feedbackDraft.status"),
    executionState: requireConst(draft.executionState, "CONTROLLED_FEEDBACK_DRAFT_RECORDED_NOT_REVIEWED", "source.feedbackDraft.executionState"),
    sourceScoreSummary: requireConst(draft.sourceScoreSummary, scoring.scoreSummary, "source.feedbackDraft.sourceScoreSummary"),
    draftFeedback: assertLearnerFeedback(draft.draftFeedback, "source.feedbackDraft.draftFeedback"),
    rawModelOutputStored: requireConst(draft.rawModelOutputStored, false, "source.feedbackDraft.rawModelOutputStored"),
    answerKeyDisclosed: requireConst(draft.answerKeyDisclosed, false, "source.feedbackDraft.answerKeyDisclosed"),
    resultRefDisclosed: requireConst(draft.resultRefDisclosed, false, "source.feedbackDraft.resultRefDisclosed"),
    reviewedFeedbackArtifactRecorded: requireConst(draft.reviewedFeedbackArtifactRecorded, false, "source.feedbackDraft.reviewedFeedbackArtifactRecorded"),
    studentVisibleFeedbackPublished: requireConst(draft.studentVisibleFeedbackPublished, false, "source.feedbackDraft.studentVisibleFeedbackPublished"),
  };
}

function assertGenerationAttempt(attempt, draft) {
  rejectLeakedFields(attempt, "source.controlledDraft.generationAttempt");
  assertPlainObject(attempt, "source.controlledDraft.generationAttempt");
  return {
    attemptId: requireConst(attempt.attemptId, draft.generationAttemptId, "source.generationAttempt.attemptId"),
    precheckId: requireConst(attempt.precheckId, draft.precheckId, "source.generationAttempt.precheckId"),
    modelRoute: requireConst(attempt.modelRoute, draft.modelRoute, "source.generationAttempt.modelRoute"),
    queueRef: requireToken(attempt.queueRef, "source.generationAttempt.queueRef", "feedback_generation_model_queue_"),
    providerClass: requireOneOf(attempt.providerClass, "source.generationAttempt.providerClass", ["CONTROLLED_AI_WORKER", "LOCAL_SANDBOXED_AI_WORKER"]),
    maxPromptTokens: requireIntegerBetween(attempt.maxPromptTokens, "source.generationAttempt.maxPromptTokens", 128, 12000),
    maxOutputTokens: requireIntegerBetween(attempt.maxOutputTokens, "source.generationAttempt.maxOutputTokens", 64, 4000),
    attemptNo: requireIntegerBetween(attempt.attemptNo, "source.generationAttempt.attemptNo", 1, 2),
  };
}

function assertReviewerPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  const role = requireOneOf(principal.role, "input.principal.role", ["TEACHER", "ADMIN"]);
  if (role === "TEACHER") {
    for (const scope of ["TEACHING_READ", "FEEDBACK_REVIEW"]) {
      if (!scopes.includes(scope)) throw artifactError("STUDENT_APP_AI_TUTOR_QBANK_REVIEWED_FEEDBACK_FROM_DRAFT_SCOPE_MISSING", `input.principal.scopes must include ${scope}`);
    }
  }
  if (role === "ADMIN" && !scopes.includes("FEEDBACK_REVIEW") && !scopes.includes("ADMIN_SYSTEM")) {
    throw artifactError("STUDENT_APP_AI_TUTOR_QBANK_REVIEWED_FEEDBACK_FROM_DRAFT_SCOPE_MISSING", "ADMIN reviewer must include FEEDBACK_REVIEW or ADMIN_SYSTEM");
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

function assertReviewedFeedbackArtifact(artifact, principal, source) {
  rejectLeakedFields(artifact, "input.reviewedFeedbackArtifact");
  assertPlainObject(artifact, "input.reviewedFeedbackArtifact");
  const scoring = source.studentScoringResult;
  const sourceDraft = assertSourceControlledDraftRef(artifact.sourceControlledDraft, source);
  const review = assertReview(artifact.review, principal);
  const learnerFeedback = assertLearnerFeedback(artifact.learnerFeedback, "input.reviewedFeedbackArtifact.learnerFeedback");
  return {
    artifactId: requireToken(artifact.artifactId, "input.reviewedFeedbackArtifact.artifactId", "feedback_artifact_"),
    artifactKind: requireConst(artifact.artifactKind, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_ANSWER_REVIEWED_FEEDBACK", "input.reviewedFeedbackArtifact.artifactKind"),
    sourceControlledDraft: sourceDraft,
    submissionId: requireConst(artifact.submissionId, scoring.submissionId, "input.reviewedFeedbackArtifact.submissionId"),
    requestId: requireConst(artifact.requestId, scoring.requestId, "input.reviewedFeedbackArtifact.requestId"),
    questionBankDraftRef: requireConst(artifact.questionBankDraftRef, scoring.questionBankDraftRef, "input.reviewedFeedbackArtifact.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireConst(artifact.tutoringAnalysisRequestId, scoring.tutoringAnalysisRequestId, "input.reviewedFeedbackArtifact.tutoringAnalysisRequestId"),
    archiveItemId: requireConst(artifact.archiveItemId, scoring.archiveItemId, "input.reviewedFeedbackArtifact.archiveItemId"),
    audience: requireConst(artifact.audience, "STUDENT_APP_LEARNING_SUPPORT", "input.reviewedFeedbackArtifact.audience"),
    visibilityState: requireConst(artifact.visibilityState, "REVIEWED_NOT_PUBLISHED", "input.reviewedFeedbackArtifact.visibilityState"),
    scoreSummary: requireConst(artifact.scoreSummary, scoring.scoreSummary, "input.reviewedFeedbackArtifact.scoreSummary"),
    learnerFeedback,
    review,
    reviewedFromControlledDraft: requireConst(artifact.reviewedFromControlledDraft, true, "input.reviewedFeedbackArtifact.reviewedFromControlledDraft"),
    publicationApproved: requireConst(artifact.publicationApproved, false, "input.reviewedFeedbackArtifact.publicationApproved"),
    studentVisibleFeedbackPublished: requireConst(artifact.studentVisibleFeedbackPublished, false, "input.reviewedFeedbackArtifact.studentVisibleFeedbackPublished"),
  }
}

function assertSourceControlledDraftRef(ref, source) {
  assertPlainObject(ref, "input.reviewedFeedbackArtifact.sourceControlledDraft");
  return {
    runtimeId: requireConst(ref.runtimeId, sourceControlledDraftRuntimeId, "input.reviewedFeedbackArtifact.sourceControlledDraft.runtimeId"),
    recordId: requireConst(ref.recordId, source.recordId, "input.reviewedFeedbackArtifact.sourceControlledDraft.recordId"),
    artifactId: requireConst(ref.artifactId, source.feedbackDraft.artifactId, "input.reviewedFeedbackArtifact.sourceControlledDraft.artifactId"),
    generationAttemptId: requireConst(ref.generationAttemptId, source.feedbackDraft.generationAttemptId, "input.reviewedFeedbackArtifact.sourceControlledDraft.generationAttemptId"),
    inputHash: requireConst(ref.inputHash, source.inputHash, "input.reviewedFeedbackArtifact.sourceControlledDraft.inputHash"),
    draftFeedbackHash: requireConst(ref.draftFeedbackHash, hashInput(source.feedbackDraft.draftFeedback), "input.reviewedFeedbackArtifact.sourceControlledDraft.draftFeedbackHash"),
  };
}

function assertReview(review, principal) {
  assertPlainObject(review, "input.reviewedFeedbackArtifact.review");
  requireConst(review.reviewerPrincipalId, principal.principalId, "input.reviewedFeedbackArtifact.review.reviewerPrincipalId");
  for (const field of [
    "humanReviewed",
    "controlledDraftSourceVerified",
    "ageAppropriate",
    "studentOwnScopeConfirmed",
    "answerKeyRemoved",
    "workerMetadataRemoved",
    "rawModelOutputRemoved",
    "resultRefRemoved",
    "internalErrorsRemoved",
    "publicationApprovalRequired",
  ]) requireConst(review[field], true, `input.reviewedFeedbackArtifact.review.${field}`);
  requireConst(review.publicationApproved, false, "input.reviewedFeedbackArtifact.review.publicationApproved");
  return {
    reviewId: requireToken(review.reviewId, "input.reviewedFeedbackArtifact.review.reviewId", "feedback_review_"),
    reviewerPrincipalId: principal.principalId,
    reviewedAt: requireIsoString(review.reviewedAt, "input.reviewedFeedbackArtifact.review.reviewedAt"),
    humanReviewed: true,
    controlledDraftSourceVerified: true,
    ageAppropriate: true,
    studentOwnScopeConfirmed: true,
    answerKeyRemoved: true,
    workerMetadataRemoved: true,
    rawModelOutputRemoved: true,
    resultRefRemoved: true,
    internalErrorsRemoved: true,
    publicationApprovalRequired: true,
    publicationApproved: false,
  };
}

function assertFeedbackArtifactPolicy(policy) {
  assertPlainObject(policy, "input.feedbackArtifactPolicy");
  for (const field of [
    "controlledFeedbackDraftRequired",
    "safeStudentResultRequired",
    "humanReviewRequired",
    "reviewedFeedbackArtifactAllowed",
    "publicationApprovalRequired",
  ]) requireConst(policy[field], true, `input.feedbackArtifactPolicy.${field}`);
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
  ]) requireConst(policy[field], false, `input.feedbackArtifactPolicy.${field}`);
  return { ...policy };
}

function buildPortRequest(normalized) {
  return {
    reviewInvocationId: normalized.reviewInvocationId,
    reviewerPrincipal: normalized.principal,
    sourceControlledFeedbackDraft: normalized.controlledDraftResult,
    reviewedFeedbackArtifact: normalized.artifact,
    feedbackArtifactPolicy: normalized.policy,
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
  };
}

function assertPortResult(result, normalized) {
  rejectLeakedFields(result, "reviewedFeedbackArtifactPort.result");
  assertPlainObject(result, "reviewedFeedbackArtifactPort.result");
  const artifact = assertReviewedFeedbackArtifact(result.reviewedFeedbackArtifact, normalized.principal, normalized.controlledDraftResult);
  requireConst(artifact.artifactId, normalized.artifact.artifactId, "reviewedFeedbackArtifactPort.result.reviewedFeedbackArtifact.artifactId");
  requireConst(hashInput(artifact.learnerFeedback), hashInput(normalized.artifact.learnerFeedback), "reviewedFeedbackArtifactPort.result.reviewedFeedbackArtifact.learnerFeedback");
  requireConst(artifact.review.reviewId, normalized.artifact.review.reviewId, "reviewedFeedbackArtifactPort.result.reviewedFeedbackArtifact.review.reviewId");
  return artifact;
}

function buildRecord(normalized, reviewedFeedbackArtifact, reviewedAt) {
  const source = normalized.controlledDraftResult;
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_CONTROLLED_DRAFT_SOURCE",
    recordId: stableRecordId("student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_controlled_draft_source", normalized.idempotencyKey),
    reviewedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_CONTROLLED_DRAFT_SOURCE_PORT,
    status: recordedStatus,
    reviewInvocationId: normalized.reviewInvocationId,
    principal: normalized.principal,
    sourceControlledFeedbackDraft: {
      runtimeId: sourceControlledDraftRuntimeId,
      recordId: source.recordId,
      artifactId: source.feedbackDraft.artifactId,
      generationAttemptId: source.feedbackDraft.generationAttemptId,
      executionState: source.feedbackDraft.executionState,
      inputHash: source.inputHash,
    },
    studentScoringResult: source.studentScoringResult,
    reviewedFeedbackArtifact,
    boundary: {
      controlledFeedbackDraftSourceVerified: true,
      controlledFeedbackDraftRecorded: true,
      sourceFeedbackDraftGenerated: true,
      sourceModelInferenceStarted: true,
      safeStudentResultOnly: true,
      reviewedFeedbackArtifactRecorded: true,
      humanReviewCompleted: true,
      publicationApprovalRequired: true,
      publicationApproved: false,
      studentVisibleFeedbackPublished: false,
      answerKeyDisclosed: false,
      workerMetadataDisclosed: false,
      rawModelOutputStored: false,
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
      ...source.evidenceRefs,
      `evidence:student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source-input-hash:${normalized.inputHash}`,
      `evidence:runtime:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID}`,
      `evidence:command-port:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_CONTROLLED_DRAFT_SOURCE_PORT}`,
      `evidence:source-runtime:${sourceControlledDraftRuntimeId}`,
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
      p99Ms: 8,
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_CONTROLLED_DRAFT_SOURCE_PROBE",
    },
    idempotentReplay: replay.idempotentReplay,
  };
}

function assertReviewedFeedbackArtifactPort(port) {
  if (!port || typeof port.recordReviewedFeedbackArtifactFromControlledDraft !== "function") {
    throw artifactError("STUDENT_APP_AI_TUTOR_QBANK_REVIEWED_FEEDBACK_FROM_DRAFT_PORT_MISSING", "ReviewedFeedbackArtifactControlledDraftSourcePort.recordReviewedFeedbackArtifactFromControlledDraft is required");
  }
  return port;
}

function findExistingRecordByIdempotencyKey(logPath, idempotencyKey) {
  const absolute = path.resolve(logPath);
  if (!fs.existsSync(absolute)) return null;
  return fs.readFileSync(absolute, "utf8").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line)).find((record) => record.idempotencyKey === idempotencyKey) ?? null;
}

function assertReplayMatches(record, normalized) {
  requireConst(record.inputHash, normalized.inputHash, "record.inputHash");
  requireConst(record.status, recordedStatus, "record.status");
  requireConst(record.sourceControlledFeedbackDraft.artifactId, normalized.controlledDraftResult.feedbackDraft.artifactId, "record.sourceControlledFeedbackDraft.artifactId");
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
      if (leakedFieldNames.includes(key)) {
        throw artifactError("STUDENT_APP_AI_TUTOR_QBANK_REVIEWED_FEEDBACK_FROM_DRAFT_LEAKED_FIELD", `${current.path}.${key} is not allowed`);
      }
      if (nested && typeof nested === "object") stack.push({ value: nested, path: `${current.path}.${key}` });
    }
  }
}

function assertLearnerFeedback(feedback, context) {
  rejectLeakedFields(feedback, context);
  assertPlainObject(feedback, context);
  return {
    summary: requireLearnerSafeText(feedback.summary, `${context}.summary`, 1, 1200),
    encouragement: requireLearnerSafeText(feedback.encouragement, `${context}.encouragement`, 1, 600),
    nextSteps: uniqueLearnerSafeTextArray(feedback.nextSteps, `${context}.nextSteps`, 1, 8, 1, 500),
    misconceptionTags: uniqueLearnerSafeTextArray(feedback.misconceptionTags ?? [], `${context}.misconceptionTags`, 0, 12, 1, 80),
    practiceSuggestions: uniqueLearnerSafeTextArray(feedback.practiceSuggestions ?? [], `${context}.practiceSuggestions`, 0, 8, 1, 300),
  };
}

function assertPlainObject(value, context) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw artifactError("STUDENT_APP_AI_TUTOR_QBANK_REVIEWED_FEEDBACK_FROM_DRAFT_INVALID_OBJECT", `${context} must be an object`);
  }
}

function requireConst(actual, expected, context) {
  if (actual !== expected) {
    throw artifactError("STUDENT_APP_AI_TUTOR_QBANK_REVIEWED_FEEDBACK_FROM_DRAFT_CONST_MISMATCH", `${context} must be ${expected}`);
  }
  return actual;
}

function requireOneOf(actual, context, allowed) {
  if (!allowed.includes(actual)) {
    throw artifactError("STUDENT_APP_AI_TUTOR_QBANK_REVIEWED_FEEDBACK_FROM_DRAFT_INVALID_ENUM", `${context} must be one of ${allowed.join(",")}`);
  }
  return actual;
}

function requireBoundedString(value, context, min, max) {
  if (typeof value !== "string" || value.length < min || value.length > max) {
    throw artifactError("STUDENT_APP_AI_TUTOR_QBANK_REVIEWED_FEEDBACK_FROM_DRAFT_INVALID_STRING", `${context} must be a string with length ${min}-${max}`);
  }
  return value;
}

function requireToken(value, context, prefix) {
  const token = requireBoundedString(value, context, prefix.length + 1, 420);
  if (!token.startsWith(prefix)) {
    throw artifactError("STUDENT_APP_AI_TUTOR_QBANK_REVIEWED_FEEDBACK_FROM_DRAFT_INVALID_TOKEN", `${context} must start with ${prefix}`);
  }
  return token;
}

function requireQuestionBankDraftRef(value, context) {
  const ref = requireBoundedString(value, context, 12, 420);
  if (!ref.startsWith("local://question-bank-drafts/")) {
    throw artifactError("STUDENT_APP_AI_TUTOR_QBANK_REVIEWED_FEEDBACK_FROM_DRAFT_INVALID_DRAFT_REF", `${context} must use local question-bank draft ref`);
  }
  return ref;
}

function requireIsoString(value, context) {
  const text = requireBoundedString(value, context, 20, 80);
  if (Number.isNaN(Date.parse(text))) {
    throw artifactError("STUDENT_APP_AI_TUTOR_QBANK_REVIEWED_FEEDBACK_FROM_DRAFT_INVALID_TIME", `${context} must be an ISO timestamp`);
  }
  return text;
}

function requireLearnerSafeText(value, context, min, max) {
  const text = requireBoundedString(value, context, min, max);
  if (/[<>]/u.test(text) || forbiddenFeedbackText.test(text)) {
    throw artifactError("STUDENT_APP_AI_TUTOR_QBANK_REVIEWED_FEEDBACK_FROM_DRAFT_UNSAFE_TEXT", `${context} must not contain HTML, answer keys, raw model details, result refs, or internal errors`);
  }
  return text;
}

function requireIntegerBetween(value, context, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw artifactError("STUDENT_APP_AI_TUTOR_QBANK_REVIEWED_FEEDBACK_FROM_DRAFT_INVALID_INTEGER", `${context} must be an integer ${min}-${max}`);
  }
  return value;
}

function uniqueStringArray(values, context, min, max) {
  if (!Array.isArray(values) || values.length < min || values.length > max) {
    throw artifactError("STUDENT_APP_AI_TUTOR_QBANK_REVIEWED_FEEDBACK_FROM_DRAFT_INVALID_ARRAY", `${context} must contain ${min}-${max} values`);
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
    throw artifactError("STUDENT_APP_AI_TUTOR_QBANK_REVIEWED_FEEDBACK_FROM_DRAFT_INVALID_ARRAY", `${context} must contain ${minItems}-${maxItems} values`);
  }
  const seen = new Set();
  return values.map((value, index) => {
    const text = requireLearnerSafeText(value, `${context}[${index}]`, minLength, maxLength);
    if (seen.has(text)) {
      throw artifactError("STUDENT_APP_AI_TUTOR_QBANK_REVIEWED_FEEDBACK_FROM_DRAFT_DUPLICATE_TEXT", `${context}[${index}] is duplicated`);
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

function artifactError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
