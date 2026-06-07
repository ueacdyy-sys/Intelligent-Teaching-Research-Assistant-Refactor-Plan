import assert from "node:assert/strict";
import test from "node:test";

import {
  auditTeachingArchiveMaterialPublishedDetailMetadataRead,
  collectSourceFiles,
} from "./teaching-archive-material-published-detail-metadata-read-audit.mjs";

test("passes when safe published detail metadata read is wired through Go, OpenAPI, audit hooks, and board evidence", async () => {
  const report = await auditTeachingArchiveMaterialPublishedDetailMetadataRead(
    collectSourceFiles(process.cwd()),
    { generatedAt: "2026-06-07T13:20:00.000Z", probeP99Ms: 6 },
  );
  assert.equal(report.readiness, "READY");
  assert.equal(report.runtime.runtimeId, "teaching_archive_material_published_detail_metadata_read_runtime");
  assert.equal(report.runtime.status, "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_VERIFIED");
  assert.equal(report.runtimeProbes.teachingArchiveMaterialPublishedDetailMetadataRead.status, "PASS");
  assert.equal(report.safetyInvariants.contentRefExcluded, true);
  assert.equal(report.safetyInvariants.directDatabaseAccessAllowed, false);
});

test("fails when 0315 source search foundation is not ready", async () => {
  const inputs = collectSourceFiles(process.cwd());
  inputs.sourceSearchReport = JSON.stringify({
    ...JSON.parse(inputs.sourceSearchReport),
    readiness: "NEEDS_REMEDIATION",
  });
  const report = await auditTeachingArchiveMaterialPublishedDetailMetadataRead(inputs);
  assert.equal(report.readiness, "NEEDS_REMEDIATION");
  assert(report.findings.some((finding) => finding.id === "source.published_search_foundation_ready" && !finding.passed));
});

test("fails when hooks do not track 0316 detail metadata read", async () => {
  const inputs = collectSourceFiles(process.cwd());
  inputs.qualityGate = "";
  inputs.rootWorkflowCoverage = "";
  inputs.verifyStructure = "";
  inputs.architectureBoard = "";
  const report = await auditTeachingArchiveMaterialPublishedDetailMetadataRead(inputs);
  assert.equal(report.readiness, "NEEDS_REMEDIATION");
  assert(report.findings.some((finding) => finding.id === "quality_root_structure_and_board_track_runtime" && !finding.passed));
});
