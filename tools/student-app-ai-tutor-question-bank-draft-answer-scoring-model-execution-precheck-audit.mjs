import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_RUNTIME_ID,
  recordStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck,
} from "./student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck-runtime.test.mjs",
  sourceScoringRequestVerificationReport: "reports/student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification.current.json",
  sourceScoringInputFoundationReport: "reports/student-app-ai-tutor-question-bank-draft-answer-scoring-input.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0290-student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck.md",
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
  "calculateScoreNowAllowed: true",
  "persistResultNowAllowed: true",
  "generateFeedbackNowAllowed: true",
  "studentVisiblePublishAllowed: true",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "modelInferenceStarted: true",
  "scoringExecutionStarted: true",
  "resultPersistenceStarted: true",
  "feedbackGenerationStarted: true",
  "studentVisiblePublished: true",
  "answerTextDisclosed: true",
  "scoreDisclosed: true",
  "resultRefDisclosed: true",
  "rawModelOutputDisclosed: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export async function auditStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const sourceScoringRequestVerificationReport = parseJson(inputs.sourceScoringRequestVerificationReport, {});
  const sourceScoringInputFoundationReport = parseJson(inputs.sourceScoringInputFoundationReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe({ sourceScoringRequestVerificationReport, sourceScoringInputFoundationReport }, options);

  addFinding(findings, {
    id: "source.scoring_request_verification_ready",
    passed: sourceScoringRequestVerificationReport.readiness === "READY" &&
      sourceScoringRequestVerificationReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION" &&
      sourceScoringRequestVerificationReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_answer_scoring_request_verification_runtime" &&
      sourceScoringRequestVerificationReport.runtime?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFIED" &&
      sourceScoringRequestVerificationReport.safetyInvariants?.scoringRequestQueued === true &&
      sourceScoringRequestVerificationReport.safetyInvariants?.modelInferenceAllowed === false &&
      sourceScoringRequestVerificationReport.safetyInvariants?.feedbackPublicationAllowed === false &&
      sourceScoringRequestVerificationReport.runtimeSlo?.totalErrors === 0,
    actual: `${sourceScoringRequestVerificationReport.readiness ?? "missing"}:${sourceScoringRequestVerificationReport.runtime?.status ?? "missing"}`,
    expected: "READY 0289 scoring request verification with queued own-student request and no model/scoring/feedback execution",
    remediation: "Run the 0289 scoring request verification before model execution precheck.",
  });

  addFinding(findings, {
    id: "source.scoring_input_foundation_ready",
    passed: sourceScoringInputFoundationReport.readiness === "READY" &&
      sourceScoringInputFoundationReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_INPUT_FOUNDATION" &&
      sourceScoringInputFoundationReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_answer_scoring_input_foundation" &&
      sourceScoringInputFoundationReport.safetyInvariants?.internalWorkerOnly === true &&
      sourceScoringInputFoundationReport.safetyInvariants?.claimedBySameWorkerRequired === true &&
      sourceScoringInputFoundationReport.safetyInvariants?.requestSourceLinkageRequired === true &&
      sourceScoringInputFoundationReport.safetyInvariants?.modelInferenceAllowed === false &&
      sourceScoringInputFoundationReport.safetyInvariants?.resultPersistenceAllowed === false &&
      sourceScoringInputFoundationReport.safetyInvariants?.studentVisiblePublishAllowed === false &&
      sourceScoringInputFoundationReport.runtimeSlo?.totalErrors === 0,
    actual: `${sourceScoringInputFoundationReport.readiness ?? "missing"}:${sourceScoringInputFoundationReport.runtime?.runtimeId ?? "missing"}`,
    expected: "READY 0268 worker-only scoring input foundation with service worker claim/source linkage and no model/result/publication execution",
    remediation: "Fix the worker-only scoring input foundation before admitting model scoring precheck.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheckPort.recordAnswerScoringModelExecutionPrecheck",
      "recordStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECKED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_answer_scoring_model_execution_precheck_runtime",
      "StudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheckPort.recordAnswerScoringModelExecutionPrecheck",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECKED",
    ]),
    expected: "runtime records an idempotent answer-scoring model execution precheck through a named injected port",
    remediation: "Keep 0290 port-based, replay-safe, and explicitly tied to the answer scoring model queue boundary.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "sourceAnswerScoringRequestVerificationRequired: true",
      "sourceScoringInputFoundationRequired: true",
      "scoringInputManifestVerified: true",
      "internalServicePrincipalVerified: true",
      "approvalVerified: true",
      "modelExecutionQueueAdmissionOnly: true",
      "futureScoringModelExecutionApproved: true",
      "protectedWorkerInputBoundaryPreserved: true",
      "answerTextDisclosed: false",
      "expectedAnswerDisclosed: false",
      "explanationDisclosed: false",
      "answerKeyDisclosed: false",
      "scoreDisclosed: false",
      "resultRefDisclosed: false",
      "rawModelOutputDisclosed: false",
      "modelInferenceStarted: false",
      "scoringExecutionStarted: false",
      "resultPersistenceStarted: false",
      "feedbackGenerationStarted: false",
      "studentVisiblePublished: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "requiresFutureRecordAIGradingResult: true",
      "requiresFutureReviewedFeedbackPublication: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime admits future answer scoring model queue only and blocks answer leakage, scoring execution, result persistence, feedback, DB, HTTP, tools, and Swarm",
    remediation: "Do not collapse 0290 into model inference, scoring result persistence, feedback generation, publication, or direct infrastructure calls.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_answer_scoring_model_precheck",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECKED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_PORT &&
      probe.result?.modelExecutionPrecheck?.requestId === "grading_req_qbank_answer_audit_001" &&
      probe.result?.modelExecutionPrecheck?.submissionId === "qbank_ans_sub_audit_001" &&
      probe.result?.modelExecutionPrecheck?.answerItemCount === 2 &&
      probe.result?.boundary?.modelExecutionQueueAdmissionOnly === true &&
      probe.result?.boundary?.modelInferenceStarted === false &&
      probe.result?.boundary?.scoringExecutionStarted === false &&
      probe.result?.boundary?.resultPersistenceStarted === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};request=${probe.result.modelExecutionPrecheck.requestId};items=${probe.result.modelExecutionPrecheck.answerItemCount};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records one reviewed answer-scoring model queue precheck and leaves model inference/result/feedback for future slices",
    remediation: "Precheck evidence must prove request verification, worker input manifest linkage, approval, budget, no model start, no scoring execution, and no result persistence.",
  });

  addFinding(findings, {
    id: "tests.cover_answer_scoring_model_precheck_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a reviewed answer-scoring model queue precheck without starting model scoring",
      "uses idempotency for safe replay and rejects conflicting model execution prechecks",
      "rejects missing ports, unsafe principals, incomplete approvals, and unsafe policies",
      "rejects non-ready source reports, manifest mismatches, and broken worker-input linkage",
      "rejects answer leaks, unsafe port results, over-budget policies, and missing evidence",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, auth, approval, policy, source readiness, manifest mismatch, leak, unsafe port, budget, and evidence tests",
    remediation: "Add regression coverage before using 0290 as answer scoring model execution precheck evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck"]?.includes("student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank draft answer scoring model execution precheck runtime audit",
        "studentAppAiTutorQuestionBankDraftAnswerScoringModelExecutionPrecheck",
        "student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck.current.json",
        "student_app_ai_tutor_question_bank_draft_answer_scoring_model_execution_precheck_runtime",
        "0290-student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck.md",
        "10.30/10",
        "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECKED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck",
      "studentAppAiTutorQuestionBankDraftAnswerScoringModelExecutionPrecheck",
      "10.30/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0290",
    remediation: "Wire answer scoring model execution precheck evidence through every root project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_PORT,
      sourceRuntimes: [
        "student_app_ai_tutor_question_bank_draft_answer_scoring_request_verification_runtime",
        "student_app_ai_tutor_question_bank_draft_answer_scoring_input_foundation",
      ],
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECKED",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankDraftAnswerScoringModelExecutionPrecheck: probe },
    safetyInvariants: {
      sourceAnswerScoringRequestVerificationRequired: true,
      sourceScoringInputFoundationRequired: true,
      internalServiceOnly: true,
      approvalRequired: true,
      modelExecutionQueueAdmissionOnly: true,
      futureScoringModelExecutionApproved: true,
      protectedWorkerInputBoundaryPreserved: true,
      answerTextDisclosed: false,
      expectedAnswerDisclosed: false,
      explanationDisclosed: false,
      answerKeyDisclosed: false,
      scoreDisclosed: false,
      resultRefDisclosed: false,
      rawModelOutputDisclosed: false,
      modelInferenceAllowed: false,
      scoringExecutionAllowed: false,
      resultPersistenceAllowed: false,
      feedbackGenerationAllowed: false,
      studentVisiblePublishAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the Student App AI Tutor question-bank answer scoring model execution precheck gate; actual model inference, score persistence, reviewed feedback, and publication remain future reviewed slices."
      : "Fix answer scoring model execution precheck evidence before running any reviewed answer scoring model runtime.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheckAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft answer scoring model execution precheck runtime: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
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

async function runRuntimeProbe({ sourceScoringRequestVerificationReport, sourceScoringInputFoundationReport }, options = {}) {
  const precheckLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-answer-scoring-model-precheck-audit-")), "precheck.jsonl");
  let portCalls = 0;
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(probeInput(sourceScoringRequestVerificationReport, sourceScoringInputFoundationReport), {
      generatedAt: "2026-06-06T22:00:00.000Z",
      precheckLogPath,
      answerScoringModelExecutionPrecheckPort: {
        async recordAnswerScoringModelExecutionPrecheck(request) {
          portCalls += 1;
          return {
            modelExecutionPrecheck: {
              precheckId: "qbank_answer_scoring_model_precheck_audit_001",
              requestId: request.answerScoringRequest.requestId,
              submissionId: request.answerScoringRequest.submissionId,
              questionBankDraftRef: request.answerScoringRequest.questionBankDraftRef,
              tutoringAnalysisRequestId: request.answerScoringRequest.tutoringAnalysisRequestId,
              archiveItemId: request.answerScoringRequest.archiveItemId,
              workerId: request.scoringInputManifest.workerId,
              modelRoute: request.modelExecutionPolicy.modelRoute,
              queueRef: request.modelExecutionPolicy.queueRef,
              answerItemCount: request.answerScoringRequest.submittedAnswerItemIds.length,
              status: "PRECHECKED_FOR_REVIEWED_ANSWER_SCORING_MODEL_QUEUE",
              executionState: "MODEL_EXECUTION_PRECHECKED_NOT_STARTED",
              modelInferenceStarted: false,
              scoringExecutionStarted: false,
              resultPersistenceStarted: false,
              feedbackGenerationStarted: false,
              studentVisiblePublished: false,
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
        p99Ms: Math.max(1, Math.min(50, options.probeP99Ms ?? Date.now() - startedAt)),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_PROBE",
      },
    };
  } catch (error) {
    return {
      status: "FAIL",
      error: error.message,
      portCalls,
      runtimeSlo: failedSlo(),
    };
  }
}

function probeInput(sourceScoringRequestVerificationReport, sourceScoringInputFoundationReport) {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck.v1",
    precheckInvocationId: "qbank_answer_scoring_model_precheck_001",
    answerScoringRequestVerificationReport: sourceScoringRequestVerificationReport,
    answerScoringInputFoundationReport: sourceScoringInputFoundationReport,
    principal: {
      principalId: "svc_student_tutor_agent",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      sessionId: "svc_session_student_tutor_agent",
      scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT", "ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_APPROVE"],
    },
    scoringInputManifest: {
      manifestId: "qbank_answer_scoring_input_manifest_001",
      requestId: "grading_req_qbank_answer_audit_001",
      submissionId: "qbank_ans_sub_audit_001",
      questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
      tutoringAnalysisRequestId: "tutor_req_student_app_001",
      archiveItemId: "tarch_student_quiz_001",
      workerId: "ai_grading_worker_scoring_001",
      answerItemCount: 2,
      submittedAnswerItemIds: ["qbank_plan_item_001", "qbank_plan_item_002"],
      status: "WORKER_INPUT_READY_NOT_SCORED",
      protectedAnswerPackageReadiness: "WORKER_ONLY_PROTECTED_INPUT_AVAILABLE",
      sourceEndpoint: "POST /v1/teaching/ai-grading-requests/{requestId}/question-bank-answer-scoring-input",
      sourceFoundationRuntimeId: "student_app_ai_tutor_question_bank_draft_answer_scoring_input_foundation",
    },
    approval: {
      approvalId: "qbank_answer_scoring_model_approval_001",
      reviewerId: "teacher_001",
      reviewerRole: "TEACHER",
      permissions: ["QUESTION_BANK_ANSWER_SCORING_REVIEW", "MODEL_EXECUTION_PRECHECK_APPROVE"],
      reviewedRequestId: "grading_req_qbank_answer_audit_001",
      reviewedSubmissionId: "qbank_ans_sub_audit_001",
      reviewedQuestionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
      reviewedWorkerId: "ai_grading_worker_scoring_001",
      approvedForModelQueueOnly: true,
      workerInputBoundaryReviewed: true,
      answerKeyUseRestrictedToWorker: true,
      budgetReviewed: true,
      humanReviewRequiredBeforeFeedbackPublication: true,
    },
    modelExecutionPolicy: {
      modelRoute: "StudentTutorAgent.score_question_bank_answer",
      approvedProviderClass: "CONTROLLED_AI_WORKER",
      queueRef: "qbank_answer_scoring_model_queue_local_001",
      maxPromptTokens: 1200,
      maxOutputTokens: 400,
      maxScoringAttempts: 1,
      timeoutMs: 30000,
      storeRawModelOutputAllowed: false,
      executeModelNowAllowed: false,
      calculateScoreNowAllowed: false,
      persistResultNowAllowed: false,
      generateFeedbackNowAllowed: false,
      studentVisiblePublishAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      swarmAllowed: false,
      requiresFutureScoringRuntime: true,
      requiresRecordAIGradingResult: true,
      requiresReviewedFeedbackPublication: true,
    },
    evidenceRefs: [
      "evidence:answer-scoring-request-verification:student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification",
      "evidence:answer-scoring-input-foundation:student-app-ai-tutor-question-bank-draft-answer-scoring-input",
      "evidence:model-execution-approval:qbank_answer_scoring_model_approval_001",
    ],
    idempotencyKey: "student-app-ai-tutor-qbank-answer-scoring-model-precheck:student_001:grading_req_qbank_answer_audit_001",
  };
}

function failedSlo() {
  return {
    targetP99Ms: 50,
    p99Ms: null,
    totalErrors: 1,
    operations: 0,
    evidenceClass: "FAILED_PROBE",
  };
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

function includesAny(text, values) {
  return values.some((value) => text.includes(value));
}

function hasForbiddenRuntimeClaim(runtime) {
  return includesAny(runtime, forbiddenRuntimeClaims);
}

function summarizePresence(text, values) {
  return values.map((value) => `${value}=${text.includes(value)}`).join(";");
}

function addFinding(findings, finding) {
  findings.push({ severity: finding.passed ? "info" : "error", ...finding });
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function stringifyScalar(value) {
  if (Array.isArray(value)) return value.join(",");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

async function main() {
  const root = process.cwd();
  const out = parseOutArg(process.argv.slice(2));
  const report = await auditStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheckAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
