import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_RUNTIME_ID =
  "teaching_archive_material_published_content_preview_precheck_runtime";
export const TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_PORT =
  "TeachingArchiveMaterialPublishedContentPreviewPrecheckPort.recordStudentAppPublishedMaterialContentPreviewPrecheck";

const inputSchemaVersion = "2026-06-07.teaching.archive-material-published-content-preview-precheck.v1";
const outputSchemaVersion = "2026-06-07.teaching.archive-material-published-content-preview-prechecked.v1";
const sourceWorkload = "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ";
const sourceRuntimeId = "teaching_archive_material_published_detail_metadata_read_runtime";
const sourceCommandPort =
  "TeachingArchiveMaterialPublishedDetailMetadataReadPort.verifyStudentAppPublishedMaterialDetailMetadataRead";
const sourceStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_VERIFIED";
const blockedStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_BLOCKED_UNTIL_SAFE_CONTENT_STORE";
const blockDecision = "BLOCK_UNTIL_SAFE_CONTENT_PREVIEW_STORE";
const futureUseCase = "PreviewStudentAppArchiveItemContent.Execute";
const futureRepository = "ArchiveMaterialContentPreviewRepository.GetOwnPublishedPreview";
const defaultPrecheckLogPath =
  "reports/student-command-log/teaching-archive-material-published-content-preview-precheck.jsonl";

const leakedFieldNames = [
  "contentRef", "rawContent", "content", "previewText", "contentPreview", "renderedHtml",
  "renderedMarkdown", "objectStorageKey", "storageKey", "fileBytes", "filePath", "downloadUrl",
  "ocrText", "ragChunks", "chunks", "embedding", "vector", "semanticMatches", "answerKey",
  "answerText", "expectedAnswer", "explanation", "rawModelOutput", "modelOutput",
  "publicationId", "publicationState", "visibilityState", "approvalRecordId", "approvalId",
  "publicationCandidateId", "workerId", "claimExpiresAt", "resultRef", "internalError",
  "databaseWriteResult", "directSql", "dbUrl",
];

