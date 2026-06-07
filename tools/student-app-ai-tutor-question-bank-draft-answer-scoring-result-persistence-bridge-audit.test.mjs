import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge,
  formatStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridgeAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge-audit.mjs";

describe("Student App AI Tutor question-bank draft answer scoring result persistence bridge audit", () => {
  it("passes when controlled scoring artifact is bridged into RecordAIGradingResult", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(currentInputs(), {
      generatedAt: "2026-06-07T10:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_RUNTIME");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_scoring_result_persistence_bridge_runtime");
    assert.equal(report.runtime.targetUseCase, "RecordAIGradingResult.Execute");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerScoringResultPersistenceBridge.result;
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTED");
    assert.equal(result.executionState, "SCORING_RESULT_PERSISTED_VIA_RECORD_AI_GRADING_RESULT");
    assert.equal(result.boundary.resultPersistenceCommitted, true);
    assert.equal(result.boundary.feedbackGenerationStarted, false);
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal(result.persistedAIGradingResult.status, "SUCCEEDED");
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridgeAudit(report), /persistence bridge runtime: READY/u);
  });

  it("fails when source controlled scoring artifact is missing or unsafe", async () => {
    const unsafe = currentInputs();
    const source = JSON.parse(unsafe.sourceControlledScoringArtifactReport);
    source.runtime.status = "NOT_RECORDED";
    unsafe.sourceControlledScoringArtifactReport = JSON.stringify(source);

    let report = await auditStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(unsafe);
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.controlled_scoring_artifact_ready").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "runtime.probe_persists_result_bridge").passed, false);

    const leaked = currentInputs();
    const leakedSource = JSON.parse(leaked.sourceControlledScoringArtifactReport);
    leakedSource.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerControlledScoringArtifact.result.scoreArtifact.answerText = "leaked";
    leaked.sourceControlledScoringArtifactReport = JSON.stringify(leakedSource);
    report = await auditStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(leaked);
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.probe_persists_result_bridge").passed, false);
  });

  it("fails when existing RecordAIGradingResult boundary evidence is missing", async () => {
    const inputs = currentInputs();
    inputs.existingUseCase = "";
    inputs.existingDomain = "";
    inputs.existingOpenApi = "";

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "existing.record_ai_grading_result_boundary_reused").passed, false);
  });

  it("fails when runtime claims DB, HTTP, feedback, publication, raw output, or Swarm", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nfetch(\npostgres://\nfeedbackGenerationStarted: true\nstudentVisiblePublished: true\nrawModelOutputStored: true\nswarmAllowed: true\n`;

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the result persistence bridge boundary budget", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(currentInputs(), { probeP99Ms: 90 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when tests, package script, root hooks, SDD, or board omit 0292", async () => {
    const inputs = currentInputs();
    inputs.runtimeTest = "happy path only";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = "studentAppAiTutorQuestionBankDraftAnswerControlledScoringArtifact";
    inputs.verifyStructure = "0291 only";
    inputs.sdd = "0291 only";
    inputs.architectureBoard = "10.31/10 only";

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_persistence_bridge_negative_paths").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridgePort.recordAIGradingResult",
      "recordStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "sourceControlledScoringArtifactRequired: true",
      "existingRecordAIGradingResultUseCaseRequired: true",
      "recordAIGradingResultUseCaseInvoked: true",
      "resultPersistenceStarted: true",
      "resultPersistenceCommitted: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "answerTextDisclosed: false",
      "expectedAnswerDisclosed: false",
      "explanationDisclosed: false",
      "answerKeyDisclosed: false",
      "rawModelOutputStored: false",
      "feedbackGenerationStarted: false",
      "studentVisiblePublished: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "requiresFutureReviewedFeedbackPublication: true",
    ].join("\n"),
    runtimeTest: [
      "persists a controlled scoring artifact through RecordAIGradingResult without feedback or publication",
      "uses idempotency for safe replay and rejects conflicting persistence commands",
      "rejects missing ports, unsafe principals, and unsafe policies",
      "rejects unsafe source reports and leaked artifact fields",
      "rejects unsafe port results, mismatched result refs, and missing source evidence",
    ].join("\n"),
    sourceControlledScoringArtifactReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact.current.json", "utf8"),
    existingUseCase: "func (uc *RecordAIGradingResult) Execute",
    existingDomain: "AuthorizeRecordAIGradingResult ApplyAIGradingResult RecordAIGradingResultInput AIGradingStatusSucceeded ScoreSummary ResultRef",
    existingOpenApi: "operationId: recordTeachingAIGradingWorkerResult",
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge": "node tools/student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft answer scoring result persistence bridge runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftAnswerScoringResultPersistenceBridge\nstudent-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge.current.json\nstudent_app_ai_tutor_question_bank_draft_answer_scoring_result_persistence_bridge_runtime",
    verifyStructure: "0292-student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge.md\nstudent-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge-runtime.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge-runtime.test.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge-audit.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge-audit.test.mjs",
    sdd: "Student App AI Tutor question-bank draft answer scoring result persistence bridge STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTED SCORING_RESULT_PERSISTED_VIA_RECORD_AI_GRADING_RESULT RecordAIGradingResult no feedback no publication",
    architectureBoard: "10.32/10 Student App AI Tutor question-bank draft answer scoring result persistence bridge STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTED",
  };
}
