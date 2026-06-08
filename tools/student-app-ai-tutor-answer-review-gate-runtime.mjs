import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_RUNTIME_ID =
  "student_app_ai_tutor_answer_review_gate_runtime";
export const STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_PORT =
  "StudentAppAITutorAnswerReviewGatePort.recordAnswerReviewGate";

const inputSchemaVersion = "2026-06-08.student-app.ai-tutor-answer-review-gate.v1";
const outputSchemaVersion = "2026-06-08.student-app.ai-tutor-answer-review-gate-recorded.v1";
const sourceArtifactSchemaVersion = "2026-06-08.student-app.ai-tutor-controlled-answer-artifact-recorded.v1";
const sourceArtifactRuntimeId = "student_app_ai_tutor_controlled_answer_artifact_runtime";
const sourceArtifactCommandPort = "StudentAppAITutorControlledAnswerArtifactPort.recordControlledAnswerArtifact";
const sourceArtifactWorkloadType = "STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT";
const recordedStatus = "STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_RECORDED";
const defaultReviewLogPath = "reports/student-command-log/student-app-ai-tutor-answer-review-gate.jsonl";
const allowedDecisions = ["APPROVE_FOR_RESULT_PERSISTENCE", "REJECT_FOR_REVISION"];

const leakedFieldNames = new Set([
  "answerkey",
  "correctanswer",
  "expectedanswer",
  "contentref",
  "rawcontent",
  "rawmodeloutput",
  "modeloutput",
  "modelresponse",
  "prompt",
  "prompttext",
  "fullprompt",
  "ragchunks",
  "ocrchunks",
  "resultref",
  "directsql",
  "dburl",
  "internalerror",
  "errormessage",
  "guidancetext",
  "sectiontext",
]);

const unsafeReviewTextPattern = /(raw model|prompt|answer key|correct answer|expected answer|contentref|resultref|internal error|标准答案|参考答案|正确答案|原始模型|提示词)/iu;

