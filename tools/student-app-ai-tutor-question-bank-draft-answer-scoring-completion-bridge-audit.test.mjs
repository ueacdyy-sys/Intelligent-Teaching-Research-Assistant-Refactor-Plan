import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerScoringCompletionBridge,
  formatStudentAppAITutorQuestionBankDraftAnswerScoringCompletionBridgeAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-scoring-completion-bridge-audit.mjs";

describe("Student App AI Tutor question-bank draft answer scoring completion bridge audit", () => {
  it("passes when completion reuses worker-result and the student result remains safe", () => {
    const report = auditStudentAppAITutorQuestionBankDraftAnswerScoringCompletionBridge(currentInputs(), {
      generatedAt: "2026-06-06T12:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_scoring_completion_bridge");
    assert.equal(report.safetyInvariants.reusesExistingWorkerResultPath, true);
    assert.equal(report.safetyInvariants.duplicateQuestionBankResultEndpointCreated, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerScoringCompletionBridgeAudit(report), /completion bridge: READY/u);
  });

  it("fails when the bridge no longer exercises the existing worker-result endpoint", () => {
    const inputs = currentInputs();
    inputs.bridgeTest = inputs.bridgeTest.replace("/worker-result", "/question-bank-answer-scoring-result");

    const report = auditStudentAppAITutorQuestionBankDraftAnswerScoringCompletionBridge(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "bridge.http_chain_reuses_existing_worker_result").passed, false);
  });

  it("fails when the Student App result contract exposes protected worker fields", () => {
    const inputs = currentInputs();
    inputs.openApiStudentResult += "\nresultRef: { type: string }\nworkerId: { type: string }\n";

    const report = auditStudentAppAITutorQuestionBankDraftAnswerScoringCompletionBridge(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "student.safe_result_after_completion_hides_worker_internals").passed, false);
  });
});

function currentInputs() {
  return {
    bridgeTest: [
      "TestQuestionBankDraftAnswerScoringCompletionBridgeReusesWorkerResultAndStudentSafeRead",
      "/question-bank-answer-scoring-input",
      "/worker-result",
      "/ai-grading-result",
      "ReadQuestionBankDraftAnswerScoringInput",
      "RecordAIGradingResult",
      "ReadStudentAppQuestionBankDraftAnswerScoringResult",
      "sourceQuestionBankAnswerSubmissionId",
      "grading_req_http_qbank_answer_bridge",
      "student result body leaked",
      "answerText",
      "expectedAnswer",
      "explanation",
      "resultRef",
      "workerId",
      "claimedByWorkerId",
      "claimExpiresAt",
    ].join(" "),
    workerInputDomain: "AuthorizeRecordAIGradingResult EntryPointAgentInternal ScopeTeachingWrite canRecordAIGradingResult",
    workerInputUsecase: "ReadQuestionBankDraftAnswerScoringInput.Execute",
    workerResultDomain: "AuthorizeRecordAIGradingResult canRecordAIGradingResult",
    workerResultUsecase: "func (uc *RecordAIGradingResult) Execute",
    workerResultPostgres: "ArchiveRepository RecordAIGradingResult",
    studentResultDomain: "BuildStudentAppQuestionBankDraftAnswerScoringResult scoreSummary errorCode",
    studentResultUsecase: "ReadStudentAppQuestionBankDraftAnswerScoringResult.Execute",
    httpWorker: "operationId: readTeachingAIGradingQuestionBankAnswerScoringInput operationId: recordTeachingAIGradingWorkerResult",
    httpStudent: "ReadStudentAppQuestionBankDraftAnswerScoringResult",
    httpResponses: "toStudentAppQuestionBankDraftAnswerScoringResultResponse",
    httpPresenters: "toStudentAppQuestionBankDraftAnswerScoringResultResponse",
    openApiWorkerInput: "operationId: readTeachingAIGradingQuestionBankAnswerScoringInput",
    openApiWorkerResult: "operationId: recordTeachingAIGradingWorkerResult",
    openApiStudentResult: "scoreSummary errorCode",
    packageJson: "audit:student-app-ai-tutor-question-bank-draft-answer-scoring-completion-bridge",
    qualityGate: "Student App AI Tutor question-bank draft answer scoring completion bridge audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftAnswerScoringCompletionBridge student-app-ai-tutor-question-bank-draft-answer-scoring-completion-bridge.current.json student_app_ai_tutor_question_bank_draft_answer_scoring_completion_bridge",
    verifyStructure: "0270-student-app-ai-tutor-question-bank-draft-answer-scoring-completion-bridge.md server_student_app_question_bank_draft_answer_scoring_completion_test.go",
    architectureBoard: "10.10/10 Student App AI Tutor question-bank draft answer scoring completion bridge",
    sdd: "0270 Student App AI Tutor question-bank draft answer scoring completion bridge does not add a new OpenAPI path model inference runtime detailed feedback schema publication does not change the production hot path",
  };
}
