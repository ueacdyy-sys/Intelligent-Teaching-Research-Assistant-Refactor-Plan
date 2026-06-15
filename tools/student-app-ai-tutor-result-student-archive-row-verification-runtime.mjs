import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION_RUNTIME_ID =
  "student_app_ai_tutor_result_student_archive_row_verification_runtime";
export const STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION_PORT =
  "StudentAppAITutorResultStudentArchiveRowVerificationPort.verifyTeachingArchivePhysicalRow";
export const STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION_READY =
  "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION_READY";

const inputSchemaVersion = "2026-06-08.student-app.ai-tutor-result-student-archive-row-verification.v1";
const outputSchemaVersion = "2026-06-08.student-app.ai-tutor-result-student-archive-row-verified.v1";
const storageCommitSchemaVersion = "2026-06-08.student-app.ai-tutor-result-student-archive-storage-committed.v1";
const storageCommitRuntimeId = "student_app_ai_tutor_result_student_archive_storage_commit_runtime";
const storageCommitCommandPort =
  "StudentAppAITutorResultStudentArchiveStorageCommitPort.commitTeachingArchiveCreateCommand";
const storageCommitWorkload = "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT";
const storageCommitStatus = "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMITTED";
const resultArchiveStorageCommitWorkload = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_STORAGE_COMMIT";
const resultArchiveStorageCommitRuntimeId = "student_app_ai_tutor_result_archive_student_archive_storage_commit";
const resultArchiveStorageCommitStatus = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_STORAGE_COMMITTED";
const resultArchiveSource = "AI_TUTOR_RESULT_ARCHIVE";
const resultArchiveReadyStatus = "READY_FOR_STUDENT_APP_READ";
const questionBankFeedbackStorageCommitWorkload = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_ARCHIVE_STORAGE_COMMIT";
const questionBankFeedbackStorageCommitRuntimeId = "student_app_ai_tutor_question_bank_feedback_student_archive_storage_commit";
const questionBankFeedbackStorageCommitStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_ARCHIVE_STORAGE_COMMITTED";
const questionBankFeedbackSource = "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK";
const questionBankFeedbackReadyStatus = "READY_FOR_STUDENT_APP_READ";
const verifiedStatus = "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PHYSICAL_ROW_VERIFIED";
const defaultVerificationLogPath =
  "reports/student-command-log/student-app-ai-tutor-result-student-archive-row-verification.jsonl";
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

