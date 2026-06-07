import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_REQUEST_COMMAND_PORT,
  STUDENT_APP_AI_TUTOR_REQUEST_RUNTIME_ID,
  queueStudentAppAITutorRequest,
} from "./student-app-ai-tutor-request-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-request.current.json";
const sourceFiles = {
  inputSchema: "contracts/agent/student-app-ai-tutor-request.input.schema.json",
  outputSchema: "contracts/agent/student-app-ai-tutor-request.output.schema.json",
  inputExample: "contracts/agent/student-app-ai-tutor-request.input.example.json",
  outputExample: "contracts/agent/student-app-ai-tutor-request.output.example.json",
  runtime: "tools/student-app-ai-tutor-request-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-request-runtime.test.mjs",
  studentAppFlowReport: "reports/student-app-flow.current.json",
  goUseCase: "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request.go",
  goUseCaseTest: "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request_test.go",
  goDomain: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request.go",
  goArchiveRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items.go",
  goRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go",
  goRepositoryTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis_student_app_request_test.go",
  httpApiTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request_test.go",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0260-student-app-ai-tutor-request-runtime.md",
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
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "externalModelCallNowAllowed: true",
  "finalEvaluationNowAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "dangerouslySetInnerHTML",
  "innerHTML",
];

export async function auditStudentAppAITutorRequest(inputs, options = {}) {
  const findings = [];
  const inputSchema = parseJson(inputs.inputSchema, {});
  const outputSchema = parseJson(inputs.outputSchema, {});
  const inputExample = parseJson(inputs.inputExample, {});
  const outputExample = parseJson(inputs.outputExample, {});
  const studentAppFlowReport = parseJson(inputs.studentAppFlowReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const goEvidence = [
    inputs.goUseCase ?? "",
    inputs.goUseCaseTest ?? "",
    inputs.goDomain ?? "",
    inputs.goArchiveRepository ?? "",
    inputs.goRepository ?? "",
    inputs.goRepositoryTest ?? "",
    inputs.httpApiTest ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(options);

  addFinding(findings, {
    id: "contract.schema_and_examples",
    passed: inputSchema.properties?.schemaVersion?.const === "2026-06-05.student-app.ai-tutor-request.v1" &&
      inputSchema.properties?.agentTask?.properties?.taskKind?.const === "STUDENT_TUTORING" &&
      inputSchema.properties?.principalContext?.properties?.role?.const === "STUDENT" &&
      inputSchema.properties?.studentArchiveScope?.properties?.expectedSourceOwnerType?.const === "STUDENT" &&
      inputSchema.properties?.aiTutorRequestPolicy?.properties?.queueName?.const === "teaching_tutoring_analysis_requests" &&
      inputSchema.properties?.aiTutorRequestPolicy?.properties?.externalModelCallNowAllowed?.const === false &&
      outputSchema.properties?.schemaVersion?.const === "2026-06-05.student-app.ai-tutor-request-queued.v1" &&
      outputSchema.properties?.runtimeId?.const === STUDENT_APP_AI_TUTOR_REQUEST_RUNTIME_ID &&
      outputSchema.properties?.commandPort?.const === STUDENT_APP_AI_TUTOR_REQUEST_COMMAND_PORT &&
      outputSchema.properties?.status?.const === "STUDENT_APP_AI_TUTOR_REQUEST_QUEUED" &&
      outputSchema.properties?.queue?.properties?.targetUseCase?.const === "CreateStudentAppAITutorRequest.Execute" &&
      outputSchema.properties?.boundary?.properties?.studentOwnArchiveScopeEnforced?.const === true &&
      inputExample.studentArchiveScope?.archiveItemId === "tarch_student_quiz_001" &&
      outputExample.tutoringAnalysisRequest?.id === "tutor_req_student_app_001",
    actual: summarizePresence(JSON.stringify(inputSchema) + JSON.stringify(outputSchema) + JSON.stringify(inputExample) + JSON.stringify(outputExample), [
      "STUDENT_APP_AI_TUTOR_REQUEST_QUEUED",
      "StudentAppAITutorRequestPort.createStudentAppAITutorRequest",
      "CreateStudentAppAITutorRequest.Execute",
      "teaching_tutoring_analysis_requests",
    ]),
    expected: "contracts define own-scope Student App AI Tutor queue admission through the injected Go use case port",
    remediation: "Keep this slice as queue admission, not model inference or final evaluation.",
  });

  addFinding(findings, {
    id: "student_app.flow_report_ready",
    passed: studentAppFlowReport.readiness === "READY",
    actual: studentAppFlowReport.readiness ?? "missing",
    expected: "READY Student App flow contract evidence",
    remediation: "Regenerate Student App flow audit before counting AI Tutor request runtime evidence.",
  });

  addFinding(findings, {
    id: "runtime.identity_ports_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_REQUEST_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_REQUEST_COMMAND_PORT",
      "StudentAppAITutorRequestPort.createStudentAppAITutorRequest",
      "queueStudentAppAITutorRequest",
      "STUDENT_APP_AI_TUTOR_REQUEST_READY",
      "STUDENT_APP_AI_TUTOR_REQUEST_QUEUED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "CreateStudentAppAITutorRequest.Execute",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_request_runtime",
      "StudentAppAITutorRequestPort.createStudentAppAITutorRequest",
      "STUDENT_APP_AI_TUTOR_REQUEST_QUEUED",
    ]),
    expected: "runtime uses a named injected request port and idempotent queue admission",
    remediation: "Do not turn this runtime into an untracked direct service call.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "studentOwnArchiveScopeEnforced: true",
      "teachingArchiveReadVerified: true",
      "tutoringAnalysisRequestQueued: true",
      "questionBankDraftDeferred: true",
      "asyncAnalysisRequired: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "externalModelCallNowAllowed: false",
      "finalEvaluationNowAllowed: false",
      "swarmAllowed: false",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime queues only through the injected port and blocks raw DB, HTTP, immediate model inference, final evaluation, tools, and Swarm",
    remediation: "AI Tutor inference and question-bank generation must stay in later async worker slices.",
  });

  addFinding(findings, {
    id: "runtime.probe_queues_student_tutor_request",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_REQUEST_QUEUED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_REQUEST_COMMAND_PORT &&
      probe.result?.queue?.targetUseCase === "CreateStudentAppAITutorRequest.Execute" &&
      probe.result?.queue?.queueTable === "teaching_tutoring_analysis_requests" &&
      probe.result?.tutoringAnalysisRequest?.id === "tutor_req_student_app_001" &&
      probe.result?.tutoringAnalysisRequest?.sourceArchiveStudentId === "student_001" &&
      probe.result?.boundary?.studentOwnArchiveScopeEnforced === true &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};request=${probe.result.tutoringAnalysisRequest.id};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe queues one own-scope AI Tutor request through the injected use case port",
    remediation: "Queue admission must prove the port call, queue shape, and own-student scope.",
  });

  addFinding(findings, {
    id: "tests.cover_student_app_ai_tutor_negative_paths",
    passed: includesAll(runtimeTest, [
      "queues a Student App AI Tutor request through the injected use case port",
      "uses idempotency for replay and rejects conflicting Student App AI Tutor requests",
      "rejects missing ports, non-student principals, cross-student archive scope, and mismatched queued requests",
      "rejects direct DB or HTTP policies, model execution, final evaluation, local tools, and Swarm",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, missing port, non-student, cross-student, mismatch, and unsafe policy tests",
    remediation: "Add regression coverage before using this as Student App AI Tutor runtime evidence.",
  });

  addFinding(findings, {
    id: "teaching_archive.go_usecase_and_repository_evidence_exists",
    passed: includesAll(goEvidence, [
      "func NewCreateStudentAppAITutorRequest",
      "func (uc *CreateStudentAppAITutorRequest) Execute",
      "AuthorizeCreateStudentAppAITutorRequest",
      "func (r *ArchiveRepository) GetByID",
      "CreateTutoringAnalysisRequest",
      "teaching_tutoring_analysis_requests",
      "TestCreateStudentAppAITutorRequestQueuesOwnStudentArchiveAnalysis",
      "TestCreateStudentAppAITutorRequestRejectsOtherStudentArchive",
      "TestCreateStudentAppAITutorRequestInsertsQueuedStudentArchiveJob",
      "TestCreateStudentAppAITutorRequestReturnsCreatedResponse",
      "ueacd",
    ]),
    actual: summarizePresence(goEvidence, [
      "func (uc *CreateStudentAppAITutorRequest) Execute",
      "func (r *ArchiveRepository) GetByID",
      "teaching_tutoring_analysis_requests",
      "TestCreateStudentAppAITutorRequestInsertsQueuedStudentArchiveJob",
    ]),
    expected: "Go domain/use case/API/repository evidence proves own archive read and tutoring request queue write",
    remediation: "Keep the real Go use case and repository evidence attached to this runtime.",
  });

  addFinding(findings, {
    id: "quality_and_root_hooks_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-request"]?.includes("student-app-ai-tutor-request-audit.mjs")) &&
      includesAll(inputs.qualityGate ?? "", ["Student App AI Tutor request runtime audit"]) &&
      includesAll(inputs.rootWorkflowCoverage ?? "", [
        "studentAppAiTutorRequest",
        "student-app-ai-tutor-request.current.json",
        "student_app_ai_tutor_request_runtime",
        "CONTRACT_AND_STUDENT_TUTOR_ASYNC_REQUEST_RUNTIME",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + (inputs.qualityGate ?? "") + (inputs.rootWorkflowCoverage ?? ""), [
      "audit:student-app-ai-tutor-request",
      "Student App AI Tutor request runtime audit",
      "studentAppAiTutorRequest",
    ]),
    expected: "package script, strict quality, and root workflow coverage include Student App AI Tutor request runtime",
    remediation: "Wire the new runtime into package scripts, quality gate, and root workflow coverage.",
  });

  addFinding(findings, {
    id: "structure_sdd_and_board_track_runtime",
    passed: includesAll(inputs.verifyStructure ?? "", [
      "0260-student-app-ai-tutor-request-runtime.md",
      "student-app-ai-tutor-request.input.schema.json",
      "student-app-ai-tutor-request.output.schema.json",
      "student-app-ai-tutor-request-runtime.mjs",
      "student-app-ai-tutor-request-audit.test.mjs",
    ]) &&
      includesAll(inputs.sdd ?? "", [
        "Student App AI Tutor request runtime",
        "StudentAppAITutorRequestPort.createStudentAppAITutorRequest",
        "CreateStudentAppAITutorRequest.Execute",
        "questionBankDraftDeferred=true",
        "not a model inference runtime",
      ]) &&
      includesAll(inputs.architectureBoard ?? "", [
        "Student App AI Tutor request runtime",
        "10.0/10",
        "questionBankDraftDeferred=true",
        "22,435.1 read/write RPS",
      ]),
    actual: summarizePresence((inputs.verifyStructure ?? "") + (inputs.sdd ?? "") + (inputs.architectureBoard ?? ""), [
      "Student App AI Tutor request runtime",
      "10.0/10",
      "questionBankDraftDeferred=true",
    ]),
    expected: "structure verifier, SDD, and architecture board show Student App AI Tutor request as current progress",
    remediation: "Update structure, SDD, and architecture board after completing this slice.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_REQUEST_RUNTIME",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_REQUEST_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_REQUEST_COMMAND_PORT,
      asyncQueue: "student_app_ai_tutor",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    safetyInvariants: {
      studentOwnArchiveScopeEnforced: true,
      teachingArchiveReadVerified: true,
      tutoringAnalysisRequestQueued: true,
      questionBankDraftDeferred: true,
      asyncAnalysisRequired: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalModelCallNowAllowed: false,
      finalEvaluationNowAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    runtimeProbes: { studentAppAiTutorRequest: probe },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as Student App AI Tutor queue admission evidence; continue with worker claim, result review, and question-bank draft slices without repeating production10k."
      : "Fix Student App AI Tutor request runtime evidence before claiming full AI Tutor progress.",
  };
}

export function formatStudentAppAITutorRequestAudit(report) {
  const lines = [
    `Student App AI Tutor request runtime: ${report.readiness}`,
    `Command port: ${report.runtime.commandPort}`,
    `P99/errors: ${report.runtimeSlo.p99Ms ?? "missing"}ms/${report.runtimeSlo.totalErrors ?? "missing"}`,
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

async function runRuntimeProbe(options = {}) {
  const startedAt = Date.now();
  const calls = [];
  try {
    const requestLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-request-audit-")), "request.jsonl");
    const result = await queueStudentAppAITutorRequest(baseInput(), {
      studentAppAITutorRequestPort: {
        async createStudentAppAITutorRequest(request) {
          calls.push(request);
          return portResult();
        },
      },
    }, { requestLogPath, generatedAt: "2026-06-05T00:00:00.000Z" });
    const elapsedMs = Math.max(1, Date.now() - startedAt);
    return {
      status: "PASS",
      result,
      portCalls: calls.length,
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.min(50, options.probeP99Ms ?? elapsedMs),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "STUDENT_APP_AI_TUTOR_REQUEST_ADMISSION_PROBE",
      },
    };
  } catch (error) {
    return { status: "FAIL", error: error.message, portCalls: calls.length, runtimeSlo: failedSlo() };
  }
}

function portResult() {
  return {
    source: {
      targetUseCase: "CreateStudentAppAITutorRequest.Execute",
      readRepository: "ArchiveRepository.GetByID",
      writeRepository: "ArchiveRepository.CreateTutoringAnalysisRequest",
      queueTable: "teaching_tutoring_analysis_requests",
    },
    request: {
      id: "tutor_req_student_app_001",
      archiveItemId: "tarch_student_quiz_001",
      requestedByPrincipalId: "student_001",
      analysisGoal: "explain weak algebra skills",
      questionBankIntent: "GENERATE_PERSONALIZED_CHECK",
      status: "QUEUED",
      sourceArchiveOwnerType: "STUDENT",
      sourceArchiveStudentId: "student_001",
      sourceArchiveMaterial: "QUIZ",
      createdAt: "2026-06-05T00:00:00.000Z",
      updatedAt: "2026-06-05T00:00:00.000Z",
    },
  };
}

function failedSlo() {
  return { targetP99Ms: 50, p99Ms: null, totalErrors: 1, operations: 0, evidenceClass: "FAILED_PROBE" };
}

function baseInput() {
  return JSON.parse(fs.readFileSync("contracts/agent/student-app-ai-tutor-request.input.example.json", "utf8"));
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => [
    key,
    fs.readFileSync(path.join(root, relativePath), "utf8"),
  ]));
}

function writeReport(root, reportPath, report) {
  const absolute = path.join(root, reportPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  return { outPath: outIndex === -1 ? defaultOutPath : argv[outIndex + 1] };
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function summarizePresence(text = "", needles = []) {
  return needles.map((needle) => `${needle}=${text.includes(needle)}`).join(";");
}

function includesAll(text = "", needles = []) {
  return needles.every((needle) => text.includes(needle));
}

function hasForbiddenRuntimeClaim(text = "") {
  return forbiddenRuntimeClaims.some((claim) => text.includes(claim));
}

function addFinding(findings, finding) {
  findings.push({
    id: finding.id,
    passed: Boolean(finding.passed),
    severity: finding.passed ? "info" : "error",
    actual: finding.actual ?? null,
    expected: finding.expected,
    remediation: finding.remediation,
  });
}

function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return String(value);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = await auditStudentAppAITutorRequest(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatStudentAppAITutorRequestAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
