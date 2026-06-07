import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PORT,
  claimStudentAppAITutorQuestionBankDraftGenerationPlan,
  formatStudentAppAITutorQuestionBankDraftGenerationWorkerClaim,
} from "./student-app-ai-tutor-question-bank-draft-generation-worker-claim-runtime.mjs";

describe("Student App AI Tutor question-bank draft generation worker claim runtime", () => {
  it("claims a prechecked generation plan through the injected port without model generation or content writes", async () => {
    const port = recordingClaimPort();
    const result = await claimStudentAppAITutorQuestionBankDraftGenerationPlan(baseInput(), {
      generationWorkerClaimPort: port,
      commandLogPath: tempCommandLogPath(),
      generatedAt: "2026-06-06T16:40:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-worker-claimed.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIMED");
    assert.equal(result.claim.planId, "qbank_generation_plan_tutor_req_student_app_001");
    assert.equal(result.claim.status, "IN_PROGRESS");
    assert.equal(result.claim.executionState, "CLAIMED_NOT_GENERATED");
    assert.equal(result.boundary.generationPlanClaimed, true);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.equal(result.boundary.questionContentGenerated, false);
    assert.equal(result.boundary.questionBankContentWriteStarted, false);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].sourcePrecheck.executionState, "PRECHECKED_NOT_CLAIMED");
    assert.match(formatStudentAppAITutorQuestionBankDraftGenerationWorkerClaim(result), /Model started: false/u);
  });

  it("uses idempotency for safe replay and rejects conflicting claims", async () => {
    const commandLogPath = tempCommandLogPath();
    const port = recordingClaimPort();
    const first = await claimStudentAppAITutorQuestionBankDraftGenerationPlan(baseInput(), {
      generationWorkerClaimPort: port,
      commandLogPath,
    });
    const replay = await claimStudentAppAITutorQuestionBankDraftGenerationPlan(baseInput(), {
      generationWorkerClaimPort: port,
      commandLogPath,
    });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.claimInvocationId = "qbank_generation_worker_claim_002";
    await assert.rejects(
      () => claimStudentAppAITutorQuestionBankDraftGenerationPlan(conflicting, {
        generationWorkerClaimPort: port,
        commandLogPath,
      }),
      /record\.inputHash must be/u,
    );
  });

  it("rejects missing ports, unsafe principals, worker mismatch, and unsafe policies", async () => {
    await assert.rejects(
      () => claimStudentAppAITutorQuestionBankDraftGenerationPlan(baseInput(), { commandLogPath: tempCommandLogPath() }),
      /GenerationWorkerClaimPort\.claimGenerationPlan is required/u,
    );

    const unsafePrincipal = baseInput();
    unsafePrincipal.principal.role = "STUDENT";
    await assert.rejects(
      () => claimStudentAppAITutorQuestionBankDraftGenerationPlan(unsafePrincipal, {
        generationWorkerClaimPort: recordingClaimPort(),
        commandLogPath: tempCommandLogPath(),
      }),
      /input\.principal\.role must be SERVICE/u,
    );

    const workerMismatch = baseInput();
    workerMismatch.worker.workerId = "qbank_generation_worker_other";
    await assert.rejects(
      () => claimStudentAppAITutorQuestionBankDraftGenerationPlan(workerMismatch, {
        generationWorkerClaimPort: recordingClaimPort(),
        commandLogPath: tempCommandLogPath(),
      }),
      /input\.worker\.workerId must be qbank_generation_worker_local_001/u,
    );

    for (const field of ["executeModelNowAllowed", "generateQuestionsNowAllowed", "writeQuestionBankContentNowAllowed", "studentVisiblePublishAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.claimPolicy[field] = true;
      await assert.rejects(
        () => claimStudentAppAITutorQuestionBankDraftGenerationPlan(input, {
          generationWorkerClaimPort: recordingClaimPort(),
          commandLogPath: tempCommandLogPath(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }
  });

  it("rejects missing precheck evidence, non-ready prechecks, and already claimed precheck results", async () => {
    const missingEvidence = baseInput();
    missingEvidence.evidenceRefs = ["evidence:other"];
    await assert.rejects(
      () => claimStudentAppAITutorQuestionBankDraftGenerationPlan(missingEvidence, {
        generationWorkerClaimPort: recordingClaimPort(),
        commandLogPath: tempCommandLogPath(),
      }),
      /worker claim precheck evidence ref is required/u,
    );

    const notReady = baseInput();
    notReady.generationWorkerClaimPrecheckReport.readiness = "NEEDS_REMEDIATION";
    await assert.rejects(
      () => claimStudentAppAITutorQuestionBankDraftGenerationPlan(notReady, {
        generationWorkerClaimPort: recordingClaimPort(),
        commandLogPath: tempCommandLogPath(),
      }),
      /input\.generationWorkerClaimPrecheckReport\.readiness must be READY/u,
    );

    const alreadyClaimed = baseInput();
    alreadyClaimed.generationWorkerClaimPrecheckReport.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationWorkerClaimPrecheck.result.boundary.generationPlanClaimed = true;
    await assert.rejects(
      () => claimStudentAppAITutorQuestionBankDraftGenerationPlan(alreadyClaimed, {
        generationWorkerClaimPort: recordingClaimPort(),
        commandLogPath: tempCommandLogPath(),
      }),
      /source\.boundary\.generationPlanClaimed must be false/u,
    );
  });

  it("rejects leaked answers, generated content, and unsafe port results", async () => {
    const leakedTop = baseInput();
    leakedTop.rawModelOutput = "leak";
    await assert.rejects(
      () => claimStudentAppAITutorQuestionBankDraftGenerationPlan(leakedTop, {
        generationWorkerClaimPort: recordingClaimPort(),
        commandLogPath: tempCommandLogPath(),
      }),
      /rawModelOutput is not allowed/u,
    );

    const leakedPrecheck = baseInput();
    leakedPrecheck.generationWorkerClaimPrecheckReport.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationWorkerClaimPrecheck.result.questionContent = "leak";
    await assert.rejects(
      () => claimStudentAppAITutorQuestionBankDraftGenerationPlan(leakedPrecheck, {
        generationWorkerClaimPort: recordingClaimPort(),
        commandLogPath: tempCommandLogPath(),
      }),
      /questionContent is not allowed/u,
    );

    const unsafePort = recordingClaimPort({ modelInferenceStarted: true });
    await assert.rejects(
      () => claimStudentAppAITutorQuestionBankDraftGenerationPlan(baseInput(), {
        generationWorkerClaimPort: unsafePort,
        commandLogPath: tempCommandLogPath(),
      }),
      /portResult\.claim\.modelInferenceStarted must be false/u,
    );
  });
});

function tempCommandLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-generation-worker-claim-")), "claim.jsonl");
}

function baseInput() {
  const report = JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck.current.json", "utf8"));
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-worker-claim.v1",
    claimInvocationId: "qbank_generation_worker_claim_001",
    generationWorkerClaimPrecheckReport: report,
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
    evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck:qbank_generation_worker_precheck_tutor_req_student_app_001"],
    idempotencyKey: "student-app-ai-tutor-qbank-generation-worker-claim:student_001:qbank_generation_plan_tutor_req_student_app_001",
  };
}

function claimPolicy() {
  return {
    sourcePrecheckRequired: true,
    atomicClaimRequired: true,
    skipLockedRequired: true,
    leaseRequired: true,
    idempotentClaimRequired: true,
    workerMustMatchPrecheck: true,
    humanReviewRequiredBeforeStudentVisibility: true,
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
    precheckStatusRequired: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECKED",
    precheckExecutionStateRequired: "PRECHECKED_NOT_CLAIMED",
    claimExecutionState: "CLAIMED_NOT_GENERATED",
    queueName: "student_app_ai_tutor_question_bank_generation",
    targetUseCase: "ClaimQuestionBankDraftGenerationPlan.Execute",
    repositoryOperation: "ArchiveRepository.ClaimQuestionBankDraftGenerationPlan",
    futureGenerationUseCase: "GenerateQuestionBankDraftContent.Execute",
    futureStorageRepository: "ArchiveRepository.SaveQuestionBankDraftContent",
    targetContentTable: "teaching_question_bank_draft_contents",
  };
}

function recordingClaimPort(overrides = {}) {
  return {
    calls: [],
    async claimGenerationPlan(request) {
      this.calls.push(request);
      return {
        source: {
          commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PORT,
          targetUseCase: "ClaimQuestionBankDraftGenerationPlan.Execute",
          repositoryOperation: "ArchiveRepository.ClaimQuestionBankDraftGenerationPlan",
          targetCommandLog: "student-command-log/question-bank-draft-generation-worker-claim",
          atomicSkipLocked: true,
        },
        claim: {
          claimId: "qbank_generation_claim_tutor_req_student_app_001",
          planId: request.sourcePrecheck.planId,
          workerId: request.worker.workerId,
          status: "IN_PROGRESS",
          executionState: "CLAIMED_NOT_GENERATED",
          claimExpiresAt: "2026-06-06T16:42:00.000Z",
          modelInferenceStarted: false,
          questionContentGenerated: false,
          ...overrides,
        },
      };
    },
  };
}
