import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_content_student_read_verification_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION_PORT =
  "StudentAppAITutorQuestionBankDraftContentStudentReadVerificationPort.verifyStudentSafeQuestionBankDraftContentRead";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION_READY =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION_READY";

const inputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-content-student-read-verification.v1";
const outputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-content-student-read-verified.v1";
const contentRowVerificationRuntimeId = "student_app_ai_tutor_question_bank_draft_generation_content_row_verification_runtime";
const contentRowVerificationStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_PHYSICAL_ROW_VERIFIED";
const contentReadFoundationRuntimeId = "student_app_ai_tutor_question_bank_draft_content_read_foundation";
const contentReadFoundationWorkload = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_READ_FOUNDATION";
const verifiedStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFIED";
const targetUseCase = "ReadStudentAppQuestionBankDraftContent.Execute";
const targetRepository = "ArchiveRepository.GetQuestionBankDraftContentForStudent";
const targetEndpoint = "GET /v1/student-app/question-bank-draft-content";
const defaultVerificationLogPath =
  "reports/student-command-log/student-app-ai-tutor-question-bank-draft-content-student-read-verification.jsonl";

const leakedKeyNames = [
  "studentId",
  "workerId",
  "claimedByWorkerId",
  "claimExpiresAt",
  "expectedAnswer",
  "explanation",
  "answerKey",
  "correctAnswer",
  "score",
  "scoreSummary",
  "rawModelOutput",
  "modelOutput",
  "modelResponse",
  "publishedAt",
  "publicationStatus",
  "directSql",
  "dbUrl",
  "internalError",
  "errorMessage",
];

