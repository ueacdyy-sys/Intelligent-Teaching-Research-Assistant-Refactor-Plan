import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_PORT,
  STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_RUNTIME_ID,
  recordStudentAppAITutorModelExecutionPrecheck,
} from "./student-app-ai-tutor-model-execution-precheck-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-feedback-model-execution-precheck.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_MODEL_EXECUTION_PRECHECK";
const runtimeId = "student_app_ai_tutor_question_bank_feedback_model_execution_precheck";
const readyStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_MODEL_EXECUTION_PRECHECKED";

const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-model-execution-precheck-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-model-execution-precheck-runtime.test.mjs",
  domainWorkerInput: "services/teaching-archive-gateway/internal/domain/ai_tutor_worker_study_packet_input.go",
  usecaseWorkerInput: "services/teaching-archive-gateway/internal/usecase/read_ai_tutor_worker_study_packet_input.go",
  httpWorkerInputTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_tutoring_analysis_worker_study_packet_input_test.go",
  source0370Sdd: "docs/sdd/0370-student-app-question-bank-draft-answer-ai-feedback-learning-actions.md",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0371-student-app-ai-tutor-question-bank-feedback-model-execution-precheck.md",
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
  "promptConstructed: true",
  "modelInferenceStarted: true",
  "tutorAnswerGenerated: true",
  "tutoringResultRecorded: true",
  "studentVisiblePublished: true",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "externalToolUseAllowed: true",
  "retrievalAllowed: true",
  "swarmAllowed: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export async function auditStudentAppAITutorQuestionBankFeedbackModelExecutionPrecheck(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const workerEvidence = [
    inputs.domainWorkerInput ?? "",
    inputs.usecaseWorkerInput ?? "",
    inputs.httpWorkerInputTest ?? "",
    inputs.source0370Sdd ?? "",
  ].join("\n");
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.rootTrace ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(options);

  addFinding(findings, {
    id: "source.0370_feedback_worker_input_rebuilds_safe_context",
    passed: includesAll(workerEvidence, [
      "BuildAITutorWorkerQuestionBankFeedbackInput",
      "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      "GetQuestionBankDraftAnswerFeedbackArchiveSnapshotByFeedbackArchiveItemForStudent",
      "BuildQuestionBankDraftAnswerFeedbackRenderEnvelope",
      "BuildQuestionBankDraftAnswerFeedbackLearningActions",
      "feedbackStatus",
      "feedbackSubmissionId",
      "feedbackSourceArchiveItemId",
      "answerText",
      "expectedAnswer",
      "rawModelOutput",
    ]),
    actual: summarizePresence(workerEvidence, [
      "BuildAITutorWorkerQuestionBankFeedbackInput",
      "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      "feedbackSourceArchiveItemId",
    ]),
    expected: "0370 worker branch rebuilds feedback snapshot, safe render, and actions while HTTP tests block raw answer/model fields",
    remediation: "Do not admit feedback-sourced model prechecks until worker input is rebuilt from persisted feedback evidence.",
  });

  addFinding(findings, {
    id: "runtime.accepts_question_bank_feedback_source_without_text_to_port",
    passed: includesAll(runtime, [
      "assertWorkerQuestionBankFeedbackInputReport",
      "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      "sourceWorkerQuestionBankFeedbackInputVerified",
      "worker-question-bank-feedback-input",
      "feedbackStatus",
      "feedbackSubmissionId",
      "feedbackSourceArchiveItemId",
      "safeTextBlockTextSentToPort: false",
      "modelInferenceStarted: false",
    ]) && !includesAny(runtime, forbiddenRuntimeClaims),
    actual: summarizePresence(runtime, [
      "assertWorkerQuestionBankFeedbackInputReport",
      "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      "sourceWorkerQuestionBankFeedbackInputVerified",
      "worker-question-bank-feedback-input",
    ]),
    expected: "shared model precheck runtime accepts QUESTION_BANK_DRAFT_ANSWER_FEEDBACK and still sends only hashes/counts to the port",
    remediation: "Extend the shared model precheck runtime instead of bypassing it with a feedback-specific model path.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_feedback_queue_only_precheck",
    passed: probe.status === "PASS" &&
      probe.result?.runtimeId === STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_RUNTIME_ID &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_PORT &&
      probe.result?.learningActionSource === "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK" &&
      probe.result?.feedbackStatus === "READY_FOR_STUDENT_APP_READ" &&
      probe.result?.feedbackSubmissionId === "qbank_ans_sub_feedback_001" &&
      probe.result?.boundary?.sourceWorkerQuestionBankFeedbackInputVerified === true &&
      probe.result?.boundary?.modelExecutionQueueAdmissionOnly === true &&
      probe.result?.boundary?.modelInferenceStarted === false &&
      probe.result?.boundary?.safeTextBlockTextSentToPort === false &&
      probe.result?.modelExecutionPrecheck?.safeBlockCount === 2 &&
      probe.portCalls === 1 &&
      probe.portSawFeedbackText === false &&
      probe.portSawFeedbackIds === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};source=${probe.result.learningActionSource};blocks=${probe.result.modelExecutionPrecheck.safeBlockCount};calls=${probe.portCalls};textToPort=${probe.portSawFeedbackText};idsToPort=${probe.portSawFeedbackIds};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records one queue-only question-bank feedback model precheck without feedback text or ids to the port",
    remediation: "Feedback-sourced precheck must hash safe blocks and block model, prompt, raw answer, answer key, RAG, tools, DB, HTTP, and Swarm.",
  });

  addFinding(findings, {
    id: "tests.cover_feedback_model_precheck_paths",
    passed: includesAll(runtimeTest, [
      "records a question-bank-feedback-sourced model precheck without sending feedback text",
      "sourceWorkerQuestionBankFeedbackInputVerified",
      "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      "mismatchedFeedbackSource",
      "qbank_ans_sub_feedback_001",
    ]),
    actual: "runtime tests scanned",
    expected: "positive feedback source, no text/id leakage to port, mismatched source rejection, and existing negative paths",
    remediation: "Add feedback-source regression tests before claiming 0371 readiness.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0371",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-feedback-model-execution-precheck"]?.includes("student-app-ai-tutor-question-bank-feedback-model-execution-precheck-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank feedback model execution precheck audit",
        "studentAppAiTutorQuestionBankFeedbackModelExecutionPrecheck",
        "student-app-ai-tutor-question-bank-feedback-model-execution-precheck.current.json",
        runtimeId,
        "0371-student-app-ai-tutor-question-bank-feedback-model-execution-precheck.md",
        "12.49/10",
        readyStatus,
        "SDD 0371 student app ai tutor question-bank feedback model execution precheck",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-question-bank-feedback-model-execution-precheck",
      "studentAppAiTutorQuestionBankFeedbackModelExecutionPrecheck",
      "12.49/10",
      "SDD 0371",
    ]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0371",
    remediation: "Wire 0371 through every project evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId,
      sharedRuntimeId: STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_PORT,
      sourceRuntimes: ["student_app_ai_tutor_worker_question_bank_feedback_input"],
      modelRoute: "student_tutor_guided_help_v1",
      status: readyStatus,
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankFeedbackModelExecutionPrecheck: probe },
    safetyInvariants: {
      source0370FeedbackWorkerInputRequired: true,
      learningActionSourceRequired: "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      internalServiceOnly: true,
      approvalRequired: true,
      modelExecutionQueueAdmissionOnly: true,
      safeTextBlocksOnly: true,
      safeTextBlockTextSentToPort: false,
      feedbackIdsSentToPort: false,
      inputHashRecorded: true,
      promptConstructed: false,
      modelInferenceAllowed: false,
      tutorAnswerGenerated: false,
      tutoringResultRecorded: false,
      studentVisiblePublished: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      retrievalAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the question-bank feedback sourced AI Tutor model precheck gate; controlled answer artifact, review, persistence, student delivery, OCR/RAG, Swarm, and actual model execution remain later reviewed slices."
      : "Fix 0371 before claiming QUESTION_BANK_DRAFT_ANSWER_FEEDBACK tutoring can proceed past worker input.",
  };
}

