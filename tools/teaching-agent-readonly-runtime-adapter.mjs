import { createHash } from "node:crypto";

export const TEACHING_AGENT_READONLY_RUNTIME_ADAPTER_ID = "teaching_agent_search_material_readonly_adapter";
export const TEACHING_AGENT_READONLY_RUNTIME_READ_PORT = "TeachingArchiveReadPort.searchTeachingMaterials";
export const TEACHING_AGENT_READONLY_RUNTIME_READY = "TEACHING_AGENT_READONLY_RUNTIME_ADAPTER_READY";

const inputSchemaVersion = "2026-06-04.agent.skill.search-teaching-material.input.v1";
const outputSchemaVersion = "2026-06-04.agent.skill.search-teaching-material.output.v1";
const allowedMaterialTypes = new Set(["TEACHING_MATERIAL", "HANDOUT", "QUIZ", "PAPER"]);

export async function invokeTeachingAgentSearchTeachingMaterial(input, deps = {}, options = {}) {
  const startedAt = nowMs();
  const normalized = normalizeInvocation(input, deps);
  const readPort = deps.readPort.searchTeachingMaterials;
  const rows = await readPort(buildReadPortRequest(normalized));
  const items = normalizeRows(rows, normalized.input.limits);
  const runtimeMs = Math.max(0, nowMs() - startedAt);
  return buildSkillOutput(normalized, items, runtimeMs, options);
}

export function formatTeachingAgentSearchTeachingMaterialOutput(output) {
  return [
    `TeachingAgent search_teaching_material: ${output.decision}`,
    `Items: ${output.items.length}`,
    `Evidence refs: ${output.evidenceRefs.length}`,
    `P99 budget: ${output.slo.p99BudgetMs}ms`,
  ].join("\n");
}

function normalizeInvocation(input, deps) {
  const normalizedInput = assertSkillInput(input);
  const principal = assertPrincipalContext(deps.principalContext);
  const sharedContext = assertSharedContext(deps.sharedContext, normalizedInput);
  const guardrailResult = assertGuardrailResult(deps.guardrailResult, normalizedInput);
  const routeDecision = assertRouteDecision(deps.routeDecision, normalizedInput);
  assertReadPort(deps.readPort);
  return {
    input: normalizedInput,
    principal,
    sharedContext,
    guardrailResult,
    routeDecision,
    inputHash: inputHash(normalizedInput),
  };
}

function assertSkillInput(input) {
  assertPlainObject(input, "input");
  requireString(input.schemaVersion, "input.schemaVersion");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const invocationId = requireString(input.invocationId, "input.invocationId");
  const taskId = requireString(input.taskId, "input.taskId");
  const contextRef = requireString(input.contextRef, "input.contextRef");
  const principalContextRef = requireString(input.principalContextRef, "input.principalContextRef");
  const query = requireBoundedString(input.query, "input.query", 1, 500).trim();
  assertPlainObject(input.filters, "input.filters");
  requireConst(input.filters.ownerType, "TEACHING", "input.filters.ownerType");
  requireConst(input.filters.includeStudentArchive, false, "input.filters.includeStudentArchive");
  const materialTypes = uniqueStringArray(input.filters.materialTypes, "input.filters.materialTypes", 1, 4);
  for (const materialType of materialTypes) {
    if (!allowedMaterialTypes.has(materialType)) {
      throw adapterError("TEACHING_AGENT_READONLY_INVALID_MATERIAL_TYPE", `unsupported material type ${materialType}`);
    }
  }
  const tags = uniqueStringArray(input.filters.tags ?? [], "input.filters.tags", 0, 8)
    .map((tag) => requireBoundedString(tag, "input.filters.tags[]", 1, 64));
  assertPlainObject(input.limits, "input.limits");
  const maxResults = requireIntegerBetween(input.limits.maxResults, "input.limits.maxResults", 1, 20);
  const maxSnippetChars = requireIntegerBetween(input.limits.maxSnippetChars, "input.limits.maxSnippetChars", 0, 500);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 64);
  const latencyBudgetMs = requireIntegerBetween(input.latencyBudgetMs, "input.latencyBudgetMs", 1, 50);
  requireConst(input.writeIntent, false, "input.writeIntent");
  requireConst(input.studentDataAccess, "NONE", "input.studentDataAccess");
  requireConst(input.externalModelAllowed, false, "input.externalModelAllowed");
  return {
    schemaVersion: inputSchemaVersion,
    invocationId,
    taskId,
    contextRef,
    principalContextRef,
    query,
    filters: {
      ownerType: "TEACHING",
      materialTypes,
      tags,
      includeStudentArchive: false,
    },
    limits: {
      maxResults,
      maxSnippetChars,
    },
    evidenceRefs,
    latencyBudgetMs,
    writeIntent: false,
    studentDataAccess: "NONE",
    externalModelAllowed: false,
  };
}

