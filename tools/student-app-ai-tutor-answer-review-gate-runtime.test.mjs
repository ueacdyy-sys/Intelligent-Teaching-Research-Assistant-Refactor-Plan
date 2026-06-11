import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_PORT,
  STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_RUNTIME_ID,
  recordStudentAppAITutorAnswerReviewGate,
} from "./student-app-ai-tutor-answer-review-gate-runtime.mjs";

describe("Student App AI Tutor answer review gate runtime", () => {
  it("records a human review gate without result persistence or student visibility", async () => {
    const calls = [];
    const result = await recordStudentAppAITutorAnswerReviewGate(baseInput(), {
      generatedAt: "2026-06-08T09:10:00.000Z",
      reviewLogPath: tempLog(),
      answerReviewGatePort: port(calls),
    });

    assert.equal(result.runtimeId, STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_RUNTIME_ID);
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_RECORDED");
    assert.equal(result.answerReviewGate.status, "AI_TUTOR_ANSWER_REVIEW_APPROVED_NOT_PERSISTED");
    assert.equal(result.boundary.guidanceTextSentToPort, false);
    assert.equal(result.boundary.tutoringResultRecorded, false);
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal(calls.length, 1);
    assert.equal(JSON.stringify(calls[0]).includes("Convert both fractions"), false);
  });

  it("records a result-archive-sourced answer review gate without leaking guidance text", async () => {
    const calls = [];
    const input = baseInput("reports/student-app-ai-tutor-result-archive-controlled-answer-artifact.current.json");
    input.reviewInvocationId = "ai_tutor_answer_review_result_archive_001";
    input.evidenceRefs[0] = "evidence:result-archive-controlled-answer-artifact:student-app-ai-tutor-result-archive-controlled-answer-artifact";
    input.idempotencyKey = `${input.idempotencyKey}:result-archive`;
    const result = await recordStudentAppAITutorAnswerReviewGate(input, {
      generatedAt: "2026-06-09T11:40:00.000Z",
      reviewLogPath: tempLog(),
      answerReviewGatePort: port(calls),
    });

    assert.equal(result.learningActionSource, "AI_TUTOR_RESULT_ARCHIVE");
    assert.equal(result.resultArchiveStatus, "READY_FOR_STUDENT_APP_READ");
    assert.equal(result.answerReviewGate.status, "AI_TUTOR_ANSWER_REVIEW_APPROVED_NOT_PERSISTED");
    assert.equal(result.boundary.tutoringResultRecorded, false);
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal(JSON.stringify(calls[0]).includes("Review the previous correction"), false);
  });

  it("records a question-bank-feedback-sourced answer review gate without leaking guidance text or feedback ids", async () => {
    const calls = [];
    const input = baseInput("reports/student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact.current.json");
    input.reviewInvocationId = "ai_tutor_answer_review_feedback_001";
    input.evidenceRefs[0] = "evidence:question-bank-feedback-controlled-answer-artifact:student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact";
    input.idempotencyKey = `${input.idempotencyKey}:question-bank-feedback`;
    const result = await recordStudentAppAITutorAnswerReviewGate(input, {
      generatedAt: "2026-06-11T10:05:00.000Z",
      reviewLogPath: tempLog(),
      answerReviewGatePort: port(calls),
    });

    assert.equal(result.learningActionSource, "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK");
    assert.equal(result.feedbackStatus, "READY_FOR_STUDENT_APP_READ");
    assert.equal(result.answerReviewGate.status, "AI_TUTOR_ANSWER_REVIEW_APPROVED_NOT_PERSISTED");
    assert.equal(result.boundary.resultPersistenceStarted, false);
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal(JSON.stringify(calls[0]).includes("Restate the feedback in your own words"), false);
    assert.equal(JSON.stringify(calls[0]).includes("qbank_ans_sub_feedback_001"), false);
    assert.equal(JSON.stringify(calls[0]).includes("tarch_homework_feedback_source_001"), false);
  });

  it("uses idempotency for safe replay and rejects conflicting review gates", async () => {
    const reviewLogPath = tempLog();
    const first = await recordStudentAppAITutorAnswerReviewGate(baseInput(), {
      reviewLogPath,
      answerReviewGatePort: port(),
    });
    const replay = await recordStudentAppAITutorAnswerReviewGate(baseInput(), {
      reviewLogPath,
      answerReviewGatePort: port(),
    });
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.inputHash, first.inputHash);

    const conflicting = baseInput();
    conflicting.reviewDecision.decision = "REJECT_FOR_REVISION";
    await assert.rejects(
      () => recordStudentAppAITutorAnswerReviewGate(conflicting, {
        reviewLogPath,
        answerReviewGatePort: port(),
      }),
      /inputHash does not match/,
    );
  });

  it("rejects missing ports, unsafe reviewers, and unsafe source reports", async () => {
    await assert.rejects(
      () => recordStudentAppAITutorAnswerReviewGate(baseInput(), { reviewLogPath: tempLog() }),
      /answer review gate port is required/,
    );

    const unsafeReviewer = baseInput();
    unsafeReviewer.principal.scopes = ["TEACHING_READ"];
    await assert.rejects(
      () => recordStudentAppAITutorAnswerReviewGate(unsafeReviewer, {
        reviewLogPath: tempLog(),
        answerReviewGatePort: port(),
      }),
      /TEACHING_WRITE/,
    );

    const badSource = baseInput();
    badSource.controlledAnswerArtifactReport.readiness = "NEEDS_REMEDIATION";
    await assert.rejects(
      () => recordStudentAppAITutorAnswerReviewGate(badSource, {
        reviewLogPath: tempLog(),
        answerReviewGatePort: port(),
      }),
      /readiness must be READY/,
    );

    const unsafeResultArchiveSource = baseInput("reports/student-app-ai-tutor-result-archive-controlled-answer-artifact.current.json");
    unsafeResultArchiveSource.controlledAnswerArtifactReport.safetyInvariants.learningActionSourceRequired = "PUBLISHED_STUDY_PACKET";
    await assert.rejects(
      () => recordStudentAppAITutorAnswerReviewGate(unsafeResultArchiveSource, {
        reviewLogPath: tempLog(),
        answerReviewGatePort: port(),
      }),
      /learningActionSourceRequired must be AI_TUTOR_RESULT_ARCHIVE/,
    );

    const unsafeQuestionBankFeedbackSource = baseInput("reports/student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact.current.json");
    unsafeQuestionBankFeedbackSource.controlledAnswerArtifactReport.safetyInvariants.learningActionSourceRequired = "PUBLISHED_STUDY_PACKET";
    await assert.rejects(
      () => recordStudentAppAITutorAnswerReviewGate(unsafeQuestionBankFeedbackSource, {
        reviewLogPath: tempLog(),
        answerReviewGatePort: port(),
      }),
      /learningActionSourceRequired must be QUESTION_BANK_DRAFT_ANSWER_FEEDBACK/,
    );
  });

  it("rejects leaked fields and unsafe review decisions", async () => {
    const leaked = baseInput();
    leaked.reviewDecision.rawModelOutput = "raw";
    await assert.rejects(
      () => recordStudentAppAITutorAnswerReviewGate(leaked, {
        reviewLogPath: tempLog(),
        answerReviewGatePort: port(),
      }),
      /rawModelOutput is not allowed/,
    );

    const unsafeText = baseInput();
    unsafeText.reviewDecision.reviewerNotes = "Contains answer key details.";
    await assert.rejects(
      () => recordStudentAppAITutorAnswerReviewGate(unsafeText, {
        reviewLogPath: tempLog(),
        answerReviewGatePort: port(),
      }),
      /unsafe review text/,
    );

    const unsafeChecklist = baseInput();
    unsafeChecklist.reviewDecision.reviewChecklist.studentVisibilityRequiresSeparateRuntime = false;
    await assert.rejects(
      () => recordStudentAppAITutorAnswerReviewGate(unsafeChecklist, {
        reviewLogPath: tempLog(),
        answerReviewGatePort: port(),
      }),
      /studentVisibilityRequiresSeparateRuntime must be true/,
    );
  });

  it("rejects unsafe port results", async () => {
    await assert.rejects(
      () => recordStudentAppAITutorAnswerReviewGate(baseInput(), {
        reviewLogPath: tempLog(),
        answerReviewGatePort: {
          async recordAnswerReviewGate(request) {
            const result = await port().recordAnswerReviewGate(request);
            result.answerReviewGate.studentVisiblePublished = true;
            return result;
          },
        },
      }),
      /studentVisiblePublished must be false/,
    );
  });
});

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-answer-review-gate-test-")), "review.jsonl");
}

