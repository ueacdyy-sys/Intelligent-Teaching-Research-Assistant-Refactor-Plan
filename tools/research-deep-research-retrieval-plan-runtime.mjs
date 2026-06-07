import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN_RUNTIME_ID = "research_deep_research_retrieval_plan_runtime";
export const RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN_COMMAND_PORT = "DeepResearchRetrievalPlanPort.recordDeepResearchRetrievalPlan";
export const RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN_READY = "RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN_READY";

const inputSchemaVersion = "2026-06-05.research.deep-research-retrieval-plan.v1";
const outputSchemaVersion = "2026-06-05.research.deep-research-retrieval-plan-recorded.v1";
const workerLifecycleSchemaVersion = "2026-06-05.research.deep-research-worker-lifecycle-recorded.v1";
const defaultCommandLogPath = "reports/research-command-log/deep-research-retrieval-plan.jsonl";
const allowedClassifications = new Set(["PUBLIC", "PRIVATE"]);
const allowedRetrievalModes = new Set(["DIRECTORY_THEN_VECTOR", "DIRECTORY_ONLY", "VECTOR_ONLY", "KEYWORD_FALLBACK"]);

export function recordDeepResearchRetrievalPlan(input, options = {}) {
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

export function formatDeepResearchRetrievalPlan(result) {
  return [
    `Research deep_research retrieval plan: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Job: ${result.job.jobId}`,
    `Source plan items: ${result.retrievalPlan.sourcePlan.length}`,
    `Retrieval executed: ${result.boundary.retrievalExecuted}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const planningInvocationId = requireString(input.planningInvocationId, "input.planningInvocationId");
  const principal = assertPrincipal(input.principal);
  const workerLifecycle = assertWorkerLifecycle(input.workerLifecycle);
  const sourcePolicy = assertSourcePolicy(input.sourcePolicy);
  const retrievalPolicy = assertRetrievalPolicy(input.retrievalPolicy);
  const researchQuestion = requireBoundedString(input.researchQuestion, "input.researchQuestion", 8, 1200);
  const objectives = uniqueBoundedStringArray(input.objectives, "input.objectives", 1, 8, 1, 240);
  const budget = assertBudget(input.budget);
  const sourcePlan = assertSourcePlan(input.sourcePlan, sourcePolicy, budget);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 80);
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 220);
  const planHash = hashInput({
    planningInvocationId,
    taskId: workerLifecycle.job.taskId,
    contextRef: workerLifecycle.job.contextRef,
    jobId: workerLifecycle.job.jobId,
    workerId: workerLifecycle.worker.workerId,
    sourcePolicy,
    retrievalPolicy,
    researchQuestion,
    objectives,
    sourcePlan,
    budget,
  });
  return {
    planningInvocationId,
    principal,
    workerLifecycle,
    sourcePolicy,
    retrievalPolicy,
    researchQuestion,
    objectives,
    sourcePlan,
    budget,
    evidenceRefs,
    idempotencyKey,
    planHash,
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
    throw retrievalPlanError("RESEARCH_DEEP_RESEARCH_PLAN_FORBIDDEN_PRINCIPAL", "retrieval planning must be recorded by an internal service or admin");
  }
  if (!hasAny(scopes, ["AGENT_COMMAND_SUBMIT", "ADMIN_SYSTEM"])) {
    throw retrievalPlanError("RESEARCH_DEEP_RESEARCH_PLAN_MISSING_COMMAND_SCOPE", "AGENT_COMMAND_SUBMIT or ADMIN_SYSTEM scope is required");
  }
  if (!hasAny(scopes, ["RESEARCH_READ", "ADMIN_SYSTEM"])) {
    throw retrievalPlanError("RESEARCH_DEEP_RESEARCH_PLAN_MISSING_RESEARCH_SCOPE", "RESEARCH_READ or ADMIN_SYSTEM scope is required");
  }
  if (!hasAny(scopes, ["KNOWLEDGE_PRIVATE_READ", "ADMIN_SYSTEM"])) {
    throw retrievalPlanError("RESEARCH_DEEP_RESEARCH_PLAN_MISSING_PRIVATE_SCOPE", "KNOWLEDGE_PRIVATE_READ or ADMIN_SYSTEM scope is required");
  }
  return { principalId, role, subjectType, entryPoint, sessionId, scopes };
}

function assertWorkerLifecycle(workerLifecycle) {
  assertPlainObject(workerLifecycle, "input.workerLifecycle");
  requireConst(workerLifecycle.schemaVersion, workerLifecycleSchemaVersion, "input.workerLifecycle.schemaVersion");
  requireConst(workerLifecycle.runtimeId, "research_deep_research_worker_lifecycle_runtime", "input.workerLifecycle.runtimeId");
  requireConst(workerLifecycle.status, "CLAIMED_FOR_ASYNC_EXECUTION", "input.workerLifecycle.status");
  const job = assertLifecycleJob(workerLifecycle.job);
  const approval = assertLifecycleApproval(workerLifecycle.approval);
  const worker = assertLifecycleWorker(workerLifecycle.worker);
  assertPlainObject(workerLifecycle.lifecycle, "input.workerLifecycle.lifecycle");
  requireConst(workerLifecycle.lifecycle.toStatus, "CLAIMED", "input.workerLifecycle.lifecycle.toStatus");
  assertLifecycleBoundary(workerLifecycle.boundary);
  return { ...workerLifecycle, job, approval, worker };
}

function assertLifecycleJob(job) {
  assertPlainObject(job, "input.workerLifecycle.job");
  const taskId = requireString(job.taskId, "input.workerLifecycle.job.taskId");
  const contextRef = requireString(job.contextRef, "input.workerLifecycle.job.contextRef");
  const jobId = requireString(job.jobId, "input.workerLifecycle.job.jobId");
  requireConst(job.queueName, "research_deep_research", "input.workerLifecycle.job.queueName");
  return { taskId, contextRef, jobId, queueName: "research_deep_research" };
}

function assertLifecycleApproval(approval) {
  assertPlainObject(approval, "input.workerLifecycle.approval");
  const approvalId = requireString(approval.approvalId, "input.workerLifecycle.approval.approvalId");
  const approvalRecordRef = requireString(approval.approvalRecordRef, "input.workerLifecycle.approval.approvalRecordRef");
  const reviewerPrincipalId = requireString(approval.reviewerPrincipalId, "input.workerLifecycle.approval.reviewerPrincipalId");
  requireConst(approval.decision, "APPROVED_FOR_ASYNC", "input.workerLifecycle.approval.decision");
  return { approvalId, approvalRecordRef, reviewerPrincipalId, decision: "APPROVED_FOR_ASYNC" };
}

function assertLifecycleWorker(worker) {
  assertPlainObject(worker, "input.workerLifecycle.worker");
  const workerId = requireString(worker.workerId, "input.workerLifecycle.worker.workerId");
  requireConst(worker.nodeType, "LOCAL", "input.workerLifecycle.worker.nodeType");
  const capabilityKinds = uniqueStringArray(worker.capabilityKinds, "input.workerLifecycle.worker.capabilityKinds", 1, 8);
  if (!capabilityKinds.includes("RAG_RETRIEVAL")) {
    throw retrievalPlanError("RESEARCH_DEEP_RESEARCH_PLAN_MISSING_RAG_CAPABILITY", "RAG_RETRIEVAL capability is required for retrieval planning");
  }
  return { workerId, nodeType: "LOCAL", capabilityKinds };
}

function assertLifecycleBoundary(boundary) {
  assertPlainObject(boundary, "input.workerLifecycle.boundary");
  requireConst(boundary.approvalVerified, true, "input.workerLifecycle.boundary.approvalVerified");
  requireConst(boundary.workerClaimRecorded, true, "input.workerLifecycle.boundary.workerClaimRecorded");
  requireConst(boundary.executionStarted, false, "input.workerLifecycle.boundary.executionStarted");
  requireConst(boundary.ragRetrievalStarted, false, "input.workerLifecycle.boundary.ragRetrievalStarted");
  requireConst(boundary.externalModelCallStarted, false, "input.workerLifecycle.boundary.externalModelCallStarted");
  requireConst(boundary.finalAnswerGenerated, false, "input.workerLifecycle.boundary.finalAnswerGenerated");
  requireConst(boundary.requiresFutureExecutionSlice, true, "input.workerLifecycle.boundary.requiresFutureExecutionSlice");
}

function assertSourcePolicy(sourcePolicy) {
  assertPlainObject(sourcePolicy, "input.sourcePolicy");
  const allowed = uniqueStringArray(sourcePolicy.allowedClassifications, "input.sourcePolicy.allowedClassifications", 1, 2)
    .map((classification) => requireEnum(classification, "input.sourcePolicy.allowedClassifications[]", [...allowedClassifications]));
  requireConst(sourcePolicy.includeStudentArchive, false, "input.sourcePolicy.includeStudentArchive");
  requireConst(sourcePolicy.includeRemoteDeviceSources, false, "input.sourcePolicy.includeRemoteDeviceSources");
  requireConst(sourcePolicy.directDatabaseAccessAllowed, false, "input.sourcePolicy.directDatabaseAccessAllowed");
  const knowledgeBaseRefs = uniqueBoundedStringArray(sourcePolicy.knowledgeBaseRefs, "input.sourcePolicy.knowledgeBaseRefs", 1, 12, 1, 200);
  return {
    allowedClassifications: allowed,
    includeStudentArchive: false,
    includeRemoteDeviceSources: false,
    directDatabaseAccessAllowed: false,
    knowledgeBaseRefs,
  };
}

function assertRetrievalPolicy(policy) {
  assertPlainObject(policy, "input.retrievalPolicy");
  requireConst(policy.planningOnly, true, "input.retrievalPolicy.planningOnly");
  requireConst(policy.executeRetrievalNow, false, "input.retrievalPolicy.executeRetrievalNow");
  requireConst(policy.directoryIndexFirst, true, "input.retrievalPolicy.directoryIndexFirst");
  requireConst(policy.vectorSearchNow, false, "input.retrievalPolicy.vectorSearchNow");
  requireConst(policy.externalModelCallNow, false, "input.retrievalPolicy.externalModelCallNow");
  requireConst(policy.ragSynthesisNow, false, "input.retrievalPolicy.ragSynthesisNow");
  requireConst(policy.finalAnswerNowAllowed, false, "input.retrievalPolicy.finalAnswerNowAllowed");
  requireConst(policy.citationRequired, true, "input.retrievalPolicy.citationRequired");
  requireConst(policy.sourceHashRequired, true, "input.retrievalPolicy.sourceHashRequired");
  return {
    planningOnly: true,
    executeRetrievalNow: false,
    directoryIndexFirst: true,
    vectorSearchNow: false,
    externalModelCallNow: false,
    ragSynthesisNow: false,
    finalAnswerNowAllowed: false,
    citationRequired: true,
    sourceHashRequired: true,
  };
}

function assertBudget(budget) {
  assertPlainObject(budget, "input.budget");
  return {
    maxPlannedQueries: requireIntegerBetween(budget.maxPlannedQueries, "input.budget.maxPlannedQueries", 1, 16),
    maxRetrievedChunks: requireIntegerBetween(budget.maxRetrievedChunks, "input.budget.maxRetrievedChunks", 3, 120),
    maxSourceRefs: requireIntegerBetween(budget.maxSourceRefs, "input.budget.maxSourceRefs", 3, 50),
    p99PlanningBudgetMs: requireIntegerBetween(budget.p99PlanningBudgetMs, "input.budget.p99PlanningBudgetMs", 1, 50),
  };
}

function assertSourcePlan(sourcePlan, sourcePolicy, budget) {
  if (!Array.isArray(sourcePlan) || sourcePlan.length < 1 || sourcePlan.length > 12) {
    throw retrievalPlanError("RESEARCH_DEEP_RESEARCH_PLAN_INVALID_INPUT", "input.sourcePlan must contain 1-12 items");
  }
  const seenIds = new Set();
  const normalized = sourcePlan.map((item, index) => assertSourcePlanItem(item, index, sourcePolicy));
  for (const item of normalized) {
    if (seenIds.has(item.planItemId)) {
      throw retrievalPlanError("RESEARCH_DEEP_RESEARCH_PLAN_INVALID_INPUT", "sourcePlan planItemId values must be unique");
    }
    seenIds.add(item.planItemId);
  }
  const totalChunks = normalized.reduce((total, item) => total + item.maxChunks, 0);
  const totalSourceRefs = normalized.reduce((total, item) => total + item.maxSourceRefs, 0);
  if (normalized.length > budget.maxPlannedQueries || totalChunks > budget.maxRetrievedChunks || totalSourceRefs > budget.maxSourceRefs) {
    throw retrievalPlanError("RESEARCH_DEEP_RESEARCH_PLAN_BUDGET_EXCEEDED", "retrieval plan exceeds approved query, chunk, or source-ref budget");
  }
  return normalized;
}

function assertSourcePlanItem(item, index, sourcePolicy) {
  assertPlainObject(item, `input.sourcePlan[${index}]`);
  const planItemId = requireBoundedString(item.planItemId, `input.sourcePlan[${index}].planItemId`, 1, 120);
  const knowledgeBaseRef = requireBoundedString(item.knowledgeBaseRef, `input.sourcePlan[${index}].knowledgeBaseRef`, 1, 200);
  if (!sourcePolicy.knowledgeBaseRefs.includes(knowledgeBaseRef)) {
    throw retrievalPlanError("RESEARCH_DEEP_RESEARCH_PLAN_SOURCE_OUT_OF_POLICY", `knowledgeBaseRef ${knowledgeBaseRef} is not approved`);
  }
  const classification = requireEnum(item.classification, `input.sourcePlan[${index}].classification`, [...allowedClassifications]);
  if (!sourcePolicy.allowedClassifications.includes(classification)) {
    throw retrievalPlanError("RESEARCH_DEEP_RESEARCH_PLAN_CLASSIFICATION_OUT_OF_POLICY", `classification ${classification} is not approved`);
  }
  const retrievalMode = requireEnum(item.retrievalMode, `input.sourcePlan[${index}].retrievalMode`, [...allowedRetrievalModes]);
  const plannedQuery = requireBoundedString(item.plannedQuery, `input.sourcePlan[${index}].plannedQuery`, 1, 800);
  const directoryScopeRefs = uniqueBoundedStringArray(item.directoryScopeRefs, `input.sourcePlan[${index}].directoryScopeRefs`, 1, 8, 1, 200);
  requireConst(item.citationRequired, true, `input.sourcePlan[${index}].citationRequired`);
  requireConst(item.sourceHashRequired, true, `input.sourcePlan[${index}].sourceHashRequired`);
  return {
    planItemId,
    knowledgeBaseRef,
    classification,
    retrievalMode,
    plannedQuery,
    directoryScopeRefs,
    maxChunks: requireIntegerBetween(item.maxChunks, `input.sourcePlan[${index}].maxChunks`, 1, 40),
    maxSourceRefs: requireIntegerBetween(item.maxSourceRefs, `input.sourcePlan[${index}].maxSourceRefs`, 1, 20),
    citationRequired: true,
    sourceHashRequired: true,
  };
}

function buildCommandRecord(normalized, recordedAt) {
  return {
    schemaVersion: inputSchemaVersion,
    recordType: "RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN",
    recordId: `research_deep_research_retrieval_plan_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    commandPort: RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN_COMMAND_PORT,
    status: "RETRIEVAL_PLAN_RECORDED",
    planningInvocationId: normalized.planningInvocationId,
    job: normalized.workerLifecycle.job,
    worker: normalized.workerLifecycle.worker,
    approval: normalized.workerLifecycle.approval,
    sourcePolicy: normalized.sourcePolicy,
    retrievalPlan: {
      strategy: "DIRECTORY_INDEX_THEN_VECTOR_RAG",
      planningOnly: true,
      researchQuestion: normalized.researchQuestion,
      objectives: normalized.objectives,
      sourcePlan: normalized.sourcePlan,
      budget: normalized.budget,
      citationPolicy: {
        citationRequired: true,
        sourceHashRequired: true,
        quoteScope: "RETRIEVED_SOURCE_ONLY",
      },
    },
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        `evidence:approval:${normalized.workerLifecycle.approval.approvalId}`,
        `evidence:worker-claim:${normalized.workerLifecycle.job.jobId}`,
        `evidence:retrieval-plan-hash:${normalized.planHash}`,
        `evidence:runtime:${RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN_RUNTIME_ID}`,
        `evidence:command-port:${RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN_COMMAND_PORT}`,
      ]),
      idempotencyKey: normalized.idempotencyKey,
      planHash: normalized.planHash,
    },
    boundary: buildBoundary(),
  };
}

