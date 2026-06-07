import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_RUNTIME_ID = "research_deep_research_student_archive_storage_precommit_runtime";
export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_COMMAND_PORT = "DeepResearchStudentArchiveStoragePrecommitPort.prepareTeachingArchiveCreateCommand";
export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_READY = "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_READY";

const inputSchemaVersion = "2026-06-05.research.deep-research-student-archive-storage-precommit.v1";
const outputSchemaVersion = "2026-06-05.research.deep-research-student-archive-storage-precommit-prepared.v1";
const projectionSchemaVersion = "2026-06-05.research.deep-research-student-archive-projection-recorded.v1";
const projectionRuntimeId = "research_deep_research_student_archive_projection_runtime";
const projectionCommandPort = "DeepResearchStudentArchiveProjectionPort.projectReviewedStudentArchiveEntry";
const defaultPrecommitLogPath = "reports/research-command-log/deep-research-student-archive-storage-precommit.jsonl";

export function prepareTeachingArchiveStoragePrecommit(input, options = {}) {
  const preparedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const precommitLogPath = options.precommitLogPath ?? defaultPrecommitLogPath;
  const existing = findExistingRecordByIdempotencyKey(precommitLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const record = buildPrecommitRecord(normalized, preparedAt);
  appendPrecommitRecord(precommitLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatDeepResearchStudentArchiveStoragePrecommit(result) {
  return [
    `Research deep_research student archive storage precommit: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Projection: ${result.sourceProjection.projectionId}`,
    `Prepared command: ${result.teachingArchiveCreateCommand.commandId}`,
    `Main DB started: ${result.boundary.mainDatabaseWriteStarted}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const precommitInvocationId = requireString(input.precommitInvocationId, "input.precommitInvocationId");
  const principal = assertTeachingArchiveWritePrincipal(input.principal);
  const projectionOutput = assertProjectionOutput(input.studentArchiveProjectionOutput);
  const storagePolicy = assertStoragePolicy(input.studentArchiveStoragePolicy);
  const storageRequest = assertStorageRequest(input.studentArchiveStorageRequest, principal, projectionOutput);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 240);
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 240);
  const precommitInputHash = hashInput({
    precommitInvocationId,
    principalId: principal.principalId,
    projectionRecordId: projectionOutput.recordId,
    projectionId: projectionOutput.studentArchiveProjectionRecord.projectionId,
    targetStudentId: storageRequest.targetStudentId,
    materialType: storageRequest.materialType,
    analysisIntents: storageRequest.analysisIntents,
    storagePolicy,
  });
  return {
    precommitInvocationId,
    principal,
    projectionOutput,
    storagePolicy,
    storageRequest,
    evidenceRefs,
    idempotencyKey,
    precommitInputHash,
  };
}

function assertTeachingArchiveWritePrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const normalized = {
    principalId: requireString(principal.principalId, "input.principal.principalId"),
    subjectType: requireConst(principal.subjectType, "SERVICE", "input.principal.subjectType"),
    role: requireConst(principal.role, "SERVICE", "input.principal.role"),
    entryPoint: requireConst(principal.entryPoint, "AGENT_INTERNAL", "input.principal.entryPoint"),
    scopes: uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32),
    knowledgeAccess: assertKnowledgeAccess(principal.knowledgeAccess),
    studentAccess: assertStudentAccess(principal.studentAccess),
    requiresHarnessApproval: requireConst(principal.requiresHarnessApproval, false, "input.principal.requiresHarnessApproval"),
    sessionId: requireString(principal.sessionId, "input.principal.sessionId"),
    issuedAt: requireDateTime(principal.issuedAt, "input.principal.issuedAt"),
    expiresAt: requireDateTime(principal.expiresAt, "input.principal.expiresAt"),
  };
  for (const scope of ["RESEARCH_READ", "STUDENT_ARCHIVE_WRITE", "STUDENT_ASSIGNED_READ"]) {
    if (!normalized.scopes.includes(scope)) {
      throw precommitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_MISSING_SCOPE", `${scope} scope is required`);
    }
  }
  if (!["ASSIGNED", "ALL"].includes(normalized.studentAccess.mode)) {
    throw precommitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_INVALID_STUDENT_ACCESS", "storage precommit requires assigned or all student access");
  }
  return normalized;
}

function assertKnowledgeAccess(access) {
  assertPlainObject(access, "input.principal.knowledgeAccess");
  return {
    public: requireConst(access.public, true, "input.principal.knowledgeAccess.public"),
    private: requireEnum(access.private, "input.principal.knowledgeAccess.private", ["NONE", "OWN", "ASSIGNED", "ALL"]),
  };
}

function assertStudentAccess(access) {
  assertPlainObject(access, "input.principal.studentAccess");
  const mode = requireEnum(access.mode, "input.principal.studentAccess.mode", ["NONE", "OWN", "ASSIGNED", "ALL"]);
  const studentIds = Array.isArray(access.studentIds)
    ? uniqueBoundedStringArray(access.studentIds, "input.principal.studentAccess.studentIds", 0, 200, 1, 128)
    : [];
  return { mode, studentIds };
}

function assertProjectionOutput(output) {
  assertPlainObject(output, "input.studentArchiveProjectionOutput");
  requireConst(output.schemaVersion, projectionSchemaVersion, "input.studentArchiveProjectionOutput.schemaVersion");
  requireConst(output.runtimeId, projectionRuntimeId, "input.studentArchiveProjectionOutput.runtimeId");
  requireConst(output.commandPort, projectionCommandPort, "input.studentArchiveProjectionOutput.commandPort");
  requireConst(output.status, "STUDENT_ARCHIVE_PROJECTION_WRITTEN", "input.studentArchiveProjectionOutput.status");
  const job = assertJob(output.job, "input.studentArchiveProjectionOutput.job");
  const projection = assertProjectionRecord(output.studentArchiveProjectionRecord);
  const evidenceRefs = uniqueStringArray(output.evidenceRefs, "input.studentArchiveProjectionOutput.evidenceRefs", 1, 1000);
  assertProjectionBoundary(output.boundary);
  return {
    ...output,
    recordId: requireString(output.recordId, "input.studentArchiveProjectionOutput.recordId"),
    idempotencyKey: requireString(output.idempotencyKey, "input.studentArchiveProjectionOutput.idempotencyKey"),
    job,
    studentArchiveProjectionRecord: projection,
    evidenceRefs,
  };
}

function assertProjectionRecord(record) {
  assertPlainObject(record, "input.studentArchiveProjectionOutput.studentArchiveProjectionRecord");
  requireConst(record.projectionKind, "DURABLE_STUDENT_ARCHIVE_PROJECTION_RECORD", "input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.projectionKind");
  requireConst(record.projectionState, "PROJECTED_TO_STUDENT_ARCHIVE", "input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.projectionState");
  requireConst(record.archiveEntryState, "ACTIVE_STUDENT_ARCHIVE_ENTRY", "input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.archiveEntryState");
  requireConst(record.targetArchiveKind, "STUDENT_LEARNING_ARCHIVE", "input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.targetArchiveKind");
  const claims = assertClaims(record.claims);
  const claimCount = requireIntegerBetween(record.claimCount, "input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.claimCount", 1, 200);
  const citationCount = requireIntegerBetween(record.citationCount, "input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.citationCount", 1, 500);
  const sourceHashCount = requireIntegerBetween(record.sourceHashCount, "input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.sourceHashCount", 1, 500);
  const actualCitationCount = new Set(claims.flatMap((claim) => claim.citations)).size;
  const actualSourceHashCount = new Set(claims.flatMap((claim) => claim.sourceHashes)).size;
  if (claimCount !== claims.length || citationCount !== actualCitationCount || sourceHashCount !== actualSourceHashCount) {
    throw precommitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_INTEGRITY_MISMATCH", "projection integrity counts must match claims before storage precommit");
  }
  return {
    ...record,
    projectionId: requireString(record.projectionId, "input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.projectionId"),
    archiveScopeRef: requireBoundedString(record.archiveScopeRef, "input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.archiveScopeRef", 3, 200),
    title: requireSafeText(record.title, "input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.title", 1, 200),
    learnerFacingSummary: requireSafeText(record.learnerFacingSummary, "input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.learnerFacingSummary", 1, 1000),
    claims,
    limitations: uniqueBoundedStringArray(record.limitations, "input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.limitations", 1, 12, 1, 600),
    risk: assertRisk(record.risk),
    claimCount,
    citationCount,
    sourceHashCount,
  };
}

function assertClaims(claims) {
  if (!Array.isArray(claims) || claims.length < 1 || claims.length > 200) {
    throw precommitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_INVALID_CLAIMS", "projection claims must contain 1-200 items");
  }
  return claims.map((claim, index) => {
    assertPlainObject(claim, `input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.claims[${index}]`);
    const sourceHashes = uniqueBoundedStringArray(claim.sourceHashes, `input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.claims[${index}].sourceHashes`, 1, 20, 71, 71);
    for (const sourceHash of sourceHashes) {
      if (!/^sha256:[a-f0-9]{64}$/u.test(sourceHash)) {
        throw precommitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_INVALID_SOURCE_HASH", "claim sourceHashes must be sha256 digests");
      }
    }
    return {
      claimId: requireString(claim.claimId, `input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.claims[${index}].claimId`),
      text: requireSafeText(claim.text, `input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.claims[${index}].text`, 1, 1200),
      citations: uniqueBoundedStringArray(claim.citations, `input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.claims[${index}].citations`, 1, 20, 4, 400),
      sourceHashes,
      supportChunkIds: uniqueBoundedStringArray(claim.supportChunkIds, `input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.claims[${index}].supportChunkIds`, 1, 40, 1, 160),
      confidence: requireNumberBetween(claim.confidence, `input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.claims[${index}].confidence`, 0, 1),
      evidencePreserved: requireConst(claim.evidencePreserved, true, `input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.claims[${index}].evidencePreserved`),
    };
  });
}

function assertRisk(risk) {
  assertPlainObject(risk, "input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.risk");
  const normalized = {
    hallucinationRisk: requireEnum(risk.hallucinationRisk, "input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.risk.hallucinationRisk", ["LOW", "MEDIUM", "HIGH"]),
    privateKnowledgeRisk: requireEnum(risk.privateKnowledgeRisk, "input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.risk.privateKnowledgeRisk", ["LOW", "MEDIUM", "HIGH"]),
    studentDataRisk: requireEnum(risk.studentDataRisk, "input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.risk.studentDataRisk", ["LOW", "MEDIUM", "HIGH"]),
    publicationRisk: requireEnum(risk.publicationRisk, "input.studentArchiveProjectionOutput.studentArchiveProjectionRecord.risk.publicationRisk", ["LOW", "MEDIUM", "HIGH"]),
  };
  if (Object.values(normalized).includes("HIGH")) {
    throw precommitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_HIGH_RISK_PROJECTION", "HIGH risk projection cannot be prepared for main database storage");
  }
  return normalized;
}

function assertProjectionBoundary(boundary) {
  assertPlainObject(boundary, "input.studentArchiveProjectionOutput.boundary");
  for (const field of [
    "studentArchiveProjectionReviewVerified",
    "durableStudentArchiveProjectionRecorded",
    "appendOnlyProjectionLogRecorded",
    "studentArchivePersisted",
    "studentArchiveProjectionWritten",
    "studentArchiveWriteStarted",
  ]) {
    requireConst(boundary[field], true, `input.studentArchiveProjectionOutput.boundary.${field}`);
  }
  for (const field of [
    "finalAnswerPublished",
    "publicationCandidateCreated",
    "externalModelCallStarted",
    "mainDatabaseWriteStarted",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(boundary[field], false, `input.studentArchiveProjectionOutput.boundary.${field}`);
  }
}

function assertStoragePolicy(policy) {
  assertPlainObject(policy, "input.studentArchiveStoragePolicy");
  for (const field of [
    "projectionOutputRequired",
    "teachingArchiveCreateItemPrecommitAllowed",
    "teachingArchiveDomainValidationRequired",
    "preserveProjectionEvidenceRequired",
    "idempotentStorageCommandRequired",
    "studentArchiveWritePrincipalRequired",
    "studentAudienceScopeRequired",
  ]) {
    requireConst(policy[field], true, `input.studentArchiveStoragePolicy.${field}`);
  }
  for (const field of [
    "mainDatabaseWriteAllowed",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "directPublicationAllowed",
    "externalModelCallAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.studentArchiveStoragePolicy.${field}`);
  }
  return { ...policy };
}

function assertStorageRequest(request, principal, projectionOutput) {
  assertPlainObject(request, "input.studentArchiveStorageRequest");
  const targetStudentId = requireBoundedString(request.targetStudentId, "input.studentArchiveStorageRequest.targetStudentId", 1, 128);
  if (principal.studentAccess.mode === "ASSIGNED" && !principal.studentAccess.studentIds.includes(targetStudentId)) {
    throw precommitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_STUDENT_SCOPE_MISMATCH", "principal studentAccess must include targetStudentId");
  }
  const materialType = requireEnum(request.materialType, "input.studentArchiveStorageRequest.materialType", ["QUIZ", "PAPER", "HANDOUT", "HOMEWORK"]);
  const analysisIntents = uniqueStringArray(request.analysisIntents, "input.studentArchiveStorageRequest.analysisIntents", 1, 2)
    .map((intent) => requireEnum(intent, "input.studentArchiveStorageRequest.analysisIntents[]", ["ARCHIVE_ONLY", "TUTORING"]));
  const tags = uniqueBoundedStringArray(request.tags ?? [], "input.studentArchiveStorageRequest.tags", 0, 16, 1, 64);
  const contentRefPrefix = requireConst(request.contentRefPrefix, "research-deep-research-projection", "input.studentArchiveStorageRequest.contentRefPrefix");
  const ocrReserved = requireBoolean(request.ocrReserved, "input.studentArchiveStorageRequest.ocrReserved");
  requireConst(request.sourceProjectionId, projectionOutput.studentArchiveProjectionRecord.projectionId, "input.studentArchiveStorageRequest.sourceProjectionId");
  return { targetStudentId, materialType, analysisIntents, tags, contentRefPrefix, ocrReserved };
}

function buildPrecommitRecord(normalized, preparedAt) {
  const projection = normalized.projectionOutput.studentArchiveProjectionRecord;
  const command = buildTeachingArchiveCreateCommand(normalized, preparedAt);
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT",
    recordId: `research_deep_research_student_archive_storage_precommit_${safeToken(normalized.idempotencyKey)}`,
    recordedAt: preparedAt,
    runtimeId: RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_RUNTIME_ID,
    commandPort: RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_COMMAND_PORT,
    status: "TEACHING_ARCHIVE_MAIN_DB_STORAGE_PRECOMMIT_PREPARED",
    precommitInvocationId: normalized.precommitInvocationId,
    sourceProjection: {
      projectionRecordId: normalized.projectionOutput.recordId,
      projectionId: projection.projectionId,
      archiveScopeRef: projection.archiveScopeRef,
      sourceProjectionReviewRecordId: projection.sourceProjectionReviewRecordId,
      sourcePersistenceRecordId: projection.sourcePersistenceRecordId,
      sourceStudentDeliveryEnvelopeId: projection.sourceStudentDeliveryEnvelopeId,
      claimCount: projection.claimCount,
      citationCount: projection.citationCount,
      sourceHashCount: projection.sourceHashCount,
    },
    teachingArchiveCreateCommand: command,
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.projectionOutput.evidenceRefs,
        `evidence:student-archive-storage-precommit-input-hash:${normalized.precommitInputHash}`,
        `evidence:runtime:${RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_RUNTIME_ID}`,
        `evidence:command-port:${RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_COMMAND_PORT}`,
        `evidence:student-archive-projection-record:${normalized.projectionOutput.recordId}`,
        "evidence:teaching-archive-openapi:createTeachingArchiveItem",
        "evidence:teaching-archive-main-table:teaching_archive_items",
      ]),
      idempotencyKey: normalized.idempotencyKey,
      precommitInputHash: normalized.precommitInputHash,
    },
    boundary: buildBoundary(),
  };
}

