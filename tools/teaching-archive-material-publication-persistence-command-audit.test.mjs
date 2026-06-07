import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditTeachingArchiveMaterialPublicationPersistenceCommand,
  formatTeachingArchiveMaterialPublicationPersistenceCommandAudit,
} from "./teaching-archive-material-publication-persistence-command-audit.mjs";

describe("Teaching archive material publication persistence command runtime audit", () => {
  it("passes when 0309 delivery evidence can create a not-committed persistence command", async () => {
    const report = await auditTeachingArchiveMaterialPublicationPersistenceCommand(currentInputs(), {
      generatedAt: "2026-06-07T10:15:00.000Z",
      probeP99Ms: 7,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND");
    assert.equal(report.runtime.runtimeId, "teaching_archive_material_publication_persistence_command_runtime");
    assert.equal(report.runtime.commandPort, "TeachingArchiveMaterialPublicationPersistenceCommandPort.recordTeachingArchiveMaterialPublicationPersistenceCommand");
    assert.equal(report.runtimeSlo.p99Ms, 7);
    assert.equal(report.safetyInvariants.publicationPersistenceCommandRecorded, true);
    assert.equal(report.safetyInvariants.publicationCommitted, false);
    assert.equal(report.runtimeProbes.teachingArchiveMaterialPublicationPersistenceCommand.result.publicationPersistenceCommand.archiveItemId, "tarch_archive_material_001");
    assert.match(formatTeachingArchiveMaterialPublicationPersistenceCommandAudit(report), /persistence command runtime: READY/u);
  });

  it("fails when source publication delivery evidence is not ready", async () => {
    const inputs = currentInputs();
    const source = JSON.parse(inputs.deliveryReport);
    source.runtime.status = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_PENDING";
    source.safetyInvariants.studentVisibleMaterialDelivered = false;
    inputs.deliveryReport = JSON.stringify(source);

    const report = await auditTeachingArchiveMaterialPublicationPersistenceCommand(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.publication_delivery_ready_not_persisted").passed, false);
  });

  it("fails when runtime claims durable publication, DB, HTTP, OCR/RAG, AI grading, model, or Swarm side effects", async () => {
    const inputs = currentInputs();
    inputs.runtime += "\ndurablePublicationCommitAllowed: true\nmainDatabaseWriteAllowed: true\nfetch(\npublicationCommitted: true\nocrOrRagJobWriteStarted: true\naiGradingWriteStarted: true\nmodelInferenceStarted: true\nswarmAllowed: true\n";

    const report = await auditTeachingArchiveMaterialPublicationPersistenceCommand(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.command_without_commit_or_model").passed, false);
  });

  it("fails when tests or quality hooks are missing", async () => {
    const inputs = currentInputs();
    inputs.runtimeTest = "records an append-only publication persistence command without durable commit";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.qualityGate = "";
    inputs.rootWorkflowCoverage = "";
    inputs.verifyStructure = "";
    inputs.architectureBoard = "";
    inputs.sdd = "";

    const report = await auditTeachingArchiveMaterialPublicationPersistenceCommand(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_publication_persistence_negative_paths").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_PORT",
      "TeachingArchiveMaterialPublicationPersistenceCommandPort.recordTeachingArchiveMaterialPublicationPersistenceCommand",
      "recordTeachingArchiveMaterialPublicationPersistenceCommand",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
      "NOT_COMMITTED_TO_PUBLICATION_STORE",
      "assertPersistencePrincipal",
      "PUBLICATION_PERSISTENCE_COMMAND",
      "STUDENT_ARCHIVE_WRITE_INTENT",
      "publicationDeliveryEnvelopeVerified: true",
      "publicationApprovalPreserved: true",
      "safeMaterialPointerOnly: true",
      "studentOwnScopeEnforced: true",
      "publicationPersistenceCommandRecorded: true",
      "appendOnlyCommandLogRecorded: true",
      "durablePublicationPersistenceStarted: false",
      "publicationCommitted: false",
      "mainDatabaseWriteStarted: false",
      "studentArchiveWriteStarted: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "modelInferenceStarted: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "requiresFutureDurablePublicationCommitReview: true",
      "rejectLeakedFields",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "teaching_archive_material_publication_persistence_command_runtime",
    ].join("\n"),
    runtimeTest: [
      "records an append-only publication persistence command without durable commit",
      "uses idempotency for replay and rejects conflicting persistence commands",
      "rejects unsafe principal, unsafe delivery report, request mismatch, and missing evidence",
      "rejects unsafe policy, leaked fields, unsafe text, and durable publication collapse",
    ].join("\n"),
    deliveryReport: JSON.stringify(publicationDeliveryReport()),
    packageJson: JSON.stringify({
      scripts: {
        "audit:teaching-archive-material-publication-persistence-command": "node tools/teaching-archive-material-publication-persistence-command-audit.mjs --out reports/teaching-archive-material-publication-persistence-command.current.json",
      },
    }),
    qualityGate: "Teaching archive material publication persistence command runtime audit",
    rootWorkflowCoverage: "teachingArchiveMaterialPublicationPersistenceCommand reports/teaching-archive-material-publication-persistence-command.current.json teaching_archive_material_publication_persistence_command_runtime",
    verifyStructure: "0310-teaching-archive-material-publication-persistence-command.md teaching-archive-material-publication-persistence-command-runtime.mjs teaching-archive-material-publication-persistence-command-audit.mjs teaching_archive_material_publication_persistence_command_runtime",
    architectureBoard: "10.66/10 TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
    sdd: "0310-teaching-archive-material-publication-persistence-command.md",
  };
}

function publicationDeliveryReport() {
  const result = {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-delivery-envelope.v1",
    runtimeId: "teaching_archive_material_publication_delivery_runtime",
    commandPort: "TeachingArchiveMaterialPublicationDeliveryPort.recordTeachingArchiveMaterialPublicationDeliveryEnvelope",
    status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_ENVELOPE_READY_NOT_PERSISTED",
    recordId: "teaching_archive_material_publication_delivery_archive-material-publication-delivery-student_001-fractions_packet",
    deliveryInvocationId: "archive_material_publication_delivery_001",
    sourcePublicationApproval: {
      runtimeId: "teaching_archive_material_publication_approval_runtime",
      recordId: "teaching_archive_material_publication_approval_archive-material-publication-approval-student_001-fractions_packet",
      approvalId: "archive_material_publication_approval_001",
      publicationCandidateId: "archive_material_pub_precheck_001",
      archiveItemId: "tarch_archive_material_001",
    },
    studentMaterialDeliveryEnvelope: {
      envelopeId: "archive_material_delivery_env_001",
      deliveryState: "READY_FOR_STUDENT_APP_MATERIAL_RENDER_NOT_ARCHIVED",
      visibilityState: "STUDENT_VISIBLE_ARCHIVE_MATERIAL_DELIVERY_ENVELOPE_NOT_PERSISTED",
      channel: "STUDENT_APP",
      audienceKind: "STUDENT_ARCHIVE_MATERIAL",
      scopeRef: { scopeType: "STUDENT_OWN_ARCHIVE", studentId: "student_001", archiveItemId: "tarch_archive_material_001" },
      approvalRecordId: "teaching_archive_material_publication_approval_archive-material-publication-approval-student_001-fractions_packet",
      approvalId: "archive_material_publication_approval_001",
      publicationCandidateId: "archive_material_pub_precheck_001",
      archiveItemId: "tarch_archive_material_001",
      studentId: "student_001",
      materialType: "HANDOUT",
      title: "Fractions practice packet",
      contentRef: "precommit://archive-material/student_001/fractions-packet",
      durablePublicationPersistenceStarted: false,
      publicationCommitted: false,
      requiresFutureDurablePublicationPersistenceReview: true,
    },
    boundary: { studentVisibleMaterialDeliveryEnvelopeCreated: true, studentVisibleMaterialDelivered: true, durablePublicationPersistenceStarted: false, publicationCommitted: false, mainDatabaseWriteStarted: false, studentArchiveWriteStarted: false },
    evidenceRefs: ["evidence:publication-approval:0308", "evidence:publication-delivery:0309"],
  };
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY",
    runtime: { runtimeId: "teaching_archive_material_publication_delivery_runtime", status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_ENVELOPE_READY_NOT_PERSISTED" },
    runtimeSlo: { p99Ms: 6, totalErrors: 0 },
    runtimeProbes: { teachingArchiveMaterialPublicationDelivery: { result } },
    safetyInvariants: {
      publicationApprovalRequired: true,
      publicationApprovalVerified: true,
      studentDeliveryEnvelopeAllowed: true,
      safeMaterialEnvelopeOnly: true,
      studentOwnScopeEnforced: true,
      studentVisibleMaterialDeliveryEnvelopeCreated: true,
      studentVisibleMaterialDelivered: true,
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
      futureDurablePublicationPersistenceReviewRequired: true,
    },
  };
}
