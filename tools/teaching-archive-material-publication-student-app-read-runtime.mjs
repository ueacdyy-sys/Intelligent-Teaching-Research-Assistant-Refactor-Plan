import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_RUNTIME_ID =
  "teaching_archive_material_publication_student_app_read_runtime";
export const TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_PORT =
  "TeachingArchiveMaterialPublicationStudentAppReadPort.verifyStudentAppPublishedMaterialRead";

const inputSchemaVersion = "2026-06-07.teaching.archive-material-publication-student-app-read.v1";
const outputSchemaVersion = "2026-06-07.teaching.archive-material-publication-student-app-read-verified.v1";
const rowVerificationWorkload = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION";
const rowVerificationRuntimeId = "teaching_archive_material_publication_row_verification_runtime";
const rowVerificationCommandPort =
  "TeachingArchiveMaterialPublicationRowVerificationPort.verifyTeachingArchivePublicationPhysicalRow";
const rowVerificationStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PHYSICAL_ROW_VERIFIED";
const verifiedStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_VERIFIED";
const targetEndpoint = "GET /v1/student-app/archive-items";
const targetUseCase = "ListStudentAppArchiveItems.Execute";
const targetRepository = "ArchiveRepository.List";
const defaultVerificationLogPath =
  "reports/student-command-log/teaching-archive-material-publication-student-app-read.jsonl";

const leakedFieldNames = [
  "rawContent", "answerKey", "rawModelOutput", "modelOutput", "directSql", "dbUrl",
  "internalError", "databaseWriteResult", "ocrJobId", "ragChunkIds", "aiGradingRequestId",
  "workerId", "claimExpiresAt", "scoreSummary", "answerText", "expectedAnswer",
  "explanation",
];
const productOnlyLeakedFieldNames = [
  "publicationId", "publicationState", "visibilityState", "approvalRecordId", "approvalId",
  "publicationCandidateId", "committedAt", "sourcePublicationStorageCommit",
];

