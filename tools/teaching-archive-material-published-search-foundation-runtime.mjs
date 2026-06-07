import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_RUNTIME_ID =
  "teaching_archive_material_published_search_foundation_runtime";
export const TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_PORT =
  "TeachingArchiveMaterialPublishedSearchFoundationPort.verifyStudentAppPublishedMaterialSearch";

const inputSchemaVersion = "2026-06-07.teaching.archive-material-published-search-foundation.v1";
const outputSchemaVersion = "2026-06-07.teaching.archive-material-published-search-foundation-verified.v1";
const sourceWorkload = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING";
const sourceRuntimeId = "teaching_archive_material_publication_projection_hardening_runtime";
const sourceCommandPort =
  "TeachingArchiveMaterialPublicationProjectionHardeningPort.verifyStudentAppPublishedMaterialProjection";
const sourceStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENED";
const verifiedStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_VERIFIED";
const targetEndpoint = "GET /v1/student-app/archive-items?query=";
const targetUseCase = "ListStudentAppArchiveItems.Execute";
const targetRepository = "ArchiveRepository.ListPublishedForStudentApp";
const targetProjectionTable = "teaching_archive_publications";
const targetSearchIndex = "idx_teaching_archive_items_student_material_search_scope";
const defaultVerificationLogPath =
  "reports/student-command-log/teaching-archive-material-published-search-foundation.jsonl";

const leakedFieldNames = [
  "rawContent", "answerKey", "rawModelOutput", "modelOutput", "directSql", "dbUrl",
  "internalError", "databaseWriteResult", "workerId", "claimExpiresAt", "answerText",
  "expectedAnswer", "explanation", "scoreSummary", "resultRef",
];
const productOnlyLeakedFieldNames = [
  "publicationId", "publicationState", "visibilityState", "approvalRecordId", "approvalId",
  "publicationCandidateId", "committedAt", "sourcePublicationStorageCommit",
];

