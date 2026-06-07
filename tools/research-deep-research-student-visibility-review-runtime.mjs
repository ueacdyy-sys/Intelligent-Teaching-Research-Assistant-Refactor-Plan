import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_RUNTIME_ID = "research_deep_research_student_visibility_review_runtime";
export const RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_COMMAND_PORT = "DeepResearchStudentVisibilityReviewPort.recordStudentVisibilityReview";
export const RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_READY = "RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_READY";

const inputSchemaVersion = "2026-06-05.research.deep-research-student-visibility-review.v1";
const outputSchemaVersion = "2026-06-05.research.deep-research-student-visibility-review-recorded.v1";
const teacherDeliverySchemaVersion = "2026-06-05.research.deep-research-teacher-delivery-recorded.v1";
const defaultCommandLogPath = "reports/research-command-log/deep-research-student-visibility-review.jsonl";

export function recordDeepResearchStudentVisibilityReview(input, options = {}) {
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

export function formatDeepResearchStudentVisibilityReview(result) {
  return [
    `Research deep_research student visibility review: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Job: ${result.job.jobId}`,
    `Review: ${result.studentVisibilityReview.reviewId}`,
    `Student visible: ${result.boundary.studentVisible}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const reviewInvocationId = requireString(input.reviewInvocationId, "input.reviewInvocationId");
  const principal = assertPrincipal(input.principal);
  const teacherDeliveryRecord = assertTeacherDeliveryRecord(input.teacherDeliveryRecord);
  const studentVisibilityPolicy = assertStudentVisibilityPolicy(input.studentVisibilityPolicy);
  const studentVisibilityReview = assertStudentVisibilityReview(input.studentVisibilityReview, principal, teacherDeliveryRecord);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 120);
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 240);
  const reviewInputHash = hashInput({
    reviewInvocationId,
    principalId: principal.principalId,
    teacherDeliveryRecordId: teacherDeliveryRecord.recordId,
    teacherDeliveryPackageId: teacherDeliveryRecord.teacherDeliveryPackage.packageId,
    studentVisibilityReview,
    studentVisibilityPolicy,
  });
  return {
    reviewInvocationId,
    principal,
    teacherDeliveryRecord,
    studentVisibilityPolicy,
    studentVisibilityReview,
    evidenceRefs,
    idempotencyKey,
    reviewInputHash,
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
  const isHuman = subjectType === "USER" && role !== "STUDENT" && role !== "SERVICE";
  const isTeacher = role === "TEACHER" && ["DESKTOP_RESEARCH", "DESKTOP_TEACHER"].includes(entryPoint);
  const isAdmin = role === "ADMIN" && scopes.includes("ADMIN_SYSTEM");
  if (!isHuman || (!isTeacher && !isAdmin)) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_FORBIDDEN_PRINCIPAL", "student visibility review requires a human teacher or admin");
  }
  if (!hasAny(scopes, ["RESEARCH_READ", "ADMIN_SYSTEM"])) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_MISSING_RESEARCH_READ", "RESEARCH_READ or ADMIN_SYSTEM scope is required");
  }
  if (!hasAny(scopes, ["STUDENT_VISIBILITY_REVIEW", "ADMIN_SYSTEM"])) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_MISSING_REVIEW_SCOPE", "STUDENT_VISIBILITY_REVIEW or ADMIN_SYSTEM scope is required");
  }
  return { principalId, role, subjectType, entryPoint, sessionId, scopes };
}

function assertTeacherDeliveryRecord(record) {
  assertPlainObject(record, "input.teacherDeliveryRecord");
  requireConst(record.schemaVersion, teacherDeliverySchemaVersion, "input.teacherDeliveryRecord.schemaVersion");
  requireConst(record.runtimeId, "research_deep_research_teacher_delivery_runtime", "input.teacherDeliveryRecord.runtimeId");
  requireConst(record.commandPort, "DeepResearchTeacherDeliveryPort.recordTeacherDeliveryPackage", "input.teacherDeliveryRecord.commandPort");
  requireConst(record.status, "TEACHER_DELIVERY_PACKAGE_READY_NOT_STUDENT_VISIBLE", "input.teacherDeliveryRecord.status");
  const recordId = requireString(record.recordId, "input.teacherDeliveryRecord.recordId");
  const job = assertJob(record.job, "input.teacherDeliveryRecord.job");
  const teacherDeliveryPackage = assertTeacherDeliveryPackage(record.teacherDeliveryPackage);
  const evidenceRefs = uniqueStringArray(record.evidenceRefs, "input.teacherDeliveryRecord.evidenceRefs", 1, 320);
  assertTeacherDeliveryBoundary(record.boundary);
  return { ...record, recordId, job, teacherDeliveryPackage, evidenceRefs };
}

function assertTeacherDeliveryPackage(pkg) {
  assertPlainObject(pkg, "input.teacherDeliveryRecord.teacherDeliveryPackage");
  requireConst(pkg.packageKind, "EVIDENCE_GROUNDED_TEACHER_DELIVERY_PACKAGE", "input.teacherDeliveryRecord.teacherDeliveryPackage.packageKind");
  requireConst(pkg.audience, "TEACHER_RESEARCH", "input.teacherDeliveryRecord.teacherDeliveryPackage.audience");
  requireConst(pkg.deliveryState, "TEACHER_READY_NOT_STUDENT_VISIBLE", "input.teacherDeliveryRecord.teacherDeliveryPackage.deliveryState");
  const claims = assertClaims(pkg.claims);
  const limitations = uniqueBoundedStringArray(pkg.limitations, "input.teacherDeliveryRecord.teacherDeliveryPackage.limitations", 1, 12, 1, 600);
  const risk = assertRisk(pkg.risk);
  const claimCount = requireIntegerBetween(pkg.claimCount, "input.teacherDeliveryRecord.teacherDeliveryPackage.claimCount", 1, 200);
  const citationCount = requireIntegerBetween(pkg.citationCount, "input.teacherDeliveryRecord.teacherDeliveryPackage.citationCount", 1, 500);
  const sourceHashCount = requireIntegerBetween(pkg.sourceHashCount, "input.teacherDeliveryRecord.teacherDeliveryPackage.sourceHashCount", 1, 500);
  const actualCitationCount = new Set(claims.flatMap((claim) => claim.citations)).size;
  const actualSourceHashCount = new Set(claims.flatMap((claim) => claim.sourceHashes)).size;
  if (claimCount !== claims.length || citationCount !== actualCitationCount || sourceHashCount !== actualSourceHashCount) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_INTEGRITY_MISMATCH", "teacher package integrity counts must match claims");
  }
  return {
    ...pkg,
    packageId: requireString(pkg.packageId, "input.teacherDeliveryRecord.teacherDeliveryPackage.packageId"),
    title: requireSafeText(pkg.title, "input.teacherDeliveryRecord.teacherDeliveryPackage.title"),
    summary: requireSafeText(pkg.summary, "input.teacherDeliveryRecord.teacherDeliveryPackage.summary"),
    teacherNotes: requireSafeText(pkg.teacherNotes, "input.teacherDeliveryRecord.teacherDeliveryPackage.teacherNotes"),
    previewId: requireString(pkg.previewId, "input.teacherDeliveryRecord.teacherDeliveryPackage.previewId"),
    artifactId: requireString(pkg.artifactId, "input.teacherDeliveryRecord.teacherDeliveryPackage.artifactId"),
    precheckId: requireString(pkg.precheckId, "input.teacherDeliveryRecord.teacherDeliveryPackage.precheckId"),
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
    throw reviewError("RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_INVALID_CLAIMS", "teacher package claims must contain 1-200 items");
  }
  return claims.map((claim, index) => {
    assertPlainObject(claim, `input.teacherDeliveryRecord.teacherDeliveryPackage.claims[${index}]`);
    const sourceHashes = uniqueBoundedStringArray(claim.sourceHashes, `input.teacherDeliveryRecord.teacherDeliveryPackage.claims[${index}].sourceHashes`, 1, 20, 71, 71);
    for (const sourceHash of sourceHashes) {
      if (!/^sha256:[a-f0-9]{64}$/u.test(sourceHash)) {
        throw reviewError("RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_INVALID_SOURCE_HASH", "claim sourceHashes must be sha256 digests");
      }
    }
    return {
      claimId: requireString(claim.claimId, `input.teacherDeliveryRecord.teacherDeliveryPackage.claims[${index}].claimId`),
      text: requireSafeText(claim.text, `input.teacherDeliveryRecord.teacherDeliveryPackage.claims[${index}].text`),
      citations: uniqueBoundedStringArray(claim.citations, `input.teacherDeliveryRecord.teacherDeliveryPackage.claims[${index}].citations`, 1, 20, 4, 400),
      sourceHashes,
      supportChunkIds: uniqueBoundedStringArray(claim.supportChunkIds, `input.teacherDeliveryRecord.teacherDeliveryPackage.claims[${index}].supportChunkIds`, 1, 40, 1, 160),
      confidence: requireNumberBetween(claim.confidence, `input.teacherDeliveryRecord.teacherDeliveryPackage.claims[${index}].confidence`, 0, 1),
      evidencePreserved: requireConst(claim.evidencePreserved, true, `input.teacherDeliveryRecord.teacherDeliveryPackage.claims[${index}].evidencePreserved`),
    };
  });
}

function assertRisk(risk) {
  assertPlainObject(risk, "input.teacherDeliveryRecord.teacherDeliveryPackage.risk");
  const normalized = {
    hallucinationRisk: requireEnum(risk.hallucinationRisk, "input.teacherDeliveryRecord.teacherDeliveryPackage.risk.hallucinationRisk", ["LOW", "MEDIUM", "HIGH"]),
    privateKnowledgeRisk: requireEnum(risk.privateKnowledgeRisk, "input.teacherDeliveryRecord.teacherDeliveryPackage.risk.privateKnowledgeRisk", ["LOW", "MEDIUM", "HIGH"]),
    studentDataRisk: requireEnum(risk.studentDataRisk, "input.teacherDeliveryRecord.teacherDeliveryPackage.risk.studentDataRisk", ["LOW", "MEDIUM", "HIGH"]),
    publicationRisk: requireEnum(risk.publicationRisk, "input.teacherDeliveryRecord.teacherDeliveryPackage.risk.publicationRisk", ["LOW", "MEDIUM", "HIGH"]),
  };
  if (Object.values(normalized).includes("HIGH")) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_HIGH_RISK_PACKAGE", "student visibility review cannot approve a HIGH risk teacher package");
  }
  return normalized;
}

function assertTeacherDeliveryBoundary(boundary) {
  assertPlainObject(boundary, "input.teacherDeliveryRecord.boundary");
  for (const field of [
    "renderPreviewVerified",
    "publicationPrecheckVerified",
    "teacherDeliveryPackageRecorded",
    "teacherAccessible",
    "evidenceIntegrityPreserved",
    "sourceHashIntegrityPreserved",
    "limitationsPreserved",
    "requiresFutureStudentDeliveryReview",
  ]) {
    requireConst(boundary[field], true, `input.teacherDeliveryRecord.boundary.${field}`);
  }
  for (const field of deniedBoundaryFields()) {
    requireConst(boundary[field], false, `input.teacherDeliveryRecord.boundary.${field}`);
  }
}

function assertStudentVisibilityPolicy(policy) {
  assertPlainObject(policy, "input.studentVisibilityPolicy");
  for (const field of [
    "teacherDeliveryRequired",
    "humanStudentVisibilityReviewRequired",
    "preserveEvidenceRequired",
    "preserveSourceHashesRequired",
    "preserveLimitationsRequired",
    "studentAudienceScopeRequired",
    "futureStudentDeliveryRuntimeRequired",
    "futurePersistenceReviewRequired",
  ]) {
    requireConst(policy[field], true, `input.studentVisibilityPolicy.${field}`);
  }
  for (const field of [
    "studentVisibleDeliveryAllowed",
    "directPublicationAllowed",
    "directDatabaseAccessAllowed",
    "mainDatabaseWriteAllowed",
    "studentArchiveWriteAllowed",
    "externalModelCallAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.studentVisibilityPolicy.${field}`);
  }
  return { ...policy };
}

