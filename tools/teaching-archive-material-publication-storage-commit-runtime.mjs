import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_RUNTIME_ID =
  "teaching_archive_material_publication_storage_commit_runtime";
export const TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_PORT =
  "TeachingArchiveMaterialPublicationStorageCommitPort.commitTeachingArchiveMaterialPublication";

const inputSchemaVersion = "2026-06-07.teaching.archive-material-publication-storage-commit.v1";
const outputSchemaVersion = "2026-06-07.teaching.archive-material-publication-storage-committed.v1";
const sourceWorkload = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND";
const sourceRuntimeId = "teaching_archive_material_publication_persistence_command_runtime";
const sourceCommandPort = "TeachingArchiveMaterialPublicationPersistenceCommandPort.recordTeachingArchiveMaterialPublicationPersistenceCommand";
const sourceStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED";
const committedStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMITTED";
const publicationState = "COMMITTED_TO_PUBLICATION_STORE";
const defaultCommitLogPath = "reports/teaching-command-log/teaching-archive-material-publication-storage-commit.jsonl";
const leakedFieldNames = [
  "rawContent", "answerKey", "rawModelOutput", "modelOutput", "directSql", "dbUrl",
  "internalError", "databaseWriteResult", "ocrJobId", "ragChunkIds", "aiGradingRequestId",
  "workerId", "claimExpiresAt", "scoreSummary", "publishedAt", "publicationCommittedAt",
];

