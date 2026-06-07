import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_WORKER_CLAIM_RUNTIME_ID = "student_app_ai_tutor_worker_claim_runtime";
export const STUDENT_APP_AI_TUTOR_WORKER_CLAIM_COMMAND_PORT = "StudentAppAITutorWorkerClaimPort.claimTutoringAnalysisRequest";
export const STUDENT_APP_AI_TUTOR_WORKER_CLAIM_READY = "STUDENT_APP_AI_TUTOR_WORKER_CLAIM_RUNTIME_READY";

const inputSchemaVersion = "2026-06-05.student-app.ai-tutor-worker-claim.v1";
const outputSchemaVersion = "2026-06-05.student-app.ai-tutor-worker-claim-recorded.v1";
const defaultClaimLogPath = "reports/student-command-log/student-app-ai-tutor-worker-claim.jsonl";

export async function claimStudentAppAITutorWorkerRequest(input, deps = {}, options = {}) {
  const claimedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const claimLogPath = options.claimLogPath ?? defaultClaimLogPath;
  const existing = findExistingRecordByIdempotencyKey(claimLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const claimPort = assertClaimPort(deps.studentAppAITutorWorkerClaimPort);
  const portResult = await claimPort.claimTutoringAnalysisRequest(buildPortRequest(normalized));
  const claim = assertPortResult(portResult, normalized);
  const record = buildClaimRecord(normalized, claim, claimedAt);
  appendRecord(claimLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorWorkerClaim(result) {
  return [
    `Student App AI Tutor worker claim: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Worker: ${result.claim.workerId}`,
    `Claim found: ${result.claim.found}`,
    `Model started: ${result.boundary.modelExecutionStarted}`,
  ].join("\n");
}

function normalizeInput(input) {
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const claimInvocationId = requireString(input.claimInvocationId, "input.claimInvocationId");
  const principal = assertPrincipal(input.principal);
  const worker = assertWorker(input.worker);
  const policy = assertClaimPolicy(input.claimPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 160);
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 240);
  const inputHash = hashInput({
    claimInvocationId,
    principalId: principal.principalId,
    workerId: worker.workerId,
    leaseSeconds: worker.leaseSeconds,
    policy,
  });
  return { claimInvocationId, principal, worker, policy, evidenceRefs, idempotencyKey, inputHash };
}

function assertPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const principalId = requireString(principal.principalId, "input.principal.principalId");
  requireConst(principal.subjectType, "SERVICE", "input.principal.subjectType");
  requireConst(principal.role, "SERVICE", "input.principal.role");
  requireConst(principal.entryPoint, "AGENT_INTERNAL", "input.principal.entryPoint");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  if (!scopes.includes("TEACHING_WRITE")) {
    throw claimError("STUDENT_APP_AI_TUTOR_WORKER_CLAIM_MISSING_SCOPE", "TEACHING_WRITE is required");
  }
  return {
    ...principal,
    principalId,
    sessionId: requireString(principal.sessionId, "input.principal.sessionId"),
    scopes,
  };
}

function assertWorker(worker) {
  assertPlainObject(worker, "input.worker");
  const workerId = requireBoundedString(worker.workerId, "input.worker.workerId", 1, 128);
  requireConst(worker.agent, "StudentTutorAgent", "input.worker.agent");
  requireConst(worker.skillId, "tutor_student", "input.worker.skillId");
  requireConst(worker.nodeType, "LOCAL", "input.worker.nodeType");
  const leaseSeconds = requireIntegerBetween(worker.leaseSeconds, "input.worker.leaseSeconds", 30, 3600);
  const maxConcurrentClaims = requireIntegerBetween(worker.maxConcurrentClaims ?? 1, "input.worker.maxConcurrentClaims", 1, 8);
  return { ...worker, workerId, leaseSeconds, maxConcurrentClaims };
}

function assertClaimPolicy(policy) {
  assertPlainObject(policy, "input.claimPolicy");
  for (const field of ["atomicSkipLockedRequired", "leaseRequired"]) {
    requireConst(policy[field], true, `input.claimPolicy.${field}`);
  }
  for (const field of [
    "executeModelNowAllowed",
    "recordResultNowAllowed",
    "questionBankDraftNowAllowed",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.claimPolicy.${field}`);
  }
  requireConst(policy.queueName, "student_app_ai_tutor", "input.claimPolicy.queueName");
  requireConst(policy.queueTable, "teaching_tutoring_analysis_requests", "input.claimPolicy.queueTable");
  requireConst(policy.targetUseCase, "ClaimTutoringAnalysisRequest.Execute", "input.claimPolicy.targetUseCase");
  requireConst(policy.repositoryOperation, "ArchiveRepository.ClaimNextTutoringAnalysisRequest", "input.claimPolicy.repositoryOperation");
  return { ...policy };
}

function assertClaimPort(port) {
  if (!port || typeof port.claimTutoringAnalysisRequest !== "function") {
    throw claimError("STUDENT_APP_AI_TUTOR_WORKER_CLAIM_MISSING_PORT", "StudentAppAITutorWorkerClaimPort.claimTutoringAnalysisRequest is required");
  }
  return port;
}

function buildPortRequest(normalized) {
  return {
    portName: "StudentAppAITutorWorkerClaimPort",
    operation: "claimTutoringAnalysisRequest",
    targetUseCase: "ClaimTutoringAnalysisRequest.Execute",
    repositoryOperation: "ArchiveRepository.ClaimNextTutoringAnalysisRequest",
    queueName: "student_app_ai_tutor",
    queueTable: "teaching_tutoring_analysis_requests",
    principal: normalized.principal,
    workerId: normalized.worker.workerId,
    leaseSeconds: normalized.worker.leaseSeconds,
    idempotencyKey: normalized.idempotencyKey,
    evidenceRefs: uniq([
      ...normalized.evidenceRefs,
      `evidence:student-app-ai-tutor-worker-claim-input-hash:${normalized.inputHash}`,
    ]),
    safety: {
      atomicSkipLockedRequired: true,
      leaseRequired: true,
      executeModelNowAllowed: false,
      recordResultNowAllowed: false,
      questionBankDraftNowAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
  };
}

function assertPortResult(portResult, normalized) {
  assertPlainObject(portResult, "portResult");
  assertPlainObject(portResult.source, "portResult.source");
  requireConst(portResult.source.targetUseCase, "ClaimTutoringAnalysisRequest.Execute", "portResult.source.targetUseCase");
  requireConst(portResult.source.repositoryOperation, "ArchiveRepository.ClaimNextTutoringAnalysisRequest", "portResult.source.repositoryOperation");
  requireConst(portResult.source.queueTable, "teaching_tutoring_analysis_requests", "portResult.source.queueTable");
  requireConst(portResult.source.atomicSkipLocked, true, "portResult.source.atomicSkipLocked");
  const found = portResult.claim?.found === true;
  if (!found) {
    return {
      found: false,
      workerId: normalized.worker.workerId,
      leaseSeconds: normalized.worker.leaseSeconds,
      status: "NO_CLAIM",
    };
  }
  assertPlainObject(portResult.claim, "portResult.claim");
  requireConst(portResult.claim.status, "IN_PROGRESS", "portResult.claim.status");
  requireConst(portResult.claim.claimedByWorkerId, normalized.worker.workerId, "portResult.claim.claimedByWorkerId");
  return {
    found: true,
    requestId: requireTutorRequestId(portResult.claim.requestId, "portResult.claim.requestId"),
    archiveItemId: requireArchiveItemId(portResult.claim.archiveItemId, "portResult.claim.archiveItemId"),
    sourceArchiveStudentId: requireString(portResult.claim.sourceArchiveStudentId, "portResult.claim.sourceArchiveStudentId"),
    questionBankIntent: requireEnum(portResult.claim.questionBankIntent, "portResult.claim.questionBankIntent", ["NONE", "GENERATE_PERSONALIZED_CHECK"]),
    status: "IN_PROGRESS",
    workerId: normalized.worker.workerId,
    leaseSeconds: normalized.worker.leaseSeconds,
    claimExpiresAt: requireString(portResult.claim.claimExpiresAt, "portResult.claim.claimExpiresAt"),
  };
}

function buildClaimRecord(normalized, claim, claimedAt) {
  return {
    schemaVersion: inputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_WORKER_CLAIM",
    recordId: `student_app_ai_tutor_worker_claim_${safeToken(normalized.idempotencyKey)}`,
    recordedAt: claimedAt,
    commandPort: STUDENT_APP_AI_TUTOR_WORKER_CLAIM_COMMAND_PORT,
    status: claim.found ? "STUDENT_APP_AI_TUTOR_WORKER_CLAIMED" : "STUDENT_APP_AI_TUTOR_WORKER_NO_CLAIM",
    claimInvocationId: normalized.claimInvocationId,
    principal: normalized.principal,
    worker: normalized.worker,
    queue: {
      queueName: "student_app_ai_tutor",
      queueTable: "teaching_tutoring_analysis_requests",
      targetUseCase: "ClaimTutoringAnalysisRequest.Execute",
      repositoryOperation: "ArchiveRepository.ClaimNextTutoringAnalysisRequest",
    },
    claim,
    boundary: {
      internalServiceOnly: true,
      atomicSkipLockedClaimRequired: true,
      leaseRecorded: claim.found,
      modelExecutionStarted: false,
      resultRecorded: false,
      questionBankDraftCreated: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: normalized.evidenceRefs,
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: 6,
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STUDENT_APP_AI_TUTOR_WORKER_CLAIM_PROBE",
    },
  };
}

function buildResult(record, options) {
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: STUDENT_APP_AI_TUTOR_WORKER_CLAIM_RUNTIME_ID,
    commandPort: record.commandPort,
    status: record.status,
    queue: record.queue,
    claim: record.claim,
    boundary: record.boundary,
    evidenceRefs: record.evidenceRefs,
    runtimeSlo: record.runtimeSlo,
    idempotentReplay: options.idempotentReplay,
  };
}

function findExistingRecordByIdempotencyKey(logPath, idempotencyKey) {
  if (!fs.existsSync(logPath)) return null;
  const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const record = JSON.parse(line);
    if (record.idempotencyKey === idempotencyKey) return record;
  }
  return null;
}

function assertReplayMatches(existing, normalized) {
  if (existing.inputHash !== normalized.inputHash) {
    throw claimError("STUDENT_APP_AI_TUTOR_WORKER_CLAIM_IDEMPOTENCY_CONFLICT", "idempotency key already exists for a different worker claim");
  }
}

function appendRecord(logPath, record) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`);
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function uniq(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))];
}

