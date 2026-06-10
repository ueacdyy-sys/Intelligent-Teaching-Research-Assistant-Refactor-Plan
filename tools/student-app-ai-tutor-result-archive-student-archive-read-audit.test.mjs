import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorResultArchiveStudentArchiveRead } from "./student-app-ai-tutor-result-archive-student-archive-read-audit.mjs";

describe("Student App AI Tutor result-archive student archive read audit", () => {
  it("passes when 0345 result-archive row verification reads a safe card through the injected product read port", async () => {
    const report = await auditStudentAppAITutorResultArchiveStudentArchiveRead(validInputs(), { generatedAt: "2026-06-09T14:40:00.000Z", probeP99Ms: 5 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_archive_student_archive_read");
    assert.equal(report.runtime.sharedRuntimeId, "student_app_ai_tutor_result_student_archive_read_runtime");
    assert.equal(report.safetyInvariants.learningActionSourceRequired, "AI_TUTOR_RESULT_ARCHIVE");
    assert.equal(report.safetyInvariants.studentVisibleResultCardReadVerified, true);
    assert.equal(report.runtimeProbes.studentAppAiTutorResultArchiveStudentArchiveRead.portCalls, 1);
  });

  it("fails when 0345 source row verification is not ready", async () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.source0345Report);
    source.readiness = "NEEDS_REMEDIATION";
    inputs.source0345Report = JSON.stringify(source);

    const report = await auditStudentAppAITutorResultArchiveStudentArchiveRead(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0345_result_archive_row_verification_ready").passed, false);
  });

  it("fails when shared read runtime is not result-archive source aware", async () => {
    const inputs = validInputs();
    inputs.runtime = inputs.runtime.replaceAll("resultArchiveRowVerificationWorkload", "resultArchiveRowVerificationRemoved");

    const report = await auditStudentAppAITutorResultArchiveStudentArchiveRead(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.source_aware_result_archive_read").passed, false);
  });

  it("fails when result-archive read regression tests are missing", async () => {
    const inputs = validInputs();
    inputs.runtimeTest = "reads a safe student-visible result card through the injected product read port";

    const report = await auditStudentAppAITutorResultArchiveStudentArchiveRead(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_result_archive_read_wrapper_paths").passed, false);
  });

  it("fails when project hooks do not track 0346", async () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "11.71/10";

    const report = await auditStudentAppAITutorResultArchiveStudentArchiveRead(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0346").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    runtime: "tools/student-app-ai-tutor-result-student-archive-read-runtime.mjs",
    runtimeTest: "tools/student-app-ai-tutor-result-student-archive-read-runtime.test.mjs",
    source0345Report: "reports/student-app-ai-tutor-result-archive-student-archive-row-verification.current.json",
    usecaseTest: "services/teaching-archive-gateway/internal/usecase/read_student_app_ai_tutor_result_archive_test.go",
    httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_result_archive_read_test.go",
    openApiRoot: "contracts/openapi/teaching-archive.yaml",
    openApiPath: "contracts/openapi/teaching-archive.student-app-archive-item-ai-tutor-result.path.yaml",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0346-student-app-ai-tutor-result-archive-student-archive-read.md",
  }).map(([key, relativePath]) => [key, fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : ""]));
}
