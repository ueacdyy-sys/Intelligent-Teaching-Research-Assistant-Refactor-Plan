import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_COMMAND_PORT,
  recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-runtime.mjs";

describe("Student App AI Tutor question-bank draft answer feedback delivery envelope runtime", () => {
  it("records a student-visible feedback envelope while keeping durable persistence blocked", () => {
    const result = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope(baseInput(), {
      commandLogPath: tempLog(),
      generatedAt: "2026-06-06T13:10:00.000Z",
    });

    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_READY_NOT_PERSISTED");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_COMMAND_PORT);
    assert.equal(result.studentFeedbackDeliveryEnvelope.envelopeKind, "STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE");
    assert.equal(result.studentFeedbackDeliveryEnvelope.visibilityState, "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED");
    assert.equal(result.studentFeedbackDeliveryEnvelope.deliveryState, "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED");
    assert.equal(result.boundary.studentVisibleFeedbackDeliveryEnvelopeCreated, true);
    assert.equal(result.boundary.studentVisibleFeedbackPublished, true);
    assert.equal(result.boundary.durableStudentArchivePersistenceStarted, false);
    assert.equal(result.boundary.mainDatabaseWriteStarted, false);
    assert.equal(result.boundary.studentArchiveWriteStarted, false);
    assert.equal(result.boundary.modelInferenceStarted, false);
  });

  it("uses idempotency for replay and rejects conflicting delivery envelopes", () => {
    const commandLogPath = tempLog();
    const first = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope(baseInput(), { commandLogPath });
    const replay = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope(baseInput(), { commandLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.studentFeedbackDeliveryEnvelope.envelopeId, first.studentFeedbackDeliveryEnvelope.envelopeId);

    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope({
        ...baseInput(),
        feedbackDeliveryRequest: {
          ...baseInput().feedbackDeliveryRequest,
          scopeRef: "student:student_002",
        },
      }, { commandLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects unsafe principals, unapproved reports, unsafe policies, and delivery mismatches", () => {
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope({
        ...baseInput(),
        principal: { ...baseInput().principal, role: "STUDENT", subjectType: "USER", entryPoint: "STUDENT_APP" },
      }, { commandLogPath: tempLog() }),
      /subjectType/u,
    );

    const unsafeReport = baseInput();
    unsafeReport.feedbackPublicationApprovalReport.runtime.status = "READY_NOT_PUBLISHED";
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope(unsafeReport, { commandLogPath: tempLog() }),
      /APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED/u,
    );

    for (const field of ["mainDatabaseWriteAllowed", "studentArchiveWriteAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "swarmAllowed"]) {
      assert.throws(
        () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope({
          ...baseInput(),
          feedbackDeliveryPolicy: { ...baseInput().feedbackDeliveryPolicy, [field]: true },
        }, { commandLogPath: tempLog() }),
        new RegExp(field, "u"),
      );
    }

    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope({
        ...baseInput(),
        feedbackDeliveryRequest: { ...baseInput().feedbackDeliveryRequest, approvedFeedbackArtifactId: "feedback_artifact_other" },
      }, { commandLogPath: tempLog() }),
      /approvedFeedbackArtifactId/u,
    );
  });

  it("rejects leaked answer, worker, result, model, persistence, internal error, and unsafe text fields", () => {
    for (const field of ["answerText", "expectedAnswer", "explanation", "resultRef", "workerId", "rawModelOutput", "databaseWriteResult", "errorMessage"]) {
      const input = baseInput();
      input.feedbackPublicationApprovalReport.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApproval.result.approvedFeedbackArtifact[field] = "leak";
      assert.throws(
        () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope(input, { commandLogPath: tempLog() }),
        new RegExp(field, "u"),
      );
    }

    const unsafeText = baseInput();
    unsafeText.feedbackPublicationApprovalReport.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApproval.result.approvedFeedbackArtifact.learnerFeedback.summary = "<script>unsafe</script>";
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope(unsafeText, { commandLogPath: tempLog() }),
      /encoded safe text/u,
    );
  });
});

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-feedback-delivery-envelope-")), "delivery.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-feedback-delivery-envelope.v1",
    deliveryInvocationId: "feedback_delivery_001",
    principal: {
      principalId: "student_delivery_runtime_001",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "STUDENT_DELIVERY_RUNTIME",
      scopes: ["TEACHING_READ", "STUDENT_DELIVERY_ENVELOPE", "STUDENT_APP_DELIVERY"],
      sessionId: "session_student_delivery_001",
    },
    feedbackPublicationApprovalReport: approvalReport(),
    feedbackDeliveryRequest: {
      envelopeId: "feedback_delivery_env_qbank_001",
      deliveryMode: "STUDENT_APP_RENDERABLE_FEEDBACK_ENVELOPE",
      channel: "STUDENT_APP",
      audienceKind: "STUDENT_APP_LEARNING_SUPPORT",
      visibilityState: "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED",
      scopeRef: "student:student_001",
      approvalRecordId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_001",
      approvalId: "feedback_publication_approval_qbank_001",
      approvedFeedbackArtifactId: "feedback_artifact_qbank_001",
      submissionId: "qbank_ans_sub_feedback_001",
      requestId: "grading_req_feedback_001",
      questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
      tutoringAnalysisRequestId: "tutor_req_student_app_001",
      archiveItemId: "tarch_student_quiz_001",
      studentOwnScopeConfirmed: true,
    },
    feedbackDeliveryPolicy: {
      publicationApprovalRequired: true,
      studentDeliveryEnvelopeAllowed: true,
      studentVisibleFeedbackAllowed: true,
      studentOwnScopeRequired: true,
      safeLearnerFeedbackRequired: true,
      futureDurableArchivePersistenceReviewRequired: true,
      directDatabaseAccessAllowed: false,
      mainDatabaseWriteAllowed: false,
      studentArchiveWriteAllowed: false,
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
    evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval:qbank_ans_sub_feedback_001"],
    idempotencyKey: "student-app-ai-tutor-feedback-delivery-envelope:student_001:qbank_ans_sub_feedback_001",
  };
}

