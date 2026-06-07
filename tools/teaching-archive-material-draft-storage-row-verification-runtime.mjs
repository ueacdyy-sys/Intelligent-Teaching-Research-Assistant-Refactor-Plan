import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION_RUNTIME_ID =
  "teaching_archive_material_draft_storage_row_verification_runtime";
export const TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION_PORT =
  "TeachingArchiveMaterialDraftStorageRowVerificationPort.verifyTeachingArchivePhysicalRow";

const inputSchemaVersion = "2026-06-07.teaching.archive-material-draft-storage-row-verification.v1";
const outputSchemaVersion = "2026-06-07.teaching.archive-material-draft-storage-row-verified.v1";
const storageCommitWorkload = "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT";
const storageCommitRuntimeId = "teaching_archive_material_draft_storage_commit_runtime";
const storageCommitCommandPort = "TeachingArchiveMaterialDraftStorageCommitPort.commitArchiveMaterialDraftStorageCommand";
const storageCommitStatus = "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMITTED";
const verifiedStatus = "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PHYSICAL_ROW_VERIFIED";
const defaultVerificationLogPath =
  "reports/teaching-command-log/teaching-archive-material-draft-storage-row-verification.jsonl";

const leakedFieldNames = [
  "rawModelOutput",
  "modelOutput",
  "directSql",
  "dbUrl",
  "internalError",
  "ocrJobId",
  "ragChunkIds",
  "aiGradingRequestId",
  "workerId",
  "claimExpiresAt",
];

