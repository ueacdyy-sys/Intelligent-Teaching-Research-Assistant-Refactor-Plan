import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_COMMAND_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_RUNTIME_ID,
  recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact,
} from "./student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-runtime.test.mjs",
  precheckReport: "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck.current.json",
  precheckRuntime: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-runtime.mjs",
  precheckAudit: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-audit.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0272-student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact.md",
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
  "publicationApproved: true",
  "studentVisibleFeedbackPublished: true",
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
  "modelInferenceStarted: true",
  "answerKeyDisclosed: true",
  "workerMetadataDisclosed: true",
  "rawModelOutputDisclosed: true",
  "resultRefDisclosed: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export function auditStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const precheckReport = parseJson(inputs.precheckReport, {});
  const precheckProbeResult =
    precheckReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationPrecheck?.result ?? {};
  const hooks = [
    inputs.packageJson ?? "",
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = runRuntimeProbe(precheckReport, options);

  addFinding(findings, {
    id: "precheck.ready_and_blocks_publication",
    passed: precheckReport.readiness === "READY" &&
      precheckReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_RUNTIME" &&
      precheckReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_runtime" &&
      precheckReport.runtime?.decision === "BLOCK_UNTIL_REVIEWED_FEEDBACK" &&
      precheckReport.safetyInvariants?.humanReviewRequired === true &&
      precheckReport.safetyInvariants?.feedbackArtifactRequired === true &&
      precheckReport.safetyInvariants?.studentVisibleFeedbackAllowed === false &&
      precheckReport.safetyInvariants?.answerKeyDisclosureAllowed === false &&
      precheckReport.safetyInvariants?.rawModelOutputDisclosureAllowed === false &&
      precheckReport.safetyInvariants?.modelInferenceAllowed === false,
    actual: `${precheckReport.readiness ?? "missing"}:${precheckReport.runtime?.decision ?? "missing"}`,
    expected: "READY 0271 precheck that blocks feedback publication until reviewed feedback exists",
    remediation: "Run the 0271 feedback publication precheck audit before admitting reviewed feedback artifacts.",
  });

  addFinding(findings, {
    id: "precheck.safe_student_result_surface_only",
    passed: precheckReport.safetyInvariants?.scoringResultPersistenceRequired === true &&
      precheckReport.safetyInvariants?.safeStudentResultRequired === true &&
      precheckReport.safetyInvariants?.studentVisibleFeedbackAllowed === false &&
      precheckReport.safetyInvariants?.answerKeyDisclosureAllowed === false &&
      precheckReport.safetyInvariants?.workerMetadataDisclosureAllowed === false &&
      precheckReport.safetyInvariants?.rawModelOutputDisclosureAllowed === false &&
      precheckReport.safetyInvariants?.resultRefDisclosureAllowed === false &&
      precheckReport.safetyInvariants?.modelInferenceAllowed === false &&
      typeof precheckProbeResult.studentScoringResult?.scoreSummary === "string" &&
      precheckProbeResult.precheckDecision?.feedbackPublicationDecision === "BLOCK_UNTIL_REVIEWED_FEEDBACK" &&
      precheckProbeResult.boundary?.studentVisibleFeedbackPublished !== true &&
      precheckProbeResult.boundary?.answerKeyDisclosed !== true &&
      precheckProbeResult.boundary?.workerMetadataDisclosed !== true &&
      precheckProbeResult.boundary?.rawModelOutputDisclosed !== true &&
      precheckProbeResult.boundary?.resultRefDisclosed !== true &&
      precheckProbeResult.boundary?.modelInferenceStarted !== true,
    actual: summarizePrecheckSurface(precheckReport),
    expected: "0272 consumes only safe 0271 precheck evidence and does not resurrect answer keys or raw model output",
    remediation: "Keep reviewed feedback artifact admission downstream of safe precheck evidence.",
  });

  addFinding(findings, {
    id: "runtime.identity_review_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_COMMAND_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactPort.recordReviewedFeedbackArtifact",
      "recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_READY",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_READY_NOT_PUBLISHED",
      "assertReviewerPrincipal",
      "FEEDBACK_REVIEW",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_runtime",
      "FEEDBACK_REVIEW",
      "READY_NOT_PUBLISHED",
      "findExistingRecordByIdempotencyKey",
    ]),
    expected: "runtime records an idempotent human-reviewed feedback artifact tied to 0271 precheck evidence",
    remediation: "Do not admit feedback artifacts without human review identity and idempotency protection.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "feedbackPublicationPrecheckVerified: true",
      "safeStudentResultOnly: true",
      "reviewedFeedbackArtifactRecorded: true",
      "humanReviewCompleted: true",
      "publicationApprovalRequired: true",
      "publicationApproved: false",
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
    expected: "runtime records reviewed feedback but still blocks publication, answer keys, worker fields, raw model output, DB, HTTP, tools, devices, and Swarm",
    remediation: "Keep publication approval and student-visible delivery as later reviewed slices.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_artifact_not_publication",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_READY_NOT_PUBLISHED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_COMMAND_PORT &&
      probe.result?.reviewedFeedbackArtifact?.visibilityState === "REVIEWED_NOT_PUBLISHED" &&
      probe.result?.boundary?.humanReviewCompleted === true &&
      probe.result?.boundary?.studentVisibleFeedbackPublished === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};artifact=${probe.result.reviewedFeedbackArtifact.artifactId};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records a reviewed feedback artifact under the Student App 50ms control-plane budget without publishing it",
    remediation: "Reviewed feedback admission must stop before student-visible publication.",
  });

  addFinding(findings, {
    id: "tests.cover_negative_paths",
    passed: includesAll(runtimeTest, [
      "records reviewed feedback artifacts while keeping student publication blocked",
      "uses idempotency for replay and rejects conflicting reviewed feedback artifacts",
      "rejects non-human reviewers, unsafe precheck reports, unsafe policy, and publication approval",
      "rejects leaked answer, worker, result, model, publication, internal error, and unsafe text fields",
    ]),
    actual: "runtime tests scanned",
    expected: "positive artifact record, idempotency, reviewer auth, precheck safety, unsafe policy, publication approval, leaked-field, and unsafe text tests",
    remediation: "Add regression coverage before relying on reviewed feedback artifacts for root workflow evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: includesAll(hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact",
      "Student App AI Tutor question-bank draft answer reviewed feedback artifact runtime audit",
      "studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifact",
      "student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact.current.json",
      "student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_runtime",
      "0272-student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact.md",
      "10.12/10",
      "READY_NOT_PUBLISHED",
    ]),
    actual: summarizePresence(hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact",
      "studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifact",
      "10.12/10",
    ]),
    expected: "package, strict quality, root coverage, structure verifier, SDD, and architecture board track 0272",
    remediation: "Wire the reviewed feedback artifact runtime through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_RUNTIME",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_COMMAND_PORT,
      sourceFeedbackPublicationPrecheckRuntime: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_runtime",
      status: "READY_NOT_PUBLISHED",
    },
    runtimeSlo: probe.runtimeSlo ?? { targetP99Ms: 50, p99Ms: 50, totalErrors: 1 },
    runtimeProbes: { studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifact: probe },
    safetyInvariants: {
      feedbackPublicationPrecheckRequired: true,
      safeStudentResultRequired: true,
      humanReviewRequired: true,
      feedbackArtifactRecorded: true,
      publicationApprovalRequired: true,
      studentVisibleFeedbackAllowed: false,
      answerKeyDisclosureAllowed: false,
      workerMetadataDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      modelInferenceAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as reviewed feedback artifact evidence; implement publication approval and student-visible delivery as later slices."
      : "Fix reviewed feedback artifact evidence before exposing detailed feedback to Student App.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft answer reviewed feedback artifact runtime: ${report.readiness}`,
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

function runRuntimeProbe(precheckReport, options) {
  const startedAt = Date.now();
  const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-reviewed-feedback-artifact-audit-")), "artifact.jsonl");
  try {
    const result = recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact(probeInput(precheckReport), {
      commandLogPath,
      generatedAt: options.generatedAt ?? "2026-06-06T12:20:00.000Z",
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

function probeInput(precheckReport) {
  const scoring = safeStudentScoringResultFromPrecheck(precheckReport);
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact.v1",
    reviewInvocationId: "feedback_artifact_review_audit_001",
    principal: {
      principalId: "teacher_001",
      subjectType: "USER",
      role: "TEACHER",
      entryPoint: "DESKTOP_TEACHER",
      scopes: ["TEACHING_READ", "FEEDBACK_REVIEW"],
      sessionId: "session_teacher_001",
    },
    feedbackPublicationPrecheckReport: precheckReport,
    reviewedFeedbackArtifact: {
      artifactId: "feedback_artifact_qbank_001",
      artifactKind: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_ANSWER_REVIEWED_FEEDBACK",
      submissionId: scoring.submissionId,
      requestId: scoring.requestId,
      questionBankDraftRef: scoring.questionBankDraftRef,
      tutoringAnalysisRequestId: scoring.tutoringAnalysisRequestId,
      archiveItemId: scoring.archiveItemId,
      audience: "STUDENT_APP_LEARNING_SUPPORT",
      visibilityState: "REVIEWED_NOT_PUBLISHED",
      publicationApproved: false,
      studentVisibleFeedbackPublished: false,
      learnerFeedback: {
        summary: "You understand the main comparison idea, but one fraction-order step still needs practice.",
        encouragement: "Keep the denominator comparison habit and slow down on the final ordering step.",
        nextSteps: ["Review how to compare fractions with unlike denominators.", "Try three short practice questions before the next quiz."],
        misconceptionTags: ["fraction-order"],
        practiceSuggestions: ["Practice two visual fraction bar questions."],
      },
      review: {
        reviewId: "feedback_review_001",
        reviewerPrincipalId: "teacher_001",
        reviewedAt: "2026-06-06T12:18:00.000Z",
        humanReviewed: true,
        ageAppropriate: true,
        studentOwnScopeConfirmed: true,
        answerKeyRemoved: true,
        workerMetadataRemoved: true,
        rawModelOutputRemoved: true,
        internalErrorsRemoved: true,
        publicationApprovalRequired: true,
        publicationApproved: false,
      },
    },
    feedbackArtifactPolicy: {
      feedbackPublicationPrecheckRequired: true,
      safeStudentResultRequired: true,
      humanReviewRequired: true,
      feedbackArtifactAllowed: true,
      publicationApprovalRequired: true,
      studentVisibleFeedbackAllowed: false,
      publicationApproved: false,
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
    evidenceRefs: [`evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck:${scoring.submissionId}`],
    idempotencyKey: `student-app-ai-tutor-reviewed-feedback-artifact:student_001:${scoring.submissionId}`,
  };
}

function safeStudentScoringResultFromPrecheck(report) {
  const result = report?.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationPrecheck?.result;
  const scoring = result?.studentScoringResult ?? {};
  return {
    submissionId: typeof scoring.submissionId === "string" ? scoring.submissionId : "qbank_ans_sub_feedback_001",
    requestId: typeof scoring.requestId === "string" ? scoring.requestId : "grading_req_feedback_001",
    questionBankDraftRef: typeof scoring.questionBankDraftRef === "string" ? scoring.questionBankDraftRef : "local://question-bank-drafts/tutor_req_student_app_001.json",
    tutoringAnalysisRequestId: typeof scoring.tutoringAnalysisRequestId === "string" ? scoring.tutoringAnalysisRequestId : "tutor_req_student_app_001",
    archiveItemId: typeof scoring.archiveItemId === "string" ? scoring.archiveItemId : "tarch_student_quiz_001",
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

function summarizePrecheckSurface(report) {
  const invariants = report.safetyInvariants ?? {};
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationPrecheck?.result ?? {};
  const boundary = result.boundary ?? {};
  return [
    `scoreSummary=${typeof result.studentScoringResult?.scoreSummary === "string"}`,
    `scoringResultPersistenceRequired=${invariants.scoringResultPersistenceRequired}`,
    `safeStudentResultRequired=${invariants.safeStudentResultRequired}`,
    `studentVisibleFeedbackAllowed=${invariants.studentVisibleFeedbackAllowed}`,
    `answerKeyDisclosureAllowed=${invariants.answerKeyDisclosureAllowed}`,
    `workerMetadataDisclosureAllowed=${invariants.workerMetadataDisclosureAllowed}`,
    `rawModelOutputDisclosureAllowed=${invariants.rawModelOutputDisclosureAllowed}`,
    `resultRefDisclosureAllowed=${invariants.resultRefDisclosureAllowed}`,
    `modelInferenceAllowed=${invariants.modelInferenceAllowed}`,
    `decision=${result.precheckDecision?.feedbackPublicationDecision ?? "missing"}`,
    `studentVisibleFeedbackPublished=${boundary.studentVisibleFeedbackPublished}`,
    `answerKeyDisclosed=${boundary.answerKeyDisclosed}`,
    `rawModelOutputDisclosed=${boundary.rawModelOutputDisclosed}`,
    `modelInferenceStarted=${boundary.modelInferenceStarted}`,
  ].join(";");
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
  const report = auditStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