export async function verifyStudentAppAITutorQuestionBankDraftContentStudentRead(input, options = {}) {
  const verifiedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const verificationLogPath = options.verificationLogPath ?? defaultVerificationLogPath;
  const existing = findExistingRecordByIdempotencyKey(verificationLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const readPort = assertStudentReadPort(options.studentQuestionBankDraftContentReadPort);
  const readResult = await readPort.readStudentAppQuestionBankDraftContent(
    {
      principal: normalized.principal,
      questionBankDraftRef: normalized.verifiedContent.questionBankDraftRef,
    },
    {
      verificationInvocationId: normalized.verificationInvocationId,
      idempotencyKey: normalized.idempotencyKey,
      sourceContentRowVerificationRecordId: normalized.contentRowVerificationResult.recordId,
    },
  );
  const verifiedRead = assertStudentReadResult(readResult, normalized);
  const record = buildVerificationRecord(normalized, verifiedRead, verifiedAt);
  appendVerificationRecord(verificationLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftContentStudentReadVerification(result) {
  return [
    `Student App AI Tutor question-bank draft content student read verification: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Use case: ${result.studentReadSource.targetUseCase}`,
    `Draft content: ${result.studentQuestionBankDraftContent.questionBankDraftRef}`,
    `Own-student safe read verified: ${result.boundary.ownStudentSafeReadVerified}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input", { allowStudentIdInSourceReports: true });
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const verificationInvocationId = requireToken(input.verificationInvocationId, "input.verificationInvocationId", "qbank_content_student_read_verification_");
  const principal = assertPrincipal(input.principal);
  const contentRowVerificationReport = assertContentRowVerificationReport(input.contentRowVerificationReport);
  const contentRowVerificationResult = assertContentRowVerificationResult(contentRowVerificationReport);
  const contentReadFoundationReport = assertContentReadFoundationReport(input.contentReadFoundationReport);
  const verificationPolicy = assertVerificationPolicy(input.studentReadVerificationPolicy);
  requireConst(principal.studentAccess.ownStudentId, contentRowVerificationResult.questionBankDraftContentRow.studentId, "input.principal.studentAccess.ownStudentId");
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 520);
  if (!evidenceRefs.some((ref) => ref.includes("content-row-verification"))) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_CONTENT_STUDENT_READ_MISSING_ROW_EVIDENCE", "content row verification evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("content-read-foundation"))) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_CONTENT_STUDENT_READ_MISSING_READ_FOUNDATION_EVIDENCE", "content read foundation evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const verifiedContent = contentRowVerificationResult.questionBankDraftContentRow;
  const verificationInputHash = hashInput({
    verificationInvocationId,
    principalId: principal.principalId,
    ownStudentId: principal.studentAccess.ownStudentId,
    sourceContentRowVerificationRecordId: contentRowVerificationResult.recordId,
    verifiedContent,
    safeStudentContentPreview: contentRowVerificationResult.safeStudentContentPreview,
    contentReadFoundationRuntimeId: contentReadFoundationReport.runtime.runtimeId,
    verificationPolicy,
  });
  return {
    verificationInvocationId,
    principal,
    contentRowVerificationReport,
    contentRowVerificationResult,
    contentReadFoundationReport,
    verificationPolicy,
    evidenceRefs,
    idempotencyKey,
    verifiedContent,
    verificationInputHash,
  };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const principalId = requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128);
  requireConst(principal.subjectType, "USER", "input.principal.subjectType");
  requireConst(principal.role, "STUDENT", "input.principal.role");
  requireConst(principal.entryPoint, "STUDENT_APP", "input.principal.entryPoint");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  if (!scopes.includes("STUDENT_OWN_READ")) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_CONTENT_STUDENT_READ_MISSING_SCOPE", "STUDENT_OWN_READ is required");
  }
  assertPlainObject(principal.studentAccess, "input.principal.studentAccess");
  requireConst(principal.studentAccess.mode, "OWN", "input.principal.studentAccess.mode");
  return {
    principalId,
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 160),
    subjectType: "USER",
    role: "STUDENT",
    entryPoint: "STUDENT_APP",
    scopes,
    studentAccess: {
      mode: "OWN",
      ownStudentId: requireBoundedString(principal.studentAccess.ownStudentId, "input.principal.studentAccess.ownStudentId", 1, 128),
    },
  };
}

function assertContentRowVerificationReport(report) {
  assertPlainObject(report, "input.contentRowVerificationReport");
  requireConst(report.readiness, "READY", "input.contentRowVerificationReport.readiness");
  requireConst(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION", "input.contentRowVerificationReport.workloadType");
  requireConst(report.runtime?.runtimeId, contentRowVerificationRuntimeId, "input.contentRowVerificationReport.runtime.runtimeId");
  requireConst(report.runtime?.status, contentRowVerificationStatus, "input.contentRowVerificationReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.contentRowVerificationReport.runtimeSlo.totalErrors");
  assertContentRowVerificationInvariants(report.safetyInvariants ?? {});
  return report;
}

function assertContentRowVerificationInvariants(invariants) {
  for (const field of [
    "contentStorageCommitRequired",
    "archiveRepositoryScopedReadUsed",
    "committedContentMatchedPhysicalRow",
    "safeStudentPreviewMatchedPhysicalRow",
    "internalScoringMaterialPresent",
    "physicalDatabaseRowVerified",
  ]) {
    requireConst(invariants[field], true, `input.contentRowVerificationReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "internalScoringMaterialDisclosed",
    "studentVisiblePublishAllowed",
    "studentAnsweringAllowed",
    "scoringAllowed",
    "answerKeyDisclosureAllowed",
    "rawModelOutputDisclosureAllowed",
    "modelInferenceAllowed",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "swarmAllowed",
  ]) {
    requireConst(invariants[field], false, `input.contentRowVerificationReport.safetyInvariants.${field}`);
  }
}

function assertContentRowVerificationResult(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationContentRowVerification?.result;
  assertPlainObject(result, "input.contentRowVerificationReport.runtimeProbes.result");
  requireConst(result.schemaVersion, "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-content-row-verified.v1", "row.source.schemaVersion");
  requireConst(result.runtimeId, contentRowVerificationRuntimeId, "row.source.runtimeId");
  requireConst(result.status, contentRowVerificationStatus, "row.source.status");
  requireConst(result.boundary?.physicalDatabaseRowVerified, true, "row.source.boundary.physicalDatabaseRowVerified");
  requireConst(result.boundary?.archiveRepositoryScopedReadUsed, true, "row.source.boundary.archiveRepositoryScopedReadUsed");
  requireConst(result.boundary?.safeStudentPreviewMatchedPhysicalRow, true, "row.source.boundary.safeStudentPreviewMatchedPhysicalRow");
  requireConst(result.boundary?.internalScoringMaterialDisclosed, false, "row.source.boundary.internalScoringMaterialDisclosed");
  requireConst(result.boundary?.answerKeyDisclosed, false, "row.source.boundary.answerKeyDisclosed");
  requireConst(result.boundary?.studentAnsweringStarted, false, "row.source.boundary.studentAnsweringStarted");
  requireConst(result.boundary?.scoringStarted, false, "row.source.boundary.scoringStarted");
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "row.source.recordId", 1, 360),
    questionBankDraftContentRow: assertVerifiedContentRow(result.questionBankDraftContentRow),
    safeStudentContentPreview: assertSafePreview(result.safeStudentContentPreview, result.questionBankDraftContentRow?.itemCount),
    evidenceRefs: uniqueStringArray(result.evidenceRefs ?? [], "row.source.evidenceRefs", 1, 1600),
  };
}

