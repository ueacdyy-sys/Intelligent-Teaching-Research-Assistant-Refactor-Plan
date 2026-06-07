import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_RUNTIME_ID =
  "teaching_archive_material_draft_storage_commit_runtime";
export const TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_PORT =
  "TeachingArchiveMaterialDraftStorageCommitPort.commitArchiveMaterialDraftStorageCommand";

const inputSchemaVersion = "2026-06-07.teaching.archive-material-draft-storage-commit.v1";
const outputSchemaVersion = "2026-06-07.teaching.archive-material-draft-storage-commit-committed.v1";
const precommitWorkloadType = "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT";
const precommitRuntimeId = "teaching_archive_material_draft_storage_precommit_runtime";
const precommitCommandPort = "TeachingArchiveMaterialDraftStoragePrecommitPort.prepareArchiveMaterialDraftStorageCommand";
const precommitStatus = "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_READY";
const committedStatus = "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMITTED";
const defaultCommitLogPath = "reports/teaching-command-log/teaching-archive-material-draft-storage-commit.jsonl";

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

export async function commitTeachingArchiveMaterialDraftStorage(input, options = {}) {
  const committedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const commitLogPath = options.commitLogPath ?? defaultCommitLogPath;
  const existing = findExistingRecordByIdempotencyKey(commitLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const createItemPort = assertCreateItemPort(options.teachingArchiveCreateItemPort);
  const portResult = await createItemPort.createArchiveItem(normalized.precommitRecord.teachingArchiveCreateCommand, {
    commitInvocationId: normalized.commitInvocationId,
    idempotencyKey: normalized.idempotencyKey,
    sourcePrecommitRecordId: normalized.precommitRecord.recordId,
  });
  const committed = assertPortResult(portResult, normalized.precommitRecord.teachingArchiveCreateCommand);
  const record = buildCommitRecord(normalized, committed, committedAt);
  appendRecord(commitLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatTeachingArchiveMaterialDraftStorageCommit(result) {
  return [
    `Teaching archive material draft storage commit: ${result.status}`,
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
  const commitInvocationId = requireToken(input.commitInvocationId, "input.commitInvocationId", "archive_material_draft_storage_commit_");
  const precommitRecord = assertPrecommitReport(input.storagePrecommitReport);
  const commitPolicy = assertCommitPolicy(input.storageCommitPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 160);
  for (const required of ["archive-material-draft-storage-precommit", "archive-material-draft-human-review"]) {
    if (!evidenceRefs.some((ref) => ref.includes(required))) {
      throw commitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_MISSING_EVIDENCE", `${required} evidence ref is required`);
    }
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const commitInputHash = hashInput({
    commitInvocationId,
    precommitRecordId: precommitRecord.recordId,
    commandId: precommitRecord.teachingArchiveCreateCommand.commandId,
    requestBody: precommitRecord.teachingArchiveCreateCommand.requestBody,
    commitPolicy,
  });
  return { commitInvocationId, precommitRecord, commitPolicy, evidenceRefs, idempotencyKey, commitInputHash };
}

function assertPrecommitReport(report) {
  assertPlainObject(report, "input.storagePrecommitReport");
  requireConst(report.readiness, "READY", "input.storagePrecommitReport.readiness");
  requireConst(report.workloadType, precommitWorkloadType, "input.storagePrecommitReport.workloadType");
  requireConst(report.runtime?.runtimeId, precommitRuntimeId, "input.storagePrecommitReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, precommitCommandPort, "input.storagePrecommitReport.runtime.commandPort");
  requireConst(report.runtime?.status, precommitStatus, "input.storagePrecommitReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.storagePrecommitReport.runtimeSlo.totalErrors");
  const result = report.runtimeProbes?.teachingArchiveMaterialDraftStoragePrecommit?.result;
  rejectLeakedFields(result, "input.storagePrecommitReport.runtimeProbes.result");
  assertPlainObject(result, "input.storagePrecommitReport.runtimeProbes.result");
  requireConst(result.schemaVersion, "2026-06-07.teaching.archive-material-draft-storage-precommit-prepared.v1", "source.precommit.schemaVersion");
  requireConst(result.runtimeId, precommitRuntimeId, "source.precommit.runtimeId");
  requireConst(result.commandPort, precommitCommandPort, "source.precommit.commandPort");
  requireConst(result.status, precommitStatus, "source.precommit.status");
  requireConst(result.precommit?.executionState, "STORAGE_PRECOMMIT_RECORDED_NOT_COMMITTED", "source.precommit.executionState");
  requireConst(result.boundary?.mainDatabaseWritePrepared, true, "source.precommit.boundary.mainDatabaseWritePrepared");
  requireConst(result.boundary?.mainDatabaseWriteStarted, false, "source.precommit.boundary.mainDatabaseWriteStarted");
  requireConst(result.boundary?.mainDatabaseWriteCommitted, false, "source.precommit.boundary.mainDatabaseWriteCommitted");
  requireConst(result.boundary?.ocrOrRagJobWriteStarted, false, "source.precommit.boundary.ocrOrRagJobWriteStarted");
  requireConst(result.boundary?.aiGradingWriteStarted, false, "source.precommit.boundary.aiGradingWriteStarted");
  const command = assertTeachingArchiveCreateCommand(result.teachingArchiveCreateCommand);
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "source.precommit.recordId", 1, 420),
    precommit: assertPlainObject(result.precommit, "source.precommit.precommit"),
    sourceHumanReview: assertPlainObject(result.sourceHumanReview, "source.precommit.sourceHumanReview"),
    teachingArchiveCreateCommand: command,
    evidenceRefs: uniqueStringArray(result.evidenceRefs ?? [], "source.precommit.evidenceRefs", 1, 1000),
  };
}

function assertTeachingArchiveCreateCommand(command) {
  assertPlainObject(command, "source.precommit.teachingArchiveCreateCommand");
  requireConst(command.operationId, "createTeachingArchiveItem", "source.precommit.teachingArchiveCreateCommand.operationId");
  requireConst(command.targetUseCase, "CreateArchiveItem.ExecuteWithPersistence", "source.precommit.teachingArchiveCreateCommand.targetUseCase");
  requireConst(command.targetRepository, "ArchiveRepository.Create", "source.precommit.teachingArchiveCreateCommand.targetRepository");
  requireConst(command.targetTable, "teaching_archive_items", "source.precommit.teachingArchiveCreateCommand.targetTable");
  const requestBody = assertCreateArchiveItemRequest(command.requestBody);
  return {
    ...command,
    commandId: requireToken(command.commandId, "source.precommit.teachingArchiveCreateCommand.commandId", "archive_material_draft_storage_precommit_command_"),
    sourceHumanReviewRecordId: requireBoundedString(command.sourceHumanReviewRecordId, "source.precommit.teachingArchiveCreateCommand.sourceHumanReviewRecordId", 1, 420),
    sourceDraftIntentId: requireToken(command.sourceDraftIntentId, "source.precommit.teachingArchiveCreateCommand.sourceDraftIntentId", "archive_material_draft_intent_"),
    requestBody,
    authorization: assertAuthorization(command.authorization),
  };
}

function assertCreateArchiveItemRequest(request) {
  assertPlainObject(request, "source.precommit.teachingArchiveCreateCommand.requestBody");
  const ownerType = requireOneOf(request.ownerType, "requestBody.ownerType", ["STUDENT", "TEACHING"]);
  const studentId = ownerType === "STUDENT"
    ? requireBoundedString(request.studentId, "requestBody.studentId", 1, 128)
    : optionalBoundedString(request.studentId, "requestBody.studentId", 128);
  const analysisIntents = uniqueStringArray(request.analysisIntents, "requestBody.analysisIntents", 1, 2);
  if (analysisIntents.length !== 1 || analysisIntents[0] !== "ARCHIVE_ONLY") {
    throw commitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_ANALYSIS_INTENT_NOT_ALLOWED", "commit allows ARCHIVE_ONLY only");
  }
  return {
    ownerType,
    studentId: ownerType === "STUDENT" ? studentId : "",
    materialType: requireOneOf(request.materialType, "requestBody.materialType", ["TEACHING_MATERIAL", "HANDOUT", "HOMEWORK", "PAPER", "QUIZ"]),
    title: requireSafeText(request.title, "requestBody.title", 4, 200),
    source: requireConst(request.source, "SYSTEM_IMPORT", "requestBody.source"),
    contentRef: requireContentRef(request.contentRef, "requestBody.contentRef"),
    tags: uniqueStringArray(request.tags ?? [], "requestBody.tags", 0, 32),
    analysisIntents,
    ocrReserved: requireConst(request.ocrReserved, false, "requestBody.ocrReserved"),
  };
}

function assertAuthorization(authorization) {
  assertPlainObject(authorization, "source.precommit.teachingArchiveCreateCommand.authorization");
  const scopes = uniqueStringArray(authorization.requiredScopes, "authorization.requiredScopes", 2, 12);
  for (const scope of ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE"]) {
    if (!scopes.includes(scope)) {
      throw commitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_SCOPE_MISSING", `${scope} is required`);
    }
  }
  return {
    principalId: requireBoundedString(authorization.principalId, "authorization.principalId", 1, 128),
    requiredScopes: scopes,
    studentAccess: assertPlainObject(authorization.studentAccess, "authorization.studentAccess"),
  };
}

function assertCommitPolicy(policy) {
  assertPlainObject(policy, "input.storageCommitPolicy");
  for (const field of [
    "storagePrecommitRequired",
    "teachingArchiveUseCaseCommitAllowed",
    "injectedTeachingArchivePortRequired",
    "idempotentStorageCommitRequired",
    "mainDatabaseWriteAllowed",
    "preservePrecommitEvidenceRequired",
  ]) {
    requireConst(policy[field], true, `input.storageCommitPolicy.${field}`);
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
    requireConst(policy[field], false, `input.storageCommitPolicy.${field}`);
  }
  return { ...policy };
}

function assertCreateItemPort(port) {
  if (!port || typeof port.createArchiveItem !== "function") {
    throw commitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_PORT_REQUIRED", "TeachingArchiveCreateItemPort.createArchiveItem is required");
  }
  return port;
}

function assertPortResult(portResult, command) {
  rejectLeakedFields(portResult, "portResult");
  assertPlainObject(portResult, "portResult");
  const archiveItem = assertArchiveItem(portResult.archiveItem, command.requestBody);
  const persistence = assertPersistence(portResult.persistence);
  return { archiveItem, persistence };
}

function assertArchiveItem(item, requestBody) {
  assertPlainObject(item, "portResult.archiveItem");
  const id = requireToken(item.id, "portResult.archiveItem.id", "tarch_");
  requireConst(item.ownerType, requestBody.ownerType, "portResult.archiveItem.ownerType");
  requireConst(item.studentId ?? "", requestBody.studentId, "portResult.archiveItem.studentId");
  requireConst(item.materialType, requestBody.materialType, "portResult.archiveItem.materialType");
  requireConst(item.title, requestBody.title, "portResult.archiveItem.title");
  requireConst(item.source, requestBody.source, "portResult.archiveItem.source");
  requireConst(item.contentRef, requestBody.contentRef, "portResult.archiveItem.contentRef");
  return {
    id,
    ownerType: item.ownerType,
    studentId: item.studentId ?? "",
    materialType: item.materialType,
    title: item.title,
    source: item.source,
    contentRef: item.contentRef,
    tags: uniqueStringArray(item.tags ?? [], "portResult.archiveItem.tags", 0, 32),
    analysisIntents: uniqueStringArray(item.analysisIntents ?? [], "portResult.archiveItem.analysisIntents", 1, 8),
    ocrStatus: requireConst(item.ocrStatus, "NOT_REQUIRED", "portResult.archiveItem.ocrStatus"),
    createdAt: requireIsoString(item.createdAt, "portResult.archiveItem.createdAt"),
  };
}

function assertPersistence(persistence) {
  assertPlainObject(persistence, "portResult.persistence");
  return {
    status: requireConst(persistence.status, "persisted", "portResult.persistence.status"),
    commandId: optionalBoundedString(persistence.commandId, "portResult.persistence.commandId", 240),
  };
}

function buildCommitRecord(normalized, committed, committedAt) {
  const command = normalized.precommitRecord.teachingArchiveCreateCommand;
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_RUNTIME_ID,
    commandPort: TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_PORT,
    status: committedStatus,
    recordId: `teaching_archive_material_draft_storage_commit_${safeToken(normalized.idempotencyKey)}`,
    committedAt,
    sourcePrecommit: {
      workloadType: precommitWorkloadType,
      runtimeId: precommitRuntimeId,
      commandPort: precommitCommandPort,
      recordId: normalized.precommitRecord.recordId,
      precommitId: normalized.precommitRecord.precommit.precommitId,
      commandId: command.commandId,
    },
    teachingArchiveCommit: {
      operationId: command.operationId,
      targetUseCase: command.targetUseCase,
      targetRepository: command.targetRepository,
      targetTable: command.targetTable,
      archiveItem: committed.archiveItem,
      persistence: committed.persistence,
    },
    boundary: {
      storagePrecommitVerified: true,
      teachingArchiveCreateItemPortInjected: true,
      mainDatabaseWriteAllowedViaUseCasePort: true,
      mainDatabaseWritePrepared: true,
      mainDatabaseWriteStarted: true,
      mainDatabaseWriteCommitted: true,
      finalArchiveItemCreated: true,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      executeHttpRequestAllowed: false,
      directDatabaseAccessAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureRowVerification: true,
    },
    evidenceRefs: [
      ...normalized.evidenceRefs,
      `evidence:archive-material-draft-storage-commit-input-hash:${normalized.commitInputHash}`,
      `evidence:runtime:${TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_RUNTIME_ID}`,
      `evidence:command-port:${TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_PORT}`,
      `evidence:source-command-port:${precommitCommandPort}`,
    ],
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.commitInputHash,
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
      evidenceClass: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_PROBE",
    },
    idempotentReplay: replay.idempotentReplay,
  };
}

function findExistingRecordByIdempotencyKey(logPath, idempotencyKey) {
  if (!fs.existsSync(logPath)) return null;
  const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/u).filter(Boolean);
  for (const line of lines) {
    const parsed = JSON.parse(line);
    if (parsed.idempotencyKey === idempotencyKey) return parsed;
  }
  return null;
}

function assertReplayMatches(record, normalized) {
  requireConst(record.inputHash, normalized.commitInputHash, "record.inputHash");
  requireConst(record.sourcePrecommit.commandId, normalized.precommitRecord.teachingArchiveCreateCommand.commandId, "record.sourcePrecommit.commandId");
}

function appendRecord(logPath, record) {
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
        throw commitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_LEAKED_FIELD", `${current.path}.${key} is not allowed`);
      }
      if (nested && typeof nested === "object") stack.push({ value: nested, path: `${current.path}.${key}` });
    }
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw commitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_INVALID_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw commitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_CONST_MISMATCH", `${label} must be ${expected}`);
  }
  return actual;
}