export async function recordStudentAppAITutorAnswerReviewGate(input, options = {}) {
  const recordedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const reviewLogPath = options.reviewLogPath ?? defaultReviewLogPath;
  const existing = findExistingRecordByIdempotencyKey(reviewLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const port = assertReviewGatePort(options.answerReviewGatePort);
  const portResult = await port.recordAnswerReviewGate(buildPortRequest(normalized));
  const answerReviewGate = assertPortResult(portResult, normalized);
  const record = buildReviewRecord(normalized, answerReviewGate, recordedAt);
  appendRecord(reviewLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorAnswerReviewGate(result) {
  return [
    `Student App AI Tutor answer review gate: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Review: ${result.answerReviewGate.reviewId}`,
    `Decision: ${result.answerReviewGate.decision}`,
    `Student visible: ${result.boundary.studentVisiblePublished}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const reviewInvocationId = requireToken(input.reviewInvocationId, "input.reviewInvocationId", "ai_tutor_answer_review_");
  const controlledAnswerArtifactReport = assertControlledAnswerArtifactReport(input.controlledAnswerArtifactReport);
  const controlledAnswerArtifactResult = assertControlledAnswerArtifactResult(controlledAnswerArtifactReport);
  const principal = assertReviewerPrincipal(input.principal);
  const reviewDecision = assertReviewDecision(input.reviewDecision, controlledAnswerArtifactResult);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 2, 20, 8, 360);
  for (const required of ["controlled-answer-artifact", "answer-review-gate"]) {
    if (!evidenceRefs.some((ref) => ref.includes(required))) {
      throw reviewError("STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_MISSING_EVIDENCE", `${required} evidence ref is required`);
    }
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 380);
  const inputHash = hashInput({
    reviewInvocationId,
    artifactId: controlledAnswerArtifactResult.controlledAnswerArtifact.artifactId,
    guidanceSectionsHash: controlledAnswerArtifactResult.guidanceSectionsHash,
    reviewerPrincipalId: principal.principalId,
    decision: reviewDecision.decision,
    reviewedAt: reviewDecision.reviewedAt,
  });
  return {
    reviewInvocationId,
    controlledAnswerArtifactReport,
    controlledAnswerArtifactResult,
    principal,
    reviewDecision,
    evidenceRefs,
    idempotencyKey,
    inputHash,
  };
}

function assertControlledAnswerArtifactReport(report) {
  assertPlainObject(report, "input.controlledAnswerArtifactReport");
  requireConst(report.readiness, "READY", "input.controlledAnswerArtifactReport.readiness");
  requireConst(report.workloadType, sourceArtifactWorkloadType, "input.controlledAnswerArtifactReport.workloadType");
  requireConst(report.runtime?.runtimeId, sourceArtifactRuntimeId, "input.controlledAnswerArtifactReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, sourceArtifactCommandPort, "input.controlledAnswerArtifactReport.runtime.commandPort");
  requireConst(report.runtime?.status, "STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RECORDED", "input.controlledAnswerArtifactReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.controlledAnswerArtifactReport.runtimeSlo.totalErrors");
  const invariants = assertPlainObject(report.safetyInvariants, "input.controlledAnswerArtifactReport.safetyInvariants");
  for (const field of ["sourceModelExecutionPrecheckRequired", "internalServiceOnly", "controlledAnswerArtifactRecorded", "humanReviewRequiredBeforeResult", "rawModelOutputExcluded", "promptExcluded", "answerKeyExcluded"]) {
    requireConst(invariants[field], true, `input.controlledAnswerArtifactReport.safetyInvariants.${field}`);
  }
  for (const field of ["tutoringResultRecorded", "resultPersistenceAllowed", "studentVisiblePublished", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "externalToolUseAllowed", "retrievalAllowed", "swarmAllowed"]) {
    requireConst(invariants[field], false, `input.controlledAnswerArtifactReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertControlledAnswerArtifactResult(report) {
  const result = report.runtimeProbes?.studentAppAiTutorControlledAnswerArtifact?.result;
  rejectLeakedFields(result, "source.controlledAnswerArtifactResult");
  assertPlainObject(result, "source.controlledAnswerArtifactResult");
  requireConst(result.schemaVersion, sourceArtifactSchemaVersion, "source.artifact.schemaVersion");
  requireConst(result.runtimeId, sourceArtifactRuntimeId, "source.artifact.runtimeId");
  requireConst(result.commandPort, sourceArtifactCommandPort, "source.artifact.commandPort");
  requireConst(result.status, "STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RECORDED", "source.artifact.status");
  requireConst(result.boundary?.controlledAnswerArtifactRecorded, true, "source.artifact.boundary.controlledAnswerArtifactRecorded");
  requireConst(result.boundary?.humanReviewRequiredBeforeResult, true, "source.artifact.boundary.humanReviewRequiredBeforeResult");
  for (const field of ["tutoringResultRecorded", "resultPersistenceAllowed", "studentVisiblePublished", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "externalToolUseAllowed", "retrievalAllowed", "swarmAllowed"]) {
    requireConst(result.boundary?.[field], false, `source.artifact.boundary.${field}`);
  }
  const artifact = assertControlledAnswerArtifact(result.controlledAnswerArtifact, result);
  return {
    requestId: requireToken(result.requestId, "source.artifact.requestId", "tutor_req_"),
    archiveItemId: requireToken(result.archiveItemId, "source.artifact.archiveItemId", "tarch_"),
    workerId: requireBoundedString(result.workerId, "source.artifact.workerId", 1, 128),
    precheckId: requireToken(result.precheckId, "source.artifact.precheckId", "ai_tutor_model_precheck_"),
    queueRef: requireToken(result.queueRef, "source.artifact.queueRef", "ai_tutor_model_queue_"),
    controlledAnswerArtifact: artifact,
    guidanceSectionsHash: hashGuidanceSections(artifact.guidanceSections),
  };
}

function assertControlledAnswerArtifact(artifact, source) {
  assertPlainObject(artifact, "source.artifact.controlledAnswerArtifact");
  const sections = assertGuidanceSections(artifact.guidanceSections);
  return {
    artifactId: requireToken(artifact.artifactId, "source.artifact.controlledAnswerArtifact.artifactId", "ai_tutor_answer_artifact_"),
    requestId: requireConst(artifact.requestId, source.requestId, "source.artifact.controlledAnswerArtifact.requestId"),
    workerId: requireConst(artifact.workerId, source.workerId, "source.artifact.controlledAnswerArtifact.workerId"),
    precheckId: requireConst(artifact.precheckId, source.precheckId, "source.artifact.controlledAnswerArtifact.precheckId"),
    queueRef: requireConst(artifact.queueRef, source.queueRef, "source.artifact.controlledAnswerArtifact.queueRef"),
    status: requireConst(artifact.status, "AI_TUTOR_CONTROLLED_ANSWER_RECORDED_NOT_REVIEWED", "source.artifact.controlledAnswerArtifact.status"),
    reviewState: requireConst(artifact.reviewState, "PENDING_HUMAN_REVIEW", "source.artifact.controlledAnswerArtifact.reviewState"),
    summary: requireBoundedString(artifact.summary, "source.artifact.controlledAnswerArtifact.summary", 3, 500),
    guidanceSections: sections,
    safetyLabels: uniqueStringArray(artifact.safetyLabels, "source.artifact.controlledAnswerArtifact.safetyLabels", 1, 8, 3, 80),
    resultPersistenceAllowed: requireConst(artifact.resultPersistenceAllowed, false, "source.artifact.controlledAnswerArtifact.resultPersistenceAllowed"),
    tutoringResultRecorded: requireConst(artifact.tutoringResultRecorded, false, "source.artifact.controlledAnswerArtifact.tutoringResultRecorded"),
    studentVisiblePublished: requireConst(artifact.studentVisiblePublished, false, "source.artifact.controlledAnswerArtifact.studentVisiblePublished"),
  };
}

function assertGuidanceSections(sections) {
  if (!Array.isArray(sections) || sections.length < 1 || sections.length > 5) {
    throw reviewError("STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_INVALID_SECTIONS", "controlled answer guidance sections are out of bounds");
  }
  const seen = new Set();
  return sections.map((section, index) => {
    assertPlainObject(section, `source.artifact.guidanceSections[${index}]`);
    const sectionId = requireToken(section.sectionId, `source.artifact.guidanceSections[${index}].sectionId`, "ai_tutor_answer_section_");
    if (seen.has(sectionId)) throw reviewError("STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_DUPLICATE_SECTION", `${sectionId} is duplicated`);
    seen.add(sectionId);
    return {
      sectionId,
      title: requireBoundedString(section.title, `source.artifact.guidanceSections[${index}].title`, 1, 120),
      text: requireSafeReviewText(section.text, `source.artifact.guidanceSections[${index}].text`, 3, 1200),
      sourceBlockRefs: uniqueStringArray(section.sourceBlockRefs, `source.artifact.guidanceSections[${index}].sourceBlockRefs`, 1, 6, 6, 160),
    };
  });
}

function assertReviewerPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const role = requireOneOf(principal.role, "input.principal.role", ["TEACHER", "ADMIN"]);
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 24, 3, 80);
  if (role === "TEACHER") {
    for (const scope of ["TEACHING_READ", "TEACHING_WRITE"]) requireArrayIncludes(scopes, scope, "input.principal.scopes");
  }
  if (role === "ADMIN" && !scopes.includes("ADMIN_SYSTEM")) {
    throw reviewError("STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_MISSING_ADMIN_SCOPE", "ADMIN reviewer must include ADMIN_SYSTEM");
  }
  return {
    principalId: requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128),
    subjectType: requireConst(principal.subjectType, "USER", "input.principal.subjectType"),
    role,
    entryPoint: requireOneOf(principal.entryPoint, "input.principal.entryPoint", ["DESKTOP_TEACHER", "ADMIN_CONSOLE"]),
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 160),
    scopes,
  };
}

function assertReviewDecision(decision, source) {
  rejectLeakedFields(decision, "input.reviewDecision");
  assertPlainObject(decision, "input.reviewDecision");
  const reviewChecklist = assertReviewChecklist(decision.reviewChecklist);
  const reviewedAt = requireIsoString(decision.reviewedAt, "input.reviewDecision.reviewedAt");
  const guidanceSectionsHash = requireConst(decision.guidanceSectionsHash, source.guidanceSectionsHash, "input.reviewDecision.guidanceSectionsHash");
  return {
    artifactId: requireConst(decision.artifactId, source.controlledAnswerArtifact.artifactId, "input.reviewDecision.artifactId"),
    requestId: requireConst(decision.requestId, source.requestId, "input.reviewDecision.requestId"),
    workerId: requireConst(decision.workerId, source.workerId, "input.reviewDecision.workerId"),
    precheckId: requireConst(decision.precheckId, source.precheckId, "input.reviewDecision.precheckId"),
    queueRef: requireConst(decision.queueRef, source.queueRef, "input.reviewDecision.queueRef"),
    decision: requireOneOf(decision.decision, "input.reviewDecision.decision", allowedDecisions),
    guidanceSectionsHash,
    reviewerNotes: requireSafeReviewText(decision.reviewerNotes, "input.reviewDecision.reviewerNotes", 3, 900),
    reviewChecklist,
    reviewedAt,
  };
}

function assertReviewChecklist(checklist) {
  assertPlainObject(checklist, "input.reviewDecision.reviewChecklist");
  for (const field of [
    "sourceArtifactVerified",
    "guidanceSafeForLearner",
    "rawModelOutputAbsent",
    "promptAbsent",
    "answerKeyAbsent",
    "resultPersistenceRequiresSeparateRuntime",
    "studentVisibilityRequiresSeparateRuntime",
  ]) requireConst(checklist[field], true, `input.reviewDecision.reviewChecklist.${field}`);
  return checklist;
}

function buildPortRequest(normalized) {
  const source = normalized.controlledAnswerArtifactResult;
  return {
    schemaVersion: inputSchemaVersion,
    reviewInvocationId: normalized.reviewInvocationId,
    idempotencyKey: normalized.idempotencyKey,
    artifactId: source.controlledAnswerArtifact.artifactId,
    requestId: source.requestId,
    archiveItemId: source.archiveItemId,
    workerId: source.workerId,
    precheckId: source.precheckId,
    queueRef: source.queueRef,
    reviewerPrincipalId: normalized.principal.principalId,
    reviewerRole: normalized.principal.role,
    decision: normalized.reviewDecision.decision,
    guidanceSectionsHash: source.guidanceSectionsHash,
    reviewChecklist: normalized.reviewDecision.reviewChecklist,
    reviewedAt: normalized.reviewDecision.reviewedAt,
    evidenceRefs: normalized.evidenceRefs,
  };
}

function assertPortResult(portResult, normalized) {
  rejectLeakedFields(portResult, "answerReviewGatePort.result");
  assertPlainObject(portResult, "answerReviewGatePort.result");
  const gate = assertPlainObject(portResult.answerReviewGate, "answerReviewGatePort.result.answerReviewGate");
  const source = normalized.controlledAnswerArtifactResult;
  const expectedStatus = normalized.reviewDecision.decision === "APPROVE_FOR_RESULT_PERSISTENCE"
    ? "AI_TUTOR_ANSWER_REVIEW_APPROVED_NOT_PERSISTED"
    : "AI_TUTOR_ANSWER_REVIEW_REJECTED_FOR_REVISION";
  return {
    reviewId: requireToken(gate.reviewId, "answerReviewGatePort.result.answerReviewGate.reviewId", "ai_tutor_answer_review_gate_"),
    artifactId: requireConst(gate.artifactId, source.controlledAnswerArtifact.artifactId, "answerReviewGatePort.result.answerReviewGate.artifactId"),
    requestId: requireConst(gate.requestId, source.requestId, "answerReviewGatePort.result.answerReviewGate.requestId"),
    workerId: requireConst(gate.workerId, source.workerId, "answerReviewGatePort.result.answerReviewGate.workerId"),
    precheckId: requireConst(gate.precheckId, source.precheckId, "answerReviewGatePort.result.answerReviewGate.precheckId"),
    queueRef: requireConst(gate.queueRef, source.queueRef, "answerReviewGatePort.result.answerReviewGate.queueRef"),
    reviewerPrincipalId: requireConst(gate.reviewerPrincipalId, normalized.principal.principalId, "answerReviewGatePort.result.answerReviewGate.reviewerPrincipalId"),
    decision: requireConst(gate.decision, normalized.reviewDecision.decision, "answerReviewGatePort.result.answerReviewGate.decision"),
    guidanceSectionsHash: requireConst(gate.guidanceSectionsHash, source.guidanceSectionsHash, "answerReviewGatePort.result.answerReviewGate.guidanceSectionsHash"),
    status: requireConst(gate.status, expectedStatus, "answerReviewGatePort.result.answerReviewGate.status"),
    resultPersistenceStarted: requireConst(gate.resultPersistenceStarted, false, "answerReviewGatePort.result.answerReviewGate.resultPersistenceStarted"),
    tutoringResultRecorded: requireConst(gate.tutoringResultRecorded, false, "answerReviewGatePort.result.answerReviewGate.tutoringResultRecorded"),
    studentVisiblePublished: requireConst(gate.studentVisiblePublished, false, "answerReviewGatePort.result.answerReviewGate.studentVisiblePublished"),
  };
}

function buildReviewRecord(normalized, answerReviewGate, recordedAt) {
  const source = normalized.controlledAnswerArtifactResult;
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_PORT,
    status: recordedStatus,
    recordedAt,
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
    requestId: source.requestId,
    archiveItemId: source.archiveItemId,
    workerId: source.workerId,
    precheckId: source.precheckId,
    queueRef: source.queueRef,
    sourceControlledAnswerArtifact: {
      artifactId: source.controlledAnswerArtifact.artifactId,
      guidanceSectionsHash: source.guidanceSectionsHash,
      guidanceSectionCount: source.controlledAnswerArtifact.guidanceSections.length,
    },
    answerReviewGate,
    evidenceRefs: normalized.evidenceRefs,
    boundary: {
      controlledAnswerArtifactRequired: true,
      humanReviewCompleted: true,
      answerReviewGateRecorded: true,
      guidanceTextSentToPort: false,
      resultPersistenceStarted: false,
      tutoringResultRecorded: false,
      studentVisiblePublished: false,
      rawModelOutputExcluded: true,
      promptExcluded: true,
      answerKeyExcluded: true,
      contentRefExcluded: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      retrievalAllowed: false,
      swarmAllowed: false,
      futureResultPersistenceRequiresSeparateRuntime: true,
      futureStudentVisibilityRequiresSeparateRuntime: true,
    },
  };
}

