import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_generation_content_row_verification_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION_PORT =
  "StudentAppAITutorQuestionBankDraftGenerationContentRowVerificationPort.verifyQuestionBankDraftContentPhysicalRow";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION_READY =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION_READY";

const inputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-content-row-verification.v1";
const outputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-content-row-verified.v1";
const commitRuntimeId = "student_app_ai_tutor_question_bank_draft_generation_content_storage_commit_runtime";
const commitCommandPort = "StudentAppAITutorQuestionBankDraftGenerationContentStorageCommitPort.saveReviewedQuestionBankDraftContent";
const commitWorkload = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMIT";
const commitStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMITTED";
const verifiedStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_PHYSICAL_ROW_VERIFIED";
const targetRepository = "ArchiveRepository.GetQuestionBankDraftContentForStudent";
const targetTable = "teaching_question_bank_draft_contents";
const defaultVerificationLogPath =
  "reports/student-command-log/student-app-ai-tutor-question-bank-draft-generation-content-row-verification.jsonl";

const leakedInputFieldNames = [
  "rawModelOutput",
  "modelOutput",
  "modelResponse",
  "directSql",
  "dbUrl",
  "internalError",
  "errorMessage",
  "publishedAt",
  "publicationStatus",
];

export async function verifyStudentAppAITutorQuestionBankDraftGenerationContentPhysicalRow(input, options = {}) {
  const verifiedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const verificationLogPath = options.verificationLogPath ?? defaultVerificationLogPath;
  const existing = findExistingRecordByIdempotencyKey(verificationLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const rowReadPort = assertRowReadPort(options.questionBankDraftContentRowReadPort);
  const content = normalized.contentStorageCommitResult.questionBankDraftContent;
  const portResult = await rowReadPort.getQuestionBankDraftContentForStudent(
    content.questionBankDraftRef,
    content.studentId,
    {
      verificationInvocationId: normalized.verificationInvocationId,
      idempotencyKey: normalized.idempotencyKey,
      sourceContentStorageCommitRecordId: normalized.contentStorageCommitResult.recordId,
    },
  );
  const verified = assertPortResult(portResult, normalized.contentStorageCommitResult);
  const record = buildVerificationRecord(normalized, verified, verifiedAt);
  appendVerificationRecord(verificationLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftGenerationContentRowVerification(result) {
  return [
    `Student App AI Tutor question-bank generation content row verification: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Draft content: ${result.questionBankDraftContentRow.questionBankDraftRef}`,
    `Target: ${result.teachingArchiveContentPhysicalRow.targetRepository}`,
    `Physical row verified: ${result.boundary.physicalDatabaseRowVerified}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const verificationInvocationId = requireToken(input.verificationInvocationId, "input.verificationInvocationId", "qbank_generation_content_row_verification_");
  const contentStorageCommitReport = assertContentStorageCommitReport(input.contentStorageCommitReport);
  const contentStorageCommitResult = assertContentStorageCommitResult(contentStorageCommitReport);
  const verificationPolicy = assertVerificationPolicy(input.contentRowVerificationPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 480);
  if (!evidenceRefs.some((ref) => ref.includes("content-storage-commit"))) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_ROW_VERIFICATION_MISSING_COMMIT_EVIDENCE", "content storage commit evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const verificationInputHash = hashInput({
    verificationInvocationId,
    contentStorageCommitRecordId: contentStorageCommitResult.recordId,
    questionBankDraftContent: contentStorageCommitResult.questionBankDraftContent,
    safeStudentContentPreview: contentStorageCommitResult.safeStudentContentPreview,
    verificationPolicy,
  });
  return { verificationInvocationId, contentStorageCommitReport, contentStorageCommitResult, verificationPolicy, evidenceRefs, idempotencyKey, verificationInputHash };
}

function assertContentStorageCommitReport(report) {
  rejectLeakedFields(report, "input.contentStorageCommitReport");
  assertPlainObject(report, "input.contentStorageCommitReport");
  requireConst(report.readiness, "READY", "input.contentStorageCommitReport.readiness");
  requireConst(report.workloadType, commitWorkload, "input.contentStorageCommitReport.workloadType");
  requireConst(report.runtime?.runtimeId, commitRuntimeId, "input.contentStorageCommitReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, commitCommandPort, "input.contentStorageCommitReport.runtime.commandPort");
  requireConst(report.runtime?.status, commitStatus, "input.contentStorageCommitReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.contentStorageCommitReport.runtimeSlo.totalErrors");
  assertCommitInvariants(report.safetyInvariants ?? {});
  return report;
}

function assertCommitInvariants(boundary) {
  for (const field of [
    "teacherReviewRequired",
    "generationInputEnvelopeRequired",
    "injectedTeachingArchivePortRequired",
    "questionBankContentWriteStarted",
    "questionBankContentWriteCommitted",
    "contentStored",
    "teacherRubricInternalScoringOnly",
    "safeStudentPreviewOnly",
  ]) {
    requireConst(boundary[field], true, `input.contentStorageCommitReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "rawModelOutputStored",
    "answerKeyGeneratedByModel",
    "studentAnswerKeyDisclosed",
    "studentAnsweringAllowed",
    "scoringAllowed",
    "studentVisiblePublishAllowed",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "swarmAllowed",
  ]) {
    requireConst(boundary[field], false, `input.contentStorageCommitReport.safetyInvariants.${field}`);
  }
}

function assertContentStorageCommitResult(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationContentStorageCommit?.result;
  rejectLeakedFields(result, "input.contentStorageCommitReport.runtimeProbes.result");
  assertPlainObject(result, "input.contentStorageCommitReport.runtimeProbes.result");
  requireConst(result.schemaVersion, "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-content-storage-committed.v1", "source.schemaVersion");
  requireConst(result.runtimeId, commitRuntimeId, "source.runtimeId");
  requireConst(result.commandPort, commitCommandPort, "source.commandPort");
  requireConst(result.status, commitStatus, "source.status");
  requireConst(result.boundary?.questionBankContentWriteCommitted, true, "source.boundary.questionBankContentWriteCommitted");
  requireConst(result.boundary?.contentStored, true, "source.boundary.contentStored");
  requireConst(result.boundary?.studentSafeQuestionPreviewOnly, true, "source.boundary.studentSafeQuestionPreviewOnly");
  requireConst(result.boundary?.studentVisiblePublished, false, "source.boundary.studentVisiblePublished");
  requireConst(result.boundary?.studentAnswerKeyDisclosed, false, "source.boundary.studentAnswerKeyDisclosed");
  requireConst(result.boundary?.directDatabaseAccessAllowed, false, "source.boundary.directDatabaseAccessAllowed");
  requireConst(result.boundary?.executeHttpRequestAllowed, false, "source.boundary.executeHttpRequestAllowed");
  requireConst(result.boundary?.swarmAllowed, false, "source.boundary.swarmAllowed");
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "source.recordId", 1, 360),
    idempotencyKey: requireBoundedString(result.idempotencyKey, "source.idempotencyKey", 1, 360),
    teachingArchiveContentStorage: assertContentStorage(result.teachingArchiveContentStorage),
    questionBankDraftContent: assertCommittedContent(result.questionBankDraftContent),
    safeStudentContentPreview: assertSafePreview(result.safeStudentContentPreview, result.questionBankDraftContent?.itemCount),
    evidenceRefs: uniqueStringArray(result.evidenceRefs ?? [], "source.evidenceRefs", 1, 1400),
  };
}