export async function verifyTeachingArchiveMaterialPublishedSearchFoundation(input, options = {}) {
  const verifiedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const verificationLogPath = options.verificationLogPath ?? defaultVerificationLogPath;
  const existing = findExistingRecordByIdempotencyKey(verificationLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const searchPort = assertSearchPort(options.studentAppPublishedMaterialSearchPort);
  const searchResult = await searchPort.searchPublishedArchiveMaterials(
    {
      principal: normalized.principal,
      query: normalized.searchQuery,
      materialType: normalized.materialType,
      pageSize: 10,
      cursor: "",
    },
    {
      verificationInvocationId: normalized.verificationInvocationId,
      idempotencyKey: normalized.idempotencyKey,
      sourceProjectionRecordId: normalized.sourceProjection.recordId,
    },
  );
  const verified = assertSearchResult(searchResult, normalized);
  const record = buildVerificationRecord(normalized, verified, verifiedAt, options.probeP99Ms ?? 9);
  appendVerificationRecord(verificationLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatTeachingArchiveMaterialPublishedSearchFoundation(result) {
  return [
    `Teaching archive material published search foundation: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Endpoint: ${result.studentProductSearchSource.endpoint}`,
    `Repository: ${result.studentProductSearchSource.repository}`,
    `Query: ${result.search.query}`,
    `Excluded non-matches: ${result.searchExclusions.nonMatchingPublishedMaterialsExcluded}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const verificationInvocationId = requireToken(
    input.verificationInvocationId,
    "input.verificationInvocationId",
    "archive_material_published_search_foundation_",
  );
  const principal = assertStudentPrincipal(input.principal);
  const sourceReport = assertSourceProjectionReport(input.publicationProjectionHardeningReport);
  const sourceProjection = assertSourceProjectionResult(sourceReport);
  requireConst(principal.studentAccess.ownStudentId, sourceProjection.hardenedPublishedArchiveMaterial.archiveItem.studentId, "input.principal.studentAccess.ownStudentId");
  const searchQuery = requireSearchQuery(input.searchQuery);
  const materialType = requireOneOf(input.materialType, "input.materialType", ["HANDOUT", "HOMEWORK", "PAPER", "QUIZ"]);
  const policy = assertSearchPolicy(input.searchFoundationPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 3, 1200);
  if (!evidenceRefs.some((ref) => ref.includes("publication-projection-hardening"))) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_MISSING_PROJECTION_EVIDENCE", "0314 projection hardening evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("published-search-foundation"))) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_MISSING_SEARCH_EVIDENCE", "0315 search foundation evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("go-student-app-archive-query"))) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_MISSING_GO_EVIDENCE", "Go query propagation evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const verificationInputHash = hashInput({
    verificationInvocationId,
    principalId: principal.principalId,
    ownStudentId: principal.studentAccess.ownStudentId,
    sourceProjectionRecordId: sourceProjection.recordId,
    searchQuery,
    materialType,
    policy,
  });
  return {
    verificationInvocationId,
    principal,
    sourceReport,
    sourceProjection,
    searchQuery,
    materialType,
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
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_MISSING_SCOPE", "STUDENT_OWN_READ is required");
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

function assertSourceProjectionReport(report) {
  assertPlainObject(report, "input.publicationProjectionHardeningReport");
  requireConst(report.readiness, "READY", "input.publicationProjectionHardeningReport.readiness");
  requireConst(report.workloadType, sourceWorkload, "input.publicationProjectionHardeningReport.workloadType");
  requireConst(report.runtime?.runtimeId, sourceRuntimeId, "input.publicationProjectionHardeningReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, sourceCommandPort, "input.publicationProjectionHardeningReport.runtime.commandPort");
  requireConst(report.runtime?.status, sourceStatus, "input.publicationProjectionHardeningReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.publicationProjectionHardeningReport.runtimeSlo.totalErrors");
  for (const field of [
    "publicationStoreFiltered", "studentAppChannelFiltered", "ownStudentOnly",
    "unpublishedArchiveItemsExcluded", "draftOnlyArchiveItemsExcluded",
    "crossStudentArchiveItemsExcluded", "publicationMetadataLeakPrevented",
  ]) {
    requireConst(report.safetyInvariants?.[field], true, `input.publicationProjectionHardeningReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "ocrOrRagJobWriteStarted",
    "aiGradingWriteStarted", "modelInferenceStarted", "publicationWriteStarted",
    "remoteDeviceControlAllowed", "localToolMutationAllowed", "swarmAllowed",
  ]) {
    requireConst(report.safetyInvariants?.[field], false, `input.publicationProjectionHardeningReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertSourceProjectionResult(report) {
  const result = report.runtimeProbes?.teachingArchiveMaterialPublicationProjectionHardening?.result;
  assertPlainObject(result, "input.publicationProjectionHardeningReport.runtimeProbes.result");
  requireConst(result.runtimeId, sourceRuntimeId, "source.runtimeId");
  requireConst(result.status, sourceStatus, "source.status");
  requireConst(result.studentProductReadSource?.repository, targetRepository, "source.studentProductReadSource.repository");
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "source.recordId", 1, 520),
    hardenedPublishedArchiveMaterial: {
      archiveItem: assertArchiveItem(result.hardenedPublishedArchiveMaterial?.archiveItem, "source.hardenedPublishedArchiveMaterial.archiveItem"),
    },
    evidenceRefs: uniqueStringArray(result.evidenceRefs ?? [], "source.evidenceRefs", 1, 1800),
  };
}

function assertSearchPolicy(policy) {
  assertPlainObject(policy, "input.searchFoundationPolicy");
  for (const field of [
    "sourceProjectionHardeningRequired", "publishedProjectionSearchPortRequired",
    "queryNormalizationRequired", "titleAndTagSearchOnly", "publicationStoreFilterRequired",
    "ownStudentOnlyRequired", "nonMatchingPublishedMaterialsExcludedRequired",
    "unpublishedItemsExcludedRequired", "responseMetadataOnlyRequired", "goUseCaseReadAllowed",
  ]) {
    requireConst(policy[field], true, `input.searchFoundationPolicy.${field}`);
  }
  for (const field of [
    "fullTextContentReadAllowed", "directDatabaseAccessAllowed", "executeHttpRequestAllowed",
    "ocrOrRagJobWriteAllowed", "aiGradingWriteAllowed", "modelInferenceAllowed",
    "publicationWriteAllowed", "remoteDeviceControlAllowed", "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.searchFoundationPolicy.${field}`);
  }
  return { ...policy };
}

function assertSearchPort(port) {
  if (!port || typeof port.searchPublishedArchiveMaterials !== "function") {
    throw verificationError(
      "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_MISSING_PORT",
      "StudentAppPublishedMaterialSearchPort.searchPublishedArchiveMaterials is required",
    );
  }
  return port;
}

function assertSearchResult(result, normalized) {
  rejectLeakedFields(result, "StudentAppPublishedMaterialSearchPort result");
  assertPlainObject(result, "StudentAppPublishedMaterialSearchPort result");
  requireConst(result.found, true, "StudentAppPublishedMaterialSearchPort result.found");
  const source = assertSearchSource(result.source);
  const exclusions = assertSearchExclusions(result.exclusions);
  const response = assertSearchResponse(result.response, normalized);
  return { source, exclusions, response };
}

function assertSearchSource(source) {
  assertPlainObject(source, "StudentAppPublishedMaterialSearchPort result.source");
  return {
    endpoint: requireConst(source.endpoint, targetEndpoint, "StudentAppPublishedMaterialSearchPort result.source.endpoint"),
    useCase: requireConst(source.useCase, targetUseCase, "StudentAppPublishedMaterialSearchPort result.source.useCase"),
    repository: requireConst(source.repository, targetRepository, "StudentAppPublishedMaterialSearchPort result.source.repository"),
    projectionTable: requireConst(source.projectionTable, targetProjectionTable, "StudentAppPublishedMaterialSearchPort result.source.projectionTable"),
    searchIndexProfile: requireConst(source.searchIndexProfile, targetSearchIndex, "StudentAppPublishedMaterialSearchPort result.source.searchIndexProfile"),
    queryNormalized: requireConst(source.queryNormalized, true, "StudentAppPublishedMaterialSearchPort result.source.queryNormalized"),
    titleTagSearchOnly: requireConst(source.titleTagSearchOnly, true, "StudentAppPublishedMaterialSearchPort result.source.titleTagSearchOnly"),
    publicationStoreFiltered: requireConst(source.publicationStoreFiltered, true, "StudentAppPublishedMaterialSearchPort result.source.publicationStoreFiltered"),
    ownStudentOnly: requireConst(source.ownStudentOnly, true, "StudentAppPublishedMaterialSearchPort result.source.ownStudentOnly"),
  };
}

function assertSearchExclusions(exclusions) {
  assertPlainObject(exclusions, "StudentAppPublishedMaterialSearchPort result.exclusions");
  return {
    nonMatchingPublishedMaterialsExcluded: requireConst(exclusions.nonMatchingPublishedMaterialsExcluded, true, "StudentAppPublishedMaterialSearchPort result.exclusions.nonMatchingPublishedMaterialsExcluded"),
    unpublishedArchiveItemsExcluded: requireConst(exclusions.unpublishedArchiveItemsExcluded, true, "StudentAppPublishedMaterialSearchPort result.exclusions.unpublishedArchiveItemsExcluded"),
    draftOnlyArchiveItemsExcluded: requireConst(exclusions.draftOnlyArchiveItemsExcluded, true, "StudentAppPublishedMaterialSearchPort result.exclusions.draftOnlyArchiveItemsExcluded"),
    crossStudentArchiveItemsExcluded: requireConst(exclusions.crossStudentArchiveItemsExcluded, true, "StudentAppPublishedMaterialSearchPort result.exclusions.crossStudentArchiveItemsExcluded"),
    answerKeyAndModelOutputExcluded: requireConst(exclusions.answerKeyAndModelOutputExcluded, true, "StudentAppPublishedMaterialSearchPort result.exclusions.answerKeyAndModelOutputExcluded"),
  };
}

function assertSearchResponse(response, normalized) {
  assertPlainObject(response, "StudentAppPublishedMaterialSearchPort result.response");
  const data = Array.isArray(response.data) ? response.data : [];
  if (data.length === 0) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_EMPTY_RESPONSE", "search response data must not be empty");
  }
  const expectedID = normalized.sourceProjection.hardenedPublishedArchiveMaterial.archiveItem.id;
  let matched = null;
  for (const [index, value] of data.entries()) {
    const item = assertArchiveItem(value, `StudentAppPublishedMaterialSearchPort result.response.data[${index}]`);
    rejectProductOnlyLeakedFields(value, `StudentAppPublishedMaterialSearchPort result.response.data[${index}]`);
    if (item.ownerType !== "STUDENT" || item.studentId !== normalized.principal.studentAccess.ownStudentId) {
      throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_SCOPE_LEAK", `response item ${item.id} is outside own-student scope`);
    }
    if (!archiveItemMatchesQuery(item, normalized.searchQuery)) {
      throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_QUERY_MISMATCH", `response item ${item.id} does not match query`);
    }
    if (item.id === expectedID) matched = item;
  }
  if (!matched) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_MISSING_EXPECTED_MATERIAL", `${expectedID} was not returned by search`);
  }
  return {
    data,
    pageInfo: {
      pageSize: Number(response.pageInfo?.pageSize ?? data.length),
      hasMore: Boolean(response.pageInfo?.hasMore ?? false),
      nextCursor: optionalBoundedString(response.pageInfo?.nextCursor, "StudentAppPublishedMaterialSearchPort result.response.pageInfo.nextCursor", 420),
    },
    matchedArchiveItem: matched,
  };
}