export async function verifyTeachingArchiveMaterialPublicationStudentAppRead(input, options = {}) {
  const verifiedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const verificationLogPath = options.verificationLogPath ?? defaultVerificationLogPath;
  const existing = findExistingRecordByIdempotencyKey(verificationLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const productReadPort = assertProductReadPort(options.studentAppPublishedArchiveMaterialsReadPort);
  const productRead = await productReadPort.listStudentAppPublishedArchiveMaterials(
    {
      principal: normalized.principal,
      materialType: normalized.publicationRecord.materialType,
      archiveItemId: normalized.publicationRecord.archiveItemId,
      pageSize: 10,
      cursor: "",
    },
    {
      verificationInvocationId: normalized.verificationInvocationId,
      idempotencyKey: normalized.idempotencyKey,
      sourcePublicationRowVerificationRecordId: normalized.rowVerificationResult.recordId,
      publicationId: normalized.publicationRecord.publicationId,
    },
  );
  const verified = assertProductReadResult(productRead, normalized);
  const record = buildVerificationRecord(normalized, verified, verifiedAt, options.probeP99Ms ?? 9);
  appendVerificationRecord(verificationLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatTeachingArchiveMaterialPublicationStudentAppRead(result) {
  return [
    `Teaching archive material publication student app read: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Endpoint: ${result.studentProductReadSource.endpoint}`,
    `Publication: ${result.publishedArchiveMaterial.publicationId}`,
    `Archive item: ${result.publishedArchiveMaterial.archiveItem.id}`,
    `Published material visible: ${result.boundary.studentAppPublishedMaterialReadVerified}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const verificationInvocationId = requireToken(
    input.verificationInvocationId,
    "input.verificationInvocationId",
    "archive_material_publication_student_app_read_",
  );
  const principal = assertStudentPrincipal(input.principal);
  const rowVerificationReport = assertRowVerificationReport(input.publicationRowVerificationReport);
  const rowVerificationResult = assertRowVerificationResult(rowVerificationReport);
  const publicationRecord = rowVerificationResult.teachingArchivePublicationPhysicalRow.publicationRecord;
  requireConst(principal.studentAccess.ownStudentId, publicationRecord.studentId, "input.principal.studentAccess.ownStudentId");
  const productReadPolicy = assertProductReadPolicy(input.productReadPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 720);
  if (!evidenceRefs.some((ref) => ref.includes("publication-row-verification"))) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_MISSING_ROW_EVIDENCE", "publication row verification evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("student-app-archive-items"))) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_MISSING_PRODUCT_ENTRY_EVIDENCE", "student app archive-items product entry evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const verificationInputHash = hashInput({
    verificationInvocationId,
    principalId: principal.principalId,
    ownStudentId: principal.studentAccess.ownStudentId,
    sourcePublicationRowVerificationRecordId: rowVerificationResult.recordId,
    publicationRecord,
    productReadPolicy,
  });
  return {
    verificationInvocationId,
    principal,
    rowVerificationReport,
    rowVerificationResult,
    publicationRecord,
    productReadPolicy,
    evidenceRefs,
    idempotencyKey,
    verificationInputHash,
  };
}

function assertStudentPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const principalId = requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128);
  requireConst(principal.subjectType, "USER", "input.principal.subjectType");
  requireConst(principal.role, "STUDENT", "input.principal.role");
  requireConst(principal.entryPoint, "STUDENT_APP", "input.principal.entryPoint");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  if (!scopes.includes("STUDENT_OWN_READ")) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_MISSING_SCOPE", "STUDENT_OWN_READ is required");
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

function assertRowVerificationReport(report) {
  rejectLeakedFields(report, "input.publicationRowVerificationReport");
  assertPlainObject(report, "input.publicationRowVerificationReport");
  requireConst(report.readiness, "READY", "input.publicationRowVerificationReport.readiness");
  requireConst(report.workloadType, rowVerificationWorkload, "input.publicationRowVerificationReport.workloadType");
  requireConst(report.runtime?.runtimeId, rowVerificationRuntimeId, "input.publicationRowVerificationReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, rowVerificationCommandPort, "input.publicationRowVerificationReport.runtime.commandPort");
  requireConst(report.runtime?.status, rowVerificationStatus, "input.publicationRowVerificationReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.publicationRowVerificationReport.runtimeSlo.totalErrors");
  for (const field of [
    "publicationStorageCommitVerified", "publicationPhysicalRowVerified", "mainDatabaseReadAllowed",
    "studentVisiblePublished", "futureStudentAppPublishedMaterialReadRequired",
  ]) {
    requireConst(report.safetyInvariants?.[field], true, `input.publicationRowVerificationReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "ocrOrRagJobWriteStarted",
    "aiGradingWriteStarted", "modelInferenceStarted", "remoteDeviceControlAllowed",
    "localToolMutationAllowed", "swarmAllowed",
  ]) {
    requireConst(report.safetyInvariants?.[field], false, `input.publicationRowVerificationReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertRowVerificationResult(report) {
  const result = report.runtimeProbes?.teachingArchiveMaterialPublicationRowVerification?.result;
  rejectLeakedFields(result, "input.publicationRowVerificationReport.runtimeProbes.result");
  assertPlainObject(result, "input.publicationRowVerificationReport.runtimeProbes.result");
  requireConst(result.schemaVersion, "2026-06-07.teaching.archive-material-publication-row-verified.v1", "row.source.schemaVersion");
  requireConst(result.runtimeId, rowVerificationRuntimeId, "row.source.runtimeId");
  requireConst(result.commandPort, rowVerificationCommandPort, "row.source.commandPort");
  requireConst(result.status, rowVerificationStatus, "row.source.status");
  for (const field of [
    "publicationStorageCommitVerified", "publicationPhysicalRowVerified", "mainDatabaseReadAllowed",
    "studentVisiblePublished",
  ]) {
    requireConst(result.boundary?.[field], true, `row.source.boundary.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "ocrOrRagJobWriteStarted",
    "aiGradingWriteStarted", "modelInferenceStarted", "remoteDeviceControlAllowed",
    "localToolMutationAllowed", "swarmAllowed",
  ]) {
    requireConst(result.boundary?.[field], false, `row.source.boundary.${field}`);
  }
  assertPlainObject(result.teachingArchivePublicationPhysicalRow, "row.source.teachingArchivePublicationPhysicalRow");
  requireConst(result.teachingArchivePublicationPhysicalRow.targetRepository, "PublicationRepository.GetByID", "row.source.teachingArchivePublicationPhysicalRow.targetRepository");
  requireConst(result.teachingArchivePublicationPhysicalRow.targetStore, "TEACHING_ARCHIVE_PUBLICATION_STORE", "row.source.teachingArchivePublicationPhysicalRow.targetStore");
  requireConst(result.teachingArchivePublicationPhysicalRow.targetTable, "teaching_archive_publications", "row.source.teachingArchivePublicationPhysicalRow.targetTable");
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "row.source.recordId", 1, 520),
    teachingArchivePublicationPhysicalRow: {
      ...result.teachingArchivePublicationPhysicalRow,
      publicationRecord: assertPublicationRecord(
        result.teachingArchivePublicationPhysicalRow.publicationRecord,
        "row.source.teachingArchivePublicationPhysicalRow.publicationRecord",
      ),
    },
    evidenceRefs: uniqueStringArray(result.evidenceRefs ?? [], "row.source.evidenceRefs", 1, 1600),
  };
}

