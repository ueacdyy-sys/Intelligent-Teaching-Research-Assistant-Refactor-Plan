import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMIT_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_generation_content_storage_commit_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMIT_PORT =
  "StudentAppAITutorQuestionBankDraftGenerationContentStorageCommitPort.saveReviewedQuestionBankDraftContent";

const inputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-content-storage-commit.v1";
const outputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-content-storage-committed.v1";
const teacherReviewRuntimeId = "student_app_ai_tutor_question_bank_draft_generation_teacher_review_runtime";
const teacherReviewPort = "StudentAppAITutorQuestionBankDraftGenerationTeacherReviewPort.recordGeneratedDraftTeacherReview";
const inputEnvelopeRuntimeId = "student_app_ai_tutor_question_bank_draft_generation_input_envelope_runtime";
const generationPlanRuntimeId = "student_app_ai_tutor_question_bank_draft_generation_plan_runtime";
const sourceRequestRuntimeId = "student_app_ai_tutor_request_runtime";
const committedStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMITTED";
const defaultCommitLogPath = "reports/student-command-log/student-app-ai-tutor-question-bank-draft-generation-content-storage-commit.jsonl";
const targetRepository = "ArchiveRepository.SaveQuestionBankDraftContent";
const targetTable = "teaching_question_bank_draft_contents";

const leakedFieldNames = [
  "answerKey",
  "correctAnswer",
  "rawModelOutput",
  "modelOutput",
  "modelResponse",
  "contentRows",
  "directSql",
  "dbUrl",
  "internalError",
  "errorMessage",
  "publishedAt",
  "publicationStatus",
];

