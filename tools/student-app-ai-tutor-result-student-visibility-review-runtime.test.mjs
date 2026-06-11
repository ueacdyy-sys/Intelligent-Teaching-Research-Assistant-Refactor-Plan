import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_PORT,
  formatStudentAppAITutorResultStudentVisibilityReview,
  recordStudentAppAITutorResultStudentVisibilityReview,
} from "./student-app-ai-tutor-result-student-visibility-review-runtime.mjs";

describe("Student App AI Tutor result student visibility review runtime", () => {
  it("records a human student visibility review without publishing or delivery envelope creation", async () => {
    const port = reviewPort();
    const result = await recordStudentAppAITutorResultStudentVisibilityReview(baseInput(), {
      resultStudentVisibilityReviewPort: port,
      reviewLogPath: tempLog(),
      generatedAt: "2026-06-08T10:40:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-08.student-app.ai-tutor-result-student-visibility-review-recorded.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_RECORDED");
    assert.equal(result.studentVisibilityReview.status, "AI_TUTOR_RESULT_STUDENT_VISIBILITY_APPROVED_NOT_DELIVERED");
    assert.equal(result.boundary.humanStudentVisibilityReviewRecorded, true);
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal(result.boundary.studentDeliveryEnvelopeCreated, false);
    assert.equal(result.boundary.futureStudentDeliveryRequiresSeparateRuntime, true);
    assert.equal(port.calls.length, 1);
    assert.equal(JSON.stringify(port.calls[0]).includes("Convert both fractions"), false);
    assert.equal(port.calls[0].safety.rawResultRefSentToPort, false);
    assert.match(formatStudentAppAITutorResultStudentVisibilityReview(result), /Student visible: false/u);
  });

  it("records a result-archive-sourced student visibility review through the same review port", async () => {
    const input = baseInput("reports/student-app-ai-tutor-result-archive-reviewed-result-persistence-bridge.current.json");
    input.reviewInvocationId = "ai_tutor_result_visibility_review_archive_001";
    input.studentVisibilityReview.reviewId = "ai_tutor_result_visibility_review_archive_001";
    input.idempotencyKey = "student-app-ai-tutor-result-archive-visibility-review:ai_tutor_answer_review_gate_result_archive_001";
    input.evidenceRefs = [
      "evidence:reviewed-result-persistence:student-app-ai-tutor-result-archive-reviewed-result-persistence-bridge",
      "evidence:student-visibility-review:teacher-result-archive-review",
    ];
    const port = reviewPort();
    const result = await recordStudentAppAITutorResultStudentVisibilityReview(input, {
      resultStudentVisibilityReviewPort: port,
      reviewLogPath: tempLog(),
      generatedAt: "2026-06-09T12:20:00.000Z",
    });

    assert.equal(result.sourceReviewedResult.learningActionSource, "AI_TUTOR_RESULT_ARCHIVE");
    assert.equal(result.sourceReviewedResult.resultArchiveStatus, "READY_FOR_STUDENT_APP_READ");
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal(result.boundary.futureStudentDeliveryRequiresSeparateRuntime, true);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].source.learningActionSource, "AI_TUTOR_RESULT_ARCHIVE");
    assert.equal(port.calls[0].safety.rawResultRefSentToPort, false);
  });

  it("records a question-bank-feedback-sourced student visibility review through the same review port", async () => {
    const input = baseInput("reports/student-app-ai-tutor-question-bank-feedback-reviewed-result-persistence-bridge.current.json");
    input.reviewInvocationId = "ai_tutor_result_visibility_review_feedback_001";
    input.studentVisibilityReview.reviewId = "ai_tutor_result_visibility_review_feedback_001";
    input.idempotencyKey = "student-app-ai-tutor-question-bank-feedback-visibility-review:ai_tutor_answer_review_gate_feedback_001";
    input.evidenceRefs = [
      "evidence:reviewed-result-persistence:student-app-ai-tutor-question-bank-feedback-reviewed-result-persistence-bridge",
      "evidence:student-visibility-review:teacher-question-bank-feedback-review",
    ];
    const port = reviewPort();
    const result = await recordStudentAppAITutorResultStudentVisibilityReview(input, {
      resultStudentVisibilityReviewPort: port,
      reviewLogPath: tempLog(),
      generatedAt: "2026-06-11T14:30:00.000Z",
    });

    assert.equal(result.sourceReviewedResult.learningActionSource, "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK");
    assert.equal(result.sourceReviewedResult.feedbackStatus, "READY_FOR_STUDENT_APP_READ");
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal(result.boundary.futureStudentDeliveryRequiresSeparateRuntime, true);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].source.learningActionSource, "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK");
    assert.equal(port.calls[0].source.feedbackStatus, "READY_FOR_STUDENT_APP_READ");
    assert.equal(port.calls[0].safety.rawResultRefSentToPort, false);
  });

  it("rejects unsafe result-archive reviewed-result persistence source metadata", async () => {
    const unsafe = baseInput("reports/student-app-ai-tutor-result-archive-reviewed-result-persistence-bridge.current.json");
    unsafe.reviewInvocationId = "ai_tutor_result_visibility_review_archive_unsafe_001";
    unsafe.studentVisibilityReview.reviewId = "ai_tutor_result_visibility_review_archive_unsafe_001";
    unsafe.idempotencyKey = "student-app-ai-tutor-result-archive-visibility-review:unsafe";
    unsafe.reviewedResultPersistenceBridgeReport.safetyInvariants.learningActionSourceRequired = "AI_TUTOR_PUBLISHED_MATERIAL";

    await assert.rejects(
      () => recordStudentAppAITutorResultStudentVisibilityReview(unsafe, {
        resultStudentVisibilityReviewPort: reviewPort(),
        reviewLogPath: tempLog(),
      }),
      /learningActionSourceRequired must be AI_TUTOR_RESULT_ARCHIVE/u,
    );
  });

  it("rejects unsafe question-bank-feedback reviewed-result persistence source metadata", async () => {
    const unsafe = baseInput("reports/student-app-ai-tutor-question-bank-feedback-reviewed-result-persistence-bridge.current.json");
    unsafe.reviewInvocationId = "ai_tutor_result_visibility_review_feedback_unsafe_001";
    unsafe.studentVisibilityReview.reviewId = "ai_tutor_result_visibility_review_feedback_unsafe_001";
    unsafe.idempotencyKey = "student-app-ai-tutor-question-bank-feedback-visibility-review:unsafe";
    unsafe.reviewedResultPersistenceBridgeReport.safetyInvariants.learningActionSourceRequired = "AI_TUTOR_RESULT_ARCHIVE";

    await assert.rejects(
      () => recordStudentAppAITutorResultStudentVisibilityReview(unsafe, {
        resultStudentVisibilityReviewPort: reviewPort(),
        reviewLogPath: tempLog(),
      }),
      /learningActionSourceRequired must be QUESTION_BANK_DRAFT_ANSWER_FEEDBACK/u,
    );
  });

  it("uses idempotency for safe replay and rejects conflicting student visibility reviews", async () => {
    const reviewLogPath = tempLog();
    const port = reviewPort();
    const first = await recordStudentAppAITutorResultStudentVisibilityReview(baseInput(), {
      resultStudentVisibilityReviewPort: port,
      reviewLogPath,
    });
    const replay = await recordStudentAppAITutorResultStudentVisibilityReview(baseInput(), {
      resultStudentVisibilityReviewPort: port,
      reviewLogPath,
    });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);

    const conflicting = baseInput();
    conflicting.studentVisibilityReview.reviewId = "ai_tutor_result_visibility_review_002";
    await assert.rejects(
      () => recordStudentAppAITutorResultStudentVisibilityReview(conflicting, {
        resultStudentVisibilityReviewPort: port,
        reviewLogPath,
      }),
      /idempotency key already exists/u,
    );
  });

  it("rejects missing ports, unsafe reviewers, non-ready sources, and non-approved decisions", async () => {
    await assert.rejects(
      () => recordStudentAppAITutorResultStudentVisibilityReview(baseInput(), { reviewLogPath: tempLog() }),
      /visibility review port is required/u,
    );

    const unsafeReviewer = baseInput();
    unsafeReviewer.principal.role = "STUDENT";
    await assert.rejects(
      () => recordStudentAppAITutorResultStudentVisibilityReview(unsafeReviewer, {
        resultStudentVisibilityReviewPort: reviewPort(),
        reviewLogPath: tempLog(),
      }),
      /role is unsupported/u,
    );

    const notReady = baseInput();
    notReady.reviewedResultPersistenceBridgeReport.readiness = "NEEDS_REMEDIATION";
    await assert.rejects(
      () => recordStudentAppAITutorResultStudentVisibilityReview(notReady, {
        resultStudentVisibilityReviewPort: reviewPort(),
        reviewLogPath: tempLog(),
      }),
      /readiness must be READY/u,
    );

    const rejected = baseInput();
    rejected.studentVisibilityReview.decision = "REJECT_FOR_REVISION";
    await assert.rejects(
      () => recordStudentAppAITutorResultStudentVisibilityReview(rejected, {
        resultStudentVisibilityReviewPort: reviewPort(),
        reviewLogPath: tempLog(),
      }),
      /decision must be APPROVE_FOR_STUDENT_DELIVERY_RUNTIME/u,
    );
  });

  it("rejects unsafe policies, leaked fields, unsafe review notes, unsafe port results, and missing evidence", async () => {
    for (const field of ["studentVisiblePublishAllowed", "studentDeliveryEnvelopeAllowed", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "externalToolUseAllowed", "retrievalAllowed", "localToolMutationAllowed", "swarmAllowed"]) {
      const unsafe = baseInput();
      unsafe.studentVisibilityPolicy[field] = true;
      await assert.rejects(
        () => recordStudentAppAITutorResultStudentVisibilityReview(unsafe, {
          resultStudentVisibilityReviewPort: reviewPort(),
          reviewLogPath: tempLog(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }

    const leaked = baseInput();
    leaked.studentVisibilityReview.rawModelOutput = "raw";
    await assert.rejects(
      () => recordStudentAppAITutorResultStudentVisibilityReview(leaked, {
        resultStudentVisibilityReviewPort: reviewPort(),
        reviewLogPath: tempLog(),
      }),
      /rawModelOutput is not allowed/u,
    );

    const unsafeNotes = baseInput();
    unsafeNotes.studentVisibilityReview.reviewerNotes = "This includes answer key details.";
    await assert.rejects(
      () => recordStudentAppAITutorResultStudentVisibilityReview(unsafeNotes, {
        resultStudentVisibilityReviewPort: reviewPort(),
        reviewLogPath: tempLog(),
      }),
      /unsafe review text/u,
    );

    await assert.rejects(
      () => recordStudentAppAITutorResultStudentVisibilityReview(baseInput(), {
        resultStudentVisibilityReviewPort: reviewPort({ studentVisiblePublished: true }),
        reviewLogPath: tempLog(),
      }),
      /studentVisiblePublished must be false/u,
    );

    const missingEvidence = baseInput();
    missingEvidence.evidenceRefs = ["evidence:reviewed-result-persistence:0327", "evidence:other"];
    await assert.rejects(
      () => recordStudentAppAITutorResultStudentVisibilityReview(missingEvidence, {
        resultStudentVisibilityReviewPort: reviewPort(),
        reviewLogPath: tempLog(),
      }),
      /student-visibility-review evidence ref is required/u,
    );
  });
});

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-result-visibility-review-")), "review.jsonl");
}

function baseInput(sourcePath = "reports/student-app-ai-tutor-reviewed-result-persistence-bridge.current.json") {
  const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const result = source.runtimeProbes.studentAppAiTutorReviewedResultPersistenceBridge?.result
    ?? source.runtimeProbes.studentAppAiTutorResultArchiveReviewedResultPersistenceBridge?.result
    ?? source.runtimeProbes.studentAppAiTutorQuestionBankFeedbackReviewedResultPersistenceBridge?.result;
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-visibility-review.v1",
    reviewInvocationId: "ai_tutor_result_visibility_review_001",
    reviewedResultPersistenceBridgeReport: source,
    principal: {
      principalId: "teacher_visibility_reviewer_001",
      subjectType: "USER",
      role: "TEACHER",
      entryPoint: "DESKTOP_TEACHER",
      sessionId: "teacher_session_visibility_001",
      scopes: ["TEACHING_READ", "TEACHING_WRITE"],
    },
    studentVisibilityReview: {
      reviewId: "ai_tutor_result_visibility_review_001",
      persistenceRecordId: result.recordId,
      sourceReviewId: result.reviewedResult.reviewId,
      artifactId: result.reviewedResult.artifactId,
      requestId: result.reviewedResult.requestId,
      archiveItemId: result.reviewedResult.archiveItemId,
      guidanceSectionsHash: result.reviewedResult.guidanceSectionsHash,
      decision: "APPROVE_FOR_STUDENT_DELIVERY_RUNTIME",
      reviewerPrincipalId: "teacher_visibility_reviewer_001",
      reviewedAt: "2026-06-08T10:40:00.000Z",
      reviewerNotes: "Reviewed result is learner-safe and ready for a future delivery envelope runtime.",
      reviewChecklist: {
        reviewedResultPersisted: true,
        learnerSafetyConfirmed: true,
        guidanceHashMatches: true,
        rawModelOutputAbsent: true,
        promptAbsent: true,
        answerKeyAbsent: true,
        contentRefAbsent: true,
        resultRefNotExposed: true,
        studentDeliveryRequiresSeparateRuntime: true,
      },
    },
    studentVisibilityPolicy: {
      reviewedResultPersistenceRequired: true,
      humanStudentVisibilityReviewRequired: true,
      futureStudentDeliveryRuntimeRequired: true,
      futureArchivePersistenceRuntimeRequired: true,
      studentVisiblePublishAllowed: false,
      studentDeliveryEnvelopeAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      retrievalAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      "evidence:reviewed-result-persistence:student-app-ai-tutor-reviewed-result-persistence-bridge",
      "evidence:student-visibility-review:teacher-human-review",
    ],
    idempotencyKey: "student-app-ai-tutor-result-visibility-review:ai_tutor_answer_review_gate_001",
  };
}

function reviewPort(overrides = {}) {
  const calls = [];
  return {
    calls,
    async recordResultStudentVisibilityReview(request) {
      calls.push(request);
      return {
        studentVisibilityReview: {
          reviewId: request.visibilityReviewId,
          persistenceRecordId: request.persistenceRecordId,
          requestId: request.requestId,
          decision: request.decision,
          status: "AI_TUTOR_RESULT_STUDENT_VISIBILITY_APPROVED_NOT_DELIVERED",
          studentVisiblePublished: false,
          studentDeliveryEnvelopeCreated: false,
          guidanceTextStored: false,
          ...overrides,
        },
      };
    },
  };
}
