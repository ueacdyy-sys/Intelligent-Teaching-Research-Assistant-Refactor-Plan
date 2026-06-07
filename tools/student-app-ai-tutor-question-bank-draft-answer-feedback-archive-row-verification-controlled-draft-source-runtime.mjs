import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_row_verification_controlled_draft_source_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_CONTROLLED_DRAFT_SOURCE_PORT =
  "StudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSourcePort.verifyTeachingArchivePhysicalRowFromControlledDraftSource";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_CONTROLLED_DRAFT_SOURCE_READY =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_CONTROLLED_DRAFT_SOURCE_READY";

const inputSchemaVersion =
  "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source.v1";
const outputSchemaVersion =
  "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source-verified.v1";
const sourceSchemaVersion =
  "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-committed.v1";
const sourceRuntimeId =
  "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_storage_commit_controlled_draft_source_runtime";
const sourceCommandPort =
  "StudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSourcePort.commitTeachingArchiveCreateCommandFromControlledDraftSource";
const sourceWorkload =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE";
const sourceStatus =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED_FROM_CONTROLLED_DRAFT_SOURCE";
const verifiedStatus =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PHYSICAL_ROW_VERIFIED_FROM_CONTROLLED_DRAFT_SOURCE";
const defaultVerificationLogPath =
  "reports/student-command-log/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source.jsonl";

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

