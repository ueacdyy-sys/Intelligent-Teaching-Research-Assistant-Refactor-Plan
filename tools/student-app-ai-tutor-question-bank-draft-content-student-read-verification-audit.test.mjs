import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftContentStudentReadVerification,
  formatStudentAppAITutorQuestionBankDraftContentStudentReadVerificationAudit,
} from "./student-app-ai-tutor-question-bank-draft-content-student-read-verification-audit.mjs";

describe("Student App AI Tutor question-bank draft content student read verification audit", () => {
  it("passes when student read verification consumes row verification and the safe read foundation", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftContentStudentReadVerification(currentInputs(), {
      generatedAt: "2026-06-06T19:20:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_content_student_read_verification_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftContentStudentReadVerification.result;
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFIED");
    assert.equal(result.studentReadSource.targetUseCase, "ReadStudentAppQuestionBankDraftContent.Execute");
    assert.equal(result.studentQuestionBankDraftContent.items.length, 3);
    assert.equal(result.boundary.ownStudentSafeReadVerified, true);
    assert.equal(result.boundary.answerKeyDisclosed, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftContentStudentReadVerificationAudit(report), /student read verification runtime: READY/u);
  });

  it("fails when row verification or content read foundation evidence is missing or unsafe", async () => {
    const missingRow = currentInputs();
    const rowReport = JSON.parse(missingRow.contentRowVerificationReport);
    rowReport.runtime.status = "NOT_VERIFIED";
    missingRow.contentRowVerificationReport = JSON.stringify(rowReport);

    let report = await auditStudentAppAITutorQuestionBankDraftContentStudentReadVerification(missingRow);
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.content_row_verified").passed, false);

    const unsafeRead = currentInputs();
    const readReport = JSON.parse(unsafeRead.contentReadFoundationReport);
    readReport.safetyInvariants.exposesExpectedAnswer = true;
    unsafeRead.contentReadFoundationReport = JSON.stringify(readReport);
    report = await auditStudentAppAITutorQuestionBankDraftContentStudentReadVerification(unsafeRead);
    assert.equal(report.findings.find((finding) => finding.id === "source.content_read_foundation_safe").passed, false);
  });

  it("fails when runtime claims DB, HTTP, answer leakage, scoring, model, tool, or Swarm access", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\ndirectDatabaseAccessAllowed: true\nfetch(\nstudentAnsweringStarted: true\nscoringStarted: true\nexpectedAnswerDisclosed: true\nmodelInferenceStarted: true\nswarmAllowed: true\n`;

    const report = await auditStudentAppAITutorQuestionBankDraftContentStudentReadVerification(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the student read verification boundary budget", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftContentStudentReadVerification(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when Go read evidence, response safety, quality hooks, or board references omit 0287", async () => {
    const inputs = currentInputs();
    inputs.usecase = "package usecase";
    inputs.repository = "SELECT * FROM teaching_question_bank_draft_contents";
    inputs.responses = "type studentAppQuestionBankDraftContentResponse struct { StudentID string }\ntype questionBankDraftItemResponse struct { ExpectedAnswer string }";
    inputs.openApiPath = "expectedAnswer studentId";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("studentAppAiTutorQuestionBankDraftContentStudentReadVerification", "studentAppAiTutorQuestionBankDraftContentRead");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("student-read-verification", "content-read-foundation");
    inputs.sdd = "content read foundation only";
    inputs.architectureBoard = "10.26/10 content row verification only";

    const report = await auditStudentAppAITutorQuestionBankDraftContentStudentReadVerification(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "go_http_openapi_student_safe_read_evidence").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "student_response_excludes_answer_key_and_internal_fields").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION_PORT",
      "StudentAppAITutorQuestionBankDraftContentStudentReadVerificationPort.verifyStudentSafeQuestionBankDraftContentRead",
      "verifyStudentAppAITutorQuestionBankDraftContentStudentRead",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION_READY",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFIED",
      "StudentQuestionBankDraftContentReadPort.readStudentAppQuestionBankDraftContent is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "ownStudentSafeReadVerified: true",
      "safeStudentResponseMatchedVerifiedPreview: true",
      "expectedAnswerDisclosed: false",
      "explanationDisclosed: false",
      "answerKeyDisclosed: false",
      "studentIdDisclosed: false",
      "workerStateDisclosed: false",
      "studentAnsweringStarted: false",
      "scoringStarted: false",
      "modelInferenceStarted: false",
      "goUseCaseReadAllowed: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "requiresFutureAnsweringAndScoring: true",
    ].join("\n"),
    runtimeTest: [
      "verifies own-student safe content reads through the injected read port",
      "uses idempotency for replay and rejects conflicting student read verification",
      "rejects missing port, missing content, cross-student principal, and mismatched safe responses",
      "rejects answer, explanation, student id, worker, score, unsafe text, DB, HTTP, model, and Swarm leaks",
      "requires row verification and content read foundation evidence while keeping answering and scoring future-gated",
    ].join("\n"),
    contentRowVerificationReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-content-row-verification.current.json", "utf8"),
    contentReadFoundationReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-content-read.current.json", "utf8"),
    contentReadFoundationAudit: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_READ_FOUNDATION ReadStudentAppQuestionBankDraftContent.Execute ownStudentOnly exposesExpectedAnswer",
    usecase: "func (uc *ReadStudentAppQuestionBankDraftContent) Execute NormalizeReadStudentAppQuestionBankDraftContentInput GetQuestionBankDraftContentForStudent",
    usecaseTest: "TestReadStudentAppQuestionBankDraftContentReturnsOwnDraftContent RejectsCrossStudentRepositoryLeak",
    http: "readStudentAppQuestionBankDraftContent toStudentAppQuestionBankDraftContentResponse",
    httpTest: "TestReadStudentAppQuestionBankDraftContentReturnsOwnContent TestReadStudentAppQuestionBankDraftContentRejectsCrossStudent",
    presenter: "func toStudentAppQuestionBankDraftContentResponse() { QuestionText: item.QuestionText LearningTarget: item.LearningTarget }",
    responses: "type studentAppQuestionBankDraftContentResponse struct { QuestionBankDraftRef string Items []questionBankDraftItemResponse }\ntype questionBankDraftItemResponse struct { QuestionText string LearningTarget string }",
    openApiPath: "operationId: readStudentAppQuestionBankDraftContent questionText learningTarget",
    repository: "GetQuestionBankDraftContentForStudent question_bank_draft_ref = $1 student_id = $2",
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-content-student-read-verification": "node tools/student-app-ai-tutor-question-bank-draft-content-student-read-verification-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft content student read verification runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftContentStudentReadVerification\nstudent-app-ai-tutor-question-bank-draft-content-student-read-verification.current.json\nstudent_app_ai_tutor_question_bank_draft_content_student_read_verification_runtime",
    verifyStructure: "0287-student-app-ai-tutor-question-bank-draft-content-student-read-verification.md\nstudent-app-ai-tutor-question-bank-draft-content-student-read-verification-runtime.mjs\nstudent-app-ai-tutor-question-bank-draft-content-student-read-verification-runtime.test.mjs\nstudent-app-ai-tutor-question-bank-draft-content-student-read-verification-audit.mjs\nstudent-app-ai-tutor-question-bank-draft-content-student-read-verification-audit.test.mjs",
    sdd: "Student App AI Tutor question-bank draft content student read verification ReadStudentAppQuestionBankDraftContent.Execute",
    architectureBoard: "10.27/10 STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFIED student_app_ai_tutor_question_bank_draft_content_student_read_verification_runtime",
  };
}
