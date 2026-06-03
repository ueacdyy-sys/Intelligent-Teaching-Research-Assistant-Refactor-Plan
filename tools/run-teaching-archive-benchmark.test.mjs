import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  buildBenchmarkCommand,
  buildBenchmarkReport,
  buildFailureReport,
  defaults,
  formatTeachingArchiveBenchmark,
  parseArgs,
  principalHeader,
  runTeachingArchiveBenchmark,
  studentPrincipal,
  teacherPrincipal,
} from "./run-teaching-archive-benchmark.mjs";

describe("teaching archive benchmark runner", () => {
  it("parses kebab-case options into the teaching archive profile", () => {
    const parsed = parseArgs([
      "--base-url",
      "http://127.0.0.1:19500",
      "--db-max-conns",
      "2",
      "--gateway-count",
      "3",
      "--startup-timeout-ms",
      "30000",
      "--benchmark-runtime",
      "docker",
      "--benchmark-docker-host",
      "host.docker.internal",
      "--unknown-option",
      "ignored",
    ]);

    assert.equal(parsed.baseUrl, "http://127.0.0.1:19500");
    assert.equal(parsed.dbMaxConns, "2");
    assert.equal(parsed.gatewayCount, "3");
    assert.equal(parsed.startupTimeoutMs, "30000");
    assert.equal(parsed.benchmarkRuntime, "docker");
    assert.equal(parsed.benchmarkDockerHost, "host.docker.internal");
    assert.equal(parsed.concurrency, defaults.concurrency);
    assert.equal(Object.hasOwn(parsed, "unknownOption"), false);
  });

  it("builds a Docker Go benchmark command for Teaching", () => {
    const command = buildBenchmarkCommand(
      {
        ...defaults,
        benchmarkRuntime: "docker",
        benchmarkDockerImage: "golang:1.26-alpine",
        benchmarkDockerHost: "host.docker.internal",
        concurrency: "384",
        operations: "1536",
        maxConnsPerHost: "256",
        warmConnectionsPerHost: "64",
        clientTrace: "true",
      },
      ["http://127.0.0.1:18500", "http://127.0.0.1:18501"],
      "C:\\workspace\\ita",
    );

    assert.deepEqual(command.slice(0, 7), [
      "docker",
      "run",
      "--rm",
      "-v",
      "C:\\workspace\\ita:/workspace",
      "-w",
      "/workspace",
    ]);
    assert(command.includes("./services/teaching-archive-gateway/cmd/httpbench"));
    assert(command.includes("http://host.docker.internal:18500,http://host.docker.internal:18501"));
    assert(command.includes("--client-trace"));
  });

  it("builds valid teacher and student principal headers", () => {
    const now = new Date("2026-06-01T00:00:00.000Z");
    const teacher = JSON.parse(Buffer.from(principalHeader(teacherPrincipal(now)), "base64url").toString("utf8"));
    const student = JSON.parse(Buffer.from(principalHeader(studentPrincipal(now)), "base64url").toString("utf8"));

    assert.equal(teacher.role, "TEACHER");
    assert.equal(teacher.entryPoint, "DESKTOP_TEACHER");
    assert.deepEqual(teacher.scopes, ["TEACHING_READ", "TEACHING_WRITE", "STUDENT_ASSIGNED_READ", "STUDENT_ARCHIVE_WRITE"]);
    assert.equal(student.role, "STUDENT");
    assert.equal(student.entryPoint, "STUDENT_APP");
    assert.deepEqual(student.studentAccess, { mode: "OWN", studentIds: ["student_perf"] });
  });

  it("summarizes all three read/write phases", () => {
    const report = buildBenchmarkReport({
      options: defaults,
      generatedAt: "2026-06-01T00:00:00.000Z",
      status: "PASSED",
      phases: {
        createArchiveItem: phase([1, 2, 3, 4]),
        createQuizSubmission: phase([4, 6, 8, 10]),
        listArchiveItems: phase([2, 2, 5, 9]),
      },
      totalDurationMs: 123,
      gatewayOutput: "ready ueacd postgres://app_user:ueacd@127.0.0.1/db",
    });

    assert.equal(report.status, "PASSED");
    assert.equal(report.gatewayCount, 1);
    assert.equal(report.benchmarkRuntimeProfile.executor, "LOCAL_NODE_FETCH");
    assert.equal(report.summary.totalErrors, 0);
    assert.equal(report.summary.maxP99Ms, 10);
    assert.equal(report.phases.createQuizSubmission.latencyMs.p95, 10);
    assert.doesNotMatch(JSON.stringify(report), /postgres:\/\/app_user/u);
    assert.doesNotMatch(JSON.stringify(report), /ueacd/u);
    assert.match(formatTeachingArchiveBenchmark(report), /createQuizSubmission/u);
  });

  it("masks secrets and database URLs in failure reports", () => {
    const report = buildFailureReport({
      options: defaults,
      generatedAt: "2026-06-01T00:00:00.000Z",
      errorMessage: "bad ueacd postgres://app_user:ueacd@127.0.0.1/db",
      gatewayOutput: "stderr ueacd postgres://app_user:ueacd@127.0.0.1/db",
    });
    const text = JSON.stringify(report);

    assert.equal(report.status, "FAILED");
    assert.equal(report.benchmarkRuntimeProfile.executor, "LOCAL_NODE_FETCH");
    assert.doesNotMatch(text, /ueacd/u);
    assert.doesNotMatch(text, /postgres:\/\/app_user/u);
    assert.match(text, /\[database-url\]/u);
  });

  it("runs the live workflow shape with fake fetch and writes a passed report", async () => {
    const root = makeTempRoot();
    const calls = [];
    const report = await runTeachingArchiveBenchmark(
      {
        ...defaults,
        out: "reports/teaching.json",
        concurrency: "2",
        operations: "4",
      },
      {
        root,
        fetch: fakeTeachingFetch(calls),
        sleep: async () => {},
        spawnProcess: fakeSpawnProcess,
        spawnCommandSync: fakeSpawnSync,
        now: fixedClock(),
      },
    );

    assert.equal(report.status, "PASSED");
    assert.equal(report.summary.totalErrors, 0);
    assert.equal(report.phases.createArchiveItem.operations, 4);
    assert.equal(report.phases.createQuizSubmission.operations, 4);
    assert.equal(report.phases.listArchiveItems.operations, 4);
    assert.equal(report.phases.createArchiveItem.serverTimingMs.p99, 12);
    assert.equal(report.phases.createArchiveItem.serverTimingBreakdownMs.handler.p99, 15);
    assert.equal(report.phases.createArchiveItem.serverTimingBreakdownMs["pre.usecase"].p99, 3);
    assert.equal(report.phases.createArchiveItem.serverTimingBreakdownMs["db.insert"].p99, 8);
    assert.equal(report.phases.createArchiveItem.serverTimingBreakdownSamples.handler, 4);
    assert.equal(report.phases.createArchiveItem.serverTimingBreakdownSamples["db.insert"], 4);
    assert.equal(calls.filter((call) => call.includes("/quiz-submissions")).length, 4);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, "reports/teaching.json"), "utf8")).status, "PASSED");
  });

  it("runs the Go benchmark runtime and augments the report", async () => {
    const root = makeTempRoot();
    const goCommands = [];
    const report = await runTeachingArchiveBenchmark(
      {
        ...defaults,
        benchmarkRuntime: "local",
        out: "reports/teaching-go.json",
        concurrency: "2",
        operations: "4",
      },
      {
        root,
        fetch: async (url) => {
          if (url.endsWith("/health")) return jsonResponse(200, { status: "ok" });
          return jsonResponse(404, { error: "unexpected JS fetch" });
        },
        sleep: async () => {},
        spawnProcess: fakeSpawnProcess,
        spawnCommandSync: (command, args) => {
          goCommands.push([command, args]);
          if (command === "go") {
            if (args.includes("build")) {
              assert(args.includes("./services/teaching-archive-gateway/cmd/gateway"));
              return { status: 0, stdout: "gateway build complete", stderr: "" };
            }
            fs.mkdirSync(path.join(root, "reports"), { recursive: true });
            fs.writeFileSync(path.join(root, "reports/teaching-go.json"), `${JSON.stringify(goBenchmarkReport())}\n`);
            assert(args.includes("./services/teaching-archive-gateway/cmd/httpbench"));
          }
          return { status: 0, stdout: "go benchmark complete", stderr: "" };
        },
        now: fixedClock(),
      },
    );

    assert.equal(report.status, "PASSED");
    assert.equal(goCommands.filter(([command]) => command === "go").length, 2);
    assert.equal(report.summary.totalErrors, 0);
    assert.equal(report.summary.maxP99Ms, 11);
    assert.equal(report.benchmarkRuntimeProfile.executor, "LOCAL_GO");
    assert.equal(report.gatewayDatabaseProfile.dbMaxConns, 4);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, "reports/teaching-go.json"), "utf8")).summary.totalErrors, 0);
  });

  it("fans teaching requests across multiple gateway ports", async () => {
    const root = makeTempRoot();
    const calls = [];
    const spawnedPorts = [];
    const spawnedCommands = [];
    const report = await runTeachingArchiveBenchmark(
      {
        ...defaults,
        baseUrl: "http://127.0.0.1:19500",
        out: "reports/teaching.json",
        concurrency: "2",
        operations: "6",
        gatewayCount: "3",
      },
      {
        root,
        fetch: fakeTeachingFetch(calls),
        sleep: async () => {},
        spawnProcess: (command, _args, options) => {
          spawnedCommands.push(command);
          spawnedPorts.push(options.env.PORT);
          return fakeSpawnProcess();
        },
        spawnCommandSync: fakeSpawnSync,
        now: fixedClock(),
      },
    );

    assert.equal(report.status, "PASSED");
    assert.equal(report.gatewayCount, 3);
    assert(spawnedCommands.every((command) => command.includes(path.join("tmp", "bin", "teaching-archive-gateway-runner"))));
    assert.deepEqual(spawnedPorts, ["19500", "19501", "19502"]);
    assert.deepEqual(report.gatewayBaseUrls, [
      "http://127.0.0.1:19500",
      "http://127.0.0.1:19501",
      "http://127.0.0.1:19502",
    ]);
    assert(calls.some((call) => call.includes("127.0.0.1:19500/v1/teaching/archive-items")));
    assert(calls.some((call) => call.includes("127.0.0.1:19501/v1/teaching/archive-items")));
    assert(calls.some((call) => call.includes("127.0.0.1:19502/v1/teaching/archive-items")));
  });

  it("returns a failed report when a phase cannot produce archive item ids", async () => {
    const root = makeTempRoot();
    const report = await runTeachingArchiveBenchmark(
      {
        ...defaults,
        out: "reports/teaching.json",
        concurrency: "2",
        operations: "3",
      },
      {
        root,
        fetch: fakeTeachingFetch([], { failArchiveCreate: true }),
        sleep: async () => {},
        spawnProcess: fakeSpawnProcess,
        spawnCommandSync: fakeSpawnSync,
        now: fixedClock(),
      },
    );

    assert.equal(report.status, "FAILED");
    assert.equal(report.summary.totalErrors, 6);
    assert.match(report.phases.createQuizSubmission.firstError, /no archive item ids/u);
  });

  it("fails local evidence when the configured secret is not ueacd", async () => {
    const root = makeTempRoot();
    const report = await runTeachingArchiveBenchmark(
      {
        ...defaults,
        out: "reports/teaching.json",
        agentApiKey: "wrong",
      },
      {
        root,
        fetch: fakeTeachingFetch([]),
        sleep: async () => {},
        spawnProcess: fakeSpawnProcess,
        spawnCommandSync: fakeSpawnSync,
        now: fixedClock(),
      },
    );

    assert.equal(report.status, "FAILED");
    assert.match(report.errorMessage, /agent-api-key must be \*\*\*/u);
  });
});

