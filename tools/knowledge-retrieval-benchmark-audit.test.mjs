import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  auditKnowledgeRetrievalBenchmark,
  formatKnowledgeRetrievalBenchmarkAudit,
  runKnowledgeRetrievalBenchmark,
} from "./knowledge-retrieval-benchmark-audit.mjs";

const root = process.cwd();

function loadCurrentInputs() {
  return {
    policy: loadJson("contracts/knowledge/knowledge-access-policy.current.json"),
    benchmark: loadJson("contracts/knowledge/knowledge-retrieval-benchmark.current.json"),
  };
}

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

describe("knowledge retrieval benchmark audit", () => {
  it("passes the current hybrid retrieval benchmark profile", () => {
    const report = auditKnowledgeRetrievalBenchmark(loadCurrentInputs());

    assert.equal(report.readiness, "READY");
    assert.match(formatKnowledgeRetrievalBenchmarkAudit(report), /Knowledge retrieval benchmark: READY/);
  });

  it("runs non-empty hybrid plans for every current workload", () => {
    const result = runKnowledgeRetrievalBenchmark({
      ...loadCurrentInputs(),
      generatedAt: "2026-05-30T15:30:00Z",
    });

    assert(result.workloadResults.length >= 4);
    assert(result.workloadResults.every((workload) => workload.strategy === "HYBRID"));
    assert(result.workloadResults.every((workload) => workload.directoryCandidatesExamined > 0));
    assert(result.workloadResults.every((workload) => workload.chunkCandidatesExamined > 0));
    assert(result.workloadResults.every((workload) => workload.returnedCandidateCount > 0));
  });

  it("fails when retrieval regresses to chunk-only policy", () => {
    const inputs = loadCurrentInputs();
    const policy = clone(inputs.policy);
    policy.retrievalPolicy.defaultStrategy = "CHUNK_VECTOR";
    policy.retrievalPolicy.directoryIntentIndexEnabled = false;

    const report = auditKnowledgeRetrievalBenchmark({ ...inputs, policy });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "policy.hybrid_enabled").passed, false);
  });

  it("fails when the benchmark corpus is empty", () => {
    const inputs = loadCurrentInputs();
    const benchmark = clone(inputs.benchmark);
    benchmark.corpus.documents = [];

    const report = auditKnowledgeRetrievalBenchmark({ ...inputs, benchmark });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "profile.non_empty_corpus").passed, false);
  });

  it("fails when a node receives candidates outside allowed classifications", () => {
    const inputs = loadCurrentInputs();
    const benchmark = clone(inputs.benchmark);
    benchmark.workloads.find((workload) => workload.nodeType === "CLOUD").expectedClassifications.push("PRIVATE");

    const report = auditKnowledgeRetrievalBenchmark({ ...inputs, benchmark });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "benchmark.no_cross_classification_leakage").passed, false);
  });

  it("fails when query-plan P95 exceeds the policy budget", () => {
    const inputs = loadCurrentInputs();
    const policy = clone(inputs.policy);
    policy.retrievalPolicy.queryPlanBudget.targetP95Ms = 1;

    const report = auditKnowledgeRetrievalBenchmark({ ...inputs, policy });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "benchmark.p95_budget").passed, false);
  });
});
