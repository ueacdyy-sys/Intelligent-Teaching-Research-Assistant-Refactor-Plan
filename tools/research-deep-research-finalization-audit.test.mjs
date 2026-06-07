import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditDeepResearchFinalization,
  formatDeepResearchFinalizationAudit,
} from "./research-deep-research-finalization-audit.mjs";

describe("Research deep_research finalization audit", () => {
  it("passes when finalization consumes approved review and remains unpublished", () => {
    const report = auditDeepResearchFinalization(currentInputs(), {
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "RESEARCH_DEEP_RESEARCH_FINALIZATION");
    assert.equal(report.runtime.runtimeId, "research_deep_research_finalization_runtime");
    assert.equal(report.runtime.commandPort, "DeepResearchFinalizationPort.recordDeepResearchFinalization");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 300, true);
    assert.equal(report.runtimeProbes.finalization.result.status, "FINAL_ANSWER_FINALIZED_NOT_PUBLISHED");
    assert.equal(report.runtimeProbes.finalization.result.boundary.finalAnswerPublished, false);
    assert.match(formatDeepResearchFinalizationAudit(report), /Research deep_research finalization: READY/u);
  });

  it("fails when runtime claims publication, writes, model access, or answer body", () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\npublicationAllowed: true\nfinalAnswerPublished: true\nanswerBodyAllowed: true\n`;

    const report = auditDeepResearchFinalization(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.review_and_safety_boundaries").passed, false);
  });

  it("caps the probe p99 at the async finalization boundary budget", () => {
    const report = auditDeepResearchFinalization(currentInputs(), {
      probeP99Ms: 350,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 300);
  });

  it("fails when quality, structure, root workflow, or board hooks omit the finalization slice", () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage
      .replaceAll("researchDeepResearchFinalization", "researchDeepResearchFuturePublication")
      .replace("research-deep-research-finalization.current.json", "research-deep-research-future-publication.current.json")
      .replace("research_deep_research_finalization_runtime", "research_deep_research_future_publication_runtime");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("research-deep-research-finalization", "research-deep-research-future-publication");
    inputs.architectureBoard = "ResearchAgent.deep_research final-answer review gate 8.7/10";

    const report = auditDeepResearchFinalization(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_tracks_runtime").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_finalization_report").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "structure_tracks_runtime_files").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "architecture_board.reflects_finalization_progress").passed, false);
  });
});

function currentInputs() {
  return {
    inputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-finalization.v1" },
        finalAnswerReviewRecord: {
          properties: {
            runtimeId: { const: "research_deep_research_final_answer_review_runtime" },
          },
        },
        finalizationPolicy: {
          properties: {
            approvedReviewRequired: { const: true },
            publicationAllowed: { const: false },
            answerBodyAllowed: { const: false },
          },
        },
      },
    }),
    outputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-finalization-recorded.v1" },
        runtimeId: { const: "research_deep_research_finalization_runtime" },
        commandPort: { const: "DeepResearchFinalizationPort.recordDeepResearchFinalization" },
      },
    }),
    inputExample: JSON.stringify({
      finalAnswerReviewRecord: { status: "FINAL_ANSWER_REVIEW_APPROVED_FOR_FINALIZATION" },
      finalizationPolicy: { publicationAllowed: false },
    }),
    outputExample: JSON.stringify({
      status: "FINAL_ANSWER_FINALIZED_NOT_PUBLISHED",
      boundary: { finalAnswerFinalized: true, finalAnswerPublished: false },
    }),
    runtime: [
      'export const RESEARCH_DEEP_RESEARCH_FINALIZATION_RUNTIME_ID = "research_deep_research_finalization_runtime";',
      'export const RESEARCH_DEEP_RESEARCH_FINALIZATION_COMMAND_PORT = "DeepResearchFinalizationPort.recordDeepResearchFinalization";',
      "RESEARCH_DEEP_RESEARCH_FINALIZATION",
      "recordDeepResearchFinalization",
      "FINAL_ANSWER_FINALIZED_NOT_PUBLISHED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "input.finalAnswerReviewRecord.runtimeId",
      "research_deep_research_final_answer_review_runtime",
      "input.finalAnswerReviewRecord.status",
      "FINAL_ANSWER_REVIEW_APPROVED_FOR_FINALIZATION",
      "approvedForFutureFinalization",
      "requiresFutureFinalizationRuntime",
      "answerBodyAllowed",
      "requiresFuturePublicationReview",
      "finalAnswerFinalized: true",
      "finalAnswerPublished: false",
      "publicationCandidateCreated: false",
    ].join("\n"),
    runtimeTest: [
      "records a finalized but unpublished artifact from an approved human review",
      "uses idempotency for safe replay and rejects conflicting finalization inputs",
      "rejects revision-required reviews, unsafe boundaries, students, and service principals",
      "rejects answer-body injection, publication policy, incomplete coverage, and high risk",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:research-deep-research-finalization": "node tools/research-deep-research-finalization-audit.mjs --out reports/research-deep-research-finalization.current.json",
      },
    }),
    qualityGate: "Research deep_research finalization audit",
    rootWorkflowCoverage: [
      "researchDeepResearchFinalization",
      "research-deep-research-finalization.current.json",
      "research_deep_research_finalization_runtime",
    ].join("\n"),
    verifyStructure: [
      "0248-research-deep-research-finalization-runtime.md",
      "deep-research-finalization.input.schema.json",
      "deep-research-finalization.output.schema.json",
      "research-deep-research-finalization-runtime.mjs",
      "research-deep-research-finalization-runtime.test.mjs",
      "research-deep-research-finalization-audit.mjs",
      "research-deep-research-finalization-audit.test.mjs",
    ].join("\n"),
    architectureBoard: "ResearchAgent.deep_research finalization runtime 8.8/10; previous 8.7/10 review milestone",
    sdd: [
      "finalization runtime",
      "DeepResearchFinalizationPort.recordDeepResearchFinalization",
      "This is not final-answer publication",
      "requiresFuturePublicationReview",
    ].join("\n"),
  };
}
