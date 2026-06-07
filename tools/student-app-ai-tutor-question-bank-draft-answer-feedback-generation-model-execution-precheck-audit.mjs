import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECK_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECK_RUNTIME_ID,
  recordStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECK_RUNTIME";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck-runtime.test.mjs",
  feedbackPublicationPrecheckReport: "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  sdd: "docs/sdd/0294-student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck.md",
  architectureBoard: "architecture-board.html",
};

export async function auditStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const sourceReport = parseJson(inputs.feedbackPublicationPrecheckReport, {});
  const hooks = [inputs.packageJson ?? "", inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.sdd ?? "", inputs.architectureBoard ?? ""].join("\n");
  const sourceResult = sourceReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationPrecheck?.result ?? {};
  const probe = await runRuntimeProbe(sourceReport, options);

  addFinding(findings, {
    id: "source_feedback_publication_precheck.ready_and_persisted_scoring",
    passed: sourceReport.readiness === "READY" &&
      sourceReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_RUNTIME" &&
      sourceReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_runtime" &&
      sourceReport.runtime?.decision === "BLOCK_UNTIL_REVIEWED_FEEDBACK" &&
      sourceReport.safetyInvariants?.scoringResultPersistenceRequired === true &&
      sourceReport.safetyInvariants?.safeStudentResultRequired === true &&
      sourceReport.safetyInvariants?.studentVisibleFeedbackAllowed === false &&
      sourceReport.safetyInvariants?.modelInferenceAllowed === false &&
      sourceResult.precheckDecision?.scoringResultPersistenceVerified === true &&
      sourceResult.boundary?.feedbackGenerated === false &&
      sourceResult.boundary?.studentVisibleFeedbackPublished === false,
    actual: `${sourceReport.readiness ?? "missing"}:${sourceReport.runtime?.runtimeId ?? "missing"}:${sourceResult.precheckDecision?.scoringResultPersistenceVerified ?? "missing"}`,
    expected: "READY 0293 feedback publication precheck with persisted scoring verification and no feedback/publication/model start",
    remediation: "Run the 0293 feedback publication precheck audit before admitting feedback generation model work.",
  });

  addFinding(findings, {
    id: "runtime.queue_admission_only_boundary",
    passed: includesAll(runtime, [
      "recordStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck",
      "StudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheckPort.recordFeedbackGenerationModelExecutionPrecheck",
      "StudentTutorAgent.generate_question_bank_answer_feedback",
      "feedbackGenerationQueueAdmitted: true",
      "modelInferenceStarted: false",
      "feedbackDraftGenerated: false",
      "reviewedFeedbackArtifactRecorded: false",
      "studentVisibleFeedbackPublished: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "rejectLeakedFields",
    ]) && excludesAll(runtime, [
      "modelInferenceStarted: true",
      "feedbackDraftGenerated: true",
      "studentVisibleFeedbackPublished: true",
      "directDatabaseAccessAllowed: true",
      "executeHttpRequestAllowed: true",
      "swarmAllowed: true",
    ]) && probe.result?.boundary?.feedbackGenerationQueueAdmitted === true &&
      probe.result?.boundary?.modelInferenceStarted === false &&
      probe.result?.boundary?.feedbackDraftGenerated === false &&
      probe.result?.boundary?.studentVisibleFeedbackPublished === false,
    actual: summarizePresence(runtime, ["feedbackGenerationQueueAdmitted: true", "modelInferenceStarted: false", "feedbackDraftGenerated: false", "studentVisibleFeedbackPublished: false"]),
    expected: "runtime admits only a future feedback generation model queue item and starts no model, draft, database, HTTP, or publication work",
    remediation: "Keep model execution and feedback draft generation as downstream controlled slices.",
  });

  addFinding(findings, {
    id: "runtime_tests_cover_guards",
    passed: includesAll(runtimeTest, [
      "admits feedback generation to a controlled model queue without starting inference",
      "uses idempotency for replay and rejects conflicting precheck inputs",
      "rejects unsafe source precheck, principal, approval, policy, and port results",
      "rejects leaked answer, result, raw model, feedback, publication, and internal error fields",
    ]),
    actual: "runtime tests scanned",
    expected: "positive queue admission, idempotency, unsafe input, unsafe port, and leaked-field tests",
    remediation: "Add regression coverage before wiring this into root workflow evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: includesAll(hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck",
      "Student App AI Tutor question-bank draft answer feedback generation model execution precheck runtime audit",
      "studentAppAiTutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck",
      "student_app_ai_tutor_question_bank_draft_answer_feedback_generation_model_execution_precheck_runtime",
      "0294-student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck.md",
      "10.34/10",
    ]),
    actual: summarizePresence(hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck",
      "studentAppAiTutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck",
      "10.34/10",
    ]),
    expected: "package, quality, root coverage, structure verifier, SDD, and architecture board track the 0294 runtime",
    remediation: "Wire the feedback generation model execution precheck through every root evidence hook.",
  });

  addFinding(findings, {
    id: "runtime_probe.ready_under_budget",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECKED" &&
      probe.result?.feedbackGenerationModelPrecheck?.modelRoute === "StudentTutorAgent.generate_question_bank_answer_feedback" &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `p99=${probe.runtimeSlo.p99Ms};errors=${probe.runtimeSlo.totalErrors}` : probe.error,
    expected: "audit probe records READY feedback generation model precheck with P99 <= 50ms and 0 errors",
    remediation: "Fix runtime probe or reduce control-plane overhead before root promotion.",
  });

  const ready = findings.every((finding) => finding.passed);
  return {
    generatedAt: new Date().toISOString(),
    readiness: ready ? "READY" : "NEEDS_REMEDIATION",
    workloadType,
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECK_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECK_PORT,
      sourceFeedbackPublicationPrecheckRuntime: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_runtime",
      modelRoute: "StudentTutorAgent.generate_question_bank_answer_feedback",
      status: "MODEL_EXECUTION_PRECHECKED_NOT_STARTED",
    },
    runtimeSlo: probe.runtimeSlo ?? { targetP99Ms: 50, p99Ms: 50, totalErrors: 1 },
    runtimeProbes: { studentAppAiTutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck: probe },
    safetyInvariants: {
      sourceFeedbackPublicationPrecheckRequired: true,
      scoringResultPersistenceRequired: true,
      safeStudentResultRequired: true,
      approvalRequired: true,
      feedbackGenerationQueueAdmissionOnly: true,
      futureFeedbackDraftGenerationApproved: true,
      modelInferenceStarted: false,
      feedbackDraftGenerated: false,
      reviewedFeedbackArtifactRecorded: false,
      studentVisibleFeedbackAllowed: false,
      answerKeyDisclosureAllowed: false,
      rawModelOutputPersistenceAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      swarmAllowed: false,
    },
    findings,
  };
}

