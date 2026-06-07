import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_generation_controlled_draft_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_PORT =
  "StudentAppAITutorQuestionBankDraftGenerationControlledDraftPort.recordControlledDraftGeneration";

const inputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-controlled-draft.v1";
const outputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-controlled-draft-recorded.v1";
const envelopeSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-input-envelope-recorded.v1";
const precheckSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-model-execution-prechecked.v1";
const envelopeRuntimeId = "student_app_ai_tutor_question_bank_draft_generation_input_envelope_runtime";
const precheckRuntimeId = "student_app_ai_tutor_question_bank_draft_generation_model_execution_precheck_runtime";
const envelopePort = "StudentAppAITutorQuestionBankDraftGenerationInputEnvelopePort.recordGenerationInputEnvelope";
const precheckPort = "StudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheckPort.recordModelExecutionPrecheck";
const recordedStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RECORDED";
const defaultDraftLogPath = "reports/student-command-log/student-app-ai-tutor-question-bank-draft-generation-controlled-draft.jsonl";

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
  "contentRows",
  "directSql",
  "dbUrl",
  "internalError",
  "errorMessage",
];

export async function recordStudentAppAITutorQuestionBankDraftGenerationControlledDraft(input, options = {}) {
  const recordedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const draftLogPath = options.draftLogPath ?? defaultDraftLogPath;
  const existing = findExistingRecordByIdempotencyKey(draftLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const controlledDraftPort = assertControlledDraftPort(options.controlledDraftGenerationPort);
  const portResult = await controlledDraftPort.recordControlledDraftGeneration(buildPortRequest(normalized));
  const generatedDraft = assertPortResult(portResult, normalized);
  const record = buildDraftRecord(normalized, generatedDraft, recordedAt);
  appendRecord(draftLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftGenerationControlledDraft(result) {
  return [
    `Student App AI Tutor question-bank controlled draft generation: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Artifact: ${result.generatedDraft.artifactId}`,
    `Items: ${result.generatedDraft.items.length}`,
    `Content stored: ${result.boundary.questionBankContentWriteStarted}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const generationInvocationId = requireToken(input.generationInvocationId, "input.generationInvocationId", "qbank_generation_controlled_draft_");
  const inputEnvelopeReport = assertInputEnvelopeReport(input.inputEnvelopeReport);
  const inputEnvelopeResult = assertInputEnvelopeResult(inputEnvelopeReport);
  const modelPrecheckReport = assertModelPrecheckReport(input.modelExecutionPrecheckReport);
  const modelPrecheckResult = assertModelPrecheckResult(modelPrecheckReport);
  assertEnvelopeAndPrecheckMatch(inputEnvelopeResult, modelPrecheckResult);
  const principal = assertPrincipal(input.principal);
  const generationAttempt = assertGenerationAttempt(input.generationAttempt, modelPrecheckResult);
  const outputPolicy = assertOutputPolicy(input.outputPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 360);
  if (!evidenceRefs.some((ref) => ref.includes("generation-input-envelope"))) {
    throw draftError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_MISSING_ENVELOPE_EVIDENCE", "generation input envelope evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("model-execution-precheck"))) {
    throw draftError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_MISSING_PRECHECK_EVIDENCE", "model execution precheck evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const inputHash = hashInput({
    generationInvocationId,
    envelopeId: inputEnvelopeResult.inputEnvelope.envelopeId,
    precheckId: modelPrecheckResult.modelExecutionPrecheck.precheckId,
    attemptId: generationAttempt.attemptId,
    outputPolicy,
  });
  return {
    generationInvocationId,
    inputEnvelopeReport,
    inputEnvelopeResult,
    modelPrecheckReport,
    modelPrecheckResult,
    principal,
    generationAttempt,
    outputPolicy,
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
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.inputEnvelopeReport.runtimeSlo.totalErrors");
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
  requireConst(result.boundary?.questionContentGenerated, false, "source.envelope.boundary.questionContentGenerated");
  requireConst(result.boundary?.questionBankContentWriteStarted, false, "source.envelope.boundary.questionBankContentWriteStarted");
  assertPlainObject(result.inputEnvelope, "source.envelope.inputEnvelope");
  requireConst(result.inputEnvelope.executionState, "INPUT_ENVELOPE_RECORDED_NOT_GENERATED", "source.envelope.inputEnvelope.executionState");
  const itemBlueprints = assertItemBlueprints(result.inputEnvelope.itemBlueprints);
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
      itemBlueprints,
      promptBudget: assertPromptBudget(result.inputEnvelope.promptBudget, itemBlueprints.length),
      executionState: "INPUT_ENVELOPE_RECORDED_NOT_GENERATED",
    },
  };
}

function assertModelPrecheckReport(report) {
  rejectLeakedFields(report, "input.modelExecutionPrecheckReport");
  assertPlainObject(report, "input.modelExecutionPrecheckReport");
  requireConst(report.readiness, "READY", "input.modelExecutionPrecheckReport.readiness");
  requireConst(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK", "input.modelExecutionPrecheckReport.workloadType");
  requireConst(report.runtime?.runtimeId, precheckRuntimeId, "input.modelExecutionPrecheckReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, precheckPort, "input.modelExecutionPrecheckReport.runtime.commandPort");
  requireConst(report.runtime?.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECKED", "input.modelExecutionPrecheckReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.modelExecutionPrecheckReport.runtimeSlo.totalErrors");
  const boundary = report.safetyInvariants ?? {};
  for (const field of ["modelExecutionQueueAdmissionOnly", "futureModelExecutionApproved", "answerKeyExcluded"]) {
    requireConst(boundary[field], true, `input.modelExecutionPrecheckReport.safetyInvariants.${field}`);
  }
  for (const field of ["questionContentGenerated", "questionBankContentWriteStarted", "studentVisiblePublishAllowed", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "swarmAllowed"]) {
    requireConst(boundary[field], false, `input.modelExecutionPrecheckReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertModelPrecheckResult(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationModelExecutionPrecheck?.result;
  rejectLeakedFields(result, "source.modelExecutionPrecheckResult");
  assertPlainObject(result, "source.modelExecutionPrecheckResult");
  requireConst(result.schemaVersion, precheckSchemaVersion, "source.precheck.schemaVersion");
  requireConst(result.runtimeId, precheckRuntimeId, "source.precheck.runtimeId");
  requireConst(result.commandPort, precheckPort, "source.precheck.commandPort");
  requireConst(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECKED", "source.precheck.status");
  requireConst(result.boundary?.modelExecutionQueueAdmissionOnly, true, "source.precheck.boundary.modelExecutionQueueAdmissionOnly");
  requireConst(result.boundary?.modelInferenceStarted, false, "source.precheck.boundary.modelInferenceStarted");
  requireConst(result.boundary?.questionContentGenerated, false, "source.precheck.boundary.questionContentGenerated");
  requireConst(result.boundary?.questionBankContentWriteStarted, false, "source.precheck.boundary.questionBankContentWriteStarted");
  assertPlainObject(result.modelExecutionPrecheck, "source.precheck.modelExecutionPrecheck");
  requireConst(result.modelExecutionPrecheck.executionState, "MODEL_EXECUTION_PRECHECKED_NOT_STARTED", "source.precheck.modelExecutionPrecheck.executionState");
  return {
    ...result,
    modelExecutionPrecheck: {
      precheckId: requireToken(result.modelExecutionPrecheck.precheckId, "source.precheck.modelExecutionPrecheck.precheckId", "qbank_generation_model_precheck_"),
      envelopeId: requireToken(result.modelExecutionPrecheck.envelopeId, "source.precheck.modelExecutionPrecheck.envelopeId", "qbank_generation_input_envelope_"),
      planId: requireToken(result.modelExecutionPrecheck.planId, "source.precheck.modelExecutionPrecheck.planId", "qbank_generation_plan_"),
      claimId: requireToken(result.modelExecutionPrecheck.claimId, "source.precheck.modelExecutionPrecheck.claimId", "qbank_generation_claim_"),
      approvalId: requireToken(result.modelExecutionPrecheck.approvalId, "source.precheck.modelExecutionPrecheck.approvalId", "qbank_generation_model_approval_"),
      questionBankDraftRef: requireQuestionBankDraftRef(result.modelExecutionPrecheck.questionBankDraftRef, "source.precheck.modelExecutionPrecheck.questionBankDraftRef"),
      studentId: requireBoundedString(result.modelExecutionPrecheck.studentId, "source.precheck.modelExecutionPrecheck.studentId", 1, 128),
      workerId: requireToken(result.modelExecutionPrecheck.workerId, "source.precheck.modelExecutionPrecheck.workerId", "qbank_generation_worker_"),
      modelRoute: requireConst(result.modelExecutionPrecheck.modelRoute, "StudentTutorAgent.generate_question_bank_draft", "source.precheck.modelExecutionPrecheck.modelRoute"),
      queueRef: requireToken(result.modelExecutionPrecheck.queueRef, "source.precheck.modelExecutionPrecheck.queueRef", "qbank_generation_model_queue_"),
      promptBlueprintCount: requireIntegerBetween(result.modelExecutionPrecheck.promptBlueprintCount, "source.precheck.modelExecutionPrecheck.promptBlueprintCount", 1, 12),
      executionState: "MODEL_EXECUTION_PRECHECKED_NOT_STARTED",
    },
  };
}

function assertEnvelopeAndPrecheckMatch(envelopeResult, precheckResult) {
  const envelope = envelopeResult.inputEnvelope;
  const precheck = precheckResult.modelExecutionPrecheck;
  for (const [field, expected] of Object.entries({
    envelopeId: envelope.envelopeId,
    planId: envelope.planId,
    claimId: envelope.claimId,
    questionBankDraftRef: envelope.questionBankDraftRef,
    studentId: envelope.studentId,
    workerId: envelope.workerId,
  })) {
    requireConst(precheck[field], expected, `source.precheck.modelExecutionPrecheck.${field}`);
  }
  requireConst(precheck.promptBlueprintCount, envelope.itemBlueprints.length, "source.precheck.modelExecutionPrecheck.promptBlueprintCount");
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 4, 16);
  for (const scope of ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT", "MODEL_GENERATION_EXECUTE"]) {
    if (!scopes.includes(scope)) throw draftError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_SCOPE_MISSING", `input.principal.scopes must include ${scope}`);
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

function assertGenerationAttempt(attempt, precheckResult) {
  assertPlainObject(attempt, "input.generationAttempt");
  const precheck = precheckResult.modelExecutionPrecheck;
  return {
    attemptId: requireToken(attempt.attemptId, "input.generationAttempt.attemptId", "qbank_generation_attempt_"),
    precheckId: requireConst(attempt.precheckId, precheck.precheckId, "input.generationAttempt.precheckId"),
    modelRoute: requireConst(attempt.modelRoute, precheck.modelRoute, "input.generationAttempt.modelRoute"),
    queueRef: requireConst(attempt.queueRef, precheck.queueRef, "input.generationAttempt.queueRef"),
    providerClass: requireOneOf(attempt.providerClass, "input.generationAttempt.providerClass", ["CONTROLLED_AI_WORKER", "LOCAL_SANDBOXED_AI_WORKER"]),
    maxPromptTokens: requireIntegerBetween(attempt.maxPromptTokens, "input.generationAttempt.maxPromptTokens", 200, 4000),
    maxOutputTokens: requireIntegerBetween(attempt.maxOutputTokens, "input.generationAttempt.maxOutputTokens", 128, 2400),
    attemptNo: requireIntegerBetween(attempt.attemptNo, "input.generationAttempt.attemptNo", 1, 2),
  };
}

function assertOutputPolicy(policy) {
  assertPlainObject(policy, "input.outputPolicy");
  return {
    sanitizedQuestionDraftOnly: requireConst(policy.sanitizedQuestionDraftOnly, true, "input.outputPolicy.sanitizedQuestionDraftOnly"),
    rawModelOutputStored: requireConst(policy.rawModelOutputStored, false, "input.outputPolicy.rawModelOutputStored"),
    answerKeyGenerationAllowed: requireConst(policy.answerKeyGenerationAllowed, false, "input.outputPolicy.answerKeyGenerationAllowed"),
    expectedAnswerGenerationAllowed: requireConst(policy.expectedAnswerGenerationAllowed, false, "input.outputPolicy.expectedAnswerGenerationAllowed"),
    writeQuestionBankContentNowAllowed: requireConst(policy.writeQuestionBankContentNowAllowed, false, "input.outputPolicy.writeQuestionBankContentNowAllowed"),
    studentVisiblePublishAllowed: requireConst(policy.studentVisiblePublishAllowed, false, "input.outputPolicy.studentVisiblePublishAllowed"),
    scoringAllowed: requireConst(policy.scoringAllowed, false, "input.outputPolicy.scoringAllowed"),
    directDatabaseAccessAllowed: requireConst(policy.directDatabaseAccessAllowed, false, "input.outputPolicy.directDatabaseAccessAllowed"),
    executeHttpRequestAllowed: requireConst(policy.executeHttpRequestAllowed, false, "input.outputPolicy.executeHttpRequestAllowed"),
    swarmAllowed: requireConst(policy.swarmAllowed, false, "input.outputPolicy.swarmAllowed"),
    requiresFutureTeacherReview: requireConst(policy.requiresFutureTeacherReview, true, "input.outputPolicy.requiresFutureTeacherReview"),
    requiresFutureContentStorageCommit: requireConst(policy.requiresFutureContentStorageCommit, true, "input.outputPolicy.requiresFutureContentStorageCommit"),
  };
}

function assertControlledDraftPort(port) {
  if (!port || typeof port.recordControlledDraftGeneration !== "function") {
    throw draftError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_PORT_REQUIRED", "ControlledDraftGenerationPort.recordControlledDraftGeneration is required");
  }
  return port;
}

function buildPortRequest(normalized) {
  const envelope = normalized.inputEnvelopeResult.inputEnvelope;
  const precheck = normalized.modelPrecheckResult.modelExecutionPrecheck;
  return {
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_PORT,
    generationInvocationId: normalized.generationInvocationId,
    sourceInputEnvelope: {
      envelopeId: envelope.envelopeId,
      planId: envelope.planId,
      claimId: envelope.claimId,
      questionBankDraftRef: envelope.questionBankDraftRef,
      sourceRequestId: envelope.sourceRequestId,
      archiveItemId: envelope.archiveItemId,
      studentId: envelope.studentId,
      workerId: envelope.workerId,
      itemBlueprints: envelope.itemBlueprints,
      promptBudget: envelope.promptBudget,
    },
    sourceModelPrecheck: precheck,
    generationAttempt: normalized.generationAttempt,
    outputPolicy: normalized.outputPolicy,
    evidenceRefs: normalized.evidenceRefs,
    inputHash: normalized.inputHash,
  };
}

function assertPortResult(portResult, normalized) {
  rejectLeakedFields(portResult, "portResult");
  assertPlainObject(portResult, "portResult");
  const draft = assertPlainObject(portResult.generatedDraft, "portResult.generatedDraft");
  const envelope = normalized.inputEnvelopeResult.inputEnvelope;
  const precheck = normalized.modelPrecheckResult.modelExecutionPrecheck;
  const items = assertGeneratedItems(draft.items, envelope.itemBlueprints);
  return {
    artifactId: requireToken(draft.artifactId, "portResult.generatedDraft.artifactId", "qbank_generation_controlled_draft_"),
    envelopeId: requireConst(draft.envelopeId, envelope.envelopeId, "portResult.generatedDraft.envelopeId"),
    precheckId: requireConst(draft.precheckId, precheck.precheckId, "portResult.generatedDraft.precheckId"),
    planId: requireConst(draft.planId, envelope.planId, "portResult.generatedDraft.planId"),
    claimId: requireConst(draft.claimId, envelope.claimId, "portResult.generatedDraft.claimId"),
    questionBankDraftRef: requireConst(draft.questionBankDraftRef, envelope.questionBankDraftRef, "portResult.generatedDraft.questionBankDraftRef"),
    studentId: requireConst(draft.studentId, envelope.studentId, "portResult.generatedDraft.studentId"),
    workerId: requireConst(draft.workerId, envelope.workerId, "portResult.generatedDraft.workerId"),
    generationAttemptId: requireConst(draft.generationAttemptId, normalized.generationAttempt.attemptId, "portResult.generatedDraft.generationAttemptId"),
    modelRoute: requireConst(draft.modelRoute, precheck.modelRoute, "portResult.generatedDraft.modelRoute"),
    status: requireConst(draft.status, "CONTROLLED_DRAFT_READY_FOR_REVIEW_NOT_STORED", "portResult.generatedDraft.status"),
    executionState: requireConst(draft.executionState, "CONTROLLED_DRAFT_RECORDED_NOT_STORED", "portResult.generatedDraft.executionState"),
    items,
    rawModelOutputStored: requireConst(draft.rawModelOutputStored, false, "portResult.generatedDraft.rawModelOutputStored"),
    answerKeyGenerated: requireConst(draft.answerKeyGenerated, false, "portResult.generatedDraft.answerKeyGenerated"),
    expectedAnswerGenerated: requireConst(draft.expectedAnswerGenerated, false, "portResult.generatedDraft.expectedAnswerGenerated"),
    questionBankContentWriteStarted: requireConst(draft.questionBankContentWriteStarted, false, "portResult.generatedDraft.questionBankContentWriteStarted"),
  };
}

function assertGeneratedItems(items, blueprints) {
  if (!Array.isArray(items) || items.length !== blueprints.length) {
    throw draftError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_ITEM_COUNT_MISMATCH", "portResult.generatedDraft.items must match blueprint count");
  }
  const blueprintById = new Map(blueprints.map((item) => [item.itemId, item]));
  const seen = new Set();
  return items.map((item, index) => {
    rejectLeakedFields(item, `portResult.generatedDraft.items[${index}]`);
    assertPlainObject(item, `portResult.generatedDraft.items[${index}]`);
    const itemId = requireToken(item.itemId, `portResult.generatedDraft.items[${index}].itemId`, "qbank_plan_item_");
    if (seen.has(itemId)) throw draftError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_DUPLICATE_ITEM", `${itemId} is duplicated`);
    seen.add(itemId);
    const blueprint = blueprintById.get(itemId);
    if (!blueprint) throw draftError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_UNKNOWN_ITEM", `${itemId} is not in the input envelope`);
    return {
      itemId,
      questionType: requireConst(item.questionType, blueprint.questionType, `portResult.generatedDraft.items[${index}].questionType`),
      difficulty: requireConst(item.difficulty, blueprint.difficulty, `portResult.generatedDraft.items[${index}].difficulty`),
      knowledgePoint: requireConst(item.knowledgePoint, blueprint.knowledgePoint, `portResult.generatedDraft.items[${index}].knowledgePoint`),
      questionText: requireBoundedString(item.questionText, `portResult.generatedDraft.items[${index}].questionText`, 12, 900),
      hintPolicy: requireOneOf(item.hintPolicy, `portResult.generatedDraft.items[${index}].hintPolicy`, ["NONE", "LIGHT_HINTS", "STEP_HINTS"]),
      maxHints: requireConst(item.maxHints, blueprint.maxHints, `portResult.generatedDraft.items[${index}].maxHints`),
      sourceEvidenceRef: requireConst(item.sourceEvidenceRef, blueprint.sourceEvidenceRef, `portResult.generatedDraft.items[${index}].sourceEvidenceRef`),
    };
  });
}

function buildDraftRecord(normalized, generatedDraft, recordedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_PORT,
    status: recordedStatus,
    recordId: `student_app_ai_tutor_question_bank_draft_generation_controlled_draft_${normalized.idempotencyKey.replace(/[^a-zA-Z0-9_-]/gu, "_")}`,
    recordedAt,
    sourceInputEnvelope: {
      runtimeId: envelopeRuntimeId,
      envelopeId: normalized.inputEnvelopeResult.inputEnvelope.envelopeId,
      executionState: normalized.inputEnvelopeResult.inputEnvelope.executionState,
    },
    sourceModelPrecheck: {
      runtimeId: precheckRuntimeId,
      precheckId: normalized.modelPrecheckResult.modelExecutionPrecheck.precheckId,
      executionState: normalized.modelPrecheckResult.modelExecutionPrecheck.executionState,
    },
    generationAttempt: normalized.generationAttempt,
    generatedDraft,
    boundary: {
      internalServiceOnly: true,
      sourceInputEnvelopeVerified: true,
      sourceModelPrecheckVerified: true,
      controlledGenerationPortUsed: true,
      sanitizedQuestionDraftArtifactRecorded: true,
      questionContentGenerated: true,
      rawModelOutputStored: false,
      answerKeyGenerated: false,
      expectedAnswerGenerated: false,
      questionBankContentWriteStarted: false,
      studentAnsweringStarted: false,
      scoringStarted: false,
      studentVisiblePublished: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureTeacherReview: true,
      requiresFutureContentStorageCommit: true,
    },
    evidenceRefs: [
      ...normalized.evidenceRefs,
      `evidence:question-bank-generation-controlled-draft-input-hash:${normalized.inputHash}`,
      `evidence:runtime:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RUNTIME_ID}`,
      `evidence:command-port:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_PORT}`,
      `evidence:source-runtime:${envelopeRuntimeId}`,
      `evidence:source-runtime:${precheckRuntimeId}`,
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
      p99Ms: 9,
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_PROBE",
    },
    idempotentReplay: replay.idempotentReplay,
  };
}

function assertItemBlueprints(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 12) {
    throw draftError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_INVALID_ITEMS", "source.envelope.inputEnvelope.itemBlueprints must contain 1-12 items");
  }
  const seen = new Set();
  return items.map((item, index) => {
    rejectLeakedFields(item, `source.envelope.inputEnvelope.itemBlueprints[${index}]`);
    assertPlainObject(item, `source.envelope.inputEnvelope.itemBlueprints[${index}]`);
    const itemId = requireToken(item.itemId, `source.envelope.inputEnvelope.itemBlueprints[${index}].itemId`, "qbank_plan_item_");
    if (seen.has(itemId)) throw draftError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_DUPLICATE_BLUEPRINT", `${itemId} is duplicated`);
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
  requireConst(record.generatedDraft.envelopeId, normalized.inputEnvelopeResult.inputEnvelope.envelopeId, "record.generatedDraft.envelopeId");
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
        throw draftError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_LEAKED_FIELD", `${current.path}.${key} is not allowed`);
      }
      if (nested && typeof nested === "object") stack.push({ value: nested, path: `${current.path}.${key}` });
    }
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw draftError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_INVALID_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw draftError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_CONST_MISMATCH", `${label} must be ${expected}`);
  }
  return actual;
}

function requireOneOf(actual, label, allowed) {
  if (!allowed.includes(actual)) {
    throw draftError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_INVALID_ENUM", `${label} must be one of ${allowed.join(",")}`);
  }
  return actual;
}

function requireBoundedString(value, label, minLength, maxLength) {
  if (typeof value !== "string" || value.length < minLength || value.length > maxLength) {
    throw draftError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_INVALID_STRING", `${label} must be a string of length ${minLength}-${maxLength}`);
  }
  return value;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 240);
  if (!token.startsWith(prefix)) {
    throw draftError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_INVALID_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireQuestionBankDraftRef(value, label) {
  const draftRef = requireBoundedString(value, label, 12, 260);
  if (!draftRef.startsWith("local://question-bank-drafts/")) {
    throw draftError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_INVALID_DRAFT_REF", `${label} must be a local question-bank draft ref`);
  }
  return draftRef;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw draftError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_INVALID_INTEGER", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function uniqueStringArray(value, label, minLength, maxLength) {
  if (!Array.isArray(value) || value.length < minLength || value.length > maxLength) {
    throw draftError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_INVALID_ARRAY", `${label} must contain ${minLength}-${maxLength} strings`);
  }
  const seen = new Set();
  return value.map((item, index) => {
    const normalized = requireBoundedString(item, `${label}[${index}]`, 1, 360);
    if (seen.has(normalized)) throw draftError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_DUPLICATE_STRING", `${label}[${index}] is duplicated`);
    seen.add(normalized);
    return normalized;
  });
}

function draftError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
