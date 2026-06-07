import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftContentRead,
  formatStudentAppAITutorQuestionBankDraftContentReadAudit,
} from "./student-app-ai-tutor-question-bank-draft-content-read-audit.mjs";

describe("Student App AI Tutor question-bank draft content read foundation audit", () => {
  it("passes when Go, SQL, HTTP, OpenAPI, and root hooks expose an own-student content read foundation", () => {
    const report = auditStudentAppAITutorQuestionBankDraftContentRead(currentInputs(), {
      generatedAt: "2026-06-06T00:10:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.useCase, "ReadStudentAppQuestionBankDraftContent.Execute");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.match(formatStudentAppAITutorQuestionBankDraftContentReadAudit(report), /content read foundation: READY/u);
  });

  it("fails when repository lookup drops own-student scoping", () => {
    const inputs = currentInputs();
    inputs.postgres = inputs.postgres.replace("student_id = $2", "TRUE");

    const report = auditStudentAppAITutorQuestionBankDraftContentRead(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "postgres.content_table_and_scoped_lookup").passed, false);
  });

  it("fails when the student response leaks ownership or worker internals", () => {
    const inputs = currentInputs();
    inputs.httpResponses += "\ntype studentAppQuestionBankDraftContentResponse struct { StudentID string; WorkerID string }\n";

    const report = auditStudentAppAITutorQuestionBankDraftContentRead(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "http.openapi_student_safe_detail").passed, false);
  });
});

function currentInputs() {
  return {
    domain: "ReadStudentAppQuestionBankDraftContentInput NormalizeReadStudentAppQuestionBankDraftContentInput AuthorizeListStudentAppQuestionBankDrafts NormalizeQuestionBankDraftRef BuildStudentAppQuestionBankDraftContent QuestionBankDraftContent QuestionBankDraftItem QuestionBankDraftContentStatusDraft",
    domainTest: "RejectsCrossStudentRepositoryLeak",
    usecase: "ReadStudentAppQuestionBankDraftContent GetQuestionBankDraftContentForStudent",
    usecaseTest: "RejectsCrossStudentRepositoryLeak",
    postgres: "SaveQuestionBankDraftContent ON CONFLICT (question_bank_draft_ref) DO UPDATE GetQuestionBankDraftContentForStudent question_bank_draft_ref = $1 student_id = $2",
    postgresTest: "TestGetQuestionBankDraftContentForStudentUsesScopedLookup",
    schema: "CREATE TABLE IF NOT EXISTS teaching_question_bank_draft_contents question_items JSONB NOT NULL idx_teaching_question_bank_draft_contents_student_updated",
    sql: "CREATE TABLE IF NOT EXISTS teaching_question_bank_draft_contents question_items JSONB NOT NULL idx_teaching_question_bank_draft_contents_student_updated",
    http: "readStudentAppQuestionBankDraftContent ReadStudentAppQuestionBankDraftContent questionBankDraftRef",
    httpTest: "TestReadStudentAppQuestionBankDraftContentRejectsCrossStudent expectedAnswer explanation body leaked",
    httpRoutes: "/v1/student-app/question-bank-draft-content",
    httpConfig: "ReadStudentAppQuestionBankDraftContent",
    httpResponses: "type studentAppQuestionBankDraftContentResponse struct { QuestionBankDraftRef string }\ntype questionBankDraftItemResponse struct { QuestionText string LearningTarget string }",
    main: "readStudentAppQuestionBankDraftContent := usecase.NewReadStudentAppQuestionBankDraftContent ReadStudentAppQuestionBankDraftContent:                readStudentAppQuestionBankDraftContent",
    openApiRoot: "/v1/student-app/question-bank-draft-content",
    openApiPath: "operationId: readStudentAppQuestionBankDraftContent questionBankDraftRef questionText learningTarget",
    packageJson: "audit:student-app-ai-tutor-question-bank-draft-content-read",
    qualityGate: "Student App AI Tutor question-bank draft content read foundation audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftContentRead student-app-ai-tutor-question-bank-draft-content-read.current.json",
    verifyStructure: "0265-student-app-ai-tutor-question-bank-draft-content-read-foundation.md question_bank_draft_content.go server_student_app_question_bank_draft_content.go",
    architectureBoard: "10.5/10 Student App AI Tutor question-bank draft content read foundation",
    sdd: "0265 Student App AI Tutor question-bank draft content read foundation",
  };
}
