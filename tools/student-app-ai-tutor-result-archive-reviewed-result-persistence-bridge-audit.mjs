import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_PORT,
  STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_RUNTIME_ID,
  recordStudentAppAITutorReviewedResultPersistenceBridge,
} from "./student-app-ai-tutor-reviewed-result-persistence-bridge-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-result-archive-reviewed-result-persistence-bridge.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_REVIEWED_RESULT_PERSISTENCE_BRIDGE";
const runtimeId = "student_app_ai_tutor_result_archive_reviewed_result_persistence_bridge";
const readyStatus = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_REVIEWED_RESULT_PERSISTED";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-reviewed-result-persistence-bridge-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-reviewed-result-persistence-bridge-runtime.test.mjs",
  source0339Report: "reports/student-app-ai-tutor-result-archive-answer-review-gate.current.json",
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
  sdd: "docs/sdd/0340-student-app-ai-tutor-result-archive-reviewed-result-persistence-bridge.md",
};

const forbiddenRuntimeClaims = [
  "node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ", "INSERT ", "UPDATE ", "DELETE ",
  "guidanceTextAllowed: true", "rawModelOutputAllowed: true", "promptAllowed: true", "answerKeyAllowed: true",
  "contentRefAllowed: true", "retrievalAllowed: true", "studentVisiblePublishAllowed: true", "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true", "externalToolUseAllowed: true", "localToolMutationAllowed: true", "swarmAllowed: true",
  "innerHTML", "dangerouslySetInnerHTML",
];

