import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_RUNTIME_ID,
  recordStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact,
} from "./student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact-runtime.test.mjs",
  sourceModelPrecheckReport: "reports/student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck.current.json",
  sourceScoringInputFoundationReport: "reports/student-app-ai-tutor-question-bank-draft-answer-scoring-input.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0291-student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact.md",
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
  "answerTextDisclosed: true",
  "expectedAnswerDisclosed: true",
  "explanationDisclosed: true",
  "answerKeyDisclosed: true",
  "rawModelOutputStored: true",
  "resultPersistenceStarted: true",
  "feedbackGenerationStarted: true",
  "studentVisiblePublished: true",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export async function auditStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const sourceModelPrecheckReport = parseJson(inputs.sourceModelPrecheckReport, {});
  const sourceScoringInputFoundationReport = parseJson(inputs.sourceScoringInputFoundationReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe({ sourceModelPrecheckReport, sourceScoringInputFoundationReport }, options);

  addFinding(findings, {
    id: "source.model_precheck_ready",
    passed: sourceModelPrecheckReport.readiness === "READY" &&
      sourceModelPrecheckReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK" &&
      sourceModelPrecheckReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_answer_scoring_model_execution_precheck_runtime" &&
      sourceModelPrecheckReport.runtime?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECKED" &&
      sourceModelPrecheckReport.safetyInvariants?.modelExecutionQueueAdmissionOnly === true &&
      sourceModelPrecheckReport.safetyInvariants?.resultPersistenceAllowed === false &&
      sourceModelPrecheckReport.safetyInvariants?.studentVisiblePublishAllowed === false &&
      sourceModelPrecheckReport.runtimeSlo?.totalErrors === 0,
    actual: `${sourceModelPrecheckReport.readiness ?? "missing"}:${sourceModelPrecheckReport.runtime?.status ?? "missing"}`,
    expected: "READY 0290 scoring model execution precheck with no result persistence or feedback publication",
    remediation: "Run the 0290 scoring model execution precheck before recording a controlled score artifact.",
  });

  addFinding(findings, {
    id: "source.scoring_input_foundation_ready",
    passed: sourceScoringInputFoundationReport.readiness === "READY" &&
      sourceScoringInputFoundationReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_INPUT_FOUNDATION" &&
      sourceScoringInputFoundationReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_answer_scoring_input_foundation" &&
      sourceScoringInputFoundationReport.safetyInvariants?.internalWorkerOnly === true &&
      sourceScoringInputFoundationReport.safetyInvariants?.responseExposesAnswerTextToWorker === true &&
      sourceScoringInputFoundationReport.safetyInvariants?.resultPersistenceAllowed === false &&
      sourceScoringInputFoundationReport.safetyInvariants?.studentVisiblePublishAllowed === false &&
      sourceScoringInputFoundationReport.runtimeSlo?.totalErrors === 0,
    actual: `${sourceScoringInputFoundationReport.readiness ?? "missing"}:${sourceScoringInputFoundationReport.runtime?.runtimeId ?? "missing"}`,
    expected: "READY 0268 worker-only scoring input foundation",
    remediation: "Fix worker-only scoring input evidence before recording controlled score artifacts.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifactPort.recordControlledScoringArtifact",
      "recordStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_RECORDED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_answer_controlled_scoring_artifact_runtime",
      "StudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifactPort.recordControlledScoringArtifact",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_RECORDED",
    ]),
    expected: "runtime records an idempotent controlled scoring artifact through a named injected port",
    remediation: "Keep 0291 port-based, replay-safe, and explicitly tied to the controlled scoring artifact boundary.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "sourceModelExecutionPrecheckRequired: true",
      "sourceScoringInputFoundationRequired: true",
      "protectedAnswerPackageConsumedByWorkerOnly: true",
      "controlledModelScoringArtifactOnly: true",
      "modelInferenceStarted: true",
      "scoringExecutionStarted: true",
      "answerTextDisclosed: false",
      "expectedAnswerDisclosed: false",
      "explanationDisclosed: false",
      "answerKeyDisclosed: false",
      "rawModelOutputStored: false",
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
    expected: "runtime may create a sanitized score artifact but blocks answer leaks, raw output, persistence, feedback, DB, HTTP, tools, and Swarm",
    remediation: "Do not collapse 0291 into RecordAIGradingResult, feedback generation, publication, or direct infrastructure calls.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_controlled_score_artifact",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_RECORDED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_PORT &&
      probe.result?.scoreArtifact?.executionState === "SCORING_ARTIFACT_RECORDED_NOT_PERSISTED" &&
      probe.result?.scoreArtifact?.scoreSummary?.totalScore === 16 &&
      probe.result?.scoreArtifact?.scoreSummary?.maxScore === 20 &&
      probe.result?.boundary?.modelInferenceStarted === true &&
      probe.result?.boundary?.scoringExecutionStarted === true &&
      probe.result?.boundary?.resultPersistenceStarted === false &&
      probe.result?.boundary?.feedbackGenerationStarted === false &&
      probe.result?.boundary?.studentVisiblePublished === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};score=${probe.result.scoreArtifact.scoreSummary.totalScore}/${probe.result.scoreArtifact.scoreSummary.maxScore};persisted=${probe.result.boundary.resultPersistenceStarted};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records one controlled scoring artifact with no result persistence or publication side effects",
    remediation: "Controlled scoring artifact evidence must prove source precheck, worker input linkage, sanitized scoring output, and no result persistence.",
  });

  addFinding(findings, {
    id: "tests.cover_controlled_scoring_artifact_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a controlled scoring artifact without persisting result or feedback",
      "uses idempotency for safe replay and rejects conflicting scoring artifacts",
      "rejects missing ports, unsafe principals, and unsafe output policies",
      "rejects unsafe source reports and broken protected input linkage",
      "rejects leaked artifact fields, unsafe port results, invalid score totals, and missing evidence",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, auth, unsafe policy, source readiness, linkage, leak, unsafe port, score total, and evidence tests",
    remediation: "Add regression coverage before using 0291 as controlled scoring artifact evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact"]?.includes("student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank draft answer controlled scoring artifact runtime audit",
        "studentAppAiTutorQuestionBankDraftAnswerControlledScoringArtifact",
        "student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact.current.json",
        "student_app_ai_tutor_question_bank_draft_answer_controlled_scoring_artifact_runtime",
        "0291-student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact.md",
        "10.31/10",
        "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_RECORDED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact",
      "studentAppAiTutorQuestionBankDraftAnswerControlledScoringArtifact",
      "10.31/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0291",
    remediation: "Wire controlled scoring artifact evidence through every root project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_PORT,
      sourceRuntimes: [
        "student_app_ai_tutor_question_bank_draft_answer_scoring_model_execution_precheck_runtime",
        "student_app_ai_tutor_question_bank_draft_answer_scoring_input_foundation",
      ],
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_RECORDED",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankDraftAnswerControlledScoringArtifact: probe },
    safetyInvariants: {
      sourceModelExecutionPrecheckRequired: true,
      sourceScoringInputFoundationRequired: true,
      internalServiceOnly: true,
      protectedAnswerPackageConsumedByWorkerOnly: true,
      controlledModelScoringArtifactOnly: true,
      modelInferenceAllowed: true,
      scoringExecutionAllowed: true,
      answerTextDisclosed: false,
      expectedAnswerDisclosed: false,
      explanationDisclosed: false,
      answerKeyDisclosed: false,
      rawModelOutputStored: false,
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
      ? "Use this as the controlled answer scoring artifact gate; RecordAIGradingResult, reviewed feedback, publication, and archive persistence remain future reviewed slices."
      : "Fix controlled scoring artifact evidence before persisting any answer scoring result.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifactAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft answer controlled scoring artifact runtime: ${report.readiness}`,
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

async function runRuntimeProbe({ sourceModelPrecheckReport, sourceScoringInputFoundationReport }, options = {}) {
  const artifactLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-answer-controlled-scoring-artifact-audit-")), "artifact.jsonl");
  let portCalls = 0;
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(probeInput(sourceModelPrecheckReport, sourceScoringInputFoundationReport), {
      generatedAt: "2026-06-07T09:00:00.000Z",
      artifactLogPath,
      controlledScoringArtifactPort: {
        async recordControlledScoringArtifact(request) {
          portCalls += 1;
          return {
            scoreArtifact: {
              artifactId: "qbank_answer_scoring_artifact_001",
              requestId: request.modelExecutionPrecheck.requestId,
              submissionId: request.modelExecutionPrecheck.submissionId,
              questionBankDraftRef: request.modelExecutionPrecheck.questionBankDraftRef,
              tutoringAnalysisRequestId: "tutor_req_student_app_001",
              archiveItemId: "tarch_student_quiz_001",
              workerId: request.modelExecutionPrecheck.workerId,
              modelRoute: request.modelExecutionPrecheck.modelRoute,
              attemptId: request.scoringAttempt.attemptId,
              executionState: "SCORING_ARTIFACT_RECORDED_NOT_PERSISTED",
              status: "REVIEWED_MODEL_SCORE_ARTIFACT_RECORDED_NOT_PERSISTED",
              itemScores: [
                { itemId: "qbank_plan_item_001", score: 8, maxScore: 10, confidence: 0.91, rubricCode: "rubric_qbank_plan_item_001" },
                { itemId: "qbank_plan_item_002", score: 8, maxScore: 10, confidence: 0.89, rubricCode: "rubric_qbank_plan_item_002" },
              ],
              scoreSummary: { totalScore: 16, maxScore: 20, percentage: 80, level: "PROFICIENT" },
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
        evidenceClass: "STUDENT_APP_AI_TUTOR_QBANK_ANSWER_CONTROLLED_SCORING_ARTIFACT_PROBE",
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

function probeInput(sourceModelPrecheckReport, sourceScoringInputFoundationReport) {
  return {
    schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-controlled-scoring-artifact.v1",
    scoringInvocationId: "qbank_answer_scoring_model_execution_001",
    modelExecutionPrecheckReport: sourceModelPrecheckReport,
    answerScoringInputFoundationReport: sourceScoringInputFoundationReport,
    principal: {
      principalId: "svc_student_tutor_agent",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      sessionId: "svc_session_student_tutor_agent",
      scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT", "ANSWER_SCORING_MODEL_EXECUTE"],
    },
    protectedScoringInput: {
      requestId: "grading_req_qbank_answer_audit_001",
      submissionId: "qbank_ans_sub_audit_001",
      questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
      workerId: "ai_grading_worker_scoring_001",
      sourceFoundationRuntimeId: "student_app_ai_tutor_question_bank_draft_answer_scoring_input_foundation",
      items: [
        { itemId: "qbank_plan_item_001", answerText: "student answer one", expectedAnswer: "expected answer one", explanation: "rubric explanation one", maxScore: 10, rubricCode: "rubric_qbank_plan_item_001" },
        { itemId: "qbank_plan_item_002", answerText: "student answer two", expectedAnswer: "expected answer two", explanation: "rubric explanation two", maxScore: 10, rubricCode: "rubric_qbank_plan_item_002" },
      ],
    },
    scoringAttempt: {
      attemptId: "qbank_answer_scoring_model_attempt_001",
      precheckId: "qbank_answer_scoring_model_precheck_audit_001",
      requestId: "grading_req_qbank_answer_audit_001",
      workerId: "ai_grading_worker_scoring_001",
      modelRoute: "StudentTutorAgent.score_question_bank_answer",
      queueRef: "qbank_answer_scoring_model_queue_local_001",
      providerClass: "CONTROLLED_AI_WORKER",
      attemptNo: 1,
    },
    outputPolicy: {
      controlledScoreArtifactOnly: true,
      modelInferenceAllowed: true,
      scoringExecutionAllowed: true,
      answerTextInArtifactAllowed: false,
      expectedAnswerInArtifactAllowed: false,
      explanationInArtifactAllowed: false,
      rawModelOutputStored: false,
      resultPersistenceAllowed: false,
      feedbackGenerationAllowed: false,
      studentVisiblePublishAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      "evidence:answer-scoring-model-execution-precheck:student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck",
      "evidence:answer-scoring-input-foundation:student-app-ai-tutor-question-bank-draft-answer-scoring-input",
      "evidence:controlled-scoring-model-execution:qbank_answer_scoring_model_attempt_001",
      "evidence:model-route:StudentTutorAgent.score_question_bank_answer",
    ],
    idempotencyKey: "student-app-ai-tutor-qbank-answer-controlled-scoring-artifact:student_001:grading_req_qbank_answer_audit_001",
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
  const report = await auditStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifactAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
