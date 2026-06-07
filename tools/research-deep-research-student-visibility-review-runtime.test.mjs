import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_COMMAND_PORT,
  formatDeepResearchStudentVisibilityReview,
  recordDeepResearchStudentVisibilityReview,
} from "./research-deep-research-student-visibility-review-runtime.mjs";

describe("Research deep_research student visibility review runtime", () => {
  it("records a human student visibility review without delivering to students", () => {
    const result = recordDeepResearchStudentVisibilityReview(baseInput(), {
      commandLogPath: tempCommandLogPath(),
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-05.research.deep-research-student-visibility-review-recorded.v1");
    assert.equal(result.commandPort, RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_COMMAND_PORT);
    assert.equal(result.status, "STUDENT_VISIBILITY_REVIEW_APPROVED_NOT_DELIVERED");
    assert.equal(result.studentVisibilityReview.decision, "APPROVED_FOR_STUDENT_VISIBILITY_DELIVERY_RUNTIME");
    assert.equal(result.teacherDeliveryPackage.claimCount, 2);
    assert.equal(result.teacherDeliveryPackage.citationCount, 2);
    assert.equal(result.teacherDeliveryPackage.sourceHashCount, 2);
    assert.equal(result.boundary.humanStudentVisibilityReviewRecorded, true);
    assert.equal(result.boundary.studentVisible, false);
    assert.equal(result.boundary.studentDeliveryStarted, false);
    assert.equal(result.boundary.studentArchiveWriteStarted, false);
    assert.equal(result.boundary.requiresFutureStudentDeliveryRuntime, true);
    assert.match(result.evidenceRefs.join("\n"), /evidence:student-visibility-review-input-hash:sha256:/u);
    assert.match(formatDeepResearchStudentVisibilityReview(result), /Student visible: false/u);
  });

  it("uses idempotency for safe replay and rejects conflicting reviews", () => {
    const commandLogPath = tempCommandLogPath();
    const first = recordDeepResearchStudentVisibilityReview(baseInput(), { commandLogPath });
    const second = recordDeepResearchStudentVisibilityReview(baseInput(), { commandLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(second.idempotentReplay, true);
    assert.equal(fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).length, 1);
    assert.throws(
      () => recordDeepResearchStudentVisibilityReview({
        ...baseInput(),
        studentVisibilityReview: { ...studentVisibilityReview(), reviewId: "different_student_visibility_review" },
      }, { commandLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects students, services, unsafe text, revision decisions, and high-risk packages", () => {
    assert.throws(
      () => recordDeepResearchStudentVisibilityReview({
        ...baseInput(),
        principal: { ...principal(), role: "STUDENT", entryPoint: "STUDENT_APP" },
      }, { commandLogPath: tempCommandLogPath() }),
      /human teacher or admin/u,
    );
    assert.throws(
      () => recordDeepResearchStudentVisibilityReview({
        ...baseInput(),
        principal: { ...principal(), role: "SERVICE", subjectType: "SERVICE", entryPoint: "AGENT_INTERNAL" },
      }, { commandLogPath: tempCommandLogPath() }),
      /human teacher or admin/u,
    );
    assert.throws(
      () => recordDeepResearchStudentVisibilityReview({
        ...baseInput(),
        studentVisibilityReview: { ...studentVisibilityReview(), comments: "<script>unsafe</script>" },
      }, { commandLogPath: tempCommandLogPath() }),
      /must be encoded safe text/u,
    );
    assert.throws(
      () => recordDeepResearchStudentVisibilityReview({
        ...baseInput(),
        studentVisibilityReview: { ...studentVisibilityReview(), revisionRequired: true },
      }, { commandLogPath: tempCommandLogPath() }),
      /revisionRequired must be false/u,
    );
    const highRisk = baseInput();
    highRisk.teacherDeliveryRecord.teacherDeliveryPackage.risk.studentDataRisk = "HIGH";
    assert.throws(
      () => recordDeepResearchStudentVisibilityReview(highRisk, { commandLogPath: tempCommandLogPath() }),
      /HIGH risk/u,
    );
  });

  it("rejects direct student visibility, DB writes, delivery starts, and mismatched package reviews", () => {
    assert.throws(
      () => recordDeepResearchStudentVisibilityReview({
        ...baseInput(),
        studentVisibilityPolicy: { ...studentVisibilityPolicy(), studentVisibleDeliveryAllowed: true },
      }, { commandLogPath: tempCommandLogPath() }),
      /studentVisibleDeliveryAllowed must be false/u,
    );
    assert.throws(
      () => recordDeepResearchStudentVisibilityReview({
        ...baseInput(),
        studentVisibilityPolicy: { ...studentVisibilityPolicy(), studentArchiveWriteAllowed: true },
      }, { commandLogPath: tempCommandLogPath() }),
      /studentArchiveWriteAllowed must be false/u,
    );
    const delivered = baseInput();
    delivered.teacherDeliveryRecord.boundary.studentVisible = true;
    assert.throws(
      () => recordDeepResearchStudentVisibilityReview(delivered, { commandLogPath: tempCommandLogPath() }),
      /studentVisible must be false/u,
    );
    assert.throws(
      () => recordDeepResearchStudentVisibilityReview({
        ...baseInput(),
        studentVisibilityReview: { ...studentVisibilityReview(), teacherDeliveryPackageId: "different_package" },
      }, { commandLogPath: tempCommandLogPath() }),
      /teacherDeliveryPackageId must be deep_research_teacher_delivery_package_001/u,
    );
  });
});

function tempCommandLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-student-visibility-review-")), "review.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-student-visibility-review.v1",
    reviewInvocationId: "deep_research_student_visibility_review_inv_001",
    principal: principal(),
    teacherDeliveryRecord: teacherDeliveryRecord(),
    studentVisibilityPolicy: studentVisibilityPolicy(),
    studentVisibilityReview: studentVisibilityReview(),
    evidenceRefs: ["evidence:student-visibility-review:teacher-approved", "evidence:teacher-delivery:job-001"],
    idempotencyKey: "deep-research-student-visibility-review:job-001",
  };
}

function principal() {
  return {
    principalId: "teacher_research_reviewer_001",
    role: "TEACHER",
    subjectType: "USER",
    entryPoint: "DESKTOP_RESEARCH",
    scopes: ["RESEARCH_READ", "STUDENT_VISIBILITY_REVIEW", "KNOWLEDGE_PRIVATE_READ"],
    sessionId: "research_student_visibility_review_session_001",
  };
}

function studentVisibilityPolicy() {
  return {
    teacherDeliveryRequired: true,
    humanStudentVisibilityReviewRequired: true,
    preserveEvidenceRequired: true,
    preserveSourceHashesRequired: true,
    preserveLimitationsRequired: true,
    studentAudienceScopeRequired: true,
    futureStudentDeliveryRuntimeRequired: true,
    futurePersistenceReviewRequired: true,
    studentVisibleDeliveryAllowed: false,
    directPublicationAllowed: false,
    directDatabaseAccessAllowed: false,
    mainDatabaseWriteAllowed: false,
    studentArchiveWriteAllowed: false,
    externalModelCallAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function studentVisibilityReview() {
  return {
    reviewId: "deep_research_student_visibility_review_001",
    reviewerPrincipalId: "teacher_research_reviewer_001",
    decision: "APPROVED_FOR_STUDENT_VISIBILITY_DELIVERY_RUNTIME",
    approvedForFutureStudentDelivery: true,
    revisionRequired: false,
    teacherDeliveryRecordId: "research_deep_research_teacher_delivery_deep-research-teacher-delivery_job-001",
    teacherDeliveryPackageId: "deep_research_teacher_delivery_package_001",
    targetAudience: {
      audienceKind: "STUDENT_APP_LEARNING_SUPPORT",
      scopeRef: "classroom_scope:grade8:math:unit-personalized-learning",
      channel: "STUDENT_APP",
      visibilityState: "APPROVED_FOR_FUTURE_STUDENT_DELIVERY_NOT_VISIBLE",
    },
    teacherDeliveryReviewed: true,
    evidenceIntegrityReviewed: true,
    sourceHashIntegrityReviewed: true,
    limitationsReviewed: true,
    studentDataDisclosureReviewed: true,
    privateKnowledgeDisclosureReviewed: true,
    ageAppropriateReviewed: true,
    teacherAccountabilityAccepted: true,
    comments: "该教师交付包可进入后续学生端交付运行时，但本次只记录人审结论。",
  };
}

function teacherDeliveryRecord() {
  return JSON.parse(fs.readFileSync("contracts/agent/deep-research-teacher-delivery.output.example.json", "utf8"));
}
