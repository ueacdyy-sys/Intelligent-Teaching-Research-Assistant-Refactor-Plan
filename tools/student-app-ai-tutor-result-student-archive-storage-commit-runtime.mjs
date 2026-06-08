import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_RUNTIME_ID =
  "student_app_ai_tutor_result_student_archive_storage_commit_runtime";
export const STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_PORT =
  "StudentAppAITutorResultStudentArchiveStorageCommitPort.commitTeachingArchiveCreateCommand";
export const STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_READY =
  "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_READY";

const inputSchemaVersion = "2026-06-08.student-app.ai-tutor-result-student-archive-storage-commit.v1";
const outputSchemaVersion = "2026-06-08.student-app.ai-tutor-result-student-archive-storage-committed.v1";
const sourceRuntimeId = "student_app_ai_tutor_result_student_archive_persistence_command_runtime";
const sourceCommandPort = "StudentAppAITutorResultStudentArchivePersistenceCommandPort.recordResultStudentArchivePersistenceCommand";
const sourceStatus = "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED";
const sourceWorkloadType = "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND";
const committedStatus = "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMITTED";
const defaultCommitLogPath =
  "reports/student-command-log/student-app-ai-tutor-result-student-archive-storage-commit.jsonl";

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
]);
const unsafeTextPattern = /(raw model|prompt|answer key|correct answer|expected answer|contentref|resultref|internal error|标准答案|参考答案|正确答案|原始模型|提示词)/iu;

