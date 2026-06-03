import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import {
  auditPgbouncerPerfProfile,
  formatPgbouncerPerfProfileAudit,
  loadJSON,
} from "./pgbouncer-perf-profile-audit.mjs";

const root = process.cwd();

const profile = {
  sourceFiles: {
    composeFile: "docker-compose.perf.yml",
    composeOverrideFile: "docker-compose.pgbouncer.override.yml",
    pgbouncerIni: "pgbouncer/perf.ini",
    pgbouncerUserlist: "pgbouncer/userlist.txt",
  },
  expected: {
    postgres: {
      serviceName: "postgres-perf",
      minMaxConnections: 300,
      minSharedBuffers: "1GB",
    },
    pgbouncer: {
      serviceName: "pgbouncer-perf",
      requiredPoolMode: "transaction",
      maxDbConnectionsCeiling: 190,
      requiredListenPort: 6432,
    },
    backend: {
      serviceName: "backend-perf",
      requiredPostgresHost: "pgbouncer-perf",
      requiredPostgresPort: 6432,
      maxDbPoolSize: 2,
      requiredDbMaxOverflow: 0,
      requiredWorkers: 24,
    },
    secrets: {
      requiredValue: "ueacd",
      keys: [
        "POSTGRES_PASSWORD",
        "AGENT_API_KEY",
        "pgbouncer.app_user",
      ],
    },
  },
};

const baseCompose = `
services:
  postgres-perf:
    command: >
      postgres
      -c max_connections=300
      -c shared_buffers=1GB
    environment:
      POSTGRES_PASSWORD: ueacd

  pgbouncer-perf:
    image: edoburu/pgbouncer:latest
    profiles: ["pgbouncer"]

  backend-perf:
    environment:
      POSTGRES_HOST: postgres-perf
      POSTGRES_PORT: "5432"
      DB_POOL_SIZE: "\${DB_POOL_SIZE:-3}"
      DB_MAX_OVERFLOW: "\${DB_MAX_OVERFLOW:-0}"
      GUNICORN_WORKERS: "\${GUNICORN_WORKERS:-24}"
      POSTGRES_PASSWORD: ueacd
      AGENT_API_KEY: ueacd
    depends_on:
      postgres-perf:
        condition: service_healthy
`;

const overrideCompose = `
services:
  backend-perf:
    environment:
      POSTGRES_HOST: pgbouncer-perf
      POSTGRES_PORT: "6432"
      DB_POOL_SIZE: "2"
      DB_MAX_OVERFLOW: "0"
    depends_on:
      pgbouncer-perf:
        condition: service_started
`;

const pgbouncerIni = `
[pgbouncer]
listen_port = 6432
pool_mode = transaction
max_db_connections = 90
`;

const pgbouncerUserlist = `"app_user" "ueacd"\n`;

describe("PgBouncer perf profile audit", () => {
  it("passes the current routed PgBouncer performance profile", () => {
    const report = auditPgbouncerPerfProfile(
      loadJSON(path.join(root, "contracts/config/pgbouncer-perf-profile.current.json")),
    );

    assert.equal(report.readiness, "READY");
    assert.doesNotMatch(JSON.stringify(report), /ueacd/u);
    assert.equal(report.observed.backend.environment.POSTGRES_HOST, "pgbouncer-perf");
    assert.equal(report.observed.backend.environment.POSTGRES_PORT, "6432");
    assert.equal(report.observed.backend.environment.DB_POOL_SIZE, "2");
    assert.equal(report.observed.backend.dependsOnPgbouncer, true);
  });

  it("detects a current profile that still routes backend traffic directly to PostgreSQL", () => {
    const report = auditPgbouncerPerfProfile(profile, {
      composeText: baseCompose,
      overrideText: "",
      pgbouncerIniText: pgbouncerIni,
      pgbouncerUserlistText: pgbouncerUserlist,
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    const failedIds = report.findings
      .filter((finding) => !finding.passed)
      .map((finding) => finding.id);
    assert.deepEqual(failedIds.sort(), [
      "backend.db_pool_size",
      "backend.depends_on_pgbouncer",
      "backend.postgres_host",
      "backend.postgres_port",
    ]);
  });

  it("passes when the refactor-owned override routes through PgBouncer", () => {
    const report = auditPgbouncerPerfProfile(profile, {
      composeText: baseCompose,
      overrideText: overrideCompose,
      pgbouncerIniText: pgbouncerIni,
      pgbouncerUserlistText: pgbouncerUserlist,
    });

    assert.equal(report.readiness, "READY");
    assert.match(formatPgbouncerPerfProfileAudit(report), /PgBouncer perf profile: READY/);
  });

  it("fails when PgBouncer is not in transaction mode", () => {
    const report = auditPgbouncerPerfProfile(profile, {
      composeText: baseCompose,
      overrideText: overrideCompose,
      pgbouncerIniText: pgbouncerIni.replace("transaction", "session"),
      pgbouncerUserlistText: pgbouncerUserlist,
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(
      report.findings.find((finding) => finding.id === "pgbouncer.pool_mode").passed,
      false,
    );
  });

  it("fails when a configured local performance secret is not ueacd", () => {
    const report = auditPgbouncerPerfProfile(profile, {
      composeText: baseCompose.replace("AGENT_API_KEY: ueacd", "AGENT_API_KEY: wrong"),
      overrideText: overrideCompose,
      pgbouncerIniText: pgbouncerIni,
      pgbouncerUserlistText: pgbouncerUserlist,
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(
      report.findings.find((finding) => finding.id === "secret.AGENT_API_KEY").passed,
      false,
    );
  });
});
