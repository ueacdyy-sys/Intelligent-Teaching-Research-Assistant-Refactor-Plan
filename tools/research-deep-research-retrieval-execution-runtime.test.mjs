import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_COMMAND_PORT,
  RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_READ_PORT,
  formatDeepResearchRetrievalExecution,
  recordDeepResearchRetrievalExecution,
} from "./research-deep-research-retrieval-execution-runtime.mjs";

describe("Research deep_research retrieval execution runtime", () => {
  it("executes an approved retrieval plan through the injected read port and records cited source evidence only", async () => {
    const result = await recordDeepResearchRetrievalExecution(baseInput(), {
      commandLogPath: tempCommandLogPath(),
      generatedAt: "2026-06-05T00:00:00.000Z",
      readPort: readPort(),
    });

    assert.equal(result.schemaVersion, "2026-06-05.research.deep-research-retrieval-execution-recorded.v1");
    assert.equal(result.commandPort, RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_COMMAND_PORT);
    assert.equal(result.readPort, RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_READ_PORT);
    assert.equal(result.status, "RETRIEVAL_EXECUTION_RECORDED");
    assert.equal(result.retrievalResult.retrievalExecuted, true);
    assert.equal(result.retrievalResult.chunkCount, 2);
    assert.equal(result.boundary.retrievalExecuted, true);
    assert.equal(result.boundary.directoryIndexAccessUsed, true);
    assert.equal(result.boundary.vectorSearchMayHaveBeenUsed, true);
    assert.equal(result.boundary.externalModelCallStarted, false);
    assert.equal(result.boundary.ragSynthesisStarted, false);
    assert.equal(result.boundary.finalAnswerGenerated, false);
    assert.equal(result.boundary.directMainDatabaseWriteAllowed, false);
    assert.match(result.evidenceRefs.join("\n"), /evidence:retrieval-source-hash:sha256:/u);
    assert.match(formatDeepResearchRetrievalExecution(result), /Research deep_research retrieval execution: RETRIEVAL_EXECUTION_RECORDED/u);
  });

  it("uses idempotency for safe replay and rejects conflicting execution inputs", async () => {
    const commandLogPath = tempCommandLogPath();
    const first = await recordDeepResearchRetrievalExecution(baseInput(), { commandLogPath, readPort: readPort() });
    const second = await recordDeepResearchRetrievalExecution(baseInput(), { commandLogPath, readPort: failReadPort() });

    assert.equal(first.idempotentReplay, false);
    assert.equal(second.idempotentReplay, true);
    assert.equal(fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).length, 1);
    await assert.rejects(
      () => recordDeepResearchRetrievalExecution({
        ...baseInput(),
        executionInvocationId: "different_execution_invocation",
      }, { commandLogPath, readPort: readPort() }),
      /idempotency key already exists/u,
    );
  });

  it("rejects unsafe execution policy, reused plan execution, and missing read port", async () => {
    await assert.rejects(
      () => recordDeepResearchRetrievalExecution({
        ...baseInput(),
        executionPolicy: { ...executionPolicy(), directDatabaseAccessAllowed: true },
      }, { commandLogPath: tempCommandLogPath(), readPort: readPort() }),
      /directDatabaseAccessAllowed must be false/u,
    );
    await assert.rejects(
      () => recordDeepResearchRetrievalExecution({
        ...baseInput(),
        retrievalPlanRecord: {
          ...retrievalPlanRecord(),
          boundary: { ...retrievalPlanRecord().boundary, retrievalExecuted: true },
        },
      }, { commandLogPath: tempCommandLogPath(), readPort: readPort() }),
      /retrievalExecuted must be false/u,
    );
    await assert.rejects(
      () => recordDeepResearchRetrievalExecution(baseInput(), { commandLogPath: tempCommandLogPath() }),
      /DeepResearchRetrievalReadPort\.retrieveApprovedSources is required/u,
    );
  });

  it("rejects unplanned, out-of-policy, non-local, or uncited retrieval chunks", async () => {
    await assert.rejects(
      () => recordDeepResearchRetrievalExecution(baseInput(), {
        commandLogPath: tempCommandLogPath(),
        readPort: readPort({ items: [{ ...retrievalItems()[0], planItemId: "unplanned_item" }] }),
      }),
      /was not approved/u,
    );
    await assert.rejects(
      () => recordDeepResearchRetrievalExecution(baseInput(), {
        commandLogPath: tempCommandLogPath(),
        readPort: readPort({
          items: [{ ...retrievalItems()[0], chunks: [{ ...retrievalItems()[0].chunks[0], sourceKind: "PRIVATE_KNOWLEDGE" }] }],
        }),
      }),
      /PUBLIC plan items must return PUBLIC_KNOWLEDGE/u,
    );
    await assert.rejects(
      () => recordDeepResearchRetrievalExecution(baseInput(), {
        commandLogPath: tempCommandLogPath(),
        readPort: readPort({
          items: [{ ...retrievalItems()[0], chunks: [{ ...retrievalItems()[0].chunks[0], localOnly: false }] }],
        }),
      }),
      /localOnly must be true/u,
    );
    await assert.rejects(
      () => recordDeepResearchRetrievalExecution(baseInput(), {
        commandLogPath: tempCommandLogPath(),
        readPort: readPort({
          items: [{ ...retrievalItems()[0], chunks: [{ ...retrievalItems()[0].chunks[0], sourceHash: "missing" }] }],
        }),
      }),
      /sourceHash must be a sha256 digest/u,
    );
  });

  it("rejects result sets that exceed the approved chunk or source-ref budget", async () => {
    const chunks = Array.from({ length: 17 }, (_, index) => ({
      ...retrievalItems()[0].chunks[0],
      chunkId: `chunk_public_${index}`,
      sourceRef: `source:public:${index}`,
      sourceHash: `sha256:${String(index).padStart(64, "0")}`,
    }));

    await assert.rejects(
      () => recordDeepResearchRetrievalExecution(baseInput(), {
        commandLogPath: tempCommandLogPath(),
        readPort: readPort({ items: [{ ...retrievalItems()[0], chunks }] }),
      }),
      /must contain 1-16 items/u,
    );
  });
});

function tempCommandLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-retrieval-execution-")), "execution.jsonl");
}

function readPort(result = { items: retrievalItems() }) {
  return {
    retrieveApprovedSources(request) {
      assert.equal(request.job.jobId, "deep_research_job_001");
      assert.equal(request.retrievalPlan.sourcePlan.length, 2);
      return { retrievalExecuted: true, ...result };
    },
  };
}

function failReadPort() {
  return {
    retrieveApprovedSources() {
      throw new Error("idempotent replay should not invoke read port");
    },
  };
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-retrieval-execution.v1",
    executionInvocationId: "deep_research_retrieval_execution_inv_001",
    principal: principal(),
    retrievalPlanRecord: retrievalPlanRecord(),
    executionPolicy: executionPolicy(),
    readPortDescriptor: {
      portName: "DeepResearchRetrievalReadPort",
      operation: "retrieveApprovedSources",
      directDatabaseAccess: false,
      writeAllowed: false,
    },
    evidenceRefs: ["evidence:retrieval-plan:job-001", "evidence:approval:deep_research_approval_001"],
    idempotencyKey: "deep-research-retrieval-execution:job-001",
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

function executionPolicy() {
  return {
    executeRetrievalNow: true,
    directoryIndexAccessAllowed: true,
    vectorSearchAllowed: true,
    directDatabaseAccessAllowed: false,
    writeAllowed: false,
    studentArchiveAllowed: false,
    remoteDeviceSourcesAllowed: false,
    externalModelCallAllowed: false,
    ragSynthesisAllowed: false,
    finalAnswerNowAllowed: false,
    citationRequired: true,
    sourceHashRequired: true,
  };
}

function retrievalPlanRecord() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-retrieval-plan-recorded.v1",
    runtimeId: "research_deep_research_retrieval_plan_runtime",
    commandPort: "DeepResearchRetrievalPlanPort.recordDeepResearchRetrievalPlan",
    status: "RETRIEVAL_PLAN_RECORDED",
    recordId: "research_deep_research_retrieval_plan_deep-research-retrieval-plan_job-001",
    recordedAt: "2026-06-05T00:00:00.000Z",
    idempotencyKey: "deep-research-retrieval-plan:job-001",
    idempotentReplay: false,
    job: {
      taskId: "agent_task_research_deep_001",
      contextRef: "shared_ctx_research_deep_001",
      jobId: "deep_research_job_001",
      queueName: "research_deep_research",
    },
    worker: {
      workerId: "local_research_worker_001",
      nodeType: "LOCAL",
      capabilityKinds: ["RAG_RETRIEVAL", "MODEL_REASONING"],
    },
    approval: {
      approvalId: "deep_research_approval_001",
      approvalRecordRef: "evidence:human-approval:deep-research-job-001",
      reviewerPrincipalId: "teacher_001",
      decision: "APPROVED_FOR_ASYNC",
    },
    retrievalPlan: {
      strategy: "DIRECTORY_INDEX_THEN_VECTOR_RAG",
      planningOnly: true,
      sourcePlan: [
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
      ],
      budget: {
        maxPlannedQueries: 4,
        maxRetrievedChunks: 40,
        maxSourceRefs: 12,
        p99PlanningBudgetMs: 50,
      },
      citationPolicy: {
        citationRequired: true,
        sourceHashRequired: true,
        quoteScope: "RETRIEVED_SOURCE_ONLY",
      },
    },
    evidenceRefs: ["evidence:deep-research-intent:job-001", "evidence:worker-lifecycle:job-001"],
    boundary: {
      approvalVerified: true,
      workerClaimVerified: true,
      retrievalPlanRecorded: true,
      retrievalExecuted: false,
      directoryIndexAccessStarted: false,
      vectorSearchStarted: false,
      externalModelCallStarted: false,
      ragSynthesisStarted: false,
      finalAnswerGenerated: false,
      directPublicationAllowed: false,
      localToolMutationAllowed: false,
      directMainDatabaseWriteAllowed: false,
      studentArchiveUsed: false,
      remoteDeviceSourcesUsed: false,
      swarmAllowed: false,
      requiresFutureRetrievalExecutionSlice: true,
    },
  };
}

