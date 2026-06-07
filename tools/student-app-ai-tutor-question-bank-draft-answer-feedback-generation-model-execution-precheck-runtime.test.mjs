import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECK_PORT,
  recordStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck-runtime.mjs";

describe("Student App AI Tutor question-bank draft answer feedback generation model execution precheck runtime", () => {
  it("admits feedback generation to a controlled model queue without starting inference", async () => {
    const calls = [];
    const result = await recordStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck(baseInput(), {
      commandLogPath: tempLog(),
      generatedAt: "2026-06-07T03:00:00.000Z",
      feedbackGenerationModelExecutionPrecheckPort: port(calls),
    });

    assert.equal(calls.length, 1);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECKED");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECK_PORT);
    assert.equal(result.feedbackGenerationModelPrecheck.modelRoute, "StudentTutorAgent.generate_question_bank_answer_feedback");
    assert.equal(result.feedbackGenerationModelPrecheck.submissionId, "qbank_ans_sub_feedback_001");
    assert.equal(result.boundary.feedbackGenerationQueueAdmitted, true);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.equal(result.boundary.feedbackDraftGenerated, false);
    assert.equal(result.boundary.reviewedFeedbackArtifactRecorded, false);
    assert.equal(result.boundary.studentVisibleFeedbackPublished, false);
  });

  it("uses idempotency for replay and rejects conflicting precheck inputs", async () => {
    const commandLogPath = tempLog();
    const first = await recordStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck(baseInput(), {
      commandLogPath,
      feedbackGenerationModelExecutionPrecheckPort: port(),
    });
    const replay = await recordStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck(baseInput(), {
      commandLogPath,
      feedbackGenerationModelExecutionPrecheckPort: port(),
    });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.feedbackGenerationModelPrecheck.requestId, first.feedbackGenerationModelPrecheck.requestId);

    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck({
        ...baseInput(),
        modelExecutionPolicy: { ...baseInput().modelExecutionPolicy, maxPromptTokens: 4096 },
      }, { commandLogPath, feedbackGenerationModelExecutionPrecheckPort: port() }),
      /idempotency key already exists/u,
    );
  });

  it("rejects unsafe source precheck, principal, approval, policy, and port results", async () => {
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck({
        ...baseInput(),
        feedbackPublicationPrecheckReport: {
          ...baseInput().feedbackPublicationPrecheckReport,
          safetyInvariants: { ...baseInput().feedbackPublicationPrecheckReport.safetyInvariants, resultRefDisclosureAllowed: true },
        },
      }, { commandLogPath: tempLog(), feedbackGenerationModelExecutionPrecheckPort: port() }),
      /resultRefDisclosureAllowed/u,
    );
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck({
        ...baseInput(),
        principal: { ...baseInput().principal, entryPoint: "STUDENT_APP" },
      }, { commandLogPath: tempLog(), feedbackGenerationModelExecutionPrecheckPort: port() }),
      /entryPoint/u,
    );
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck({
        ...baseInput(),
        approval: { ...baseInput().approval, allowsStudentVisiblePublication: true },
      }, { commandLogPath: tempLog(), feedbackGenerationModelExecutionPrecheckPort: port() }),
      /allowsStudentVisiblePublication/u,
    );
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck({
        ...baseInput(),
        modelExecutionPolicy: { ...baseInput().modelExecutionPolicy, feedbackDraftGenerated: true },
      }, { commandLogPath: tempLog(), feedbackGenerationModelExecutionPrecheckPort: port() }),
      /feedbackDraftGenerated/u,
    );
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck(baseInput(), {
        commandLogPath: tempLog(),
        feedbackGenerationModelExecutionPrecheckPort: {
          async recordFeedbackGenerationModelExecutionPrecheck(request) {
            return { ...portResult(request), modelInferenceStarted: true };
          },
        },
      }),
      /modelInferenceStarted/u,
    );
  });

  it("rejects leaked answer, result, raw model, feedback, publication, and internal error fields", async () => {
    for (const field of ["answerText", "expectedAnswer", "explanation", "resultRef", "rawModelOutput", "learnerFeedback", "publishedAt", "errorMessage"]) {
      const input = baseInput();
      input.feedbackPublicationPrecheckReport.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationPrecheck.result.studentScoringResult[field] = "leak";
      await assert.rejects(
        () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck(input, {
          commandLogPath: tempLog(),
          feedbackGenerationModelExecutionPrecheckPort: port(),
        }),
        new RegExp(field, "u"),
      );
    }
  });
});

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-feedback-generation-model-precheck-")), "precheck.jsonl");
}

function port(calls = []) {
  return {
    async recordFeedbackGenerationModelExecutionPrecheck(request) {
      calls.push(request);
      return portResult(request);
    },
  };
}