function buildTeachingArchiveCreateCommand(normalized, preparedAt) {
  const projection = normalized.projectionOutput.studentArchiveProjectionRecord;
  const firstSourceHash = projection.claims[0].sourceHashes[0];
  const contentRef = [
    normalized.storageRequest.contentRefPrefix,
    safeToken(projection.projectionId),
    firstSourceHash.replace("sha256:", "sha256_"),
  ].join(":");
  const tags = uniq([
    "deep_research",
    "student_archive",
    "projection",
    ...normalized.storageRequest.tags,
  ]);
  if (contentRef.length > 1000) {
    throw precommitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_CONTENT_REF_TOO_LONG", "generated contentRef exceeds Teaching Archive limit");
  }
  return {
    commandId: `teaching_archive_create_archive_item_${safeToken(normalized.idempotencyKey)}`,
    operationId: "createTeachingArchiveItem",
    method: "POST",
    path: "/archive-items",
    preparedAt,
    targetUseCase: "CreateArchiveItem.ExecuteWithPersistence",
    targetRepository: "ArchiveRepository.Create",
    targetTable: "teaching_archive_items",
    principalContextHeader: normalized.principal,
    requestBody: {
      ownerType: "STUDENT",
      studentId: normalized.storageRequest.targetStudentId,
      materialType: normalized.storageRequest.materialType,
      title: projection.title,
      source: "SYSTEM_IMPORT",
      contentRef,
      tags,
      analysisIntents: normalized.storageRequest.analysisIntents,
      ocrReserved: normalized.storageRequest.ocrReserved,
    },
    storageShape: {
      table: "teaching_archive_items",
      idPrefix: "tarch_",
      columns: [
        "id",
        "owner_type",
        "student_id",
        "material_type",
        "title",
        "source",
        "content_ref",
        "tags",
        "analysis_intents",
        "ocr_status",
        "created_at",
      ],
      evidenceLocation: "append_only_projection_log",
    },
  };
}

