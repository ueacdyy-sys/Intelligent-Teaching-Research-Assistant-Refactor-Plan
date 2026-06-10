import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_RUNTIME_ID =
  "student_app_ai_tutor_result_student_archive_learning_actions_runtime";
export const STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_PORT =
  "StudentAppAITutorResultStudentArchiveLearningActionsPort.readStudentVisibleArchivedResultLearningActions";

const inputSchemaVersion = "2026-06-09.student-app.ai-tutor-result-student-archive-learning-actions.v1";
const outputSchemaVersion = "2026-06-09.student-app.ai-tutor-result-student-archive-learning-actions-verified.v1";
const sourceRenderRuntimeId = "student_app_ai_tutor_result_student_archive_render_runtime";
const sourceRenderStatus = "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_VERIFIED";
const sourceResultArchiveRenderRuntimeId = "student_app_ai_tutor_result_archive_student_archive_render";
const sourceResultArchiveRenderStatus = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_RENDER_VERIFIED";
const verifiedStatus = "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_VERIFIED";
const targetEndpoint = "GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/learning-actions";
const targetUseCase = "ReadStudentAppAITutorResultArchiveLearningActions.Execute";
const targetActionEndpoint = "/v1/student-app/ai-tutor-requests";
const targetRenderFormat = "SAFE_TEXT_BLOCKS";
const defaultVerificationLogPath =
  "reports/student-command-log/student-app-ai-tutor-result-student-archive-learning-actions.jsonl";

const leakedFieldNames = [
  "studentId", "contentRef", "resultRef", "answerKey", "correctAnswer",
  "expectedAnswer", "rawModelOutput", "modelOutput", "prompt", "internalError",
  "errorMessage", "workerId", "renderedHtml", "renderedMarkdown", "innerHTML",
  "blocks", "text", "guidanceSections", "summary",
];

