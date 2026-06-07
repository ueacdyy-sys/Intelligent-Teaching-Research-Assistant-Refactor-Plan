import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_RUNTIME_ID =
  "teaching_archive_material_publication_projection_hardening_runtime";
export const TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_PORT =
  "TeachingArchiveMaterialPublicationProjectionHardeningPort.verifyStudentAppPublishedMaterialProjection";

const inputSchemaVersion = "2026-06-07.teaching.archive-material-publication-projection-hardening.v1";
const outputSchemaVersion = "2026-06-07.teaching.archive-material-publication-projection-hardened.v1";
const sourceWorkload = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ";
const sourceRuntimeId = "teaching_archive_material_publication_student_app_read_runtime";
const sourceCommandPort =
  "TeachingArchiveMaterialPublicationStudentAppReadPort.verifyStudentAppPublishedMaterialRead";
const sourceStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_VERIFIED";
const hardenedStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENED";
const targetEndpoint = "GET /v1/student-app/archive-items";
const targetUseCase = "ListStudentAppArchiveItems.Execute";
const targetRepository = "ArchiveRepository.ListPublishedForStudentApp";
const targetTable = "teaching_archive_publications";
const defaultVerificationLogPath =
  "reports/student-command-log/teaching-archive-material-publication-projection-hardening.jsonl";

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

