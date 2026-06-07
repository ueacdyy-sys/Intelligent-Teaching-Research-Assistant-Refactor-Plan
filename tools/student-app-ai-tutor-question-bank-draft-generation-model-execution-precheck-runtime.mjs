import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_generation_model_execution_precheck_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_PORT =
  "StudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheckPort.recordModelExecutionPrecheck";

const inputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-model-execution-precheck.v1";
const outputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-model-execution-prechecked.v1";
const envelopeSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-input-envelope-recorded.v1";
const envelopeRuntimeId = "student_app_ai_tutor_question_bank_draft_generation_input_envelope_runtime";
const envelopePort = "StudentAppAITutorQuestionBankDraftGenerationInputEnvelopePort.recordGenerationInputEnvelope";
const recordedStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECKED";
const defaultPrecheckLogPath = "reports/student-command-log/student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck.jsonl";

const leakedFieldNames = [
  "answerText",
  "answerKey",
  "correctAnswer",
  "expectedAnswer",
  "explanation",
  "scoreSummary",
  "rawModelOutput",
  "modelOutput",
  "modelResponse",
  "generatedQuestion",
  "generatedQuestions",
  "questionContent",
  "contentRows",
  "directSql",
  "dbUrl",
  "internalError",
  "errorMessage",
];