export async function verifyStudentAppAITutorResultStudentArchiveLearningActions(input, options = {}) {
  const verifiedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const verificationLogPath = options.verificationLogPath ?? defaultVerificationLogPath;
  const existing = findExistingRecordByIdempotencyKey(verificationLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const learningActionsPort = assertLearningActionsPort(options.studentAppAITutorResultArchiveLearningActionsPort);
  const portResult = await learningActionsPort.readStudentVisibleArchivedResultLearningActions(
    {
      principal: normalized.principal,
      archiveItemId: normalized.archiveItemId,
      sourceType: "AI_TUTOR_RESULT_ARCHIVE",
      resultArchiveStatus: normalized.sourceRenderResult.renderEnvelope.status,
      renderFormat: targetRenderFormat,
    },
    {
      verificationInvocationId: normalized.learningActionsInvocationId,
      idempotencyKey: normalized.idempotencyKey,
      sourceRenderRecordId: normalized.sourceRenderResult.recordId,
    },
  );
  const verified = assertPortResult(portResult, normalized);
  const record = buildVerificationRecord(normalized, verified, verifiedAt);
  appendVerificationRecord(verificationLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorResultStudentArchiveLearningActions(result) {
  return [
    `Student App AI Tutor result archive learning actions: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Endpoint: ${result.learningActionsSource.endpoint}`,
    `Archive item: ${result.learningActions.archiveItemId}`,
    `Queue admission source verified: ${result.boundary.queueAdmissionSourceVerified}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const learningActionsInvocationId = requireOnePrefix(input.learningActionsInvocationId, "input.learningActionsInvocationId", [
    "ai_tutor_result_archive_learning_actions_",
    "ai_tutor_result_archive_student_archive_learning_actions_",
  ]);
  const principal = assertStudentPrincipal(input.principal);
  const sourceRender = assertSourceRenderReport(input.studentArchiveRenderReport);
  const sourceRenderResult = sourceRender.result;
  const archiveItemId = requireToken(sourceRenderResult.renderEnvelope.archiveItemId, "sourceRender.renderEnvelope.archiveItemId", "tarch_");
  requireConst(principal.studentAccess.ownStudentId, sourceRenderResult.principal.studentAccess.ownStudentId, "input.principal.studentAccess.ownStudentId");
  assertLearningActionsPolicy(input.studentArchiveLearningActionsPolicy);
  const evidenceRefs = assertEvidenceRefs(input.evidenceRefs);
  const idempotencyKey = requireOnePrefix(input.idempotencyKey, "input.idempotencyKey", [
    "student-app-ai-tutor-result-archive-learning-actions:",
    "student-app-ai-tutor-result-archive-student-archive-learning-actions:",
  ]);
  return { learningActionsInvocationId, principal, sourceRender, sourceRenderResult, archiveItemId, evidenceRefs, idempotencyKey };
}

function assertSourceRenderReport(report) {
  assertPlainObject(report, "input.studentArchiveRenderReport");
  requireConst(report.readiness, "READY", "input.studentArchiveRenderReport.readiness");
  const resultArchiveRenderWorkload = report.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_RENDER";
  requireConst(
    report.workloadType,
    resultArchiveRenderWorkload ? "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_RENDER" : "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER",
    "input.studentArchiveRenderReport.workloadType",
  );
  requireConst(
    report.runtime?.runtimeId,
    resultArchiveRenderWorkload ? sourceResultArchiveRenderRuntimeId : sourceRenderRuntimeId,
    "input.studentArchiveRenderReport.runtime.runtimeId",
  );
  if (resultArchiveRenderWorkload) {
    requireConst(report.runtime?.sharedRuntimeId, sourceRenderRuntimeId, "input.studentArchiveRenderReport.runtime.sharedRuntimeId");
    requireConst(report.runtime?.status, sourceResultArchiveRenderStatus, "input.studentArchiveRenderReport.runtime.status");
    requireConst(report.safetyInvariants?.learningActionSourceRequired, "AI_TUTOR_RESULT_ARCHIVE", "input.studentArchiveRenderReport.safetyInvariants.learningActionSourceRequired");
    requireConst(report.safetyInvariants?.resultArchiveStatusRequired, "READY_FOR_STUDENT_APP_READ", "input.studentArchiveRenderReport.safetyInvariants.resultArchiveStatusRequired");
  } else {
    requireConst(report.runtime?.status, sourceRenderStatus, "input.studentArchiveRenderReport.runtime.status");
  }
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.studentArchiveRenderReport.runtimeSlo.totalErrors");
  requireConst(report.safetyInvariants?.studentVisibleRenderEnvelopeVerified, true, "input.studentArchiveRenderReport.safetyInvariants.studentVisibleRenderEnvelopeVerified");
  requireConst(report.safetyInvariants?.safeTextBlocksOnly, true, "input.studentArchiveRenderReport.safetyInvariants.safeTextBlocksOnly");
  requireConst(report.safetyInvariants?.contentRefDisclosureAllowed, false, "input.studentArchiveRenderReport.safetyInvariants.contentRefDisclosureAllowed");
  const probeKey = resultArchiveRenderWorkload ? "studentAppAiTutorResultArchiveStudentArchiveRender" : "studentAppAiTutorResultStudentArchiveRender";
  const result = report.runtimeProbes?.[probeKey]?.result;
  assertPlainObject(result, `input.studentArchiveRenderReport.runtimeProbes.${probeKey}.result`);
  if (resultArchiveRenderWorkload) {
    requireConst(result.sourceRead?.learningActionSource, "AI_TUTOR_RESULT_ARCHIVE", "input.studentArchiveRenderReport result.sourceRead.learningActionSource");
    requireConst(result.sourceRead?.resultArchiveStatus, "READY_FOR_STUDENT_APP_READ", "input.studentArchiveRenderReport result.sourceRead.resultArchiveStatus");
  }
  const envelope = result.renderEnvelope;
  assertPlainObject(envelope, "input.studentArchiveRenderReport renderEnvelope");
  requireConst(envelope.status, "READY_FOR_STUDENT_APP_READ", "input.studentArchiveRenderReport renderEnvelope.status");
  requireConst(envelope.renderFormat, targetRenderFormat, "input.studentArchiveRenderReport renderEnvelope.renderFormat");
  return { report, result, probeKey, resultArchiveRenderWorkload };
}

function assertLearningActionsPolicy(policy) {
  assertPlainObject(policy, "input.studentArchiveLearningActionsPolicy");
  for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "renderedHtmlAllowed", "renderedMarkdownAllowed", "contentRefDisclosureAllowed", "resultRefDisclosureAllowed", "promptDisclosureAllowed", "answerKeyDisclosureAllowed", "rawModelOutputDisclosureAllowed", "swarmAllowed", "rawRenderBlocksDisclosureAllowed"]) {
    requireConst(policy[field], false, `input.studentArchiveLearningActionsPolicy.${field}`);
  }
  requireConst(policy.sourceRenderReportRequired, true, "input.studentArchiveLearningActionsPolicy.sourceRenderReportRequired");
  requireConst(policy.queueAdmissionSourceRequired, true, "input.studentArchiveLearningActionsPolicy.queueAdmissionSourceRequired");
  requireConst(policy.injectedLearningActionsPortRequired, true, "input.studentArchiveLearningActionsPolicy.injectedLearningActionsPortRequired");
}

function assertLearningActionsPort(port) {
  assertPlainObject(port, "StudentAppAITutorResultStudentArchiveLearningActionsPort");
  if (typeof port.readStudentVisibleArchivedResultLearningActions !== "function") {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_LEARNING_ACTIONS_MISSING_PORT", "StudentAppAITutorResultStudentArchiveLearningActionsPort.readStudentVisibleArchivedResultLearningActions is required");
  }
  return port;
}

function assertPortResult(result, normalized) {
  assertPlainObject(result, "StudentAppAITutorResultArchiveLearningActionsPort result");
  assertNoLeakedFields(result, "StudentAppAITutorResultArchiveLearningActionsPort result");
  requireConst(result.found, true, "StudentAppAITutorResultArchiveLearningActionsPort result.found");
  const source = result.source;
  assertPlainObject(source, "StudentAppAITutorResultArchiveLearningActionsPort result.source");
  requireConst(source.endpoint, targetEndpoint, "StudentAppAITutorResultArchiveLearningActionsPort result.source.endpoint");
  requireConst(source.useCase, targetUseCase, "StudentAppAITutorResultArchiveLearningActionsPort result.source.useCase");
  requireConst(source.sourceRenderUseCase, "RenderStudentAppAITutorResultArchive.Execute", "StudentAppAITutorResultArchiveLearningActionsPort result.source.sourceRenderUseCase");
  requireConst(source.ownStudentOnly, true, "StudentAppAITutorResultArchiveLearningActionsPort result.source.ownStudentOnly");
  const learningActions = assertLearningActions(result.learningActions, normalized.archiveItemId);
  return { source, learningActions };
}

function assertLearningActions(value, archiveItemId) {
  assertPlainObject(value, "StudentAppAITutorResultArchiveLearningActionsPort result.learningActions");
  assertNoLeakedFields(value, "StudentAppAITutorResultArchiveLearningActionsPort result.learningActions");
  requireConst(value.archiveItemId, archiveItemId, "learningActions.archiveItemId");
  requireConst(value.status, "READY_FOR_STUDENT_APP_READ", "learningActions.status");
  requireConst(value.materialType, "HOMEWORK", "learningActions.materialType");
  requireConst(value.renderFormat, targetRenderFormat, "learningActions.renderFormat");
  const actions = assertArray(value.actions, "learningActions.actions");
  if (actions.length < 1 || actions.length > 8) throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_LEARNING_ACTIONS_COUNT_INVALID", "learning actions must contain 1-8 actions");
  for (const action of actions) {
    assertPlainObject(action, "learningActions.action");
    assertNoLeakedFields(action, "learningActions.action");
    if (!["AI_TUTOR_REQUEST", "PERSONALIZED_QUESTION_BANK"].includes(action.actionType)) {
      throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_LEARNING_ACTIONS_TYPE_INVALID", "actionType is unsupported");
    }
    if (!["AVAILABLE", "DEFERRED_THROUGH_AI_TUTOR"].includes(action.state)) {
      throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_LEARNING_ACTIONS_STATE_INVALID", "action state is unsupported");
    }
    requireConst(action.targetEndpoint, targetActionEndpoint, "learningActions.action.targetEndpoint");
    requireConst(action.method, "POST", "learningActions.action.method");
    requireConst(action.requiresTutorRequest, true, "learningActions.action.requiresTutorRequest");
    if (action.questionBankIntent !== undefined) {
      requireConst(action.questionBankIntent, "GENERATE_PERSONALIZED_CHECK", "learningActions.action.questionBankIntent");
    }
    const source = action.learningActionSource;
    assertPlainObject(source, "learningActions.action.learningActionSource");
    requireConst(source.sourceType, "AI_TUTOR_RESULT_ARCHIVE", "learningActions.action.learningActionSource.sourceType");
    requireConst(source.actionType, action.actionType, "learningActions.action.learningActionSource.actionType");
    requireConst(source.resultArchiveStatus, "READY_FOR_STUDENT_APP_READ", "learningActions.action.learningActionSource.resultArchiveStatus");
    requireConst(source.renderFormat, targetRenderFormat, "learningActions.action.learningActionSource.renderFormat");
  }
  return value;
}

function buildVerificationRecord(normalized, verified, verifiedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS",
    recordId: stableRecordId("student_app_ai_tutor_result_student_archive_learning_actions", normalized.idempotencyKey),
    verifiedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_PORT,
    status: verifiedStatus,
    learningActionsInvocationId: normalized.learningActionsInvocationId,
    sourceRender: {
      runtimeId: sourceRenderRuntimeId,
      reportRuntimeId: normalized.sourceRender.report.runtime.runtimeId,
      reportStatus: normalized.sourceRender.report.runtime.status,
      resultArchiveRenderWorkload: normalized.sourceRender.resultArchiveRenderWorkload,
      recordId: normalized.sourceRenderResult.recordId,
      archiveItemId: normalized.archiveItemId,
      learningActionSource: normalized.sourceRenderResult.sourceRead?.learningActionSource ?? "AI_TUTOR_RESULT_ARCHIVE",
      resultArchiveStatus: normalized.sourceRenderResult.sourceRead?.resultArchiveStatus ?? normalized.sourceRenderResult.renderEnvelope.status,
      renderFormat: targetRenderFormat,
    },
    principal: normalized.principal,
    learningActionsSource: verified.source,
    learningActions: verified.learningActions,
    evidenceRefs: normalized.evidenceRefs,
    idempotencyKey: normalized.idempotencyKey,
    inputHash: sha256(JSON.stringify({
      learningActionsInvocationId: normalized.learningActionsInvocationId,
      archiveItemId: normalized.archiveItemId,
      principal: normalized.principal,
      sourceRenderRecordId: normalized.sourceRenderResult.recordId,
      evidenceRefs: normalized.evidenceRefs,
    })),
    boundary: {
      sourceRenderReportRequired: true,
      ownStudentPrincipalRequired: true,
      studentVisibleRenderEnvelopeRequired: true,
      safeTextBlocksSourceRequired: true,
      queueAdmissionSourceVerified: true,
      actionTargetRestrictedToStudentAppAiTutorRequests: true,
      rawRenderBlocksDisclosed: false,
      contentRefDisclosed: false,
      resultRefDisclosed: false,
      rawModelOutputDisclosed: false,
      promptDisclosed: false,
      answerKeyDisclosed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      modelInferenceAllowed: false,
      swarmAllowed: false,
    },
  };
}

function buildResult(record, { idempotentReplay }) {
  return { ...record, idempotentReplay };
}

function assertReplayMatches(existing, normalized) {
  requireConst(existing.sourceRender?.recordId, normalized.sourceRenderResult.recordId, "existing.sourceRender.recordId");
  requireConst(existing.learningActions?.archiveItemId, normalized.archiveItemId, "existing.learningActions.archiveItemId");
  requireConst(existing.principal?.studentAccess?.ownStudentId, normalized.principal.studentAccess.ownStudentId, "existing.principal.studentAccess.ownStudentId");
}

function findExistingRecordByIdempotencyKey(logPath, idempotencyKey) {
  if (!fs.existsSync(logPath)) return undefined;
  for (const line of fs.readFileSync(logPath, "utf8").split(/\r?\n/u)) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    if (record.idempotencyKey === idempotencyKey) return record;
  }
  return undefined;
}

function appendVerificationRecord(logPath, record) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`);
}

function assertStudentPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  requireConst(principal.role, "STUDENT", "input.principal.role");
  requireConst(principal.entryPoint, "STUDENT_APP", "input.principal.entryPoint");
  requireConst(principal.studentAccess?.mode, "OWN", "input.principal.studentAccess.mode");
  requireToken(principal.studentAccess?.ownStudentId, "input.principal.studentAccess.ownStudentId", "student_");
  if (!Array.isArray(principal.scopes) || !principal.scopes.includes("STUDENT_OWN_READ")) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_LEARNING_ACTIONS_SCOPE_INVALID", "STUDENT_OWN_READ scope is required");
  }
  return principal;
}

function assertEvidenceRefs(refs) {
  const values = assertArray(refs, "input.evidenceRefs");
  if (!values.includes("evidence:student-archive-render:student-app-ai-tutor-result-student-archive-render") &&
    !values.includes("evidence:student-app-ai-tutor-result-archive-student-archive-render:http")) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_LEARNING_ACTIONS_EVIDENCE_MISSING", "source render evidence ref is required");
  }
  return values;
}

