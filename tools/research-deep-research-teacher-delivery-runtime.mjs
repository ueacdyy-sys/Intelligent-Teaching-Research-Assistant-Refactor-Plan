import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_RUNTIME_ID = "research_deep_research_teacher_delivery_runtime";
export const RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_COMMAND_PORT = "DeepResearchTeacherDeliveryPort.recordTeacherDeliveryPackage";
export const RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_READY = "RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_READY";

const inputSchemaVersion = "2026-06-05.research.deep-research-teacher-delivery.v1";
const outputSchemaVersion = "2026-06-05.research.deep-research-teacher-delivery-recorded.v1";
const precheckSchemaVersion = "2026-06-05.research.deep-research-publication-precheck-recorded.v1";
const renderPreviewSchemaVersion = "2026-06-05.research.deep-research-render-preview-recorded.v1";
const defaultCommandLogPath = "reports/research-command-log/deep-research-teacher-delivery.jsonl";

export function recordDeepResearchTeacherDelivery(input, options = {}) {
  const recordedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const commandLogPath = options.commandLogPath ?? defaultCommandLogPath;
  const existing = findExistingRecordByIdempotencyKey(commandLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const record = buildCommandRecord(normalized, recordedAt);
  appendCommandRecord(commandLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatDeepResearchTeacherDelivery(result) {
  return [
    `Research deep_research teacher delivery: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Job: ${result.job.jobId}`,
    `Package: ${result.teacherDeliveryPackage.packageId}`,
    `Student visible: ${result.boundary.studentVisible}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const deliveryInvocationId = requireString(input.deliveryInvocationId, "input.deliveryInvocationId");
  const principal = assertPrincipal(input.principal);
  const publicationPrecheckRecord = assertPublicationPrecheckRecord(input.publicationPrecheckRecord);
  const renderPreviewRecord = assertRenderPreviewRecord(input.renderPreviewRecord);
  assertRecordsMatch(publicationPrecheckRecord, renderPreviewRecord);
  const deliveryPolicy = assertDeliveryPolicy(input.deliveryPolicy);
  const teacherDeliveryPackage = assertTeacherDeliveryPackage(input.teacherDeliveryPackage);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 100);
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 220);
  const deliveryInputHash = hashInput({
    deliveryInvocationId,
    principalId: principal.principalId,
    precheckRecordId: publicationPrecheckRecord.recordId,
    renderPreviewRecordId: renderPreviewRecord.recordId,
    teacherDeliveryPackage,
    deliveryPolicy,
  });
  return {
    deliveryInvocationId,
    principal,
    publicationPrecheckRecord,
    renderPreviewRecord,
    deliveryPolicy,
    teacherDeliveryPackage,
    evidenceRefs,
    idempotencyKey,
    deliveryInputHash,
  };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const principalId = requireString(principal.principalId, "input.principal.principalId");
  const role = requireString(principal.role, "input.principal.role");
  const subjectType = requireString(principal.subjectType, "input.principal.subjectType");
  const entryPoint = requireString(principal.entryPoint, "input.principal.entryPoint");
  const sessionId = requireString(principal.sessionId, "input.principal.sessionId");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  const isHuman = subjectType === "USER" && role !== "STUDENT" && role !== "SERVICE";
  const isTeacherResearch = role === "TEACHER" && entryPoint === "DESKTOP_RESEARCH";
  const isAdmin = role === "ADMIN" && scopes.includes("ADMIN_SYSTEM");
  if (!isHuman || (!isTeacherResearch && !isAdmin)) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_FORBIDDEN_PRINCIPAL", "teacher delivery requires a human research teacher or admin");
  }
  if (!hasAny(scopes, ["RESEARCH_READ", "ADMIN_SYSTEM"])) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_MISSING_RESEARCH_READ", "RESEARCH_READ or ADMIN_SYSTEM scope is required");
  }
  if (!hasAny(scopes, ["RESEARCH_WRITE", "ADMIN_SYSTEM"])) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_MISSING_RESEARCH_WRITE", "RESEARCH_WRITE or ADMIN_SYSTEM scope is required");
  }
  return { principalId, role, subjectType, entryPoint, sessionId, scopes };
}

function assertPublicationPrecheckRecord(record) {
  assertPlainObject(record, "input.publicationPrecheckRecord");
  requireConst(record.schemaVersion, precheckSchemaVersion, "input.publicationPrecheckRecord.schemaVersion");
  requireConst(record.runtimeId, "research_deep_research_publication_precheck_runtime", "input.publicationPrecheckRecord.runtimeId");
  requireConst(record.commandPort, "DeepResearchPublicationPrecheckPort.recordDeepResearchPublicationPrecheck", "input.publicationPrecheckRecord.commandPort");
  requireConst(record.status, "PUBLICATION_PRECHECK_APPROVED_NOT_DELIVERED", "input.publicationPrecheckRecord.status");
  const recordId = requireString(record.recordId, "input.publicationPrecheckRecord.recordId");
  const job = assertJob(record.job, "input.publicationPrecheckRecord.job");
  const precheck = assertPrecheck(record.precheck);
  const evidenceRefs = uniqueStringArray(record.evidenceRefs, "input.publicationPrecheckRecord.evidenceRefs", 1, 260);
  assertPrecheckBoundary(record.boundary);
  return { ...record, recordId, job, precheck, evidenceRefs };
}

function assertPrecheck(precheck) {
  assertPlainObject(precheck, "input.publicationPrecheckRecord.precheck");
  requireConst(precheck.decision, "APPROVED_FOR_DELIVERY_RUNTIME", "input.publicationPrecheckRecord.precheck.decision");
  requireConst(precheck.approvedForFutureDelivery, true, "input.publicationPrecheckRecord.precheck.approvedForFutureDelivery");
  requireConst(precheck.revisionRequired, false, "input.publicationPrecheckRecord.precheck.revisionRequired");
  const risk = assertRisk(precheck.risk);
  return {
    precheckId: requireString(precheck.precheckId, "input.publicationPrecheckRecord.precheck.precheckId"),
    reviewerPrincipalId: requireString(precheck.reviewerPrincipalId, "input.publicationPrecheckRecord.precheck.reviewerPrincipalId"),
    decision: "APPROVED_FOR_DELIVERY_RUNTIME",
    approvedForFutureDelivery: true,
    revisionRequired: false,
    previewId: requireString(precheck.previewId, "input.publicationPrecheckRecord.precheck.previewId"),
    artifactId: requireString(precheck.artifactId, "input.publicationPrecheckRecord.precheck.artifactId"),
    claimCount: requireIntegerBetween(precheck.claimCount, "input.publicationPrecheckRecord.precheck.claimCount", 1, 200),
    citationCount: requireIntegerBetween(precheck.citationCount, "input.publicationPrecheckRecord.precheck.citationCount", 1, 500),
    sourceHashCount: requireIntegerBetween(precheck.sourceHashCount, "input.publicationPrecheckRecord.precheck.sourceHashCount", 1, 500),
    risk,
    comments: requireSafeText(precheck.comments, "input.publicationPrecheckRecord.precheck.comments"),
  };
}

function assertRisk(risk) {
  assertPlainObject(risk, "input.publicationPrecheckRecord.precheck.risk");
  const normalized = {
    hallucinationRisk: requireEnum(risk.hallucinationRisk, "input.publicationPrecheckRecord.precheck.risk.hallucinationRisk", ["LOW", "MEDIUM", "HIGH"]),
    privateKnowledgeRisk: requireEnum(risk.privateKnowledgeRisk, "input.publicationPrecheckRecord.precheck.risk.privateKnowledgeRisk", ["LOW", "MEDIUM", "HIGH"]),
    studentDataRisk: requireEnum(risk.studentDataRisk, "input.publicationPrecheckRecord.precheck.risk.studentDataRisk", ["LOW", "MEDIUM", "HIGH"]),
    publicationRisk: requireEnum(risk.publicationRisk, "input.publicationPrecheckRecord.precheck.risk.publicationRisk", ["LOW", "MEDIUM", "HIGH"]),
  };
  if (Object.values(normalized).includes("HIGH")) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_HIGH_RISK_PRECHECK", "teacher delivery cannot consume a HIGH risk precheck");
  }
  return normalized;
}

function assertPrecheckBoundary(boundary) {
  assertPlainObject(boundary, "input.publicationPrecheckRecord.boundary");
  for (const field of [
    "renderPreviewVerified",
    "humanPublicationPrecheckRecorded",
    "evidenceIntegrityReviewed",
    "safetyReviewed",
    "studentVisibilityReviewed",
    "approvedForFutureDelivery",
    "requiresFutureDeliveryRuntime",
  ]) {
    requireConst(boundary[field], true, `input.publicationPrecheckRecord.boundary.${field}`);
  }
  requireConst(boundary.revisionRequired, false, "input.publicationPrecheckRecord.boundary.revisionRequired");
  for (const field of deniedBoundaryFields()) {
    requireConst(boundary[field], false, `input.publicationPrecheckRecord.boundary.${field}`);
  }
}

function assertRenderPreviewRecord(record) {
  assertPlainObject(record, "input.renderPreviewRecord");
  requireConst(record.schemaVersion, renderPreviewSchemaVersion, "input.renderPreviewRecord.schemaVersion");
  requireConst(record.runtimeId, "research_deep_research_render_preview_runtime", "input.renderPreviewRecord.runtimeId");
  requireConst(record.commandPort, "DeepResearchRenderPreviewPort.recordDeepResearchRenderPreview", "input.renderPreviewRecord.commandPort");
  requireConst(record.status, "RENDER_PREVIEW_READY_NOT_PUBLISHED", "input.renderPreviewRecord.status");
  const recordId = requireString(record.recordId, "input.renderPreviewRecord.recordId");
  const job = assertJob(record.job, "input.renderPreviewRecord.job");
  const preview = assertPreview(record.preview);
  const evidenceRefs = uniqueStringArray(record.evidenceRefs, "input.renderPreviewRecord.evidenceRefs", 1, 260);
  assertRenderPreviewBoundary(record.boundary);
  return { ...record, recordId, job, preview, evidenceRefs };
}

function assertPreview(preview) {
  assertPlainObject(preview, "input.renderPreviewRecord.preview");
  requireConst(preview.previewKind, "EVIDENCE_GROUNDED_RESEARCH_PREVIEW", "input.renderPreviewRecord.preview.previewKind");
  requireConst(preview.audience, "TEACHER_REVIEW", "input.renderPreviewRecord.preview.audience");
  requireConst(preview.format, "SAFE_TEXT_BLOCKS", "input.renderPreviewRecord.preview.format");
  requireConst(preview.deliveryState, "PREVIEW_READY_NOT_PUBLISHED", "input.renderPreviewRecord.preview.deliveryState");
  const claims = assertClaims(preview.claims);
  const limitations = uniqueBoundedStringArray(preview.limitations, "input.renderPreviewRecord.preview.limitations", 1, 12, 1, 600);
  const integrity = assertIntegrity(preview.integrity, claims);
  return {
    previewId: requireString(preview.previewId, "input.renderPreviewRecord.preview.previewId"),
    title: requireSafeText(preview.title, "input.renderPreviewRecord.preview.title"),
    summary: requireSafeText(preview.summary, "input.renderPreviewRecord.preview.summary"),
    claims,
    limitations,
    finalization: {
      artifactId: requireString(preview.finalization?.artifactId, "input.renderPreviewRecord.preview.finalization.artifactId"),
      finalizerPrincipalId: requireString(preview.finalization?.finalizerPrincipalId, "input.renderPreviewRecord.preview.finalization.finalizerPrincipalId"),
      deliveryState: requireConst(preview.finalization?.deliveryState, "FINALIZED_NOT_PUBLISHED", "input.renderPreviewRecord.preview.finalization.deliveryState"),
    },
    integrity,
  };
}

function assertClaims(claims) {
  if (!Array.isArray(claims) || claims.length < 1 || claims.length > 200) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_INVALID_PREVIEW", "preview claims must contain 1-200 items");
  }
  return claims.map((claim, index) => {
    assertPlainObject(claim, `input.renderPreviewRecord.preview.claims[${index}]`);
    const sourceHashes = uniqueBoundedStringArray(claim.sourceHashes, `input.renderPreviewRecord.preview.claims[${index}].sourceHashes`, 1, 20, 71, 71);
    for (const sourceHash of sourceHashes) {
      if (!/^sha256:[a-f0-9]{64}$/u.test(sourceHash)) {
        throw deliveryError("RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_INVALID_SOURCE_HASH", "preview sourceHashes must be sha256 digests");
      }
    }
    return {
      claimId: requireString(claim.claimId, `input.renderPreviewRecord.preview.claims[${index}].claimId`),
      text: requireSafeText(claim.text, `input.renderPreviewRecord.preview.claims[${index}].text`),
      citations: uniqueBoundedStringArray(claim.citations, `input.renderPreviewRecord.preview.claims[${index}].citations`, 1, 20, 4, 400),
      sourceHashes,
      supportChunkIds: uniqueBoundedStringArray(claim.supportChunkIds, `input.renderPreviewRecord.preview.claims[${index}].supportChunkIds`, 1, 40, 1, 160),
      confidence: requireNumberBetween(claim.confidence, `input.renderPreviewRecord.preview.claims[${index}].confidence`, 0, 1),
      evidencePreserved: requireConst(claim.evidencePreserved, true, `input.renderPreviewRecord.preview.claims[${index}].evidencePreserved`),
    };
  });
}

function assertIntegrity(integrity, claims) {
  assertPlainObject(integrity, "input.renderPreviewRecord.preview.integrity");
  const claimCount = requireIntegerBetween(integrity.claimCount, "input.renderPreviewRecord.preview.integrity.claimCount", 1, 200);
  const citationCount = requireIntegerBetween(integrity.citationCount, "input.renderPreviewRecord.preview.integrity.citationCount", 1, 500);
  const sourceHashCount = requireIntegerBetween(integrity.sourceHashCount, "input.renderPreviewRecord.preview.integrity.sourceHashCount", 1, 500);
  const actualCitationCount = new Set(claims.flatMap((claim) => claim.citations)).size;
  const actualSourceHashCount = new Set(claims.flatMap((claim) => claim.sourceHashes)).size;
  if (claimCount !== claims.length || citationCount !== actualCitationCount || sourceHashCount !== actualSourceHashCount) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_INTEGRITY_MISMATCH", "preview integrity counts must match claims");
  }
  requireConst(integrity.unsafeTextEncoded, true, "input.renderPreviewRecord.preview.integrity.unsafeTextEncoded");
  return { claimCount, citationCount, sourceHashCount, unsafeTextEncoded: true };
}

function assertRenderPreviewBoundary(boundary) {
  assertPlainObject(boundary, "input.renderPreviewRecord.boundary");
  requireConst(boundary.renderPreviewRecorded, true, "input.renderPreviewRecord.boundary.renderPreviewRecorded");
  requireConst(boundary.requiresFuturePublicationReview, true, "input.renderPreviewRecord.boundary.requiresFuturePublicationReview");
  for (const field of deniedBoundaryFields()) {
    requireConst(boundary[field], false, `input.renderPreviewRecord.boundary.${field}`);
  }
}

function assertRecordsMatch(precheck, preview) {
  if (precheck.job.jobId !== preview.job.jobId || precheck.job.taskId !== preview.job.taskId || precheck.job.contextRef !== preview.job.contextRef) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_JOB_MISMATCH", "publication precheck and render preview must reference the same job");
  }
  if (precheck.precheck.previewId !== preview.preview.previewId || precheck.precheck.artifactId !== preview.preview.finalization.artifactId) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_PREVIEW_MISMATCH", "publication precheck must approve the supplied render preview");
  }
  if (precheck.precheck.claimCount !== preview.preview.integrity.claimCount ||
    precheck.precheck.citationCount !== preview.preview.integrity.citationCount ||
    precheck.precheck.sourceHashCount !== preview.preview.integrity.sourceHashCount) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_COUNT_MISMATCH", "precheck counts must match the render preview");
  }
}

function assertDeliveryPolicy(policy) {
  assertPlainObject(policy, "input.deliveryPolicy");
  for (const field of [
    "publicationPrecheckRequired",
    "renderPreviewRequired",
    "teacherDeliveryAllowed",
    "preserveEvidenceRequired",
    "preserveSourceHashesRequired",
    "preserveLimitationsRequired",
    "futureStudentDeliveryReviewRequired",
  ]) {
    requireConst(policy[field], true, `input.deliveryPolicy.${field}`);
  }
  for (const field of [
    "studentVisibleDeliveryAllowed",
    "directPublicationAllowed",
    "directDatabaseAccessAllowed",
    "mainDatabaseWriteAllowed",
    "studentArchiveWriteAllowed",
    "externalModelCallAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.deliveryPolicy.${field}`);
  }
  return { ...policy };
}

function assertTeacherDeliveryPackage(pkg) {
  assertPlainObject(pkg, "input.teacherDeliveryPackage");
  return {
    packageId: requireString(pkg.packageId, "input.teacherDeliveryPackage.packageId"),
    packageKind: requireConst(pkg.packageKind, "EVIDENCE_GROUNDED_TEACHER_DELIVERY_PACKAGE", "input.teacherDeliveryPackage.packageKind"),
    audience: requireConst(pkg.audience, "TEACHER_RESEARCH", "input.teacherDeliveryPackage.audience"),
    channel: requireConst(pkg.channel, "DESKTOP_RESEARCH", "input.teacherDeliveryPackage.channel"),
    format: requireConst(pkg.format, "SAFE_TEXT_BLOCKS", "input.teacherDeliveryPackage.format"),
    deliveryState: requireConst(pkg.deliveryState, "TEACHER_READY_NOT_STUDENT_VISIBLE", "input.teacherDeliveryPackage.deliveryState"),
    title: requireSafeText(pkg.title, "input.teacherDeliveryPackage.title"),
    summary: requireSafeText(pkg.summary, "input.teacherDeliveryPackage.summary"),
    teacherNotes: requireSafeText(pkg.teacherNotes, "input.teacherDeliveryPackage.teacherNotes"),
  };
}

function buildCommandRecord(normalized, recordedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY",
    recordId: `research_deep_research_teacher_delivery_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    runtimeId: RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_RUNTIME_ID,
    commandPort: RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_COMMAND_PORT,
    status: "TEACHER_DELIVERY_PACKAGE_READY_NOT_STUDENT_VISIBLE",
    deliveryInvocationId: normalized.deliveryInvocationId,
    principal: normalized.principal,
    job: normalized.publicationPrecheckRecord.job,
    teacherDeliveryPackage: buildPackage(normalized),
    evidence: {
      evidenceRefs: uniq([
        ...normalized.evidenceRefs,
        ...normalized.publicationPrecheckRecord.evidenceRefs,
        ...normalized.renderPreviewRecord.evidenceRefs,
        `evidence:teacher-delivery-input-hash:${normalized.deliveryInputHash}`,
        `evidence:runtime:${RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_RUNTIME_ID}`,
        `evidence:command-port:${RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_COMMAND_PORT}`,
        `evidence:publication-precheck-record:${normalized.publicationPrecheckRecord.recordId}`,
        `evidence:render-preview-record:${normalized.renderPreviewRecord.recordId}`,
      ]),
      idempotencyKey: normalized.idempotencyKey,
      deliveryInputHash: normalized.deliveryInputHash,
    },
    boundary: buildBoundary(),
  };
}

function buildPackage(normalized) {
  const preview = normalized.renderPreviewRecord.preview;
  return {
    ...normalized.teacherDeliveryPackage,
    previewId: preview.previewId,
    artifactId: preview.finalization.artifactId,
    precheckId: normalized.publicationPrecheckRecord.precheck.precheckId,
    reviewerPrincipalId: normalized.publicationPrecheckRecord.precheck.reviewerPrincipalId,
    claimCount: preview.integrity.claimCount,
    citationCount: preview.integrity.citationCount,
    sourceHashCount: preview.integrity.sourceHashCount,
    claims: preview.claims,
    limitations: preview.limitations,
    risk: normalized.publicationPrecheckRecord.precheck.risk,
  };
}

function buildBoundary() {
  return {
    renderPreviewVerified: true,
    publicationPrecheckVerified: true,
    teacherDeliveryPackageRecorded: true,
    teacherAccessible: true,
    evidenceIntegrityPreserved: true,
    sourceHashIntegrityPreserved: true,
    limitationsPreserved: true,
    finalAnswerPublished: false,
    publicationCandidateCreated: false,
    studentVisible: false,
    directPublicationAllowed: false,
    externalModelCallStarted: false,
    mainDatabaseWriteStarted: false,
    studentArchiveWriteStarted: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
    requiresFutureStudentDeliveryReview: true,
    requiresFuturePersistenceReview: true,
  };
}

function buildResult(record, options) {
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: record.runtimeId,
    commandPort: record.commandPort,
    status: record.status,
    recordId: record.recordId,
    recordedAt: record.recordedAt,
    idempotencyKey: record.evidence.idempotencyKey,
    idempotentReplay: options.idempotentReplay === true,
    job: record.job,
    teacherDeliveryPackage: record.teacherDeliveryPackage,
    evidenceRefs: record.evidence.evidenceRefs,
    boundary: record.boundary,
    runtimeSlo: {
      targetP99Ms: 300,
      evidenceClass: "ASYNC_DEEP_RESEARCH_TEACHER_DELIVERY_BOUNDARY",
    },
    nextAction: "Show this package only in the teacher research workspace; student-visible delivery and durable persistence remain future reviewed slices.",
  };
}

function appendCommandRecord(commandLogPath, record) {
  const absolute = path.resolve(commandLogPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.appendFileSync(absolute, `${JSON.stringify(record)}\n`);
}

function findExistingRecordByIdempotencyKey(commandLogPath, idempotencyKey) {
  const absolute = path.resolve(commandLogPath);
  if (!fs.existsSync(absolute)) return null;
  const lines = fs.readFileSync(absolute, "utf8").split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const record = JSON.parse(lines[index]);
    if (record?.recordType === "RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY" &&
      record?.evidence?.idempotencyKey === idempotencyKey) {
      return record;
    }
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.deliveryInvocationId !== normalized.deliveryInvocationId ||
    existing.job?.jobId !== normalized.publicationPrecheckRecord.job.jobId ||
    existing.teacherDeliveryPackage?.packageId !== normalized.teacherDeliveryPackage.packageId ||
    existing.evidence?.deliveryInputHash !== normalized.deliveryInputHash) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different teacher delivery package");
  }
}

function assertJob(job, label) {
  assertPlainObject(job, label);
  return {
    taskId: requireString(job.taskId, `${label}.taskId`),
    contextRef: requireString(job.contextRef, `${label}.contextRef`),
    jobId: requireString(job.jobId, `${label}.jobId`),
    queueName: requireConst(job.queueName, "research_deep_research", `${label}.queueName`),
  };
}

function deniedBoundaryFields() {
  return [
    "publicationCandidateCreated",
    "finalAnswerPublished",
    "studentVisible",
    "directPublicationAllowed",
    "externalModelCallStarted",
    "mainDatabaseWriteStarted",
    "studentArchiveWriteStarted",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ];
}

function requireSafeText(value, label) {
  const text = requireBoundedString(value, label, 1, 1200);
  if (/[<>]/u.test(text)) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_UNSAFE_TEXT", `${label} must be encoded safe text`);
  }
  return text;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireBoundedString(value, label, minLength, maxLength) {
  const text = requireString(value, label);
  if (text.length < minLength || text.length > maxLength) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_INVALID_INPUT", `${label} length must be ${minLength}-${maxLength}`);
  }
  return text;
}

function requireEnum(value, label, allowed) {
  const text = requireString(value, label);
  if (!allowed.includes(text)) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_INVALID_INPUT", `${label} must be one of ${allowed.join(",")}`);
  }
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_INVALID_INPUT", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireNumberBetween(value, label, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_INVALID_INPUT", `${label} must be a number between ${min} and ${max}`);
  }
  return value;
}

function requireConst(value, expected, label) {
  if (value !== expected) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_BOUNDARY_VIOLATION", `${label} must be ${expected}`);
  }
  return expected;
}

function uniqueStringArray(value, label, minItems, maxItems) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_INVALID_INPUT", `${label} must contain ${minItems}-${maxItems} items`);
  }
  const items = value.map((item) => requireString(item, label));
  if (new Set(items).size !== items.length) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_INVALID_INPUT", `${label} must be unique`);
  }
  return items;
}

function uniqueBoundedStringArray(value, label, minItems, maxItems, minLength, maxLength) {
  return uniqueStringArray(value, label, minItems, maxItems)
    .map((item) => requireBoundedString(item, `${label}[]`, minLength, maxLength));
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw deliveryError("RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_INVALID_INPUT", `${label} must be an object`);
  }
}

function hasAny(values, candidates) {
  return candidates.some((candidate) => values.includes(candidate));
}

function hashInput(input) {
  return `sha256:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`;
}

function uniq(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
}

function safeToken(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9_-]+/gu, "_").replace(/^_+|_+$/gu, "") || "unknown";
}

function deliveryError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = "REJECTED";
  return error;
}
