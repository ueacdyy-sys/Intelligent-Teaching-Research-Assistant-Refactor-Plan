import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RUNTIME_ID =
  "student_app_ai_tutor_result_student_archive_persistence_command_runtime";
export const STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PORT =
  "StudentAppAITutorResultStudentArchivePersistenceCommandPort.recordResultStudentArchivePersistenceCommand";

const inputSchemaVersion = "2026-06-08.student-app.ai-tutor-result-student-archive-persistence-command.v1";
const outputSchemaVersion = "2026-06-08.student-app.ai-tutor-result-student-archive-persistence-command-recorded.v1";
const deliveryRuntimeId = "student_app_ai_tutor_result_student_delivery_envelope_runtime";
const deliveryPort = "StudentAppAITutorResultStudentDeliveryEnvelopePort.recordResultStudentDeliveryEnvelope";
const deliveryStatus = "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED";
const deliveryWorkloadType = "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE";
const resultArchiveDeliveryWorkloadType = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_DELIVERY_ENVELOPE";
const resultArchiveDeliveryRuntimeId = "student_app_ai_tutor_result_archive_student_delivery_envelope";
const resultArchiveDeliveryStatus = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED";
const questionBankFeedbackDeliveryWorkloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_DELIVERY_ENVELOPE";
const questionBankFeedbackDeliveryRuntimeId = "student_app_ai_tutor_question_bank_feedback_student_delivery_envelope";
const questionBankFeedbackDeliveryStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED";
const controlledArtifactRuntimeId = "student_app_ai_tutor_controlled_answer_artifact_runtime";
const controlledArtifactPort = "StudentAppAITutorControlledAnswerArtifactPort.recordControlledAnswerArtifact";
const resultArchiveControlledArtifactRuntimeId = "student_app_ai_tutor_result_archive_controlled_answer_artifact";
const resultArchiveControlledArtifactWorkloadType = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_CONTROLLED_ANSWER_ARTIFACT";
const resultArchiveControlledArtifactStatus = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_CONTROLLED_ANSWER_ARTIFACT_RECORDED";
const questionBankFeedbackControlledArtifactRuntimeId = "student_app_ai_tutor_question_bank_feedback_controlled_answer_artifact";
const questionBankFeedbackControlledArtifactWorkloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_CONTROLLED_ANSWER_ARTIFACT";
const questionBankFeedbackControlledArtifactStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_CONTROLLED_ANSWER_ARTIFACT_RECORDED";
const resultArchiveSource = "AI_TUTOR_RESULT_ARCHIVE";
const resultArchiveReadyStatus = "READY_FOR_STUDENT_APP_READ";
const questionBankFeedbackSource = "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK";
const questionBankFeedbackReadyStatus = "READY_FOR_STUDENT_APP_READ";
const commandStatus = "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED";
const defaultCommandLogPath =
  "reports/student-command-log/student-app-ai-tutor-result-student-archive-persistence-command.jsonl";

const leakedFieldNames = new Set([
  "answerkey",
  "correctanswer",
  "expectedanswer",
  "contentref",
  "rawcontent",
  "rawmodeloutput",
  "modeloutput",
  "modelresponse",
  "prompt",
  "prompttext",
  "fullprompt",
  "ragchunks",
  "ocrchunks",
  "directsql",
  "dburl",
  "internalerror",
  "errormessage",
  "resultref",
  "databasewriteresult",
  "archivecommitresult",
  "studentarchivepersistenceresult",
  "feedbacksubmissionid",
  "feedbackid",
  "sourcearchiveid",
]);
const unsafeTextPattern = /(raw model|prompt|answer key|correct answer|expected answer|contentref|resultref|internal error|标准答案|参考答案|正确答案|原始模型|提示词)/iu;

