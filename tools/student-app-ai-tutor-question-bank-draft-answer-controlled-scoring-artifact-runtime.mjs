import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_answer_controlled_scoring_artifact_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_PORT =
  "StudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifactPort.recordControlledScoringArtifact";

const inputSchemaVersion = "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-controlled-scoring-artifact.v1";
const outputSchemaVersion = "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-controlled-scoring-artifact-recorded.v1";
const precheckSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-scoring-model-execution-prechecked.v1";
const precheckRuntimeId = "student_app_ai_tutor_question_bank_draft_answer_scoring_model_execution_precheck_runtime";
const precheckPort = "StudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheckPort.recordAnswerScoringModelExecutionPrecheck";
const precheckStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECKED";
const scoringInputFoundationRuntimeId = "student_app_ai_tutor_question_bank_draft_answer_scoring_input_foundation";
const scoringInputFoundationWorkload = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_INPUT_FOUNDATION";
const recordedStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_RECORDED";
const modelRoute = "StudentTutorAgent.score_question_bank_answer";
const defaultArtifactLogPath =
  "reports/student-command-log/student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact.jsonl";

const leakedFieldNames = [
  "answerText",
  "expectedAnswer",
  "explanation",
  "answerKey",
  "correctAnswer",
  "rawModelOutput",
  "modelOutput",
  "modelResponse",
  "feedback",
  "detailedFeedback",
  "resultRef",
  "directSql",
  "dbUrl",
  "internalError",
  "errorMessage",
  "publishedAt",
  "publicationStatus",
];

