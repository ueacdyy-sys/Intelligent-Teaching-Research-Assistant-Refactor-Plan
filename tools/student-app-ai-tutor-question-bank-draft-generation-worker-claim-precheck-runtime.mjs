import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_generation_worker_claim_precheck_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_PORT =
  "StudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheckPort.recordGenerationWorkerClaimPrecheck";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_READY =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_READY";

const inputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-worker-claim-precheck.v1";
const outputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-worker-claim-prechecked.v1";
const planSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-plan-recorded.v1";
const sourcePlanRuntimeId = "student_app_ai_tutor_question_bank_draft_generation_plan_runtime";
const sourcePlanPort = "StudentAppAITutorQuestionBankDraftGenerationPlanPort.recordQuestionBankDraftGenerationPlan";
const sourcePlanStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RECORDED";
const precheckedStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECKED";
const defaultCommandLogPath = "reports/student-command-log/student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck.jsonl";

const leakedFieldNames = [
  "answerText",
  "answerKey",
  "correctAnswer",
  "expectedAnswer",
  "explanation",
  "scoreSummary",
  "rawModelOutput",
  "modelOutput",
  "generatedQuestion",
  "questionContent",
  "contentRows",
  "directSql",
  "dbUrl",
  "internalError",
  "errorMessage",
];

