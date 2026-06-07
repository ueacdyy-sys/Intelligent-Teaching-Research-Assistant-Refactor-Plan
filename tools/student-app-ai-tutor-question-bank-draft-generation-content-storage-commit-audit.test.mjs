import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftGenerationContentStorageCommit,
  formatStudentAppAITutorQuestionBankDraftGenerationContentStorageCommitAudit,
} from "./student-app-ai-tutor-question-bank-draft-generation-content-storage-commit-audit.mjs";

describe("Student App AI Tutor question-bank draft generation content storage commit audit", () => {
  it("passes when reviewed generated content is committed through the Teaching Archive content storage port", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftGenerationContentStorageCommit(currentInputs(), {
      generatedAt: "2026-06-06T17:30:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMIT");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_generation_content_storage_commit_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationContentStorageCommit.result;
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMITTED");
    assert.equal(result.teachingArchiveContentStorage.targetTable, "teaching_question_bank_draft_contents");
    assert.equal(result.boundary.questionBankContentWriteCommitted, true);
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftGenerationContentStorageCommitAudit(report), /content storage commit runtime: READY/u);
  });

  it("fails when teacher review or linked source evidence is missing or unsafe", async () => {
    const unsafeReview = currentInputs();
    const reviewReport = JSON.parse(unsafeReview.teacherReviewReport);
    reviewReport.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationTeacherReview.result.teacherReview.executionState = "TEACHER_REVIEW_STORED";
    unsafeReview.teacherReviewReport = JSON.stringify(reviewReport);

    let report = await auditStudentAppAITutorQuestionBankDraftGenerationContentStorageCommit(unsafeReview);
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.teacher_review_ready_not_stored").passed, false);

    const mismatched = currentInputs();
    const envelopeReport = JSON.parse(mismatched.inputEnvelopeReport);
    envelopeReport.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationInputEnvelope.result.inputEnvelope.archiveItemId = "tarch_other";
    mismatched.inputEnvelopeReport = JSON.stringify(envelopeReport);

    report = await auditStudentAppAITutorQuestionBankDraftGenerationContentStorageCommit(mismatched);
    assert.equal(report.findings.find((finding) => finding.id === "source.envelope_plan_request_linked").passed, false);
  });

  it("fails when runtime claims direct DB, HTTP, publication, scoring, model, tool, leak, or Swarm", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\ndirectDatabaseAccessAllowed: true\nexecuteHttpRequestAllowed: true\nfetch(\nstudentVisiblePublishAllowed: true\nscoringAllowed: true\nrawModelOutputStored: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = await auditStudentAppAITutorQuestionBankDraftGenerationContentStorageCommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the content storage boundary budget", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftGenerationContentStorageCommit(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when Go storage, student presenter, quality hooks, or architecture board omit 0285", async () => {
    const inputs = currentInputs();
    inputs.repository = "package postgres";
    inputs.presenter = "func toStudentAppQuestionBankDraftContentResponse() { ExpectedAnswer: item.ExpectedAnswer }";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("studentAppAiTutorQuestionBankDraftGenerationContentStorageCommit", "studentAppAiTutorQuestionBankDraftGenerationTeacherReview");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("content-storage-commit", "teacher-review");
    inputs.sdd = "teacher review only";
    inputs.architectureBoard = "10.24/10 teacher review only";

    const report = await auditStudentAppAITutorQuestionBankDraftGenerationContentStorageCommit(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "go_storage_and_student_presenter_boundaries").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMIT_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMIT_PORT",
      "StudentAppAITutorQuestionBankDraftGenerationContentStorageCommitPort.saveReviewedQuestionBankDraftContent",
      "commitStudentAppAITutorQuestionBankDraftGenerationContentStorage",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMITTED",
      "ArchiveRepository.SaveQuestionBankDraftContent",
      "teaching_question_bank_draft_contents",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "questionBankContentWriteStarted: true",
      "questionBankContentWriteCommitted: true",
      "contentStored: true",
      "teacherRubricStoredAsInternalScoringMaterial: true",
      "studentSafeQuestionPreviewOnly: true",
      "rawModelOutputStored: false",
      "studentAnswerKeyDisclosed: false",
      "studentAnsweringStarted: false",
      "scoringStarted: false",
      "studentVisiblePublished: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "requiresFutureRowVerification: true",
      "requiresFutureStudentReadVerification: true",
    ].join("\n"),
    runtimeTest: [
      "commits teacher-reviewed generated content through the injected Teaching Archive port",
      "uses idempotency for replay and rejects conflicting content storage commits",
      "rejects missing ports, unsafe service principals, unsafe source state, and unsafe policy",
      "rejects leaked model fields, mismatched envelope linkage, unsafe text, and unsafe port results",
      "requires teacher review and input envelope evidence and keeps publication, answering, and scoring future-gated",
    ].join("\n"),
    teacherReviewReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-teacher-review.current.json", "utf8"),
    inputEnvelopeReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-input-envelope.current.json", "utf8"),
    generationPlanReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-plan.current.json", "utf8"),
    sourceRequestReport: fs.readFileSync("reports/student-app-ai-tutor-request.current.json", "utf8"),
    repository: "func (r *ArchiveRepository) SaveQuestionBankDraftContent\nNormalizeQuestionBankDraftContent\nINSERT INTO teaching_question_bank_draft_contents\nON CONFLICT (question_bank_draft_ref) DO UPDATE",
    domain: "ExpectedAnswer string\nExplanation string\nNormalizeQuestionBankDraftContent",
    sql: "CREATE TABLE IF NOT EXISTS teaching_question_bank_draft_contents",
    presenter: "func toStudentAppQuestionBankDraftContentResponse() {\nQuestionText:   item.QuestionText,\nLearningTarget: item.LearningTarget,\n}",
    responses: "type studentAppQuestionBankDraftContentResponse struct {}\ntype questionBankDraftItemResponse struct {\nQuestionText string\nLearningTarget string\n}",
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-generation-content-storage-commit": "node tools/student-app-ai-tutor-question-bank-draft-generation-content-storage-commit-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft generation content storage commit runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftGenerationContentStorageCommit\nstudent-app-ai-tutor-question-bank-draft-generation-content-storage-commit.current.json\nstudent_app_ai_tutor_question_bank_draft_generation_content_storage_commit_runtime",
    verifyStructure: "0285-student-app-ai-tutor-question-bank-draft-generation-content-storage-commit.md\nstudent-app-ai-tutor-question-bank-draft-generation-content-storage-commit-runtime.mjs\nstudent-app-ai-tutor-question-bank-draft-generation-content-storage-commit-runtime.test.mjs\nstudent-app-ai-tutor-question-bank-draft-generation-content-storage-commit-audit.mjs\nstudent-app-ai-tutor-question-bank-draft-generation-content-storage-commit-audit.test.mjs",
    sdd: "Student App AI Tutor question-bank draft generation content storage commit ArchiveRepository.SaveQuestionBankDraftContent teaching_question_bank_draft_contents",
    architectureBoard: "10.25/10 STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMITTED student_app_ai_tutor_question_bank_draft_generation_content_storage_commit_runtime",
  };
}