function assertPublicationRecord(record, label) {
  rejectLeakedFields(record, label);
  assertPlainObject(record, label);
  requireConst(record.publicationState, "COMMITTED_TO_PUBLICATION_STORE", `${label}.publicationState`);
  requireConst(record.visibilityState, "STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED", `${label}.visibilityState`);
  requireConst(record.channel, "STUDENT_APP", `${label}.channel`);
  return {
    publicationId: requireToken(record.publicationId, `${label}.publicationId`, "archive_material_publication_commit_"),
    publicationState: record.publicationState,
    visibilityState: record.visibilityState,
    channel: record.channel,
    scopeRef: assertStudentScopeRef(record.scopeRef, `${label}.scopeRef`),
    approvalRecordId: requireBoundedString(record.approvalRecordId, `${label}.approvalRecordId`, 1, 520),
    approvalId: requireToken(record.approvalId, `${label}.approvalId`, "archive_material_publication_approval_"),
    publicationCandidateId: requireToken(record.publicationCandidateId, `${label}.publicationCandidateId`, "archive_material_pub_precheck_"),
    archiveItemId: requireToken(record.archiveItemId, `${label}.archiveItemId`, "tarch_"),
    studentId: requireToken(record.studentId, `${label}.studentId`, "student_"),
    materialType: requireOneOf(record.materialType, `${label}.materialType`, ["HANDOUT", "QUIZ", "LESSON_NOTE"]),
    title: requireSafeText(record.title, `${label}.title`, 1, 160),
    contentRef: requireContentRef(record.contentRef, `${label}.contentRef`),
    committedAt: requireIsoString(record.committedAt, `${label}.committedAt`),
  };
}

function assertStudentScopeRef(scopeRef, label) {
  assertPlainObject(scopeRef, label);
  return {
    scopeType: requireConst(scopeRef.scopeType, "STUDENT_OWN_ARCHIVE", `${label}.scopeType`),
    studentId: requireToken(scopeRef.studentId, `${label}.studentId`, "student_"),
    archiveItemId: requireToken(scopeRef.archiveItemId, `${label}.archiveItemId`, "tarch_"),
  };
}

function assertProductReadPolicy(policy) {
  assertPlainObject(policy, "input.productReadPolicy");
  for (const field of [
    "publicationRowVerificationRequired", "ownStudentPrincipalRequired",
    "studentAppArchiveItemsEndpointRequired", "injectedPublishedArchiveMaterialReadPortRequired",
    "ownStudentOnlyRequired", "productResponseMustIncludePublishedMaterial",
    "publicationRowMustMatchProductResponse", "idempotentPublishedMaterialReadVerificationRequired",
    "goUseCaseReadAllowed",
  ]) {
    requireConst(policy[field], true, `input.productReadPolicy.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "ocrOrRagJobWriteAllowed",
    "aiGradingWriteAllowed", "modelInferenceAllowed", "publicationWriteAllowed",
    "remoteDeviceControlAllowed", "localToolMutationAllowed", "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.productReadPolicy.${field}`);
  }
  return { ...policy };
}