export async function commitStudentAppAITutorQuestionBankDraftGenerationContentStorage(input, options = {}) {
  const committedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input, committedAt);
  const commitLogPath = options.commitLogPath ?? defaultCommitLogPath;
  const existing = findExistingRecordByIdempotencyKey(commitLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const port = assertContentStoragePort(options.questionBankDraftContentStoragePort);
  const portResult = await port.saveReviewedQuestionBankDraftContent(normalized.storageCommand, {
    commitInvocationId: normalized.commitInvocationId,
    idempotencyKey: normalized.idempotencyKey,
    sourceTeacherReviewRecordId: normalized.teacherReviewRecord.recordId,
  });
  const persisted = assertPortResult(portResult, normalized.storageCommand);
  const record = buildCommitRecord(normalized, persisted, committedAt);
  appendCommitRecord(commitLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftGenerationContentStorageCommit(result) {
  return [
    `Student App AI Tutor question-bank generation content storage commit: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Draft content: ${result.questionBankDraftContent.questionBankDraftRef}`,
    `Target: ${result.teachingArchiveContentStorage.targetRepository}`,
    `Content stored: ${result.boundary.contentStored}`,
  ].join("\n");
}

function normalizeInput(input, committedAt) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const commitInvocationId = requireToken(input.commitInvocationId, "input.commitInvocationId", "qbank_generation_content_storage_commit_");
  const teacherReviewReport = assertTeacherReviewReport(input.teacherReviewReport);
  const teacherReviewRecord = assertTeacherReviewRecord(teacherReviewReport);
  const inputEnvelopeReport = assertInputEnvelopeReport(input.generationInputEnvelopeReport);
  const inputEnvelopeRecord = assertInputEnvelopeRecord(inputEnvelopeReport, teacherReviewRecord);
  const generationPlanReport = assertGenerationPlanReport(input.generationPlanReport, inputEnvelopeRecord);
  const sourceRequestReport = assertSourceRequestReport(input.sourceRequestReport, inputEnvelopeRecord);
  const principal = assertServicePrincipal(input.principal, inputEnvelopeRecord.studentId);
  const policy = assertCommitPolicy(input.contentStorageCommitPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 480);
  if (!evidenceRefs.some((ref) => ref.includes("generation-teacher-review"))) {
    throw commitError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_STORAGE_COMMIT_MISSING_REVIEW_EVIDENCE", "teacher review evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("generation-input-envelope"))) {
    throw commitError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_STORAGE_COMMIT_MISSING_ENVELOPE_EVIDENCE", "input envelope evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const storageCommand = assertStorageCommand(buildStorageCommand({
    commitInvocationId,
    principal,
    teacherReviewRecord,
    inputEnvelopeRecord,
    generationPlanReport,
    sourceRequestReport,
    committedAt,
  }));
  const commitInputHash = hashInput({
    commitInvocationId,
    teacherReviewRecordId: teacherReviewRecord.recordId,
    reviewId: teacherReviewRecord.teacherReview.reviewId,
    envelopeId: inputEnvelopeRecord.envelopeId,
    storageCommand: stableStorageCommandForHash(storageCommand),
    policy,
  });
  return {
    commitInvocationId,
    teacherReviewRecord,
    inputEnvelopeRecord,
    generationPlanReport,
    sourceRequestReport,
    principal,
    policy,
    evidenceRefs,
    idempotencyKey,
    storageCommand,
    commitInputHash,
  };
}

function assertTeacherReviewReport(report) {
  assertPlainObject(report, "input.teacherReviewReport");
  requireConst(report.readiness, "READY", "input.teacherReviewReport.readiness");
  requireConst(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW", "input.teacherReviewReport.workloadType");
  requireConst(report.runtime?.runtimeId, teacherReviewRuntimeId, "input.teacherReviewReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, teacherReviewPort, "input.teacherReviewReport.runtime.commandPort");
  requireConst(report.runtime?.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_RECORDED", "input.teacherReviewReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.teacherReviewReport.runtimeSlo.totalErrors");
  const boundary = report.safetyInvariants ?? {};
  for (const field of ["sourceControlledDraftRequired", "teacherOrAdminReviewRequired", "contentStorageApprovalRecorded", "teacherReviewedRubricRecorded"]) {
    requireConst(boundary[field], true, `input.teacherReviewReport.safetyInvariants.${field}`);
  }
  for (const field of ["rawModelOutputStored", "answerKeyGeneratedByModel", "studentAnswerKeyDisclosed", "questionBankContentWriteStarted", "studentAnsweringAllowed", "scoringAllowed", "studentVisiblePublishAllowed", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "swarmAllowed"]) {
    requireConst(boundary[field], false, `input.teacherReviewReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertTeacherReviewRecord(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationTeacherReview?.result;
  assertPlainObject(result, "input.teacherReviewReport.runtimeProbes.result");
  requireConst(result.schemaVersion, "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-teacher-review-recorded.v1", "source.teacherReview.schemaVersion");
  requireConst(result.runtimeId, teacherReviewRuntimeId, "source.teacherReview.runtimeId");
  requireConst(result.commandPort, teacherReviewPort, "source.teacherReview.commandPort");
  requireConst(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_RECORDED", "source.teacherReview.status");
  requireConst(result.teacherReview?.decision, "APPROVED_FOR_CONTENT_STORAGE_NOT_COMMITTED", "source.teacherReview.decision");
  requireConst(result.teacherReview?.executionState, "TEACHER_REVIEW_RECORDED_NOT_STORED", "source.teacherReview.executionState");
  requireConst(result.boundary?.humanReviewCompleted, true, "source.teacherReview.boundary.humanReviewCompleted");
  requireConst(result.boundary?.questionBankContentWriteStarted, false, "source.teacherReview.boundary.questionBankContentWriteStarted");
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "source.teacherReview.recordId", 1, 360),
    teacherReview: assertTeacherReview(result.teacherReview),
    evidenceRefs: uniqueStringArray(result.evidenceRefs ?? [], "source.teacherReview.evidenceRefs", 1, 1200),
  };
}

function assertTeacherReview(review) {
  assertPlainObject(review, "source.teacherReview.teacherReview");
  const reviewedItems = assertReviewedItems(review.reviewedItems);
  return {
    reviewId: requireToken(review.reviewId, "source.teacherReview.reviewId", "qbank_generation_review_"),
    controlledDraftArtifactId: requireToken(review.controlledDraftArtifactId, "source.teacherReview.controlledDraftArtifactId", "qbank_generation_controlled_draft_"),
    questionBankDraftRef: requireQuestionBankDraftRef(review.questionBankDraftRef, "source.teacherReview.questionBankDraftRef"),
    studentId: requireBoundedString(review.studentId, "source.teacherReview.studentId", 1, 128),
    reviewerPrincipalId: requireBoundedString(review.reviewerPrincipalId, "source.teacherReview.reviewerPrincipalId", 1, 128),
    reviewedAt: requireIsoString(review.reviewedAt, "source.teacherReview.reviewedAt"),
    decision: "APPROVED_FOR_CONTENT_STORAGE_NOT_COMMITTED",
    status: requireConst(review.status, "TEACHER_REVIEW_APPROVED_FOR_CONTENT_STORAGE_NOT_COMMITTED", "source.teacherReview.status"),
    executionState: "TEACHER_REVIEW_RECORDED_NOT_STORED",
    reviewedItems,
  };
}

function assertReviewedItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 12) {
    throw commitError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_STORAGE_COMMIT_INVALID_ITEMS", "teacher review must contain 1-12 reviewed items");
  }
  const seen = new Set();
  return items.map((item, index) => {
    rejectLeakedFields(item, `source.teacherReview.reviewedItems[${index}]`);
    assertPlainObject(item, `source.teacherReview.reviewedItems[${index}]`);
    const itemId = requireToken(item.itemId, `source.teacherReview.reviewedItems[${index}].itemId`, "qbank_plan_item_");
    if (seen.has(itemId)) throw commitError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_STORAGE_COMMIT_DUPLICATE_ITEM", `${itemId} is duplicated`);
    seen.add(itemId);
    return {
      itemId,
      questionType: requireEnum(item.questionType, `source.teacherReview.reviewedItems[${index}].questionType`, ["SHORT_ANSWER", "MULTIPLE_CHOICE", "FILL_IN_BLANK", "CALCULATION"]),
      difficulty: requireEnum(item.difficulty, `source.teacherReview.reviewedItems[${index}].difficulty`, ["FOUNDATION", "STANDARD", "CHALLENGE"]),
      knowledgePoint: requireSafeText(item.knowledgePoint, `source.teacherReview.reviewedItems[${index}].knowledgePoint`, 3, 160),
      questionText: requireSafeText(item.questionText, `source.teacherReview.reviewedItems[${index}].questionText`, 12, 1200),
      teacherAnswerRubric: requireSafeText(item.teacherAnswerRubric, `source.teacherReview.reviewedItems[${index}].teacherAnswerRubric`, 2, 1200),
      teacherExplanationForScoring: requireSafeText(item.teacherExplanationForScoring, `source.teacherReview.reviewedItems[${index}].teacherExplanationForScoring`, 2, 1600),
      learningTarget: requireSafeText(item.learningTarget, `source.teacherReview.reviewedItems[${index}].learningTarget`, 3, 200),
      sourceEvidenceRef: requireBoundedString(item.sourceEvidenceRef, `source.teacherReview.reviewedItems[${index}].sourceEvidenceRef`, 8, 260),
    };
  });
}

function assertInputEnvelopeReport(report) {
  assertPlainObject(report, "input.generationInputEnvelopeReport");
  requireConst(report.readiness, "READY", "input.generationInputEnvelopeReport.readiness");
  requireConst(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE", "input.generationInputEnvelopeReport.workloadType");
  requireConst(report.runtime?.runtimeId, inputEnvelopeRuntimeId, "input.generationInputEnvelopeReport.runtime.runtimeId");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.generationInputEnvelopeReport.runtimeSlo.totalErrors");
  return report;
}

function assertInputEnvelopeRecord(report, teacherReviewRecord) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationInputEnvelope?.result;
  assertPlainObject(result, "input.generationInputEnvelopeReport.runtimeProbes.result");
  requireConst(result.runtimeId, inputEnvelopeRuntimeId, "source.inputEnvelope.runtimeId");
  requireConst(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RECORDED", "source.inputEnvelope.status");
  const envelope = assertPlainObject(result.inputEnvelope, "source.inputEnvelope.inputEnvelope");
  requireConst(envelope.executionState, "INPUT_ENVELOPE_RECORDED_NOT_GENERATED", "source.inputEnvelope.executionState");
  requireConst(envelope.questionBankDraftRef, teacherReviewRecord.teacherReview.questionBankDraftRef, "source.inputEnvelope.questionBankDraftRef");
  requireConst(envelope.studentId, teacherReviewRecord.teacherReview.studentId, "source.inputEnvelope.studentId");
  return {
    envelopeId: requireToken(envelope.envelopeId, "source.inputEnvelope.envelopeId", "qbank_generation_input_envelope_"),
    questionBankDraftRef: envelope.questionBankDraftRef,
    sourceRequestId: requireToken(envelope.sourceRequestId, "source.inputEnvelope.sourceRequestId", "tutor_req_"),
    archiveItemId: requireToken(envelope.archiveItemId, "source.inputEnvelope.archiveItemId", "tarch_"),
    studentId: envelope.studentId,
  };
}

function assertGenerationPlanReport(report, inputEnvelopeRecord) {
  assertPlainObject(report, "input.generationPlanReport");
  requireConst(report.readiness, "READY", "input.generationPlanReport.readiness");
  requireConst(report.runtime?.runtimeId, generationPlanRuntimeId, "input.generationPlanReport.runtime.runtimeId");
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationPlan?.result;
  assertPlainObject(result, "input.generationPlanReport.runtimeProbes.result");
  requireConst(result.sourceResult?.requestId, inputEnvelopeRecord.sourceRequestId, "source.generationPlan.sourceResult.requestId");
  requireConst(result.sourceResult?.archiveItemId, inputEnvelopeRecord.archiveItemId, "source.generationPlan.sourceResult.archiveItemId");
  requireConst(result.sourceResult?.questionBankDraftRef, inputEnvelopeRecord.questionBankDraftRef, "source.generationPlan.sourceResult.questionBankDraftRef");
  requireConst(result.generationPlan?.futureStorageRepository, targetRepository, "source.generationPlan.futureStorageRepository");
  requireConst(result.generationPlan?.targetContentTable, targetTable, "source.generationPlan.targetContentTable");
  return report;
}

function assertSourceRequestReport(report, inputEnvelopeRecord) {
  assertPlainObject(report, "input.sourceRequestReport");
  requireConst(report.readiness, "READY", "input.sourceRequestReport.readiness");
  requireConst(report.runtime?.runtimeId, sourceRequestRuntimeId, "input.sourceRequestReport.runtime.runtimeId");
  const request = report.runtimeProbes?.studentAppAiTutorRequest?.result?.tutoringAnalysisRequest;
  assertPlainObject(request, "input.sourceRequestReport.runtimeProbes.result.tutoringAnalysisRequest");
  requireConst(request.id, inputEnvelopeRecord.sourceRequestId, "source.request.id");
  requireConst(request.archiveItemId, inputEnvelopeRecord.archiveItemId, "source.request.archiveItemId");
  requireConst(request.sourceArchiveStudentId, inputEnvelopeRecord.studentId, "source.request.sourceArchiveStudentId");
  return report;
}

function assertServicePrincipal(principal, studentId) {
  assertPlainObject(principal, "input.principal");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 3, 32);
  for (const scope of ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "QUESTION_BANK_DRAFT_STORAGE_COMMIT"]) {
    if (!scopes.includes(scope)) {
      throw commitError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_STORAGE_COMMIT_SCOPE_MISSING", `${scope} is required`);
    }
  }
  const studentAccess = assertStudentAccess(principal.studentAccess, studentId);
  return {
    principalId: requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128),
    subjectType: requireConst(principal.subjectType, "SERVICE", "input.principal.subjectType"),
    role: requireConst(principal.role, "SERVICE", "input.principal.role"),
    entryPoint: requireConst(principal.entryPoint, "AGENT_INTERNAL", "input.principal.entryPoint"),
    scopes,
    studentAccess,
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 160),
  };
}

function assertStudentAccess(access, studentId) {
  assertPlainObject(access, "input.principal.studentAccess");
  const mode = requireEnum(access.mode, "input.principal.studentAccess.mode", ["ASSIGNED", "ALL"]);
  const studentIds = Array.isArray(access.studentIds)
    ? uniqueStringArray(access.studentIds, "input.principal.studentAccess.studentIds", mode === "ASSIGNED" ? 1 : 0, 200)
    : [];
  if (mode === "ASSIGNED" && !studentIds.includes(studentId)) {
    throw commitError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_STORAGE_COMMIT_STUDENT_ACCESS_MISMATCH", "assigned student access must include the draft student");
  }
  return { mode, studentIds };
}

function assertCommitPolicy(policy) {
  assertPlainObject(policy, "input.contentStorageCommitPolicy");
  for (const field of ["teacherReviewRequired", "generationInputEnvelopeRequired", "generationPlanRequired", "sourceTutorRequestRequired", "injectedTeachingArchivePortRequired", "teachingArchiveDomainValidationRequired", "idempotentStorageCommitRequired", "questionBankContentWriteAllowed", "contentStoredRequired", "teacherRubricInternalScoringOnly"]) {
    requireConst(policy[field], true, `input.contentStorageCommitPolicy.${field}`);
  }
  for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "studentVisiblePublishAllowed", "studentAnsweringAllowed", "scoringAllowed", "rawModelOutputStored", "modelInferenceAllowed", "modelAnswerKeyGenerated", "answerKeyDisclosureAllowed", "remoteDeviceControlAllowed", "localToolMutationAllowed", "swarmAllowed"]) {
    requireConst(policy[field], false, `input.contentStorageCommitPolicy.${field}`);
  }
  return { ...policy };
}

function buildStorageCommand(input) {
  const result = input.generationPlanReport.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationPlan.result;
  const request = input.sourceRequestReport.runtimeProbes.studentAppAiTutorRequest.result.tutoringAnalysisRequest;
  const review = input.teacherReviewRecord.teacherReview;
  return {
    commandId: `teaching_archive_save_qbank_content_${safeToken(input.commitInvocationId)}`,
    operationId: "saveReviewedQuestionBankDraftContent",
    targetUseCase: "CommitReviewedQuestionBankDraftContent.Execute",
    targetRepository,
    targetTable,
    principalContextHeader: {
      principalId: input.principal.principalId,
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      scopes: input.principal.scopes,
      studentAccess: input.principal.studentAccess,
      sessionId: input.principal.sessionId,
    },
    questionBankDraftContent: {
      questionBankDraftRef: review.questionBankDraftRef,
      tutoringAnalysisRequestId: input.inputEnvelopeRecord.sourceRequestId,
      archiveItemId: input.inputEnvelopeRecord.archiveItemId,
      studentId: review.studentId,
      status: "DRAFT",
      sourceArchiveMaterial: request.sourceArchiveMaterial,
      resultSummary: result.sourceResult.resultSummary,
      items: review.reviewedItems.map((item) => ({
        id: item.itemId,
        questionText: item.questionText,
        expectedAnswer: item.teacherAnswerRubric,
        explanation: item.teacherExplanationForScoring,
        learningTarget: item.learningTarget,
      })),
      createdAt: input.committedAt,
      updatedAt: input.committedAt,
    },
  };
}

function assertStorageCommand(command) {
  assertPlainObject(command, "storageCommand");
  requireConst(command.operationId, "saveReviewedQuestionBankDraftContent", "storageCommand.operationId");
  requireConst(command.targetUseCase, "CommitReviewedQuestionBankDraftContent.Execute", "storageCommand.targetUseCase");
  requireConst(command.targetRepository, targetRepository, "storageCommand.targetRepository");
  requireConst(command.targetTable, targetTable, "storageCommand.targetTable");
  const content = command.questionBankDraftContent;
  assertPlainObject(content, "storageCommand.questionBankDraftContent");
  requireQuestionBankDraftRef(content.questionBankDraftRef, "storageCommand.questionBankDraftContent.questionBankDraftRef");
  requireToken(content.tutoringAnalysisRequestId, "storageCommand.questionBankDraftContent.tutoringAnalysisRequestId", "tutor_req_");
  requireToken(content.archiveItemId, "storageCommand.questionBankDraftContent.archiveItemId", "tarch_");
  requireConst(content.questionBankDraftRef, `local://question-bank-drafts/${content.tutoringAnalysisRequestId}.json`, "storageCommand.questionBankDraftContent.linkage");
  requireConst(content.status, "DRAFT", "storageCommand.questionBankDraftContent.status");
  requireEnum(content.sourceArchiveMaterial, "storageCommand.questionBankDraftContent.sourceArchiveMaterial", ["QUIZ", "PAPER", "HANDOUT", "HOMEWORK"]);
  requireSafeText(content.resultSummary, "storageCommand.questionBankDraftContent.resultSummary", 1, 2000);
  assertStorageItems(content.items);
  return command;
}

function stableStorageCommandForHash(command) {
  return {
    ...command,
    questionBankDraftContent: {
      ...command.questionBankDraftContent,
      createdAt: "",
      updatedAt: "",
    },
  };
}

function assertStorageItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 12) {
    throw commitError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_STORAGE_COMMIT_INVALID_STORAGE_ITEMS", "storage content requires 1-12 items");
  }
  const seen = new Set();
  for (const [index, item] of items.entries()) {
    assertPlainObject(item, `storageCommand.questionBankDraftContent.items[${index}]`);
    const id = requireToken(item.id, `storageCommand.questionBankDraftContent.items[${index}].id`, "qbank_plan_item_");
    if (seen.has(id)) throw commitError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_STORAGE_COMMIT_DUPLICATE_STORAGE_ITEM", `${id} is duplicated`);
    seen.add(id);
    requireSafeText(item.questionText, `storageCommand.questionBankDraftContent.items[${index}].questionText`, 12, 1200);
    requireSafeText(item.expectedAnswer, `storageCommand.questionBankDraftContent.items[${index}].expectedAnswer`, 2, 1200);
    requireSafeText(item.explanation, `storageCommand.questionBankDraftContent.items[${index}].explanation`, 2, 1600);
    requireSafeText(item.learningTarget, `storageCommand.questionBankDraftContent.items[${index}].learningTarget`, 3, 200);
  }
}

function assertContentStoragePort(port) {
  if (!port || typeof port.saveReviewedQuestionBankDraftContent !== "function") {
    throw commitError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_STORAGE_COMMIT_PORT_REQUIRED", "QuestionBankDraftContentStoragePort.saveReviewedQuestionBankDraftContent is required");
  }
  return port;
}

function assertPortResult(result, command) {
  assertPlainObject(result, "QuestionBankDraftContentStoragePort result");
  requireConst(result.persisted, true, "result.persisted");
  requireConst(result.targetRepository, targetRepository, "result.targetRepository");
  requireConst(result.targetTable, targetTable, "result.targetTable");
  const stored = assertPlainObject(result.questionBankDraftContent, "result.questionBankDraftContent");
  const content = command.questionBankDraftContent;
  requireConst(stored.questionBankDraftRef, content.questionBankDraftRef, "result.questionBankDraftContent.questionBankDraftRef");
  requireConst(stored.tutoringAnalysisRequestId, content.tutoringAnalysisRequestId, "result.questionBankDraftContent.tutoringAnalysisRequestId");
  requireConst(stored.archiveItemId, content.archiveItemId, "result.questionBankDraftContent.archiveItemId");
  requireConst(stored.studentId, content.studentId, "result.questionBankDraftContent.studentId");
  requireConst(stored.status, "DRAFT", "result.questionBankDraftContent.status");
  requireConst(stored.sourceArchiveMaterial, content.sourceArchiveMaterial, "result.questionBankDraftContent.sourceArchiveMaterial");
  requireConst(stored.itemCount, content.items.length, "result.questionBankDraftContent.itemCount");
  requireConst(result.studentVisiblePublished, false, "result.studentVisiblePublished");
  return {
    persisted: true,
    targetRepository,
    targetTable,
    questionBankDraftContent: { ...stored },
    persistence: { status: "persisted", commandId: typeof result.persistence?.commandId === "string" ? result.persistence.commandId : "" },
  };
}

function buildCommitRecord(normalized, persisted, committedAt) {
  const content = normalized.storageCommand.questionBankDraftContent;
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMIT",
    recordId: `student_app_ai_tutor_question_bank_draft_generation_content_storage_commit_${safeToken(normalized.idempotencyKey)}`,
    recordedAt: committedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMIT_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMIT_PORT,
    status: committedStatus,
    commitInvocationId: normalized.commitInvocationId,
    sourceTeacherReview: {
      runtimeId: teacherReviewRuntimeId,
      recordId: normalized.teacherReviewRecord.recordId,
      reviewId: normalized.teacherReviewRecord.teacherReview.reviewId,
      questionBankDraftRef: normalized.teacherReviewRecord.teacherReview.questionBankDraftRef,
      studentId: normalized.teacherReviewRecord.teacherReview.studentId,
      priorExecutionState: "TEACHER_REVIEW_RECORDED_NOT_STORED",
    },
    sourceInputEnvelope: normalized.inputEnvelopeRecord,
    teachingArchiveContentStorage: {
      operationId: normalized.storageCommand.operationId,
      targetUseCase: normalized.storageCommand.targetUseCase,
      targetRepository: persisted.targetRepository,
      targetTable: persisted.targetTable,
      persistence: persisted.persistence,
    },
    questionBankDraftContent: {
      questionBankDraftRef: content.questionBankDraftRef,
      tutoringAnalysisRequestId: content.tutoringAnalysisRequestId,
      archiveItemId: content.archiveItemId,
      studentId: content.studentId,
      status: content.status,
      sourceArchiveMaterial: content.sourceArchiveMaterial,
      resultSummary: content.resultSummary,
      itemCount: content.items.length,
      internalScoringMaterialStored: true,
      studentAnswerKeyDisclosed: false,
    },
    safeStudentContentPreview: {
      items: content.items.map((item) => ({
        id: item.id,
        questionText: item.questionText,
        learningTarget: item.learningTarget,
      })),
      excludesExpectedAnswerAndExplanation: true,
    },
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.teacherReviewRecord.evidenceRefs,
        `evidence:question-bank-generation-content-storage-commit-input-hash:${normalized.commitInputHash}`,
        `evidence:runtime:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMIT_RUNTIME_ID}`,
        `evidence:command-port:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMIT_PORT}`,
        `evidence:target-repository:${targetRepository}`,
        `evidence:target-table:${targetTable}`,
      ]),
      idempotencyKey: normalized.idempotencyKey,
      commitInputHash: normalized.commitInputHash,
    },
    boundary: buildBoundary(),
  };
}

