import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_PORT,
  recordTeachingArchiveMaterialDraftHumanReview,
} from "./teaching-archive-material-draft-human-review-runtime.mjs";

describe("TeachingArchiveMaterialDraftReviewPort.recordArchiveMaterialDraftHumanReview", () => {
  it("records approved human review without final archive writes", async () => {
    const reviewLogPath = tempReviewLogPath();
    const result = await recordTeachingArchiveMaterialDraftHumanReview(baseInput(), {
      reviewLogPath,
      generatedAt: "2026-06-07T07:00:00.000Z",
      reviewPort: approvingPort(),
    });

    assert.equal(result.commandPort, TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_PORT);
    assert.equal(result.status, "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_APPROVED_FOR_PRECOMMIT");
    assert.equal(result.humanReview.decision, "APPROVED_FOR_PRECOMMIT");
    assert.equal(result.boundary.precommitCandidateAllowed, true);
    assert.equal(result.boundary.finalArchiveItemWriteStarted, false);
    assert.equal(result.boundary.mainDatabaseWriteStarted, false);
    assert.equal(result.boundary.ocrOrRagJobWriteStarted, false);
    assert.equal(result.boundary.swarmAllowed, false);
    assert.equal(result.runtimeSlo.p99Ms, 6);

    const records = readRecords(reviewLogPath);
    assert.equal(records.length, 1);
    assert.equal(records[0].runtimeId, "teaching_archive_material_draft_human_review_runtime");
    assert.equal(records[0].boundary.requiresFutureStoragePrecommit, true);
  });

  it("records revision-required human review and blocks precommit", async () => {
    const result = await recordTeachingArchiveMaterialDraftHumanReview(baseInput({
      humanReview: revisionReview(),
      idempotencyKey: "archive-material-draft-review:revision:001",
    }), {
      reviewLogPath: tempReviewLogPath(),
      generatedAt: "2026-06-07T07:00:00.000Z",
      reviewPort: approvingPort("REVISION_REQUIRED"),
    });

    assert.equal(result.status, "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_REVISION_REQUIRED");
    assert.equal(result.boundary.precommitCandidateAllowed, false);
    assert.equal(result.boundary.requiresFutureStoragePrecommit, false);
  });

  it("uses idempotency for replay and rejects conflicting reviews", async () => {
    const reviewLogPath = tempReviewLogPath();
    const first = await recordTeachingArchiveMaterialDraftHumanReview(baseInput(), {
      reviewLogPath,
      generatedAt: "2026-06-07T07:00:00.000Z",
      reviewPort: approvingPort(),
    });
    const second = await recordTeachingArchiveMaterialDraftHumanReview(baseInput(), {
      reviewLogPath,
      generatedAt: "2026-06-07T07:05:00.000Z",
      reviewPort: approvingPort(),
    });

    assert.equal(first.recordId, second.recordId);
    assert.equal(second.idempotentReplay, true);
    assert.equal(readRecords(reviewLogPath).length, 1);

    await assert.rejects(
      () => recordTeachingArchiveMaterialDraftHumanReview(baseInput({
        humanReview: { ...approvedReview(), comments: "Changed review under same idempotency key." },
      }), { reviewLogPath, reviewPort: approvingPort() }),
      /record\.inputHash/u,
    );
  });

  it("rejects missing ports, unsafe reviewers, unsafe source state, and unsafe policy", async () => {
    const reviewLogPath = tempReviewLogPath();

    await assert.rejects(
      () => recordTeachingArchiveMaterialDraftHumanReview(baseInput(), { reviewLogPath }),
      /recordArchiveMaterialDraftHumanReview/u,
    );
    assert.equal(existsSync(reviewLogPath), false);

    await assert.rejects(
      () => recordTeachingArchiveMaterialDraftHumanReview(baseInput({
        principal: { ...teacherReviewer(), scopes: ["TEACHING_WRITE"] },
      }), { reviewLogPath, reviewPort: approvingPort() }),
      /HARNESS_APPROVE or ADMIN_SYSTEM/u,
    );

    await assert.rejects(
      () => recordTeachingArchiveMaterialDraftHumanReview(baseInput({
        sourceDraftIntentReport: {
          ...sourceDraftIntentReport(),
          boundary: { ...sourceDraftIntentReport().boundary, finalArchiveItemWriteAllowed: true },
        },
      }), { reviewLogPath, reviewPort: approvingPort() }),
      /finalArchiveItemWriteAllowed/u,
    );

    await assert.rejects(
      () => recordTeachingArchiveMaterialDraftHumanReview(baseInput({
        reviewPolicy: { ...reviewPolicy(), mainDatabaseWriteStarted: true },
      }), { reviewLogPath, reviewPort: approvingPort() }),
      /mainDatabaseWriteStarted/u,
    );
  });

  it("rejects leaked fields, missing checklist, missing evidence, and unsafe port results", async () => {
    await assert.rejects(
      () => recordTeachingArchiveMaterialDraftHumanReview(baseInput({
        draftIntent: { ...draftIntent(), contentRef: "final://archive-item/ref" },
      }), { reviewLogPath: tempReviewLogPath(), reviewPort: approvingPort() }),
      /contentRef/u,
    );

    await assert.rejects(
      () => recordTeachingArchiveMaterialDraftHumanReview(baseInput({
        humanReview: {
          ...approvedReview(),
          checklist: { ...approvedReview().checklist, noOcrRagStarted: false },
        },
      }), { reviewLogPath: tempReviewLogPath(), reviewPort: approvingPort() }),
      /noOcrRagStarted/u,
    );

    await assert.rejects(
      () => recordTeachingArchiveMaterialDraftHumanReview(baseInput({
        evidenceRefs: ["evidence:unrelated"],
      }), { reviewLogPath: tempReviewLogPath(), reviewPort: approvingPort() }),
      /archive material draft intent evidence/u,
    );

    await assert.rejects(
      () => recordTeachingArchiveMaterialDraftHumanReview(baseInput(), {
        reviewLogPath: tempReviewLogPath(),
        reviewPort: {
          async recordArchiveMaterialDraftHumanReview(request) {
            return {
              humanReview: {
                reviewId: request.humanReview.reviewId,
                draftIntentId: request.draftIntent.draftIntentId,
                decision: "APPROVED_FOR_PRECOMMIT",
                status: "UNEXPECTED_STATUS",
                executionState: "HUMAN_REVIEW_RECORDED_NOT_COMMITTED",
              },
            };
          },
        },
      }),
      /status/u,
    );
  });
});

