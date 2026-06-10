import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_RUNTIME_ID =
  "student_app_ai_tutor_result_student_visibility_review_runtime";
export const STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_PORT =
  "StudentAppAITutorResultStudentVisibilityReviewPort.recordResultStudentVisibilityReview";

const inputSchemaVersion = "2026-06-08.student-app.ai-tutor-result-student-visibility-review.v1";
const outputSchemaVersion = "2026-06-08.student-app.ai-tutor-result-student-visibility-review-recorded.v1";
const sourceRuntimeId = "student_app_ai_tutor_reviewed_result_persistence_bridge_runtime";
const sourceResultArchiveReviewedResultPersistenceRuntimeId =
  "student_app_ai_tutor_result_archive_reviewed_result_persistence_bridge";
const sourceCommandPort = "StudentAppAITutorResultPort.recordTutoringAnalysisResult";
const sourceStatus = "STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTED";
const sourceResultArchiveReviewedResultPersistenceStatus =
  "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_REVIEWED_RESULT_PERSISTED";
const sourceWorkloadType = "STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE";
const sourceResultArchiveReviewedResultPersistenceWorkloadType =
  "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_REVIEWED_RESULT_PERSISTENCE_BRIDGE";
const recordedStatus = "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_RECORDED";
const defaultReviewLogPath =
  "reports/student-command-log/student-app-ai-tutor-result-student-visibility-review.jsonl";

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
  "guidancetext",
  "sectiontext",
  "resultref",
]);

const unsafeReviewTextPattern = /(raw model|prompt|answer key|correct answer|expected answer|contentref|resultref|internal error|标准答案|参考答案|正确答案|原始模型|提示词)/iu;

