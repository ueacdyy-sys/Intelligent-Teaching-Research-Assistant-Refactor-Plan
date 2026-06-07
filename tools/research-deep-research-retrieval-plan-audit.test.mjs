import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditDeepResearchRetrievalPlan,
  formatDeepResearchRetrievalPlanAudit,
} from "./research-deep-research-retrieval-plan-audit.mjs";

describe("Research deep_research retrieval plan audit", () => {
  it("passes when retrieval planning is approved, local, directory-first, and execution-deferred", async () => {
    const report = await auditDeepResearchRetrievalPlan(currentInputs(), {
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN");
    assert.equal(report.runtime.runtimeId, "research_deep_research_retrieval_plan_runtime");
    assert.equal(report.runtime.commandPort, "DeepResearchRetrievalPlanPort.recordDeepResearchRetrievalPlan");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    assert.equal(report.runtimeProbes.retrievalPlan.result.status, "RETRIEVAL_PLAN_RECORDED");
    assert.equal(report.runtimeProbes.retrievalPlan.result.boundary.finalAnswerGenerated, false);
    assert.match(formatDeepResearchRetrievalPlanAudit(report), /Research deep_research retrieval plan: READY/u);
  });

  it("fails when the runtime starts retrieval or claims final answers", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nexecuteRetrievalNow: true\nfinalAnswerGenerated: true`;

    const report = await auditDeepResearchRetrievalPlan(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.approval_source_and_safety_boundaries").passed, false);
  });

  it("caps the probe p99 at the planning budget ceiling", async () => {
    const report = await auditDeepResearchRetrievalPlan(currentInputs(), {
      probeP99Ms: 55,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when quality, structure, or root workflow hooks omit the retrieval-plan slice", async () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage
      .replaceAll("researchDeepResearchRetrievalPlan", "researchDeepResearchFuturePlan")
      .replace("research-deep-research-retrieval-plan.current.json", "research-deep-research-future-plan.current.json")
      .replace("research_deep_research_retrieval_plan_runtime", "research_deep_research_future_plan_runtime");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("research-deep-research-retrieval-plan", "research-deep-research-future-plan");

    const report = await auditDeepResearchRetrievalPlan(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_tracks_runtime").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_retrieval_plan_report").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "structure_tracks_runtime_files").passed, false);
  });
});

function currentInputs() {
  return {
    inputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-retrieval-plan.v1" },
        retrievalPolicy: {
          properties: {
            planningOnly: { const: true },
            executeRetrievalNow: { const: false },
          },
        },
      },
    }),
    outputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-retrieval-plan-recorded.v1" },
        runtimeId: { const: "research_deep_research_retrieval_plan_runtime" },
      },
    }),
    inputExample: JSON.stringify({
      retrievalPolicy: { directoryIndexFirst: true, executeRetrievalNow: false },
    }),
    outputExample: JSON.stringify({
      status: "RETRIEVAL_PLAN_RECORDED",
      boundary: { retrievalExecuted: false, finalAnswerGenerated: false },
    }),
    runtime: [
      'export const RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN_RUNTIME_ID = "research_deep_research_retrieval_plan_runtime";',
      'export const RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN_COMMAND_PORT = "DeepResearchRetrievalPlanPort.recordDeepResearchRetrievalPlan";',
      "RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN",
      "recordDeepResearchRetrievalPlan",
      "RETRIEVAL_PLAN_RECORDED",
      "input.workerLifecycle.status",
      "CLAIMED_FOR_ASYNC_EXECUTION",
      "input.workerLifecycle.approval.decision",
      "APPROVED_FOR_ASYNC",
      "input.workerLifecycle.worker.nodeType",
      "LOCAL",
      "input.retrievalPolicy.planningOnly",
      "input.retrievalPolicy.executeRetrievalNow",
      "input.retrievalPolicy.directoryIndexFirst",
      "input.retrievalPolicy.vectorSearchNow",
      "input.retrievalPolicy.externalModelCallNow",
      "input.retrievalPolicy.ragSynthesisNow",
      "input.retrievalPolicy.finalAnswerNowAllowed",
      "input.sourcePolicy.includeStudentArchive",
      "requiresFutureRetrievalExecutionSlice: true",
    ].join("\n"),
    runtimeTest: [
      "records an approved directory-first retrieval plan without executing retrieval, model calls, or final answers",
      "uses the idempotency key for safe replay and rejects conflicting plans",
      "rejects unclaimed workers and unsafe lifecycle boundaries",
      "rejects out-of-policy sources, student archive, and immediate retrieval execution",
      "rejects over-budget plans and source items without citation or hash guarantees",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:research-deep-research-retrieval-plan": "node tools/research-deep-research-retrieval-plan-audit.mjs --out reports/research-deep-research-retrieval-plan.current.json",
      },
    }),
    qualityGate: "Research deep_research retrieval plan audit",
    rootWorkflowCoverage: [
      "researchDeepResearchRetrievalPlan",
      "research-deep-research-retrieval-plan.current.json",
      "research_deep_research_retrieval_plan_runtime",
    ].join("\n"),
    verifyStructure: [
      "0244-research-deep-research-retrieval-plan.md",
      "deep-research-retrieval-plan.input.schema.json",
      "deep-research-retrieval-plan.output.schema.json",
      "research-deep-research-retrieval-plan-runtime.mjs",
      "research-deep-research-retrieval-plan-runtime.test.mjs",
      "research-deep-research-retrieval-plan-audit.mjs",
      "research-deep-research-retrieval-plan-audit.test.mjs",
    ].join("\n"),
    architectureBoard: "ResearchAgent.deep_research approved retrieval planning 8.4/10",
    sdd: [
      "retrieval-plan control-plane",
      "does not read the directory index",
      "does not run vector search",
      "does not call models",
      "does not fuse answers",
      "future approved async execution",
    ].join("\n"),
  };
}
