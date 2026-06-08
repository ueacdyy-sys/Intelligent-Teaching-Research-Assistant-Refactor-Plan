import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorResultStudentVisibilityReview } from "./student-app-ai-tutor-result-student-visibility-review-audit.mjs";

describe("Student App AI Tutor result student visibility review audit", () => {
  it("passes when reviewed result visibility is approved without publishing", async () => {
    const report = await auditStudentAppAITutorResultStudentVisibilityReview(validInputs(), {
      generatedAt: "2026-06-08T10:40:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_student_visibility_review_runtime");
    assert.equal(report.safetyInvariants.approvedForFutureStudentDelivery, true);
    assert.equal(report.safetyInvariants.studentVisiblePublished, false);
    assert.equal(report.runtimeProbes.studentAppAiTutorResultStudentVisibilityReview.portCalls, 1);
  });

  it("fails when 0327 reviewed result persistence is not ready", async () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.reviewedResultPersistenceBridgeReport);
    source.readiness = "NEEDS_REMEDIATION";
    inputs.reviewedResultPersistenceBridgeReport = JSON.stringify(source);

    const report = await auditStudentAppAITutorResultStudentVisibilityReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0327_reviewed_result_persistence_ready").passed, false);
  });

  it("fails when runtime claims publication, delivery, raw refs, or unsafe execution", async () => {
    const inputs = validInputs();
    inputs.runtime += "\nstudentVisiblePublishAllowed: true\nstudentDeliveryEnvelopeAllowed: true\nrawResultRefSentToPort: true\n";

    const report = await auditStudentAppAITutorResultStudentVisibilityReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("fails when negative runtime tests are missing", async () => {
    const inputs = validInputs();
    inputs.runtimeTest = "records a human student visibility review without publishing or delivery envelope creation";

    const report = await auditStudentAppAITutorResultStudentVisibilityReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_visibility_review_negative_paths").passed, false);
  });

  it("fails when project hooks do not track 0328", async () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "11.17/10";

    const report = await auditStudentAppAITutorResultStudentVisibilityReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_and_board_track_runtime").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    runtime: "tools/student-app-ai-tutor-result-student-visibility-review-runtime.mjs",
    runtimeTest: "tools/student-app-ai-tutor-result-student-visibility-review-runtime.test.mjs",
    reviewedResultPersistenceBridgeReport: "reports/student-app-ai-tutor-reviewed-result-persistence-bridge.current.json",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0328-student-app-ai-tutor-result-student-visibility-review.md",
  }).map(([key, relativePath]) => [key, fs.readFileSync(path.join(root, relativePath), "utf8")]));
}
