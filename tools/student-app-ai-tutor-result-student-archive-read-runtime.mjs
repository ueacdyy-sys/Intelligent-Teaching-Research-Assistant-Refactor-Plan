import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_RUNTIME_ID =
  "student_app_ai_tutor_result_student_archive_read_runtime";
export const STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_PORT =
  "StudentAppAITutorResultStudentArchiveReadPort.readStudentVisibleArchivedResult";
export const STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_READY =
  "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_READY";

const inputSchemaVersion = "2026-06-08.student-app.ai-tutor-result-student-archive-read.v1";
const outputSchemaVersion = "2026-06-08.student-app.ai-tutor-result-student-archive-read-verified.v1";
const rowVerificationRuntimeId = "student_app_ai_tutor_result_student_archive_row_verification_runtime";
const rowVerificationCommandPort =
  "StudentAppAITutorResultStudentArchiveRowVerificationPort.verifyTeachingArchivePhysicalRow";
const rowVerificationWorkload = "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION";
const rowVerificationStatus = "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PHYSICAL_ROW_VERIFIED";
const resultArchiveRowVerificationWorkload = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_ROW_VERIFICATION";
const resultArchiveRowVerificationRuntimeId = "student_app_ai_tutor_result_archive_student_archive_row_verification";
const resultArchiveRowVerificationStatus = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_PHYSICAL_ROW_VERIFIED";
const resultArchiveSource = "AI_TUTOR_RESULT_ARCHIVE";
const resultArchiveReadyStatus = "READY_FOR_STUDENT_APP_READ";
const questionBankFeedbackRowVerificationWorkload = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_ARCHIVE_ROW_VERIFICATION";
const questionBankFeedbackRowVerificationRuntimeId = "student_app_ai_tutor_question_bank_feedback_student_archive_row_verification";
const questionBankFeedbackRowVerificationStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_ARCHIVE_PHYSICAL_ROW_VERIFIED";
const questionBankFeedbackSource = "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK";
const questionBankFeedbackReadyStatus = "READY_FOR_STUDENT_APP_READ";
const verifiedStatus = "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_VERIFIED";
const targetEndpoint = "GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result";
const targetUseCase = "ReadStudentAppAITutorResultArchive.Execute";
const targetRepository = "ArchiveRepository.GetByID";
const targetSnapshotRepository = "ArchiveRepository.GetStudentAppAITutorResultArchiveSnapshot";
const defaultVerificationLogPath =
  "reports/student-command-log/student-app-ai-tutor-result-student-archive-read.jsonl";

const leakedFieldNames = [
  "contentRef", "resultRef", "answerKey", "correctAnswer", "expectedAnswer",
  "rawModelOutput", "modelOutput", "prompt", "internalError", "errorMessage",
  "databaseWriteResult", "workerId", "claimedByWorkerId", "claimExpiresAt",
];

