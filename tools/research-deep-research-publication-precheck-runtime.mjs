import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_RUNTIME_ID = "research_deep_research_publication_precheck_runtime";
export const RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_COMMAND_PORT = "DeepResearchPublicationPrecheckPort.recordDeepResearchPublicationPrecheck";
export const RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_READY = "RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_READY";

const inputSchemaVersion = "2026-06-05.research.deep-research-publication-precheck.v1";
const outputSchemaVersion = "2026-06-05.research.deep-research-publication-precheck-recorded.v1";
const renderPreviewSchemaVersion = "2026-06-05.research.deep-research-render-preview-recorded.v1";
const defaultCommandLogPath = "reports/research-command-log/deep-research-publication-precheck.jsonl";
const approvedDecision = "APPROVED_FOR_DELIVERY_RUNTIME";

export function recordDeepResearchPublicationPrecheck(input, options = {}) {
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

export function formatDeepResearchPublicationPrecheck(result) {
  return [
    `Research deep_research publication precheck: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Job: ${result.job.jobId}`,
    `Decision: ${result.precheck.decision}`,
    `Student visible: ${result.boundary.studentVisible}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const precheckInvocationId = requireString(input.precheckInvocationId, "input.precheckInvocationId");
  const principal = assertPrincipal(input.principal);
  const renderPreviewRecord = assertRenderPreviewRecord(input.renderPreviewRecord);
  const publicationPrecheckPolicy = assertPublicationPrecheckPolicy(input.publicationPrecheckPolicy);
  const precheck = assertPrecheck(input.precheck, principal, publicationPrecheckPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 80);
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 220);
  const precheckInputHash = hashInput({
    precheckInvocationId,
    principalId: principal.principalId,
    renderPreviewRecordId: renderPreviewRecord.recordId,
    previewId: renderPreviewRecord.preview.previewId,
    decision: precheck.decision,
    publicationPrecheckPolicy,
  });
  return {
    precheckInvocationId,
    principal,
    renderPreviewRecord,
    publicationPrecheckPolicy,
    precheck,
    evidenceRefs,
    idempotencyKey,
    precheckInputHash,
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
  const isTeacherResearch = role === "TEACHER" && entryPoint === "DESKTOP_RESEARCH";
  const isAdmin = role === "ADMIN" && scopes.includes("ADMIN_SYSTEM");
  if (!isHuman || (!isTeacherResearch && !isAdmin)) {
    throw precheckError("RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_FORBIDDEN_PRINCIPAL", "publication precheck requires a human research teacher or admin");
  }
  if (!hasAny(scopes, ["RESEARCH_READ", "ADMIN_SYSTEM"])) {
    throw precheckError("RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_MISSING_RESEARCH_READ", "RESEARCH_READ or ADMIN_SYSTEM scope is required");
  }
  if (!hasAny(scopes, ["RESEARCH_WRITE", "ADMIN_SYSTEM"])) {
    throw precheckError("RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_MISSING_RESEARCH_WRITE", "RESEARCH_WRITE or ADMIN_SYSTEM scope is required");
  }
  return { principalId, role, subjectType, entryPoint, sessionId, scopes };
}

function assertRenderPreviewRecord(record) {
  assertPlainObject(record, "input.renderPreviewRecord");
  requireConst(record.schemaVersion, renderPreviewSchemaVersion, "input.renderPreviewRecord.schemaVersion");
  requireConst(record.runtimeId, "research_deep_research_render_preview_runtime", "input.renderPreviewRecord.runtimeId");
  requireConst(record.commandPort, "DeepResearchRenderPreviewPort.recordDeepResearchRenderPreview", "input.renderPreviewRecord.commandPort");
  requireConst(record.status, "RENDER_PREVIEW_READY_NOT_PUBLISHED", "input.renderPreviewRecord.status");
  const recordId = requireString(record.recordId, "input.renderPreviewRecord.recordId");
  const job = assertJob(record.job);
  const preview = assertPreview(record.preview);
  const evidenceRefs = uniqueStringArray(record.evidenceRefs, "input.renderPreviewRecord.evidenceRefs", 1, 260);
  assertRenderPreviewBoundary(record.boundary);
  return { ...record, recordId, job, preview, evidenceRefs };
}

function assertJob(job) {
  assertPlainObject(job, "input.renderPreviewRecord.job");
  return {
    taskId: requireString(job.taskId, "input.renderPreviewRecord.job.taskId"),
    contextRef: requireString(job.contextRef, "input.renderPreviewRecord.job.contextRef"),
    jobId: requireString(job.jobId, "input.renderPreviewRecord.job.jobId"),
    queueName: requireConst(job.queueName, "research_deep_research", "input.renderPreviewRecord.job.queueName"),
  };
}

function assertPreview(preview) {
  assertPlainObject(preview, "input.renderPreviewRecord.preview");
  requireConst(preview.previewKind, "EVIDENCE_GROUNDED_RESEARCH_PREVIEW", "input.renderPreviewRecord.preview.previewKind");
  requireConst(preview.audience, "TEACHER_REVIEW", "input.renderPreviewRecord.preview.audience");
  requireConst(preview.format, "SAFE_TEXT_BLOCKS", "input.renderPreviewRecord.preview.format");
  requireConst(preview.deliveryState, "PREVIEW_READY_NOT_PUBLISHED", "input.renderPreviewRecord.preview.deliveryState");
  const claims = assertPreviewClaims(preview.claims);
  const limitations = uniqueBoundedStringArray(preview.limitations, "input.renderPreviewRecord.preview.limitations", 1, 12, 1, 600);
  const review = assertReviewRef(preview.review);
  const finalization = assertFinalizationRef(preview.finalization);
  const integrity = assertIntegrity(preview.integrity, claims);
  return {
    previewId: requireString(preview.previewId, "input.renderPreviewRecord.preview.previewId"),
    previewKind: "EVIDENCE_GROUNDED_RESEARCH_PREVIEW",
    audience: "TEACHER_REVIEW",
    format: "SAFE_TEXT_BLOCKS",
    deliveryState: "PREVIEW_READY_NOT_PUBLISHED",
    title: requireSafeText(preview.title, "input.renderPreviewRecord.preview.title"),
    summary: requireSafeText(preview.summary, "input.renderPreviewRecord.preview.summary"),
    claims,
    limitations,
    review,
    finalization,
    integrity,
  };
}

function assertPreviewClaims(claims) {
  if (!Array.isArray(claims) || claims.length < 1 || claims.length > 200) {
    throw precheckError("RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_INVALID_PREVIEW", "preview claims must contain 1-200 items");
  }
  return claims.map((claim, index) => {
    assertPlainObject(claim, `input.renderPreviewRecord.preview.claims[${index}]`);
    const sourceHashes = uniqueBoundedStringArray(claim.sourceHashes, `input.renderPreviewRecord.preview.claims[${index}].sourceHashes`, 1, 20, 71, 71);
    for (const sourceHash of sourceHashes) {
      if (!/^sha256:[a-f0-9]{64}$/u.test(sourceHash)) {
        throw precheckError("RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_INVALID_SOURCE_HASH", "preview sourceHashes must be sha256 digests");
      }
    }
    return {
      claimId: requireString(claim.claimId, `input.renderPreviewRecord.preview.claims[${index}].claimId`),
      text: requireSafeText(claim.text, `input.renderPreviewRecord.preview.claims[${index}].text`),
      citations: uniqueBoundedStringArray(claim.citations, `input.renderPreviewRecord.preview.claims[${index}].citations`, 1, 20, 4, 400),
      sourceHashes,
      supportChunkIds: uniqueBoundedStringArray(claim.supportChunkIds, `input.renderPreviewRecord.preview.claims[${index}].supportChunkIds`, 1, 40, 1, 160),
      confidence: requireNumberBetween(claim.confidence, `input.renderPreviewRecord.preview.claims[${index}].confidence`, 0, 1),
      evidencePreserved: requireConst(claim.evidencePreserved, true, `input.renderPreviewRecord.preview.claims[${index}].evidencePreserved`),
    };
  });
}

function assertReviewRef(review) {
  assertPlainObject(review, "input.renderPreviewRecord.preview.review");
  return {
    reviewRecordId: requireString(review.reviewRecordId, "input.renderPreviewRecord.preview.review.reviewRecordId"),
    reviewerPrincipalId: requireString(review.reviewerPrincipalId, "input.renderPreviewRecord.preview.review.reviewerPrincipalId"),
  };
}

function assertFinalizationRef(finalization) {
  assertPlainObject(finalization, "input.renderPreviewRecord.preview.finalization");
  return {
    artifactId: requireString(finalization.artifactId, "input.renderPreviewRecord.preview.finalization.artifactId"),
    finalizerPrincipalId: requireString(finalization.finalizerPrincipalId, "input.renderPreviewRecord.preview.finalization.finalizerPrincipalId"),
    deliveryState: requireConst(finalization.deliveryState, "FINALIZED_NOT_PUBLISHED", "input.renderPreviewRecord.preview.finalization.deliveryState"),
  };
}

function assertIntegrity(integrity, claims) {
  assertPlainObject(integrity, "input.renderPreviewRecord.preview.integrity");
  const claimCount = requireIntegerBetween(integrity.claimCount, "input.renderPreviewRecord.preview.integrity.claimCount", 1, 200);
  const citationCount = requireIntegerBetween(integrity.citationCount, "input.renderPreviewRecord.preview.integrity.citationCount", 1, 500);
  const sourceHashCount = requireIntegerBetween(integrity.sourceHashCount, "input.renderPreviewRecord.preview.integrity.sourceHashCount", 1, 500);
  const actualCitationCount = new Set(claims.flatMap((claim) => claim.citations)).size;
  const actualSourceHashCount = new Set(claims.flatMap((claim) => claim.sourceHashes)).size;
  if (claimCount !== claims.length || citationCount !== actualCitationCount || sourceHashCount !== actualSourceHashCount) {
    throw precheckError("RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_INTEGRITY_MISMATCH", "preview integrity counts must match claims");
  }
  requireConst(integrity.unsafeTextEncoded, true, "input.renderPreviewRecord.preview.integrity.unsafeTextEncoded");
  return { claimCount, citationCount, sourceHashCount, unsafeTextEncoded: true };
}

function assertRenderPreviewBoundary(boundary) {
  assertPlainObject(boundary, "input.renderPreviewRecord.boundary");
  requireConst(boundary.finalizedArtifactVerified, true, "input.renderPreviewRecord.boundary.finalizedArtifactVerified");
  requireConst(boundary.reasoningSynthesisVerified, true, "input.renderPreviewRecord.boundary.reasoningSynthesisVerified");
  requireConst(boundary.renderPreviewRecorded, true, "input.renderPreviewRecord.boundary.renderPreviewRecorded");
  requireConst(boundary.requiresFuturePublicationReview, true, "input.renderPreviewRecord.boundary.requiresFuturePublicationReview");
  for (const field of [
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
  ]) {
    requireConst(boundary[field], false, `input.renderPreviewRecord.boundary.${field}`);
  }
}

function assertPublicationPrecheckPolicy(policy) {
  assertPlainObject(policy, "input.publicationPrecheckPolicy");
  for (const field of [
    "renderPreviewRequired",
    "humanPublicationReviewRequired",
    "evidenceIntegrityRequired",
    "safetyReviewRequired",
    "studentVisibilityReviewRequired",
    "deliveryRuntimeRequired",
  ]) {
    requireConst(policy[field], true, `input.publicationPrecheckPolicy.${field}`);
  }
  for (const field of [
    "directPublicationAllowed",
    "studentVisibleDeliveryAllowed",
    "directDatabaseAccessAllowed",
    "mainDatabaseWriteAllowed",
    "studentArchiveWriteAllowed",
    "externalModelCallAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.publicationPrecheckPolicy.${field}`);
  }
  return { ...policy };
}

