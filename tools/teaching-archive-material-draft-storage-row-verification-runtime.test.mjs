import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION_PORT,
  formatTeachingArchiveMaterialDraftStorageRowVerification,
  verifyTeachingArchiveMaterialDraftStoragePhysicalRow,
} from "./teaching-archive-material-draft-storage-row-verification-runtime.mjs";

describe("TeachingArchiveMaterialDraftStorageRowVerificationPort.verifyTeachingArchivePhysicalRow", () => {
  it("verifies a committed archive material draft through the injected row read port", async () => {
    const verificationLogPath = tempVerificationLogPath();
    const port = recordingRowReadPort();
    const result = await verifyTeachingArchiveMaterialDraftStoragePhysicalRow(baseInput(), {
      verificationLogPath,
      generatedAt: "2026-06-07T08:10:00.000Z",
      teachingArchiveRowReadPort: port,
    });

    assert.equal(result.commandPort, TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION_PORT);
    assert.equal(result.status, "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PHYSICAL_ROW_VERIFIED");
    assert.equal(result.teachingArchivePhysicalRow.targetRepository, "ArchiveRepository.GetByID");
    assert.equal(result.teachingArchivePhysicalRow.targetTable, "teaching_archive_items");
    assert.equal(result.teachingArchivePhysicalRow.archiveItem.id, "tarch_archive_material_001");
    assert.equal(result.boundary.teachingArchiveRowReadPortInvoked, true);
    assert.equal(result.boundary.physicalDatabaseRowVerified, true);
    assert.equal(result.boundary.directDatabaseAccessAllowed, false);
    assert.equal(result.boundary.executeHttpRequestAllowed, false);
    assert.equal(result.boundary.swarmAllowed, false);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].id, "tarch_archive_material_001");
    assert.match(formatTeachingArchiveMaterialDraftStorageRowVerification(result), /Physical row verified: true/u);

    const records = readRecords(verificationLogPath);
    assert.equal(records.length, 1);
    assert.equal(records[0].runtimeId, "teaching_archive_material_draft_storage_row_verification_runtime");
  });

  it("uses idempotency for replay and rejects conflicting committed rows", async () => {
    const verificationLogPath = tempVerificationLogPath();
    const firstPort = recordingRowReadPort();
    const first = await verifyTeachingArchiveMaterialDraftStoragePhysicalRow(baseInput(), {
      verificationLogPath,
      teachingArchiveRowReadPort: firstPort,
    });
    const replayPort = recordingRowReadPort();
    const replay = await verifyTeachingArchiveMaterialDraftStoragePhysicalRow(baseInput(), {
      verificationLogPath,
      teachingArchiveRowReadPort: replayPort,
    });

    assert.equal(first.recordId, replay.recordId);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(firstPort.calls.length, 1);
    assert.equal(replayPort.calls.length, 0);
    assert.equal(readRecords(verificationLogPath).length, 1);

    await assert.rejects(
      () => verifyTeachingArchiveMaterialDraftStoragePhysicalRow(baseInput({
        storageCommitReport: storageCommitReport({ archiveItemPatch: { title: "Different title" } }),
      }), { verificationLogPath, teachingArchiveRowReadPort: recordingRowReadPort() }),
      /record\.inputHash/u,
    );
  });

  it("rejects unsafe storage commit source, policy, missing port, and missing row", async () => {
    await assert.rejects(
      () => verifyTeachingArchiveMaterialDraftStoragePhysicalRow(baseInput({
        storageCommitReport: storageCommitReport({ status: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_REJECTED" }),
      }), { verificationLogPath: tempVerificationLogPath(), teachingArchiveRowReadPort: recordingRowReadPort() }),
      /runtime\.status/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialDraftStoragePhysicalRow(baseInput({
        storageRowVerificationPolicy: { ...storageRowVerificationPolicy(), directDatabaseAccessAllowed: true },
      }), { verificationLogPath: tempVerificationLogPath(), teachingArchiveRowReadPort: recordingRowReadPort() }),
      /directDatabaseAccessAllowed/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialDraftStoragePhysicalRow(baseInput(), { verificationLogPath: tempVerificationLogPath() }),
      /TeachingArchiveRowReadPort\.getArchiveItemById/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialDraftStoragePhysicalRow(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        teachingArchiveRowReadPort: recordingRowReadPort({ found: false }),
      }),
      /result\.found must be true/u,
    );
  });

  it("rejects row mismatches, leaked fields, forbidden analysis intents, and unsafe refs", async () => {
    await assert.rejects(
      () => verifyTeachingArchiveMaterialDraftStoragePhysicalRow(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        teachingArchiveRowReadPort: recordingRowReadPort({ row: { ...archiveItem(), id: "tarch_archive_material_002" } }),
      }),
      /result\.row\.id must be tarch_archive_material_001/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialDraftStoragePhysicalRow(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        teachingArchiveRowReadPort: recordingRowReadPort({ row: { ...archiveItem(), contentRef: "precommit://archive-material/student_001/changed" } }),
      }),
      /result\.row\.contentRef/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialDraftStoragePhysicalRow(baseInput({
        storageCommitReport: storageCommitReport({ resultPatch: { directSql: "blocked" } }),
      }), { verificationLogPath: tempVerificationLogPath(), teachingArchiveRowReadPort: recordingRowReadPort() }),
      /directSql/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialDraftStoragePhysicalRow(baseInput({
        storageCommitReport: storageCommitReport({ archiveItemPatch: { analysisIntents: ["ARCHIVE_ONLY", "AI_GRADING"] } }),
      }), { verificationLogPath: tempVerificationLogPath(), teachingArchiveRowReadPort: recordingRowReadPort() }),
      /analysisIntents/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialDraftStoragePhysicalRow(baseInput({
        storageCommitReport: storageCommitReport({ archiveItemPatch: { contentRef: "http://unsafe.example/material" } }),
      }), { verificationLogPath: tempVerificationLogPath(), teachingArchiveRowReadPort: recordingRowReadPort() }),
      /controlled archive material ref/u,
    );
  });
});

