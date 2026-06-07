import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_answer_submission_verification_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION_PORT =
  "StudentAppAITutorQuestionBankDraftAnswerSubmissionVerificationPort.verifyStudentSafeQuestionBankDraftAnswerSubmission";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION_READY =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION_READY";

const inputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-submission-verification.v1";
const outputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-submission-verified.v1";
const contentStudentReadVerificationRuntimeId = "student_app_ai_tutor_question_bank_draft_content_student_read_verification_runtime";
const contentStudentReadVerificationStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFIED";
const answerSubmissionFoundationRuntimeId = "student_app_ai_tutor_question_bank_draft_answer_submission_foundation";
const answerSubmissionFoundationWorkload = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_FOUNDATION";
const verifiedStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFIED";
const targetUseCase = "SubmitStudentAppQuestionBankDraftAnswer.ExecuteWithPersistence";
const targetRepository = "ArchiveRepository.SubmitQuestionBankDraftAnswerSubmission";
const targetEndpoint = "POST /v1/student-app/question-bank-draft-answer-submissions";
const defaultVerificationLogPath =
  "reports/student-command-log/student-app-ai-tutor-question-bank-draft-answer-submission-verification.jsonl";

const outputLeakKeyNames = [
  "answerText",
  "expectedAnswer",
  "explanation",
  "answerKey",
  "correctAnswer",
  "score",
  "scoreSummary",
  "rawModelOutput",
  "modelOutput",
  "modelResponse",
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

export async function verifyStudentAppAITutorQuestionBankDraftAnswerSubmission(input, options = {}) {
  const verifiedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const verificationLogPath = options.verificationLogPath ?? defaultVerificationLogPath;
  const existing = findExistingRecordByIdempotencyKey(verificationLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const submitPort = assertAnswerSubmissionPort(options.studentQuestionBankDraftAnswerSubmissionPort);
  const submitResult = await submitPort.submitStudentAppQuestionBankDraftAnswer(
    {
      principal: normalized.principal,
      questionBankDraftRef: normalized.studentQuestionBankDraftContent.questionBankDraftRef,
      answers: normalized.answers,
    },
    {
      verificationInvocationId: normalized.verificationInvocationId,
      idempotencyKey: normalized.idempotencyKey,
      sourceContentStudentReadVerificationRecordId: normalized.contentStudentReadVerificationResult.recordId,
    },
  );
  const verifiedSubmission = assertAnswerSubmissionResult(submitResult, normalized);
  const record = buildVerificationRecord(normalized, verifiedSubmission, verifiedAt);
  appendVerificationRecord(verificationLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftAnswerSubmissionVerification(result) {
  return [
    `Student App AI Tutor question-bank draft answer submission verification: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Use case: ${result.answerSubmissionSource.targetUseCase}`,
    `Submission: ${result.studentQuestionBankDraftAnswerSubmission.id}`,
    `Answer submission persisted: ${result.boundary.answerSubmissionPersisted}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const verificationInvocationId = requireToken(input.verificationInvocationId, "input.verificationInvocationId", "qbank_answer_submission_verification_");
  const principal = assertPrincipal(input.principal);
  const contentStudentReadVerificationReport = assertContentStudentReadVerificationReport(input.contentStudentReadVerificationReport);
  const contentStudentReadVerificationResult = assertContentStudentReadVerificationResult(contentStudentReadVerificationReport, principal);
  const answerSubmissionFoundationReport = assertAnswerSubmissionFoundationReport(input.answerSubmissionFoundationReport);
  const verificationPolicy = assertVerificationPolicy(input.answerSubmissionVerificationPolicy);
  requireConst(principal.principalId, contentStudentReadVerificationResult.principal.principalId, "input.principal.principalId");
  const answers = assertSubmittedAnswers(input.answers, contentStudentReadVerificationResult.studentQuestionBankDraftContent.items);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 520);
  if (!evidenceRefs.some((ref) => ref.includes("content-student-read-verification"))) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SUBMISSION_MISSING_READ_VERIFICATION_EVIDENCE", "content student read verification evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("answer-submission-foundation"))) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SUBMISSION_MISSING_FOUNDATION_EVIDENCE", "answer submission foundation evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const answersHash = hashInput(answers);
  const verificationInputHash = hashInput({
    verificationInvocationId,
    principalId: principal.principalId,
    ownStudentId: principal.studentAccess.ownStudentId,
    sourceContentStudentReadVerificationRecordId: contentStudentReadVerificationResult.recordId,
    questionBankDraftRef: contentStudentReadVerificationResult.studentQuestionBankDraftContent.questionBankDraftRef,
    answerItemIds: answers.map((answer) => answer.itemId),
    answersHash,
    answerSubmissionFoundationRuntimeId: answerSubmissionFoundationReport.runtime.runtimeId,
    verificationPolicy,
  });
  return {
    verificationInvocationId,
    principal,
    contentStudentReadVerificationReport,
    contentStudentReadVerificationResult,
    answerSubmissionFoundationReport,
    verificationPolicy,
    answers,
    answersHash,
    evidenceRefs,
    idempotencyKey,
    studentQuestionBankDraftContent: contentStudentReadVerificationResult.studentQuestionBankDraftContent,
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
      throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SUBMISSION_MISSING_SCOPE", `${scope} is required`);
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

function assertContentStudentReadVerificationReport(report) {
  assertPlainObject(report, "input.contentStudentReadVerificationReport");
  requireConst(report.readiness, "READY", "input.contentStudentReadVerificationReport.readiness");
  requireConst(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION", "input.contentStudentReadVerificationReport.workloadType");
  requireConst(report.runtime?.runtimeId, contentStudentReadVerificationRuntimeId, "input.contentStudentReadVerificationReport.runtime.runtimeId");
  requireConst(report.runtime?.status, contentStudentReadVerificationStatus, "input.contentStudentReadVerificationReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.contentStudentReadVerificationReport.runtimeSlo.totalErrors");
  const invariants = report.safetyInvariants ?? {};
  for (const field of [
    "contentRowVerificationRequired",
    "contentReadFoundationRequired",
    "injectedStudentContentReadPortRequired",
    "ownStudentOnly",
    "safeStudentResponseMatchedVerifiedPreview",
  ]) {
    requireConst(invariants[field], true, `input.contentStudentReadVerificationReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "expectedAnswerDisclosed",
    "explanationDisclosed",
    "answerKeyDisclosed",
    "workerStateDisclosed",
    "studentAnsweringAllowed",
    "scoringAllowed",
    "modelInferenceAllowed",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "swarmAllowed",
  ]) {
    requireConst(invariants[field], false, `input.contentStudentReadVerificationReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertContentStudentReadVerificationResult(report, expectedPrincipal) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftContentStudentReadVerification?.result;
  assertPlainObject(result, "input.contentStudentReadVerificationReport.runtimeProbes.result");
  requireConst(result.schemaVersion, "2026-06-06.student-app.ai-tutor-question-bank-draft-content-student-read-verified.v1", "read.source.schemaVersion");
  requireConst(result.runtimeId, contentStudentReadVerificationRuntimeId, "read.source.runtimeId");
  requireConst(result.status, contentStudentReadVerificationStatus, "read.source.status");
  requireConst(result.boundary?.ownStudentSafeReadVerified, true, "read.source.boundary.ownStudentSafeReadVerified");
  requireConst(result.boundary?.safeStudentResponseMatchedVerifiedPreview, true, "read.source.boundary.safeStudentResponseMatchedVerifiedPreview");
  requireConst(result.boundary?.answerKeyDisclosed, false, "read.source.boundary.answerKeyDisclosed");
  requireConst(result.boundary?.expectedAnswerDisclosed, false, "read.source.boundary.expectedAnswerDisclosed");
  requireConst(result.boundary?.explanationDisclosed, false, "read.source.boundary.explanationDisclosed");
  requireConst(result.boundary?.studentAnsweringStarted, false, "read.source.boundary.studentAnsweringStarted");
  requireConst(result.boundary?.scoringStarted, false, "read.source.boundary.scoringStarted");
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "read.source.recordId", 1, 360),
    principal: resolveSourceReadPrincipal(result, expectedPrincipal),
    studentQuestionBankDraftContent: assertStudentQuestionBankDraftContent(result.studentQuestionBankDraftContent),
    evidenceRefs: uniqueStringArray(result.evidenceRefs ?? [], "read.source.evidenceRefs", 1, 1800),
  };
}

function resolveSourceReadPrincipal(result, expectedPrincipal) {
  const principal = result.principal ?? {
    principalId: result.studentReadSource?.principalId,
    role: expectedPrincipal.role,
    entryPoint: expectedPrincipal.entryPoint,
    studentAccessMode: expectedPrincipal.studentAccess.mode,
  };
  const sourcePrincipal = assertSourceReadPrincipal(principal);
  requireConst(expectedPrincipal.principalId, sourcePrincipal.principalId, "input.principal.principalId");
  return sourcePrincipal;
}

function assertSourceReadPrincipal(principal) {
  assertPlainObject(principal, "read.source.principal");
  return {
    principalId: requireBoundedString(principal.principalId, "read.source.principal.principalId", 1, 128),
    role: requireConst(principal.role, "STUDENT", "read.source.principal.role"),
    entryPoint: requireConst(principal.entryPoint, "STUDENT_APP", "read.source.principal.entryPoint"),
    studentAccessMode: requireConst(principal.studentAccessMode, "OWN", "read.source.principal.studentAccessMode"),
  };
}

function assertStudentQuestionBankDraftContent(content) {
  rejectOutputLeakedFields(content, "read.source.studentQuestionBankDraftContent");
  assertPlainObject(content, "read.source.studentQuestionBankDraftContent");
  const items = assertReadItems(content.items, "read.source.studentQuestionBankDraftContent.items");
  return {
    questionBankDraftRef: requireQuestionBankDraftRef(content.questionBankDraftRef, "read.source.studentQuestionBankDraftContent.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireToken(content.tutoringAnalysisRequestId, "read.source.studentQuestionBankDraftContent.tutoringAnalysisRequestId", "tutor_req_"),
    archiveItemId: requireToken(content.archiveItemId, "read.source.studentQuestionBankDraftContent.archiveItemId", "tarch_"),
    sourceArchiveMaterial: requireEnum(content.sourceArchiveMaterial, "read.source.studentQuestionBankDraftContent.sourceArchiveMaterial", ["QUIZ", "PAPER", "HANDOUT", "HOMEWORK"]),
    resultSummary: requireBoundedString(content.resultSummary, "read.source.studentQuestionBankDraftContent.resultSummary", 1, 2000),
    items,
  };
}

function assertReadItems(items, label) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SUBMISSION_READ_ITEMS", `${label} must contain 1-100 items`);
  }
  const seen = new Set();
  return items.map((item, index) => {
    rejectOutputLeakedFields(item, `${label}[${index}]`);
    assertPlainObject(item, `${label}[${index}]`);
    const id = requireBoundedString(item.id, `${label}[${index}].id`, 1, 128);
    if (seen.has(id)) throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SUBMISSION_DUPLICATE_READ_ITEM", `${id} is duplicated`);
    seen.add(id);
    return {
      id,
      questionText: requireBoundedString(item.questionText, `${label}[${index}].questionText`, 1, 2000),
      learningTarget: optionalBoundedString(item.learningTarget, `${label}[${index}].learningTarget`, 1, 200),
    };
  });
}

function assertAnswerSubmissionFoundationReport(report) {
  assertPlainObject(report, "input.answerSubmissionFoundationReport");
  requireConst(report.readiness, "READY", "input.answerSubmissionFoundationReport.readiness");
  requireConst(report.workloadType, answerSubmissionFoundationWorkload, "input.answerSubmissionFoundationReport.workloadType");
  requireConst(report.runtime?.runtimeId, answerSubmissionFoundationRuntimeId, "input.answerSubmissionFoundationReport.runtime.runtimeId");
  requireConst(report.runtime?.useCase, targetUseCase, "input.answerSubmissionFoundationReport.runtime.useCase");
  requireConst(report.runtime?.repository, targetRepository, "input.answerSubmissionFoundationReport.runtime.repository");
  requireConst(report.runtime?.endpoint, targetEndpoint, "input.answerSubmissionFoundationReport.runtime.endpoint");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.answerSubmissionFoundationReport.runtimeSlo.totalErrors");
  const invariants = report.safetyInvariants ?? {};
  for (const field of [
    "ownStudentOnly",
    "ownStudentWriteRequired",
    "draftRefAndStudentScopedLookup",
    "duplicateItemRejected",
    "unknownItemRejected",
  ]) {
    requireConst(invariants[field], true, `input.answerSubmissionFoundationReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "responseExposesAnswerText",
    "responseExposesExpectedAnswer",
    "responseExposesExplanation",
    "scoringAllowed",
    "studentVisiblePublishAllowed",
    "modelInferenceAllowed",
  ]) {
    requireConst(invariants[field], false, `input.answerSubmissionFoundationReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertVerificationPolicy(policy) {
  assertPlainObject(policy, "input.answerSubmissionVerificationPolicy");
  for (const field of [
    "contentStudentReadVerificationRequired",
    "answerSubmissionFoundationRequired",
    "injectedAnswerSubmissionPortRequired",
    "ownStudentPrincipalRequired",
    "ownStudentWriteScopeRequired",
    "submittedAnswersMustMatchReadItems",
    "responseMetadataOnlyRequired",
    "idempotentAnswerSubmissionVerificationRequired",
    "goUseCaseSubmissionAllowed",
  ]) {
    requireConst(policy[field], true, `input.answerSubmissionVerificationPolicy.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "answerTextDisclosureAllowed",
    "expectedAnswerDisclosureAllowed",
    "explanationDisclosureAllowed",
    "answerKeyDisclosureAllowed",
    "scoringAllowed",
    "feedbackPublicationAllowed",
    "studentVisiblePublishAllowed",
    "modelInferenceAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.answerSubmissionVerificationPolicy.${field}`);
  }
  return { ...policy };
}

function assertSubmittedAnswers(answers, readItems) {
  if (!Array.isArray(answers) || answers.length < 1 || answers.length > readItems.length) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SUBMISSION_ANSWERS_SIZE", "answers must contain 1 item through the safe read item count");
  }
  const allowedItemIds = new Set(readItems.map((item) => item.id));
  const seen = new Set();
  return answers.map((answer, index) => {
    assertPlainObject(answer, `input.answers[${index}]`);
    const itemId = requireBoundedString(answer.itemId, `input.answers[${index}].itemId`, 1, 128);
    if (seen.has(itemId)) throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SUBMISSION_DUPLICATE_ANSWER", `${itemId} is duplicated`);
    if (!allowedItemIds.has(itemId)) throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SUBMISSION_UNKNOWN_ITEM", `${itemId} is not in the verified safe content`);
    seen.add(itemId);
    return {
      itemId,
      answerText: requireBoundedString(answer.answerText, `input.answers[${index}].answerText`, 0, 4000),
    };
  });
}

function assertAnswerSubmissionPort(port) {
  if (!port || typeof port.submitStudentAppQuestionBankDraftAnswer !== "function") {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SUBMISSION_MISSING_PORT", "StudentQuestionBankDraftAnswerSubmissionPort.submitStudentAppQuestionBankDraftAnswer is required");
  }
  return port;
}

function assertAnswerSubmissionResult(result, normalized) {
  assertPlainObject(result, "StudentQuestionBankDraftAnswerSubmissionPort result");
  requireConst(result.persisted, true, "StudentQuestionBankDraftAnswerSubmissionPort result.persisted");
  const source = assertAnswerSubmissionSource(result.source, normalized.principal);
  const response = assertAnswerSubmissionResponse(result.response, normalized);
  return { source, response };
}

function assertAnswerSubmissionSource(source, principal) {
  assertPlainObject(source, "StudentQuestionBankDraftAnswerSubmissionPort result.source");
  return {
    targetUseCase: requireConst(source.targetUseCase, targetUseCase, "StudentQuestionBankDraftAnswerSubmissionPort result.source.targetUseCase"),
    repository: requireConst(source.repository, targetRepository, "StudentQuestionBankDraftAnswerSubmissionPort result.source.repository"),
    endpoint: requireConst(source.endpoint, targetEndpoint, "StudentQuestionBankDraftAnswerSubmissionPort result.source.endpoint"),
    ownStudentOnly: requireConst(source.ownStudentOnly, true, "StudentQuestionBankDraftAnswerSubmissionPort result.source.ownStudentOnly"),
    ownStudentWrite: requireConst(source.ownStudentWrite, true, "StudentQuestionBankDraftAnswerSubmissionPort result.source.ownStudentWrite"),
    studentScopedLookup: requireConst(source.studentScopedLookup, true, "StudentQuestionBankDraftAnswerSubmissionPort result.source.studentScopedLookup"),
    principalId: requireConst(source.principalId, principal.principalId, "StudentQuestionBankDraftAnswerSubmissionPort result.source.principalId"),
  };
}

function assertAnswerSubmissionResponse(response, normalized) {
  rejectOutputLeakedFields(response, "StudentQuestionBankDraftAnswerSubmissionPort result.response");
  assertPlainObject(response, "StudentQuestionBankDraftAnswerSubmissionPort result.response");
  const content = normalized.studentQuestionBankDraftContent;
  return {
    id: requireToken(response.id, "StudentQuestionBankDraftAnswerSubmissionPort result.response.id", "qbank_ans_sub_"),
    questionBankDraftRef: requireConst(response.questionBankDraftRef, content.questionBankDraftRef, "StudentQuestionBankDraftAnswerSubmissionPort result.response.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireConst(response.tutoringAnalysisRequestId, content.tutoringAnalysisRequestId, "StudentQuestionBankDraftAnswerSubmissionPort result.response.tutoringAnalysisRequestId"),
    archiveItemId: requireConst(response.archiveItemId, content.archiveItemId, "StudentQuestionBankDraftAnswerSubmissionPort result.response.archiveItemId"),
    status: requireConst(response.status, "SUBMITTED", "StudentQuestionBankDraftAnswerSubmissionPort result.response.status"),
    answerCount: requireConst(response.answerCount, normalized.answers.length, "StudentQuestionBankDraftAnswerSubmissionPort result.response.answerCount"),
    submittedAt: requireBoundedString(response.submittedAt, "StudentQuestionBankDraftAnswerSubmissionPort result.response.submittedAt", 1, 80),
  };
}

function buildVerificationRecord(normalized, verifiedSubmission, verifiedAt) {
  const content = normalized.studentQuestionBankDraftContent;
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION",
    recordId: `student_app_ai_tutor_question_bank_draft_answer_submission_verification_${safeToken(normalized.idempotencyKey)}`,
    recordedAt: verifiedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION_PORT,
    status: verifiedStatus,
    verificationInvocationId: normalized.verificationInvocationId,
    principal: {
      principalId: normalized.principal.principalId,
      role: normalized.principal.role,
      entryPoint: normalized.principal.entryPoint,
      studentAccessMode: normalized.principal.studentAccess.mode,
    },
    sourceContentStudentReadVerification: {
      runtimeId: contentStudentReadVerificationRuntimeId,
      recordId: normalized.contentStudentReadVerificationResult.recordId,
      questionBankDraftRef: content.questionBankDraftRef,
      priorStatus: contentStudentReadVerificationStatus,
    },
    sourceAnswerSubmissionFoundation: {
      runtimeId: answerSubmissionFoundationRuntimeId,
      useCase: targetUseCase,
      repository: targetRepository,
      endpoint: targetEndpoint,
    },
    answerSubmissionSource: verifiedSubmission.source,
    studentQuestionBankDraftAnswerSubmission: {
      ...verifiedSubmission.response,
      submittedAnswerItemIds: normalized.answers.map((answer) => answer.itemId),
    },
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.contentStudentReadVerificationResult.evidenceRefs,
        `evidence:question-bank-answer-submission-verification-input-hash:${normalized.verificationInputHash}`,
        `evidence:question-bank-answer-submission-answers-hash:${normalized.answersHash}`,
        `evidence:runtime:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION_RUNTIME_ID}`,
        `evidence:command-port:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION_PORT}`,
        `evidence:source-content-student-read-verification-record:${normalized.contentStudentReadVerificationResult.recordId}`,
        `evidence:source-answer-submission-foundation:${answerSubmissionFoundationRuntimeId}`,
        `evidence:target-use-case:${targetUseCase}`,
      ]),
      idempotencyKey: normalized.idempotencyKey,
      verificationInputHash: normalized.verificationInputHash,
      answersHash: normalized.answersHash,
    },
    boundary: buildBoundary(),
  };
}

