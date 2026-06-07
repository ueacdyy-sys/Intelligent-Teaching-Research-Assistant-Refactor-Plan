import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_RUNTIME_ID =
  "teaching_archive_material_publication_row_verification_runtime";
export const TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_PORT =
  "TeachingArchiveMaterialPublicationRowVerificationPort.verifyTeachingArchivePublicationPhysicalRow";

const inputSchemaVersion = "2026-06-07.teaching.archive-material-publication-row-verification.v1";
const outputSchemaVersion = "2026-06-07.teaching.archive-material-publication-row-verified.v1";
const storageCommitWorkload = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT";
const storageCommitRuntimeId = "teaching_archive_material_publication_storage_commit_runtime";
const storageCommitCommandPort =
  "TeachingArchiveMaterialPublicationStorageCommitPort.commitTeachingArchiveMaterialPublication";
const storageCommitStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMITTED";
const verifiedStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PHYSICAL_ROW_VERIFIED";
const publicationState = "COMMITTED_TO_PUBLICATION_STORE";
const targetStore = "TEACHING_ARCHIVE_PUBLICATION_STORE";
const targetTable = "teaching_archive_publications";
const defaultVerificationLogPath =
  "reports/teaching-command-log/teaching-archive-material-publication-row-verification.jsonl";
const leakedFieldNames = [
  "rawContent", "answerKey", "rawModelOutput", "modelOutput", "directSql", "dbUrl",
  "internalError", "databaseWriteResult", "ocrJobId", "ragChunkIds", "aiGradingRequestId",
  "workerId", "claimExpiresAt", "scoreSummary",
];

