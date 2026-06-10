import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorResultArchiveStudentArchiveLearningActions } from "./student-app-ai-tutor-result-archive-student-archive-learning-actions-audit.mjs";

describe("Student App AI Tutor result-archive student archive learning actions audit", () => {
  it("passes when 0347 result-archive render exposes safe queue actions", async () => {
    const report = await auditStudentAppAITutorResultArchiveStudentArchiveLearningActions(validInputs(), { generatedAt: "2026-06-09T15:35:00.000Z", probeP99Ms: 5 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_archive_student_archive_learning_actions");
    assert.equal(report.runtime.sharedRuntimeId, "student_app_ai_tutor_result_student_archive_learning_actions_runtime");
    assert.equal(report.safetyInvariants.learningActionSourceRequired, "AI_TUTOR_RESULT_ARCHIVE");
    assert.equal(report.runtimeProbes.studentAppAiTutorResultArchiveStudentArchiveLearningActions.portCalls, 1);
  });

  it("fails when 0347 source render is not ready", async () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.source0347Report);
    source.readiness = "NEEDS_REMEDIATION";
    inputs.source0347Report = JSON.stringify(source);

    const report = await auditStudentAppAITutorResultArchiveStudentArchiveLearningActions(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0347_result_archive_render_ready").passed, false);
  });

  it("fails when shared learning-actions runtime is not result-archive render aware", async () => {
    const inputs = validInputs();
    inputs.runtime = inputs.runtime.replaceAll("resultArchiveRenderWorkload", "resultArchiveRenderRemoved");

    const report = await auditStudentAppAITutorResultArchiveStudentArchiveLearningActions(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.source_aware_result_archive_learning_actions").passed, false);
  });

  it("fails when wrapper regression tests are missing", async () => {
    const inputs = validInputs();
    inputs.runtimeTest = "reads safe result-archive learning actions through the injected product port";
    inputs.httpTest = "TestReadStudentAppAITutorResultArchiveLearningActionsReturnsSafeActionSources";

    const report = await auditStudentAppAITutorResultArchiveStudentArchiveLearningActions(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_result_archive_learning_actions_wrapper").passed, false);
  });

  it("fails when project hooks do not track 0348", async () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "11.77/10";

    const report = await auditStudentAppAITutorResultArchiveStudentArchiveLearningActions(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0348").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    runtime: "tools/student-app-ai-tutor-result-student-archive-learning-actions-runtime.mjs",
    runtimeTest: "tools/student-app-ai-tutor-result-student-archive-learning-actions-runtime.test.mjs",
    source0347Report: "reports/student-app-ai-tutor-result-archive-student-archive-render.current.json",
    httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_result_archive_read_test.go",
    openApiRoot: "contracts/openapi/teaching-archive.yaml",
    openApiPath: "contracts/openapi/teaching-archive.student-app-archive-item-ai-tutor-result-learning-actions.path.yaml",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0348-student-app-ai-tutor-result-archive-student-archive-learning-actions.md",
  }).map(([key, relativePath]) => [key, fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : ""]));
}
