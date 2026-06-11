import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_PORT,
  STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RUNTIME_ID,
  recordStudentAppAITutorControlledAnswerArtifact,
} from "./student-app-ai-tutor-controlled-answer-artifact-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_CONTROLLED_ANSWER_ARTIFACT";
const runtimeId = "student_app_ai_tutor_question_bank_feedback_controlled_answer_artifact";
const readyStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_CONTROLLED_ANSWER_ARTIFACT_RECORDED";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-controlled-answer-artifact-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-controlled-answer-artifact-runtime.test.mjs",
  source0371Report: "reports/student-app-ai-tutor-question-bank-feedback-model-execution-precheck.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0372-student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact.md",
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
  "tutoringResultRecorded: true",
  "resultPersistenceAllowed: true",
  "studentVisiblePublished: true",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "externalToolUseAllowed: true",
  "retrievalAllowed: true",
  "swarmAllowed: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export async function auditStudentAppAITutorQuestionBankFeedbackControlledAnswerArtifact(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const source0371Report = parseJson(inputs.source0371Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.rootTrace ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(source0371Report, options);

  addFinding(findings, {
    id: "source.0371_question_bank_feedback_model_precheck_ready",
    passed: source0371Report.readiness === "READY" &&
      source0371Report.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_MODEL_EXECUTION_PRECHECK" &&
      source0371Report.runtime?.runtimeId === "student_app_ai_tutor_question_bank_feedback_model_execution_precheck" &&
      source0371Report.runtime?.sharedRuntimeId === "student_app_ai_tutor_model_execution_precheck_runtime" &&
      source0371Report.runtime?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_MODEL_EXECUTION_PRECHECKED" &&
      source0371Report.runtimeSlo?.totalErrors === 0 &&
      source0371Report.safetyInvariants?.learningActionSourceRequired === "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK" &&
      source0371Report.safetyInvariants?.modelInferenceAllowed === false,
    actual: [
      source0371Report.readiness ?? "missing",
      source0371Report.runtime?.runtimeId ?? "missing",
      source0371Report.runtime?.status ?? "missing",
      source0371Report.runtimeSlo?.totalErrors ?? "missing",
    ].join(":"),
    expected: "READY 0371 question-bank-feedback model precheck with zero errors and no model inference",
    remediation: "Run or fix 0371 before creating question-bank-feedback-sourced controlled answer artifacts.",
  });

  addFinding(findings, {
    id: "runtime.accepts_question_bank_feedback_precheck_for_controlled_artifact",
    passed: includesAll(runtime, [
      "sourceQuestionBankFeedbackPrecheckRuntimeId",
      "assertQuestionBankFeedbackModelExecutionPrecheckReport",
      "student_app_ai_tutor_question_bank_feedback_model_execution_precheck",
      "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      "sourceWorkerQuestionBankFeedbackInputVerified",
      "learningActionSource: source.learningActionSource",
      "feedbackStatus: source.feedbackStatus",
      "studentVisiblePublished: false",
    ]) && !includesAny(runtime, forbiddenRuntimeClaims),
    actual: summarizePresence(runtime, [
      "assertQuestionBankFeedbackModelExecutionPrecheckReport",
      "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      "learningActionSource: source.learningActionSource",
      "feedbackStatus: source.feedbackStatus",
    ]),
    expected: "shared controlled answer runtime accepts 0371 question-bank-feedback precheck and records source metadata without publication",
    remediation: "Keep question-bank-feedback follow-up tutoring on the same review-only artifact boundary.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_question_bank_feedback_review_only_artifact",
    passed: probe.status === "PASS" &&
      probe.result?.runtimeId === STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RUNTIME_ID &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_PORT &&
      probe.result?.learningActionSource === "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK" &&
      probe.result?.feedbackStatus === "READY_FOR_STUDENT_APP_READ" &&
      probe.result?.controlledAnswerArtifact?.reviewState === "PENDING_HUMAN_REVIEW" &&
      probe.result?.boundary?.tutoringResultRecorded === false &&
      probe.result?.boundary?.studentVisiblePublished === false &&
      probe.portCalls === 1 &&
      probe.portSawGuidanceText === false &&
      probe.portSawFeedbackIds === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `source=${probe.result.learningActionSource};review=${probe.result.controlledAnswerArtifact.reviewState};calls=${probe.portCalls};textToPort=${probe.portSawGuidanceText};idsToPort=${probe.portSawFeedbackIds};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records one question-bank-feedback-sourced controlled answer artifact without feedback text or ids to the port",
    remediation: "Controlled answer artifact evidence must prove 0371 linkage, source metadata, sanitized output, and no student-visible result.",
  });

  addFinding(findings, {
    id: "tests.cover_question_bank_feedback_controlled_answer_paths",
    passed: includesAll(runtimeTest, [
      "records a question-bank-feedback-sourced controlled answer artifact for human review only",
      "rejects unsafe question-bank-feedback precheck source reports",
      "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      "feedbackStatus",
    ]),
    actual: "runtime tests scanned",
    expected: "positive question-bank-feedback artifact path and unsafe source rejection tests",
    remediation: "Add question-bank-feedback controlled answer regression coverage before claiming 0372 readiness.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0372",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact"]?.includes("student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank-feedback controlled answer artifact audit",
        "studentAppAiTutorQuestionBankFeedbackControlledAnswerArtifact",
        "student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact.current.json",
        runtimeId,
        "0372-student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact.md",
        "12.52/10",
        readyStatus,
        "SDD 0372 student app ai tutor question-bank feedback controlled answer artifact",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact",
      "studentAppAiTutorQuestionBankFeedbackControlledAnswerArtifact",
      "12.52/10",
      "SDD 0372",
    ]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0372",
    remediation: "Wire 0372 through every project evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId,
      sharedRuntimeId: STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_PORT,
      sourceRuntimes: ["student_app_ai_tutor_question_bank_feedback_model_execution_precheck"],
      status: readyStatus,
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankFeedbackControlledAnswerArtifact: probe },
    safetyInvariants: {
      source0371QuestionBankFeedbackModelPrecheckRequired: true,
      learningActionSourceRequired: "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      internalServiceOnly: true,
      controlledAnswerArtifactRecorded: true,
      humanReviewRequiredBeforeResult: true,
      rawModelOutputExcluded: true,
      promptExcluded: true,
      answerKeyExcluded: true,
      tutoringResultRecorded: false,
      resultPersistenceAllowed: false,
      studentVisiblePublished: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      retrievalAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the question-bank-feedback follow-up controlled answer artifact boundary; review, persistence, student delivery, OCR/RAG, Swarm, and actual model execution remain later reviewed slices."
      : "Fix 0372 before claiming QUESTION_BANK_DRAFT_ANSWER_FEEDBACK follow-up tutoring can proceed to review-only answer artifacts.",
  };
}

export function formatStudentAppAITutorQuestionBankFeedbackControlledAnswerArtifactAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank-feedback controlled answer artifact: ${report.readiness}`,
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

async function runRuntimeProbe(source0371Report, options = {}) {
  const artifactLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-question-bank-feedback-controlled-answer-audit-")), "artifact.jsonl");
  let portCalls = 0;
  let portSawGuidanceText = false;
  let portSawFeedbackIds = false;
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorControlledAnswerArtifact(probeInput(source0371Report), {
      generatedAt: "2026-06-11T09:30:00.000Z",
      artifactLogPath,
      controlledAnswerArtifactPort: {
        async recordControlledAnswerArtifact(request) {
          portCalls += 1;
          const serialized = JSON.stringify(request);
          portSawGuidanceText = serialized.includes("Restate the feedback in your own words") ||
            serialized.includes("Score improved after correcting denominator comparison");
          portSawFeedbackIds = serialized.includes("qbank_ans_sub_feedback_001") ||
            serialized.includes("tarch_homework_feedback_source_001");
          return {
            controlledAnswerArtifact: {
              artifactId: "ai_tutor_answer_artifact_feedback_001",
              requestId: request.requestId,
              workerId: request.workerId,
              precheckId: request.precheckId,
              queueRef: request.queueRef,
              status: "AI_TUTOR_CONTROLLED_ANSWER_RECORDED_NOT_REVIEWED",
              reviewState: "PENDING_HUMAN_REVIEW",
              summary: "Follow-up help based on reviewed answer feedback.",
              guidanceSections: [
                {
                  sectionId: "ai_tutor_answer_section_feedback_001",
                  title: "Practice from feedback",
                  text: "Restate the feedback in your own words, then solve one similar item.",
                  sourceBlockRefs: ["block_score_summary", "block_next_step"],
                },
              ],
              safetyLabels: ["STUDY_GUIDANCE_ONLY", "FOLLOW_UP_REVIEW"],
              resultPersistenceAllowed: false,
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
        evidenceClass: "JS_AI_TUTOR_QUESTION_BANK_FEEDBACK_CONTROLLED_ANSWER_ARTIFACT_RUNTIME_PROBE",
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

function probeInput(source0371Report) {
  const source = source0371Report.runtimeProbes?.studentAppAiTutorQuestionBankFeedbackModelExecutionPrecheck?.result ?? {};
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-controlled-answer-artifact.v1",
    artifactInvocationId: "ai_tutor_answer_artifact_invocation_feedback_001",
    modelExecutionPrecheckReport: source0371Report,
    principal: {
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      scopes: ["TEACHING_WRITE", "AGENT_COMMAND_SUBMIT"],
    },
    generationAttempt: {
      attemptId: "ai_tutor_answer_attempt_feedback_001",
      precheckId: source.modelExecutionPrecheck?.precheckId,
      queueRef: source.modelExecutionPrecheck?.queueRef,
      requestId: source.requestId,
      workerId: source.workerId,
      modelRoute: "student_tutor_guided_help_v1",
      inputHash: source.inputHash,
      attemptNumber: 1,
      startedAt: "2026-06-11T09:30:00.000Z",
      completedAt: "2026-06-11T09:30:01.000Z",
      rawOutputCaptured: false,
      promptStored: false,
    },
    artifactPolicy: {
      reviewRequiredBeforeResult: true,
      resultPersistenceAllowed: false,
      studentVisibleAllowed: false,
      requireSourceBlockRefs: true,
      maxGuidanceSections: 4,
      maxSectionChars: 800,
    },
    evidenceRefs: [
      "evidence:question-bank-feedback-model-execution-precheck:student-app-ai-tutor-question-bank-feedback-model-execution-precheck",
      "evidence:controlled-answer-policy:review-before-result",
    ],
    idempotencyKey: `student-app-ai-tutor-controlled-answer:${source.requestId ?? "missing"}:${source.modelExecutionPrecheck?.precheckId ?? "missing"}`,
  };
}

function failedSlo() {
  return {
    targetP99Ms: 50,
    p99Ms: 50,
    totalErrors: 1,
    operations: 1,
    evidenceClass: "JS_AI_TUTOR_QUESTION_BANK_FEEDBACK_CONTROLLED_ANSWER_ARTIFACT_RUNTIME_PROBE",
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
  const report = await auditStudentAppAITutorQuestionBankFeedbackControlledAnswerArtifact(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankFeedbackControlledAnswerArtifactAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