function buildBoundary() {
  return {
    teacherReviewVerified: true,
    generationInputEnvelopeVerified: true,
    generationPlanVerified: true,
    sourceTutorRequestVerified: true,
    teachingArchiveUseCasePortInvoked: true,
    teachingArchiveDomainValidationRequired: true,
    questionBankContentWriteStarted: true,
    questionBankContentWriteCommitted: true,
    contentStored: true,
    teacherRubricStoredAsInternalScoringMaterial: true,
    studentSafeQuestionPreviewOnly: true,
    rawModelOutputStored: false,
    answerKeyGeneratedByModel: false,
    studentAnswerKeyDisclosed: false,
    studentAnsweringStarted: false,
    scoringStarted: false,
    studentVisiblePublished: false,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
    requiresFutureRowVerification: true,
    requiresFutureStudentReadVerification: true,
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
    sourceTeacherReview: record.sourceTeacherReview,
    sourceInputEnvelope: record.sourceInputEnvelope,
    teachingArchiveContentStorage: record.teachingArchiveContentStorage,
    questionBankDraftContent: record.questionBankDraftContent,
    safeStudentContentPreview: record.safeStudentContentPreview,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 50,
      evidenceClass: "STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_STORAGE_COMMIT_BOUNDARY",
    },
    nextAction: "Use this as reviewed question-bank content storage evidence; physical row verification, student read verification, answering, scoring, and publication remain separate reviewed slices.",
  };
}

