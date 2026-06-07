import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_PORT,
  commitTeachingArchiveMaterialPublicationStorage,
  formatTeachingArchiveMaterialPublicationStorageCommit,
} from "./teaching-archive-material-publication-storage-commit-runtime.mjs";

describe("TeachingArchiveMaterialPublicationStorageCommitPort.commitTeachingArchiveMaterialPublication", () => {
  it("commits a reviewed publication persistence command through the injected publication commit port", async () => {
    const calls = [];
    const result = await commitTeachingArchiveMaterialPublicationStorage(baseInput(), {
      commitLogPath: tempCommitLogPath(),
      generatedAt: "2026-06-07T10:40:00.000Z",
      probeP99Ms: 9,
      teachingArchivePublicationCommitPort: publicationCommitPort(calls),
    });

    assert.equal(result.commandPort, TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_PORT);
    assert.equal(result.status, "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMITTED");
    assert.equal(result.publicationCommit.publicationRecord.publicationState, "COMMITTED_TO_PUBLICATION_STORE");
    assert.equal(result.publicationCommit.publicationRecord.archiveItemId, "tarch_archive_material_001");
    assert.equal(result.publicationCommit.persistence.status, "persisted");
    assert.equal(result.boundary.publicationCommitted, true);
    assert.equal(result.boundary.studentVisiblePublished, true);
    assert.equal(result.boundary.mainDatabaseWriteCommitted, true);
    assert.equal(result.boundary.directDatabaseAccessAllowed, false);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.equal(result.boundary.swarmAllowed, false);
    assert.equal(result.runtimeSlo.p99Ms, 9);
    assert.equal(new Set(result.evidenceRefs).size, result.evidenceRefs.length);
    assert.equal(calls.length, 1);
    assert.match(formatTeachingArchiveMaterialPublicationStorageCommit(result), /Committed: true/u);
  });

  it("uses idempotency for replay and rejects conflicting publication commits", async () => {
    const commitLogPath = tempCommitLogPath();
    const first = await commitTeachingArchiveMaterialPublicationStorage(baseInput(), {
      commitLogPath,
      teachingArchivePublicationCommitPort: publicationCommitPort(),
    });
    const replay = await commitTeachingArchiveMaterialPublicationStorage(baseInput(), {
      commitLogPath,
      teachingArchivePublicationCommitPort: publicationCommitPort(),
    });

    assert.equal(first.recordId, replay.recordId);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(fs.readFileSync(commitLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.commitInvocationId = "archive_material_publication_storage_commit_conflict";
    await assert.rejects(
      () => commitTeachingArchiveMaterialPublicationStorage(conflicting, { commitLogPath, teachingArchivePublicationCommitPort: publicationCommitPort() }),
      /idempotency key already exists/u,
    );
  });

  it("rejects unsafe source, request mismatch, missing evidence, and missing port", async () => {
    const unsafeSource = baseInput();
    unsafeSource.publicationPersistenceCommandReport.safetyInvariants.publicationPersistenceCommandRecorded = false;
    await assert.rejects(() => commitTeachingArchiveMaterialPublicationStorage(unsafeSource, { commitLogPath: tempCommitLogPath(), teachingArchivePublicationCommitPort: publicationCommitPort() }), /publicationPersistenceCommandRecorded must be true/u);

    const mismatch = baseInput();
    mismatch.publicationStorageCommitRequest.archiveItemId = "tarch_archive_material_other";
    await assert.rejects(() => commitTeachingArchiveMaterialPublicationStorage(mismatch, { commitLogPath: tempCommitLogPath(), teachingArchivePublicationCommitPort: publicationCommitPort() }), /archiveItemId must be tarch_archive_material_001/u);

    const missingEvidence = baseInput();
    missingEvidence.evidenceRefs = ["evidence:publication-storage-commit:0311", "evidence:other"];
    await assert.rejects(() => commitTeachingArchiveMaterialPublicationStorage(missingEvidence, { commitLogPath: tempCommitLogPath(), teachingArchivePublicationCommitPort: publicationCommitPort() }), /publication persistence command evidence ref is required/u);

    await assert.rejects(() => commitTeachingArchiveMaterialPublicationStorage(baseInput(), { commitLogPath: tempCommitLogPath() }), /TeachingArchivePublicationCommitPort\.commitPublication/u);
  });

  it("rejects unsafe policy, leaked fields, unsafe text, and unsafe port results", async () => {
    for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "ocrOrRagJobWriteAllowed", "aiGradingWriteAllowed", "modelInferenceAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.publicationStorageCommitPolicy[field] = true;
      await assert.rejects(() => commitTeachingArchiveMaterialPublicationStorage(input, { commitLogPath: tempCommitLogPath(), teachingArchivePublicationCommitPort: publicationCommitPort() }), new RegExp(`${field} must be false`, "u"));
    }

    const leak = baseInput();
    leak.publicationStorageCommitRequest.databaseWriteResult = "unsafe";
    await assert.rejects(() => commitTeachingArchiveMaterialPublicationStorage(leak, { commitLogPath: tempCommitLogPath(), teachingArchivePublicationCommitPort: publicationCommitPort() }), /databaseWriteResult is not allowed/u);

    const unsafeText = baseInput();
    const command = unsafeText.publicationPersistenceCommandReport.runtimeProbes.teachingArchiveMaterialPublicationPersistenceCommand.result.publicationPersistenceCommand;
    command.title = "<script>publish</script>";
    unsafeText.publicationStorageCommitRequest.title = "<script>publish</script>";
    await assert.rejects(() => commitTeachingArchiveMaterialPublicationStorage(unsafeText, { commitLogPath: tempCommitLogPath(), teachingArchivePublicationCommitPort: publicationCommitPort() }), /title contains unsafe text/u);

    await assert.rejects(() => commitTeachingArchiveMaterialPublicationStorage(baseInput(), {
      commitLogPath: tempCommitLogPath(),
      teachingArchivePublicationCommitPort: publicationCommitPort([], { publicationRecord: { archiveItemId: "tarch_other" } }),
    }), /archiveItemId/u);

    await assert.rejects(() => commitTeachingArchiveMaterialPublicationStorage(baseInput(), {
      commitLogPath: tempCommitLogPath(),
      teachingArchivePublicationCommitPort: publicationCommitPort([], { persistence: { status: "accepted" } }),
    }), /persistence\.status/u);
  });
});

function baseInput() {
  const report = persistenceCommandReport();
  const command = report.runtimeProbes.teachingArchiveMaterialPublicationPersistenceCommand.result.publicationPersistenceCommand;
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-storage-commit.v1",
    commitInvocationId: "archive_material_publication_storage_commit_001",
    publicationPersistenceCommandReport: report,
    publicationStorageCommitPolicy: publicationStorageCommitPolicy(),
    publicationStorageCommitRequest: {
      commitId: "archive_material_publication_commit_001",
      commitMode: "DURABLE_STUDENT_ARCHIVE_MATERIAL_PUBLICATION",
      targetPublicationStore: "TEACHING_ARCHIVE_PUBLICATION_STORE",
      desiredPublicationState: "COMMITTED_TO_PUBLICATION_STORE",
      scopeRef: command.scopeRef,
      sourcePersistenceCommandRecordId: "teaching_archive_material_publication_persistence_command_archive-material-publication-persistence-command-student_001-fractions_packet",
      sourcePersistenceCommandId: command.commandId,
      sourceDeliveryEnvelopeId: command.sourceDeliveryEnvelopeId,
      approvalRecordId: command.approvalRecordId,
      approvalId: command.approvalId,
      publicationCandidateId: command.publicationCandidateId,
      archiveItemId: command.archiveItemId,
      studentId: command.studentId,
      materialType: command.materialType,
      title: command.title,
      contentRef: command.contentRef,
    },
    evidenceRefs: ["evidence:publication-persistence-command:0310", "evidence:publication-storage-commit:0311"],
    idempotencyKey: "archive-material-publication-storage-commit:student_001:fractions_packet",
  };
}

