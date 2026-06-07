import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_answer_scoring_request_verification_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION_PORT =
  "StudentAppAITutorQuestionBankDraftAnswerScoringRequestVerificationPort.verifyStudentSafeQuestionBankDraftAnswerScoringRequest";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION_READY =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION_READY";

const inputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-scoring-request-verification.v1";
const outputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-scoring-request-verified.v1";
const answerSubmissionVerificationRuntimeId = "student_app_ai_tutor_question_bank_draft_answer_submission_verification_runtime";
const answerSubmissionVerificationStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFIED";
const answerScoringRequestFoundationRuntimeId = "student_app_ai_tutor_question_bank_draft_answer_scoring_request_foundation";
const answerScoringRequestFoundationWorkload = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_FOUNDATION";
const verifiedStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFIED";
const targetUseCase = "CreateStudentAppQuestionBankDraftAnswerScoringRequest.Execute";
const targetRepository = "ArchiveRepository.CreateAIGradingRequest";
const targetEndpoint = "POST /v1/student-app/question-bank-draft-answer-submissions/{submissionId}/ai-grading-requests";
const defaultVerificationLogPath =
  "reports/student-command-log/student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification.jsonl";

const outputLeakKeyNames = [
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
  "workerId",
  "claimedByWorkerId",
  "claimExpiresAt",
  "publishedAt",
  "publicationStatus",
  "directSql",
  "dbUrl",
  "internalError",
  "errorMessage",
];

