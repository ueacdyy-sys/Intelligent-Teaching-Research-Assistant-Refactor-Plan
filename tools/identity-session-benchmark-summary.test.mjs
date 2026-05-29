import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatBenchmarkMarkdown,
  summarizeBenchmarkReports,
} from "./identity-session-benchmark-summary.mjs";

const pool4 = report({ concurrency: 64, poolMaxConns: 4, lookupP95: 43.85, refreshP95: 71.37, revokeP95: 177.28 });
const pool8 = report({ concurrency: 64, poolMaxConns: 8, lookupP95: 24.86, refreshP95: 42.47, revokeP95: 85.8 });
const pool16 = report({ concurrency: 64, poolMaxConns: 16, lookupP95: 21.88, refreshP95: 22.39, revokeP95: 46.7 });

describe("identity session benchmark summary", () => {
  it("sorts reports by concurrency and pool size", () => {
    const summary = summarizeBenchmarkReports([pool16, pool4, pool8]);

    assert.deepEqual(
      summary.rows.map((row) => [row.concurrency, row.poolMaxConns]),
      [[64, 4], [64, 8], [64, 16]],
    );
  });

  it("marks the best observed pool by revoke-cycle P95", () => {
    const summary = summarizeBenchmarkReports([pool4, pool8, pool16]);

    assert.equal(summary.bestByRevokeP95.poolMaxConns, 16);
    assert.equal(summary.bestByRevokeP95.revokeCycleP95MS, 46.7);
  });

  it("keeps the newest report for the same concurrency and pool size", () => {
    const oldPool8 = {
      ...pool8,
      generatedAt: "2026-05-29T00:00:00Z",
      phases: {
        ...pool8.phases,
        revokeCycle: {
          ...pool8.phases.revokeCycle,
          latencyMs: { p95: 93.41 },
        },
      },
    };
    const newPool8 = {
      ...pool8,
      generatedAt: "2026-05-29T01:00:00Z",
      phases: {
        ...pool8.phases,
        revokeCycle: {
          ...pool8.phases.revokeCycle,
          latencyMs: { p95: 85.8 },
        },
      },
    };

    const summary = summarizeBenchmarkReports([oldPool8, newPool8]);

    assert.equal(summary.rows.length, 1);
    assert.equal(summary.rows[0].revokeCycleP95MS, 85.8);
  });

  it("formats stable markdown tables", () => {
    const markdown = formatBenchmarkMarkdown(summarizeBenchmarkReports([pool4, pool8]));

    assert.match(markdown, /\| Concurrency \| Pool max conns \| Access lookup P95 \|/);
    assert.match(markdown, /\| 64 \| 8 \| 24.86ms \| 42.47ms \| 85.80ms \|/);
  });
});

function report({ concurrency, poolMaxConns, lookupP95, refreshP95, revokeP95 }) {
  return {
    generatedAt: "2026-05-29T00:00:00Z",
    concurrency,
    operationsPerPhase: 500,
    poolMaxConns,
    phases: {
      accessLookup: {
        operations: 500,
        errors: 0,
        rps: 1000,
        latencyMs: { p95: lookupP95 },
      },
      refreshRotation: {
        operations: 500,
        errors: 0,
        rps: 900,
        latencyMs: { p95: refreshP95 },
      },
      revokeCycle: {
        operations: 500,
        errors: 0,
        rps: 800,
        latencyMs: { p95: revokeP95 },
      },
    },
  };
}
