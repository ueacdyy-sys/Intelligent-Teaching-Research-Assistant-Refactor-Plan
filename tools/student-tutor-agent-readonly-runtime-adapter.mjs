import { createHash } from "node:crypto";

export const STUDENT_TUTOR_AGENT_READONLY_RUNTIME_ADAPTER_ID = "student_tutor_recommend_practice_readonly_adapter";
export const STUDENT_TUTOR_AGENT_READONLY_RUNTIME_READ_PORT = "StudentLearningReadPort.recommendPracticeContext";
export const STUDENT_TUTOR_AGENT_READONLY_RUNTIME_READY = "STUDENT_TUTOR_AGENT_READONLY_RUNTIME_ADAPTER_READY";

const inputSchemaVersion = "2026-06-04.agent.skill.recommend-practice.input.v1";
const outputSchemaVersion = "2026-06-04.agent.skill.recommend-practice.output.v1";
const allowedSourceTypes = new Set(["TEACHING_MATERIAL", "QUESTION_BANK", "ARCHIVE_DERIVED_PRACTICE"]);

export async function invokeStudentTutorRecommendPractice(input, deps = {}, options = {}) {
  const startedAt = nowMs();
  const normalized = normalizeInvocation(input, deps);
  const readPort = deps.readPort.recommendPracticeContext;
  const rows = await readPort(buildReadPortRequest(normalized));
  const recommendations = normalizeRows(rows, normalized.input, normalized.targetStudentIds);
  const runtimeMs = Math.max(0, nowMs() - startedAt);
  return buildSkillOutput(normalized, recommendations, runtimeMs, options);
}

export function formatStudentTutorRecommendPracticeOutput(output) {
  return [
    `StudentTutorAgent recommend_practice: ${output.decision}`,
    `Recommendations: ${output.recommendations.length}`,
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
    targetStudentIds: new Set(normalizedInput.targetStudentScope.studentIds),
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
  const query = requireBoundedString(input.query, "input.query", 1, 500).trim();

  assertPlainObject(input.targetStudentScope, "input.targetStudentScope");
  const mode = requireEnum(input.targetStudentScope.mode, "input.targetStudentScope.mode", ["OWN", "ASSIGNED"]);
  const studentIds = uniqueStringArray(input.targetStudentScope.studentIds, "input.targetStudentScope.studentIds", 1, 32)
    .map((studentId) => requireBoundedString(studentId, "input.targetStudentScope.studentIds[]", 1, 80));
  requireConst(input.targetStudentScope.crossStudentComparisonAllowed, false, "input.targetStudentScope.crossStudentComparisonAllowed");

  assertPlainObject(input.learningSignals, "input.learningSignals");
  const knowledgePointIds = uniqueStringArray(input.learningSignals.knowledgePointIds, "input.learningSignals.knowledgePointIds", 1, 12)
    .map((id) => requireBoundedString(id, "input.learningSignals.knowledgePointIds[]", 1, 80));
  const recentMistakeRefs = uniqueStringArray(input.learningSignals.recentMistakeRefs ?? [], "input.learningSignals.recentMistakeRefs", 0, 12)
    .map((ref) => requireBoundedString(ref, "input.learningSignals.recentMistakeRefs[]", 1, 120));
  const archiveItemRefs = uniqueStringArray(input.learningSignals.archiveItemRefs ?? [], "input.learningSignals.archiveItemRefs", 0, 12)
    .map((ref) => requireBoundedString(ref, "input.learningSignals.archiveItemRefs[]", 1, 120));

  assertPlainObject(input.filters, "input.filters");
  requireConst(input.filters.includeTeachingMaterials, true, "input.filters.includeTeachingMaterials");
  requireConst(input.filters.includeStudentArchive, true, "input.filters.includeStudentArchive");
  requireConst(input.filters.includeOtherStudents, false, "input.filters.includeOtherStudents");

  assertPlainObject(input.limits, "input.limits");
  const maxRecommendations = requireIntegerBetween(input.limits.maxRecommendations, "input.limits.maxRecommendations", 1, 10);
  const maxReasonChars = requireIntegerBetween(input.limits.maxReasonChars, "input.limits.maxReasonChars", 1, 500);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 64);
  const latencyBudgetMs = requireIntegerBetween(input.latencyBudgetMs, "input.latencyBudgetMs", 1, 50);
  requireConst(input.writeIntent, false, "input.writeIntent");
  requireConst(input.studentDataAccess, "OWN_OR_ASSIGNED", "input.studentDataAccess");
  requireConst(input.externalModelAllowed, false, "input.externalModelAllowed");
  requireConst(input.finalEvaluationAllowed, false, "input.finalEvaluationAllowed");

  return {
    schemaVersion: inputSchemaVersion,
    invocationId,
    taskId,
    contextRef,
    principalContextRef,
    query,
    targetStudentScope: {
      mode,
      studentIds,
      crossStudentComparisonAllowed: false,
    },
    learningSignals: {
      knowledgePointIds,
      recentMistakeRefs,
      archiveItemRefs,
    },
    filters: {
      includeTeachingMaterials: true,
      includeStudentArchive: true,
      includeOtherStudents: false,
    },
    limits: {
      maxRecommendations,
      maxReasonChars,
    },
    evidenceRefs,
    latencyBudgetMs,
    writeIntent: false,
    studentDataAccess: "OWN_OR_ASSIGNED",
    externalModelAllowed: false,
    finalEvaluationAllowed: false,
  };
}

