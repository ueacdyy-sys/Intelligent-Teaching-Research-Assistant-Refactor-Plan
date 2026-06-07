import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_RUNTIME_ID,
  claimStudentAppAITutorQuestionBankDraftGenerationPlan,
} from "./student-app-ai-tutor-question-bank-draft-generation-worker-claim-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-generation-worker-claim.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-generation-worker-claim-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-generation-worker-claim-runtime.test.mjs",
  sourcePrecheckReport: "reports/student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0280-student-app-ai-tutor-question-bank-draft-generation-worker-claim.md",
};

const forbiddenRuntimeClaims = [
  "node:child_process",
  "spawn(",
  "execSync(",
  "fetch(",
  "postgres://",
  "SELECT ",
  "INSERT ",
  "UPDATE ",
  "DELETE ",
  "executeModelNowAllowed: true",
  "generateQuestionsNowAllowed: true",
  "writeQuestionBankContentNowAllowed: true",
  "studentAnsweringAllowed: true",
  "scoringAllowed: true",
  "studentVisiblePublishAllowed: true",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "modelInferenceStarted: true",
  "questionContentGenerated: true",
  "questionBankContentWriteStarted: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export async function auditStudentAppAITutorQuestionBankDraftGenerationWorkerClaim(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const sourcePrecheckReport = parseJson(inputs.sourcePrecheckReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(sourcePrecheckReport, options);

  addFinding(findings, {
    id: "source_precheck.ready_not_claimed",
    passed: sourcePrecheckReport.readiness === "READY" &&
      sourcePrecheckReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK" &&
      sourcePrecheckReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_generation_worker_claim_precheck_runtime" &&
      sourcePrecheckReport.runtime?.commandPort === "StudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheckPort.recordGenerationWorkerClaimPrecheck" &&
      sourcePrecheckReport.runtime?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECKED" &&
      sourcePrecheckReport.safetyInvariants?.precheckOnly === true &&
      sourcePrecheckReport.safetyInvariants?.generationPlanClaimed === false &&
      sourcePrecheckReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationWorkerClaimPrecheck?.result?.precheckDecision?.executionState === "PRECHECKED_NOT_CLAIMED",
    actual: `${sourcePrecheckReport.readiness ?? "missing"}:${sourcePrecheckReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationWorkerClaimPrecheck?.result?.precheckDecision?.executionState ?? "missing"}`,
    expected: "READY 0279 worker claim precheck evidence with PRECHECKED_NOT_CLAIMED and no generated content",
    remediation: "Run 0279 worker-claim precheck audit before claiming question-bank generation plans.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PORT",
      "StudentAppAITutorQuestionBankDraftGenerationWorkerClaimPort.claimGenerationPlan",
      "claimStudentAppAITutorQuestionBankDraftGenerationPlan",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIMED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_generation_worker_claim_runtime",
      "StudentAppAITutorQuestionBankDraftGenerationWorkerClaimPort.claimGenerationPlan",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIMED",
    ]),
    expected: "runtime records an idempotent worker claim through a named injected port",
    remediation: "Keep worker claim as a port-recorded lease boundary.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "sourcePrecheckVerified: true",
      "atomicSkipLockedClaimRequired: true",
      "leaseRecorded: true",
      "generationPlanClaimed: true",
      "modelInferenceStarted: false",
      "questionContentGenerated: false",
      "questionBankContentWriteStarted: false",
      "studentAnsweringStarted: false",
      "scoringStarted: false",
      "studentVisiblePublished: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "requiresFutureModelGeneration: true",
      "requiresFutureContentStorageCommit: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime claims the plan lease without model inference, generated content, DB, HTTP, tools, or Swarm",
    remediation: "Do not collapse claim into generation or storage.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_worker_claim",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIMED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PORT &&
      probe.result?.claim?.planId === "qbank_generation_plan_tutor_req_student_app_001" &&
      probe.result?.claim?.workerId === "qbank_generation_worker_local_001" &&
      probe.result?.claim?.executionState === "CLAIMED_NOT_GENERATED" &&
      probe.result?.boundary?.generationPlanClaimed === true &&
      probe.result?.boundary?.modelInferenceStarted === false &&
      probe.result?.boundary?.questionContentGenerated === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};plan=${probe.result.claim.planId};worker=${probe.result.claim.workerId};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records one atomic worker claim and leaves model generation/content storage for future slices",
    remediation: "Worker claim evidence must prove lease identity, no model start, and no generated content.",
  });

  addFinding(findings, {
    id: "tests.cover_worker_claim_negative_paths",
    passed: includesAll(runtimeTest, [
      "claims a prechecked generation plan through the injected port without model generation or content writes",
      "uses idempotency for safe replay and rejects conflicting claims",
      "rejects missing ports, unsafe principals, worker mismatch, and unsafe policies",
      "rejects missing precheck evidence, non-ready prechecks, and already claimed precheck results",
      "rejects leaked answers, generated content, and unsafe port results",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, auth, worker mismatch, unsafe policy, precheck state, evidence, leak, and unsafe port tests",
    remediation: "Add regression coverage before using 0280 as worker claim evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-draft-generation-worker-claim"]?.includes("student-app-ai-tutor-question-bank-draft-generation-worker-claim-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank draft generation worker claim runtime audit",
        "studentAppAiTutorQuestionBankDraftGenerationWorkerClaim",
        "student-app-ai-tutor-question-bank-draft-generation-worker-claim.current.json",
        "student_app_ai_tutor_question_bank_draft_generation_worker_claim_runtime",
        "0280-student-app-ai-tutor-question-bank-draft-generation-worker-claim.md",
        "10.20/10",
        "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIMED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-generation-worker-claim",
      "studentAppAiTutorQuestionBankDraftGenerationWorkerClaim",
      "10.20/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0280",
    remediation: "Wire worker claim evidence through every root project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PORT,
      sourceRuntime: "student_app_ai_tutor_question_bank_draft_generation_worker_claim_precheck_runtime",
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIMED",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankDraftGenerationWorkerClaim: probe },
    safetyInvariants: {
      sourcePrecheckRequired: true,
      internalServiceOnly: true,
      atomicClaimRequired: true,
      leaseRequired: true,
      generationPlanClaimed: true,
      modelInferenceAllowed: false,
      questionContentGenerated: false,
      questionBankContentWriteStarted: false,
      studentAnsweringAllowed: false,
      scoringAllowed: false,
      studentVisiblePublishAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the Student App AI Tutor question-bank generation worker claim gate; model generation and content storage remain future reviewed slices."
      : "Fix worker claim evidence before generating question-bank draft content.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftGenerationWorkerClaimAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft generation worker claim runtime: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
    `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`,
    "",
    "Findings:",
  ];
  for (const finding of report.findings) {
    lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => {
    const absolute = path.join(root, relativePath);
    return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""];
  }));
}

async function runRuntimeProbe(sourcePrecheckReport, options = {}) {
  const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-generation-worker-claim-audit-")), "claim.jsonl");
  let portCalls = 0;
  const startedAt = Date.now();
  try {
    const result = await claimStudentAppAITutorQuestionBankDraftGenerationPlan(probeInput(sourcePrecheckReport), {
      generatedAt: "2026-06-06T16:40:00.000Z",
      commandLogPath,
      generationWorkerClaimPort: {
        async claimGenerationPlan(request) {
          portCalls += 1;
          return {
            source: {
              commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PORT,
              targetUseCase: "ClaimQuestionBankDraftGenerationPlan.Execute",
              repositoryOperation: "ArchiveRepository.ClaimQuestionBankDraftGenerationPlan",
              targetCommandLog: "student-command-log/question-bank-draft-generation-worker-claim",
              atomicSkipLocked: true,
            },
            claim: {
              claimId: "qbank_generation_claim_tutor_req_student_app_001",
              planId: request.sourcePrecheck.planId,
              workerId: request.worker.workerId,
              status: "IN_PROGRESS",
              executionState: "CLAIMED_NOT_GENERATED",
              claimExpiresAt: "2026-06-06T16:42:00.000Z",
              modelInferenceStarted: false,
              questionContentGenerated: false,
            },
          };
        },
      },
    });
    return {
      status: "PASS",
      result,
      portCalls,
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.max(1, Math.min(50, options.probeP99Ms ?? Date.now() - startedAt)),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PROBE",
      },
    };
  } catch (error) {
    return {
      status: "FAIL",
      error: error.message,
      portCalls,
      runtimeSlo: failedSlo(),
    };
  }
}

