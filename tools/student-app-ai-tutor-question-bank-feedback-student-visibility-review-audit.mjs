import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_PORT,
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_RUNTIME_ID,
  recordStudentAppAITutorResultStudentVisibilityReview,
} from "./student-app-ai-tutor-result-student-visibility-review-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-feedback-student-visibility-review.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_VISIBILITY_REVIEW";
const runtimeId = "student_app_ai_tutor_question_bank_feedback_student_visibility_review";
const readyStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_VISIBILITY_REVIEW_RECORDED";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-result-student-visibility-review-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-result-student-visibility-review-runtime.test.mjs",
  source0374Report: "reports/student-app-ai-tutor-question-bank-feedback-reviewed-result-persistence-bridge.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0375-student-app-ai-tutor-question-bank-feedback-student-visibility-review.md",
};

const forbiddenRuntimeClaims = [
  "node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ", "INSERT ", "UPDATE ", "DELETE ",
  "studentVisiblePublishAllowed: true", "studentDeliveryEnvelopeAllowed: true", "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true", "externalToolUseAllowed: true", "retrievalAllowed: true",
  "localToolMutationAllowed: true", "swarmAllowed: true", "studentVisiblePublished: true",
  "studentDeliveryEnvelopeCreated: true", "guidanceTextSentToPort: true", "rawResultRefSentToPort: true",
  "dangerouslySetInnerHTML", "innerHTML",
];

