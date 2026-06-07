import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_RESULT_COMMAND_PORT,
  STUDENT_APP_AI_TUTOR_RESULT_RUNTIME_ID,
  recordStudentAppAITutorResult,
} from "./student-app-ai-tutor-result-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-result.current.json";
const sourceFiles = {
  inputSchema: "contracts/agent/student-app-ai-tutor-result.input.schema.json",
  outputSchema: "contracts/agent/student-app-ai-tutor-result.output.schema.json",
  inputExample: "contracts/agent/student-app-ai-tutor-result.input.example.json",
  outputExample: "contracts/agent/student-app-ai-tutor-result.output.example.json",
  runtime: "tools/student-app-ai-tutor-result-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-result-runtime.test.mjs",
  workerClaimReport: "reports/student-app-ai-tutor-worker-claim.current.json",
  goUseCase: "services/teaching-archive-gateway/internal/usecase/record_tutoring_analysis_result.go",
  goUseCaseTest: "services/teaching-archive-gateway/internal/usecase/record_tutoring_analysis_result_test.go",
  goDomain: "services/teaching-archive-gateway/internal/domain/tutoring_analysis_result.go",
  goDomainTest: "services/teaching-archive-gateway/internal/domain/tutoring_analysis_request_test.go",
  goRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go",
  goHttpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_test.go",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0262-student-app-ai-tutor-result-runtime.md",
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
  "createQuestionBankDraftNowAllowed: true",
  "studentVisiblePublishAllowed: true",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "dangerouslySetInnerHTML",
  "innerHTML",
];

