import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_PORT,
  STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_RUNTIME_ID,
  recordStudentAppAITutorModelExecutionPrecheck,
} from "./student-app-ai-tutor-model-execution-precheck-runtime.mjs";

describe("Student App AI Tutor model execution precheck runtime", () => {
  it("records a queue-only model precheck without sending text or starting inference", async () => {
    const calls = [];
    const result = await recordStudentAppAITutorModelExecutionPrecheck(baseInput(), {
      generatedAt: "2026-06-08T08:00:00.000Z",
      precheckLogPath: tempLog(),
      modelExecutionPrecheckPort: port(calls),
    });

    assert.equal(result.runtimeId, STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_RUNTIME_ID);
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECKED");
    assert.equal(result.modelExecutionPrecheck.modelRoute, "student_tutor_guided_help_v1");
    assert.equal(result.boundary.modelExecutionQueueAdmissionOnly, true);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.equal(result.boundary.tutorAnswerGenerated, false);
    assert.equal(result.idempotentReplay, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].safeInput.safeBlockCount, 2);
    assert.equal(JSON.stringify(calls[0]).includes("Practice equivalent fractions"), false);
  });

  it("uses idempotency for safe replay and rejects conflicting prechecks", async () => {
    const precheckLogPath = tempLog();
    const first = await recordStudentAppAITutorModelExecutionPrecheck(baseInput(), {
      precheckLogPath,
      modelExecutionPrecheckPort: port(),
    });
    const replay = await recordStudentAppAITutorModelExecutionPrecheck(baseInput(), {
      precheckLogPath,
      modelExecutionPrecheckPort: port(),
    });

    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.inputHash, first.inputHash);

    const conflicting = baseInput();
    conflicting.workerInput.blocks[0].text = "Changed safe block text.";
    await assert.rejects(
      () => recordStudentAppAITutorModelExecutionPrecheck(conflicting, {
        precheckLogPath,
        modelExecutionPrecheckPort: port(),
      }),
      /inputHash does not match/,
    );
  });

  it("rejects missing ports, unsafe principals, and unsafe policies", async () => {
    await assert.rejects(
      () => recordStudentAppAITutorModelExecutionPrecheck(baseInput(), { precheckLogPath: tempLog() }),
      /model execution precheck port is required/,
    );

    const unsafePrincipal = baseInput();
    unsafePrincipal.principal.scopes = ["TEACHING_WRITE"];
    await assert.rejects(
      () => recordStudentAppAITutorModelExecutionPrecheck(unsafePrincipal, {
        precheckLogPath: tempLog(),
        modelExecutionPrecheckPort: port(),
      }),
      /AGENT_COMMAND_SUBMIT/,
    );

    const unsafePolicy = baseInput();
    unsafePolicy.modelExecutionPolicy.queueOnly = false;
    await assert.rejects(
      () => recordStudentAppAITutorModelExecutionPrecheck(unsafePolicy, {
        precheckLogPath: tempLog(),
        modelExecutionPrecheckPort: port(),
      }),
      /queueOnly must be true/,
    );
  });

  it("rejects non-ready sources and leaked fields", async () => {
    const nonReady = baseInput();
    nonReady.workerStudyPacketInputReport.readiness = "NEEDS_REMEDIATION";
    await assert.rejects(
      () => recordStudentAppAITutorModelExecutionPrecheck(nonReady, {
        precheckLogPath: tempLog(),
        modelExecutionPrecheckPort: port(),
      }),
      /readiness must be READY/,
    );

    const leaked = baseInput();
    leaked.workerInput.contentRef = "s3://raw";
    await assert.rejects(
      () => recordStudentAppAITutorModelExecutionPrecheck(leaked, {
        precheckLogPath: tempLog(),
        modelExecutionPrecheckPort: port(),
      }),
      /contentRef is not allowed/,
    );
  });

  it("rejects unsafe port results", async () => {
    await assert.rejects(
      () => recordStudentAppAITutorModelExecutionPrecheck(baseInput(), {
        precheckLogPath: tempLog(),
        modelExecutionPrecheckPort: {
          async recordModelExecutionPrecheck(request) {
            return {
              modelExecutionPrecheck: {
                precheckId: "ai_tutor_model_precheck_001",
                queueRef: "ai_tutor_model_queue_001",
                modelRoute: "student_tutor_guided_help_v1",
                requestId: request.requestId,
                workerId: request.workerId,
                inputHash: request.inputHash,
                safeBlockCount: request.safeInput.safeBlockCount,
                status: "AI_TUTOR_MODEL_EXECUTION_PRECHECKED_NOT_STARTED",
                queueAdmissionOnly: true,
                modelInferenceStarted: true,
                tutorResultRecorded: false,
                studentVisiblePublished: false,
              },
            };
          },
        },
      }),
      /modelInferenceStarted must be false/,
    );
  });
});

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-model-precheck-test-")), "precheck.jsonl");
}

