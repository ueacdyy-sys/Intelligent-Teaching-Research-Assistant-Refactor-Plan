import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorResultArchiveStudentVisibilityReview } from "./student-app-ai-tutor-result-archive-student-visibility-review-audit.mjs";

describe("Student App AI Tutor result-archive student visibility review audit", () => {
  it("passes when a result-archive reviewed result receives a human visibility review", async () => {
    const report = await auditStudentAppAITutorResultArchiveStudentVisibilityReview(validInputs(), {
      generatedAt: "2026-06-09T12:20:00.000Z",
      probeP99Ms: 5,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_archive_student_visibility_review");
    assert.equal(report.runtime.sharedRuntimeId, "student_app_ai_tutor_result_student_visibility_review_runtime");
    assert.equal(report.safetyInvariants.approvedForFutureStudentDelivery, true);
    assert.equal(report.safetyInvariants.studentVisiblePublished, false);
    assert.equal(report.runtimeProbes.studentAppAiTutorResultArchiveStudentVisibilityReview.portCalls, 1);
  });

  it("fails when 0340 result-archive reviewed-result persistence is not ready", async () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.source0340Report);
    source.readiness = "NEEDS_REMEDIATION";
    inputs.source0340Report = JSON.stringify(source);

    const report = await auditStudentAppAITutorResultArchiveStudentVisibilityReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0340_result_archive_reviewed_result_persistence_ready").passed, false);
  });

  it("fails when runtime is not result-archive source aware", async () => {
    const inputs = validInputs();
    inputs.runtime = inputs.runtime.replaceAll("sourceResultArchiveReviewedResultPersistenceRuntimeId", "sourceResultArchiveReviewedResultPersistenceRuntimeRemoved");

    const report = await auditStudentAppAITutorResultArchiveStudentVisibilityReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.source_aware_result_archive_visibility_review").passed, false);
  });

  it("fails when result-archive visibility regression tests are missing", async () => {
    const inputs = validInputs();
    inputs.runtimeTest = "records a human student visibility review without publishing or delivery envelope creation";

    const report = await auditStudentAppAITutorResultArchiveStudentVisibilityReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_result_archive_visibility_review_paths").passed, false);
  });

  it("fails when project hooks do not track 0341", async () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "11.56/10";

    const report = await auditStudentAppAITutorResultArchiveStudentVisibilityReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0341").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    runtime: "tools/student-app-ai-tutor-result-student-visibility-review-runtime.mjs",
    runtimeTest: "tools/student-app-ai-tutor-result-student-visibility-review-runtime.test.mjs",
    source0340Report: "reports/student-app-ai-tutor-result-archive-reviewed-result-persistence-bridge.current.json",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0341-student-app-ai-tutor-result-archive-student-visibility-review.md",
  }).map(([key, relativePath]) => [key, fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : ""]));
}