export async function verifyStudentAppAITutorQuestionBankDraftAnswerScoringRequest(input, options = {}) {
  const verifiedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const verificationLogPath = options.verificationLogPath ?? defaultVerificationLogPath;
  const existing = findExistingRecordByIdempotencyKey(verificationLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const scoringRequestPort = assertScoringRequestPort(options.studentQuestionBankDraftAnswerScoringRequestPort);
  const scoringRequestResult = await scoringRequestPort.createStudentAppQuestionBankDraftAnswerScoringRequest(
    {
      principal: normalized.principal,
      submissionId: normalized.verifiedSubmission.id,
      gradingInstructions: normalized.scoringRequest.gradingInstructions,
      rubricRef: normalized.scoringRequest.rubricRef,
    },
    {
      verificationInvocationId: normalized.verificationInvocationId,
      idempotencyKey: normalized.idempotencyKey,
      sourceAnswerSubmissionVerificationRecordId: normalized.answerSubmissionVerificationResult.recordId,
    },
  );
  const verifiedScoringRequest = assertScoringRequestResult(scoringRequestResult, normalized);
  const record = buildVerificationRecord(normalized, verifiedScoringRequest, verifiedAt);
  appendVerificationRecord(verificationLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftAnswerScoringRequestVerification(result) {
  return [
    `Student App AI Tutor question-bank draft answer scoring request verification: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Use case: ${result.answerScoringRequestSource.targetUseCase}`,
    `Submission: ${result.studentQuestionBankDraftAnswerScoringRequest.submissionId}`,
    `Scoring request queued: ${result.boundary.scoringRequestQueued}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const verificationInvocationId = requireToken(input.verificationInvocationId, "input.verificationInvocationId", "qbank_answer_scoring_request_verification_");
  const principal = assertPrincipal(input.principal);
  const answerSubmissionVerificationReport = assertAnswerSubmissionVerificationReport(input.answerSubmissionVerificationReport);
  const answerSubmissionVerificationResult = assertAnswerSubmissionVerificationResult(answerSubmissionVerificationReport, principal);
  const answerScoringRequestFoundationReport = assertAnswerScoringRequestFoundationReport(input.answerScoringRequestFoundationReport);
  const verificationPolicy = assertVerificationPolicy(input.answerScoringRequestVerificationPolicy);
  const scoringRequest = assertScoringRequest(input.scoringRequest);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 520);
  if (!evidenceRefs.some((ref) => ref.includes("answer-submission-verification"))) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_SCORING_REQUEST_MISSING_SUBMISSION_VERIFICATION_EVIDENCE", "answer submission verification evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("answer-scoring-request-foundation"))) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_SCORING_REQUEST_MISSING_FOUNDATION_EVIDENCE", "answer scoring request foundation evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const verifiedSubmission = answerSubmissionVerificationResult.studentQuestionBankDraftAnswerSubmission;
  const submittedItemIdsHash = hashInput(verifiedSubmission.submittedAnswerItemIds);
  const verificationInputHash = hashInput({
    verificationInvocationId,
    principalId: principal.principalId,
    ownStudentId: principal.studentAccess.ownStudentId,
    sourceAnswerSubmissionVerificationRecordId: answerSubmissionVerificationResult.recordId,
    submissionId: verifiedSubmission.id,
    questionBankDraftRef: verifiedSubmission.questionBankDraftRef,
    submittedItemIdsHash,
    scoringRequest,
    answerScoringRequestFoundationRuntimeId: answerScoringRequestFoundationReport.runtime.runtimeId,
    verificationPolicy,
  });
  return {
    verificationInvocationId,
    principal,
    answerSubmissionVerificationReport,
    answerSubmissionVerificationResult,
    answerScoringRequestFoundationReport,
    verificationPolicy,
    scoringRequest,
    evidenceRefs,
    idempotencyKey,
    verifiedSubmission,
    submittedItemIdsHash,
    verificationInputHash,
  };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const principalId = requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128);
  requireConst(principal.subjectType, "USER", "input.principal.subjectType");
  requireConst(principal.role, "STUDENT", "input.principal.role");
  requireConst(principal.entryPoint, "STUDENT_APP", "input.principal.entryPoint");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 2, 32);
  for (const scope of ["STUDENT_OWN_READ", "STUDENT_OWN_WRITE"]) {
    if (!scopes.includes(scope)) {
      throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_SCORING_REQUEST_MISSING_SCOPE", `${scope} is required`);
    }
  }
  assertPlainObject(principal.studentAccess, "input.principal.studentAccess");
  requireConst(principal.studentAccess.mode, "OWN", "input.principal.studentAccess.mode");
  return {
    principalId,
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 160),
    subjectType: "USER",
    role: "STUDENT",
    entryPoint: "STUDENT_APP",
    scopes,
    studentAccess: {
      mode: "OWN",
      ownStudentId: requireBoundedString(principal.studentAccess.ownStudentId, "input.principal.studentAccess.ownStudentId", 1, 128),
    },
  };
}

function assertAnswerSubmissionVerificationReport(report) {
  assertPlainObject(report, "input.answerSubmissionVerificationReport");
  requireConst(report.readiness, "READY", "input.answerSubmissionVerificationReport.readiness");
  requireConst(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION", "input.answerSubmissionVerificationReport.workloadType");
  requireConst(report.runtime?.runtimeId, answerSubmissionVerificationRuntimeId, "input.answerSubmissionVerificationReport.runtime.runtimeId");
  requireConst(report.runtime?.status, answerSubmissionVerificationStatus, "input.answerSubmissionVerificationReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.answerSubmissionVerificationReport.runtimeSlo.totalErrors");
  const invariants = report.safetyInvariants ?? {};
  for (const field of [
    "contentStudentReadVerificationRequired",
    "answerSubmissionFoundationRequired",
    "injectedAnswerSubmissionPortRequired",
    "ownStudentOnly",
    "ownStudentWriteRequired",
    "submittedAnswersMatchedReadItems",
    "answerSubmissionPersisted",
    "responseMetadataOnly",
  ]) {
    requireConst(invariants[field], true, `input.answerSubmissionVerificationReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "answerTextDisclosed",
    "expectedAnswerDisclosed",
    "explanationDisclosed",
    "answerKeyDisclosed",
    "scoringAllowed",
    "feedbackPublicationAllowed",
    "modelInferenceAllowed",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "swarmAllowed",
  ]) {
    requireConst(invariants[field], false, `input.answerSubmissionVerificationReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertAnswerSubmissionVerificationResult(report, expectedPrincipal) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerSubmissionVerification?.result;
  assertPlainObject(result, "input.answerSubmissionVerificationReport.runtimeProbes.result");
  requireConst(result.schemaVersion, "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-submission-verified.v1", "answer.submission.source.schemaVersion");
  requireConst(result.runtimeId, answerSubmissionVerificationRuntimeId, "answer.submission.source.runtimeId");
  requireConst(result.status, answerSubmissionVerificationStatus, "answer.submission.source.status");
  requireConst(result.boundary?.answerSubmissionPersisted, true, "answer.submission.source.boundary.answerSubmissionPersisted");
  requireConst(result.boundary?.submittedAnswersMatchedReadItems, true, "answer.submission.source.boundary.submittedAnswersMatchedReadItems");
  requireConst(result.boundary?.responseMetadataOnly, true, "answer.submission.source.boundary.responseMetadataOnly");
  requireConst(result.boundary?.scoringStarted, false, "answer.submission.source.boundary.scoringStarted");
  requireConst(result.boundary?.modelInferenceStarted, false, "answer.submission.source.boundary.modelInferenceStarted");
  requireConst(result.boundary?.feedbackPublicationStarted, false, "answer.submission.source.boundary.feedbackPublicationStarted");
  const source = assertAnswerSubmissionSource(result.answerSubmissionSource, expectedPrincipal);
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "answer.submission.source.recordId", 1, 360),
    answerSubmissionSource: source,
    studentQuestionBankDraftAnswerSubmission: assertVerifiedSubmission(result.studentQuestionBankDraftAnswerSubmission),
    evidenceRefs: uniqueStringArray(result.evidenceRefs ?? [], "answer.submission.source.evidenceRefs", 1, 1800),
  };
}

function assertAnswerSubmissionSource(source, expectedPrincipal) {
  assertPlainObject(source, "answer.submission.source.answerSubmissionSource");
  return {
    targetUseCase: requireConst(source.targetUseCase, "SubmitStudentAppQuestionBankDraftAnswer.ExecuteWithPersistence", "answer.submission.source.targetUseCase"),
    repository: requireConst(source.repository, "ArchiveRepository.SubmitQuestionBankDraftAnswerSubmission", "answer.submission.source.repository"),
    endpoint: requireConst(source.endpoint, "POST /v1/student-app/question-bank-draft-answer-submissions", "answer.submission.source.endpoint"),
    ownStudentOnly: requireConst(source.ownStudentOnly, true, "answer.submission.source.ownStudentOnly"),
    ownStudentWrite: requireConst(source.ownStudentWrite, true, "answer.submission.source.ownStudentWrite"),
    studentScopedLookup: requireConst(source.studentScopedLookup, true, "answer.submission.source.studentScopedLookup"),
    principalId: requireConst(source.principalId, expectedPrincipal.principalId, "answer.submission.source.principalId"),
  };
}

function assertVerifiedSubmission(submission) {
  rejectOutputLeakedFields(submission, "answer.submission.source.studentQuestionBankDraftAnswerSubmission");
  assertPlainObject(submission, "answer.submission.source.studentQuestionBankDraftAnswerSubmission");
  const submittedAnswerItemIds = uniqueStringArray(submission.submittedAnswerItemIds, "answer.submission.source.studentQuestionBankDraftAnswerSubmission.submittedAnswerItemIds", 1, 100);
  return {
    id: requireToken(submission.id, "answer.submission.source.studentQuestionBankDraftAnswerSubmission.id", "qbank_ans_sub_"),
    questionBankDraftRef: requireQuestionBankDraftRef(submission.questionBankDraftRef, "answer.submission.source.studentQuestionBankDraftAnswerSubmission.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireToken(submission.tutoringAnalysisRequestId, "answer.submission.source.studentQuestionBankDraftAnswerSubmission.tutoringAnalysisRequestId", "tutor_req_"),
    archiveItemId: requireToken(submission.archiveItemId, "answer.submission.source.studentQuestionBankDraftAnswerSubmission.archiveItemId", "tarch_"),
    status: requireConst(submission.status, "SUBMITTED", "answer.submission.source.studentQuestionBankDraftAnswerSubmission.status"),
    answerCount: requireIntegerBetween(submission.answerCount, "answer.submission.source.studentQuestionBankDraftAnswerSubmission.answerCount", 1, 100),
    submittedAt: requireBoundedString(submission.submittedAt, "answer.submission.source.studentQuestionBankDraftAnswerSubmission.submittedAt", 1, 80),
    submittedAnswerItemIds,
  };
}

function assertAnswerScoringRequestFoundationReport(report) {
  assertPlainObject(report, "input.answerScoringRequestFoundationReport");
  requireConst(report.readiness, "READY", "input.answerScoringRequestFoundationReport.readiness");
  requireConst(report.workloadType, answerScoringRequestFoundationWorkload, "input.answerScoringRequestFoundationReport.workloadType");
  requireConst(report.runtime?.runtimeId, answerScoringRequestFoundationRuntimeId, "input.answerScoringRequestFoundationReport.runtime.runtimeId");
  requireConst(report.runtime?.useCase, targetUseCase, "input.answerScoringRequestFoundationReport.runtime.useCase");
  requireConst(report.runtime?.repository, targetRepository, "input.answerScoringRequestFoundationReport.runtime.repository");
  requireConst(report.runtime?.endpoint, targetEndpoint, "input.answerScoringRequestFoundationReport.runtime.endpoint");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.answerScoringRequestFoundationReport.runtimeSlo.totalErrors");
  const invariants = report.safetyInvariants ?? {};
  for (const field of [
    "ownStudentOnly",
    "ownStudentWriteRequired",
    "submissionIdAndStudentScopedLookup",
    "draftRefAndStudentScopedLookup",
    "reusesAIGradingRequestQueue",
  ]) {
    requireConst(invariants[field], true, `input.answerScoringRequestFoundationReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "createsNewScoringQueueTable",
    "responseExposesAnswerText",
    "responseExposesExpectedAnswer",
    "responseExposesExplanation",
    "responseExposesScore",
    "modelInferenceAllowed",
    "studentVisiblePublishAllowed",
  ]) {
    requireConst(invariants[field], false, `input.answerScoringRequestFoundationReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertVerificationPolicy(policy) {
  assertPlainObject(policy, "input.answerScoringRequestVerificationPolicy");
  for (const field of [
    "answerSubmissionVerificationRequired",
    "answerScoringRequestFoundationRequired",
    "injectedScoringRequestPortRequired",
    "ownStudentPrincipalRequired",
    "ownStudentWriteScopeRequired",
    "verifiedSubmissionRequired",
    "existingAIGradingRequestQueueRequired",
    "responseMetadataOnlyRequired",
    "idempotentScoringRequestVerificationRequired",
    "goUseCaseScoringRequestAllowed",
  ]) {
    requireConst(policy[field], true, `input.answerScoringRequestVerificationPolicy.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "answerTextDisclosureAllowed",
    "expectedAnswerDisclosureAllowed",
    "explanationDisclosureAllowed",
    "answerKeyDisclosureAllowed",
    "scoreDisclosureAllowed",
    "resultRefDisclosureAllowed",
    "workerClaimAllowed",
    "scoringExecutionAllowed",
    "feedbackPublicationAllowed",
    "studentVisiblePublishAllowed",
    "modelInferenceAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.answerScoringRequestVerificationPolicy.${field}`);
  }
  return { ...policy };
}

function assertScoringRequest(request) {
  assertPlainObject(request, "input.scoringRequest");
  return {
    gradingInstructions: requireBoundedString(request.gradingInstructions, "input.scoringRequest.gradingInstructions", 1, 1000),
    rubricRef: optionalBoundedString(request.rubricRef, "input.scoringRequest.rubricRef", 1, 1000),
  };
}

function assertScoringRequestPort(port) {
  if (!port || typeof port.createStudentAppQuestionBankDraftAnswerScoringRequest !== "function") {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_SCORING_REQUEST_MISSING_PORT", "StudentQuestionBankDraftAnswerScoringRequestPort.createStudentAppQuestionBankDraftAnswerScoringRequest is required");
  }
  return port;
}

function assertScoringRequestResult(result, normalized) {
  assertPlainObject(result, "StudentQuestionBankDraftAnswerScoringRequestPort result");
  requireConst(result.queued, true, "StudentQuestionBankDraftAnswerScoringRequestPort result.queued");
  const source = assertScoringRequestSource(result.source, normalized.principal);
  const response = assertScoringRequestResponse(result.response, normalized);
  return { source, response };
}

function assertScoringRequestSource(source, principal) {
  assertPlainObject(source, "StudentQuestionBankDraftAnswerScoringRequestPort result.source");
  return {
    targetUseCase: requireConst(source.targetUseCase, targetUseCase, "StudentQuestionBankDraftAnswerScoringRequestPort result.source.targetUseCase"),
    repository: requireConst(source.repository, targetRepository, "StudentQuestionBankDraftAnswerScoringRequestPort result.source.repository"),
    endpoint: requireConst(source.endpoint, targetEndpoint, "StudentQuestionBankDraftAnswerScoringRequestPort result.source.endpoint"),
    ownStudentOnly: requireConst(source.ownStudentOnly, true, "StudentQuestionBankDraftAnswerScoringRequestPort result.source.ownStudentOnly"),
    ownStudentWrite: requireConst(source.ownStudentWrite, true, "StudentQuestionBankDraftAnswerScoringRequestPort result.source.ownStudentWrite"),
    submissionScopedLookup: requireConst(source.submissionScopedLookup, true, "StudentQuestionBankDraftAnswerScoringRequestPort result.source.submissionScopedLookup"),
    draftContentScopedLookup: requireConst(source.draftContentScopedLookup, true, "StudentQuestionBankDraftAnswerScoringRequestPort result.source.draftContentScopedLookup"),
    reusedAIGradingRequestQueue: requireConst(source.reusedAIGradingRequestQueue, true, "StudentQuestionBankDraftAnswerScoringRequestPort result.source.reusedAIGradingRequestQueue"),
    principalId: requireConst(source.principalId, principal.principalId, "StudentQuestionBankDraftAnswerScoringRequestPort result.source.principalId"),
  };
}

function assertScoringRequestResponse(response, normalized) {
  rejectOutputLeakedFields(response, "StudentQuestionBankDraftAnswerScoringRequestPort result.response");
  assertPlainObject(response, "StudentQuestionBankDraftAnswerScoringRequestPort result.response");
  const submission = normalized.verifiedSubmission;
  return {
    id: requireToken(response.id, "StudentQuestionBankDraftAnswerScoringRequestPort result.response.id", "grading_req_"),
    submissionId: requireConst(response.submissionId, submission.id, "StudentQuestionBankDraftAnswerScoringRequestPort result.response.submissionId"),
    questionBankDraftRef: requireConst(response.questionBankDraftRef, submission.questionBankDraftRef, "StudentQuestionBankDraftAnswerScoringRequestPort result.response.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireConst(response.tutoringAnalysisRequestId, submission.tutoringAnalysisRequestId, "StudentQuestionBankDraftAnswerScoringRequestPort result.response.tutoringAnalysisRequestId"),
    archiveItemId: requireConst(response.archiveItemId, submission.archiveItemId, "StudentQuestionBankDraftAnswerScoringRequestPort result.response.archiveItemId"),
    status: requireConst(response.status, "QUEUED", "StudentQuestionBankDraftAnswerScoringRequestPort result.response.status"),
    sourceArchiveOwnerType: requireConst(response.sourceArchiveOwnerType, "STUDENT", "StudentQuestionBankDraftAnswerScoringRequestPort result.response.sourceArchiveOwnerType"),
    sourceArchiveContentRef: requireConst(response.sourceArchiveContentRef, submission.questionBankDraftRef, "StudentQuestionBankDraftAnswerScoringRequestPort result.response.sourceArchiveContentRef"),
    sourceQuestionBankDraftRef: requireConst(response.sourceQuestionBankDraftRef, submission.questionBankDraftRef, "StudentQuestionBankDraftAnswerScoringRequestPort result.response.sourceQuestionBankDraftRef"),
    sourceQuestionBankAnswerSubmissionId: requireConst(response.sourceQuestionBankAnswerSubmissionId, submission.id, "StudentQuestionBankDraftAnswerScoringRequestPort result.response.sourceQuestionBankAnswerSubmissionId"),
    submittedAnswerItemIds: assertSubmittedItemIds(response.submittedAnswerItemIds, submission.submittedAnswerItemIds),
    requestedAt: requireBoundedString(response.requestedAt, "StudentQuestionBankDraftAnswerScoringRequestPort result.response.requestedAt", 1, 80),
  };
}

function assertSubmittedItemIds(actual, expected) {
  const ids = uniqueStringArray(actual, "StudentQuestionBankDraftAnswerScoringRequestPort result.response.submittedAnswerItemIds", 1, 100);
  if (JSON.stringify(ids) !== JSON.stringify(expected)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_SCORING_REQUEST_ITEM_IDS", "scoring request submitted item ids must match the verified answer submission");
  }
  return ids;
}

function buildVerificationRecord(normalized, verifiedScoringRequest, verifiedAt) {
  const submission = normalized.verifiedSubmission;
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION",
    recordId: `student_app_ai_tutor_question_bank_draft_answer_scoring_request_verification_${safeToken(normalized.idempotencyKey)}`,
    recordedAt: verifiedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION_PORT,
    status: verifiedStatus,
    verificationInvocationId: normalized.verificationInvocationId,
    principal: {
      principalId: normalized.principal.principalId,
      role: normalized.principal.role,
      entryPoint: normalized.principal.entryPoint,
      studentAccessMode: normalized.principal.studentAccess.mode,
    },
    sourceAnswerSubmissionVerification: {
      runtimeId: answerSubmissionVerificationRuntimeId,
      recordId: normalized.answerSubmissionVerificationResult.recordId,
      submissionId: submission.id,
      questionBankDraftRef: submission.questionBankDraftRef,
      priorStatus: answerSubmissionVerificationStatus,
    },
    sourceAnswerScoringRequestFoundation: {
      runtimeId: answerScoringRequestFoundationRuntimeId,
      useCase: targetUseCase,
      repository: targetRepository,
      endpoint: targetEndpoint,
    },
    answerScoringRequestSource: verifiedScoringRequest.source,
    studentQuestionBankDraftAnswerScoringRequest: {
      ...verifiedScoringRequest.response,
    },
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.answerSubmissionVerificationResult.evidenceRefs,
        `evidence:question-bank-answer-scoring-request-verification-input-hash:${normalized.verificationInputHash}`,
        `evidence:question-bank-answer-scoring-request-submitted-item-ids-hash:${normalized.submittedItemIdsHash}`,
        `evidence:runtime:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION_RUNTIME_ID}`,
        `evidence:command-port:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION_PORT}`,
        `evidence:source-answer-submission-verification-record:${normalized.answerSubmissionVerificationResult.recordId}`,
        `evidence:source-answer-scoring-request-foundation:${answerScoringRequestFoundationRuntimeId}`,
        `evidence:target-use-case:${targetUseCase}`,
      ]),
      idempotencyKey: normalized.idempotencyKey,
      verificationInputHash: normalized.verificationInputHash,
      submittedItemIdsHash: normalized.submittedItemIdsHash,
    },
    boundary: buildBoundary(),
  };
}