function assertContentStorage(storage) {
  assertPlainObject(storage, "source.teachingArchiveContentStorage");
  return {
    operationId: requireConst(storage.operationId, "saveReviewedQuestionBankDraftContent", "source.teachingArchiveContentStorage.operationId"),
    targetUseCase: requireConst(storage.targetUseCase, "CommitReviewedQuestionBankDraftContent.Execute", "source.teachingArchiveContentStorage.targetUseCase"),
    targetRepository: requireConst(storage.targetRepository, "ArchiveRepository.SaveQuestionBankDraftContent", "source.teachingArchiveContentStorage.targetRepository"),
    targetTable: requireConst(storage.targetTable, targetTable, "source.teachingArchiveContentStorage.targetTable"),
  };
}

function assertCommittedContent(content) {
  assertPlainObject(content, "source.questionBankDraftContent");
  return {
    questionBankDraftRef: requireQuestionBankDraftRef(content.questionBankDraftRef, "source.questionBankDraftContent.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireToken(content.tutoringAnalysisRequestId, "source.questionBankDraftContent.tutoringAnalysisRequestId", "tutor_req_"),
    archiveItemId: requireToken(content.archiveItemId, "source.questionBankDraftContent.archiveItemId", "tarch_"),
    studentId: requireBoundedString(content.studentId, "source.questionBankDraftContent.studentId", 1, 128),
    status: requireConst(content.status, "DRAFT", "source.questionBankDraftContent.status"),
    sourceArchiveMaterial: requireEnum(content.sourceArchiveMaterial, "source.questionBankDraftContent.sourceArchiveMaterial", ["QUIZ", "PAPER", "HANDOUT", "HOMEWORK"]),
    resultSummary: requireSafeText(content.resultSummary, "source.questionBankDraftContent.resultSummary", 1, 2000),
    itemCount: requireInteger(content.itemCount, "source.questionBankDraftContent.itemCount", 1, 100),
    internalScoringMaterialStored: requireConst(content.internalScoringMaterialStored, true, "source.questionBankDraftContent.internalScoringMaterialStored"),
    studentAnswerKeyDisclosed: requireConst(content.studentAnswerKeyDisclosed, false, "source.questionBankDraftContent.studentAnswerKeyDisclosed"),
  };
}

function assertSafePreview(preview, itemCount) {
  assertPlainObject(preview, "source.safeStudentContentPreview");
  requireConst(preview.excludesExpectedAnswerAndExplanation, true, "source.safeStudentContentPreview.excludesExpectedAnswerAndExplanation");
  const items = assertPreviewItems(preview.items, itemCount, "source.safeStudentContentPreview.items");
  return { items, excludesExpectedAnswerAndExplanation: true };
}

function assertPreviewItems(items, itemCount, label) {
  if (!Array.isArray(items) || items.length !== itemCount) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_ROW_VERIFICATION_PREVIEW_COUNT", `${label} must match committed itemCount`);
  }
  return items.map((item, index) => {
    rejectForbiddenStudentPreviewFields(item, `${label}[${index}]`);
    assertPlainObject(item, `${label}[${index}]`);
    return {
      id: requireToken(item.id, `${label}[${index}].id`, "qbank_plan_item_"),
      questionText: requireSafeText(item.questionText, `${label}[${index}].questionText`, 12, 1200),
      learningTarget: requireSafeText(item.learningTarget, `${label}[${index}].learningTarget`, 3, 200),
    };
  });
}