export async function verifyTeachingArchiveMaterialPublicationProjectionHardening(input, options = {}) {
  const verifiedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const verificationLogPath = options.verificationLogPath ?? defaultVerificationLogPath;
  const existing = findExistingRecordByIdempotencyKey(verificationLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const projectionReadPort = assertProjectionReadPort(options.studentAppPublishedMaterialProjectionReadPort);
  const projectionRead = await projectionReadPort.listPublishedArchiveMaterials(
    {
      principal: normalized.principal,
      archiveItemId: normalized.sourceReadResult.publishedArchiveMaterial.archiveItem.id,
      materialType: normalized.sourceReadResult.publishedArchiveMaterial.archiveItem.materialType,
      pageSize: 10,
      cursor: "",
    },
    {
      verificationInvocationId: normalized.verificationInvocationId,
      idempotencyKey: normalized.idempotencyKey,
      sourceStudentAppReadRecordId: normalized.sourceReadResult.recordId,
      sourcePublicationId: normalized.sourceReadResult.publishedArchiveMaterial.publicationId,
    },
  );
  const verified = assertProjectionReadResult(projectionRead, normalized);
  const record = buildVerificationRecord(normalized, verified, verifiedAt, options.probeP99Ms ?? 9);
  appendVerificationRecord(verificationLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatTeachingArchiveMaterialPublicationProjectionHardening(result) {
  return [
    `Teaching archive material publication projection hardening: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Endpoint: ${result.studentProductReadSource.endpoint}`,
    `Repository: ${result.studentProductReadSource.repository}`,
    `Projection table: ${result.studentProductReadSource.targetTable}`,
    `Unpublished excluded: ${result.boundary.unpublishedArchiveItemsExcluded}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const verificationInvocationId = requireToken(
    input.verificationInvocationId,
    "input.verificationInvocationId",
    "archive_material_publication_projection_hardening_",
  );
  const principal = assertStudentPrincipal(input.principal);
  const sourceReport = assertSourceStudentAppReadReport(input.publicationStudentAppReadReport);
  const sourceReadResult = assertSourceStudentAppReadResult(sourceReport);
  requireConst(principal.studentAccess.ownStudentId, sourceReadResult.publishedArchiveMaterial.archiveItem.studentId, "input.principal.studentAccess.ownStudentId");
  const projectionPolicy = assertProjectionPolicy(input.projectionHardeningPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 3, 900);
  if (!evidenceRefs.some((ref) => ref.includes("publication-student-app-read"))) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_MISSING_STUDENT_APP_READ_EVIDENCE", "0313 student app read evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("publication-projection-hardening"))) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_MISSING_PROJECTION_EVIDENCE", "publication projection hardening evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("go-list-published-for-student-app"))) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_MISSING_GO_EVIDENCE", "Go ListPublishedForStudentApp evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const verificationInputHash = hashInput({
    verificationInvocationId,
    principalId: principal.principalId,
    ownStudentId: principal.studentAccess.ownStudentId,
    sourceStudentAppReadRecordId: sourceReadResult.recordId,
    publishedArchiveMaterial: sourceReadResult.publishedArchiveMaterial,
    projectionPolicy,
  });
  return {
    verificationInvocationId,
    principal,
    sourceReport,
    sourceReadResult,
    projectionPolicy,
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
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_MISSING_SCOPE", "STUDENT_OWN_READ is required");
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

function assertSourceStudentAppReadReport(report) {
  assertPlainObject(report, "input.publicationStudentAppReadReport");
  requireConst(report.readiness, "READY", "input.publicationStudentAppReadReport.readiness");
  requireConst(report.workloadType, sourceWorkload, "input.publicationStudentAppReadReport.workloadType");
  requireConst(report.runtime?.runtimeId, sourceRuntimeId, "input.publicationStudentAppReadReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, sourceCommandPort, "input.publicationStudentAppReadReport.runtime.commandPort");
  requireConst(report.runtime?.status, sourceStatus, "input.publicationStudentAppReadReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.publicationStudentAppReadReport.runtimeSlo.totalErrors");
  for (const field of [
    "studentAppPublishedMaterialReadVerified", "productResponseMatchedPublicationRow",
    "publicationMetadataLeakPrevented", "crossStudentLeakPrevented", "futurePublicationProjectionOrRagRequired",
  ]) {
    requireConst(report.safetyInvariants?.[field], true, `input.publicationStudentAppReadReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "ocrOrRagJobWriteStarted",
    "aiGradingWriteStarted", "modelInferenceStarted", "publicationWriteStarted",
    "remoteDeviceControlAllowed", "localToolMutationAllowed", "swarmAllowed",
  ]) {
    requireConst(report.safetyInvariants?.[field], false, `input.publicationStudentAppReadReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertSourceStudentAppReadResult(report) {
  const result = report.runtimeProbes?.teachingArchiveMaterialPublicationStudentAppRead?.result;
  assertPlainObject(result, "input.publicationStudentAppReadReport.runtimeProbes.result");
  requireConst(result.schemaVersion, "2026-06-07.teaching.archive-material-publication-student-app-read-verified.v1", "source.schemaVersion");
  requireConst(result.runtimeId, sourceRuntimeId, "source.runtimeId");
  requireConst(result.commandPort, sourceCommandPort, "source.commandPort");
  requireConst(result.status, sourceStatus, "source.status");
  requireConst(result.studentProductReadSource?.endpoint, targetEndpoint, "source.studentProductReadSource.endpoint");
  requireConst(result.studentProductReadSource?.useCase, targetUseCase, "source.studentProductReadSource.useCase");
  requireConst(result.boundary?.studentAppPublishedMaterialReadVerified, true, "source.boundary.studentAppPublishedMaterialReadVerified");
  requireConst(result.boundary?.requiresFuturePublicationProjectionOrRagSlice, true, "source.boundary.requiresFuturePublicationProjectionOrRagSlice");
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "source.recordId", 1, 520),
    publishedArchiveMaterial: assertPublishedArchiveMaterial(result.publishedArchiveMaterial),
    evidenceRefs: uniqueStringArray(result.evidenceRefs ?? [], "source.evidenceRefs", 1, 1800),
  };
}

function assertPublishedArchiveMaterial(value) {
  assertPlainObject(value, "source.publishedArchiveMaterial");
  requireToken(value.publicationId, "source.publishedArchiveMaterial.publicationId", "archive_material_publication_commit_");
  requireConst(value.visibilityState, "STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED", "source.publishedArchiveMaterial.visibilityState");
  return {
    publicationId: value.publicationId,
    visibilityState: value.visibilityState,
    archiveItem: assertArchiveItem(value.archiveItem, "source.publishedArchiveMaterial.archiveItem"),
  };
}

function assertProjectionPolicy(policy) {
  assertPlainObject(policy, "input.projectionHardeningPolicy");
  for (const field of [
    "sourceStudentAppReadRequired", "publishedProjectionReadPortRequired",
    "publicationStoreFilterRequired", "publicationStateFilterRequired",
    "visibilityStateFilterRequired", "studentAppChannelFilterRequired",
    "ownStudentOnlyRequired", "unpublishedItemsExcludedRequired",
    "draftOnlyItemsExcludedRequired", "crossStudentItemsExcludedRequired",
    "responseMustMatchPublishedMaterial", "publicationMetadataLeakBlocked",
    "idempotentProjectionVerificationRequired", "goUseCaseReadAllowed",
  ]) {
    requireConst(policy[field], true, `input.projectionHardeningPolicy.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "ocrOrRagJobWriteAllowed",
    "aiGradingWriteAllowed", "modelInferenceAllowed", "publicationWriteAllowed",
    "remoteDeviceControlAllowed", "localToolMutationAllowed", "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.projectionHardeningPolicy.${field}`);
  }
  return { ...policy };
}

function assertProjectionReadPort(port) {
  if (!port || typeof port.listPublishedArchiveMaterials !== "function") {
    throw verificationError(
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_MISSING_PORT",
      "StudentAppPublishedMaterialProjectionReadPort.listPublishedArchiveMaterials is required",
    );
  }
  return port;
}

function assertProjectionReadResult(result, normalized) {
  rejectLeakedFields(result, "StudentAppPublishedMaterialProjectionReadPort result");
  assertPlainObject(result, "StudentAppPublishedMaterialProjectionReadPort result");
  requireConst(result.found, true, "StudentAppPublishedMaterialProjectionReadPort result.found");
  const source = assertProjectionReadSource(result.source);
  const exclusions = assertProjectionExclusions(result.exclusions);
  const response = assertProjectionResponse(result.response, normalized.sourceReadResult.publishedArchiveMaterial.archiveItem);
  return { source, exclusions, response };
}

function assertProjectionReadSource(source) {
  assertPlainObject(source, "StudentAppPublishedMaterialProjectionReadPort result.source");
  return {
    endpoint: requireConst(source.endpoint, targetEndpoint, "StudentAppPublishedMaterialProjectionReadPort result.source.endpoint"),
    useCase: requireConst(source.useCase, targetUseCase, "StudentAppPublishedMaterialProjectionReadPort result.source.useCase"),
    repository: requireConst(source.repository, targetRepository, "StudentAppPublishedMaterialProjectionReadPort result.source.repository"),
    targetTable: requireConst(source.targetTable, targetTable, "StudentAppPublishedMaterialProjectionReadPort result.source.targetTable"),
    schemaIndex: requireConst(source.schemaIndex, "idx_teaching_archive_publications_student_app_visible_lookup", "StudentAppPublishedMaterialProjectionReadPort result.source.schemaIndex"),
    publicationStoreFiltered: requireConst(source.publicationStoreFiltered, true, "StudentAppPublishedMaterialProjectionReadPort result.source.publicationStoreFiltered"),
    publicationStateFiltered: requireConst(source.publicationStateFiltered, true, "StudentAppPublishedMaterialProjectionReadPort result.source.publicationStateFiltered"),
    visibilityStateFiltered: requireConst(source.visibilityStateFiltered, true, "StudentAppPublishedMaterialProjectionReadPort result.source.visibilityStateFiltered"),
    studentAppChannelFiltered: requireConst(source.studentAppChannelFiltered, true, "StudentAppPublishedMaterialProjectionReadPort result.source.studentAppChannelFiltered"),
    ownStudentOnly: requireConst(source.ownStudentOnly, true, "StudentAppPublishedMaterialProjectionReadPort result.source.ownStudentOnly"),
  };
}

function assertProjectionExclusions(exclusions) {
  assertPlainObject(exclusions, "StudentAppPublishedMaterialProjectionReadPort result.exclusions");
  return {
    unpublishedArchiveItemsExcluded: requireConst(exclusions.unpublishedArchiveItemsExcluded, true, "StudentAppPublishedMaterialProjectionReadPort result.exclusions.unpublishedArchiveItemsExcluded"),
    draftOnlyArchiveItemsExcluded: requireConst(exclusions.draftOnlyArchiveItemsExcluded, true, "StudentAppPublishedMaterialProjectionReadPort result.exclusions.draftOnlyArchiveItemsExcluded"),
    crossStudentArchiveItemsExcluded: requireConst(exclusions.crossStudentArchiveItemsExcluded, true, "StudentAppPublishedMaterialProjectionReadPort result.exclusions.crossStudentArchiveItemsExcluded"),
    publicationMetadataRemovedFromResponse: requireConst(exclusions.publicationMetadataRemovedFromResponse, true, "StudentAppPublishedMaterialProjectionReadPort result.exclusions.publicationMetadataRemovedFromResponse"),
  };
}

function assertProjectionResponse(response, expectedArchiveItem) {
  assertPlainObject(response, "StudentAppPublishedMaterialProjectionReadPort result.response");
  const data = Array.isArray(response.data) ? response.data : [];
  if (data.length === 0) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_EMPTY_RESPONSE", "projection response data must not be empty");
  }
  let matched = null;
  for (const [index, itemValue] of data.entries()) {
    const item = assertArchiveItem(itemValue, `StudentAppPublishedMaterialProjectionReadPort result.response.data[${index}]`);
    rejectProductOnlyLeakedFields(itemValue, `StudentAppPublishedMaterialProjectionReadPort result.response.data[${index}]`);
    if (item.ownerType !== "STUDENT" || item.studentId !== expectedArchiveItem.studentId) {
      throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_SCOPE_LEAK", `response item ${item.id} is outside own-student scope`);
    }
    if (item.id === expectedArchiveItem.id) matched = item;
  }
  if (!matched) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_MISSING_PUBLISHED_MATERIAL", `${expectedArchiveItem.id} was not returned by the hardened projection`);
  }
  assertArchiveItemMatches(matched, expectedArchiveItem);
  return {
    data,
    pageInfo: {
      pageSize: Number(response.pageInfo?.pageSize ?? data.length),
      hasMore: Boolean(response.pageInfo?.hasMore ?? false),
      nextCursor: optionalBoundedString(response.pageInfo?.nextCursor, "StudentAppPublishedMaterialProjectionReadPort result.response.pageInfo.nextCursor", 420),
    },
    matchedArchiveItem: matched,
  };
}

function assertArchiveItem(item, label) {
  rejectLeakedFields(item, label);
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
    materialType: requireOneOf(item.materialType, `${label}.materialType`, ["HANDOUT", "HOMEWORK", "PAPER", "QUIZ", "LESSON_NOTE"]),
    title: requireSafeText(item.title, `${label}.title`, 1, 200),
    source: requireOneOf(item.source, `${label}.source`, ["SYSTEM_IMPORT", "TEACHER_UPLOAD", "STUDENT_UPLOAD"]),
    contentRef: requireContentRef(item.contentRef, `${label}.contentRef`),
    tags: uniqueStringArray(item.tags ?? [], `${label}.tags`, 0, 32),
    analysisIntents: uniqueStringArray(item.analysisIntents ?? [], `${label}.analysisIntents`, 1, 8),
    ocrStatus: requireOneOf(item.ocrStatus, `${label}.ocrStatus`, ["NOT_REQUIRED", "RESERVED"]),
    createdAt: requireIsoString(item.createdAt, `${label}.createdAt`),
  };
}

