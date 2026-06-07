import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerSubmission,
  formatStudentAppAITutorQuestionBankDraftAnswerSubmissionAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-submission-audit.mjs";

describe("Student App AI Tutor question-bank draft answer submission foundation audit", () => {
  it("passes when Go, SQL, HTTP, OpenAPI, and root hooks expose an own-student answer submission foundation", () => {
    const report = auditStudentAppAITutorQuestionBankDraftAnswerSubmission(currentInputs(), {
      generatedAt: "2026-06-06T00:20:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.useCase, "SubmitStudentAppQuestionBankDraftAnswer.ExecuteWithPersistence");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerSubmissionAudit(report), /answer submission foundation: READY/u);
  });

  it("fails when persistence drops JSONB answer storage", () => {
    const inputs = currentInputs();
    inputs.postgres = inputs.postgres.replace("$8::jsonb", "$8");

    const report = auditStudentAppAITutorQuestionBankDraftAnswerSubmission(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "postgres.answer_submission_table_and_jsonb_write").passed, false);
  });

  it("fails when the response DTO leaks answer text or scoring fields", () => {
    const inputs = currentInputs();
    inputs.httpResponses += "\ntype questionBankDraftAnswerSubmissionResponse struct { AnswerText string; Score int }\n";

    const report = auditStudentAppAITutorQuestionBankDraftAnswerSubmission(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "http.openapi_metadata_only_response").passed, false);
  });
});

function currentInputs() {
  return {
    domain: "SubmitStudentAppQuestionBankDraftAnswerInput NormalizeSubmitStudentAppQuestionBankDraftAnswerInput AuthorizeListStudentAppQuestionBankDrafts ScopeStudentOwnWrite QuestionBankDraftAnswerSubmission validateSubmittedAnswersAgainstDraft",
    domainTest: "RejectsUnknownDraftItem",
    usecase: "SubmitStudentAppQuestionBankDraftAnswer GetQuestionBankDraftContentForStudent SubmitQuestionBankDraftAnswerSubmission",
    usecaseTest: "RejectsUnknownItemBeforePersist",
    postgres: "SubmitQuestionBankDraftAnswerSubmission $8::jsonb",
    postgresTest: "TestSubmitQuestionBankDraftAnswerSubmissionInsertsAnswerJSON",
    schema: "CREATE TABLE IF NOT EXISTS teaching_question_bank_draft_answer_submissions answers JSONB NOT NULL idx_teaching_question_bank_draft_answer_submissions_student_submitted idx_teaching_question_bank_draft_answer_submissions_draft_submitted",
    sql: "CREATE TABLE IF NOT EXISTS teaching_question_bank_draft_answer_submissions answers JSONB NOT NULL idx_teaching_question_bank_draft_answer_submissions_student_submitted idx_teaching_question_bank_draft_answer_submissions_draft_submitted",
    http: "submitStudentAppQuestionBankDraftAnswerSubmission SubmitStudentAppQuestionBankDraftAnswer questionBankDraftRef",
    httpTest: "TestSubmitStudentAppQuestionBankDraftAnswerRejectsCrossStudentDraft body leaked answerText expectedAnswer explanation score",
    httpRoutes: "/v1/student-app/question-bank-draft-answer-submissions",
    httpConfig: "SubmitStudentAppQuestionBankDraftAnswer",
    httpResponses: "type questionBankDraftAnswerSubmissionResponse struct { QuestionBankDraftRef string AnswerCount int }",
    main: "submitStudentAppQuestionBankDraftAnswer := usecase.NewSubmitStudentAppQuestionBankDraftAnswer SubmitStudentAppQuestionBankDraftAnswer:               submitStudentAppQuestionBankDraftAnswer",
    openApiRoot: "/v1/student-app/question-bank-draft-answer-submissions",
    openApiPath: "operationId: submitStudentAppQuestionBankDraftAnswerSubmission questionBankDraftRef answerText answerCount",
    packageJson: "audit:student-app-ai-tutor-question-bank-draft-answer-submission",
    qualityGate: "Student App AI Tutor question-bank draft answer submission foundation audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftAnswerSubmission student-app-ai-tutor-question-bank-draft-answer-submission.current.json",
    verifyStructure: "0266-student-app-ai-tutor-question-bank-draft-answer-submission-foundation.md question_bank_draft_answer_submission.go server_student_app_question_bank_draft_answer_submission.go",
    architectureBoard: "10.6/10 Student App AI Tutor question-bank draft answer submission foundation",
    sdd: "0266 Student App AI Tutor question-bank draft answer submission foundation",
  };
}
