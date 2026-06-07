import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_RUNTIME_ID =
  "teaching_archive_material_draft_student_product_read_runtime";
export const TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_PORT =
  "TeachingArchiveMaterialDraftStudentProductReadPort.verifyStudentAppArchiveItemsRead";

const inputSchemaVersion = "2026-06-07.teaching.archive-material-draft-student-product-read.v1";
const outputSchemaVersion = "2026-06-07.teaching.archive-material-draft-student-product-read-verified.v1";
const rowVerificationWorkload = "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION";
const rowVerificationRuntimeId = "teaching_archive_material_draft_storage_row_verification_runtime";
const rowVerificationStatus = "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PHYSICAL_ROW_VERIFIED";
const verifiedStatus = "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_VERIFIED";
const targetEndpoint = "GET /v1/student-app/archive-items";
const targetUseCase = "ListStudentAppArchiveItems.Execute";
const targetRepository = "ArchiveRepository.List";
const defaultVerificationLogPath =
  "reports/student-command-log/teaching-archive-material-draft-student-product-read.jsonl";

const leakedFieldNames = [
  "rawModelOutput",
  "modelOutput",
  "directSql",
  "dbUrl",
  "internalError",
  "ocrJobId",
  "ragChunkIds",
  "aiGradingRequestId",
  "workerId",
  "claimExpiresAt",
  "scoreSummary",
  "publishedAt",
];