function assertVerifiedContentRow(row) {
  assertPlainObject(row, "row.source.questionBankDraftContentRow");
  return {
    questionBankDraftRef: requireQuestionBankDraftRef(row.questionBankDraftRef, "row.source.questionBankDraftContentRow.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireToken(row.tutoringAnalysisRequestId, "row.source.questionBankDraftContentRow.tutoringAnalysisRequestId", "tutor_req_"),
    archiveItemId: requireToken(row.archiveItemId, "row.source.questionBankDraftContentRow.archiveItemId", "tarch_"),
    studentId: requireBoundedString(row.studentId, "row.source.questionBankDraftContentRow.studentId", 1, 128),
    status: requireConst(row.status, "DRAFT", "row.source.questionBankDraftContentRow.status"),
    sourceArchiveMaterial: requireEnum(row.sourceArchiveMaterial, "row.source.questionBankDraftContentRow.sourceArchiveMaterial", ["QUIZ", "PAPER", "HANDOUT", "HOMEWORK"]),
    resultSummary: requireSafeText(row.resultSummary, "row.source.questionBankDraftContentRow.resultSummary", 1, 2000),
    itemCount: requireInteger(row.itemCount, "row.source.questionBankDraftContentRow.itemCount", 1, 100),
    internalScoringMaterialPresent: requireConst(row.internalScoringMaterialPresent, true, "row.source.questionBankDraftContentRow.internalScoringMaterialPresent"),
    studentAnswerKeyDisclosed: requireConst(row.studentAnswerKeyDisclosed, false, "row.source.questionBankDraftContentRow.studentAnswerKeyDisclosed"),
  };
}

function assertSafePreview(preview, itemCount) {
  assertPlainObject(preview, "row.source.safeStudentContentPreview");
  requireConst(preview.excludesExpectedAnswerAndExplanation, true, "row.source.safeStudentContentPreview.excludesExpectedAnswerAndExplanation");
  const items = assertSafeItems(preview.items, itemCount, "row.source.safeStudentContentPreview.items");
  return { items, excludesExpectedAnswerAndExplanation: true };
}

function assertContentReadFoundationReport(report) {
  assertPlainObject(report, "input.contentReadFoundationReport");
  requireConst(report.readiness, "READY", "input.contentReadFoundationReport.readiness");
  requireConst(report.workloadType, contentReadFoundationWorkload, "input.contentReadFoundationReport.workloadType");
  requireConst(report.runtime?.runtimeId, contentReadFoundationRuntimeId, "input.contentReadFoundationReport.runtime.runtimeId");
  requireConst(report.runtime?.useCase, targetUseCase, "input.contentReadFoundationReport.runtime.useCase");
  requireConst(report.runtime?.repository, targetRepository, "input.contentReadFoundationReport.runtime.repository");
  requireConst(report.runtime?.endpoint, targetEndpoint, "input.contentReadFoundationReport.runtime.endpoint");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.contentReadFoundationReport.runtimeSlo.totalErrors");
  const invariants = report.safetyInvariants ?? {};
  for (const field of ["ownStudentOnly", "draftRefAndStudentScopedLookup"]) {
    requireConst(invariants[field], true, `input.contentReadFoundationReport.safetyInvariants.${field}`);
  }
  for (const field of ["exposesStudentId", "exposesWorkerLease", "exposesExpectedAnswer", "exposesExplanation", "scoringAllowed", "studentVisiblePublishAllowed", "modelInferenceAllowed"]) {
    requireConst(invariants[field], false, `input.contentReadFoundationReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertVerificationPolicy(policy) {
  assertPlainObject(policy, "input.studentReadVerificationPolicy");
  for (const field of [
    "contentRowVerificationRequired",
    "contentReadFoundationRequired",
    "injectedStudentContentReadPortRequired",
    "ownStudentPrincipalRequired",
    "safeStudentResponseRequired",
    "safePreviewMatchRequired",
    "idempotentStudentReadVerificationRequired",
    "goUseCaseReadAllowed",
  ]) {
    requireConst(policy[field], true, `input.studentReadVerificationPolicy.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "studentAnsweringAllowed",
    "scoringAllowed",
    "answerKeyDisclosureAllowed",
    "expectedAnswerDisclosureAllowed",
    "explanationDisclosureAllowed",
    "studentIdDisclosureAllowed",
    "workerStateDisclosureAllowed",
    "modelInferenceAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.studentReadVerificationPolicy.${field}`);
  }
  return { ...policy };
}

function assertStudentReadPort(port) {
  if (!port || typeof port.readStudentAppQuestionBankDraftContent !== "function") {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_CONTENT_STUDENT_READ_MISSING_PORT", "StudentQuestionBankDraftContentReadPort.readStudentAppQuestionBankDraftContent is required");
  }
  return port;
}

function assertStudentReadResult(result, normalized) {
  assertPlainObject(result, "StudentQuestionBankDraftContentReadPort result");
  requireConst(result.found, true, "StudentQuestionBankDraftContentReadPort result.found");
  const source = assertStudentReadSource(result.source, normalized.principal);
  const response = assertStudentSafeResponse(result.response, normalized);
  return { source, response };
}

function assertStudentReadSource(source, principal) {
  assertPlainObject(source, "StudentQuestionBankDraftContentReadPort result.source");
  return {
    targetUseCase: requireConst(source.targetUseCase, targetUseCase, "StudentQuestionBankDraftContentReadPort result.source.targetUseCase"),
    repository: requireConst(source.repository, targetRepository, "StudentQuestionBankDraftContentReadPort result.source.repository"),
    endpoint: requireConst(source.endpoint, targetEndpoint, "StudentQuestionBankDraftContentReadPort result.source.endpoint"),
    ownStudentOnly: requireConst(source.ownStudentOnly, true, "StudentQuestionBankDraftContentReadPort result.source.ownStudentOnly"),
    studentScopedLookup: requireConst(source.studentScopedLookup, true, "StudentQuestionBankDraftContentReadPort result.source.studentScopedLookup"),
    principalId: requireConst(source.principalId, principal.principalId, "StudentQuestionBankDraftContentReadPort result.source.principalId"),
  };
}

function assertStudentSafeResponse(response, normalized) {
  rejectLeakedFields(response, "StudentQuestionBankDraftContentReadPort result.response");
  assertPlainObject(response, "StudentQuestionBankDraftContentReadPort result.response");
  const verified = normalized.verifiedContent;
  const safeItems = assertSafeItems(response.items, verified.itemCount, "StudentQuestionBankDraftContentReadPort result.response.items");
  requireConst(JSON.stringify(safeItems), JSON.stringify(normalized.contentRowVerificationResult.safeStudentContentPreview.items), "StudentQuestionBankDraftContentReadPort result.response.safeItems");
  return {
    questionBankDraftRef: requireConst(response.questionBankDraftRef, verified.questionBankDraftRef, "StudentQuestionBankDraftContentReadPort result.response.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireConst(response.tutoringAnalysisRequestId, verified.tutoringAnalysisRequestId, "StudentQuestionBankDraftContentReadPort result.response.tutoringAnalysisRequestId"),
    archiveItemId: requireConst(response.archiveItemId, verified.archiveItemId, "StudentQuestionBankDraftContentReadPort result.response.archiveItemId"),
    sourceArchiveMaterial: requireConst(response.sourceArchiveMaterial, verified.sourceArchiveMaterial, "StudentQuestionBankDraftContentReadPort result.response.sourceArchiveMaterial"),
    resultSummary: requireConst(requireSafeText(response.resultSummary, "StudentQuestionBankDraftContentReadPort result.response.resultSummary", 1, 2000), verified.resultSummary, "StudentQuestionBankDraftContentReadPort result.response.resultSummary"),
    items: safeItems,
    createdAt: requireBoundedString(response.createdAt, "StudentQuestionBankDraftContentReadPort result.response.createdAt", 1, 80),
    updatedAt: requireBoundedString(response.updatedAt, "StudentQuestionBankDraftContentReadPort result.response.updatedAt", 1, 80),
  };
}

function assertSafeItems(items, itemCount, label) {
  if (!Array.isArray(items) || items.length !== itemCount) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_CONTENT_STUDENT_READ_ITEM_COUNT", `${label} must match verified itemCount`);
  }
  const seen = new Set();
  return items.map((item, index) => {
    rejectLeakedFields(item, `${label}[${index}]`);
    assertPlainObject(item, `${label}[${index}]`);
    const id = requireBoundedString(item.id, `${label}[${index}].id`, 1, 128);
    if (seen.has(id)) throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_CONTENT_STUDENT_READ_DUPLICATE_ITEM", `${id} is duplicated`);
    seen.add(id);
    return {
      id,
      questionText: requireSafeText(item.questionText, `${label}[${index}].questionText`, 1, 2000),
      learningTarget: optionalSafeText(item.learningTarget, `${label}[${index}].learningTarget`, 1, 200),
    };
  });
}

function buildVerificationRecord(normalized, verifiedRead, verifiedAt) {
  const verified = normalized.verifiedContent;
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION",
    recordId: `student_app_ai_tutor_question_bank_draft_content_student_read_verification_${safeToken(normalized.idempotencyKey)}`,
    recordedAt: verifiedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION_PORT,
    status: verifiedStatus,
    verificationInvocationId: normalized.verificationInvocationId,
    principal: {
      principalId: normalized.principal.principalId,
      role: normalized.principal.role,
      entryPoint: normalized.principal.entryPoint,
      studentAccessMode: normalized.principal.studentAccess.mode,
    },
    sourceContentRowVerification: {
      runtimeId: contentRowVerificationRuntimeId,
      recordId: normalized.contentRowVerificationResult.recordId,
      questionBankDraftRef: verified.questionBankDraftRef,
      priorStatus: contentRowVerificationStatus,
    },
    sourceContentReadFoundation: {
      runtimeId: contentReadFoundationRuntimeId,
      useCase: targetUseCase,
      repository: targetRepository,
      endpoint: targetEndpoint,
    },
    studentReadSource: verifiedRead.source,
    studentQuestionBankDraftContent: verifiedRead.response,
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.contentRowVerificationResult.evidenceRefs,
        `evidence:question-bank-content-student-read-verification-input-hash:${normalized.verificationInputHash}`,
        `evidence:runtime:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION_RUNTIME_ID}`,
        `evidence:command-port:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION_PORT}`,
        `evidence:source-content-row-verification-record:${normalized.contentRowVerificationResult.recordId}`,
        `evidence:source-content-read-foundation:${contentReadFoundationRuntimeId}`,
        `evidence:target-use-case:${targetUseCase}`,
      ]),
      idempotencyKey: normalized.idempotencyKey,
      verificationInputHash: normalized.verificationInputHash,
    },
    boundary: buildBoundary(),
  };
}

