import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_PORT,
  STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RUNTIME_ID,
  recordStudentAppAITutorControlledAnswerArtifact,
} from "./student-app-ai-tutor-controlled-answer-artifact-runtime.mjs";

describe("Student App AI Tutor controlled answer artifact runtime", () => {
  it("records a controlled answer artifact without result persistence or student visibility", async () => {
    const calls = [];
    const result = await recordStudentAppAITutorControlledAnswerArtifact(baseInput(), {
      generatedAt: "2026-06-08T08:20:00.000Z",
      artifactLogPath: tempLog(),
      controlledAnswerArtifactPort: port(calls),
    });

    assert.equal(result.runtimeId, STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RUNTIME_ID);
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RECORDED");
    assert.equal(result.controlledAnswerArtifact.reviewState, "PENDING_HUMAN_REVIEW");
    assert.equal(result.controlledAnswerArtifact.guidanceSections.length, 2);
    assert.equal(result.boundary.tutoringResultRecorded, false);
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal(result.idempotentReplay, false);
    assert.equal(calls.length, 1);
    assert.equal(JSON.stringify(calls[0]).includes("Convert both fractions"), false);
  });

  it("records a result-archive-sourced controlled answer artifact for human review only", async () => {
    const calls = [];
    const input = baseInput();
    input.artifactInvocationId = "ai_tutor_answer_artifact_invocation_result_archive_001";
    input.modelExecutionPrecheckReport = resultArchivePrecheckReport();
    input.generationAttempt = {
      ...input.generationAttempt,
      attemptId: "ai_tutor_answer_attempt_result_archive_001",
      precheckId: "ai_tutor_model_precheck_result_archive_001",
      queueRef: "ai_tutor_model_queue_result_archive_001",
      requestId: "tutor_req_student_app_result_archive_001",
      workerId: "worker_student_tutor_02",
      inputHash: "a81a6025e7ebe70f730722ac145d7f0b7add977b0050be2dc9284e5b61aab0d7",
    };
    input.evidenceRefs = [
      "evidence:result-archive-model-execution-precheck:student-app-ai-tutor-result-archive-model-execution-precheck",
      "evidence:controlled-answer-policy:review-before-result",
    ];
    input.idempotencyKey = "student-app-ai-tutor-controlled-answer:tutor_req_student_app_result_archive_001:ai_tutor_model_precheck_result_archive_001";

    const result = await recordStudentAppAITutorControlledAnswerArtifact(input, {
      generatedAt: "2026-06-09T11:20:00.000Z",
      artifactLogPath: tempLog(),
      controlledAnswerArtifactPort: resultArchivePort(calls),
    });

    assert.equal(result.learningActionSource, "AI_TUTOR_RESULT_ARCHIVE");
    assert.equal(result.resultArchiveStatus, "READY_FOR_STUDENT_APP_READ");
    assert.equal(result.controlledAnswerArtifact.reviewState, "PENDING_HUMAN_REVIEW");
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal(calls.length, 1);
    assert.equal(JSON.stringify(calls[0]).includes("Review your previous mistake pattern"), false);
  });

  it("records a question-bank-feedback-sourced controlled answer artifact for human review only", async () => {
    const calls = [];
    const input = baseInput();
    input.artifactInvocationId = "ai_tutor_answer_artifact_invocation_feedback_001";
    input.modelExecutionPrecheckReport = questionBankFeedbackPrecheckReport();
    input.generationAttempt = {
      ...input.generationAttempt,
      attemptId: "ai_tutor_answer_attempt_feedback_001",
      precheckId: "ai_tutor_model_precheck_feedback_001",
      queueRef: "ai_tutor_model_queue_feedback_001",
      requestId: "tutor_req_student_app_feedback_001",
      workerId: "worker_student_tutor_03",
      inputHash: "a5b2ef0ed017998b85551ded2dee3b0edc4f328bbec77b9c8de538ff758a8bbe",
    };
    input.evidenceRefs = [
      "evidence:question-bank-feedback-model-execution-precheck:student-app-ai-tutor-question-bank-feedback-model-execution-precheck",
      "evidence:controlled-answer-policy:review-before-result",
    ];
    input.idempotencyKey = "student-app-ai-tutor-controlled-answer:tutor_req_student_app_feedback_001:ai_tutor_model_precheck_feedback_001";

    const result = await recordStudentAppAITutorControlledAnswerArtifact(input, {
      generatedAt: "2026-06-11T09:30:00.000Z",
      artifactLogPath: tempLog(),
      controlledAnswerArtifactPort: questionBankFeedbackPort(calls),
    });

    assert.equal(result.learningActionSource, "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK");
    assert.equal(result.feedbackStatus, "READY_FOR_STUDENT_APP_READ");
    assert.equal(result.feedbackSubmissionId, undefined);
    assert.equal(result.feedbackSourceArchiveItemId, undefined);
    assert.equal(result.controlledAnswerArtifact.reviewState, "PENDING_HUMAN_REVIEW");
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal(calls.length, 1);
    assert.equal(JSON.stringify(calls[0]).includes("qbank_ans_sub_feedback_001"), false);
    assert.equal(JSON.stringify(calls[0]).includes("Score improved after correcting denominator comparison"), false);
  });

  it("uses idempotency for safe replay and rejects conflicting artifacts", async () => {
    const artifactLogPath = tempLog();
    const first = await recordStudentAppAITutorControlledAnswerArtifact(baseInput(), {
      artifactLogPath,
      controlledAnswerArtifactPort: port(),
    });
    const replay = await recordStudentAppAITutorControlledAnswerArtifact(baseInput(), {
      artifactLogPath,
      controlledAnswerArtifactPort: port(),
    });
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.inputHash, first.inputHash);

    const conflicting = baseInput();
    conflicting.artifactPolicy.maxSectionChars = 600;
    await assert.rejects(
      () => recordStudentAppAITutorControlledAnswerArtifact(conflicting, {
        artifactLogPath,
        controlledAnswerArtifactPort: port(),
      }),
      /inputHash does not match/,
    );
  });

  it("rejects missing ports, unsafe principals, and unsafe source prechecks", async () => {
    await assert.rejects(
      () => recordStudentAppAITutorControlledAnswerArtifact(baseInput(), { artifactLogPath: tempLog() }),
      /controlled answer artifact port is required/,
    );

    const unsafePrincipal = baseInput();
    unsafePrincipal.principal.scopes = ["TEACHING_WRITE"];
    await assert.rejects(
      () => recordStudentAppAITutorControlledAnswerArtifact(unsafePrincipal, {
        artifactLogPath: tempLog(),
        controlledAnswerArtifactPort: port(),
      }),
      /AGENT_COMMAND_SUBMIT/,
    );

    const badSource = baseInput();
    badSource.modelExecutionPrecheckReport.readiness = "NEEDS_REMEDIATION";
    await assert.rejects(
      () => recordStudentAppAITutorControlledAnswerArtifact(badSource, {
        artifactLogPath: tempLog(),
        controlledAnswerArtifactPort: port(),
      }),
      /readiness must be READY/,
    );
  });

  it("rejects leaked fields and enabled persistence flags", async () => {
    const leaked = baseInput();
    leaked.generationAttempt.rawModelOutput = "raw model text";
    await assert.rejects(
      () => recordStudentAppAITutorControlledAnswerArtifact(leaked, {
        artifactLogPath: tempLog(),
        controlledAnswerArtifactPort: port(),
      }),
      /rawModelOutput is not allowed/,
    );

    const unsafePolicy = baseInput();
    unsafePolicy.artifactPolicy.studentVisibleAllowed = true;
    await assert.rejects(
      () => recordStudentAppAITutorControlledAnswerArtifact(unsafePolicy, {
        artifactLogPath: tempLog(),
        controlledAnswerArtifactPort: port(),
      }),
      /studentVisibleAllowed must be false/,
    );
  });

  it("rejects unsafe port results", async () => {
    await assert.rejects(
      () => recordStudentAppAITutorControlledAnswerArtifact(baseInput(), {
        artifactLogPath: tempLog(),
        controlledAnswerArtifactPort: {
          async recordControlledAnswerArtifact(request) {
            const result = await port().recordControlledAnswerArtifact(request);
            result.controlledAnswerArtifact.rawModelOutput = "raw";
            return result;
          },
        },
      }),
      /rawModelOutput is not allowed/,
    );
  });

  it("rejects unsafe result-archive precheck source reports", async () => {
    const input = baseInput();
    input.modelExecutionPrecheckReport = resultArchivePrecheckReport();
    input.modelExecutionPrecheckReport.safetyInvariants.learningActionSourceRequired = "PUBLISHED_STUDY_PACKET";
    await assert.rejects(
      () => recordStudentAppAITutorControlledAnswerArtifact(input, {
        artifactLogPath: tempLog(),
        controlledAnswerArtifactPort: port(),
      }),
      /learningActionSourceRequired must be AI_TUTOR_RESULT_ARCHIVE/,
    );
  });

  it("rejects unsafe question-bank-feedback precheck source reports", async () => {
    const input = baseInput();
    input.modelExecutionPrecheckReport = questionBankFeedbackPrecheckReport();
    input.modelExecutionPrecheckReport.safetyInvariants.learningActionSourceRequired = "PUBLISHED_STUDY_PACKET";
    await assert.rejects(
      () => recordStudentAppAITutorControlledAnswerArtifact(input, {
        artifactLogPath: tempLog(),
        controlledAnswerArtifactPort: port(),
      }),
      /learningActionSourceRequired must be QUESTION_BANK_DRAFT_ANSWER_FEEDBACK/,
    );
  });
});

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-controlled-answer-test-")), "artifact.jsonl");
}

