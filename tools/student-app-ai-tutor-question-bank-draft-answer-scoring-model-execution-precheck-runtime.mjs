import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_answer_scoring_model_execution_precheck_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_PORT =
  "StudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheckPort.recordAnswerScoringModelExecutionPrecheck";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_READY =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_READY";

const inputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck.v1";
const outputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-scoring-model-execution-prechecked.v1";
const scoringRequestVerificationRuntimeId = "student_app_ai_tutor_question_bank_draft_answer_scoring_request_verification_runtime";
const scoringRequestVerificationStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFIED";
const scoringInputFoundationRuntimeId = "student_app_ai_tutor_question_bank_draft_answer_scoring_input_foundation";
const scoringInputFoundationWorkload = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_INPUT_FOUNDATION";
const precheckedStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECKED";
const targetModelRoute = "StudentTutorAgent.score_question_bank_answer";
const targetWorkerInputEndpoint = "POST /v1/teaching/ai-grading-requests/{requestId}/question-bank-answer-scoring-input";
const defaultPrecheckLogPath =
  "reports/student-command-log/student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck.jsonl";

const leakedFieldNames = [
  "answerText",
  "expectedAnswer",
  "explanation",
  "answerKey",
  "correctAnswer",
  "score",
  "scoreSummary",
  "resultRef",
  "rawModelOutput",
  "modelOutput",
  "modelResponse",
  "feedback",
  "detailedFeedback",
  "directSql",
  "dbUrl",
  "internalError",
  "errorMessage",
  "publishedAt",
  "publicationStatus",
];