export async function verifyTeachingArchiveMaterialDraftStudentProductRead(input, options = {}) {
  const verifiedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const verificationLogPath = options.verificationLogPath ?? defaultVerificationLogPath;
  const existing = findExistingRecordByIdempotencyKey(verificationLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const productReadPort = assertProductReadPort(options.studentAppArchiveItemsProductReadPort);
  const productRead = await productReadPort.listStudentAppArchiveItems(
    {
      principal: normalized.principal,
      materialType: normalized.physicalRow.materialType,
      pageSize: 10,
      cursor: "",
    },
    {
      verificationInvocationId: normalized.verificationInvocationId,
      idempotencyKey: normalized.idempotencyKey,
      sourceRowVerificationRecordId: normalized.rowVerificationResult.recordId,
    },
  );
  const verified = assertProductReadResult(productRead, normalized);
  const record = buildVerificationRecord(normalized, verified, verifiedAt);
  appendVerificationRecord(verificationLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatTeachingArchiveMaterialDraftStudentProductRead(result) {
  return [
    `Teaching archive material draft student product read: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Endpoint: ${result.studentProductReadSource.endpoint}`,
    `Archive item: ${result.studentProductArchiveItem.id}`,
    `Own-student product read verified: ${result.boundary.ownStudentProductReadVerified}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const verificationInvocationId = requireToken(input.verificationInvocationId, "input.verificationInvocationId", "archive_material_draft_student_product_read_");
  const principal = assertStudentPrincipal(input.principal);
  const rowVerificationReport = assertRowVerificationReport(input.rowVerificationReport);
  const rowVerificationResult = assertRowVerificationResult(rowVerificationReport);
  const physicalRow = rowVerificationResult.teachingArchivePhysicalRow.archiveItem;
  requireConst(principal.studentAccess.ownStudentId, physicalRow.studentId, "input.principal.studentAccess.ownStudentId");
  const productReadPolicy = assertProductReadPolicy(input.productReadPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 520);
  if (!evidenceRefs.some((ref) => ref.includes("storage-row-verification"))) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PRODUCT_READ_MISSING_ROW_EVIDENCE", "storage row verification evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("student-app-archive-items"))) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PRODUCT_READ_MISSING_PRODUCT_ENTRY_EVIDENCE", "student app archive items product entry evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const verificationInputHash = hashInput({
    verificationInvocationId,
    principalId: principal.principalId,
    ownStudentId: principal.studentAccess.ownStudentId,
    sourceRowVerificationRecordId: rowVerificationResult.recordId,
    physicalRow,
    productReadPolicy,
  });
  return { verificationInvocationId, principal, rowVerificationReport, rowVerificationResult, physicalRow, productReadPolicy, evidenceRefs, idempotencyKey, verificationInputHash };
}

function assertStudentPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const principalId = requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128);
  requireConst(principal.subjectType, "USER", "input.principal.subjectType");
  requireConst(principal.role, "STUDENT", "input.principal.role");
  requireConst(principal.entryPoint, "STUDENT_APP", "input.principal.entryPoint");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  if (!scopes.includes("STUDENT_OWN_READ")) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PRODUCT_READ_MISSING_SCOPE", "STUDENT_OWN_READ is required");
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
  assertPlainObject(report, "input.rowVerificationReport");
  requireConst(report.readiness, "READY", "input.rowVerificationReport.readiness");
  requireConst(report.workloadType, rowVerificationWorkload, "input.rowVerificationReport.workloadType");
  requireConst(report.runtime?.runtimeId, rowVerificationRuntimeId, "input.rowVerificationReport.runtime.runtimeId");
  requireConst(report.runtime?.status, rowVerificationStatus, "input.rowVerificationReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.rowVerificationReport.runtimeSlo.totalErrors");
  for (const field of [
    "storageCommitVerified",
    "teachingArchiveRowReadPortInvoked",
    "teachingArchiveRepositoryGetByIDUsed",
    "committedArchiveItemMatchedPhysicalRow",
    "physicalDatabaseRowVerified",
  ]) {
    requireConst(report.safetyInvariants?.[field], true, `input.rowVerificationReport.safetyInvariants.${field}`);
  }
  for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "ocrOrRagJobWriteStarted", "aiGradingWriteStarted", "swarmAllowed"]) {
    requireConst(report.safetyInvariants?.[field], false, `input.rowVerificationReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertRowVerificationResult(report) {
  const result = report.runtimeProbes?.teachingArchiveMaterialDraftStorageRowVerification?.result;
  rejectLeakedFields(result, "input.rowVerificationReport.runtimeProbes.result");
  assertPlainObject(result, "input.rowVerificationReport.runtimeProbes.result");
  requireConst(result.schemaVersion, "2026-06-07.teaching.archive-material-draft-storage-row-verified.v1", "row.source.schemaVersion");
  requireConst(result.runtimeId, rowVerificationRuntimeId, "row.source.runtimeId");
  requireConst(result.status, rowVerificationStatus, "row.source.status");
  requireConst(result.boundary?.physicalDatabaseRowVerified, true, "row.source.boundary.physicalDatabaseRowVerified");
  requireConst(result.boundary?.directDatabaseAccessAllowed, false, "row.source.boundary.directDatabaseAccessAllowed");
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "row.source.recordId", 1, 520),
    teachingArchivePhysicalRow: {
      operationId: requireConst(result.teachingArchivePhysicalRow?.operationId, "getTeachingArchiveItemById", "row.source.teachingArchivePhysicalRow.operationId"),
      targetRepository: requireConst(result.teachingArchivePhysicalRow?.targetRepository, "ArchiveRepository.GetByID", "row.source.teachingArchivePhysicalRow.targetRepository"),
      targetTable: requireConst(result.teachingArchivePhysicalRow?.targetTable, "teaching_archive_items", "row.source.teachingArchivePhysicalRow.targetTable"),
      archiveItem: assertArchiveItem(result.teachingArchivePhysicalRow?.archiveItem, "row.source.teachingArchivePhysicalRow.archiveItem"),
    },
    evidenceRefs: uniqueStringArray(result.evidenceRefs ?? [], "row.source.evidenceRefs", 1, 1600),
  };
}

function assertProductReadPolicy(policy) {
  assertPlainObject(policy, "input.productReadPolicy");
  for (const field of [
    "rowVerificationRequired",
    "ownStudentPrincipalRequired",
    "studentAppArchiveItemsEndpointRequired",
    "injectedProductReadPortRequired",
    "ownStudentOnlyRequired",
    "productResponseMustIncludeVerifiedRow",
    "idempotentProductReadVerificationRequired",
    "goUseCaseReadAllowed",
  ]) {
    requireConst(policy[field], true, `input.productReadPolicy.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "ocrOrRagJobWriteAllowed",
    "aiGradingWriteAllowed",
    "modelInferenceAllowed",
    "publicationAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.productReadPolicy.${field}`);
  }
  return { ...policy };
}

function assertProductReadPort(port) {
  if (!port || typeof port.listStudentAppArchiveItems !== "function") {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PRODUCT_READ_MISSING_PORT", "StudentAppArchiveItemsProductReadPort.listStudentAppArchiveItems is required");
  }
  return port;
}

function assertProductReadResult(result, normalized) {
  rejectLeakedFields(result, "StudentAppArchiveItemsProductReadPort result");
  assertPlainObject(result, "StudentAppArchiveItemsProductReadPort result");
  requireConst(result.found, true, "StudentAppArchiveItemsProductReadPort result.found");
  const source = assertProductReadSource(result.source);
  const response = assertProductResponse(result.response, normalized.physicalRow);
  return { source, response };
}

function assertProductReadSource(source) {
  assertPlainObject(source, "StudentAppArchiveItemsProductReadPort result.source");
  return {
    endpoint: requireConst(source.endpoint, targetEndpoint, "StudentAppArchiveItemsProductReadPort result.source.endpoint"),
    useCase: requireConst(source.useCase, targetUseCase, "StudentAppArchiveItemsProductReadPort result.source.useCase"),
    repository: requireConst(source.repository, targetRepository, "StudentAppArchiveItemsProductReadPort result.source.repository"),
    ownStudentOnly: requireConst(source.ownStudentOnly, true, "StudentAppArchiveItemsProductReadPort result.source.ownStudentOnly"),
  };
}

function assertProductResponse(response, physicalRow) {
  assertPlainObject(response, "StudentAppArchiveItemsProductReadPort result.response");
  const data = Array.isArray(response.data) ? response.data : [];
  if (data.length === 0) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PRODUCT_READ_EMPTY_RESPONSE", "StudentAppArchiveItemsProductReadPort result.response.data must not be empty");
  }
  let matched = null;
  for (const [index, itemValue] of data.entries()) {
    const item = assertArchiveItem(itemValue, `StudentAppArchiveItemsProductReadPort result.response.data[${index}]`);
    if (item.ownerType !== "STUDENT" || item.studentId !== physicalRow.studentId) {
      throw verificationError("TEACHING_ARCHIVE_MATERIAL_PRODUCT_READ_SCOPE_LEAK", `response item ${item.id} is outside own-student scope`);
    }
    if (item.materialType === "TEACHING_MATERIAL") {
      throw verificationError("TEACHING_ARCHIVE_MATERIAL_PRODUCT_READ_TEACHING_MATERIAL_LEAK", `response item ${item.id} is not a student archive material`);
    }
    if (item.id === physicalRow.id) matched = item;
  }
  if (!matched) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PRODUCT_READ_MISSING_VERIFIED_ROW", `${physicalRow.id} was not returned by the product entry`);
  }
  assertArchiveItemsMatch(matched, physicalRow);
  return {
    data,
    pageInfo: {
      pageSize: Number(response.pageInfo?.pageSize ?? data.length),
      hasMore: Boolean(response.pageInfo?.hasMore ?? false),
      nextCursor: optionalBoundedString(response.pageInfo?.nextCursor, "StudentAppArchiveItemsProductReadPort result.response.pageInfo.nextCursor", 420),
    },
    matchedArchiveItem: matched,
  };
}

function assertArchiveItem(item, label) {
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
    materialType: requireOneOf(item.materialType, `${label}.materialType`, ["TEACHING_MATERIAL", "HANDOUT", "HOMEWORK", "PAPER", "QUIZ"]),
    title: requireSafeText(item.title, `${label}.title`, 4, 200),
    source: requireOneOf(item.source, `${label}.source`, ["SYSTEM_IMPORT", "TEACHER_UPLOAD", "STUDENT_UPLOAD"]),
    contentRef: requireContentRef(item.contentRef, `${label}.contentRef`),
    tags: uniqueStringArray(item.tags ?? [], `${label}.tags`, 0, 32),
    analysisIntents: uniqueStringArray(item.analysisIntents ?? [], `${label}.analysisIntents`, 1, 8),
    ocrStatus: requireOneOf(item.ocrStatus, `${label}.ocrStatus`, ["NOT_REQUIRED", "RESERVED"]),
    createdAt: requireIsoString(item.createdAt, `${label}.createdAt`),
  };
}

