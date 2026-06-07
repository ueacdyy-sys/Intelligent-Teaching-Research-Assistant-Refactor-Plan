import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_PORT,
  commitTeachingArchiveMaterialDraftStorage,
} from "./teaching-archive-material-draft-storage-commit-runtime.mjs";

describe("TeachingArchiveMaterialDraftStorageCommitPort.commitArchiveMaterialDraftStorageCommand", () => {
  it("commits a precommitted archive material draft through the injected Teaching Archive port", async () => {
    const commitLogPath = tempCommitLogPath();
    const result = await commitTeachingArchiveMaterialDraftStorage(baseInput(), {
      commitLogPath,
      generatedAt: "2026-06-07T08:00:00.000Z",
      teachingArchiveCreateItemPort: createItemPort(),
    });

    assert.equal(result.commandPort, TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_PORT);
    assert.equal(result.status, "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMITTED");
    assert.equal(result.teachingArchiveCommit.targetUseCase, "CreateArchiveItem.ExecuteWithPersistence");
    assert.equal(result.teachingArchiveCommit.archiveItem.id, "tarch_archive_material_001");
    assert.equal(result.teachingArchiveCommit.persistence.status, "persisted");
    assert.equal(result.boundary.mainDatabaseWriteCommitted, true);
    assert.equal(result.boundary.directDatabaseAccessAllowed, false);
    assert.equal(result.boundary.ocrOrRagJobWriteStarted, false);
    assert.equal(result.boundary.aiGradingWriteStarted, false);
    assert.equal(result.boundary.swarmAllowed, false);
    assert.equal(result.runtimeSlo.p99Ms, 8);

    const records = readRecords(commitLogPath);
    assert.equal(records.length, 1);
    assert.equal(records[0].runtimeId, "teaching_archive_material_draft_storage_commit_runtime");
  });

  it("uses idempotency for replay and rejects conflicting commits", async () => {
    const commitLogPath = tempCommitLogPath();
    const first = await commitTeachingArchiveMaterialDraftStorage(baseInput(), {
      commitLogPath,
      generatedAt: "2026-06-07T08:00:00.000Z",
      teachingArchiveCreateItemPort: createItemPort(),
    });
    const second = await commitTeachingArchiveMaterialDraftStorage(baseInput(), {
      commitLogPath,
      generatedAt: "2026-06-07T08:05:00.000Z",
      teachingArchiveCreateItemPort: createItemPort(),
    });

    assert.equal(first.recordId, second.recordId);
    assert.equal(second.idempotentReplay, true);
    assert.equal(readRecords(commitLogPath).length, 1);

    await assert.rejects(
      () => commitTeachingArchiveMaterialDraftStorage(baseInput({
        storageCommitPolicy: { ...storageCommitPolicy(), preservePrecommitEvidenceRequired: false },
      }), { commitLogPath, teachingArchiveCreateItemPort: createItemPort() }),
      /preservePrecommitEvidenceRequired/u,
    );
  });

  it("rejects unsafe precommit source, policy, analysis intent, and missing port", async () => {
    await assert.rejects(
      () => commitTeachingArchiveMaterialDraftStorage(baseInput({
        storagePrecommitReport: storagePrecommitReport({ status: "NOT_READY" }),
      }), { commitLogPath: tempCommitLogPath(), teachingArchiveCreateItemPort: createItemPort() }),
      /runtime\.status/u,
    );

    await assert.rejects(
      () => commitTeachingArchiveMaterialDraftStorage(baseInput({
        storageCommitPolicy: { ...storageCommitPolicy(), directDatabaseAccessAllowed: true },
      }), { commitLogPath: tempCommitLogPath(), teachingArchiveCreateItemPort: createItemPort() }),
      /directDatabaseAccessAllowed/u,
    );

    await assert.rejects(
      () => commitTeachingArchiveMaterialDraftStorage(baseInput({
        storagePrecommitReport: storagePrecommitReport({ analysisIntents: ["ARCHIVE_ONLY", "AI_GRADING"] }),
      }), { commitLogPath: tempCommitLogPath(), teachingArchiveCreateItemPort: createItemPort() }),
      /ARCHIVE_ONLY only/u,
    );

    const commitLogPath = tempCommitLogPath();
    await assert.rejects(
      () => commitTeachingArchiveMaterialDraftStorage(baseInput(), { commitLogPath }),
      /TeachingArchiveCreateItemPort\.createArchiveItem/u,
    );
    assert.equal(existsSync(commitLogPath), false);
  });

  it("rejects leaked fields, unsafe port results, and archive item mismatch", async () => {
    await assert.rejects(
      () => commitTeachingArchiveMaterialDraftStorage(baseInput({
        storagePrecommitReport: storagePrecommitReport({ commandPatch: { directSql: "blocked" } }),
      }), { commitLogPath: tempCommitLogPath(), teachingArchiveCreateItemPort: createItemPort() }),
      /directSql/u,
    );

    await assert.rejects(
      () => commitTeachingArchiveMaterialDraftStorage(baseInput(), {
        commitLogPath: tempCommitLogPath(),
        teachingArchiveCreateItemPort: createItemPort({ archiveItem: { id: "archive_material_bad_id" } }),
      }),
      /tarch_/u,
    );

    await assert.rejects(
      () => commitTeachingArchiveMaterialDraftStorage(baseInput(), {
        commitLogPath: tempCommitLogPath(),
        teachingArchiveCreateItemPort: createItemPort({ archiveItem: { studentId: "student_999" } }),
      }),
      /studentId/u,
    );

    await assert.rejects(
      () => commitTeachingArchiveMaterialDraftStorage(baseInput(), {
        commitLogPath: tempCommitLogPath(),
        teachingArchiveCreateItemPort: createItemPort({ persistence: { status: "accepted" } }),
      }),
      /persistence\.status/u,
    );
  });
});