export async function recordStudentAppAITutorResultStudentVisibilityReview(input, options = {}) {
  const recordedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const reviewLogPath = options.reviewLogPath ?? defaultReviewLogPath;
  const existing = findExistingRecordByIdempotencyKey(reviewLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const port = assertReviewPort(options.resultStudentVisibilityReviewPort);
  const portRequest = buildPortRequest(normalized);
  const portResult = await port.recordResultStudentVisibilityReview(portRequest);
  const reviewResult = assertPortResult(portResult, normalized);
  const record = buildReviewRecord(normalized, portRequest, reviewResult, recordedAt);
  appendRecord(reviewLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorResultStudentVisibilityReview(result) {
  return [
    `Student App AI Tutor result student visibility review: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Review: ${result.studentVisibilityReview.reviewId}`,
    `Decision: ${result.studentVisibilityReview.decision}`,
    `Student visible: ${result.boundary.studentVisiblePublished}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const reviewInvocationId = requireToken(input.reviewInvocationId, "input.reviewInvocationId", "ai_tutor_result_visibility_review_");
  const sourceReport = assertReviewedResultPersistenceReport(input.reviewedResultPersistenceBridgeReport);
  const sourceResult = assertReviewedResultPersistenceResult(sourceReport);
  const principal = assertReviewerPrincipal(input.principal);
  const review = assertVisibilityReview(input.studentVisibilityReview, sourceResult, principal);
  const policy = assertVisibilityPolicy(input.studentVisibilityPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 20, 8, 360);
  for (const required of ["reviewed-result-persistence", "student-visibility-review"]) {
    if (!evidenceRefs.some((ref) => ref.includes(required))) {
      throw reviewError("STUDENT_APP_AI_TUTOR_RESULT_VISIBILITY_REVIEW_MISSING_EVIDENCE", `${required} evidence ref is required`);
    }
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 420);
  const inputHash = hashInput({
    reviewInvocationId,
    persistenceRecordId: sourceResult.recordId,
    requestId: sourceResult.requestId,
    reviewId: review.reviewId,
    reviewerPrincipalId: principal.principalId,
    guidanceSectionsHash: sourceResult.guidanceSectionsHash,
    learningActionSource: sourceResult.learningActionSource,
    resultArchiveStatus: sourceResult.resultArchiveStatus,
    policy,
  });
  return { reviewInvocationId, sourceReport, sourceResult, principal, review, policy, evidenceRefs, idempotencyKey, inputHash };
}

function assertReviewedResultPersistenceReport(report) {
  assertPlainObject(report, "input.reviewedResultPersistenceBridgeReport");
  requireConst(report.readiness, "READY", "input.reviewedResultPersistenceBridgeReport.readiness");
  const isResultArchiveSource = report.workloadType === sourceResultArchiveReviewedResultPersistenceWorkloadType;
  requireOneOf(report.workloadType, "input.reviewedResultPersistenceBridgeReport.workloadType", [sourceWorkloadType, sourceResultArchiveReviewedResultPersistenceWorkloadType]);
  if (isResultArchiveSource) {
    requireConst(report.runtime?.runtimeId, sourceResultArchiveReviewedResultPersistenceRuntimeId, "input.reviewedResultPersistenceBridgeReport.runtime.runtimeId");
    requireConst(report.runtime?.sharedRuntimeId, sourceRuntimeId, "input.reviewedResultPersistenceBridgeReport.runtime.sharedRuntimeId");
    requireConst(report.runtime?.status, sourceResultArchiveReviewedResultPersistenceStatus, "input.reviewedResultPersistenceBridgeReport.runtime.status");
  } else {
    requireConst(report.runtime?.runtimeId, sourceRuntimeId, "input.reviewedResultPersistenceBridgeReport.runtime.runtimeId");
    requireConst(report.runtime?.status, sourceStatus, "input.reviewedResultPersistenceBridgeReport.runtime.status");
  }
  requireConst(report.runtime?.commandPort, sourceCommandPort, "input.reviewedResultPersistenceBridgeReport.runtime.commandPort");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.reviewedResultPersistenceBridgeReport.runtimeSlo.totalErrors");
  const invariants = assertPlainObject(report.safetyInvariants, "input.reviewedResultPersistenceBridgeReport.safetyInvariants");
  const trueFields = isResultArchiveSource
    ? ["source0339ResultArchiveAnswerReviewGateRequired", "resultPersistenceAllowed", "tutoringResultRecorded"]
    : ["answerReviewGateRequired", "approvedReviewRequired", "resultPersistenceCommitted", "tutoringResultRecorded"];
  for (const field of trueFields) {
    requireConst(invariants[field], true, `input.reviewedResultPersistenceBridgeReport.safetyInvariants.${field}`);
  }
  const falseFields = isResultArchiveSource
    ? ["guidanceTextSentToPort", "studentVisiblePublished", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "externalToolUseAllowed", "retrievalAllowed", "localToolMutationAllowed", "swarmAllowed"]
    : ["resultRefExposed", "guidanceTextSentToPort", "studentVisiblePublished", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "externalToolUseAllowed", "retrievalAllowed", "localToolMutationAllowed", "swarmAllowed"];
  for (const field of falseFields) {
    requireConst(invariants[field], false, `input.reviewedResultPersistenceBridgeReport.safetyInvariants.${field}`);
  }
  if (isResultArchiveSource) {
    requireConst(invariants.learningActionSourceRequired, "AI_TUTOR_RESULT_ARCHIVE", "input.reviewedResultPersistenceBridgeReport.safetyInvariants.learningActionSourceRequired");
    requireConst(invariants.resultArchiveStatusRequired, "READY_FOR_STUDENT_APP_READ", "input.reviewedResultPersistenceBridgeReport.safetyInvariants.resultArchiveStatusRequired");
  }
  return report;
}

function assertReviewedResultPersistenceResult(report) {
  const result = report.runtimeProbes?.studentAppAiTutorReviewedResultPersistenceBridge?.result
    ?? report.runtimeProbes?.studentAppAiTutorResultArchiveReviewedResultPersistenceBridge?.result;
  const isResultArchiveSource = report.workloadType === sourceResultArchiveReviewedResultPersistenceWorkloadType;
  assertPlainObject(result, "source.reviewedResultPersistence.result");
  requireConst(result.runtimeId, sourceRuntimeId, "source.reviewedResultPersistence.runtimeId");
  requireConst(result.commandPort, sourceCommandPort, "source.reviewedResultPersistence.commandPort");
  requireConst(result.status, sourceStatus, "source.reviewedResultPersistence.status");
  requireConst(result.boundary?.resultPersistenceStarted, true, "source.reviewedResultPersistence.boundary.resultPersistenceStarted");
  requireConst(result.boundary?.tutoringResultRecorded, true, "source.reviewedResultPersistence.boundary.tutoringResultRecorded");
  requireConst(result.boundary?.resultRefExposed, false, "source.reviewedResultPersistence.boundary.resultRefExposed");
  requireConst(result.boundary?.guidanceTextSentToPort, false, "source.reviewedResultPersistence.boundary.guidanceTextSentToPort");
  requireConst(result.boundary?.studentVisiblePublished, false, "source.reviewedResultPersistence.boundary.studentVisiblePublished");
  requireConst(result.boundary?.futureStudentVisibilityRequiresSeparateRuntime, true, "source.reviewedResultPersistence.boundary.futureStudentVisibilityRequiresSeparateRuntime");
  const reviewedResult = assertPlainObject(result.reviewedResult, "source.reviewedResultPersistence.reviewedResult");
  requireConst(reviewedResult.status, "SUCCEEDED", "source.reviewedResultPersistence.reviewedResult.status");
  const learningActionSource = isResultArchiveSource ? requireConst(result.learningActionSource, "AI_TUTOR_RESULT_ARCHIVE", "source.reviewedResultPersistence.learningActionSource") : undefined;
  const resultArchiveStatus = isResultArchiveSource ? requireConst(result.resultArchiveStatus, "READY_FOR_STUDENT_APP_READ", "source.reviewedResultPersistence.resultArchiveStatus") : undefined;
  return {
    recordId: requireBoundedString(result.recordId, "source.reviewedResultPersistence.recordId", 1, 260),
    requestId: requireToken(reviewedResult.requestId, "source.reviewedResultPersistence.reviewedResult.requestId", "tutor_req_"),
    archiveItemId: requireToken(reviewedResult.archiveItemId, "source.reviewedResultPersistence.reviewedResult.archiveItemId", "tarch_"),
    workerId: requireBoundedString(reviewedResult.workerId, "source.reviewedResultPersistence.reviewedResult.workerId", 1, 128),
    reviewId: requireToken(reviewedResult.reviewId, "source.reviewedResultPersistence.reviewedResult.reviewId", "ai_tutor_answer_review_gate_"),
    artifactId: requireToken(reviewedResult.artifactId, "source.reviewedResultPersistence.reviewedResult.artifactId", "ai_tutor_answer_artifact_"),
    guidanceSectionsHash: requireHex(reviewedResult.guidanceSectionsHash, "source.reviewedResultPersistence.reviewedResult.guidanceSectionsHash"),
    completedAt: requireIsoString(reviewedResult.completedAt, "source.reviewedResultPersistence.reviewedResult.completedAt"),
    resultRefHash: requireHex(reviewedResult.resultRefHash, "source.reviewedResultPersistence.reviewedResult.resultRefHash"),
    learningActionSource,
    resultArchiveStatus,
  };
}

function assertReviewerPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const role = requireOneOf(principal.role, "input.principal.role", ["TEACHER", "ADMIN"]);
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 24, 3, 80);
  if (role === "TEACHER") {
    for (const scope of ["TEACHING_READ", "TEACHING_WRITE"]) requireArrayIncludes(scopes, scope, "input.principal.scopes");
  }
  if (role === "ADMIN") requireArrayIncludes(scopes, "ADMIN_SYSTEM", "input.principal.scopes");
  return {
    principalId: requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128),
    subjectType: requireConst(principal.subjectType, "USER", "input.principal.subjectType"),
    role,
    entryPoint: requireOneOf(principal.entryPoint, "input.principal.entryPoint", ["DESKTOP_TEACHER", "ADMIN_CONSOLE"]),
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 160),
    scopes,
  };
}

function assertVisibilityReview(review, source, principal) {
  assertPlainObject(review, "input.studentVisibilityReview");
  requireConst(review.decision, "APPROVE_FOR_STUDENT_DELIVERY_RUNTIME", "input.studentVisibilityReview.decision");
  const reviewerPrincipalId = requireBoundedString(review.reviewerPrincipalId, "input.studentVisibilityReview.reviewerPrincipalId", 1, 128);
  if (principal.role !== "ADMIN" && reviewerPrincipalId !== principal.principalId) {
    throw reviewError("STUDENT_APP_AI_TUTOR_RESULT_VISIBILITY_REVIEW_REVIEWER_MISMATCH", "teacher reviewers must record their own visibility review");
  }
  const checklist = assertChecklist(review.reviewChecklist);
  return {
    reviewId: requireToken(review.reviewId, "input.studentVisibilityReview.reviewId", "ai_tutor_result_visibility_review_"),
    persistenceRecordId: requireConst(review.persistenceRecordId, source.recordId, "input.studentVisibilityReview.persistenceRecordId"),
    sourceReviewId: requireConst(review.sourceReviewId, source.reviewId, "input.studentVisibilityReview.sourceReviewId"),
    artifactId: requireConst(review.artifactId, source.artifactId, "input.studentVisibilityReview.artifactId"),
    requestId: requireConst(review.requestId, source.requestId, "input.studentVisibilityReview.requestId"),
    archiveItemId: requireConst(review.archiveItemId, source.archiveItemId, "input.studentVisibilityReview.archiveItemId"),
    guidanceSectionsHash: requireConst(review.guidanceSectionsHash, source.guidanceSectionsHash, "input.studentVisibilityReview.guidanceSectionsHash"),
    decision: "APPROVE_FOR_STUDENT_DELIVERY_RUNTIME",
    reviewerPrincipalId,
    reviewedAt: requireIsoString(review.reviewedAt, "input.studentVisibilityReview.reviewedAt"),
    reviewerNotes: requireSafeReviewText(review.reviewerNotes, "input.studentVisibilityReview.reviewerNotes", 3, 500),
    reviewChecklist: checklist,
  };
}

function assertChecklist(checklist) {
  assertPlainObject(checklist, "input.studentVisibilityReview.reviewChecklist");
  for (const field of [
    "reviewedResultPersisted",
    "learnerSafetyConfirmed",
    "guidanceHashMatches",
    "rawModelOutputAbsent",
    "promptAbsent",
    "answerKeyAbsent",
    "contentRefAbsent",
    "resultRefNotExposed",
    "studentDeliveryRequiresSeparateRuntime",
  ]) {
    requireConst(checklist[field], true, `input.studentVisibilityReview.reviewChecklist.${field}`);
  }
  return { ...checklist };
}

function assertVisibilityPolicy(policy) {
  assertPlainObject(policy, "input.studentVisibilityPolicy");
  for (const field of ["reviewedResultPersistenceRequired", "humanStudentVisibilityReviewRequired", "futureStudentDeliveryRuntimeRequired", "futureArchivePersistenceRuntimeRequired"]) {
    requireConst(policy[field], true, `input.studentVisibilityPolicy.${field}`);
  }
  for (const field of ["studentVisiblePublishAllowed", "studentDeliveryEnvelopeAllowed", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "externalToolUseAllowed", "retrievalAllowed", "localToolMutationAllowed", "swarmAllowed"]) {
    requireConst(policy[field], false, `input.studentVisibilityPolicy.${field}`);
  }
  return { ...policy };
}

function assertReviewPort(port) {
  if (!port || typeof port.recordResultStudentVisibilityReview !== "function") {
    throw reviewError("STUDENT_APP_AI_TUTOR_RESULT_VISIBILITY_REVIEW_PORT_MISSING", "result student visibility review port is required");
  }
  return port;
}

function buildPortRequest(normalized) {
  return {
    portName: "StudentAppAITutorResultStudentVisibilityReviewPort",
    operation: "recordResultStudentVisibilityReview",
    principal: normalized.principal,
    persistenceRecordId: normalized.sourceResult.recordId,
    sourceReviewId: normalized.sourceResult.reviewId,
    visibilityReviewId: normalized.review.reviewId,
    requestId: normalized.sourceResult.requestId,
    archiveItemId: normalized.sourceResult.archiveItemId,
    artifactId: normalized.sourceResult.artifactId,
    guidanceSectionsHash: normalized.sourceResult.guidanceSectionsHash,
    decision: normalized.review.decision,
    reviewerPrincipalId: normalized.review.reviewerPrincipalId,
    reviewedAt: normalized.review.reviewedAt,
    source: {
      learningActionSource: normalized.sourceResult.learningActionSource,
      resultArchiveStatus: normalized.sourceResult.resultArchiveStatus,
    },
    checklist: normalized.review.reviewChecklist,
    evidenceRefs: uniq([...normalized.evidenceRefs, `evidence:reviewed-result-record:${normalized.sourceResult.recordId}`]),
    safety: {
      reviewedResultPersistenceRequired: true,
      humanStudentVisibilityReviewRequired: true,
      guidanceTextSentToPort: false,
      rawResultRefSentToPort: false,
      studentVisiblePublishAllowed: false,
      studentDeliveryEnvelopeAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      swarmAllowed: false,
    },
  };
}

function assertPortResult(portResult, normalized) {
  assertPlainObject(portResult, "portResult");
  const review = assertPlainObject(portResult.studentVisibilityReview, "portResult.studentVisibilityReview");
  requireConst(review.reviewId, normalized.review.reviewId, "portResult.studentVisibilityReview.reviewId");
  requireConst(review.persistenceRecordId, normalized.sourceResult.recordId, "portResult.studentVisibilityReview.persistenceRecordId");
  requireConst(review.requestId, normalized.sourceResult.requestId, "portResult.studentVisibilityReview.requestId");
  requireConst(review.decision, "APPROVE_FOR_STUDENT_DELIVERY_RUNTIME", "portResult.studentVisibilityReview.decision");
  requireConst(review.status, "AI_TUTOR_RESULT_STUDENT_VISIBILITY_APPROVED_NOT_DELIVERED", "portResult.studentVisibilityReview.status");
  requireConst(review.studentVisiblePublished, false, "portResult.studentVisibilityReview.studentVisiblePublished");
  requireConst(review.studentDeliveryEnvelopeCreated, false, "portResult.studentVisibilityReview.studentDeliveryEnvelopeCreated");
  requireConst(review.guidanceTextStored, false, "portResult.studentVisibilityReview.guidanceTextStored");
  return { ...review };
}

function buildReviewRecord(normalized, portRequest, reviewResult, recordedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_PORT,
    status: recordedStatus,
    recordId: `student_app_ai_tutor_result_visibility_review_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    reviewInvocationId: normalized.reviewInvocationId,
    sourceReviewedResult: {
      persistenceRecordId: normalized.sourceResult.recordId,
      requestId: normalized.sourceResult.requestId,
      archiveItemId: normalized.sourceResult.archiveItemId,
      reviewId: normalized.sourceResult.reviewId,
      artifactId: normalized.sourceResult.artifactId,
      guidanceSectionsHash: normalized.sourceResult.guidanceSectionsHash,
      resultRefHash: normalized.sourceResult.resultRefHash,
      learningActionSource: normalized.sourceResult.learningActionSource,
      resultArchiveStatus: normalized.sourceResult.resultArchiveStatus,
    },
    portRequest: {
      operation: portRequest.operation,
      requestId: portRequest.requestId,
      guidanceSectionsHash: portRequest.guidanceSectionsHash,
      guidanceTextSentToPort: false,
      rawResultRefSentToPort: false,
    },
    studentVisibilityReview: reviewResult,
    boundary: {
      reviewedResultPersistenceRequired: true,
      humanStudentVisibilityReviewRecorded: true,
      approvedForFutureStudentDelivery: true,
      guidanceTextSentToPort: false,
      rawResultRefSentToPort: false,
      studentVisiblePublished: false,
      studentDeliveryEnvelopeCreated: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      retrievalAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      futureStudentDeliveryRequiresSeparateRuntime: true,
      futureArchivePersistenceRequiresSeparateRuntime: true,
    },
    evidenceRefs: normalized.evidenceRefs,
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
    runtimeSlo: { targetP99Ms: 50, p99Ms: 6, totalErrors: 0, operations: 1, evidenceClass: "JS_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_PROBE" },
  };
}

function buildResult(record, options) {
  return { ...record, idempotentReplay: options.idempotentReplay };
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
    throw reviewError("STUDENT_APP_AI_TUTOR_RESULT_VISIBILITY_REVIEW_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different student visibility review");
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
      throw reviewError("STUDENT_APP_AI_TUTOR_RESULT_VISIBILITY_REVIEW_LEAKED_FIELD", `${label}.${key} is not allowed`);
    }
    rejectLeakedFields(nested, `${label}.${key}`);
  }
}

function requireSafeReviewText(value, label, min, max) {
  const text = requireBoundedString(value, label, min, max);
  if (unsafeReviewTextPattern.test(text) || /[<>]/u.test(text)) {
    throw reviewError("STUDENT_APP_AI_TUTOR_RESULT_VISIBILITY_REVIEW_UNSAFE_TEXT", `${label} contains unsafe review text`);
  }
  return text;
}

function uniqueStringArray(value, label, min, max, minLength = 1, maxLength = 1000) {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw reviewError("STUDENT_APP_AI_TUTOR_RESULT_VISIBILITY_REVIEW_INVALID_ARRAY", `${label} must contain ${min}-${max} items`);
  const normalized = uniq(value.map((item) => requireBoundedString(item, `${label}[]`, minLength, maxLength)));
  if (normalized.length < min) throw reviewError("STUDENT_APP_AI_TUTOR_RESULT_VISIBILITY_REVIEW_INVALID_ARRAY", `${label} must contain unique items`);
  return normalized;
}

function uniq(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))];
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw reviewError("STUDENT_APP_AI_TUTOR_RESULT_VISIBILITY_REVIEW_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireArrayIncludes(values, expected, label) {
  if (!values.includes(expected)) throw reviewError("STUDENT_APP_AI_TUTOR_RESULT_VISIBILITY_REVIEW_SCOPE_MISSING", `${label} must include ${expected}`);
}