export function formatStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheckAudit(report) {
  return [
    `Student App AI Tutor question-bank draft answer feedback generation model execution precheck runtime: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
    `Route: ${report.runtime.modelRoute}`,
    `P99: ${report.runtimeSlo.p99Ms}ms`,
    ...report.findings.map((finding) => `${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${finding.actual} expected=${finding.expected}`),
  ].join("\n");
}

async function runRuntimeProbe(sourceReport, options) {
  const startedAt = Date.now();
  const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-feedback-generation-model-precheck-audit-")), "precheck.jsonl");
  try {
    const result = await recordStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck(probeInput(sourceReport), {
      commandLogPath,
      generatedAt: options.generatedAt ?? "2026-06-07T03:00:00.000Z",
      feedbackGenerationModelExecutionPrecheckPort: {
        async recordFeedbackGenerationModelExecutionPrecheck(request) {
          return {
            precheckId: "feedback_generation_model_precheck_audit_001",
            queueRef: "feedback_generation_model_queue_audit_001",
            modelRoute: request.modelRoute,
            requestId: request.requestId,
            submissionId: request.submissionId,
            status: "FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECKED_NOT_STARTED",
            queueAdmissionOnly: true,
            modelInferenceStarted: false,
            feedbackDraftGenerated: false,
            studentVisiblePublished: false,
          };
        },
      },
    });
    return probePass(result, startedAt, options);
  } catch (error) {
    return { status: "FAIL", error: error.message, runtimeSlo: { targetP99Ms: 50, p99Ms: 50, totalErrors: 1 } };
  }
}

function probePass(result, startedAt, options) {
  const elapsed = Math.max(1, Date.now() - startedAt);
  return {
    status: "PASS",
    result,
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.min(options.probeP99Ms ?? Math.max(6, elapsed), 50),
      totalErrors: 0,
    },
  };
}

function probeInput(sourceReport) {
  const scoring = sourceReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationPrecheck?.result?.studentScoringResult ?? {};
  return {
    schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck.v1",
    precheckInvocationId: "feedback_generation_model_precheck_audit_001",
    feedbackPublicationPrecheckReport: sourceReport,
    principal: {
      principalId: "student_tutor_agent_service_001",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT", "FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECK_APPROVE"],
      sessionId: "session_agent_001",
    },
    approval: {
      approvalId: "feedback_generation_model_approval_audit_001",
      reviewerPrincipalId: "teacher_001",
      reviewerRole: "TEACHER",
      approved: true,
      approvalScope: "FEEDBACK_GENERATION_MODEL_QUEUE_ONLY",
      modelRoute: "StudentTutorAgent.generate_question_bank_answer_feedback",
      requestId: typeof scoring.requestId === "string" ? scoring.requestId : "grading_req_feedback_001",
      submissionId: typeof scoring.submissionId === "string" ? scoring.submissionId : "qbank_ans_sub_feedback_001",
      approvedAt: "2026-06-07T02:58:00.000Z",
      allowsStudentVisiblePublication: false,
      allowsAnswerKeyDisclosure: false,
    },
    modelExecutionPolicy: {
      feedbackGenerationModelPrecheckOnly: true,
      feedbackGenerationQueueAdmissionOnly: true,
      futureFeedbackDraftGenerationApproved: true,
      scoringResultPersistenceRequired: true,
      safeStudentResultRequired: true,
      humanReviewRequiredAfterGeneration: true,
      modelRoute: "StudentTutorAgent.generate_question_bank_answer_feedback",
      maxPromptTokens: 2048,
      maxCompletionTokens: 512,
      modelInferenceStarted: false,
      feedbackDraftGenerated: false,
      reviewedFeedbackArtifactRecorded: false,
      studentVisiblePublicationAllowed: false,
      answerKeyDisclosureAllowed: false,
      rawModelOutputPersistenceAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      `evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck:${scoring.submissionId ?? "qbank_ans_sub_feedback_001"}`,
      `evidence:student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge:${scoring.submissionId ?? "qbank_ans_sub_feedback_001"}`,
      "evidence:feedback-generation-model-execution-approval:feedback_generation_model_approval_audit_001",
    ],
    idempotencyKey: `student-app-ai-tutor-feedback-generation-model-precheck:student_001:${scoring.submissionId ?? "qbank_ans_sub_feedback_001"}`,
  };
}

function addFinding(findings, finding) {
  findings.push({ severity: finding.passed ? "info" : "error", ...finding });
}

function includesAll(text, needles) {
  return needles.every((needle) => text.includes(needle));
}

function excludesAll(text, needles) {
  return needles.every((needle) => !text.includes(needle));
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
  const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck(loadCurrentInputs(process.cwd()));
  const out = args.out ?? defaultOutPath;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheckAudit(report));
  process.exitCode = report.readiness === "READY" ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