function buildBoundary() {
  return {
    contentStudentReadVerificationConsumed: true,
    answerSubmissionFoundationConsumed: true,
    injectedAnswerSubmissionPortInvoked: true,
    ownStudentPrincipalVerified: true,
    ownStudentWriteVerified: true,
    submittedAnswersMatchedReadItems: true,
    answerSubmissionPersisted: true,
    responseMetadataOnly: true,
    answerTextDisclosed: false,
    expectedAnswerDisclosed: false,
    explanationDisclosed: false,
    answerKeyDisclosed: false,
    workerStateDisclosed: false,
    scoringStarted: false,
    feedbackPublicationStarted: false,
    studentVisiblePublished: false,
    modelInferenceStarted: false,
    goUseCaseSubmissionAllowed: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
    requiresFutureScoringAndReviewedFeedback: true,
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
    sourceContentStudentReadVerification: record.sourceContentStudentReadVerification,
    sourceAnswerSubmissionFoundation: record.sourceAnswerSubmissionFoundation,
    answerSubmissionSource: record.answerSubmissionSource,
    studentQuestionBankDraftAnswerSubmission: record.studentQuestionBankDraftAnswerSubmission,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 50,
      evidenceClass: "STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SUBMISSION_VERIFICATION_BOUNDARY",
    },
    nextAction: "Use this as own-student answer submission verification evidence; scoring, reviewed feedback publication, archive persistence, and model inference remain separate reviewed slices.",
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
    if (record?.recordType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.verificationInvocationId !== normalized.verificationInvocationId ||
    existing.sourceContentStudentReadVerification?.recordId !== normalized.contentStudentReadVerificationResult.recordId ||
    existing.evidence?.verificationInputHash !== normalized.verificationInputHash) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SUBMISSION_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different answer submission verification");
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
        throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SUBMISSION_LEAKED_FIELD", `${current.path}.${key} is not allowed`);
      }
      if (nested && typeof nested === "object") stack.push({ value: nested, path: `${current.path}.${key}` });
    }
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SUBMISSION_INVALID_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SUBMISSION_CONST", `${label} must be ${String(expected)}`);
  }
  return expected;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string") {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SUBMISSION_STRING", `${label} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SUBMISSION_STRING_LENGTH", `${label} length is invalid`);
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
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SUBMISSION_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireQuestionBankDraftRef(value, label) {
  const ref = requireBoundedString(value, label, 1, 1000);
  if (!ref.startsWith("local://question-bank-drafts/") || !ref.endsWith(".json")) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SUBMISSION_DRAFT_REF", `${label} must be a local question-bank draft ref`);
  }
  return ref;
}

function requireEnum(value, label, allowed) {
  if (!allowed.includes(value)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SUBMISSION_ENUM", `${label} must be one of ${allowed.join(",")}`);
  }
  return value;
}

function uniqueStringArray(value, label, min, max) {
  if (!Array.isArray(value)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SUBMISSION_ARRAY", `${label} must be an array`);
  }
  const normalized = value.map((item, index) => requireBoundedString(item, `${label}[${index}]`, 1, 1000));
  const unique = uniq(normalized);
  if (unique.length !== normalized.length || unique.length < min || unique.length > max) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SUBMISSION_ARRAY_SIZE", `${label} must contain ${min}-${max} unique strings`);
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
