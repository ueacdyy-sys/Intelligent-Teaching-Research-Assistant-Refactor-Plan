import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_REQUEST_RUNTIME_ID = "student_app_ai_tutor_request_runtime";
export const STUDENT_APP_AI_TUTOR_REQUEST_COMMAND_PORT = "StudentAppAITutorRequestPort.createStudentAppAITutorRequest";
export const STUDENT_APP_AI_TUTOR_REQUEST_READY = "STUDENT_APP_AI_TUTOR_REQUEST_RUNTIME_READY";

const inputSchemaVersion = "2026-06-05.student-app.ai-tutor-request.v1";
const outputSchemaVersion = "2026-06-05.student-app.ai-tutor-request-queued.v1";
const defaultRequestLogPath = "reports/student-command-log/student-app-ai-tutor-request.jsonl";
const allowedQuestionBankIntents = ["NONE", "GENERATE_PERSONALIZED_CHECK"];
const allowedMaterials = ["QUIZ", "PAPER", "HANDOUT", "HOMEWORK"];

export async function queueStudentAppAITutorRequest(input, deps = {}, options = {}) {
  const queuedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const requestLogPath = options.requestLogPath ?? defaultRequestLogPath;
  const existing = findExistingRecordByIdempotencyKey(requestLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const requestPort = assertRequestPort(deps.studentAppAITutorRequestPort);
  const portResult = await requestPort.createStudentAppAITutorRequest(buildPortRequest(normalized));
  const queuedRequest = assertPortResult(portResult, normalized);
  const record = buildQueueRecord(normalized, queuedRequest, queuedAt);
  appendRecord(requestLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorRequest(result) {
  return [
    `Student App AI Tutor request: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Request: ${result.tutoringAnalysisRequest.id}`,
    `Queue table: ${result.queue.queueTable}`,
    `Student scope enforced: ${result.boundary.studentOwnArchiveScopeEnforced}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const requestInvocationId = requireString(input.requestInvocationId, "input.requestInvocationId");
  const agentTask = assertAgentTask(input.agentTask);
  const principalContext = assertPrincipalContext(input.principalContext, agentTask);
  const sharedContext = assertSharedContext(input.sharedContext, agentTask);
  const guardrailResult = assertGuardrailResult(input.guardrailResult, agentTask);
  const routeDecision = assertRouteDecision(input.routeDecision, agentTask);
  const studentArchiveScope = assertStudentArchiveScope(input.studentArchiveScope, principalContext);
  const analysisGoal = requireSafeText(input.analysisGoal, "input.analysisGoal", 8, 500);
  const questionBankIntent = requireEnum(input.questionBankIntent ?? "GENERATE_PERSONALIZED_CHECK", "input.questionBankIntent", allowedQuestionBankIntents);
  const policy = assertRequestPolicy(input.aiTutorRequestPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 160);
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 240);
  const inputHashValue = hashInput({
    requestInvocationId,
    taskId: agentTask.taskId,
    principalId: principalContext.principalId,
    studentArchiveScope,
    analysisGoal,
    questionBankIntent,
    policy,
  });
  return {
    requestInvocationId,
    agentTask,
    principalContext,
    sharedContext,
    guardrailResult,
    routeDecision,
    studentArchiveScope,
    analysisGoal,
    questionBankIntent,
    policy,
    evidenceRefs,
    idempotencyKey,
    inputHash: inputHashValue,
  };
}

function assertAgentTask(agentTask) {
  assertPlainObject(agentTask, "input.agentTask");
  requireConst(agentTask.schemaVersion, "2026-06-04.agent.task.v1", "input.agentTask.schemaVersion");
  requireConst(agentTask.taskKind, "STUDENT_TUTORING", "input.agentTask.taskKind");
  requireConst(agentTask.writeIntent, true, "input.agentTask.writeIntent");
  requireConst(agentTask.requiresHumanApproval, false, "input.agentTask.requiresHumanApproval");
  requireConst(agentTask.riskLevel, "MEDIUM", "input.agentTask.riskLevel");
  const taskId = requireString(agentTask.taskId, "input.agentTask.taskId");
  const requestedByPrincipalId = requireString(agentTask.requestedByPrincipalId, "input.agentTask.requestedByPrincipalId");
  const principalContextRef = requireString(agentTask.principalContextRef, "input.agentTask.principalContextRef");
  assertPlainObject(agentTask.routePolicy, "input.agentTask.routePolicy");
  requireConst(agentTask.routePolicy.preferSingleWorker, true, "input.agentTask.routePolicy.preferSingleWorker");
  const allowedModes = uniqueStringArray(agentTask.routePolicy.allowedModes, "input.agentTask.routePolicy.allowedModes", 1, 2);
  if (!allowedModes.includes("SINGLE_WORKER")) {
    throw requestError("STUDENT_APP_AI_TUTOR_REQUEST_SINGLE_WORKER_REQUIRED", "AI Tutor request admission requires SINGLE_WORKER");
  }
  if ((agentTask.routePolicy.swarmRequiredWhen ?? []).length > 0) {
    throw requestError("STUDENT_APP_AI_TUTOR_REQUEST_SWARM_DENIED", "AI Tutor request admission does not start Swarm");
  }
  assertPlainObject(agentTask.budgets, "input.agentTask.budgets");
  requireIntegerBetween(agentTask.budgets.maxAgentLoops, "input.agentTask.budgets.maxAgentLoops", 1, 1);
  requireIntegerBetween(agentTask.budgets.maxSkillCalls, "input.agentTask.budgets.maxSkillCalls", 1, 1);
  requireIntegerBetween(agentTask.budgets.p99BudgetMs, "input.agentTask.budgets.p99BudgetMs", 1, 50);
  return { ...agentTask, taskId, requestedByPrincipalId, principalContextRef };
}

function assertPrincipalContext(principalContext, agentTask) {
  assertPlainObject(principalContext, "input.principalContext");
  const principalId = requireString(principalContext.principalId, "input.principalContext.principalId");
  requireConst(principalId, agentTask.requestedByPrincipalId, "input.principalContext.principalId");
  requireConst(principalContext.subjectType, "USER", "input.principalContext.subjectType");
  requireConst(principalContext.role, "STUDENT", "input.principalContext.role");
  requireConst(principalContext.entryPoint, "STUDENT_APP", "input.principalContext.entryPoint");
  const scopes = uniqueStringArray(principalContext.scopes, "input.principalContext.scopes", 1, 32);
  if (!scopes.includes("TEACHING_READ") || !scopes.includes("STUDENT_OWN_READ")) {
    throw requestError("STUDENT_APP_AI_TUTOR_REQUEST_MISSING_SCOPE", "TEACHING_READ and STUDENT_OWN_READ scopes are required");
  }
  assertPlainObject(principalContext.studentAccess, "input.principalContext.studentAccess");
  requireConst(principalContext.studentAccess.mode, "OWN", "input.principalContext.studentAccess.mode");
  const ownStudentIds = uniqueStringArray(principalContext.studentAccess.studentIds ?? [principalId], "input.principalContext.studentAccess.studentIds", 1, 8);
  if (!ownStudentIds.includes(principalId)) {
    throw requestError("STUDENT_APP_AI_TUTOR_REQUEST_STUDENT_SCOPE_MISMATCH", "student principal must be inside own student scope");
  }
  return { ...principalContext, principalId, scopes, ownStudentIds };
}

function assertSharedContext(sharedContext, agentTask) {
  assertPlainObject(sharedContext, "input.sharedContext");
  requireConst(sharedContext.schemaVersion, "2026-06-04.agent.shared-context.v1", "input.sharedContext.schemaVersion");
  const contextId = requireString(sharedContext.contextId, "input.sharedContext.contextId");
  requireConst(sharedContext.taskId, agentTask.taskId, "input.sharedContext.taskId");
  requireConst(sharedContext.principalContextRef, agentTask.principalContextRef, "input.sharedContext.principalContextRef");
  assertPlainObject(sharedContext.dataScopes, "input.sharedContext.dataScopes");
  requireConst(sharedContext.dataScopes.teaching, "READ", "input.sharedContext.dataScopes.teaching");
  requireConst(sharedContext.dataScopes.student, "OWN", "input.sharedContext.dataScopes.student");
  requireConst(sharedContext.dataScopes.knowledge, "PUBLIC", "input.sharedContext.dataScopes.knowledge");
  requireConst(sharedContext.dataScopes.research, "NONE", "input.sharedContext.dataScopes.research");
  requireConst(sharedContext.dataScopes.tool ?? sharedContext.dataScopes.localTool, "NONE", "input.sharedContext.dataScopes.tool");
  assertPlainObject(sharedContext.redactionState, "input.sharedContext.redactionState");
  requireConst(sharedContext.redactionState.externalModelAllowed, false, "input.sharedContext.redactionState.externalModelAllowed");
  requireConst(sharedContext.redactionState.finalEvaluationRedacted, true, "input.sharedContext.redactionState.finalEvaluationRedacted");
  return { ...sharedContext, contextId, evidenceRefs: Array.isArray(sharedContext.evidenceRefs) ? sharedContext.evidenceRefs.map(String) : [] };
}

function assertGuardrailResult(guardrailResult, agentTask) {
  assertPlainObject(guardrailResult, "input.guardrailResult");
  requireConst(guardrailResult.schemaVersion, "2026-06-04.agent.guardrail-result.v1", "input.guardrailResult.schemaVersion");
  requireConst(guardrailResult.taskId, agentTask.taskId, "input.guardrailResult.taskId");
  requireConst(guardrailResult.skillId, "tutor_student", "input.guardrailResult.skillId");
  requireConst(guardrailResult.decision, "ALLOW", "input.guardrailResult.decision");
  requireConst(guardrailResult.harnessActionRequired, false, "input.guardrailResult.harnessActionRequired");
  requireConst(guardrailResult.rollbackRequired, false, "input.guardrailResult.rollbackRequired");
  requireConst(guardrailResult.evidenceRequired, true, "input.guardrailResult.evidenceRequired");
  requireConst(guardrailResult.directDatabaseWriteAllowed, false, "input.guardrailResult.directDatabaseWriteAllowed");
  if (!Array.isArray(guardrailResult.safetyChecks) || guardrailResult.safetyChecks.length === 0) {
    throw requestError("STUDENT_APP_AI_TUTOR_REQUEST_GUARDRAIL_CHECKS", "guardrailResult.safetyChecks must be non-empty");
  }
  const failed = guardrailResult.safetyChecks.find((check) => check?.status !== "PASS");
  if (failed) throw requestError("STUDENT_APP_AI_TUTOR_REQUEST_GUARDRAIL_FAILED", `guardrail safety check failed: ${failed.checkId ?? "unknown"}`);
  return guardrailResult;
}

function assertRouteDecision(routeDecision, agentTask) {
  assertPlainObject(routeDecision, "input.routeDecision");
  requireConst(routeDecision.schemaVersion, "2026-06-04.agent.route-decision.v1", "input.routeDecision.schemaVersion");
  requireConst(routeDecision.taskId, agentTask.taskId, "input.routeDecision.taskId");
  requireConst(routeDecision.mode, "SINGLE_WORKER", "input.routeDecision.mode");
  requireConst(routeDecision.leadAgent, "LeadAgent", "input.routeDecision.leadAgent");
  const workerAgents = uniqueStringArray(routeDecision.workerAgents, "input.routeDecision.workerAgents", 1, 1);
  const selectedSkills = uniqueStringArray(routeDecision.selectedSkills, "input.routeDecision.selectedSkills", 1, 1);
  requireConst(workerAgents[0], "StudentTutorAgent", "input.routeDecision.workerAgents[0]");
  requireConst(selectedSkills[0], "tutor_student", "input.routeDecision.selectedSkills[0]");
  requireIntegerBetween(routeDecision.p99BudgetMs, "input.routeDecision.p99BudgetMs", 1, agentTask.budgets.p99BudgetMs);
  return { ...routeDecision, workerAgents, selectedSkills };
}

function assertStudentArchiveScope(scope, principalContext) {
  assertPlainObject(scope, "input.studentArchiveScope");
  requireConst(scope.mode, "OWN", "input.studentArchiveScope.mode");
  const studentId = requireBoundedString(scope.studentId, "input.studentArchiveScope.studentId", 1, 128);
  if (!principalContext.ownStudentIds.includes(studentId)) {
    throw requestError("STUDENT_APP_AI_TUTOR_REQUEST_FORBIDDEN_ARCHIVE_SCOPE", "student can queue AI Tutor only for own archive");
  }
  return {
    mode: "OWN",
    studentId,
    archiveItemId: requireArchiveItemId(scope.archiveItemId, "input.studentArchiveScope.archiveItemId"),
    expectedSourceOwnerType: requireConst(scope.expectedSourceOwnerType, "STUDENT", "input.studentArchiveScope.expectedSourceOwnerType"),
  };
}

function assertRequestPolicy(policy) {
  assertPlainObject(policy, "input.aiTutorRequestPolicy");
  for (const field of [
    "studentOwnArchiveRequired",
    "teachingArchiveReadRequired",
    "injectedUseCasePortRequired",
    "asyncAnalysisRequired",
    "questionBankDraftDeferred",
    "idempotentQueueAdmissionRequired",
  ]) {
    requireConst(policy[field], true, `input.aiTutorRequestPolicy.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "externalModelCallNowAllowed",
    "finalEvaluationNowAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.aiTutorRequestPolicy.${field}`);
  }
  requireConst(policy.queueName, "teaching_tutoring_analysis_requests", "input.aiTutorRequestPolicy.queueName");
  return { ...policy };
}

function assertRequestPort(port) {
  if (!port || typeof port.createStudentAppAITutorRequest !== "function") {
    throw requestError("STUDENT_APP_AI_TUTOR_REQUEST_MISSING_PORT", "StudentAppAITutorRequestPort.createStudentAppAITutorRequest is required");
  }
  return port;
}

function buildPortRequest(normalized) {
  return {
    portName: "StudentAppAITutorRequestPort",
    operation: "createStudentAppAITutorRequest",
    targetUseCase: "CreateStudentAppAITutorRequest.Execute",
    requestInvocationId: normalized.requestInvocationId,
    taskId: normalized.agentTask.taskId,
    contextRef: normalized.sharedContext.contextId,
    principal: {
      principalId: normalized.principalContext.principalId,
      role: normalized.principalContext.role,
      scopes: normalized.principalContext.scopes,
      studentAccess: { mode: "OWN", studentIds: [normalized.studentArchiveScope.studentId] },
    },
    studentArchiveItemId: normalized.studentArchiveScope.archiveItemId,
    analysisGoal: normalized.analysisGoal,
    questionBankIntent: normalized.questionBankIntent,
    idempotencyKey: normalized.idempotencyKey,
    evidenceRefs: uniq([
      ...normalized.evidenceRefs,
      ...normalized.sharedContext.evidenceRefs,
      `evidence:guardrail:${normalized.guardrailResult.guardrailId}`,
      `evidence:route:${normalized.routeDecision.routeId}`,
      `evidence:student-scope:${normalized.studentArchiveScope.studentId}`,
      `evidence:student-app-ai-tutor-request-input-hash:${normalized.inputHash}`,
    ]),
    safety: {
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalModelCallNowAllowed: false,
      finalEvaluationNowAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
  };
}

function assertPortResult(result, normalized) {
  assertPlainObject(result, "StudentAppAITutorRequestPort result");
  const source = assertPortSource(result.source);
  const request = assertTutoringAnalysisRequest(result.request, normalized);
  return { source, request };
}

function assertPortSource(source) {
  assertPlainObject(source, "StudentAppAITutorRequestPort result.source");
  return {
    targetUseCase: requireConst(source.targetUseCase, "CreateStudentAppAITutorRequest.Execute", "StudentAppAITutorRequestPort result.source.targetUseCase"),
    readRepository: requireConst(source.readRepository, "ArchiveRepository.GetByID", "StudentAppAITutorRequestPort result.source.readRepository"),
    writeRepository: requireConst(source.writeRepository, "ArchiveRepository.CreateTutoringAnalysisRequest", "StudentAppAITutorRequestPort result.source.writeRepository"),
    queueTable: requireConst(source.queueTable, "teaching_tutoring_analysis_requests", "StudentAppAITutorRequestPort result.source.queueTable"),
  };
}

function assertTutoringAnalysisRequest(request, normalized) {
  assertPlainObject(request, "StudentAppAITutorRequestPort result.request");
  const id = requireBoundedString(request.id, "StudentAppAITutorRequestPort result.request.id", 1, 200);
  if (!id.startsWith("tutor_req_")) {
    throw requestError("STUDENT_APP_AI_TUTOR_REQUEST_INVALID_REQUEST_ID", "AI Tutor request id must use tutor_req_ prefix");
  }
  requireConst(request.archiveItemId, normalized.studentArchiveScope.archiveItemId, "StudentAppAITutorRequestPort result.request.archiveItemId");
  requireConst(request.requestedByPrincipalId, normalized.principalContext.principalId, "StudentAppAITutorRequestPort result.request.requestedByPrincipalId");
  requireConst(request.analysisGoal, normalized.analysisGoal, "StudentAppAITutorRequestPort result.request.analysisGoal");
  requireConst(request.questionBankIntent, normalized.questionBankIntent, "StudentAppAITutorRequestPort result.request.questionBankIntent");
  requireConst(request.status, "QUEUED", "StudentAppAITutorRequestPort result.request.status");
  requireConst(request.sourceArchiveOwnerType, "STUDENT", "StudentAppAITutorRequestPort result.request.sourceArchiveOwnerType");
  requireConst(request.sourceArchiveStudentId, normalized.studentArchiveScope.studentId, "StudentAppAITutorRequestPort result.request.sourceArchiveStudentId");
  return {
    id,
    archiveItemId: request.archiveItemId,
    requestedByPrincipalId: request.requestedByPrincipalId,
    analysisGoal: request.analysisGoal,
    questionBankIntent: request.questionBankIntent,
    status: "QUEUED",
    sourceArchiveOwnerType: "STUDENT",
    sourceArchiveStudentId: request.sourceArchiveStudentId,
    sourceArchiveMaterial: requireEnum(request.sourceArchiveMaterial, "StudentAppAITutorRequestPort result.request.sourceArchiveMaterial", allowedMaterials),
    createdAt: requireDateTime(request.createdAt, "StudentAppAITutorRequestPort result.request.createdAt"),
    updatedAt: requireDateTime(request.updatedAt, "StudentAppAITutorRequestPort result.request.updatedAt"),
  };
}

function buildQueueRecord(normalized, queued, queuedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_REQUEST",
    recordId: `student_app_ai_tutor_request_${safeToken(normalized.idempotencyKey)}`,
    recordedAt: queuedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_REQUEST_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_REQUEST_COMMAND_PORT,
    status: "STUDENT_APP_AI_TUTOR_REQUEST_QUEUED",
    requestInvocationId: normalized.requestInvocationId,
    queue: {
      queueName: "student_app_ai_tutor",
      queueTable: queued.source.queueTable,
      targetUseCase: queued.source.targetUseCase,
      readRepository: queued.source.readRepository,
      writeRepository: queued.source.writeRepository,
    },
    tutoringAnalysisRequest: queued.request,
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.sharedContext.evidenceRefs,
        `evidence:student-app-ai-tutor-request-input-hash:${normalized.inputHash}`,
        `evidence:runtime:${STUDENT_APP_AI_TUTOR_REQUEST_RUNTIME_ID}`,
        `evidence:command-port:${STUDENT_APP_AI_TUTOR_REQUEST_COMMAND_PORT}`,
        `evidence:tutoring-analysis-request:${queued.request.id}`,
      ]),
      idempotencyKey: normalized.idempotencyKey,
      inputHash: normalized.inputHash,
    },
    boundary: buildBoundary(),
  };
}

