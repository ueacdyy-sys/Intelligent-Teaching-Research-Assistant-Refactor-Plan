import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_PORT,
  commitStudentAppAITutorResultStudentArchiveStorage,
  formatStudentAppAITutorResultStudentArchiveStorageCommit,
} from "./student-app-ai-tutor-result-student-archive-storage-commit-runtime.mjs";

describe("Student App AI Tutor result student archive storage commit runtime", () => {
  it("commits safe AI Tutor result guidance into Teaching Archive through the injected use case port", async () => {
    const port = recordingPort();
    const result = await commitStudentAppAITutorResultStudentArchiveStorage(baseInput(), {
      teachingArchiveCreateItemPort: port,
      commitLogPath: tempCommitLogPath(),
      generatedAt: "2026-06-08T12:20:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-08.student-app.ai-tutor-result-student-archive-storage-committed.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMITTED");
    assert.equal(result.sourcePersistenceCommand.commitState, "COMMITTED_TO_STUDENT_ARCHIVE");
    assert.equal(result.teachingArchiveCommit.targetUseCase, "CreateArchiveItem.ExecuteWithPersistence");
    assert.equal(result.teachingArchiveCommit.archiveItem.id, "tarch_student_ai_tutor_result_001");
    assert.equal(result.teachingArchiveCommit.persistence.status, "persisted");
    assert.equal(result.safeGuidanceSnapshot.safeGuidanceOnly, true);
    assert.equal(result.safeGuidanceSnapshot.guidanceSections.length, 2);
    assert.equal(result.boundary.teachingArchiveUseCasePortInvoked, true);
    assert.equal(result.boundary.mainDatabaseWriteStarted, true);
    assert.equal(result.boundary.mainDatabaseWriteCommitted, true);
    assert.equal(result.boundary.directDatabaseAccessAllowed, false);
    assert.equal(result.boundary.executeHttpRequestAllowed, false);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.equal(result.boundary.retrievalStarted, false);
    assert.equal(result.boundary.swarmAllowed, false);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].command.requestBody.studentId, "student_001");
    assert.equal(port.calls[0].command.requestBody.materialType, "HOMEWORK");
    assert.deepEqual(port.calls[0].command.requestBody.analysisIntents, ["ARCHIVE_ONLY", "TUTORING"]);
    assert.match(formatStudentAppAITutorResultStudentArchiveStorageCommit(result), /Main DB committed: true/u);
  });

  it("uses idempotency for replay and rejects conflicting storage commits", async () => {
    const commitLogPath = tempCommitLogPath();
    const port = recordingPort();
    const first = await commitStudentAppAITutorResultStudentArchiveStorage(baseInput(), { teachingArchiveCreateItemPort: port, commitLogPath });
    const replay = await commitStudentAppAITutorResultStudentArchiveStorage(baseInput(), { teachingArchiveCreateItemPort: port, commitLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(commitLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.commitInvocationId = "ai_tutor_result_archive_storage_commit_conflict";
    await assert.rejects(
      () => commitStudentAppAITutorResultStudentArchiveStorage(conflicting, { teachingArchiveCreateItemPort: port, commitLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects missing ports, accepted writes, invalid archive ids, and unsafe guidance text", async () => {
    await assert.rejects(
      () => commitStudentAppAITutorResultStudentArchiveStorage(baseInput(), { commitLogPath: tempCommitLogPath() }),
      /TeachingArchiveCreateItemPort.createArchiveItem is required/u,
    );
    await assert.rejects(
      () => commitStudentAppAITutorResultStudentArchiveStorage(baseInput(), {
        teachingArchiveCreateItemPort: recordingPort({ persistence: { status: "accepted", commandId: "cmd_queued" } }),
        commitLogPath: tempCommitLogPath(),
      }),
      /result\.persistence\.status must be persisted/u,
    );
    await assert.rejects(
      () => commitStudentAppAITutorResultStudentArchiveStorage(baseInput(), {
        teachingArchiveCreateItemPort: recordingPort({ archiveItem: { ...archiveItem(), id: "bad_id" } }),
        commitLogPath: tempCommitLogPath(),
      }),
      /archive item id must use tarch_ prefix/u,
    );
    const unsafe = baseInput();
    unsafe.studentArchivePersistenceCommandReport.runtimeProbes.studentAppAiTutorResultStudentArchivePersistenceCommand.result.studentArchivePersistenceCommand.safeGuidance.guidanceSections[0].text = "<script>unsafe</script>";
    await assert.rejects(
      () => commitStudentAppAITutorResultStudentArchiveStorage(unsafe, {
        teachingArchiveCreateItemPort: recordingPort(),
        commitLogPath: tempCommitLogPath(),
      }),
      /safe student text/u,
    );
  });

  it("rejects direct DB, HTTP, retrieval, model, Swarm policies, student scope mismatch, and leaked fields", async () => {
    for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "retrievalAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.studentArchiveStorageCommitPolicy[field] = true;
      await assert.rejects(
        () => commitStudentAppAITutorResultStudentArchiveStorage(input, {
          teachingArchiveCreateItemPort: recordingPort(),
          commitLogPath: tempCommitLogPath(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }

    await assert.rejects(
      () => commitStudentAppAITutorResultStudentArchiveStorage(baseInput(), {
        teachingArchiveCreateItemPort: recordingPort({ archiveItem: { ...archiveItem(), studentId: "student_other" } }),
        commitLogPath: tempCommitLogPath(),
      }),
      /result\.archiveItem\.studentId must be student_001/u,
    );

    const leaked = baseInput();
    leaked.studentArchivePersistenceCommandReport.runtimeProbes.studentAppAiTutorResultStudentArchivePersistenceCommand.result.studentArchivePersistenceCommand.rawModelOutput = "leak";
    await assert.rejects(
      () => commitStudentAppAITutorResultStudentArchiveStorage(leaked, {
        teachingArchiveCreateItemPort: recordingPort(),
        commitLogPath: tempCommitLogPath(),
      }),
      /rawmodeloutput|rawModelOutput/iu,
    );
  });
});

function tempCommitLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-result-archive-storage-commit-")), "commit.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-archive-storage-commit.v1",
    commitInvocationId: "ai_tutor_result_archive_storage_commit_001",
    studentArchivePersistenceCommandReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-result-student-archive-persistence-command.current.json", "utf8")),
    studentArchiveStorageCommitPolicy: commitPolicy(),
    evidenceRefs: ["evidence:student-app-ai-tutor-result-student-archive-persistence-command:ai_tutor_result_archive_cmd_001"],
    idempotencyKey: "student-app-ai-tutor-result-archive-storage-commit:student_001:tutor_req_student_app_001",
  };
}

function commitPolicy() {
  return {
    archivePersistenceCommandRequired: true,
    teachingArchiveUseCaseCommitAllowed: true,
    injectedTeachingArchivePortRequired: true,
    teachingArchiveDomainValidationRequired: true,
    persistedOutcomeRequired: true,
    preserveSafeGuidanceRequired: true,
    idempotentStorageCommitRequired: true,
    mainDatabaseWriteAllowed: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    directPublicationAllowed: false,
    modelInferenceAllowed: false,
    retrievalAllowed: false,
    answerKeyDisclosureAllowed: false,
    rawModelOutputDisclosureAllowed: false,
    resultRefDisclosureAllowed: false,
    promptDisclosureAllowed: false,
    contentRefDisclosureAllowed: false,
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
        archiveItem: overrides.archiveItem ?? archiveItem(command.requestBody),
        persistence: overrides.persistence ?? { status: "persisted", commandId: "" },
      };
    },
  };
}

function archiveItem(requestBody = {}) {
  return {
    id: "tarch_student_ai_tutor_result_001",
    ownerType: requestBody.ownerType ?? "STUDENT",
    studentId: requestBody.studentId ?? "student_001",
    materialType: requestBody.materialType ?? "HOMEWORK",
    title: requestBody.title ?? "Student AI Tutor result archive tutor_req_student_app_001",
    source: requestBody.source ?? "SYSTEM_IMPORT",
    contentRef: requestBody.contentRef ?? "student-ai-tutor-result-archive:ai_tutor_result_archive_cmd_001:sha256_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    tags: requestBody.tags ?? ["student_app_ai_tutor", "result", "safe_guidance", "archive_commit"],
    analysisIntents: requestBody.analysisIntents ?? ["ARCHIVE_ONLY", "TUTORING"],
    ocrStatus: "NOT_REQUIRED",
    createdAt: "2026-06-08T12:20:00.000Z",
  };
}
