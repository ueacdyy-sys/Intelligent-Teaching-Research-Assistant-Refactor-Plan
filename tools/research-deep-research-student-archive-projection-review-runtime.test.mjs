import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_COMMAND_PORT,
  formatDeepResearchStudentArchiveProjectionReview,
  recordDeepResearchStudentArchiveProjectionReview,
} from "./research-deep-research-student-archive-projection-review-runtime.mjs";

describe("Research deep_research student archive projection review runtime", () => {
  it("records a durable projection review without writing the student archive", () => {
    const result = recordDeepResearchStudentArchiveProjectionReview(baseInput(), {
      reviewLogPath: tempReviewLogPath(),
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-05.research.deep-research-student-archive-projection-review-recorded.v1");
    assert.equal(result.commandPort, RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_COMMAND_PORT);
    assert.equal(result.status, "STUDENT_ARCHIVE_PROJECTION_REVIEW_APPROVED_NOT_WRITTEN");
    assert.equal(result.studentArchiveProjectionReview.reviewKind, "DURABLE_STUDENT_ARCHIVE_PROJECTION_REVIEW");
    assert.equal(result.studentArchiveProjectionReview.projectionState, "REVIEWED_NOT_PROJECTED_TO_STUDENT_ARCHIVE");
    assert.equal(result.studentArchiveProjectionReview.approvedForFutureDurableProjection, true);
    assert.equal(result.boundary.studentArchivePersistenceCommandVerified, true);
    assert.equal(result.boundary.humanProjectionReviewRecorded, true);
    assert.equal(result.boundary.approvedForFutureDurableProjection, true);
    assert.equal(result.boundary.studentArchivePersisted, false);
    assert.equal(result.boundary.studentArchiveProjectionWritten, false);
    assert.equal(result.boundary.mainDatabaseWriteStarted, false);
    assert.equal(result.boundary.requiresFutureDurableProjectionRuntime, true);
    assert.match(result.evidenceRefs.join("\n"), /evidence:student-archive-projection-review-input-hash:sha256:/u);
    assert.match(formatDeepResearchStudentArchiveProjectionReview(result), /Projected: false/u);
  });

  it("uses idempotency for safe replay and rejects conflicting projection reviews", () => {
    const reviewLogPath = tempReviewLogPath();
    const first = recordDeepResearchStudentArchiveProjectionReview(baseInput(), { reviewLogPath });
    const second = recordDeepResearchStudentArchiveProjectionReview(baseInput(), { reviewLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(second.idempotentReplay, true);
    assert.equal(fs.readFileSync(reviewLogPath, "utf8").trim().split(/\r?\n/u).length, 1);
    assert.throws(
      () => recordDeepResearchStudentArchiveProjectionReview({
        ...baseInput(),
        studentArchiveProjectionReviewRequest: { ...projectionReviewRequest(), reviewId: "different_projection_review" },
      }, { reviewLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects non-service principals, missing scopes, unsafe comments, and high-risk commands", () => {
    assert.throws(
      () => recordDeepResearchStudentArchiveProjectionReview({
        ...baseInput(),
        principal: { ...principal(), role: "TEACHER", subjectType: "USER", entryPoint: "DESKTOP_RESEARCH" },
      }, { reviewLogPath: tempReviewLogPath() }),
      /controlled projection review service principal/u,
    );
    assert.throws(
      () => recordDeepResearchStudentArchiveProjectionReview({
        ...baseInput(),
        principal: { ...principal(), scopes: ["RESEARCH_READ", "STUDENT_ARCHIVE_PERSISTENCE"] },
      }, { reviewLogPath: tempReviewLogPath() }),
      /STUDENT_ARCHIVE_PROJECTION_REVIEW scope is required/u,
    );
    assert.throws(
      () => recordDeepResearchStudentArchiveProjectionReview({
        ...baseInput(),
        studentArchiveProjectionReviewRequest: { ...projectionReviewRequest(), comments: "<script>unsafe</script>" },
      }, { reviewLogPath: tempReviewLogPath() }),
      /must be encoded safe text/u,
    );
    const highRisk = baseInput();
    highRisk.studentArchivePersistenceRecord.studentArchivePersistenceCommand.risk.studentDataRisk = "HIGH";
    assert.throws(
      () => recordDeepResearchStudentArchiveProjectionReview(highRisk, { reviewLogPath: tempReviewLogPath() }),
      /HIGH risk/u,
    );
  });

  it("rejects missing persistence command, projection writes, DB writes, model access, Swarm, and mismatched scope", () => {
    const missingCommand = baseInput();
    missingCommand.studentArchivePersistenceRecord.boundary.studentArchivePersistenceCommandRecorded = false;
    assert.throws(
      () => recordDeepResearchStudentArchiveProjectionReview(missingCommand, { reviewLogPath: tempReviewLogPath() }),
      /studentArchivePersistenceCommandRecorded must be true/u,
    );
    const alreadyProjected = baseInput();
    alreadyProjected.studentArchivePersistenceRecord.boundary.studentArchiveProjectionWritten = true;
    assert.throws(
      () => recordDeepResearchStudentArchiveProjectionReview(alreadyProjected, { reviewLogPath: tempReviewLogPath() }),
      /studentArchiveProjectionWritten must be false/u,
    );
    assert.throws(
      () => recordDeepResearchStudentArchiveProjectionReview({
        ...baseInput(),
        studentArchiveProjectionReviewPolicy: { ...projectionReviewPolicy(), studentArchiveProjectionWriteAllowed: true },
      }, { reviewLogPath: tempReviewLogPath() }),
      /studentArchiveProjectionWriteAllowed must be false/u,
    );
    assert.throws(
      () => recordDeepResearchStudentArchiveProjectionReview({
        ...baseInput(),
        studentArchiveProjectionReviewPolicy: { ...projectionReviewPolicy(), mainDatabaseWriteAllowed: true },
      }, { reviewLogPath: tempReviewLogPath() }),
      /mainDatabaseWriteAllowed must be false/u,
    );
    assert.throws(
      () => recordDeepResearchStudentArchiveProjectionReview({
        ...baseInput(),
        studentArchiveProjectionReviewPolicy: { ...projectionReviewPolicy(), externalModelCallAllowed: true },
      }, { reviewLogPath: tempReviewLogPath() }),
      /externalModelCallAllowed must be false/u,
    );
    assert.throws(
      () => recordDeepResearchStudentArchiveProjectionReview({
        ...baseInput(),
        studentArchiveProjectionReviewPolicy: { ...projectionReviewPolicy(), swarmAllowed: true },
      }, { reviewLogPath: tempReviewLogPath() }),
      /swarmAllowed must be false/u,
    );
    assert.throws(
      () => recordDeepResearchStudentArchiveProjectionReview({
        ...baseInput(),
        studentArchiveProjectionReviewRequest: { ...projectionReviewRequest(), archiveScopeRef: "classroom_scope:different" },
      }, { reviewLogPath: tempReviewLogPath() }),
      /archiveScopeRef must be classroom_scope:grade8:math:unit-personalized-learning/u,
    );
  });
});

function tempReviewLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-student-archive-projection-review-")), "projection-review.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-student-archive-projection-review.v1",
    projectionReviewInvocationId: "deep_research_student_archive_projection_review_inv_001",
    principal: principal(),
    studentArchivePersistenceRecord: studentArchivePersistenceRecord(),
    studentArchiveProjectionReviewPolicy: projectionReviewPolicy(),
    studentArchiveProjectionReviewRequest: projectionReviewRequest(),
    evidenceRefs: ["evidence:student-archive-projection-review:human-approved", "evidence:student-archive-persistence:job-001"],
    idempotencyKey: "deep-research-student-archive-projection-review:job-001",
  };
}

function principal() {
  return {
    principalId: "student_archive_projection_review_runtime_service_001",
    role: "SERVICE",
    subjectType: "SERVICE",
    entryPoint: "STUDENT_ARCHIVE_PROJECTION_REVIEW_RUNTIME",
    scopes: ["RESEARCH_READ", "STUDENT_ARCHIVE_PERSISTENCE", "STUDENT_ARCHIVE_PROJECTION_REVIEW"],
    sessionId: "research_student_archive_projection_review_service_session_001",
  };
}

function projectionReviewPolicy() {
  return {
    reviewedPersistenceCommandRequired: true,
    humanProjectionReviewRequired: true,
    durableProjectionReviewAllowed: true,
    appendOnlyReviewLogRequired: true,
    preserveEvidenceRequired: true,
    preserveSourceHashesRequired: true,
    preserveLimitationsRequired: true,
    studentAudienceScopeRequired: true,
    futureDurableProjectionRuntimeRequired: true,
    directPublicationAllowed: false,
    directDatabaseAccessAllowed: false,
    mainDatabaseWriteAllowed: false,
    studentArchiveProjectionWriteAllowed: false,
    externalModelCallAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function projectionReviewRequest() {
  return {
    reviewId: "deep_research_student_archive_projection_review_001",
    decision: "APPROVED_FOR_DURABLE_STUDENT_ARCHIVE_PROJECTION_RUNTIME",
    targetArchiveKind: "STUDENT_LEARNING_ARCHIVE",
    archiveScopeRef: "classroom_scope:grade8:math:unit-personalized-learning",
    sourcePersistenceRecordId: "research_deep_research_student_archive_persistence_deep-research-student-archive-persistence_job-001",
    sourcePersistenceCommandId: "deep_research_student_archive_persistence_command_001",
    sourceStudentDeliveryEnvelopeId: "deep_research_student_delivery_envelope_001",
    desiredProjectionState: "REVIEWED_FOR_DURABLE_PROJECTION_NOT_WRITTEN",
    reviewerPrincipalId: "teacher_research_reviewer_001",
    comments: "Projection review approved for future durable runtime only.",
  };
}

function studentArchivePersistenceRecord() {
  return JSON.parse(fs.readFileSync("contracts/agent/deep-research-student-archive-persistence.output.example.json", "utf8"));
}