function assertVerificationPolicy(policy) {
  assertPlainObject(policy, "input.contentRowVerificationPolicy");
  for (const field of [
    "contentStorageCommitRequired",
    "physicalRowVerificationRequired",
    "injectedQuestionBankDraftContentRowReadPortRequired",
    "archiveRepositoryScopedReadRequired",
    "committedContentMatchRequired",
    "safeStudentPreviewMatchRequired",
    "internalScoringMaterialNonDisclosureRequired",
    "idempotentRowVerificationRequired",
    "mainDatabaseReadAllowed",
  ]) {
    requireConst(policy[field], true, `input.contentRowVerificationPolicy.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "studentVisiblePublishAllowed",
    "studentAnsweringAllowed",
    "scoringAllowed",
    "answerKeyDisclosureAllowed",
    "rawModelOutputDisclosureAllowed",
    "modelInferenceAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.contentRowVerificationPolicy.${field}`);
  }
  return { ...policy };
}

function assertRowReadPort(port) {
  if (!port || typeof port.getQuestionBankDraftContentForStudent !== "function") {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_ROW_VERIFICATION_MISSING_PORT", "QuestionBankDraftContentRowReadPort.getQuestionBankDraftContentForStudent is required");
  }
  return port;
}

function assertPortResult(result, commitResult) {
  assertPlainObject(result, "QuestionBankDraftContentRowReadPort result");
  requireConst(result.found, true, "QuestionBankDraftContentRowReadPort result.found");
  const source = assertRowReadSource(result.source);
  const row = assertPhysicalRow(result.row, commitResult.questionBankDraftContent, commitResult.safeStudentContentPreview);
  assertRowMatchesCommit(row, commitResult.questionBankDraftContent);
  return { source, row };
}

