import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  buildIdentityPhaseMatrixReport,
  buildMatrixCases,
  defaults,
  formatIdentityPhaseMatrix,
  parseArgs,
  runIdentityPhaseMatrix,
} from "./run-identity-phase-matrix.mjs";

describe("identity phase-aware matrix runner", () => {
  it("parses compact matrix cases and builds isolated child benchmark args", () => {
    const options = parseArgs([
      "--case-prefix", "reports/custom-identity-phase",
      "--concurrency", "4400",
      "--operations", "8800",
      "--cases", "g8-p10-i16-c150:8:10:16:150:150:40:16,g10-p12-i22-c200:10:12:22:200:200:50:22",
      "--stop-on-failure", "true",
    ]);
    const cases = buildMatrixCases(options);

    assert.equal(options.stopOnFailure, "true");
    assert.deepEqual(cases.map((entry) => entry.name), ["g8-p10-i16-c150", "g10-p12-i22-c200"]);
    assert.equal(cases[0].reportPath, "reports/custom-identity-phase.1-g8-p10-i16-c150.json");
    assert.deepEqual(cases[0].args, [
      "--base-url", "http://127.0.0.1:18100",
      "--ingress-proxy", "true",
      "--ingress-port", "19080",
      "--concurrency", "4400",
      "--operations", "8800",
      "--session-db-max-conns", "10",
      "--session-db-write-concurrency", "0",
      "--session-db-session-table-persistence", "unlogged",
      "--gateway-count", "8",
      "--ingress-count", "16",
      "--max-conns-per-host", "150",
      "--warm-connections-per-host", "150",
      "--ingress-max-conns-per-host", "40",
      "--ingress-warm-connections-per-host", "16",
      "--benchmark-runtime", "docker",
      "--pgbouncer-diagnostics", "true",
      "--timeout", "180s",
      "--startup-timeout-ms", "120000",
      "--out", "reports/custom-identity-phase.1-g8-p10-i16-c150.json",
    ]);
  });

  it("recommends the passing case with the lowest slowest phase P99 and keeps phase diagnostics", () => {
    const cases = buildMatrixCases({
      ...defaults,
      cases: "slow:6:12:22:200:200:50:22,fast:8:10:16:150:150:40:16,failed:10:12:22:200:200:50:22",
    });
    const report = buildIdentityPhaseMatrixReport({
      options: defaults,
      cases,
      caseReports: [
        { case: cases[0], report: identityReport({ passwordLoginP99: 90, revokeCycleP99: 140, acquireMs: 700 }) },
        { case: cases[1], report: identityReport({ passwordLoginP99: 70, revokeCycleP99: 110, acquireMs: 300 }) },
        { case: cases[2], report: identityReport({ status: "FAILED", passwordLoginErrors: 2, passwordLoginP99: 60, revokeCycleP99: 100, acquireMs: 250 }) },
      ],
      startedAt: "2026-06-02T00:00:00.000Z",
      endedAt: "2026-06-02T00:00:01.000Z",
    });

    assert.equal(report.status, "FAILED");
    assert.equal(report.summary.recommendedCaseName, "fast");
    assert.equal(report.summary.firstFailedCaseName, "failed");
    assert.equal(report.cases[1].slowestPhase, "revokeCycle");
    assert.equal(report.cases[1].totalPoolAcquireDurationMs, 1200);
    assert.deepEqual(report.cases[1].phases[0].sessionOperations, [
      { name: "saveSession", count: 64, totalElapsedMs: 128, averageElapsedMs: 2 },
    ]);
    assert.match(formatIdentityPhaseMatrix(report), /Recommended case: fast/u);
  });

  it("runs all cases by default, writes a rollup report, and masks Docker command output", async () => {
    const root = makeTempRoot();
    const executed = [];
    const report = await runIdentityPhaseMatrix(
      {
        ...defaults,
        out: "reports/matrix.json",
        manageDocker: "true",
        dockerCleanup: "down",
        cases: "a:2:8:2:32:16:32:16,b:4:8:2:32:16:32:16",
      },
      {
        root,
        runCase: async (matrixCase) => {
          executed.push(matrixCase.name);
          return identityReport({ revokeCycleP99: matrixCase.name === "a" ? 120 : 90 });
        },
        runSync: (_command, args) => ({
          command: "npm",
          args,
          exitCode: 0,
          elapsedMs: 5,
          outputTail: "docker output postgres://app_user:ueacd@127.0.0.1/db ueacd",
        }),
        now: fixedClock(),
      },
    );

    assert.equal(report.status, "PASSED");
    assert.deepEqual(executed, ["a", "b"]);
    assert.equal(report.summary.recommendedCaseName, "b");
    assert.equal(report.setup.map((entry) => entry.phase).join(","), "setup-reset,setup-up");
    assert.equal(report.cleanup[0].phase, "cleanup");
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, "reports/matrix.json"), "utf8")).status, "PASSED");
    assert.doesNotMatch(JSON.stringify(report), /postgres:\/\/app_user/u);
    assert.doesNotMatch(JSON.stringify(report), /ueacd/u);
  });

  it("stops after the first failed case when requested", async () => {
    const root = makeTempRoot();
    const executed = [];
    const report = await runIdentityPhaseMatrix(
      {
        ...defaults,
        out: "reports/matrix.json",
        manageDocker: "false",
        stopOnFailure: "true",
        cases: "a:2:8:2:32:16:32:16,b:4:8:2:32:16:32:16,c:6:8:2:32:16:32:16",
      },
      {
        root,
        runCase: async (matrixCase) => {
          executed.push(matrixCase.name);
          return matrixCase.name === "b" ? identityReport({ status: "FAILED", passwordLoginErrors: 1 }) : identityReport();
        },
        now: fixedClock(),
      },
    );

    assert.equal(report.status, "FAILED");
    assert.deepEqual(executed, ["a", "b"]);
    assert.equal(report.cases.find((entry) => entry.name === "c").status, "NOT_RUN");
  });
});

