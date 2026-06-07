import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  RESEARCH_DEEP_RESEARCH_WORKER_COMMAND_PORT,
  formatDeepResearchWorkerLifecycle,
  recordDeepResearchWorkerLifecycle,
} from "./research-deep-research-worker-lifecycle-runtime.mjs";

describe("Research deep_research worker lifecycle runtime", () => {
  it("records an approved async job claim without starting retrieval, model calls, or final answers", () => {
    const commandLogPath = tempCommandLogPath();
    const result = recordDeepResearchWorkerLifecycle(baseInput(), {
      commandLogPath,
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-05.research.deep-research-worker-lifecycle-recorded.v1");
    assert.equal(result.commandPort, RESEARCH_DEEP_RESEARCH_WORKER_COMMAND_PORT);
    assert.equal(result.status, "CLAIMED_FOR_ASYNC_EXECUTION");
    assert.equal(result.job.queueName, "research_deep_research");
    assert.equal(result.lifecycle.fromStatus, "APPROVED_FOR_ASYNC");
    assert.equal(result.lifecycle.toStatus, "CLAIMED");
    assert.equal(result.worker.nodeType, "LOCAL");
    assert.equal(result.boundary.approvalVerified, true);
    assert.equal(result.boundary.executionStarted, false);
    assert.equal(result.boundary.ragRetrievalStarted, false);
    assert.equal(result.boundary.externalModelCallStarted, false);
    assert.equal(result.boundary.finalAnswerGenerated, false);
    assert.equal(result.boundary.directMainDatabaseWriteAllowed, false);
    assert.match(formatDeepResearchWorkerLifecycle(result), /Research deep_research worker lifecycle: CLAIMED_FOR_ASYNC_EXECUTION/u);
  });

  it("uses the idempotency key for safe replay and rejects conflicting replay", () => {
    const commandLogPath = tempCommandLogPath();
    const first = recordDeepResearchWorkerLifecycle(baseInput(), { commandLogPath });
    const second = recordDeepResearchWorkerLifecycle(baseInput(), { commandLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(second.idempotentReplay, true);
    assert.equal(fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    assert.throws(
      () => recordDeepResearchWorkerLifecycle({
        ...baseInput(),
        lifecycleInvocationId: "different_lifecycle_invocation",
      }, { commandLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects unapproved or pending-review intents before worker claim", () => {
    assert.throws(
      () => recordDeepResearchWorkerLifecycle({
        ...baseInput(),
        approvedIntent: { ...approvedIntent(), decision: "PENDING_REVIEW" },
      }, { commandLogPath: tempCommandLogPath() }),
      /input\.approvedIntent\.decision must be ACCEPTED_ASYNC/u,
    );
    assert.throws(
      () => recordDeepResearchWorkerLifecycle({
        ...baseInput(),
        approval: { ...approval(), decision: "PENDING_REVIEW" },
      }, { commandLogPath: tempCommandLogPath() }),
      /input\.approval\.decision must be APPROVED_FOR_ASYNC/u,
    );
    assert.throws(
      () => recordDeepResearchWorkerLifecycle({
        ...baseInput(),
        approval: { ...approval(), privateKnowledgeApproved: false },
      }, { commandLogPath: tempCommandLogPath() }),
      /input\.approval\.privateKnowledgeApproved must be true/u,
    );
  });

  it("rejects unsafe principals, remote/cloud workers, direct writes, and baseline AI dependencies", () => {
    assert.throws(
      () => recordDeepResearchWorkerLifecycle({
        ...baseInput(),
        principal: { ...principal(), role: "STUDENT" },
      }, { commandLogPath: tempCommandLogPath() }),
      /students and remote channels cannot record/u,
    );
    assert.throws(
      () => recordDeepResearchWorkerLifecycle({
        ...baseInput(),
        worker: { ...worker(), nodeType: "CLOUD" },
      }, { commandLogPath: tempCommandLogPath() }),
      /input\.worker\.nodeType must be LOCAL/u,
    );
    assert.throws(
      () => recordDeepResearchWorkerLifecycle({
        ...baseInput(),
        worker: { ...worker(), directMainDatabaseWriteAllowed: true },
      }, { commandLogPath: tempCommandLogPath() }),
      /directMainDatabaseWriteAllowed must be false/u,
    );
    assert.throws(
      () => recordDeepResearchWorkerLifecycle({
        ...baseInput(),
        worker: { ...worker(), baselineRuntimeDependencyAllowed: true },
      }, { commandLogPath: tempCommandLogPath() }),
      /baselineRuntimeDependencyAllowed must be false/u,
    );
  });

  it("rejects execution, RAG retrieval, model calls, publication, local mutation, Swarm, and student archive use now", () => {
    for (const [field, value] of [
      ["executeNow", true],
      ["startRagRetrievalNow", true],
      ["startExternalModelCallNow", true],
      ["finalAnswerNowAllowed", true],
      ["directPublicationAllowed", true],
      ["localToolMutationAllowed", true],
      ["swarmAllowed", true],
    ]) {
      assert.throws(
        () => recordDeepResearchWorkerLifecycle({
          ...baseInput(),
          executionPlan: { ...executionPlan(), [field]: value },
        }, { commandLogPath: tempCommandLogPath() }),
        new RegExp(`input\\.executionPlan\\.${field} must be false`, "u"),
      );
    }

    assert.throws(
      () => recordDeepResearchWorkerLifecycle({
        ...baseInput(),
        sourcePolicy: { ...sourcePolicy(), includeStudentArchive: true },
      }, { commandLogPath: tempCommandLogPath() }),
      /includeStudentArchive must be false/u,
    );
  });

  it("records a failed-safe lifecycle projection without publishing partial artifacts", () => {
    const result = recordDeepResearchWorkerLifecycle({
      ...baseInput(),
      lifecycleAction: "MARK_FAILED_SAFE",
      idempotencyKey: "deep-research-worker-lifecycle:failed-safe",
      failure: {
        errorCode: "MODEL_NODE_UNAVAILABLE",
        safeMessage: "Worker did not start execution because the approved model node was unavailable.",
        retryable: true,
        partialArtifactsDiscarded: true,
        humanReviewRequired: true,
      },
    }, { commandLogPath: tempCommandLogPath() });

    assert.equal(result.status, "FAILED_SAFE_RECORDED");
    assert.equal(result.lifecycle.fromStatus, "CLAIMED");
    assert.equal(result.lifecycle.toStatus, "FAILED_SAFE");
    assert.equal(result.failure.errorCode, "MODEL_NODE_UNAVAILABLE");
    assert.equal(result.boundary.failedSafeRecorded, true);
    assert.equal(result.boundary.finalAnswerGenerated, false);
  });
});

function tempCommandLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-worker-")), "lifecycle.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-worker-lifecycle.v1",
    lifecycleInvocationId: "deep_research_worker_lifecycle_inv_001",
    principal: principal(),
    approvedIntent: approvedIntent(),
    approval: approval(),
    worker: worker(),
    lifecycleAction: "CLAIM",
    sourcePolicy: sourcePolicy(),
    executionPlan: executionPlan(),
    evidenceRefs: [
      "evidence:deep-research-intent:job-001",
      "evidence:human-approval:deep-research-job-001",
    ],
    idempotencyKey: "deep-research-worker-lifecycle:job-001:claim",
  };
}

function principal() {
  return {
    principalId: "research_worker_service",
    role: "SERVICE",
    subjectType: "SERVICE",
    entryPoint: "AGENT_INTERNAL",
    scopes: ["AGENT_COMMAND_SUBMIT"],
    sessionId: "research_worker_session_001",
  };
}

function approvedIntent() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-intent.output.v1",
    intentInvocationId: "deep_research_intent_inv_001",
    runtimeId: "research_deep_research_intent_runtime",
    taskId: "agent_task_research_deep_001",
    contextRef: "shared_ctx_research_deep_001",
    workerAgent: "ResearchAgent",
    skillId: "deep_research",
    decision: "ACCEPTED_ASYNC",
    job: {
      jobId: "deep_research_job_001",
      queueName: "research_deep_research",
      reviewRequired: true,
      executionStarted: false,
    },
    safety: {
      admissionOnly: true,
      writeOperationAllowed: false,
      directDatabaseAccessAllowed: false,
      studentArchiveUsed: false,
      studentDataAccess: "NONE",
      externalModelCallStarted: false,
      ragSynthesisStarted: false,
      finalAnswerGenerated: false,
      directPublicationAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
  };
}

function approval() {
  return {
    approvalId: "deep_research_approval_001",
    approvalRecordRef: "evidence:human-approval:deep-research-job-001",
    taskId: "agent_task_research_deep_001",
    jobId: "deep_research_job_001",
    reviewerPrincipalId: "teacher_001",
    decision: "APPROVED_FOR_ASYNC",
    sourcePolicyReviewed: true,
    budgetReviewed: true,
    privateKnowledgeApproved: true,
    externalModelPolicy: "DEFERRED_ONLY",
    reviewedAt: "2026-06-05T00:00:00.000Z",
  };
}

function worker() {
  return {
    workerId: "local_research_worker_001",
    executionOwner: "ASYNC_RESEARCH_WORKER",
    nodeType: "LOCAL",
    capabilityKinds: ["RAG_RETRIEVAL", "MODEL_REASONING"],
    baselineRuntimeDependencyAllowed: false,
    directMainDatabaseWriteAllowed: false,
    leaseDurationMs: 30000,
    maxConcurrentJobs: 4,
  };
}

function sourcePolicy() {
  return {
    allowedClassifications: ["PUBLIC", "PRIVATE"],
    includeStudentArchive: false,
    includeRemoteDeviceSources: false,
    directDatabaseAccessAllowed: false,
    knowledgeBaseRefs: ["public_curriculum_knowledge", "private_research_notes"],
  };
}

function executionPlan() {
  return {
    executeNow: false,
    startRagRetrievalNow: false,
    startExternalModelCallNow: false,
    finalAnswerNowAllowed: false,
    directPublicationAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
    maxDeferredModelCalls: 4,
    maxRetrievedChunks: 40,
    maxSourceRefs: 12,
  };
}
