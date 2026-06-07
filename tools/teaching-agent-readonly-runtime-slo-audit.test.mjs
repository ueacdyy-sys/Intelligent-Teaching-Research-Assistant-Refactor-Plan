import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditTeachingAgentReadonlyRuntimeSlo,
  formatTeachingAgentReadonlyRuntimeSloAudit,
} from "./teaching-agent-readonly-runtime-slo-audit.mjs";

describe("TeachingAgent read-only runtime SLO audit", () => {
  it("passes when the adapter contract is ready and the Teaching Archive read phase is under 50ms", () => {
    const report = auditTeachingAgentReadonlyRuntimeSlo(currentInputs(), {
      generatedAt: "2026-06-04T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "TEACHING_AGENT_READONLY_RUNTIME_SLO");
    assert.equal(report.runtimeSlo.sourcePhase, "listArchiveItems");
    assert.equal(report.runtimeSlo.p99Ms, 11);
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.safetyInvariants.adapterContractReady, true);
    assert.match(formatTeachingAgentReadonlyRuntimeSloAudit(report), /TeachingAgent read-only runtime SLO: READY/u);
  });

  it("fails when the adapter contract is not ready", () => {
    const inputs = currentInputs();
    inputs.agentSkillReport.summary.teachingReadOnlyAdapter.readPortReady = false;

    const report = auditTeachingAgentReadonlyRuntimeSlo(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "contract.adapter_ready").passed, false);
  });

  it("fails when the Teaching Archive read phase has errors", () => {
    const inputs = currentInputs();
    inputs.teachingArchiveReport.phases.listArchiveItems.errors = 1;

    const report = auditTeachingAgentReadonlyRuntimeSlo(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.errors_zero").passed, false);
  });

  it("fails when the Teaching Archive read phase exceeds the P99 target", () => {
    const inputs = currentInputs();
    inputs.teachingArchiveReport.phases.listArchiveItems.latencyMs.p99 = 55;

    const report = auditTeachingAgentReadonlyRuntimeSlo(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.p99_within_target").passed, false);
  });
});

function currentInputs() {
  return {
    agentSkillReport: {
      readiness: "READY",
      summary: {
        teachingReadOnlySkill: {
          skillId: "search_teaching_material",
          schemaRefsReady: true,
          inputBoundaryReady: true,
          outputBoundaryReady: true,
        },
        teachingReadOnlyAdapter: {
          adapterId: "teaching_agent_search_material_readonly_adapter",
          readPortReady: true,
          guardsReady: true,
          evidenceSloReady: true,
        },
      },
    },
    teachingArchiveReport: {
      status: "PASSED",
      benchmarkKind: "teaching_archive_gateway",
      workloadType: "HTTP_BENCHMARK",
      phases: {
        listArchiveItems: {
          operations: 4,
          errors: 0,
          rps: 222.22,
          latencyMs: { p95: 11, p99: 11 },
        },
      },
    },
  };
}
