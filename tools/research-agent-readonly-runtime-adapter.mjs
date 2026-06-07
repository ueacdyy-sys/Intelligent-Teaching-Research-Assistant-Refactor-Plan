import { createHash } from "node:crypto";

export const RESEARCH_AGENT_READONLY_RUNTIME_ADAPTER_ID = "research_agent_search_knowledge_readonly_adapter";
export const RESEARCH_AGENT_READONLY_RUNTIME_READ_PORT = "KnowledgeQueryReadPort.searchKnowledge";
export const RESEARCH_AGENT_READONLY_RUNTIME_READY = "RESEARCH_AGENT_READONLY_RUNTIME_ADAPTER_READY";

const inputSchemaVersion = "2026-06-04.agent.skill.search-knowledge.input.v1";
const outputSchemaVersion = "2026-06-04.agent.skill.search-knowledge.output.v1";
const allowedNodeTypes = new Set(["CLOUD", "LOCAL", "REMOTE_DEVICE"]);
const allowedClassifications = new Set(["PUBLIC", "PRIVATE", "REMOTE_DEVICE_OWNED"]);

export async function invokeResearchAgentSearchKnowledge(input, deps = {}, options = {}) {
  const startedAt = nowMs();
  const normalized = normalizeInvocation(input, deps);
  const readPort = deps.readPort.searchKnowledge;
  const rows = await readPort(buildReadPortRequest(normalized));
  const items = normalizeRows(rows, normalized.input);
  const runtimeMs = Math.max(0, nowMs() - startedAt);
  return buildSkillOutput(normalized, items, runtimeMs, options);
}

export function formatResearchAgentSearchKnowledgeOutput(output) {
  return [
    `ResearchAgent search_knowledge: ${output.decision}`,
    `Items: ${output.items.length}`,
    `Evidence refs: ${output.evidenceRefs.length}`,
    `P99 budget: ${output.slo.p99BudgetMs}ms`,
  ].join("\n");
}

function normalizeInvocation(input, deps) {
  const normalizedInput = assertSkillInput(input);
  const principal = assertPrincipalContext(deps.principalContext, normalizedInput);
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
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const invocationId = requireString(input.invocationId, "input.invocationId");
  const taskId = requireString(input.taskId, "input.taskId");
  const contextRef = requireString(input.contextRef, "input.contextRef");
  const principalContextRef = requireString(input.principalContextRef, "input.principalContextRef");
  const query = requireBoundedString(input.query, "input.query", 1, 800).trim();

  assertPlainObject(input.filters, "input.filters");
  const nodeType = requireEnum(input.filters.nodeType, "input.filters.nodeType", [...allowedNodeTypes]);
  const allowed = uniqueStringArray(input.filters.allowedClassifications, "input.filters.allowedClassifications", 1, 3)
    .map((classification) =>
      requireEnum(classification, "input.filters.allowedClassifications[]", [...allowedClassifications])
    );
  if (allowed.includes("REMOTE_DEVICE_OWNED") && nodeType !== "REMOTE_DEVICE") {
    throw adapterError("RESEARCH_READONLY_REMOTE_SCOPE_MISMATCH", "REMOTE_DEVICE_OWNED classification requires REMOTE_DEVICE nodeType");
  }
  if (nodeType === "REMOTE_DEVICE" && !allowed.includes("REMOTE_DEVICE_OWNED")) {
    throw adapterError("RESEARCH_READONLY_REMOTE_SCOPE_MISMATCH", "REMOTE_DEVICE searches must use REMOTE_DEVICE_OWNED classification");
  }
  const intentTags = uniqueStringArray(input.filters.intentTags ?? [], "input.filters.intentTags", 0, 8)
    .map((tag) => requireBoundedString(tag, "input.filters.intentTags[]", 1, 64));
  requireConst(input.filters.includeStudentArchive, false, "input.filters.includeStudentArchive");

  assertPlainObject(input.limits, "input.limits");
  const maxResults = requireIntegerBetween(input.limits.maxResults, "input.limits.maxResults", 1, 20);
  const maxSnippetChars = requireIntegerBetween(input.limits.maxSnippetChars, "input.limits.maxSnippetChars", 0, 600);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 64);
  const latencyBudgetMs = requireIntegerBetween(input.latencyBudgetMs, "input.latencyBudgetMs", 1, 50);
  requireConst(input.writeIntent, false, "input.writeIntent");
  requireConst(input.studentDataAccess, "NONE", "input.studentDataAccess");
  requireConst(input.externalModelAllowed, false, "input.externalModelAllowed");
  requireConst(input.synthesisAllowed, false, "input.synthesisAllowed");

  return {
    schemaVersion: inputSchemaVersion,
    invocationId,
    taskId,
    contextRef,
    principalContextRef,
    query,
    filters: {
      nodeType,
      allowedClassifications: allowed,
      intentTags,
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
    synthesisAllowed: false,
  };
}

