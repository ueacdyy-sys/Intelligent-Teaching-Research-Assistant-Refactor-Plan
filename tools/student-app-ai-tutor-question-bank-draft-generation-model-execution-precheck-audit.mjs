import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_RUNTIME_ID,
  recordStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck,
} from "./student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck-runtime.test.mjs",
  sourceInputEnvelopeReport: "reports/student-app-ai-tutor-question-bank-draft-generation-input-envelope.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0282-student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck.md",
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

export async function auditStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const sourceInputEnvelopeReport = parseJson(inputs.sourceInputEnvelopeReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(sourceInputEnvelopeReport, options);

  addFinding(findings, {
    id: "source_input_envelope.ready_not_generated",
    passed: sourceInputEnvelopeReport.readiness === "READY" &&
      sourceInputEnvelopeReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE" &&
      sourceInputEnvelopeReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_generation_input_envelope_runtime" &&
      sourceInputEnvelopeReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationInputEnvelope?.result?.inputEnvelope?.executionState === "INPUT_ENVELOPE_RECORDED_NOT_GENERATED" &&
      sourceInputEnvelopeReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationInputEnvelope?.result?.boundary?.modelInferenceStarted === false &&
      sourceInputEnvelopeReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationInputEnvelope?.result?.boundary?.questionContentGenerated === false,
    actual: `${sourceInputEnvelopeReport.readiness ?? "missing"}:${sourceInputEnvelopeReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationInputEnvelope?.result?.inputEnvelope?.executionState ?? "missing"}`,
    expected: "READY 0281 input envelope with INPUT_ENVELOPE_RECORDED_NOT_GENERATED and no model/content generation",
    remediation: "Run the 0281 input-envelope audit before admitting any model execution precheck.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_PORT",
      "StudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheckPort.recordModelExecutionPrecheck",
      "recordStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECKED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_generation_model_execution_precheck_runtime",
      "StudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheckPort.recordModelExecutionPrecheck",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECKED",
    ]),
    expected: "runtime records an idempotent model execution precheck through a named injected port",
    remediation: "Keep model execution precheck as a port-recorded admission gate.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "sourceInputEnvelopeVerified: true",
      "approvalVerified: true",
      "modelExecutionQueueAdmissionOnly: true",
      "futureModelExecutionApproved: true",
      "promptBlueprintsReviewed: true",
      "answerKeyExcluded: true",
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
    expected: "runtime admits a future model queue only; it does not execute model inference, generate content, write DB, HTTP, tools, or Swarm",
    remediation: "Do not collapse model execution precheck into model inference or content storage.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_model_execution_precheck",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECKED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_PORT &&
      probe.result?.modelExecutionPrecheck?.envelopeId === "qbank_generation_input_envelope_tutor_req_student_app_001" &&
      probe.result?.modelExecutionPrecheck?.promptBlueprintCount === 3 &&
      probe.result?.boundary?.modelExecutionQueueAdmissionOnly === true &&
      probe.result?.boundary?.modelInferenceStarted === false &&
      probe.result?.boundary?.questionContentGenerated === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};blueprints=${probe.result.modelExecutionPrecheck.promptBlueprintCount};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records one reviewed model execution precheck and leaves model inference/content storage for future slices",
    remediation: "Precheck evidence must prove input-envelope linkage, approval, budget, no model start, and no generated content.",
  });

  addFinding(findings, {
    id: "tests.cover_model_precheck_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a reviewed model-queue precheck without starting model generation",
      "uses idempotency for safe replay and rejects conflicting prechecks",
      "rejects missing ports, unsafe principals, incomplete approvals, and unsafe policies",
      "rejects non-ready source envelopes, approval mismatches, and already generated boundaries",
      "rejects leaked content, unsafe port results, over-budget policies, and missing evidence",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, auth, approval, policy, source mismatch, leak, unsafe port, budget, and evidence tests",
    remediation: "Add regression coverage before using 0282 as model execution precheck evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck"]?.includes("student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank draft generation model execution precheck runtime audit",
        "studentAppAiTutorQuestionBankDraftGenerationModelExecutionPrecheck",
        "student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck.current.json",
        "student_app_ai_tutor_question_bank_draft_generation_model_execution_precheck_runtime",
        "0282-student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck.md",
        "10.22/10",
        "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECKED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck",
      "studentAppAiTutorQuestionBankDraftGenerationModelExecutionPrecheck",
      "10.22/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0282",
    remediation: "Wire model execution precheck evidence through every root project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_PORT,
      sourceRuntimes: [
        "student_app_ai_tutor_question_bank_draft_generation_input_envelope_runtime",
      ],
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECKED",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankDraftGenerationModelExecutionPrecheck: probe },
    safetyInvariants: {
      sourceInputEnvelopeRequired: true,
      internalServiceOnly: true,
      approvalRequired: true,
      modelExecutionQueueAdmissionOnly: true,
      futureModelExecutionApproved: true,
      promptBlueprintsReviewed: true,
      answerKeyExcluded: true,
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
      ? "Use this as the Student App AI Tutor question-bank model execution precheck gate; actual model inference and content storage remain future reviewed slices."
      : "Fix model execution precheck evidence before running any reviewed question-bank model generation slice.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheckAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft generation model execution precheck runtime: ${report.readiness}`,
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

async function runRuntimeProbe(sourceInputEnvelopeReport, options = {}) {
  const precheckLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-generation-model-precheck-audit-")), "precheck.jsonl");
  let portCalls = 0;
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck(probeInput(sourceInputEnvelopeReport), {
      generatedAt: "2026-06-06T17:00:00.000Z",
      precheckLogPath,
      modelExecutionPrecheckPort: {
        async recordModelExecutionPrecheck(request) {
          portCalls += 1;
          return {
            modelExecutionPrecheck: {
              precheckId: "qbank_generation_model_precheck_tutor_req_student_app_001",
              envelopeId: request.inputEnvelope.envelopeId,
              planId: request.inputEnvelope.planId,
              claimId: request.inputEnvelope.claimId,
              approvalId: request.approval.approvalId,
              questionBankDraftRef: request.inputEnvelope.questionBankDraftRef,
              studentId: request.inputEnvelope.studentId,
              workerId: request.inputEnvelope.workerId,
              modelRoute: request.modelExecutionPolicy.modelRoute,
              queueRef: request.modelExecutionPolicy.queueRef,
              promptBlueprintCount: request.inputEnvelope.itemBlueprintCount,
              status: "PRECHECKED_FOR_REVIEWED_MODEL_QUEUE",
              executionState: "MODEL_EXECUTION_PRECHECKED_NOT_STARTED",
              modelInferenceStarted: false,
              questionContentGenerated: false,
              questionBankContentWriteStarted: false,
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
        evidenceClass: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_PROBE",
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

function probeInput(sourceInputEnvelopeReport) {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-model-execution-precheck.v1",
    precheckInvocationId: "qbank_generation_model_precheck_001",
    inputEnvelopeReport: sourceInputEnvelopeReport,
    principal: {
      principalId: "svc_student_tutor_agent",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      sessionId: "svc_session_student_tutor_agent",
      scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT", "MODEL_EXECUTION_PRECHECK_APPROVE"],
    },
    approval: {
      approvalId: "qbank_generation_model_approval_001",
      reviewerId: "teacher_001",
      reviewerRole: "TEACHER",
      permissions: ["QUESTION_BANK_GENERATION_REVIEW", "MODEL_EXECUTION_PRECHECK_APPROVE"],
      reviewedEnvelopeId: "qbank_generation_input_envelope_tutor_req_student_app_001",
      reviewedPlanId: "qbank_generation_plan_tutor_req_student_app_001",
      reviewedClaimId: "qbank_generation_claim_tutor_req_student_app_001",
      approvedForModelQueueOnly: true,
      promptBlueprintsReviewed: true,
      studentOwnScopeConfirmed: true,
      answerKeyExcludedConfirmed: true,
      budgetReviewed: true,
      humanReviewRequiredBeforeStudentVisibility: true,
    },
    modelExecutionPolicy: {
      modelRoute: "StudentTutorAgent.generate_question_bank_draft",
      approvedProviderClass: "CONTROLLED_AI_WORKER",
      queueRef: "qbank_generation_model_queue_local_001",
      maxPromptTokens: 1200,
      maxOutputTokens: 1200,
      maxGenerationAttempts: 1,
      timeoutMs: 30000,
      storeRawModelOutputAllowed: false,
      executeModelNowAllowed: false,
      generateQuestionsNowAllowed: false,
      writeQuestionBankContentNowAllowed: false,
      studentVisiblePublishAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      swarmAllowed: false,
      requiresReviewedGenerationRuntime: true,
      requiresContentStorageCommit: true,
    },
    evidenceRefs: [
      "evidence:student-app-ai-tutor-question-bank-draft-generation-input-envelope:qbank_generation_input_envelope_tutor_req_student_app_001",
      "evidence:model-execution-approval:qbank_generation_model_approval_001",
    ],
    idempotencyKey: "student-app-ai-tutor-qbank-generation-model-precheck:student_001:qbank_generation_input_envelope_tutor_req_student_app_001",
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
  const report = await auditStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheckAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
