import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  makeTempRoot,
  successfulChildCommand,
} from "./run-system-mixed-workload-benchmark-fixtures.test.mjs";
import {
  defaults,
  runSystemMixedWorkloadBenchmark,
} from "./run-system-mixed-workload-benchmark.mjs";

describe("system mixed workload benchmark validation", () => {
  it("rejects negative identity write concurrency", async () => {
    const root = makeTempRoot();

    await assert.rejects(
      () => runSystemMixedWorkloadBenchmark(
        {
          ...defaults,
          identitySessionDbWriteConcurrency: "-1",
        },
        { root, runCommand: successfulChildCommand },
      ),
      /identity-session-db-write-concurrency must be a non-negative integer/u,
    );
  });

  it("rejects unsupported conversation benchmark runtimes", async () => {
    const root = makeTempRoot();

    await assert.rejects(
      () => runSystemMixedWorkloadBenchmark(
        {
          ...defaults,
          conversationBenchmarkRuntime: "bad",
        },
        { root, runCommand: successfulChildCommand },
      ),
      /conversation-benchmark-runtime must be local, docker, or wsl/u,
    );
  });

  it("rejects unsupported identity benchmark runtimes", async () => {
    const root = makeTempRoot();

    await assert.rejects(
      () => runSystemMixedWorkloadBenchmark(
        {
          ...defaults,
          identityBenchmarkRuntime: "bad",
        },
        { root, runCommand: successfulChildCommand },
      ),
      /identity-benchmark-runtime must be local, docker, or wsl/u,
    );
  });

  it("rejects unsupported teaching benchmark runtimes", async () => {
    const root = makeTempRoot();

    await assert.rejects(
      () => runSystemMixedWorkloadBenchmark(
        {
          ...defaults,
          teachingBenchmarkRuntime: "bad",
        },
        { root, runCommand: successfulChildCommand },
      ),
      /teaching-benchmark-runtime must be js, local, docker, or wsl/u,
    );
  });
});
