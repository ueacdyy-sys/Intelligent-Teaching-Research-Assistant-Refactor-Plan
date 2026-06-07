import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  fixedClock,
  makeTempRoot,
  pickOptions,
  production10kTargetOptions,
  sustainedReport,
} from "./run-system-sustained-mixed-workload-scaleup-fixtures.test.mjs";
import {
  buildScaleUpSteps,
  buildSystemSustainedMixedWorkloadScaleUpReport,
  defaults,
  formatSystemSustainedMixedWorkloadScaleUp,
  parseArgs,
  runSystemSustainedMixedWorkloadScaleUp,
} from "./run-system-sustained-mixed-workload-scaleup.mjs";

describe("system sustained mixed workload scale-up runner", () => {
  it("keeps the default scale-up ladder deep enough for root SLO review", () => {
    const steps = buildScaleUpSteps(defaults);

    assert.deepEqual(steps.map((step) => step.name), ["smoke", "low", "medium", "high"]);
    assert.equal(steps.at(-1).options.profile, "SUSTAINED_SCALEUP_HIGH");
    assert.equal(steps.at(-1).options.identityConcurrency, "16");
    assert.equal(steps.at(-1).options.conversationConcurrency, "64");
    assert.equal(steps.at(-1).options.teachingConcurrency, "16");
  });

  it("builds a production 10k candidate ladder without changing the default ladder", () => {
    const parsed = parseArgs(["--scale-profile", "production10k"]);
    const steps = buildScaleUpSteps(parsed);
    const targetStep = steps.find((step) => step.name === "target-10k");

    assert.equal(parsed.scaleProfile, "production10k");
    assert.deepEqual(steps.map((step) => step.name), [
      "smoke",
      "low",
      "medium",
      "high",
      "target-3k",
      "target-5k",
      "target-8k",
      "target-10k",
    ]);
    assert.equal(targetStep.targetReadWriteRps, 10000);
    assert.deepEqual(pickOptions(targetStep.options, production10kTargetOptions), production10kTargetOptions);
    assert.deepEqual(buildScaleUpSteps(defaults).map((step) => step.name), ["smoke", "low", "medium", "high"]);
  });

  it("parses kebab-case scale-up options", () => {
    const parsed = parseArgs([
      "--step-prefix",
      "reports/custom-scale",
      "--scale-profile",
      "production10k",
      "--target-read-write-rps",
      "12000",
      "--steps",
      "smoke:2:4:8:16:2:4,edge:4:8:16:32:4:8:12000",
      "--samples",
      "3",
      "--identity-dsn",
      "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable",
      "--conversation-dsn",
      "postgres://app_user:ueacd@127.0.0.1:16433/intelligent_teaching_assistant?sslmode=disable",
      "--teaching-dsn",
      "postgres://app_user:ueacd@127.0.0.1:16434/intelligent_teaching_assistant?sslmode=disable",
      "--max-p99-ms",
      "800",
      "--max-p99-drift-ms",
      "120",
      "--conversation-benchmark-runtime",
      "wsl",
      "--conversation-write-batch-workers",
      "2",
      "--conversation-write-batch-mode",
      "copy",
      "--conversation-benchmark-wsl-host",
      "172.28.160.1",
      "--conversation-benchmark-wsl-workspace",
      "/mnt/c/workspace",
      "--identity-benchmark-runtime",
      "docker",
      "--teaching-benchmark-runtime",
      "docker",
      "--teaching-benchmark-docker-host",
      "host.docker.internal",
      "--teaching-db-min-conns",
      "12",
      "--teaching-db-prewarm-conns",
      "12",
      "--teaching-max-conns-per-host",
      "128",
      "--teaching-warm-connections-per-host",
      "96",
      "--teaching-client-trace",
      "true",
      "--teaching-archive-create-batch-size",
      "96",
      "--teaching-archive-create-batch-delay-ms",
      "1",
      "--teaching-archive-create-batch-workers",
      "2",
      "--teaching-archive-create-batch-mode",
      "copy",
      "--teaching-quiz-submission-batch-size",
      "16",
      "--teaching-quiz-submission-batch-delay-ms",
      "0",
      "--teaching-quiz-submission-batch-workers",
      "8",
      "--teaching-archive-list-cache-ttl-ms",
      "250",
      "--teaching-archive-list-cache-max-entries",
      "4096",
      "--teaching-archive-schema-index-profile",
      "hot_write",
      "--teaching-gateway-count",
      "4",
      "--identity-benchmark-docker-image",
      "golang:1.26-alpine",
      "--identity-benchmark-docker-host",
      "host.docker.internal",
      "--identity-ingress-proxy",
      "true",
      "--identity-ingress-count",
      "16",
      "--identity-max-conns-per-host",
      "150",
      "--identity-session-db-session-table-persistence",
      "UNLOGGED",
      "--identity-session-db-read-max-conns",
      "24",
      "--identity-session-db-read-min-conns",
      "12",
      "--identity-session-db-read-prewarm-conns",
      "12",
      "--identity-session-db-write-concurrency",
      "10",
      "--identity-warmup-operations",
      "80",
      "--stop-on-failure",
      "false",
    ]);

    assert.equal(parsed.stepPrefix, "reports/custom-scale");
    assert.equal(parsed.scaleProfile, "production10k");
    assert.equal(parsed.dockerStack, "system-persistence");
    assert.equal(parsed.targetReadWriteRps, "12000");
    assert.equal(parsed.samples, "3");
    assert.equal(parsed.identityDsn, "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable");
    assert.equal(parsed.conversationDsn, "postgres://app_user:ueacd@127.0.0.1:16433/intelligent_teaching_assistant?sslmode=disable");
    assert.equal(parsed.teachingDsn, "postgres://app_user:ueacd@127.0.0.1:16434/intelligent_teaching_assistant?sslmode=disable");
    assert.equal(parsed.maxP99Ms, "800");
    assert.equal(parsed.maxP99DriftMs, "120");
    assert.equal(parsed.conversationBenchmarkRuntime, "wsl");
    assert.equal(parsed.conversationWriteBatchWorkers, "2");
    assert.equal(parsed.conversationWriteBatchMode, "copy");
    assert.equal(parsed.conversationBenchmarkWslHost, "172.28.160.1");
    assert.equal(parsed.conversationBenchmarkWslWorkspace, "/mnt/c/workspace");
    assert.equal(parsed.maxConnsPerHost, "256");
    assert.equal(parsed.warmConnectionsPerHost, "144");
    assert.equal(parsed.identityBenchmarkRuntime, "docker");
    assert.equal(parsed.teachingBenchmarkRuntime, "docker");
    assert.equal(parsed.teachingBenchmarkDockerHost, "host.docker.internal");
    assert.equal(parsed.teachingDbMinConns, "12");
    assert.equal(parsed.teachingDbPrewarmConns, "12");
    assert.equal(parsed.teachingMaxConnsPerHost, "128");
    assert.equal(parsed.teachingWarmConnectionsPerHost, "96");
    assert.equal(parsed.teachingClientTrace, "true");
    assert.equal(parsed.teachingArchiveCreateBatchSize, "96");
    assert.equal(parsed.teachingArchiveCreateBatchDelayMs, "1");
    assert.equal(parsed.teachingArchiveCreateBatchWorkers, "2");
    assert.equal(parsed.teachingArchiveCreateBatchMode, "copy");
    assert.equal(parsed.teachingQuizSubmissionBatchSize, "16");
    assert.equal(parsed.teachingQuizSubmissionBatchDelayMs, "0");
    assert.equal(parsed.teachingQuizSubmissionBatchWorkers, "8");
    assert.equal(parsed.teachingArchiveListCacheTtlMs, "250");
    assert.equal(parsed.teachingArchiveListCacheMaxEntries, "4096");
    assert.equal(parsed.teachingArchiveSchemaIndexProfile, "hot_write");
    assert.equal(parsed.teachingGatewayCount, "4");
    assert.equal(parsed.identityBenchmarkDockerImage, "golang:1.26-alpine");
    assert.equal(parsed.identityBenchmarkDockerHost, "host.docker.internal");
    assert.equal(parsed.identityIngressProxy, "true");
    assert.equal(parsed.identityIngressCount, "16");
    assert.equal(parsed.identityMaxConnsPerHost, "150");
    assert.equal(parsed.identitySessionDbSessionTablePersistence, "unlogged");
    assert.equal(parsed.identitySessionDbReadMaxConns, "24");
    assert.equal(parsed.identitySessionDbReadMinConns, "12");
    assert.equal(parsed.identitySessionDbReadPrewarmConns, "12");
    assert.equal(parsed.identitySessionDbWriteConcurrency, "10");
    assert.equal(parsed.identityWarmupOperations, "80");
    assert.equal(parsed.stopOnFailure, "false");
  });

  it("builds isolated sustained step options", () => {
    const identityDsn = "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable";
    const conversationDsn = "postgres://app_user:ueacd@127.0.0.1:16433/intelligent_teaching_assistant?sslmode=disable";
    const teachingDsn = "postgres://app_user:ueacd@127.0.0.1:16434/intelligent_teaching_assistant?sslmode=disable";
    const steps = buildScaleUpSteps({
      ...defaults,
      stepPrefix: "reports/scaleup",
      steps: "smoke:2:4:8:16,low:4:8:16:32:6:12",
      samples: "2",
      identityBaseUrl: "http://127.0.0.1:19000",
      conversationBaseUrl: "http://127.0.0.1:19100",
      teachingBaseUrl: "http://127.0.0.1:19200",
      identityDsn,
      conversationDsn,
      teachingDsn,
      maxConnsPerHost: "70",
      warmConnectionsPerHost: "9",
      identityMaxConnsPerHost: "150",
      identityWarmConnectionsPerHost: "150",
      identityIngressProxy: "true",
      identityIngressPort: "19080",
      identityIngressCount: "16",
      identityIngressMaxConnsPerHost: "40",
      identityIngressWarmConnectionsPerHost: "16",
      identitySessionDbMinConns: "6",
      identitySessionDbPrewarmConns: "6",
      identitySessionDbReadMaxConns: "24",
      identitySessionDbReadMinConns: "12",
      identitySessionDbReadPrewarmConns: "12",
      identitySessionDbSessionTablePersistence: "unlogged",
      identitySessionDbWriteConcurrency: "10",
      identityWarmupOperations: "80",
      conversationBenchmarkRuntime: "wsl",
      conversationBenchmarkWslHost: "172.28.160.1",
      conversationBenchmarkWslWorkspace: "/mnt/c/workspace",
      conversationWriteBatchWorkers: "2",
      conversationWriteBatchMode: "copy",
      teachingGatewayCount: "3",
      identityBenchmarkRuntime: "docker",
      identityBenchmarkDockerImage: "golang:1.26-alpine",
      identityBenchmarkDockerHost: "host.docker.internal",
      teachingBenchmarkRuntime: "docker",
      teachingBenchmarkDockerImage: "golang:1.26-alpine",
      teachingBenchmarkDockerHost: "host.docker.internal",
      teachingDbMinConns: "12",
      teachingDbPrewarmConns: "12",
      teachingMaxConnsPerHost: "128",
      teachingWarmConnectionsPerHost: "96",
      teachingClientTrace: "true",
      teachingArchiveCreateBatchSize: "64",
      teachingArchiveCreateBatchDelayMs: "1",
      teachingArchiveCreateBatchWorkers: "2",
      teachingArchiveCreateBatchMode: "copy",
      teachingQuizSubmissionBatchSize: "16",
      teachingQuizSubmissionBatchDelayMs: "0",
      teachingQuizSubmissionBatchWorkers: "8",
      teachingArchiveListCacheTtlMs: "250",
      teachingArchiveListCacheMaxEntries: "4096",
      teachingArchiveSchemaIndexProfile: "hot_write",
    });

    assert.deepEqual(steps.map((step) => step.name), ["smoke", "low"]);
    assert.equal(steps[0].options.out, "reports/scaleup.1-smoke.json");
    assert.equal(steps[0].options.samplePrefix, "reports/scaleup.1-smoke");
    assert.equal(steps[1].options.identityConcurrency, "4");
    assert.equal(steps[1].options.conversationConcurrency, "16");
    assert.equal(steps[1].options.teachingConcurrency, "6");
    assert.equal(steps[1].options.teachingOperations, "12");
    assert.equal(steps[1].targetReadWriteRps, null);
    assert.equal(steps[0].options.manageDocker, "false");
    assert.equal(steps[0].options.samples, "2");
    assert.equal(steps[0].options.identityBaseUrl, "http://127.0.0.1:19000");
    assert.equal(steps[0].options.conversationBaseUrl, "http://127.0.0.1:19100");
    assert.equal(steps[0].options.teachingBaseUrl, "http://127.0.0.1:19200");
    assert.equal(steps[0].options.identityDsn, identityDsn);
    assert.equal(steps[0].options.conversationDsn, conversationDsn);
    assert.equal(steps[0].options.teachingDsn, teachingDsn);
    assert.equal(steps[0].options.teachingGatewayCount, "3");
    assert.equal(steps[0].options.maxConnsPerHost, "70");
    assert.equal(steps[0].options.identityMaxConnsPerHost, "150");
    assert.equal(steps[0].options.identityIngressProxy, "true");
    assert.equal(steps[0].options.identityIngressPort, "19080");
    assert.equal(steps[0].options.identityIngressCount, "16");
    assert.equal(steps[0].options.identityIngressMaxConnsPerHost, "40");
    assert.equal(steps[0].options.identitySessionDbMinConns, "6");
    assert.equal(steps[0].options.identitySessionDbPrewarmConns, "6");
    assert.equal(steps[0].options.identitySessionDbReadMaxConns, "24");
    assert.equal(steps[0].options.identitySessionDbReadMinConns, "12");
    assert.equal(steps[0].options.identitySessionDbReadPrewarmConns, "12");
    assert.equal(steps[0].options.identitySessionDbSessionTablePersistence, "unlogged");
    assert.equal(steps[0].options.identitySessionDbWriteConcurrency, "10");
    assert.equal(steps[0].options.identityWarmupOperations, "80");
    assert.equal(steps[0].options.conversationBenchmarkRuntime, "wsl");
    assert.equal(steps[0].options.conversationWriteBatchWorkers, "2");
    assert.equal(steps[0].options.conversationWriteBatchMode, "copy");
    assert.equal(steps[0].options.conversationBenchmarkWslHost, "172.28.160.1");
    assert.equal(steps[0].options.conversationBenchmarkWslWorkspace, "/mnt/c/workspace");
    assert.equal(steps[0].options.identityBenchmarkRuntime, "docker");
    assert.equal(steps[0].options.identityBenchmarkDockerImage, "golang:1.26-alpine");
    assert.equal(steps[0].options.identityBenchmarkDockerHost, "host.docker.internal");
    assert.equal(steps[0].options.teachingBenchmarkRuntime, "docker");
    assert.equal(steps[0].options.teachingBenchmarkDockerHost, "host.docker.internal");
    assert.equal(steps[0].options.teachingDbMinConns, "12");
    assert.equal(steps[0].options.teachingDbPrewarmConns, "12");
    assert.equal(steps[0].options.teachingMaxConnsPerHost, "128");
    assert.equal(steps[0].options.teachingWarmConnectionsPerHost, "96");
    assert.equal(steps[0].options.teachingClientTrace, "true");
    assert.equal(steps[0].options.teachingArchiveCreateBatchSize, "64");
    assert.equal(steps[0].options.teachingArchiveCreateBatchDelayMs, "1");
    assert.equal(steps[0].options.teachingArchiveCreateBatchWorkers, "2");
    assert.equal(steps[0].options.teachingArchiveCreateBatchMode, "copy");
    assert.equal(steps[0].options.teachingQuizSubmissionBatchSize, "16");
    assert.equal(steps[0].options.teachingQuizSubmissionBatchDelayMs, "0");
    assert.equal(steps[0].options.teachingQuizSubmissionBatchWorkers, "8");
    assert.equal(steps[0].options.teachingArchiveListCacheTtlMs, "250");
    assert.equal(steps[0].options.teachingArchiveListCacheMaxEntries, "4096");
    assert.equal(steps[0].options.teachingArchiveSchemaIndexProfile, "hot_write");
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
    assert.match(formatSystemSustainedMixedWorkloadScaleUp(report), /low PASSED\/PASSED readWriteRps=370/u);
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

  it("rejects an under-pressured required production target before executing benchmarks", async () => {
    const root = makeTempRoot();
    let executed = 0;
    const report = await runSystemSustainedMixedWorkloadScaleUp(
      {
        ...defaults,
        out: "reports/scaleup.json",
        manageDocker: "false",
        scaleProfile: "production10k",
        steps: "target-10k:2:4:4:8:2:4:10000",
        requireTargetReadWriteRps: "true",
        targetReadWriteRps: "10000",
      },
      {
        root,
        runStep: async (options) => {
          executed += 1;
          return sustainedReport(options);
        },
        now: fixedClock(),
      },
    );

    assert.equal(executed, 0);
    assert.equal(report.status, "FAILED");
    assert.equal(report.throughputTarget.status, "INVALID_PRESSURE");
    assert.equal(report.throughputTarget.attempted, false);
    assert.equal(report.throughputTarget.pressure.invalidStepNames[0], "target-10k");
    assert.match(report.runnerErrors.join("\n"), /target-10k/u);
    assert.match(report.runnerErrors.join("\n"), /effective pressure/u);
  });

  it("builds a rollup with scale-up guardrail findings", () => {
    const options = {
      ...defaults,
      steps: "smoke:2:4:8:16,low:4:8:16:32",
      maxP99Ms: "100",
      identityDsn: "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable",
      conversationDsn: "postgres://app_user:ueacd@127.0.0.1:16433/intelligent_teaching_assistant?sslmode=disable",
      teachingDsn: "postgres://app_user:ueacd@127.0.0.1:16434/intelligent_teaching_assistant?sslmode=disable",
      maxConnsPerHost: "70",
      warmConnectionsPerHost: "9",
      identityMaxConnsPerHost: "150",
      identityWarmConnectionsPerHost: "150",
      identityIngressProxy: "true",
      identityIngressPort: "19080",
      identityIngressCount: "16",
      identityIngressMaxConnsPerHost: "40",
      identityIngressWarmConnectionsPerHost: "16",
      identitySessionDbMinConns: "6",
      identitySessionDbPrewarmConns: "6",
      identitySessionDbReadMaxConns: "24",
      identitySessionDbReadMinConns: "12",
      identitySessionDbReadPrewarmConns: "12",
      identitySessionDbSessionTablePersistence: "unlogged",
      identitySessionDbWriteConcurrency: "10",
      identityWarmupOperations: "80",
      conversationBenchmarkRuntime: "wsl",
      conversationBenchmarkWslHost: "172.28.160.1",
      conversationBenchmarkWslWorkspace: "/mnt/c/workspace",
      conversationWriteBatchWorkers: "2",
      conversationWriteBatchMode: "copy",
      identityBenchmarkRuntime: "docker",
      identityBenchmarkDockerImage: "golang:1.26-alpine",
      identityBenchmarkDockerHost: "host.docker.internal",
      teachingBenchmarkRuntime: "docker",
      teachingBenchmarkDockerImage: "golang:1.26-alpine",
      teachingBenchmarkDockerHost: "host.docker.internal",
      teachingDbMinConns: "12",
      teachingDbPrewarmConns: "12",
      teachingMaxConnsPerHost: "128",
      teachingWarmConnectionsPerHost: "96",
      teachingClientTrace: "true",
      teachingArchiveCreateBatchSize: "64",
      teachingArchiveCreateBatchDelayMs: "1",
      teachingArchiveCreateBatchWorkers: "2",
      teachingArchiveCreateBatchMode: "copy",
      teachingQuizSubmissionBatchSize: "16",
      teachingQuizSubmissionBatchDelayMs: "0",
      teachingQuizSubmissionBatchWorkers: "8",
      teachingArchiveListCacheTtlMs: "250",
      teachingArchiveListCacheMaxEntries: "4096",
      teachingArchiveSchemaIndexProfile: "hot_write",
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
    assert.equal(report.steps[0].readWriteRps, 370);
    assert.equal(report.steps[0].aggregateRps, 370);
    assert.equal(report.summary.highestPassedReadWriteRps, 370);
    assert.equal(report.summary.highestPassedAggregateRps, 370);
    assert.equal(report.summary.maxPassedReadWriteRps, 370);
    assert.equal(report.summary.aggregateReadWriteRps, 370);
    assert.equal(report.throughputTarget.status, "NOT_CONFIGURED");
    assert.equal(report.throughputTarget.attempted, false);
    assert.equal(report.summary.firstBlockedStep, "low");
    assert.equal(report.steps[1].guardrailFindings.find((finding) => finding.id === "step.max_p99_within_guardrail").passed, false);
    assert.equal(report.persistenceProfile.mode, "isolated");
    assert.equal(report.persistenceProfile.domainCount, 3);
    assert.equal(report.persistenceProfile.domains.conversation.port, 16433);
    assert.equal(report.persistenceProfile.domains.teaching.password, "[masked]");
    assert.deepEqual(report.transportProfile, {
      sharedMaxConnsPerHost: 70,
      sharedWarmConnectionsPerHost: 9,
      teachingMaxConnsPerHost: 128,
      teachingWarmConnectionsPerHost: 96,
      teachingClientTrace: true,
      teachingArchiveCreateBatchSize: 64,
      teachingArchiveCreateBatchDelayMs: 1,
      teachingArchiveCreateBatchWorkers: 2,
      teachingArchiveCreateBatchMode: "copy",
      teachingQuizSubmissionBatchSize: 16,
      teachingQuizSubmissionBatchDelayMs: 0,
      teachingQuizSubmissionBatchWorkers: 8,
      teachingWriteAcceptanceMode: "sync",
      teachingCommandLogAppendBatchSize: 64,
      teachingCommandLogQueueCapacity: 65536,
      teachingCommandLogProjectionWorkers: 4,
      teachingCommandLogSync: true,
      teachingCommandLogSettleTimeoutMs: 0,
      teachingArchiveListCacheTtlMs: 250,
      teachingArchiveListCacheMaxEntries: 4096,
      teachingArchiveSchemaIndexProfile: "hot_write",
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
    assert.equal(report.databaseProfile.identitySessionDbMinConns, 6);
    assert.equal(report.databaseProfile.identitySessionDbPrewarmConns, 6);
    assert.equal(report.databaseProfile.identitySessionDbReadMaxConns, 24);
    assert.equal(report.databaseProfile.identitySessionDbReadMinConns, 12);
    assert.equal(report.databaseProfile.identitySessionDbReadPrewarmConns, 12);
    assert.equal(report.databaseProfile.identitySessionDbWriteConcurrency, 10);
    assert.equal(report.databaseProfile.identityWarmupOperations, 80);
    assert.equal(report.databaseProfile.conversationWriteBatchWorkers, 2);
    assert.equal(report.databaseProfile.conversationWriteBatchMode, "copy");
    assert.equal(report.databaseProfile.teachingDbMinConns, 12);
    assert.equal(report.databaseProfile.teachingDbPrewarmConns, 12);
    assert.equal(report.databaseProfile.teachingArchiveCreateBatchSize, 64);
    assert.equal(report.databaseProfile.teachingArchiveCreateBatchDelayMs, 1);
    assert.equal(report.databaseProfile.teachingArchiveCreateBatchWorkers, 2);
    assert.equal(report.databaseProfile.teachingArchiveCreateBatchMode, "copy");
    assert.equal(report.databaseProfile.teachingQuizSubmissionBatchSize, 16);
    assert.equal(report.databaseProfile.teachingQuizSubmissionBatchDelayMs, 0);
    assert.equal(report.databaseProfile.teachingQuizSubmissionBatchWorkers, 8);
    assert.equal(report.databaseProfile.teachingArchiveSchemaIndexProfile, "hot_write");
    assert.equal(report.conversationBenchmarkRuntimeProfile.executor, "WSL_GO");
    assert.equal(report.conversationBenchmarkRuntimeProfile.wslHostAlias, "172.28.160.1");
    assert.equal(report.conversationBenchmarkRuntimeProfile.wslWorkspace, "/mnt/c/workspace");
    assert.equal(report.identityBenchmarkRuntimeProfile.executor, "DOCKER_GO");
    assert.equal(report.identityBenchmarkRuntimeProfile.dockerImage, "golang:1.26-alpine");
    assert.equal(report.identityBenchmarkRuntimeProfile.dockerHostAlias, "host.docker.internal");
    assert.equal(report.teachingBenchmarkRuntimeProfile.executor, "DOCKER_GO");
    assert.equal(report.teachingBenchmarkRuntimeProfile.dockerHostAlias, "host.docker.internal");
    const identity = report.steps[0].workloads.find((workload) => workload.name === "identity_http");
    assert.equal(identity.summary.dominantPhase, "revokeCycle");
    assert.equal(identity.summary.dominantPhaseP99Ms, 88);
    assert.equal(identity.summary.phases.passwordLogin.p99Ms, 35);
    assert.deepEqual(identity.summary.phases.passwordLogin.sessionOperations.saveSession, {
      count: 40,
      totalElapsedMs: 520,
      averageElapsedMs: 13,
    });
    assert.equal(identity.summary.phases.passwordLogin.slowestSessionOperation, "saveSession");
    assert.equal(identity.summary.phases.revokeCycle.slowestStep, "revoke");
    assert.equal(identity.summary.phases.revokeCycle.slowestStepP99Ms, 55);
    assert.deepEqual(identity.summary.phases.revokeCycle.sessionOperations.revokeOwnSession, {
      count: 40,
      totalElapsedMs: 1040,
      averageElapsedMs: 26,
    });
    assert.deepEqual(identity.summary.phases.revokeCycle.sessionOperations.saveSession, {
      count: 40,
      totalElapsedMs: 720,
      averageElapsedMs: 18,
    });
    assert.equal(identity.summary.phases.revokeCycle.slowestSessionOperation, "revokeOwnSession");
    assert.equal(identity.summary.phases.revokeCycle.slowestSessionOperationAverageElapsedMs, 26);
    const conversation = report.steps[0].workloads.find((workload) => workload.name === "conversation_write");
    assert.equal(conversation.summary.clientServerGapP99Ms, 101);
    assert.equal(conversation.summary.acceptanceMode, "durable-log");
    assert.equal(conversation.summary.commandAppendP99Ms, 6);
    assert.equal(conversation.summary.projectionEnqueueP99Ms, 2);
    assert.equal(conversation.summary.dbBatchWaitP99Ms, 14);
    assert.equal(conversation.summary.benchmarkRuntimeProfile.executor, "WSL_GO");
    assert.equal(conversation.summary.runtimeDiagnostics.after.totalAcceptedConns, 240);
    assert.equal(conversation.summary.commandLogDiagnostics.after.projectionSucceeded, 405);
    assert.equal(conversation.summary.commandLogDiagnostics.after.queueDepth, 15);
  });

  it("blocks a required production target when the target step runs below 10k", () => {
    const options = {
      ...defaults,
      scaleProfile: "production10k",
      steps: "target-10k:80:160:320:640:80:160:10000",
      requireTargetReadWriteRps: "true",
    };
    const steps = buildScaleUpSteps(options);
    const report = buildSystemSustainedMixedWorkloadScaleUpReport({
      options,
      steps,
      stepReports: [
        { step: steps[0], report: sustainedReport(steps[0].options, { readWriteRps: 9200 }) },
      ],
      startedAt: "2026-06-01T00:00:00.000Z",
      endedAt: "2026-06-01T00:00:01.000Z",
    });

    assert.equal(report.status, "FAILED");
    assert.equal(report.throughputTarget.status, "ATTEMPTED_NOT_MET");
    assert.equal(report.throughputTarget.required, true);
    assert.equal(report.throughputTarget.attempted, true);
    assert.equal(report.throughputTarget.met, false);
    assert.equal(report.throughputTarget.pressure.status, "PASSED");
    assert.equal(report.throughputTarget.shortfallRps, 800);
    assert.match(formatSystemSustainedMixedWorkloadScaleUp(report), /Target read\/write RPS: 10000 ATTEMPTED_NOT_MET/u);
  });

  it("passes a required production target only when measured read/write RPS reaches 10k", () => {
    const options = {
      ...defaults,
      scaleProfile: "production10k",
      steps: "target-10k:80:160:320:640:80:160:10000",
      requireTargetReadWriteRps: "true",
    };
    const steps = buildScaleUpSteps(options);
    const report = buildSystemSustainedMixedWorkloadScaleUpReport({
      options,
      steps,
      stepReports: [
        { step: steps[0], report: sustainedReport(steps[0].options, { readWriteRps: 12000 }) },
      ],
      startedAt: "2026-06-01T00:00:00.000Z",
      endedAt: "2026-06-01T00:00:01.000Z",
    });

    assert.equal(report.status, "PASSED");
    assert.equal(report.throughputTarget.status, "MET");
    assert.equal(report.throughputTarget.met, true);
    assert.equal(report.throughputTarget.pressure.status, "PASSED");
    assert.equal(report.throughputTarget.shortfallRps, 0);
  });

  it("does not count under-pressured target evidence as a valid 10k attempt", () => {
    const options = {
      ...defaults,
      scaleProfile: "production10k",
      steps: "target-10k:2:4:4:8:2:4:10000",
      requireTargetReadWriteRps: "true",
    };
    const steps = buildScaleUpSteps(options);
    const report = buildSystemSustainedMixedWorkloadScaleUpReport({
      options,
      steps,
      stepReports: [
        { step: steps[0], report: sustainedReport(steps[0].options, { readWriteRps: 12000 }) },
      ],
      startedAt: "2026-06-01T00:00:00.000Z",
      endedAt: "2026-06-01T00:00:01.000Z",
    });

    assert.equal(report.status, "FAILED");
    assert.equal(report.throughputTarget.status, "INVALID_PRESSURE");
    assert.equal(report.throughputTarget.attempted, false);
    assert.equal(report.throughputTarget.met, false);
    assert.equal(report.throughputTarget.highestPassedReadWriteRps, null);
    assert.equal(report.throughputTarget.pressure.invalidStepNames[0], "target-10k");
    assert.equal(
      report.throughputTarget.pressure.findings.find((finding) =>
        finding.id === "target_pressure.identity_concurrency_floor"
      ).passed,
      false,
    );
    assert.match(formatSystemSustainedMixedWorkloadScaleUp(report), /Target read\/write RPS: 10000 INVALID_PRESSURE/u);
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
