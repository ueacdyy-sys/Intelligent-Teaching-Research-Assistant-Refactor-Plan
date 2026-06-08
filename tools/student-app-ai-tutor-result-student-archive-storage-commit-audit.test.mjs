import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorResultStudentArchiveStorageCommit,
  formatStudentAppAITutorResultStudentArchiveStorageCommitAudit,
} from "./student-app-ai-tutor-result-student-archive-storage-commit-audit.mjs";

describe("Student App AI Tutor result student archive storage commit audit", () => {
  it("passes when storage commit invokes the Teaching Archive use case port and persists safe guidance", async () => {
    const report = await auditStudentAppAITutorResultStudentArchiveStorageCommit(validInputs(), {
      generatedAt: "2026-06-08T12:20:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_student_archive_storage_commit_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorResultStudentArchiveStorageCommit.result;
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMITTED");
    assert.equal(result.teachingArchiveCommit.archiveItem.id, "tarch_student_ai_tutor_result_001");
    assert.equal(result.boundary.mainDatabaseWriteCommitted, true);
    assert.match(formatStudentAppAITutorResultStudentArchiveStorageCommitAudit(report), /archive storage commit runtime: READY/u);
  });

  it("fails when the 0330 source command is not ready or already committed", async () => {
    const inputs = validInputs();
    const commandReport = JSON.parse(inputs.persistenceCommandReport);
    commandReport.runtime.status = "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMITTED";
    inputs.persistenceCommandReport = JSON.stringify(commandReport);

    const report = await auditStudentAppAITutorResultStudentArchiveStorageCommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0330_archive_persistence_command_ready_not_committed").passed, false);
  });

  it("fails when runtime claims raw DB, HTTP, retrieval, model, leak, Swarm, or unsafe rendering", async () => {
    const inputs = validInputs();
    inputs.runtime += "\ndirectDatabaseAccessAllowed: true\nexecuteHttpRequestAllowed: true\nfetch(\nretrievalStarted: true\nmodelInferenceStarted: true\nrawModelOutputDisclosed: true\nswarmAllowed: true\ninnerHTML\n";

    const report = await auditStudentAppAITutorResultStudentArchiveStorageCommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the Student App result storage commit budget", async () => {
    const report = await auditStudentAppAITutorResultStudentArchiveStorageCommit(validInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when Go bridge or root hooks omit storage commit", async () => {
    const inputs = validInputs();
    inputs.teachingArchiveUsecaseTest = "package usecase_test";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("studentAppAiTutorResultStudentArchiveStorageCommit", "studentAppAiTutorResultStudentArchivePersistenceCommand");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("student-archive-storage-commit", "student-archive-persistence-command");
    inputs.rootTrace = "SDD 0330 only";
    inputs.sdd = "Student App AI Tutor result archive persistence command only";
    inputs.architectureBoard = "11.26/10";

    const report = await auditStudentAppAITutorResultStudentArchiveStorageCommit(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "teaching_archive.use_case_bridge_exists").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_and_board_track_runtime").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    runtime: "tools/student-app-ai-tutor-result-student-archive-storage-commit-runtime.mjs",
    runtimeTest: "tools/student-app-ai-tutor-result-student-archive-storage-commit-runtime.test.mjs",
    persistenceCommandReport: "reports/student-app-ai-tutor-result-student-archive-persistence-command.current.json",
    persistenceCommandRuntime: "tools/student-app-ai-tutor-result-student-archive-persistence-command-runtime.mjs",
    teachingArchiveUsecase: "services/teaching-archive-gateway/internal/usecase/create_archive_item.go",
    teachingArchiveUsecaseTest: "services/teaching-archive-gateway/internal/usecase/create_archive_item_test.go",
    teachingArchivePrincipalTest: "services/teaching-archive-gateway/internal/usecase/principal_test.go",
    teachingArchiveRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items.go",
    teachingArchiveSql: "contracts/sql/teaching-archive.sql",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0331-student-app-ai-tutor-result-student-archive-storage-commit.md",
  }).map(([key, relativePath]) => [key, fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : ""]));
}
