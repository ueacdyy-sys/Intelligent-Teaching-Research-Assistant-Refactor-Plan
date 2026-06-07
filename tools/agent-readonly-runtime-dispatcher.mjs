import { createHash } from "node:crypto";

import {
  TEACHING_AGENT_READONLY_RUNTIME_ADAPTER_ID,
  invokeTeachingAgentSearchTeachingMaterial,
} from "./teaching-agent-readonly-runtime-adapter.mjs";
import {
  STUDENT_TUTOR_AGENT_READONLY_RUNTIME_ADAPTER_ID,
  invokeStudentTutorRecommendPractice,
} from "./student-tutor-agent-readonly-runtime-adapter.mjs";
import {
  RESEARCH_AGENT_READONLY_RUNTIME_ADAPTER_ID,
  invokeResearchAgentSearchKnowledge,
} from "./research-agent-readonly-runtime-adapter.mjs";

export const AGENT_READONLY_RUNTIME_DISPATCHER_ID = "agent_readonly_runtime_dispatcher";
export const AGENT_READONLY_RUNTIME_DISPATCHER_READY = "AGENT_READONLY_RUNTIME_DISPATCHER_TEACHING_STUDENT_TUTOR_RESEARCH_RUNTIME_READY";

const inputSchemaVersion = "2026-06-05.agent.readonly-runtime-dispatcher.invoke.v1";
const outputSchemaVersion = "2026-06-05.agent.readonly-runtime-dispatcher.output.v1";
const implementedRuntimeAdapters = new Map([
  [
    "TeachingAgent.search_teaching_material",
    {
      workerAgent: "TeachingAgent",
      skillId: "search_teaching_material",
      adapterId: TEACHING_AGENT_READONLY_RUNTIME_ADAPTER_ID,
      invoke: invokeTeachingAgentSearchTeachingMaterial,
    },
  ],
  [
    "StudentTutorAgent.recommend_practice",
    {
      workerAgent: "StudentTutorAgent",
      skillId: "recommend_practice",
      adapterId: STUDENT_TUTOR_AGENT_READONLY_RUNTIME_ADAPTER_ID,
      invoke: invokeStudentTutorRecommendPractice,
    },
  ],
  [
    "ResearchAgent.search_knowledge",
    {
      workerAgent: "ResearchAgent",
      skillId: "search_knowledge",
      adapterId: RESEARCH_AGENT_READONLY_RUNTIME_ADAPTER_ID,
      invoke: invokeResearchAgentSearchKnowledge,
    },
  ],
]);

export async function dispatchAgentReadonlyRuntime(input, deps = {}, options = {}) {
  const startedAt = nowMs();
  const normalized = normalizeDispatchInput(input);
  const adapter = resolveAdapter(normalized);
  const skillOutput = await adapter.invoke(normalized.skillInput, deps, options.adapterOptions ?? {});
  const runtimeMs = Math.max(0, nowMs() - startedAt);
  return buildDispatchOutput(normalized, adapter, skillOutput, runtimeMs);
}

export function formatAgentReadonlyRuntimeDispatchOutput(output) {
  return [
    `Agent read-only runtime dispatch: ${output.decision}`,
    `Route: ${output.workerAgent}.${output.skillId}`,
    `Adapter: ${output.adapterId}`,
    `Evidence refs: ${output.evidenceRefs.length}`,
  ].join("\n");
}

function normalizeDispatchInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const dispatchId = requireString(input.dispatchId, "input.dispatchId");
  const taskId = requireString(input.taskId, "input.taskId");
  const dispatcherId = input.dispatcherId ?? AGENT_READONLY_RUNTIME_DISPATCHER_ID;
  requireConst(dispatcherId, AGENT_READONLY_RUNTIME_DISPATCHER_ID, "input.dispatcherId");
  const routeDecision = assertRouteDecision(input.routeDecision, taskId);
  const skillInput = assertSkillInput(input.skillInput, taskId, routeDecision);
  const key = routeKey(routeDecision.workerAgents[0], routeDecision.selectedSkills[0]);
  return {
    schemaVersion: inputSchemaVersion,
    dispatchId,
    dispatcherId,
    taskId,
    routeDecision,
    workerAgent: routeDecision.workerAgents[0],
    skillId: routeDecision.selectedSkills[0],
    skillInput,
    evidenceRefs: uniqueStringArray(input.evidenceRefs ?? [], "input.evidenceRefs", 0, 64),
    inputHash: inputHash({
      dispatchId,
      taskId,
      workerAgent: routeDecision.workerAgents[0],
      skillId: routeDecision.selectedSkills[0],
      skillInput,
    }),
    adapterKey: key,
  };
}

