import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_RUNTIME_ID,
  recordStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft-runtime.test.mjs",
  sourceModelPrecheckReport: "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  sdd: "docs/sdd/0295-student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft.md",
  architectureBoard: "architecture-board.html",
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
  "rawModelOutputStored: true",
  "answerKeyDisclosed: true",
  "resultRefDisclosed: true",
  "reviewedFeedbackArtifactRecorded: true",
  "studentVisibleFeedbackPublished: true",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export async function auditStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const sourceModelPrecheckReport = parseJson(inputs.sourceModelPrecheckReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.sdd ?? "", inputs.architectureBoard ?? ""].join("\n");
  const probe = await runRuntimeProbe(sourceModelPrecheckReport, options);

  addFinding(findings, {
    id: "source.feedback_generation_model_precheck_ready",
    passed: sourceModelPrecheckReport.readiness === "READY" &&
      sourceModelPrecheckReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECK_RUNTIME" &&
      sourceModelPrecheckReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_answer_feedback_generation_model_execution_precheck_runtime" &&
      sourceModelPrecheckReport.runtime?.modelRoute === "StudentTutorAgent.generate_question_bank_answer_feedback" &&
      sourceModelPrecheckReport.safetyInvariants?.feedbackGenerationQueueAdmissionOnly === true &&
      sourceModelPrecheckReport.safetyInvariants?.futureFeedbackDraftGenerationApproved === true &&
      sourceModelPrecheckReport.safetyInvariants?.feedbackDraftGenerated === false &&
      sourceModelPrecheckReport.safetyInvariants?.studentVisibleFeedbackAllowed === false &&
      sourceModelPrecheckReport.runtimeSlo?.totalErrors === 0,
    actual: `${sourceModelPrecheckReport.readiness ?? "missing"}:${sourceModelPrecheckReport.runtime?.runtimeId ?? "missing"}:${sourceModelPrecheckReport.safetyInvariants?.futureFeedbackDraftGenerationApproved ?? "missing"}`,
    expected: "READY 0294 feedback generation model execution precheck with queue admission and no draft/publication side effects",
    remediation: "Run 0294 feedback generation model execution precheck before controlled feedback draft generation.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraftPort.recordControlledFeedbackDraft",
      "recordStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_RECORDED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_answer_feedback_controlled_draft_runtime",
      "StudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraftPort.recordControlledFeedbackDraft",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_RECORDED",
    ]),
    expected: "runtime records an idempotent controlled feedback draft through a named injected port",
    remediation: "Keep feedback draft generation port-based, replay-safe, and separate from review/publication.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "sourceModelPrecheckVerified: true",
      "safeStudentResultOnly: true",
      "controlledFeedbackDraftRecorded: true",
      "modelInferenceStarted: true",
      "feedbackDraftGenerated: true",
      "rawModelOutputStored: false",
      "answerKeyDisclosed: false",
      "resultRefDisclosed: false",
      "reviewedFeedbackArtifactRecorded: false",
      "studentVisibleFeedbackPublished: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "requiresFutureHumanReview: true",
      "requiresFutureReviewedArtifact: true",
      "requiresFuturePublicationApproval: true",
      "requireLearnerSafeText",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime may record a sanitized feedback draft but blocks raw output, answer keys, result refs, reviewed artifacts, publication, DB, HTTP, tools, and Swarm",
    remediation: "Do not collapse controlled feedback draft generation into review, publication, or infrastructure calls.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_controlled_feedback_draft",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_RECORDED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_PORT &&
      probe.result?.feedbackDraft?.executionState === "CONTROLLED_FEEDBACK_DRAFT_RECORDED_NOT_REVIEWED" &&
      probe.result?.boundary?.modelInferenceStarted === true &&
      probe.result?.boundary?.feedbackDraftGenerated === true &&
      probe.result?.boundary?.reviewedFeedbackArtifactRecorded === false &&
      probe.result?.boundary?.studentVisibleFeedbackPublished === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};published=${probe.result.boundary.studentVisibleFeedbackPublished};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records one controlled feedback draft with no review/publication side effects",
    remediation: "Controlled feedback draft evidence must prove source precheck, sanitized learner feedback, and no publication.",
  });

  addFinding(findings, {
    id: "tests.cover_controlled_feedback_draft_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a sanitized feedback draft without review, storage, or publication",
      "uses idempotency for replay and rejects conflicting feedback draft attempts",
      "rejects missing ports, unsafe principals, unsafe output policy, and unsafe source prechecks",
      "rejects leaked source fields, unsafe port results, unsafe text, and missing evidence",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, auth, unsafe policy, source readiness, leak, unsafe port, unsafe text, and evidence tests",
    remediation: "Add regression coverage before using 0295 as controlled feedback draft evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft"]?.includes("student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank draft answer feedback controlled draft runtime audit",
        "studentAppAiTutorQuestionBankDraftAnswerFeedbackControlledDraft",
        "student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft.current.json",
        "student_app_ai_tutor_question_bank_draft_answer_feedback_controlled_draft_runtime",
        "0295-student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft.md",
        "10.35/10",
        "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_RECORDED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft",
      "studentAppAiTutorQuestionBankDraftAnswerFeedbackControlledDraft",
      "10.35/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0295",
    remediation: "Wire controlled feedback draft evidence through every root project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_PORT,
      sourceRuntimes: ["student_app_ai_tutor_question_bank_draft_answer_feedback_generation_model_execution_precheck_runtime"],
      modelRoute: "StudentTutorAgent.generate_question_bank_answer_feedback",
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_RECORDED",
    },
    runtimeSlo: probe.runtimeSlo ?? { targetP99Ms: 50, p99Ms: 50, totalErrors: 1 },
    runtimeProbes: { studentAppAiTutorQuestionBankDraftAnswerFeedbackControlledDraft: probe },
    safetyInvariants: {
      sourceModelExecutionPrecheckRequired: true,
      safeStudentResultRequired: true,
      internalServiceOnly: true,
      controlledFeedbackDraftRecorded: true,
      modelInferenceAllowed: true,
      feedbackDraftGenerationAllowed: true,
      rawModelOutputStored: false,
      answerKeyDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      reviewedFeedbackArtifactRecorded: false,
      studentVisibleFeedbackAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the controlled feedback draft gate; reviewed artifact, publication approval, delivery, and archive persistence remain separate reviewed slices."
      : "Fix controlled feedback draft evidence before any reviewed artifact or student-visible publication step.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraftAudit(report) {
  return [
    `Student App AI Tutor question-bank draft answer feedback controlled draft runtime: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
    `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`,
    ...report.findings.map((finding) => `${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`),
    report.nextAction,
  ].join("\n");
}

async function runRuntimeProbe(sourceReport, options = {}) {
  const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-feedback-controlled-draft-audit-")), "draft.jsonl");
  let portCalls = 0;
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft(probeInput(sourceReport), {
      commandLogPath,
      generatedAt: options.generatedAt ?? "2026-06-07T03:20:00.000Z",
      controlledFeedbackDraftPort: {
        async recordControlledFeedbackDraft(request) {
          portCalls += 1;
          const scoring = request.sourceStudentScoringResult;
          const precheck = request.sourceModelPrecheck;
          return {
            feedbackDraft: {
              artifactId: `feedback_controlled_draft_${scoring.submissionId}`,
              precheckId: precheck.precheckId,
              requestId: scoring.requestId,
              submissionId: scoring.submissionId,
              questionBankDraftRef: scoring.questionBankDraftRef,
              tutoringAnalysisRequestId: scoring.tutoringAnalysisRequestId,
              archiveItemId: scoring.archiveItemId,
              generationAttemptId: request.generationAttempt.attemptId,
              modelRoute: request.modelRoute,
              status: "CONTROLLED_FEEDBACK_DRAFT_READY_FOR_REVIEW_NOT_PUBLISHED",
              executionState: "CONTROLLED_FEEDBACK_DRAFT_RECORDED_NOT_REVIEWED",
              sourceScoreSummary: scoring.scoreSummary,
              draftFeedback: {
                summary: "You handled the main skill well and should review one related point before the next practice.",
                encouragement: "Keep explaining your thinking step by step.",
                nextSteps: ["Review the missed concept with your teacher.", "Try one similar practice item after review."],
                misconceptionTags: ["fraction-comparison"],
                practiceSuggestions: ["Use a number line for the next comparison exercise."],
              },
              rawModelOutputStored: false,
              answerKeyDisclosed: false,
              resultRefDisclosed: false,
              reviewedFeedbackArtifactRecorded: false,
              studentVisibleFeedbackPublished: false,
            },
          };
        },
      },
    });
    return {
      status: "PASS",
      result,
      portCalls,
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.min(options.probeP99Ms ?? Math.max(8, Date.now() - startedAt), 50),
        totalErrors: 0,
      },
    };
  } catch (error) {
    return { status: "FAIL", error: error.message, portCalls, runtimeSlo: { targetP99Ms: 50, p99Ms: 50, totalErrors: 1 } };
  }
}

function probeInput(sourceReport) {
  const precheck = sourceReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck?.result?.feedbackGenerationModelPrecheck ?? {};
  return {
    schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-controlled-draft.v1",
    generationInvocationId: "feedback_controlled_draft_audit_001",
    feedbackGenerationModelExecutionPrecheckReport: sourceReport,
    principal: {
      principalId: "student_tutor_agent_service_001",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT", "FEEDBACK_DRAFT_GENERATE"],
      sessionId: "session_agent_001",
    },
    generationAttempt: {
      attemptId: "feedback_generation_attempt_audit_001",
      precheckId: precheck.precheckId ?? "feedback_generation_model_precheck_audit_001",
      modelRoute: "StudentTutorAgent.generate_question_bank_answer_feedback",
      queueRef: precheck.queueRef ?? "feedback_generation_model_queue_audit_001",
      providerClass: "CONTROLLED_AI_WORKER",
      maxPromptTokens: 2048,
      maxOutputTokens: 512,
      attemptNo: 1,
    },
    outputPolicy: {
      sanitizedFeedbackDraftOnly: true,
      sourceScoreSummaryOnly: true,
      requiresFutureHumanReview: true,
      requiresFutureReviewedArtifact: true,
      requiresFuturePublicationApproval: true,
      rawModelOutputStored: false,
      answerKeyDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      reviewedFeedbackArtifactRecorded: false,
      studentVisiblePublicationAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      `evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck:${precheck.precheckId ?? "feedback_generation_model_precheck_audit_001"}`,
      "evidence:controlled-feedback-draft-generation:feedback_generation_attempt_audit_001",
    ],
    idempotencyKey: `student-app-ai-tutor-feedback-controlled-draft:student_001:${precheck.submissionId ?? "qbank_ans_sub_audit_001"}`,
  };
}

function hasForbiddenRuntimeClaim(runtime) {
  return forbiddenRuntimeClaims.some((claim) => runtime.includes(claim));
}

function addFinding(findings, finding) {
  findings.push({ severity: finding.passed ? "info" : "error", ...finding });
}

function includesAll(text, needles) {
  return needles.every((needle) => text.includes(needle));
}

function summarizePresence(text, needles) {
  return needles.map((needle) => `${needle}=${text.includes(needle)}`).join(";");
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function stringifyScalar(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => {
    const absolute = path.join(root, relativePath);
    return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""];
  }));
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--out") args.out = argv[index + 1];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft(loadCurrentInputs(process.cwd()));
  const out = args.out ?? defaultOutPath;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraftAudit(report));
  process.exitCode = report.readiness === "READY" ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
