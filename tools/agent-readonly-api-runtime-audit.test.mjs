import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditAgentReadonlyApiRuntime,
  formatAgentReadonlyApiRuntimeAudit,
} from "./agent-readonly-api-runtime-audit.mjs";

describe("Agent read-only API runtime audit", () => {
  it("passes when the API runtime wraps the dispatcher and probes all read-only routes", async () => {
    const report = await auditAgentReadonlyApiRuntime(currentInputs(), {
      generatedAt: "2026-06-05T00:00:00.000Z",
      probeP99Ms: 3,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "AGENT_READONLY_API_RUNTIME");
    assert.equal(report.runtimeSlo.p99Ms, 13);
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeInvocation.status, "PASS");
    assert.equal(report.runtimeInvocation.probes.teaching.output.workerAgent, "TeachingAgent");
    assert.equal(report.runtimeInvocation.probes.studentTutor.output.workerAgent, "StudentTutorAgent");
    assert.equal(report.runtimeInvocation.probes.research.output.workerAgent, "ResearchAgent");
    assert.equal(report.safetyInvariants.fullAgentLoopAllowed, false);
    assert.match(formatAgentReadonlyApiRuntimeAudit(report), /Agent read-only API runtime: READY/u);
  });

  it("fails when the runtime bypasses the dispatcher and imports an adapter directly", async () => {
    const inputs = currentInputs();
    inputs.runtime += "\ninvokeResearchAgentSearchKnowledge";

    const report = await auditAgentReadonlyApiRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.dispatcher_only_boundary").passed, false);
  });

  it("fails when the source dispatcher evidence is not ready", async () => {
    const inputs = currentInputs();
    inputs.dispatcherReport = JSON.stringify({
      readiness: "NEEDS_REMEDIATION",
      runtimeSlo: { p99Ms: 13, totalErrors: 0 },
    });

    const report = await auditAgentReadonlyApiRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.source_dispatcher_ready").passed, false);
  });

  it("fails when the source dispatcher exceeds the target", async () => {
    const inputs = currentInputs();
    inputs.dispatcherReport = JSON.stringify({
      readiness: "READY",
      runtimeSlo: { p99Ms: 55, totalErrors: 0 },
    });

    const report = await auditAgentReadonlyApiRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.source_dispatcher_ready").passed, false);
  });

  it("fails when package scripts or strict quality omit the API runtime audit", async () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });

    const report = await auditAgentReadonlyApiRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_tracks_api_runtime").passed, false);
  });

  it("fails when root workflow coverage no longer requires the API runtime report", async () => {
    const inputs = currentInputs();
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("agentReadonlyApiRuntime", "agentReadonlyApiRuntimeMissing");

    const report = await auditAgentReadonlyApiRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_api_runtime_report").passed, false);
  });

  it("fails when structure verification omits the API runtime slice", async () => {
    const inputs = currentInputs();
    inputs.verifyStructure = "";

    const report = await auditAgentReadonlyApiRuntime(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality.structure_tracks_api_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    dispatcherReport: JSON.stringify({
      readiness: "READY",
      runtimeSlo: { p99Ms: 13, totalErrors: 0 },
    }),
    runtime: [
      "dispatchAgentReadonlyRuntime",
      "AGENT_READONLY_RUNTIME_DISPATCHER_ID",
      "buildDispatchInput",
      "buildDispatcherDeps",
      "assertAgentTask",
      "assertPrincipalContext",
      "assertSharedContext",
      "assertRouteDecision",
      "assertGuardrailResult",
      "assertSkillInput",
      "TEACHING",
      "STUDENT_TUTORING",
      "RESEARCH",
      "requiresHumanApproval",
      "preferSingleWorker",
      "swarmRequiredWhen",
      "writeOperationAllowed: false",
      "directDatabaseAccessAllowed: false",
      "externalModelCallAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "fullAgentLoopAllowed: false",
      "humanApprovalRequired: false",
    ].join("\n"),
    runtimeTest: [
      "dispatches a Teaching AgentTask through the read-only dispatcher",
      "dispatches a StudentTutor AgentTask through the read-only dispatcher",
      "dispatches a Research AgentTask through the read-only dispatcher",
      "rejects write intent before any read port is called",
      "rejects unsupported task kinds before any read port is called",
      "rejects Swarm and route or skill mismatches at the API boundary",
      "rejects unsafe guardrails, external model calls, and local tool mutation",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:agent-readonly-api-runtime": "node tools/agent-readonly-api-runtime-audit.mjs --out reports/agent-readonly-api-runtime.current.json",
      },
    }),
    qualityGate: "Agent read-only API runtime audit",
    rootWorkflowCoverage: [
      "agentReadonlyApiRuntime",
      "agent-readonly-api-runtime.current.json",
      "[\"agentReadonlyApiRuntime\", \"READY\"]",
      "agent_readonly_api_runtime",
    ].join("\n"),
    verifyStructure: [
      "0241-agent-readonly-api-runtime.md",
      "agent-readonly-api-runtime.mjs",
      "agent-readonly-api-runtime.test.mjs",
      "agent-readonly-api-runtime-audit.mjs",
      "agent-readonly-api-runtime-audit.test.mjs",
    ].join("\n"),
  };
}