function assertArchiveItem(item, label) {
  rejectLeakedFields(item, label);
  assertPlainObject(item, label);
  const ownerType = requireOneOf(item.ownerType, `${label}.ownerType`, ["STUDENT", "TEACHING"]);
  return {
    id: requireToken(item.id, `${label}.id`, "tarch_"),
    ownerType,
    studentId: ownerType === "STUDENT" ? requireBoundedString(item.studentId, `${label}.studentId`, 1, 128) : "",
    materialType: requireOneOf(item.materialType, `${label}.materialType`, ["HANDOUT", "HOMEWORK", "PAPER", "QUIZ"]),
    title: requireSafeText(item.title, `${label}.title`, 1, 200),
    source: requireOneOf(item.source, `${label}.source`, ["SYSTEM_IMPORT", "TEACHER_UPLOAD", "STUDENT_UPLOAD"]),
    contentRef: requireSafeText(item.contentRef, `${label}.contentRef`, 12, 1000),
    tags: uniqueStringArray(item.tags ?? [], `${label}.tags`, 0, 32),
    analysisIntents: uniqueStringArray(item.analysisIntents ?? [], `${label}.analysisIntents`, 1, 8),
    ocrStatus: requireOneOf(item.ocrStatus, `${label}.ocrStatus`, ["NOT_REQUIRED", "RESERVED"]),
    createdAt: requireIsoString(item.createdAt, `${label}.createdAt`),
  };
}

