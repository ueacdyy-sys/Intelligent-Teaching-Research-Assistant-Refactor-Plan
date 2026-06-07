import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerScoringRequestVerification,
  formatStudentAppAITutorQuestionBankDraftAnswerScoringRequestVerificationAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification-audit.mjs";

describe("Student App AI Tutor question-bank draft answer scoring request verification audit", () => {
  it("passes when scoring request verification consumes safe answer submission verification and the scoring request foundation", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftAnswerScoringRequestVerification(currentInputs(), {
      generatedAt: "2026-06-06T21:20:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_scoring_request_verification_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerScoringRequestVerification.result;
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFIED");
    assert.equal(result.answerScoringRequestSource.targetUseCase, "CreateStudentAppQuestionBankDraftAnswerScoringRequest.Execute");
    assert.equal(result.studentQuestionBankDraftAnswerScoringRequest.status, "QUEUED");
    assert.equal(result.boundary.scoringRequestQueued, true);
    assert.equal(result.boundary.answerTextDisclosed, false);
    assert.equal(result.boundary.scoringExecutionStarted, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerScoringRequestVerificationAudit(report), /scoring request verification runtime: READY/u);
  });

  it("fails when answer submission verification or scoring request foundation evidence is missing or unsafe", async () => {
    const missingSubmission = currentInputs();
    const submissionReport = JSON.parse(missingSubmission.answerSubmissionVerificationReport);
    submissionReport.runtime.status = "NOT_VERIFIED";
    missingSubmission.answerSubmissionVerificationReport = JSON.stringify(submissionReport);

    let report = await auditStudentAppAITutorQuestionBankDraftAnswerScoringRequestVerification(missingSubmission);
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.answer_submission_verification_ready").passed, false);

    const unsafeFoundation = currentInputs();
    const foundationReport = JSON.parse(unsafeFoundation.answerScoringRequestFoundationReport);
    foundationReport.safetyInvariants.responseExposesAnswerText = true;
    unsafeFoundation.answerScoringRequestFoundationReport = JSON.stringify(foundationReport);
    report = await auditStudentAppAITutorQuestionBankDraftAnswerScoringRequestVerification(unsafeFoundation);
    assert.equal(report.findings.find((finding) => finding.id === "source.answer_scoring_request_foundation_ready").passed, false);
  });

  it("fails when runtime claims DB, HTTP, answer leakage, score/result leakage, worker, model, tool, or Swarm access", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\ndirectDatabaseAccessAllowed: true\nfetch(\nanswerTextDisclosed: true\nscoreDisclosed: true\nresultRefDisclosed: true\nworkerClaimStarted: true\nmodelInferenceStarted: true\nswarmAllowed: true\n`;

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerScoringRequestVerification(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the scoring request verification boundary budget", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftAnswerScoringRequestVerification(currentInputs(), { probeP99Ms: 90 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when Go scoring evidence, quality hooks, or board references omit 0289", async () => {
    const inputs = currentInputs();
    inputs.usecase = "package usecase";
    inputs.domain = "package domain";
    inputs.http = "http.MethodPost";
    inputs.openApiPath = "operationId: createStudentAppQuestionBankDraftAnswerScoringRequest";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("studentAppAiTutorQuestionBankDraftAnswerScoringRequestVerification", "studentAppAiTutorQuestionBankDraftAnswerScoringRequest");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("0289", "0267");
    inputs.sdd = "scoring request foundation only";
    inputs.architectureBoard = "10.28/10 answer submission verification only";

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerScoringRequestVerification(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "go_http_openapi_scoring_request_evidence").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerScoringRequestVerificationPort.verifyStudentSafeQuestionBankDraftAnswerScoringRequest",
      "verifyStudentAppAITutorQuestionBankDraftAnswerScoringRequest",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION_READY",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFIED",
      "StudentQuestionBankDraftAnswerScoringRequestPort.createStudentAppQuestionBankDraftAnswerScoringRequest is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "answerSubmissionVerificationConsumed: true",
      "answerScoringRequestFoundationConsumed: true",
      "injectedScoringRequestPortInvoked: true",
      "verifiedSubmissionQueuedForScoring: true",
      "scoringRequestQueued: true",
      "reusesExistingAIGradingRequestQueue: true",
      "responseMetadataOnly: true",
      "answerTextDisclosed: false",
      "expectedAnswerDisclosed: false",
      "explanationDisclosed: false",
      "answerKeyDisclosed: false",
      "scoreDisclosed: false",
      "resultRefDisclosed: false",
      "workerStateDisclosed: false",
      "workerClaimStarted: false",
      "scoringExecutionStarted: false",
      "feedbackPublicationStarted: false",
      "studentVisiblePublished: false",
      "modelInferenceStarted: false",
      "goUseCaseScoringRequestAllowed: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "requiresFutureWorkerScoringAndReviewedFeedback: true",
    ].join("\n"),
    runtimeTest: [
      "verifies own-student answer scoring requests through the injected scoring request port",
      "uses idempotency for replay and rejects conflicting scoring request verification",
      "rejects missing port, missing queue result, cross-student principal, response mismatch, and item mismatch",
      "rejects answer text, answer key, score, result ref, worker, DB, HTTP, model, tool, and Swarm leaks",
      "requires answer submission verification and scoring request foundation evidence while future-gating scoring and feedback",
    ].join("\n"),
    answerSubmissionVerificationReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-submission-verification.current.json", "utf8"),
    answerScoringRequestFoundationReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-scoring-request.current.json", "utf8"),
    answerScoringRequestFoundationAudit: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_FOUNDATION CreateStudentAppQuestionBankDraftAnswerScoringRequest.Execute ownStudentWriteRequired reusesAIGradingRequestQueue responseExposesAnswerText responseExposesScore",
    domain: "NormalizeCreateStudentAppQuestionBankDraftAnswerScoringRequestInput ScopeStudentOwnWrite ValidateQuestionBankDraftAnswerScoringSource SourceQuestionBankDraftRef SourceQuestionBankAnswerSubmissionID",
    domainTest: "RejectsBrokenSubmissionLinkage",
    usecase: "CreateStudentAppQuestionBankDraftAnswerScoringRequest Execute GetQuestionBankDraftAnswerSubmissionForStudent GetQuestionBankDraftContentForStudent CreateAIGradingRequest",
    usecaseTest: "TestCreateStudentAppQuestionBankDraftAnswerScoringRequestRejectsBrokenSubmissionLinkage",
    http: "http.MethodPost /v1/student-app/question-bank-draft-answer-submissions/ createStudentAppQuestionBankDraftAnswerScoringRequestMetadata",
    httpTest: "TestCreateStudentAppQuestionBankDraftAnswerScoringRequestReturnsMetadataOnly TestCreateStudentAppQuestionBankDraftAnswerScoringRequestRejectsTeacherAndCrossStudent",
    openApiPath: "operationId: createStudentAppQuestionBankDraftAnswerScoringRequest",
    aiGradingDomain: "SourceQuestionBankDraftRef SourceQuestionBankAnswerSubmissionID",
    repository: "CreateAIGradingRequest source_question_bank_draft_ref source_question_bank_answer_submission_id",
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification": "node tools/student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft answer scoring request verification runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftAnswerScoringRequestVerification\nstudent-app-ai-tutor-question-bank-draft-answer-scoring-request-verification.current.json\nstudent_app_ai_tutor_question_bank_draft_answer_scoring_request_verification_runtime",
    verifyStructure: "0289-student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification.md\nstudent-app-ai-tutor-question-bank-draft-answer-scoring-request-verification-runtime.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-scoring-request-verification-runtime.test.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-scoring-request-verification-audit.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-scoring-request-verification-audit.test.mjs",
    sdd: "Student App AI Tutor question-bank draft answer scoring request verification CreateStudentAppQuestionBankDraftAnswerScoringRequest.Execute",
    architectureBoard: "10.29/10 STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFIED student_app_ai_tutor_question_bank_draft_answer_scoring_request_verification_runtime",
  };
}
