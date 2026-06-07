import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck,
  formatStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheckAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck-audit.mjs";

describe("Student App AI Tutor question-bank draft answer scoring model execution precheck audit", () => {
  it("passes when answer scoring model execution precheck is wired as queue-admission-only runtime", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(currentInputs(), {
      generatedAt: "2026-06-06T22:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_scoring_model_execution_precheck_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerScoringModelExecutionPrecheck.result;
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECKED");
    assert.equal(result.boundary.modelExecutionQueueAdmissionOnly, true);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.equal(result.boundary.scoringExecutionStarted, false);
    assert.equal(result.boundary.resultPersistenceStarted, false);
    assert.equal(result.modelExecutionPrecheck.answerItemCount, 2);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheckAudit(report), /model execution precheck runtime: READY/u);
  });

  it("fails when source scoring request verification or scoring input foundation is missing or unsafe", async () => {
    const missingRequestVerification = currentInputs();
    const requestReport = JSON.parse(missingRequestVerification.sourceScoringRequestVerificationReport);
    requestReport.runtime.status = "NOT_VERIFIED";
    missingRequestVerification.sourceScoringRequestVerificationReport = JSON.stringify(requestReport);

    let report = await auditStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(missingRequestVerification);
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.scoring_request_verification_ready").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "runtime.probe_records_answer_scoring_model_precheck").passed, false);

    const unsafeInput = currentInputs();
    const inputReport = JSON.parse(unsafeInput.sourceScoringInputFoundationReport);
    inputReport.safetyInvariants.modelInferenceAllowed = true;
    unsafeInput.sourceScoringInputFoundationReport = JSON.stringify(inputReport);
    report = await auditStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(unsafeInput);
    assert.equal(report.findings.find((finding) => finding.id === "source.scoring_input_foundation_ready").passed, false);
  });

  it("fails when runtime claims scoring execution, result persistence, feedback, raw DB, HTTP, or Swarm", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nexecuteModelNowAllowed: true\ncalculateScoreNowAllowed: true\npersistResultNowAllowed: true\nfeedbackGenerationStarted: true\nfetch(\npostgres://\nswarmAllowed: true\n`;

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the model precheck boundary budget", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(currentInputs(), { probeP99Ms: 90 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when tests, package script, root hooks, SDD, or board omit 0290", async () => {
    const inputs = currentInputs();
    inputs.runtimeTest = "happy path only";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = "studentAppAiTutorQuestionBankDraftAnswerScoringRequestVerification";
    inputs.verifyStructure = "0289 only";
    inputs.sdd = "0289 only";
    inputs.architectureBoard = "10.29/10 only";

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_answer_scoring_model_precheck_negative_paths").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheckPort.recordAnswerScoringModelExecutionPrecheck",
      "recordStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECKED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
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
    ].join("\n"),
    runtimeTest: [
      "records a reviewed answer-scoring model queue precheck without starting model scoring",
      "uses idempotency for safe replay and rejects conflicting model execution prechecks",
      "rejects missing ports, unsafe principals, incomplete approvals, and unsafe policies",
      "rejects non-ready source reports, manifest mismatches, and broken worker-input linkage",
      "rejects answer leaks, unsafe port results, over-budget policies, and missing evidence",
    ].join("\n"),
    sourceScoringRequestVerificationReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification.current.json", "utf8"),
    sourceScoringInputFoundationReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-scoring-input.current.json", "utf8"),
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck": "node tools/student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft answer scoring model execution precheck runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftAnswerScoringModelExecutionPrecheck\nstudent-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck.current.json\nstudent_app_ai_tutor_question_bank_draft_answer_scoring_model_execution_precheck_runtime",
    verifyStructure: "0290-student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck.md\nstudent-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck-runtime.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck-runtime.test.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck-audit.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck-audit.test.mjs",
    sdd: "Student App AI Tutor question-bank draft answer scoring model execution precheck STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECKED MODEL_EXECUTION_PRECHECKED_NOT_STARTED no model no scoring no result no feedback future RecordAIGradingResult",
    architectureBoard: "10.30/10 Student App AI Tutor question-bank draft answer scoring model execution precheck STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECKED",
  };
}
