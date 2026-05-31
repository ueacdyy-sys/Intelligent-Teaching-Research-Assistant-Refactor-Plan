import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectPostgresDiagnostics,
  postgresDiagnosticsEnabled,
  runBenchmarkWithPostgresDiagnostics,
  startPostgresDiagnosticsTimeline,
} from "./identity-postgres-diagnostics.mjs";
import { parseArgs } from "./run-identity-http-benchmark.mjs";

describe("PostgreSQL diagnostics", () => {
  it("collects masked PostgreSQL activity, database, and lock evidence through docker psql", () => {
    const options = parseArgs([
      "--postgres-diagnostics",
      "true",
      "--postgres-diagnostics-container",
      "ita-identity-session-postgres",
      "--postgres-diagnostics-host",
      "127.0.0.1",
      "--postgres-diagnostics-port",
      "5432",
      "--postgres-diagnostics-user",
      "app_user",
      "--postgres-diagnostics-database",
      "intelligent_teaching_assistant",
    ]);
    const observedQueries = [];

    const diagnostics = collectPostgresDiagnostics(options, {
      now: () => "2026-05-31T10:00:00.000Z",
      spawnSync: (command, args) => {
        assert.equal(command, "docker");
        assert.deepEqual(args.slice(0, 4), ["exec", "-e", "PGPASSWORD=ueacd", "ita-identity-session-postgres"]);
        assert(args.includes("-h"));
        assert(args.includes("127.0.0.1"));
        assert(args.includes("-p"));
        assert(args.includes("5432"));
        const query = args.at(-1);
        observedQueries.push(query);
        if (query.includes("FROM pg_stat_activity")) {
          return {
            status: 0,
            stdout: "state|wait_event_type|wait_event|connections\nactive|Lock|transactionid|7\nidle|||12\n",
            stderr: "",
          };
        }
        if (query.includes("FROM pg_stat_database")) {
          return {
            status: 0,
            stdout: "datname|numbackends|xact_commit|deadlocks\nintelligent_teaching_assistant|19|12345|0\n",
            stderr: "",
          };
        }
        if (query.includes("FROM pg_locks")) {
          return {
            status: 0,
            stdout: "mode|granted|locks\nRowExclusiveLock|t|42\n",
            stderr: "",
          };
        }
        throw new Error(`unexpected query ${query}`);
      },
    });

    assert.equal(observedQueries.length, 3);
    assert.equal(diagnostics.status, "OK");
    assert.equal(diagnostics.sampledAt, "2026-05-31T10:00:00.000Z");
    assert.equal(diagnostics.postgresPort, 5432);
    assert.equal(diagnostics.queries.activity.rows[0].wait_event_type, "Lock");
    assert.equal(diagnostics.queries.activity.rows[0].connections, 7);
    assert.equal(diagnostics.queries.database.rows[0].numbackends, 19);
    assert.equal(diagnostics.queries.locks.rows[0].locks, 42);
    assert(!JSON.stringify(diagnostics).includes("ueacd"));
  });

  it("is disabled by default and can collect a bounded timeline", async () => {
    const disabled = parseArgs([]);
    assert.equal(postgresDiagnosticsEnabled(disabled), false);
    assert.equal(collectPostgresDiagnostics(disabled), undefined);

    let calls = 0;
    const timeline = startPostgresDiagnosticsTimeline(
      parseArgs([
        "--postgres-diagnostics",
        "true",
        "--postgres-diagnostics-interval-ms",
        "1",
        "--postgres-diagnostics-max-samples",
        "3",
      ]),
      {
        collect: () => {
          calls += 1;
          return { status: "OK", sampledAt: `sample-${calls}` };
        },
        sleep: async () => {},
      },
    );

    const result = await timeline.stop();

    assert.equal(result.status, "OK");
    assert.equal(result.intervalMs, 100);
    assert.equal(result.maxSamples, 3);
    assert.equal(result.samples.length, 1);
    assert.equal(result.samples[0].sampledAt, "sample-1");
  });

  it("records diagnostics errors without leaking local secrets", async () => {
    const options = parseArgs(["--postgres-diagnostics", "true"]);
    const diagnostics = collectPostgresDiagnostics(options, {
      spawnSync: () => {
        throw new Error("docker failed for password ueacd");
      },
    });

    assert.equal(diagnostics.status, "ERROR");
    assert.equal(diagnostics.queries.activity.status, "ERROR");
    assert.match(diagnostics.queries.activity.errorMessage, /password \*\*\*/u);
    assert(!JSON.stringify(diagnostics).includes("ueacd"));

    const timeline = startPostgresDiagnosticsTimeline(options, {
      now: () => "2026-05-31T10:00:01.000Z",
      collect: () => {
        throw new Error("timeline password ueacd");
      },
      sleep: async () => {},
    });
    const result = await timeline.stop();

    assert.equal(result.status, "ERROR");
    assert.equal(result.samples[0].errorMessage, "timeline password ***");
    assert(!JSON.stringify(result).includes("ueacd"));
  });

  it("preserves the synchronous benchmark path when diagnostics are disabled", async () => {
    let usedSpawnSync = false;
    let usedSpawn = false;

    const run = await runBenchmarkWithPostgresDiagnostics(
      parseArgs([]),
      { command: "go", args: ["run", "./cmd"] },
      {
        spawnSync: (command, args) => {
          usedSpawnSync = true;
          assert.equal(command, "go");
          assert.deepEqual(args, ["run", "./cmd"]);
          return { status: 0, stdout: "ok", stderr: "" };
        },
        spawn: () => {
          usedSpawn = true;
          throw new Error("async spawn should not run");
        },
      },
    );

    assert.equal(usedSpawnSync, true);
    assert.equal(usedSpawn, false);
    assert.equal(run.result.status, 0);
    assert.equal(run.postgresDiagnostics, undefined);
  });
});