function port(calls = []) {
  return {
    async recordControlledAnswerArtifact(request) {
      calls.push(request);
      return {
        controlledAnswerArtifact: {
          artifactId: "ai_tutor_answer_artifact_001",
          requestId: request.requestId,
          workerId: request.workerId,
          precheckId: request.precheckId,
          queueRef: request.queueRef,
          status: "AI_TUTOR_CONTROLLED_ANSWER_RECORDED_NOT_REVIEWED",
          reviewState: "PENDING_HUMAN_REVIEW",
          summary: "Guided help for comparing fractions.",
          guidanceSections: [
            {
              sectionId: "ai_tutor_answer_section_001",
              title: "Start with a common denominator",
              text: "Convert both fractions to the same denominator, then compare the numerators.",
              sourceBlockRefs: ["block_section_001"],
            },
            {
              sectionId: "ai_tutor_answer_section_002",
              title: "Check your reasoning",
              text: "Explain why the larger numerator is larger only after the denominators match.",
              sourceBlockRefs: ["block_section_002"],
            },
          ],
          safetyLabels: ["NO_DIAGNOSIS", "STUDY_GUIDANCE_ONLY"],
          resultPersistenceAllowed: false,
          tutoringResultRecorded: false,
          studentVisiblePublished: false,
        },
      };
    },
  };
}

