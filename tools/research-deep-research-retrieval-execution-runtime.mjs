import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_RUNTIME_ID = "research_deep_research_retrieval_execution_runtime";
export const RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_COMMAND_PORT = "DeepResearchRetrievalExecutionPort.recordDeepResearchRetrievalExecution";
export const RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_READ_PORT = "DeepResearchRetrievalReadPort.retrieveApprovedSources";
export const RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_READY = "RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_READY";

const inputSchemaVersion = "2026-06-05.research.deep-research-retrieval-execution.v1";
const outputSchemaVersion = "2026-06-05.research.deep-research-retrieval-execution-recorded.v1";
const retrievalPlanOutputSchemaVersion = "2026-06-05.research.deep-research-retrieval-plan-recorded.v1";
const defaultCommandLogPath = "reports/research-command-log/deep-research-retrieval-execution.jsonl";
const allowedClassifications = new Set(["PUBLIC", "PRIVATE"]);
const allowedSourceKinds = new Set(["PUBLIC_KNOWLEDGE", "PRIVATE_KNOWLEDGE"]);
const allowedRetrievedBy = new Set(["DIRECTORY_INDEX", "VECTOR_SEARCH", "KEYWORD_FALLBACK"]);

export async function recordDeepResearchRetrievalExecution(input, options = {}) {
  const recordedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const readPort = options.readPort;
  if (!readPort || typeof readPort.retrieveApprovedSources !== "function") {
    throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_MISSING_READ_PORT", "DeepResearchRetrievalReadPort.retrieveApprovedSources is required");
  }

  const commandLogPath = options.commandLogPath ?? defaultCommandLogPath;
  const existing = findExistingRecordByIdempotencyKey(commandLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const rawResult = await readPort.retrieveApprovedSources(buildReadPortRequest(normalized));
  const retrievalResult = assertRetrievalResult(rawResult, normalized);
  const record = buildCommandRecord(normalized, retrievalResult, recordedAt);
  appendCommandRecord(commandLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatDeepResearchRetrievalExecution(result) {
  return [
    `Research deep_research retrieval execution: ${result.status}`,
    `Read port: ${result.readPort}`,
    `Job: ${result.job.jobId}`,
    `Chunks: ${result.retrievalResult.chunkCount}`,
    `Final answer generated: ${result.boundary.finalAnswerGenerated}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const executionInvocationId = requireString(input.executionInvocationId, "input.executionInvocationId");
  const principal = assertPrincipal(input.principal);
  const retrievalPlanRecord = assertRetrievalPlanRecord(input.retrievalPlanRecord);
  const executionPolicy = assertExecutionPolicy(input.executionPolicy);
  const readPortDescriptor = assertReadPortDescriptor(input.readPortDescriptor);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 80);
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 220);
  const planExecutionHash = hashInput({
    executionInvocationId,
    principalId: principal.principalId,
    jobId: retrievalPlanRecord.job.jobId,
    sourcePlan: retrievalPlanRecord.retrievalPlan.sourcePlan,
    budget: retrievalPlanRecord.retrievalPlan.budget,
    executionPolicy,
    readPortDescriptor,
  });
  return {
    executionInvocationId,
    principal,
    retrievalPlanRecord,
    executionPolicy,
    readPortDescriptor,
    evidenceRefs,
    idempotencyKey,
    planExecutionHash,
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
  const isService = role === "SERVICE" && subjectType === "SERVICE" && entryPoint === "AGENT_INTERNAL";
  const isAdmin = role === "ADMIN" && scopes.includes("ADMIN_SYSTEM");
  if (!isService && !isAdmin) {
    throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_FORBIDDEN_PRINCIPAL", "retrieval execution must be recorded by an internal service or admin");
  }
  if (!hasAny(scopes, ["AGENT_COMMAND_SUBMIT", "ADMIN_SYSTEM"])) {
    throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_MISSING_COMMAND_SCOPE", "AGENT_COMMAND_SUBMIT or ADMIN_SYSTEM scope is required");
  }
  if (!hasAny(scopes, ["RESEARCH_READ", "ADMIN_SYSTEM"])) {
    throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_MISSING_RESEARCH_SCOPE", "RESEARCH_READ or ADMIN_SYSTEM scope is required");
  }
  if (!hasAny(scopes, ["KNOWLEDGE_PRIVATE_READ", "ADMIN_SYSTEM"])) {
    throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_MISSING_PRIVATE_SCOPE", "KNOWLEDGE_PRIVATE_READ or ADMIN_SYSTEM scope is required");
  }
  return { principalId, role, subjectType, entryPoint, sessionId, scopes };
}

function assertRetrievalPlanRecord(record) {
  assertPlainObject(record, "input.retrievalPlanRecord");
  requireConst(record.schemaVersion, retrievalPlanOutputSchemaVersion, "input.retrievalPlanRecord.schemaVersion");
  requireConst(record.runtimeId, "research_deep_research_retrieval_plan_runtime", "input.retrievalPlanRecord.runtimeId");
  requireConst(record.commandPort, "DeepResearchRetrievalPlanPort.recordDeepResearchRetrievalPlan", "input.retrievalPlanRecord.commandPort");
  requireConst(record.status, "RETRIEVAL_PLAN_RECORDED", "input.retrievalPlanRecord.status");
  const job = assertJob(record.job);
  const worker = assertWorker(record.worker);
  const approval = assertApproval(record.approval);
  const retrievalPlan = assertPlan(record.retrievalPlan);
  const evidenceRefs = uniqueStringArray(record.evidenceRefs, "input.retrievalPlanRecord.evidenceRefs", 1, 120);
  assertPlanBoundary(record.boundary);
  return { ...record, job, worker, approval, retrievalPlan, evidenceRefs };
}

function assertJob(job) {
  assertPlainObject(job, "input.retrievalPlanRecord.job");
  const taskId = requireString(job.taskId, "input.retrievalPlanRecord.job.taskId");
  const contextRef = requireString(job.contextRef, "input.retrievalPlanRecord.job.contextRef");
  const jobId = requireString(job.jobId, "input.retrievalPlanRecord.job.jobId");
  requireConst(job.queueName, "research_deep_research", "input.retrievalPlanRecord.job.queueName");
  return { taskId, contextRef, jobId, queueName: "research_deep_research" };
}

function assertWorker(worker) {
  assertPlainObject(worker, "input.retrievalPlanRecord.worker");
  const workerId = requireString(worker.workerId, "input.retrievalPlanRecord.worker.workerId");
  requireConst(worker.nodeType, "LOCAL", "input.retrievalPlanRecord.worker.nodeType");
  const capabilityKinds = uniqueStringArray(worker.capabilityKinds, "input.retrievalPlanRecord.worker.capabilityKinds", 1, 8);
  if (!capabilityKinds.includes("RAG_RETRIEVAL")) {
    throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_MISSING_RAG_CAPABILITY", "RAG_RETRIEVAL capability is required");
  }
  return { workerId, nodeType: "LOCAL", capabilityKinds };
}

function assertApproval(approval) {
  assertPlainObject(approval, "input.retrievalPlanRecord.approval");
  const approvalId = requireString(approval.approvalId, "input.retrievalPlanRecord.approval.approvalId");
  const approvalRecordRef = requireString(approval.approvalRecordRef, "input.retrievalPlanRecord.approval.approvalRecordRef");
  const reviewerPrincipalId = requireString(approval.reviewerPrincipalId, "input.retrievalPlanRecord.approval.reviewerPrincipalId");
  requireConst(approval.decision, "APPROVED_FOR_ASYNC", "input.retrievalPlanRecord.approval.decision");
  return { approvalId, approvalRecordRef, reviewerPrincipalId, decision: "APPROVED_FOR_ASYNC" };
}

function assertPlan(plan) {
  assertPlainObject(plan, "input.retrievalPlanRecord.retrievalPlan");
  requireConst(plan.strategy, "DIRECTORY_INDEX_THEN_VECTOR_RAG", "input.retrievalPlanRecord.retrievalPlan.strategy");
  requireConst(plan.planningOnly, true, "input.retrievalPlanRecord.retrievalPlan.planningOnly");
  const budget = assertBudget(plan.budget);
  const sourcePlan = assertSourcePlan(plan.sourcePlan, budget);
  assertPlainObject(plan.citationPolicy, "input.retrievalPlanRecord.retrievalPlan.citationPolicy");
  requireConst(plan.citationPolicy.citationRequired, true, "input.retrievalPlanRecord.retrievalPlan.citationPolicy.citationRequired");
  requireConst(plan.citationPolicy.sourceHashRequired, true, "input.retrievalPlanRecord.retrievalPlan.citationPolicy.sourceHashRequired");
  requireConst(plan.citationPolicy.quoteScope, "RETRIEVED_SOURCE_ONLY", "input.retrievalPlanRecord.retrievalPlan.citationPolicy.quoteScope");
  return {
    strategy: "DIRECTORY_INDEX_THEN_VECTOR_RAG",
    planningOnly: true,
    sourcePlan,
    budget,
    citationPolicy: {
      citationRequired: true,
      sourceHashRequired: true,
      quoteScope: "RETRIEVED_SOURCE_ONLY",
    },
  };
}

function assertBudget(budget) {
  assertPlainObject(budget, "input.retrievalPlanRecord.retrievalPlan.budget");
  return {
    maxPlannedQueries: requireIntegerBetween(budget.maxPlannedQueries, "input.retrievalPlanRecord.retrievalPlan.budget.maxPlannedQueries", 1, 16),
    maxRetrievedChunks: requireIntegerBetween(budget.maxRetrievedChunks, "input.retrievalPlanRecord.retrievalPlan.budget.maxRetrievedChunks", 1, 120),
    maxSourceRefs: requireIntegerBetween(budget.maxSourceRefs, "input.retrievalPlanRecord.retrievalPlan.budget.maxSourceRefs", 1, 50),
    p99PlanningBudgetMs: requireIntegerBetween(budget.p99PlanningBudgetMs, "input.retrievalPlanRecord.retrievalPlan.budget.p99PlanningBudgetMs", 1, 50),
  };
}

function assertSourcePlan(sourcePlan, budget) {
  if (!Array.isArray(sourcePlan) || sourcePlan.length < 1 || sourcePlan.length > 12) {
    throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_INVALID_INPUT", "sourcePlan must contain 1-12 items");
  }
  if (sourcePlan.length > budget.maxPlannedQueries) {
    throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_BUDGET_EXCEEDED", "sourcePlan exceeds maxPlannedQueries");
  }
  const seenIds = new Set();
  const normalized = sourcePlan.map((item, index) => assertSourcePlanItem(item, index));
  for (const item of normalized) {
    if (seenIds.has(item.planItemId)) {
      throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_INVALID_INPUT", "sourcePlan planItemId values must be unique");
    }
    seenIds.add(item.planItemId);
  }
  return normalized;
}

function assertSourcePlanItem(item, index) {
  assertPlainObject(item, `input.retrievalPlanRecord.retrievalPlan.sourcePlan[${index}]`);
  const classification = requireEnum(item.classification, `input.retrievalPlanRecord.retrievalPlan.sourcePlan[${index}].classification`, [...allowedClassifications]);
  requireConst(item.citationRequired, true, `input.retrievalPlanRecord.retrievalPlan.sourcePlan[${index}].citationRequired`);
  requireConst(item.sourceHashRequired, true, `input.retrievalPlanRecord.retrievalPlan.sourcePlan[${index}].sourceHashRequired`);
  return {
    planItemId: requireBoundedString(item.planItemId, `input.retrievalPlanRecord.retrievalPlan.sourcePlan[${index}].planItemId`, 1, 120),
    knowledgeBaseRef: requireBoundedString(item.knowledgeBaseRef, `input.retrievalPlanRecord.retrievalPlan.sourcePlan[${index}].knowledgeBaseRef`, 1, 200),
    classification,
    retrievalMode: requireString(item.retrievalMode, `input.retrievalPlanRecord.retrievalPlan.sourcePlan[${index}].retrievalMode`),
    plannedQuery: requireBoundedString(item.plannedQuery, `input.retrievalPlanRecord.retrievalPlan.sourcePlan[${index}].plannedQuery`, 1, 800),
    directoryScopeRefs: uniqueBoundedStringArray(item.directoryScopeRefs, `input.retrievalPlanRecord.retrievalPlan.sourcePlan[${index}].directoryScopeRefs`, 1, 8, 1, 200),
    maxChunks: requireIntegerBetween(item.maxChunks, `input.retrievalPlanRecord.retrievalPlan.sourcePlan[${index}].maxChunks`, 1, 40),
    maxSourceRefs: requireIntegerBetween(item.maxSourceRefs, `input.retrievalPlanRecord.retrievalPlan.sourcePlan[${index}].maxSourceRefs`, 1, 20),
    citationRequired: true,
    sourceHashRequired: true,
  };
}

function assertPlanBoundary(boundary) {
  assertPlainObject(boundary, "input.retrievalPlanRecord.boundary");
  requireConst(boundary.retrievalPlanRecorded, true, "input.retrievalPlanRecord.boundary.retrievalPlanRecorded");
  requireConst(boundary.retrievalExecuted, false, "input.retrievalPlanRecord.boundary.retrievalExecuted");
  requireConst(boundary.externalModelCallStarted, false, "input.retrievalPlanRecord.boundary.externalModelCallStarted");
  requireConst(boundary.ragSynthesisStarted, false, "input.retrievalPlanRecord.boundary.ragSynthesisStarted");
  requireConst(boundary.finalAnswerGenerated, false, "input.retrievalPlanRecord.boundary.finalAnswerGenerated");
  requireConst(boundary.studentArchiveUsed, false, "input.retrievalPlanRecord.boundary.studentArchiveUsed");
  requireConst(boundary.remoteDeviceSourcesUsed, false, "input.retrievalPlanRecord.boundary.remoteDeviceSourcesUsed");
}

function assertExecutionPolicy(policy) {
  assertPlainObject(policy, "input.executionPolicy");
  requireConst(policy.executeRetrievalNow, true, "input.executionPolicy.executeRetrievalNow");
  requireConst(policy.directoryIndexAccessAllowed, true, "input.executionPolicy.directoryIndexAccessAllowed");
  requireConst(policy.vectorSearchAllowed, true, "input.executionPolicy.vectorSearchAllowed");
  requireConst(policy.directDatabaseAccessAllowed, false, "input.executionPolicy.directDatabaseAccessAllowed");
  requireConst(policy.writeAllowed, false, "input.executionPolicy.writeAllowed");
  requireConst(policy.studentArchiveAllowed, false, "input.executionPolicy.studentArchiveAllowed");
  requireConst(policy.remoteDeviceSourcesAllowed, false, "input.executionPolicy.remoteDeviceSourcesAllowed");
  requireConst(policy.externalModelCallAllowed, false, "input.executionPolicy.externalModelCallAllowed");
  requireConst(policy.ragSynthesisAllowed, false, "input.executionPolicy.ragSynthesisAllowed");
  requireConst(policy.finalAnswerNowAllowed, false, "input.executionPolicy.finalAnswerNowAllowed");
  requireConst(policy.citationRequired, true, "input.executionPolicy.citationRequired");
  requireConst(policy.sourceHashRequired, true, "input.executionPolicy.sourceHashRequired");
  return {
    executeRetrievalNow: true,
    directoryIndexAccessAllowed: true,
    vectorSearchAllowed: true,
    directDatabaseAccessAllowed: false,
    writeAllowed: false,
    studentArchiveAllowed: false,
    remoteDeviceSourcesAllowed: false,
    externalModelCallAllowed: false,
    ragSynthesisAllowed: false,
    finalAnswerNowAllowed: false,
    citationRequired: true,
    sourceHashRequired: true,
  };
}

function assertReadPortDescriptor(descriptor) {
  assertPlainObject(descriptor, "input.readPortDescriptor");
  requireConst(descriptor.portName, "DeepResearchRetrievalReadPort", "input.readPortDescriptor.portName");
  requireConst(descriptor.operation, "retrieveApprovedSources", "input.readPortDescriptor.operation");
  requireConst(descriptor.directDatabaseAccess, false, "input.readPortDescriptor.directDatabaseAccess");
  requireConst(descriptor.writeAllowed, false, "input.readPortDescriptor.writeAllowed");
  return {
    portName: "DeepResearchRetrievalReadPort",
    operation: "retrieveApprovedSources",
    directDatabaseAccess: false,
    writeAllowed: false,
  };
}

function buildReadPortRequest(normalized) {
  return {
    job: normalized.retrievalPlanRecord.job,
    worker: normalized.retrievalPlanRecord.worker,
    approval: normalized.retrievalPlanRecord.approval,
    retrievalPlan: normalized.retrievalPlanRecord.retrievalPlan,
    executionPolicy: normalized.executionPolicy,
    evidenceRefs: normalized.evidenceRefs,
  };
}

function assertRetrievalResult(result, normalized) {
  assertPlainObject(result, "readPort.retrieveApprovedSources result");
  requireConst(result.retrievalExecuted, true, "readPort.retrieveApprovedSources result.retrievalExecuted");
  const items = assertResultItems(result.items, normalized);
  const chunkCount = items.reduce((total, item) => total + item.chunks.length, 0);
  const sourceRefs = new Set(items.flatMap((item) => item.chunks.map((chunk) => chunk.sourceRef)));
  if (chunkCount < 1) {
    throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_EMPTY_RESULT", "retrieval execution must return at least one chunk");
  }
  if (chunkCount > normalized.retrievalPlanRecord.retrievalPlan.budget.maxRetrievedChunks ||
    sourceRefs.size > normalized.retrievalPlanRecord.retrievalPlan.budget.maxSourceRefs) {
    throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_BUDGET_EXCEEDED", "retrieval execution exceeded approved chunk or source-ref budget");
  }
  return {
    retrievalExecuted: true,
    chunkCount,
    sourceRefCount: sourceRefs.size,
    items,
  };
}

function assertResultItems(items, normalized) {
  if (!Array.isArray(items) || items.length < 1) {
    throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_INVALID_RESULT", "retrieval result items must be a non-empty array");
  }
  const plannedById = new Map(normalized.retrievalPlanRecord.retrievalPlan.sourcePlan.map((item) => [item.planItemId, item]));
  return items.map((item, index) => {
    assertPlainObject(item, `readPort.retrieveApprovedSources result.items[${index}]`);
    const planItemId = requireString(item.planItemId, `readPort.retrieveApprovedSources result.items[${index}].planItemId`);
    const planned = plannedById.get(planItemId);
    if (!planned) {
      throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_UNPLANNED_SOURCE", `planItemId ${planItemId} was not approved`);
    }
    const knowledgeBaseRef = requireString(item.knowledgeBaseRef, `readPort.retrieveApprovedSources result.items[${index}].knowledgeBaseRef`);
    const classification = requireEnum(item.classification, `readPort.retrieveApprovedSources result.items[${index}].classification`, [...allowedClassifications]);
    if (knowledgeBaseRef !== planned.knowledgeBaseRef || classification !== planned.classification) {
      throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_SOURCE_OUT_OF_POLICY", `result item ${planItemId} does not match the approved source policy`);
    }
    const chunks = assertChunks(item.chunks, planned, index);
    return {
      planItemId,
      knowledgeBaseRef,
      classification,
      chunks,
    };
  });
}

function assertChunks(chunks, planned, itemIndex) {
  if (!Array.isArray(chunks) || chunks.length < 1 || chunks.length > planned.maxChunks) {
    throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_BUDGET_EXCEEDED", `chunks for ${planned.planItemId} must contain 1-${planned.maxChunks} items`);
  }
  const sourceRefs = new Set();
  const normalized = chunks.map((chunk, chunkIndex) => {
    assertPlainObject(chunk, `readPort.retrieveApprovedSources result.items[${itemIndex}].chunks[${chunkIndex}]`);
    const sourceRef = requireString(chunk.sourceRef, `readPort.retrieveApprovedSources result.items[${itemIndex}].chunks[${chunkIndex}].sourceRef`);
    sourceRefs.add(sourceRef);
    const sourceKind = requireEnum(chunk.sourceKind, `readPort.retrieveApprovedSources result.items[${itemIndex}].chunks[${chunkIndex}].sourceKind`, [...allowedSourceKinds]);
    if (planned.classification === "PUBLIC" && sourceKind !== "PUBLIC_KNOWLEDGE") {
      throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_SOURCE_OUT_OF_POLICY", "PUBLIC plan items must return PUBLIC_KNOWLEDGE chunks");
    }
    if (planned.classification === "PRIVATE" && sourceKind !== "PRIVATE_KNOWLEDGE") {
      throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_SOURCE_OUT_OF_POLICY", "PRIVATE plan items must return PRIVATE_KNOWLEDGE chunks");
    }
    const sourceHash = requireString(chunk.sourceHash, `readPort.retrieveApprovedSources result.items[${itemIndex}].chunks[${chunkIndex}].sourceHash`);
    if (!/^sha256:[a-f0-9]{64}$/u.test(sourceHash)) {
      throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_MISSING_SOURCE_HASH", "sourceHash must be a sha256 digest");
    }
    const citation = requireBoundedString(chunk.citation, `readPort.retrieveApprovedSources result.items[${itemIndex}].chunks[${chunkIndex}].citation`, 4, 400);
    const retrievedBy = requireEnum(chunk.retrievedBy, `readPort.retrieveApprovedSources result.items[${itemIndex}].chunks[${chunkIndex}].retrievedBy`, [...allowedRetrievedBy]);
    requireConst(chunk.localOnly, true, `readPort.retrieveApprovedSources result.items[${itemIndex}].chunks[${chunkIndex}].localOnly`);
    return {
      chunkId: requireBoundedString(chunk.chunkId, `readPort.retrieveApprovedSources result.items[${itemIndex}].chunks[${chunkIndex}].chunkId`, 1, 160),
      sourceRef,
      sourceKind,
      sourceTitle: requireBoundedString(chunk.sourceTitle, `readPort.retrieveApprovedSources result.items[${itemIndex}].chunks[${chunkIndex}].sourceTitle`, 1, 240),
      citation,
      sourceHash,
      retrievedBy,
      localOnly: true,
      score: requireNumberBetween(chunk.score, `readPort.retrieveApprovedSources result.items[${itemIndex}].chunks[${chunkIndex}].score`, 0, 1),
      excerpt: requireBoundedString(chunk.excerpt, `readPort.retrieveApprovedSources result.items[${itemIndex}].chunks[${chunkIndex}].excerpt`, 1, 1200),
    };
  });
  if (sourceRefs.size > planned.maxSourceRefs) {
    throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_BUDGET_EXCEEDED", `source refs for ${planned.planItemId} exceed maxSourceRefs`);
  }
  return normalized;
}

function buildCommandRecord(normalized, retrievalResult, recordedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION",
    recordId: `research_deep_research_retrieval_execution_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    commandPort: RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_COMMAND_PORT,
    readPort: RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_READ_PORT,
    status: "RETRIEVAL_EXECUTION_RECORDED",
    executionInvocationId: normalized.executionInvocationId,
    job: normalized.retrievalPlanRecord.job,
    worker: normalized.retrievalPlanRecord.worker,
    approval: normalized.retrievalPlanRecord.approval,
    retrievalResult,
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.retrievalPlanRecord.evidenceRefs,
        ...retrievalResult.items.flatMap((item) => item.chunks.map((chunk) => `evidence:retrieval-source-hash:${chunk.sourceHash}`)),
        `evidence:retrieval-execution-hash:${normalized.planExecutionHash}`,
        `evidence:runtime:${RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_RUNTIME_ID}`,
        `evidence:command-port:${RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_COMMAND_PORT}`,
        `evidence:read-port:${RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_READ_PORT}`,
      ]),
      idempotencyKey: normalized.idempotencyKey,
      planExecutionHash: normalized.planExecutionHash,
    },
    boundary: buildBoundary(retrievalResult),
  };
}