function assertArchiveItemMatches(actual, expected) {
  for (const field of ["id", "studentId", "materialType", "title", "contentRef"]) {
    requireConst(actual[field], expected[field], `projectionResponse.${field}`);
  }
}

function buildVerificationRecord(normalized, verified, verifiedAt, p99Ms) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING",
    recordId: `teaching_archive_material_publication_projection_hardening_${safeToken(normalized.idempotencyKey)}`,
    verifiedAt,
    runtimeId: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_RUNTIME_ID,
    commandPort: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_PORT,
    status: hardenedStatus,
    verificationInvocationId: normalized.verificationInvocationId,
    sourceStudentAppRead: {
      workloadType: sourceWorkload,
      runtimeId: sourceRuntimeId,
      commandPort: sourceCommandPort,
      recordId: normalized.sourceReadResult.recordId,
      publicationId: normalized.sourceReadResult.publishedArchiveMaterial.publicationId,
      archiveItemId: normalized.sourceReadResult.publishedArchiveMaterial.archiveItem.id,
    },
    principal: normalized.principal,
    studentProductReadSource: verified.source,
    projectionExclusions: verified.exclusions,
    hardenedPublishedArchiveMaterial: {
      publicationId: normalized.sourceReadResult.publishedArchiveMaterial.publicationId,
      archiveItem: verified.response.matchedArchiveItem,
    },
    responsePageInfo: verified.response.pageInfo,
    boundary: {
      sourceStudentAppReadRequired: true,
      studentAppPublishedMaterialReadVerified: true,
      publishedProjectionReadPortInvoked: true,
      goUseCaseReadAllowed: true,
      publicationStoreFiltered: true,
      publicationStateFiltered: true,
      visibilityStateFiltered: true,
      studentAppChannelFiltered: true,
      ownStudentOnly: true,
      unpublishedArchiveItemsExcluded: true,
      draftOnlyArchiveItemsExcluded: true,
      crossStudentArchiveItemsExcluded: true,
      productResponseMatchedPublishedMaterial: true,
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
      requiresFutureOcrRagOrSearchSlice: true,
    },
    evidenceRefs: uniqueEvidenceRefs([
      ...normalized.evidenceRefs,
      ...normalized.sourceReadResult.evidenceRefs,
      `evidence:archive-material-publication-projection-hardening-input-hash:${normalized.verificationInputHash}`,
      `evidence:runtime:${TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_RUNTIME_ID}`,
      `evidence:command-port:${TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_PORT}`,
      `evidence:source-student-app-read:${normalized.sourceReadResult.recordId}`,
      `evidence:go-list-published-for-student-app:${targetRepository}`,
      `evidence:publication-projection-table:${targetTable}`,
    ]),
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.verificationInputHash,
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms,
      totalErrors: 0,
      operations: 1,
      evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_PROBE",
    },
    nextAction: "Use this as hardened Student App publication projection evidence; OCR/RAG enrichment, AI grading, full search, and Swarm remain separate reviewed slices.",
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
  requireConst(record.status, hardenedStatus, "record.status");
  requireConst(record.sourceStudentAppRead.recordId, normalized.sourceReadResult.recordId, "record.sourceStudentAppRead.recordId");
  requireConst(record.hardenedPublishedArchiveMaterial.archiveItem.id, normalized.sourceReadResult.publishedArchiveMaterial.archiveItem.id, "record.hardenedPublishedArchiveMaterial.archiveItem.id");
}