export async function recordStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(input, options = {}) {
  const recordedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const artifactLogPath = options.artifactLogPath ?? defaultArtifactLogPath;
  const existing = findExistingRecordByIdempotencyKey(artifactLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const scoringPort = assertScoringArtifactPort(options.controlledScoringArtifactPort);
  const portResult = await scoringPort.recordControlledScoringArtifact(buildPortRequest(normalized));
  const scoreArtifact = assertPortResult(portResult, normalized);
  const record = buildRecord(normalized, scoreArtifact, recordedAt);
  appendRecord(artifactLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(result) {
  return [
    `Student App AI Tutor question-bank controlled scoring artifact: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Request: ${result.scoreArtifact.requestId}`,
    `Score: ${result.scoreArtifact.scoreSummary.totalScore}/${result.scoreArtifact.scoreSummary.maxScore}`,
    `Persisted: ${result.boundary.resultPersistenceStarted}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input", { skipProtectedScoringInput: true });
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const scoringInvocationId = requireToken(input.scoringInvocationId, "input.scoringInvocationId", "qbank_answer_scoring_model_execution_");
  const modelExecutionPrecheckReport = assertPrecheckReport(input.modelExecutionPrecheckReport);
  const modelExecutionPrecheckResult = assertPrecheckResult(modelExecutionPrecheckReport);
  const answerScoringInputFoundationReport = assertScoringInputFoundationReport(input.answerScoringInputFoundationReport);
  const principal = assertPrincipal(input.principal);
  const protectedScoringInput = assertProtectedScoringInput(input.protectedScoringInput, modelExecutionPrecheckResult);
  const scoringAttempt = assertScoringAttempt(input.scoringAttempt, modelExecutionPrecheckResult);
  const outputPolicy = assertOutputPolicy(input.outputPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 4, 600);
  for (const required of [
    "answer-scoring-model-execution-precheck",
    "answer-scoring-input-foundation",
    "controlled-scoring-model-execution",
  ]) {
    if (!evidenceRefs.some((ref) => ref.includes(required))) {
      throw scoringArtifactError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_CONTROLLED_SCORING_ARTIFACT_MISSING_EVIDENCE", `${required} evidence ref is required`);
    }
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 420);
  const protectedInputDigest = digestProtectedScoringInput(protectedScoringInput);
  const inputHash = hashInput({
    scoringInvocationId,
    precheckId: modelExecutionPrecheckResult.modelExecutionPrecheck.precheckId,
    requestId: modelExecutionPrecheckResult.modelExecutionPrecheck.requestId,
    workerId: modelExecutionPrecheckResult.modelExecutionPrecheck.workerId,
    attemptId: scoringAttempt.attemptId,
    protectedInputDigest,
    outputPolicy,
  });
  return {
    scoringInvocationId,
    modelExecutionPrecheckReport,
    modelExecutionPrecheckResult,
    answerScoringInputFoundationReport,
    principal,
    protectedScoringInput,
    protectedInputDigest,
    scoringAttempt,
    outputPolicy,
    evidenceRefs,
    idempotencyKey,
    inputHash,
  };
}

function assertPrecheckReport(report) {
  rejectLeakedFields(report, "input.modelExecutionPrecheckReport");
  assertPlainObject(report, "input.modelExecutionPrecheckReport");
  requireConst(report.readiness, "READY", "input.modelExecutionPrecheckReport.readiness");
  requireConst(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK", "input.modelExecutionPrecheckReport.workloadType");
  requireConst(report.runtime?.runtimeId, precheckRuntimeId, "input.modelExecutionPrecheckReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, precheckPort, "input.modelExecutionPrecheckReport.runtime.commandPort");
  requireConst(report.runtime?.status, precheckStatus, "input.modelExecutionPrecheckReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.modelExecutionPrecheckReport.runtimeSlo.totalErrors");
  const invariants = report.safetyInvariants ?? {};
  for (const field of [
    "sourceAnswerScoringRequestVerificationRequired",
    "sourceScoringInputFoundationRequired",
    "internalServiceOnly",
    "approvalRequired",
    "modelExecutionQueueAdmissionOnly",
    "futureScoringModelExecutionApproved",
    "protectedWorkerInputBoundaryPreserved",
  ]) {
    requireConst(invariants[field], true, `input.modelExecutionPrecheckReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "answerTextDisclosed",
    "expectedAnswerDisclosed",
    "explanationDisclosed",
    "answerKeyDisclosed",
    "rawModelOutputDisclosed",
    "resultPersistenceAllowed",
    "feedbackGenerationAllowed",
    "studentVisiblePublishAllowed",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "swarmAllowed",
  ]) {
    requireConst(invariants[field], false, `input.modelExecutionPrecheckReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertPrecheckResult(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerScoringModelExecutionPrecheck?.result;
  rejectLeakedFields(result, "source.modelExecutionPrecheckResult");
  assertPlainObject(result, "source.modelExecutionPrecheckResult");
  requireConst(result.schemaVersion, precheckSchemaVersion, "source.precheck.schemaVersion");
  requireConst(result.runtimeId, precheckRuntimeId, "source.precheck.runtimeId");
  requireConst(result.commandPort, precheckPort, "source.precheck.commandPort");
  requireConst(result.status, precheckStatus, "source.precheck.status");
  requireConst(result.boundary?.modelExecutionQueueAdmissionOnly, true, "source.precheck.boundary.modelExecutionQueueAdmissionOnly");
  requireConst(result.boundary?.modelInferenceStarted, false, "source.precheck.boundary.modelInferenceStarted");
  requireConst(result.boundary?.scoringExecutionStarted, false, "source.precheck.boundary.scoringExecutionStarted");
  requireConst(result.boundary?.resultPersistenceStarted, false, "source.precheck.boundary.resultPersistenceStarted");
  requireConst(result.boundary?.feedbackGenerationStarted, false, "source.precheck.boundary.feedbackGenerationStarted");
  assertPlainObject(result.modelExecutionPrecheck, "source.precheck.modelExecutionPrecheck");
  requireConst(result.modelExecutionPrecheck.executionState, "MODEL_EXECUTION_PRECHECKED_NOT_STARTED", "source.precheck.modelExecutionPrecheck.executionState");
  requireConst(result.modelExecutionPrecheck.modelRoute, modelRoute, "source.precheck.modelExecutionPrecheck.modelRoute");
  const manifest = assertScoringInputManifest(result.scoringInputManifest, result.modelExecutionPrecheck);
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "source.precheck.recordId", 1, 420),
    modelExecutionPrecheck: {
      precheckId: requireToken(result.modelExecutionPrecheck.precheckId, "source.precheck.modelExecutionPrecheck.precheckId", "qbank_answer_scoring_model_precheck_"),
      requestId: requireToken(result.modelExecutionPrecheck.requestId, "source.precheck.modelExecutionPrecheck.requestId", "grading_req_"),
      submissionId: requireToken(result.modelExecutionPrecheck.submissionId, "source.precheck.modelExecutionPrecheck.submissionId", "qbank_ans_sub_"),
      questionBankDraftRef: requireQuestionBankDraftRef(result.modelExecutionPrecheck.questionBankDraftRef, "source.precheck.modelExecutionPrecheck.questionBankDraftRef"),
      tutoringAnalysisRequestId: requireToken(result.modelExecutionPrecheck.tutoringAnalysisRequestId, "source.precheck.modelExecutionPrecheck.tutoringAnalysisRequestId", "tutor_req_"),
      archiveItemId: requireToken(result.modelExecutionPrecheck.archiveItemId, "source.precheck.modelExecutionPrecheck.archiveItemId", "tarch_"),
      workerId: requireToken(result.modelExecutionPrecheck.workerId, "source.precheck.modelExecutionPrecheck.workerId", "ai_grading_worker_"),
      modelRoute,
      queueRef: requireToken(result.modelExecutionPrecheck.queueRef, "source.precheck.modelExecutionPrecheck.queueRef", "qbank_answer_scoring_model_queue_"),
      answerItemCount: requireIntegerBetween(result.modelExecutionPrecheck.answerItemCount, "source.precheck.modelExecutionPrecheck.answerItemCount", 1, 100),
      status: requireConst(result.modelExecutionPrecheck.status, "PRECHECKED_FOR_REVIEWED_ANSWER_SCORING_MODEL_QUEUE", "source.precheck.modelExecutionPrecheck.status"),
      executionState: "MODEL_EXECUTION_PRECHECKED_NOT_STARTED",
    },
    scoringInputManifest: manifest,
    evidenceRefs: uniqueStringArray(result.evidenceRefs ?? [], "source.precheck.evidenceRefs", 1, 2600),
  };
}

function assertScoringInputManifest(manifest, precheck) {
  rejectLeakedFields(manifest, "source.precheck.scoringInputManifest");
  assertPlainObject(manifest, "source.precheck.scoringInputManifest");
  const submittedAnswerItemIds = uniqueStringArray(manifest.submittedAnswerItemIds, "source.precheck.scoringInputManifest.submittedAnswerItemIds", 1, 100);
  requireConst(manifest.requestId, precheck.requestId, "source.precheck.scoringInputManifest.requestId");
  requireConst(manifest.submissionId, precheck.submissionId, "source.precheck.scoringInputManifest.submissionId");
  requireConst(manifest.questionBankDraftRef, precheck.questionBankDraftRef, "source.precheck.scoringInputManifest.questionBankDraftRef");
  requireConst(manifest.workerId, precheck.workerId, "source.precheck.scoringInputManifest.workerId");
  requireConst(manifest.answerItemCount, submittedAnswerItemIds.length, "source.precheck.scoringInputManifest.answerItemCount");
  requireConst(manifest.status, "WORKER_INPUT_READY_NOT_SCORED", "source.precheck.scoringInputManifest.status");
  return {
    manifestId: requireToken(manifest.manifestId, "source.precheck.scoringInputManifest.manifestId", "qbank_answer_scoring_input_manifest_"),
    requestId: manifest.requestId,
    submissionId: manifest.submissionId,
    questionBankDraftRef: manifest.questionBankDraftRef,
    workerId: manifest.workerId,
    answerItemCount: manifest.answerItemCount,
    submittedAnswerItemIds,
    status: manifest.status,
  };
}

function assertScoringInputFoundationReport(report) {
  assertPlainObject(report, "input.answerScoringInputFoundationReport");
  requireConst(report.readiness, "READY", "input.answerScoringInputFoundationReport.readiness");
  requireConst(report.workloadType, scoringInputFoundationWorkload, "input.answerScoringInputFoundationReport.workloadType");
  requireConst(report.runtime?.runtimeId, scoringInputFoundationRuntimeId, "input.answerScoringInputFoundationReport.runtime.runtimeId");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.answerScoringInputFoundationReport.runtimeSlo.totalErrors");
  const invariants = report.safetyInvariants ?? {};
  for (const field of [
    "internalWorkerOnly",
    "servicePrincipalRequired",
    "agentInternalEntryPointRequired",
    "claimedBySameWorkerRequired",
    "requestSourceLinkageRequired",
    "responseExposesAnswerTextToWorker",
    "responseExposesExpectedAnswerToWorker",
    "responseExposesExplanationToWorker",
  ]) {
    requireConst(invariants[field], true, `input.answerScoringInputFoundationReport.safetyInvariants.${field}`);
  }
  for (const field of ["modelInferenceAllowed", "resultPersistenceAllowed", "studentVisiblePublishAllowed"]) {
    requireConst(invariants[field], false, `input.answerScoringInputFoundationReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 4, 18);
  for (const scope of ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT", "ANSWER_SCORING_MODEL_EXECUTE"]) {
    if (!scopes.includes(scope)) {
      throw scoringArtifactError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_CONTROLLED_SCORING_ARTIFACT_SCOPE_MISSING", `input.principal.scopes must include ${scope}`);
    }
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

function assertProtectedScoringInput(input, precheckResult) {
  assertPlainObject(input, "input.protectedScoringInput");
  const precheck = precheckResult.modelExecutionPrecheck;
  const manifest = precheckResult.scoringInputManifest;
  requireConst(input.requestId, precheck.requestId, "input.protectedScoringInput.requestId");
  requireConst(input.submissionId, precheck.submissionId, "input.protectedScoringInput.submissionId");
  requireConst(input.questionBankDraftRef, precheck.questionBankDraftRef, "input.protectedScoringInput.questionBankDraftRef");
  requireConst(input.workerId, precheck.workerId, "input.protectedScoringInput.workerId");
  requireConst(input.sourceFoundationRuntimeId, scoringInputFoundationRuntimeId, "input.protectedScoringInput.sourceFoundationRuntimeId");
  const items = assertProtectedItems(input.items);
  requireConst(items.length, manifest.submittedAnswerItemIds.length, "input.protectedScoringInput.items.length");
  const actualIds = items.map((item) => item.itemId).sort();
  const expectedIds = [...manifest.submittedAnswerItemIds].sort();
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    throw scoringArtifactError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_CONTROLLED_SCORING_ARTIFACT_ITEM_LINKAGE_MISMATCH", "protected scoring item ids must match the prechecked submitted item ids");
  }
  return {
    requestId: input.requestId,
    submissionId: input.submissionId,
    questionBankDraftRef: input.questionBankDraftRef,
    workerId: input.workerId,
    sourceFoundationRuntimeId: input.sourceFoundationRuntimeId,
    items,
  };
}

function assertProtectedItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    throw scoringArtifactError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_CONTROLLED_SCORING_ARTIFACT_ITEMS_INVALID", "input.protectedScoringInput.items must contain 1-100 items");
  }
  const seen = new Set();
  return items.map((item, index) => {
    assertPlainObject(item, `input.protectedScoringInput.items[${index}]`);
    const itemId = requireToken(item.itemId, `input.protectedScoringInput.items[${index}].itemId`, "qbank_plan_item_");
    if (seen.has(itemId)) throw scoringArtifactError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_CONTROLLED_SCORING_ARTIFACT_DUPLICATE_ITEM", `duplicate protected scoring item ${itemId}`);
    seen.add(itemId);
    return {
      itemId,
      answerText: requireBoundedString(item.answerText, `input.protectedScoringInput.items[${index}].answerText`, 1, 2400),
      expectedAnswer: requireBoundedString(item.expectedAnswer, `input.protectedScoringInput.items[${index}].expectedAnswer`, 1, 2400),
      explanation: requireBoundedString(item.explanation, `input.protectedScoringInput.items[${index}].explanation`, 1, 2400),
      maxScore: requireNumberBetween(item.maxScore, `input.protectedScoringInput.items[${index}].maxScore`, 1, 100),
      rubricCode: requireToken(item.rubricCode, `input.protectedScoringInput.items[${index}].rubricCode`, "rubric_"),
    };
  });
}

function assertScoringAttempt(attempt, precheckResult) {
  assertPlainObject(attempt, "input.scoringAttempt");
  const precheck = precheckResult.modelExecutionPrecheck;
  return {
    attemptId: requireToken(attempt.attemptId, "input.scoringAttempt.attemptId", "qbank_answer_scoring_model_attempt_"),
    precheckId: requireConst(attempt.precheckId, precheck.precheckId, "input.scoringAttempt.precheckId"),
    requestId: requireConst(attempt.requestId, precheck.requestId, "input.scoringAttempt.requestId"),
    workerId: requireConst(attempt.workerId, precheck.workerId, "input.scoringAttempt.workerId"),
    modelRoute: requireConst(attempt.modelRoute, modelRoute, "input.scoringAttempt.modelRoute"),
    queueRef: requireConst(attempt.queueRef, precheck.queueRef, "input.scoringAttempt.queueRef"),
    providerClass: requireOneOf(attempt.providerClass, "input.scoringAttempt.providerClass", ["CONTROLLED_AI_WORKER", "LOCAL_SANDBOXED_AI_WORKER"]),
    attemptNo: requireIntegerBetween(attempt.attemptNo, "input.scoringAttempt.attemptNo", 1, 1),
  };
}

function assertOutputPolicy(policy) {
  assertPlainObject(policy, "input.outputPolicy");
  return {
    controlledScoreArtifactOnly: requireConst(policy.controlledScoreArtifactOnly, true, "input.outputPolicy.controlledScoreArtifactOnly"),
    modelInferenceAllowed: requireConst(policy.modelInferenceAllowed, true, "input.outputPolicy.modelInferenceAllowed"),
    scoringExecutionAllowed: requireConst(policy.scoringExecutionAllowed, true, "input.outputPolicy.scoringExecutionAllowed"),
    answerTextInArtifactAllowed: requireConst(policy.answerTextInArtifactAllowed, false, "input.outputPolicy.answerTextInArtifactAllowed"),
    expectedAnswerInArtifactAllowed: requireConst(policy.expectedAnswerInArtifactAllowed, false, "input.outputPolicy.expectedAnswerInArtifactAllowed"),
    explanationInArtifactAllowed: requireConst(policy.explanationInArtifactAllowed, false, "input.outputPolicy.explanationInArtifactAllowed"),
    rawModelOutputStored: requireConst(policy.rawModelOutputStored, false, "input.outputPolicy.rawModelOutputStored"),
    resultPersistenceAllowed: requireConst(policy.resultPersistenceAllowed, false, "input.outputPolicy.resultPersistenceAllowed"),
    feedbackGenerationAllowed: requireConst(policy.feedbackGenerationAllowed, false, "input.outputPolicy.feedbackGenerationAllowed"),
    studentVisiblePublishAllowed: requireConst(policy.studentVisiblePublishAllowed, false, "input.outputPolicy.studentVisiblePublishAllowed"),
    directDatabaseAccessAllowed: requireConst(policy.directDatabaseAccessAllowed, false, "input.outputPolicy.directDatabaseAccessAllowed"),
    executeHttpRequestAllowed: requireConst(policy.executeHttpRequestAllowed, false, "input.outputPolicy.executeHttpRequestAllowed"),
    swarmAllowed: requireConst(policy.swarmAllowed, false, "input.outputPolicy.swarmAllowed"),
  };
}

function buildPortRequest(normalized) {
  const precheck = normalized.modelExecutionPrecheckResult.modelExecutionPrecheck;
  return {
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_PORT,
    principal: normalized.principal,
    scoringAttempt: normalized.scoringAttempt,
    modelExecutionPrecheck: {
      precheckId: precheck.precheckId,
      requestId: precheck.requestId,
      submissionId: precheck.submissionId,
      questionBankDraftRef: precheck.questionBankDraftRef,
      workerId: precheck.workerId,
      modelRoute: precheck.modelRoute,
      queueRef: precheck.queueRef,
    },
    protectedScoringInput: normalized.protectedScoringInput,
    outputPolicy: normalized.outputPolicy,
  };
}

function assertPortResult(result, normalized) {
  rejectLeakedFields(result, "ControlledScoringArtifactPort result");
  assertPlainObject(result, "ControlledScoringArtifactPort result");
  const artifact = result.scoreArtifact ?? result.controlledScoringArtifact;
  rejectLeakedFields(artifact, "ControlledScoringArtifactPort result.scoreArtifact");
  assertPlainObject(artifact, "ControlledScoringArtifactPort result.scoreArtifact");
  const precheck = normalized.modelExecutionPrecheckResult.modelExecutionPrecheck;
  requireConst(artifact.requestId, precheck.requestId, "portResult.scoreArtifact.requestId");
  requireConst(artifact.submissionId, precheck.submissionId, "portResult.scoreArtifact.submissionId");
  requireConst(artifact.questionBankDraftRef, precheck.questionBankDraftRef, "portResult.scoreArtifact.questionBankDraftRef");
  requireConst(artifact.workerId, precheck.workerId, "portResult.scoreArtifact.workerId");
  requireConst(artifact.modelRoute, modelRoute, "portResult.scoreArtifact.modelRoute");
  requireConst(artifact.executionState, "SCORING_ARTIFACT_RECORDED_NOT_PERSISTED", "portResult.scoreArtifact.executionState");
  requireConst(artifact.resultPersistenceStarted, false, "portResult.scoreArtifact.resultPersistenceStarted");
  requireConst(artifact.feedbackGenerationStarted, false, "portResult.scoreArtifact.feedbackGenerationStarted");
  requireConst(artifact.studentVisiblePublished, false, "portResult.scoreArtifact.studentVisiblePublished");
  const itemScores = assertItemScores(artifact.itemScores, normalized.protectedScoringInput.items);
  const scoreSummary = assertScoreSummary(artifact.scoreSummary, itemScores);
  return {
    artifactId: requireToken(artifact.artifactId, "portResult.scoreArtifact.artifactId", "qbank_answer_scoring_artifact_"),
    requestId: artifact.requestId,
    submissionId: artifact.submissionId,
    questionBankDraftRef: artifact.questionBankDraftRef,
    tutoringAnalysisRequestId: requireConst(artifact.tutoringAnalysisRequestId, precheck.tutoringAnalysisRequestId, "portResult.scoreArtifact.tutoringAnalysisRequestId"),
    archiveItemId: requireConst(artifact.archiveItemId, precheck.archiveItemId, "portResult.scoreArtifact.archiveItemId"),
    workerId: artifact.workerId,
    modelRoute: artifact.modelRoute,
    attemptId: requireConst(artifact.attemptId, normalized.scoringAttempt.attemptId, "portResult.scoreArtifact.attemptId"),
    executionState: artifact.executionState,
    status: requireConst(artifact.status, "REVIEWED_MODEL_SCORE_ARTIFACT_RECORDED_NOT_PERSISTED", "portResult.scoreArtifact.status"),
    itemScores,
    scoreSummary,
    resultPersistenceStarted: false,
    feedbackGenerationStarted: false,
    studentVisiblePublished: false,
  };
}

function assertItemScores(itemScores, protectedItems) {
  if (!Array.isArray(itemScores) || itemScores.length !== protectedItems.length) {
    throw scoringArtifactError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_CONTROLLED_SCORING_ARTIFACT_ITEM_SCORES_INVALID", "portResult.scoreArtifact.itemScores must match protected input item count");
  }
  const maxByItem = new Map(protectedItems.map((item) => [item.itemId, item.maxScore]));
  const seen = new Set();
  return itemScores.map((score, index) => {
    rejectLeakedFields(score, `portResult.scoreArtifact.itemScores[${index}]`);
    assertPlainObject(score, `portResult.scoreArtifact.itemScores[${index}]`);
    const itemId = requireToken(score.itemId, `portResult.scoreArtifact.itemScores[${index}].itemId`, "qbank_plan_item_");
    if (seen.has(itemId)) throw scoringArtifactError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_CONTROLLED_SCORING_ARTIFACT_DUPLICATE_SCORE", `duplicate score item ${itemId}`);
    seen.add(itemId);
    if (!maxByItem.has(itemId)) throw scoringArtifactError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_CONTROLLED_SCORING_ARTIFACT_UNKNOWN_SCORE_ITEM", `score item ${itemId} was not in protected input`);
    const maxScore = requireConst(score.maxScore, maxByItem.get(itemId), `portResult.scoreArtifact.itemScores[${index}].maxScore`);
    return {
      itemId,
      score: requireNumberBetween(score.score, `portResult.scoreArtifact.itemScores[${index}].score`, 0, maxScore),
      maxScore,
      confidence: requireNumberBetween(score.confidence, `portResult.scoreArtifact.itemScores[${index}].confidence`, 0, 1),
      rubricCode: requireToken(score.rubricCode, `portResult.scoreArtifact.itemScores[${index}].rubricCode`, "rubric_"),
    };
  });
}

function assertScoreSummary(summary, itemScores) {
  rejectLeakedFields(summary, "portResult.scoreArtifact.scoreSummary");
  assertPlainObject(summary, "portResult.scoreArtifact.scoreSummary");
  const totalScore = round2(itemScores.reduce((sum, item) => sum + item.score, 0));
  const maxScore = round2(itemScores.reduce((sum, item) => sum + item.maxScore, 0));
  requireConst(summary.totalScore, totalScore, "portResult.scoreArtifact.scoreSummary.totalScore");
  requireConst(summary.maxScore, maxScore, "portResult.scoreArtifact.scoreSummary.maxScore");
  const percentage = round2((totalScore / maxScore) * 100);
  requireConst(summary.percentage, percentage, "portResult.scoreArtifact.scoreSummary.percentage");
  return {
    totalScore,
    maxScore,
    percentage,
    level: requireOneOf(summary.level, "portResult.scoreArtifact.scoreSummary.level", ["NEEDS_PRACTICE", "DEVELOPING", "PROFICIENT", "ADVANCED"]),
  };
}

function buildRecord(normalized, scoreArtifact, recordedAt) {
  return {
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_PORT,
    status: recordedStatus,
    recordId: `student_app_ai_tutor_question_bank_draft_answer_controlled_scoring_artifact_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
    sourcePrecheck: {
      runtimeId: precheckRuntimeId,
      recordId: normalized.modelExecutionPrecheckResult.recordId,
      precheckId: normalized.modelExecutionPrecheckResult.modelExecutionPrecheck.precheckId,
      requestId: normalized.modelExecutionPrecheckResult.modelExecutionPrecheck.requestId,
      submissionId: normalized.modelExecutionPrecheckResult.modelExecutionPrecheck.submissionId,
      priorStatus: precheckStatus,
    },
    sourceAnswerScoringInputFoundation: {
      runtimeId: scoringInputFoundationRuntimeId,
      workloadType: scoringInputFoundationWorkload,
    },
    scoringAttempt: normalized.scoringAttempt,
    protectedInputDigest: normalized.protectedInputDigest,
    scoreArtifact,
    evidenceRefs: [
      ...normalized.evidenceRefs,
      `evidence:question-bank-answer-controlled-scoring-artifact-input-hash:sha256:${normalized.inputHash}`,
      `evidence:runtime:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_RUNTIME_ID}`,
      `evidence:command-port:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_PORT}`,
      `evidence:model-route:${modelRoute}`,
    ],
    boundary: {
      sourceModelExecutionPrecheckRequired: true,
      sourceScoringInputFoundationRequired: true,
      protectedAnswerPackageConsumedByWorkerOnly: true,
      controlledModelScoringArtifactOnly: true,
      modelInferenceStarted: true,
      scoringExecutionStarted: true,
      answerTextDisclosed: false,
      expectedAnswerDisclosed: false,
      explanationDisclosed: false,
      answerKeyDisclosed: false,
      rawModelOutputStored: false,
      resultPersistenceStarted: false,
      feedbackGenerationStarted: false,
      studentVisiblePublished: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureRecordAIGradingResult: true,
      requiresFutureReviewedFeedbackPublication: true,
    },
    runtimeSlo: {
      targetP99Ms: 50,
      evidenceClass: "STUDENT_APP_AI_TUTOR_QBANK_ANSWER_CONTROLLED_SCORING_ARTIFACT_BOUNDARY",
    },
    nextAction: "Persist this sanitized score artifact through RecordAIGradingResult in a future reviewed slice; feedback and publication remain separate gates.",
  };
}

function buildResult(record, { idempotentReplay }) {
  return {
    schemaVersion: outputSchemaVersion,
    ...record,
    idempotentReplay,
  };
}

function digestProtectedScoringInput(input) {
  return {
    requestId: input.requestId,
    submissionId: input.submissionId,
    questionBankDraftRef: input.questionBankDraftRef,
    workerId: input.workerId,
    itemCount: input.items.length,
    itemDigests: input.items.map((item) => ({
      itemId: item.itemId,
      maxScore: item.maxScore,
      rubricCode: item.rubricCode,
      answerHash: `sha256:${hashInput(item.answerText)}`,
      expectedAnswerHash: `sha256:${hashInput(item.expectedAnswer)}`,
      explanationHash: `sha256:${hashInput(item.explanation)}`,
    })),
  };
}

function assertScoringArtifactPort(port) {
  if (!port || typeof port.recordControlledScoringArtifact !== "function") {
    throw scoringArtifactError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_CONTROLLED_SCORING_ARTIFACT_MISSING_PORT", "ControlledScoringArtifactPort.recordControlledScoringArtifact is required");
  }
  return port;
}

function findExistingRecordByIdempotencyKey(logPath, idempotencyKey) {
  if (!fs.existsSync(logPath)) return null;
  const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/u).filter(Boolean);
  for (const line of lines) {
    const record = JSON.parse(line);
    if (record.idempotencyKey === idempotencyKey) return record;
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.inputHash !== normalized.inputHash) {
    throw scoringArtifactError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_CONTROLLED_SCORING_ARTIFACT_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different controlled scoring artifact");
  }
}

function appendRecord(logPath, record) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`);
}