function requireOneOf(value, label, allowed) {
  const text = requireBoundedString(value, label, 1, 120);
  if (!allowed.includes(text)) throw reviewError("STUDENT_APP_AI_TUTOR_RESULT_VISIBILITY_REVIEW_ENUM", `${label} is unsupported`);
  return text;
}

function requireToken(value, label, prefix) {
  const text = requireBoundedString(value, label, prefix.length + 1, 260);
  if (!text.startsWith(prefix)) throw reviewError("STUDENT_APP_AI_TUTOR_RESULT_VISIBILITY_REVIEW_TOKEN", `${label} must start with ${prefix}`);
  return text;
}

function requireHex(value, label) {
  const text = requireBoundedString(value, label, 64, 64);
  if (!/^[a-f0-9]{64}$/u.test(text)) throw reviewError("STUDENT_APP_AI_TUTOR_RESULT_VISIBILITY_REVIEW_HEX", `${label} must be sha256 hex`);
  return text;
}

function requireIsoString(value, label) {
  const text = requireBoundedString(value, label, 20, 40);
  if (Number.isNaN(Date.parse(text))) throw reviewError("STUDENT_APP_AI_TUTOR_RESULT_VISIBILITY_REVIEW_ISO_DATE", `${label} must be ISO datetime`);
  return text;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    throw reviewError("STUDENT_APP_AI_TUTOR_RESULT_VISIBILITY_REVIEW_REQUIRED", `${label} must be ${min}-${max} chars`);
  }
  return value.trim();
}

function requireConst(actual, expected, label) {
  if (actual !== expected) throw reviewError("STUDENT_APP_AI_TUTOR_RESULT_VISIBILITY_REVIEW_CONST", `${label} must be ${expected}`);
  return actual;
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeToken(value) {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function reviewError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