function port(calls = []) {
  return {
    async recordModelExecutionPrecheck(request) {
      calls.push(request);
      return {
        modelExecutionPrecheck: {
          precheckId: "ai_tutor_model_precheck_001",
          queueRef: "ai_tutor_model_queue_001",
          modelRoute: "student_tutor_guided_help_v1",
          requestId: request.requestId,
          workerId: request.workerId,
          inputHash: request.inputHash,
          safeBlockCount: request.safeInput.safeBlockCount,
          status: "AI_TUTOR_MODEL_EXECUTION_PRECHECKED_NOT_STARTED",
          queueAdmissionOnly: true,
          modelInferenceStarted: false,
          tutorResultRecorded: false,
          studentVisiblePublished: false,
        },
      };
    },
  };
}

function baseInput() {
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-model-execution-precheck.v1",
    precheckInvocationId: "ai_tutor_model_precheck_invocation_001",
    workerStudyPacketInputReport: workerStudyPacketInputReport(),
    workerInput: {
      requestId: "tutor_req_student_app_001",
      archiveItemId: "tarch_archive_material_001",
      analysisGoal: "generate guided study help",
      questionBankIntent: "GENERATE_PERSONALIZED_CHECK",
      status: "IN_PROGRESS",
      workerId: "worker_student_tutor_01",
      claimExpiresAt: "2026-06-08T08:10:00.000Z",
      sourceArchiveStudentId: "student_001",
      sourceArchiveMaterial: "HANDOUT",
      packetStatus: "READY",
      renderFormat: "SAFE_TEXT_BLOCKS",
      blocks: [
        {
          blockId: "block_section_001",
          blockType: "SECTION",
          sectionId: "section_001",
          title: "Equivalent fractions",
          text: "Practice equivalent fractions and common denominators.",
          pageHint: "p.1",
        },
        {
          blockId: "block_section_002",
          blockType: "SECTION",
          sectionId: "section_002",
          title: "Worked example",
          text: "Compare two fractions by converting to a common denominator.",
        },
      ],
    },
    principal: {
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      scopes: ["TEACHING_WRITE", "AGENT_COMMAND_SUBMIT"],
    },
    approval: {
      approvalId: "ai_tutor_model_approval_001",
      requestId: "tutor_req_student_app_001",
      workerId: "worker_student_tutor_01",
      approvedByPrincipalId: "reviewer_001",
      approvedAt: "2026-06-08T08:00:00.000Z",
      expiresAt: "2026-06-08T08:30:00.000Z",
      allowedModelRoute: "student_tutor_guided_help_v1",
      maxInputBlocks: 4,
      maxPromptTokens: 1200,
      maxGenerationAttempts: 1,
      requiresHumanReviewBeforeResult: true,
      queueOnly: true,
    },
    modelExecutionPolicy: {
      modelRoute: "student_tutor_guided_help_v1",
      maxPromptTokens: 900,
      maxGenerationAttempts: 1,
      timeoutMs: 8000,
      safetyMode: "STUDENT_TUTOR_SAFE_HELP",
      queueOnly: true,
      allowExternalTools: false,
      allowRetrieval: false,
      allowSwarm: false,
      allowDirectDb: false,
    },
    evidenceRefs: [
      "evidence:worker-study-packet-input:student-app-ai-tutor-worker-study-packet-input",
      "evidence:model-execution-approval:ai_tutor_model_approval_001",
    ],
    idempotencyKey: "student-app-ai-tutor-model-precheck:tutor_req_student_app_001:worker_student_tutor_01",
  };
}

function workerStudyPacketInputReport() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_WORKER_STUDY_PACKET_INPUT",
    runtime: {
      runtimeId: "student_app_ai_tutor_worker_study_packet_input",
      status: "STUDENT_APP_AI_TUTOR_WORKER_STUDY_PACKET_INPUT_READY",
    },
    runtimeSlo: { p99Ms: 4, totalErrors: 0 },
    safetyInvariants: {
      serviceAgentInternalOnly: true,
      claimedWorkerLeaseRequired: true,
      ownStudentSourceRequired: true,
      publishedStudyPacketRequired: true,
      safeTextBlocksPreviewBoundaryRequired: true,
      learningActionBoundaryRequired: true,
      contentRefExcludedFromResponse: true,
      promptExcluded: true,
      rawContentExcluded: true,
      answerKeyOrModelOutputAllowed: false,
      modelInferenceAllowed: false,
      questionBankDraftCreated: false,
      semanticRetrievalAllowed: false,
      swarmAllowed: false,
    },
  };
}