export async function recordStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck(input, options = {}) {
  const checkedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const commandLogPath = options.commandLogPath ?? defaultCommandLogPath;
  const existing = findExistingRecordByIdempotencyKey(commandLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const precheckPort = assertPrecheckPort(options.generationWorkerClaimPrecheckPort);
  const portResult = await precheckPort.recordGenerationWorkerClaimPrecheck(buildPortRequest(normalized));
  const decision = assertPortResult(portResult, normalized);
  const record = buildPrecheckRecord(normalized, decision, checkedAt);
  appendRecord(commandLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck(result) {
  return [
    `Student App AI Tutor question-bank generation worker claim precheck: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Plan: ${result.sourceGenerationPlan.planId}`,
    `Worker: ${result.worker.workerId}`,
    `Model started: ${result.boundary.modelInferenceStarted}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const precheckInvocationId = requireToken(input.precheckInvocationId, "input.precheckInvocationId", "qbank_generation_worker_precheck_");
  const sourcePlanReport = assertSourcePlanReport(input.questionBankDraftGenerationPlanReport);
  const sourcePlan = assertSourcePlan(sourcePlanReport);
  const principal = assertPrincipal(input.principal);
  const worker = assertWorker(input.worker, sourcePlan.generationPlan.budget);
  const claimPolicy = assertClaimPolicy(input.claimPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 220);
  if (!evidenceRefs.some((ref) => ref.includes("question-bank-draft-generation-plan"))) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_MISSING_PLAN_EVIDENCE", "generation plan evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 280);
  const inputHash = hashInput({
    precheckInvocationId,
    planId: sourcePlan.generationPlan.planId,
    questionBankDraftRef: sourcePlan.generationPlan.questionBankDraftRef,
    workerId: worker.workerId,
    leaseSeconds: worker.leaseSeconds,
    maxConcurrentPlans: worker.maxConcurrentPlans,
    claimPolicy,
  });
  return { precheckInvocationId, sourcePlanReport, sourcePlan, principal, worker, claimPolicy, evidenceRefs, idempotencyKey, inputHash };
}

function assertSourcePlanReport(report) {
  rejectLeakedFields(report, "input.questionBankDraftGenerationPlanReport");
  assertPlainObject(report, "input.questionBankDraftGenerationPlanReport");
  requireConst(report.readiness, "READY", "input.questionBankDraftGenerationPlanReport.readiness");
  requireConst(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN", "input.questionBankDraftGenerationPlanReport.workloadType");
  requireConst(report.runtime?.runtimeId, sourcePlanRuntimeId, "input.questionBankDraftGenerationPlanReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, sourcePlanPort, "input.questionBankDraftGenerationPlanReport.runtime.commandPort");
  requireConst(report.runtime?.status, sourcePlanStatus, "input.questionBankDraftGenerationPlanReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.questionBankDraftGenerationPlanReport.runtimeSlo.totalErrors");
  const boundary = report.safetyInvariants ?? {};
  for (const field of ["sourceResultEvidenceRequired", "studentOwnScopeRequired", "generationPlanOnly", "generationPlanRecorded"]) {
    requireConst(boundary[field], true, `input.questionBankDraftGenerationPlanReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "modelInferenceAllowed",
    "questionContentGenerated",
    "questionBankContentWriteStarted",
    "studentAnsweringAllowed",
    "scoringAllowed",
    "studentVisiblePublishAllowed",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(boundary[field], false, `input.questionBankDraftGenerationPlanReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertSourcePlan(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationPlan?.result;
  rejectLeakedFields(result, "source.generationPlanResult");
  assertPlainObject(result, "source.generationPlanResult");
  requireConst(result.schemaVersion, planSchemaVersion, "source.schemaVersion");
  requireConst(result.runtimeId, sourcePlanRuntimeId, "source.runtimeId");
  requireConst(result.commandPort, sourcePlanPort, "source.commandPort");
  requireConst(result.status, sourcePlanStatus, "source.status");
  requireConst(result.boundary?.generationPlanOnly, true, "source.boundary.generationPlanOnly");
  requireConst(result.boundary?.generationPlanRecorded, true, "source.boundary.generationPlanRecorded");
  for (const field of [
    "modelInferenceStarted",
    "questionContentGenerated",
    "questionBankContentWriteStarted",
    "studentAnsweringStarted",
    "scoringStarted",
    "studentVisiblePublished",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(result.boundary?.[field], false, `source.boundary.${field}`);
  }
  assertPlainObject(result.sourceResult, "source.sourceResult");
  assertPlainObject(result.studentScope, "source.studentScope");
  assertPlainObject(result.generationPlan, "source.generationPlan");
  requireConst(result.generationPlan.executionState, "PLAN_RECORDED_NOT_GENERATED", "source.generationPlan.executionState");
  const questionBankDraftRef = requireQuestionBankDraftRef(result.generationPlan.questionBankDraftRef, "source.generationPlan.questionBankDraftRef");
  const items = assertPlanItems(result.generationPlan.items, "source.generationPlan.items");
  const budget = assertPlanBudget(result.generationPlan.budget, items.length);
  return {
    ...result,
    sourceResult: {
      requestId: requireToken(result.sourceResult.requestId, "source.sourceResult.requestId", "tutor_req_"),
      archiveItemId: requireToken(result.sourceResult.archiveItemId, "source.sourceResult.archiveItemId", "tarch_"),
      questionBankDraftRef,
    },
    studentScope: {
      mode: requireConst(result.studentScope.mode, "OWN", "source.studentScope.mode"),
      studentId: requireBoundedString(result.studentScope.studentId, "source.studentScope.studentId", 1, 128),
      archiveItemId: requireToken(result.studentScope.archiveItemId, "source.studentScope.archiveItemId", "tarch_"),
    },
    generationPlan: {
      planId: requireToken(result.generationPlan.planId, "source.generationPlan.planId", "qbank_generation_plan_"),
      questionBankDraftRef,
      items,
      budget,
      executionState: "PLAN_RECORDED_NOT_GENERATED",
      futureGenerationUseCase: requireConst(result.generationPlan.futureGenerationUseCase, "GenerateQuestionBankDraftContent.Execute", "source.generationPlan.futureGenerationUseCase"),
      futureStorageRepository: requireConst(result.generationPlan.futureStorageRepository, "ArchiveRepository.SaveQuestionBankDraftContent", "source.generationPlan.futureStorageRepository"),
      targetContentTable: requireConst(result.generationPlan.targetContentTable, "teaching_question_bank_draft_contents", "source.generationPlan.targetContentTable"),
    },
  };
}

function assertPlanItems(items, label) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_INVALID_PLAN_ITEMS", `${label} must contain 1-20 items`);
  }
  const seen = new Set();
  return items.map((item, index) => {
    rejectLeakedFields(item, `${label}[${index}]`);
    assertPlainObject(item, `${label}[${index}]`);
    const itemId = requireToken(item.itemId, `${label}[${index}].itemId`, "qbank_plan_item_");
    if (seen.has(itemId)) {
      throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_DUPLICATE_PLAN_ITEM", "plan item ids must be unique");
    }
    seen.add(itemId);
    return {
      itemId,
      knowledgePoint: requireBoundedString(item.knowledgePoint, `${label}[${index}].knowledgePoint`, 1, 180),
      learningGap: requireBoundedString(item.learningGap, `${label}[${index}].learningGap`, 1, 260),
      difficulty: requireEnum(item.difficulty, `${label}[${index}].difficulty`, ["FOUNDATION", "STANDARD", "CHALLENGE"]),
      questionType: requireEnum(item.questionType, `${label}[${index}].questionType`, ["SHORT_ANSWER", "MULTIPLE_CHOICE", "FILL_IN_BLANK", "CALCULATION"]),
      promptBlueprint: requireBoundedString(item.promptBlueprint, `${label}[${index}].promptBlueprint`, 1, 600),
      sourceEvidenceRef: requireBoundedString(item.sourceEvidenceRef, `${label}[${index}].sourceEvidenceRef`, 1, 260),
      maxHints: requireIntegerBetween(item.maxHints, `${label}[${index}].maxHints`, 0, 5),
    };
  });
}

function assertPlanBudget(budget, itemCount) {
  assertPlainObject(budget, "source.generationPlan.budget");
  const plannedQuestionCount = requireIntegerBetween(budget.plannedQuestionCount, "source.generationPlan.budget.plannedQuestionCount", 1, 20);
  if (plannedQuestionCount !== itemCount) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_PLAN_BUDGET_MISMATCH", "plan item count must match budget.plannedQuestionCount");
  }
  return {
    plannedQuestionCount,
    maxPromptTokens: requireIntegerBetween(budget.maxPromptTokens, "source.generationPlan.budget.maxPromptTokens", 128, 8000),
    maxGenerationAttempts: requireIntegerBetween(budget.maxGenerationAttempts, "source.generationPlan.budget.maxGenerationAttempts", 1, 3),
    p99PlanningBudgetMs: requireIntegerBetween(budget.p99PlanningBudgetMs, "source.generationPlan.budget.p99PlanningBudgetMs", 1, 50),
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
      throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_MISSING_SCOPE", `${required} is required`);
    }
  }
  return { principalId, subjectType: "SERVICE", role: "SERVICE", entryPoint: "AGENT_INTERNAL", sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 128), scopes };
}

function assertWorker(worker, budget) {
  assertPlainObject(worker, "input.worker");
  const workerId = requireBoundedString(worker.workerId, "input.worker.workerId", 1, 128);
  requireConst(worker.agent, "StudentTutorAgent", "input.worker.agent");
  requireConst(worker.skillId, "generate_question_bank_draft", "input.worker.skillId");
  requireConst(worker.nodeType, "LOCAL", "input.worker.nodeType");
  const leaseSeconds = requireIntegerBetween(worker.leaseSeconds, "input.worker.leaseSeconds", 30, 3600);
  const maxConcurrentPlans = requireIntegerBetween(worker.maxConcurrentPlans, "input.worker.maxConcurrentPlans", 1, 16);
  const maxPlannedQuestionCount = requireIntegerBetween(worker.maxPlannedQuestionCount, "input.worker.maxPlannedQuestionCount", 1, 20);
  if (maxPlannedQuestionCount < budget.plannedQuestionCount) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_WORKER_BUDGET_TOO_SMALL", "worker maxPlannedQuestionCount must cover the source plan");
  }
  return { workerId, agent: "StudentTutorAgent", skillId: "generate_question_bank_draft", nodeType: "LOCAL", leaseSeconds, maxConcurrentPlans, maxPlannedQuestionCount };
}

function assertClaimPolicy(policy) {
  assertPlainObject(policy, "input.claimPolicy");
  for (const field of [
    "sourceGenerationPlanRequired",
    "precheckOnly",
    "atomicLeaseRequired",
    "workerBudgetRequired",
    "idempotentPrecheckRequired",
    "humanReviewRequiredBeforeStudentVisibility",
  ]) {
    requireConst(policy[field], true, `input.claimPolicy.${field}`);
  }
  for (const field of [
    "claimPlanNowAllowed",
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
    requireConst(policy[field], false, `input.claimPolicy.${field}`);
  }
  requireConst(policy.planExecutionStateRequired, "PLAN_RECORDED_NOT_GENERATED", "input.claimPolicy.planExecutionStateRequired");
  requireConst(policy.queueName, "student_app_ai_tutor_question_bank_generation", "input.claimPolicy.queueName");
  requireConst(policy.targetUseCase, "PrecheckQuestionBankDraftGenerationWorkerClaim.Execute", "input.claimPolicy.targetUseCase");
  requireConst(policy.futureClaimUseCase, "ClaimQuestionBankDraftGenerationPlan.Execute", "input.claimPolicy.futureClaimUseCase");
  requireConst(policy.futureGenerationUseCase, "GenerateQuestionBankDraftContent.Execute", "input.claimPolicy.futureGenerationUseCase");
  requireConst(policy.futureStorageRepository, "ArchiveRepository.SaveQuestionBankDraftContent", "input.claimPolicy.futureStorageRepository");
  requireConst(policy.targetContentTable, "teaching_question_bank_draft_contents", "input.claimPolicy.targetContentTable");
  return { ...policy };
}

function assertPrecheckPort(port) {
  if (!port || typeof port.recordGenerationWorkerClaimPrecheck !== "function") {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_MISSING_PORT", "GenerationWorkerClaimPrecheckPort.recordGenerationWorkerClaimPrecheck is required");
  }
  return port;
}

function buildPortRequest(normalized) {
  return {
    portName: "StudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheckPort",
    operation: "recordGenerationWorkerClaimPrecheck",
    targetUseCase: "PrecheckQuestionBankDraftGenerationWorkerClaim.Execute",
    targetCommandLog: "student-command-log/question-bank-draft-generation-worker-claim-precheck",
    principal: normalized.principal,
    worker: normalized.worker,
    sourceGenerationPlan: {
      planId: normalized.sourcePlan.generationPlan.planId,
      questionBankDraftRef: normalized.sourcePlan.generationPlan.questionBankDraftRef,
      sourceRequestId: normalized.sourcePlan.sourceResult.requestId,
      archiveItemId: normalized.sourcePlan.sourceResult.archiveItemId,
      plannedQuestionCount: normalized.sourcePlan.generationPlan.budget.plannedQuestionCount,
      maxPromptTokens: normalized.sourcePlan.generationPlan.budget.maxPromptTokens,
      maxGenerationAttempts: normalized.sourcePlan.generationPlan.budget.maxGenerationAttempts,
      executionState: normalized.sourcePlan.generationPlan.executionState,
    },
    idempotencyKey: normalized.idempotencyKey,
    evidenceRefs: uniq([
      ...normalized.evidenceRefs,
      `evidence:question-bank-generation-worker-claim-precheck-input-hash:${normalized.inputHash}`,
      `evidence:source-runtime:${sourcePlanRuntimeId}`,
    ]),
    safety: {
      sourceGenerationPlanRequired: true,
      precheckOnly: true,
      atomicLeaseRequired: true,
      claimPlanNowAllowed: false,
      executeModelNowAllowed: false,
      generateQuestionsNowAllowed: false,
      writeQuestionBankContentNowAllowed: false,
      studentVisiblePublishAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
  };
}

function assertPortResult(portResult, normalized) {
  assertPlainObject(portResult, "portResult");
  assertPlainObject(portResult.source, "portResult.source");
  requireConst(portResult.source.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_PORT, "portResult.source.commandPort");
  requireConst(portResult.source.targetUseCase, "PrecheckQuestionBankDraftGenerationWorkerClaim.Execute", "portResult.source.targetUseCase");
  requireConst(portResult.source.targetCommandLog, "student-command-log/question-bank-draft-generation-worker-claim-precheck", "portResult.source.targetCommandLog");
  assertPlainObject(portResult.precheckDecision, "portResult.precheckDecision");
  requireConst(portResult.precheckDecision.planId, normalized.sourcePlan.generationPlan.planId, "portResult.precheckDecision.planId");
  requireConst(portResult.precheckDecision.workerId, normalized.worker.workerId, "portResult.precheckDecision.workerId");
  requireConst(portResult.precheckDecision.executionState, "PRECHECKED_NOT_CLAIMED", "portResult.precheckDecision.executionState");
  requireConst(portResult.precheckDecision.modelInferenceStarted, false, "portResult.precheckDecision.modelInferenceStarted");
  requireConst(portResult.precheckDecision.questionContentGenerated, false, "portResult.precheckDecision.questionContentGenerated");
  return {
    precheckId: requireToken(portResult.precheckDecision.precheckId, "portResult.precheckDecision.precheckId", "qbank_generation_worker_precheck_"),
    planId: normalized.sourcePlan.generationPlan.planId,
    workerId: normalized.worker.workerId,
    executionState: "PRECHECKED_NOT_CLAIMED",
    queueName: "student_app_ai_tutor_question_bank_generation",
  };
}

function buildPrecheckRecord(normalized, decision, checkedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK",
    recordId: `student_app_ai_tutor_question_bank_draft_generation_worker_claim_precheck_${safeToken(normalized.idempotencyKey)}`,
    checkedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_PORT,
    status: precheckedStatus,
    precheckInvocationId: normalized.precheckInvocationId,
    sourceGenerationPlan: {
      runtimeId: sourcePlanRuntimeId,
      planId: normalized.sourcePlan.generationPlan.planId,
      questionBankDraftRef: normalized.sourcePlan.generationPlan.questionBankDraftRef,
      sourceRequestId: normalized.sourcePlan.sourceResult.requestId,
      archiveItemId: normalized.sourcePlan.sourceResult.archiveItemId,
      studentId: normalized.sourcePlan.studentScope.studentId,
      plannedQuestionCount: normalized.sourcePlan.generationPlan.budget.plannedQuestionCount,
      maxPromptTokens: normalized.sourcePlan.generationPlan.budget.maxPromptTokens,
      maxGenerationAttempts: normalized.sourcePlan.generationPlan.budget.maxGenerationAttempts,
      executionState: normalized.sourcePlan.generationPlan.executionState,
    },
    principal: normalized.principal,
    worker: normalized.worker,
    precheckDecision: {
      precheckId: decision.precheckId,
      workerEligible: true,
      claimReadiness: "ELIGIBLE_NOT_CLAIMED",
      queueName: decision.queueName,
      executionState: decision.executionState,
      requiresFutureAtomicClaim: true,
      requiresFutureModelGeneration: true,
      requiresFutureContentStorageCommit: true,
      reason: "Generation plan and worker budget passed precheck; actual claim, model generation, and content storage remain future reviewed slices.",
    },
    boundary: {
      internalServiceOnly: true,
      sourceGenerationPlanVerified: true,
      workerLeasePolicyChecked: true,
      workerBudgetChecked: true,
      precheckOnly: true,
      generationPlanClaimed: false,
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
    },
    evidenceRefs: uniq([
      ...normalized.evidenceRefs,
      `evidence:question-bank-generation-worker-claim-precheck-input-hash:${normalized.inputHash}`,
      `evidence:runtime:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_RUNTIME_ID}`,
      `evidence:command-port:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_PORT}`,
      `evidence:source-runtime:${sourcePlanRuntimeId}`,
    ]),
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: 7,
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_PROBE",
    },
  };
}

function buildResult(record, { idempotentReplay }) {
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_PORT,
    status: record.status,
    recordId: record.recordId,
    checkedAt: record.checkedAt,
    sourceGenerationPlan: record.sourceGenerationPlan,
    worker: record.worker,
    precheckDecision: record.precheckDecision,
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
  requireConst(record.inputHash, normalized.inputHash, "record.inputHash");
  requireConst(record.sourceGenerationPlan?.planId, normalized.sourcePlan.generationPlan.planId, "record.sourceGenerationPlan.planId");
  requireConst(record.worker?.workerId, normalized.worker.workerId, "record.worker.workerId");
}

function appendRecord(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`);
}

function rejectLeakedFields(value, label) {
  if (!value || typeof value !== "object") return;
  for (const field of leakedFieldNames) {
    if (Object.prototype.hasOwnProperty.call(value, field) && hasText(value[field])) {
      throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_LEAKED_FIELD", `${label}.${field} is not allowed`);
    }
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "questionBankDraftGenerationPlanReport") continue;
    if (child && typeof child === "object") rejectLeakedFields(child, `${label}.${key}`);
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_INVALID_INPUT", `${label} must be an object`);
  }
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_INVALID_INPUT", `${label} must be ${expected}`);
  }
  return expected;
}

function requireToken(value, label, prefix) {
  const text = requireBoundedString(value, label, prefix.length + 1, 1000);
  if (!text.startsWith(prefix)) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_INVALID_TOKEN", `${label} must start with ${prefix}`);
  }
  return text;
}

function requireQuestionBankDraftRef(value, label) {
  const text = requireBoundedString(value, label, 1, 1000);
  if (!text.startsWith("local://question-bank-drafts/")) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_INVALID_DRAFT_REF", `${label} must use local://question-bank-drafts/`);
  }
  return text;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string" || value.length < min || value.length > max) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_INVALID_INPUT", `${label} must be a string between ${min} and ${max} chars`);
  }
  return value;
}

function uniqueStringArray(value, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max || !value.every((item) => typeof item === "string" && item.length > 0)) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_INVALID_INPUT", `${label} must contain ${min}-${max} strings`);
  }
  return uniq(value);
}

function requireEnum(value, label, allowed) {
  if (!allowed.includes(value)) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_INVALID_ENUM", `${label} must be one of ${allowed.join(",")}`);
  }
  return value;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_INVALID_INTEGER", `${label} must be an integer between ${min} and ${max}`);
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

function precheckError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}
