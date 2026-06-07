import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_generation_plan_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_PORT =
  "StudentAppAITutorQuestionBankDraftGenerationPlanPort.recordQuestionBankDraftGenerationPlan";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_READY =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_READY";

const inputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-plan.v1";
const outputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-plan-recorded.v1";
const resultSchemaVersion = "2026-06-05.student-app.ai-tutor-result-recorded.v1";
const resultRuntimeId = "student_app_ai_tutor_result_runtime";
const resultCommandPort = "StudentAppAITutorResultPort.recordTutoringAnalysisResult";
const resultStatus = "STUDENT_APP_AI_TUTOR_RESULT_RECORDED";
const plannedStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RECORDED";
const defaultPlanLogPath = "reports/student-command-log/student-app-ai-tutor-question-bank-draft-generation-plan.jsonl";

const allowedDifficulties = new Set(["FOUNDATION", "STANDARD", "CHALLENGE"]);
const allowedQuestionTypes = new Set(["SHORT_ANSWER", "MULTIPLE_CHOICE", "FILL_IN_BLANK", "CALCULATION"]);
const leakedFieldNames = [
  "answerText",
  "answerKey",
  "correctAnswer",
  "expectedAnswer",
  "explanation",
  "scoreSummary",
  "resultRef",
  "rawModelOutput",
  "modelOutput",
  "workerId",
  "claimedByWorkerId",
  "internalError",
  "errorMessage",
];