export async function verifyStudentAppAITutorResultStudentArchiveRead(input, options = {}) {
  const verifiedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const verificationLogPath = options.verificationLogPath ?? defaultVerificationLogPath;
  const existing = findExistingRecordByIdempotencyKey(verificationLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const readPort = assertReadPort(options.studentAppAITutorResultArchiveReadPort);
  const portResult = await readPort.readStudentVisibleArchivedResult(
    {
      principal: normalized.principal,
      archiveItemId: normalized.archiveItem.id,
      includeGuidanceSections: true,
    },
    {
      verificationInvocationId: normalized.readInvocationId,
      idempotencyKey: normalized.idempotencyKey,
      sourceRowVerificationRecordId: normalized.rowVerificationResult.recordId,
    },
  );
  const verified = assertPortResult(portResult, normalized);
  const record = buildVerificationRecord(normalized, verified, verifiedAt);
  appendVerificationRecord(verificationLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorResultStudentArchiveRead(result) {
  return [
    `Student App AI Tutor result archive read: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Endpoint: ${result.studentResultReadSource.endpoint}`,
    `Archive item: ${result.resultArchiveCard.archiveItemId}`,
    `Student visible card verified: ${result.boundary.studentVisibleResultCardReadVerified}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const readInvocationId = requireToken(input.readInvocationId, "input.readInvocationId", "ai_tutor_result_archive_read_");
  const principal = assertStudentPrincipal(input.principal);
  const rowVerificationReport = assertRowVerificationReport(input.studentArchiveRowVerificationReport);
  const rowVerificationResult = assertRowVerificationResult(rowVerificationReport);
  const archiveItem = rowVerificationResult.teachingArchivePhysicalRow.archiveItem;
  requireConst(principal.studentAccess.ownStudentId, archiveItem.studentId, "input.principal.studentAccess.ownStudentId");
  const safeGuidanceSnapshot = assertSafeGuidanceSnapshot(rowVerificationResult.safeGuidanceSnapshot, archiveItem);
  const readPolicy = assertReadPolicy(input.studentArchiveReadPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 720);
  if (!evidenceRefs.some((ref) => ref.includes("student-archive-row-verification"))) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_READ_MISSING_ROW_EVIDENCE", "row verification evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("student-app-ai-tutor-result-archive-read") || ref.includes("student-app-ai-tutor-result-archive-student-archive-read") || ref.includes("student-app-ai-tutor-question-bank-feedback-student-archive-read"))) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_READ_MISSING_PRODUCT_EVIDENCE", "student archive read evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const verificationInputHash = hashInput({ readInvocationId, principalId: principal.principalId, archiveItemId: archiveItem.id, sourceRowRecordId: rowVerificationResult.recordId, readPolicy });
  return { readInvocationId, principal, rowVerificationReport, rowVerificationResult, archiveItem, safeGuidanceSnapshot, readPolicy, evidenceRefs, idempotencyKey, verificationInputHash };
}

function assertStudentPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  requireConst(principal.subjectType, "USER", "input.principal.subjectType");
  requireConst(principal.role, "STUDENT", "input.principal.role");
  requireConst(principal.entryPoint, "STUDENT_APP", "input.principal.entryPoint");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  if (!scopes.includes("STUDENT_OWN_READ")) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_READ_MISSING_SCOPE", "STUDENT_OWN_READ is required");
  }
  assertPlainObject(principal.studentAccess, "input.principal.studentAccess");
  requireConst(principal.studentAccess.mode, "OWN", "input.principal.studentAccess.mode");
  return {
    principalId: requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128),
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 160),
    subjectType: "USER",
    role: "STUDENT",
    entryPoint: "STUDENT_APP",
    scopes,
    studentAccess: { mode: "OWN", ownStudentId: requireBoundedString(principal.studentAccess.ownStudentId, "input.principal.studentAccess.ownStudentId", 1, 128) },
  };
}

function assertRowVerificationReport(report) {
  assertPlainObject(report, "input.studentArchiveRowVerificationReport");
  requireConst(report.readiness, "READY", "input.studentArchiveRowVerificationReport.readiness");
  if (report.workloadType === resultArchiveRowVerificationWorkload) return assertResultArchiveRowVerificationReport(report);
  if (report.workloadType === questionBankFeedbackRowVerificationWorkload) return assertQuestionBankFeedbackRowVerificationReport(report);
  requireConst(report.workloadType, rowVerificationWorkload, "input.studentArchiveRowVerificationReport.workloadType");
  requireConst(report.runtime?.runtimeId, rowVerificationRuntimeId, "input.studentArchiveRowVerificationReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, rowVerificationCommandPort, "input.studentArchiveRowVerificationReport.runtime.commandPort");
  requireConst(report.runtime?.status, rowVerificationStatus, "input.studentArchiveRowVerificationReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.studentArchiveRowVerificationReport.runtimeSlo.totalErrors");
  for (const field of ["physicalDatabaseRowVerified", "studentOwnScopeEnforced", "safeGuidanceOnly"]) requireConst(report.safetyInvariants?.[field], true, `input.studentArchiveRowVerificationReport.safetyInvariants.${field}`);
  for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "swarmAllowed", "contentRefDisclosureAllowed"]) requireConst(report.safetyInvariants?.[field], false, `input.studentArchiveRowVerificationReport.safetyInvariants.${field}`);
  return report;
}

function assertResultArchiveRowVerificationReport(report) {
  requireConst(report.runtime?.runtimeId, resultArchiveRowVerificationRuntimeId, "input.studentArchiveRowVerificationReport.runtime.runtimeId");
  requireConst(report.runtime?.sharedRuntimeId, rowVerificationRuntimeId, "input.studentArchiveRowVerificationReport.runtime.sharedRuntimeId");
  requireConst(report.runtime?.commandPort, rowVerificationCommandPort, "input.studentArchiveRowVerificationReport.runtime.commandPort");
  requireConst(report.runtime?.status, resultArchiveRowVerificationStatus, "input.studentArchiveRowVerificationReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.studentArchiveRowVerificationReport.runtimeSlo.totalErrors");
  const invariants = report.safetyInvariants ?? {};
  for (const field of ["source0344ResultArchiveStudentArchiveStorageCommitRequired", "injectedTeachingArchiveRowReadPortRequired", "teachingArchiveRepositoryGetByIDUsed", "physicalDatabaseRowVerified", "committedArchiveItemMatchedPhysicalRow", "studentArchivePersisted"]) requireConst(invariants[field], true, `input.studentArchiveRowVerificationReport.safetyInvariants.${field}`);
  requireConst(invariants.learningActionSourceRequired, resultArchiveSource, "input.studentArchiveRowVerificationReport.safetyInvariants.learningActionSourceRequired");
  requireConst(invariants.resultArchiveStatusRequired, resultArchiveReadyStatus, "input.studentArchiveRowVerificationReport.safetyInvariants.resultArchiveStatusRequired");
  for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "swarmAllowed", "contentRefDisclosureAllowed", "rawModelOutputDisclosureAllowed", "answerKeyDisclosureAllowed", "promptDisclosureAllowed", "resultRefDisclosureAllowed"]) requireConst(invariants[field], false, `input.studentArchiveRowVerificationReport.safetyInvariants.${field}`);
  return report;
}

function assertQuestionBankFeedbackRowVerificationReport(report) {
  requireConst(report.runtime?.runtimeId, questionBankFeedbackRowVerificationRuntimeId, "input.studentArchiveRowVerificationReport.runtime.runtimeId");
  requireConst(report.runtime?.sharedRuntimeId, rowVerificationRuntimeId, "input.studentArchiveRowVerificationReport.runtime.sharedRuntimeId");
  requireConst(report.runtime?.commandPort, rowVerificationCommandPort, "input.studentArchiveRowVerificationReport.runtime.commandPort");
  requireConst(report.runtime?.status, questionBankFeedbackRowVerificationStatus, "input.studentArchiveRowVerificationReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.studentArchiveRowVerificationReport.runtimeSlo.totalErrors");
  const invariants = report.safetyInvariants ?? {};
  for (const field of ["source0378QuestionBankFeedbackStudentArchiveStorageCommitRequired", "injectedTeachingArchiveRowReadPortRequired", "teachingArchiveRepositoryGetByIDUsed", "physicalDatabaseRowVerified", "committedArchiveItemMatchedPhysicalRow", "studentArchivePersisted"]) requireConst(invariants[field], true, `input.studentArchiveRowVerificationReport.safetyInvariants.${field}`);
  requireConst(invariants.learningActionSourceRequired, questionBankFeedbackSource, "input.studentArchiveRowVerificationReport.safetyInvariants.learningActionSourceRequired");
  requireConst(invariants.feedbackStatusRequired, questionBankFeedbackReadyStatus, "input.studentArchiveRowVerificationReport.safetyInvariants.feedbackStatusRequired");
  for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "swarmAllowed", "contentRefDisclosureAllowed", "rawModelOutputDisclosureAllowed", "answerKeyDisclosureAllowed", "promptDisclosureAllowed", "resultRefDisclosureAllowed", "feedbackIdsDisclosed"]) requireConst(invariants[field], false, `input.studentArchiveRowVerificationReport.safetyInvariants.${field}`);
  return report;
}

function assertRowVerificationResult(report) {
  const isResultArchive = report.workloadType === resultArchiveRowVerificationWorkload;
  const isQuestionBankFeedback = report.workloadType === questionBankFeedbackRowVerificationWorkload;
  const result = (isQuestionBankFeedback
    ? report.runtimeProbes?.studentAppAiTutorQuestionBankFeedbackStudentArchiveRowVerification
    : isResultArchive
      ? report.runtimeProbes?.studentAppAiTutorResultArchiveStudentArchiveRowVerification
      : report.runtimeProbes?.studentAppAiTutorResultStudentArchiveRowVerification)?.result;
  assertPlainObject(result, "input.studentArchiveRowVerificationReport.runtimeProbes.result");
  requireConst(result.schemaVersion, "2026-06-08.student-app.ai-tutor-result-student-archive-row-verified.v1", "row.source.schemaVersion");
  requireConst(result.runtimeId, rowVerificationRuntimeId, "row.source.runtimeId");
  requireConst(result.commandPort, rowVerificationCommandPort, "row.source.commandPort");
  requireConst(result.status, rowVerificationStatus, "row.source.status");
  requireConst(result.boundary?.physicalDatabaseRowVerified, true, "row.source.boundary.physicalDatabaseRowVerified");
  requireConst(result.boundary?.directDatabaseAccessAllowed, false, "row.source.boundary.directDatabaseAccessAllowed");
  if (isResultArchive) {
    requireConst(result.sourceStorageCommit?.learningActionSource, resultArchiveSource, "row.source.sourceStorageCommit.learningActionSource");
    requireConst(result.sourceStorageCommit?.resultArchiveStatus, resultArchiveReadyStatus, "row.source.sourceStorageCommit.resultArchiveStatus");
    requireConst(result.safeGuidanceSnapshot?.learningActionSource, resultArchiveSource, "row.source.safeGuidanceSnapshot.learningActionSource");
    requireConst(result.safeGuidanceSnapshot?.resultArchiveStatus, resultArchiveReadyStatus, "row.source.safeGuidanceSnapshot.resultArchiveStatus");
  }
  if (isQuestionBankFeedback) {
    requireConst(result.sourceStorageCommit?.learningActionSource, questionBankFeedbackSource, "row.source.sourceStorageCommit.learningActionSource");
    requireConst(result.sourceStorageCommit?.feedbackStatus, questionBankFeedbackReadyStatus, "row.source.sourceStorageCommit.feedbackStatus");
    requireConst(result.safeGuidanceSnapshot?.learningActionSource, questionBankFeedbackSource, "row.source.safeGuidanceSnapshot.learningActionSource");
    requireConst(result.safeGuidanceSnapshot?.feedbackStatus, questionBankFeedbackReadyStatus, "row.source.safeGuidanceSnapshot.feedbackStatus");
  }
  const row = assertArchiveItem(result.teachingArchivePhysicalRow?.archiveItem, "row.source.teachingArchivePhysicalRow.archiveItem");
  return { ...result, recordId: requireBoundedString(result.recordId, "row.source.recordId", 1, 520), teachingArchivePhysicalRow: { archiveItem: row }, evidenceRefs: uniqueStringArray(result.evidenceRefs ?? [], "row.source.evidenceRefs", 1, 1800) };
}

function assertArchiveItem(item, label) {
  assertPlainObject(item, label);
  return {
    id: requireToken(item.id, `${label}.id`, "tarch_"),
    ownerType: requireConst(item.ownerType, "STUDENT", `${label}.ownerType`),
    studentId: requireBoundedString(item.studentId, `${label}.studentId`, 1, 128),
    materialType: requireConst(item.materialType, "HOMEWORK", `${label}.materialType`),
    title: requireSafeText(item.title, `${label}.title`, 1, 200),
    source: requireConst(item.source, "SYSTEM_IMPORT", `${label}.source`),
    contentRef: requireStudentAITutorContentRef(item.contentRef, `${label}.contentRef`),
    tags: assertIncludes(uniqueStringArray(item.tags ?? [], `${label}.tags`, 4, 4), ["student_app_ai_tutor", "result", "safe_guidance", "archive_commit"], `${label}.tags`),
    analysisIntents: assertIncludes(uniqueStringArray(item.analysisIntents ?? [], `${label}.analysisIntents`, 2, 2), ["ARCHIVE_ONLY", "TUTORING"], `${label}.analysisIntents`),
    ocrStatus: requireConst(item.ocrStatus, "NOT_REQUIRED", `${label}.ocrStatus`),
    createdAt: requireIsoString(item.createdAt, `${label}.createdAt`),
  };
}

function assertSafeGuidanceSnapshot(snapshot, archiveItem) {
  assertPlainObject(snapshot, "row.source.safeGuidanceSnapshot");
  requireConst(snapshot.safeGuidanceOnly, true, "row.source.safeGuidanceSnapshot.safeGuidanceOnly");
  const sections = assertGuidanceSections(snapshot.guidanceSections ?? []);
  return {
    summary: requireSafeText(snapshot.summary, "row.source.safeGuidanceSnapshot.summary", 1, 1200),
    guidanceSections: sections,
    guidanceSectionsHash: requireBoundedString(snapshot.guidanceSectionsHash, "row.source.safeGuidanceSnapshot.guidanceSectionsHash", 1, 128),
    safetyLabels: uniqueStringArray(snapshot.safetyLabels ?? [], "row.source.safeGuidanceSnapshot.safetyLabels", 1, 8),
    safeGuidanceOnly: true,
    archiveItemId: archiveItem.id,
  };
}

function assertReadPolicy(policy) {
  assertPlainObject(policy, "input.studentArchiveReadPolicy");
  for (const field of ["rowVerificationRequired", "ownStudentPrincipalRequired", "studentVisibleResultCardRequired", "safeGuidanceSnapshotRequired", "injectedStudentResultArchiveReadPortRequired", "goUseCaseReadAllowed", "httpEndpointContractRequired", "idempotentReadVerificationRequired"]) requireConst(policy[field], true, `input.studentArchiveReadPolicy.${field}`);
  for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "answerKeyDisclosureAllowed", "rawModelOutputDisclosureAllowed", "resultRefDisclosureAllowed", "promptDisclosureAllowed", "contentRefDisclosureAllowed", "localToolMutationAllowed", "swarmAllowed"]) requireConst(policy[field], false, `input.studentArchiveReadPolicy.${field}`);
  return { ...policy };
}

function assertReadPort(port) {
  if (!port || typeof port.readStudentVisibleArchivedResult !== "function") {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_READ_MISSING_PORT", "StudentAppAITutorResultArchiveReadPort.readStudentVisibleArchivedResult is required");
  }
  return port;
}

function assertPortResult(result, normalized) {
  rejectLeakedFields(result, "StudentAppAITutorResultArchiveReadPort result");
  assertPlainObject(result, "StudentAppAITutorResultArchiveReadPort result");
  requireConst(result.found, true, "StudentAppAITutorResultArchiveReadPort result.found");
  const source = assertReadSource(result.source);
  const card = assertResultCard(result.card, normalized);
  return { source, card };
}

function assertReadSource(source) {
  assertPlainObject(source, "StudentAppAITutorResultArchiveReadPort result.source");
  return {
    endpoint: requireConst(source.endpoint, targetEndpoint, "source.endpoint"),
    useCase: requireConst(source.useCase, targetUseCase, "source.useCase"),
    repository: requireConst(source.repository, targetRepository, "source.repository"),
    snapshotRepository: requireConst(source.snapshotRepository, targetSnapshotRepository, "source.snapshotRepository"),
    ownStudentOnly: requireConst(source.ownStudentOnly, true, "source.ownStudentOnly"),
    rowVerificationSourceVerified: requireConst(source.rowVerificationSourceVerified, true, "source.rowVerificationSourceVerified"),
  };
}

function assertResultCard(card, normalized) {
  rejectLeakedFields(card, "StudentAppAITutorResultArchiveReadPort result.card");
  assertPlainObject(card, "StudentAppAITutorResultArchiveReadPort result.card");
  const expected = normalized.archiveItem;
  requireConst(card.archiveItemId, expected.id, "card.archiveItemId");
  requireConst(card.status, "READY_FOR_STUDENT_APP_READ", "card.status");
  requireConst(card.materialType, expected.materialType, "card.materialType");
  requireConst(card.title, expected.title, "card.title");
  requireConst(card.source, expected.source, "card.source");
  requireConst(card.ocrStatus, expected.ocrStatus, "card.ocrStatus");
  requireConst(JSON.stringify(card.tags), JSON.stringify(expected.tags), "card.tags");
  requireConst(JSON.stringify(card.analysisIntents), JSON.stringify(expected.analysisIntents), "card.analysisIntents");
  requireConst(card.summary, normalized.safeGuidanceSnapshot.summary, "card.summary");
  requireConst(card.guidanceSectionsHash, normalized.safeGuidanceSnapshot.guidanceSectionsHash, "card.guidanceSectionsHash");
  requireConst(JSON.stringify(card.guidanceSections), JSON.stringify(normalized.safeGuidanceSnapshot.guidanceSections), "card.guidanceSections");
  requireConst(JSON.stringify(card.safetyLabels), JSON.stringify(normalized.safeGuidanceSnapshot.safetyLabels), "card.safetyLabels");
  requireIsoString(card.createdAt, "card.createdAt");
  return { ...card };
}

function buildVerificationRecord(normalized, verified, verifiedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ",
    recordId: `student_app_ai_tutor_result_student_archive_read_${safeToken(normalized.idempotencyKey)}`,
    verifiedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_PORT,
    status: verifiedStatus,
    readInvocationId: normalized.readInvocationId,
    sourceRowVerification: {
      runtimeId: rowVerificationRuntimeId,
      commandPort: rowVerificationCommandPort,
      recordId: normalized.rowVerificationResult.recordId,
      archiveItemId: normalized.archiveItem.id,
      targetRepository,
      targetSnapshotRepository,
      learningActionSource: normalized.rowVerificationResult.sourceStorageCommit?.learningActionSource,
      resultArchiveStatus: normalized.rowVerificationResult.sourceStorageCommit?.resultArchiveStatus,
      feedbackStatus: normalized.rowVerificationResult.sourceStorageCommit?.feedbackStatus,
    },
    principal: normalized.principal,
    studentResultReadSource: verified.source,
    resultArchiveCard: verified.card,
    boundary: buildBoundary(),
    evidenceRefs: uniqueEvidenceRefs([...normalized.evidenceRefs, ...normalized.rowVerificationResult.evidenceRefs, `evidence:student-app-ai-tutor-result-student-archive-read-input-hash:${normalized.verificationInputHash}`, `evidence:runtime:${STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_RUNTIME_ID}`, `evidence:command-port:${STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_PORT}`, `evidence:source-row-verification:${normalized.rowVerificationResult.recordId}`, `evidence:student-visible-result-card:${normalized.archiveItem.id}`]),
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.verificationInputHash,
    runtimeSlo: { targetP99Ms: 50, p99Ms: 5, totalErrors: 0, operations: 1, evidenceClass: "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_READ_PROBE" },
    nextAction: "Use this as Student App safe result-card read evidence; multi-model tutoring, OCR/RAG enrichment, and broad product release remain separate reviewed slices.",
  };
}

function buildBoundary() {
  return {
    rowVerificationRequired: true,
    physicalDatabaseRowVerified: true,
    ownStudentPrincipalRequired: true,
    injectedStudentResultArchiveReadPortInvoked: true,
    goUseCaseReadAllowed: true,
    httpEndpointContractVerified: true,
    studentVisibleResultCardReadVerified: true,
    safeGuidanceSnapshotRequired: true,
    safeGuidanceOnly: true,
    crossStudentLeakPrevented: true,
    contentRefDisclosed: false,
    resultRefDisclosed: false,
    answerKeyDisclosed: false,
    promptDisclosed: false,
    rawModelOutputDisclosed: false,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    modelInferenceStarted: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function buildResult(record, extra) {
  return { ...record, ...extra };
}

function appendVerificationRecord(logPath, record) {
  const absolute = path.resolve(logPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.appendFileSync(absolute, `${JSON.stringify(record)}\n`);
}

function findExistingRecordByIdempotencyKey(logPath, idempotencyKey) {
  const absolute = path.resolve(logPath);
  if (!fs.existsSync(absolute)) return null;
  const lines = fs.readFileSync(absolute, "utf8").split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const parsed = JSON.parse(lines[index]);
    if (parsed.recordType === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ" && parsed.idempotencyKey === idempotencyKey) return parsed;
  }
  return null;
}

function assertReplayMatches(record, normalized) {
  requireConst(record.inputHash, normalized.verificationInputHash, "record.inputHash");
  requireConst(record.status, verifiedStatus, "record.status");
  requireConst(record.sourceRowVerification.recordId, normalized.rowVerificationResult.recordId, "record.sourceRowVerification.recordId");
  requireConst(record.resultArchiveCard.archiveItemId, normalized.archiveItem.id, "record.resultArchiveCard.archiveItemId");
}

function assertGuidanceSections(sections) {
  if (!Array.isArray(sections) || sections.length === 0 || sections.length > 8) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_READ_GUIDANCE_SECTIONS", "guidanceSections length is invalid");
  }
  return sections.map((section, index) => {
    assertPlainObject(section, `guidanceSections[${index}]`);
    return {
      sectionId: requireSafeText(section.sectionId, `guidanceSections[${index}].sectionId`, 1, 128),
      title: requireSafeText(section.title, `guidanceSections[${index}].title`, 1, 200),
      text: requireSafeText(section.text, `guidanceSections[${index}].text`, 1, 1200),
      sourceBlockRefs: uniqueStringArray(section.sourceBlockRefs ?? [], `guidanceSections[${index}].sourceBlockRefs`, 1, 8),
    };
  });
}

function rejectLeakedFields(value, label) {
  const keys = collectKeys(value);
  for (const field of leakedFieldNames) {
    if (keys.has(field)) throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_READ_LEAKED_FIELD", `${label}.${field} is not allowed`);
  }
}

function collectKeys(value, keys = new Set()) {
  if (!value || typeof value !== "object") return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.add(key);
    collectKeys(child, keys);
  }
  return keys;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_READ_INVALID_OBJECT", `${label} must be an object`);
  }
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_READ_CONST", `${label} must be ${String(expected)}`);
  }
  return expected;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_READ_STRING", `${label} length is invalid`);
  }
  return value.trim();
}

function requireSafeText(value, label, min, max) {
  const text = requireBoundedString(value, label, min, max);
  if (/[<>]|\bscript\b|javascript:|data:/iu.test(text)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_READ_UNSAFE_TEXT", `${label} contains unsafe text`);
  }
  return text;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 520);
  if (!token.startsWith(prefix) || !/^[A-Za-z0-9:_-]+$/u.test(token)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_READ_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireStudentAITutorContentRef(value, label) {
  const ref = requireBoundedString(value, label, 1, 1000);
  if (!ref.startsWith("student-ai-tutor-result-archive:")) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_READ_CONTENT_REF", `${label} must be a Student App AI Tutor result archive ref`);
  }
  return ref;
}

function requireIsoString(value, label) {
  const text = requireBoundedString(value, label, 20, 80);
  if (Number.isNaN(Date.parse(text))) throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_READ_TIME", `${label} must be an ISO date-time`);
  return text;
}

function uniqueStringArray(values, label, min, max) {
  if (!Array.isArray(values) || values.length < min || values.length > max) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_READ_ARRAY", `${label} length is invalid`);
  }
  const normalized = values.map((value, index) => requireBoundedString(String(value), `${label}[${index}]`, 1, 420));
  if (new Set(normalized).size !== normalized.length) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_READ_ARRAY_UNIQUE", `${label} must be unique`);
  }
  return normalized;
}

function assertIncludes(values, required, label) {
  for (const item of required) {
    if (!values.includes(item)) throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_READ_REQUIRED_VALUE", `${label} must include ${item}`);
  }
  return values;
}

function uniqueEvidenceRefs(refs) {
  return [...new Set(refs.filter((ref) => typeof ref === "string" && ref.length > 0))];
}

function hashInput(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function safeToken(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9_-]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 180) || "unknown";
}

function verificationError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