function buildBoundary() {
  return {
    contentRowVerificationConsumed: true,
    contentReadFoundationConsumed: true,
    injectedStudentContentReadPortInvoked: true,
    ownStudentPrincipalVerified: true,
    ownStudentSafeReadVerified: true,
    safeStudentResponseMatchedVerifiedPreview: true,
    expectedAnswerDisclosed: false,
    explanationDisclosed: false,
    answerKeyDisclosed: false,
    studentIdDisclosed: false,
    workerStateDisclosed: false,
    studentAnsweringStarted: false,
    scoringStarted: false,
    studentVisiblePublished: false,
    modelInferenceStarted: false,
    goUseCaseReadAllowed: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
    requiresFutureAnsweringAndScoring: true,
  };
}

function buildResult(record, options) {
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: record.runtimeId,
    commandPort: record.commandPort,
    status: record.status,
    recordId: record.recordId,
    recordedAt: record.recordedAt,
    idempotencyKey: record.evidence.idempotencyKey,
    idempotentReplay: options.idempotentReplay === true,
    sourceContentRowVerification: record.sourceContentRowVerification,
    sourceContentReadFoundation: record.sourceContentReadFoundation,
    studentReadSource: record.studentReadSource,
    studentQuestionBankDraftContent: record.studentQuestionBankDraftContent,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 50,
      evidenceClass: "STUDENT_APP_AI_TUTOR_QBANK_CONTENT_STUDENT_READ_VERIFICATION_BOUNDARY",
    },
    nextAction: "Use this as own-student safe content read verification evidence; answering, scoring, feedback publication, and model inference remain separate reviewed slices.",
  };
}

