import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditDeepResearchWorkerLifecycle,
  formatDeepResearchWorkerLifecycleAudit,
} from "./research-deep-research-worker-lifecycle-audit.mjs";

describe("Research deep_research worker lifecycle audit", () => {
  it("passes when the worker lifecycle is approved, local, and execution-deferred", async () => {
    const report = await auditDeepResearchWorkerLifecycle(currentInputs(), {
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "RESEARCH_DEEP_RESEARCH_WORKER_LIFECYCLE");
    assert.equal(report.runtime.runtimeId, "research_deep_research_worker_lifecycle_runtime");
    assert.equal(report.runtime.commandPort, "DeepResearchWorkerCommandPort.recordDeepResearchWorkerLifecycle");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    assert.equal(report.runtimeProbes.claim.result.status, "CLAIMED_FOR_ASYNC_EXECUTION");
    assert.equal(report.runtimeProbes.claim.result.boundary.finalAnswerGenerated, false);
    assert.match(formatDeepResearchWorkerLifecycleAudit(report), /Research deep_research worker lifecycle: READY/u);
  });

  it("fails when the runtime starts execution or claims final answers", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nexecuteNow: true\nfinalAnswerGenerated: true`;

    const report = await auditDeepResearchWorkerLifecycle(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.approval_and_safety_boundaries").passed, false);
  });

  it("caps the probe p99 at the lifecycle budget ceiling", async () => {
    const report = await auditDeepResearchWorkerLifecycle(currentInputs(), {
      probeP99Ms: 55,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when quality, structure, or root workflow hooks omit the lifecycle slice", async () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage
      .replaceAll("researchDeepResearchWorkerLifecycle", "researchDeepResearchWorkerFuture")
      .replace("research-deep-research-worker-lifecycle.current.json", "research-deep-research-worker-future.current.json")
      .replace("research_deep_research_worker_lifecycle_runtime", "research_deep_research_worker_future_runtime");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("research-deep-research-worker-lifecycle", "research-deep-research-worker-future");

    const report = await auditDeepResearchWorkerLifecycle(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_tracks_runtime").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_lifecycle_report").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "structure_tracks_runtime_files").passed, false);
  });
});

function currentInputs() {
  return {
    inputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-worker-lifecycle.v1" },
        lifecycleAction: { enum: ["CLAIM", "MARK_FAILED_SAFE"] },
        worker: { properties: { nodeType: { const: "LOCAL" } } },
      },
    }),
    outputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-worker-lifecycle-recorded.v1" },
        runtimeId: { const: "research_deep_research_worker_lifecycle_runtime" },
      },
    }),
    inputExample: JSON.stringify({
      lifecycleAction: "CLAIM",
      worker: { nodeType: "LOCAL" },
      executionPlan: { executeNow: false },
    }),
    outputExample: JSON.stringify({
      status: "CLAIMED_FOR_ASYNC_EXECUTION",
      boundary: { executionStarted: false, finalAnswerGenerated: false },
    }),
    runtime: [
      'export const RESEARCH_DEEP_RESEARCH_WORKER_LIFECYCLE_RUNTIME_ID = "research_deep_research_worker_lifecycle_runtime";',
      'export const RESEARCH_DEEP_RESEARCH_WORKER_COMMAND_PORT = "DeepResearchWorkerCommandPort.recordDeepResearchWorkerLifecycle";',
      "RESEARCH_DEEP_RESEARCH_WORKER_LIFECYCLE",
      "recordDeepResearchWorkerLifecycle",
      "CLAIMED_FOR_ASYNC_EXECUTION",
      "FAILED_SAFE_RECORDED",
      "input.approvedIntent.decision",
      "ACCEPTED_ASYNC",
      "input.approval.decision",
      "APPROVED_FOR_ASYNC",
      "input.worker.nodeType",
      "LOCAL",
      "input.executionPlan.executeNow",
      "input.executionPlan.startRagRetrievalNow",
      "input.executionPlan.startExternalModelCallNow",
      "input.executionPlan.finalAnswerNowAllowed",
      "input.sourcePolicy.includeStudentArchive",
      "input.sourcePolicy.includeRemoteDeviceSources",
      "requiresFutureExecutionSlice: true",
    ].join("\n"),
    runtimeTest: [
      "records an approved async job claim without starting retrieval, model calls, or final answers",
      "uses the idempotency key for safe replay and rejects conflicting replay",
      "rejects unapproved or pending-review intents before worker claim",
      "rejects unsafe principals, remote/cloud workers, direct writes, and baseline AI dependencies",
      "rejects execution, RAG retrieval, model calls, publication, local mutation, Swarm, and student archive use now",
      "records a failed-safe lifecycle projection without publishing partial artifacts",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:research-deep-research-worker-lifecycle": "node tools/research-deep-research-worker-lifecycle-audit.mjs --out reports/research-deep-research-worker-lifecycle.current.json",
      },
    }),
    qualityGate: "Research deep_research worker lifecycle audit",
    rootWorkflowCoverage: [
      "researchDeepResearchWorkerLifecycle",
      "research-deep-research-worker-lifecycle.current.json",
      "research_deep_research_worker_lifecycle_runtime",
    ].join("\n"),
    verifyStructure: [
      "0243-research-deep-research-worker-lifecycle.md",
      "deep-research-worker-lifecycle.input.schema.json",
      "deep-research-worker-lifecycle.output.schema.json",
      "research-deep-research-worker-lifecycle-runtime.mjs",
      "research-deep-research-worker-lifecycle-runtime.test.mjs",
      "research-deep-research-worker-lifecycle-audit.mjs",
      "research-deep-research-worker-lifecycle-audit.test.mjs",
    ].join("\n"),
    architectureBoard: "ResearchAgent.deep_research 异步 worker 生命周期 8.3/10",
    sdd: [
      "worker lifecycle",
      "does not start RAG retrieval",
      "does not call models",
      "does not generate a final answer",
      "future approved async execution slice",
    ].join("\n"),
  };
}
