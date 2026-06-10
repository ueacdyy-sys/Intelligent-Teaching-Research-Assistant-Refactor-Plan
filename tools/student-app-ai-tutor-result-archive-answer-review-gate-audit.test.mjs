import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorResultArchiveAnswerReviewGate,
  formatStudentAppAITutorResultArchiveAnswerReviewGateAudit,
} from "./student-app-ai-tutor-result-archive-answer-review-gate-audit.mjs";

describe("Student App AI Tutor result-archive answer review gate audit", () => {
  it("passes when a result-archive controlled artifact enters the shared review gate", async () => {
    const report = await auditStudentAppAITutorResultArchiveAnswerReviewGate(validInputs(), {
      generatedAt: "2026-06-09T11:45:00.000Z",
      probeP99Ms: 6,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ANSWER_REVIEW_GATE");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_archive_answer_review_gate");
    assert.equal(report.runtime.sharedRuntimeId, "student_app_ai_tutor_answer_review_gate_runtime");
    assert.equal(report.runtime.status, "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ANSWER_REVIEW_GATE_RECORDED");
    assert.equal(report.runtimeSlo.p99Ms, 6);
    assert.equal(report.runtimeProbes.studentAppAiTutorResultArchiveAnswerReviewGate.portSawGuidanceText, false);
    assert.equal(report.safetyInvariants.studentVisiblePublished, false);
    assert.match(formatStudentAppAITutorResultArchiveAnswerReviewGateAudit(report), /result-archive answer review gate: READY/u);
  });

  it("fails when 0338 source controlled artifact evidence is not ready", async () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.source0338Report);
    source.readiness = "NEEDS_REMEDIATION";
    source.runtimeSlo.totalErrors = 1;
    inputs.source0338Report = JSON.stringify(source);

    const report = await auditStudentAppAITutorResultArchiveAnswerReviewGate(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0338_result_archive_controlled_artifact_ready").passed, false);
  });

  it("fails when the shared review runtime is not result-archive aware", async () => {
    const inputs = validInputs();
    inputs.runtime = inputs.runtime.replaceAll("sourceResultArchiveArtifactRuntimeId", "sourceArtifactRuntimeId");

    const report = await auditStudentAppAITutorResultArchiveAnswerReviewGate(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.accepts_result_archive_controlled_artifact_for_review").passed, false);
  });

  it("fails when result-archive review regression tests are absent", async () => {
    const inputs = validInputs();
    inputs.runtimeTest = "records a human review gate without result persistence or student visibility";

    const report = await auditStudentAppAITutorResultArchiveAnswerReviewGate(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_result_archive_answer_review_paths").passed, false);
  });

  it("fails when root hooks do not track 0339", async () => {
    const inputs = validInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = "";
    inputs.architectureBoard = "11.50/10";

    const report = await auditStudentAppAITutorResultArchiveAnswerReviewGate(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0339").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    runtime: "tools/student-app-ai-tutor-answer-review-gate-runtime.mjs",
    runtimeTest: "tools/student-app-ai-tutor-answer-review-gate-runtime.test.mjs",
    source0338Report: "reports/student-app-ai-tutor-result-archive-controlled-answer-artifact.current.json",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0339-student-app-ai-tutor-result-archive-answer-review-gate.md",
  }).map(([key, relativePath]) => [key, fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : ""]));
}
