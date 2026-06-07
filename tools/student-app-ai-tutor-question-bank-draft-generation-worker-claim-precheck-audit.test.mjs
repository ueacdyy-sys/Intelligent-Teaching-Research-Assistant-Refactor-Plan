import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck,
  formatStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheckAudit,
} from "./student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck-audit.mjs";

describe("Student App AI Tutor question-bank draft generation worker claim precheck audit", () => {
  it("passes when worker claim precheck is wired as a control-plane runtime", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck(currentInputs(), {
      generatedAt: "2026-06-06T16:30:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_generation_worker_claim_precheck_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationWorkerClaimPrecheck.result;
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECKED");
    assert.equal(result.boundary.generationPlanClaimed, false);
    assert.equal(result.boundary.questionContentGenerated, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheckAudit(report), /worker claim precheck runtime: READY/u);
  });

  it("fails when source generation plan evidence is missing or already generated", async () => {
    const inputs = currentInputs();
    const source = JSON.parse(inputs.sourcePlanReport);
    source.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationPlan.result.generationPlan.executionState = "GENERATED";
    inputs.sourcePlanReport = JSON.stringify(source);

    const report = await auditStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source_generation_plan.ready_not_generated").passed, false);
  });

  it("fails when runtime claims actual claim, model execution, generated content, raw DB, HTTP, or Swarm", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nclaimPlanNowAllowed: true\nexecuteModelNowAllowed: true\ngenerateQuestionsNowAllowed: true\nquestionContentGenerated: true\nfetch(\npostgres://\nswarmAllowed: true\n`;

    const report = await auditStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the worker claim precheck boundary budget", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck(currentInputs(), { probeP99Ms: 95 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when tests, package script, root hooks, SDD, or board omit 0279", async () => {
    const inputs = currentInputs();
    inputs.runtimeTest = "happy path only";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = "studentAppAiTutorQuestionBankDraftGenerationPlan";
    inputs.verifyStructure = "0278 only";
    inputs.sdd = "0278 only";
    inputs.architectureBoard = "10.18/10 only";

    const report = await auditStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_worker_claim_precheck_negative_paths").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_PORT",
      "StudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheckPort.recordGenerationWorkerClaimPrecheck",
      "recordStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECKED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "precheckOnly: true",
      "sourceGenerationPlanVerified: true",
      "workerLeasePolicyChecked: true",
      "workerBudgetChecked: true",
      "generationPlanClaimed: false",
      "modelInferenceStarted: false",
      "questionContentGenerated: false",
      "questionBankContentWriteStarted: false",
      "studentAnsweringStarted: false",
      "scoringStarted: false",
      "studentVisiblePublished: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "requiresFutureAtomicClaim: true",
      "requiresFutureModelGeneration: true",
      "requiresFutureContentStorageCommit: true",
    ].join("\n"),
    runtimeTest: [
      "records a worker claim precheck through the injected port without claiming, generating, or writing content",
      "uses idempotency for safe replay and rejects conflicting worker prechecks",
      "rejects missing ports, unsafe principals, invalid workers, and unsafe policies",
      "rejects missing plan evidence, generated plans, and worker budgets that cannot cover the plan",
      "rejects leaked answer keys, generated content, and model output in precheck inputs or source plan",
    ].join("\n"),
    sourcePlanReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-plan.current.json", "utf8"),
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck": "node tools/student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft generation worker claim precheck runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftGenerationWorkerClaimPrecheck\nstudent-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck.current.json\nstudent_app_ai_tutor_question_bank_draft_generation_worker_claim_precheck_runtime",
    verifyStructure: "0279-student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck.md\nstudent-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck-runtime.mjs\nstudent-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck-runtime.test.mjs\nstudent-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck-audit.mjs\nstudent-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck-audit.test.mjs",
    sdd: "Student App AI Tutor question-bank draft generation worker claim precheck STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECKED precheckOnly no model no content write future claim",
    architectureBoard: "10.19/10 Student App AI Tutor question-bank draft generation worker claim precheck STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECKED",
  };
}