function buildBoundary() {
  return {
    studentOwnArchiveScopeEnforced: true,
    teachingArchiveReadVerified: true,
    tutoringAnalysisRequestQueued: true,
    questionBankDraftDeferred: true,
    asyncAnalysisRequired: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    externalModelCallNowAllowed: false,
    finalEvaluationNowAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function buildResult(record, options) {
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: record.runtimeId,
    commandPort: record.commandPort,
    status: record.status,
    recordId: record.recordId,
    recordedAt: record.recordedAt,
    idempotencyKey: record.evidence.idempotencyKey,
    idempotentReplay: options.idempotentReplay === true,
    queue: record.queue,
    tutoringAnalysisRequest: record.tutoringAnalysisRequest,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 50,
      evidenceClass: "STUDENT_APP_AI_TUTOR_REQUEST_ADMISSION_BOUNDARY",
    },
    nextAction: "Use this as Student App AI Tutor queue admission evidence; continue with worker claim, result review, and question-bank draft slices.",
  };
}

function appendRecord(requestLogPath, record) {
  const absolute = path.resolve(requestLogPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.appendFileSync(absolute, `${JSON.stringify(record)}\n`);
}

function findExistingRecordByIdempotencyKey(requestLogPath, idempotencyKey) {
  const absolute = path.resolve(requestLogPath);
  if (!fs.existsSync(absolute)) return null;
  const lines = fs.readFileSync(absolute, "utf8").split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const record = JSON.parse(lines[index]);
    if (record?.recordType === "STUDENT_APP_AI_TUTOR_REQUEST" && record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.requestInvocationId !== normalized.requestInvocationId ||
    existing.tutoringAnalysisRequest?.archiveItemId !== normalized.studentArchiveScope.archiveItemId ||
    existing.tutoringAnalysisRequest?.sourceArchiveStudentId !== normalized.studentArchiveScope.studentId ||
    existing.evidence?.inputHash !== normalized.inputHash) {
    throw requestError("STUDENT_APP_AI_TUTOR_REQUEST_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different AI Tutor request");
  }
}

function requireArchiveItemId(value, label) {
  const text = requireBoundedString(value, label, 1, 1000);
  if (!text.startsWith("tarch_")) {
    throw requestError("STUDENT_APP_AI_TUTOR_REQUEST_INVALID_ARCHIVE_ID", `${label} must use tarch_ prefix`);
  }
  return text;
}

function requireSafeText(value, label, minLength, maxLength) {
  const text = requireBoundedString(value, label, minLength, maxLength);
  if (/[<>]/u.test(text)) {
    throw requestError("STUDENT_APP_AI_TUTOR_REQUEST_UNSAFE_TEXT", `${label} must be encoded safe text`);
  }
  return text;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw requestError("STUDENT_APP_AI_TUTOR_REQUEST_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireBoundedString(value, label, minLength, maxLength) {
  const text = requireString(value, label);
  if (text.length < minLength || text.length > maxLength) {
    throw requestError("STUDENT_APP_AI_TUTOR_REQUEST_INVALID_INPUT", `${label} length must be ${minLength}-${maxLength}`);
  }
  return text;
}

function requireEnum(value, label, allowed) {
  const text = requireString(value, label);
  if (!allowed.includes(text)) {
    throw requestError("STUDENT_APP_AI_TUTOR_REQUEST_INVALID_INPUT", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw requestError("STUDENT_APP_AI_TUTOR_REQUEST_INVALID_INPUT", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireDateTime(value, label) {
  const text = requireString(value, label);
  if (Number.isNaN(Date.parse(text))) {
    throw requestError("STUDENT_APP_AI_TUTOR_REQUEST_INVALID_INPUT", `${label} must be an ISO date-time`);
  }
  return text;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw requestError("STUDENT_APP_AI_TUTOR_REQUEST_BOUNDARY_VIOLATION", `${label} must be ${expected}`);
  }
  return expected;
}

function uniqueStringArray(value, label, minItems, maxItems) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw requestError("STUDENT_APP_AI_TUTOR_REQUEST_INVALID_INPUT", `${label} must contain ${minItems}-${maxItems} items`);
  }
  const items = value.map((item) => requireString(item, label));
  if (new Set(items).size !== items.length) {
    throw requestError("STUDENT_APP_AI_TUTOR_REQUEST_INVALID_INPUT", `${label} must be unique`);
  }
  return items;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw requestError("STUDENT_APP_AI_TUTOR_REQUEST_INVALID_INPUT", `${label} must be an object`);
  }
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

function requestError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