function assertPrincipalContext(principal) {
  assertPlainObject(principal, "principalContext");
  const principalId = requireString(principal.principalId, "principalContext.principalId");
  const role = requireString(principal.role, "principalContext.role");
  const subjectType = requireString(principal.subjectType, "principalContext.subjectType");
  const entryPoint = requireString(principal.entryPoint, "principalContext.entryPoint");
  const scopes = uniqueStringArray(principal.scopes, "principalContext.scopes", 1, 32);
  if (role === "STUDENT" || role === "REMOTE_OPERATOR" || subjectType === "REMOTE_CHANNEL") {
    throw adapterError("TEACHING_AGENT_READONLY_FORBIDDEN_PRINCIPAL", "students and remote channels cannot invoke the teaching material read-only adapter");
  }
  if (!scopes.includes("TEACHING_READ") && !scopes.includes("ADMIN_SYSTEM")) {
    throw adapterError("TEACHING_AGENT_READONLY_MISSING_SCOPE", "TEACHING_READ or ADMIN_SYSTEM scope is required");
  }
  if (entryPoint === "STUDENT_APP" || entryPoint === "REMOTE_SOCIAL") {
    throw adapterError("TEACHING_AGENT_READONLY_FORBIDDEN_ENTRYPOINT", "student and remote social entry points cannot invoke this adapter");
  }
  return { principalId, role, subjectType, entryPoint, scopes };
}

function assertSharedContext(sharedContext, input) {
  assertPlainObject(sharedContext, "sharedContext");
  requireConst(sharedContext.contextId, input.contextRef, "sharedContext.contextId");
  requireConst(sharedContext.taskId, input.taskId, "sharedContext.taskId");
  requireConst(sharedContext.principalContextRef, input.principalContextRef, "sharedContext.principalContextRef");
  assertPlainObject(sharedContext.dataScopes, "sharedContext.dataScopes");
  requireConst(sharedContext.dataScopes.teaching, "READ", "sharedContext.dataScopes.teaching");
  requireConst(sharedContext.dataScopes.student, "NONE", "sharedContext.dataScopes.student");
  requireConst(sharedContext.dataScopes.knowledge, "PUBLIC", "sharedContext.dataScopes.knowledge");
  requireConst(sharedContext.dataScopes.tool, "NONE", "sharedContext.dataScopes.tool");
  assertPlainObject(sharedContext.redactionState, "sharedContext.redactionState");
  requireConst(sharedContext.redactionState.studentDataRedacted, true, "sharedContext.redactionState.studentDataRedacted");
  requireConst(sharedContext.redactionState.privateKnowledgeRedacted, true, "sharedContext.redactionState.privateKnowledgeRedacted");
  requireConst(sharedContext.redactionState.externalModelAllowed, false, "sharedContext.redactionState.externalModelAllowed");
  const evidenceRefs = Array.isArray(sharedContext.evidenceRefs) ? sharedContext.evidenceRefs.map(String) : [];
  return {
    contextId: sharedContext.contextId,
    taskId: sharedContext.taskId,
    principalContextRef: sharedContext.principalContextRef,
    evidenceRefs,
  };
}

function assertGuardrailResult(guardrailResult, input) {
  assertPlainObject(guardrailResult, "guardrailResult");
  requireConst(guardrailResult.taskId, input.taskId, "guardrailResult.taskId");
  requireConst(guardrailResult.skillId, "search_teaching_material", "guardrailResult.skillId");
  requireConst(guardrailResult.decision, "ALLOW", "guardrailResult.decision");
  requireConst(guardrailResult.evidenceRequired, true, "guardrailResult.evidenceRequired");
  requireConst(guardrailResult.directDatabaseWriteAllowed, false, "guardrailResult.directDatabaseWriteAllowed");
  if (!Array.isArray(guardrailResult.safetyChecks) || guardrailResult.safetyChecks.length === 0) {
    throw adapterError("TEACHING_AGENT_READONLY_GUARDRAIL_CHECKS", "guardrailResult.safetyChecks must be non-empty");
  }
  const failed = guardrailResult.safetyChecks.find((check) => check?.status !== "PASS");
  if (failed) {
    throw adapterError("TEACHING_AGENT_READONLY_GUARDRAIL_FAILED", `guardrail safety check failed: ${failed.checkId ?? "unknown"}`);
  }
  return guardrailResult;
}