function baseInput(overrides = {}) {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-draft-human-review.v1",
    reviewInvocationId: "archive_material_draft_review_001",
    sourceDraftIntentReport: sourceDraftIntentReport(),
    principal: teacherReviewer(),
    draftIntent: draftIntent(),
    humanReview: approvedReview(),
    reviewPolicy: reviewPolicy(),
    evidenceRefs: ["evidence:archive-material-draft-intent:archive_material_draft_intent_001"],
    idempotencyKey: "archive-material-draft-review:student_001:fractions_packet",
    ...overrides,
  };
}

function sourceDraftIntentReport() {
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_DRAFT_INTENT_RUNTIME",
    commandPort: "TeachingDraftCommandPort.submitArchiveMaterialDraftIntent",
    boundary: {
      status: "REVIEW_REQUIRED",
      executionCandidateAllowed: false,
      finalArchiveItemWriteAllowed: false,
      ocrOrRagJobWriteAllowed: false,
      finalAiGradingWriteAllowed: false,
    },
  };
}

function teacherReviewer() {
  return {
    principalId: "teacher_001",
    subjectType: "USER",
    role: "TEACHER",
    entryPoint: "DESKTOP_TEACHER",
    sessionId: "teacher_session_001",
    scopes: ["TEACHING_WRITE", "HARNESS_APPROVE"],
  };
}

function draftIntent() {
  return {
    draftIntentId: "archive_material_draft_intent_001",
    ownerType: "STUDENT",
    studentId: "student_001",
    materialType: "HANDOUT",
    source: "AGENT_DRAFT",
    title: "Fractions practice packet",
    draftArtifactRef: "draft://archive-material/student_001/fractions-packet",
    sourceRefs: ["source://lesson/fractions/week-01"],
  };
}

function approvedReview() {
  return {
    reviewId: "archive_material_draft_review_001",
    draftIntentId: "archive_material_draft_intent_001",
    reviewerPrincipalId: "teacher_001",
    reviewedAt: "2026-06-07T06:59:00.000Z",
    decision: "APPROVED_FOR_PRECOMMIT",
    checklist: reviewChecklist(),
    comments: "Ready for storage precommit after review.",
  };
}

function revisionReview() {
  return {
    ...approvedReview(),
    reviewId: "archive_material_draft_review_revision_001",
    decision: "REVISION_REQUIRED",
    comments: "Add the missing source page before precommit.",
  };
}

function reviewChecklist() {
  return {
    humanReviewed: true,
    targetOwnerConfirmed: true,
    sourceRefsReviewed: true,
    contentSafetyReviewed: true,
    studentPrivacyReviewed: true,
    rollbackPlanReviewed: true,
    noFinalArchiveItemCreated: true,
    noOcrRagStarted: true,
  };
}

function reviewPolicy() {
  return {
    humanReviewRequired: true,
    precommitCandidateAllowed: true,
    finalArchiveItemWriteStarted: false,
    mainDatabaseWriteStarted: false,
    ocrOrRagJobWriteStarted: false,
    aiGradingWriteStarted: false,
    executionCandidateAllowed: false,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    swarmAllowed: false,
    requiresFutureStoragePrecommit: true,
  };
}

function approvingPort(decision = "APPROVED_FOR_PRECOMMIT") {
  return {
    async recordArchiveMaterialDraftHumanReview(request) {
      return {
        humanReview: {
          reviewId: request.humanReview.reviewId,
          draftIntentId: request.draftIntent.draftIntentId,
          decision: request.humanReview.decision,
          status: decision === "APPROVED_FOR_PRECOMMIT"
            ? "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_APPROVED_FOR_PRECOMMIT"
            : "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_REVISION_REQUIRED",
          executionState: "HUMAN_REVIEW_RECORDED_NOT_COMMITTED",
        },
      };
    },
  };
}

function tempReviewLogPath() {
  return join(mkdtempSync(join(tmpdir(), "teaching-archive-material-review-")), "review.jsonl");
}

function readRecords(reviewLogPath) {
  return readFileSync(reviewLogPath, "utf8")
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
