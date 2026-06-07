import assert from "node:assert/strict";
import test from "node:test";

import {
  auditTeachingArchiveMaterialPublishedContentPreviewPrecheck,
  collectSourceFiles,
} from "./teaching-archive-material-published-content-preview-precheck-audit.mjs";

test("passes when published content preview is safely blocked and wired through quality evidence", async () => {
  const report = await auditTeachingArchiveMaterialPublishedContentPreviewPrecheck(
    collectSourceFiles(process.cwd()),
    { generatedAt: "2026-06-07T14:10:00.000Z", probeP99Ms: 5 },
  );
  assert.equal(report.readiness, "READY");
  assert.equal(report.runtime.runtimeId, "teaching_archive_material_published_content_preview_precheck_runtime");
  assert.equal(report.runtime.status, "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_BLOCKED_UNTIL_SAFE_CONTENT_STORE");
  assert.equal(report.runtimeProbes.teachingArchiveMaterialPublishedContentPreviewPrecheck.status, "PASS");
  assert.equal(report.safetyInvariants.contentPreviewPrecheckOnly, true);
  assert.equal(report.safetyInvariants.contentPreviewReadStarted, false);
  assert.equal(report.safetyInvariants.objectStorageReadStarted, false);
});

test("fails when 0316 detail metadata evidence is not ready", async () => {
  const inputs = collectSourceFiles(process.cwd());
  inputs.sourceDetailReport = JSON.stringify({
    ...JSON.parse(inputs.sourceDetailReport),
    readiness: "NEEDS_REMEDIATION",
  });
  const report = await auditTeachingArchiveMaterialPublishedContentPreviewPrecheck(inputs);
  assert.equal(report.readiness, "NEEDS_REMEDIATION");
  assert(report.findings.some((finding) => finding.id === "source.published_detail_metadata_read_ready" && !finding.passed));
});

test("fails when hooks do not track 0317 content preview precheck", async () => {
  const inputs = collectSourceFiles(process.cwd());
  inputs.qualityGate = "";
  inputs.rootWorkflowCoverage = "";
  inputs.verifyStructure = "";
  inputs.rootTrace = "";
  inputs.architectureBoard = "";
  const report = await auditTeachingArchiveMaterialPublishedContentPreviewPrecheck(inputs);
  assert.equal(report.readiness, "NEEDS_REMEDIATION");
  assert(report.findings.some((finding) => finding.id === "quality_root_structure_trace_and_board_track_runtime" && !finding.passed));
});
