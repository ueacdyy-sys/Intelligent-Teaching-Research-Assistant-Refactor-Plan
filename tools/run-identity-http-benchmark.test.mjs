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
      addRuntimeProfileToReport,
      benchmarkRuntimeProfile,
      buildBenchmarkCommand,
      collectGatewayDatabaseDiagnostics,
      extractFailureMessage,
      gatewayBaseUrls,
      inferFailurePhase,
      parseArgs,
      runIdentityHttpBenchmark,
      tailText,
      validateRuntimePortPlan,
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
      gatewayDatabaseDiagnostics: {
        before: {
          endpoint: "/internal/identity/session-db-pool",
          secretHeader: "X-Internal-Diagnostics-Secret",
          sampledAt: "2026-05-31T00:00:00.000Z",
          gateways: [
            {
              baseUrl: "http://127.0.0.1:18100",
              status: "OK",
              stats: { maxConns: 16, acquireCount: 10 },
            },
          ],
        },
      },
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
    assert.deepEqual(report.gatewayDatabaseProfile, {
      workerCount: 2,
      sessionDbMaxConnsPerWorker: 16,
      sessionDbMaxConnsTotal: 32,
    });
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
    assert.deepEqual(report.benchmarkRuntimeProfile, {
      executor: "LOCAL_GO",
      dockerImage: null,
      dockerHostAlias: null,
      targetBaseUrls: ["http://127.0.0.1:18080", "http://127.0.0.1:18081"],
    });
    assert.equal(report.exitCode, 1);
    assert.equal(report.gatewayExitCode, null);
    assert.equal(report.gatewaySignal, null);
    assert.equal(report.phase, "passwordLogin");
    assert.equal(report.gatewayDatabaseDiagnostics.before.gateways[0].stats.maxConns, 16);
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

    const passedReport = addRuntimeProfileToReport({
      status: "PASSED",
      baseUrl: "http://127.0.0.1:18080",
    }, options, {
      before: {
        endpoint: "/internal/identity/session-db-pool",
        secretHeader: "X-Internal-Diagnostics-Secret",
        sampledAt: "2026-05-31T00:00:00.000Z",
        gateways: [
          {
            baseUrl: "http://127.0.0.1:18100",
            status: "OK",
            stats: { maxConns: 16, acquireCount: 10 },
          },
        ],
      },
    });
    assert.equal(passedReport.gatewayWorkerCount, 2);
    assert.deepEqual(passedReport.gatewayDatabaseProfile, report.gatewayDatabaseProfile);
    assert.equal(passedReport.gatewayDatabaseDiagnostics.before.gateways[0].stats.acquireCount, 10);
    assert.deepEqual(passedReport.ingressProfile, report.ingressProfile);
    assert.deepEqual(passedReport.benchmarkRuntimeProfile, report.benchmarkRuntimeProfile);

    const diagnostics = await collectGatewayDatabaseDiagnostics(
      ["http://127.0.0.1:18100", "http://127.0.0.1:18101"],
      {
        now: () => "2026-05-31T00:00:00.000Z",
        fetch: async (url, init) => {
          assert.match(url, /^http:\/\/127\.0\.0\.1:1810[01]\/internal\/identity\/session-db-pool$/u);
          assert.equal(init.headers["X-Internal-Diagnostics-Secret"], "ueacd");
          return {
            ok: true,
            status: 200,
            async json() {
              return {
                status: "ok",
                stats: {
                  maxConns: 12,
                  totalConns: 9,
                  acquiredConns: 7,
                  acquireCount: 42,
                },
              };
            },
          };
        },
      },
    );
    assert.deepEqual(diagnostics, {
      endpoint: "/internal/identity/session-db-pool",
      secretHeader: "X-Internal-Diagnostics-Secret",
      sampledAt: "2026-05-31T00:00:00.000Z",
      gateways: [
        {
          baseUrl: "http://127.0.0.1:18100",
          status: "OK",
          httpStatus: 200,
          stats: {
            maxConns: 12,
            totalConns: 9,
            acquiredConns: 7,
            acquireCount: 42,
          },
        },
        {
          baseUrl: "http://127.0.0.1:18101",
          status: "OK",
          httpStatus: 200,
          stats: {
            maxConns: 12,
            totalConns: 9,
            acquiredConns: 7,
            acquireCount: 42,
          },
        },
      ],
    });
    assert(!JSON.stringify(diagnostics).includes("ueacd"));

    assert.throws(
      () => validateRuntimePortPlan(parseArgs([
        "--base-url",
        "http://127.0.0.1:18100",
        "--gateway-count",
        "6",
        "--ingress-proxy",
        "true",
        "--ingress-port",
        "18080",
        "--ingress-count",
        "22",
      ])),
      /ingress\/gateway port overlap: 18100, 18101/u,
    );
    assert.doesNotThrow(() => validateRuntimePortPlan(parseArgs([
      "--base-url",
      "http://127.0.0.1:18100",
      "--gateway-count",
      "6",
      "--ingress-proxy",
      "true",
      "--ingress-port",
      "19080",
      "--ingress-count",
      "22",
    ])));

    fs.mkdirSync("tmp", { recursive: true });
    const overlapReportDir = fs.mkdtempSync("tmp/identity-overlap-");
    const overlapReportPath = `${overlapReportDir}/report.json`;
    let spawned = false;
    const overlapExitCode = await runIdentityHttpBenchmark([
      "--base-url",
      "http://127.0.0.1:18100",
      "--gateway-count",
      "6",
      "--ingress-proxy",
      "true",
      "--ingress-port",
      "18080",
      "--ingress-count",
      "22",
      "--out",
      overlapReportPath,
    ], {
      consoleError: () => {},
      spawn: () => {
        spawned = true;
        throw new Error("spawn should not run");
      },
    });
    assert.equal(overlapExitCode, 1);
    assert.equal(spawned, false);
    const overlapReport = JSON.parse(fs.readFileSync(overlapReportPath, "utf8"));
    assert.equal(overlapReport.status, "FAILED");
    assert.match(overlapReport.errorMessage, /ingress\/gateway port overlap: 18100, 18101/u);
    assert(!JSON.stringify(overlapReport).includes("ueacd"));
    fs.rmSync(overlapReportDir, { recursive: true, force: true });

    const dockerOptions = parseArgs([
      "--benchmark-runtime",
      "docker",
      "--benchmark-docker-image",
      "golang:1.26-alpine",
      "--benchmark-docker-host",
      "host.docker.internal",
      "--ingress-proxy",
      "true",
      "--ingress-port",
      "18080",
      "--ingress-count",
      "2",
      "--concurrency",
      "3200",
      "--operations",
      "6400",
      "--out",
      "reports/dockerized.json",
    ]);
    const dockerCommand = buildBenchmarkCommand(dockerOptions, ["http://127.0.0.1:18080", "http://127.0.0.1:18081"]);
    assert.equal(dockerCommand.command, "docker");
    assert.deepEqual(dockerCommand.args.slice(0, 7), [
      "run",
      "--rm",
      "-v",
      `${process.cwd()}:/workspace`,
      "-w",
      "/workspace",
      "golang:1.26-alpine",
    ]);
    assert.deepEqual(
      dockerCommand.args.slice(-12),
      [
        "-base-url",
        "http://host.docker.internal:18080,http://host.docker.internal:18081",
        "-out",
        "reports/dockerized.json",
        "-concurrency",
        "3200",
        "-operations",
        "6400",
        "-max-conns-per-host",
        "0",
        "-warm-connections-per-host",
        "0",
      ],
    );
    assert.deepEqual(benchmarkRuntimeProfile(dockerOptions, ["http://127.0.0.1:18080"]), {
      executor: "DOCKER_GO",
      dockerImage: "golang:1.26-alpine",
      dockerHostAlias: "host.docker.internal",
      targetBaseUrls: ["http://host.docker.internal:18080"],
    });
  });
});
