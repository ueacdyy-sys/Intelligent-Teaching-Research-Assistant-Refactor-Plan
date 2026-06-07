import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditTeachingArchiveMaterialPublicationApproval,
  formatTeachingArchiveMaterialPublicationApprovalAudit,
} from "./teaching-archive-material-publication-approval-audit.mjs";

describe("Teaching archive material publication approval runtime audit", () => {
  it("passes when 0307 precheck evidence can enter an approval-only delivery queue", async () => {
    const report = await auditTeachingArchiveMaterialPublicationApproval(currentInputs(), {
      generatedAt: "2026-06-07T09:20:00.000Z",
      probeP99Ms: 7,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL");
    assert.equal(report.runtime.runtimeId, "teaching_archive_material_publication_approval_runtime");
    assert.equal(report.runtime.commandPort, "TeachingArchiveMaterialPublicationApprovalPort.recordTeachingArchiveMaterialPublicationApproval");
    assert.equal(report.runtimeSlo.p99Ms, 7);
    assert.equal(report.safetyInvariants.publicationApproved, true);
    assert.equal(report.safetyInvariants.studentVisiblePublished, false);
    assert.equal(report.runtimeProbes.teachingArchiveMaterialPublicationApproval.result.approvedPublicationCandidate.archiveItemId, "tarch_archive_material_001");
    assert.match(formatTeachingArchiveMaterialPublicationApprovalAudit(report), /publication approval runtime: READY/u);
  });

  it("fails when source publication precheck evidence is not ready", async () => {
    const inputs = currentInputs();
    const source = JSON.parse(inputs.precheckReport);
    source.runtime.status = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_PENDING";
    source.safetyInvariants.publicationApprovalRequired = false;
    inputs.precheckReport = JSON.stringify(source);

    const report = await auditTeachingArchiveMaterialPublicationApproval(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.publication_precheck_ready").passed, false);
  });

  it("fails when runtime claims publishing, DB, HTTP, OCR/RAG, AI grading, model, or Swarm side effects", async () => {
    const inputs = currentInputs();
    inputs.runtime += "\ndirectPublicationAllowed: true\nstudentVisibleDeliveryAllowed: true\nfetch(\npublicationCommitted: true\nstudentVisiblePublished: true\nocrOrRagJobWriteStarted: true\naiGradingWriteStarted: true\nmodelInferenceStarted: true\nswarmAllowed: true\n";

    const report = await auditTeachingArchiveMaterialPublicationApproval(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.identity_and_safety").passed, false);
  });

  it("fails when tests or quality hooks are missing", async () => {
    const inputs = currentInputs();
    inputs.runtimeTest = "records an approval-only publication decision from 0307 precheck evidence";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.qualityGate = "";
    inputs.rootWorkflowCoverage = "";
    inputs.verifyStructure = "";
    inputs.architectureBoard = "";
    inputs.sdd = "";

    const report = await auditTeachingArchiveMaterialPublicationApproval(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_publication_approval_negative_paths").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_PORT",
      "TeachingArchiveMaterialPublicationApprovalPort.recordTeachingArchiveMaterialPublicationApproval",
      "recordTeachingArchiveMaterialPublicationApproval",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVED_NOT_PUBLISHED",
      "APPROVED_FOR_PUBLICATION_DELIVERY",
      "publicationApproved: true",
      "approvedForPublicationDelivery: true",
      "studentVisiblePublished: false",
      "publicationCommitted: false",
      "deliveryEnvelopeCreated: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "modelInferenceStarted: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "teaching_archive_material_publication_approval_runtime",
    ].join("\n"),
    runtimeTest: [
      "records an approval-only publication decision from 0307 precheck evidence",
      "uses idempotency for replay and rejects conflicting publication approvals",
      "rejects forbidden principal, unsafe source precheck, approval mismatch, and missing evidence",
      "rejects unsafe policy, leaked fields, unsafe text, and delivery collapse",
    ].join("\n"),
    precheckReport: JSON.stringify(publicationPrecheckReport()),
    packageJson: JSON.stringify({
      scripts: {
        "audit:teaching-archive-material-publication-approval": "node tools/teaching-archive-material-publication-approval-audit.mjs --out reports/teaching-archive-material-publication-approval.current.json",
      },
    }),
    qualityGate: "Teaching archive material publication approval runtime audit",
    rootWorkflowCoverage: "teachingArchiveMaterialPublicationApproval reports/teaching-archive-material-publication-approval.current.json teaching_archive_material_publication_approval_runtime",
    verifyStructure: "0308-teaching-archive-material-publication-approval.md teaching-archive-material-publication-approval-runtime.mjs teaching-archive-material-publication-approval-audit.mjs teaching_archive_material_publication_approval_runtime",
    architectureBoard: "10.60/10 TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVED_NOT_PUBLISHED",
    sdd: "0308-teaching-archive-material-publication-approval.md",
  };
}

function publicationPrecheckReport() {
  const result = {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-prechecked.v1",
    runtimeId: "teaching_archive_material_publication_precheck_runtime",
    commandPort: "TeachingArchiveMaterialPublicationPrecheckPort.recordTeachingArchiveMaterialPublicationPrecheck",
    status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_READY",
    recordId: "teaching_archive_material_publication_precheck_archive-material-publication-precheck-student_001-fractions_packet",
    precheckDecision: { decision: "READY_FOR_PUBLICATION_APPROVAL" },
    publicationCandidate: {
      publicationCandidateId: "archive_material_pub_precheck_001",
      archiveItemId: "tarch_archive_material_001",
      ownerType: "STUDENT",
      studentId: "student_001",
      materialType: "HANDOUT",
      title: "Fractions practice packet",
      contentRef: "precommit://archive-material/student_001/fractions-packet",
      publicationTarget: "TEACHER_PUBLICATION_APPROVAL_QUEUE",
      intendedAudience: ["TEACHER_REVIEW"],
      studentVisibleRequested: false,
      ocrEnrichmentRequested: false,
      ragEnrichmentRequested: false,
      aiGradingRequested: false,
      releaseChannel: "NONE_PRECHECK_ONLY",
      reviewNotes: "Teacher precheck recorded for later publication approval.",
      riskTags: ["HUMAN_APPROVAL_REQUIRED"],
    },
    boundary: {
      humanPublicationPrecheckRecorded: true,
      publicationApprovalRequired: true,
      publicationCommitted: false,
      studentVisiblePublished: false,
    },
  };
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK",
    runtime: {
      runtimeId: "teaching_archive_material_publication_precheck_runtime",
      status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_READY",
    },
    runtimeSlo: { p99Ms: 6, totalErrors: 0 },
    runtimeProbes: { teachingArchiveMaterialPublicationPrecheck: { result } },
    safetyInvariants: {
      sourceStudentProductReadRequired: true,
      physicalDatabaseRowVerified: true,
      humanPublicationPrecheckRecorded: true,
      publicationApprovalRequired: true,
      publicationCommitted: false,
      studentVisiblePublished: false,
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
