import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_COMMAND_PORT,
  formatDeepResearchStudentArchiveStoragePrecommit,
  prepareTeachingArchiveStoragePrecommit,
} from "./research-deep-research-student-archive-storage-precommit-runtime.mjs";

describe("Research deep_research student archive storage precommit runtime", () => {
  it("prepares a Teaching Archive create command from a durable projection", () => {
    const result = prepareTeachingArchiveStoragePrecommit(baseInput(), {
      precommitLogPath: tempPrecommitLogPath(),
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-05.research.deep-research-student-archive-storage-precommit-prepared.v1");
    assert.equal(result.commandPort, RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_COMMAND_PORT);
    assert.equal(result.status, "TEACHING_ARCHIVE_MAIN_DB_STORAGE_PRECOMMIT_PREPARED");
    assert.equal(result.teachingArchiveCreateCommand.operationId, "createTeachingArchiveItem");
    assert.equal(result.teachingArchiveCreateCommand.targetUseCase, "CreateArchiveItem.ExecuteWithPersistence");
    assert.equal(result.teachingArchiveCreateCommand.targetTable, "teaching_archive_items");
    assert.deepEqual(result.teachingArchiveCreateCommand.requestBody, {
      ownerType: "STUDENT",
      studentId: "student_001",
      materialType: "HANDOUT",
      title: "Evidence grounded learning support draft",
      source: "SYSTEM_IMPORT",
      contentRef: "research-deep-research-projection:deep_research_student_archive_projection_001:sha256_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      tags: ["deep_research", "student_archive", "projection", "math_unit"],
      analysisIntents: ["ARCHIVE_ONLY", "TUTORING"],
      ocrReserved: false,
    });
    assert.equal(result.boundary.mainDatabaseWritePrepared, true);
    assert.equal(result.boundary.mainDatabaseWriteStarted, false);
    assert.equal(result.boundary.mainDatabaseWriteCommitted, false);
    assert.match(formatDeepResearchStudentArchiveStoragePrecommit(result), /Main DB started: false/u);
  });

  it("uses idempotency for safe replay and rejects conflicting storage commands", () => {
    const precommitLogPath = tempPrecommitLogPath();
    const first = prepareTeachingArchiveStoragePrecommit(baseInput(), { precommitLogPath });
    const second = prepareTeachingArchiveStoragePrecommit(baseInput(), { precommitLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(second.idempotentReplay, true);
    assert.equal(fs.readFileSync(precommitLogPath, "utf8").trim().split(/\r?\n/u).length, 1);
    assert.throws(
      () => prepareTeachingArchiveStoragePrecommit({
        ...baseInput(),
        studentArchiveStorageRequest: { ...storageRequest(), targetStudentId: "student_002" },
        principal: { ...principal(), studentAccess: { mode: "ALL", studentIds: [] } },
      }, { precommitLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects invalid write principals, student scope mismatch, and AI grading intent", () => {
    assert.throws(
      () => prepareTeachingArchiveStoragePrecommit({
        ...baseInput(),
        principal: { ...principal(), entryPoint: "DESKTOP_RESEARCH" },
      }, { precommitLogPath: tempPrecommitLogPath() }),
      /entryPoint must be AGENT_INTERNAL/u,
    );
    assert.throws(
      () => prepareTeachingArchiveStoragePrecommit({
        ...baseInput(),
        principal: { ...principal(), scopes: ["RESEARCH_READ", "STUDENT_ASSIGNED_READ"] },
      }, { precommitLogPath: tempPrecommitLogPath() }),
      /STUDENT_ARCHIVE_WRITE scope is required/u,
    );
    assert.throws(
      () => prepareTeachingArchiveStoragePrecommit({
        ...baseInput(),
        principal: { ...principal(), studentAccess: { mode: "ASSIGNED", studentIds: ["student_other"] } },
      }, { precommitLogPath: tempPrecommitLogPath() }),
      /studentAccess must include targetStudentId/u,
    );
    assert.throws(
      () => prepareTeachingArchiveStoragePrecommit({
        ...baseInput(),
        studentArchiveStorageRequest: { ...storageRequest(), analysisIntents: ["AI_GRADING"] },
      }, { precommitLogPath: tempPrecommitLogPath() }),
      /analysisIntents\[\] must be one of ARCHIVE_ONLY,TUTORING/u,
    );
  });

  it("rejects missing projection output, main DB writes, high risk, and unsafe title", () => {
    const missingProjection = baseInput();
    missingProjection.studentArchiveProjectionOutput.status = "NOT_PROJECTED";
    assert.throws(
      () => prepareTeachingArchiveStoragePrecommit(missingProjection, { precommitLogPath: tempPrecommitLogPath() }),
      /status must be STUDENT_ARCHIVE_PROJECTION_WRITTEN/u,
    );
    const mainDbStarted = baseInput();
    mainDbStarted.studentArchiveProjectionOutput.boundary.mainDatabaseWriteStarted = true;
    assert.throws(
      () => prepareTeachingArchiveStoragePrecommit(mainDbStarted, { precommitLogPath: tempPrecommitLogPath() }),
      /mainDatabaseWriteStarted must be false/u,
    );
    const highRisk = baseInput();
    highRisk.studentArchiveProjectionOutput.studentArchiveProjectionRecord.risk.studentDataRisk = "HIGH";
    assert.throws(
      () => prepareTeachingArchiveStoragePrecommit(highRisk, { precommitLogPath: tempPrecommitLogPath() }),
      /HIGH risk projection/u,
    );
    const unsafe = baseInput();
    unsafe.studentArchiveProjectionOutput.studentArchiveProjectionRecord.title = "<script>unsafe</script>";
    assert.throws(
      () => prepareTeachingArchiveStoragePrecommit(unsafe, { precommitLogPath: tempPrecommitLogPath() }),
      /must be encoded safe text/u,
    );
  });
});

function tempPrecommitLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-student-archive-storage-precommit-")), "precommit.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-student-archive-storage-precommit.v1",
    precommitInvocationId: "deep_research_student_archive_storage_precommit_inv_001",
    principal: principal(),
    studentArchiveProjectionOutput: JSON.parse(fs.readFileSync("contracts/agent/deep-research-student-archive-projection.output.example.json", "utf8")),
    studentArchiveStoragePolicy: storagePolicy(),
    studentArchiveStorageRequest: storageRequest(),
    evidenceRefs: ["evidence:student-archive-storage-precommit:projection-consumed"],
    idempotencyKey: "deep-research-student-archive-storage-precommit:job-001",
  };
}

function principal() {
  return {
    principalId: "deep_research_student_archive_storage_service_001",
    subjectType: "SERVICE",
    role: "SERVICE",
    entryPoint: "AGENT_INTERNAL",
    scopes: ["RESEARCH_READ", "STUDENT_ARCHIVE_WRITE", "STUDENT_ASSIGNED_READ"],
    knowledgeAccess: { public: true, private: "ASSIGNED" },
    studentAccess: { mode: "ASSIGNED", studentIds: ["student_001"] },
    requiresHarnessApproval: false,
    sessionId: "deep_research_student_archive_storage_session_001",
    issuedAt: "2026-06-05T00:00:00.000Z",
    expiresAt: "2036-06-05T00:00:00.000Z",
  };
}

function storagePolicy() {
  return {
    projectionOutputRequired: true,
    teachingArchiveCreateItemPrecommitAllowed: true,
    teachingArchiveDomainValidationRequired: true,
    preserveProjectionEvidenceRequired: true,
    idempotentStorageCommandRequired: true,
    studentArchiveWritePrincipalRequired: true,
    studentAudienceScopeRequired: true,
    mainDatabaseWriteAllowed: false,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    directPublicationAllowed: false,
    externalModelCallAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function storageRequest() {
  return {
    targetStudentId: "student_001",
    materialType: "HANDOUT",
    analysisIntents: ["ARCHIVE_ONLY", "TUTORING"],
    tags: ["math_unit"],
    contentRefPrefix: "research-deep-research-projection",
    ocrReserved: false,
    sourceProjectionId: "deep_research_student_archive_projection_001",
  };
}
