import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditTeachingArchiveMaterialPublicationStorageCommit,
  formatTeachingArchiveMaterialPublicationStorageCommitAudit,
} from "./teaching-archive-material-publication-storage-commit-audit.mjs";

describe("Teaching archive material publication storage commit runtime audit", () => {
  it("passes when 0310 command evidence can commit a publication record", async () => {
    const report = await auditTeachingArchiveMaterialPublicationStorageCommit(currentInputs(), { probeP99Ms: 9 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT");
    assert.equal(report.runtime.runtimeId, "teaching_archive_material_publication_storage_commit_runtime");
    assert.equal(report.runtime.commandPort, "TeachingArchiveMaterialPublicationStorageCommitPort.commitTeachingArchiveMaterialPublication");
    assert.equal(report.runtimeSlo.p99Ms, 9);
    assert.equal(report.safetyInvariants.publicationCommitted, true);
    assert.equal(report.safetyInvariants.directDatabaseAccessAllowed, false);
    assert.equal(report.runtimeProbes.teachingArchiveMaterialPublicationStorageCommit.result.publicationCommit.publicationRecord.archiveItemId, "tarch_archive_material_001");
    assert.match(formatTeachingArchiveMaterialPublicationStorageCommitAudit(report), /storage commit runtime: READY/u);
  });

  it("fails when source publication persistence command evidence is not ready", async () => {
    const inputs = currentInputs();
    const source = JSON.parse(inputs.persistenceCommandReport);
    source.runtime.status = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_PENDING";
    source.safetyInvariants.publicationPersistenceCommandRecorded = false;
    inputs.persistenceCommandReport = JSON.stringify(source);

    const report = await auditTeachingArchiveMaterialPublicationStorageCommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.publication_persistence_command_ready").passed, false);
  });

  it("fails when runtime claims raw DB, HTTP, OCR/RAG, AI grading, model, or Swarm side effects", async () => {
    const inputs = currentInputs();
    inputs.runtime += "\ndirectDatabaseAccessAllowed: true\nfetch(\nocrOrRagJobWriteStarted: true\naiGradingWriteStarted: true\nmodelInferenceStarted: true\nswarmAllowed: true\n";

    const report = await auditTeachingArchiveMaterialPublicationStorageCommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.commit_without_raw_db_http_model_or_swarm").passed, false);
  });

  it("fails when tests or quality hooks are missing", async () => {
    const inputs = currentInputs();
    inputs.runtimeTest = "commits a reviewed publication persistence command through the injected publication commit port";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.qualityGate = "";
    inputs.rootWorkflowCoverage = "";
    inputs.verifyStructure = "";
    inputs.architectureBoard = "";
    inputs.sdd = "";

    const report = await auditTeachingArchiveMaterialPublicationStorageCommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_publication_commit_negative_paths").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_PORT",
      "TeachingArchiveMaterialPublicationStorageCommitPort.commitTeachingArchiveMaterialPublication",
      "commitTeachingArchiveMaterialPublicationStorage",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMITTED",
      "TeachingArchivePublicationCommitPort.commitPublication is required",
      "publicationPersistenceCommandVerified: true",
      "publicationCommitPortInjected: true",
      "publicationApprovalPreserved: true",
      "publicationDeliveryEnvelopePreserved: true",
      "studentOwnScopeEnforced: true",
      "safeMaterialPointerOnly: true",
      "durablePublicationPersistenceStarted: true",
      "publicationCommitted: true",
      "studentVisiblePublished: true",
      "mainDatabaseWriteCommitted: true",
      "studentArchiveWriteCommitted: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "modelInferenceStarted: false",
      "swarmAllowed: false",
      "requiresFuturePublicationRowVerification: true",
      "rejectLeakedFields",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "teaching_archive_material_publication_storage_commit_runtime",
    ].join("\n"),
    runtimeTest: [
      "commits a reviewed publication persistence command through the injected publication commit port",
      "uses idempotency for replay and rejects conflicting publication commits",
      "rejects unsafe source, request mismatch, missing evidence, and missing port",
      "rejects unsafe policy, leaked fields, unsafe text, and unsafe port results",
    ].join("\n"),
    persistenceCommandReport: JSON.stringify(persistenceCommandReport()),
    packageJson: JSON.stringify({
      scripts: {
        "audit:teaching-archive-material-publication-storage-commit": "node tools/teaching-archive-material-publication-storage-commit-audit.mjs --out reports/teaching-archive-material-publication-storage-commit.current.json",
      },
    }),
    qualityGate: "Teaching archive material publication storage commit runtime audit",
    rootWorkflowCoverage: "teachingArchiveMaterialPublicationStorageCommit reports/teaching-archive-material-publication-storage-commit.current.json teaching_archive_material_publication_storage_commit_runtime",
    verifyStructure: "0311-teaching-archive-material-publication-storage-commit.md teaching-archive-material-publication-storage-commit-runtime.mjs teaching-archive-material-publication-storage-commit-audit.mjs teaching_archive_material_publication_storage_commit_runtime",
    architectureBoard: "10.69/10 TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMITTED",
    sdd: "0311-teaching-archive-material-publication-storage-commit.md",
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
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND",
    runtime: {
      runtimeId: "teaching_archive_material_publication_persistence_command_runtime",
      commandPort: "TeachingArchiveMaterialPublicationPersistenceCommandPort.recordTeachingArchiveMaterialPublicationPersistenceCommand",
      status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
    },
    runtimeSlo: { p99Ms: 6, totalErrors: 0 },
    runtimeProbes: {
      teachingArchiveMaterialPublicationPersistenceCommand: {
        result: {
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
        },
      },
    },
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
