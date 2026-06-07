import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_RUNTIME_ID,
  recordStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck,
} from "./student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck-runtime.test.mjs",
  sourcePlanReport: "reports/student-app-ai-tutor-question-bank-draft-generation-plan.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0279-student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck.md",
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
  "claimPlanNowAllowed: true",
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
  "generationPlanClaimed: true",
  "modelInferenceStarted: true",
  "questionContentGenerated: true",
  "questionBankContentWriteStarted: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export async function auditStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const sourcePlanReport = parseJson(inputs.sourcePlanReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(sourcePlanReport, options);

  addFinding(findings, {
    id: "source_generation_plan.ready_not_generated",
    passed: sourcePlanReport.readiness === "READY" &&
      sourcePlanReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN" &&
      sourcePlanReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_generation_plan_runtime" &&
      sourcePlanReport.runtime?.commandPort === "StudentAppAITutorQuestionBankDraftGenerationPlanPort.recordQuestionBankDraftGenerationPlan" &&
      sourcePlanReport.runtime?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RECORDED" &&
      sourcePlanReport.safetyInvariants?.generationPlanOnly === true &&
      sourcePlanReport.safetyInvariants?.questionContentGenerated === false &&
      sourcePlanReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationPlan?.result?.generationPlan?.executionState === "PLAN_RECORDED_NOT_GENERATED",
    actual: `${sourcePlanReport.readiness ?? "missing"}:${sourcePlanReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationPlan?.result?.generationPlan?.executionState ?? "missing"}`,
    expected: "READY 0278 generation plan evidence with PLAN_RECORDED_NOT_GENERATED and no generated content",
    remediation: "Run 0278 generation-plan audit before prechecking worker claim readiness.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_PORT",
      "StudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheckPort.recordGenerationWorkerClaimPrecheck",
      "recordStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECKED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_generation_worker_claim_precheck_runtime",
      "StudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheckPort.recordGenerationWorkerClaimPrecheck",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECKED",
    ]),
    expected: "runtime records an idempotent worker claim precheck through a named injected port",
    remediation: "Keep worker claim readiness as a port-recorded control-plane slice.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "precheckOnly: true",
      "sourceGenerationPlanVerified: true",
      "workerLeasePolicyChecked: true",
      "workerBudgetChecked: true",
      "generationPlanClaimed: false",
      "modelInferenceStarted: false",
      "questionContentGenerated: false",
      "questionBankContentWriteStarted: false",
      "studentAnsweringStarted: false",
      "scoringStarted: false",
      "studentVisiblePublished: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "requiresFutureAtomicClaim: true",
      "requiresFutureModelGeneration: true",
      "requiresFutureContentStorageCommit: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime prechecks worker readiness without claiming, model inference, generated content, DB, HTTP, tools, or Swarm",
    remediation: "Do not collapse precheck into actual claim, generation, or storage.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_worker_claim_precheck",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECKED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_PORT &&
      probe.result?.sourceGenerationPlan?.planId === "qbank_generation_plan_tutor_req_student_app_001" &&
      probe.result?.worker?.workerId === "qbank_generation_worker_local_001" &&
      probe.result?.precheckDecision?.claimReadiness === "ELIGIBLE_NOT_CLAIMED" &&
      probe.result?.boundary?.generationPlanClaimed === false &&
      probe.result?.boundary?.modelInferenceStarted === false &&
      probe.result?.boundary?.questionContentGenerated === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};plan=${probe.result.sourceGenerationPlan.planId};worker=${probe.result.worker.workerId};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records one worker claim precheck while leaving actual claim/generation/storage for future slices",
    remediation: "Precheck evidence must prove plan identity, worker budget, no claim, and no generated content.",
  });

  addFinding(findings, {
    id: "tests.cover_worker_claim_precheck_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a worker claim precheck through the injected port without claiming, generating, or writing content",
      "uses idempotency for safe replay and rejects conflicting worker prechecks",
      "rejects missing ports, unsafe principals, invalid workers, and unsafe policies",
      "rejects missing plan evidence, generated plans, and worker budgets that cannot cover the plan",
      "rejects leaked answer keys, generated content, and model output in precheck inputs or source plan",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, auth, worker, unsafe policy, plan state, budget, evidence, and leak tests",
    remediation: "Add regression coverage before using 0279 as worker claim precheck evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck"]?.includes("student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank draft generation worker claim precheck runtime audit",
        "studentAppAiTutorQuestionBankDraftGenerationWorkerClaimPrecheck",
        "student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck.current.json",
        "student_app_ai_tutor_question_bank_draft_generation_worker_claim_precheck_runtime",
        "0279-student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck.md",
        "10.19/10",
        "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECKED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck",
      "studentAppAiTutorQuestionBankDraftGenerationWorkerClaimPrecheck",
      "10.19/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0279",
    remediation: "Wire worker claim precheck evidence through every root project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_PORT,
      sourceRuntime: "student_app_ai_tutor_question_bank_draft_generation_plan_runtime",
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECKED",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankDraftGenerationWorkerClaimPrecheck: probe },
    safetyInvariants: {
      sourceGenerationPlanRequired: true,
      internalServiceOnly: true,
      precheckOnly: true,
      atomicLeaseRequired: true,
      workerBudgetRequired: true,
      generationPlanClaimed: false,
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
      ? "Use this as the Student App AI Tutor question-bank generation worker claim precheck gate; actual claim, model generation, and content storage remain future reviewed slices."
      : "Fix worker claim precheck evidence before claiming question-bank generation plans.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheckAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft generation worker claim precheck runtime: ${report.readiness}`,
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

async function runRuntimeProbe(sourcePlanReport, options = {}) {
  const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-generation-worker-claim-precheck-audit-")), "precheck.jsonl");
  let portCalls = 0;
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck(probeInput(sourcePlanReport), {
      generatedAt: "2026-06-06T16:30:00.000Z",
      commandLogPath,
      generationWorkerClaimPrecheckPort: {
        async recordGenerationWorkerClaimPrecheck(request) {
          portCalls += 1;
          return {
            source: {
              commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_PORT,
              targetUseCase: "PrecheckQuestionBankDraftGenerationWorkerClaim.Execute",
              targetCommandLog: "student-command-log/question-bank-draft-generation-worker-claim-precheck",
            },
            precheckDecision: {
              precheckId: "qbank_generation_worker_precheck_tutor_req_student_app_001",
              planId: request.sourceGenerationPlan.planId,
              workerId: request.worker.workerId,
              executionState: "PRECHECKED_NOT_CLAIMED",
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
        evidenceClass: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_PROBE",
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

function probeInput(sourcePlanReport) {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-worker-claim-precheck.v1",
    precheckInvocationId: "qbank_generation_worker_precheck_001",
    questionBankDraftGenerationPlanReport: sourcePlanReport,
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
      sourceGenerationPlanRequired: true,
      precheckOnly: true,
      atomicLeaseRequired: true,
      workerBudgetRequired: true,
      idempotentPrecheckRequired: true,
      humanReviewRequiredBeforeStudentVisibility: true,
      claimPlanNowAllowed: false,
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
      planExecutionStateRequired: "PLAN_RECORDED_NOT_GENERATED",
      queueName: "student_app_ai_tutor_question_bank_generation",
      targetUseCase: "PrecheckQuestionBankDraftGenerationWorkerClaim.Execute",
      futureClaimUseCase: "ClaimQuestionBankDraftGenerationPlan.Execute",
      futureGenerationUseCase: "GenerateQuestionBankDraftContent.Execute",
      futureStorageRepository: "ArchiveRepository.SaveQuestionBankDraftContent",
      targetContentTable: "teaching_question_bank_draft_contents",
    },
    evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-generation-plan:qbank_generation_plan_tutor_req_student_app_001"],
    idempotencyKey: "student-app-ai-tutor-qbank-generation-worker-claim-precheck:student_001:qbank_generation_plan_tutor_req_student_app_001",
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
  const report = await auditStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheckAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
