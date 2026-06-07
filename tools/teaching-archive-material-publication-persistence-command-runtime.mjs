import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_RUNTIME_ID =
  "teaching_archive_material_publication_persistence_command_runtime";
export const TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_PORT =
  "TeachingArchiveMaterialPublicationPersistenceCommandPort.recordTeachingArchiveMaterialPublicationPersistenceCommand";

const inputSchemaVersion = "2026-06-07.teaching.archive-material-publication-persistence-command.v1";
const outputSchemaVersion = "2026-06-07.teaching.archive-material-publication-persistence-command-recorded.v1";
const deliveryWorkload = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY";
const deliveryRuntimeId = "teaching_archive_material_publication_delivery_runtime";
const deliveryStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_ENVELOPE_READY_NOT_PERSISTED";
const commandStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED";
const commandState = "NOT_COMMITTED_TO_PUBLICATION_STORE";
const defaultCommandLogPath = "reports/teaching-command-log/teaching-archive-material-publication-persistence-command.jsonl";
const leakedFieldNames = [
  "rawContent", "answerKey", "rawModelOutput", "modelOutput", "directSql", "dbUrl",
  "internalError", "databaseWriteResult", "publicationCommittedAt", "publishedAt",
  "studentArchivePersistenceResult", "ocrJobId", "ragChunkIds", "aiGradingRequestId",
  "workerId", "claimExpiresAt", "scoreSummary",
];

