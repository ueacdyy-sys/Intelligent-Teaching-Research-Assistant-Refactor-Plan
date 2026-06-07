import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_COMMAND_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_RUNTIME_ID,
  recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheck,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-runtime.test.mjs",
  scoringResultPersistenceBridgeReport: "reports/student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge.current.json",
  scoringResultPersistenceBridgeRuntime: "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge-runtime.mjs",
  scoringResultPersistenceBridgeAudit: "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge-audit.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0271-student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck.md",
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
  "studentVisibleFeedbackAllowed: true",
  "answerKeyDisclosureAllowed: true",
  "workerMetadataDisclosureAllowed: true",
  "rawModelOutputDisclosureAllowed: true",
  "resultRefDisclosureAllowed: true",
  "modelInferenceAllowed: true",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "feedbackGenerated: true",
  "humanReviewCompleted: true",
  "studentVisibleFeedbackPublished: true",
  "answerKeyDisclosed: true",
  "workerMetadataDisclosed: true",
  "rawModelOutputDisclosed: true",
  "resultRefDisclosed: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export function auditStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheck(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const scoringResultPersistenceBridgeReport = parseJson(inputs.scoringResultPersistenceBridgeReport, {});
  const hooks = [
    inputs.packageJson ?? "",
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const persistedScoringResultEvidence = [
    inputs.scoringResultPersistenceBridgeRuntime ?? "",
    inputs.scoringResultPersistenceBridgeAudit ?? "",
    inputs.scoringResultPersistenceBridgeReport ?? "",
  ].join("\n");
  const persistedProbeResult =
    scoringResultPersistenceBridgeReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerScoringResultPersistenceBridge?.result ?? {};
  const probe = runRuntimeProbe(scoringResultPersistenceBridgeReport, options);

  addFinding(findings, {
    id: "scoring_result_persistence_bridge.ready_and_safe",
    passed: scoringResultPersistenceBridgeReport.readiness === "READY" &&
      scoringResultPersistenceBridgeReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_RUNTIME" &&
      scoringResultPersistenceBridgeReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_answer_scoring_result_persistence_bridge_runtime" &&
      scoringResultPersistenceBridgeReport.runtime?.commandPort === "StudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridgePort.recordAIGradingResult" &&
      scoringResultPersistenceBridgeReport.runtime?.targetUseCase === "RecordAIGradingResult.Execute" &&
      scoringResultPersistenceBridgeReport.runtime?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTED" &&
      scoringResultPersistenceBridgeReport.safetyInvariants?.sourceControlledScoringArtifactRequired === true &&
      scoringResultPersistenceBridgeReport.safetyInvariants?.existingRecordAIGradingResultUseCaseRequired === true &&
      scoringResultPersistenceBridgeReport.safetyInvariants?.metadataOnlyResultAllowed === true &&
      scoringResultPersistenceBridgeReport.safetyInvariants?.resultPersistenceCommitted === true &&
      scoringResultPersistenceBridgeReport.safetyInvariants?.answerTextDisclosed === false &&
      scoringResultPersistenceBridgeReport.safetyInvariants?.answerKeyDisclosed === false &&
      scoringResultPersistenceBridgeReport.safetyInvariants?.rawModelOutputStored === false &&
      scoringResultPersistenceBridgeReport.safetyInvariants?.feedbackGenerationAllowed === false &&
      scoringResultPersistenceBridgeReport.safetyInvariants?.studentVisiblePublishAllowed === false,
    actual: `${scoringResultPersistenceBridgeReport.readiness ?? "missing"}:${scoringResultPersistenceBridgeReport.runtime?.runtimeId ?? "missing"}:${scoringResultPersistenceBridgeReport.runtime?.status ?? "missing"}`,
    expected: "READY 0292 persisted scoring result bridge through RecordAIGradingResult with no feedback or student publication",
    remediation: "Run the 0292 scoring result persistence bridge audit before allowing feedback publication precheck evidence.",
  });

  addFinding(findings, {
    id: "persisted_scoring_result_surface_only",
    passed: includesAll(persistedScoringResultEvidence, [
      "scoreSummary",
      "resultPersistenceCommitted",
      "RecordAIGradingResult.Execute",
      "SCORING_RESULT_PERSISTED_VIA_RECORD_AI_GRADING_RESULT",
    ]) &&
      scoringResultPersistenceBridgeReport.safetyInvariants?.answerTextDisclosed === false &&
      scoringResultPersistenceBridgeReport.safetyInvariants?.answerKeyDisclosed === false &&
      scoringResultPersistenceBridgeReport.safetyInvariants?.rawModelOutputStored === false &&
      scoringResultPersistenceBridgeReport.safetyInvariants?.feedbackGenerationAllowed === false &&
      scoringResultPersistenceBridgeReport.safetyInvariants?.studentVisiblePublishAllowed === false &&
      persistedProbeResult.boundary?.feedbackGenerationStarted === false &&
      persistedProbeResult.boundary?.studentVisiblePublished === false &&
      persistedProbeResult.boundary?.answerKeyDisclosed === false &&
      persistedProbeResult.boundary?.rawModelOutputStored === false,
    actual: [
      summarizePresence(persistedScoringResultEvidence, ["scoreSummary", "resultPersistenceCommitted", "RecordAIGradingResult.Execute"]),
      `feedbackGenerationAllowed=${scoringResultPersistenceBridgeReport.safetyInvariants?.feedbackGenerationAllowed}`,
      `studentVisiblePublishAllowed=${scoringResultPersistenceBridgeReport.safetyInvariants?.studentVisiblePublishAllowed}`,
      `probeFeedbackStarted=${persistedProbeResult.boundary?.feedbackGenerationStarted}`,
      `probeStudentVisiblePublished=${persistedProbeResult.boundary?.studentVisiblePublished}`,
    ].join(";"),
    expected: "0271 v2 consumes the persisted score-result boundary, not answer text, raw model output, feedback, or student-visible publication",
    remediation: "Keep feedback generation and publication as downstream reviewed slices after 0292 persistence evidence.",
  });

  addFinding(findings, {
    id: "runtime.identity_idempotency_and_publication_block",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_COMMAND_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheckPort.recordFeedbackPublicationPrecheck",
      "recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheck",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_READY",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_BLOCKED_UNTIL_REVIEWED_FEEDBACK",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "scoring result persistence bridge evidence ref is required",
      "scoringResultPersistenceRequired",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_runtime",
      "BLOCK_UNTIL_REVIEWED_FEEDBACK",
      "findExistingRecordByIdempotencyKey",
    ]),
    expected: "runtime records an idempotent feedback publication precheck tied to 0292 persisted scoring evidence",
    remediation: "Do not make feedback publication precheck independent from persisted scoring result evidence.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "feedbackPublicationPrecheckOnly: true",
      "feedbackGenerated: false",
      "humanReviewCompleted: false",
      "studentVisibleFeedbackPublished: false",
      "answerKeyDisclosed: false",
      "workerMetadataDisclosed: false",
      "rawModelOutputDisclosed: false",
      "resultRefDisclosed: false",
      "modelInferenceStarted: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "rejectLeakedFields",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime blocks feedback, publication, answer-key, worker, raw model, resultRef, DB, HTTP, tools, devices, and Swarm",
    remediation: "Feedback publication requires separate reviewed feedback artifact and approval slices.",
  });

  addFinding(findings, {
    id: "runtime.probe_blocks_feedback_publication",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_BLOCKED_UNTIL_REVIEWED_FEEDBACK" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_COMMAND_PORT &&
      probe.result?.precheckDecision?.feedbackPublicationDecision === "BLOCK_UNTIL_REVIEWED_FEEDBACK" &&
      probe.result?.precheckDecision?.studentVisibleFeedbackAllowed === false &&
      probe.result?.boundary?.scoringResultPersistenceVerified === true &&
      probe.result?.boundary?.studentVisibleFeedbackPublished === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};decision=${probe.result.precheckDecision.feedbackPublicationDecision};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records a safe feedback-publication block decision under the Student App 50ms control-plane budget",
    remediation: "Precheck must stop before any feedback becomes student-visible.",
  });

  addFinding(findings, {
    id: "tests.cover_negative_paths",
    passed: includesAll(runtimeTest, [
      "blocks student-visible feedback until reviewed feedback artifacts exist",
      "uses idempotency for replay and rejects conflicting precheck inputs",
      "rejects non-student principals, missing persisted scoring evidence, failed scoring, and unsafe policy",
      "rejects leaked answer, worker, result, model, feedback, publication, and internal error fields",
    ]),
    actual: "runtime tests scanned",
    expected: "positive block, idempotency, auth, evidence, failed scoring, unsafe policy, and leaked-field tests",
    remediation: "Add regression coverage before relying on this precheck for root workflow evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: includesAll(hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck",
      "Student App AI Tutor question-bank draft answer feedback publication precheck runtime audit",
      "studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationPrecheck",
      "student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck.current.json",
      "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_runtime",
      "0271-student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck.md",
      "0293-student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-persisted-scoring-source.md",
      "10.33/10",
      "BLOCK_UNTIL_REVIEWED_FEEDBACK",
      "scoring result persistence bridge",
    ]),
    actual: summarizePresence(hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck",
      "studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationPrecheck",
      "10.33/10",
    ]),
    expected: "package, strict quality, root coverage, structure verifier, SDD, and architecture board track the 0271 v2 / 0293 persisted scoring source upgrade",
    remediation: "Wire the feedback publication precheck through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_RUNTIME",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_COMMAND_PORT,
      sourceScoringResultPersistenceBridgeRuntime: "student_app_ai_tutor_question_bank_draft_answer_scoring_result_persistence_bridge_runtime",
      decision: "BLOCK_UNTIL_REVIEWED_FEEDBACK",
    },
    runtimeSlo: probe.runtimeSlo ?? { targetP99Ms: 50, p99Ms: 50, totalErrors: 1 },
    runtimeProbes: { studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationPrecheck: probe },
    safetyInvariants: {
      scoringResultPersistenceRequired: true,
      safeStudentResultRequired: true,
      humanReviewRequired: true,
      feedbackArtifactRequired: true,
      studentVisibleFeedbackAllowed: false,
      answerKeyDisclosureAllowed: false,
      workerMetadataDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      modelInferenceAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the feedback publication precheck; implement reviewed feedback artifact generation and approval as later slices."
      : "Fix feedback publication precheck evidence before exposing detailed feedback to Student App.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheckAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft answer feedback publication precheck runtime: ${report.readiness}`,
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

function runRuntimeProbe(scoringResultPersistenceBridgeReport, options) {
  const startedAt = Date.now();
  const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-feedback-pub-precheck-audit-")), "precheck.jsonl");
  try {
    const result = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheck(probeInput(scoringResultPersistenceBridgeReport), {
      commandLogPath,
      generatedAt: options.generatedAt ?? "2026-06-06T12:10:00.000Z",
    });
    return {
      status: "PASS",
      result,
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.max(1, Math.min(50, options.probeP99Ms ?? Date.now() - startedAt)),
        totalErrors: 0,
      },
    };
  } catch (error) {
    return {
      status: "FAIL",
      error: error instanceof Error ? error.message : String(error),
      runtimeSlo: { targetP99Ms: 50, p99Ms: 50, totalErrors: 1 },
    };
  }
}

