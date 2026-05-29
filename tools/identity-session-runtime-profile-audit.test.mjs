import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditIdentitySessionRuntimeProfile,
  formatIdentitySessionRuntimeProfileAudit,
} from "./identity-session-runtime-profile-audit.mjs";

const composeText = `
services:
  identity-session-postgres:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: app_user
      POSTGRES_PASSWORD: ueacd
      POSTGRES_DB: intelligent_teaching_assistant
    ports:
      - "15432:5432"
    volumes:
      - identity_session_postgres_data:/var/lib/postgresql

  identity-session-pgbouncer:
    image: edoburu/pgbouncer:latest
    ports:
      - "16432:6432"
    depends_on:
      identity-session-postgres:
        condition: service_healthy
`;

const pgbouncerIni = `
[databases]
intelligent_teaching_assistant = host=identity-session-postgres port=5432 dbname=intelligent_teaching_assistant

[pgbouncer]
listen_port = 6432
pool_mode = transaction
max_db_connections = 32
`;

const userlistText = `"app_user" "ueacd"\n`;

describe("identity session runtime profile audit", () => {
  it("passes the identity-only PgBouncer profile", () => {
    const report = auditIdentitySessionRuntimeProfile({
      composeText,
      pgbouncerIniText: pgbouncerIni,
      userlistText,
    });

    assert.equal(report.readiness, "READY");
    assert.match(formatIdentitySessionRuntimeProfileAudit(report), /READY/);
  });

  it("fails when the profile collides with the shared PostgreSQL port", () => {
    const report = auditIdentitySessionRuntimeProfile({
      composeText: composeText.replace("15432:5432", "5433:5432"),
      pgbouncerIniText: pgbouncerIni,
      userlistText,
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(
      report.findings.find((finding) => finding.id === "postgres.host_port").passed,
      false,
    );
  });

  it("fails when the PostgreSQL 18 volume uses the old data mount target", () => {
    const report = auditIdentitySessionRuntimeProfile({
      composeText: composeText.replace("/var/lib/postgresql", "/var/lib/postgresql/data"),
      pgbouncerIniText: pgbouncerIni,
      userlistText,
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(
      report.findings.find((finding) => finding.id === "postgres.volume_target").passed,
      false,
    );
  });

  it("fails when PgBouncer is not in transaction mode", () => {
    const report = auditIdentitySessionRuntimeProfile({
      composeText,
      pgbouncerIniText: pgbouncerIni.replace("transaction", "session"),
      userlistText,
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(
      report.findings.find((finding) => finding.id === "pgbouncer.pool_mode").passed,
      false,
    );
  });
});
