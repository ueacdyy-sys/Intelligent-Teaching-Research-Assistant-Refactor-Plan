import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorResultArchiveStudentArchiveStorageCommit } from "./student-app-ai-tutor-result-archive-student-archive-storage-commit-audit.mjs";

describe("Student App AI Tutor result-archive student archive storage commit audit", () => {
  it("passes when 0343 result-archive command commits through the injected storage port", async () => {
    const report = await auditStudentAppAITutorResultArchiveStudentArchiveStorageCommit(validInputs(), { generatedAt: "2026-06-09T13:40:00.000Z", probeP99Ms: 5 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_archive_student_archive_storage_commit");
    assert.equal(report.runtime.sharedRuntimeId, "student_app_ai_tutor_result_student_archive_storage_commit_runtime");
    assert.equal(report.safetyInvariants.learningActionSourceRequired, "AI_TUTOR_RESULT_ARCHIVE");
    assert.equal(report.safetyInvariants.studentArchivePersisted, true);
    assert.equal(report.runtimeProbes.studentAppAiTutorResultArchiveStudentArchiveStorageCommit.portCalls, 1);
  });

  it("fails when 0343 source command is not ready", async () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.source0343Report);
    source.readiness = "NEEDS_REMEDIATION";
    inputs.source0343Report = JSON.stringify(source);

    const report = await auditStudentAppAITutorResultArchiveStudentArchiveStorageCommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0343_result_archive_archive_persistence_command_ready").passed, false);
  });

  it("fails when shared storage runtime is not result-archive source aware", async () => {
    const inputs = validInputs();
    inputs.runtime = inputs.runtime.replaceAll("resultArchiveSourceWorkloadType", "resultArchiveSourceWorkloadRemoved");

    const report = await auditStudentAppAITutorResultArchiveStudentArchiveStorageCommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.source_aware_result_archive_storage_commit").passed, false);
  });

  it("fails when result-archive storage commit regression tests are missing", async () => {
    const inputs = validInputs();
    inputs.runtimeTest = "commits safe AI Tutor result guidance into Teaching Archive through the injected use case port";

    const report = await auditStudentAppAITutorResultArchiveStudentArchiveStorageCommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_result_archive_storage_commit_paths").passed, false);
  });

  it("fails when project hooks do not track 0344", async () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "11.65/10";

    const report = await auditStudentAppAITutorResultArchiveStudentArchiveStorageCommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0344").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    runtime: "tools/student-app-ai-tutor-result-student-archive-storage-commit-runtime.mjs",
    runtimeTest: "tools/student-app-ai-tutor-result-student-archive-storage-commit-runtime.test.mjs",
    source0343Report: "reports/student-app-ai-tutor-result-archive-student-archive-persistence-command.current.json",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0344-student-app-ai-tutor-result-archive-student-archive-storage-commit.md",
  }).map(([key, relativePath]) => [key, fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : ""]));
}
