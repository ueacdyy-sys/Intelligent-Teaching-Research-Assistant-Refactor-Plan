import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorQuestionBankFeedbackStudentArchiveRowVerification } from "./student-app-ai-tutor-question-bank-feedback-student-archive-row-verification-audit.mjs";

describe("Student App AI Tutor question-bank-feedback student archive row verification audit", () => {
  it("passes when 0378 question-bank-feedback storage commit verifies through the injected row read port", async () => {
    const report = await auditStudentAppAITutorQuestionBankFeedbackStudentArchiveRowVerification(validInputs(), { generatedAt: "2026-06-11T17:05:00.000Z", probeP99Ms: 5 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_feedback_student_archive_row_verification");
    assert.equal(report.runtime.sharedRuntimeId, "student_app_ai_tutor_result_student_archive_row_verification_runtime");
    assert.equal(report.safetyInvariants.learningActionSourceRequired, "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK");
    assert.equal(report.safetyInvariants.feedbackStatusRequired, "READY_FOR_STUDENT_APP_READ");
    assert.equal(report.safetyInvariants.physicalDatabaseRowVerified, true);
    assert.equal(report.runtimeProbes.studentAppAiTutorQuestionBankFeedbackStudentArchiveRowVerification.portCalls, 1);
  });

  it("fails when 0378 source storage commit is not ready", async () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.source0378Report);
    source.readiness = "NEEDS_REMEDIATION";
    inputs.source0378Report = JSON.stringify(source);

    const report = await auditStudentAppAITutorQuestionBankFeedbackStudentArchiveRowVerification(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0378_question_bank_feedback_storage_commit_ready").passed, false);
  });

  it("fails when shared row runtime is not question-bank-feedback source aware", async () => {
    const inputs = validInputs();
    inputs.runtime = inputs.runtime.replaceAll("questionBankFeedbackStorageCommitWorkload", "questionBankFeedbackStorageCommitRemoved");

    const report = await auditStudentAppAITutorQuestionBankFeedbackStudentArchiveRowVerification(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.source_aware_question_bank_feedback_row_verification").passed, false);
  });

  it("fails when question-bank-feedback row verification regression tests are missing", async () => {
    const inputs = validInputs();
    inputs.runtimeTest = "verifies the committed result archive item through the injected row read port";

    const report = await auditStudentAppAITutorQuestionBankFeedbackStudentArchiveRowVerification(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_question_bank_feedback_row_verification_paths").passed, false);
  });

  it("fails when project hooks do not track 0379", async () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "12.70/10";

    const report = await auditStudentAppAITutorQuestionBankFeedbackStudentArchiveRowVerification(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0379").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    runtime: "tools/student-app-ai-tutor-result-student-archive-row-verification-runtime.mjs",
    runtimeTest: "tools/student-app-ai-tutor-result-student-archive-row-verification-runtime.test.mjs",
    source0378Report: "reports/student-app-ai-tutor-question-bank-feedback-student-archive-storage-commit.current.json",
    repositoryTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items_get_by_id_test.go",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0379-student-app-ai-tutor-question-bank-feedback-student-archive-row-verification.md",
  }).map(([key, relativePath]) => [key, fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : ""]));
}