function assertProductReadPort(port) {
  if (!port || typeof port.listStudentAppPublishedArchiveMaterials !== "function") {
    throw verificationError(
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_MISSING_PORT",
      "StudentAppPublishedArchiveMaterialsReadPort.listStudentAppPublishedArchiveMaterials is required",
    );
  }
  return port;
}

function assertProductReadResult(result, normalized) {
  rejectLeakedFields(result, "StudentAppPublishedArchiveMaterialsReadPort result");
  rejectProductOnlyLeakedFields(result, "StudentAppPublishedArchiveMaterialsReadPort result");
  assertPlainObject(result, "StudentAppPublishedArchiveMaterialsReadPort result");
  requireConst(result.found, true, "StudentAppPublishedArchiveMaterialsReadPort result.found");
  const source = assertProductReadSource(result.source);
  const response = assertProductResponse(result.response, normalized.publicationRecord);
  return { source, response };
}

function assertProductReadSource(source) {
  assertPlainObject(source, "StudentAppPublishedArchiveMaterialsReadPort result.source");
  return {
    endpoint: requireConst(source.endpoint, targetEndpoint, "StudentAppPublishedArchiveMaterialsReadPort result.source.endpoint"),
    useCase: requireConst(source.useCase, targetUseCase, "StudentAppPublishedArchiveMaterialsReadPort result.source.useCase"),
    repository: requireConst(source.repository, targetRepository, "StudentAppPublishedArchiveMaterialsReadPort result.source.repository"),
    ownStudentOnly: requireConst(source.ownStudentOnly, true, "StudentAppPublishedArchiveMaterialsReadPort result.source.ownStudentOnly"),
    publicationRowSourceVerified: requireConst(source.publicationRowSourceVerified, true, "StudentAppPublishedArchiveMaterialsReadPort result.source.publicationRowSourceVerified"),
  };
}

function assertProductResponse(response, publicationRecord) {
  assertPlainObject(response, "StudentAppPublishedArchiveMaterialsReadPort result.response");
  const data = Array.isArray(response.data) ? response.data : [];
  if (data.length === 0) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_EMPTY_RESPONSE", "StudentAppPublishedArchiveMaterialsReadPort result.response.data must not be empty");
  }
  let matched = null;
  for (const [index, itemValue] of data.entries()) {
    const item = assertArchiveItem(itemValue, `StudentAppPublishedArchiveMaterialsReadPort result.response.data[${index}]`);
    if (item.ownerType !== "STUDENT" || item.studentId !== publicationRecord.studentId) {
      throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_SCOPE_LEAK", `response item ${item.id} is outside own-student scope`);
    }
    if (item.materialType === "TEACHING_MATERIAL") {
      throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_TEACHING_MATERIAL_LEAK", `response item ${item.id} is not a student archive material`);
    }
    if (item.id === publicationRecord.archiveItemId) matched = item;
  }
  if (!matched) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_MISSING_PUBLISHED_MATERIAL", `${publicationRecord.archiveItemId} was not returned by the student product entry`);
  }
  assertArchiveItemMatchesPublication(matched, publicationRecord);
  return {
    data,
    pageInfo: {
      pageSize: Number(response.pageInfo?.pageSize ?? data.length),
      hasMore: Boolean(response.pageInfo?.hasMore ?? false),
      nextCursor: optionalBoundedString(response.pageInfo?.nextCursor, "StudentAppPublishedArchiveMaterialsReadPort result.response.pageInfo.nextCursor", 420),
    },
    matchedArchiveItem: matched,
  };
}

function assertArchiveItem(item, label) {
  rejectProductOnlyLeakedFields(item, label);
  assertPlainObject(item, label);
  const id = requireToken(item.id, `${label}.id`, "tarch_");
  const ownerType = requireOneOf(item.ownerType, `${label}.ownerType`, ["STUDENT", "TEACHING"]);
  const studentId = ownerType === "STUDENT"
    ? requireBoundedString(item.studentId, `${label}.studentId`, 1, 128)
    : optionalBoundedString(item.studentId, `${label}.studentId`, 128);
  return {
    id,
    ownerType,
    studentId: ownerType === "STUDENT" ? studentId : "",
    materialType: requireOneOf(item.materialType, `${label}.materialType`, ["TEACHING_MATERIAL", "HANDOUT", "HOMEWORK", "PAPER", "QUIZ", "LESSON_NOTE"]),
    title: requireSafeText(item.title, `${label}.title`, 1, 200),
    source: requireOneOf(item.source, `${label}.source`, ["SYSTEM_IMPORT", "TEACHER_UPLOAD", "STUDENT_UPLOAD"]),
    contentRef: requireContentRef(item.contentRef, `${label}.contentRef`),
    tags: uniqueStringArray(item.tags ?? [], `${label}.tags`, 0, 32),
    analysisIntents: uniqueStringArray(item.analysisIntents ?? [], `${label}.analysisIntents`, 1, 8),
    ocrStatus: requireOneOf(item.ocrStatus, `${label}.ocrStatus`, ["NOT_REQUIRED", "RESERVED"]),
    createdAt: requireIsoString(item.createdAt, `${label}.createdAt`),
  };
}