function appendVerificationRecord(verificationLogPath, record) {
  const absolute = path.resolve(verificationLogPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.appendFileSync(absolute, `${JSON.stringify(record)}\n`);
}

function findExistingRecordByIdempotencyKey(verificationLogPath, idempotencyKey) {
  const absolute = path.resolve(verificationLogPath);
  if (!fs.existsSync(absolute)) return null;
  const lines = fs.readFileSync(absolute, "utf8").split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const record = JSON.parse(lines[index]);
    if (record?.recordType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.verificationInvocationId !== normalized.verificationInvocationId ||
    existing.sourceContentRowVerification?.recordId !== normalized.contentRowVerificationResult.recordId ||
    existing.evidence?.verificationInputHash !== normalized.verificationInputHash) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_CONTENT_STUDENT_READ_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different student read verification");
  }
}

function rejectLeakedFields(value, context, options = {}) {
  if (!value || typeof value !== "object") return;
  const stack = [{ value, path: context }];
  while (stack.length) {
    const current = stack.pop();
    if (!current.value || typeof current.value !== "object") continue;
    for (const [key, nested] of Object.entries(current.value)) {
      if (leakedKeyNames.includes(key) && !(options.allowStudentIdInSourceReports && key === "studentId")) {
        throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_CONTENT_STUDENT_READ_LEAKED_FIELD", `${current.path}.${key} is not allowed`);
      }
      if (nested && typeof nested === "object") stack.push({ value: nested, path: `${current.path}.${key}` });
    }
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_CONTENT_STUDENT_READ_INVALID_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_CONTENT_STUDENT_READ_CONST", `${label} must be ${String(expected)}`);
  }
  return expected;
}

