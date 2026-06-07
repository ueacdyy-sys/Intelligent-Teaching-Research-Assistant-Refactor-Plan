import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerification,
  formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-audit.mjs";

describe("Student App AI Tutor question-bank draft answer feedback archive row verification audit", () => {
  it("passes when row verification invokes the Teaching Archive row read port", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerification(currentInputs(), {
      generatedAt: "2026-06-06T14:30:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_row_verification_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveRowVerification.result;
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PHYSICAL_ROW_VERIFIED");
    assert.equal(result.teachingArchivePhysicalRow.archiveItem.id, "tarch_student_feedback_001");
    assert.equal(result.boundary.physicalDatabaseRowVerified, true);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationAudit(report), /archive row verification runtime: READY/u);
  });

  it("fails when storage commit evidence is missing or not committed", async () => {
    const inputs = currentInputs();
    const commitReport = JSON.parse(inputs.storageCommitReport);
    commitReport.runtime.status = "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED";
    inputs.storageCommitReport = JSON.stringify(commitReport);

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerification(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "storage_commit.ready_committed").passed, false);
  });

  it("fails when runtime claims raw DB, HTTP, model, leak, Swarm, or unsafe rendering", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\ndirectDatabaseAccessAllowed: true\nexecuteHttpRequestAllowed: true\nfetch(\nmodelInferenceStarted: true\nrawModelOutputDisclosed: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerification(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the Student App row verification boundary budget", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerification(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when Go repository evidence or root hooks omit row verification", async () => {
    const inputs = currentInputs();
    inputs.teachingArchiveRepositoryTest = "package postgres_test";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveRowVerification", "studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommit");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("feedback-archive-row-verification", "feedback-archive-storage-commit");
    inputs.sdd = "Student App AI Tutor feedback archive storage commit only";
    inputs.architectureBoard = "Student App AI Tutor feedback archive storage commit 10.16/10";

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerification(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "teaching_archive.repository_get_by_id_evidence_exists").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationPort.verifyTeachingArchivePhysicalRow",
      "verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRow",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_READY",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PHYSICAL_ROW_VERIFIED",
      "TeachingArchiveRowReadPort.getArchiveItemById is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "physicalDatabaseRowVerified: true",
      "mainDatabaseReadAllowed: true",
      "mainDatabaseWriteCommitted: true",
      "learnerFeedbackEvidencePreserved: true",
      "approvalEvidencePreserved: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "modelInferenceStarted: false",
      "answerKeyDisclosed: false",
      "rawModelOutputDisclosed: false",
      "swarmAllowed: false",
    ].join("\n"),
    runtimeTest: [
      "verifies the committed feedback archive item through the injected row read port",
      "uses idempotency for replay and rejects conflicting committed rows",
      "rejects missing ports, missing rows, mismatched ids, and mismatched content refs",
      "rejects wrong owner scope, direct DB or HTTP policies, Swarm, and leaked fields",
    ].join("\n"),
    storageCommitReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit.current.json", "utf8"),
    storageCommitRuntime: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED mainDatabaseWriteCommitted studentArchivePersisted safeLearnerFeedbackOnly TeachingArchiveCreateItemPort.createArchiveItem",
    storageCommitAudit: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED mainDatabaseWriteCommitted safeLearnerFeedbackOnly",
    teachingArchiveRepository: "func (r *ArchiveRepository) GetByID\nFROM teaching_archive_items\nWHERE id = $1\nscanArchiveItem",
    teachingArchiveRepositoryTest: "TestGetByIDReturnsStudentAppAiTutorFeedbackArchiveStorageCommitPhysicalRow\nsingleStudentAppFeedbackArchiveItemRow\ntarch_student_feedback_001\nstudent-ai-tutor-feedback-archive:\nstudent_app_ai_tutor",
    teachingArchiveRepositoryHelpers: "recordingDB",
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification": "node tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft answer feedback archive row verification runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveRowVerification\nstudent-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification.current.json\nstudent_app_ai_tutor_question_bank_draft_answer_feedback_archive_row_verification_runtime",
    verifyStructure: "0277-student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification.md\nstudent-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-runtime.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-runtime.test.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-audit.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-audit.test.mjs",
    sdd: "Student App AI Tutor question-bank draft answer feedback archive physical row verification TeachingArchiveRowReadPort.getArchiveItemById physicalDatabaseRowVerified=true not a JS direct database read",
    architectureBoard: "10.17/10 Student App AI Tutor question-bank draft answer feedback archive row verification STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PHYSICAL_ROW_VERIFIED",
  };
}
