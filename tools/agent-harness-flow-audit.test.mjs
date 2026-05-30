import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  auditAgentHarnessFlowContracts,
  formatAgentHarnessFlowAudit,
} from "./agent-harness-flow-audit.mjs";

const root = process.cwd();

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function loadCurrentInputs() {
  return {
    permissionManifest: loadJson("contracts/harness/permission-manifest.current.json"),
    auditEvidenceSchema: loadJson("contracts/harness/audit-evidence.schema.json"),
    approvalArtifactSchema: loadJson("contracts/harness/approval-artifact.schema.json"),
    approvalDecisionSchema: loadJson("contracts/harness/approval-decision.schema.json"),
    approvalDecisionCorrelationSchema: loadJson("contracts/harness/approval-decision-correlation.schema.json"),
    approvalQueueSnapshotSchema: loadJson("contracts/harness/approval-queue-snapshot.schema.json"),
    executionCandidateViewSchema: loadJson("contracts/harness/execution-candidate-view.schema.json"),
    rustFiles: {
      "services/agent-harness/src/lib.rs": fs.readFileSync(path.join(root, "services/agent-harness/src/lib.rs"), "utf8"),
      "services/agent-harness/src/approval_decision.rs": fs.readFileSync(path.join(root, "services/agent-harness/src/approval_decision.rs"), "utf8"),
      "services/agent-harness/src/approval_correlation.rs": fs.readFileSync(path.join(root, "services/agent-harness/src/approval_correlation.rs"), "utf8"),
      "services/agent-harness/src/approval_queue.rs": fs.readFileSync(path.join(root, "services/agent-harness/src/approval_queue.rs"), "utf8"),
      "services/agent-harness/src/execution_candidate.rs": fs.readFileSync(path.join(root, "services/agent-harness/src/execution_candidate.rs"), "utf8"),
    },
  };
}

describe("agent harness flow audit", () => {
  it("passes the current Agent Harness contract flow", () => {
    const report = auditAgentHarnessFlowContracts(loadCurrentInputs());

    assert.equal(report.readiness, "READY");
    assert.match(formatAgentHarnessFlowAudit(report), /Agent Harness flow: READY/);
  });

  it("fails when the permission manifest stops default-denying local control", () => {
    const inputs = loadCurrentInputs();
    inputs.permissionManifest.defaultDecision = "ALLOW_DRY_RUN";

    const report = auditAgentHarnessFlowContracts(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "manifest.default_deny").passed, false);
  });

  it("fails when approval decisions can become execution-ready", () => {
    const inputs = loadCurrentInputs();
    inputs.approvalDecisionSchema.properties.executionReady.const = true;

    const report = auditAgentHarnessFlowContracts(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "approval.decision.execution_ready_false").passed, false);
  });

  it("fails when execution candidate views can expose local action candidates", () => {
    const inputs = loadCurrentInputs();
    inputs.executionCandidateViewSchema.properties.candidates.maxItems = 1;

    const report = auditAgentHarnessFlowContracts(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "execution.view.no_candidates").passed, false);
  });

  it("fails when Rust projection stops hardcoding empty execution candidates", () => {
    const inputs = loadCurrentInputs();
    inputs.rustFiles["services/agent-harness/src/execution_candidate.rs"] =
      inputs.rustFiles["services/agent-harness/src/execution_candidate.rs"].replace(
        "candidate_count: 0,",
        "candidate_count: queue.approval_decision_count,",
      );

    const report = auditAgentHarnessFlowContracts(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "rust.execution_candidate.empty_projection").passed, false);
  });
});