function assertPrincipalContext(principal, input) {
  assertPlainObject(principal, "principalContext");
  const principalId = requireString(principal.principalId, "principalContext.principalId");
  const role = requireString(principal.role, "principalContext.role");
  const subjectType = requireString(principal.subjectType, "principalContext.subjectType");
  const entryPoint = requireString(principal.entryPoint, "principalContext.entryPoint");
  const scopes = uniqueStringArray(principal.scopes, "principalContext.scopes", 1, 32);
  if (role === "REMOTE_OPERATOR" || subjectType === "REMOTE_CHANNEL" || entryPoint === "REMOTE_SOCIAL") {
    throw adapterError("STUDENT_TUTOR_READONLY_FORBIDDEN_PRINCIPAL", "remote principals cannot invoke StudentTutor read-only recommendations");
  }
  if (input.targetStudentScope.mode === "OWN") {
    if (role !== "STUDENT" && !scopes.includes("ADMIN_SYSTEM")) {
      throw adapterError("STUDENT_TUTOR_READONLY_FORBIDDEN_OWN_SCOPE", "OWN recommendations require a student principal or ADMIN_SYSTEM");
    }
    if (role === "STUDENT" && !input.targetStudentScope.studentIds.includes(principalId)) {
      throw adapterError("STUDENT_TUTOR_READONLY_STUDENT_SCOPE_MISMATCH", "student principals can only request their own recommendations");
    }
    if (!scopes.includes("STUDENT_OWN_READ") && !scopes.includes("ADMIN_SYSTEM")) {
      throw adapterError("STUDENT_TUTOR_READONLY_MISSING_SCOPE", "STUDENT_OWN_READ or ADMIN_SYSTEM scope is required");
    }
  }
  if (input.targetStudentScope.mode === "ASSIGNED") {
    if (role === "STUDENT") {
      throw adapterError("STUDENT_TUTOR_READONLY_FORBIDDEN_ASSIGNED_SCOPE", "student principals cannot request assigned-student recommendations");
    }
    if (!scopes.includes("STUDENT_ASSIGNED_READ") && !scopes.includes("ADMIN_SYSTEM")) {
      throw adapterError("STUDENT_TUTOR_READONLY_MISSING_SCOPE", "STUDENT_ASSIGNED_READ or ADMIN_SYSTEM scope is required");
    }
  }
  if (!scopes.includes("TEACHING_READ") && !scopes.includes("ADMIN_SYSTEM")) {
    throw adapterError("STUDENT_TUTOR_READONLY_MISSING_TEACHING_SCOPE", "TEACHING_READ or ADMIN_SYSTEM scope is required");
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
  requireConst(sharedContext.dataScopes.student, "ASSIGNED", "sharedContext.dataScopes.student");
  requireConst(sharedContext.dataScopes.knowledge, "PUBLIC", "sharedContext.dataScopes.knowledge");
  requireConst(sharedContext.dataScopes.research, "NONE", "sharedContext.dataScopes.research");
  requireConst(sharedContext.dataScopes.tool ?? sharedContext.dataScopes.localTool, "NONE", "sharedContext.dataScopes.tool");
  assertPlainObject(sharedContext.redactionState, "sharedContext.redactionState");
  requireConst(sharedContext.redactionState.crossStudentDataRedacted ?? true, true, "sharedContext.redactionState.crossStudentDataRedacted");
  requireConst(sharedContext.redactionState.rawStudentArchiveRedacted ?? true, true, "sharedContext.redactionState.rawStudentArchiveRedacted");
  requireConst(sharedContext.redactionState.finalEvaluationRedacted ?? true, true, "sharedContext.redactionState.finalEvaluationRedacted");
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
  requireConst(guardrailResult.skillId, "recommend_practice", "guardrailResult.skillId");
  requireConst(guardrailResult.decision, "ALLOW", "guardrailResult.decision");
  requireConst(guardrailResult.evidenceRequired, true, "guardrailResult.evidenceRequired");
  requireConst(guardrailResult.directDatabaseWriteAllowed, false, "guardrailResult.directDatabaseWriteAllowed");
  if (!Array.isArray(guardrailResult.safetyChecks) || guardrailResult.safetyChecks.length === 0) {
    throw adapterError("STUDENT_TUTOR_READONLY_GUARDRAIL_CHECKS", "guardrailResult.safetyChecks must be non-empty");
  }
  const failed = guardrailResult.safetyChecks.find((check) => check?.status !== "PASS");
  if (failed) {
    throw adapterError("STUDENT_TUTOR_READONLY_GUARDRAIL_FAILED", `guardrail safety check failed: ${failed.checkId ?? "unknown"}`);
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
  if (workerAgents.length !== 1 || workerAgents[0] !== "StudentTutorAgent") {
    throw adapterError("STUDENT_TUTOR_READONLY_ROUTE_WORKER", "routeDecision must select StudentTutorAgent only");
  }
  if (selectedSkills.length !== 1 || selectedSkills[0] !== "recommend_practice") {
    throw adapterError("STUDENT_TUTOR_READONLY_ROUTE_SKILL", "routeDecision must select recommend_practice only");
  }
  requireIntegerBetween(routeDecision.p99BudgetMs, "routeDecision.p99BudgetMs", 1, 50);
  return routeDecision;
}

function assertReadPort(readPort) {
  assertPlainObject(readPort, "readPort");
  if (typeof readPort.recommendPracticeContext !== "function") {
    throw adapterError("STUDENT_TUTOR_READONLY_MISSING_READ_PORT", "readPort.recommendPracticeContext must be injected");
  }
}

function buildReadPortRequest(normalized) {
  const { input, principal, sharedContext, guardrailResult, routeDecision } = normalized;
  return {
    portName: "StudentLearningReadPort",
    operation: "recommendPracticeContext",
    invocationId: input.invocationId,
    taskId: input.taskId,
    contextRef: input.contextRef,
    principal: {
      principalId: principal.principalId,
      role: principal.role,
      scopes: principal.scopes,
    },
    query: input.query,
    targetStudentScope: input.targetStudentScope,
    learningSignals: input.learningSignals,
    filters: input.filters,
    limits: input.limits,
    evidenceRefs: uniq([
      ...input.evidenceRefs,
      ...sharedContext.evidenceRefs,
      guardrailResult.guardrailId ? `evidence:guardrail:${guardrailResult.guardrailId}` : null,
      routeDecision.routeId ? `evidence:route:${routeDecision.routeId}` : null,
      ...input.targetStudentScope.studentIds.map((studentId) => `evidence:student-scope:${studentId}`),
      `evidence:input-hash:${normalized.inputHash}`,
    ]),
    safety: {
      directDatabaseAccessAllowed: false,
      writeOperationAllowed: false,
      crossStudentComparisonAllowed: false,
      rawStudentArchiveAllowed: false,
      finalEvaluationAllowed: false,
      externalModelAllowed: false,
      localToolMutationAllowed: false,
    },
  };
}

function normalizeRows(rows, input, targetStudentIds) {
  if (!Array.isArray(rows)) {
    throw adapterError("STUDENT_TUTOR_READONLY_INVALID_READ_PORT_RESULT", "read port result must be an array");
  }
  return rows.slice(0, input.limits.maxRecommendations).map((row, index) =>
    normalizeRow(row, index, input, targetStudentIds)
  );
}

function normalizeRow(row, index, input, targetStudentIds) {
  assertPlainObject(row, `readPort.rows[${index}]`);
  if (
    row.crossStudentDataReturned === true ||
    row.rawStudentArchiveReturned === true ||
    row.finalEvaluationReturned === true ||
    row.externalModelUsed === true ||
    row.localToolMutationAllowed === true ||
    row.returnedWithinStudentScope === false
  ) {
    throw adapterError("STUDENT_TUTOR_READONLY_UNSAFE_ROW", "read port row claims unsafe student data, final evaluation, model, or local tool use");
  }
  const returnedStudentIds = uniqueStringArray(row.studentIds ?? [...targetStudentIds], `rows[${index}].studentIds`, 1, 32);
  for (const studentId of returnedStudentIds) {
    if (!targetStudentIds.has(studentId)) {
      throw adapterError("STUDENT_TUTOR_READONLY_CROSS_STUDENT_ROW", `row returned data for out-of-scope student ${studentId}`);
    }
  }
  const practiceId = requireBoundedString(row.practiceId ?? row.id, `rows[${index}].practiceId`, 1, 120);
  if (!/^practice_[a-zA-Z0-9_-]+$/.test(practiceId)) {
    throw adapterError("STUDENT_TUTOR_READONLY_INVALID_PRACTICE_ID", `invalid practiceId ${practiceId}`);
  }
  const sourceType = requireString(row.sourceType, `rows[${index}].sourceType`);
  if (!allowedSourceTypes.has(sourceType)) {
    throw adapterError("STUDENT_TUTOR_READONLY_INVALID_SOURCE_TYPE", `unsupported sourceType ${sourceType}`);
  }
  const sourceEvidenceRefs = uniqueStringArray(
    row.sourceEvidenceRefs ?? [`evidence:source:${practiceId}`],
    `rows[${index}].sourceEvidenceRefs`,
    1,
    16,
  );
  return {
    practiceId,
    title: requireBoundedString(row.title, `rows[${index}].title`, 1, 200),
    sourceType,
    knowledgePointIds: uniqueStringArray(row.knowledgePointIds, `rows[${index}].knowledgePointIds`, 1, 12),
    reason: truncate(requireString(row.reason, `rows[${index}].reason`), input.limits.maxReasonChars),
    sourceEvidenceRefs,
    expiresAt: requireDateTime(row.expiresAt, `rows[${index}].expiresAt`),
  };
}

function buildSkillOutput(normalized, recommendations, runtimeMs, options) {
  const { input, sharedContext } = normalized;
  const recommendationEvidence = recommendations.flatMap((item) => item.sourceEvidenceRefs);
  const studentScopeEvidence = input.targetStudentScope.studentIds.map((studentId) => `evidence:student-scope:${studentId}`);
  const evidenceRefs = uniq([
    ...input.evidenceRefs,
    ...sharedContext.evidenceRefs,
    ...recommendationEvidence,
    ...studentScopeEvidence,
    `evidence:input-hash:${normalized.inputHash}`,
    `evidence:adapter:${STUDENT_TUTOR_AGENT_READONLY_RUNTIME_ADAPTER_ID}`,
    `evidence:read-port:${STUDENT_TUTOR_AGENT_READONLY_RUNTIME_READ_PORT}`,
    `evidence:runtime-ms:${Math.round(runtimeMs)}`,
  ]);
  return {
    schemaVersion: outputSchemaVersion,
    invocationId: input.invocationId,
    taskId: input.taskId,
    contextRef: input.contextRef,
    decision: recommendations.length > 0 ? "FOUND" : "NO_MATCH",
    summary: recommendations.length > 0
      ? `Found ${recommendations.length} scoped practice recommendation(s) through the injected read port.`
      : "No scoped practice recommendations matched the read-only request.",
    recommendations,
    evidenceRefs,
    safety: {
      directDatabaseWriteAllowed: false,
      crossStudentDataReturned: false,
      rawStudentArchiveReturned: false,
      finalEvaluationReturned: false,
      externalModelUsed: false,
      localToolMutationAllowed: false,
      returnedWithinStudentScope: true,
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
    throw adapterError("STUDENT_TUTOR_READONLY_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireBoundedString(value, label, minLength, maxLength) {
  const text = requireString(value, label);
  if (text.length < minLength || text.length > maxLength) {
    throw adapterError("STUDENT_TUTOR_READONLY_INVALID_INPUT", `${label} length must be ${minLength}-${maxLength}`);
  }
  return text;
}

function requireEnum(value, label, allowed) {
  const text = requireString(value, label);
  if (!allowed.includes(text)) {
    throw adapterError("STUDENT_TUTOR_READONLY_INVALID_INPUT", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw adapterError("STUDENT_TUTOR_READONLY_INVALID_INPUT", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireDateTime(value, label) {
  const text = requireString(value, label);
  if (Number.isNaN(Date.parse(text))) {
    throw adapterError("STUDENT_TUTOR_READONLY_INVALID_INPUT", `${label} must be a valid date-time string`);
  }
  return text;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw adapterError("STUDENT_TUTOR_READONLY_BOUNDARY_VIOLATION", `${label} must be ${expected}`);
  }
}

function uniqueStringArray(value, label, minItems, maxItems) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw adapterError("STUDENT_TUTOR_READONLY_INVALID_INPUT", `${label} must contain ${minItems}-${maxItems} items`);
  }
  const items = value.map((item) => requireString(item, label));
  if (new Set(items).size !== items.length) {
    throw adapterError("STUDENT_TUTOR_READONLY_INVALID_INPUT", `${label} must be unique`);
  }
  return items;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw adapterError("STUDENT_TUTOR_READONLY_INVALID_INPUT", `${label} must be an object`);
  }
}

function inputHash(input) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 24);
}

function truncate(text, maxLength) {
  return text.length <= maxLength ? text : text.slice(0, maxLength);
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
