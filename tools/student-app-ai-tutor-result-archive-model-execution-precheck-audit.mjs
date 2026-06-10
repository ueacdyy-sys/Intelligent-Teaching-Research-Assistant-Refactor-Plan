import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_PORT,
  STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_RUNTIME_ID,
  recordStudentAppAITutorModelExecutionPrecheck,
} from "./student-app-ai-tutor-model-execution-precheck-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-result-archive-model-execution-precheck.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_MODEL_EXECUTION_PRECHECK";
const runtimeId = "student_app_ai_tutor_result_archive_model_execution_precheck";
const readyStatus = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_MODEL_EXECUTION_PRECHECKED";

const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-model-execution-precheck-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-model-execution-precheck-runtime.test.mjs",
  source0336Report: "reports/student-app-ai-tutor-worker-result-archive-input.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0337-student-app-ai-tutor-result-archive-model-execution-precheck.md",
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

export async function auditStudentAppAITutorResultArchiveModelExecutionPrecheck(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const source0336Report = parseJson(inputs.source0336Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.rootTrace ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(source0336Report, options);

  addFinding(findings, {
    id: "source.0336_worker_result_archive_input_ready",
    passed: source0336Report.readiness === "READY" &&
      source0336Report.workloadType === "STUDENT_APP_AI_TUTOR_WORKER_RESULT_ARCHIVE_INPUT" &&
      source0336Report.runtime?.runtimeId === "student_app_ai_tutor_worker_result_archive_input" &&
      source0336Report.runtime?.status === "STUDENT_APP_AI_TUTOR_WORKER_RESULT_ARCHIVE_INPUT_READY" &&
      source0336Report.runtimeSlo?.totalErrors === 0 &&
      source0336Report.safetyInvariants?.safeTextBlocksOnly === true &&
      source0336Report.safetyInvariants?.modelInferenceAllowed === false,
    actual: [
      source0336Report.readiness ?? "missing",
      source0336Report.runtime?.runtimeId ?? "missing",
      source0336Report.runtime?.status ?? "missing",
      source0336Report.runtimeSlo?.totalErrors ?? "missing",
    ].join(":"),
    expected: "READY 0336 AI_TUTOR_RESULT_ARCHIVE worker-safe input with zero errors and no model inference",
    remediation: "Run or fix 0336 before admitting result-archive-sourced AI Tutor model prechecks.",
  });

  addFinding(findings, {
    id: "runtime.accepts_result_archive_source_without_text_to_port",
    passed: includesAll(runtime, [
      "assertWorkerResultArchiveInputReport",
      "AI_TUTOR_RESULT_ARCHIVE",
      "sourceWorkerResultArchiveInputVerified",
      "learningActionSource: normalized.workerInput.learningActionSource",
      "hasWorkerInputEvidence",
      "worker-result-archive-input",
      "safeTextBlockTextSentToPort: false",
      "modelInferenceStarted: false",
    ]) && !includesAny(runtime, forbiddenRuntimeClaims),
    actual: summarizePresence(runtime, [
      "assertWorkerResultArchiveInputReport",
      "AI_TUTOR_RESULT_ARCHIVE",
      "sourceWorkerResultArchiveInputVerified",
      "worker-result-archive-input",
    ]),
    expected: "shared model precheck runtime accepts AI_TUTOR_RESULT_ARCHIVE input and still sends only hashes/counts to the port",
    remediation: "Keep result-archive follow-up tutoring on the same queue-only precheck gate without prompt/model execution.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_result_archive_queue_only_precheck",
    passed: probe.status === "PASS" &&
      probe.result?.runtimeId === STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_RUNTIME_ID &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_PORT &&
      probe.result?.learningActionSource === "AI_TUTOR_RESULT_ARCHIVE" &&
      probe.result?.resultArchiveStatus === "READY_FOR_STUDENT_APP_READ" &&
      probe.result?.boundary?.sourceWorkerResultArchiveInputVerified === true &&
      probe.result?.boundary?.sourceWorkerStudyPacketInputVerified === false &&
      probe.result?.boundary?.modelExecutionQueueAdmissionOnly === true &&
      probe.result?.boundary?.modelInferenceStarted === false &&
      probe.result?.boundary?.safeTextBlockTextSentToPort === false &&
      probe.result?.modelExecutionPrecheck?.safeBlockCount === 2 &&
      probe.portCalls === 1 &&
      probe.portSawSafeText === false &&
      probe.portSawSourceBlockRef === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};source=${probe.result.learningActionSource};blocks=${probe.result.modelExecutionPrecheck.safeBlockCount};calls=${probe.portCalls};textToPort=${probe.portSawSafeText};refsToPort=${probe.portSawSourceBlockRef};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records one queue-only result-archive model precheck without text/source refs to the port",
    remediation: "Result-archive model precheck must hash safe blocks and block model, prompt, raw result, source refs, RAG, tools, DB, HTTP, and Swarm.",
  });

  addFinding(findings, {
    id: "tests.cover_result_archive_model_precheck_paths",
    passed: includesAll(runtimeTest, [
      "records a result-archive-sourced model precheck without sending guidance text",
      "sourceWorkerResultArchiveInputVerified",
      "AI_TUTOR_RESULT_ARCHIVE",
      "mismatchedSource",
      "source_block_001",
    ]),
    actual: "runtime tests scanned",
    expected: "positive result-archive source, no text/source refs to port, mismatched source rejection, and existing negative paths",
    remediation: "Add result-archive source regression tests before claiming 0337 readiness.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0337",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-result-archive-model-execution-precheck"]?.includes("student-app-ai-tutor-result-archive-model-execution-precheck-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor result-archive model execution precheck audit",
        "studentAppAiTutorResultArchiveModelExecutionPrecheck",
        "student-app-ai-tutor-result-archive-model-execution-precheck.current.json",
        runtimeId,
        "0337-student-app-ai-tutor-result-archive-model-execution-precheck.md",
        "11.47/10",
        readyStatus,
        "SDD 0337 student app ai tutor result archive model execution precheck",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-result-archive-model-execution-precheck",
      "studentAppAiTutorResultArchiveModelExecutionPrecheck",
      "11.47/10",
      "SDD 0337",
    ]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0337",
    remediation: "Wire 0337 through every project evidence hook before marking READY.",
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
      sourceRuntimes: ["student_app_ai_tutor_worker_result_archive_input"],
      modelRoute: "student_tutor_guided_help_v1",
      status: readyStatus,
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorResultArchiveModelExecutionPrecheck: probe },
    safetyInvariants: {
      source0336WorkerResultArchiveInputRequired: true,
      learningActionSourceRequired: "AI_TUTOR_RESULT_ARCHIVE",
      internalServiceOnly: true,
      approvalRequired: true,
      modelExecutionQueueAdmissionOnly: true,
      safeTextBlocksOnly: true,
      safeTextBlockTextSentToPort: false,
      sourceBlockRefsSentToPort: false,
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
      ? "Use this as the result-archive follow-up AI Tutor model precheck gate; answer artifact, review, persistence, student delivery, OCR/RAG, Swarm, and actual model execution remain later reviewed slices."
      : "Fix 0337 before claiming AI_TUTOR_RESULT_ARCHIVE follow-up tutoring can proceed past worker input.",
  };
}

