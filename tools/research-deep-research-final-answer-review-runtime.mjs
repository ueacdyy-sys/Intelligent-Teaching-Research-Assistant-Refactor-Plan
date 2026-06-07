import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW_RUNTIME_ID = "research_deep_research_final_answer_review_runtime";
export const RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW_COMMAND_PORT = "DeepResearchFinalAnswerReviewPort.recordDeepResearchFinalAnswerReview";
export const RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW_READY = "RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW_READY";

const inputSchemaVersion = "2026-06-05.research.deep-research-final-answer-review.v1";
const outputSchemaVersion = "2026-06-05.research.deep-research-final-answer-review-recorded.v1";
const reasoningSynthesisSchemaVersion = "2026-06-05.research.deep-research-reasoning-synthesis-recorded.v1";
const defaultCommandLogPath = "reports/research-command-log/deep-research-final-answer-review.jsonl";
const approvedDecision = "APPROVED_FOR_FINALIZATION";

export function recordDeepResearchFinalAnswerReview(input, options = {}) {
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

export function formatDeepResearchFinalAnswerReview(result) {
  return [
    `Research deep_research final answer review: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Job: ${result.job.jobId}`,
    `Decision: ${result.review.decision}`,
    `Final answer generated: ${result.boundary.finalAnswerGenerated}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const reviewInvocationId = requireString(input.reviewInvocationId, "input.reviewInvocationId");
  const synthesisRecord = assertReasoningSynthesisRecord(input.reasoningSynthesisRecord);
  const principal = assertPrincipal(input.principal);
  const reviewPolicy = assertReviewPolicy(input.reviewPolicy);
  const review = assertReview(input.review, principal, synthesisRecord, reviewPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 80);
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 220);
  const reviewInputHash = hashInput({
    reviewInvocationId,
    principalId: principal.principalId,
    jobId: synthesisRecord.job.jobId,
    draftId: synthesisRecord.draft.draftId,
    decision: review.decision,
    coverage: review.coverage,
    risk: review.risk,
    reviewPolicy,
  });
  return {
    reviewInvocationId,
    principal,
    synthesisRecord,
    reviewPolicy,
    review,
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
  const isResearchReviewer = role === "TEACHER" && entryPoint === "DESKTOP_RESEARCH";
  const isAdmin = role === "ADMIN" && scopes.includes("ADMIN_SYSTEM");
  if (!isHuman || (!isResearchReviewer && !isAdmin)) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_FINAL_REVIEW_FORBIDDEN_PRINCIPAL", "final answer review requires a human research reviewer or admin");
  }
  if (!hasAny(scopes, ["RESEARCH_WRITE", "ADMIN_SYSTEM"])) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_FINAL_REVIEW_MISSING_PERMISSION", "RESEARCH_WRITE or ADMIN_SYSTEM scope is required");
  }
  if (!hasAny(scopes, ["RESEARCH_READ", "ADMIN_SYSTEM"])) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_FINAL_REVIEW_MISSING_RESEARCH_READ", "RESEARCH_READ or ADMIN_SYSTEM scope is required");
  }
  return { principalId, role, subjectType, entryPoint, sessionId, scopes };
}

function assertReasoningSynthesisRecord(record) {
  assertPlainObject(record, "input.reasoningSynthesisRecord");
  requireConst(record.schemaVersion, reasoningSynthesisSchemaVersion, "input.reasoningSynthesisRecord.schemaVersion");
  requireConst(record.runtimeId, "research_deep_research_reasoning_synthesis_runtime", "input.reasoningSynthesisRecord.runtimeId");
  requireConst(record.status, "REASONING_SYNTHESIS_DRAFT_RECORDED", "input.reasoningSynthesisRecord.status");
  const recordId = requireString(record.recordId ?? "reasoning_synthesis_record", "input.reasoningSynthesisRecord.recordId");
  const job = assertJob(record.job);
  const draft = assertDraft(record.draft);
  const usage = assertUsage(record.usage, draft);
  const evidenceRefs = uniqueStringArray(record.evidenceRefs, "input.reasoningSynthesisRecord.evidenceRefs", 1, 200);
  assertReasoningBoundary(record.boundary);
  return { ...record, recordId, job, draft, usage, evidenceRefs };
}

function assertJob(job) {
  assertPlainObject(job, "input.reasoningSynthesisRecord.job");
  return {
    taskId: requireString(job.taskId, "input.reasoningSynthesisRecord.job.taskId"),
    contextRef: requireString(job.contextRef, "input.reasoningSynthesisRecord.job.contextRef"),
    jobId: requireString(job.jobId, "input.reasoningSynthesisRecord.job.jobId"),
    queueName: requireConst(job.queueName, "research_deep_research", "input.reasoningSynthesisRecord.job.queueName"),
  };
}

function assertDraft(draft) {
  assertPlainObject(draft, "input.reasoningSynthesisRecord.draft");
  const draftId = requireString(draft.draftId, "input.reasoningSynthesisRecord.draft.draftId");
  requireConst(draft.answerKind, "EVIDENCE_GROUNDED_DRAFT", "input.reasoningSynthesisRecord.draft.answerKind");
  if (!Array.isArray(draft.claims) || draft.claims.length < 1) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_FINAL_REVIEW_INVALID_DRAFT", "draft claims must be non-empty");
  }
  if (!Array.isArray(draft.limitations) || draft.limitations.length < 1) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_FINAL_REVIEW_INVALID_DRAFT", "draft limitations must be non-empty");
  }
  const claims = draft.claims.map((claim, index) => assertClaim(claim, index));
  return {
    draftId,
    answerKind: "EVIDENCE_GROUNDED_DRAFT",
    title: draft.title === undefined ? "" : String(draft.title),
    summary: draft.summary === undefined ? "" : String(draft.summary),
    claims,
    limitations: draft.limitations.map((item) => requireString(item, "input.reasoningSynthesisRecord.draft.limitations[]")),
  };
}

function assertClaim(claim, index) {
  assertPlainObject(claim, `input.reasoningSynthesisRecord.draft.claims[${index}]`);
  const citations = uniqueStringArray(claim.citations, `input.reasoningSynthesisRecord.draft.claims[${index}].citations`, 1, 8);
  const sourceHashes = uniqueStringArray(claim.sourceHashes, `input.reasoningSynthesisRecord.draft.claims[${index}].sourceHashes`, 1, 8);
  for (const sourceHash of sourceHashes) {
    if (!/^sha256:[a-f0-9]{64}$/u.test(sourceHash)) {
      throw reviewError("RESEARCH_DEEP_RESEARCH_FINAL_REVIEW_INVALID_SOURCE_HASH", "draft claim sourceHashes must be sha256 digests");
    }
  }
  return {
    claimId: requireString(claim.claimId, `input.reasoningSynthesisRecord.draft.claims[${index}].claimId`),
    text: requireString(claim.text, `input.reasoningSynthesisRecord.draft.claims[${index}].text`),
    citations,
    sourceHashes,
    supportChunkIds: uniqueStringArray(claim.supportChunkIds, `input.reasoningSynthesisRecord.draft.claims[${index}].supportChunkIds`, 1, 20),
    confidence: Number(claim.confidence ?? 0),
  };
}

function assertUsage(usage, draft) {
  assertPlainObject(usage, "input.reasoningSynthesisRecord.usage");
  const claimCount = requireIntegerBetween(usage.claimCount, "input.reasoningSynthesisRecord.usage.claimCount", 1, 200);
  const citationCount = requireIntegerBetween(usage.citationCount, "input.reasoningSynthesisRecord.usage.citationCount", 1, 500);
  const sourceHashCount = requireIntegerBetween(usage.sourceHashCount, "input.reasoningSynthesisRecord.usage.sourceHashCount", 1, 500);
  if (claimCount !== draft.claims.length) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_FINAL_REVIEW_USAGE_MISMATCH", "usage.claimCount must match draft claims");
  }
  return { ...usage, claimCount, citationCount, sourceHashCount };
}

function assertReasoningBoundary(boundary) {
  assertPlainObject(boundary, "input.reasoningSynthesisRecord.boundary");
  requireConst(boundary.reasoningDraftComposed, true, "input.reasoningSynthesisRecord.boundary.reasoningDraftComposed");
  requireConst(boundary.finalAnswerGenerated, false, "input.reasoningSynthesisRecord.boundary.finalAnswerGenerated");
  requireConst(boundary.directPublicationAllowed, false, "input.reasoningSynthesisRecord.boundary.directPublicationAllowed");
  requireConst(boundary.requiresFutureFinalAnswerReview, true, "input.reasoningSynthesisRecord.boundary.requiresFutureFinalAnswerReview");
}

function assertReviewPolicy(policy) {
  assertPlainObject(policy, "input.reviewPolicy");
  for (const field of [
    "humanReviewRequired",
    "evidenceCoverageReviewRequired",
    "safetyReviewRequired",
    "limitationReviewRequired",
    "citationIntegrityReviewRequired",
    "sourceHashIntegrityReviewRequired",
    "allowFutureFinalizationWhenApproved",
  ]) {
    requireConst(policy[field], true, `input.reviewPolicy.${field}`);
  }
  for (const field of [
    "publicationAllowed",
    "directDatabaseAccessAllowed",
    "writeAllowed",
    "studentArchiveWriteAllowed",
    "remoteDeviceControlAllowed",
    "externalModelCallAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.reviewPolicy.${field}`);
  }
  return {
    humanReviewRequired: true,
    evidenceCoverageReviewRequired: true,
    safetyReviewRequired: true,
    limitationReviewRequired: true,
    citationIntegrityReviewRequired: true,
    sourceHashIntegrityReviewRequired: true,
    allowFutureFinalizationWhenApproved: true,
    publicationAllowed: false,
    directDatabaseAccessAllowed: false,
    writeAllowed: false,
    studentArchiveWriteAllowed: false,
    remoteDeviceControlAllowed: false,
    externalModelCallAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
    minEvidenceCoverageRatio: requireNumberBetween(policy.minEvidenceCoverageRatio, "input.reviewPolicy.minEvidenceCoverageRatio", 0.5, 1),
  };
}