export async function verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRowControlledDraftSource(input, options = {}) {
  const verifiedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const verificationLogPath = options.verificationLogPath ?? defaultVerificationLogPath;
  const existing = findExistingRecordByIdempotencyKey(verificationLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const rowReadPort = assertRowReadPort(options.teachingArchiveRowReadPort);
  const archiveItemId = normalized.storageCommitResult.teachingArchiveCommit.archiveItem.id;
  const portResult = await rowReadPort.getArchiveItemById(archiveItemId, {
    verificationInvocationId: normalized.verificationInvocationId,
    idempotencyKey: normalized.idempotencyKey,
    sourceStorageCommitRecordId: normalized.storageCommitResult.recordId,
    sourceControlledDraftArtifactId: normalized.storageCommitResult.sourceControlledFeedbackDraft.artifactId,
  });
  const verified = assertPortResult(portResult, normalized.storageCommitResult.teachingArchiveCommit.archiveItem);
  const record = buildVerificationRecord(normalized, verified, verifiedAt);
  appendVerificationRecord(verificationLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSource(result) {
  return [
    `Student App AI Tutor feedback archive row verification from controlled draft source: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Archive item: ${result.teachingArchivePhysicalRow.archiveItem.id}`,
    `Source controlled draft: ${result.sourceControlledFeedbackDraft.artifactId}`,
    `Physical row verified: ${result.boundary.physicalDatabaseRowVerified}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const verificationInvocationId = requireToken(input.verificationInvocationId, "input.verificationInvocationId", "feedback_archive_row_verification_controlled_draft_");
  const storageCommitReport = assertStorageCommitReport(input.feedbackArchiveStorageCommitControlledDraftSourceReport);
  const storageCommitResult = assertStorageCommitResult(storageCommitReport);
  const verificationPolicy = assertVerificationPolicy(input.feedbackArchiveRowVerificationControlledDraftSourcePolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 420);
  for (const required of ["feedback-archive-storage-commit-controlled-draft-source", "feedback-archive-row-verification-controlled-draft-source"]) {
    if (!evidenceRefs.some((ref) => ref.includes(required))) {
      throw verificationError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_ROW_VERIFICATION_FROM_DRAFT_MISSING_EVIDENCE", `${required} evidence ref is required`);
    }
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 420);
  const verificationInputHash = hashInput({
    verificationInvocationId,
    storageCommitRecordId: storageCommitResult.recordId,
    sourceControlledDraftArtifactId: storageCommitResult.sourceControlledFeedbackDraft.artifactId,
    archiveItem: storageCommitResult.teachingArchiveCommit.archiveItem,
    verificationPolicy,
  });
  return { verificationInvocationId, storageCommitReport, storageCommitResult, verificationPolicy, evidenceRefs, idempotencyKey, verificationInputHash };
}

function assertStorageCommitReport(report) {
  rejectLeakedFields(report, "input.feedbackArchiveStorageCommitControlledDraftSourceReport");
  assertPlainObject(report, "input.feedbackArchiveStorageCommitControlledDraftSourceReport");
  requireConst(report.readiness, "READY", "input.feedbackArchiveStorageCommitControlledDraftSourceReport.readiness");
  requireConst(report.workloadType, sourceWorkload, "input.feedbackArchiveStorageCommitControlledDraftSourceReport.workloadType");
  requireConst(report.runtime?.runtimeId, sourceRuntimeId, "input.feedbackArchiveStorageCommitControlledDraftSourceReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, sourceCommandPort, "input.feedbackArchiveStorageCommitControlledDraftSourceReport.runtime.commandPort");
  requireConst(report.runtime?.status, sourceStatus, "input.feedbackArchiveStorageCommitControlledDraftSourceReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.feedbackArchiveStorageCommitControlledDraftSourceReport.runtimeSlo.totalErrors");
  assertStorageCommitInvariants(report.safetyInvariants ?? {});
  return report;
}

function assertStorageCommitInvariants(boundary) {
  for (const field of [
    "archivePersistenceCommandControlledDraftSourceRequired",
    "sourceControlledDraftEvidenceRequired",
    "injectedTeachingArchivePortRequired",
    "teachingArchiveUseCasePortInvoked",
    "teachingArchiveDomainValidationExecuted",
    "persistedOutcomeRequired",
    "sourceControlledDraftEvidencePreserved",
    "safeLearnerFeedbackOnly",
    "studentArchivePersisted",
    "mainDatabaseWriteCommitted",
  ]) {
    requireConst(boundary[field], true, `input.feedbackArchiveStorageCommitControlledDraftSourceReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "answerKeyDisclosureAllowed",
    "workerMetadataDisclosureAllowed",
    "rawModelOutputDisclosureAllowed",
    "resultRefDisclosureAllowed",
    "modelInferenceAllowed",
    "swarmAllowed",
  ]) {
    requireConst(boundary[field], false, `input.feedbackArchiveStorageCommitControlledDraftSourceReport.safetyInvariants.${field}`);
  }
}

function assertStorageCommitResult(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource?.result;
  rejectLeakedFields(result, "input.feedbackArchiveStorageCommitControlledDraftSourceReport.runtimeProbes.result");
  assertPlainObject(result, "input.feedbackArchiveStorageCommitControlledDraftSourceReport.runtimeProbes.result");
  requireConst(result.schemaVersion, sourceSchemaVersion, "source.schemaVersion");
  requireConst(result.runtimeId, sourceRuntimeId, "source.runtimeId");
  requireConst(result.commandPort, sourceCommandPort, "source.commandPort");
  requireConst(result.status, sourceStatus, "source.status");
  for (const field of [
    "archivePersistenceCommandControlledDraftSourceVerified",
    "controlledDraftSourceVerified",
    "sourceControlledDraftEvidencePreserved",
    "teachingArchiveUseCasePortInvoked",
    "teachingArchiveRepositoryPersisted",
    "mainDatabaseWriteCommitted",
    "studentArchivePersisted",
  ]) {
    requireConst(result.boundary?.[field], true, `source.boundary.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "modelInferenceStarted",
    "answerKeyDisclosed",
    "workerMetadataDisclosed",
    "rawModelOutputDisclosed",
    "resultRefDisclosed",
    "swarmAllowed",
  ]) {
    requireConst(result.boundary?.[field], false, `source.boundary.${field}`);
  }
  const sourceControlledFeedbackDraft = assertSourceControlledDraft(result.sourceControlledFeedbackDraft, "source.sourceControlledFeedbackDraft");
  const sourcePersistenceCommand = assertSourcePersistenceCommand(result.sourcePersistenceCommand, sourceControlledFeedbackDraft);
  const sourcePublicationApproval = assertSourcePublicationApproval(result.sourcePublicationApproval, sourceControlledFeedbackDraft);
  const commit = assertTeachingArchiveCommit(result.teachingArchiveCommit);
  const feedback = assertLearnerFeedbackSnapshot(result.learnerFeedbackSnapshot, sourceControlledFeedbackDraft);
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "source.recordId", 1, 420),
    idempotencyKey: requireBoundedString(result.idempotencyKey, "source.idempotencyKey", 1, 420),
    sourcePersistenceCommand,
    sourcePublicationApproval,
    sourceControlledFeedbackDraft,
    teachingArchiveCommit: commit,
    learnerFeedbackSnapshot: feedback,
    evidenceRefs: uniqueStringArray(result.evidenceRefs, "source.evidenceRefs", 1, 3200),
  };
}

function assertSourcePersistenceCommand(command, sourceControlledFeedbackDraft) {
  assertPlainObject(command, "source.sourcePersistenceCommand");
  requireConst(command.commitState, "COMMITTED_TO_STUDENT_ARCHIVE", "source.sourcePersistenceCommand.commitState");
  requireConst(command.sourceControlledDraftArtifactId, sourceControlledFeedbackDraft.artifactId, "source.sourcePersistenceCommand.sourceControlledDraftArtifactId");
  return {
    runtimeId: requireBoundedString(command.runtimeId, "source.sourcePersistenceCommand.runtimeId", 1, 160),
    recordId: requireBoundedString(command.recordId, "source.sourcePersistenceCommand.recordId", 1, 420),
    commandId: requireToken(command.commandId, "source.sourcePersistenceCommand.commandId", "feedback_archive_cmd_controlled_draft_"),
    sourceControlledDraftArtifactId: sourceControlledFeedbackDraft.artifactId,
    approvedFeedbackArtifactId: requireToken(command.approvedFeedbackArtifactId, "source.sourcePersistenceCommand.approvedFeedbackArtifactId", "feedback_artifact_"),
    submissionId: requireBoundedString(command.submissionId, "source.sourcePersistenceCommand.submissionId", 1, 160),
    requestId: requireBoundedString(command.requestId, "source.sourcePersistenceCommand.requestId", 1, 160),
    questionBankDraftRef: requireBoundedString(command.questionBankDraftRef, "source.sourcePersistenceCommand.questionBankDraftRef", 1, 180),
    tutoringAnalysisRequestId: requireBoundedString(command.tutoringAnalysisRequestId, "source.sourcePersistenceCommand.tutoringAnalysisRequestId", 1, 180),
    sourceArchiveItemId: requireToken(command.sourceArchiveItemId, "source.sourcePersistenceCommand.sourceArchiveItemId", "tarch_"),
    scopeRef: requireBoundedString(command.scopeRef, "source.sourcePersistenceCommand.scopeRef", 1, 180),
    commitState: "COMMITTED_TO_STUDENT_ARCHIVE",
  };
}

function assertSourcePublicationApproval(approval, sourceControlledFeedbackDraft) {
  assertPlainObject(approval, "source.sourcePublicationApproval");
  requireConst(approval.sourceControlledDraftArtifactId, sourceControlledFeedbackDraft.artifactId, "source.sourcePublicationApproval.sourceControlledDraftArtifactId");
  requireConst(approval.controlledDraftSourceVerified, true, "source.sourcePublicationApproval.controlledDraftSourceVerified");
  return {
    runtimeId: requireBoundedString(approval.runtimeId, "source.sourcePublicationApproval.runtimeId", 1, 180),
    recordId: requireBoundedString(approval.recordId, "source.sourcePublicationApproval.recordId", 1, 420),
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

function assertTeachingArchiveCommit(commit) {
  assertPlainObject(commit, "source.teachingArchiveCommit");
  requireConst(commit.operationId, "createTeachingArchiveItem", "source.teachingArchiveCommit.operationId");
  requireConst(commit.targetUseCase, "CreateArchiveItem.ExecuteWithPersistence", "source.teachingArchiveCommit.targetUseCase");
  requireConst(commit.targetRepository, "ArchiveRepository.Create", "source.teachingArchiveCommit.targetRepository");
  requireConst(commit.targetTable, "teaching_archive_items", "source.teachingArchiveCommit.targetTable");
  return {
    operationId: commit.operationId,
    targetUseCase: commit.targetUseCase,
    targetRepository: commit.targetRepository,
    targetTable: commit.targetTable,
    archiveItem: assertArchiveItem(commit.archiveItem, "source.teachingArchiveCommit.archiveItem"),
    persistence: assertPersistence(commit.persistence),
  };
}

function assertPersistence(persistence) {
  assertPlainObject(persistence, "source.teachingArchiveCommit.persistence");
  return {
    status: requireConst(persistence.status, "persisted", "source.teachingArchiveCommit.persistence.status"),
    commandId: typeof persistence.commandId === "string" ? persistence.commandId : "",
  };
}

function assertLearnerFeedbackSnapshot(snapshot, sourceControlledFeedbackDraft) {
  assertPlainObject(snapshot, "source.learnerFeedbackSnapshot");
  requireConst(snapshot.safeLearnerFeedbackOnly, true, "source.learnerFeedbackSnapshot.safeLearnerFeedbackOnly");
  requireConst(snapshot.approvalEvidencePreserved, true, "source.learnerFeedbackSnapshot.approvalEvidencePreserved");
  requireConst(snapshot.sourceControlledDraftEvidencePreserved, true, "source.learnerFeedbackSnapshot.sourceControlledDraftEvidencePreserved");
  const sourceControlledDraft = assertSourceControlledDraft(snapshot.sourceControlledDraft, "source.learnerFeedbackSnapshot.sourceControlledDraft");
  requireConst(sourceControlledDraft.artifactId, sourceControlledFeedbackDraft.artifactId, "source.learnerFeedbackSnapshot.sourceControlledDraft.artifactId");
  return {
    scoreSummary: assertSnapshotValue(snapshot.scoreSummary, "source.learnerFeedbackSnapshot.scoreSummary"),
    learnerFeedback: assertPlainObjectWithValue(snapshot.learnerFeedback, "source.learnerFeedbackSnapshot.learnerFeedback"),
    sourceControlledDraft,
    safeLearnerFeedbackOnly: true,
    approvalEvidencePreserved: true,
    sourceControlledDraftEvidencePreserved: true,
  };
}

function assertSnapshotValue(value, label) {
  if (typeof value === "string") return requireBoundedString(value, label, 1, 1200);
  return assertPlainObjectWithValue(value, label);
}

function assertVerificationPolicy(policy) {
  assertPlainObject(policy, "input.feedbackArchiveRowVerificationControlledDraftSourcePolicy");
  for (const field of [
    "storageCommitControlledDraftSourceRequired",
    "sourceControlledDraftEvidenceRequired",
    "physicalRowVerificationRequired",
    "injectedTeachingArchiveRowReadPortRequired",
    "teachingArchiveRepositoryReadRequired",
    "committedArchiveItemMatchRequired",
    "preserveLearnerFeedbackRequired",
    "preserveApprovalEvidenceRequired",
    "preserveControlledDraftSourceEvidenceRequired",
    "studentOwnScopeRequired",
    "idempotentRowVerificationRequired",
    "mainDatabaseReadAllowed",
  ]) {
    requireConst(policy[field], true, `input.feedbackArchiveRowVerificationControlledDraftSourcePolicy.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed",
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
    requireConst(policy[field], false, `input.feedbackArchiveRowVerificationControlledDraftSourcePolicy.${field}`);
  }
  return { ...policy };
}

function assertRowReadPort(port) {
  if (!port || typeof port.getArchiveItemById !== "function") {
    throw verificationError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_ROW_VERIFICATION_FROM_DRAFT_MISSING_PORT", "TeachingArchiveRowReadPort.getArchiveItemById is required");
  }
  return port;
}

function assertPortResult(result, committedArchiveItem) {
  assertPlainObject(result, "TeachingArchiveRowReadPort result");
  requireConst(result.found, true, "TeachingArchiveRowReadPort result.found");
  const source = assertRowReadSource(result.source);
  const row = assertArchiveItem(result.row, "TeachingArchiveRowReadPort result.row");
  assertRowMatchesCommit(row, committedArchiveItem);
  return { source, row };
}

function assertRowReadSource(source) {
  assertPlainObject(source, "TeachingArchiveRowReadPort result.source");
  return {
    repositoryMethod: requireConst(source.repositoryMethod, "ArchiveRepository.GetByID", "TeachingArchiveRowReadPort result.source.repositoryMethod"),
    targetTable: requireConst(source.targetTable, "teaching_archive_items", "TeachingArchiveRowReadPort result.source.targetTable"),
  };
}

function assertArchiveItem(item, label) {
  assertPlainObject(item, label);
  const id = requireToken(item.id, `${label}.id`, "tarch_");
  return {
    id,
    ownerType: requireConst(item.ownerType, "STUDENT", `${label}.ownerType`),
    studentId: requireBoundedString(item.studentId, `${label}.studentId`, 1, 128),
    materialType: requireEnum(item.materialType, `${label}.materialType`, ["QUIZ", "PAPER", "HANDOUT", "HOMEWORK"]),
    title: requireSafeText(item.title, `${label}.title`, 1, 220),
    source: requireConst(item.source, "SYSTEM_IMPORT", `${label}.source`),
    contentRef: requireBoundedString(item.contentRef, `${label}.contentRef`, 1, 1000),
    tags: uniqueBoundedStringArray(item.tags ?? [], `${label}.tags`, 0, 32, 1, 64),
    analysisIntents: uniqueStringArray(item.analysisIntents ?? [], `${label}.analysisIntents`, 1, 64),
    ocrStatus: requireEnum(item.ocrStatus, `${label}.ocrStatus`, ["RESERVED", "NOT_REQUIRED"]),
    createdAt: requireDateTime(item.createdAt, `${label}.createdAt`),
  };
}

function assertRowMatchesCommit(row, committed) {
  for (const field of ["id", "ownerType", "studentId", "materialType", "title", "source", "contentRef", "ocrStatus", "createdAt"]) {
    requireConst(row[field], committed[field], `TeachingArchiveRowReadPort result.row.${field}`);
  }
  requireConst(JSON.stringify(row.tags), JSON.stringify(committed.tags), "TeachingArchiveRowReadPort result.row.tags");
  requireConst(JSON.stringify(row.analysisIntents), JSON.stringify(committed.analysisIntents), "TeachingArchiveRowReadPort result.row.analysisIntents");
}

function buildVerificationRecord(normalized, verified, verifiedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_CONTROLLED_DRAFT_SOURCE",
    recordId: `student_app_ai_tutor_question_bank_draft_answer_feedback_archive_row_verification_controlled_draft_source_${safeToken(normalized.idempotencyKey)}`,
    recordedAt: verifiedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_CONTROLLED_DRAFT_SOURCE_PORT,
    status: verifiedStatus,
    verificationInvocationId: normalized.verificationInvocationId,
    sourceStorageCommit: {
      runtimeId: sourceRuntimeId,
      recordId: normalized.storageCommitResult.recordId,
      archiveItemId: normalized.storageCommitResult.teachingArchiveCommit.archiveItem.id,
      sourcePersistenceCommandRecordId: normalized.storageCommitResult.sourcePersistenceCommand.recordId,
      sourceControlledDraftArtifactId: normalized.storageCommitResult.sourceControlledFeedbackDraft.artifactId,
      targetUseCase: normalized.storageCommitResult.teachingArchiveCommit.targetUseCase,
      targetRepository: normalized.storageCommitResult.teachingArchiveCommit.targetRepository,
    },
    sourcePublicationApproval: normalized.storageCommitResult.sourcePublicationApproval,
    sourceControlledFeedbackDraft: normalized.storageCommitResult.sourceControlledFeedbackDraft,
    teachingArchivePhysicalRow: {
      operationId: "getTeachingArchiveItemById",
      targetRepository: verified.source.repositoryMethod,
      targetTable: verified.source.targetTable,
      archiveItem: verified.row,
    },
    learnerFeedbackSnapshot: normalized.storageCommitResult.learnerFeedbackSnapshot,
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.storageCommitResult.evidenceRefs,
        `evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source-input-hash:${normalized.verificationInputHash}`,
        `evidence:runtime:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID}`,
        `evidence:command-port:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_CONTROLLED_DRAFT_SOURCE_PORT}`,
        `evidence:archive-storage-commit-controlled-draft-source-record:${normalized.storageCommitResult.recordId}`,
        `evidence:source-controlled-draft:${normalized.storageCommitResult.sourceControlledFeedbackDraft.artifactId}`,
        `evidence:teaching-archive-physical-row:${verified.row.id}`,
      ]),
      idempotencyKey: normalized.idempotencyKey,
      verificationInputHash: normalized.verificationInputHash,
    },
    boundary: buildBoundary(),
  };
}