function baseInput(overrides = {}) {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-draft-storage-commit.v1",
    commitInvocationId: "archive_material_draft_storage_commit_001",
    storagePrecommitReport: storagePrecommitReport(),
    storageCommitPolicy: storageCommitPolicy(),
    evidenceRefs: [
      "evidence:archive-material-draft-human-review:archive_material_draft_review_001",
      "evidence:archive-material-draft-storage-precommit:archive_material_draft_storage_precommit_001",
    ],
    idempotencyKey: "archive-material-draft-storage-commit:student_001:fractions_packet",
    ...overrides,
  };
}

function storagePrecommitReport(overrides = {}) {
  const requestBody = {
    ownerType: "STUDENT",
    studentId: "student_001",
    materialType: "HANDOUT",
    title: "Fractions practice packet",
    source: "SYSTEM_IMPORT",
    contentRef: "precommit://archive-material/student_001/fractions-packet",
    tags: ["fractions", "draft-approved"],
    analysisIntents: overrides.analysisIntents ?? ["ARCHIVE_ONLY"],
    ocrReserved: false,
  };
  const command = {
    commandId: "archive_material_draft_storage_precommit_command_archive_material_draft_intent_001_student_student_001",
    operationId: "createTeachingArchiveItem",
    targetUseCase: "CreateArchiveItem.ExecuteWithPersistence",
    targetRepository: "ArchiveRepository.Create",
    targetTable: "teaching_archive_items",
    sourceHumanReviewRecordId: "teaching_archive_material_draft_human_review_archive-material-draft-review_student_001_fractions_packet",
    sourceDraftIntentId: "archive_material_draft_intent_001",
    requestBody,
    authorization: {
      principalId: "teacher_001",
      requiredScopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "HARNESS_APPROVE"],
      studentAccess: { mode: "ASSIGNED", studentIds: ["student_001"] },
    },
    ...(overrides.commandPatch ?? {}),
  };
  const status = overrides.status ?? "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_READY";
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT",
    runtime: {
      runtimeId: "teaching_archive_material_draft_storage_precommit_runtime",
      commandPort: "TeachingArchiveMaterialDraftStoragePrecommitPort.prepareArchiveMaterialDraftStorageCommand",
      status,
    },
    runtimeSlo: { p99Ms: 6, totalErrors: 0 },
    runtimeProbes: {
      teachingArchiveMaterialDraftStoragePrecommit: {
        result: {
          schemaVersion: "2026-06-07.teaching.archive-material-draft-storage-precommit-prepared.v1",
          runtimeId: "teaching_archive_material_draft_storage_precommit_runtime",
          commandPort: "TeachingArchiveMaterialDraftStoragePrecommitPort.prepareArchiveMaterialDraftStorageCommand",
          status,
          recordId: "teaching_archive_material_draft_storage_precommit_archive-material-draft-storage-precommit_student_001_fractions_packet",
          sourceHumanReview: {
            recordId: "teaching_archive_material_draft_human_review_archive-material-draft-review_student_001_fractions_packet",
          },
          precommit: {
            precommitId: "archive_material_draft_storage_precommit_001",
            commandId: command.commandId,
            executionState: "STORAGE_PRECOMMIT_RECORDED_NOT_COMMITTED",
          },
          teachingArchiveCreateCommand: command,
          boundary: {
            mainDatabaseWritePrepared: true,
            mainDatabaseWriteStarted: false,
            mainDatabaseWriteCommitted: false,
            ocrOrRagJobWriteStarted: false,
            aiGradingWriteStarted: false,
          },
          evidenceRefs: ["evidence:archive-material-draft-storage-precommit-input-hash:abc"],
        },
      },
    },
  };
}

function storageCommitPolicy() {
  return {
    storagePrecommitRequired: true,
    teachingArchiveUseCaseCommitAllowed: true,
    injectedTeachingArchivePortRequired: true,
    idempotentStorageCommitRequired: true,
    mainDatabaseWriteAllowed: true,
    preservePrecommitEvidenceRequired: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    ocrOrRagJobWriteAllowed: false,
    aiGradingWriteAllowed: false,
    externalModelCallAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function createItemPort(overrides = {}) {
  return {
    async createArchiveItem(command) {
      return {
        archiveItem: {
          id: "tarch_archive_material_001",
          ownerType: command.requestBody.ownerType,
          studentId: command.requestBody.studentId,
          materialType: command.requestBody.materialType,
          title: command.requestBody.title,
          source: command.requestBody.source,
          contentRef: command.requestBody.contentRef,
          tags: command.requestBody.tags,
          analysisIntents: command.requestBody.analysisIntents,
          ocrStatus: "NOT_REQUIRED",
          createdAt: "2026-06-07T08:00:00.000Z",
          ...(overrides.archiveItem ?? {}),
        },
        persistence: {
          status: "persisted",
          commandId: command.commandId,
          ...(overrides.persistence ?? {}),
        },
      };
    },
  };
}

function tempCommitLogPath() {
  return join(mkdtempSync(join(tmpdir(), "teaching-archive-material-storage-commit-")), "commit.jsonl");
}

function readRecords(commitLogPath) {
  return readFileSync(commitLogPath, "utf8")
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
