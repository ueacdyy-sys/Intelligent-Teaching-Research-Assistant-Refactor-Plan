import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  auditKnowledgeAccessPolicy,
  formatKnowledgeAccessPolicyAudit,
} from "./knowledge-access-policy-audit.mjs";

const root = process.cwd();

function loadCurrentInputs() {
  return {
    schema: loadJson("contracts/knowledge/knowledge-access-policy.schema.json"),
    policy: loadJson("contracts/knowledge/knowledge-access-policy.current.json"),
  };
}

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

describe("knowledge access policy audit", () => {
  it("passes the current knowledge access and retrieval policy", () => {
    const report = auditKnowledgeAccessPolicy(loadCurrentInputs());

    assert.equal(report.readiness, "READY");
    assert.match(formatKnowledgeAccessPolicyAudit(report), /Knowledge access policy: READY/);
  });

  it("fails when private knowledge is not physically isolated", () => {
    const inputs = loadCurrentInputs();
    const policy = clone(inputs.policy);
    policy.partitions.find((partition) => partition.classification === "PRIVATE").physicalIsolation = "SHARED";

    const report = auditKnowledgeAccessPolicy({ ...inputs, policy });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "partitions.local_physical_isolation").passed, false);
  });

  it("fails when cloud nodes can access private knowledge", () => {
    const inputs = loadCurrentInputs();
    const policy = clone(inputs.policy);
    policy.nodePolicies.find((nodePolicy) => nodePolicy.nodeType === "CLOUD").allowedLocalClassifications.push("PRIVATE");

    const report = auditKnowledgeAccessPolicy({ ...inputs, policy });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "nodes.cloud_public_only").passed, false);
  });

  it("fails when remote-device nodes can access local knowledge", () => {
    const inputs = loadCurrentInputs();
    const policy = clone(inputs.policy);
    policy.nodePolicies.find((nodePolicy) => nodePolicy.nodeType === "REMOTE_DEVICE").allowedLocalClassifications.push("PUBLIC");

    const report = auditKnowledgeAccessPolicy({ ...inputs, policy });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "nodes.remote_no_local_knowledge").passed, false);
  });

  it("fails when retrieval does not support directory intent indexing", () => {
    const inputs = loadCurrentInputs();
    const schema = clone(inputs.schema);
    schema.properties.retrievalPolicy.properties.supportedStrategies.items.enum = ["CHUNK_VECTOR", "HYBRID"];

    const report = auditKnowledgeAccessPolicy({ ...inputs, schema });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "retrieval.strategy_vocab").passed, false);
  });

  it("fails when current retrieval regresses to chunk-only mode", () => {
    const inputs = loadCurrentInputs();
    const policy = clone(inputs.policy);
    policy.retrievalPolicy.defaultStrategy = "CHUNK_VECTOR";
    policy.retrievalPolicy.directoryIntentIndexEnabled = false;

    const report = auditKnowledgeAccessPolicy({ ...inputs, policy });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "retrieval.current_hybrid").passed, false);
  });
});
