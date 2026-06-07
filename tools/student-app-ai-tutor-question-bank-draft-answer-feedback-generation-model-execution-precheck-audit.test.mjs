import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck,
  formatStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheckAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck-audit.mjs";

describe("Student App AI Tutor question-bank draft answer feedback generation model execution precheck audit", () => {
  it("passes when the runtime admits only future feedback generation model queue work", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck(currentInputs(), {
      generatedAt: "2026-06-07T03:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECK_RUNTIME");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_feedback_generation_model_execution_precheck_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck.result;
    assert.equal(result.boundary.feedbackGenerationQueueAdmitted, true);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheckAudit(report), /feedback generation model execution precheck runtime: READY/u);
  });

  it("fails when source feedback publication precheck is missing persisted scoring evidence", async () => {
    const inputs = currentInputs();
    const source = JSON.parse(inputs.feedbackPublicationPrecheckReport);
    source.safetyInvariants.scoringResultPersistenceRequired = false;
    source.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationPrecheck.result.precheckDecision.scoringResultPersistenceVerified = false;
    inputs.feedbackPublicationPrecheckReport = JSON.stringify(source);

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source_feedback_publication_precheck.ready_and_persisted_scoring").passed, false);
  });

  it("fails when runtime claims model, feedback draft, publication, or unsafe transport work", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nmodelInferenceStarted: true\nfeedbackDraftGenerated: true\nstudentVisibleFeedbackPublished: true\nexecuteHttpRequestAllowed: true\nswarmAllowed: true\n`;

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.queue_admission_only_boundary").passed, false);
  });

  it("caps probe p99 at the Student App control-plane budget", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when package, quality, root coverage, structure, SDD, or board omit the runtime", async () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.qualityGate = "";
    inputs.rootWorkflowCoverage = "";
    inputs.verifyStructure = "";
    inputs.sdd = "";
    inputs.architectureBoard = "";

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
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
    ].join("\n"),
    runtimeTest: [
      "admits feedback generation to a controlled model queue without starting inference",
      "uses idempotency for replay and rejects conflicting precheck inputs",
      "rejects unsafe source precheck, principal, approval, policy, and port results",
      "rejects leaked answer, result, raw model, feedback, publication, and internal error fields",
    ].join("\n"),
    feedbackPublicationPrecheckReport: JSON.stringify(feedbackPublicationPrecheckReport()),
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck": "node tools/student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft answer feedback generation model execution precheck runtime audit",
    rootWorkflowCoverage: [
      "studentAppAiTutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck",
      "student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck.current.json",
      "student_app_ai_tutor_question_bank_draft_answer_feedback_generation_model_execution_precheck_runtime",
    ].join("\n"),
    verifyStructure: [
      "0294-student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck.md",
      "student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck-runtime.mjs",
      "student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck-audit.test.mjs",
    ].join("\n"),
    sdd: "0294 Student App AI Tutor question-bank draft answer feedback generation model execution precheck",
    architectureBoard: "10.34/10 Student App AI Tutor question-bank draft answer feedback generation model execution precheck",
  };
}

function feedbackPublicationPrecheckReport() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_RUNTIME",
    runtime: {
      runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_runtime",
      decision: "BLOCK_UNTIL_REVIEWED_FEEDBACK",
    },
    runtimeSlo: { targetP99Ms: 50, p99Ms: 7, totalErrors: 0 },
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
    runtimeProbes: {
      studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationPrecheck: {
        result: {
          recordId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_001",
          runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_runtime",
          precheckInvocationId: "feedback_pub_precheck_001",
          sourceScoringResultPersistenceBridge: {
            runtimeId: "student_app_ai_tutor_question_bank_draft_answer_scoring_result_persistence_bridge_runtime",
            recordId: "student_app_ai_tutor_question_bank_draft_answer_scoring_result_persistence_bridge_001",
            requestId: "grading_req_feedback_001",
            submissionId: "qbank_ans_sub_feedback_001",
          },
          studentScoringResult: {
            submissionId: "qbank_ans_sub_feedback_001",
            requestId: "grading_req_feedback_001",
            questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
            tutoringAnalysisRequestId: "tutor_req_student_app_001",
            archiveItemId: "tarch_student_quiz_001",
            status: "SUCCEEDED",
            scoreSummary: "Score 93. The student can compare simple fractions.",
            requestedAt: "2026-06-06T12:00:00.000Z",
            completedAt: "2026-06-06T12:05:00.000Z",
            updatedAt: "2026-06-06T12:05:00.000Z",
          },
          precheckDecision: {
            feedbackPublicationDecision: "BLOCK_UNTIL_REVIEWED_FEEDBACK",
            scoringResultPersistenceVerified: true,
            safeStudentResultVerified: true,
          },
          boundary: {
            feedbackPublicationPrecheckOnly: true,
            feedbackGenerated: false,
            studentVisibleFeedbackPublished: false,
            modelInferenceStarted: false,
          },
          evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge:qbank_ans_sub_feedback_001"],
        },
      },
    },
  };
}