export async function recordStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck(input, options = {}) {
  const precheckedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const precheckLogPath = options.precheckLogPath ?? defaultPrecheckLogPath;
  const existing = findExistingRecordByIdempotencyKey(precheckLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const modelPrecheckPort = assertModelPrecheckPort(options.modelExecutionPrecheckPort);
  const portResult = await modelPrecheckPort.recordModelExecutionPrecheck(buildPortRequest(normalized));
  const recordedPrecheck = assertPortResult(portResult, normalized);
  const record = buildPrecheckRecord(normalized, recordedPrecheck, precheckedAt);
  appendRecord(precheckLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck(result) {
  return [
    `Student App AI Tutor question-bank generation model execution precheck: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Precheck: ${result.modelExecutionPrecheck.precheckId}`,
    `Route: ${result.modelExecutionPrecheck.modelRoute}`,
    `Model started: ${result.boundary.modelInferenceStarted}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const precheckInvocationId = requireToken(input.precheckInvocationId, "input.precheckInvocationId", "qbank_generation_model_precheck_");
  const inputEnvelopeReport = assertInputEnvelopeReport(input.inputEnvelopeReport);
  const inputEnvelopeResult = assertInputEnvelopeResult(inputEnvelopeReport);
  const principal = assertPrincipal(input.principal);
  const approval = assertApproval(input.approval, inputEnvelopeResult);
  const modelExecutionPolicy = assertModelExecutionPolicy(input.modelExecutionPolicy, inputEnvelopeResult);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 320);
  if (!evidenceRefs.some((ref) => ref.includes("generation-input-envelope"))) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_MISSING_ENVELOPE_EVIDENCE", "generation input envelope evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("model-execution-approval"))) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_MISSING_APPROVAL_EVIDENCE", "model execution approval evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 340);
  const inputHash = hashInput({
    precheckInvocationId,
    envelopeId: inputEnvelopeResult.inputEnvelope.envelopeId,
    planId: inputEnvelopeResult.inputEnvelope.planId,
    claimId: inputEnvelopeResult.inputEnvelope.claimId,
    approvalId: approval.approvalId,
    modelExecutionPolicy,
  });
  return {
    precheckInvocationId,
    inputEnvelopeReport,
    inputEnvelopeResult,
    principal,
    approval,
    modelExecutionPolicy,
    evidenceRefs,
    idempotencyKey,
    inputHash,
  };
}

function assertInputEnvelopeReport(report) {
  rejectLeakedFields(report, "input.inputEnvelopeReport");
  assertPlainObject(report, "input.inputEnvelopeReport");
  requireConst(report.readiness, "READY", "input.inputEnvelopeReport.readiness");
  requireConst(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE", "input.inputEnvelopeReport.workloadType");
  requireConst(report.runtime?.runtimeId, envelopeRuntimeId, "input.inputEnvelopeReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, envelopePort, "input.inputEnvelopeReport.runtime.commandPort");
  requireConst(report.runtime?.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RECORDED", "input.inputEnvelopeReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.inputEnvelopeReport.runtimeSlo.totalErrors");
  const boundary = report.safetyInvariants ?? {};
  for (const field of ["modelInputEnvelopeOnly", "promptBlueprintsPrepared", "answerKeyExcluded", "generationPlanClaimed"]) {
    requireConst(boundary[field], true, `input.inputEnvelopeReport.safetyInvariants.${field}`);
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
    requireConst(boundary[field], false, `input.inputEnvelopeReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertInputEnvelopeResult(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationInputEnvelope?.result;
  rejectLeakedFields(result, "source.inputEnvelopeResult");
  assertPlainObject(result, "source.inputEnvelopeResult");
  requireConst(result.schemaVersion, envelopeSchemaVersion, "source.envelope.schemaVersion");
  requireConst(result.runtimeId, envelopeRuntimeId, "source.envelope.runtimeId");
  requireConst(result.commandPort, envelopePort, "source.envelope.commandPort");
  requireConst(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RECORDED", "source.envelope.status");
  requireConst(result.boundary?.modelInputEnvelopeOnly, true, "source.envelope.boundary.modelInputEnvelopeOnly");
  requireConst(result.boundary?.promptBlueprintsPrepared, true, "source.envelope.boundary.promptBlueprintsPrepared");
  requireConst(result.boundary?.answerKeyExcluded, true, "source.envelope.boundary.answerKeyExcluded");
  requireConst(result.boundary?.modelInferenceStarted, false, "source.envelope.boundary.modelInferenceStarted");
  requireConst(result.boundary?.questionContentGenerated, false, "source.envelope.boundary.questionContentGenerated");
  requireConst(result.boundary?.questionBankContentWriteStarted, false, "source.envelope.boundary.questionBankContentWriteStarted");
  assertPlainObject(result.inputEnvelope, "source.envelope.inputEnvelope");
  requireConst(result.inputEnvelope.status, "READY_FOR_REVIEWED_GENERATION", "source.envelope.inputEnvelope.status");
  requireConst(result.inputEnvelope.executionState, "INPUT_ENVELOPE_RECORDED_NOT_GENERATED", "source.envelope.inputEnvelope.executionState");
  const itemBlueprints = assertItemBlueprints(result.inputEnvelope.itemBlueprints);
  const safetyConstraints = assertPlainObject(result.inputEnvelope.safetyConstraints, "source.envelope.inputEnvelope.safetyConstraints");
  for (const field of [
    "answerKeyExcluded",
    "expectedAnswerExcluded",
    "rawModelOutputExcluded",
    "studentOwnScopeConfirmed",
    "sourceEvidenceRequired",
    "humanReviewRequiredBeforeStudentVisibility",
  ]) {
    requireConst(safetyConstraints[field], true, `source.envelope.inputEnvelope.safetyConstraints.${field}`);
  }
  return {
    ...result,
    inputEnvelope: {
      envelopeId: requireToken(result.inputEnvelope.envelopeId, "source.envelope.inputEnvelope.envelopeId", "qbank_generation_input_envelope_"),
      planId: requireToken(result.inputEnvelope.planId, "source.envelope.inputEnvelope.planId", "qbank_generation_plan_"),
      claimId: requireToken(result.inputEnvelope.claimId, "source.envelope.inputEnvelope.claimId", "qbank_generation_claim_"),
      questionBankDraftRef: requireQuestionBankDraftRef(result.inputEnvelope.questionBankDraftRef, "source.envelope.inputEnvelope.questionBankDraftRef"),
      sourceRequestId: requireToken(result.inputEnvelope.sourceRequestId, "source.envelope.inputEnvelope.sourceRequestId", "tutor_req_"),
      archiveItemId: requireToken(result.inputEnvelope.archiveItemId, "source.envelope.inputEnvelope.archiveItemId", "tarch_"),
      studentId: requireBoundedString(result.inputEnvelope.studentId, "source.envelope.inputEnvelope.studentId", 1, 128),
      workerId: requireToken(result.inputEnvelope.workerId, "source.envelope.inputEnvelope.workerId", "qbank_generation_worker_"),
      learningObjectives: uniqueBoundedStringArray(result.inputEnvelope.learningObjectives, "source.envelope.inputEnvelope.learningObjectives", 1, 8, 3, 180),
      itemBlueprints,
      promptBudget: assertPromptBudget(result.inputEnvelope.promptBudget, itemBlueprints.length),
      safetyConstraints,
      status: "READY_FOR_REVIEWED_GENERATION",
      executionState: "INPUT_ENVELOPE_RECORDED_NOT_GENERATED",
    },
  };
}

function assertItemBlueprints(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 12) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_INVALID_ITEMS", "source.envelope.inputEnvelope.itemBlueprints must contain 1-12 items");
  }
  const seen = new Set();
  return items.map((item, index) => {
    rejectLeakedFields(item, `source.envelope.inputEnvelope.itemBlueprints[${index}]`);
    assertPlainObject(item, `source.envelope.inputEnvelope.itemBlueprints[${index}]`);
    const itemId = requireToken(item.itemId, `source.envelope.inputEnvelope.itemBlueprints[${index}].itemId`, "qbank_plan_item_");
    if (seen.has(itemId)) throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_DUPLICATE_ITEM", `${itemId} is duplicated`);
    seen.add(itemId);
    return {
      itemId,
      knowledgePoint: requireBoundedString(item.knowledgePoint, `source.envelope.inputEnvelope.itemBlueprints[${index}].knowledgePoint`, 3, 160),
      learningGap: requireBoundedString(item.learningGap, `source.envelope.inputEnvelope.itemBlueprints[${index}].learningGap`, 3, 240),
      difficulty: requireOneOf(item.difficulty, `source.envelope.inputEnvelope.itemBlueprints[${index}].difficulty`, ["FOUNDATION", "STANDARD", "CHALLENGE"]),
      questionType: requireOneOf(item.questionType, `source.envelope.inputEnvelope.itemBlueprints[${index}].questionType`, ["SHORT_ANSWER", "MULTIPLE_CHOICE", "FILL_IN_BLANK", "CALCULATION"]),
      promptBlueprint: requireBoundedString(item.promptBlueprint, `source.envelope.inputEnvelope.itemBlueprints[${index}].promptBlueprint`, 12, 320),
      sourceEvidenceRef: requireBoundedString(item.sourceEvidenceRef, `source.envelope.inputEnvelope.itemBlueprints[${index}].sourceEvidenceRef`, 8, 260),
      maxHints: requireIntegerBetween(item.maxHints, `source.envelope.inputEnvelope.itemBlueprints[${index}].maxHints`, 0, 3),
    };
  });
}

function assertPromptBudget(budget, itemCount) {
  assertPlainObject(budget, "source.envelope.inputEnvelope.promptBudget");
  return {
    plannedQuestionCount: requireConst(budget.plannedQuestionCount, itemCount, "source.envelope.inputEnvelope.promptBudget.plannedQuestionCount"),
    maxPromptTokens: requireIntegerBetween(budget.maxPromptTokens, "source.envelope.inputEnvelope.promptBudget.maxPromptTokens", 200, 4000),
    maxGenerationAttempts: requireIntegerBetween(budget.maxGenerationAttempts, "source.envelope.inputEnvelope.promptBudget.maxGenerationAttempts", 1, 2),
  };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 4, 16);
  for (const scope of ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT", "MODEL_EXECUTION_PRECHECK_APPROVE"]) {
    if (!scopes.includes(scope)) throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_SCOPE_MISSING", `input.principal.scopes must include ${scope}`);
  }
  return {
    principalId: requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128),
    subjectType: requireConst(principal.subjectType, "SERVICE", "input.principal.subjectType"),
    role: requireConst(principal.role, "SERVICE", "input.principal.role"),
    entryPoint: requireConst(principal.entryPoint, "AGENT_INTERNAL", "input.principal.entryPoint"),
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 160),
    scopes,
  };
}

function assertApproval(approval, inputEnvelopeResult) {
  rejectLeakedFields(approval, "input.approval");
  assertPlainObject(approval, "input.approval");
  const permissions = uniqueStringArray(approval.permissions, "input.approval.permissions", 2, 12);
  for (const permission of ["QUESTION_BANK_GENERATION_REVIEW", "MODEL_EXECUTION_PRECHECK_APPROVE"]) {
    if (!permissions.includes(permission)) throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_APPROVAL_PERMISSION_MISSING", `input.approval.permissions must include ${permission}`);
  }
  return {
    approvalId: requireToken(approval.approvalId, "input.approval.approvalId", "qbank_generation_model_approval_"),
    reviewerId: requireBoundedString(approval.reviewerId, "input.approval.reviewerId", 1, 128),
    reviewerRole: requireOneOf(approval.reviewerRole, "input.approval.reviewerRole", ["TEACHER", "ADMIN"]),
    permissions,
    reviewedEnvelopeId: requireConst(approval.reviewedEnvelopeId, inputEnvelopeResult.inputEnvelope.envelopeId, "input.approval.reviewedEnvelopeId"),
    reviewedPlanId: requireConst(approval.reviewedPlanId, inputEnvelopeResult.inputEnvelope.planId, "input.approval.reviewedPlanId"),
    reviewedClaimId: requireConst(approval.reviewedClaimId, inputEnvelopeResult.inputEnvelope.claimId, "input.approval.reviewedClaimId"),
    approvedForModelQueueOnly: requireConst(approval.approvedForModelQueueOnly, true, "input.approval.approvedForModelQueueOnly"),
    promptBlueprintsReviewed: requireConst(approval.promptBlueprintsReviewed, true, "input.approval.promptBlueprintsReviewed"),
    studentOwnScopeConfirmed: requireConst(approval.studentOwnScopeConfirmed, true, "input.approval.studentOwnScopeConfirmed"),
    answerKeyExcludedConfirmed: requireConst(approval.answerKeyExcludedConfirmed, true, "input.approval.answerKeyExcludedConfirmed"),
    budgetReviewed: requireConst(approval.budgetReviewed, true, "input.approval.budgetReviewed"),
    humanReviewRequiredBeforeStudentVisibility: requireConst(approval.humanReviewRequiredBeforeStudentVisibility, true, "input.approval.humanReviewRequiredBeforeStudentVisibility"),
  };
}

function assertModelExecutionPolicy(policy, inputEnvelopeResult) {
  rejectLeakedFields(policy, "input.modelExecutionPolicy");
  assertPlainObject(policy, "input.modelExecutionPolicy");
  const promptBudget = inputEnvelopeResult.inputEnvelope.promptBudget;
  return {
    modelRoute: requireConst(policy.modelRoute, "StudentTutorAgent.generate_question_bank_draft", "input.modelExecutionPolicy.modelRoute"),
    approvedProviderClass: requireOneOf(policy.approvedProviderClass, "input.modelExecutionPolicy.approvedProviderClass", ["CONTROLLED_AI_WORKER", "LOCAL_SANDBOXED_AI_WORKER"]),
    queueRef: requireToken(policy.queueRef, "input.modelExecutionPolicy.queueRef", "qbank_generation_model_queue_"),
    maxPromptTokens: requireIntegerBetween(policy.maxPromptTokens, "input.modelExecutionPolicy.maxPromptTokens", 200, promptBudget.maxPromptTokens),
    maxOutputTokens: requireIntegerBetween(policy.maxOutputTokens, "input.modelExecutionPolicy.maxOutputTokens", 128, 2400),
    maxGenerationAttempts: requireConst(policy.maxGenerationAttempts, promptBudget.maxGenerationAttempts, "input.modelExecutionPolicy.maxGenerationAttempts"),
    timeoutMs: requireIntegerBetween(policy.timeoutMs, "input.modelExecutionPolicy.timeoutMs", 1000, 120000),
    storeRawModelOutputAllowed: requireConst(policy.storeRawModelOutputAllowed, false, "input.modelExecutionPolicy.storeRawModelOutputAllowed"),
    executeModelNowAllowed: requireConst(policy.executeModelNowAllowed, false, "input.modelExecutionPolicy.executeModelNowAllowed"),
    generateQuestionsNowAllowed: requireConst(policy.generateQuestionsNowAllowed, false, "input.modelExecutionPolicy.generateQuestionsNowAllowed"),
    writeQuestionBankContentNowAllowed: requireConst(policy.writeQuestionBankContentNowAllowed, false, "input.modelExecutionPolicy.writeQuestionBankContentNowAllowed"),
    studentVisiblePublishAllowed: requireConst(policy.studentVisiblePublishAllowed, false, "input.modelExecutionPolicy.studentVisiblePublishAllowed"),
    directDatabaseAccessAllowed: requireConst(policy.directDatabaseAccessAllowed, false, "input.modelExecutionPolicy.directDatabaseAccessAllowed"),
    executeHttpRequestAllowed: requireConst(policy.executeHttpRequestAllowed, false, "input.modelExecutionPolicy.executeHttpRequestAllowed"),
    swarmAllowed: requireConst(policy.swarmAllowed, false, "input.modelExecutionPolicy.swarmAllowed"),
    requiresReviewedGenerationRuntime: requireConst(policy.requiresReviewedGenerationRuntime, true, "input.modelExecutionPolicy.requiresReviewedGenerationRuntime"),
    requiresContentStorageCommit: requireConst(policy.requiresContentStorageCommit, true, "input.modelExecutionPolicy.requiresContentStorageCommit"),
  };
}

function assertModelPrecheckPort(port) {
  if (!port || typeof port.recordModelExecutionPrecheck !== "function") {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_PORT_REQUIRED", "ModelExecutionPrecheckPort.recordModelExecutionPrecheck is required");
  }
  return port;
}

function buildPortRequest(normalized) {
  const envelope = normalized.inputEnvelopeResult.inputEnvelope;
  return {
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_PORT,
    precheckInvocationId: normalized.precheckInvocationId,
    inputEnvelope: {
      envelopeId: envelope.envelopeId,
      planId: envelope.planId,
      claimId: envelope.claimId,
      questionBankDraftRef: envelope.questionBankDraftRef,
      sourceRequestId: envelope.sourceRequestId,
      archiveItemId: envelope.archiveItemId,
      studentId: envelope.studentId,
      workerId: envelope.workerId,
      itemBlueprintCount: envelope.itemBlueprints.length,
      promptBudget: envelope.promptBudget,
    },
    approval: normalized.approval,
    modelExecutionPolicy: normalized.modelExecutionPolicy,
    evidenceRefs: normalized.evidenceRefs,
    inputHash: normalized.inputHash,
  };
}

function assertPortResult(portResult, normalized) {
  rejectLeakedFields(portResult, "portResult");
  assertPlainObject(portResult, "portResult");
  const precheck = assertPlainObject(portResult.modelExecutionPrecheck, "portResult.modelExecutionPrecheck");
  const envelope = normalized.inputEnvelopeResult.inputEnvelope;
  return {
    precheckId: requireToken(precheck.precheckId, "portResult.modelExecutionPrecheck.precheckId", "qbank_generation_model_precheck_"),
    envelopeId: requireConst(precheck.envelopeId, envelope.envelopeId, "portResult.modelExecutionPrecheck.envelopeId"),
    planId: requireConst(precheck.planId, envelope.planId, "portResult.modelExecutionPrecheck.planId"),
    claimId: requireConst(precheck.claimId, envelope.claimId, "portResult.modelExecutionPrecheck.claimId"),
    approvalId: requireConst(precheck.approvalId, normalized.approval.approvalId, "portResult.modelExecutionPrecheck.approvalId"),
    questionBankDraftRef: requireConst(precheck.questionBankDraftRef, envelope.questionBankDraftRef, "portResult.modelExecutionPrecheck.questionBankDraftRef"),
    studentId: requireConst(precheck.studentId, envelope.studentId, "portResult.modelExecutionPrecheck.studentId"),
    workerId: requireConst(precheck.workerId, envelope.workerId, "portResult.modelExecutionPrecheck.workerId"),
    modelRoute: requireConst(precheck.modelRoute, normalized.modelExecutionPolicy.modelRoute, "portResult.modelExecutionPrecheck.modelRoute"),
    queueRef: requireConst(precheck.queueRef, normalized.modelExecutionPolicy.queueRef, "portResult.modelExecutionPrecheck.queueRef"),
    promptBlueprintCount: requireConst(precheck.promptBlueprintCount, envelope.itemBlueprints.length, "portResult.modelExecutionPrecheck.promptBlueprintCount"),
    status: requireConst(precheck.status, "PRECHECKED_FOR_REVIEWED_MODEL_QUEUE", "portResult.modelExecutionPrecheck.status"),
    executionState: requireConst(precheck.executionState, "MODEL_EXECUTION_PRECHECKED_NOT_STARTED", "portResult.modelExecutionPrecheck.executionState"),
    modelInferenceStarted: requireConst(precheck.modelInferenceStarted, false, "portResult.modelExecutionPrecheck.modelInferenceStarted"),
    questionContentGenerated: requireConst(precheck.questionContentGenerated, false, "portResult.modelExecutionPrecheck.questionContentGenerated"),
    questionBankContentWriteStarted: requireConst(precheck.questionBankContentWriteStarted, false, "portResult.modelExecutionPrecheck.questionBankContentWriteStarted"),
  };
}

function buildPrecheckRecord(normalized, recordedPrecheck, precheckedAt) {
  const envelope = normalized.inputEnvelopeResult.inputEnvelope;
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_PORT,
    status: recordedStatus,
    recordId: `student_app_ai_tutor_question_bank_draft_generation_model_execution_precheck_${normalized.idempotencyKey.replace(/[^a-zA-Z0-9_-]/gu, "_")}`,
    precheckedAt,
    sourceInputEnvelope: {
      runtimeId: envelopeRuntimeId,
      envelopeId: envelope.envelopeId,
      executionState: envelope.executionState,
    },
    approval: {
      approvalId: normalized.approval.approvalId,
      reviewerRole: normalized.approval.reviewerRole,
      approvedForModelQueueOnly: normalized.approval.approvedForModelQueueOnly,
      humanReviewRequiredBeforeStudentVisibility: normalized.approval.humanReviewRequiredBeforeStudentVisibility,
    },
    modelExecutionPrecheck: recordedPrecheck,
    modelExecutionPolicy: normalized.modelExecutionPolicy,
    boundary: {
      internalServiceOnly: true,
      sourceInputEnvelopeVerified: true,
      approvalVerified: true,
      modelExecutionQueueAdmissionOnly: true,
      futureModelExecutionApproved: true,
      promptBlueprintsReviewed: true,
      answerKeyExcluded: true,
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
    evidenceRefs: [
      ...normalized.evidenceRefs,
      `evidence:question-bank-generation-model-execution-precheck-input-hash:${normalized.inputHash}`,
      `evidence:runtime:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_RUNTIME_ID}`,
      `evidence:command-port:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_PORT}`,
      `evidence:source-runtime:${envelopeRuntimeId}`,
    ],
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
  };
}

function buildResult(record, replay) {
  return {
    ...record,
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: 7,
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_PROBE",
    },
    idempotentReplay: replay.idempotentReplay,
  };
}

