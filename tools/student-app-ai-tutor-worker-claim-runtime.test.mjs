import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_WORKER_CLAIM_COMMAND_PORT,
  claimStudentAppAITutorWorkerRequest,
} from "./student-app-ai-tutor-worker-claim-runtime.mjs";

describe("Student App AI Tutor worker claim runtime", () => {
  it("claims one queued AI Tutor request through the injected use case port", async () => {
    const calls = [];
    const result = await claimStudentAppAITutorWorkerRequest(baseInput(), {
      studentAppAITutorWorkerClaimPort: {
        async claimTutoringAnalysisRequest(request) {
          calls.push(request);
          return portClaimResult();
        },
      },
    }, { claimLogPath: tempLog(), generatedAt: "2026-06-05T00:00:00.000Z" });

    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_WORKER_CLAIMED");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_WORKER_CLAIM_COMMAND_PORT);
    assert.equal(result.queue.targetUseCase, "ClaimTutoringAnalysisRequest.Execute");
    assert.equal(result.queue.repositoryOperation, "ArchiveRepository.ClaimNextTutoringAnalysisRequest");
    assert.equal(result.claim.requestId, "tutor_req_student_app_001");
    assert.equal(result.claim.workerId, "worker_student_tutor_local_01");
    assert.equal(result.boundary.atomicSkipLockedClaimRequired, true);
    assert.equal(result.boundary.modelExecutionStarted, false);
    assert.equal(result.boundary.resultRecorded, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].workerId, "worker_student_tutor_local_01");
    assert.equal(calls[0].safety.executeModelNowAllowed, false);
  });

  it("uses idempotency for replay and rejects conflicting worker claim inputs", async () => {
    const claimLogPath = tempLog();
    const first = await claimStudentAppAITutorWorkerRequest(baseInput(), baseDeps(), { claimLogPath });
    const replay = await claimStudentAppAITutorWorkerRequest(baseInput(), {
      studentAppAITutorWorkerClaimPort: {
        async claimTutoringAnalysisRequest() {
          throw new Error("port should not be called for replay");
        },
      },
    }, { claimLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.claim.requestId, first.claim.requestId);

    await assert.rejects(
      () => claimStudentAppAITutorWorkerRequest({
        ...baseInput(),
        worker: { ...baseInput().worker, workerId: "worker_student_tutor_local_02" },
      }, baseDeps(), { claimLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("handles empty queue without starting model execution", async () => {
    const result = await claimStudentAppAITutorWorkerRequest(baseInput(), {
      studentAppAITutorWorkerClaimPort: {
        async claimTutoringAnalysisRequest() {
          return { source: portClaimResult().source, claim: { found: false } };
        },
      },
    }, { claimLogPath: tempLog() });

    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_WORKER_NO_CLAIM");
    assert.equal(result.claim.found, false);
    assert.equal(result.boundary.leaseRecorded, false);
    assert.equal(result.boundary.modelExecutionStarted, false);
  });

  it("rejects missing ports, non-service principals, remote workers, and mismatched claims", async () => {
    await assert.rejects(
      () => claimStudentAppAITutorWorkerRequest(baseInput(), {}, { claimLogPath: tempLog() }),
      /claimTutoringAnalysisRequest is required/u,
    );
    await assert.rejects(
      () => claimStudentAppAITutorWorkerRequest({
        ...baseInput(),
        principal: { ...baseInput().principal, subjectType: "USER", role: "STUDENT", entryPoint: "STUDENT_APP" },
      }, baseDeps(), { claimLogPath: tempLog() }),
      /subjectType|role|entryPoint/u,
    );
    await assert.rejects(
      () => claimStudentAppAITutorWorkerRequest({
        ...baseInput(),
        worker: { ...baseInput().worker, nodeType: "REMOTE" },
      }, baseDeps(), { claimLogPath: tempLog() }),
      /nodeType/u,
    );
    await assert.rejects(
      () => claimStudentAppAITutorWorkerRequest(baseInput(), {
        studentAppAITutorWorkerClaimPort: {
          async claimTutoringAnalysisRequest() {
            return {
              ...portClaimResult(),
              claim: { ...portClaimResult().claim, claimedByWorkerId: "worker_other" },
            };
          },
        },
      }, { claimLogPath: tempLog() }),
      /claimedByWorkerId/u,
    );
  });

  it("rejects model execution, result recording, question-bank drafts, direct DB/HTTP, local tools, and Swarm", async () => {
    for (const field of [
      "executeModelNowAllowed",
      "recordResultNowAllowed",
      "questionBankDraftNowAllowed",
      "directDatabaseAccessAllowed",
      "executeHttpRequestAllowed",
      "localToolMutationAllowed",
      "swarmAllowed",
    ]) {
      await assert.rejects(
        () => claimStudentAppAITutorWorkerRequest({
          ...baseInput(),
          claimPolicy: { ...baseInput().claimPolicy, [field]: true },
        }, baseDeps(), { claimLogPath: tempLog() }),
        new RegExp(field, "u"),
      );
    }
  });
});

function baseDeps() {
  return {
    studentAppAITutorWorkerClaimPort: {
      async claimTutoringAnalysisRequest() {
        return portClaimResult();
      },
    },
  };
}

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-worker-claim-")), "claim.jsonl");
}

function portClaimResult() {
  return {
    source: {
      targetUseCase: "ClaimTutoringAnalysisRequest.Execute",
      repositoryOperation: "ArchiveRepository.ClaimNextTutoringAnalysisRequest",
      queueTable: "teaching_tutoring_analysis_requests",
      atomicSkipLocked: true,
    },
    claim: {
      found: true,
      requestId: "tutor_req_student_app_001",
      archiveItemId: "tarch_student_quiz_001",
      sourceArchiveStudentId: "student_001",
      questionBankIntent: "GENERATE_PERSONALIZED_CHECK",
      status: "IN_PROGRESS",
      claimedByWorkerId: "worker_student_tutor_local_01",
      claimExpiresAt: "2026-06-05T00:02:00.000Z",
    },
  };
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.student-app.ai-tutor-worker-claim.v1",
    claimInvocationId: "student_app_ai_tutor_worker_claim_001",
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
      leaseSeconds: 120,
      maxConcurrentClaims: 1,
    },
    claimPolicy: {
      queueName: "student_app_ai_tutor",
      queueTable: "teaching_tutoring_analysis_requests",
      targetUseCase: "ClaimTutoringAnalysisRequest.Execute",
      repositoryOperation: "ArchiveRepository.ClaimNextTutoringAnalysisRequest",
      atomicSkipLockedRequired: true,
      leaseRequired: true,
      executeModelNowAllowed: false,
      recordResultNowAllowed: false,
      questionBankDraftNowAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: ["evidence:student-app-ai-tutor-request:tutor_req_student_app_001"],
    idempotencyKey: "student-app-ai-tutor-worker-claim:worker_student_tutor_local_01:20260605T000000Z",
  };
}