function buildBoundary() {
  return {
    answerSubmissionVerificationConsumed: true,
    answerScoringRequestFoundationConsumed: true,
    injectedScoringRequestPortInvoked: true,
    ownStudentPrincipalVerified: true,
    ownStudentWriteVerified: true,
    verifiedSubmissionQueuedForScoring: true,
    scoringRequestQueued: true,
    reusesExistingAIGradingRequestQueue: true,
    responseMetadataOnly: true,
    answerTextDisclosed: false,
    expectedAnswerDisclosed: false,
    explanationDisclosed: false,
    answerKeyDisclosed: false,
    scoreDisclosed: false,
    resultRefDisclosed: false,
    workerStateDisclosed: false,
    workerClaimStarted: false,
    scoringExecutionStarted: false,
    feedbackPublicationStarted: false,
    studentVisiblePublished: false,
    modelInferenceStarted: false,
    goUseCaseScoringRequestAllowed: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
    requiresFutureWorkerScoringAndReviewedFeedback: true,
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
    sourceAnswerSubmissionVerification: record.sourceAnswerSubmissionVerification,
    sourceAnswerScoringRequestFoundation: record.sourceAnswerScoringRequestFoundation,
    answerScoringRequestSource: record.answerScoringRequestSource,
    studentQuestionBankDraftAnswerScoringRequest: record.studentQuestionBankDraftAnswerScoringRequest,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 50,
      evidenceClass: "STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_REQUEST_VERIFICATION_BOUNDARY",
    },
    nextAction: "Use this as own-student answer scoring request verification evidence; worker scoring input, model scoring, reviewed feedback publication, and archive persistence remain separate reviewed slices.",
  };
}