function assertRouteDecision(routeDecision, input) {
  assertPlainObject(routeDecision, "routeDecision");
  requireConst(routeDecision.taskId, input.taskId, "routeDecision.taskId");
  requireConst(routeDecision.mode, "SINGLE_WORKER", "routeDecision.mode");
  requireConst(routeDecision.leadAgent, "LeadAgent", "routeDecision.leadAgent");
  const workerAgents = uniqueStringArray(routeDecision.workerAgents, "routeDecision.workerAgents", 1, 3);
  const selectedSkills = uniqueStringArray(routeDecision.selectedSkills, "routeDecision.selectedSkills", 1, 3);
  if (workerAgents.length !== 1 || workerAgents[0] !== "TeachingAgent") {
    throw adapterError("TEACHING_AGENT_READONLY_ROUTE_WORKER", "routeDecision must select TeachingAgent only");
  }
  if (selectedSkills.length !== 1 || selectedSkills[0] !== "search_teaching_material") {
    throw adapterError("TEACHING_AGENT_READONLY_ROUTE_SKILL", "routeDecision must select search_teaching_material only");
  }
  requireIntegerBetween(routeDecision.p99BudgetMs, "routeDecision.p99BudgetMs", 1, 50);
  return routeDecision;
}

function assertReadPort(readPort) {
  assertPlainObject(readPort, "readPort");
  if (typeof readPort.searchTeachingMaterials !== "function") {
    throw adapterError("TEACHING_AGENT_READONLY_MISSING_READ_PORT", "readPort.searchTeachingMaterials must be injected");
  }
}

function buildReadPortRequest(normalized) {
  const { input, principal, sharedContext, guardrailResult, routeDecision } = normalized;
  return {
    portName: "TeachingArchiveReadPort",
    operation: "searchTeachingMaterials",
    invocationId: input.invocationId,
    taskId: input.taskId,
    contextRef: input.contextRef,
    principal: {
      principalId: principal.principalId,
      role: principal.role,
      scopes: principal.scopes,
    },
    query: input.query,
    filters: input.filters,
    limits: input.limits,
    evidenceRefs: uniq([
      ...input.evidenceRefs,
      ...sharedContext.evidenceRefs,
      guardrailResult.guardrailId ? `evidence:guardrail:${guardrailResult.guardrailId}` : null,
      routeDecision.routeId ? `evidence:route:${routeDecision.routeId}` : null,
      `evidence:input-hash:${normalized.inputHash}`,
    ]),
    safety: {
      directDatabaseAccessAllowed: false,
      writeOperationAllowed: false,
      studentDataAccess: "NONE",
      externalModelAllowed: false,
    },
  };
}

function normalizeRows(rows, limits) {
  if (!Array.isArray(rows)) {
    throw adapterError("TEACHING_AGENT_READONLY_INVALID_READ_PORT_RESULT", "read port result must be an array");
  }
  return rows.slice(0, limits.maxResults).map((row, index) => normalizeRow(row, index, limits));
}

function normalizeRow(row, index, limits) {
  assertPlainObject(row, `readPort.rows[${index}]`);
  if (row.studentDataReturned === true || row.privateKnowledgeReturned === true || row.externalModelUsed === true) {
    throw adapterError("TEACHING_AGENT_READONLY_UNSAFE_ROW", "read port row claims unsafe data or external model use");
  }
  const archiveItemId = requireBoundedString(row.archiveItemId ?? row.id, `rows[${index}].archiveItemId`, 1, 120);
  if (!/^tarch_[a-zA-Z0-9_-]+$/.test(archiveItemId)) {
    throw adapterError("TEACHING_AGENT_READONLY_INVALID_ARCHIVE_ID", `invalid archiveItemId ${archiveItemId}`);
  }
  const ownerType = row.ownerType ?? "TEACHING";
  requireConst(ownerType, "TEACHING", `rows[${index}].ownerType`);
  const materialType = requireString(row.materialType ?? row.type, `rows[${index}].materialType`);
  if (!allowedMaterialTypes.has(materialType)) {
    throw adapterError("TEACHING_AGENT_READONLY_INVALID_MATERIAL_TYPE", `unsupported row material type ${materialType}`);
  }
  const sourceEvidenceRefs = uniqueStringArray(
    row.sourceEvidenceRefs ?? [`evidence:source:${archiveItemId}`],
    `rows[${index}].sourceEvidenceRefs`,
    1,
    16,
  );
  return {
    archiveItemId,
    ownerType: "TEACHING",
    materialType,
    title: requireBoundedString(row.title, `rows[${index}].title`, 1, 200),
    contentRef: requireBoundedString(row.contentRef, `rows[${index}].contentRef`, 1, 1000),
    matchedSnippets: normalizeSnippets(row.matchedSnippets ?? row.snippets ?? [], index, limits.maxSnippetChars),
    sourceEvidenceRefs,
  };
}