export async function recordStudentAppAITutorQuestionBankDraftGenerationPlan(input, options = {}) {
  const plannedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const planLogPath = options.planLogPath ?? defaultPlanLogPath;
  const existing = findExistingRecordByIdempotencyKey(planLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const planPort = assertGenerationPlanPort(options.questionBankDraftGenerationPlanPort);
  const portResult = await planPort.recordQuestionBankDraftGenerationPlan(buildPortRequest(normalized));
  const recordedPlan = assertPortResult(portResult, normalized);
  const record = buildPlanRecord(normalized, recordedPlan, plannedAt);
  appendRecord(planLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftGenerationPlan(result) {
  return [
    `Student App AI Tutor question-bank draft generation plan: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Draft: ${result.generationPlan.questionBankDraftRef}`,
    `Planned items: ${result.generationPlan.items.length}`,
    `Question content generated: ${result.boundary.questionContentGenerated}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const planningInvocationId = requireToken(input.planningInvocationId, "input.planningInvocationId", "qbank_generation_plan_");
  const sourceResultReport = assertSourceResultReport(input.studentAppAiTutorResultReport);
  const sourceResult = assertSourceResult(sourceResultReport);
  const principal = assertPrincipal(input.principal);
  const studentScope = assertStudentScope(input.studentScope, sourceResult.result.archiveItemId);
  const generationPolicy = assertGenerationPolicy(input.generationPolicy);
  const learningObjectives = uniqueBoundedStringArray(input.learningObjectives, "input.learningObjectives", 1, 8, 3, 180);
  const budget = assertBudget(input.budget);
  const plannedItems = assertPlannedItems(input.plannedItems, budget);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 220);
  if (!evidenceRefs.some((ref) => ref.includes("student-app-ai-tutor-result"))) {
    throw planError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_MISSING_RESULT_EVIDENCE", "AI Tutor result evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 260);
  const planHash = hashInput({
    planningInvocationId,
    sourceRequestId: sourceResult.result.requestId,
    questionBankDraftRef: sourceResult.result.questionBankDraftRef,
    studentScope,
    learningObjectives,
    plannedItems,
    budget,
    generationPolicy,
  });
  return {
    planningInvocationId,
    sourceResultReport,
    sourceResult,
    principal,
    studentScope,
    generationPolicy,
    learningObjectives,
    budget,
    plannedItems,
    evidenceRefs,
    idempotencyKey,
    planHash,
  };
}

function assertSourceResultReport(report) {
  assertPlainObject(report, "input.studentAppAiTutorResultReport");
  requireConst(report.readiness, "READY", "input.studentAppAiTutorResultReport.readiness");
  requireConst(report.workloadType, "STUDENT_APP_AI_TUTOR_RESULT_RUNTIME", "input.studentAppAiTutorResultReport.workloadType");
  requireConst(report.runtime?.runtimeId, resultRuntimeId, "input.studentAppAiTutorResultReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, resultCommandPort, "input.studentAppAiTutorResultReport.runtime.commandPort");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.studentAppAiTutorResultReport.runtimeSlo.totalErrors");
  const boundary = report.safetyInvariants ?? {};
  for (const field of ["internalServiceOnly", "claimRequired", "workerLeaseMustMatch", "modelExecutionAlreadyCompletedElsewhere", "resultRecorded"]) {
    requireConst(boundary[field], true, `input.studentAppAiTutorResultReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "questionBankDraftCreated",
    "studentVisibleResultPublished",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(boundary[field], false, `input.studentAppAiTutorResultReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertSourceResult(report) {
  const result = report.runtimeProbes?.studentAppAiTutorResult?.result;
  assertPlainObject(result, "input.studentAppAiTutorResultReport.runtimeProbes.studentAppAiTutorResult.result");
  requireConst(result.schemaVersion, resultSchemaVersion, "source.schemaVersion");
  requireConst(result.runtimeId, resultRuntimeId, "source.runtimeId");
  requireConst(result.commandPort, resultCommandPort, "source.commandPort");
  requireConst(result.status, resultStatus, "source.status");
  requireConst(result.boundary?.resultRecorded, true, "source.boundary.resultRecorded");
  requireConst(result.boundary?.questionBankDraftCreated, false, "source.boundary.questionBankDraftCreated");
  requireConst(result.boundary?.studentVisibleResultPublished, false, "source.boundary.studentVisibleResultPublished");
  requireConst(result.boundary?.directDatabaseAccessAllowed, false, "source.boundary.directDatabaseAccessAllowed");
  requireConst(result.boundary?.executeHttpRequestAllowed, false, "source.boundary.executeHttpRequestAllowed");
  requireConst(result.boundary?.swarmAllowed, false, "source.boundary.swarmAllowed");
  assertPlainObject(result.result, "source.result");
  requireConst(result.result.status, "SUCCEEDED", "source.result.status");
  const questionBankDraftRef = requireBoundedString(result.result.questionBankDraftRef, "source.result.questionBankDraftRef", 1, 1000);
  if (!questionBankDraftRef.startsWith("local://question-bank-drafts/")) {
    throw planError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_INVALID_DRAFT_REF", "questionBankDraftRef must use local://question-bank-drafts/");
  }
  return {
    ...result,
    result: {
      requestId: requireToken(result.result.requestId, "source.result.requestId", "tutor_req_"),
      archiveItemId: requireToken(result.result.archiveItemId, "source.result.archiveItemId", "tarch_"),
      status: "SUCCEEDED",
      resultSummary: requireBoundedString(result.result.resultSummary, "source.result.resultSummary", 1, 2000),
      questionBankDraftRef,
      completedAt: requireBoundedString(result.result.completedAt, "source.result.completedAt", 1, 80),
    },
  };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const principalId = requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128);
  requireConst(principal.subjectType, "SERVICE", "input.principal.subjectType");
  requireConst(principal.role, "SERVICE", "input.principal.role");
  requireConst(principal.entryPoint, "AGENT_INTERNAL", "input.principal.entryPoint");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  for (const required of ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT"]) {
    if (!scopes.includes(required)) {
      throw planError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_MISSING_SCOPE", `${required} is required`);
    }
  }
  return {
    principalId,
    subjectType: "SERVICE",
    role: "SERVICE",
    entryPoint: "AGENT_INTERNAL",
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 128),
    scopes,
  };
}

function assertStudentScope(scope, sourceArchiveItemId) {
  assertPlainObject(scope, "input.studentScope");
  requireConst(scope.mode, "OWN", "input.studentScope.mode");
  const studentId = requireBoundedString(scope.studentId, "input.studentScope.studentId", 1, 128);
  const archiveItemId = requireToken(scope.archiveItemId, "input.studentScope.archiveItemId", "tarch_");
  requireConst(archiveItemId, sourceArchiveItemId, "input.studentScope.archiveItemId");
  return { mode: "OWN", studentId, archiveItemId };
}

function assertGenerationPolicy(policy) {
  assertPlainObject(policy, "input.generationPolicy");
  for (const field of [
    "resultEvidenceRequired",
    "studentOwnScopeRequired",
    "sourceArchiveEvidenceRequired",
    "learningGapEvidenceRequired",
    "generationPlanOnly",
    "safetyReviewRequiredBeforeContent",
    "idempotentPlanRequired",
  ]) {
    requireConst(policy[field], true, `input.generationPolicy.${field}`);
  }
  for (const field of [
    "executeModelNowAllowed",
    "generateQuestionsNowAllowed",
    "writeQuestionBankContentNowAllowed",
    "studentAnsweringAllowed",
    "scoringAllowed",
    "studentVisiblePublishAllowed",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.generationPolicy.${field}`);
  }
  requireConst(policy.futureGenerationUseCase, "GenerateQuestionBankDraftContent.Execute", "input.generationPolicy.futureGenerationUseCase");
  requireConst(policy.futureStorageRepository, "ArchiveRepository.SaveQuestionBankDraftContent", "input.generationPolicy.futureStorageRepository");
  requireConst(policy.targetContentTable, "teaching_question_bank_draft_contents", "input.generationPolicy.targetContentTable");
  return { ...policy };
}

function assertBudget(budget) {
  assertPlainObject(budget, "input.budget");
  return {
    plannedQuestionCount: requireIntegerBetween(budget.plannedQuestionCount, "input.budget.plannedQuestionCount", 1, 20),
    maxPromptTokens: requireIntegerBetween(budget.maxPromptTokens, "input.budget.maxPromptTokens", 128, 8000),
    maxGenerationAttempts: requireIntegerBetween(budget.maxGenerationAttempts, "input.budget.maxGenerationAttempts", 1, 3),
    p99PlanningBudgetMs: requireIntegerBetween(budget.p99PlanningBudgetMs, "input.budget.p99PlanningBudgetMs", 1, 50),
  };
}

function assertPlannedItems(items, budget) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) {
    throw planError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_INVALID_ITEMS", "input.plannedItems must contain 1-20 items");
  }
  if (items.length !== budget.plannedQuestionCount) {
    throw planError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_BUDGET_MISMATCH", "planned item count must match budget.plannedQuestionCount");
  }
  const seen = new Set();
  return items.map((item, index) => {
    rejectLeakedFields(item, `input.plannedItems[${index}]`);
    assertPlainObject(item, `input.plannedItems[${index}]`);
    const itemId = requireToken(item.itemId, `input.plannedItems[${index}].itemId`, "qbank_plan_item_");
    if (seen.has(itemId)) {
      throw planError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_DUPLICATE_ITEM", "planned item ids must be unique");
    }
    seen.add(itemId);
    return {
      itemId,
      knowledgePoint: requireBoundedString(item.knowledgePoint, `input.plannedItems[${index}].knowledgePoint`, 1, 160),
      learningGap: requireBoundedString(item.learningGap, `input.plannedItems[${index}].learningGap`, 1, 260),
      difficulty: requireEnum(item.difficulty, `input.plannedItems[${index}].difficulty`, [...allowedDifficulties]),
      questionType: requireEnum(item.questionType, `input.plannedItems[${index}].questionType`, [...allowedQuestionTypes]),
      promptBlueprint: requireBoundedString(item.promptBlueprint, `input.plannedItems[${index}].promptBlueprint`, 8, 800),
      sourceEvidenceRef: requireBoundedString(item.sourceEvidenceRef, `input.plannedItems[${index}].sourceEvidenceRef`, 1, 260),
      maxHints: requireIntegerBetween(item.maxHints, `input.plannedItems[${index}].maxHints`, 0, 3),
    };
  });
}

function assertGenerationPlanPort(port) {
  if (!port || typeof port.recordQuestionBankDraftGenerationPlan !== "function") {
    throw planError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_MISSING_PORT", "QuestionBankDraftGenerationPlanPort.recordQuestionBankDraftGenerationPlan is required");
  }
  return port;
}

function buildPortRequest(normalized) {
  return {
    portName: "StudentAppAITutorQuestionBankDraftGenerationPlanPort",
    operation: "recordQuestionBankDraftGenerationPlan",
    targetUseCase: "PlanStudentAppQuestionBankDraftGeneration.Execute",
    targetCommandLog: "student-command-log/question-bank-draft-generation-plan",
    principal: normalized.principal,
    sourceResult: {
      requestId: normalized.sourceResult.result.requestId,
      archiveItemId: normalized.sourceResult.result.archiveItemId,
      resultSummary: normalized.sourceResult.result.resultSummary,
      questionBankDraftRef: normalized.sourceResult.result.questionBankDraftRef,
    },
    studentScope: normalized.studentScope,
    generationPlan: {
      questionBankDraftRef: normalized.sourceResult.result.questionBankDraftRef,
      learningObjectives: normalized.learningObjectives,
      items: normalized.plannedItems,
      budget: normalized.budget,
      executionState: "PLAN_RECORDED_NOT_GENERATED",
    },
    idempotencyKey: normalized.idempotencyKey,
    evidenceRefs: uniq([
      ...normalized.evidenceRefs,
      `evidence:question-bank-generation-plan-hash:${normalized.planHash}`,
      `evidence:source-runtime:${resultRuntimeId}`,
    ]),
    safety: {
      generationPlanOnly: true,
      studentOwnScopeRequired: true,
      executeModelNowAllowed: false,
      generateQuestionsNowAllowed: false,
      writeQuestionBankContentNowAllowed: false,
      studentVisiblePublishAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      swarmAllowed: false,
    },
  };
}

function assertPortResult(portResult, normalized) {
  assertPlainObject(portResult, "portResult");
  assertPlainObject(portResult.source, "portResult.source");
  requireConst(portResult.source.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_PORT, "portResult.source.commandPort");
  requireConst(portResult.source.targetUseCase, "PlanStudentAppQuestionBankDraftGeneration.Execute", "portResult.source.targetUseCase");
  requireConst(portResult.source.targetCommandLog, "student-command-log/question-bank-draft-generation-plan", "portResult.source.targetCommandLog");
  assertPlainObject(portResult.generationPlan, "portResult.generationPlan");
  requireConst(portResult.generationPlan.questionBankDraftRef, normalized.sourceResult.result.questionBankDraftRef, "portResult.generationPlan.questionBankDraftRef");
  requireConst(portResult.generationPlan.executionState, "PLAN_RECORDED_NOT_GENERATED", "portResult.generationPlan.executionState");
  return {
    planId: requireToken(portResult.generationPlan.planId, "portResult.generationPlan.planId", "qbank_generation_plan_"),
    questionBankDraftRef: normalized.sourceResult.result.questionBankDraftRef,
    executionState: "PLAN_RECORDED_NOT_GENERATED",
  };
}

function buildPlanRecord(normalized, recordedPlan, plannedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN",
    recordId: `student_app_ai_tutor_question_bank_draft_generation_plan_${safeToken(normalized.idempotencyKey)}`,
    plannedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_PORT,
    status: plannedStatus,
    planningInvocationId: normalized.planningInvocationId,
    sourceResult: {
      runtimeId: resultRuntimeId,
      requestId: normalized.sourceResult.result.requestId,
      archiveItemId: normalized.sourceResult.result.archiveItemId,
      resultSummary: normalized.sourceResult.result.resultSummary,
      questionBankDraftRef: normalized.sourceResult.result.questionBankDraftRef,
      resultCompletedAt: normalized.sourceResult.result.completedAt,
    },
    studentScope: normalized.studentScope,
    generationPlan: {
      planId: recordedPlan.planId,
      questionBankDraftRef: recordedPlan.questionBankDraftRef,
      learningObjectives: normalized.learningObjectives,
      items: normalized.plannedItems,
      budget: normalized.budget,
      executionState: recordedPlan.executionState,
      futureGenerationUseCase: "GenerateQuestionBankDraftContent.Execute",
      futureStorageRepository: "ArchiveRepository.SaveQuestionBankDraftContent",
      targetContentTable: "teaching_question_bank_draft_contents",
    },
    boundary: {
      resultEvidenceVerified: true,
      studentOwnScopeConfirmed: true,
      sourceArchiveEvidenceRequired: true,
      generationPlanRecorded: true,
      generationPlanOnly: true,
      modelInferenceStarted: false,
      questionContentGenerated: false,
      questionBankContentWriteStarted: false,
      studentAnsweringStarted: false,
      scoringStarted: false,
      studentVisiblePublished: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureGenerationWorker: true,
      requiresFutureContentStorageCommit: true,
    },
    evidenceRefs: uniq([
      ...normalized.evidenceRefs,
      `evidence:question-bank-generation-plan-hash:${normalized.planHash}`,
      `evidence:runtime:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RUNTIME_ID}`,
      `evidence:command-port:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_PORT}`,
    ]),
    idempotencyKey: normalized.idempotencyKey,
    planHash: normalized.planHash,
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: 8,
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_PROBE",
    },
  };
}