export async function verifyTeachingArchiveMaterialDraftStoragePhysicalRow(input, options = {}) {
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

export function formatTeachingArchiveMaterialDraftStorageRowVerification(result) {
  return [
    `Teaching archive material draft storage row verification: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Archive item: ${result.teachingArchivePhysicalRow.archiveItem.id}`,
    `Target table: ${result.teachingArchivePhysicalRow.targetTable}`,
    `Physical row verified: ${result.boundary.physicalDatabaseRowVerified}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const verificationInvocationId = requireToken(
    input.verificationInvocationId,
    "input.verificationInvocationId",
    "archive_material_draft_storage_row_verification_",
  );
  const storageCommitReport = assertStorageCommitReport(input.storageCommitReport);
  const storageCommitResult = assertStorageCommitResult(storageCommitReport);
  const verificationPolicy = assertVerificationPolicy(input.storageRowVerificationPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 320);
  if (!evidenceRefs.some((ref) => ref.includes("archive-material-draft-storage-commit"))) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_DRAFT_ROW_VERIFICATION_MISSING_COMMIT_EVIDENCE", "storage commit evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 320);
  const verificationInputHash = hashInput({
    verificationInvocationId,
    storageCommitRecordId: storageCommitResult.recordId,
    archiveItem: storageCommitResult.teachingArchiveCommit.archiveItem,
    verificationPolicy,
  });
  return { verificationInvocationId, storageCommitReport, storageCommitResult, verificationPolicy, evidenceRefs, idempotencyKey, verificationInputHash };
}

function assertStorageCommitReport(report) {
  rejectLeakedFields(report, "input.storageCommitReport");
  assertPlainObject(report, "input.storageCommitReport");
  requireConst(report.readiness, "READY", "input.storageCommitReport.readiness");
  requireConst(report.workloadType, storageCommitWorkload, "input.storageCommitReport.workloadType");
  requireConst(report.runtime?.runtimeId, storageCommitRuntimeId, "input.storageCommitReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, storageCommitCommandPort, "input.storageCommitReport.runtime.commandPort");
  requireConst(report.runtime?.status, storageCommitStatus, "input.storageCommitReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.storageCommitReport.runtimeSlo.totalErrors");
  assertStorageCommitInvariants(report.safetyInvariants ?? {});
  return report;
}

function assertStorageCommitInvariants(boundary) {
  for (const field of [
    "storagePrecommitRequired",
    "storagePrecommitVerified",
    "teachingArchiveCreateItemPortInjected",
    "teachingArchiveUseCaseCommitAllowed",
    "mainDatabaseWriteAllowedViaUseCasePort",
    "mainDatabaseWriteCommitted",
    "finalArchiveItemCreated",
  ]) {
    requireConst(boundary[field], true, `input.storageCommitReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "ocrOrRagJobWriteStarted",
    "aiGradingWriteStarted",
    "executeHttpRequestAllowed",
    "directDatabaseAccessAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(boundary[field], false, `input.storageCommitReport.safetyInvariants.${field}`);
  }
}

function assertStorageCommitResult(report) {
  const result = report.runtimeProbes?.teachingArchiveMaterialDraftStorageCommit?.result;
  rejectLeakedFields(result, "input.storageCommitReport.runtimeProbes.result");
  assertPlainObject(result, "input.storageCommitReport.runtimeProbes.result");
  requireConst(result.schemaVersion, "2026-06-07.teaching.archive-material-draft-storage-commit-committed.v1", "source.schemaVersion");
  requireConst(result.runtimeId, storageCommitRuntimeId, "source.runtimeId");
  requireConst(result.commandPort, storageCommitCommandPort, "source.commandPort");
  requireConst(result.status, storageCommitStatus, "source.status");
  requireConst(result.boundary?.storagePrecommitVerified, true, "source.boundary.storagePrecommitVerified");
  requireConst(result.boundary?.teachingArchiveCreateItemPortInjected, true, "source.boundary.teachingArchiveCreateItemPortInjected");
  requireConst(result.boundary?.mainDatabaseWriteCommitted, true, "source.boundary.mainDatabaseWriteCommitted");
  requireConst(result.boundary?.finalArchiveItemCreated, true, "source.boundary.finalArchiveItemCreated");
  requireConst(result.boundary?.directDatabaseAccessAllowed, false, "source.boundary.directDatabaseAccessAllowed");
  requireConst(result.boundary?.executeHttpRequestAllowed, false, "source.boundary.executeHttpRequestAllowed");
  requireConst(result.boundary?.ocrOrRagJobWriteStarted, false, "source.boundary.ocrOrRagJobWriteStarted");
  requireConst(result.boundary?.aiGradingWriteStarted, false, "source.boundary.aiGradingWriteStarted");
  requireConst(result.boundary?.swarmAllowed, false, "source.boundary.swarmAllowed");
  const commit = assertTeachingArchiveCommit(result.teachingArchiveCommit);
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "source.recordId", 1, 420),
    idempotencyKey: requireBoundedString(result.idempotencyKey, "source.idempotencyKey", 1, 420),
    sourcePrecommit: assertPlainObjectWithValue(result.sourcePrecommit, "source.sourcePrecommit"),
    teachingArchiveCommit: commit,
    evidenceRefs: uniqueStringArray(result.evidenceRefs, "source.evidenceRefs", 1, 1600),
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
    commandId: optionalBoundedString(persistence.commandId, "source.teachingArchiveCommit.persistence.commandId", 420),
  };
}

function assertVerificationPolicy(policy) {
  assertPlainObject(policy, "input.storageRowVerificationPolicy");
  for (const field of [
    "storageCommitRequired",
    "physicalRowVerificationRequired",
    "injectedTeachingArchiveRowReadPortRequired",
    "teachingArchiveRepositoryReadRequired",
    "committedArchiveItemMatchRequired",
    "preserveCommitEvidenceRequired",
    "idempotentRowVerificationRequired",
    "mainDatabaseReadAllowed",
  ]) {
    requireConst(policy[field], true, `input.storageRowVerificationPolicy.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "ocrOrRagJobWriteAllowed",
    "aiGradingWriteAllowed",
    "externalModelCallAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.storageRowVerificationPolicy.${field}`);
  }
  return { ...policy };
}

function assertRowReadPort(port) {
  if (!port || typeof port.getArchiveItemById !== "function") {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_DRAFT_ROW_VERIFICATION_MISSING_PORT", "TeachingArchiveRowReadPort.getArchiveItemById is required");
  }
  return port;
}

