import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_storage_commit_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_PORT =
  "StudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitPort.commitTeachingArchiveCreateCommand";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_READY =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_READY";

const inputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit.v1";
const outputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-storage-committed.v1";
const sourceRuntimeId = "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_persistence_command_runtime";
const sourceCommandPort = "StudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandPort.recordFeedbackArchivePersistenceCommand";
const sourceReportWorkload = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_RUNTIME";
const sourceStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED";
const committedStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED";
const defaultCommitLogPath = "reports/student-command-log/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit.jsonl";
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
  "internalError",
  "errorMessage",
  "databaseWriteResult",
];

export async function commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorage(input, options = {}) {
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
  });
  const committed = assertPortResult(portResult, normalized.teachingArchiveCreateCommand);
  const record = buildCommitRecord(normalized, committed, committedAt);
  appendCommitRecord(commitLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommit(result) {
  return [
    `Student App AI Tutor feedback archive storage commit: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Archive item: ${result.teachingArchiveCommit.archiveItem.id}`,
    `Persistence: ${result.teachingArchiveCommit.persistence.status}`,
    `Main DB committed: ${result.boundary.mainDatabaseWriteCommitted}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const commitInvocationId = requireToken(input.commitInvocationId, "input.commitInvocationId", "feedback_archive_storage_commit_");
  const persistenceCommandReport = assertPersistenceCommandReport(input.feedbackArchivePersistenceCommandReport);
  const persistenceCommandRecord = assertPersistenceCommandRecord(persistenceCommandReport);
  const commitPolicy = assertCommitPolicy(input.feedbackArchiveStorageCommitPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 260);
  if (!evidenceRefs.some((ref) => ref.includes("student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command"))) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_MISSING_COMMAND_EVIDENCE", "archive persistence command evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 260);
  const teachingArchiveCreateCommand = assertTeachingArchiveCreateCommand(
    buildTeachingArchiveCreateCommand(persistenceCommandRecord),
    persistenceCommandRecord,
  );
  const commitInputHash = hashInput({
    commitInvocationId,
    persistenceCommandRecordId: persistenceCommandRecord.recordId,
    persistenceCommandId: persistenceCommandRecord.feedbackArchivePersistenceCommand.commandId,
    requestBody: teachingArchiveCreateCommand.requestBody,
    commitPolicy,
  });
  return {
    commitInvocationId,
    persistenceCommandReport,
    persistenceCommandRecord,
    commitPolicy,
    evidenceRefs,
    idempotencyKey,
    teachingArchiveCreateCommand,
    commitInputHash,
  };
}

function assertPersistenceCommandReport(report) {
  rejectLeakedFields(report, "input.feedbackArchivePersistenceCommandReport");
  assertPlainObject(report, "input.feedbackArchivePersistenceCommandReport");
  requireConst(report.readiness, "READY", "input.feedbackArchivePersistenceCommandReport.readiness");
  requireConst(report.workloadType, sourceReportWorkload, "input.feedbackArchivePersistenceCommandReport.workloadType");
  requireConst(report.runtime?.runtimeId, sourceRuntimeId, "input.feedbackArchivePersistenceCommandReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, sourceCommandPort, "input.feedbackArchivePersistenceCommandReport.runtime.commandPort");
  requireConst(report.runtime?.status, "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED", "input.feedbackArchivePersistenceCommandReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.feedbackArchivePersistenceCommandReport.runtimeSlo.totalErrors");
  assertPersistenceCommandReportBoundaries(report.safetyInvariants ?? {});
  return report;
}

function assertPersistenceCommandReportBoundaries(boundary) {
  for (const field of [
    "feedbackDeliveryEnvelopeRequired",
    "appendOnlyCommandLogRequired",
    "studentOwnScopeRequired",
    "feedbackArchivePersistenceCommandRecorded",
  ]) {
    requireConst(boundary[field], true, `input.feedbackArchivePersistenceCommandReport.safetyInvariants.${field}`);
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
    requireConst(boundary[field], false, `input.feedbackArchivePersistenceCommandReport.safetyInvariants.${field}`);
  }
}

function assertPersistenceCommandRecord(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand?.result;
  rejectLeakedFields(result, "input.feedbackArchivePersistenceCommandReport.runtimeProbes.result");
  assertPlainObject(result, "input.feedbackArchivePersistenceCommandReport.runtimeProbes.result");
  requireConst(result.schemaVersion, "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-recorded.v1", "source.schemaVersion");
  requireConst(result.runtimeId, sourceRuntimeId, "source.runtimeId");
  requireConst(result.commandPort, sourceCommandPort, "source.commandPort");
  requireConst(result.status, sourceStatus, "source.status");
  requireConst(result.boundary?.feedbackDeliveryEnvelopeVerified, true, "source.boundary.feedbackDeliveryEnvelopeVerified");
  requireConst(result.boundary?.feedbackArchivePersistenceCommandRecorded, true, "source.boundary.feedbackArchivePersistenceCommandRecorded");
  requireConst(result.boundary?.durableStudentArchiveCommitStarted, false, "source.boundary.durableStudentArchiveCommitStarted");
  requireConst(result.boundary?.studentArchivePersisted, false, "source.boundary.studentArchivePersisted");
  requireConst(result.boundary?.mainDatabaseWriteStarted, false, "source.boundary.mainDatabaseWriteStarted");
  const command = assertPersistenceCommand(result.feedbackArchivePersistenceCommand);
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "source.recordId", 1, 260),
    principal: assertPersistencePrincipal(result.principal),
    feedbackArchivePersistenceCommand: command,
    evidenceRefs: uniqueStringArray(result.evidenceRefs, "source.evidenceRefs", 1, 1200),
  };
}

function assertPersistencePrincipal(principal) {
  assertPlainObject(principal, "source.principal");
  const scopes = uniqueStringArray(principal.scopes, "source.principal.scopes", 1, 32);
  for (const scope of ["TEACHING_READ", "STUDENT_ARCHIVE_WRITE", "STUDENT_APP_DELIVERY"]) {
    if (!scopes.includes(scope)) {
      throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_MISSING_SOURCE_SCOPE", `${scope} source scope is required`);
    }
  }
  return {
    principalId: requireBoundedString(principal.principalId, "source.principal.principalId", 1, 128),
    subjectType: requireConst(principal.subjectType, "SERVICE", "source.principal.subjectType"),
    role: requireConst(principal.role, "SERVICE", "source.principal.role"),
    entryPoint: requireConst(principal.entryPoint, "STUDENT_ARCHIVE_PERSISTENCE_RUNTIME", "source.principal.entryPoint"),
    scopes,
    sessionId: requireBoundedString(principal.sessionId, "source.principal.sessionId", 1, 128),
  };
}

function assertPersistenceCommand(command) {
  assertPlainObject(command, "source.feedbackArchivePersistenceCommand");
  requireConst(command.commandKind, "STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND", "source.commandKind");
  requireConst(command.persistenceMode, "APPEND_ONLY_STUDENT_ARCHIVE_COMMAND", "source.persistenceMode");
  requireConst(command.targetArchiveKind, "STUDENT_AI_TUTOR_FEEDBACK_ARCHIVE", "source.targetArchiveKind");
  requireConst(command.desiredArchiveState, "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED", "source.desiredArchiveState");
  requireConst(command.commitState, "NOT_COMMITTED_TO_STUDENT_ARCHIVE", "source.commitState");
  requireConst(command.evidencePreserved, true, "source.evidencePreserved");
  requireConst(command.approvalEvidencePreserved, true, "source.approvalEvidencePreserved");
  requireConst(command.studentOwnScopeEnforced, true, "source.studentOwnScopeEnforced");
  return {
    commandId: requireToken(command.commandId, "source.commandId", "feedback_archive_cmd_"),
    commandKind: "STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND",
    scopeRef: requireStudentScopeRef(command.scopeRef, "source.scopeRef"),
    sourceFeedbackDeliveryRecordId: requireBoundedString(command.sourceFeedbackDeliveryRecordId, "source.sourceFeedbackDeliveryRecordId", 1, 260),
    sourceFeedbackDeliveryEnvelopeId: requireToken(command.sourceFeedbackDeliveryEnvelopeId, "source.sourceFeedbackDeliveryEnvelopeId", "feedback_delivery_env_"),
    approvedFeedbackArtifactId: requireToken(command.approvedFeedbackArtifactId, "source.approvedFeedbackArtifactId", "feedback_artifact_"),
    submissionId: requireToken(command.submissionId, "source.submissionId", "qbank_ans_sub_"),
    requestId: requireToken(command.requestId, "source.requestId", "grading_req_"),
    questionBankDraftRef: requireQuestionBankDraftRef(command.questionBankDraftRef, "source.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireToken(command.tutoringAnalysisRequestId, "source.tutoringAnalysisRequestId", "tutor_req_"),
    archiveItemId: requireToken(command.archiveItemId, "source.archiveItemId", "tarch_"),
    scoreSummary: requireSafeText(command.scoreSummary, "source.scoreSummary", 1, 2000),
    learnerFeedback: assertLearnerFeedback(command.learnerFeedback),
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
  assertPlainObject(policy, "input.feedbackArchiveStorageCommitPolicy");
  for (const field of [
    "archivePersistenceCommandRequired",
    "teachingArchiveUseCaseCommitAllowed",
    "injectedTeachingArchivePortRequired",
    "teachingArchiveDomainValidationRequired",
    "persistedOutcomeRequired",
    "preserveLearnerFeedbackRequired",
    "preserveApprovalEvidenceRequired",
    "idempotentStorageCommitRequired",
    "mainDatabaseWriteAllowed",
  ]) {
    requireConst(policy[field], true, `input.feedbackArchiveStorageCommitPolicy.${field}`);
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
    requireConst(policy[field], false, `input.feedbackArchiveStorageCommitPolicy.${field}`);
  }
  return { ...policy };
}

function buildTeachingArchiveCreateCommand(record) {
  const command = record.feedbackArchivePersistenceCommand;
  const studentId = command.scopeRef.slice("student:".length);
  const contentHash = hashInput({
    commandId: command.commandId,
    sourceFeedbackDeliveryEnvelopeId: command.sourceFeedbackDeliveryEnvelopeId,
    approvedFeedbackArtifactId: command.approvedFeedbackArtifactId,
    scoreSummary: command.scoreSummary,
    learnerFeedback: command.learnerFeedback,
  }).replace("sha256:", "sha256_");
  return {
    commandId: `teaching_archive_create_student_ai_tutor_feedback_${safeToken(command.commandId)}`,
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
      title: `Student AI Tutor feedback archive ${command.submissionId}`,
      source: "SYSTEM_IMPORT",
      contentRef: `student-ai-tutor-feedback-archive:${command.commandId}:${contentHash}`,
      tags: ["student_app_ai_tutor", "feedback", "question_bank", "archive_commit"],
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
  return {
    ...command,
    commandId: requireBoundedString(command.commandId, "teachingArchiveCreateCommand.commandId", 1, 260),
    principalContextHeader: principal,
    requestBody: body,
  };
}

function assertPrincipalContext(principal) {
  assertPlainObject(principal, "teachingArchiveCreateCommand.principalContextHeader");
  const scopes = uniqueStringArray(principal.scopes, "principalContextHeader.scopes", 1, 32);
  for (const scope of ["TEACHING_READ", "STUDENT_ARCHIVE_WRITE", "STUDENT_ASSIGNED_READ"]) {
    if (!scopes.includes(scope)) {
      throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_MISSING_COMMIT_SCOPE", `${scope} commit scope is required`);
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
    sessionId: requireBoundedString(principal.sessionId, "principalContextHeader.sessionId", 1, 128),
  };
}

function assertStudentAccess(access) {
  assertPlainObject(access, "principalContextHeader.studentAccess");
  return {
    mode: requireEnum(access.mode, "principalContextHeader.studentAccess.mode", ["ASSIGNED", "ALL"]),
    studentIds: Array.isArray(access.studentIds)
      ? uniqueBoundedStringArray(access.studentIds, "principalContextHeader.studentAccess.studentIds", 0, 200, 1, 128)
      : [],
  };
}

function assertRequestBody(body, principal, record) {
  assertPlainObject(body, "teachingArchiveCreateCommand.requestBody");
  const studentId = requireBoundedString(body.studentId, "requestBody.studentId", 1, 128);
  if (record.feedbackArchivePersistenceCommand.scopeRef !== `student:${studentId}`) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_STUDENT_SCOPE_MISMATCH", "requestBody.studentId must match source scopeRef");
  }
  if (principal.studentAccess.mode === "ASSIGNED" && !principal.studentAccess.studentIds.includes(studentId)) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_STUDENT_ACCESS_MISMATCH", "principal studentAccess must include requestBody.studentId");
  }
  return {
    ownerType: requireConst(body.ownerType, "STUDENT", "requestBody.ownerType"),
    studentId,
    materialType: requireEnum(body.materialType, "requestBody.materialType", ["QUIZ", "PAPER", "HANDOUT", "HOMEWORK"]),
    title: requireSafeText(body.title, "requestBody.title", 1, 200),
    source: requireConst(body.source, "SYSTEM_IMPORT", "requestBody.source"),
    contentRef: requireBoundedString(body.contentRef, "requestBody.contentRef", 1, 1000),
    tags: uniqueBoundedStringArray(body.tags ?? [], "requestBody.tags", 0, 32, 1, 64),
    analysisIntents: uniqueStringArray(body.analysisIntents, "requestBody.analysisIntents", 1, 2)
      .map((intent) => requireEnum(intent, "requestBody.analysisIntents[]", ["ARCHIVE_ONLY", "TUTORING"])),
    ocrReserved: requireBoolean(body.ocrReserved, "requestBody.ocrReserved"),
  };
}

function assertCreateItemPort(port) {
  if (!port || typeof port.createArchiveItem !== "function") {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_MISSING_PORT", "TeachingArchiveCreateItemPort.createArchiveItem is required");
  }
  return port;
}

function assertPortResult(result, command) {
  assertPlainObject(result, "TeachingArchiveCreateItemPort result");
  const archiveItem = assertArchiveItem(result.archiveItem, command.requestBody);
  const persistence = assertPersistence(result.persistence);
  return { archiveItem, persistence };
}

function assertArchiveItem(item, requestBody) {
  assertPlainObject(item, "TeachingArchiveCreateItemPort result.archiveItem");
  const id = requireBoundedString(item.id, "result.archiveItem.id", 1, 128);
  if (!id.startsWith("tarch_")) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_INVALID_ARCHIVE_ID", "archive item id must use tarch_ prefix");
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
  return {
    status: requireConst(persistence.status, "persisted", "result.persistence.status"),
    commandId: typeof persistence.commandId === "string" ? persistence.commandId : "",
  };
}

function buildCommitRecord(normalized, committed, committedAt) {
  const sourceCommand = normalized.persistenceCommandRecord.feedbackArchivePersistenceCommand;
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT",
    recordId: `student_app_ai_tutor_question_bank_draft_answer_feedback_archive_storage_commit_${safeToken(normalized.idempotencyKey)}`,
    recordedAt: committedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_PORT,
    status: committedStatus,
    commitInvocationId: normalized.commitInvocationId,
    sourcePersistenceCommand: {
      runtimeId: sourceRuntimeId,
      recordId: normalized.persistenceCommandRecord.recordId,
      commandId: sourceCommand.commandId,
      sourceFeedbackDeliveryEnvelopeId: sourceCommand.sourceFeedbackDeliveryEnvelopeId,
      approvedFeedbackArtifactId: sourceCommand.approvedFeedbackArtifactId,
      submissionId: sourceCommand.submissionId,
      requestId: sourceCommand.requestId,
      questionBankDraftRef: sourceCommand.questionBankDraftRef,
      tutoringAnalysisRequestId: sourceCommand.tutoringAnalysisRequestId,
      sourceArchiveItemId: sourceCommand.archiveItemId,
      scopeRef: sourceCommand.scopeRef,
      commitState: "COMMITTED_TO_STUDENT_ARCHIVE",
    },
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
      safeLearnerFeedbackOnly: true,
      approvalEvidencePreserved: true,
    },
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.persistenceCommandRecord.evidenceRefs,
        `evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-input-hash:${normalized.commitInputHash}`,
        `evidence:runtime:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_RUNTIME_ID}`,
        `evidence:command-port:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_PORT}`,
        `evidence:archive-persistence-command-record:${normalized.persistenceCommandRecord.recordId}`,
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
    archivePersistenceCommandVerified: true,
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
    teachingArchiveCommit: record.teachingArchiveCommit,
    learnerFeedbackSnapshot: record.learnerFeedbackSnapshot,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 50,
      evidenceClass: "STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_BOUNDARY",
    },
    nextAction: "Use this persisted Teaching Archive item as Student App AI Tutor feedback archive evidence; row verification and public product release remain separate slices.",
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
    if (record?.recordType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT" &&
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
    existing.evidence?.commitInputHash !== normalized.commitInputHash) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different archive storage commit");
  }
}

function rejectLeakedFields(value, label) {
  if (!value || typeof value !== "object") return;
  const keys = collectKeys(value);
  for (const field of leakedFieldNames) {
    if (keys.has(field)) {
      throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_LEAKED_FIELD", `${label}.${field} is not allowed`);
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
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_INVALID_OBJECT", `${label} must be an object`);
  }
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONST", `${label} must be ${String(expected)}`);
  }
  return expected;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string") {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_STRING", `${label} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_STRING_LENGTH", `${label} length is invalid`);
  }
  return trimmed;
}