function buildVerificationRecord(normalized, verified, verifiedAt, p99Ms) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION",
    recordId: `teaching_archive_material_published_search_foundation_${safeToken(normalized.idempotencyKey)}`,
    verifiedAt,
    runtimeId: TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_RUNTIME_ID,
    commandPort: TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_PORT,
    status: verifiedStatus,
    verificationInvocationId: normalized.verificationInvocationId,
    sourceProjectionHardening: {
      workloadType: sourceWorkload,
      runtimeId: sourceRuntimeId,
      recordId: normalized.sourceProjection.recordId,
      archiveItemId: normalized.sourceProjection.hardenedPublishedArchiveMaterial.archiveItem.id,
    },
    principal: normalized.principal,
    search: {
      query: normalized.searchQuery,
      materialType: normalized.materialType,
      matchedArchiveItemId: verified.response.matchedArchiveItem.id,
    },
    studentProductSearchSource: verified.source,
    searchExclusions: verified.exclusions,
    responsePageInfo: verified.response.pageInfo,
    boundary: {
      sourceProjectionHardeningRequired: true,
      publishedProjectionSearchPortInvoked: true,
      goUseCaseReadAllowed: true,
      queryNormalized: true,
      titleAndTagSearchOnly: true,
      publicationStoreFiltered: true,
      ownStudentOnly: true,
      nonMatchingPublishedMaterialsExcluded: true,
      unpublishedArchiveItemsExcluded: true,
      draftOnlyArchiveItemsExcluded: true,
      crossStudentArchiveItemsExcluded: true,
      responseMetadataOnly: true,
      answerKeyAndModelOutputExcluded: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      publicationWriteStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureOcrRagSemanticSearchSlice: true,
    },
    evidenceRefs: uniqueEvidenceRefs([
      ...normalized.evidenceRefs,
      ...normalized.sourceProjection.evidenceRefs,
      `evidence:archive-material-published-search-foundation-input-hash:${normalized.verificationInputHash}`,
      `evidence:runtime:${TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_RUNTIME_ID}`,
      `evidence:command-port:${TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_PORT}`,
      `evidence:go-student-app-archive-query:${targetUseCase}`,
      `evidence:postgres-published-query:${targetRepository}`,
      `evidence:search-index-profile:${targetSearchIndex}`,
    ]),
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.verificationInputHash,
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms,
      totalErrors: 0,
      operations: 1,
      evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_PROBE",
    },
    nextAction: "Use this as Student App published-material metadata search foundation; OCR/RAG full-content indexing, semantic retrieval, AI grading linkage, and Swarm remain separate reviewed slices.",
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
  requireConst(record.search.query, normalized.searchQuery, "record.search.query");
  requireConst(record.sourceProjectionHardening.recordId, normalized.sourceProjection.recordId, "record.sourceProjectionHardening.recordId");
}

