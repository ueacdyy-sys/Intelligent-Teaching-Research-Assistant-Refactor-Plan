import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorQuestionBankFeedbackStudentDeliveryEnvelope } from "./student-app-ai-tutor-question-bank-feedback-student-delivery-envelope-audit.mjs";

describe("Student App AI Tutor question-bank-feedback student delivery envelope audit", () => {
  it("passes when visibility approval and controlled feedback guidance create a student delivery envelope", async () => {
    const report = await auditStudentAppAITutorQuestionBankFeedbackStudentDeliveryEnvelope(validInputs(), {
      generatedAt: "2026-06-11T15:10:00.000Z",
      probeP99Ms: 5,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_feedback_student_delivery_envelope");
    assert.equal(report.runtime.sharedRuntimeId, "student_app_ai_tutor_result_student_delivery_envelope_runtime");
    assert.equal(report.safetyInvariants.learningActionSourceRequired, "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK");
    assert.equal(report.safetyInvariants.feedbackStatusRequired, "READY_FOR_STUDENT_APP_READ");
    assert.equal(report.safetyInvariants.studentDeliveryEnvelopeCreated, true);
    assert.equal(report.safetyInvariants.durableStudentArchivePersistenceStarted, false);
    assert.equal(report.runtimeProbes.studentAppAiTutorQuestionBankFeedbackStudentDeliveryEnvelope.portCalls, 1);
  });

  it("fails when 0375 question-bank-feedback student visibility review is not ready", async () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.source0375Report);
    source.readiness = "NEEDS_REMEDIATION";
    inputs.source0375Report = JSON.stringify(source);

    const report = await auditStudentAppAITutorQuestionBankFeedbackStudentDeliveryEnvelope(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0375_question_bank_feedback_student_visibility_ready").passed, false);
  });

  it("fails when shared delivery runtime is not question-bank-feedback source aware", async () => {
    const inputs = validInputs();
    inputs.runtime = inputs.runtime.replaceAll("questionBankFeedbackVisibilityReviewRuntimeId", "questionBankFeedbackVisibilityReviewRuntimeRemoved");

    const report = await auditStudentAppAITutorQuestionBankFeedbackStudentDeliveryEnvelope(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.source_aware_question_bank_feedback_delivery_envelope").passed, false);
  });

  it("fails when question-bank-feedback delivery regression tests are missing", async () => {
    const inputs = validInputs();
    inputs.runtimeTest = "records a result-archive-sourced student delivery envelope through the same delivery port";

    const report = await auditStudentAppAITutorQuestionBankFeedbackStudentDeliveryEnvelope(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_question_bank_feedback_delivery_envelope_paths").passed, false);
  });

  it("fails when project hooks do not track 0376", async () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "12.61/10";

    const report = await auditStudentAppAITutorQuestionBankFeedbackStudentDeliveryEnvelope(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0376").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    runtime: "tools/student-app-ai-tutor-result-student-delivery-envelope-runtime.mjs",
    runtimeTest: "tools/student-app-ai-tutor-result-student-delivery-envelope-runtime.test.mjs",
    source0375Report: "reports/student-app-ai-tutor-question-bank-feedback-student-visibility-review.current.json",
    source0372Report: "reports/student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact.current.json",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0376-student-app-ai-tutor-question-bank-feedback-student-delivery-envelope.md",
  }).map(([key, relativePath]) => [key, fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : ""]));
}