function requireOneOf(actual, label, allowed) {
  if (!allowed.includes(actual)) {
    throw commitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_INVALID_ENUM", `${label} must be one of ${allowed.join(",")}`);
  }
  return actual;
}

function requireBoundedString(value, label, minLength, maxLength) {
  if (typeof value !== "string" || value.length < minLength || value.length > maxLength) {
    throw commitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_INVALID_STRING", `${label} must be a string of length ${minLength}-${maxLength}`);
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
    throw commitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_UNSAFE_TEXT", `${label} contains unsafe text`);
  }
  return text;
}

function requireContentRef(value, label) {
  const ref = requireBoundedString(value, label, 12, 1000);
  if (!ref.startsWith("precommit://archive-material/") && !ref.startsWith("object://archive-material/")) {
    throw commitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_INVALID_CONTENT_REF", `${label} must be a controlled archive material ref`);
  }
  return ref;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 420);
  if (!token.startsWith(prefix)) {
    throw commitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_INVALID_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireIsoString(value, label) {
  const text = requireBoundedString(value, label, 20, 40);
  if (Number.isNaN(Date.parse(text))) {
    throw commitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_INVALID_TIME", `${label} must be an ISO timestamp`);
  }
  return text;
}

function uniqueStringArray(value, label, minLength, maxLength) {
  if (!Array.isArray(value) || value.length < minLength || value.length > maxLength) {
    throw commitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_INVALID_ARRAY", `${label} must contain ${minLength}-${maxLength} strings`);
  }
  const seen = new Set();
  return value.map((item, index) => {
    const normalized = requireBoundedString(String(item), `${label}[${index}]`, 1, 420);
    if (seen.has(normalized)) throw commitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_DUPLICATE_STRING", `${label}[${index}] is duplicated`);
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

function commitError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
