import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditConversationLoadgenRuntimeDecision,
  defaultRuntimeReports,
  formatConversationLoadgenRuntimeDecisionAudit,
} from "./conversation-loadgen-runtime-decision-audit.mjs";

describe("conversation loadgen runtime decision audit", () => {
  it("selects Local Go for low tail and WSL Go for high concurrency", () => {
    const report = auditConversationLoadgenRuntimeDecision({
      reports: reportsFromObjects([
        benchmark({ path: "local5800.json", executor: "LOCAL_GO", concurrency: 5800, p99: 349.9, gapP99: 302.48 }),
        benchmark({ path: "wsl5800.json", executor: "WSL_GO", concurrency: 5800, p99: 490.92, gapP99: 351.43 }),
        benchmark({ path: "docker5800.json", executor: "DOCKER_GO", concurrency: 5800, p99: 1750.39, gapP99: 1743.82 }),
        benchmark({ path: "local6200-unlimited.json", executor: "LOCAL_GO", concurrency: 6200, p99: 407.05, status: "FAILED", errors: 1 }),
        benchmark({ path: "local6200-capped.json", executor: "LOCAL_GO", concurrency: 6200, p99: 549.6, maxConnsPerHost: 388 }),
        benchmark({ path: "wsl6200.json", executor: "WSL_GO", concurrency: 6200, p99: 397.16, gapP99: 352.6 }),
        benchmark({ path: "wsl8000.json", executor: "WSL_GO", concurrency: 8000, p99: 518.15, gapP99: 468.71 }),
        benchmark({ path: "wsl30000.json", executor: "WSL_GO", concurrency: 30000, p99: 1795.33, gapP99: 1772.63 }),
        benchmark({ path: "docker6200.json", executor: "DOCKER_GO", concurrency: 6200, p99: 2007.77, gapP99: 2000.08 }),
        benchmark({ path: "docker7000.json", executor: "DOCKER_GO", concurrency: 7000, p99: 2263.57, gapP99: 2254.58 }),
      ]),
      runtimeReports: runtimeReports(),
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.decisions.lowTail.recommendation, "USE_LOCAL_DIRECT_FOR_LOW_TAIL");
    assert.equal(report.decisions.lowTail.selected.executor, "LOCAL_GO");
    assert.equal(report.decisions.highConcurrency.recommendation, "USE_WSL_LOADGEN_FOR_HIGH_CONCURRENCY_EDGE");
    assert.equal(report.decisions.highConcurrency.selected.concurrency, 8000);
    assert.equal(report.decisions.burstCeiling.selected.concurrency, 30000);
    assert.equal(report.decisions.docker.recommendation, "DOCKER_RUNTIME_SMOKE_ONLY");
    assert.match(formatConversationLoadgenRuntimeDecisionAudit(report), /Conversation loadgen runtime decision: READY/);
  });

  it("fails readiness when a configured source report is missing", () => {
    const report = auditConversationLoadgenRuntimeDecision({
      reports: reportsFromObjects([
        benchmark({ path: "local5800.json", executor: "LOCAL_GO", concurrency: 5800, p99: 349.9 }),
      ]),
      runtimeReports: [
        { path: "local5800.json", role: "low-tail-local" },
        { path: "wsl5800.json", role: "low-tail-wsl" },
      ],
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "sources.present").passed, false);
  });

  it("keeps high-concurrency runtime undecided without WSL socket relief", () => {
    const report = auditConversationLoadgenRuntimeDecision({
      reports: reportsFromObjects([
        benchmark({ path: "local5800.json", executor: "LOCAL_GO", concurrency: 5800, p99: 349.9 }),
        benchmark({ path: "wsl5800.json", executor: "WSL_GO", concurrency: 5800, p99: 490.92 }),
        benchmark({ path: "docker5800.json", executor: "DOCKER_GO", concurrency: 5800, p99: 1750.39 }),
        benchmark({ path: "local6200-unlimited.json", executor: "LOCAL_GO", concurrency: 6200, p99: 407.05, status: "FAILED", errors: 1 }),
        benchmark({ path: "local6200-capped.json", executor: "LOCAL_GO", concurrency: 6200, p99: 549.6, maxConnsPerHost: 388 }),
        benchmark({ path: "wsl6200.json", executor: "WSL_GO", concurrency: 6200, p99: 700, status: "FAILED", errors: 1 }),
        benchmark({ path: "wsl8000.json", executor: "WSL_GO", concurrency: 8000, p99: 900 }),
        benchmark({ path: "wsl30000.json", executor: "WSL_GO", concurrency: 30000, p99: 1795.33 }),
        benchmark({ path: "docker6200.json", executor: "DOCKER_GO", concurrency: 6200, p99: 2007.77 }),
        benchmark({ path: "docker7000.json", executor: "DOCKER_GO", concurrency: 7000, p99: 2263.57 }),
      ]),
      runtimeReports: runtimeReports(),
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.wsl_relieves_local_socket_pressure").passed, false);
    assert.equal(report.decisions.highConcurrency.recommendation, "NO_HIGH_CONCURRENCY_RUNTIME");
  });

  it("does not recommend runtime changes when database acquisition dominates", () => {
    const report = auditConversationLoadgenRuntimeDecision({
      reports: reportsFromObjects([
        benchmark({ path: "local5800.json", executor: "LOCAL_GO", concurrency: 5800, p99: 349.9, dbAcquireP99: 80 }),
        benchmark({ path: "wsl5800.json", executor: "WSL_GO", concurrency: 5800, p99: 490.92, dbAcquireP99: 70 }),
        benchmark({ path: "docker5800.json", executor: "DOCKER_GO", concurrency: 5800, p99: 1750.39, dbAcquireP99: 60 }),
      ]),
      runtimeReports: [
        { path: "local5800.json", role: "low-tail-local" },
        { path: "wsl5800.json", role: "low-tail-wsl" },
        { path: "docker5800.json", role: "low-tail-docker" },
      ],
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.decisions.lowTail.recommendation, "INVESTIGATE_DATABASE_ACQUIRE");
    assert.equal(report.findings.find((finding) => finding.id === "database.acquire_not_bottleneck").passed, false);
  });

  it("uses the current Local, WSL, and Docker source set by default", () => {
    assert.deepEqual(defaultRuntimeReports.map((entry) => entry.path), [
      "reports/conversation-write-http-benchmark.direct16-concurrency5800-multi16-pool1-client-unlimited-batched64-delay0.json",
      "reports/conversation-write-http-benchmark.wsl-direct16-concurrency5800-batched64.json",
      "reports/conversation-write-http-benchmark.docker-direct16-concurrency5800-batched64.json",
      "reports/conversation-write-http-benchmark.direct16-concurrency6200-multi16-pool1-client-unlimited-batched64-delay0.json",
      "reports/conversation-write-http-benchmark.direct16-concurrency6200-multi16-pool1-client388-batched64-delay0.json",
      "reports/conversation-write-http-benchmark.wsl-direct16-concurrency6200-batched64.json",
      "reports/conversation-write-http-benchmark.wsl-direct16-concurrency8000-batched64.json",
      "reports/conversation-write-http-benchmark.wsl-direct16-concurrency30000-batched64.json",
      "reports/conversation-write-http-benchmark.docker-direct16-concurrency6200-batched64.json",
      "reports/conversation-write-http-benchmark.docker-direct16-concurrency7000-batched64.json",
    ]);
  });
});

function reportsFromObjects(values) {
  return Object.fromEntries(values.map((value) => [value.path, JSON.stringify(value.report)]));
}

function runtimeReports() {
  return [
    { path: "local5800.json", role: "low-tail-local" },
    { path: "wsl5800.json", role: "low-tail-wsl" },
    { path: "docker5800.json", role: "low-tail-docker" },
    { path: "local6200-unlimited.json", role: "edge-local-unlimited-negative" },
    { path: "local6200-capped.json", role: "edge-local-capped" },
    { path: "wsl6200.json", role: "edge-wsl-relief" },
    { path: "wsl8000.json", role: "edge-wsl-practical" },
    { path: "wsl30000.json", role: "burst-wsl-ceiling" },
    { path: "docker6200.json", role: "edge-docker-smoke" },
    { path: "docker7000.json", role: "edge-docker-smoke-confirmation" },
  ];
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
      concurrency: options.concurrency,
      operations: options.concurrency * 2,
      transportProfile: {
        maxConnsPerHost: options.maxConnsPerHost ?? 0,
        warmConnectionsPerHost: Math.ceil(options.concurrency / 16),
      },
      benchmarkRuntimeProfile: {
        executor: options.executor,
      },
      phases: {
        createConversation: {
          operations: options.concurrency * 2,
          errors,
          firstError: errors > 0 ? "bind: operation failed because the socket buffer queue was full" : undefined,
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
    },
  };
}
