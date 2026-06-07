import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact,
  formatStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifactAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact-audit.mjs";

describe("Student App AI Tutor question-bank draft answer controlled scoring artifact audit", () => {
  it("passes when controlled scoring artifact is wired as non-persisted score artifact runtime", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(currentInputs(), {
      generatedAt: "2026-06-07T09:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_controlled_scoring_artifact_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerControlledScoringArtifact.result;
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_RECORDED");
    assert.equal(result.boundary.modelInferenceStarted, true);
    assert.equal(result.boundary.scoringExecutionStarted, true);
    assert.equal(result.boundary.resultPersistenceStarted, false);
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal(result.scoreArtifact.scoreSummary.totalScore, 16);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifactAudit(report), /controlled scoring artifact runtime: READY/u);
  });

  it("fails when source precheck or scoring input foundation is missing or unsafe", async () => {
    const missingPrecheck = currentInputs();
    const precheckReport = JSON.parse(missingPrecheck.sourceModelPrecheckReport);
    precheckReport.runtime.status = "NOT_PRECHECKED";
    missingPrecheck.sourceModelPrecheckReport = JSON.stringify(precheckReport);

    let report = await auditStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(missingPrecheck);
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.model_precheck_ready").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "runtime.probe_records_controlled_score_artifact").passed, false);

    const unsafeInput = currentInputs();
    const inputReport = JSON.parse(unsafeInput.sourceScoringInputFoundationReport);
    inputReport.safetyInvariants.resultPersistenceAllowed = true;
    unsafeInput.sourceScoringInputFoundationReport = JSON.stringify(inputReport);
    report = await auditStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(unsafeInput);
    assert.equal(report.findings.find((finding) => finding.id === "source.scoring_input_foundation_ready").passed, false);
  });

  it("fails when runtime claims DB, HTTP, raw output, persistence, feedback, publication, or Swarm", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nresultPersistenceStarted: true\nfeedbackGenerationStarted: true\nrawModelOutputStored: true\nfetch(\npostgres://\nswarmAllowed: true\n`;

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the controlled scoring artifact boundary budget", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(currentInputs(), { probeP99Ms: 90 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when tests, package script, root hooks, SDD, or board omit 0291", async () => {
    const inputs = currentInputs();
    inputs.runtimeTest = "happy path only";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = "studentAppAiTutorQuestionBankDraftAnswerScoringModelExecutionPrecheck";
    inputs.verifyStructure = "0290 only";
    inputs.sdd = "0290 only";
    inputs.architectureBoard = "10.30/10 only";

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_controlled_scoring_artifact_negative_paths").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifactPort.recordControlledScoringArtifact",
      "recordStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_RECORDED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
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
    ].join("\n"),
    runtimeTest: [
      "records a controlled scoring artifact without persisting result or feedback",
      "uses idempotency for safe replay and rejects conflicting scoring artifacts",
      "rejects missing ports, unsafe principals, and unsafe output policies",
      "rejects unsafe source reports and broken protected input linkage",
      "rejects leaked artifact fields, unsafe port results, invalid score totals, and missing evidence",
    ].join("\n"),
    sourceModelPrecheckReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck.current.json", "utf8"),
    sourceScoringInputFoundationReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-scoring-input.current.json", "utf8"),
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact": "node tools/student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft answer controlled scoring artifact runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftAnswerControlledScoringArtifact\nstudent-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact.current.json\nstudent_app_ai_tutor_question_bank_draft_answer_controlled_scoring_artifact_runtime",
    verifyStructure: "0291-student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact.md\nstudent-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact-runtime.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact-runtime.test.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact-audit.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact-audit.test.mjs",
    sdd: "Student App AI Tutor question-bank draft answer controlled scoring artifact STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_RECORDED SCORING_ARTIFACT_RECORDED_NOT_PERSISTED no result no feedback no publication future RecordAIGradingResult",
    architectureBoard: "10.31/10 Student App AI Tutor question-bank draft answer controlled scoring artifact STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_RECORDED",
  };
}
