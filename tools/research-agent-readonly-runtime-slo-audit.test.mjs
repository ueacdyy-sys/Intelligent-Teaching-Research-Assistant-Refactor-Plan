import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditResearchAgentReadonlyRuntimeSlo,
  formatResearchAgentReadonlyRuntimeSloAudit,
} from "./research-agent-readonly-runtime-slo-audit.mjs";

describe("ResearchAgent read-only runtime SLO audit", () => {
  it("passes when contracts are ready and knowledge retrieval planning is under 50ms", () => {
    const report = auditResearchAgentReadonlyRuntimeSlo(currentInputs(), {
      generatedAt: "2026-06-04T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "RESEARCH_AGENT_READONLY_RUNTIME_SLO");
    assert.equal(report.runtimeSlo.sourcePhase, "knowledgeRetrievalQueryPlan");
    assert.equal(report.runtimeSlo.p95Ms, 2.55);
    assert.equal(report.runtimeSlo.p99Ms, 2.55);
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.match(formatResearchAgentReadonlyRuntimeSloAudit(report), /ResearchAgent read-only runtime SLO: READY/u);
  });

  it("fails when the contract report is not ready", () => {
    const inputs = currentInputs();
    inputs.contractReport.summary.researchReadOnlyAdapter.readPortReady = false;

    const report = auditResearchAgentReadonlyRuntimeSlo(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "contract.adapter_ready").passed, false);
  });

  it("fails when the knowledge retrieval report has classification leakage", () => {
    const inputs = currentInputs();
    inputs.knowledgeRetrievalReport.findings = inputs.knowledgeRetrievalReport.findings.map((finding) =>
      finding.id === "benchmark.no_cross_classification_leakage" ? { ...finding, passed: false } : finding,
    );

    const report = auditResearchAgentReadonlyRuntimeSlo(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.knowledge_retrieval_ready").passed, false);
  });

  it("fails when query planning exceeds the fast-path P99 proxy target", () => {
    const inputs = currentInputs();
    inputs.knowledgeRetrievalReport.benchmark.metrics.maxQueryPlanMs = 55;

    const report = auditResearchAgentReadonlyRuntimeSlo(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.p99_proxy_within_target").passed, false);
  });
});

function currentInputs() {
  return {
    contractReport: {
      readiness: "READY",
      summary: {
        researchReadOnlySkill: {
          skillId: "search_knowledge",
          schemaRefsReady: true,
          inputBoundaryReady: true,
          outputBoundaryReady: true,
        },
        researchReadOnlyAdapter: {
          adapterId: "research_agent_search_knowledge_readonly_adapter",
          readPortReady: true,
          guardsReady: true,
          evidenceSloReady: true,
        },
      },
    },
    knowledgeRetrievalReport: {
      readiness: "READY",
      benchmark: {
        metrics: {
          totalPlans: 256,
          p95QueryPlanMs: 2.55,
          maxQueryPlanMs: 2.55,
        },
      },
      findings: [
        {
          id: "benchmark.no_cross_classification_leakage",
          passed: true,
        },
      ],
    },
  };
}
