import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RESEARCH_DEEP_RESEARCH_FINALIZATION_RUNTIME_ID = "research_deep_research_finalization_runtime";
export const RESEARCH_DEEP_RESEARCH_FINALIZATION_COMMAND_PORT = "DeepResearchFinalizationPort.recordDeepResearchFinalization";
export const RESEARCH_DEEP_RESEARCH_FINALIZATION_READY = "RESEARCH_DEEP_RESEARCH_FINALIZATION_READY";

const inputSchemaVersion = "2026-06-05.research.deep-research-finalization.v1";
const outputSchemaVersion = "2026-06-05.research.deep-research-finalization-recorded.v1";
const reviewSchemaVersion = "2026-06-05.research.deep-research-final-answer-review-recorded.v1";
const defaultCommandLogPath = "reports/research-command-log/deep-research-finalization.jsonl";

export function recordDeepResearchFinalization(input, options = {}) {
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

export function formatDeepResearchFinalization(result) {
  return [
    `Research deep_research finalization: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Job: ${result.job.jobId}`,
    `Artifact: ${result.artifact.artifactId}`,
    `Published: ${result.boundary.finalAnswerPublished}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const finalizationInvocationId = requireString(input.finalizationInvocationId, "input.finalizationInvocationId");
  const principal = assertPrincipal(input.principal);
  const reviewRecord = assertFinalAnswerReviewRecord(input.finalAnswerReviewRecord);
  const finalizationPolicy = assertFinalizationPolicy(input.finalizationPolicy);
  const artifact = assertArtifact(input.artifact);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 80);
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 220);
  const finalizationInputHash = hashInput({
    finalizationInvocationId,
    principalId: principal.principalId,
    reviewRecordId: reviewRecord.recordId,
    artifact,
    finalizationPolicy,
  });
  return {
    finalizationInvocationId,
    principal,
    reviewRecord,
    finalizationPolicy,
    artifact,
    evidenceRefs,
    idempotencyKey,
    finalizationInputHash,
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
  const isResearchFinalizer = role === "TEACHER" && entryPoint === "DESKTOP_RESEARCH";
  const isAdmin = role === "ADMIN" && scopes.includes("ADMIN_SYSTEM");
  if (!isHuman || (!isResearchFinalizer && !isAdmin)) {
    throw finalizationError("RESEARCH_DEEP_RESEARCH_FINALIZATION_FORBIDDEN_PRINCIPAL", "finalization requires a human research finalizer or admin");
  }
  if (!hasAny(scopes, ["RESEARCH_WRITE", "ADMIN_SYSTEM"])) {
    throw finalizationError("RESEARCH_DEEP_RESEARCH_FINALIZATION_MISSING_PERMISSION", "RESEARCH_WRITE or ADMIN_SYSTEM scope is required");
  }
  if (!hasAny(scopes, ["RESEARCH_READ", "ADMIN_SYSTEM"])) {
    throw finalizationError("RESEARCH_DEEP_RESEARCH_FINALIZATION_MISSING_RESEARCH_READ", "RESEARCH_READ or ADMIN_SYSTEM scope is required");
  }
  return { principalId, role, subjectType, entryPoint, sessionId, scopes };
}

function assertFinalAnswerReviewRecord(record) {
  assertPlainObject(record, "input.finalAnswerReviewRecord");
  requireConst(record.schemaVersion, reviewSchemaVersion, "input.finalAnswerReviewRecord.schemaVersion");
  requireConst(record.runtimeId, "research_deep_research_final_answer_review_runtime", "input.finalAnswerReviewRecord.runtimeId");
  requireConst(record.commandPort, "DeepResearchFinalAnswerReviewPort.recordDeepResearchFinalAnswerReview", "input.finalAnswerReviewRecord.commandPort");
  requireConst(record.status, "FINAL_ANSWER_REVIEW_APPROVED_FOR_FINALIZATION", "input.finalAnswerReviewRecord.status");
  const recordId = requireString(record.recordId, "input.finalAnswerReviewRecord.recordId");
  const job = assertJob(record.job);
  const synthesis = assertSynthesis(record.synthesis);
  const review = assertReview(record.review, synthesis);
  const evidenceRefs = uniqueStringArray(record.evidenceRefs, "input.finalAnswerReviewRecord.evidenceRefs", 1, 200);
  const boundary = assertReviewBoundary(record.boundary);
  return { ...record, recordId, job, synthesis, review, evidenceRefs, boundary };
}

function assertJob(job) {
  assertPlainObject(job, "input.finalAnswerReviewRecord.job");
  return {
    taskId: requireString(job.taskId, "input.finalAnswerReviewRecord.job.taskId"),
    contextRef: requireString(job.contextRef, "input.finalAnswerReviewRecord.job.contextRef"),
    jobId: requireString(job.jobId, "input.finalAnswerReviewRecord.job.jobId"),
    queueName: requireConst(job.queueName, "research_deep_research", "input.finalAnswerReviewRecord.job.queueName"),
  };
}

function assertSynthesis(synthesis) {
  assertPlainObject(synthesis, "input.finalAnswerReviewRecord.synthesis");
  return {
    recordId: requireString(synthesis.recordId, "input.finalAnswerReviewRecord.synthesis.recordId"),
    draftId: requireString(synthesis.draftId, "input.finalAnswerReviewRecord.synthesis.draftId"),
    claimCount: requireIntegerBetween(synthesis.claimCount, "input.finalAnswerReviewRecord.synthesis.claimCount", 1, 200),
    citationCount: requireIntegerBetween(synthesis.citationCount, "input.finalAnswerReviewRecord.synthesis.citationCount", 1, 500),
    sourceHashCount: requireIntegerBetween(synthesis.sourceHashCount, "input.finalAnswerReviewRecord.synthesis.sourceHashCount", 1, 500),
  };
}

function assertReview(review, synthesis) {
  assertPlainObject(review, "input.finalAnswerReviewRecord.review");
  requireConst(review.decision, "APPROVED_FOR_FINALIZATION", "input.finalAnswerReviewRecord.review.decision");
  requireConst(review.approvedForFinalization, true, "input.finalAnswerReviewRecord.review.approvedForFinalization");
  requireConst(review.revisionRequired, false, "input.finalAnswerReviewRecord.review.revisionRequired");
  const coverage = assertCoverage(review.coverage, synthesis);
  const risk = assertRisk(review.risk);
  return {
    reviewId: requireString(review.reviewId, "input.finalAnswerReviewRecord.review.reviewId"),
    reviewerPrincipalId: requireString(review.reviewerPrincipalId, "input.finalAnswerReviewRecord.review.reviewerPrincipalId"),
    decision: "APPROVED_FOR_FINALIZATION",
    approvedForFinalization: true,
    revisionRequired: false,
    coverage,
    risk,
    comments: review.comments === undefined ? "" : String(review.comments),
  };
}

function assertCoverage(coverage, synthesis) {
  assertPlainObject(coverage, "input.finalAnswerReviewRecord.review.coverage");
  const claimCountReviewed = requireIntegerBetween(coverage.claimCountReviewed, "input.finalAnswerReviewRecord.review.coverage.claimCountReviewed", 1, 200);
  const citedClaimCount = requireIntegerBetween(coverage.citedClaimCount, "input.finalAnswerReviewRecord.review.coverage.citedClaimCount", 1, 200);
  const unsupportedClaimCount = requireIntegerBetween(coverage.unsupportedClaimCount, "input.finalAnswerReviewRecord.review.coverage.unsupportedClaimCount", 0, 200);
  const coverageRatio = requireNumberBetween(coverage.coverageRatio, "input.finalAnswerReviewRecord.review.coverage.coverageRatio", 0, 1);
  if (claimCountReviewed !== synthesis.claimCount || citedClaimCount !== synthesis.claimCount || unsupportedClaimCount !== 0 || coverageRatio < 1) {
    throw finalizationError("RESEARCH_DEEP_RESEARCH_FINALIZATION_INCOMPLETE_REVIEW_COVERAGE", "finalization requires fully covered reviewed claims");
  }
  return { claimCountReviewed, citedClaimCount, unsupportedClaimCount, coverageRatio };
}

function assertRisk(risk) {
  assertPlainObject(risk, "input.finalAnswerReviewRecord.review.risk");
  const normalized = {
    hallucinationRisk: requireEnum(risk.hallucinationRisk, "input.finalAnswerReviewRecord.review.risk.hallucinationRisk", ["LOW", "MEDIUM", "HIGH"]),
    privateKnowledgeRisk: requireEnum(risk.privateKnowledgeRisk, "input.finalAnswerReviewRecord.review.risk.privateKnowledgeRisk", ["LOW", "MEDIUM", "HIGH"]),
    studentDataRisk: requireEnum(risk.studentDataRisk, "input.finalAnswerReviewRecord.review.risk.studentDataRisk", ["LOW", "MEDIUM", "HIGH"]),
  };
  if (Object.values(normalized).includes("HIGH")) {
    throw finalizationError("RESEARCH_DEEP_RESEARCH_FINALIZATION_HIGH_RISK_REVIEW", "finalization cannot consume a HIGH risk review");
  }
  return normalized;
}

function assertReviewBoundary(boundary) {
  assertPlainObject(boundary, "input.finalAnswerReviewRecord.boundary");
  requireConst(boundary.humanFinalAnswerReviewRecorded, true, "input.finalAnswerReviewRecord.boundary.humanFinalAnswerReviewRecorded");
  requireConst(boundary.approvedForFutureFinalization, true, "input.finalAnswerReviewRecord.boundary.approvedForFutureFinalization");
  requireConst(boundary.revisionRequired, false, "input.finalAnswerReviewRecord.boundary.revisionRequired");
  for (const field of [
    "finalAnswerGenerated",
    "finalAnswerPublished",
    "directPublicationAllowed",
    "externalModelCallStarted",
    "mainDatabaseWriteStarted",
    "studentArchiveWriteStarted",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(boundary[field], false, `input.finalAnswerReviewRecord.boundary.${field}`);
  }
  requireConst(boundary.requiresFutureFinalizationRuntime, true, "input.finalAnswerReviewRecord.boundary.requiresFutureFinalizationRuntime");
  return { ...boundary };
}

function assertFinalizationPolicy(policy) {
  assertPlainObject(policy, "input.finalizationPolicy");
  for (const field of [
    "approvedReviewRequired",
    "preserveEvidenceRefsRequired",
    "preserveCitationCountsRequired",
    "preserveSourceHashCountsRequired",
    "requiresFuturePublicationReview",
  ]) {
    requireConst(policy[field], true, `input.finalizationPolicy.${field}`);
  }
  for (const field of [
    "answerBodyAllowed",
    "publicationAllowed",
    "directPublicationAllowed",
    "directDatabaseAccessAllowed",
    "mainDatabaseWriteAllowed",
    "studentArchiveWriteAllowed",
    "remoteDeviceControlAllowed",
    "externalModelCallAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.finalizationPolicy.${field}`);
  }
  return { ...policy };
}

