import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftGenerationPlan,
  formatStudentAppAITutorQuestionBankDraftGenerationPlanAudit,
} from "./student-app-ai-tutor-question-bank-draft-generation-plan-audit.mjs";

describe("Student App AI Tutor question-bank draft generation plan audit", () => {
  it("passes when generation planning is wired as a control-plane runtime", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftGenerationPlan(currentInputs(), {
      generatedAt: "2026-06-06T16:20:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_generation_plan_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationPlan.result;
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RECORDED");
    assert.equal(result.generationPlan.items.length, 3);
    assert.equal(result.boundary.questionContentGenerated, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftGenerationPlanAudit(report), /generation plan runtime: READY/u);
  });

  it("fails when source AI Tutor result evidence is missing or does not contain a draft ref", async () => {
    const inputs = currentInputs();
    const source = JSON.parse(inputs.sourceResultReport);
    source.runtimeProbes.studentAppAiTutorResult.result.result.questionBankDraftRef = "";
    inputs.sourceResultReport = JSON.stringify(source);

    const report = await auditStudentAppAITutorQuestionBankDraftGenerationPlan(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source_result.ready_with_draft_ref").passed, false);
  });

  it("fails when runtime claims model execution, generated content, raw DB, HTTP, or Swarm", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nexecuteModelNowAllowed: true\ngenerateQuestionsNowAllowed: true\nquestionContentGenerated: true\nfetch(\npostgres://\nswarmAllowed: true\n`;

    const report = await auditStudentAppAITutorQuestionBankDraftGenerationPlan(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the generation planning boundary budget", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftGenerationPlan(currentInputs(), { probeP99Ms: 90 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when tests, package script, root hooks, SDD, or board omit 0278", async () => {
    const inputs = currentInputs();
    inputs.runtimeTest = "happy path only";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = "studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveRowVerification";
    inputs.verifyStructure = "0277 only";
    inputs.sdd = "0277 only";
    inputs.architectureBoard = "10.17/10 only";

    const report = await auditStudentAppAITutorQuestionBankDraftGenerationPlan(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_generation_plan_negative_paths").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_PORT",
      "StudentAppAITutorQuestionBankDraftGenerationPlanPort.recordQuestionBankDraftGenerationPlan",
      "recordStudentAppAITutorQuestionBankDraftGenerationPlan",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RECORDED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "generationPlanOnly: true",
      "modelInferenceStarted: false",
      "questionContentGenerated: false",
      "questionBankContentWriteStarted: false",
      "studentAnsweringStarted: false",
      "scoringStarted: false",
      "studentVisiblePublished: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "requiresFutureGenerationWorker: true",
      "requiresFutureContentStorageCommit: true",
    ].join("\n"),
    runtimeTest: [
      "records a generation plan through the injected port without generating questions",
      "uses idempotency for safe replay and rejects conflicting plans",
      "rejects missing ports, unsafe principals, wrong source status, and unsafe policies",
      "rejects cross-student source mismatches, invalid budget, duplicate items, and missing evidence",
      "rejects leaked answer keys and model output in generation plan inputs or planned items",
    ].join("\n"),
    sourceResultReport: fs.readFileSync("reports/student-app-ai-tutor-result.current.json", "utf8"),
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-generation-plan": "node tools/student-app-ai-tutor-question-bank-draft-generation-plan-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft generation plan runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftGenerationPlan\nstudent-app-ai-tutor-question-bank-draft-generation-plan.current.json\nstudent_app_ai_tutor_question_bank_draft_generation_plan_runtime",
    verifyStructure: "0278-student-app-ai-tutor-question-bank-draft-generation-plan.md\nstudent-app-ai-tutor-question-bank-draft-generation-plan-runtime.mjs\nstudent-app-ai-tutor-question-bank-draft-generation-plan-runtime.test.mjs\nstudent-app-ai-tutor-question-bank-draft-generation-plan-audit.mjs\nstudent-app-ai-tutor-question-bank-draft-generation-plan-audit.test.mjs",
    sdd: "Student App AI Tutor question-bank draft generation plan STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RECORDED generationPlanOnly no model no content write future worker",
    architectureBoard: "10.18/10 Student App AI Tutor question-bank draft generation plan STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RECORDED",
  };
}
