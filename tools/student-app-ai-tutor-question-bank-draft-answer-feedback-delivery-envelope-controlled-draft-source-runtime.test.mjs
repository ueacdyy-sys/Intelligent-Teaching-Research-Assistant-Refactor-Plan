import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE_COMMAND_PORT,
  formatStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource,
  recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source-runtime.mjs";

describe("Student App AI Tutor question-bank draft answer feedback delivery envelope from controlled draft source runtime", () => {
  it("records a student-visible feedback envelope from 0297 controlled-source approval while persistence remains blocked", () => {
    const result = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource(baseInput(), {
      commandLogPath: tempLog(),
      generatedAt: "2026-06-07T04:25:00.000Z",
    });

    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE_COMMAND_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_READY_NOT_PERSISTED");
    assert.equal(result.sourcePublicationApproval.controlledDraftSourceVerified, true);
    assert.equal(result.sourceControlledFeedbackDraft.artifactId, approvalResult().sourceControlledFeedbackDraft.artifactId);
    assert.equal(result.studentFeedbackDeliveryEnvelope.envelopeKind, "STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE");
    assert.equal(result.studentFeedbackDeliveryEnvelope.sourceControlledDraft.artifactId, approvalResult().sourceControlledFeedbackDraft.artifactId);
    assert.equal(result.studentFeedbackDeliveryEnvelope.visibilityState, "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_NOT_PERSISTED");
    assert.equal(result.studentFeedbackDeliveryEnvelope.deliveryState, "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED");
    assert.equal(result.boundary.controlledDraftSourceVerified, true);
    assert.equal(result.boundary.sourceControlledDraftEvidencePreserved, true);
    assert.equal(result.boundary.studentVisibleFeedbackDeliveryEnvelopeCreated, true);
    assert.equal(result.boundary.studentVisibleFeedbackPublished, true);
    assert.equal(result.boundary.durableStudentArchivePersistenceStarted, false);
    assert.equal(result.boundary.mainDatabaseWriteStarted, false);
    assert.equal(result.boundary.studentArchiveWriteStarted, false);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource(result), /Persisted: false/u);
  });

  it("uses idempotency for replay and rejects conflicting controlled-source delivery envelopes", () => {
    const commandLogPath = tempLog();
    const first = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource(baseInput(), { commandLogPath });
    const replay = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource(baseInput(), { commandLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = clone(baseInput());
    conflicting.feedbackDeliveryRequest.scopeRef = "student:student_002";
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource(conflicting, { commandLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects unsafe principals, unsafe 0297 approval reports, unsafe policies, and delivery mismatches", () => {
    const unsafePrincipal = clone(baseInput());
    unsafePrincipal.principal.subjectType = "USER";
    unsafePrincipal.principal.role = "STUDENT";
    unsafePrincipal.principal.entryPoint = "STUDENT_APP";
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource(unsafePrincipal, { commandLogPath: tempLog() }),
      /input\.principal\.subjectType/u,
    );

    const unsafeApproval = clone(baseInput());
    unsafeApproval.feedbackPublicationApprovalControlledDraftSourceReport.runtime.status = "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED";
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource(unsafeApproval, { commandLogPath: tempLog() }),
      /APPROVED_FROM_CONTROLLED_DRAFT_SOURCE_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED/u,
    );

    for (const field of ["mainDatabaseWriteAllowed", "studentArchiveWriteAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "swarmAllowed"]) {
      const input = clone(baseInput());
      input.feedbackDeliveryPolicy[field] = true;
      assert.throws(
        () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource(input, { commandLogPath: tempLog() }),
        new RegExp(`${field} must be false`, "u"),
      );
    }

    const mismatch = clone(baseInput());
    mismatch.feedbackDeliveryRequest.sourceControlledDraftArtifactId = "feedback_controlled_draft_other";
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource(mismatch, { commandLogPath: tempLog() }),
      /sourceControlledDraftArtifactId/u,
    );
  });

  it("rejects leaked answer, worker, result, model, persistence, internal error, and unsafe text fields", () => {
    for (const field of ["answerText", "expectedAnswer", "explanation", "resultRef", "workerId", "rawModelOutput", "databaseWriteResult", "errorMessage"]) {
      const input = clone(baseInput());
      input.feedbackPublicationApprovalControlledDraftSourceReport.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource.result.approvedFeedbackArtifact[field] = "leak";
      assert.throws(
        () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource(input, { commandLogPath: tempLog() }),
        new RegExp(field, "u"),
      );
    }

    const unsafeText = clone(baseInput());
    unsafeText.feedbackPublicationApprovalControlledDraftSourceReport.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource.result.approvedFeedbackArtifact.learnerFeedback.summary = "The answer key is hidden here.";
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource(unsafeText, { commandLogPath: tempLog() }),
      /answer keys/u,
    );
  });

  it("rejects missing controlled-source delivery evidence", () => {
    const input = clone(baseInput());
    input.evidenceRefs = [
      "evidence:feedback-publication-approval-controlled-draft-source:feedback_publication_approval_controlled_draft_qbank_001",
      "evidence:other",
    ];

    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource(input, { commandLogPath: tempLog() }),
      /feedback-delivery-envelope-controlled-draft-source evidence ref is required/u,
    );
  });
});

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-feedback-delivery-envelope-controlled-source-")), "delivery.jsonl");
}

