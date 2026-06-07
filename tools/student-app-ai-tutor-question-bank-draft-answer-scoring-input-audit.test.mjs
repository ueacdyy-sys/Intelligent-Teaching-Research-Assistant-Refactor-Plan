import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerScoringInput,
  formatStudentAppAITutorQuestionBankDraftAnswerScoringInputAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-scoring-input-audit.mjs";

describe("Student App AI Tutor question-bank draft answer scoring input foundation audit", () => {
  it("passes when internal worker-only claimed input is guarded, linked, and wired into root evidence", () => {
    const report = auditStudentAppAITutorQuestionBankDraftAnswerScoringInput(currentInputs(), {
      generatedAt: "2026-06-06T11:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_scoring_input_foundation");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.safetyInvariants.resultPersistenceAllowed, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerScoringInputAudit(report), /answer scoring input foundation: READY/u);
  });

  it("fails when internal service authorization evidence is missing", () => {
    const inputs = currentInputs();
    inputs.aiGradingResultDomain = inputs.aiGradingResultDomain.replace("EntryPointAgentInternal", "EntryPointStudentApp");

    const report = auditStudentAppAITutorQuestionBankDraftAnswerScoringInput(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "go.worker_only_claimed_input_gate").passed, false);
  });

  it("fails when the worker input endpoint grows result or feedback fields", () => {
    const inputs = currentInputs();
    inputs.openApiPath += "\nscoreSummary: { type: string }\nresultRef: { type: string }\nfeedback: { type: string }\n";

    const report = auditStudentAppAITutorQuestionBankDraftAnswerScoringInput(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "scope.no_scoring_persistence_or_student_publish").passed, false);
  });
});

function currentInputs() {
  return {
    domain: [
      "ReadQuestionBankDraftAnswerScoringInputInput",
      "NormalizeReadQuestionBankDraftAnswerScoringInputInput",
      "AuthorizeRecordAIGradingResult",
      "ValidateQuestionBankDraftAnswerScoringInputRequest",
      "canRecordAIGradingResult",
      "BuildQuestionBankDraftAnswerScoringInput",
      "SourceQuestionBankDraftRef",
      "SourceQuestionBankAnswerSubmissionID",
      "SourceArchiveContentRef != request.SourceQuestionBankDraftRef",
      "NormalizeQuestionBankDraftRef",
      "NormalizeQuestionBankDraftAnswerSubmissionID",
      "validateQuestionBankDraftAnswerScoringLinkage",
      "QuestionBankDraftAnswerSubmissionStatusSubmitted",
      "validateSubmittedAnswersAgainstDraft",
      "AnswerText:     answer.AnswerText",
      "ExpectedAnswer: item.ExpectedAnswer",
      "Explanation:    item.Explanation",
    ].join(" "),
    domainTest: [
      "TestNormalizeQuestionBankDraftAnswerScoringInputRejectsNonServicePrincipals",
      "TestBuildQuestionBankDraftAnswerScoringInputRejectsExpiredLeaseAndWrongWorker",
      "TestBuildQuestionBankDraftAnswerScoringInputReturnsWorkerOnlyAnswerPackage",
      "TestBuildQuestionBankDraftAnswerScoringInputRejectsNonQuestionBankSourceAndBrokenLinkage",
    ].join(" "),
    aiGradingResultDomain: "SubjectService RoleService EntryPointAgentInternal ScopeTeachingWrite",
    usecase: [
      "GetAIGradingRequestByID",
      "GetQuestionBankDraftAnswerSubmissionForStudent",
      "GetQuestionBankDraftContentForStudent",
      "ValidateQuestionBankDraftAnswerScoringInputRequest",
      "BuildQuestionBankDraftAnswerScoringInput",
    ].join(" "),
    usecaseTest: [
      "TestReadQuestionBankDraftAnswerScoringInputRejectsTeacherBeforeRepository",
      "TestReadQuestionBankDraftAnswerScoringInputRejectsWrongWorkerBeforeSourceReads",
    ].join(" "),
    http: "func (s *Server) readQuestionBankDraftAnswerScoringInputMetadata() { ReadQuestionBankDraftAnswerScoringInput } /v1/teaching/ai-grading-requests/ question-bank-answer-scoring-input",
    httpTest: "TestReadQuestionBankDraftAnswerScoringInputReturnsWorkerOnlyInputPackage TestReadQuestionBankDraftAnswerScoringInputRejectsTeacherPrincipal body leaked",
    httpPaths: "parseAIGradingQuestionBankAnswerScoringInputPath /v1/teaching/ai-grading-requests/ question-bank-answer-scoring-input",
    httpRequests: "readQuestionBankDraftAnswerScoringInputRequest workerId",
    httpResponses: `
type questionBankDraftAnswerScoringInputResponse struct {
  RequestID string
  Items []questionBankDraftAnswerScoringInputItem
}
type questionBankDraftAnswerScoringInputItem struct {
  AnswerText string
  ExpectedAnswer string
  Explanation string
}
`,
    httpPresenters: "answerText expectedAnswer explanation",
    httpConfig: "ReadQuestionBankDraftAnswerScoringInput",
    main: "readQuestionBankDraftAnswerScoringInput := usecase.NewReadQuestionBankDraftAnswerScoringInput ReadQuestionBankDraftAnswerScoringInput:               readQuestionBankDraftAnswerScoringInput",
    openApiRoot: "/v1/teaching/ai-grading-requests/{requestId}/question-bank-answer-scoring-input",
    openApiPath: "operationId: readTeachingAIGradingQuestionBankAnswerScoringInput AgentApiKey PrincipalContextHeader answerText expectedAnswer explanation",
    packageJson: "audit:student-app-ai-tutor-question-bank-draft-answer-scoring-input",
    qualityGate: "Student App AI Tutor question-bank draft answer scoring input foundation audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftAnswerScoringInput student-app-ai-tutor-question-bank-draft-answer-scoring-input.current.json student_app_ai_tutor_question_bank_draft_answer_scoring_input_foundation",
    verifyStructure: "0268-student-app-ai-tutor-question-bank-draft-answer-scoring-input-foundation.md question_bank_draft_answer_scoring_input.go read_question_bank_draft_answer_scoring_input.go teaching-archive.ai-grading-question-bank-answer-scoring-input.path.yaml",
    architectureBoard: "10.8/10 Student App AI Tutor question-bank draft answer scoring input foundation",
    sdd: "0268 Student App AI Tutor question-bank draft answer scoring input foundation",
  };
}
