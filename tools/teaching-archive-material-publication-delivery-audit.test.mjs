import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditTeachingArchiveMaterialPublicationDelivery,
  formatTeachingArchiveMaterialPublicationDeliveryAudit,
} from "./teaching-archive-material-publication-delivery-audit.mjs";

describe("Teaching archive material publication delivery runtime audit", () => {
  it("passes when 0308 approval evidence can create a not-persisted delivery envelope", async () => {
    const report = await auditTeachingArchiveMaterialPublicationDelivery(currentInputs(), {
      generatedAt: "2026-06-07T09:50:00.000Z",
      probeP99Ms: 7,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY");
    assert.equal(report.runtime.runtimeId, "teaching_archive_material_publication_delivery_runtime");
    assert.equal(report.runtime.commandPort, "TeachingArchiveMaterialPublicationDeliveryPort.recordTeachingArchiveMaterialPublicationDeliveryEnvelope");
    assert.equal(report.runtimeSlo.p99Ms, 7);
    assert.equal(report.safetyInvariants.studentVisibleMaterialDeliveryEnvelopeCreated, true);
    assert.equal(report.safetyInvariants.durablePublicationPersistenceStarted, false);
    assert.equal(report.runtimeProbes.teachingArchiveMaterialPublicationDelivery.result.studentMaterialDeliveryEnvelope.archiveItemId, "tarch_archive_material_001");
    assert.match(formatTeachingArchiveMaterialPublicationDeliveryAudit(report), /publication delivery runtime: READY/u);
  });

  it("fails when source publication approval evidence is not ready", async () => {
    const inputs = currentInputs();
    const source = JSON.parse(inputs.approvalReport);
    source.runtime.status = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_PENDING";
    source.safetyInvariants.approvedForPublicationDelivery = false;
    inputs.approvalReport = JSON.stringify(source);

    const report = await auditTeachingArchiveMaterialPublicationDelivery(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.publication_approval_ready").passed, false);
  });

  it("fails when runtime claims durable publication, DB, HTTP, OCR/RAG, AI grading, model, or Swarm side effects", async () => {
    const inputs = currentInputs();
    inputs.runtime += "\ndurablePublicationCommitAllowed: true\nmainDatabaseWriteAllowed: true\nfetch(\npublicationCommitted: true\nocrOrRagJobWriteStarted: true\naiGradingWriteStarted: true\nmodelInferenceStarted: true\nswarmAllowed: true\n";

    const report = await auditTeachingArchiveMaterialPublicationDelivery(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.identity_and_safety").passed, false);
  });

  it("fails when tests or quality hooks are missing", async () => {
    const inputs = currentInputs();
    inputs.runtimeTest = "records a student-visible material delivery envelope while keeping durable publication blocked";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.qualityGate = "";
    inputs.rootWorkflowCoverage = "";
    inputs.verifyStructure = "";
    inputs.architectureBoard = "";
    inputs.sdd = "";

    const report = await auditTeachingArchiveMaterialPublicationDelivery(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_publication_delivery_negative_paths").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_PORT",
      "TeachingArchiveMaterialPublicationDeliveryPort.recordTeachingArchiveMaterialPublicationDeliveryEnvelope",
      "recordTeachingArchiveMaterialPublicationDeliveryEnvelope",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_ENVELOPE_READY_NOT_PERSISTED",
      "READY_FOR_STUDENT_APP_MATERIAL_RENDER_NOT_ARCHIVED",
      "assertDeliveryPrincipal",
      "STUDENT_DELIVERY_ENVELOPE",
      "STUDENT_APP_DELIVERY",
      "studentVisibleMaterialDeliveryEnvelopeCreated: true",
      "studentVisibleMaterialDelivered: true",
      "durablePublicationPersistenceStarted: false",
      "publicationCommitted: false",
      "mainDatabaseWriteStarted: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "modelInferenceStarted: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "teaching_archive_material_publication_delivery_runtime",
    ].join("\n"),
    runtimeTest: [
      "records a student-visible material delivery envelope while keeping durable publication blocked",
      "uses idempotency for replay and rejects conflicting delivery envelopes",
      "rejects unsafe principal, unapproved source, delivery mismatch, and missing evidence",
      "rejects unsafe policy, leaked fields, unsafe text, and durable publication collapse",
    ].join("\n"),
    approvalReport: JSON.stringify(publicationApprovalReport()),
    packageJson: JSON.stringify({
      scripts: {
        "audit:teaching-archive-material-publication-delivery": "node tools/teaching-archive-material-publication-delivery-audit.mjs --out reports/teaching-archive-material-publication-delivery.current.json",
      },
    }),
    qualityGate: "Teaching archive material publication delivery runtime audit",
    rootWorkflowCoverage: "teachingArchiveMaterialPublicationDelivery reports/teaching-archive-material-publication-delivery.current.json teaching_archive_material_publication_delivery_runtime",
    verifyStructure: "0309-teaching-archive-material-publication-delivery-envelope.md teaching-archive-material-publication-delivery-runtime.mjs teaching-archive-material-publication-delivery-audit.mjs teaching_archive_material_publication_delivery_runtime",
    architectureBoard: "10.63/10 TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_ENVELOPE_READY_NOT_PERSISTED",
    sdd: "0309-teaching-archive-material-publication-delivery-envelope.md",
  };
}

function publicationApprovalReport() {
  const result = {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-approved.v1",
    runtimeId: "teaching_archive_material_publication_approval_runtime",
    commandPort: "TeachingArchiveMaterialPublicationApprovalPort.recordTeachingArchiveMaterialPublicationApproval",
    status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVED_NOT_PUBLISHED",
    recordId: "teaching_archive_material_publication_approval_archive-material-publication-approval-student_001-fractions_packet",
    approvalDecision: { decision: "APPROVED_FOR_PUBLICATION_DELIVERY" },
    approvedPublicationCandidate: {
      publicationCandidateId: "archive_material_pub_precheck_001",
      archiveItemId: "tarch_archive_material_001",
      ownerType: "STUDENT",
      studentId: "student_001",
      materialType: "HANDOUT",
      title: "Fractions practice packet",
      contentRef: "precommit://archive-material/student_001/fractions-packet",
    },
    publicationApproval: {
      approvalId: "archive_material_publication_approval_001",
      reviewerPrincipalId: "teacher_001",
      decision: "APPROVED_FOR_PUBLICATION_DELIVERY",
      publicationCandidateId: "archive_material_pub_precheck_001",
      archiveItemId: "tarch_archive_material_001",
      studentId: "student_001",
      materialType: "HANDOUT",
      title: "Fractions practice packet",
      contentRef: "precommit://archive-material/student_001/fractions-packet",
      sourcePublicationPrecheckVerified: true,
      publicationCandidateVerified: true,
      studentOwnScopeReviewed: true,
      sensitiveLeakageReviewed: true,
      futurePublicationDeliveryRuntimeRequired: true,
    },
    boundary: {
      publicationApproved: true,
      approvedForPublicationDelivery: true,
      publicationCommitted: false,
      studentVisiblePublished: false,
      deliveryEnvelopeCreated: false,
    },
  };
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL",
    runtime: {
      runtimeId: "teaching_archive_material_publication_approval_runtime",
      status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVED_NOT_PUBLISHED",
    },
    runtimeSlo: { p99Ms: 6, totalErrors: 0 },
    runtimeProbes: { teachingArchiveMaterialPublicationApproval: { result } },
    safetyInvariants: {
      sourcePublicationPrecheckRequired: true,
      physicalDatabaseRowVerified: true,
      humanPublicationPrecheckRecorded: true,
      publicationApproved: true,
      approvedForPublicationDelivery: true,
      publicationCommitted: false,
      studentVisiblePublished: false,
      deliveryEnvelopeCreated: false,
      mainDatabaseWriteStarted: false,
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
