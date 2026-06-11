import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankFeedbackModelExecutionPrecheck,
  formatStudentAppAITutorQuestionBankFeedbackModelExecutionPrecheckAudit,
} from "./student-app-ai-tutor-question-bank-feedback-model-execution-precheck-audit.mjs";

describe("Student App AI Tutor question-bank feedback model execution precheck audit", () => {
  it("passes when feedback worker input reaches queue-only model precheck", async () => {
    const report = await auditStudentAppAITutorQuestionBankFeedbackModelExecutionPrecheck(validInputs(), {
      generatedAt: "2026-06-11T09:20:00.000Z",
      probeP99Ms: 6,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_MODEL_EXECUTION_PRECHECK");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_feedback_model_execution_precheck");
    assert.equal(report.runtime.sharedRuntimeId, "student_app_ai_tutor_model_execution_precheck_runtime");
    assert.equal(report.runtime.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_MODEL_EXECUTION_PRECHECKED");
    assert.equal(report.runtimeSlo.p99Ms, 6);
    assert.equal(report.runtimeProbes.studentAppAiTutorQuestionBankFeedbackModelExecutionPrecheck.portSawFeedbackText, false);
    assert.equal(report.runtimeProbes.studentAppAiTutorQuestionBankFeedbackModelExecutionPrecheck.portSawFeedbackIds, false);
    assert.equal(report.safetyInvariants.modelInferenceAllowed, false);
    assert.match(formatStudentAppAITutorQuestionBankFeedbackModelExecutionPrecheckAudit(report), /question-bank feedback model execution precheck: READY/u);
  });

  it("fails when 0370 feedback worker rebuilding evidence is absent", async () => {
    const inputs = validInputs();
    inputs.domainWorkerInput = "BuildAITutorWorkerStudyPacketInput";
    inputs.usecaseWorkerInput = "";

    const report = await auditStudentAppAITutorQuestionBankFeedbackModelExecutionPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0370_feedback_worker_input_rebuilds_safe_context").passed, false);
  });

  it("fails when the shared runtime is not feedback-source aware", async () => {
    const inputs = validInputs();
    inputs.runtime = inputs.runtime.replaceAll("QUESTION_BANK_DRAFT_ANSWER_FEEDBACK", "PUBLISHED_STUDY_PACKET");

    const report = await auditStudentAppAITutorQuestionBankFeedbackModelExecutionPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.accepts_question_bank_feedback_source_without_text_to_port").passed, false);
  });

  it("fails when feedback-source regression tests are absent", async () => {
    const inputs = validInputs();
    inputs.runtimeTest = "records a queue-only model precheck without sending text or starting inference";

    const report = await auditStudentAppAITutorQuestionBankFeedbackModelExecutionPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_feedback_model_precheck_paths").passed, false);
  });

  it("fails when root hooks do not track 0371", async () => {
    const inputs = validInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = "";
    inputs.architectureBoard = "12.46/10";

    const report = await auditStudentAppAITutorQuestionBankFeedbackModelExecutionPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0371").passed, false);
  });
});

function validInputs() {
  return {
    runtime: [
      "assertWorkerQuestionBankFeedbackInputReport",
      "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      "sourceWorkerQuestionBankFeedbackInputVerified",
      "worker-question-bank-feedback-input",
      "feedbackStatus",
      "feedbackSubmissionId",
      "feedbackSourceArchiveItemId",
      "safeTextBlockTextSentToPort: false",
      "modelInferenceStarted: false",
    ].join("\n"),
    runtimeTest: [
      "records a question-bank-feedback-sourced model precheck without sending feedback text",
      "sourceWorkerQuestionBankFeedbackInputVerified",
      "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      "mismatchedFeedbackSource",
      "qbank_ans_sub_feedback_001",
    ].join("\n"),
    domainWorkerInput: [
      "BuildAITutorWorkerQuestionBankFeedbackInput",
      "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      "BuildQuestionBankDraftAnswerFeedbackLearningActions",
      "feedbackStatus",
      "feedbackSubmissionId",
      "feedbackSourceArchiveItemId",
      "answerText",
    ].join("\n"),
    usecaseWorkerInput: [
      "GetQuestionBankDraftAnswerFeedbackArchiveSnapshotByFeedbackArchiveItemForStudent",
      "BuildQuestionBankDraftAnswerFeedbackRenderEnvelope",
      "expectedAnswer",
    ].join("\n"),
    httpWorkerInputTest: [
      "feedbackSourceArchiveItemId",
      "rawModelOutput",
    ].join("\n"),
    source0370Sdd: "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK feedback learning actions",
    packageJson: JSON.stringify({
      scripts: {
        "audit:student-app-ai-tutor-question-bank-feedback-model-execution-precheck": "node tools/student-app-ai-tutor-question-bank-feedback-model-execution-precheck-audit.mjs",
      },
    }),
    qualityGate: "Student App AI Tutor question-bank feedback model execution precheck audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankFeedbackModelExecutionPrecheck student-app-ai-tutor-question-bank-feedback-model-execution-precheck.current.json student_app_ai_tutor_question_bank_feedback_model_execution_precheck",
    verifyStructure: "0371-student-app-ai-tutor-question-bank-feedback-model-execution-precheck.md student-app-ai-tutor-question-bank-feedback-model-execution-precheck-audit.mjs student-app-ai-tutor-question-bank-feedback-model-execution-precheck-audit.test.mjs student_app_ai_tutor_question_bank_feedback_model_execution_precheck",
    rootTrace: "SDD 0371 student app ai tutor question-bank feedback model execution precheck",
    architectureBoard: "12.49/10 STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_MODEL_EXECUTION_PRECHECKED",
    sdd: "SDD 0371 Student App AI Tutor Question-Bank Feedback Model Execution Precheck",
  };
}