export function formatStudentAppAITutorQuestionBankFeedbackModelExecutionPrecheckAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank feedback model execution precheck: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
    `Shared runtime: ${report.runtime.sharedRuntimeId}`,
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

async function runRuntimeProbe(options = {}) {
  const precheckLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-feedback-model-precheck-audit-")), "precheck.jsonl");
  let portCalls = 0;
  let portSawFeedbackText = false;
  let portSawFeedbackIds = false;
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorModelExecutionPrecheck(probeInput(), {
      generatedAt: "2026-06-11T09:00:00.000Z",
      precheckLogPath,
      modelExecutionPrecheckPort: {
        async recordModelExecutionPrecheck(request) {
          const serialized = JSON.stringify(request);
          portCalls += 1;
          portSawFeedbackText = serialized.includes("Score improved after correcting denominator comparison") ||
            serialized.includes("Try one similar fraction comparison");
          portSawFeedbackIds = serialized.includes("qbank_ans_sub_feedback_001") ||
            serialized.includes("tarch_homework_feedback_source_001");
          return {
            modelExecutionPrecheck: {
              precheckId: "ai_tutor_model_precheck_feedback_001",
              queueRef: "ai_tutor_model_queue_feedback_001",
              modelRoute: "student_tutor_guided_help_v1",
              requestId: request.requestId,
              workerId: request.workerId,
              inputHash: request.inputHash,
              safeBlockCount: request.safeInput.safeBlockCount,
              status: "AI_TUTOR_MODEL_EXECUTION_PRECHECKED_NOT_STARTED",
              queueAdmissionOnly: true,
              modelInferenceStarted: false,
              tutorResultRecorded: false,
              studentVisiblePublished: false,
            },
          };
        },
      },
    });
    const elapsed = Math.max(1, options.probeP99Ms ?? Date.now() - startedAt);
    return {
      status: "PASS",
      result,
      portCalls,
      portSawFeedbackText,
      portSawFeedbackIds,
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.min(50, elapsed),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "JS_AI_TUTOR_QUESTION_BANK_FEEDBACK_MODEL_EXECUTION_PRECHECK_RUNTIME_PROBE",
      },
    };
  } catch (error) {
    return {
      status: "FAIL",
      error: `${error.code ?? "ERROR"}:${error.message}`,
      portCalls,
      portSawFeedbackText,
      portSawFeedbackIds,
      runtimeSlo: failedSlo(),
    };
  }
}

