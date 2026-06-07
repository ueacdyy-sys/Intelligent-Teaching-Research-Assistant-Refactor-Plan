import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_CONTROLLED_DRAFT_SOURCE_PORT,
  formatStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource,
  recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource,
} from "./student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source-runtime.mjs";

describe("Student App AI Tutor question-bank draft answer reviewed feedback artifact from controlled draft runtime", () => {
  it("records reviewed feedback artifacts from a controlled draft while keeping publication blocked", async () => {
    const port = recordingReviewedFeedbackArtifactPort();
    const result = await recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource(baseInput(), {
      commandLogPath: tempLog(),
      reviewedFeedbackArtifactPort: port,
      generatedAt: "2026-06-07T03:40:00.000Z",
    });

    assert.equal(port.calls.length, 1);
    assert.equal(result.schemaVersion, "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source-recorded.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_CONTROLLED_DRAFT_SOURCE_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_FROM_CONTROLLED_DRAFT_RECORDED");
    assert.equal(result.reviewedFeedbackArtifact.review.controlledDraftSourceVerified, true);
    assert.equal(result.reviewedFeedbackArtifact.sourceControlledDraft.artifactId, sourceResult().feedbackDraft.artifactId);
    assert.equal(result.boundary.controlledFeedbackDraftSourceVerified, true);
    assert.equal(result.boundary.reviewedFeedbackArtifactRecorded, true);
    assert.equal(result.boundary.publicationApproved, false);
    assert.equal(result.boundary.studentVisibleFeedbackPublished, false);
    assert.equal(result.boundary.answerKeyDisclosed, false);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.equal(port.calls[0].sourceControlledFeedbackDraft.feedbackDraft.artifactId, sourceResult().feedbackDraft.artifactId);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource(result), /Student-visible published: false/u);
  });

  it("uses idempotency for replay and rejects conflicting reviewed artifacts from the same draft", async () => {
    const commandLogPath = tempLog();
    const port = recordingReviewedFeedbackArtifactPort();
    const first = await recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource(baseInput(), {
      commandLogPath,
      reviewedFeedbackArtifactPort: port,
    });
    const replay = await recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource(baseInput(), {
      commandLogPath,
      reviewedFeedbackArtifactPort: port,
    });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = clone(baseInput());
    conflicting.reviewedFeedbackArtifact.learnerFeedback.summary = "A different teacher-reviewed summary for the same draft.";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource(conflicting, {
        commandLogPath,
        reviewedFeedbackArtifactPort: port,
      }),
      /record\.inputHash must be/u,
    );
  });

  it("rejects missing ports, unsafe reviewers, unsafe controlled draft reports, and unsafe policies", async () => {
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource(baseInput(), { commandLogPath: tempLog() }),
      /recordReviewedFeedbackArtifactFromControlledDraft is required/u,
    );

    const unsafeReviewer = clone(baseInput());
    unsafeReviewer.principal.role = "STUDENT";
    unsafeReviewer.principal.entryPoint = "STUDENT_APP";
    unsafeReviewer.principal.scopes = ["STUDENT_OWN_READ"];
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource(unsafeReviewer, {
        commandLogPath: tempLog(),
        reviewedFeedbackArtifactPort: recordingReviewedFeedbackArtifactPort(),
      }),
      /input\.principal\.role/u,
    );

    const unsafeSource = clone(baseInput());
    unsafeSource.controlledFeedbackDraftReport.safetyInvariants.reviewedFeedbackArtifactRecorded = true;
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource(unsafeSource, {
        commandLogPath: tempLog(),
        reviewedFeedbackArtifactPort: recordingReviewedFeedbackArtifactPort(),
      }),
      /reviewedFeedbackArtifactRecorded/u,
    );

    for (const field of ["studentVisibleFeedbackAllowed", "publicationApproved", "answerKeyDisclosureAllowed", "modelInferenceAllowed", "executeHttpRequestAllowed", "swarmAllowed"]) {
      const input = clone(baseInput());
      input.feedbackArtifactPolicy[field] = true;
      await assert.rejects(
        () => recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource(input, {
          commandLogPath: tempLog(),
          reviewedFeedbackArtifactPort: recordingReviewedFeedbackArtifactPort(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }
  });

  it("rejects leaked fields, unsafe port results, unsafe text, and missing source evidence", async () => {
    const leaked = clone(baseInput());
    leaked.reviewedFeedbackArtifact.answerText = "leak";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource(leaked, {
        commandLogPath: tempLog(),
        reviewedFeedbackArtifactPort: recordingReviewedFeedbackArtifactPort(),
      }),
      /answerText is not allowed/u,
    );

    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource(baseInput(), {
        commandLogPath: tempLog(),
        reviewedFeedbackArtifactPort: recordingReviewedFeedbackArtifactPort({ studentVisibleFeedbackPublished: true }),
      }),
      /studentVisibleFeedbackPublished must be false/u,
    );

    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource(baseInput(), {
        commandLogPath: tempLog(),
        reviewedFeedbackArtifactPort: recordingReviewedFeedbackArtifactPort({}, { unsafeText: true }),
      }),
      /answer keys/u,
    );

    const missingEvidence = clone(baseInput());
    missingEvidence.evidenceRefs = [
      "evidence:reviewed-feedback-artifact-controlled-draft-source:feedback_review_001",
      "evidence:other",
    ];
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource(missingEvidence, {
        commandLogPath: tempLog(),
        reviewedFeedbackArtifactPort: recordingReviewedFeedbackArtifactPort(),
      }),
      /feedback-controlled-draft evidence ref is required/u,
    );
  });
});

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-reviewed-feedback-artifact-controlled-draft-source-")), "artifact.jsonl");
}

