import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_COMMAND_PORT,
  recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheck,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-runtime.mjs";

describe("Student App AI Tutor question-bank draft answer feedback publication precheck runtime", () => {
  it("blocks student-visible feedback until reviewed feedback artifacts exist", () => {
    const result = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheck(baseInput(), {
      commandLogPath: tempLog(),
      generatedAt: "2026-06-06T12:10:00.000Z",
    });

    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_BLOCKED_UNTIL_REVIEWED_FEEDBACK");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_COMMAND_PORT);
    assert.equal(result.studentScoringResult.submissionId, "qbank_ans_sub_feedback_001");
    assert.equal(result.precheckDecision.feedbackPublicationDecision, "BLOCK_UNTIL_REVIEWED_FEEDBACK");
    assert.equal(result.precheckDecision.studentVisibleFeedbackAllowed, false);
    assert.equal(result.boundary.scoringResultPersistenceVerified, true);
    assert.equal(result.sourceScoringResultPersistenceBridge.recordId, "student_app_ai_tutor_question_bank_draft_answer_scoring_result_persistence_bridge_001");
    assert.equal(result.boundary.safeStudentResultOnly, true);
    assert.equal(result.boundary.feedbackGenerated, false);
    assert.equal(result.boundary.humanReviewCompleted, false);
    assert.equal(result.boundary.studentVisibleFeedbackPublished, false);
    assert.equal(result.boundary.answerKeyDisclosed, false);
  });

  it("uses idempotency for replay and rejects conflicting precheck inputs", () => {
    const commandLogPath = tempLog();
    const first = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheck(baseInput(), { commandLogPath });
    const replay = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheck(baseInput(), { commandLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.studentScoringResult.requestId, first.studentScoringResult.requestId);

    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheck({
        ...baseInput(),
        studentScoringResult: { ...baseInput().studentScoringResult, scoreSummary: "different safe score" },
      }, { commandLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects non-student principals, missing persisted scoring evidence, failed scoring, and unsafe policy", () => {
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheck({
        ...baseInput(),
        principal: { ...baseInput().principal, role: "TEACHER" },
      }, { commandLogPath: tempLog() }),
      /role/u,
    );
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheck({
        ...baseInput(),
        evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-answer-scoring-completion-bridge:qbank_ans_sub_feedback_001"],
      }, { commandLogPath: tempLog() }),
      /scoring result persistence bridge evidence ref/u,
    );
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheck({
        ...baseInput(),
        studentScoringResult: {
          ...baseInput().studentScoringResult,
          status: "FAILED",
          scoreSummary: undefined,
          errorCode: "MODEL_TIMEOUT",
        },
      }, { commandLogPath: tempLog() }),
      /requires a succeeded scoring result/u,
    );
    for (const field of ["detailedFeedbackAvailable", "publicationApproved", "studentVisibleFeedbackAllowed", "answerKeyDisclosureAllowed", "executeHttpRequestAllowed", "swarmAllowed"]) {
      assert.throws(
        () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheck({
          ...baseInput(),
          feedbackPublicationPolicy: { ...baseInput().feedbackPublicationPolicy, [field]: true },
        }, { commandLogPath: tempLog() }),
        new RegExp(field, "u"),
      );
    }
  });

  it("rejects leaked answer, worker, result, model, feedback, publication, and internal error fields", () => {
    for (const field of ["answerText", "expectedAnswer", "explanation", "resultRef", "workerId", "rawModelOutput", "feedback", "publishedAt", "errorMessage"]) {
      const input = baseInput();
      input.studentScoringResult[field] = "leak";
      assert.throws(
        () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheck(input, { commandLogPath: tempLog() }),
        new RegExp(field, "u"),
      );
    }
    const reportLeak = baseInput();
    reportLeak.scoringResultPersistenceBridgeReport.runtime.answerText = "leak";
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationPrecheck(reportLeak, { commandLogPath: tempLog() }),
      /answerText/u,
    );
  });
});

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-feedback-precheck-")), "precheck.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-publication-precheck.v2",
    precheckInvocationId: "feedback_pub_precheck_001",
    principal: {
      principalId: "user_student_001",
      subjectType: "USER",
      role: "STUDENT",
      entryPoint: "STUDENT_APP",
      scopes: ["STUDENT_OWN_READ", "TEACHING_READ"],
      sessionId: "session_student_001",
      studentAccess: { mode: "OWN", ownStudentId: "student_001" },
    },
    scoringResultPersistenceBridgeReport: scoringResultPersistenceBridgeReport(),
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
    feedbackPublicationPolicy: {
      feedbackPublicationPrecheckOnly: true,
      scoringResultPersistenceRequired: true,
      safeStudentResultRequired: true,
      humanReviewRequired: true,
      feedbackArtifactRequired: true,
      detailedFeedbackAvailable: false,
      publicationApproved: false,
      studentVisibleFeedbackAllowed: false,
      answerKeyDisclosureAllowed: false,
      workerMetadataDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      modelInferenceAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge:qbank_ans_sub_feedback_001"],
    idempotencyKey: "student-app-ai-tutor-feedback-publication-precheck:student_001:qbank_ans_sub_feedback_001",
  };
}

