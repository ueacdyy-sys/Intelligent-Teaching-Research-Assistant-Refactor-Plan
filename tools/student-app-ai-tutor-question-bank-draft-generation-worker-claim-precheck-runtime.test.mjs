import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_PORT,
  formatStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck,
  recordStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck,
} from "./student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck-runtime.mjs";

describe("Student App AI Tutor question-bank draft generation worker claim precheck runtime", () => {
  it("records a worker claim precheck through the injected port without claiming, generating, or writing content", async () => {
    const port = recordingPrecheckPort();
    const result = await recordStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck(baseInput(), {
      generationWorkerClaimPrecheckPort: port,
      commandLogPath: tempCommandLogPath(),
      generatedAt: "2026-06-06T16:30:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-worker-claim-prechecked.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECKED");
    assert.equal(result.sourceGenerationPlan.planId, "qbank_generation_plan_tutor_req_student_app_001");
    assert.equal(result.precheckDecision.claimReadiness, "ELIGIBLE_NOT_CLAIMED");
    assert.equal(result.boundary.sourceGenerationPlanVerified, true);
    assert.equal(result.boundary.workerLeasePolicyChecked, true);
    assert.equal(result.boundary.generationPlanClaimed, false);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.equal(result.boundary.questionContentGenerated, false);
    assert.equal(result.boundary.questionBankContentWriteStarted, false);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].sourceGenerationPlan.executionState, "PLAN_RECORDED_NOT_GENERATED");
    assert.match(formatStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck(result), /Model started: false/u);
  });

  it("uses idempotency for safe replay and rejects conflicting worker prechecks", async () => {
    const commandLogPath = tempCommandLogPath();
    const port = recordingPrecheckPort();
    const first = await recordStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck(baseInput(), {
      generationWorkerClaimPrecheckPort: port,
      commandLogPath,
    });
    const replay = await recordStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck(baseInput(), {
      generationWorkerClaimPrecheckPort: port,
      commandLogPath,
    });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.worker.maxConcurrentPlans = 3;
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck(conflicting, {
        generationWorkerClaimPrecheckPort: port,
        commandLogPath,
      }),
      /record\.inputHash must be/u,
    );
  });

  it("rejects missing ports, unsafe principals, invalid workers, and unsafe policies", async () => {
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck(baseInput(), { commandLogPath: tempCommandLogPath() }),
      /GenerationWorkerClaimPrecheckPort\.recordGenerationWorkerClaimPrecheck is required/u,
    );

    const unsafePrincipal = baseInput();
    unsafePrincipal.principal.role = "STUDENT";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck(unsafePrincipal, {
        generationWorkerClaimPrecheckPort: recordingPrecheckPort(),
        commandLogPath: tempCommandLogPath(),
      }),
      /input\.principal\.role must be SERVICE/u,
    );

    const invalidWorker = baseInput();
    invalidWorker.worker.skillId = "tutor_student";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck(invalidWorker, {
        generationWorkerClaimPrecheckPort: recordingPrecheckPort(),
        commandLogPath: tempCommandLogPath(),
      }),
      /input\.worker\.skillId must be generate_question_bank_draft/u,
    );

    for (const field of ["claimPlanNowAllowed", "executeModelNowAllowed", "generateQuestionsNowAllowed", "writeQuestionBankContentNowAllowed", "studentVisiblePublishAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.claimPolicy[field] = true;
      await assert.rejects(
        () => recordStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck(input, {
          generationWorkerClaimPrecheckPort: recordingPrecheckPort(),
          commandLogPath: tempCommandLogPath(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }
  });

  it("rejects missing plan evidence, generated plans, and worker budgets that cannot cover the plan", async () => {
    const missingEvidence = baseInput();
    missingEvidence.evidenceRefs = ["evidence:other"];
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck(missingEvidence, {
        generationWorkerClaimPrecheckPort: recordingPrecheckPort(),
        commandLogPath: tempCommandLogPath(),
      }),
      /generation plan evidence ref is required/u,
    );

    const generatedPlan = baseInput();
    generatedPlan.questionBankDraftGenerationPlanReport.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationPlan.result.generationPlan.executionState = "GENERATED";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck(generatedPlan, {
        generationWorkerClaimPrecheckPort: recordingPrecheckPort(),
        commandLogPath: tempCommandLogPath(),
      }),
      /source\.generationPlan\.executionState must be PLAN_RECORDED_NOT_GENERATED/u,
    );

    const insufficientBudget = baseInput();
    insufficientBudget.worker.maxPlannedQuestionCount = 2;
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck(insufficientBudget, {
        generationWorkerClaimPrecheckPort: recordingPrecheckPort(),
        commandLogPath: tempCommandLogPath(),
      }),
      /worker maxPlannedQuestionCount must cover the source plan/u,
    );
  });

  it("rejects leaked answer keys, generated content, and model output in precheck inputs or source plan", async () => {
    const leakedTop = baseInput();
    leakedTop.rawModelOutput = "leak";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck(leakedTop, {
        generationWorkerClaimPrecheckPort: recordingPrecheckPort(),
        commandLogPath: tempCommandLogPath(),
      }),
      /rawModelOutput is not allowed/u,
    );

    const leakedPlanItem = baseInput();
    leakedPlanItem.questionBankDraftGenerationPlanReport.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationPlan.result.generationPlan.items[0].expectedAnswer = "3/4";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheck(leakedPlanItem, {
        generationWorkerClaimPrecheckPort: recordingPrecheckPort(),
        commandLogPath: tempCommandLogPath(),
      }),
      /expectedAnswer is not allowed/u,
    );
  });
});

function tempCommandLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-generation-worker-claim-precheck-")), "precheck.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-worker-claim-precheck.v1",
    precheckInvocationId: "qbank_generation_worker_precheck_001",
    questionBankDraftGenerationPlanReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-plan.current.json", "utf8")),
    principal: {
      principalId: "svc_student_tutor_agent",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      sessionId: "svc_session_student_tutor_agent",
      scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT"],
    },
    worker: {
      workerId: "qbank_generation_worker_local_001",
      agent: "StudentTutorAgent",
      skillId: "generate_question_bank_draft",
      nodeType: "LOCAL",
      leaseSeconds: 120,
      maxConcurrentPlans: 2,
      maxPlannedQuestionCount: 6,
    },
    claimPolicy: claimPolicy(),
    evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-generation-plan:qbank_generation_plan_tutor_req_student_app_001"],
    idempotencyKey: "student-app-ai-tutor-qbank-generation-worker-claim-precheck:student_001:qbank_generation_plan_tutor_req_student_app_001",
  };
}

function claimPolicy() {
  return {
    sourceGenerationPlanRequired: true,
    precheckOnly: true,
    atomicLeaseRequired: true,
    workerBudgetRequired: true,
    idempotentPrecheckRequired: true,
    humanReviewRequiredBeforeStudentVisibility: true,
    claimPlanNowAllowed: false,
    executeModelNowAllowed: false,
    generateQuestionsNowAllowed: false,
    writeQuestionBankContentNowAllowed: false,
    studentAnsweringAllowed: false,
    scoringAllowed: false,
    studentVisiblePublishAllowed: false,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
    planExecutionStateRequired: "PLAN_RECORDED_NOT_GENERATED",
    queueName: "student_app_ai_tutor_question_bank_generation",
    targetUseCase: "PrecheckQuestionBankDraftGenerationWorkerClaim.Execute",
    futureClaimUseCase: "ClaimQuestionBankDraftGenerationPlan.Execute",
    futureGenerationUseCase: "GenerateQuestionBankDraftContent.Execute",
    futureStorageRepository: "ArchiveRepository.SaveQuestionBankDraftContent",
    targetContentTable: "teaching_question_bank_draft_contents",
  };
}

function recordingPrecheckPort() {
  return {
    calls: [],
    async recordGenerationWorkerClaimPrecheck(request) {
      this.calls.push(request);
      return {
        source: {
          commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_PORT,
          targetUseCase: "PrecheckQuestionBankDraftGenerationWorkerClaim.Execute",
          targetCommandLog: "student-command-log/question-bank-draft-generation-worker-claim-precheck",
        },
        precheckDecision: {
          precheckId: "qbank_generation_worker_precheck_tutor_req_student_app_001",
          planId: request.sourceGenerationPlan.planId,
          workerId: request.worker.workerId,
          executionState: "PRECHECKED_NOT_CLAIMED",
          modelInferenceStarted: false,
          questionContentGenerated: false,
        },
      };
    },
  };
}