export function recordTeachingArchiveMaterialPublishedContentPreviewPrecheck(input, options = {}) {
  const checkedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const precheckLogPath = options.precheckLogPath ?? defaultPrecheckLogPath;
  const existing = findExistingRecordByIdempotencyKey(precheckLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const record = buildPrecheckRecord(normalized, checkedAt, options.probeP99Ms ?? 6);
  appendPrecheckRecord(precheckLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatTeachingArchiveMaterialPublishedContentPreviewPrecheck(result) {
  return [
    `Teaching archive material published content preview precheck: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Archive item: ${result.selectedArchiveItem.archiveItemId}`,
    `Decision: ${result.precheckDecision.contentPreviewAccessDecision}`,
    `Raw content read allowed: ${result.precheckDecision.rawContentReadAllowed}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const precheckInvocationId = requireToken(
    input.precheckInvocationId,
    "input.precheckInvocationId",
    "archive_material_published_content_preview_precheck_",
  );
  const principal = assertStudentPrincipal(input.principal);
  const sourceReport = assertSourceDetailReport(input.publishedDetailMetadataReadReport);
  const sourceDetail = assertSourceDetailResult(sourceReport);
  requireConst(principal.studentAccess.ownStudentId, sourceDetail.principal.studentAccess.ownStudentId, "input.principal.studentAccess.ownStudentId");
  const archiveItemId = requireArchiveItemID(input.archiveItemId, "input.archiveItemId");
  requireConst(archiveItemId, sourceDetail.responseMetadata.id, "input.archiveItemId");
  const selectedArchiveItem = assertSafeArchiveMetadata(input.selectedArchiveItem, "input.selectedArchiveItem");
  requireConst(selectedArchiveItem.id, archiveItemId, "input.selectedArchiveItem.id");
  requireConst(selectedArchiveItem.studentId, principal.studentAccess.ownStudentId, "input.selectedArchiveItem.studentId");
  requireConst(JSON.stringify(selectedArchiveItem), JSON.stringify(sourceDetail.responseMetadata), "input.selectedArchiveItem");
  const policy = assertContentPreviewPrecheckPolicy(input.contentPreviewPrecheckPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 1200);
  if (!evidenceRefs.some((ref) => ref.includes("published-detail-metadata-read"))) {
    throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_MISSING_DETAIL_EVIDENCE", "0316 detail metadata read evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("published-content-preview-precheck"))) {
    throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_MISSING_PRECHECK_EVIDENCE", "0317 content preview precheck evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const inputHash = hashInput({
    precheckInvocationId,
    principalId: principal.principalId,
    ownStudentId: principal.studentAccess.ownStudentId,
    sourceDetailRecordId: sourceDetail.recordId,
    archiveItemId,
    selectedArchiveItem,
    policy,
  });
  return {
    precheckInvocationId,
    principal,
    sourceReport,
    sourceDetail,
    archiveItemId,
    selectedArchiveItem,
    policy,
    evidenceRefs,
    idempotencyKey,
    inputHash,
  };
}

function assertStudentPrincipal(principal) {
  rejectLeakedFields(principal, "input.principal");
  assertPlainObject(principal, "input.principal");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  if (!scopes.includes("STUDENT_OWN_READ")) {
    throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_MISSING_SCOPE", "STUDENT_OWN_READ is required");
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

function assertSourceDetailReport(report) {
  rejectLeakedFields(report, "input.publishedDetailMetadataReadReport");
  assertPlainObject(report, "input.publishedDetailMetadataReadReport");
  requireConst(report.readiness, "READY", "input.publishedDetailMetadataReadReport.readiness");
  requireConst(report.workloadType, sourceWorkload, "input.publishedDetailMetadataReadReport.workloadType");
  requireConst(report.runtime?.runtimeId, sourceRuntimeId, "input.publishedDetailMetadataReadReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, sourceCommandPort, "input.publishedDetailMetadataReadReport.runtime.commandPort");
  requireConst(report.runtime?.status, sourceStatus, "input.publishedDetailMetadataReadReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.publishedDetailMetadataReadReport.runtimeSlo.totalErrors");
  for (const field of [
    "sourceSearchFoundationRequired", "publishedProjectionDetailPortInvoked", "goUseCaseReadAllowed",
    "archiveItemIdNormalized", "publicationStoreFiltered", "ownStudentOnly", "safeMetadataOnly",
    "contentRefExcluded", "publicationMetadataExcluded", "answerKeyAndModelOutputExcluded",
    "futureContentPreviewSliceRequired",
  ]) {
    requireConst(report.safetyInvariants?.[field], true, `input.publishedDetailMetadataReadReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "rawContentReadAllowed",
    "fullTextContentReadAllowed", "ocrOrRagJobWriteStarted", "aiGradingWriteStarted",
    "modelInferenceStarted", "publicationWriteStarted", "remoteDeviceControlAllowed",
    "localToolMutationAllowed", "swarmAllowed",
  ]) {
    requireConst(report.safetyInvariants?.[field], false, `input.publishedDetailMetadataReadReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertSourceDetailResult(report) {
  const result = report.runtimeProbes?.teachingArchiveMaterialPublishedDetailMetadataRead?.result;
  rejectLeakedFields(result, "input.publishedDetailMetadataReadReport.runtimeProbes.result");
  assertPlainObject(result, "input.publishedDetailMetadataReadReport.runtimeProbes.result");
  requireConst(result.runtimeId, sourceRuntimeId, "source.runtimeId");
  requireConst(result.commandPort, sourceCommandPort, "source.commandPort");
  requireConst(result.status, sourceStatus, "source.status");
  requireConst(result.studentProductDetailSource?.repository, "ArchiveRepository.GetPublishedForStudentApp", "source.studentProductDetailSource.repository");
  requireConst(result.studentProductDetailSource?.projectionTable, "teaching_archive_publications", "source.studentProductDetailSource.projectionTable");
  requireConst(result.boundary?.contentRefExcluded, true, "source.boundary.contentRefExcluded");
  requireConst(result.boundary?.rawContentReadAllowed, false, "source.boundary.rawContentReadAllowed");
  const responseMetadata = assertSafeArchiveMetadata(result.responseMetadata, "source.responseMetadata");
  return {
    recordId: requireBoundedString(result.recordId, "source.recordId", 1, 520),
    runtimeId: sourceRuntimeId,
    status: sourceStatus,
    principal: assertSourcePrincipal(result.principal),
    responseMetadata,
    evidenceRefs: uniqueStringArray(result.evidenceRefs ?? [], "source.evidenceRefs", 1, 1800),
  };
}

function assertSourcePrincipal(principal) {
  assertPlainObject(principal, "source.principal");
  return {
    principalId: requireBoundedString(principal.principalId, "source.principal.principalId", 1, 128),
    studentAccess: {
      ownStudentId: requireBoundedString(principal.studentAccess?.ownStudentId, "source.principal.studentAccess.ownStudentId", 1, 128),
    },
  };
}

function assertContentPreviewPrecheckPolicy(policy) {
  assertPlainObject(policy, "input.contentPreviewPrecheckPolicy");
  for (const field of [
    "sourceDetailMetadataReadRequired", "contentPreviewPrecheckOnly",
    "safeContentPreviewStoreRequiredBeforeRead", "ownStudentOnlyRequired",
    "safeRendererRequiredBeforeRead", "previewArtifactBoundaryRequired",
  ]) {
    requireConst(policy[field], true, `input.contentPreviewPrecheckPolicy.${field}`);
  }
  requireConst(policy.authoritativeContentPreviewStoreAvailable, false, "input.contentPreviewPrecheckPolicy.authoritativeContentPreviewStoreAvailable");
  requireConst(policy.futureContentPreviewUseCase, futureUseCase, "input.contentPreviewPrecheckPolicy.futureContentPreviewUseCase");
  requireConst(policy.futureContentPreviewRepository, futureRepository, "input.contentPreviewPrecheckPolicy.futureContentPreviewRepository");
  for (const field of [
    "rawContentReadAllowed", "contentRefDisclosureAllowed", "objectStorageReadAllowed",
    "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "ocrOrRagJobWriteAllowed",
    "semanticRetrievalAllowed", "aiGradingWriteAllowed", "modelInferenceAllowed",
    "publicationWriteAllowed", "remoteDeviceControlAllowed", "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.contentPreviewPrecheckPolicy.${field}`);
  }
  return { ...policy };
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

function buildPrecheckRecord(normalized, checkedAt, p99Ms) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK",
    recordId: `teaching_archive_material_published_content_preview_precheck_${safeToken(normalized.idempotencyKey)}`,
    checkedAt,
    runtimeId: TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_RUNTIME_ID,
    commandPort: TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_PORT,
    status: blockedStatus,
    precheckInvocationId: normalized.precheckInvocationId,
    sourcePublishedDetailMetadataRead: {
      workloadType: sourceWorkload,
      runtimeId: sourceRuntimeId,
      recordId: normalized.sourceDetail.recordId,
      archiveItemId: normalized.sourceDetail.responseMetadata.id,
    },
    principal: normalized.principal,
    selectedArchiveItem: {
      archiveItemId: normalized.archiveItemId,
      materialType: normalized.selectedArchiveItem.materialType,
      title: normalized.selectedArchiveItem.title,
      ocrStatus: normalized.selectedArchiveItem.ocrStatus,
    },
    precheckDecision: {
      contentPreviewAccessDecision: blockDecision,
      contentPreviewStoreAvailable: false,
      contentPreviewReadAllowed: false,
      rawContentReadAllowed: false,
      contentRefDisclosureAllowed: false,
      requiresFutureSafeContentPreviewStore: true,
      requiresFutureRenderer: true,
      reason: "No reviewed safe content preview store and renderer exist in the current baseline.",
    },
    boundary: {
      sourceDetailMetadataReadRequired: true,
      detailMetadataEvidenceVerified: true,
      contentPreviewPrecheckOnly: true,
      safeContentPreviewStoreAvailable: false,
      safeContentPreviewStoreRequiredBeforeRead: true,
      safeRendererRequiredBeforeRead: true,
      ownStudentOnly: true,
      safeMetadataOnly: true,
      contentRefExcluded: true,
      rawContentReadStarted: false,
      contentPreviewReadStarted: false,
      contentRefDisclosed: false,
      objectStorageReadStarted: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      semanticRetrievalStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      publicationWriteStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureContentPreviewStoreSlice: true,
    },
    evidenceRefs: uniqueEvidenceRefs([
      ...normalized.evidenceRefs,
      ...normalized.sourceDetail.evidenceRefs,
      `evidence:archive-material-published-content-preview-precheck-input-hash:${normalized.inputHash}`,
      `evidence:runtime:${TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_RUNTIME_ID}`,
      `evidence:command-port:${TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_PORT}`,
      `evidence:source-runtime:${sourceRuntimeId}`,
      `evidence:future-content-preview-usecase:${futureUseCase}`,
      `evidence:future-content-preview-repository:${futureRepository}`,
    ]),
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms,
      totalErrors: 0,
      operations: 1,
      evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_PROBE",
    },
    nextAction: "Add a reviewed safe content preview store, renderer, and own-student read use case before any published archive material content can be previewed.",
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
    if (parsed.recordType === "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK" &&
      parsed.idempotencyKey === idempotencyKey) {
      return parsed;
    }
  }
  return null;
}