function buildResult(record, options) {
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN_RUNTIME_ID,
    commandPort: record.commandPort,
    status: record.status,
    recordId: record.recordId,
    recordedAt: record.recordedAt,
    idempotencyKey: record.evidence.idempotencyKey,
    idempotentReplay: options.idempotentReplay === true,
    job: record.job,
    worker: record.worker,
    approval: record.approval,
    retrievalPlan: {
      strategy: record.retrievalPlan.strategy,
      planningOnly: true,
      sourcePlan: record.retrievalPlan.sourcePlan,
      budget: record.retrievalPlan.budget,
      citationPolicy: record.retrievalPlan.citationPolicy,
    },
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 50,
      evidenceClass: "ASYNC_DEEP_RESEARCH_RETRIEVAL_PLAN_CONTROL_PLANE",
    },
    nextAction: "Use this approved retrieval plan as the input to a future async retrieval execution slice; do not synthesize or publish an answer from plan evidence alone.",
  };
}

function buildBoundary() {
  return {
    approvalVerified: true,
    workerClaimVerified: true,
    retrievalPlanRecorded: true,
    retrievalExecuted: false,
    directoryIndexAccessStarted: false,
    vectorSearchStarted: false,
    externalModelCallStarted: false,
    ragSynthesisStarted: false,
    finalAnswerGenerated: false,
    directPublicationAllowed: false,
    localToolMutationAllowed: false,
    directMainDatabaseWriteAllowed: false,
    studentArchiveUsed: false,
    remoteDeviceSourcesUsed: false,
    swarmAllowed: false,
    requiresFutureRetrievalExecutionSlice: true,
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
    if (record?.recordType === "RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.planningInvocationId !== normalized.planningInvocationId ||
    existing.job?.jobId !== normalized.workerLifecycle.job.jobId ||
    existing.evidence?.planHash !== normalized.planHash) {
    throw retrievalPlanError("RESEARCH_DEEP_RESEARCH_PLAN_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different retrieval plan");
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw retrievalPlanError("RESEARCH_DEEP_RESEARCH_PLAN_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireBoundedString(value, label, minLength, maxLength) {
  const text = requireString(value, label);
  if (text.length < minLength || text.length > maxLength) {
    throw retrievalPlanError("RESEARCH_DEEP_RESEARCH_PLAN_INVALID_INPUT", `${label} length must be ${minLength}-${maxLength}`);
  }
  return text;
}

function requireEnum(value, label, allowed) {
  const text = requireString(value, label);
  if (!allowed.includes(text)) {
    throw retrievalPlanError("RESEARCH_DEEP_RESEARCH_PLAN_INVALID_INPUT", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw retrievalPlanError("RESEARCH_DEEP_RESEARCH_PLAN_INVALID_INPUT", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw retrievalPlanError("RESEARCH_DEEP_RESEARCH_PLAN_BOUNDARY_VIOLATION", `${label} must be ${expected}`);
  }
}

function uniqueStringArray(value, label, minItems, maxItems) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw retrievalPlanError("RESEARCH_DEEP_RESEARCH_PLAN_INVALID_INPUT", `${label} must contain ${minItems}-${maxItems} items`);
  }
  const items = value.map((item) => requireString(item, label));
  if (new Set(items).size !== items.length) {
    throw retrievalPlanError("RESEARCH_DEEP_RESEARCH_PLAN_INVALID_INPUT", `${label} must be unique`);
  }
  return items;
}

function uniqueBoundedStringArray(value, label, minItems, maxItems, minLength, maxLength) {
  return uniqueStringArray(value, label, minItems, maxItems)
    .map((item) => requireBoundedString(item, `${label}[]`, minLength, maxLength));
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw retrievalPlanError("RESEARCH_DEEP_RESEARCH_PLAN_INVALID_INPUT", `${label} must be an object`);
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

function retrievalPlanError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