export async function commitTeachingArchiveMaterialPublicationStorage(input, options = {}) {
  const committedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const commitLogPath = options.commitLogPath ?? defaultCommitLogPath;
  const existing = findExistingRecordByIdempotencyKey(commitLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const port = assertPublicationCommitPort(options.teachingArchivePublicationCommitPort);
  const portResult = await port.commitPublication(normalized.publicationCommitCommand, {
    commitInvocationId: normalized.commitInvocationId,
    idempotencyKey: normalized.idempotencyKey,
    sourcePersistenceCommandRecordId: normalized.persistenceCommandRecord.recordId,
  });
  const committed = assertPortResult(portResult, normalized);
  const record = buildCommitRecord(normalized, committed, committedAt, options.probeP99Ms ?? 8);
  appendRecord(commitLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatTeachingArchiveMaterialPublicationStorageCommit(result) {
  return [
    `Teaching archive material publication storage commit: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Publication: ${result.publicationCommit.publicationRecord.publicationId}`,
    `Archive item: ${result.publicationCommit.publicationRecord.archiveItemId}`,
    `Committed: ${result.boundary.publicationCommitted}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const commitInvocationId = requireToken(input.commitInvocationId, "input.commitInvocationId", "archive_material_publication_storage_commit_");
  const persistenceCommandReport = assertPersistenceCommandReport(input.publicationPersistenceCommandReport);
  const persistenceCommandRecord = assertPersistenceCommandRecord(persistenceCommandReport);
  const publicationStorageCommitRequest = assertCommitRequest(input.publicationStorageCommitRequest, persistenceCommandRecord);
  const publicationStorageCommitPolicy = assertCommitPolicy(input.publicationStorageCommitPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 720);
  if (!evidenceRefs.some((ref) => ref.includes("publication-persistence-command"))) {
    throw commitError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_MISSING_COMMAND_EVIDENCE", "publication persistence command evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("publication-storage-commit"))) {
    throw commitError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_MISSING_COMMIT_EVIDENCE", "publication storage commit evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const publicationCommitCommand = buildPublicationCommitCommand(persistenceCommandRecord, publicationStorageCommitRequest);
  const commitInputHash = hashInput({
    commitInvocationId,
    persistenceCommandRecordId: persistenceCommandRecord.recordId,
    persistenceCommandId: persistenceCommandRecord.publicationPersistenceCommand.commandId,
    publicationStorageCommitRequest,
    publicationStorageCommitPolicy,
  });
  return {
    commitInvocationId,
    persistenceCommandReport,
    persistenceCommandRecord,
    publicationStorageCommitRequest,
    publicationStorageCommitPolicy,
    evidenceRefs,
    idempotencyKey,
    publicationCommitCommand,
    commitInputHash,
  };
}

function assertPersistenceCommandReport(report) {
  rejectLeakedFields(report, "input.publicationPersistenceCommandReport");
  assertPlainObject(report, "input.publicationPersistenceCommandReport");
  requireConst(report.readiness, "READY", "input.publicationPersistenceCommandReport.readiness");
  requireConst(report.workloadType, sourceWorkload, "input.publicationPersistenceCommandReport.workloadType");
  requireConst(report.runtime?.runtimeId, sourceRuntimeId, "input.publicationPersistenceCommandReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, sourceCommandPort, "input.publicationPersistenceCommandReport.runtime.commandPort");
  requireConst(report.runtime?.status, sourceStatus, "input.publicationPersistenceCommandReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.publicationPersistenceCommandReport.runtimeSlo.totalErrors");
  for (const field of [
    "publicationDeliveryEnvelopeRequired", "publicationDeliveryEnvelopeVerified",
    "appendOnlyCommandLogRequired", "studentOwnScopeRequired",
    "publicationPersistenceCommandRecorded", "futureDurablePublicationCommitReviewRequired",
  ]) requireConst(report.safetyInvariants?.[field], true, `input.publicationPersistenceCommandReport.safetyInvariants.${field}`);
  for (const field of [
    "durablePublicationPersistenceStarted", "publicationCommitted", "mainDatabaseWriteStarted",
    "studentArchiveWriteStarted", "directDatabaseAccessAllowed", "executeHttpRequestAllowed",
    "ocrOrRagJobWriteStarted", "aiGradingWriteStarted", "modelInferenceStarted",
    "remoteDeviceControlAllowed", "localToolMutationAllowed", "swarmAllowed",
  ]) requireConst(report.safetyInvariants?.[field], false, `input.publicationPersistenceCommandReport.safetyInvariants.${field}`);
  return report;
}

function assertPersistenceCommandRecord(report) {
  const result = report.runtimeProbes?.teachingArchiveMaterialPublicationPersistenceCommand?.result;
  rejectLeakedFields(result, "input.publicationPersistenceCommandReport.runtimeProbes.result");
  assertPlainObject(result, "input.publicationPersistenceCommandReport.runtimeProbes.result");
  requireConst(result.schemaVersion, "2026-06-07.teaching.archive-material-publication-persistence-command-recorded.v1", "source.schemaVersion");
  requireConst(result.runtimeId, sourceRuntimeId, "source.runtimeId");
  requireConst(result.commandPort, sourceCommandPort, "source.commandPort");
  requireConst(result.status, sourceStatus, "source.status");
  requireConst(result.boundary?.publicationPersistenceCommandRecorded, true, "source.boundary.publicationPersistenceCommandRecorded");
  requireConst(result.boundary?.publicationCommitted, false, "source.boundary.publicationCommitted");
  requireConst(result.boundary?.mainDatabaseWriteStarted, false, "source.boundary.mainDatabaseWriteStarted");
  requireConst(result.boundary?.studentArchiveWriteStarted, false, "source.boundary.studentArchiveWriteStarted");
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "source.recordId", 1, 520),
    sourcePublicationDeliveryEnvelope: assertSourceDeliveryEnvelope(result.sourcePublicationDeliveryEnvelope),
    publicationPersistenceCommand: assertPublicationPersistenceCommand(result.publicationPersistenceCommand),
    evidenceRefs: uniqueStringArray(result.evidenceRefs, "source.evidenceRefs", 1, 1200),
  };
}

function assertSourceDeliveryEnvelope(source) {
  assertPlainObject(source, "source.sourcePublicationDeliveryEnvelope");
  return {
    runtimeId: requireConst(source.runtimeId, "teaching_archive_material_publication_delivery_runtime", "source.sourcePublicationDeliveryEnvelope.runtimeId"),
    recordId: requireBoundedString(source.recordId, "source.sourcePublicationDeliveryEnvelope.recordId", 1, 520),
    deliveryInvocationId: requireToken(source.deliveryInvocationId, "source.sourcePublicationDeliveryEnvelope.deliveryInvocationId", "archive_material_publication_delivery_"),
    envelopeId: requireToken(source.envelopeId, "source.sourcePublicationDeliveryEnvelope.envelopeId", "archive_material_delivery_env_"),
  };
}

function assertPublicationPersistenceCommand(command) {
  assertPlainObject(command, "source.publicationPersistenceCommand");
  requireConst(command.commandKind, "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND", "source.publicationPersistenceCommand.commandKind");
  requireConst(command.persistenceMode, "APPEND_ONLY_PUBLICATION_PERSISTENCE_COMMAND", "source.publicationPersistenceCommand.persistenceMode");
  requireConst(command.targetPublicationKind, "STUDENT_ARCHIVE_MATERIAL", "source.publicationPersistenceCommand.targetPublicationKind");
  requireConst(command.desiredPublicationState, "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED", "source.publicationPersistenceCommand.desiredPublicationState");
  requireConst(command.commandState, "NOT_COMMITTED_TO_PUBLICATION_STORE", "source.publicationPersistenceCommand.commandState");
  requireConst(command.approvalEvidencePreserved, true, "source.publicationPersistenceCommand.approvalEvidencePreserved");
  requireConst(command.studentOwnScopeEnforced, true, "source.publicationPersistenceCommand.studentOwnScopeEnforced");
  return {
    commandId: requireToken(command.commandId, "source.publicationPersistenceCommand.commandId", "archive_material_publication_persist_cmd_"),
    commandKind: command.commandKind,
    scopeRef: assertStudentScopeRef(command.scopeRef, "source.publicationPersistenceCommand.scopeRef"),
    sourceDeliveryRecordId: requireBoundedString(command.sourceDeliveryRecordId, "source.publicationPersistenceCommand.sourceDeliveryRecordId", 1, 520),
    sourceDeliveryEnvelopeId: requireToken(command.sourceDeliveryEnvelopeId, "source.publicationPersistenceCommand.sourceDeliveryEnvelopeId", "archive_material_delivery_env_"),
    approvalRecordId: requireBoundedString(command.approvalRecordId, "source.publicationPersistenceCommand.approvalRecordId", 1, 520),
    approvalId: requireToken(command.approvalId, "source.publicationPersistenceCommand.approvalId", "archive_material_publication_approval_"),
    publicationCandidateId: requireToken(command.publicationCandidateId, "source.publicationPersistenceCommand.publicationCandidateId", "archive_material_pub_precheck_"),
    archiveItemId: requireToken(command.archiveItemId, "source.publicationPersistenceCommand.archiveItemId", "tarch_"),
    studentId: requireToken(command.studentId, "source.publicationPersistenceCommand.studentId", "student_"),
    materialType: requireOneOf(command.materialType, "source.publicationPersistenceCommand.materialType", ["HANDOUT", "QUIZ", "LESSON_NOTE"]),
    title: requireSafeText(command.title, "source.publicationPersistenceCommand.title", 1, 160),
    contentRef: requireBoundedString(command.contentRef, "source.publicationPersistenceCommand.contentRef", 1, 260),
  };
}

function assertCommitRequest(request, record) {
  rejectLeakedFields(request, "input.publicationStorageCommitRequest");
  assertPlainObject(request, "input.publicationStorageCommitRequest");
  const command = record.publicationPersistenceCommand;
  requireConst(request.commitMode, "DURABLE_STUDENT_ARCHIVE_MATERIAL_PUBLICATION", "input.publicationStorageCommitRequest.commitMode");
  requireConst(request.targetPublicationStore, "TEACHING_ARCHIVE_PUBLICATION_STORE", "input.publicationStorageCommitRequest.targetPublicationStore");
  requireConst(request.desiredPublicationState, publicationState, "input.publicationStorageCommitRequest.desiredPublicationState");
  requireJsonEqual(request.scopeRef, command.scopeRef, "input.publicationStorageCommitRequest.scopeRef");
  for (const [field, expected] of [
    ["sourcePersistenceCommandRecordId", record.recordId],
    ["sourcePersistenceCommandId", command.commandId],
    ["sourceDeliveryEnvelopeId", command.sourceDeliveryEnvelopeId],
    ["approvalRecordId", command.approvalRecordId],
    ["approvalId", command.approvalId],
    ["publicationCandidateId", command.publicationCandidateId],
    ["archiveItemId", command.archiveItemId],
    ["studentId", command.studentId],
    ["materialType", command.materialType],
    ["title", command.title],
    ["contentRef", command.contentRef],
  ]) requireConst(request[field], expected, `input.publicationStorageCommitRequest.${field}`);
  return {
    commitId: requireToken(request.commitId, "input.publicationStorageCommitRequest.commitId", "archive_material_publication_commit_"),
    commitMode: request.commitMode,
    targetPublicationStore: request.targetPublicationStore,
    desiredPublicationState: request.desiredPublicationState,
    scopeRef: command.scopeRef,
    sourcePersistenceCommandRecordId: record.recordId,
    sourcePersistenceCommandId: command.commandId,
    sourceDeliveryEnvelopeId: command.sourceDeliveryEnvelopeId,
    approvalRecordId: command.approvalRecordId,
    approvalId: command.approvalId,
    publicationCandidateId: command.publicationCandidateId,
    archiveItemId: command.archiveItemId,
    studentId: command.studentId,
    materialType: command.materialType,
    title: command.title,
    contentRef: command.contentRef,
  };
}

function assertCommitPolicy(policy) {
  assertPlainObject(policy, "input.publicationStorageCommitPolicy");
  for (const field of [
    "publicationPersistenceCommandRequired", "publicationCommitPortRequired",
    "durablePublicationCommitAllowed", "mainDatabaseWriteAllowed",
    "studentArchiveWriteAllowed", "studentVisiblePublicationAllowed",
    "preserveApprovalEvidenceRequired", "preserveDeliveryEnvelopeRequired",
    "idempotentPublicationCommitRequired",
  ]) requireConst(policy[field], true, `input.publicationStorageCommitPolicy.${field}`);
  for (const field of [
    "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "ocrOrRagJobWriteAllowed",
    "aiGradingWriteAllowed", "modelInferenceAllowed", "remoteDeviceControlAllowed",
    "localToolMutationAllowed", "swarmAllowed",
  ]) requireConst(policy[field], false, `input.publicationStorageCommitPolicy.${field}`);
  return { ...policy };
}

function buildPublicationCommitCommand(record, request) {
  return {
    commandId: request.commitId,
    commandKind: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_COMMAND",
    operationId: "commitTeachingArchiveMaterialPublication",
    targetUseCase: "CommitTeachingArchiveMaterialPublication.ExecuteWithPersistence",
    targetRepository: "PublicationRepository.Commit",
    targetStore: request.targetPublicationStore,
    commitMode: request.commitMode,
    sourcePersistenceCommand: {
      recordId: record.recordId,
      commandId: record.publicationPersistenceCommand.commandId,
      sourceDeliveryEnvelopeId: record.publicationPersistenceCommand.sourceDeliveryEnvelopeId,
    },
    publicationPayload: {
      publicationId: request.commitId,
      publicationState,
      visibilityState: "STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED",
      channel: "STUDENT_APP",
      scopeRef: request.scopeRef,
      approvalRecordId: request.approvalRecordId,
      approvalId: request.approvalId,
      publicationCandidateId: request.publicationCandidateId,
      archiveItemId: request.archiveItemId,
      studentId: request.studentId,
      materialType: request.materialType,
      title: request.title,
      contentRef: request.contentRef,
    },
  };
}

function assertPublicationCommitPort(port) {
  if (!port || typeof port.commitPublication !== "function") {
    throw commitError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_PORT_REQUIRED", "TeachingArchivePublicationCommitPort.commitPublication is required");
  }
  return port;
}

function assertPortResult(portResult, normalized) {
  rejectLeakedFields(portResult, "portResult");
  assertPlainObject(portResult, "portResult");
  const publicationRecord = assertPublicationRecord(portResult.publicationRecord, normalized.publicationCommitCommand.publicationPayload);
  const persistence = assertPersistence(portResult.persistence);
  return { publicationRecord, persistence };
}

function assertPublicationRecord(record, payload) {
  assertPlainObject(record, "portResult.publicationRecord");
  requireConst(record.publicationId, payload.publicationId, "portResult.publicationRecord.publicationId");
  requireConst(record.publicationState, publicationState, "portResult.publicationRecord.publicationState");
  requireConst(record.visibilityState, payload.visibilityState, "portResult.publicationRecord.visibilityState");
  requireConst(record.channel, payload.channel, "portResult.publicationRecord.channel");
  requireJsonEqual(record.scopeRef, payload.scopeRef, "portResult.publicationRecord.scopeRef");
  for (const field of ["approvalRecordId", "approvalId", "publicationCandidateId", "archiveItemId", "studentId", "materialType", "title", "contentRef"]) {
    requireConst(record[field], payload[field], `portResult.publicationRecord.${field}`);
  }
  return { ...payload, committedAt: requireIsoString(record.committedAt, "portResult.publicationRecord.committedAt") };
}

function assertPersistence(persistence) {
  assertPlainObject(persistence, "portResult.persistence");
  return {
    status: requireConst(persistence.status, "persisted", "portResult.persistence.status"),
    commandId: optionalBoundedString(persistence.commandId, "portResult.persistence.commandId", 260),
  };
}

function buildCommitRecord(normalized, committed, committedAt, p99Ms) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT",
    recordId: `teaching_archive_material_publication_storage_commit_${safeToken(normalized.idempotencyKey)}`,
    committedAt,
    runtimeId: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_RUNTIME_ID,
    commandPort: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_PORT,
    status: committedStatus,
    commitInvocationId: normalized.commitInvocationId,
    sourcePersistenceCommand: {
      runtimeId: sourceRuntimeId,
      recordId: normalized.persistenceCommandRecord.recordId,
      commandId: normalized.persistenceCommandRecord.publicationPersistenceCommand.commandId,
      commandState: "COMMITTED_TO_PUBLICATION_STORE",
    },
    publicationCommit: {
      operationId: normalized.publicationCommitCommand.operationId,
      targetUseCase: normalized.publicationCommitCommand.targetUseCase,
      targetRepository: normalized.publicationCommitCommand.targetRepository,
      targetStore: normalized.publicationCommitCommand.targetStore,
      publicationRecord: committed.publicationRecord,
      persistence: committed.persistence,
    },
    boundary: {
      publicationPersistenceCommandVerified: true,
      publicationCommitPortInjected: true,
      publicationApprovalPreserved: true,
      publicationDeliveryEnvelopePreserved: true,
      studentOwnScopeEnforced: true,
      safeMaterialPointerOnly: true,
      durablePublicationPersistenceStarted: true,
      publicationCommitted: true,
      studentVisiblePublished: true,
      mainDatabaseWriteStarted: true,
      mainDatabaseWriteCommitted: true,
      studentArchiveWriteStarted: true,
      studentArchiveWriteCommitted: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFuturePublicationRowVerification: true,
    },
    evidenceRefs: uniqueEvidenceRefs([
      ...normalized.evidenceRefs,
      ...normalized.persistenceCommandRecord.evidenceRefs,
      `evidence:archive-material-publication-storage-commit-input-hash:${normalized.commitInputHash}`,
      `evidence:runtime:${TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_RUNTIME_ID}`,
      `evidence:command-port:${TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_PORT}`,
      `evidence:publication-record:${committed.publicationRecord.publicationId}`,
    ]),
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.commitInputHash,
    runtimeSlo: { targetP99Ms: 50, p99Ms, totalErrors: 0, operations: 1, evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_PROBE" },
    nextAction: "Use this committed publication record as input for physical row verification and Student App published-material read verification.",
  };
}

function buildResult(record, extra) { return { ...record, ...extra }; }
function appendRecord(filePath, record) { const absolute = path.resolve(filePath); fs.mkdirSync(path.dirname(absolute), { recursive: true }); fs.appendFileSync(absolute, `${JSON.stringify(record)}\n`); }
function findExistingRecordByIdempotencyKey(filePath, key) {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) return null;
  const lines = fs.readFileSync(absolute, "utf8").split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const record = JSON.parse(lines[index]);
    if (record.idempotencyKey === key) return record;
  }
  return null;
}
function assertReplayMatches(record, normalized) {
  if (record.inputHash !== normalized.commitInputHash) throw commitError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_IDEMPOTENCY_CONFLICT", "idempotency key already exists with different publication storage commit input");
  requireConst(record.status, committedStatus, "record.status");
}
function assertStudentScopeRef(scopeRef, label) {
  assertPlainObject(scopeRef, label);
  return {
    scopeType: requireConst(scopeRef.scopeType, "STUDENT_OWN_ARCHIVE", `${label}.scopeType`),
    studentId: requireToken(scopeRef.studentId, `${label}.studentId`, "student_"),
    archiveItemId: requireToken(scopeRef.archiveItemId, `${label}.archiveItemId`, "tarch_"),
  };
}
function uniqueEvidenceRefs(refs) { return [...new Set(refs)]; }
function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw commitError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_INVALID_OBJECT", `${label} must be an object`);
}
function requireConst(actual, expected, label) {
  if (actual !== expected) throw commitError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_CONTRACT_MISMATCH", `${label} must be ${expected}`);
  return expected;
}
function requireJsonEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw commitError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_CONTRACT_MISMATCH", `${label} must match source`);
}
function requireOneOf(actual, label, allowed) {
  if (!allowed.includes(actual)) throw commitError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_CONTRACT_MISMATCH", `${label} must be one of ${allowed.join(", ")}`);
  return actual;
}
function requireToken(value, label, prefix) {
  const text = requireBoundedString(value, label, prefix.length + 1, 260);
  if (!text.startsWith(prefix) || !/^[A-Za-z0-9:_-]+$/u.test(text)) throw commitError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_INVALID_TOKEN", `${label} must start with ${prefix}`);
  return text;
}
function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string" || value.length < min || value.length > max) throw commitError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_INVALID_TEXT", `${label} must be ${min}-${max} chars`);
  return value;
}
function optionalBoundedString(value, label, max) {
  if (value === undefined || value === null || value === "") return "";
  return requireBoundedString(String(value), label, 1, max);
}
function requireSafeText(value, label, min, max) {
  const text = requireBoundedString(value, label, min, max);
  if (/[<>]|\bscript\b|javascript:|data:/iu.test(text)) throw commitError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_UNSAFE_TEXT", `${label} contains unsafe text`);
  return text;
}
function requireIsoString(value, label) {
  const text = requireBoundedString(value, label, 20, 40);
  if (Number.isNaN(Date.parse(text))) throw commitError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_INVALID_TIME", `${label} must be an ISO timestamp`);
  return text;
}
function uniqueStringArray(value, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw commitError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_INVALID_ARRAY", `${label} must have ${min}-${max} items`);
  const items = value.map((item, index) => requireBoundedString(item, `${label}[${index}]`, 1, 420));
  if (new Set(items).size !== items.length) throw commitError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_DUPLICATE_ARRAY", `${label} must be unique`);
  return items;
}
function rejectLeakedFields(value, label) {
  if (!value || typeof value !== "object") return;
  const keys = collectKeys(value);
  for (const field of leakedFieldNames) {
    if (keys.has(field)) throw commitError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_LEAKED_FIELD", `${label}.${field} is not allowed`);
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
function hashInput(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function safeToken(value) { return String(value).replace(/[^A-Za-z0-9_-]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 180); }
function commitError(code, message) { const error = new Error(message); error.code = code; return error; }