function appendVerificationRecord(logPath, record) {
  const absolute = path.resolve(logPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.appendFileSync(absolute, `${JSON.stringify(record)}\n`);
}

function archiveItemMatchesQuery(item, query) {
  const needle = query.toLowerCase();
  return item.title.toLowerCase().includes(needle) ||
    item.tags.some((tag) => tag.toLowerCase().includes(needle));
}

function requireSearchQuery(value) {
  const text = requireSafeText(String(value ?? ""), "input.searchQuery", 1, 120).replace(/\s+/gu, " ").trim();
  if (text === "") {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_EMPTY_QUERY", "search query is required");
  }
  return text;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_INVALID_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_CONTRACT_MISMATCH", `${label} must be ${expected}`);
  }
  return expected;
}

function requireOneOf(actual, label, allowed) {
  if (!allowed.includes(actual)) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_INVALID_ENUM", `${label} must be one of ${allowed.join(", ")}`);
  }
  return actual;
}

function requireBoundedString(value, label, minLength, maxLength) {
  if (typeof value !== "string" || value.length < minLength || value.length > maxLength) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_INVALID_STRING", `${label} must be a string of length ${minLength}-${maxLength}`);
  }
  return value;
}

function optionalBoundedString(value, label, maxLength) {
  if (value === undefined || value === null || value === "") return "";
  return requireBoundedString(String(value), label, 1, maxLength);
}

function requireSafeText(value, label, minLength, maxLength) {
  const text = requireBoundedString(value, label, minLength, maxLength);
  if (/[\x00-\x1F\x7F<>]|\bscript\b|javascript:|data:/iu.test(text)) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_UNSAFE_TEXT", `${label} contains unsafe text`);
  }
  return text;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 420);
  if (!token.startsWith(prefix) || !/^[A-Za-z0-9:_-]+$/u.test(token)) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_INVALID_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireIsoString(value, label) {
  const text = requireBoundedString(value, label, 20, 40);
  if (Number.isNaN(Date.parse(text))) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_INVALID_TIME", `${label} must be an ISO timestamp`);
  }
  return text;
}

function uniqueStringArray(value, label, minLength, maxLength) {
  if (!Array.isArray(value) || value.length < minLength || value.length > maxLength) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_INVALID_ARRAY", `${label} must contain ${minLength}-${maxLength} strings`);
  }
  const seen = new Set();
  return value.map((item, index) => {
    const normalized = requireBoundedString(String(item), `${label}[${index}]`, 1, 420);
    if (seen.has(normalized)) {
      throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_DUPLICATE_STRING", `${label}[${index}] is duplicated`);
    }
    seen.add(normalized);
    return normalized;
  });
}

function rejectLeakedFields(value, context) {
  if (!value || typeof value !== "object") return;
  rejectFields(value, context, leakedFieldNames);
}

function rejectProductOnlyLeakedFields(value, context) {
  rejectFields(value, context, productOnlyLeakedFieldNames);
}

function rejectFields(value, context, fields) {
  if (!value || typeof value !== "object") return;
  const stack = [{ value, path: context }];
  while (stack.length) {
    const current = stack.pop();
    for (const [key, nested] of Object.entries(current.value)) {
      if (fields.includes(key)) {
        throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_LEAKED_FIELD", `${current.path}.${key} is not allowed`);
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