export async function verifyStudentAppAITutorResultStudentArchivePhysicalRow(input, options = {}) {
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
  });
  const verified = assertPortResult(portResult, normalized.storageCommitResult.teachingArchiveCommit.archiveItem);
  const record = buildVerificationRecord(normalized, verified, verifiedAt);
  appendVerificationRecord(verificationLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorResultStudentArchiveRowVerification(result) {
  return [
    `Student App AI Tutor result archive row verification: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Archive item: ${result.teachingArchivePhysicalRow.archiveItem.id}`,
    `Target table: ${result.teachingArchivePhysicalRow.targetTable}`,
    `Physical row verified: ${result.boundary.physicalDatabaseRowVerified}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const verificationInvocationId = requireToken(input.verificationInvocationId, "input.verificationInvocationId", "ai_tutor_result_archive_row_verification_");
  const storageCommitReport = assertStorageCommitReport(input.studentArchiveStorageCommitReport);
  const storageCommitResult = assertStorageCommitResult(storageCommitReport);
  const verificationPolicy = assertVerificationPolicy(input.studentArchiveRowVerificationPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 280);
  if (!evidenceRefs.some((ref) => ref.includes("student-app-ai-tutor-result-student-archive-storage-commit") || ref.includes("student-app-ai-tutor-result-archive-student-archive-storage-commit") || ref.includes("student-app-ai-tutor-question-bank-feedback-student-archive-storage-commit"))) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ROW_VERIFICATION_MISSING_COMMIT_EVIDENCE", "archive storage commit evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 280);
  const verificationInputHash = hashInput({
    verificationInvocationId,
    storageCommitRecordId: storageCommitResult.recordId,
    archiveItem: storageCommitResult.teachingArchiveCommit.archiveItem,
    verificationPolicy,
  });
  return { verificationInvocationId, storageCommitReport, storageCommitResult, verificationPolicy, evidenceRefs, idempotencyKey, verificationInputHash };
}

function assertStorageCommitReport(report) {
  rejectLeakedFields(report, "input.studentArchiveStorageCommitReport");
  assertPlainObject(report, "input.studentArchiveStorageCommitReport");
  requireConst(report.readiness, "READY", "input.studentArchiveStorageCommitReport.readiness");
  if (report.workloadType === resultArchiveStorageCommitWorkload) return assertResultArchiveStorageCommitReport(report);
  if (report.workloadType === questionBankFeedbackStorageCommitWorkload) return assertQuestionBankFeedbackStorageCommitReport(report);
  requireConst(report.workloadType, storageCommitWorkload, "input.studentArchiveStorageCommitReport.workloadType");
  requireConst(report.runtime?.runtimeId, storageCommitRuntimeId, "input.studentArchiveStorageCommitReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, storageCommitCommandPort, "input.studentArchiveStorageCommitReport.runtime.commandPort");
  requireConst(report.runtime?.status, storageCommitStatus, "input.studentArchiveStorageCommitReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.studentArchiveStorageCommitReport.runtimeSlo.totalErrors");
  assertStorageCommitInvariants(report.safetyInvariants ?? {});
  return report;
}

function assertResultArchiveStorageCommitReport(report) {
  requireConst(report.runtime?.runtimeId, resultArchiveStorageCommitRuntimeId, "input.studentArchiveStorageCommitReport.runtime.runtimeId");
  requireConst(report.runtime?.sharedRuntimeId, storageCommitRuntimeId, "input.studentArchiveStorageCommitReport.runtime.sharedRuntimeId");
  requireConst(report.runtime?.commandPort, storageCommitCommandPort, "input.studentArchiveStorageCommitReport.runtime.commandPort");
  requireConst(report.runtime?.status, resultArchiveStorageCommitStatus, "input.studentArchiveStorageCommitReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.studentArchiveStorageCommitReport.runtimeSlo.totalErrors");
  const invariants = report.safetyInvariants ?? {};
  for (const field of ["source0343ResultArchiveStudentArchivePersistenceCommandRequired", "injectedTeachingArchivePortRequired", "teachingArchiveUseCasePortInvoked", "persistedOutcomeRequired", "studentArchivePersisted", "mainDatabaseWriteCommitted"]) requireConst(invariants[field], true, `input.studentArchiveStorageCommitReport.safetyInvariants.${field}`);
  requireConst(invariants.learningActionSourceRequired, resultArchiveSource, "input.studentArchiveStorageCommitReport.safetyInvariants.learningActionSourceRequired");
  requireConst(invariants.resultArchiveStatusRequired, resultArchiveReadyStatus, "input.studentArchiveStorageCommitReport.safetyInvariants.resultArchiveStatusRequired");
  for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "answerKeyDisclosureAllowed", "rawModelOutputDisclosureAllowed", "resultRefDisclosureAllowed", "promptDisclosureAllowed", "contentRefDisclosureAllowed", "modelInferenceAllowed", "retrievalAllowed", "swarmAllowed"]) requireConst(invariants[field], false, `input.studentArchiveStorageCommitReport.safetyInvariants.${field}`);
  return report;
}

function assertQuestionBankFeedbackStorageCommitReport(report) {
  requireConst(report.runtime?.runtimeId, questionBankFeedbackStorageCommitRuntimeId, "input.studentArchiveStorageCommitReport.runtime.runtimeId");
  requireConst(report.runtime?.sharedRuntimeId, storageCommitRuntimeId, "input.studentArchiveStorageCommitReport.runtime.sharedRuntimeId");
  requireConst(report.runtime?.commandPort, storageCommitCommandPort, "input.studentArchiveStorageCommitReport.runtime.commandPort");
  requireConst(report.runtime?.status, questionBankFeedbackStorageCommitStatus, "input.studentArchiveStorageCommitReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.studentArchiveStorageCommitReport.runtimeSlo.totalErrors");
  const invariants = report.safetyInvariants ?? {};
  for (const field of ["source0377QuestionBankFeedbackStudentArchivePersistenceCommandRequired", "injectedTeachingArchivePortRequired", "teachingArchiveUseCasePortInvoked", "persistedOutcomeRequired", "studentArchivePersisted", "mainDatabaseWriteCommitted"]) requireConst(invariants[field], true, `input.studentArchiveStorageCommitReport.safetyInvariants.${field}`);
  requireConst(invariants.learningActionSourceRequired, questionBankFeedbackSource, "input.studentArchiveStorageCommitReport.safetyInvariants.learningActionSourceRequired");
  requireConst(invariants.feedbackStatusRequired, questionBankFeedbackReadyStatus, "input.studentArchiveStorageCommitReport.safetyInvariants.feedbackStatusRequired");
  for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "answerKeyDisclosureAllowed", "rawModelOutputDisclosureAllowed", "resultRefDisclosureAllowed", "promptDisclosureAllowed", "contentRefDisclosureAllowed", "feedbackIdsDisclosed", "modelInferenceAllowed", "retrievalAllowed", "swarmAllowed"]) requireConst(invariants[field], false, `input.studentArchiveStorageCommitReport.safetyInvariants.${field}`);
  return report;
}

function assertStorageCommitInvariants(boundary) {
  for (const field of [
    "archivePersistenceCommandRequired",
    "injectedTeachingArchivePortRequired",
    "teachingArchiveUseCasePortInvoked",
    "teachingArchiveDomainValidationExecuted",
    "persistedOutcomeRequired",
    "safeGuidanceOnly",
    "studentArchivePersisted",
    "mainDatabaseWriteCommitted",
  ]) {
    requireConst(boundary[field], true, `input.studentArchiveStorageCommitReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "answerKeyDisclosureAllowed",
    "rawModelOutputDisclosureAllowed",
    "resultRefDisclosureAllowed",
    "promptDisclosureAllowed",
    "contentRefDisclosureAllowed",
    "modelInferenceAllowed",
    "retrievalAllowed",
    "swarmAllowed",
  ]) {
    requireConst(boundary[field], false, `input.studentArchiveStorageCommitReport.safetyInvariants.${field}`);
  }
}