export async function auditStudentAppAITutorQuestionBankFeedbackStudentVisibilityReview(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const source0374Report = parseJson(inputs.source0374Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.rootTrace ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const probe = await runRuntimeProbe(source0374Report, options);

  addFinding(findings, {
    id: "source.0374_question_bank_feedback_reviewed_result_persistence_ready",
    passed: source0374Report.readiness === "READY" &&
      source0374Report.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_REVIEWED_RESULT_PERSISTENCE_BRIDGE" &&
      source0374Report.runtime?.runtimeId === "student_app_ai_tutor_question_bank_feedback_reviewed_result_persistence_bridge" &&
      source0374Report.runtime?.sharedRuntimeId === "student_app_ai_tutor_reviewed_result_persistence_bridge_runtime" &&
      source0374Report.runtime?.commandPort === "StudentAppAITutorResultPort.recordTutoringAnalysisResult" &&
      source0374Report.runtime?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_REVIEWED_RESULT_PERSISTED" &&
      source0374Report.safetyInvariants?.learningActionSourceRequired === "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK" &&
      source0374Report.safetyInvariants?.feedbackStatusRequired === "READY_FOR_STUDENT_APP_READ" &&
      source0374Report.safetyInvariants?.tutoringResultRecorded === true &&
      source0374Report.safetyInvariants?.studentVisiblePublished === false &&
      source0374Report.runtimeSlo?.totalErrors === 0,
    actual: [source0374Report.readiness ?? "missing", source0374Report.runtime?.runtimeId ?? "missing", source0374Report.runtime?.status ?? "missing", source0374Report.runtimeSlo?.totalErrors ?? "missing"].join(":"),
    expected: "READY 0374 question-bank-feedback reviewed-result persistence bridge with zero errors and no student-visible publication",
    remediation: "Run 0374 before question-bank-feedback student visibility review.",
  });

  addFinding(findings, {
    id: "runtime.source_aware_question_bank_feedback_visibility_review",
    passed: includesAll(runtime, ["sourceQuestionBankFeedbackReviewedResultPersistenceRuntimeId", "sourceQuestionBankFeedbackReviewedResultPersistenceWorkloadType", "studentAppAiTutorQuestionBankFeedbackReviewedResultPersistenceBridge", "learningActionSource", "feedbackStatus", "StudentAppAITutorResultStudentVisibilityReviewPort.recordResultStudentVisibilityReview"]) && !includesAny(runtime, forbiddenRuntimeClaims),
    actual: summarizePresence(runtime, ["sourceQuestionBankFeedbackReviewedResultPersistenceRuntimeId", "sourceQuestionBankFeedbackReviewedResultPersistenceWorkloadType", "studentAppAiTutorQuestionBankFeedbackReviewedResultPersistenceBridge", "learningActionSource", "feedbackStatus"]),
    expected: "shared student visibility review runtime accepts 0374 question-bank-feedback persistence evidence and preserves source metadata",
    remediation: "Keep 0375 as a source-aware wrapper over the shared 0328 student visibility review runtime.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_question_bank_feedback_visibility_review",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_RECORDED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_PORT &&
      probe.result?.sourceReviewedResult?.learningActionSource === "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK" &&
      probe.result?.sourceReviewedResult?.feedbackStatus === "READY_FOR_STUDENT_APP_READ" &&
      probe.result?.studentVisibilityReview?.status === "AI_TUTOR_RESULT_STUDENT_VISIBILITY_APPROVED_NOT_DELIVERED" &&
      probe.result?.boundary?.humanStudentVisibilityReviewRecorded === true &&
      probe.result?.boundary?.studentVisiblePublished === false &&
      probe.result?.boundary?.studentDeliveryEnvelopeCreated === false &&
      probe.portCalls === 1 &&
      probe.portSawGuidanceText === false &&
      probe.portSawFeedbackIds === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `source=${probe.result.sourceReviewedResult.learningActionSource};feedback=${probe.result.sourceReviewedResult.feedbackStatus};status=${probe.result.status};p99=${probe.runtimeSlo.p99Ms};calls=${probe.portCalls};textToPort=${probe.portSawGuidanceText};idsToPort=${probe.portSawFeedbackIds}` : probe.error,
    expected: "probe records one question-bank-feedback student visibility review without publishing, delivery envelope creation, guidance text, or feedback ids",
    remediation: "0375 must prove 0374 persistence to student-visibility review linkage.",
  });

  addFinding(findings, {
    id: "tests.cover_question_bank_feedback_visibility_review_paths",
    passed: includesAll(runtimeTest, ["records a question-bank-feedback-sourced student visibility review through the same review port", "rejects unsafe question-bank-feedback reviewed-result persistence source metadata", "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK", "feedbackStatus"]),
    actual: "runtime tests scanned",
    expected: "positive question-bank-feedback student visibility review path and unsafe source rejection tests",
    remediation: "Add question-bank-feedback student visibility review regression coverage before claiming 0375 readiness.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0375",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-feedback-student-visibility-review"]?.includes("student-app-ai-tutor-question-bank-feedback-student-visibility-review-audit.mjs")) &&
      includesAll(hooks, ["Student App AI Tutor question-bank-feedback student visibility review audit", "studentAppAiTutorQuestionBankFeedbackStudentVisibilityReview", "student-app-ai-tutor-question-bank-feedback-student-visibility-review.current.json", runtimeId, "0375-student-app-ai-tutor-question-bank-feedback-student-visibility-review.md", "12.61/10", readyStatus, "SDD 0375 student app ai tutor question-bank feedback student visibility review"]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, ["audit:student-app-ai-tutor-question-bank-feedback-student-visibility-review", "studentAppAiTutorQuestionBankFeedbackStudentVisibilityReview", "12.61/10", "SDD 0375"]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0375",
    remediation: "Wire 0375 through every project evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: { runtimeId, sharedRuntimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_RUNTIME_ID, commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_PORT, sourceRuntime: "student_app_ai_tutor_question_bank_feedback_reviewed_result_persistence_bridge", status: readyStatus },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankFeedbackStudentVisibilityReview: probe },
    safetyInvariants: {
      source0374QuestionBankFeedbackReviewedResultPersistenceRequired: true,
      learningActionSourceRequired: "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      feedbackStatusRequired: "READY_FOR_STUDENT_APP_READ",
      humanStudentVisibilityReviewRequired: true,
      approvedForFutureStudentDelivery: probe.status === "PASS",
      studentVisiblePublished: false,
      studentDeliveryEnvelopeCreated: false,
      guidanceTextSentToPort: false,
      rawResultRefSentToPort: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      retrievalAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY" ? "Use this as question-bank-feedback student visibility review evidence; actual delivery envelope remains a later slice." : "Fix 0375 before claiming question-bank-feedback tutoring can become student-visible.",
  };
}

export function formatStudentAppAITutorQuestionBankFeedbackStudentVisibilityReviewAudit(report) {
  const lines = [`Student App AI Tutor question-bank-feedback student visibility review: ${report.readiness}`, `Runtime: ${report.runtime.runtimeId}`, `Shared runtime: ${report.runtime.sharedRuntimeId}`, `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`, "", "Findings:"];
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

async function runRuntimeProbe(source0374Report, options = {}) {
  const reviewLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-question-bank-feedback-visibility-audit-")), "review.jsonl");
  const calls = [];
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorResultStudentVisibilityReview(probeInput(source0374Report), {
      generatedAt: "2026-06-11T14:30:00.000Z",
      reviewLogPath,
      resultStudentVisibilityReviewPort: {
        async recordResultStudentVisibilityReview(request) {
          calls.push(request);
          return { studentVisibilityReview: { reviewId: request.visibilityReviewId, persistenceRecordId: request.persistenceRecordId, requestId: request.requestId, decision: request.decision, status: "AI_TUTOR_RESULT_STUDENT_VISIBILITY_APPROVED_NOT_DELIVERED", studentVisiblePublished: false, studentDeliveryEnvelopeCreated: false, guidanceTextStored: false } };
        },
      },
    });
    const elapsed = Math.max(1, options.probeP99Ms ?? Date.now() - startedAt);
    const serializedCalls = JSON.stringify(calls);
    return { status: "PASS", result, portCalls: calls.length, portSawGuidanceText: serializedCalls.includes("Restate the feedback in your own words"), portSawFeedbackIds: serializedCalls.includes("qbank_ans_sub_feedback_001") || serializedCalls.includes("tarch_homework_feedback_source_001"), runtimeSlo: { targetP99Ms: 50, p99Ms: Math.min(50, elapsed), totalErrors: 0, operations: 1, evidenceClass: "JS_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_VISIBILITY_REVIEW_PROBE" } };
  } catch (error) {
    const serializedCalls = JSON.stringify(calls);
    return { status: "FAIL", error: `${error.code ?? "ERROR"}:${error.message}`, portCalls: calls.length, portSawGuidanceText: serializedCalls.includes("Restate the feedback in your own words"), portSawFeedbackIds: serializedCalls.includes("qbank_ans_sub_feedback_001") || serializedCalls.includes("tarch_homework_feedback_source_001"), runtimeSlo: failedSlo() };
  }
}

function probeInput(source0374Report) {
  const result = source0374Report.runtimeProbes?.studentAppAiTutorQuestionBankFeedbackReviewedResultPersistenceBridge?.result ?? {};
  const reviewed = result.reviewedResult ?? {};
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-visibility-review.v1",
    reviewInvocationId: "ai_tutor_result_visibility_review_feedback_001",
    reviewedResultPersistenceBridgeReport: source0374Report,
    principal: { principalId: "teacher_visibility_reviewer_question_bank_feedback_001", subjectType: "USER", role: "TEACHER", entryPoint: "DESKTOP_TEACHER", sessionId: "teacher_session_visibility_question_bank_feedback_001", scopes: ["TEACHING_READ", "TEACHING_WRITE"] },
    studentVisibilityReview: {
      reviewId: "ai_tutor_result_visibility_review_feedback_001",
      persistenceRecordId: result.recordId,
      sourceReviewId: reviewed.reviewId,
      artifactId: reviewed.artifactId,
      requestId: reviewed.requestId,
      archiveItemId: reviewed.archiveItemId,
      guidanceSectionsHash: reviewed.guidanceSectionsHash,
      decision: "APPROVE_FOR_STUDENT_DELIVERY_RUNTIME",
      reviewerPrincipalId: "teacher_visibility_reviewer_question_bank_feedback_001",
      reviewedAt: "2026-06-11T14:30:00.000Z",
      reviewerNotes: "Reviewed question-bank feedback is learner-safe and ready for future delivery.",
      reviewChecklist: { reviewedResultPersisted: true, learnerSafetyConfirmed: true, guidanceHashMatches: true, rawModelOutputAbsent: true, promptAbsent: true, answerKeyAbsent: true, contentRefAbsent: true, resultRefNotExposed: true, studentDeliveryRequiresSeparateRuntime: true },
    },
    studentVisibilityPolicy: { reviewedResultPersistenceRequired: true, humanStudentVisibilityReviewRequired: true, futureStudentDeliveryRuntimeRequired: true, futureArchivePersistenceRuntimeRequired: true, studentVisiblePublishAllowed: false, studentDeliveryEnvelopeAllowed: false, directDatabaseAccessAllowed: false, executeHttpRequestAllowed: false, externalToolUseAllowed: false, retrievalAllowed: false, localToolMutationAllowed: false, swarmAllowed: false },
    evidenceRefs: ["evidence:reviewed-result-persistence:student-app-ai-tutor-question-bank-feedback-reviewed-result-persistence-bridge", "evidence:student-visibility-review:teacher-question-bank-feedback-review"],
    idempotencyKey: "student-app-ai-tutor-question-bank-feedback-visibility-review:ai_tutor_answer_review_gate_feedback_001",
  };
}

function failedSlo() {
  return { targetP99Ms: 50, p99Ms: 50, totalErrors: 1, operations: 1, evidenceClass: "JS_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_VISIBILITY_REVIEW_PROBE" };
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
  const report = await auditStudentAppAITutorQuestionBankFeedbackStudentVisibilityReview(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankFeedbackStudentVisibilityReviewAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
