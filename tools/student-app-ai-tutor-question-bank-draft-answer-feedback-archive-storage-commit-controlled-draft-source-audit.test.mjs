import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource,
  formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSourceAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-audit.mjs";

describe("Student App AI Tutor question-bank draft answer feedback archive storage commit controlled draft source audit", () => {
  it("passes when commit invokes the Teaching Archive use case port and persists controlled-source feedback", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource(currentInputs(), {
      generatedAt: "2026-06-07T05:50:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_storage_commit_controlled_draft_source_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource.result;
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED_FROM_CONTROLLED_DRAFT_SOURCE");
    assert.equal(result.teachingArchiveCommit.archiveItem.id, "tarch_student_feedback_controlled_source_001");
    assert.equal(result.sourceControlledFeedbackDraft.artifactId, result.sourcePersistenceCommand.sourceControlledDraftArtifactId);
    assert.equal(result.boundary.sourceControlledDraftEvidencePreserved, true);
    assert.equal(result.boundary.mainDatabaseWriteCommitted, true);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSourceAudit(report), /controlled draft source runtime: READY/u);
  });

  it("fails when 0299 source command evidence is missing or unsafe", async () => {
    const inputs = currentInputs();
    const commandReport = JSON.parse(inputs.persistenceCommandReport);
    commandReport.runtime.status = "COMMITTED";
    commandReport.safetyInvariants.sourceControlledDraftEvidencePreserved = false;
    inputs.persistenceCommandReport = JSON.stringify(commandReport);

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "persistence_command_controlled_source.ready_not_committed").passed, false);
  });

  it("fails when runtime claims raw DB, HTTP, model, tool, leak, Swarm, or unsafe rendering", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\ndirectDatabaseAccessAllowed: true\nexecuteHttpRequestAllowed: true\nfetch(\nmodelInferenceStarted: true\nrawModelOutputDisclosed: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the Student App durable commit boundary budget", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when Go bridge or root hooks omit controlled-source storage commit", async () => {
    const inputs = currentInputs();
    inputs.teachingArchiveUsecaseTest = "package usecase_test";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = "";
    inputs.verifyStructure = "";
    inputs.sdd = "";
    inputs.architectureBoard = "";

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "teaching_archive.use_case_bridge_exists").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSourcePort.commitTeachingArchiveCreateCommandFromControlledDraftSource",
      "commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageControlledDraftSource",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE_READY",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED_FROM_CONTROLLED_DRAFT_SOURCE",
      "TeachingArchiveCreateItemPort.createArchiveItem is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "AGENT_INTERNAL",
      "STUDENT_ARCHIVE_WRITE",
      "STUDENT_ASSIGNED_READ",
      "archivePersistenceCommandControlledDraftSourceVerified: true",
      "controlledDraftSourceVerified: true",
      "sourceControlledDraftEvidencePreserved: true",
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
      "commits the 0299 controlled-source archive command through the injected Teaching Archive use case port",
      "uses idempotency for replay and rejects conflicting controlled-source storage commits",
      "rejects unsafe 0299 source reports, missing ports, accepted writes, invalid archive ids, and unsafe feedback text",
      "rejects direct DB or HTTP policies, student scope mismatch, Swarm, leaked fields, and missing controlled-source evidence",
    ].join("\n"),
    persistenceCommandReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source.current.json", "utf8"),
    persistenceCommandRuntime: "PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE sourceControlledFeedbackDraft sourceControlledDraftEvidencePreserved scoreSummary learnerFeedback NOT_COMMITTED_TO_STUDENT_ARCHIVE durableStudentArchiveCommitStarted: false studentArchivePersisted: false",
    persistenceCommandAudit: "PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED sourceControlledFeedbackDraft sourceControlledDraftEvidencePreserved scoreSummary learnerFeedback",
    teachingArchiveUsecase: "func (uc *CreateArchiveItem) ExecuteWithPersistence\ntype ArchiveRepository interface\nPersistenceStatusPersisted",
    teachingArchiveUsecaseTest: "TestCreateArchiveItemAcceptsStudentAppAiTutorFeedbackArchiveStorageCommitControlledDraftSourceShape\nSourceSystemImport\ncontrolled_draft_source",
    teachingArchivePrincipalTest: "studentAppAiTutorFeedbackArchiveStorageServicePrincipal",
    teachingArchiveRepository: "INSERT INTO teaching_archive_items",
    teachingArchiveSql: "CREATE TABLE IF NOT EXISTS teaching_archive_items",
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source": "node tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft answer feedback archive storage commit controlled draft source runtime audit",
    rootWorkflowCoverage: [
      "studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource",
      "student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source.current.json",
      "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_storage_commit_controlled_draft_source_runtime",
    ].join("\n"),
    verifyStructure: [
      "0300-student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source.md",
      "student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-runtime.mjs",
      "student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-audit.test.mjs",
    ].join("\n"),
    sdd: "0300 Student App AI Tutor question-bank draft answer feedback archive storage commit controlled draft source",
    architectureBoard: "10.40/10 Student App AI Tutor question-bank draft answer feedback archive storage commit controlled draft source STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED_FROM_CONTROLLED_DRAFT_SOURCE",
  };
}