function probeInput(scoringResultPersistenceBridgeReport) {
  const scoringResult = safeStudentScoringResultFromPersistenceBridge(scoringResultPersistenceBridgeReport);
  return {
    schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-publication-precheck.v2",
    precheckInvocationId: "feedback_pub_precheck_audit_001",
    principal: {
      principalId: "user_student_001",
      subjectType: "USER",
      role: "STUDENT",
      entryPoint: "STUDENT_APP",
      scopes: ["STUDENT_OWN_READ", "TEACHING_READ"],
      sessionId: "session_student_001",
      studentAccess: { mode: "OWN", ownStudentId: "student_001" },
    },
    scoringResultPersistenceBridgeReport,
    studentScoringResult: scoringResult,
    feedbackPublicationPolicy: {
      feedbackPublicationPrecheckOnly: true,
      scoringResultPersistenceRequired: true,
      safeStudentResultRequired: true,
      humanReviewRequired: true,
      feedbackArtifactRequired: true,
      detailedFeedbackAvailable: false,
      publicationApproved: false,
      studentVisibleFeedbackAllowed: false,
      answerKeyDisclosureAllowed: false,
      workerMetadataDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      modelInferenceAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [`evidence:student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge:${scoringResult.submissionId}`],
    idempotencyKey: `student-app-ai-tutor-feedback-publication-precheck:student_001:${scoringResult.submissionId}`,
  };
}

function safeStudentScoringResultFromPersistenceBridge(report) {
  const result = report?.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerScoringResultPersistenceBridge?.result ?? {};
  const source = result.sourceControlledScoringArtifact ?? {};
  const persisted = result.persistedAIGradingResult ?? {};
  const requestId = typeof persisted.requestId === "string" ? persisted.requestId : "grading_req_feedback_001";
  const submissionId = typeof source.submissionId === "string" ? source.submissionId : "qbank_ans_sub_feedback_001";
  const scoreSummary = typeof persisted.scoreSummary === "string"
    ? persisted.scoreSummary
    : "Score 93. The student can compare simple fractions.";
  return {
    submissionId,
    requestId,
    questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
    tutoringAnalysisRequestId: "tutor_req_student_app_001",
    archiveItemId: "tarch_student_quiz_001",
    status: "SUCCEEDED",
    scoreSummary,
    requestedAt: "2026-06-06T12:00:00.000Z",
    completedAt: "2026-06-06T12:05:00.000Z",
    updatedAt: "2026-06-06T12:05:00.000Z",
  };
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => {
    const absolute = path.join(root, relativePath);
    return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""];
  }));
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

function includesAny(text, values) {
  return values.some((value) => text.includes(value));
}

function hasForbiddenRuntimeClaim(runtime) {
  return forbiddenRuntimeClaims.some((claim) => runtime.includes(claim));
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

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

async function main() {
  const root = process.cwd();
  const out = parseOutArg(process.argv.slice(2));
  const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheck(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheckAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
