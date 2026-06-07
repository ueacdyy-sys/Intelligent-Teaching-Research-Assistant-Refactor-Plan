import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_RUNTIME_ID =
  "teaching_archive_material_publication_delivery_runtime";
export const TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_PORT =
  "TeachingArchiveMaterialPublicationDeliveryPort.recordTeachingArchiveMaterialPublicationDeliveryEnvelope";

const inputSchemaVersion = "2026-06-07.teaching.archive-material-publication-delivery.v1";
const outputSchemaVersion = "2026-06-07.teaching.archive-material-publication-delivery-envelope.v1";
const sourceWorkload = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL";
const sourceRuntimeId = "teaching_archive_material_publication_approval_runtime";
const sourceStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVED_NOT_PUBLISHED";
const deliveryStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_ENVELOPE_READY_NOT_PERSISTED";
const deliveryState = "READY_FOR_STUDENT_APP_MATERIAL_RENDER_NOT_ARCHIVED";
const defaultCommandLogPath = "reports/teaching-command-log/teaching-archive-material-publication-delivery.jsonl";
const leakedFieldNames = [
  "rawModelOutput", "modelOutput", "directSql", "dbUrl", "internalError", "ocrJobId",
  "ragChunkIds", "aiGradingRequestId", "workerId", "claimExpiresAt", "publishedAt",
  "publicationCommittedAt", "databaseWriteResult", "studentArchivePersistenceResult",
  "rawContent", "answerKey", "scoreSummary",
];

