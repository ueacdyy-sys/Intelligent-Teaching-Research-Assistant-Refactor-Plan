import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_COMMAND_PORT,
  formatDeepResearchRenderPreview,
  recordDeepResearchRenderPreview,
} from "./research-deep-research-render-preview-runtime.mjs";

describe("Research deep_research render preview runtime", () => {
  it("records a teacher-only preview from finalized and synthesized records", () => {
    const result = recordDeepResearchRenderPreview(baseInput(), {
      commandLogPath: tempCommandLogPath(),
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-05.research.deep-research-render-preview-recorded.v1");
    assert.equal(result.commandPort, RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_COMMAND_PORT);
    assert.equal(result.status, "RENDER_PREVIEW_READY_NOT_PUBLISHED");
    assert.equal(result.preview.deliveryState, "PREVIEW_READY_NOT_PUBLISHED");
    assert.equal(result.preview.claims.length, 2);
    assert.equal(result.preview.integrity.claimCount, 2);
    assert.equal(result.preview.integrity.citationCount, 2);
    assert.equal(result.preview.integrity.sourceHashCount, 2);
    assert.equal(result.boundary.renderPreviewRecorded, true);
    assert.equal(result.boundary.finalAnswerPublished, false);
    assert.equal(result.boundary.studentVisible, false);
    assert.equal(result.boundary.mainDatabaseWriteStarted, false);
    assert.equal(result.boundary.requiresFuturePublicationReview, true);
    assert.match(result.evidenceRefs.join("\n"), /evidence:render-preview-input-hash:sha256:/u);
    assert.match(formatDeepResearchRenderPreview(result), /Student visible: false/u);
  });

  it("encodes unsafe text and preserves citations, source hashes, limitations, and review refs", () => {
    const input = baseInput();
    input.reasoningSynthesisRecord.draft.summary = "摘要 <script>alert(1)</script> & 待复核";
    input.reasoningSynthesisRecord.draft.claims[0].text = "不要把 <b>证据</b> 当 HTML 渲染";
    input.reasoningSynthesisRecord.draft.limitations[0] = "限制 <img src=x onerror=alert(1)>";

    const result = recordDeepResearchRenderPreview(input, { commandLogPath: tempCommandLogPath() });

    assert.equal(result.preview.summary.includes("<script>"), false);
    assert.match(result.preview.summary, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
    assert.match(result.preview.claims[0].text, /&lt;b&gt;证据&lt;\/b&gt;/u);
    assert.match(result.preview.limitations[0], /&lt;img/u);
    assert.deepEqual(result.preview.claims[0].citations, ["public_curriculum_knowledge#source:public-curriculum:001"]);
    assert.deepEqual(result.preview.claims[1].sourceHashes, ["sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]);
    assert.equal(result.preview.review.reviewRecordId, "research_deep_research_final_answer_review_deep-research-final-answer-review_job-001");
  });

  it("uses idempotency for safe replay and rejects conflicting preview inputs", () => {
    const commandLogPath = tempCommandLogPath();
    const first = recordDeepResearchRenderPreview(baseInput(), { commandLogPath });
    const second = recordDeepResearchRenderPreview(baseInput(), { commandLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(second.idempotentReplay, true);
    assert.equal(fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).length, 1);
    assert.throws(
      () => recordDeepResearchRenderPreview({
        ...baseInput(),
        previewInvocationId: "different_preview_invocation",
      }, { commandLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects mismatched records, unsafe finalization boundaries, students, and service principals", () => {
    assert.throws(
      () => recordDeepResearchRenderPreview({
        ...baseInput(),
        finalizationRecord: {
          ...finalizationRecord(),
          artifact: { ...finalizationRecord().artifact, claimCount: 1 },
        },
      }, { commandLogPath: tempCommandLogPath() }),
      /counts must match/u,
    );
    assert.throws(
      () => recordDeepResearchRenderPreview({
        ...baseInput(),
        finalizationRecord: {
          ...finalizationRecord(),
          boundary: { ...finalizationRecord().boundary, finalAnswerPublished: true },
        },
      }, { commandLogPath: tempCommandLogPath() }),
      /finalAnswerPublished must be false/u,
    );
    assert.throws(
      () => recordDeepResearchRenderPreview({
        ...baseInput(),
        principal: { ...principal(), role: "STUDENT", entryPoint: "STUDENT_APP" },
      }, { commandLogPath: tempCommandLogPath() }),
      /human research teacher or admin/u,
    );
    assert.throws(
      () => recordDeepResearchRenderPreview({
        ...baseInput(),
        principal: { ...principal(), role: "SERVICE", subjectType: "SERVICE", entryPoint: "AGENT_INTERNAL" },
      }, { commandLogPath: tempCommandLogPath() }),
      /human research teacher or admin/u,
    );
  });

  it("rejects publication, student visibility, unsafe render policy, and invalid evidence", () => {
    assert.throws(
      () => recordDeepResearchRenderPreview({
        ...baseInput(),
        renderPolicy: { ...renderPolicy(), publicationAllowed: true },
      }, { commandLogPath: tempCommandLogPath() }),
      /publicationAllowed must be false/u,
    );
    assert.throws(
      () => recordDeepResearchRenderPreview({
        ...baseInput(),
        renderPolicy: { ...renderPolicy(), studentVisibleAllowed: true },
      }, { commandLogPath: tempCommandLogPath() }),
      /studentVisibleAllowed must be false/u,
    );
    assert.throws(
      () => recordDeepResearchRenderPreview({
        ...baseInput(),
        presentation: { ...presentation(), deliveryState: "PUBLISHED" },
      }, { commandLogPath: tempCommandLogPath() }),
      /deliveryState must be PREVIEW_READY_NOT_PUBLISHED/u,
    );
    const input = baseInput();
    input.reasoningSynthesisRecord.draft.claims[0].citations = [];
    assert.throws(
      () => recordDeepResearchRenderPreview(input, { commandLogPath: tempCommandLogPath() }),
      /citations must contain/u,
    );
  });
});

function tempCommandLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-render-preview-")), "preview.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-render-preview.v1",
    previewInvocationId: "deep_research_render_preview_inv_001",
    principal: principal(),
    reasoningSynthesisRecord: reasoningSynthesisRecord(),
    finalizationRecord: finalizationRecord(),
    renderPolicy: renderPolicy(),
    presentation: presentation(),
    evidenceRefs: ["evidence:finalization:job-001", "evidence:render-preview:desktop-research"],
    idempotencyKey: "deep-research-render-preview:job-001",
  };
}

function principal() {
  return {
    principalId: "teacher_research_reviewer_001",
    role: "TEACHER",
    subjectType: "USER",
    entryPoint: "DESKTOP_RESEARCH",
    scopes: ["RESEARCH_READ", "RESEARCH_WRITE", "KNOWLEDGE_PRIVATE_READ"],
    sessionId: "research_preview_session_001",
  };
}

function renderPolicy() {
  return {
    finalizedArtifactRequired: true,
    approvedReviewRequired: true,
    preserveClaimsRequired: true,
    preserveCitationsRequired: true,
    preserveSourceHashesRequired: true,
    encodeUnsafeTextRequired: true,
    limitationsRequired: true,
    publicationAllowed: false,
    studentVisibleAllowed: false,
    directDatabaseAccessAllowed: false,
    mainDatabaseWriteAllowed: false,
    studentArchiveWriteAllowed: false,
    externalModelCallAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
    requiresFuturePublicationReview: true,
  };
}

function presentation() {
  return {
    previewId: "deep_research_render_preview_001",
    previewKind: "EVIDENCE_GROUNDED_RESEARCH_PREVIEW",
    audience: "TEACHER_REVIEW",
    format: "SAFE_TEXT_BLOCKS",
    deliveryState: "PREVIEW_READY_NOT_PUBLISHED",
  };
}

function reasoningSynthesisRecord() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-reasoning-synthesis-recorded.v1",
    runtimeId: "research_deep_research_reasoning_synthesis_runtime",
    commandPort: "DeepResearchReasoningSynthesisPort.recordDeepResearchReasoningSynthesis",
    reasoningPort: "DeepResearchReasoningPort.composeEvidenceGroundedDraft",
    status: "REASONING_SYNTHESIS_DRAFT_RECORDED",
    recordId: "research_deep_research_reasoning_synthesis_deep-research-reasoning-synthesis_job-001",
    job: job(),
    draft: {
      draftId: "deep_research_draft_001",
      answerKind: "EVIDENCE_GROUNDED_DRAFT",
      title: "个性化学习与智能教研助手的证据草稿",
      summary: "当前证据支持把个性化辅导建立在可追踪的学习档案、检索证据和效果指标上。",
      claims: [
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
      ],
      limitations: ["该草稿只覆盖已检索到的两个证据片段。", "最终发布仍需后续审批边界。"],
    },
    usage: { draftTokens: 260, claimCount: 2, citationCount: 2, sourceHashCount: 2 },
    evidenceRefs: ["evidence:retrieval-execution:job-001", "evidence:runtime:research_deep_research_reasoning_synthesis_runtime"],
    boundary: {
      retrievalExecutionVerified: true,
      evidenceGroundingVerified: true,
      reasoningDraftComposed: true,
      directExternalModelCallStarted: false,
      directDatabaseAccessStarted: false,
      mainDatabaseWriteStarted: false,
      studentArchiveUsed: false,
      remoteDeviceSourcesUsed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      finalAnswerGenerated: false,
      directPublicationAllowed: false,
      requiresFutureFinalAnswerReview: true,
    },
  };
}

function finalizationRecord() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-finalization-recorded.v1",
    runtimeId: "research_deep_research_finalization_runtime",
    commandPort: "DeepResearchFinalizationPort.recordDeepResearchFinalization",
    status: "FINAL_ANSWER_FINALIZED_NOT_PUBLISHED",
    recordId: "research_deep_research_finalization_deep-research-finalization_job-001",
    job: job(),
    artifact: {
      artifactId: "deep_research_finalization_artifact_001",
      artifactKind: "REVIEWED_DEEP_RESEARCH_FINALIZATION_RECORD",
      finalizationLabel: "Reviewed deep research answer envelope",
      deliveryState: "FINALIZED_NOT_PUBLISHED",
      reviewRecordId: "research_deep_research_final_answer_review_deep-research-final-answer-review_job-001",
      reviewerPrincipalId: "teacher_research_reviewer_001",
      finalizerPrincipalId: "teacher_research_reviewer_001",
      claimCount: 2,
      citationCount: 2,
      sourceHashCount: 2,
    },
    evidenceRefs: ["evidence:final-answer-review:job-001", "evidence:runtime:research_deep_research_finalization_runtime"],
    boundary: {
      approvedReviewVerified: true,
      humanFinalAnswerReviewRecorded: true,
      finalAnswerFinalized: true,
      finalAnswerGenerated: false,
      finalAnswerPublished: false,
      publicationCandidateCreated: false,
      directPublicationAllowed: false,
      externalModelCallStarted: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFuturePublicationReview: true,
    },
  };
}

function job() {
  return {
    taskId: "agent_task_research_deep_001",
    contextRef: "shared_ctx_research_deep_001",
    jobId: "deep_research_job_001",
    queueName: "research_deep_research",
  };
}
