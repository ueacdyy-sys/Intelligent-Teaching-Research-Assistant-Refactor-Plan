import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_RUNTIME_ID =
  "teaching_archive_material_draft_storage_precommit_runtime";
export const TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_PORT =
  "TeachingArchiveMaterialDraftStoragePrecommitPort.prepareArchiveMaterialDraftStorageCommand";

const inputSchemaVersion = "2026-06-07.teaching.archive-material-draft-storage-precommit.v1";
const outputSchemaVersion = "2026-06-07.teaching.archive-material-draft-storage-precommit-prepared.v1";
const sourceReviewWorkloadType = "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW";
const sourceReviewRuntimeId = "teaching_archive_material_draft_human_review_runtime";
const sourceReviewCommandPort = "TeachingArchiveMaterialDraftReviewPort.recordArchiveMaterialDraftHumanReview";
const approvedReviewStatus = "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_APPROVED_FOR_PRECOMMIT";
const precommitStatus = "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_READY";
const precommitExecutionState = "STORAGE_PRECOMMIT_RECORDED_NOT_COMMITTED";
const defaultPrecommitLogPath = "reports/teaching-command-log/teaching-archive-material-draft-storage-precommit.jsonl";

const leakedFieldNames = [
  "finalArchiveItem",
  "rawModelOutput",
  "modelOutput",
  "directSql",
  "dbUrl",
  "internalError",
  "ocrJobId",
  "ragChunkIds",
  "aiGradingRequestId",
  "executedAt",
  "committedAt",
];

