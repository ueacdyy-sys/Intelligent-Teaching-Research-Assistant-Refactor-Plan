import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorQuestionBankFeedbackStudentArchivePersistenceCommand } from "./student-app-ai-tutor-question-bank-feedback-student-archive-persistence-command-audit.mjs";

describe("Student App AI Tutor question-bank-feedback student archive persistence command audit", () => {
  it("passes when 0376 question-bank-feedback delivery records an append-only archive command", () => {
    const report = auditStudentAppAITutorQuestionBankFeedbackStudentArchivePersistenceCommand(validInputs(), { generatedAt: "2026-06-11T16:20:00.000Z", probeP99Ms: 5 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_feedback_student_archive_persistence_command");
    assert.equal(report.runtime.sharedRuntimeId, "student_app_ai_tutor_result_student_archive_persistence_command_runtime");
    assert.equal(report.safetyInvariants.learningActionSourceRequired, "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK");
    assert.equal(report.safetyInvariants.feedbackStatusRequired, "READY_FOR_STUDENT_APP_READ");
    assert.equal(report.safetyInvariants.studentArchivePersistenceCommandRecorded, true);
    assert.equal(report.safetyInvariants.durableStudentArchiveCommitStarted, false);
  });

  it("fails when 0376 question-bank-feedback student delivery envelope is not ready", () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.source0376Report);
    source.readiness = "NEEDS_REMEDIATION";
    inputs.source0376Report = JSON.stringify(source);

    const report = auditStudentAppAITutorQuestionBankFeedbackStudentArchivePersistenceCommand(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0376_question_bank_feedback_student_delivery_envelope_ready").passed, false);
  });

  it("fails when shared runtime is not question-bank-feedback archive-command source aware", () => {
    const inputs = validInputs();
    inputs.runtime = inputs.runtime.replaceAll("questionBankFeedbackDeliveryWorkloadType", "questionBankFeedbackDeliveryWorkloadRemoved");

    const report = auditStudentAppAITutorQuestionBankFeedbackStudentArchivePersistenceCommand(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.source_aware_question_bank_feedback_archive_persistence_command").passed, false);
  });

  it("fails when question-bank-feedback archive-command regression tests are missing", () => {
    const inputs = validInputs();
    inputs.runtimeTest = "records an append-only AI Tutor feedback persistence command without durable commit";

    const report = auditStudentAppAITutorQuestionBankFeedbackStudentArchivePersistenceCommand(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_question_bank_feedback_archive_persistence_paths").passed, false);
  });

  it("fails when project hooks do not track 0377", () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "12.64/10";

    const report = auditStudentAppAITutorQuestionBankFeedbackStudentArchivePersistenceCommand(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0377").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    runtime: "tools/student-app-ai-tutor-result-student-archive-persistence-command-runtime.mjs",
    runtimeTest: "tools/student-app-ai-tutor-result-student-archive-persistence-command-runtime.test.mjs",
    source0376Report: "reports/student-app-ai-tutor-question-bank-feedback-student-delivery-envelope.current.json",
    source0372Report: "reports/student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact.current.json",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0377-student-app-ai-tutor-question-bank-feedback-student-archive-persistence-command.md",
  }).map(([key, relativePath]) => [key, fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : ""]));
}
