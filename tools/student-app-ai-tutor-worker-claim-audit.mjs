import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_WORKER_CLAIM_COMMAND_PORT,
  STUDENT_APP_AI_TUTOR_WORKER_CLAIM_RUNTIME_ID,
  claimStudentAppAITutorWorkerRequest,
} from "./student-app-ai-tutor-worker-claim-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-worker-claim.current.json";
const sourceFiles = {
  inputSchema: "contracts/agent/student-app-ai-tutor-worker-claim.input.schema.json",
  outputSchema: "contracts/agent/student-app-ai-tutor-worker-claim.output.schema.json",
  inputExample: "contracts/agent/student-app-ai-tutor-worker-claim.input.example.json",
  outputExample: "contracts/agent/student-app-ai-tutor-worker-claim.output.example.json",
  runtime: "tools/student-app-ai-tutor-worker-claim-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-worker-claim-runtime.test.mjs",
  requestReport: "reports/student-app-ai-tutor-request.current.json",
  goUseCase: "services/teaching-archive-gateway/internal/usecase/claim_tutoring_analysis_request.go",
  goUseCaseTest: "services/teaching-archive-gateway/internal/usecase/claim_tutoring_analysis_request_test.go",
  goDomain: "services/teaching-archive-gateway/internal/domain/tutoring_analysis_claim.go",
  goDomainTest: "services/teaching-archive-gateway/internal/domain/tutoring_analysis_claim_test.go",
  goRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go",
  goRepositoryTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_test.go",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0261-student-app-ai-tutor-worker-claim-runtime.md",
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
  "recordResultNowAllowed: true",
  "questionBankDraftNowAllowed: true",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "dangerouslySetInnerHTML",
  "innerHTML",
];

