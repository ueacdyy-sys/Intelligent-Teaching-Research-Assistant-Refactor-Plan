import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

const runnerPath = new URL("./run-conversation-write-benchmark.mjs", import.meta.url);

describe("conversation write benchmark runner", () => {
  it("builds reproducible runtime profiles and sanitized failure reports", async () => {
    const source = fs.readFileSync(runnerPath, "utf8");
    assert.match(source, /export function buildFailureReport/);

    const {
      addRuntimeProfileToReport,
      benchmarkRuntimeProfile,
      buildBenchmarkCommand,
      buildFailureReport,
      collectGatewayCommandLogDiagnostics,
      collectGatewayDatabaseDiagnostics,
      collectGatewayRuntimeDiagnostics,
      gatewayBaseUrls,
      maskSensitive,
      parseArgs,
      validateLocalSecrets,
      validateRuntimePortPlan,
    } = await import("./run-conversation-write-benchmark.mjs");

    const options = parseArgs([
      "--base-url",
      "http://127.0.0.1:18080",
      "--gateway-count",
      "3",
      "--db-max-conns",
      "8",
      "--write-batch-size",
      "32",
      "--write-batch-delay-ms",
      "2",
      "--write-batch-workers",
      "4",
      "--write-batch-mode",
      "copy",
      "--agent-api-key",
      "ueacd",
      "--dsn",
      "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable",
      "--concurrency",
      "900",
      "--operations",
      "1800",
      "--max-conns-per-host",
      "300",
      "--warm-connections-per-host",
      "300",
      "--client-trace",
      "true",
      "--pgbouncer-diagnostics",
      "true",
      "--postgres-diagnostics",
      "true",
      "--out",
      "reports/conversation-write-http-benchmark.current.json",
    ]);

    assert.deepEqual(gatewayBaseUrls(options), [
      "http://127.0.0.1:18080",
      "http://127.0.0.1:18081",
      "http://127.0.0.1:18082",
    ]);
    validateRuntimePortPlan(options);
    validateLocalSecrets(options);

    const command = buildBenchmarkCommand(options, gatewayBaseUrls(options));
    assert.deepEqual(command.slice(0, 3), ["go", "run", "./services/conversation-write-gateway/cmd/httpbench"]);
    assert(command.includes("--base-url"));
    assert(command.includes("http://127.0.0.1:18080,http://127.0.0.1:18081,http://127.0.0.1:18082"));
    assert.equal(command[command.indexOf("--warm-connection-retries") + 1], "3");
    assert.equal(command[command.indexOf("--expected-status") + 1], "201");
    assert(command.includes("--client-trace"));

    const failed = buildFailureReport({
      options,
      exitCode: 1,
      gatewayExitCode: [null, null, null],
      errorMessage: "connect failed with password=ueacd and postgres://app_user:ueacd@localhost/db",
      gatewayOutput: "ready\npanic password=ueacd",
      benchmarkOutput: "createConversation failed",
      gatewayDatabaseDiagnostics: {
        before: {
          status: "OK",
          gateways: [{ stats: { maxConns: 10, emptyAcquireCount: 9 } }],
        },
      },
      gatewayCommandLogDiagnostics: {
        after: {
          status: "OK",
          gateways: [{ stats: { acceptedCommands: 10, projectionSucceeded: 9 } }],
        },
      },
      pgbouncerDiagnostics: {
        before: {
          status: "OK",
          queries: {
            pools: {
              status: "OK",
              rows: [{ database: "intelligent_teaching_assistant", cl_waiting: 0 }],
            },
          },
        },
      },
      postgresDiagnostics: {
        before: {
          status: "OK",
          queries: {
            activity: {
              status: "OK",
              rows: [{ state: "active", wait_event_type: "IO", wait_event: "WalSync", connections: 2 }],
            },
          },
        },
      },
      generatedAt: "2026-05-31T00:00:00.000Z",
    });

    assert.equal(failed.benchmarkKind, "conversation_write_gateway");
    assert.equal(failed.status, "FAILED");
    assert.equal(failed.gatewayCount, 3);
    assert.equal(failed.loadBalancingStrategy, "ROUND_ROBIN");
    assert.equal(failed.gatewayDatabaseProfile.dbMaxConnsTotal, 24);
    assert.equal(failed.clientTraceEnabled, true);
    assert.equal(failed.gatewayWriteProfile.batchingEnabled, true);
    assert.equal(failed.gatewayWriteProfile.batchSize, 32);
    assert.equal(failed.gatewayWriteProfile.batchDelayMs, 2);
    assert.equal(failed.gatewayWriteProfile.batchWorkers, 4);
    assert.equal(failed.gatewayWriteProfile.batchMode, "copy");
    assert.equal(failed.gatewayWriteProfile.acceptanceMode, "sync");
    assert.equal(failed.gatewayWriteProfile.commandLog, null);
    assert.deepEqual(failed.gatewayBaseUrls, gatewayBaseUrls(options));
    assert.equal(failed.gatewayDatabaseDiagnostics.before.gateways[0].stats.emptyAcquireCount, 9);
    assert.equal(failed.gatewayCommandLogDiagnostics.after.gateways[0].stats.acceptedCommands, 10);
    assert.equal(failed.pgbouncerDiagnostics.before.queries.pools.rows[0].cl_waiting, 0);
    assert.equal(failed.postgresDiagnostics.before.queries.activity.rows[0].wait_event, "WalSync");
    assert(!JSON.stringify(failed).includes("ueacd"));
    assert(!JSON.stringify(failed).includes("postgres://"));
    assert.equal(maskSensitive("token ueacd"), "token ***");

    const singleGatewayFailure = buildFailureReport({
      options: parseArgs(["--gateway-count", "1"]),
      exitCode: 1,
      generatedAt: "2026-05-31T00:00:00.000Z",
    });
    assert.equal(singleGatewayFailure.loadBalancingStrategy, "SINGLE_GATEWAY");

    const passed = addRuntimeProfileToReport({
      status: "PASSED",
      phases: {
        createConversation: {
          errors: 0,
        },
      },
    }, options, gatewayBaseUrls(options), {
      gatewayDatabaseDiagnostics: {
        after: {
          gateways: [{ stats: { acquireDurationMs: 55.5 } }],
        },
      },
    });

    assert.equal(passed.gatewayWorkerCount, 3);
    assert.equal(passed.gatewayDatabaseProfile.dbMaxConnsPerWorker, 8);
    assert.equal(passed.gatewayDatabaseProfile.dbMaxConnsTotal, 24);
    assert.equal(passed.clientTraceEnabled, true);
    assert.equal(passed.gatewayWriteProfile.batchSize, 32);
    assert.equal(passed.gatewayWriteProfile.batchDelayMs, 2);
    assert.equal(passed.gatewayWriteProfile.batchWorkers, 4);
    assert.equal(passed.gatewayWriteProfile.batchMode, "copy");
    assert.equal(passed.gatewayWriteProfile.acceptanceMode, "sync");
    assert.equal(passed.gatewayDatabaseDiagnostics.after.gateways[0].stats.acquireDurationMs, 55.5);
    assert.equal(passed.benchmarkRuntimeProfile.executor, "LOCAL_GO");
    assert.deepEqual(passed.benchmarkRuntimeProfile.targetBaseUrls, gatewayBaseUrls(options));
    assert.equal(passed.transportProfile.warmConnectionStrategy, "PER_HOST_PARALLEL");
    assert.equal(passed.transportProfile.warmConnectionRetries, 3);

    const gatewayDiagnostics = await collectGatewayDatabaseDiagnostics(gatewayBaseUrls(options), {
      now: () => "2026-06-01T00:00:00.000Z",
      fetch: async (url, init) => {
        assert.match(url, /\/internal\/conversation\/db-pool$/u);
        assert.equal(init.headers["X-Internal-Diagnostics-Secret"], "ueacd");
        return {
          ok: true,
          status: 200,
          json: async () => ({ stats: { maxConns: 10, emptyAcquireCount: 11 } }),
        };
      },
    });
    assert.equal(gatewayDiagnostics.endpoint, "/internal/conversation/db-pool");
    assert.equal(gatewayDiagnostics.secretHeader, "X-Internal-Diagnostics-Secret");
    assert.equal(gatewayDiagnostics.sampledAt, "2026-06-01T00:00:00.000Z");
    assert.equal(gatewayDiagnostics.gateways.length, 3);
    assert.equal(gatewayDiagnostics.gateways[0].stats.emptyAcquireCount, 11);
    assert(!JSON.stringify(gatewayDiagnostics).includes("ueacd"));

    const runtimeDiagnostics = await collectGatewayRuntimeDiagnostics(gatewayBaseUrls(options), {
      now: () => "2026-06-01T00:00:00.000Z",
      fetch: async (url, init) => {
        assert.match(url, /\/internal\/conversation\/runtime$/u);
        assert.equal(init.headers["X-Internal-Diagnostics-Secret"], "ueacd");
        return {
          ok: true,
          status: 200,
          json: async () => ({
            stats: {
              acceptedConns: 100,
              currentConns: 24,
              maxCurrentConns: 30,
            },
          }),
        };
      },
    });
    assert.equal(runtimeDiagnostics.endpoint, "/internal/conversation/runtime");
    assert.equal(runtimeDiagnostics.gateways[0].stats.maxCurrentConns, 30);
    assert(!JSON.stringify(runtimeDiagnostics).includes("ueacd"));

    const commandLogDiagnostics = await collectGatewayCommandLogDiagnostics(gatewayBaseUrls(options), {
      now: () => "2026-06-01T00:00:00.000Z",
      fetch: async (url, init) => {
        assert.match(url, /\/internal\/conversation\/command-log$/u);
        assert.equal(init.headers["X-Internal-Diagnostics-Secret"], "ueacd");
        return {
          ok: true,
          status: 200,
          json: async () => ({
            stats: {
              acceptedCommands: 100,
              projectionSucceeded: 99,
              queueDepth: 1,
            },
          }),
        };
      },
    });
    assert.equal(commandLogDiagnostics.endpoint, "/internal/conversation/command-log");
    assert.equal(commandLogDiagnostics.gateways[0].stats.projectionSucceeded, 99);
    assert(!JSON.stringify(commandLogDiagnostics).includes("ueacd"));
  });

  it("can run the load generator inside Docker while host gateways stay local", async () => {
    const {
      benchmarkRuntimeProfile,
      buildBenchmarkCommand,
      parseArgs,
    } = await import("./run-conversation-write-benchmark.mjs");

    const options = parseArgs([
      "--benchmark-runtime",
      "docker",
      "--benchmark-docker-image",
      "golang:1.26-alpine",
      "--benchmark-docker-host",
      "host.docker.internal",
      "--base-url",
      "http://127.0.0.1:18080",
      "--gateway-count",
      "2",
      "--concurrency",
      "5800",
      "--operations",
      "11600",
      "--max-conns-per-host",
      "0",
      "--warm-connections-per-host",
      "362",
      "--out",
      "reports/conversation-write-http-benchmark.dockerized.json",
    ]);

    const command = buildBenchmarkCommand(options, [
      "http://127.0.0.1:18080",
      "http://127.0.0.1:18081",
    ]);

    assert.equal(command[0], "docker");
    assert.deepEqual(command.slice(1, 8), [
      "run",
      "--rm",
      "-v",
      `${process.cwd()}:/workspace`,
      "-w",
      "/workspace",
      "golang:1.26-alpine",
    ]);
    assert.deepEqual(command.slice(8, 12), [
      "go",
      "run",
      "./services/conversation-write-gateway/cmd/httpbench",
      "--base-url",
    ]);
    assert.equal(
      command[12],
      "http://host.docker.internal:18080,http://host.docker.internal:18081",
    );
    assert.deepEqual(benchmarkRuntimeProfile(options, ["http://127.0.0.1:18080"]), {
      executor: "DOCKER_GO",
      dockerImage: "golang:1.26-alpine",
      dockerHostAlias: "host.docker.internal",
      targetBaseUrls: ["http://host.docker.internal:18080"],
    });
  });

  it("can run the load generator inside WSL while host gateways stay local", async () => {
    const {
      benchmarkRuntimeProfile,
      buildBenchmarkCommand,
      parseArgs,
    } = await import("./run-conversation-write-benchmark.mjs");

    const options = parseArgs([
      "--benchmark-runtime",
      "wsl",
      "--benchmark-wsl-distro",
      "Ubuntu",
      "--benchmark-wsl-host",
      "172.20.0.1",
      "--benchmark-wsl-workspace",
      "/mnt/c/Users/Administrator/Desktop/Intelligent-Teaching-Research-Assistant-Refactor-Plan",
      "--base-url",
      "http://127.0.0.1:18080",
      "--gateway-count",
      "2",
      "--concurrency",
      "5800",
      "--operations",
      "11600",
      "--max-conns-per-host",
      "0",
      "--warm-connections-per-host",
      "362",
      "--out",
      "reports/conversation-write-http-benchmark.wsl.json",
    ]);

    const command = buildBenchmarkCommand(options, [
      "http://127.0.0.1:18080",
      "http://127.0.0.1:18081",
    ]);

    assert.deepEqual(command.slice(0, 6), ["wsl.exe", "-d", "Ubuntu", "--", "bash", "-lc"]);
    assert.match(command[6], /^cd '\/mnt\/c\/Users\/Administrator\/Desktop\/Intelligent-Teaching-Research-Assistant-Refactor-Plan' && go 'run'/u);
    assert.match(command[6], /'--base-url' 'http:\/\/172\.20\.0\.1:18080,http:\/\/172\.20\.0\.1:18081'/u);
    assert.deepEqual(benchmarkRuntimeProfile(options, ["http://127.0.0.1:18080"]), {
      executor: "WSL_GO",
      wslDistro: "Ubuntu",
      wslHostAlias: "172.20.0.1",
      wslWorkspace: "/mnt/c/Users/Administrator/Desktop/Intelligent-Teaching-Research-Assistant-Refactor-Plan",
      targetBaseUrls: ["http://172.20.0.1:18080"],
    });
  });

  it("forwards write batch configuration to gateways and report profiles", async () => {
    const {
      parseArgs,
      runConversationWriteBenchmark,
    } = await import("./run-conversation-write-benchmark.mjs");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "conversation-batch-runner-"));
    const out = path.join(tmpDir, "benchmark.json");
    const observedGatewayEnvs = [];
    const options = parseArgs([
      "--base-url",
      "http://127.0.0.1:18080",
      "--gateway-count",
      "2",
      "--write-batch-size",
      "64",
      "--write-batch-delay-ms",
      "3",
      "--write-batch-workers",
      "2",
      "--write-acceptance-mode",
      "durable-log",
      "--command-log-dir",
      path.join(tmpDir, "commands"),
      "--command-log-append-batch-size",
      "16",
      "--command-log-queue-capacity",
      "128",
      "--command-log-projection-workers",
      "3",
      "--command-log-sync",
      "false",
      "--command-log-settle-timeout-ms",
      "250",
      "--out",
      out,
    ]);
    const spawnSync = () => ({ status: 0, stderr: "" });
    const spawnProcess = (command, _args, init) => {
      if (String(command).includes("conversation-write-gateway-runner")) {
        observedGatewayEnvs.push(init.env);
        return fakeProcess();
      }
      const benchmark = fakeProcess();
      queueMicrotask(() => {
        fs.writeFileSync(out, `${JSON.stringify({
          status: "PASSED",
          phases: { createConversation: { errors: 0, p95Ms: 12.34 } },
        })}\n`);
        benchmark.emit("close", 0, null);
      });
      return benchmark;
    };

    try {
      const report = await runConversationWriteBenchmark(options, {
        root: process.cwd(),
        spawnProcess,
        spawnCommandSync: spawnSync,
        fetch: async () => ({
          ok: true,
          status: 200,
          json: async () => ({ stats: { maxConns: 8, currentConns: 2, maxCurrentConns: 4 } }),
        }),
      });

      assert.equal(observedGatewayEnvs.length, 2);
      assert(observedGatewayEnvs.every((env) => env.CONVERSATION_WRITE_BATCH_SIZE === "64"));
      assert(observedGatewayEnvs.every((env) => env.CONVERSATION_WRITE_BATCH_DELAY_MS === "3"));
      assert(observedGatewayEnvs.every((env) => env.CONVERSATION_WRITE_BATCH_WORKERS === "2"));
      assert(observedGatewayEnvs.every((env) => env.CONVERSATION_WRITE_ACCEPTANCE_MODE === "durable-log"));
      assert(observedGatewayEnvs.every((env) => env.CONVERSATION_COMMAND_LOG_APPEND_BATCH_SIZE === "16"));
      assert(observedGatewayEnvs.every((env) => env.CONVERSATION_COMMAND_LOG_QUEUE_CAPACITY === "128"));
      assert(observedGatewayEnvs.every((env) => env.CONVERSATION_COMMAND_LOG_PROJECTION_WORKERS === "3"));
      assert(observedGatewayEnvs.every((env) => env.CONVERSATION_COMMAND_LOG_SYNC === "false"));
      assert.equal(report.gatewayWriteProfile.batchingEnabled, true);
      assert.equal(report.gatewayWriteProfile.batchSize, 64);
      assert.equal(report.gatewayWriteProfile.batchDelayMs, 3);
      assert.equal(report.gatewayWriteProfile.batchWorkers, 2);
      assert.equal(report.gatewayWriteProfile.batchMode, "insert");
      assert.equal(report.gatewayWriteProfile.acceptanceMode, "durable-log");
      assert.equal(report.gatewayWriteProfile.commandLog.appendBatchSize, 16);
      assert.equal(report.gatewayWriteProfile.commandLog.queueCapacity, 128);
      assert.equal(report.gatewayWriteProfile.commandLog.projectionWorkers, 3);
      assert.equal(report.gatewayWriteProfile.commandLog.sync, false);
      assert.equal(report.gatewayWriteProfile.commandLog.settleTimeoutMs, 250);
      assert.equal(report.gatewayRuntimeDiagnostics.after.gateways[0].stats.maxCurrentConns, 4);
      assert(!JSON.stringify(report).includes("ueacd"));
      assert(!JSON.stringify(report).includes("postgres://"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects non-ueacd local secrets and invalid port plans", async () => {
    const {
      parseArgs,
      validateLocalSecrets,
      validateRuntimePortPlan,
    } = await import("./run-conversation-write-benchmark.mjs");

    assert.throws(
      () => validateLocalSecrets(parseArgs(["--agent-api-key", "wrong"])),
      /agent-api-key must be ueacd/u,
    );
    assert.throws(
      () => validateLocalSecrets(parseArgs(["--dsn", "postgres://app_user:wrong@127.0.0.1:16432/db"])),
      /dsn password must be ueacd/u,
    );
    assert.throws(
      () => validateRuntimePortPlan(parseArgs([
        "--base-url",
        "http://127.0.0.1:0",
      ])),
      /base-url port must be positive/u,
    );
  });

  it("routes benchmark traffic through non-overlapping ingress proxies when enabled", async () => {
    const {
      addRuntimeProfileToReport,
      benchmarkBaseUrls,
      buildBenchmarkCommand,
      gatewayBaseUrls,
      ingressBaseUrls,
      parseArgs,
      validateRuntimePortPlan,
    } = await import("./run-conversation-write-benchmark.mjs");

    const options = parseArgs([
      "--base-url",
      "http://127.0.0.1:18080",
      "--gateway-count",
      "3",
      "--ingress-proxy",
      "true",
      "--ingress-port",
      "19080",
      "--ingress-count",
      "4",
      "--ingress-max-conns-per-host",
      "50",
      "--ingress-warm-connections-per-host",
      "22",
      "--concurrency",
      "800",
      "--operations",
      "1600",
    ]);

    validateRuntimePortPlan(options);
    assert.deepEqual(gatewayBaseUrls(options), [
      "http://127.0.0.1:18080",
      "http://127.0.0.1:18081",
      "http://127.0.0.1:18082",
    ]);
    assert.deepEqual(ingressBaseUrls(options), [
      "http://127.0.0.1:19080",
      "http://127.0.0.1:19081",
      "http://127.0.0.1:19082",
      "http://127.0.0.1:19083",
    ]);
    assert.deepEqual(benchmarkBaseUrls(options), ingressBaseUrls(options));

    const command = buildBenchmarkCommand(options);
    const baseUrlArg = command[command.indexOf("--base-url") + 1];
    assert.equal(baseUrlArg, ingressBaseUrls(options).join(","));

    const report = addRuntimeProfileToReport({ status: "PASSED" }, options);
    assert.equal(report.gatewayCount, 3);
    assert.deepEqual(report.gatewayBaseUrls, gatewayBaseUrls(options));
    assert.equal(report.loadBalancingStrategy, "INGRESS_ROUND_ROBIN");
    assert.equal(report.gatewayWorkerCount, 3);
    assert.equal(report.benchmarkRuntimeProfile.targetBaseUrls.length, 4);
    assert.equal(report.ingressProfile.enabled, true);
    assert.equal(report.ingressProfile.count, 4);
    assert.equal(report.ingressProfile.upstreamGatewayCount, 3);
    assert.equal(report.ingressProfile.maxConnsPerHost, 50);
    assert.equal(report.ingressProfile.warmConnectionsTotal, 88);

    assert.throws(
      () => validateRuntimePortPlan(parseArgs([
        "--base-url",
        "http://127.0.0.1:18080",
        "--gateway-count",
        "3",
        "--ingress-proxy",
        "true",
        "--ingress-port",
        "18081",
        "--ingress-count",
        "2",
      ])),
      /ingress\/gateway port overlap/u,
    );
  });

  it("replaces stale pass reports when benchmark execution fails before writing", async () => {
    const {
      parseArgs,
      runConversationWriteBenchmark,
    } = await import("./run-conversation-write-benchmark.mjs");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "conversation-runner-"));
    const out = path.join(tmpDir, "benchmark.json");
    fs.writeFileSync(out, `${JSON.stringify({ status: "PASSED", stale: true })}\n`);

    const options = parseArgs([
      "--base-url",
      "http://127.0.0.1:18080",
      "--out",
      out,
    ]);
    const spawnSync = () => ({ status: 0, stderr: "" });
    const spawnProcess = (command) => {
      if (String(command).includes("conversation-write-gateway-runner")) {
        return fakeProcess();
      }
      const benchmark = fakeProcess();
      queueMicrotask(() => {
        benchmark.stderr.emit("data", "benchmark failed before report write\n");
        benchmark.emit("close", 1, null);
      });
      return benchmark;
    };

    try {
      await assert.rejects(
        () => runConversationWriteBenchmark(options, {
          root: process.cwd(),
          spawnProcess,
          spawnCommandSync: spawnSync,
          fetch: async () => ({ ok: true }),
        }),
        /benchmark failed before report write/u,
      );
      const report = JSON.parse(fs.readFileSync(out, "utf8"));
      assert.equal(report.status, "FAILED");
      assert.equal(report.stale, undefined);
      assert.match(report.errorMessage, /benchmark failed before report write/u);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("attaches bounded PgBouncer and PostgreSQL diagnostics to successful reports", async () => {
    const {
      parseArgs,
      runConversationWriteBenchmark,
    } = await import("./run-conversation-write-benchmark.mjs");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "conversation-diagnostics-"));
    const out = path.join(tmpDir, "benchmark.json");
    const options = parseArgs([
      "--base-url",
      "http://127.0.0.1:18080",
      "--out",
      out,
      "--pgbouncer-diagnostics",
      "true",
      "--postgres-diagnostics",
      "true",
      "--postgres-diagnostics-interval-ms",
      "1",
      "--postgres-diagnostics-max-samples",
      "2",
    ]);
    const observedPostgresRelationQueries = [];
    const spawnSync = (command, args) => {
      if (command === "go") return { status: 0, stderr: "" };
      if (command === "taskkill") return { status: 0, stderr: "" };
      assert.equal(command, "docker");
      assert.deepEqual(args.slice(0, 4), ["exec", "-e", "PGPASSWORD=ueacd", "ita-identity-session-postgres"]);
      const query = args.at(-1);
      if (query === "SHOW STATS;") {
        return {
          status: 0,
          stdout: "database|total_xact_count\nintelligent_teaching_assistant|42\n",
          stderr: "",
        };
      }
      if (query === "SHOW POOLS;") {
        return {
          status: 0,
          stdout: "database|cl_active|cl_waiting|sv_active\nintelligent_teaching_assistant|8|0|8\n",
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
      if (query.includes("FROM pg_stat_activity")) {
        return {
          status: 0,
          stdout: "state|wait_event_type|wait_event|connections\nactive|IO|WalSync|2\nidle|Client|ClientRead|6\n",
          stderr: "",
        };
      }
      if (query.includes("FROM pg_stat_database")) {
        return {
          status: 0,
          stdout: "datname|numbackends|xact_commit|tup_inserted|deadlocks\nintelligent_teaching_assistant|8|100|90|0\n",
          stderr: "",
        };
      }
      if (query.includes("FROM pg_locks")) {
        return {
          status: 0,
          stdout: "mode|granted|locks\nRowExclusiveLock|t|8\n",
          stderr: "",
        };
      }
      if (query.includes("FROM pg_class")) {
        observedPostgresRelationQueries.push(query);
        return {
          status: 0,
          stdout: "relname|persistence|total_size_bytes\nresearch_conversations|logged|81920\n",
          stderr: "",
        };
      }
      throw new Error(`unexpected query ${query}`);
    };
    const spawnProcess = (command) => {
      if (String(command).includes("conversation-write-gateway-runner")) {
        return fakeProcess();
      }
      const benchmark = fakeProcess();
      queueMicrotask(() => {
        fs.writeFileSync(out, `${JSON.stringify({
          status: "PASSED",
          phases: { createConversation: { errors: 0, p95Ms: 12.34 } },
        })}\n`);
        benchmark.emit("close", 0, null);
      });
      return benchmark;
    };

    try {
      const report = await runConversationWriteBenchmark(options, {
        root: process.cwd(),
        spawnProcess,
        spawnCommandSync: spawnSync,
        fetch: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            stats: {
              maxConns: 8,
              emptyAcquireCount: 3,
              acceptedConns: 12,
              currentConns: 2,
              maxCurrentConns: 5,
            },
          }),
        }),
        sleep: async () => {},
      });

      assert.equal(report.status, "PASSED");
      assert.equal(report.gatewayDatabaseDiagnostics.before.gateways[0].status, "OK");
      assert.equal(report.gatewayDatabaseDiagnostics.after.gateways[0].status, "OK");
      assert.equal(report.gatewayRuntimeDiagnostics.before.gateways[0].status, "OK");
      assert.equal(report.gatewayRuntimeDiagnostics.after.gateways[0].stats.maxCurrentConns, 5);
      assert.equal(report.pgbouncerDiagnostics.before.queries.pools.rows[0].cl_waiting, 0);
      assert.equal(report.pgbouncerDiagnostics.after.queries.stats.rows[0].total_xact_count, 42);
      assert.equal(report.postgresDiagnostics.before.postgresRelations[0], "research_conversations");
      assert.equal(report.postgresDiagnostics.before.queries.activity.rows[0].wait_event, "WalSync");
      assert(report.postgresDiagnostics.timeline.samples.length >= 1);
      assert(report.postgresDiagnostics.timeline.samples.length <= 2);
      assert.equal(report.postgresDiagnostics.after.queries.relations.rows[0].relname, "research_conversations");
      assert(observedPostgresRelationQueries.every((query) => query.includes("'research_conversations'")));
      assert(!JSON.stringify(report).includes("ueacd"));
      assert(!JSON.stringify(report).includes("postgres://"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

function fakeProcess() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.pid = 12345;
  child.kill = () => {
    child.exitCode = 0;
  };
  return child;
}
