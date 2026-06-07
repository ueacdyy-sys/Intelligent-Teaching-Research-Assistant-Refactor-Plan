import { createHash } from "node:crypto";

export const RESEARCH_DEEP_RESEARCH_INTENT_RUNTIME_ID = "research_deep_research_intent_runtime";
export const RESEARCH_DEEP_RESEARCH_INTENT_PORT = "DeepResearchIntentPort.submitDeepResearchIntent";
export const RESEARCH_DEEP_RESEARCH_INTENT_READY = "RESEARCH_DEEP_RESEARCH_INTENT_RUNTIME_READY";

const inputSchemaVersion = "2026-06-05.research.deep-research-intent.invoke.v1";
const outputSchemaVersion = "2026-06-05.research.deep-research-intent.output.v1";
const allowedClassifications = new Set(["PUBLIC", "PRIVATE"]);
const allowedStatuses = new Set(["PENDING_REVIEW", "ACCEPTED_ASYNC"]);

export async function submitResearchDeepResearchIntent(input, deps = {}, options = {}) {
  const startedAt = nowMs();
  const normalized = normalizeIntentInput(input, deps);
  const portResult = await deps.intentPort.submitDeepResearchIntent(buildPortRequest(normalized));
  const normalizedPortResult = normalizePortResult(portResult);
  const runtimeMs = Math.max(0, nowMs() - startedAt);
  return buildIntentOutput(normalized, normalizedPortResult, runtimeMs, options);
}

export function formatResearchDeepResearchIntentOutput(output) {
  return [
    `Research deep_research intent: ${output.decision}`,
    `Job: ${output.job.jobId}`,
    `Queue: ${output.job.queueName}`,
    `Evidence refs: ${output.evidenceRefs.length}`,
  ].join("\n");
}

function normalizeIntentInput(input, deps) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const intentInvocationId = requireString(input.intentInvocationId, "input.intentInvocationId");
  const agentTask = assertAgentTask(input.agentTask);
  const principalContext = assertPrincipalContext(input.principalContext, agentTask);
  const sharedContext = assertSharedContext(input.sharedContext, agentTask);
  const guardrailResult = assertGuardrailResult(input.guardrailResult, agentTask);
  const routeDecision = assertRouteDecision(input.routeDecision, agentTask);
  const question = requireBoundedString(input.researchQuestion, "input.researchQuestion", 8, 1200);
  const objectives = uniqueBoundedStringArray(input.objectives, "input.objectives", 1, 8, 1, 240);
  const sourcePolicy = assertSourcePolicy(input.sourcePolicy);
  const asyncPolicy = assertAsyncPolicy(input.asyncPolicy);
  const budget = assertBudget(input.budget);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 80);
  assertIntentPort(deps.intentPort);
  const inputHashValue = inputHash({
    intentInvocationId,
    taskId: agentTask.taskId,
    contextId: sharedContext.contextId,
    routeId: routeDecision.routeId,
    question,
    objectives,
    sourcePolicy,
    budget,
  });
  return {
    schemaVersion: inputSchemaVersion,
    intentInvocationId,
    agentTask,
    principalContext,
    sharedContext,
    guardrailResult,
    routeDecision,
    researchQuestion: question,
    objectives,
    sourcePolicy,
    asyncPolicy,
    budget,
    evidenceRefs,
    inputHash: inputHashValue,
  };
}

