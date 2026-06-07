import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_PORT,
  formatTeachingArchiveMaterialPublicationRowVerification,
  verifyTeachingArchiveMaterialPublicationPhysicalRow,
} from "./teaching-archive-material-publication-row-verification-runtime.mjs";

describe("TeachingArchiveMaterialPublicationRowVerificationPort.verifyTeachingArchivePublicationPhysicalRow", () => {
  it("verifies a committed material publication through the injected publication row read port", async () => {
    const calls = [];
    const verificationLogPath = tempVerificationLogPath();
    const result = await verifyTeachingArchiveMaterialPublicationPhysicalRow(baseInput(), {
      verificationLogPath,
      generatedAt: "2026-06-07T10:50:00.000Z",
      probeP99Ms: 7,
      teachingArchivePublicationRowReadPort: publicationRowReadPort(calls),
    });

    assert.equal(result.commandPort, TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_PORT);
    assert.equal(result.status, "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PHYSICAL_ROW_VERIFIED");
    assert.equal(result.sourcePublicationStorageCommit.runtimeId, "teaching_archive_material_publication_storage_commit_runtime");
    assert.equal(result.teachingArchivePublicationPhysicalRow.targetRepository, "PublicationRepository.GetByID");
    assert.equal(result.teachingArchivePublicationPhysicalRow.targetStore, "TEACHING_ARCHIVE_PUBLICATION_STORE");
    assert.equal(result.teachingArchivePublicationPhysicalRow.targetTable, "teaching_archive_publications");
    assert.equal(result.teachingArchivePublicationPhysicalRow.publicationRecord.publicationId, "archive_material_publication_commit_001");
    assert.equal(result.boundary.publicationPhysicalRowVerified, true);
    assert.equal(result.boundary.mainDatabaseReadAllowed, true);
    assert.equal(result.boundary.directDatabaseAccessAllowed, false);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.equal(result.boundary.swarmAllowed, false);
    assert.equal(result.runtimeSlo.p99Ms, 7);
    assert.equal(new Set(result.evidenceRefs).size, result.evidenceRefs.length);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].publicationId, "archive_material_publication_commit_001");
    assert.equal(calls[0].context.sourceStorageCommitRecordId, "teaching_archive_material_publication_storage_commit_archive-material-publication-storage-commit-student_001-fractions_packet");
    assert.match(formatTeachingArchiveMaterialPublicationRowVerification(result), /Physical row verified: true/u);

    const records = readRecords(verificationLogPath);
    assert.equal(records.length, 1);
    assert.equal(records[0].runtimeId, "teaching_archive_material_publication_row_verification_runtime");
  });

  it("uses idempotency for replay and rejects conflicting publication rows", async () => {
    const verificationLogPath = tempVerificationLogPath();
    const firstCalls = [];
    const first = await verifyTeachingArchiveMaterialPublicationPhysicalRow(baseInput(), {
      verificationLogPath,
      teachingArchivePublicationRowReadPort: publicationRowReadPort(firstCalls),
    });
    const replayCalls = [];
    const replay = await verifyTeachingArchiveMaterialPublicationPhysicalRow(baseInput(), {
      verificationLogPath,
      teachingArchivePublicationRowReadPort: publicationRowReadPort(replayCalls),
    });

    assert.equal(first.recordId, replay.recordId);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(firstCalls.length, 1);
    assert.equal(replayCalls.length, 0);
    assert.equal(readRecords(verificationLogPath).length, 1);

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationPhysicalRow(baseInput({
        publicationStorageCommitReport: storageCommitReport({
          publicationRecordPatch: { title: "Different publication title" },
        }),
      }), { verificationLogPath, teachingArchivePublicationRowReadPort: publicationRowReadPort() }),
      /idempotency key already exists/u,
    );
  });

  it("rejects unsafe storage commit source, unsafe policy, missing port, and missing row", async () => {
    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationPhysicalRow(baseInput({
        publicationStorageCommitReport: storageCommitReport({
          status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_REJECTED",
        }),
      }), { verificationLogPath: tempVerificationLogPath(), teachingArchivePublicationRowReadPort: publicationRowReadPort() }),
      /runtime\.status/u,
    );

    const unsafePolicy = baseInput();
    unsafePolicy.publicationRowVerificationPolicy.directDatabaseAccessAllowed = true;
    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationPhysicalRow(unsafePolicy, {
        verificationLogPath: tempVerificationLogPath(),
        teachingArchivePublicationRowReadPort: publicationRowReadPort(),
      }),
      /directDatabaseAccessAllowed must be false/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationPhysicalRow(baseInput(), { verificationLogPath: tempVerificationLogPath() }),
      /TeachingArchivePublicationRowReadPort\.getPublicationById/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationPhysicalRow(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        teachingArchivePublicationRowReadPort: publicationRowReadPort([], { found: false }),
      }),
      /result\.found must be true/u,
    );
  });

  it("rejects row mismatches, leaked fields, unsafe text, and unsafe content refs", async () => {
    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationPhysicalRow(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        teachingArchivePublicationRowReadPort: publicationRowReadPort([], {
          row: { publicationId: "archive_material_publication_commit_002" },
        }),
      }),
      /result\.row\.publicationId/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationPhysicalRow(baseInput({
        publicationStorageCommitReport: storageCommitReport({ resultPatch: { directSql: "blocked" } }),
      }), { verificationLogPath: tempVerificationLogPath(), teachingArchivePublicationRowReadPort: publicationRowReadPort() }),
      /directSql/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationPhysicalRow(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        teachingArchivePublicationRowReadPort: publicationRowReadPort([], {
          row: { title: "<script>publish</script>" },
        }),
      }),
      /title contains unsafe text/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationPhysicalRow(baseInput({
        publicationStorageCommitReport: storageCommitReport({
          publicationRecordPatch: { contentRef: "http://unsafe.example/material" },
        }),
      }), { verificationLogPath: tempVerificationLogPath(), teachingArchivePublicationRowReadPort: publicationRowReadPort() }),
      /contentRef must use an approved content ref scheme/u,
    );
  });
});