function portResult(request) {
  return {
    precheckId: "feedback_generation_model_precheck_001",
    queueRef: "feedback_generation_model_queue_001",
    modelRoute: request.modelRoute,
    requestId: request.requestId,
    submissionId: request.submissionId,
    status: "FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECKED_NOT_STARTED",
    queueAdmissionOnly: true,
    modelInferenceStarted: false,
    feedbackDraftGenerated: false,
    studentVisiblePublished: false,
  };
}

function baseInput() {
  return {
    schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck.v1",
    precheckInvocationId: "feedback_generation_model_precheck_001",
    feedbackPublicationPrecheckReport: feedbackPublicationPrecheckReport(),
    principal: {
      principalId: "student_tutor_agent_service_001",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT", "FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECK_APPROVE"],
      sessionId: "session_agent_001",
    },
    approval: {
      approvalId: "feedback_generation_model_approval_001",
      reviewerPrincipalId: "teacher_001",
      reviewerRole: "TEACHER",
      approved: true,
      approvalScope: "FEEDBACK_GENERATION_MODEL_QUEUE_ONLY",
      modelRoute: "StudentTutorAgent.generate_question_bank_answer_feedback",
      requestId: "grading_req_feedback_001",
      submissionId: "qbank_ans_sub_feedback_001",
      approvedAt: "2026-06-07T02:58:00.000Z",
      allowsStudentVisiblePublication: false,
      allowsAnswerKeyDisclosure: false,
    },
    modelExecutionPolicy: {
      feedbackGenerationModelPrecheckOnly: true,
      feedbackGenerationQueueAdmissionOnly: true,
      futureFeedbackDraftGenerationApproved: true,
      scoringResultPersistenceRequired: true,
      safeStudentResultRequired: true,
      humanReviewRequiredAfterGeneration: true,
      modelRoute: "StudentTutorAgent.generate_question_bank_answer_feedback",
      maxPromptTokens: 2048,
      maxCompletionTokens: 512,
      modelInferenceStarted: false,
      feedbackDraftGenerated: false,
      reviewedFeedbackArtifactRecorded: false,
      studentVisiblePublicationAllowed: false,
      answerKeyDisclosureAllowed: false,
      rawModelOutputPersistenceAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      "evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck:qbank_ans_sub_feedback_001",
      "evidence:student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge:qbank_ans_sub_feedback_001",
      "evidence:feedback-generation-model-execution-approval:feedback_generation_model_approval_001",
    ],
    idempotencyKey: "student-app-ai-tutor-feedback-generation-model-precheck:student_001:qbank_ans_sub_feedback_001",
  };
}

function feedbackPublicationPrecheckReport() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_RUNTIME",
    runtime: {
      runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_runtime",
      decision: "BLOCK_UNTIL_REVIEWED_FEEDBACK",
    },
    runtimeSlo: { targetP99Ms: 50, p99Ms: 7, totalErrors: 0 },
    safetyInvariants: {
      scoringResultPersistenceRequired: true,
      safeStudentResultRequired: true,
      humanReviewRequired: true,
      feedbackArtifactRequired: true,
      studentVisibleFeedbackAllowed: false,
      answerKeyDisclosureAllowed: false,
      workerMetadataDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      modelInferenceAllowed: false,
    },
    runtimeProbes: {
      studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationPrecheck: {
        result: {
          recordId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_001",
          runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_runtime",
          precheckInvocationId: "feedback_pub_precheck_001",
          sourceScoringResultPersistenceBridge: {
            runtimeId: "student_app_ai_tutor_question_bank_draft_answer_scoring_result_persistence_bridge_runtime",
            recordId: "student_app_ai_tutor_question_bank_draft_answer_scoring_result_persistence_bridge_001",
            requestId: "grading_req_feedback_001",
            submissionId: "qbank_ans_sub_feedback_001",
          },
          studentScoringResult: {
            submissionId: "qbank_ans_sub_feedback_001",
            requestId: "grading_req_feedback_001",
            questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
            tutoringAnalysisRequestId: "tutor_req_student_app_001",
            archiveItemId: "tarch_student_quiz_001",
            status: "SUCCEEDED",
            scoreSummary: "Score 93. The student can compare simple fractions.",
            requestedAt: "2026-06-06T12:00:00.000Z",
            completedAt: "2026-06-06T12:05:00.000Z",
            updatedAt: "2026-06-06T12:05:00.000Z",
          },
          precheckDecision: {
            feedbackPublicationDecision: "BLOCK_UNTIL_REVIEWED_FEEDBACK",
            scoringResultPersistenceVerified: true,
            safeStudentResultVerified: true,
          },
          boundary: {
            feedbackPublicationPrecheckOnly: true,
            feedbackGenerated: false,
            studentVisibleFeedbackPublished: false,
            modelInferenceStarted: false,
          },
          evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge:qbank_ans_sub_feedback_001"],
        },
      },
    },
  };
}
