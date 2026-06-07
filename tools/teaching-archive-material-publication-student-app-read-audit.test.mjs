import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditTeachingArchiveMaterialPublicationStudentAppRead,
  formatTeachingArchiveMaterialPublicationStudentAppReadAudit,
} from "./teaching-archive-material-publication-student-app-read-audit.mjs";

describe("Teaching archive material publication student app read runtime audit", () => {
  it("passes when published material read uses the injected student app product port", async () => {
    const report = await auditTeachingArchiveMaterialPublicationStudentAppRead(currentInputs(), {
      generatedAt: "2026-06-07T11:25:00.000Z",
      probeP99Ms: 8,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ");
    assert.equal(report.runtime.runtimeId, "teaching_archive_material_publication_student_app_read_runtime");
    assert.equal(report.runtime.commandPort, "TeachingArchiveMaterialPublicationStudentAppReadPort.verifyStudentAppPublishedMaterialRead");
    assert.equal(report.runtime.status, "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_VERIFIED");
    assert.equal(report.runtimeSlo.p99Ms, 8);
    assert.equal(report.safetyInvariants.studentAppPublishedMaterialReadVerified, true);
    assert.equal(report.safetyInvariants.futurePublicationProjectionOrRagRequired, true);
    assert.equal(report.safetyInvariants.directDatabaseAccessAllowed, false);
    assert.equal(report.runtimeProbes.teachingArchiveMaterialPublicationStudentAppRead.result.publishedArchiveMaterial.archiveItem.id, "tarch_archive_material_001");
    assert.match(formatTeachingArchiveMaterialPublicationStudentAppReadAudit(report), /Teaching archive material publication student app read runtime: READY/u);
  });

  it("fails when publication row verification evidence is not ready or not student-visible", async () => {
    const inputs = currentInputs();
    const source = JSON.parse(inputs.publicationRowVerificationReport);
    source.runtime.status = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_REJECTED";
    source.safetyInvariants.studentVisiblePublished = false;
    inputs.publicationRowVerificationReport = JSON.stringify(source);

    const report = await auditTeachingArchiveMaterialPublicationStudentAppRead(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.publication_row_verification_ready").passed, false);
  });

  it("fails when runtime claims raw DB, HTTP, OCR/RAG, AI grading, model, publication write, tools, or Swarm side effects", async () => {
    const inputs = currentInputs();
    inputs.runtime += "\ndirectDatabaseAccessAllowed: true\nexecuteHttpRequestAllowed: true\nfetch(\nmodelInferenceStarted: true\npublicationWriteStarted: true\nocrOrRagJobWriteStarted: true\naiGradingWriteStarted: true\nswarmAllowed: true\n";

    const report = await auditTeachingArchiveMaterialPublicationStudentAppRead(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("fails when tests are missing negative published-material read paths", async () => {
    const inputs = currentInputs();
    inputs.runtimeTest = inputs.runtimeTest.replace(
      "rejects cross-student principals, mismatched responses, leaked fields, unsafe text, and publication metadata leaks",
      "rejects one mismatch",
    );

    const report = await auditTeachingArchiveMaterialPublicationStudentAppRead(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_published_material_read_negative_paths").passed, false);
  });

  it("fails when Go product entry evidence is missing", async () => {
    const inputs = currentInputs();
    inputs.domain = "";
    inputs.usecase = "";
    inputs.http = "";
    inputs.repository = "";
    inputs.openApiPath = "";

    const report = await auditTeachingArchiveMaterialPublicationStudentAppRead(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "go_student_app_archive_items_product_entry_evidence_exists").passed, false);
  });

  it("fails when package, quality, root coverage, structure, SDD, or board hooks are missing", async () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.qualityGate = "";
    inputs.rootWorkflowCoverage = "";
    inputs.verifyStructure = "";
    inputs.architectureBoard = "";
    inputs.sdd = "";

    const report = await auditTeachingArchiveMaterialPublicationStudentAppRead(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_PORT",
      "TeachingArchiveMaterialPublicationStudentAppReadPort.verifyStudentAppPublishedMaterialRead",
      "verifyTeachingArchiveMaterialPublicationStudentAppRead",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_VERIFIED",
      "StudentAppPublishedArchiveMaterialsReadPort.listStudentAppPublishedArchiveMaterials is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "publicationRowVerificationRequired: true",
      "publicationPhysicalRowVerified: true",
      "studentVisiblePublished: true",
      "studentAppArchiveItemsEndpointVerified: true",
      "injectedPublishedArchiveMaterialReadPortInvoked: true",
      "studentAppPublishedMaterialReadVerified: true",
      "productResponseMatchedPublicationRow: true",
      "crossStudentLeakPrevented: true",
      "teachingMaterialLeakPrevented: true",
      "publicationMetadataLeakPrevented: true",
      "goUseCaseReadAllowed: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "modelInferenceStarted: false",
      "publicationWriteStarted: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "requiresFuturePublicationProjectionOrRagSlice: true",
      "rejectProductOnlyLeakedFields",
      "teaching_archive_material_publication_student_app_read_runtime",
    ].join("\n"),
    runtimeTest: [
      "verifies a published archive material through the injected student app product read port",
      "uses idempotency for replay and rejects conflicting published material reads",
      "rejects unsafe publication row source, unsafe policy, missing port, and missing published material",
      "rejects cross-student principals, mismatched responses, leaked fields, unsafe text, and publication metadata leaks",
      "requires publication row verification and student app product entry evidence while keeping future work separate",
    ].join("\n"),
    publicationRowVerificationReport: JSON.stringify(publicationRowVerificationReport()),
    domain: [
      "NormalizeListStudentAppArchiveItemsInput",
      "AuthorizeListStudentAppArchiveItems",
      "MaterialTypeTeachingMaterial",
    ].join("\n"),
    domainTest: "TestNormalizeListStudentAppArchiveItemsScopesOwnStudentArchive",
    usecase: "func (uc *ListStudentAppArchiveItems) Execute",
    usecaseTest: "TestListStudentAppArchiveItemsScopesOwnStudentBeforeRepository",
    http: [
      "func (s *Server) studentAppArchiveItems",
      "/v1/student-app/archive-items",
    ].join("\n"),
    httpTest: [
      "TestListStudentAppArchiveItemsReturns0305CommittedMaterialDraftRow",
      "tarch_archive_material_001",
    ].join("\n"),
    presenter: "toListResponse",
    responses: "ArchiveItemListResponse",
    repository: [
      "func (r *ArchiveRepository) List",
      "ORDER BY created_at DESC, id DESC",
    ].join("\n"),
    openApiPath: "operationId: listStudentAppArchiveItems",
    packageJson: JSON.stringify({
      scripts: {
        "audit:teaching-archive-material-publication-student-app-read": "node tools/teaching-archive-material-publication-student-app-read-audit.mjs --out reports/teaching-archive-material-publication-student-app-read.current.json",
      },
    }),
    qualityGate: "Teaching archive material publication student app read runtime audit",
    rootWorkflowCoverage: "teachingArchiveMaterialPublicationStudentAppRead reports/teaching-archive-material-publication-student-app-read.current.json teaching_archive_material_publication_student_app_read_runtime",
    verifyStructure: "0313-teaching-archive-material-publication-student-app-read.md teaching-archive-material-publication-student-app-read-runtime.mjs teaching-archive-material-publication-student-app-read-audit.mjs teaching_archive_material_publication_student_app_read_runtime",
    architectureBoard: "10.75/10 TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_VERIFIED",
    sdd: "0313-teaching-archive-material-publication-student-app-read.md",
  };
}

function publicationRowVerificationReport() {
  const record = publicationRecord();
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION",
    runtime: {
      runtimeId: "teaching_archive_material_publication_row_verification_runtime",
      commandPort: "TeachingArchiveMaterialPublicationRowVerificationPort.verifyTeachingArchivePublicationPhysicalRow",
      status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PHYSICAL_ROW_VERIFIED",
    },
    runtimeSlo: { p99Ms: 8, totalErrors: 0 },
    runtimeProbes: {
      teachingArchiveMaterialPublicationRowVerification: {
        result: {
          schemaVersion: "2026-06-07.teaching.archive-material-publication-row-verified.v1",
          runtimeId: "teaching_archive_material_publication_row_verification_runtime",
          commandPort: "TeachingArchiveMaterialPublicationRowVerificationPort.verifyTeachingArchivePublicationPhysicalRow",
          status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PHYSICAL_ROW_VERIFIED",
          recordId: "teaching_archive_material_publication_row_verification_archive-material-publication-row-verification-student_001-fractions_packet",
          teachingArchivePublicationPhysicalRow: {
            targetRepository: "PublicationRepository.GetByID",
            targetStore: "TEACHING_ARCHIVE_PUBLICATION_STORE",
            targetTable: "teaching_archive_publications",
            publicationRecord: record,
          },
          boundary: {
            publicationStorageCommitVerified: true,
            publicationPhysicalRowVerified: true,
            mainDatabaseReadAllowed: true,
            studentVisiblePublished: true,
            directDatabaseAccessAllowed: false,
            executeHttpRequestAllowed: false,
            ocrOrRagJobWriteStarted: false,
            aiGradingWriteStarted: false,
            modelInferenceStarted: false,
            remoteDeviceControlAllowed: false,
            localToolMutationAllowed: false,
            swarmAllowed: false,
          },
          evidenceRefs: ["evidence:publication-row:archive_material_publication_commit_001"],
        },
      },
    },
    safetyInvariants: {
      publicationStorageCommitVerified: true,
      publicationPhysicalRowVerified: true,
      mainDatabaseReadAllowed: true,
      studentVisiblePublished: true,
      futureStudentAppPublishedMaterialReadRequired: true,
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