function resultArchivePort(calls = []) {
  return {
    async recordControlledAnswerArtifact(request) {
      calls.push(request);
      return {
        controlledAnswerArtifact: {
          artifactId: "ai_tutor_answer_artifact_result_archive_001",
          requestId: request.requestId,
          workerId: request.workerId,
          precheckId: request.precheckId,
          queueRef: request.queueRef,
          status: "AI_TUTOR_CONTROLLED_ANSWER_RECORDED_NOT_REVIEWED",
          reviewState: "PENDING_HUMAN_REVIEW",
          summary: "Follow-up help based on a reviewed AI Tutor result.",
          guidanceSections: [
            {
              sectionId: "ai_tutor_answer_section_result_archive_001",
              title: "Review the previous correction",
              text: "Restate the corrected reasoning before attempting a similar practice item.",
              sourceBlockRefs: ["source_block_001"],
            },
          ],
          safetyLabels: ["STUDY_GUIDANCE_ONLY", "FOLLOW_UP_REVIEW"],
          resultPersistenceAllowed: false,
          tutoringResultRecorded: false,
          studentVisiblePublished: false,
        },
      };
    },
  };
}

function questionBankFeedbackPort(calls = []) {
  return {
    async recordControlledAnswerArtifact(request) {
      calls.push(request);
      return {
        controlledAnswerArtifact: {
          artifactId: "ai_tutor_answer_artifact_feedback_001",
          requestId: request.requestId,
          workerId: request.workerId,
          precheckId: request.precheckId,
          queueRef: request.queueRef,
          status: "AI_TUTOR_CONTROLLED_ANSWER_RECORDED_NOT_REVIEWED",
          reviewState: "PENDING_HUMAN_REVIEW",
          summary: "Follow-up help based on reviewed answer feedback.",
          guidanceSections: [
            {
              sectionId: "ai_tutor_answer_section_feedback_001",
              title: "Practice from feedback",
              text: "Restate the feedback in your own words, then solve one similar item.",
              sourceBlockRefs: ["block_score_summary", "block_next_step"],
            },
          ],
          safetyLabels: ["STUDY_GUIDANCE_ONLY", "FEEDBACK_FOLLOW_UP"],
          resultPersistenceAllowed: false,
          tutoringResultRecorded: false,
          studentVisiblePublished: false,
        },
      };
    },
  };
}

