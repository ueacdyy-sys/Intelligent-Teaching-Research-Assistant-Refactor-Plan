import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditConversationClientTraceAttribution,
  defaultTraceReportPath,
  formatConversationClientTraceAttributionAudit,
} from "./conversation-client-trace-attribution-audit.mjs";

describe("conversation client trace attribution audit", () => {
  it("classifies the current trace evidence as transport plus pre-handler gap", () => {
    const report = auditConversationClientTraceAttribution({
      reports: {
        "trace.json": JSON.stringify(traceReport()),
      },
      sourceReportPath: "trace.json",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.attribution.primary, "CLIENT_TRANSPORT_WAIT");
    assert.equal(report.attribution.secondary, "PRE_HANDLER_OR_LISTENER_GAP");
    assert.equal(report.databaseBottleneck, false);
    assert.equal(report.metrics.dbAcquireP99Ms, 0);
    assert.match(formatConversationClientTraceAttributionAudit(report), /Conversation client trace attribution: READY/);
  });

  it("fails readiness when the report is missing", () => {
    const report = auditConversationClientTraceAttribution({
      reports: {},
      sourceReportPath: "missing.json",
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.present").passed, false);
  });

  it("fails readiness when client trace samples are absent", () => {
    const source = traceReport();
    delete source.phases.createConversation.clientTraceBreakdownMs;
    delete source.phases.createConversation.clientTraceBreakdownSamples;

    const report = auditConversationClientTraceAttribution({
      reports: {
        "trace.json": JSON.stringify(source),
      },
      sourceReportPath: "trace.json",
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "trace.required_metrics").passed, false);
  });

  it("does not assign the bottleneck to transport when database acquisition dominates", () => {
    const source = traceReport();
    source.phases.createConversation.serverTimingBreakdownMs["db.acquire"].p99 = 80;

    const report = auditConversationClientTraceAttribution({
      reports: {
        "trace.json": JSON.stringify(source),
      },
      sourceReportPath: "trace.json",
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.databaseBottleneck, true);
    assert.equal(report.attribution.primary, "DATABASE_ACQUIRE_WAIT");
    assert.equal(report.findings.find((finding) => finding.id === "database.acquire_not_bottleneck").passed, false);
  });

  it("changes attribution when response body read dominates the trace gap", () => {
    const source = traceReport({
      transportWaitP99: 15,
      firstByteAppGapP99: 20,
      responseBodyReadP99: 180,
    });

    const report = auditConversationClientTraceAttribution({
      reports: {
        "trace.json": JSON.stringify(source),
      },
      sourceReportPath: "trace.json",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.attribution.primary, "RESPONSE_BODY_READ_BACKPRESSURE");
  });

  it("points at the current client-trace report by default", () => {
    assert.equal(
      defaultTraceReportPath,
      "reports/conversation-write-http-benchmark.direct16-concurrency5800-multi16-pool1-client362-batched64-delay0-client-trace.json",
    );
  });
});

function traceReport(overrides = {}) {
  const operations = overrides.operations ?? 11600;
  const p99 = overrides.p99 ?? 490.93;
  const serverP99 = overrides.serverP99 ?? 91.56;
  const gapP99 = overrides.gapP99 ?? 448.59;
  const transportWaitP99 = overrides.transportWaitP99 ?? 272.53;
  const firstByteAppGapP99 = overrides.firstByteAppGapP99 ?? 227.29;
  const responseBodyReadP99 = overrides.responseBodyReadP99 ?? 76.24;
  return {
    benchmarkKind: "conversation_write_gateway",
    workloadType: "HTTP_BENCHMARK",
    status: "PASSED",
    clientTraceEnabled: true,
    gatewayCount: 16,
    concurrency: 5800,
    operations,
    transportProfile: {
      maxConnsPerHost: 362,
      warmConnectionsPerHost: 362,
      warmConnectionsTotal: 5792,
    },
    phases: {
      createConversation: {
        operations,
        errors: 0,
        rps: 17621.79,
        latencyMs: {
          p99,
        },
        serverTimingMs: {
          p99: serverP99,
        },
        serverTimingBreakdownMs: {
          app: {
            p99: serverP99,
          },
          "db.acquire": {
            p99: overrides.dbAcquireP99 ?? 0,
          },
          "db.insert": {
            p99: 58.19,
          },
        },
        serverTimingBreakdownSamples: {
          app: operations,
          "db.acquire": operations,
          "db.insert": operations,
        },
        clientServerGapMs: {
          p99: gapP99,
        },
        clientServerGapSamples: operations,
        clientTraceBreakdownMs: {
          "client.transport_wait": {
            p99: transportWaitP99,
          },
          "client.first_byte_app_gap": {
            p99: firstByteAppGapP99,
          },
          "client.response_body_read": {
            p99: responseBodyReadP99,
          },
          "client.request_write": {
            p99: overrides.requestWriteP99 ?? 97.81,
          },
          "client.request_prepare": {
            p99: overrides.requestPrepareP99 ?? 22.69,
          },
          "client.first_response_byte_wait": {
            p99: overrides.firstResponseByteWaitP99 ?? 306.18,
          },
          "client.round_trip": {
            p99: overrides.roundTripP99 ?? 442.37,
          },
        },
        clientTraceBreakdownSamples: {
          "client.transport_wait": operations,
          "client.first_byte_app_gap": operations,
          "client.response_body_read": operations,
          "client.request_write": operations,
          "client.request_prepare": operations,
          "client.first_response_byte_wait": operations,
          "client.round_trip": operations,
        },
      },
    },
  };
}
