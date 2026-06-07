import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_COMMAND_PORT,
  RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_REASONING_PORT,
  formatDeepResearchReasoningSynthesis,
  recordDeepResearchReasoningSynthesis,
} from "./research-deep-research-reasoning-synthesis-runtime.mjs";

describe("Research deep_research reasoning synthesis runtime", () => {
  it("records an evidence-grounded draft through the injected reasoning port without publishing a final answer", async () => {
    const result = await recordDeepResearchReasoningSynthesis(baseInput(), {
      commandLogPath: tempCommandLogPath(),
      generatedAt: "2026-06-05T00:00:00.000Z",
      reasoningPort: reasoningPort(),
    });

    assert.equal(result.schemaVersion, "2026-06-05.research.deep-research-reasoning-synthesis-recorded.v1");
    assert.equal(result.commandPort, RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_COMMAND_PORT);
    assert.equal(result.reasoningPort, RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_REASONING_PORT);
    assert.equal(result.status, "REASONING_SYNTHESIS_DRAFT_RECORDED");
    assert.equal(result.draft.answerKind, "EVIDENCE_GROUNDED_DRAFT");
    assert.equal(result.usage.claimCount, 2);
    assert.equal(result.boundary.evidenceGroundingVerified, true);
    assert.equal(result.boundary.directExternalModelCallStarted, false);
    assert.equal(result.boundary.finalAnswerGenerated, false);
    assert.equal(result.boundary.directPublicationAllowed, false);
    assert.match(result.evidenceRefs.join("\n"), /evidence:reasoning-claim-hash:sha256:/u);
    assert.match(formatDeepResearchReasoningSynthesis(result), /Research deep_research reasoning synthesis: REASONING_SYNTHESIS_DRAFT_RECORDED/u);
  });

  it("uses idempotency for safe replay and rejects conflicting synthesis inputs", async () => {
    const commandLogPath = tempCommandLogPath();
    const first = await recordDeepResearchReasoningSynthesis(baseInput(), { commandLogPath, reasoningPort: reasoningPort() });
    const second = await recordDeepResearchReasoningSynthesis(baseInput(), { commandLogPath, reasoningPort: failReasoningPort() });

    assert.equal(first.idempotentReplay, false);
    assert.equal(second.idempotentReplay, true);
    assert.equal(fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).length, 1);
    await assert.rejects(
      () => recordDeepResearchReasoningSynthesis({
        ...baseInput(),
        synthesisInvocationId: "different_synthesis_invocation",
      }, { commandLogPath, reasoningPort: reasoningPort() }),
      /idempotency key already exists/u,
    );
  });

  it("rejects unsafe policy, completed synthesis boundaries, missing port, or missing private scope", async () => {
    await assert.rejects(
      () => recordDeepResearchReasoningSynthesis({
        ...baseInput(),
        reasoningPolicy: { ...reasoningPolicy(), directExternalModelCallAllowed: true },
      }, { commandLogPath: tempCommandLogPath(), reasoningPort: reasoningPort() }),
      /directExternalModelCallAllowed must be false/u,
    );
    await assert.rejects(
      () => recordDeepResearchReasoningSynthesis({
        ...baseInput(),
        retrievalExecutionRecord: {
          ...retrievalExecutionRecord(),
          boundary: { ...retrievalExecutionRecord().boundary, finalAnswerGenerated: true },
        },
      }, { commandLogPath: tempCommandLogPath(), reasoningPort: reasoningPort() }),
      /finalAnswerGenerated must be false/u,
    );
    await assert.rejects(
      () => recordDeepResearchReasoningSynthesis(baseInput(), { commandLogPath: tempCommandLogPath() }),
      /DeepResearchReasoningPort\.composeEvidenceGroundedDraft is required/u,
    );
    await assert.rejects(
      () => recordDeepResearchReasoningSynthesis({
        ...baseInput(),
        principal: { ...principal(), scopes: ["AGENT_COMMAND_SUBMIT", "RESEARCH_READ"] },
      }, { commandLogPath: tempCommandLogPath(), reasoningPort: reasoningPort() }),
      /KNOWLEDGE_PRIVATE_READ/u,
    );
  });

  it("rejects claims that cite sources outside retrieval execution evidence", async () => {
    await assert.rejects(
      () => recordDeepResearchReasoningSynthesis(baseInput(), {
        commandLogPath: tempCommandLogPath(),
        reasoningPort: reasoningPort({
          claims: [{ ...draftClaims()[0], citations: ["unknown#source"] }],
        }),
      }),
      /citation unknown#source was not present/u,
    );
    await assert.rejects(
      () => recordDeepResearchReasoningSynthesis(baseInput(), {
        commandLogPath: tempCommandLogPath(),
        reasoningPort: reasoningPort({
          claims: [{ ...draftClaims()[0], sourceHashes: ["sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"] }],
        }),
      }),
      /sourceHash sha256:cccc/u,
    );
    await assert.rejects(
      () => recordDeepResearchReasoningSynthesis(baseInput(), {
        commandLogPath: tempCommandLogPath(),
        reasoningPort: reasoningPort({
          claims: [{ ...draftClaims()[0], supportChunkIds: ["chunk_missing"] }],
        }),
      }),
      /supportChunkId chunk_missing/u,
    );
  });

  it("rejects draft outputs that exceed claim or token budgets", async () => {
    const manyClaims = Array.from({ length: 7 }, (_, index) => ({
      ...draftClaims()[0],
      claimId: `claim_${index}`,
    }));

    await assert.rejects(
      () => recordDeepResearchReasoningSynthesis(baseInput(), {
        commandLogPath: tempCommandLogPath(),
        reasoningPort: reasoningPort({ claims: manyClaims }),
      }),
      /draft claims exceed/u,
    );
    await assert.rejects(
      () => recordDeepResearchReasoningSynthesis(baseInput(), {
        commandLogPath: tempCommandLogPath(),
        reasoningPort: reasoningPort({ draftTokens: 1300 }),
      }),
      /draftTokens must be an integer/u,
    );
  });
});

function tempCommandLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-reasoning-synthesis-")), "synthesis.jsonl");
}

function reasoningPort(result = {}) {
  return {
    composeEvidenceGroundedDraft(request) {
      assert.equal(request.job.jobId, "deep_research_job_001");
      assert.equal(request.allowedEvidence.citations.length, 2);
      return { ...draftResult(), ...result };
    },
  };
}

function failReasoningPort() {
  return {
    composeEvidenceGroundedDraft() {
      throw new Error("idempotent replay should not invoke reasoning port");
    },
  };
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-reasoning-synthesis.v1",
    synthesisInvocationId: "deep_research_reasoning_synthesis_inv_001",
    principal: principal(),
    retrievalExecutionRecord: retrievalExecutionRecord(),
    reasoningPolicy: reasoningPolicy(),
    reasoningPortDescriptor: {
      portName: "DeepResearchReasoningPort",
      operation: "composeEvidenceGroundedDraft",
      directExternalModelCall: false,
      directDatabaseAccess: false,
      writeAllowed: false,
    },
    evidenceRefs: ["evidence:retrieval-execution:job-001", "evidence:approval:deep_research_approval_001"],
    idempotencyKey: "deep-research-reasoning-synthesis:job-001",
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

function reasoningPolicy() {
  return {
    composeDraftNow: true,
    evidenceGroundedOnly: true,
    directDatabaseAccessAllowed: false,
    writeAllowed: false,
    studentArchiveAllowed: false,
    remoteDeviceSourcesAllowed: false,
    directExternalModelCallAllowed: false,
    finalAnswerNowAllowed: false,
    publicationAllowed: false,
    citationRequired: true,
    sourceHashRequired: true,
    maxDraftClaims: 6,
    maxCitationsPerClaim: 4,
    maxSourceHashesPerClaim: 4,
    maxDraftTokens: 1200,
  };
}

function retrievalExecutionRecord() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-retrieval-execution-recorded.v1",
    runtimeId: "research_deep_research_retrieval_execution_runtime",
    status: "RETRIEVAL_EXECUTION_RECORDED",
    recordId: "research_deep_research_retrieval_execution_job_001",
    job: {
      taskId: "agent_task_research_deep_001",
      contextRef: "shared_ctx_research_deep_001",
      jobId: "deep_research_job_001",
      queueName: "research_deep_research",
    },
    retrievalResult: { retrievalExecuted: true, chunkCount: 2, sourceRefCount: 2, items: retrievalItems() },
    evidenceRefs: ["evidence:runtime:research_deep_research_retrieval_execution_runtime"],
    boundary: {
      retrievalExecuted: true,
      ragSynthesisStarted: false,
      finalAnswerGenerated: false,
      directPublicationAllowed: false,
      directMainDatabaseWriteAllowed: false,
    },
  };
}

function retrievalItems() {
  return [
    {
      planItemId: "plan_public_directory_first",
      knowledgeBaseRef: "public_curriculum_knowledge",
      classification: "PUBLIC",
      chunks: [chunk("chunk_public_001", "public_curriculum_knowledge#source:public-curriculum:001", "a")],
    },
    {
      planItemId: "plan_private_notes",
      knowledgeBaseRef: "private_research_notes",
      classification: "PRIVATE",
      chunks: [chunk("chunk_private_001", "private_research_notes#source:private-notes:001", "b")],
    },
  ];
}

function chunk(chunkId, citation, digestChar) {
  return {
    chunkId,
    sourceRef: `source:${chunkId}`,
    sourceKind: digestChar === "a" ? "PUBLIC_KNOWLEDGE" : "PRIVATE_KNOWLEDGE",
    sourceTitle: `title-${chunkId}`,
    citation,
    sourceHash: `sha256:${digestChar.repeat(64)}`,
    excerpt: `Evidence excerpt for ${chunkId}.`,
  };
}

function draftResult() {
  return {
    draftId: "deep_research_draft_001",
    answerKind: "EVIDENCE_GROUNDED_DRAFT",
    title: "个性化学习与智能教研助手的证据草稿",
    summary: "当前证据支持把个性化辅导建立在可追踪的学习档案、检索证据和效果指标上。",
    claims: draftClaims(),
    limitations: ["该草稿仍需人工复核后才能进入最终答案边界。"],
    draftTokens: 260,
  };
}

function draftClaims() {
  return [
    {
      claimId: "claim_001",
      text: "个性化辅导能力需要绑定明确的学习结果指标。",
      citations: ["public_curriculum_knowledge#source:public-curriculum:001"],
      sourceHashes: ["sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
      supportChunkIds: ["chunk_public_001"],
      confidence: 0.82,
    },
    {
      claimId: "claim_002",
      text: "私密知识库内容进入综合草稿时必须保留引用和 sourceHash。",
      citations: ["private_research_notes#source:private-notes:001"],
      sourceHashes: ["sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
      supportChunkIds: ["chunk_private_001"],
      confidence: 0.86,
    },
  ];
}
