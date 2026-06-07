import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditDeepResearchRetrievalExecution,
  formatDeepResearchRetrievalExecutionAudit,
} from "./research-deep-research-retrieval-execution-audit.mjs";

describe("Research deep_research retrieval execution audit", () => {
  it("passes when retrieval execution is approved, port-based, cited, and reasoning-deferred", async () => {
    const report = await auditDeepResearchRetrievalExecution(currentInputs(), {
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION");
    assert.equal(report.runtime.runtimeId, "research_deep_research_retrieval_execution_runtime");
    assert.equal(report.runtime.commandPort, "DeepResearchRetrievalExecutionPort.recordDeepResearchRetrievalExecution");
    assert.equal(report.runtime.readPort, "DeepResearchRetrievalReadPort.retrieveApprovedSources");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 300, true);
    assert.equal(report.runtimeProbes.retrievalExecution.result.status, "RETRIEVAL_EXECUTION_RECORDED");
    assert.equal(report.runtimeProbes.retrievalExecution.result.boundary.finalAnswerGenerated, false);
    assert.match(formatDeepResearchRetrievalExecutionAudit(report), /Research deep_research retrieval execution: READY/u);
  });

  it("fails when the runtime claims direct database access or final answers", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\ndirectDatabaseAccessAllowed: true\nfinalAnswerGenerated: true`;

    const report = await auditDeepResearchRetrievalExecution(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.approved_plan_and_safety_boundaries").passed, false);
  });

  it("caps the probe p99 at the async retrieval boundary budget", async () => {
    const report = await auditDeepResearchRetrievalExecution(currentInputs(), {
      probeP99Ms: 350,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 300);
  });

  it("fails when quality, structure, root workflow, or board hooks omit the execution slice", async () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage
      .replaceAll("researchDeepResearchRetrievalExecution", "researchDeepResearchFutureExecution")
      .replace("research-deep-research-retrieval-execution.current.json", "research-deep-research-future-execution.current.json")
      .replace("research_deep_research_retrieval_execution_runtime", "research_deep_research_future_execution_runtime");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("research-deep-research-retrieval-execution", "research-deep-research-future-execution");
    inputs.architectureBoard = "ResearchAgent.deep_research approved retrieval planning 8.4/10";

    const report = await auditDeepResearchRetrievalExecution(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_tracks_runtime").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_retrieval_execution_report").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "structure_tracks_runtime_files").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "architecture_board.reflects_retrieval_execution_progress").passed, false);
  });
});

function currentInputs() {
  return {
    inputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-retrieval-execution.v1" },
        executionPolicy: {
          properties: {
            executeRetrievalNow: { const: true },
            directDatabaseAccessAllowed: { const: false },
          },
        },
        readPortDescriptor: {
          properties: {
            operation: { const: "retrieveApprovedSources" },
          },
        },
      },
    }),
    outputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-retrieval-execution-recorded.v1" },
        runtimeId: { const: "research_deep_research_retrieval_execution_runtime" },
        readPort: { const: "DeepResearchRetrievalReadPort.retrieveApprovedSources" },
      },
    }),
    inputExample: JSON.stringify({
      executionPolicy: { executeRetrievalNow: true, directDatabaseAccessAllowed: false },
    }),
    outputExample: JSON.stringify({
      status: "RETRIEVAL_EXECUTION_RECORDED",
      boundary: { retrievalExecuted: true, finalAnswerGenerated: false },
    }),
    runtime: [
      'export const RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_RUNTIME_ID = "research_deep_research_retrieval_execution_runtime";',
      'export const RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_COMMAND_PORT = "DeepResearchRetrievalExecutionPort.recordDeepResearchRetrievalExecution";',
      'export const RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_READ_PORT = "DeepResearchRetrievalReadPort.retrieveApprovedSources";',
      "RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION",
      "recordDeepResearchRetrievalExecution",
      "RETRIEVAL_EXECUTION_RECORDED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "input.retrievalPlanRecord.runtimeId",
      "research_deep_research_retrieval_plan_runtime",
      "input.retrievalPlanRecord.status",
      "RETRIEVAL_PLAN_RECORDED",
      "input.executionPolicy.executeRetrievalNow",
      "input.executionPolicy.directDatabaseAccessAllowed",
      "input.executionPolicy.writeAllowed",
      "input.executionPolicy.studentArchiveAllowed",
      "input.executionPolicy.externalModelCallAllowed",
      "input.executionPolicy.ragSynthesisAllowed",
      "input.executionPolicy.finalAnswerNowAllowed",
      "DeepResearchRetrievalReadPort.retrieveApprovedSources is required",
      "requiresFutureReasoningSlice: true",
    ].join("\n"),
    runtimeTest: [
      "executes an approved retrieval plan through the injected read port and records cited source evidence only",
      "uses idempotency for safe replay and rejects conflicting execution inputs",
      "rejects unsafe execution policy, reused plan execution, and missing read port",
      "rejects unplanned, out-of-policy, non-local, or uncited retrieval chunks",
      "rejects result sets that exceed the approved chunk or source-ref budget",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:research-deep-research-retrieval-execution": "node tools/research-deep-research-retrieval-execution-audit.mjs --out reports/research-deep-research-retrieval-execution.current.json",
      },
    }),
    qualityGate: "Research deep_research retrieval execution audit",
    rootWorkflowCoverage: [
      "researchDeepResearchRetrievalExecution",
      "research-deep-research-retrieval-execution.current.json",
      "research_deep_research_retrieval_execution_runtime",
    ].join("\n"),
    verifyStructure: [
      "0245-research-deep-research-retrieval-execution.md",
      "deep-research-retrieval-execution.input.schema.json",
      "deep-research-retrieval-execution.output.schema.json",
      "research-deep-research-retrieval-execution-runtime.mjs",
      "research-deep-research-retrieval-execution-runtime.test.mjs",
      "research-deep-research-retrieval-execution-audit.mjs",
      "research-deep-research-retrieval-execution-audit.test.mjs",
    ].join("\n"),
    architectureBoard: "ResearchAgent.deep_research approved retrieval execution 8.5/10",
    sdd: [
      "approved retrieval-execution boundary",
      "DeepResearchRetrievalReadPort.retrieveApprovedSources",
      "cited source evidence",
      "does not rank final claims",
      "does not call models",
      "does not fuse answers",
      "future async reasoning",
    ].join("\n"),
  };
}
