import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_RUNTIME_ID =
  "teaching_archive_material_published_detail_metadata_read_runtime";
export const TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_PORT =
  "TeachingArchiveMaterialPublishedDetailMetadataReadPort.verifyStudentAppPublishedMaterialDetailMetadataRead";

const inputSchemaVersion = "2026-06-07.teaching.archive-material-published-detail-metadata-read.v1";
const outputSchemaVersion = "2026-06-07.teaching.archive-material-published-detail-metadata-read-verified.v1";
const sourceWorkload = "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION";
const sourceRuntimeId = "teaching_archive_material_published_search_foundation_runtime";
const sourceCommandPort =
  "TeachingArchiveMaterialPublishedSearchFoundationPort.verifyStudentAppPublishedMaterialSearch";
const sourceStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_VERIFIED";
const verifiedStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_VERIFIED";
const targetEndpoint = "GET /v1/student-app/archive-items/{archiveItemId}";
const targetUseCase = "ReadStudentAppArchiveItem.Execute";
const targetRepository = "ArchiveRepository.GetPublishedForStudentApp";
const targetProjectionTable = "teaching_archive_publications";
const defaultVerificationLogPath =
  "reports/student-command-log/teaching-archive-material-published-detail-metadata-read.jsonl";

const leakedFieldNames = [
  "contentRef", "rawContent", "answerKey", "answerText", "expectedAnswer", "explanation",
  "rawModelOutput", "modelOutput", "publicationId", "publicationState", "visibilityState",
  "approvalRecordId", "approvalId", "publicationCandidateId", "committedAt", "workerId",
  "claimExpiresAt", "scoreSummary", "resultRef", "internalError", "databaseWriteResult",
  "directSql", "dbUrl",
];

