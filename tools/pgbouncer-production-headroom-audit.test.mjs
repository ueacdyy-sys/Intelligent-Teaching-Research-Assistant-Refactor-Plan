import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  auditPgbouncerProductionHeadroomProfile,
  formatPgbouncerProductionHeadroomProfileAudit,
} from "./pgbouncer-production-headroom-audit.mjs";

const root = process.cwd();

describe("PgBouncer production headroom profile audit", () => {
  it("passes the current production-candidate headroom profile", () => {
    const report = auditPgbouncerProductionHeadroomProfile(loadCurrentInputs());

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "PGBOUNCER_PRODUCTION_HEADROOM_PROFILE");
    assert.equal(report.candidate.maxDbConnections, 120);
    assert.equal(report.candidate.sourceHotPathHeadroom, 31);
    assert.equal(report.candidate.plannedBudgetHeadroom, 24);
    assert.match(formatPgbouncerProductionHeadroomProfileAudit(report), /PgBouncer production headroom profile: READY/u);
  });

  it("fails when the candidate max_db_connections keeps the current one-connection headroom", () => {
    const inputs = loadCurrentInputs();
    inputs.profile.pgbouncer.maxDbConnections = 90;

    const report = auditPgbouncerProductionHeadroomProfile(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(
      report.findings.find((finding) => finding.id === "pgbouncer.current_hot_path_headroom").passed,
      false,
    );
    assert.equal(
      report.findings.find((finding) => finding.id === "pgbouncer.planned_budget_headroom").passed,
      false,
    );
  });

  it("fails when default and reserve pools exceed the server connection cap", () => {
    const inputs = loadCurrentInputs();
    inputs.profile.pgbouncer.defaultPoolSize = 110;
    inputs.profile.pgbouncer.reservePoolSize = 20;

    const report = auditPgbouncerProductionHeadroomProfile(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(
      report.findings.find((finding) => finding.id === "pgbouncer.pool_sum_within_cap").passed,
      false,
    );
  });

  it("fails when PgBouncer is not in transaction mode", () => {
    const inputs = loadCurrentInputs();
    inputs.profile.pgbouncer.poolMode = "session";

    const report = auditPgbouncerProductionHeadroomProfile(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(
      report.findings.find((finding) => finding.id === "pgbouncer.transaction_pooling").passed,
      false,
    );
  });

  it("fails when the candidate exceeds the PostgreSQL safe budget", () => {
    const inputs = loadCurrentInputs();
    inputs.profile.pgbouncer.maxDbConnections = 220;
    inputs.profile.pgbouncer.defaultPoolSize = 180;
    inputs.profile.pgbouncer.reservePoolSize = 40;

    const report = auditPgbouncerProductionHeadroomProfile(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(
      report.findings.find((finding) => finding.id === "postgres.safe_budget_ceiling").passed,
      false,
    );
  });

  it("fails when cross-module diagnostics are not ready", () => {
    const inputs = loadCurrentInputs();
    inputs.crossModuleDiagnostics.readiness = "NEEDS_REMEDIATION";

    const report = auditPgbouncerProductionHeadroomProfile(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(
      report.findings.find((finding) => finding.id === "sources.cross_module_diagnostics_ready").passed,
      false,
    );
  });
});

function loadCurrentInputs() {
  const profile = readJson("contracts/config/pgbouncer-production-headroom.profile.json");
  return {
    profile,
    crossModuleDiagnostics: readJson(profile.sourceReports.crossModuleDiagnostics),
    connectionBudget: readJson(profile.sourceConfigs.connectionBudget),
  };
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}