function baseInput() {
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-controlled-answer-artifact.v1",
    artifactInvocationId: "ai_tutor_answer_artifact_invocation_001",
    modelExecutionPrecheckReport: sourcePrecheckReport(),
    principal: {
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      scopes: ["TEACHING_WRITE", "AGENT_COMMAND_SUBMIT"],
    },
    generationAttempt: {
      attemptId: "ai_tutor_answer_attempt_001",
      precheckId: "ai_tutor_model_precheck_001",
      queueRef: "ai_tutor_model_queue_001",
      requestId: "tutor_req_student_app_001",
      workerId: "worker_student_tutor_01",
      modelRoute: "student_tutor_guided_help_v1",
      inputHash: "6baa5a0d27ab0dcd80c4f9a44ef507bbffa6f0e5b2fd9aa6326f65aac0c300c1",
      attemptNumber: 1,
      startedAt: "2026-06-08T08:20:00.000Z",
      completedAt: "2026-06-08T08:20:01.000Z",
      rawOutputCaptured: false,
      promptStored: false,
    },
    artifactPolicy: {
      reviewRequiredBeforeResult: true,
      resultPersistenceAllowed: false,
      studentVisibleAllowed: false,
      requireSourceBlockRefs: true,
      maxGuidanceSections: 4,
      maxSectionChars: 800,
    },
    evidenceRefs: [
      "evidence:model-execution-precheck:student-app-ai-tutor-model-execution-precheck",
      "evidence:controlled-answer-policy:review-before-result",
    ],
    idempotencyKey: "student-app-ai-tutor-controlled-answer:tutor_req_student_app_001:ai_tutor_model_precheck_001",
  };
}