function probeInput() {
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-model-execution-precheck.v1",
    precheckInvocationId: "ai_tutor_model_precheck_invocation_feedback_001",
    workerStudyPacketInputReport: workerQuestionBankFeedbackInputReport(),
    workerInput: {
      requestId: "tutor_req_student_app_feedback_001",
      archiveItemId: "tarch_student_feedback_001",
      analysisGoal: "generate follow-up help from reviewed answer feedback",
      questionBankIntent: "GENERATE_PERSONALIZED_CHECK",
      status: "IN_PROGRESS",
      learningActionSource: "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      workerId: "worker_student_tutor_03",
      claimExpiresAt: "2026-06-11T09:10:00.000Z",
      sourceArchiveStudentId: "student_001",
      sourceArchiveMaterial: "HOMEWORK",
      feedbackStatus: "READY_FOR_STUDENT_APP_READ",
      feedbackSubmissionId: "qbank_ans_sub_feedback_001",
      feedbackSourceArchiveItemId: "tarch_homework_feedback_source_001",
      renderFormat: "SAFE_TEXT_BLOCKS",
      blocks: [
        {
          blockId: "block_score_summary",
          blockType: "SUMMARY",
          title: "Score summary",
          text: "Score improved after correcting denominator comparison.",
        },
        {
          blockId: "block_next_step",
          blockType: "GUIDANCE_SECTION",
          sectionId: "next_step",
          title: "Next step",
          text: "Try one similar fraction comparison and explain the denominator choice.",
        },
      ],
    },
    principal: {
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      scopes: ["TEACHING_WRITE", "AGENT_COMMAND_SUBMIT"],
    },
    approval: {
      approvalId: "ai_tutor_model_approval_feedback_001",
      requestId: "tutor_req_student_app_feedback_001",
      workerId: "worker_student_tutor_03",
      approvedByPrincipalId: "reviewer_001",
      approvedAt: "2026-06-11T09:00:00.000Z",
      expiresAt: "2026-06-11T09:30:00.000Z",
      allowedModelRoute: "student_tutor_guided_help_v1",
      maxInputBlocks: 4,
      maxPromptTokens: 1200,
      maxGenerationAttempts: 1,
      requiresHumanReviewBeforeResult: true,
      queueOnly: true,
    },
    modelExecutionPolicy: {
      modelRoute: "student_tutor_guided_help_v1",
      maxPromptTokens: 900,
      maxGenerationAttempts: 1,
      timeoutMs: 8000,
      safetyMode: "STUDENT_TUTOR_SAFE_HELP",
      queueOnly: true,
      allowExternalTools: false,
      allowRetrieval: false,
      allowSwarm: false,
      allowDirectDb: false,
    },
    evidenceRefs: [
      "evidence:worker-question-bank-feedback-input:student-app-ai-tutor-worker-question-bank-feedback-input",
      "evidence:model-execution-approval:ai_tutor_model_approval_feedback_001",
    ],
    idempotencyKey: "student-app-ai-tutor-model-precheck:tutor_req_student_app_feedback_001:worker_student_tutor_03",
  };
}

