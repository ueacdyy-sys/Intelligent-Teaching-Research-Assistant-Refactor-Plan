import { createHash } from "node:crypto";

import {
  AGENT_READONLY_RUNTIME_DISPATCHER_ID,
  dispatchAgentReadonlyRuntime,
} from "./agent-readonly-runtime-dispatcher.mjs";

export const AGENT_READONLY_API_RUNTIME_ID = "agent_readonly_api_runtime";
export const AGENT_READONLY_API_RUNTIME_READY = "AGENT_READONLY_API_RUNTIME_TEACHING_STUDENT_TUTOR_RESEARCH_READY";

const inputSchemaVersion = "2026-06-05.agent.readonly-api-runtime.invoke.v1";
const outputSchemaVersion = "2026-06-05.agent.readonly-api-runtime.output.v1";
const dispatcherInputSchemaVersion = "2026-06-05.agent.readonly-runtime-dispatcher.invoke.v1";
const readonlyTaskRoutes = new Map([
  ["TEACHING", { workerAgent: "TeachingAgent", skillId: "search_teaching_material" }],
  ["STUDENT_TUTORING", { workerAgent: "StudentTutorAgent", skillId: "recommend_practice" }],
  ["RESEARCH", { workerAgent: "ResearchAgent", skillId: "search_knowledge" }],
]);

export async function invokeAgentReadonlyApiRuntime(input, deps = {}, options = {}) {
  const startedAt = nowMs();
  const normalized = normalizeApiInput(input);
  const dispatchOutput = await dispatchAgentReadonlyRuntime(
    buildDispatchInput(normalized),
    buildDispatcherDeps(normalized, deps),
    options.dispatcherOptions ?? {},
  );
  const runtimeMs = Math.max(0, nowMs() - startedAt);
  return buildApiOutput(normalized, dispatchOutput, runtimeMs);
}

export function formatAgentReadonlyApiRuntimeOutput(output) {
  return [
    `Agent read-only API runtime: ${output.decision}`,
    `Task: ${output.agentTaskId}`,
    `Route: ${output.workerAgent}.${output.skillId}`,
    `Evidence refs: ${output.evidenceRefs.length}`,
  ].join("\n");
}

function normalizeApiInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const apiInvocationId = requireString(input.apiInvocationId, "input.apiInvocationId");
  const agentTask = assertAgentTask(input.agentTask);
  const expectedRoute = expectedReadonlyRoute(agentTask.taskKind);
  const principalContext = assertPrincipalContext(input.principalContext, agentTask);
  const sharedContext = assertSharedContext(input.sharedContext, agentTask);
  const routeDecision = assertRouteDecision(input.routeDecision, agentTask, expectedRoute);
  const guardrailResult = assertGuardrailResult(input.guardrailResult, agentTask, expectedRoute);
  const skillInput = assertSkillInput(input.skillInput, agentTask, sharedContext, expectedRoute);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs ?? [], "input.evidenceRefs", 0, 64);
  const apiInputHash = inputHash({
    apiInvocationId,
    taskId: agentTask.taskId,
    taskKind: agentTask.taskKind,
    contextId: sharedContext.contextId,
    routeId: routeDecision.routeId,
    skillInvocationId: skillInput.invocationId,
  });
  return {
    schemaVersion: inputSchemaVersion,
    apiInvocationId,
    agentTask,
    principalContext,
    sharedContext,
    guardrailResult,
    routeDecision,
    skillInput,
    expectedRoute,
    evidenceRefs,
    apiInputHash,
  };
}

function assertAgentTask(agentTask) {
  assertPlainObject(agentTask, "input.agentTask");
  requireConst(agentTask.schemaVersion, "2026-06-04.agent.task.v1", "input.agentTask.schemaVersion");
  const taskId = requireString(agentTask.taskId, "input.agentTask.taskId");
  const requestedByPrincipalId = requireString(agentTask.requestedByPrincipalId, "input.agentTask.requestedByPrincipalId");
  const principalContextRef = requireString(agentTask.principalContextRef, "input.agentTask.principalContextRef");
  const taskKind = requireString(agentTask.taskKind, "input.agentTask.taskKind");
  requireConst(agentTask.writeIntent, false, "input.agentTask.writeIntent");
  requireConst(agentTask.requiresHumanApproval, false, "input.agentTask.requiresHumanApproval");
  if (agentTask.riskLevel !== "LOW" && agentTask.riskLevel !== "MEDIUM") {
    throw apiRuntimeError("AGENT_READONLY_API_UNSUPPORTED_RISK", "read-only API fast path accepts only LOW or MEDIUM risk tasks");
  }
  assertPlainObject(agentTask.routePolicy, "input.agentTask.routePolicy");
  requireConst(agentTask.routePolicy.preferSingleWorker, true, "input.agentTask.routePolicy.preferSingleWorker");
  const allowedModes = uniqueStringArray(agentTask.routePolicy.allowedModes, "input.agentTask.routePolicy.allowedModes", 1, 2);
  if (!allowedModes.includes("SINGLE_WORKER")) {
    throw apiRuntimeError("AGENT_READONLY_API_SINGLE_WORKER_REQUIRED", "agentTask.routePolicy.allowedModes must include SINGLE_WORKER");
  }
  if ((agentTask.routePolicy.swarmRequiredWhen ?? []).length > 0) {
    throw apiRuntimeError("AGENT_READONLY_API_SWARM_POLICY_DENIED", "read-only API fast path cannot carry swarmRequiredWhen triggers");
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
    taskKind,
  };
}

