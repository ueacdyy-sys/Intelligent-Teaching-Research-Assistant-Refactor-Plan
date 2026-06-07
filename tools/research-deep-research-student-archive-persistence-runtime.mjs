import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_RUNTIME_ID = "research_deep_research_student_archive_persistence_runtime";
export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PORT = "DeepResearchStudentArchivePersistencePort.recordStudentArchivePersistenceCommand";
export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_READY = "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_READY";

const inputSchemaVersion = "2026-06-05.research.deep-research-student-archive-persistence.v1";
const outputSchemaVersion = "2026-06-05.research.deep-research-student-archive-persistence-recorded.v1";
const studentDeliverySchemaVersion = "2026-06-05.research.deep-research-student-delivery-recorded.v1";
const defaultCommandLogPath = "reports/research-command-log/deep-research-student-archive-persistence.jsonl";

export function recordDeepResearchStudentArchivePersistenceCommand(input, options = {}) {
  const recordedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const commandLogPath = options.commandLogPath ?? defaultCommandLogPath;
  const existing = findExistingRecordByIdempotencyKey(commandLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const record = buildCommandRecord(normalized, recordedAt);
  appendCommandRecord(commandLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatDeepResearchStudentArchivePersistence(result) {
  return [
    `Research deep_research student archive persistence: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Job: ${result.job.jobId}`,
    `Command: ${result.studentArchivePersistenceCommand.commandId}`,
    `Projected: ${result.boundary.studentArchiveProjectionWritten}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const persistenceInvocationId = requireString(input.persistenceInvocationId, "input.persistenceInvocationId");
  const principal = assertPrincipal(input.principal);
  const studentDeliveryRecord = assertStudentDeliveryRecord(input.studentDeliveryRecord);
  const studentArchivePersistencePolicy = assertStudentArchivePersistencePolicy(input.studentArchivePersistencePolicy);
  const persistenceRequest = assertPersistenceRequest(input.studentArchivePersistenceRequest, studentDeliveryRecord);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 180);
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 240);
  const persistenceInputHash = hashInput({
    persistenceInvocationId,
    principalId: principal.principalId,
    studentDeliveryRecordId: studentDeliveryRecord.recordId,
    studentDeliveryEnvelopeId: studentDeliveryRecord.studentDeliveryEnvelope.envelopeId,
    persistenceRequest,
    studentArchivePersistencePolicy,
  });
  return {
    persistenceInvocationId,
    principal,
    studentDeliveryRecord,
    studentArchivePersistencePolicy,
    persistenceRequest,
    evidenceRefs,
    idempotencyKey,
    persistenceInputHash,
  };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const normalized = {
    principalId: requireString(principal.principalId, "input.principal.principalId"),
    role: requireString(principal.role, "input.principal.role"),
    subjectType: requireString(principal.subjectType, "input.principal.subjectType"),
    entryPoint: requireString(principal.entryPoint, "input.principal.entryPoint"),
    sessionId: requireString(principal.sessionId, "input.principal.sessionId"),
    scopes: uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32),
  };
  if (normalized.role !== "SERVICE" || normalized.subjectType !== "SERVICE" || normalized.entryPoint !== "STUDENT_ARCHIVE_PERSISTENCE_RUNTIME") {
    throw persistenceError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_FORBIDDEN_PRINCIPAL", "student archive persistence requires the controlled persistence service principal");
  }
  for (const scope of ["RESEARCH_READ", "STUDENT_ARCHIVE_PERSISTENCE", "STUDENT_APP_DELIVERY"]) {
    if (!normalized.scopes.includes(scope)) {
      throw persistenceError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_MISSING_SCOPE", `${scope} scope is required`);
    }
  }
  return normalized;
}

function assertStudentDeliveryRecord(record) {
  assertPlainObject(record, "input.studentDeliveryRecord");
  requireConst(record.schemaVersion, studentDeliverySchemaVersion, "input.studentDeliveryRecord.schemaVersion");
  requireConst(record.runtimeId, "research_deep_research_student_delivery_runtime", "input.studentDeliveryRecord.runtimeId");
  requireConst(record.commandPort, "DeepResearchStudentDeliveryPort.recordStudentDeliveryEnvelope", "input.studentDeliveryRecord.commandPort");
  requireConst(record.status, "STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED", "input.studentDeliveryRecord.status");
  const recordId = requireString(record.recordId, "input.studentDeliveryRecord.recordId");
  const job = assertJob(record.job, "input.studentDeliveryRecord.job");
  const studentDeliveryEnvelope = assertStudentDeliveryEnvelope(record.studentDeliveryEnvelope);
  const evidenceRefs = uniqueStringArray(record.evidenceRefs, "input.studentDeliveryRecord.evidenceRefs", 1, 500);
  assertStudentDeliveryBoundary(record.boundary);
  return { ...record, recordId, job, studentDeliveryEnvelope, evidenceRefs };
}

function assertStudentDeliveryEnvelope(envelope) {
  assertPlainObject(envelope, "input.studentDeliveryRecord.studentDeliveryEnvelope");
  requireConst(envelope.envelopeKind, "EVIDENCE_GROUNDED_STUDENT_DELIVERY_ENVELOPE", "input.studentDeliveryRecord.studentDeliveryEnvelope.envelopeKind");
  requireConst(envelope.deliveryMode, "STUDENT_APP_RENDERABLE_ENVELOPE", "input.studentDeliveryRecord.studentDeliveryEnvelope.deliveryMode");
  requireConst(envelope.audience, "STUDENT_APP_LEARNING_SUPPORT", "input.studentDeliveryRecord.studentDeliveryEnvelope.audience");
  requireConst(envelope.channel, "STUDENT_APP", "input.studentDeliveryRecord.studentDeliveryEnvelope.channel");
  requireConst(envelope.visibilityState, "STUDENT_VISIBLE_DELIVERY_ENVELOPE_NOT_PERSISTED", "input.studentDeliveryRecord.studentDeliveryEnvelope.visibilityState");
  requireConst(envelope.deliveryState, "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED", "input.studentDeliveryRecord.studentDeliveryEnvelope.deliveryState");
  const claims = assertClaims(envelope.claims);
  const limitations = uniqueBoundedStringArray(envelope.limitations, "input.studentDeliveryRecord.studentDeliveryEnvelope.limitations", 1, 12, 1, 600);
  const risk = assertRisk(envelope.risk);
  const integrity = assertIntegrity(envelope, claims);
  return {
    envelopeId: requireString(envelope.envelopeId, "input.studentDeliveryRecord.studentDeliveryEnvelope.envelopeId"),
    envelopeKind: "EVIDENCE_GROUNDED_STUDENT_DELIVERY_ENVELOPE",
    deliveryMode: "STUDENT_APP_RENDERABLE_ENVELOPE",
    audience: "STUDENT_APP_LEARNING_SUPPORT",
    channel: "STUDENT_APP",
    scopeRef: requireBoundedString(envelope.scopeRef, "input.studentDeliveryRecord.studentDeliveryEnvelope.scopeRef", 3, 200),
    visibilityState: "STUDENT_VISIBLE_DELIVERY_ENVELOPE_NOT_PERSISTED",
    deliveryState: "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED",
    teacherDeliveryPackageId: requireString(envelope.teacherDeliveryPackageId, "input.studentDeliveryRecord.studentDeliveryEnvelope.teacherDeliveryPackageId"),
    studentVisibilityReviewRecordId: requireString(envelope.studentVisibilityReviewRecordId, "input.studentDeliveryRecord.studentDeliveryEnvelope.studentVisibilityReviewRecordId"),
    studentVisibilityReviewId: requireString(envelope.studentVisibilityReviewId, "input.studentDeliveryRecord.studentDeliveryEnvelope.studentVisibilityReviewId"),
    title: requireSafeText(envelope.title, "input.studentDeliveryRecord.studentDeliveryEnvelope.title"),
    learnerFacingSummary: requireSafeText(envelope.learnerFacingSummary, "input.studentDeliveryRecord.studentDeliveryEnvelope.learnerFacingSummary"),
    ...integrity,
    claims,
    limitations,
    risk,
    evidencePreserved: requireConst(envelope.evidencePreserved, true, "input.studentDeliveryRecord.studentDeliveryEnvelope.evidencePreserved"),
    sourceHashIntegrityPreserved: requireConst(envelope.sourceHashIntegrityPreserved, true, "input.studentDeliveryRecord.studentDeliveryEnvelope.sourceHashIntegrityPreserved"),
    limitationsPreserved: requireConst(envelope.limitationsPreserved, true, "input.studentDeliveryRecord.studentDeliveryEnvelope.limitationsPreserved"),
  };
}

function assertClaims(claims) {
  if (!Array.isArray(claims) || claims.length < 1 || claims.length > 200) {
    throw persistenceError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_INVALID_CLAIMS", "student delivery envelope claims must contain 1-200 items");
  }
  return claims.map((claim, index) => {
    assertPlainObject(claim, `input.studentDeliveryRecord.studentDeliveryEnvelope.claims[${index}]`);
    const sourceHashes = uniqueBoundedStringArray(claim.sourceHashes, `input.studentDeliveryRecord.studentDeliveryEnvelope.claims[${index}].sourceHashes`, 1, 20, 71, 71);
    for (const sourceHash of sourceHashes) {
      if (!/^sha256:[a-f0-9]{64}$/u.test(sourceHash)) {
        throw persistenceError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_INVALID_SOURCE_HASH", "claim sourceHashes must be sha256 digests");
      }
    }
    return {
      claimId: requireString(claim.claimId, `input.studentDeliveryRecord.studentDeliveryEnvelope.claims[${index}].claimId`),
      text: requireSafeText(claim.text, `input.studentDeliveryRecord.studentDeliveryEnvelope.claims[${index}].text`),
      citations: uniqueBoundedStringArray(claim.citations, `input.studentDeliveryRecord.studentDeliveryEnvelope.claims[${index}].citations`, 1, 20, 4, 400),
      sourceHashes,
      supportChunkIds: uniqueBoundedStringArray(claim.supportChunkIds, `input.studentDeliveryRecord.studentDeliveryEnvelope.claims[${index}].supportChunkIds`, 1, 40, 1, 160),
      confidence: requireNumberBetween(claim.confidence, `input.studentDeliveryRecord.studentDeliveryEnvelope.claims[${index}].confidence`, 0, 1),
      evidencePreserved: requireConst(claim.evidencePreserved, true, `input.studentDeliveryRecord.studentDeliveryEnvelope.claims[${index}].evidencePreserved`),
    };
  });
}

function assertIntegrity(envelope, claims) {
  const claimCount = requireIntegerBetween(envelope.claimCount, "input.studentDeliveryRecord.studentDeliveryEnvelope.claimCount", 1, 200);
  const citationCount = requireIntegerBetween(envelope.citationCount, "input.studentDeliveryRecord.studentDeliveryEnvelope.citationCount", 1, 500);
  const sourceHashCount = requireIntegerBetween(envelope.sourceHashCount, "input.studentDeliveryRecord.studentDeliveryEnvelope.sourceHashCount", 1, 500);
  const actualCitationCount = new Set(claims.flatMap((claim) => claim.citations)).size;
  const actualSourceHashCount = new Set(claims.flatMap((claim) => claim.sourceHashes)).size;
  if (claimCount !== claims.length || citationCount !== actualCitationCount || sourceHashCount !== actualSourceHashCount) {
    throw persistenceError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_INTEGRITY_MISMATCH", "student delivery envelope integrity counts must match claims");
  }
  return { claimCount, citationCount, sourceHashCount };
}

function assertRisk(risk) {
  assertPlainObject(risk, "input.studentDeliveryRecord.studentDeliveryEnvelope.risk");
  const normalized = {
    hallucinationRisk: requireEnum(risk.hallucinationRisk, "input.studentDeliveryRecord.studentDeliveryEnvelope.risk.hallucinationRisk", ["LOW", "MEDIUM", "HIGH"]),
    privateKnowledgeRisk: requireEnum(risk.privateKnowledgeRisk, "input.studentDeliveryRecord.studentDeliveryEnvelope.risk.privateKnowledgeRisk", ["LOW", "MEDIUM", "HIGH"]),
    studentDataRisk: requireEnum(risk.studentDataRisk, "input.studentDeliveryRecord.studentDeliveryEnvelope.risk.studentDataRisk", ["LOW", "MEDIUM", "HIGH"]),
    publicationRisk: requireEnum(risk.publicationRisk, "input.studentDeliveryRecord.studentDeliveryEnvelope.risk.publicationRisk", ["LOW", "MEDIUM", "HIGH"]),
  };
  if (Object.values(normalized).includes("HIGH")) {
    throw persistenceError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_HIGH_RISK_ENVELOPE", "student archive persistence cannot consume a HIGH risk envelope");
  }
  return normalized;
}

function assertStudentDeliveryBoundary(boundary) {
  assertPlainObject(boundary, "input.studentDeliveryRecord.boundary");
  for (const field of [
    "teacherDeliveryVerified",
    "humanStudentVisibilityReviewRecorded",
    "studentVisibilityApprovedForDelivery",
    "studentDeliveryEnvelopeCreated",
    "studentVisible",
    "studentDeliveryStarted",
    "evidenceIntegrityPreserved",
    "sourceHashIntegrityPreserved",
    "limitationsPreserved",
    "studentAudienceScopeEnforced",
    "requiresFuturePersistenceReview",
  ]) {
    requireConst(boundary[field], true, `input.studentDeliveryRecord.boundary.${field}`);
  }
  for (const field of [
    "studentDeliveryPersisted",
    "finalAnswerPublished",
    "publicationCandidateCreated",
    "directPublicationAllowed",
    "externalModelCallStarted",
    "mainDatabaseWriteStarted",
    "studentArchiveWriteStarted",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(boundary[field], false, `input.studentDeliveryRecord.boundary.${field}`);
  }
}

function assertStudentArchivePersistencePolicy(policy) {
  assertPlainObject(policy, "input.studentArchivePersistencePolicy");
  for (const field of [
    "reviewedStudentDeliveryRequired",
    "studentArchivePersistenceCommandAllowed",
    "appendOnlyCommandLogRequired",
    "preserveEvidenceRequired",
    "preserveSourceHashesRequired",
    "preserveLimitationsRequired",
    "studentAudienceScopeRequired",
    "futureDurableProjectionReviewRequired",
  ]) {
    requireConst(policy[field], true, `input.studentArchivePersistencePolicy.${field}`);
  }
  for (const field of [
    "directPublicationAllowed",
    "directDatabaseAccessAllowed",
    "mainDatabaseWriteAllowed",
    "studentArchiveProjectionWriteAllowed",
    "externalModelCallAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.studentArchivePersistencePolicy.${field}`);
  }
  return { ...policy };
}

function assertPersistenceRequest(request, studentDeliveryRecord) {
  assertPlainObject(request, "input.studentArchivePersistenceRequest");
  const envelope = studentDeliveryRecord.studentDeliveryEnvelope;
  requireConst(request.persistenceMode, "APPEND_ONLY_STUDENT_ARCHIVE_COMMAND", "input.studentArchivePersistenceRequest.persistenceMode");
  requireConst(request.targetArchiveKind, "STUDENT_LEARNING_ARCHIVE", "input.studentArchivePersistenceRequest.targetArchiveKind");
  requireConst(request.desiredArchiveState, "PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED", "input.studentArchivePersistenceRequest.desiredArchiveState");
  requireConst(request.archiveScopeRef, envelope.scopeRef, "input.studentArchivePersistenceRequest.archiveScopeRef");
  requireConst(request.studentDeliveryRecordId, studentDeliveryRecord.recordId, "input.studentArchivePersistenceRequest.studentDeliveryRecordId");
  requireConst(request.studentDeliveryEnvelopeId, envelope.envelopeId, "input.studentArchivePersistenceRequest.studentDeliveryEnvelopeId");
  requireConst(request.studentVisibilityReviewId, envelope.studentVisibilityReviewId, "input.studentArchivePersistenceRequest.studentVisibilityReviewId");
  requireConst(request.teacherDeliveryPackageId, envelope.teacherDeliveryPackageId, "input.studentArchivePersistenceRequest.teacherDeliveryPackageId");
  return {
    commandId: requireString(request.commandId, "input.studentArchivePersistenceRequest.commandId"),
    persistenceMode: "APPEND_ONLY_STUDENT_ARCHIVE_COMMAND",
    targetArchiveKind: "STUDENT_LEARNING_ARCHIVE",
    archiveScopeRef: envelope.scopeRef,
    studentDeliveryRecordId: studentDeliveryRecord.recordId,
    studentDeliveryEnvelopeId: envelope.envelopeId,
    studentVisibilityReviewId: envelope.studentVisibilityReviewId,
    teacherDeliveryPackageId: envelope.teacherDeliveryPackageId,
    desiredArchiveState: "PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED",
  };
}

function buildCommandRecord(normalized, recordedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_COMMAND",
    recordId: `research_deep_research_student_archive_persistence_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    runtimeId: RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_RUNTIME_ID,
    commandPort: RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PORT,
    status: "STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED",
    persistenceInvocationId: normalized.persistenceInvocationId,
    principal: normalized.principal,
    job: normalized.studentDeliveryRecord.job,
    studentArchivePersistenceCommand: buildStudentArchivePersistenceCommand(normalized),
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.studentDeliveryRecord.evidenceRefs,
        `evidence:student-archive-persistence-input-hash:${normalized.persistenceInputHash}`,
        `evidence:runtime:${RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_RUNTIME_ID}`,
        `evidence:command-port:${RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PORT}`,
        `evidence:student-delivery-record:${normalized.studentDeliveryRecord.recordId}`,
      ]),
      idempotencyKey: normalized.idempotencyKey,
      persistenceInputHash: normalized.persistenceInputHash,
    },
    boundary: buildBoundary(),
  };
}

function buildStudentArchivePersistenceCommand(normalized) {
  const envelope = normalized.studentDeliveryRecord.studentDeliveryEnvelope;
  const request = normalized.persistenceRequest;
  return {
    commandId: request.commandId,
    commandKind: "EVIDENCE_GROUNDED_STUDENT_ARCHIVE_PERSISTENCE_COMMAND",
    persistenceMode: request.persistenceMode,
    targetArchiveKind: request.targetArchiveKind,
    archiveScopeRef: request.archiveScopeRef,
    desiredArchiveState: request.desiredArchiveState,
    projectionState: "NOT_PROJECTED_TO_STUDENT_ARCHIVE",
    sourceStudentDeliveryRecordId: normalized.studentDeliveryRecord.recordId,
    sourceStudentDeliveryEnvelopeId: envelope.envelopeId,
    studentVisibilityReviewId: envelope.studentVisibilityReviewId,
    teacherDeliveryPackageId: envelope.teacherDeliveryPackageId,
    title: envelope.title,
    learnerFacingSummary: envelope.learnerFacingSummary,
    claimCount: envelope.claimCount,
    citationCount: envelope.citationCount,
    sourceHashCount: envelope.sourceHashCount,
    claims: envelope.claims,
    limitations: envelope.limitations,
    risk: envelope.risk,
    evidencePreserved: true,
    sourceHashIntegrityPreserved: true,
    limitationsPreserved: true,
  };
}

function buildBoundary() {
  return {
    teacherDeliveryVerified: true,
    humanStudentVisibilityReviewRecorded: true,
    studentDeliveryEnvelopeVerified: true,
    studentVisible: true,
    studentArchivePersistenceCommandRecorded: true,
    appendOnlyCommandLogRecorded: true,
    evidenceIntegrityPreserved: true,
    sourceHashIntegrityPreserved: true,
    limitationsPreserved: true,
    studentAudienceScopeEnforced: true,
    studentArchivePersisted: false,
    studentArchiveProjectionWritten: false,
    finalAnswerPublished: false,
    publicationCandidateCreated: false,
    directPublicationAllowed: false,
    externalModelCallStarted: false,
    mainDatabaseWriteStarted: false,
    studentArchiveWriteStarted: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
    requiresFutureDurableProjectionReview: true,
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
    job: record.job,
    studentArchivePersistenceCommand: record.studentArchivePersistenceCommand,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 300,
      evidenceClass: "ASYNC_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_BOUNDARY",
    },
    nextAction: "Use this command as reviewed append-only evidence only; durable student archive projection remains a separate reviewed runtime.",
  };
}

function appendCommandRecord(commandLogPath, record) {
  const absolute = path.resolve(commandLogPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.appendFileSync(absolute, `${JSON.stringify(record)}\n`);
}

function findExistingRecordByIdempotencyKey(commandLogPath, idempotencyKey) {
  const absolute = path.resolve(commandLogPath);
  if (!fs.existsSync(absolute)) return null;
  const lines = fs.readFileSync(absolute, "utf8").split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const record = JSON.parse(lines[index]);
    if (record?.recordType === "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_COMMAND" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.persistenceInvocationId !== normalized.persistenceInvocationId ||
    existing.job?.jobId !== normalized.studentDeliveryRecord.job.jobId ||
    existing.studentArchivePersistenceCommand?.commandId !== normalized.persistenceRequest.commandId ||
    existing.evidence?.persistenceInputHash !== normalized.persistenceInputHash) {
    throw persistenceError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different student archive persistence command");
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

function requireSafeText(value, label) {
  const text = requireBoundedString(value, label, 1, 1200);
  if (/[<>]/u.test(text)) {
    throw persistenceError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_UNSAFE_TEXT", `${label} must be encoded safe text`);
  }
  return text;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw persistenceError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireBoundedString(value, label, minLength, maxLength) {
  const text = requireString(value, label);
  if (text.length < minLength || text.length > maxLength) {
    throw persistenceError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_INVALID_INPUT", `${label} length must be ${minLength}-${maxLength}`);
  }
  return text;
}

function requireEnum(value, label, allowed) {
  const text = requireString(value, label);
  if (!allowed.includes(text)) {
    throw persistenceError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_INVALID_INPUT", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw persistenceError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_INVALID_INPUT", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireNumberBetween(value, label, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw persistenceError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_INVALID_INPUT", `${label} must be a number between ${min} and ${max}`);
  }
  return value;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw persistenceError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_BOUNDARY_VIOLATION", `${label} must be ${expected}`);
  }
  return expected;
}

function uniqueStringArray(value, label, minItems, maxItems) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw persistenceError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_INVALID_INPUT", `${label} must contain ${minItems}-${maxItems} items`);
  }
  const items = value.map((item) => requireString(item, label));
  if (new Set(items).size !== items.length) {
    throw persistenceError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_INVALID_INPUT", `${label} must be unique`);
  }
  return items;
}

function uniqueBoundedStringArray(value, label, minItems, maxItems, minLength, maxLength) {
  return uniqueStringArray(value, label, minItems, maxItems)
    .map((item) => requireBoundedString(item, `${label}[]`, minLength, maxLength));
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw persistenceError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_INVALID_INPUT", `${label} must be an object`);
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

function persistenceError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
