import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorQuestionBankFeedbackStudentVisibilityReview } from "./student-app-ai-tutor-question-bank-feedback-student-visibility-review-audit.mjs";

describe("Student App AI Tutor question-bank-feedback student visibility review audit", () => {
  it("passes when a persisted question-bank-feedback result receives a human visibility review", async () => {
    const report = await auditStudentAppAITutorQuestionBankFeedbackStudentVisibilityReview(validInputs(), {
      generatedAt: "2026-06-11T14:30:00.000Z",
      probeP99Ms: 5,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_feedback_student_visibility_review");
    assert.equal(report.runtime.sharedRuntimeId, "student_app_ai_tutor_result_student_visibility_review_runtime");
    assert.equal(report.safetyInvariants.learningActionSourceRequired, "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK");
    assert.equal(report.safetyInvariants.feedbackStatusRequired, "READY_FOR_STUDENT_APP_READ");
    assert.equal(report.safetyInvariants.approvedForFutureStudentDelivery, true);
    assert.equal(report.safetyInvariants.studentVisiblePublished, false);
    assert.equal(report.runtimeProbes.studentAppAiTutorQuestionBankFeedbackStudentVisibilityReview.portCalls, 1);
  });

  it("fails when 0374 question-bank-feedback reviewed-result persistence is not ready", async () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.source0374Report);
    source.readiness = "NEEDS_REMEDIATION";
    inputs.source0374Report = JSON.stringify(source);

    const report = await auditStudentAppAITutorQuestionBankFeedbackStudentVisibilityReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0374_question_bank_feedback_reviewed_result_persistence_ready").passed, false);
  });

  it("fails when runtime is not question-bank-feedback source aware", async () => {
    const inputs = validInputs();
    inputs.runtime = inputs.runtime.replaceAll("sourceQuestionBankFeedbackReviewedResultPersistenceRuntimeId", "sourceQuestionBankFeedbackReviewedResultPersistenceRuntimeRemoved");

    const report = await auditStudentAppAITutorQuestionBankFeedbackStudentVisibilityReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.source_aware_question_bank_feedback_visibility_review").passed, false);
  });

  it("fails when question-bank-feedback visibility regression tests are missing", async () => {
    const inputs = validInputs();
    inputs.runtimeTest = "records a human student visibility review without publishing or delivery envelope creation";

    const report = await auditStudentAppAITutorQuestionBankFeedbackStudentVisibilityReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_question_bank_feedback_visibility_review_paths").passed, false);
  });

  it("fails when project hooks do not track 0375", async () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "12.58/10";

    const report = await auditStudentAppAITutorQuestionBankFeedbackStudentVisibilityReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0375").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    runtime: "tools/student-app-ai-tutor-result-student-visibility-review-runtime.mjs",
    runtimeTest: "tools/student-app-ai-tutor-result-student-visibility-review-runtime.test.mjs",
    source0374Report: "reports/student-app-ai-tutor-question-bank-feedback-reviewed-result-persistence-bridge.current.json",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0375-student-app-ai-tutor-question-bank-feedback-student-visibility-review.md",
  }).map(([key, relativePath]) => [key, fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : ""]));
}