function assertPrincipalContext(principal, input) {
  assertPlainObject(principal, "principalContext");
  const principalId = requireString(principal.principalId, "principalContext.principalId");
  const role = requireString(principal.role, "principalContext.role");
  const subjectType = requireString(principal.subjectType, "principalContext.subjectType");
  const entryPoint = requireString(principal.entryPoint, "principalContext.entryPoint");
  const scopes = uniqueStringArray(principal.scopes, "principalContext.scopes", 1, 32);
  if (role === "STUDENT" || role === "REMOTE_OPERATOR" || subjectType === "REMOTE_CHANNEL" || entryPoint === "REMOTE_SOCIAL") {
    throw adapterError("RESEARCH_READONLY_FORBIDDEN_PRINCIPAL", "student and remote principals cannot invoke ResearchAgent read-only knowledge search");
  }
  if (!scopes.includes("RESEARCH_READ") && !scopes.includes("ADMIN_SYSTEM")) {
    throw adapterError("RESEARCH_READONLY_MISSING_RESEARCH_SCOPE", "RESEARCH_READ or ADMIN_SYSTEM scope is required");
  }
  if (input.filters.allowedClassifications.includes("PUBLIC") &&
      !hasAny(scopes, ["KNOWLEDGE_PUBLIC_READ", "KNOWLEDGE_PRIVATE_READ", "ADMIN_SYSTEM"])) {
    throw adapterError("RESEARCH_READONLY_MISSING_PUBLIC_SCOPE", "knowledge public read scope is required");
  }
  if (input.filters.allowedClassifications.includes("PRIVATE") &&
      !hasAny(scopes, ["KNOWLEDGE_PRIVATE_READ", "ADMIN_SYSTEM"])) {
    throw adapterError("RESEARCH_READONLY_MISSING_PRIVATE_SCOPE", "knowledge private read scope is required");
  }
  if (input.filters.allowedClassifications.includes("REMOTE_DEVICE_OWNED") &&
      !hasAny(scopes, ["REMOTE_DEVICE_READ", "ADMIN_SYSTEM"])) {
    throw adapterError("RESEARCH_READONLY_MISSING_REMOTE_SCOPE", "remote device read scope is required");
  }
  return { principalId, role, subjectType, entryPoint, scopes };
}