function normalizeSnippets(snippets, rowIndex, maxSnippetChars) {
  if (!Array.isArray(snippets)) {
    throw adapterError("TEACHING_AGENT_READONLY_INVALID_SNIPPETS", `rows[${rowIndex}].matchedSnippets must be an array`);
  }
  if (maxSnippetChars === 0) return [];
  return snippets.slice(0, 5).map((snippet, snippetIndex) => {
    assertPlainObject(snippet, `rows[${rowIndex}].matchedSnippets[${snippetIndex}]`);
    return {
      text: truncate(requireString(snippet.text, `snippet[${snippetIndex}].text`), maxSnippetChars),
      score: clampScore(snippet.score),
      sourceRef: requireString(snippet.sourceRef, `snippet[${snippetIndex}].sourceRef`),
    };
  });
}

function buildSkillOutput(normalized, items, runtimeMs, options) {
  const { input, sharedContext } = normalized;
  const itemEvidence = items.flatMap((item) => item.sourceEvidenceRefs);
  const evidenceRefs = uniq([
    ...input.evidenceRefs,
    ...sharedContext.evidenceRefs,
    ...itemEvidence,
    `evidence:input-hash:${normalized.inputHash}`,
    `evidence:adapter:${TEACHING_AGENT_READONLY_RUNTIME_ADAPTER_ID}`,
    `evidence:read-port:${TEACHING_AGENT_READONLY_RUNTIME_READ_PORT}`,
    `evidence:runtime-ms:${Math.round(runtimeMs)}`,
  ]);
  return {
    schemaVersion: outputSchemaVersion,
    invocationId: input.invocationId,
    taskId: input.taskId,
    contextRef: input.contextRef,
    decision: items.length > 0 ? "FOUND" : "NO_MATCH",
    summary: items.length > 0
      ? `Found ${items.length} teaching material item(s) through the injected read port.`
      : "No teaching materials matched the read-only search request.",
    items,
    evidenceRefs,
    safety: {
      directDatabaseWriteAllowed: false,
      studentDataReturned: false,
      privateKnowledgeReturned: false,
      externalModelUsed: false,
    },
    slo: {
      p99BudgetMs: Math.min(input.latencyBudgetMs, options.p99BudgetMs ?? 50),
      runtimeEvidenceClass: "CONTRACT_ONLY",
      runtimeEvidenceRequiredBeforePromotion: true,
    },
  };
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw adapterError("TEACHING_AGENT_READONLY_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireBoundedString(value, label, minLength, maxLength) {
  const text = requireString(value, label);
  if (text.length < minLength || text.length > maxLength) {
    throw adapterError("TEACHING_AGENT_READONLY_INVALID_INPUT", `${label} length must be ${minLength}-${maxLength}`);
  }
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw adapterError("TEACHING_AGENT_READONLY_INVALID_INPUT", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw adapterError("TEACHING_AGENT_READONLY_BOUNDARY_VIOLATION", `${label} must be ${expected}`);
  }
}

function uniqueStringArray(value, label, minItems, maxItems) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw adapterError("TEACHING_AGENT_READONLY_INVALID_INPUT", `${label} must contain ${minItems}-${maxItems} items`);
  }
  const items = value.map((item) => requireString(item, label));
  if (new Set(items).size !== items.length) {
    throw adapterError("TEACHING_AGENT_READONLY_INVALID_INPUT", `${label} must be unique`);
  }
  return items;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw adapterError("TEACHING_AGENT_READONLY_INVALID_INPUT", `${label} must be an object`);
  }
}

function inputHash(input) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 24);
}

function truncate(text, maxLength) {
  return text.length <= maxLength ? text : text.slice(0, maxLength);
}

function clampScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.min(1, Math.max(0, score));
}

function uniq(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
}

function nowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function adapterError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