function assertArchiveItemMatchesPublication(actual, publicationRecord) {
  const expectedPairs = [
    ["id", publicationRecord.archiveItemId],
    ["studentId", publicationRecord.studentId],
    ["materialType", publicationRecord.materialType],
    ["title", publicationRecord.title],
    ["contentRef", publicationRecord.contentRef],
  ];
  for (const [field, expected] of expectedPairs) {
    requireConst(actual[field], expected, `productResponse.${field}`);
  }
}

function buildVerificationRecord(normalized, verified, verifiedAt, p99Ms) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ",
    recordId: `teaching_archive_material_publication_student_app_read_${safeToken(normalized.idempotencyKey)}`,
    verifiedAt,
    runtimeId: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_RUNTIME_ID,
    commandPort: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_PORT,
    status: verifiedStatus,
    verificationInvocationId: normalized.verificationInvocationId,
    sourcePublicationRowVerification: {
      workloadType: rowVerificationWorkload,
      runtimeId: rowVerificationRuntimeId,
      commandPort: rowVerificationCommandPort,
      recordId: normalized.rowVerificationResult.recordId,
      publicationId: normalized.publicationRecord.publicationId,
      archiveItemId: normalized.publicationRecord.archiveItemId,
      visibilityState: normalized.publicationRecord.visibilityState,
    },
    principal: normalized.principal,
    studentProductReadSource: verified.source,
    publishedArchiveMaterial: {
      publicationId: normalized.publicationRecord.publicationId,
      visibilityState: normalized.publicationRecord.visibilityState,
      archiveItem: verified.response.matchedArchiveItem,
    },
    responsePageInfo: verified.response.pageInfo,
    boundary: {
      publicationRowVerificationRequired: true,
      publicationPhysicalRowVerified: true,
      studentVisiblePublished: true,
      studentAppArchiveItemsEndpointVerified: true,
      injectedPublishedArchiveMaterialReadPortInvoked: true,
      goUseCaseReadAllowed: true,
      ownStudentProductReadVerified: true,
      studentAppPublishedMaterialReadVerified: true,
      productResponseMatchedPublicationRow: true,
      crossStudentLeakPrevented: true,
      teachingMaterialLeakPrevented: true,
      publicationMetadataLeakPrevented: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      publicationWriteStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFuturePublicationProjectionOrRagSlice: true,
    },
    evidenceRefs: uniqueEvidenceRefs([
      ...normalized.evidenceRefs,
      ...normalized.rowVerificationResult.evidenceRefs,
      `evidence:archive-material-publication-student-app-read-input-hash:${normalized.verificationInputHash}`,
      `evidence:runtime:${TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_RUNTIME_ID}`,
      `evidence:command-port:${TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_PORT}`,
      `evidence:source-publication-row-verification:${normalized.rowVerificationResult.recordId}`,
      `evidence:student-app-published-archive-material:${normalized.publicationRecord.archiveItemId}`,
    ]),
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.verificationInputHash,
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms,
      totalErrors: 0,
      operations: 1,
      evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_PROBE",
    },
    nextAction: "Use this as Student App published-material read evidence; publication projection hardening, OCR/RAG enrichment, AI grading, and material search remain separate reviewed slices.",
  };
}

function buildResult(record, extra) {
  return { ...record, ...extra };
}

