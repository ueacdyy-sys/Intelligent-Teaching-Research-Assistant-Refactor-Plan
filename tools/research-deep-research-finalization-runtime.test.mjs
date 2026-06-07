import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  RESEARCH_DEEP_RESEARCH_FINALIZATION_COMMAND_PORT,
  formatDeepResearchFinalization,
  recordDeepResearchFinalization,
} from "./research-deep-research-finalization-runtime.mjs";

describe("Research deep_research finalization runtime", () => {
  it("records a finalized but unpublished artifact from an approved human review", () => {
    const result = recordDeepResearchFinalization(baseInput(), {
      commandLogPath: tempCommandLogPath(),
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-05.research.deep-research-finalization-recorded.v1");
    assert.equal(result.commandPort, RESEARCH_DEEP_RESEARCH_FINALIZATION_COMMAND_PORT);
    assert.equal(result.status, "FINAL_ANSWER_FINALIZED_NOT_PUBLISHED");
    assert.equal(result.artifact.deliveryState, "FINALIZED_NOT_PUBLISHED");
    assert.equal(result.artifact.claimCount, 2);
    assert.equal(result.artifact.citationCount, 2);
    assert.equal(result.boundary.finalAnswerFinalized, true);
    assert.equal(result.boundary.finalAnswerPublished, false);
    assert.equal(result.boundary.mainDatabaseWriteStarted, false);
    assert.equal(result.boundary.requiresFuturePublicationReview, true);
    assert.match(result.evidenceRefs.join("\n"), /evidence:finalization-input-hash:sha256:/u);
    assert.match(formatDeepResearchFinalization(result), /Published: false/u);
  });

  it("uses idempotency for safe replay and rejects conflicting finalization inputs", () => {
    const commandLogPath = tempCommandLogPath();
    const first = recordDeepResearchFinalization(baseInput(), { commandLogPath });
    const second = recordDeepResearchFinalization(baseInput(), { commandLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(second.idempotentReplay, true);
    assert.equal(fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).length, 1);
    assert.throws(
      () => recordDeepResearchFinalization({
        ...baseInput(),
        finalizationInvocationId: "different_finalization_invocation",
      }, { commandLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects revision-required reviews, unsafe boundaries, students, and service principals", () => {
    assert.throws(
      () => recordDeepResearchFinalization({
        ...baseInput(),
        finalAnswerReviewRecord: { ...reviewRecord(), status: "FINAL_ANSWER_REVIEW_REVISION_REQUIRED" },
      }, { commandLogPath: tempCommandLogPath() }),
      /status must be FINAL_ANSWER_REVIEW_APPROVED_FOR_FINALIZATION/u,
    );
    assert.throws(
      () => recordDeepResearchFinalization({
        ...baseInput(),
        finalAnswerReviewRecord: {
          ...reviewRecord(),
          boundary: { ...reviewRecord().boundary, finalAnswerPublished: true },
        },
      }, { commandLogPath: tempCommandLogPath() }),
      /finalAnswerPublished must be false/u,
    );
    assert.throws(
      () => recordDeepResearchFinalization({
        ...baseInput(),
        principal: { ...principal(), role: "STUDENT", entryPoint: "STUDENT_APP" },
      }, { commandLogPath: tempCommandLogPath() }),
      /human research finalizer or admin/u,
    );
    assert.throws(
      () => recordDeepResearchFinalization({
        ...baseInput(),
        principal: { ...principal(), role: "SERVICE", subjectType: "SERVICE", entryPoint: "AGENT_INTERNAL" },
      }, { commandLogPath: tempCommandLogPath() }),
      /human research finalizer or admin/u,
    );
  });

  it("rejects answer-body injection, publication policy, incomplete coverage, and high risk", () => {
    assert.throws(
      () => recordDeepResearchFinalization({
        ...baseInput(),
        artifact: { ...artifact(), answerBody: "Do not smuggle final answer text through the envelope." },
      }, { commandLogPath: tempCommandLogPath() }),
      /cannot include final content fields/u,
    );
    assert.throws(
      () => recordDeepResearchFinalization({
        ...baseInput(),
        finalizationPolicy: { ...finalizationPolicy(), publicationAllowed: true },
      }, { commandLogPath: tempCommandLogPath() }),
      /publicationAllowed must be false/u,
    );
    assert.throws(
      () => recordDeepResearchFinalization({
        ...baseInput(),
        finalAnswerReviewRecord: {
          ...reviewRecord(),
          review: { ...review(), coverage: { claimCountReviewed: 2, citedClaimCount: 1, unsupportedClaimCount: 1, coverageRatio: 0.5 } },
        },
      }, { commandLogPath: tempCommandLogPath() }),
      /fully covered reviewed claims/u,
    );
    assert.throws(
      () => recordDeepResearchFinalization({
        ...baseInput(),
        finalAnswerReviewRecord: {
          ...reviewRecord(),
          review: { ...review(), risk: { hallucinationRisk: "HIGH", privateKnowledgeRisk: "LOW", studentDataRisk: "LOW" } },
        },
      }, { commandLogPath: tempCommandLogPath() }),
      /HIGH risk/u,
    );
  });
});

function tempCommandLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-finalization-")), "finalization.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-finalization.v1",
    finalizationInvocationId: "deep_research_finalization_inv_001",
    principal: principal(),
    finalAnswerReviewRecord: reviewRecord(),
    finalizationPolicy: finalizationPolicy(),
    artifact: artifact(),
    evidenceRefs: ["evidence:final-answer-review:job-001", "evidence:finalization:desktop-research"],
    idempotencyKey: "deep-research-finalization:job-001",
  };
}

function principal() {
  return {
    principalId: "teacher_research_reviewer_001",
    role: "TEACHER",
    subjectType: "USER",
    entryPoint: "DESKTOP_RESEARCH",
    scopes: ["RESEARCH_READ", "RESEARCH_WRITE", "KNOWLEDGE_PRIVATE_READ"],
    sessionId: "research_finalization_session_001",
  };
}

function finalizationPolicy() {
  return {
    approvedReviewRequired: true,
    preserveEvidenceRefsRequired: true,
    preserveCitationCountsRequired: true,
    preserveSourceHashCountsRequired: true,
    answerBodyAllowed: false,
    publicationAllowed: false,
    directPublicationAllowed: false,
    directDatabaseAccessAllowed: false,
    mainDatabaseWriteAllowed: false,
    studentArchiveWriteAllowed: false,
    remoteDeviceControlAllowed: false,
    externalModelCallAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
    requiresFuturePublicationReview: true,
  };
}

function artifact() {
  return {
    artifactId: "deep_research_finalization_artifact_001",
    artifactKind: "REVIEWED_DEEP_RESEARCH_FINALIZATION_RECORD",
    finalizationLabel: "Reviewed deep research answer envelope",
    deliveryState: "FINALIZED_NOT_PUBLISHED",
  };
}

function reviewRecord() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-final-answer-review-recorded.v1",
    runtimeId: "research_deep_research_final_answer_review_runtime",
    commandPort: "DeepResearchFinalAnswerReviewPort.recordDeepResearchFinalAnswerReview",
    status: "FINAL_ANSWER_REVIEW_APPROVED_FOR_FINALIZATION",
    recordId: "research_deep_research_final_answer_review_deep-research-final-answer-review_job-001",
    job: {
      taskId: "agent_task_research_deep_001",
      contextRef: "shared_ctx_research_deep_001",
      jobId: "deep_research_job_001",
      queueName: "research_deep_research",
    },
    synthesis: {
      recordId: "research_deep_research_reasoning_synthesis_job_001",
      draftId: "deep_research_draft_001",
      claimCount: 2,
      citationCount: 2,
      sourceHashCount: 2,
    },
    review: review(),
    evidenceRefs: [
      "evidence:reasoning-synthesis:job-001",
      "evidence:runtime:research_deep_research_final_answer_review_runtime",
    ],
    boundary: {
      humanFinalAnswerReviewRecorded: true,
      approvedForFutureFinalization: true,
      revisionRequired: false,
      finalAnswerGenerated: false,
      finalAnswerPublished: false,
      directPublicationAllowed: false,
      externalModelCallStarted: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureFinalizationRuntime: true,
    },
  };
}

function review() {
  return {
    reviewId: "deep_research_final_review_001",
    reviewerPrincipalId: "teacher_research_reviewer_001",
    decision: "APPROVED_FOR_FINALIZATION",
    approvedForFinalization: true,
    revisionRequired: false,
    coverage: { claimCountReviewed: 2, citedClaimCount: 2, unsupportedClaimCount: 0, coverageRatio: 1 },
    risk: { hallucinationRisk: "LOW", privateKnowledgeRisk: "MEDIUM", studentDataRisk: "LOW" },
    comments: "Evidence, limitations, citation and sourceHash integrity have been reviewed.",
  };
}