function identityReport(overrides = {}) {
  const status = overrides.status ?? "PASSED";
  const passwordLoginErrors = overrides.passwordLoginErrors ?? 0;
  const passwordLoginP99 = overrides.passwordLoginP99 ?? 80;
  const revokeCycleP99 = overrides.revokeCycleP99 ?? 120;
  const acquireMs = overrides.acquireMs ?? 300;
  return {
    status,
    phases: {
      passwordLogin: phase("passwordLogin", passwordLoginErrors, passwordLoginP99),
      principalLookup: phase("principalLookup", 0, 55),
      refreshRotation: phase("refreshRotation", 0, 65),
      revokeCycle: phase("revokeCycle", 0, revokeCycleP99),
    },
    gatewayDatabasePhaseDiagnostics: {
      passwordLogin: diagnostics(acquireMs, { saveSession: { count: 64, totalElapsedMs: 128, averageElapsedMs: 2 } }),
      principalLookup: diagnostics(100, { getPrincipalByAccessToken: { count: 64, totalElapsedMs: 64, averageElapsedMs: 1 } }),
      refreshRotation: diagnostics(200, { rotateRefreshSession: { count: 64, totalElapsedMs: 96, averageElapsedMs: 1.5 } }),
      revokeCycle: diagnostics(600, { revokeOwnSession: { count: 64, totalElapsedMs: 160, averageElapsedMs: 2.5 } }),
    },
  };
}

function phase(name, errors, p99) {
  return {
    name,
    errors,
    rps: 1000,
    latencyMs: {
      p95: p99 * 0.8,
      p99,
    },
  };
}

function diagnostics(acquireDurationMs, sessionOperations) {
  return {
    delta: {
      pool: {
        acquireCount: 64,
        acquireDurationMs,
        emptyAcquireWaitTimeMs: acquireDurationMs,
      },
      sessionOperations,
    },
  };
}

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ita-identity-phase-matrix-"));
}

function fixedClock() {
  let tick = 0;
  return () => `2026-06-02T00:00:0${tick++}.000Z`;
}