function assertStorageCommitResult(report) {
  const isResultArchive = report.workloadType === resultArchiveStorageCommitWorkload;
  const isQuestionBankFeedback = report.workloadType === questionBankFeedbackStorageCommitWorkload;
  const result = (isQuestionBankFeedback
    ? report.runtimeProbes?.studentAppAiTutorQuestionBankFeedbackStudentArchiveStorageCommit
    : isResultArchive
      ? report.runtimeProbes?.studentAppAiTutorResultArchiveStudentArchiveStorageCommit
      : report.runtimeProbes?.studentAppAiTutorResultStudentArchiveStorageCommit)?.result;
  rejectLeakedFields(result, "input.studentArchiveStorageCommitReport.runtimeProbes.result");
  assertPlainObject(result, "input.studentArchiveStorageCommitReport.runtimeProbes.result");
  requireConst(result.schemaVersion, storageCommitSchemaVersion, "source.schemaVersion");
  requireConst(result.runtimeId, storageCommitRuntimeId, "source.runtimeId");
  requireConst(result.commandPort, storageCommitCommandPort, "source.commandPort");
  requireConst(result.status, storageCommitStatus, "source.status");
  requireConst(result.boundary?.archivePersistenceCommandVerified, true, "source.boundary.archivePersistenceCommandVerified");
  requireConst(result.boundary?.teachingArchiveUseCasePortInvoked, true, "source.boundary.teachingArchiveUseCasePortInvoked");
  requireConst(result.boundary?.mainDatabaseWriteCommitted, true, "source.boundary.mainDatabaseWriteCommitted");
  requireConst(result.boundary?.studentArchivePersisted, true, "source.boundary.studentArchivePersisted");
  requireConst(result.boundary?.directDatabaseAccessAllowed, false, "source.boundary.directDatabaseAccessAllowed");
  requireConst(result.boundary?.executeHttpRequestAllowed, false, "source.boundary.executeHttpRequestAllowed");
  requireConst(result.boundary?.modelInferenceStarted, false, "source.boundary.modelInferenceStarted");
  requireConst(result.boundary?.swarmAllowed, false, "source.boundary.swarmAllowed");
  const sourcePersistenceCommand = assertPlainObjectWithValue(result.sourcePersistenceCommand, "source.sourcePersistenceCommand");
  if (isResultArchive) {
    requireConst(sourcePersistenceCommand.learningActionSource, resultArchiveSource, "source.sourcePersistenceCommand.learningActionSource");
    requireConst(sourcePersistenceCommand.resultArchiveStatus, resultArchiveReadyStatus, "source.sourcePersistenceCommand.resultArchiveStatus");
    requireConst(result.safeGuidanceSnapshot?.learningActionSource, resultArchiveSource, "source.safeGuidanceSnapshot.learningActionSource");
    requireConst(result.safeGuidanceSnapshot?.resultArchiveStatus, resultArchiveReadyStatus, "source.safeGuidanceSnapshot.resultArchiveStatus");
  }
  if (isQuestionBankFeedback) {
    requireConst(sourcePersistenceCommand.learningActionSource, questionBankFeedbackSource, "source.sourcePersistenceCommand.learningActionSource");
    requireConst(sourcePersistenceCommand.feedbackStatus, questionBankFeedbackReadyStatus, "source.sourcePersistenceCommand.feedbackStatus");
    requireConst(result.safeGuidanceSnapshot?.learningActionSource, questionBankFeedbackSource, "source.safeGuidanceSnapshot.learningActionSource");
    requireConst(result.safeGuidanceSnapshot?.feedbackStatus, questionBankFeedbackReadyStatus, "source.safeGuidanceSnapshot.feedbackStatus");
  }
  const commit = assertTeachingArchiveCommit(result.teachingArchiveCommit);
  const safeGuidance = assertSafeGuidanceSnapshot(result.safeGuidanceSnapshot, sourcePersistenceCommand);
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "source.recordId", 1, 280),
    idempotencyKey: requireBoundedString(result.idempotencyKey, "source.idempotencyKey", 1, 280),
    sourcePersistenceCommand,
    teachingArchiveCommit: commit,
    safeGuidanceSnapshot: safeGuidance,
    evidenceRefs: uniqueStringArray(result.evidenceRefs, "source.evidenceRefs", 1, 1400),
  };
}

