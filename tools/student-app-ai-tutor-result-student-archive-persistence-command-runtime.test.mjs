import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PORT,
  formatStudentAppAITutorResultStudentArchivePersistenceCommand,
  recordStudentAppAITutorResultStudentArchivePersistenceCommand,
} from "./student-app-ai-tutor-result-student-archive-persistence-command-runtime.mjs";

describe("Student App AI Tutor result student archive persistence command runtime", () => {
  it("records an append-only AI Tutor result archive persistence command without durable commit", () => {
    const result = recordStudentAppAITutorResultStudentArchivePersistenceCommand(baseInput(), {
      commandLogPath: tempLog(),
      generatedAt: "2026-06-08T12:10:00.000Z",
    });

    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PORT);
    assert.equal(result.studentArchivePersistenceCommand.commandKind, "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_PERSISTENCE_COMMAND");
    assert.equal(result.studentArchivePersistenceCommand.commitState, "NOT_COMMITTED_TO_STUDENT_ARCHIVE");
    assert.equal(result.studentArchivePersistenceCommand.safeGuidance.guidanceSections.length, 2);
    assert.equal(result.boundary.studentArchivePersistenceCommandRecorded, true);
    assert.equal(result.boundary.appendOnlyCommandLogRecorded, true);
    assert.equal(result.boundary.durableStudentArchivePersistenceStarted, false);
    assert.equal(result.boundary.durableStudentArchiveCommitStarted, false);
    assert.equal(result.boundary.studentArchivePersisted, false);
    assert.equal(result.boundary.mainDatabaseWriteStarted, false);
    assert.equal(result.boundary.studentArchiveWriteStarted, false);
    assert.match(formatStudentAppAITutorResultStudentArchivePersistenceCommand(result), /Committed: false/u);
  });

  it("uses idempotency for replay and rejects conflicting archive persistence commands", () => {
    const commandLogPath = tempLog();
    const first = recordStudentAppAITutorResultStudentArchivePersistenceCommand(baseInput(), { commandLogPath });
    const replay = recordStudentAppAITutorResultStudentArchivePersistenceCommand(baseInput(), { commandLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.studentArchivePersistenceCommand.commandId, first.studentArchivePersistenceCommand.commandId);

    const conflicting = baseInput();
    conflicting.studentArchivePersistenceRequest.commandId = "ai_tutor_result_archive_cmd_conflict";
    assert.throws(
      () => recordStudentAppAITutorResultStudentArchivePersistenceCommand(conflicting, { commandLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects unsafe principals, non-ready delivery, hash mismatches, unsafe policies, and request mismatches", () => {
    const unsafePrincipal = baseInput();
    unsafePrincipal.principal.scopes = ["TEACHING_READ", "STUDENT_APP_DELIVERY"];
    assert.throws(
      () => recordStudentAppAITutorResultStudentArchivePersistenceCommand(unsafePrincipal, { commandLogPath: tempLog() }),
      /STUDENT_ARCHIVE_WRITE/u,
    );

    const notReady = baseInput();
    notReady.studentResultDeliveryEnvelopeReport.readiness = "NEEDS_REMEDIATION";
    assert.throws(
      () => recordStudentAppAITutorResultStudentArchivePersistenceCommand(notReady, { commandLogPath: tempLog() }),
      /readiness must be READY/u,
    );

    const hashMismatch = baseInput();
    hashMismatch.controlledAnswerArtifactReport.runtimeProbes.studentAppAiTutorControlledAnswerArtifact.result.controlledAnswerArtifact.guidanceSections[0].text = "Changed safe guidance.";
    assert.throws(
      () => recordStudentAppAITutorResultStudentArchivePersistenceCommand(hashMismatch, { commandLogPath: tempLog() }),
      /guidanceSectionsHash must be/u,
    );

    for (const field of ["directDatabaseAccessAllowed", "mainDatabaseWriteAllowed", "studentArchiveWriteAllowed", "durableArchiveCommitAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "retrievalAllowed", "swarmAllowed"]) {
      const unsafePolicy = baseInput();
      unsafePolicy.studentArchivePersistencePolicy[field] = true;
      assert.throws(
        () => recordStudentAppAITutorResultStudentArchivePersistenceCommand(unsafePolicy, { commandLogPath: tempLog() }),
        new RegExp(field, "u"),
      );
    }

    const mismatch = baseInput();
    mismatch.studentArchivePersistenceRequest.deliveryEnvelopeId = "ai_tutor_result_delivery_env_other";
    assert.throws(
      () => recordStudentAppAITutorResultStudentArchivePersistenceCommand(mismatch, { commandLogPath: tempLog() }),
      /deliveryEnvelopeId/u,
    );
  });

  it("rejects leaked result, answer, prompt, content, model, commit, internal error fields and unsafe guidance text", () => {
    for (const field of ["resultRef", "answerKey", "prompt", "contentRef", "rawModelOutput", "archiveCommitResult", "errorMessage"]) {
      const leaked = baseInput();
      leaked.studentResultDeliveryEnvelopeReport.runtimeProbes.studentAppAiTutorResultStudentDeliveryEnvelope.result.studentResultDeliveryEnvelope[field] = "leak";
      assert.throws(
        () => recordStudentAppAITutorResultStudentArchivePersistenceCommand(leaked, { commandLogPath: tempLog() }),
        new RegExp(field, "iu"),
      );
    }

    const unsafeText = baseInput();
    unsafeText.controlledAnswerArtifactReport.runtimeProbes.studentAppAiTutorControlledAnswerArtifact.result.controlledAnswerArtifact.guidanceSections[0].text = "This exposes the answer key.";
    assert.throws(
      () => recordStudentAppAITutorResultStudentArchivePersistenceCommand(unsafeText, { commandLogPath: tempLog() }),
      /safe student text/u,
    );
  });

  it("records a result-archive-sourced student archive persistence command without committing it", () => {
    const result = recordStudentAppAITutorResultStudentArchivePersistenceCommand(resultArchiveInput(), {
      commandLogPath: tempLog(),
      generatedAt: "2026-06-09T13:10:00.000Z",
    });

    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED");
    assert.equal(result.sourceStudentDeliveryEnvelope.learningActionSource, "AI_TUTOR_RESULT_ARCHIVE");
    assert.equal(result.sourceStudentDeliveryEnvelope.resultArchiveStatus, "READY_FOR_STUDENT_APP_READ");
    assert.equal(result.sourceControlledAnswerArtifact.learningActionSource, "AI_TUTOR_RESULT_ARCHIVE");
    assert.equal(result.studentArchivePersistenceCommand.learningActionSource, "AI_TUTOR_RESULT_ARCHIVE");
    assert.equal(result.studentArchivePersistenceCommand.resultArchiveStatus, "READY_FOR_STUDENT_APP_READ");
    assert.equal(result.studentArchivePersistenceCommand.commitState, "NOT_COMMITTED_TO_STUDENT_ARCHIVE");
    assert.equal(result.boundary.studentArchivePersistenceCommandRecorded, true);
    assert.equal(result.boundary.durableStudentArchiveCommitStarted, false);
    assert.equal(result.boundary.studentArchivePersisted, false);
  });

  it("rejects unsafe result-archive delivery and artifact source metadata", () => {
    const unsafeDelivery = resultArchiveInput();
    unsafeDelivery.studentResultDeliveryEnvelopeReport.runtimeProbes.studentAppAiTutorResultArchiveStudentDeliveryEnvelope.result.sourceStudentVisibilityReview.learningActionSource = "PUBLISHED_ARCHIVE_ITEM";
    assert.throws(
      () => recordStudentAppAITutorResultStudentArchivePersistenceCommand(unsafeDelivery, { commandLogPath: tempLog() }),
      /learningActionSource/u,
    );

    const unsafeArtifact = resultArchiveInput();
    unsafeArtifact.controlledAnswerArtifactReport.runtimeProbes.studentAppAiTutorResultArchiveControlledAnswerArtifact.result.resultArchiveStatus = "STALE_RESULT_ARCHIVE";
    assert.throws(
      () => recordStudentAppAITutorResultStudentArchivePersistenceCommand(unsafeArtifact, { commandLogPath: tempLog() }),
      /resultArchiveStatus/u,
    );
  });

  it("records a question-bank-feedback-sourced student archive persistence command without committing it", () => {
    const result = recordStudentAppAITutorResultStudentArchivePersistenceCommand(questionBankFeedbackInput(), {
      commandLogPath: tempLog(),
      generatedAt: "2026-06-11T16:20:00.000Z",
    });

    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED");
    assert.equal(result.sourceStudentDeliveryEnvelope.learningActionSource, "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK");
    assert.equal(result.sourceStudentDeliveryEnvelope.feedbackStatus, "READY_FOR_STUDENT_APP_READ");
    assert.equal(result.sourceControlledAnswerArtifact.learningActionSource, "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK");
    assert.equal(result.sourceControlledAnswerArtifact.feedbackStatus, "READY_FOR_STUDENT_APP_READ");
    assert.equal(result.studentArchivePersistenceCommand.learningActionSource, "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK");
    assert.equal(result.studentArchivePersistenceCommand.feedbackStatus, "READY_FOR_STUDENT_APP_READ");
    assert.equal(result.studentArchivePersistenceCommand.commitState, "NOT_COMMITTED_TO_STUDENT_ARCHIVE");
    assert.equal(result.boundary.studentArchivePersistenceCommandRecorded, true);
    assert.equal(result.boundary.durableStudentArchivePersistenceStarted, false);
    assert.equal(result.boundary.durableStudentArchiveCommitStarted, false);
    assert.equal(result.boundary.studentArchivePersisted, false);
  });

  it("rejects unsafe question-bank-feedback delivery and artifact source metadata", () => {
    const unsafeDelivery = questionBankFeedbackInput();
    unsafeDelivery.studentResultDeliveryEnvelopeReport.runtimeProbes.studentAppAiTutorQuestionBankFeedbackStudentDeliveryEnvelope.result.sourceStudentVisibilityReview.feedbackStatus = "PENDING_TEACHER_REVIEW";
    assert.throws(
      () => recordStudentAppAITutorResultStudentArchivePersistenceCommand(unsafeDelivery, { commandLogPath: tempLog() }),
      /feedbackStatus/u,
    );

    const unsafeArtifact = questionBankFeedbackInput();
    unsafeArtifact.controlledAnswerArtifactReport.runtimeProbes.studentAppAiTutorQuestionBankFeedbackControlledAnswerArtifact.result.learningActionSource = "AI_TUTOR_RESULT_ARCHIVE";
    assert.throws(
      () => recordStudentAppAITutorResultStudentArchivePersistenceCommand(unsafeArtifact, { commandLogPath: tempLog() }),
      /learningActionSource/u,
    );
  });
});

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-result-archive-persistence-")), "persistence.jsonl");
}

function baseInput() {
  const delivery = JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-result-student-delivery-envelope.current.json", "utf8"));
  const artifact = JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-controlled-answer-artifact.current.json", "utf8"));
  const result = delivery.runtimeProbes.studentAppAiTutorResultStudentDeliveryEnvelope.result;
  const envelope = result.studentResultDeliveryEnvelope;
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-archive-persistence-command.v1",
    persistenceInvocationId: "ai_tutor_result_archive_persist_001",
    studentResultDeliveryEnvelopeReport: delivery,
    controlledAnswerArtifactReport: artifact,
    principal: {
      principalId: "student_archive_persistence_runtime_001",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "STUDENT_ARCHIVE_PERSISTENCE_RUNTIME",
      sessionId: "session_student_archive_persistence_001",
      scopes: ["TEACHING_READ", "STUDENT_ARCHIVE_WRITE", "STUDENT_APP_DELIVERY"],
    },
    studentArchivePersistenceRequest: {
      commandId: "ai_tutor_result_archive_cmd_001",
      persistenceMode: "APPEND_ONLY_STUDENT_ARCHIVE_COMMAND",
      targetArchiveKind: "STUDENT_AI_TUTOR_RESULT_ARCHIVE",
      desiredArchiveState: "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
      scopeRef: envelope.scopeRef,
      deliveryEnvelopeRecordId: result.recordId,
      deliveryEnvelopeId: envelope.envelopeId,
      studentVisibilityReviewRecordId: envelope.studentVisibilityReviewRecordId,
      studentVisibilityReviewId: envelope.studentVisibilityReviewId,
      artifactId: envelope.artifactId,
      requestId: envelope.requestId,
      archiveItemId: envelope.archiveItemId,
      guidanceSectionsHash: envelope.guidanceSectionsHash,
    },
    studentArchivePersistencePolicy: {
      resultStudentDeliveryEnvelopeRequired: true,
      controlledAnswerArtifactRequired: true,
      guidanceHashMatchRequired: true,
      appendOnlyCommandLogRequired: true,
      safeGuidanceOnlyRequired: true,
      studentOwnScopeRequired: true,
      futureDurableArchiveCommitReviewRequired: true,
      directDatabaseAccessAllowed: false,
      mainDatabaseWriteAllowed: false,
      studentArchiveWriteAllowed: false,
      durableArchiveCommitAllowed: false,
      executeHttpRequestAllowed: false,
      modelInferenceAllowed: false,
      retrievalAllowed: false,
      answerKeyDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      promptDisclosureAllowed: false,
      contentRefDisclosureAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      "evidence:student-delivery-envelope:student-app-ai-tutor-result-student-delivery-envelope",
      "evidence:controlled-answer-artifact:student-app-ai-tutor-controlled-answer-artifact",
    ],
    idempotencyKey: "student-app-ai-tutor-result-archive-persistence:ai_tutor_result_delivery_env_001",
  };
}

function resultArchiveInput() {
  const delivery = JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-result-archive-student-delivery-envelope.current.json", "utf8"));
  const artifact = JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-result-archive-controlled-answer-artifact.current.json", "utf8"));
  const result = delivery.runtimeProbes.studentAppAiTutorResultArchiveStudentDeliveryEnvelope.result;
  const envelope = result.studentResultDeliveryEnvelope;
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-archive-persistence-command.v1",
    persistenceInvocationId: "ai_tutor_result_archive_persist_result_archive_001",
    studentResultDeliveryEnvelopeReport: delivery,
    controlledAnswerArtifactReport: artifact,
    principal: {
      principalId: "student_archive_persistence_runtime_result_archive_001",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "STUDENT_ARCHIVE_PERSISTENCE_RUNTIME",
      sessionId: "session_student_archive_persistence_result_archive_001",
      scopes: ["TEACHING_READ", "STUDENT_ARCHIVE_WRITE", "STUDENT_APP_DELIVERY"],
    },
    studentArchivePersistenceRequest: {
      commandId: "ai_tutor_result_archive_cmd_result_archive_001",
      persistenceMode: "APPEND_ONLY_STUDENT_ARCHIVE_COMMAND",
      targetArchiveKind: "STUDENT_AI_TUTOR_RESULT_ARCHIVE",
      desiredArchiveState: "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
      scopeRef: envelope.scopeRef,
      deliveryEnvelopeRecordId: result.recordId,
      deliveryEnvelopeId: envelope.envelopeId,
      studentVisibilityReviewRecordId: envelope.studentVisibilityReviewRecordId,
      studentVisibilityReviewId: envelope.studentVisibilityReviewId,
      artifactId: envelope.artifactId,
      requestId: envelope.requestId,
      archiveItemId: envelope.archiveItemId,
      guidanceSectionsHash: envelope.guidanceSectionsHash,
    },
    studentArchivePersistencePolicy: {
      resultStudentDeliveryEnvelopeRequired: true,
      controlledAnswerArtifactRequired: true,
      guidanceHashMatchRequired: true,
      appendOnlyCommandLogRequired: true,
      safeGuidanceOnlyRequired: true,
      studentOwnScopeRequired: true,
      futureDurableArchiveCommitReviewRequired: true,
      directDatabaseAccessAllowed: false,
      mainDatabaseWriteAllowed: false,
      studentArchiveWriteAllowed: false,
      durableArchiveCommitAllowed: false,
      executeHttpRequestAllowed: false,
      modelInferenceAllowed: false,
      retrievalAllowed: false,
      answerKeyDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      promptDisclosureAllowed: false,
      contentRefDisclosureAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      "evidence:result-archive-student-delivery-envelope:student-app-ai-tutor-result-archive-student-delivery-envelope",
      "evidence:result-archive-controlled-answer-artifact:student-app-ai-tutor-result-archive-controlled-answer-artifact",
    ],
    idempotencyKey: "student-app-ai-tutor-result-archive-persistence:ai_tutor_result_delivery_env_result_archive_001",
  };
}

function questionBankFeedbackInput() {
  const delivery = JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-feedback-student-delivery-envelope.current.json", "utf8"));
  const artifact = JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact.current.json", "utf8"));
  const result = delivery.runtimeProbes.studentAppAiTutorQuestionBankFeedbackStudentDeliveryEnvelope.result;
  const envelope = result.studentResultDeliveryEnvelope;
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-archive-persistence-command.v1",
    persistenceInvocationId: "ai_tutor_result_archive_persist_feedback_001",
    studentResultDeliveryEnvelopeReport: delivery,
    controlledAnswerArtifactReport: artifact,
    principal: {
      principalId: "student_archive_persistence_runtime_feedback_001",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "STUDENT_ARCHIVE_PERSISTENCE_RUNTIME",
      sessionId: "session_student_archive_persistence_feedback_001",
      scopes: ["TEACHING_READ", "STUDENT_ARCHIVE_WRITE", "STUDENT_APP_DELIVERY"],
    },
    studentArchivePersistenceRequest: {
      commandId: "ai_tutor_result_archive_cmd_feedback_001",
      persistenceMode: "APPEND_ONLY_STUDENT_ARCHIVE_COMMAND",
      targetArchiveKind: "STUDENT_AI_TUTOR_RESULT_ARCHIVE",
      desiredArchiveState: "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
      scopeRef: envelope.scopeRef,
      deliveryEnvelopeRecordId: result.recordId,
      deliveryEnvelopeId: envelope.envelopeId,
      studentVisibilityReviewRecordId: envelope.studentVisibilityReviewRecordId,
      studentVisibilityReviewId: envelope.studentVisibilityReviewId,
      artifactId: envelope.artifactId,
      requestId: envelope.requestId,
      archiveItemId: envelope.archiveItemId,
      guidanceSectionsHash: envelope.guidanceSectionsHash,
    },
    studentArchivePersistencePolicy: {
      resultStudentDeliveryEnvelopeRequired: true,
      controlledAnswerArtifactRequired: true,
      guidanceHashMatchRequired: true,
      appendOnlyCommandLogRequired: true,
      safeGuidanceOnlyRequired: true,
      studentOwnScopeRequired: true,
      futureDurableArchiveCommitReviewRequired: true,
      directDatabaseAccessAllowed: false,
      mainDatabaseWriteAllowed: false,
      studentArchiveWriteAllowed: false,
      durableArchiveCommitAllowed: false,
      executeHttpRequestAllowed: false,
      modelInferenceAllowed: false,
      retrievalAllowed: false,
      answerKeyDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      promptDisclosureAllowed: false,
      contentRefDisclosureAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      "evidence:question-bank-feedback-student-delivery-envelope:student-app-ai-tutor-question-bank-feedback-student-delivery-envelope",
      "evidence:question-bank-feedback-controlled-answer-artifact:student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact",
    ],
    idempotencyKey: "student-app-ai-tutor-question-bank-feedback-persistence:ai_tutor_result_delivery_env_feedback_001",
  };
}
