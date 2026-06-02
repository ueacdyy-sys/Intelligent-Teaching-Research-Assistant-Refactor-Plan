import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  buildSampleRuns,
  buildSystemSustainedMixedWorkloadReport,
  defaults,
  formatSystemSustainedMixedWorkload,
  parseArgs,
  runSystemSustainedMixedWorkload,
} from "./run-system-sustained-mixed-workload.mjs";

describe("system sustained mixed workload runner", () => {
  it("parses kebab-case sustained workload options", () => {
    const parsed = parseArgs([
      "--sample-prefix",
      "reports/custom-sustained",
      "--samples",
      "3",
      "--sample-interval-ms",
      "25",
      "--teaching-concurrency",
      "6",
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

    assert.equal(parsed.samplePrefix, "reports/custom-sustained");
    assert.equal(parsed.samples, "3");
    assert.equal(parsed.sampleIntervalMs, "25");
    assert.equal(parsed.teachingConcurrency, "6");
    assert.equal(parsed.identityIngressProxy, "true");
    assert.equal(parsed.identityIngressCount, "16");
    assert.equal(parsed.identityMaxConnsPerHost, "150");
    assert.equal(parsed.identitySessionDbSessionTablePersistence, "unlogged");
    assert.equal(parsed.identitySessionDbWriteConcurrency, "10");
    assert.equal(parsed.stopOnFailure, "false");
  });

  it("builds isolated five-slice sample options", () => {
    const samples = buildSampleRuns({
      ...defaults,
      samples: "2",
      samplePrefix: "reports/sustained",
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
    });

    assert.deepEqual(samples.map((sample) => sample.name), ["sample-1", "sample-2"]);
    assert.equal(samples[0].options.out, "reports/sustained.1.json");
    assert.equal(samples[0].options.teachingOut, "reports/sustained.1.teaching-archive.json");
    assert.equal(samples[1].options.knowledgeOut, "reports/sustained.2.knowledge-retrieval.json");
    assert.equal(samples[0].options.manageDocker, "false");
    assert.equal(samples[0].options.identityBaseUrl, "http://127.0.0.1:19000");
    assert.equal(samples[0].options.conversationBaseUrl, "http://127.0.0.1:19100");
    assert.equal(samples[0].options.teachingBaseUrl, "http://127.0.0.1:19200");
    assert.equal(samples[0].options.maxConnsPerHost, "70");
    assert.equal(samples[0].options.identityMaxConnsPerHost, "150");
    assert.equal(samples[0].options.identityIngressProxy, "true");
    assert.equal(samples[0].options.identityIngressPort, "19080");
    assert.equal(samples[0].options.identityIngressCount, "16");
    assert.equal(samples[0].options.identityIngressMaxConnsPerHost, "40");
    assert.equal(samples[0].options.identitySessionDbSessionTablePersistence, "unlogged");
    assert.equal(samples[0].options.identitySessionDbWriteConcurrency, "10");
  });

  it("runs every sample and writes a passed sustained report", async () => {
    const root = makeTempRoot();
    const report = await runSystemSustainedMixedWorkload(
      {
        ...defaults,
        out: "reports/sustained.json",
        manageDocker: "false",
        samples: "2",
      },
      {
        root,
        runSample: async (options) => mixedReport(options),
        sleep: async () => {},
        now: fixedClock(),
      },
    );

    assert.equal(report.status, "PASSED");
    assert.equal(report.workloadType, "SUSTAINED_MIXED_WORKLOAD");
    assert.equal(report.summary.executedSamples, 2);
    assert.equal(report.summary.p99DriftMs, 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, "reports/sustained.json"), "utf8")).status, "PASSED");
    assert.match(formatSystemSustainedMixedWorkload(report), /System sustained mixed workload: PASSED/u);
  });

  it("stops after the first failed sample by default", async () => {
    const root = makeTempRoot();
    const executed = [];
    const report = await runSystemSustainedMixedWorkload(
      {
        ...defaults,
        out: "reports/sustained.json",
        manageDocker: "false",
        samples: "3",
      },
      {
        root,
        runSample: async (options) => {
          executed.push(options.profile);
          return executed.length === 2 ? mixedReport(options, { status: "FAILED", errors: 2 }) : mixedReport(options);
        },
        sleep: async () => {},
        now: fixedClock(),
      },
    );

    assert.equal(report.status, "FAILED");
    assert.equal(report.summary.executedSamples, 2);
    assert.equal(report.summary.firstFailedSample, "sample-2");
    assert.equal(report.samples.find((sample) => sample.name === "sample-3").status, "NOT_RUN");
  });

  it("keeps running after failures when stop-on-failure is false", async () => {
    const root = makeTempRoot();
    const report = await runSystemSustainedMixedWorkload(
      {
        ...defaults,
        out: "reports/sustained.json",
        manageDocker: "false",
        stopOnFailure: "false",
        samples: "2",
      },
      {
        root,
        runSample: async (options) =>
          options.profile.endsWith("_1") ? mixedReport(options, { status: "FAILED", errors: 1 }) : mixedReport(options),
        sleep: async () => {},
        now: fixedClock(),
      },
    );

    assert.equal(report.status, "FAILED");
    assert.equal(report.summary.executedSamples, 2);
    assert.equal(report.summary.failedSamples, 1);
    assert.equal(report.summary.highestPassedSample, "sample-2");
  });

  it("records managed Docker setup and cleanup, and skips samples on setup failure", async () => {
    const root = makeTempRoot();
    let runs = 0;
    const report = await runSystemSustainedMixedWorkload(
      {
        ...defaults,
        out: "reports/sustained.json",
        manageDocker: "true",
        dockerCleanup: "down",
      },
      {
        root,
        runSample: async (options) => {
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
        sleep: async () => {},
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

  it("builds a report object with sustained P99 drift", () => {
    const options = {
      ...defaults,
      samples: "2",
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
    };
    const samples = buildSampleRuns({
      ...options,
    });
    const report = buildSystemSustainedMixedWorkloadReport({
      options,
      sampleRuns: samples,
      sampleReports: [
        { sample: samples[0], report: mixedReport(samples[0].options, { maxP99Ms: 40 }) },
        { sample: samples[1], report: mixedReport(samples[1].options, { maxP99Ms: 55 }) },
      ],
      startedAt: "2026-06-01T00:00:00.000Z",
      endedAt: "2026-06-01T00:00:01.000Z",
    });

    assert.equal(report.status, "PASSED");
    assert.equal(report.summary.maxP99Ms, 55);
    assert.equal(report.summary.p99DriftMs, 15);
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
      workload("identity_http", status, errors, maxP99Ms),
      workload("conversation_write", status, 0, maxP99Ms - 1),
      workload("teaching_archive", status, 0, maxP99Ms - 2),
      workload("knowledge_retrieval", "READY", 0, null),
      workload("ai_worker_admission", "READY", 0, null),
    ],
  };
}

function workload(name, status, errors, p99Ms) {
  return {
    name,
    status,
    errors,
    p95Ms: Number.isFinite(p99Ms) ? p99Ms * 0.8 : null,
    p99Ms,
  };
}

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ita-sustained-mixed-"));
}

function fixedClock() {
  let tick = 0;
  return () => `2026-06-01T00:00:0${tick++}.000Z`;
}
