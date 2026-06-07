import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_COMMAND_PORT,
  formatDeepResearchStudentDelivery,
  recordDeepResearchStudentDeliveryEnvelope,
} from "./research-deep-research-student-delivery-runtime.mjs";

describe("Research deep_research student delivery runtime", () => {
  it("records a student app delivery envelope without durable persistence", () => {
    const result = recordDeepResearchStudentDeliveryEnvelope(baseInput(), {
      commandLogPath: tempCommandLogPath(),
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-05.research.deep-research-student-delivery-recorded.v1");
    assert.equal(result.commandPort, RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_COMMAND_PORT);
    assert.equal(result.status, "STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED");
    assert.equal(result.studentDeliveryEnvelope.envelopeKind, "EVIDENCE_GROUNDED_STUDENT_DELIVERY_ENVELOPE");
    assert.equal(result.studentDeliveryEnvelope.visibilityState, "STUDENT_VISIBLE_DELIVERY_ENVELOPE_NOT_PERSISTED");
    assert.equal(result.studentDeliveryEnvelope.claimCount, 2);
    assert.equal(result.studentDeliveryEnvelope.citationCount, 2);
    assert.equal(result.studentDeliveryEnvelope.sourceHashCount, 2);
    assert.equal(result.boundary.studentVisible, true);
    assert.equal(result.boundary.studentDeliveryStarted, true);
    assert.equal(result.boundary.studentDeliveryPersisted, false);
    assert.equal(result.boundary.mainDatabaseWriteStarted, false);
    assert.equal(result.boundary.studentArchiveWriteStarted, false);
    assert.equal(result.boundary.externalModelCallStarted, false);
    assert.equal(result.boundary.requiresFuturePersistenceReview, true);
    assert.match(result.evidenceRefs.join("\n"), /evidence:student-delivery-input-hash:sha256:/u);
    assert.match(formatDeepResearchStudentDelivery(result), /Persisted: false/u);
  });

  it("uses idempotency for safe replay and rejects conflicting envelopes", () => {
    const commandLogPath = tempCommandLogPath();
    const first = recordDeepResearchStudentDeliveryEnvelope(baseInput(), { commandLogPath });
    const second = recordDeepResearchStudentDeliveryEnvelope(baseInput(), { commandLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(second.idempotentReplay, true);
    assert.equal(fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).length, 1);
    assert.throws(
      () => recordDeepResearchStudentDeliveryEnvelope({
        ...baseInput(),
        studentDeliveryRequest: { ...studentDeliveryRequest(), envelopeId: "different_student_delivery_envelope" },
      }, { commandLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects non-service principals, missing scopes, unsafe text, and high-risk packages", () => {
    assert.throws(
      () => recordDeepResearchStudentDeliveryEnvelope({
        ...baseInput(),
        principal: { ...principal(), role: "STUDENT", subjectType: "USER", entryPoint: "STUDENT_APP" },
      }, { commandLogPath: tempCommandLogPath() }),
      /controlled delivery service principal/u,
    );
    assert.throws(
      () => recordDeepResearchStudentDeliveryEnvelope({
        ...baseInput(),
        principal: { ...principal(), scopes: ["RESEARCH_READ", "STUDENT_DELIVERY_ENVELOPE"] },
      }, { commandLogPath: tempCommandLogPath() }),
      /STUDENT_APP_DELIVERY scope is required/u,
    );
    const unsafe = baseInput();
    unsafe.studentVisibilityReviewRecord.teacherDeliveryPackage.summary = "<script>unsafe</script>";
    assert.throws(
      () => recordDeepResearchStudentDeliveryEnvelope(unsafe, { commandLogPath: tempCommandLogPath() }),
      /must be encoded safe text/u,
    );
    const highRisk = baseInput();
    highRisk.studentVisibilityReviewRecord.teacherDeliveryPackage.risk.privateKnowledgeRisk = "HIGH";
    assert.throws(
      () => recordDeepResearchStudentDeliveryEnvelope(highRisk, { commandLogPath: tempCommandLogPath() }),
      /HIGH risk/u,
    );
  });

  it("rejects missing human review, DB writes, persistence, model access, Swarm, and mismatched audience", () => {
    const unreviewed = baseInput();
    unreviewed.studentVisibilityReviewRecord.boundary.humanStudentVisibilityReviewRecorded = false;
    assert.throws(
      () => recordDeepResearchStudentDeliveryEnvelope(unreviewed, { commandLogPath: tempCommandLogPath() }),
      /humanStudentVisibilityReviewRecorded must be true/u,
    );
    assert.throws(
      () => recordDeepResearchStudentDeliveryEnvelope({
        ...baseInput(),
        studentDeliveryPolicy: { ...studentDeliveryPolicy(), studentArchiveWriteAllowed: true },
      }, { commandLogPath: tempCommandLogPath() }),
      /studentArchiveWriteAllowed must be false/u,
    );
    assert.throws(
      () => recordDeepResearchStudentDeliveryEnvelope({
        ...baseInput(),
        studentDeliveryPolicy: { ...studentDeliveryPolicy(), externalModelCallAllowed: true },
      }, { commandLogPath: tempCommandLogPath() }),
      /externalModelCallAllowed must be false/u,
    );
    assert.throws(
      () => recordDeepResearchStudentDeliveryEnvelope({
        ...baseInput(),
        studentDeliveryPolicy: { ...studentDeliveryPolicy(), swarmAllowed: true },
      }, { commandLogPath: tempCommandLogPath() }),
      /swarmAllowed must be false/u,
    );
    assert.throws(
      () => recordDeepResearchStudentDeliveryEnvelope({
        ...baseInput(),
        studentDeliveryRequest: { ...studentDeliveryRequest(), scopeRef: "classroom_scope:different" },
      }, { commandLogPath: tempCommandLogPath() }),
      /scopeRef must be classroom_scope:grade8:math:unit-personalized-learning/u,
    );
  });
});

function tempCommandLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-student-delivery-")), "delivery.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-student-delivery.v1",
    deliveryInvocationId: "deep_research_student_delivery_inv_001",
    principal: principal(),
    studentVisibilityReviewRecord: studentVisibilityReviewRecord(),
    studentDeliveryPolicy: studentDeliveryPolicy(),
    studentDeliveryRequest: studentDeliveryRequest(),
    evidenceRefs: ["evidence:student-delivery:approved-student-app-envelope", "evidence:student-visibility-review:job-001"],
    idempotencyKey: "deep-research-student-delivery:job-001",
  };
}

function principal() {
  return {
    principalId: "student_delivery_runtime_service_001",
    role: "SERVICE",
    subjectType: "SERVICE",
    entryPoint: "STUDENT_DELIVERY_RUNTIME",
    scopes: ["RESEARCH_READ", "STUDENT_DELIVERY_ENVELOPE", "STUDENT_APP_DELIVERY"],
    sessionId: "research_student_delivery_service_session_001",
  };
}

function studentDeliveryPolicy() {
  return {
    reviewedTeacherDeliveryRequired: true,
    humanStudentVisibilityReviewRequired: true,
    studentDeliveryEnvelopeAllowed: true,
    studentVisibleEnvelopeAllowed: true,
    preserveEvidenceRequired: true,
    preserveSourceHashesRequired: true,
    preserveLimitationsRequired: true,
    studentAudienceScopeRequired: true,
    futurePersistenceReviewRequired: true,
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

function studentDeliveryRequest() {
  return {
    envelopeId: "deep_research_student_delivery_envelope_001",
    deliveryMode: "STUDENT_APP_RENDERABLE_ENVELOPE",
    channel: "STUDENT_APP",
    audienceKind: "STUDENT_APP_LEARNING_SUPPORT",
    visibilityState: "STUDENT_VISIBLE_DELIVERY_ENVELOPE_NOT_PERSISTED",
    scopeRef: "classroom_scope:grade8:math:unit-personalized-learning",
    studentVisibilityReviewRecordId: "research_deep_research_student_visibility_review_deep-research-student-visibility-review_job-001",
    studentVisibilityReviewId: "deep_research_student_visibility_review_001",
    teacherDeliveryPackageId: "deep_research_teacher_delivery_package_001",
  };
}

function studentVisibilityReviewRecord() {
  return JSON.parse(fs.readFileSync("contracts/agent/deep-research-student-visibility-review.output.example.json", "utf8"));
}
