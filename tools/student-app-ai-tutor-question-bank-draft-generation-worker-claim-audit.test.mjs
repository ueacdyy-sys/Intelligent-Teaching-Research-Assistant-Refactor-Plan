import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftGenerationWorkerClaim,
  formatStudentAppAITutorQuestionBankDraftGenerationWorkerClaimAudit,
} from "./student-app-ai-tutor-question-bank-draft-generation-worker-claim-audit.mjs";

describe("Student App AI Tutor question-bank draft generation worker claim audit", () => {
  it("passes when worker claim is wired as a lease-only control-plane runtime", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftGenerationWorkerClaim(currentInputs(), {
      generatedAt: "2026-06-06T16:40:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_generation_worker_claim_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationWorkerClaim.result;
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIMED");
    assert.equal(result.boundary.generationPlanClaimed, true);
    assert.equal(result.boundary.questionContentGenerated, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftGenerationWorkerClaimAudit(report), /worker claim runtime: READY/u);
  });

  it("fails when source precheck evidence is missing or already claimed", async () => {
    const inputs = currentInputs();
    const source = JSON.parse(inputs.sourcePrecheckReport);
    source.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationWorkerClaimPrecheck.result.precheckDecision.executionState = "CLAIMED";
    inputs.sourcePrecheckReport = JSON.stringify(source);

    const report = await auditStudentAppAITutorQuestionBankDraftGenerationWorkerClaim(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source_precheck.ready_not_claimed").passed, false);
  });

  it("fails when runtime claims model execution, generated content, raw DB, HTTP, or Swarm", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nexecuteModelNowAllowed: true\ngenerateQuestionsNowAllowed: true\nquestionContentGenerated: true\nfetch(\npostgres://\nswarmAllowed: true\n`;

    const report = await auditStudentAppAITutorQuestionBankDraftGenerationWorkerClaim(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the worker claim boundary budget", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftGenerationWorkerClaim(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when tests, package script, root hooks, SDD, or board omit 0280", async () => {
    const inputs = currentInputs();
    inputs.runtimeTest = "happy path only";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = "studentAppAiTutorQuestionBankDraftGenerationWorkerClaimPrecheck";
    inputs.verifyStructure = "0279 only";
    inputs.sdd = "0279 only";
    inputs.architectureBoard = "10.19/10 only";

    const report = await auditStudentAppAITutorQuestionBankDraftGenerationWorkerClaim(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_worker_claim_negative_paths").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PORT",
      "StudentAppAITutorQuestionBankDraftGenerationWorkerClaimPort.claimGenerationPlan",
      "claimStudentAppAITutorQuestionBankDraftGenerationPlan",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIMED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "sourcePrecheckVerified: true",
      "atomicSkipLockedClaimRequired: true",
      "leaseRecorded: true",
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
      "requiresFutureModelGeneration: true",
      "requiresFutureContentStorageCommit: true",
    ].join("\n"),
    runtimeTest: [
      "claims a prechecked generation plan through the injected port without model generation or content writes",
      "uses idempotency for safe replay and rejects conflicting claims",
      "rejects missing ports, unsafe principals, worker mismatch, and unsafe policies",
      "rejects missing precheck evidence, non-ready prechecks, and already claimed precheck results",
      "rejects leaked answers, generated content, and unsafe port results",
    ].join("\n"),
    sourcePrecheckReport: fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck.current.json", "utf8"),
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-generation-worker-claim": "node tools/student-app-ai-tutor-question-bank-draft-generation-worker-claim-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft generation worker claim runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftGenerationWorkerClaim\nstudent-app-ai-tutor-question-bank-draft-generation-worker-claim.current.json\nstudent_app_ai_tutor_question_bank_draft_generation_worker_claim_runtime",
    verifyStructure: "0280-student-app-ai-tutor-question-bank-draft-generation-worker-claim.md\nstudent-app-ai-tutor-question-bank-draft-generation-worker-claim-runtime.mjs\nstudent-app-ai-tutor-question-bank-draft-generation-worker-claim-runtime.test.mjs\nstudent-app-ai-tutor-question-bank-draft-generation-worker-claim-audit.mjs\nstudent-app-ai-tutor-question-bank-draft-generation-worker-claim-audit.test.mjs",
    sdd: "Student App AI Tutor question-bank draft generation worker claim STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIMED CLAIMED_NOT_GENERATED no model no content write future generation",
    architectureBoard: "10.20/10 Student App AI Tutor question-bank draft generation worker claim STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIMED",
  };
}
