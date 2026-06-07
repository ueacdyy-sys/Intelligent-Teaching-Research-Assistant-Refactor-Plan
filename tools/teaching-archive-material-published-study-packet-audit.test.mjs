import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditTeachingArchiveMaterialPublishedStudyPacket } from "./teaching-archive-material-published-study-packet-audit.mjs";

describe("Teaching archive material published study packet audit", () => {
  it("passes when study packet stays within safe metadata and text-block boundaries", () => {
    const report = auditTeachingArchiveMaterialPublishedStudyPacket(validInputs(), {
      generatedAt: "2026-06-08T00:00:00.000Z",
      probeP99Ms: 4,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.useCase, "ReadStudentAppArchiveItemStudyPacket.Execute");
    assert.equal(report.runtimeSlo.p99Ms, 4);
    assert.equal(report.safetyInvariants.contentRefExcluded, true);
  });

  it("fails when the source render envelope is not ready", () => {
    const inputs = validInputs();
    inputs.source0319Report = JSON.stringify({ readiness: "NEEDS_REMEDIATION" });

    const report = auditTeachingArchiveMaterialPublishedStudyPacket(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0319_render_envelope_ready").passed, false);
  });

  it("fails when study packet response leaks ownership or storage fields", () => {
    const inputs = validInputs();
    inputs.httpResponses += "\ntype studentAppArchiveItemStudyPacketMetadata struct { StudentID string; ContentRef string }\n";
    inputs.openApiPath += "\nstudentId: {}\ncontentRef: {}\n";

    const report = auditTeachingArchiveMaterialPublishedStudyPacket(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "http.openapi_safe_study_packet_endpoint").passed, false);
  });

  it("fails when root hooks do not track 0320", () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "10.93/10";

    const report = auditTeachingArchiveMaterialPublishedStudyPacket(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_board_hooks").passed, false);
  });
});

function validInputs() {
  const source0319Report = JSON.stringify({
    readiness: "READY",
    runtime: { status: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_RENDER_ENVELOPE_READY" },
  });
  return {
    source0319Report,
    domain: [
      "StudentAppArchiveItemStudyPacket",
      "StudentAppArchiveItemStudyPacketStatusReady",
      "BuildStudentAppArchiveItemStudyPacket",
    ].join("\n"),
    domainTest: "BuildStudentAppArchiveItemStudyPacket RejectsPreviewMetadataMismatch",
    usecase: "ReadStudentAppArchiveItemStudyPacket GetPublishedForStudentApp GetPublishedContentPreviewForStudentApp",
    usecaseTest: "DoesNotReadPreviewWhenDetailMissing RejectsPreviewMismatch",
    http: "readStudentAppArchiveItemStudyPacketHTTP",
    httpTest: "body leaked ReadStudentAppArchiveItemStudyPacketReturnsSafeMetadataAndTextBlocks",
    httpPaths: "/study-packet",
    httpRoutes: "/study-packet",
    httpConfig: "ReadStudentAppArchiveItemStudyPacket",
    httpPresenters: "toStudentAppArchiveItemStudyPacketResponse SAFE_TEXT_BLOCKS",
    httpResponses: [
      "type studentAppArchiveItemStudyPacketResponse struct { PacketStatus string; ArchiveItem studentAppArchiveItemStudyPacketMetadata; ContentPreview studentAppArchiveItemContentPreviewRenderResponse }",
      "type studentAppArchiveItemStudyPacketMetadata struct { ID string; OwnerType string; MaterialType string; Title string }",
    ].join("\n"),
    main: "ReadStudentAppArchiveItemStudyPacket:                  readStudentAppArchiveItemStudyPacket",
    openApiRoot: "/v1/student-app/archive-items/{archiveItemId}/study-packet",
    openApiPath: "operationId: readStudentAppArchiveItemStudyPacket packetStatus archiveItem contentPreview SAFE_TEXT_BLOCKS",
    packageJson: "audit:teaching-archive-material-published-study-packet",
    qualityGate: "Teaching archive material published study packet audit",
    rootWorkflowCoverage: "teachingArchiveMaterialPublishedStudyPacket teaching-archive-material-published-study-packet.current.json",
    verifyStructure: "0320-teaching-archive-material-published-study-packet.md read_student_app_archive_item_study_packet.go",
    architectureBoard: "10.96/10 study-packet",
    rootTrace: "SDD 0320 student app archive item study packet",
    sdd: "0320 Teaching Archive Material Published Study Packet",
  };
}