export async function prepareTeachingArchiveMaterialDraftStoragePrecommit(input, options = {}) {
  const preparedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const precommitLogPath = options.precommitLogPath ?? defaultPrecommitLogPath;
  const existing = findExistingRecordByIdempotencyKey(precommitLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const port = assertPrecommitPort(options.storagePrecommitPort);
  const portResult = await port.prepareArchiveMaterialDraftStorageCommand(buildPortRequest(normalized));
  const precommit = assertPortResult(portResult, normalized);
  const record = buildPrecommitRecord(normalized, precommit, preparedAt);
  appendRecord(precommitLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatTeachingArchiveMaterialDraftStoragePrecommit(result) {
  return [
    `Teaching archive material draft storage precommit: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Prepared command: ${result.teachingArchiveCreateCommand.commandId}`,
    `Target table: ${result.teachingArchiveCreateCommand.targetTable}`,
    `Main DB started: ${result.boundary.mainDatabaseWriteStarted}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const precommitInvocationId = requireToken(input.precommitInvocationId, "input.precommitInvocationId", "archive_material_draft_storage_precommit_");
  const humanReview = assertHumanReviewReport(input.humanReviewReport);
  const draftIntent = assertDraftIntentSnapshot(input.draftIntentSnapshot, humanReview);
  const principal = assertStoragePrincipal(input.principal);
  const storageRequest = assertStorageRequest(input.storageRequest, draftIntent, principal);
  const storagePolicy = assertStoragePolicy(input.storagePolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 120);
  if (!evidenceRefs.some((ref) => ref.includes("archive-material-draft-human-review"))) {
    throw precommitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_MISSING_REVIEW_EVIDENCE", "human review evidence ref is required");
  }
  if (!evidenceRefs.some((ref) => ref.includes("archive-material-draft-intent"))) {
    throw precommitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_MISSING_INTENT_EVIDENCE", "draft intent evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 300);
  const storageCommand = assertStorageCommand(buildStorageCommand(precommitInvocationId, principal, humanReview, draftIntent, storageRequest));
  const inputHash = hashInput({
    precommitInvocationId,
    sourceReviewRecordId: humanReview.recordId,
    draftIntentId: draftIntent.draftIntentId,
    storageCommand,
    storagePolicy,
  });
  return {
    precommitInvocationId,
    humanReview,
    draftIntent,
    principal,
    storageRequest,
    storagePolicy,
    evidenceRefs,
    idempotencyKey,
    storageCommand,
    inputHash,
  };
}

function assertHumanReviewReport(report) {
  assertPlainObject(report, "input.humanReviewReport");
  requireConst(report.readiness, "READY", "input.humanReviewReport.readiness");
  requireConst(report.workloadType, sourceReviewWorkloadType, "input.humanReviewReport.workloadType");
  requireConst(report.runtime?.runtimeId, sourceReviewRuntimeId, "input.humanReviewReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, sourceReviewCommandPort, "input.humanReviewReport.runtime.commandPort");
  requireConst(report.runtime?.status, approvedReviewStatus, "input.humanReviewReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.humanReviewReport.runtimeSlo.totalErrors");
  const result = report.runtimeProbes?.teachingArchiveMaterialDraftHumanReview?.result;
  assertPlainObject(result, "input.humanReviewReport.runtimeProbes.result");
  requireConst(result.runtimeId, sourceReviewRuntimeId, "source.humanReview.runtimeId");
  requireConst(result.commandPort, sourceReviewCommandPort, "source.humanReview.commandPort");
  requireConst(result.status, approvedReviewStatus, "source.humanReview.status");
  requireConst(result.humanReview?.decision, "APPROVED_FOR_PRECOMMIT", "source.humanReview.decision");
  requireConst(result.humanReview?.executionState, "HUMAN_REVIEW_RECORDED_NOT_COMMITTED", "source.humanReview.executionState");
  requireConst(result.boundary?.precommitCandidateAllowed, true, "source.humanReview.boundary.precommitCandidateAllowed");
  requireConst(result.boundary?.finalArchiveItemWriteStarted, false, "source.humanReview.boundary.finalArchiveItemWriteStarted");
  requireConst(result.boundary?.mainDatabaseWriteStarted, false, "source.humanReview.boundary.mainDatabaseWriteStarted");
  requireConst(result.boundary?.ocrOrRagJobWriteStarted, false, "source.humanReview.boundary.ocrOrRagJobWriteStarted");
  requireConst(result.boundary?.aiGradingWriteStarted, false, "source.humanReview.boundary.aiGradingWriteStarted");
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "source.humanReview.recordId", 1, 360),
    sourceDraftIntent: assertPlainObject(result.sourceDraftIntent, "source.humanReview.sourceDraftIntent"),
    humanReview: assertPlainObject(result.humanReview, "source.humanReview.humanReview"),
    evidenceRefs: uniqueStringArray(result.evidenceRefs ?? [], "source.humanReview.evidenceRefs", 1, 500),
  };
}

function assertDraftIntentSnapshot(snapshot, humanReview) {
  assertPlainObject(snapshot, "input.draftIntentSnapshot");
  const draftIntentId = requireToken(snapshot.draftIntentId, "input.draftIntentSnapshot.draftIntentId", "archive_material_draft_intent_");
  requireConst(draftIntentId, humanReview.sourceDraftIntent.draftIntentId, "input.draftIntentSnapshot.draftIntentId");
  const draftArtifactRef = requireBoundedString(snapshot.draftArtifactRef, "input.draftIntentSnapshot.draftArtifactRef", 8, 500);
  requireConst(draftArtifactRef, humanReview.sourceDraftIntent.draftArtifactRef, "input.draftIntentSnapshot.draftArtifactRef");
  return {
    draftIntentId,
    ownerType: requireOneOf(snapshot.ownerType, "input.draftIntentSnapshot.ownerType", ["STUDENT", "CLASS", "COURSE"]),
    studentId: optionalBoundedString(snapshot.studentId, "input.draftIntentSnapshot.studentId", 128),
    materialType: requireOneOf(snapshot.materialType, "input.draftIntentSnapshot.materialType", ["TEACHING_MATERIAL", "HANDOUT", "HOMEWORK", "PAPER", "QUIZ"]),
    source: requireOneOf(snapshot.source, "input.draftIntentSnapshot.source", ["TEACHER_UPLOAD", "SYSTEM_IMPORT", "AGENT_DRAFT"]),
    title: requireSafeText(snapshot.title, "input.draftIntentSnapshot.title", 4, 160),
    draftArtifactRef,
    sourceRefs: uniqueStringArray(snapshot.sourceRefs, "input.draftIntentSnapshot.sourceRefs", 1, 16),
  };
}

function assertStoragePrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 3, 32);
  for (const scope of ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE"]) {
    if (!scopes.includes(scope)) {
      throw precommitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_SCOPE_MISSING", `${scope} is required`);
    }
  }
  if (!scopes.includes("HARNESS_APPROVE") && !scopes.includes("ADMIN_SYSTEM")) {
    throw precommitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_SCOPE_MISSING", "HARNESS_APPROVE or ADMIN_SYSTEM is required");
  }
  return {
    principalId: requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128),
    subjectType: requireConst(principal.subjectType, "USER", "input.principal.subjectType"),
    role: requireOneOf(principal.role, "input.principal.role", ["TEACHER", "ADMIN"]),
    entryPoint: requireOneOf(principal.entryPoint, "input.principal.entryPoint", ["DESKTOP_TEACHER", "ADMIN_CONSOLE"]),
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 160),
    studentAccess: assertStudentAccess(principal.studentAccess),
    scopes,
  };
}

function assertStudentAccess(access) {
  assertPlainObject(access, "input.principal.studentAccess");
  return {
    mode: requireOneOf(access.mode, "input.principal.studentAccess.mode", ["ASSIGNED", "ALL"]),
    studentIds: Array.isArray(access.studentIds)
      ? uniqueStringArray(access.studentIds, "input.principal.studentAccess.studentIds", 0, 200)
      : [],
  };
}

function assertStorageRequest(request, draftIntent, principal) {
  rejectLeakedFields(request, "input.storageRequest");
  assertPlainObject(request, "input.storageRequest");
  const targetOwnerType = draftIntent.ownerType === "STUDENT" ? "STUDENT" : "TEACHING";
  requireConst(request.ownerType, targetOwnerType, "input.storageRequest.ownerType");
  const studentId = targetOwnerType === "STUDENT"
    ? requireBoundedString(request.studentId, "input.storageRequest.studentId", 1, 128)
    : optionalBoundedString(request.studentId, "input.storageRequest.studentId", 128);
  if (targetOwnerType === "STUDENT") {
    requireConst(studentId, draftIntent.studentId, "input.storageRequest.studentId");
    if (principal.studentAccess.mode === "ASSIGNED" && !principal.studentAccess.studentIds.includes(studentId)) {
      throw precommitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_STUDENT_SCOPE_MISMATCH", "studentAccess must include target studentId");
    }
  }
  requireConst(request.materialType, draftIntent.materialType, "input.storageRequest.materialType");
  requireConst(request.title, draftIntent.title, "input.storageRequest.title");
  const analysisIntents = uniqueStringArray(request.analysisIntents, "input.storageRequest.analysisIntents", 1, 4);
  if (analysisIntents.length !== 1 || analysisIntents[0] !== "ARCHIVE_ONLY") {
    throw precommitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_ANALYSIS_INTENT_NOT_ALLOWED", "storage precommit allows ARCHIVE_ONLY only");
  }
  return {
    ownerType: targetOwnerType,
    studentId: targetOwnerType === "STUDENT" ? studentId : "",
    materialType: draftIntent.materialType,
    title: draftIntent.title,
    source: requireConst(request.source, "SYSTEM_IMPORT", "input.storageRequest.source"),
    contentRef: requireContentRef(request.contentRef, "input.storageRequest.contentRef"),
    tags: uniqueStringArray(request.tags, "input.storageRequest.tags", 1, 32),
    analysisIntents,
    ocrReserved: requireConst(request.ocrReserved, false, "input.storageRequest.ocrReserved"),
  };
}

function assertStoragePolicy(policy) {
  assertPlainObject(policy, "input.storagePolicy");
  for (const field of [
    "humanReviewRequired",
    "humanReviewApproved",
    "storagePrecommitAllowed",
    "idempotentStorageCommandRequired",
    "preserveDraftEvidenceRequired",
    "requiresFutureStorageCommit",
  ]) {
    requireConst(policy[field], true, `input.storagePolicy.${field}`);
  }
  for (const field of [
    "mainDatabaseWriteAllowed",
    "mainDatabaseWriteStarted",
    "mainDatabaseWriteCommitted",
    "ocrOrRagJobWriteAllowed",
    "ocrOrRagJobWriteStarted",
    "aiGradingWriteAllowed",
    "executeHttpRequestAllowed",
    "directDatabaseAccessAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.storagePolicy.${field}`);
  }
  return { ...policy };
}

function buildStorageCommand(precommitInvocationId, principal, humanReview, draftIntent, storageRequest) {
  const suffix = safeToken(`${draftIntent.draftIntentId}_${storageRequest.ownerType}_${storageRequest.studentId || "teaching"}`);
  return {
    commandId: `archive_material_draft_storage_precommit_command_${suffix}`,
    operationId: "createTeachingArchiveItem",
    targetUseCase: "CreateArchiveItem.ExecuteWithPersistence",
    targetRepository: "ArchiveRepository.Create",
    targetTable: "teaching_archive_items",
    sourceHumanReviewRecordId: humanReview.recordId,
    sourceDraftIntentId: draftIntent.draftIntentId,
    requestBody: {
      ownerType: storageRequest.ownerType,
      studentId: storageRequest.studentId,
      materialType: storageRequest.materialType,
      title: storageRequest.title,
      source: storageRequest.source,
      contentRef: storageRequest.contentRef,
      tags: storageRequest.tags,
      analysisIntents: storageRequest.analysisIntents,
      ocrReserved: storageRequest.ocrReserved,
    },
    authorization: {
      principalId: principal.principalId,
      requiredScopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "HARNESS_APPROVE"],
      studentAccess: principal.studentAccess,
    },
    idempotencyBasis: precommitInvocationId,
  };
}

function assertStorageCommand(command) {
  assertPlainObject(command, "storageCommand");
  requireConst(command.operationId, "createTeachingArchiveItem", "storageCommand.operationId");
  requireConst(command.targetUseCase, "CreateArchiveItem.ExecuteWithPersistence", "storageCommand.targetUseCase");
  requireConst(command.targetRepository, "ArchiveRepository.Create", "storageCommand.targetRepository");
  requireConst(command.targetTable, "teaching_archive_items", "storageCommand.targetTable");
  requireConst(command.requestBody.analysisIntents.length, 1, "storageCommand.requestBody.analysisIntents.length");
  requireConst(command.requestBody.analysisIntents[0], "ARCHIVE_ONLY", "storageCommand.requestBody.analysisIntents[0]");
  requireConst(command.requestBody.ocrReserved, false, "storageCommand.requestBody.ocrReserved");
  return command;
}

function assertPrecommitPort(port) {
  if (!port || typeof port.prepareArchiveMaterialDraftStorageCommand !== "function") {
    throw precommitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_PORT_REQUIRED", "TeachingArchiveMaterialDraftStoragePrecommitPort.prepareArchiveMaterialDraftStorageCommand is required");
  }
  return port;
}

function buildPortRequest(normalized) {
  return {
    commandPort: TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_PORT,
    precommitInvocationId: normalized.precommitInvocationId,
    sourceReviewCommandPort,
    humanReviewRecord: normalized.humanReview,
    draftIntentSnapshot: normalized.draftIntent,
    teachingArchiveCreateCommand: normalized.storageCommand,
    storagePolicy: normalized.storagePolicy,
    evidenceRefs: normalized.evidenceRefs,
    inputHash: normalized.inputHash,
  };
}

function assertPortResult(portResult, normalized) {
  rejectLeakedFields(portResult, "portResult");
  assertPlainObject(portResult, "portResult");
  const precommit = assertPlainObject(portResult.precommit, "portResult.precommit");
  return {
    precommitId: requireToken(precommit.precommitId, "portResult.precommit.precommitId", "archive_material_draft_storage_precommit_"),
    commandId: requireConst(precommit.commandId, normalized.storageCommand.commandId, "portResult.precommit.commandId"),
    status: requireConst(precommit.status, precommitStatus, "portResult.precommit.status"),
    executionState: requireConst(precommit.executionState, precommitExecutionState, "portResult.precommit.executionState"),
  };
}

function buildPrecommitRecord(normalized, precommit, preparedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_RUNTIME_ID,
    commandPort: TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_PORT,
    status: precommitStatus,
    recordId: `teaching_archive_material_draft_storage_precommit_${safeToken(normalized.idempotencyKey)}`,
    preparedAt,
    sourceHumanReview: {
      workloadType: sourceReviewWorkloadType,
      runtimeId: sourceReviewRuntimeId,
      commandPort: sourceReviewCommandPort,
      recordId: normalized.humanReview.recordId,
      reviewId: normalized.humanReview.humanReview.reviewId,
      draftIntentId: normalized.draftIntent.draftIntentId,
    },
    precommit,
    teachingArchiveCreateCommand: normalized.storageCommand,
    boundary: {
      humanReviewVerified: true,
      draftIntentVerified: true,
      storagePrecommitRecorded: true,
      storageCommandPrepared: true,
      mainDatabaseWritePrepared: true,
      finalArchiveItemWriteStarted: false,
      mainDatabaseWriteStarted: false,
      mainDatabaseWriteCommitted: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      executeHttpRequestAllowed: false,
      directDatabaseAccessAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureStorageCommit: true,
    },
    evidenceRefs: [
      ...normalized.evidenceRefs,
      `evidence:archive-material-draft-storage-precommit-input-hash:${normalized.inputHash}`,
      `evidence:runtime:${TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_RUNTIME_ID}`,
      `evidence:command-port:${TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_PORT}`,
      `evidence:source-command-port:${sourceReviewCommandPort}`,
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
      evidenceClass: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_PROBE",
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
  requireConst(record.teachingArchiveCreateCommand.commandId, normalized.storageCommand.commandId, "record.teachingArchiveCreateCommand.commandId");
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
        throw precommitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_LEAKED_FIELD", `${current.path}.${key} is not allowed`);
      }
      if (nested && typeof nested === "object") stack.push({ value: nested, path: `${current.path}.${key}` });
    }
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw precommitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_INVALID_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw precommitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_CONST_MISMATCH", `${label} must be ${expected}`);
  }
  return actual;
}

