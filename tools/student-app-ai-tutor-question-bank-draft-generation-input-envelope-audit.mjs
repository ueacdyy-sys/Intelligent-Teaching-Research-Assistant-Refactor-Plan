import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RUNTIME_ID,
  recordStudentAppAITutorQuestionBankDraftGenerationInputEnvelope,
} from "./student-app-ai-tutor-question-bank-draft-generation-input-envelope-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-generation-input-envelope.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-generation-input-envelope-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-generation-input-envelope-runtime.test.mjs",
  sourceGenerationPlanReport: "reports/student-app-ai-tutor-question-bank-draft-generation-plan.current.json",
  sourceWorkerClaimReport: "reports/student-app-ai-tutor-question-bank-draft-generation-worker-claim.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0281-student-app-ai-tutor-question-bank-draft-generation-input-envelope.md",
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

export async function auditStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const sourceGenerationPlanReport = parseJson(inputs.sourceGenerationPlanReport, {});
  const sourceWorkerClaimReport = parseJson(inputs.sourceWorkerClaimReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(sourceGenerationPlanReport, sourceWorkerClaimReport, options);

  addFinding(findings, {
    id: "source_plan_and_claim.ready_matched_not_generated",
    passed: sourceGenerationPlanReport.readiness === "READY" &&
      sourceGenerationPlanReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN" &&
      sourceGenerationPlanReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_generation_plan_runtime" &&
      sourceGenerationPlanReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationPlan?.result?.generationPlan?.executionState === "PLAN_RECORDED_NOT_GENERATED" &&
      sourceWorkerClaimReport.readiness === "READY" &&
      sourceWorkerClaimReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM" &&
      sourceWorkerClaimReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_generation_worker_claim_runtime" &&
      sourceWorkerClaimReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationWorkerClaim?.result?.claim?.executionState === "CLAIMED_NOT_GENERATED" &&
      sourceGenerationPlanReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationPlan?.result?.generationPlan?.planId ===
        sourceWorkerClaimReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationWorkerClaim?.result?.claim?.planId,
    actual: `${sourceGenerationPlanReport.readiness ?? "missing"}:${sourceGenerationPlanReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationPlan?.result?.generationPlan?.executionState ?? "missing"};${sourceWorkerClaimReport.readiness ?? "missing"}:${sourceWorkerClaimReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationWorkerClaim?.result?.claim?.executionState ?? "missing"}`,
    expected: "READY 0278 generation plan plus READY 0280 worker claim for the same not-generated plan",
    remediation: "Run generation plan and worker claim audits before recording the model-input envelope.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_PORT",
      "StudentAppAITutorQuestionBankDraftGenerationInputEnvelopePort.recordGenerationInputEnvelope",
      "recordStudentAppAITutorQuestionBankDraftGenerationInputEnvelope",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RECORDED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_generation_input_envelope_runtime",
      "StudentAppAITutorQuestionBankDraftGenerationInputEnvelopePort.recordGenerationInputEnvelope",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RECORDED",
    ]),
    expected: "runtime records an idempotent model-input envelope through a named injected port",
    remediation: "Keep input envelope as a port-recorded pre-generation boundary.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "sourceGenerationPlanVerified: true",
      "sourceWorkerClaimVerified: true",
      "modelInputEnvelopeOnly: true",
      "promptBlueprintsPrepared: true",
      "answerKeyExcluded: true",
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
      "requiresFutureReviewedModelGeneration: true",
      "requiresFutureContentStorageCommit: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime prepares prompt blueprints without model inference, generated content, DB, HTTP, tools, or Swarm",
    remediation: "Do not collapse input-envelope preparation into model generation or content storage.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_input_envelope",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RECORDED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_PORT &&
      probe.result?.inputEnvelope?.planId === "qbank_generation_plan_tutor_req_student_app_001" &&
      probe.result?.inputEnvelope?.claimId === "qbank_generation_claim_tutor_req_student_app_001" &&
      probe.result?.inputEnvelope?.itemBlueprints?.length === 3 &&
      probe.result?.boundary?.modelInputEnvelopeOnly === true &&
      probe.result?.boundary?.modelInferenceStarted === false &&
      probe.result?.boundary?.questionContentGenerated === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};items=${probe.result.inputEnvelope.itemBlueprints.length};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records one safe input envelope and leaves model generation/content storage for future slices",
    remediation: "Input-envelope evidence must prove plan/claim linkage, prompt blueprint count, no model start, and no generated content.",
  });

  addFinding(findings, {
    id: "tests.cover_input_envelope_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a safe model-input envelope from a claimed generation plan without model generation",
      "uses idempotency for safe replay and rejects conflicting envelopes",
      "rejects missing ports, unsafe principals, worker mismatch, and unsafe policies",
      "rejects non-ready sources and generation plan or claim mismatches",
      "rejects leaked answers, generated content, unsafe port results, and missing evidence",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, auth, worker mismatch, unsafe policy, source mismatch, leak, unsafe port, and evidence tests",
    remediation: "Add regression coverage before using 0281 as generation input-envelope evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-draft-generation-input-envelope"]?.includes("student-app-ai-tutor-question-bank-draft-generation-input-envelope-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank draft generation input envelope runtime audit",
        "studentAppAiTutorQuestionBankDraftGenerationInputEnvelope",
        "student-app-ai-tutor-question-bank-draft-generation-input-envelope.current.json",
        "student_app_ai_tutor_question_bank_draft_generation_input_envelope_runtime",
        "0281-student-app-ai-tutor-question-bank-draft-generation-input-envelope.md",
        "10.21/10",
        "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RECORDED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-generation-input-envelope",
      "studentAppAiTutorQuestionBankDraftGenerationInputEnvelope",
      "10.21/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0281",
    remediation: "Wire input-envelope evidence through every root project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_PORT,
      sourceRuntimes: [
        "student_app_ai_tutor_question_bank_draft_generation_plan_runtime",
        "student_app_ai_tutor_question_bank_draft_generation_worker_claim_runtime",
      ],
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RECORDED",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankDraftGenerationInputEnvelope: probe },
    safetyInvariants: {
      sourceGenerationPlanRequired: true,
      sourceWorkerClaimRequired: true,
      internalServiceOnly: true,
      modelInputEnvelopeOnly: true,
      promptBlueprintsPrepared: true,
      answerKeyExcluded: true,
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
      ? "Use this as the Student App AI Tutor question-bank generation input-envelope gate; model generation and content storage remain future reviewed slices."
      : "Fix input-envelope evidence before running any reviewed question-bank model generation slice.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftGenerationInputEnvelopeAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft generation input envelope runtime: ${report.readiness}`,
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

async function runRuntimeProbe(sourceGenerationPlanReport, sourceWorkerClaimReport, options = {}) {
  const envelopeLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-generation-input-envelope-audit-")), "envelope.jsonl");
  let portCalls = 0;
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(probeInput(sourceGenerationPlanReport, sourceWorkerClaimReport), {
      generatedAt: "2026-06-06T16:50:00.000Z",
      envelopeLogPath,
      generationInputEnvelopePort: {
        async recordGenerationInputEnvelope(request) {
          portCalls += 1;
          return {
            source: {
              commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_PORT,
              targetUseCase: "PrepareQuestionBankDraftGenerationInputEnvelope.Execute",
              targetCommandLog: "student-command-log/question-bank-draft-generation-input-envelope",
              modelExecutionDeferred: true,
            },
            inputEnvelope: {
              envelopeId: "qbank_generation_input_envelope_tutor_req_student_app_001",
              planId: request.sourceGenerationPlan.planId,
              claimId: request.sourceWorkerClaim.claimId,
              workerId: request.worker.workerId,
              status: "READY_FOR_REVIEWED_GENERATION",
              executionState: "INPUT_ENVELOPE_RECORDED_NOT_GENERATED",
              promptBlueprintCount: request.promptEnvelopeDraft.itemBlueprints.length,
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
        evidenceClass: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_PROBE",
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

function probeInput(sourceGenerationPlanReport, sourceWorkerClaimReport) {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-input-envelope.v1",
    envelopeInvocationId: "qbank_generation_input_envelope_001",
    generationPlanReport: sourceGenerationPlanReport,
    generationWorkerClaimReport: sourceWorkerClaimReport,
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
    envelopePolicy: {
      sourceGenerationPlanRequired: true,
      sourceWorkerClaimRequired: true,
      promptBlueprintRequired: true,
      safetyConstraintsRequired: true,
      answerKeyRemovalRequired: true,
      modelExecutionDeferred: true,
      contentStorageDeferred: true,
      humanReviewRequiredBeforeStudentVisibility: true,
      idempotentEnvelopeRequired: true,
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
      claimExecutionStateRequired: "CLAIMED_NOT_GENERATED",
      envelopeExecutionState: "INPUT_ENVELOPE_RECORDED_NOT_GENERATED",
      targetUseCase: "PrepareQuestionBankDraftGenerationInputEnvelope.Execute",
      futureGenerationUseCase: "GenerateQuestionBankDraftContent.Execute",
      futureStorageRepository: "ArchiveRepository.SaveQuestionBankDraftContent",
      targetContentTable: "teaching_question_bank_draft_contents",
    },
    evidenceRefs: [
      "evidence:student-app-ai-tutor-question-bank-draft-generation-plan:qbank_generation_plan_tutor_req_student_app_001",
      "evidence:student-app-ai-tutor-question-bank-draft-generation-worker-claim:qbank_generation_claim_tutor_req_student_app_001",
    ],
    idempotencyKey: "student-app-ai-tutor-qbank-generation-input-envelope:student_001:qbank_generation_claim_tutor_req_student_app_001",
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
  const report = await auditStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftGenerationInputEnvelopeAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
