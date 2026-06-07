import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_RESULT_COMMAND_PORT,
  recordStudentAppAITutorResult,
} from "./student-app-ai-tutor-result-runtime.mjs";

describe("Student App AI Tutor result runtime", () => {
  it("records a successful AI Tutor analysis result through the injected use case port", async () => {
    const calls = [];
    const result = await recordStudentAppAITutorResult(baseInput(), {
      studentAppAITutorResultPort: {
        async recordTutoringAnalysisResult(request) {
          calls.push(request);
          return portResult();
        },
      },
    }, { resultLogPath: tempLog(), generatedAt: "2026-06-05T00:01:00.000Z" });

    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_RESULT_RECORDED");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_RESULT_COMMAND_PORT);
    assert.equal(result.queue.targetUseCase, "RecordTutoringAnalysisResult.Execute");
    assert.equal(result.queue.writeRepositoryOperation, "ArchiveRepository.RecordTutoringAnalysisResult");
    assert.equal(result.result.requestId, "tutor_req_student_app_001");
    assert.equal(result.result.workerId, "worker_student_tutor_local_01");
    assert.equal(result.result.status, "SUCCEEDED");
    assert.equal(result.boundary.resultRecorded, true);
    assert.equal(result.boundary.modelExecutionStarted, false);
    assert.equal(result.boundary.questionBankDraftCreated, false);
    assert.equal(result.boundary.studentVisibleResultPublished, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].safety.executeModelNowAllowed, false);
  });

  it("uses idempotency for replay and rejects conflicting result inputs", async () => {
    const resultLogPath = tempLog();
    const first = await recordStudentAppAITutorResult(baseInput(), baseDeps(), { resultLogPath });
    const replay = await recordStudentAppAITutorResult(baseInput(), {
      studentAppAITutorResultPort: {
        async recordTutoringAnalysisResult() {
          throw new Error("port should not be called for replay");
        },
      },
    }, { resultLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.result.requestId, first.result.requestId);

    await assert.rejects(
      () => recordStudentAppAITutorResult({
        ...baseInput(),
        result: { ...baseInput().result, resultSummary: "different summary" },
      }, baseDeps(), { resultLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("records failed analysis output without result fields", async () => {
    const input = {
      ...baseInput(),
      result: {
        status: "FAILED",
        errorCode: "MODEL_TIMEOUT",
        errorMessage: "analysis worker timed out before producing a safe result",
      },
    };
    const result = await recordStudentAppAITutorResult(input, {
      studentAppAITutorResultPort: {
        async recordTutoringAnalysisResult() {
          return {
            source: portResult().source,
            result: {
              requestId: "tutor_req_student_app_001",
              workerId: "worker_student_tutor_local_01",
              status: "FAILED",
              errorCode: "MODEL_TIMEOUT",
              errorMessage: "analysis worker timed out before producing a safe result",
              completedAt: "2026-06-05T00:01:00.000Z",
            },
          };
        },
      },
    }, { resultLogPath: tempLog() });

    assert.equal(result.result.status, "FAILED");
    assert.equal(result.result.errorCode, "MODEL_TIMEOUT");
    assert.equal(result.boundary.resultRecorded, true);
  });

  it("rejects missing ports, non-service principals, remote workers, and mismatched leases", async () => {
    await assert.rejects(
      () => recordStudentAppAITutorResult(baseInput(), {}, { resultLogPath: tempLog() }),
      /recordTutoringAnalysisResult is required/u,
    );
    await assert.rejects(
      () => recordStudentAppAITutorResult({
        ...baseInput(),
        principal: { ...baseInput().principal, subjectType: "USER", role: "STUDENT", entryPoint: "STUDENT_APP" },
      }, baseDeps(), { resultLogPath: tempLog() }),
      /subjectType|role|entryPoint/u,
    );
    await assert.rejects(
      () => recordStudentAppAITutorResult({
        ...baseInput(),
        worker: { ...baseInput().worker, nodeType: "REMOTE" },
      }, baseDeps(), { resultLogPath: tempLog() }),
      /nodeType/u,
    );
    await assert.rejects(
      () => recordStudentAppAITutorResult({
        ...baseInput(),
        claim: { ...baseInput().claim, claimedByWorkerId: "worker_other" },
      }, baseDeps(), { resultLogPath: tempLog() }),
      /claimedByWorkerId/u,
    );
  });

  it("rejects inline model execution, question-bank creation, publish, DB/HTTP, local tools, and Swarm", async () => {
    for (const field of [
      "executeModelNowAllowed",
      "createQuestionBankDraftNowAllowed",
      "studentVisiblePublishAllowed",
      "directDatabaseAccessAllowed",
      "executeHttpRequestAllowed",
      "localToolMutationAllowed",
      "swarmAllowed",
    ]) {
      await assert.rejects(
        () => recordStudentAppAITutorResult({
          ...baseInput(),
          resultPolicy: { ...baseInput().resultPolicy, [field]: true },
        }, baseDeps(), { resultLogPath: tempLog() }),
        new RegExp(field, "u"),
      );
    }
  });
});

function baseDeps() {
  return {
    studentAppAITutorResultPort: {
      async recordTutoringAnalysisResult() {
        return portResult();
      },
    },
  };
}

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-result-")), "result.jsonl");
}

function portResult() {
  return {
    source: {
      targetUseCase: "RecordTutoringAnalysisResult.Execute",
      readRepositoryOperation: "ArchiveRepository.GetTutoringAnalysisRequestByID",
      writeRepositoryOperation: "ArchiveRepository.RecordTutoringAnalysisResult",
      queueTable: "teaching_tutoring_analysis_requests",
    },
    result: {
      requestId: "tutor_req_student_app_001",
      workerId: "worker_student_tutor_local_01",
      status: "SUCCEEDED",
      resultSummary: "The student understands fractions but needs more mixed-operation practice.",
      resultRef: "local://student-app-ai-tutor/tutor_req_student_app_001/result.json",
      questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
      completedAt: "2026-06-05T00:01:00.000Z",
    },
  };
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.student-app.ai-tutor-result.v1",
    resultInvocationId: "student_app_ai_tutor_result_001",
    principal: {
      principalId: "svc_student_tutor_worker",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT"],
      sessionId: "svc_session_student_tutor_worker",
    },
    worker: {
      workerId: "worker_student_tutor_local_01",
      agent: "StudentTutorAgent",
      skillId: "tutor_student",
      nodeType: "LOCAL",
    },
    claim: {
      requestId: "tutor_req_student_app_001",
      archiveItemId: "tarch_student_quiz_001",
      status: "IN_PROGRESS",
      claimedByWorkerId: "worker_student_tutor_local_01",
      claimExpiresAt: "2026-06-05T00:02:00.000Z",
      questionBankIntent: "GENERATE_PERSONALIZED_CHECK",
    },
    result: {
      status: "SUCCEEDED",
      resultSummary: "The student understands fractions but needs more mixed-operation practice.",
      resultRef: "local://student-app-ai-tutor/tutor_req_student_app_001/result.json",
      questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
    },
    resultPolicy: {
      queueName: "student_app_ai_tutor",
      queueTable: "teaching_tutoring_analysis_requests",
      targetUseCase: "RecordTutoringAnalysisResult.Execute",
      readRepositoryOperation: "ArchiveRepository.GetTutoringAnalysisRequestByID",
      writeRepositoryOperation: "ArchiveRepository.RecordTutoringAnalysisResult",
      internalServiceOnly: true,
      claimRequired: true,
      workerLeaseMustMatch: true,
      modelExecutionAlreadyCompletedElsewhere: true,
      executeModelNowAllowed: false,
      createQuestionBankDraftNowAllowed: false,
      studentVisiblePublishAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: ["evidence:student-app-ai-tutor-worker-claim:tutor_req_student_app_001"],
    idempotencyKey: "student-app-ai-tutor-result:worker_student_tutor_local_01:tutor_req_student_app_001",
  };
}
