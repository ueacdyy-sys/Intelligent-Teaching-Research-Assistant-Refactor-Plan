import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_generation_worker_claim_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PORT =
  "StudentAppAITutorQuestionBankDraftGenerationWorkerClaimPort.claimGenerationPlan";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_READY =
  "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_READY";

const inputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-worker-claim.v1";
const outputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-worker-claimed.v1";
const precheckSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-worker-claim-prechecked.v1";
const precheckRuntimeId = "student_app_ai_tutor_question_bank_draft_generation_worker_claim_precheck_runtime";
const precheckPort = "StudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheckPort.recordGenerationWorkerClaimPrecheck";
const precheckStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECKED";
const claimedStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIMED";
const defaultCommandLogPath = "reports/student-command-log/student-app-ai-tutor-question-bank-draft-generation-worker-claim.jsonl";

const leakedFieldNames = [
  "answerText",
  "answerKey",
  "correctAnswer",
  "expectedAnswer",
  "explanation",
  "scoreSummary",
  "rawModelOutput",
  "modelOutput",
  "generatedQuestion",
  "questionContent",
  "contentRows",
  "directSql",
  "dbUrl",
  "internalError",
  "errorMessage",
];

export async function claimStudentAppAITutorQuestionBankDraftGenerationPlan(input, options = {}) {
  const claimedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const commandLogPath = options.commandLogPath ?? defaultCommandLogPath;
  const existing = findExistingRecordByIdempotencyKey(commandLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const claimPort = assertClaimPort(options.generationWorkerClaimPort);
  const portResult = await claimPort.claimGenerationPlan(buildPortRequest(normalized));
  const claim = assertPortResult(portResult, normalized);
  const record = buildClaimRecord(normalized, claim, claimedAt);
  appendRecord(commandLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftGenerationWorkerClaim(result) {
  return [
    `Student App AI Tutor question-bank generation worker claim: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Plan: ${result.claim.planId}`,
    `Worker: ${result.claim.workerId}`,
    `Model started: ${result.boundary.modelInferenceStarted}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const claimInvocationId = requireToken(input.claimInvocationId, "input.claimInvocationId", "qbank_generation_worker_claim_");
  const precheckReport = assertPrecheckReport(input.generationWorkerClaimPrecheckReport);
  const precheck = assertPrecheckResult(precheckReport);
  const principal = assertPrincipal(input.principal, precheck);
  const worker = assertWorker(input.worker, precheck);
  const claimPolicy = assertClaimPolicy(input.claimPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 240);
  if (!evidenceRefs.some((ref) => ref.includes("generation-worker-claim-precheck"))) {
    throw claimError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_MISSING_PRECHECK_EVIDENCE", "worker claim precheck evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 300);
  const inputHash = hashInput({
    claimInvocationId,
    precheckId: precheck.precheckDecision.precheckId,
    planId: precheck.sourceGenerationPlan.planId,
    questionBankDraftRef: precheck.sourceGenerationPlan.questionBankDraftRef,
    workerId: worker.workerId,
    leaseSeconds: worker.leaseSeconds,
    claimPolicy,
  });
  return { claimInvocationId, precheckReport, precheck, principal, worker, claimPolicy, evidenceRefs, idempotencyKey, inputHash };
}

function assertPrecheckReport(report) {
  rejectLeakedFields(report, "input.generationWorkerClaimPrecheckReport");
  assertPlainObject(report, "input.generationWorkerClaimPrecheckReport");
  requireConst(report.readiness, "READY", "input.generationWorkerClaimPrecheckReport.readiness");
  requireConst(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK", "input.generationWorkerClaimPrecheckReport.workloadType");
  requireConst(report.runtime?.runtimeId, precheckRuntimeId, "input.generationWorkerClaimPrecheckReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, precheckPort, "input.generationWorkerClaimPrecheckReport.runtime.commandPort");
  requireConst(report.runtime?.status, precheckStatus, "input.generationWorkerClaimPrecheckReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.generationWorkerClaimPrecheckReport.runtimeSlo.totalErrors");
  const boundary = report.safetyInvariants ?? {};
  for (const field of ["sourceGenerationPlanRequired", "internalServiceOnly", "precheckOnly", "atomicLeaseRequired", "workerBudgetRequired"]) {
    requireConst(boundary[field], true, `input.generationWorkerClaimPrecheckReport.safetyInvariants.${field}`);
  }
  for (const field of [
    "generationPlanClaimed",
    "modelInferenceAllowed",
    "questionContentGenerated",
    "questionBankContentWriteStarted",
    "studentAnsweringAllowed",
    "scoringAllowed",
    "studentVisiblePublishAllowed",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(boundary[field], false, `input.generationWorkerClaimPrecheckReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertPrecheckResult(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationWorkerClaimPrecheck?.result;
  rejectLeakedFields(result, "source.precheckResult");
  assertPlainObject(result, "source.precheckResult");
  requireConst(result.schemaVersion, precheckSchemaVersion, "source.schemaVersion");
  requireConst(result.runtimeId, precheckRuntimeId, "source.runtimeId");
  requireConst(result.commandPort, precheckPort, "source.commandPort");
  requireConst(result.status, precheckStatus, "source.status");
  requireConst(result.boundary?.sourceGenerationPlanVerified, true, "source.boundary.sourceGenerationPlanVerified");
  requireConst(result.boundary?.workerLeasePolicyChecked, true, "source.boundary.workerLeasePolicyChecked");
  requireConst(result.boundary?.workerBudgetChecked, true, "source.boundary.workerBudgetChecked");
  requireConst(result.boundary?.precheckOnly, true, "source.boundary.precheckOnly");
  for (const field of [
    "generationPlanClaimed",
    "modelInferenceStarted",
    "questionContentGenerated",
    "questionBankContentWriteStarted",
    "studentAnsweringStarted",
    "scoringStarted",
    "studentVisiblePublished",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(result.boundary?.[field], false, `source.boundary.${field}`);
  }
  assertPlainObject(result.sourceGenerationPlan, "source.sourceGenerationPlan");
  assertPlainObject(result.worker, "source.worker");
  assertPlainObject(result.precheckDecision, "source.precheckDecision");
  requireConst(result.precheckDecision.claimReadiness, "ELIGIBLE_NOT_CLAIMED", "source.precheckDecision.claimReadiness");
  requireConst(result.precheckDecision.executionState, "PRECHECKED_NOT_CLAIMED", "source.precheckDecision.executionState");
  requireConst(result.precheckDecision.requiresFutureAtomicClaim, true, "source.precheckDecision.requiresFutureAtomicClaim");
  requireConst(result.sourceGenerationPlan.executionState, "PLAN_RECORDED_NOT_GENERATED", "source.sourceGenerationPlan.executionState");
  return {
    ...result,
    sourceGenerationPlan: {
      runtimeId: requireConst(result.sourceGenerationPlan.runtimeId, "student_app_ai_tutor_question_bank_draft_generation_plan_runtime", "source.sourceGenerationPlan.runtimeId"),
      planId: requireToken(result.sourceGenerationPlan.planId, "source.sourceGenerationPlan.planId", "qbank_generation_plan_"),
      questionBankDraftRef: requireQuestionBankDraftRef(result.sourceGenerationPlan.questionBankDraftRef, "source.sourceGenerationPlan.questionBankDraftRef"),
      sourceRequestId: requireToken(result.sourceGenerationPlan.sourceRequestId, "source.sourceGenerationPlan.sourceRequestId", "tutor_req_"),
      archiveItemId: requireToken(result.sourceGenerationPlan.archiveItemId, "source.sourceGenerationPlan.archiveItemId", "tarch_"),
      studentId: requireBoundedString(result.sourceGenerationPlan.studentId, "source.sourceGenerationPlan.studentId", 1, 128),
      plannedQuestionCount: requireIntegerBetween(result.sourceGenerationPlan.plannedQuestionCount, "source.sourceGenerationPlan.plannedQuestionCount", 1, 20),
      maxPromptTokens: requireIntegerBetween(result.sourceGenerationPlan.maxPromptTokens, "source.sourceGenerationPlan.maxPromptTokens", 128, 8000),
      maxGenerationAttempts: requireIntegerBetween(result.sourceGenerationPlan.maxGenerationAttempts, "source.sourceGenerationPlan.maxGenerationAttempts", 1, 3),
      executionState: "PLAN_RECORDED_NOT_GENERATED",
    },
    worker: {
      workerId: requireBoundedString(result.worker.workerId, "source.worker.workerId", 1, 128),
      agent: requireConst(result.worker.agent, "StudentTutorAgent", "source.worker.agent"),
      skillId: requireConst(result.worker.skillId, "generate_question_bank_draft", "source.worker.skillId"),
      nodeType: requireConst(result.worker.nodeType, "LOCAL", "source.worker.nodeType"),
      leaseSeconds: requireIntegerBetween(result.worker.leaseSeconds, "source.worker.leaseSeconds", 30, 3600),
      maxConcurrentPlans: requireIntegerBetween(result.worker.maxConcurrentPlans, "source.worker.maxConcurrentPlans", 1, 16),
      maxPlannedQuestionCount: requireIntegerBetween(result.worker.maxPlannedQuestionCount, "source.worker.maxPlannedQuestionCount", 1, 20),
    },
    precheckDecision: {
      precheckId: requireToken(result.precheckDecision.precheckId, "source.precheckDecision.precheckId", "qbank_generation_worker_precheck_"),
      claimReadiness: "ELIGIBLE_NOT_CLAIMED",
      queueName: requireConst(result.precheckDecision.queueName, "student_app_ai_tutor_question_bank_generation", "source.precheckDecision.queueName"),
      executionState: "PRECHECKED_NOT_CLAIMED",
    },
  };
}

function assertPrincipal(principal, precheck) {
  assertPlainObject(principal, "input.principal");
  const principalId = requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128);
  requireConst(principal.subjectType, "SERVICE", "input.principal.subjectType");
  requireConst(principal.role, "SERVICE", "input.principal.role");
  requireConst(principal.entryPoint, "AGENT_INTERNAL", "input.principal.entryPoint");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 1, 32);
  for (const required of ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT"]) {
    if (!scopes.includes(required)) {
      throw claimError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_MISSING_SCOPE", `${required} is required`);
    }
  }
  return {
    principalId,
    subjectType: "SERVICE",
    role: "SERVICE",
    entryPoint: "AGENT_INTERNAL",
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 128),
    scopes,
    sourcePrecheckId: precheck.precheckDecision.precheckId,
  };
}

function assertWorker(worker, precheck) {
  assertPlainObject(worker, "input.worker");
  const workerId = requireBoundedString(worker.workerId, "input.worker.workerId", 1, 128);
  requireConst(workerId, precheck.worker.workerId, "input.worker.workerId");
  requireConst(worker.agent, precheck.worker.agent, "input.worker.agent");
  requireConst(worker.skillId, precheck.worker.skillId, "input.worker.skillId");
  requireConst(worker.nodeType, precheck.worker.nodeType, "input.worker.nodeType");
  const leaseSeconds = requireIntegerBetween(worker.leaseSeconds, "input.worker.leaseSeconds", 30, 3600);
  requireConst(leaseSeconds, precheck.worker.leaseSeconds, "input.worker.leaseSeconds");
  const maxConcurrentPlans = requireIntegerBetween(worker.maxConcurrentPlans, "input.worker.maxConcurrentPlans", 1, 16);
  requireConst(maxConcurrentPlans, precheck.worker.maxConcurrentPlans, "input.worker.maxConcurrentPlans");
  const maxPlannedQuestionCount = requireIntegerBetween(worker.maxPlannedQuestionCount, "input.worker.maxPlannedQuestionCount", 1, 20);
  requireConst(maxPlannedQuestionCount, precheck.worker.maxPlannedQuestionCount, "input.worker.maxPlannedQuestionCount");
  return { workerId, agent: precheck.worker.agent, skillId: precheck.worker.skillId, nodeType: precheck.worker.nodeType, leaseSeconds, maxConcurrentPlans, maxPlannedQuestionCount };
}

function assertClaimPolicy(policy) {
  assertPlainObject(policy, "input.claimPolicy");
  for (const field of [
    "sourcePrecheckRequired",
    "atomicClaimRequired",
    "skipLockedRequired",
    "leaseRequired",
    "idempotentClaimRequired",
    "workerMustMatchPrecheck",
    "humanReviewRequiredBeforeStudentVisibility",
  ]) {
    requireConst(policy[field], true, `input.claimPolicy.${field}`);
  }
  for (const field of [
    "executeModelNowAllowed",
    "generateQuestionsNowAllowed",
    "writeQuestionBankContentNowAllowed",
    "studentAnsweringAllowed",
    "scoringAllowed",
    "studentVisiblePublishAllowed",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    requireConst(policy[field], false, `input.claimPolicy.${field}`);
  }
  requireConst(policy.precheckStatusRequired, precheckStatus, "input.claimPolicy.precheckStatusRequired");
  requireConst(policy.precheckExecutionStateRequired, "PRECHECKED_NOT_CLAIMED", "input.claimPolicy.precheckExecutionStateRequired");
  requireConst(policy.claimExecutionState, "CLAIMED_NOT_GENERATED", "input.claimPolicy.claimExecutionState");
  requireConst(policy.queueName, "student_app_ai_tutor_question_bank_generation", "input.claimPolicy.queueName");
  requireConst(policy.targetUseCase, "ClaimQuestionBankDraftGenerationPlan.Execute", "input.claimPolicy.targetUseCase");
  requireConst(policy.repositoryOperation, "ArchiveRepository.ClaimQuestionBankDraftGenerationPlan", "input.claimPolicy.repositoryOperation");
  requireConst(policy.futureGenerationUseCase, "GenerateQuestionBankDraftContent.Execute", "input.claimPolicy.futureGenerationUseCase");
  requireConst(policy.futureStorageRepository, "ArchiveRepository.SaveQuestionBankDraftContent", "input.claimPolicy.futureStorageRepository");
  requireConst(policy.targetContentTable, "teaching_question_bank_draft_contents", "input.claimPolicy.targetContentTable");
  return { ...policy };
}

function assertClaimPort(port) {
  if (!port || typeof port.claimGenerationPlan !== "function") {
    throw claimError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_MISSING_PORT", "GenerationWorkerClaimPort.claimGenerationPlan is required");
  }
  return port;
}

function buildPortRequest(normalized) {
  return {
    portName: "StudentAppAITutorQuestionBankDraftGenerationWorkerClaimPort",
    operation: "claimGenerationPlan",
    targetUseCase: "ClaimQuestionBankDraftGenerationPlan.Execute",
    repositoryOperation: "ArchiveRepository.ClaimQuestionBankDraftGenerationPlan",
    queueName: "student_app_ai_tutor_question_bank_generation",
    targetCommandLog: "student-command-log/question-bank-draft-generation-worker-claim",
    principal: normalized.principal,
    worker: normalized.worker,
    sourcePrecheck: {
      precheckId: normalized.precheck.precheckDecision.precheckId,
      planId: normalized.precheck.sourceGenerationPlan.planId,
      questionBankDraftRef: normalized.precheck.sourceGenerationPlan.questionBankDraftRef,
      sourceRequestId: normalized.precheck.sourceGenerationPlan.sourceRequestId,
      archiveItemId: normalized.precheck.sourceGenerationPlan.archiveItemId,
      studentId: normalized.precheck.sourceGenerationPlan.studentId,
      executionState: normalized.precheck.precheckDecision.executionState,
    },
    idempotencyKey: normalized.idempotencyKey,
    evidenceRefs: uniq([
      ...normalized.evidenceRefs,
      `evidence:question-bank-generation-worker-claim-input-hash:${normalized.inputHash}`,
      `evidence:source-runtime:${precheckRuntimeId}`,
    ]),
    safety: {
      sourcePrecheckRequired: true,
      atomicClaimRequired: true,
      skipLockedRequired: true,
      leaseRequired: true,
      executeModelNowAllowed: false,
      generateQuestionsNowAllowed: false,
      writeQuestionBankContentNowAllowed: false,
      studentVisiblePublishAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
  };
}

function assertPortResult(portResult, normalized) {
  assertPlainObject(portResult, "portResult");
  assertPlainObject(portResult.source, "portResult.source");
  requireConst(portResult.source.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PORT, "portResult.source.commandPort");
  requireConst(portResult.source.targetUseCase, "ClaimQuestionBankDraftGenerationPlan.Execute", "portResult.source.targetUseCase");
  requireConst(portResult.source.repositoryOperation, "ArchiveRepository.ClaimQuestionBankDraftGenerationPlan", "portResult.source.repositoryOperation");
  requireConst(portResult.source.targetCommandLog, "student-command-log/question-bank-draft-generation-worker-claim", "portResult.source.targetCommandLog");
  requireConst(portResult.source.atomicSkipLocked, true, "portResult.source.atomicSkipLocked");
  assertPlainObject(portResult.claim, "portResult.claim");
  requireConst(portResult.claim.planId, normalized.precheck.sourceGenerationPlan.planId, "portResult.claim.planId");
  requireConst(portResult.claim.workerId, normalized.worker.workerId, "portResult.claim.workerId");
  requireConst(portResult.claim.status, "IN_PROGRESS", "portResult.claim.status");
  requireConst(portResult.claim.executionState, "CLAIMED_NOT_GENERATED", "portResult.claim.executionState");
  requireConst(portResult.claim.modelInferenceStarted, false, "portResult.claim.modelInferenceStarted");
  requireConst(portResult.claim.questionContentGenerated, false, "portResult.claim.questionContentGenerated");
  return {
    claimId: requireToken(portResult.claim.claimId, "portResult.claim.claimId", "qbank_generation_claim_"),
    planId: normalized.precheck.sourceGenerationPlan.planId,
    questionBankDraftRef: normalized.precheck.sourceGenerationPlan.questionBankDraftRef,
    sourceRequestId: normalized.precheck.sourceGenerationPlan.sourceRequestId,
    archiveItemId: normalized.precheck.sourceGenerationPlan.archiveItemId,
    studentId: normalized.precheck.sourceGenerationPlan.studentId,
    workerId: normalized.worker.workerId,
    leaseSeconds: normalized.worker.leaseSeconds,
    claimExpiresAt: requireBoundedString(portResult.claim.claimExpiresAt, "portResult.claim.claimExpiresAt", 1, 80),
    status: "IN_PROGRESS",
    executionState: "CLAIMED_NOT_GENERATED",
  };
}

function buildClaimRecord(normalized, claim, claimedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM",
    recordId: `student_app_ai_tutor_question_bank_draft_generation_worker_claim_${safeToken(normalized.idempotencyKey)}`,
    claimedAt,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PORT,
    status: claimedStatus,
    claimInvocationId: normalized.claimInvocationId,
    sourcePrecheck: {
      runtimeId: precheckRuntimeId,
      precheckId: normalized.precheck.precheckDecision.precheckId,
      precheckStatus,
      precheckExecutionState: normalized.precheck.precheckDecision.executionState,
    },
    principal: normalized.principal,
    worker: normalized.worker,
    claim,
    boundary: {
      internalServiceOnly: true,
      sourcePrecheckVerified: true,
      atomicSkipLockedClaimRequired: true,
      leaseRecorded: true,
      generationPlanClaimed: true,
      modelInferenceStarted: false,
      questionContentGenerated: false,
      questionBankContentWriteStarted: false,
      studentAnsweringStarted: false,
      scoringStarted: false,
      studentVisiblePublished: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureModelGeneration: true,
      requiresFutureContentStorageCommit: true,
    },
    evidenceRefs: uniq([
      ...normalized.evidenceRefs,
      `evidence:question-bank-generation-worker-claim-input-hash:${normalized.inputHash}`,
      `evidence:runtime:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_RUNTIME_ID}`,
      `evidence:command-port:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PORT}`,
      `evidence:source-runtime:${precheckRuntimeId}`,
    ]),
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: 7,
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PROBE",
    },
  };
}

function buildResult(record, { idempotentReplay }) {
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PORT,
    status: record.status,
    recordId: record.recordId,
    claimedAt: record.claimedAt,
    sourcePrecheck: record.sourcePrecheck,
    worker: record.worker,
    claim: record.claim,
    boundary: record.boundary,
    evidenceRefs: record.evidenceRefs,
    idempotencyKey: record.idempotencyKey,
    runtimeSlo: record.runtimeSlo,
    idempotentReplay,
  };
}

function findExistingRecordByIdempotencyKey(filePath, idempotencyKey) {
  if (!fs.existsSync(filePath)) return null;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/u).filter(Boolean)) {
    const record = JSON.parse(line);
    if (record.idempotencyKey === idempotencyKey) return record;
  }
  return null;
}