function approvalReport() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_RUNTIME",
    runtime: {
      runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_runtime",
      status: "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED",
    },
    safetyInvariants: {
      reviewedFeedbackArtifactRequired: true,
      safeStudentResultRequired: true,
      humanReviewRequired: true,
      humanPublicationApprovalRequired: true,
      approvedForStudentVisibleDelivery: true,
      futureStudentVisibleDeliveryRuntimeRequired: true,
      studentVisibleFeedbackPublished: false,
      studentVisibleDeliveryEnvelopeCreated: false,
      durableStudentArchivePersistenceStarted: false,
      answerKeyDisclosureAllowed: false,
      workerMetadataDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      modelInferenceAllowed: false,
    },
    runtimeProbes: {
      studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApproval: {
        result: {
          recordId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_001",
          runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_runtime",
          status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED",
          approvalInvocationId: "feedback_publication_approval_001",
          approval: {
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
            learnerFeedbackReviewed: true,
            ageAppropriateConfirmed: true,
            studentOwnScopeConfirmed: true,
            answerKeyDisclosureBlocked: true,
            workerMetadataDisclosureBlocked: true,
            rawModelOutputDisclosureBlocked: true,
            internalErrorsDisclosureBlocked: true,
            futureStudentVisibleDeliveryRuntimeRequired: true,
          },
          approvedFeedbackArtifact: {
            artifactId: "feedback_artifact_qbank_001",
            artifactKind: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_ANSWER_REVIEWED_FEEDBACK",
            submissionId: "qbank_ans_sub_feedback_001",
            requestId: "grading_req_feedback_001",
            questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
            tutoringAnalysisRequestId: "tutor_req_student_app_001",
            archiveItemId: "tarch_student_quiz_001",
            audience: "STUDENT_APP_LEARNING_SUPPORT",
            previousVisibilityState: "REVIEWED_NOT_PUBLISHED",
            approvalState: "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED",
            scoreSummary: "Score 93. The student can compare simple fractions.",
            learnerFeedback: {
              summary: "You understand the main comparison idea, but one fraction-order step still needs practice.",
              encouragement: "Keep the denominator comparison habit and slow down on the final ordering step.",
              nextSteps: ["Review how to compare fractions with unlike denominators.", "Try three short practice questions before the next quiz."],
              misconceptionTags: ["fraction-order"],
              practiceSuggestions: ["Practice two visual fraction bar questions."],
            },
          },
          boundary: {
            publicationApprovalGranted: true,
            approvedForStudentVisibleDelivery: true,
            requiresFutureStudentVisibleDeliveryRuntime: true,
            studentVisibleFeedbackPublished: false,
            studentVisibleDeliveryEnvelopeCreated: false,
            durableStudentArchivePersistenceStarted: false,
          },
          evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-input-hash:abc"],
        },
      },
    },
  };
}
