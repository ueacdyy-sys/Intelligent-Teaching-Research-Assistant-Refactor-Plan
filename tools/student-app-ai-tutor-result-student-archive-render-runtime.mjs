import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_RUNTIME_ID =
  "student_app_ai_tutor_result_student_archive_render_runtime";
export const STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_PORT =
  "StudentAppAITutorResultStudentArchiveRenderPort.renderStudentVisibleArchivedResult";

const inputSchemaVersion = "2026-06-08.student-app.ai-tutor-result-student-archive-render.v1";
const outputSchemaVersion = "2026-06-08.student-app.ai-tutor-result-student-archive-render-verified.v1";
const sourceReadRuntimeId = "student_app_ai_tutor_result_student_archive_read_runtime";
const sourceReadStatus = "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_VERIFIED";
const verifiedStatus = "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_VERIFIED";
const targetEndpoint = "GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/rendered";
const targetUseCase = "RenderStudentAppAITutorResultArchive.Execute";
const targetRenderFormat = "SAFE_TEXT_BLOCKS";
const defaultVerificationLogPath =
  "reports/student-command-log/student-app-ai-tutor-result-student-archive-render.jsonl";

const leakedFieldNames = [
  "studentId", "contentRef", "resultRef", "answerKey", "correctAnswer",
  "expectedAnswer", "rawModelOutput", "modelOutput", "prompt", "internalError",
  "errorMessage", "workerId", "renderedHtml", "renderedMarkdown", "innerHTML",
];

