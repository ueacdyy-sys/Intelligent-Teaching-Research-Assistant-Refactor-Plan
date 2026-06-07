import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RESEARCH_DEEP_RESEARCH_WORKER_LIFECYCLE_RUNTIME_ID = "research_deep_research_worker_lifecycle_runtime";
export const RESEARCH_DEEP_RESEARCH_WORKER_COMMAND_PORT = "DeepResearchWorkerCommandPort.recordDeepResearchWorkerLifecycle";
export const RESEARCH_DEEP_RESEARCH_WORKER_LIFECYCLE_READY = "RESEARCH_DEEP_RESEARCH_WORKER_LIFECYCLE_READY";

const inputSchemaVersion = "2026-06-05.research.deep-research-worker-lifecycle.v1";
const outputSchemaVersion = "2026-06-05.research.deep-research-worker-lifecycle-recorded.v1";
const approvedIntentSchemaVersion = "2026-06-05.research.deep-research-intent.output.v1";
const defaultCommandLogPath = "reports/research-command-log/deep-research-worker-lifecycle.jsonl";
const allowedActions = new Set(["CLAIM", "MARK_FAILED_SAFE"]);

export function recordDeepResearchWorkerLifecycle(input, options = {}) {
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

export function formatDeepResearchWorkerLifecycle(result) {
  return [
    `Research deep_research worker lifecycle: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Job: ${result.job.jobId} ${result.lifecycle.fromStatus}->${result.lifecycle.toStatus}`,
    `Worker: ${result.worker.workerId}`,
    `Execution started: ${result.boundary.executionStarted}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const lifecycleInvocationId = requireString(input.lifecycleInvocationId, "input.lifecycleInvocationId");
  const principal = assertPrincipal(input.principal);
  const approvedIntent = assertApprovedIntent(input.approvedIntent);
  const approval = assertApproval(input.approval, approvedIntent);
  const worker = assertWorker(input.worker, input.sourcePolicy);
  const lifecycleAction = requireEnum(input.lifecycleAction, "input.lifecycleAction", [...allowedActions]);
  const sourcePolicy = assertSourcePolicy(input.sourcePolicy);
  const executionPlan = assertExecutionPlan(input.executionPlan);
  const failure = lifecycleAction === "MARK_FAILED_SAFE" ? assertFailure(input.failure) : null;
  if (lifecycleAction === "CLAIM" && input.failure !== undefined) {
    throw lifecycleError("RESEARCH_DEEP_RESEARCH_WORKER_UNEXPECTED_FAILURE", "CLAIM lifecycle must not include failure details");
  }
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 80);
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 220);
  const inputHash = hashInput({
    lifecycleInvocationId,
    taskId: approvedIntent.taskId,
    contextRef: approvedIntent.contextRef,
    jobId: approvedIntent.job.jobId,
    approvalId: approval.approvalId,
    workerId: worker.workerId,
    lifecycleAction,
    sourcePolicy,
    executionPlan,
    failure,
  });
  return {
    lifecycleInvocationId,
    principal,
    approvedIntent,
    approval,
    worker,
    lifecycleAction,
    sourcePolicy,
    executionPlan,
    failure,
    evidenceRefs,
    idempotencyKey,
    inputHash,
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
  if (role === "STUDENT" || subjectType === "REMOTE_CHANNEL") {
    throw lifecycleError("RESEARCH_DEEP_RESEARCH_WORKER_FORBIDDEN_PRINCIPAL", "students and remote channels cannot record worker lifecycle");
  }
  const isService = role === "SERVICE" && subjectType === "SERVICE" && entryPoint === "AGENT_INTERNAL";
  const isAdmin = role === "ADMIN" && scopes.includes("ADMIN_SYSTEM");
  if (!isService && !isAdmin) {
    throw lifecycleError("RESEARCH_DEEP_RESEARCH_WORKER_FORBIDDEN_PRINCIPAL", "worker lifecycle must be recorded by an internal service or admin");
  }
  if (!scopes.includes("AGENT_COMMAND_SUBMIT") && !scopes.includes("ADMIN_SYSTEM")) {
    throw lifecycleError("RESEARCH_DEEP_RESEARCH_WORKER_MISSING_PERMISSION", "AGENT_COMMAND_SUBMIT or ADMIN_SYSTEM scope is required");
  }
  return { principalId, role, subjectType, entryPoint, sessionId, scopes };
}

function assertApprovedIntent(approvedIntent) {
  assertPlainObject(approvedIntent, "input.approvedIntent");
  requireConst(approvedIntent.schemaVersion, approvedIntentSchemaVersion, "input.approvedIntent.schemaVersion");
  requireConst(approvedIntent.runtimeId, "research_deep_research_intent_runtime", "input.approvedIntent.runtimeId");
  requireConst(approvedIntent.workerAgent, "ResearchAgent", "input.approvedIntent.workerAgent");
  requireConst(approvedIntent.skillId, "deep_research", "input.approvedIntent.skillId");
  requireConst(approvedIntent.decision, "ACCEPTED_ASYNC", "input.approvedIntent.decision");
  const taskId = requireString(approvedIntent.taskId, "input.approvedIntent.taskId");
  const contextRef = requireString(approvedIntent.contextRef, "input.approvedIntent.contextRef");
  const job = assertIntentJob(approvedIntent.job);
  assertSafety(approvedIntent.safety, "input.approvedIntent.safety");
  return { ...approvedIntent, taskId, contextRef, job };
}

function assertIntentJob(job) {
  assertPlainObject(job, "input.approvedIntent.job");
  const jobId = requireBoundedString(job.jobId, "input.approvedIntent.job.jobId", 1, 160);
  requireConst(job.queueName, "research_deep_research", "input.approvedIntent.job.queueName");
  requireConst(job.reviewRequired, true, "input.approvedIntent.job.reviewRequired");
  requireConst(job.executionStarted, false, "input.approvedIntent.job.executionStarted");
  return { jobId, queueName: "research_deep_research", reviewRequired: true, executionStarted: false };
}

function assertSafety(safety, label) {
  assertPlainObject(safety, label);
  requireConst(safety.admissionOnly, true, `${label}.admissionOnly`);
  requireConst(safety.writeOperationAllowed, false, `${label}.writeOperationAllowed`);
  requireConst(safety.directDatabaseAccessAllowed, false, `${label}.directDatabaseAccessAllowed`);
  requireConst(safety.studentArchiveUsed, false, `${label}.studentArchiveUsed`);
  requireConst(safety.studentDataAccess, "NONE", `${label}.studentDataAccess`);
  requireConst(safety.externalModelCallStarted, false, `${label}.externalModelCallStarted`);
  requireConst(safety.ragSynthesisStarted, false, `${label}.ragSynthesisStarted`);
  requireConst(safety.finalAnswerGenerated, false, `${label}.finalAnswerGenerated`);
  requireConst(safety.directPublicationAllowed, false, `${label}.directPublicationAllowed`);
  requireConst(safety.localToolMutationAllowed, false, `${label}.localToolMutationAllowed`);
  requireConst(safety.swarmAllowed, false, `${label}.swarmAllowed`);
}

function assertApproval(approval, approvedIntent) {
  assertPlainObject(approval, "input.approval");
  const approvalId = requireString(approval.approvalId, "input.approval.approvalId");
  const approvalRecordRef = requireString(approval.approvalRecordRef, "input.approval.approvalRecordRef");
  const reviewerPrincipalId = requireString(approval.reviewerPrincipalId, "input.approval.reviewerPrincipalId");
  requireConst(approval.taskId, approvedIntent.taskId, "input.approval.taskId");
  requireConst(approval.jobId, approvedIntent.job.jobId, "input.approval.jobId");
  requireConst(approval.decision, "APPROVED_FOR_ASYNC", "input.approval.decision");
  requireConst(approval.sourcePolicyReviewed, true, "input.approval.sourcePolicyReviewed");
  requireConst(approval.budgetReviewed, true, "input.approval.budgetReviewed");
  requireConst(approval.privateKnowledgeApproved, true, "input.approval.privateKnowledgeApproved");
  requireConst(approval.externalModelPolicy, "DEFERRED_ONLY", "input.approval.externalModelPolicy");
  requireString(approval.reviewedAt, "input.approval.reviewedAt");
  return { ...approval, approvalId, approvalRecordRef, reviewerPrincipalId };
}

function assertWorker(worker, sourcePolicy) {
  assertPlainObject(worker, "input.worker");
  const workerId = requireString(worker.workerId, "input.worker.workerId");
  requireConst(worker.executionOwner, "ASYNC_RESEARCH_WORKER", "input.worker.executionOwner");
  requireConst(worker.nodeType, "LOCAL", "input.worker.nodeType");
  requireConst(worker.baselineRuntimeDependencyAllowed, false, "input.worker.baselineRuntimeDependencyAllowed");
  requireConst(worker.directMainDatabaseWriteAllowed, false, "input.worker.directMainDatabaseWriteAllowed");
  requireIntegerBetween(worker.leaseDurationMs, "input.worker.leaseDurationMs", 1000, 120000);
  requireIntegerBetween(worker.maxConcurrentJobs, "input.worker.maxConcurrentJobs", 1, 32);
  const capabilityKinds = uniqueStringArray(worker.capabilityKinds, "input.worker.capabilityKinds", 1, 4);
  if (!capabilityKinds.includes("RAG_RETRIEVAL")) {
    throw lifecycleError("RESEARCH_DEEP_RESEARCH_WORKER_MISSING_CAPABILITY", "RAG_RETRIEVAL capability is required for deep_research worker lifecycle");
  }
  if (sourcePolicy?.allowedClassifications?.includes("PRIVATE") && worker.nodeType !== "LOCAL") {
    throw lifecycleError("RESEARCH_DEEP_RESEARCH_WORKER_LOCAL_REQUIRED", "PRIVATE deep_research jobs must stay on a LOCAL worker");
  }
  return { ...worker, workerId, capabilityKinds };
}

function assertSourcePolicy(sourcePolicy) {
  assertPlainObject(sourcePolicy, "input.sourcePolicy");
  const allowedClassifications = uniqueStringArray(sourcePolicy.allowedClassifications, "input.sourcePolicy.allowedClassifications", 1, 2);
  for (const classification of allowedClassifications) {
    requireEnum(classification, "input.sourcePolicy.allowedClassifications[]", ["PUBLIC", "PRIVATE"]);
  }
  requireConst(sourcePolicy.includeStudentArchive, false, "input.sourcePolicy.includeStudentArchive");
  requireConst(sourcePolicy.includeRemoteDeviceSources, false, "input.sourcePolicy.includeRemoteDeviceSources");
  requireConst(sourcePolicy.directDatabaseAccessAllowed, false, "input.sourcePolicy.directDatabaseAccessAllowed");
  const knowledgeBaseRefs = uniqueStringArray(sourcePolicy.knowledgeBaseRefs, "input.sourcePolicy.knowledgeBaseRefs", 1, 12);
  return {
    allowedClassifications,
    includeStudentArchive: false,
    includeRemoteDeviceSources: false,
    directDatabaseAccessAllowed: false,
    knowledgeBaseRefs,
  };
}

function assertExecutionPlan(executionPlan) {
  assertPlainObject(executionPlan, "input.executionPlan");
  requireConst(executionPlan.executeNow, false, "input.executionPlan.executeNow");
  requireConst(executionPlan.startRagRetrievalNow, false, "input.executionPlan.startRagRetrievalNow");
  requireConst(executionPlan.startExternalModelCallNow, false, "input.executionPlan.startExternalModelCallNow");
  requireConst(executionPlan.finalAnswerNowAllowed, false, "input.executionPlan.finalAnswerNowAllowed");
  requireConst(executionPlan.directPublicationAllowed, false, "input.executionPlan.directPublicationAllowed");
  requireConst(executionPlan.localToolMutationAllowed, false, "input.executionPlan.localToolMutationAllowed");
  requireConst(executionPlan.swarmAllowed, false, "input.executionPlan.swarmAllowed");
  return {
    executeNow: false,
    startRagRetrievalNow: false,
    startExternalModelCallNow: false,
    finalAnswerNowAllowed: false,
    directPublicationAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
    maxDeferredModelCalls: requireIntegerBetween(executionPlan.maxDeferredModelCalls, "input.executionPlan.maxDeferredModelCalls", 0, 8),
    maxRetrievedChunks: requireIntegerBetween(executionPlan.maxRetrievedChunks, "input.executionPlan.maxRetrievedChunks", 3, 120),
    maxSourceRefs: requireIntegerBetween(executionPlan.maxSourceRefs, "input.executionPlan.maxSourceRefs", 3, 50),
  };
}

function assertFailure(failure) {
  assertPlainObject(failure, "input.failure");
  const errorCode = requireString(failure.errorCode, "input.failure.errorCode");
  const safeMessage = requireBoundedString(failure.safeMessage, "input.failure.safeMessage", 1, 500);
  requireConst(failure.partialArtifactsDiscarded, true, "input.failure.partialArtifactsDiscarded");
  requireConst(failure.humanReviewRequired, true, "input.failure.humanReviewRequired");
  return {
    errorCode,
    safeMessage,
    retryable: failure.retryable === true,
    partialArtifactsDiscarded: true,
    humanReviewRequired: true,
  };
}

function buildCommandRecord(normalized, recordedAt) {
  const claimed = normalized.lifecycleAction === "CLAIM";
  const fromStatus = claimed ? "APPROVED_FOR_ASYNC" : "CLAIMED";
  const toStatus = claimed ? "CLAIMED" : "FAILED_SAFE";
  return {
    schemaVersion: inputSchemaVersion,
    recordType: "RESEARCH_DEEP_RESEARCH_WORKER_LIFECYCLE",
    recordId: `research_deep_research_worker_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    commandPort: RESEARCH_DEEP_RESEARCH_WORKER_COMMAND_PORT,
    status: claimed ? "CLAIMED_FOR_ASYNC_EXECUTION" : "FAILED_SAFE_RECORDED",
    lifecycleInvocationId: normalized.lifecycleInvocationId,
    principal: normalized.principal,
    job: {
      taskId: normalized.approvedIntent.taskId,
      contextRef: normalized.approvedIntent.contextRef,
      jobId: normalized.approvedIntent.job.jobId,
      queueName: "research_deep_research",
    },
    approval: {
      approvalId: normalized.approval.approvalId,
      approvalRecordRef: normalized.approval.approvalRecordRef,
      reviewerPrincipalId: normalized.approval.reviewerPrincipalId,
      decision: "APPROVED_FOR_ASYNC",
    },
    worker: {
      workerId: normalized.worker.workerId,
      nodeType: normalized.worker.nodeType,
      capabilityKinds: normalized.worker.capabilityKinds,
      leaseDurationMs: normalized.worker.leaseDurationMs,
      maxConcurrentJobs: normalized.worker.maxConcurrentJobs,
    },
    lifecycle: {
      action: normalized.lifecycleAction,
      fromStatus,
      toStatus,
      leaseExpiresAt: claimed ? addMsIso(recordedAt, normalized.worker.leaseDurationMs) : null,
    },
    sourcePolicy: normalized.sourcePolicy,
    executionPlan: normalized.executionPlan,
    failure: normalized.failure,
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        `evidence:approval:${normalized.approval.approvalId}`,
        `evidence:input-hash:${normalized.inputHash}`,
        `evidence:runtime:${RESEARCH_DEEP_RESEARCH_WORKER_LIFECYCLE_RUNTIME_ID}`,
        `evidence:command-port:${RESEARCH_DEEP_RESEARCH_WORKER_COMMAND_PORT}`,
      ]),
      idempotencyKey: normalized.idempotencyKey,
      inputHash: normalized.inputHash,
    },
    boundary: buildBoundary(normalized.lifecycleAction),
  };
}