function phase(latencies, errors = 0) {
  return {
    operations: latencies.length,
    errors,
    firstError: "",
    latencies,
    durationMs: 100,
  };
}

function fakeTeachingFetch(calls, options = {}) {
  let archiveItemCounter = 0;
  let submissionCounter = 0;
  return async (url, init = {}) => {
    calls.push(`${init.method ?? "GET"} ${url}`);
    if (url.endsWith("/health")) return jsonResponse(200, { status: "ok" });
    if (options.failArchiveCreate && init.method === "POST" && url.endsWith("/v1/teaching/archive-items")) {
      return jsonResponse(500, { error: "create failed with ueacd" });
    }
    if (init.method === "POST" && url.endsWith("/v1/teaching/archive-items")) {
      archiveItemCounter += 1;
      return jsonResponse(201, { id: `tarch_perf_${archiveItemCounter}` }, "handler;dur=15, pre.usecase;dur=3, app;dur=12, db.insert;dur=8");
    }
    if (init.method === "POST" && url.includes("/quiz-submissions")) {
      submissionCounter += 1;
      return jsonResponse(201, { id: `quiz_sub_perf_${submissionCounter}` }, "app;dur=6, db.insert;dur=4");
    }
    if ((init.method ?? "GET") === "GET" && url.includes("/v1/teaching/archive-items?")) {
      return jsonResponse(200, { items: [] }, "app;dur=2");
    }
    return jsonResponse(404, { error: "not found" });
  };
}