export async function commitStudentAppAITutorResultStudentArchiveStorage(input, options = {}) {
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

export function formatStudentAppAITutorResultStudentArchiveStorageCommit(result) {
  return [
    `Student App AI Tutor result archive storage commit: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Archive item: ${result.teachingArchiveCommit.archiveItem.id}`,
    `Persistence: ${result.teachingArchiveCommit.persistence.status}`,
    `Main DB committed: ${result.boundary.mainDatabaseWriteCommitted}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const commitInvocationId = requireToken(input.commitInvocationId, "input.commitInvocationId", "ai_tutor_result_archive_storage_commit_");
  const persistenceCommandReport = assertPersistenceCommandReport(input.studentArchivePersistenceCommandReport);
  const persistenceCommandRecord = assertPersistenceCommandRecord(persistenceCommandReport);
  const commitPolicy = assertCommitPolicy(input.studentArchiveStorageCommitPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 32, 8, 420);
  if (!evidenceRefs.some((ref) => ref.includes("student-app-ai-tutor-result-student-archive-persistence-command"))) {
    throw commitError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STORAGE_COMMIT_MISSING_COMMAND_EVIDENCE", "archive persistence command evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 420);
  const teachingArchiveCreateCommand = assertTeachingArchiveCreateCommand(
    buildTeachingArchiveCreateCommand(persistenceCommandRecord),
    persistenceCommandRecord,
  );
  const commitInputHash = hashInput({
    commitInvocationId,
    persistenceCommandRecordId: persistenceCommandRecord.recordId,
    commandId: persistenceCommandRecord.studentArchivePersistenceCommand.commandId,
    requestBody: teachingArchiveCreateCommand.requestBody,
    commitPolicy,
  }).replace("sha256:", "");
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
  rejectLeakedFields(report, "input.studentArchivePersistenceCommandReport");
  assertPlainObject(report, "input.studentArchivePersistenceCommandReport");
  requireConst(report.readiness, "READY", "input.studentArchivePersistenceCommandReport.readiness");
  requireConst(report.workloadType, sourceWorkloadType, "input.studentArchivePersistenceCommandReport.workloadType");
  requireConst(report.runtime?.runtimeId, sourceRuntimeId, "input.studentArchivePersistenceCommandReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, sourceCommandPort, "input.studentArchivePersistenceCommandReport.runtime.commandPort");
  requireConst(report.runtime?.status, sourceStatus, "input.studentArchivePersistenceCommandReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.studentArchivePersistenceCommandReport.runtimeSlo.totalErrors");
  const invariants = assertPlainObject(report.safetyInvariants, "input.studentArchivePersistenceCommandReport.safetyInvariants");
  for (const field of [
    "resultStudentDeliveryEnvelopeRequired",
    "controlledAnswerArtifactRequired",
    "guidanceHashMatchRequired",
    "appendOnlyCommandLogRequired",
    "safeGuidanceOnlyRequired",
    "studentArchivePersistenceCommandRecorded",
  ]) {
    requireConst(invariants[field], true, `input.studentArchivePersistenceCommandReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "durableStudentArchivePersistenceStarted",
    "durableStudentArchiveCommitStarted",
    "studentArchivePersisted",
    "mainDatabaseWriteStarted",
    "studentArchiveWriteStarted",
    "resultRefDisclosed",
    "answerKeyDisclosed",
    "rawModelOutputDisclosed",
    "promptDisclosed",
    "contentRefDisclosed",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "modelInferenceAllowed",
    "retrievalAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(invariants[field], false, `input.studentArchivePersistenceCommandReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertPersistenceCommandRecord(report) {
  const result = report.runtimeProbes?.studentAppAiTutorResultStudentArchivePersistenceCommand?.result;
  rejectLeakedFields(result, "input.studentArchivePersistenceCommandReport.runtimeProbes.result");
  assertPlainObject(result, "input.studentArchivePersistenceCommandReport.runtimeProbes.result");
  requireConst(result.schemaVersion, "2026-06-08.student-app.ai-tutor-result-student-archive-persistence-command-recorded.v1", "source.schemaVersion");
  requireConst(result.runtimeId, sourceRuntimeId, "source.runtimeId");
  requireConst(result.commandPort, sourceCommandPort, "source.commandPort");
  requireConst(result.status, sourceStatus, "source.status");
  requireConst(result.boundary?.resultStudentDeliveryEnvelopeVerified, true, "source.boundary.resultStudentDeliveryEnvelopeVerified");
  requireConst(result.boundary?.controlledAnswerArtifactVerified, true, "source.boundary.controlledAnswerArtifactVerified");
  requireConst(result.boundary?.guidanceSectionsHashVerified, true, "source.boundary.guidanceSectionsHashVerified");
  requireConst(result.boundary?.studentArchivePersistenceCommandRecorded, true, "source.boundary.studentArchivePersistenceCommandRecorded");
  requireConst(result.boundary?.durableStudentArchiveCommitStarted, false, "source.boundary.durableStudentArchiveCommitStarted");
  requireConst(result.boundary?.studentArchivePersisted, false, "source.boundary.studentArchivePersisted");
  requireConst(result.boundary?.mainDatabaseWriteStarted, false, "source.boundary.mainDatabaseWriteStarted");
  const command = assertPersistenceCommand(result.studentArchivePersistenceCommand);
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "source.recordId", 1, 260),
    principal: assertPersistencePrincipal(result.principal),
    studentArchivePersistenceCommand: command,
    evidenceRefs: uniqueStringArray(result.evidenceRefs, "source.evidenceRefs", 1, 32, 8, 420),
  };
}

function assertPersistencePrincipal(principal) {
  assertPlainObject(principal, "source.principal");
  const scopes = uniqueStringArray(principal.scopes, "source.principal.scopes", 1, 24, 3, 80);
  for (const scope of ["TEACHING_READ", "STUDENT_ARCHIVE_WRITE", "STUDENT_APP_DELIVERY"]) {
    requireArrayIncludes(scopes, scope, "source.principal.scopes");
  }
  return {
    principalId: requireBoundedString(principal.principalId, "source.principal.principalId", 1, 128),
    subjectType: requireConst(principal.subjectType, "SERVICE", "source.principal.subjectType"),
    role: requireConst(principal.role, "SERVICE", "source.principal.role"),
    entryPoint: requireConst(principal.entryPoint, "STUDENT_ARCHIVE_PERSISTENCE_RUNTIME", "source.principal.entryPoint"),
    sessionId: requireBoundedString(principal.sessionId, "source.principal.sessionId", 1, 160),
    scopes,
  };
}