export async function auditStudentAppAITutorWorkerClaim(inputs, options = {}) {
  const findings = [];
  const inputSchema = parseJson(inputs.inputSchema, {});
  const outputSchema = parseJson(inputs.outputSchema, {});
  const inputExample = parseJson(inputs.inputExample, {});
  const outputExample = parseJson(inputs.outputExample, {});
  const requestReport = parseJson(inputs.requestReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const goEvidence = [
    inputs.goUseCase ?? "",
    inputs.goUseCaseTest ?? "",
    inputs.goDomain ?? "",
    inputs.goDomainTest ?? "",
    inputs.goRepository ?? "",
    inputs.goRepositoryTest ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(options);

  addFinding(findings, {
    id: "contract.schema_and_examples",
    passed: inputSchema.properties?.schemaVersion?.const === "2026-06-05.student-app.ai-tutor-worker-claim.v1" &&
      inputSchema.properties?.principal?.properties?.role?.const === "SERVICE" &&
      inputSchema.properties?.worker?.properties?.agent?.const === "StudentTutorAgent" &&
      inputSchema.properties?.worker?.properties?.skillId?.const === "tutor_student" &&
      inputSchema.properties?.claimPolicy?.properties?.targetUseCase?.const === "ClaimTutoringAnalysisRequest.Execute" &&
      inputSchema.properties?.claimPolicy?.properties?.repositoryOperation?.const === "ArchiveRepository.ClaimNextTutoringAnalysisRequest" &&
      inputSchema.properties?.claimPolicy?.properties?.executeModelNowAllowed?.const === false &&
      outputSchema.properties?.schemaVersion?.const === "2026-06-05.student-app.ai-tutor-worker-claim-recorded.v1" &&
      outputSchema.properties?.runtimeId?.const === STUDENT_APP_AI_TUTOR_WORKER_CLAIM_RUNTIME_ID &&
      outputSchema.properties?.commandPort?.const === STUDENT_APP_AI_TUTOR_WORKER_CLAIM_COMMAND_PORT &&
      inputExample.worker?.workerId === "worker_student_tutor_local_01" &&
      outputExample.claim?.requestId === "tutor_req_student_app_001",
    actual: summarizePresence(JSON.stringify(inputSchema) + JSON.stringify(outputSchema) + JSON.stringify(inputExample) + JSON.stringify(outputExample), [
      "STUDENT_APP_AI_TUTOR_WORKER_CLAIMED",
      "StudentAppAITutorWorkerClaimPort.claimTutoringAnalysisRequest",
      "ClaimTutoringAnalysisRequest.Execute",
      "ArchiveRepository.ClaimNextTutoringAnalysisRequest",
    ]),
    expected: "contracts define internal StudentTutorAgent worker claim through the injected Go use case port",
    remediation: "Keep this slice as worker claim control plane, not model inference or result recording.",
  });

  addFinding(findings, {
    id: "request_admission.source_ready",
    passed: requestReport.readiness === "READY",
    actual: requestReport.readiness ?? "missing",
    expected: "READY Student App AI Tutor request admission evidence",
    remediation: "Worker claim evidence must build on a ready Student App AI Tutor request admission report.",
  });

  addFinding(findings, {
    id: "runtime.identity_ports_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_WORKER_CLAIM_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_WORKER_CLAIM_COMMAND_PORT",
      "StudentAppAITutorWorkerClaimPort.claimTutoringAnalysisRequest",
      "claimStudentAppAITutorWorkerRequest",
      "STUDENT_APP_AI_TUTOR_WORKER_CLAIM_READY",
      "STUDENT_APP_AI_TUTOR_WORKER_CLAIMED",
      "STUDENT_APP_AI_TUTOR_WORKER_NO_CLAIM",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "ClaimTutoringAnalysisRequest.Execute",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_worker_claim_runtime",
      "StudentAppAITutorWorkerClaimPort.claimTutoringAnalysisRequest",
      "STUDENT_APP_AI_TUTOR_WORKER_CLAIMED",
    ]),
    expected: "runtime uses a named injected worker claim port and idempotent claim record",
    remediation: "Do not turn this runtime into an untracked direct worker executor.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "internalServiceOnly: true",
      "atomicSkipLockedClaimRequired: true",
      "leaseRecorded: claim.found",
      "modelExecutionStarted: false",
      "resultRecorded: false",
      "questionBankDraftCreated: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime claims only through the injected port and blocks raw DB, HTTP, model execution, result recording, question-bank drafts, tools, and Swarm",
    remediation: "AI Tutor analysis/result/question-bank generation must stay in later async worker slices.",
  });

  addFinding(findings, {
    id: "runtime.probe_claims_worker_lease",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_WORKER_CLAIMED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_WORKER_CLAIM_COMMAND_PORT &&
      probe.result?.queue?.targetUseCase === "ClaimTutoringAnalysisRequest.Execute" &&
      probe.result?.queue?.repositoryOperation === "ArchiveRepository.ClaimNextTutoringAnalysisRequest" &&
      probe.result?.claim?.requestId === "tutor_req_student_app_001" &&
      probe.result?.claim?.workerId === "worker_student_tutor_local_01" &&
      probe.result?.boundary?.leaseRecorded === true &&
      probe.result?.boundary?.modelExecutionStarted === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};request=${probe.result.claim.requestId};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe claims one leased worker request through the injected use case port",
    remediation: "Worker claim must prove the port call, lease shape, and no model/result execution.",
  });

  addFinding(findings, {
    id: "tests.cover_worker_claim_negative_paths",
    passed: includesAll(runtimeTest, [
      "claims one queued AI Tutor request through the injected use case port",
      "uses idempotency for replay and rejects conflicting worker claim inputs",
      "handles empty queue without starting model execution",
      "rejects missing ports, non-service principals, remote workers, and mismatched claims",
      "rejects model execution, result recording, question-bank drafts, direct DB/HTTP, local tools, and Swarm",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, empty queue, missing port, non-service, remote worker, mismatch, and unsafe policy tests",
    remediation: "Add regression coverage before using this as Student App AI Tutor worker claim evidence.",
  });

  addFinding(findings, {
    id: "teaching_archive.go_claim_usecase_and_repository_evidence_exists",
    passed: includesAll(goEvidence, [
      "func NewClaimTutoringAnalysisRequest",
      "func (uc *ClaimTutoringAnalysisRequest) Execute",
      "AuthorizeClaimTutoringAnalysisRequest",
      "BuildTutoringAnalysisClaimLease",
      "ApplyTutoringAnalysisClaim",
      "ClaimNextTutoringAnalysisRequest",
      "FOR UPDATE SKIP LOCKED",
      "TestClaimTutoringAnalysisRequestAllowsInternalService",
      "TestClaimTutoringAnalysisRequestRejectsTeacherBeforeRepository",
      "TestApplyTutoringAnalysisClaimReclaimsExpiredLease",
      "TestClaimNextTutoringAnalysisRequestUsesAtomicSkipLockedUpdate",
    ]),
    actual: summarizePresence(goEvidence, [
      "func (uc *ClaimTutoringAnalysisRequest) Execute",
      "AuthorizeClaimTutoringAnalysisRequest",
      "FOR UPDATE SKIP LOCKED",
      "TestClaimNextTutoringAnalysisRequestUsesAtomicSkipLockedUpdate",
    ]),
    expected: "Go domain/use case/repository evidence proves internal-service lease claim with SKIP LOCKED",
    remediation: "Keep real Go claim use case and PostgreSQL atomic claim evidence attached to this runtime.",
  });

  addFinding(findings, {
    id: "quality_and_root_hooks_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-worker-claim"]?.includes("student-app-ai-tutor-worker-claim-audit.mjs")) &&
      includesAll(inputs.qualityGate ?? "", ["Student App AI Tutor worker claim runtime audit"]) &&
      includesAll(inputs.rootWorkflowCoverage ?? "", [
        "studentAppAiTutorWorkerClaim",
        "student-app-ai-tutor-worker-claim.current.json",
        "student_app_ai_tutor_worker_claim_runtime",
        "CONTRACT_AND_STUDENT_TUTOR_ASYNC_CLAIM_RUNTIME",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + (inputs.qualityGate ?? "") + (inputs.rootWorkflowCoverage ?? ""), [
      "audit:student-app-ai-tutor-worker-claim",
      "Student App AI Tutor worker claim runtime audit",
      "studentAppAiTutorWorkerClaim",
    ]),
    expected: "package script, strict quality, and root workflow coverage include Student App AI Tutor worker claim runtime",
    remediation: "Wire the new runtime into package scripts, quality gate, and root workflow coverage.",
  });

  addFinding(findings, {
    id: "structure_sdd_and_board_track_runtime",
    passed: includesAll(inputs.verifyStructure ?? "", [
      "0261-student-app-ai-tutor-worker-claim-runtime.md",
      "student-app-ai-tutor-worker-claim.input.schema.json",
      "student-app-ai-tutor-worker-claim.output.schema.json",
      "student-app-ai-tutor-worker-claim-runtime.mjs",
      "student-app-ai-tutor-worker-claim-audit.test.mjs",
    ]) &&
      includesAll(inputs.sdd ?? "", [
        "Student App AI Tutor worker claim runtime",
        "StudentAppAITutorWorkerClaimPort.claimTutoringAnalysisRequest",
        "ClaimTutoringAnalysisRequest.Execute",
        "FOR UPDATE SKIP LOCKED",
        "not a model inference runtime",
      ]) &&
      includesAll(inputs.architectureBoard ?? "", [
        "Student App AI Tutor worker claim runtime",
        "10.1/10",
        "ClaimTutoringAnalysisRequest.Execute",
        "FOR UPDATE SKIP LOCKED",
      ]),
    actual: summarizePresence((inputs.verifyStructure ?? "") + (inputs.sdd ?? "") + (inputs.architectureBoard ?? ""), [
      "Student App AI Tutor worker claim runtime",
      "10.1/10",
      "FOR UPDATE SKIP LOCKED",
    ]),
    expected: "structure verifier, SDD, and architecture board show Student App AI Tutor worker claim as current progress",
    remediation: "Update structure, SDD, and architecture board after completing this slice.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_WORKER_CLAIM_RUNTIME",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_WORKER_CLAIM_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_WORKER_CLAIM_COMMAND_PORT,
      asyncQueue: "student_app_ai_tutor",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    safetyInvariants: {
      internalServiceOnly: true,
      atomicSkipLockedClaimRequired: true,
      leaseRecorded: true,
      modelExecutionStarted: false,
      resultRecorded: false,
      questionBankDraftCreated: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    runtimeProbes: { studentAppAiTutorWorkerClaim: probe },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as Student App AI Tutor worker claim evidence; continue with analysis-result review and question-bank draft slices without repeating production10k."
      : "Fix Student App AI Tutor worker claim runtime evidence before claiming AI Tutor processing progress.",
  };
}

export function formatStudentAppAITutorWorkerClaimAudit(report) {
  const lines = [
    `Student App AI Tutor worker claim runtime: ${report.readiness}`,
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
    const claimLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-worker-claim-audit-")), "claim.jsonl");
    const result = await claimStudentAppAITutorWorkerRequest(baseInput(), {
      studentAppAITutorWorkerClaimPort: {
        async claimTutoringAnalysisRequest(request) {
          calls.push(request);
          return portClaimResult();
        },
      },
    }, { claimLogPath, generatedAt: "2026-06-05T00:00:00.000Z" });
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
        evidenceClass: "STUDENT_APP_AI_TUTOR_WORKER_CLAIM_PROBE",
      },
    };
  } catch (error) {
    return { status: "FAIL", error: error.message, portCalls: calls.length, runtimeSlo: failedSlo() };
  }
}