function assertReview(review, principal, synthesisRecord, policy) {
  assertPlainObject(review, "input.review");
  const reviewId = requireString(review.reviewId, "input.review.reviewId");
  const reviewerPrincipalId = requireString(review.reviewerPrincipalId, "input.review.reviewerPrincipalId");
  if (reviewerPrincipalId !== principal.principalId) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_FINAL_REVIEW_REVIEWER_MISMATCH", "review.reviewerPrincipalId must match principal.principalId");
  }
  const decision = requireEnum(review.decision, "input.review.decision", [approvedDecision, "REVISION_REQUIRED", "REJECTED"]);
  const coverage = assertCoverage(review.coverage, synthesisRecord, policy, decision);
  const risk = assertRisk(review.risk, decision);
  for (const field of [
    "evidenceCoverageReviewed",
    "safetyReviewed",
    "limitationsReviewed",
    "citationIntegrityReviewed",
    "sourceHashIntegrityReviewed",
  ]) {
    requireConst(review[field], true, `input.review.${field}`);
  }
  const comments = review.comments === undefined ? "" : String(review.comments).trim();
  if (decision !== approvedDecision && comments.length === 0) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_FINAL_REVIEW_MISSING_FEEDBACK", "revision or rejection requires comments");
  }
  return {
    reviewId,
    reviewerPrincipalId,
    decision,
    reviewedAt: requireString(review.reviewedAt, "input.review.reviewedAt"),
    evidenceCoverageReviewed: true,
    safetyReviewed: true,
    limitationsReviewed: true,
    citationIntegrityReviewed: true,
    sourceHashIntegrityReviewed: true,
    coverage,
    risk,
    comments,
  };
}

