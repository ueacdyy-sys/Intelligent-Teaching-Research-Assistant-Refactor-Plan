import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorAnswerReviewGate } from "./student-app-ai-tutor-answer-review-gate-audit.mjs";

describe("Student App AI Tutor answer review gate audit", () => {
  it("passes when runtime records a human review gate", async () => {
    const report = await auditStudentAppAITutorAnswerReviewGate(validInputs(), {
      generatedAt: "2026-06-08T09:10:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_answer_review_gate_runtime");
    assert.equal(report.safetyInvariants.tutoringResultRecorded, false);
    assert.equal(report.runtimeProbes.studentAppAiTutorAnswerReviewGate.portSawGuidanceText, false);
  });

  it("fails when 0325 source controlled answer artifact is not ready", async () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.controlledAnswerArtifactReport);
    source.readiness = "NEEDS_REMEDIATION";
    inputs.controlledAnswerArtifactReport = JSON.stringify(source);

    const report = await auditStudentAppAITutorAnswerReviewGate(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0325_controlled_answer_artifact_ready").passed, false);
  });

  it("fails when runtime claims persistence, visibility, or guidance text leakage", async () => {
    const inputs = validInputs();
    inputs.runtime += "\nguidanceTextSentToPort: true\nresultPersistenceStarted: true\nstudentVisiblePublished: true\n";

    const report = await auditStudentAppAITutorAnswerReviewGate(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("fails when negative runtime tests are missing", async () => {
    const inputs = validInputs();
    inputs.runtimeTest = "records a human review gate without result persistence or student visibility";

    const report = await auditStudentAppAITutorAnswerReviewGate(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_answer_review_gate_negative_paths").passed, false);
  });

  it("fails when project hooks do not track 0326", async () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "11.11/10";

    const report = await auditStudentAppAITutorAnswerReviewGate(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    runtime: "tools/student-app-ai-tutor-answer-review-gate-runtime.mjs",
    runtimeTest: "tools/student-app-ai-tutor-answer-review-gate-runtime.test.mjs",
    controlledAnswerArtifactReport: "reports/student-app-ai-tutor-controlled-answer-artifact.current.json",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    architectureBoard: "architecture-board.html",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    sdd: "docs/sdd/0326-student-app-ai-tutor-answer-review-gate.md",
  }).map(([key, relativePath]) => [key, fs.readFileSync(path.join(root, relativePath), "utf8")]));
}