function assertNoLeakedFields(value, label) {
  const keys = collectKeys(value);
  for (const field of leakedFieldNames) {
    if (keys.has(field)) throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_LEARNING_ACTIONS_LEAKED_FIELD", `${label} leaked ${field}`);
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

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_LEARNING_ACTIONS_OBJECT_INVALID", `${label} must be an object`);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_LEARNING_ACTIONS_ARRAY_INVALID", `${label} must be an array`);
  }
  return value;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_LEARNING_ACTIONS_CONST_INVALID", `${label} must be ${expected}`);
  }
  return actual;
}

function requireToken(value, label, prefix) {
  const text = requireText(value, label);
  if (!text.startsWith(prefix)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_LEARNING_ACTIONS_TOKEN_INVALID", `${label} must start with ${prefix}`);
  }
  return text;
}

function requireOnePrefix(value, label, prefixes) {
  const text = requireText(value, label);
  if (!prefixes.some((prefix) => text.startsWith(prefix))) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_LEARNING_ACTIONS_TOKEN_INVALID", `${label} must start with one of ${prefixes.join(", ")}`);
  }
  return text;
}

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_LEARNING_ACTIONS_TEXT_INVALID", `${label} must be a non-empty string`);
  }
  return value;
}

function stableRecordId(prefix, idempotencyKey) {
  return `${prefix}_${idempotencyKey.replace(/[^A-Za-z0-9_-]+/gu, "_").slice(0, 120)}`;
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function verificationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