function rejectLeakedFields(value, label, options = {}) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (options.skipProtectedScoringInput && key === "protectedScoringInput") continue;
    if (leakedFieldNames.includes(key)) {
      throw scoringArtifactError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_CONTROLLED_SCORING_ARTIFACT_LEAKED_FIELD", `${label}.${key} is not allowed`);
    }
    rejectLeakedFields(child, `${label}.${key}`, options);
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw scoringArtifactError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_CONTROLLED_SCORING_ARTIFACT_INVALID_OBJECT", `${label} must be an object`);
  }
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw scoringArtifactError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_CONTROLLED_SCORING_ARTIFACT_CONST_MISMATCH", `${label} must be ${expected}`);
  }
  return expected;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string" || value.length < min || value.length > max) {
    throw scoringArtifactError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_CONTROLLED_SCORING_ARTIFACT_INVALID_STRING", `${label} must be a string of length ${min}-${max}`);
  }
  return value;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 240);
  if (!token.startsWith(prefix)) {
    throw scoringArtifactError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_CONTROLLED_SCORING_ARTIFACT_INVALID_TOKEN", `${label} must start with ${prefix}`);
  }
  if (!/^[a-zA-Z0-9:_./-]+$/u.test(token)) {
    throw scoringArtifactError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_CONTROLLED_SCORING_ARTIFACT_INVALID_TOKEN", `${label} contains invalid characters`);
  }
  return token;
}

