import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW_COMMAND_PORT,
  formatDeepResearchFinalAnswerReview,
  recordDeepResearchFinalAnswerReview,
} from "./research-deep-research-final-answer-review-runtime.mjs";

describe("Research deep_research final answer review runtime", () => {
  it("records a human review that approves a synthesis draft for future finalization without publishing", () => {
    const result = recordDeepResearchFinalAnswerReview(baseInput(), {
      commandLogPath: tempCommandLogPath(),
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-05.research.deep-research-final-answer-review-recorded.v1");
    assert.equal(result.commandPort, RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW_COMMAND_PORT);
    assert.equal(result.status, "FINAL_ANSWER_REVIEW_APPROVED_FOR_FINALIZATION");
    assert.equal(result.review.approvedForFinalization, true);
    assert.equal(result.boundary.humanFinalAnswerReviewRecorded, true);
    assert.equal(result.boundary.finalAnswerGenerated, false);
    assert.equal(result.boundary.finalAnswerPublished, false);
    assert.equal(result.boundary.directPublicationAllowed, false);
    assert.equal(result.boundary.requiresFutureFinalizationRuntime, true);
    assert.match(result.evidenceRefs.join("\n"), /evidence:final-answer-review-input-hash:sha256:/u);
    assert.match(formatDeepResearchFinalAnswerReview(result), /Final answer generated: false/u);
  });

  it("records revision-required decisions and requires reviewer feedback", () => {
    const result = recordDeepResearchFinalAnswerReview({
      ...baseInput(),
      review: {
        ...review(),
        decision: "REVISION_REQUIRED",
        coverage: { claimCountReviewed: 2, citedClaimCount: 1, unsupportedClaimCount: 1, coverageRatio: 0.5 },
        comments: "claim_002 lacks enough support for finalization.",
      },
    }, { commandLogPath: tempCommandLogPath() });

    assert.equal(result.status, "FINAL_ANSWER_REVIEW_REVISION_REQUIRED");
    assert.equal(result.review.revisionRequired, true);
    assert.equal(result.boundary.approvedForFutureFinalization, false);
    assert.equal(result.nextAction.includes("revision"), true);

    assert.throws(
      () => recordDeepResearchFinalAnswerReview({
        ...baseInput(),
        review: { ...review(), decision: "REJECTED", comments: "" },
      }, { commandLogPath: tempCommandLogPath() }),
      /requires comments/u,
    );
  });

  it("uses idempotency for safe replay and rejects conflicting review inputs", () => {
    const commandLogPath = tempCommandLogPath();
    const first = recordDeepResearchFinalAnswerReview(baseInput(), { commandLogPath });
    const second = recordDeepResearchFinalAnswerReview(baseInput(), { commandLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(second.idempotentReplay, true);
    assert.equal(fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).length, 1);
    assert.throws(
      () => recordDeepResearchFinalAnswerReview({
        ...baseInput(),
        reviewInvocationId: "different_review_invocation",
      }, { commandLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects unsafe policies, published synthesis boundaries, students, and service reviewers", () => {
    assert.throws(
      () => recordDeepResearchFinalAnswerReview({
        ...baseInput(),
        reviewPolicy: { ...reviewPolicy(), publicationAllowed: true },
      }, { commandLogPath: tempCommandLogPath() }),
      /publicationAllowed must be false/u,
    );
    assert.throws(
      () => recordDeepResearchFinalAnswerReview({
        ...baseInput(),
        reasoningSynthesisRecord: {
          ...reasoningSynthesisRecord(),
          boundary: { ...reasoningSynthesisRecord().boundary, finalAnswerGenerated: true },
        },
      }, { commandLogPath: tempCommandLogPath() }),
      /finalAnswerGenerated must be false/u,
    );
    assert.throws(
      () => recordDeepResearchFinalAnswerReview({
        ...baseInput(),
        principal: { ...principal(), role: "STUDENT", entryPoint: "STUDENT_APP" },
      }, { commandLogPath: tempCommandLogPath() }),
      /human research reviewer or admin/u,
    );
    assert.throws(
      () => recordDeepResearchFinalAnswerReview({
        ...baseInput(),
        principal: { ...principal(), role: "SERVICE", subjectType: "SERVICE", entryPoint: "AGENT_INTERNAL" },
      }, { commandLogPath: tempCommandLogPath() }),
      /human research reviewer or admin/u,
    );
  });

  it("rejects approval when coverage or risk is not safe enough", () => {
    assert.throws(
      () => recordDeepResearchFinalAnswerReview({
        ...baseInput(),
        review: {
          ...review(),
          coverage: { claimCountReviewed: 2, citedClaimCount: 1, unsupportedClaimCount: 1, coverageRatio: 0.5 },
        },
      }, { commandLogPath: tempCommandLogPath() }),
      /unsupported claims/u,
    );
    assert.throws(
      () => recordDeepResearchFinalAnswerReview({
        ...baseInput(),
        review: {
          ...review(),
          risk: { hallucinationRisk: "HIGH", privateKnowledgeRisk: "LOW", studentDataRisk: "LOW" },
        },
      }, { commandLogPath: tempCommandLogPath() }),
      /HIGH risk/u,
    );
  });
});

function tempCommandLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-final-answer-review-")), "review.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-final-answer-review.v1",
    reviewInvocationId: "deep_research_final_answer_review_inv_001",
    principal: principal(),
    reasoningSynthesisRecord: reasoningSynthesisRecord(),
    reviewPolicy: reviewPolicy(),
    review: review(),
    evidenceRefs: ["evidence:reasoning-synthesis:job-001", "evidence:human-review:desktop-research"],
    idempotencyKey: "deep-research-final-answer-review:job-001",
  };
}

function principal() {
  return {
    principalId: "teacher_research_reviewer_001",
    role: "TEACHER",
    subjectType: "USER",
    entryPoint: "DESKTOP_RESEARCH",
    scopes: ["RESEARCH_READ", "RESEARCH_WRITE", "KNOWLEDGE_PRIVATE_READ"],
    sessionId: "research_review_session_001",
  };
}

function reviewPolicy() {
  return {
    humanReviewRequired: true,
    evidenceCoverageReviewRequired: true,
    safetyReviewRequired: true,
    limitationReviewRequired: true,
    citationIntegrityReviewRequired: true,
    sourceHashIntegrityReviewRequired: true,
    allowFutureFinalizationWhenApproved: true,
    publicationAllowed: false,
    directDatabaseAccessAllowed: false,
    writeAllowed: false,
    studentArchiveWriteAllowed: false,
    remoteDeviceControlAllowed: false,
    externalModelCallAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
    minEvidenceCoverageRatio: 1,
  };
}

function review() {
  return {
    reviewId: "deep_research_final_review_001",
    reviewerPrincipalId: "teacher_research_reviewer_001",
    decision: "APPROVED_FOR_FINALIZATION",
    reviewedAt: "2026-06-05T00:00:00.000Z",
    evidenceCoverageReviewed: true,
    safetyReviewed: true,
    limitationsReviewed: true,
    citationIntegrityReviewed: true,
    sourceHashIntegrityReviewed: true,
    coverage: { claimCountReviewed: 2, citedClaimCount: 2, unsupportedClaimCount: 0, coverageRatio: 1 },
    risk: { hallucinationRisk: "LOW", privateKnowledgeRisk: "MEDIUM", studentDataRisk: "LOW" },
    comments: "Evidence, limitations, citation and sourceHash integrity have been reviewed.",
  };
}

function reasoningSynthesisRecord() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-reasoning-synthesis-recorded.v1",
    runtimeId: "research_deep_research_reasoning_synthesis_runtime",
    status: "REASONING_SYNTHESIS_DRAFT_RECORDED",
    recordId: "research_deep_research_reasoning_synthesis_job_001",
    job: {
      taskId: "agent_task_research_deep_001",
      contextRef: "shared_ctx_research_deep_001",
      jobId: "deep_research_job_001",
      queueName: "research_deep_research",
    },
    draft: {
      draftId: "deep_research_draft_001",
      answerKind: "EVIDENCE_GROUNDED_DRAFT",
      title: "个性化学习与智能教研助手的证据草稿",
      summary: "当前证据支持把个性化辅导建立在可追踪的学习档案、检索证据和效果指标上。",
      claims: [
        claim("claim_001", "public_curriculum_knowledge#source:public-curriculum:001", "a", "chunk_public_001"),
        claim("claim_002", "private_research_notes#source:private-notes:001", "b", "chunk_private_001"),
      ],
      limitations: ["该草稿仍需人工复核后才能进入最终答案边界。"],
    },
    usage: { draftTokens: 260, claimCount: 2, citationCount: 2, sourceHashCount: 2 },
    evidenceRefs: [
      "evidence:retrieval-execution:job-001",
      "evidence:runtime:research_deep_research_reasoning_synthesis_runtime",
    ],
    boundary: {
      reasoningDraftComposed: true,
      finalAnswerGenerated: false,
      directPublicationAllowed: false,
      requiresFutureFinalAnswerReview: true,
    },
  };
}

function claim(claimId, citation, digestChar, chunkId) {
  return {
    claimId,
    text: `Reviewed claim ${claimId}.`,
    citations: [citation],
    sourceHashes: [`sha256:${digestChar.repeat(64)}`],
    supportChunkIds: [chunkId],
    confidence: 0.86,
  };
}