function assertRowReadSource(source) {
  assertPlainObject(source, "QuestionBankDraftContentRowReadPort result.source");
  return {
    repositoryMethod: requireConst(source.repositoryMethod, targetRepository, "QuestionBankDraftContentRowReadPort result.source.repositoryMethod"),
    targetTable: requireConst(source.targetTable, targetTable, "QuestionBankDraftContentRowReadPort result.source.targetTable"),
    studentScopedLookup: requireConst(source.studentScopedLookup, true, "QuestionBankDraftContentRowReadPort result.source.studentScopedLookup"),
  };
}

function assertPhysicalRow(row, committedContent, committedPreview) {
  assertPlainObject(row, "QuestionBankDraftContentRowReadPort result.row");
  const normalized = {
    questionBankDraftRef: requireQuestionBankDraftRef(row.questionBankDraftRef, "QuestionBankDraftContentRowReadPort result.row.questionBankDraftRef"),
    tutoringAnalysisRequestId: requireToken(row.tutoringAnalysisRequestId, "QuestionBankDraftContentRowReadPort result.row.tutoringAnalysisRequestId", "tutor_req_"),
    archiveItemId: requireToken(row.archiveItemId, "QuestionBankDraftContentRowReadPort result.row.archiveItemId", "tarch_"),
    studentId: requireBoundedString(row.studentId, "QuestionBankDraftContentRowReadPort result.row.studentId", 1, 128),
    status: requireConst(row.status, "DRAFT", "QuestionBankDraftContentRowReadPort result.row.status"),
    sourceArchiveMaterial: requireEnum(row.sourceArchiveMaterial, "QuestionBankDraftContentRowReadPort result.row.sourceArchiveMaterial", ["QUIZ", "PAPER", "HANDOUT", "HOMEWORK"]),
    resultSummary: requireSafeText(row.resultSummary, "QuestionBankDraftContentRowReadPort result.row.resultSummary", 1, 2000),
    items: assertInternalRowItems(row.items, committedContent.itemCount, "QuestionBankDraftContentRowReadPort result.row.items"),
    internalScoringMaterialPresent: requireConst(row.internalScoringMaterialPresent, true, "QuestionBankDraftContentRowReadPort result.row.internalScoringMaterialPresent"),
  };
  const safeItems = normalized.items.map((item) => ({
    id: item.id,
    questionText: item.questionText,
    learningTarget: item.learningTarget,
  }));
  requireConst(JSON.stringify(safeItems), JSON.stringify(committedPreview.items), "QuestionBankDraftContentRowReadPort result.row.safePreview");
  return normalized;
}