export async function verifyTeachingArchiveMaterialPublishedDetailMetadataRead(input, options = {}) {
  const verifiedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const verificationLogPath = options.verificationLogPath ?? defaultVerificationLogPath;
  const existing = findExistingRecordByIdempotencyKey(verificationLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const detailPort = assertDetailPort(options.studentAppPublishedMaterialDetailMetadataReadPort);
  const detailResult = await detailPort.getPublishedArchiveMaterialMetadata(
    {
      principal: normalized.principal,
      archiveItemId: normalized.archiveItemId,
    },
    {
      verificationInvocationId: normalized.verificationInvocationId,
      idempotencyKey: normalized.idempotencyKey,
      sourceSearchRecordId: normalized.sourceSearch.recordId,
    },
  );
  const verified = assertDetailResult(detailResult, normalized);
  const record = buildVerificationRecord(normalized, verified, verifiedAt, options.probeP99Ms ?? 7);
  appendVerificationRecord(verificationLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatTeachingArchiveMaterialPublishedDetailMetadataRead(result) {
  return [
    `Teaching archive material published detail metadata read: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Endpoint: ${result.studentProductDetailSource.endpoint}`,
    `Repository: ${result.studentProductDetailSource.repository}`,
    `Archive item: ${result.detail.archiveItemId}`,
    `Content ref excluded: ${result.boundary.contentRefExcluded}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const verificationInvocationId = requireToken(
    input.verificationInvocationId,
    "input.verificationInvocationId",
    "archive_material_published_detail_metadata_read_",
  );
  const principal = assertStudentPrincipal(input.principal);
  const sourceReport = assertSourceSearchReport(input.publishedSearchFoundationReport);
  const sourceSearch = assertSourceSearchResult(sourceReport);
  requireConst(principal.studentAccess.ownStudentId, sourceSearch.principal.studentAccess.ownStudentId, "input.principal.studentAccess.ownStudentId");
  const archiveItemId = requireArchiveItemID(input.archiveItemId, "input.archiveItemId");
  requireConst(archiveItemId, sourceSearch.matchedArchiveItemId, "input.archiveItemId");
  const expectedArchiveItem = assertSafeArchiveMetadata(input.expectedArchiveItem, "input.expectedArchiveItem");
  requireConst(expectedArchiveItem.id, archiveItemId, "input.expectedArchiveItem.id");
  requireConst(expectedArchiveItem.studentId, principal.studentAccess.ownStudentId, "input.expectedArchiveItem.studentId");
  const policy = assertDetailPolicy(input.detailMetadataReadPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 3, 1200);
  if (!evidenceRefs.some((ref) => ref.includes("published-search-foundation"))) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_MISSING_SEARCH_EVIDENCE", "0315 published search foundation evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("published-detail-metadata-read"))) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_MISSING_DETAIL_EVIDENCE", "0316 detail metadata read evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("go-student-app-archive-detail"))) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_MISSING_GO_EVIDENCE", "Go detail route/use case evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const verificationInputHash = hashInput({
    verificationInvocationId,
    principalId: principal.principalId,
    ownStudentId: principal.studentAccess.ownStudentId,
    sourceSearchRecordId: sourceSearch.recordId,
    archiveItemId,
    expectedArchiveItem,
    policy,
  });
  return {
    verificationInvocationId,
    principal,
    sourceReport,
    sourceSearch,
    archiveItemId,
    expectedArchiveItem,
    policy,
    evidenceRefs,
    idempotencyKey,
    verificationInputHash,
  };
}

function assertStudentPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  if (!scopes.includes("STUDENT_OWN_READ")) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_MISSING_SCOPE", "STUDENT_OWN_READ is required");
  }
  assertPlainObject(principal.studentAccess, "input.principal.studentAccess");
  requireConst(principal.subjectType, "USER", "input.principal.subjectType");
  requireConst(principal.role, "STUDENT", "input.principal.role");
  requireConst(principal.entryPoint, "STUDENT_APP", "input.principal.entryPoint");
  requireConst(principal.studentAccess.mode, "OWN", "input.principal.studentAccess.mode");
  return {
    principalId: requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128),
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

function assertSourceSearchReport(report) {
  assertPlainObject(report, "input.publishedSearchFoundationReport");
  requireConst(report.readiness, "READY", "input.publishedSearchFoundationReport.readiness");
  requireConst(report.workloadType, sourceWorkload, "input.publishedSearchFoundationReport.workloadType");
  requireConst(report.runtime?.runtimeId, sourceRuntimeId, "input.publishedSearchFoundationReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, sourceCommandPort, "input.publishedSearchFoundationReport.runtime.commandPort");
  requireConst(report.runtime?.status, sourceStatus, "input.publishedSearchFoundationReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.publishedSearchFoundationReport.runtimeSlo.totalErrors");
  for (const field of [
    "publicationStoreFiltered", "ownStudentOnly", "unpublishedArchiveItemsExcluded",
    "draftOnlyArchiveItemsExcluded", "crossStudentArchiveItemsExcluded",
    "responseMetadataOnly", "answerKeyAndModelOutputExcluded",
  ]) {
    requireConst(report.safetyInvariants?.[field], true, `input.publishedSearchFoundationReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "fullTextContentReadAllowed",
    "ocrOrRagJobWriteStarted", "aiGradingWriteStarted", "modelInferenceStarted",
    "publicationWriteStarted", "remoteDeviceControlAllowed", "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(report.safetyInvariants?.[field], false, `input.publishedSearchFoundationReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertSourceSearchResult(report) {
  const result = report.runtimeProbes?.teachingArchiveMaterialPublishedSearchFoundation?.result;
  assertPlainObject(result, "input.publishedSearchFoundationReport.runtimeProbes.result");
  requireConst(result.runtimeId, sourceRuntimeId, "source.runtimeId");
  requireConst(result.status, sourceStatus, "source.status");
  requireConst(result.studentProductSearchSource?.repository, "ArchiveRepository.ListPublishedForStudentApp", "source.studentProductSearchSource.repository");
  return {
    recordId: requireBoundedString(result.recordId, "source.recordId", 1, 520),
    matchedArchiveItemId: requireArchiveItemID(result.search?.matchedArchiveItemId, "source.search.matchedArchiveItemId"),
    principal: assertStudentPrincipalForSource(result.principal),
    evidenceRefs: uniqueStringArray(result.evidenceRefs ?? [], "source.evidenceRefs", 1, 1800),
  };
}

function assertStudentPrincipalForSource(principal) {
  assertPlainObject(principal, "source.principal");
  return {
    principalId: requireBoundedString(principal.principalId, "source.principal.principalId", 1, 128),
    studentAccess: {
      ownStudentId: requireBoundedString(principal.studentAccess?.ownStudentId, "source.principal.studentAccess.ownStudentId", 1, 128),
    },
  };
}

function assertDetailPolicy(policy) {
  assertPlainObject(policy, "input.detailMetadataReadPolicy");
  for (const field of [
    "sourceSearchFoundationRequired", "publishedProjectionDetailPortRequired",
    "archiveItemIdNormalizationRequired", "publicationStoreFilterRequired",
    "ownStudentOnlyRequired", "safeMetadataOnlyRequired", "contentRefExcludedRequired",
    "goUseCaseReadAllowed",
  ]) {
    requireConst(policy[field], true, `input.detailMetadataReadPolicy.${field}`);
  }
  for (const field of [
    "rawContentReadAllowed", "directDatabaseAccessAllowed", "executeHttpRequestAllowed",
    "ocrOrRagJobWriteAllowed", "aiGradingWriteAllowed", "modelInferenceAllowed",
    "publicationWriteAllowed", "remoteDeviceControlAllowed", "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.detailMetadataReadPolicy.${field}`);
  }
  return { ...policy };
}

function assertDetailPort(port) {
  if (!port || typeof port.getPublishedArchiveMaterialMetadata !== "function") {
    throw verificationError(
      "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_MISSING_PORT",
      "StudentAppPublishedMaterialDetailMetadataReadPort.getPublishedArchiveMaterialMetadata is required",
    );
  }
  return port;
}

function assertDetailResult(result, normalized) {
  rejectLeakedFields(result, "StudentAppPublishedMaterialDetailMetadataReadPort result");
  assertPlainObject(result, "StudentAppPublishedMaterialDetailMetadataReadPort result");
  requireConst(result.found, true, "StudentAppPublishedMaterialDetailMetadataReadPort result.found");
  const source = assertDetailSource(result.source);
  const response = assertDetailResponse(result.response, normalized);
  return { source, response };
}

function assertDetailSource(source) {
  assertPlainObject(source, "StudentAppPublishedMaterialDetailMetadataReadPort result.source");
  return {
    endpoint: requireConst(source.endpoint, targetEndpoint, "StudentAppPublishedMaterialDetailMetadataReadPort result.source.endpoint"),
    useCase: requireConst(source.useCase, targetUseCase, "StudentAppPublishedMaterialDetailMetadataReadPort result.source.useCase"),
    repository: requireConst(source.repository, targetRepository, "StudentAppPublishedMaterialDetailMetadataReadPort result.source.repository"),
    projectionTable: requireConst(source.projectionTable, targetProjectionTable, "StudentAppPublishedMaterialDetailMetadataReadPort result.source.projectionTable"),
    archiveItemIdNormalized: requireConst(source.archiveItemIdNormalized, true, "StudentAppPublishedMaterialDetailMetadataReadPort result.source.archiveItemIdNormalized"),
    publicationStoreFiltered: requireConst(source.publicationStoreFiltered, true, "StudentAppPublishedMaterialDetailMetadataReadPort result.source.publicationStoreFiltered"),
    ownStudentOnly: requireConst(source.ownStudentOnly, true, "StudentAppPublishedMaterialDetailMetadataReadPort result.source.ownStudentOnly"),
    genericGetByIDBypassed: requireConst(source.genericGetByIDBypassed, true, "StudentAppPublishedMaterialDetailMetadataReadPort result.source.genericGetByIDBypassed"),
    contentRefExcluded: requireConst(source.contentRefExcluded, true, "StudentAppPublishedMaterialDetailMetadataReadPort result.source.contentRefExcluded"),
  };
}

function assertDetailResponse(response, normalized) {
  const item = assertSafeArchiveMetadata(response, "StudentAppPublishedMaterialDetailMetadataReadPort result.response");
  requireConst(item.id, normalized.archiveItemId, "StudentAppPublishedMaterialDetailMetadataReadPort result.response.id");
  requireConst(item.studentId, normalized.principal.studentAccess.ownStudentId, "StudentAppPublishedMaterialDetailMetadataReadPort result.response.studentId");
  requireConst(JSON.stringify(item), JSON.stringify(normalized.expectedArchiveItem), "StudentAppPublishedMaterialDetailMetadataReadPort result.response");
  return { item };
}

function assertSafeArchiveMetadata(item, label) {
  rejectLeakedFields(item, label);
  assertPlainObject(item, label);
  return {
    id: requireArchiveItemID(item.id, `${label}.id`),
    ownerType: requireConst(item.ownerType, "STUDENT", `${label}.ownerType`),
    studentId: requireBoundedString(item.studentId, `${label}.studentId`, 1, 128),
    materialType: requireOneOf(item.materialType, `${label}.materialType`, ["HANDOUT", "HOMEWORK", "PAPER", "QUIZ"]),
    title: requireSafeText(item.title, `${label}.title`, 1, 200),
    source: requireOneOf(item.source, `${label}.source`, ["SYSTEM_IMPORT", "TEACHER_UPLOAD", "STUDENT_UPLOAD"]),
    tags: uniqueStringArray(item.tags ?? [], `${label}.tags`, 0, 32),
    analysisIntents: uniqueStringArray(item.analysisIntents ?? [], `${label}.analysisIntents`, 1, 8),
    ocrStatus: requireOneOf(item.ocrStatus, `${label}.ocrStatus`, ["NOT_REQUIRED", "RESERVED"]),
    createdAt: requireIsoString(item.createdAt, `${label}.createdAt`),
  };
}

function buildVerificationRecord(normalized, verified, verifiedAt, p99Ms) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ",
    recordId: `teaching_archive_material_published_detail_metadata_read_${safeToken(normalized.idempotencyKey)}`,
    verifiedAt,
    runtimeId: TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_RUNTIME_ID,
    commandPort: TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_PORT,
    status: verifiedStatus,
    verificationInvocationId: normalized.verificationInvocationId,
    sourcePublishedSearchFoundation: {
      workloadType: sourceWorkload,
      runtimeId: sourceRuntimeId,
      recordId: normalized.sourceSearch.recordId,
      matchedArchiveItemId: normalized.sourceSearch.matchedArchiveItemId,
    },
    principal: normalized.principal,
    detail: {
      archiveItemId: verified.response.item.id,
      materialType: verified.response.item.materialType,
      title: verified.response.item.title,
    },
    studentProductDetailSource: verified.source,
    responseMetadata: verified.response.item,
    boundary: {
      sourceSearchFoundationRequired: true,
      publishedProjectionDetailPortInvoked: true,
      goUseCaseReadAllowed: true,
      archiveItemIdNormalized: true,
      publicationStoreFiltered: true,
      ownStudentOnly: true,
      safeMetadataOnly: true,
      contentRefExcluded: true,
      publicationMetadataExcluded: true,
      answerKeyAndModelOutputExcluded: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      rawContentReadAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      publicationWriteStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureContentPreviewSlice: true,
    },
    evidenceRefs: uniqueEvidenceRefs([
      ...normalized.evidenceRefs,
      ...normalized.sourceSearch.evidenceRefs,
      `evidence:archive-material-published-detail-metadata-read-input-hash:${normalized.verificationInputHash}`,
      `evidence:runtime:${TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_RUNTIME_ID}`,
      `evidence:command-port:${TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_PORT}`,
      `evidence:go-student-app-archive-detail:${targetUseCase}`,
      `evidence:postgres-published-detail:${targetRepository}`,
      `evidence:publication-projection-table:${targetProjectionTable}`,
    ]),
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.verificationInputHash,
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms,
      totalErrors: 0,
      operations: 1,
      evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_PROBE",
    },
    nextAction: "Use this as Student App published-material detail metadata evidence; full content preview, OCR/RAG enrichment, semantic retrieval, AI grading linkage, and Swarm remain separate reviewed slices.",
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
  requireConst(record.detail.archiveItemId, normalized.archiveItemId, "record.detail.archiveItemId");
  requireConst(record.sourcePublishedSearchFoundation.recordId, normalized.sourceSearch.recordId, "record.sourcePublishedSearchFoundation.recordId");
}

function appendVerificationRecord(logPath, record) {
  const absolute = path.resolve(logPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.appendFileSync(absolute, `${JSON.stringify(record)}\n`);
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_INVALID_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_CONTRACT_MISMATCH", `${label} must be ${expected}`);
  }
  return expected;
}

function requireOneOf(actual, label, allowed) {
  if (!allowed.includes(actual)) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_INVALID_ENUM", `${label} must be one of ${allowed.join(", ")}`);
  }
  return actual;
}

function requireBoundedString(value, label, minLength, maxLength) {
  if (typeof value !== "string" || value.length < minLength || value.length > maxLength) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_INVALID_STRING", `${label} must be a string of length ${minLength}-${maxLength}`);
  }
  return value;
}

function requireSafeText(value, label, minLength, maxLength) {
  const text = requireBoundedString(value, label, minLength, maxLength);
  if (/[\x00-\x1F\x7F<>]|\bscript\b|javascript:|data:/iu.test(text)) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_UNSAFE_TEXT", `${label} contains unsafe text`);
  }
  return text;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 420);
  if (!token.startsWith(prefix) || !/^[A-Za-z0-9:_-]+$/u.test(token)) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_INVALID_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireArchiveItemID(value, label) {
  const id = requireBoundedString(String(value ?? "").trim(), label, "tarch_".length + 1, 1000);
  if (!/^tarch_[A-Za-z0-9_-]+$/u.test(id)) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_INVALID_ARCHIVE_ITEM_ID", `${label} must be a tarch_ id token`);
  }
  return id;
}

function requireIsoString(value, label) {
  const text = requireBoundedString(value, label, 20, 40);
  if (Number.isNaN(Date.parse(text))) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_INVALID_TIME", `${label} must be an ISO timestamp`);
  }
  return text;
}

function uniqueStringArray(value, label, minLength, maxLength) {
  if (!Array.isArray(value) || value.length < minLength || value.length > maxLength) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_INVALID_ARRAY", `${label} must contain ${minLength}-${maxLength} strings`);
  }
  const seen = new Set();
  return value.map((item, index) => {
    const normalized = requireBoundedString(String(item), `${label}[${index}]`, 1, 420);
    if (seen.has(normalized)) {
      throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_DUPLICATE_STRING", `${label}[${index}] is duplicated`);
    }
    seen.add(normalized);
    return normalized;
  });
}

function rejectLeakedFields(value, context) {
  if (!value || typeof value !== "object") return;
  const stack = [{ value, path: context }];
  while (stack.length) {
    const current = stack.pop();
    for (const [key, nested] of Object.entries(current.value)) {
      if (leakedFieldNames.includes(key)) {
        throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_LEAKED_FIELD", `${current.path}.${key} is not allowed`);
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
