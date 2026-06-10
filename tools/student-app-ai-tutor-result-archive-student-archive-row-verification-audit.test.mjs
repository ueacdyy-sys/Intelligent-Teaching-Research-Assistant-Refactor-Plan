import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorResultArchiveStudentArchiveRowVerification } from "./student-app-ai-tutor-result-archive-student-archive-row-verification-audit.mjs";

describe("Student App AI Tutor result-archive student archive row verification audit", () => {
  it("passes when 0344 result-archive storage commit verifies through the injected row read port", async () => {
    const report = await auditStudentAppAITutorResultArchiveStudentArchiveRowVerification(validInputs(), { generatedAt: "2026-06-09T14:10:00.000Z", probeP99Ms: 5 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_archive_student_archive_row_verification");
    assert.equal(report.runtime.sharedRuntimeId, "student_app_ai_tutor_result_student_archive_row_verification_runtime");
    assert.equal(report.safetyInvariants.learningActionSourceRequired, "AI_TUTOR_RESULT_ARCHIVE");
    assert.equal(report.safetyInvariants.physicalDatabaseRowVerified, true);
    assert.equal(report.runtimeProbes.studentAppAiTutorResultArchiveStudentArchiveRowVerification.portCalls, 1);
  });

  it("fails when 0344 source storage commit is not ready", async () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.source0344Report);
    source.readiness = "NEEDS_REMEDIATION";
    inputs.source0344Report = JSON.stringify(source);

    const report = await auditStudentAppAITutorResultArchiveStudentArchiveRowVerification(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0344_result_archive_storage_commit_ready").passed, false);
  });

  it("fails when shared row runtime is not result-archive source aware", async () => {
    const inputs = validInputs();
    inputs.runtime = inputs.runtime.replaceAll("resultArchiveStorageCommitWorkload", "resultArchiveStorageCommitRemoved");

    const report = await auditStudentAppAITutorResultArchiveStudentArchiveRowVerification(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.source_aware_result_archive_row_verification").passed, false);
  });

  it("fails when result-archive row verification regression tests are missing", async () => {
    const inputs = validInputs();
    inputs.runtimeTest = "verifies the committed result archive item through the injected row read port";

    const report = await auditStudentAppAITutorResultArchiveStudentArchiveRowVerification(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_result_archive_row_verification_paths").passed, false);
  });

  it("fails when project hooks do not track 0345", async () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "11.68/10";

    const report = await auditStudentAppAITutorResultArchiveStudentArchiveRowVerification(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0345").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    runtime: "tools/student-app-ai-tutor-result-student-archive-row-verification-runtime.mjs",
    runtimeTest: "tools/student-app-ai-tutor-result-student-archive-row-verification-runtime.test.mjs",
    source0344Report: "reports/student-app-ai-tutor-result-archive-student-archive-storage-commit.current.json",
    repositoryTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items_get_by_id_test.go",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0345-student-app-ai-tutor-result-archive-student-archive-row-verification.md",
  }).map(([key, relativePath]) => [key, fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : ""]));
}