function assertReplayMatches(record, normalized) {
  if (record.inputHash !== normalized.inputHash) {
    throw precheckError(
      "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_IDEMPOTENCY_CONFLICT",
      "idempotency key already exists for a different published material content preview precheck",
    );
  }
  requireConst(record.status, blockedStatus, "record.status");
  requireConst(record.sourcePublishedDetailMetadataRead.recordId, normalized.sourceDetail.recordId, "record.sourcePublishedDetailMetadataRead.recordId");
  requireConst(record.selectedArchiveItem.archiveItemId, normalized.archiveItemId, "record.selectedArchiveItem.archiveItemId");
}

function appendPrecheckRecord(logPath, record) {
  const absolute = path.resolve(logPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.appendFileSync(absolute, `${JSON.stringify(record)}\n`);
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_INVALID_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_CONTRACT_MISMATCH", `${label} must be ${expected}`);
  }
  return expected;
}

function requireOneOf(actual, label, allowed) {
  if (!allowed.includes(actual)) {
    throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_INVALID_ENUM", `${label} must be one of ${allowed.join(", ")}`);
  }
  return actual;
}

function requireBoundedString(value, label, minLength, maxLength) {
  if (typeof value !== "string" || value.length < minLength || value.length > maxLength) {
    throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_INVALID_STRING", `${label} must be a string of length ${minLength}-${maxLength}`);
  }
  return value;
}

