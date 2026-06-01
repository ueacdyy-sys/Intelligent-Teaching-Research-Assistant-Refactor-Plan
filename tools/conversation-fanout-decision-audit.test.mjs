import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditConversationFanoutDecision,
  defaultCandidateReports,
  formatConversationFanoutDecisionAudit,
} from "./conversation-fanout-decision-audit.mjs";

const budget = {
  services: [
    {
      name: "conversation-write-gateway-via-pgbouncer",
      instances: 1,
      maxConns: 16,
    },
  ],
};

describe("conversation fanout decision audit", () => {
  it("keeps direct16 for the current 30000-concurrency WSL evidence", () => {
    const report = auditConversationFanoutDecision({
      reports: reportsFromObjects([
        benchmark({ workers: 16, status: "PASSED", p99: 1795.33, gapP99: 1772.63, rps: 21955.1 }),
        benchmark({ workers: 24, status: "PASSED", p99: 2329.34, gapP99: 2289.15, rps: 19965.78 }),
        benchmark({ workers: 32, status: "FAILED", p99: 2452.78, gapP99: 2378.49, rps: 20348.37, errors: 6 }),
      ]),
      budget,
      candidateReports: [
        { path: "direct16.json", role: "baseline" },
        { path: "direct24.json", role: "candidate" },
        { path: "direct32.json", role: "candidate" },
      ],
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.decision, "KEEP_DIRECT16");
    assert.equal(report.recommendedGatewayCount, 16);
    assert.equal(report.recommendedDbMaxConnsPerGateway, 1);
    assert.equal(report.negativeProbes.length, 1);
    assert.equal(report.negativeProbes[0].gatewayWorkerCount, 32);
    assert.match(formatConversationFanoutDecisionAudit(report), /Conversation fanout decision: READY/);
  });

  it("fails readiness when an expected source report is missing", () => {
    const report = auditConversationFanoutDecision({
      reports: reportsFromObjects([
        benchmark({ workers: 16, status: "PASSED", p99: 1795.33, gapP99: 1772.63, rps: 21955.1 }),
      ]),
      budget,
      candidateReports: [
        { path: "direct16.json", role: "baseline" },
        { path: "direct24.json", role: "candidate" },
      ],
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "sources.present").passed, false);
  });

  it("allows a better zero-error higher-fanout report to change the recommendation", () => {
    const report = auditConversationFanoutDecision({
      reports: reportsFromObjects([
        benchmark({ workers: 16, status: "PASSED", p99: 1795.33, gapP99: 1772.63, rps: 21955.1 }),
        benchmark({ workers: 24, status: "PASSED", p99: 1200, gapP99: 1100, rps: 26000 }),
      ]),
      budget: {
        services: [
          {
            name: "conversation-write-gateway-via-pgbouncer",
            maxConns: 24,
          },
        ],
      },
      candidateReports: [
        { path: "direct16.json", role: "baseline" },
        { path: "direct24.json", role: "candidate" },
      ],
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.decision, "PROMOTE_DIRECT24");
    assert.equal(report.recommendedGatewayCount, 24);
  });

  it("fails when the proposed connection budget does not match the selected fanout", () => {
    const report = auditConversationFanoutDecision({
      reports: reportsFromObjects([
        benchmark({ workers: 16, status: "PASSED", p99: 1795.33, gapP99: 1772.63, rps: 21955.1 }),
        benchmark({ workers: 24, status: "PASSED", p99: 2329.34, gapP99: 2289.15, rps: 19965.78 }),
      ]),
      budget: {
        services: [
          {
            name: "conversation-write-gateway-via-pgbouncer",
            maxConns: 24,
          },
        ],
      },
      candidateReports: [
        { path: "direct16.json", role: "baseline" },
        { path: "direct24.json", role: "candidate" },
      ],
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "budget.selected_fanout").passed, false);
  });

  it("uses the current WSL fanout source report set by default", () => {
    assert.deepEqual(defaultCandidateReports.map((candidate) => candidate.path), [
      "reports/conversation-write-http-benchmark.wsl-direct16-concurrency30000-batched64.json",
      "reports/conversation-write-http-benchmark.wsl-direct24-concurrency30000-batched64.json",
      "reports/conversation-write-http-benchmark.wsl-direct32-concurrency30000-batched64.json",
    ]);
  });
});

function reportsFromObjects(values) {
  return Object.fromEntries(values.map((value) => [value.path, JSON.stringify(value.report)]));
}

function benchmark(options) {
  const path = `direct${options.workers}.json`;
  const errors = options.errors ?? 0;
  const report = {
    benchmarkKind: "conversation_write_gateway",
    workloadType: "HTTP_BENCHMARK",
    status: options.status,
    gatewayWorkerCount: options.workers,
    gatewayCount: options.workers,
    concurrency: 30000,
    operations: 60000,
    phases: {
      createConversation: {
        operations: 60000,
        errors,
        firstError: errors > 0 ? "read: connection reset by peer" : undefined,
        rps: options.rps,
        latencyMs: {
          p95: options.p95 ?? options.p99 * 0.85,
          p99: options.p99,
        },
        serverTimingMs: {
          p99: options.serverP99 ?? 180,
        },
        serverTimingBreakdownMs: {
          "db.acquire": {
            p99: options.dbAcquireP99 ?? 0,
          },
          "db.insert": {
            p99: options.dbInsertP99 ?? 100,
          },
        },
        clientServerGapMs: {
          p99: options.gapP99,
        },
      },
    },
    gatewayDatabaseProfile: {
      workerCount: options.workers,
      dbMaxConnsPerWorker: 1,
      dbMaxConnsTotal: options.workers,
    },
    gatewayWriteProfile: {
      batchingEnabled: true,
      batchSize: 64,
      batchDelayMs: 0,
    },
    benchmarkRuntimeProfile: {
      executor: "WSL_GO",
    },
    gatewayRuntimeDiagnostics: {
      after: {
        gateways: Array.from({ length: options.workers }, (_, index) => ({
          stats: {
            maxCurrentConns: 1000 + index,
          },
        })),
      },
    },
  };
  return { path, report };
}