function buildResult(record, { idempotentReplay }) {
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_PORT,
    status: record.status,
    recordId: record.recordId,
    plannedAt: record.plannedAt,
    sourceResult: record.sourceResult,
    studentScope: record.studentScope,
    generationPlan: record.generationPlan,
    boundary: record.boundary,
    evidenceRefs: record.evidenceRefs,
    idempotencyKey: record.idempotencyKey,
    runtimeSlo: record.runtimeSlo,
    idempotentReplay,
  };
}

function findExistingRecordByIdempotencyKey(filePath, idempotencyKey) {
  if (!fs.existsSync(filePath)) return null;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/u).filter(Boolean)) {
    const record = JSON.parse(line);
    if (record.idempotencyKey === idempotencyKey) return record;
  }
  return null;
}

function assertReplayMatches(record, normalized) {
  requireConst(record.planHash, normalized.planHash, "record.planHash");
  requireConst(record.sourceResult?.requestId, normalized.sourceResult.result.requestId, "record.sourceResult.requestId");
  requireConst(record.generationPlan?.questionBankDraftRef, normalized.sourceResult.result.questionBankDraftRef, "record.generationPlan.questionBankDraftRef");
}

function appendRecord(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`);
}

function rejectLeakedFields(value, label) {
  if (!value || typeof value !== "object") return;
  for (const field of leakedFieldNames) {
    if (Object.prototype.hasOwnProperty.call(value, field) && hasText(value[field])) {
      throw planError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_LEAKED_FIELD", `${label}.${field} is not allowed`);
    }
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "studentAppAiTutorResultReport") continue;
    if (child && typeof child === "object") rejectLeakedFields(child, `${label}.${key}`);
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw planError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_INVALID_INPUT", `${label} must be an object`);
  }
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw planError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_INVALID_INPUT", `${label} must be ${expected}`);
  }
  return expected;
}

function requireToken(value, label, prefix) {
  const text = requireBoundedString(value, label, prefix.length + 1, 1000);
  if (!text.startsWith(prefix)) {
    throw planError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_INVALID_TOKEN", `${label} must start with ${prefix}`);
  }
  return text;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string" || value.length < min || value.length > max) {
    throw planError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_INVALID_INPUT", `${label} must be a string between ${min} and ${max} chars`);
  }
  return value;
}

function uniqueStringArray(value, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max || !value.every((item) => typeof item === "string" && item.length > 0)) {
    throw planError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_INVALID_INPUT", `${label} must contain ${min}-${max} strings`);
  }
  return uniq(value);
}

function uniqueBoundedStringArray(value, label, minItems, maxItems, minLength, maxLength) {
  return uniqueStringArray(value, label, minItems, maxItems).map((item) => requireBoundedString(item, `${label}[]`, minLength, maxLength));
}

function requireEnum(value, label, allowed) {
  if (!allowed.includes(value)) {
    throw planError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_INVALID_ENUM", `${label} must be one of ${allowed.join(",")}`);
  }
  return value;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw planError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_INVALID_INTEGER", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeToken(value) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 180);
}

function hasText(value) {
  return typeof value === "string" ? value.length > 0 : value !== undefined && value !== null;
}

function uniq(items) {
  return [...new Set(items)];
}

function planError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}