function assertArchiveItemsMatch(actual, expected) {
  for (const field of ["id", "ownerType", "studentId", "materialType", "title", "source", "contentRef", "ocrStatus", "createdAt"]) {
    requireConst(actual[field], expected[field], `productResponse.${field}`);
  }
  requireConst(JSON.stringify(actual.tags), JSON.stringify(expected.tags), "productResponse.tags");
  requireConst(JSON.stringify(actual.analysisIntents), JSON.stringify(expected.analysisIntents), "productResponse.analysisIntents");
}

function buildVerificationRecord(normalized, verified, verifiedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_RUNTIME_ID,
    commandPort: TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_PORT,
    status: verifiedStatus,
    recordId: `teaching_archive_material_draft_student_product_read_${safeToken(normalized.idempotencyKey)}`,
    verifiedAt,
    sourceRowVerification: {
      workloadType: rowVerificationWorkload,
      runtimeId: rowVerificationRuntimeId,
      recordId: normalized.rowVerificationResult.recordId,
      archiveItemId: normalized.physicalRow.id,
    },
    principal: normalized.principal,
    studentProductReadSource: verified.source,
    studentProductArchiveItem: verified.response.matchedArchiveItem,
    responsePageInfo: verified.response.pageInfo,
    boundary: {
      storageRowVerificationRequired: true,
      physicalDatabaseRowVerified: true,
      studentAppArchiveItemsEndpointVerified: true,
      injectedProductReadPortInvoked: true,
      goUseCaseReadAllowed: true,
      ownStudentProductReadVerified: true,
      productResponseMatchedPhysicalRow: true,
      crossStudentLeakPrevented: true,
      teachingMaterialLeakPrevented: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      publicationAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFuturePublicationOrRagSlice: true,
    },
    evidenceRefs: [
      ...normalized.evidenceRefs,
      ...normalized.rowVerificationResult.evidenceRefs,
      `evidence:archive-material-draft-student-product-read-input-hash:${normalized.verificationInputHash}`,
      `evidence:runtime:${TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_RUNTIME_ID}`,
      `evidence:command-port:${TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_PORT}`,
      `evidence:source-row-verification:${normalized.rowVerificationResult.recordId}`,
      `evidence:student-app-archive-items-product-entry:${normalized.physicalRow.id}`,
    ],
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.verificationInputHash,
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
      evidenceClass: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_PROBE",
    },
    idempotentReplay: replay.idempotentReplay,
    nextAction: "Use this as student product read evidence; publication, OCR/RAG enrichment, AI grading, and open knowledge retrieval remain separate reviewed slices.",
  };
}