export function recordStudentAppAITutorResultStudentArchivePersistenceCommand(input, options = {}) {
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

export function formatStudentAppAITutorResultStudentArchivePersistenceCommand(result) {
  return [
    `Student App AI Tutor result archive persistence command: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Command: ${result.studentArchivePersistenceCommand.commandId}`,
    `Envelope: ${result.studentArchivePersistenceCommand.sourceDeliveryEnvelopeId}`,
    `Committed: ${result.boundary.durableStudentArchiveCommitStarted}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const persistenceInvocationId = requireToken(input.persistenceInvocationId, "input.persistenceInvocationId", "ai_tutor_result_archive_persist_");
  const principal = assertPersistencePrincipal(input.principal);
  const deliveryReport = assertDeliveryEnvelopeReport(input.studentResultDeliveryEnvelopeReport);
  const deliveryRecord = assertDeliveryEnvelopeRecord(deliveryReport);
  const artifactReport = assertControlledAnswerArtifactReport(input.controlledAnswerArtifactReport);
  const controlledArtifact = assertControlledAnswerArtifact(artifactReport, deliveryRecord);
  const persistenceRequest = assertPersistenceRequest(input.studentArchivePersistenceRequest, deliveryRecord);
  const policy = assertPersistencePolicy(input.studentArchivePersistencePolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 24, 8, 360);
  for (const required of ["student-delivery-envelope", "controlled-answer-artifact"]) {
    if (!evidenceRefs.some((ref) => ref.includes(required))) {
      throw persistenceError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_PERSISTENCE_MISSING_EVIDENCE", `${required} evidence ref is required`);
    }
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 420);
  const inputHash = hashInput({
    persistenceInvocationId,
    principalId: principal.principalId,
    deliveryEnvelopeRecordId: deliveryRecord.recordId,
    deliveryEnvelopeId: deliveryRecord.studentResultDeliveryEnvelope.envelopeId,
    controlledAnswerArtifactId: controlledArtifact.artifactId,
    persistenceRequest,
    policy,
  });
  return { persistenceInvocationId, principal, deliveryRecord, controlledArtifact, persistenceRequest, policy, evidenceRefs, idempotencyKey, inputHash };
}

function assertPersistencePrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  requireConst(principal.subjectType, "SERVICE", "input.principal.subjectType");
  requireConst(principal.role, "SERVICE", "input.principal.role");
  requireConst(principal.entryPoint, "STUDENT_ARCHIVE_PERSISTENCE_RUNTIME", "input.principal.entryPoint");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 24, 3, 80);
  for (const scope of ["TEACHING_READ", "STUDENT_ARCHIVE_WRITE", "STUDENT_APP_DELIVERY"]) requireArrayIncludes(scopes, scope, "input.principal.scopes");
  return {
    principalId: requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128),
    subjectType: "SERVICE",
    role: "SERVICE",
    entryPoint: "STUDENT_ARCHIVE_PERSISTENCE_RUNTIME",
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 160),
    scopes,
  };
}

function assertDeliveryEnvelopeReport(report) {
  rejectLeakedFields(report, "input.studentResultDeliveryEnvelopeReport");
  assertPlainObject(report, "input.studentResultDeliveryEnvelopeReport");
  requireConst(report.readiness, "READY", "input.studentResultDeliveryEnvelopeReport.readiness");
  if (report.workloadType === resultArchiveDeliveryWorkloadType) return assertResultArchiveDeliveryEnvelopeReport(report);
  if (report.workloadType === questionBankFeedbackDeliveryWorkloadType) return assertQuestionBankFeedbackDeliveryEnvelopeReport(report);
  requireConst(report.workloadType, deliveryWorkloadType, "input.studentResultDeliveryEnvelopeReport.workloadType"); requireConst(report.runtime?.runtimeId, deliveryRuntimeId, "input.studentResultDeliveryEnvelopeReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, deliveryPort, "input.studentResultDeliveryEnvelopeReport.runtime.commandPort");
  requireConst(report.runtime?.status, deliveryStatus, "input.studentResultDeliveryEnvelopeReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.studentResultDeliveryEnvelopeReport.runtimeSlo.totalErrors");
  const invariants = assertPlainObject(report.safetyInvariants, "input.studentResultDeliveryEnvelopeReport.safetyInvariants");
  for (const field of ["studentVisibilityReviewRequired", "controlledAnswerArtifactRequired", "guidanceHashMatchRequired", "studentDeliveryEnvelopeAllowed", "studentVisibleEnvelopeAllowed", "safeGuidanceOnlyRequired", "studentVisiblePublished", "studentDeliveryEnvelopeCreated"]) {
    requireConst(invariants[field], true, `input.studentResultDeliveryEnvelopeReport.safetyInvariants.${field}`);
  }
  for (const field of ["durableStudentArchivePersistenceStarted", "mainDatabaseWriteStarted", "studentArchiveWriteStarted", "resultRefDisclosed", "answerKeyDisclosed", "rawModelOutputDisclosed", "promptDisclosed", "contentRefDisclosed", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "retrievalAllowed", "localToolMutationAllowed", "swarmAllowed"]) {
    requireConst(invariants[field], false, `input.studentResultDeliveryEnvelopeReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertResultArchiveDeliveryEnvelopeReport(report) {
  requireConst(report.runtime?.runtimeId, resultArchiveDeliveryRuntimeId, "input.studentResultDeliveryEnvelopeReport.runtime.runtimeId");
  requireConst(report.runtime?.sharedRuntimeId, deliveryRuntimeId, "input.studentResultDeliveryEnvelopeReport.runtime.sharedRuntimeId");
  requireConst(report.runtime?.commandPort, deliveryPort, "input.studentResultDeliveryEnvelopeReport.runtime.commandPort");
  requireConst(report.runtime?.status, resultArchiveDeliveryStatus, "input.studentResultDeliveryEnvelopeReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.studentResultDeliveryEnvelopeReport.runtimeSlo.totalErrors");
  const invariants = assertPlainObject(report.safetyInvariants, "input.studentResultDeliveryEnvelopeReport.safetyInvariants");
  for (const field of ["source0341ResultArchiveStudentVisibilityReviewRequired", "source0338ResultArchiveControlledAnswerArtifactRequired", "guidanceHashMatchRequired", "studentDeliveryEnvelopeCreated", "studentVisibleEnvelopeAllowed"]) requireConst(invariants[field], true, `input.studentResultDeliveryEnvelopeReport.safetyInvariants.${field}`);
  requireConst(invariants.learningActionSourceRequired, resultArchiveSource, "input.studentResultDeliveryEnvelopeReport.safetyInvariants.learningActionSourceRequired");
  requireConst(invariants.resultArchiveStatusRequired, resultArchiveReadyStatus, "input.studentResultDeliveryEnvelopeReport.safetyInvariants.resultArchiveStatusRequired");
  for (const field of ["durableStudentArchivePersistenceStarted", "mainDatabaseWriteStarted", "studentArchiveWriteStarted", "resultRefDisclosed", "answerKeyDisclosed", "rawModelOutputDisclosed", "promptDisclosed", "contentRefDisclosed", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "retrievalAllowed", "localToolMutationAllowed", "swarmAllowed"]) requireConst(invariants[field], false, `input.studentResultDeliveryEnvelopeReport.safetyInvariants.${field}`);
  return report;
}

function assertQuestionBankFeedbackDeliveryEnvelopeReport(report) {
  requireConst(report.runtime?.runtimeId, questionBankFeedbackDeliveryRuntimeId, "input.studentResultDeliveryEnvelopeReport.runtime.runtimeId");
  requireConst(report.runtime?.sharedRuntimeId, deliveryRuntimeId, "input.studentResultDeliveryEnvelopeReport.runtime.sharedRuntimeId");
  requireConst(report.runtime?.commandPort, deliveryPort, "input.studentResultDeliveryEnvelopeReport.runtime.commandPort");
  requireConst(report.runtime?.status, questionBankFeedbackDeliveryStatus, "input.studentResultDeliveryEnvelopeReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.studentResultDeliveryEnvelopeReport.runtimeSlo.totalErrors");
  const invariants = assertPlainObject(report.safetyInvariants, "input.studentResultDeliveryEnvelopeReport.safetyInvariants");
  for (const field of ["source0375QuestionBankFeedbackStudentVisibilityReviewRequired", "source0372QuestionBankFeedbackControlledAnswerArtifactRequired", "guidanceHashMatchRequired", "studentDeliveryEnvelopeCreated", "studentVisibleEnvelopeAllowed"]) requireConst(invariants[field], true, `input.studentResultDeliveryEnvelopeReport.safetyInvariants.${field}`);
  requireConst(invariants.learningActionSourceRequired, questionBankFeedbackSource, "input.studentResultDeliveryEnvelopeReport.safetyInvariants.learningActionSourceRequired");
  requireConst(invariants.feedbackStatusRequired, questionBankFeedbackReadyStatus, "input.studentResultDeliveryEnvelopeReport.safetyInvariants.feedbackStatusRequired");
  for (const field of ["durableStudentArchivePersistenceStarted", "mainDatabaseWriteStarted", "studentArchiveWriteStarted", "resultRefDisclosed", "feedbackIdsDisclosed", "answerKeyDisclosed", "rawModelOutputDisclosed", "promptDisclosed", "contentRefDisclosed", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "retrievalAllowed", "localToolMutationAllowed", "swarmAllowed"]) requireConst(invariants[field], false, `input.studentResultDeliveryEnvelopeReport.safetyInvariants.${field}`);
  return report;
}

function assertDeliveryEnvelopeRecord(report) {
  const isResultArchive = report.workloadType === resultArchiveDeliveryWorkloadType;
  const isQuestionBankFeedback = report.workloadType === questionBankFeedbackDeliveryWorkloadType;
  const result = (isResultArchive
    ? report.runtimeProbes?.studentAppAiTutorResultArchiveStudentDeliveryEnvelope
    : isQuestionBankFeedback
      ? report.runtimeProbes?.studentAppAiTutorQuestionBankFeedbackStudentDeliveryEnvelope
      : report.runtimeProbes?.studentAppAiTutorResultStudentDeliveryEnvelope)?.result;
  rejectLeakedFields(result, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result");
  assertPlainObject(result, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result");
  requireConst(result.runtimeId, deliveryRuntimeId, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.runtimeId");
  requireConst(result.commandPort, deliveryPort, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.commandPort");
  requireConst(result.status, deliveryStatus, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.status");
  requireConst(result.boundary?.studentDeliveryEnvelopeCreated, true, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.boundary.studentDeliveryEnvelopeCreated");
  requireConst(result.boundary?.studentVisiblePublished, true, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.boundary.studentVisiblePublished");
  requireConst(result.boundary?.studentOwnScopeEnforced, true, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.boundary.studentOwnScopeEnforced");
  requireConst(result.boundary?.futureArchivePersistenceRequiresSeparateRuntime, true, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.boundary.futureArchivePersistenceRequiresSeparateRuntime");
  for (const field of ["durableStudentArchivePersistenceStarted", "mainDatabaseWriteStarted", "studentArchiveWriteStarted", "resultRefDisclosed", "answerKeyDisclosed", "promptDisclosed", "rawModelOutputDisclosed", "contentRefDisclosed", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "retrievalAllowed", "localToolMutationAllowed", "swarmAllowed"]) {
    requireConst(result.boundary?.[field], false, `input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.boundary.${field}`);
  }
  const envelope = assertStudentResultDeliveryEnvelope(result.studentResultDeliveryEnvelope);
  const sourceArtifact = assertPlainObject(result.sourceControlledAnswerArtifact, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.sourceControlledAnswerArtifact");
  requireConst(sourceArtifact.artifactId, envelope.artifactId, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.sourceControlledAnswerArtifact.artifactId");
  requireConst(sourceArtifact.guidanceSectionsHash, envelope.guidanceSectionsHash, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.sourceControlledAnswerArtifact.guidanceSectionsHash");
  if (isResultArchive) {
    requireConst(result.sourceStudentVisibilityReview?.learningActionSource, resultArchiveSource, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.sourceStudentVisibilityReview.learningActionSource");
    requireConst(result.sourceStudentVisibilityReview?.resultArchiveStatus, resultArchiveReadyStatus, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.sourceStudentVisibilityReview.resultArchiveStatus");
    requireConst(sourceArtifact.learningActionSource, resultArchiveSource, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.sourceControlledAnswerArtifact.learningActionSource");
    requireConst(sourceArtifact.resultArchiveStatus, resultArchiveReadyStatus, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.sourceControlledAnswerArtifact.resultArchiveStatus");
  }
  if (isQuestionBankFeedback) {
    requireConst(result.sourceStudentVisibilityReview?.learningActionSource, questionBankFeedbackSource, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.sourceStudentVisibilityReview.learningActionSource");
    requireConst(result.sourceStudentVisibilityReview?.feedbackStatus, questionBankFeedbackReadyStatus, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.sourceStudentVisibilityReview.feedbackStatus");
    requireConst(sourceArtifact.learningActionSource, questionBankFeedbackSource, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.sourceControlledAnswerArtifact.learningActionSource");
    requireConst(sourceArtifact.feedbackStatus, questionBankFeedbackReadyStatus, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.sourceControlledAnswerArtifact.feedbackStatus");
  }
  return {
    recordId: requireBoundedString(result.recordId, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.recordId", 1, 260),
    deliveryInvocationId: requireToken(result.deliveryInvocationId, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.deliveryInvocationId", "ai_tutor_result_student_delivery_"),
    sourceStudentVisibilityReview: assertPlainObject(result.sourceStudentVisibilityReview, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.sourceStudentVisibilityReview"),
    sourceControlledAnswerArtifact: {
      artifactId: sourceArtifact.artifactId,
      summary: requireSafeText(sourceArtifact.summary, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.sourceControlledAnswerArtifact.summary", 3, 500),
      safetyLabels: uniqueStringArray(sourceArtifact.safetyLabels, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.sourceControlledAnswerArtifact.safetyLabels", 1, 8, 3, 80),
      guidanceSectionsHash: sourceArtifact.guidanceSectionsHash,
      guidanceSectionCount: requireIntegerBetween(sourceArtifact.guidanceSectionCount, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.sourceControlledAnswerArtifact.guidanceSectionCount", 1, 5),
      learningActionSource: sourceArtifact.learningActionSource,
      resultArchiveStatus: sourceArtifact.resultArchiveStatus,
      feedbackStatus: sourceArtifact.feedbackStatus,
    },
    studentResultDeliveryEnvelope: envelope,
    learningActionSource: result.sourceStudentVisibilityReview?.learningActionSource,
    resultArchiveStatus: result.sourceStudentVisibilityReview?.resultArchiveStatus,
    feedbackStatus: result.sourceStudentVisibilityReview?.feedbackStatus,
    evidenceRefs: uniqueStringArray(result.evidenceRefs, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.evidenceRefs", 1, 24, 8, 360),
  };
}

function assertStudentResultDeliveryEnvelope(envelope) {
  rejectLeakedFields(envelope, "input.studentResultDeliveryEnvelopeReport.studentResultDeliveryEnvelope");
  assertPlainObject(envelope, "input.studentResultDeliveryEnvelopeReport.studentResultDeliveryEnvelope");
  requireConst(envelope.visibilityState, "STUDENT_VISIBLE_AI_TUTOR_RESULT_DELIVERY_ENVELOPE_NOT_ARCHIVED", "input.studentResultDeliveryEnvelopeReport.studentResultDeliveryEnvelope.visibilityState");
  requireConst(envelope.deliveryState, "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED", "input.studentResultDeliveryEnvelopeReport.studentResultDeliveryEnvelope.deliveryState");
  requireConst(envelope.studentVisiblePublished, true, "input.studentResultDeliveryEnvelopeReport.studentResultDeliveryEnvelope.studentVisiblePublished");
  requireConst(envelope.durableStudentArchivePersistenceStarted, false, "input.studentResultDeliveryEnvelopeReport.studentResultDeliveryEnvelope.durableStudentArchivePersistenceStarted");
  requireConst(envelope.mainDatabaseWriteStarted, false, "input.studentResultDeliveryEnvelopeReport.studentResultDeliveryEnvelope.mainDatabaseWriteStarted");
  requireConst(envelope.studentArchiveWriteStarted, false, "input.studentResultDeliveryEnvelopeReport.studentResultDeliveryEnvelope.studentArchiveWriteStarted");
  requireConst(envelope.resultRefDisclosed, false, "input.studentResultDeliveryEnvelopeReport.studentResultDeliveryEnvelope.resultRefDisclosed");
  return {
    envelopeId: requireToken(envelope.envelopeId, "input.studentResultDeliveryEnvelopeReport.studentResultDeliveryEnvelope.envelopeId", "ai_tutor_result_delivery_env_"),
    studentVisibilityReviewRecordId: requireBoundedString(envelope.studentVisibilityReviewRecordId, "input.studentResultDeliveryEnvelopeReport.studentResultDeliveryEnvelope.studentVisibilityReviewRecordId", 1, 260),
    studentVisibilityReviewId: requireToken(envelope.studentVisibilityReviewId, "input.studentResultDeliveryEnvelopeReport.studentResultDeliveryEnvelope.studentVisibilityReviewId", "ai_tutor_result_visibility_review_"),
    artifactId: requireToken(envelope.artifactId, "input.studentResultDeliveryEnvelopeReport.studentResultDeliveryEnvelope.artifactId", "ai_tutor_answer_artifact_"),
    requestId: requireToken(envelope.requestId, "input.studentResultDeliveryEnvelopeReport.studentResultDeliveryEnvelope.requestId", "tutor_req_"),
    archiveItemId: requireToken(envelope.archiveItemId, "input.studentResultDeliveryEnvelopeReport.studentResultDeliveryEnvelope.archiveItemId", "tarch_"),
    guidanceSectionsHash: requireHex(envelope.guidanceSectionsHash, "input.studentResultDeliveryEnvelopeReport.studentResultDeliveryEnvelope.guidanceSectionsHash"),
    visibilityState: "STUDENT_VISIBLE_AI_TUTOR_RESULT_DELIVERY_ENVELOPE_NOT_ARCHIVED",
    deliveryState: "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED",
    scopeRef: requireStudentScopeRef(envelope.scopeRef, "input.studentResultDeliveryEnvelopeReport.studentResultDeliveryEnvelope.scopeRef"),
    studentVisiblePublished: true,
  };
}

function assertControlledAnswerArtifactReport(report) {
  rejectLeakedFields(report, "input.controlledAnswerArtifactReport");
  assertPlainObject(report, "input.controlledAnswerArtifactReport");
  requireConst(report.readiness, "READY", "input.controlledAnswerArtifactReport.readiness");
  if (report.workloadType === resultArchiveControlledArtifactWorkloadType) return assertResultArchiveControlledAnswerArtifactReport(report);
  if (report.workloadType === questionBankFeedbackControlledArtifactWorkloadType) return assertQuestionBankFeedbackControlledAnswerArtifactReport(report);
  requireConst(report.workloadType, "STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT", "input.controlledAnswerArtifactReport.workloadType");
  requireConst(report.runtime?.runtimeId, controlledArtifactRuntimeId, "input.controlledAnswerArtifactReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, controlledArtifactPort, "input.controlledAnswerArtifactReport.runtime.commandPort");
  requireConst(report.runtime?.status, "STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RECORDED", "input.controlledAnswerArtifactReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.controlledAnswerArtifactReport.runtimeSlo.totalErrors");
  return report;
}

function assertResultArchiveControlledAnswerArtifactReport(report) {
  requireConst(report.runtime?.runtimeId, resultArchiveControlledArtifactRuntimeId, "input.controlledAnswerArtifactReport.runtime.runtimeId");
  requireConst(report.runtime?.sharedRuntimeId, controlledArtifactRuntimeId, "input.controlledAnswerArtifactReport.runtime.sharedRuntimeId");
  requireConst(report.runtime?.commandPort, controlledArtifactPort, "input.controlledAnswerArtifactReport.runtime.commandPort");
  requireConst(report.runtime?.status, resultArchiveControlledArtifactStatus, "input.controlledAnswerArtifactReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.controlledAnswerArtifactReport.runtimeSlo.totalErrors");
  const invariants = assertPlainObject(report.safetyInvariants, "input.controlledAnswerArtifactReport.safetyInvariants");
  requireConst(invariants.learningActionSourceRequired, resultArchiveSource, "input.controlledAnswerArtifactReport.safetyInvariants.learningActionSourceRequired");
  for (const field of ["internalServiceOnly", "controlledAnswerArtifactRecorded", "humanReviewRequiredBeforeResult", "rawModelOutputExcluded", "promptExcluded", "answerKeyExcluded"]) requireConst(invariants[field], true, `input.controlledAnswerArtifactReport.safetyInvariants.${field}`);
  for (const field of ["tutoringResultRecorded", "resultPersistenceAllowed", "studentVisiblePublished", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "externalToolUseAllowed", "retrievalAllowed", "swarmAllowed"]) requireConst(invariants[field], false, `input.controlledAnswerArtifactReport.safetyInvariants.${field}`);
  return report;
}

function assertQuestionBankFeedbackControlledAnswerArtifactReport(report) {
  requireConst(report.runtime?.runtimeId, questionBankFeedbackControlledArtifactRuntimeId, "input.controlledAnswerArtifactReport.runtime.runtimeId");
  requireConst(report.runtime?.sharedRuntimeId, controlledArtifactRuntimeId, "input.controlledAnswerArtifactReport.runtime.sharedRuntimeId");
  requireConst(report.runtime?.commandPort, controlledArtifactPort, "input.controlledAnswerArtifactReport.runtime.commandPort");
  requireConst(report.runtime?.status, questionBankFeedbackControlledArtifactStatus, "input.controlledAnswerArtifactReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.controlledAnswerArtifactReport.runtimeSlo.totalErrors");
  const invariants = assertPlainObject(report.safetyInvariants, "input.controlledAnswerArtifactReport.safetyInvariants");
  requireConst(invariants.learningActionSourceRequired, questionBankFeedbackSource, "input.controlledAnswerArtifactReport.safetyInvariants.learningActionSourceRequired");
  for (const field of ["source0371QuestionBankFeedbackModelPrecheckRequired", "internalServiceOnly", "controlledAnswerArtifactRecorded", "humanReviewRequiredBeforeResult", "rawModelOutputExcluded", "promptExcluded", "answerKeyExcluded"]) requireConst(invariants[field], true, `input.controlledAnswerArtifactReport.safetyInvariants.${field}`);
  for (const field of ["tutoringResultRecorded", "resultPersistenceAllowed", "studentVisiblePublished", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "externalToolUseAllowed", "retrievalAllowed", "swarmAllowed"]) requireConst(invariants[field], false, `input.controlledAnswerArtifactReport.safetyInvariants.${field}`);
  return report;
}

function assertControlledAnswerArtifact(report, deliveryRecord) {
  const isResultArchive = report.workloadType === resultArchiveControlledArtifactWorkloadType;
  const isQuestionBankFeedback = report.workloadType === questionBankFeedbackControlledArtifactWorkloadType;
  const result = (isResultArchive
    ? report.runtimeProbes?.studentAppAiTutorResultArchiveControlledAnswerArtifact
    : isQuestionBankFeedback
      ? report.runtimeProbes?.studentAppAiTutorQuestionBankFeedbackControlledAnswerArtifact
      : report.runtimeProbes?.studentAppAiTutorControlledAnswerArtifact)?.result;
  assertPlainObject(result, "input.controlledAnswerArtifactReport.runtimeProbes.result");
  requireConst(result.runtimeId, controlledArtifactRuntimeId, "input.controlledAnswerArtifactReport.runtimeProbes.result.runtimeId");
  requireConst(result.requestId, deliveryRecord.studentResultDeliveryEnvelope.requestId, "input.controlledAnswerArtifactReport.runtimeProbes.result.requestId");
  requireConst(result.archiveItemId, deliveryRecord.studentResultDeliveryEnvelope.archiveItemId, "input.controlledAnswerArtifactReport.runtimeProbes.result.archiveItemId");
  if (isResultArchive) {
    requireConst(result.learningActionSource, resultArchiveSource, "input.controlledAnswerArtifactReport.runtimeProbes.result.learningActionSource");
    requireConst(result.resultArchiveStatus, resultArchiveReadyStatus, "input.controlledAnswerArtifactReport.runtimeProbes.result.resultArchiveStatus");
    requireConst(deliveryRecord.learningActionSource, resultArchiveSource, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.learningActionSource");
    requireConst(deliveryRecord.resultArchiveStatus, resultArchiveReadyStatus, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.resultArchiveStatus");
  }
  if (isQuestionBankFeedback) {
    requireConst(result.learningActionSource, questionBankFeedbackSource, "input.controlledAnswerArtifactReport.runtimeProbes.result.learningActionSource");
    requireConst(result.feedbackStatus, questionBankFeedbackReadyStatus, "input.controlledAnswerArtifactReport.runtimeProbes.result.feedbackStatus");
    requireConst(deliveryRecord.learningActionSource, questionBankFeedbackSource, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.learningActionSource");
    requireConst(deliveryRecord.feedbackStatus, questionBankFeedbackReadyStatus, "input.studentResultDeliveryEnvelopeReport.runtimeProbes.result.feedbackStatus");
  }
  const artifact = assertPlainObject(result.controlledAnswerArtifact, "input.controlledAnswerArtifactReport.runtimeProbes.result.controlledAnswerArtifact");
  requireConst(artifact.artifactId, deliveryRecord.studentResultDeliveryEnvelope.artifactId, "input.controlledAnswerArtifactReport.controlledAnswerArtifact.artifactId");
  const guidanceSections = assertGuidanceSections(artifact.guidanceSections);
  const guidanceSectionsHash = hashGuidanceSections(guidanceSections);
  requireConst(guidanceSectionsHash, deliveryRecord.studentResultDeliveryEnvelope.guidanceSectionsHash, "input.controlledAnswerArtifactReport.controlledAnswerArtifact.guidanceSectionsHash");
  return {
    artifactId: artifact.artifactId,
    summary: requireSafeText(artifact.summary, "input.controlledAnswerArtifactReport.controlledAnswerArtifact.summary", 3, 500),
    guidanceSections,
    guidanceSectionsHash,
    safetyLabels: uniqueStringArray(artifact.safetyLabels, "input.controlledAnswerArtifactReport.controlledAnswerArtifact.safetyLabels", 1, 8, 3, 80),
    learningActionSource: result.learningActionSource,
    resultArchiveStatus: result.resultArchiveStatus,
    feedbackStatus: result.feedbackStatus,
  };
}

function assertGuidanceSections(sections) {
  if (!Array.isArray(sections) || sections.length < 1 || sections.length > 5) {
    throw persistenceError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_PERSISTENCE_INVALID_SECTIONS", "safe guidance sections are out of bounds");
  }
  const seen = new Set();
  return sections.map((section, index) => {
    assertPlainObject(section, `input.controlledAnswerArtifactReport.guidanceSections[${index}]`);
    const sectionId = requireToken(section.sectionId, `input.controlledAnswerArtifactReport.guidanceSections[${index}].sectionId`, "ai_tutor_answer_section_");
    if (seen.has(sectionId)) throw persistenceError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_PERSISTENCE_DUPLICATE_SECTION", `${sectionId} is duplicated`);
    seen.add(sectionId);
    return {
      sectionId,
      title: requireSafeText(section.title, `input.controlledAnswerArtifactReport.guidanceSections[${index}].title`, 1, 120),
      text: requireSafeText(section.text, `input.controlledAnswerArtifactReport.guidanceSections[${index}].text`, 3, 1200),
      sourceBlockRefs: uniqueStringArray(section.sourceBlockRefs, `input.controlledAnswerArtifactReport.guidanceSections[${index}].sourceBlockRefs`, 1, 6, 6, 160),
    };
  });
}

function assertPersistenceRequest(request, deliveryRecord) {
  assertPlainObject(request, "input.studentArchivePersistenceRequest");
  const envelope = deliveryRecord.studentResultDeliveryEnvelope;
  requireConst(request.persistenceMode, "APPEND_ONLY_STUDENT_ARCHIVE_COMMAND", "input.studentArchivePersistenceRequest.persistenceMode");
  requireConst(request.targetArchiveKind, "STUDENT_AI_TUTOR_RESULT_ARCHIVE", "input.studentArchivePersistenceRequest.targetArchiveKind");
  requireConst(request.desiredArchiveState, "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED", "input.studentArchivePersistenceRequest.desiredArchiveState");
  requireConst(request.scopeRef, envelope.scopeRef, "input.studentArchivePersistenceRequest.scopeRef");
  requireConst(request.deliveryEnvelopeRecordId, deliveryRecord.recordId, "input.studentArchivePersistenceRequest.deliveryEnvelopeRecordId");
  requireConst(request.deliveryEnvelopeId, envelope.envelopeId, "input.studentArchivePersistenceRequest.deliveryEnvelopeId");
  requireConst(request.studentVisibilityReviewRecordId, envelope.studentVisibilityReviewRecordId, "input.studentArchivePersistenceRequest.studentVisibilityReviewRecordId");
  requireConst(request.studentVisibilityReviewId, envelope.studentVisibilityReviewId, "input.studentArchivePersistenceRequest.studentVisibilityReviewId");
  requireConst(request.artifactId, envelope.artifactId, "input.studentArchivePersistenceRequest.artifactId");
  requireConst(request.requestId, envelope.requestId, "input.studentArchivePersistenceRequest.requestId");
  requireConst(request.archiveItemId, envelope.archiveItemId, "input.studentArchivePersistenceRequest.archiveItemId");
  requireConst(request.guidanceSectionsHash, envelope.guidanceSectionsHash, "input.studentArchivePersistenceRequest.guidanceSectionsHash");
  return {
    commandId: requireToken(request.commandId, "input.studentArchivePersistenceRequest.commandId", "ai_tutor_result_archive_cmd_"),
    persistenceMode: "APPEND_ONLY_STUDENT_ARCHIVE_COMMAND",
    targetArchiveKind: "STUDENT_AI_TUTOR_RESULT_ARCHIVE",
    desiredArchiveState: "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
    scopeRef: envelope.scopeRef,
    deliveryEnvelopeRecordId: deliveryRecord.recordId,
    deliveryEnvelopeId: envelope.envelopeId,
    studentVisibilityReviewRecordId: envelope.studentVisibilityReviewRecordId,
    studentVisibilityReviewId: envelope.studentVisibilityReviewId,
    artifactId: envelope.artifactId,
    requestId: envelope.requestId,
    archiveItemId: envelope.archiveItemId,
    guidanceSectionsHash: envelope.guidanceSectionsHash,
  };
}

function assertPersistencePolicy(policy) {
  assertPlainObject(policy, "input.studentArchivePersistencePolicy");
  for (const field of ["resultStudentDeliveryEnvelopeRequired", "controlledAnswerArtifactRequired", "guidanceHashMatchRequired", "appendOnlyCommandLogRequired", "safeGuidanceOnlyRequired", "studentOwnScopeRequired", "futureDurableArchiveCommitReviewRequired"]) {
    requireConst(policy[field], true, `input.studentArchivePersistencePolicy.${field}`);
  }
  for (const field of ["directDatabaseAccessAllowed", "mainDatabaseWriteAllowed", "studentArchiveWriteAllowed", "durableArchiveCommitAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "retrievalAllowed", "answerKeyDisclosureAllowed", "rawModelOutputDisclosureAllowed", "resultRefDisclosureAllowed", "promptDisclosureAllowed", "contentRefDisclosureAllowed", "remoteDeviceControlAllowed", "localToolMutationAllowed", "swarmAllowed"]) {
    requireConst(policy[field], false, `input.studentArchivePersistencePolicy.${field}`);
  }
  return { ...policy };
}

function buildRecord(normalized, recordedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND",
    runtimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PORT,
    status: commandStatus,
    recordId: `student_app_ai_tutor_result_student_archive_persistence_command_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    persistenceInvocationId: normalized.persistenceInvocationId,
    principal: normalized.principal,
    sourceStudentDeliveryEnvelope: {
      runtimeId: deliveryRuntimeId,
      recordId: normalized.deliveryRecord.recordId,
      deliveryInvocationId: normalized.deliveryRecord.deliveryInvocationId,
      envelopeId: normalized.deliveryRecord.studentResultDeliveryEnvelope.envelopeId,
      requestId: normalized.deliveryRecord.studentResultDeliveryEnvelope.requestId,
      archiveItemId: normalized.deliveryRecord.studentResultDeliveryEnvelope.archiveItemId,
      guidanceSectionsHash: normalized.deliveryRecord.studentResultDeliveryEnvelope.guidanceSectionsHash,
      learningActionSource: normalized.deliveryRecord.learningActionSource,
      resultArchiveStatus: normalized.deliveryRecord.resultArchiveStatus,
      feedbackStatus: normalized.deliveryRecord.feedbackStatus,
    },
    sourceControlledAnswerArtifact: {
      artifactId: normalized.controlledArtifact.artifactId,
      summary: normalized.controlledArtifact.summary,
      safetyLabels: normalized.controlledArtifact.safetyLabels,
      guidanceSectionsHash: normalized.controlledArtifact.guidanceSectionsHash,
      guidanceSectionCount: normalized.controlledArtifact.guidanceSections.length,
      learningActionSource: normalized.controlledArtifact.learningActionSource,
      resultArchiveStatus: normalized.controlledArtifact.resultArchiveStatus,
      feedbackStatus: normalized.controlledArtifact.feedbackStatus,
    },
    studentArchivePersistenceCommand: buildCommand(normalized),
    boundary: {
      resultStudentDeliveryEnvelopeVerified: true,
      controlledAnswerArtifactVerified: true,
      guidanceSectionsHashVerified: true,
      safeGuidanceOnly: true,
      studentOwnScopeEnforced: true,
      studentArchivePersistenceCommandRecorded: true,
      appendOnlyCommandLogRecorded: true,
      durableStudentArchivePersistenceStarted: false,
      durableStudentArchiveCommitStarted: false,
      studentArchivePersisted: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
      resultRefDisclosed: false,
      answerKeyDisclosed: false,
      promptDisclosed: false,
      rawModelOutputDisclosed: false,
      contentRefDisclosed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      modelInferenceStarted: false,
      retrievalStarted: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureDurableArchiveCommitReview: true,
    },
    evidenceRefs: uniq([
      ...normalized.evidenceRefs,
      ...normalized.deliveryRecord.evidenceRefs,
      `evidence:student-app-ai-tutor-result-student-archive-persistence-command-input-hash:${normalized.inputHash}`,
    ]),
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
    runtimeSlo: { targetP99Ms: 50, p99Ms: 5, totalErrors: 0, operations: 1, evidenceClass: "JS_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PROBE" },
  };
}

function buildCommand(normalized) {
  const request = normalized.persistenceRequest;
  return {
    commandId: request.commandId,
    commandKind: "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_PERSISTENCE_COMMAND",
    persistenceMode: request.persistenceMode,
    targetArchiveKind: request.targetArchiveKind,
    desiredArchiveState: request.desiredArchiveState,
    commitState: "NOT_COMMITTED_TO_STUDENT_ARCHIVE",
    scopeRef: request.scopeRef,
    sourceDeliveryEnvelopeRecordId: request.deliveryEnvelopeRecordId,
    sourceDeliveryEnvelopeId: request.deliveryEnvelopeId,
    studentVisibilityReviewRecordId: request.studentVisibilityReviewRecordId,
    studentVisibilityReviewId: request.studentVisibilityReviewId,
    artifactId: request.artifactId,
    requestId: request.requestId,
    archiveItemId: request.archiveItemId,
    guidanceSectionsHash: request.guidanceSectionsHash,
    learningActionSource: normalized.deliveryRecord.learningActionSource,
    resultArchiveStatus: normalized.deliveryRecord.resultArchiveStatus,
    feedbackStatus: normalized.deliveryRecord.feedbackStatus,
    safeGuidance: {
      summary: normalized.controlledArtifact.summary,
      guidanceSections: normalized.controlledArtifact.guidanceSections,
      guidanceSectionsHash: normalized.controlledArtifact.guidanceSectionsHash,
      safetyLabels: normalized.controlledArtifact.safetyLabels,
    },
    evidencePreserved: true,
    studentOwnScopeEnforced: true,
    safeGuidanceOnly: true,
  };
}

function buildResult(record, options) {
  return { ...record, idempotentReplay: options.idempotentReplay };
}

function findExistingRecordByIdempotencyKey(logPath, idempotencyKey) {
  if (!fs.existsSync(logPath)) return null;
  const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const record = JSON.parse(lines[index]);
    if (record.idempotencyKey === idempotencyKey) return record;
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.inputHash !== normalized.inputHash) {
    throw persistenceError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_PERSISTENCE_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different student archive persistence command");
  }
}

function appendRecord(logPath, record) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`);
}

function rejectLeakedFields(value, label) {
  if (!value || typeof value !== "object") return;
  const keys = collectKeys(value);
  for (const field of leakedFieldNames) {
    if (keys.has(field)) {
      throw persistenceError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_PERSISTENCE_LEAKED_FIELD", `${label}.${field} is not allowed`);
    }
  }
}

function collectKeys(value, keys = new Set()) {
  if (!value || typeof value !== "object") return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.add(key.toLowerCase());
    collectKeys(child, keys);
  }
  return keys;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw persistenceError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_PERSISTENCE_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireArrayIncludes(values, expected, label) {
  if (!values.includes(expected)) throw persistenceError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_PERSISTENCE_SCOPE_MISSING", `${label} must include ${expected}`);
}

function requireToken(value, label, prefix) {
  const text = requireBoundedString(value, label, prefix.length + 1, 260);
  if (!text.startsWith(prefix)) throw persistenceError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_PERSISTENCE_TOKEN", `${label} must start with ${prefix}`);
  return text;
}

function requireHex(value, label) {
  const text = requireBoundedString(value, label, 64, 64);
  if (!/^[a-f0-9]{64}$/u.test(text)) throw persistenceError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_PERSISTENCE_HEX", `${label} must be sha256 hex`);
  return text;
}

function requireStudentScopeRef(value, label) {
  const text = requireBoundedString(value, label, 9, 160);
  if (!text.startsWith("student:")) throw persistenceError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_PERSISTENCE_SCOPE", `${label} must be a student scope ref`);
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw persistenceError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_PERSISTENCE_INTEGER", `${label} must be ${min}-${max}`);
  }
  return value;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    throw persistenceError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_PERSISTENCE_REQUIRED", `${label} must be ${min}-${max} chars`);
  }
  return value.trim();
}

function requireSafeText(value, label, min, max) {
  const text = requireBoundedString(value, label, min, max);
  if (/[<>]/u.test(text) || unsafeTextPattern.test(text)) {
    throw persistenceError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_PERSISTENCE_UNSAFE_TEXT", `${label} must be safe student text`);
  }
  return text;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) throw persistenceError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_PERSISTENCE_CONST", `${label} must be ${expected}`);
  return actual;
}

function uniqueStringArray(value, label, min, max, minLength, maxLength) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw persistenceError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_PERSISTENCE_INVALID_ARRAY", `${label} must contain ${min}-${max} items`);
  }
  const normalized = uniq(value.map((item) => requireBoundedString(item, `${label}[]`, minLength, maxLength)));
  if (normalized.length < min) throw persistenceError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_PERSISTENCE_INVALID_ARRAY", `${label} must contain unique items`);
  return normalized;
}

function uniq(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))];
}

function hashGuidanceSections(sections) {
  const metadata = sections.map((section) => ({
    sectionId: section.sectionId,
    title: section.title,
    textHash: hashInput(section.text),
    sourceBlockRefs: section.sourceBlockRefs,
  }));
  return hashInput(metadata);
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeToken(value) {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function persistenceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
