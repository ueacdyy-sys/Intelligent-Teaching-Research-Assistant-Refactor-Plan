import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_COMMAND_PORT,
  formatDeepResearchStudentArchiveProjection,
  projectReviewedStudentArchiveEntry,
} from "./research-deep-research-student-archive-projection-runtime.mjs";

describe("Research deep_research student archive projection runtime", () => {
  it("records a durable student archive projection from an approved review", () => {
    const result = projectReviewedStudentArchiveEntry(baseInput(), {
      projectionLogPath: tempProjectionLogPath(),
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-05.research.deep-research-student-archive-projection-recorded.v1");
    assert.equal(result.commandPort, RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_COMMAND_PORT);
    assert.equal(result.status, "STUDENT_ARCHIVE_PROJECTION_WRITTEN");
    assert.equal(result.studentArchiveProjectionRecord.projectionKind, "DURABLE_STUDENT_ARCHIVE_PROJECTION_RECORD");
    assert.equal(result.studentArchiveProjectionRecord.projectionState, "PROJECTED_TO_STUDENT_ARCHIVE");
    assert.equal(result.boundary.studentArchiveProjectionReviewVerified, true);
    assert.equal(result.boundary.durableStudentArchiveProjectionRecorded, true);
    assert.equal(result.boundary.studentArchivePersisted, true);
    assert.equal(result.boundary.studentArchiveProjectionWritten, true);
    assert.equal(result.boundary.studentArchiveWriteStarted, true);
    assert.equal(result.boundary.mainDatabaseWriteStarted, false);
    assert.match(result.evidenceRefs.join("\n"), /evidence:student-archive-projection-input-hash:sha256:/u);
    assert.match(formatDeepResearchStudentArchiveProjection(result), /Projected: true/u);
  });

  it("uses idempotency for safe replay and rejects conflicting projections", () => {
    const projectionLogPath = tempProjectionLogPath();
    const first = projectReviewedStudentArchiveEntry(baseInput(), { projectionLogPath });
    const second = projectReviewedStudentArchiveEntry(baseInput(), { projectionLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(second.idempotentReplay, true);
    assert.equal(fs.readFileSync(projectionLogPath, "utf8").trim().split(/\r?\n/u).length, 1);
    assert.throws(
      () => projectReviewedStudentArchiveEntry({
        ...baseInput(),
        studentArchiveProjectionRequest: { ...projectionRequest(), projectionId: "different_projection" },
      }, { projectionLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects non-service principals, missing scopes, unsafe text, and high-risk reviews", () => {
    assert.throws(
      () => projectReviewedStudentArchiveEntry({
        ...baseInput(),
        principal: { ...principal(), role: "TEACHER", subjectType: "USER", entryPoint: "DESKTOP_RESEARCH" },
      }, { projectionLogPath: tempProjectionLogPath() }),
      /controlled projection service principal/u,
    );
    assert.throws(
      () => projectReviewedStudentArchiveEntry({
        ...baseInput(),
        principal: { ...principal(), scopes: ["RESEARCH_READ", "STUDENT_ARCHIVE_PERSISTENCE"] },
      }, { projectionLogPath: tempProjectionLogPath() }),
      /STUDENT_ARCHIVE_PROJECTION_WRITE scope is required/u,
    );
    const unsafe = baseInput();
    unsafe.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.title = "<script>unsafe</script>";
    assert.throws(
      () => projectReviewedStudentArchiveEntry(unsafe, { projectionLogPath: tempProjectionLogPath() }),
      /must be encoded safe text/u,
    );
    const highRisk = baseInput();
    highRisk.studentArchiveProjectionReviewRecord.studentArchiveProjectionReview.risk.studentDataRisk = "HIGH";
    assert.throws(
      () => projectReviewedStudentArchiveEntry(highRisk, { projectionLogPath: tempProjectionLogPath() }),
      /HIGH risk/u,
    );
  });

  it("rejects missing review, previous projection, main DB writes, model access, Swarm, and mismatched scope", () => {
    const missingReview = baseInput();
    missingReview.studentArchiveProjectionReviewRecord.boundary.humanProjectionReviewRecorded = false;
    assert.throws(
      () => projectReviewedStudentArchiveEntry(missingReview, { projectionLogPath: tempProjectionLogPath() }),
      /humanProjectionReviewRecorded must be true/u,
    );
    const alreadyProjected = baseInput();
    alreadyProjected.studentArchiveProjectionReviewRecord.boundary.studentArchiveProjectionWritten = true;
    assert.throws(
      () => projectReviewedStudentArchiveEntry(alreadyProjected, { projectionLogPath: tempProjectionLogPath() }),
      /studentArchiveProjectionWritten must be false/u,
    );
    assert.throws(
      () => projectReviewedStudentArchiveEntry({
        ...baseInput(),
        studentArchiveProjectionPolicy: { ...projectionPolicy(), mainDatabaseWriteAllowed: true },
      }, { projectionLogPath: tempProjectionLogPath() }),
      /mainDatabaseWriteAllowed must be false/u,
    );
    assert.throws(
      () => projectReviewedStudentArchiveEntry({
        ...baseInput(),
        studentArchiveProjectionPolicy: { ...projectionPolicy(), externalModelCallAllowed: true },
      }, { projectionLogPath: tempProjectionLogPath() }),
      /externalModelCallAllowed must be false/u,
    );
    assert.throws(
      () => projectReviewedStudentArchiveEntry({
        ...baseInput(),
        studentArchiveProjectionPolicy: { ...projectionPolicy(), swarmAllowed: true },
      }, { projectionLogPath: tempProjectionLogPath() }),
      /swarmAllowed must be false/u,
    );
    assert.throws(
      () => projectReviewedStudentArchiveEntry({
        ...baseInput(),
        studentArchiveProjectionRequest: { ...projectionRequest(), archiveScopeRef: "classroom_scope:different" },
      }, { projectionLogPath: tempProjectionLogPath() }),
      /archiveScopeRef must be classroom_scope:grade8:math:unit-personalized-learning/u,
    );
  });
});

function tempProjectionLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-student-archive-projection-")), "projection.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-student-archive-projection.v1",
    projectionInvocationId: "deep_research_student_archive_projection_inv_001",
    principal: principal(),
    studentArchiveProjectionReviewRecord: studentArchiveProjectionReviewRecord(),
    studentArchiveProjectionPolicy: projectionPolicy(),
    studentArchiveProjectionRequest: projectionRequest(),
    evidenceRefs: ["evidence:student-archive-projection:review-consumed", "evidence:student-archive-projection-review:job-001"],
    idempotencyKey: "deep-research-student-archive-projection:job-001",
  };
}

function principal() {
  return {
    principalId: "student_archive_projection_runtime_service_001",
    role: "SERVICE",
    subjectType: "SERVICE",
    entryPoint: "STUDENT_ARCHIVE_PROJECTION_RUNTIME",
    scopes: ["RESEARCH_READ", "STUDENT_ARCHIVE_PERSISTENCE", "STUDENT_ARCHIVE_PROJECTION_WRITE"],
    sessionId: "research_student_archive_projection_service_session_001",
  };
}

function projectionPolicy() {
  return {
    reviewedProjectionReviewRequired: true,
    durableStudentArchiveProjectionAllowed: true,
    appendOnlyProjectionLogRequired: true,
    preserveEvidenceRequired: true,
    preserveSourceHashesRequired: true,
    preserveLimitationsRequired: true,
    studentAudienceScopeRequired: true,
    studentArchiveProjectionWriteAllowed: true,
    directPublicationAllowed: false,
    directDatabaseAccessAllowed: false,
    mainDatabaseWriteAllowed: false,
    externalModelCallAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function projectionRequest() {
  return {
    projectionId: "deep_research_student_archive_projection_001",
    projectionMode: "APPEND_ONLY_STUDENT_ARCHIVE_PROJECTION",
    targetArchiveKind: "STUDENT_LEARNING_ARCHIVE",
    archiveScopeRef: "classroom_scope:grade8:math:unit-personalized-learning",
    sourceProjectionReviewRecordId: "research_deep_research_student_archive_projection_review_deep-research-student-archive-projection-review_job-001",
    sourceProjectionReviewId: "deep_research_student_archive_projection_review_001",
    sourcePersistenceRecordId: "research_deep_research_student_archive_persistence_deep-research-student-archive-persistence_job-001",
    sourcePersistenceCommandId: "deep_research_student_archive_persistence_command_001",
    sourceStudentDeliveryEnvelopeId: "deep_research_student_delivery_envelope_001",
    desiredProjectionState: "PROJECTED_TO_STUDENT_ARCHIVE",
  };
}

function studentArchiveProjectionReviewRecord() {
  return JSON.parse(fs.readFileSync("contracts/agent/deep-research-student-archive-projection-review.output.example.json", "utf8"));
}
