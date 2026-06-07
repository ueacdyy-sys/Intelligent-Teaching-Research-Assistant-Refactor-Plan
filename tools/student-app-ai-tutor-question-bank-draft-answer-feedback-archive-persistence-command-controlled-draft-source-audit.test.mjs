import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource,
  formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSourceAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source-audit.mjs";

describe("Student App AI Tutor question-bank draft answer feedback archive persistence command controlled draft source audit", () => {
  it("passes when archive persistence records a command from 0298 delivery without durable commit", () => {
    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource(currentInputs(), {
      generatedAt: "2026-06-07T05:20:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE_RUNTIME");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_persistence_command_controlled_draft_source_runtime");
    assert.equal(report.runtime.status, "PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource.result;
    assert.equal(result.feedbackArchivePersistenceCommand.commandKind, "STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE");
    assert.equal(result.feedbackArchivePersistenceCommand.commitState, "NOT_COMMITTED_TO_STUDENT_ARCHIVE");
    assert.equal(result.feedbackArchivePersistenceCommand.sourceControlledDraft.artifactId, result.sourceControlledFeedbackDraft.artifactId);
    assert.equal(result.boundary.feedbackDeliveryEnvelopeControlledDraftSourceVerified, true);
    assert.equal(result.boundary.sourceControlledDraftEvidencePreserved, true);
    assert.equal(result.boundary.feedbackArchivePersistenceCommandRecorded, true);
    assert.equal(result.boundary.durableStudentArchiveCommitStarted, false);
    assert.equal(result.boundary.studentArchivePersisted, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSourceAudit(report), /controlled draft source runtime: READY/u);
  });

  it("fails when 0298 delivery envelope evidence is missing or unsafe", () => {
    const inputs = currentInputs();
    const delivery = JSON.parse(inputs.deliveryReport);
    delivery.runtime.status = "PERSISTED";
    delivery.safetyInvariants.sourceControlledDraftEvidencePreserved = false;
    inputs.deliveryReport = JSON.stringify(delivery);

    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "delivery_envelope_controlled_draft_source.ready_not_persisted").passed, false);
  });

  it("fails when runtime claims commit, DB writes, model work, transport, tools, or leaked fields", () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\ndurableStudentArchiveCommitStarted: true\nstudentArchivePersisted: true\nmainDatabaseWriteStarted: true\nstudentArchiveWriteStarted: true\nmodelInferenceAllowed: true\nexecuteHttpRequestAllowed: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.command_from_controlled_draft_without_commit_or_model").passed, false);
  });

  it("caps probe p99 at the Student App archive persistence command budget", () => {
    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when root hooks, structure, SDD, or board omit the runtime", () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.qualityGate = "";
    inputs.rootWorkflowCoverage = "";
    inputs.verifyStructure = "";
    inputs.sdd = "";
    inputs.architectureBoard = "";

    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSourcePort.recordFeedbackArchivePersistenceCommandFromControlledDraftSource",
      "recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE_READY",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED",
      "assertPersistencePrincipal",
      "STUDENT_ARCHIVE_WRITE",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "feedbackDeliveryEnvelopeControlledDraftSourceVerified: true",
      "controlledDraftSourceVerified: true",
      "publicationApprovalPreserved: true",
      "sourceControlledDraftEvidencePreserved: true",
      "safeLearnerFeedbackOnly: true",
      "studentOwnScopeEnforced: true",
      "feedbackArchivePersistenceCommandRecorded: true",
      "appendOnlyCommandLogRecorded: true",
      "durableStudentArchivePersistenceStarted: false",
      "durableStudentArchiveCommitStarted: false",
      "studentArchivePersisted: false",
      "mainDatabaseWriteStarted: false",
      "studentArchiveWriteStarted: false",
      "answerKeyDisclosed: false",
      "workerMetadataDisclosed: false",
      "rawModelOutputDisclosed: false",
      "resultRefDisclosed: false",
      "modelInferenceStarted: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "requiresFutureDurableArchiveCommitReview: true",
      "STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE",
      "PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED",
      "NOT_COMMITTED_TO_STUDENT_ARCHIVE",
      "sourceControlledDraft",
      "rejectLeakedFields",
    ].join("\n"),
    runtimeTest: [
      "records an append-only archive persistence command from the 0298 controlled-source delivery envelope without durable commit",
      "uses idempotency for replay and rejects conflicting controlled-source persistence commands",
      "rejects unsafe principals, unsafe 0298 delivery reports, unsafe policies, and controlled-source mismatches",
      "rejects leaked answer, worker, result, model, commit, internal error, and unsafe feedback text",
      "rejects missing 0298 delivery and 0299 command evidence refs",
    ].join("\n"),
    deliveryReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source.current.json", "utf8"),
    deliveryRuntime: "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_NOT_PERSISTED studentFeedbackDeliveryEnvelope sourceControlledFeedbackDraft sourceControlledDraftEvidencePreserved learnerFeedback scoreSummary durableStudentArchivePersistenceStarted: false mainDatabaseWriteStarted: false studentArchiveWriteStarted: false",
    deliveryAudit: "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_NOT_PERSISTED studentFeedbackDeliveryEnvelope sourceControlledFeedbackDraft sourceControlledDraftEvidencePreserved learnerFeedback scoreSummary",
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source": "node tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft answer feedback archive persistence command controlled draft source runtime audit",
    rootWorkflowCoverage: [
      "studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource",
      "student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source.current.json",
      "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_persistence_command_controlled_draft_source_runtime",
    ].join("\n"),
    verifyStructure: [
      "0299-student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source.md",
      "student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source-runtime.mjs",
      "student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source-audit.test.mjs",
    ].join("\n"),
    sdd: "0299 Student App AI Tutor question-bank draft answer feedback archive persistence command controlled draft source",
    architectureBoard: "10.39/10 Student App AI Tutor question-bank draft answer feedback archive persistence command controlled draft source PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED",
  };
}