function scoringResultPersistenceBridgeReport() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_RUNTIME",
    runtime: {
      runtimeId: "student_app_ai_tutor_question_bank_draft_answer_scoring_result_persistence_bridge_runtime",
      commandPort: "StudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridgePort.recordAIGradingResult",
      targetUseCase: "RecordAIGradingResult.Execute",
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTED",
    },
    safetyInvariants: {
      sourceControlledScoringArtifactRequired: true,
      existingRecordAIGradingResultUseCaseRequired: true,
      metadataOnlyResultAllowed: true,
      recordAIGradingResultUseCaseInvoked: true,
      resultPersistenceAllowed: true,
      resultPersistenceCommitted: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      answerTextDisclosed: false,
      expectedAnswerDisclosed: false,
      explanationDisclosed: false,
      answerKeyDisclosed: false,
      rawModelOutputStored: false,
      feedbackGenerationAllowed: false,
      studentVisiblePublishAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    runtimeProbes: {
      studentAppAiTutorQuestionBankDraftAnswerScoringResultPersistenceBridge: {
        result: {
          runtimeId: "student_app_ai_tutor_question_bank_draft_answer_scoring_result_persistence_bridge_runtime",
          commandPort: "StudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridgePort.recordAIGradingResult",
          status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTED",
          recordId: "student_app_ai_tutor_question_bank_draft_answer_scoring_result_persistence_bridge_001",
          executionState: "SCORING_RESULT_PERSISTED_VIA_RECORD_AI_GRADING_RESULT",
          sourceControlledScoringArtifact: {
            submissionId: "qbank_ans_sub_feedback_001",
            workerId: "ai_grading_worker_scoring_001",
          },
          persistedAIGradingResult: {
            requestId: "grading_req_feedback_001",
            workerId: "ai_grading_worker_scoring_001",
            status: "SUCCEEDED",
            scoreSummary: "Question-bank answer score 93/100 (93%, ADVANCED); items=5; artifact=qbank_answer_scoring_artifact_feedback_001",
            resultRef: "controlled-score-artifact://qbank_answer_scoring_artifact_feedback_001?request=grading_req_feedback_001&hash=sha256_abcdef",
            resultPersistenceCommitted: true,
            feedbackGenerationStarted: false,
            studentVisiblePublished: false,
          },
          boundary: {
            resultPersistenceCommitted: true,
            feedbackGenerationStarted: false,
            studentVisiblePublished: false,
            answerKeyDisclosed: false,
            rawModelOutputStored: false,
            directDatabaseAccessAllowed: false,
            executeHttpRequestAllowed: false,
            swarmAllowed: false,
          },
        },
      },
    },
  };
}