function buildBoundary() {
  return {
    studentArchiveProjectionOutputVerified: true,
    teachingArchiveCreateItemCommandPrepared: true,
    teachingArchiveDomainValidationPrepared: true,
    projectionEvidencePreserved: true,
    studentAudienceScopeEnforced: true,
    studentArchiveProjectionWritten: true,
    studentArchivePersisted: true,
    studentArchiveWriteStarted: true,
    mainDatabaseWritePrepared: true,
    mainDatabaseWriteStarted: false,
    mainDatabaseWriteCommitted: false,
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
    sourceProjection: record.sourceProjection,
    teachingArchiveCreateCommand: record.teachingArchiveCreateCommand,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 300,
      evidenceClass: "ASYNC_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_BOUNDARY",
    },
    nextAction: "Submit this command to the Teaching Archive createArchiveItem use case in a separate reviewed main DB commit slice.",
  };
}

function appendPrecommitRecord(precommitLogPath, record) {
  const absolute = path.resolve(precommitLogPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.appendFileSync(absolute, `${JSON.stringify(record)}\n`);
}

function findExistingRecordByIdempotencyKey(precommitLogPath, idempotencyKey) {
  const absolute = path.resolve(precommitLogPath);
  if (!fs.existsSync(absolute)) return null;
  const lines = fs.readFileSync(absolute, "utf8").split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const record = JSON.parse(lines[index]);
    if (record?.recordType === "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.precommitInvocationId !== normalized.precommitInvocationId ||
    existing.sourceProjection?.projectionId !== normalized.projectionOutput.studentArchiveProjectionRecord.projectionId ||
    existing.teachingArchiveCreateCommand?.requestBody?.studentId !== normalized.storageRequest.targetStudentId ||
    existing.evidence?.precommitInputHash !== normalized.precommitInputHash) {
    throw precommitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different storage precommit");
  }
}

function assertJob(job, label) {
  assertPlainObject(job, label);
  return {
    taskId: requireString(job.taskId, `${label}.taskId`),
    contextRef: requireString(job.contextRef, `${label}.contextRef`),
    jobId: requireString(job.jobId, `${label}.jobId`),
    queueName: requireConst(job.queueName, "research_deep_research", `${label}.queueName`),
  };
}

function requireSafeText(value, label, minLength, maxLength) {
  const text = requireBoundedString(value, label, minLength, maxLength);
  if (/[<>]/u.test(text)) {
    throw precommitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_UNSAFE_TEXT", `${label} must be encoded safe text`);
  }
  return text;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw precommitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireBoundedString(value, label, minLength, maxLength) {
  const text = requireString(value, label);
  if (text.length < minLength || text.length > maxLength) {
    throw precommitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_INVALID_INPUT", `${label} length must be ${minLength}-${maxLength}`);
  }
  return text;
}

function requireEnum(value, label, allowed) {
  const text = requireString(value, label);
  if (!allowed.includes(text)) {
    throw precommitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_INVALID_INPUT", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw precommitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_INVALID_INPUT", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireNumberBetween(value, label, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw precommitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_INVALID_INPUT", `${label} must be a number between ${min} and ${max}`);
  }
  return value;
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw precommitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_INVALID_INPUT", `${label} must be boolean`);
  }
  return value;
}

function requireDateTime(value, label) {
  const text = requireString(value, label);
  if (Number.isNaN(Date.parse(text))) {
    throw precommitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_INVALID_INPUT", `${label} must be an ISO date-time`);
  }
  return text;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw precommitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_BOUNDARY_VIOLATION", `${label} must be ${expected}`);
  }
  return expected;
}

function uniqueStringArray(value, label, minItems, maxItems) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw precommitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_INVALID_INPUT", `${label} must contain ${minItems}-${maxItems} items`);
  }
  const items = value.map((item) => requireString(item, label));
  if (new Set(items).size !== items.length) {
    throw precommitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_INVALID_INPUT", `${label} must be unique`);
  }
  return items;
}

function uniqueBoundedStringArray(value, label, minItems, maxItems, minLength, maxLength) {
  return uniqueStringArray(value, label, minItems, maxItems)
    .map((item) => requireBoundedString(item, `${label}[]`, minLength, maxLength));
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw precommitError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_INVALID_INPUT", `${label} must be an object`);
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

function precommitError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
