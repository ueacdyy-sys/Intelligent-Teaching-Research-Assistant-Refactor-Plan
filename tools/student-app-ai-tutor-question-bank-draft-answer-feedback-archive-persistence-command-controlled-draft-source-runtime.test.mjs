import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE_PORT,
  formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource,
  recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source-runtime.mjs";

describe("Student App AI Tutor question-bank draft answer feedback archive persistence command controlled draft source runtime", () => {
  it("records an append-only archive persistence command from the 0298 controlled-source delivery envelope without durable commit", () => {
    const result = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource(baseInput(), {
      commandLogPath: tempLog(),
      generatedAt: "2026-06-07T05:20:00.000Z",
    });

    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE_PORT);
    assert.equal(result.feedbackArchivePersistenceCommand.commandKind, "STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE");
    assert.equal(result.feedbackArchivePersistenceCommand.desiredArchiveState, "PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED");
    assert.equal(result.feedbackArchivePersistenceCommand.commitState, "NOT_COMMITTED_TO_STUDENT_ARCHIVE");
    assert.equal(result.sourceControlledFeedbackDraft.artifactId, deliveryResult().sourceControlledFeedbackDraft.artifactId);
    assert.equal(result.feedbackArchivePersistenceCommand.sourceControlledDraft.artifactId, deliveryResult().studentFeedbackDeliveryEnvelope.sourceControlledDraft.artifactId);
    assert.equal(result.boundary.feedbackDeliveryEnvelopeControlledDraftSourceVerified, true);
    assert.equal(result.boundary.controlledDraftSourceVerified, true);
    assert.equal(result.boundary.sourceControlledDraftEvidencePreserved, true);
    assert.equal(result.boundary.feedbackArchivePersistenceCommandRecorded, true);
    assert.equal(result.boundary.appendOnlyCommandLogRecorded, true);
    assert.equal(result.boundary.durableStudentArchivePersistenceStarted, false);
    assert.equal(result.boundary.durableStudentArchiveCommitStarted, false);
    assert.equal(result.boundary.studentArchivePersisted, false);
    assert.equal(result.boundary.mainDatabaseWriteStarted, false);
    assert.equal(result.boundary.studentArchiveWriteStarted, false);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource(result), /Committed: false/u);
  });

  it("uses idempotency for replay and rejects conflicting controlled-source persistence commands", () => {
    const commandLogPath = tempLog();
    const first = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource(baseInput(), { commandLogPath });
    const replay = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource(baseInput(), { commandLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.feedbackArchivePersistenceCommand.commandId, first.feedbackArchivePersistenceCommand.commandId);
    assert.equal(fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = clone(baseInput());
    conflicting.feedbackArchivePersistenceRequest.commandId = "feedback_archive_cmd_controlled_draft_conflict";
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource(conflicting, { commandLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects unsafe principals, unsafe 0298 delivery reports, unsafe policies, and controlled-source mismatches", () => {
    const unsafePrincipal = clone(baseInput());
    unsafePrincipal.principal.scopes = ["TEACHING_READ", "STUDENT_APP_DELIVERY"];
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource(unsafePrincipal, { commandLogPath: tempLog() }),
      /STUDENT_ARCHIVE_WRITE/u,
    );

    const unsafeReport = clone(baseInput());
    unsafeReport.feedbackDeliveryEnvelopeControlledDraftSourceReport.runtime.status = "PERSISTED";
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource(unsafeReport, { commandLogPath: tempLog() }),
      /STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_NOT_PERSISTED/u,
    );

    for (const field of ["mainDatabaseWriteAllowed", "studentArchiveWriteAllowed", "durableArchiveCommitAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "swarmAllowed"]) {
      const input = clone(baseInput());
      input.feedbackArchivePersistencePolicy[field] = true;
      assert.throws(
        () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource(input, { commandLogPath: tempLog() }),
        new RegExp(`${field} must be false`, "u"),
      );
    }

    const mismatch = clone(baseInput());
    mismatch.feedbackArchivePersistenceRequest.sourceControlledDraftArtifactId = "feedback_controlled_draft_other";
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource(mismatch, { commandLogPath: tempLog() }),
      /sourceControlledDraftArtifactId/u,
    );
  });

  it("rejects leaked answer, worker, result, model, commit, internal error, and unsafe feedback text", () => {
    for (const field of ["answerText", "expectedAnswer", "explanation", "resultRef", "workerId", "rawModelOutput", "archiveCommitResult", "errorMessage"]) {
      const input = clone(baseInput());
      input.feedbackDeliveryEnvelopeControlledDraftSourceReport.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource.result.studentFeedbackDeliveryEnvelope[field] = "leak";
      assert.throws(
        () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource(input, { commandLogPath: tempLog() }),
        new RegExp(field, "u"),
      );
    }

    const unsafeText = clone(baseInput());
    unsafeText.feedbackDeliveryEnvelopeControlledDraftSourceReport.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource.result.studentFeedbackDeliveryEnvelope.learnerFeedback.encouragement = "<b>unsafe</b>";
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource(unsafeText, { commandLogPath: tempLog() }),
      /encoded safe learner feedback text/u,
    );
  });

  it("rejects missing 0298 delivery and 0299 command evidence refs", () => {
    const input = clone(baseInput());
    input.evidenceRefs = [
      "evidence:feedback-delivery-envelope-controlled-draft-source:qbank_ans_sub_audit_001",
      "evidence:other",
    ];

    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource(input, { commandLogPath: tempLog() }),
      /feedback-archive-persistence-command-controlled-draft-source evidence ref is required/u,
    );
  });
});

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-feedback-archive-persistence-controlled-source-")), "persistence.jsonl");
}

