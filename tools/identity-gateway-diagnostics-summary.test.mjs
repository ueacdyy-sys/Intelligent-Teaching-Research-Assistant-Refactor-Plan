import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addRuntimeProfileToReport,
  buildFailureReport,
  parseArgs,
} from "./run-identity-http-benchmark.mjs";

describe("identity gateway write limiter diagnostics summary", () => {
  it("adds aggregate limiter deltas to successful benchmark reports", () => {
    const report = addRuntimeProfileToReport(
      { status: "PASSED" },
      parseArgs(["--gateway-count", "2", "--session-db-write-concurrency", "10"]),
      gatewayDiagnosticsWithWriteLimiter(),
    );

    assert.equal(report.gatewayWriteLimiterDiagnostics.before.enabledGateways, 2);
    assert.equal(report.gatewayWriteLimiterDiagnostics.after.configuredLimitTotal, 20);
    assert.deepEqual(report.gatewayWriteLimiterDiagnostics.delta, {
      acquireCount: 25,
      acquireWaitTimeMs: 425.5,
      canceledAcquireCount: 1,
      canceledAcquireWaitTimeMs: 9.25,
    });
  });

  it("adds aggregate limiter snapshots to failed benchmark reports", () => {
    const report = buildFailureReport({
      options: parseArgs(["--gateway-count", "2", "--session-db-write-concurrency", "10"]),
      exitCode: 1,
      errorMessage: "refreshRotation failed",
      gatewayDatabaseDiagnostics: { before: gatewayDiagnosticsWithWriteLimiter().before },
      generatedAt: "2026-05-31T00:00:00.000Z",
    });

    assert.equal(report.gatewayWriteLimiterDiagnostics.before.gatewayCount, 2);
    assert.equal(report.gatewayWriteLimiterDiagnostics.before.acquireWaitTimeMsTotal, 74.5);
    assert.equal(report.gatewayWriteLimiterDiagnostics.delta, undefined);
    assert(!JSON.stringify(report.gatewayWriteLimiterDiagnostics).includes("ueacd"));
  });

  it("omits the summary when diagnostics predate write limiter stats", () => {
    const report = addRuntimeProfileToReport(
      { status: "PASSED" },
      parseArgs(["--gateway-count", "1"]),
      {
        before: {
          gateways: [{ status: "OK", stats: { maxConns: 12, acquireCount: 4 } }],
        },
      },
    );

    assert.equal(report.gatewayWriteLimiterDiagnostics, undefined);
  });
});

function gatewayDiagnosticsWithWriteLimiter() {
  return {
    before: {
      sampledAt: "2026-05-31T00:00:00.000Z",
      gateways: [
        gateway(10, 2, 1, 5, 12.25, 0, 0),
        gateway(10, 1, 0, 7, 62.25, 0, 0),
      ],
    },
    after: {
      sampledAt: "2026-05-31T00:01:00.000Z",
      gateways: [
        gateway(10, 3, 0, 20, 220.5, 1, 9.25),
        gateway(10, 2, 0, 17, 279.5, 0, 0),
      ],
    },
  };
}

function gateway(limit, inUse, waiting, acquireCount, acquireWaitTimeMs, canceledAcquireCount, canceledWaitMs) {
  return {
    status: "OK",
    stats: {
      writeLimiter: {
        enabled: true,
        limit,
        inUse,
        waiting,
        acquireCount,
        acquireWaitTimeMs,
        canceledAcquireCount,
        canceledAcquireWaitTimeMs: canceledWaitMs,
      },
    },
  };
}