function port(calls = []) {
  return {
    async recordAnswerReviewGate(request) {
      calls.push(request);
      return {
        answerReviewGate: {
          reviewId: "ai_tutor_answer_review_gate_001",
          artifactId: request.artifactId,
          requestId: request.requestId,
          workerId: request.workerId,
          precheckId: request.precheckId,
          queueRef: request.queueRef,
          reviewerPrincipalId: request.reviewerPrincipalId,
          decision: request.decision,
          guidanceSectionsHash: request.guidanceSectionsHash,
          status: request.decision === "APPROVE_FOR_RESULT_PERSISTENCE"
            ? "AI_TUTOR_ANSWER_REVIEW_APPROVED_NOT_PERSISTED"
            : "AI_TUTOR_ANSWER_REVIEW_REJECTED_FOR_REVISION",
          resultPersistenceStarted: false,
          tutoringResultRecorded: false,
          studentVisiblePublished: false,
        },
      };
    },
  };
}

function baseInput(reportPath = "reports/student-app-ai-tutor-controlled-answer-artifact.current.json") {
  const controlledAnswerArtifactReport = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const result = artifactResult(controlledAnswerArtifactReport);
  const artifact = result.controlledAnswerArtifact;
  const guidanceSectionsHash = hashGuidanceSections(artifact.guidanceSections);
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-answer-review-gate.v1",
    reviewInvocationId: "ai_tutor_answer_review_001",
    controlledAnswerArtifactReport,
    principal: {
      principalId: "teacher_reviewer_001",
      subjectType: "USER",
      role: "TEACHER",
      entryPoint: "DESKTOP_TEACHER",
      sessionId: "teacher_session_001",
      scopes: ["TEACHING_READ", "TEACHING_WRITE"],
    },
    reviewDecision: {
      artifactId: artifact.artifactId,
      requestId: result.requestId,
      workerId: result.workerId,
      precheckId: result.precheckId,
      queueRef: result.queueRef,
      decision: "APPROVE_FOR_RESULT_PERSISTENCE",
      guidanceSectionsHash,
      reviewerNotes: "Guidance is learner-safe and ready for the next controlled persistence slice.",
      reviewChecklist: {
        sourceArtifactVerified: true,
        guidanceSafeForLearner: true,
        rawModelOutputAbsent: true,
        promptAbsent: true,
        answerKeyAbsent: true,
        resultPersistenceRequiresSeparateRuntime: true,
        studentVisibilityRequiresSeparateRuntime: true,
      },
      reviewedAt: "2026-06-08T09:10:00.000Z",
    },
    evidenceRefs: [
      "evidence:controlled-answer-artifact:student-app-ai-tutor-controlled-answer-artifact",
      "evidence:answer-review-gate:teacher-human-review",
    ],
    idempotencyKey: `student-app-ai-tutor-answer-review-gate:${artifact.artifactId}`,
  };
}

function artifactResult(report) {
  return report.runtimeProbes.studentAppAiTutorControlledAnswerArtifact?.result
    ?? report.runtimeProbes.studentAppAiTutorResultArchiveControlledAnswerArtifact?.result
    ?? report.runtimeProbes.studentAppAiTutorQuestionBankFeedbackControlledAnswerArtifact.result;
}

function hashGuidanceSections(sections) {
  const metadata = sections.map((section) => ({
    sectionId: section.sectionId,
    title: section.title,
    textHash: hashInput(section.text),
    sourceBlockRefs: section.sourceBlockRefs,
  }));
  return hashInput(metadata);
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
