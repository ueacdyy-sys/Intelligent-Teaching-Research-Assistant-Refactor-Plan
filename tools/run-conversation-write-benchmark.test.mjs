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
      buildBenchmarkCommand,
      buildFailureReport,
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

    const failed = buildFailureReport({
      options,
      exitCode: 1,
      gatewayExitCode: [null, null, null],
      errorMessage: "connect failed with password=ueacd and postgres://app_user:ueacd@localhost/db",
      gatewayOutput: "ready\npanic password=ueacd",
      benchmarkOutput: "createConversation failed",
      generatedAt: "2026-05-31T00:00:00.000Z",
    });

    assert.equal(failed.benchmarkKind, "conversation_write_gateway");
    assert.equal(failed.status, "FAILED");
    assert.equal(failed.gatewayCount, 3);
    assert.equal(failed.gatewayDatabaseProfile.dbMaxConnsTotal, 24);
    assert.deepEqual(failed.gatewayBaseUrls, gatewayBaseUrls(options));
    assert(!JSON.stringify(failed).includes("ueacd"));
    assert(!JSON.stringify(failed).includes("postgres://"));
    assert.equal(maskSensitive("token ueacd"), "token ***");

    const passed = addRuntimeProfileToReport({
      status: "PASSED",
      phases: {
        createConversation: {
          errors: 0,
        },
      },
    }, options, gatewayBaseUrls(options));

    assert.equal(passed.gatewayWorkerCount, 3);
    assert.equal(passed.gatewayDatabaseProfile.dbMaxConnsPerWorker, 8);
    assert.equal(passed.gatewayDatabaseProfile.dbMaxConnsTotal, 24);
    assert.equal(passed.benchmarkRuntimeProfile.executor, "LOCAL_GO");
    assert.deepEqual(passed.benchmarkRuntimeProfile.targetBaseUrls, gatewayBaseUrls(options));
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
