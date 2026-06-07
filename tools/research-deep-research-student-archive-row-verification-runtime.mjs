import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_RUNTIME_ID = "research_deep_research_student_archive_row_verification_runtime";
export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_COMMAND_PORT = "DeepResearchStudentArchiveRowVerificationPort.verifyTeachingArchivePhysicalRow";
export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_READY = "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_READY";

const inputSchemaVersion = "2026-06-05.research.deep-research-student-archive-row-verification.v1";
const outputSchemaVersion = "2026-06-05.research.deep-research-student-archive-row-verification-verified.v1";
const commitSchemaVersion = "2026-06-05.research.deep-research-student-archive-storage-commit-committed.v1";
const commitRuntimeId = "research_deep_research_student_archive_storage_commit_runtime";
const commitCommandPort = "DeepResearchStudentArchiveStorageCommitPort.commitTeachingArchiveCreateCommand";
const defaultVerificationLogPath = "reports/research-command-log/deep-research-student-archive-row-verification.jsonl";

export async function verifyDeepResearchStudentArchivePhysicalRow(input, options = {}) {
  const verifiedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const verificationLogPath = options.verificationLogPath ?? defaultVerificationLogPath;
  const existing = findExistingRecordByIdempotencyKey(verificationLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const rowReadPort = assertRowReadPort(options.teachingArchiveRowReadPort);
  const archiveItemId = normalized.commitOutput.teachingArchiveCommit.archiveItem.id;
  const portResult = await rowReadPort.getArchiveItemById(archiveItemId, {
    verificationInvocationId: normalized.verificationInvocationId,
    idempotencyKey: normalized.idempotencyKey,
    sourceCommitRecordId: normalized.commitOutput.recordId,
  });
  const verified = assertPortResult(portResult, normalized.commitOutput.teachingArchiveCommit.archiveItem);
  const record = buildVerificationRecord(normalized, verified, verifiedAt);
  appendVerificationRecord(verificationLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatDeepResearchStudentArchiveRowVerification(result) {
  return [
    `Research deep_research student archive row verification: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Archive item: ${result.teachingArchivePhysicalRow.archiveItem.id}`,
    `Target table: ${result.teachingArchivePhysicalRow.targetTable}`,
    `Physical row verified: ${result.boundary.physicalDatabaseRowVerified}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const verificationInvocationId = requireString(input.verificationInvocationId, "input.verificationInvocationId");
  const commitOutput = assertCommitOutput(input.studentArchiveStorageCommitOutput);
  const verificationPolicy = assertVerificationPolicy(input.studentArchiveRowVerificationPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 240);
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 240);
  const verificationInputHash = hashInput({
    verificationInvocationId,
    commitRecordId: commitOutput.recordId,
    archiveItem: commitOutput.teachingArchiveCommit.archiveItem,
    verificationPolicy,
  });
  return { verificationInvocationId, commitOutput, verificationPolicy, evidenceRefs, idempotencyKey, verificationInputHash };
}

function assertCommitOutput(output) {
  assertPlainObject(output, "input.studentArchiveStorageCommitOutput");
  requireConst(output.schemaVersion, commitSchemaVersion, "input.studentArchiveStorageCommitOutput.schemaVersion");
  requireConst(output.runtimeId, commitRuntimeId, "input.studentArchiveStorageCommitOutput.runtimeId");
  requireConst(output.commandPort, commitCommandPort, "input.studentArchiveStorageCommitOutput.commandPort");
  requireConst(output.status, "TEACHING_ARCHIVE_MAIN_DB_STORAGE_COMMITTED", "input.studentArchiveStorageCommitOutput.status");
  const commit = assertTeachingArchiveCommit(output.teachingArchiveCommit);
  assertCommitBoundary(output.boundary);
  return {
    ...output,
    recordId: requireString(output.recordId, "input.studentArchiveStorageCommitOutput.recordId"),
    idempotencyKey: requireString(output.idempotencyKey, "input.studentArchiveStorageCommitOutput.idempotencyKey"),
    sourcePrecommit: assertPlainObjectWithValue(output.sourcePrecommit, "input.studentArchiveStorageCommitOutput.sourcePrecommit"),
    teachingArchiveCommit: commit,
    evidenceRefs: uniqueStringArray(output.evidenceRefs, "input.studentArchiveStorageCommitOutput.evidenceRefs", 1, 1400),
  };
}

function assertTeachingArchiveCommit(commit) {
  assertPlainObject(commit, "input.studentArchiveStorageCommitOutput.teachingArchiveCommit");
  requireConst(commit.operationId, "createTeachingArchiveItem", "input.studentArchiveStorageCommitOutput.teachingArchiveCommit.operationId");
  requireConst(commit.targetUseCase, "CreateArchiveItem.ExecuteWithPersistence", "input.studentArchiveStorageCommitOutput.teachingArchiveCommit.targetUseCase");
  requireConst(commit.targetRepository, "ArchiveRepository.Create", "input.studentArchiveStorageCommitOutput.teachingArchiveCommit.targetRepository");
  requireConst(commit.targetTable, "teaching_archive_items", "input.studentArchiveStorageCommitOutput.teachingArchiveCommit.targetTable");
  return {
    ...commit,
    archiveItem: assertArchiveItem(commit.archiveItem, "input.studentArchiveStorageCommitOutput.teachingArchiveCommit.archiveItem"),
    persistence: assertPersistence(commit.persistence),
  };
}

function assertPersistence(persistence) {
  assertPlainObject(persistence, "input.studentArchiveStorageCommitOutput.teachingArchiveCommit.persistence");
  return {
    status: requireConst(persistence.status, "persisted", "input.studentArchiveStorageCommitOutput.teachingArchiveCommit.persistence.status"),
    commandId: typeof persistence.commandId === "string" ? persistence.commandId : "",
  };
}

function assertArchiveItem(item, label) {
  assertPlainObject(item, label);
  const id = requireString(item.id, `${label}.id`);
  if (!id.startsWith("tarch_")) {
    throw verificationError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_INVALID_ARCHIVE_ID", "archive item id must use tarch_ prefix");
  }
  return {
    id,
    ownerType: requireConst(item.ownerType, "STUDENT", `${label}.ownerType`),
    studentId: requireBoundedString(item.studentId, `${label}.studentId`, 1, 128),
    materialType: requireEnum(item.materialType, `${label}.materialType`, ["QUIZ", "PAPER", "HANDOUT", "HOMEWORK"]),
    title: requireSafeText(item.title, `${label}.title`, 1, 200),
    source: requireConst(item.source, "SYSTEM_IMPORT", `${label}.source`),
    contentRef: requireBoundedString(item.contentRef, `${label}.contentRef`, 1, 1000),
    tags: uniqueBoundedStringArray(item.tags ?? [], `${label}.tags`, 0, 32, 1, 64),
    analysisIntents: uniqueStringArray(item.analysisIntents ?? [], `${label}.analysisIntents`, 1, 8),
    ocrStatus: requireEnum(item.ocrStatus, `${label}.ocrStatus`, ["RESERVED", "NOT_REQUIRED"]),
    createdAt: requireDateTime(item.createdAt, `${label}.createdAt`),
  };
}

function assertCommitBoundary(boundary) {
  assertPlainObject(boundary, "input.studentArchiveStorageCommitOutput.boundary");
  for (const field of ["mainDatabaseWritePrepared", "mainDatabaseWriteStarted", "mainDatabaseWriteCommitted"]) {
    requireConst(boundary[field], true, `input.studentArchiveStorageCommitOutput.boundary.${field}`);
  }
  for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "externalModelCallStarted", "localToolMutationAllowed", "swarmAllowed"]) {
    requireConst(boundary[field], false, `input.studentArchiveStorageCommitOutput.boundary.${field}`);
  }
}

function assertVerificationPolicy(policy) {
  assertPlainObject(policy, "input.studentArchiveRowVerificationPolicy");
  for (const field of [
    "storageCommitRequired",
    "physicalRowVerificationRequired",
    "injectedTeachingArchiveRowReadPortRequired",
    "teachingArchiveRepositoryReadRequired",
    "committedArchiveItemMatchRequired",
    "idempotentRowVerificationRequired",
    "mainDatabaseReadAllowed",
  ]) {
    requireConst(policy[field], true, `input.studentArchiveRowVerificationPolicy.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "externalModelCallAllowed",
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
    throw verificationError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_MISSING_PORT", "TeachingArchiveRowReadPort.getArchiveItemById is required");
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
    recordType: "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION",
    recordId: `research_deep_research_student_archive_row_verification_${safeToken(normalized.idempotencyKey)}`,
    recordedAt: verifiedAt,
    runtimeId: RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_RUNTIME_ID,
    commandPort: RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_COMMAND_PORT,
    status: "TEACHING_ARCHIVE_PHYSICAL_ROW_VERIFIED",
    verificationInvocationId: normalized.verificationInvocationId,
    sourceCommit: {
      commitRecordId: normalized.commitOutput.recordId,
      archiveItemId: normalized.commitOutput.teachingArchiveCommit.archiveItem.id,
      targetUseCase: normalized.commitOutput.teachingArchiveCommit.targetUseCase,
      targetRepository: normalized.commitOutput.teachingArchiveCommit.targetRepository,
    },
    teachingArchivePhysicalRow: {
      operationId: "getTeachingArchiveItemById",
      targetRepository: verified.source.repositoryMethod,
      targetTable: verified.source.targetTable,
      archiveItem: verified.row,
    },
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.commitOutput.evidenceRefs,
        `evidence:student-archive-row-verification-input-hash:${normalized.verificationInputHash}`,
        `evidence:runtime:${RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_RUNTIME_ID}`,
        `evidence:command-port:${RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_COMMAND_PORT}`,
        `evidence:student-archive-storage-commit-record:${normalized.commitOutput.recordId}`,
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
    studentArchiveStorageCommitVerified: true,
    teachingArchiveRowReadPortInvoked: true,
    teachingArchiveRepositoryGetByIDUsed: true,
    committedArchiveItemMatchedPhysicalRow: true,
    projectionEvidencePreserved: true,
    studentAudienceScopeEnforced: true,
    mainDatabaseWritePrepared: true,
    mainDatabaseWriteStarted: true,
    mainDatabaseWriteCommitted: true,
    physicalDatabaseRowVerified: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    externalModelCallStarted: false,
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
    sourceCommit: record.sourceCommit,
    teachingArchivePhysicalRow: record.teachingArchivePhysicalRow,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 300,
      evidenceClass: "ASYNC_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_BOUNDARY",
    },
    nextAction: "Use this as physical Teaching Archive row evidence for the deep_research student archive flow; continue module-by-module root requirement refactor.",
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
    if (record?.recordType === "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.verificationInvocationId !== normalized.verificationInvocationId ||
    existing.sourceCommit?.commitRecordId !== normalized.commitOutput.recordId ||
    existing.sourceCommit?.archiveItemId !== normalized.commitOutput.teachingArchiveCommit.archiveItem.id ||
    existing.evidence?.verificationInputHash !== normalized.verificationInputHash) {
    throw verificationError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different row verification");
  }
}

function assertPlainObjectWithValue(value, label) {
  assertPlainObject(value, label);
  return value;
}

function requireSafeText(value, label, minLength, maxLength) {
  const text = requireBoundedString(value, label, minLength, maxLength);
  if (/[<>]/u.test(text)) {
    throw verificationError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_UNSAFE_TEXT", `${label} must be encoded safe text`);
  }
  return text;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw verificationError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireBoundedString(value, label, minLength, maxLength) {
  const text = requireString(value, label);
  if (text.length < minLength || text.length > maxLength) {
    throw verificationError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_INVALID_INPUT", `${label} length must be ${minLength}-${maxLength}`);
  }
  return text;
}

function requireEnum(value, label, allowed) {
  const text = requireString(value, label);
  if (!allowed.includes(text)) {
    throw verificationError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_INVALID_INPUT", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireDateTime(value, label) {
  const text = requireString(value, label);
  if (Number.isNaN(Date.parse(text))) {
    throw verificationError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_INVALID_INPUT", `${label} must be an ISO date-time`);
  }
  return text;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw verificationError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_BOUNDARY_VIOLATION", `${label} must be ${expected}`);
  }
  return expected;
}

function uniqueStringArray(value, label, minItems, maxItems) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw verificationError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_INVALID_INPUT", `${label} must contain ${minItems}-${maxItems} items`);
  }
  const items = value.map((item) => requireString(item, label));
  if (new Set(items).size !== items.length) {
    throw verificationError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_INVALID_INPUT", `${label} must be unique`);
  }
  return items;
}

function uniqueBoundedStringArray(value, label, minItems, maxItems, minLength, maxLength) {
  return uniqueStringArray(value, label, minItems, maxItems)
    .map((item) => requireBoundedString(item, `${label}[]`, minLength, maxLength));
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw verificationError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_INVALID_INPUT", `${label} must be an object`);
  }
}

function hashInput(input) {
  return `sha256:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`;
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