export async function verifyStudentAppAITutorResultStudentArchiveRender(input, options = {}) {
  const verifiedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const verificationLogPath = options.verificationLogPath ?? defaultVerificationLogPath;
  const existing = findExistingRecordByIdempotencyKey(verificationLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const renderPort = assertRenderPort(options.studentAppAITutorResultArchiveRenderPort);
  const portResult = await renderPort.renderStudentVisibleArchivedResult(
    {
      principal: normalized.principal,
      archiveItemId: normalized.archiveItemId,
      renderFormat: targetRenderFormat,
    },
    {
      verificationInvocationId: normalized.renderInvocationId,
      idempotencyKey: normalized.idempotencyKey,
      sourceReadRecordId: normalized.sourceReadResult.recordId,
    },
  );
  const verified = assertPortResult(portResult, normalized);
  const record = buildVerificationRecord(normalized, verified, verifiedAt);
  appendVerificationRecord(verificationLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorResultStudentArchiveRender(result) {
  return [
    `Student App AI Tutor result archive render: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Endpoint: ${result.studentResultRenderSource.endpoint}`,
    `Archive item: ${result.renderEnvelope.archiveItemId}`,
    `Safe text blocks verified: ${result.boundary.studentVisibleRenderEnvelopeVerified}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const renderInvocationId = requireToken(input.renderInvocationId, "input.renderInvocationId", "ai_tutor_result_archive_render_");
  const principal = assertStudentPrincipal(input.principal);
  const sourceReadReport = assertSourceReadReport(input.studentArchiveReadReport);
  const sourceReadResult = sourceReadReport.runtimeProbes.studentAppAiTutorResultStudentArchiveRead.result;
  const archiveItemId = requireToken(sourceReadResult.resultArchiveCard.archiveItemId, "sourceRead.resultArchiveCard.archiveItemId", "tarch_");
  requireConst(principal.studentAccess.ownStudentId, sourceReadResult.principal.studentAccess.ownStudentId, "input.principal.studentAccess.ownStudentId");
  assertRenderPolicy(input.studentArchiveRenderPolicy);
  const evidenceRefs = assertEvidenceRefs(input.evidenceRefs);
  const idempotencyKey = requireToken(input.idempotencyKey, "input.idempotencyKey", "student-app-ai-tutor-result-archive-render:");
  return { renderInvocationId, principal, sourceReadReport, sourceReadResult, archiveItemId, evidenceRefs, idempotencyKey };
}

function assertSourceReadReport(report) {
  assertPlainObject(report, "input.studentArchiveReadReport");
  requireConst(report.readiness, "READY", "input.studentArchiveReadReport.readiness");
  requireConst(report.workloadType, "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ", "input.studentArchiveReadReport.workloadType");
  requireConst(report.runtime?.runtimeId, sourceReadRuntimeId, "input.studentArchiveReadReport.runtime.runtimeId");
  requireConst(report.runtime?.status, sourceReadStatus, "input.studentArchiveReadReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.studentArchiveReadReport.runtimeSlo.totalErrors");
  requireConst(report.safetyInvariants?.studentVisibleResultCardReadVerified, true, "input.studentArchiveReadReport.safetyInvariants.studentVisibleResultCardReadVerified");
  requireConst(report.safetyInvariants?.contentRefDisclosureAllowed, false, "input.studentArchiveReadReport.safetyInvariants.contentRefDisclosureAllowed");
  const result = report.runtimeProbes?.studentAppAiTutorResultStudentArchiveRead?.result;
  assertPlainObject(result, "input.studentArchiveReadReport.runtimeProbes.studentAppAiTutorResultStudentArchiveRead.result");
  assertNoLeakedFields(result, "input.studentArchiveReadReport result");
  return report;
}

function assertRenderPolicy(policy) {
  assertPlainObject(policy, "input.studentArchiveRenderPolicy");
  for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "renderedHtmlAllowed", "renderedMarkdownAllowed", "contentRefDisclosureAllowed", "resultRefDisclosureAllowed", "promptDisclosureAllowed", "answerKeyDisclosureAllowed", "rawModelOutputDisclosureAllowed", "swarmAllowed"]) {
    requireConst(policy[field], false, `input.studentArchiveRenderPolicy.${field}`);
  }
  requireConst(policy.safeTextBlocksRequired, true, "input.studentArchiveRenderPolicy.safeTextBlocksRequired");
  requireConst(policy.sourceReadReportRequired, true, "input.studentArchiveRenderPolicy.sourceReadReportRequired");
  requireConst(policy.injectedStudentResultArchiveRenderPortRequired, true, "input.studentArchiveRenderPolicy.injectedStudentResultArchiveRenderPortRequired");
}

function assertRenderPort(port) {
  assertPlainObject(port, "StudentAppAITutorResultStudentArchiveRenderPort");
  if (typeof port.renderStudentVisibleArchivedResult !== "function") {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_RENDER_MISSING_PORT", "StudentAppAITutorResultArchiveRenderPort.renderStudentVisibleArchivedResult is required");
  }
  return port;
}

function assertPortResult(result, normalized) {
  assertPlainObject(result, "StudentAppAITutorResultArchiveRenderPort result");
  assertNoLeakedFields(result, "StudentAppAITutorResultArchiveRenderPort result");
  requireConst(result.found, true, "StudentAppAITutorResultArchiveRenderPort result.found");
  const source = result.source;
  assertPlainObject(source, "StudentAppAITutorResultArchiveRenderPort result.source");
  requireConst(source.endpoint, targetEndpoint, "StudentAppAITutorResultArchiveRenderPort result.source.endpoint");
  requireConst(source.useCase, targetUseCase, "StudentAppAITutorResultArchiveRenderPort result.source.useCase");
  requireConst(source.sourceReadUseCase, "ReadStudentAppAITutorResultArchive.Execute", "StudentAppAITutorResultArchiveRenderPort result.source.sourceReadUseCase");
  requireConst(source.ownStudentOnly, true, "StudentAppAITutorResultArchiveRenderPort result.source.ownStudentOnly");
  const envelope = assertRenderEnvelope(result.envelope, normalized.archiveItemId);
  return { source, envelope };
}

function assertRenderEnvelope(envelope, archiveItemId) {
  assertPlainObject(envelope, "StudentAppAITutorResultArchiveRenderPort result.envelope");
  assertNoLeakedFields(envelope, "StudentAppAITutorResultArchiveRenderPort result.envelope");
  requireConst(envelope.archiveItemId, archiveItemId, "renderEnvelope.archiveItemId");
  requireConst(envelope.status, "READY_FOR_STUDENT_APP_READ", "renderEnvelope.status");
  requireConst(envelope.renderFormat, targetRenderFormat, "renderEnvelope.renderFormat");
  const blocks = assertArray(envelope.blocks, "renderEnvelope.blocks");
  if (blocks.length < 2 || blocks.length > 9) throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_RENDER_BLOCKS_INVALID", "render envelope must include summary and guidance blocks");
  requireConst(blocks[0].blockType, "SUMMARY", "renderEnvelope.blocks[0].blockType");
  for (const block of blocks) {
    assertPlainObject(block, "renderEnvelope.block");
    assertNoLeakedFields(block, "renderEnvelope.block");
    requireText(block.blockId, "renderEnvelope.block.blockId");
    requireText(block.title, "renderEnvelope.block.title");
    requireSafeText(block.text, "renderEnvelope.block.text");
    if (!["SUMMARY", "GUIDANCE_SECTION"].includes(block.blockType)) {
      throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_RENDER_BLOCK_TYPE_INVALID", "render block type is unsupported");
    }
  }
  requireText(envelope.guidanceSectionsHash, "renderEnvelope.guidanceSectionsHash");
  assertArray(envelope.safetyLabels, "renderEnvelope.safetyLabels");
  return envelope;
}

function buildVerificationRecord(normalized, verified, verifiedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER",
    recordId: stableRecordId("student_app_ai_tutor_result_student_archive_render", normalized.idempotencyKey),
    verifiedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_PORT,
    status: verifiedStatus,
    renderInvocationId: normalized.renderInvocationId,
    sourceRead: {
      runtimeId: sourceReadRuntimeId,
      recordId: normalized.sourceReadResult.recordId,
      archiveItemId: normalized.archiveItemId,
    },
    principal: normalized.principal,
    studentResultRenderSource: verified.source,
    renderEnvelope: verified.envelope,
    evidenceRefs: normalized.evidenceRefs,
    idempotencyKey: normalized.idempotencyKey,
    inputHash: sha256(JSON.stringify({
      renderInvocationId: normalized.renderInvocationId,
      archiveItemId: normalized.archiveItemId,
      principal: normalized.principal,
      sourceReadRecordId: normalized.sourceReadResult.recordId,
      evidenceRefs: normalized.evidenceRefs,
    })),
    boundary: {
      sourceReadReportRequired: true,
      ownStudentPrincipalRequired: true,
      studentVisibleRenderEnvelopeVerified: true,
      safeTextBlocksOnly: true,
      renderedHtmlAllowed: false,
      renderedMarkdownAllowed: false,
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
  requireConst(existing.sourceRead?.recordId, normalized.sourceReadResult.recordId, "existing.sourceRead.recordId");
  requireConst(existing.renderEnvelope?.archiveItemId, normalized.archiveItemId, "existing.renderEnvelope.archiveItemId");
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
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_RENDER_SCOPE_INVALID", "STUDENT_OWN_READ scope is required");
  }
  return principal;
}

function assertEvidenceRefs(refs) {
  const values = assertArray(refs, "input.evidenceRefs");
  if (!values.includes("evidence:student-archive-read:student-app-ai-tutor-result-student-archive-read")) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_RENDER_EVIDENCE_MISSING", "source read evidence ref is required");
  }
  return values;
}

function assertNoLeakedFields(value, label) {
  const keys = collectKeys(value);
  for (const field of leakedFieldNames) {
    if (keys.has(field)) throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_RENDER_LEAKED_FIELD", `${label} leaked ${field}`);
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
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_RENDER_OBJECT_INVALID", `${label} must be an object`);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_RENDER_ARRAY_INVALID", `${label} must be an array`);
  }
  return value;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_RENDER_CONST_INVALID", `${label} must be ${expected}`);
  }
  return actual;
}

function requireToken(value, label, prefix) {
  const text = requireText(value, label);
  if (!text.startsWith(prefix)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_RENDER_TOKEN_INVALID", `${label} must start with ${prefix}`);
  }
  return text;
}

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_RENDER_TEXT_INVALID", `${label} must be a non-empty string`);
  }
  return value;
}

function requireSafeText(value, label) {
  const text = requireText(value, label);
  if (/[<>]/u.test(text) || /javascript:/iu.test(text)) {
    throw verificationError("STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_RENDER_UNSAFE_TEXT", `${label} contains unsafe markup`);
  }
  return text;
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
