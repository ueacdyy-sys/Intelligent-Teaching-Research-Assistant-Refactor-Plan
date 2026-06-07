import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_storage_commit_controlled_draft_source_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE_PORT =
  "StudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSourcePort.commitTeachingArchiveCreateCommandFromControlledDraftSource";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE_READY =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE_READY";

const inputSchemaVersion =
  "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source.v1";
const outputSchemaVersion =
  "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-committed.v1";
const sourceRuntimeId =
  "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_persistence_command_controlled_draft_source_runtime";
const sourceCommandPort =
  "StudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSourcePort.recordFeedbackArchivePersistenceCommandFromControlledDraftSource";
const sourceReportWorkload =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE_RUNTIME";
const sourceReportStatus = "PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED";
const sourceRecordStatus =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED";
const committedStatus =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED_FROM_CONTROLLED_DRAFT_SOURCE";
const defaultCommitLogPath =
  "reports/student-command-log/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source.jsonl";

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
];
const forbiddenText = /(answer key|correct answer|expected answer|raw model|internal error|resultref|result ref|标准答案|参考答案|正确答案|答案解析)/iu;

export async function commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageControlledDraftSource(input, options = {}) {
  const committedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const commitLogPath = options.commitLogPath ?? defaultCommitLogPath;
  const existing = findExistingRecordByIdempotencyKey(commitLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const port = assertCreateItemPort(options.teachingArchiveCreateItemPort);
  const portResult = await port.createArchiveItem(normalized.teachingArchiveCreateCommand, {
    commitInvocationId: normalized.commitInvocationId,
    idempotencyKey: normalized.idempotencyKey,
    sourcePersistenceCommandRecordId: normalized.persistenceCommandRecord.recordId,
    sourceControlledDraftArtifactId: normalized.persistenceCommandRecord.feedbackArchivePersistenceCommand.sourceControlledDraft.artifactId,
  });
  const committed = assertPortResult(portResult, normalized.teachingArchiveCreateCommand);
  const record = buildCommitRecord(normalized, committed, committedAt);
  appendCommitRecord(commitLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource(result) {
  return [
    `Student App AI Tutor feedback archive storage commit from controlled draft source: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Archive item: ${result.teachingArchiveCommit.archiveItem.id}`,
    `Source controlled draft: ${result.sourceControlledFeedbackDraft.artifactId}`,
    `Main DB committed: ${result.boundary.mainDatabaseWriteCommitted}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const commitInvocationId = requireToken(input.commitInvocationId, "input.commitInvocationId", "feedback_archive_storage_commit_controlled_draft_");
  const persistenceCommandReport = assertPersistenceCommandReport(input.feedbackArchivePersistenceCommandControlledDraftSourceReport);
  const persistenceCommandRecord = assertPersistenceCommandRecord(persistenceCommandReport);
  const commitPolicy = assertCommitPolicy(input.feedbackArchiveStorageCommitControlledDraftSourcePolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 360);
  for (const required of ["feedback-archive-persistence-command-controlled-draft-source", "feedback-archive-storage-commit-controlled-draft-source"]) {
    if (!evidenceRefs.some((ref) => ref.includes(required))) {
      throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_FROM_DRAFT_MISSING_EVIDENCE", `${required} evidence ref is required`);
    }
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 420);
  const teachingArchiveCreateCommand = assertTeachingArchiveCreateCommand(
    buildTeachingArchiveCreateCommand(persistenceCommandRecord),
    persistenceCommandRecord,
  );
  const commitInputHash = hashInput({
    commitInvocationId,
    persistenceCommandRecordId: persistenceCommandRecord.recordId,
    persistenceCommandId: persistenceCommandRecord.feedbackArchivePersistenceCommand.commandId,
    sourceControlledDraftArtifactId: persistenceCommandRecord.feedbackArchivePersistenceCommand.sourceControlledDraft.artifactId,
    requestBody: teachingArchiveCreateCommand.requestBody,
    commitPolicy,
  });
  return { commitInvocationId, persistenceCommandReport, persistenceCommandRecord, commitPolicy, evidenceRefs, idempotencyKey, teachingArchiveCreateCommand, commitInputHash };
}

function assertPersistenceCommandReport(report) {
  rejectLeakedFields(report, "input.feedbackArchivePersistenceCommandControlledDraftSourceReport");
  assertPlainObject(report, "input.feedbackArchivePersistenceCommandControlledDraftSourceReport");
  requireConst(report.readiness, "READY", "input.feedbackArchivePersistenceCommandControlledDraftSourceReport.readiness");
  requireConst(report.workloadType, sourceReportWorkload, "input.feedbackArchivePersistenceCommandControlledDraftSourceReport.workloadType");
  requireConst(report.runtime?.runtimeId, sourceRuntimeId, "input.feedbackArchivePersistenceCommandControlledDraftSourceReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, sourceCommandPort, "input.feedbackArchivePersistenceCommandControlledDraftSourceReport.runtime.commandPort");
  requireConst(report.runtime?.status, sourceReportStatus, "input.feedbackArchivePersistenceCommandControlledDraftSourceReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.feedbackArchivePersistenceCommandControlledDraftSourceReport.runtimeSlo.totalErrors");
  assertPersistenceCommandReportBoundaries(report.safetyInvariants ?? {});
  return report;
}

function assertPersistenceCommandReportBoundaries(boundary) {
  for (const field of [
    "feedbackDeliveryEnvelopeControlledDraftSourceRequired",
    "sourceControlledDraftEvidenceRequired",
    "appendOnlyCommandLogRequired",
    "studentOwnScopeRequired",
    "sourceControlledDraftEvidencePreserved",
    "feedbackArchivePersistenceCommandRecorded",
  ]) {
    requireConst(boundary[field], true, `input.feedbackArchivePersistenceCommandControlledDraftSourceReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "durableStudentArchivePersistenceStarted",
    "durableStudentArchiveCommitStarted",
    "studentArchivePersisted",
    "mainDatabaseWriteStarted",
    "studentArchiveWriteStarted",
    "answerKeyDisclosureAllowed",
    "workerMetadataDisclosureAllowed",
    "rawModelOutputDisclosureAllowed",
    "resultRefDisclosureAllowed",
    "modelInferenceAllowed",
  ]) {
    requireConst(boundary[field], false, `input.feedbackArchivePersistenceCommandControlledDraftSourceReport.safetyInvariants.${field}`);
  }
}

function assertPersistenceCommandRecord(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource?.result;
  rejectLeakedFields(result, "input.feedbackArchivePersistenceCommandControlledDraftSourceReport.runtimeProbes.result");
  assertPlainObject(result, "input.feedbackArchivePersistenceCommandControlledDraftSourceReport.runtimeProbes.result");
  requireConst(result.schemaVersion, "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source-recorded.v1", "source.schemaVersion");
  requireConst(result.recordType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE", "source.recordType");
  requireConst(result.runtimeId, sourceRuntimeId, "source.runtimeId");
  requireConst(result.commandPort, sourceCommandPort, "source.commandPort");
  requireConst(result.status, sourceRecordStatus, "source.status");
  for (const field of [
    "feedbackDeliveryEnvelopeControlledDraftSourceVerified",
    "controlledDraftSourceVerified",
    "sourceControlledDraftEvidencePreserved",
    "feedbackArchivePersistenceCommandRecorded",
    "appendOnlyCommandLogRecorded",
  ]) {
    requireConst(result.boundary?.[field], true, `source.boundary.${field}`);
  }
  for (const field of [
    "durableStudentArchivePersistenceStarted",
    "durableStudentArchiveCommitStarted",
    "studentArchivePersisted",
    "mainDatabaseWriteStarted",
    "studentArchiveWriteStarted",
    "answerKeyDisclosed",
    "workerMetadataDisclosed",
    "rawModelOutputDisclosed",
    "resultRefDisclosed",
    "modelInferenceStarted",
  ]) {
    requireConst(result.boundary?.[field], false, `source.boundary.${field}`);
  }
  const sourceControlledFeedbackDraft = assertSourceControlledDraft(result.sourceControlledFeedbackDraft, "source.sourceControlledFeedbackDraft");
  const sourcePublicationApproval = assertSourcePublicationApproval(result.sourcePublicationApproval, sourceControlledFeedbackDraft);
  const command = assertPersistenceCommand(result.feedbackArchivePersistenceCommand, sourceControlledFeedbackDraft);
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "source.recordId", 1, 420),
    principal: assertPersistencePrincipal(result.principal),
    sourcePublicationApproval,
    sourceControlledFeedbackDraft,
    feedbackArchivePersistenceCommand: command,
    evidenceRefs: uniqueStringArray(result.evidenceRefs, "source.evidenceRefs", 1, 3000),
  };
}

function assertPersistencePrincipal(principal) {
  assertPlainObject(principal, "source.principal");
  const scopes = uniqueStringArray(principal.scopes, "source.principal.scopes", 1, 32);
  for (const scope of ["TEACHING_READ", "STUDENT_ARCHIVE_WRITE", "STUDENT_APP_DELIVERY"]) {
    if (!scopes.includes(scope)) {
      throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_FROM_DRAFT_MISSING_SOURCE_SCOPE", `${scope} source scope is required`);
    }
  }
  return {
    principalId: requireBoundedString(principal.principalId, "source.principal.principalId", 1, 128),
    subjectType: requireConst(principal.subjectType, "SERVICE", "source.principal.subjectType"),
    role: requireConst(principal.role, "SERVICE", "source.principal.role"),
    entryPoint: requireConst(principal.entryPoint, "STUDENT_ARCHIVE_PERSISTENCE_RUNTIME", "source.principal.entryPoint"),
    scopes,
    sessionId: requireBoundedString(principal.sessionId, "source.principal.sessionId", 1, 160),
  };
}

function assertSourcePublicationApproval(approval, sourceControlledFeedbackDraft) {
  assertPlainObject(approval, "source.sourcePublicationApproval");
  requireConst(approval.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_controlled_draft_source_runtime", "source.sourcePublicationApproval.runtimeId");
  requireConst(approval.sourceControlledDraftArtifactId, sourceControlledFeedbackDraft.artifactId, "source.sourcePublicationApproval.sourceControlledDraftArtifactId");
  requireConst(approval.controlledDraftSourceVerified, true, "source.sourcePublicationApproval.controlledDraftSourceVerified");
  return {
    runtimeId: approval.runtimeId,
    recordId: requireBoundedString(approval.recordId, "source.sourcePublicationApproval.recordId", 1, 420),
    approvalInvocationId: requireToken(approval.approvalInvocationId, "source.sourcePublicationApproval.approvalInvocationId", "feedback_publication_approval_controlled_draft_"),
    approvalId: requireToken(approval.approvalId, "source.sourcePublicationApproval.approvalId", "feedback_publication_approval_"),
    approvedFeedbackArtifactId: requireToken(approval.approvedFeedbackArtifactId, "source.sourcePublicationApproval.approvedFeedbackArtifactId", "feedback_artifact_"),
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

function assertPersistenceCommand(command, sourceControlledFeedbackDraft) {
  assertPlainObject(command, "source.feedbackArchivePersistenceCommand");
  requireConst(command.commandKind, "STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE", "source.commandKind");
  requireConst(command.persistenceMode, "APPEND_ONLY_STUDENT_ARCHIVE_COMMAND", "source.persistenceMode");
  requireConst(command.targetArchiveKind, "STUDENT_AI_TUTOR_FEEDBACK_ARCHIVE", "source.targetArchiveKind");
  requireConst(command.desiredArchiveState, "PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED", "source.desiredArchiveState");
  requireConst(command.commitState, "NOT_COMMITTED_TO_STUDENT_ARCHIVE", "source.commitState");
  requireConst(command.evidencePreserved, true, "source.evidencePreserved");
  requireConst(command.approvalEvidencePreserved, true, "source.approvalEvidencePreserved");
  requireConst(command.sourceControlledDraftEvidencePreserved, true, "source.sourceControlledDraftEvidencePreserved");
  requireConst(command.studentOwnScopeEnforced, true, "source.studentOwnScopeEnforced");
  const sourceControlledDraft = assertSourceControlledDraft(command.sourceControlledDraft, "source.feedbackArchivePersistenceCommand.sourceControlledDraft");
  requireConst(sourceControlledDraft.artifactId, sourceControlledFeedbackDraft.artifactId, "source.feedbackArchivePersistenceCommand.sourceControlledDraft.artifactId");
  return {
    commandId: requireToken(command.commandId, "source.commandId", "feedback_archive_cmd_controlled_draft_"),
    commandKind: "STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE",
    scopeRef: requireStudentScopeRef(command.scopeRef, "source.scopeRef"),
    sourceFeedbackDeliveryRecordId: requireBoundedString(command.sourceFeedbackDeliveryRecordId, "source.sourceFeedbackDeliveryRecordId", 1, 420),
    sourceFeedbackDeliveryEnvelopeId: requireToken(command.sourceFeedbackDeliveryEnvelopeId, "source.sourceFeedbackDeliveryEnvelopeId", "feedback_delivery_env_controlled_draft_"),
    approvalRecordId: requireBoundedString(command.approvalRecordId, "source.approvalRecordId", 1, 420),
    approvalId: requireToken(command.approvalId, "source.approvalId", "feedback_publication_approval_"),
    sourceControlledDraftArtifactId: requireConst(command.sourceControlledDraftArtifactId, sourceControlledFeedbackDraft.artifactId, "source.sourceControlledDraftArtifactId"),
    approvedFeedbackArtifactId: requireToken(command.approvedFeedbackArtifactId, "source.approvedFeedbackArtifactId", "feedback_artifact_"),
    submissionId: requireToken(command.submissionId, "source.submissionId", "qbank_ans_sub_"),
    requestId: requireToken(command.requestId, "source.requestId", "grading_req_"),
    questionBankDraftRef: requireQuestionBankDraftRef(command.questionBankDraftRef, "source.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireToken(command.tutoringAnalysisRequestId, "source.tutoringAnalysisRequestId", "tutor_req_"),
    archiveItemId: requireToken(command.archiveItemId, "source.archiveItemId", "tarch_"),
    scoreSummary: requireSafeText(command.scoreSummary, "source.scoreSummary", 1, 2000),
    learnerFeedback: assertLearnerFeedback(command.learnerFeedback),
    sourceControlledDraft,
  };
}

function assertLearnerFeedback(feedback) {
  assertPlainObject(feedback, "source.learnerFeedback");
  return {
    summary: requireSafeText(feedback.summary, "source.learnerFeedback.summary", 1, 1200),
    encouragement: requireSafeText(feedback.encouragement, "source.learnerFeedback.encouragement", 1, 600),
    nextSteps: uniqueSafeTextArray(feedback.nextSteps, "source.learnerFeedback.nextSteps", 1, 8, 1, 500),
    misconceptionTags: uniqueSafeTextArray(feedback.misconceptionTags ?? [], "source.learnerFeedback.misconceptionTags", 0, 12, 1, 80),
    practiceSuggestions: uniqueSafeTextArray(feedback.practiceSuggestions ?? [], "source.learnerFeedback.practiceSuggestions", 0, 8, 1, 300),
  };
}

function assertCommitPolicy(policy) {
  assertPlainObject(policy, "input.feedbackArchiveStorageCommitControlledDraftSourcePolicy");
  for (const field of [
    "archivePersistenceCommandControlledDraftSourceRequired",
    "sourceControlledDraftEvidenceRequired",
    "teachingArchiveUseCaseCommitAllowed",
    "injectedTeachingArchivePortRequired",
    "teachingArchiveDomainValidationRequired",
    "persistedOutcomeRequired",
    "preserveLearnerFeedbackRequired",
    "preserveApprovalEvidenceRequired",
    "preserveControlledDraftSourceEvidenceRequired",
    "idempotentStorageCommitRequired",
    "mainDatabaseWriteAllowed",
  ]) {
    requireConst(policy[field], true, `input.feedbackArchiveStorageCommitControlledDraftSourcePolicy.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "directPublicationAllowed",
    "modelInferenceAllowed",
    "answerKeyDisclosureAllowed",
    "workerMetadataDisclosureAllowed",
    "rawModelOutputDisclosureAllowed",
    "resultRefDisclosureAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.feedbackArchiveStorageCommitControlledDraftSourcePolicy.${field}`);
  }
  return { ...policy };
}

function buildTeachingArchiveCreateCommand(record) {
  const command = record.feedbackArchivePersistenceCommand;
  const studentId = command.scopeRef.slice("student:".length);
  const contentHash = hashInput({
    commandId: command.commandId,
    sourceFeedbackDeliveryEnvelopeId: command.sourceFeedbackDeliveryEnvelopeId,
    sourceControlledDraftArtifactId: command.sourceControlledDraft.artifactId,
    approvedFeedbackArtifactId: command.approvedFeedbackArtifactId,
    scoreSummary: command.scoreSummary,
    learnerFeedback: command.learnerFeedback,
  }).replace("sha256:", "sha256_");
  return {
    commandId: `teaching_archive_create_student_ai_tutor_feedback_controlled_source_${safeToken(command.commandId)}`,
    operationId: "createTeachingArchiveItem",
    targetUseCase: "CreateArchiveItem.ExecuteWithPersistence",
    targetRepository: "ArchiveRepository.Create",
    targetTable: "teaching_archive_items",
    principalContextHeader: {
      principalId: record.principal.principalId,
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      scopes: ["TEACHING_READ", "STUDENT_ARCHIVE_WRITE", "STUDENT_ASSIGNED_READ"],
      studentAccess: { mode: "ASSIGNED", studentIds: [studentId] },
      sessionId: record.principal.sessionId,
    },
    requestBody: {
      ownerType: "STUDENT",
      studentId,
      materialType: "HOMEWORK",
      title: `Student AI Tutor feedback archive controlled source ${command.submissionId}`,
      source: "SYSTEM_IMPORT",
      contentRef: `student-ai-tutor-feedback-archive-controlled-draft-source:${command.commandId}:${contentHash}`,
      tags: ["student_app_ai_tutor", "feedback", "question_bank", "archive_commit", "controlled_draft_source"],
      analysisIntents: ["ARCHIVE_ONLY", "TUTORING"],
      ocrReserved: false,
    },
  };
}

function assertTeachingArchiveCreateCommand(command, record) {
  assertPlainObject(command, "teachingArchiveCreateCommand");
  requireConst(command.operationId, "createTeachingArchiveItem", "teachingArchiveCreateCommand.operationId");
  requireConst(command.targetUseCase, "CreateArchiveItem.ExecuteWithPersistence", "teachingArchiveCreateCommand.targetUseCase");
  requireConst(command.targetRepository, "ArchiveRepository.Create", "teachingArchiveCreateCommand.targetRepository");
  requireConst(command.targetTable, "teaching_archive_items", "teachingArchiveCreateCommand.targetTable");
  const principal = assertPrincipalContext(command.principalContextHeader);
  const body = assertRequestBody(command.requestBody, principal, record);
  return { ...command, commandId: requireBoundedString(command.commandId, "teachingArchiveCreateCommand.commandId", 1, 420), principalContextHeader: principal, requestBody: body };
}

function assertPrincipalContext(principal) {
  assertPlainObject(principal, "teachingArchiveCreateCommand.principalContextHeader");
  const scopes = uniqueStringArray(principal.scopes, "principalContextHeader.scopes", 1, 32);
  for (const scope of ["TEACHING_READ", "STUDENT_ARCHIVE_WRITE", "STUDENT_ASSIGNED_READ"]) {
    if (!scopes.includes(scope)) {
      throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_FROM_DRAFT_MISSING_COMMIT_SCOPE", `${scope} commit scope is required`);
    }
  }
  const studentAccess = assertStudentAccess(principal.studentAccess);
  return {
    principalId: requireBoundedString(principal.principalId, "principalContextHeader.principalId", 1, 128),
    subjectType: requireConst(principal.subjectType, "SERVICE", "principalContextHeader.subjectType"),
    role: requireConst(principal.role, "SERVICE", "principalContextHeader.role"),
    entryPoint: requireConst(principal.entryPoint, "AGENT_INTERNAL", "principalContextHeader.entryPoint"),
    scopes,
    studentAccess,
    sessionId: requireBoundedString(principal.sessionId, "principalContextHeader.sessionId", 1, 160),
  };
}

function assertStudentAccess(access) {
  assertPlainObject(access, "principalContextHeader.studentAccess");
  return {
    mode: requireEnum(access.mode, "principalContextHeader.studentAccess.mode", ["ASSIGNED", "ALL"]),
    studentIds: Array.isArray(access.studentIds) ? uniqueBoundedStringArray(access.studentIds, "principalContextHeader.studentAccess.studentIds", 0, 200, 1, 128) : [],
  };
}

function assertRequestBody(body, principal, record) {
  assertPlainObject(body, "teachingArchiveCreateCommand.requestBody");
  const studentId = requireBoundedString(body.studentId, "requestBody.studentId", 1, 128);
  if (record.feedbackArchivePersistenceCommand.scopeRef !== `student:${studentId}`) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_FROM_DRAFT_STUDENT_SCOPE_MISMATCH", "requestBody.studentId must match source scopeRef");
  }
  if (principal.studentAccess.mode === "ASSIGNED" && !principal.studentAccess.studentIds.includes(studentId)) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_FROM_DRAFT_STUDENT_ACCESS_MISMATCH", "principal studentAccess must include requestBody.studentId");
  }
  return {
    ownerType: requireConst(body.ownerType, "STUDENT", "requestBody.ownerType"),
    studentId,
    materialType: requireEnum(body.materialType, "requestBody.materialType", ["QUIZ", "PAPER", "HANDOUT", "HOMEWORK"]),
    title: requireSafeText(body.title, "requestBody.title", 1, 220),
    source: requireConst(body.source, "SYSTEM_IMPORT", "requestBody.source"),
    contentRef: requireBoundedString(body.contentRef, "requestBody.contentRef", 1, 1200),
    tags: uniqueBoundedStringArray(body.tags ?? [], "requestBody.tags", 0, 32, 1, 64),
    analysisIntents: uniqueStringArray(body.analysisIntents, "requestBody.analysisIntents", 1, 2)
      .map((intent) => requireEnum(intent, "requestBody.analysisIntents[]", ["ARCHIVE_ONLY", "TUTORING"])),
    ocrReserved: requireBoolean(body.ocrReserved, "requestBody.ocrReserved"),
  };
}

function assertCreateItemPort(port) {
  if (!port || typeof port.createArchiveItem !== "function") {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_FROM_DRAFT_MISSING_PORT", "TeachingArchiveCreateItemPort.createArchiveItem is required");
  }
  return port;
}

function assertPortResult(result, command) {
  assertPlainObject(result, "TeachingArchiveCreateItemPort result");
  return { archiveItem: assertArchiveItem(result.archiveItem, command.requestBody), persistence: assertPersistence(result.persistence) };
}

function assertArchiveItem(item, requestBody) {
  assertPlainObject(item, "TeachingArchiveCreateItemPort result.archiveItem");
  const id = requireBoundedString(item.id, "result.archiveItem.id", 1, 128);
  if (!id.startsWith("tarch_")) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_FROM_DRAFT_INVALID_ARCHIVE_ID", "archive item id must use tarch_ prefix");
  }
  requireConst(item.ownerType, requestBody.ownerType, "result.archiveItem.ownerType");
  requireConst(item.studentId, requestBody.studentId, "result.archiveItem.studentId");
  requireConst(item.materialType, requestBody.materialType, "result.archiveItem.materialType");
  requireConst(item.title, requestBody.title, "result.archiveItem.title");
  requireConst(item.source, requestBody.source, "result.archiveItem.source");
  requireConst(item.contentRef, requestBody.contentRef, "result.archiveItem.contentRef");
  return {
    id,
    ownerType: item.ownerType,
    studentId: item.studentId,
    materialType: item.materialType,
    title: item.title,
    source: item.source,
    contentRef: item.contentRef,
    tags: uniqueBoundedStringArray(item.tags ?? [], "result.archiveItem.tags", 0, 32, 1, 64),
    analysisIntents: uniqueStringArray(item.analysisIntents ?? [], "result.archiveItem.analysisIntents", 1, 8),
    ocrStatus: requireEnum(item.ocrStatus, "result.archiveItem.ocrStatus", ["RESERVED", "NOT_REQUIRED"]),
    createdAt: requireDateTime(item.createdAt, "result.archiveItem.createdAt"),
  };
}

function assertPersistence(persistence) {
  assertPlainObject(persistence, "TeachingArchiveCreateItemPort result.persistence");
  return { status: requireConst(persistence.status, "persisted", "result.persistence.status"), commandId: typeof persistence.commandId === "string" ? persistence.commandId : "" };
}

function buildCommitRecord(normalized, committed, committedAt) {
  const sourceCommand = normalized.persistenceCommandRecord.feedbackArchivePersistenceCommand;
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE",
    recordId: `student_app_ai_tutor_question_bank_draft_answer_feedback_archive_storage_commit_controlled_draft_source_${safeToken(normalized.idempotencyKey)}`,
    recordedAt: committedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE_PORT,
    status: committedStatus,
    commitInvocationId: normalized.commitInvocationId,
    sourcePersistenceCommand: {
      runtimeId: sourceRuntimeId,
      recordId: normalized.persistenceCommandRecord.recordId,
      commandId: sourceCommand.commandId,
      sourceFeedbackDeliveryEnvelopeId: sourceCommand.sourceFeedbackDeliveryEnvelopeId,
      sourceControlledDraftArtifactId: sourceCommand.sourceControlledDraft.artifactId,
      approvedFeedbackArtifactId: sourceCommand.approvedFeedbackArtifactId,
      submissionId: sourceCommand.submissionId,
      requestId: sourceCommand.requestId,
      questionBankDraftRef: sourceCommand.questionBankDraftRef,
      tutoringAnalysisRequestId: sourceCommand.tutoringAnalysisRequestId,
      sourceArchiveItemId: sourceCommand.archiveItemId,
      scopeRef: sourceCommand.scopeRef,
      commitState: "COMMITTED_TO_STUDENT_ARCHIVE",
    },
    sourcePublicationApproval: normalized.persistenceCommandRecord.sourcePublicationApproval,
    sourceControlledFeedbackDraft: normalized.persistenceCommandRecord.sourceControlledFeedbackDraft,
    teachingArchiveCommit: {
      operationId: "createTeachingArchiveItem",
      targetUseCase: "CreateArchiveItem.ExecuteWithPersistence",
      targetRepository: "ArchiveRepository.Create",
      targetTable: "teaching_archive_items",
      archiveItem: committed.archiveItem,
      persistence: committed.persistence,
    },
    learnerFeedbackSnapshot: {
      scoreSummary: sourceCommand.scoreSummary,
      learnerFeedback: sourceCommand.learnerFeedback,
      sourceControlledDraft: sourceCommand.sourceControlledDraft,
      safeLearnerFeedbackOnly: true,
      approvalEvidencePreserved: true,
      sourceControlledDraftEvidencePreserved: true,
    },
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.persistenceCommandRecord.evidenceRefs,
        `evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-input-hash:${normalized.commitInputHash}`,
        `evidence:runtime:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID}`,
        `evidence:command-port:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE_PORT}`,
        `evidence:archive-persistence-command-controlled-draft-source-record:${normalized.persistenceCommandRecord.recordId}`,
        `evidence:source-controlled-draft:${sourceCommand.sourceControlledDraft.artifactId}`,
        `evidence:teaching-archive-item:${committed.archiveItem.id}`,
      ]),
      idempotencyKey: normalized.idempotencyKey,
      commitInputHash: normalized.commitInputHash,
    },
    boundary: buildBoundary(),
  };
}

