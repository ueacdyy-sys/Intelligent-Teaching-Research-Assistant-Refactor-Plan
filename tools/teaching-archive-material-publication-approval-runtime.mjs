import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_RUNTIME_ID =
  "teaching_archive_material_publication_approval_runtime";
export const TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_PORT =
  "TeachingArchiveMaterialPublicationApprovalPort.recordTeachingArchiveMaterialPublicationApproval";

const inputSchemaVersion = "2026-06-07.teaching.archive-material-publication-approval.v1";
const outputSchemaVersion = "2026-06-07.teaching.archive-material-publication-approved.v1";
const sourceWorkload = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK";
const sourceRuntimeId = "teaching_archive_material_publication_precheck_runtime";
const sourceStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_READY";
const approvalStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVED_NOT_PUBLISHED";
const approvalDecision = "APPROVED_FOR_PUBLICATION_DELIVERY";
const defaultCommandLogPath = "reports/teaching-command-log/teaching-archive-material-publication-approval.jsonl";
const leakedFieldNames = [
  "rawModelOutput", "modelOutput", "directSql", "dbUrl", "internalError", "ocrJobId",
  "ragChunkIds", "aiGradingRequestId", "workerId", "claimExpiresAt", "publishedAt",
  "deliveredAt", "studentVisibleUrl", "deliveryEnvelope", "rawContent", "answerKey",
  "scoreSummary",
];

