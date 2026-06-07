import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommit,
  formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-audit.mjs";

describe("Student App AI Tutor question-bank draft answer feedback archive storage commit audit", () => {
  it("passes when commit invokes the Teaching Archive use case port and persists safe feedback", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommit(currentInputs(), {
      generatedAt: "2026-06-06T14:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_storage_commit_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommit.result;
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED");
    assert.equal(result.teachingArchiveCommit.archiveItem.id, "tarch_student_feedback_001");
    assert.equal(result.boundary.mainDatabaseWriteCommitted, true);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitAudit(report), /archive storage commit runtime: READY/u);
  });

  it("fails when source command evidence is missing or unsafe", async () => {
    const inputs = currentInputs();
    const commandReport = JSON.parse(inputs.persistenceCommandReport);
    commandReport.runtime.status = "COMMITTED";
    inputs.persistenceCommandReport = JSON.stringify(commandReport);

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "persistence_command.ready_not_committed").passed, false);
  });

  it("fails when runtime claims raw DB, HTTP, model, tool, leak, Swarm, or unsafe rendering", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\ndirectDatabaseAccessAllowed: true\nexecuteHttpRequestAllowed: true\nfetch(\nmodelInferenceStarted: true\nrawModelOutputDisclosed: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the Student App durable commit boundary budget", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommit(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when Go bridge or root hooks omit storage commit", async () => {
    const inputs = currentInputs();
    inputs.teachingArchiveUsecaseTest = "package usecase_test";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommit", "studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("feedback-archive-storage-commit", "feedback-archive-persistence-command");
    inputs.sdd = "Student App AI Tutor feedback archive persistence command only";
    inputs.architectureBoard = "Student App AI Tutor feedback archive persistence command 10.15/10";

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommit(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "teaching_archive.use_case_bridge_exists").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitPort.commitTeachingArchiveCreateCommand",
      "commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorage",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_READY",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED",
      "TeachingArchiveCreateItemPort.createArchiveItem is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "AGENT_INTERNAL",
      "STUDENT_ARCHIVE_WRITE",
      "STUDENT_ASSIGNED_READ",
      "mainDatabaseWritePrepared: true",
      "mainDatabaseWriteStarted: true",
      "mainDatabaseWriteCommitted: true",
      "studentArchivePersisted: true",
      "safeLearnerFeedbackOnly: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "modelInferenceStarted: false",
      "swarmAllowed: false",
    ].join("\n"),
    runtimeTest: [
      "commits safe feedback into Teaching Archive through the injected use case port",
      "uses idempotency for replay and rejects conflicting storage commits",
      "rejects missing ports, accepted writes, invalid archive ids, and unsafe feedback text",
      "rejects direct DB or HTTP policies, student scope mismatch, Swarm, and leaked fields",
    ].join("\n"),
    persistenceCommandReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command.current.json", "utf8"),
    persistenceCommandRuntime: "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND scoreSummary learnerFeedback NOT_COMMITTED_TO_STUDENT_ARCHIVE durableStudentArchiveCommitStarted: false studentArchivePersisted: false",
    persistenceCommandAudit: "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED scoreSummary learnerFeedback",
    teachingArchiveUsecase: "func (uc *CreateArchiveItem) ExecuteWithPersistence\ntype ArchiveRepository interface\nPersistenceStatusPersisted",
    teachingArchiveUsecaseTest: "TestCreateArchiveItemAcceptsStudentAppAiTutorFeedbackArchiveStorageCommitCommandShape\nSourceSystemImport",
    teachingArchivePrincipalTest: "studentAppAiTutorFeedbackArchiveStorageServicePrincipal",
    teachingArchiveRepository: "INSERT INTO teaching_archive_items",
    teachingArchiveSql: "CREATE TABLE IF NOT EXISTS teaching_archive_items",
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit": "node tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft answer feedback archive storage commit runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommit\nstudent-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit.current.json\nstudent_app_ai_tutor_question_bank_draft_answer_feedback_archive_storage_commit_runtime",
    verifyStructure: "0276-student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit.md\nstudent-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-runtime.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-runtime.test.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-audit.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-audit.test.mjs",
    sdd: "Student App AI Tutor question-bank draft answer feedback archive storage commit TeachingArchiveCreateItemPort.createArchiveItem mainDatabaseWriteCommitted=true not a JS direct database write",
    architectureBoard: "10.16/10 Student App AI Tutor question-bank draft answer feedback archive storage commit STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED",
  };
}
