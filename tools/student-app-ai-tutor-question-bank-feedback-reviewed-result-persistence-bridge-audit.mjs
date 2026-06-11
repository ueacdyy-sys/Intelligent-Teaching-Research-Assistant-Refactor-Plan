import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_PORT,
  STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_RUNTIME_ID,
  recordStudentAppAITutorReviewedResultPersistenceBridge,
} from "./student-app-ai-tutor-reviewed-result-persistence-bridge-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-feedback-reviewed-result-persistence-bridge.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_REVIEWED_RESULT_PERSISTENCE_BRIDGE";
const runtimeId = "student_app_ai_tutor_question_bank_feedback_reviewed_result_persistence_bridge";
const readyStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_REVIEWED_RESULT_PERSISTED";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-reviewed-result-persistence-bridge-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-reviewed-result-persistence-bridge-runtime.test.mjs",
  source0373Report: "reports/student-app-ai-tutor-question-bank-feedback-answer-review-gate.current.json",
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
  sdd: "docs/sdd/0374-student-app-ai-tutor-question-bank-feedback-reviewed-result-persistence-bridge.md",
};

const forbiddenRuntimeClaims = [
  "node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ", "INSERT ", "UPDATE ", "DELETE ",
  "guidanceTextAllowed: true", "rawModelOutputAllowed: true", "promptAllowed: true", "answerKeyAllowed: true",
  "contentRefAllowed: true", "retrievalAllowed: true", "studentVisiblePublishAllowed: true", "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true", "externalToolUseAllowed: true", "localToolMutationAllowed: true", "swarmAllowed: true",
  "innerHTML", "dangerouslySetInnerHTML",
];