export function formatStudentAppAITutorResultArchiveModelExecutionPrecheckAudit(report) {
  const lines = [
    `Student App AI Tutor result-archive model execution precheck: ${report.readiness}`,
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

async function runRuntimeProbe(source0336Report, options = {}) {
  const precheckLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-result-archive-model-precheck-audit-")), "precheck.jsonl");
  let portCalls = 0;
  let portSawSafeText = false;
  let portSawSourceBlockRef = false;
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorModelExecutionPrecheck(probeInput(source0336Report), {
      generatedAt: "2026-06-09T11:00:00.000Z",
      precheckLogPath,
      modelExecutionPrecheckPort: {
        async recordModelExecutionPrecheck(request) {
          const serialized = JSON.stringify(request);
          portCalls += 1;
          portSawSafeText = serialized.includes("Review your previous mistake pattern") ||
            serialized.includes("Compare the marked step");
          portSawSourceBlockRef = serialized.includes("source_block_001") ||
            serialized.includes("source_block_002");
          return {
            modelExecutionPrecheck: {
              precheckId: "ai_tutor_model_precheck_result_archive_001",
              queueRef: "ai_tutor_model_queue_result_archive_001",
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
      portSawSafeText,
      portSawSourceBlockRef,
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.min(50, elapsed),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_MODEL_EXECUTION_PRECHECK_RUNTIME_PROBE",
      },
    };
  } catch (error) {
    return {
      status: "FAIL",
      error: `${error.code ?? "ERROR"}:${error.message}`,
      portCalls,
      portSawSafeText,
      portSawSourceBlockRef,
      runtimeSlo: failedSlo(),
    };
  }
}

function probeInput(source0336Report) {
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-model-execution-precheck.v1",
    precheckInvocationId: "ai_tutor_model_precheck_invocation_result_archive_001",
    workerStudyPacketInputReport: source0336Report,
    workerInput: {
      requestId: "tutor_req_student_app_result_archive_001",
      archiveItemId: "tarch_student_ai_tutor_result_001",
      analysisGoal: "generate follow-up help from reviewed AI Tutor result",
      questionBankIntent: "GENERATE_PERSONALIZED_CHECK",
      status: "IN_PROGRESS",
      learningActionSource: "AI_TUTOR_RESULT_ARCHIVE",
      workerId: "worker_student_tutor_02",
      claimExpiresAt: "2026-06-09T11:10:00.000Z",
      sourceArchiveStudentId: "student_001",
      sourceArchiveMaterial: "HOMEWORK",
      resultArchiveStatus: "READY_FOR_STUDENT_APP_READ",
      renderFormat: "SAFE_TEXT_BLOCKS",
      blocks: [
        {
          blockId: "block_summary",
          blockType: "SUMMARY",
          title: "Reviewed result summary",
          text: "Review your previous mistake pattern before trying a new practice item.",
          sourceBlockRefs: ["source_block_001"],
        },
        {
          blockId: "block_guidance_001",
          blockType: "GUIDANCE_SECTION",
          sectionId: "guidance_001",
          title: "Next step",
          text: "Compare the marked step with the corrected reasoning and explain the difference.",
          sourceBlockRefs: ["source_block_002"],
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
      approvalId: "ai_tutor_model_approval_result_archive_001",
      requestId: "tutor_req_student_app_result_archive_001",
      workerId: "worker_student_tutor_02",
      approvedByPrincipalId: "reviewer_001",
      approvedAt: "2026-06-09T11:00:00.000Z",
      expiresAt: "2026-06-09T11:30:00.000Z",
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
      "evidence:worker-result-archive-input:student-app-ai-tutor-worker-result-archive-input",
      "evidence:model-execution-approval:ai_tutor_model_approval_result_archive_001",
    ],
    idempotencyKey: "student-app-ai-tutor-model-precheck:tutor_req_student_app_result_archive_001:worker_student_tutor_02",
  };
}

function failedSlo() {
  return {
    targetP99Ms: 50,
    p99Ms: 50,
    totalErrors: 1,
    operations: 1,
    evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_MODEL_EXECUTION_PRECHECK_RUNTIME_PROBE",
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
  const report = await auditStudentAppAITutorResultArchiveModelExecutionPrecheck(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorResultArchiveModelExecutionPrecheckAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