function baseInput(overrides = {}) {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-draft-storage-row-verification.v1",
    verificationInvocationId: "archive_material_draft_storage_row_verification_001",
    storageCommitReport: storageCommitReport(),
    storageRowVerificationPolicy: storageRowVerificationPolicy(),
    evidenceRefs: [
      "evidence:archive-material-draft-storage-commit:archive_material_draft_storage_commit_001",
    ],
    idempotencyKey: "archive-material-draft-storage-row-verification:student_001:fractions_packet",
    ...overrides,
  };
}

function storageCommitReport(overrides = {}) {
  const archiveItemValue = { ...archiveItem(), ...(overrides.archiveItemPatch ?? {}) };
  const result = {
    schemaVersion: "2026-06-07.teaching.archive-material-draft-storage-commit-committed.v1",
    runtimeId: "teaching_archive_material_draft_storage_commit_runtime",
    commandPort: "TeachingArchiveMaterialDraftStorageCommitPort.commitArchiveMaterialDraftStorageCommand",
    status: overrides.status ?? "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMITTED",
    recordId: "teaching_archive_material_draft_storage_commit_archive-material-draft-storage-commit_student_001_fractions_packet",
    committedAt: "2026-06-07T08:00:00.000Z",
    sourcePrecommit: {
      workloadType: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT",
      runtimeId: "teaching_archive_material_draft_storage_precommit_runtime",
      commandPort: "TeachingArchiveMaterialDraftStoragePrecommitPort.prepareArchiveMaterialDraftStorageCommand",
      recordId: "teaching_archive_material_draft_storage_precommit_archive-material-draft-storage-precommit_student_001_fractions_packet",
      precommitId: "archive_material_draft_storage_precommit_001",
      commandId: "archive_material_draft_storage_precommit_command_archive_material_draft_intent_001_student_student_001",
    },
    teachingArchiveCommit: {
      operationId: "createTeachingArchiveItem",
      targetUseCase: "CreateArchiveItem.ExecuteWithPersistence",
      targetRepository: "ArchiveRepository.Create",
      targetTable: "teaching_archive_items",
      archiveItem: archiveItemValue,
      persistence: {
        status: "persisted",
        commandId: "archive_material_draft_storage_precommit_command_archive_material_draft_intent_001_student_student_001",
      },
    },
    boundary: {
      storagePrecommitVerified: true,
      teachingArchiveCreateItemPortInjected: true,
      mainDatabaseWriteAllowedViaUseCasePort: true,
      mainDatabaseWritePrepared: true,
      mainDatabaseWriteStarted: true,
      mainDatabaseWriteCommitted: true,
      finalArchiveItemCreated: true,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      executeHttpRequestAllowed: false,
      directDatabaseAccessAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureRowVerification: true,
    },
    evidenceRefs: ["evidence:archive-material-draft-storage-commit-input-hash:abc"],
    idempotencyKey: "archive-material-draft-storage-commit:student_001:fractions_packet",
    inputHash: "abc",
    ...(overrides.resultPatch ?? {}),
  };
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT",
    runtime: {
      runtimeId: "teaching_archive_material_draft_storage_commit_runtime",
      commandPort: "TeachingArchiveMaterialDraftStorageCommitPort.commitArchiveMaterialDraftStorageCommand",
      status: overrides.status ?? "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMITTED",
    },
    runtimeSlo: { p99Ms: 6, totalErrors: 0 },
    runtimeProbes: {
      teachingArchiveMaterialDraftStorageCommit: { result },
    },
    safetyInvariants: {
      storagePrecommitRequired: true,
      storagePrecommitVerified: true,
      teachingArchiveCreateItemPortInjected: true,
      teachingArchiveUseCaseCommitAllowed: true,
      mainDatabaseWriteAllowedViaUseCasePort: true,
      mainDatabaseWritePrepared: true,
      mainDatabaseWriteStarted: true,
      mainDatabaseWriteCommitted: true,
      finalArchiveItemCreated: true,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      executeHttpRequestAllowed: false,
      directDatabaseAccessAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureRowVerification: true,
    },
  };
}