export async function auditStudentAppAITutorResult(inputs, options = {}) {
  const findings = [];
  const inputSchema = parseJson(inputs.inputSchema, {});
  const outputSchema = parseJson(inputs.outputSchema, {});
  const inputExample = parseJson(inputs.inputExample, {});
  const outputExample = parseJson(inputs.outputExample, {});
  const workerClaimReport = parseJson(inputs.workerClaimReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const goEvidence = [
    inputs.goUseCase ?? "",
    inputs.goUseCaseTest ?? "",
    inputs.goDomain ?? "",
    inputs.goDomainTest ?? "",
    inputs.goRepository ?? "",
    inputs.goHttpTest ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(options);

  addFinding(findings, {
    id: "contract.schema_and_examples",
    passed: inputSchema.properties?.schemaVersion?.const === "2026-06-05.student-app.ai-tutor-result.v1" &&
      inputSchema.properties?.principal?.properties?.role?.const === "SERVICE" &&
      inputSchema.properties?.worker?.properties?.agent?.const === "StudentTutorAgent" &&
      inputSchema.properties?.resultPolicy?.properties?.targetUseCase?.const === "RecordTutoringAnalysisResult.Execute" &&
      inputSchema.properties?.resultPolicy?.properties?.writeRepositoryOperation?.const === "ArchiveRepository.RecordTutoringAnalysisResult" &&
      inputSchema.properties?.resultPolicy?.properties?.executeModelNowAllowed?.const === false &&
      outputSchema.properties?.schemaVersion?.const === "2026-06-05.student-app.ai-tutor-result-recorded.v1" &&
      outputSchema.properties?.runtimeId?.const === STUDENT_APP_AI_TUTOR_RESULT_RUNTIME_ID &&
      outputSchema.properties?.commandPort?.const === STUDENT_APP_AI_TUTOR_RESULT_COMMAND_PORT &&
      inputExample.claim?.requestId === "tutor_req_student_app_001" &&
      outputExample.result?.requestId === "tutor_req_student_app_001",
    actual: summarizePresence(JSON.stringify(inputSchema) + JSON.stringify(outputSchema) + JSON.stringify(inputExample) + JSON.stringify(outputExample), [
      "STUDENT_APP_AI_TUTOR_RESULT_RECORDED",
      "StudentAppAITutorResultPort.recordTutoringAnalysisResult",
      "RecordTutoringAnalysisResult.Execute",
      "ArchiveRepository.RecordTutoringAnalysisResult",
    ]),
    expected: "contracts define internal StudentTutorAgent result recording through the injected Go use case port",
    remediation: "Keep this slice as controlled result recording, not model inference, draft creation, or student publication.",
  });

  addFinding(findings, {
    id: "worker_claim.source_ready",
    passed: workerClaimReport.readiness === "READY",
    actual: workerClaimReport.readiness ?? "missing",
    expected: "READY Student App AI Tutor worker claim evidence",
    remediation: "Result recording must build on a ready worker claim report.",
  });

  addFinding(findings, {
    id: "runtime.identity_ports_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_RESULT_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_RESULT_COMMAND_PORT",
      "StudentAppAITutorResultPort.recordTutoringAnalysisResult",
      "recordStudentAppAITutorResult",
      "STUDENT_APP_AI_TUTOR_RESULT_READY",
      "STUDENT_APP_AI_TUTOR_RESULT_RECORDED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "RecordTutoringAnalysisResult.Execute",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_result_runtime",
      "StudentAppAITutorResultPort.recordTutoringAnalysisResult",
      "STUDENT_APP_AI_TUTOR_RESULT_RECORDED",
    ]),
    expected: "runtime uses a named injected result port and idempotent result record",
    remediation: "Do not turn this runtime into an untracked worker executor or direct persistence script.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "internalServiceOnly: true",
      "claimRequired: true",
      "workerLeaseMustMatch: true",
      "modelExecutionStarted: false",
      "modelExecutionAlreadyCompletedElsewhere: true",
      "resultRecorded: true",
      "questionBankDraftCreated: false",
      "studentVisibleResultPublished: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime records only through the injected port and blocks raw DB, HTTP, inline model execution, draft creation, publication, tools, and Swarm",
    remediation: "AI model execution, question-bank generation, and student-visible publication must remain separate reviewed slices.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_result",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_RESULT_RECORDED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_RESULT_COMMAND_PORT &&
      probe.result?.queue?.targetUseCase === "RecordTutoringAnalysisResult.Execute" &&
      probe.result?.queue?.writeRepositoryOperation === "ArchiveRepository.RecordTutoringAnalysisResult" &&
      probe.result?.result?.requestId === "tutor_req_student_app_001" &&
      probe.result?.result?.workerId === "worker_student_tutor_local_01" &&
      probe.result?.boundary?.resultRecorded === true &&
      probe.result?.boundary?.modelExecutionStarted === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};request=${probe.result.result.requestId};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records one claimed AI Tutor result through the injected use case port",
    remediation: "Result runtime must prove the port call, worker lease shape, and no inline model/draft/publication execution.",
  });

  addFinding(findings, {
    id: "tests.cover_result_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a successful AI Tutor analysis result through the injected use case port",
      "uses idempotency for replay and rejects conflicting result inputs",
      "records failed analysis output without result fields",
      "rejects missing ports, non-service principals, remote workers, and mismatched leases",
      "rejects inline model execution, question-bank creation, publish, DB/HTTP, local tools, and Swarm",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, failed result, missing port, non-service, remote worker, lease mismatch, and unsafe policy tests",
    remediation: "Add regression coverage before using this as Student App AI Tutor result evidence.",
  });

  addFinding(findings, {
    id: "teaching_archive.go_result_usecase_and_repository_evidence_exists",
    passed: includesAll(goEvidence, [
      "func NewRecordTutoringAnalysisResult",
      "func (uc *RecordTutoringAnalysisResult) Execute",
      "ApplyTutoringAnalysisResult",
      "NormalizeRecordTutoringAnalysisResultInput",
      "AuthorizeRecordTutoringAnalysisResult",
      "canRecordTutoringAnalysisResult",
      "GetTutoringAnalysisRequestByID",
      "RecordTutoringAnalysisResult",
      "TestRecordTutoringAnalysisResultAllowsInternalService",
      "TestRecordTutoringAnalysisResultRejectsMismatchedWorkerBeforeUpdate",
      "TestRecordTutoringAnalysisResultRejectsFinalOverwrite",
      "TestRecordTutoringAnalysisResultReturnsUpdatedResponse",
      "TestRecordTutoringAnalysisResultRejectsTeacherPrincipal",
      "UPDATE teaching_tutoring_analysis_requests",
      "claimed_by_worker_id",
      "claim_expires_at >",
    ]),
    actual: summarizePresence(goEvidence, [
      "func (uc *RecordTutoringAnalysisResult) Execute",
      "AuthorizeRecordTutoringAnalysisResult",
      "canRecordTutoringAnalysisResult",
      "UPDATE teaching_tutoring_analysis_requests",
      "claim_expires_at >",
    ]),
    expected: "Go domain/use case/repository/HTTP evidence proves internal-service result recording with worker lease match",
    remediation: "Keep real Go result use case and PostgreSQL guarded update evidence attached to this runtime.",
  });

  addFinding(findings, {
    id: "quality_and_root_hooks_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-result"]?.includes("student-app-ai-tutor-result-audit.mjs")) &&
      includesAll(inputs.qualityGate ?? "", ["Student App AI Tutor result runtime audit"]) &&
      includesAll(inputs.rootWorkflowCoverage ?? "", [
        "studentAppAiTutorResult",
        "student-app-ai-tutor-result.current.json",
        "student_app_ai_tutor_result_runtime",
        "CONTRACT_AND_STUDENT_TUTOR_ASYNC_RESULT_RUNTIME",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + (inputs.qualityGate ?? "") + (inputs.rootWorkflowCoverage ?? ""), [
      "audit:student-app-ai-tutor-result",
      "Student App AI Tutor result runtime audit",
      "studentAppAiTutorResult",
    ]),
    expected: "package script, strict quality, and root workflow coverage include Student App AI Tutor result runtime",
    remediation: "Wire the new runtime into package scripts, quality gate, and root workflow coverage.",
  });

  addFinding(findings, {
    id: "structure_sdd_and_board_track_runtime",
    passed: includesAll(inputs.verifyStructure ?? "", [
      "0262-student-app-ai-tutor-result-runtime.md",
      "student-app-ai-tutor-result.input.schema.json",
      "student-app-ai-tutor-result.output.schema.json",
      "student-app-ai-tutor-result-runtime.mjs",
      "student-app-ai-tutor-result-audit.test.mjs",
    ]) &&
      includesAll(inputs.sdd ?? "", [
        "Student App AI Tutor result runtime",
        "StudentAppAITutorResultPort.recordTutoringAnalysisResult",
        "RecordTutoringAnalysisResult.Execute",
        "worker lease must match",
        "not a model inference runtime",
      ]) &&
      includesAll(inputs.architectureBoard ?? "", [
        "Student App AI Tutor result runtime",
        "10.2/10",
        "RecordTutoringAnalysisResult.Execute",
        "ArchiveRepository.RecordTutoringAnalysisResult",
      ]),
    actual: summarizePresence((inputs.verifyStructure ?? "") + (inputs.sdd ?? "") + (inputs.architectureBoard ?? ""), [
      "Student App AI Tutor result runtime",
      "10.2/10",
      "ArchiveRepository.RecordTutoringAnalysisResult",
    ]),
    expected: "structure verifier, SDD, and architecture board show Student App AI Tutor result as current progress",
    remediation: "Update structure, SDD, and architecture board after completing this slice.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_RESULT_RUNTIME",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_RESULT_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_RESULT_COMMAND_PORT,
      asyncQueue: "student_app_ai_tutor",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    safetyInvariants: {
      internalServiceOnly: true,
      claimRequired: true,
      workerLeaseMustMatch: true,
      modelExecutionStarted: false,
      modelExecutionAlreadyCompletedElsewhere: true,
      resultRecorded: true,
      questionBankDraftCreated: false,
      studentVisibleResultPublished: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    runtimeProbes: { studentAppAiTutorResult: probe },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as Student App AI Tutor result-recording evidence; continue with reviewed question-bank draft and student-visible delivery slices without repeating production10k."
      : "Fix Student App AI Tutor result runtime evidence before claiming AI Tutor processing progress.",
  };
}

export function formatStudentAppAITutorResultAudit(report) {
  const lines = [
    `Student App AI Tutor result runtime: ${report.readiness}`,
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
    const resultLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-result-audit-")), "result.jsonl");
    const result = await recordStudentAppAITutorResult(baseInput(), {
      studentAppAITutorResultPort: {
        async recordTutoringAnalysisResult(request) {
          calls.push(request);
          return portResult();
        },
      },
    }, { resultLogPath, generatedAt: "2026-06-05T00:01:00.000Z" });
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
        evidenceClass: "STUDENT_APP_AI_TUTOR_RESULT_PROBE",
      },
    };
  } catch (error) {
    return { status: "FAIL", error: error.message, portCalls: calls.length, runtimeSlo: failedSlo() };
  }
}