function assertInternalRowItems(items, itemCount, label) {
  if (!Array.isArray(items) || items.length !== itemCount) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_ROW_VERIFICATION_ITEM_COUNT", `${label} must match committed itemCount`);
  }
  const seen = new Set();
  return items.map((item, index) => {
    assertPlainObject(item, `${label}[${index}]`);
    const id = requireToken(item.id, `${label}[${index}].id`, "qbank_plan_item_");
    if (seen.has(id)) throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_ROW_VERIFICATION_DUPLICATE_ITEM", `${id} is duplicated`);
    seen.add(id);
    requireSafeText(item.expectedAnswer, `${label}[${index}].expectedAnswer`, 2, 1200);
    requireSafeText(item.explanation, `${label}[${index}].explanation`, 2, 1600);
    return {
      id,
      questionText: requireSafeText(item.questionText, `${label}[${index}].questionText`, 12, 1200),
      learningTarget: requireSafeText(item.learningTarget, `${label}[${index}].learningTarget`, 3, 200),
    };
  });
}

function assertRowMatchesCommit(row, committed) {
  for (const field of ["questionBankDraftRef", "tutoringAnalysisRequestId", "archiveItemId", "studentId", "status", "sourceArchiveMaterial", "resultSummary"]) {
    requireConst(row[field], committed[field], `QuestionBankDraftContentRowReadPort result.row.${field}`);
  }
  requireConst(row.items.length, committed.itemCount, "QuestionBankDraftContentRowReadPort result.row.itemCount");
}

function buildVerificationRecord(normalized, verified, verifiedAt) {
  const committed = normalized.contentStorageCommitResult.questionBankDraftContent;
  const safePreview = normalized.contentStorageCommitResult.safeStudentContentPreview;
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION",
    recordId: `student_app_ai_tutor_question_bank_draft_generation_content_row_verification_${safeToken(normalized.idempotencyKey)}`,
    recordedAt: verifiedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION_PORT,
    status: verifiedStatus,
    verificationInvocationId: normalized.verificationInvocationId,
    sourceContentStorageCommit: {
      runtimeId: commitRuntimeId,
      recordId: normalized.contentStorageCommitResult.recordId,
      questionBankDraftRef: committed.questionBankDraftRef,
      studentId: committed.studentId,
      priorStatus: commitStatus,
    },
    teachingArchiveContentPhysicalRow: {
      operationId: "getQuestionBankDraftContentForStudent",
      targetRepository: verified.source.repositoryMethod,
      targetTable: verified.source.targetTable,
      studentScopedLookup: verified.source.studentScopedLookup,
    },
    questionBankDraftContentRow: {
      questionBankDraftRef: committed.questionBankDraftRef,
      tutoringAnalysisRequestId: committed.tutoringAnalysisRequestId,
      archiveItemId: committed.archiveItemId,
      studentId: committed.studentId,
      status: committed.status,
      sourceArchiveMaterial: committed.sourceArchiveMaterial,
      resultSummary: committed.resultSummary,
      itemCount: committed.itemCount,
      internalScoringMaterialPresent: true,
      studentAnswerKeyDisclosed: false,
    },
    safeStudentContentPreview: safePreview,
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.contentStorageCommitResult.evidenceRefs,
        `evidence:question-bank-generation-content-row-verification-input-hash:${normalized.verificationInputHash}`,
        `evidence:runtime:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION_RUNTIME_ID}`,
        `evidence:command-port:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION_PORT}`,
        `evidence:source-content-storage-commit-record:${normalized.contentStorageCommitResult.recordId}`,
        `evidence:target-repository:${targetRepository}`,
        `evidence:target-table:${targetTable}`,
      ]),
      idempotencyKey: normalized.idempotencyKey,
      verificationInputHash: normalized.verificationInputHash,
    },
    boundary: buildBoundary(),
  };
}

