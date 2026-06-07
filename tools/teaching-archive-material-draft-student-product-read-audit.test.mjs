import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditTeachingArchiveMaterialDraftStudentProductRead,
  formatTeachingArchiveMaterialDraftStudentProductReadAudit,
} from "./teaching-archive-material-draft-student-product-read-audit.mjs";

describe("Teaching archive material draft student product read runtime audit", () => {
  it("passes when the verified row is visible through the student app product entry", async () => {
    const report = await auditTeachingArchiveMaterialDraftStudentProductRead(currentInputs(), {
      generatedAt: "2026-06-07T08:25:00.000Z",
      probeP99Ms: 8,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ");
    assert.equal(report.runtime.runtimeId, "teaching_archive_material_draft_student_product_read_runtime");
    assert.equal(report.runtime.commandPort, "TeachingArchiveMaterialDraftStudentProductReadPort.verifyStudentAppArchiveItemsRead");
    assert.equal(report.runtimeSlo.p99Ms, 8);
    assert.equal(report.safetyInvariants.ownStudentProductReadVerified, true);
    assert.equal(report.safetyInvariants.directDatabaseAccessAllowed, false);
    assert.equal(report.runtimeProbes.teachingArchiveMaterialDraftStudentProductRead.result.studentProductArchiveItem.id, "tarch_archive_material_001");
    assert.match(formatTeachingArchiveMaterialDraftStudentProductReadAudit(report), /student product read runtime: READY/u);
  });

  it("fails when storage row verification evidence is not ready", async () => {
    const inputs = currentInputs();
    const source = JSON.parse(inputs.rowVerificationReport);
    source.runtime.status = "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_PENDING";
    source.safetyInvariants.physicalDatabaseRowVerified = false;
    inputs.rowVerificationReport = JSON.stringify(source);

    const report = await auditTeachingArchiveMaterialDraftStudentProductRead(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.storage_row_verification_ready").passed, false);
  });

  it("fails when runtime claims raw DB, HTTP, OCR/RAG, AI grading, model, publication, or Swarm side effects", async () => {
    const inputs = currentInputs();
    inputs.runtime += "\ndirectDatabaseAccessAllowed: true\nexecuteHttpRequestAllowed: true\nfetch(\nocrOrRagJobWriteStarted: true\naiGradingWriteStarted: true\nmodelInferenceStarted: true\npublicationAllowed: true\nswarmAllowed: true\n";

    const report = await auditTeachingArchiveMaterialDraftStudentProductRead(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("fails when tests or Go product entry evidence are missing", async () => {
    const inputs = currentInputs();
    inputs.runtimeTest = inputs.runtimeTest.replace(
      "rejects missing port, cross-student principal, missing product row, and mismatched product response",
      "rejects missing port",
    );
    inputs.httpTest = "package httpapi_test";

    const report = await auditTeachingArchiveMaterialDraftStudentProductRead(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_product_read_negative_paths").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "go_student_app_product_entry_evidence_exists").passed, false);
  });

  it("fails when quality, root coverage, structure, SDD, or board hooks are missing", async () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.qualityGate = "";
    inputs.rootWorkflowCoverage = "";
    inputs.verifyStructure = "";
    inputs.architectureBoard = "";
    inputs.sdd = "";

    const report = await auditTeachingArchiveMaterialDraftStudentProductRead(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_PORT",
      "TeachingArchiveMaterialDraftStudentProductReadPort.verifyStudentAppArchiveItemsRead",
      "verifyTeachingArchiveMaterialDraftStudentProductRead",
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_VERIFIED",
      "StudentAppArchiveItemsProductReadPort.listStudentAppArchiveItems is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "studentAppArchiveItemsEndpointVerified: true",
      "injectedProductReadPortInvoked: true",
      "ownStudentProductReadVerified: true",
      "productResponseMatchedPhysicalRow: true",
      "crossStudentLeakPrevented: true",
      "teachingMaterialLeakPrevented: true",
      "goUseCaseReadAllowed: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "modelInferenceStarted: false",
      "publicationAllowed: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "requiresFuturePublicationOrRagSlice: true",
      "teaching_archive_material_draft_student_product_read_runtime",
    ].join("\n"),
    runtimeTest: [
      "verifies a student product read through the injected product read port",
      "uses idempotency for replay and rejects conflicting product read verification",
      "rejects missing port, cross-student principal, missing product row, and mismatched product response",
      "rejects unsafe policy, leaked fields, unsafe text, product HTTP or raw DB claims, and future work collapse",
      "requires row verification and student app product entry evidence",
    ].join("\n"),
    rowVerificationReport: JSON.stringify(rowVerificationReport()),
    domain: "NormalizeListStudentAppArchiveItemsInput AuthorizeListStudentAppArchiveItems",
    usecase: "func (uc *ListStudentAppArchiveItems) Execute",
    usecaseTest: "TestListStudentAppArchiveItemsScopesOwnStudentBeforeRepository",
    http: "func (s *Server) studentAppArchiveItems /v1/student-app/archive-items",
    httpTest: "TestListStudentAppArchiveItemsReturns0305CommittedMaterialDraftRow tarch_archive_material_001",
    presenter: "toListResponse",
    responses: "archiveItemListResponse",
    repository: "func (r *ArchiveRepository) List ORDER BY created_at DESC, id DESC ArchiveRepository.List",
    openApiPath: "operationId: listStudentAppArchiveItems",
    packageJson: JSON.stringify({
      scripts: {
        "audit:teaching-archive-material-draft-student-product-read": "node tools/teaching-archive-material-draft-student-product-read-audit.mjs --out reports/teaching-archive-material-draft-student-product-read.current.json",
      },
    }),
    qualityGate: "Teaching archive material draft student product read runtime audit",
    rootWorkflowCoverage: "teachingArchiveMaterialDraftStudentProductRead reports/teaching-archive-material-draft-student-product-read.current.json teaching_archive_material_draft_student_product_read_runtime",
    verifyStructure: "0306-teaching-archive-material-draft-student-product-read.md teaching-archive-material-draft-student-product-read-runtime.mjs teaching-archive-material-draft-student-product-read-audit.mjs teaching_archive_material_draft_student_product_read_runtime",
    architectureBoard: "10.54/10 TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_VERIFIED",
    sdd: "0306-teaching-archive-material-draft-student-product-read.md",
  };
}

function rowVerificationReport() {
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION",
    runtime: {
      runtimeId: "teaching_archive_material_draft_storage_row_verification_runtime",
      status: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PHYSICAL_ROW_VERIFIED",
    },
    runtimeSlo: { p99Ms: 7, totalErrors: 0 },
    runtimeProbes: {
      teachingArchiveMaterialDraftStorageRowVerification: {
        result: {
          schemaVersion: "2026-06-07.teaching.archive-material-draft-storage-row-verified.v1",
          runtimeId: "teaching_archive_material_draft_storage_row_verification_runtime",
          status: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PHYSICAL_ROW_VERIFIED",
          recordId: "teaching_archive_material_draft_storage_row_verification_archive-material-draft-storage-row-verification_student_001_fractions_packet",
          teachingArchivePhysicalRow: {
            operationId: "getTeachingArchiveItemById",
            targetRepository: "ArchiveRepository.GetByID",
            targetTable: "teaching_archive_items",
            archiveItem: archiveItem(),
          },
          boundary: {
            physicalDatabaseRowVerified: true,
            directDatabaseAccessAllowed: false,
          },
          evidenceRefs: ["evidence:teaching-archive-physical-row:tarch_archive_material_001"],
        },
      },
    },
    safetyInvariants: {
      storageCommitVerified: true,
      teachingArchiveRowReadPortInvoked: true,
      teachingArchiveRepositoryGetByIDUsed: true,
      committedArchiveItemMatchedPhysicalRow: true,
      physicalDatabaseRowVerified: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      swarmAllowed: false,
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
