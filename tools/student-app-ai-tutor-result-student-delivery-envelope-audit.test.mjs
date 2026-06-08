import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorResultStudentDeliveryEnvelope,
  formatStudentAppAITutorResultStudentDeliveryEnvelopeAudit,
} from "./student-app-ai-tutor-result-student-delivery-envelope-audit.mjs";

describe("Student App AI Tutor result student delivery envelope audit", () => {
  it("passes when student delivery envelope consumes visibility review and controlled guidance", async () => {
    const report = await auditStudentAppAITutorResultStudentDeliveryEnvelope(validInputs(), {
      generatedAt: "2026-06-08T11:10:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_student_delivery_envelope_runtime");
    assert.equal(report.safetyInvariants.studentDeliveryEnvelopeCreated, true);
    assert.equal(report.safetyInvariants.studentVisiblePublished, true);
    assert.equal(report.safetyInvariants.durableStudentArchivePersistenceStarted, false);
    assert.equal(report.runtimeProbes.studentAppAiTutorResultStudentDeliveryEnvelope.portCalls, 1);
    assert.match(formatStudentAppAITutorResultStudentDeliveryEnvelopeAudit(report), /delivery envelope runtime: READY/u);
  });

  it("fails when 0328 visibility review is not ready", async () => {
    const inputs = validInputs();
    const visibility = JSON.parse(inputs.studentVisibilityReviewReport);
    visibility.readiness = "NEEDS_REMEDIATION";
    inputs.studentVisibilityReviewReport = JSON.stringify(visibility);

    const report = await auditStudentAppAITutorResultStudentDeliveryEnvelope(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0328_student_visibility_review_ready").passed, false);
  });

  it("fails when controlled answer artifact hash no longer matches visibility review", async () => {
    const inputs = validInputs();
    const artifact = JSON.parse(inputs.controlledAnswerArtifactReport);
    artifact.runtimeProbes.studentAppAiTutorControlledAnswerArtifact.result.controlledAnswerArtifact.guidanceSections[0].text = "Changed safe guidance.";
    inputs.controlledAnswerArtifactReport = JSON.stringify(artifact);

    const report = await auditStudentAppAITutorResultStudentDeliveryEnvelope(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0325_controlled_answer_hash_matches_visibility_review").passed, false);
  });

  it("fails when runtime claims persistence, unsafe execution, or leaked fields", async () => {
    const inputs = validInputs();
    inputs.runtime += "\ndurableStudentArchivePersistenceStarted: true\nmainDatabaseWriteStarted: true\nmodelInferenceAllowed: true\nswarmAllowed: true\ninnerHTML\n";

    const report = await auditStudentAppAITutorResultStudentDeliveryEnvelope(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.visible_envelope_without_persistence_or_unsafe_execution").passed, false);
  });

  it("fails when negative runtime tests or project hooks omit 0329", async () => {
    const missingTests = validInputs();
    missingTests.runtimeTest = "records a student-visible AI Tutor result envelope while keeping durable persistence blocked";
    let report = await auditStudentAppAITutorResultStudentDeliveryEnvelope(missingTests);
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_delivery_envelope_negative_paths").passed, false);

    const missingHooks = validInputs();
    missingHooks.qualityGate = "";
    missingHooks.architectureBoard = "11.20/10";
    report = await auditStudentAppAITutorResultStudentDeliveryEnvelope(missingHooks);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_and_board_track_runtime").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    runtime: "tools/student-app-ai-tutor-result-student-delivery-envelope-runtime.mjs",
    runtimeTest: "tools/student-app-ai-tutor-result-student-delivery-envelope-runtime.test.mjs",
    studentVisibilityReviewReport: "reports/student-app-ai-tutor-result-student-visibility-review.current.json",
    controlledAnswerArtifactReport: "reports/student-app-ai-tutor-controlled-answer-artifact.current.json",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0329-student-app-ai-tutor-result-student-delivery-envelope.md",
  }).map(([key, relativePath]) => [key, fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : ""]));
}
