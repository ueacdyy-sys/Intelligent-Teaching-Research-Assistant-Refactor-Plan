import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftGenerationContentRowVerification,
  formatStudentAppAITutorQuestionBankDraftGenerationContentRowVerificationAudit,
} from "./student-app-ai-tutor-question-bank-draft-generation-content-row-verification-audit.mjs";

describe("Student App AI Tutor question-bank draft generation content row verification audit", () => {
  it("passes when reviewed generated content physical rows are verified through the scoped read port", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftGenerationContentRowVerification(currentInputs(), {
      generatedAt: "2026-06-06T18:20:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_generation_content_row_verification_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationContentRowVerification.result;
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_PHYSICAL_ROW_VERIFIED");
    assert.equal(result.teachingArchiveContentPhysicalRow.targetTable, "teaching_question_bank_draft_contents");
    assert.equal(result.teachingArchiveContentPhysicalRow.studentScopedLookup, true);
    assert.equal(result.boundary.physicalDatabaseRowVerified, true);
    assert.equal(result.boundary.answerKeyDisclosed, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftGenerationContentRowVerificationAudit(report), /content row verification runtime: READY/u);
  });

  it("fails when content storage commit source evidence is missing or unsafe", async () => {
    const unsafe = currentInputs();
    const commitReport = JSON.parse(unsafe.contentStorageCommitReport);
    commitReport.runtime.status = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_NOT_COMMITTED";
    unsafe.contentStorageCommitReport = JSON.stringify(commitReport);

    let report = await auditStudentAppAITutorQuestionBankDraftGenerationContentRowVerification(unsafe);
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "content_storage_commit.ready_committed").passed, false);

    const unsafeSurface = currentInputs();
    unsafeSurface.contentStorageCommitRuntime = `${unsafeSurface.contentStorageCommitRuntime}\nstudentAnswerKeyDisclosed: true`;
    report = await auditStudentAppAITutorQuestionBankDraftGenerationContentRowVerification(unsafeSurface);
    assert.equal(report.findings.find((finding) => finding.id === "content_storage_commit.safe_surface_preserved").passed, false);
  });

  it("fails when runtime claims direct DB, HTTP, publication, scoring, model, tool, leak, or Swarm", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\ndirectDatabaseAccessAllowed: true\nexecuteHttpRequestAllowed: true\nfetch(\nstudentVisiblePublishAllowed: true\nscoringAllowed: true\nmodelInferenceStarted: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = await auditStudentAppAITutorQuestionBankDraftGenerationContentRowVerification(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the content row verification boundary budget", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftGenerationContentRowVerification(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when Go row read, student presenter, quality hooks, or architecture board omit 0286", async () => {
    const inputs = currentInputs();
    inputs.repository = "package postgres";
    inputs.presenter = "func toStudentAppQuestionBankDraftContentResponse() { ExpectedAnswer: item.ExpectedAnswer }";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("studentAppAiTutorQuestionBankDraftGenerationContentRowVerification", "studentAppAiTutorQuestionBankDraftGenerationContentStorageCommit");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("content-row-verification", "content-storage-commit");
    inputs.sdd = "content storage commit only";
    inputs.architectureBoard = "10.25/10 content storage commit only";

    const report = await auditStudentAppAITutorQuestionBankDraftGenerationContentRowVerification(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "go_repository_scoped_row_read_evidence_exists").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "student_presenter_keeps_answer_key_out").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION_PORT",
      "StudentAppAITutorQuestionBankDraftGenerationContentRowVerificationPort.verifyQuestionBankDraftContentPhysicalRow",
      "verifyStudentAppAITutorQuestionBankDraftGenerationContentPhysicalRow",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION_READY",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_PHYSICAL_ROW_VERIFIED",
      "QuestionBankDraftContentRowReadPort.getQuestionBankDraftContentForStudent is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "physicalDatabaseRowVerified: true",
      "mainDatabaseReadAllowed: true",
      "internalScoringMaterialPresent: true",
      "internalScoringMaterialDisclosed: false",
      "studentVisiblePublished: false",
      "studentAnsweringStarted: false",
      "scoringStarted: false",
      "answerKeyDisclosed: false",
      "rawModelOutputDisclosed: false",
      "modelInferenceStarted: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "requiresFutureStudentReadVerification: true",
    ].join("\n"),
    runtimeTest: [
      "verifies reviewed generated content through the injected scoped row read port",
      "uses idempotency for replay and rejects conflicting content row verification",
      "rejects missing ports, missing rows, mismatched scoped rows, and unsafe row content",
      "rejects direct DB, HTTP, scoring, Swarm, leaked fields, and unsafe student preview",
      "requires storage commit evidence and keeps student read, answering, and scoring future-gated",
    ].join("\n"),
    contentStorageCommitReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-content-storage-commit.current.json", "utf8"),
    contentStorageCommitRuntime: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMITTED\nquestionBankContentWriteCommitted\ncontentStored\nstudentSafeQuestionPreviewOnly\nArchiveRepository.SaveQuestionBankDraftContent\nteaching_question_bank_draft_contents\nstudentAnswerKeyDisclosed: false\nrawModelOutputStored: false\nstudentVisiblePublished: false\nswarmAllowed: false",
    contentStorageCommitAudit: "content storage commit audit",
    repository: "func (r *ArchiveRepository) GetQuestionBankDraftContentForStudent\nFROM teaching_question_bank_draft_contents\nquestion_bank_draft_ref = $1\nstudent_id = $2\nscanQuestionBankDraftContent\nNormalizeQuestionBankDraftContent",
    repositoryTest: "TestGetQuestionBankDraftContentForStudentUsesScopedLookup",
    schema: "CREATE TABLE IF NOT EXISTS teaching_question_bank_draft_contents idx_teaching_question_bank_draft_contents_student_updated",
    sql: "CREATE TABLE IF NOT EXISTS teaching_question_bank_draft_contents idx_teaching_question_bank_draft_contents_student_updated",
    presenter: "func toStudentAppQuestionBankDraftContentResponse() {\nQuestionText:   item.QuestionText,\nLearningTarget: item.LearningTarget,\n}",
    responses: "type questionBankDraftItemResponse struct {\nQuestionText string\nLearningTarget string\n}",
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-generation-content-row-verification": "node tools/student-app-ai-tutor-question-bank-draft-generation-content-row-verification-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft generation content row verification runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftGenerationContentRowVerification\nstudent-app-ai-tutor-question-bank-draft-generation-content-row-verification.current.json\nstudent_app_ai_tutor_question_bank_draft_generation_content_row_verification_runtime",
    verifyStructure: "0286-student-app-ai-tutor-question-bank-draft-generation-content-row-verification.md\nstudent-app-ai-tutor-question-bank-draft-generation-content-row-verification-runtime.mjs\nstudent-app-ai-tutor-question-bank-draft-generation-content-row-verification-runtime.test.mjs\nstudent-app-ai-tutor-question-bank-draft-generation-content-row-verification-audit.mjs\nstudent-app-ai-tutor-question-bank-draft-generation-content-row-verification-audit.test.mjs",
    sdd: "Student App AI Tutor question-bank draft generation content row verification ArchiveRepository.GetQuestionBankDraftContentForStudent teaching_question_bank_draft_contents",
    architectureBoard: "10.26/10 STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_PHYSICAL_ROW_VERIFIED student_app_ai_tutor_question_bank_draft_generation_content_row_verification_runtime",
  };
}