function requireSafeText(value, label, min, max) {
  const text = requireBoundedString(value, label, min, max);
  if (/[<>]/u.test(text)) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_UNSAFE_TEXT", `${label} must be encoded safe text`);
  }
  return text;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 260);
  if (!token.startsWith(prefix)) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireQuestionBankDraftRef(value, label) {
  const ref = requireBoundedString(value, label, 1, 1000);
  if (!ref.startsWith("local://question-bank-drafts/")) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_DRAFT_REF", `${label} must be a local question-bank draft ref`);
  }
  return ref;
}

function requireStudentScopeRef(value, label) {
  const ref = requireBoundedString(value, label, 1, 160);
  if (!ref.startsWith("student:")) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_SCOPE_REF", `${label} must be a student scope ref`);
  }
  return ref;
}

function requireEnum(value, label, allowed) {
  const text = requireBoundedString(value, label, 1, 260);
  if (!allowed.includes(text)) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_ENUM", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_BOOLEAN", `${label} must be boolean`);
  }
  return value;
}

function requireDateTime(value, label) {
  const text = requireBoundedString(value, label, 1, 80);
  if (Number.isNaN(Date.parse(text))) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_DATE", `${label} must be an ISO date-time`);
  }
  return text;
}

function uniqueStringArray(values, label, min, max) {
  if (!Array.isArray(values) || values.length < min || values.length > max) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_ARRAY", `${label} length is invalid`);
  }
  const normalized = values.map((value, index) => requireBoundedString(value, `${label}[${index}]`, 1, 1200));
  if (new Set(normalized).size !== normalized.length) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_ARRAY_UNIQUE", `${label} must be unique`);
  }
  return normalized;
}

function uniqueBoundedStringArray(values, label, minItems, maxItems, minLength, maxLength) {
  return uniqueStringArray(values, label, minItems, maxItems)
    .map((value, index) => requireBoundedString(value, `${label}[${index}]`, minLength, maxLength));
}

function uniqueSafeTextArray(values, label, minItems, maxItems, minLength, maxLength) {
  if (!Array.isArray(values) || values.length < minItems || values.length > maxItems) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_ARRAY_LENGTH", `${label} length is invalid`);
  }
  const normalized = values.map((value, index) => requireSafeText(value, `${label}[${index}]`, minLength, maxLength));
  if (new Set(normalized).size !== normalized.length) {
    throw commitError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_ARRAY_UNIQUE", `${label} must be unique`);
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