function sourcePrecheckReport() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK",
    runtime: {
      runtimeId: "student_app_ai_tutor_model_execution_precheck_runtime",
      commandPort: "StudentAppAITutorModelExecutionPrecheckPort.recordModelExecutionPrecheck",
      status: "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECKED",
    },
    runtimeSlo: { p99Ms: 9, totalErrors: 0 },
    runtimeProbes: {
      studentAppAiTutorModelExecutionPrecheck: {
        result: {
          schemaVersion: "2026-06-08.student-app.ai-tutor-model-execution-prechecked.v1",
          runtimeId: "student_app_ai_tutor_model_execution_precheck_runtime",
          commandPort: "StudentAppAITutorModelExecutionPrecheckPort.recordModelExecutionPrecheck",
          status: "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECKED",
          requestId: "tutor_req_student_app_001",
          archiveItemId: "tarch_archive_material_001",
          workerId: "worker_student_tutor_01",
          approvalId: "ai_tutor_model_approval_001",
          inputHash: "6baa5a0d27ab0dcd80c4f9a44ef507bbffa6f0e5b2fd9aa6326f65aac0c300c1",
          modelExecutionPrecheck: {
            precheckId: "ai_tutor_model_precheck_001",
            queueRef: "ai_tutor_model_queue_001",
            modelRoute: "student_tutor_guided_help_v1",
            requestId: "tutor_req_student_app_001",
            workerId: "worker_student_tutor_01",
            inputHash: "6baa5a0d27ab0dcd80c4f9a44ef507bbffa6f0e5b2fd9aa6326f65aac0c300c1",
            safeBlockCount: 2,
            status: "AI_TUTOR_MODEL_EXECUTION_PRECHECKED_NOT_STARTED",
            queueAdmissionOnly: true,
            modelInferenceStarted: false,
            tutorResultRecorded: false,
            studentVisiblePublished: false,
          },
          boundary: {
            modelExecutionQueueAdmissionOnly: true,
            safeTextBlockTextSentToPort: false,
            modelInferenceStarted: false,
            tutorAnswerGenerated: false,
            tutoringResultRecorded: false,
            studentVisiblePublished: false,
          },
        },
      },
    },
    safetyInvariants: {
      sourceWorkerStudyPacketInputRequired: true,
      internalServiceOnly: true,
      approvalRequired: true,
      modelExecutionQueueAdmissionOnly: true,
      safeTextBlocksOnly: true,
      inputHashRecorded: true,
      promptConstructed: false,
      modelInferenceAllowed: false,
      tutorAnswerGenerated: false,
      tutoringResultRecorded: false,
      studentVisiblePublished: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      swarmAllowed: false,
    },
  };
}

function resultArchivePrecheckReport() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_MODEL_EXECUTION_PRECHECK",
    runtime: {
      runtimeId: "student_app_ai_tutor_result_archive_model_execution_precheck",
      sharedRuntimeId: "student_app_ai_tutor_model_execution_precheck_runtime",
      commandPort: "StudentAppAITutorModelExecutionPrecheckPort.recordModelExecutionPrecheck",
      status: "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_MODEL_EXECUTION_PRECHECKED",
    },
    runtimeSlo: { p99Ms: 6, totalErrors: 0 },
    runtimeProbes: {
      studentAppAiTutorResultArchiveModelExecutionPrecheck: {
        result: {
          schemaVersion: "2026-06-08.student-app.ai-tutor-model-execution-prechecked.v1",
          runtimeId: "student_app_ai_tutor_model_execution_precheck_runtime",
          commandPort: "StudentAppAITutorModelExecutionPrecheckPort.recordModelExecutionPrecheck",
          status: "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECKED",
          requestId: "tutor_req_student_app_result_archive_001",
          archiveItemId: "tarch_student_ai_tutor_result_001",
          workerId: "worker_student_tutor_02",
          approvalId: "ai_tutor_model_approval_result_archive_001",
          learningActionSource: "AI_TUTOR_RESULT_ARCHIVE",
          resultArchiveStatus: "READY_FOR_STUDENT_APP_READ",
          inputHash: "a81a6025e7ebe70f730722ac145d7f0b7add977b0050be2dc9284e5b61aab0d7",
          modelExecutionPrecheck: {
            precheckId: "ai_tutor_model_precheck_result_archive_001",
            queueRef: "ai_tutor_model_queue_result_archive_001",
            modelRoute: "student_tutor_guided_help_v1",
            requestId: "tutor_req_student_app_result_archive_001",
            workerId: "worker_student_tutor_02",
            inputHash: "a81a6025e7ebe70f730722ac145d7f0b7add977b0050be2dc9284e5b61aab0d7",
            safeBlockCount: 2,
            status: "AI_TUTOR_MODEL_EXECUTION_PRECHECKED_NOT_STARTED",
            queueAdmissionOnly: true,
            modelInferenceStarted: false,
            tutorResultRecorded: false,
            studentVisiblePublished: false,
          },
          boundary: {
            sourceWorkerResultArchiveInputVerified: true,
            sourceWorkerStudyPacketInputVerified: false,
            modelExecutionQueueAdmissionOnly: true,
            safeTextBlockTextSentToPort: false,
            modelInferenceStarted: false,
            tutorAnswerGenerated: false,
            tutoringResultRecorded: false,
            studentVisiblePublished: false,
          },
        },
      },
    },
    safetyInvariants: {
      source0336WorkerResultArchiveInputRequired: true,
      learningActionSourceRequired: "AI_TUTOR_RESULT_ARCHIVE",
      internalServiceOnly: true,
      approvalRequired: true,
      modelExecutionQueueAdmissionOnly: true,
      safeTextBlocksOnly: true,
      inputHashRecorded: true,
      promptConstructed: false,
      modelInferenceAllowed: false,
      tutorAnswerGenerated: false,
      tutoringResultRecorded: false,
      studentVisiblePublished: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      retrievalAllowed: false,
      swarmAllowed: false,
    },
  };
}

