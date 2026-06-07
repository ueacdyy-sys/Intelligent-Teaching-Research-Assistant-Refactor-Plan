import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_PORT,
  formatStudentAppAITutorQuestionBankDraftGenerationInputEnvelope,
  recordStudentAppAITutorQuestionBankDraftGenerationInputEnvelope,
} from "./student-app-ai-tutor-question-bank-draft-generation-input-envelope-runtime.mjs";

describe("Student App AI Tutor question-bank draft generation input envelope runtime", () => {
  it("records a safe model-input envelope from a claimed generation plan without model generation", async () => {
    const port = recordingEnvelopePort();
    const result = await recordStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(baseInput(), {
      generationInputEnvelopePort: port,
      envelopeLogPath: tempEnvelopeLogPath(),
      generatedAt: "2026-06-06T16:50:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-input-envelope-recorded.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RECORDED");
    assert.equal(result.inputEnvelope.planId, "qbank_generation_plan_tutor_req_student_app_001");
    assert.equal(result.inputEnvelope.claimId, "qbank_generation_claim_tutor_req_student_app_001");
    assert.equal(result.inputEnvelope.itemBlueprints.length, 3);
    assert.equal(result.inputEnvelope.safetyConstraints.answerKeyExcluded, true);
    assert.equal(result.boundary.modelInputEnvelopeOnly, true);
    assert.equal(result.boundary.promptBlueprintsPrepared, true);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.equal(result.boundary.questionContentGenerated, false);
    assert.equal(result.boundary.questionBankContentWriteStarted, false);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].promptEnvelopeDraft.itemBlueprints.length, 3);
    assert.match(formatStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(result), /Model started: false/u);
  });

  it("uses idempotency for safe replay and rejects conflicting envelopes", async () => {
    const envelopeLogPath = tempEnvelopeLogPath();
    const port = recordingEnvelopePort();
    const first = await recordStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(baseInput(), {
      generationInputEnvelopePort: port,
      envelopeLogPath,
    });
    const replay = await recordStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(baseInput(), {
      generationInputEnvelopePort: port,
      envelopeLogPath,
    });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(envelopeLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.envelopeInvocationId = "qbank_generation_input_envelope_002";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(conflicting, {
        generationInputEnvelopePort: port,
        envelopeLogPath,
      }),
      /record\.inputHash must be/u,
    );
  });

  it("rejects missing ports, unsafe principals, worker mismatch, and unsafe policies", async () => {
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(baseInput(), { envelopeLogPath: tempEnvelopeLogPath() }),
      /GenerationInputEnvelopePort\.recordGenerationInputEnvelope is required/u,
    );

    const unsafePrincipal = baseInput();
    unsafePrincipal.principal.role = "STUDENT";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(unsafePrincipal, {
        generationInputEnvelopePort: recordingEnvelopePort(),
        envelopeLogPath: tempEnvelopeLogPath(),
      }),
      /input\.principal\.role must be SERVICE/u,
    );

    const workerMismatch = baseInput();
    workerMismatch.worker.workerId = "qbank_generation_worker_other";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(workerMismatch, {
        generationInputEnvelopePort: recordingEnvelopePort(),
        envelopeLogPath: tempEnvelopeLogPath(),
      }),
      /input\.worker\.workerId must be qbank_generation_worker_local_001/u,
    );

    for (const field of ["executeModelNowAllowed", "generateQuestionsNowAllowed", "writeQuestionBankContentNowAllowed", "studentVisiblePublishAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.envelopePolicy[field] = true;
      await assert.rejects(
        () => recordStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(input, {
          generationInputEnvelopePort: recordingEnvelopePort(),
          envelopeLogPath: tempEnvelopeLogPath(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }
  });

  it("rejects non-ready sources and generation plan or claim mismatches", async () => {
    const notReady = baseInput();
    notReady.generationPlanReport.readiness = "NEEDS_REMEDIATION";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(notReady, {
        generationInputEnvelopePort: recordingEnvelopePort(),
        envelopeLogPath: tempEnvelopeLogPath(),
      }),
      /input\.generationPlanReport\.readiness must be READY/u,
    );

    const mismatch = baseInput();
    mismatch.generationWorkerClaimReport.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationWorkerClaim.result.claim.planId = "qbank_generation_plan_other";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(mismatch, {
        generationInputEnvelopePort: recordingEnvelopePort(),
        envelopeLogPath: tempEnvelopeLogPath(),
      }),
      /source\.claim\.claim\.planId must be qbank_generation_plan_tutor_req_student_app_001/u,
    );

    const alreadyGenerated = baseInput();
    alreadyGenerated.generationWorkerClaimReport.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationWorkerClaim.result.boundary.questionContentGenerated = true;
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(alreadyGenerated, {
        generationInputEnvelopePort: recordingEnvelopePort(),
        envelopeLogPath: tempEnvelopeLogPath(),
      }),
      /source\.claim\.boundary\.questionContentGenerated must be false/u,
    );
  });

  it("rejects leaked answers, generated content, unsafe port results, and missing evidence", async () => {
    const leaked = baseInput();
    leaked.rawModelOutput = "leak";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(leaked, {
        generationInputEnvelopePort: recordingEnvelopePort(),
        envelopeLogPath: tempEnvelopeLogPath(),
      }),
      /rawModelOutput is not allowed/u,
    );

    const generated = baseInput();
    generated.generationPlanReport.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationPlan.result.questionContent = "leak";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(generated, {
        generationInputEnvelopePort: recordingEnvelopePort(),
        envelopeLogPath: tempEnvelopeLogPath(),
      }),
      /questionContent is not allowed/u,
    );

    const unsafePort = recordingEnvelopePort({ modelInferenceStarted: true });
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(baseInput(), {
        generationInputEnvelopePort: unsafePort,
        envelopeLogPath: tempEnvelopeLogPath(),
      }),
      /portResult\.inputEnvelope\.modelInferenceStarted must be false/u,
    );

    const missingEvidence = baseInput();
    missingEvidence.evidenceRefs = [
      "evidence:other",
      "evidence:student-app-ai-tutor-question-bank-draft-generation-worker-claim:qbank_generation_claim_tutor_req_student_app_001",
    ];
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationInputEnvelope(missingEvidence, {
        generationInputEnvelopePort: recordingEnvelopePort(),
        envelopeLogPath: tempEnvelopeLogPath(),
      }),
      /generation plan evidence ref is required/u,
    );
  });
});

function tempEnvelopeLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-generation-input-envelope-")), "envelope.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-input-envelope.v1",
    envelopeInvocationId: "qbank_generation_input_envelope_001",
    generationPlanReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-plan.current.json", "utf8")),
    generationWorkerClaimReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-worker-claim.current.json", "utf8")),
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
    envelopePolicy: envelopePolicy(),
    evidenceRefs: [
      "evidence:student-app-ai-tutor-question-bank-draft-generation-plan:qbank_generation_plan_tutor_req_student_app_001",
      "evidence:student-app-ai-tutor-question-bank-draft-generation-worker-claim:qbank_generation_claim_tutor_req_student_app_001",
    ],
    idempotencyKey: "student-app-ai-tutor-qbank-generation-input-envelope:student_001:qbank_generation_claim_tutor_req_student_app_001",
  };
}

function envelopePolicy() {
  return {
    sourceGenerationPlanRequired: true,
    sourceWorkerClaimRequired: true,
    promptBlueprintRequired: true,
    safetyConstraintsRequired: true,
    answerKeyRemovalRequired: true,
    modelExecutionDeferred: true,
    contentStorageDeferred: true,
    humanReviewRequiredBeforeStudentVisibility: true,
    idempotentEnvelopeRequired: true,
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
    claimExecutionStateRequired: "CLAIMED_NOT_GENERATED",
    envelopeExecutionState: "INPUT_ENVELOPE_RECORDED_NOT_GENERATED",
    targetUseCase: "PrepareQuestionBankDraftGenerationInputEnvelope.Execute",
    futureGenerationUseCase: "GenerateQuestionBankDraftContent.Execute",
    futureStorageRepository: "ArchiveRepository.SaveQuestionBankDraftContent",
    targetContentTable: "teaching_question_bank_draft_contents",
  };
}

function recordingEnvelopePort(overrides = {}) {
  return {
    calls: [],
    async recordGenerationInputEnvelope(request) {
      this.calls.push(request);
      return {
        source: {
          commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_PORT,
          targetUseCase: "PrepareQuestionBankDraftGenerationInputEnvelope.Execute",
          targetCommandLog: "student-command-log/question-bank-draft-generation-input-envelope",
          modelExecutionDeferred: true,
        },
        inputEnvelope: {
          envelopeId: "qbank_generation_input_envelope_tutor_req_student_app_001",
          planId: request.sourceGenerationPlan.planId,
          claimId: request.sourceWorkerClaim.claimId,
          workerId: request.worker.workerId,
          status: "READY_FOR_REVIEWED_GENERATION",
          executionState: "INPUT_ENVELOPE_RECORDED_NOT_GENERATED",
          promptBlueprintCount: request.promptEnvelopeDraft.itemBlueprints.length,
          modelInferenceStarted: false,
          questionContentGenerated: false,
          ...overrides,
        },
      };
    },
  };
}