function appendVerificationRecord(verificationLogPath, record) {
  const absolute = path.resolve(verificationLogPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.appendFileSync(absolute, `${JSON.stringify(record)}\n`);
}

function findExistingRecordByIdempotencyKey(verificationLogPath, idempotencyKey) {
  const absolute = path.resolve(verificationLogPath);
  if (!fs.existsSync(absolute)) return null;
  const lines = fs.readFileSync(absolute, "utf8").split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const record = JSON.parse(lines[index]);
    if (record?.recordType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.verificationInvocationId !== normalized.verificationInvocationId ||
    existing.sourceAnswerSubmissionVerification?.recordId !== normalized.answerSubmissionVerificationResult.recordId ||
    existing.evidence?.verificationInputHash !== normalized.verificationInputHash) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_SCORING_REQUEST_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different answer scoring request verification");
  }
}

function rejectOutputLeakedFields(value, context) {
  if (!value || typeof value !== "object") return;
  const stack = [{ value, path: context }];
  while (stack.length) {
    const current = stack.pop();
    if (!current.value || typeof current.value !== "object") continue;
    for (const [key, nested] of Object.entries(current.value)) {
      if (outputLeakKeyNames.includes(key)) {
        throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_SCORING_REQUEST_LEAKED_FIELD", `${current.path}.${key} is not allowed`);
      }
      if (nested && typeof nested === "object") stack.push({ value: nested, path: `${current.path}.${key}` });
    }
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_SCORING_REQUEST_INVALID_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_SCORING_REQUEST_CONST", `${label} must be ${String(expected)}`);
  }
  return expected;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string") {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_SCORING_REQUEST_STRING", `${label} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_SCORING_REQUEST_STRING_LENGTH", `${label} length is invalid`);
  }
  return trimmed;
}

function optionalBoundedString(value, label, min, max) {
  if (value === undefined || value === null || value === "") return "";
  return requireBoundedString(value, label, min, max);
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 260);
  if (!token.startsWith(prefix)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_SCORING_REQUEST_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireQuestionBankDraftRef(value, label) {
  const ref = requireBoundedString(value, label, 1, 1000);
  if (!ref.startsWith("local://question-bank-drafts/") || !ref.endsWith(".json")) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_SCORING_REQUEST_DRAFT_REF", `${label} must be a local question-bank draft ref`);
  }
  return ref;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_SCORING_REQUEST_INTEGER", `${label} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function uniqueStringArray(value, label, min, max) {
  if (!Array.isArray(value)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_SCORING_REQUEST_ARRAY", `${label} must be an array`);
  }
  const normalized = value.map((item, index) => requireBoundedString(item, `${label}[${index}]`, 1, 1000));
  const unique = uniq(normalized);
  if (unique.length !== normalized.length || unique.length < min || unique.length > max) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_SCORING_REQUEST_ARRAY_SIZE", `${label} must contain ${min}-${max} unique strings`);
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

function verificationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
