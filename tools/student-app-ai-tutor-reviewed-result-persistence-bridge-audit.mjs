import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_PORT,
  STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_RUNTIME_ID,
  recordStudentAppAITutorReviewedResultPersistenceBridge,
} from "./student-app-ai-tutor-reviewed-result-persistence-bridge-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-reviewed-result-persistence-bridge.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-reviewed-result-persistence-bridge-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-reviewed-result-persistence-bridge-runtime.test.mjs",
  answerReviewGateReport: "reports/student-app-ai-tutor-answer-review-gate.current.json",
  goUseCase: "services/teaching-archive-gateway/internal/usecase/record_tutoring_analysis_result.go",
  goUseCaseTest: "services/teaching-archive-gateway/internal/usecase/record_tutoring_analysis_result_test.go",
  goDomain: "services/teaching-archive-gateway/internal/domain/tutoring_analysis_result.go",
  goRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go",
  goHttpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_test.go",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0327-student-app-ai-tutor-reviewed-result-persistence-bridge.md",
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
  "guidanceTextAllowed: true",
  "rawModelOutputAllowed: true",
  "promptAllowed: true",
  "answerKeyAllowed: true",
  "contentRefAllowed: true",
  "retrievalAllowed: true",
  "studentVisiblePublishAllowed: true",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "externalToolUseAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "dangerouslySetInnerHTML",
  "innerHTML",
];

