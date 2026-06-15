import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorQuestionBankFeedbackStudentArchiveStorageCommit } from "./student-app-ai-tutor-question-bank-feedback-student-archive-storage-commit-audit.mjs";

describe("Student App AI Tutor question-bank-feedback student archive storage commit audit", () => {
  it("passes when 0377 question-bank-feedback command commits through the injected storage port", async () => {
    const report = await auditStudentAppAITutorQuestionBankFeedbackStudentArchiveStorageCommit(validInputs(), { generatedAt: "2026-06-11T16:45:00.000Z", probeP99Ms: 5 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_feedback_student_archive_storage_commit");
    assert.equal(report.runtime.sharedRuntimeId, "student_app_ai_tutor_result_student_archive_storage_commit_runtime");
    assert.equal(report.safetyInvariants.learningActionSourceRequired, "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK");
    assert.equal(report.safetyInvariants.feedbackStatusRequired, "READY_FOR_STUDENT_APP_READ");
    assert.equal(report.safetyInvariants.studentArchivePersisted, true);
    assert.equal(report.runtimeProbes.studentAppAiTutorQuestionBankFeedbackStudentArchiveStorageCommit.portCalls, 1);
  });

  it("fails when 0377 source command is not ready", async () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.source0377Report);
    source.readiness = "NEEDS_REMEDIATION";
    inputs.source0377Report = JSON.stringify(source);

    const report = await auditStudentAppAITutorQuestionBankFeedbackStudentArchiveStorageCommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0377_question_bank_feedback_archive_persistence_command_ready").passed, false);
  });

  it("fails when shared storage runtime is not question-bank-feedback source aware", async () => {
    const inputs = validInputs();
    inputs.runtime = inputs.runtime.replaceAll("questionBankFeedbackSourceWorkloadType", "questionBankFeedbackSourceWorkloadRemoved");

    const report = await auditStudentAppAITutorQuestionBankFeedbackStudentArchiveStorageCommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.source_aware_question_bank_feedback_storage_commit").passed, false);
  });

  it("fails when question-bank-feedback storage commit regression tests are missing", async () => {
    const inputs = validInputs();
    inputs.runtimeTest = "commits safe AI Tutor result guidance into Teaching Archive through the injected use case port";

    const report = await auditStudentAppAITutorQuestionBankFeedbackStudentArchiveStorageCommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_question_bank_feedback_storage_commit_paths").passed, false);
  });

  it("fails when project hooks do not track 0378", async () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "12.67/10";

    const report = await auditStudentAppAITutorQuestionBankFeedbackStudentArchiveStorageCommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0378").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    runtime: "tools/student-app-ai-tutor-result-student-archive-storage-commit-runtime.mjs",
    runtimeTest: "tools/student-app-ai-tutor-result-student-archive-storage-commit-runtime.test.mjs",
    source0377Report: "reports/student-app-ai-tutor-question-bank-feedback-student-archive-persistence-command.current.json",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0378-student-app-ai-tutor-question-bank-feedback-student-archive-storage-commit.md",
  }).map(([key, relativePath]) => [key, fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : ""]));
}