function appendCommitRecord(commitLogPath, record) {
  const absolute = path.resolve(commitLogPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.appendFileSync(absolute, `${JSON.stringify(record)}\n`);
}

function findExistingRecordByIdempotencyKey(commitLogPath, idempotencyKey) {
  const absolute = path.resolve(commitLogPath);
  if (!fs.existsSync(absolute)) return null;
  const lines = fs.readFileSync(absolute, "utf8").split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const record = JSON.parse(lines[index]);
    if (record?.recordType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMIT" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.commitInvocationId !== normalized.commitInvocationId ||
    existing.sourceTeacherReview?.recordId !== normalized.teacherReviewRecord.recordId ||
    existing.sourceInputEnvelope?.envelopeId !== normalized.inputEnvelopeRecord.envelopeId ||
    existing.evidence?.commitInputHash !== normalized.commitInputHash) {
    throw commitError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_STORAGE_COMMIT_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different content storage commit");
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
        throw commitError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_STORAGE_COMMIT_LEAKED_FIELD", `${current.path}.${key} is not allowed`);
      }
      if (nested && typeof nested === "object") stack.push({ value: nested, path: `${current.path}.${key}` });
    }
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw commitError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_STORAGE_COMMIT_INVALID_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw commitError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_STORAGE_COMMIT_CONST", `${label} must be ${String(expected)}`);
  }
  return expected;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string") {
    throw commitError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_STORAGE_COMMIT_STRING", `${label} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw commitError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_STORAGE_COMMIT_STRING_LENGTH", `${label} length is invalid`);
  }
  return trimmed;
}

