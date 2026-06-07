import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_PORT,
  formatStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact,
  recordStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact,
} from "./student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact-runtime.mjs";

describe("Student App AI Tutor question-bank draft answer controlled scoring artifact runtime", () => {
  it("records a controlled scoring artifact without persisting result or feedback", async () => {
    const port = recordingScoringArtifactPort();
    const result = await recordStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(baseInput(), {
      controlledScoringArtifactPort: port,
      artifactLogPath: tempArtifactLogPath(),
      generatedAt: "2026-06-07T09:00:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-controlled-scoring-artifact-recorded.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_RECORDED");
    assert.equal(result.scoreArtifact.requestId, "grading_req_qbank_answer_audit_001");
    assert.equal(result.scoreArtifact.executionState, "SCORING_ARTIFACT_RECORDED_NOT_PERSISTED");
    assert.equal(result.scoreArtifact.scoreSummary.totalScore, 16);
    assert.equal(result.scoreArtifact.scoreSummary.maxScore, 20);
    assert.equal(result.boundary.modelInferenceStarted, true);
    assert.equal(result.boundary.scoringExecutionStarted, true);
    assert.equal(result.boundary.resultPersistenceStarted, false);
    assert.equal(result.boundary.feedbackGenerationStarted, false);
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal(result.boundary.answerTextDisclosed, false);
    assert.equal("answerText" in result.scoreArtifact.itemScores[0], false);
    assert.equal("rawModelOutput" in result.scoreArtifact, false);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].protectedScoringInput.items.length, 2);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(result), /Persisted: false/u);
  });

  it("uses idempotency for safe replay and rejects conflicting scoring artifacts", async () => {
    const artifactLogPath = tempArtifactLogPath();
    const port = recordingScoringArtifactPort();
    const first = await recordStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(baseInput(), {
      controlledScoringArtifactPort: port,
      artifactLogPath,
    });
    const replay = await recordStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(baseInput(), {
      controlledScoringArtifactPort: port,
      artifactLogPath,
    });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(artifactLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.scoringInvocationId = "qbank_answer_scoring_model_execution_002";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(conflicting, {
        controlledScoringArtifactPort: port,
        artifactLogPath,
      }),
      /idempotency key already exists/u,
    );
  });

  it("rejects missing ports, unsafe principals, and unsafe output policies", async () => {
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(baseInput(), { artifactLogPath: tempArtifactLogPath() }),
      /ControlledScoringArtifactPort\.recordControlledScoringArtifact is required/u,
    );

    const unsafePrincipal = baseInput();
    unsafePrincipal.principal.role = "STUDENT";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(unsafePrincipal, {
        controlledScoringArtifactPort: recordingScoringArtifactPort(),
        artifactLogPath: tempArtifactLogPath(),
      }),
      /input\.principal\.role must be SERVICE/u,
    );

    const missingScope = baseInput();
    missingScope.principal.scopes = ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT", "OTHER_SCOPE"];
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(missingScope, {
        controlledScoringArtifactPort: recordingScoringArtifactPort(),
        artifactLogPath: tempArtifactLogPath(),
      }),
      /ANSWER_SCORING_MODEL_EXECUTE/u,
    );

    for (const field of ["answerTextInArtifactAllowed", "expectedAnswerInArtifactAllowed", "rawModelOutputStored", "resultPersistenceAllowed", "feedbackGenerationAllowed", "studentVisiblePublishAllowed", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.outputPolicy[field] = true;
      await assert.rejects(
        () => recordStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(input, {
          controlledScoringArtifactPort: recordingScoringArtifactPort(),
          artifactLogPath: tempArtifactLogPath(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }
  });

  it("rejects unsafe source reports and broken protected input linkage", async () => {
    const notReadyPrecheck = baseInput();
    notReadyPrecheck.modelExecutionPrecheckReport.readiness = "NEEDS_REMEDIATION";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(notReadyPrecheck, {
        controlledScoringArtifactPort: recordingScoringArtifactPort(),
        artifactLogPath: tempArtifactLogPath(),
      }),
      /input\.modelExecutionPrecheckReport\.readiness must be READY/u,
    );

    const notReadyInput = baseInput();
    notReadyInput.answerScoringInputFoundationReport.readiness = "NEEDS_REMEDIATION";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(notReadyInput, {
        controlledScoringArtifactPort: recordingScoringArtifactPort(),
        artifactLogPath: tempArtifactLogPath(),
      }),
      /input\.answerScoringInputFoundationReport\.readiness must be READY/u,
    );

    const wrongWorker = baseInput();
    wrongWorker.protectedScoringInput.workerId = "ai_grading_worker_other";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(wrongWorker, {
        controlledScoringArtifactPort: recordingScoringArtifactPort(),
        artifactLogPath: tempArtifactLogPath(),
      }),
      /input\.protectedScoringInput\.workerId must be ai_grading_worker_scoring_001/u,
    );

    const itemMismatch = baseInput();
    itemMismatch.protectedScoringInput.items = itemMismatch.protectedScoringInput.items.slice(0, 1);
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(itemMismatch, {
        controlledScoringArtifactPort: recordingScoringArtifactPort(),
        artifactLogPath: tempArtifactLogPath(),
      }),
      /input\.protectedScoringInput\.items\.length must be 2/u,
    );
  });

  it("rejects leaked artifact fields, unsafe port results, invalid score totals, and missing evidence", async () => {
    const leakPort = recordingScoringArtifactPort({ rawModelOutput: "hidden chain" });
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(baseInput(), {
        controlledScoringArtifactPort: leakPort,
        artifactLogPath: tempArtifactLogPath(),
      }),
      /rawModelOutput is not allowed/u,
    );

    const answerLeakPort = recordingScoringArtifactPort({}, [{ itemId: "qbank_plan_item_001", answerText: "student answer" }]);
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(baseInput(), {
        controlledScoringArtifactPort: answerLeakPort,
        artifactLogPath: tempArtifactLogPath(),
      }),
      /answerText is not allowed/u,
    );

    const persistedPort = recordingScoringArtifactPort({ resultPersistenceStarted: true });
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(baseInput(), {
        controlledScoringArtifactPort: persistedPort,
        artifactLogPath: tempArtifactLogPath(),
      }),
      /resultPersistenceStarted must be false/u,
    );

    const invalidTotalsPort = recordingScoringArtifactPort({ scoreSummary: { totalScore: 99, maxScore: 20, percentage: 80, level: "PROFICIENT" } });
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(baseInput(), {
        controlledScoringArtifactPort: invalidTotalsPort,
        artifactLogPath: tempArtifactLogPath(),
      }),
      /scoreSummary\.totalScore must be 16/u,
    );

    const missingEvidence = baseInput();
    missingEvidence.evidenceRefs = [
      "evidence:answer-scoring-model-execution-precheck:student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck",
      "evidence:answer-scoring-input-foundation:student-app-ai-tutor-question-bank-draft-answer-scoring-input",
      "evidence:other",
      "evidence:model-route:StudentTutorAgent.score_question_bank_answer",
    ];
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerControlledScoringArtifact(missingEvidence, {
        controlledScoringArtifactPort: recordingScoringArtifactPort(),
        artifactLogPath: tempArtifactLogPath(),
      }),
      /controlled-scoring-model-execution evidence ref is required/u,
    );
  });
});

function tempArtifactLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-answer-controlled-scoring-artifact-")), "artifact.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-controlled-scoring-artifact.v1",
    scoringInvocationId: "qbank_answer_scoring_model_execution_001",
    modelExecutionPrecheckReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck.current.json", "utf8")),
    answerScoringInputFoundationReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-scoring-input.current.json", "utf8")),
    principal: {
      principalId: "svc_student_tutor_agent",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      sessionId: "svc_session_student_tutor_agent",
      scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT", "ANSWER_SCORING_MODEL_EXECUTE"],
    },
    protectedScoringInput: protectedScoringInput(),
    scoringAttempt: scoringAttempt(),
    outputPolicy: outputPolicy(),
    evidenceRefs: [
      "evidence:answer-scoring-model-execution-precheck:student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck",
      "evidence:answer-scoring-input-foundation:student-app-ai-tutor-question-bank-draft-answer-scoring-input",
      "evidence:controlled-scoring-model-execution:qbank_answer_scoring_model_attempt_001",
      "evidence:model-route:StudentTutorAgent.score_question_bank_answer",
    ],
    idempotencyKey: "student-app-ai-tutor-qbank-answer-controlled-scoring-artifact:student_001:grading_req_qbank_answer_audit_001",
  };
}

function protectedScoringInput() {
  return {
    requestId: "grading_req_qbank_answer_audit_001",
    submissionId: "qbank_ans_sub_audit_001",
    questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
    workerId: "ai_grading_worker_scoring_001",
    sourceFoundationRuntimeId: "student_app_ai_tutor_question_bank_draft_answer_scoring_input_foundation",
    items: [
      {
        itemId: "qbank_plan_item_001",
        answerText: "student answer one",
        expectedAnswer: "expected answer one",
        explanation: "rubric explanation one",
        maxScore: 10,
        rubricCode: "rubric_qbank_plan_item_001",
      },
      {
        itemId: "qbank_plan_item_002",
        answerText: "student answer two",
        expectedAnswer: "expected answer two",
        explanation: "rubric explanation two",
        maxScore: 10,
        rubricCode: "rubric_qbank_plan_item_002",
      },
    ],
  };
}