function archiveItem() {
  return {
    id: "tarch_archive_material_001",
    ownerType: "STUDENT",
    studentId: "student_001",
    materialType: "HANDOUT",
    title: "Fractions practice packet",
    source: "SYSTEM_IMPORT",
    contentRef: "precommit://archive-material/student_001/fractions-packet",
    tags: ["fractions", "draft-approved"],
    analysisIntents: ["ARCHIVE_ONLY"],
    ocrStatus: "NOT_REQUIRED",
    createdAt: "2026-06-07T08:00:00.000Z",
  };
}

function storageRowVerificationPolicy() {
  return {
    storageCommitRequired: true,
    physicalRowVerificationRequired: true,
    injectedTeachingArchiveRowReadPortRequired: true,
    teachingArchiveRepositoryReadRequired: true,
    committedArchiveItemMatchRequired: true,
    preserveCommitEvidenceRequired: true,
    idempotentRowVerificationRequired: true,
    mainDatabaseReadAllowed: true,
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

function recordingRowReadPort(overrides = {}) {
  const calls = [];
  return {
    calls,
    async getArchiveItemById(id, context) {
      calls.push({ id, context });
      return {
        found: overrides.found ?? true,
        source: {
          repositoryMethod: "ArchiveRepository.GetByID",
          targetTable: "teaching_archive_items",
          ...(overrides.source ?? {}),
        },
        row: {
          ...archiveItem(),
          ...(overrides.row ?? {}),
        },
      };
    },
  };
}

function tempVerificationLogPath() {
  return join(mkdtempSync(join(tmpdir(), "teaching-archive-material-row-verification-")), "verification.jsonl");
}

function readRecords(verificationLogPath) {
  return readFileSync(verificationLogPath, "utf8")
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