function assertAgentTask(agentTask) {
  assertPlainObject(agentTask, "input.agentTask");
  requireConst(agentTask.schemaVersion, "2026-06-04.agent.task.v1", "input.agentTask.schemaVersion");
  const taskId = requireString(agentTask.taskId, "input.agentTask.taskId");
  const requestedByPrincipalId = requireString(agentTask.requestedByPrincipalId, "input.agentTask.requestedByPrincipalId");
  const principalContextRef = requireString(agentTask.principalContextRef, "input.agentTask.principalContextRef");
  requireConst(agentTask.taskKind, "RESEARCH", "input.agentTask.taskKind");
  requireConst(agentTask.writeIntent, false, "input.agentTask.writeIntent");
  requireConst(agentTask.requiresHumanApproval, true, "input.agentTask.requiresHumanApproval");
  if (agentTask.riskLevel !== "MEDIUM") {
    throw intentRuntimeError("RESEARCH_DEEP_RESEARCH_UNSUPPORTED_RISK", "deep_research intent admission requires MEDIUM risk");
  }
  assertPlainObject(agentTask.routePolicy, "input.agentTask.routePolicy");
  requireConst(agentTask.routePolicy.preferSingleWorker, true, "input.agentTask.routePolicy.preferSingleWorker");
  const allowedModes = uniqueStringArray(agentTask.routePolicy.allowedModes, "input.agentTask.routePolicy.allowedModes", 1, 2);
  if (!allowedModes.includes("SINGLE_WORKER")) {
    throw intentRuntimeError("RESEARCH_DEEP_RESEARCH_SINGLE_WORKER_REQUIRED", "deep_research intent admission requires SINGLE_WORKER");
  }
  if ((agentTask.routePolicy.swarmRequiredWhen ?? []).length > 0) {
    throw intentRuntimeError("RESEARCH_DEEP_RESEARCH_SWARM_DENIED", "deep_research intent admission does not start Swarm");
  }
  assertPlainObject(agentTask.budgets, "input.agentTask.budgets");
  requireIntegerBetween(agentTask.budgets.maxAgentLoops, "input.agentTask.budgets.maxAgentLoops", 1, 1);
  requireIntegerBetween(agentTask.budgets.maxSkillCalls, "input.agentTask.budgets.maxSkillCalls", 1, 1);
  requireIntegerBetween(agentTask.budgets.p99BudgetMs, "input.agentTask.budgets.p99BudgetMs", 1, 50);
  return {
    ...agentTask,
    taskId,
    requestedByPrincipalId,
    principalContextRef,
    taskKind: "RESEARCH",
  };
}

function assertPrincipalContext(principalContext, agentTask) {
  assertPlainObject(principalContext, "input.principalContext");
  const principalId = requireString(principalContext.principalId, "input.principalContext.principalId");
  requireConst(principalId, agentTask.requestedByPrincipalId, "input.principalContext.principalId");
  const role = requireString(principalContext.role, "input.principalContext.role");
  const subjectType = requireString(principalContext.subjectType, "input.principalContext.subjectType");
  const entryPoint = requireString(principalContext.entryPoint, "input.principalContext.entryPoint");
  const scopes = uniqueStringArray(principalContext.scopes, "input.principalContext.scopes", 1, 32);
  if (role === "STUDENT" || role === "REMOTE_OPERATOR" || subjectType === "REMOTE_CHANNEL" || entryPoint === "REMOTE_SOCIAL") {
    throw intentRuntimeError("RESEARCH_DEEP_RESEARCH_FORBIDDEN_PRINCIPAL", "student and remote principals cannot submit deep_research intents");
  }
  if (!hasAny(scopes, ["RESEARCH_READ", "ADMIN_SYSTEM"])) {
    throw intentRuntimeError("RESEARCH_DEEP_RESEARCH_MISSING_RESEARCH_SCOPE", "RESEARCH_READ or ADMIN_SYSTEM scope is required");
  }
  if (!hasAny(scopes, ["KNOWLEDGE_PRIVATE_READ", "ADMIN_SYSTEM"])) {
    throw intentRuntimeError("RESEARCH_DEEP_RESEARCH_MISSING_PRIVATE_SCOPE", "KNOWLEDGE_PRIVATE_READ or ADMIN_SYSTEM scope is required");
  }
  return { ...principalContext, principalId, role, subjectType, entryPoint, scopes };
}

function assertSharedContext(sharedContext, agentTask) {
  assertPlainObject(sharedContext, "input.sharedContext");
  requireConst(sharedContext.schemaVersion, "2026-06-04.agent.shared-context.v1", "input.sharedContext.schemaVersion");
  const contextId = requireString(sharedContext.contextId, "input.sharedContext.contextId");
  requireConst(sharedContext.taskId, agentTask.taskId, "input.sharedContext.taskId");
  requireConst(sharedContext.principalContextRef, agentTask.principalContextRef, "input.sharedContext.principalContextRef");
  assertPlainObject(sharedContext.dataScopes, "input.sharedContext.dataScopes");
  requireConst(sharedContext.dataScopes.teaching, "NONE", "input.sharedContext.dataScopes.teaching");
  requireConst(sharedContext.dataScopes.student, "NONE", "input.sharedContext.dataScopes.student");
  requireConst(sharedContext.dataScopes.research, "READ", "input.sharedContext.dataScopes.research");
  requireConst(sharedContext.dataScopes.knowledge, "PRIVATE_ASSIGNED", "input.sharedContext.dataScopes.knowledge");
  requireConst(sharedContext.dataScopes.tool ?? sharedContext.dataScopes.localTool, "NONE", "input.sharedContext.dataScopes.tool");
  assertPlainObject(sharedContext.redactionState, "input.sharedContext.redactionState");
  requireConst(sharedContext.redactionState.studentDataRedacted, true, "input.sharedContext.redactionState.studentDataRedacted");
  requireConst(sharedContext.redactionState.externalModelAllowed, false, "input.sharedContext.redactionState.externalModelAllowed");
  return { ...sharedContext, contextId };
}

