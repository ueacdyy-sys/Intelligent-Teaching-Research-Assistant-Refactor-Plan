import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN_COMMAND_PORT,
  formatDeepResearchRetrievalPlan,
  recordDeepResearchRetrievalPlan,
} from "./research-deep-research-retrieval-plan-runtime.mjs";

describe("Research deep_research retrieval plan runtime", () => {
  it("records an approved directory-first retrieval plan without executing retrieval, model calls, or final answers", () => {
    const result = recordDeepResearchRetrievalPlan(baseInput(), {
      commandLogPath: tempCommandLogPath(),
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-05.research.deep-research-retrieval-plan-recorded.v1");
    assert.equal(result.commandPort, RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN_COMMAND_PORT);
    assert.equal(result.status, "RETRIEVAL_PLAN_RECORDED");
    assert.equal(result.job.queueName, "research_deep_research");
    assert.equal(result.worker.nodeType, "LOCAL");
    assert.equal(result.retrievalPlan.strategy, "DIRECTORY_INDEX_THEN_VECTOR_RAG");
    assert.equal(result.retrievalPlan.sourcePlan.length, 2);
    assert.equal(result.boundary.retrievalPlanRecorded, true);
    assert.equal(result.boundary.retrievalExecuted, false);
    assert.equal(result.boundary.vectorSearchStarted, false);
    assert.equal(result.boundary.externalModelCallStarted, false);
    assert.equal(result.boundary.finalAnswerGenerated, false);
    assert.match(formatDeepResearchRetrievalPlan(result), /Research deep_research retrieval plan: RETRIEVAL_PLAN_RECORDED/u);
  });

  it("uses the idempotency key for safe replay and rejects conflicting plans", () => {
    const commandLogPath = tempCommandLogPath();
    const first = recordDeepResearchRetrievalPlan(baseInput(), { commandLogPath });
    const second = recordDeepResearchRetrievalPlan(baseInput(), { commandLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(second.idempotentReplay, true);
    assert.equal(fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).length, 1);
    assert.throws(
      () => recordDeepResearchRetrievalPlan({
        ...baseInput(),
        researchQuestion: "这个问题文本不同但复用了同一个幂等键，会被拒绝。",
      }, { commandLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects unclaimed workers and unsafe lifecycle boundaries", () => {
    assert.throws(
      () => recordDeepResearchRetrievalPlan({
        ...baseInput(),
        workerLifecycle: { ...workerLifecycle(), status: "FAILED_SAFE_RECORDED" },
      }, { commandLogPath: tempCommandLogPath() }),
      /input\.workerLifecycle\.status must be CLAIMED_FOR_ASYNC_EXECUTION/u,
    );
    assert.throws(
      () => recordDeepResearchRetrievalPlan({
        ...baseInput(),
        workerLifecycle: {
          ...workerLifecycle(),
          boundary: { ...workerLifecycle().boundary, ragRetrievalStarted: true },
        },
      }, { commandLogPath: tempCommandLogPath() }),
      /ragRetrievalStarted must be false/u,
    );
  });

  it("rejects out-of-policy sources, student archive, and immediate retrieval execution", () => {
    assert.throws(
      () => recordDeepResearchRetrievalPlan({
        ...baseInput(),
        sourcePlan: [{ ...sourcePlan()[0], classification: "PRIVATE" }],
        sourcePolicy: { ...sourcePolicy(), allowedClassifications: ["PUBLIC"] },
      }, { commandLogPath: tempCommandLogPath() }),
      /classification PRIVATE is not approved/u,
    );
    assert.throws(
      () => recordDeepResearchRetrievalPlan({
        ...baseInput(),
        sourcePolicy: { ...sourcePolicy(), includeStudentArchive: true },
      }, { commandLogPath: tempCommandLogPath() }),
      /includeStudentArchive must be false/u,
    );
    assert.throws(
      () => recordDeepResearchRetrievalPlan({
        ...baseInput(),
        retrievalPolicy: { ...retrievalPolicy(), executeRetrievalNow: true },
      }, { commandLogPath: tempCommandLogPath() }),
      /executeRetrievalNow must be false/u,
    );
  });

  it("rejects over-budget plans and source items without citation or hash guarantees", () => {
    assert.throws(
      () => recordDeepResearchRetrievalPlan({
        ...baseInput(),
        budget: { ...budget(), maxRetrievedChunks: 3 },
      }, { commandLogPath: tempCommandLogPath() }),
      /retrieval plan exceeds approved/u,
    );
    assert.throws(
      () => recordDeepResearchRetrievalPlan({
        ...baseInput(),
        sourcePlan: [{ ...sourcePlan()[0], citationRequired: false }],
      }, { commandLogPath: tempCommandLogPath() }),
      /citationRequired must be true/u,
    );
    assert.throws(
      () => recordDeepResearchRetrievalPlan({
        ...baseInput(),
        sourcePlan: [{ ...sourcePlan()[0], sourceHashRequired: false }],
      }, { commandLogPath: tempCommandLogPath() }),
      /sourceHashRequired must be true/u,
    );
  });
});

function tempCommandLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-retrieval-plan-")), "plan.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-retrieval-plan.v1",
    planningInvocationId: "deep_research_retrieval_plan_inv_001",
    principal: principal(),
    workerLifecycle: workerLifecycle(),
    sourcePolicy: sourcePolicy(),
    retrievalPolicy: retrievalPolicy(),
    researchQuestion: "如何基于学生学习档案构建个性化辅导助手并验证教学效果？",
    objectives: ["定位公开教育研究证据", "定位本地私密研究笔记", "为后续 RAG 执行提供引用约束"],
    sourcePlan: sourcePlan(),
    budget: budget(),
    evidenceRefs: ["evidence:deep-research-intent:job-001", "evidence:worker-lifecycle:job-001"],
    idempotencyKey: "deep-research-retrieval-plan:job-001",
  };
}

function principal() {
  return {
    principalId: "research_worker_service",
    role: "SERVICE",
    subjectType: "SERVICE",
    entryPoint: "AGENT_INTERNAL",
    scopes: ["AGENT_COMMAND_SUBMIT", "RESEARCH_READ", "KNOWLEDGE_PRIVATE_READ"],
    sessionId: "research_worker_session_001",
  };
}

function workerLifecycle() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-worker-lifecycle-recorded.v1",
    runtimeId: "research_deep_research_worker_lifecycle_runtime",
    status: "CLAIMED_FOR_ASYNC_EXECUTION",
    job: {
      taskId: "agent_task_research_deep_001",
      contextRef: "shared_ctx_research_deep_001",
      jobId: "deep_research_job_001",
      queueName: "research_deep_research",
    },
    approval: {
      approvalId: "deep_research_approval_001",
      approvalRecordRef: "evidence:human-approval:deep-research-job-001",
      reviewerPrincipalId: "teacher_001",
      decision: "APPROVED_FOR_ASYNC",
    },
    worker: {
      workerId: "local_research_worker_001",
      nodeType: "LOCAL",
      capabilityKinds: ["RAG_RETRIEVAL", "MODEL_REASONING"],
    },
    lifecycle: { toStatus: "CLAIMED" },
    boundary: {
      approvalVerified: true,
      workerClaimRecorded: true,
      executionStarted: false,
      ragRetrievalStarted: false,
      externalModelCallStarted: false,
      finalAnswerGenerated: false,
      requiresFutureExecutionSlice: true,
    },
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

function retrievalPolicy() {
  return {
    planningOnly: true,
    executeRetrievalNow: false,
    directoryIndexFirst: true,
    vectorSearchNow: false,
    externalModelCallNow: false,
    ragSynthesisNow: false,
    finalAnswerNowAllowed: false,
    citationRequired: true,
    sourceHashRequired: true,
  };
}

function sourcePlan() {
  return [
    {
      planItemId: "plan_public_directory_first",
      knowledgeBaseRef: "public_curriculum_knowledge",
      classification: "PUBLIC",
      retrievalMode: "DIRECTORY_THEN_VECTOR",
      plannedQuery: "个性化学习 档案 辅导 效果评估",
      directoryScopeRefs: ["directory:education-ai", "directory:learning-analytics"],
      maxChunks: 16,
      maxSourceRefs: 6,
      citationRequired: true,
      sourceHashRequired: true,
    },
    {
      planItemId: "plan_private_notes",
      knowledgeBaseRef: "private_research_notes",
      classification: "PRIVATE",
      retrievalMode: "DIRECTORY_THEN_VECTOR",
      plannedQuery: "智能教研助手 学生档案 个性化题库 辅导助手",
      directoryScopeRefs: ["directory:private-project-notes"],
      maxChunks: 12,
      maxSourceRefs: 4,
      citationRequired: true,
      sourceHashRequired: true,
    },
  ];
}

function budget() {
  return {
    maxPlannedQueries: 4,
    maxRetrievedChunks: 40,
    maxSourceRefs: 12,
    p99PlanningBudgetMs: 50,
  };
}