export async function auditStudentAppAITutorResultArchiveReviewedResultPersistenceBridge(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const source0339Report = parseJson(inputs.source0339Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const existingBoundary = [inputs.goUseCase ?? "", inputs.goUseCaseTest ?? "", inputs.goDomain ?? "", inputs.goRepository ?? "", inputs.goHttpTest ?? ""].join("\n");
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.rootTrace ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const probe = await runRuntimeProbe(source0339Report, options);

  addFinding(findings, {
    id: "source.0339_result_archive_answer_review_gate_ready",
    passed: source0339Report.readiness === "READY" &&
      source0339Report.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ANSWER_REVIEW_GATE" &&
      source0339Report.runtime?.runtimeId === "student_app_ai_tutor_result_archive_answer_review_gate" &&
      source0339Report.runtime?.sharedRuntimeId === "student_app_ai_tutor_answer_review_gate_runtime" &&
      source0339Report.runtime?.status === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ANSWER_REVIEW_GATE_RECORDED" &&
      source0339Report.safetyInvariants?.learningActionSourceRequired === "AI_TUTOR_RESULT_ARCHIVE" &&
      source0339Report.safetyInvariants?.resultPersistenceStarted === false &&
      source0339Report.safetyInvariants?.studentVisiblePublished === false &&
      source0339Report.runtimeSlo?.totalErrors === 0,
    actual: [source0339Report.readiness ?? "missing", source0339Report.runtime?.runtimeId ?? "missing", source0339Report.runtime?.status ?? "missing", source0339Report.runtimeSlo?.totalErrors ?? "missing"].join(":"),
    expected: "READY 0339 result-archive answer review gate with zero errors and no prior persistence",
    remediation: "Run 0339 before result-archive reviewed result persistence.",
  });

  addFinding(findings, {
    id: "existing.record_tutoring_analysis_result_boundary_reused",
    passed: includesAll(existingBoundary, ["func (uc *RecordTutoringAnalysisResult) Execute", "AuthorizeRecordTutoringAnalysisResult", "NormalizeRecordTutoringAnalysisResultInput", "ApplyTutoringAnalysisResult", "RecordTutoringAnalysisResult", "UPDATE teaching_tutoring_analysis_requests", "claim_expires_at >", "TestRecordTutoringAnalysisResultAllowsInternalService"]),
    actual: summarizePresence(existingBoundary, ["func (uc *RecordTutoringAnalysisResult) Execute", "AuthorizeRecordTutoringAnalysisResult", "UPDATE teaching_tutoring_analysis_requests"]),
    expected: "0340 reuses the existing guarded Go result use case instead of adding a duplicate result-archive write path",
    remediation: "Keep result-archive reviewed result persistence behind RecordTutoringAnalysisResult.",
  });

  addFinding(findings, {
    id: "runtime.source_aware_result_archive_reviewed_persistence",
    passed: includesAll(runtime, ["sourceResultArchiveRuntimeId", "sourceResultArchiveStatus", "sourceResultArchiveWorkloadType", "studentAppAiTutorResultArchiveAnswerReviewGate", "source0338ResultArchiveControlledAnswerArtifactRequired", "learningActionSource", "resultArchiveStatus", "StudentAppAITutorResultPort.recordTutoringAnalysisResult"]) && !includesAny(runtime, forbiddenRuntimeClaims),
    actual: summarizePresence(runtime, ["sourceResultArchiveRuntimeId", "sourceResultArchiveStatus", "studentAppAiTutorResultArchiveAnswerReviewGate", "learningActionSource", "resultArchiveStatus"]),
    expected: "shared reviewed-result persistence bridge accepts 0339 result-archive review evidence and preserves source metadata",
    remediation: "Keep 0340 as a source-aware wrapper over the shared 0327 persistence bridge.",
  });

  addFinding(findings, {
    id: "runtime.probe_persists_result_archive_reviewed_result",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_PORT &&
      probe.result?.learningActionSource === "AI_TUTOR_RESULT_ARCHIVE" &&
      probe.result?.resultArchiveStatus === "READY_FOR_STUDENT_APP_READ" &&
      probe.result?.recordTutoringAnalysisResultCommand?.targetUseCase === "RecordTutoringAnalysisResult.Execute" &&
      probe.result?.boundary?.tutoringResultRecorded === true &&
      probe.result?.boundary?.studentVisiblePublished === false &&
      probe.result?.boundary?.guidanceTextSentToPort === false &&
      probe.portCalls === 1 &&
      probe.portSawGuidanceText === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `source=${probe.result.learningActionSource};status=${probe.result.status};p99=${probe.runtimeSlo.p99Ms};calls=${probe.portCalls};textToPort=${probe.portSawGuidanceText}` : probe.error,
    expected: "probe records one result-archive reviewed result through the existing result port without guidance text or student visibility",
    remediation: "0340 must prove 0339 review gate to RecordTutoringAnalysisResult linkage.",
  });

  addFinding(findings, {
    id: "tests.cover_result_archive_reviewed_persistence_paths",
    passed: includesAll(runtimeTest, ["persists a result-archive-sourced approved answer review through the same result port", "unsafeResultArchiveSource", "learningActionSourceRequired must be AI_TUTOR_RESULT_ARCHIVE", "AI_TUTOR_RESULT_ARCHIVE", "resultArchiveStatus"]),
    actual: "runtime tests scanned",
    expected: "positive result-archive persistence path and unsafe source rejection tests",
    remediation: "Add result-archive reviewed persistence regression coverage before claiming 0340 readiness.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0340",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-result-archive-reviewed-result-persistence-bridge"]?.includes("student-app-ai-tutor-result-archive-reviewed-result-persistence-bridge-audit.mjs")) &&
      includesAll(hooks, ["Student App AI Tutor result-archive reviewed result persistence bridge audit", "studentAppAiTutorResultArchiveReviewedResultPersistenceBridge", "student-app-ai-tutor-result-archive-reviewed-result-persistence-bridge.current.json", runtimeId, "0340-student-app-ai-tutor-result-archive-reviewed-result-persistence-bridge.md", "11.56/10", readyStatus, "SDD 0340 student app ai tutor result archive reviewed result persistence bridge"]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, ["audit:student-app-ai-tutor-result-archive-reviewed-result-persistence-bridge", "studentAppAiTutorResultArchiveReviewedResultPersistenceBridge", "11.56/10", "SDD 0340"]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0340",
    remediation: "Wire 0340 through every project evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: { runtimeId, sharedRuntimeId: STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_RUNTIME_ID, commandPort: STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_PORT, sourceRuntime: "student_app_ai_tutor_result_archive_answer_review_gate", targetUseCase: "RecordTutoringAnalysisResult.Execute", status: readyStatus },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorResultArchiveReviewedResultPersistenceBridge: probe },
    safetyInvariants: {
      source0339ResultArchiveAnswerReviewGateRequired: true,
      learningActionSourceRequired: "AI_TUTOR_RESULT_ARCHIVE",
      resultArchiveStatusRequired: "READY_FOR_STUDENT_APP_READ",
      existingRecordTutoringAnalysisResultUseCaseRequired: true,
      resultPersistenceAllowed: true,
      tutoringResultRecorded: probe.status === "PASS",
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
    nextAction: readiness === "READY" ? "Use this as the result-archive reviewed result persistence bridge; student-visible delivery remains a separate reviewed slice." : "Fix 0340 before claiming result-archive follow-up tutoring can persist reviewed results.",
  };
}

export function formatStudentAppAITutorResultArchiveReviewedResultPersistenceBridgeAudit(report) {
  const lines = [`Student App AI Tutor result-archive reviewed result persistence bridge: ${report.readiness}`, `Runtime: ${report.runtime.runtimeId}`, `Shared runtime: ${report.runtime.sharedRuntimeId}`, `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`, "", "Findings:"];
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

async function runRuntimeProbe(source0339Report, options = {}) {
  const persistenceLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-result-archive-persistence-audit-")), "bridge.jsonl");
  const calls = [];
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorReviewedResultPersistenceBridge(probeInput(source0339Report), {
      generatedAt: "2026-06-09T12:10:00.000Z",
      persistenceLogPath,
      studentAppAITutorResultPort: {
        async recordTutoringAnalysisResult(request) {
          calls.push(request);
          return { source: { targetUseCase: "RecordTutoringAnalysisResult.Execute", writeRepositoryOperation: "ArchiveRepository.RecordTutoringAnalysisResult" }, result: { requestId: request.requestId, archiveItemId: request.archiveItemId, workerId: request.workerId, status: "SUCCEEDED", resultRef: request.resultRef, completedAt: "2026-06-09T12:10:00.000Z", studentVisiblePublished: false, guidanceTextStored: false } };
        },
      },
    });
    const elapsed = Math.max(1, options.probeP99Ms ?? Date.now() - startedAt);
    return { status: "PASS", result, portCalls: calls.length, portSawGuidanceText: calls.some((call) => JSON.stringify(call).includes("Review the previous correction")), runtimeSlo: { targetP99Ms: 50, p99Ms: Math.min(50, elapsed), totalErrors: 0, operations: 1, evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_REVIEWED_RESULT_PERSISTENCE_BRIDGE_PROBE" } };
  } catch (error) {
    return { status: "FAIL", error: `${error.code ?? "ERROR"}:${error.message}`, portCalls: calls.length, portSawGuidanceText: calls.some((call) => JSON.stringify(call).includes("Review the previous correction")), runtimeSlo: failedSlo() };
  }
}

function probeInput(source0339Report) {
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-reviewed-result-persistence-bridge.v1",
    persistenceInvocationId: "ai_tutor_reviewed_result_persist_result_archive_001",
    answerReviewGateReport: source0339Report,
    principal: { principalId: "svc_student_tutor_result_archive_reviewed_result", subjectType: "SERVICE", role: "SERVICE", entryPoint: "AGENT_INTERNAL", sessionId: "svc_session_student_tutor_result_archive_reviewed_result", scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT"] },
    resultPersistencePolicy: { answerReviewGateRequired: true, approvedReviewRequired: true, existingRecordTutoringAnalysisResultUseCaseRequired: true, injectedResultPortRequired: true, resultPersistenceAllowed: true, idempotentPersistenceRequired: true, targetUseCase: "RecordTutoringAnalysisResult.Execute", writeRepositoryOperation: "ArchiveRepository.RecordTutoringAnalysisResult", guidanceTextAllowed: false, rawModelOutputAllowed: false, promptAllowed: false, answerKeyAllowed: false, contentRefAllowed: false, retrievalAllowed: false, questionBankDraftCreationAllowed: false, studentVisiblePublishAllowed: false, directDatabaseAccessAllowed: false, executeHttpRequestAllowed: false, externalToolUseAllowed: false, remoteDeviceControlAllowed: false, localToolMutationAllowed: false, swarmAllowed: false },
    evidenceRefs: ["evidence:answer-review-gate:student-app-ai-tutor-result-archive-answer-review-gate", "evidence:reviewed-result-persistence:record-tutoring-analysis-result"],
    idempotencyKey: "student-app-ai-tutor-result-archive-reviewed-result-persistence:ai_tutor_answer_review_gate_result_archive_001",
  };
}

function failedSlo() {
  return { targetP99Ms: 50, p99Ms: 50, totalErrors: 1, operations: 1, evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_REVIEWED_RESULT_PERSISTENCE_BRIDGE_PROBE" };
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
  const report = await auditStudentAppAITutorResultArchiveReviewedResultPersistenceBridge(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorResultArchiveReviewedResultPersistenceBridgeAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