function buildResult(record, { idempotentReplay }) {
  return { ...record, idempotentReplay };
}

function findExistingRecordByIdempotencyKey(filePath, idempotencyKey) {
  if (!fs.existsSync(filePath)) return undefined;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean)) {
    const record = JSON.parse(line);
    if (record.idempotencyKey === idempotencyKey) return record;
  }
  return undefined;
}

function assertReplayMatches(existing, normalized) {
  for (const [field, expected] of Object.entries({
    inputHash: normalized.inputHash,
    requestId: normalized.controlledAnswerArtifactResult.requestId,
    precheckId: normalized.controlledAnswerArtifactResult.precheckId,
    guidanceSectionsHash: normalized.controlledAnswerArtifactResult.guidanceSectionsHash,
  })) {
    if (existing[field] !== expected && existing.sourceControlledAnswerArtifact?.[field] !== expected) {
      throw reviewError("STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_IDEMPOTENCY_CONFLICT", `${field} does not match the existing review gate`);
    }
  }
}

function appendRecord(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`);
}

function assertReviewGatePort(port) {
  if (!port || typeof port.recordAnswerReviewGate !== "function") {
    throw reviewError("STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_PORT_MISSING", "answer review gate port is required");
  }
  return port;
}

function rejectLeakedFields(value, label) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectLeakedFields(item, `${label}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (leakedFieldNames.has(key.toLowerCase())) {
      throw reviewError("STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_LEAKED_FIELD", `${label}.${key} is not allowed`);
    }
    rejectLeakedFields(child, `${label}.${key}`);
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw reviewError("STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_INVALID_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireConst(value, expected, label) {
  if (value !== expected) throw reviewError("STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_CONST_MISMATCH", `${label} must be ${expected}`);
  return expected;
}

function requireToken(value, label, prefix) {
  const text = requireBoundedString(value, label, prefix.length + 1, 240);
  if (!text.startsWith(prefix)) throw reviewError("STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_BAD_TOKEN", `${label} must start with ${prefix}`);
  return text;
}

function requireBoundedString(value, label, minLength, maxLength) {
  if (typeof value !== "string") throw reviewError("STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_INVALID_STRING", `${label} must be a string`);
  const text = value.trim();
  if (text.length < minLength || text.length > maxLength) {
    throw reviewError("STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_STRING_BOUNDS", `${label} length is out of bounds`);
  }
  return text;
}

function requireSafeReviewText(value, label, minLength, maxLength) {
  const text = requireBoundedString(value, label, minLength, maxLength);
  if (unsafeReviewTextPattern.test(text)) {
    throw reviewError("STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_UNSAFE_TEXT", `${label} includes unsafe review text`);
  }
  return text;
}

function requireIsoString(value, label) {
  const text = requireBoundedString(value, label, 10, 80);
  if (Number.isNaN(Date.parse(text))) throw reviewError("STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_INVALID_TIME", `${label} must be a date-time string`);
  return text;
}

function requireOneOf(value, label, allowed) {
  if (!allowed.includes(value)) throw reviewError("STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_ENUM_MISMATCH", `${label} must be one of ${allowed.join(", ")}`);
  return value;
}

function requireArrayIncludes(value, expected, label) {
  if (!Array.isArray(value) || !value.includes(expected)) {
    throw reviewError("STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_MISSING_SCOPE", `${label} must include ${expected}`);
  }
}

function uniqueStringArray(value, label, minItems, maxItems, minLength, maxLength) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw reviewError("STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_ARRAY_BOUNDS", `${label} size is out of bounds`);
  }
  const seen = new Set();
  return value.map((item, index) => {
    const text = requireBoundedString(item, `${label}[${index}]`, minLength, maxLength);
    if (seen.has(text)) throw reviewError("STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_DUPLICATE_VALUE", `${label}[${index}] is duplicated`);
    seen.add(text);
    return text;
  });
}

function hashGuidanceSections(sections) {
  const metadata = sections.map((section) => ({
    sectionId: section.sectionId,
    title: section.title,
    textHash: hashInput(section.text),
    sourceBlockRefs: section.sourceBlockRefs,
  }));
  return hashInput(metadata);
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function reviewError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