function findExistingRecordByIdempotencyKey(logPath, idempotencyKey) {
  const absolute = path.resolve(logPath);
  if (!fs.existsSync(absolute)) return null;
  const lines = fs.readFileSync(absolute, "utf8").split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const parsed = JSON.parse(lines[index]);
    if (parsed.idempotencyKey === idempotencyKey) return parsed;
  }
  return null;
}

function assertReplayMatches(record, normalized) {
  requireConst(record.inputHash, normalized.verificationInputHash, "record.inputHash");
  requireConst(record.status, verifiedStatus, "record.status");
  requireConst(record.sourcePublicationRowVerification.recordId, normalized.rowVerificationResult.recordId, "record.sourcePublicationRowVerification.recordId");
  requireConst(record.publishedArchiveMaterial.archiveItem.id, normalized.publicationRecord.archiveItemId, "record.publishedArchiveMaterial.archiveItem.id");
}

function appendVerificationRecord(logPath, record) {
  const absolute = path.resolve(logPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.appendFileSync(absolute, `${JSON.stringify(record)}\n`);
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_INVALID_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_CONTRACT_MISMATCH", `${label} must be ${expected}`);
  }
  return expected;
}

function requireOneOf(actual, label, allowed) {
  if (!allowed.includes(actual)) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_INVALID_ENUM", `${label} must be one of ${allowed.join(", ")}`);
  }
  return actual;
}

function requireBoundedString(value, label, minLength, maxLength) {
  if (typeof value !== "string" || value.length < minLength || value.length > maxLength) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_INVALID_STRING", `${label} must be a string of length ${minLength}-${maxLength}`);
  }
  return value;
}

function optionalBoundedString(value, label, maxLength) {
  if (value === undefined || value === null || value === "") return "";
  return requireBoundedString(String(value), label, 1, maxLength);
}

function requireSafeText(value, label, minLength, maxLength) {
  const text = requireBoundedString(value, label, minLength, maxLength);
  if (/[<>]|\bscript\b|javascript:|data:/iu.test(text)) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_UNSAFE_TEXT", `${label} contains unsafe text`);
  }
  return text;
}

function requireContentRef(value, label) {
  const ref = requireSafeText(value, label, 12, 1000);
  if (!ref.startsWith("precommit://archive-material/") && !ref.startsWith("object://archive-material/") && !ref.startsWith("publication://archive-material/") && !ref.startsWith("local://archive/")) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_INVALID_CONTENT_REF", `${label} must be a controlled archive material ref`);
  }
  return ref;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 420);
  if (!token.startsWith(prefix) || !/^[A-Za-z0-9:_-]+$/u.test(token)) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_INVALID_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireIsoString(value, label) {
  const text = requireBoundedString(value, label, 20, 40);
  if (Number.isNaN(Date.parse(text))) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_INVALID_TIME", `${label} must be an ISO timestamp`);
  }
  return text;
}

function uniqueStringArray(value, label, minLength, maxLength) {
  if (!Array.isArray(value) || value.length < minLength || value.length > maxLength) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_INVALID_ARRAY", `${label} must contain ${minLength}-${maxLength} strings`);
  }
  const seen = new Set();
  return value.map((item, index) => {
    const normalized = requireBoundedString(String(item), `${label}[${index}]`, 1, 420);
    if (seen.has(normalized)) {
      throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_DUPLICATE_STRING", `${label}[${index}] is duplicated`);
    }
    seen.add(normalized);
    return normalized;
  });
}

function rejectLeakedFields(value, context) {
  rejectFields(value, context, leakedFieldNames, "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_LEAKED_FIELD");
}

function rejectProductOnlyLeakedFields(value, context) {
  rejectFields(value, context, productOnlyLeakedFieldNames, "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_PRODUCT_METADATA_LEAK");
}

function rejectFields(value, context, fields, code) {
  if (!value || typeof value !== "object") return;
  const stack = [{ value, path: context }];
  while (stack.length) {
    const current = stack.pop();
    for (const [key, nested] of Object.entries(current.value)) {
      if (fields.includes(key)) {
        throw verificationError(code, `${current.path}.${key} is not allowed`);
      }
      if (nested && typeof nested === "object") stack.push({ value: nested, path: `${current.path}.${key}` });
    }
  }
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function uniqueEvidenceRefs(refs) {
  return [...new Set(refs)];
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