export async function auditStudentAppAITutorReviewedResultPersistenceBridge(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const sourceReport = parseJson(inputs.answerReviewGateReport, {});
  const existingBoundary = [
    inputs.goUseCase ?? "",
    inputs.goUseCaseTest ?? "",
    inputs.goDomain ?? "",
    inputs.goRepository ?? "",
    inputs.goHttpTest ?? "",
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
  const probe = await runRuntimeProbe(sourceReport, options);

  addFinding(findings, {
    id: "source.0326_answer_review_gate_ready",
    passed: sourceReport.readiness === "READY" &&
      sourceReport.workloadType === "STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE" &&
      sourceReport.runtime?.runtimeId === "student_app_ai_tutor_answer_review_gate_runtime" &&
      sourceReport.runtime?.status === "STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_RECORDED" &&
      sourceReport.safetyInvariants?.humanReviewCompleted === true &&
      sourceReport.safetyInvariants?.resultPersistenceStarted === false &&
      sourceReport.safetyInvariants?.tutoringResultRecorded === false &&
      sourceReport.safetyInvariants?.studentVisiblePublished === false &&
      sourceReport.runtimeSlo?.totalErrors === 0,
    actual: `${sourceReport.readiness ?? "missing"}:${sourceReport.runtime?.status ?? "missing"}`,
    expected: "READY 0326 answer review gate with no prior persistence or student visibility",
    remediation: "Run 0326 answer review gate audit before reviewed result persistence.",
  });

  addFinding(findings, {
    id: "existing.record_tutoring_analysis_result_boundary_reused",
    passed: includesAll(existingBoundary, [
      "func (uc *RecordTutoringAnalysisResult) Execute",
      "AuthorizeRecordTutoringAnalysisResult",
      "NormalizeRecordTutoringAnalysisResultInput",
      "ApplyTutoringAnalysisResult",
      "RecordTutoringAnalysisResult",
      "UPDATE teaching_tutoring_analysis_requests",
      "claim_expires_at >",
      "TestRecordTutoringAnalysisResultAllowsInternalService",
    ]),
    actual: summarizePresence(existingBoundary, [
      "func (uc *RecordTutoringAnalysisResult) Execute",
      "AuthorizeRecordTutoringAnalysisResult",
      "UPDATE teaching_tutoring_analysis_requests",
    ]),
    expected: "0327 reuses the existing guarded Go result use case instead of adding a duplicate write path",
    remediation: "Keep reviewed AI Tutor result persistence behind RecordTutoringAnalysisResult.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_PORT",
      "StudentAppAITutorResultPort.recordTutoringAnalysisResult",
      "recordStudentAppAITutorReviewedResultPersistenceBridge",
      "STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_reviewed_result_persistence_bridge_runtime",
      "StudentAppAITutorResultPort.recordTutoringAnalysisResult",
      "STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTED",
    ]),
    expected: "runtime is a replay-safe bridge through the existing result port",
    remediation: "Keep 0327 port-based, idempotent, and tied to 0326 review evidence.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "answerReviewGateRequired: true",
      "approvedReviewRequired: true",
      "recordTutoringAnalysisResultUseCaseInvoked: true",
      "resultPersistenceStarted: true",
      "tutoringResultRecorded: true",
      "resultRefExposed: false",
      "guidanceTextSentToPort: false",
      "rawModelOutputExcluded: true",
      "promptExcluded: true",
      "answerKeyExcluded: true",
      "contentRefExcluded: true",
      "studentVisiblePublished: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "externalToolUseAllowed: false",
      "retrievalAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "futureStudentVisibilityRequiresSeparateRuntime: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime may persist the reviewed result through the injected port but blocks guidance text, raw model data, DB, HTTP, tools, Swarm, and student publication",
    remediation: "Do not collapse reviewed result persistence into student-visible delivery or direct database writes.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_reviewed_result",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_PORT &&
      probe.result?.recordTutoringAnalysisResultCommand?.targetUseCase === "RecordTutoringAnalysisResult.Execute" &&
      probe.result?.reviewedResult?.reviewId === "ai_tutor_answer_review_gate_001" &&
      probe.result?.boundary?.tutoringResultRecorded === true &&
      probe.result?.boundary?.resultRefExposed === false &&
      probe.result?.boundary?.studentVisiblePublished === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};review=${probe.result.reviewedResult.reviewId};p99=${probe.runtimeSlo.p99Ms};calls=${probe.portCalls}`
      : probe.error,
    expected: "probe records one reviewed AI Tutor result through the existing result port with no student-visible side effects",
    remediation: "0327 must prove 0326 review gate to RecordTutoringAnalysisResult linkage.",
  });

  addFinding(findings, {
    id: "tests.cover_reviewed_persistence_negative_paths",
    passed: includesAll(runtimeTest, [
      "persists an approved answer review through RecordTutoringAnalysisResult without guidance text or student visibility",
      "uses idempotency for safe replay and rejects conflicting persistence commands",
      "rejects missing ports, unsafe service principals, non-ready or rejected reviews, and unsafe policies",
      "rejects leaked input fields, unsafe port results, mismatched result refs, and missing evidence",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, missing port, unsafe principal, bad source, rejected review, unsafe policy, leak, unsafe port, result ref, and evidence tests",
    remediation: "Add regression coverage before using 0327 as reviewed result persistence evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-reviewed-result-persistence-bridge"]?.includes("student-app-ai-tutor-reviewed-result-persistence-bridge-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor reviewed result persistence bridge runtime audit",
        "studentAppAiTutorReviewedResultPersistenceBridge",
        "student-app-ai-tutor-reviewed-result-persistence-bridge.current.json",
        "student_app_ai_tutor_reviewed_result_persistence_bridge_runtime",
        "0327-student-app-ai-tutor-reviewed-result-persistence-bridge.md",
        "SDD 0327 student app ai tutor reviewed result persistence bridge",
        "11.17/10",
        "STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-reviewed-result-persistence-bridge",
      "studentAppAiTutorReviewedResultPersistenceBridge",
      "11.17/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, root trace, SDD, and architecture board track 0327",
    remediation: "Wire reviewed result persistence bridge evidence through every root project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_PORT,
      sourceRuntime: "student_app_ai_tutor_answer_review_gate_runtime",
      targetUseCase: "RecordTutoringAnalysisResult.Execute",
      status: "STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTED",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorReviewedResultPersistenceBridge: probe },
    safetyInvariants: {
      answerReviewGateRequired: true,
      approvedReviewRequired: true,
      existingRecordTutoringAnalysisResultUseCaseRequired: true,
      internalServiceOnly: true,
      resultPersistenceAllowed: true,
      resultPersistenceCommitted: probe.status === "PASS",
      tutoringResultRecorded: probe.status === "PASS",
      resultRefExposed: false,
      guidanceTextSentToPort: false,
      rawModelOutputExcluded: true,
      promptExcluded: true,
      answerKeyExcluded: true,
      contentRefExcluded: true,
      studentVisiblePublished: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      retrievalAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the reviewed AI Tutor result persistence bridge; student-visible delivery remains a separate reviewed slice."
      : "Fix 0327 reviewed result persistence evidence before claiming AI Tutor result persistence after review.",
  };
}

export function formatStudentAppAITutorReviewedResultPersistenceBridgeAudit(report) {
  const lines = [
    `Student App AI Tutor reviewed result persistence bridge runtime: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
    `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`,
    "",
    "Findings:",
  ];
  for (const finding of report.findings) lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: ${finding.actual}`);
  lines.push("", `Next: ${report.nextAction}`);
  return lines.join("\n");
}

function runRuntimeProbe(answerReviewGateReport, options) {
  const calls = [];
  return recordStudentAppAITutorReviewedResultPersistenceBridge(probeInput(answerReviewGateReport), {
    generatedAt: "2026-06-08T10:10:00.000Z",
    persistenceLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ai-tutor-reviewed-result-persistence-")), "bridge.jsonl"),
    studentAppAITutorResultPort: {
      async recordTutoringAnalysisResult(request) {
        calls.push(request);
        return {
          source: {
            targetUseCase: "RecordTutoringAnalysisResult.Execute",
            writeRepositoryOperation: "ArchiveRepository.RecordTutoringAnalysisResult",
          },
          result: {
            requestId: request.requestId,
            archiveItemId: request.archiveItemId,
            workerId: request.workerId,
            status: "SUCCEEDED",
            resultRef: request.resultRef,
            completedAt: "2026-06-08T10:10:00.000Z",
            studentVisiblePublished: false,
            guidanceTextStored: false,
          },
        };
      },
    },
  }).then((result) => ({
    status: "PASS",
    result,
    portCalls: calls.length,
    runtimeSlo: result.runtimeSlo,
  })).catch((error) => ({
    status: "FAIL",
    error: error.message,
    portCalls: calls.length,
    runtimeSlo: failedSlo(),
  }));
}

function probeInput(answerReviewGateReport) {
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-reviewed-result-persistence-bridge.v1",
    persistenceInvocationId: "ai_tutor_reviewed_result_persist_001",
    answerReviewGateReport,
    principal: {
      principalId: "svc_student_tutor_reviewed_result",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      sessionId: "svc_session_student_tutor_reviewed_result",
      scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT"],
    },
    resultPersistencePolicy: {
      answerReviewGateRequired: true,
      approvedReviewRequired: true,
      existingRecordTutoringAnalysisResultUseCaseRequired: true,
      injectedResultPortRequired: true,
      resultPersistenceAllowed: true,
      idempotentPersistenceRequired: true,
      targetUseCase: "RecordTutoringAnalysisResult.Execute",
      writeRepositoryOperation: "ArchiveRepository.RecordTutoringAnalysisResult",
      guidanceTextAllowed: false,
      rawModelOutputAllowed: false,
      promptAllowed: false,
      answerKeyAllowed: false,
      contentRefAllowed: false,
      retrievalAllowed: false,
      questionBankDraftCreationAllowed: false,
      studentVisiblePublishAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      "evidence:answer-review-gate:student-app-ai-tutor-answer-review-gate",
      "evidence:reviewed-result-persistence:record-tutoring-analysis-result",
    ],
    idempotencyKey: "student-app-ai-tutor-reviewed-result-persistence:ai_tutor_answer_review_gate_001",
  };
}

function loadCurrentInputs(root = process.cwd()) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, file]) => [key, readOptional(path.join(root, file))]));
}

function readOptional(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function includesAll(text, needles) {
  return needles.every((needle) => text.includes(needle));
}

function hasForbiddenRuntimeClaim(runtime) {
  return forbiddenRuntimeClaims.some((claim) => runtime.includes(claim));
}

function summarizePresence(text, needles) {
  return needles.map((needle) => `${needle}=${text.includes(needle)}`).join(";");
}

function addFinding(findings, finding) {
  findings.push({ severity: finding.passed ? "info" : "error", ...finding });
}

function failedSlo() {
  return { targetP99Ms: 50, p99Ms: 999, totalErrors: 1, operations: 0, evidenceClass: "JS_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_PROBE" };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outIndex = process.argv.indexOf("--out");
  const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : defaultOutPath;
  const report = await auditStudentAppAITutorReviewedResultPersistenceBridge(loadCurrentInputs());
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorReviewedResultPersistenceBridgeAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
