import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_RUNTIME_ID = "research_deep_research_student_archive_projection_review_runtime";
export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_COMMAND_PORT = "DeepResearchStudentArchiveProjectionReviewPort.recordStudentArchiveProjectionReview";
export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_READY = "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_READY";

const inputSchemaVersion = "2026-06-05.research.deep-research-student-archive-projection-review.v1";
const outputSchemaVersion = "2026-06-05.research.deep-research-student-archive-projection-review-recorded.v1";
const persistenceSchemaVersion = "2026-06-05.research.deep-research-student-archive-persistence-recorded.v1";
const defaultReviewLogPath = "reports/research-command-log/deep-research-student-archive-projection-review.jsonl";

export function recordDeepResearchStudentArchiveProjectionReview(input, options = {}) {
  const recordedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const reviewLogPath = options.reviewLogPath ?? defaultReviewLogPath;
  const existing = findExistingRecordByIdempotencyKey(reviewLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const record = buildReviewRecord(normalized, recordedAt);
  appendReviewRecord(reviewLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatDeepResearchStudentArchiveProjectionReview(result) {
  return [
    `Research deep_research student archive projection review: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Job: ${result.job.jobId}`,
    `Review: ${result.studentArchiveProjectionReview.reviewId}`,
    `Projected: ${result.boundary.studentArchiveProjectionWritten}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const projectionReviewInvocationId = requireString(input.projectionReviewInvocationId, "input.projectionReviewInvocationId");
  const principal = assertPrincipal(input.principal);
  const persistenceRecord = assertPersistenceRecord(input.studentArchivePersistenceRecord);
  const projectionReviewPolicy = assertProjectionReviewPolicy(input.studentArchiveProjectionReviewPolicy);
  const projectionReviewRequest = assertProjectionReviewRequest(input.studentArchiveProjectionReviewRequest, persistenceRecord);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 200);
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 240);
  const projectionReviewInputHash = hashInput({
    projectionReviewInvocationId,
    principalId: principal.principalId,
    persistenceRecordId: persistenceRecord.recordId,
    persistenceCommandId: persistenceRecord.studentArchivePersistenceCommand.commandId,
    projectionReviewRequest,
    projectionReviewPolicy,
  });
  return {
    projectionReviewInvocationId,
    principal,
    persistenceRecord,
    projectionReviewPolicy,
    projectionReviewRequest,
    evidenceRefs,
    idempotencyKey,
    projectionReviewInputHash,
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
  if (normalized.role !== "SERVICE" || normalized.subjectType !== "SERVICE" || normalized.entryPoint !== "STUDENT_ARCHIVE_PROJECTION_REVIEW_RUNTIME") {
    throw projectionReviewError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_FORBIDDEN_PRINCIPAL", "student archive projection review requires the controlled projection review service principal");
  }
  for (const scope of ["RESEARCH_READ", "STUDENT_ARCHIVE_PERSISTENCE", "STUDENT_ARCHIVE_PROJECTION_REVIEW"]) {
    if (!normalized.scopes.includes(scope)) {
      throw projectionReviewError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_MISSING_SCOPE", `${scope} scope is required`);
    }
  }
  return normalized;
}

function assertPersistenceRecord(record) {
  assertPlainObject(record, "input.studentArchivePersistenceRecord");
  requireConst(record.schemaVersion, persistenceSchemaVersion, "input.studentArchivePersistenceRecord.schemaVersion");
  requireConst(record.runtimeId, "research_deep_research_student_archive_persistence_runtime", "input.studentArchivePersistenceRecord.runtimeId");
  requireConst(record.commandPort, "DeepResearchStudentArchivePersistencePort.recordStudentArchivePersistenceCommand", "input.studentArchivePersistenceRecord.commandPort");
  requireConst(record.status, "STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED", "input.studentArchivePersistenceRecord.status");
  const recordId = requireString(record.recordId, "input.studentArchivePersistenceRecord.recordId");
  const job = assertJob(record.job, "input.studentArchivePersistenceRecord.job");
  const command = assertPersistenceCommand(record.studentArchivePersistenceCommand);
  const evidenceRefs = uniqueStringArray(record.evidenceRefs, "input.studentArchivePersistenceRecord.evidenceRefs", 1, 600);
  assertPersistenceBoundary(record.boundary);
  return { ...record, recordId, job, studentArchivePersistenceCommand: command, evidenceRefs };
}

function assertPersistenceCommand(command) {
  assertPlainObject(command, "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand");
  requireConst(command.commandKind, "EVIDENCE_GROUNDED_STUDENT_ARCHIVE_PERSISTENCE_COMMAND", "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.commandKind");
  requireConst(command.persistenceMode, "APPEND_ONLY_STUDENT_ARCHIVE_COMMAND", "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.persistenceMode");
  requireConst(command.targetArchiveKind, "STUDENT_LEARNING_ARCHIVE", "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.targetArchiveKind");
  requireConst(command.desiredArchiveState, "PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED", "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.desiredArchiveState");
  requireConst(command.projectionState, "NOT_PROJECTED_TO_STUDENT_ARCHIVE", "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.projectionState");
  const claims = assertClaims(command.claims);
  const limitations = uniqueBoundedStringArray(command.limitations, "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.limitations", 1, 12, 1, 600);
  const risk = assertRisk(command.risk);
  const integrity = assertIntegrity(command, claims);
  return {
    commandId: requireString(command.commandId, "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.commandId"),
    commandKind: "EVIDENCE_GROUNDED_STUDENT_ARCHIVE_PERSISTENCE_COMMAND",
    persistenceMode: "APPEND_ONLY_STUDENT_ARCHIVE_COMMAND",
    targetArchiveKind: "STUDENT_LEARNING_ARCHIVE",
    archiveScopeRef: requireBoundedString(command.archiveScopeRef, "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.archiveScopeRef", 3, 200),
    desiredArchiveState: "PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED",
    projectionState: "NOT_PROJECTED_TO_STUDENT_ARCHIVE",
    sourceStudentDeliveryRecordId: requireString(command.sourceStudentDeliveryRecordId, "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.sourceStudentDeliveryRecordId"),
    sourceStudentDeliveryEnvelopeId: requireString(command.sourceStudentDeliveryEnvelopeId, "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.sourceStudentDeliveryEnvelopeId"),
    studentVisibilityReviewId: requireString(command.studentVisibilityReviewId, "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.studentVisibilityReviewId"),
    teacherDeliveryPackageId: requireString(command.teacherDeliveryPackageId, "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.teacherDeliveryPackageId"),
    title: requireSafeText(command.title, "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.title"),
    learnerFacingSummary: requireSafeText(command.learnerFacingSummary, "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.learnerFacingSummary"),
    ...integrity,
    claims,
    limitations,
    risk,
    evidencePreserved: requireConst(command.evidencePreserved, true, "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.evidencePreserved"),
    sourceHashIntegrityPreserved: requireConst(command.sourceHashIntegrityPreserved, true, "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.sourceHashIntegrityPreserved"),
    limitationsPreserved: requireConst(command.limitationsPreserved, true, "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.limitationsPreserved"),
  };
}

function assertClaims(claims) {
  if (!Array.isArray(claims) || claims.length < 1 || claims.length > 200) {
    throw projectionReviewError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_INVALID_CLAIMS", "archive persistence command claims must contain 1-200 items");
  }
  return claims.map((claim, index) => {
    assertPlainObject(claim, `input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.claims[${index}]`);
    const sourceHashes = uniqueBoundedStringArray(claim.sourceHashes, `input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.claims[${index}].sourceHashes`, 1, 20, 71, 71);
    for (const sourceHash of sourceHashes) {
      if (!/^sha256:[a-f0-9]{64}$/u.test(sourceHash)) {
        throw projectionReviewError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_INVALID_SOURCE_HASH", "claim sourceHashes must be sha256 digests");
      }
    }
    return {
      claimId: requireString(claim.claimId, `input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.claims[${index}].claimId`),
      text: requireSafeText(claim.text, `input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.claims[${index}].text`),
      citations: uniqueBoundedStringArray(claim.citations, `input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.claims[${index}].citations`, 1, 20, 4, 400),
      sourceHashes,
      supportChunkIds: uniqueBoundedStringArray(claim.supportChunkIds, `input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.claims[${index}].supportChunkIds`, 1, 40, 1, 160),
      confidence: requireNumberBetween(claim.confidence, `input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.claims[${index}].confidence`, 0, 1),
      evidencePreserved: requireConst(claim.evidencePreserved, true, `input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.claims[${index}].evidencePreserved`),
    };
  });
}

function assertIntegrity(command, claims) {
  const claimCount = requireIntegerBetween(command.claimCount, "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.claimCount", 1, 200);
  const citationCount = requireIntegerBetween(command.citationCount, "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.citationCount", 1, 500);
  const sourceHashCount = requireIntegerBetween(command.sourceHashCount, "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.sourceHashCount", 1, 500);
  const actualCitationCount = new Set(claims.flatMap((claim) => claim.citations)).size;
  const actualSourceHashCount = new Set(claims.flatMap((claim) => claim.sourceHashes)).size;
  if (claimCount !== claims.length || citationCount !== actualCitationCount || sourceHashCount !== actualSourceHashCount) {
    throw projectionReviewError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_INTEGRITY_MISMATCH", "archive persistence command integrity counts must match claims");
  }
  return { claimCount, citationCount, sourceHashCount };
}

function assertRisk(risk) {
  assertPlainObject(risk, "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.risk");
  const normalized = {
    hallucinationRisk: requireEnum(risk.hallucinationRisk, "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.risk.hallucinationRisk", ["LOW", "MEDIUM", "HIGH"]),
    privateKnowledgeRisk: requireEnum(risk.privateKnowledgeRisk, "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.risk.privateKnowledgeRisk", ["LOW", "MEDIUM", "HIGH"]),
    studentDataRisk: requireEnum(risk.studentDataRisk, "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.risk.studentDataRisk", ["LOW", "MEDIUM", "HIGH"]),
    publicationRisk: requireEnum(risk.publicationRisk, "input.studentArchivePersistenceRecord.studentArchivePersistenceCommand.risk.publicationRisk", ["LOW", "MEDIUM", "HIGH"]),
  };
  if (Object.values(normalized).includes("HIGH")) {
    throw projectionReviewError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_HIGH_RISK_COMMAND", "student archive projection review cannot approve a HIGH risk persistence command");
  }
  return normalized;
}

function assertPersistenceBoundary(boundary) {
  assertPlainObject(boundary, "input.studentArchivePersistenceRecord.boundary");
  for (const field of [
    "teacherDeliveryVerified",
    "humanStudentVisibilityReviewRecorded",
    "studentDeliveryEnvelopeVerified",
    "studentVisible",
    "studentArchivePersistenceCommandRecorded",
    "appendOnlyCommandLogRecorded",
    "evidenceIntegrityPreserved",
    "sourceHashIntegrityPreserved",
    "limitationsPreserved",
    "studentAudienceScopeEnforced",
    "requiresFutureDurableProjectionReview",
  ]) {
    requireConst(boundary[field], true, `input.studentArchivePersistenceRecord.boundary.${field}`);
  }
  for (const field of [
    "studentArchivePersisted",
    "studentArchiveProjectionWritten",
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
    requireConst(boundary[field], false, `input.studentArchivePersistenceRecord.boundary.${field}`);
  }
}

function assertProjectionReviewPolicy(policy) {
  assertPlainObject(policy, "input.studentArchiveProjectionReviewPolicy");
  for (const field of [
    "reviewedPersistenceCommandRequired",
    "humanProjectionReviewRequired",
    "durableProjectionReviewAllowed",
    "appendOnlyReviewLogRequired",
    "preserveEvidenceRequired",
    "preserveSourceHashesRequired",
    "preserveLimitationsRequired",
    "studentAudienceScopeRequired",
    "futureDurableProjectionRuntimeRequired",
  ]) {
    requireConst(policy[field], true, `input.studentArchiveProjectionReviewPolicy.${field}`);
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
    requireConst(policy[field], false, `input.studentArchiveProjectionReviewPolicy.${field}`);
  }
  return { ...policy };
}

function assertProjectionReviewRequest(request, persistenceRecord) {
  assertPlainObject(request, "input.studentArchiveProjectionReviewRequest");
  const command = persistenceRecord.studentArchivePersistenceCommand;
  requireConst(request.decision, "APPROVED_FOR_DURABLE_STUDENT_ARCHIVE_PROJECTION_RUNTIME", "input.studentArchiveProjectionReviewRequest.decision");
  requireConst(request.targetArchiveKind, "STUDENT_LEARNING_ARCHIVE", "input.studentArchiveProjectionReviewRequest.targetArchiveKind");
  requireConst(request.desiredProjectionState, "REVIEWED_FOR_DURABLE_PROJECTION_NOT_WRITTEN", "input.studentArchiveProjectionReviewRequest.desiredProjectionState");
  requireConst(request.archiveScopeRef, command.archiveScopeRef, "input.studentArchiveProjectionReviewRequest.archiveScopeRef");
  requireConst(request.sourcePersistenceRecordId, persistenceRecord.recordId, "input.studentArchiveProjectionReviewRequest.sourcePersistenceRecordId");
  requireConst(request.sourcePersistenceCommandId, command.commandId, "input.studentArchiveProjectionReviewRequest.sourcePersistenceCommandId");
  requireConst(request.sourceStudentDeliveryEnvelopeId, command.sourceStudentDeliveryEnvelopeId, "input.studentArchiveProjectionReviewRequest.sourceStudentDeliveryEnvelopeId");
  return {
    reviewId: requireString(request.reviewId, "input.studentArchiveProjectionReviewRequest.reviewId"),
    decision: "APPROVED_FOR_DURABLE_STUDENT_ARCHIVE_PROJECTION_RUNTIME",
    targetArchiveKind: "STUDENT_LEARNING_ARCHIVE",
    archiveScopeRef: command.archiveScopeRef,
    sourcePersistenceRecordId: persistenceRecord.recordId,
    sourcePersistenceCommandId: command.commandId,
    sourceStudentDeliveryEnvelopeId: command.sourceStudentDeliveryEnvelopeId,
    desiredProjectionState: "REVIEWED_FOR_DURABLE_PROJECTION_NOT_WRITTEN",
    reviewerPrincipalId: requireString(request.reviewerPrincipalId, "input.studentArchiveProjectionReviewRequest.reviewerPrincipalId"),
    comments: requireSafeText(request.comments, "input.studentArchiveProjectionReviewRequest.comments"),
  };
}

function buildReviewRecord(normalized, recordedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW",
    recordId: `research_deep_research_student_archive_projection_review_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    runtimeId: RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_RUNTIME_ID,
    commandPort: RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_COMMAND_PORT,
    status: "STUDENT_ARCHIVE_PROJECTION_REVIEW_APPROVED_NOT_WRITTEN",
    projectionReviewInvocationId: normalized.projectionReviewInvocationId,
    principal: normalized.principal,
    job: normalized.persistenceRecord.job,
    studentArchiveProjectionReview: buildStudentArchiveProjectionReview(normalized),
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.persistenceRecord.evidenceRefs,
        `evidence:student-archive-projection-review-input-hash:${normalized.projectionReviewInputHash}`,
        `evidence:runtime:${RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_RUNTIME_ID}`,
        `evidence:command-port:${RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_COMMAND_PORT}`,
        `evidence:student-archive-persistence-record:${normalized.persistenceRecord.recordId}`,
      ]),
      idempotencyKey: normalized.idempotencyKey,
      projectionReviewInputHash: normalized.projectionReviewInputHash,
    },
    boundary: buildBoundary(),
  };
}

