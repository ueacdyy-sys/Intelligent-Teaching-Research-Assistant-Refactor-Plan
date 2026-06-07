import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditDeepResearchReasoningSynthesis,
  formatDeepResearchReasoningSynthesisAudit,
} from "./research-deep-research-reasoning-synthesis-audit.mjs";

describe("Research deep_research reasoning synthesis audit", () => {
  it("passes when synthesis is approved, evidence-grounded, port-based, and publication-deferred", async () => {
    const report = await auditDeepResearchReasoningSynthesis(currentInputs(), {
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS");
    assert.equal(report.runtime.runtimeId, "research_deep_research_reasoning_synthesis_runtime");
    assert.equal(report.runtime.commandPort, "DeepResearchReasoningSynthesisPort.recordDeepResearchReasoningSynthesis");
    assert.equal(report.runtime.reasoningPort, "DeepResearchReasoningPort.composeEvidenceGroundedDraft");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 300, true);
    assert.equal(report.runtimeProbes.reasoningSynthesis.result.status, "REASONING_SYNTHESIS_DRAFT_RECORDED");
    assert.equal(report.runtimeProbes.reasoningSynthesis.result.boundary.finalAnswerGenerated, false);
    assert.match(formatDeepResearchReasoningSynthesisAudit(report), /Research deep_research reasoning synthesis: READY/u);
  });

  it("fails when runtime claims direct model access or final answers", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\ndirectExternalModelCallAllowed: true\nfinalAnswerGenerated: true`;

    const report = await auditDeepResearchReasoningSynthesis(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.retrieval_execution_and_safety_boundaries").passed, false);
  });

  it("caps the probe p99 at the async synthesis boundary budget", async () => {
    const report = await auditDeepResearchReasoningSynthesis(currentInputs(), {
      probeP99Ms: 350,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 300);
  });

  it("fails when quality, structure, root workflow, or board hooks omit the synthesis slice", async () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage
      .replaceAll("researchDeepResearchReasoningSynthesis", "researchDeepResearchFutureSynthesis")
      .replace("research-deep-research-reasoning-synthesis.current.json", "research-deep-research-future-synthesis.current.json")
      .replace("research_deep_research_reasoning_synthesis_runtime", "research_deep_research_future_synthesis_runtime");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("research-deep-research-reasoning-synthesis", "research-deep-research-future-synthesis");
    inputs.architectureBoard = "ResearchAgent.deep_research approved retrieval execution 8.5/10";

    const report = await auditDeepResearchReasoningSynthesis(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_tracks_runtime").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_reasoning_synthesis_report").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "structure_tracks_runtime_files").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "architecture_board.reflects_reasoning_synthesis_progress").passed, false);
  });
});

function currentInputs() {
  return {
    inputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-reasoning-synthesis.v1" },
        reasoningPolicy: {
          properties: {
            composeDraftNow: { const: true },
            directExternalModelCallAllowed: { const: false },
          },
        },
        reasoningPortDescriptor: {
          properties: {
            operation: { const: "composeEvidenceGroundedDraft" },
          },
        },
      },
    }),
    outputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-reasoning-synthesis-recorded.v1" },
        runtimeId: { const: "research_deep_research_reasoning_synthesis_runtime" },
        reasoningPort: { const: "DeepResearchReasoningPort.composeEvidenceGroundedDraft" },
      },
    }),
    inputExample: JSON.stringify({
      reasoningPolicy: { evidenceGroundedOnly: true, directExternalModelCallAllowed: false },
    }),
    outputExample: JSON.stringify({
      status: "REASONING_SYNTHESIS_DRAFT_RECORDED",
      boundary: { reasoningDraftComposed: true, finalAnswerGenerated: false },
    }),
    runtime: [
      'export const RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_RUNTIME_ID = "research_deep_research_reasoning_synthesis_runtime";',
      'export const RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_COMMAND_PORT = "DeepResearchReasoningSynthesisPort.recordDeepResearchReasoningSynthesis";',
      'export const RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_REASONING_PORT = "DeepResearchReasoningPort.composeEvidenceGroundedDraft";',
      "RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS",
      "recordDeepResearchReasoningSynthesis",
      "REASONING_SYNTHESIS_DRAFT_RECORDED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "input.retrievalExecutionRecord.runtimeId",
      "research_deep_research_retrieval_execution_runtime",
      "input.retrievalExecutionRecord.status",
      "RETRIEVAL_EXECUTION_RECORDED",
      "input.reasoningPolicy.evidenceGroundedOnly",
      "input.reasoningPolicy.directDatabaseAccessAllowed",
      "input.reasoningPolicy.directExternalModelCallAllowed",
      "input.reasoningPolicy.finalAnswerNowAllowed",
      "input.reasoningPolicy.publicationAllowed",
      "requiresFutureFinalAnswerReview: true",
      "assertEvidenceSubset",
    ].join("\n"),
    runtimeTest: [
      "records an evidence-grounded draft through the injected reasoning port without publishing a final answer",
      "uses idempotency for safe replay and rejects conflicting synthesis inputs",
      "rejects unsafe policy, completed synthesis boundaries, missing port, or missing private scope",
      "rejects claims that cite sources outside retrieval execution evidence",
      "rejects draft outputs that exceed claim or token budgets",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:research-deep-research-reasoning-synthesis": "node tools/research-deep-research-reasoning-synthesis-audit.mjs --out reports/research-deep-research-reasoning-synthesis.current.json",
      },
    }),
    qualityGate: "Research deep_research reasoning synthesis audit",
    rootWorkflowCoverage: [
      "researchDeepResearchReasoningSynthesis",
      "research-deep-research-reasoning-synthesis.current.json",
      "research_deep_research_reasoning_synthesis_runtime",
    ].join("\n"),
    verifyStructure: [
      "0246-research-deep-research-reasoning-synthesis.md",
      "deep-research-reasoning-synthesis.input.schema.json",
      "deep-research-reasoning-synthesis.output.schema.json",
      "research-deep-research-reasoning-synthesis-runtime.mjs",
      "research-deep-research-reasoning-synthesis-runtime.test.mjs",
      "research-deep-research-reasoning-synthesis-audit.mjs",
      "research-deep-research-reasoning-synthesis-audit.test.mjs",
    ].join("\n"),
    architectureBoard: "ResearchAgent.deep_research approved reasoning/synthesis draft 8.6/10",
    sdd: [
      "approved reasoning/synthesis draft boundary",
      "DeepResearchReasoningPort.composeEvidenceGroundedDraft",
      "evidence-grounded draft",
      "does not publish a final answer",
      "Final answer review/publication remains a future approved slice",
    ].join("\n"),
  };
}
