import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerScoringRequest,
  formatStudentAppAITutorQuestionBankDraftAnswerScoringRequestAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-scoring-request-audit.mjs";

describe("Student App AI Tutor question-bank draft answer scoring request foundation audit", () => {
  it("passes when Go, SQL, HTTP, OpenAPI, worker claim, and root hooks expose an own-student queued scoring request foundation", () => {
    const report = auditStudentAppAITutorQuestionBankDraftAnswerScoringRequest(currentInputs(), {
      generatedAt: "2026-06-06T01:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.useCase, "CreateStudentAppQuestionBankDraftAnswerScoringRequest.Execute");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerScoringRequestAudit(report), /answer scoring request foundation: READY/u);
  });

  it("fails when persistence introduces a second scoring queue table", () => {
    const inputs = currentInputs();
    inputs.schema += "\nCREATE TABLE IF NOT EXISTS teaching_question_bank_draft_answer_scoring_requests (id TEXT);\n";

    const report = auditStudentAppAITutorQuestionBankDraftAnswerScoringRequest(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "postgres.reuses_ai_grading_queue_with_question_bank_refs").passed, false);
  });

  it("fails when the scoring request path leaks answer text or result metadata", () => {
    const inputs = currentInputs();
    inputs.openApiPath += "\nanswerText: { type: string }\nresultRef: { type: string }\n";

    const report = auditStudentAppAITutorQuestionBankDraftAnswerScoringRequest(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "http.openapi_metadata_only_request_and_claim").passed, false);
  });
});

function currentInputs() {
  return {
    domain: "CreateStudentAppQuestionBankDraftAnswerScoringRequestInput NormalizeCreateStudentAppQuestionBankDraftAnswerScoringRequestInput AuthorizeListStudentAppQuestionBankDrafts ScopeStudentOwnWrite ValidateQuestionBankDraftAnswerScoringSource",
    domainTest: "RejectsBrokenSubmissionLinkage",
    aiGradingDomain: "CreateAIGradingRequest SourceQuestionBankDraftRef SourceQuestionBankAnswerSubmissionID",
    usecase: "GetQuestionBankDraftAnswerSubmissionForStudent GetQuestionBankDraftContentForStudent ValidateQuestionBankDraftAnswerScoringSource CreateAIGradingRequest SourceQuestionBankDraftRef SourceQuestionBankAnswerSubmissionID",
    usecaseTest: "RejectsBrokenSubmissionLinkage",
    postgresRequest: "source_question_bank_draft_ref source_question_bank_answer_submission_id SourceQuestionBankDraftRef SourceQuestionBankAnswerSubmissionID",
    postgresQuery: "source_question_bank_draft_ref source_question_bank_answer_submission_id SourceQuestionBankDraftRef SourceQuestionBankAnswerSubmissionID",
    postgresClaim: "source_question_bank_draft_ref source_question_bank_answer_submission_id SourceQuestionBankDraftRef SourceQuestionBankAnswerSubmissionID",
    postgresSubmission: "GetQuestionBankDraftAnswerSubmissionForStudent submission_id = $1 student_id = $2",
    postgresTest: "TestGetQuestionBankDraftAnswerSubmissionForStudentUsesScopedLookup",
    schema: "source_question_bank_draft_ref source_question_bank_answer_submission_id",
    sql: "source_question_bank_draft_ref source_question_bank_answer_submission_id",
    http: "createStudentAppQuestionBankDraftAnswerScoringRequestMetadata",
    httpTest: "TestCreateStudentAppQuestionBankDraftAnswerScoringRequestReturnsMetadataOnly TestCreateStudentAppQuestionBankDraftAnswerScoringRequestRejectsTeacherAndCrossStudent body leaked",
    claimTest: "TestClaimAIGradingRequestReturnsQuestionBankAnswerSourceRefs body leaked",
    httpRoutes: "/v1/student-app/question-bank-draft-answer-submissions/",
    httpConfig: "CreateStudentAppQuestionBankDraftAnswerScoringRequest",
    httpResponses: "sourceQuestionBankDraftRef sourceQuestionBankAnswerSubmissionId",
    httpPresenters: "sourceQuestionBankDraftRef sourceQuestionBankAnswerSubmissionId",
    main: "CreateStudentAppQuestionBankDraftAnswerScoringRequest: usecase.NewCreateStudentAppQuestionBankDraftAnswerScoringRequest",
    openApiRoot: "/v1/student-app/question-bank-draft-answer-submissions/{submissionId}/ai-grading-requests",
    openApiPath: "operationId: createStudentAppQuestionBankDraftAnswerScoringRequest pattern: '^qbank_ans_sub_[A-Za-z0-9_-]+$'",
    openApiClaimPath: "sourceQuestionBankDraftRef sourceQuestionBankAnswerSubmissionId",
    packageJson: "audit:student-app-ai-tutor-question-bank-draft-answer-scoring-request",
    qualityGate: "Student App AI Tutor question-bank draft answer scoring request foundation audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftAnswerScoringRequest student-app-ai-tutor-question-bank-draft-answer-scoring-request.current.json",
    verifyStructure: "0267-student-app-ai-tutor-question-bank-draft-answer-scoring-request-foundation.md question_bank_draft_answer_scoring_request.go create_student_app_question_bank_draft_answer_scoring_request.go student-app-question-bank-draft-answer-submission-ai-grading-requests.path.yaml",
    architectureBoard: "10.7/10 Student App AI Tutor question-bank draft answer scoring request foundation",
    sdd: "0267 Student App AI Tutor question-bank draft answer scoring request foundation",
  };
}
