import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_COMMAND_PORT,
  commitTeachingArchiveStorage,
  formatDeepResearchStudentArchiveStorageCommit,
} from "./research-deep-research-student-archive-storage-commit-runtime.mjs";

describe("Research deep_research student archive storage commit runtime", () => {
  it("commits a prepared Teaching Archive command through the injected use case port", async () => {
    const port = recordingPort();
    const result = await commitTeachingArchiveStorage(baseInput(), {
      teachingArchiveCreateItemPort: port,
      commitLogPath: tempCommitLogPath(),
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-05.research.deep-research-student-archive-storage-commit-committed.v1");
    assert.equal(result.commandPort, RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_COMMAND_PORT);
    assert.equal(result.status, "TEACHING_ARCHIVE_MAIN_DB_STORAGE_COMMITTED");
    assert.equal(result.teachingArchiveCommit.targetUseCase, "CreateArchiveItem.ExecuteWithPersistence");
    assert.equal(result.teachingArchiveCommit.targetRepository, "ArchiveRepository.Create");
    assert.equal(result.teachingArchiveCommit.targetTable, "teaching_archive_items");
    assert.equal(result.teachingArchiveCommit.archiveItem.id, "tarch_deep_research_001");
    assert.equal(result.teachingArchiveCommit.persistence.status, "persisted");
    assert.equal(result.boundary.teachingArchiveUseCasePortInvoked, true);
    assert.equal(result.boundary.mainDatabaseWriteStarted, true);
    assert.equal(result.boundary.mainDatabaseWriteCommitted, true);
    assert.equal(result.boundary.directDatabaseAccessAllowed, false);
    assert.equal(result.boundary.executeHttpRequestAllowed, false);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].command.requestBody.studentId, "student_001");
    assert.match(formatDeepResearchStudentArchiveStorageCommit(result), /Main DB committed: true/u);
  });

  it("uses idempotency for replay and rejects conflicting commit commands", async () => {
    const commitLogPath = tempCommitLogPath();
    const port = recordingPort();
    const first = await commitTeachingArchiveStorage(baseInput(), { teachingArchiveCreateItemPort: port, commitLogPath });
    const second = await commitTeachingArchiveStorage(baseInput(), { teachingArchiveCreateItemPort: port, commitLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(second.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(commitLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.studentArchiveStoragePrecommitOutput.teachingArchiveCreateCommand.commandId = "different_command";
    await assert.rejects(
      () => commitTeachingArchiveStorage(conflicting, { teachingArchiveCreateItemPort: port, commitLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects missing ports, accepted writes, invalid archive ids, and unsafe command text", async () => {
    await assert.rejects(
      () => commitTeachingArchiveStorage(baseInput(), { commitLogPath: tempCommitLogPath() }),
      /TeachingArchiveCreateItemPort.createArchiveItem is required/u,
    );
    await assert.rejects(
      () => commitTeachingArchiveStorage(baseInput(), {
        teachingArchiveCreateItemPort: recordingPort({ persistence: { status: "accepted", commandId: "cmd_queued" } }),
        commitLogPath: tempCommitLogPath(),
      }),
      /result\.persistence\.status must be persisted/u,
    );
    await assert.rejects(
      () => commitTeachingArchiveStorage(baseInput(), {
        teachingArchiveCreateItemPort: recordingPort({ archiveItem: { ...archiveItem(), id: "bad_id" } }),
        commitLogPath: tempCommitLogPath(),
      }),
      /archive item id must use tarch_ prefix/u,
    );
    const unsafe = baseInput();
    unsafe.studentArchiveStoragePrecommitOutput.teachingArchiveCreateCommand.requestBody.title = "<script>unsafe</script>";
    await assert.rejects(
      () => commitTeachingArchiveStorage(unsafe, {
        teachingArchiveCreateItemPort: recordingPort(),
        commitLogPath: tempCommitLogPath(),
      }),
      /must be encoded safe text/u,
    );
  });

  it("rejects direct DB or HTTP policies, student scope mismatch, and Swarm", async () => {
    const directDb = baseInput();
    directDb.studentArchiveCommitPolicy.directDatabaseAccessAllowed = true;
    await assert.rejects(
      () => commitTeachingArchiveStorage(directDb, {
        teachingArchiveCreateItemPort: recordingPort(),
        commitLogPath: tempCommitLogPath(),
      }),
      /directDatabaseAccessAllowed must be false/u,
    );

    const http = baseInput();
    http.studentArchiveCommitPolicy.executeHttpRequestAllowed = true;
    await assert.rejects(
      () => commitTeachingArchiveStorage(http, {
        teachingArchiveCreateItemPort: recordingPort(),
        commitLogPath: tempCommitLogPath(),
      }),
      /executeHttpRequestAllowed must be false/u,
    );

    const wrongStudent = baseInput();
    wrongStudent.studentArchiveStoragePrecommitOutput.teachingArchiveCreateCommand.principalContextHeader.studentAccess.studentIds = ["student_other"];
    await assert.rejects(
      () => commitTeachingArchiveStorage(wrongStudent, {
        teachingArchiveCreateItemPort: recordingPort(),
        commitLogPath: tempCommitLogPath(),
      }),
      /studentAccess must include requestBody\.studentId/u,
    );

    const swarm = baseInput();
    swarm.studentArchiveCommitPolicy.swarmAllowed = true;
    await assert.rejects(
      () => commitTeachingArchiveStorage(swarm, {
        teachingArchiveCreateItemPort: recordingPort(),
        commitLogPath: tempCommitLogPath(),
      }),
      /swarmAllowed must be false/u,
    );
  });
});

function tempCommitLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-student-archive-storage-commit-")), "commit.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-student-archive-storage-commit.v1",
    commitInvocationId: "deep_research_student_archive_storage_commit_inv_001",
    studentArchiveStoragePrecommitOutput: JSON.parse(fs.readFileSync("contracts/agent/deep-research-student-archive-storage-precommit.output.example.json", "utf8")),
    studentArchiveCommitPolicy: commitPolicy(),
    evidenceRefs: ["evidence:student-archive-storage-commit:precommit-consumed"],
    idempotencyKey: "deep-research-student-archive-storage-commit:job-001",
  };
}

function commitPolicy() {
  return {
    storagePrecommitRequired: true,
    teachingArchiveUseCaseCommitAllowed: true,
    injectedTeachingArchivePortRequired: true,
    teachingArchiveDomainValidationRequired: true,
    persistedOutcomeRequired: true,
    preserveProjectionEvidenceRequired: true,
    idempotentStorageCommitRequired: true,
    mainDatabaseWriteAllowed: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    directPublicationAllowed: false,
    externalModelCallAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function recordingPort(overrides = {}) {
  const calls = [];
  return {
    calls,
    async createArchiveItem(command, context) {
      calls.push({ command, context });
      return {
        archiveItem: overrides.archiveItem ?? archiveItem(),
        persistence: overrides.persistence ?? { status: "persisted", commandId: "" },
      };
    },
  };
}

function archiveItem() {
  return {
    id: "tarch_deep_research_001",
    ownerType: "STUDENT",
    studentId: "student_001",
    materialType: "HANDOUT",
    title: "Evidence grounded learning support draft",
    source: "SYSTEM_IMPORT",
    contentRef: "research-deep-research-projection:deep_research_student_archive_projection_001:sha256_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    tags: ["deep_research", "student_archive", "projection", "math_unit"],
    analysisIntents: ["ARCHIVE_ONLY", "TUTORING"],
    ocrStatus: "NOT_REQUIRED",
    createdAt: "2026-06-05T00:00:00.000Z",
  };
}