function assertReplayMatches(record, normalized) {
  requireConst(record.inputHash, normalized.inputHash, "record.inputHash");
  requireConst(record.sourcePrecheck?.precheckId, normalized.precheck.precheckDecision.precheckId, "record.sourcePrecheck.precheckId");
  requireConst(record.claim?.planId, normalized.precheck.sourceGenerationPlan.planId, "record.claim.planId");
  requireConst(record.claim?.workerId, normalized.worker.workerId, "record.claim.workerId");
}

function appendRecord(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`);
}

function rejectLeakedFields(value, label) {
  if (!value || typeof value !== "object") return;
  for (const field of leakedFieldNames) {
    if (Object.prototype.hasOwnProperty.call(value, field) && hasText(value[field])) {
      throw claimError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_LEAKED_FIELD", `${label}.${field} is not allowed`);
    }
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "generationWorkerClaimPrecheckReport") continue;
    if (child && typeof child === "object") rejectLeakedFields(child, `${label}.${key}`);
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw claimError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_INVALID_INPUT", `${label} must be an object`);
  }
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw claimError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_INVALID_INPUT", `${label} must be ${expected}`);
  }
  return expected;
}

function requireToken(value, label, prefix) {
  const text = requireBoundedString(value, label, prefix.length + 1, 1000);
  if (!text.startsWith(prefix)) {
    throw claimError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_INVALID_TOKEN", `${label} must start with ${prefix}`);
  }
  return text;
}

function requireQuestionBankDraftRef(value, label) {
  const text = requireBoundedString(value, label, 1, 1000);
  if (!text.startsWith("local://question-bank-drafts/")) {
    throw claimError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_INVALID_DRAFT_REF", `${label} must use local://question-bank-drafts/`);
  }
  return text;
}

function requireBoundedString(value, label, min, max) {
  if (typeof value !== "string" || value.length < min || value.length > max) {
    throw claimError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_INVALID_INPUT", `${label} must be a string between ${min} and ${max} chars`);
  }
  return value;
}

function uniqueStringArray(value, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max || !value.every((item) => typeof item === "string" && item.length > 0)) {
    throw claimError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_INVALID_INPUT", `${label} must contain ${min}-${max} strings`);
  }
  return uniq(value);
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw claimError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_INVALID_INTEGER", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeToken(value) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 180);
}

function hasText(value) {
  return typeof value === "string" ? value.length > 0 : value !== undefined && value !== null;
}

function uniq(items) {
  return [...new Set(items)];
}

function claimError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}
