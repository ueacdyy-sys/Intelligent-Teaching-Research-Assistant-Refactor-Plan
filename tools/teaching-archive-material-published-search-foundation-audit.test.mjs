import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditTeachingArchiveMaterialPublishedSearchFoundation,
  formatTeachingArchiveMaterialPublishedSearchFoundationAudit,
} from "./teaching-archive-material-published-search-foundation-audit.mjs";

describe("Teaching archive material published search foundation runtime audit", () => {
  it("passes when Student App published material metadata search is wired through the hardened projection", async () => {
    const report = await auditTeachingArchiveMaterialPublishedSearchFoundation(currentInputs(), {
      generatedAt: "2026-06-07T12:45:00.000Z",
      probeP99Ms: 8,
    });

    assert.equal(report.readiness, "READY", JSON.stringify(report.findings.filter((finding) => !finding.passed), null, 2));
    assert.equal(report.workloadType, "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION");
    assert.equal(report.runtime.runtimeId, "teaching_archive_material_published_search_foundation_runtime");
    assert.equal(report.runtime.commandPort, "TeachingArchiveMaterialPublishedSearchFoundationPort.verifyStudentAppPublishedMaterialSearch");
    assert.equal(report.runtime.status, "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_VERIFIED");
    assert.equal(report.runtimeSlo.p99Ms, 8);
    assert.equal(report.safetyInvariants.titleAndTagSearchOnly, true);
    assert.equal(report.safetyInvariants.responseMetadataOnly, true);
    assert.equal(report.safetyInvariants.futureOcrRagSemanticSearchRequired, true);
    assert.equal(report.runtimeProbes.teachingArchiveMaterialPublishedSearchFoundation.result.search.query, "fractions");
    assert.equal(report.runtimeProbes.teachingArchiveMaterialPublishedSearchFoundation.result.studentProductSearchSource.searchIndexProfile, "idx_teaching_archive_items_student_material_search_scope");
    assert.match(formatTeachingArchiveMaterialPublishedSearchFoundationAudit(report), /published search foundation runtime: READY/u);
  });

  it("fails when the 0314 projection source is not ready", async () => {
    const inputs = currentInputs();
    const source = JSON.parse(inputs.projectionHardeningReport);
    source.runtime.status = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_REJECTED";
    source.safetyInvariants.publicationStoreFiltered = false;
    inputs.projectionHardeningReport = JSON.stringify(source);

    const report = await auditTeachingArchiveMaterialPublishedSearchFoundation(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.projection_hardening_ready").passed, false);
  });

  it("fails when runtime claims raw DB, HTTP, OCR/RAG, AI grading, model, publication write, tools, or Swarm side effects", async () => {
    const inputs = currentInputs();
    inputs.runtime += "\ndirectDatabaseAccessAllowed: true\nexecuteHttpRequestAllowed: true\nfetch(\nmodelInferenceStarted: true\npublicationWriteStarted: true\nocrOrRagJobWriteStarted: true\naiGradingWriteStarted: true\nswarmAllowed: true\n";

    const report = await auditTeachingArchiveMaterialPublishedSearchFoundation(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.identity_port_idempotency_and_safety").passed, false);
  });

  it("fails when Go, OpenAPI, SQL, or cache search evidence is missing", async () => {
    const inputs = currentInputs();
    inputs.openapi = "";
    inputs.domain = "";
    inputs.http = "";
    inputs.repository = "";
    inputs.cache = "";
    inputs.sqlContract = "";

    const report = await auditTeachingArchiveMaterialPublishedSearchFoundation(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "go_openapi_sql_search_evidence_exists").passed, false);
  });

  it("fails when tests are missing published search negative paths", async () => {
    const inputs = currentInputs();
    inputs.runtimeTest = inputs.runtimeTest.replace(
      "rejects generic sources, non-matches, scope leaks, exclusion gaps, and product metadata leaks",
      "rejects one mismatch",
    );

    const report = await auditTeachingArchiveMaterialPublishedSearchFoundation(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_published_search_negative_paths").passed, false);
  });

  it("fails when package, quality, root coverage, structure, SDD, or board hooks are missing", async () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.qualityGate = "";
    inputs.rootWorkflowCoverage = "";
    inputs.verifyStructure = "";
    inputs.architectureBoard = "";
    inputs.sdd = "";

    const report = await auditTeachingArchiveMaterialPublishedSearchFoundation(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_PORT",
      "TeachingArchiveMaterialPublishedSearchFoundationPort.verifyStudentAppPublishedMaterialSearch",
      "verifyTeachingArchiveMaterialPublishedSearchFoundation",
      "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_VERIFIED",
      "StudentAppPublishedMaterialSearchPort.searchPublishedArchiveMaterials is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "queryNormalized: true",
      "titleAndTagSearchOnly: true",
      "publicationStoreFiltered: true",
      "nonMatchingPublishedMaterialsExcluded: true",
      "answerKeyAndModelOutputExcluded: true",
      "responseMetadataOnly: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "modelInferenceStarted: false",
      "publicationWriteStarted: false",
      "swarmAllowed: false",
      "requiresFutureOcrRagSemanticSearchSlice: true",
      "ArchiveRepository.ListPublishedForStudentApp",
      "idx_teaching_archive_items_student_material_search_scope",
      "teaching_archive_material_published_search_foundation_runtime",
    ].join("\n"),
    runtimeTest: [
      "verifies published material metadata search through the Student App archive-items query path",
      "uses idempotency for replay and rejects conflicting published search verification",
      "rejects unsafe source, unsafe policy, missing port, unsafe query, and missing expected material",
      "rejects generic sources, non-matches, scope leaks, exclusion gaps, and product metadata leaks",
      "requires projection hardening, published search, and Go query evidence refs",
    ].join("\n"),
    projectionHardeningReport: JSON.stringify(projectionHardeningReport()),
    openapi: "name: query\nmaxLength: 120",
    domain: [
      "SearchText",
      "normalizeArchiveSearchText",
      "query is too long",
      "query contains unsupported characters",
    ].join("\n"),
    domainStudentApp: [
      "searchText, err := normalizeArchiveSearchText(input.Query)",
      "query.SearchText = searchText",
    ].join("\n"),
    domainTest: "TestNormalizeListStudentAppArchiveItemsRejectsUnsafeQuery",
    usecase: "ListPublishedForStudentApp(ctx context.Context, query domain.ArchiveItemQuery)",
    usecaseTest: "SearchText = %q",
    http: "Query:        r.URL.Query().Get(\"query\")",
    httpTest: "query=fractions",
    httpHelpers: "archiveItemMatchesSearch",
    repository: [
      "func (r *ArchiveRepository) ListPublishedForStudentApp",
      "item.title ILIKE",
      "jsonb_array_elements_text(item.tags)",
      "escapeLikePattern",
    ].join("\n"),
    repositoryTest: [
      "TestListPublishedForStudentAppSearchesOnlyInsidePublicationProjection",
      "TestListArchiveItemsDoesNotApplyStudentAppSearchText",
    ].join("\n"),
    schema: "idx_teaching_archive_items_student_material_search_scope\nDROP INDEX IF EXISTS idx_teaching_archive_items_student_material_search_scope",
    schemaTest: "schema missing teaching archive student material search index",
    cache: "url.QueryEscape(query.SearchText)\nurl.QueryEscape(studentID)",
    cacheTest: "SearchText: \"fractions\"",
    sqlContract: "idx_teaching_archive_items_student_material_search_scope\nDROP INDEX IF EXISTS idx_teaching_archive_items_student_material_search_scope",
    sqlContractTest: "hot_write profile must retain hot query index",
    packageJson: JSON.stringify({
      scripts: {
        "audit:teaching-archive-material-published-search-foundation": "node tools/teaching-archive-material-published-search-foundation-audit.mjs --out reports/teaching-archive-material-published-search-foundation.current.json",
      },
    }),
    qualityGate: "Teaching archive material published search foundation runtime audit",
    rootWorkflowCoverage: "teachingArchiveMaterialPublishedSearchFoundation reports/teaching-archive-material-published-search-foundation.current.json teaching_archive_material_published_search_foundation_runtime",
    verifyStructure: "0315-teaching-archive-material-published-search-foundation.md teaching-archive-material-published-search-foundation-runtime.mjs teaching-archive-material-published-search-foundation-audit.mjs teaching_archive_material_published_search_foundation_runtime",
    architectureBoard: "10.81/10 TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_VERIFIED",
    sdd: "0315-teaching-archive-material-published-search-foundation.md",
  };
}

function projectionHardeningReport() {
  const result = {
    recordId: "teaching_archive_material_publication_projection_hardening_archive-material-publication-projection-hardening_student_001_fractions_packet",
    runtimeId: "teaching_archive_material_publication_projection_hardening_runtime",
    commandPort: "TeachingArchiveMaterialPublicationProjectionHardeningPort.verifyStudentAppPublishedMaterialProjection",
    status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENED",
    studentProductReadSource: {
      repository: "ArchiveRepository.ListPublishedForStudentApp",
    },
    hardenedPublishedArchiveMaterial: {
      publicationId: "archive_material_publication_commit_001",
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
    evidenceRefs: ["evidence:publication-projection-hardening:0314"],
  };
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING",
    runtime: {
      runtimeId: "teaching_archive_material_publication_projection_hardening_runtime",
      commandPort: "TeachingArchiveMaterialPublicationProjectionHardeningPort.verifyStudentAppPublishedMaterialProjection",
      status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENED",
    },
    runtimeSlo: { p99Ms: 8, totalErrors: 0 },
    runtimeProbes: { teachingArchiveMaterialPublicationProjectionHardening: { result } },
    safetyInvariants: {
      publicationStoreFiltered: true,
      studentAppChannelFiltered: true,
      ownStudentOnly: true,
      unpublishedArchiveItemsExcluded: true,
      draftOnlyArchiveItemsExcluded: true,
      crossStudentArchiveItemsExcluded: true,
      publicationMetadataLeakPrevented: true,
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
