import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftGenerationInputEnvelope,
  formatStudentAppAITutorQuestionBankDraftGenerationInputEnvelopeAudit,
} from "./student-app-ai-tutor-question-bank-draft-generation-input-envelope-audit.mjs";

describe("Student App AI Tutor question-bank draft generation input envelope audit", () => {
  it("passes when input envelope is wired as a prompt-blueprint-only runtime", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(currentInputs(), {
      generatedAt: "2026-06-06T16:50:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_generation_input_envelope_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationInputEnvelope.result;
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RECORDED");
    assert.equal(result.boundary.modelInputEnvelopeOnly, true);
    assert.equal(result.boundary.questionContentGenerated, false);
    assert.equal(result.inputEnvelope.itemBlueprints.length, 3);
    assert.match(formatStudentAppAITutorQuestionBankDraftGenerationInputEnvelopeAudit(report), /input envelope runtime: READY/u);
  });

  it("fails when source generation plan or worker claim evidence is missing or mismatched", async () => {
    const inputs = currentInputs();
    const sourceClaim = JSON.parse(inputs.sourceWorkerClaimReport);
    sourceClaim.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationWorkerClaim.result.claim.planId = "qbank_generation_plan_other";
    inputs.sourceWorkerClaimReport = JSON.stringify(sourceClaim);

    const report = await auditStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source_plan_and_claim.ready_matched_not_generated").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "runtime.probe_records_input_envelope").passed, false);
  });

  it("fails when runtime claims model execution, generated content, raw DB, HTTP, or Swarm", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nexecuteModelNowAllowed: true\ngenerateQuestionsNowAllowed: true\nquestionContentGenerated: true\nfetch(\npostgres://\nswarmAllowed: true\n`;

    const report = await auditStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the input-envelope boundary budget", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when tests, package script, root hooks, SDD, or board omit 0281", async () => {
    const inputs = currentInputs();
    inputs.runtimeTest = "happy path only";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = "studentAppAiTutorQuestionBankDraftGenerationWorkerClaim";
    inputs.verifyStructure = "0280 only";
    inputs.sdd = "0280 only";
    inputs.architectureBoard = "10.20/10 only";

    const report = await auditStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_input_envelope_negative_paths").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_PORT",
      "StudentAppAITutorQuestionBankDraftGenerationInputEnvelopePort.recordGenerationInputEnvelope",
      "recordStudentAppAITutorQuestionBankDraftGenerationInputEnvelope",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RECORDED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "sourceGenerationPlanVerified: true",
      "sourceWorkerClaimVerified: true",
      "modelInputEnvelopeOnly: true",
      "promptBlueprintsPrepared: true",
      "answerKeyExcluded: true",
      "generationPlanClaimed: true",
      "modelInferenceStarted: false",
      "questionContentGenerated: false",
      "questionBankContentWriteStarted: false",
      "studentAnsweringStarted: false",
      "scoringStarted: false",
      "studentVisiblePublished: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "requiresFutureReviewedModelGeneration: true",
      "requiresFutureContentStorageCommit: true",
    ].join("\n"),
    runtimeTest: [
      "records a safe model-input envelope from a claimed generation plan without model generation",
      "uses idempotency for safe replay and rejects conflicting envelopes",
      "rejects missing ports, unsafe principals, worker mismatch, and unsafe policies",
      "rejects non-ready sources and generation plan or claim mismatches",
      "rejects leaked answers, generated content, unsafe port results, and missing evidence",
    ].join("\n"),
    sourceGenerationPlanReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-plan.current.json", "utf8"),
    sourceWorkerClaimReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-worker-claim.current.json", "utf8"),
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-generation-input-envelope": "node tools/student-app-ai-tutor-question-bank-draft-generation-input-envelope-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft generation input envelope runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftGenerationInputEnvelope\nstudent-app-ai-tutor-question-bank-draft-generation-input-envelope.current.json\nstudent_app_ai_tutor_question_bank_draft_generation_input_envelope_runtime",
    verifyStructure: "0281-student-app-ai-tutor-question-bank-draft-generation-input-envelope.md\nstudent-app-ai-tutor-question-bank-draft-generation-input-envelope-runtime.mjs\nstudent-app-ai-tutor-question-bank-draft-generation-input-envelope-runtime.test.mjs\nstudent-app-ai-tutor-question-bank-draft-generation-input-envelope-audit.mjs\nstudent-app-ai-tutor-question-bank-draft-generation-input-envelope-audit.test.mjs",
    sdd: "Student App AI Tutor question-bank draft generation input envelope STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RECORDED INPUT_ENVELOPE_RECORDED_NOT_GENERATED no model no content write future generation",
    architectureBoard: "10.21/10 Student App AI Tutor question-bank draft generation input envelope STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RECORDED",
  };
}
