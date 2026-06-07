import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditAgentReadonlyRuntimeDispatcher,
  formatAgentReadonlyRuntimeDispatcherAudit,
} from "./agent-readonly-runtime-dispatcher-audit.mjs";

describe("Agent read-only runtime dispatcher audit", () => {
  it("passes when the dispatcher exposes three read-only fast paths and invokes all three adapters for real", async () => {
    const report = await auditAgentReadonlyRuntimeDispatcher(currentInputs(), {
      generatedAt: "2026-06-04T00:00:00.000Z",
      probeP99Ms: 3,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "AGENT_READONLY_RUNTIME_DISPATCHER");
    assert.equal(report.dispatcher.adapterCount, 3);
    assert.equal(report.runtimeSlo.p99Ms, 11);
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeInvocation.status, "PASS");
    assert.equal(report.runtimeInvocation.probes.teachingAgentSearchTeachingMaterial.output.workerAgent, "TeachingAgent");
    assert.equal(report.runtimeInvocation.probes.teachingAgentSearchTeachingMaterial.output.skillOutput.decision, "FOUND");
    assert.equal(report.runtimeInvocation.probes.studentTutorRecommendPractice.output.workerAgent, "StudentTutorAgent");
    assert.equal(report.runtimeInvocation.probes.studentTutorRecommendPractice.output.skillOutput.decision, "FOUND");
    assert.equal(report.runtimeInvocation.probes.researchAgentSearchKnowledge.output.workerAgent, "ResearchAgent");
    assert.equal(report.runtimeInvocation.probes.researchAgentSearchKnowledge.output.skillOutput.decision, "FOUND");
    assert.equal(report.safetyInvariants.swarmAllowed, false);
    assert.match(formatAgentReadonlyRuntimeDispatcherAudit(report), /Agent read-only runtime dispatcher: READY/u);
  });

  it("fails when an unsafe boundary enables writes", async () => {
    const inputs = currentInputs();
    inputs.dispatcherExample.dispatchBoundary.writeIntentAllowed = true;

    const report = await auditAgentReadonlyRuntimeDispatcher(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "dispatcher.boundary_readonly_only").passed, false);
  });

  it("fails when a read-only adapter is missing", async () => {
    const inputs = currentInputs();
    inputs.dispatcherExample.adapters = inputs.dispatcherExample.adapters.filter((adapter) =>
      adapter.workerAgent !== "ResearchAgent"
    );

    const report = await auditAgentReadonlyRuntimeDispatcher(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "dispatcher.adapters_allowlist").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "runtime.components_ready").passed, false);
  });

  it("fails when a component P99 exceeds the aggregate target", async () => {
    const inputs = currentInputs();
    inputs.studentTutorRuntimeSlo.runtimeSlo.p99Ms = 51;

    const report = await auditAgentReadonlyRuntimeDispatcher(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.aggregate_p99_within_target").passed, false);
  });

  it("fails when a component reports errors", async () => {
    const inputs = currentInputs();
    inputs.teachingRuntimeSlo.runtimeSlo.totalErrors = 1;

    const report = await auditAgentReadonlyRuntimeDispatcher(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.aggregate_errors_zero").passed, false);
  });

  it("fails when full Agent Loop or Swarm claims are enabled", async () => {
    const inputs = currentInputs();
    inputs.dispatcherExample.promotion.fullSwarmClaimAllowed = true;

    const report = await auditAgentReadonlyRuntimeDispatcher(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "promotion.no_full_agent_claims").passed, false);
  });

  it("fails when the real runtime dispatcher is no longer wired to TeachingAgent", async () => {
    const inputs = currentInputs();
    inputs.runtime = inputs.runtime.replace("TeachingAgent.search_teaching_material", "TeachingAgent.missing_skill");

    const report = await auditAgentReadonlyRuntimeDispatcher(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.implementation_boundary_scanned").passed, false);
  });
});

function currentInputs() {
  return {
    dispatcherSchema: {
      properties: {
        schemaVersion: { const: "2026-06-04.agent.readonly-runtime-dispatcher.v1" },
        dispatcherId: { const: "agent_readonly_runtime_dispatcher" },
        routeMode: { const: "SINGLE_WORKER_ONLY" },
      },
    },
    dispatcherExample: dispatcherExample(),
    teachingRuntimeSlo: runtimeSloReport(11),
    studentTutorRuntimeSlo: runtimeSloReport(11),
    researchRuntimeSlo: runtimeSloReport(2.55),
    runtime: [
      "implementedRuntimeAdapters",
      "TeachingAgent.search_teaching_material",
      "StudentTutorAgent.recommend_practice",
      "invokeStudentTutorRecommendPractice",
      "ResearchAgent.search_knowledge",
      "invokeResearchAgentSearchKnowledge",
      "dispatchAgentReadonlyRuntime",
      "writeOperationAllowed: false",
      "directDatabaseAccessAllowed: false",
      "externalModelCallAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
    ].join("\n"),
    runtimeTest: [
      "dispatches TeachingAgent search_teaching_material to the real runtime adapter",
      "dispatches StudentTutorAgent recommend_practice to the real runtime adapter",
      "dispatches ResearchAgent search_knowledge to the real runtime adapter",
      "rejects write intent before the read port is called",
      "rejects Swarm routes and multi-worker route decisions",
      "rejects unknown workers and skills outside the dispatcher allowlist",
      "rejects research synthesis requests before the read port is called",
      "rejects external model or local tool mutation requests",
    ].join("\n"),
  };
}