function assertSharedContext(sharedContext, input) {
  assertPlainObject(sharedContext, "sharedContext");
  requireConst(sharedContext.contextId, input.contextRef, "sharedContext.contextId");
  requireConst(sharedContext.taskId, input.taskId, "sharedContext.taskId");
  requireConst(sharedContext.principalContextRef, input.principalContextRef, "sharedContext.principalContextRef");
  assertPlainObject(sharedContext.dataScopes, "sharedContext.dataScopes");
  requireConst(sharedContext.dataScopes.teaching, "NONE", "sharedContext.dataScopes.teaching");
  requireConst(sharedContext.dataScopes.student, "NONE", "sharedContext.dataScopes.student");
  requireConst(sharedContext.dataScopes.research, "READ", "sharedContext.dataScopes.research");
  requireConst(sharedContext.dataScopes.knowledge, "PRIVATE_ASSIGNED", "sharedContext.dataScopes.knowledge");
  requireConst(sharedContext.dataScopes.tool ?? sharedContext.dataScopes.localTool, "NONE", "sharedContext.dataScopes.tool");
  assertPlainObject(sharedContext.redactionState, "sharedContext.redactionState");
  requireConst(sharedContext.redactionState.studentDataRedacted, true, "sharedContext.redactionState.studentDataRedacted");
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
  requireConst(guardrailResult.skillId, "search_knowledge", "guardrailResult.skillId");
  requireConst(guardrailResult.decision, "ALLOW", "guardrailResult.decision");
  requireConst(guardrailResult.evidenceRequired, true, "guardrailResult.evidenceRequired");
  requireConst(guardrailResult.directDatabaseWriteAllowed, false, "guardrailResult.directDatabaseWriteAllowed");
  if (!Array.isArray(guardrailResult.safetyChecks) || guardrailResult.safetyChecks.length === 0) {
    throw adapterError("RESEARCH_READONLY_GUARDRAIL_CHECKS", "guardrailResult.safetyChecks must be non-empty");
  }
  const failed = guardrailResult.safetyChecks.find((check) => check?.status !== "PASS");
  if (failed) {
    throw adapterError("RESEARCH_READONLY_GUARDRAIL_FAILED", `guardrail safety check failed: ${failed.checkId ?? "unknown"}`);
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
  if (workerAgents.length !== 1 || workerAgents[0] !== "ResearchAgent") {
    throw adapterError("RESEARCH_READONLY_ROUTE_WORKER", "routeDecision must select ResearchAgent only");
  }
  if (selectedSkills.length !== 1 || selectedSkills[0] !== "search_knowledge") {
    throw adapterError("RESEARCH_READONLY_ROUTE_SKILL", "routeDecision must select search_knowledge only");
  }
  requireIntegerBetween(routeDecision.p99BudgetMs, "routeDecision.p99BudgetMs", 1, 50);
  return routeDecision;
}

function assertReadPort(readPort) {
  assertPlainObject(readPort, "readPort");
  if (typeof readPort.searchKnowledge !== "function") {
    throw adapterError("RESEARCH_READONLY_MISSING_READ_PORT", "readPort.searchKnowledge must be injected");
  }
}

function buildReadPortRequest(normalized) {
  const { input, principal, sharedContext, guardrailResult, routeDecision } = normalized;
  return {
    portName: "KnowledgeQueryReadPort",
    operation: "searchKnowledge",
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
      `evidence:classification-scope:${input.filters.allowedClassifications.join("+")}`,
      `evidence:input-hash:${normalized.inputHash}`,
    ]),
    safety: {
      directDatabaseAccessAllowed: false,
      writeOperationAllowed: false,
      studentArchiveAllowed: false,
      studentDataAccess: "NONE",
      externalModelAllowed: false,
      synthesisAllowed: false,
      localToolMutationAllowed: false,
      allowedClassifications: input.filters.allowedClassifications,
    },
  };
}

function normalizeRows(rows, input) {
  if (!Array.isArray(rows)) {
    throw adapterError("RESEARCH_READONLY_INVALID_READ_PORT_RESULT", "read port result must be an array");
  }
  return rows.slice(0, input.limits.maxResults).map((row, index) => normalizeRow(row, index, input));
}