function buildResult(record, options) {
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: RESEARCH_DEEP_RESEARCH_WORKER_LIFECYCLE_RUNTIME_ID,
    commandPort: record.commandPort,
    status: record.status,
    recordId: record.recordId,
    recordedAt: record.recordedAt,
    idempotencyKey: record.evidence.idempotencyKey,
    idempotentReplay: options.idempotentReplay === true,
    job: record.job,
    approval: record.approval,
    worker: record.worker,
    lifecycle: record.lifecycle,
    failure: record.failure,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 50,
      evidenceClass: "ASYNC_DEEP_RESEARCH_WORKER_LIFECYCLE_CONTROL_PLANE",
    },
    nextAction: record.lifecycle.toStatus === "CLAIMED"
      ? "Use this claim as worker-side lifecycle evidence; retrieval, model reasoning, synthesis, and final answer remain future approved async slices."
      : "Keep the job stopped, surface safe failure evidence to human review, and do not publish partial artifacts.",
  };
}

function buildBoundary(action) {
  return {
    approvalVerified: true,
    workerClaimRecorded: action === "CLAIM",
    failedSafeRecorded: action === "MARK_FAILED_SAFE",
    executionStarted: false,
    ragRetrievalStarted: false,
    externalModelCallStarted: false,
    finalAnswerGenerated: false,
    directPublicationAllowed: false,
    localToolMutationAllowed: false,
    directMainDatabaseWriteAllowed: false,
    studentArchiveUsed: false,
    remoteDeviceSourcesUsed: false,
    swarmAllowed: false,
    requiresFutureExecutionSlice: true,
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
    if (record?.recordType === "RESEARCH_DEEP_RESEARCH_WORKER_LIFECYCLE" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.lifecycleInvocationId !== normalized.lifecycleInvocationId ||
    existing.job?.jobId !== normalized.approvedIntent.job.jobId ||
    existing.lifecycle?.action !== normalized.lifecycleAction ||
    existing.evidence?.inputHash !== normalized.inputHash) {
    throw lifecycleError("RESEARCH_DEEP_RESEARCH_WORKER_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different lifecycle record");
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw lifecycleError("RESEARCH_DEEP_RESEARCH_WORKER_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireBoundedString(value, label, minLength, maxLength) {
  const text = requireString(value, label);
  if (text.length < minLength || text.length > maxLength) {
    throw lifecycleError("RESEARCH_DEEP_RESEARCH_WORKER_INVALID_INPUT", `${label} length must be ${minLength}-${maxLength}`);
  }
  return text;
}

function requireEnum(value, label, allowed) {
  const text = requireString(value, label);
  if (!allowed.includes(text)) {
    throw lifecycleError("RESEARCH_DEEP_RESEARCH_WORKER_INVALID_INPUT", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw lifecycleError("RESEARCH_DEEP_RESEARCH_WORKER_INVALID_INPUT", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw lifecycleError("RESEARCH_DEEP_RESEARCH_WORKER_BOUNDARY_VIOLATION", `${label} must be ${expected}`);
  }
}

function uniqueStringArray(value, label, minItems, maxItems) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw lifecycleError("RESEARCH_DEEP_RESEARCH_WORKER_INVALID_INPUT", `${label} must contain ${minItems}-${maxItems} items`);
  }
  const items = value.map((item) => requireString(item, label));
  if (new Set(items).size !== items.length) {
    throw lifecycleError("RESEARCH_DEEP_RESEARCH_WORKER_INVALID_INPUT", `${label} must be unique`);
  }
  return items;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw lifecycleError("RESEARCH_DEEP_RESEARCH_WORKER_INVALID_INPUT", `${label} must be an object`);
  }
}

function hashInput(input) {
  return `sha256:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`;
}

function addMsIso(iso, ms) {
  return new Date(new Date(iso).getTime() + ms).toISOString();
}

function uniq(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
}

function safeToken(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9_-]+/gu, "_").replace(/^_+|_+$/gu, "") || "unknown";
}

function lifecycleError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
