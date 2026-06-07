import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditTeachingArchiveMaterialPublishedContentPreviewRenderEnvelope } from "./teaching-archive-material-published-content-preview-render-envelope-audit.mjs";

describe("Teaching archive material published content preview render envelope audit", () => {
  it("passes when rendered preview stays within safe text-block boundaries", () => {
    const report = auditTeachingArchiveMaterialPublishedContentPreviewRenderEnvelope(validInputs(), {
      generatedAt: "2026-06-08T00:00:00.000Z",
      probeP99Ms: 3,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.useCase, "RenderStudentAppArchiveItemContentPreview.Execute");
    assert.equal(report.runtimeSlo.p99Ms, 3);
    assert.equal(report.safetyInvariants.renderFormat, "SAFE_TEXT_BLOCKS");
  });

  it("fails when the source read foundation is not ready", () => {
    const inputs = validInputs();
    inputs.source0318Report = JSON.stringify({ readiness: "NEEDS_REMEDIATION" });

    const report = auditTeachingArchiveMaterialPublishedContentPreviewRenderEnvelope(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0318_read_foundation_ready").passed, false);
  });

  it("fails when render response leaks raw rendering or storage fields", () => {
    const inputs = validInputs();
    inputs.httpResponses += "\ntype studentAppArchiveItemContentPreviewRenderResponse struct { ContentRef string; RenderedHTML string }\n";
    inputs.openApiPath += "\ncontentRef: {}\nrenderedHtml: {}\n";

    const report = auditTeachingArchiveMaterialPublishedContentPreviewRenderEnvelope(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "http.openapi_safe_render_endpoint").passed, false);
  });

  it("fails when root hooks do not track 0319", () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "10.90/10";

    const report = auditTeachingArchiveMaterialPublishedContentPreviewRenderEnvelope(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_board_hooks").passed, false);
  });
});

function validInputs() {
  const source0318Report = JSON.stringify({
    readiness: "READY",
    runtime: { status: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_READ_FOUNDATION_READY" },
  });
  return {
    source0318Report,
    domain: [
      "PublishedArchiveMaterialContentPreviewRenderEnvelope",
      "PublishedArchiveMaterialContentPreviewBlock",
      "PublishedArchiveMaterialContentPreviewRenderFormatSafeTextBlocks",
      "PublishedArchiveMaterialContentPreviewBlockTypeSection",
      "BuildStudentAppArchiveItemContentPreviewRenderEnvelope",
      "SAFE_TEXT_BLOCKS",
    ].join("\n"),
    domainTest: "BuildStudentAppArchiveItemContentPreviewRenderEnvelope RejectsCrossStudentRepositoryLeak",
    usecase: "RenderStudentAppArchiveItemContentPreview GetPublishedContentPreviewForStudentApp",
    usecaseTest: "RejectsCrossStudentRepositoryLeak",
    http: "renderStudentAppArchiveItemContentPreviewHTTP",
    httpTest: "body leaked RenderStudentAppArchiveItemContentPreviewReturnsSafeTextBlocks",
    httpPaths: "/content-preview/rendered",
    httpRoutes: "/content-preview/rendered",
    httpConfig: "RenderStudentAppArchiveItemContentPreview",
    httpPresenters: "toStudentAppArchiveItemContentPreviewRenderResponse SAFE_TEXT_BLOCKS",
    httpResponses: [
      "type studentAppArchiveItemContentPreviewRenderResponse struct { ArchiveItemID string; RenderFormat string; Blocks []studentAppArchiveItemContentPreviewBlock }",
      "type studentAppArchiveItemContentPreviewBlock struct { BlockID string; BlockType string; SectionID string; Title string; Text string }",
    ].join("\n"),
    main: "RenderStudentAppArchiveItemContentPreview:             renderStudentAppArchiveItemContentPreview",
    openApiRoot: "/v1/student-app/archive-items/{archiveItemId}/content-preview/rendered",
    openApiPath: "operationId: renderStudentAppArchiveItemContentPreview renderFormat SAFE_TEXT_BLOCKS blockType SECTION",
    packageJson: "audit:teaching-archive-material-published-content-preview-render-envelope",
    qualityGate: "Teaching archive material published content preview render envelope audit",
    rootWorkflowCoverage: "teachingArchiveMaterialPublishedContentPreviewRenderEnvelope teaching-archive-material-published-content-preview-render-envelope.current.json",
    verifyStructure: "0319-teaching-archive-material-published-content-preview-render-envelope.md render_student_app_archive_item_content_preview.go",
    architectureBoard: "10.93/10 content-preview/rendered",
    rootTrace: "SDD 0319 published content preview render envelope",
    sdd: "0319 Teaching Archive Material Published Content Preview Render Envelope",
  };
}