function requireSafeText(value, label, minLength, maxLength) {
  const text = requireBoundedString(value, label, minLength, maxLength);
  if (/[\x00-\x1F\x7F<>]|\bscript\b|javascript:|data:/iu.test(text)) {
    throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_UNSAFE_TEXT", `${label} contains unsafe text`);
  }
  return text;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 420);
  if (!token.startsWith(prefix) || !/^[A-Za-z0-9:_-]+$/u.test(token)) {
    throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_INVALID_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireArchiveItemID(value, label) {
  const id = requireBoundedString(String(value ?? "").trim(), label, "tarch_".length + 1, 1000);
  if (!/^tarch_[A-Za-z0-9_-]+$/u.test(id)) {
    throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_INVALID_ARCHIVE_ITEM_ID", `${label} must be a tarch_ id token`);
  }
  return id;
}

function requireIsoString(value, label) {
  const text = requireBoundedString(value, label, 20, 40);
  if (Number.isNaN(Date.parse(text))) {
    throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_INVALID_TIME", `${label} must be an ISO timestamp`);
  }
  return text;
}

function uniqueStringArray(value, label, minLength, maxLength) {
  if (!Array.isArray(value) || value.length < minLength || value.length > maxLength) {
    throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_INVALID_ARRAY", `${label} must contain ${minLength}-${maxLength} strings`);
  }
  const seen = new Set();
  return value.map((item, index) => {
    const normalized = requireBoundedString(String(item), `${label}[${index}]`, 1, 420);
    if (seen.has(normalized)) {
      throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_DUPLICATE_STRING", `${label}[${index}] is duplicated`);
    }
    seen.add(normalized);
    return normalized;
  });
}

function rejectLeakedFields(value, context) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectLeakedFields(item, `${context}[${index}]`));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (leakedFieldNames.includes(key)) {
      throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_LEAKED_FIELD", `${context}.${key} is not allowed`);
    }
    rejectLeakedFields(nested, `${context}.${key}`);
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

function precheckError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
