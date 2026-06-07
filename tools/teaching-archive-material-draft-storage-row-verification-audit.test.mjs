import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditTeachingArchiveMaterialDraftStorageRowVerification,
  formatTeachingArchiveMaterialDraftStorageRowVerificationAudit,
} from "./teaching-archive-material-draft-storage-row-verification-audit.mjs";

describe("Teaching archive material draft storage row verification runtime audit", () => {
  it("passes when row verification uses the injected Teaching Archive row read port", async () => {
    const report = await auditTeachingArchiveMaterialDraftStorageRowVerification(currentInputs(), {
      generatedAt: "2026-06-07T08:15:00.000Z",
      probeP99Ms: 7,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION");
    assert.equal(report.runtime.runtimeId, "teaching_archive_material_draft_storage_row_verification_runtime");
    assert.equal(report.runtime.commandPort, "TeachingArchiveMaterialDraftStorageRowVerificationPort.verifyTeachingArchivePhysicalRow");
    assert.equal(report.runtimeSlo.p99Ms, 7);
    assert.equal(report.safetyInvariants.physicalDatabaseRowVerified, true);
    assert.equal(report.safetyInvariants.directDatabaseAccessAllowed, false);
    assert.equal(report.runtimeProbes.teachingArchiveMaterialDraftStorageRowVerification.result.teachingArchivePhysicalRow.archiveItem.id, "tarch_archive_material_001");
    assert.match(formatTeachingArchiveMaterialDraftStorageRowVerificationAudit(report), /Teaching archive material draft storage row verification runtime: READY/u);
  });

  it("fails when storage commit evidence is not ready or not committed", async () => {
    const inputs = currentInputs();
    const source = JSON.parse(inputs.commitReport);
    source.runtime.status = "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_REJECTED";
    source.runtimeProbes.teachingArchiveMaterialDraftStorageCommit.result.boundary.mainDatabaseWriteCommitted = false;
    inputs.commitReport = JSON.stringify(source);

    const report = await auditTeachingArchiveMaterialDraftStorageRowVerification(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source_commit.ready_committed").passed, false);
  });

  it("fails when runtime claims raw DB, HTTP, OCR/RAG, AI grading, tools, or Swarm side effects", async () => {
    const inputs = currentInputs();
    inputs.runtime += "\ndirectDatabaseAccessAllowed: true\nexecuteHttpRequestAllowed: true\nfetch(\nocrOrRagJobWriteStarted: true\naiGradingWriteStarted: true\nswarmAllowed: true\n";

    const report = await auditTeachingArchiveMaterialDraftStorageRowVerification(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("fails when tests or Go repository row-read evidence are missing", async () => {
    const inputs = currentInputs();
    inputs.runtimeTest = inputs.runtimeTest.replace(
      "rejects row mismatches, leaked fields, forbidden analysis intents, and unsafe refs",
      "rejects one mismatch",
    );
    inputs.teachingArchiveRepositoryTest = "package postgres_test";

    const report = await auditTeachingArchiveMaterialDraftStorageRowVerification(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_row_verification_negative_paths").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "teaching_archive.repository_get_by_id_evidence_exists").passed, false);
  });

  it("fails when quality, root coverage, structure, SDD, or board hooks are missing", async () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.qualityGate = "";
    inputs.rootWorkflowCoverage = "";
    inputs.verifyStructure = "";
    inputs.architectureBoard = "";
    inputs.sdd = "";

    const report = await auditTeachingArchiveMaterialDraftStorageRowVerification(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION_PORT",
      "TeachingArchiveMaterialDraftStorageRowVerificationPort.verifyTeachingArchivePhysicalRow",
      "verifyTeachingArchiveMaterialDraftStoragePhysicalRow",
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PHYSICAL_ROW_VERIFIED",
      "TeachingArchiveRowReadPort.getArchiveItemById is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "storageCommitVerified: true",
      "teachingArchiveRowReadPortInvoked: true",
      "teachingArchiveRepositoryGetByIDUsed: true",
      "committedArchiveItemMatchedPhysicalRow: true",
      "mainDatabaseWriteCommitted: true",
      "mainDatabaseReadAllowed: true",
      "physicalDatabaseRowVerified: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "externalModelCallStarted: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "rejectLeakedFields",
      "teaching_archive_material_draft_storage_row_verification_runtime",
    ].join("\n"),
    runtimeTest: [
      "verifies a committed archive material draft through the injected row read port",
      "uses idempotency for replay and rejects conflicting committed rows",
      "rejects unsafe storage commit source, policy, missing port, and missing row",
      "rejects row mismatches, leaked fields, forbidden analysis intents, and unsafe refs",
    ].join("\n"),
    commitReport: JSON.stringify(storageCommitReport()),
    teachingArchiveRepository: "func (r *ArchiveRepository) GetByID FROM teaching_archive_items WHERE id = $1 scanArchiveItem",
    teachingArchiveRepositoryTest: "TestGetByIDReturnsTeachingArchiveMaterialDraftStorageCommitPhysicalRow singleTeachingArchiveMaterialDraftItemRow tarch_archive_material_001",
    teachingArchiveScanner: "scanArchiveItem",
    packageJson: JSON.stringify({
      scripts: {
        "audit:teaching-archive-material-draft-storage-row-verification": "node tools/teaching-archive-material-draft-storage-row-verification-audit.mjs --out reports/teaching-archive-material-draft-storage-row-verification.current.json",
      },
    }),
    qualityGate: "Teaching archive material draft storage row verification runtime audit",
    rootWorkflowCoverage: "teachingArchiveMaterialDraftStorageRowVerification reports/teaching-archive-material-draft-storage-row-verification.current.json teaching_archive_material_draft_storage_row_verification_runtime",
    verifyStructure: "0305-teaching-archive-material-draft-storage-row-verification.md teaching-archive-material-draft-storage-row-verification-runtime.mjs teaching-archive-material-draft-storage-row-verification-audit.mjs teaching_archive_material_draft_storage_row_verification_runtime",
    architectureBoard: "10.51/10 TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PHYSICAL_ROW_VERIFIED",
    sdd: "0305-teaching-archive-material-draft-storage-row-verification.md",
  };
}

function storageCommitReport() {
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT",
    runtime: {
      runtimeId: "teaching_archive_material_draft_storage_commit_runtime",
      commandPort: "TeachingArchiveMaterialDraftStorageCommitPort.commitArchiveMaterialDraftStorageCommand",
      status: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMITTED",
    },
    runtimeSlo: { p99Ms: 6, totalErrors: 0 },
    runtimeProbes: {
      teachingArchiveMaterialDraftStorageCommit: {
        result: {
          schemaVersion: "2026-06-07.teaching.archive-material-draft-storage-commit-committed.v1",
          runtimeId: "teaching_archive_material_draft_storage_commit_runtime",
          commandPort: "TeachingArchiveMaterialDraftStorageCommitPort.commitArchiveMaterialDraftStorageCommand",
          status: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMITTED",
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
            archiveItem: archiveItem(),
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
        },
      },
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
