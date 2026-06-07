import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_CONTROLLED_DRAFT_SOURCE_PORT,
  formatStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource,
  recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source-runtime.mjs";

describe("Student App AI Tutor question-bank draft answer feedback publication approval from controlled draft source runtime", () => {
  it("records publication approval from a controlled-draft-sourced reviewed artifact while delivery remains blocked", () => {
    const result = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource(baseInput(), {
      commandLogPath: tempLog(),
      generatedAt: "2026-06-07T04:05:00.000Z",
    });

    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_CONTROLLED_DRAFT_SOURCE_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVED_FROM_CONTROLLED_DRAFT_SOURCE_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED");
    assert.equal(result.sourceReviewedFeedbackArtifact.reviewedFromControlledDraft, true);
    assert.equal(result.sourceControlledFeedbackDraft.artifactId, sourceResult().sourceControlledFeedbackDraft.artifactId);
    assert.equal(result.approvedFeedbackArtifact.sourceControlledDraft.artifactId, sourceResult().sourceControlledFeedbackDraft.artifactId);
    assert.equal(result.boundary.controlledDraftSourceVerified, true);
    assert.equal(result.boundary.publicationApprovalGranted, true);
    assert.equal(result.boundary.studentVisibleFeedbackPublished, false);
    assert.equal(result.boundary.studentVisibleDeliveryEnvelopeCreated, false);
    assert.equal(result.boundary.durableStudentArchivePersistenceStarted, false);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource(result), /Student-visible feedback published: false/u);
  });

  it("uses idempotency for replay and rejects conflicting controlled-source approvals", () => {
    const commandLogPath = tempLog();
    const first = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource(baseInput(), { commandLogPath });
    const replay = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource(baseInput(), { commandLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = clone(baseInput());
    conflicting.feedbackPublicationApproval.comments = "Different approval text for the same controlled source.";
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource(conflicting, { commandLogPath }),
      /record\.inputHash must be/u,
    );
  });

  it("rejects unsafe approvers, unsafe 0296 source reports, unsafe policies, and direct delivery attempts", () => {
    const unsafeApprover = clone(baseInput());
    unsafeApprover.principal.role = "STUDENT";
    unsafeApprover.principal.entryPoint = "STUDENT_APP";
    unsafeApprover.principal.scopes = ["STUDENT_OWN_READ"];
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource(unsafeApprover, { commandLogPath: tempLog() }),
      /input\.principal\.role/u,
    );

    const unsafeSource = clone(baseInput());
    unsafeSource.reviewedFeedbackArtifactControlledDraftSourceReport.safetyInvariants.controlledDraftSourceVerified = false;
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource(unsafeSource, { commandLogPath: tempLog() }),
      /controlledDraftSourceVerified/u,
    );

    for (const field of ["studentVisibleFeedbackPublished", "studentVisibleDeliveryEnvelopeCreated", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "swarmAllowed"]) {
      const input = clone(baseInput());
      input.feedbackPublicationApprovalPolicy[field] = true;
      assert.throws(
        () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource(input, { commandLogPath: tempLog() }),
        new RegExp(`${field} must be false`, "u"),
      );
    }

    const directDelivery = clone(baseInput());
    directDelivery.feedbackPublicationApproval.studentVisibleFeedbackPublished = true;
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource(directDelivery, { commandLogPath: tempLog() }),
      /studentVisibleFeedbackPublished/u,
    );
  });

  it("rejects leaked fields, unsafe text, and missing controlled-source approval evidence", () => {
    const leaked = clone(baseInput());
    leaked.reviewedFeedbackArtifactControlledDraftSourceReport.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource.result.reviewedFeedbackArtifact.resultRef = "leak";
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource(leaked, { commandLogPath: tempLog() }),
      /resultRef is not allowed/u,
    );

    const unsafeText = clone(baseInput());
    unsafeText.feedbackPublicationApproval.comments = "Approved but mentions the answer key.";
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource(unsafeText, { commandLogPath: tempLog() }),
      /answer keys/u,
    );

    const missingEvidence = clone(baseInput());
    missingEvidence.evidenceRefs = [
      "evidence:reviewed-feedback-artifact-controlled-draft-source:feedback_artifact_001",
      "evidence:other",
    ];
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource(missingEvidence, { commandLogPath: tempLog() }),
      /feedback-publication-approval-controlled-draft-source evidence ref is required/u,
    );
  });
});

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-feedback-publication-approval-controlled-source-")), "approval.jsonl");
}

function baseInput() {
  const source = sourceResult();
  const artifact = source.reviewedFeedbackArtifact;
  const draft = source.sourceControlledFeedbackDraft;
  return {
    schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source.v1",
    approvalInvocationId: "feedback_publication_approval_controlled_draft_001",
    principal: {
      principalId: "teacher_001",
      subjectType: "USER",
      role: "TEACHER",
      entryPoint: "DESKTOP_TEACHER",
      scopes: ["TEACHING_READ", "FEEDBACK_PUBLISH_APPROVE"],
      sessionId: "session_teacher_001",
    },
    reviewedFeedbackArtifactControlledDraftSourceReport: sourceReport(),
    feedbackPublicationApproval: {
      approvalId: "feedback_publication_approval_controlled_draft_qbank_001",
      reviewerPrincipalId: "teacher_001",
      decision: "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY",
      reviewedAt: "2026-06-07T04:04:00.000Z",
      reviewedFeedbackArtifactId: artifact.artifactId,
      sourceControlledDraftArtifactId: draft.artifactId,
      submissionId: artifact.submissionId,
      requestId: artifact.requestId,
      questionBankDraftRef: artifact.questionBankDraftRef,
      tutoringAnalysisRequestId: artifact.tutoringAnalysisRequestId,
      archiveItemId: artifact.archiveItemId,
      reviewedFeedbackArtifactVerified: true,
      controlledDraftSourceVerified: true,
      learnerFeedbackReviewed: true,
      ageAppropriateConfirmed: true,
      studentOwnScopeConfirmed: true,
      answerKeyDisclosureBlocked: true,
      workerMetadataDisclosureBlocked: true,
      rawModelOutputDisclosureBlocked: true,
      resultRefDisclosureBlocked: true,
      internalErrorsDisclosureBlocked: true,
      futureStudentVisibleDeliveryRuntimeRequired: true,
      studentVisibleFeedbackPublished: false,
      studentVisibleDeliveryEnvelopeCreated: false,
      databaseWriteApproved: false,
      modelInferenceApproved: false,
      remoteDeviceControlApproved: false,
      localToolMutationApproved: false,
      swarmApproved: false,
      comments: "Approved after human review of the controlled feedback draft source.",
    },
    feedbackPublicationApprovalPolicy: {
      reviewedFeedbackArtifactRequired: true,
      controlledDraftSourceRequired: true,
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
    evidenceRefs: [
      `evidence:reviewed-feedback-artifact-controlled-draft-source:${artifact.artifactId}`,
      "evidence:feedback-publication-approval-controlled-draft-source:feedback_publication_approval_controlled_draft_qbank_001",
    ],
    idempotencyKey: `student-app-ai-tutor-feedback-publication-approval-controlled-draft-source:student_001:${artifact.submissionId}`,
  };
}

function sourceReport() {
  return JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source.current.json", "utf8"));
}

function sourceResult() {
  return sourceReport().runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource.result;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
