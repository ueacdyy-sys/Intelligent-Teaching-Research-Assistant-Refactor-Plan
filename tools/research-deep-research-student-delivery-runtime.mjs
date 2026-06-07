import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_RUNTIME_ID = "research_deep_research_student_delivery_runtime";
export const RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_COMMAND_PORT = "DeepResearchStudentDeliveryPort.recordStudentDeliveryEnvelope";
export const RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_READY = "RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_READY";

const inputSchemaVersion = "2026-06-05.research.deep-research-student-delivery.v1";
const outputSchemaVersion = "2026-06-05.research.deep-research-student-delivery-recorded.v1";
const studentVisibilityReviewSchemaVersion = "2026-06-05.research.deep-research-student-visibility-review-recorded.v1";
const defaultCommandLogPath = "reports/research-command-log/deep-research-student-delivery.jsonl";

export function recordDeepResearchStudentDeliveryEnvelope(input, options = {}) {
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

export function formatDeepResearchStudentDelivery(result) {
  return [
    `Research deep_research student delivery: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Job: ${result.job.jobId}`,
    `Envelope: ${result.studentDeliveryEnvelope.envelopeId}`,
    `Student visible: ${result.boundary.studentVisible}`,
    `Persisted: ${result.boundary.studentDeliveryPersisted}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const deliveryInvocationId = requireString(input.deliveryInvocationId, "input.deliveryInvocationId");
  const principal = assertPrincipal(input.principal);
  const studentVisibilityReviewRecord = assertStudentVisibilityReviewRecord(input.studentVisibilityReviewRecord);
  const studentDeliveryPolicy = assertStudentDeliveryPolicy(input.studentDeliveryPolicy);
  const deliveryRequest = assertDeliveryRequest(input.studentDeliveryRequest, studentVisibilityReviewRecord);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 160);
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 240);
  const deliveryInputHash = hashInput({
    deliveryInvocationId,
    principalId: principal.principalId,
    studentVisibilityReviewRecordId: studentVisibilityReviewRecord.recordId,
    reviewId: studentVisibilityReviewRecord.studentVisibilityReview.reviewId,
    deliveryRequest,
    studentDeliveryPolicy,
  });
  return {
    deliveryInvocationId,
    principal,
    studentVisibilityReviewRecord,
    studentDeliveryPolicy,
    deliveryRequest,
    evidenceRefs,
    idempotencyKey,
    deliveryInputHash,
  };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const principalId = requireString(principal.principalId, "input.principal.principalId");
  const role = requireString(principal.role, "input.principal.role");
  const subjectType = requireString(principal.subjectType, "input.principal.subjectType");
  const entryPoint = requireString(principal.entryPoint, "input.principal.entryPoint");
  const sessionId = requireString(principal.sessionId, "input.principal.sessionId");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  if (role !== "SERVICE" || subjectType !== "SERVICE" || entryPoint !== "STUDENT_DELIVERY_RUNTIME") {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_FORBIDDEN_PRINCIPAL", "student delivery envelope requires the controlled delivery service principal");
  }
  for (const scope of ["RESEARCH_READ", "STUDENT_DELIVERY_ENVELOPE", "STUDENT_APP_DELIVERY"]) {
    if (!scopes.includes(scope)) {
      throw deliveryError("RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_MISSING_SCOPE", `${scope} scope is required`);
    }
  }
  return { principalId, role, subjectType, entryPoint, sessionId, scopes };
}

function assertStudentVisibilityReviewRecord(record) {
  assertPlainObject(record, "input.studentVisibilityReviewRecord");
  requireConst(record.schemaVersion, studentVisibilityReviewSchemaVersion, "input.studentVisibilityReviewRecord.schemaVersion");
  requireConst(record.runtimeId, "research_deep_research_student_visibility_review_runtime", "input.studentVisibilityReviewRecord.runtimeId");
  requireConst(record.commandPort, "DeepResearchStudentVisibilityReviewPort.recordStudentVisibilityReview", "input.studentVisibilityReviewRecord.commandPort");
  requireConst(record.status, "STUDENT_VISIBILITY_REVIEW_APPROVED_NOT_DELIVERED", "input.studentVisibilityReviewRecord.status");
  const recordId = requireString(record.recordId, "input.studentVisibilityReviewRecord.recordId");
  const job = assertJob(record.job, "input.studentVisibilityReviewRecord.job");
  const teacherDeliveryPackage = assertTeacherDeliveryPackage(record.teacherDeliveryPackage);
  const studentVisibilityReview = assertStudentVisibilityReview(record.studentVisibilityReview, recordId, teacherDeliveryPackage.packageId);
  const evidenceRefs = uniqueStringArray(record.evidenceRefs, "input.studentVisibilityReviewRecord.evidenceRefs", 1, 400);
  assertVisibilityReviewBoundary(record.boundary);
  return { ...record, recordId, job, teacherDeliveryPackage, studentVisibilityReview, evidenceRefs };
}

function assertTeacherDeliveryPackage(pkg) {
  assertPlainObject(pkg, "input.studentVisibilityReviewRecord.teacherDeliveryPackage");
  requireConst(pkg.packageKind, "EVIDENCE_GROUNDED_TEACHER_DELIVERY_PACKAGE", "input.studentVisibilityReviewRecord.teacherDeliveryPackage.packageKind");
  const claims = assertClaims(pkg.claims);
  const limitations = uniqueBoundedStringArray(pkg.limitations, "input.studentVisibilityReviewRecord.teacherDeliveryPackage.limitations", 1, 12, 1, 600);
  const risk = assertRisk(pkg.risk);
  const claimCount = requireIntegerBetween(pkg.claimCount, "input.studentVisibilityReviewRecord.teacherDeliveryPackage.claimCount", 1, 200);
  const citationCount = requireIntegerBetween(pkg.citationCount, "input.studentVisibilityReviewRecord.teacherDeliveryPackage.citationCount", 1, 500);
  const sourceHashCount = requireIntegerBetween(pkg.sourceHashCount, "input.studentVisibilityReviewRecord.teacherDeliveryPackage.sourceHashCount", 1, 500);
  const actualCitationCount = new Set(claims.flatMap((claim) => claim.citations)).size;
  const actualSourceHashCount = new Set(claims.flatMap((claim) => claim.sourceHashes)).size;
  if (claimCount !== claims.length || citationCount !== actualCitationCount || sourceHashCount !== actualSourceHashCount) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_INTEGRITY_MISMATCH", "teacher package integrity counts must match claims");
  }
  return {
    packageId: requireString(pkg.packageId, "input.studentVisibilityReviewRecord.teacherDeliveryPackage.packageId"),
    packageKind: pkg.packageKind,
    previewId: requireString(pkg.previewId, "input.studentVisibilityReviewRecord.teacherDeliveryPackage.previewId"),
    artifactId: requireString(pkg.artifactId, "input.studentVisibilityReviewRecord.teacherDeliveryPackage.artifactId"),
    title: requireSafeText(pkg.title, "input.studentVisibilityReviewRecord.teacherDeliveryPackage.title"),
    summary: requireSafeText(pkg.summary, "input.studentVisibilityReviewRecord.teacherDeliveryPackage.summary"),
    claimCount,
    citationCount,
    sourceHashCount,
    claims,
    limitations,
    risk,
  };
}

function assertClaims(claims) {
  if (!Array.isArray(claims) || claims.length < 1 || claims.length > 200) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_INVALID_CLAIMS", "teacher package claims must contain 1-200 items");
  }
  return claims.map((claim, index) => {
    assertPlainObject(claim, `input.studentVisibilityReviewRecord.teacherDeliveryPackage.claims[${index}]`);
    const sourceHashes = uniqueBoundedStringArray(claim.sourceHashes, `input.studentVisibilityReviewRecord.teacherDeliveryPackage.claims[${index}].sourceHashes`, 1, 20, 71, 71);
    for (const sourceHash of sourceHashes) {
      if (!/^sha256:[a-f0-9]{64}$/u.test(sourceHash)) {
        throw deliveryError("RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_INVALID_SOURCE_HASH", "claim sourceHashes must be sha256 digests");
      }
    }
    return {
      claimId: requireString(claim.claimId, `input.studentVisibilityReviewRecord.teacherDeliveryPackage.claims[${index}].claimId`),
      text: requireSafeText(claim.text, `input.studentVisibilityReviewRecord.teacherDeliveryPackage.claims[${index}].text`),
      citations: uniqueBoundedStringArray(claim.citations, `input.studentVisibilityReviewRecord.teacherDeliveryPackage.claims[${index}].citations`, 1, 20, 4, 400),
      sourceHashes,
      supportChunkIds: uniqueBoundedStringArray(claim.supportChunkIds, `input.studentVisibilityReviewRecord.teacherDeliveryPackage.claims[${index}].supportChunkIds`, 1, 40, 1, 160),
      confidence: requireNumberBetween(claim.confidence, `input.studentVisibilityReviewRecord.teacherDeliveryPackage.claims[${index}].confidence`, 0, 1),
      evidencePreserved: requireConst(claim.evidencePreserved, true, `input.studentVisibilityReviewRecord.teacherDeliveryPackage.claims[${index}].evidencePreserved`),
    };
  });
}

function assertRisk(risk) {
  assertPlainObject(risk, "input.studentVisibilityReviewRecord.teacherDeliveryPackage.risk");
  const normalized = {
    hallucinationRisk: requireEnum(risk.hallucinationRisk, "input.studentVisibilityReviewRecord.teacherDeliveryPackage.risk.hallucinationRisk", ["LOW", "MEDIUM", "HIGH"]),
    privateKnowledgeRisk: requireEnum(risk.privateKnowledgeRisk, "input.studentVisibilityReviewRecord.teacherDeliveryPackage.risk.privateKnowledgeRisk", ["LOW", "MEDIUM", "HIGH"]),
    studentDataRisk: requireEnum(risk.studentDataRisk, "input.studentVisibilityReviewRecord.teacherDeliveryPackage.risk.studentDataRisk", ["LOW", "MEDIUM", "HIGH"]),
    publicationRisk: requireEnum(risk.publicationRisk, "input.studentVisibilityReviewRecord.teacherDeliveryPackage.risk.publicationRisk", ["LOW", "MEDIUM", "HIGH"]),
  };
  if (Object.values(normalized).includes("HIGH")) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_HIGH_RISK_PACKAGE", "student delivery cannot expose a HIGH risk package");
  }
  return normalized;
}

function assertStudentVisibilityReview(review, recordId, packageId) {
  assertPlainObject(review, "input.studentVisibilityReviewRecord.studentVisibilityReview");
  requireConst(review.decision, "APPROVED_FOR_STUDENT_VISIBILITY_DELIVERY_RUNTIME", "input.studentVisibilityReviewRecord.studentVisibilityReview.decision");
  requireConst(review.approvedForFutureStudentDelivery, true, "input.studentVisibilityReviewRecord.studentVisibilityReview.approvedForFutureStudentDelivery");
  requireConst(review.revisionRequired, false, "input.studentVisibilityReviewRecord.studentVisibilityReview.revisionRequired");
  requireConst(review.teacherDeliveryPackageId, packageId, "input.studentVisibilityReviewRecord.studentVisibilityReview.teacherDeliveryPackageId");
  requireString(review.teacherDeliveryRecordId, "input.studentVisibilityReviewRecord.studentVisibilityReview.teacherDeliveryRecordId");
  const targetAudience = assertTargetAudience(review.targetAudience);
  for (const field of [
    "teacherDeliveryReviewed",
    "evidenceIntegrityReviewed",
    "sourceHashIntegrityReviewed",
    "limitationsReviewed",
    "studentDataDisclosureReviewed",
    "privateKnowledgeDisclosureReviewed",
    "ageAppropriateReviewed",
    "teacherAccountabilityAccepted",
  ]) {
    requireConst(review[field], true, `input.studentVisibilityReviewRecord.studentVisibilityReview.${field}`);
  }
  return {
    reviewId: requireString(review.reviewId, "input.studentVisibilityReviewRecord.studentVisibilityReview.reviewId"),
    reviewerPrincipalId: requireString(review.reviewerPrincipalId, "input.studentVisibilityReviewRecord.studentVisibilityReview.reviewerPrincipalId"),
    decision: "APPROVED_FOR_STUDENT_VISIBILITY_DELIVERY_RUNTIME",
    approvedForFutureStudentDelivery: true,
    revisionRequired: false,
    teacherDeliveryRecordId: review.teacherDeliveryRecordId,
    teacherDeliveryPackageId: packageId,
    targetAudience,
    teacherDeliveryReviewed: true,
    evidenceIntegrityReviewed: true,
    sourceHashIntegrityReviewed: true,
    limitationsReviewed: true,
    studentDataDisclosureReviewed: true,
    privateKnowledgeDisclosureReviewed: true,
    ageAppropriateReviewed: true,
    teacherAccountabilityAccepted: true,
    comments: requireSafeText(review.comments, "input.studentVisibilityReviewRecord.studentVisibilityReview.comments"),
    sourceReviewRecordId: recordId,
  };
}

function assertTargetAudience(audience) {
  assertPlainObject(audience, "input.studentVisibilityReviewRecord.studentVisibilityReview.targetAudience");
  return {
    audienceKind: requireConst(audience.audienceKind, "STUDENT_APP_LEARNING_SUPPORT", "input.studentVisibilityReviewRecord.studentVisibilityReview.targetAudience.audienceKind"),
    scopeRef: requireBoundedString(audience.scopeRef, "input.studentVisibilityReviewRecord.studentVisibilityReview.targetAudience.scopeRef", 3, 200),
    channel: requireConst(audience.channel, "STUDENT_APP", "input.studentVisibilityReviewRecord.studentVisibilityReview.targetAudience.channel"),
    visibilityState: requireConst(audience.visibilityState, "APPROVED_FOR_FUTURE_STUDENT_DELIVERY_NOT_VISIBLE", "input.studentVisibilityReviewRecord.studentVisibilityReview.targetAudience.visibilityState"),
  };
}

function assertVisibilityReviewBoundary(boundary) {
  assertPlainObject(boundary, "input.studentVisibilityReviewRecord.boundary");
  for (const field of [
    "teacherDeliveryVerified",
    "humanStudentVisibilityReviewRecorded",
    "studentVisibilityApprovedForFutureDelivery",
    "evidenceIntegrityPreserved",
    "sourceHashIntegrityPreserved",
    "limitationsPreserved",
    "studentAudienceScopeReviewed",
    "requiresFutureStudentDeliveryRuntime",
    "requiresFuturePersistenceReview",
  ]) {
    requireConst(boundary[field], true, `input.studentVisibilityReviewRecord.boundary.${field}`);
  }
  for (const field of [
    "finalAnswerPublished",
    "publicationCandidateCreated",
    "studentVisible",
    "studentDeliveryStarted",
    "directPublicationAllowed",
    "externalModelCallStarted",
    "mainDatabaseWriteStarted",
    "studentArchiveWriteStarted",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(boundary[field], false, `input.studentVisibilityReviewRecord.boundary.${field}`);
  }
}

function assertStudentDeliveryPolicy(policy) {
  assertPlainObject(policy, "input.studentDeliveryPolicy");
  for (const field of [
    "reviewedTeacherDeliveryRequired",
    "humanStudentVisibilityReviewRequired",
    "studentDeliveryEnvelopeAllowed",
    "studentVisibleEnvelopeAllowed",
    "preserveEvidenceRequired",
    "preserveSourceHashesRequired",
    "preserveLimitationsRequired",
    "studentAudienceScopeRequired",
    "futurePersistenceReviewRequired",
  ]) {
    requireConst(policy[field], true, `input.studentDeliveryPolicy.${field}`);
  }
  for (const field of [
    "directPublicationAllowed",
    "directDatabaseAccessAllowed",
    "mainDatabaseWriteAllowed",
    "studentArchiveWriteAllowed",
    "externalModelCallAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.studentDeliveryPolicy.${field}`);
  }
  return { ...policy };
}