function normalizeRow(row, index, input) {
  assertPlainObject(row, `readPort.rows[${index}]`);
  if (
    row.directDatabaseWriteAllowed === true ||
    row.writeOperationAllowed === true ||
    row.studentArchiveReturned === true ||
    row.studentDataReturned === true ||
    row.returnedWithinPolicy === false ||
    row.externalModelUsed === true ||
    row.localToolMutationAllowed === true
  ) {
    throw adapterError("RESEARCH_READONLY_UNSAFE_ROW", "read port row claims unsafe write, student, model, tool, or policy state");
  }
  const classification = requireEnum(row.classification, `rows[${index}].classification`, [...allowedClassifications]);
  if (!input.filters.allowedClassifications.includes(classification)) {
    throw adapterError("RESEARCH_READONLY_OUT_OF_POLICY_CLASSIFICATION", `row returned out-of-policy classification ${classification}`);
  }
  if (classification === "REMOTE_DEVICE_OWNED" && input.filters.nodeType !== "REMOTE_DEVICE") {
    throw adapterError("RESEARCH_READONLY_REMOTE_SCOPE_MISMATCH", "REMOTE_DEVICE_OWNED rows require REMOTE_DEVICE input nodeType");
  }
  const documentId = requireBoundedString(row.documentId ?? row.id, `rows[${index}].documentId`, 1, 200);
  const chunkId = requireBoundedString(row.chunkId, `rows[${index}].chunkId`, 1, 200);
  const sourceEvidenceRefs = uniqueStringArray(
    row.sourceEvidenceRefs ?? [`evidence:source:${documentId}:${chunkId}`],
    `rows[${index}].sourceEvidenceRefs`,
    1,
    16,
  );
  return {
    documentId,
    chunkId,
    classification,
    title: requireBoundedString(row.title, `rows[${index}].title`, 1, 200),
    citation: requireBoundedString(row.citation, `rows[${index}].citation`, 1, 500),
    matchedSnippets: normalizeSnippets(row.matchedSnippets ?? row.snippets ?? [], index, input.limits.maxSnippetChars),
    sourceEvidenceRefs,
  };
}

function normalizeSnippets(snippets, rowIndex, maxSnippetChars) {
  if (!Array.isArray(snippets)) {
    throw adapterError("RESEARCH_READONLY_INVALID_SNIPPETS", `rows[${rowIndex}].matchedSnippets must be an array`);
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
    `evidence:adapter:${RESEARCH_AGENT_READONLY_RUNTIME_ADAPTER_ID}`,
    `evidence:read-port:${RESEARCH_AGENT_READONLY_RUNTIME_READ_PORT}`,
    `evidence:runtime-ms:${Math.round(runtimeMs)}`,
  ]);
  return {
    schemaVersion: outputSchemaVersion,
    invocationId: input.invocationId,
    taskId: input.taskId,
    contextRef: input.contextRef,
    decision: items.length > 0 ? "FOUND" : "NO_MATCH",
    summary: items.length > 0
      ? `Found ${items.length} policy-scoped knowledge item(s) through the injected read port.`
      : "No policy-scoped knowledge items matched the read-only request.",
    items,
    evidenceRefs,
    safety: {
      directDatabaseWriteAllowed: false,
      studentArchiveReturned: false,
      studentDataReturned: false,
      returnedWithinPolicy: true,
      externalModelUsed: false,
      localToolMutationAllowed: false,
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
    throw adapterError("RESEARCH_READONLY_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireBoundedString(value, label, minLength, maxLength) {
  const text = requireString(value, label);
  if (text.length < minLength || text.length > maxLength) {
    throw adapterError("RESEARCH_READONLY_INVALID_INPUT", `${label} length must be ${minLength}-${maxLength}`);
  }
  return text;
}

function requireEnum(value, label, allowed) {
  const text = requireString(value, label);
  if (!allowed.includes(text)) {
    throw adapterError("RESEARCH_READONLY_INVALID_INPUT", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw adapterError("RESEARCH_READONLY_INVALID_INPUT", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw adapterError("RESEARCH_READONLY_BOUNDARY_VIOLATION", `${label} must be ${expected}`);
  }
}

function uniqueStringArray(value, label, minItems, maxItems) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw adapterError("RESEARCH_READONLY_INVALID_INPUT", `${label} must contain ${minItems}-${maxItems} items`);
  }
  const items = value.map((item) => requireString(item, label));
  if (new Set(items).size !== items.length) {
    throw adapterError("RESEARCH_READONLY_INVALID_INPUT", `${label} must be unique`);
  }
  return items;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw adapterError("RESEARCH_READONLY_INVALID_INPUT", `${label} must be an object`);
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

function hasAny(values, candidates) {
  return candidates.some((candidate) => values.includes(candidate));
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
