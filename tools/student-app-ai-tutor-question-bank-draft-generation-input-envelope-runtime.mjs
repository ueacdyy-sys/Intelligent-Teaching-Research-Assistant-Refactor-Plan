import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_generation_input_envelope_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_PORT =
  "StudentAppAITutorQuestionBankDraftGenerationInputEnvelopePort.recordGenerationInputEnvelope";

const inputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-input-envelope.v1";
const outputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-input-envelope-recorded.v1";
const planSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-plan-recorded.v1";
const claimSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-worker-claimed.v1";
const planRuntimeId = "student_app_ai_tutor_question_bank_draft_generation_plan_runtime";
const claimRuntimeId = "student_app_ai_tutor_question_bank_draft_generation_worker_claim_runtime";
const planPort = "StudentAppAITutorQuestionBankDraftGenerationPlanPort.recordQuestionBankDraftGenerationPlan";
const claimPort = "StudentAppAITutorQuestionBankDraftGenerationWorkerClaimPort.claimGenerationPlan";
const recordedStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RECORDED";
const defaultEnvelopeLogPath = "reports/student-command-log/student-app-ai-tutor-question-bank-draft-generation-input-envelope.jsonl";

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
  "generatedQuestions",
  "questionContent",
  "contentRows",
  "directSql",
  "dbUrl",
  "internalError",
  "errorMessage",
];

