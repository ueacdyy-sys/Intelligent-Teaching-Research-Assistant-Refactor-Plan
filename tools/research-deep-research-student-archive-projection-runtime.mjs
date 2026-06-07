import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_RUNTIME_ID = "research_deep_research_student_archive_projection_runtime";
export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_COMMAND_PORT = "DeepResearchStudentArchiveProjectionPort.projectReviewedStudentArchiveEntry";
export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_READY = "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_READY";

const inputSchemaVersion = "2026-06-05.research.deep-research-student-archive-projection.v1";
const outputSchemaVersion = "2026-06-05.research.deep-research-student-archive-projection-recorded.v1";
const projectionReviewSchemaVersion = "2026-06-05.research.deep-research-student-archive-projection-review-recorded.v1";
const defaultProjectionLogPath = "reports/research-command-log/deep-research-student-archive-projection.jsonl";

export function projectReviewedStudentArchiveEntry(input, options = {}) {
  const recordedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const projectionLogPath = options.projectionLogPath ?? defaultProjectionLogPath;
  const existing = findExistingRecordByIdempotencyKey(projectionLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const record = buildProjectionRecord(normalized, recordedAt);
  appendProjectionRecord(projectionLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatDeepResearchStudentArchiveProjection(result) {
  return [
    `Research deep_research student archive projection: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Job: ${result.job.jobId}`,
    `Projection: ${result.studentArchiveProjectionRecord.projectionId}`,
    `Projected: ${result.boundary.studentArchiveProjectionWritten}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const projectionInvocationId = requireString(input.projectionInvocationId, "input.projectionInvocationId");
  const principal = assertPrincipal(input.principal);
  const projectionReviewRecord = assertProjectionReviewRecord(input.studentArchiveProjectionReviewRecord);
  const projectionPolicy = assertProjectionPolicy(input.studentArchiveProjectionPolicy);
  const projectionRequest = assertProjectionRequest(input.studentArchiveProjectionRequest, projectionReviewRecord);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 200);
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 240);
  const projectionInputHash = hashInput({
    projectionInvocationId,
    principalId: principal.principalId,
    projectionReviewRecordId: projectionReviewRecord.recordId,
    projectionReviewId: projectionReviewRecord.studentArchiveProjectionReview.reviewId,
    projectionRequest,
    projectionPolicy,
  });
  return {
    projectionInvocationId,
    principal,
    projectionReviewRecord,
    projectionPolicy,
    projectionRequest,
    evidenceRefs,
    idempotencyKey,
    projectionInputHash,
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
  if (normalized.role !== "SERVICE" || normalized.subjectType !== "SERVICE" || normalized.entryPoint !== "STUDENT_ARCHIVE_PROJECTION_RUNTIME") {
    throw projectionError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_FORBIDDEN_PRINCIPAL", "student archive projection requires the controlled projection service principal");
  }
  for (const scope of ["RESEARCH_READ", "STUDENT_ARCHIVE_PERSISTENCE", "STUDENT_ARCHIVE_PROJECTION_WRITE"]) {
    if (!normalized.scopes.includes(scope)) {
      throw projectionError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_MISSING_SCOPE", `${scope} scope is required`);
    }
  }
  return normalized;
}

function assertProjectionReviewRecord(record) {
  assertPlainObject(record, "input.studentArchiveProjectionReviewRecord");
  requireConst(record.schemaVersion, projectionReviewSchemaVersion, "input.studentArchiveProjectionReviewRecord.schemaVersion");
  requireConst(record.runtimeId, "research_deep_research_student_archive_projection_review_runtime", "input.studentArchiveProjectionReviewRecord.runtimeId");
  requireConst(record.commandPort, "DeepResearchStudentArchiveProjectionReviewPort.recordStudentArchiveProjectionReview", "input.studentArchiveProjectionReviewRecord.commandPort");
  requireConst(record.status, "STUDENT_ARCHIVE_PROJECTION_REVIEW_APPROVED_NOT_WRITTEN", "input.studentArchiveProjectionReviewRecord.status");
  const recordId = requireString(record.recordId, "input.studentArchiveProjectionReviewRecord.recordId");
  const job = assertJob(record.job, "input.studentArchiveProjectionReviewRecord.job");
  const review = assertProjectionReview(record.studentArchiveProjectionReview);
  const evidenceRefs = uniqueStringArray(record.evidenceRefs, "input.studentArchiveProjectionReviewRecord.evidenceRefs", 1, 800);
  assertProjectionReviewBoundary(record.boundary);
  return { ...record, recordId, job, studentArchiveProjectionReview: review, evidenceRefs };
}

function assertProjectionReview(review) {
  assertPlainObject(review, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview");
  requireConst(review.reviewKind, "DURABLE_STUDENT_ARCHIVE_PROJECTION_REVIEW", "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.reviewKind");
  requireConst(review.decision, "APPROVED_FOR_DURABLE_STUDENT_ARCHIVE_PROJECTION_RUNTIME", "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.decision");
  requireConst(review.projectionState, "REVIEWED_NOT_PROJECTED_TO_STUDENT_ARCHIVE", "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.projectionState");
  requireConst(review.targetArchiveKind, "STUDENT_LEARNING_ARCHIVE", "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.targetArchiveKind");
  requireConst(review.approvedForFutureDurableProjection, true, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.approvedForFutureDurableProjection");
  requireConst(review.revisionRequired, false, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.revisionRequired");
  const claims = assertClaims(review.claims);
  const limitations = uniqueBoundedStringArray(review.limitations, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.limitations", 1, 12, 1, 600);
  const risk = assertRisk(review.risk);
  const integrity = assertIntegrity(review, claims);
  return {
    reviewId: requireString(review.reviewId, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.reviewId"),
    reviewKind: "DURABLE_STUDENT_ARCHIVE_PROJECTION_REVIEW",
    decision: "APPROVED_FOR_DURABLE_STUDENT_ARCHIVE_PROJECTION_RUNTIME",
    projectionState: "REVIEWED_NOT_PROJECTED_TO_STUDENT_ARCHIVE",
    targetArchiveKind: "STUDENT_LEARNING_ARCHIVE",
    archiveScopeRef: requireBoundedString(review.archiveScopeRef, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.archiveScopeRef", 3, 200),
    sourcePersistenceRecordId: requireString(review.sourcePersistenceRecordId, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.sourcePersistenceRecordId"),
    sourcePersistenceCommandId: requireString(review.sourcePersistenceCommandId, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.sourcePersistenceCommandId"),
    sourceStudentDeliveryRecordId: requireString(review.sourceStudentDeliveryRecordId, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.sourceStudentDeliveryRecordId"),
    sourceStudentDeliveryEnvelopeId: requireString(review.sourceStudentDeliveryEnvelopeId, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.sourceStudentDeliveryEnvelopeId"),
    studentVisibilityReviewId: requireString(review.studentVisibilityReviewId, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.studentVisibilityReviewId"),
    teacherDeliveryPackageId: requireString(review.teacherDeliveryPackageId, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.teacherDeliveryPackageId"),
    reviewerPrincipalId: requireString(review.reviewerPrincipalId, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.reviewerPrincipalId"),
    comments: requireSafeText(review.comments, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.comments"),
    title: requireSafeText(review.title, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.title"),
    learnerFacingSummary: requireSafeText(review.learnerFacingSummary, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.learnerFacingSummary"),
    ...integrity,
    claims,
    limitations,
    risk,
    approvedForFutureDurableProjection: true,
    revisionRequired: false,
    evidencePreserved: requireConst(review.evidencePreserved, true, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.evidencePreserved"),
    sourceHashIntegrityPreserved: requireConst(review.sourceHashIntegrityPreserved, true, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.sourceHashIntegrityPreserved"),
    limitationsPreserved: requireConst(review.limitationsPreserved, true, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.limitationsPreserved"),
  };
}

function assertClaims(claims) {
  if (!Array.isArray(claims) || claims.length < 1 || claims.length > 200) {
    throw projectionError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_INVALID_CLAIMS", "projection review claims must contain 1-200 items");
  }
  return claims.map((claim, index) => {
    assertPlainObject(claim, `input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.claims[${index}]`);
    const sourceHashes = uniqueBoundedStringArray(claim.sourceHashes, `input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.claims[${index}].sourceHashes`, 1, 20, 71, 71);
    for (const sourceHash of sourceHashes) {
      if (!/^sha256:[a-f0-9]{64}$/u.test(sourceHash)) {
        throw projectionError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_INVALID_SOURCE_HASH", "claim sourceHashes must be sha256 digests");
      }
    }
    return {
      claimId: requireString(claim.claimId, `input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.claims[${index}].claimId`),
      text: requireSafeText(claim.text, `input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.claims[${index}].text`),
      citations: uniqueBoundedStringArray(claim.citations, `input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.claims[${index}].citations`, 1, 20, 4, 400),
      sourceHashes,
      supportChunkIds: uniqueBoundedStringArray(claim.supportChunkIds, `input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.claims[${index}].supportChunkIds`, 1, 40, 1, 160),
      confidence: requireNumberBetween(claim.confidence, `input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.claims[${index}].confidence`, 0, 1),
      evidencePreserved: requireConst(claim.evidencePreserved, true, `input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.claims[${index}].evidencePreserved`),
    };
  });
}

function assertIntegrity(review, claims) {
  const claimCount = requireIntegerBetween(review.claimCount, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.claimCount", 1, 200);
  const citationCount = requireIntegerBetween(review.citationCount, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.citationCount", 1, 500);
  const sourceHashCount = requireIntegerBetween(review.sourceHashCount, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.sourceHashCount", 1, 500);
  const actualCitationCount = new Set(claims.flatMap((claim) => claim.citations)).size;
  const actualSourceHashCount = new Set(claims.flatMap((claim) => claim.sourceHashes)).size;
  if (claimCount !== claims.length || citationCount !== actualCitationCount || sourceHashCount !== actualSourceHashCount) {
    throw projectionError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_INTEGRITY_MISMATCH", "projection review integrity counts must match claims");
  }
  return { claimCount, citationCount, sourceHashCount };
}

function assertRisk(risk) {
  assertPlainObject(risk, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.risk");
  const normalized = {
    hallucinationRisk: requireEnum(risk.hallucinationRisk, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.risk.hallucinationRisk", ["LOW", "MEDIUM", "HIGH"]),
    privateKnowledgeRisk: requireEnum(risk.privateKnowledgeRisk, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.risk.privateKnowledgeRisk", ["LOW", "MEDIUM", "HIGH"]),
    studentDataRisk: requireEnum(risk.studentDataRisk, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.risk.studentDataRisk", ["LOW", "MEDIUM", "HIGH"]),
    publicationRisk: requireEnum(risk.publicationRisk, "input.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.risk.publicationRisk", ["LOW", "MEDIUM", "HIGH"]),
  };
  if (Object.values(normalized).includes("HIGH")) {
    throw projectionError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_HIGH_RISK_REVIEW", "student archive projection cannot consume a HIGH risk review");
  }
  return normalized;
}

function assertProjectionReviewBoundary(boundary) {
  assertPlainObject(boundary, "input.studentArchiveProjectionReviewRecord.boundary");
  for (const field of [
    "studentArchivePersistenceCommandVerified",
    "humanProjectionReviewRecorded",
    "approvedForFutureDurableProjection",
    "appendOnlyReviewLogRecorded",
    "evidenceIntegrityPreserved",
    "sourceHashIntegrityPreserved",
    "limitationsPreserved",
    "studentAudienceScopeEnforced",
    "requiresFutureDurableProjectionRuntime",
  ]) {
    requireConst(boundary[field], true, `input.studentArchiveProjectionReviewRecord.boundary.${field}`);
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
    requireConst(boundary[field], false, `input.studentArchiveProjectionReviewRecord.boundary.${field}`);
  }
}

function assertProjectionPolicy(policy) {
  assertPlainObject(policy, "input.studentArchiveProjectionPolicy");
  for (const field of [
    "reviewedProjectionReviewRequired",
    "durableStudentArchiveProjectionAllowed",
    "appendOnlyProjectionLogRequired",
    "preserveEvidenceRequired",
    "preserveSourceHashesRequired",
    "preserveLimitationsRequired",
    "studentAudienceScopeRequired",
    "studentArchiveProjectionWriteAllowed",
  ]) {
    requireConst(policy[field], true, `input.studentArchiveProjectionPolicy.${field}`);
  }
  for (const field of [
    "directPublicationAllowed",
    "directDatabaseAccessAllowed",
    "mainDatabaseWriteAllowed",
    "externalModelCallAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.studentArchiveProjectionPolicy.${field}`);
  }
  return { ...policy };
}

function assertProjectionRequest(request, projectionReviewRecord) {
  assertPlainObject(request, "input.studentArchiveProjectionRequest");
  const review = projectionReviewRecord.studentArchiveProjectionReview;
  requireConst(request.projectionMode, "APPEND_ONLY_STUDENT_ARCHIVE_PROJECTION", "input.studentArchiveProjectionRequest.projectionMode");
  requireConst(request.targetArchiveKind, "STUDENT_LEARNING_ARCHIVE", "input.studentArchiveProjectionRequest.targetArchiveKind");
  requireConst(request.desiredProjectionState, "PROJECTED_TO_STUDENT_ARCHIVE", "input.studentArchiveProjectionRequest.desiredProjectionState");
  requireConst(request.archiveScopeRef, review.archiveScopeRef, "input.studentArchiveProjectionRequest.archiveScopeRef");
  requireConst(request.sourceProjectionReviewRecordId, projectionReviewRecord.recordId, "input.studentArchiveProjectionRequest.sourceProjectionReviewRecordId");
  requireConst(request.sourceProjectionReviewId, review.reviewId, "input.studentArchiveProjectionRequest.sourceProjectionReviewId");
  requireConst(request.sourcePersistenceRecordId, review.sourcePersistenceRecordId, "input.studentArchiveProjectionRequest.sourcePersistenceRecordId");
  requireConst(request.sourcePersistenceCommandId, review.sourcePersistenceCommandId, "input.studentArchiveProjectionRequest.sourcePersistenceCommandId");
  requireConst(request.sourceStudentDeliveryEnvelopeId, review.sourceStudentDeliveryEnvelopeId, "input.studentArchiveProjectionRequest.sourceStudentDeliveryEnvelopeId");
  return {
    projectionId: requireString(request.projectionId, "input.studentArchiveProjectionRequest.projectionId"),
    projectionMode: "APPEND_ONLY_STUDENT_ARCHIVE_PROJECTION",
    targetArchiveKind: "STUDENT_LEARNING_ARCHIVE",
    archiveScopeRef: review.archiveScopeRef,
    sourceProjectionReviewRecordId: projectionReviewRecord.recordId,
    sourceProjectionReviewId: review.reviewId,
    sourcePersistenceRecordId: review.sourcePersistenceRecordId,
    sourcePersistenceCommandId: review.sourcePersistenceCommandId,
    sourceStudentDeliveryEnvelopeId: review.sourceStudentDeliveryEnvelopeId,
    desiredProjectionState: "PROJECTED_TO_STUDENT_ARCHIVE",
  };
}

function buildProjectionRecord(normalized, recordedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION",
    recordId: `research_deep_research_student_archive_projection_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    runtimeId: RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_RUNTIME_ID,
    commandPort: RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_COMMAND_PORT,
    status: "STUDENT_ARCHIVE_PROJECTION_WRITTEN",
    projectionInvocationId: normalized.projectionInvocationId,
    principal: normalized.principal,
    job: normalized.projectionReviewRecord.job,
    studentArchiveProjectionRecord: buildStudentArchiveProjectionRecord(normalized, recordedAt),
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.projectionReviewRecord.evidenceRefs,
        `evidence:student-archive-projection-input-hash:${normalized.projectionInputHash}`,
        `evidence:runtime:${RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_RUNTIME_ID}`,
        `evidence:command-port:${RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_COMMAND_PORT}`,
        `evidence:student-archive-projection-review-record:${normalized.projectionReviewRecord.recordId}`,
      ]),
      idempotencyKey: normalized.idempotencyKey,
      projectionInputHash: normalized.projectionInputHash,
    },
    boundary: buildBoundary(),
  };
}

function buildStudentArchiveProjectionRecord(normalized, projectedAt) {
  const review = normalized.projectionReviewRecord.studentArchiveProjectionReview;
  const request = normalized.projectionRequest;
  return {
    projectionId: request.projectionId,
    projectionKind: "DURABLE_STUDENT_ARCHIVE_PROJECTION_RECORD",
    projectionMode: request.projectionMode,
    projectionState: "PROJECTED_TO_STUDENT_ARCHIVE",
    archiveEntryState: "ACTIVE_STUDENT_ARCHIVE_ENTRY",
    targetArchiveKind: request.targetArchiveKind,
    archiveScopeRef: request.archiveScopeRef,
    projectedAt,
    sourceProjectionReviewRecordId: normalized.projectionReviewRecord.recordId,
    sourceProjectionReviewId: review.reviewId,
    sourcePersistenceRecordId: review.sourcePersistenceRecordId,
    sourcePersistenceCommandId: review.sourcePersistenceCommandId,
    sourceStudentDeliveryRecordId: review.sourceStudentDeliveryRecordId,
    sourceStudentDeliveryEnvelopeId: review.sourceStudentDeliveryEnvelopeId,
    studentVisibilityReviewId: review.studentVisibilityReviewId,
    teacherDeliveryPackageId: review.teacherDeliveryPackageId,
    title: review.title,
    learnerFacingSummary: review.learnerFacingSummary,
    claimCount: review.claimCount,
    citationCount: review.citationCount,
    sourceHashCount: review.sourceHashCount,
    claims: review.claims,
    limitations: review.limitations,
    risk: review.risk,
    evidencePreserved: true,
    sourceHashIntegrityPreserved: true,
    limitationsPreserved: true,
  };
}

function buildBoundary() {
  return {
    studentArchiveProjectionReviewVerified: true,
    durableStudentArchiveProjectionRecorded: true,
    appendOnlyProjectionLogRecorded: true,
    evidenceIntegrityPreserved: true,
    sourceHashIntegrityPreserved: true,
    limitationsPreserved: true,
    studentAudienceScopeEnforced: true,
    studentArchivePersisted: true,
    studentArchiveProjectionWritten: true,
    studentArchiveWriteStarted: true,
    finalAnswerPublished: false,
    publicationCandidateCreated: false,
    directPublicationAllowed: false,
    externalModelCallStarted: false,
    mainDatabaseWriteStarted: false,
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
    job: record.job,
    studentArchiveProjectionRecord: record.studentArchiveProjectionRecord,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 300,
      evidenceClass: "ASYNC_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_BOUNDARY",
    },
    nextAction: "Use this projection as the durable student archive entry evidence; main database integration remains a separate reviewed storage slice.",
  };
}

function appendProjectionRecord(projectionLogPath, record) {
  const absolute = path.resolve(projectionLogPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.appendFileSync(absolute, `${JSON.stringify(record)}\n`);
}

function findExistingRecordByIdempotencyKey(projectionLogPath, idempotencyKey) {
  const absolute = path.resolve(projectionLogPath);
  if (!fs.existsSync(absolute)) return null;
  const lines = fs.readFileSync(absolute, "utf8").split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const record = JSON.parse(lines[index]);
    if (record?.recordType === "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.projectionInvocationId !== normalized.projectionInvocationId ||
    existing.job?.jobId !== normalized.projectionReviewRecord.job.jobId ||
    existing.studentArchiveProjectionRecord?.projectionId !== normalized.projectionRequest.projectionId ||
    existing.evidence?.projectionInputHash !== normalized.projectionInputHash) {
    throw projectionError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different student archive projection");
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
    throw projectionError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_UNSAFE_TEXT", `${label} must be encoded safe text`);
  }
  return text;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw projectionError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireBoundedString(value, label, minLength, maxLength) {
  const text = requireString(value, label);
  if (text.length < minLength || text.length > maxLength) {
    throw projectionError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_INVALID_INPUT", `${label} length must be ${minLength}-${maxLength}`);
  }
  return text;
}

function requireEnum(value, label, allowed) {
  const text = requireString(value, label);
  if (!allowed.includes(text)) {
    throw projectionError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_INVALID_INPUT", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw projectionError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_INVALID_INPUT", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireNumberBetween(value, label, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw projectionError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_INVALID_INPUT", `${label} must be a number between ${min} and ${max}`);
  }
  return value;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw projectionError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_BOUNDARY_VIOLATION", `${label} must be ${expected}`);
  }
  return expected;
}

function uniqueStringArray(value, label, minItems, maxItems) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw projectionError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_INVALID_INPUT", `${label} must contain ${minItems}-${maxItems} items`);
  }
  const items = value.map((item) => requireString(item, label));
  if (new Set(items).size !== items.length) {
    throw projectionError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_INVALID_INPUT", `${label} must be unique`);
  }
  return items;
}

function uniqueBoundedStringArray(value, label, minItems, maxItems, minLength, maxLength) {
  return uniqueStringArray(value, label, minItems, maxItems)
    .map((item) => requireBoundedString(item, `${label}[]`, minLength, maxLength));
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw projectionError("RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_INVALID_INPUT", `${label} must be an object`);
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

function projectionError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
