import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditTeachingArchiveMaterialPublicationPrecheck,
  formatTeachingArchiveMaterialPublicationPrecheckAudit,
} from "./teaching-archive-material-publication-precheck-audit.mjs";

describe("Teaching archive material publication precheck runtime audit", () => {
  it("passes when 0306 evidence can enter a precheck-only publication approval queue", async () => {
    const report = await auditTeachingArchiveMaterialPublicationPrecheck(currentInputs(), {
      generatedAt: "2026-06-07T08:50:00.000Z",
      probeP99Ms: 7,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK");
    assert.equal(report.runtime.runtimeId, "teaching_archive_material_publication_precheck_runtime");
    assert.equal(report.runtime.commandPort, "TeachingArchiveMaterialPublicationPrecheckPort.recordTeachingArchiveMaterialPublicationPrecheck");
    assert.equal(report.runtimeSlo.p99Ms, 7);
    assert.equal(report.safetyInvariants.studentVisiblePublished, false);
    assert.equal(report.runtimeProbes.teachingArchiveMaterialPublicationPrecheck.result.publicationCandidate.archiveItemId, "tarch_archive_material_001");
    assert.match(formatTeachingArchiveMaterialPublicationPrecheckAudit(report), /publication precheck runtime: READY/u);
  });

  it("fails when source student product read evidence is not ready", async () => {
    const inputs = currentInputs();
    const source = JSON.parse(inputs.productReadReport);
    source.runtime.status = "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_PENDING";
    source.safetyInvariants.ownStudentProductReadVerified = false;
    inputs.productReadReport = JSON.stringify(source);

    const report = await auditTeachingArchiveMaterialPublicationPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.student_product_read_ready").passed, false);
  });

  it("fails when runtime claims publishing, DB, HTTP, OCR/RAG, AI grading, model, or Swarm side effects", async () => {
    const inputs = currentInputs();
    inputs.runtime += "\ndirectPublicationAllowed: true\nstudentVisibleDeliveryAllowed: true\nfetch(\nocrOrRagJobWriteStarted: true\naiGradingWriteStarted: true\nmodelInferenceStarted: true\nswarmAllowed: true\n";

    const report = await auditTeachingArchiveMaterialPublicationPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.identity_and_safety").passed, false);
  });

  it("fails when tests or quality hooks are missing", async () => {
    const inputs = currentInputs();
    inputs.runtimeTest = "records a precheck-only publication candidate from 0306 student product read evidence";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.qualityGate = "";
    inputs.rootWorkflowCoverage = "";
    inputs.verifyStructure = "";
    inputs.architectureBoard = "";
    inputs.sdd = "";

    const report = await auditTeachingArchiveMaterialPublicationPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_publication_precheck_negative_paths").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_PORT",
      "TeachingArchiveMaterialPublicationPrecheckPort.recordTeachingArchiveMaterialPublicationPrecheck",
      "recordTeachingArchiveMaterialPublicationPrecheck",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_READY",
      "READY_FOR_PUBLICATION_APPROVAL",
      "studentVisiblePublished: false",
      "publicationCommitted: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "modelInferenceStarted: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "teaching_archive_material_publication_precheck_runtime",
    ].join("\n"),
    runtimeTest: [
      "records a precheck-only publication candidate from 0306 student product read evidence",
      "uses idempotency for replay and rejects conflicting publication prechecks",
      "rejects forbidden principal, unsafe source report, candidate mismatch, and missing evidence",
      "rejects unsafe policy, leaked fields, unsafe text, and future-work collapse",
    ].join("\n"),
    productReadReport: JSON.stringify(productReadReport()),
    packageJson: JSON.stringify({
      scripts: {
        "audit:teaching-archive-material-publication-precheck": "node tools/teaching-archive-material-publication-precheck-audit.mjs --out reports/teaching-archive-material-publication-precheck.current.json",
      },
    }),
    qualityGate: "Teaching archive material publication precheck runtime audit",
    rootWorkflowCoverage: "teachingArchiveMaterialPublicationPrecheck reports/teaching-archive-material-publication-precheck.current.json teaching_archive_material_publication_precheck_runtime",
    verifyStructure: "0307-teaching-archive-material-publication-precheck.md teaching-archive-material-publication-precheck-runtime.mjs teaching-archive-material-publication-precheck-audit.mjs teaching_archive_material_publication_precheck_runtime",
    architectureBoard: "10.57/10 TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_READY",
    sdd: "0307-teaching-archive-material-publication-precheck.md",
  };
}

function productReadReport() {
  const result = {
    schemaVersion: "2026-06-07.teaching.archive-material-draft-student-product-read-verified.v1",
    runtimeId: "teaching_archive_material_draft_student_product_read_runtime",
    commandPort: "TeachingArchiveMaterialDraftStudentProductReadPort.verifyStudentAppArchiveItemsRead",
    status: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_VERIFIED",
    recordId: "teaching_archive_material_draft_student_product_read_archive-material-draft-student-product-read_student_001_fractions_packet",
    studentProductReadSource: { endpoint: "GET /v1/student-app/archive-items" },
    studentProductArchiveItem: {
      id: "tarch_archive_material_001",
      ownerType: "STUDENT",
      studentId: "student_001",
      materialType: "HANDOUT",
      title: "Fractions practice packet",
      contentRef: "precommit://archive-material/student_001/fractions-packet",
    },
    boundary: {
      ownStudentProductReadVerified: true,
      publicationAllowed: false,
      modelInferenceStarted: false,
    },
  };
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ",
    runtime: {
      runtimeId: "teaching_archive_material_draft_student_product_read_runtime",
      status: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_VERIFIED",
    },
    runtimeSlo: { p99Ms: 7, totalErrors: 0 },
    runtimeProbes: { teachingArchiveMaterialDraftStudentProductRead: { result } },
    safetyInvariants: {
      storageRowVerificationRequired: true,
      physicalDatabaseRowVerified: true,
      studentAppArchiveItemsEndpointVerified: true,
      ownStudentProductReadVerified: true,
      productResponseMatchedPhysicalRow: true,
      crossStudentLeakPrevented: true,
      teachingMaterialLeakPrevented: true,
      requiresFuturePublicationOrRagSlice: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      publicationAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
  };
}