export async function recordStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(input, options = {}) {
  const recordedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const envelopeLogPath = options.envelopeLogPath ?? defaultEnvelopeLogPath;
  const existing = findExistingRecordByIdempotencyKey(envelopeLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const envelopePort = assertEnvelopePort(options.generationInputEnvelopePort);
  const portResult = await envelopePort.recordGenerationInputEnvelope(buildPortRequest(normalized));
  const inputEnvelope = assertPortResult(portResult, normalized);
  const record = buildEnvelopeRecord(normalized, inputEnvelope, recordedAt);
  appendRecord(envelopeLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(result) {
  return [
    `Student App AI Tutor question-bank generation input envelope: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Envelope: ${result.inputEnvelope.envelopeId}`,
    `Blueprints: ${result.inputEnvelope.itemBlueprints.length}`,
    `Model started: ${result.boundary.modelInferenceStarted}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const envelopeInvocationId = requireToken(input.envelopeInvocationId, "input.envelopeInvocationId", "qbank_generation_input_envelope_");
  const generationPlanReport = assertGenerationPlanReport(input.generationPlanReport);
  const generationPlan = assertGenerationPlanResult(generationPlanReport);
  const workerClaimReport = assertWorkerClaimReport(input.generationWorkerClaimReport);
  const workerClaim = assertWorkerClaimResult(workerClaimReport);
  assertPlanAndClaimMatch(generationPlan, workerClaim);
  const principal = assertPrincipal(input.principal);
  const worker = assertWorker(input.worker, workerClaim);
  const envelopePolicy = assertEnvelopePolicy(input.envelopePolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 260);
  if (!evidenceRefs.some((ref) => ref.includes("generation-plan"))) {
    throw envelopeError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_MISSING_PLAN_EVIDENCE", "generation plan evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("generation-worker-claim"))) {
    throw envelopeError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_MISSING_CLAIM_EVIDENCE", "generation worker claim evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 320);
  const inputHash = hashInput({
    envelopeInvocationId,
    planId: generationPlan.generationPlan.planId,
    claimId: workerClaim.claim.claimId,
    workerId: worker.workerId,
    itemIds: generationPlan.generationPlan.items.map((item) => item.itemId),
    budget: generationPlan.generationPlan.budget,
    envelopePolicy,
  });
  return {
    envelopeInvocationId,
    generationPlanReport,
    generationPlan,
    workerClaimReport,
    workerClaim,
    principal,
    worker,
    envelopePolicy,
    evidenceRefs,
    idempotencyKey,
    inputHash,
  };
}

function assertGenerationPlanReport(report) {
  rejectLeakedFields(report, "input.generationPlanReport");
  assertPlainObject(report, "input.generationPlanReport");
  requireConst(report.readiness, "READY", "input.generationPlanReport.readiness");
  requireConst(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN", "input.generationPlanReport.workloadType");
  requireConst(report.runtime?.runtimeId, planRuntimeId, "input.generationPlanReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, planPort, "input.generationPlanReport.runtime.commandPort");
  requireConst(report.runtime?.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RECORDED", "input.generationPlanReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.generationPlanReport.runtimeSlo.totalErrors");
  const boundary = report.safetyInvariants ?? {};
  for (const field of ["generationPlanOnly", "generationPlanRecorded"]) requireConst(boundary[field], true, `input.generationPlanReport.safetyInvariants.${field}`);
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
    requireConst(boundary[field], false, `input.generationPlanReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertGenerationPlanResult(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationPlan?.result;
  rejectLeakedFields(result, "source.generationPlanResult");
  assertPlainObject(result, "source.generationPlanResult");
  requireConst(result.schemaVersion, planSchemaVersion, "source.plan.schemaVersion");
  requireConst(result.runtimeId, planRuntimeId, "source.plan.runtimeId");
  requireConst(result.commandPort, planPort, "source.plan.commandPort");
  requireConst(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RECORDED", "source.plan.status");
  requireConst(result.boundary?.generationPlanOnly, true, "source.plan.boundary.generationPlanOnly");
  requireConst(result.boundary?.questionContentGenerated, false, "source.plan.boundary.questionContentGenerated");
  requireConst(result.boundary?.questionBankContentWriteStarted, false, "source.plan.boundary.questionBankContentWriteStarted");
  assertPlainObject(result.studentScope, "source.plan.studentScope");
  assertPlainObject(result.generationPlan, "source.plan.generationPlan");
  requireConst(result.generationPlan.executionState, "PLAN_RECORDED_NOT_GENERATED", "source.plan.generationPlan.executionState");
  const items = assertPlanItems(result.generationPlan.items);
  return {
    ...result,
    studentScope: {
      mode: requireConst(result.studentScope.mode, "OWN", "source.plan.studentScope.mode"),
      studentId: requireBoundedString(result.studentScope.studentId, "source.plan.studentScope.studentId", 1, 128),
      archiveItemId: requireToken(result.studentScope.archiveItemId, "source.plan.studentScope.archiveItemId", "tarch_"),
    },
    generationPlan: {
      planId: requireToken(result.generationPlan.planId, "source.plan.generationPlan.planId", "qbank_generation_plan_"),
      questionBankDraftRef: requireQuestionBankDraftRef(result.generationPlan.questionBankDraftRef, "source.plan.generationPlan.questionBankDraftRef"),
      learningObjectives: uniqueBoundedStringArray(result.generationPlan.learningObjectives, "source.plan.generationPlan.learningObjectives", 1, 8, 3, 180),
      items,
      budget: assertBudget(result.generationPlan.budget, items.length),
      executionState: "PLAN_RECORDED_NOT_GENERATED",
      futureGenerationUseCase: requireConst(result.generationPlan.futureGenerationUseCase, "GenerateQuestionBankDraftContent.Execute", "source.plan.generationPlan.futureGenerationUseCase"),
      futureStorageRepository: requireConst(result.generationPlan.futureStorageRepository, "ArchiveRepository.SaveQuestionBankDraftContent", "source.plan.generationPlan.futureStorageRepository"),
      targetContentTable: requireConst(result.generationPlan.targetContentTable, "teaching_question_bank_draft_contents", "source.plan.generationPlan.targetContentTable"),
    },
  };
}

function assertWorkerClaimReport(report) {
  rejectLeakedFields(report, "input.generationWorkerClaimReport");
  assertPlainObject(report, "input.generationWorkerClaimReport");
  requireConst(report.readiness, "READY", "input.generationWorkerClaimReport.readiness");
  requireConst(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM", "input.generationWorkerClaimReport.workloadType");
  requireConst(report.runtime?.runtimeId, claimRuntimeId, "input.generationWorkerClaimReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, claimPort, "input.generationWorkerClaimReport.runtime.commandPort");
  requireConst(report.runtime?.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIMED", "input.generationWorkerClaimReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.generationWorkerClaimReport.runtimeSlo.totalErrors");
  const boundary = report.safetyInvariants ?? {};
  requireConst(boundary.generationPlanClaimed, true, "input.generationWorkerClaimReport.safetyInvariants.generationPlanClaimed");
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
    requireConst(boundary[field], false, `input.generationWorkerClaimReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertWorkerClaimResult(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationWorkerClaim?.result;
  rejectLeakedFields(result, "source.workerClaimResult");
  assertPlainObject(result, "source.workerClaimResult");
  requireConst(result.schemaVersion, claimSchemaVersion, "source.claim.schemaVersion");
  requireConst(result.runtimeId, claimRuntimeId, "source.claim.runtimeId");
  requireConst(result.commandPort, claimPort, "source.claim.commandPort");
  requireConst(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIMED", "source.claim.status");
  requireConst(result.boundary?.generationPlanClaimed, true, "source.claim.boundary.generationPlanClaimed");
  requireConst(result.boundary?.modelInferenceStarted, false, "source.claim.boundary.modelInferenceStarted");
  requireConst(result.boundary?.questionContentGenerated, false, "source.claim.boundary.questionContentGenerated");
  assertPlainObject(result.worker, "source.claim.worker");
  assertPlainObject(result.claim, "source.claim.claim");
  requireConst(result.claim.status, "IN_PROGRESS", "source.claim.claim.status");
  requireConst(result.claim.executionState, "CLAIMED_NOT_GENERATED", "source.claim.claim.executionState");
  return {
    ...result,
    worker: {
      workerId: requireBoundedString(result.worker.workerId, "source.claim.worker.workerId", 1, 128),
      agent: requireConst(result.worker.agent, "StudentTutorAgent", "source.claim.worker.agent"),
      skillId: requireConst(result.worker.skillId, "generate_question_bank_draft", "source.claim.worker.skillId"),
      nodeType: requireConst(result.worker.nodeType, "LOCAL", "source.claim.worker.nodeType"),
      leaseSeconds: requireIntegerBetween(result.worker.leaseSeconds, "source.claim.worker.leaseSeconds", 30, 3600),
      maxConcurrentPlans: requireIntegerBetween(result.worker.maxConcurrentPlans, "source.claim.worker.maxConcurrentPlans", 1, 16),
      maxPlannedQuestionCount: requireIntegerBetween(result.worker.maxPlannedQuestionCount, "source.claim.worker.maxPlannedQuestionCount", 1, 20),
    },
    claim: {
      claimId: requireToken(result.claim.claimId, "source.claim.claim.claimId", "qbank_generation_claim_"),
      planId: requireToken(result.claim.planId, "source.claim.claim.planId", "qbank_generation_plan_"),
      questionBankDraftRef: requireQuestionBankDraftRef(result.claim.questionBankDraftRef, "source.claim.claim.questionBankDraftRef"),
      sourceRequestId: requireToken(result.claim.sourceRequestId, "source.claim.claim.sourceRequestId", "tutor_req_"),
      archiveItemId: requireToken(result.claim.archiveItemId, "source.claim.claim.archiveItemId", "tarch_"),
      studentId: requireBoundedString(result.claim.studentId, "source.claim.claim.studentId", 1, 128),
      workerId: requireBoundedString(result.claim.workerId, "source.claim.claim.workerId", 1, 128),
      leaseSeconds: requireIntegerBetween(result.claim.leaseSeconds, "source.claim.claim.leaseSeconds", 30, 3600),
      claimExpiresAt: requireBoundedString(result.claim.claimExpiresAt, "source.claim.claim.claimExpiresAt", 1, 80),
      status: "IN_PROGRESS",
      executionState: "CLAIMED_NOT_GENERATED",
    },
  };
}

function assertPlanAndClaimMatch(plan, claim) {
  requireConst(claim.claim.planId, plan.generationPlan.planId, "source.claim.claim.planId");
  requireConst(claim.claim.questionBankDraftRef, plan.generationPlan.questionBankDraftRef, "source.claim.claim.questionBankDraftRef");
  requireConst(claim.claim.archiveItemId, plan.studentScope.archiveItemId, "source.claim.claim.archiveItemId");
  requireConst(claim.claim.studentId, plan.studentScope.studentId, "source.claim.claim.studentId");
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
      throw envelopeError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_MISSING_SCOPE", `${required} is required`);
    }
  }
  return { principalId, subjectType: "SERVICE", role: "SERVICE", entryPoint: "AGENT_INTERNAL", sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 128), scopes };
}

function assertWorker(worker, claim) {
  assertPlainObject(worker, "input.worker");
  const workerId = requireBoundedString(worker.workerId, "input.worker.workerId", 1, 128);
  requireConst(workerId, claim.worker.workerId, "input.worker.workerId");
  requireConst(worker.agent, claim.worker.agent, "input.worker.agent");
  requireConst(worker.skillId, claim.worker.skillId, "input.worker.skillId");
  requireConst(worker.nodeType, claim.worker.nodeType, "input.worker.nodeType");
  requireConst(requireIntegerBetween(worker.leaseSeconds, "input.worker.leaseSeconds", 30, 3600), claim.worker.leaseSeconds, "input.worker.leaseSeconds");
  requireConst(requireIntegerBetween(worker.maxConcurrentPlans, "input.worker.maxConcurrentPlans", 1, 16), claim.worker.maxConcurrentPlans, "input.worker.maxConcurrentPlans");
  requireConst(requireIntegerBetween(worker.maxPlannedQuestionCount, "input.worker.maxPlannedQuestionCount", 1, 20), claim.worker.maxPlannedQuestionCount, "input.worker.maxPlannedQuestionCount");
  return { ...claim.worker };
}

function assertEnvelopePolicy(policy) {
  assertPlainObject(policy, "input.envelopePolicy");
  for (const field of [
    "sourceGenerationPlanRequired",
    "sourceWorkerClaimRequired",
    "promptBlueprintRequired",
    "safetyConstraintsRequired",
    "answerKeyRemovalRequired",
    "modelExecutionDeferred",
    "contentStorageDeferred",
    "humanReviewRequiredBeforeStudentVisibility",
    "idempotentEnvelopeRequired",
  ]) {
    requireConst(policy[field], true, `input.envelopePolicy.${field}`);
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
    requireConst(policy[field], false, `input.envelopePolicy.${field}`);
  }
  requireConst(policy.claimExecutionStateRequired, "CLAIMED_NOT_GENERATED", "input.envelopePolicy.claimExecutionStateRequired");
  requireConst(policy.envelopeExecutionState, "INPUT_ENVELOPE_RECORDED_NOT_GENERATED", "input.envelopePolicy.envelopeExecutionState");
  requireConst(policy.targetUseCase, "PrepareQuestionBankDraftGenerationInputEnvelope.Execute", "input.envelopePolicy.targetUseCase");
  requireConst(policy.futureGenerationUseCase, "GenerateQuestionBankDraftContent.Execute", "input.envelopePolicy.futureGenerationUseCase");
  requireConst(policy.futureStorageRepository, "ArchiveRepository.SaveQuestionBankDraftContent", "input.envelopePolicy.futureStorageRepository");
  requireConst(policy.targetContentTable, "teaching_question_bank_draft_contents", "input.envelopePolicy.targetContentTable");
  return { ...policy };
}

function assertPlanItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) {
    throw envelopeError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_INVALID_ITEMS", "source.plan.generationPlan.items must contain 1-20 items");
  }
  const ids = new Set();
  return items.map((item, index) => {
    assertPlainObject(item, `source.plan.generationPlan.items[${index}]`);
    const itemId = requireToken(item.itemId, `source.plan.generationPlan.items[${index}].itemId`, "qbank_plan_item_");
    if (ids.has(itemId)) throw envelopeError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_DUPLICATE_ITEM", `${itemId} is duplicated`);
    ids.add(itemId);
    return {
      itemId,
      knowledgePoint: requireBoundedString(item.knowledgePoint, `source.plan.generationPlan.items[${index}].knowledgePoint`, 1, 160),
      learningGap: requireBoundedString(item.learningGap, `source.plan.generationPlan.items[${index}].learningGap`, 1, 260),
      difficulty: requireOneOf(item.difficulty, `source.plan.generationPlan.items[${index}].difficulty`, ["FOUNDATION", "STANDARD", "CHALLENGE"]),
      questionType: requireOneOf(item.questionType, `source.plan.generationPlan.items[${index}].questionType`, ["SHORT_ANSWER", "MULTIPLE_CHOICE", "FILL_IN_BLANK", "CALCULATION"]),
      promptBlueprint: requireBoundedString(item.promptBlueprint, `source.plan.generationPlan.items[${index}].promptBlueprint`, 12, 500),
      sourceEvidenceRef: requireBoundedString(item.sourceEvidenceRef, `source.plan.generationPlan.items[${index}].sourceEvidenceRef`, 1, 300),
      maxHints: requireIntegerBetween(item.maxHints, `source.plan.generationPlan.items[${index}].maxHints`, 0, 5),
    };
  });
}

function assertBudget(budget, itemCount) {
  assertPlainObject(budget, "source.plan.generationPlan.budget");
  requireConst(requireIntegerBetween(budget.plannedQuestionCount, "source.plan.generationPlan.budget.plannedQuestionCount", 1, 20), itemCount, "source.plan.generationPlan.budget.plannedQuestionCount");
  return {
    plannedQuestionCount: itemCount,
    maxPromptTokens: requireIntegerBetween(budget.maxPromptTokens, "source.plan.generationPlan.budget.maxPromptTokens", 128, 8000),
    maxGenerationAttempts: requireIntegerBetween(budget.maxGenerationAttempts, "source.plan.generationPlan.budget.maxGenerationAttempts", 1, 3),
    p99PlanningBudgetMs: requireIntegerBetween(budget.p99PlanningBudgetMs, "source.plan.generationPlan.budget.p99PlanningBudgetMs", 1, 1000),
  };
}

function assertEnvelopePort(port) {
  if (!port || typeof port.recordGenerationInputEnvelope !== "function") {
    throw envelopeError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_MISSING_PORT", "GenerationInputEnvelopePort.recordGenerationInputEnvelope is required");
  }
  return port;
}

function buildPortRequest(normalized) {
  return {
    portName: "StudentAppAITutorQuestionBankDraftGenerationInputEnvelopePort",
    operation: "recordGenerationInputEnvelope",
    targetUseCase: "PrepareQuestionBankDraftGenerationInputEnvelope.Execute",
    targetCommandLog: "student-command-log/question-bank-draft-generation-input-envelope",
    principal: normalized.principal,
    worker: normalized.worker,
    sourceGenerationPlan: {
      planId: normalized.generationPlan.generationPlan.planId,
      questionBankDraftRef: normalized.generationPlan.generationPlan.questionBankDraftRef,
      archiveItemId: normalized.generationPlan.studentScope.archiveItemId,
      studentId: normalized.generationPlan.studentScope.studentId,
      executionState: normalized.generationPlan.generationPlan.executionState,
    },
    sourceWorkerClaim: {
      claimId: normalized.workerClaim.claim.claimId,
      workerId: normalized.workerClaim.claim.workerId,
      executionState: normalized.workerClaim.claim.executionState,
      claimExpiresAt: normalized.workerClaim.claim.claimExpiresAt,
    },
    promptEnvelopeDraft: buildPromptEnvelope(normalized),
    idempotencyKey: normalized.idempotencyKey,
    evidenceRefs: uniq([
      ...normalized.evidenceRefs,
      `evidence:question-bank-generation-input-envelope-input-hash:${normalized.inputHash}`,
      `evidence:source-runtime:${planRuntimeId}`,
      `evidence:source-runtime:${claimRuntimeId}`,
    ]),
    safety: {
      modelInputEnvelopeOnly: true,
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
  requireConst(portResult.source.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_PORT, "portResult.source.commandPort");
  requireConst(portResult.source.targetUseCase, "PrepareQuestionBankDraftGenerationInputEnvelope.Execute", "portResult.source.targetUseCase");
  requireConst(portResult.source.targetCommandLog, "student-command-log/question-bank-draft-generation-input-envelope", "portResult.source.targetCommandLog");
  requireConst(portResult.source.modelExecutionDeferred, true, "portResult.source.modelExecutionDeferred");
  assertPlainObject(portResult.inputEnvelope, "portResult.inputEnvelope");
  requireConst(portResult.inputEnvelope.planId, normalized.generationPlan.generationPlan.planId, "portResult.inputEnvelope.planId");
  requireConst(portResult.inputEnvelope.claimId, normalized.workerClaim.claim.claimId, "portResult.inputEnvelope.claimId");
  requireConst(portResult.inputEnvelope.workerId, normalized.worker.workerId, "portResult.inputEnvelope.workerId");
  requireConst(portResult.inputEnvelope.status, "READY_FOR_REVIEWED_GENERATION", "portResult.inputEnvelope.status");
  requireConst(portResult.inputEnvelope.executionState, "INPUT_ENVELOPE_RECORDED_NOT_GENERATED", "portResult.inputEnvelope.executionState");
  requireConst(portResult.inputEnvelope.promptBlueprintCount, normalized.generationPlan.generationPlan.items.length, "portResult.inputEnvelope.promptBlueprintCount");
  requireConst(portResult.inputEnvelope.modelInferenceStarted, false, "portResult.inputEnvelope.modelInferenceStarted");
  requireConst(portResult.inputEnvelope.questionContentGenerated, false, "portResult.inputEnvelope.questionContentGenerated");
  return {
    ...buildPromptEnvelope(normalized),
    envelopeId: requireToken(portResult.inputEnvelope.envelopeId, "portResult.inputEnvelope.envelopeId", "qbank_generation_input_envelope_"),
    status: "READY_FOR_REVIEWED_GENERATION",
    executionState: "INPUT_ENVELOPE_RECORDED_NOT_GENERATED",
  };
}

function buildPromptEnvelope(normalized) {
  const plan = normalized.generationPlan.generationPlan;
  const claim = normalized.workerClaim.claim;
  return {
    envelopeId: `qbank_generation_input_envelope_${safeToken(claim.claimId)}`,
    planId: plan.planId,
    claimId: claim.claimId,
    questionBankDraftRef: plan.questionBankDraftRef,
    sourceRequestId: claim.sourceRequestId,
    archiveItemId: claim.archiveItemId,
    studentId: claim.studentId,
    workerId: normalized.worker.workerId,
    learningObjectives: plan.learningObjectives,
    itemBlueprints: plan.items.map((item) => ({
      itemId: item.itemId,
      knowledgePoint: item.knowledgePoint,
      learningGap: item.learningGap,
      difficulty: item.difficulty,
      questionType: item.questionType,
      promptBlueprint: item.promptBlueprint,
      sourceEvidenceRef: item.sourceEvidenceRef,
      maxHints: item.maxHints,
    })),
    promptBudget: {
      plannedQuestionCount: plan.budget.plannedQuestionCount,
      maxPromptTokens: plan.budget.maxPromptTokens,
      maxGenerationAttempts: plan.budget.maxGenerationAttempts,
    },
    safetyConstraints: {
      answerKeyExcluded: true,
      expectedAnswerExcluded: true,
      rawModelOutputExcluded: true,
      studentOwnScopeConfirmed: true,
      sourceEvidenceRequired: true,
      humanReviewRequiredBeforeStudentVisibility: true,
    },
  };
}

function buildEnvelopeRecord(normalized, inputEnvelope, recordedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE",
    recordId: `student_app_ai_tutor_question_bank_draft_generation_input_envelope_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_PORT,
    status: recordedStatus,
    envelopeInvocationId: normalized.envelopeInvocationId,
    sourceGenerationPlan: {
      runtimeId: planRuntimeId,
      planId: normalized.generationPlan.generationPlan.planId,
      executionState: normalized.generationPlan.generationPlan.executionState,
    },
    sourceWorkerClaim: {
      runtimeId: claimRuntimeId,
      claimId: normalized.workerClaim.claim.claimId,
      executionState: normalized.workerClaim.claim.executionState,
    },
    principal: normalized.principal,
    worker: normalized.worker,
    inputEnvelope,
    boundary: {
      internalServiceOnly: true,
      sourceGenerationPlanVerified: true,
      sourceWorkerClaimVerified: true,
      modelInputEnvelopeOnly: true,
      promptBlueprintsPrepared: true,
      answerKeyExcluded: true,
      generationPlanClaimed: true,
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
      requiresFutureReviewedModelGeneration: true,
      requiresFutureContentStorageCommit: true,
    },
    evidenceRefs: uniq([
      ...normalized.evidenceRefs,
      `evidence:question-bank-generation-input-envelope-input-hash:${normalized.inputHash}`,
      `evidence:runtime:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RUNTIME_ID}`,
      `evidence:command-port:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_PORT}`,
      `evidence:source-runtime:${planRuntimeId}`,
      `evidence:source-runtime:${claimRuntimeId}`,
    ]),
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: 7,
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_PROBE",
    },
  };
}

function buildResult(record, { idempotentReplay }) {
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_PORT,
    status: record.status,
    recordId: record.recordId,
    recordedAt: record.recordedAt,
    sourceGenerationPlan: record.sourceGenerationPlan,
    sourceWorkerClaim: record.sourceWorkerClaim,
    worker: record.worker,
    inputEnvelope: record.inputEnvelope,
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
  requireConst(record.sourceGenerationPlan?.planId, normalized.generationPlan.generationPlan.planId, "record.sourceGenerationPlan.planId");
  requireConst(record.sourceWorkerClaim?.claimId, normalized.workerClaim.claim.claimId, "record.sourceWorkerClaim.claimId");
  requireConst(record.inputEnvelope?.workerId, normalized.worker.workerId, "record.inputEnvelope.workerId");
}

function appendRecord(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`);
}

function rejectLeakedFields(value, label) {
  if (!value || typeof value !== "object") return;
  for (const field of leakedFieldNames) {
    if (Object.prototype.hasOwnProperty.call(value, field) && hasText(value[field])) {
      throw envelopeError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_LEAKED_FIELD", `${label}.${field} is not allowed`);
    }
  }
  for (const [key, child] of Object.entries(value)) {
    if (child && typeof child === "object") rejectLeakedFields(child, `${label}.${key}`);
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw envelopeError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_INVALID_INPUT", `${label} must be an object`);
  }
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw envelopeError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_INVALID_INPUT", `${label} must be ${expected}`);
  }
  return expected;
}

function requireToken(value, label, prefix) {
  const text = requireBoundedString(value, label, prefix.length + 1, 1000);
  if (!text.startsWith(prefix)) {
    throw envelopeError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_INVALID_TOKEN", `${label} must start with ${prefix}`);
  }
  return text;
}

function requireQuestionBankDraftRef(value, label) {
  const text = requireBoundedString(value, label, 1, 1000);
  if (!text.startsWith("local://question-bank-drafts/")) {
    throw envelopeError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_INVALID_DRAFT_REF", `${label} must use local://question-bank-drafts/`);
  }
  return text;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string" || value.length < min || value.length > max) {
    throw envelopeError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_INVALID_INPUT", `${label} must be a string between ${min} and ${max} chars`);
  }
  return value;
}

function uniqueStringArray(value, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max || !value.every((item) => typeof item === "string" && item.length > 0)) {
    throw envelopeError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_INVALID_INPUT", `${label} must contain ${min}-${max} strings`);
  }
  return uniq(value);
}

function uniqueBoundedStringArray(value, label, min, max, minLength, maxLength) {
  const strings = uniqueStringArray(value, label, min, max);
  for (const item of strings) requireBoundedString(item, label, minLength, maxLength);
  return strings;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw envelopeError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_INVALID_INTEGER", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireOneOf(value, label, allowed) {
  if (!allowed.includes(value)) {
    throw envelopeError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_INVALID_ENUM", `${label} must be one of ${allowed.join(",")}`);
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

function envelopeError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}
