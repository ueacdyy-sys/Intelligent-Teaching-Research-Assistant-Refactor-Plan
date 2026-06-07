import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditResearchDeepResearchIntentRuntime,
  formatResearchDeepResearchIntentAudit,
} from "./research-deep-research-intent-audit.mjs";

describe("Research deep_research intent runtime audit", () => {
  it("passes when the deep_research intent runtime is admission-only and reviewable", async () => {
    const report = await auditResearchDeepResearchIntentRuntime(currentInputs(), {
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "RESEARCH_DEEP_RESEARCH_INTENT_RUNTIME");
    assert.equal(report.runtime.runtimeId, "research_deep_research_intent_runtime");
    assert.equal(report.runtime.asyncQueue, "research_deep_research");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    assert.equal(report.runtimeProbes.submit.output.job.reviewRequired, true);
    assert.equal(report.runtimeProbes.submit.output.safety.finalAnswerGenerated, false);
    assert.match(formatResearchDeepResearchIntentAudit(report), /Research deep_research intent runtime: READY/u);
  });

  it("fails when the runtime claims a synchronous final answer path", async () => {
    const inputs = currentInputs();
    inputs.runtime = inputs.runtime.replace("decision: portResult.status", "decision: portResult.status\nfinalAnswerGenerated: true");

    const report = await auditResearchDeepResearchIntentRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "contract.async_review_only_boundaries").passed, false);
  });

  it("caps the probe p99 at the admission budget ceiling", async () => {
    const report = await auditResearchDeepResearchIntentRuntime(currentInputs(), {
      probeP99Ms: 55,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when quality or structure hooks omit the new runtime slice", async () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage
      .replaceAll("researchDeepResearchIntent", "researchDeepResearchJob")
      .replace("research-deep-research-intent.current.json", "research-deep-research-job.current.json")
      .replace("research_deep_research_intent_runtime", "research_deep_research_job_runtime");

    const report = await auditResearchDeepResearchIntentRuntime(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_tracks_runtime").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_runtime_report").passed, false);
  });
});

function currentInputs() {
  return {
    inputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-intent.invoke.v1" },
        sourcePolicy: { properties: { includeStudentArchive: { const: false } } },
        asyncPolicy: { properties: { queueName: { const: "research_deep_research" } } },
      },
    }),
    outputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-intent.output.v1" },
        decision: { enum: ["PENDING_REVIEW", "ACCEPTED_ASYNC"] },
      },
    }),
    inputExample: JSON.stringify({
      schemaVersion: "2026-06-05.research.deep-research-intent.invoke.v1",
      asyncPolicy: { queueName: "research_deep_research", executeAsyncNow: false },
      sourcePolicy: { includeStudentArchive: false },
    }),
    outputExample: JSON.stringify({
      schemaVersion: "2026-06-05.research.deep-research-intent.output.v1",
      decision: "PENDING_REVIEW",
      job: { queueName: "research_deep_research" },
      safety: { finalAnswerGenerated: false },
    }),
    runtime: [
      'export const RESEARCH_DEEP_RESEARCH_INTENT_RUNTIME_ID = "research_deep_research_intent_runtime";',
      'export const RESEARCH_DEEP_RESEARCH_INTENT_PORT = "DeepResearchIntentPort.submitDeepResearchIntent";',
      'const allowedStatuses = new Set(["PENDING_REVIEW", "ACCEPTED_ASYNC"]);',
      'skillId: "deep_research",',
      'requireConst(agentTask.requiresHumanApproval, true, "input.agentTask.requiresHumanApproval");',
      'requireConst(guardrailResult.decision, "APPROVAL_REQUIRED", "input.guardrailResult.decision");',
      'requireConst(asyncPolicy.executeAsyncNow, false, "input.asyncPolicy.executeAsyncNow");',
      'requireConst(asyncPolicy.externalModelCallNowAllowed, false, "input.asyncPolicy.externalModelCallNowAllowed");',
      'requireConst(asyncPolicy.ragSynthesisNowAllowed, false, "input.asyncPolicy.ragSynthesisNowAllowed");',
      'requireConst(asyncPolicy.finalAnswerNowAllowed, false, "input.asyncPolicy.finalAnswerNowAllowed");',
      'requireConst(asyncPolicy.directPublicationAllowed, false, "input.asyncPolicy.directPublicationAllowed");',
      'requireConst(asyncPolicy.localToolMutationAllowed, false, "input.asyncPolicy.localToolMutationAllowed");',
      'requireConst(asyncPolicy.humanReviewRequiredBeforeExecution, true, "input.asyncPolicy.humanReviewRequiredBeforeExecution");',
      'requireConst(sourcePolicy.includeStudentArchive, false, "input.sourcePolicy.includeStudentArchive");',
      'requireConst(sourcePolicy.includeRemoteDeviceSources, false, "input.sourcePolicy.includeRemoteDeviceSources");',
      'requireConst(sourcePolicy.directDatabaseAccessAllowed, false, "input.sourcePolicy.directDatabaseAccessAllowed");',
      'decision: portResult.status',
    ].join("\n"),
    runtimeTest: [
      "submits a reviewable async deep_research intent through the injected port",
      "accepts async admission without starting execution or synthesis",
      "rejects write intent, missing approval, high risk, and Swarm before the port is called",
      "rejects immediate execution, model calls, synthesis, publication, and local mutation",
      "enforces principal and SharedContext research boundaries",
      "requires approval guardrails and a ResearchAgent deep_research route",
      "rejects student archive, remote device sources, direct database access, and bad budgets",
      "requires an injected intent port and rejects unsafe port results",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:research-deep-research-intent-runtime": "node tools/research-deep-research-intent-audit.mjs --out reports/research-deep-research-intent.current.json",
      },
    }),
    qualityGate: "Research deep_research intent runtime audit",
    rootWorkflowCoverage: [
      "researchDeepResearchIntent",
      "research-deep-research-intent.current.json",
      "research_deep_research_intent_runtime",
      "[\"researchDeepResearchIntent\", \"READY\"]",
    ].join("\n"),
    verifyStructure: [
      "research-deep-research-intent-runtime.mjs",
      "research-deep-research-intent-runtime.test.mjs",
      "research-deep-research-intent-audit.mjs",
      "research-deep-research-intent-audit.test.mjs",
      "0242-research-deep-research-intent-runtime.md",
    ].join("\n"),
    architectureBoard: "ResearchAgent.deep_research 异步受控意图运行时 8.3/10",
    sdd: [
      "deep_research",
      "admission-only",
      "does not implement full RAG synthesis",
      "does not produce a final answer",
    ].join("\n"),
  };
}