function dispatcherExample() {
  return {
    schemaVersion: "2026-06-04.agent.readonly-runtime-dispatcher.v1",
    dispatcherId: "agent_readonly_runtime_dispatcher",
    routeMode: "SINGLE_WORKER_ONLY",
    adapters: [
      {
        workerAgent: "TeachingAgent",
        skillId: "search_teaching_material",
        adapterRef: "contracts/agent/teaching-agent-readonly-adapter.example.json",
        runtimeSloReportRef: "reports/teaching-agent-readonly-runtime-slo.current.json",
        inputSchemaRef: "contracts/agent/skills/search-teaching-material.input.schema.json",
        outputSchemaRef: "contracts/agent/skills/search-teaching-material.output.schema.json",
        readPort: {
          portName: "TeachingArchiveReadPort",
          operation: "searchTeachingMaterials",
          directDatabaseAccessAllowed: false,
          writeOperationAllowed: false,
        },
        targetP99Ms: 50,
      },
      {
        workerAgent: "StudentTutorAgent",
        skillId: "recommend_practice",
        adapterRef: "contracts/agent/student-tutor-agent-readonly-adapter.example.json",
        runtimeSloReportRef: "reports/student-tutor-agent-readonly-runtime-slo.current.json",
        inputSchemaRef: "contracts/agent/skills/recommend-practice.input.schema.json",
        outputSchemaRef: "contracts/agent/skills/recommend-practice.output.schema.json",
        readPort: {
          portName: "StudentLearningReadPort",
          operation: "recommendPracticeContext",
          directDatabaseAccessAllowed: false,
          writeOperationAllowed: false,
        },
        targetP99Ms: 50,
      },
      {
        workerAgent: "ResearchAgent",
        skillId: "search_knowledge",
        adapterRef: "contracts/agent/research-agent-readonly-adapter.example.json",
        runtimeSloReportRef: "reports/research-agent-readonly-runtime-slo.current.json",
        inputSchemaRef: "contracts/agent/skills/search-knowledge.input.schema.json",
        outputSchemaRef: "contracts/agent/skills/search-knowledge.output.schema.json",
        readPort: {
          portName: "KnowledgeQueryReadPort",
          operation: "searchKnowledge",
          directDatabaseAccessAllowed: false,
          writeOperationAllowed: false,
        },
        targetP99Ms: 50,
      },
    ],
    dispatchBoundary: {
      writeIntentAllowed: false,
      directDatabaseAccessAllowed: false,
      externalModelCallAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      deepResearchAllowed: false,
      finalEvaluationAllowed: false,
      rejectionMode: "DENY_WITH_EVIDENCE",
    },
    admissionGuards: {
      principalContextRequired: true,
      sharedContextRequired: true,
      guardrailResultRequired: true,
      adapterAllowlistRequired: true,
      denyUnknownSkill: true,
      denyOnWriteIntent: true,
      denyOnCrossScopeData: true,
      denyOnExternalModelRequest: true,
      denyOnLocalToolMutation: true,
    },
    evidence: {
      routeDecisionRequired: true,
      skillInvocationTraceRequired: true,
      inputHashRequired: true,
      outputSummaryRequired: true,
      adapterDecisionRequired: true,
      sourceSloReportRequired: true,
      runtimeTimingRequired: true,
    },
    aggregateSlo: {
      p99BudgetMs: 50,
      aggregateStrategy: "MAX_COMPONENT_P99",
      requiredZeroErrors: true,
      minComponentCount: 3,
    },
    promotion: {
      currentEvidenceClass: "AGGREGATED_RUNTIME_SLO_FROM_READONLY_FAST_PATHS",
      rootWorkflowRequired: true,
      fullAgentLoopClaimAllowed: false,
      fullSwarmClaimAllowed: false,
      modelReasoningClaimAllowed: false,
    },
  };
}

function runtimeSloReport(p99Ms) {
  return {
    readiness: "READY",
    runtimeSlo: {
      p99Ms,
      totalErrors: 0,
    },
  };
}