function assertGuardrailResult(guardrailResult, agentTask) {
  assertPlainObject(guardrailResult, "input.guardrailResult");
  requireConst(guardrailResult.taskId, agentTask.taskId, "input.guardrailResult.taskId");
  requireConst(guardrailResult.skillId, "deep_research", "input.guardrailResult.skillId");
  requireConst(guardrailResult.decision, "APPROVAL_REQUIRED", "input.guardrailResult.decision");
  requireConst(guardrailResult.harnessActionRequired, true, "input.guardrailResult.harnessActionRequired");
  requireConst(guardrailResult.rollbackRequired, false, "input.guardrailResult.rollbackRequired");
  requireConst(guardrailResult.evidenceRequired, true, "input.guardrailResult.evidenceRequired");
  requireConst(guardrailResult.directDatabaseWriteAllowed, false, "input.guardrailResult.directDatabaseWriteAllowed");
  if (!Array.isArray(guardrailResult.safetyChecks) || guardrailResult.safetyChecks.length === 0) {
    throw intentRuntimeError("RESEARCH_DEEP_RESEARCH_GUARDRAIL_CHECKS", "guardrailResult.safetyChecks must be non-empty");
  }
  const failed = guardrailResult.safetyChecks.find((check) => check?.status !== "PASS");
  if (failed) {
    throw intentRuntimeError("RESEARCH_DEEP_RESEARCH_GUARDRAIL_FAILED", `guardrail safety check failed: ${failed.checkId ?? "unknown"}`);
  }
  return guardrailResult;
}

function assertRouteDecision(routeDecision, agentTask) {
  assertPlainObject(routeDecision, "input.routeDecision");
  requireConst(routeDecision.taskId, agentTask.taskId, "input.routeDecision.taskId");
  requireConst(routeDecision.mode, "SINGLE_WORKER", "input.routeDecision.mode");
  requireConst(routeDecision.leadAgent, "LeadAgent", "input.routeDecision.leadAgent");
  const workerAgents = uniqueStringArray(routeDecision.workerAgents, "input.routeDecision.workerAgents", 1, 1);
  const selectedSkills = uniqueStringArray(routeDecision.selectedSkills, "input.routeDecision.selectedSkills", 1, 1);
  requireConst(workerAgents[0], "ResearchAgent", "input.routeDecision.workerAgents[0]");
  requireConst(selectedSkills[0], "deep_research", "input.routeDecision.selectedSkills[0]");
  requireIntegerBetween(routeDecision.p99BudgetMs, "input.routeDecision.p99BudgetMs", 1, agentTask.budgets.p99BudgetMs);
  return { ...routeDecision, workerAgents, selectedSkills };
}