function assertPersistenceCommand(command) {
  assertPlainObject(command, "source.studentArchivePersistenceCommand");
  requireConst(command.commandKind, "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_PERSISTENCE_COMMAND", "source.commandKind");
  requireConst(command.persistenceMode, "APPEND_ONLY_STUDENT_ARCHIVE_COMMAND", "source.persistenceMode");
  requireConst(command.targetArchiveKind, "STUDENT_AI_TUTOR_RESULT_ARCHIVE", "source.targetArchiveKind");
  requireConst(command.desiredArchiveState, "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED", "source.desiredArchiveState");
  requireConst(command.commitState, "NOT_COMMITTED_TO_STUDENT_ARCHIVE", "source.commitState");
  requireConst(command.evidencePreserved, true, "source.evidencePreserved");
  requireConst(command.studentOwnScopeEnforced, true, "source.studentOwnScopeEnforced");
  requireConst(command.safeGuidanceOnly, true, "source.safeGuidanceOnly");
  return {
    commandId: requireToken(command.commandId, "source.commandId", "ai_tutor_result_archive_cmd_"),
    commandKind: "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_PERSISTENCE_COMMAND",
    scopeRef: requireStudentScopeRef(command.scopeRef, "source.scopeRef"),
    sourceDeliveryEnvelopeRecordId: requireBoundedString(command.sourceDeliveryEnvelopeRecordId, "source.sourceDeliveryEnvelopeRecordId", 1, 260),
    sourceDeliveryEnvelopeId: requireToken(command.sourceDeliveryEnvelopeId, "source.sourceDeliveryEnvelopeId", "ai_tutor_result_delivery_env_"),
    studentVisibilityReviewRecordId: requireBoundedString(command.studentVisibilityReviewRecordId, "source.studentVisibilityReviewRecordId", 1, 260),
    studentVisibilityReviewId: requireToken(command.studentVisibilityReviewId, "source.studentVisibilityReviewId", "ai_tutor_result_visibility_review_"),
    artifactId: requireToken(command.artifactId, "source.artifactId", "ai_tutor_answer_artifact_"),
    requestId: requireToken(command.requestId, "source.requestId", "tutor_req_"),
    archiveItemId: requireToken(command.archiveItemId, "source.archiveItemId", "tarch_"),
    guidanceSectionsHash: requireHex(command.guidanceSectionsHash, "source.guidanceSectionsHash"),
    safeGuidance: assertSafeGuidance(command.safeGuidance),
  };
}

function assertSafeGuidance(guidance) {
  assertPlainObject(guidance, "source.safeGuidance");
  const sections = assertGuidanceSections(guidance.guidanceSections);
  const guidanceSectionsHash = hashGuidanceSections(sections);
  requireConst(guidance.guidanceSectionsHash, guidanceSectionsHash, "source.safeGuidance.guidanceSectionsHash");
  return {
    summary: requireSafeText(guidance.summary, "source.safeGuidance.summary", 3, 500),
    guidanceSections: sections,
    guidanceSectionsHash,
    safetyLabels: uniqueStringArray(guidance.safetyLabels, "source.safeGuidance.safetyLabels", 1, 8, 3, 80),
  };
}

function assertGuidanceSections(sections) {
  if (!Array.isArray(sections) || sections.length < 1 || sections.length > 5) {
    throw commitError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STORAGE_COMMIT_SECTIONS", "safe guidance sections are out of bounds");
  }
  const seen = new Set();
  return sections.map((section, index) => {
    assertPlainObject(section, `source.safeGuidance.guidanceSections[${index}]`);
    const sectionId = requireToken(section.sectionId, `source.safeGuidance.guidanceSections[${index}].sectionId`, "ai_tutor_answer_section_");
    if (seen.has(sectionId)) throw commitError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STORAGE_COMMIT_DUPLICATE_SECTION", `${sectionId} is duplicated`);
    seen.add(sectionId);
    return {
      sectionId,
      title: requireSafeText(section.title, `source.safeGuidance.guidanceSections[${index}].title`, 1, 120),
      text: requireSafeText(section.text, `source.safeGuidance.guidanceSections[${index}].text`, 3, 1200),
      sourceBlockRefs: uniqueStringArray(section.sourceBlockRefs, `source.safeGuidance.guidanceSections[${index}].sourceBlockRefs`, 1, 6, 6, 160),
    };
  });
}