function buildStudentArchiveProjectionReview(normalized) {
  const command = normalized.persistenceRecord.studentArchivePersistenceCommand;
  const request = normalized.projectionReviewRequest;
  return {
    reviewId: request.reviewId,
    reviewKind: "DURABLE_STUDENT_ARCHIVE_PROJECTION_REVIEW",
    decision: request.decision,
    projectionState: "REVIEWED_NOT_PROJECTED_TO_STUDENT_ARCHIVE",
    targetArchiveKind: request.targetArchiveKind,
    archiveScopeRef: request.archiveScopeRef,
    sourcePersistenceRecordId: normalized.persistenceRecord.recordId,
    sourcePersistenceCommandId: command.commandId,
    sourceStudentDeliveryRecordId: command.sourceStudentDeliveryRecordId,
    sourceStudentDeliveryEnvelopeId: command.sourceStudentDeliveryEnvelopeId,
    studentVisibilityReviewId: command.studentVisibilityReviewId,
    teacherDeliveryPackageId: command.teacherDeliveryPackageId,
    reviewerPrincipalId: request.reviewerPrincipalId,
    comments: request.comments,
    title: command.title,
    learnerFacingSummary: command.learnerFacingSummary,
    claimCount: command.claimCount,
    citationCount: command.citationCount,
    sourceHashCount: command.sourceHashCount,
    claims: command.claims,
    limitations: command.limitations,
    risk: command.risk,
    approvedForFutureDurableProjection: true,
    revisionRequired: false,
    evidencePreserved: true,
    sourceHashIntegrityPreserved: true,
    limitationsPreserved: true,
  };
}

