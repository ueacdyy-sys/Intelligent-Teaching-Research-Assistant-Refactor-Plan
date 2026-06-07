import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditResearchAgentReadonlyRuntimeAdapter,
  formatResearchAgentReadonlyRuntimeAdapterAudit,
} from "./research-agent-readonly-runtime-adapter-audit.mjs";

describe("ResearchAgent read-only runtime adapter audit", () => {
  it("passes when the real adapter is read-only, policy-scoped, injected, and root-tracked", async () => {
    const report = await auditResearchAgentReadonlyRuntimeAdapter(currentInputs(), {
      generatedAt: "2026-06-05T11:00:00.000Z",
      probeP99Ms: 3,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "RESEARCH_AGENT_READONLY_RUNTIME_ADAPTER");
    assert.equal(report.adapter.readPort, "KnowledgeQueryReadPort.searchKnowledge");
    assert.equal(report.runtimeSlo.p99Ms, 3);
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeProbes.invoke.status, "PASS");
    assert.match(formatResearchAgentReadonlyRuntimeAdapterAudit(report), /ResearchAgent read-only runtime adapter: READY/u);
  });

  it("fails when the adapter contract can write through the read port", async () => {
    const inputs = currentInputs();
    const adapter = JSON.parse(inputs.adapterExample);
    adapter.readPort.writeOperationAllowed = true;
    inputs.adapterExample = JSON.stringify(adapter);

    const report = await auditResearchAgentReadonlyRuntimeAdapter(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "contract.adapter_identity_and_read_port").passed, false);
  });

  it("fails when skill boundaries allow synthesis", async () => {
    const inputs = currentInputs();
    const inputSchema = JSON.parse(inputs.skillInputSchema);
    inputSchema.properties.synthesisAllowed.const = true;
    inputs.skillInputSchema = JSON.stringify(inputSchema);

    const report = await auditResearchAgentReadonlyRuntimeAdapter(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "contract.skill_input_output_boundaries").passed, false);
  });

  it("fails when runtime code claims student archive access or direct SQL", async () => {
    const inputs = currentInputs();
    inputs.runtime += "\nconst sql = 'SELECT * FROM student_archive'; const studentArchiveReturned = true;\n";

    const report = await auditResearchAgentReadonlyRuntimeAdapter(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.no_side_effects_direct_db_model_or_student_archive").passed, false);
  });

  it("fails when quality gate registration is missing", async () => {
    const inputs = currentInputs();
    const packageJson = JSON.parse(inputs.packageJson);
    delete packageJson.scripts["audit:research-agent-readonly-runtime-adapter"];
    inputs.packageJson = JSON.stringify(packageJson);

    const report = await auditResearchAgentReadonlyRuntimeAdapter(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_tracks_runtime_adapter").passed, false);
  });

  it("fails when root workflow coverage does not require the adapter report", async () => {
    const inputs = currentInputs();
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("researchAgentReadonlyRuntimeAdapter", "missingResearchAdapter");

    const report = await auditResearchAgentReadonlyRuntimeAdapter(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_runtime_adapter_report").passed, false);
  });
});

function currentInputs() {
  return {
    adapterSchema: JSON.stringify(adapterSchema()),
    adapterExample: JSON.stringify(adapterExample()),
    skillInputSchema: JSON.stringify(skillInputSchema()),
    skillOutputSchema: JSON.stringify(skillOutputSchema()),
    runtime: [
      "readPort.searchKnowledge",
      "buildReadPortRequest",
      "assertPrincipalContext",
      "assertSharedContext",
      "assertGuardrailResult",
      "assertRouteDecision",
      "requireConst(sharedContext.dataScopes.teaching, \"NONE\"",
      "requireConst(sharedContext.dataScopes.student, \"NONE\"",
      "requireConst(sharedContext.dataScopes.research, \"READ\"",
      "requireConst(sharedContext.dataScopes.knowledge, \"PRIVATE_ASSIGNED\"",
      "requireConst(sharedContext.dataScopes.tool ?? sharedContext.dataScopes.localTool, \"NONE\"",
      "requireConst(guardrailResult.decision, \"ALLOW\"",
      "requireConst(routeDecision.mode, \"SINGLE_WORKER\"",
      "directDatabaseAccessAllowed: false",
      "writeOperationAllowed: false",
      "studentArchiveReturned: false",
      "studentDataReturned: false",
      "returnedWithinPolicy: true",
      "externalModelUsed: false",
      "localToolMutationAllowed: false",
    ].join("\n"),
    runtimeTest: [
      "invokes the injected read port and maps policy-scoped knowledge results",
      "returns NO_MATCH",
      "rejects write, student archive, external model, and synthesis requests",
      "enforces research, private knowledge, and remote device principal scopes",
      "rejects unsafe SharedContext scopes",
      "rejects guardrail deny and wrong route decisions",
      "requires an injected read port and rejects unsafe rows",
      "truncates results and snippets",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:research-agent-readonly-runtime-adapter": "node tools/research-agent-readonly-runtime-adapter-audit.mjs --out reports/research-agent-readonly-runtime-adapter.current.json",
      },
    }),
    qualityGate: "ResearchAgent read-only runtime adapter audit",
    rootWorkflowCoverage: [
      "researchAgentReadonlyRuntimeAdapter",
      "research-agent-readonly-runtime-adapter.current.json",
      "[\"researchAgentReadonlyRuntimeAdapter\", \"READY\"]",
      "research_agent_readonly_runtime_adapter",
    ].join("\n"),
    verifyStructure: [
      "research-agent-readonly-runtime-adapter.mjs",
      "research-agent-readonly-runtime-adapter.test.mjs",
      "research-agent-readonly-runtime-adapter-audit.mjs",
      "research-agent-readonly-runtime-adapter-audit.test.mjs",
      "0240-research-agent-readonly-runtime-adapter.md",
    ].join("\n"),
  };
}

function adapterSchema() {
  return {
    properties: {
      adapterId: { const: "research_agent_search_knowledge_readonly_adapter" },
      workerAgent: { const: "ResearchAgent" },
      skillId: { const: "search_knowledge" },
      routeMode: { const: "SINGLE_WORKER" },
    },
  };
}

function adapterExample() {
  return {
    adapterId: "research_agent_search_knowledge_readonly_adapter",
    workerAgent: "ResearchAgent",
    skillId: "search_knowledge",
    routeMode: "SINGLE_WORKER",
    readPort: {
      portName: "KnowledgeQueryReadPort",
      operation: "searchKnowledge",
      directDatabaseAccessAllowed: false,
      writeOperationAllowed: false,
    },
  };
}

function skillInputSchema() {
  return {
    properties: {
      writeIntent: { const: false },
      studentDataAccess: { const: "NONE" },
      externalModelAllowed: { const: false },
      synthesisAllowed: { const: false },
      latencyBudgetMs: { maximum: 50 },
      filters: {
        properties: {
          includeStudentArchive: { const: false },
        },
      },
    },
  };
}

function skillOutputSchema() {
  return {
    properties: {
      safety: {
        properties: {
          directDatabaseWriteAllowed: { const: false },
          studentArchiveReturned: { const: false },
          studentDataReturned: { const: false },
          returnedWithinPolicy: { const: true },
          externalModelUsed: { const: false },
          localToolMutationAllowed: { const: false },
        },
      },
    },
  };
}
