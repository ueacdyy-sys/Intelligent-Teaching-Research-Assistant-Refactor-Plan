import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheck,
  formatStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheckAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-audit.mjs";

describe("Student App AI Tutor question-bank draft answer feedback publication precheck audit", () => {
  it("passes when feedback publication precheck blocks on top of persisted scoring result evidence", () => {
    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheck(currentInputs(), {
      generatedAt: "2026-06-06T12:10:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_RUNTIME");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationPrecheck.result;
    assert.equal(result.precheckDecision.feedbackPublicationDecision, "BLOCK_UNTIL_REVIEWED_FEEDBACK");
    assert.equal(result.boundary.studentVisibleFeedbackPublished, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheckAudit(report), /feedback publication precheck runtime: READY/u);
  });

  it("fails when scoring result persistence bridge evidence is missing or unsafe", () => {
    const inputs = currentInputs();
    const reportPayload = JSON.parse(inputs.scoringResultPersistenceBridgeReport);
    reportPayload.safetyInvariants.answerKeyDisclosed = true;
    inputs.scoringResultPersistenceBridgeReport = JSON.stringify(reportPayload);

    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "scoring_result_persistence_bridge.ready_and_safe").passed, false);
  });

  it("fails when runtime claims feedback, publication, model work, or unsafe transport", () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nstudentVisibleFeedbackAllowed: true\nfeedbackGenerated: true\nmodelInferenceAllowed: true\nexecuteHttpRequestAllowed: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the Student App feedback publication precheck budget", () => {
    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheck(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when root hooks, structure, SDD, or board omit the runtime", () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationPrecheck", "studentAppAiTutorQuestionBankDraftAnswerScoringCompletionBridge");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("feedback-publication-precheck", "answer-scoring-completion-bridge");
    inputs.sdd = "Student App AI Tutor question-bank draft answer scoring completion bridge";
    inputs.architectureBoard = "Student App AI Tutor question-bank draft answer scoring completion bridge 10.10/10";

    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheck(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
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
    ].join("\n"),
    runtimeTest: [
      "blocks student-visible feedback until reviewed feedback artifacts exist",
      "uses idempotency for replay and rejects conflicting precheck inputs",
      "rejects non-student principals, missing persisted scoring evidence, failed scoring, and unsafe policy",
      "rejects leaked answer, worker, result, model, feedback, publication, and internal error fields",
    ].join("\n"),
    scoringResultPersistenceBridgeReport: JSON.stringify(scoringResultPersistenceBridgeReport()),
    scoringResultPersistenceBridgeRuntime: [
      "scoreSummary",
      "resultPersistenceCommitted",
      "RecordAIGradingResult.Execute",
      "SCORING_RESULT_PERSISTED_VIA_RECORD_AI_GRADING_RESULT",
      "feedbackGenerationStarted: false",
      "studentVisiblePublished: false",
      "answerKeyDisclosed: false",
      "rawModelOutputStored: false",
    ].join("\n"),
    scoringResultPersistenceBridgeAudit: "scoreSummary resultPersistenceCommitted RecordAIGradingResult.Execute SCORING_RESULT_PERSISTED_VIA_RECORD_AI_GRADING_RESULT",
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck": "node tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft answer feedback publication precheck runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationPrecheck\nstudent-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck.current.json\nstudent_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_runtime",
    verifyStructure: "0271-student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck.md\n0293-student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-persisted-scoring-source.md\nstudent-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-runtime.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-audit.test.mjs",
    sdd: "0271 Student App AI Tutor question-bank draft answer feedback publication precheck BLOCK_UNTIL_REVIEWED_FEEDBACK",
    architectureBoard: "10.33/10 Student App AI Tutor question-bank draft answer feedback publication precheck scoring result persistence bridge BLOCK_UNTIL_REVIEWED_FEEDBACK",
  };
}

function scoringResultPersistenceBridgeReport() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_RUNTIME",
    runtime: {
      runtimeId: "student_app_ai_tutor_question_bank_draft_answer_scoring_result_persistence_bridge_runtime",
      commandPort: "StudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridgePort.recordAIGradingResult",
      targetUseCase: "RecordAIGradingResult.Execute",
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTED",
    },
    safetyInvariants: {
      sourceControlledScoringArtifactRequired: true,
      existingRecordAIGradingResultUseCaseRequired: true,
      metadataOnlyResultAllowed: true,
      recordAIGradingResultUseCaseInvoked: true,
      resultPersistenceAllowed: true,
      resultPersistenceCommitted: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      answerTextDisclosed: false,
      expectedAnswerDisclosed: false,
      explanationDisclosed: false,
      answerKeyDisclosed: false,
      rawModelOutputStored: false,
      feedbackGenerationAllowed: false,
      studentVisiblePublishAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    runtimeProbes: {
      studentAppAiTutorQuestionBankDraftAnswerScoringResultPersistenceBridge: {
        result: {
          runtimeId: "student_app_ai_tutor_question_bank_draft_answer_scoring_result_persistence_bridge_runtime",
          commandPort: "StudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridgePort.recordAIGradingResult",
          status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTED",
          recordId: "student_app_ai_tutor_question_bank_draft_answer_scoring_result_persistence_bridge_001",
          executionState: "SCORING_RESULT_PERSISTED_VIA_RECORD_AI_GRADING_RESULT",
          sourceControlledScoringArtifact: {
            submissionId: "qbank_ans_sub_feedback_001",
            workerId: "ai_grading_worker_scoring_001",
          },
          persistedAIGradingResult: {
            requestId: "grading_req_feedback_001",
            workerId: "ai_grading_worker_scoring_001",
            status: "SUCCEEDED",
            scoreSummary: "Question-bank answer score 93/100 (93%, ADVANCED); items=5; artifact=qbank_answer_scoring_artifact_feedback_001",
            resultRef: "controlled-score-artifact://qbank_answer_scoring_artifact_feedback_001?request=grading_req_feedback_001&hash=sha256_abcdef",
            resultPersistenceCommitted: true,
            feedbackGenerationStarted: false,
            studentVisiblePublished: false,
          },
          boundary: {
            resultPersistenceCommitted: true,
            feedbackGenerationStarted: false,
            studentVisiblePublished: false,
            answerKeyDisclosed: false,
            rawModelOutputStored: false,
            directDatabaseAccessAllowed: false,
            executeHttpRequestAllowed: false,
            swarmAllowed: false,
          },
        },
      },
    },
  };
}
