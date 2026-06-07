import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditTeachingArchiveMaterialPublicationProjectionHardening,
  formatTeachingArchiveMaterialPublicationProjectionHardeningAudit,
} from "./teaching-archive-material-publication-projection-hardening-audit.mjs";

describe("Teaching archive material publication projection hardening runtime audit", () => {
  it("passes when Student App published material reads are filtered by the publication projection", async () => {
    const report = await auditTeachingArchiveMaterialPublicationProjectionHardening(currentInputs(), {
      generatedAt: "2026-06-07T12:15:00.000Z",
      probeP99Ms: 8,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING");
    assert.equal(report.runtime.runtimeId, "teaching_archive_material_publication_projection_hardening_runtime");
    assert.equal(report.runtime.commandPort, "TeachingArchiveMaterialPublicationProjectionHardeningPort.verifyStudentAppPublishedMaterialProjection");
    assert.equal(report.runtime.status, "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENED");
    assert.equal(report.runtimeSlo.p99Ms, 8);
    assert.equal(report.safetyInvariants.publicationStoreFiltered, true);
    assert.equal(report.safetyInvariants.unpublishedArchiveItemsExcluded, true);
    assert.equal(report.safetyInvariants.crossStudentArchiveItemsExcluded, true);
    assert.equal(report.safetyInvariants.directDatabaseAccessAllowed, false);
    assert.equal(report.runtimeProbes.teachingArchiveMaterialPublicationProjectionHardening.result.studentProductReadSource.repository, "ArchiveRepository.ListPublishedForStudentApp");
    assert.match(formatTeachingArchiveMaterialPublicationProjectionHardeningAudit(report), /projection hardening runtime: READY/u);
  });

  it("fails when the 0313 Student App read source is not ready", async () => {
    const inputs = currentInputs();
    const source = JSON.parse(inputs.studentAppReadReport);
    source.runtime.status = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_REJECTED";
    source.safetyInvariants.futurePublicationProjectionOrRagRequired = false;
    inputs.studentAppReadReport = JSON.stringify(source);

    const report = await auditTeachingArchiveMaterialPublicationProjectionHardening(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.student_app_read_ready").passed, false);
  });

  it("fails when runtime claims raw DB, HTTP, OCR/RAG, AI grading, model, publication write, tools, or Swarm side effects", async () => {
    const inputs = currentInputs();
    inputs.runtime += "\ndirectDatabaseAccessAllowed: true\nexecuteHttpRequestAllowed: true\nfetch(\nmodelInferenceStarted: true\npublicationWriteStarted: true\nocrOrRagJobWriteStarted: true\naiGradingWriteStarted: true\nswarmAllowed: true\n";

    const report = await auditTeachingArchiveMaterialPublicationProjectionHardening(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.identity_port_idempotency_and_safety").passed, false);
  });

  it("fails when Go or SQL projection evidence is missing", async () => {
    const inputs = currentInputs();
    inputs.main = "";
    inputs.usecase = "";
    inputs.repository = "";
    inputs.schema = "";
    inputs.sqlContract = "";

    const report = await auditTeachingArchiveMaterialPublicationProjectionHardening(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "go_sql_projection_hardening_evidence_exists").passed, false);
  });

  it("fails when tests are missing projection hardening negative paths", async () => {
    const inputs = currentInputs();
    inputs.runtimeTest = inputs.runtimeTest.replace(
      "rejects generic archive sources, missing exclusion proof, mismatched responses, leaked fields, and publication metadata",
      "rejects one mismatch",
    );

    const report = await auditTeachingArchiveMaterialPublicationProjectionHardening(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_projection_hardening_negative_paths").passed, false);
  });

  it("fails when package, quality, root coverage, structure, SDD, or board hooks are missing", async () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.qualityGate = "";
    inputs.rootWorkflowCoverage = "";
    inputs.verifyStructure = "";
    inputs.architectureBoard = "";
    inputs.sdd = "";

    const report = await auditTeachingArchiveMaterialPublicationProjectionHardening(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_PORT",
      "TeachingArchiveMaterialPublicationProjectionHardeningPort.verifyStudentAppPublishedMaterialProjection",
      "verifyTeachingArchiveMaterialPublicationProjectionHardening",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENED",
      "StudentAppPublishedMaterialProjectionReadPort.listPublishedArchiveMaterials is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "publicationStoreFiltered: true",
      "unpublishedArchiveItemsExcluded: true",
      "draftOnlyArchiveItemsExcluded: true",
      "crossStudentArchiveItemsExcluded: true",
      "publicationMetadataLeakPrevented: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "modelInferenceStarted: false",
      "publicationWriteStarted: false",
      "swarmAllowed: false",
      "ArchiveRepository.ListPublishedForStudentApp",
      "teaching_archive_publications",
      "teaching_archive_material_publication_projection_hardening_runtime",
    ].join("\n"),
    runtimeTest: [
      "hardens student app archive material reads through the publication projection",
      "uses idempotency for replay and rejects conflicting projection verification",
      "rejects unsafe source, unsafe policy, missing port, and missing published material",
      "rejects generic archive sources, missing exclusion proof, mismatched responses, leaked fields, and publication metadata",
      "requires student app read, projection hardening, and Go evidence refs",
    ].join("\n"),
    studentAppReadReport: JSON.stringify(publicationStudentAppReadReport()),
    main: "NewListStudentAppArchiveItems(archiveRepository)",
    usecase: [
      "type StudentAppPublishedArchiveMaterialReader interface",
      "ListPublishedForStudentApp(ctx context.Context, query domain.ArchiveItemQuery)",
    ].join("\n"),
    usecaseTest: [
      "TestListStudentAppArchiveItemsScopesOwnStudentBeforePublishedProjectionRead",
      "generic reads = %d, want 0",
    ].join("\n"),
    repository: [
      "func (r *ArchiveRepository) ListPublishedForStudentApp",
      "FROM teaching_archive_items AS item",
      "FROM teaching_archive_publications AS publication",
      "publication.archive_item_id = item.id",
      "publication.student_id = item.student_id",
      "publication.scope_type = 'STUDENT_OWN_ARCHIVE'",
      "publication.publication_state = 'COMMITTED_TO_PUBLICATION_STORE'",
      "publication.visibility_state = 'STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED'",
      "publication.channel = 'STUDENT_APP'",
    ].join("\n"),
    repositoryTest: "TestListPublishedForStudentAppUsesPublicationProjectionFilter",
    schema: [
      "CREATE TABLE IF NOT EXISTS teaching_archive_publications",
      "idx_teaching_archive_publications_student_app_visible_lookup",
    ].join("\n"),
    schemaTest: "schema missing teaching archive publication projection table",
    sqlContract: [
      "CREATE TABLE IF NOT EXISTS teaching_archive_publications",
      "idx_teaching_archive_publications_student_app_visible_lookup",
    ].join("\n"),
    sqlContractTest: "defines the student app publication projection table and lookup indexes",
    packageJson: JSON.stringify({
      scripts: {
        "audit:teaching-archive-material-publication-projection-hardening": "node tools/teaching-archive-material-publication-projection-hardening-audit.mjs --out reports/teaching-archive-material-publication-projection-hardening.current.json",
      },
    }),
    qualityGate: "Teaching archive material publication projection hardening runtime audit",
    rootWorkflowCoverage: "teachingArchiveMaterialPublicationProjectionHardening reports/teaching-archive-material-publication-projection-hardening.current.json teaching_archive_material_publication_projection_hardening_runtime",
    verifyStructure: "0314-teaching-archive-material-publication-projection-hardening.md teaching-archive-material-publication-projection-hardening-runtime.mjs teaching-archive-material-publication-projection-hardening-audit.mjs teaching_archive_material_publication_projection_hardening_runtime",
    architectureBoard: "10.78/10 TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENED",
    sdd: "0314-teaching-archive-material-publication-projection-hardening.md",
  };
}

function publicationStudentAppReadReport() {
  const result = {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-student-app-read-verified.v1",
    recordId: "teaching_archive_material_publication_student_app_read_archive-material-publication-student-app-read_student_001_fractions_packet",
    runtimeId: "teaching_archive_material_publication_student_app_read_runtime",
    commandPort: "TeachingArchiveMaterialPublicationStudentAppReadPort.verifyStudentAppPublishedMaterialRead",
    status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_VERIFIED",
    studentProductReadSource: {
      endpoint: "GET /v1/student-app/archive-items",
      useCase: "ListStudentAppArchiveItems.Execute",
      repository: "ArchiveRepository.List",
      ownStudentOnly: true,
      publicationRowSourceVerified: true,
    },
    publishedArchiveMaterial: {
      publicationId: "archive_material_publication_commit_001",
      visibilityState: "STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED",
      archiveItem: {
        id: "tarch_archive_material_001",
        ownerType: "STUDENT",
        studentId: "student_001",
        materialType: "HANDOUT",
        title: "Fractions practice packet",
        source: "SYSTEM_IMPORT",
        contentRef: "precommit://archive-material/student_001/fractions-packet",
        tags: ["fractions", "published"],
        analysisIntents: ["ARCHIVE_ONLY"],
        ocrStatus: "NOT_REQUIRED",
        createdAt: "2026-06-07T08:00:00.000Z",
      },
    },
    boundary: {
      studentAppPublishedMaterialReadVerified: true,
      productResponseMatchedPublicationRow: true,
      publicationMetadataLeakPrevented: true,
      crossStudentLeakPrevented: true,
      requiresFuturePublicationProjectionOrRagSlice: true,
    },
    evidenceRefs: ["evidence:student-app-published-archive-material:tarch_archive_material_001"],
  };
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ",
    runtime: {
      runtimeId: "teaching_archive_material_publication_student_app_read_runtime",
      commandPort: "TeachingArchiveMaterialPublicationStudentAppReadPort.verifyStudentAppPublishedMaterialRead",
      status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_VERIFIED",
    },
    runtimeSlo: { p99Ms: 8, totalErrors: 0 },
    runtimeProbes: { teachingArchiveMaterialPublicationStudentAppRead: { result } },
    safetyInvariants: {
      studentAppPublishedMaterialReadVerified: true,
      productResponseMatchedPublicationRow: true,
      publicationMetadataLeakPrevented: true,
      crossStudentLeakPrevented: true,
      futurePublicationProjectionOrRagRequired: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      publicationWriteStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
  };
}
