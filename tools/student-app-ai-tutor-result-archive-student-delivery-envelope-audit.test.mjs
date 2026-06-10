import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorResultArchiveStudentDeliveryEnvelope } from "./student-app-ai-tutor-result-archive-student-delivery-envelope-audit.mjs";

describe("Student App AI Tutor result-archive student delivery envelope audit", () => {
  it("passes when a result-archive visibility review creates a student delivery envelope", async () => {
    const report = await auditStudentAppAITutorResultArchiveStudentDeliveryEnvelope(validInputs(), { generatedAt: "2026-06-09T12:40:00.000Z", probeP99Ms: 5 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_archive_student_delivery_envelope");
    assert.equal(report.runtime.sharedRuntimeId, "student_app_ai_tutor_result_student_delivery_envelope_runtime");
    assert.equal(report.safetyInvariants.studentDeliveryEnvelopeCreated, true);
    assert.equal(report.safetyInvariants.durableStudentArchivePersistenceStarted, false);
    assert.equal(report.runtimeProbes.studentAppAiTutorResultArchiveStudentDeliveryEnvelope.portCalls, 1);
  });

  it("fails when 0341 result-archive student visibility review is not ready", async () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.source0341Report);
    source.readiness = "NEEDS_REMEDIATION";
    inputs.source0341Report = JSON.stringify(source);

    const report = await auditStudentAppAITutorResultArchiveStudentDeliveryEnvelope(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0341_result_archive_student_visibility_ready").passed, false);
  });

  it("fails when runtime is not result-archive source aware", async () => {
    const inputs = validInputs();
    inputs.runtime = inputs.runtime.replaceAll("resultArchiveVisibilityReviewRuntimeId", "resultArchiveVisibilityReviewRuntimeRemoved");

    const report = await auditStudentAppAITutorResultArchiveStudentDeliveryEnvelope(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.source_aware_result_archive_delivery_envelope").passed, false);
  });

  it("fails when result-archive delivery regression tests are missing", async () => {
    const inputs = validInputs();
    inputs.runtimeTest = "records a student-visible AI Tutor result envelope while keeping durable persistence blocked";

    const report = await auditStudentAppAITutorResultArchiveStudentDeliveryEnvelope(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_result_archive_delivery_envelope_paths").passed, false);
  });

  it("fails when project hooks do not track 0342", async () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "11.59/10";

    const report = await auditStudentAppAITutorResultArchiveStudentDeliveryEnvelope(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0342").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    runtime: "tools/student-app-ai-tutor-result-student-delivery-envelope-runtime.mjs",
    runtimeTest: "tools/student-app-ai-tutor-result-student-delivery-envelope-runtime.test.mjs",
    source0341Report: "reports/student-app-ai-tutor-result-archive-student-visibility-review.current.json",
    source0338Report: "reports/student-app-ai-tutor-result-archive-controlled-answer-artifact.current.json",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0342-student-app-ai-tutor-result-archive-student-delivery-envelope.md",
  }).map(([key, relativePath]) => [key, fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : ""]));
}
