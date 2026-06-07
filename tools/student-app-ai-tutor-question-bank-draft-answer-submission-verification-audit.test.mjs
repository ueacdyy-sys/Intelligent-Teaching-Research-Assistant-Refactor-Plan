import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerSubmissionVerification,
  formatStudentAppAITutorQuestionBankDraftAnswerSubmissionVerificationAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-submission-verification-audit.mjs";

describe("Student App AI Tutor question-bank draft answer submission verification audit", () => {
  it("passes when answer submission verification consumes safe read verification and the submission foundation", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftAnswerSubmissionVerification(currentInputs(), {
      generatedAt: "2026-06-06T20:20:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_submission_verification_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerSubmissionVerification.result;
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFIED");
    assert.equal(result.answerSubmissionSource.targetUseCase, "SubmitStudentAppQuestionBankDraftAnswer.ExecuteWithPersistence");
    assert.equal(result.studentQuestionBankDraftAnswerSubmission.answerCount, 2);
    assert.equal(result.boundary.answerSubmissionPersisted, true);
    assert.equal(result.boundary.answerTextDisclosed, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerSubmissionVerificationAudit(report), /answer submission verification runtime: READY/u);
  });

  it("fails when safe content read verification or answer submission foundation evidence is missing or unsafe", async () => {
    const missingRead = currentInputs();
    const readReport = JSON.parse(missingRead.contentStudentReadVerificationReport);
    readReport.runtime.status = "NOT_VERIFIED";
    missingRead.contentStudentReadVerificationReport = JSON.stringify(readReport);

    let report = await auditStudentAppAITutorQuestionBankDraftAnswerSubmissionVerification(missingRead);
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.content_student_read_verified").passed, false);

    const unsafeFoundation = currentInputs();
    const foundationReport = JSON.parse(unsafeFoundation.answerSubmissionFoundationReport);
    foundationReport.safetyInvariants.responseExposesAnswerText = true;
    unsafeFoundation.answerSubmissionFoundationReport = JSON.stringify(foundationReport);
    report = await auditStudentAppAITutorQuestionBankDraftAnswerSubmissionVerification(unsafeFoundation);
    assert.equal(report.findings.find((finding) => finding.id === "source.answer_submission_foundation_ready").passed, false);
  });

  it("fails when runtime claims DB, HTTP, answer leakage, scoring, model, tool, or Swarm access", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\ndirectDatabaseAccessAllowed: true\nfetch(\nanswerTextDisclosed: true\nscoringStarted: true\nmodelInferenceStarted: true\nswarmAllowed: true\n`;

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerSubmissionVerification(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the answer submission verification boundary budget", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftAnswerSubmissionVerification(currentInputs(), { probeP99Ms: 90 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when Go submission evidence, metadata-only response, quality hooks, or board references omit 0288", async () => {
    const inputs = currentInputs();
    inputs.usecase = "package usecase";
    inputs.repository = "SELECT * FROM teaching_question_bank_draft_answer_submissions";
    inputs.responses = "type questionBankDraftAnswerSubmissionResponse struct { AnswerText string; ScoreSummary string }";
    inputs.openApiPath = "responses: answerText scoreSummary";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("studentAppAiTutorQuestionBankDraftAnswerSubmissionVerification", "studentAppAiTutorQuestionBankDraftAnswerSubmission");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("0288", "0266");
    inputs.sdd = "answer submission foundation only";
    inputs.architectureBoard = "10.27/10 content student read verification only";

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerSubmissionVerification(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "go_http_openapi_answer_submission_evidence").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "student_response_metadata_only").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerSubmissionVerificationPort.verifyStudentSafeQuestionBankDraftAnswerSubmission",
      "verifyStudentAppAITutorQuestionBankDraftAnswerSubmission",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION_READY",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFIED",
      "StudentQuestionBankDraftAnswerSubmissionPort.submitStudentAppQuestionBankDraftAnswer is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "submittedAnswersMatchedReadItems: true",
      "answerSubmissionPersisted: true",
      "responseMetadataOnly: true",
      "answerTextDisclosed: false",
      "expectedAnswerDisclosed: false",
      "explanationDisclosed: false",
      "answerKeyDisclosed: false",
      "workerStateDisclosed: false",
      "scoringStarted: false",
      "feedbackPublicationStarted: false",
      "studentVisiblePublished: false",
      "modelInferenceStarted: false",
      "goUseCaseSubmissionAllowed: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "requiresFutureScoringAndReviewedFeedback: true",
    ].join("\n"),
    runtimeTest: [
      "verifies own-student answer submissions through the injected submission port",
      "uses idempotency for replay and rejects conflicting answer submission verification",
      "rejects missing port, missing persistence, cross-student principal, unknown item, duplicate answer, and response mismatch",
      "rejects answer text, answer key, scoring, worker, DB, HTTP, model, tool, and Swarm leaks",
      "requires content read verification and answer submission foundation evidence while keeping scoring and feedback future-gated",
    ].join("\n"),
    contentStudentReadVerificationReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-content-student-read-verification.current.json", "utf8"),
    answerSubmissionFoundationReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-submission.current.json", "utf8"),
    answerSubmissionFoundationAudit: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_FOUNDATION SubmitStudentAppQuestionBankDraftAnswer.ExecuteWithPersistence ownStudentWriteRequired responseExposesAnswerText scoringAllowed",
    domain: "NormalizeSubmitStudentAppQuestionBankDraftAnswerInput ScopeStudentOwnWrite validateSubmittedAnswersAgainstDraft",
    domainTest: "RejectsUnknownDraftItem",
    usecase: "SubmitStudentAppQuestionBankDraftAnswer ExecuteWithPersistence GetQuestionBankDraftContentForStudent SubmitQuestionBankDraftAnswerSubmission",
    usecaseTest: "TestSubmitStudentAppQuestionBankDraftAnswerReturnsMetadataOnly TestSubmitStudentAppQuestionBankDraftAnswerRejectsCrossStudentDraft",
    http: "http.MethodPost /v1/student-app/question-bank-draft-answer-submissions toQuestionBankDraftAnswerSubmissionResponse",
    httpTest: "TestSubmitStudentAppQuestionBankDraftAnswerReturnsMetadataOnly TestSubmitStudentAppQuestionBankDraftAnswerRejectsCrossStudentDraft",
    responses: "type questionBankDraftAnswerSubmissionResponse struct { QuestionBankDraftRef string AnswerCount int SubmittedAt string }",
    openApiPath: "operationId: submitStudentAppQuestionBankDraftAnswerSubmission requestBody answerText responses: answerCount submittedAt",
    repository: "SubmitQuestionBankDraftAnswerSubmission $8::jsonb",
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-answer-submission-verification": "node tools/student-app-ai-tutor-question-bank-draft-answer-submission-verification-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft answer submission verification runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftAnswerSubmissionVerification\nstudent-app-ai-tutor-question-bank-draft-answer-submission-verification.current.json\nstudent_app_ai_tutor_question_bank_draft_answer_submission_verification_runtime",
    verifyStructure: "0288-student-app-ai-tutor-question-bank-draft-answer-submission-verification.md\nstudent-app-ai-tutor-question-bank-draft-answer-submission-verification-runtime.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-submission-verification-runtime.test.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-submission-verification-audit.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-submission-verification-audit.test.mjs",
    sdd: "Student App AI Tutor question-bank draft answer submission verification SubmitStudentAppQuestionBankDraftAnswer.ExecuteWithPersistence",
    architectureBoard: "10.28/10 STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFIED student_app_ai_tutor_question_bank_draft_answer_submission_verification_runtime",
  };
}