function assertStudentVisibilityReview(review, principal, teacherDeliveryRecord) {
  assertPlainObject(review, "input.studentVisibilityReview");
  requireConst(review.decision, "APPROVED_FOR_STUDENT_VISIBILITY_DELIVERY_RUNTIME", "input.studentVisibilityReview.decision");
  requireConst(review.approvedForFutureStudentDelivery, true, "input.studentVisibilityReview.approvedForFutureStudentDelivery");
  requireConst(review.revisionRequired, false, "input.studentVisibilityReview.revisionRequired");
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
    requireConst(review[field], true, `input.studentVisibilityReview.${field}`);
  }
  requireConst(review.teacherDeliveryRecordId, teacherDeliveryRecord.recordId, "input.studentVisibilityReview.teacherDeliveryRecordId");
  requireConst(review.teacherDeliveryPackageId, teacherDeliveryRecord.teacherDeliveryPackage.packageId, "input.studentVisibilityReview.teacherDeliveryPackageId");
  const reviewerPrincipalId = requireString(review.reviewerPrincipalId, "input.studentVisibilityReview.reviewerPrincipalId");
  if (principal.role !== "ADMIN" && reviewerPrincipalId !== principal.principalId) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_REVIEWER_MISMATCH", "teacher reviewers must record their own review");
  }
  return {
    reviewId: requireString(review.reviewId, "input.studentVisibilityReview.reviewId"),
    reviewerPrincipalId,
    decision: "APPROVED_FOR_STUDENT_VISIBILITY_DELIVERY_RUNTIME",
    approvedForFutureStudentDelivery: true,
    revisionRequired: false,
    teacherDeliveryRecordId: teacherDeliveryRecord.recordId,
    teacherDeliveryPackageId: teacherDeliveryRecord.teacherDeliveryPackage.packageId,
    targetAudience: assertTargetAudience(review.targetAudience),
    teacherDeliveryReviewed: true,
    evidenceIntegrityReviewed: true,
    sourceHashIntegrityReviewed: true,
    limitationsReviewed: true,
    studentDataDisclosureReviewed: true,
    privateKnowledgeDisclosureReviewed: true,
    ageAppropriateReviewed: true,
    teacherAccountabilityAccepted: true,
    comments: requireSafeText(review.comments, "input.studentVisibilityReview.comments"),
  };
}