export async function recordStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(input, options = {}) {
  const precheckedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const precheckLogPath = options.precheckLogPath ?? defaultPrecheckLogPath;
  const existing = findExistingRecordByIdempotencyKey(precheckLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const modelPrecheckPort = assertModelPrecheckPort(options.answerScoringModelExecutionPrecheckPort);
  const portResult = await modelPrecheckPort.recordAnswerScoringModelExecutionPrecheck(buildPortRequest(normalized));
  const recordedPrecheck = assertPortResult(portResult, normalized);
  const record = buildPrecheckRecord(normalized, recordedPrecheck, precheckedAt);
  appendRecord(precheckLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(result) {
  return [
    `Student App AI Tutor question-bank answer scoring model execution precheck: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Request: ${result.modelExecutionPrecheck.requestId}`,
    `Route: ${result.modelExecutionPrecheck.modelRoute}`,
    `Model started: ${result.boundary.modelInferenceStarted}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectDirectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const precheckInvocationId = requireToken(input.precheckInvocationId, "input.precheckInvocationId", "qbank_answer_scoring_model_precheck_");
  const scoringRequestVerificationReport = assertScoringRequestVerificationReport(input.answerScoringRequestVerificationReport);
  const scoringRequestVerificationResult = assertScoringRequestVerificationResult(scoringRequestVerificationReport);
  const scoringInputFoundationReport = assertScoringInputFoundationReport(input.answerScoringInputFoundationReport);
  const principal = assertPrincipal(input.principal);
  const scoringInputManifest = assertScoringInputManifest(input.scoringInputManifest, scoringRequestVerificationResult.studentQuestionBankDraftAnswerScoringRequest);
  const approval = assertApproval(input.approval, scoringRequestVerificationResult.studentQuestionBankDraftAnswerScoringRequest, scoringInputManifest);
  const modelExecutionPolicy = assertModelExecutionPolicy(input.modelExecutionPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 3, 420);
  if (!evidenceRefs.some((ref) => ref.includes("answer-scoring-request-verification"))) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_MODEL_PRECHECK_MISSING_REQUEST_VERIFICATION_EVIDENCE", "answer scoring request verification evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("answer-scoring-input-foundation"))) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_MODEL_PRECHECK_MISSING_INPUT_FOUNDATION_EVIDENCE", "answer scoring input foundation evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("model-execution-approval"))) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_MODEL_PRECHECK_MISSING_APPROVAL_EVIDENCE", "model execution approval evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 380);
  const inputHash = hashInput({
    precheckInvocationId,
    requestId: scoringRequestVerificationResult.studentQuestionBankDraftAnswerScoringRequest.id,
    submissionId: scoringRequestVerificationResult.studentQuestionBankDraftAnswerScoringRequest.submissionId,
    workerId: scoringInputManifest.workerId,
    approvalId: approval.approvalId,
    modelExecutionPolicy,
    scoringInputManifestHash: hashInput(scoringInputManifest),
  });
  return {
    precheckInvocationId,
    scoringRequestVerificationReport,
    scoringRequestVerificationResult,
    scoringInputFoundationReport,
    principal,
    scoringInputManifest,
    approval,
    modelExecutionPolicy,
    evidenceRefs,
    idempotencyKey,
    inputHash,
  };
}

function assertScoringRequestVerificationReport(report) {
  assertPlainObject(report, "input.answerScoringRequestVerificationReport");
  requireConst(report.readiness, "READY", "input.answerScoringRequestVerificationReport.readiness");
  requireConst(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION", "input.answerScoringRequestVerificationReport.workloadType");
  requireConst(report.runtime?.runtimeId, scoringRequestVerificationRuntimeId, "input.answerScoringRequestVerificationReport.runtime.runtimeId");
  requireConst(report.runtime?.status, scoringRequestVerificationStatus, "input.answerScoringRequestVerificationReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.answerScoringRequestVerificationReport.runtimeSlo.totalErrors");
  const invariants = report.safetyInvariants ?? {};
  for (const field of [
    "answerSubmissionVerificationRequired",
    "answerScoringRequestFoundationRequired",
    "scoringRequestQueued",
    "reusesExistingAIGradingRequestQueue",
    "responseMetadataOnly",
  ]) {
    requireConst(invariants[field], true, `input.answerScoringRequestVerificationReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "answerTextDisclosed",
    "expectedAnswerDisclosed",
    "explanationDisclosed",
    "answerKeyDisclosed",
    "scoreDisclosed",
    "resultRefDisclosed",
    "scoringExecutionAllowed",
    "feedbackPublicationAllowed",
    "modelInferenceAllowed",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "swarmAllowed",
  ]) {
    requireConst(invariants[field], false, `input.answerScoringRequestVerificationReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertScoringRequestVerificationResult(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerScoringRequestVerification?.result;
  assertPlainObject(result, "input.answerScoringRequestVerificationReport.runtimeProbes.result");
  requireConst(result.schemaVersion, "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-scoring-request-verified.v1", "answer.scoring.request.source.schemaVersion");
  requireConst(result.runtimeId, scoringRequestVerificationRuntimeId, "answer.scoring.request.source.runtimeId");
  requireConst(result.status, scoringRequestVerificationStatus, "answer.scoring.request.source.status");
  requireConst(result.boundary?.scoringRequestQueued, true, "answer.scoring.request.source.boundary.scoringRequestQueued");
  requireConst(result.boundary?.responseMetadataOnly, true, "answer.scoring.request.source.boundary.responseMetadataOnly");
  requireConst(result.boundary?.scoringExecutionStarted, false, "answer.scoring.request.source.boundary.scoringExecutionStarted");
  requireConst(result.boundary?.modelInferenceStarted, false, "answer.scoring.request.source.boundary.modelInferenceStarted");
  requireConst(result.boundary?.feedbackPublicationStarted, false, "answer.scoring.request.source.boundary.feedbackPublicationStarted");
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "answer.scoring.request.source.recordId", 1, 380),
    studentQuestionBankDraftAnswerScoringRequest: assertVerifiedScoringRequest(result.studentQuestionBankDraftAnswerScoringRequest),
    evidenceRefs: uniqueStringArray(result.evidenceRefs ?? [], "answer.scoring.request.source.evidenceRefs", 1, 2200),
  };
}

function assertVerifiedScoringRequest(request) {
  rejectLeakedFields(request, "answer.scoring.request.source.studentQuestionBankDraftAnswerScoringRequest");
  assertPlainObject(request, "answer.scoring.request.source.studentQuestionBankDraftAnswerScoringRequest");
  const submittedAnswerItemIds = uniqueStringArray(request.submittedAnswerItemIds, "answer.scoring.request.source.studentQuestionBankDraftAnswerScoringRequest.submittedAnswerItemIds", 1, 100);
  return {
    id: requireToken(request.id, "answer.scoring.request.source.studentQuestionBankDraftAnswerScoringRequest.id", "grading_req_"),
    submissionId: requireToken(request.submissionId, "answer.scoring.request.source.studentQuestionBankDraftAnswerScoringRequest.submissionId", "qbank_ans_sub_"),
    questionBankDraftRef: requireQuestionBankDraftRef(request.questionBankDraftRef, "answer.scoring.request.source.studentQuestionBankDraftAnswerScoringRequest.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireToken(request.tutoringAnalysisRequestId, "answer.scoring.request.source.studentQuestionBankDraftAnswerScoringRequest.tutoringAnalysisRequestId", "tutor_req_"),
    archiveItemId: requireToken(request.archiveItemId, "answer.scoring.request.source.studentQuestionBankDraftAnswerScoringRequest.archiveItemId", "tarch_"),
    status: requireConst(request.status, "QUEUED", "answer.scoring.request.source.studentQuestionBankDraftAnswerScoringRequest.status"),
    sourceArchiveOwnerType: requireConst(request.sourceArchiveOwnerType, "STUDENT", "answer.scoring.request.source.studentQuestionBankDraftAnswerScoringRequest.sourceArchiveOwnerType"),
    sourceArchiveContentRef: requireConst(request.sourceArchiveContentRef, request.questionBankDraftRef, "answer.scoring.request.source.studentQuestionBankDraftAnswerScoringRequest.sourceArchiveContentRef"),
    sourceQuestionBankDraftRef: requireConst(request.sourceQuestionBankDraftRef, request.questionBankDraftRef, "answer.scoring.request.source.studentQuestionBankDraftAnswerScoringRequest.sourceQuestionBankDraftRef"),
    sourceQuestionBankAnswerSubmissionId: requireConst(request.sourceQuestionBankAnswerSubmissionId, request.submissionId, "answer.scoring.request.source.studentQuestionBankDraftAnswerScoringRequest.sourceQuestionBankAnswerSubmissionId"),
    submittedAnswerItemIds,
    requestedAt: requireBoundedString(request.requestedAt, "answer.scoring.request.source.studentQuestionBankDraftAnswerScoringRequest.requestedAt", 1, 80),
  };
}

function assertScoringInputFoundationReport(report) {
  assertPlainObject(report, "input.answerScoringInputFoundationReport");
  requireConst(report.readiness, "READY", "input.answerScoringInputFoundationReport.readiness");
  requireConst(report.workloadType, scoringInputFoundationWorkload, "input.answerScoringInputFoundationReport.workloadType");
  requireConst(report.runtime?.runtimeId, scoringInputFoundationRuntimeId, "input.answerScoringInputFoundationReport.runtime.runtimeId");
  requireConst(report.runtime?.useCase, "ReadQuestionBankDraftAnswerScoringInput.Execute", "input.answerScoringInputFoundationReport.runtime.useCase");
  requireConst(report.runtime?.endpoint, targetWorkerInputEndpoint, "input.answerScoringInputFoundationReport.runtime.endpoint");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.answerScoringInputFoundationReport.runtimeSlo.totalErrors");
  const invariants = report.safetyInvariants ?? {};
  for (const field of [
    "internalWorkerOnly",
    "servicePrincipalRequired",
    "agentInternalEntryPointRequired",
    "teachingWriteScopeRequired",
    "claimedBySameWorkerRequired",
    "unexpiredClaimLeaseRequired",
    "requestSourceLinkageRequired",
    "submissionAndContentScopedByStudent",
    "responseExposesAnswerTextToWorker",
    "responseExposesExpectedAnswerToWorker",
    "responseExposesExplanationToWorker",
  ]) {
    requireConst(invariants[field], true, `input.answerScoringInputFoundationReport.safetyInvariants.${field}`);
  }
  for (const field of ["modelInferenceAllowed", "resultPersistenceAllowed", "studentVisiblePublishAllowed"]) {
    requireConst(invariants[field], false, `input.answerScoringInputFoundationReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 4, 18);
  for (const scope of ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT", "ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_APPROVE"]) {
    if (!scopes.includes(scope)) {
      throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_MODEL_PRECHECK_SCOPE_MISSING", `input.principal.scopes must include ${scope}`);
    }
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

function assertScoringInputManifest(manifest, request) {
  rejectLeakedFields(manifest, "input.scoringInputManifest");
  assertPlainObject(manifest, "input.scoringInputManifest");
  const submittedAnswerItemIds = uniqueStringArray(manifest.submittedAnswerItemIds, "input.scoringInputManifest.submittedAnswerItemIds", 1, 100);
  if (JSON.stringify(submittedAnswerItemIds) !== JSON.stringify(request.submittedAnswerItemIds)) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_MODEL_PRECHECK_ITEM_IDS", "scoring input manifest submitted item ids must match verified scoring request");
  }
  return {
    manifestId: requireToken(manifest.manifestId, "input.scoringInputManifest.manifestId", "qbank_answer_scoring_input_manifest_"),
    requestId: requireConst(manifest.requestId, request.id, "input.scoringInputManifest.requestId"),
    submissionId: requireConst(manifest.submissionId, request.submissionId, "input.scoringInputManifest.submissionId"),
    questionBankDraftRef: requireConst(manifest.questionBankDraftRef, request.questionBankDraftRef, "input.scoringInputManifest.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireConst(manifest.tutoringAnalysisRequestId, request.tutoringAnalysisRequestId, "input.scoringInputManifest.tutoringAnalysisRequestId"),
    archiveItemId: requireConst(manifest.archiveItemId, request.archiveItemId, "input.scoringInputManifest.archiveItemId"),
    workerId: requireToken(manifest.workerId, "input.scoringInputManifest.workerId", "ai_grading_worker_"),
    answerItemCount: requireConst(manifest.answerItemCount, request.submittedAnswerItemIds.length, "input.scoringInputManifest.answerItemCount"),
    submittedAnswerItemIds,
    status: requireConst(manifest.status, "WORKER_INPUT_READY_NOT_SCORED", "input.scoringInputManifest.status"),
    protectedAnswerPackageReadiness: requireConst(manifest.protectedAnswerPackageReadiness, "WORKER_ONLY_PROTECTED_INPUT_AVAILABLE", "input.scoringInputManifest.protectedAnswerPackageReadiness"),
    sourceEndpoint: requireConst(manifest.sourceEndpoint, targetWorkerInputEndpoint, "input.scoringInputManifest.sourceEndpoint"),
    sourceFoundationRuntimeId: requireConst(manifest.sourceFoundationRuntimeId, scoringInputFoundationRuntimeId, "input.scoringInputManifest.sourceFoundationRuntimeId"),
  };
}

function assertApproval(approval, request, manifest) {
  rejectLeakedFields(approval, "input.approval");
  assertPlainObject(approval, "input.approval");
  const permissions = uniqueStringArray(approval.permissions, "input.approval.permissions", 2, 12);
  for (const permission of ["QUESTION_BANK_ANSWER_SCORING_REVIEW", "MODEL_EXECUTION_PRECHECK_APPROVE"]) {
    if (!permissions.includes(permission)) {
      throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_MODEL_PRECHECK_APPROVAL_PERMISSION_MISSING", `input.approval.permissions must include ${permission}`);
    }
  }
  return {
    approvalId: requireToken(approval.approvalId, "input.approval.approvalId", "qbank_answer_scoring_model_approval_"),
    reviewerId: requireBoundedString(approval.reviewerId, "input.approval.reviewerId", 1, 128),
    reviewerRole: requireOneOf(approval.reviewerRole, "input.approval.reviewerRole", ["TEACHER", "ADMIN"]),
    permissions,
    reviewedRequestId: requireConst(approval.reviewedRequestId, request.id, "input.approval.reviewedRequestId"),
    reviewedSubmissionId: requireConst(approval.reviewedSubmissionId, request.submissionId, "input.approval.reviewedSubmissionId"),
    reviewedQuestionBankDraftRef: requireConst(approval.reviewedQuestionBankDraftRef, request.questionBankDraftRef, "input.approval.reviewedQuestionBankDraftRef"),
    reviewedWorkerId: requireConst(approval.reviewedWorkerId, manifest.workerId, "input.approval.reviewedWorkerId"),
    approvedForModelQueueOnly: requireConst(approval.approvedForModelQueueOnly, true, "input.approval.approvedForModelQueueOnly"),
    workerInputBoundaryReviewed: requireConst(approval.workerInputBoundaryReviewed, true, "input.approval.workerInputBoundaryReviewed"),
    answerKeyUseRestrictedToWorker: requireConst(approval.answerKeyUseRestrictedToWorker, true, "input.approval.answerKeyUseRestrictedToWorker"),
    budgetReviewed: requireConst(approval.budgetReviewed, true, "input.approval.budgetReviewed"),
    humanReviewRequiredBeforeFeedbackPublication: requireConst(approval.humanReviewRequiredBeforeFeedbackPublication, true, "input.approval.humanReviewRequiredBeforeFeedbackPublication"),
  };
}

function assertModelExecutionPolicy(policy) {
  rejectLeakedFields(policy, "input.modelExecutionPolicy");
  assertPlainObject(policy, "input.modelExecutionPolicy");
  const normalized = {
    modelRoute: requireConst(policy.modelRoute, targetModelRoute, "input.modelExecutionPolicy.modelRoute"),
    approvedProviderClass: requireConst(policy.approvedProviderClass, "CONTROLLED_AI_WORKER", "input.modelExecutionPolicy.approvedProviderClass"),
    queueRef: requireBoundedString(policy.queueRef, "input.modelExecutionPolicy.queueRef", 8, 180),
    maxPromptTokens: requireIntegerBetween(policy.maxPromptTokens, "input.modelExecutionPolicy.maxPromptTokens", 200, 4000),
    maxOutputTokens: requireIntegerBetween(policy.maxOutputTokens, "input.modelExecutionPolicy.maxOutputTokens", 50, 2000),
    maxScoringAttempts: requireIntegerBetween(policy.maxScoringAttempts, "input.modelExecutionPolicy.maxScoringAttempts", 1, 2),
    timeoutMs: requireIntegerBetween(policy.timeoutMs, "input.modelExecutionPolicy.timeoutMs", 1000, 120000),
    requiresFutureScoringRuntime: requireConst(policy.requiresFutureScoringRuntime, true, "input.modelExecutionPolicy.requiresFutureScoringRuntime"),
    requiresRecordAIGradingResult: requireConst(policy.requiresRecordAIGradingResult, true, "input.modelExecutionPolicy.requiresRecordAIGradingResult"),
    requiresReviewedFeedbackPublication: requireConst(policy.requiresReviewedFeedbackPublication, true, "input.modelExecutionPolicy.requiresReviewedFeedbackPublication"),
  };
  for (const field of [
    "storeRawModelOutputAllowed",
    "executeModelNowAllowed",
    "calculateScoreNowAllowed",
    "persistResultNowAllowed",
    "generateFeedbackNowAllowed",
    "studentVisiblePublishAllowed",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.modelExecutionPolicy.${field}`);
    normalized[field] = false;
  }
  return normalized;
}

function buildPortRequest(normalized) {
  const request = normalized.scoringRequestVerificationResult.studentQuestionBankDraftAnswerScoringRequest;
  return {
    principal: normalized.principal,
    answerScoringRequest: {
      requestId: request.id,
      submissionId: request.submissionId,
      questionBankDraftRef: request.questionBankDraftRef,
      tutoringAnalysisRequestId: request.tutoringAnalysisRequestId,
      archiveItemId: request.archiveItemId,
      submittedAnswerItemIds: request.submittedAnswerItemIds,
    },
    scoringInputManifest: normalized.scoringInputManifest,
    approval: normalized.approval,
    modelExecutionPolicy: normalized.modelExecutionPolicy,
    precheckInvocationId: normalized.precheckInvocationId,
    idempotencyKey: normalized.idempotencyKey,
    sourceAnswerScoringRequestVerificationRecordId: normalized.scoringRequestVerificationResult.recordId,
  };
}

function assertModelPrecheckPort(port) {
  if (!port || typeof port.recordAnswerScoringModelExecutionPrecheck !== "function") {
    throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_MODEL_PRECHECK_MISSING_PORT", "AnswerScoringModelExecutionPrecheckPort.recordAnswerScoringModelExecutionPrecheck is required");
  }
  return port;
}

function assertPortResult(result, normalized) {
  rejectLeakedFields(result, "AnswerScoringModelExecutionPrecheckPort result");
  assertPlainObject(result, "AnswerScoringModelExecutionPrecheckPort result");
  const precheck = result.modelExecutionPrecheck;
  assertPlainObject(precheck, "AnswerScoringModelExecutionPrecheckPort result.modelExecutionPrecheck");
  const request = normalized.scoringRequestVerificationResult.studentQuestionBankDraftAnswerScoringRequest;
  return {
    precheckId: requireToken(precheck.precheckId, "portResult.modelExecutionPrecheck.precheckId", "qbank_answer_scoring_model_precheck_"),
    requestId: requireConst(precheck.requestId, request.id, "portResult.modelExecutionPrecheck.requestId"),
    submissionId: requireConst(precheck.submissionId, request.submissionId, "portResult.modelExecutionPrecheck.submissionId"),
    questionBankDraftRef: requireConst(precheck.questionBankDraftRef, request.questionBankDraftRef, "portResult.modelExecutionPrecheck.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireConst(precheck.tutoringAnalysisRequestId, request.tutoringAnalysisRequestId, "portResult.modelExecutionPrecheck.tutoringAnalysisRequestId"),
    archiveItemId: requireConst(precheck.archiveItemId, request.archiveItemId, "portResult.modelExecutionPrecheck.archiveItemId"),
    workerId: requireConst(precheck.workerId, normalized.scoringInputManifest.workerId, "portResult.modelExecutionPrecheck.workerId"),
    modelRoute: requireConst(precheck.modelRoute, normalized.modelExecutionPolicy.modelRoute, "portResult.modelExecutionPrecheck.modelRoute"),
    queueRef: requireConst(precheck.queueRef, normalized.modelExecutionPolicy.queueRef, "portResult.modelExecutionPrecheck.queueRef"),
    answerItemCount: requireConst(precheck.answerItemCount, request.submittedAnswerItemIds.length, "portResult.modelExecutionPrecheck.answerItemCount"),
    status: requireConst(precheck.status, "PRECHECKED_FOR_REVIEWED_ANSWER_SCORING_MODEL_QUEUE", "portResult.modelExecutionPrecheck.status"),
    executionState: requireConst(precheck.executionState, "MODEL_EXECUTION_PRECHECKED_NOT_STARTED", "portResult.modelExecutionPrecheck.executionState"),
    modelInferenceStarted: requireConst(precheck.modelInferenceStarted, false, "portResult.modelExecutionPrecheck.modelInferenceStarted"),
    scoringExecutionStarted: requireConst(precheck.scoringExecutionStarted, false, "portResult.modelExecutionPrecheck.scoringExecutionStarted"),
    resultPersistenceStarted: requireConst(precheck.resultPersistenceStarted, false, "portResult.modelExecutionPrecheck.resultPersistenceStarted"),
    feedbackGenerationStarted: requireConst(precheck.feedbackGenerationStarted, false, "portResult.modelExecutionPrecheck.feedbackGenerationStarted"),
    studentVisiblePublished: requireConst(precheck.studentVisiblePublished, false, "portResult.modelExecutionPrecheck.studentVisiblePublished"),
  };
}

function buildPrecheckRecord(normalized, recordedPrecheck, precheckedAt) {
  const request = normalized.scoringRequestVerificationResult.studentQuestionBankDraftAnswerScoringRequest;
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK",
    recordId: `student_app_ai_tutor_question_bank_draft_answer_scoring_model_execution_precheck_${safeToken(normalized.idempotencyKey)}`,
    recordedAt: precheckedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_PORT,
    status: precheckedStatus,
    precheckInvocationId: normalized.precheckInvocationId,
    sourceAnswerScoringRequestVerification: {
      runtimeId: scoringRequestVerificationRuntimeId,
      recordId: normalized.scoringRequestVerificationResult.recordId,
      requestId: request.id,
      submissionId: request.submissionId,
      questionBankDraftRef: request.questionBankDraftRef,
      priorStatus: scoringRequestVerificationStatus,
    },
    sourceAnswerScoringInputFoundation: {
      runtimeId: scoringInputFoundationRuntimeId,
      useCase: "ReadQuestionBankDraftAnswerScoringInput.Execute",
      endpoint: targetWorkerInputEndpoint,
    },
    scoringInputManifest: {
      manifestId: normalized.scoringInputManifest.manifestId,
      requestId: normalized.scoringInputManifest.requestId,
      submissionId: normalized.scoringInputManifest.submissionId,
      questionBankDraftRef: normalized.scoringInputManifest.questionBankDraftRef,
      workerId: normalized.scoringInputManifest.workerId,
      answerItemCount: normalized.scoringInputManifest.answerItemCount,
      submittedAnswerItemIds: normalized.scoringInputManifest.submittedAnswerItemIds,
      status: normalized.scoringInputManifest.status,
    },
    approval: {
      approvalId: normalized.approval.approvalId,
      reviewerRole: normalized.approval.reviewerRole,
      approvedForModelQueueOnly: true,
      humanReviewRequiredBeforeFeedbackPublication: true,
    },
    modelExecutionPrecheck: recordedPrecheck,
    modelExecutionPolicy: {
      modelRoute: normalized.modelExecutionPolicy.modelRoute,
      approvedProviderClass: normalized.modelExecutionPolicy.approvedProviderClass,
      queueRef: normalized.modelExecutionPolicy.queueRef,
      maxPromptTokens: normalized.modelExecutionPolicy.maxPromptTokens,
      maxOutputTokens: normalized.modelExecutionPolicy.maxOutputTokens,
      maxScoringAttempts: normalized.modelExecutionPolicy.maxScoringAttempts,
      timeoutMs: normalized.modelExecutionPolicy.timeoutMs,
    },
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.scoringRequestVerificationResult.evidenceRefs,
        `evidence:question-bank-answer-scoring-model-execution-precheck-input-hash:${normalized.inputHash}`,
        `evidence:runtime:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_RUNTIME_ID}`,
        `evidence:command-port:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_PORT}`,
        `evidence:source-answer-scoring-request-verification-record:${normalized.scoringRequestVerificationResult.recordId}`,
        `evidence:source-answer-scoring-input-foundation:${scoringInputFoundationRuntimeId}`,
        `evidence:model-route:${targetModelRoute}`,
      ]),
      idempotencyKey: normalized.idempotencyKey,
      inputHash: normalized.inputHash,
    },
    boundary: buildBoundary(),
  };
}

function buildBoundary() {
  return {
    sourceAnswerScoringRequestVerificationRequired: true,
    sourceScoringInputFoundationRequired: true,
    scoringInputManifestVerified: true,
    internalServicePrincipalVerified: true,
    approvalVerified: true,
    modelExecutionQueueAdmissionOnly: true,
    futureScoringModelExecutionApproved: true,
    protectedWorkerInputBoundaryPreserved: true,
    answerTextDisclosed: false,
    expectedAnswerDisclosed: false,
    explanationDisclosed: false,
    answerKeyDisclosed: false,
    scoreDisclosed: false,
    resultRefDisclosed: false,
    rawModelOutputDisclosed: false,
    feedbackDisclosed: false,
    modelInferenceStarted: false,
    scoringExecutionStarted: false,
    resultPersistenceStarted: false,
    feedbackGenerationStarted: false,
    feedbackPublicationStarted: false,
    studentVisiblePublished: false,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
    requiresFutureScoringRuntime: true,
    requiresFutureRecordAIGradingResult: true,
    requiresFutureReviewedFeedbackPublication: true,
  };
}

function buildResult(record, options) {
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: record.runtimeId,
    commandPort: record.commandPort,
    status: record.status,
    recordId: record.recordId,
    recordedAt: record.recordedAt,
    idempotencyKey: record.evidence.idempotencyKey,
    idempotentReplay: options.idempotentReplay === true,
    sourceAnswerScoringRequestVerification: record.sourceAnswerScoringRequestVerification,
    sourceAnswerScoringInputFoundation: record.sourceAnswerScoringInputFoundation,
    scoringInputManifest: record.scoringInputManifest,
    approval: record.approval,
    modelExecutionPrecheck: record.modelExecutionPrecheck,
    modelExecutionPolicy: record.modelExecutionPolicy,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 50,
      evidenceClass: "STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_BOUNDARY",
    },
    nextAction: "Use this as answer scoring model queue precheck evidence; actual model scoring, RecordAIGradingResult, reviewed feedback, and archive persistence remain separate reviewed slices.",
  };
}

function appendRecord(precheckLogPath, record) {
  const absolute = path.resolve(precheckLogPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.appendFileSync(absolute, `${JSON.stringify(record)}\n`);
}

function findExistingRecordByIdempotencyKey(precheckLogPath, idempotencyKey) {
  const absolute = path.resolve(precheckLogPath);
  if (!fs.existsSync(absolute)) return null;
  const lines = fs.readFileSync(absolute, "utf8").split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const record = JSON.parse(lines[index]);
    if (record?.recordType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.precheckInvocationId !== normalized.precheckInvocationId ||
    existing.sourceAnswerScoringRequestVerification?.recordId !== normalized.scoringRequestVerificationResult.recordId ||
    existing.evidence?.inputHash !== normalized.inputHash) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_MODEL_PRECHECK_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different answer scoring model execution precheck");
  }
}

function rejectDirectLeakedFields(value, context) {
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    if (leakedFieldNames.includes(key)) {
      throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_MODEL_PRECHECK_LEAKED_FIELD", `${context}.${key} is not allowed`);
    }
  }
}

function rejectLeakedFields(value, context) {
  if (!value || typeof value !== "object") return;
  const stack = [{ value, path: context }];
  while (stack.length) {
    const current = stack.pop();
    if (!current.value || typeof current.value !== "object") continue;
    for (const [key, nested] of Object.entries(current.value)) {
      if (leakedFieldNames.includes(key)) {
        throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_MODEL_PRECHECK_LEAKED_FIELD", `${current.path}.${key} is not allowed`);
      }
      if (nested && typeof nested === "object") stack.push({ value: nested, path: `${current.path}.${key}` });
    }
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_MODEL_PRECHECK_INVALID_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_MODEL_PRECHECK_CONST", `${label} must be ${String(expected)}`);
  }
  return expected;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string") {
    throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_MODEL_PRECHECK_STRING", `${label} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_MODEL_PRECHECK_STRING_LENGTH", `${label} length is invalid`);
  }
  return trimmed;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 260);
  if (!token.startsWith(prefix)) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_MODEL_PRECHECK_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireQuestionBankDraftRef(value, label) {
  const ref = requireBoundedString(value, label, 1, 1000);
  if (!ref.startsWith("local://question-bank-drafts/") || !ref.endsWith(".json")) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_MODEL_PRECHECK_DRAFT_REF", `${label} must be a local question-bank draft ref`);
  }
  return ref;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_MODEL_PRECHECK_INTEGER", `${label} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function requireOneOf(value, label, options) {
  if (!options.includes(value)) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_MODEL_PRECHECK_ONE_OF", `${label} must be one of ${options.join(", ")}`);
  }
  return value;
}

function uniqueStringArray(value, label, min, max) {
  if (!Array.isArray(value)) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_MODEL_PRECHECK_ARRAY", `${label} must be an array`);
  }
  const normalized = value.map((item, index) => requireBoundedString(item, `${label}[${index}]`, 1, 1000));
  const unique = uniq(normalized);
  if (unique.length !== normalized.length || unique.length < min || unique.length > max) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_MODEL_PRECHECK_ARRAY_SIZE", `${label} must contain ${min}-${max} unique strings`);
  }
  return unique;
}

function uniq(values) {
  return [...new Set(values)];
}

function hashInput(input) {
  return `sha256:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`;
}

function safeToken(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 180);
}

function precheckError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