function assertDeliveryRequest(request, reviewRecord) {
  assertPlainObject(request, "input.studentDeliveryRequest");
  requireConst(request.deliveryMode, "STUDENT_APP_RENDERABLE_ENVELOPE", "input.studentDeliveryRequest.deliveryMode");
  requireConst(request.channel, "STUDENT_APP", "input.studentDeliveryRequest.channel");
  requireConst(request.audienceKind, "STUDENT_APP_LEARNING_SUPPORT", "input.studentDeliveryRequest.audienceKind");
  requireConst(request.visibilityState, "STUDENT_VISIBLE_DELIVERY_ENVELOPE_NOT_PERSISTED", "input.studentDeliveryRequest.visibilityState");
  requireConst(request.studentVisibilityReviewRecordId, reviewRecord.recordId, "input.studentDeliveryRequest.studentVisibilityReviewRecordId");
  requireConst(request.studentVisibilityReviewId, reviewRecord.studentVisibilityReview.reviewId, "input.studentDeliveryRequest.studentVisibilityReviewId");
  requireConst(request.teacherDeliveryPackageId, reviewRecord.teacherDeliveryPackage.packageId, "input.studentDeliveryRequest.teacherDeliveryPackageId");
  requireConst(request.scopeRef, reviewRecord.studentVisibilityReview.targetAudience.scopeRef, "input.studentDeliveryRequest.scopeRef");
  return {
    envelopeId: requireString(request.envelopeId, "input.studentDeliveryRequest.envelopeId"),
    deliveryMode: "STUDENT_APP_RENDERABLE_ENVELOPE",
    channel: "STUDENT_APP",
    audienceKind: "STUDENT_APP_LEARNING_SUPPORT",
    visibilityState: "STUDENT_VISIBLE_DELIVERY_ENVELOPE_NOT_PERSISTED",
    scopeRef: request.scopeRef,
    studentVisibilityReviewRecordId: reviewRecord.recordId,
    studentVisibilityReviewId: reviewRecord.studentVisibilityReview.reviewId,
    teacherDeliveryPackageId: reviewRecord.teacherDeliveryPackage.packageId,
  };
}

