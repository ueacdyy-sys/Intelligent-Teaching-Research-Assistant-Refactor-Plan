import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_PORT,
  recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-runtime.mjs";

describe("Student App AI Tutor question-bank draft answer feedback archive persistence command runtime", () => {
  it("records an append-only feedback archive persistence command without durable commit", () => {
    const result = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand(baseInput(), {
      commandLogPath: tempLog(),
      generatedAt: "2026-06-06T13:30:00.000Z",
    });

    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_PORT);
    assert.equal(result.feedbackArchivePersistenceCommand.commandKind, "STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND");
    assert.equal(result.feedbackArchivePersistenceCommand.commitState, "NOT_COMMITTED_TO_STUDENT_ARCHIVE");
    assert.equal(result.boundary.feedbackArchivePersistenceCommandRecorded, true);
    assert.equal(result.boundary.appendOnlyCommandLogRecorded, true);
    assert.equal(result.boundary.durableStudentArchivePersistenceStarted, false);
    assert.equal(result.boundary.durableStudentArchiveCommitStarted, false);
    assert.equal(result.boundary.studentArchivePersisted, false);
    assert.equal(result.boundary.mainDatabaseWriteStarted, false);
    assert.equal(result.boundary.studentArchiveWriteStarted, false);
  });

  it("uses idempotency for replay and rejects conflicting persistence commands", () => {
    const commandLogPath = tempLog();
    const first = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand(baseInput(), { commandLogPath });
    const replay = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand(baseInput(), { commandLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.feedbackArchivePersistenceCommand.commandId, first.feedbackArchivePersistenceCommand.commandId);

    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand({
        ...baseInput(),
        feedbackArchivePersistenceRequest: {
          ...baseInput().feedbackArchivePersistenceRequest,
          commandId: "feedback_archive_cmd_qbank_conflict",
        },
      }, { commandLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects unsafe principals, unsafe delivery reports, unsafe policies, and mismatches", () => {
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand({
        ...baseInput(),
        principal: { ...baseInput().principal, scopes: ["TEACHING_READ", "STUDENT_APP_DELIVERY"] },
      }, { commandLogPath: tempLog() }),
      /STUDENT_ARCHIVE_WRITE/u,
    );

    const unsafeReport = baseInput();
    unsafeReport.feedbackDeliveryEnvelopeReport.runtime.status = "BLOCKED";
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand(unsafeReport, { commandLogPath: tempLog() }),
      /STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED/u,
    );

    for (const field of ["mainDatabaseWriteAllowed", "studentArchiveWriteAllowed", "durableArchiveCommitAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "swarmAllowed"]) {
      assert.throws(
        () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand({
          ...baseInput(),
          feedbackArchivePersistencePolicy: { ...baseInput().feedbackArchivePersistencePolicy, [field]: true },
        }, { commandLogPath: tempLog() }),
        new RegExp(field, "u"),
      );
    }

    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand({
        ...baseInput(),
        feedbackArchivePersistenceRequest: { ...baseInput().feedbackArchivePersistenceRequest, deliveryEnvelopeId: "feedback_delivery_env_other" },
      }, { commandLogPath: tempLog() }),
      /deliveryEnvelopeId/u,
    );
  });

  it("rejects leaked answer, worker, result, model, commit, internal error, and unsafe text fields", () => {
    for (const field of ["answerText", "expectedAnswer", "explanation", "resultRef", "workerId", "rawModelOutput", "archiveCommitResult", "errorMessage"]) {
      const input = baseInput();
      input.feedbackDeliveryEnvelopeReport.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope.result.studentFeedbackDeliveryEnvelope[field] = "leak";
      assert.throws(
        () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand(input, { commandLogPath: tempLog() }),
        new RegExp(field, "u"),
      );
    }

    const unsafeText = baseInput();
    unsafeText.feedbackDeliveryEnvelopeReport.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope.result.studentFeedbackDeliveryEnvelope.learnerFeedback.encouragement = "<b>unsafe</b>";
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand(unsafeText, { commandLogPath: tempLog() }),
      /encoded safe text/u,
    );
  });
});

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-feedback-archive-persistence-")), "persistence.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command.v1",
    persistenceInvocationId: "feedback_archive_persist_001",
    principal: {
      principalId: "student_archive_persistence_runtime_001",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "STUDENT_ARCHIVE_PERSISTENCE_RUNTIME",
      scopes: ["TEACHING_READ", "STUDENT_ARCHIVE_WRITE", "STUDENT_APP_DELIVERY"],
      sessionId: "session_student_archive_persistence_001",
    },
    feedbackDeliveryEnvelopeReport: deliveryReport(),
    feedbackArchivePersistenceRequest: {
      commandId: "feedback_archive_cmd_qbank_001",
      persistenceMode: "APPEND_ONLY_STUDENT_ARCHIVE_COMMAND",
      targetArchiveKind: "STUDENT_AI_TUTOR_FEEDBACK_ARCHIVE",
      desiredArchiveState: "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
      scopeRef: "student:student_001",
      deliveryEnvelopeRecordId: "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_001",
      deliveryEnvelopeId: "feedback_delivery_env_qbank_001",
      approvedFeedbackArtifactId: "feedback_artifact_qbank_001",
      submissionId: "qbank_ans_sub_feedback_001",
      requestId: "grading_req_feedback_001",
      questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
      tutoringAnalysisRequestId: "tutor_req_student_app_001",
      archiveItemId: "tarch_student_quiz_001",
    },
    feedbackArchivePersistencePolicy: {
      feedbackDeliveryEnvelopeRequired: true,
      appendOnlyCommandLogRequired: true,
      studentOwnScopeRequired: true,
      preserveApprovalEvidenceRequired: true,
      preserveLearnerFeedbackRequired: true,
      futureDurableArchiveCommitReviewRequired: true,
      directDatabaseAccessAllowed: false,
      mainDatabaseWriteAllowed: false,
      studentArchiveWriteAllowed: false,
      durableArchiveCommitAllowed: false,
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
    evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope:qbank_ans_sub_feedback_001"],
    idempotencyKey: "student-app-ai-tutor-feedback-archive-persistence:student_001:qbank_ans_sub_feedback_001",
  };
}

