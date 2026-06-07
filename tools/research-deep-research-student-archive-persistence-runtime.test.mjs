import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PORT,
  formatDeepResearchStudentArchivePersistence,
  recordDeepResearchStudentArchivePersistenceCommand,
} from "./research-deep-research-student-archive-persistence-runtime.mjs";

describe("Research deep_research student archive persistence command runtime", () => {
  it("records an append-only student archive persistence command without projection", () => {
    const result = recordDeepResearchStudentArchivePersistenceCommand(baseInput(), {
      commandLogPath: tempCommandLogPath(),
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-05.research.deep-research-student-archive-persistence-recorded.v1");
    assert.equal(result.commandPort, RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PORT);
    assert.equal(result.status, "STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED");
    assert.equal(result.studentArchivePersistenceCommand.commandKind, "EVIDENCE_GROUNDED_STUDENT_ARCHIVE_PERSISTENCE_COMMAND");
    assert.equal(result.studentArchivePersistenceCommand.projectionState, "NOT_PROJECTED_TO_STUDENT_ARCHIVE");
    assert.equal(result.studentArchivePersistenceCommand.claimCount, 2);
    assert.equal(result.boundary.studentDeliveryEnvelopeVerified, true);
    assert.equal(result.boundary.studentArchivePersistenceCommandRecorded, true);
    assert.equal(result.boundary.appendOnlyCommandLogRecorded, true);
    assert.equal(result.boundary.studentArchivePersisted, false);
    assert.equal(result.boundary.studentArchiveProjectionWritten, false);
    assert.equal(result.boundary.mainDatabaseWriteStarted, false);
    assert.equal(result.boundary.externalModelCallStarted, false);
    assert.equal(result.boundary.requiresFutureDurableProjectionReview, true);
    assert.match(result.evidenceRefs.join("\n"), /evidence:student-archive-persistence-input-hash:sha256:/u);
    assert.match(formatDeepResearchStudentArchivePersistence(result), /Projected: false/u);
  });

  it("uses idempotency for safe replay and rejects conflicting commands", () => {
    const commandLogPath = tempCommandLogPath();
    const first = recordDeepResearchStudentArchivePersistenceCommand(baseInput(), { commandLogPath });
    const second = recordDeepResearchStudentArchivePersistenceCommand(baseInput(), { commandLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(second.idempotentReplay, true);
    assert.equal(fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).length, 1);
    assert.throws(
      () => recordDeepResearchStudentArchivePersistenceCommand({
        ...baseInput(),
        studentArchivePersistenceRequest: { ...studentArchivePersistenceRequest(), commandId: "different_archive_persistence_command" },
      }, { commandLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects non-service principals, missing scopes, unsafe text, and high-risk envelopes", () => {
    assert.throws(
      () => recordDeepResearchStudentArchivePersistenceCommand({
        ...baseInput(),
        principal: { ...principal(), role: "TEACHER", subjectType: "USER", entryPoint: "DESKTOP_RESEARCH" },
      }, { commandLogPath: tempCommandLogPath() }),
      /controlled persistence service principal/u,
    );
    assert.throws(
      () => recordDeepResearchStudentArchivePersistenceCommand({
        ...baseInput(),
        principal: { ...principal(), scopes: ["RESEARCH_READ", "STUDENT_APP_DELIVERY"] },
      }, { commandLogPath: tempCommandLogPath() }),
      /STUDENT_ARCHIVE_PERSISTENCE scope is required/u,
    );
    const unsafe = baseInput();
    unsafe.studentDeliveryRecord.studentDeliveryEnvelope.learnerFacingSummary = "<script>unsafe</script>";
    assert.throws(
      () => recordDeepResearchStudentArchivePersistenceCommand(unsafe, { commandLogPath: tempCommandLogPath() }),
      /must be encoded safe text/u,
    );
    const highRisk = baseInput();
    highRisk.studentDeliveryRecord.studentDeliveryEnvelope.risk.studentDataRisk = "HIGH";
    assert.throws(
      () => recordDeepResearchStudentArchivePersistenceCommand(highRisk, { commandLogPath: tempCommandLogPath() }),
      /HIGH risk/u,
    );
  });

  it("rejects missing delivery, projection writes, DB writes, model access, Swarm, and mismatched scope", () => {
    const missingDelivery = baseInput();
    missingDelivery.studentDeliveryRecord.boundary.studentDeliveryEnvelopeCreated = false;
    assert.throws(
      () => recordDeepResearchStudentArchivePersistenceCommand(missingDelivery, { commandLogPath: tempCommandLogPath() }),
      /studentDeliveryEnvelopeCreated must be true/u,
    );
    assert.throws(
      () => recordDeepResearchStudentArchivePersistenceCommand({
        ...baseInput(),
        studentArchivePersistencePolicy: { ...studentArchivePersistencePolicy(), studentArchiveProjectionWriteAllowed: true },
      }, { commandLogPath: tempCommandLogPath() }),
      /studentArchiveProjectionWriteAllowed must be false/u,
    );
    assert.throws(
      () => recordDeepResearchStudentArchivePersistenceCommand({
        ...baseInput(),
        studentArchivePersistencePolicy: { ...studentArchivePersistencePolicy(), mainDatabaseWriteAllowed: true },
      }, { commandLogPath: tempCommandLogPath() }),
      /mainDatabaseWriteAllowed must be false/u,
    );
    assert.throws(
      () => recordDeepResearchStudentArchivePersistenceCommand({
        ...baseInput(),
        studentArchivePersistencePolicy: { ...studentArchivePersistencePolicy(), externalModelCallAllowed: true },
      }, { commandLogPath: tempCommandLogPath() }),
      /externalModelCallAllowed must be false/u,
    );
    assert.throws(
      () => recordDeepResearchStudentArchivePersistenceCommand({
        ...baseInput(),
        studentArchivePersistencePolicy: { ...studentArchivePersistencePolicy(), swarmAllowed: true },
      }, { commandLogPath: tempCommandLogPath() }),
      /swarmAllowed must be false/u,
    );
    assert.throws(
      () => recordDeepResearchStudentArchivePersistenceCommand({
        ...baseInput(),
        studentArchivePersistenceRequest: { ...studentArchivePersistenceRequest(), archiveScopeRef: "classroom_scope:different" },
      }, { commandLogPath: tempCommandLogPath() }),
      /archiveScopeRef must be classroom_scope:grade8:math:unit-personalized-learning/u,
    );
  });
});

function tempCommandLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-student-archive-persistence-")), "persistence.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-student-archive-persistence.v1",
    persistenceInvocationId: "deep_research_student_archive_persistence_inv_001",
    principal: principal(),
    studentDeliveryRecord: studentDeliveryRecord(),
    studentArchivePersistencePolicy: studentArchivePersistencePolicy(),
    studentArchivePersistenceRequest: studentArchivePersistenceRequest(),
    evidenceRefs: ["evidence:student-archive-persistence:command-reviewed", "evidence:student-delivery:job-001"],
    idempotencyKey: "deep-research-student-archive-persistence:job-001",
  };
}

function principal() {
  return {
    principalId: "student_archive_persistence_runtime_service_001",
    role: "SERVICE",
    subjectType: "SERVICE",
    entryPoint: "STUDENT_ARCHIVE_PERSISTENCE_RUNTIME",
    scopes: ["RESEARCH_READ", "STUDENT_ARCHIVE_PERSISTENCE", "STUDENT_APP_DELIVERY"],
    sessionId: "research_student_archive_persistence_service_session_001",
  };
}

function studentArchivePersistencePolicy() {
  return {
    reviewedStudentDeliveryRequired: true,
    studentArchivePersistenceCommandAllowed: true,
    appendOnlyCommandLogRequired: true,
    preserveEvidenceRequired: true,
    preserveSourceHashesRequired: true,
    preserveLimitationsRequired: true,
    studentAudienceScopeRequired: true,
    futureDurableProjectionReviewRequired: true,
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

function studentArchivePersistenceRequest() {
  return {
    commandId: "deep_research_student_archive_persistence_command_001",
    persistenceMode: "APPEND_ONLY_STUDENT_ARCHIVE_COMMAND",
    targetArchiveKind: "STUDENT_LEARNING_ARCHIVE",
    archiveScopeRef: "classroom_scope:grade8:math:unit-personalized-learning",
    studentDeliveryRecordId: "research_deep_research_student_delivery_deep-research-student-delivery_job-001",
    studentDeliveryEnvelopeId: "deep_research_student_delivery_envelope_001",
    studentVisibilityReviewId: "deep_research_student_visibility_review_001",
    teacherDeliveryPackageId: "deep_research_teacher_delivery_package_001",
    desiredArchiveState: "PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED",
  };
}

function studentDeliveryRecord() {
  return JSON.parse(fs.readFileSync("contracts/agent/deep-research-student-delivery.output.example.json", "utf8"));
}