function requireSafeText(value, label, min, max) {
  const text = requireBoundedString(value, label, min, max);
  if (/[<>]/u.test(text) || /script:/iu.test(text) || /javascript:/iu.test(text)) {
    throw commitError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_STORAGE_COMMIT_UNSAFE_TEXT", `${label} must be encoded safe text`);
  }
  return text;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 260);
  if (!token.startsWith(prefix)) {
    throw commitError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_STORAGE_COMMIT_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireQuestionBankDraftRef(value, label) {
  const ref = requireBoundedString(value, label, 1, 1000);
  if (!ref.startsWith("local://question-bank-drafts/") || !ref.endsWith(".json")) {
    throw commitError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_STORAGE_COMMIT_DRAFT_REF", `${label} must be a local question-bank draft ref`);
  }
  return ref;
}

function requireEnum(value, label, allowed) {
  const text = requireBoundedString(value, label, 1, 260);
  if (!allowed.includes(text)) {
    throw commitError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_STORAGE_COMMIT_ENUM", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireIsoString(value, label) {
  const text = requireBoundedString(value, label, 20, 40);
  if (Number.isNaN(Date.parse(text))) {
    throw commitError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_STORAGE_COMMIT_TIME", `${label} must be an ISO timestamp`);
  }
  return text;
}

function uniqueStringArray(values, label, min, max) {
  if (!Array.isArray(values) || values.length < min || values.length > max) {
    throw commitError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_STORAGE_COMMIT_ARRAY", `${label} length is invalid`);
  }
  const normalized = values.map((value, index) => requireBoundedString(value, `${label}[${index}]`, 1, 1200));
  if (new Set(normalized).size !== normalized.length) {
    throw commitError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_STORAGE_COMMIT_ARRAY_UNIQUE", `${label} must be unique`);
  }
  return normalized;
}

function hashInput(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function uniq(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
}

function safeToken(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9_-]+/gu, "_").replace(/^_+|_+$/gu, "") || "unknown";
}

function commitError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
