import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankFeedbackAnswerReviewGate,
  formatStudentAppAITutorQuestionBankFeedbackAnswerReviewGateAudit,
} from "./student-app-ai-tutor-question-bank-feedback-answer-review-gate-audit.mjs";

describe("Student App AI Tutor question-bank-feedback answer review gate audit", () => {
  it("passes when a question-bank-feedback controlled artifact enters the shared review gate", async () => {
    const report = await auditStudentAppAITutorQuestionBankFeedbackAnswerReviewGate(validInputs(), {
      generatedAt: "2026-06-11T10:15:00.000Z",
      probeP99Ms: 6,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_ANSWER_REVIEW_GATE");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_feedback_answer_review_gate");
    assert.equal(report.runtime.sharedRuntimeId, "student_app_ai_tutor_answer_review_gate_runtime");
    assert.equal(report.runtime.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_ANSWER_REVIEW_GATE_RECORDED");
    assert.equal(report.runtimeSlo.p99Ms, 6);
    assert.equal(report.runtimeProbes.studentAppAiTutorQuestionBankFeedbackAnswerReviewGate.portSawGuidanceText, false);
    assert.equal(report.runtimeProbes.studentAppAiTutorQuestionBankFeedbackAnswerReviewGate.portSawFeedbackIds, false);
    assert.equal(report.safetyInvariants.studentVisiblePublished, false);
    assert.match(formatStudentAppAITutorQuestionBankFeedbackAnswerReviewGateAudit(report), /question-bank-feedback answer review gate: READY/u);
  });

  it("fails when 0372 source controlled artifact evidence is not ready", async () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.source0372Report);
    source.readiness = "NEEDS_REMEDIATION";
    source.runtimeSlo.totalErrors = 1;
    inputs.source0372Report = JSON.stringify(source);

    const report = await auditStudentAppAITutorQuestionBankFeedbackAnswerReviewGate(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0372_question_bank_feedback_controlled_artifact_ready").passed, false);
  });

  it("fails when the shared review runtime is not question-bank-feedback aware", async () => {
    const inputs = validInputs();
    inputs.runtime = inputs.runtime.replaceAll("sourceQuestionBankFeedbackArtifactRuntimeId", "sourceArtifactRuntimeId");

    const report = await auditStudentAppAITutorQuestionBankFeedbackAnswerReviewGate(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.accepts_question_bank_feedback_controlled_artifact_for_review").passed, false);
  });

  it("fails when question-bank-feedback review regression tests are absent", async () => {
    const inputs = validInputs();
    inputs.runtimeTest = "records a human review gate without result persistence or student visibility";

    const report = await auditStudentAppAITutorQuestionBankFeedbackAnswerReviewGate(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_question_bank_feedback_answer_review_paths").passed, false);
  });

  it("fails when root hooks do not track 0373", async () => {
    const inputs = validInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = "";
    inputs.architectureBoard = "12.52/10";

    const report = await auditStudentAppAITutorQuestionBankFeedbackAnswerReviewGate(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0373").passed, false);
  });
});

function validInputs() {
  return {
    runtime: [
      "sourceQuestionBankFeedbackArtifactRuntimeId",
      "sourceQuestionBankFeedbackArtifactWorkloadType",
      "student_app_ai_tutor_question_bank_feedback_controlled_answer_artifact",
      "studentAppAiTutorQuestionBankFeedbackControlledAnswerArtifact",
      "learningActionSource: source.learningActionSource",
      "feedbackStatus: source.feedbackStatus",
      "guidanceTextSentToPort: false",
      "studentVisiblePublished: false",
    ].join("\n"),
    runtimeTest: [
      "records a question-bank-feedback-sourced answer review gate without leaking guidance text or feedback ids",
      "unsafeQuestionBankFeedbackSource",
      "learningActionSourceRequired must be QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      "feedbackStatus",
    ].join("\n"),
    source0372Report: JSON.stringify(source0372Report()),
    packageJson: JSON.stringify({
      scripts: {
        "audit:student-app-ai-tutor-question-bank-feedback-answer-review-gate": "node tools/student-app-ai-tutor-question-bank-feedback-answer-review-gate-audit.mjs",
      },
    }),
    qualityGate: "Student App AI Tutor question-bank-feedback answer review gate audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankFeedbackAnswerReviewGate student-app-ai-tutor-question-bank-feedback-answer-review-gate.current.json student_app_ai_tutor_question_bank_feedback_answer_review_gate",
    verifyStructure: "0373-student-app-ai-tutor-question-bank-feedback-answer-review-gate.md student-app-ai-tutor-question-bank-feedback-answer-review-gate-audit.mjs student-app-ai-tutor-question-bank-feedback-answer-review-gate-audit.test.mjs student_app_ai_tutor_question_bank_feedback_answer_review_gate",
    rootTrace: "SDD 0373 student app ai tutor question-bank feedback answer review gate",
    architectureBoard: "12.55/10 STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_ANSWER_REVIEW_GATE_RECORDED",
    sdd: "SDD 0373 Student App AI Tutor Question-Bank Feedback Answer Review Gate",
  };
}

function source0372Report() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_CONTROLLED_ANSWER_ARTIFACT",
    runtime: {
      runtimeId: "student_app_ai_tutor_question_bank_feedback_controlled_answer_artifact",
      sharedRuntimeId: "student_app_ai_tutor_controlled_answer_artifact_runtime",
      commandPort: "StudentAppAITutorControlledAnswerArtifactPort.recordControlledAnswerArtifact",
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_CONTROLLED_ANSWER_ARTIFACT_RECORDED",
    },
    runtimeSlo: { p99Ms: 6, totalErrors: 0 },
    runtimeProbes: {
      studentAppAiTutorQuestionBankFeedbackControlledAnswerArtifact: {
        result: {
          schemaVersion: "2026-06-08.student-app.ai-tutor-controlled-answer-artifact-recorded.v1",
          runtimeId: "student_app_ai_tutor_controlled_answer_artifact_runtime",
          commandPort: "StudentAppAITutorControlledAnswerArtifactPort.recordControlledAnswerArtifact",
          status: "STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RECORDED",
          requestId: "tutor_req_student_app_feedback_001",
          archiveItemId: "tarch_student_feedback_001",
          workerId: "worker_student_tutor_03",
          precheckId: "ai_tutor_model_precheck_feedback_001",
          queueRef: "ai_tutor_model_queue_feedback_001",
          learningActionSource: "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
          feedbackStatus: "READY_FOR_STUDENT_APP_READ",
          controlledAnswerArtifact: {
            artifactId: "ai_tutor_answer_artifact_feedback_001",
            requestId: "tutor_req_student_app_feedback_001",
            workerId: "worker_student_tutor_03",
            precheckId: "ai_tutor_model_precheck_feedback_001",
            queueRef: "ai_tutor_model_queue_feedback_001",
            status: "AI_TUTOR_CONTROLLED_ANSWER_RECORDED_NOT_REVIEWED",
            reviewState: "PENDING_HUMAN_REVIEW",
            summary: "Follow-up help based on reviewed answer feedback.",
            guidanceSections: [
              {
                sectionId: "ai_tutor_answer_section_feedback_001",
                title: "Practice from feedback",
                text: "Restate the feedback in your own words, then solve one similar item.",
                sourceBlockRefs: ["block_score_summary", "block_next_step"],
              },
            ],
            safetyLabels: ["STUDY_GUIDANCE_ONLY", "FOLLOW_UP_REVIEW"],
            resultPersistenceAllowed: false,
            tutoringResultRecorded: false,
            studentVisiblePublished: false,
          },
          boundary: {
            sourceModelExecutionPrecheckRequired: true,
            internalServiceOnly: true,
            controlledAnswerArtifactRecorded: true,
            humanReviewRequiredBeforeResult: true,
            rawModelOutputExcluded: true,
            promptExcluded: true,
            answerKeyExcluded: true,
            tutoringResultRecorded: false,
            resultPersistenceAllowed: false,
            studentVisiblePublished: false,
            directDatabaseAccessAllowed: false,
            executeHttpRequestAllowed: false,
            externalToolUseAllowed: false,
            retrievalAllowed: false,
            swarmAllowed: false,
          },
        },
      },
    },
    safetyInvariants: {
      source0371QuestionBankFeedbackModelPrecheckRequired: true,
      learningActionSourceRequired: "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      internalServiceOnly: true,
      controlledAnswerArtifactRecorded: true,
      humanReviewRequiredBeforeResult: true,
      rawModelOutputExcluded: true,
      promptExcluded: true,
      answerKeyExcluded: true,
      tutoringResultRecorded: false,
      resultPersistenceAllowed: false,
      studentVisiblePublished: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      retrievalAllowed: false,
      swarmAllowed: false,
    },
  };
}
