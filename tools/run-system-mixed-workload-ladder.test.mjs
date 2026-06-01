import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  buildLadderSteps,
  buildSystemMixedWorkloadLadderReport,
  defaults,
  formatSystemMixedWorkloadLadder,
  parseArgs,
  runSystemMixedWorkloadLadder,
} from "./run-system-mixed-workload-ladder.mjs";

describe("system mixed workload ladder runner", () => {
  it("parses kebab-case options and compact step specs", () => {
    const parsed = parseArgs([
      "--step-prefix",
      "reports/custom-ladder",
      "--steps",
      "smoke:2:4:8:16:2:4,edge:4:8:16:32:4:8",
      "--teaching-db-max-conns",
      "2",
      "--stop-on-failure",
      "false",
    ]);

    assert.equal(parsed.stepPrefix, "reports/custom-ladder");
    assert.equal(parsed.steps, "smoke:2:4:8:16:2:4,edge:4:8:16:32:4:8");
    assert.equal(parsed.teachingDbMaxConns, "2");
    assert.equal(parsed.stopOnFailure, "false");
  });

  it("builds isolated per-step mixed workload options", () => {
    const steps = buildLadderSteps({
      ...defaults,
      stepPrefix: "reports/ladder",
      steps: "smoke:2:4:8:16,low:4:8:16:32",
      identityBaseUrl: "http://127.0.0.1:19000",
      conversationBaseUrl: "http://127.0.0.1:19100",
      teachingBaseUrl: "http://127.0.0.1:19200",
    });

    assert.deepEqual(steps.map((step) => step.name), ["smoke", "low"]);
    assert.equal(steps[0].options.out, "reports/ladder.1-smoke.json");
    assert.equal(steps[0].options.identityOut, "reports/ladder.1-smoke.identity-http.json");
    assert.equal(steps[0].options.teachingOut, "reports/ladder.1-smoke.teaching-archive.json");
    assert.equal(steps[1].options.conversationConcurrency, "16");
    assert.equal(steps[1].options.teachingConcurrency, "4");
    assert.equal(steps[1].options.manageDocker, "false");
    assert.equal(steps[0].options.identityBaseUrl, "http://127.0.0.1:19000");
    assert.equal(steps[0].options.conversationBaseUrl, "http://127.0.0.1:19100");
    assert.equal(steps[0].options.teachingBaseUrl, "http://127.0.0.1:19200");
  });

  it("allows compact step specs to set teaching archive load explicitly", () => {
    const steps = buildLadderSteps({
      ...defaults,
      steps: "teaching:2:4:8:16:6:12",
    });

    assert.equal(steps[0].teachingConcurrency, 6);
    assert.equal(steps[0].teachingOperations, 12);
    assert.equal(steps[0].options.teachingConcurrency, "6");
    assert.equal(steps[0].options.teachingOperations, "12");
  });

  it("runs every step and writes a passed ladder report", async () => {
    const root = makeTempRoot();
    const report = await runSystemMixedWorkloadLadder(
      {
        ...defaults,
        out: "reports/ladder.json",
        manageDocker: "false",
        steps: "smoke:2:4:8:16,low:4:8:16:32",
      },
      {
        root,
        runStep: async (options) => mixedReport(options),
        now: fixedClock(),
      },
    );

    assert.equal(report.status, "PASSED");
    assert.equal(report.workloadType, "MIXED_WORKLOAD_LADDER");
    assert.equal(report.summary.executedSteps, 2);
    assert.equal(report.summary.highestPassedStep, "low");
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, "reports/ladder.json"), "utf8")).status, "PASSED");
    assert.match(formatSystemMixedWorkloadLadder(report), /System mixed workload ladder: PASSED/u);
  });

  it("stops after the first failed step by default", async () => {
    const root = makeTempRoot();
    const executed = [];
    const report = await runSystemMixedWorkloadLadder(
      {
        ...defaults,
        out: "reports/ladder.json",
        manageDocker: "false",
        steps: "smoke:2:4:8:16,low:4:8:16:32,edge:8:16:32:64",
      },
      {
        root,
        runStep: async (options) => {
          executed.push(options.profile);
          return options.profile.endsWith("_LOW") ? mixedReport(options, { status: "FAILED", errors: 3 }) : mixedReport(options);
        },
        now: fixedClock(),
      },
    );

    assert.equal(report.status, "FAILED");
    assert.equal(report.summary.executedSteps, 2);
    assert.equal(report.summary.firstFailedStep, "low");
    assert.equal(report.steps.find((step) => step.name === "edge").status, "NOT_RUN");
    assert.equal(executed.length, 2);
  });

  it("keeps running after failure when stop-on-failure is false", async () => {
    const root = makeTempRoot();
    const report = await runSystemMixedWorkloadLadder(
      {
        ...defaults,
        out: "reports/ladder.json",
        manageDocker: "false",
        stopOnFailure: "false",
        steps: "smoke:2:4:8:16,low:4:8:16:32",
      },
      {
        root,
        runStep: async (options) =>
          options.profile.endsWith("_SMOKE") ? mixedReport(options, { status: "FAILED", errors: 1 }) : mixedReport(options),
        now: fixedClock(),
      },
    );

    assert.equal(report.status, "FAILED");
    assert.equal(report.summary.executedSteps, 2);
    assert.equal(report.summary.failedSteps, 1);
    assert.equal(report.summary.highestPassedStep, "low");
  });

  it("records managed Docker setup and cleanup, and skips steps on setup failure", async () => {
    const root = makeTempRoot();
    let runs = 0;
    const report = await runSystemMixedWorkloadLadder(
      {
        ...defaults,
        out: "reports/ladder.json",
        manageDocker: "true",
        dockerCleanup: "down",
      },
      {
        root,
        runStep: async (options) => {
          runs += 1;
          return mixedReport(options);
        },
        runSync: (_command, args) => ({
          command: "npm",
          args,
          exitCode: args.includes("perf:identity-session:up") ? 1 : 0,
          elapsedMs: 5,
          outputTail: "docker output with ueacd postgres://app_user:ueacd@127.0.0.1/db",
        }),
        now: fixedClock(),
      },
    );

    assert.equal(report.status, "FAILED");
    assert.equal(runs, 0);
    assert.equal(report.setup.map((entry) => entry.phase).join(","), "setup-reset,setup-up");
    assert.equal(report.cleanup[0].phase, "cleanup");
    assert.match(report.runnerErrors.join("\n"), /managed Docker setup failed/u);
    assert.doesNotMatch(JSON.stringify(report), /postgres:\/\/app_user/u);
    assert.doesNotMatch(JSON.stringify(report), /ueacd/u);
  });

  it("builds a report object with ladder summary metrics", () => {
    const steps = buildLadderSteps({
      ...defaults,
      steps: "smoke:2:4:8:16,low:4:8:16:32",
    });
    const report = buildSystemMixedWorkloadLadderReport({
      options: defaults,
      steps,
      stepReports: [
        { step: steps[0], report: mixedReport(steps[0].options, { maxP99Ms: 25 }) },
        { step: steps[1], report: mixedReport(steps[1].options, { maxP99Ms: 40 }) },
      ],
      startedAt: "2026-06-01T00:00:00.000Z",
      endedAt: "2026-06-01T00:00:01.000Z",
    });

    assert.equal(report.status, "PASSED");
    assert.equal(report.summary.maxP99Ms, 40);
    assert.equal(report.summary.configuredSteps, 2);
  });
});

function mixedReport(options, overrides = {}) {
  const errors = overrides.errors ?? 0;
  const status = overrides.status ?? "PASSED";
  const maxP99Ms = overrides.maxP99Ms ?? Number(options.conversationConcurrency) + 10;
  return {
    status,
    summary: {
      totalErrors: errors,
      maxP95Ms: maxP99Ms * 0.8,
      maxP99Ms,
    },
    workloads: [
      {
        name: "identity_http",
        status,
        errors,
        p95Ms: maxP99Ms * 0.7,
        p99Ms: maxP99Ms,
      },
      {
        name: "conversation_write",
        status,
        errors: 0,
        p95Ms: maxP99Ms * 0.8,
        p99Ms: maxP99Ms,
      },
      {
        name: "teaching_archive",
        status,
        errors: 0,
        p95Ms: maxP99Ms * 0.75,
        p99Ms: maxP99Ms - 1,
      },
    ],
  };
}

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ita-mixed-ladder-"));
}

function fixedClock() {
  let tick = 0;
  return () => `2026-06-01T00:00:0${tick++}.000Z`;
}
