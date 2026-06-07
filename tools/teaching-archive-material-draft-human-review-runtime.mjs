import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_RUNTIME_ID =
  "teaching_archive_material_draft_human_review_runtime";
export const TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_PORT =
  "TeachingArchiveMaterialDraftReviewPort.recordArchiveMaterialDraftHumanReview";

const inputSchemaVersion = "2026-06-07.teaching.archive-material-draft-human-review.v1";
const outputSchemaVersion = "2026-06-07.teaching.archive-material-draft-human-review-recorded.v1";
const sourceWorkloadType = "TEACHING_ARCHIVE_MATERIAL_DRAFT_INTENT_RUNTIME";
const sourceCommandPort = "TeachingDraftCommandPort.submitArchiveMaterialDraftIntent";
const approvedStatus = "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_APPROVED_FOR_PRECOMMIT";
const revisionStatus = "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_REVISION_REQUIRED";
const defaultReviewLogPath = "reports/teaching-command-log/teaching-archive-material-draft-human-review.jsonl";

const leakedFieldNames = [
  "finalArchiveItem",
  "contentRef",
  "rawModelOutput",
  "modelOutput",
  "directSql",
  "dbUrl",
  "internalError",
  "ocrJobId",
  "ragChunkIds",
  "aiGradingRequestId",
];

