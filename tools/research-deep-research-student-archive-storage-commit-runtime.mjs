import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_RUNTIME_ID = "research_deep_research_student_archive_storage_commit_runtime";
export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_COMMAND_PORT = "DeepResearchStudentArchiveStorageCommitPort.commitTeachingArchiveCreateCommand";
export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_READY = "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_READY";

const inputSchemaVersion = "2026-06-05.research.deep-research-student-archive-storage-commit.v1";
const outputSchemaVersion = "2026-06-05.research.deep-research-student-archive-storage-commit-committed.v1";
const precommitSchemaVersion = "2026-06-05.research.deep-research-student-archive-storage-precommit-prepared.v1";
const precommitRuntimeId = "research_deep_research_student_archive_storage_precommit_runtime";
const precommitCommandPort = "DeepResearchStudentArchiveStoragePrecommitPort.prepareTeachingArchiveCreateCommand";
const defaultCommitLogPath = "reports/research-command-log/deep-research-student-archive-storage-commit.jsonl";

export async function commitTeachingArchiveStorage(input, options = {}) {
  const committedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const commitLogPath = options.commitLogPath ?? defaultCommitLogPath;
  const existing = findExistingRecordByIdempotencyKey(commitLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const createPort = assertCreateItemPort(options.teachingArchiveCreateItemPort);
  const portResult = await createPort.createArchiveItem(normalized.precommitOutput.teachingArchiveCreateCommand, {
    commitInvocationId: normalized.commitInvocationId,
    idempotencyKey: normalized.idempotencyKey,
    sourcePrecommitRecordId: normalized.precommitOutput.recordId,
  });
  const committed = assertPortResult(portResult, normalized.precommitOutput.teachingArchiveCreateCommand);
  const record = buildCommitRecord(normalized, committed, committedAt);
  appendCommitRecord(commitLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatDeepResearchStudentArchiveStorageCommit(result) {
  return [
    `Research deep_research student archive storage commit: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Archive item: ${result.teachingArchiveCommit.archiveItem.id}`,
    `Persistence: ${result.teachingArchiveCommit.persistence.status}`,
    `Main DB committed: ${result.boundary.mainDatabaseWriteCommitted}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const commitInvocationId = requireString(input.commitInvocationId, "input.commitInvocationId");
  const precommitOutput = assertPrecommitOutput(input.studentArchiveStoragePrecommitOutput);
  const commitPolicy = assertCommitPolicy(input.studentArchiveCommitPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 240);
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 240);
  const commitInputHash = hashInput({
    commitInvocationId,
    precommitRecordId: precommitOutput.recordId,
    preparedCommandId: precommitOutput.teachingArchiveCreateCommand.commandId,
    requestBody: precommitOutput.teachingArchiveCreateCommand.requestBody,
    commitPolicy,
  });
  return { commitInvocationId, precommitOutput, commitPolicy, evidenceRefs, idempotencyKey, commitInputHash };
}

function assertPrecommitOutput(output) {
  assertPlainObject(output, "input.studentArchiveStoragePrecommitOutput");
  requireConst(output.schemaVersion, precommitSchemaVersion, "input.studentArchiveStoragePrecommitOutput.schemaVersion");
  requireConst(output.runtimeId, precommitRuntimeId, "input.studentArchiveStoragePrecommitOutput.runtimeId");
  requireConst(output.commandPort, precommitCommandPort, "input.studentArchiveStoragePrecommitOutput.commandPort");
  requireConst(output.status, "TEACHING_ARCHIVE_MAIN_DB_STORAGE_PRECOMMIT_PREPARED", "input.studentArchiveStoragePrecommitOutput.status");
  const command = assertTeachingArchiveCreateCommand(output.teachingArchiveCreateCommand);
  assertPrecommitBoundary(output.boundary);
  return {
    ...output,
    recordId: requireString(output.recordId, "input.studentArchiveStoragePrecommitOutput.recordId"),
    idempotencyKey: requireString(output.idempotencyKey, "input.studentArchiveStoragePrecommitOutput.idempotencyKey"),
    sourceProjection: assertSourceProjection(output.sourceProjection),
    teachingArchiveCreateCommand: command,
    evidenceRefs: uniqueStringArray(output.evidenceRefs, "input.studentArchiveStoragePrecommitOutput.evidenceRefs", 1, 1200),
  };
}

function assertSourceProjection(source) {
  assertPlainObject(source, "input.studentArchiveStoragePrecommitOutput.sourceProjection");
  return {
    projectionRecordId: requireString(source.projectionRecordId, "input.studentArchiveStoragePrecommitOutput.sourceProjection.projectionRecordId"),
    projectionId: requireString(source.projectionId, "input.studentArchiveStoragePrecommitOutput.sourceProjection.projectionId"),
    archiveScopeRef: requireString(source.archiveScopeRef, "input.studentArchiveStoragePrecommitOutput.sourceProjection.archiveScopeRef"),
    claimCount: requireIntegerBetween(source.claimCount, "input.studentArchiveStoragePrecommitOutput.sourceProjection.claimCount", 1, 200),
    citationCount: requireIntegerBetween(source.citationCount, "input.studentArchiveStoragePrecommitOutput.sourceProjection.citationCount", 1, 500),
    sourceHashCount: requireIntegerBetween(source.sourceHashCount, "input.studentArchiveStoragePrecommitOutput.sourceProjection.sourceHashCount", 1, 500),
  };
}

function assertTeachingArchiveCreateCommand(command) {
  assertPlainObject(command, "input.studentArchiveStoragePrecommitOutput.teachingArchiveCreateCommand");
  requireConst(command.operationId, "createTeachingArchiveItem", "input.studentArchiveStoragePrecommitOutput.teachingArchiveCreateCommand.operationId");
  requireConst(command.targetUseCase, "CreateArchiveItem.ExecuteWithPersistence", "input.studentArchiveStoragePrecommitOutput.teachingArchiveCreateCommand.targetUseCase");
  requireConst(command.targetRepository, "ArchiveRepository.Create", "input.studentArchiveStoragePrecommitOutput.teachingArchiveCreateCommand.targetRepository");
  requireConst(command.targetTable, "teaching_archive_items", "input.studentArchiveStoragePrecommitOutput.teachingArchiveCreateCommand.targetTable");
  const principal = assertPrincipalContext(command.principalContextHeader);
  const body = assertRequestBody(command.requestBody, principal);
  return {
    ...command,
    commandId: requireString(command.commandId, "input.studentArchiveStoragePrecommitOutput.teachingArchiveCreateCommand.commandId"),
    principalContextHeader: principal,
    requestBody: body,
  };
}

function assertPrincipalContext(principal) {
  assertPlainObject(principal, "input.studentArchiveStoragePrecommitOutput.teachingArchiveCreateCommand.principalContextHeader");
  const normalized = {
    principalId: requireString(principal.principalId, "principalContextHeader.principalId"),
    subjectType: requireConst(principal.subjectType, "SERVICE", "principalContextHeader.subjectType"),
    role: requireConst(principal.role, "SERVICE", "principalContextHeader.role"),
    entryPoint: requireConst(principal.entryPoint, "AGENT_INTERNAL", "principalContextHeader.entryPoint"),
    scopes: uniqueStringArray(principal.scopes, "principalContextHeader.scopes", 1, 32),
    studentAccess: assertStudentAccess(principal.studentAccess),
    sessionId: requireString(principal.sessionId, "principalContextHeader.sessionId"),
  };
  for (const scope of ["RESEARCH_READ", "STUDENT_ARCHIVE_WRITE", "STUDENT_ASSIGNED_READ"]) {
    if (!normalized.scopes.includes(scope)) {
      throw commitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_MISSING_SCOPE", `${scope} scope is required`);
    }
  }
  return { ...principal, ...normalized };
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

function assertRequestBody(body, principal) {
  assertPlainObject(body, "input.studentArchiveStoragePrecommitOutput.teachingArchiveCreateCommand.requestBody");
  const studentId = requireBoundedString(body.studentId, "requestBody.studentId", 1, 128);
  if (principal.studentAccess.mode === "ASSIGNED" && !principal.studentAccess.studentIds.includes(studentId)) {
    throw commitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_STUDENT_SCOPE_MISMATCH", "principal studentAccess must include requestBody.studentId");
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

function assertPrecommitBoundary(boundary) {
  assertPlainObject(boundary, "input.studentArchiveStoragePrecommitOutput.boundary");
  for (const field of [
    "studentArchiveProjectionOutputVerified",
    "teachingArchiveCreateItemCommandPrepared",
    "teachingArchiveDomainValidationPrepared",
    "projectionEvidencePreserved",
    "studentAudienceScopeEnforced",
    "mainDatabaseWritePrepared",
  ]) {
    requireConst(boundary[field], true, `input.studentArchiveStoragePrecommitOutput.boundary.${field}`);
  }
  for (const field of [
    "mainDatabaseWriteStarted",
    "mainDatabaseWriteCommitted",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "externalModelCallStarted",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(boundary[field], false, `input.studentArchiveStoragePrecommitOutput.boundary.${field}`);
  }
}

function assertCommitPolicy(policy) {
  assertPlainObject(policy, "input.studentArchiveCommitPolicy");
  for (const field of [
    "storagePrecommitRequired",
    "teachingArchiveUseCaseCommitAllowed",
    "injectedTeachingArchivePortRequired",
    "teachingArchiveDomainValidationRequired",
    "persistedOutcomeRequired",
    "preserveProjectionEvidenceRequired",
    "idempotentStorageCommitRequired",
    "mainDatabaseWriteAllowed",
  ]) {
    requireConst(policy[field], true, `input.studentArchiveCommitPolicy.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "directPublicationAllowed",
    "externalModelCallAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.studentArchiveCommitPolicy.${field}`);
  }
  return { ...policy };
}

function assertCreateItemPort(port) {
  if (!port || typeof port.createArchiveItem !== "function") {
    throw commitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_MISSING_PORT", "TeachingArchiveCreateItemPort.createArchiveItem is required");
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
  const id = requireString(item.id, "result.archiveItem.id");
  if (!id.startsWith("tarch_")) {
    throw commitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_INVALID_ARCHIVE_ID", "archive item id must use tarch_ prefix");
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
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT",
    recordId: `research_deep_research_student_archive_storage_commit_${safeToken(normalized.idempotencyKey)}`,
    recordedAt: committedAt,
    runtimeId: RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_RUNTIME_ID,
    commandPort: RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_COMMAND_PORT,
    status: "TEACHING_ARCHIVE_MAIN_DB_STORAGE_COMMITTED",
    commitInvocationId: normalized.commitInvocationId,
    sourcePrecommit: {
      precommitRecordId: normalized.precommitOutput.recordId,
      preparedCommandId: normalized.precommitOutput.teachingArchiveCreateCommand.commandId,
      sourceProjection: normalized.precommitOutput.sourceProjection,
    },
    teachingArchiveCommit: {
      operationId: "createTeachingArchiveItem",
      targetUseCase: "CreateArchiveItem.ExecuteWithPersistence",
      targetRepository: "ArchiveRepository.Create",
      targetTable: "teaching_archive_items",
      archiveItem: committed.archiveItem,
      persistence: committed.persistence,
    },
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.precommitOutput.evidenceRefs,
        `evidence:student-archive-storage-commit-input-hash:${normalized.commitInputHash}`,
        `evidence:runtime:${RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_RUNTIME_ID}`,
        `evidence:command-port:${RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_COMMAND_PORT}`,
        `evidence:student-archive-storage-precommit-record:${normalized.precommitOutput.recordId}`,
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
    studentArchiveStoragePrecommitVerified: true,
    teachingArchiveUseCasePortInvoked: true,
    teachingArchiveDomainValidationExecuted: true,
    teachingArchiveRepositoryPersisted: true,
    projectionEvidencePreserved: true,
    studentAudienceScopeEnforced: true,
    studentArchiveProjectionWritten: true,
    studentArchivePersisted: true,
    studentArchiveWriteStarted: true,
    mainDatabaseWritePrepared: true,
    mainDatabaseWriteStarted: true,
    mainDatabaseWriteCommitted: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    finalAnswerPublished: false,
    publicationCandidateCreated: false,
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
    sourcePrecommit: record.sourcePrecommit,
    teachingArchiveCommit: record.teachingArchiveCommit,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 300,
      evidenceClass: "ASYNC_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_BOUNDARY",
    },
    nextAction: "Use this committed Teaching Archive item as the source for physical row verification; SDD 0259 verifies the teaching_archive_items row through an injected row read port.",
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
    if (record?.recordType === "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.commitInvocationId !== normalized.commitInvocationId ||
    existing.sourcePrecommit?.precommitRecordId !== normalized.precommitOutput.recordId ||
    existing.sourcePrecommit?.preparedCommandId !== normalized.precommitOutput.teachingArchiveCreateCommand.commandId ||
    existing.evidence?.commitInputHash !== normalized.commitInputHash) {
    throw commitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different storage commit");
  }
}

function requireSafeText(value, label, minLength, maxLength) {
  const text = requireBoundedString(value, label, minLength, maxLength);
  if (/[<>]/u.test(text)) {
    throw commitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_UNSAFE_TEXT", `${label} must be encoded safe text`);
  }
  return text;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw commitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireBoundedString(value, label, minLength, maxLength) {
  const text = requireString(value, label);
  if (text.length < minLength || text.length > maxLength) {
    throw commitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_INVALID_INPUT", `${label} length must be ${minLength}-${maxLength}`);
  }
  return text;
}

function requireEnum(value, label, allowed) {
  const text = requireString(value, label);
  if (!allowed.includes(text)) {
    throw commitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_INVALID_INPUT", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw commitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_INVALID_INPUT", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw commitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_INVALID_INPUT", `${label} must be boolean`);
  }
  return value;
}

function requireDateTime(value, label) {
  const text = requireString(value, label);
  if (Number.isNaN(Date.parse(text))) {
    throw commitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_INVALID_INPUT", `${label} must be an ISO date-time`);
  }
  return text;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw commitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_BOUNDARY_VIOLATION", `${label} must be ${expected}`);
  }
  return expected;
}

function uniqueStringArray(value, label, minItems, maxItems) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw commitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_INVALID_INPUT", `${label} must contain ${minItems}-${maxItems} items`);
  }
  const items = value.map((item) => requireString(item, label));
  if (new Set(items).size !== items.length) {
    throw commitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_INVALID_INPUT", `${label} must be unique`);
  }
  return items;
}

function uniqueBoundedStringArray(value, label, minItems, maxItems, minLength, maxLength) {
  return uniqueStringArray(value, label, minItems, maxItems)
    .map((item) => requireBoundedString(item, `${label}[]`, minLength, maxLength));
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw commitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_INVALID_INPUT", `${label} must be an object`);
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

function commitError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