function buildBoundary() {
  return {
    archivePersistenceCommandControlledDraftSourceVerified: true,
    controlledDraftSourceVerified: true,
    sourceControlledDraftEvidencePreserved: true,
    teachingArchiveUseCasePortInvoked: true,
    teachingArchiveDomainValidationExecuted: true,
    teachingArchiveRepositoryPersisted: true,
    publicationApprovalPreserved: true,
    safeLearnerFeedbackOnly: true,
    studentOwnScopeEnforced: true,
    studentArchivePersisted: true,
    studentArchiveWriteStarted: true,
    mainDatabaseWritePrepared: true,
    mainDatabaseWriteStarted: true,
    mainDatabaseWriteCommitted: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    answerKeyDisclosed: false,
    workerMetadataDisclosed: false,
    rawModelOutputDisclosed: false,
    resultRefDisclosed: false,
    modelInferenceStarted: false,
    directPublicationAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
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
    sourcePersistenceCommand: record.sourcePersistenceCommand,
    sourcePublicationApproval: record.sourcePublicationApproval,
    sourceControlledFeedbackDraft: record.sourceControlledFeedbackDraft,
    teachingArchiveCommit: record.teachingArchiveCommit,
    learnerFeedbackSnapshot: record.learnerFeedbackSnapshot,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: { targetP99Ms: 50, evidenceClass: "STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE_BOUNDARY" },
    nextAction: "Use this persisted Teaching Archive item as controlled-source Student App AI Tutor feedback archive evidence; row verification and public release remain separate slices.",
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
    if (record?.recordType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.commitInvocationId !== normalized.commitInvocationId ||
    existing.sourcePersistenceCommand?.recordId !== normalized.persistenceCommandRecord.recordId ||
    existing.sourcePersistenceCommand?.commandId !== normalized.persistenceCommandRecord.feedbackArchivePersistenceCommand.commandId ||
    existing.sourcePersistenceCommand?.sourceControlledDraftArtifactId !== normalized.persistenceCommandRecord.feedbackArchivePersistenceCommand.sourceControlledDraft.artifactId ||
    existing.evidence?.commitInputHash !== normalized.commitInputHash) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_FROM_DRAFT_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different controlled-source archive storage commit");
  }
}

