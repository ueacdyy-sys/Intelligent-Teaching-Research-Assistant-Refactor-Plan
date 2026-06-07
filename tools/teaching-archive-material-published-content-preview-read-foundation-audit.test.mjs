import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditTeachingArchiveMaterialPublishedContentPreviewReadFoundation,
  formatTeachingArchiveMaterialPublishedContentPreviewReadFoundationAudit,
} from "./teaching-archive-material-published-content-preview-read-foundation-audit.mjs";

describe("Teaching archive material published content preview read foundation audit", () => {
  it("passes when Go, SQL, HTTP, OpenAPI, and root hooks expose a safe own-student preview read foundation", () => {
    const report = auditTeachingArchiveMaterialPublishedContentPreviewReadFoundation(currentInputs(), {
      generatedAt: "2026-06-07T16:00:00.000Z",
      probeP99Ms: 8,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.useCase, "ReadStudentAppArchiveItemContentPreview.Execute");
    assert.equal(report.runtimeSlo.p99Ms, 8);
    assert.match(formatTeachingArchiveMaterialPublishedContentPreviewReadFoundationAudit(report), /read foundation: READY/u);
  });

  it("fails when repository lookup drops the publication projection", () => {
    const inputs = currentInputs();
    inputs.postgres = inputs.postgres.replace("FROM teaching_archive_publications AS publication", "FROM unsafe_table");

    const report = auditTeachingArchiveMaterialPublishedContentPreviewReadFoundation(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "postgres.safe_preview_table_and_publication_filter").passed, false);
  });

  it("fails when the student response leaks ownership or storage fields", () => {
    const inputs = currentInputs();
    inputs.httpResponses += "\ntype studentAppArchiveItemContentPreviewResponse struct { StudentID string; ContentRef string }\n";

    const report = auditTeachingArchiveMaterialPublishedContentPreviewReadFoundation(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "http.openapi_safe_student_preview_endpoint").passed, false);
  });
});

function currentInputs() {
  return {
    source0317Report: JSON.stringify({
      readiness: "READY",
      runtime: {
        status: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_BLOCKED_UNTIL_SAFE_CONTENT_STORE",
      },
    }),
    domain: "PublishedArchiveMaterialContentPreview PublishedArchiveMaterialContentPreviewSection NormalizeReadStudentAppArchiveItemContentPreviewInput NormalizePublishedArchiveMaterialContentPreview BuildStudentAppArchiveItemContentPreview contains unsafe preview text",
    domainTest: "RejectsCrossStudentRepositoryLeak",
    usecase: "ReadStudentAppArchiveItemContentPreview GetPublishedContentPreviewForStudentApp",
    usecaseTest: "RejectsCrossStudentRepositoryLeak",
    postgres: "SavePublishedArchiveMaterialContentPreview ON CONFLICT (archive_item_id) DO UPDATE GetPublishedContentPreviewForStudentApp preview.archive_item_id = $1 preview.student_id = $2 preview.preview_status = 'READY' FROM teaching_archive_publications AS publication publication.visibility_state = 'STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED' publication.channel = 'STUDENT_APP'",
    postgresTest: "TestGetPublishedContentPreviewForStudentAppUsesScopedVisibleProjection",
    schema: "CREATE TABLE IF NOT EXISTS teaching_archive_material_content_previews preview_sections JSONB NOT NULL idx_teaching_archive_material_content_previews_student_updated",
    sql: "CREATE TABLE IF NOT EXISTS teaching_archive_material_content_previews preview_sections JSONB NOT NULL idx_teaching_archive_material_content_previews_student_updated",
    http: "readStudentAppArchiveItemContentPreview ReadStudentAppArchiveItemContentPreview",
    httpTest: "body leaked TestReadStudentAppArchiveItemContentPreviewRejectsCrossStudentOrUnpublished",
    httpPaths: "/content-preview",
    httpRoutes: "/content-preview",
    httpConfig: "ReadStudentAppArchiveItemContentPreview",
    httpResponses: "type studentAppArchiveItemContentPreviewResponse struct { ArchiveItemID string PreviewStatus string }\ntype studentAppArchiveItemContentPreviewSection struct { Text string }",
    main: "ReadStudentAppArchiveItemContentPreview:               readStudentAppArchiveItemContentPreview",
    openApiRoot: "/v1/student-app/archive-items/{archiveItemId}/content-preview",
    openApiPath: "operationId: readStudentAppArchiveItemContentPreview previewStatus sections",
    packageJson: "audit:teaching-archive-material-published-content-preview-read-foundation",
    qualityGate: "Teaching archive material published content preview read foundation audit",
    rootWorkflowCoverage: "teachingArchiveMaterialPublishedContentPreviewReadFoundation teaching-archive-material-published-content-preview-read-foundation.current.json",
    verifyStructure: "0318-teaching-archive-material-published-content-preview-read-foundation.md published_archive_material_content_preview.go server_student_app_archive_item_content_preview_test.go",
    architectureBoard: "10.90/10 Teaching Archive material published content preview read foundation",
    rootTrace: "SDD 0318 published content preview read foundation",
    sdd: "0318 Teaching Archive Material Published Content Preview Read Foundation",
  };
}