function requireQuestionBankDraftRef(value, label) {
  const ref = requireBoundedString(value, label, 12, 360);
  if (!ref.startsWith("local://question-bank-drafts/")) {
    throw scoringArtifactError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_CONTROLLED_SCORING_ARTIFACT_INVALID_REF", `${label} must be a local question-bank draft ref`);
  }
  return ref;
}

function requireOneOf(value, label, allowed) {
  if (!allowed.includes(value)) {
    throw scoringArtifactError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_CONTROLLED_SCORING_ARTIFACT_INVALID_ENUM", `${label} must be one of ${allowed.join(", ")}`);
  }
  return value;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw scoringArtifactError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_CONTROLLED_SCORING_ARTIFACT_INVALID_INTEGER", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireNumberBetween(value, label, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw scoringArtifactError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_CONTROLLED_SCORING_ARTIFACT_INVALID_NUMBER", `${label} must be a number between ${min} and ${max}`);
  }
  return value;
}

function uniqueStringArray(value, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw scoringArtifactError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_CONTROLLED_SCORING_ARTIFACT_INVALID_ARRAY", `${label} must contain ${min}-${max} items`);
  }
  const seen = new Set();
  return value.map((item, index) => {
    const text = requireBoundedString(item, `${label}[${index}]`, 1, 520);
    if (seen.has(text)) throw scoringArtifactError("STUDENT_APP_AI_TUTOR_QBANK_ANSWER_CONTROLLED_SCORING_ARTIFACT_DUPLICATE_VALUE", `${label} contains duplicate ${text}`);
    seen.add(text);
    return text;
  });
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeToken(value) {
  return value.replace(/[^a-zA-Z0-9]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 180);
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function scoringArtifactError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
