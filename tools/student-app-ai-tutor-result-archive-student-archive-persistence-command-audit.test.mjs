import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorResultArchiveStudentArchivePersistenceCommand } from "./student-app-ai-tutor-result-archive-student-archive-persistence-command-audit.mjs";

describe("Student App AI Tutor result-archive student archive persistence command audit", () => {
  it("passes when 0342 result-archive delivery records an append-only archive command", () => {
    const report = auditStudentAppAITutorResultArchiveStudentArchivePersistenceCommand(validInputs(), { generatedAt: "2026-06-09T13:10:00.000Z", probeP99Ms: 5 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_archive_student_archive_persistence_command");
    assert.equal(report.runtime.sharedRuntimeId, "student_app_ai_tutor_result_student_archive_persistence_command_runtime");
    assert.equal(report.safetyInvariants.learningActionSourceRequired, "AI_TUTOR_RESULT_ARCHIVE");
    assert.equal(report.safetyInvariants.studentArchivePersistenceCommandRecorded, true);
    assert.equal(report.safetyInvariants.durableStudentArchiveCommitStarted, false);
  });

  it("fails when 0342 result-archive student delivery envelope is not ready", () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.source0342Report);
    source.readiness = "NEEDS_REMEDIATION";
    inputs.source0342Report = JSON.stringify(source);

    const report = auditStudentAppAITutorResultArchiveStudentArchivePersistenceCommand(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0342_result_archive_student_delivery_envelope_ready").passed, false);
  });

  it("fails when shared runtime is not result-archive archive-command source aware", () => {
    const inputs = validInputs();
    inputs.runtime = inputs.runtime.replaceAll("resultArchiveDeliveryWorkloadType", "resultArchiveDeliveryWorkloadRemoved");

    const report = auditStudentAppAITutorResultArchiveStudentArchivePersistenceCommand(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.source_aware_result_archive_archive_persistence_command").passed, false);
  });

  it("fails when result-archive archive-command regression tests are missing", () => {
    const inputs = validInputs();
    inputs.runtimeTest = "records an append-only AI Tutor result archive persistence command without durable commit";

    const report = auditStudentAppAITutorResultArchiveStudentArchivePersistenceCommand(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_result_archive_archive_persistence_paths").passed, false);
  });

  it("fails when project hooks do not track 0343", () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "11.62/10";

    const report = auditStudentAppAITutorResultArchiveStudentArchivePersistenceCommand(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0343").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    runtime: "tools/student-app-ai-tutor-result-student-archive-persistence-command-runtime.mjs",
    runtimeTest: "tools/student-app-ai-tutor-result-student-archive-persistence-command-runtime.test.mjs",
    source0342Report: "reports/student-app-ai-tutor-result-archive-student-delivery-envelope.current.json",
    source0338Report: "reports/student-app-ai-tutor-result-archive-controlled-answer-artifact.current.json",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0343-student-app-ai-tutor-result-archive-student-archive-persistence-command.md",
  }).map(([key, relativePath]) => [key, fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : ""]));
}