function buildBoundary() {
  return {
    storageCommitControlledDraftSourceVerified: true,
    archivePersistenceCommandControlledDraftSourceVerified: true,
    controlledDraftSourceVerified: true,
    sourceControlledDraftEvidencePreserved: true,
    teachingArchiveRowReadPortInvoked: true,
    teachingArchiveRepositoryGetByIDUsed: true,
    committedArchiveItemMatchedPhysicalRow: true,
    publicationApprovalPreserved: true,
    learnerFeedbackEvidencePreserved: true,
    safeLearnerFeedbackOnly: true,
    studentOwnScopeEnforced: true,
    mainDatabaseWriteCommitted: true,
    mainDatabaseReadAllowed: true,
    physicalDatabaseRowVerified: true,
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
    sourceStorageCommit: record.sourceStorageCommit,
    sourcePublicationApproval: record.sourcePublicationApproval,
    sourceControlledFeedbackDraft: record.sourceControlledFeedbackDraft,
    teachingArchivePhysicalRow: record.teachingArchivePhysicalRow,
    learnerFeedbackSnapshot: record.learnerFeedbackSnapshot,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: { targetP99Ms: 50, evidenceClass: "STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_ROW_VERIFICATION_CONTROLLED_DRAFT_SOURCE_BOUNDARY" },
    nextAction: "Use this controlled-source physical row verification as Student App AI Tutor feedback archive evidence; public release and real multi-model integration remain separate slices.",
  };
}