function baseInput() {
  const approval = approvalResult();
  const artifact = approval.approvedFeedbackArtifact;
  const draft = approval.sourceControlledFeedbackDraft;
  return {
    schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source.v1",
    deliveryInvocationId: "feedback_delivery_controlled_draft_001",
    principal: {
      principalId: "student_delivery_runtime_001",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "STUDENT_DELIVERY_RUNTIME",
      scopes: ["TEACHING_READ", "STUDENT_DELIVERY_ENVELOPE", "STUDENT_APP_DELIVERY"],
      sessionId: "session_student_delivery_001",
    },
    feedbackPublicationApprovalControlledDraftSourceReport: approvalReport(),
    feedbackDeliveryRequest: {
      envelopeId: "feedback_delivery_env_controlled_draft_qbank_001",
      deliveryMode: "STUDENT_APP_RENDERABLE_FEEDBACK_ENVELOPE",
      channel: "STUDENT_APP",
      audienceKind: "STUDENT_APP_LEARNING_SUPPORT",
      visibilityState: "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_NOT_PERSISTED",
      scopeRef: "student:student_001",
      approvalRecordId: approval.recordId,
      approvalId: approval.approval.approvalId,
      sourceControlledDraftArtifactId: draft.artifactId,
      approvedFeedbackArtifactId: artifact.artifactId,
      submissionId: artifact.submissionId,
      requestId: artifact.requestId,
      questionBankDraftRef: artifact.questionBankDraftRef,
      tutoringAnalysisRequestId: artifact.tutoringAnalysisRequestId,
      archiveItemId: artifact.archiveItemId,
      studentOwnScopeConfirmed: true,
      controlledDraftSourceVerified: true,
    },
    feedbackDeliveryPolicy: {
      publicationApprovalControlledDraftSourceRequired: true,
      controlledDraftSourceRequired: true,
      studentDeliveryEnvelopeAllowed: true,
      studentVisibleFeedbackAllowed: true,
      studentOwnScopeRequired: true,
      safeLearnerFeedbackRequired: true,
      sourceControlledDraftEvidencePreserved: true,
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
    evidenceRefs: [
      `evidence:feedback-publication-approval-controlled-draft-source:${approval.approval.approvalId}`,
      `evidence:feedback-delivery-envelope-controlled-draft-source:${artifact.submissionId}`,
    ],
    idempotencyKey: `student-app-ai-tutor-feedback-delivery-envelope-controlled-draft-source:student_001:${artifact.submissionId}`,
  };
}

function approvalReport() {
  return JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source.current.json", "utf8"));
}

function approvalResult() {
  return approvalReport().runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource.result;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
