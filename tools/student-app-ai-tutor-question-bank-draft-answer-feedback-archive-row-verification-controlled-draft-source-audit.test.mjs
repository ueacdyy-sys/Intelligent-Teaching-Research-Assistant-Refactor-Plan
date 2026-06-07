import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSource,
  formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSourceAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source-audit.mjs";

describe("Student App AI Tutor question-bank draft answer feedback archive row verification controlled draft source audit", () => {
  it("passes when 0300 controlled-source storage commit is physically verified through the row read port", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSource(currentFixture());

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_row_verification_controlled_draft_source_runtime");
    assert.equal(report.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSource.status, "PASS");
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSource.result;
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PHYSICAL_ROW_VERIFIED_FROM_CONTROLLED_DRAFT_SOURCE");
    assert.equal(result.teachingArchivePhysicalRow.archiveItem.id, "tarch_student_feedback_controlled_source_001");
    assert.equal(result.boundary.sourceControlledDraftEvidencePreserved, true);
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSourceAudit(report), /P99\/errors:/u);
  });

  it("fails when the 0300 storage commit source is missing or unsafe", async () => {
    const missing = currentFixture();
    missing.storageCommitReport = "{}";
    const missingReport = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSource(missing);

    assert.equal(missingReport.readiness, "NEEDS_REMEDIATION");
    assert.equal(missingReport.findings.find((finding) => finding.id === "storage_commit_controlled_source.ready_committed").passed, false);

    const unsafe = currentFixture();
    const source = JSON.parse(unsafe.storageCommitReport);
    source.runtime.status = "STORAGE_COMMITTED";
    unsafe.storageCommitReport = JSON.stringify(source);
    const unsafeReport = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSource(unsafe);

    assert.equal(unsafeReport.readiness, "NEEDS_REMEDIATION");
    assert.equal(unsafeReport.findings.find((finding) => finding.id === "storage_commit_controlled_source.ready_committed").passed, false);
  });

  it("fails when runtime claims raw DB, HTTP, model, tool, leak, Swarm, or unsafe rendering", async () => {
    const inputs = currentFixture();
    inputs.runtime += "\nfetch(\"http://example.invalid\");\nconst x = { directDatabaseAccessAllowed: true, rawModelOutputDisclosed: true, swarmAllowed: true };\ninnerHTML = \"unsafe\";\n";

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSource(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("fails when root hooks omit controlled-source row verification", async () => {
    const inputs = currentFixture();
    inputs.qualityGate = "";
    inputs.rootWorkflowCoverage = "";
    inputs.verifyStructure = "";
    inputs.architectureBoard = "";
    inputs.sdd = "";

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSource(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentFixture() {
  return {
    runtime: fs.readFileSync("tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source-runtime.mjs", "utf8"),
    runtimeTest: fs.readFileSync("tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source-runtime.test.mjs", "utf8"),
    storageCommitReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source.current.json", "utf8"),
    storageCommitRuntime: fs.readFileSync("tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-runtime.mjs", "utf8"),
    storageCommitAudit: fs.readFileSync("tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-audit.mjs", "utf8"),
    teachingArchiveRepository: "func (r *ArchiveRepository) GetByID(ctx context.Context, id string) { FROM teaching_archive_items WHERE id = $1 scanArchiveItem }",
    teachingArchiveRepositoryTest: "TestGetByIDReturnsStudentAppAiTutorFeedbackArchiveStorageCommitControlledDraftSourcePhysicalRow singleStudentAppFeedbackArchiveControlledSourceItemRow tarch_student_feedback_controlled_source_001 student-ai-tutor-feedback-archive-controlled-draft-source: controlled_draft_source",
    teachingArchiveRepositoryHelpers: "recordingDB",
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source": "node tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft answer feedback archive row verification controlled draft source runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSource student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source.current.json student_app_ai_tutor_question_bank_draft_answer_feedback_archive_row_verification_controlled_draft_source_runtime",
    verifyStructure: "0301-student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source.md tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source-runtime.mjs tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source-audit.test.mjs",
    architectureBoard: "10.41/10 STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PHYSICAL_ROW_VERIFIED_FROM_CONTROLLED_DRAFT_SOURCE",
    sdd: "0301 Student App AI Tutor question-bank draft answer feedback archive row verification controlled draft source",
  };
}