function assertPrecheck(precheck, principal, policy) {
  assertPlainObject(precheck, "input.precheck");
  const reviewerPrincipalId = requireString(precheck.reviewerPrincipalId, "input.precheck.reviewerPrincipalId");
  if (reviewerPrincipalId !== principal.principalId) {
    throw precheckError("RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_REVIEWER_MISMATCH", "precheck.reviewerPrincipalId must match principal.principalId");
  }
  const decision = requireEnum(precheck.decision, "input.precheck.decision", [approvedDecision, "REVISION_REQUIRED", "REJECTED"]);
  for (const field of [
    "evidenceIntegrityReviewed",
    "safetyReviewed",
    "studentVisibilityReviewed",
    "limitationsReviewed",
  ]) {
    requireConst(precheck[field], true, `input.precheck.${field}`);
  }
  const risk = assertRisk(precheck.risk, decision);
  const comments = requireBoundedString(precheck.comments, "input.precheck.comments", decision === approvedDecision ? 1 : 8, 1200);
  if (decision === approvedDecision && policy.deliveryRuntimeRequired !== true) {
    throw precheckError("RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_POLICY_MISMATCH", "approved precheck requires a future delivery runtime");
  }
  return {
    precheckId: requireString(precheck.precheckId, "input.precheck.precheckId"),
    reviewerPrincipalId,
    decision,
    reviewedAt: requireString(precheck.reviewedAt, "input.precheck.reviewedAt"),
    evidenceIntegrityReviewed: true,
    safetyReviewed: true,
    studentVisibilityReviewed: true,
    limitationsReviewed: true,
    risk,
    comments,
  };
}