function questionBankFeedbackPrecheckReport() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_MODEL_EXECUTION_PRECHECK",
    runtime: {
      runtimeId: "student_app_ai_tutor_question_bank_feedback_model_execution_precheck",
      sharedRuntimeId: "student_app_ai_tutor_model_execution_precheck_runtime",
      commandPort: "StudentAppAITutorModelExecutionPrecheckPort.recordModelExecutionPrecheck",
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_MODEL_EXECUTION_PRECHECKED",
    },
    runtimeSlo: { p99Ms: 5, totalErrors: 0 },
    runtimeProbes: {
      studentAppAiTutorQuestionBankFeedbackModelExecutionPrecheck: {
        result: {
          schemaVersion: "2026-06-08.student-app.ai-tutor-model-execution-prechecked.v1",
          runtimeId: "student_app_ai_tutor_model_execution_precheck_runtime",
          commandPort: "StudentAppAITutorModelExecutionPrecheckPort.recordModelExecutionPrecheck",
          status: "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECKED",
          requestId: "tutor_req_student_app_feedback_001",
          archiveItemId: "tarch_student_feedback_001",
          workerId: "worker_student_tutor_03",
          approvalId: "ai_tutor_model_approval_feedback_001",
          learningActionSource: "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
          feedbackStatus: "READY_FOR_STUDENT_APP_READ",
          feedbackSubmissionId: "qbank_ans_sub_feedback_001",
          feedbackSourceArchiveItemId: "tarch_homework_feedback_source_001",
          inputHash: "a5b2ef0ed017998b85551ded2dee3b0edc4f328bbec77b9c8de538ff758a8bbe",
          modelExecutionPrecheck: {
            precheckId: "ai_tutor_model_precheck_feedback_001",
            queueRef: "ai_tutor_model_queue_feedback_001",
            modelRoute: "student_tutor_guided_help_v1",
            requestId: "tutor_req_student_app_feedback_001",
            workerId: "worker_student_tutor_03",
            inputHash: "a5b2ef0ed017998b85551ded2dee3b0edc4f328bbec77b9c8de538ff758a8bbe",
            safeBlockCount: 2,
            status: "AI_TUTOR_MODEL_EXECUTION_PRECHECKED_NOT_STARTED",
            queueAdmissionOnly: true,
            modelInferenceStarted: false,
            tutorResultRecorded: false,
            studentVisiblePublished: false,
          },
          boundary: {
            sourceWorkerQuestionBankFeedbackInputVerified: true,
            sourceWorkerStudyPacketInputVerified: false,
            sourceWorkerResultArchiveInputVerified: false,
            modelExecutionQueueAdmissionOnly: true,
            safeTextBlockTextSentToPort: false,
            modelInferenceStarted: false,
            tutorAnswerGenerated: false,
            tutoringResultRecorded: false,
            studentVisiblePublished: false,
          },
        },
      },
    },
    safetyInvariants: {
      source0370FeedbackWorkerInputRequired: true,
      learningActionSourceRequired: "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      internalServiceOnly: true,
      approvalRequired: true,
      modelExecutionQueueAdmissionOnly: true,
      safeTextBlocksOnly: true,
      inputHashRecorded: true,
      promptConstructed: false,
      modelInferenceAllowed: false,
      tutorAnswerGenerated: false,
      tutoringResultRecorded: false,
      studentVisiblePublished: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      retrievalAllowed: false,
      swarmAllowed: false,
    },
  };
}