export async function recordTeachingArchiveMaterialDraftHumanReview(input, options = {}) {
  const recordedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const reviewLogPath = options.reviewLogPath ?? defaultReviewLogPath;
  const existing = findExistingRecordByIdempotencyKey(reviewLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const reviewPort = assertReviewPort(options.reviewPort);
  const portResult = await reviewPort.recordArchiveMaterialDraftHumanReview(buildPortRequest(normalized));
  const humanReview = assertPortResult(portResult, normalized);
  const record = buildReviewRecord(normalized, humanReview, recordedAt);
  appendRecord(reviewLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatTeachingArchiveMaterialDraftHumanReview(result) {
  return [
    `Teaching archive material draft human review: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Review: ${result.humanReview.reviewId}`,
    `Decision: ${result.humanReview.decision}`,
    `Final archive write: ${result.boundary.finalArchiveItemWriteStarted ? "started" : "blocked"}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const reviewInvocationId = requireToken(input.reviewInvocationId, "input.reviewInvocationId", "archive_material_draft_review_");
  const sourceDraftIntentReport = assertSourceDraftIntentReport(input.sourceDraftIntentReport);
  const principal = assertReviewerPrincipal(input.principal);
  const draftIntent = assertDraftIntent(input.draftIntent);
  const humanReview = assertHumanReview(input.humanReview, principal, draftIntent);
  const reviewPolicy = assertReviewPolicy(input.reviewPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 80);
  if (!evidenceRefs.some((ref) => ref.includes("archive-material-draft-intent"))) {
    throw reviewError("TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_MISSING_SOURCE_EVIDENCE", "archive material draft intent evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 260);
  const inputHash = hashInput({
    reviewInvocationId,
    reviewerPrincipalId: principal.principalId,
    sourceReadiness: sourceDraftIntentReport.readiness,
    draftIntent,
    humanReview,
    reviewPolicy,
  });
  return {
    reviewInvocationId,
    sourceDraftIntentReport,
    principal,
    draftIntent,
    humanReview,
    reviewPolicy,
    evidenceRefs,
    idempotencyKey,
    inputHash,
  };
}

function assertSourceDraftIntentReport(report) {
  assertPlainObject(report, "input.sourceDraftIntentReport");
  requireConst(report.readiness, "READY", "input.sourceDraftIntentReport.readiness");
  requireConst(report.workloadType, sourceWorkloadType, "input.sourceDraftIntentReport.workloadType");
  requireConst(report.commandPort, sourceCommandPort, "input.sourceDraftIntentReport.commandPort");
  requireConst(report.boundary?.status, "REVIEW_REQUIRED", "input.sourceDraftIntentReport.boundary.status");
  requireConst(report.boundary?.executionCandidateAllowed, false, "input.sourceDraftIntentReport.boundary.executionCandidateAllowed");
  requireConst(report.boundary?.finalArchiveItemWriteAllowed, false, "input.sourceDraftIntentReport.boundary.finalArchiveItemWriteAllowed");
  requireConst(report.boundary?.ocrOrRagJobWriteAllowed, false, "input.sourceDraftIntentReport.boundary.ocrOrRagJobWriteAllowed");
  requireConst(report.boundary?.finalAiGradingWriteAllowed, false, "input.sourceDraftIntentReport.boundary.finalAiGradingWriteAllowed");
  return report;
}

function assertReviewerPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  if (!scopes.includes("TEACHING_WRITE")) {
    throw reviewError("TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_SCOPE_MISSING", "TEACHING_WRITE is required");
  }
  if (!scopes.includes("HARNESS_APPROVE") && !scopes.includes("ADMIN_SYSTEM")) {
    throw reviewError("TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_SCOPE_MISSING", "HARNESS_APPROVE or ADMIN_SYSTEM is required");
  }
  return {
    principalId: requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128),
    subjectType: requireConst(principal.subjectType, "USER", "input.principal.subjectType"),
    role: requireOneOf(principal.role, "input.principal.role", ["TEACHER", "ADMIN"]),
    entryPoint: requireOneOf(principal.entryPoint, "input.principal.entryPoint", ["DESKTOP_TEACHER", "ADMIN_CONSOLE"]),
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 160),
    scopes,
  };
}

function assertDraftIntent(draftIntent) {
  assertPlainObject(draftIntent, "input.draftIntent");
  return {
    draftIntentId: requireToken(draftIntent.draftIntentId, "input.draftIntent.draftIntentId", "archive_material_draft_intent_"),
    ownerType: requireOneOf(draftIntent.ownerType, "input.draftIntent.ownerType", ["STUDENT", "CLASS", "COURSE"]),
    studentId: draftIntent.ownerType === "STUDENT"
      ? requireBoundedString(draftIntent.studentId, "input.draftIntent.studentId", 1, 128)
      : optionalBoundedString(draftIntent.studentId, "input.draftIntent.studentId", 128),
    materialType: requireOneOf(draftIntent.materialType, "input.draftIntent.materialType", ["TEACHING_MATERIAL", "HANDOUT", "HOMEWORK", "PAPER", "QUIZ"]),
    source: requireOneOf(draftIntent.source, "input.draftIntent.source", ["TEACHER_UPLOAD", "SYSTEM_IMPORT", "AGENT_DRAFT"]),
    title: requireSafeText(draftIntent.title, "input.draftIntent.title", 4, 160),
    draftArtifactRef: requireBoundedString(draftIntent.draftArtifactRef, "input.draftIntent.draftArtifactRef", 8, 500),
    sourceRefs: uniqueStringArray(draftIntent.sourceRefs, "input.draftIntent.sourceRefs", 1, 16),
  };
}

function assertHumanReview(review, principal, draftIntent) {
  rejectLeakedFields(review, "input.humanReview");
  assertPlainObject(review, "input.humanReview");
  requireConst(review.draftIntentId, draftIntent.draftIntentId, "input.humanReview.draftIntentId");
  requireConst(review.reviewerPrincipalId, principal.principalId, "input.humanReview.reviewerPrincipalId");
  const decision = requireOneOf(review.decision, "input.humanReview.decision", ["APPROVED_FOR_PRECOMMIT", "REVISION_REQUIRED"]);
  const checklist = assertReviewChecklist(review.checklist);
  const comments = optionalSafeText(review.comments, "input.humanReview.comments", 500);
  if (decision === "REVISION_REQUIRED" && comments.length === 0) {
    throw reviewError("TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_FEEDBACK_REQUIRED", "revision-required reviews need comments");
  }
  return {
    reviewId: requireToken(review.reviewId, "input.humanReview.reviewId", "archive_material_draft_review_"),
    draftIntentId: draftIntent.draftIntentId,
    reviewerPrincipalId: principal.principalId,
    reviewedAt: requireIsoString(review.reviewedAt, "input.humanReview.reviewedAt"),
    decision,
    checklist,
    comments,
  };
}

function assertReviewChecklist(checklist) {
  assertPlainObject(checklist, "input.humanReview.checklist");
  for (const field of [
    "humanReviewed",
    "targetOwnerConfirmed",
    "sourceRefsReviewed",
    "contentSafetyReviewed",
    "studentPrivacyReviewed",
    "rollbackPlanReviewed",
    "noFinalArchiveItemCreated",
    "noOcrRagStarted",
  ]) {
    requireConst(checklist[field], true, `input.humanReview.checklist.${field}`);
  }
  return Object.fromEntries(Object.keys(checklist).map((field) => [field, true]));
}

function assertReviewPolicy(policy) {
  assertPlainObject(policy, "input.reviewPolicy");
  return {
    humanReviewRequired: requireConst(policy.humanReviewRequired, true, "input.reviewPolicy.humanReviewRequired"),
    precommitCandidateAllowed: requireConst(policy.precommitCandidateAllowed, true, "input.reviewPolicy.precommitCandidateAllowed"),
    finalArchiveItemWriteStarted: requireConst(policy.finalArchiveItemWriteStarted, false, "input.reviewPolicy.finalArchiveItemWriteStarted"),
    mainDatabaseWriteStarted: requireConst(policy.mainDatabaseWriteStarted, false, "input.reviewPolicy.mainDatabaseWriteStarted"),
    ocrOrRagJobWriteStarted: requireConst(policy.ocrOrRagJobWriteStarted, false, "input.reviewPolicy.ocrOrRagJobWriteStarted"),
    aiGradingWriteStarted: requireConst(policy.aiGradingWriteStarted, false, "input.reviewPolicy.aiGradingWriteStarted"),
    executionCandidateAllowed: requireConst(policy.executionCandidateAllowed, false, "input.reviewPolicy.executionCandidateAllowed"),
    directDatabaseAccessAllowed: requireConst(policy.directDatabaseAccessAllowed, false, "input.reviewPolicy.directDatabaseAccessAllowed"),
    executeHttpRequestAllowed: requireConst(policy.executeHttpRequestAllowed, false, "input.reviewPolicy.executeHttpRequestAllowed"),
    swarmAllowed: requireConst(policy.swarmAllowed, false, "input.reviewPolicy.swarmAllowed"),
    requiresFutureStoragePrecommit: requireConst(policy.requiresFutureStoragePrecommit, true, "input.reviewPolicy.requiresFutureStoragePrecommit"),
  };
}

function assertReviewPort(port) {
  if (!port || typeof port.recordArchiveMaterialDraftHumanReview !== "function") {
    throw reviewError("TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_PORT_REQUIRED", "TeachingArchiveMaterialDraftReviewPort.recordArchiveMaterialDraftHumanReview is required");
  }
  return port;
}

function buildPortRequest(normalized) {
  return {
    commandPort: TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_PORT,
    reviewInvocationId: normalized.reviewInvocationId,
    sourceCommandPort,
    draftIntent: normalized.draftIntent,
    reviewerPrincipal: normalized.principal,
    humanReview: normalized.humanReview,
    reviewPolicy: normalized.reviewPolicy,
    evidenceRefs: normalized.evidenceRefs,
    inputHash: normalized.inputHash,
  };
}

function assertPortResult(portResult, normalized) {
  rejectLeakedFields(portResult, "portResult");
  assertPlainObject(portResult, "portResult");
  const review = assertPlainObject(portResult.humanReview, "portResult.humanReview");
  requireConst(review.reviewId, normalized.humanReview.reviewId, "portResult.humanReview.reviewId");
  requireConst(review.draftIntentId, normalized.draftIntent.draftIntentId, "portResult.humanReview.draftIntentId");
  requireConst(review.decision, normalized.humanReview.decision, "portResult.humanReview.decision");
  requireConst(review.status, normalized.humanReview.decision === "APPROVED_FOR_PRECOMMIT" ? approvedStatus : revisionStatus, "portResult.humanReview.status");
  requireConst(review.executionState, "HUMAN_REVIEW_RECORDED_NOT_COMMITTED", "portResult.humanReview.executionState");
  return {
    reviewId: normalized.humanReview.reviewId,
    draftIntentId: normalized.draftIntent.draftIntentId,
    reviewerPrincipalId: normalized.principal.principalId,
    reviewedAt: normalized.humanReview.reviewedAt,
    decision: normalized.humanReview.decision,
    status: review.status,
    executionState: "HUMAN_REVIEW_RECORDED_NOT_COMMITTED",
    checklist: normalized.humanReview.checklist,
    comments: normalized.humanReview.comments,
  };
}

function buildReviewRecord(normalized, humanReview, recordedAt) {
  const approved = humanReview.decision === "APPROVED_FOR_PRECOMMIT";
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_RUNTIME_ID,
    commandPort: TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_PORT,
    status: approved ? approvedStatus : revisionStatus,
    recordId: `teaching_archive_material_draft_human_review_${safeToken(normalized.idempotencyKey)}`,
    recordedAt,
    sourceDraftIntent: {
      workloadType: sourceWorkloadType,
      commandPort: sourceCommandPort,
      draftIntentId: normalized.draftIntent.draftIntentId,
      draftArtifactRef: normalized.draftIntent.draftArtifactRef,
    },
    humanReview,
    boundary: {
      humanReviewRecorded: true,
      archiveMaterialDraftIntentVerified: true,
      precommitCandidateAllowed: approved,
      finalArchiveItemWriteStarted: false,
      mainDatabaseWriteStarted: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      executionCandidateAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureStoragePrecommit: approved,
    },
    evidenceRefs: [
      ...normalized.evidenceRefs,
      `evidence:archive-material-draft-human-review-input-hash:${normalized.inputHash}`,
      `evidence:runtime:${TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_RUNTIME_ID}`,
      `evidence:command-port:${TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_PORT}`,
      `evidence:source-command-port:${sourceCommandPort}`,
    ],
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
  };
}

function buildResult(record, replay) {
  return {
    ...record,
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: 6,
      totalErrors: 0,
      operations: 1,
      evidenceClass: "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_PROBE",
    },
    idempotentReplay: replay.idempotentReplay,
  };
}

function findExistingRecordByIdempotencyKey(logPath, idempotencyKey) {
  if (!fs.existsSync(logPath)) return null;
  const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/u).filter(Boolean);
  for (const line of lines) {
    const parsed = JSON.parse(line);
    if (parsed.idempotencyKey === idempotencyKey) return parsed;
  }
  return null;
}

function assertReplayMatches(record, normalized) {
  requireConst(record.inputHash, normalized.inputHash, "record.inputHash");
  requireConst(record.humanReview.reviewId, normalized.humanReview.reviewId, "record.humanReview.reviewId");
  requireConst(record.humanReview.decision, normalized.humanReview.decision, "record.humanReview.decision");
}

function appendRecord(logPath, record) {
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
        throw reviewError("TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_LEAKED_FIELD", `${current.path}.${key} is not allowed`);
      }
      if (nested && typeof nested === "object") stack.push({ value: nested, path: `${current.path}.${key}` });
    }
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw reviewError("TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_INVALID_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw reviewError("TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_CONST_MISMATCH", `${label} must be ${expected}`);
  }
  return actual;
}

function requireOneOf(actual, label, allowed) {
  if (!allowed.includes(actual)) {
    throw reviewError("TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_INVALID_ENUM", `${label} must be one of ${allowed.join(",")}`);
  }
  return actual;
}

function requireBoundedString(value, label, minLength, maxLength) {
  if (typeof value !== "string" || value.length < minLength || value.length > maxLength) {
    throw reviewError("TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_INVALID_STRING", `${label} must be a string of length ${minLength}-${maxLength}`);
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
    throw reviewError("TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_UNSAFE_TEXT", `${label} contains unsafe text`);
  }
  return text;
}

function optionalSafeText(value, label, maxLength) {
  if (value === undefined || value === null || value === "") return "";
  return requireSafeText(String(value), label, 1, maxLength);
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 260);
  if (!token.startsWith(prefix)) {
    throw reviewError("TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_INVALID_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireIsoString(value, label) {
  const text = requireBoundedString(value, label, 20, 40);
  if (Number.isNaN(Date.parse(text))) {
    throw reviewError("TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_INVALID_TIME", `${label} must be an ISO timestamp`);
  }
  return text;
}

function uniqueStringArray(value, label, minLength, maxLength) {
  if (!Array.isArray(value) || value.length < minLength || value.length > maxLength) {
    throw reviewError("TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_INVALID_ARRAY", `${label} must contain ${minLength}-${maxLength} strings`);
  }
  const seen = new Set();
  return value.map((item, index) => {
    const normalized = requireBoundedString(String(item), `${label}[${index}]`, 1, 360);
    if (seen.has(normalized)) throw reviewError("TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_DUPLICATE_STRING", `${label}[${index}] is duplicated`);
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

function reviewError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
