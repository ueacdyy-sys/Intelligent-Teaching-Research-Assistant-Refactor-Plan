import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_PORT,
  formatStudentAppAITutorQuestionBankDraftGenerationControlledDraft,
  recordStudentAppAITutorQuestionBankDraftGenerationControlledDraft,
} from "./student-app-ai-tutor-question-bank-draft-generation-controlled-draft-runtime.mjs";

describe("Student App AI Tutor question-bank draft generation controlled draft runtime", () => {
  it("records sanitized generated question draft artifacts without content storage", async () => {
    const port = recordingControlledDraftPort();
    const result = await recordStudentAppAITutorQuestionBankDraftGenerationControlledDraft(baseInput(), {
      controlledDraftGenerationPort: port,
      draftLogPath: tempDraftLogPath(),
      generatedAt: "2026-06-06T17:10:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-controlled-draft-recorded.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RECORDED");
    assert.equal(result.generatedDraft.artifactId, "qbank_generation_controlled_draft_tutor_req_student_app_001");
    assert.equal(result.generatedDraft.items.length, 3);
    assert.equal(result.generatedDraft.status, "CONTROLLED_DRAFT_READY_FOR_REVIEW_NOT_STORED");
    assert.equal(result.generatedDraft.executionState, "CONTROLLED_DRAFT_RECORDED_NOT_STORED");
    assert.equal(result.boundary.sanitizedQuestionDraftArtifactRecorded, true);
    assert.equal(result.boundary.questionContentGenerated, true);
    assert.equal(result.boundary.answerKeyGenerated, false);
    assert.equal(result.boundary.questionBankContentWriteStarted, false);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].sourceInputEnvelope.itemBlueprints.length, 3);
    assert.match(formatStudentAppAITutorQuestionBankDraftGenerationControlledDraft(result), /Content stored: false/u);
  });

  it("uses idempotency for safe replay and rejects conflicting draft attempts", async () => {
    const draftLogPath = tempDraftLogPath();
    const port = recordingControlledDraftPort();
    const first = await recordStudentAppAITutorQuestionBankDraftGenerationControlledDraft(baseInput(), {
      controlledDraftGenerationPort: port,
      draftLogPath,
    });
    const replay = await recordStudentAppAITutorQuestionBankDraftGenerationControlledDraft(baseInput(), {
      controlledDraftGenerationPort: port,
      draftLogPath,
    });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(draftLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.generationInvocationId = "qbank_generation_controlled_draft_002";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationControlledDraft(conflicting, {
        controlledDraftGenerationPort: port,
        draftLogPath,
      }),
      /record\.inputHash must be/u,
    );
  });

  it("rejects missing ports, unsafe principals, unsafe output policy, and source mismatches", async () => {
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationControlledDraft(baseInput(), { draftLogPath: tempDraftLogPath() }),
      /ControlledDraftGenerationPort\.recordControlledDraftGeneration is required/u,
    );

    const unsafePrincipal = baseInput();
    unsafePrincipal.principal.role = "STUDENT";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationControlledDraft(unsafePrincipal, {
        controlledDraftGenerationPort: recordingControlledDraftPort(),
        draftLogPath: tempDraftLogPath(),
      }),
      /input\.principal\.role must be SERVICE/u,
    );

    for (const field of ["answerKeyGenerationAllowed", "expectedAnswerGenerationAllowed", "writeQuestionBankContentNowAllowed", "studentVisiblePublishAllowed", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.outputPolicy[field] = true;
      await assert.rejects(
        () => recordStudentAppAITutorQuestionBankDraftGenerationControlledDraft(input, {
          controlledDraftGenerationPort: recordingControlledDraftPort(),
          draftLogPath: tempDraftLogPath(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }

    const mismatch = baseInput();
    mismatch.modelExecutionPrecheckReport.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationModelExecutionPrecheck.result.modelExecutionPrecheck.envelopeId = "qbank_generation_input_envelope_other";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationControlledDraft(mismatch, {
        controlledDraftGenerationPort: recordingControlledDraftPort(),
        draftLogPath: tempDraftLogPath(),
      }),
      /source\.precheck\.modelExecutionPrecheck\.envelopeId must be qbank_generation_input_envelope_tutor_req_student_app_001/u,
    );
  });

  it("rejects unsafe source states, leaked model fields, unsafe port results, and unknown items", async () => {
    const notReady = baseInput();
    notReady.modelExecutionPrecheckReport.readiness = "NEEDS_REMEDIATION";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationControlledDraft(notReady, {
        controlledDraftGenerationPort: recordingControlledDraftPort(),
        draftLogPath: tempDraftLogPath(),
      }),
      /input\.modelExecutionPrecheckReport\.readiness must be READY/u,
    );

    const leaked = baseInput();
    leaked.rawModelOutput = "leak";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationControlledDraft(leaked, {
        controlledDraftGenerationPort: recordingControlledDraftPort(),
        draftLogPath: tempDraftLogPath(),
      }),
      /rawModelOutput is not allowed/u,
    );

    const unsafePort = recordingControlledDraftPort({ answerKeyGenerated: true });
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationControlledDraft(baseInput(), {
        controlledDraftGenerationPort: unsafePort,
        draftLogPath: tempDraftLogPath(),
      }),
      /portResult\.generatedDraft\.answerKeyGenerated must be false/u,
    );

    const unknownItemPort = recordingControlledDraftPort({}, { unknownItem: true });
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationControlledDraft(baseInput(), {
        controlledDraftGenerationPort: unknownItemPort,
        draftLogPath: tempDraftLogPath(),
      }),
      /qbank_plan_item_999 is not in the input envelope/u,
    );
  });

  it("rejects answer key fields, content storage flags, and missing evidence refs", async () => {
    const answerLeakPort = recordingControlledDraftPort({}, { answerField: true });
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationControlledDraft(baseInput(), {
        controlledDraftGenerationPort: answerLeakPort,
        draftLogPath: tempDraftLogPath(),
      }),
      /expectedAnswer is not allowed/u,
    );

    const storedPort = recordingControlledDraftPort({ questionBankContentWriteStarted: true });
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationControlledDraft(baseInput(), {
        controlledDraftGenerationPort: storedPort,
        draftLogPath: tempDraftLogPath(),
      }),
      /portResult\.generatedDraft\.questionBankContentWriteStarted must be false/u,
    );

    const missingEvidence = baseInput();
    missingEvidence.evidenceRefs = [
      "evidence:student-app-ai-tutor-question-bank-draft-generation-input-envelope:qbank_generation_input_envelope_tutor_req_student_app_001",
      "evidence:other",
    ];
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationControlledDraft(missingEvidence, {
        controlledDraftGenerationPort: recordingControlledDraftPort(),
        draftLogPath: tempDraftLogPath(),
      }),
      /model execution precheck evidence ref is required/u,
    );
  });
});

function tempDraftLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-controlled-draft-")), "draft.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-controlled-draft.v1",
    generationInvocationId: "qbank_generation_controlled_draft_001",
    inputEnvelopeReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-input-envelope.current.json", "utf8")),
    modelExecutionPrecheckReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck.current.json", "utf8")),
    principal: {
      principalId: "svc_student_tutor_agent",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      sessionId: "svc_session_student_tutor_agent",
      scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT", "MODEL_GENERATION_EXECUTE"],
    },
    generationAttempt: {
      attemptId: "qbank_generation_attempt_001",
      precheckId: "qbank_generation_model_precheck_tutor_req_student_app_001",
      modelRoute: "StudentTutorAgent.generate_question_bank_draft",
      queueRef: "qbank_generation_model_queue_local_001",
      providerClass: "CONTROLLED_AI_WORKER",
      maxPromptTokens: 1200,
      maxOutputTokens: 1200,
      attemptNo: 1,
    },
    outputPolicy: outputPolicy(),
    evidenceRefs: [
      "evidence:student-app-ai-tutor-question-bank-draft-generation-input-envelope:qbank_generation_input_envelope_tutor_req_student_app_001",
      "evidence:model-execution-precheck:qbank_generation_model_precheck_tutor_req_student_app_001",
    ],
    idempotencyKey: "student-app-ai-tutor-qbank-controlled-draft:student_001:qbank_generation_model_precheck_tutor_req_student_app_001",
  };
}

function outputPolicy() {
  return {
    sanitizedQuestionDraftOnly: true,
    rawModelOutputStored: false,
    answerKeyGenerationAllowed: false,
    expectedAnswerGenerationAllowed: false,
    writeQuestionBankContentNowAllowed: false,
    studentVisiblePublishAllowed: false,
    scoringAllowed: false,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    swarmAllowed: false,
    requiresFutureTeacherReview: true,
    requiresFutureContentStorageCommit: true,
  };
}

function recordingControlledDraftPort(overrides = {}, behavior = {}) {
  const calls = [];
  return {
    calls,
    async recordControlledDraftGeneration(request) {
      calls.push(request);
      const items = request.sourceInputEnvelope.itemBlueprints.map((blueprint, index) => ({
        itemId: behavior.unknownItem && index === 0 ? "qbank_plan_item_999" : blueprint.itemId,
        questionType: blueprint.questionType,
        difficulty: blueprint.difficulty,
        knowledgePoint: blueprint.knowledgePoint,
        questionText: `Practice item ${index + 1}: solve a safe teacher-review draft question for ${blueprint.knowledgePoint}.`,
        hintPolicy: blueprint.maxHints > 0 ? "LIGHT_HINTS" : "NONE",
        maxHints: blueprint.maxHints,
        sourceEvidenceRef: blueprint.sourceEvidenceRef,
        ...(behavior.answerField && index === 0 ? { expectedAnswer: "leak" } : {}),
      }));
      return {
        generatedDraft: {
          artifactId: "qbank_generation_controlled_draft_tutor_req_student_app_001",
          envelopeId: request.sourceInputEnvelope.envelopeId,
          precheckId: request.sourceModelPrecheck.precheckId,
          planId: request.sourceInputEnvelope.planId,
          claimId: request.sourceInputEnvelope.claimId,
          questionBankDraftRef: request.sourceInputEnvelope.questionBankDraftRef,
          studentId: request.sourceInputEnvelope.studentId,
          workerId: request.sourceInputEnvelope.workerId,
          generationAttemptId: request.generationAttempt.attemptId,
          modelRoute: request.sourceModelPrecheck.modelRoute,
          status: "CONTROLLED_DRAFT_READY_FOR_REVIEW_NOT_STORED",
          executionState: "CONTROLLED_DRAFT_RECORDED_NOT_STORED",
          items,
          rawModelOutputStored: false,
          answerKeyGenerated: false,
          expectedAnswerGenerated: false,
          questionBankContentWriteStarted: false,
          ...overrides,
        },
      };
    },
  };
}