function publicationStorageCommitPolicy() {
  return {
    publicationPersistenceCommandRequired: true,
    publicationCommitPortRequired: true,
    durablePublicationCommitAllowed: true,
    mainDatabaseWriteAllowed: true,
    studentArchiveWriteAllowed: true,
    studentVisiblePublicationAllowed: true,
    preserveApprovalEvidenceRequired: true,
    preserveDeliveryEnvelopeRequired: true,
    idempotentPublicationCommitRequired: true,
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

function publicationCommitPort(calls = [], overrides = {}) {
  return {
    async commitPublication(command) {
      calls.push(command);
      const payload = command.publicationPayload;
      return {
        publicationRecord: {
          publicationId: payload.publicationId,
          publicationState: "COMMITTED_TO_PUBLICATION_STORE",
          visibilityState: payload.visibilityState,
          channel: payload.channel,
          scopeRef: payload.scopeRef,
          approvalRecordId: payload.approvalRecordId,
          approvalId: payload.approvalId,
          publicationCandidateId: payload.publicationCandidateId,
          archiveItemId: payload.archiveItemId,
          studentId: payload.studentId,
          materialType: payload.materialType,
          title: payload.title,
          contentRef: payload.contentRef,
          committedAt: "2026-06-07T10:40:00.000Z",
          ...(overrides.publicationRecord ?? {}),
        },
        persistence: { status: "persisted", commandId: command.commandId, ...(overrides.persistence ?? {}) },
      };
    },
  };
}

function persistenceCommandReport() {
  const command = {
    commandId: "archive_material_publication_persist_cmd_001",
    commandKind: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND",
    persistenceMode: "APPEND_ONLY_PUBLICATION_PERSISTENCE_COMMAND",
    targetPublicationKind: "STUDENT_ARCHIVE_MATERIAL",
    desiredPublicationState: "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
    commandState: "NOT_COMMITTED_TO_PUBLICATION_STORE",
    scopeRef: { scopeType: "STUDENT_OWN_ARCHIVE", studentId: "student_001", archiveItemId: "tarch_archive_material_001" },
    sourceDeliveryRecordId: "teaching_archive_material_publication_delivery_archive-material-publication-delivery-student_001-fractions_packet",
    sourceDeliveryEnvelopeId: "archive_material_delivery_env_001",
    approvalRecordId: "teaching_archive_material_publication_approval_archive-material-publication-approval-student_001-fractions_packet",
    approvalId: "archive_material_publication_approval_001",
    publicationCandidateId: "archive_material_pub_precheck_001",
    archiveItemId: "tarch_archive_material_001",
    studentId: "student_001",
    materialType: "HANDOUT",
    title: "Fractions practice packet",
    contentRef: "precommit://archive-material/student_001/fractions-packet",
    approvalEvidencePreserved: true,
    studentOwnScopeEnforced: true,
  };
  const result = {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-persistence-command-recorded.v1",
    runtimeId: "teaching_archive_material_publication_persistence_command_runtime",
    commandPort: "TeachingArchiveMaterialPublicationPersistenceCommandPort.recordTeachingArchiveMaterialPublicationPersistenceCommand",
    status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
    recordId: "teaching_archive_material_publication_persistence_command_archive-material-publication-persistence-command-student_001-fractions_packet",
    sourcePublicationDeliveryEnvelope: {
      runtimeId: "teaching_archive_material_publication_delivery_runtime",
      recordId: command.sourceDeliveryRecordId,
      deliveryInvocationId: "archive_material_publication_delivery_001",
      envelopeId: command.sourceDeliveryEnvelopeId,
    },
    publicationPersistenceCommand: command,
    boundary: { publicationPersistenceCommandRecorded: true, publicationCommitted: false, mainDatabaseWriteStarted: false, studentArchiveWriteStarted: false },
    evidenceRefs: ["evidence:publication-delivery:0309", "evidence:publication-persistence-command:0310"],
  };
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND",
    runtime: {
      runtimeId: "teaching_archive_material_publication_persistence_command_runtime",
      commandPort: "TeachingArchiveMaterialPublicationPersistenceCommandPort.recordTeachingArchiveMaterialPublicationPersistenceCommand",
      status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
    },
    runtimeSlo: { p99Ms: 6, totalErrors: 0 },
    runtimeProbes: { teachingArchiveMaterialPublicationPersistenceCommand: { result } },
    safetyInvariants: {
      publicationDeliveryEnvelopeRequired: true,
      publicationDeliveryEnvelopeVerified: true,
      appendOnlyCommandLogRequired: true,
      studentOwnScopeRequired: true,
      publicationPersistenceCommandRecorded: true,
      durablePublicationPersistenceStarted: false,
      publicationCommitted: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      futureDurablePublicationCommitReviewRequired: true,
    },
  };
}

function tempCommitLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "teaching-archive-material-publication-storage-commit-")), "commit.jsonl");
}