function appendVerificationRecord(logPath, record) {
  const absolute = path.resolve(logPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.appendFileSync(absolute, `${JSON.stringify(record)}\n`);
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_INVALID_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_CONTRACT_MISMATCH", `${label} must be ${expected}`);
  }
  return expected;
}

function requireOneOf(actual, label, allowed) {
  if (!allowed.includes(actual)) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_INVALID_ENUM", `${label} must be one of ${allowed.join(", ")}`);
  }
  return actual;
}

function requireBoundedString(value, label, minLength, maxLength) {
  if (typeof value !== "string" || value.length < minLength || value.length > maxLength) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_INVALID_STRING", `${label} must be a string of length ${minLength}-${maxLength}`);
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
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_UNSAFE_TEXT", `${label} contains unsafe text`);
  }
  return text;
}

function requireContentRef(value, label) {
  const ref = requireSafeText(value, label, 12, 1000);
  if (!ref.startsWith("precommit://archive-material/") && !ref.startsWith("object://archive-material/") && !ref.startsWith("publication://archive-material/") && !ref.startsWith("local://archive/")) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_INVALID_CONTENT_REF", `${label} must be a controlled archive material ref`);
  }
  return ref;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 420);
  if (!token.startsWith(prefix) || !/^[A-Za-z0-9:_-]+$/u.test(token)) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_INVALID_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireIsoString(value, label) {
  const text = requireBoundedString(value, label, 20, 40);
  if (Number.isNaN(Date.parse(text))) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_INVALID_TIME", `${label} must be an ISO timestamp`);
  }
  return text;
}

function uniqueStringArray(value, label, minLength, maxLength) {
  if (!Array.isArray(value) || value.length < minLength || value.length > maxLength) {
    throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_INVALID_ARRAY", `${label} must contain ${minLength}-${maxLength} strings`);
  }
  const seen = new Set();
  return value.map((item, index) => {
    const normalized = requireBoundedString(String(item), `${label}[${index}]`, 1, 420);
    if (seen.has(normalized)) {
      throw verificationError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_DUPLICATE_STRING", `${label}[${index}] is duplicated`);
    }
    seen.add(normalized);
    return normalized;
  });
}

function rejectLeakedFields(value, context) {
  rejectFields(value, context, leakedFieldNames, "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_LEAKED_FIELD");
}

function rejectProductOnlyLeakedFields(value, context) {
  rejectFields(value, context, productOnlyLeakedFieldNames, "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_PRODUCT_METADATA_LEAK");
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