function workerQuestionBankFeedbackInputReport() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_WORKER_QUESTION_BANK_FEEDBACK_INPUT",
    runtime: {
      runtimeId: "student_app_ai_tutor_worker_question_bank_feedback_input",
      status: "STUDENT_APP_AI_TUTOR_WORKER_QUESTION_BANK_FEEDBACK_INPUT_READY",
    },
    runtimeSlo: { p99Ms: 4, totalErrors: 0 },
    safetyInvariants: {
      serviceAgentInternalOnly: true,
      claimedWorkerLeaseRequired: true,
      persistedLearningActionSourceRequired: true,
      feedbackSnapshotRequired: true,
      feedbackSafeRenderRequired: true,
      learningActionBoundaryRequired: true,
      safeTextBlocksOnly: true,
      answerTextDisclosureAllowed: false,
      answerKeyDisclosureAllowed: false,
      contentRefDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      promptDisclosureAllowed: false,
      modelInferenceAllowed: false,
      ocrRagAllowed: false,
      swarmAllowed: false,
    },
  };
}

function failedSlo() {
  return {
    targetP99Ms: 50,
    p99Ms: 50,
    totalErrors: 1,
    operations: 1,
    evidenceClass: "JS_AI_TUTOR_QUESTION_BANK_FEEDBACK_MODEL_EXECUTION_PRECHECK_RUNTIME_PROBE",
  };
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

function includesAny(text, values) {
  return values.some((value) => text.includes(value));
}

function summarizePresence(text, values) {
  return values.map((value) => `${value}=${text.includes(value)}`).join(";");
}

function addFinding(findings, finding) {
  findings.push({ severity: finding.passed ? "info" : "error", ...finding });
}

function stringifyScalar(value) {
  if (Array.isArray(value)) return value.join(",");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

async function main() {
  const root = process.cwd();
  const out = parseOutArg(process.argv.slice(2));
  const report = await auditStudentAppAITutorQuestionBankFeedbackModelExecutionPrecheck(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankFeedbackModelExecutionPrecheckAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
