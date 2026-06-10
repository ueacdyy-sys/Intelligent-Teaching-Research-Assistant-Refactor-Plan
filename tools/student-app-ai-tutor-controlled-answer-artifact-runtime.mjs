import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RUNTIME_ID =
  "student_app_ai_tutor_controlled_answer_artifact_runtime";
export const STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_PORT =
  "StudentAppAITutorControlledAnswerArtifactPort.recordControlledAnswerArtifact";

const inputSchemaVersion = "2026-06-08.student-app.ai-tutor-controlled-answer-artifact.v1";
const outputSchemaVersion = "2026-06-08.student-app.ai-tutor-controlled-answer-artifact-recorded.v1";
const sourcePrecheckSchemaVersion = "2026-06-08.student-app.ai-tutor-model-execution-prechecked.v1";
const sourcePrecheckRuntimeId = "student_app_ai_tutor_model_execution_precheck_runtime";
const sourceResultArchivePrecheckRuntimeId = "student_app_ai_tutor_result_archive_model_execution_precheck";
const sourcePrecheckPort = "StudentAppAITutorModelExecutionPrecheckPort.recordModelExecutionPrecheck";
const recordedStatus = "STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RECORDED";
const modelRoute = "student_tutor_guided_help_v1";
const defaultArtifactLogPath = "reports/student-command-log/student-app-ai-tutor-controlled-answer-artifact.jsonl";

const leakedFieldNames = new Set([
  "answerkey",
  "correctanswer",
  "expectedanswer",
  "contentref",
  "rawcontent",
  "rawmodeloutput",
  "modeloutput",
  "modelresponse",
  "prompt",
  "prompttext",
  "fullprompt",
  "ragchunks",
  "ocrchunks",
  "resultref",
  "directsql",
  "dburl",
  "internalerror",
  "errormessage",
]);