export async function verifyTeachingArchiveMaterialPublicationPhysicalRow(input, options = {}) {
  const verifiedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const verificationLogPath = options.verificationLogPath ?? defaultVerificationLogPath;
  const existing = findExistingRecordByIdempotencyKey(verificationLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const rowReadPort = assertPublicationRowReadPort(options.teachingArchivePublicationRowReadPort);
  const publicationId = normalized.storageCommitResult.publicationCommit.publicationRecord.publicationId;
  const portResult = await rowReadPort.getPublicationById(publicationId, {
    verificationInvocationId: normalized.verificationInvocationId,
    idempotencyKey: normalized.idempotencyKey,
    sourceStorageCommitRecordId: normalized.storageCommitResult.recordId,
  });
  const verified = assertPortResult(portResult, normalized.storageCommitResult.publicationCommit.publicationRecord);
  const record = buildVerificationRecord(normalized, verified, verifiedAt, options.probeP99Ms ?? 9);
  appendRecord(verificationLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatTeachingArchiveMaterialPublicationRowVerification(result) {
  return [
    `Teaching archive material publication row verification: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Publication: ${result.teachingArchivePublicationPhysicalRow.publicationRecord.publicationId}`,
    `Target table: ${result.teachingArchivePublicationPhysicalRow.targetTable}`,
    `Physical row verified: ${result.boundary.publicationPhysicalRowVerified}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const verificationInvocationId = requireToken(
    input.verificationInvocationId,
    "input.verificationInvocationId",
    "archive_material_publication_row_verification_",
  );
  const storageCommitReport = assertStorageCommitReport(input.publicationStorageCommitReport);
  const storageCommitResult = assertStorageCommitResult(storageCommitReport);
  const verificationPolicy = assertVerificationPolicy(input.publicationRowVerificationPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 720);
  if (!evidenceRefs.some((ref) => ref.includes("publication-storage-commit"))) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_MISSING_COMMIT_EVIDENCE", "publication storage commit evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("publication-row-verification"))) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_MISSING_ROW_EVIDENCE", "publication row verification evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const verificationInputHash = hashInput({
    verificationInvocationId,
    storageCommitRecordId: storageCommitResult.recordId,
    publicationRecord: storageCommitResult.publicationCommit.publicationRecord,
    verificationPolicy,
  });
  return { verificationInvocationId, storageCommitReport, storageCommitResult, verificationPolicy, evidenceRefs, idempotencyKey, verificationInputHash };
}

function assertStorageCommitReport(report) {
  rejectLeakedFields(report, "input.publicationStorageCommitReport");
  assertPlainObject(report, "input.publicationStorageCommitReport");
  requireConst(report.readiness, "READY", "input.publicationStorageCommitReport.readiness");
  requireConst(report.workloadType, storageCommitWorkload, "input.publicationStorageCommitReport.workloadType");
  requireConst(report.runtime?.runtimeId, storageCommitRuntimeId, "input.publicationStorageCommitReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, storageCommitCommandPort, "input.publicationStorageCommitReport.runtime.commandPort");
  requireConst(report.runtime?.status, storageCommitStatus, "input.publicationStorageCommitReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.publicationStorageCommitReport.runtimeSlo.totalErrors");
  for (const field of [
    "publicationPersistenceCommandVerified", "publicationCommitPortInjected",
    "durablePublicationPersistenceStarted", "publicationCommitted", "studentVisiblePublished",
    "mainDatabaseWriteCommitted", "studentArchiveWriteCommitted", "futurePublicationRowVerificationRequired",
  ]) requireConst(report.safetyInvariants?.[field], true, `input.publicationStorageCommitReport.safetyInvariants.${field}`);
  for (const field of [
    "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "ocrOrRagJobWriteStarted",
    "aiGradingWriteStarted", "modelInferenceStarted", "remoteDeviceControlAllowed",
    "localToolMutationAllowed", "swarmAllowed",
  ]) requireConst(report.safetyInvariants?.[field], false, `input.publicationStorageCommitReport.safetyInvariants.${field}`);
  return report;
}

function assertStorageCommitResult(report) {
  const result = report.runtimeProbes?.teachingArchiveMaterialPublicationStorageCommit?.result;
  rejectLeakedFields(result, "input.publicationStorageCommitReport.runtimeProbes.result");
  assertPlainObject(result, "input.publicationStorageCommitReport.runtimeProbes.result");
  requireConst(result.schemaVersion, "2026-06-07.teaching.archive-material-publication-storage-committed.v1", "source.schemaVersion");
  requireConst(result.runtimeId, storageCommitRuntimeId, "source.runtimeId");
  requireConst(result.commandPort, storageCommitCommandPort, "source.commandPort");
  requireConst(result.status, storageCommitStatus, "source.status");
  for (const field of [
    "publicationPersistenceCommandVerified", "publicationCommitPortInjected",
    "publicationCommitted", "studentVisiblePublished", "mainDatabaseWriteCommitted",
    "studentArchiveWriteCommitted",
  ]) requireConst(result.boundary?.[field], true, `source.boundary.${field}`);
  for (const field of [
    "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "ocrOrRagJobWriteStarted",
    "aiGradingWriteStarted", "modelInferenceStarted", "remoteDeviceControlAllowed",
    "localToolMutationAllowed", "swarmAllowed",
  ]) requireConst(result.boundary?.[field], false, `source.boundary.${field}`);
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "source.recordId", 1, 520),
    idempotencyKey: requireBoundedString(result.idempotencyKey, "source.idempotencyKey", 1, 520),
    sourcePersistenceCommand: assertPlainObjectWithValue(result.sourcePersistenceCommand, "source.sourcePersistenceCommand"),
    publicationCommit: assertPublicationCommit(result.publicationCommit),
    evidenceRefs: uniqueStringArray(result.evidenceRefs, "source.evidenceRefs", 1, 1600),
  };
}

function assertPublicationCommit(commit) {
  assertPlainObject(commit, "source.publicationCommit");
  requireConst(commit.operationId, "commitTeachingArchiveMaterialPublication", "source.publicationCommit.operationId");
  requireConst(commit.targetUseCase, "CommitTeachingArchiveMaterialPublication.ExecuteWithPersistence", "source.publicationCommit.targetUseCase");
  requireConst(commit.targetRepository, "PublicationRepository.Commit", "source.publicationCommit.targetRepository");
  requireConst(commit.targetStore, targetStore, "source.publicationCommit.targetStore");
  return {
    operationId: commit.operationId,
    targetUseCase: commit.targetUseCase,
    targetRepository: commit.targetRepository,
    targetStore: commit.targetStore,
    publicationRecord: assertPublicationRecord(commit.publicationRecord, "source.publicationCommit.publicationRecord"),
    persistence: assertPersistence(commit.persistence),
  };
}

function assertPublicationRecord(record, label) {
  rejectLeakedFields(record, label);
  assertPlainObject(record, label);
  requireConst(record.publicationState, publicationState, `${label}.publicationState`);
  requireConst(record.visibilityState, "STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED", `${label}.visibilityState`);
  requireConst(record.channel, "STUDENT_APP", `${label}.channel`);
  return {
    publicationId: requireToken(record.publicationId, `${label}.publicationId`, "archive_material_publication_commit_"),
    publicationState: record.publicationState,
    visibilityState: record.visibilityState,
    channel: record.channel,
    scopeRef: assertStudentScopeRef(record.scopeRef, `${label}.scopeRef`),
    approvalRecordId: requireBoundedString(record.approvalRecordId, `${label}.approvalRecordId`, 1, 520),
    approvalId: requireToken(record.approvalId, `${label}.approvalId`, "archive_material_publication_approval_"),
    publicationCandidateId: requireToken(record.publicationCandidateId, `${label}.publicationCandidateId`, "archive_material_pub_precheck_"),
    archiveItemId: requireToken(record.archiveItemId, `${label}.archiveItemId`, "tarch_"),
    studentId: requireToken(record.studentId, `${label}.studentId`, "student_"),
    materialType: requireOneOf(record.materialType, `${label}.materialType`, ["HANDOUT", "QUIZ", "LESSON_NOTE"]),
    title: requireSafeText(record.title, `${label}.title`, 1, 160),
    contentRef: requireContentRef(record.contentRef, `${label}.contentRef`),
    committedAt: requireIsoString(record.committedAt, `${label}.committedAt`),
  };
}

function assertPersistence(persistence) {
  assertPlainObject(persistence, "source.publicationCommit.persistence");
  return {
    status: requireConst(persistence.status, "persisted", "source.publicationCommit.persistence.status"),
    commandId: optionalBoundedString(persistence.commandId, "source.publicationCommit.persistence.commandId", 260),
  };
}

function assertVerificationPolicy(policy) {
  assertPlainObject(policy, "input.publicationRowVerificationPolicy");
  for (const field of [
    "storageCommitRequired", "physicalPublicationRowVerificationRequired",
    "injectedTeachingArchivePublicationRowReadPortRequired", "publicationRepositoryReadRequired",
    "committedPublicationRecordMatchRequired", "preserveApprovalEvidenceRequired",
    "preserveDeliveryEnvelopeRequired", "studentOwnScopeRequired",
    "idempotentPublicationRowVerificationRequired", "mainDatabaseReadAllowed",
  ]) requireConst(policy[field], true, `input.publicationRowVerificationPolicy.${field}`);
  for (const field of [
    "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "ocrOrRagJobWriteAllowed",
    "aiGradingWriteAllowed", "modelInferenceAllowed", "remoteDeviceControlAllowed",
    "localToolMutationAllowed", "swarmAllowed",
  ]) requireConst(policy[field], false, `input.publicationRowVerificationPolicy.${field}`);
  return { ...policy };
}

function assertPublicationRowReadPort(port) {
  if (!port || typeof port.getPublicationById !== "function") {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_PORT_REQUIRED", "TeachingArchivePublicationRowReadPort.getPublicationById is required");
  }
  return port;
}

function assertPortResult(result, committedPublicationRecord) {
  rejectLeakedFields(result, "TeachingArchivePublicationRowReadPort result");
  assertPlainObject(result, "TeachingArchivePublicationRowReadPort result");
  requireConst(result.found, true, "TeachingArchivePublicationRowReadPort result.found");
  const source = assertRowReadSource(result.source);
  const row = assertPublicationRecord(result.row, "TeachingArchivePublicationRowReadPort result.row");
  assertRowMatchesCommit(row, committedPublicationRecord);
  return { source, row };
}

function assertRowReadSource(source) {
  assertPlainObject(source, "TeachingArchivePublicationRowReadPort result.source");
  return {
    repositoryMethod: requireConst(source.repositoryMethod, "PublicationRepository.GetByID", "TeachingArchivePublicationRowReadPort result.source.repositoryMethod"),
    targetStore: requireConst(source.targetStore, targetStore, "TeachingArchivePublicationRowReadPort result.source.targetStore"),
    targetTable: requireConst(source.targetTable, targetTable, "TeachingArchivePublicationRowReadPort result.source.targetTable"),
  };
}

function assertRowMatchesCommit(row, committed) {
  for (const field of [
    "publicationId", "publicationState", "visibilityState", "channel", "approvalRecordId",
    "approvalId", "publicationCandidateId", "archiveItemId", "studentId", "materialType",
    "title", "contentRef", "committedAt",
  ]) requireConst(row[field], committed[field], `TeachingArchivePublicationRowReadPort result.row.${field}`);
  requireConst(JSON.stringify(row.scopeRef), JSON.stringify(committed.scopeRef), "TeachingArchivePublicationRowReadPort result.row.scopeRef");
}

function buildVerificationRecord(normalized, verified, verifiedAt, p99Ms) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION",
    recordId: `teaching_archive_material_publication_row_verification_${safeToken(normalized.idempotencyKey)}`,
    verifiedAt,
    runtimeId: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_RUNTIME_ID,
    commandPort: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_PORT,
    status: verifiedStatus,
    verificationInvocationId: normalized.verificationInvocationId,
    sourcePublicationStorageCommit: {
      workloadType: storageCommitWorkload,
      runtimeId: storageCommitRuntimeId,
      commandPort: storageCommitCommandPort,
      recordId: normalized.storageCommitResult.recordId,
      commitInvocationId: normalized.storageCommitResult.commitInvocationId,
      publicationId: normalized.storageCommitResult.publicationCommit.publicationRecord.publicationId,
      publicationState,
    },
    teachingArchivePublicationPhysicalRow: {
      targetRepository: verified.source.repositoryMethod,
      targetStore: verified.source.targetStore,
      targetTable: verified.source.targetTable,
      publicationRecord: verified.row,
    },
    boundary: {
      publicationStorageCommitVerified: true,
      teachingArchivePublicationRowReadPortInvoked: true,
      teachingArchivePublicationRepositoryGetByIDUsed: true,
      committedPublicationRecordMatchedPhysicalRow: true,
      publicationPhysicalRowVerified: true,
      mainDatabaseWriteCommitted: true,
      mainDatabaseReadAllowed: true,
      studentVisiblePublished: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureStudentAppPublishedMaterialRead: true,
    },
    evidenceRefs: uniqueEvidenceRefs([
      ...normalized.evidenceRefs,
      ...normalized.storageCommitResult.evidenceRefs,
      `evidence:archive-material-publication-row-verification-input-hash:${normalized.verificationInputHash}`,
      `evidence:runtime:${TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_RUNTIME_ID}`,
      `evidence:command-port:${TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_PORT}`,
      `evidence:publication-row:${verified.row.publicationId}`,
    ]),
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.verificationInputHash,
    runtimeSlo: { targetP99Ms: 50, p99Ms, totalErrors: 0, operations: 1, evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_PROBE" },
    nextAction: "Use this as physical publication row evidence; Student App published-material read verification remains a separate slice.",
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
  if (record.inputHash !== normalized.verificationInputHash) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_IDEMPOTENCY_CONFLICT", "idempotency key already exists with different publication row verification input");
  }
  requireConst(record.status, verifiedStatus, "record.status");
}
function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_INVALID_OBJECT", `${label} must be an object`);
}
function assertPlainObjectWithValue(value, label) { assertPlainObject(value, label); return value; }
function assertStudentScopeRef(scopeRef, label) {
  assertPlainObject(scopeRef, label);
  return {
    scopeType: requireConst(scopeRef.scopeType, "STUDENT_OWN_ARCHIVE", `${label}.scopeType`),
    studentId: requireToken(scopeRef.studentId, `${label}.studentId`, "student_"),
    archiveItemId: requireToken(scopeRef.archiveItemId, `${label}.archiveItemId`, "tarch_"),
  };
}
function requireConst(actual, expected, label) {
  if (actual !== expected) throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_CONTRACT_MISMATCH", `${label} must be ${expected}`);
  return expected;
}
function requireOneOf(actual, label, allowed) {
  if (!allowed.includes(actual)) throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_CONTRACT_MISMATCH", `${label} must be one of ${allowed.join(", ")}`);
  return actual;
}
function requireToken(value, label, prefix) {
  const text = requireBoundedString(value, label, prefix.length + 1, 260);
  if (!text.startsWith(prefix) || !/^[A-Za-z0-9:_-]+$/u.test(text)) throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_INVALID_TOKEN", `${label} must start with ${prefix}`);
  return text;
}
function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string" || value.length < min || value.length > max) throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_INVALID_TEXT", `${label} must be ${min}-${max} chars`);
  return value;
}
function optionalBoundedString(value, label, max) {
  if (value === undefined || value === null || value === "") return "";
  return requireBoundedString(String(value), label, 1, max);
}
function requireSafeText(value, label, min, max) {
  const text = requireBoundedString(value, label, min, max);
  if (/[<>]|\bscript\b|javascript:|data:/iu.test(text)) throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_UNSAFE_TEXT", `${label} contains unsafe text`);
  return text;
}
function requireContentRef(value, label) {
  const text = requireSafeText(value, label, 1, 260);
  if (!/^(precommit|publication|local):\/\//u.test(text)) throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_UNSAFE_CONTENT_REF", `${label} must use an approved content ref scheme`);
  return text;
}
function requireIsoString(value, label) {
  const text = requireBoundedString(value, label, 20, 40);
  if (Number.isNaN(Date.parse(text))) throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_INVALID_TIME", `${label} must be an ISO timestamp`);
  return text;
}
function uniqueStringArray(value, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_INVALID_ARRAY", `${label} must have ${min}-${max} items`);
  const items = value.map((item, index) => requireBoundedString(item, `${label}[${index}]`, 1, 420));
  if (new Set(items).size !== items.length) throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_DUPLICATE_ARRAY", `${label} must be unique`);
  return items;
}
function uniqueEvidenceRefs(refs) { return [...new Set(refs)]; }
function rejectLeakedFields(value, label) {
  if (!value || typeof value !== "object") return;
  const keys = collectKeys(value);
  for (const field of leakedFieldNames) {
    if (keys.has(field)) throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_LEAKED_FIELD", `${label}.${field} is not allowed`);
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
function verificationError(code, message) { const error = new Error(message); error.code = code; return error; }