function scoringAttempt() {
  return {
    attemptId: "qbank_answer_scoring_model_attempt_001",
    precheckId: "qbank_answer_scoring_model_precheck_audit_001",
    requestId: "grading_req_qbank_answer_audit_001",
    workerId: "ai_grading_worker_scoring_001",
    modelRoute: "StudentTutorAgent.score_question_bank_answer",
    queueRef: "qbank_answer_scoring_model_queue_local_001",
    providerClass: "CONTROLLED_AI_WORKER",
    attemptNo: 1,
  };
}

function outputPolicy() {
  return {
    controlledScoreArtifactOnly: true,
    modelInferenceAllowed: true,
    scoringExecutionAllowed: true,
    answerTextInArtifactAllowed: false,
    expectedAnswerInArtifactAllowed: false,
    explanationInArtifactAllowed: false,
    rawModelOutputStored: false,
    resultPersistenceAllowed: false,
    feedbackGenerationAllowed: false,
    studentVisiblePublishAllowed: false,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    swarmAllowed: false,
  };
}

function recordingScoringArtifactPort(artifactOverrides = {}, itemScoreOverrides = []) {
  const calls = [];
  return {
    calls,
    async recordControlledScoringArtifact(request) {
      calls.push(request);
      const itemScores = [
        { itemId: "qbank_plan_item_001", score: 8, maxScore: 10, confidence: 0.91, rubricCode: "rubric_qbank_plan_item_001" },
        { itemId: "qbank_plan_item_002", score: 8, maxScore: 10, confidence: 0.89, rubricCode: "rubric_qbank_plan_item_002" },
      ].map((score) => ({ ...score, ...(itemScoreOverrides.find((override) => override.itemId === score.itemId) ?? {}) }));
      return {
        scoreArtifact: {
          artifactId: "qbank_answer_scoring_artifact_001",
          requestId: request.modelExecutionPrecheck.requestId,
          submissionId: request.modelExecutionPrecheck.submissionId,
          questionBankDraftRef: request.modelExecutionPrecheck.questionBankDraftRef,
          tutoringAnalysisRequestId: "tutor_req_student_app_001",
          archiveItemId: "tarch_student_quiz_001",
          workerId: request.modelExecutionPrecheck.workerId,
          modelRoute: request.modelExecutionPrecheck.modelRoute,
          attemptId: request.scoringAttempt.attemptId,
          executionState: "SCORING_ARTIFACT_RECORDED_NOT_PERSISTED",
          status: "REVIEWED_MODEL_SCORE_ARTIFACT_RECORDED_NOT_PERSISTED",
          itemScores,
          scoreSummary: { totalScore: 16, maxScore: 20, percentage: 80, level: "PROFICIENT" },
          resultPersistenceStarted: false,
          feedbackGenerationStarted: false,
          studentVisiblePublished: false,
          ...artifactOverrides,
        },
      };
    },
  };
}
