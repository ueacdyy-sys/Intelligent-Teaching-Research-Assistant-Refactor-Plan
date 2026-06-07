import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_PORT,
  formatStudentAppAITutorQuestionBankDraftGenerationTeacherReview,
  recordStudentAppAITutorQuestionBankDraftGenerationTeacherReview,
} from "./student-app-ai-tutor-question-bank-draft-generation-teacher-review-runtime.mjs";

describe("Student App AI Tutor question-bank draft generation teacher review runtime", () => {
  it("records teacher review approval without content storage", async () => {
    const port = recordingTeacherReviewPort();
    const result = await recordStudentAppAITutorQuestionBankDraftGenerationTeacherReview(baseInput(), {
      teacherReviewPort: port,
      reviewLogPath: tempReviewLogPath(),
      generatedAt: "2026-06-06T17:20:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-teacher-review-recorded.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_RECORDED");
    assert.equal(result.teacherReview.decision, "APPROVED_FOR_CONTENT_STORAGE_NOT_COMMITTED");
    assert.equal(result.teacherReview.executionState, "TEACHER_REVIEW_RECORDED_NOT_STORED");
    assert.equal(result.teacherReview.reviewedItems.length, 3);
    assert.equal(result.boundary.humanReviewCompleted, true);
    assert.equal(result.boundary.contentStorageApprovalRecorded, true);
    assert.equal(result.boundary.questionBankContentWriteStarted, false);
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].sourceControlledDraft.items.length, 3);
    assert.match(formatStudentAppAITutorQuestionBankDraftGenerationTeacherReview(result), /Content stored: false/u);
  });

  it("uses idempotency for replay and rejects conflicting teacher reviews", async () => {
    const reviewLogPath = tempReviewLogPath();
    const port = recordingTeacherReviewPort();
    const first = await recordStudentAppAITutorQuestionBankDraftGenerationTeacherReview(baseInput(), {
      teacherReviewPort: port,
      reviewLogPath,
    });
    const replay = await recordStudentAppAITutorQuestionBankDraftGenerationTeacherReview(baseInput(), {
      teacherReviewPort: port,
      reviewLogPath,
    });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(reviewLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.teacherReview.reviewedItems[0].questionText = "A different teacher edit that should conflict with replay.";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationTeacherReview(conflicting, {
        teacherReviewPort: port,
        reviewLogPath,
      }),
      /record\.inputHash must be/u,
    );
  });

  it("rejects missing ports, unsafe reviewers, unsafe source state, and unsafe policy", async () => {
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationTeacherReview(baseInput(), { reviewLogPath: tempReviewLogPath() }),
      /TeacherReviewPort\.recordGeneratedDraftTeacherReview is required/u,
    );

    const unsafeReviewer = baseInput();
    unsafeReviewer.principal.role = "STUDENT";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationTeacherReview(unsafeReviewer, {
        teacherReviewPort: recordingTeacherReviewPort(),
        reviewLogPath: tempReviewLogPath(),
      }),
      /input\.principal\.role must be one of TEACHER,ADMIN/u,
    );

    const unsafeSource = baseInput();
    unsafeSource.controlledDraftReport.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationControlledDraft.result.generatedDraft.executionState = "CONTROLLED_DRAFT_STORED";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationTeacherReview(unsafeSource, {
        teacherReviewPort: recordingTeacherReviewPort(),
        reviewLogPath: tempReviewLogPath(),
      }),
      /source\.controlledDraftResult\.generatedDraft\.executionState must be CONTROLLED_DRAFT_RECORDED_NOT_STORED/u,
    );

    for (const field of ["questionBankContentWriteStarted", "studentAnsweringAllowed", "scoringAllowed", "studentVisiblePublishAllowed", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.reviewPolicy[field] = true;
      await assert.rejects(
        () => recordStudentAppAITutorQuestionBankDraftGenerationTeacherReview(input, {
          teacherReviewPort: recordingTeacherReviewPort(),
          reviewLogPath: tempReviewLogPath(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }
  });

  it("rejects leaked model/answer fields, unknown items, unsafe text, and unsafe port results", async () => {
    const leaked = baseInput();
    leaked.teacherReview.reviewedItems[0].expectedAnswer = "leak";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationTeacherReview(leaked, {
        teacherReviewPort: recordingTeacherReviewPort(),
        reviewLogPath: tempReviewLogPath(),
      }),
      /expectedAnswer is not allowed/u,
    );

    const unknown = baseInput();
    unknown.teacherReview.reviewedItems[0].itemId = "qbank_plan_item_999";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationTeacherReview(unknown, {
        teacherReviewPort: recordingTeacherReviewPort(),
        reviewLogPath: tempReviewLogPath(),
      }),
      /qbank_plan_item_999 is not in the controlled draft/u,
    );

    const unsafeText = baseInput();
    unsafeText.teacherReview.reviewedItems[0].questionText = "<script>bad</script>";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationTeacherReview(unsafeText, {
        teacherReviewPort: recordingTeacherReviewPort(),
        reviewLogPath: tempReviewLogPath(),
      }),
      /questionText contains unsafe text/u,
    );

    const unsafePort = recordingTeacherReviewPort({ status: "TEACHER_REVIEW_STORED" });
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationTeacherReview(baseInput(), {
        teacherReviewPort: unsafePort,
        reviewLogPath: tempReviewLogPath(),
      }),
      /portResult\.teacherReview\.status must be TEACHER_REVIEW_APPROVED_FOR_CONTENT_STORAGE_NOT_COMMITTED/u,
    );
  });

  it("requires human review checklist, future storage commit, and controlled draft evidence refs", async () => {
    const missingChecklist = baseInput();
    missingChecklist.teacherReview.checklist.humanReviewed = false;
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationTeacherReview(missingChecklist, {
        teacherReviewPort: recordingTeacherReviewPort(),
        reviewLogPath: tempReviewLogPath(),
      }),
      /input\.teacherReview\.checklist\.humanReviewed must be true/u,
    );

    const missingFutureCommit = baseInput();
    missingFutureCommit.reviewPolicy.requiresFutureContentStorageCommit = false;
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationTeacherReview(missingFutureCommit, {
        teacherReviewPort: recordingTeacherReviewPort(),
        reviewLogPath: tempReviewLogPath(),
      }),
      /input\.reviewPolicy\.requiresFutureContentStorageCommit must be true/u,
    );

    const missingEvidence = baseInput();
    missingEvidence.evidenceRefs = ["evidence:other"];
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationTeacherReview(missingEvidence, {
        teacherReviewPort: recordingTeacherReviewPort(),
        reviewLogPath: tempReviewLogPath(),
      }),
      /controlled draft evidence ref is required/u,
    );
  });
});

function tempReviewLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-teacher-review-")), "review.jsonl");
}

function baseInput() {
  const controlledDraftReport = JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-controlled-draft.current.json", "utf8"));
  const draft = controlledDraftReport.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationControlledDraft.result.generatedDraft;
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-teacher-review.v1",
    reviewInvocationId: "qbank_generation_teacher_review_001",
    controlledDraftReport,
    principal: {
      principalId: "teacher_001",
      subjectType: "USER",
      role: "TEACHER",
      entryPoint: "DESKTOP_TEACHER",
      sessionId: "teacher_session_001",
      scopes: ["TEACHING_WRITE", "QUESTION_BANK_DRAFT_REVIEW"],
    },
    teacherReview: {
      reviewId: "qbank_generation_review_001",
      controlledDraftArtifactId: draft.artifactId,
      questionBankDraftRef: draft.questionBankDraftRef,
      studentId: draft.studentId,
      reviewerPrincipalId: "teacher_001",
      reviewedAt: "2026-06-06T17:19:00.000Z",
      reviewDecision: "APPROVED_FOR_CONTENT_STORAGE_NOT_COMMITTED",
      reviewedItems: draft.items.map((item, index) => ({
        itemId: item.itemId,
        questionType: item.questionType,
        difficulty: item.difficulty,
        knowledgePoint: item.knowledgePoint,
        questionText: `${item.questionText} Teacher reviewed version.`,
        teacherAnswerRubric: `Teacher rubric ${index + 1}: accept mathematically equivalent correct reasoning.`,
        teacherExplanationForScoring: `Teacher scoring note ${index + 1}: check the process and final response.`,
        learningTarget: `Practice ${item.knowledgePoint}`,
        hintPolicy: item.hintPolicy,
        maxHints: item.maxHints,
        sourceEvidenceRef: item.sourceEvidenceRef,
        reviewAction: index === 0 ? "APPROVED_WITH_TEACHER_EDITS" : "APPROVED_AS_IS",
      })),
      checklist: reviewChecklist(),
    },
    reviewPolicy: reviewPolicy(),
    evidenceRefs: [
      "evidence:generation-controlled-draft:qbank_generation_controlled_draft_tutor_req_student_app_001",
    ],
    idempotencyKey: "student-app-ai-tutor-qbank-generation-teacher-review:student_001:qbank_generation_controlled_draft_tutor_req_student_app_001",
  };
}

function reviewChecklist() {
  return {
    humanReviewed: true,
    ageAppropriate: true,
    studentOwnScopeConfirmed: true,
    sourceEvidenceRetained: true,
    teacherRubricAuthored: true,
    rawModelOutputAbsent: true,
    answerKeyNotModelGenerated: true,
    studentVisibilityBlocked: true,
    contentStorageRequiresFutureCommit: true,
  };
}

function reviewPolicy() {
  return {
    teacherReviewOnly: true,
    contentStorageApprovalRecorded: true,
    questionBankContentWriteStarted: false,
    studentAnsweringAllowed: false,
    scoringAllowed: false,
    studentVisiblePublishAllowed: false,
    rawModelOutputStored: false,
    answerKeyGeneratedByModel: false,
    studentAnswerKeyDisclosed: false,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    swarmAllowed: false,
    requiresFutureContentStorageCommit: true,
  };
}

function recordingTeacherReviewPort(overrides = {}) {
  const calls = [];
  return {
    calls,
    async recordGeneratedDraftTeacherReview(request) {
      calls.push(request);
      return {
        teacherReview: {
          reviewId: request.teacherReview.reviewId,
          controlledDraftArtifactId: request.sourceControlledDraft.artifactId,
          questionBankDraftRef: request.sourceControlledDraft.questionBankDraftRef,
          studentId: request.sourceControlledDraft.studentId,
          decision: "APPROVED_FOR_CONTENT_STORAGE_NOT_COMMITTED",
          status: "TEACHER_REVIEW_APPROVED_FOR_CONTENT_STORAGE_NOT_COMMITTED",
          executionState: "TEACHER_REVIEW_RECORDED_NOT_STORED",
          ...overrides,
        },
      };
    },
  };
}