function rejectLeakedFields(value, label) {
  if (!value || typeof value !== "object") return;
  const keys = collectKeys(value);
  for (const field of leakedFieldNames) {
    if (keys.has(field)) {
      throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_FROM_DRAFT_LEAKED_FIELD", `${label}.${field} is not allowed`);
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
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_FROM_DRAFT_INVALID_OBJECT", `${label} must be an object`);
  }
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_FROM_DRAFT_CONST", `${label} must be ${String(expected)}`);
  }
  return expected;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string") {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_FROM_DRAFT_STRING", `${label} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_FROM_DRAFT_STRING_LENGTH", `${label} length is invalid`);
  }
  return trimmed;
}

function requireSafeText(value, label, min, max) {
  const text = requireBoundedString(value, label, min, max);
  if (/[<>]/u.test(text) || forbiddenText.test(text)) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_FROM_DRAFT_UNSAFE_TEXT", `${label} must be encoded safe text`);
  }
  return text;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 420);
  if (!token.startsWith(prefix)) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_FROM_DRAFT_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireQuestionBankDraftRef(value, label) {
  const ref = requireBoundedString(value, label, 1, 1000);
  if (!ref.startsWith("local://question-bank-drafts/")) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_FROM_DRAFT_DRAFT_REF", `${label} must be a local question-bank draft ref`);
  }
  return ref;
}

function requireStudentScopeRef(value, label) {
  const ref = requireBoundedString(value, label, 1, 160);
  if (!ref.startsWith("student:")) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_FROM_DRAFT_SCOPE_REF", `${label} must be a student scope ref`);
  }
  return ref;
}

function requireEnum(value, label, allowed) {
  const text = requireBoundedString(value, label, 1, 260);
  if (!allowed.includes(text)) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_FROM_DRAFT_ENUM", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_FROM_DRAFT_BOOLEAN", `${label} must be boolean`);
  }
  return value;
}

function requireDateTime(value, label) {
  const text = requireBoundedString(value, label, 1, 80);
  if (Number.isNaN(Date.parse(text))) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_FROM_DRAFT_DATE", `${label} must be an ISO date-time`);
  }
  return text;
}

function uniqueStringArray(values, label, min, max) {
  if (!Array.isArray(values) || values.length < min || values.length > max) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_FROM_DRAFT_ARRAY", `${label} length is invalid`);
  }
  const normalized = [...new Set(values.map((value, index) => requireBoundedString(value, `${label}[${index}]`, 1, 3000)))];
  if (normalized.length < min) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_FROM_DRAFT_ARRAY_LENGTH", `${label} must contain at least ${min} item`);
  }
  return normalized;
}

function uniqueBoundedStringArray(values, label, minItems, maxItems, minLength, maxLength) {
  return uniqueStringArray(values, label, minItems, maxItems)
    .map((value, index) => requireBoundedString(value, `${label}[${index}]`, minLength, maxLength));
}

function uniqueSafeTextArray(values, label, minItems, maxItems, minLength, maxLength) {
  if (!Array.isArray(values) || values.length < minItems || values.length > maxItems) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_FROM_DRAFT_ARRAY_LENGTH", `${label} length is invalid`);
  }
  const normalized = values.map((value, index) => requireSafeText(value, `${label}[${index}]`, minLength, maxLength));
  if (new Set(normalized).size !== normalized.length) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_FROM_DRAFT_ARRAY_UNIQUE", `${label} must be unique`);
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