function retrievalItems() {
  return [
    {
      planItemId: "plan_public_directory_first",
      knowledgeBaseRef: "public_curriculum_knowledge",
      classification: "PUBLIC",
      chunks: [
        {
          chunkId: "chunk_public_001",
          sourceRef: "source:public-curriculum:001",
          sourceKind: "PUBLIC_KNOWLEDGE",
          sourceTitle: "Personalized learning evidence review",
          citation: "public_curriculum_knowledge#source:public-curriculum:001",
          sourceHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          retrievedBy: "DIRECTORY_INDEX",
          localOnly: true,
          score: 0.91,
          excerpt: "Personalized tutoring systems require scoped evidence and measurable learning outcomes.",
        },
      ],
    },
    {
      planItemId: "plan_private_notes",
      knowledgeBaseRef: "private_research_notes",
      classification: "PRIVATE",
      chunks: [
        {
          chunkId: "chunk_private_001",
          sourceRef: "source:private-notes:001",
          sourceKind: "PRIVATE_KNOWLEDGE",
          sourceTitle: "智能教研助手私密研究笔记",
          citation: "private_research_notes#source:private-notes:001",
          sourceHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          retrievedBy: "VECTOR_SEARCH",
          localOnly: true,
          score: 0.88,
          excerpt: "私密知识库检索必须保留来源哈希和引用，后续综合回答不能脱离证据。",
        },
      ],
    },
  ];
}