function baseInput() {
  const delivery = deliveryResult();
  const envelope = delivery.studentFeedbackDeliveryEnvelope;
  return {
    schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source.v1",
    persistenceInvocationId: "feedback_archive_persist_controlled_draft_001",
    principal: {
      principalId: "student_archive_persistence_runtime_001",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "STUDENT_ARCHIVE_PERSISTENCE_RUNTIME",
      scopes: ["TEACHING_READ", "STUDENT_ARCHIVE_WRITE", "STUDENT_APP_DELIVERY"],
      sessionId: "session_student_archive_persistence_001",
    },
    feedbackDeliveryEnvelopeControlledDraftSourceReport: deliveryReport(),
    feedbackArchivePersistenceRequest: {
      commandId: "feedback_archive_cmd_controlled_draft_qbank_001",
      persistenceMode: "APPEND_ONLY_STUDENT_ARCHIVE_COMMAND",
      targetArchiveKind: "STUDENT_AI_TUTOR_FEEDBACK_ARCHIVE",
      desiredArchiveState: "PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED",
      scopeRef: envelope.scopeRef,
      deliveryEnvelopeRecordId: delivery.recordId,
      deliveryEnvelopeId: envelope.envelopeId,
      approvalRecordId: envelope.approvalRecordId,
      approvalId: envelope.approvalId,
      sourceControlledDraftArtifactId: envelope.sourceControlledDraft.artifactId,
      approvedFeedbackArtifactId: envelope.approvedFeedbackArtifactId,
      submissionId: envelope.submissionId,
      requestId: envelope.requestId,
      questionBankDraftRef: envelope.questionBankDraftRef,
      tutoringAnalysisRequestId: envelope.tutoringAnalysisRequestId,
      archiveItemId: envelope.archiveItemId,
    },
    feedbackArchivePersistencePolicy: {
      feedbackDeliveryEnvelopeControlledDraftSourceRequired: true,
      sourceControlledDraftEvidenceRequired: true,
      appendOnlyCommandLogRequired: true,
      studentOwnScopeRequired: true,
      preserveControlledDraftSourceEvidenceRequired: true,
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
    evidenceRefs: [
      `evidence:feedback-delivery-envelope-controlled-draft-source:${envelope.submissionId}`,
      `evidence:feedback-archive-persistence-command-controlled-draft-source:${envelope.submissionId}`,
    ],
    idempotencyKey: `student-app-ai-tutor-feedback-archive-persistence-controlled-draft-source:${envelope.scopeRef}:${envelope.submissionId}`,
  };
}

function deliveryReport() {
  return JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source.current.json", "utf8"));
}

function deliveryResult() {
  return deliveryReport().runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource.result;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
