import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftGenerationControlledDraft,
  formatStudentAppAITutorQuestionBankDraftGenerationControlledDraftAudit,
} from "./student-app-ai-tutor-question-bank-draft-generation-controlled-draft-audit.mjs";

describe("Student App AI Tutor question-bank draft generation controlled draft audit", () => {
  it("passes when controlled draft generation is wired as a sanitized artifact runtime", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftGenerationControlledDraft(currentInputs(), {
      generatedAt: "2026-06-06T17:10:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_generation_controlled_draft_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationControlledDraft.result;
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RECORDED");
    assert.equal(result.generatedDraft.items.length, 3);
    assert.equal(result.boundary.questionContentGenerated, true);
    assert.equal(result.boundary.answerKeyGenerated, false);
    assert.equal(result.boundary.questionBankContentWriteStarted, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftGenerationControlledDraftAudit(report), /controlled draft runtime: READY/u);
  });

  it("fails when source envelope or model precheck evidence is missing or mismatched", async () => {
    const inputs = currentInputs();
    const sourcePrecheck = JSON.parse(inputs.sourceModelPrecheckReport);
    sourcePrecheck.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationModelExecutionPrecheck.result.modelExecutionPrecheck.envelopeId = "qbank_generation_input_envelope_other";
    inputs.sourceModelPrecheckReport = JSON.stringify(sourcePrecheck);

    const report = await auditStudentAppAITutorQuestionBankDraftGenerationControlledDraft(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source_envelope_and_precheck.ready_matched_not_stored").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "runtime.probe_records_controlled_draft").passed, false);
  });

  it("fails when runtime claims raw output, answers, DB writes, HTTP, or Swarm", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nanswerKeyGenerated: true\nrawModelOutputStored: true\nquestionBankContentWriteStarted: true\nfetch(\npostgres://\nswarmAllowed: true\n`;

    const report = await auditStudentAppAITutorQuestionBankDraftGenerationControlledDraft(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the controlled draft boundary budget", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftGenerationControlledDraft(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when tests, package script, root hooks, SDD, or board omit 0283", async () => {
    const inputs = currentInputs();
    inputs.runtimeTest = "happy path only";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = "studentAppAiTutorQuestionBankDraftGenerationModelExecutionPrecheck";
    inputs.verifyStructure = "0282 only";
    inputs.sdd = "0282 only";
    inputs.architectureBoard = "10.22/10 only";

    const report = await auditStudentAppAITutorQuestionBankDraftGenerationControlledDraft(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_controlled_draft_negative_paths").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_PORT",
      "StudentAppAITutorQuestionBankDraftGenerationControlledDraftPort.recordControlledDraftGeneration",
      "recordStudentAppAITutorQuestionBankDraftGenerationControlledDraft",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RECORDED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "sourceInputEnvelopeVerified: true",
      "sourceModelPrecheckVerified: true",
      "controlledGenerationPortUsed: true",
      "sanitizedQuestionDraftArtifactRecorded: true",
      "questionContentGenerated: true",
      "rawModelOutputStored: false",
      "answerKeyGenerated: false",
      "expectedAnswerGenerated: false",
      "questionBankContentWriteStarted: false",
      "studentAnsweringStarted: false",
      "scoringStarted: false",
      "studentVisiblePublished: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "requiresFutureTeacherReview: true",
      "requiresFutureContentStorageCommit: true",
    ].join("\n"),
    runtimeTest: [
      "records sanitized generated question draft artifacts without content storage",
      "uses idempotency for safe replay and rejects conflicting draft attempts",
      "rejects missing ports, unsafe principals, unsafe output policy, and source mismatches",
      "rejects unsafe source states, leaked model fields, unsafe port results, and unknown items",
      "rejects answer key fields, content storage flags, and missing evidence refs",
    ].join("\n"),
    sourceInputEnvelopeReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-input-envelope.current.json", "utf8"),
    sourceModelPrecheckReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck.current.json", "utf8"),
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-generation-controlled-draft": "node tools/student-app-ai-tutor-question-bank-draft-generation-controlled-draft-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft generation controlled draft runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftGenerationControlledDraft\nstudent-app-ai-tutor-question-bank-draft-generation-controlled-draft.current.json\nstudent_app_ai_tutor_question_bank_draft_generation_controlled_draft_runtime",
    verifyStructure: "0283-student-app-ai-tutor-question-bank-draft-generation-controlled-draft.md\nstudent-app-ai-tutor-question-bank-draft-generation-controlled-draft-runtime.mjs\nstudent-app-ai-tutor-question-bank-draft-generation-controlled-draft-runtime.test.mjs\nstudent-app-ai-tutor-question-bank-draft-generation-controlled-draft-audit.mjs\nstudent-app-ai-tutor-question-bank-draft-generation-controlled-draft-audit.test.mjs",
    sdd: "Student App AI Tutor question-bank draft generation controlled draft STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RECORDED CONTROLLED_DRAFT_RECORDED_NOT_STORED no answer key no content write future review",
    architectureBoard: "10.23/10 Student App AI Tutor question-bank draft generation controlled draft STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RECORDED",
  };
}