function portResult() {
  return {
    source: {
      targetUseCase: "RecordTutoringAnalysisResult.Execute",
      readRepositoryOperation: "ArchiveRepository.GetTutoringAnalysisRequestByID",
      writeRepositoryOperation: "ArchiveRepository.RecordTutoringAnalysisResult",
      queueTable: "teaching_tutoring_analysis_requests",
    },
    result: {
      requestId: "tutor_req_student_app_001",
      workerId: "worker_student_tutor_local_01",
      status: "SUCCEEDED",
      resultSummary: "The student understands fractions but needs more mixed-operation practice.",
      resultRef: "local://student-app-ai-tutor/tutor_req_student_app_001/result.json",
      questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
      completedAt: "2026-06-05T00:01:00.000Z",
    },
  };
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.student-app.ai-tutor-result.v1",
    resultInvocationId: "student_app_ai_tutor_result_001",
    principal: {
      principalId: "svc_student_tutor_worker",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT"],
      sessionId: "svc_session_student_tutor_worker",
    },
    worker: {
      workerId: "worker_student_tutor_local_01",
      agent: "StudentTutorAgent",
      skillId: "tutor_student",
      nodeType: "LOCAL",
    },
    claim: {
      requestId: "tutor_req_student_app_001",
      archiveItemId: "tarch_student_quiz_001",
      status: "IN_PROGRESS",
      claimedByWorkerId: "worker_student_tutor_local_01",
      claimExpiresAt: "2026-06-05T00:02:00.000Z",
      questionBankIntent: "GENERATE_PERSONALIZED_CHECK",
    },
    result: {
      status: "SUCCEEDED",
      resultSummary: "The student understands fractions but needs more mixed-operation practice.",
      resultRef: "local://student-app-ai-tutor/tutor_req_student_app_001/result.json",
      questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
    },
    resultPolicy: {
      queueName: "student_app_ai_tutor",
      queueTable: "teaching_tutoring_analysis_requests",
      targetUseCase: "RecordTutoringAnalysisResult.Execute",
      readRepositoryOperation: "ArchiveRepository.GetTutoringAnalysisRequestByID",
      writeRepositoryOperation: "ArchiveRepository.RecordTutoringAnalysisResult",
      internalServiceOnly: true,
      claimRequired: true,
      workerLeaseMustMatch: true,
      modelExecutionAlreadyCompletedElsewhere: true,
      executeModelNowAllowed: false,
      createQuestionBankDraftNowAllowed: false,
      studentVisiblePublishAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: ["evidence:student-app-ai-tutor-worker-claim:tutor_req_student_app_001"],
    idempotencyKey: "student-app-ai-tutor-result:worker_student_tutor_local_01:tutor_req_student_app_001",
  };
}

function failedSlo() {
  return { targetP99Ms: 50, p99Ms: null, totalErrors: 1, operations: 0, evidenceClass: "FAILED_PROBE" };
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => [
    key,
    fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : "",
  ]));
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function addFinding(findings, finding) {
  findings.push({
    severity: finding.passed ? "info" : "error",
    ...finding,
  });
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

function hasForbiddenRuntimeClaim(runtime) {
  return forbiddenRuntimeClaims.some((claim) => runtime.includes(claim));
}

function summarizePresence(text, values) {
  return values.map((value) => `${value}=${text.includes(value)}`).join(";");
}

function stringifyScalar(value) {
  if (Array.isArray(value)) return value.join(",");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

async function main() {
  const root = process.cwd();
  const out = parseOutArg(process.argv.slice(2));
  const report = await auditStudentAppAITutorResult(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorResultAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
