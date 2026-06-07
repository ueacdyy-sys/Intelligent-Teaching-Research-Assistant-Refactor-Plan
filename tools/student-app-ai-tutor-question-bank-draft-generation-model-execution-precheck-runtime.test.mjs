import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_PORT,
  formatStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck,
  recordStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck,
} from "./student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck-runtime.mjs";

describe("Student App AI Tutor question-bank draft generation model execution precheck runtime", () => {
  it("records a reviewed model-queue precheck without starting model generation", async () => {
    const port = recordingPrecheckPort();
    const result = await recordStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck(baseInput(), {
      modelExecutionPrecheckPort: port,
      precheckLogPath: tempPrecheckLogPath(),
      generatedAt: "2026-06-06T17:00:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-model-execution-prechecked.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECKED");
    assert.equal(result.modelExecutionPrecheck.envelopeId, "qbank_generation_input_envelope_tutor_req_student_app_001");
    assert.equal(result.modelExecutionPrecheck.status, "PRECHECKED_FOR_REVIEWED_MODEL_QUEUE");
    assert.equal(result.modelExecutionPrecheck.executionState, "MODEL_EXECUTION_PRECHECKED_NOT_STARTED");
    assert.equal(result.boundary.modelExecutionQueueAdmissionOnly, true);
    assert.equal(result.boundary.futureModelExecutionApproved, true);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.equal(result.boundary.questionContentGenerated, false);
    assert.equal(result.boundary.questionBankContentWriteStarted, false);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].inputEnvelope.itemBlueprintCount, 3);
    assert.match(formatStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck(result), /Model started: false/u);
  });

  it("uses idempotency for safe replay and rejects conflicting prechecks", async () => {
    const precheckLogPath = tempPrecheckLogPath();
    const port = recordingPrecheckPort();
    const first = await recordStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck(baseInput(), {
      modelExecutionPrecheckPort: port,
      precheckLogPath,
    });
    const replay = await recordStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck(baseInput(), {
      modelExecutionPrecheckPort: port,
      precheckLogPath,
    });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(precheckLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.precheckInvocationId = "qbank_generation_model_precheck_002";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck(conflicting, {
        modelExecutionPrecheckPort: port,
        precheckLogPath,
      }),
      /record\.inputHash must be/u,
    );
  });

  it("rejects missing ports, unsafe principals, incomplete approvals, and unsafe policies", async () => {
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck(baseInput(), { precheckLogPath: tempPrecheckLogPath() }),
      /ModelExecutionPrecheckPort\.recordModelExecutionPrecheck is required/u,
    );

    const unsafePrincipal = baseInput();
    unsafePrincipal.principal.role = "STUDENT";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck(unsafePrincipal, {
        modelExecutionPrecheckPort: recordingPrecheckPort(),
        precheckLogPath: tempPrecheckLogPath(),
      }),
      /input\.principal\.role must be SERVICE/u,
    );

    const incompleteApproval = baseInput();
    incompleteApproval.approval.permissions = ["QUESTION_BANK_GENERATION_REVIEW", "OTHER_REVIEW"];
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck(incompleteApproval, {
        modelExecutionPrecheckPort: recordingPrecheckPort(),
        precheckLogPath: tempPrecheckLogPath(),
      }),
      /MODEL_EXECUTION_PRECHECK_APPROVE/u,
    );

    for (const field of ["executeModelNowAllowed", "generateQuestionsNowAllowed", "writeQuestionBankContentNowAllowed", "studentVisiblePublishAllowed", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.modelExecutionPolicy[field] = true;
      await assert.rejects(
        () => recordStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck(input, {
          modelExecutionPrecheckPort: recordingPrecheckPort(),
          precheckLogPath: tempPrecheckLogPath(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }
  });

  it("rejects non-ready source envelopes, approval mismatches, and already generated boundaries", async () => {
    const notReady = baseInput();
    notReady.inputEnvelopeReport.readiness = "NEEDS_REMEDIATION";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck(notReady, {
        modelExecutionPrecheckPort: recordingPrecheckPort(),
        precheckLogPath: tempPrecheckLogPath(),
      }),
      /input\.inputEnvelopeReport\.readiness must be READY/u,
    );

    const mismatch = baseInput();
    mismatch.approval.reviewedEnvelopeId = "qbank_generation_input_envelope_other";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck(mismatch, {
        modelExecutionPrecheckPort: recordingPrecheckPort(),
        precheckLogPath: tempPrecheckLogPath(),
      }),
      /input\.approval\.reviewedEnvelopeId must be qbank_generation_input_envelope_tutor_req_student_app_001/u,
    );

    const alreadyGenerated = baseInput();
    alreadyGenerated.inputEnvelopeReport.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationInputEnvelope.result.boundary.questionContentGenerated = true;
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck(alreadyGenerated, {
        modelExecutionPrecheckPort: recordingPrecheckPort(),
        precheckLogPath: tempPrecheckLogPath(),
      }),
      /source\.envelope\.boundary\.questionContentGenerated must be false/u,
    );
  });

  it("rejects leaked content, unsafe port results, over-budget policies, and missing evidence", async () => {
    const leaked = baseInput();
    leaked.rawModelOutput = "leak";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck(leaked, {
        modelExecutionPrecheckPort: recordingPrecheckPort(),
        precheckLogPath: tempPrecheckLogPath(),
      }),
      /rawModelOutput is not allowed/u,
    );

    const unsafePort = recordingPrecheckPort({ modelInferenceStarted: true });
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck(baseInput(), {
        modelExecutionPrecheckPort: unsafePort,
        precheckLogPath: tempPrecheckLogPath(),
      }),
      /portResult\.modelExecutionPrecheck\.modelInferenceStarted must be false/u,
    );

    const overBudget = baseInput();
    overBudget.modelExecutionPolicy.maxPromptTokens = 99999;
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck(overBudget, {
        modelExecutionPrecheckPort: recordingPrecheckPort(),
        precheckLogPath: tempPrecheckLogPath(),
      }),
      /input\.modelExecutionPolicy\.maxPromptTokens must be an integer/u,
    );

    const missingEvidence = baseInput();
    missingEvidence.evidenceRefs = [
      "evidence:student-app-ai-tutor-question-bank-draft-generation-input-envelope:qbank_generation_input_envelope_tutor_req_student_app_001",
      "evidence:other",
    ];
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheck(missingEvidence, {
        modelExecutionPrecheckPort: recordingPrecheckPort(),
        precheckLogPath: tempPrecheckLogPath(),
      }),
      /model execution approval evidence ref is required/u,
    );
  });
});

function tempPrecheckLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-generation-model-precheck-")), "precheck.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-model-execution-precheck.v1",
    precheckInvocationId: "qbank_generation_model_precheck_001",
    inputEnvelopeReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-input-envelope.current.json", "utf8")),
    principal: {
      principalId: "svc_student_tutor_agent",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      sessionId: "svc_session_student_tutor_agent",
      scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT", "MODEL_EXECUTION_PRECHECK_APPROVE"],
    },
    approval: approval(),
    modelExecutionPolicy: modelExecutionPolicy(),
    evidenceRefs: [
      "evidence:student-app-ai-tutor-question-bank-draft-generation-input-envelope:qbank_generation_input_envelope_tutor_req_student_app_001",
      "evidence:model-execution-approval:qbank_generation_model_approval_001",
    ],
    idempotencyKey: "student-app-ai-tutor-qbank-generation-model-precheck:student_001:qbank_generation_input_envelope_tutor_req_student_app_001",
  };
}

function approval() {
  return {
    approvalId: "qbank_generation_model_approval_001",
    reviewerId: "teacher_001",
    reviewerRole: "TEACHER",
    permissions: ["QUESTION_BANK_GENERATION_REVIEW", "MODEL_EXECUTION_PRECHECK_APPROVE"],
    reviewedEnvelopeId: "qbank_generation_input_envelope_tutor_req_student_app_001",
    reviewedPlanId: "qbank_generation_plan_tutor_req_student_app_001",
    reviewedClaimId: "qbank_generation_claim_tutor_req_student_app_001",
    approvedForModelQueueOnly: true,
    promptBlueprintsReviewed: true,
    studentOwnScopeConfirmed: true,
    answerKeyExcludedConfirmed: true,
    budgetReviewed: true,
    humanReviewRequiredBeforeStudentVisibility: true,
  };
}

function modelExecutionPolicy() {
  return {
    modelRoute: "StudentTutorAgent.generate_question_bank_draft",
    approvedProviderClass: "CONTROLLED_AI_WORKER",
    queueRef: "qbank_generation_model_queue_local_001",
    maxPromptTokens: 1200,
    maxOutputTokens: 1200,
    maxGenerationAttempts: 1,
    timeoutMs: 30000,
    storeRawModelOutputAllowed: false,
    executeModelNowAllowed: false,
    generateQuestionsNowAllowed: false,
    writeQuestionBankContentNowAllowed: false,
    studentVisiblePublishAllowed: false,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    swarmAllowed: false,
    requiresReviewedGenerationRuntime: true,
    requiresContentStorageCommit: true,
  };
}

function recordingPrecheckPort(overrides = {}) {
  const calls = [];
  return {
    calls,
    async recordModelExecutionPrecheck(request) {
      calls.push(request);
      return {
        modelExecutionPrecheck: {
          precheckId: "qbank_generation_model_precheck_tutor_req_student_app_001",
          envelopeId: request.inputEnvelope.envelopeId,
          planId: request.inputEnvelope.planId,
          claimId: request.inputEnvelope.claimId,
          approvalId: request.approval.approvalId,
          questionBankDraftRef: request.inputEnvelope.questionBankDraftRef,
          studentId: request.inputEnvelope.studentId,
          workerId: request.inputEnvelope.workerId,
          modelRoute: request.modelExecutionPolicy.modelRoute,
          queueRef: request.modelExecutionPolicy.queueRef,
          promptBlueprintCount: request.inputEnvelope.itemBlueprintCount,
          status: "PRECHECKED_FOR_REVIEWED_MODEL_QUEUE",
          executionState: "MODEL_EXECUTION_PRECHECKED_NOT_STARTED",
          modelInferenceStarted: false,
          questionContentGenerated: false,
          questionBankContentWriteStarted: false,
          ...overrides,
        },
      };
    },
  };
}
