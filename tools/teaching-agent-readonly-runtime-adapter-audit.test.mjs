import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditTeachingAgentReadonlyRuntimeAdapter,
  formatTeachingAgentReadonlyRuntimeAdapterAudit,
} from "./teaching-agent-readonly-runtime-adapter-audit.mjs";

describe("TeachingAgent read-only runtime adapter audit", () => {
  it("passes when the real adapter is read-only, injected, and root-tracked", async () => {
    const report = await auditTeachingAgentReadonlyRuntimeAdapter(currentInputs(), {
      generatedAt: "2026-06-05T09:00:00.000Z",
      probeP99Ms: 3,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "TEACHING_AGENT_READONLY_RUNTIME_ADAPTER");
    assert.equal(report.adapter.readPort, "TeachingArchiveReadPort.searchTeachingMaterials");
    assert.equal(report.runtimeSlo.p99Ms, 3);
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeProbes.invoke.status, "PASS");
    assert.match(formatTeachingAgentReadonlyRuntimeAdapterAudit(report), /TeachingAgent read-only runtime adapter: READY/u);
  });

  it("fails when the adapter contract can write through the read port", async () => {
    const inputs = currentInputs();
    const adapter = JSON.parse(inputs.adapterExample);
    adapter.readPort.writeOperationAllowed = true;
    inputs.adapterExample = JSON.stringify(adapter);

    const report = await auditTeachingAgentReadonlyRuntimeAdapter(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "contract.adapter_identity_and_read_port").passed, false);
  });

  it("fails when skill boundaries allow student archive access", async () => {
    const inputs = currentInputs();
    const inputSchema = JSON.parse(inputs.skillInputSchema);
    inputSchema.properties.filters.properties.includeStudentArchive.const = true;
    inputs.skillInputSchema = JSON.stringify(inputSchema);

    const report = await auditTeachingAgentReadonlyRuntimeAdapter(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "contract.skill_input_output_boundaries").passed, false);
  });

  it("fails when runtime code claims file writes or direct SQL", async () => {
    const inputs = currentInputs();
    inputs.runtime += "\nfs.writeFileSync('x', 'y'); const sql = 'SELECT * FROM archive_items';\n";

    const report = await auditTeachingAgentReadonlyRuntimeAdapter(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.no_side_effects_direct_db_or_model_calls").passed, false);
  });

  it("fails when quality gate registration is missing", async () => {
    const inputs = currentInputs();
    const packageJson = JSON.parse(inputs.packageJson);
    delete packageJson.scripts["audit:teaching-agent-readonly-runtime-adapter"];
    inputs.packageJson = JSON.stringify(packageJson);

    const report = await auditTeachingAgentReadonlyRuntimeAdapter(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_tracks_runtime_adapter").passed, false);
  });

  it("fails when root workflow coverage does not require the adapter report", async () => {
    const inputs = currentInputs();
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("teachingAgentReadonlyRuntimeAdapter", "missingTeachingAdapter");

    const report = await auditTeachingAgentReadonlyRuntimeAdapter(inputs);

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
      "readPort.searchTeachingMaterials",
      "buildReadPortRequest",
      "assertPrincipalContext",
      "assertSharedContext",
      "assertGuardrailResult",
      "assertRouteDecision",
      "requireConst(sharedContext.dataScopes.teaching, \"READ\"",
      "requireConst(sharedContext.dataScopes.student, \"NONE\"",
      "requireConst(sharedContext.dataScopes.knowledge, \"PUBLIC\"",
      "requireConst(sharedContext.dataScopes.tool, \"NONE\"",
      "requireConst(guardrailResult.decision, \"ALLOW\"",
      "requireConst(routeDecision.mode, \"SINGLE_WORKER\"",
      "directDatabaseAccessAllowed: false",
      "writeOperationAllowed: false",
      "studentDataAccess: \"NONE\"",
      "externalModelAllowed: false",
      "studentDataReturned: false",
      "privateKnowledgeReturned: false",
      "externalModelUsed: false",
    ].join("\n"),
    runtimeTest: [
      "invokes the injected read port and maps teaching material results",
      "returns NO_MATCH",
      "rejects write intent",
      "rejects student archive and external model requests",
      "rejects student and remote principals",
      "rejects unsafe SharedContext scopes",
      "rejects guardrail deny and failing safety checks",
      "rejects swarm routes and wrong worker or skill routes",
      "requires an injected read port and rejects unsafe read port rows",
      "truncates results and snippets",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:teaching-agent-readonly-runtime-adapter": "node tools/teaching-agent-readonly-runtime-adapter-audit.mjs --out reports/teaching-agent-readonly-runtime-adapter.current.json",
      },
    }),
    qualityGate: "TeachingAgent read-only runtime adapter audit",
    rootWorkflowCoverage: [
      "teachingAgentReadonlyRuntimeAdapter",
      "teaching-agent-readonly-runtime-adapter.current.json",
      "[\"teachingAgentReadonlyRuntimeAdapter\", \"READY\"]",
      "teaching_agent_readonly_runtime_adapter",
    ].join("\n"),
    verifyStructure: [
      "teaching-agent-readonly-runtime-adapter.mjs",
      "teaching-agent-readonly-runtime-adapter.test.mjs",
      "teaching-agent-readonly-runtime-adapter-audit.mjs",
      "teaching-agent-readonly-runtime-adapter-audit.test.mjs",
      "0237-teaching-agent-readonly-runtime-adapter.md",
    ].join("\n"),
  };
}

function adapterSchema() {
  return {
    properties: {
      adapterId: { const: "teaching_agent_search_material_readonly_adapter" },
      workerAgent: { const: "TeachingAgent" },
      skillId: { const: "search_teaching_material" },
      routeMode: { const: "SINGLE_WORKER" },
    },
  };
}

function adapterExample() {
  return {
    adapterId: "teaching_agent_search_material_readonly_adapter",
    workerAgent: "TeachingAgent",
    skillId: "search_teaching_material",
    routeMode: "SINGLE_WORKER",
    readPort: {
      portName: "TeachingArchiveReadPort",
      operation: "searchTeachingMaterials",
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
      latencyBudgetMs: { maximum: 50 },
      filters: {
        properties: {
          ownerType: { const: "TEACHING" },
          includeStudentArchive: { const: false },
        },
      },
    },
  };
}

function skillOutputSchema() {
  return {
    properties: {
      items: {
        items: {
          properties: {
            ownerType: { const: "TEACHING" },
          },
        },
      },
      safety: {
        properties: {
          directDatabaseWriteAllowed: { const: false },
          studentDataReturned: { const: false },
          externalModelUsed: { const: false },
        },
      },
    },
  };
}