function assertSkillInput(skillInput, taskId, routeDecision) {
  assertPlainObject(skillInput, "input.skillInput");
  requireConst(skillInput.taskId, taskId, "input.skillInput.taskId");
  requireConst(skillInput.writeIntent, false, "input.skillInput.writeIntent");
  requireConst(skillInput.externalModelAllowed, false, "input.skillInput.externalModelAllowed");
  if (skillInput.localToolMutationAllowed === true) {
    throw dispatcherError("AGENT_READONLY_RUNTIME_LOCAL_TOOL_MUTATION_DENIED", "local tool mutation is not allowed in the read-only dispatcher");
  }
  if (routeDecision.selectedSkills[0] === "search_teaching_material") {
    requireConst(skillInput.studentDataAccess, "NONE", "input.skillInput.studentDataAccess");
    requireConst(skillInput.filters?.includeStudentArchive, false, "input.skillInput.filters.includeStudentArchive");
    requireConst(skillInput.filters?.ownerType, "TEACHING", "input.skillInput.filters.ownerType");
  }
  if (routeDecision.selectedSkills[0] === "recommend_practice") {
    requireConst(skillInput.studentDataAccess, "OWN_OR_ASSIGNED", "input.skillInput.studentDataAccess");
    requireConst(skillInput.finalEvaluationAllowed, false, "input.skillInput.finalEvaluationAllowed");
    requireConst(skillInput.targetStudentScope?.crossStudentComparisonAllowed, false, "input.skillInput.targetStudentScope.crossStudentComparisonAllowed");
    requireConst(skillInput.filters?.includeOtherStudents, false, "input.skillInput.filters.includeOtherStudents");
  }
  if (routeDecision.selectedSkills[0] === "search_knowledge") {
    requireConst(skillInput.studentDataAccess, "NONE", "input.skillInput.studentDataAccess");
    requireConst(skillInput.filters?.includeStudentArchive, false, "input.skillInput.filters.includeStudentArchive");
    requireConst(skillInput.synthesisAllowed, false, "input.skillInput.synthesisAllowed");
  }
  return skillInput;
}

function assertRouteDecision(routeDecision, taskId) {
  assertPlainObject(routeDecision, "input.routeDecision");
  requireConst(routeDecision.taskId, taskId, "input.routeDecision.taskId");
  requireConst(routeDecision.mode, "SINGLE_WORKER", "input.routeDecision.mode");
  requireConst(routeDecision.leadAgent, "LeadAgent", "input.routeDecision.leadAgent");
  const workerAgents = uniqueStringArray(routeDecision.workerAgents, "input.routeDecision.workerAgents", 1, 1);
  const selectedSkills = uniqueStringArray(routeDecision.selectedSkills, "input.routeDecision.selectedSkills", 1, 1);
  requireIntegerBetween(routeDecision.p99BudgetMs, "input.routeDecision.p99BudgetMs", 1, 50);
  return {
    ...routeDecision,
    workerAgents,
    selectedSkills,
  };
}

function resolveAdapter(normalized) {
  const adapter = implementedRuntimeAdapters.get(normalized.adapterKey);
  if (adapter) return adapter;
  throw dispatcherError("AGENT_READONLY_RUNTIME_UNKNOWN_ADAPTER", `${normalized.adapterKey} is not in the read-only runtime allowlist`);
}

function buildDispatchOutput(normalized, adapter, skillOutput, runtimeMs) {
  const evidenceRefs = uniq([
    ...normalized.evidenceRefs,
    ...(Array.isArray(skillOutput.evidenceRefs) ? skillOutput.evidenceRefs : []),
    `evidence:dispatcher:${AGENT_READONLY_RUNTIME_DISPATCHER_ID}`,
    `evidence:adapter:${adapter.adapterId}`,
    `evidence:dispatch-input-hash:${normalized.inputHash}`,
    `evidence:dispatch-runtime-ms:${Math.round(runtimeMs)}`,
  ]);
  return {
    schemaVersion: outputSchemaVersion,
    dispatchId: normalized.dispatchId,
    dispatcherId: AGENT_READONLY_RUNTIME_DISPATCHER_ID,
    taskId: normalized.taskId,
    workerAgent: adapter.workerAgent,
    skillId: adapter.skillId,
    adapterId: adapter.adapterId,
    decision: "DISPATCHED",
    skillOutput,
    evidenceRefs,
    safety: {
      directDatabaseAccessAllowed: false,
      writeOperationAllowed: false,
      externalModelCallAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    slo: {
      p99BudgetMs: Math.min(normalized.routeDecision.p99BudgetMs, skillOutput.slo?.p99BudgetMs ?? 50),
      runtimeEvidenceClass: "REAL_AGENT_READONLY_ADAPTER_INVOCATION",
      runtimeEvidenceRequiredBeforePromotion: true,
    },
  };
}

function routeKey(workerAgent, skillId) {
  return `${workerAgent}.${skillId}`;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw dispatcherError("AGENT_READONLY_RUNTIME_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw dispatcherError("AGENT_READONLY_RUNTIME_INVALID_INPUT", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw dispatcherError("AGENT_READONLY_RUNTIME_BOUNDARY_VIOLATION", `${label} must be ${expected}`);
  }
}

function uniqueStringArray(value, label, minItems, maxItems) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw dispatcherError("AGENT_READONLY_RUNTIME_INVALID_INPUT", `${label} must contain ${minItems}-${maxItems} items`);
  }
  const items = value.map((item) => requireString(item, label));
  if (new Set(items).size !== items.length) {
    throw dispatcherError("AGENT_READONLY_RUNTIME_INVALID_INPUT", `${label} must be unique`);
  }
  return items;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw dispatcherError("AGENT_READONLY_RUNTIME_INVALID_INPUT", `${label} must be an object`);
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

function dispatcherError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