function uniqueStringArray(value, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw claimError("STUDENT_APP_AI_TUTOR_WORKER_CLAIM_INVALID_ARRAY", `${label} must contain ${min}-${max} items`);
  }
  const normalized = uniq(value.map((item) => requireString(item, `${label}[]`)));
  if (normalized.length < min) throw claimError("STUDENT_APP_AI_TUTOR_WORKER_CLAIM_INVALID_ARRAY", `${label} must contain unique items`);
  return normalized;
}

function requireArchiveItemId(value, label) {
  const text = requireString(value, label);
  if (!text.startsWith("tarch_")) throw claimError("STUDENT_APP_AI_TUTOR_WORKER_CLAIM_ARCHIVE_ITEM_ID", `${label} must use tarch_ prefix`);
  return text;
}

function requireTutorRequestId(value, label) {
  const text = requireString(value, label);
  if (!text.startsWith("tutor_req_")) throw claimError("STUDENT_APP_AI_TUTOR_WORKER_CLAIM_REQUEST_ID", `${label} must use tutor_req_ prefix`);
  return text;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw claimError("STUDENT_APP_AI_TUTOR_WORKER_CLAIM_INVALID_INTEGER", `${label} must be between ${min} and ${max}`);
  }
  return value;
}

function requireBoundedString(value, label, min, max) {
  const text = requireString(value, label);
  if (text.length < min || text.length > max) {
    throw claimError("STUDENT_APP_AI_TUTOR_WORKER_CLAIM_INVALID_TEXT", `${label} must be ${min}-${max} characters`);
  }
  return text;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw claimError("STUDENT_APP_AI_TUTOR_WORKER_CLAIM_REQUIRED", `${label} is required`);
  }
  return value.trim();
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw claimError("STUDENT_APP_AI_TUTOR_WORKER_CLAIM_CONST", `${label} must be ${expected}`);
  }
  return actual;
}

function requireEnum(value, label, allowed) {
  const text = requireString(value, label);
  if (!allowed.includes(text)) throw claimError("STUDENT_APP_AI_TUTOR_WORKER_CLAIM_ENUM", `${label} is unsupported`);
  return text;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw claimError("STUDENT_APP_AI_TUTOR_WORKER_CLAIM_OBJECT", `${label} must be an object`);
  }
}

function safeToken(value) {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function claimError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