export function recordTeachingArchiveMaterialPublicationDeliveryEnvelope(input, options = {}) {
  const deliveredAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const commandLogPath = options.commandLogPath ?? defaultCommandLogPath;
  const existing = findExistingRecordByIdempotencyKey(commandLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }
  const record = buildRecord(normalized, deliveredAt, options.probeP99Ms ?? 6);
  appendRecord(commandLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatTeachingArchiveMaterialPublicationDeliveryEnvelope(result) {
  return [
    `Teaching archive material publication delivery envelope: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Envelope: ${result.studentMaterialDeliveryEnvelope.envelopeId}`,
    `Archive item: ${result.studentMaterialDeliveryEnvelope.archiveItemId}`,
    `Persisted: ${result.boundary.durablePublicationPersistenceStarted}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const deliveryInvocationId = requireToken(input.deliveryInvocationId, "input.deliveryInvocationId", "archive_material_publication_delivery_");
  const principal = assertDeliveryPrincipal(input.principal);
  const approvalReport = assertApprovalReport(input.publicationApprovalReport);
  const approvalRecord = assertApprovalRecord(approvalReport);
  const deliveryRequest = assertDeliveryRequest(input.publicationDeliveryRequest, approvalRecord);
  const deliveryPolicy = assertDeliveryPolicy(input.publicationDeliveryPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 720);
  if (!evidenceRefs.some((ref) => ref.includes("publication-approval"))) {
    throw deliveryError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_MISSING_APPROVAL_EVIDENCE", "publication approval evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("publication-delivery"))) {
    throw deliveryError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_MISSING_DELIVERY_EVIDENCE", "publication delivery evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const inputHash = hashInput({
    deliveryInvocationId,
    principalId: principal.principalId,
    approvalRecordId: approvalRecord.recordId,
    approvalId: approvalRecord.publicationApproval.approvalId,
    deliveryRequest,
    deliveryPolicy,
  });
  return { deliveryInvocationId, principal, approvalReport, approvalRecord, deliveryRequest, deliveryPolicy, evidenceRefs, idempotencyKey, inputHash };
}

function assertDeliveryPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  requireConst(principal.subjectType, "SERVICE", "input.principal.subjectType");
  requireConst(principal.role, "SERVICE", "input.principal.role");
  requireConst(principal.entryPoint, "STUDENT_DELIVERY_RUNTIME", "input.principal.entryPoint");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  for (const scope of ["TEACHING_READ", "STUDENT_DELIVERY_ENVELOPE", "STUDENT_APP_DELIVERY"]) {
    if (!scopes.includes(scope)) throw deliveryError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_MISSING_SCOPE", `${scope} is required`);
  }
  return {
    principalId: requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128),
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 160),
    subjectType: "SERVICE",
    role: "SERVICE",
    entryPoint: "STUDENT_DELIVERY_RUNTIME",
    scopes,
  };
}

function assertApprovalReport(report) {
  rejectLeakedFields(report, "input.publicationApprovalReport");
  assertPlainObject(report, "input.publicationApprovalReport");
  requireConst(report.readiness, "READY", "input.publicationApprovalReport.readiness");
  requireConst(report.workloadType, sourceWorkload, "input.publicationApprovalReport.workloadType");
  requireConst(report.runtime?.runtimeId, sourceRuntimeId, "input.publicationApprovalReport.runtime.runtimeId");
  requireConst(report.runtime?.status, sourceStatus, "input.publicationApprovalReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.publicationApprovalReport.runtimeSlo.totalErrors");
  for (const field of [
    "sourcePublicationPrecheckRequired", "physicalDatabaseRowVerified",
    "humanPublicationPrecheckRecorded", "publicationApproved", "approvedForPublicationDelivery",
  ]) requireConst(report.safetyInvariants?.[field], true, `input.publicationApprovalReport.safetyInvariants.${field}`);
  for (const field of [
    "publicationCommitted", "studentVisiblePublished", "deliveryEnvelopeCreated",
    "mainDatabaseWriteStarted", "directDatabaseAccessAllowed", "executeHttpRequestAllowed",
    "ocrOrRagJobWriteStarted", "aiGradingWriteStarted", "modelInferenceStarted",
    "remoteDeviceControlAllowed", "localToolMutationAllowed", "swarmAllowed",
  ]) requireConst(report.safetyInvariants?.[field], false, `input.publicationApprovalReport.safetyInvariants.${field}`);
  return report;
}

function assertApprovalRecord(report) {
  const result = report.runtimeProbes?.teachingArchiveMaterialPublicationApproval?.result;
  rejectLeakedFields(result, "input.publicationApprovalReport.runtimeProbes.result");
  assertPlainObject(result, "input.publicationApprovalReport.runtimeProbes.result");
  requireConst(result.schemaVersion, "2026-06-07.teaching.archive-material-publication-approved.v1", "source.schemaVersion");
  requireConst(result.runtimeId, sourceRuntimeId, "source.runtimeId");
  requireConst(result.commandPort, "TeachingArchiveMaterialPublicationApprovalPort.recordTeachingArchiveMaterialPublicationApproval", "source.commandPort");
  requireConst(result.status, sourceStatus, "source.status");
  requireConst(result.approvalDecision?.decision, "APPROVED_FOR_PUBLICATION_DELIVERY", "source.approvalDecision.decision");
  requireConst(result.boundary?.publicationApproved, true, "source.boundary.publicationApproved");
  requireConst(result.boundary?.approvedForPublicationDelivery, true, "source.boundary.approvedForPublicationDelivery");
  requireConst(result.boundary?.publicationCommitted, false, "source.boundary.publicationCommitted");
  requireConst(result.boundary?.studentVisiblePublished, false, "source.boundary.studentVisiblePublished");
  requireConst(result.boundary?.deliveryEnvelopeCreated, false, "source.boundary.deliveryEnvelopeCreated");
  const candidate = assertPublicationCandidate(result.approvedPublicationCandidate, "source.approvedPublicationCandidate");
  const approval = assertPublicationApproval(result.publicationApproval, candidate);
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "source.recordId", 1, 520),
    publicationApproval: approval,
    approvedPublicationCandidate: candidate,
  };
}

function assertPublicationApproval(approval, candidate) {
  rejectLeakedFields(approval, "source.publicationApproval");
  assertPlainObject(approval, "source.publicationApproval");
  requireConst(approval.decision, "APPROVED_FOR_PUBLICATION_DELIVERY", "source.publicationApproval.decision");
  requireConst(approval.publicationCandidateId, candidate.publicationCandidateId, "source.publicationApproval.publicationCandidateId");
  requireConst(approval.archiveItemId, candidate.archiveItemId, "source.publicationApproval.archiveItemId");
  requireConst(approval.studentId, candidate.studentId, "source.publicationApproval.studentId");
  requireConst(approval.materialType, candidate.materialType, "source.publicationApproval.materialType");
  requireConst(approval.title, candidate.title, "source.publicationApproval.title");
  requireConst(approval.contentRef, candidate.contentRef, "source.publicationApproval.contentRef");
  for (const field of [
    "sourcePublicationPrecheckVerified", "publicationCandidateVerified",
    "studentOwnScopeReviewed", "sensitiveLeakageReviewed", "futurePublicationDeliveryRuntimeRequired",
  ]) requireConst(approval[field], true, `source.publicationApproval.${field}`);
  return {
    approvalId: requireToken(approval.approvalId, "source.publicationApproval.approvalId", "archive_material_publication_approval_"),
    reviewerPrincipalId: requireBoundedString(approval.reviewerPrincipalId, "source.publicationApproval.reviewerPrincipalId", 1, 128),
    decision: "APPROVED_FOR_PUBLICATION_DELIVERY",
  };
}

function assertDeliveryRequest(request, approvalRecord) {
  rejectLeakedFields(request, "input.publicationDeliveryRequest");
  assertPlainObject(request, "input.publicationDeliveryRequest");
  const candidate = approvalRecord.approvedPublicationCandidate;
  requireConst(request.deliveryMode, "STUDENT_APP_RENDERABLE_ARCHIVE_MATERIAL_ENVELOPE", "input.publicationDeliveryRequest.deliveryMode");
  requireConst(request.channel, "STUDENT_APP", "input.publicationDeliveryRequest.channel");
  requireConst(request.audienceKind, "STUDENT_ARCHIVE_MATERIAL", "input.publicationDeliveryRequest.audienceKind");
  requireConst(request.visibilityState, "STUDENT_VISIBLE_ARCHIVE_MATERIAL_DELIVERY_ENVELOPE_NOT_PERSISTED", "input.publicationDeliveryRequest.visibilityState");
  requireConst(request.approvalRecordId, approvalRecord.recordId, "input.publicationDeliveryRequest.approvalRecordId");
  requireConst(request.approvalId, approvalRecord.publicationApproval.approvalId, "input.publicationDeliveryRequest.approvalId");
  requireConst(request.publicationCandidateId, candidate.publicationCandidateId, "input.publicationDeliveryRequest.publicationCandidateId");
  requireConst(request.archiveItemId, candidate.archiveItemId, "input.publicationDeliveryRequest.archiveItemId");
  requireConst(request.studentId, candidate.studentId, "input.publicationDeliveryRequest.studentId");
  requireConst(request.materialType, candidate.materialType, "input.publicationDeliveryRequest.materialType");
  requireConst(request.title, candidate.title, "input.publicationDeliveryRequest.title");
  requireConst(request.contentRef, candidate.contentRef, "input.publicationDeliveryRequest.contentRef");
  requireConst(request.studentOwnScopeConfirmed, true, "input.publicationDeliveryRequest.studentOwnScopeConfirmed");
  return {
    envelopeId: requireToken(request.envelopeId, "input.publicationDeliveryRequest.envelopeId", "archive_material_delivery_env_"),
    deliveryMode: "STUDENT_APP_RENDERABLE_ARCHIVE_MATERIAL_ENVELOPE",
    channel: "STUDENT_APP",
    audienceKind: "STUDENT_ARCHIVE_MATERIAL",
    visibilityState: "STUDENT_VISIBLE_ARCHIVE_MATERIAL_DELIVERY_ENVELOPE_NOT_PERSISTED",
    scopeRef: assertStudentScopeRef(request.scopeRef),
    approvalRecordId: approvalRecord.recordId,
    approvalId: approvalRecord.publicationApproval.approvalId,
    publicationCandidateId: candidate.publicationCandidateId,
    archiveItemId: candidate.archiveItemId,
    studentId: candidate.studentId,
    materialType: candidate.materialType,
    title: candidate.title,
    contentRef: candidate.contentRef,
    studentOwnScopeConfirmed: true,
  };
}

function assertDeliveryPolicy(policy) {
  assertPlainObject(policy, "input.publicationDeliveryPolicy");
  for (const field of [
    "publicationApprovalRequired", "studentDeliveryEnvelopeAllowed",
    "studentVisibleMaterialAllowed", "studentOwnScopeRequired",
    "safeMaterialEnvelopeRequired", "futureDurablePublicationPersistenceReviewRequired",
    "idempotentPublicationDeliveryRequired",
  ]) requireConst(policy[field], true, `input.publicationDeliveryPolicy.${field}`);
  for (const field of [
    "durablePublicationCommitAllowed", "mainDatabaseWriteAllowed", "studentArchiveWriteAllowed",
    "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "ocrOrRagJobWriteAllowed",
    "aiGradingWriteAllowed", "modelInferenceAllowed", "remoteDeviceControlAllowed",
    "localToolMutationAllowed", "swarmAllowed",
  ]) requireConst(policy[field], false, `input.publicationDeliveryPolicy.${field}`);
  return { ...policy };
}

function assertPublicationCandidate(candidate, label) {
  rejectLeakedFields(candidate, label);
  assertPlainObject(candidate, label);
  return {
    publicationCandidateId: requireToken(candidate.publicationCandidateId, `${label}.publicationCandidateId`, "archive_material_pub_precheck_"),
    archiveItemId: requireToken(candidate.archiveItemId, `${label}.archiveItemId`, "tarch_"),
    ownerType: requireConst(candidate.ownerType, "STUDENT", `${label}.ownerType`),
    studentId: requireToken(candidate.studentId, `${label}.studentId`, "student_"),
    materialType: requireOneOf(candidate.materialType, `${label}.materialType`, ["HANDOUT", "QUIZ", "LESSON_NOTE"]),
    title: requireSafeText(candidate.title, `${label}.title`, 1, 160),
    contentRef: requireBoundedString(candidate.contentRef, `${label}.contentRef`, 1, 260),
  };
}

function assertStudentScopeRef(scopeRef) {
  assertPlainObject(scopeRef, "input.publicationDeliveryRequest.scopeRef");
  return {
    scopeType: requireConst(scopeRef.scopeType, "STUDENT_OWN_ARCHIVE", "input.publicationDeliveryRequest.scopeRef.scopeType"),
    studentId: requireToken(scopeRef.studentId, "input.publicationDeliveryRequest.scopeRef.studentId", "student_"),
    archiveItemId: requireToken(scopeRef.archiveItemId, "input.publicationDeliveryRequest.scopeRef.archiveItemId", "tarch_"),
  };
}

function buildRecord(normalized, deliveredAt, p99Ms) {
  const candidate = normalized.approvalRecord.approvedPublicationCandidate;
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_ENVELOPE",
    recordId: `teaching_archive_material_publication_delivery_${safeToken(normalized.idempotencyKey)}`,
    deliveredAt,
    runtimeId: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_RUNTIME_ID,
    commandPort: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_PORT,
    status: deliveryStatus,
    deliveryInvocationId: normalized.deliveryInvocationId,
    principal: normalized.principal,
    sourcePublicationApproval: {
      runtimeId: sourceRuntimeId,
      recordId: normalized.approvalRecord.recordId,
      approvalId: normalized.approvalRecord.publicationApproval.approvalId,
      publicationCandidateId: candidate.publicationCandidateId,
      archiveItemId: candidate.archiveItemId,
    },
    studentMaterialDeliveryEnvelope: buildEnvelope(normalized),
    boundary: {
      publicationApprovalVerified: true,
      safeMaterialEnvelopeOnly: true,
      studentOwnScopeEnforced: true,
      studentVisibleMaterialDeliveryEnvelopeCreated: true,
      studentVisibleMaterialDelivered: true,
      durablePublicationPersistenceStarted: false,
      publicationCommitted: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      futureDurablePublicationPersistenceReviewRequired: true,
    },
    evidenceRefs: [
      ...normalized.evidenceRefs,
      `evidence:archive-material-publication-delivery-input-hash:${normalized.inputHash}`,
      `evidence:runtime:${TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_RUNTIME_ID}`,
      `evidence:command-port:${TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_PORT}`,
      `evidence:source-publication-approval:${normalized.approvalRecord.recordId}`,
      `evidence:publication-delivery-envelope:${normalized.deliveryRequest.envelopeId}`,
    ],
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
    runtimeSlo: { targetP99Ms: 50, p99Ms, totalErrors: 0, operations: 1, evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_PROBE" },
    nextAction: "Use this as Student App renderable material delivery evidence; durable publication persistence, OCR/RAG enrichment, AI grading, and model execution remain separate reviewed slices.",
  };
}

function buildEnvelope(normalized) {
  const request = normalized.deliveryRequest;
  return {
    envelopeId: request.envelopeId,
    deliveryState,
    visibilityState: request.visibilityState,
    channel: request.channel,
    audienceKind: request.audienceKind,
    scopeRef: request.scopeRef,
    approvalRecordId: request.approvalRecordId,
    approvalId: request.approvalId,
    publicationCandidateId: request.publicationCandidateId,
    archiveItemId: request.archiveItemId,
    studentId: request.studentId,
    materialType: request.materialType,
    title: request.title,
    contentRef: request.contentRef,
    renderableMaterial: {
      title: request.title,
      materialType: request.materialType,
      contentRef: request.contentRef,
      deliveryNotice: "Approved teaching archive material is ready for Student App rendering; durable publication persistence is pending.",
    },
    durablePublicationPersistenceStarted: false,
    publicationCommitted: false,
    requiresFutureDurablePublicationPersistenceReview: true,
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
  requireConst(record.status, deliveryStatus, "record.status");
}
function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw deliveryError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_INVALID_OBJECT", `${label} must be an object`);
}
function requireConst(actual, expected, label) {
  if (actual !== expected) throw deliveryError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_CONTRACT_MISMATCH", `${label} must be ${expected}`);
  return actual;
}
function requireOneOf(actual, label, allowed) {
  if (!allowed.includes(actual)) throw deliveryError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_CONTRACT_MISMATCH", `${label} must be one of ${allowed.join(", ")}`);
  return actual;
}
function requireToken(value, label, prefix) {
  const text = requireBoundedString(value, label, prefix.length + 1, 180);
  if (!text.startsWith(prefix)) throw deliveryError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_INVALID_TOKEN", `${label} must start with ${prefix}`);
  if (!/^[A-Za-z0-9:_-]+$/u.test(text)) throw deliveryError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_INVALID_TOKEN", `${label} has invalid characters`);
  return text;
}
function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string" || value.length < min || value.length > max) throw deliveryError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_INVALID_TEXT", `${label} must be ${min}-${max} chars`);
  return value;
}
function requireSafeText(value, label, min, max) {
  const text = requireBoundedString(value, label, min, max);
  if (/[<>]|\bscript\b|javascript:|data:/iu.test(text)) throw deliveryError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_UNSAFE_TEXT", `${label} contains unsafe text`);
  return text;
}
function uniqueStringArray(value, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw deliveryError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_INVALID_ARRAY", `${label} must have ${min}-${max} items`);
  const items = value.map((item, index) => requireBoundedString(item, `${label}[${index}]`, 1, 360));
  if (new Set(items).size !== items.length) throw deliveryError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_DUPLICATE_ARRAY", `${label} must be unique`);
  return items;
}
function rejectLeakedFields(value, label) {
  if (!value || typeof value !== "object") return;
  for (const field of leakedFieldNames) {
    if (Object.hasOwn(value, field)) throw deliveryError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_LEAKED_FIELD", `${label}.${field} is not allowed`);
  }
}
function hashInput(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function safeToken(value) { return String(value).replace(/[^A-Za-z0-9_-]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 180); }
function deliveryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
