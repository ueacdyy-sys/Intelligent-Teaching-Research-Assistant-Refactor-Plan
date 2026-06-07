import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerScoringResult,
  formatStudentAppAITutorQuestionBankDraftAnswerScoringResultAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-scoring-result-audit.mjs";

describe("Student App AI Tutor question-bank draft answer scoring result foundation audit", () => {
  it("passes when the student result read is own-scoped, indexed, safe, and wired into root evidence", () => {
    const report = auditStudentAppAITutorQuestionBankDraftAnswerScoringResult(currentInputs(), {
      generatedAt: "2026-06-06T12:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_scoring_result_foundation");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.safetyInvariants.answerTextVisibleToStudent, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerScoringResultAudit(report), /answer scoring result foundation: READY/u);
  });

  it("fails when the student endpoint exposes worker or answer-key internals", () => {
    const inputs = currentInputs();
    inputs.openApiPath += "\nanswerText: { type: string }\nworkerId: { type: string }\nresultRef: { type: string }\n";

    const report = auditStudentAppAITutorQuestionBankDraftAnswerScoringResult(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "http.openapi_student_safe_result_surface").passed, false);
  });

  it("does not treat global OpenAPI worker schemas as the student-facing result surface", () => {
    const inputs = currentInputs();
    inputs.openApiRoot += "\nworkerId: { type: string }\nresultRef: { type: string }\nclaimExpiresAt: { type: string }\n";

    const report = auditStudentAppAITutorQuestionBankDraftAnswerScoringResult(inputs);

    assert.equal(report.readiness, "READY");
    assert.equal(report.findings.find((finding) => finding.id === "http.openapi_student_safe_result_surface").passed, true);
  });

  it("fails when the repository lookup is no longer scoped by submission id plus student id", () => {
    const inputs = currentInputs();
    inputs.postgresQuery = inputs.postgresQuery.replace("source_archive_student_id = $2", "TRUE");

    const report = auditStudentAppAITutorQuestionBankDraftAnswerScoringResult(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "postgres.submission_student_latest_indexed_lookup").passed, false);
  });
});

function currentInputs() {
  return {
    domain: [
      "ReadStudentAppQuestionBankDraftAnswerScoringResultInput",
      "NormalizeReadStudentAppQuestionBankDraftAnswerScoringResultInput",
      "AuthorizeListStudentAppQuestionBankDrafts",
      "primaryOwnStudentID",
      "BuildStudentAppQuestionBankDraftAnswerScoringResult",
      "if request.Status == AIGradingStatusSucceeded",
      "if request.Status == AIGradingStatusFailed",
    ].join(" "),
    domainTest: [
      "TestReadStudentAppQuestionBankDraftAnswerScoringResultReturnsSafeOwnResult",
      "TestBuildQuestionBankDraftAnswerScoringResultHidesPendingAndFailedInternals",
    ].join(" "),
    usecase: [
      "GetQuestionBankDraftAnswerSubmissionForStudent",
      "GetLatestQuestionBankDraftAnswerScoringRequestForStudent",
      "BuildStudentAppQuestionBankDraftAnswerScoringResult",
    ].join(" "),
    usecaseTest: [
      "TestReadStudentAppQuestionBankDraftAnswerScoringResultRejectsForbiddenBeforeRepository",
      "TestReadStudentAppQuestionBankDraftAnswerScoringResultReturnsSafeOwnResult",
    ].join(" "),
    postgresQuery: "source_question_bank_answer_submission_id = $1 source_archive_student_id = $2 source_question_bank_draft_ref IS NOT NULL ORDER BY created_at DESC, id DESC",
    postgresSchema: "idx_teaching_ai_grading_requests_qbank_answer_student_created source_question_bank_answer_submission_id, source_archive_student_id, created_at DESC, id DESC",
    postgresTest: "TestGetLatestQuestionBankDraftAnswerScoringRequestForStudentUsesScopedLookup TestEnsureSchemaCreatesQuestionBankDraftAnswerScoringLookupIndex",
    sql: "idx_teaching_ai_grading_requests_qbank_answer_student_created source_question_bank_answer_submission_id, source_archive_student_id, created_at DESC, id DESC",
    http: "readStudentAppQuestionBankDraftAnswerScoringResultMetadata ReadStudentAppQuestionBankDraftAnswerScoringResult /v1/student-app/question-bank-draft-answer-submissions/ ai-grading-result",
    httpTest: "TestReadStudentAppQuestionBankDraftAnswerScoringResultReturnsSafeSummary TestReadStudentAppQuestionBankDraftAnswerScoringResultRejectsTeacherAndCrossStudent body leaked",
    httpPaths: "parseStudentAppQuestionBankDraftAnswerSubmissionAIGradingResultPath ai-grading-result",
    httpResponses: `
type questionBankDraftAnswerScoringResultResponse struct {
  SubmissionID string
  RequestID string
  ScoreSummary *string
  ErrorCode *string
}
`,
    httpPresenters: "func toStudentAppQuestionBankDraftAnswerScoringResultResponse() { scoreSummary errorCode }",
    httpConfig: "ReadStudentAppQuestionBankDraftAnswerScoringResult",
    main: "readStudentAppQuestionBankDraftAnswerScoringResult := usecase.NewReadStudentAppQuestionBankDraftAnswerScoringResult ReadStudentAppQuestionBankDraftAnswerScoringResult:    readStudentAppQuestionBankDraftAnswerScoringResult",
    openApiRoot: "/v1/student-app/question-bank-draft-answer-submissions/{submissionId}/ai-grading-result",
    openApiPath: "operationId: readStudentAppQuestionBankDraftAnswerScoringResult AgentApiKey PrincipalContextHeader scoreSummary errorCode",
    packageJson: "audit:student-app-ai-tutor-question-bank-draft-answer-scoring-result",
    qualityGate: "Student App AI Tutor question-bank draft answer scoring result foundation audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftAnswerScoringResult student-app-ai-tutor-question-bank-draft-answer-scoring-result.current.json student_app_ai_tutor_question_bank_draft_answer_scoring_result_foundation",
    verifyStructure: "0269-student-app-ai-tutor-question-bank-draft-answer-scoring-result-foundation.md question_bank_draft_answer_scoring_result.go read_student_app_question_bank_draft_answer_scoring_result.go student-app-question-bank-draft-answer-submission-ai-grading-result.path.yaml",
    architectureBoard: "10.9/10 Student App AI Tutor question-bank draft answer scoring result foundation",
    sdd: "0269 Student App AI Tutor question-bank draft answer scoring result foundation",
  };
}
