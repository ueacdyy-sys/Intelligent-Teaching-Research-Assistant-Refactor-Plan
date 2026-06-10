import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorResultArchiveStudentArchiveRender } from "./student-app-ai-tutor-result-archive-student-archive-render-audit.mjs";

describe("Student App AI Tutor result-archive student archive render audit", () => {
  it("passes when 0346 result-archive read renders safe text blocks through the injected product render port", async () => {
    const report = await auditStudentAppAITutorResultArchiveStudentArchiveRender(validInputs(), { generatedAt: "2026-06-09T15:20:00.000Z", probeP99Ms: 5 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_archive_student_archive_render");
    assert.equal(report.runtime.sharedRuntimeId, "student_app_ai_tutor_result_student_archive_render_runtime");
    assert.equal(report.safetyInvariants.learningActionSourceRequired, "AI_TUTOR_RESULT_ARCHIVE");
    assert.equal(report.safetyInvariants.studentVisibleRenderEnvelopeVerified, true);
    assert.equal(report.runtimeProbes.studentAppAiTutorResultArchiveStudentArchiveRender.portCalls, 1);
  });

  it("fails when 0346 source read is not ready", async () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.source0346Report);
    source.readiness = "NEEDS_REMEDIATION";
    inputs.source0346Report = JSON.stringify(source);

    const report = await auditStudentAppAITutorResultArchiveStudentArchiveRender(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0346_result_archive_read_ready").passed, false);
  });

  it("fails when shared render runtime is not result-archive source aware", async () => {
    const inputs = validInputs();
    inputs.runtime = inputs.runtime.replaceAll("resultArchiveReadWorkload", "resultArchiveReadRemoved");

    const report = await auditStudentAppAITutorResultArchiveStudentArchiveRender(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.source_aware_result_archive_render").passed, false);
  });

  it("fails when result-archive render regression tests are missing", async () => {
    const inputs = validInputs();
    inputs.runtimeTest = "renders a safe student-visible result envelope through the injected product render port";

    const report = await auditStudentAppAITutorResultArchiveStudentArchiveRender(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_result_archive_render_wrapper_paths").passed, false);
  });

  it("fails when project hooks do not track 0347", async () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "11.74/10";

    const report = await auditStudentAppAITutorResultArchiveStudentArchiveRender(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0347").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    runtime: "tools/student-app-ai-tutor-result-student-archive-render-runtime.mjs",
    runtimeTest: "tools/student-app-ai-tutor-result-student-archive-render-runtime.test.mjs",
    source0346Report: "reports/student-app-ai-tutor-result-archive-student-archive-read.current.json",
    usecaseTest: "services/teaching-archive-gateway/internal/usecase/render_student_app_ai_tutor_result_archive_test.go",
    httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_result_archive_read_test.go",
    openApiRoot: "contracts/openapi/teaching-archive.yaml",
    openApiPath: "contracts/openapi/teaching-archive.student-app-archive-item-ai-tutor-result-rendered.path.yaml",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0347-student-app-ai-tutor-result-archive-student-archive-render.md",
  }).map(([key, relativePath]) => [key, fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : ""]));
}