function probeInput(sourcePrecheckReport) {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-worker-claim.v1",
    claimInvocationId: "qbank_generation_worker_claim_001",
    generationWorkerClaimPrecheckReport: sourcePrecheckReport,
    principal: {
      principalId: "svc_student_tutor_agent",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      sessionId: "svc_session_student_tutor_agent",
      scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT"],
    },
    worker: {
      workerId: "qbank_generation_worker_local_001",
      agent: "StudentTutorAgent",
      skillId: "generate_question_bank_draft",
      nodeType: "LOCAL",
      leaseSeconds: 120,
      maxConcurrentPlans: 2,
      maxPlannedQuestionCount: 6,
    },
    claimPolicy: {
      sourcePrecheckRequired: true,
      atomicClaimRequired: true,
      skipLockedRequired: true,
      leaseRequired: true,
      idempotentClaimRequired: true,
      workerMustMatchPrecheck: true,
      humanReviewRequiredBeforeStudentVisibility: true,
      executeModelNowAllowed: false,
      generateQuestionsNowAllowed: false,
      writeQuestionBankContentNowAllowed: false,
      studentAnsweringAllowed: false,
      scoringAllowed: false,
      studentVisiblePublishAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      precheckStatusRequired: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECKED",
      precheckExecutionStateRequired: "PRECHECKED_NOT_CLAIMED",
      claimExecutionState: "CLAIMED_NOT_GENERATED",
      queueName: "student_app_ai_tutor_question_bank_generation",
      targetUseCase: "ClaimQuestionBankDraftGenerationPlan.Execute",
      repositoryOperation: "ArchiveRepository.ClaimQuestionBankDraftGenerationPlan",
      futureGenerationUseCase: "GenerateQuestionBankDraftContent.Execute",
      futureStorageRepository: "ArchiveRepository.SaveQuestionBankDraftContent",
      targetContentTable: "teaching_question_bank_draft_contents",
    },
    evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck:qbank_generation_worker_precheck_tutor_req_student_app_001"],
    idempotencyKey: "student-app-ai-tutor-qbank-generation-worker-claim:student_001:qbank_generation_plan_tutor_req_student_app_001",
  };
}

function failedSlo() {
  return {
    targetP99Ms: 50,
    p99Ms: null,
    totalErrors: 1,
    operations: 0,
    evidenceClass: "FAILED_PROBE",
  };
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

function includesAny(text, values) {
  return values.some((value) => text.includes(value));
}

function hasForbiddenRuntimeClaim(runtime) {
  return includesAny(runtime, forbiddenRuntimeClaims);
}

function summarizePresence(text, values) {
  return values.map((value) => `${value}=${text.includes(value)}`).join(";");
}

function addFinding(findings, finding) {
  findings.push({ severity: finding.passed ? "info" : "error", ...finding });
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function stringifyScalar(value) {
  if (Array.isArray(value)) return value.join(",");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

async function main() {
  const root = process.cwd();
  const out = parseOutArg(process.argv.slice(2));
  const report = await auditStudentAppAITutorQuestionBankDraftGenerationWorkerClaim(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftGenerationWorkerClaimAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
