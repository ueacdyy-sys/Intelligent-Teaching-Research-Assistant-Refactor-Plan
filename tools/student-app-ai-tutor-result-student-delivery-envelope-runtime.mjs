import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_RUNTIME_ID =
  "student_app_ai_tutor_result_student_delivery_envelope_runtime";
export const STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_PORT =
  "StudentAppAITutorResultStudentDeliveryEnvelopePort.recordResultStudentDeliveryEnvelope";

const inputSchemaVersion = "2026-06-08.student-app.ai-tutor-result-student-delivery-envelope.v1";
const outputSchemaVersion = "2026-06-08.student-app.ai-tutor-result-student-delivery-envelope-recorded.v1";
const visibilityReviewRuntimeId = "student_app_ai_tutor_result_student_visibility_review_runtime";
const resultArchiveVisibilityReviewRuntimeId = "student_app_ai_tutor_result_archive_student_visibility_review";
const visibilityReviewPort = "StudentAppAITutorResultStudentVisibilityReviewPort.recordResultStudentVisibilityReview";
const visibilityReviewStatus = "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_RECORDED";
const resultArchiveVisibilityReviewStatus = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_VISIBILITY_REVIEW_RECORDED";
const controlledArtifactRuntimeId = "student_app_ai_tutor_controlled_answer_artifact_runtime";
const resultArchiveControlledArtifactRuntimeId = "student_app_ai_tutor_result_archive_controlled_answer_artifact";
const controlledArtifactPort = "StudentAppAITutorControlledAnswerArtifactPort.recordControlledAnswerArtifact";
const resultArchiveSource = "AI_TUTOR_RESULT_ARCHIVE";
const resultArchiveReadyStatus = "READY_FOR_STUDENT_APP_READ";
const readyStatus = "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED";
const defaultCommandLogPath =
  "reports/student-command-log/student-app-ai-tutor-result-student-delivery-envelope.jsonl";

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
  "directsql",
  "dburl",
  "internalerror",
  "errormessage",
  "resultref",
  "databasewriteresult",
  "studentarchivepersistenceresult",
]);
const unsafeTextPattern = /(raw model|prompt|answer key|correct answer|expected answer|contentref|resultref|internal error|标准答案|参考答案|正确答案|原始模型|提示词)/iu;