function assertArtifact(artifact) {
  assertPlainObject(artifact, "input.artifact");
  const allowedKeys = new Set(["artifactId", "artifactKind", "finalizationLabel", "deliveryState"]);
  const extras = Object.keys(artifact).filter((key) => !allowedKeys.has(key));
  if (extras.length > 0) {
    throw finalizationError("RESEARCH_DEEP_RESEARCH_FINALIZATION_ARTIFACT_BODY_FORBIDDEN", `artifact envelope cannot include final content fields: ${extras.join(",")}`);
  }
  return {
    artifactId: requireString(artifact.artifactId, "input.artifact.artifactId"),
    artifactKind: requireConst(artifact.artifactKind, "REVIEWED_DEEP_RESEARCH_FINALIZATION_RECORD", "input.artifact.artifactKind"),
    finalizationLabel: requireBoundedString(artifact.finalizationLabel, "input.artifact.finalizationLabel", 1, 160),
    deliveryState: requireConst(artifact.deliveryState, "FINALIZED_NOT_PUBLISHED", "input.artifact.deliveryState"),
  };
}

function buildCommandRecord(normalized, recordedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "RESEARCH_DEEP_RESEARCH_FINALIZATION",
    recordId: `research_deep_research_finalization_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    runtimeId: RESEARCH_DEEP_RESEARCH_FINALIZATION_RUNTIME_ID,
    commandPort: RESEARCH_DEEP_RESEARCH_FINALIZATION_COMMAND_PORT,
    status: "FINAL_ANSWER_FINALIZED_NOT_PUBLISHED",
    finalizationInvocationId: normalized.finalizationInvocationId,
    principal: normalized.principal,
    job: normalized.reviewRecord.job,
    artifact: {
      ...normalized.artifact,
      reviewRecordId: normalized.reviewRecord.recordId,
      reviewerPrincipalId: normalized.reviewRecord.review.reviewerPrincipalId,
      finalizerPrincipalId: normalized.principal.principalId,
      claimCount: normalized.reviewRecord.synthesis.claimCount,
      citationCount: normalized.reviewRecord.synthesis.citationCount,
      sourceHashCount: normalized.reviewRecord.synthesis.sourceHashCount,
    },
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.reviewRecord.evidenceRefs,
        `evidence:finalization-input-hash:${normalized.finalizationInputHash}`,
        `evidence:runtime:${RESEARCH_DEEP_RESEARCH_FINALIZATION_RUNTIME_ID}`,
        `evidence:command-port:${RESEARCH_DEEP_RESEARCH_FINALIZATION_COMMAND_PORT}`,
        `evidence:review-record:${normalized.reviewRecord.recordId}`,
        `evidence:finalizer:${normalized.principal.principalId}`,
      ]),
      idempotencyKey: normalized.idempotencyKey,
      finalizationInputHash: normalized.finalizationInputHash,
    },
    boundary: buildBoundary(),
  };
}

function buildBoundary() {
  return {
    approvedReviewVerified: true,
    humanFinalAnswerReviewRecorded: true,
    finalAnswerFinalized: true,
    finalAnswerGenerated: false,
    finalAnswerPublished: false,
    publicationCandidateCreated: false,
    directPublicationAllowed: false,
    externalModelCallStarted: false,
    mainDatabaseWriteStarted: false,
    studentArchiveWriteStarted: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
    requiresFuturePublicationReview: true,
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
    artifact: record.artifact,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 300,
      evidenceClass: "ASYNC_DEEP_RESEARCH_FINALIZATION_BOUNDARY",
    },
    nextAction: "Keep the finalized artifact unpublished until a future publication review/runtime approves delivery.",
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
    if (record?.recordType === "RESEARCH_DEEP_RESEARCH_FINALIZATION" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.finalizationInvocationId !== normalized.finalizationInvocationId ||
    existing.job?.jobId !== normalized.reviewRecord.job.jobId ||
    existing.artifact?.artifactId !== normalized.artifact.artifactId ||
    existing.evidence?.finalizationInputHash !== normalized.finalizationInputHash) {
    throw finalizationError("RESEARCH_DEEP_RESEARCH_FINALIZATION_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different finalization");
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw finalizationError("RESEARCH_DEEP_RESEARCH_FINALIZATION_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireBoundedString(value, label, minLength, maxLength) {
  const text = requireString(value, label);
  if (text.length < minLength || text.length > maxLength) {
    throw finalizationError("RESEARCH_DEEP_RESEARCH_FINALIZATION_INVALID_INPUT", `${label} length must be ${minLength}-${maxLength}`);
  }
  return text;
}

function requireEnum(value, label, allowed) {
  const text = requireString(value, label);
  if (!allowed.includes(text)) {
    throw finalizationError("RESEARCH_DEEP_RESEARCH_FINALIZATION_INVALID_INPUT", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw finalizationError("RESEARCH_DEEP_RESEARCH_FINALIZATION_INVALID_INPUT", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireNumberBetween(value, label, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw finalizationError("RESEARCH_DEEP_RESEARCH_FINALIZATION_INVALID_INPUT", `${label} must be a number between ${min} and ${max}`);
  }
  return value;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw finalizationError("RESEARCH_DEEP_RESEARCH_FINALIZATION_BOUNDARY_VIOLATION", `${label} must be ${expected}`);
  }
  return expected;
}

function uniqueStringArray(value, label, minItems, maxItems) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw finalizationError("RESEARCH_DEEP_RESEARCH_FINALIZATION_INVALID_INPUT", `${label} must contain ${minItems}-${maxItems} items`);
  }
  const items = value.map((item) => requireString(item, label));
  if (new Set(items).size !== items.length) {
    throw finalizationError("RESEARCH_DEEP_RESEARCH_FINALIZATION_INVALID_INPUT", `${label} must be unique`);
  }
  return items;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw finalizationError("RESEARCH_DEEP_RESEARCH_FINALIZATION_INVALID_INPUT", `${label} must be an object`);
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

function finalizationError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