function assertPrincipalContext(principalContext, agentTask) {
  assertPlainObject(principalContext, "input.principalContext");
  const principalId = requireString(principalContext.principalId, "input.principalContext.principalId");
  requireConst(principalId, agentTask.requestedByPrincipalId, "input.principalContext.principalId");
  requireString(principalContext.role, "input.principalContext.role");
  requireString(principalContext.subjectType, "input.principalContext.subjectType");
  requireString(principalContext.entryPoint, "input.principalContext.entryPoint");
  uniqueStringArray(principalContext.scopes, "input.principalContext.scopes", 1, 32);
  if (principalContext.requiresHarnessApproval === true) {
    throw apiRuntimeError("AGENT_READONLY_API_PRINCIPAL_REQUIRES_APPROVAL", "principals requiring Harness approval cannot use the read-only fast path");
  }
  return principalContext;
}

function assertSharedContext(sharedContext, agentTask) {
  assertPlainObject(sharedContext, "input.sharedContext");
  requireConst(sharedContext.schemaVersion, "2026-06-04.agent.shared-context.v1", "input.sharedContext.schemaVersion");
  const contextId = requireString(sharedContext.contextId, "input.sharedContext.contextId");
  requireConst(sharedContext.taskId, agentTask.taskId, "input.sharedContext.taskId");
  requireConst(sharedContext.principalContextRef, agentTask.principalContextRef, "input.sharedContext.principalContextRef");
  assertPlainObject(sharedContext.dataScopes, "input.sharedContext.dataScopes");
  requireConst(sharedContext.dataScopes.tool ?? sharedContext.dataScopes.localTool, "NONE", "input.sharedContext.dataScopes.tool");
  assertPlainObject(sharedContext.redactionState, "input.sharedContext.redactionState");
  requireConst(sharedContext.redactionState.externalModelAllowed, false, "input.sharedContext.redactionState.externalModelAllowed");
  return { ...sharedContext, contextId };
}

function assertRouteDecision(routeDecision, agentTask, expectedRoute) {
  assertPlainObject(routeDecision, "input.routeDecision");
  requireConst(routeDecision.taskId, agentTask.taskId, "input.routeDecision.taskId");
  requireConst(routeDecision.mode, "SINGLE_WORKER", "input.routeDecision.mode");
  requireConst(routeDecision.leadAgent, "LeadAgent", "input.routeDecision.leadAgent");
  const workerAgents = uniqueStringArray(routeDecision.workerAgents, "input.routeDecision.workerAgents", 1, 1);
  const selectedSkills = uniqueStringArray(routeDecision.selectedSkills, "input.routeDecision.selectedSkills", 1, 1);
  requireConst(workerAgents[0], expectedRoute.workerAgent, "input.routeDecision.workerAgents[0]");
  requireConst(selectedSkills[0], expectedRoute.skillId, "input.routeDecision.selectedSkills[0]");
  requireIntegerBetween(routeDecision.p99BudgetMs, "input.routeDecision.p99BudgetMs", 1, agentTask.budgets.p99BudgetMs);
  return { ...routeDecision, workerAgents, selectedSkills };
}

function assertGuardrailResult(guardrailResult, agentTask, expectedRoute) {
  assertPlainObject(guardrailResult, "input.guardrailResult");
  requireConst(guardrailResult.taskId, agentTask.taskId, "input.guardrailResult.taskId");
  requireConst(guardrailResult.skillId, expectedRoute.skillId, "input.guardrailResult.skillId");
  requireConst(guardrailResult.decision, "ALLOW", "input.guardrailResult.decision");
  requireConst(guardrailResult.harnessActionRequired, false, "input.guardrailResult.harnessActionRequired");
  requireConst(guardrailResult.rollbackRequired, false, "input.guardrailResult.rollbackRequired");
  requireConst(guardrailResult.evidenceRequired, true, "input.guardrailResult.evidenceRequired");
  requireConst(guardrailResult.directDatabaseWriteAllowed, false, "input.guardrailResult.directDatabaseWriteAllowed");
  if (!Array.isArray(guardrailResult.safetyChecks) || guardrailResult.safetyChecks.length === 0) {
    throw apiRuntimeError("AGENT_READONLY_API_GUARDRAIL_CHECKS", "guardrailResult.safetyChecks must be non-empty");
  }
  const failed = guardrailResult.safetyChecks.find((check) => check?.status !== "PASS");
  if (failed) {
    throw apiRuntimeError("AGENT_READONLY_API_GUARDRAIL_FAILED", `guardrail safety check failed: ${failed.checkId ?? "unknown"}`);
  }
  return guardrailResult;
}

