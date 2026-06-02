import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  buildScaleUpSteps,
  buildSystemSustainedMixedWorkloadScaleUpReport,
  defaults,
  formatSystemSustainedMixedWorkloadScaleUp,
  parseArgs,
  runSystemSustainedMixedWorkloadScaleUp,
} from "./run-system-sustained-mixed-workload-scaleup.mjs";

describe("system sustained mixed workload scale-up runner", () => {
  it("parses kebab-case scale-up options", () => {
    const parsed = parseArgs([
      "--step-prefix",
      "reports/custom-scale",
      "--steps",
      "smoke:2:4:8:16:2:4,edge:4:8:16:32:4:8",
      "--samples",
      "3",
      "--max-p99-ms",
      "800",
      "--max-p99-drift-ms",
      "120",
      "--conversation-benchmark-runtime",
      "wsl",
      "--conversation-benchmark-wsl-host",
      "172.28.160.1",
      "--conversation-benchmark-wsl-workspace",
      "/mnt/c/workspace",
      "--identity-ingress-proxy",
      "true",
      "--identity-ingress-count",
      "16",
      "--identity-max-conns-per-host",
      "150",
      "--identity-session-db-session-table-persistence",
      "UNLOGGED",
      "--identity-session-db-write-concurrency",
      "10",
      "--stop-on-failure",
      "false",
    ]);

    assert.equal(parsed.stepPrefix, "reports/custom-scale");
    assert.equal(parsed.samples, "3");
    assert.equal(parsed.maxP99Ms, "800");
    assert.equal(parsed.maxP99DriftMs, "120");
    assert.equal(parsed.conversationBenchmarkRuntime, "wsl");
    assert.equal(parsed.conversationBenchmarkWslHost, "172.28.160.1");
    assert.equal(parsed.conversationBenchmarkWslWorkspace, "/mnt/c/workspace");
    assert.equal(parsed.identityIngressProxy, "true");
    assert.equal(parsed.identityIngressCount, "16");
    assert.equal(parsed.identityMaxConnsPerHost, "150");
    assert.equal(parsed.identitySessionDbSessionTablePersistence, "unlogged");
    assert.equal(parsed.identitySessionDbWriteConcurrency, "10");
    assert.equal(parsed.stopOnFailure, "false");
  });

  it("builds isolated sustained step options", () => {
    const steps = buildScaleUpSteps({
      ...defaults,
      stepPrefix: "reports/scaleup",
      steps: "smoke:2:4:8:16,low:4:8:16:32:6:12",
      samples: "2",
      identityBaseUrl: "http://127.0.0.1:19000",
      conversationBaseUrl: "http://127.0.0.1:19100",
      teachingBaseUrl: "http://127.0.0.1:19200",
      maxConnsPerHost: "70",
      warmConnectionsPerHost: "9",
      identityMaxConnsPerHost: "150",
      identityWarmConnectionsPerHost: "150",
      identityIngressProxy: "true",
      identityIngressPort: "19080",
      identityIngressCount: "16",
      identityIngressMaxConnsPerHost: "40",
      identityIngressWarmConnectionsPerHost: "16",
      identitySessionDbSessionTablePersistence: "unlogged",
      identitySessionDbWriteConcurrency: "10",
      conversationBenchmarkRuntime: "wsl",
      conversationBenchmarkWslHost: "172.28.160.1",
      conversationBenchmarkWslWorkspace: "/mnt/c/workspace",
    });

    assert.deepEqual(steps.map((step) => step.name), ["smoke", "low"]);
    assert.equal(steps[0].options.out, "reports/scaleup.1-smoke.json");
    assert.equal(steps[0].options.samplePrefix, "reports/scaleup.1-smoke");
    assert.equal(steps[1].options.identityConcurrency, "4");
    assert.equal(steps[1].options.conversationConcurrency, "16");
    assert.equal(steps[1].options.teachingConcurrency, "6");
    assert.equal(steps[1].options.teachingOperations, "12");
    assert.equal(steps[0].options.manageDocker, "false");
    assert.equal(steps[0].options.samples, "2");
    assert.equal(steps[0].options.identityBaseUrl, "http://127.0.0.1:19000");
    assert.equal(steps[0].options.conversationBaseUrl, "http://127.0.0.1:19100");
    assert.equal(steps[0].options.teachingBaseUrl, "http://127.0.0.1:19200");
    assert.equal(steps[0].options.maxConnsPerHost, "70");
    assert.equal(steps[0].options.identityMaxConnsPerHost, "150");
    assert.equal(steps[0].options.identityIngressProxy, "true");
    assert.equal(steps[0].options.identityIngressPort, "19080");
    assert.equal(steps[0].options.identityIngressCount, "16");
    assert.equal(steps[0].options.identityIngressMaxConnsPerHost, "40");
    assert.equal(steps[0].options.identitySessionDbSessionTablePersistence, "unlogged");
    assert.equal(steps[0].options.identitySessionDbWriteConcurrency, "10");
    assert.equal(steps[0].options.conversationBenchmarkRuntime, "wsl");
    assert.equal(steps[0].options.conversationBenchmarkWslHost, "172.28.160.1");
    assert.equal(steps[0].options.conversationBenchmarkWslWorkspace, "/mnt/c/workspace");
  });

  it("runs every scale-up step and writes a passed report", async () => {
    const root = makeTempRoot();
    const report = await runSystemSustainedMixedWorkloadScaleUp(
      {
        ...defaults,
        out: "reports/scaleup.json",
        manageDocker: "false",
        steps: "smoke:2:4:8:16,low:4:8:16:32",
      },
      {
        root,
        runStep: async (options) => sustainedReport(options),
        now: fixedClock(),
      },
    );

    assert.equal(report.status, "PASSED");
    assert.equal(report.workloadType, "SUSTAINED_MIXED_WORKLOAD_SCALE_UP");
    assert.equal(report.summary.executedSteps, 2);
    assert.equal(report.summary.highestPassedStep, "low");
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, "reports/scaleup.json"), "utf8")).status, "PASSED");
    assert.match(formatSystemSustainedMixedWorkloadScaleUp(report), /System sustained mixed workload scale-up: PASSED/u);
  });

  it("stops after the first failed sustained step by default", async () => {
    const root = makeTempRoot();
    const executed = [];
    const report = await runSystemSustainedMixedWorkloadScaleUp(
      {
        ...defaults,
        out: "reports/scaleup.json",
        manageDocker: "false",
        steps: "smoke:2:4:8:16,low:4:8:16:32,edge:8:16:32:64",
      },
      {
        root,
        runStep: async (options) => {
          executed.push(options.profile);
          return options.profile.endsWith("_LOW") ? sustainedReport(options, { status: "FAILED", errors: 1 }) : sustainedReport(options);
        },
        now: fixedClock(),
      },
    );

    assert.equal(report.status, "FAILED");
    assert.equal(report.summary.executedSteps, 2);
    assert.equal(report.summary.firstBlockedStep, "low");
    assert.equal(report.steps.find((step) => step.name === "edge").status, "NOT_RUN");
    assert.equal(executed.length, 2);
  });

  it("stops after the first guardrail-blocked sustained step by default", async () => {
    const root = makeTempRoot();
    const report = await runSystemSustainedMixedWorkloadScaleUp(
      {
        ...defaults,
        out: "reports/scaleup.json",
        manageDocker: "false",
        maxP99Ms: "50",
        steps: "smoke:2:4:8:16,edge:4:8:16:32",
      },
      {
        root,
        runStep: async (options) => sustainedReport(options, { maxP99Ms: options.profile.endsWith("_SMOKE") ? 80 : 30 }),
        now: fixedClock(),
      },
    );

    assert.equal(report.status, "FAILED");
    assert.equal(report.summary.executedSteps, 1);
    assert.equal(report.summary.firstBlockedStep, "smoke");
    assert.equal(report.steps[0].guardrailStatus, "BLOCKED");
    assert.equal(report.steps[1].status, "NOT_RUN");
  });

  it("keeps running after blocked steps when stop-on-failure is false", async () => {
    const root = makeTempRoot();
    const report = await runSystemSustainedMixedWorkloadScaleUp(
      {
        ...defaults,
        out: "reports/scaleup.json",
        manageDocker: "false",
        stopOnFailure: "false",
        maxP99DriftMs: "5",
        steps: "smoke:2:4:8:16,low:4:8:16:32",
      },
      {
        root,
        runStep: async (options) =>
          options.profile.endsWith("_SMOKE") ? sustainedReport(options, { p99DriftMs: 10 }) : sustainedReport(options),
        now: fixedClock(),
      },
    );

    assert.equal(report.status, "FAILED");
    assert.equal(report.summary.executedSteps, 2);
    assert.equal(report.summary.blockedSteps, 1);
    assert.equal(report.summary.highestPassedStep, "low");
  });

  it("records managed Docker setup and cleanup, and masks secrets", async () => {
    const root = makeTempRoot();
    let runs = 0;
    const report = await runSystemSustainedMixedWorkloadScaleUp(
      {
        ...defaults,
        out: "reports/scaleup.json",
        manageDocker: "true",
        dockerCleanup: "down",
      },
      {
        root,
        runStep: async (options) => {
          runs += 1;
          return sustainedReport(options);
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

  it("builds a rollup with scale-up guardrail findings", () => {
    const options = {
      ...defaults,
      steps: "smoke:2:4:8:16,low:4:8:16:32",
      maxP99Ms: "100",
      maxConnsPerHost: "70",
      warmConnectionsPerHost: "9",
      identityMaxConnsPerHost: "150",
      identityWarmConnectionsPerHost: "150",
      identityIngressProxy: "true",
      identityIngressPort: "19080",
      identityIngressCount: "16",
      identityIngressMaxConnsPerHost: "40",
      identityIngressWarmConnectionsPerHost: "16",
      identitySessionDbSessionTablePersistence: "unlogged",
      identitySessionDbWriteConcurrency: "10",
      conversationBenchmarkRuntime: "wsl",
      conversationBenchmarkWslHost: "172.28.160.1",
      conversationBenchmarkWslWorkspace: "/mnt/c/workspace",
    };
    const steps = buildScaleUpSteps({
      ...options,
    });
    const report = buildSystemSustainedMixedWorkloadScaleUpReport({
      options,
      steps,
      stepReports: [
        { step: steps[0], report: sustainedReport(steps[0].options, { maxP99Ms: 40 }) },
        { step: steps[1], report: sustainedReport(steps[1].options, { maxP99Ms: 120 }) },
      ],
      startedAt: "2026-06-01T00:00:00.000Z",
      endedAt: "2026-06-01T00:00:01.000Z",
    });

    assert.equal(report.status, "FAILED");
    assert.equal(report.summary.highestPassedStep, "smoke");
    assert.equal(report.summary.firstBlockedStep, "low");
    assert.equal(report.steps[1].guardrailFindings.find((finding) => finding.id === "step.max_p99_within_guardrail").passed, false);
    assert.deepEqual(report.transportProfile, {
      sharedMaxConnsPerHost: 70,
      sharedWarmConnectionsPerHost: 9,
      identityMaxConnsPerHost: 150,
      identityWarmConnectionsPerHost: 150,
    });
    assert.deepEqual(report.identityIngressProfile, {
      enabled: true,
      basePort: 19080,
      workerCount: 16,
      upstreamGatewayCount: 1,
      maxConnsPerHost: 40,
      warmConnectionsPerHost: 16,
    });
    assert.equal(report.databaseProfile.identitySessionTablePersistence, "unlogged");
    assert.equal(report.databaseProfile.identitySessionDbWriteConcurrency, 10);
    assert.equal(report.conversationBenchmarkRuntimeProfile.executor, "WSL_GO");
    assert.equal(report.conversationBenchmarkRuntimeProfile.wslHostAlias, "172.28.160.1");
    assert.equal(report.conversationBenchmarkRuntimeProfile.wslWorkspace, "/mnt/c/workspace");
    const conversation = report.steps[0].workloads.find((workload) => workload.name === "conversation_write");
    assert.equal(conversation.summary.clientServerGapP99Ms, 101);
    assert.equal(conversation.summary.dbBatchWaitP99Ms, 14);
    assert.equal(conversation.summary.benchmarkRuntimeProfile.executor, "WSL_GO");
    assert.equal(conversation.summary.runtimeDiagnostics.after.totalAcceptedConns, 240);
  });

  it("does not convert missing P99 drift into a scale-up drift metric", () => {
    const steps = buildScaleUpSteps({
      ...defaults,
      steps: "single:2:4:8:16",
    });
    const report = buildSystemSustainedMixedWorkloadScaleUpReport({
      options: defaults,
      steps,
      stepReports: [
        { step: steps[0], report: sustainedReport(steps[0].options, { p99DriftMs: null }) },
      ],
      startedAt: "2026-06-01T00:00:00.000Z",
      endedAt: "2026-06-01T00:00:01.000Z",
    });

    assert.equal(report.status, "PASSED");
    assert.equal(report.steps[0].p99DriftMs, null);
    assert.equal(report.summary.maxP99DriftMs, null);
  });
});

function sustainedReport(options, overrides = {}) {
  const errors = overrides.errors ?? 0;
  const status = overrides.status ?? "PASSED";
  const maxP99Ms = overrides.maxP99Ms ?? Number(options.conversationConcurrency) + 10;
  const p99DriftMs = Object.hasOwn(overrides, "p99DriftMs") ? overrides.p99DriftMs : 0;
  const sampleCount = Number(options.samples);
  return {
    status,
    summary: {
      executedSamples: Number(options.samples),
      totalErrors: errors,
      maxP95Ms: maxP99Ms * 0.8,
      maxP99Ms,
      p99DriftMs,
    },
    samples: Array.from({ length: sampleCount }, (_entry, index) => ({
      name: `sample-${index + 1}`,
      workloads: [
        workload("identity_http", index === 0 ? errors : 0, maxP99Ms),
        workload("conversation_write", 0, maxP99Ms - 1, conversationSummary(index)),
        workload("teaching_archive", 0, maxP99Ms - 2),
      ],
    })),
  };
}

function workload(name, errors, p99Ms, summary = undefined) {
  return {
    name,
    errors,
    p99Ms,
    summary,
  };
}

function conversationSummary(index) {
  return {
    errors: 0,
    clientServerGapP99Ms: index === 0 ? 77 : 101,
    dbBatchWaitP99Ms: index === 0 ? 12 : 14,
    benchmarkRuntimeProfile: {
      executor: "WSL_GO",
      wslDistro: "Ubuntu",
      wslHostAlias: "172.28.160.1",
      wslWorkspace: "/mnt/c/workspace",
      targetBaseUrls: ["http://172.28.160.1:18100"],
    },
    runtimeDiagnostics: {
      after: {
        gatewayCount: 2,
        okGateways: 2,
        unavailableGateways: 0,
        totalAcceptedConns: index === 0 ? 120 : 240,
      },
    },
  };
}

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ita-sustained-scaleup-"));
}

function fixedClock() {
  let tick = 0;
  return () => `2026-06-01T00:00:0${tick++}.000Z`;
}
