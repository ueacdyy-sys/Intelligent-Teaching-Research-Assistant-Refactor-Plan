import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

const runnerPath = new URL("./run-identity-http-benchmark.mjs", import.meta.url);

describe("identity HTTP benchmark runner failure evidence", () => {
  it("builds a machine-readable FAILED report without running Go or Docker", async () => {
    const source = fs.readFileSync(runnerPath, "utf8");
    assert.match(source, /export function buildFailureReport/);

    const {
      buildFailureReport,
      addIngressProfileToReport,
      extractFailureMessage,
      gatewayBaseUrls,
      inferFailurePhase,
      parseArgs,
      tailText,
    } = await import("./run-identity-http-benchmark.mjs");

    const options = parseArgs([
      "--concurrency",
      "512",
      "--operations",
      "1024",
      "--session-db-max-conns",
      "16",
      "--gateway-count",
      "2",
      "--max-conns-per-host",
      "256",
      "--warm-connections-per-host",
      "128",
      "--ingress-proxy",
      "true",
      "--ingress-port",
      "18080",
      "--ingress-count",
      "2",
      "--ingress-max-conns-per-host",
      "300",
      "--ingress-warm-connections-per-host",
      "300",
      "--out",
      "reports/identity-http-benchmark.concurrency512.json",
    ]);
    const report = buildFailureReport({
      options,
      exitCode: 1,
      gatewayExitCode: null,
      gatewaySignal: null,
      errorMessage: "passwordLogin failed with 354 errors; first error: password=ueacd",
      gatewayOutput: "ready\npanic: password=ueacd\nstack line",
      benchmarkOutput: "passwordLogin failed with 354 errors",
      generatedAt: "2026-05-31T00:00:00.000Z",
    });

    assert.equal(report.benchmarkKind, "identity_http_gateway");
    assert.equal(report.workloadType, "HTTP_BENCHMARK");
    assert.equal(report.status, "FAILED");
    assert.equal(report.baseUrl, "http://127.0.0.1:18100");
    assert.equal(report.concurrency, 512);
    assert.equal(report.operationsPerPhase, 1024);
    assert.equal(report.sessionDbMaxConns, 16);
    assert.equal(report.gatewayCount, 2);
    assert.deepEqual(report.transportProfile, {
      maxConnsPerHost: 256,
      warmConnectionsPerHost: 128,
      warmConnectionsTotal: 256,
    });
    assert.deepEqual(report.gatewayBaseUrls, ["http://127.0.0.1:18100", "http://127.0.0.1:18101"]);
    assert.equal(report.loadBalancingStrategy, "ROUND_ROBIN");
    assert.deepEqual(report.ingressProfile, {
      enabled: true,
      workerCount: 2,
      baseUrl: "http://127.0.0.1:18080",
      baseUrls: ["http://127.0.0.1:18080", "http://127.0.0.1:18081"],
      upstreamBaseUrls: ["http://127.0.0.1:18100", "http://127.0.0.1:18101"],
      upstreamTransportProfile: {
        maxConnsPerHost: 300,
        warmConnectionsPerHost: 300,
        warmConnectionsTotal: 1200,
      },
    });
    assert.equal(report.dockerRequiredForEvidence, true);
    assert.equal(report.exitCode, 1);
    assert.equal(report.gatewayExitCode, null);
    assert.equal(report.gatewaySignal, null);
    assert.equal(report.phase, "passwordLogin");
    assert(!JSON.stringify(report).includes("ueacd"));
    assert(!JSON.stringify(report).includes("postgres://"));
    assert.equal(
      extractFailureMessage("passwordLogin failed with 354 errors\nexit status 1", 1),
      "passwordLogin failed with 354 errors",
    );
    assert.equal(inferFailurePhase("refreshRotation failed with 2 errors"), "refreshRotation");
    assert.equal(tailText("a\nb\nc", 2), "b\nc");
    assert.deepEqual(
      gatewayBaseUrls(parseArgs([
        "--base-url",
        "http://127.0.0.1:18100",
        "--gateway-count",
        "3",
      ])),
      ["http://127.0.0.1:18100", "http://127.0.0.1:18101", "http://127.0.0.1:18102"],
    );

    const passedReport = addIngressProfileToReport({
      status: "PASSED",
      baseUrl: "http://127.0.0.1:18080",
    }, options);
    assert.equal(passedReport.gatewayWorkerCount, 2);
    assert.deepEqual(passedReport.ingressProfile, report.ingressProfile);
  });
});
