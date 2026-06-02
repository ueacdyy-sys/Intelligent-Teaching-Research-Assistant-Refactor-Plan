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
      collectPgbouncerDiagnostics,
      extractFailureMessage,
      gatewayBaseUrls,
      inferFailurePhase,
      parsePsqlUnalignedRows,
      parseArgs,
      runIdentityHttpBenchmark,
      tailText,
      validateSessionDbPoolProfile,
      validateRuntimePortPlan,
    } = await import("./run-identity-http-benchmark.mjs");

    const options = parseArgs([
      "--concurrency",
      "512",
      "--operations",
      "1024",
      "--session-db-max-conns",
      "16",
      "--session-db-min-conns",
      "4",
      "--session-db-write-concurrency",
      "8",
      "--session-db-session-table-persistence",
      "unlogged",
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
              stats: {
                maxConns: 16,
                acquireCount: 10,
                writeLimiter: { enabled: true, limit: 8, waiting: 2, acquireWaitTimeMs: 33.25 },
              },
            },
          ],
        },
      },
      pgbouncerDiagnostics: {
        before: {
          status: "OK",
          sampledAt: "2026-05-31T00:00:00.000Z",
          queries: {
            stats: {
              status: "OK",
              rows: [{ database: "intelligent_teaching_assistant", total_xact_count: 42 }],
            },
          },
        },
      },
      postgresDiagnostics: {
        before: {
          status: "OK",
          sampledAt: "2026-05-31T00:00:00.000Z",
          queries: {
            activity: {
              status: "OK",
              rows: [{ state: "active", wait_event_type: "Lock", connections: 2 }],
            },
          },
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
    assert.equal(report.sessionDbMinConns, 4);
    assert.equal(report.sessionDbWriteConcurrency, 8);
    assert.equal(report.gatewayCount, 2);
    assert.deepEqual(report.gatewayDatabaseProfile, {
      workerCount: 2,
      sessionDbMaxConnsPerWorker: 16,
      sessionDbMaxConnsTotal: 32,
      sessionDbMinConnsPerWorker: 4,
      sessionDbMinConnsTotal: 8,
      sessionDbWriteConcurrencyPerWorker: 8,
      sessionDbWriteConcurrencyTotal: 16,
      sessionTablePersistence: "unlogged",
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
    assert.equal(report.gatewayDatabaseDiagnostics.before.gateways[0].stats.writeLimiter.waiting, 2);
    assert.equal(report.pgbouncerDiagnostics.before.queries.stats.rows[0].total_xact_count, 42);
    assert.equal(report.postgresDiagnostics.before.queries.activity.rows[0].wait_event_type, "Lock");
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
    }, {
      before: {
        status: "OK",
        sampledAt: "2026-05-31T00:00:00.000Z",
        queries: {
          pools: {
            status: "OK",
            rows: [{ database: "intelligent_teaching_assistant", cl_waiting: 0 }],
          },
        },
      },
    }, {
      before: {
        status: "OK",
        sampledAt: "2026-05-31T00:00:00.000Z",
        queries: {
          activity: {
            status: "OK",
            rows: [{ state: "active", wait_event_type: "IO", connections: 3 }],
          },
        },
      },
    });
    assert.equal(passedReport.gatewayWorkerCount, 2);
    assert.deepEqual(passedReport.gatewayDatabaseProfile, report.gatewayDatabaseProfile);
    assert.equal(passedReport.gatewayDatabaseDiagnostics.before.gateways[0].stats.acquireCount, 10);
    assert.equal(passedReport.pgbouncerDiagnostics.before.queries.pools.rows[0].cl_waiting, 0);
    assert.equal(passedReport.postgresDiagnostics.before.queries.activity.rows[0].connections, 3);
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
                  writeLimiter: {
                    enabled: true,
                    limit: 10,
                    inUse: 3,
                    waiting: 1,
                    acquireCount: 99,
                    acquireWaitTimeMs: 456.75,
                  },
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
            writeLimiter: {
              enabled: true,
              limit: 10,
              inUse: 3,
              waiting: 1,
              acquireCount: 99,
              acquireWaitTimeMs: 456.75,
            },
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
            writeLimiter: {
              enabled: true,
              limit: 10,
              inUse: 3,
              waiting: 1,
              acquireCount: 99,
              acquireWaitTimeMs: 456.75,
            },
          },
        },
      ],
    });
    assert(!JSON.stringify(diagnostics).includes("ueacd"));

    assert.deepEqual(
      parsePsqlUnalignedRows("database|total_xact_count|avg_query_count\nintelligent_teaching_assistant|42|3.5\n"),
      [
        {
          database: "intelligent_teaching_assistant",
          total_xact_count: 42,
          avg_query_count: 3.5,
        },
      ],
    );

    const pgbouncerOptions = parseArgs([
      "--pgbouncer-diagnostics",
      "true",
      "--pgbouncer-postgres-container",
      "ita-identity-session-postgres",
      "--pgbouncer-host",
      "identity-session-pgbouncer",
      "--pgbouncer-port",
      "6432",
      "--pgbouncer-user",
      "app_user",
      "--pgbouncer-database",
      "pgbouncer",
    ]);
    const observedQueries = [];
    const pgbouncerDiagnostics = collectPgbouncerDiagnostics(pgbouncerOptions, {
      now: () => "2026-05-31T00:00:00.000Z",
      spawnSync: (command, args) => {
        assert.equal(command, "docker");
        assert.equal(args[0], "exec");
        assert(args.includes("PGPASSWORD=ueacd"));
        const query = args.at(-1);
        observedQueries.push(query);
        if (query === "SHOW STATS;") {
          return {
            status: 0,
            stdout: "database|total_xact_count|total_query_time\nintelligent_teaching_assistant|42|123456\n",
            stderr: "",
          };
        }
        if (query === "SHOW POOLS;") {
          return {
            status: 0,
            stdout: "database|cl_active|cl_waiting|sv_active|sv_idle|sv_used\nintelligent_teaching_assistant|72|3|48|12|0\n",
            stderr: "",
          };
        }
        if (query === "SHOW CONFIG;") {
          return {
            status: 0,
            stdout: "key|value\npool_mode|transaction\nmax_db_connections|90\n",
            stderr: "",
          };
        }
        throw new Error(`unexpected query ${query}`);
      },
    });
    assert.deepEqual(observedQueries, ["SHOW STATS;", "SHOW POOLS;", "SHOW CONFIG;"]);
    assert.equal(pgbouncerDiagnostics.status, "OK");
    assert.equal(pgbouncerDiagnostics.sampledAt, "2026-05-31T00:00:00.000Z");
    assert.equal(pgbouncerDiagnostics.queries.stats.rows[0].total_xact_count, 42);
    assert.equal(pgbouncerDiagnostics.queries.pools.rows[0].cl_waiting, 3);
    assert.equal(pgbouncerDiagnostics.queries.config.rows[1].value, 90);
    assert(!JSON.stringify(pgbouncerDiagnostics).includes("ueacd"));

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
      dockerCommand.args.slice(-16),
      [
        "-base-url",
        "http://host.docker.internal:18080,http://host.docker.internal:18081",
        "-gateway-diagnostics-base-url",
        "http://host.docker.internal:18100",
        "-gateway-diagnostics-secret",
        "ueacd",
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
    assert.doesNotThrow(() => validateSessionDbPoolProfile(options));
    assert.throws(
      () => validateSessionDbPoolProfile(parseArgs([
        "--session-db-max-conns",
        "8",
        "--session-db-min-conns",
        "9",
      ])),
      /session-db-min-conns must be <= session-db-max-conns/u,
    );
    assert.throws(
      () => validateSessionDbPoolProfile(parseArgs([
        "--session-db-min-conns",
        "-1",
      ])),
      /session-db-min-conns must be non-negative/u,
    );
    assert.throws(
      () => validateSessionDbPoolProfile(parseArgs([
        "--session-db-min-conns",
        "warm",
      ])),
      /session-db-min-conns must be an integer/u,
    );
  });

  it("passes session DB min connections to gateway processes", async () => {
    const {
      runIdentityHttpBenchmark,
    } = await import("./run-identity-http-benchmark.mjs");

    const spawned = [];
    const handle = () => ({
      exitCode: 1,
      stdout: { on() {} },
      stderr: { on() {} },
    });
    const exitCode = await runIdentityHttpBenchmark([
      "--base-url",
      "http://127.0.0.1:18100",
      "--out",
      "tmp/identity-min-conns-report.json",
      "--session-db-max-conns",
      "8",
      "--session-db-min-conns",
      "4",
      "--session-db-write-concurrency",
      "0",
      "--startup-timeout-ms",
      "100",
    ], {
      spawn: (command, args, options) => {
        spawned.push({ command, args, env: options.env });
        return handle();
      },
      spawnSync: () => ({ status: 0, stdout: "", stderr: "" }),
      fetch: async () => ({ ok: true, status: 200, async json() { return { status: "ok", stats: {} }; } }),
      sleep: async () => {},
    });

    assert.equal(exitCode, 1);
    assert.equal(spawned[0].command, "go");
    assert.deepEqual(spawned[0].args, ["run", "./services/identity-access-gateway/cmd/gateway"]);
    assert.equal(spawned[0].env.SESSION_DB_MAX_CONNS, "8");
    assert.equal(spawned[0].env.SESSION_DB_MIN_CONNS, "4");
    fs.rmSync("tmp/identity-min-conns-report.json", { force: true });
  });
});