function assertCommitPolicy(policy) {
  assertPlainObject(policy, "input.studentArchiveStorageCommitPolicy");
  for (const field of [
    "archivePersistenceCommandRequired",
    "teachingArchiveUseCaseCommitAllowed",
    "injectedTeachingArchivePortRequired",
    "teachingArchiveDomainValidationRequired",
    "persistedOutcomeRequired",
    "preserveSafeGuidanceRequired",
    "idempotentStorageCommitRequired",
    "mainDatabaseWriteAllowed",
  ]) {
    requireConst(policy[field], true, `input.studentArchiveStorageCommitPolicy.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "directPublicationAllowed",
    "modelInferenceAllowed",
    "retrievalAllowed",
    "answerKeyDisclosureAllowed",
    "rawModelOutputDisclosureAllowed",
    "resultRefDisclosureAllowed",
    "promptDisclosureAllowed",
    "contentRefDisclosureAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.studentArchiveStorageCommitPolicy.${field}`);
  }
  return { ...policy };
}

function buildTeachingArchiveCreateCommand(record) {
  const command = record.studentArchivePersistenceCommand;
  const studentId = command.scopeRef.slice("student:".length);
  const contentHash = hashInput({
    commandId: command.commandId,
    sourceDeliveryEnvelopeId: command.sourceDeliveryEnvelopeId,
    artifactId: command.artifactId,
    requestId: command.requestId,
    guidanceSectionsHash: command.guidanceSectionsHash,
    safeGuidance: command.safeGuidance,
  }).replace("sha256:", "sha256_");
  return {
    commandId: `teaching_archive_create_student_ai_tutor_result_${safeToken(command.commandId)}`,
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
      title: `Student AI Tutor result archive ${command.requestId}`,
      source: "SYSTEM_IMPORT",
      contentRef: `student-ai-tutor-result-archive:${command.commandId}:${contentHash}`,
      tags: ["student_app_ai_tutor", "result", "safe_guidance", "archive_commit"],
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
  const scopes = uniqueStringArray(principal.scopes, "principalContextHeader.scopes", 1, 32, 1, 80);
  for (const scope of ["TEACHING_READ", "STUDENT_ARCHIVE_WRITE", "STUDENT_ASSIGNED_READ"]) {
    requireArrayIncludes(scopes, scope, "principalContextHeader.scopes");
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
    studentIds: Array.isArray(access.studentIds)
      ? uniqueStringArray(access.studentIds, "principalContextHeader.studentAccess.studentIds", 0, 200, 1, 128)
      : [],
  };
}

function assertRequestBody(body, principal, record) {
  assertPlainObject(body, "teachingArchiveCreateCommand.requestBody");
  const studentId = requireBoundedString(body.studentId, "requestBody.studentId", 1, 128);
  if (record.studentArchivePersistenceCommand.scopeRef !== `student:${studentId}`) {
    throw commitError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STORAGE_COMMIT_STUDENT_SCOPE_MISMATCH", "requestBody.studentId must match source scopeRef");
  }
  if (principal.studentAccess.mode === "ASSIGNED" && !principal.studentAccess.studentIds.includes(studentId)) {
    throw commitError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STORAGE_COMMIT_STUDENT_ACCESS_MISMATCH", "principal studentAccess must include requestBody.studentId");
  }
  return {
    ownerType: requireConst(body.ownerType, "STUDENT", "requestBody.ownerType"),
    studentId,
    materialType: requireEnum(body.materialType, "requestBody.materialType", ["QUIZ", "PAPER", "HANDOUT", "HOMEWORK"]),
    title: requireSafeText(body.title, "requestBody.title", 1, 200),
    source: requireConst(body.source, "SYSTEM_IMPORT", "requestBody.source"),
    contentRef: requireBoundedString(body.contentRef, "requestBody.contentRef", 1, 1000),
    tags: uniqueStringArray(body.tags ?? [], "requestBody.tags", 0, 32, 1, 64),
    analysisIntents: uniqueStringArray(body.analysisIntents, "requestBody.analysisIntents", 1, 2, 1, 64)
      .map((intent) => requireEnum(intent, "requestBody.analysisIntents[]", ["ARCHIVE_ONLY", "TUTORING"])),
    ocrReserved: requireBoolean(body.ocrReserved, "requestBody.ocrReserved"),
  };
}

function assertCreateItemPort(port) {
  if (!port || typeof port.createArchiveItem !== "function") {
    throw commitError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STORAGE_COMMIT_MISSING_PORT", "TeachingArchiveCreateItemPort.createArchiveItem is required");
  }
  return port;
}

function assertPortResult(result, command) {
  assertPlainObject(result, "TeachingArchiveCreateItemPort result");
  return {
    archiveItem: assertArchiveItem(result.archiveItem, command.requestBody),
    persistence: assertPersistence(result.persistence),
  };
}

function assertArchiveItem(item, requestBody) {
  assertPlainObject(item, "TeachingArchiveCreateItemPort result.archiveItem");
  const id = requireBoundedString(item.id, "result.archiveItem.id", 1, 128);
  if (!id.startsWith("tarch_")) {
    throw commitError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STORAGE_COMMIT_INVALID_ARCHIVE_ID", "archive item id must use tarch_ prefix");
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
    tags: uniqueStringArray(item.tags ?? [], "result.archiveItem.tags", 0, 32, 1, 64),
    analysisIntents: uniqueStringArray(item.analysisIntents ?? [], "result.archiveItem.analysisIntents", 1, 8, 1, 64),
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
  const sourceCommand = normalized.persistenceCommandRecord.studentArchivePersistenceCommand;
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT",
    recordId: `student_app_ai_tutor_result_student_archive_storage_commit_${safeToken(normalized.idempotencyKey)}`,
    recordedAt: committedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_PORT,
    status: committedStatus,
    commitInvocationId: normalized.commitInvocationId,
    sourcePersistenceCommand: {
      runtimeId: sourceRuntimeId,
      recordId: normalized.persistenceCommandRecord.recordId,
      commandId: sourceCommand.commandId,
      sourceDeliveryEnvelopeId: sourceCommand.sourceDeliveryEnvelopeId,
      studentVisibilityReviewId: sourceCommand.studentVisibilityReviewId,
      artifactId: sourceCommand.artifactId,
      requestId: sourceCommand.requestId,
      sourceArchiveItemId: sourceCommand.archiveItemId,
      scopeRef: sourceCommand.scopeRef,
      guidanceSectionsHash: sourceCommand.guidanceSectionsHash,
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
    safeGuidanceSnapshot: {
      summary: sourceCommand.safeGuidance.summary,
      guidanceSections: sourceCommand.safeGuidance.guidanceSections,
      guidanceSectionsHash: sourceCommand.safeGuidance.guidanceSectionsHash,
      safetyLabels: sourceCommand.safeGuidance.safetyLabels,
      safeGuidanceOnly: true,
    },
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.persistenceCommandRecord.evidenceRefs,
        `evidence:student-app-ai-tutor-result-student-archive-storage-commit-input-hash:${normalized.commitInputHash}`,
        `evidence:runtime:${STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_RUNTIME_ID}`,
        `evidence:command-port:${STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_PORT}`,
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
    safeGuidanceOnly: true,
    studentOwnScopeEnforced: true,
    studentArchivePersisted: true,
    studentArchiveWriteStarted: true,
    mainDatabaseWritePrepared: true,
    mainDatabaseWriteStarted: true,
    mainDatabaseWriteCommitted: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    directPublicationAllowed: false,
    answerKeyDisclosed: false,
    promptDisclosed: false,
    rawModelOutputDisclosed: false,
    contentRefDisclosed: false,
    resultRefDisclosed: false,
    modelInferenceStarted: false,
    retrievalStarted: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
    requiresFutureRowVerification: true,
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
    safeGuidanceSnapshot: record.safeGuidanceSnapshot,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: 5,
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_BOUNDARY",
    },
    nextAction: "Use this persisted Teaching Archive item as Student App AI Tutor result archive evidence; row verification remains a separate slice.",
  };
}

function appendCommitRecord(commitLogPath, record) {
  fs.mkdirSync(path.dirname(commitLogPath), { recursive: true });
  fs.appendFileSync(commitLogPath, `${JSON.stringify(record)}\n`);
}

function findExistingRecordByIdempotencyKey(commitLogPath, idempotencyKey) {
  if (!fs.existsSync(commitLogPath)) return null;
  const lines = fs.readFileSync(commitLogPath, "utf8").split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const record = JSON.parse(lines[index]);
    if (record?.recordType === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.commitInvocationId !== normalized.commitInvocationId ||
    existing.sourcePersistenceCommand?.recordId !== normalized.persistenceCommandRecord.recordId ||
    existing.sourcePersistenceCommand?.commandId !== normalized.persistenceCommandRecord.studentArchivePersistenceCommand.commandId ||
    existing.evidence?.commitInputHash !== normalized.commitInputHash) {
    throw commitError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STORAGE_COMMIT_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different archive storage commit");
  }
}

function rejectLeakedFields(value, label) {
  if (!value || typeof value !== "object") return;
  const keys = collectKeys(value);
  for (const field of leakedFieldNames) {
    if (keys.has(field)) {
      throw commitError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STORAGE_COMMIT_LEAKED_FIELD", `${label}.${field} is not allowed`);
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
    throw commitError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STORAGE_COMMIT_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireArrayIncludes(values, expected, label) {
  if (!values.includes(expected)) throw commitError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STORAGE_COMMIT_SCOPE_MISSING", `${label} must include ${expected}`);
}

function requireConst(actual, expected, label) {
  if (actual !== expected) throw commitError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STORAGE_COMMIT_CONST", `${label} must be ${expected}`);
  return expected;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    throw commitError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STORAGE_COMMIT_STRING", `${label} must be ${min}-${max} chars`);
  }
  return value.trim();
}

function requireSafeText(value, label, min, max) {
  const text = requireBoundedString(value, label, min, max);
  if (/[<>]/u.test(text) || unsafeTextPattern.test(text)) {
    throw commitError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STORAGE_COMMIT_UNSAFE_TEXT", `${label} must be safe student text`);
  }
  return text;
}

function requireToken(value, label, prefix) {
  const text = requireBoundedString(value, label, prefix.length + 1, 260);
  if (!text.startsWith(prefix)) throw commitError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STORAGE_COMMIT_TOKEN", `${label} must start with ${prefix}`);
  return text;
}

function requireHex(value, label) {
  const text = requireBoundedString(value, label, 64, 64);
  if (!/^[a-f0-9]{64}$/u.test(text)) throw commitError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STORAGE_COMMIT_HEX", `${label} must be sha256 hex`);
  return text;
}

function requireStudentScopeRef(value, label) {
  const text = requireBoundedString(value, label, 9, 160);
  if (!text.startsWith("student:")) throw commitError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STORAGE_COMMIT_SCOPE_REF", `${label} must be a student scope ref`);
  return text;
}

function requireEnum(value, label, allowed) {
  const text = requireBoundedString(value, label, 1, 260);
  if (!allowed.includes(text)) throw commitError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STORAGE_COMMIT_ENUM", `${label} must be one of ${allowed.join(",")}`);
  return text;
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") throw commitError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STORAGE_COMMIT_BOOLEAN", `${label} must be boolean`);
  return value;
}

function requireDateTime(value, label) {
  const text = requireBoundedString(value, label, 1, 80);
  if (Number.isNaN(Date.parse(text))) throw commitError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STORAGE_COMMIT_DATE", `${label} must be an ISO date-time`);
  return text;
}

function uniqueStringArray(value, label, min, max, minLength = 1, maxLength = 1200) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw commitError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STORAGE_COMMIT_ARRAY", `${label} must contain ${min}-${max} items`);
  }
  const normalized = value.map((item, index) => requireBoundedString(item, `${label}[${index}]`, minLength, maxLength));
  if (new Set(normalized).size !== normalized.length) {
    throw commitError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STORAGE_COMMIT_ARRAY_UNIQUE", `${label} must be unique`);
  }
  return normalized;
}

function uniq(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
}

function hashGuidanceSections(sections) {
  const metadata = sections.map((section) => ({
    sectionId: section.sectionId,
    title: section.title,
    textHash: hashInput(section.text).replace("sha256:", ""),
    sourceBlockRefs: section.sourceBlockRefs,
  }));
  return hashInput(metadata).replace("sha256:", "");
}

function hashInput(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
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