function baseInput(overrides = {}) {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-row-verification.v1",
    verificationInvocationId: "archive_material_publication_row_verification_001",
    publicationStorageCommitReport: storageCommitReport(),
    publicationRowVerificationPolicy: publicationRowVerificationPolicy(),
    evidenceRefs: [
      "evidence:publication-storage-commit:0311",
      "evidence:publication-row-verification:0312",
    ],
    idempotencyKey: "archive-material-publication-row-verification:student_001:fractions_packet",
    ...overrides,
  };
}

function publicationRowVerificationPolicy() {
  return {
    storageCommitRequired: true,
    physicalPublicationRowVerificationRequired: true,
    injectedTeachingArchivePublicationRowReadPortRequired: true,
    publicationRepositoryReadRequired: true,
    committedPublicationRecordMatchRequired: true,
    preserveApprovalEvidenceRequired: true,
    preserveDeliveryEnvelopeRequired: true,
    studentOwnScopeRequired: true,
    idempotentPublicationRowVerificationRequired: true,
    mainDatabaseReadAllowed: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    ocrOrRagJobWriteAllowed: false,
    aiGradingWriteAllowed: false,
    modelInferenceAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function storageCommitReport(overrides = {}) {
  const publicationRecordValue = {
    ...publicationRecord(),
    ...(overrides.publicationRecordPatch ?? {}),
  };
  const result = {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-storage-committed.v1",
    runtimeId: "teaching_archive_material_publication_storage_commit_runtime",
    commandPort: "TeachingArchiveMaterialPublicationStorageCommitPort.commitTeachingArchiveMaterialPublication",
    status: overrides.status ?? "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMITTED",
    recordId: "teaching_archive_material_publication_storage_commit_archive-material-publication-storage-commit-student_001-fractions_packet",
    committedAt: "2026-06-07T10:40:00.000Z",
    commitInvocationId: "archive_material_publication_storage_commit_001",
    sourcePersistenceCommand: {
      runtimeId: "teaching_archive_material_publication_persistence_command_runtime",
      recordId: "teaching_archive_material_publication_persistence_command_archive-material-publication-persistence-command-student_001-fractions_packet",
      commandId: "archive_material_publication_persist_cmd_001",
      commandState: "COMMITTED_TO_PUBLICATION_STORE",
    },
    publicationCommit: {
      operationId: "commitTeachingArchiveMaterialPublication",
      targetUseCase: "CommitTeachingArchiveMaterialPublication.ExecuteWithPersistence",
      targetRepository: "PublicationRepository.Commit",
      targetStore: "TEACHING_ARCHIVE_PUBLICATION_STORE",
      publicationRecord: publicationRecordValue,
      persistence: {
        status: "persisted",
        commandId: "archive_material_publication_commit_001",
      },
    },
    boundary: {
      publicationPersistenceCommandVerified: true,
      publicationCommitPortInjected: true,
      publicationApprovalPreserved: true,
      publicationDeliveryEnvelopePreserved: true,
      studentOwnScopeEnforced: true,
      safeMaterialPointerOnly: true,
      durablePublicationPersistenceStarted: true,
      publicationCommitted: true,
      studentVisiblePublished: true,
      mainDatabaseWriteStarted: true,
      mainDatabaseWriteCommitted: true,
      studentArchiveWriteStarted: true,
      studentArchiveWriteCommitted: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFuturePublicationRowVerification: true,
    },
    evidenceRefs: ["evidence:publication-storage-commit:0311"],
    idempotencyKey: "archive-material-publication-storage-commit:student_001:fractions_packet",
    inputHash: "storage-commit-input-hash",
    ...(overrides.resultPatch ?? {}),
  };
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT",
    runtime: {
      runtimeId: "teaching_archive_material_publication_storage_commit_runtime",
      commandPort: "TeachingArchiveMaterialPublicationStorageCommitPort.commitTeachingArchiveMaterialPublication",
      status: overrides.status ?? "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMITTED",
    },
    runtimeSlo: { p99Ms: 8, totalErrors: 0 },
    runtimeProbes: {
      teachingArchiveMaterialPublicationStorageCommit: { result },
    },
    safetyInvariants: {
      publicationPersistenceCommandVerified: true,
      publicationCommitPortInjected: true,
      durablePublicationPersistenceStarted: true,
      publicationCommitted: true,
      studentVisiblePublished: true,
      mainDatabaseWriteCommitted: true,
      studentArchiveWriteCommitted: true,
      futurePublicationRowVerificationRequired: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
  };
}

function publicationRecord() {
  return {
    publicationId: "archive_material_publication_commit_001",
    publicationState: "COMMITTED_TO_PUBLICATION_STORE",
    visibilityState: "STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED",
    channel: "STUDENT_APP",
    scopeRef: {
      scopeType: "STUDENT_OWN_ARCHIVE",
      studentId: "student_001",
      archiveItemId: "tarch_archive_material_001",
    },
    approvalRecordId: "teaching_archive_material_publication_approval_archive-material-publication-approval-student_001-fractions_packet",
    approvalId: "archive_material_publication_approval_001",
    publicationCandidateId: "archive_material_pub_precheck_001",
    archiveItemId: "tarch_archive_material_001",
    studentId: "student_001",
    materialType: "HANDOUT",
    title: "Fractions practice packet",
    contentRef: "precommit://archive-material/student_001/fractions-packet",
    committedAt: "2026-06-07T10:40:00.000Z",
  };
}

function publicationRowReadPort(calls = [], overrides = {}) {
  return {
    calls,
    async getPublicationById(publicationId, context) {
      calls.push({ publicationId, context });
      return {
        found: overrides.found ?? true,
        source: {
          repositoryMethod: "PublicationRepository.GetByID",
          targetStore: "TEACHING_ARCHIVE_PUBLICATION_STORE",
          targetTable: "teaching_archive_publications",
          ...(overrides.source ?? {}),
        },
        row: {
          ...publicationRecord(),
          ...(overrides.row ?? {}),
        },
      };
    },
  };
}

function tempVerificationLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "teaching-archive-material-publication-row-verification-")), "verification.jsonl");
}

function readRecords(verificationLogPath) {
  return fs.readFileSync(verificationLogPath, "utf8")
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