function assertCoverage(coverage, synthesisRecord, policy, decision) {
  assertPlainObject(coverage, "input.review.coverage");
  const claimCountReviewed = requireIntegerBetween(coverage.claimCountReviewed, "input.review.coverage.claimCountReviewed", 1, 200);
  const citedClaimCount = requireIntegerBetween(coverage.citedClaimCount, "input.review.coverage.citedClaimCount", 0, 200);
  const unsupportedClaimCount = requireIntegerBetween(coverage.unsupportedClaimCount, "input.review.coverage.unsupportedClaimCount", 0, 200);
  const coverageRatio = requireNumberBetween(coverage.coverageRatio, "input.review.coverage.coverageRatio", 0, 1);
  if (claimCountReviewed !== synthesisRecord.draft.claims.length) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_FINAL_REVIEW_COVERAGE_MISMATCH", "reviewed claim count must match synthesis draft claims");
  }
  if (citedClaimCount + unsupportedClaimCount !== claimCountReviewed) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_FINAL_REVIEW_COVERAGE_MISMATCH", "cited plus unsupported claims must equal reviewed claims");
  }
  if (decision === approvedDecision && (unsupportedClaimCount !== 0 || coverageRatio < policy.minEvidenceCoverageRatio)) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_FINAL_REVIEW_UNSUPPORTED_APPROVAL", "approved finalization requires full enough evidence coverage and no unsupported claims");
  }
  return { claimCountReviewed, citedClaimCount, unsupportedClaimCount, coverageRatio };
}

function assertRisk(risk, decision) {
  assertPlainObject(risk, "input.review.risk");
  const normalized = {
    hallucinationRisk: requireEnum(risk.hallucinationRisk, "input.review.risk.hallucinationRisk", ["LOW", "MEDIUM", "HIGH"]),
    privateKnowledgeRisk: requireEnum(risk.privateKnowledgeRisk, "input.review.risk.privateKnowledgeRisk", ["LOW", "MEDIUM", "HIGH"]),
    studentDataRisk: requireEnum(risk.studentDataRisk, "input.review.risk.studentDataRisk", ["LOW", "MEDIUM", "HIGH"]),
  };
  if (decision === approvedDecision && Object.values(normalized).includes("HIGH")) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_FINAL_REVIEW_HIGH_RISK_APPROVAL", "approved finalization cannot carry HIGH risk");
  }
  return normalized;
}