function requireOneOf(actual, label, allowed) {
  if (!allowed.includes(actual)) {
    throw precommitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_INVALID_ENUM", `${label} must be one of ${allowed.join(",")}`);
  }
  return actual;
}

function requireBoundedString(value, label, minLength, maxLength) {
  if (typeof value !== "string" || value.length < minLength || value.length > maxLength) {
    throw precommitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_INVALID_STRING", `${label} must be a string of length ${minLength}-${maxLength}`);
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
    throw precommitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_UNSAFE_TEXT", `${label} contains unsafe text`);
  }
  return text;
}

function requireContentRef(value, label) {
  const ref = requireBoundedString(value, label, 12, 1000);
  if (!ref.startsWith("precommit://archive-material/") && !ref.startsWith("object://archive-material/")) {
    throw precommitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_INVALID_CONTENT_REF", `${label} must be a controlled archive material ref`);
  }
  return ref;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 300);
  if (!token.startsWith(prefix)) {
    throw precommitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_INVALID_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function uniqueStringArray(value, label, minLength, maxLength) {
  if (!Array.isArray(value) || value.length < minLength || value.length > maxLength) {
    throw precommitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_INVALID_ARRAY", `${label} must contain ${minLength}-${maxLength} strings`);
  }
  const seen = new Set();
  return value.map((item, index) => {
    const normalized = requireBoundedString(String(item), `${label}[${index}]`, 1, 360);
    if (seen.has(normalized)) throw precommitError("TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_DUPLICATE_STRING", `${label}[${index}] is duplicated`);
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

function precommitError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