export async function recordStudentAppAITutorResultStudentDeliveryEnvelope(input, options = {}) {
  const deliveredAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const commandLogPath = options.commandLogPath ?? defaultCommandLogPath;
  const existing = findExistingRecordByIdempotencyKey(commandLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const port = assertDeliveryPort(options.resultStudentDeliveryEnvelopePort);
  const portRequest = buildPortRequest(normalized);
  const portResult = await port.recordResultStudentDeliveryEnvelope(portRequest);
  const deliveryEnvelope = assertPortResult(portResult, normalized);
  const record = buildRecord(normalized, portRequest, deliveryEnvelope, deliveredAt);
  appendRecord(commandLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorResultStudentDeliveryEnvelope(result) {
  return [
    `Student App AI Tutor result student delivery envelope: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Envelope: ${result.studentResultDeliveryEnvelope.envelopeId}`,
    `Student visible: ${result.boundary.studentVisiblePublished}`,
    `Persisted: ${result.boundary.durableStudentArchivePersistenceStarted}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const deliveryInvocationId = requireToken(input.deliveryInvocationId, "input.deliveryInvocationId", "ai_tutor_result_student_delivery_");
  const principal = assertDeliveryPrincipal(input.principal);
  const visibilityReport = assertVisibilityReviewReport(input.studentVisibilityReviewReport);
  const visibilityRecord = assertVisibilityReviewRecord(visibilityReport);
  const artifactReport = assertControlledAnswerArtifactReport(input.controlledAnswerArtifactReport);
  const controlledArtifact = assertControlledAnswerArtifact(artifactReport, visibilityRecord);
  const deliveryRequest = assertDeliveryRequest(input.studentDeliveryRequest, visibilityRecord);
  const policy = assertDeliveryPolicy(input.studentDeliveryPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 24, 8, 360);
  for (const required of ["student-visibility-review", "controlled-answer-artifact"]) {
    if (!evidenceRefs.some((ref) => ref.includes(required))) {
      throw deliveryError("STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_MISSING_EVIDENCE", `${required} evidence ref is required`);
    }
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 420);
  const inputHash = hashInput({
    deliveryInvocationId,
    principalId: principal.principalId,
    visibilityReviewRecordId: visibilityRecord.recordId,
    controlledAnswerArtifactId: controlledArtifact.artifactId,
    guidanceSectionsHash: visibilityRecord.guidanceSectionsHash,
    deliveryRequest,
    policy,
  });
  return { deliveryInvocationId, principal, visibilityRecord, controlledArtifact, deliveryRequest, policy, evidenceRefs, idempotencyKey, inputHash };
}

function assertDeliveryPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  requireConst(principal.subjectType, "SERVICE", "input.principal.subjectType");
  requireConst(principal.role, "SERVICE", "input.principal.role");
  requireConst(principal.entryPoint, "STUDENT_DELIVERY_RUNTIME", "input.principal.entryPoint");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 24, 3, 80);
  for (const scope of ["TEACHING_READ", "STUDENT_DELIVERY_ENVELOPE", "STUDENT_APP_DELIVERY"]) requireArrayIncludes(scopes, scope, "input.principal.scopes");
  return {
    principalId: requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128),
    subjectType: "SERVICE",
    role: "SERVICE",
    entryPoint: "STUDENT_DELIVERY_RUNTIME",
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 160),
    scopes,
  };
}

function assertVisibilityReviewReport(report) {
  assertPlainObject(report, "input.studentVisibilityReviewReport");
  requireConst(report.readiness, "READY", "input.studentVisibilityReviewReport.readiness");
  if (report.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_VISIBILITY_REVIEW") {
    return assertResultArchiveVisibilityReviewReport(report);
  }
  return assertPublishedVisibilityReviewReport(report);
}

function assertPublishedVisibilityReviewReport(report) {
  requireConst(report.workloadType, "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW", "input.studentVisibilityReviewReport.workloadType");
  requireConst(report.runtime?.runtimeId, visibilityReviewRuntimeId, "input.studentVisibilityReviewReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, visibilityReviewPort, "input.studentVisibilityReviewReport.runtime.commandPort");
  requireConst(report.runtime?.status, visibilityReviewStatus, "input.studentVisibilityReviewReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.studentVisibilityReviewReport.runtimeSlo.totalErrors");
  const invariants = assertPlainObject(report.safetyInvariants, "input.studentVisibilityReviewReport.safetyInvariants");
  for (const field of ["reviewedResultPersistenceRequired", "humanStudentVisibilityReviewRequired", "approvedForFutureStudentDelivery"]) {
    requireConst(invariants[field], true, `input.studentVisibilityReviewReport.safetyInvariants.${field}`);
  }
  for (const field of ["studentVisiblePublished", "studentDeliveryEnvelopeCreated", "guidanceTextSentToPort", "rawResultRefSentToPort", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "externalToolUseAllowed", "retrievalAllowed", "localToolMutationAllowed", "swarmAllowed"]) {
    requireConst(invariants[field], false, `input.studentVisibilityReviewReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertResultArchiveVisibilityReviewReport(report) {
  requireConst(report.runtime?.runtimeId, resultArchiveVisibilityReviewRuntimeId, "input.studentVisibilityReviewReport.runtime.runtimeId");
  requireConst(report.runtime?.sharedRuntimeId, visibilityReviewRuntimeId, "input.studentVisibilityReviewReport.runtime.sharedRuntimeId");
  requireConst(report.runtime?.commandPort, visibilityReviewPort, "input.studentVisibilityReviewReport.runtime.commandPort");
  requireConst(report.runtime?.status, resultArchiveVisibilityReviewStatus, "input.studentVisibilityReviewReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.studentVisibilityReviewReport.runtimeSlo.totalErrors");
  const invariants = assertPlainObject(report.safetyInvariants, "input.studentVisibilityReviewReport.safetyInvariants");
  for (const field of ["source0340ResultArchiveReviewedResultPersistenceRequired", "humanStudentVisibilityReviewRequired", "approvedForFutureStudentDelivery"]) {
    requireConst(invariants[field], true, `input.studentVisibilityReviewReport.safetyInvariants.${field}`);
  }
  requireConst(invariants.learningActionSourceRequired, resultArchiveSource, "input.studentVisibilityReviewReport.safetyInvariants.learningActionSourceRequired");
  requireConst(invariants.resultArchiveStatusRequired, resultArchiveReadyStatus, "input.studentVisibilityReviewReport.safetyInvariants.resultArchiveStatusRequired");
  for (const field of ["studentVisiblePublished", "studentDeliveryEnvelopeCreated", "guidanceTextSentToPort", "rawResultRefSentToPort", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "externalToolUseAllowed", "retrievalAllowed", "localToolMutationAllowed", "swarmAllowed"]) {
    requireConst(invariants[field], false, `input.studentVisibilityReviewReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertVisibilityReviewRecord(report) {
  const isResultArchive = report.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_VISIBILITY_REVIEW";
  const result = report.runtimeProbes?.studentAppAiTutorResultStudentVisibilityReview?.result ??
    report.runtimeProbes?.studentAppAiTutorResultArchiveStudentVisibilityReview?.result;
  assertPlainObject(result, "source.studentVisibilityReview.result");
  requireConst(result.runtimeId, visibilityReviewRuntimeId, "source.studentVisibilityReview.runtimeId");
  requireConst(result.commandPort, visibilityReviewPort, "source.studentVisibilityReview.commandPort");
  requireConst(result.status, visibilityReviewStatus, "source.studentVisibilityReview.status");
  requireConst(result.boundary?.approvedForFutureStudentDelivery, true, "source.studentVisibilityReview.boundary.approvedForFutureStudentDelivery");
  requireConst(result.boundary?.studentVisiblePublished, false, "source.studentVisibilityReview.boundary.studentVisiblePublished");
  requireConst(result.boundary?.studentDeliveryEnvelopeCreated, false, "source.studentVisibilityReview.boundary.studentDeliveryEnvelopeCreated");
  requireConst(result.boundary?.futureStudentDeliveryRequiresSeparateRuntime, true, "source.studentVisibilityReview.boundary.futureStudentDeliveryRequiresSeparateRuntime");
  const source = assertPlainObject(result.sourceReviewedResult, "source.studentVisibilityReview.sourceReviewedResult");
  const review = assertPlainObject(result.studentVisibilityReview, "source.studentVisibilityReview.studentVisibilityReview");
  requireConst(review.status, "AI_TUTOR_RESULT_STUDENT_VISIBILITY_APPROVED_NOT_DELIVERED", "source.studentVisibilityReview.review.status");
  requireConst(review.decision, "APPROVE_FOR_STUDENT_DELIVERY_RUNTIME", "source.studentVisibilityReview.review.decision");
  if (isResultArchive) {
    requireConst(source.learningActionSource, resultArchiveSource, "source.studentVisibilityReview.source.learningActionSource");
    requireConst(source.resultArchiveStatus, resultArchiveReadyStatus, "source.studentVisibilityReview.source.resultArchiveStatus");
  }
  return {
    recordId: requireBoundedString(result.recordId, "source.studentVisibilityReview.recordId", 1, 260),
    reviewId: requireToken(review.reviewId, "source.studentVisibilityReview.review.reviewId", "ai_tutor_result_visibility_review_"),
    persistenceRecordId: requireBoundedString(source.persistenceRecordId, "source.studentVisibilityReview.source.persistenceRecordId", 1, 260),
    sourceReviewId: requireToken(source.reviewId, "source.studentVisibilityReview.source.reviewId", "ai_tutor_answer_review_gate_"),
    requestId: requireToken(source.requestId, "source.studentVisibilityReview.source.requestId", "tutor_req_"),
    archiveItemId: requireToken(source.archiveItemId, "source.studentVisibilityReview.source.archiveItemId", "tarch_"),
    artifactId: requireToken(source.artifactId, "source.studentVisibilityReview.source.artifactId", "ai_tutor_answer_artifact_"),
    guidanceSectionsHash: requireHex(source.guidanceSectionsHash, "source.studentVisibilityReview.source.guidanceSectionsHash"),
    resultRefHash: requireHex(source.resultRefHash, "source.studentVisibilityReview.source.resultRefHash"),
    learningActionSource: source.learningActionSource,
    resultArchiveStatus: source.resultArchiveStatus,
  };
}

function assertControlledAnswerArtifactReport(report, visibilityRecord) {
  assertPlainObject(report, "input.controlledAnswerArtifactReport");
  requireConst(report.readiness, "READY", "input.controlledAnswerArtifactReport.readiness");
  if (report.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_CONTROLLED_ANSWER_ARTIFACT") {
    return assertResultArchiveControlledAnswerArtifactReport(report);
  }
  return assertPublishedControlledAnswerArtifactReport(report);
}

function assertPublishedControlledAnswerArtifactReport(report) {
  requireConst(report.workloadType, "STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT", "input.controlledAnswerArtifactReport.workloadType");
  requireConst(report.runtime?.runtimeId, controlledArtifactRuntimeId, "input.controlledAnswerArtifactReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, controlledArtifactPort, "input.controlledAnswerArtifactReport.runtime.commandPort");
  requireConst(report.runtime?.status, "STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RECORDED", "input.controlledAnswerArtifactReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.controlledAnswerArtifactReport.runtimeSlo.totalErrors");
  const invariants = assertPlainObject(report.safetyInvariants, "input.controlledAnswerArtifactReport.safetyInvariants");
  for (const field of ["controlledAnswerArtifactRecorded", "rawModelOutputExcluded", "promptExcluded", "answerKeyExcluded"]) {
    requireConst(invariants[field], true, `input.controlledAnswerArtifactReport.safetyInvariants.${field}`);
  }
  for (const field of ["studentVisiblePublished", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "externalToolUseAllowed", "retrievalAllowed", "swarmAllowed"]) {
    requireConst(invariants[field], false, `input.controlledAnswerArtifactReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertResultArchiveControlledAnswerArtifactReport(report) {
  requireConst(report.runtime?.runtimeId, resultArchiveControlledArtifactRuntimeId, "input.controlledAnswerArtifactReport.runtime.runtimeId");
  requireConst(report.runtime?.sharedRuntimeId, controlledArtifactRuntimeId, "input.controlledAnswerArtifactReport.runtime.sharedRuntimeId");
  requireConst(report.runtime?.commandPort, controlledArtifactPort, "input.controlledAnswerArtifactReport.runtime.commandPort");
  requireConst(report.runtime?.status, "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_CONTROLLED_ANSWER_ARTIFACT_RECORDED", "input.controlledAnswerArtifactReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.controlledAnswerArtifactReport.runtimeSlo.totalErrors");
  const invariants = assertPlainObject(report.safetyInvariants, "input.controlledAnswerArtifactReport.safetyInvariants");
  for (const field of ["source0337ResultArchiveModelPrecheckRequired", "controlledAnswerArtifactRecorded", "rawModelOutputExcluded", "promptExcluded", "answerKeyExcluded"]) {
    requireConst(invariants[field], true, `input.controlledAnswerArtifactReport.safetyInvariants.${field}`);
  }
  requireConst(invariants.learningActionSourceRequired, resultArchiveSource, "input.controlledAnswerArtifactReport.safetyInvariants.learningActionSourceRequired");
  for (const field of ["studentVisiblePublished", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "externalToolUseAllowed", "retrievalAllowed", "swarmAllowed"]) {
    requireConst(invariants[field], false, `input.controlledAnswerArtifactReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertControlledAnswerArtifact(report, visibilityRecord) {
  const result = report.runtimeProbes?.studentAppAiTutorControlledAnswerArtifact?.result ??
    report.runtimeProbes?.studentAppAiTutorResultArchiveControlledAnswerArtifact?.result;
  assertPlainObject(result, "source.controlledAnswerArtifact.result");
  requireConst(result.runtimeId, controlledArtifactRuntimeId, "source.controlledAnswerArtifact.runtimeId");
  requireConst(result.requestId, visibilityRecord.requestId, "source.controlledAnswerArtifact.requestId");
  requireConst(result.archiveItemId, visibilityRecord.archiveItemId, "source.controlledAnswerArtifact.archiveItemId");
  if (visibilityRecord.learningActionSource === resultArchiveSource) {
    requireConst(result.learningActionSource, resultArchiveSource, "source.controlledAnswerArtifact.learningActionSource");
    requireConst(result.resultArchiveStatus, resultArchiveReadyStatus, "source.controlledAnswerArtifact.resultArchiveStatus");
  }
  const artifact = assertPlainObject(result.controlledAnswerArtifact, "source.controlledAnswerArtifact.artifact");
  requireConst(artifact.artifactId, visibilityRecord.artifactId, "source.controlledAnswerArtifact.artifactId");
  requireConst(artifact.status, "AI_TUTOR_CONTROLLED_ANSWER_RECORDED_NOT_REVIEWED", "source.controlledAnswerArtifact.status");
  requireConst(artifact.studentVisiblePublished, false, "source.controlledAnswerArtifact.studentVisiblePublished");
  requireConst(artifact.resultPersistenceAllowed, false, "source.controlledAnswerArtifact.resultPersistenceAllowed");
  const sections = assertGuidanceSections(artifact.guidanceSections);
  const guidanceSectionsHash = hashGuidanceSections(sections);
  requireConst(guidanceSectionsHash, visibilityRecord.guidanceSectionsHash, "source.controlledAnswerArtifact.guidanceSectionsHash");
  return {
    artifactId: artifact.artifactId,
    requestId: visibilityRecord.requestId,
    archiveItemId: visibilityRecord.archiveItemId,
    summary: requireSafeText(artifact.summary, "source.controlledAnswerArtifact.summary", 3, 500),
    guidanceSections: sections,
    guidanceSectionsHash,
    safetyLabels: uniqueStringArray(artifact.safetyLabels, "source.controlledAnswerArtifact.safetyLabels", 1, 8, 3, 80),
    learningActionSource: result.learningActionSource,
    resultArchiveStatus: result.resultArchiveStatus,
  };
}

function assertGuidanceSections(sections) {
  if (!Array.isArray(sections) || sections.length < 1 || sections.length > 5) {
    throw deliveryError("STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_INVALID_SECTIONS", "safe guidance sections are out of bounds");
  }
  const seen = new Set();
  return sections.map((section, index) => {
    assertPlainObject(section, `source.controlledAnswerArtifact.guidanceSections[${index}]`);
    const sectionId = requireToken(section.sectionId, `source.controlledAnswerArtifact.guidanceSections[${index}].sectionId`, "ai_tutor_answer_section_");
    if (seen.has(sectionId)) throw deliveryError("STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_DUPLICATE_SECTION", `${sectionId} is duplicated`);
    seen.add(sectionId);
    return {
      sectionId,
      title: requireSafeText(section.title, `source.controlledAnswerArtifact.guidanceSections[${index}].title`, 1, 120),
      text: requireSafeText(section.text, `source.controlledAnswerArtifact.guidanceSections[${index}].text`, 3, 1200),
      sourceBlockRefs: uniqueStringArray(section.sourceBlockRefs, `source.controlledAnswerArtifact.guidanceSections[${index}].sourceBlockRefs`, 1, 6, 6, 160),
    };
  });
}

function assertDeliveryRequest(request, visibilityRecord) {
  assertPlainObject(request, "input.studentDeliveryRequest");
  requireConst(request.deliveryMode, "STUDENT_APP_RENDERABLE_AI_TUTOR_RESULT_ENVELOPE", "input.studentDeliveryRequest.deliveryMode");
  requireConst(request.channel, "STUDENT_APP", "input.studentDeliveryRequest.channel");
  requireConst(request.audienceKind, "STUDENT_APP_LEARNING_SUPPORT", "input.studentDeliveryRequest.audienceKind");
  requireConst(request.visibilityState, "STUDENT_VISIBLE_AI_TUTOR_RESULT_DELIVERY_ENVELOPE_NOT_ARCHIVED", "input.studentDeliveryRequest.visibilityState");
  requireConst(request.studentVisibilityReviewRecordId, visibilityRecord.recordId, "input.studentDeliveryRequest.studentVisibilityReviewRecordId");
  requireConst(request.studentVisibilityReviewId, visibilityRecord.reviewId, "input.studentDeliveryRequest.studentVisibilityReviewId");
  requireConst(request.persistenceRecordId, visibilityRecord.persistenceRecordId, "input.studentDeliveryRequest.persistenceRecordId");
  requireConst(request.artifactId, visibilityRecord.artifactId, "input.studentDeliveryRequest.artifactId");
  requireConst(request.requestId, visibilityRecord.requestId, "input.studentDeliveryRequest.requestId");
  requireConst(request.archiveItemId, visibilityRecord.archiveItemId, "input.studentDeliveryRequest.archiveItemId");
  requireConst(request.guidanceSectionsHash, visibilityRecord.guidanceSectionsHash, "input.studentDeliveryRequest.guidanceSectionsHash");
  requireConst(request.studentOwnScopeConfirmed, true, "input.studentDeliveryRequest.studentOwnScopeConfirmed");
  return {
    envelopeId: requireToken(request.envelopeId, "input.studentDeliveryRequest.envelopeId", "ai_tutor_result_delivery_env_"),
    deliveryMode: "STUDENT_APP_RENDERABLE_AI_TUTOR_RESULT_ENVELOPE",
    channel: "STUDENT_APP",
    audienceKind: "STUDENT_APP_LEARNING_SUPPORT",
    visibilityState: "STUDENT_VISIBLE_AI_TUTOR_RESULT_DELIVERY_ENVELOPE_NOT_ARCHIVED",
    scopeRef: requireStudentScopeRef(request.scopeRef, "input.studentDeliveryRequest.scopeRef"),
    studentVisibilityReviewRecordId: visibilityRecord.recordId,
    studentVisibilityReviewId: visibilityRecord.reviewId,
    persistenceRecordId: visibilityRecord.persistenceRecordId,
    artifactId: visibilityRecord.artifactId,
    requestId: visibilityRecord.requestId,
    archiveItemId: visibilityRecord.archiveItemId,
    guidanceSectionsHash: visibilityRecord.guidanceSectionsHash,
    studentOwnScopeConfirmed: true,
  };
}

function assertDeliveryPolicy(policy) {
  assertPlainObject(policy, "input.studentDeliveryPolicy");
  for (const field of ["studentVisibilityReviewRequired", "controlledAnswerArtifactRequired", "guidanceHashMatchRequired", "studentDeliveryEnvelopeAllowed", "studentVisibleEnvelopeAllowed", "safeGuidanceOnlyRequired", "studentOwnScopeRequired", "futureDurableArchivePersistenceReviewRequired"]) {
    requireConst(policy[field], true, `input.studentDeliveryPolicy.${field}`);
  }
  for (const field of ["directDatabaseAccessAllowed", "mainDatabaseWriteAllowed", "studentArchiveWriteAllowed", "durableArchivePersistenceAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "retrievalAllowed", "answerKeyDisclosureAllowed", "rawModelOutputDisclosureAllowed", "resultRefDisclosureAllowed", "promptDisclosureAllowed", "contentRefDisclosureAllowed", "remoteDeviceControlAllowed", "localToolMutationAllowed", "swarmAllowed"]) {
    requireConst(policy[field], false, `input.studentDeliveryPolicy.${field}`);
  }
  return { ...policy };
}

function assertDeliveryPort(port) {
  if (!port || typeof port.recordResultStudentDeliveryEnvelope !== "function") {
    throw deliveryError("STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_PORT_MISSING", "result student delivery envelope port is required");
  }
  return port;
}

function buildPortRequest(normalized) {
  return {
    portName: "StudentAppAITutorResultStudentDeliveryEnvelopePort",
    operation: "recordResultStudentDeliveryEnvelope",
    principal: normalized.principal,
    deliveryRequest: normalized.deliveryRequest,
    sourceStudentVisibilityReview: deliverySafeVisibilityRecord(normalized.visibilityRecord),
    safeStudentGuidance: {
      summary: normalized.controlledArtifact.summary,
      guidanceSections: normalized.controlledArtifact.guidanceSections,
      guidanceSectionsHash: normalized.controlledArtifact.guidanceSectionsHash,
      safetyLabels: normalized.controlledArtifact.safetyLabels,
    },
    evidenceRefs: uniq([...normalized.evidenceRefs, `evidence:guidance-sections-hash:${normalized.visibilityRecord.guidanceSectionsHash}`]),
    safety: {
      studentVisibilityReviewRequired: true,
      controlledAnswerArtifactRequired: true,
      guidanceHashMatchRequired: true,
      safeGuidanceSentToPort: true,
      rawResultRefSentToPort: false,
      answerKeySentToPort: false,
      promptSentToPort: false,
      contentRefSentToPort: false,
      studentDeliveryEnvelopeAllowed: true,
      durableArchivePersistenceAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      modelInferenceAllowed: false,
      retrievalAllowed: false,
      swarmAllowed: false,
    },
  };
}

function assertPortResult(portResult, normalized) {
  rejectLeakedFields(portResult, "portResult");
  assertPlainObject(portResult, "portResult");
  const envelope = assertPlainObject(portResult.studentResultDeliveryEnvelope, "portResult.studentResultDeliveryEnvelope");
  requireConst(envelope.envelopeId, normalized.deliveryRequest.envelopeId, "portResult.studentResultDeliveryEnvelope.envelopeId");
  requireConst(envelope.studentVisibilityReviewRecordId, normalized.visibilityRecord.recordId, "portResult.studentResultDeliveryEnvelope.studentVisibilityReviewRecordId");
  requireConst(envelope.studentVisibilityReviewId, normalized.visibilityRecord.reviewId, "portResult.studentResultDeliveryEnvelope.studentVisibilityReviewId");
  requireConst(envelope.artifactId, normalized.visibilityRecord.artifactId, "portResult.studentResultDeliveryEnvelope.artifactId");
  requireConst(envelope.requestId, normalized.visibilityRecord.requestId, "portResult.studentResultDeliveryEnvelope.requestId");
  requireConst(envelope.archiveItemId, normalized.visibilityRecord.archiveItemId, "portResult.studentResultDeliveryEnvelope.archiveItemId");
  requireConst(envelope.guidanceSectionsHash, normalized.visibilityRecord.guidanceSectionsHash, "portResult.studentResultDeliveryEnvelope.guidanceSectionsHash");
  requireConst(envelope.visibilityState, "STUDENT_VISIBLE_AI_TUTOR_RESULT_DELIVERY_ENVELOPE_NOT_ARCHIVED", "portResult.studentResultDeliveryEnvelope.visibilityState");
  requireConst(envelope.deliveryState, "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED", "portResult.studentResultDeliveryEnvelope.deliveryState");
  requireConst(envelope.scopeRef, normalized.deliveryRequest.scopeRef, "portResult.studentResultDeliveryEnvelope.scopeRef");
  requireConst(envelope.studentVisiblePublished, true, "portResult.studentResultDeliveryEnvelope.studentVisiblePublished");
  requireConst(envelope.durableStudentArchivePersistenceStarted, false, "portResult.studentResultDeliveryEnvelope.durableStudentArchivePersistenceStarted");
  requireConst(envelope.mainDatabaseWriteStarted, false, "portResult.studentResultDeliveryEnvelope.mainDatabaseWriteStarted");
  requireConst(envelope.studentArchiveWriteStarted, false, "portResult.studentResultDeliveryEnvelope.studentArchiveWriteStarted");
  requireConst(envelope.resultRefDisclosed, false, "portResult.studentResultDeliveryEnvelope.resultRefDisclosed");
  return { ...envelope };
}

function buildRecord(normalized, portRequest, deliveryEnvelope, deliveredAt) {
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_PORT,
    status: readyStatus,
    recordId: `student_app_ai_tutor_result_student_delivery_envelope_${safeToken(normalized.idempotencyKey)}`,
    deliveredAt,
    deliveryInvocationId: normalized.deliveryInvocationId,
    principal: normalized.principal,
    sourceStudentVisibilityReview: deliverySafeVisibilityRecord(normalized.visibilityRecord),
    sourceControlledAnswerArtifact: {
      artifactId: normalized.controlledArtifact.artifactId,
      summary: normalized.controlledArtifact.summary,
      safetyLabels: normalized.controlledArtifact.safetyLabels,
      guidanceSectionsHash: normalized.controlledArtifact.guidanceSectionsHash,
      guidanceSectionCount: normalized.controlledArtifact.guidanceSections.length,
      learningActionSource: normalized.controlledArtifact.learningActionSource,
      resultArchiveStatus: normalized.controlledArtifact.resultArchiveStatus,
    },
    portRequest: {
      operation: portRequest.operation,
      requestId: normalized.visibilityRecord.requestId,
      guidanceSectionsHash: normalized.visibilityRecord.guidanceSectionsHash,
      safeGuidanceSentToPort: true,
      rawResultRefSentToPort: false,
      answerKeySentToPort: false,
      promptSentToPort: false,
      contentRefSentToPort: false,
    },
    studentResultDeliveryEnvelope: deliveryEnvelope,
    boundary: {
      studentVisibilityReviewVerified: true,
      controlledAnswerArtifactVerified: true,
      guidanceSectionsHashVerified: true,
      safeGuidanceOnly: true,
      studentOwnScopeEnforced: true,
      studentDeliveryEnvelopeCreated: true,
      studentVisiblePublished: true,
      durableStudentArchivePersistenceStarted: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
      resultRefDisclosed: false,
      answerKeyDisclosed: false,
      promptDisclosed: false,
      rawModelOutputDisclosed: false,
      contentRefDisclosed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      modelInferenceAllowed: false,
      retrievalAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      futureArchivePersistenceRequiresSeparateRuntime: true,
    },
    evidenceRefs: normalized.evidenceRefs,
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
    runtimeSlo: { targetP99Ms: 50, p99Ms: 5, totalErrors: 0, operations: 1, evidenceClass: "JS_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_PROBE" },
  };
}

function buildResult(record, options) {
  return { ...record, idempotentReplay: options.idempotentReplay };
}

function deliverySafeVisibilityRecord(record) {
  return {
    recordId: record.recordId,
    reviewId: record.reviewId,
    persistenceRecordId: record.persistenceRecordId,
    sourceReviewId: record.sourceReviewId,
    requestId: record.requestId,
    archiveItemId: record.archiveItemId,
    artifactId: record.artifactId,
    guidanceSectionsHash: record.guidanceSectionsHash,
    learningActionSource: record.learningActionSource,
    resultArchiveStatus: record.resultArchiveStatus,
  };
}

function findExistingRecordByIdempotencyKey(logPath, idempotencyKey) {
  if (!fs.existsSync(logPath)) return null;
  for (const line of fs.readFileSync(logPath, "utf8").split(/\r?\n/u).filter(Boolean)) {
    const record = JSON.parse(line);
    if (record.idempotencyKey === idempotencyKey) return record;
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.inputHash !== normalized.inputHash) {
    throw deliveryError("STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different student delivery envelope");
  }
}

function appendRecord(logPath, record) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`);
}

function rejectLeakedFields(value, label) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectLeakedFields(item, `${label}[${index}]`));
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (leakedFieldNames.has(key.replace(/[^a-zA-Z]/gu, "").toLowerCase())) {
      throw deliveryError("STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_LEAKED_FIELD", `${label}.${key} is not allowed`);
    }
    rejectLeakedFields(nested, `${label}.${key}`);
  }
}

function requireSafeText(value, label, min, max) {
  const text = requireBoundedString(value, label, min, max);
  if (unsafeTextPattern.test(text) || /[<>]/u.test(text)) {
    throw deliveryError("STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_UNSAFE_TEXT", `${label} contains unsafe student text`);
  }
  return text;
}

function requireStudentScopeRef(value, label) {
  const text = requireBoundedString(value, label, 9, 160);
  if (!text.startsWith("student:")) throw deliveryError("STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_SCOPE", `${label} must start with student:`);
  return text;
}

function uniqueStringArray(value, label, min, max, minLength = 1, maxLength = 1000) {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw deliveryError("STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_INVALID_ARRAY", `${label} must contain ${min}-${max} items`);
  const normalized = uniq(value.map((item) => requireBoundedString(item, `${label}[]`, minLength, maxLength)));
  if (normalized.length < min) throw deliveryError("STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_INVALID_ARRAY", `${label} must contain unique items`);
  return normalized;
}

function uniq(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))];
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw deliveryError("STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireArrayIncludes(values, expected, label) {
  if (!values.includes(expected)) throw deliveryError("STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_SCOPE_MISSING", `${label} must include ${expected}`);
}

function requireToken(value, label, prefix) {
  const text = requireBoundedString(value, label, prefix.length + 1, 260);
  if (!text.startsWith(prefix)) throw deliveryError("STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_TOKEN", `${label} must start with ${prefix}`);
  return text;
}

function requireHex(value, label) {
  const text = requireBoundedString(value, label, 64, 64);
  if (!/^[a-f0-9]{64}$/u.test(text)) throw deliveryError("STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_HEX", `${label} must be sha256 hex`);
  return text;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    throw deliveryError("STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_REQUIRED", `${label} must be ${min}-${max} chars`);
  }
  return value.trim();
}

function requireConst(actual, expected, label) {
  if (actual !== expected) throw deliveryError("STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_CONST", `${label} must be ${expected}`);
  return actual;
}

function hashGuidanceSections(sections) {
  const metadata = sections.map((section) => ({
    sectionId: section.sectionId,
    title: section.title,
    textHash: hashInput(section.text),
    sourceBlockRefs: section.sourceBlockRefs,
  }));
  return hashInput(metadata);
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeToken(value) {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function deliveryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
