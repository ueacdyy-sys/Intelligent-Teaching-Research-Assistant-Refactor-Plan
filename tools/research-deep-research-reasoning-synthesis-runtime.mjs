import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_RUNTIME_ID = "research_deep_research_reasoning_synthesis_runtime";
export const RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_COMMAND_PORT = "DeepResearchReasoningSynthesisPort.recordDeepResearchReasoningSynthesis";
export const RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_REASONING_PORT = "DeepResearchReasoningPort.composeEvidenceGroundedDraft";
export const RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_READY = "RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_READY";

const inputSchemaVersion = "2026-06-05.research.deep-research-reasoning-synthesis.v1";
const outputSchemaVersion = "2026-06-05.research.deep-research-reasoning-synthesis-recorded.v1";
const retrievalExecutionSchemaVersion = "2026-06-05.research.deep-research-retrieval-execution-recorded.v1";
const defaultCommandLogPath = "reports/research-command-log/deep-research-reasoning-synthesis.jsonl";

export async function recordDeepResearchReasoningSynthesis(input, options = {}) {
  const recordedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const reasoningPort = options.reasoningPort;
  if (!reasoningPort || typeof reasoningPort.composeEvidenceGroundedDraft !== "function") {
    throw synthesisError("RESEARCH_DEEP_RESEARCH_SYNTHESIS_MISSING_REASONING_PORT", "DeepResearchReasoningPort.composeEvidenceGroundedDraft is required");
  }

  const commandLogPath = options.commandLogPath ?? defaultCommandLogPath;
  const existing = findExistingRecordByIdempotencyKey(commandLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const draftResult = await reasoningPort.composeEvidenceGroundedDraft(buildReasoningRequest(normalized));
  const draft = assertDraft(draftResult, normalized);
  const record = buildCommandRecord(normalized, draft, recordedAt);
  appendCommandRecord(commandLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatDeepResearchReasoningSynthesis(result) {
  return [
    `Research deep_research reasoning synthesis: ${result.status}`,
    `Reasoning port: ${result.reasoningPort}`,
    `Job: ${result.job.jobId}`,
    `Claims: ${result.usage.claimCount}`,
    `Final answer generated: ${result.boundary.finalAnswerGenerated}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const synthesisInvocationId = requireString(input.synthesisInvocationId, "input.synthesisInvocationId");
  const retrievalExecutionRecord = assertRetrievalExecutionRecord(input.retrievalExecutionRecord);
  const principal = assertPrincipal(input.principal, retrievalExecutionRecord);
  const reasoningPolicy = assertReasoningPolicy(input.reasoningPolicy);
  const reasoningPortDescriptor = assertReasoningPortDescriptor(input.reasoningPortDescriptor);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 80);
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 220);
  const synthesisInputHash = hashInput({
    synthesisInvocationId,
    principalId: principal.principalId,
    jobId: retrievalExecutionRecord.job.jobId,
    retrievalRecordId: retrievalExecutionRecord.recordId,
    chunkHashes: retrievalExecutionRecord.allowed.sourceHashes,
    reasoningPolicy,
    reasoningPortDescriptor,
  });
  return {
    synthesisInvocationId,
    principal,
    retrievalExecutionRecord,
    reasoningPolicy,
    reasoningPortDescriptor,
    evidenceRefs,
    idempotencyKey,
    synthesisInputHash,
  };
}

function assertPrincipal(principal, retrievalExecutionRecord) {
  assertPlainObject(principal, "input.principal");
  const principalId = requireString(principal.principalId, "input.principal.principalId");
  const role = requireString(principal.role, "input.principal.role");
  const subjectType = requireString(principal.subjectType, "input.principal.subjectType");
  const entryPoint = requireString(principal.entryPoint, "input.principal.entryPoint");
  const sessionId = requireString(principal.sessionId, "input.principal.sessionId");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  const isService = role === "SERVICE" && subjectType === "SERVICE" && entryPoint === "AGENT_INTERNAL";
  const isAdmin = role === "ADMIN" && scopes.includes("ADMIN_SYSTEM");
  if (!isService && !isAdmin) {
    throw synthesisError("RESEARCH_DEEP_RESEARCH_SYNTHESIS_FORBIDDEN_PRINCIPAL", "reasoning synthesis must be recorded by an internal service or admin");
  }
  if (!hasAny(scopes, ["AGENT_COMMAND_SUBMIT", "ADMIN_SYSTEM"])) {
    throw synthesisError("RESEARCH_DEEP_RESEARCH_SYNTHESIS_MISSING_COMMAND_SCOPE", "AGENT_COMMAND_SUBMIT or ADMIN_SYSTEM scope is required");
  }
  if (!hasAny(scopes, ["RESEARCH_READ", "ADMIN_SYSTEM"])) {
    throw synthesisError("RESEARCH_DEEP_RESEARCH_SYNTHESIS_MISSING_RESEARCH_SCOPE", "RESEARCH_READ or ADMIN_SYSTEM scope is required");
  }
  if (retrievalExecutionRecord.allowed.hasPrivate && !hasAny(scopes, ["KNOWLEDGE_PRIVATE_READ", "ADMIN_SYSTEM"])) {
    throw synthesisError("RESEARCH_DEEP_RESEARCH_SYNTHESIS_MISSING_PRIVATE_SCOPE", "KNOWLEDGE_PRIVATE_READ or ADMIN_SYSTEM scope is required for private chunks");
  }
  return { principalId, role, subjectType, entryPoint, sessionId, scopes };
}

function assertRetrievalExecutionRecord(record) {
  assertPlainObject(record, "input.retrievalExecutionRecord");
  requireConst(record.schemaVersion, retrievalExecutionSchemaVersion, "input.retrievalExecutionRecord.schemaVersion");
  requireConst(record.runtimeId, "research_deep_research_retrieval_execution_runtime", "input.retrievalExecutionRecord.runtimeId");
  requireConst(record.status, "RETRIEVAL_EXECUTION_RECORDED", "input.retrievalExecutionRecord.status");
  const recordId = requireString(record.recordId, "input.retrievalExecutionRecord.recordId");
  const job = assertJob(record.job);
  const retrievalResult = assertRetrievalResult(record.retrievalResult);
  const evidenceRefs = uniqueStringArray(record.evidenceRefs, "input.retrievalExecutionRecord.evidenceRefs", 1, 200);
  assertRetrievalBoundary(record.boundary);
  return { ...record, recordId, job, retrievalResult, evidenceRefs, allowed: buildAllowedEvidence(retrievalResult) };
}

function assertJob(job) {
  assertPlainObject(job, "input.retrievalExecutionRecord.job");
  const taskId = requireString(job.taskId, "input.retrievalExecutionRecord.job.taskId");
  const contextRef = requireString(job.contextRef, "input.retrievalExecutionRecord.job.contextRef");
  const jobId = requireString(job.jobId, "input.retrievalExecutionRecord.job.jobId");
  requireConst(job.queueName, "research_deep_research", "input.retrievalExecutionRecord.job.queueName");
  return { taskId, contextRef, jobId, queueName: "research_deep_research" };
}

function assertRetrievalResult(result) {
  assertPlainObject(result, "input.retrievalExecutionRecord.retrievalResult");
  requireConst(result.retrievalExecuted, true, "input.retrievalExecutionRecord.retrievalResult.retrievalExecuted");
  if (!Array.isArray(result.items) || result.items.length < 1) {
    throw synthesisError("RESEARCH_DEEP_RESEARCH_SYNTHESIS_INVALID_RETRIEVAL", "retrievalResult.items must be a non-empty array");
  }
  const items = result.items.map((item, itemIndex) => assertRetrievalItem(item, itemIndex));
  const chunkCount = items.reduce((total, item) => total + item.chunks.length, 0);
  if (chunkCount < 1) {
    throw synthesisError("RESEARCH_DEEP_RESEARCH_SYNTHESIS_INVALID_RETRIEVAL", "retrieval execution must contain at least one chunk");
  }
  return { retrievalExecuted: true, chunkCount, sourceRefCount: Number(result.sourceRefCount ?? 0), items };
}

function assertRetrievalItem(item, itemIndex) {
  assertPlainObject(item, `input.retrievalExecutionRecord.retrievalResult.items[${itemIndex}]`);
  const classification = requireEnum(item.classification, `input.retrievalExecutionRecord.retrievalResult.items[${itemIndex}].classification`, ["PUBLIC", "PRIVATE"]);
  if (!Array.isArray(item.chunks) || item.chunks.length < 1) {
    throw synthesisError("RESEARCH_DEEP_RESEARCH_SYNTHESIS_INVALID_RETRIEVAL", "retrieval item chunks must be non-empty");
  }
  return {
    planItemId: requireString(item.planItemId, `input.retrievalExecutionRecord.retrievalResult.items[${itemIndex}].planItemId`),
    knowledgeBaseRef: requireString(item.knowledgeBaseRef, `input.retrievalExecutionRecord.retrievalResult.items[${itemIndex}].knowledgeBaseRef`),
    classification,
    chunks: item.chunks.map((chunk, chunkIndex) => assertChunk(chunk, itemIndex, chunkIndex)),
  };
}

function assertChunk(chunk, itemIndex, chunkIndex) {
  assertPlainObject(chunk, `input.retrievalExecutionRecord.retrievalResult.items[${itemIndex}].chunks[${chunkIndex}]`);
  const sourceHash = requireString(chunk.sourceHash, `input.retrievalExecutionRecord.retrievalResult.items[${itemIndex}].chunks[${chunkIndex}].sourceHash`);
  if (!/^sha256:[a-f0-9]{64}$/u.test(sourceHash)) {
    throw synthesisError("RESEARCH_DEEP_RESEARCH_SYNTHESIS_INVALID_RETRIEVAL", "retrieval chunk sourceHash must be a sha256 digest");
  }
  return {
    chunkId: requireBoundedString(chunk.chunkId, `input.retrievalExecutionRecord.retrievalResult.items[${itemIndex}].chunks[${chunkIndex}].chunkId`, 1, 160),
    sourceRef: requireBoundedString(chunk.sourceRef, `input.retrievalExecutionRecord.retrievalResult.items[${itemIndex}].chunks[${chunkIndex}].sourceRef`, 1, 200),
    sourceKind: requireString(chunk.sourceKind, `input.retrievalExecutionRecord.retrievalResult.items[${itemIndex}].chunks[${chunkIndex}].sourceKind`),
    sourceTitle: requireBoundedString(chunk.sourceTitle, `input.retrievalExecutionRecord.retrievalResult.items[${itemIndex}].chunks[${chunkIndex}].sourceTitle`, 1, 240),
    citation: requireBoundedString(chunk.citation, `input.retrievalExecutionRecord.retrievalResult.items[${itemIndex}].chunks[${chunkIndex}].citation`, 4, 400),
    sourceHash,
    excerpt: requireBoundedString(chunk.excerpt, `input.retrievalExecutionRecord.retrievalResult.items[${itemIndex}].chunks[${chunkIndex}].excerpt`, 1, 1200),
  };
}

function assertRetrievalBoundary(boundary) {
  assertPlainObject(boundary, "input.retrievalExecutionRecord.boundary");
  requireConst(boundary.retrievalExecuted, true, "input.retrievalExecutionRecord.boundary.retrievalExecuted");
  requireConst(boundary.ragSynthesisStarted, false, "input.retrievalExecutionRecord.boundary.ragSynthesisStarted");
  requireConst(boundary.finalAnswerGenerated, false, "input.retrievalExecutionRecord.boundary.finalAnswerGenerated");
  requireConst(boundary.directPublicationAllowed, false, "input.retrievalExecutionRecord.boundary.directPublicationAllowed");
  requireConst(boundary.directMainDatabaseWriteAllowed, false, "input.retrievalExecutionRecord.boundary.directMainDatabaseWriteAllowed");
}

function buildAllowedEvidence(retrievalResult) {
  const citations = new Set();
  const sourceHashes = new Set();
  const chunkIds = new Set();
  let hasPrivate = false;
  for (const item of retrievalResult.items) {
    if (item.classification === "PRIVATE") hasPrivate = true;
    for (const chunk of item.chunks) {
      citations.add(chunk.citation);
      sourceHashes.add(chunk.sourceHash);
      chunkIds.add(chunk.chunkId);
    }
  }
  return { citations, sourceHashes, chunkIds, hasPrivate };
}

function assertReasoningPolicy(policy) {
  assertPlainObject(policy, "input.reasoningPolicy");
  requireConst(policy.composeDraftNow, true, "input.reasoningPolicy.composeDraftNow");
  requireConst(policy.evidenceGroundedOnly, true, "input.reasoningPolicy.evidenceGroundedOnly");
  requireConst(policy.directDatabaseAccessAllowed, false, "input.reasoningPolicy.directDatabaseAccessAllowed");
  requireConst(policy.writeAllowed, false, "input.reasoningPolicy.writeAllowed");
  requireConst(policy.studentArchiveAllowed, false, "input.reasoningPolicy.studentArchiveAllowed");
  requireConst(policy.remoteDeviceSourcesAllowed, false, "input.reasoningPolicy.remoteDeviceSourcesAllowed");
  requireConst(policy.directExternalModelCallAllowed, false, "input.reasoningPolicy.directExternalModelCallAllowed");
  requireConst(policy.finalAnswerNowAllowed, false, "input.reasoningPolicy.finalAnswerNowAllowed");
  requireConst(policy.publicationAllowed, false, "input.reasoningPolicy.publicationAllowed");
  requireConst(policy.citationRequired, true, "input.reasoningPolicy.citationRequired");
  requireConst(policy.sourceHashRequired, true, "input.reasoningPolicy.sourceHashRequired");
  return {
    composeDraftNow: true,
    evidenceGroundedOnly: true,
    directDatabaseAccessAllowed: false,
    writeAllowed: false,
    studentArchiveAllowed: false,
    remoteDeviceSourcesAllowed: false,
    directExternalModelCallAllowed: false,
    finalAnswerNowAllowed: false,
    publicationAllowed: false,
    citationRequired: true,
    sourceHashRequired: true,
    maxDraftClaims: requireIntegerBetween(policy.maxDraftClaims, "input.reasoningPolicy.maxDraftClaims", 1, 12),
    maxCitationsPerClaim: requireIntegerBetween(policy.maxCitationsPerClaim, "input.reasoningPolicy.maxCitationsPerClaim", 1, 8),
    maxSourceHashesPerClaim: requireIntegerBetween(policy.maxSourceHashesPerClaim, "input.reasoningPolicy.maxSourceHashesPerClaim", 1, 8),
    maxDraftTokens: requireIntegerBetween(policy.maxDraftTokens, "input.reasoningPolicy.maxDraftTokens", 100, 4000),
  };
}

function assertReasoningPortDescriptor(descriptor) {
  assertPlainObject(descriptor, "input.reasoningPortDescriptor");
  requireConst(descriptor.portName, "DeepResearchReasoningPort", "input.reasoningPortDescriptor.portName");
  requireConst(descriptor.operation, "composeEvidenceGroundedDraft", "input.reasoningPortDescriptor.operation");
  requireConst(descriptor.directExternalModelCall, false, "input.reasoningPortDescriptor.directExternalModelCall");
  requireConst(descriptor.directDatabaseAccess, false, "input.reasoningPortDescriptor.directDatabaseAccess");
  requireConst(descriptor.writeAllowed, false, "input.reasoningPortDescriptor.writeAllowed");
  return {
    portName: "DeepResearchReasoningPort",
    operation: "composeEvidenceGroundedDraft",
    directExternalModelCall: false,
    directDatabaseAccess: false,
    writeAllowed: false,
  };
}

function buildReasoningRequest(normalized) {
  return {
    job: normalized.retrievalExecutionRecord.job,
    retrievalResult: normalized.retrievalExecutionRecord.retrievalResult,
    reasoningPolicy: normalized.reasoningPolicy,
    allowedEvidence: {
      citations: [...normalized.retrievalExecutionRecord.allowed.citations],
      sourceHashes: [...normalized.retrievalExecutionRecord.allowed.sourceHashes],
      chunkIds: [...normalized.retrievalExecutionRecord.allowed.chunkIds],
    },
    evidenceRefs: normalized.evidenceRefs,
  };
}

function assertDraft(result, normalized) {
  assertPlainObject(result, "reasoningPort.composeEvidenceGroundedDraft result");
  requireConst(result.answerKind, "EVIDENCE_GROUNDED_DRAFT", "reasoningPort.composeEvidenceGroundedDraft result.answerKind");
  const draftId = requireBoundedString(result.draftId, "reasoningPort.composeEvidenceGroundedDraft result.draftId", 1, 160);
  const title = requireBoundedString(result.title, "reasoningPort.composeEvidenceGroundedDraft result.title", 1, 240);
  const summary = requireBoundedString(result.summary, "reasoningPort.composeEvidenceGroundedDraft result.summary", 1, 1200);
  const claims = assertClaims(result.claims, normalized);
  const limitations = uniqueBoundedStringArray(result.limitations, "reasoningPort.composeEvidenceGroundedDraft result.limitations", 1, 12, 1, 500);
  const draftTokens = requireIntegerBetween(result.draftTokens, "reasoningPort.composeEvidenceGroundedDraft result.draftTokens", 1, normalized.reasoningPolicy.maxDraftTokens);
  return { draftId, answerKind: "EVIDENCE_GROUNDED_DRAFT", title, summary, claims, limitations, draftTokens };
}

function assertClaims(claims, normalized) {
  if (!Array.isArray(claims) || claims.length < 1 || claims.length > normalized.reasoningPolicy.maxDraftClaims) {
    throw synthesisError("RESEARCH_DEEP_RESEARCH_SYNTHESIS_BUDGET_EXCEEDED", "draft claims exceed the approved claim budget");
  }
  const seenIds = new Set();
  return claims.map((claim, index) => {
    assertPlainObject(claim, `reasoningPort.composeEvidenceGroundedDraft result.claims[${index}]`);
    const claimId = requireBoundedString(claim.claimId, `reasoningPort.composeEvidenceGroundedDraft result.claims[${index}].claimId`, 1, 120);
    if (seenIds.has(claimId)) throw synthesisError("RESEARCH_DEEP_RESEARCH_SYNTHESIS_INVALID_DRAFT", "claimId values must be unique");
    seenIds.add(claimId);
    const citations = uniqueBoundedStringArray(claim.citations, `reasoningPort.composeEvidenceGroundedDraft result.claims[${index}].citations`, 1, normalized.reasoningPolicy.maxCitationsPerClaim, 4, 400);
    const sourceHashes = uniqueBoundedStringArray(claim.sourceHashes, `reasoningPort.composeEvidenceGroundedDraft result.claims[${index}].sourceHashes`, 1, normalized.reasoningPolicy.maxSourceHashesPerClaim, 71, 71);
    const supportChunkIds = uniqueBoundedStringArray(claim.supportChunkIds, `reasoningPort.composeEvidenceGroundedDraft result.claims[${index}].supportChunkIds`, 1, 20, 1, 160);
    assertEvidenceSubset(citations, normalized.retrievalExecutionRecord.allowed.citations, "citation");
    assertEvidenceSubset(sourceHashes, normalized.retrievalExecutionRecord.allowed.sourceHashes, "sourceHash");
    assertEvidenceSubset(supportChunkIds, normalized.retrievalExecutionRecord.allowed.chunkIds, "supportChunkId");
    return {
      claimId,
      text: requireBoundedString(claim.text, `reasoningPort.composeEvidenceGroundedDraft result.claims[${index}].text`, 1, 1200),
      citations,
      sourceHashes,
      supportChunkIds,
      confidence: requireNumberBetween(claim.confidence, `reasoningPort.composeEvidenceGroundedDraft result.claims[${index}].confidence`, 0, 1),
    };
  });
}

function assertEvidenceSubset(values, allowed, label) {
  for (const value of values) {
    if (!allowed.has(value)) {
      throw synthesisError("RESEARCH_DEEP_RESEARCH_SYNTHESIS_UNSUPPORTED_CLAIM", `${label} ${value} was not present in retrieval execution evidence`);
    }
  }
}

function buildCommandRecord(normalized, draft, recordedAt) {
  const usage = buildUsage(draft);
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS",
    recordId: `research_deep_research_reasoning_synthesis_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    commandPort: RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_COMMAND_PORT,
    reasoningPort: RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_REASONING_PORT,
    status: "REASONING_SYNTHESIS_DRAFT_RECORDED",
    synthesisInvocationId: normalized.synthesisInvocationId,
    job: normalized.retrievalExecutionRecord.job,
    draft: withoutDraftTokens(draft),
    usage,
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.retrievalExecutionRecord.evidenceRefs,
        ...draft.claims.map((claim) => `evidence:reasoning-claim-hash:${hashInput(claim)}`),
        ...draft.claims.flatMap((claim) => claim.sourceHashes.map((hash) => `evidence:retrieval-source-hash:${hash}`)),
        `evidence:reasoning-synthesis-input-hash:${normalized.synthesisInputHash}`,
        `evidence:runtime:${RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_RUNTIME_ID}`,
        `evidence:command-port:${RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_COMMAND_PORT}`,
        `evidence:reasoning-port:${RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_REASONING_PORT}`,
      ]),
      idempotencyKey: normalized.idempotencyKey,
      synthesisInputHash: normalized.synthesisInputHash,
    },
    boundary: buildBoundary(),
  };
}