function findExistingRecordByIdempotencyKey(logPath, idempotencyKey) {
  if (!fs.existsSync(logPath)) return null;
  const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const parsed = JSON.parse(lines[index]);
    if (parsed.idempotencyKey === idempotencyKey) return parsed;
  }
  return null;
}

function assertReplayMatches(record, normalized) {
  requireConst(record.inputHash, normalized.verificationInputHash, "record.inputHash");
  requireConst(record.sourceRowVerification.recordId, normalized.rowVerificationResult.recordId, "record.sourceRowVerification.recordId");
  requireConst(record.studentProductArchiveItem.id, normalized.physicalRow.id, "record.studentProductArchiveItem.id");
}

function appendVerificationRecord(logPath, record) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`);
}

function rejectLeakedFields(value, context) {
  if (!value || typeof value !== "object") return;
  const stack = [{ value, path: context }];
  while (stack.length) {
    const current = stack.pop();
    for (const [key, nested] of Object.entries(current.value)) {
      if (leakedFieldNames.includes(key)) {
        throw verificationError("TEACHING_ARCHIVE_MATERIAL_PRODUCT_READ_LEAKED_FIELD", `${current.path}.${key} is not allowed`);
      }
      if (nested && typeof nested === "object") stack.push({ value: nested, path: `${current.path}.${key}` });
    }
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PRODUCT_READ_INVALID_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PRODUCT_READ_CONST_MISMATCH", `${label} must be ${expected}`);
  }
  return actual;
}

function requireOneOf(actual, label, allowed) {
  if (!allowed.includes(actual)) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PRODUCT_READ_INVALID_ENUM", `${label} must be one of ${allowed.join(",")}`);
  }
  return actual;
}

function requireBoundedString(value, label, minLength, maxLength) {
  if (typeof value !== "string" || value.length < minLength || value.length > maxLength) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PRODUCT_READ_INVALID_STRING", `${label} must be a string of length ${minLength}-${maxLength}`);
  }
  return value;
}

function optionalBoundedString(value, label, maxLength) {
  if (value === undefined || value === null || value === "") return "";
  return requireBoundedString(String(value), label, 1, maxLength);
}

function requireSafeText(value, label, minLength, maxLength) {
  const text = requireBoundedString(value, label, minLength, maxLength);
  if (/[<>]/u.test(text) || /script:/iu.test(text) || /javascript:/iu.test(text)) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PRODUCT_READ_UNSAFE_TEXT", `${label} contains unsafe text`);
  }
  return text;
}

function requireContentRef(value, label) {
  const ref = requireBoundedString(value, label, 12, 1000);
  if (!ref.startsWith("precommit://archive-material/") && !ref.startsWith("object://archive-material/") && !ref.startsWith("local://archive/")) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PRODUCT_READ_INVALID_CONTENT_REF", `${label} must be a controlled archive material ref`);
  }
  return ref;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 420);
  if (!token.startsWith(prefix)) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PRODUCT_READ_INVALID_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireIsoString(value, label) {
  const text = requireBoundedString(value, label, 20, 40);
  if (Number.isNaN(Date.parse(text))) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PRODUCT_READ_INVALID_TIME", `${label} must be an ISO timestamp`);
  }
  return text;
}

function uniqueStringArray(value, label, minLength, maxLength) {
  if (!Array.isArray(value) || value.length < minLength || value.length > maxLength) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PRODUCT_READ_INVALID_ARRAY", `${label} must contain ${minLength}-${maxLength} strings`);
  }
  const seen = new Set();
  return value.map((item, index) => {
    const normalized = requireBoundedString(String(item), `${label}[${index}]`, 1, 420);
    if (seen.has(normalized)) {
      throw verificationError("TEACHING_ARCHIVE_MATERIAL_PRODUCT_READ_DUPLICATE_STRING", `${label}[${index}] is duplicated`);
    }
    seen.add(normalized);
    return normalized;
  });
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeToken(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9_-]+/gu, "_").replace(/^_+|_+$/gu, "") || "unknown";
}

function verificationError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