function assertSkillInput(skillInput, agentTask, sharedContext, expectedRoute) {
  assertPlainObject(skillInput, "input.skillInput");
  requireConst(skillInput.taskId, agentTask.taskId, "input.skillInput.taskId");
  requireConst(skillInput.contextRef, sharedContext.contextId, "input.skillInput.contextRef");
  requireConst(skillInput.principalContextRef, agentTask.principalContextRef, "input.skillInput.principalContextRef");
  requireConst(skillInput.writeIntent, false, "input.skillInput.writeIntent");
  requireConst(skillInput.externalModelAllowed, false, "input.skillInput.externalModelAllowed");
  if (skillInput.localToolMutationAllowed === true) {
    throw apiRuntimeError("AGENT_READONLY_API_LOCAL_TOOL_MUTATION_DENIED", "local tool mutation is not allowed in the read-only API runtime");
  }
  if (expectedRoute.skillId === "recommend_practice") {
    requireConst(skillInput.finalEvaluationAllowed, false, "input.skillInput.finalEvaluationAllowed");
  }
  if (expectedRoute.skillId === "search_knowledge") {
    requireConst(skillInput.synthesisAllowed, false, "input.skillInput.synthesisAllowed");
  }
  return skillInput;
}

function expectedReadonlyRoute(taskKind) {
  const route = readonlyTaskRoutes.get(taskKind);
  if (route) return route;
  throw apiRuntimeError("AGENT_READONLY_API_UNSUPPORTED_TASK_KIND", `${taskKind} is not available in the read-only API fast path`);
}

function buildDispatchInput(normalized) {
  return {
    schemaVersion: dispatcherInputSchemaVersion,
    dispatchId: `${normalized.apiInvocationId}:dispatch`,
    dispatcherId: AGENT_READONLY_RUNTIME_DISPATCHER_ID,
    taskId: normalized.agentTask.taskId,
    routeDecision: normalized.routeDecision,
    skillInput: normalized.skillInput,
    evidenceRefs: uniq([
      ...normalized.evidenceRefs,
      ...(Array.isArray(normalized.sharedContext.evidenceRefs) ? normalized.sharedContext.evidenceRefs : []),
      `evidence:api-runtime:${AGENT_READONLY_API_RUNTIME_ID}`,
      `evidence:api-input-hash:${normalized.apiInputHash}`,
    ]),
  };
}

function buildDispatcherDeps(normalized, deps) {
  return {
    ...deps,
    principalContext: normalized.principalContext,
    sharedContext: normalized.sharedContext,
    guardrailResult: normalized.guardrailResult,
    routeDecision: normalized.routeDecision,
  };
}

function buildApiOutput(normalized, dispatchOutput, runtimeMs) {
  const evidenceRefs = uniq([
    ...normalized.evidenceRefs,
    ...(Array.isArray(dispatchOutput.evidenceRefs) ? dispatchOutput.evidenceRefs : []),
    `evidence:api-runtime:${AGENT_READONLY_API_RUNTIME_ID}`,
    `evidence:api-input-hash:${normalized.apiInputHash}`,
    `evidence:api-runtime-ms:${Math.round(runtimeMs)}`,
  ]);
  return {
    schemaVersion: outputSchemaVersion,
    apiInvocationId: normalized.apiInvocationId,
    apiRuntimeId: AGENT_READONLY_API_RUNTIME_ID,
    agentTaskId: normalized.agentTask.taskId,
    taskKind: normalized.agentTask.taskKind,
    workerAgent: dispatchOutput.workerAgent,
    skillId: dispatchOutput.skillId,
    decision: "DISPATCHED",
    dispatchOutput,
    evidenceRefs,
    safety: {
      writeOperationAllowed: false,
      directDatabaseAccessAllowed: false,
      externalModelCallAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      fullAgentLoopAllowed: false,
      humanApprovalRequired: false,
    },
    slo: {
      p99BudgetMs: Math.min(normalized.agentTask.budgets.p99BudgetMs, dispatchOutput.slo?.p99BudgetMs ?? 50),
      runtimeEvidenceClass: "REAL_AGENT_READONLY_API_TO_DISPATCHER_INVOCATION",
      runtimeEvidenceRequiredBeforePromotion: true,
    },
  };
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw apiRuntimeError("AGENT_READONLY_API_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw apiRuntimeError("AGENT_READONLY_API_INVALID_INPUT", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw apiRuntimeError("AGENT_READONLY_API_BOUNDARY_VIOLATION", `${label} must be ${expected}`);
  }
}

function uniqueStringArray(value, label, minItems, maxItems) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw apiRuntimeError("AGENT_READONLY_API_INVALID_INPUT", `${label} must contain ${minItems}-${maxItems} items`);
  }
  const items = value.map((item) => requireString(item, label));
  if (new Set(items).size !== items.length) {
    throw apiRuntimeError("AGENT_READONLY_API_INVALID_INPUT", `${label} must be unique`);
  }
  return items;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw apiRuntimeError("AGENT_READONLY_API_INVALID_INPUT", `${label} must be an object`);
  }
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

function apiRuntimeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