function assertSourcePolicy(sourcePolicy) {
  assertPlainObject(sourcePolicy, "input.sourcePolicy");
  const allowed = uniqueStringArray(sourcePolicy.allowedClassifications, "input.sourcePolicy.allowedClassifications", 1, 2)
    .map((classification) =>
      requireEnum(classification, "input.sourcePolicy.allowedClassifications[]", [...allowedClassifications])
    );
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

function assertAsyncPolicy(asyncPolicy) {
  assertPlainObject(asyncPolicy, "input.asyncPolicy");
  requireConst(asyncPolicy.admissionOnly, true, "input.asyncPolicy.admissionOnly");
  requireConst(asyncPolicy.executeAsyncNow, false, "input.asyncPolicy.executeAsyncNow");
  requireConst(asyncPolicy.externalModelCallNowAllowed, false, "input.asyncPolicy.externalModelCallNowAllowed");
  requireConst(asyncPolicy.ragSynthesisNowAllowed, false, "input.asyncPolicy.ragSynthesisNowAllowed");
  requireConst(asyncPolicy.finalAnswerNowAllowed, false, "input.asyncPolicy.finalAnswerNowAllowed");
  requireConst(asyncPolicy.directPublicationAllowed, false, "input.asyncPolicy.directPublicationAllowed");
  requireConst(asyncPolicy.localToolMutationAllowed, false, "input.asyncPolicy.localToolMutationAllowed");
  requireConst(asyncPolicy.humanReviewRequiredBeforeExecution, true, "input.asyncPolicy.humanReviewRequiredBeforeExecution");
  const queueName = requireBoundedString(asyncPolicy.queueName, "input.asyncPolicy.queueName", 1, 80);
  requireConst(queueName, "research_deep_research", "input.asyncPolicy.queueName");
  return {
    admissionOnly: true,
    executeAsyncNow: false,
    externalModelCallNowAllowed: false,
    ragSynthesisNowAllowed: false,
    finalAnswerNowAllowed: false,
    directPublicationAllowed: false,
    localToolMutationAllowed: false,
    humanReviewRequiredBeforeExecution: true,
    queueName,
  };
}

function assertBudget(budget) {
  assertPlainObject(budget, "input.budget");
  return {
    maxAsyncRuntimeMs: requireIntegerBetween(budget.maxAsyncRuntimeMs, "input.budget.maxAsyncRuntimeMs", 1000, 300000),
    maxSourceRefs: requireIntegerBetween(budget.maxSourceRefs, "input.budget.maxSourceRefs", 3, 50),
    maxDeferredModelCalls: requireIntegerBetween(budget.maxDeferredModelCalls, "input.budget.maxDeferredModelCalls", 0, 8),
    maxRetrievedChunks: requireIntegerBetween(budget.maxRetrievedChunks, "input.budget.maxRetrievedChunks", 3, 120),
    p99AdmissionBudgetMs: requireIntegerBetween(budget.p99AdmissionBudgetMs, "input.budget.p99AdmissionBudgetMs", 1, 50),
  };
}

function assertIntentPort(intentPort) {
  assertPlainObject(intentPort, "intentPort");
  if (typeof intentPort.submitDeepResearchIntent !== "function") {
    throw intentRuntimeError("RESEARCH_DEEP_RESEARCH_MISSING_INTENT_PORT", "intentPort.submitDeepResearchIntent must be injected");
  }
}

function buildPortRequest(normalized) {
  const { agentTask, principalContext, sharedContext, guardrailResult, routeDecision } = normalized;
  return {
    portName: "DeepResearchIntentPort",
    operation: "submitDeepResearchIntent",
    intentInvocationId: normalized.intentInvocationId,
    taskId: agentTask.taskId,
    contextRef: sharedContext.contextId,
    principal: {
      principalId: principalContext.principalId,
      role: principalContext.role,
      scopes: principalContext.scopes,
    },
    researchQuestion: normalized.researchQuestion,
    objectives: normalized.objectives,
    sourcePolicy: normalized.sourcePolicy,
    asyncPolicy: normalized.asyncPolicy,
    budget: normalized.budget,
    idempotencyKey: `deep-research:${agentTask.taskId}:${normalized.inputHash}`,
    evidenceRefs: uniq([
      ...normalized.evidenceRefs,
      ...(Array.isArray(sharedContext.evidenceRefs) ? sharedContext.evidenceRefs : []),
      guardrailResult.guardrailId ? `evidence:guardrail:${guardrailResult.guardrailId}` : null,
      routeDecision.routeId ? `evidence:route:${routeDecision.routeId}` : null,
      `evidence:input-hash:${normalized.inputHash}`,
      `evidence:runtime:${RESEARCH_DEEP_RESEARCH_INTENT_RUNTIME_ID}`,
    ]),
    safety: {
      admissionOnly: true,
      writeOperationAllowed: false,
      directDatabaseAccessAllowed: false,
      studentArchiveAllowed: false,
      studentDataAccess: "NONE",
      externalModelCallNowAllowed: false,
      ragSynthesisNowAllowed: false,
      finalAnswerNowAllowed: false,
      directPublicationAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      humanReviewRequiredBeforeExecution: true,
    },
  };
}

function normalizePortResult(portResult) {
  assertPlainObject(portResult, "intentPort.result");
  const status = requireEnum(portResult.status, "intentPort.result.status", [...allowedStatuses]);
  const jobId = requireBoundedString(portResult.jobId, "intentPort.result.jobId", 1, 160);
  const queueName = requireBoundedString(portResult.queueName, "intentPort.result.queueName", 1, 80);
  requireConst(queueName, "research_deep_research", "intentPort.result.queueName");
  requireConst(portResult.reviewRequired, true, "intentPort.result.reviewRequired");
  requireConst(portResult.executionStarted, false, "intentPort.result.executionStarted");
  requireConst(portResult.externalModelCallStarted, false, "intentPort.result.externalModelCallStarted");
  requireConst(portResult.ragSynthesisStarted, false, "intentPort.result.ragSynthesisStarted");
  requireConst(portResult.finalAnswerGenerated, false, "intentPort.result.finalAnswerGenerated");
  requireConst(portResult.directDatabaseWriteAllowed, false, "intentPort.result.directDatabaseWriteAllowed");
  requireConst(portResult.localToolMutationAllowed, false, "intentPort.result.localToolMutationAllowed");
  requireConst(portResult.studentArchiveUsed, false, "intentPort.result.studentArchiveUsed");
  if (portResult.finalAnswer || portResult.synthesisResult || portResult.modelResponse) {
    throw intentRuntimeError("RESEARCH_DEEP_RESEARCH_UNSAFE_PORT_RESULT", "intent port result must not include final answer, synthesis, or model response");
  }
  return {
    status,
    jobId,
    queueName,
    reviewRequired: true,
    evidenceRefs: uniqueStringArray(portResult.evidenceRefs ?? [], "intentPort.result.evidenceRefs", 1, 40),
  };
}

function buildIntentOutput(normalized, portResult, runtimeMs, options) {
  const evidenceRefs = uniq([
    ...normalized.evidenceRefs,
    ...(Array.isArray(normalized.sharedContext.evidenceRefs) ? normalized.sharedContext.evidenceRefs : []),
    ...portResult.evidenceRefs,
    `evidence:input-hash:${normalized.inputHash}`,
    `evidence:runtime:${RESEARCH_DEEP_RESEARCH_INTENT_RUNTIME_ID}`,
    `evidence:intent-port:${RESEARCH_DEEP_RESEARCH_INTENT_PORT}`,
    `evidence:runtime-ms:${Math.round(runtimeMs)}`,
  ]);
  return {
    schemaVersion: outputSchemaVersion,
    intentInvocationId: normalized.intentInvocationId,
    runtimeId: RESEARCH_DEEP_RESEARCH_INTENT_RUNTIME_ID,
    taskId: normalized.agentTask.taskId,
    contextRef: normalized.sharedContext.contextId,
    workerAgent: "ResearchAgent",
    skillId: "deep_research",
    decision: portResult.status,
    job: {
      jobId: portResult.jobId,
      queueName: portResult.queueName,
      reviewRequired: true,
      executionStarted: false,
    },
    evidenceRefs,
    safety: {
      admissionOnly: true,
      writeOperationAllowed: false,
      directDatabaseAccessAllowed: false,
      studentArchiveUsed: false,
      studentDataAccess: "NONE",
      externalModelCallStarted: false,
      ragSynthesisStarted: false,
      finalAnswerGenerated: false,
      directPublicationAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    slo: {
      p99BudgetMs: Math.min(normalized.budget.p99AdmissionBudgetMs, normalized.agentTask.budgets.p99BudgetMs, options.p99BudgetMs ?? 50),
      asyncRuntimeBudgetMs: normalized.budget.maxAsyncRuntimeMs,
      runtimeEvidenceClass: "ASYNC_DEEP_RESEARCH_INTENT_ADMISSION_ONLY",
      runtimeEvidenceRequiredBeforePromotion: true,
    },
  };
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw intentRuntimeError("RESEARCH_DEEP_RESEARCH_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireBoundedString(value, label, minLength, maxLength) {
  const text = requireString(value, label);
  if (text.length < minLength || text.length > maxLength) {
    throw intentRuntimeError("RESEARCH_DEEP_RESEARCH_INVALID_INPUT", `${label} length must be ${minLength}-${maxLength}`);
  }
  return text;
}

function requireEnum(value, label, allowed) {
  const text = requireString(value, label);
  if (!allowed.includes(text)) {
    throw intentRuntimeError("RESEARCH_DEEP_RESEARCH_INVALID_INPUT", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw intentRuntimeError("RESEARCH_DEEP_RESEARCH_INVALID_INPUT", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw intentRuntimeError("RESEARCH_DEEP_RESEARCH_BOUNDARY_VIOLATION", `${label} must be ${expected}`);
  }
}

function uniqueStringArray(value, label, minItems, maxItems) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw intentRuntimeError("RESEARCH_DEEP_RESEARCH_INVALID_INPUT", `${label} must contain ${minItems}-${maxItems} items`);
  }
  const items = value.map((item) => requireString(item, label));
  if (new Set(items).size !== items.length) {
    throw intentRuntimeError("RESEARCH_DEEP_RESEARCH_INVALID_INPUT", `${label} must be unique`);
  }
  return items;
}

function uniqueBoundedStringArray(value, label, minItems, maxItems, minLength, maxLength) {
  return uniqueStringArray(value, label, minItems, maxItems)
    .map((item) => requireBoundedString(item, `${label}[]`, minLength, maxLength));
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw intentRuntimeError("RESEARCH_DEEP_RESEARCH_INVALID_INPUT", `${label} must be an object`);
  }
}

function hasAny(values, candidates) {
  return candidates.some((candidate) => values.includes(candidate));
}

function inputHash(input) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 24);
}

function uniq(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
}

function nowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function intentRuntimeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