function buildUsage(draft) {
  return {
    draftTokens: draft.draftTokens,
    claimCount: draft.claims.length,
    citationCount: new Set(draft.claims.flatMap((claim) => claim.citations)).size,
    sourceHashCount: new Set(draft.claims.flatMap((claim) => claim.sourceHashes)).size,
  };
}

function withoutDraftTokens(draft) {
  const { draftTokens, ...recordedDraft } = draft;
  return recordedDraft;
}

function buildBoundary() {
  return {
    retrievalExecutionVerified: true,
    evidenceGroundingVerified: true,
    reasoningDraftComposed: true,
    directExternalModelCallStarted: false,
    directDatabaseAccessStarted: false,
    mainDatabaseWriteStarted: false,
    studentArchiveUsed: false,
    remoteDeviceSourcesUsed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
    finalAnswerGenerated: false,
    directPublicationAllowed: false,
    requiresFutureFinalAnswerReview: true,
  };
}

function buildResult(record, options) {
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_RUNTIME_ID,
    commandPort: record.commandPort,
    reasoningPort: record.reasoningPort,
    status: record.status,
    recordId: record.recordId,
    recordedAt: record.recordedAt,
    idempotencyKey: record.evidence.idempotencyKey,
    idempotentReplay: options.idempotentReplay === true,
    job: record.job,
    draft: record.draft,
    usage: record.usage,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 300,
      evidenceClass: "ASYNC_DEEP_RESEARCH_REASONING_SYNTHESIS_BOUNDARY",
    },
    nextAction: "Send this evidence-grounded draft to a future final-answer review boundary; do not publish it directly.",
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
    if (record?.recordType === "RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.synthesisInvocationId !== normalized.synthesisInvocationId ||
    existing.job?.jobId !== normalized.retrievalExecutionRecord.job.jobId ||
    existing.evidence?.synthesisInputHash !== normalized.synthesisInputHash) {
    throw synthesisError("RESEARCH_DEEP_RESEARCH_SYNTHESIS_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different reasoning synthesis");
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw synthesisError("RESEARCH_DEEP_RESEARCH_SYNTHESIS_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireBoundedString(value, label, minLength, maxLength) {
  const text = requireString(value, label);
  if (text.length < minLength || text.length > maxLength) {
    throw synthesisError("RESEARCH_DEEP_RESEARCH_SYNTHESIS_INVALID_INPUT", `${label} length must be ${minLength}-${maxLength}`);
  }
  return text;
}

function requireEnum(value, label, allowed) {
  const text = requireString(value, label);
  if (!allowed.includes(text)) {
    throw synthesisError("RESEARCH_DEEP_RESEARCH_SYNTHESIS_INVALID_INPUT", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw synthesisError("RESEARCH_DEEP_RESEARCH_SYNTHESIS_INVALID_INPUT", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireNumberBetween(value, label, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw synthesisError("RESEARCH_DEEP_RESEARCH_SYNTHESIS_INVALID_INPUT", `${label} must be a number between ${min} and ${max}`);
  }
  return value;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw synthesisError("RESEARCH_DEEP_RESEARCH_SYNTHESIS_BOUNDARY_VIOLATION", `${label} must be ${expected}`);
  }
}

function uniqueStringArray(value, label, minItems, maxItems) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw synthesisError("RESEARCH_DEEP_RESEARCH_SYNTHESIS_INVALID_INPUT", `${label} must contain ${minItems}-${maxItems} items`);
  }
  const items = value.map((item) => requireString(item, label));
  if (new Set(items).size !== items.length) {
    throw synthesisError("RESEARCH_DEEP_RESEARCH_SYNTHESIS_INVALID_INPUT", `${label} must be unique`);
  }
  return items;
}

function uniqueBoundedStringArray(value, label, minItems, maxItems, minLength, maxLength) {
  return uniqueStringArray(value, label, minItems, maxItems)
    .map((item) => requireBoundedString(item, `${label}[]`, minLength, maxLength));
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw synthesisError("RESEARCH_DEEP_RESEARCH_SYNTHESIS_INVALID_INPUT", `${label} must be an object`);
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

function synthesisError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
