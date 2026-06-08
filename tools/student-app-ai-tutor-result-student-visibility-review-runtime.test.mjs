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

function baseInput() {
  const source = JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-reviewed-result-persistence-bridge.current.json", "utf8"));
  const result = source.runtimeProbes.studentAppAiTutorReviewedResultPersistenceBridge.result;
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