function buildBoundary() {
  return {
    studentArchivePersistenceCommandVerified: true,
    humanProjectionReviewRecorded: true,
    approvedForFutureDurableProjection: true,
    appendOnlyReviewLogRecorded: true,
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
    requiresFutureDurableProjectionRuntime: true,
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
    studentArchiveProjectionReview: record.studentArchiveProjectionReview,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 300,
      evidenceClass: "ASYNC_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_BOUNDARY",
    },
    nextAction: "Use this review as authorization evidence only; durable student archive projection remains a separate runtime.",
  };
}

function appendReviewRecord(reviewLogPath, record) {
  const absolute = path.resolve(reviewLogPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.appendFileSync(absolute, `${JSON.stringify(record)}\n`);
}

function findExistingRecordByIdempotencyKey(reviewLogPath, idempotencyKey) {
  const absolute = path.resolve(reviewLogPath);
  if (!fs.existsSync(absolute)) return null;
  const lines = fs.readFileSync(absolute, "utf8").split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const record = JSON.parse(lines[index]);
    if (record?.recordType === "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.projectionReviewInvocationId !== normalized.projectionReviewInvocationId ||
    existing.job?.jobId !== normalized.persistenceRecord.job.jobId ||
    existing.studentArchiveProjectionReview?.reviewId !== normalized.projectionReviewRequest.reviewId ||
    existing.evidence?.projectionReviewInputHash !== normalized.projectionReviewInputHash) {
    throw projectionReviewError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different student archive projection review");
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
    throw projectionReviewError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_UNSAFE_TEXT", `${label} must be encoded safe text`);
  }
  return text;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw projectionReviewError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireBoundedString(value, label, minLength, maxLength) {
  const text = requireString(value, label);
  if (text.length < minLength || text.length > maxLength) {
    throw projectionReviewError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_INVALID_INPUT", `${label} length must be ${minLength}-${maxLength}`);
  }
  return text;
}

function requireEnum(value, label, allowed) {
  const text = requireString(value, label);
  if (!allowed.includes(text)) {
    throw projectionReviewError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_INVALID_INPUT", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw projectionReviewError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_INVALID_INPUT", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireNumberBetween(value, label, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw projectionReviewError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_INVALID_INPUT", `${label} must be a number between ${min} and ${max}`);
  }
  return value;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw projectionReviewError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_BOUNDARY_VIOLATION", `${label} must be ${expected}`);
  }
  return expected;
}

function uniqueStringArray(value, label, minItems, maxItems) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw projectionReviewError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_INVALID_INPUT", `${label} must contain ${minItems}-${maxItems} items`);
  }
  const items = value.map((item) => requireString(item, label));
  if (new Set(items).size !== items.length) {
    throw projectionReviewError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_INVALID_INPUT", `${label} must be unique`);
  }
  return items;
}

function uniqueBoundedStringArray(value, label, minItems, maxItems, minLength, maxLength) {
  return uniqueStringArray(value, label, minItems, maxItems)
    .map((item) => requireBoundedString(item, `${label}[]`, minLength, maxLength));
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw projectionReviewError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_INVALID_INPUT", `${label} must be an object`);
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

function projectionReviewError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