export async function recordStudentAppAITutorControlledAnswerArtifact(input, options = {}) {
  const recordedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const artifactLogPath = options.artifactLogPath ?? defaultArtifactLogPath;
  const existing = findExistingRecordByIdempotencyKey(artifactLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const port = assertArtifactPort(options.controlledAnswerArtifactPort);
  const portResult = await port.recordControlledAnswerArtifact(buildPortRequest(normalized));
  const artifact = assertPortResult(portResult, normalized);
  const record = buildArtifactRecord(normalized, artifact, recordedAt);
  appendRecord(artifactLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorControlledAnswerArtifact(result) {
  return [
    `Student App AI Tutor controlled answer artifact: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Artifact: ${result.controlledAnswerArtifact.artifactId}`,
    `Sections: ${result.controlledAnswerArtifact.guidanceSections.length}`,
    `Student visible: ${result.boundary.studentVisiblePublished}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const artifactInvocationId = requireToken(input.artifactInvocationId, "input.artifactInvocationId", "ai_tutor_answer_artifact_invocation_");
  const modelExecutionPrecheckReport = assertModelExecutionPrecheckReport(input.modelExecutionPrecheckReport);
  const modelExecutionPrecheckResult = assertModelExecutionPrecheckResult(modelExecutionPrecheckReport);
  const principal = assertPrincipal(input.principal);
  const generationAttempt = assertGenerationAttempt(input.generationAttempt, modelExecutionPrecheckResult);
  const artifactPolicy = assertArtifactPolicy(input.artifactPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 20, 8, 340);
  if (!evidenceRefs.some((ref) => ref.includes("model-execution-precheck"))) {
    throw artifactError("STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_MISSING_PRECHECK_EVIDENCE", "model execution precheck evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("controlled-answer-policy"))) {
    throw artifactError("STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_MISSING_POLICY_EVIDENCE", "controlled answer policy evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const inputHash = hashInput({
    artifactInvocationId,
    precheckId: modelExecutionPrecheckResult.modelExecutionPrecheck.precheckId,
    requestId: modelExecutionPrecheckResult.requestId,
    workerId: modelExecutionPrecheckResult.workerId,
    attemptId: generationAttempt.attemptId,
    artifactPolicy,
  });
  return {
    artifactInvocationId,
    modelExecutionPrecheckReport,
    modelExecutionPrecheckResult,
    principal,
    generationAttempt,
    artifactPolicy,
    evidenceRefs,
    idempotencyKey,
    inputHash,
  };
}

function assertModelExecutionPrecheckReport(report) {
  assertPlainObject(report, "input.modelExecutionPrecheckReport");
  requireConst(report.readiness, "READY", "input.modelExecutionPrecheckReport.readiness");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.modelExecutionPrecheckReport.runtimeSlo.totalErrors");
  if (report.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_MODEL_EXECUTION_PRECHECK") {
    return assertResultArchiveModelExecutionPrecheckReport(report);
  }
  return assertPublishedModelExecutionPrecheckReport(report);
}

function assertPublishedModelExecutionPrecheckReport(report) {
  requireConst(report.workloadType, "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK", "input.modelExecutionPrecheckReport.workloadType");
  requireConst(report.runtime?.runtimeId, sourcePrecheckRuntimeId, "input.modelExecutionPrecheckReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, sourcePrecheckPort, "input.modelExecutionPrecheckReport.runtime.commandPort");
  requireConst(report.runtime?.status, "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECKED", "input.modelExecutionPrecheckReport.runtime.status");
  const invariants = assertPlainObject(report.safetyInvariants, "input.modelExecutionPrecheckReport.safetyInvariants");
  for (const field of ["sourceWorkerStudyPacketInputRequired", "internalServiceOnly", "approvalRequired", "modelExecutionQueueAdmissionOnly", "safeTextBlocksOnly", "inputHashRecorded"]) {
    requireConst(invariants[field], true, `input.modelExecutionPrecheckReport.safetyInvariants.${field}`);
  }
  for (const field of ["promptConstructed", "modelInferenceAllowed", "tutorAnswerGenerated", "tutoringResultRecorded", "studentVisiblePublished", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "swarmAllowed"]) {
    requireConst(invariants[field], false, `input.modelExecutionPrecheckReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertResultArchiveModelExecutionPrecheckReport(report) {
  requireConst(report.runtime?.runtimeId, sourceResultArchivePrecheckRuntimeId, "input.modelExecutionPrecheckReport.runtime.runtimeId");
  requireConst(report.runtime?.sharedRuntimeId, sourcePrecheckRuntimeId, "input.modelExecutionPrecheckReport.runtime.sharedRuntimeId");
  requireConst(report.runtime?.commandPort, sourcePrecheckPort, "input.modelExecutionPrecheckReport.runtime.commandPort");
  requireConst(report.runtime?.status, "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_MODEL_EXECUTION_PRECHECKED", "input.modelExecutionPrecheckReport.runtime.status");
  const invariants = assertPlainObject(report.safetyInvariants, "input.modelExecutionPrecheckReport.safetyInvariants");
  for (const field of ["source0336WorkerResultArchiveInputRequired", "internalServiceOnly", "approvalRequired", "modelExecutionQueueAdmissionOnly", "safeTextBlocksOnly", "inputHashRecorded"]) {
    requireConst(invariants[field], true, `input.modelExecutionPrecheckReport.safetyInvariants.${field}`);
  }
  requireConst(invariants.learningActionSourceRequired, "AI_TUTOR_RESULT_ARCHIVE", "input.modelExecutionPrecheckReport.safetyInvariants.learningActionSourceRequired");
  for (const field of ["promptConstructed", "modelInferenceAllowed", "tutorAnswerGenerated", "tutoringResultRecorded", "studentVisiblePublished", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "externalToolUseAllowed", "retrievalAllowed", "swarmAllowed"]) {
    requireConst(invariants[field], false, `input.modelExecutionPrecheckReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertModelExecutionPrecheckResult(report) {
  const result = report.runtimeProbes?.studentAppAiTutorModelExecutionPrecheck?.result ??
    report.runtimeProbes?.studentAppAiTutorResultArchiveModelExecutionPrecheck?.result;
  const sourceKind = report.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_MODEL_EXECUTION_PRECHECK"
    ? "AI_TUTOR_RESULT_ARCHIVE"
    : "PUBLISHED_STUDY_PACKET";
  rejectLeakedFields(result, "source.modelExecutionPrecheckResult");
  assertPlainObject(result, "source.modelExecutionPrecheckResult");
  requireConst(result.schemaVersion, sourcePrecheckSchemaVersion, "source.precheck.schemaVersion");
  requireConst(result.runtimeId, sourcePrecheckRuntimeId, "source.precheck.runtimeId");
  requireConst(result.commandPort, sourcePrecheckPort, "source.precheck.commandPort");
  requireConst(result.status, "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECKED", "source.precheck.status");
  requireConst(result.learningActionSource ?? "PUBLISHED_STUDY_PACKET", sourceKind, "source.precheck.learningActionSource");
  if (sourceKind === "AI_TUTOR_RESULT_ARCHIVE") {
    requireConst(result.resultArchiveStatus, "READY_FOR_STUDENT_APP_READ", "source.precheck.resultArchiveStatus");
    requireConst(result.boundary?.sourceWorkerResultArchiveInputVerified, true, "source.precheck.boundary.sourceWorkerResultArchiveInputVerified");
    requireConst(result.boundary?.sourceWorkerStudyPacketInputVerified, false, "source.precheck.boundary.sourceWorkerStudyPacketInputVerified");
  }
  requireConst(result.boundary?.modelExecutionQueueAdmissionOnly, true, "source.precheck.boundary.modelExecutionQueueAdmissionOnly");
  requireConst(result.boundary?.safeTextBlockTextSentToPort, false, "source.precheck.boundary.safeTextBlockTextSentToPort");
  requireConst(result.boundary?.modelInferenceStarted, false, "source.precheck.boundary.modelInferenceStarted");
  requireConst(result.boundary?.tutorAnswerGenerated, false, "source.precheck.boundary.tutorAnswerGenerated");
  requireConst(result.boundary?.tutoringResultRecorded, false, "source.precheck.boundary.tutoringResultRecorded");
  requireConst(result.boundary?.studentVisiblePublished, false, "source.precheck.boundary.studentVisiblePublished");
  const precheck = assertPlainObject(result.modelExecutionPrecheck, "source.precheck.modelExecutionPrecheck");
  return {
    ...result,
    requestId: requireToken(result.requestId, "source.precheck.requestId", "tutor_req_"),
    archiveItemId: requireToken(result.archiveItemId, "source.precheck.archiveItemId", "tarch_"),
    workerId: requireBoundedString(result.workerId, "source.precheck.workerId", 1, 128),
    approvalId: requireToken(result.approvalId, "source.precheck.approvalId", "ai_tutor_model_approval_"),
    inputHash: requireBoundedString(result.inputHash, "source.precheck.inputHash", 32, 128),
    modelExecutionPrecheck: {
      precheckId: requireToken(precheck.precheckId, "source.precheck.modelExecutionPrecheck.precheckId", "ai_tutor_model_precheck_"),
      queueRef: requireToken(precheck.queueRef, "source.precheck.modelExecutionPrecheck.queueRef", "ai_tutor_model_queue_"),
      modelRoute: requireConst(precheck.modelRoute, modelRoute, "source.precheck.modelExecutionPrecheck.modelRoute"),
      requestId: requireConst(precheck.requestId, result.requestId, "source.precheck.modelExecutionPrecheck.requestId"),
      workerId: requireConst(precheck.workerId, result.workerId, "source.precheck.modelExecutionPrecheck.workerId"),
      inputHash: requireConst(precheck.inputHash, result.inputHash, "source.precheck.modelExecutionPrecheck.inputHash"),
      safeBlockCount: requireIntegerBetween(precheck.safeBlockCount, "source.precheck.modelExecutionPrecheck.safeBlockCount", 1, 20),
      status: requireConst(precheck.status, "AI_TUTOR_MODEL_EXECUTION_PRECHECKED_NOT_STARTED", "source.precheck.modelExecutionPrecheck.status"),
      queueAdmissionOnly: requireConst(precheck.queueAdmissionOnly, true, "source.precheck.modelExecutionPrecheck.queueAdmissionOnly"),
      modelInferenceStarted: requireConst(precheck.modelInferenceStarted, false, "source.precheck.modelExecutionPrecheck.modelInferenceStarted"),
      tutorResultRecorded: requireConst(precheck.tutorResultRecorded, false, "source.precheck.modelExecutionPrecheck.tutorResultRecorded"),
      studentVisiblePublished: requireConst(precheck.studentVisiblePublished, false, "source.precheck.modelExecutionPrecheck.studentVisiblePublished"),
    },
  };
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

function assertGenerationAttempt(attempt, source) {
  rejectLeakedFields(attempt, "input.generationAttempt");
  assertPlainObject(attempt, "input.generationAttempt");
  return {
    attemptId: requireToken(attempt.attemptId, "input.generationAttempt.attemptId", "ai_tutor_answer_attempt_"),
    precheckId: requireConst(attempt.precheckId, source.modelExecutionPrecheck.precheckId, "input.generationAttempt.precheckId"),
    queueRef: requireConst(attempt.queueRef, source.modelExecutionPrecheck.queueRef, "input.generationAttempt.queueRef"),
    requestId: requireConst(attempt.requestId, source.requestId, "input.generationAttempt.requestId"),
    workerId: requireConst(attempt.workerId, source.workerId, "input.generationAttempt.workerId"),
    modelRoute: requireConst(attempt.modelRoute, modelRoute, "input.generationAttempt.modelRoute"),
    inputHash: requireConst(attempt.inputHash, source.inputHash, "input.generationAttempt.inputHash"),
    attemptNumber: requireIntegerBetween(attempt.attemptNumber, "input.generationAttempt.attemptNumber", 1, 2),
    startedAt: requireIsoString(attempt.startedAt, "input.generationAttempt.startedAt"),
    completedAt: requireIsoString(attempt.completedAt, "input.generationAttempt.completedAt"),
    rawOutputCaptured: requireConst(attempt.rawOutputCaptured, false, "input.generationAttempt.rawOutputCaptured"),
    promptStored: requireConst(attempt.promptStored, false, "input.generationAttempt.promptStored"),
  };
}

function assertArtifactPolicy(policy) {
  rejectLeakedFields(policy, "input.artifactPolicy");
  assertPlainObject(policy, "input.artifactPolicy");
  return {
    reviewRequiredBeforeResult: requireConst(policy.reviewRequiredBeforeResult, true, "input.artifactPolicy.reviewRequiredBeforeResult"),
    resultPersistenceAllowed: requireConst(policy.resultPersistenceAllowed, false, "input.artifactPolicy.resultPersistenceAllowed"),
    studentVisibleAllowed: requireConst(policy.studentVisibleAllowed, false, "input.artifactPolicy.studentVisibleAllowed"),
    requireSourceBlockRefs: requireConst(policy.requireSourceBlockRefs, true, "input.artifactPolicy.requireSourceBlockRefs"),
    maxGuidanceSections: requireIntegerBetween(policy.maxGuidanceSections, "input.artifactPolicy.maxGuidanceSections", 1, 5),
    maxSectionChars: requireIntegerBetween(policy.maxSectionChars, "input.artifactPolicy.maxSectionChars", 120, 1200),
  };
}

function buildPortRequest(normalized) {
  const source = normalized.modelExecutionPrecheckResult;
  return {
    schemaVersion: inputSchemaVersion,
    artifactInvocationId: normalized.artifactInvocationId,
    idempotencyKey: normalized.idempotencyKey,
    requestId: source.requestId,
    archiveItemId: source.archiveItemId,
    workerId: source.workerId,
    precheckId: source.modelExecutionPrecheck.precheckId,
    queueRef: source.modelExecutionPrecheck.queueRef,
    modelRoute,
    inputHash: source.inputHash,
    attemptId: normalized.generationAttempt.attemptId,
    artifactPolicy: normalized.artifactPolicy,
    evidenceRefs: normalized.evidenceRefs,
  };
}

function assertPortResult(portResult, normalized) {
  rejectLeakedFields(portResult, "controlledAnswerArtifactPort.result");
  assertPlainObject(portResult, "controlledAnswerArtifactPort.result");
  const artifact = assertPlainObject(portResult.controlledAnswerArtifact, "controlledAnswerArtifactPort.result.controlledAnswerArtifact");
  const source = normalized.modelExecutionPrecheckResult;
  const sections = assertGuidanceSections(artifact.guidanceSections, normalized.artifactPolicy);
  return {
    artifactId: requireToken(artifact.artifactId, "controlledAnswerArtifactPort.result.controlledAnswerArtifact.artifactId", "ai_tutor_answer_artifact_"),
    requestId: requireConst(artifact.requestId, source.requestId, "controlledAnswerArtifactPort.result.controlledAnswerArtifact.requestId"),
    workerId: requireConst(artifact.workerId, source.workerId, "controlledAnswerArtifactPort.result.controlledAnswerArtifact.workerId"),
    precheckId: requireConst(artifact.precheckId, source.modelExecutionPrecheck.precheckId, "controlledAnswerArtifactPort.result.controlledAnswerArtifact.precheckId"),
    queueRef: requireConst(artifact.queueRef, source.modelExecutionPrecheck.queueRef, "controlledAnswerArtifactPort.result.controlledAnswerArtifact.queueRef"),
    status: requireConst(artifact.status, "AI_TUTOR_CONTROLLED_ANSWER_RECORDED_NOT_REVIEWED", "controlledAnswerArtifactPort.result.controlledAnswerArtifact.status"),
    reviewState: requireConst(artifact.reviewState, "PENDING_HUMAN_REVIEW", "controlledAnswerArtifactPort.result.controlledAnswerArtifact.reviewState"),
    summary: requireBoundedString(artifact.summary, "controlledAnswerArtifactPort.result.controlledAnswerArtifact.summary", 3, 500),
    guidanceSections: sections,
    safetyLabels: uniqueStringArray(artifact.safetyLabels, "controlledAnswerArtifactPort.result.controlledAnswerArtifact.safetyLabels", 1, 8, 3, 80),
    resultPersistenceAllowed: requireConst(artifact.resultPersistenceAllowed, false, "controlledAnswerArtifactPort.result.controlledAnswerArtifact.resultPersistenceAllowed"),
    tutoringResultRecorded: requireConst(artifact.tutoringResultRecorded, false, "controlledAnswerArtifactPort.result.controlledAnswerArtifact.tutoringResultRecorded"),
    studentVisiblePublished: requireConst(artifact.studentVisiblePublished, false, "controlledAnswerArtifactPort.result.controlledAnswerArtifact.studentVisiblePublished"),
  };
}

function assertGuidanceSections(sections, policy) {
  if (!Array.isArray(sections) || sections.length < 1 || sections.length > policy.maxGuidanceSections) {
    throw artifactError("STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_INVALID_SECTIONS", "controlled answer sections are out of bounds");
  }
  const seen = new Set();
  return sections.map((section, index) => {
    rejectLeakedFields(section, `controlledAnswerArtifact.sections[${index}]`);
    assertPlainObject(section, `controlledAnswerArtifact.sections[${index}]`);
    const sectionId = requireToken(section.sectionId, `controlledAnswerArtifact.sections[${index}].sectionId`, "ai_tutor_answer_section_");
    if (seen.has(sectionId)) throw artifactError("STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_DUPLICATE_SECTION", `${sectionId} is duplicated`);
    seen.add(sectionId);
    const sourceBlockRefs = uniqueStringArray(section.sourceBlockRefs, `controlledAnswerArtifact.sections[${index}].sourceBlockRefs`, 1, 6, 6, 160);
    return {
      sectionId,
      title: requireBoundedString(section.title, `controlledAnswerArtifact.sections[${index}].title`, 1, 120),
      text: requireBoundedString(section.text, `controlledAnswerArtifact.sections[${index}].text`, 3, policy.maxSectionChars),
      sourceBlockRefs,
    };
  });
}

function buildArtifactRecord(normalized, artifact, recordedAt) {
  const source = normalized.modelExecutionPrecheckResult;
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_PORT,
    status: recordedStatus,
    recordedAt,
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
    requestId: source.requestId,
    archiveItemId: source.archiveItemId,
    workerId: source.workerId,
    precheckId: source.modelExecutionPrecheck.precheckId,
    queueRef: source.modelExecutionPrecheck.queueRef,
    learningActionSource: source.learningActionSource ?? "PUBLISHED_STUDY_PACKET",
    resultArchiveStatus: source.resultArchiveStatus,
    controlledAnswerArtifact: artifact,
    evidenceRefs: normalized.evidenceRefs,
    boundary: {
      sourceModelExecutionPrecheckRequired: true,
      internalServiceOnly: true,
      controlledAnswerArtifactRecorded: true,
      humanReviewRequiredBeforeResult: true,
      rawModelOutputExcluded: true,
      promptExcluded: true,
      answerKeyExcluded: true,
      tutoringResultRecorded: false,
      resultPersistenceAllowed: false,
      studentVisiblePublished: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      retrievalAllowed: false,
      swarmAllowed: false,
      requiresFutureHumanReview: true,
      requiresFutureResultPersistence: true,
    },
  };
}

function buildResult(record, { idempotentReplay }) {
  return { ...record, idempotentReplay };
}

function findExistingRecordByIdempotencyKey(filePath, idempotencyKey) {
  if (!fs.existsSync(filePath)) return undefined;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean)) {
    const record = JSON.parse(line);
    if (record.idempotencyKey === idempotencyKey) return record;
  }
  return undefined;
}

function assertReplayMatches(existing, normalized) {
  for (const [field, expected] of Object.entries({
    inputHash: normalized.inputHash,
    requestId: normalized.modelExecutionPrecheckResult.requestId,
    workerId: normalized.modelExecutionPrecheckResult.workerId,
    precheckId: normalized.modelExecutionPrecheckResult.modelExecutionPrecheck.precheckId,
  })) {
    if (existing[field] !== expected) {
      throw artifactError("STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_IDEMPOTENCY_CONFLICT", `${field} does not match the existing artifact`);
    }
  }
}

function appendRecord(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`);
}

function assertArtifactPort(port) {
  if (!port || typeof port.recordControlledAnswerArtifact !== "function") {
    throw artifactError("STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_PORT_MISSING", "controlled answer artifact port is required");
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
      throw artifactError("STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_LEAKED_FIELD", `${label}.${key} is not allowed`);
    }
    rejectLeakedFields(child, `${label}.${key}`);
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw artifactError("STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_INVALID_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireConst(value, expected, label) {
  if (value !== expected) throw artifactError("STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_CONST_MISMATCH", `${label} must be ${expected}`);
  return expected;
}

function requireToken(value, label, prefix) {
  const text = requireBoundedString(value, label, prefix.length + 1, 220);
  if (!text.startsWith(prefix)) throw artifactError("STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_BAD_TOKEN", `${label} must start with ${prefix}`);
  return text;
}

function requireBoundedString(value, label, minLength, maxLength) {
  if (typeof value !== "string") throw artifactError("STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_INVALID_STRING", `${label} must be a string`);
  const text = value.trim();
  if (text.length < minLength || text.length > maxLength) {
    throw artifactError("STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_STRING_BOUNDS", `${label} length is out of bounds`);
  }
  return text;
}

function requireIsoString(value, label) {
  const text = requireBoundedString(value, label, 10, 80);
  if (Number.isNaN(Date.parse(text))) throw artifactError("STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_INVALID_TIME", `${label} must be a date-time string`);
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw artifactError("STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_INTEGER_BOUNDS", `${label} must be between ${min} and ${max}`);
  }
  return value;
}

function requireArrayIncludes(value, expected, label) {
  if (!Array.isArray(value) || !value.includes(expected)) {
    throw artifactError("STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_MISSING_SCOPE", `${label} must include ${expected}`);
  }
}

function uniqueStringArray(value, label, minItems, maxItems, minLength, maxLength) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw artifactError("STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARRAY_BOUNDS", `${label} size is out of bounds`);
  }
  const seen = new Set();
  return value.map((item, index) => {
    const text = requireBoundedString(item, `${label}[${index}]`, minLength, maxLength);
    if (seen.has(text)) throw artifactError("STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_DUPLICATE_VALUE", `${label}[${index}] is duplicated`);
    seen.add(text);
    return text;
  });
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function artifactError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