function requireInteger(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_CONTENT_STUDENT_READ_INTEGER", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string") {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_CONTENT_STUDENT_READ_STRING", `${label} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_CONTENT_STUDENT_READ_STRING_LENGTH", `${label} length is invalid`);
  }
  return trimmed;
}

function requireSafeText(value, label, min, max) {
  const text = requireBoundedString(value, label, min, max);
  if (/[<>]/u.test(text) || /script:/iu.test(text) || /javascript:/iu.test(text)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_CONTENT_STUDENT_READ_UNSAFE_TEXT", `${label} must be encoded safe text`);
  }
  return text;
}

function optionalSafeText(value, label, min, max) {
  if (value === undefined || value === null || value === "") return "";
  return requireSafeText(value, label, min, max);
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 260);
  if (!token.startsWith(prefix)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_CONTENT_STUDENT_READ_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireQuestionBankDraftRef(value, label) {
  const ref = requireBoundedString(value, label, 1, 1000);
  if (!ref.startsWith("local://question-bank-drafts/") || !ref.endsWith(".json")) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_CONTENT_STUDENT_READ_DRAFT_REF", `${label} must be a local question-bank draft ref`);
  }
  return ref;
}

function requireEnum(value, label, allowed) {
  if (!allowed.includes(value)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_CONTENT_STUDENT_READ_ENUM", `${label} must be one of ${allowed.join(",")}`);
  }
  return value;
}

function uniqueStringArray(value, label, min, max) {
  if (!Array.isArray(value)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_CONTENT_STUDENT_READ_ARRAY", `${label} must be an array`);
  }
  const normalized = value.map((item, index) => requireBoundedString(item, `${label}[${index}]`, 1, 1000));
  const unique = uniq(normalized);
  if (unique.length !== normalized.length || unique.length < min || unique.length > max) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_CONTENT_STUDENT_READ_ARRAY_SIZE", `${label} must contain ${min}-${max} unique strings`);
  }
  return unique;
}

function uniq(values) {
  return [...new Set(values)];
}

function hashInput(input) {
  return `sha256:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`;
}

function safeToken(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 180);
}

function verificationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
