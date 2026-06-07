import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_RUNTIME_ID = "research_deep_research_render_preview_runtime";
export const RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_COMMAND_PORT = "DeepResearchRenderPreviewPort.recordDeepResearchRenderPreview";
export const RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_READY = "RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_READY";

const inputSchemaVersion = "2026-06-05.research.deep-research-render-preview.v1";
const outputSchemaVersion = "2026-06-05.research.deep-research-render-preview-recorded.v1";
const synthesisSchemaVersion = "2026-06-05.research.deep-research-reasoning-synthesis-recorded.v1";
const finalizationSchemaVersion = "2026-06-05.research.deep-research-finalization-recorded.v1";
const defaultCommandLogPath = "reports/research-command-log/deep-research-render-preview.jsonl";

export function recordDeepResearchRenderPreview(input, options = {}) {
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

export function formatDeepResearchRenderPreview(result) {
  return [
    `Research deep_research render preview: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Job: ${result.job.jobId}`,
    `Preview: ${result.preview.previewId}`,
    `Student visible: ${result.boundary.studentVisible}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const previewInvocationId = requireString(input.previewInvocationId, "input.previewInvocationId");
  const principal = assertPrincipal(input.principal);
  const reasoningSynthesisRecord = assertReasoningSynthesisRecord(input.reasoningSynthesisRecord);
  const finalizationRecord = assertFinalizationRecord(input.finalizationRecord);
  assertRecordsMatch(reasoningSynthesisRecord, finalizationRecord);
  const renderPolicy = assertRenderPolicy(input.renderPolicy);
  const presentation = assertPresentation(input.presentation);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 80);
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 220);
  const previewInputHash = hashInput({
    previewInvocationId,
    principalId: principal.principalId,
    synthesisRecordId: reasoningSynthesisRecord.recordId,
    finalizationRecordId: finalizationRecord.recordId,
    presentation,
    renderPolicy,
  });
  return {
    previewInvocationId,
    principal,
    reasoningSynthesisRecord,
    finalizationRecord,
    renderPolicy,
    presentation,
    evidenceRefs,
    idempotencyKey,
    previewInputHash,
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
    throw previewError("RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_FORBIDDEN_PRINCIPAL", "render preview requires a human research teacher or admin");
  }
  if (!hasAny(scopes, ["RESEARCH_READ", "ADMIN_SYSTEM"])) {
    throw previewError("RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_MISSING_RESEARCH_READ", "RESEARCH_READ or ADMIN_SYSTEM scope is required");
  }
  if (!hasAny(scopes, ["RESEARCH_WRITE", "ADMIN_SYSTEM"])) {
    throw previewError("RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_MISSING_RESEARCH_WRITE", "RESEARCH_WRITE or ADMIN_SYSTEM scope is required to record preview evidence");
  }
  return { principalId, role, subjectType, entryPoint, sessionId, scopes };
}

function assertReasoningSynthesisRecord(record) {
  assertPlainObject(record, "input.reasoningSynthesisRecord");
  requireConst(record.schemaVersion, synthesisSchemaVersion, "input.reasoningSynthesisRecord.schemaVersion");
  requireConst(record.runtimeId, "research_deep_research_reasoning_synthesis_runtime", "input.reasoningSynthesisRecord.runtimeId");
  requireConst(record.status, "REASONING_SYNTHESIS_DRAFT_RECORDED", "input.reasoningSynthesisRecord.status");
  const recordId = requireString(record.recordId, "input.reasoningSynthesisRecord.recordId");
  const job = assertJob(record.job, "input.reasoningSynthesisRecord.job");
  const draft = assertDraft(record.draft);
  const usage = assertUsage(record.usage, draft);
  const evidenceRefs = uniqueStringArray(record.evidenceRefs, "input.reasoningSynthesisRecord.evidenceRefs", 1, 240);
  assertSynthesisBoundary(record.boundary);
  return { ...record, recordId, job, draft, usage, evidenceRefs };
}

function assertDraft(draft) {
  assertPlainObject(draft, "input.reasoningSynthesisRecord.draft");
  requireConst(draft.answerKind, "EVIDENCE_GROUNDED_DRAFT", "input.reasoningSynthesisRecord.draft.answerKind");
  const draftId = requireString(draft.draftId, "input.reasoningSynthesisRecord.draft.draftId");
  const title = requireBoundedString(draft.title, "input.reasoningSynthesisRecord.draft.title", 1, 240);
  const summary = requireBoundedString(draft.summary, "input.reasoningSynthesisRecord.draft.summary", 1, 1200);
  const claims = assertClaims(draft.claims);
  const limitations = uniqueBoundedStringArray(draft.limitations, "input.reasoningSynthesisRecord.draft.limitations", 1, 12, 1, 500);
  return { draftId, answerKind: "EVIDENCE_GROUNDED_DRAFT", title, summary, claims, limitations };
}

function assertClaims(claims) {
  if (!Array.isArray(claims) || claims.length < 1 || claims.length > 200) {
    throw previewError("RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_INVALID_DRAFT", "draft claims must contain 1-200 items");
  }
  const seen = new Set();
  return claims.map((claim, index) => {
    assertPlainObject(claim, `input.reasoningSynthesisRecord.draft.claims[${index}]`);
    const claimId = requireBoundedString(claim.claimId, `input.reasoningSynthesisRecord.draft.claims[${index}].claimId`, 1, 120);
    if (seen.has(claimId)) throw previewError("RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_INVALID_DRAFT", "claimId values must be unique");
    seen.add(claimId);
    const sourceHashes = uniqueBoundedStringArray(claim.sourceHashes, `input.reasoningSynthesisRecord.draft.claims[${index}].sourceHashes`, 1, 20, 71, 71);
    for (const sourceHash of sourceHashes) {
      if (!/^sha256:[a-f0-9]{64}$/u.test(sourceHash)) {
        throw previewError("RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_INVALID_SOURCE_HASH", "claim sourceHashes must be sha256 digests");
      }
    }
    return {
      claimId,
      text: requireBoundedString(claim.text, `input.reasoningSynthesisRecord.draft.claims[${index}].text`, 1, 1200),
      citations: uniqueBoundedStringArray(claim.citations, `input.reasoningSynthesisRecord.draft.claims[${index}].citations`, 1, 20, 4, 400),
      sourceHashes,
      supportChunkIds: uniqueBoundedStringArray(claim.supportChunkIds, `input.reasoningSynthesisRecord.draft.claims[${index}].supportChunkIds`, 1, 40, 1, 160),
      confidence: requireNumberBetween(claim.confidence, `input.reasoningSynthesisRecord.draft.claims[${index}].confidence`, 0, 1),
    };
  });
}

function assertUsage(usage, draft) {
  assertPlainObject(usage, "input.reasoningSynthesisRecord.usage");
  const claimCount = requireIntegerBetween(usage.claimCount, "input.reasoningSynthesisRecord.usage.claimCount", 1, 200);
  const citationCount = requireIntegerBetween(usage.citationCount, "input.reasoningSynthesisRecord.usage.citationCount", 1, 500);
  const sourceHashCount = requireIntegerBetween(usage.sourceHashCount, "input.reasoningSynthesisRecord.usage.sourceHashCount", 1, 500);
  const actualCitationCount = new Set(draft.claims.flatMap((claim) => claim.citations)).size;
  const actualSourceHashCount = new Set(draft.claims.flatMap((claim) => claim.sourceHashes)).size;
  if (claimCount !== draft.claims.length || citationCount !== actualCitationCount || sourceHashCount !== actualSourceHashCount) {
    throw previewError("RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_USAGE_MISMATCH", "usage counts must match draft claims, citations, and source hashes");
  }
  return { ...usage, claimCount, citationCount, sourceHashCount };
}

function assertSynthesisBoundary(boundary) {
  assertPlainObject(boundary, "input.reasoningSynthesisRecord.boundary");
  requireConst(boundary.reasoningDraftComposed, true, "input.reasoningSynthesisRecord.boundary.reasoningDraftComposed");
  requireConst(boundary.evidenceGroundingVerified, true, "input.reasoningSynthesisRecord.boundary.evidenceGroundingVerified");
  for (const field of [
    "directExternalModelCallStarted",
    "directDatabaseAccessStarted",
    "mainDatabaseWriteStarted",
    "studentArchiveUsed",
    "remoteDeviceSourcesUsed",
    "localToolMutationAllowed",
    "swarmAllowed",
    "finalAnswerGenerated",
    "directPublicationAllowed",
  ]) {
    requireConst(boundary[field], false, `input.reasoningSynthesisRecord.boundary.${field}`);
  }
}

function assertFinalizationRecord(record) {
  assertPlainObject(record, "input.finalizationRecord");
  requireConst(record.schemaVersion, finalizationSchemaVersion, "input.finalizationRecord.schemaVersion");
  requireConst(record.runtimeId, "research_deep_research_finalization_runtime", "input.finalizationRecord.runtimeId");
  requireConst(record.commandPort, "DeepResearchFinalizationPort.recordDeepResearchFinalization", "input.finalizationRecord.commandPort");
  requireConst(record.status, "FINAL_ANSWER_FINALIZED_NOT_PUBLISHED", "input.finalizationRecord.status");
  const recordId = requireString(record.recordId, "input.finalizationRecord.recordId");
  const job = assertJob(record.job, "input.finalizationRecord.job");
  const artifact = assertFinalizedArtifact(record.artifact);
  const evidenceRefs = uniqueStringArray(record.evidenceRefs, "input.finalizationRecord.evidenceRefs", 1, 240);
  assertFinalizationBoundary(record.boundary);
  return { ...record, recordId, job, artifact, evidenceRefs };
}

function assertFinalizedArtifact(artifact) {
  assertPlainObject(artifact, "input.finalizationRecord.artifact");
  return {
    artifactId: requireString(artifact.artifactId, "input.finalizationRecord.artifact.artifactId"),
    artifactKind: requireConst(artifact.artifactKind, "REVIEWED_DEEP_RESEARCH_FINALIZATION_RECORD", "input.finalizationRecord.artifact.artifactKind"),
    finalizationLabel: requireBoundedString(artifact.finalizationLabel, "input.finalizationRecord.artifact.finalizationLabel", 1, 160),
    deliveryState: requireConst(artifact.deliveryState, "FINALIZED_NOT_PUBLISHED", "input.finalizationRecord.artifact.deliveryState"),
    reviewRecordId: requireString(artifact.reviewRecordId, "input.finalizationRecord.artifact.reviewRecordId"),
    reviewerPrincipalId: requireString(artifact.reviewerPrincipalId, "input.finalizationRecord.artifact.reviewerPrincipalId"),
    finalizerPrincipalId: requireString(artifact.finalizerPrincipalId, "input.finalizationRecord.artifact.finalizerPrincipalId"),
    claimCount: requireIntegerBetween(artifact.claimCount, "input.finalizationRecord.artifact.claimCount", 1, 200),
    citationCount: requireIntegerBetween(artifact.citationCount, "input.finalizationRecord.artifact.citationCount", 1, 500),
    sourceHashCount: requireIntegerBetween(artifact.sourceHashCount, "input.finalizationRecord.artifact.sourceHashCount", 1, 500),
  };
}

function assertFinalizationBoundary(boundary) {
  assertPlainObject(boundary, "input.finalizationRecord.boundary");
  requireConst(boundary.approvedReviewVerified, true, "input.finalizationRecord.boundary.approvedReviewVerified");
  requireConst(boundary.finalAnswerFinalized, true, "input.finalizationRecord.boundary.finalAnswerFinalized");
  for (const field of [
    "finalAnswerGenerated",
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
    requireConst(boundary[field], false, `input.finalizationRecord.boundary.${field}`);
  }
  requireConst(boundary.requiresFuturePublicationReview, true, "input.finalizationRecord.boundary.requiresFuturePublicationReview");
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

function assertRecordsMatch(synthesis, finalization) {
  if (synthesis.job.jobId !== finalization.job.jobId ||
    synthesis.job.taskId !== finalization.job.taskId ||
    synthesis.job.contextRef !== finalization.job.contextRef) {
    throw previewError("RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_JOB_MISMATCH", "synthesis and finalization records must reference the same job");
  }
  if (synthesis.usage.claimCount !== finalization.artifact.claimCount ||
    synthesis.usage.citationCount !== finalization.artifact.citationCount ||
    synthesis.usage.sourceHashCount !== finalization.artifact.sourceHashCount) {
    throw previewError("RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_COUNT_MISMATCH", "finalization counts must match the synthesis draft");
  }
}

function assertRenderPolicy(policy) {
  assertPlainObject(policy, "input.renderPolicy");
  for (const field of [
    "finalizedArtifactRequired",
    "approvedReviewRequired",
    "preserveClaimsRequired",
    "preserveCitationsRequired",
    "preserveSourceHashesRequired",
    "encodeUnsafeTextRequired",
    "limitationsRequired",
    "requiresFuturePublicationReview",
  ]) {
    requireConst(policy[field], true, `input.renderPolicy.${field}`);
  }
  for (const field of [
    "publicationAllowed",
    "studentVisibleAllowed",
    "directDatabaseAccessAllowed",
    "mainDatabaseWriteAllowed",
    "studentArchiveWriteAllowed",
    "externalModelCallAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.renderPolicy.${field}`);
  }
  return { ...policy };
}

