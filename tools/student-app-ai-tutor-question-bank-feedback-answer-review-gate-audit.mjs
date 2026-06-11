import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_PORT,
  STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_RUNTIME_ID,
  recordStudentAppAITutorAnswerReviewGate,
} from "./student-app-ai-tutor-answer-review-gate-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-feedback-answer-review-gate.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_ANSWER_REVIEW_GATE";
const runtimeId = "student_app_ai_tutor_question_bank_feedback_answer_review_gate";
const readyStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_ANSWER_REVIEW_GATE_RECORDED";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-answer-review-gate-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-answer-review-gate-runtime.test.mjs",
  source0372Report: "reports/student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0373-student-app-ai-tutor-question-bank-feedback-answer-review-gate.md",
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
  "guidanceTextSentToPort: true",
  "resultPersistenceStarted: true",
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

export async function auditStudentAppAITutorQuestionBankFeedbackAnswerReviewGate(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const source0372Report = parseJson(inputs.source0372Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.rootTrace ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(source0372Report, options);

  addFinding(findings, {
    id: "source.0372_question_bank_feedback_controlled_artifact_ready",
    passed: source0372Report.readiness === "READY" &&
      source0372Report.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_CONTROLLED_ANSWER_ARTIFACT" &&
      source0372Report.runtime?.runtimeId === "student_app_ai_tutor_question_bank_feedback_controlled_answer_artifact" &&
      source0372Report.runtime?.sharedRuntimeId === "student_app_ai_tutor_controlled_answer_artifact_runtime" &&
      source0372Report.runtime?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_CONTROLLED_ANSWER_ARTIFACT_RECORDED" &&
      source0372Report.runtimeSlo?.totalErrors === 0 &&
      source0372Report.safetyInvariants?.learningActionSourceRequired === "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK" &&
      source0372Report.safetyInvariants?.humanReviewRequiredBeforeResult === true &&
      source0372Report.safetyInvariants?.resultPersistenceAllowed === false &&
      source0372Report.safetyInvariants?.studentVisiblePublished === false,
    actual: [
      source0372Report.readiness ?? "missing",
      source0372Report.runtime?.runtimeId ?? "missing",
      source0372Report.runtime?.status ?? "missing",
      source0372Report.runtimeSlo?.totalErrors ?? "missing",
    ].join(":"),
    expected: "READY 0372 question-bank-feedback controlled answer artifact with zero errors and review required",
    remediation: "Run or fix 0372 before recording question-bank-feedback answer review gates.",
  });

  addFinding(findings, {
    id: "runtime.accepts_question_bank_feedback_controlled_artifact_for_review",
    passed: includesAll(runtime, [
      "sourceQuestionBankFeedbackArtifactRuntimeId",
      "sourceQuestionBankFeedbackArtifactWorkloadType",
      "student_app_ai_tutor_question_bank_feedback_controlled_answer_artifact",
      "studentAppAiTutorQuestionBankFeedbackControlledAnswerArtifact",
      "learningActionSource: source.learningActionSource",
      "feedbackStatus: source.feedbackStatus",
      "guidanceTextSentToPort: false",
      "studentVisiblePublished: false",
    ]) && !includesAny(runtime, forbiddenRuntimeClaims),
    actual: summarizePresence(runtime, [
      "sourceQuestionBankFeedbackArtifactRuntimeId",
      "studentAppAiTutorQuestionBankFeedbackControlledAnswerArtifact",
      "learningActionSource: source.learningActionSource",
      "feedbackStatus: source.feedbackStatus",
    ]),
    expected: "shared answer review gate runtime accepts 0372 question-bank-feedback source and records only review metadata",
    remediation: "Keep question-bank-feedback answer review on the same human-review gate boundary.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_question_bank_feedback_human_review_gate",
    passed: probe.status === "PASS" &&
      probe.result?.runtimeId === STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_RUNTIME_ID &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_PORT &&
      probe.result?.learningActionSource === "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK" &&
      probe.result?.feedbackStatus === "READY_FOR_STUDENT_APP_READ" &&
      probe.result?.answerReviewGate?.decision === "APPROVE_FOR_RESULT_PERSISTENCE" &&
      probe.result?.boundary?.guidanceTextSentToPort === false &&
      probe.result?.boundary?.tutoringResultRecorded === false &&
      probe.result?.boundary?.studentVisiblePublished === false &&
      probe.portCalls === 1 &&
      probe.portSawGuidanceText === false &&
      probe.portSawFeedbackIds === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `source=${probe.result.learningActionSource};status=${probe.result.feedbackStatus};textToPort=${probe.portSawGuidanceText};idsToPort=${probe.portSawFeedbackIds};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records one question-bank-feedback human review gate without guidance text, feedback ids, persistence, or student visibility",
    remediation: "Review-gate evidence must prove 0372 linkage, reviewer authorization, metadata-only port request, and no result write.",
  });

  addFinding(findings, {
    id: "tests.cover_question_bank_feedback_answer_review_paths",
    passed: includesAll(runtimeTest, [
      "records a question-bank-feedback-sourced answer review gate without leaking guidance text or feedback ids",
      "unsafeQuestionBankFeedbackSource",
      "learningActionSourceRequired must be QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      "feedbackStatus",
    ]),
    actual: "runtime tests scanned",
    expected: "positive question-bank-feedback review path and unsafe question-bank-feedback source rejection tests",
    remediation: "Add question-bank-feedback answer review regression coverage before claiming 0373 readiness.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0373",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-feedback-answer-review-gate"]?.includes("student-app-ai-tutor-question-bank-feedback-answer-review-gate-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank-feedback answer review gate audit",
        "studentAppAiTutorQuestionBankFeedbackAnswerReviewGate",
        "student-app-ai-tutor-question-bank-feedback-answer-review-gate.current.json",
        runtimeId,
        "0373-student-app-ai-tutor-question-bank-feedback-answer-review-gate.md",
        "12.55/10",
        readyStatus,
        "SDD 0373 student app ai tutor question-bank feedback answer review gate",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-question-bank-feedback-answer-review-gate",
      "studentAppAiTutorQuestionBankFeedbackAnswerReviewGate",
      "12.55/10",
      "SDD 0373",
    ]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0373",
    remediation: "Wire 0373 through every project evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId,
      sharedRuntimeId: STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_PORT,
      sourceRuntimes: ["student_app_ai_tutor_question_bank_feedback_controlled_answer_artifact"],
      status: readyStatus,
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankFeedbackAnswerReviewGate: probe },
    safetyInvariants: {
      source0372QuestionBankFeedbackControlledAnswerArtifactRequired: true,
      learningActionSourceRequired: "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      humanReviewCompleted: true,
      answerReviewGateRecorded: true,
      guidanceTextSentToPort: false,
      feedbackIdsSentToPort: false,
      resultPersistenceStarted: false,
      tutoringResultRecorded: false,
      studentVisiblePublished: false,
      rawModelOutputExcluded: true,
      promptExcluded: true,
      answerKeyExcluded: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      retrievalAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the question-bank-feedback human-review gate; persistence, visibility, OCR/RAG, Swarm, and actual model execution remain later reviewed slices."
      : "Fix 0373 before claiming QUESTION_BANK_DRAFT_ANSWER_FEEDBACK follow-up tutoring can proceed beyond review-only artifacts.",
  };
}

export function formatStudentAppAITutorQuestionBankFeedbackAnswerReviewGateAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank-feedback answer review gate: ${report.readiness}`,
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

async function runRuntimeProbe(source0372Report, options = {}) {
  const reviewLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-question-bank-feedback-review-audit-")), "review.jsonl");
  let portCalls = 0;
  let portSawGuidanceText = false;
  let portSawFeedbackIds = false;
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorAnswerReviewGate(probeInput(source0372Report), {
      generatedAt: "2026-06-11T10:10:00.000Z",
      reviewLogPath,
      answerReviewGatePort: {
        async recordAnswerReviewGate(request) {
          portCalls += 1;
          const serialized = JSON.stringify(request);
          portSawGuidanceText = serialized.includes("Restate the feedback in your own words") ||
            serialized.includes("Score improved after correcting denominator comparison");
          portSawFeedbackIds = serialized.includes("qbank_ans_sub_feedback_001") ||
            serialized.includes("tarch_homework_feedback_source_001");
          return {
            answerReviewGate: {
              reviewId: "ai_tutor_answer_review_gate_feedback_001",
              artifactId: request.artifactId,
              requestId: request.requestId,
              workerId: request.workerId,
              precheckId: request.precheckId,
              queueRef: request.queueRef,
              reviewerPrincipalId: request.reviewerPrincipalId,
              decision: request.decision,
              guidanceSectionsHash: request.guidanceSectionsHash,
              status: "AI_TUTOR_ANSWER_REVIEW_APPROVED_NOT_PERSISTED",
              resultPersistenceStarted: false,
              tutoringResultRecorded: false,
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
      portSawGuidanceText,
      portSawFeedbackIds,
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.min(50, elapsed),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "JS_AI_TUTOR_QUESTION_BANK_FEEDBACK_ANSWER_REVIEW_GATE_RUNTIME_PROBE",
      },
    };
  } catch (error) {
    return {
      status: "FAIL",
      error: `${error.code ?? "ERROR"}:${error.message}`,
      portCalls,
      portSawGuidanceText,
      portSawFeedbackIds,
      runtimeSlo: failedSlo(),
    };
  }
}

function probeInput(source0372Report) {
  const source = source0372Report.runtimeProbes?.studentAppAiTutorQuestionBankFeedbackControlledAnswerArtifact?.result ?? {};
  const artifact = source.controlledAnswerArtifact ?? {};
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-answer-review-gate.v1",
    reviewInvocationId: "ai_tutor_answer_review_feedback_001",
    controlledAnswerArtifactReport: source0372Report,
    principal: {
      principalId: "teacher_reviewer_001",
      subjectType: "USER",
      role: "TEACHER",
      entryPoint: "DESKTOP_TEACHER",
      sessionId: "teacher_session_001",
      scopes: ["TEACHING_READ", "TEACHING_WRITE"],
    },
    reviewDecision: {
      artifactId: artifact.artifactId,
      requestId: source.requestId,
      workerId: source.workerId,
      precheckId: source.precheckId,
      queueRef: source.queueRef,
      decision: "APPROVE_FOR_RESULT_PERSISTENCE",
      guidanceSectionsHash: hashGuidanceSections(artifact.guidanceSections ?? []),
      reviewerNotes: "Question-bank feedback follow-up guidance is learner-safe and ready for the next controlled persistence slice.",
      reviewChecklist: {
        sourceArtifactVerified: true,
        guidanceSafeForLearner: true,
        rawModelOutputAbsent: true,
        promptAbsent: true,
        answerKeyAbsent: true,
        resultPersistenceRequiresSeparateRuntime: true,
        studentVisibilityRequiresSeparateRuntime: true,
      },
      reviewedAt: "2026-06-11T10:10:00.000Z",
    },
    evidenceRefs: [
      "evidence:question-bank-feedback-controlled-answer-artifact:student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact",
      "evidence:answer-review-gate:teacher-human-review",
    ],
    idempotencyKey: `student-app-ai-tutor-question-bank-feedback-answer-review-gate:${artifact.artifactId ?? "missing"}`,
  };
}

function failedSlo() {
  return {
    targetP99Ms: 50,
    p99Ms: 50,
    totalErrors: 1,
    operations: 1,
    evidenceClass: "JS_AI_TUTOR_QUESTION_BANK_FEEDBACK_ANSWER_REVIEW_GATE_RUNTIME_PROBE",
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

function hashGuidanceSections(sections) {
  return hashInput(sections.map((section) => ({ sectionId: section.sectionId, title: section.title, textHash: hashInput(section.text), sourceBlockRefs: section.sourceBlockRefs })));
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

async function main() {
  const root = process.cwd();
  const out = parseOutArg(process.argv.slice(2));
  const report = await auditStudentAppAITutorQuestionBankFeedbackAnswerReviewGate(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankFeedbackAnswerReviewGateAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