function buildBoundary() {
  return {
    contentStorageCommitVerified: true,
    questionBankContentRowReadPortInvoked: true,
    archiveRepositoryScopedReadUsed: true,
    committedContentMatchedPhysicalRow: true,
    safeStudentPreviewMatchedPhysicalRow: true,
    internalScoringMaterialPresent: true,
    internalScoringMaterialDisclosed: false,
    questionBankContentWriteCommitted: true,
    physicalDatabaseRowVerified: true,
    mainDatabaseReadAllowed: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    studentVisiblePublished: false,
    studentAnsweringStarted: false,
    scoringStarted: false,
    answerKeyDisclosed: false,
    rawModelOutputDisclosed: false,
    modelInferenceStarted: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
    requiresFutureStudentReadVerification: true,
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
    sourceContentStorageCommit: record.sourceContentStorageCommit,
    teachingArchiveContentPhysicalRow: record.teachingArchiveContentPhysicalRow,
    questionBankDraftContentRow: record.questionBankDraftContentRow,
    safeStudentContentPreview: record.safeStudentContentPreview,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 50,
      evidenceClass: "STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_ROW_VERIFICATION_BOUNDARY",
    },
    nextAction: "Use this as physical row verification evidence for reviewed question-bank content; student read verification, answering, scoring, and publication remain separate reviewed slices.",
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
    if (record?.recordType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.verificationInvocationId !== normalized.verificationInvocationId ||
    existing.sourceContentStorageCommit?.recordId !== normalized.contentStorageCommitResult.recordId ||
    existing.evidence?.verificationInputHash !== normalized.verificationInputHash) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_ROW_VERIFICATION_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different row verification");
  }
}

function rejectLeakedFields(value, context) {
  if (!value || typeof value !== "object") return;
  const stack = [{ value, path: context }];
  while (stack.length) {
    const current = stack.pop();
    if (!current.value || typeof current.value !== "object") continue;
    for (const [key, nested] of Object.entries(current.value)) {
      if (leakedInputFieldNames.includes(key)) {
        throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_ROW_VERIFICATION_LEAKED_FIELD", `${current.path}.${key} is not allowed`);
      }
      if (nested && typeof nested === "object") stack.push({ value: nested, path: `${current.path}.${key}` });
    }
  }
}

function rejectForbiddenStudentPreviewFields(value, label) {
  for (const field of ["expectedAnswer", "explanation", "answerKey", "correctAnswer"]) {
    if (Object.hasOwn(value ?? {}, field)) {
      throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_ROW_VERIFICATION_PREVIEW_LEAK", `${label}.${field} is not allowed in student preview`);
    }
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_ROW_VERIFICATION_INVALID_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_ROW_VERIFICATION_CONST", `${label} must be ${String(expected)}`);
  }
  return expected;
}

function requireInteger(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_ROW_VERIFICATION_INTEGER", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string") {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_ROW_VERIFICATION_STRING", `${label} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_ROW_VERIFICATION_STRING_LENGTH", `${label} length is invalid`);
  }
  return trimmed;
}

function requireSafeText(value, label, min, max) {
  const text = requireBoundedString(value, label, min, max);
  if (/[<>]/u.test(text) || /script:/iu.test(text) || /javascript:/iu.test(text)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_ROW_VERIFICATION_UNSAFE_TEXT", `${label} must be encoded safe text`);
  }
  return text;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 260);
  if (!token.startsWith(prefix)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_ROW_VERIFICATION_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireQuestionBankDraftRef(value, label) {
  const ref = requireBoundedString(value, label, 1, 1000);
  if (!ref.startsWith("local://question-bank-drafts/") || !ref.endsWith(".json")) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_ROW_VERIFICATION_DRAFT_REF", `${label} must be a local question-bank draft ref`);
  }
  return ref;
}

function requireEnum(value, label, allowed) {
  if (!allowed.includes(value)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_ROW_VERIFICATION_ENUM", `${label} must be one of ${allowed.join(",")}`);
  }
  return value;
}

function uniqueStringArray(value, label, min, max) {
  if (!Array.isArray(value)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_ROW_VERIFICATION_ARRAY", `${label} must be an array`);
  }
  const normalized = value.map((item, index) => requireBoundedString(item, `${label}[${index}]`, 1, 1000));
  const unique = uniq(normalized);
  if (unique.length !== normalized.length || unique.length < min || unique.length > max) {
    throw verificationError("STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_ROW_VERIFICATION_ARRAY_SIZE", `${label} must contain ${min}-${max} unique strings`);
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
