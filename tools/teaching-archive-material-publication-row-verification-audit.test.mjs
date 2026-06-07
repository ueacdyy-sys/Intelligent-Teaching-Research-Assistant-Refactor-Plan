import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditTeachingArchiveMaterialPublicationRowVerification,
  formatTeachingArchiveMaterialPublicationRowVerificationAudit,
} from "./teaching-archive-material-publication-row-verification-audit.mjs";

describe("Teaching archive material publication row verification runtime audit", () => {
  it("passes when publication row verification uses the injected row read port", async () => {
    const report = await auditTeachingArchiveMaterialPublicationRowVerification(currentInputs(), {
      generatedAt: "2026-06-07T10:55:00.000Z",
      probeP99Ms: 8,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION");
    assert.equal(report.runtime.runtimeId, "teaching_archive_material_publication_row_verification_runtime");
    assert.equal(report.runtime.commandPort, "TeachingArchiveMaterialPublicationRowVerificationPort.verifyTeachingArchivePublicationPhysicalRow");
    assert.equal(report.runtime.status, "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PHYSICAL_ROW_VERIFIED");
    assert.equal(report.runtimeSlo.p99Ms, 8);
    assert.equal(report.safetyInvariants.publicationPhysicalRowVerified, true);
    assert.equal(report.safetyInvariants.futureStudentAppPublishedMaterialReadRequired, true);
    assert.equal(report.safetyInvariants.directDatabaseAccessAllowed, false);
    assert.equal(report.runtimeProbes.teachingArchiveMaterialPublicationRowVerification.result.teachingArchivePublicationPhysicalRow.publicationRecord.publicationId, "archive_material_publication_commit_001");
    assert.match(formatTeachingArchiveMaterialPublicationRowVerificationAudit(report), /Teaching archive material publication row verification runtime: READY/u);
  });

  it("fails when storage commit evidence is not ready or not committed", async () => {
    const inputs = currentInputs();
    const source = JSON.parse(inputs.storageCommitReport);
    source.runtime.status = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_REJECTED";
    source.safetyInvariants.publicationCommitted = false;
    inputs.storageCommitReport = JSON.stringify(source);

    const report = await auditTeachingArchiveMaterialPublicationRowVerification(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.publication_storage_commit_ready").passed, false);
  });

  it("fails when runtime claims raw DB, HTTP, OCR/RAG, AI grading, model, tools, or Swarm side effects", async () => {
    const inputs = currentInputs();
    inputs.runtime += "\ndirectDatabaseAccessAllowed: true\nexecuteHttpRequestAllowed: true\nfetch(\nmodelInferenceStarted: true\nocrOrRagJobWriteStarted: true\naiGradingWriteStarted: true\nswarmAllowed: true\n";

    const report = await auditTeachingArchiveMaterialPublicationRowVerification(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.verifies_row_without_raw_db_http_model_or_swarm").passed, false);
  });

  it("fails when tests are missing negative publication row paths", async () => {
    const inputs = currentInputs();
    inputs.runtimeTest = inputs.runtimeTest.replace(
      "rejects row mismatches, leaked fields, unsafe text, and unsafe content refs",
      "rejects one mismatch",
    );

    const report = await auditTeachingArchiveMaterialPublicationRowVerification(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_publication_row_verification_negative_paths").passed, false);
  });

  it("fails when package, quality, root coverage, structure, SDD, or board hooks are missing", async () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.qualityGate = "";
    inputs.rootWorkflowCoverage = "";
    inputs.verifyStructure = "";
    inputs.architectureBoard = "";
    inputs.sdd = "";

    const report = await auditTeachingArchiveMaterialPublicationRowVerification(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_PORT",
      "TeachingArchiveMaterialPublicationRowVerificationPort.verifyTeachingArchivePublicationPhysicalRow",
      "verifyTeachingArchiveMaterialPublicationPhysicalRow",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PHYSICAL_ROW_VERIFIED",
      "TeachingArchivePublicationRowReadPort.getPublicationById is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "publicationStorageCommitVerified: true",
      "teachingArchivePublicationRowReadPortInvoked: true",
      "teachingArchivePublicationRepositoryGetByIDUsed: true",
      "committedPublicationRecordMatchedPhysicalRow: true",
      "publicationPhysicalRowVerified: true",
      "mainDatabaseWriteCommitted: true",
      "mainDatabaseReadAllowed: true",
      "studentVisiblePublished: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "modelInferenceStarted: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "requiresFutureStudentAppPublishedMaterialRead: true",
      "rejectLeakedFields",
      "teaching_archive_material_publication_row_verification_runtime",
    ].join("\n"),
    runtimeTest: [
      "verifies a committed material publication through the injected publication row read port",
      "uses idempotency for replay and rejects conflicting publication rows",
      "rejects unsafe storage commit source, unsafe policy, missing port, and missing row",
      "rejects row mismatches, leaked fields, unsafe text, and unsafe content refs",
    ].join("\n"),
    storageCommitReport: JSON.stringify(storageCommitReport()),
    packageJson: JSON.stringify({
      scripts: {
        "audit:teaching-archive-material-publication-row-verification": "node tools/teaching-archive-material-publication-row-verification-audit.mjs --out reports/teaching-archive-material-publication-row-verification.current.json",
      },
    }),
    qualityGate: "Teaching archive material publication row verification runtime audit",
    rootWorkflowCoverage: "teachingArchiveMaterialPublicationRowVerification reports/teaching-archive-material-publication-row-verification.current.json teaching_archive_material_publication_row_verification_runtime",
    verifyStructure: "0312-teaching-archive-material-publication-row-verification.md teaching-archive-material-publication-row-verification-runtime.mjs teaching-archive-material-publication-row-verification-audit.mjs teaching_archive_material_publication_row_verification_runtime",
    architectureBoard: "10.72/10 TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PHYSICAL_ROW_VERIFIED",
    sdd: "0312-teaching-archive-material-publication-row-verification.md",
  };
}

function storageCommitReport() {
  const record = publicationRecord();
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT",
    runtime: {
      runtimeId: "teaching_archive_material_publication_storage_commit_runtime",
      commandPort: "TeachingArchiveMaterialPublicationStorageCommitPort.commitTeachingArchiveMaterialPublication",
      status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMITTED",
    },
    runtimeSlo: { p99Ms: 8, totalErrors: 0 },
    runtimeProbes: {
      teachingArchiveMaterialPublicationStorageCommit: {
        result: {
          schemaVersion: "2026-06-07.teaching.archive-material-publication-storage-committed.v1",
          runtimeId: "teaching_archive_material_publication_storage_commit_runtime",
          commandPort: "TeachingArchiveMaterialPublicationStorageCommitPort.commitTeachingArchiveMaterialPublication",
          status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMITTED",
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
            publicationRecord: record,
            persistence: { status: "persisted", commandId: "archive_material_publication_commit_001" },
          },
          boundary: {
            publicationPersistenceCommandVerified: true,
            publicationCommitPortInjected: true,
            publicationCommitted: true,
            studentVisiblePublished: true,
            mainDatabaseWriteCommitted: true,
            studentArchiveWriteCommitted: true,
            directDatabaseAccessAllowed: false,
            executeHttpRequestAllowed: false,
            ocrOrRagJobWriteStarted: false,
            aiGradingWriteStarted: false,
            modelInferenceStarted: false,
            remoteDeviceControlAllowed: false,
            localToolMutationAllowed: false,
            swarmAllowed: false,
          },
          evidenceRefs: ["evidence:publication-storage-commit:0311"],
          idempotencyKey: "archive-material-publication-storage-commit:student_001:fractions_packet",
          inputHash: "storage-commit-input-hash",
        },
      },
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
