import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_RUNTIME_ID =
  "student_app_ai_tutor_model_execution_precheck_runtime";
export const STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_PORT =
  "StudentAppAITutorModelExecutionPrecheckPort.recordModelExecutionPrecheck";

const inputSchemaVersion = "2026-06-08.student-app.ai-tutor-model-execution-precheck.v1";
const outputSchemaVersion = "2026-06-08.student-app.ai-tutor-model-execution-prechecked.v1";
const modelRoute = "student_tutor_guided_help_v1";
const recordedStatus = "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECKED";
const defaultPrecheckLogPath = "reports/student-command-log/student-app-ai-tutor-model-execution-precheck.jsonl";

const leakedFieldNames = new Set([
  "answerkey",
  "answertemplate",
  "answertext",
  "expectedanswer",
  "correctanswer",
  "submittedanswer",
  "contentref",
  "contentpreview",
  "rawcontent",
  "rawtext",
  "ragchunks",
  "ocrchunks",
  "prompt",
  "prompttext",
  "fullprompt",
  "modeloutput",
  "rawmodeloutput",
  "modelresponse",
  "resultref",
  "internalerror",
  "errormessage",
]);

export async function recordStudentAppAITutorModelExecutionPrecheck(input, options = {}) {
  const precheckedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const precheckLogPath = options.precheckLogPath ?? defaultPrecheckLogPath;
  const existing = findExistingRecordByIdempotencyKey(precheckLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const port = assertPrecheckPort(options.modelExecutionPrecheckPort);
  const portResult = await port.recordModelExecutionPrecheck(buildPortRequest(normalized));
  const recordedPrecheck = assertPortResult(portResult, normalized);
  const record = buildPrecheckRecord(normalized, recordedPrecheck, precheckedAt);
  appendRecord(precheckLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorModelExecutionPrecheck(result) {
  return [
    `Student App AI Tutor model execution precheck: ${result.status}`,
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
  const precheckInvocationId = requireToken(input.precheckInvocationId, "input.precheckInvocationId", "ai_tutor_model_precheck_invocation_");
  const workerStudyPacketInputReport = assertWorkerStudyPacketInputReport(input.workerStudyPacketInputReport);
  const workerInput = assertWorkerInput(input.workerInput);
  requireConst(
    workerStudyPacketInputReport.learningActionSource,
    workerInput.learningActionSource,
    "input.workerStudyPacketInputReport.learningActionSource",
  );
  const principal = assertPrincipal(input.principal);
  const approval = assertApproval(input.approval, workerInput);
  const modelExecutionPolicy = assertModelExecutionPolicy(input.modelExecutionPolicy, approval);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 20, 8, 320);
  if (!hasWorkerInputEvidence(evidenceRefs, workerInput.learningActionSource)) {
    throw precheckError("STUDENT_APP_AI_TUTOR_MODEL_PRECHECK_MISSING_WORKER_INPUT_EVIDENCE", "matching worker input evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("model-execution-approval"))) {
    throw precheckError("STUDENT_APP_AI_TUTOR_MODEL_PRECHECK_MISSING_APPROVAL_EVIDENCE", "model execution approval evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 340);
  const blockDigests = workerInput.blocks.map((block) => hashInput({
    blockId: block.blockId,
    blockType: block.blockType,
    sectionId: block.sectionId,
    title: block.title,
    text: block.text,
    sourceBlockRefs: block.sourceBlockRefs,
  }));
  const inputHash = hashInput({
    precheckInvocationId,
    requestId: workerInput.requestId,
    archiveItemId: workerInput.archiveItemId,
    workerId: workerInput.workerId,
    learningActionSource: workerInput.learningActionSource,
    resultArchiveStatus: workerInput.resultArchiveStatus,
    feedbackStatus: workerInput.feedbackStatus,
    feedbackSubmissionId: workerInput.feedbackSubmissionId,
    feedbackSourceArchiveItemId: workerInput.feedbackSourceArchiveItemId,
    approvalId: approval.approvalId,
    modelExecutionPolicy,
    blockDigests,
  });
  return {
    precheckInvocationId,
    workerStudyPacketInputReport,
    workerInput,
    principal,
    approval,
    modelExecutionPolicy,
    evidenceRefs,
    idempotencyKey,
    blockDigests,
    inputHash,
  };
}

function assertWorkerStudyPacketInputReport(report) {
  assertPlainObject(report, "input.workerStudyPacketInputReport");
  requireConst(report.readiness, "READY", "input.workerStudyPacketInputReport.readiness");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.workerStudyPacketInputReport.runtimeSlo.totalErrors");
  if (report.workloadType === "STUDENT_APP_AI_TUTOR_WORKER_RESULT_ARCHIVE_INPUT") {
    return assertWorkerResultArchiveInputReport(report);
  }
  if (report.workloadType === "STUDENT_APP_AI_TUTOR_WORKER_QUESTION_BANK_FEEDBACK_INPUT") {
    return assertWorkerQuestionBankFeedbackInputReport(report);
  }
  return assertPublishedWorkerStudyPacketInputReport(report);
}

function assertPublishedWorkerStudyPacketInputReport(report) {
  requireConst(report.workloadType, "STUDENT_APP_AI_TUTOR_WORKER_STUDY_PACKET_INPUT", "input.workerStudyPacketInputReport.workloadType");
  requireConst(report.runtime?.runtimeId, "student_app_ai_tutor_worker_study_packet_input", "input.workerStudyPacketInputReport.runtime.runtimeId");
  requireConst(report.runtime?.status, "STUDENT_APP_AI_TUTOR_WORKER_STUDY_PACKET_INPUT_READY", "input.workerStudyPacketInputReport.runtime.status");
  const invariants = assertPlainObject(report.safetyInvariants, "input.workerStudyPacketInputReport.safetyInvariants");
  for (const field of [
    "serviceAgentInternalOnly",
    "claimedWorkerLeaseRequired",
    "ownStudentSourceRequired",
    "publishedStudyPacketRequired",
    "safeTextBlocksPreviewBoundaryRequired",
    "learningActionBoundaryRequired",
    "contentRefExcludedFromResponse",
    "promptExcluded",
    "rawContentExcluded",
  ]) {
    requireConst(invariants[field], true, `input.workerStudyPacketInputReport.safetyInvariants.${field}`);
  }
  for (const field of ["answerKeyOrModelOutputAllowed", "modelInferenceAllowed", "questionBankDraftCreated", "semanticRetrievalAllowed", "swarmAllowed"]) {
    requireConst(invariants[field], false, `input.workerStudyPacketInputReport.safetyInvariants.${field}`);
  }
  return { ...report, learningActionSource: "PUBLISHED_STUDY_PACKET" };
}

function assertWorkerResultArchiveInputReport(report) {
  requireConst(report.runtime?.runtimeId, "student_app_ai_tutor_worker_result_archive_input", "input.workerStudyPacketInputReport.runtime.runtimeId");
  requireConst(report.runtime?.status, "STUDENT_APP_AI_TUTOR_WORKER_RESULT_ARCHIVE_INPUT_READY", "input.workerStudyPacketInputReport.runtime.status");
  const invariants = assertPlainObject(report.safetyInvariants, "input.workerStudyPacketInputReport.safetyInvariants");
  for (const field of [
    "serviceAgentInternalOnly",
    "claimedWorkerLeaseRequired",
    "persistedLearningActionSourceRequired",
    "resultArchiveSnapshotRequired",
    "publishedPreviewReadsBlockedForResultArchiveSource",
    "safeTextBlocksOnly",
  ]) {
    requireConst(invariants[field], true, `input.workerStudyPacketInputReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "contentRefDisclosureAllowed",
    "rawResultRefDisclosureAllowed",
    "rawModelOutputDisclosureAllowed",
    "promptDisclosureAllowed",
    "answerKeyDisclosureAllowed",
    "modelInferenceAllowed",
    "ocrRagAllowed",
    "swarmAllowed",
  ]) {
    requireConst(invariants[field], false, `input.workerStudyPacketInputReport.safetyInvariants.${field}`);
  }
  return { ...report, learningActionSource: "AI_TUTOR_RESULT_ARCHIVE" };
}

function assertWorkerQuestionBankFeedbackInputReport(report) {
  requireConst(report.runtime?.runtimeId, "student_app_ai_tutor_worker_question_bank_feedback_input", "input.workerStudyPacketInputReport.runtime.runtimeId");
  requireConst(report.runtime?.status, "STUDENT_APP_AI_TUTOR_WORKER_QUESTION_BANK_FEEDBACK_INPUT_READY", "input.workerStudyPacketInputReport.runtime.status");
  const invariants = assertPlainObject(report.safetyInvariants, "input.workerStudyPacketInputReport.safetyInvariants");
  for (const field of [
    "serviceAgentInternalOnly",
    "claimedWorkerLeaseRequired",
    "persistedLearningActionSourceRequired",
    "feedbackSnapshotRequired",
    "feedbackSafeRenderRequired",
    "learningActionBoundaryRequired",
    "safeTextBlocksOnly",
  ]) {
    requireConst(invariants[field], true, `input.workerStudyPacketInputReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "answerTextDisclosureAllowed",
    "answerKeyDisclosureAllowed",
    "contentRefDisclosureAllowed",
    "rawModelOutputDisclosureAllowed",
    "promptDisclosureAllowed",
    "modelInferenceAllowed",
    "ocrRagAllowed",
    "swarmAllowed",
  ]) {
    requireConst(invariants[field], false, `input.workerStudyPacketInputReport.safetyInvariants.${field}`);
  }
  return { ...report, learningActionSource: "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK" };
}

function assertWorkerInput(workerInput) {
  rejectLeakedFields(workerInput, "input.workerInput");
  assertPlainObject(workerInput, "input.workerInput");
  const learningActionSource = requireOneOf(
    workerInput.learningActionSource ?? "PUBLISHED_STUDY_PACKET",
    "input.workerInput.learningActionSource",
    ["PUBLISHED_STUDY_PACKET", "AI_TUTOR_RESULT_ARCHIVE", "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK"],
  );
  const blocks = assertBlocks(workerInput.blocks, learningActionSource);
  const packetStatus = learningActionSource === "PUBLISHED_STUDY_PACKET"
    ? requireConst(workerInput.packetStatus, "READY", "input.workerInput.packetStatus")
    : requireAbsent(workerInput.packetStatus, "input.workerInput.packetStatus");
  const resultArchiveStatus = learningActionSource === "AI_TUTOR_RESULT_ARCHIVE"
    ? requireConst(workerInput.resultArchiveStatus, "READY_FOR_STUDENT_APP_READ", "input.workerInput.resultArchiveStatus")
    : requireAbsent(workerInput.resultArchiveStatus, "input.workerInput.resultArchiveStatus");
  const feedbackStatus = learningActionSource === "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK"
    ? requireConst(workerInput.feedbackStatus, "READY_FOR_STUDENT_APP_READ", "input.workerInput.feedbackStatus")
    : requireAbsent(workerInput.feedbackStatus, "input.workerInput.feedbackStatus");
  const feedbackSubmissionId = learningActionSource === "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK"
    ? requireBoundedString(workerInput.feedbackSubmissionId, "input.workerInput.feedbackSubmissionId", 1, 128)
    : requireAbsent(workerInput.feedbackSubmissionId, "input.workerInput.feedbackSubmissionId");
  const feedbackSourceArchiveItemId = learningActionSource === "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK"
    ? requireToken(workerInput.feedbackSourceArchiveItemId, "input.workerInput.feedbackSourceArchiveItemId", "tarch_")
    : requireAbsent(workerInput.feedbackSourceArchiveItemId, "input.workerInput.feedbackSourceArchiveItemId");
  return {
    requestId: requireToken(workerInput.requestId, "input.workerInput.requestId", "tutor_req_"),
    archiveItemId: requireToken(workerInput.archiveItemId, "input.workerInput.archiveItemId", "tarch_"),
    analysisGoal: requireBoundedString(workerInput.analysisGoal, "input.workerInput.analysisGoal", 3, 500),
    questionBankIntent: requireConst(workerInput.questionBankIntent, "GENERATE_PERSONALIZED_CHECK", "input.workerInput.questionBankIntent"),
    status: requireConst(workerInput.status, "IN_PROGRESS", "input.workerInput.status"),
    workerId: requireBoundedString(workerInput.workerId, "input.workerInput.workerId", 1, 128),
    claimExpiresAt: requireIsoString(workerInput.claimExpiresAt, "input.workerInput.claimExpiresAt"),
    sourceArchiveStudentId: requireBoundedString(workerInput.sourceArchiveStudentId, "input.workerInput.sourceArchiveStudentId", 1, 128),
    sourceArchiveMaterial: requireOneOf(workerInput.sourceArchiveMaterial, "input.workerInput.sourceArchiveMaterial", ["HANDOUT", "QUIZ", "PAPER", "HOMEWORK"]),
    learningActionSource,
    packetStatus,
    resultArchiveStatus,
    feedbackStatus,
    feedbackSubmissionId,
    feedbackSourceArchiveItemId,
    renderFormat: requireConst(workerInput.renderFormat, "SAFE_TEXT_BLOCKS", "input.workerInput.renderFormat"),
    blocks,
  };
}

function assertBlocks(blocks, learningActionSource) {
  if (!Array.isArray(blocks) || blocks.length < 1 || blocks.length > 20) {
    throw precheckError("STUDENT_APP_AI_TUTOR_MODEL_PRECHECK_INVALID_BLOCKS", "input.workerInput.blocks must contain 1-20 safe text blocks");
  }
  const seen = new Set();
  return blocks.map((block, index) => {
    rejectLeakedFields(block, `input.workerInput.blocks[${index}]`);
    assertPlainObject(block, `input.workerInput.blocks[${index}]`);
    const blockId = requireBoundedString(block.blockId, `input.workerInput.blocks[${index}].blockId`, 1, 128);
    if (seen.has(blockId)) throw precheckError("STUDENT_APP_AI_TUTOR_MODEL_PRECHECK_DUPLICATE_BLOCK", `${blockId} is duplicated`);
    seen.add(blockId);
    const blockType = requireOneOf(
      block.blockType,
      `input.workerInput.blocks[${index}].blockType`,
      learningActionSource === "PUBLISHED_STUDY_PACKET" ? ["SECTION"] : ["SUMMARY", "GUIDANCE_SECTION"],
    );
    return {
      blockId,
      blockType,
      sectionId: block.sectionId === undefined ? "" : requireBoundedString(block.sectionId, `input.workerInput.blocks[${index}].sectionId`, 0, 128),
      title: requireBoundedString(block.title, `input.workerInput.blocks[${index}].title`, 1, 1200),
      text: requireBoundedString(block.text, `input.workerInput.blocks[${index}].text`, 1, 1200),
      pageHint: block.pageHint === undefined ? "" : requireBoundedString(block.pageHint, `input.workerInput.blocks[${index}].pageHint`, 0, 80),
      sourceBlockRefs: block.sourceBlockRefs === undefined
        ? []
        : uniqueStringArray(block.sourceBlockRefs, `input.workerInput.blocks[${index}].sourceBlockRefs`, 0, 16, 1, 128),
    };
  });
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  requireConst(principal.subjectType, "SERVICE", "input.principal.subjectType");
  requireConst(principal.role, "SERVICE", "input.principal.role");
  requireConst(principal.entryPoint, "AGENT_INTERNAL", "input.principal.entryPoint");
  requireArrayIncludes(principal.scopes, "TEACHING_WRITE", "input.principal.scopes");
  requireArrayIncludes(principal.scopes, "AGENT_COMMAND_SUBMIT", "input.principal.scopes");
  return principal;
}

function assertApproval(approval, workerInput) {
  rejectLeakedFields(approval, "input.approval");
  assertPlainObject(approval, "input.approval");
  return {
    approvalId: requireToken(approval.approvalId, "input.approval.approvalId", "ai_tutor_model_approval_"),
    requestId: requireConst(approval.requestId, workerInput.requestId, "input.approval.requestId"),
    workerId: requireConst(approval.workerId, workerInput.workerId, "input.approval.workerId"),
    approvedByPrincipalId: requireBoundedString(approval.approvedByPrincipalId, "input.approval.approvedByPrincipalId", 1, 128),
    approvedAt: requireIsoString(approval.approvedAt, "input.approval.approvedAt"),
    expiresAt: requireIsoString(approval.expiresAt, "input.approval.expiresAt"),
    allowedModelRoute: requireConst(approval.allowedModelRoute, modelRoute, "input.approval.allowedModelRoute"),
    maxInputBlocks: requireIntegerBetween(approval.maxInputBlocks, "input.approval.maxInputBlocks", workerInput.blocks.length, 20),
    maxPromptTokens: requireIntegerBetween(approval.maxPromptTokens, "input.approval.maxPromptTokens", 200, 4000),
    maxGenerationAttempts: requireIntegerBetween(approval.maxGenerationAttempts, "input.approval.maxGenerationAttempts", 1, 2),
    requiresHumanReviewBeforeResult: requireConst(approval.requiresHumanReviewBeforeResult, true, "input.approval.requiresHumanReviewBeforeResult"),
    queueOnly: requireConst(approval.queueOnly, true, "input.approval.queueOnly"),
  };
}

function assertModelExecutionPolicy(policy, approval) {
  rejectLeakedFields(policy, "input.modelExecutionPolicy");
  assertPlainObject(policy, "input.modelExecutionPolicy");
  return {
    modelRoute: requireConst(policy.modelRoute, modelRoute, "input.modelExecutionPolicy.modelRoute"),
    maxPromptTokens: requireIntegerBetween(policy.maxPromptTokens, "input.modelExecutionPolicy.maxPromptTokens", 200, approval.maxPromptTokens),
    maxGenerationAttempts: requireIntegerBetween(policy.maxGenerationAttempts, "input.modelExecutionPolicy.maxGenerationAttempts", 1, approval.maxGenerationAttempts),
    timeoutMs: requireIntegerBetween(policy.timeoutMs, "input.modelExecutionPolicy.timeoutMs", 1000, 30000),
    safetyMode: requireConst(policy.safetyMode, "STUDENT_TUTOR_SAFE_HELP", "input.modelExecutionPolicy.safetyMode"),
    queueOnly: requireConst(policy.queueOnly, true, "input.modelExecutionPolicy.queueOnly"),
    allowExternalTools: requireConst(policy.allowExternalTools, false, "input.modelExecutionPolicy.allowExternalTools"),
    allowRetrieval: requireConst(policy.allowRetrieval, false, "input.modelExecutionPolicy.allowRetrieval"),
    allowSwarm: requireConst(policy.allowSwarm, false, "input.modelExecutionPolicy.allowSwarm"),
    allowDirectDb: requireConst(policy.allowDirectDb, false, "input.modelExecutionPolicy.allowDirectDb"),
  };
}

function buildPortRequest(normalized) {
  return {
    schemaVersion: inputSchemaVersion,
    precheckInvocationId: normalized.precheckInvocationId,
    idempotencyKey: normalized.idempotencyKey,
    requestId: normalized.workerInput.requestId,
    archiveItemId: normalized.workerInput.archiveItemId,
    workerId: normalized.workerInput.workerId,
    modelRoute,
    approvalId: normalized.approval.approvalId,
    policy: normalized.modelExecutionPolicy,
    safeInput: {
      learningActionSource: normalized.workerInput.learningActionSource,
      renderFormat: "SAFE_TEXT_BLOCKS",
      safeBlockCount: normalized.workerInput.blocks.length,
      blockDigests: normalized.blockDigests,
    },
    evidenceRefs: normalized.evidenceRefs,
    inputHash: normalized.inputHash,
  };
}

function assertPortResult(portResult, normalized) {
  rejectLeakedFields(portResult, "modelExecutionPrecheckPort.result");
  assertPlainObject(portResult, "modelExecutionPrecheckPort.result");
  const precheck = assertPlainObject(portResult.modelExecutionPrecheck, "modelExecutionPrecheckPort.result.modelExecutionPrecheck");
  return {
    precheckId: requireToken(precheck.precheckId, "modelExecutionPrecheckPort.result.modelExecutionPrecheck.precheckId", "ai_tutor_model_precheck_"),
    queueRef: requireToken(precheck.queueRef, "modelExecutionPrecheckPort.result.modelExecutionPrecheck.queueRef", "ai_tutor_model_queue_"),
    modelRoute: requireConst(precheck.modelRoute, modelRoute, "modelExecutionPrecheckPort.result.modelExecutionPrecheck.modelRoute"),
    requestId: requireConst(precheck.requestId, normalized.workerInput.requestId, "modelExecutionPrecheckPort.result.modelExecutionPrecheck.requestId"),
    workerId: requireConst(precheck.workerId, normalized.workerInput.workerId, "modelExecutionPrecheckPort.result.modelExecutionPrecheck.workerId"),
    inputHash: requireConst(precheck.inputHash, normalized.inputHash, "modelExecutionPrecheckPort.result.modelExecutionPrecheck.inputHash"),
    safeBlockCount: requireConst(precheck.safeBlockCount, normalized.workerInput.blocks.length, "modelExecutionPrecheckPort.result.modelExecutionPrecheck.safeBlockCount"),
    status: requireConst(precheck.status, "AI_TUTOR_MODEL_EXECUTION_PRECHECKED_NOT_STARTED", "modelExecutionPrecheckPort.result.modelExecutionPrecheck.status"),
    queueAdmissionOnly: requireConst(precheck.queueAdmissionOnly, true, "modelExecutionPrecheckPort.result.modelExecutionPrecheck.queueAdmissionOnly"),
    modelInferenceStarted: requireConst(precheck.modelInferenceStarted, false, "modelExecutionPrecheckPort.result.modelExecutionPrecheck.modelInferenceStarted"),
    tutorResultRecorded: requireConst(precheck.tutorResultRecorded, false, "modelExecutionPrecheckPort.result.modelExecutionPrecheck.tutorResultRecorded"),
    studentVisiblePublished: requireConst(precheck.studentVisiblePublished, false, "modelExecutionPrecheckPort.result.modelExecutionPrecheck.studentVisiblePublished"),
  };
}

function buildPrecheckRecord(normalized, recordedPrecheck, precheckedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_PORT,
    status: recordedStatus,
    precheckedAt,
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
    requestId: normalized.workerInput.requestId,
    archiveItemId: normalized.workerInput.archiveItemId,
    workerId: normalized.workerInput.workerId,
    approvalId: normalized.approval.approvalId,
    learningActionSource: normalized.workerInput.learningActionSource,
    resultArchiveStatus: normalized.workerInput.resultArchiveStatus,
    feedbackStatus: normalized.workerInput.feedbackStatus,
    feedbackSubmissionId: normalized.workerInput.feedbackSubmissionId,
    feedbackSourceArchiveItemId: normalized.workerInput.feedbackSourceArchiveItemId,
    modelExecutionPrecheck: recordedPrecheck,
    evidenceRefs: normalized.evidenceRefs,
    boundary: {
      sourceWorkerInputVerified: true,
      sourceWorkerStudyPacketInputVerified: normalized.workerInput.learningActionSource === "PUBLISHED_STUDY_PACKET",
      sourceWorkerResultArchiveInputVerified: normalized.workerInput.learningActionSource === "AI_TUTOR_RESULT_ARCHIVE",
      sourceWorkerQuestionBankFeedbackInputVerified: normalized.workerInput.learningActionSource === "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      serviceAgentInternalOnly: true,
      approvalVerified: true,
      modelExecutionQueueAdmissionOnly: true,
      futureModelExecutionApproved: true,
      safeTextBlocksOnly: true,
      safeTextBlockTextSentToPort: false,
      inputHashRecorded: true,
      promptConstructed: false,
      modelInferenceStarted: false,
      tutorAnswerGenerated: false,
      tutoringResultRecorded: false,
      studentVisiblePublished: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      retrievalAllowed: false,
      swarmAllowed: false,
      requiresFutureReviewedGeneration: true,
      requiresFutureResultPersistence: true,
    },
  };
}

function hasWorkerInputEvidence(evidenceRefs, learningActionSource) {
  const requiredFragment = {
    AI_TUTOR_RESULT_ARCHIVE: "worker-result-archive-input",
    PUBLISHED_STUDY_PACKET: "worker-study-packet-input",
    QUESTION_BANK_DRAFT_ANSWER_FEEDBACK: "worker-question-bank-feedback-input",
  }[learningActionSource];
  return evidenceRefs.some((ref) => ref.includes(requiredFragment));
}

function buildResult(record, { idempotentReplay }) {
  return {
    ...record,
    idempotentReplay,
  };
}

function findExistingRecordByIdempotencyKey(filePath, idempotencyKey) {
  if (!fs.existsSync(filePath)) return undefined;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const record = JSON.parse(line);
    if (record.idempotencyKey === idempotencyKey) return record;
  }
  return undefined;
}

function assertReplayMatches(existing, normalized) {
  for (const [field, expected] of Object.entries({
    inputHash: normalized.inputHash,
    requestId: normalized.workerInput.requestId,
    workerId: normalized.workerInput.workerId,
    approvalId: normalized.approval.approvalId,
  })) {
    if (existing[field] !== expected) {
      throw precheckError("STUDENT_APP_AI_TUTOR_MODEL_PRECHECK_IDEMPOTENCY_CONFLICT", `${field} does not match the existing precheck`);
    }
  }
}

function appendRecord(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`);
}

function assertPrecheckPort(port) {
  if (!port || typeof port.recordModelExecutionPrecheck !== "function") {
    throw precheckError("STUDENT_APP_AI_TUTOR_MODEL_PRECHECK_PORT_MISSING", "model execution precheck port is required");
  }
  return port;
}

function rejectLeakedFields(value, label) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectLeakedFields(item, `${label}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (leakedFieldNames.has(key.toLowerCase())) {
      throw precheckError("STUDENT_APP_AI_TUTOR_MODEL_PRECHECK_LEAKED_FIELD", `${label}.${key} is not allowed`);
    }
    rejectLeakedFields(child, `${label}.${key}`);
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw precheckError("STUDENT_APP_AI_TUTOR_MODEL_PRECHECK_INVALID_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw precheckError("STUDENT_APP_AI_TUTOR_MODEL_PRECHECK_CONST_MISMATCH", `${label} must be ${expected}`);
  }
  return expected;
}

function requireAbsent(value, label) {
  if (value !== undefined) {
    throw precheckError("STUDENT_APP_AI_TUTOR_MODEL_PRECHECK_FIELD_NOT_ALLOWED", `${label} is not allowed for this source`);
  }
  return undefined;
}

function requireOneOf(value, label, allowed) {
  if (!allowed.includes(value)) {
    throw precheckError("STUDENT_APP_AI_TUTOR_MODEL_PRECHECK_ENUM_MISMATCH", `${label} is not allowed`);
  }
  return value;
}

function requireToken(value, label, prefix) {
  const text = requireBoundedString(value, label, prefix.length + 1, 220);
  if (!text.startsWith(prefix)) {
    throw precheckError("STUDENT_APP_AI_TUTOR_MODEL_PRECHECK_BAD_TOKEN", `${label} must start with ${prefix}`);
  }
  return text;
}

function requireBoundedString(value, label, minLength, maxLength) {
  if (typeof value !== "string") {
    throw precheckError("STUDENT_APP_AI_TUTOR_MODEL_PRECHECK_INVALID_STRING", `${label} must be a string`);
  }
  const text = value.trim();
  if (text.length < minLength || text.length > maxLength) {
    throw precheckError("STUDENT_APP_AI_TUTOR_MODEL_PRECHECK_STRING_BOUNDS", `${label} length is out of bounds`);
  }
  return text;
}

function requireIsoString(value, label) {
  const text = requireBoundedString(value, label, 10, 80);
  if (Number.isNaN(Date.parse(text))) {
    throw precheckError("STUDENT_APP_AI_TUTOR_MODEL_PRECHECK_INVALID_TIME", `${label} must be a date-time string`);
  }
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw precheckError("STUDENT_APP_AI_TUTOR_MODEL_PRECHECK_INTEGER_BOUNDS", `${label} must be between ${min} and ${max}`);
  }
  return value;
}

function requireArrayIncludes(value, expected, label) {
  if (!Array.isArray(value) || !value.includes(expected)) {
    throw precheckError("STUDENT_APP_AI_TUTOR_MODEL_PRECHECK_MISSING_SCOPE", `${label} must include ${expected}`);
  }
}

function uniqueStringArray(value, label, minItems, maxItems, minLength, maxLength) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw precheckError("STUDENT_APP_AI_TUTOR_MODEL_PRECHECK_ARRAY_BOUNDS", `${label} size is out of bounds`);
  }
  const seen = new Set();
  return value.map((item, index) => {
    const text = requireBoundedString(item, `${label}[${index}]`, minLength, maxLength);
    if (seen.has(text)) throw precheckError("STUDENT_APP_AI_TUTOR_MODEL_PRECHECK_DUPLICATE_VALUE", `${label}[${index}] is duplicated`);
    seen.add(text);
    return text;
  });
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function precheckError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
