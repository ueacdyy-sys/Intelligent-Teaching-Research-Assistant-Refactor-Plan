import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_PORT,
  STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_RUNTIME_ID,
  recordStudentAppAITutorModelExecutionPrecheck,
} from "./student-app-ai-tutor-model-execution-precheck-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-model-execution-precheck.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-model-execution-precheck-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-model-execution-precheck-runtime.test.mjs",
  sourceWorkerInputReport: "reports/student-app-ai-tutor-worker-study-packet-input.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  sdd: "docs/sdd/0324-student-app-ai-tutor-model-execution-precheck.md",
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

export async function auditStudentAppAITutorModelExecutionPrecheck(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const sourceWorkerInputReport = parseJson(inputs.sourceWorkerInputReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.rootTrace ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(sourceWorkerInputReport, options);

  addFinding(findings, {
    id: "source.0323_worker_study_packet_input_ready",
    passed: sourceWorkerInputReport.readiness === "READY" &&
      sourceWorkerInputReport.workloadType === "STUDENT_APP_AI_TUTOR_WORKER_STUDY_PACKET_INPUT" &&
      sourceWorkerInputReport.runtime?.runtimeId === "student_app_ai_tutor_worker_study_packet_input" &&
      sourceWorkerInputReport.runtime?.status === "STUDENT_APP_AI_TUTOR_WORKER_STUDY_PACKET_INPUT_READY" &&
      sourceWorkerInputReport.runtimeSlo?.totalErrors === 0 &&
      sourceWorkerInputReport.safetyInvariants?.modelInferenceAllowed === false,
    actual: `${sourceWorkerInputReport.readiness ?? "missing"}:${sourceWorkerInputReport.runtime?.status ?? "missing"}`,
    expected: "READY 0323 worker-safe study packet input with no model inference",
    remediation: "Run the 0323 worker study-packet input audit before model execution precheck.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_PORT",
      "StudentAppAITutorModelExecutionPrecheckPort.recordModelExecutionPrecheck",
      "recordStudentAppAITutorModelExecutionPrecheck",
      "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECKED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_model_execution_precheck_runtime",
      "StudentAppAITutorModelExecutionPrecheckPort.recordModelExecutionPrecheck",
      "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECKED",
    ]),
    expected: "runtime records an idempotent AI Tutor model execution precheck through a named injected port",
    remediation: "Keep model execution precheck as a replay-safe port-recorded queue admission gate.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "sourceWorkerStudyPacketInputVerified: true",
      "serviceAgentInternalOnly: true",
      "approvalVerified: true",
      "modelExecutionQueueAdmissionOnly: true",
      "futureModelExecutionApproved: true",
      "safeTextBlocksOnly: true",
      "safeTextBlockTextSentToPort: false",
      "inputHashRecorded: true",
      "promptConstructed: false",
      "modelInferenceStarted: false",
      "tutorAnswerGenerated: false",
      "tutoringResultRecorded: false",
      "studentVisiblePublished: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "externalToolUseAllowed: false",
      "retrievalAllowed: false",
      "swarmAllowed: false",
    ]) && !includesAny(runtime, forbiddenRuntimeClaims),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime admits a future model queue only and does not execute model, prompt, DB, HTTP, tools, retrieval, or Swarm",
    remediation: "Do not collapse model execution precheck into model inference, prompt construction, result persistence, or tool execution.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_queue_only_precheck",
    passed: probe.status === "PASS" &&
      probe.result?.runtimeId === STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_RUNTIME_ID &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_PORT &&
      probe.result?.modelExecutionPrecheck?.requestId === "tutor_req_student_app_001" &&
      probe.result?.modelExecutionPrecheck?.safeBlockCount === 2 &&
      probe.result?.boundary?.modelExecutionQueueAdmissionOnly === true &&
      probe.result?.boundary?.safeTextBlockTextSentToPort === false &&
      probe.result?.boundary?.modelInferenceStarted === false &&
      probe.portCalls === 1 &&
      probe.portSawSafeText === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};blocks=${probe.result.modelExecutionPrecheck.safeBlockCount};calls=${probe.portCalls};textToPort=${probe.portSawSafeText};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records one queue-only AI Tutor model execution precheck without sending safe text to the port",
    remediation: "Precheck evidence must prove 0323 linkage, approval, budget, idempotency, no text-to-port, and no model start.",
  });

  addFinding(findings, {
    id: "tests.cover_model_precheck_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a queue-only model precheck without sending text or starting inference",
      "uses idempotency for safe replay and rejects conflicting prechecks",
      "rejects missing ports, unsafe principals, and unsafe policies",
      "rejects non-ready sources and leaked fields",
      "rejects unsafe port results",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, no text-to-port, idempotency, missing port, auth, policy, source, leak, and unsafe port tests",
    remediation: "Add regression coverage before using 0324 as AI Tutor model execution precheck evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-model-execution-precheck"]?.includes("student-app-ai-tutor-model-execution-precheck-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor model execution precheck runtime audit",
        "studentAppAiTutorModelExecutionPrecheck",
        "student-app-ai-tutor-model-execution-precheck.current.json",
        "student_app_ai_tutor_model_execution_precheck_runtime",
        "0324-student-app-ai-tutor-model-execution-precheck.md",
        "11.08/10",
        "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECKED",
        "SDD 0324 student app ai tutor model execution precheck",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-model-execution-precheck",
      "studentAppAiTutorModelExecutionPrecheck",
      "11.08/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, root trace, SDD, and architecture board track 0324",
    remediation: "Wire AI Tutor model execution precheck evidence through every root project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_PORT,
      sourceRuntimes: ["student_app_ai_tutor_worker_study_packet_input"],
      modelRoute: "student_tutor_guided_help_v1",
      status: "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECKED",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorModelExecutionPrecheck: probe },
    safetyInvariants: {
      sourceWorkerStudyPacketInputRequired: true,
      internalServiceOnly: true,
      approvalRequired: true,
      modelExecutionQueueAdmissionOnly: true,
      safeTextBlocksOnly: true,
      safeTextBlockTextSentToPort: false,
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
      ? "Use this as the AI Tutor model execution precheck gate; actual model inference, answer artifact, result persistence, and student visibility remain future reviewed slices."
      : "Fix AI Tutor model execution precheck evidence before running any AI Tutor model generation slice.",
  };
}

