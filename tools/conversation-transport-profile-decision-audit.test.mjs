import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditConversationTransportProfileDecision,
  defaultTransportReports,
  formatConversationTransportProfileDecisionAudit,
} from "./conversation-transport-profile-decision-audit.mjs";

describe("conversation transport profile decision audit", () => {
  it("selects unlimited transport for the current 5800 low-tail profile", () => {
    const report = auditConversationTransportProfileDecision({
      reports: reportsFromObjects([
        benchmark({ path: "capped5800.json", concurrency: 5800, maxConnsPerHost: 362, p99: 409.92 }),
        benchmark({ path: "unlimited5800.json", concurrency: 5800, maxConnsPerHost: 0, p99: 349.9 }),
        benchmark({ path: "unlimited6200.json", concurrency: 6200, maxConnsPerHost: 0, p99: 407.05, status: "FAILED", errors: 1 }),
        benchmark({ path: "capped6200.json", concurrency: 6200, maxConnsPerHost: 388, p99: 549.6 }),
      ]),
      transportReports: [
        { path: "capped5800.json", role: "low-tail-capped" },
        { path: "unlimited5800.json", role: "low-tail-unlimited" },
        { path: "unlimited6200.json", role: "edge-unlimited" },
        { path: "capped6200.json", role: "edge-capped" },
      ],
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.decisions.lowTail.recommendation, "USE_UNLIMITED_TRANSPORT");
    assert.equal(report.decisions.lowTail.selected.maxConnsPerHost, 0);
    assert.equal(report.decisions.edgeStability.recommendation, "KEEP_CAPPED_EDGE_GUARD");
    assert.equal(report.negativeTransportProbes[0].concurrency, 6200);
    assert.match(formatConversationTransportProfileDecisionAudit(report), /Conversation transport profile decision: READY/);
  });

  it("fails readiness when a configured source report is missing", () => {
    const report = auditConversationTransportProfileDecision({
      reports: reportsFromObjects([
        benchmark({ path: "unlimited5800.json", concurrency: 5800, maxConnsPerHost: 0, p99: 349.9 }),
      ]),
      transportReports: [
        { path: "unlimited5800.json", role: "low-tail-unlimited" },
        { path: "capped5800.json", role: "low-tail-capped" },
      ],
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "sources.present").passed, false);
  });

  it("allows a better capped same-concurrency profile to change the low-tail recommendation", () => {
    const report = auditConversationTransportProfileDecision({
      reports: reportsFromObjects([
        benchmark({ path: "capped5800.json", concurrency: 5800, maxConnsPerHost: 362, p99: 300 }),
        benchmark({ path: "unlimited5800.json", concurrency: 5800, maxConnsPerHost: 0, p99: 349.9 }),
      ]),
      transportReports: [
        { path: "capped5800.json", role: "low-tail-capped" },
        { path: "unlimited5800.json", role: "low-tail-unlimited" },
      ],
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.decisions.lowTail.recommendation, "USE_CAPPED_TRANSPORT");
    assert.equal(report.decisions.lowTail.selected.maxConnsPerHost, 362);
  });

  it("does not recommend transport changes when database acquisition dominates", () => {
    const report = auditConversationTransportProfileDecision({
      reports: reportsFromObjects([
        benchmark({ path: "capped5800.json", concurrency: 5800, maxConnsPerHost: 362, p99: 409.92, dbAcquireP99: 80 }),
        benchmark({ path: "unlimited5800.json", concurrency: 5800, maxConnsPerHost: 0, p99: 349.9, dbAcquireP99: 60 }),
      ]),
      transportReports: [
        { path: "capped5800.json", role: "low-tail-capped" },
        { path: "unlimited5800.json", role: "low-tail-unlimited" },
      ],
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.decisions.lowTail.recommendation, "INVESTIGATE_DATABASE_ACQUIRE");
    assert.equal(report.findings.find((finding) => finding.id === "database.acquire_not_bottleneck").passed, false);
  });

  it("uses the current direct16 transport source set by default", () => {
    assert.deepEqual(defaultTransportReports.map((entry) => entry.path), [
      "reports/conversation-write-http-benchmark.direct16-concurrency5800-multi16-pool1-client362-batched64-delay0.json",
      "reports/conversation-write-http-benchmark.direct16-concurrency5800-multi16-pool1-client-unlimited-batched64-delay0.json",
      "reports/conversation-write-http-benchmark.direct16-concurrency6200-multi16-pool1-client-unlimited-batched64-delay0.json",
      "reports/conversation-write-http-benchmark.direct16-concurrency6200-multi16-pool1-client388-batched64-delay0.json",
      "reports/conversation-write-http-benchmark.direct16-concurrency6400-multi16-pool1-client400-batched64-delay0.json",
    ]);
  });
});

function reportsFromObjects(values) {
  return Object.fromEntries(values.map((value) => [value.path, JSON.stringify(value.report)]));
}

function benchmark(options) {
  const status = options.status ?? "PASSED";
  const errors = options.errors ?? 0;
  return {
    path: options.path,
    report: {
      benchmarkKind: "conversation_write_gateway",
      workloadType: "HTTP_BENCHMARK",
      status,
      gatewayCount: 16,
      gatewayWorkerCount: 16,
      concurrency: options.concurrency,
      operations: options.concurrency * 2,
      transportProfile: {
        maxConnsPerHost: options.maxConnsPerHost,
        warmConnectionsPerHost: Math.ceil(options.concurrency / 16),
        warmConnectionsTotal: Math.ceil(options.concurrency / 16) * 16,
      },
      phases: {
        createConversation: {
          operations: options.concurrency * 2,
          errors,
          firstError: errors > 0 ? "bind: An operation on a socket could not be performed because the system lacked sufficient buffer" : undefined,
          rps: options.rps ?? 20000,
          latencyMs: {
            p95: options.p99 * 0.8,
            p99: options.p99,
          },
          serverTimingMs: {
            p99: options.serverP99 ?? 80,
          },
          clientServerGapMs: {
            p99: options.gapP99 ?? options.p99 * 0.8,
          },
          serverTimingBreakdownMs: {
            "db.acquire": {
              p99: options.dbAcquireP99 ?? 0,
            },
            "db.insert": {
              p99: options.dbInsertP99 ?? 40,
            },
          },
        },
      },
      gatewayDatabaseProfile: {
        dbMaxConnsPerWorker: 1,
        dbMaxConnsTotal: 16,
      },
    },
  };
}
