import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  auditCrossModuleDbQueueDiagnostics,
  formatCrossModuleDbQueueDiagnostics,
  sourceFiles,
} from "./cross-module-db-queue-diagnostics-audit.mjs";

const root = process.cwd();
const currentIdentitySourceReport =
  "reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-unlogged-session-table-pgbouncer120-preconnect-retry-ingress19080-clean-table-docker-bench.json";

describe("cross-module DB and queue diagnostics audit", () => {
  it("passes the current cross-module database and queue evidence", () => {
    const inputs = loadCurrentInputs();
    const report = auditCrossModuleDbQueueDiagnostics(inputs);
    const sustainedScaleUp = parseSource(inputs, sourceFiles.sustainedScaleUp);

    assert.equal(sourceFiles.identity, currentIdentitySourceReport);
    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "CROSS_MODULE_DATABASE_AND_QUEUE_DIAGNOSTICS");
    assert.equal(report.databaseTopology.postgres.maxConnections, 300);
    assert.equal(report.databaseTopology.pgbouncer.poolMode, "transaction");
    assert.equal(report.databaseTopology.hotPathPool.totalMaxConns, 89);
    assert.equal(report.databaseTopology.hotPathPool.pgbouncerHeadroom, 1);
    assert.equal(report.moduleDiagnostics.length, 6);
    const identity = report.moduleDiagnostics.find((module) => module.id === "identity_and_access");
    assert.equal(identity.sourceReportPath, currentIdentitySourceReport);
    assert.equal(identity.metrics.revokeCycleSlowestStep, "login");
    assert.equal(identity.metrics.slowestP99Ms, 3071.17);
    assert.equal(identity.metrics.revokeCycleSlowestStepP99Ms, 1498.29);
    assert.equal(
      report.moduleDiagnostics.find((module) => module.id === "teaching_archive_and_quiz").classification,
      "MODULE_RUNTIME_SLO_FROM_SUSTAINED_MIXED_WORKLOAD",
    );
    assert.equal(
      report.moduleDiagnostics.find((module) => module.id === "knowledge_retrieval").classification,
      "POLICY_RUNTIME_SLO_FROM_SUSTAINED_MIXED_WORKLOAD",
    );
    assert.equal(
      report.moduleDiagnostics.find((module) => module.id === "ai_worker_optional_runtime").classification,
      "WORKER_ADMISSION_RUNTIME_SLO_FROM_SUSTAINED_MIXED_WORKLOAD",
    );
    assert.equal(
      report.moduleDiagnostics.find((module) => module.id === "agent_harness_and_workflow_plugin").classification,
      "REVIEW_RUNTIME_SLO_AND_QUEUE_BOUNDARY",
    );
    assert.equal(
      report.moduleDiagnostics.find((module) => module.id === "teaching_archive_and_quiz").metrics.sustainedRuntimeEvidence.present,
      true,
    );
    assert.equal(
      report.moduleDiagnostics.find((module) => module.id === "teaching_archive_and_quiz").metrics.sustainedRuntimeEvidence.stepName,
      sustainedScaleUp.summary.highestPassedStep,
    );
    assert.equal(
      report.moduleDiagnostics.find((module) => module.id === "agent_harness_and_workflow_plugin").metrics.workflowRuntimeEvidence.p99Ms <= 300,
      true,
    );
    assert.equal(report.queueAndWorkerDiagnostics.every((queue) => queue.status === "READY"), true);
    assert.match(formatCrossModuleDbQueueDiagnostics(report), /Cross-module DB\/queue diagnostics: READY/);
  });

  it("fails when a required source report is missing", () => {
    const inputs = loadCurrentInputs();
    delete inputs.sources[sourceFiles.identity];

    const report = auditCrossModuleDbQueueDiagnostics(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "sources.required_json_parseable").passed, false);
  });

  it("fails when PgBouncer is not in transaction mode", () => {
    const inputs = loadCurrentInputs();
    const profile = parseSource(inputs, sourceFiles.pgbouncerPerf);
    profile.observed.pgbouncer.poolMode = "session";
    inputs.sources[sourceFiles.pgbouncerPerf] = JSON.stringify(profile);

    const report = auditCrossModuleDbQueueDiagnostics(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "database.foundation_ready").passed, false);
  });

  it("fails when the planned connection budget exceeds the safe limit", () => {
    const inputs = loadCurrentInputs();
    const budget = parseSource(inputs, sourceFiles.connectionBudget);
    budget.services.find((service) => service.name === "legacy-fastapi-backend-via-pgbouncer").workers = 200;
    inputs.sources[sourceFiles.connectionBudget] = JSON.stringify(budget);

    const report = auditCrossModuleDbQueueDiagnostics(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "database.connection_budget_passed").passed, false);
  });

  it("fails when current module peak pools exceed the PgBouncer server pool cap", () => {
    const inputs = loadCurrentInputs();
    const identity = parseSource(inputs, sourceFiles.identity);
    identity.gatewayDatabaseProfile.sessionDbMaxConnsTotal = 91;
    inputs.sources[sourceFiles.identity] = JSON.stringify(identity);

    const report = auditCrossModuleDbQueueDiagnostics(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "database.hot_path_pool_within_pgbouncer_cap").passed, false);
  });

  it("fails when AI worker admission would allow direct main database writes", () => {
    const inputs = loadCurrentInputs();
    const admission = parseSource(inputs, sourceFiles.aiWorkerAdmission);
    admission.findings = admission.findings.map((finding) =>
      finding.id === "admission.no_direct_db_write"
        ? { ...finding, passed: false, actual: "directDb=true" }
        : finding,
    );
    inputs.sources[sourceFiles.aiWorkerAdmission] = JSON.stringify(admission);

    const report = auditCrossModuleDbQueueDiagnostics(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "queues.worker_boundaries_ready").passed, false);
  });

  it("fails when sustained mixed workload scale-up is no longer clean", () => {
    const inputs = loadCurrentInputs();
    const scaleUp = parseSource(inputs, sourceFiles.sustainedScaleUp);
    scaleUp.summary.totalErrors = 1;
    inputs.sources[sourceFiles.sustainedScaleUp] = JSON.stringify(scaleUp);

    const report = auditCrossModuleDbQueueDiagnostics(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "performance.mixed_scaleup_clean").passed, false);
  });

  it("falls back to smoke classification when teaching runtime evidence is below high", () => {
    const inputs = loadCurrentInputs();
    const scaleUp = parseSource(inputs, sourceFiles.sustainedScaleUp);
    scaleUp.summary.highestPassedStep = "medium";
    scaleUp.steps = scaleUp.steps.map((step) => ({ ...step, name: "medium" }));
    inputs.sources[sourceFiles.sustainedScaleUp] = JSON.stringify(scaleUp);

    const report = auditCrossModuleDbQueueDiagnostics(inputs);
    const teaching = report.moduleDiagnostics.find((module) => module.id === "teaching_archive_and_quiz");

    assert.equal(report.readiness, "READY");
    assert.equal(teaching.classification, "MODULE_SMOKE_ONLY");
    assert.equal(teaching.metrics.sustainedRuntimeEvidence.present, false);
  });

  it("falls back to review-only classification when workflow runtime SLO evidence is too slow", () => {
    const inputs = loadCurrentInputs();
    const runtimeSlo = parseSource(inputs, sourceFiles.workflowPluginRuntimeSlo);
    runtimeSlo.runtimeSlo.p99Ms = runtimeSlo.runtimeSlo.targetP99Ms + 1;
    inputs.sources[sourceFiles.workflowPluginRuntimeSlo] = JSON.stringify(runtimeSlo);

    const report = auditCrossModuleDbQueueDiagnostics(inputs);
    const agentWorkflow = report.moduleDiagnostics.find((module) => module.id === "agent_harness_and_workflow_plugin");

    assert.equal(report.readiness, "READY");
    assert.equal(agentWorkflow.classification, "REVIEW_ONLY_QUEUE_BOUNDARY");
    assert.equal(agentWorkflow.metrics.workflowRuntimeEvidence.passed, false);
  });

  it("fails when strict quality is not passing", () => {
    const inputs = loadCurrentInputs();
    const quality = parseSource(inputs, sourceFiles.quality);
    quality.allPassed = false;
    quality.status = "FAILED";
    inputs.sources[sourceFiles.quality] = JSON.stringify(quality);

    const report = auditCrossModuleDbQueueDiagnostics(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_passed").passed, false);
  });
});

function loadCurrentInputs() {
  const sources = Object.fromEntries(Object.values(sourceFiles).map((sourcePath) => [
    sourcePath,
    fs.readFileSync(path.join(root, sourcePath), "utf8"),
  ]));
  sources[sourceFiles.quality] = JSON.stringify(passingQualityReport());
  return {
    sources,
  };
}

function parseSource(inputs, sourcePath) {
  return JSON.parse(inputs.sources[sourcePath]);
}

function passingQualityReport() {
  return {
    status: "PASSED",
    allPassed: true,
    staticChecks: { passed: true, findings: [] },
    commandResults: [],
  };
}