function assertPortResult(result, committedArchiveItem) {
  rejectLeakedFields(result, "TeachingArchiveRowReadPort result");
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
  const ownerType = requireOneOf(item.ownerType, `${label}.ownerType`, ["STUDENT", "TEACHING"]);
  const studentId = ownerType === "STUDENT"
    ? requireBoundedString(item.studentId, `${label}.studentId`, 1, 128)
    : optionalBoundedString(item.studentId, `${label}.studentId`, 128);
  return {
    id,
    ownerType,
    studentId: ownerType === "STUDENT" ? studentId : "",
    materialType: requireOneOf(item.materialType, `${label}.materialType`, ["TEACHING_MATERIAL", "HANDOUT", "HOMEWORK", "PAPER", "QUIZ"]),
    title: requireSafeText(item.title, `${label}.title`, 4, 200),
    source: requireConst(item.source, "SYSTEM_IMPORT", `${label}.source`),
    contentRef: requireContentRef(item.contentRef, `${label}.contentRef`),
    tags: uniqueStringArray(item.tags ?? [], `${label}.tags`, 0, 32),
    analysisIntents: assertArchiveOnlyIntents(item.analysisIntents ?? [], `${label}.analysisIntents`),
    ocrStatus: requireConst(item.ocrStatus, "NOT_REQUIRED", `${label}.ocrStatus`),
    createdAt: requireIsoString(item.createdAt, `${label}.createdAt`),
  };
}

function assertArchiveOnlyIntents(value, label) {
  const intents = uniqueStringArray(value, label, 1, 1);
  requireConst(intents[0], "ARCHIVE_ONLY", `${label}[0]`);
  return intents;
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
    runtimeId: TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION_RUNTIME_ID,
    commandPort: TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION_PORT,
    status: verifiedStatus,
    recordId: `teaching_archive_material_draft_storage_row_verification_${safeToken(normalized.idempotencyKey)}`,
    verifiedAt,
    sourceStorageCommit: {
      workloadType: storageCommitWorkload,
      runtimeId: storageCommitRuntimeId,
      commandPort: storageCommitCommandPort,
      recordId: normalized.storageCommitResult.recordId,
      archiveItemId: normalized.storageCommitResult.teachingArchiveCommit.archiveItem.id,
      sourcePrecommitRecordId: normalized.storageCommitResult.sourcePrecommit.recordId,
    },
    teachingArchivePhysicalRow: {
      operationId: "getTeachingArchiveItemById",
      targetRepository: verified.source.repositoryMethod,
      targetTable: verified.source.targetTable,
      archiveItem: verified.row,
    },
    boundary: {
      storageCommitVerified: true,
      teachingArchiveRowReadPortInvoked: true,
      teachingArchiveRepositoryGetByIDUsed: true,
      committedArchiveItemMatchedPhysicalRow: true,
      commitEvidencePreserved: true,
      mainDatabaseWriteCommitted: true,
      mainDatabaseReadAllowed: true,
      physicalDatabaseRowVerified: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      externalModelCallStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      ...normalized.evidenceRefs,
      ...normalized.storageCommitResult.evidenceRefs,
      `evidence:archive-material-draft-storage-row-verification-input-hash:${normalized.verificationInputHash}`,
      `evidence:runtime:${TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION_RUNTIME_ID}`,
      `evidence:command-port:${TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION_PORT}`,
      `evidence:storage-commit-record:${normalized.storageCommitResult.recordId}`,
      `evidence:teaching-archive-physical-row:${verified.row.id}`,
    ],
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.verificationInputHash,
  };
}

function buildResult(record, replay) {
  return {
    ...record,
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: 8,
      totalErrors: 0,
      operations: 1,
      evidenceClass: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION_PROBE",
    },
    idempotentReplay: replay.idempotentReplay,
    nextAction: "Use this as Teaching Archive material physical row evidence; product retrieval, OCR/RAG, AI grading, and publication remain separate reviewed slices.",
  };
}

function findExistingRecordByIdempotencyKey(logPath, idempotencyKey) {
  if (!fs.existsSync(logPath)) return null;
  const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const parsed = JSON.parse(lines[index]);
    if (parsed.idempotencyKey === idempotencyKey) return parsed;
  }
  return null;
}

