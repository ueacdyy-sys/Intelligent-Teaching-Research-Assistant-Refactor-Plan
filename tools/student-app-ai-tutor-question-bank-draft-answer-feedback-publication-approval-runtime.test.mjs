import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_COMMAND_PORT,
  recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApproval,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-runtime.mjs";

describe("Student App AI Tutor question-bank draft answer feedback publication approval runtime", () => {
  it("records publication approval while keeping delivery, persistence, and publication blocked", () => {
    const result = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApproval(baseInput(), {
      commandLogPath: tempLog(),
      generatedAt: "2026-06-06T12:35:00.000Z",
    });

    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_COMMAND_PORT);
    assert.equal(result.approval.decision, "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY");
    assert.equal(result.approvedFeedbackArtifact.approvalState, "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED");
    assert.equal(result.boundary.publicationApprovalGranted, true);
    assert.equal(result.boundary.approvedForStudentVisibleDelivery, true);
    assert.equal(result.boundary.studentVisibleFeedbackPublished, false);
    assert.equal(result.boundary.studentVisibleDeliveryEnvelopeCreated, false);
    assert.equal(result.boundary.durableStudentArchivePersistenceStarted, false);
    assert.equal(result.boundary.modelInferenceStarted, false);
  });

  it("uses idempotency for replay and rejects conflicting publication approval input", () => {
    const commandLogPath = tempLog();
    const first = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApproval(baseInput(), { commandLogPath });
    const replay = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApproval(baseInput(), { commandLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.approval.approvalId, first.approval.approvalId);

    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApproval({
        ...baseInput(),
        feedbackPublicationApproval: {
          ...baseInput().feedbackPublicationApproval,
          comments: "Different approval note with the same idempotency key.",
        },
      }, { commandLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects unauthorized approvers, unsafe reviewed artifacts, unsafe policy, and direct delivery attempts", () => {
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApproval({
        ...baseInput(),
        principal: { ...baseInput().principal, role: "STUDENT", entryPoint: "STUDENT_APP", scopes: ["STUDENT_OWN_READ"] },
      }, { commandLogPath: tempLog() }),
      /role/u,
    );

    const unsafeReport = baseInput();
    unsafeReport.reviewedFeedbackArtifactReport.runtime.status = "PUBLISHED";
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApproval(unsafeReport, { commandLogPath: tempLog() }),
      /READY_NOT_PUBLISHED/u,
    );

    for (const field of ["studentVisibleFeedbackPublished", "studentVisibleDeliveryEnvelopeCreated", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "swarmAllowed"]) {
      assert.throws(
        () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApproval({
          ...baseInput(),
          feedbackPublicationApprovalPolicy: { ...baseInput().feedbackPublicationApprovalPolicy, [field]: true },
        }, { commandLogPath: tempLog() }),
        new RegExp(field, "u"),
      );
    }

    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApproval({
        ...baseInput(),
        feedbackPublicationApproval: { ...baseInput().feedbackPublicationApproval, studentVisibleFeedbackPublished: true },
      }, { commandLogPath: tempLog() }),
      /studentVisibleFeedbackPublished/u,
    );
  });

  it("rejects leaked answer, worker, result, model, delivery, internal error, and unsafe text fields", () => {
    for (const field of ["answerText", "expectedAnswer", "explanation", "resultRef", "workerId", "rawModelOutput", "deliveredAt", "errorMessage"]) {
      const input = baseInput();
      input.reviewedFeedbackArtifactReport.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifact.result.reviewedFeedbackArtifact[field] = "leak";
      assert.throws(
        () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApproval(input, { commandLogPath: tempLog() }),
        new RegExp(field, "u"),
      );
    }

    const unsafeText = baseInput();
    unsafeText.feedbackPublicationApproval.comments = "<script>unsafe</script>";
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApproval(unsafeText, { commandLogPath: tempLog() }),
      /encoded safe text/u,
    );
  });
});

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-feedback-publication-approval-")), "approval.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-feedback-publication-approval.v1",
    approvalInvocationId: "feedback_publication_approval_001",
    principal: {
      principalId: "teacher_001",
      subjectType: "USER",
      role: "TEACHER",
      entryPoint: "DESKTOP_TEACHER",
      scopes: ["TEACHING_READ", "FEEDBACK_PUBLISH_APPROVE"],
      sessionId: "session_teacher_001",
    },
    reviewedFeedbackArtifactReport: reviewedFeedbackArtifactReport(),
    feedbackPublicationApproval: {
      approvalId: "feedback_publication_approval_qbank_001",
      reviewerPrincipalId: "teacher_001",
      decision: "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY",
      reviewedAt: "2026-06-06T12:34:00.000Z",
      reviewedFeedbackArtifactId: "feedback_artifact_qbank_001",
      submissionId: "qbank_ans_sub_feedback_001",
      requestId: "grading_req_feedback_001",
      questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
      tutoringAnalysisRequestId: "tutor_req_student_app_001",
      archiveItemId: "tarch_student_quiz_001",
      reviewedFeedbackArtifactVerified: true,
      learnerFeedbackReviewed: true,
      ageAppropriateConfirmed: true,
      studentOwnScopeConfirmed: true,
      answerKeyDisclosureBlocked: true,
      workerMetadataDisclosureBlocked: true,
      rawModelOutputDisclosureBlocked: true,
      internalErrorsDisclosureBlocked: true,
      futureStudentVisibleDeliveryRuntimeRequired: true,
      studentVisibleFeedbackPublished: false,
      studentVisibleDeliveryEnvelopeCreated: false,
      databaseWriteApproved: false,
      modelInferenceApproved: false,
      remoteDeviceControlApproved: false,
      localToolMutationApproved: false,
      swarmApproved: false,
      comments: "Approved for a future Student App delivery runtime after human feedback review.",
    },
    feedbackPublicationApprovalPolicy: {
      reviewedFeedbackArtifactRequired: true,
      humanPublicationApprovalRequired: true,
      safeStudentResultRequired: true,
      studentOwnScopeRequired: true,
      futureStudentVisibleDeliveryRuntimeRequired: true,
      approvalEvidenceRequired: true,
      studentVisibleFeedbackPublished: false,
      studentVisibleDeliveryEnvelopeCreated: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      modelInferenceAllowed: false,
      answerKeyDisclosureAllowed: false,
      workerMetadataDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact:qbank_ans_sub_feedback_001"],
    idempotencyKey: "student-app-ai-tutor-feedback-publication-approval:student_001:qbank_ans_sub_feedback_001",
  };
}

function reviewedFeedbackArtifactReport() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_RUNTIME",
    runtime: {
      runtimeId: "student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_runtime",
      commandPort: "StudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactPort.recordReviewedFeedbackArtifact",
      sourceFeedbackPublicationPrecheckRuntime: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_runtime",
      status: "READY_NOT_PUBLISHED",
    },
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
    runtimeProbes: {
      studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifact: {
        result: {
          recordId: "student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_001",
          runtimeId: "student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_runtime",
          status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_READY_NOT_PUBLISHED",
          reviewInvocationId: "feedback_artifact_review_001",
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
            scoreSummary: "Score 93. The student can compare simple fractions.",
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
            publicationApproved: false,
            studentVisibleFeedbackPublished: false,
          },
          boundary: {
            humanReviewCompleted: true,
            publicationApprovalRequired: true,
            publicationApproved: false,
            studentVisibleFeedbackPublished: false,
          },
          evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-input-hash:abc"],
        },
      },
    },
  };
}
