import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorQuestionBankFeedbackReviewedResultPersistenceBridge } from "./student-app-ai-tutor-question-bank-feedback-reviewed-result-persistence-bridge-audit.mjs";

describe("Student App AI Tutor question-bank-feedback reviewed result persistence bridge audit", () => {
  it("passes when a reviewed question-bank-feedback answer is persisted through the existing result port", async () => {
    const report = await auditStudentAppAITutorQuestionBankFeedbackReviewedResultPersistenceBridge(validInputs(), {
      generatedAt: "2026-06-11T13:50:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_feedback_reviewed_result_persistence_bridge");
    assert.equal(report.runtime.sharedRuntimeId, "student_app_ai_tutor_reviewed_result_persistence_bridge_runtime");
    assert.equal(report.safetyInvariants.tutoringResultRecorded, true);
    assert.equal(report.safetyInvariants.studentVisiblePublished, false);
    assert.equal(report.runtimeProbes.studentAppAiTutorQuestionBankFeedbackReviewedResultPersistenceBridge.portCalls, 1);
  });

  it("fails when 0373 answer review gate is not ready", async () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.source0373Report);
    source.readiness = "NEEDS_REMEDIATION";
    inputs.source0373Report = JSON.stringify(source);

    const report = await auditStudentAppAITutorQuestionBankFeedbackReviewedResultPersistenceBridge(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0373_question_bank_feedback_answer_review_gate_ready").passed, false);
  });

  it("fails when runtime is not question-bank-feedback source aware", async () => {
    const inputs = validInputs();
    inputs.runtime = inputs.runtime.replaceAll("sourceQuestionBankFeedbackRuntimeId", "sourceQuestionBankFeedbackRuntimeRemoved");

    const report = await auditStudentAppAITutorQuestionBankFeedbackReviewedResultPersistenceBridge(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.source_aware_question_bank_feedback_reviewed_persistence").passed, false);
  });

  it("fails when question-bank-feedback regression tests are missing", async () => {
    const inputs = validInputs();
    inputs.runtimeTest = "persists an approved answer review through RecordTutoringAnalysisResult without guidance text or student visibility";

    const report = await auditStudentAppAITutorQuestionBankFeedbackReviewedResultPersistenceBridge(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_question_bank_feedback_reviewed_persistence_paths").passed, false);
  });

  it("fails when project hooks do not track 0374", async () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "12.55/10";

    const report = await auditStudentAppAITutorQuestionBankFeedbackReviewedResultPersistenceBridge(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0374").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    runtime: "tools/student-app-ai-tutor-reviewed-result-persistence-bridge-runtime.mjs",
    runtimeTest: "tools/student-app-ai-tutor-reviewed-result-persistence-bridge-runtime.test.mjs",
    source0373Report: "reports/student-app-ai-tutor-question-bank-feedback-answer-review-gate.current.json",
    goUseCase: "services/teaching-archive-gateway/internal/usecase/record_tutoring_analysis_result.go",
    goUseCaseTest: "services/teaching-archive-gateway/internal/usecase/record_tutoring_analysis_result_test.go",
    goDomain: "services/teaching-archive-gateway/internal/domain/tutoring_analysis_result.go",
    goRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go",
    goHttpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_test.go",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0374-student-app-ai-tutor-question-bank-feedback-reviewed-result-persistence-bridge.md",
  }).map(([key, relativePath]) => [key, fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : ""]));
}