function jsonResponse(status, body, serverTiming = "") {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === "server-timing" ? serverTiming : "";
      },
    },
    text: async () => JSON.stringify(body),
  };
}

function goBenchmarkReport() {
  return {
    generatedAt: "2026-06-01T00:00:00Z",
    benchmarkKind: "teaching_archive_gateway",
    workloadType: "HTTP_BENCHMARK",
    status: "PASSED",
    concurrency: 2,
    operationsPerPhase: 4,
    phases: {
      createArchiveItem: {
        name: "createArchiveItem",
        operations: 4,
        errors: 0,
        rps: 400,
        latencyMs: { p95: 10, p99: 11 },
        serverTimingMs: { p99: 4 },
        serverTimingBreakdownMs: { handler: { p99: 5 }, "db.insert": { p99: 4 } },
      },
      createQuizSubmission: {
        name: "createQuizSubmission",
        operations: 4,
        errors: 0,
        rps: 500,
        latencyMs: { p95: 8, p99: 9 },
      },
      listArchiveItems: {
        name: "listArchiveItems",
        operations: 4,
        errors: 0,
        rps: 600,
        latencyMs: { p95: 6, p99: 7 },
      },
    },
    totalDurationMs: 42,
  };
}

function fakeSpawnProcess() {
  return {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    exitCode: null,
    pid: 1234,
    kill() {},
  };
}

function fakeSpawnSync() {
  return { status: 0 };
}

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ita-teaching-archive-"));
}

function fixedClock() {
  let tick = 0;
  return () => `2026-06-01T00:00:0${tick++}.000Z`;
}