function baseInput() {
  const source = sourceResult();
  return {
    schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source.v1",
    reviewInvocationId: "feedback_controlled_draft_review_001",
    controlledFeedbackDraftReport: sourceReport(),
    principal: {
      principalId: "teacher_001",
      subjectType: "USER",
      role: "TEACHER",
      entryPoint: "DESKTOP_TEACHER",
      scopes: ["TEACHING_READ", "FEEDBACK_REVIEW"],
      sessionId: "session_teacher_001",
    },
    reviewedFeedbackArtifact: reviewedFeedbackArtifact(source),
    feedbackArtifactPolicy: feedbackArtifactPolicy(),
    evidenceRefs: [
      `evidence:feedback-controlled-draft:${source.feedbackDraft.artifactId}`,
      "evidence:reviewed-feedback-artifact-controlled-draft-source:feedback_review_001",
    ],
    idempotencyKey: `student-app-ai-tutor-reviewed-feedback-artifact-controlled-draft-source:student_001:${source.feedbackDraft.submissionId}`,
  };
}

function reviewedFeedbackArtifact(source) {
  const scoring = source.studentScoringResult;
  return {
    artifactId: "feedback_artifact_qbank_controlled_draft_001",
    artifactKind: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_ANSWER_REVIEWED_FEEDBACK",
    sourceControlledDraft: {
      runtimeId: source.runtimeId,
      recordId: source.recordId,
      artifactId: source.feedbackDraft.artifactId,
      generationAttemptId: source.feedbackDraft.generationAttemptId,
      inputHash: source.inputHash,
      draftFeedbackHash: hashInput(source.feedbackDraft.draftFeedback),
    },
    submissionId: scoring.submissionId,
    requestId: scoring.requestId,
    questionBankDraftRef: scoring.questionBankDraftRef,
    tutoringAnalysisRequestId: scoring.tutoringAnalysisRequestId,
    archiveItemId: scoring.archiveItemId,
    audience: "STUDENT_APP_LEARNING_SUPPORT",
    visibilityState: "REVIEWED_NOT_PUBLISHED",
    scoreSummary: scoring.scoreSummary,
    learnerFeedback: {
      summary: "You handled the main skill well and should review one related point before the next practice.",
      encouragement: "Keep explaining your thinking step by step.",
      nextSteps: ["Review the missed concept with your teacher.", "Try one similar practice item after review."],
      misconceptionTags: ["fraction-comparison"],
      practiceSuggestions: ["Use a number line for the next comparison exercise."],
    },
    review: {
      reviewId: "feedback_review_001",
      reviewerPrincipalId: "teacher_001",
      reviewedAt: "2026-06-07T03:38:00.000Z",
      humanReviewed: true,
      controlledDraftSourceVerified: true,
      ageAppropriate: true,
      studentOwnScopeConfirmed: true,
      answerKeyRemoved: true,
      workerMetadataRemoved: true,
      rawModelOutputRemoved: true,
      resultRefRemoved: true,
      internalErrorsRemoved: true,
      publicationApprovalRequired: true,
      publicationApproved: false,
    },
    reviewedFromControlledDraft: true,
    publicationApproved: false,
    studentVisibleFeedbackPublished: false,
  };
}

function feedbackArtifactPolicy() {
  return {
    controlledFeedbackDraftRequired: true,
    safeStudentResultRequired: true,
    humanReviewRequired: true,
    reviewedFeedbackArtifactAllowed: true,
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
  };
}

function sourceReport() {
  return JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft.current.json", "utf8"));
}

function sourceResult() {
  return sourceReport().runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackControlledDraft.result;
}

function recordingReviewedFeedbackArtifactPort(overrides = {}, behavior = {}) {
  const calls = [];
  return {
    calls,
    async recordReviewedFeedbackArtifactFromControlledDraft(request) {
      calls.push(request);
      return {
        reviewedFeedbackArtifact: {
          ...request.reviewedFeedbackArtifact,
          learnerFeedback: {
            ...request.reviewedFeedbackArtifact.learnerFeedback,
            summary: behavior.unsafeText ? "This reveals the answer key." : request.reviewedFeedbackArtifact.learnerFeedback.summary,
          },
          ...overrides,
        },
      };
    },
  };
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