export function recordTeachingArchiveMaterialPublicationPersistenceCommand(input, options = {}) {
  const recordedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const commandLogPath = options.commandLogPath ?? defaultCommandLogPath;
  const existing = findExistingRecordByIdempotencyKey(commandLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }
  const record = buildRecord(normalized, recordedAt, options.probeP99Ms ?? 6);
  appendRecord(commandLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatTeachingArchiveMaterialPublicationPersistenceCommand(result) {
  return [
    `Teaching archive material publication persistence command: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Command: ${result.publicationPersistenceCommand.commandId}`,
    `Envelope: ${result.publicationPersistenceCommand.sourceDeliveryEnvelopeId}`,
    `Committed: ${result.boundary.publicationCommitted}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const persistenceInvocationId = requireToken(input.persistenceInvocationId, "input.persistenceInvocationId", "archive_material_publication_persist_");
  const principal = assertPersistencePrincipal(input.principal);
  const deliveryReport = assertDeliveryReport(input.publicationDeliveryEnvelopeReport);
  const deliveryRecord = assertDeliveryRecord(deliveryReport);
  const persistenceRequest = assertPersistenceRequest(input.publicationPersistenceRequest, deliveryRecord);
  const persistencePolicy = assertPersistencePolicy(input.publicationPersistencePolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 720);
  if (!evidenceRefs.some((ref) => ref.includes("publication-delivery"))) {
    throw persistenceError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_MISSING_DELIVERY_EVIDENCE", "publication delivery evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("publication-persistence-command"))) {
    throw persistenceError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_MISSING_COMMAND_EVIDENCE", "publication persistence command evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const inputHash = hashInput({
    persistenceInvocationId,
    principalId: principal.principalId,
    deliveryRecordId: deliveryRecord.recordId,
    deliveryEnvelopeId: deliveryRecord.studentMaterialDeliveryEnvelope.envelopeId,
    persistenceRequest,
    persistencePolicy,
  });
  return { persistenceInvocationId, principal, deliveryReport, deliveryRecord, persistenceRequest, persistencePolicy, evidenceRefs, idempotencyKey, inputHash };
}

function assertPersistencePrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  requireConst(principal.subjectType, "SERVICE", "input.principal.subjectType");
  requireConst(principal.role, "SERVICE", "input.principal.role");
  requireConst(principal.entryPoint, "PUBLICATION_PERSISTENCE_COMMAND_RUNTIME", "input.principal.entryPoint");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  for (const scope of ["TEACHING_READ", "PUBLICATION_PERSISTENCE_COMMAND", "STUDENT_ARCHIVE_WRITE_INTENT"]) {
    if (!scopes.includes(scope)) throw persistenceError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_MISSING_SCOPE", `${scope} is required`);
  }
  return {
    principalId: requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128),
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 160),
    subjectType: "SERVICE",
    role: "SERVICE",
    entryPoint: "PUBLICATION_PERSISTENCE_COMMAND_RUNTIME",
    scopes,
  };
}

function assertDeliveryReport(report) {
  rejectLeakedFields(report, "input.publicationDeliveryEnvelopeReport");
  assertPlainObject(report, "input.publicationDeliveryEnvelopeReport");
  requireConst(report.readiness, "READY", "input.publicationDeliveryEnvelopeReport.readiness");
  requireConst(report.workloadType, deliveryWorkload, "input.publicationDeliveryEnvelopeReport.workloadType");
  requireConst(report.runtime?.runtimeId, deliveryRuntimeId, "input.publicationDeliveryEnvelopeReport.runtime.runtimeId");
  requireConst(report.runtime?.status, deliveryStatus, "input.publicationDeliveryEnvelopeReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.publicationDeliveryEnvelopeReport.runtimeSlo.totalErrors");
  for (const field of [
    "publicationApprovalRequired", "publicationApprovalVerified", "studentDeliveryEnvelopeAllowed",
    "safeMaterialEnvelopeOnly", "studentOwnScopeEnforced", "studentVisibleMaterialDeliveryEnvelopeCreated",
    "studentVisibleMaterialDelivered", "futureDurablePublicationPersistenceReviewRequired",
  ]) requireConst(report.safetyInvariants?.[field], true, `input.publicationDeliveryEnvelopeReport.safetyInvariants.${field}`);
  for (const field of [
    "durablePublicationPersistenceStarted", "publicationCommitted", "mainDatabaseWriteStarted",
    "studentArchiveWriteStarted", "directDatabaseAccessAllowed", "executeHttpRequestAllowed",
    "ocrOrRagJobWriteStarted", "aiGradingWriteStarted", "modelInferenceStarted",
    "remoteDeviceControlAllowed", "localToolMutationAllowed", "swarmAllowed",
  ]) requireConst(report.safetyInvariants?.[field], false, `input.publicationDeliveryEnvelopeReport.safetyInvariants.${field}`);
  return report;
}

function assertDeliveryRecord(report) {
  const result = report.runtimeProbes?.teachingArchiveMaterialPublicationDelivery?.result;
  rejectLeakedFields(result, "input.publicationDeliveryEnvelopeReport.runtimeProbes.result");
  assertPlainObject(result, "input.publicationDeliveryEnvelopeReport.runtimeProbes.result");
  requireConst(result.schemaVersion, "2026-06-07.teaching.archive-material-publication-delivery-envelope.v1", "source.schemaVersion");
  requireConst(result.runtimeId, deliveryRuntimeId, "source.runtimeId");
  requireConst(result.commandPort, "TeachingArchiveMaterialPublicationDeliveryPort.recordTeachingArchiveMaterialPublicationDeliveryEnvelope", "source.commandPort");
  requireConst(result.status, deliveryStatus, "source.status");
  requireConst(result.boundary?.studentVisibleMaterialDeliveryEnvelopeCreated, true, "source.boundary.studentVisibleMaterialDeliveryEnvelopeCreated");
  requireConst(result.boundary?.studentVisibleMaterialDelivered, true, "source.boundary.studentVisibleMaterialDelivered");
  requireConst(result.boundary?.durablePublicationPersistenceStarted, false, "source.boundary.durablePublicationPersistenceStarted");
  requireConst(result.boundary?.publicationCommitted, false, "source.boundary.publicationCommitted");
  requireConst(result.boundary?.mainDatabaseWriteStarted, false, "source.boundary.mainDatabaseWriteStarted");
  requireConst(result.boundary?.studentArchiveWriteStarted, false, "source.boundary.studentArchiveWriteStarted");
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "source.recordId", 1, 520),
    deliveryInvocationId: requireToken(result.deliveryInvocationId, "source.deliveryInvocationId", "archive_material_publication_delivery_"),
    sourcePublicationApproval: assertSourcePublicationApproval(result.sourcePublicationApproval),
    studentMaterialDeliveryEnvelope: assertStudentMaterialDeliveryEnvelope(result.studentMaterialDeliveryEnvelope),
    evidenceRefs: uniqueStringArray(result.evidenceRefs, "source.evidenceRefs", 1, 720),
  };
}

function assertSourcePublicationApproval(source) {
  assertPlainObject(source, "source.sourcePublicationApproval");
  requireConst(source.runtimeId, "teaching_archive_material_publication_approval_runtime", "source.sourcePublicationApproval.runtimeId");
  return {
    runtimeId: source.runtimeId,
    recordId: requireBoundedString(source.recordId, "source.sourcePublicationApproval.recordId", 1, 520),
    approvalId: requireToken(source.approvalId, "source.sourcePublicationApproval.approvalId", "archive_material_publication_approval_"),
    publicationCandidateId: requireToken(source.publicationCandidateId, "source.sourcePublicationApproval.publicationCandidateId", "archive_material_pub_precheck_"),
    archiveItemId: requireToken(source.archiveItemId, "source.sourcePublicationApproval.archiveItemId", "tarch_"),
  };
}

function assertStudentMaterialDeliveryEnvelope(envelope) {
  rejectLeakedFields(envelope, "source.studentMaterialDeliveryEnvelope");
  assertPlainObject(envelope, "source.studentMaterialDeliveryEnvelope");
  requireConst(envelope.deliveryState, "READY_FOR_STUDENT_APP_MATERIAL_RENDER_NOT_ARCHIVED", "source.studentMaterialDeliveryEnvelope.deliveryState");
  requireConst(envelope.visibilityState, "STUDENT_VISIBLE_ARCHIVE_MATERIAL_DELIVERY_ENVELOPE_NOT_PERSISTED", "source.studentMaterialDeliveryEnvelope.visibilityState");
  requireConst(envelope.channel, "STUDENT_APP", "source.studentMaterialDeliveryEnvelope.channel");
  requireConst(envelope.audienceKind, "STUDENT_ARCHIVE_MATERIAL", "source.studentMaterialDeliveryEnvelope.audienceKind");
  requireConst(envelope.durablePublicationPersistenceStarted, false, "source.studentMaterialDeliveryEnvelope.durablePublicationPersistenceStarted");
  requireConst(envelope.publicationCommitted, false, "source.studentMaterialDeliveryEnvelope.publicationCommitted");
  requireConst(envelope.requiresFutureDurablePublicationPersistenceReview, true, "source.studentMaterialDeliveryEnvelope.requiresFutureDurablePublicationPersistenceReview");
  return {
    envelopeId: requireToken(envelope.envelopeId, "source.studentMaterialDeliveryEnvelope.envelopeId", "archive_material_delivery_env_"),
    deliveryState: envelope.deliveryState,
    visibilityState: envelope.visibilityState,
    channel: envelope.channel,
    audienceKind: envelope.audienceKind,
    scopeRef: assertStudentScopeRef(envelope.scopeRef, "source.studentMaterialDeliveryEnvelope.scopeRef"),
    approvalRecordId: requireBoundedString(envelope.approvalRecordId, "source.studentMaterialDeliveryEnvelope.approvalRecordId", 1, 520),
    approvalId: requireToken(envelope.approvalId, "source.studentMaterialDeliveryEnvelope.approvalId", "archive_material_publication_approval_"),
    publicationCandidateId: requireToken(envelope.publicationCandidateId, "source.studentMaterialDeliveryEnvelope.publicationCandidateId", "archive_material_pub_precheck_"),
    archiveItemId: requireToken(envelope.archiveItemId, "source.studentMaterialDeliveryEnvelope.archiveItemId", "tarch_"),
    studentId: requireToken(envelope.studentId, "source.studentMaterialDeliveryEnvelope.studentId", "student_"),
    materialType: requireOneOf(envelope.materialType, "source.studentMaterialDeliveryEnvelope.materialType", ["HANDOUT", "QUIZ", "LESSON_NOTE"]),
    title: requireSafeText(envelope.title, "source.studentMaterialDeliveryEnvelope.title", 1, 160),
    contentRef: requireBoundedString(envelope.contentRef, "source.studentMaterialDeliveryEnvelope.contentRef", 1, 260),
  };
}

function assertPersistenceRequest(request, deliveryRecord) {
  rejectLeakedFields(request, "input.publicationPersistenceRequest");
  assertPlainObject(request, "input.publicationPersistenceRequest");
  const envelope = deliveryRecord.studentMaterialDeliveryEnvelope;
  requireConst(request.persistenceMode, "APPEND_ONLY_PUBLICATION_PERSISTENCE_COMMAND", "input.publicationPersistenceRequest.persistenceMode");
  requireConst(request.targetPublicationKind, "STUDENT_ARCHIVE_MATERIAL", "input.publicationPersistenceRequest.targetPublicationKind");
  requireConst(request.desiredPublicationState, "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED", "input.publicationPersistenceRequest.desiredPublicationState");
  requireJsonEqual(request.scopeRef, envelope.scopeRef, "input.publicationPersistenceRequest.scopeRef");
  for (const field of [
    ["deliveryEnvelopeRecordId", deliveryRecord.recordId],
    ["deliveryEnvelopeId", envelope.envelopeId],
    ["approvalRecordId", envelope.approvalRecordId],
    ["approvalId", envelope.approvalId],
    ["publicationCandidateId", envelope.publicationCandidateId],
    ["archiveItemId", envelope.archiveItemId],
    ["studentId", envelope.studentId],
    ["materialType", envelope.materialType],
    ["title", envelope.title],
    ["contentRef", envelope.contentRef],
  ]) requireConst(request[field[0]], field[1], `input.publicationPersistenceRequest.${field[0]}`);
  return {
    commandId: requireToken(request.commandId, "input.publicationPersistenceRequest.commandId", "archive_material_publication_persist_cmd_"),
    persistenceMode: "APPEND_ONLY_PUBLICATION_PERSISTENCE_COMMAND",
    targetPublicationKind: "STUDENT_ARCHIVE_MATERIAL",
    desiredPublicationState: "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
    scopeRef: envelope.scopeRef,
    deliveryEnvelopeRecordId: deliveryRecord.recordId,
    deliveryEnvelopeId: envelope.envelopeId,
    approvalRecordId: envelope.approvalRecordId,
    approvalId: envelope.approvalId,
    publicationCandidateId: envelope.publicationCandidateId,
    archiveItemId: envelope.archiveItemId,
    studentId: envelope.studentId,
    materialType: envelope.materialType,
    title: envelope.title,
    contentRef: envelope.contentRef,
  };
}

function assertPersistencePolicy(policy) {
  assertPlainObject(policy, "input.publicationPersistencePolicy");
  for (const field of [
    "publicationDeliveryEnvelopeRequired", "appendOnlyCommandLogRequired",
    "studentOwnScopeRequired", "preserveApprovalEvidenceRequired",
    "preserveMaterialPointerRequired", "futureDurablePublicationCommitReviewRequired",
    "idempotentPersistenceCommandRequired",
  ]) requireConst(policy[field], true, `input.publicationPersistencePolicy.${field}`);
  for (const field of [
    "durablePublicationCommitAllowed", "mainDatabaseWriteAllowed", "studentArchiveWriteAllowed",
    "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "ocrOrRagJobWriteAllowed",
    "aiGradingWriteAllowed", "modelInferenceAllowed", "remoteDeviceControlAllowed",
    "localToolMutationAllowed", "swarmAllowed",
  ]) requireConst(policy[field], false, `input.publicationPersistencePolicy.${field}`);
  return { ...policy };
}

function buildRecord(normalized, recordedAt, p99Ms) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND",
    recordId: `teaching_archive_material_publication_persistence_command_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    runtimeId: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_RUNTIME_ID,
    commandPort: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_PORT,
    status: commandStatus,
    persistenceInvocationId: normalized.persistenceInvocationId,
    principal: normalized.principal,
    sourcePublicationDeliveryEnvelope: {
      runtimeId: deliveryRuntimeId,
      recordId: normalized.deliveryRecord.recordId,
      deliveryInvocationId: normalized.deliveryRecord.deliveryInvocationId,
      envelopeId: normalized.deliveryRecord.studentMaterialDeliveryEnvelope.envelopeId,
    },
    publicationPersistenceCommand: buildCommand(normalized),
    boundary: {
      publicationDeliveryEnvelopeVerified: true,
      publicationApprovalPreserved: true,
      safeMaterialPointerOnly: true,
      studentOwnScopeEnforced: true,
      publicationPersistenceCommandRecorded: true,
      appendOnlyCommandLogRecorded: true,
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
      requiresFutureDurablePublicationCommitReview: true,
    },
    evidenceRefs: uniqueEvidenceRefs([
      ...normalized.evidenceRefs,
      ...normalized.deliveryRecord.evidenceRefs,
      `evidence:archive-material-publication-persistence-command-input-hash:${normalized.inputHash}`,
      `evidence:runtime:${TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_RUNTIME_ID}`,
      `evidence:command-port:${TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_PORT}`,
    ]),
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
    runtimeSlo: { targetP99Ms: 50, p99Ms, totalErrors: 0, operations: 1, evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_PROBE" },
    nextAction: "Use this append-only command as the reviewed input for a later durable publication commit slice; no database write, OCR/RAG, AI grading, model call, or Swarm is started here.",
  };
}

function buildCommand(normalized) {
  const request = normalized.persistenceRequest;
  return {
    commandId: request.commandId,
    commandKind: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND",
    persistenceMode: request.persistenceMode,
    targetPublicationKind: request.targetPublicationKind,
    desiredPublicationState: request.desiredPublicationState,
    commandState,
    scopeRef: request.scopeRef,
    sourceDeliveryRecordId: request.deliveryEnvelopeRecordId,
    sourceDeliveryEnvelopeId: request.deliveryEnvelopeId,
    approvalRecordId: request.approvalRecordId,
    approvalId: request.approvalId,
    publicationCandidateId: request.publicationCandidateId,
    archiveItemId: request.archiveItemId,
    studentId: request.studentId,
    materialType: request.materialType,
    title: request.title,
    contentRef: request.contentRef,
    approvalEvidencePreserved: true,
    studentOwnScopeEnforced: true,
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
function uniqueEvidenceRefs(refs) {
  return [...new Set(refs)];
}
function buildResult(record, extra) { return { ...record, ...extra }; }
function appendRecord(filePath, record) { const absolute = path.resolve(filePath); fs.mkdirSync(path.dirname(absolute), { recursive: true }); fs.appendFileSync(absolute, `${JSON.stringify(record)}\n`); }
function findExistingRecordByIdempotencyKey(filePath, key) {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) return null;
  const lines = fs.readFileSync(absolute, "utf8").split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const record = JSON.parse(lines[index]);
    if (record.idempotencyKey === key) return record;
  }
  return null;
}
function assertReplayMatches(record, normalized) {
  if (record.inputHash !== normalized.inputHash) throw persistenceError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_IDEMPOTENCY_CONFLICT", "idempotency key already exists with different publication persistence command input");
  requireConst(record.status, commandStatus, "record.status");
}
function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw persistenceError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_INVALID_OBJECT", `${label} must be an object`);
}
function requireConst(actual, expected, label) {
  if (actual !== expected) throw persistenceError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_CONTRACT_MISMATCH", `${label} must be ${expected}`);
  return expected;
}
function requireJsonEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw persistenceError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_CONTRACT_MISMATCH", `${label} must match source delivery envelope`);
}
function requireOneOf(actual, label, allowed) {
  if (!allowed.includes(actual)) throw persistenceError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_CONTRACT_MISMATCH", `${label} must be one of ${allowed.join(", ")}`);
  return actual;
}
function requireToken(value, label, prefix) {
  const text = requireBoundedString(value, label, prefix.length + 1, 260);
  if (!text.startsWith(prefix) || !/^[A-Za-z0-9:_-]+$/u.test(text)) throw persistenceError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_INVALID_TOKEN", `${label} must start with ${prefix}`);
  return text;
}
function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string" || value.length < min || value.length > max) throw persistenceError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_INVALID_TEXT", `${label} must be ${min}-${max} chars`);
  return value;
}
function requireSafeText(value, label, min, max) {
  const text = requireBoundedString(value, label, min, max);
  if (/[<>]|\bscript\b|javascript:|data:/iu.test(text)) throw persistenceError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_UNSAFE_TEXT", `${label} contains unsafe text`);
  return text;
}
function uniqueStringArray(value, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw persistenceError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_INVALID_ARRAY", `${label} must have ${min}-${max} items`);
  const items = value.map((item, index) => requireBoundedString(item, `${label}[${index}]`, 1, 360));
  if (new Set(items).size !== items.length) throw persistenceError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_DUPLICATE_ARRAY", `${label} must be unique`);
  return items;
}
function rejectLeakedFields(value, label) {
  if (!value || typeof value !== "object") return;
  const keys = collectKeys(value);
  for (const field of leakedFieldNames) {
    if (keys.has(field)) throw persistenceError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_LEAKED_FIELD", `${label}.${field} is not allowed`);
  }
}
function collectKeys(value, keys = new Set()) {
  if (!value || typeof value !== "object") return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.add(key);
    collectKeys(child, keys);
  }
  return keys;
}
function hashInput(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function safeToken(value) { return String(value).replace(/[^A-Za-z0-9_-]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 180); }
function persistenceError(code, message) { const error = new Error(message); error.code = code; return error; }