function assertTeachingArchiveCommit(commit) {
  assertPlainObject(commit, "source.teachingArchiveCommit");
  requireConst(commit.operationId, "createTeachingArchiveItem", "source.teachingArchiveCommit.operationId");
  requireConst(commit.targetUseCase, "CreateArchiveItem.ExecuteWithPersistence", "source.teachingArchiveCommit.targetUseCase");
  requireConst(commit.targetRepository, "ArchiveRepository.Create", "source.teachingArchiveCommit.targetRepository");
  requireConst(commit.targetTable, "teaching_archive_items", "source.teachingArchiveCommit.targetTable");
  return {
    ...commit,
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

function assertSafeGuidanceSnapshot(snapshot, sourceCommand) {
  assertPlainObject(snapshot, "source.safeGuidanceSnapshot");
  requireConst(snapshot.safeGuidanceOnly, true, "source.safeGuidanceSnapshot.safeGuidanceOnly");
  requireConst(snapshot.guidanceSectionsHash, sourceCommand.guidanceSectionsHash, "source.safeGuidanceSnapshot.guidanceSectionsHash");
  return snapshot;
}

function assertVerificationPolicy(policy) {
  assertPlainObject(policy, "input.studentArchiveRowVerificationPolicy");
  for (const field of [
    "storageCommitRequired",
    "physicalRowVerificationRequired",
    "injectedTeachingArchiveRowReadPortRequired",
    "teachingArchiveRepositoryReadRequired",
    "committedArchiveItemMatchRequired",
    "preserveSafeGuidanceRequired",
    "preserveStudentVisibilityEvidenceRequired",
    "studentOwnScopeRequired",
    "idempotentRowVerificationRequired",
    "mainDatabaseReadAllowed",
  ]) {
    requireConst(policy[field], true, `input.studentArchiveRowVerificationPolicy.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "modelInferenceAllowed",
    "answerKeyDisclosureAllowed",
    "rawModelOutputDisclosureAllowed",
    "resultRefDisclosureAllowed",
    "promptDisclosureAllowed",
    "contentRefDisclosureAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.studentArchiveRowVerificationPolicy.${field}`);
  }
  return { ...policy };
}

function assertRowReadPort(port) {
  if (!port || typeof port.getArchiveItemById !== "function") {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ROW_VERIFICATION_MISSING_PORT", "TeachingArchiveRowReadPort.getArchiveItemById is required");
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
  const id = requireBoundedString(item.id, `${label}.id`, 1, 128);
  if (!id.startsWith("tarch_")) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ROW_VERIFICATION_INVALID_ARCHIVE_ID", "archive item id must use tarch_ prefix");
  }
  return {
    id,
    ownerType: requireConst(item.ownerType, "STUDENT", `${label}.ownerType`),
    studentId: requireBoundedString(item.studentId, `${label}.studentId`, 1, 128),
    materialType: requireConst(item.materialType, "HOMEWORK", `${label}.materialType`),
    title: requireSafeText(item.title, `${label}.title`, 1, 200),
    source: requireConst(item.source, "SYSTEM_IMPORT", `${label}.source`),
    contentRef: requireContentRef(item.contentRef, `${label}.contentRef`),
    tags: uniqueBoundedStringArray(item.tags ?? [], `${label}.tags`, 4, 4, 1, 64),
    analysisIntents: uniqueStringArray(item.analysisIntents ?? [], `${label}.analysisIntents`, 2, 2),
    ocrStatus: requireConst(item.ocrStatus, "NOT_REQUIRED", `${label}.ocrStatus`),
    createdAt: requireDateTime(item.createdAt, `${label}.createdAt`),
  };
}

function requireContentRef(value, label) {
  const ref = requireBoundedString(value, label, 1, 1000);
  if (!ref.startsWith("student-ai-tutor-result-archive:")) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ROW_VERIFICATION_CONTENT_REF", `${label} must be a Student App AI Tutor result archive ref`);
  }
  return ref;
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
    recordType: "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION",
    recordId: `student_app_ai_tutor_result_student_archive_row_verification_${safeToken(normalized.idempotencyKey)}`,
    recordedAt: verifiedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION_PORT,
    status: verifiedStatus,
    verificationInvocationId: normalized.verificationInvocationId,
    sourceStorageCommit: {
      runtimeId: storageCommitRuntimeId,
      commitRecordId: normalized.storageCommitResult.recordId,
      archiveItemId: normalized.storageCommitResult.teachingArchiveCommit.archiveItem.id,
      sourcePersistenceCommandRecordId: normalized.storageCommitResult.sourcePersistenceCommand.recordId,
      targetUseCase: normalized.storageCommitResult.teachingArchiveCommit.targetUseCase,
      targetRepository: normalized.storageCommitResult.teachingArchiveCommit.targetRepository,
      learningActionSource: normalized.storageCommitResult.sourcePersistenceCommand.learningActionSource,
      resultArchiveStatus: normalized.storageCommitResult.sourcePersistenceCommand.resultArchiveStatus,
      feedbackStatus: normalized.storageCommitResult.sourcePersistenceCommand.feedbackStatus,
    },
    teachingArchivePhysicalRow: {
      operationId: "getTeachingArchiveItemById",
      targetRepository: verified.source.repositoryMethod,
      targetTable: verified.source.targetTable,
      archiveItem: verified.row,
    },
    safeGuidanceSnapshot: normalized.storageCommitResult.safeGuidanceSnapshot,
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.storageCommitResult.evidenceRefs,
        `evidence:student-app-ai-tutor-result-student-archive-row-verification-input-hash:${normalized.verificationInputHash}`,
        `evidence:runtime:${STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION_RUNTIME_ID}`,
        `evidence:command-port:${STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION_PORT}`,
        `evidence:result-archive-storage-commit-record:${normalized.storageCommitResult.recordId}`,
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
    storageCommitVerified: true,
    teachingArchiveRowReadPortInvoked: true,
    teachingArchiveRepositoryGetByIDUsed: true,
    committedArchiveItemMatchedPhysicalRow: true,
    safeGuidanceEvidencePreserved: true,
    studentVisibilityEvidencePreserved: true,
    studentOwnScopeEnforced: true,
    studentArchivePersisted: true,
    mainDatabaseWriteCommitted: true,
    mainDatabaseReadAllowed: true,
    physicalDatabaseRowVerified: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    modelInferenceStarted: false,
    answerKeyDisclosed: false,
    promptDisclosed: false,
    contentRefDisclosed: false,
    rawModelOutputDisclosed: false,
    resultRefDisclosed: false,
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
    teachingArchivePhysicalRow: record.teachingArchivePhysicalRow,
    safeGuidanceSnapshot: record.safeGuidanceSnapshot,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 50,
      evidenceClass: "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ROW_VERIFICATION_BOUNDARY",
    },
    nextAction: "Use this as physical Teaching Archive row evidence for Student App AI Tutor result archive; real model scoring and public product release remain separate slices.",
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
    if (record?.recordType === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.verificationInvocationId !== normalized.verificationInvocationId ||
    existing.sourceStorageCommit?.commitRecordId !== normalized.storageCommitResult.recordId ||
    existing.sourceStorageCommit?.archiveItemId !== normalized.storageCommitResult.teachingArchiveCommit.archiveItem.id ||
    existing.evidence?.verificationInputHash !== normalized.verificationInputHash) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ROW_VERIFICATION_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different row verification");
  }
}