export function recordTeachingArchiveMaterialPublicationApproval(input, options = {}) {
  const approvedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const commandLogPath = options.commandLogPath ?? defaultCommandLogPath;
  const existing = findExistingRecordByIdempotencyKey(commandLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }
  const record = buildRecord(normalized, approvedAt, options.probeP99Ms ?? 6);
  appendRecord(commandLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatTeachingArchiveMaterialPublicationApproval(result) {
  return [
    `Teaching archive material publication approval: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Archive item: ${result.approvedPublicationCandidate.archiveItemId}`,
    `Decision: ${result.approvalDecision.decision}`,
    `Published: ${result.boundary.studentVisiblePublished}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const approvalInvocationId = requireToken(input.approvalInvocationId, "input.approvalInvocationId", "archive_material_publication_approval_");
  const principal = assertPrincipal(input.principal);
  const precheckReport = assertPrecheckReport(input.publicationPrecheckReport);
  const sourcePrecheck = assertPrecheckResult(precheckReport);
  const publicationApprovalPolicy = assertPublicationApprovalPolicy(input.publicationApprovalPolicy);
  const approval = assertApproval(input.publicationApproval, principal, sourcePrecheck.publicationCandidate);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 720);
  if (!evidenceRefs.some((ref) => ref.includes("publication-precheck"))) {
    throw approvalError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_MISSING_PRECHECK_EVIDENCE", "publication precheck evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("publication-approval"))) {
    throw approvalError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_MISSING_APPROVAL_EVIDENCE", "publication approval evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const inputHash = hashInput({
    approvalInvocationId,
    principalId: principal.principalId,
    sourcePrecheckRecordId: sourcePrecheck.recordId,
    approval,
    publicationApprovalPolicy,
  });
  return { approvalInvocationId, principal, precheckReport, sourcePrecheck, publicationApprovalPolicy, approval, evidenceRefs, idempotencyKey, inputHash };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  requireConst(principal.subjectType, "USER", "input.principal.subjectType");
  const role = requireOneOf(principal.role, "input.principal.role", ["TEACHER", "ADMIN"]);
  const entryPoint = requireOneOf(principal.entryPoint, "input.principal.entryPoint", ["DESKTOP_TEACHING", "ADMIN_CONSOLE"]);
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  const teacherAllowed = role === "TEACHER" && entryPoint === "DESKTOP_TEACHING" &&
    scopes.includes("TEACHING_ARCHIVE_REVIEW") && scopes.includes("TEACHING_ARCHIVE_PUBLISH_APPROVE");
  const adminAllowed = role === "ADMIN" && scopes.includes("ADMIN_SYSTEM");
  if (!teacherAllowed && !adminAllowed) {
    throw approvalError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_FORBIDDEN_PRINCIPAL", "publication approval requires a human teaching approver or admin");
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

function assertPrecheckReport(report) {
  rejectLeakedFields(report, "input.publicationPrecheckReport");
  assertPlainObject(report, "input.publicationPrecheckReport");
  requireConst(report.readiness, "READY", "input.publicationPrecheckReport.readiness");
  requireConst(report.workloadType, sourceWorkload, "input.publicationPrecheckReport.workloadType");
  requireConst(report.runtime?.runtimeId, sourceRuntimeId, "input.publicationPrecheckReport.runtime.runtimeId");
  requireConst(report.runtime?.status, sourceStatus, "input.publicationPrecheckReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.publicationPrecheckReport.runtimeSlo.totalErrors");
  for (const field of [
    "sourceStudentProductReadRequired", "physicalDatabaseRowVerified",
    "humanPublicationPrecheckRecorded", "publicationApprovalRequired",
  ]) requireConst(report.safetyInvariants?.[field], true, `input.publicationPrecheckReport.safetyInvariants.${field}`);
  for (const field of [
    "publicationCommitted", "studentVisiblePublished", "mainDatabaseWriteStarted",
    "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "ocrOrRagJobWriteStarted",
    "aiGradingWriteStarted", "modelInferenceStarted", "remoteDeviceControlAllowed",
    "localToolMutationAllowed", "swarmAllowed",
  ]) requireConst(report.safetyInvariants?.[field], false, `input.publicationPrecheckReport.safetyInvariants.${field}`);
  return report;
}

function assertPrecheckResult(report) {
  const result = report.runtimeProbes?.teachingArchiveMaterialPublicationPrecheck?.result;
  rejectLeakedFields(result, "input.publicationPrecheckReport.runtimeProbes.result");
  assertPlainObject(result, "input.publicationPrecheckReport.runtimeProbes.result");
  requireConst(result.schemaVersion, "2026-06-07.teaching.archive-material-publication-prechecked.v1", "source.schemaVersion");
  requireConst(result.runtimeId, sourceRuntimeId, "source.runtimeId");
  requireConst(result.commandPort, "TeachingArchiveMaterialPublicationPrecheckPort.recordTeachingArchiveMaterialPublicationPrecheck", "source.commandPort");
  requireConst(result.status, sourceStatus, "source.status");
  requireConst(result.precheckDecision?.decision, "READY_FOR_PUBLICATION_APPROVAL", "source.precheckDecision.decision");
  requireConst(result.boundary?.humanPublicationPrecheckRecorded, true, "source.boundary.humanPublicationPrecheckRecorded");
  requireConst(result.boundary?.publicationApprovalRequired, true, "source.boundary.publicationApprovalRequired");
  requireConst(result.boundary?.publicationCommitted, false, "source.boundary.publicationCommitted");
  requireConst(result.boundary?.studentVisiblePublished, false, "source.boundary.studentVisiblePublished");
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "source.recordId", 1, 520),
    publicationCandidate: assertPublicationCandidate(result.publicationCandidate, "source.publicationCandidate"),
  };
}

function assertPublicationApprovalPolicy(policy) {
  assertPlainObject(policy, "input.publicationApprovalPolicy");
  for (const field of [
    "approvalOnly", "sourcePublicationPrecheckRequired", "humanPublicationApprovalRequired",
    "candidateMatchRequired", "noSensitiveLeakageRequired", "futurePublicationDeliveryRuntimeRequired",
    "idempotentPublicationApprovalRequired",
  ]) requireConst(policy[field], true, `input.publicationApprovalPolicy.${field}`);
  for (const field of [
    "directPublicationAllowed", "studentVisibleDeliveryAllowed", "mainDatabaseWriteAllowed",
    "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "ocrOrRagJobWriteAllowed",
    "aiGradingWriteAllowed", "modelInferenceAllowed", "remoteDeviceControlAllowed",
    "localToolMutationAllowed", "swarmAllowed",
  ]) requireConst(policy[field], false, `input.publicationApprovalPolicy.${field}`);
  return { ...policy };
}

function assertApproval(approval, principal, candidate) {
  rejectLeakedFields(approval, "input.publicationApproval");
  assertPlainObject(approval, "input.publicationApproval");
  requireConst(approval.decision, approvalDecision, "input.publicationApproval.decision");
  requireConst(approval.reviewerPrincipalId, principal.principalId, "input.publicationApproval.reviewerPrincipalId");
  requireConst(approval.publicationCandidateId, candidate.publicationCandidateId, "input.publicationApproval.publicationCandidateId");
  requireConst(approval.archiveItemId, candidate.archiveItemId, "input.publicationApproval.archiveItemId");
  requireConst(approval.studentId, candidate.studentId, "input.publicationApproval.studentId");
  requireConst(approval.materialType, candidate.materialType, "input.publicationApproval.materialType");
  requireConst(approval.title, candidate.title, "input.publicationApproval.title");
  requireConst(approval.contentRef, candidate.contentRef, "input.publicationApproval.contentRef");
  for (const field of [
    "sourcePublicationPrecheckVerified", "publicationCandidateVerified",
    "studentOwnScopeReviewed", "sensitiveLeakageReviewed", "futurePublicationDeliveryRuntimeRequired",
  ]) requireConst(approval[field], true, `input.publicationApproval.${field}`);
  for (const field of [
    "publicationCommitted", "studentVisiblePublished", "deliveryEnvelopeCreated",
    "mainDatabaseWriteApproved", "ocrOrRagJobApproved", "aiGradingApproved",
    "modelInferenceApproved", "remoteDeviceControlApproved", "localToolMutationApproved",
    "swarmApproved",
  ]) requireConst(approval[field], false, `input.publicationApproval.${field}`);
  return {
    approvalId: requireToken(approval.approvalId, "input.publicationApproval.approvalId", "archive_material_publication_approval_"),
    reviewerPrincipalId: principal.principalId,
    decision: approvalDecision,
    approvedAt: requireIsoString(approval.approvedAt, "input.publicationApproval.approvedAt"),
    publicationCandidateId: candidate.publicationCandidateId,
    archiveItemId: candidate.archiveItemId,
    studentId: candidate.studentId,
    materialType: candidate.materialType,
    title: candidate.title,
    contentRef: candidate.contentRef,
    sourcePublicationPrecheckVerified: true,
    publicationCandidateVerified: true,
    studentOwnScopeReviewed: true,
    sensitiveLeakageReviewed: true,
    futurePublicationDeliveryRuntimeRequired: true,
    approvalNotes: requireSafeText(approval.approvalNotes, "input.publicationApproval.approvalNotes", 4, 600),
    publicationCommitted: false,
    studentVisiblePublished: false,
    deliveryEnvelopeCreated: false,
    mainDatabaseWriteApproved: false,
    ocrOrRagJobApproved: false,
    aiGradingApproved: false,
    modelInferenceApproved: false,
    remoteDeviceControlApproved: false,
    localToolMutationApproved: false,
    swarmApproved: false,
  };
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
    publicationTarget: requireConst(candidate.publicationTarget, "TEACHER_PUBLICATION_APPROVAL_QUEUE", `${label}.publicationTarget`),
    intendedAudience: requireExactSet(candidate.intendedAudience, `${label}.intendedAudience`, ["TEACHER_REVIEW"]),
    studentVisibleRequested: requireConst(candidate.studentVisibleRequested, false, `${label}.studentVisibleRequested`),
    ocrEnrichmentRequested: requireConst(candidate.ocrEnrichmentRequested, false, `${label}.ocrEnrichmentRequested`),
    ragEnrichmentRequested: requireConst(candidate.ragEnrichmentRequested, false, `${label}.ragEnrichmentRequested`),
    aiGradingRequested: requireConst(candidate.aiGradingRequested, false, `${label}.aiGradingRequested`),
    releaseChannel: requireConst(candidate.releaseChannel, "NONE_PRECHECK_ONLY", `${label}.releaseChannel`),
    reviewNotes: requireSafeText(candidate.reviewNotes, `${label}.reviewNotes`, 4, 600),
    riskTags: requireExactSet(candidate.riskTags, `${label}.riskTags`, ["HUMAN_APPROVAL_REQUIRED"]),
  };
}

function buildRecord(normalized, approvedAt, p99Ms) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL",
    recordId: `teaching_archive_material_publication_approval_${safeToken(normalized.idempotencyKey)}`,
    approvedAt,
    runtimeId: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_RUNTIME_ID,
    commandPort: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_PORT,
    status: approvalStatus,
    approvalInvocationId: normalized.approvalInvocationId,
    principal: normalized.principal,
    sourcePublicationPrecheck: {
      runtimeId: sourceRuntimeId,
      recordId: normalized.sourcePrecheck.recordId,
      publicationCandidateId: normalized.sourcePrecheck.publicationCandidate.publicationCandidateId,
      archiveItemId: normalized.sourcePrecheck.publicationCandidate.archiveItemId,
    },
    approvedPublicationCandidate: normalized.sourcePrecheck.publicationCandidate,
    publicationApproval: normalized.approval,
    approvalDecision: {
      decision: approvalDecision,
      approvedForPublicationDelivery: true,
      publicationCommitted: false,
      studentVisiblePublicationAllowed: false,
      ocrOrRagEnrichmentAllowed: false,
      modelInferenceAllowed: false,
    },
    boundary: {
      sourcePublicationPrecheckRequired: true,
      physicalDatabaseRowVerified: true,
      humanPublicationPrecheckRecorded: true,
      publicationApproved: true,
      approvedForPublicationDelivery: true,
      publicationCommitted: false,
      studentVisiblePublished: false,
      deliveryEnvelopeCreated: false,
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
      `evidence:archive-material-publication-approval-input-hash:${normalized.inputHash}`,
      `evidence:runtime:${TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_RUNTIME_ID}`,
      `evidence:command-port:${TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_PORT}`,
      `evidence:source-publication-precheck:${normalized.sourcePrecheck.recordId}`,
      `evidence:publication-approval:${normalized.approval.approvalId}`,
    ],
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
    runtimeSlo: { targetP99Ms: 50, p99Ms, totalErrors: 0, operations: 1, evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_PROBE" },
    nextAction: "Use this as publication delivery input; actual publication, OCR/RAG enrichment, AI grading, and model execution remain separate reviewed slices.",
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
  requireConst(record.status, approvalStatus, "record.status");
}
function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw approvalError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_INVALID_OBJECT", `${label} must be an object`);
}
function requireConst(actual, expected, label) {
  if (actual !== expected) throw approvalError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_CONTRACT_MISMATCH", `${label} must be ${expected}`);
  return actual;
}
function requireOneOf(actual, label, allowed) {
  if (!allowed.includes(actual)) throw approvalError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_CONTRACT_MISMATCH", `${label} must be one of ${allowed.join(", ")}`);
  return actual;
}
function requireToken(value, label, prefix) {
  const text = requireBoundedString(value, label, prefix.length + 1, 180);
  if (!text.startsWith(prefix)) throw approvalError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_INVALID_TOKEN", `${label} must start with ${prefix}`);
  if (!/^[A-Za-z0-9:_-]+$/u.test(text)) throw approvalError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_INVALID_TOKEN", `${label} has invalid characters`);
  return text;
}
function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string" || value.length < min || value.length > max) throw approvalError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_INVALID_TEXT", `${label} must be ${min}-${max} chars`);
  return value;
}
function requireSafeText(value, label, min, max) {
  const text = requireBoundedString(value, label, min, max);
  if (/[<>]|\bscript\b|javascript:|data:/iu.test(text)) throw approvalError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_UNSAFE_TEXT", `${label} contains unsafe text`);
  return text;
}
function requireIsoString(value, label) {
  const text = requireBoundedString(value, label, 20, 40);
  if (Number.isNaN(Date.parse(text))) throw approvalError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_INVALID_TIME", `${label} must be ISO time`);
  return text;
}
function uniqueStringArray(value, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw approvalError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_INVALID_ARRAY", `${label} must have ${min}-${max} items`);
  const items = value.map((item, index) => requireBoundedString(item, `${label}[${index}]`, 1, 360));
  if (new Set(items).size !== items.length) throw approvalError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_DUPLICATE_ARRAY", `${label} must be unique`);
  return items;
}
function requireExactSet(value, label, expected) {
  const items = uniqueStringArray(value, label, expected.length, expected.length).sort();
  const sorted = [...expected].sort();
  if (items.join("\u0000") !== sorted.join("\u0000")) throw approvalError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_SET_MISMATCH", `${label} must equal ${expected.join(", ")}`);
  return expected;
}
function rejectLeakedFields(value, label) {
  if (!value || typeof value !== "object") return;
  for (const field of leakedFieldNames) {
    if (Object.hasOwn(value, field)) throw approvalError("TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_LEAKED_FIELD", `${label}.${field} is not allowed`);
  }
}
function hashInput(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function safeToken(value) { return String(value).replace(/[^A-Za-z0-9_-]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 180); }
function approvalError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