function assertRisk(risk, decision) {
  assertPlainObject(risk, "input.precheck.risk");
  const normalized = {
    hallucinationRisk: requireEnum(risk.hallucinationRisk, "input.precheck.risk.hallucinationRisk", ["LOW", "MEDIUM", "HIGH"]),
    privateKnowledgeRisk: requireEnum(risk.privateKnowledgeRisk, "input.precheck.risk.privateKnowledgeRisk", ["LOW", "MEDIUM", "HIGH"]),
    studentDataRisk: requireEnum(risk.studentDataRisk, "input.precheck.risk.studentDataRisk", ["LOW", "MEDIUM", "HIGH"]),
    publicationRisk: requireEnum(risk.publicationRisk, "input.precheck.risk.publicationRisk", ["LOW", "MEDIUM", "HIGH"]),
  };
  if (decision === approvedDecision && Object.values(normalized).includes("HIGH")) {
    throw precheckError("RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_HIGH_RISK_APPROVAL", "approved delivery runtime cannot carry HIGH risk");
  }
  return normalized;
}

function buildCommandRecord(normalized, recordedAt) {
  const approved = normalized.precheck.decision === approvedDecision;
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK",
    recordId: `research_deep_research_publication_precheck_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    runtimeId: RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_RUNTIME_ID,
    commandPort: RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_COMMAND_PORT,
    status: approved ? "PUBLICATION_PRECHECK_APPROVED_NOT_DELIVERED" : "PUBLICATION_PRECHECK_REVISION_REQUIRED",
    precheckInvocationId: normalized.precheckInvocationId,
    principal: normalized.principal,
    job: normalized.renderPreviewRecord.job,
    precheck: buildPrecheckSummary(normalized, approved),
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.renderPreviewRecord.evidenceRefs,
        `evidence:publication-precheck-input-hash:${normalized.precheckInputHash}`,
        `evidence:runtime:${RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_RUNTIME_ID}`,
        `evidence:command-port:${RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_COMMAND_PORT}`,
        `evidence:render-preview-record:${normalized.renderPreviewRecord.recordId}`,
        `evidence:publication-reviewer:${normalized.precheck.reviewerPrincipalId}`,
      ]),
      idempotencyKey: normalized.idempotencyKey,
      precheckInputHash: normalized.precheckInputHash,
    },
    boundary: buildBoundary(approved),
  };
}

function buildPrecheckSummary(normalized, approved) {
  const preview = normalized.renderPreviewRecord.preview;
  return {
    precheckId: normalized.precheck.precheckId,
    reviewerPrincipalId: normalized.precheck.reviewerPrincipalId,
    decision: normalized.precheck.decision,
    approvedForFutureDelivery: approved,
    revisionRequired: !approved,
    previewId: preview.previewId,
    artifactId: preview.finalization.artifactId,
    claimCount: preview.integrity.claimCount,
    citationCount: preview.integrity.citationCount,
    sourceHashCount: preview.integrity.sourceHashCount,
    risk: normalized.precheck.risk,
    comments: normalized.precheck.comments,
  };
}

function buildBoundary(approved) {
  return {
    renderPreviewVerified: true,
    humanPublicationPrecheckRecorded: true,
    evidenceIntegrityReviewed: true,
    safetyReviewed: true,
    studentVisibilityReviewed: true,
    approvedForFutureDelivery: approved,
    revisionRequired: !approved,
    publicationCandidateCreated: false,
    finalAnswerPublished: false,
    studentVisible: false,
    directPublicationAllowed: false,
    externalModelCallStarted: false,
    mainDatabaseWriteStarted: false,
    studentArchiveWriteStarted: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
    requiresFutureDeliveryRuntime: true,
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
    precheck: record.precheck,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 300,
      evidenceClass: "ASYNC_DEEP_RESEARCH_PUBLICATION_PRECHECK_BOUNDARY",
    },
    nextAction: record.boundary.approvedForFutureDelivery
      ? "Use this approval only as input to a future delivery runtime; do not publish or expose to students directly."
      : "Return the preview to revision before any delivery runtime can consume it.",
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
    if (record?.recordType === "RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.precheckInvocationId !== normalized.precheckInvocationId ||
    existing.job?.jobId !== normalized.renderPreviewRecord.job.jobId ||
    existing.precheck?.precheckId !== normalized.precheck.precheckId ||
    existing.evidence?.precheckInputHash !== normalized.precheckInputHash) {
    throw precheckError("RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different publication precheck");
  }
}

function requireSafeText(value, label) {
  const text = requireBoundedString(value, label, 1, 1200);
  if (/[<>]/u.test(text)) {
    throw precheckError("RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_UNSAFE_PREVIEW_TEXT", `${label} must be encoded safe text`);
  }
  return text;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw precheckError("RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireBoundedString(value, label, minLength, maxLength) {
  const text = requireString(value, label);
  if (text.length < minLength || text.length > maxLength) {
    throw precheckError("RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_INVALID_INPUT", `${label} length must be ${minLength}-${maxLength}`);
  }
  return text;
}

function requireEnum(value, label, allowed) {
  const text = requireString(value, label);
  if (!allowed.includes(text)) {
    throw precheckError("RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_INVALID_INPUT", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw precheckError("RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_INVALID_INPUT", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireNumberBetween(value, label, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw precheckError("RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_INVALID_INPUT", `${label} must be a number between ${min} and ${max}`);
  }
  return value;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw precheckError("RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_BOUNDARY_VIOLATION", `${label} must be ${expected}`);
  }
  return expected;
}

function uniqueStringArray(value, label, minItems, maxItems) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw precheckError("RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_INVALID_INPUT", `${label} must contain ${minItems}-${maxItems} items`);
  }
  const items = value.map((item) => requireString(item, label));
  if (new Set(items).size !== items.length) {
    throw precheckError("RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_INVALID_INPUT", `${label} must be unique`);
  }
  return items;
}

function uniqueBoundedStringArray(value, label, minItems, maxItems, minLength, maxLength) {
  return uniqueStringArray(value, label, minItems, maxItems)
    .map((item) => requireBoundedString(item, `${label}[]`, minLength, maxLength));
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw precheckError("RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_INVALID_INPUT", `${label} must be an object`);
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

function precheckError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