function rejectLeakedFields(value, label) {
  if (!value || typeof value !== "object") return;
  const keys = collectKeys(value);
  for (const field of leakedFieldNames) {
    if (keys.has(field)) {
      throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ROW_VERIFICATION_LEAKED_FIELD", `${label}.${field} is not allowed`);
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
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ROW_VERIFICATION_INVALID_OBJECT", `${label} must be an object`);
  }
}

function assertPlainObjectWithValue(value, label) {
  assertPlainObject(value, label);
  return value;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ROW_VERIFICATION_CONST", `${label} must be ${String(expected)}`);
  }
  return expected;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string") {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ROW_VERIFICATION_STRING", `${label} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ROW_VERIFICATION_STRING_LENGTH", `${label} length is invalid`);
  }
  return trimmed;
}

function requireSafeText(value, label, min, max) {
  const text = requireBoundedString(value, label, min, max);
  if (/[<>]/u.test(text)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ROW_VERIFICATION_UNSAFE_TEXT", `${label} must be encoded safe text`);
  }
  return text;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 280);
  if (!token.startsWith(prefix)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ROW_VERIFICATION_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireDateTime(value, label) {
  const text = requireBoundedString(value, label, 1, 80);
  if (Number.isNaN(Date.parse(text))) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ROW_VERIFICATION_DATE", `${label} must be an ISO date-time`);
  }
  return text;
}

function uniqueStringArray(values, label, min, max) {
  if (!Array.isArray(values) || values.length < min || values.length > max) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ROW_VERIFICATION_ARRAY", `${label} length is invalid`);
  }
  const normalized = values.map((value, index) => requireBoundedString(value, `${label}[${index}]`, 1, 1400));
  if (new Set(normalized).size !== normalized.length) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ROW_VERIFICATION_ARRAY_UNIQUE", `${label} must be unique`);
  }
  return normalized;
}

function uniqueBoundedStringArray(values, label, minItems, maxItems, minLength, maxLength) {
  return uniqueStringArray(values, label, minItems, maxItems)
    .map((value, index) => requireBoundedString(value, `${label}[${index}]`, minLength, maxLength));
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

function verificationError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