function appendVerificationRecord(verificationLogPath, record) {
  const absolute = path.resolve(verificationLogPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.appendFileSync(absolute, `${JSON.stringify(record)}\n`);
}

function findExistingRecordByIdempotencyKey(verificationLogPath, idempotencyKey) {
  const absolute = path.resolve(verificationLogPath);
  if (!fs.existsSync(absolute)) return undefined;
  for (const line of fs.readFileSync(absolute, "utf8").split(/\r?\n/u)) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    if (record.evidence?.idempotencyKey === idempotencyKey) return record;
  }
  return undefined;
}

function assertReplayMatches(existing, normalized) {
  if (
    existing.verificationInvocationId !== normalized.verificationInvocationId ||
    existing.sourceStorageCommit?.recordId !== normalized.storageCommitResult.recordId ||
    existing.sourceStorageCommit?.sourceControlledDraftArtifactId !== normalized.storageCommitResult.sourceControlledFeedbackDraft.artifactId ||
    existing.evidence?.verificationInputHash !== normalized.verificationInputHash
  ) {
    throw verificationError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_ROW_VERIFICATION_FROM_DRAFT_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different controlled-source row verification");
  }
}

function rejectLeakedFields(value, pathLabel) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectLeakedFields(item, `${pathLabel}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "findings") continue;
    if (leakedFieldNames.includes(key)) {
      throw verificationError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_ROW_VERIFICATION_FROM_DRAFT_LEAKED_FIELD", `${pathLabel}.${key} is not allowed`);
    }
    if (typeof child === "string" && forbiddenText.test(child)) {
      throw verificationError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_ROW_VERIFICATION_FROM_DRAFT_UNSAFE_TEXT", `${pathLabel}.${key} contains unsafe feedback text`);
    }
    rejectLeakedFields(child, `${pathLabel}.${key}`);
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_ROW_VERIFICATION_FROM_DRAFT_INVALID_OBJECT", `${label} must be an object`);
  }
  return value;
}

function assertPlainObjectWithValue(value, label) {
  assertPlainObject(value, label);
  if (Object.keys(value).length === 0) {
    throw verificationError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_ROW_VERIFICATION_FROM_DRAFT_EMPTY_OBJECT", `${label} must not be empty`);
  }
  return value;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw verificationError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_ROW_VERIFICATION_FROM_DRAFT_CONST_MISMATCH", `${label} must be ${expected}`);
  }
  return actual;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string" || value.length < min || value.length > max) {
    throw verificationError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_ROW_VERIFICATION_FROM_DRAFT_INVALID_STRING", `${label} must be a string with length ${min}-${max}`);
  }
  return value;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 520);
  if (!token.startsWith(prefix)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_ROW_VERIFICATION_FROM_DRAFT_INVALID_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireEnum(value, label, allowed) {
  if (!allowed.includes(value)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_ROW_VERIFICATION_FROM_DRAFT_INVALID_ENUM", `${label} must be one of ${allowed.join(",")}`);
  }
  return value;
}

function requireSafeText(value, label, min, max) {
  const text = requireBoundedString(value, label, min, max);
  if (/[<>]/u.test(text) || forbiddenText.test(text)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_ROW_VERIFICATION_FROM_DRAFT_UNSAFE_TEXT", `${label} must be encoded safe text`);
  }
  return text;
}

function requireDateTime(value, label) {
  const text = requireBoundedString(value, label, 20, 40);
  if (Number.isNaN(Date.parse(text))) {
    throw verificationError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_ROW_VERIFICATION_FROM_DRAFT_INVALID_DATETIME", `${label} must be an ISO datetime`);
  }
  return text;
}

function uniqueStringArray(value, label, min, max) {
  if (!Array.isArray(value)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_ROW_VERIFICATION_FROM_DRAFT_INVALID_ARRAY", `${label} must be an array`);
  }
  const out = uniq(value.map((item, index) => requireBoundedString(item, `${label}[${index}]`, 1, max)));
  if (out.length < min) {
    throw verificationError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_ROW_VERIFICATION_FROM_DRAFT_ARRAY_TOO_SMALL", `${label} must have at least ${min} item(s)`);
  }
  return out;
}

function uniqueBoundedStringArray(value, label, min, maxItems, minLength, maxLength) {
  if (!Array.isArray(value) || value.length < min || value.length > maxItems) {
    throw verificationError("STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_ROW_VERIFICATION_FROM_DRAFT_INVALID_ARRAY", `${label} must contain ${min}-${maxItems} items`);
  }
  return uniq(value.map((item, index) => requireBoundedString(item, `${label}[${index}]`, minLength, maxLength)));
}

function uniq(values) {
  return [...new Set(values)];
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeToken(value) {
  return String(value).replace(/[^a-zA-Z0-9_:-]/gu, "_").slice(0, 260);
}

function verificationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
