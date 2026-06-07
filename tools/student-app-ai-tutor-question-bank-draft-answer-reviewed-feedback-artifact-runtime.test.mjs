import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_COMMAND_PORT,
  recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact,
} from "./student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-runtime.mjs";

describe("Student App AI Tutor question-bank draft answer reviewed feedback artifact runtime", () => {
  it("records reviewed feedback artifacts while keeping student publication blocked", () => {
    const result = recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact(baseInput(), {
      commandLogPath: tempLog(),
      generatedAt: "2026-06-06T12:20:00.000Z",
    });

    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_READY_NOT_PUBLISHED");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_COMMAND_PORT);
    assert.equal(result.reviewedFeedbackArtifact.artifactId, "feedback_artifact_qbank_001");
    assert.equal(result.reviewedFeedbackArtifact.learnerFeedback.nextSteps.length, 2);
    assert.equal(result.boundary.feedbackPublicationPrecheckVerified, true);
    assert.equal(result.boundary.humanReviewCompleted, true);
    assert.equal(result.boundary.publicationApproved, false);
    assert.equal(result.boundary.studentVisibleFeedbackPublished, false);
    assert.equal(result.boundary.answerKeyDisclosed, false);
    assert.equal(result.boundary.modelInferenceStarted, false);
  });

  it("uses idempotency for replay and rejects conflicting reviewed feedback artifacts", () => {
    const commandLogPath = tempLog();
    const first = recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact(baseInput(), { commandLogPath });
    const replay = recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact(baseInput(), { commandLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.reviewedFeedbackArtifact.artifactId, first.reviewedFeedbackArtifact.artifactId);

    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact({
        ...baseInput(),
        reviewedFeedbackArtifact: {
          ...baseInput().reviewedFeedbackArtifact,
          learnerFeedback: { ...baseInput().reviewedFeedbackArtifact.learnerFeedback, summary: "different reviewed summary" },
        },
      }, { commandLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects non-human reviewers, unsafe precheck reports, unsafe policy, and publication approval", () => {
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact({
        ...baseInput(),
        principal: { ...baseInput().principal, role: "STUDENT", entryPoint: "STUDENT_APP", scopes: ["STUDENT_OWN_READ"] },
      }, { commandLogPath: tempLog() }),
      /role/u,
    );
    const unsafePrecheck = baseInput();
    unsafePrecheck.feedbackPublicationPrecheckReport.safetyInvariants.studentVisibleFeedbackAllowed = true;
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact(unsafePrecheck, { commandLogPath: tempLog() }),
      /studentVisibleFeedbackAllowed/u,
    );
    for (const field of ["studentVisibleFeedbackAllowed", "publicationApproved", "answerKeyDisclosureAllowed", "modelInferenceAllowed", "executeHttpRequestAllowed", "swarmAllowed"]) {
      assert.throws(
        () => recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact({
          ...baseInput(),
          feedbackArtifactPolicy: { ...baseInput().feedbackArtifactPolicy, [field]: true },
        }, { commandLogPath: tempLog() }),
        new RegExp(field, "u"),
      );
    }
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact({
        ...baseInput(),
        reviewedFeedbackArtifact: { ...baseInput().reviewedFeedbackArtifact, publicationApproved: true },
      }, { commandLogPath: tempLog() }),
      /publicationApproved/u,
    );
  });

  it("rejects leaked answer, worker, result, model, publication, internal error, and unsafe text fields", () => {
    for (const field of ["answerText", "expectedAnswer", "explanation", "resultRef", "workerId", "rawModelOutput", "publishedAt", "errorMessage"]) {
      const input = baseInput();
      input.reviewedFeedbackArtifact[field] = "leak";
      assert.throws(
        () => recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact(input, { commandLogPath: tempLog() }),
        new RegExp(field, "u"),
      );
    }
    const unsafeText = baseInput();
    unsafeText.reviewedFeedbackArtifact.learnerFeedback.summary = "<script>unsafe</script>";
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact(unsafeText, { commandLogPath: tempLog() }),
      /encoded safe text/u,
    );
  });
});

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-reviewed-feedback-artifact-")), "artifact.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact.v1",
    reviewInvocationId: "feedback_artifact_review_001",
    principal: {
      principalId: "teacher_001",
      subjectType: "USER",
      role: "TEACHER",
      entryPoint: "DESKTOP_TEACHER",
      scopes: ["TEACHING_READ", "FEEDBACK_REVIEW"],
      sessionId: "session_teacher_001",
    },
    feedbackPublicationPrecheckReport: feedbackPublicationPrecheckReport(),
    reviewedFeedbackArtifact: {
      artifactId: "feedback_artifact_qbank_001",
      artifactKind: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_ANSWER_REVIEWED_FEEDBACK",
      submissionId: "qbank_ans_sub_feedback_001",
      requestId: "grading_req_feedback_001",
      questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
      tutoringAnalysisRequestId: "tutor_req_student_app_001",
      archiveItemId: "tarch_student_quiz_001",
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
    evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck:qbank_ans_sub_feedback_001"],
    idempotencyKey: "student-app-ai-tutor-reviewed-feedback-artifact:student_001:qbank_ans_sub_feedback_001",
  };
}

function feedbackPublicationPrecheckReport() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_RUNTIME",
    runtime: {
      runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_runtime",
      commandPort: "StudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheckPort.recordFeedbackPublicationPrecheck",
      decision: "BLOCK_UNTIL_REVIEWED_FEEDBACK",
    },
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
          precheckInvocationId: "feedback_pub_precheck_audit_001",
          precheckDecision: {
            feedbackPublicationDecision: "BLOCK_UNTIL_REVIEWED_FEEDBACK",
            studentVisibleFeedbackAllowed: false,
          },
          boundary: {
            feedbackPublicationPrecheckOnly: true,
            studentVisibleFeedbackPublished: false,
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
          evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge:qbank_ans_sub_feedback_001"],
        },
      },
    },
  };
}
