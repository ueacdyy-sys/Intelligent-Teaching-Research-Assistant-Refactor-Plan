import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditDeepResearchFinalAnswerReview,
  formatDeepResearchFinalAnswerReviewAudit,
} from "./research-deep-research-final-answer-review-audit.mjs";

describe("Research deep_research final answer review audit", () => {
  it("passes when review is human, evidence-based, and publication-deferred", () => {
    const report = auditDeepResearchFinalAnswerReview(currentInputs(), {
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW");
    assert.equal(report.runtime.runtimeId, "research_deep_research_final_answer_review_runtime");
    assert.equal(report.runtime.commandPort, "DeepResearchFinalAnswerReviewPort.recordDeepResearchFinalAnswerReview");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 300, true);
    assert.equal(report.runtimeProbes.finalAnswerReview.result.status, "FINAL_ANSWER_REVIEW_APPROVED_FOR_FINALIZATION");
    assert.equal(report.runtimeProbes.finalAnswerReview.result.boundary.finalAnswerGenerated, false);
    assert.match(formatDeepResearchFinalAnswerReviewAudit(report), /Research deep_research final answer review: READY/u);
  });

  it("fails when runtime claims publication, writes, model access, or final answers", () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\npublicationAllowed: true\nfinalAnswerGenerated: true\n`;

    const report = auditDeepResearchFinalAnswerReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.synthesis_and_safety_boundaries").passed, false);
  });

  it("caps the probe p99 at the async review boundary budget", () => {
    const report = auditDeepResearchFinalAnswerReview(currentInputs(), {
      probeP99Ms: 350,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 300);
  });

  it("fails when quality, structure, root workflow, or board hooks omit the review slice", () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage
      .replaceAll("researchDeepResearchFinalAnswerReview", "researchDeepResearchFutureReview")
      .replace("research-deep-research-final-answer-review.current.json", "research-deep-research-future-review.current.json")
      .replace("research_deep_research_final_answer_review_runtime", "research_deep_research_future_review_runtime");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("research-deep-research-final-answer-review", "research-deep-research-future-review");
    inputs.architectureBoard = "ResearchAgent.deep_research approved reasoning/synthesis draft 8.6/10";

    const report = auditDeepResearchFinalAnswerReview(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_tracks_runtime").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_final_answer_review_report").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "structure_tracks_runtime_files").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "architecture_board.reflects_final_answer_review_progress").passed, false);
  });
});

function currentInputs() {
  return {
    inputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-final-answer-review.v1" },
        reasoningSynthesisRecord: {
          properties: {
            runtimeId: { const: "research_deep_research_reasoning_synthesis_runtime" },
          },
        },
        reviewPolicy: {
          properties: {
            humanReviewRequired: { const: true },
            publicationAllowed: { const: false },
          },
        },
      },
    }),
    outputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-final-answer-review-recorded.v1" },
        runtimeId: { const: "research_deep_research_final_answer_review_runtime" },
        commandPort: { const: "DeepResearchFinalAnswerReviewPort.recordDeepResearchFinalAnswerReview" },
      },
    }),
    inputExample: JSON.stringify({
      reviewPolicy: { humanReviewRequired: true, publicationAllowed: false },
    }),
    outputExample: JSON.stringify({
      status: "FINAL_ANSWER_REVIEW_APPROVED_FOR_FINALIZATION",
      boundary: { finalAnswerGenerated: false, requiresFutureFinalizationRuntime: true },
    }),
    runtime: [
      'export const RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW_RUNTIME_ID = "research_deep_research_final_answer_review_runtime";',
      'export const RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW_COMMAND_PORT = "DeepResearchFinalAnswerReviewPort.recordDeepResearchFinalAnswerReview";',
      "RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW",
      "recordDeepResearchFinalAnswerReview",
      "FINAL_ANSWER_REVIEW_APPROVED_FOR_FINALIZATION",
      "FINAL_ANSWER_REVIEW_REVISION_REQUIRED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "input.reasoningSynthesisRecord.runtimeId",
      "research_deep_research_reasoning_synthesis_runtime",
      "input.reasoningSynthesisRecord.status",
      "REASONING_SYNTHESIS_DRAFT_RECORDED",
      "input.reviewPolicy.humanReviewRequired",
      "input.reviewPolicy.publicationAllowed",
      "input.reviewPolicy.externalModelCallAllowed",
      "input.reviewPolicy.studentArchiveWriteAllowed",
      "requiresFutureFinalizationRuntime: true",
      "finalAnswerGenerated: false",
      "finalAnswerPublished: false",
    ].join("\n"),
    runtimeTest: [
      "records a human review that approves a synthesis draft for future finalization without publishing",
      "records revision-required decisions and requires reviewer feedback",
      "uses idempotency for safe replay and rejects conflicting review inputs",
      "rejects unsafe policies, published synthesis boundaries, students, and service reviewers",
      "rejects approval when coverage or risk is not safe enough",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:research-deep-research-final-answer-review": "node tools/research-deep-research-final-answer-review-audit.mjs --out reports/research-deep-research-final-answer-review.current.json",
      },
    }),
    qualityGate: "Research deep_research final answer review audit",
    rootWorkflowCoverage: [
      "researchDeepResearchFinalAnswerReview",
      "research-deep-research-final-answer-review.current.json",
      "research_deep_research_final_answer_review_runtime",
    ].join("\n"),
    verifyStructure: [
      "0247-research-deep-research-final-answer-review.md",
      "deep-research-final-answer-review.input.schema.json",
      "deep-research-final-answer-review.output.schema.json",
      "research-deep-research-final-answer-review-runtime.mjs",
      "research-deep-research-final-answer-review-runtime.test.mjs",
      "research-deep-research-final-answer-review-audit.mjs",
      "research-deep-research-final-answer-review-audit.test.mjs",
    ].join("\n"),
    architectureBoard: "ResearchAgent.deep_research final-answer review gate 8.7/10; previous 8.6/10 reasoning milestone",
    sdd: [
      "final-answer review gate",
      "DeepResearchFinalAnswerReviewPort.recordDeepResearchFinalAnswerReview",
      "future finalization runtime",
      "This is not final-answer generation and not publication",
    ].join("\n"),
  };
}