function deliveryReport() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_RUNTIME",
    runtime: {
      runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_runtime",
      status: "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED",
    },
    safetyInvariants: {
      publicationApprovalRequired: true,
      safeLearnerFeedbackRequired: true,
      studentDeliveryEnvelopeAllowed: true,
      studentVisibleFeedbackAllowed: true,
      studentOwnScopeRequired: true,
      studentVisibleFeedbackDeliveryEnvelopeCreated: true,
      durableStudentArchivePersistenceStarted: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
      answerKeyDisclosureAllowed: false,
      workerMetadataDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      modelInferenceAllowed: false,
      futureDurableArchivePersistenceReviewRequired: true,
    },
    runtimeProbes: {
      studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope: {
        result: {
          recordId: "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_001",
          runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_runtime",
          status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_READY_NOT_PERSISTED",
          deliveryInvocationId: "feedback_delivery_001",
          sourcePublicationApproval: {
            runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_runtime",
            recordId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_001",
            approvalId: "feedback_publication_approval_qbank_001",
            approvedFeedbackArtifactId: "feedback_artifact_qbank_001",
          },
          studentFeedbackDeliveryEnvelope: {
            envelopeId: "feedback_delivery_env_qbank_001",
            envelopeKind: "STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE",
            deliveryMode: "STUDENT_APP_RENDERABLE_FEEDBACK_ENVELOPE",
            channel: "STUDENT_APP",
            audience: "STUDENT_APP_LEARNING_SUPPORT",
            visibilityState: "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED",
            deliveryState: "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED",
            scopeRef: "student:student_001",
            approvalRecordId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_001",
            approvalId: "feedback_publication_approval_qbank_001",
            approvedFeedbackArtifactId: "feedback_artifact_qbank_001",
            submissionId: "qbank_ans_sub_feedback_001",
            requestId: "grading_req_feedback_001",
            questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
            tutoringAnalysisRequestId: "tutor_req_student_app_001",
            archiveItemId: "tarch_student_quiz_001",
            scoreSummary: "Score 93. The student can compare simple fractions.",
            learnerFeedback: {
              summary: "You understand the main comparison idea, but one fraction-order step still needs practice.",
              encouragement: "Keep the denominator comparison habit and slow down on the final ordering step.",
              nextSteps: ["Review how to compare fractions with unlike denominators.", "Try three short practice questions before the next quiz."],
              misconceptionTags: ["fraction-order"],
              practiceSuggestions: ["Practice two visual fraction bar questions."],
            },
            evidencePreserved: true,
            approvalPreserved: true,
            studentOwnScopeEnforced: true,
          },
          boundary: {
            studentVisibleFeedbackDeliveryEnvelopeCreated: true,
            studentVisibleFeedbackDelivered: true,
            studentOwnScopeEnforced: true,
            durableStudentArchivePersistenceStarted: false,
            mainDatabaseWriteStarted: false,
            studentArchiveWriteStarted: false,
          },
          evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-input-hash:abc"],
        },
      },
    },
  };
}