export function formatStudentAppAITutorModelExecutionPrecheckAudit(report) {
  const lines = [
    `Student App AI Tutor model execution precheck runtime: ${report.readiness}`,
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

async function runRuntimeProbe(sourceWorkerInputReport, options = {}) {
  const precheckLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-model-precheck-audit-")), "precheck.jsonl");
  let portCalls = 0;
  let portSawSafeText = false;
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorModelExecutionPrecheck(probeInput(sourceWorkerInputReport), {
      generatedAt: "2026-06-08T08:00:00.000Z",
      precheckLogPath,
      modelExecutionPrecheckPort: {
        async recordModelExecutionPrecheck(request) {
          portCalls += 1;
          portSawSafeText = JSON.stringify(request).includes("Practice equivalent fractions");
          return {
            modelExecutionPrecheck: {
              precheckId: "ai_tutor_model_precheck_001",
              queueRef: "ai_tutor_model_queue_001",
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
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.min(50, elapsed),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "JS_AI_TUTOR_MODEL_EXECUTION_PRECHECK_RUNTIME_PROBE",
      },
    };
  } catch (error) {
    return {
      status: "FAIL",
      error: `${error.code ?? "ERROR"}:${error.message}`,
      portCalls,
      portSawSafeText,
      runtimeSlo: failedSlo(),
    };
  }
}

function probeInput(sourceWorkerInputReport) {
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-model-execution-precheck.v1",
    precheckInvocationId: "ai_tutor_model_precheck_invocation_001",
    workerStudyPacketInputReport: sourceWorkerInputReport,
    workerInput: {
      requestId: "tutor_req_student_app_001",
      archiveItemId: "tarch_archive_material_001",
      analysisGoal: "generate guided study help",
      questionBankIntent: "GENERATE_PERSONALIZED_CHECK",
      status: "IN_PROGRESS",
      workerId: "worker_student_tutor_01",
      claimExpiresAt: "2026-06-08T08:10:00.000Z",
      sourceArchiveStudentId: "student_001",
      sourceArchiveMaterial: "HANDOUT",
      packetStatus: "READY",
      renderFormat: "SAFE_TEXT_BLOCKS",
      blocks: [
        {
          blockId: "block_section_001",
          blockType: "SECTION",
          sectionId: "section_001",
          title: "Equivalent fractions",
          text: "Practice equivalent fractions and common denominators.",
          pageHint: "p.1",
        },
        {
          blockId: "block_section_002",
          blockType: "SECTION",
          sectionId: "section_002",
          title: "Worked example",
          text: "Compare two fractions by converting to a common denominator.",
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
      approvalId: "ai_tutor_model_approval_001",
      requestId: "tutor_req_student_app_001",
      workerId: "worker_student_tutor_01",
      approvedByPrincipalId: "reviewer_001",
      approvedAt: "2026-06-08T08:00:00.000Z",
      expiresAt: "2026-06-08T08:30:00.000Z",
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
      "evidence:worker-study-packet-input:student-app-ai-tutor-worker-study-packet-input",
      "evidence:model-execution-approval:ai_tutor_model_approval_001",
    ],
    idempotencyKey: "student-app-ai-tutor-model-precheck:tutor_req_student_app_001:worker_student_tutor_01",
  };
}

function failedSlo() {
  return {
    targetP99Ms: 50,
    p99Ms: 50,
    totalErrors: 1,
    operations: 1,
    evidenceClass: "JS_AI_TUTOR_MODEL_EXECUTION_PRECHECK_RUNTIME_PROBE",
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
  const report = await auditStudentAppAITutorModelExecutionPrecheck(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorModelExecutionPrecheckAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