function buildCommandRecord(normalized, recordedAt) {
  const approved = normalized.review.decision === approvedDecision;
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW",
    recordId: `research_deep_research_final_answer_review_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    runtimeId: RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW_RUNTIME_ID,
    commandPort: RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW_COMMAND_PORT,
    status: approved ? "FINAL_ANSWER_REVIEW_APPROVED_FOR_FINALIZATION" : "FINAL_ANSWER_REVIEW_REVISION_REQUIRED",
    reviewInvocationId: normalized.reviewInvocationId,
    principal: normalized.principal,
    job: normalized.synthesisRecord.job,
    synthesis: {
      recordId: normalized.synthesisRecord.recordId,
      draftId: normalized.synthesisRecord.draft.draftId,
      claimCount: normalized.synthesisRecord.usage.claimCount,
      citationCount: normalized.synthesisRecord.usage.citationCount,
      sourceHashCount: normalized.synthesisRecord.usage.sourceHashCount,
    },
    review: normalized.review,
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.synthesisRecord.evidenceRefs,
        `evidence:final-answer-review-input-hash:${normalized.reviewInputHash}`,
        `evidence:runtime:${RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW_RUNTIME_ID}`,
        `evidence:command-port:${RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW_COMMAND_PORT}`,
        `evidence:reviewer:${normalized.review.reviewerPrincipalId}`,
      ]),
      idempotencyKey: normalized.idempotencyKey,
      reviewInputHash: normalized.reviewInputHash,
    },
    boundary: buildBoundary(approved),
  };
}

function buildBoundary(approved) {
  return {
    reasoningSynthesisVerified: true,
    humanFinalAnswerReviewRecorded: true,
    evidenceCoverageReviewed: true,
    citationIntegrityReviewed: true,
    sourceHashIntegrityReviewed: true,
    safetyReviewed: true,
    approvedForFutureFinalization: approved,
    revisionRequired: !approved,
    finalAnswerGenerated: false,
    finalAnswerPublished: false,
    directPublicationAllowed: false,
    externalModelCallStarted: false,
    mainDatabaseWriteStarted: false,
    studentArchiveWriteStarted: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
    requiresFutureFinalizationRuntime: true,
  };
}

function buildResult(record, options) {
  const approved = record.boundary.approvedForFutureFinalization === true;
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
    review: {
      reviewId: record.review.reviewId,
      reviewerPrincipalId: record.review.reviewerPrincipalId,
      decision: record.review.decision,
      approvedForFinalization: approved,
      revisionRequired: !approved,
      coverage: record.review.coverage,
      risk: record.review.risk,
      comments: record.review.comments,
    },
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 300,
      evidenceClass: "ASYNC_DEEP_RESEARCH_FINAL_ANSWER_REVIEW_BOUNDARY",
    },
    nextAction: approved
      ? "Send the reviewed draft to a future finalization runtime; do not publish directly from this review record."
      : "Return the draft to reasoning/retrieval revision before any finalization runtime can consume it.",
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
    if (record?.recordType === "RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.reviewInvocationId !== normalized.reviewInvocationId ||
    existing.job?.jobId !== normalized.synthesisRecord.job.jobId ||
    existing.evidence?.reviewInputHash !== normalized.reviewInputHash ||
    existing.review?.decision !== normalized.review.decision) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_FINAL_REVIEW_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different final-answer review");
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_FINAL_REVIEW_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireBoundedString(value, label, minLength, maxLength) {
  const text = requireString(value, label);
  if (text.length < minLength || text.length > maxLength) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_FINAL_REVIEW_INVALID_INPUT", `${label} length must be ${minLength}-${maxLength}`);
  }
  return text;
}

function requireEnum(value, label, allowed) {
  const text = requireString(value, label);
  if (!allowed.includes(text)) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_FINAL_REVIEW_INVALID_INPUT", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_FINAL_REVIEW_INVALID_INPUT", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireNumberBetween(value, label, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_FINAL_REVIEW_INVALID_INPUT", `${label} must be a number between ${min} and ${max}`);
  }
  return value;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_FINAL_REVIEW_BOUNDARY_VIOLATION", `${label} must be ${expected}`);
  }
  return expected;
}

function uniqueStringArray(value, label, minItems, maxItems) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_FINAL_REVIEW_INVALID_INPUT", `${label} must contain ${minItems}-${maxItems} items`);
  }
  const items = value.map((item) => requireString(item, label));
  if (new Set(items).size !== items.length) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_FINAL_REVIEW_INVALID_INPUT", `${label} must be unique`);
  }
  return items;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw reviewError("RESEARCH_DEEP_RESEARCH_FINAL_REVIEW_INVALID_INPUT", `${label} must be an object`);
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