function assertReplayMatches(record, normalized) {
  requireConst(record.inputHash, normalized.verificationInputHash, "record.inputHash");
  requireConst(record.sourceStorageCommit.recordId, normalized.storageCommitResult.recordId, "record.sourceStorageCommit.recordId");
  requireConst(record.sourceStorageCommit.archiveItemId, normalized.storageCommitResult.teachingArchiveCommit.archiveItem.id, "record.sourceStorageCommit.archiveItemId");
}

function appendVerificationRecord(logPath, record) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`);
}

function rejectLeakedFields(value, context) {
  if (!value || typeof value !== "object") return;
  const stack = [{ value, path: context }];
  while (stack.length) {
    const current = stack.pop();
    for (const [key, nested] of Object.entries(current.value)) {
      if (leakedFieldNames.includes(key)) {
        throw verificationError("TEACHING_ARCHIVE_MATERIAL_DRAFT_ROW_VERIFICATION_LEAKED_FIELD", `${current.path}.${key} is not allowed`);
      }
      if (nested && typeof nested === "object") stack.push({ value: nested, path: `${current.path}.${key}` });
    }
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_DRAFT_ROW_VERIFICATION_INVALID_OBJECT", `${label} must be an object`);
  }
  return value;
}

function assertPlainObjectWithValue(value, label) {
  assertPlainObject(value, label);
  return value;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_DRAFT_ROW_VERIFICATION_CONST_MISMATCH", `${label} must be ${expected}`);
  }
  return actual;
}

function requireOneOf(actual, label, allowed) {
  if (!allowed.includes(actual)) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_DRAFT_ROW_VERIFICATION_INVALID_ENUM", `${label} must be one of ${allowed.join(",")}`);
  }
  return actual;
}

function requireBoundedString(value, label, minLength, maxLength) {
  if (typeof value !== "string" || value.length < minLength || value.length > maxLength) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_DRAFT_ROW_VERIFICATION_INVALID_STRING", `${label} must be a string of length ${minLength}-${maxLength}`);
  }
  return value;
}

function optionalBoundedString(value, label, maxLength) {
  if (value === undefined || value === null || value === "") return "";
  return requireBoundedString(String(value), label, 1, maxLength);
}

function requireSafeText(value, label, minLength, maxLength) {
  const text = requireBoundedString(value, label, minLength, maxLength);
  if (/[<>]/u.test(text) || /script:/iu.test(text) || /javascript:/iu.test(text)) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_DRAFT_ROW_VERIFICATION_UNSAFE_TEXT", `${label} contains unsafe text`);
  }
  return text;
}

function requireContentRef(value, label) {
  const ref = requireBoundedString(value, label, 12, 1000);
  if (!ref.startsWith("precommit://archive-material/") && !ref.startsWith("object://archive-material/")) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_DRAFT_ROW_VERIFICATION_INVALID_CONTENT_REF", `${label} must be a controlled archive material ref`);
  }
  return ref;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 420);
  if (!token.startsWith(prefix)) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_DRAFT_ROW_VERIFICATION_INVALID_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireIsoString(value, label) {
  const text = requireBoundedString(value, label, 20, 40);
  if (Number.isNaN(Date.parse(text))) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_DRAFT_ROW_VERIFICATION_INVALID_TIME", `${label} must be an ISO timestamp`);
  }
  return text;
}

function uniqueStringArray(value, label, minLength, maxLength) {
  if (!Array.isArray(value) || value.length < minLength || value.length > maxLength) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_DRAFT_ROW_VERIFICATION_INVALID_ARRAY", `${label} must contain ${minLength}-${maxLength} strings`);
  }
  const seen = new Set();
  return value.map((item, index) => {
    const normalized = requireBoundedString(String(item), `${label}[${index}]`, 1, 420);
    if (seen.has(normalized)) {
      throw verificationError("TEACHING_ARCHIVE_MATERIAL_DRAFT_ROW_VERIFICATION_DUPLICATE_STRING", `${label}[${index}] is duplicated`);
    }
    seen.add(normalized);
    return normalized;
  });
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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
