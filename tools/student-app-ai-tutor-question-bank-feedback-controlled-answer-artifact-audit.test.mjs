import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankFeedbackControlledAnswerArtifact,
  formatStudentAppAITutorQuestionBankFeedbackControlledAnswerArtifactAudit,
} from "./student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact-audit.mjs";

describe("Student App AI Tutor question-bank-feedback controlled answer artifact audit", () => {
  it("passes when a question-bank-feedback precheck creates a review-only controlled answer artifact", async () => {
    const report = await auditStudentAppAITutorQuestionBankFeedbackControlledAnswerArtifact(validInputs(), {
      generatedAt: "2026-06-09T11:30:00.000Z",
      probeP99Ms: 6,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_CONTROLLED_ANSWER_ARTIFACT");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_feedback_controlled_answer_artifact");
    assert.equal(report.runtime.sharedRuntimeId, "student_app_ai_tutor_controlled_answer_artifact_runtime");
    assert.equal(report.runtime.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_CONTROLLED_ANSWER_ARTIFACT_RECORDED");
    assert.equal(report.runtimeSlo.p99Ms, 6);
    assert.equal(report.runtimeProbes.studentAppAiTutorQuestionBankFeedbackControlledAnswerArtifact.portSawGuidanceText, false);
    assert.equal(report.safetyInvariants.studentVisiblePublished, false);
    assert.match(formatStudentAppAITutorQuestionBankFeedbackControlledAnswerArtifactAudit(report), /question-bank-feedback controlled answer artifact: READY/u);
  });

  it("fails when 0371 question-bank-feedback model precheck evidence is not ready", async () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.source0371Report);
    source.readiness = "NEEDS_REMEDIATION";
    source.runtimeSlo.totalErrors = 1;
    inputs.source0371Report = JSON.stringify(source);

    const report = await auditStudentAppAITutorQuestionBankFeedbackControlledAnswerArtifact(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0371_question_bank_feedback_model_precheck_ready").passed, false);
  });

  it("fails when the shared controlled answer runtime is not question-bank-feedback aware", async () => {
    const inputs = validInputs();
    inputs.runtime = inputs.runtime.replaceAll("QUESTION_BANK_DRAFT_ANSWER_FEEDBACK", "PUBLISHED_STUDY_PACKET");

    const report = await auditStudentAppAITutorQuestionBankFeedbackControlledAnswerArtifact(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.accepts_question_bank_feedback_precheck_for_controlled_artifact").passed, false);
  });

  it("fails when question-bank-feedback controlled answer regression tests are absent", async () => {
    const inputs = validInputs();
    inputs.runtimeTest = "records a controlled answer artifact without result persistence or student visibility";

    const report = await auditStudentAppAITutorQuestionBankFeedbackControlledAnswerArtifact(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_question_bank_feedback_controlled_answer_paths").passed, false);
  });

  it("fails when root hooks do not track 0372", async () => {
    const inputs = validInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = "";
    inputs.architectureBoard = "11.47/10";

    const report = await auditStudentAppAITutorQuestionBankFeedbackControlledAnswerArtifact(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0372").passed, false);
  });
});

function validInputs() {
  return {
    runtime: [
      "sourceQuestionBankFeedbackPrecheckRuntimeId",
      "assertQuestionBankFeedbackModelExecutionPrecheckReport",
      "student_app_ai_tutor_question_bank_feedback_model_execution_precheck",
      "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      "sourceWorkerQuestionBankFeedbackInputVerified",
      "learningActionSource: source.learningActionSource",
      "feedbackStatus: source.feedbackStatus",
      "studentVisiblePublished: false",
    ].join("\n"),
    runtimeTest: [
      "records a question-bank-feedback-sourced controlled answer artifact for human review only",
      "rejects unsafe question-bank-feedback precheck source reports",
      "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      "feedbackStatus",
    ].join("\n"),
    source0371Report: JSON.stringify(source0371Report()),
    packageJson: JSON.stringify({
      scripts: {
        "audit:student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact": "node tools/student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact-audit.mjs",
      },
    }),
    qualityGate: "Student App AI Tutor question-bank-feedback controlled answer artifact audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankFeedbackControlledAnswerArtifact student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact.current.json student_app_ai_tutor_question_bank_feedback_controlled_answer_artifact",
    verifyStructure: "0372-student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact.md student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact-audit.mjs student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact-audit.test.mjs student_app_ai_tutor_question_bank_feedback_controlled_answer_artifact",
    rootTrace: "SDD 0372 student app ai tutor question-bank feedback controlled answer artifact",
    architectureBoard: "12.52/10 STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_CONTROLLED_ANSWER_ARTIFACT_RECORDED",
    sdd: "SDD 0372 Student App AI Tutor Question-Bank Feedback Controlled Answer Artifact",
  };
}

function source0371Report() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_MODEL_EXECUTION_PRECHECK",
    runtime: {
      runtimeId: "student_app_ai_tutor_question_bank_feedback_model_execution_precheck",
      sharedRuntimeId: "student_app_ai_tutor_model_execution_precheck_runtime",
      commandPort: "StudentAppAITutorModelExecutionPrecheckPort.recordModelExecutionPrecheck",
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_MODEL_EXECUTION_PRECHECKED",
    },
    runtimeSlo: { p99Ms: 6, totalErrors: 0 },
    runtimeProbes: {
      studentAppAiTutorQuestionBankFeedbackModelExecutionPrecheck: {
        result: {
          schemaVersion: "2026-06-08.student-app.ai-tutor-model-execution-prechecked.v1",
          runtimeId: "student_app_ai_tutor_model_execution_precheck_runtime",
          commandPort: "StudentAppAITutorModelExecutionPrecheckPort.recordModelExecutionPrecheck",
          status: "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECKED",
          requestId: "tutor_req_student_app_feedback_001",
          archiveItemId: "tarch_student_feedback_001",
          workerId: "worker_student_tutor_03",
          approvalId: "ai_tutor_model_approval_feedback_001",
          learningActionSource: "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
          feedbackStatus: "READY_FOR_STUDENT_APP_READ",
          feedbackSubmissionId: "qbank_ans_sub_feedback_001",
          feedbackSourceArchiveItemId: "tarch_homework_feedback_source_001",
          inputHash: "a5b2ef0ed017998b85551ded2dee3b0edc4f328bbec77b9c8de538ff758a8bbe",
          modelExecutionPrecheck: {
            precheckId: "ai_tutor_model_precheck_feedback_001",
            queueRef: "ai_tutor_model_queue_feedback_001",
            modelRoute: "student_tutor_guided_help_v1",
            requestId: "tutor_req_student_app_feedback_001",
            workerId: "worker_student_tutor_03",
            inputHash: "a5b2ef0ed017998b85551ded2dee3b0edc4f328bbec77b9c8de538ff758a8bbe",
            safeBlockCount: 2,
            status: "AI_TUTOR_MODEL_EXECUTION_PRECHECKED_NOT_STARTED",
            queueAdmissionOnly: true,
            modelInferenceStarted: false,
            tutorResultRecorded: false,
            studentVisiblePublished: false,
          },
          boundary: {
            sourceWorkerQuestionBankFeedbackInputVerified: true,
            sourceWorkerStudyPacketInputVerified: false,
            sourceWorkerResultArchiveInputVerified: false,
            modelExecutionQueueAdmissionOnly: true,
            safeTextBlockTextSentToPort: false,
            modelInferenceStarted: false,
            tutorAnswerGenerated: false,
            tutoringResultRecorded: false,
            studentVisiblePublished: false,
          },
        },
      },
    },
    safetyInvariants: {
      source0370FeedbackWorkerInputRequired: true,
      learningActionSourceRequired: "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      internalServiceOnly: true,
      approvalRequired: true,
      modelExecutionQueueAdmissionOnly: true,
      safeTextBlocksOnly: true,
      inputHashRecorded: true,
      promptConstructed: false,
      modelInferenceAllowed: false,
      tutorAnswerGenerated: false,
      tutoringResultRecorded: false,
      studentVisiblePublished: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      retrievalAllowed: false,
      swarmAllowed: false,
    },
  };
}