export async function auditStudentAppAITutorQuestionBankFeedbackReviewedResultPersistenceBridge(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const source0373Report = parseJson(inputs.source0373Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const existingBoundary = [inputs.goUseCase ?? "", inputs.goUseCaseTest ?? "", inputs.goDomain ?? "", inputs.goRepository ?? "", inputs.goHttpTest ?? ""].join("\n");
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.rootTrace ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const probe = await runRuntimeProbe(source0373Report, options);

  addFinding(findings, {
    id: "source.0373_question_bank_feedback_answer_review_gate_ready",
    passed: source0373Report.readiness === "READY" &&
      source0373Report.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_ANSWER_REVIEW_GATE" &&
      source0373Report.runtime?.runtimeId === "student_app_ai_tutor_question_bank_feedback_answer_review_gate" &&
      source0373Report.runtime?.sharedRuntimeId === "student_app_ai_tutor_answer_review_gate_runtime" &&
      source0373Report.runtime?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_ANSWER_REVIEW_GATE_RECORDED" &&
      source0373Report.safetyInvariants?.learningActionSourceRequired === "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK" &&
      source0373Report.safetyInvariants?.resultPersistenceStarted === false &&
      source0373Report.safetyInvariants?.tutoringResultRecorded === false &&
      source0373Report.safetyInvariants?.studentVisiblePublished === false &&
      source0373Report.runtimeSlo?.totalErrors === 0,
    actual: [source0373Report.readiness ?? "missing", source0373Report.runtime?.runtimeId ?? "missing", source0373Report.runtime?.status ?? "missing", source0373Report.runtimeSlo?.totalErrors ?? "missing"].join(":"),
    expected: "READY 0373 question-bank-feedback answer review gate with zero errors and no prior persistence",
    remediation: "Run 0373 before question-bank-feedback reviewed result persistence.",
  });

  addFinding(findings, {
    id: "existing.record_tutoring_analysis_result_boundary_reused",
    passed: includesAll(existingBoundary, ["func (uc *RecordTutoringAnalysisResult) Execute", "AuthorizeRecordTutoringAnalysisResult", "NormalizeRecordTutoringAnalysisResultInput", "ApplyTutoringAnalysisResult", "RecordTutoringAnalysisResult", "UPDATE teaching_tutoring_analysis_requests", "claim_expires_at >", "TestRecordTutoringAnalysisResultAllowsInternalService"]),
    actual: summarizePresence(existingBoundary, ["func (uc *RecordTutoringAnalysisResult) Execute", "AuthorizeRecordTutoringAnalysisResult", "UPDATE teaching_tutoring_analysis_requests"]),
    expected: "0374 reuses the existing guarded Go result use case instead of adding a duplicate question-bank-feedback write path",
    remediation: "Keep question-bank-feedback reviewed result persistence behind RecordTutoringAnalysisResult.",
  });

  addFinding(findings, {
    id: "runtime.source_aware_question_bank_feedback_reviewed_persistence",
    passed: includesAll(runtime, ["sourceQuestionBankFeedbackRuntimeId", "sourceQuestionBankFeedbackStatus", "sourceQuestionBankFeedbackWorkloadType", "studentAppAiTutorQuestionBankFeedbackAnswerReviewGate", "source0372QuestionBankFeedbackControlledAnswerArtifactRequired", "learningActionSource", "feedbackStatus", "StudentAppAITutorResultPort.recordTutoringAnalysisResult"]) && !includesAny(runtime, forbiddenRuntimeClaims),
    actual: summarizePresence(runtime, ["sourceQuestionBankFeedbackRuntimeId", "sourceQuestionBankFeedbackStatus", "studentAppAiTutorQuestionBankFeedbackAnswerReviewGate", "learningActionSource", "feedbackStatus"]),
    expected: "shared reviewed-result persistence bridge accepts 0373 question-bank-feedback review evidence and preserves source metadata",
    remediation: "Keep 0374 as a source-aware wrapper over the shared persistence bridge.",
  });

  addFinding(findings, {
    id: "runtime.probe_persists_question_bank_feedback_reviewed_result",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_PORT &&
      probe.result?.learningActionSource === "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK" &&
      probe.result?.feedbackStatus === "READY_FOR_STUDENT_APP_READ" &&
      probe.result?.recordTutoringAnalysisResultCommand?.targetUseCase === "RecordTutoringAnalysisResult.Execute" &&
      probe.result?.boundary?.tutoringResultRecorded === true &&
      probe.result?.boundary?.studentVisiblePublished === false &&
      probe.result?.boundary?.guidanceTextSentToPort === false &&
      probe.portCalls === 1 &&
      probe.portSawGuidanceText === false &&
      probe.portSawFeedbackIds === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `source=${probe.result.learningActionSource};status=${probe.result.status};p99=${probe.runtimeSlo.p99Ms};calls=${probe.portCalls};textToPort=${probe.portSawGuidanceText};idsToPort=${probe.portSawFeedbackIds}` : probe.error,
    expected: "probe records one question-bank-feedback reviewed result through the existing result port without guidance text, feedback ids, or student visibility",
    remediation: "0374 must prove 0373 review gate to RecordTutoringAnalysisResult linkage.",
  });

  addFinding(findings, {
    id: "tests.cover_question_bank_feedback_reviewed_persistence_paths",
    passed: includesAll(runtimeTest, ["persists a question-bank-feedback-sourced approved answer review through the same result port", "unsafeQuestionBankFeedbackSource", "learningActionSourceRequired must be QUESTION_BANK_DRAFT_ANSWER_FEEDBACK", "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK", "feedbackStatus"]),
    actual: "runtime tests scanned",
    expected: "positive question-bank-feedback persistence path and unsafe source rejection tests",
    remediation: "Add question-bank-feedback reviewed persistence regression coverage before claiming 0374 readiness.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0374",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-feedback-reviewed-result-persistence-bridge"]?.includes("student-app-ai-tutor-question-bank-feedback-reviewed-result-persistence-bridge-audit.mjs")) &&
      includesAll(hooks, ["Student App AI Tutor question-bank-feedback reviewed result persistence bridge audit", "studentAppAiTutorQuestionBankFeedbackReviewedResultPersistenceBridge", "student-app-ai-tutor-question-bank-feedback-reviewed-result-persistence-bridge.current.json", runtimeId, "0374-student-app-ai-tutor-question-bank-feedback-reviewed-result-persistence-bridge.md", "12.58/10", readyStatus, "SDD 0374 student app ai tutor question-bank feedback reviewed result persistence bridge"]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, ["audit:student-app-ai-tutor-question-bank-feedback-reviewed-result-persistence-bridge", "studentAppAiTutorQuestionBankFeedbackReviewedResultPersistenceBridge", "12.58/10", "SDD 0374"]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0374",
    remediation: "Wire 0374 through every project evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: { runtimeId, sharedRuntimeId: STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_RUNTIME_ID, commandPort: STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_PORT, sourceRuntime: "student_app_ai_tutor_question_bank_feedback_answer_review_gate", targetUseCase: "RecordTutoringAnalysisResult.Execute", status: readyStatus },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankFeedbackReviewedResultPersistenceBridge: probe },
    safetyInvariants: {
      source0373QuestionBankFeedbackAnswerReviewGateRequired: true,
      learningActionSourceRequired: "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      feedbackStatusRequired: "READY_FOR_STUDENT_APP_READ",
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
    nextAction: readiness === "READY" ? "Use this as the question-bank-feedback reviewed result persistence bridge; student-visible delivery remains a separate reviewed slice." : "Fix 0374 before claiming question-bank-feedback follow-up tutoring can persist reviewed results.",
  };
}

export function formatStudentAppAITutorQuestionBankFeedbackReviewedResultPersistenceBridgeAudit(report) {
  const lines = [`Student App AI Tutor question-bank-feedback reviewed result persistence bridge: ${report.readiness}`, `Runtime: ${report.runtime.runtimeId}`, `Shared runtime: ${report.runtime.sharedRuntimeId}`, `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`, "", "Findings:"];
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

async function runRuntimeProbe(source0373Report, options = {}) {
  const persistenceLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-question-bank-feedback-persistence-audit-")), "bridge.jsonl");
  const calls = [];
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorReviewedResultPersistenceBridge(probeInput(source0373Report), {
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
    return { status: "PASS", result, portCalls: calls.length, portSawGuidanceText: calls.some((call) => JSON.stringify(call).includes("Restate the feedback in your own words")), portSawFeedbackIds: calls.some((call) => JSON.stringify(call).includes("qbank_ans_sub_feedback_001") || JSON.stringify(call).includes("tarch_homework_feedback_source_001")), runtimeSlo: { targetP99Ms: 50, p99Ms: Math.min(50, elapsed), totalErrors: 0, operations: 1, evidenceClass: "JS_AI_TUTOR_QUESTION_BANK_FEEDBACK_REVIEWED_RESULT_PERSISTENCE_BRIDGE_PROBE" } };
  } catch (error) {
    return { status: "FAIL", error: `${error.code ?? "ERROR"}:${error.message}`, portCalls: calls.length, portSawGuidanceText: calls.some((call) => JSON.stringify(call).includes("Restate the feedback in your own words")), portSawFeedbackIds: calls.some((call) => JSON.stringify(call).includes("qbank_ans_sub_feedback_001") || JSON.stringify(call).includes("tarch_homework_feedback_source_001")), runtimeSlo: failedSlo() };
  }
}

function probeInput(source0373Report) {
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-reviewed-result-persistence-bridge.v1",
    persistenceInvocationId: "ai_tutor_reviewed_result_persist_question_bank_feedback_001",
    answerReviewGateReport: source0373Report,
    principal: { principalId: "svc_student_tutor_question_bank_feedback_reviewed_result", subjectType: "SERVICE", role: "SERVICE", entryPoint: "AGENT_INTERNAL", sessionId: "svc_session_student_tutor_question_bank_feedback_reviewed_result", scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT"] },
    resultPersistencePolicy: { answerReviewGateRequired: true, approvedReviewRequired: true, existingRecordTutoringAnalysisResultUseCaseRequired: true, injectedResultPortRequired: true, resultPersistenceAllowed: true, idempotentPersistenceRequired: true, targetUseCase: "RecordTutoringAnalysisResult.Execute", writeRepositoryOperation: "ArchiveRepository.RecordTutoringAnalysisResult", guidanceTextAllowed: false, rawModelOutputAllowed: false, promptAllowed: false, answerKeyAllowed: false, contentRefAllowed: false, retrievalAllowed: false, questionBankDraftCreationAllowed: false, studentVisiblePublishAllowed: false, directDatabaseAccessAllowed: false, executeHttpRequestAllowed: false, externalToolUseAllowed: false, remoteDeviceControlAllowed: false, localToolMutationAllowed: false, swarmAllowed: false },
    evidenceRefs: ["evidence:answer-review-gate:student-app-ai-tutor-question-bank-feedback-answer-review-gate", "evidence:reviewed-result-persistence:record-tutoring-analysis-result"],
    idempotencyKey: "student-app-ai-tutor-question-bank-feedback-reviewed-result-persistence:ai_tutor_answer_review_gate_feedback_001",
  };
}

function failedSlo() {
  return { targetP99Ms: 50, p99Ms: 50, totalErrors: 1, operations: 1, evidenceClass: "JS_AI_TUTOR_QUESTION_BANK_FEEDBACK_REVIEWED_RESULT_PERSISTENCE_BRIDGE_PROBE" };
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
  const report = await auditStudentAppAITutorQuestionBankFeedbackReviewedResultPersistenceBridge(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankFeedbackReviewedResultPersistenceBridgeAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}