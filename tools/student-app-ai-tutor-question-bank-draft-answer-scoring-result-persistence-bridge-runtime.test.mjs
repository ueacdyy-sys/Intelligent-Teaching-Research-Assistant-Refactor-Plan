import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_PORT,
  formatStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge,
  recordStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge,
} from "./student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge-runtime.mjs";

describe("Student App AI Tutor question-bank draft answer scoring result persistence bridge runtime", () => {
  it("persists a controlled scoring artifact through RecordAIGradingResult without feedback or publication", async () => {
    const port = recordingAIGradingResultPort();
    const result = await recordStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(baseInput(), {
      recordAIGradingResultPort: port,
      resultLogPath: tempResultLogPath(),
      generatedAt: "2026-06-07T10:00:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge-recorded.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTED");
    assert.equal(result.executionState, "SCORING_RESULT_PERSISTED_VIA_RECORD_AI_GRADING_RESULT");
    assert.equal(result.recordAIGradingResultCommand.targetUseCase, "RecordAIGradingResult.Execute");
    assert.equal(result.recordAIGradingResultCommand.targetOperationId, "recordTeachingAIGradingWorkerResult");
    assert.equal(result.recordAIGradingResultCommand.recordAIGradingResultInput.status, "SUCCEEDED");
    assert.equal(result.recordAIGradingResultCommand.recordAIGradingResultInput.requestId, "grading_req_qbank_answer_audit_001");
    assert.equal(result.recordAIGradingResultCommand.recordAIGradingResultInput.workerId, "ai_grading_worker_scoring_001");
    assert.match(result.recordAIGradingResultCommand.recordAIGradingResultInput.scoreSummary, /16\/20/u);
    assert.match(result.recordAIGradingResultCommand.recordAIGradingResultInput.resultRef, /^controlled-score-artifact:\/\/qbank_answer_scoring_artifact_001/u);
    assert.equal(result.boundary.recordAIGradingResultUseCaseInvoked, true);
    assert.equal(result.boundary.resultPersistenceCommitted, true);
    assert.equal(result.boundary.feedbackGenerationStarted, false);
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal(result.boundary.directDatabaseAccessAllowed, false);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].recordAIGradingResultInput.status, "SUCCEEDED");
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(result), /Persisted: true/u);
  });

  it("uses idempotency for safe replay and rejects conflicting persistence commands", async () => {
    const resultLogPath = tempResultLogPath();
    const port = recordingAIGradingResultPort();
    const first = await recordStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(baseInput(), {
      recordAIGradingResultPort: port,
      resultLogPath,
    });
    const replay = await recordStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(baseInput(), {
      recordAIGradingResultPort: port,
      resultLogPath,
    });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(resultLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.persistenceInvocationId = "qbank_answer_scoring_result_persist_002";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(conflicting, {
        recordAIGradingResultPort: port,
        resultLogPath,
      }),
      /idempotency key already exists/u,
    );
  });

  it("rejects missing ports, unsafe principals, and unsafe policies", async () => {
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(baseInput(), { resultLogPath: tempResultLogPath() }),
      /ResultPersistenceBridgePort\.recordAIGradingResult is required/u,
    );

    const unsafePrincipal = baseInput();
    unsafePrincipal.principal.role = "STUDENT";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(unsafePrincipal, {
        recordAIGradingResultPort: recordingAIGradingResultPort(),
        resultLogPath: tempResultLogPath(),
      }),
      /input\.principal\.role must be SERVICE/u,
    );

    const missingScope = baseInput();
    missingScope.principal.scopes = ["AGENT_COMMAND_SUBMIT", "OTHER_SCOPE"];
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(missingScope, {
        recordAIGradingResultPort: recordingAIGradingResultPort(),
        resultLogPath: tempResultLogPath(),
      }),
      /TEACHING_WRITE/u,
    );

    for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "feedbackGenerationAllowed", "studentVisiblePublishAllowed", "answerTextAllowed", "expectedAnswerAllowed", "explanationAllowed", "answerKeyAllowed", "rawModelOutputStored", "remoteDeviceControlAllowed", "localToolMutationAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.resultPersistencePolicy[field] = true;
      await assert.rejects(
        () => recordStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(input, {
          recordAIGradingResultPort: recordingAIGradingResultPort(),
          resultLogPath: tempResultLogPath(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }
  });

  it("rejects unsafe source reports and leaked artifact fields", async () => {
    const notReady = baseInput();
    notReady.controlledScoringArtifactReport.readiness = "NEEDS_REMEDIATION";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(notReady, {
        recordAIGradingResultPort: recordingAIGradingResultPort(),
        resultLogPath: tempResultLogPath(),
      }),
      /input\.controlledScoringArtifactReport\.readiness must be READY/u,
    );

    const persistedEarly = baseInput();
    persistedEarly.controlledScoringArtifactReport.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerControlledScoringArtifact.result.boundary.resultPersistenceStarted = true;
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(persistedEarly, {
        recordAIGradingResultPort: recordingAIGradingResultPort(),
        resultLogPath: tempResultLogPath(),
      }),
      /resultPersistenceStarted must be false/u,
    );

    const leaked = baseInput();
    leaked.controlledScoringArtifactReport.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerControlledScoringArtifact.result.scoreArtifact.itemScores[0].answerText = "student answer";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(leaked, {
        recordAIGradingResultPort: recordingAIGradingResultPort(),
        resultLogPath: tempResultLogPath(),
      }),
      /answerText is not allowed/u,
    );
  });

  it("rejects unsafe port results, mismatched result refs, and missing source evidence", async () => {
    const feedbackPort = recordingAIGradingResultPort({ feedbackGenerationStarted: true });
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(baseInput(), {
        recordAIGradingResultPort: feedbackPort,
        resultLogPath: tempResultLogPath(),
      }),
      /feedbackGenerationStarted must be false/u,
    );

    const wrongRefPort = recordingAIGradingResultPort({ resultRef: "controlled-score-artifact://other" });
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(baseInput(), {
        recordAIGradingResultPort: wrongRefPort,
        resultLogPath: tempResultLogPath(),
      }),
      /resultRef must be controlled-score-artifact/u,
    );

    const missingEvidence = baseInput();
    missingEvidence.evidenceRefs = ["evidence:result-persistence-policy:reviewed", "evidence:other"];
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(missingEvidence, {
        recordAIGradingResultPort: recordingAIGradingResultPort(),
        resultLogPath: tempResultLogPath(),
      }),
      /controlled scoring artifact evidence ref is required/u,
    );
  });
});

function tempResultLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-answer-result-persistence-")), "result.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge.v1",
    persistenceInvocationId: "qbank_answer_scoring_result_persist_001",
    controlledScoringArtifactReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact.current.json", "utf8")),
    principal: {
      principalId: "svc_student_tutor_agent",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      sessionId: "svc_session_student_tutor_agent",
      scopes: ["TEACHING_WRITE", "AGENT_COMMAND_SUBMIT"],
    },
    resultPersistencePolicy: {
      controlledScoringArtifactRequired: true,
      existingRecordAIGradingResultUseCaseRequired: true,
      injectedRecordAIGradingResultPortRequired: true,
      metadataOnlyResultAllowed: true,
      resultPersistenceAllowed: true,
      idempotentPersistenceRequired: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      feedbackGenerationAllowed: false,
      studentVisiblePublishAllowed: false,
      answerTextAllowed: false,
      expectedAnswerAllowed: false,
      explanationAllowed: false,
      answerKeyAllowed: false,
      rawModelOutputStored: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      "evidence:student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact:0291",
      "evidence:result-persistence-policy:record-ai-grading-result",
    ],
    idempotencyKey: "student-app-ai-tutor-qbank-answer-scoring-result-persistence:student_001:grading_req_qbank_answer_audit_001",
  };
}

function recordingAIGradingResultPort(overrides = {}) {
  const calls = [];
  return {
    calls,
    async recordAIGradingResult(request) {
      calls.push(request);
      return {
        aiGradingResult: {
          requestId: request.recordAIGradingResultInput.requestId,
          workerId: request.recordAIGradingResultInput.workerId,
          status: request.recordAIGradingResultInput.status,
          scoreSummary: request.recordAIGradingResultInput.scoreSummary,
          resultRef: request.recordAIGradingResultInput.resultRef,
          recordAIGradingResultUseCaseInvoked: true,
          resultPersistenceCommitted: true,
          feedbackGenerationStarted: false,
          studentVisiblePublished: false,
          ...overrides,
        },
      };
    },
  };
}
