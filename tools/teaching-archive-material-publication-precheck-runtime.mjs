import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_RUNTIME_ID =
  "teaching_archive_material_publication_precheck_runtime";
export const TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_PORT =
  "TeachingArchiveMaterialPublicationPrecheckPort.recordTeachingArchiveMaterialPublicationPrecheck";

const inputSchemaVersion = "2026-06-07.teaching.archive-material-publication-precheck.v1";
const outputSchemaVersion = "2026-06-07.teaching.archive-material-publication-prechecked.v1";
const sourceWorkload = "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ";
const sourceRuntimeId = "teaching_archive_material_draft_student_product_read_runtime";
const sourceStatus = "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_VERIFIED";
const precheckStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_READY";
const precheckDecision = "READY_FOR_PUBLICATION_APPROVAL";
const defaultCommandLogPath = "reports/teaching-command-log/teaching-archive-material-publication-precheck.jsonl";
const leakedFieldNames = [
  "rawModelOutput", "modelOutput", "directSql", "dbUrl", "internalError", "ocrJobId",
  "ragChunkIds", "aiGradingRequestId", "workerId", "claimExpiresAt", "publishedAt",
  "publicationStatus", "rawContent", "answerKey", "scoreSummary",
];

export function recordTeachingArchiveMaterialPublicationPrecheck(input, options = {}) {
  const precheckedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const commandLogPath = options.commandLogPath ?? defaultCommandLogPath;
  const existing = findExistingRecordByIdempotencyKey(commandLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }
  const record = buildRecord(normalized, precheckedAt, options.probeP99Ms ?? 6);
  appendRecord(commandLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatTeachingArchiveMaterialPublicationPrecheck(result) {
  return [
    `Teaching archive material publication precheck: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Archive item: ${result.publicationCandidate.archiveItemId}`,
    `Decision: ${result.precheckDecision.decision}`,
    `Published: ${result.boundary.studentVisiblePublished}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const precheckInvocationId = requireToken(input.precheckInvocationId, "input.precheckInvocationId", "archive_material_publication_precheck_");
  const principal = assertPrincipal(input.principal);
  const productReadReport = assertProductReadReport(input.productReadReport);
  const sourceProductRead = assertProductReadResult(productReadReport);
  const publicationPrecheckPolicy = assertPublicationPrecheckPolicy(input.publicationPrecheckPolicy);
  const publicationCandidate = assertPublicationCandidate(input.publicationCandidate, sourceProductRead.studentProductArchiveItem);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 720);
  if (!evidenceRefs.some((ref) => ref.includes("student-product-read"))) {
    throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_MISSING_PRODUCT_READ_EVIDENCE", "student product read evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("publication-precheck"))) {
    throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_MISSING_PRECHECK_EVIDENCE", "publication precheck evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const inputHash = hashInput({
    precheckInvocationId,
    principalId: principal.principalId,
    sourceProductReadRecordId: sourceProductRead.recordId,
    publicationCandidate,
    publicationPrecheckPolicy,
  });
  return { precheckInvocationId, principal, productReadReport, sourceProductRead, publicationPrecheckPolicy, publicationCandidate, evidenceRefs, idempotencyKey, inputHash };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  requireConst(principal.subjectType, "USER", "input.principal.subjectType");
  const role = requireOneOf(principal.role, "input.principal.role", ["TEACHER", "ADMIN"]);
  const entryPoint = requireOneOf(principal.entryPoint, "input.principal.entryPoint", ["DESKTOP_TEACHING", "ADMIN_CONSOLE"]);
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  const teacherAllowed = role === "TEACHER" && entryPoint === "DESKTOP_TEACHING" &&
    scopes.includes("TEACHING_ARCHIVE_READ") && scopes.includes("TEACHING_ARCHIVE_REVIEW");
  const adminAllowed = role === "ADMIN" && scopes.includes("ADMIN_SYSTEM");
  if (!teacherAllowed && !adminAllowed) {
    throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_FORBIDDEN_PRINCIPAL", "publication precheck requires a human teaching teacher or admin");
  }
  return {
    principalId: requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128),
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 160),
    subjectType: "USER",
    role,
    entryPoint,
    scopes,
  };
}

function assertProductReadReport(report) {
  assertPlainObject(report, "input.productReadReport");
  requireConst(report.readiness, "READY", "input.productReadReport.readiness");
  requireConst(report.workloadType, sourceWorkload, "input.productReadReport.workloadType");
  requireConst(report.runtime?.runtimeId, sourceRuntimeId, "input.productReadReport.runtime.runtimeId");
  requireConst(report.runtime?.status, sourceStatus, "input.productReadReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.productReadReport.runtimeSlo.totalErrors");
  for (const field of [
    "storageRowVerificationRequired", "physicalDatabaseRowVerified", "studentAppArchiveItemsEndpointVerified",
    "ownStudentProductReadVerified", "productResponseMatchedPhysicalRow", "crossStudentLeakPrevented",
    "teachingMaterialLeakPrevented", "requiresFuturePublicationOrRagSlice",
  ]) requireConst(report.safetyInvariants?.[field], true, `input.productReadReport.safetyInvariants.${field}`);
  for (const field of [
    "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "ocrOrRagJobWriteStarted",
    "aiGradingWriteStarted", "modelInferenceStarted", "publicationAllowed",
    "remoteDeviceControlAllowed", "localToolMutationAllowed", "swarmAllowed",
  ]) requireConst(report.safetyInvariants?.[field], false, `input.productReadReport.safetyInvariants.${field}`);
  return report;
}

function assertProductReadResult(report) {
  const result = report.runtimeProbes?.teachingArchiveMaterialDraftStudentProductRead?.result;
  rejectLeakedFields(result, "input.productReadReport.runtimeProbes.result");
  assertPlainObject(result, "input.productReadReport.runtimeProbes.result");
  requireConst(result.schemaVersion, "2026-06-07.teaching.archive-material-draft-student-product-read-verified.v1", "source.schemaVersion");
  requireConst(result.runtimeId, sourceRuntimeId, "source.runtimeId");
  requireConst(result.commandPort, "TeachingArchiveMaterialDraftStudentProductReadPort.verifyStudentAppArchiveItemsRead", "source.commandPort");
  requireConst(result.status, sourceStatus, "source.status");
  requireConst(result.boundary?.ownStudentProductReadVerified, true, "source.boundary.ownStudentProductReadVerified");
  requireConst(result.boundary?.publicationAllowed, false, "source.boundary.publicationAllowed");
  requireConst(result.boundary?.modelInferenceStarted, false, "source.boundary.modelInferenceStarted");
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "source.recordId", 1, 520),
    studentProductArchiveItem: assertArchiveItem(result.studentProductArchiveItem, "source.studentProductArchiveItem"),
  };
}

function assertPublicationPrecheckPolicy(policy) {
  assertPlainObject(policy, "input.publicationPrecheckPolicy");
  for (const field of [
    "precheckOnly", "sourceStudentProductReadRequired", "physicalRowVerificationRequired",
    "humanPublicationPrecheckRequired", "noSensitiveLeakageRequired", "futurePublicationApprovalRequired",
    "idempotentPublicationPrecheckRequired",
  ]) requireConst(policy[field], true, `input.publicationPrecheckPolicy.${field}`);
  for (const field of [
    "directPublicationAllowed", "studentVisibleDeliveryAllowed", "mainDatabaseWriteAllowed",
    "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "ocrOrRagJobWriteAllowed",
    "aiGradingWriteAllowed", "modelInferenceAllowed", "remoteDeviceControlAllowed",
    "localToolMutationAllowed", "swarmAllowed",
  ]) requireConst(policy[field], false, `input.publicationPrecheckPolicy.${field}`);
  return { ...policy };
}

function assertPublicationCandidate(candidate, item) {
  assertPlainObject(candidate, "input.publicationCandidate");
  requireConst(candidate.archiveItemId, item.id, "input.publicationCandidate.archiveItemId");
  requireConst(candidate.ownerType, item.ownerType, "input.publicationCandidate.ownerType");
  requireConst(candidate.studentId, item.studentId, "input.publicationCandidate.studentId");
  requireConst(candidate.materialType, item.materialType, "input.publicationCandidate.materialType");
  requireConst(candidate.title, item.title, "input.publicationCandidate.title");
  requireConst(candidate.contentRef, item.contentRef, "input.publicationCandidate.contentRef");
  requireConst(candidate.publicationTarget, "TEACHER_PUBLICATION_APPROVAL_QUEUE", "input.publicationCandidate.publicationTarget");
  requireConst(candidate.studentVisibleRequested, false, "input.publicationCandidate.studentVisibleRequested");
  requireConst(candidate.ocrEnrichmentRequested, false, "input.publicationCandidate.ocrEnrichmentRequested");
  requireConst(candidate.ragEnrichmentRequested, false, "input.publicationCandidate.ragEnrichmentRequested");
  requireConst(candidate.aiGradingRequested, false, "input.publicationCandidate.aiGradingRequested");
  return {
    publicationCandidateId: requireToken(candidate.publicationCandidateId, "input.publicationCandidate.publicationCandidateId", "archive_material_pub_precheck_"),
    archiveItemId: item.id,
    ownerType: item.ownerType,
    studentId: item.studentId,
    materialType: item.materialType,
    title: item.title,
    contentRef: item.contentRef,
    publicationTarget: "TEACHER_PUBLICATION_APPROVAL_QUEUE",
    intendedAudience: requireExactSet(candidate.intendedAudience, "input.publicationCandidate.intendedAudience", ["TEACHER_REVIEW"]),
    studentVisibleRequested: false,
    ocrEnrichmentRequested: false,
    ragEnrichmentRequested: false,
    aiGradingRequested: false,
    releaseChannel: requireConst(candidate.releaseChannel, "NONE_PRECHECK_ONLY", "input.publicationCandidate.releaseChannel"),
    reviewNotes: requireSafeText(candidate.reviewNotes, "input.publicationCandidate.reviewNotes", 4, 600),
    riskTags: requireExactSet(candidate.riskTags, "input.publicationCandidate.riskTags", ["HUMAN_APPROVAL_REQUIRED"]),
  };
}

function buildRecord(normalized, precheckedAt, p99Ms) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK",
    recordId: `teaching_archive_material_publication_precheck_${safeToken(normalized.idempotencyKey)}`,
    precheckedAt,
    runtimeId: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_RUNTIME_ID,
    commandPort: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_PORT,
    status: precheckStatus,
    precheckInvocationId: normalized.precheckInvocationId,
    principal: normalized.principal,
    sourceStudentProductRead: {
      runtimeId: sourceRuntimeId,
      recordId: normalized.sourceProductRead.recordId,
      archiveItemId: normalized.sourceProductRead.studentProductArchiveItem.id,
      endpoint: normalized.sourceProductRead.studentProductReadSource?.endpoint ?? "GET /v1/student-app/archive-items",
    },
    publicationCandidate: normalized.publicationCandidate,
    precheckDecision: {
      decision: precheckDecision,
      publicationApprovalRequired: true,
      studentVisiblePublicationAllowed: false,
      ocrOrRagEnrichmentAllowed: false,
      modelInferenceAllowed: false,
    },
    boundary: {
      sourceStudentProductReadRequired: true,
      physicalDatabaseRowVerified: true,
      humanPublicationPrecheckRecorded: true,
      publicationApprovalRequired: true,
      publicationCommitted: false,
      studentVisiblePublished: false,
      mainDatabaseWriteStarted: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      ...normalized.evidenceRefs,
      `evidence:archive-material-publication-precheck-input-hash:${normalized.inputHash}`,
      `evidence:runtime:${TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_RUNTIME_ID}`,
      `evidence:command-port:${TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_PORT}`,
      `evidence:source-student-product-read:${normalized.sourceProductRead.recordId}`,
      `evidence:publication-candidate:${normalized.publicationCandidate.publicationCandidateId}`,
    ],
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
    runtimeSlo: { targetP99Ms: 50, p99Ms, totalErrors: 0, operations: 1, evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_PROBE" },
    nextAction: "Use this as publication approval input; actual publication, OCR/RAG enrichment, AI grading, and model execution remain separate reviewed slices.",
  };
}

function buildResult(record, extra) { return { ...record, ...extra }; }
function appendRecord(filePath, record) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`); }
function findExistingRecordByIdempotencyKey(filePath, key) {
  if (!fs.existsSync(filePath)) return null;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    if (record.idempotencyKey === key) return record;
  }
  return null;
}
function assertReplayMatches(record, normalized) {
  requireConst(record.inputHash, normalized.inputHash, "record.inputHash");
  requireConst(record.status, precheckStatus, "record.status");
}

function assertArchiveItem(item, label) {
  assertPlainObject(item, label);
  return {
    id: requireToken(item.id, `${label}.id`, "tarch_"),
    ownerType: requireConst(item.ownerType, "STUDENT", `${label}.ownerType`),
    studentId: requireBoundedString(item.studentId, `${label}.studentId`, 1, 128),
    materialType: requireOneOf(item.materialType, `${label}.materialType`, ["HANDOUT", "HOMEWORK", "PAPER", "QUIZ"]),
    title: requireSafeText(item.title, `${label}.title`, 4, 200),
    contentRef: requireSafeText(item.contentRef, `${label}.contentRef`, 8, 420),
  };
}
function requireExactSet(value, label, expected) {
  const actual = uniqueStringArray(value, label, expected.length, expected.length).sort();
  const wanted = [...expected].sort();
  requireConst(JSON.stringify(actual), JSON.stringify(wanted), label);
  return actual;
}
function rejectLeakedFields(value, label) {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (leakedFieldNames.includes(key)) throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_LEAKED_FIELD", `${label}.${key} is not allowed`);
    rejectLeakedFields(nested, `${label}.${key}`);
  }
}
function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_INVALID_OBJECT", `${label} must be an object`);
  return value;
}
function requireConst(actual, expected, label) {
  if (actual !== expected) throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_CONTRACT_MISMATCH", `${label} must be ${expected}`);
  return expected;
}
function requireOneOf(value, label, allowed) {
  if (!allowed.includes(value)) throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_INVALID_ENUM", `${label} must be one of ${allowed.join(",")}`);
  return value;
}
function requireToken(value, label, prefix) {
  const text = requireBoundedString(value, label, prefix.length + 1, 520);
  if (!text.startsWith(prefix)) throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_INVALID_TOKEN", `${label} must start with ${prefix}`);
  return text;
}
function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string" || value.length < min || value.length > max) throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_INVALID_STRING", `${label} must be ${min}-${max} chars`);
  return value;
}
function requireSafeText(value, label, min, max) {
  const text = requireBoundedString(value, label, min, max);
  if (/[<>]/u.test(text) || /javascript:/iu.test(text)) throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_UNSAFE_TEXT", `${label} contains unsafe text`);
  return text;
}
function uniqueStringArray(value, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_INVALID_ARRAY", `${label} must contain ${min}-${max} strings`);
  const out = [];
  for (const [index, item] of value.entries()) out.push(requireBoundedString(item, `${label}[${index}]`, 1, 720));
  if (new Set(out).size !== out.length) throw precheckError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_DUPLICATE_ARRAY", `${label} must be unique`);
  return out;
}
function hashInput(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function safeToken(value) { return String(value).replace(/[^a-zA-Z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 180); }
function precheckError(code, message) { const error = new Error(message); error.code = code; return error; }