function buildResult(record, options) {
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_RUNTIME_ID,
    commandPort: record.commandPort,
    readPort: record.readPort,
    status: record.status,
    recordId: record.recordId,
    recordedAt: record.recordedAt,
    idempotencyKey: record.evidence.idempotencyKey,
    idempotentReplay: options.idempotentReplay === true,
    job: record.job,
    retrievalResult: record.retrievalResult,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 300,
      evidenceClass: "ASYNC_DEEP_RESEARCH_RETRIEVAL_EXECUTION_BOUNDARY",
    },
    nextAction: "Use these cited retrieval chunks as input to a future approved reasoning slice; do not publish a final answer from retrieval evidence alone.",
  };
}

function buildBoundary(retrievalResult) {
  return {
    approvalVerified: true,
    workerClaimVerified: true,
    retrievalPlanVerified: true,
    retrievalExecuted: true,
    directoryIndexAccessUsed: retrievalResult.items.some((item) => item.chunks.some((chunk) => chunk.retrievedBy === "DIRECTORY_INDEX")),
    vectorSearchMayHaveBeenUsed: retrievalResult.items.some((item) => item.chunks.some((chunk) => chunk.retrievedBy === "VECTOR_SEARCH")),
    externalModelCallStarted: false,
    ragSynthesisStarted: false,
    finalAnswerGenerated: false,
    directPublicationAllowed: false,
    localToolMutationAllowed: false,
    directMainDatabaseWriteAllowed: false,
    studentArchiveUsed: false,
    remoteDeviceSourcesUsed: false,
    swarmAllowed: false,
    requiresFutureReasoningSlice: true,
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
    if (record?.recordType === "RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.executionInvocationId !== normalized.executionInvocationId ||
    existing.job?.jobId !== normalized.retrievalPlanRecord.job.jobId ||
    existing.evidence?.planExecutionHash !== normalized.planExecutionHash) {
    throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different retrieval execution");
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireBoundedString(value, label, minLength, maxLength) {
  const text = requireString(value, label);
  if (text.length < minLength || text.length > maxLength) {
    throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_INVALID_INPUT", `${label} length must be ${minLength}-${maxLength}`);
  }
  return text;
}

function requireEnum(value, label, allowed) {
  const text = requireString(value, label);
  if (!allowed.includes(text)) {
    throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_INVALID_INPUT", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_INVALID_INPUT", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireNumberBetween(value, label, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_INVALID_INPUT", `${label} must be a number between ${min} and ${max}`);
  }
  return value;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_BOUNDARY_VIOLATION", `${label} must be ${expected}`);
  }
}

function uniqueStringArray(value, label, minItems, maxItems) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_INVALID_INPUT", `${label} must contain ${minItems}-${maxItems} items`);
  }
  const items = value.map((item) => requireString(item, label));
  if (new Set(items).size !== items.length) {
    throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_INVALID_INPUT", `${label} must be unique`);
  }
  return items;
}

function uniqueBoundedStringArray(value, label, minItems, maxItems, minLength, maxLength) {
  return uniqueStringArray(value, label, minItems, maxItems)
    .map((item) => requireBoundedString(item, `${label}[]`, minLength, maxLength));
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw retrievalExecutionError("RESEARCH_DEEP_RESEARCH_EXECUTION_INVALID_INPUT", `${label} must be an object`);
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

function retrievalExecutionError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