function assertPresentation(presentation) {
  assertPlainObject(presentation, "input.presentation");
  return {
    previewId: requireString(presentation.previewId, "input.presentation.previewId"),
    previewKind: requireConst(presentation.previewKind, "EVIDENCE_GROUNDED_RESEARCH_PREVIEW", "input.presentation.previewKind"),
    audience: requireConst(presentation.audience, "TEACHER_REVIEW", "input.presentation.audience"),
    format: requireConst(presentation.format, "SAFE_TEXT_BLOCKS", "input.presentation.format"),
    deliveryState: requireConst(presentation.deliveryState, "PREVIEW_READY_NOT_PUBLISHED", "input.presentation.deliveryState"),
  };
}

function buildCommandRecord(normalized, recordedAt) {
  const preview = buildPreview(normalized);
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW",
    recordId: `research_deep_research_render_preview_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    runtimeId: RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_RUNTIME_ID,
    commandPort: RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_COMMAND_PORT,
    status: "RENDER_PREVIEW_READY_NOT_PUBLISHED",
    previewInvocationId: normalized.previewInvocationId,
    principal: normalized.principal,
    job: normalized.finalizationRecord.job,
    preview,
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.reasoningSynthesisRecord.evidenceRefs,
        ...normalized.finalizationRecord.evidenceRefs,
        `evidence:render-preview-input-hash:${normalized.previewInputHash}`,
        `evidence:runtime:${RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_RUNTIME_ID}`,
        `evidence:command-port:${RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_COMMAND_PORT}`,
        `evidence:synthesis-record:${normalized.reasoningSynthesisRecord.recordId}`,
        `evidence:finalization-record:${normalized.finalizationRecord.recordId}`,
      ]),
      idempotencyKey: normalized.idempotencyKey,
      previewInputHash: normalized.previewInputHash,
    },
    boundary: buildBoundary(),
  };
}

function buildPreview(normalized) {
  const draft = normalized.reasoningSynthesisRecord.draft;
  const artifact = normalized.finalizationRecord.artifact;
  return {
    previewId: normalized.presentation.previewId,
    previewKind: normalized.presentation.previewKind,
    audience: normalized.presentation.audience,
    format: normalized.presentation.format,
    deliveryState: normalized.presentation.deliveryState,
    title: escapePreviewText(draft.title),
    summary: escapePreviewText(draft.summary),
    claims: draft.claims.map((claim) => ({
      claimId: claim.claimId,
      text: escapePreviewText(claim.text),
      citations: [...claim.citations],
      sourceHashes: [...claim.sourceHashes],
      supportChunkIds: [...claim.supportChunkIds],
      confidence: claim.confidence,
      evidencePreserved: true,
    })),
    limitations: draft.limitations.map((limitation) => escapePreviewText(limitation)),
    review: {
      reviewRecordId: artifact.reviewRecordId,
      reviewerPrincipalId: artifact.reviewerPrincipalId,
    },
    finalization: {
      artifactId: artifact.artifactId,
      finalizerPrincipalId: artifact.finalizerPrincipalId,
      deliveryState: artifact.deliveryState,
    },
    integrity: {
      claimCount: artifact.claimCount,
      citationCount: artifact.citationCount,
      sourceHashCount: artifact.sourceHashCount,
      unsafeTextEncoded: true,
    },
  };
}

function buildBoundary() {
  return {
    finalizedArtifactVerified: true,
    reasoningSynthesisVerified: true,
    citationIntegrityPreserved: true,
    sourceHashIntegrityPreserved: true,
    unsafeTextEncoded: true,
    renderPreviewRecorded: true,
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
    preview: record.preview,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 300,
      evidenceClass: "ASYNC_DEEP_RESEARCH_RENDER_PREVIEW_BOUNDARY",
    },
    nextAction: "Use this teacher-only preview for future publication review; do not publish or expose it to students directly.",
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
    if (record?.recordType === "RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.previewInvocationId !== normalized.previewInvocationId ||
    existing.job?.jobId !== normalized.finalizationRecord.job.jobId ||
    existing.preview?.previewId !== normalized.presentation.previewId ||
    existing.evidence?.previewInputHash !== normalized.previewInputHash) {
    throw previewError("RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different render preview");
  }
}

function escapePreviewText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw previewError("RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireBoundedString(value, label, minLength, maxLength) {
  const text = requireString(value, label);
  if (text.length < minLength || text.length > maxLength) {
    throw previewError("RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_INVALID_INPUT", `${label} length must be ${minLength}-${maxLength}`);
  }
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw previewError("RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_INVALID_INPUT", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireNumberBetween(value, label, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw previewError("RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_INVALID_INPUT", `${label} must be a number between ${min} and ${max}`);
  }
  return value;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw previewError("RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_BOUNDARY_VIOLATION", `${label} must be ${expected}`);
  }
  return expected;
}

function uniqueStringArray(value, label, minItems, maxItems) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw previewError("RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_INVALID_INPUT", `${label} must contain ${minItems}-${maxItems} items`);
  }
  const items = value.map((item) => requireString(item, label));
  if (new Set(items).size !== items.length) {
    throw previewError("RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_INVALID_INPUT", `${label} must be unique`);
  }
  return items;
}

function uniqueBoundedStringArray(value, label, minItems, maxItems, minLength, maxLength) {
  return uniqueStringArray(value, label, minItems, maxItems)
    .map((item) => requireBoundedString(item, `${label}[]`, minLength, maxLength));
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw previewError("RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_INVALID_INPUT", `${label} must be an object`);
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

function previewError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