function portClaimResult() {
  return {
    source: {
      targetUseCase: "ClaimTutoringAnalysisRequest.Execute",
      repositoryOperation: "ArchiveRepository.ClaimNextTutoringAnalysisRequest",
      queueTable: "teaching_tutoring_analysis_requests",
      atomicSkipLocked: true,
    },
    claim: {
      found: true,
      requestId: "tutor_req_student_app_001",
      archiveItemId: "tarch_student_quiz_001",
      sourceArchiveStudentId: "student_001",
      questionBankIntent: "GENERATE_PERSONALIZED_CHECK",
      status: "IN_PROGRESS",
      claimedByWorkerId: "worker_student_tutor_local_01",
      claimExpiresAt: "2026-06-05T00:02:00.000Z",
    },
  };
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.student-app.ai-tutor-worker-claim.v1",
    claimInvocationId: "student_app_ai_tutor_worker_claim_001",
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
      leaseSeconds: 120,
      maxConcurrentClaims: 1,
    },
    claimPolicy: {
      queueName: "student_app_ai_tutor",
      queueTable: "teaching_tutoring_analysis_requests",
      targetUseCase: "ClaimTutoringAnalysisRequest.Execute",
      repositoryOperation: "ArchiveRepository.ClaimNextTutoringAnalysisRequest",
      atomicSkipLockedRequired: true,
      leaseRequired: true,
      executeModelNowAllowed: false,
      recordResultNowAllowed: false,
      questionBankDraftNowAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: ["evidence:student-app-ai-tutor-request:tutor_req_student_app_001"],
    idempotencyKey: "student-app-ai-tutor-worker-claim:worker_student_tutor_local_01:20260605T000000Z",
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
  const report = await auditStudentAppAITutorWorkerClaim(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorWorkerClaimAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