function buildCommandRecord(normalized, recordedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY",
    recordId: `research_deep_research_student_delivery_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    runtimeId: RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_RUNTIME_ID,
    commandPort: RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_COMMAND_PORT,
    status: "STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED",
    deliveryInvocationId: normalized.deliveryInvocationId,
    principal: normalized.principal,
    job: normalized.studentVisibilityReviewRecord.job,
    studentDeliveryEnvelope: buildStudentDeliveryEnvelope(normalized),
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.studentVisibilityReviewRecord.evidenceRefs,
        `evidence:student-delivery-input-hash:${normalized.deliveryInputHash}`,
        `evidence:runtime:${RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_RUNTIME_ID}`,
        `evidence:command-port:${RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_COMMAND_PORT}`,
        `evidence:student-visibility-review-record:${normalized.studentVisibilityReviewRecord.recordId}`,
      ]),
      idempotencyKey: normalized.idempotencyKey,
      deliveryInputHash: normalized.deliveryInputHash,
    },
    boundary: buildBoundary(),
  };
}

function buildStudentDeliveryEnvelope(normalized) {
  const pkg = normalized.studentVisibilityReviewRecord.teacherDeliveryPackage;
  const review = normalized.studentVisibilityReviewRecord.studentVisibilityReview;
  const request = normalized.deliveryRequest;
  return {
    envelopeId: request.envelopeId,
    envelopeKind: "EVIDENCE_GROUNDED_STUDENT_DELIVERY_ENVELOPE",
    deliveryMode: request.deliveryMode,
    audience: request.audienceKind,
    channel: request.channel,
    scopeRef: request.scopeRef,
    visibilityState: request.visibilityState,
    deliveryState: "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED",
    teacherDeliveryPackageId: pkg.packageId,
    studentVisibilityReviewRecordId: normalized.studentVisibilityReviewRecord.recordId,
    studentVisibilityReviewId: review.reviewId,
    title: pkg.title,
    learnerFacingSummary: pkg.summary,
    claimCount: pkg.claimCount,
    citationCount: pkg.citationCount,
    sourceHashCount: pkg.sourceHashCount,
    claims: pkg.claims,
    limitations: pkg.limitations,
    risk: pkg.risk,
    evidencePreserved: true,
    sourceHashIntegrityPreserved: true,
    limitationsPreserved: true,
  };
}

function buildBoundary() {
  return {
    teacherDeliveryVerified: true,
    humanStudentVisibilityReviewRecorded: true,
    studentVisibilityApprovedForDelivery: true,
    studentDeliveryEnvelopeCreated: true,
    studentVisible: true,
    studentDeliveryStarted: true,
    studentDeliveryPersisted: false,
    evidenceIntegrityPreserved: true,
    sourceHashIntegrityPreserved: true,
    limitationsPreserved: true,
    studentAudienceScopeEnforced: true,
    finalAnswerPublished: false,
    publicationCandidateCreated: false,
    directPublicationAllowed: false,
    externalModelCallStarted: false,
    mainDatabaseWriteStarted: false,
    studentArchiveWriteStarted: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
    requiresFuturePersistenceReview: true,
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
    studentDeliveryEnvelope: record.studentDeliveryEnvelope,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 300,
      evidenceClass: "ASYNC_DEEP_RESEARCH_STUDENT_DELIVERY_BOUNDARY",
    },
    nextAction: "Render this returned envelope only inside the approved student app flow; durable student archive persistence remains a separate reviewed slice.",
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
    if (record?.recordType === "RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.deliveryInvocationId !== normalized.deliveryInvocationId ||
    existing.job?.jobId !== normalized.studentVisibilityReviewRecord.job.jobId ||
    existing.studentDeliveryEnvelope?.envelopeId !== normalized.deliveryRequest.envelopeId ||
    existing.evidence?.deliveryInputHash !== normalized.deliveryInputHash) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different student delivery envelope");
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
    throw deliveryError("RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_UNSAFE_TEXT", `${label} must be encoded safe text`);
  }
  return text;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireBoundedString(value, label, minLength, maxLength) {
  const text = requireString(value, label);
  if (text.length < minLength || text.length > maxLength) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_INVALID_INPUT", `${label} length must be ${minLength}-${maxLength}`);
  }
  return text;
}

function requireEnum(value, label, allowed) {
  const text = requireString(value, label);
  if (!allowed.includes(text)) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_INVALID_INPUT", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_INVALID_INPUT", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireNumberBetween(value, label, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_INVALID_INPUT", `${label} must be a number between ${min} and ${max}`);
  }
  return value;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_BOUNDARY_VIOLATION", `${label} must be ${expected}`);
  }
  return expected;
}

function uniqueStringArray(value, label, minItems, maxItems) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_INVALID_INPUT", `${label} must contain ${minItems}-${maxItems} items`);
  }
  const items = value.map((item) => requireString(item, label));
  if (new Set(items).size !== items.length) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_INVALID_INPUT", `${label} must be unique`);
  }
  return items;
}

function uniqueBoundedStringArray(value, label, minItems, maxItems, minLength, maxLength) {
  return uniqueStringArray(value, label, minItems, maxItems)
    .map((item) => requireBoundedString(item, `${label}[]`, minLength, maxLength));
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_INVALID_INPUT", `${label} must be an object`);
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

function deliveryError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