function assertTargetAudience(audience) {
  assertPlainObject(audience, "input.studentVisibilityReview.targetAudience");
  return {
    audienceKind: requireConst(audience.audienceKind, "STUDENT_APP_LEARNING_SUPPORT", "input.studentVisibilityReview.targetAudience.audienceKind"),
    scopeRef: requireBoundedString(audience.scopeRef, "input.studentVisibilityReview.targetAudience.scopeRef", 3, 200),
    channel: requireConst(audience.channel, "STUDENT_APP", "input.studentVisibilityReview.targetAudience.channel"),
    visibilityState: requireConst(audience.visibilityState, "APPROVED_FOR_FUTURE_STUDENT_DELIVERY_NOT_VISIBLE", "input.studentVisibilityReview.targetAudience.visibilityState"),
  };
}

function buildCommandRecord(normalized, recordedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW",
    recordId: `research_deep_research_student_visibility_review_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    runtimeId: RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_RUNTIME_ID,
    commandPort: RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_COMMAND_PORT,
    status: "STUDENT_VISIBILITY_REVIEW_APPROVED_NOT_DELIVERED",
    reviewInvocationId: normalized.reviewInvocationId,
    principal: normalized.principal,
    job: normalized.teacherDeliveryRecord.job,
    teacherDeliveryPackage: buildTeacherDeliveryPackageProjection(normalized.teacherDeliveryRecord.teacherDeliveryPackage),
    studentVisibilityReview: normalized.studentVisibilityReview,
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.teacherDeliveryRecord.evidenceRefs,
        `evidence:student-visibility-review-input-hash:${normalized.reviewInputHash}`,
        `evidence:runtime:${RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_RUNTIME_ID}`,
        `evidence:command-port:${RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_COMMAND_PORT}`,
        `evidence:teacher-delivery-record:${normalized.teacherDeliveryRecord.recordId}`,
      ]),
      idempotencyKey: normalized.idempotencyKey,
      reviewInputHash: normalized.reviewInputHash,
    },
    boundary: buildBoundary(),
  };
}

function buildTeacherDeliveryPackageProjection(pkg) {
  return {
    packageId: pkg.packageId,
    packageKind: pkg.packageKind,
    previewId: pkg.previewId,
    artifactId: pkg.artifactId,
    title: pkg.title,
    summary: pkg.summary,
    claimCount: pkg.claimCount,
    citationCount: pkg.citationCount,
    sourceHashCount: pkg.sourceHashCount,
    claims: pkg.claims,
    limitations: pkg.limitations,
    risk: pkg.risk,
  };
}

function buildBoundary() {
  return {
    teacherDeliveryVerified: true,
    humanStudentVisibilityReviewRecorded: true,
    studentVisibilityApprovedForFutureDelivery: true,
    evidenceIntegrityPreserved: true,
    sourceHashIntegrityPreserved: true,
    limitationsPreserved: true,
    studentAudienceScopeReviewed: true,
    finalAnswerPublished: false,
    publicationCandidateCreated: false,
    studentVisible: false,
    studentDeliveryStarted: false,
    directPublicationAllowed: false,
    externalModelCallStarted: false,
    mainDatabaseWriteStarted: false,
    studentArchiveWriteStarted: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
    requiresFutureStudentDeliveryRuntime: true,
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
    teacherDeliveryPackage: record.teacherDeliveryPackage,
    studentVisibilityReview: record.studentVisibilityReview,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 300,
      evidenceClass: "ASYNC_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_BOUNDARY",
    },
    nextAction: "Use this review only as input to a future student delivery runtime; do not expose to students or write durable student archives in this slice.",
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
    if (record?.recordType === "RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.reviewInvocationId !== normalized.reviewInvocationId ||
    existing.job?.jobId !== normalized.teacherDeliveryRecord.job.jobId ||
    existing.studentVisibilityReview?.reviewId !== normalized.studentVisibilityReview.reviewId ||
    existing.evidence?.reviewInputHash !== normalized.reviewInputHash) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different student visibility review");
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

function deniedBoundaryFields() {
  return [
    "publicationCandidateCreated",
    "finalAnswerPublished",
    "studentVisible",
    "directPublicationAllowed",
    "externalModelCallStarted",
    "mainDatabaseWriteStarted",
    "studentArchiveWriteStarted",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ];
}

function requireSafeText(value, label) {
  const text = requireBoundedString(value, label, 1, 1200);
  if (/[<>]/u.test(text)) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_UNSAFE_TEXT", `${label} must be encoded safe text`);
  }
  return text;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireBoundedString(value, label, minLength, maxLength) {
  const text = requireString(value, label);
  if (text.length < minLength || text.length > maxLength) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_INVALID_INPUT", `${label} length must be ${minLength}-${maxLength}`);
  }
  return text;
}

function requireEnum(value, label, allowed) {
  const text = requireString(value, label);
  if (!allowed.includes(text)) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_INVALID_INPUT", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_INVALID_INPUT", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireNumberBetween(value, label, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_INVALID_INPUT", `${label} must be a number between ${min} and ${max}`);
  }
  return value;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_BOUNDARY_VIOLATION", `${label} must be ${expected}`);
  }
  return expected;
}

function uniqueStringArray(value, label, minItems, maxItems) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_INVALID_INPUT", `${label} must contain ${minItems}-${maxItems} items`);
  }
  const items = value.map((item) => requireString(item, label));
  if (new Set(items).size !== items.length) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_INVALID_INPUT", `${label} must be unique`);
  }
  return items;
}

function uniqueBoundedStringArray(value, label, minItems, maxItems, minLength, maxLength) {
  return uniqueStringArray(value, label, minItems, maxItems)
    .map((item) => requireBoundedString(item, `${label}[]`, minLength, maxLength));
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_INVALID_INPUT", `${label} must be an object`);
  }
}

function hasAny(values, candidates) {
  return candidates.some((candidate) => values.includes(candidate));
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

function reviewError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