function findExistingRecordByIdempotencyKey(logPath, idempotencyKey) {
  if (!fs.existsSync(logPath)) return null;
  const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/u).filter(Boolean);
  for (const line of lines) {
    const parsed = JSON.parse(line);
    if (parsed.idempotencyKey === idempotencyKey) return parsed;
  }
  return null;
}

function assertReplayMatches(record, normalized) {
  requireConst(record.inputHash, normalized.inputHash, "record.inputHash");
  requireConst(record.status, recordedStatus, "record.status");
  requireConst(record.modelExecutionPrecheck.envelopeId, normalized.inputEnvelopeResult.inputEnvelope.envelopeId, "record.modelExecutionPrecheck.envelopeId");
}

function appendRecord(logPath, record) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`);
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function rejectLeakedFields(value, context) {
  if (!value || typeof value !== "object") return;
  const stack = [{ value, path: context }];
  while (stack.length) {
    const current = stack.pop();
    if (!current.value || typeof current.value !== "object") continue;
    for (const [key, nested] of Object.entries(current.value)) {
      if (leakedFieldNames.includes(key)) {
        throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_LEAKED_FIELD", `${current.path}.${key} is not allowed`);
      }
      if (nested && typeof nested === "object") stack.push({ value: nested, path: `${current.path}.${key}` });
    }
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_INVALID_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_CONST_MISMATCH", `${label} must be ${expected}`);
  }
  return actual;
}

function requireOneOf(actual, label, allowed) {
  if (!allowed.includes(actual)) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_INVALID_ENUM", `${label} must be one of ${allowed.join(",")}`);
  }
  return actual;
}

function requireBoundedString(value, label, minLength, maxLength) {
  if (typeof value !== "string" || value.length < minLength || value.length > maxLength) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_INVALID_STRING", `${label} must be a string of length ${minLength}-${maxLength}`);
  }
  return value;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 220);
  if (!token.startsWith(prefix)) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_INVALID_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireQuestionBankDraftRef(value, label) {
  const draftRef = requireBoundedString(value, label, 12, 260);
  if (!draftRef.startsWith("local://question-bank-drafts/")) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_INVALID_DRAFT_REF", `${label} must be a local question-bank draft ref`);
  }
  return draftRef;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_INVALID_INTEGER", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function uniqueStringArray(value, label, minLength, maxLength) {
  if (!Array.isArray(value) || value.length < minLength || value.length > maxLength) {
    throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_INVALID_ARRAY", `${label} must contain ${minLength}-${maxLength} strings`);
  }
  const seen = new Set();
  return value.map((item, index) => {
    const normalized = requireBoundedString(item, `${label}[${index}]`, 1, 340);
    if (seen.has(normalized)) throw precheckError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_DUPLICATE_STRING", `${label}[${index}] is duplicated`);
    seen.add(normalized);
    return normalized;
  });
}

function uniqueBoundedStringArray(value, label, minItems, maxItems, minLength, maxLength) {
  const items = uniqueStringArray(value, label, minItems, maxItems);
  return items.map((item, index) => requireBoundedString(item, `${label}[${index}]`, minLength, maxLength));
}

function precheckError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
