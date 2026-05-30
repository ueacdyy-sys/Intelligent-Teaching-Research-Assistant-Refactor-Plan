import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  auditPerformanceEvidenceRegistry,
  formatPerformanceEvidenceRegistryAudit,
} from "./performance-evidence-registry-audit.mjs";

const root = process.cwd();

function loadCurrentInputs() {
  const registry = loadJson("contracts/ops/performance-evidence-registry.current.json");
  return {
    registry,
    reports: loadSourceReports(registry),
  };
}

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function loadSourceReports(registry) {
  return Object.fromEntries(
    registry.entries.map((entry) => [
      entry.sourceReportPath,
      fs.readFileSync(path.join(root, entry.sourceReportPath), "utf8"),
    ]),
  );
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

describe("performance evidence registry audit", () => {
  it("passes the current evidence registry", () => {
    const report = auditPerformanceEvidenceRegistry(loadCurrentInputs());

    assert.equal(report.readiness, "READY");
    assert.match(formatPerformanceEvidenceRegistryAudit(report), /Performance evidence registry: READY/);
  });

  it("fails when a source report is missing", () => {
    const inputs = loadCurrentInputs();
    const reports = { ...inputs.reports };
    delete reports[inputs.registry.entries[0].sourceReportPath];

    const report = auditPerformanceEvidenceRegistry({ ...inputs, reports });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "sources.current_reports_present").passed, false);
  });

  it("fails when database evidence omits PostgreSQL settings", () => {
    const inputs = loadCurrentInputs();
    const registry = clone(inputs.registry);
    const entry = registry.entries.find((candidate) => candidate.databaseEvidence?.required === true);
    delete entry.databaseEvidence.postgres;

    const report = auditPerformanceEvidenceRegistry({ ...inputs, registry });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "database.postgres_settings").passed, false);
  });

  it("fails when non-database evidence lacks a rationale", () => {
    const inputs = loadCurrentInputs();
    const registry = clone(inputs.registry);
    const entry = registry.entries.find((candidate) => candidate.databaseEvidence?.required === false);
    delete entry.databaseEvidence.notRequiredReason;

    const report = auditPerformanceEvidenceRegistry({ ...inputs, registry });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "database.non_database_rationale").passed, false);
  });

  it("fails when an entry has no metric summary", () => {
    const inputs = loadCurrentInputs();
    const registry = clone(inputs.registry);
    registry.entries[0].metrics = [];

    const report = auditPerformanceEvidenceRegistry({ ...inputs, registry });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "entries.metric_summary").passed, false);
  });

  it("fails when HTTP benchmark report status differs from the registry status", () => {
    const inputs = loadCurrentInputs();
    const registry = clone(inputs.registry);
    const sourceReportPath = "reports/identity-http-benchmark.concurrency512.json";
    registry.entries.push({
      evidenceId: "identity_http_gateway_limit_probe",
      moduleSlice: "Identity And Access / HTTP Session Gateway",
      workloadType: "HTTP_BENCHMARK",
      sourceCommand: "npm run bench:identity-http:pgbouncer -- --concurrency 512 --operations 1024 --out reports/identity-http-benchmark.concurrency512.json",
      sourceReportPath,
      runtimeProfile: {
        name: "identity_go_gateway_pgbouncer_live_limit_probe",
        executionEnvironment: "Local Go gateway with Docker identity PgBouncer profile",
        dockerRequiredForEvidence: true,
        includedInNpmTest: false,
      },
      status: "FAILED",
      metrics: [
        {
          name: "probe.concurrency",
          value: 512,
          unit: "clients",
          interpretation: "Strong limit probe concurrency.",
        },
      ],
      databaseEvidence: {
        required: true,
        postgres: {
          serviceName: "ita-identity-session-postgres",
          maxConnections: 300,
          sharedBuffers: "1GB",
        },
        pgbouncer: {
          serviceName: "ita-identity-session-pgbouncer",
          poolMode: "transaction",
          listenPort: 6432,
          maxDbConnections: 90,
        },
      },
      rollbackOrNextAction: "Keep the failed report as the limit probe and inspect gateway crash output.",
    });
    const reports = {
      ...inputs.reports,
      [sourceReportPath]: JSON.stringify({ status: "PASSED" }),
    };

    const report = auditPerformanceEvidenceRegistry({ registry, reports });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "sources.status_matches_registry").passed, false);
  });
});
