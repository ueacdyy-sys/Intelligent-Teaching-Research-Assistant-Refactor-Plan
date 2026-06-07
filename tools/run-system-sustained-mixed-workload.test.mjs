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
      "--identity-dsn",
      "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable",
      "--conversation-dsn",
      "postgres://app_user:ueacd@127.0.0.1:16433/intelligent_teaching_assistant?sslmode=disable",
      "--teaching-dsn",
      "postgres://app_user:ueacd@127.0.0.1:16434/intelligent_teaching_assistant?sslmode=disable",
      "--teaching-concurrency",
      "6",
      "--teaching-gateway-count",
      "3",
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
      "--identity-benchmark-docker-image",
      "golang:1.26-alpine",
      "--identity-benchmark-docker-host",
      "host.docker.internal",
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
      "64",
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

    assert.equal(parsed.samplePrefix, "reports/custom-sustained");
    assert.equal(parsed.samples, "3");
    assert.equal(parsed.sampleIntervalMs, "25");
    assert.equal(parsed.identityDsn, "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable");
    assert.equal(parsed.conversationDsn, "postgres://app_user:ueacd@127.0.0.1:16433/intelligent_teaching_assistant?sslmode=disable");
    assert.equal(parsed.teachingDsn, "postgres://app_user:ueacd@127.0.0.1:16434/intelligent_teaching_assistant?sslmode=disable");
    assert.equal(parsed.teachingConcurrency, "6");
    assert.equal(parsed.teachingGatewayCount, "3");
    assert.equal(parsed.conversationBenchmarkRuntime, "wsl");
    assert.equal(parsed.conversationWriteBatchWorkers, "2");
    assert.equal(parsed.conversationWriteBatchMode, "copy");
    assert.equal(parsed.conversationBenchmarkWslHost, "172.28.160.1");
    assert.equal(parsed.conversationBenchmarkWslWorkspace, "/mnt/c/workspace");
    assert.equal(parsed.identityBenchmarkRuntime, "docker");
    assert.equal(parsed.identityBenchmarkDockerImage, "golang:1.26-alpine");
    assert.equal(parsed.identityBenchmarkDockerHost, "host.docker.internal");
    assert.equal(parsed.teachingBenchmarkRuntime, "docker");
    assert.equal(parsed.teachingBenchmarkDockerHost, "host.docker.internal");
    assert.equal(parsed.teachingDbMinConns, "12");
    assert.equal(parsed.teachingDbPrewarmConns, "12");
    assert.equal(parsed.teachingMaxConnsPerHost, "128");
    assert.equal(parsed.teachingWarmConnectionsPerHost, "96");
    assert.equal(parsed.teachingClientTrace, "true");
    assert.equal(parsed.teachingArchiveCreateBatchSize, "64");
    assert.equal(parsed.teachingArchiveCreateBatchDelayMs, "1");
    assert.equal(parsed.teachingArchiveCreateBatchWorkers, "2");
    assert.equal(parsed.teachingArchiveCreateBatchMode, "copy");
    assert.equal(parsed.teachingQuizSubmissionBatchSize, "16");
    assert.equal(parsed.teachingQuizSubmissionBatchDelayMs, "0");
    assert.equal(parsed.teachingQuizSubmissionBatchWorkers, "8");
    assert.equal(parsed.teachingArchiveListCacheTtlMs, "250");
    assert.equal(parsed.teachingArchiveListCacheMaxEntries, "4096");
    assert.equal(parsed.teachingArchiveSchemaIndexProfile, "hot_write");
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

  it("builds isolated five-slice sample options", () => {
    const identityDsn = "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable";
    const conversationDsn = "postgres://app_user:ueacd@127.0.0.1:16433/intelligent_teaching_assistant?sslmode=disable";
    const teachingDsn = "postgres://app_user:ueacd@127.0.0.1:16434/intelligent_teaching_assistant?sslmode=disable";
    const samples = buildSampleRuns({
      ...defaults,
      samples: "2",
      samplePrefix: "reports/sustained",
      identityBaseUrl: "http://127.0.0.1:19000",
      conversationBaseUrl: "http://127.0.0.1:19100",
      teachingBaseUrl: "http://127.0.0.1:19200",
      identityDsn,
      conversationDsn,
      teachingDsn,
      teachingGatewayCount: "3",
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
    });

    assert.deepEqual(samples.map((sample) => sample.name), ["sample-1", "sample-2"]);
    assert.equal(samples[0].options.out, "reports/sustained.1.json");
    assert.equal(samples[0].options.teachingOut, "reports/sustained.1.teaching-archive.json");
    assert.equal(samples[1].options.knowledgeOut, "reports/sustained.2.knowledge-retrieval.json");
    assert.equal(samples[0].options.manageDocker, "false");
    assert.equal(samples[0].options.identityBaseUrl, "http://127.0.0.1:19000");
    assert.equal(samples[0].options.conversationBaseUrl, "http://127.0.0.1:19100");
    assert.equal(samples[0].options.teachingBaseUrl, "http://127.0.0.1:19200");
    assert.equal(samples[0].options.identityDsn, identityDsn);
    assert.equal(samples[0].options.conversationDsn, conversationDsn);
    assert.equal(samples[0].options.teachingDsn, teachingDsn);
    assert.equal(samples[0].options.teachingGatewayCount, "3");
    assert.equal(samples[0].options.maxConnsPerHost, "70");
    assert.equal(samples[0].options.identityMaxConnsPerHost, "150");
    assert.equal(samples[0].options.identityIngressProxy, "true");
    assert.equal(samples[0].options.identityIngressPort, "19080");
    assert.equal(samples[0].options.identityIngressCount, "16");
    assert.equal(samples[0].options.identityIngressMaxConnsPerHost, "40");
    assert.equal(samples[0].options.identitySessionDbMinConns, "6");
    assert.equal(samples[0].options.identitySessionDbPrewarmConns, "6");
    assert.equal(samples[0].options.identitySessionDbReadMaxConns, "24");
    assert.equal(samples[0].options.identitySessionDbReadMinConns, "12");
    assert.equal(samples[0].options.identitySessionDbReadPrewarmConns, "12");
    assert.equal(samples[0].options.identitySessionDbSessionTablePersistence, "unlogged");
    assert.equal(samples[0].options.identitySessionDbWriteConcurrency, "10");
    assert.equal(samples[0].options.identityWarmupOperations, "80");
    assert.equal(samples[0].options.conversationBenchmarkRuntime, "wsl");
    assert.equal(samples[0].options.conversationWriteBatchWorkers, "2");
    assert.equal(samples[0].options.conversationWriteBatchMode, "copy");
    assert.equal(samples[0].options.conversationBenchmarkWslHost, "172.28.160.1");
    assert.equal(samples[0].options.conversationBenchmarkWslWorkspace, "/mnt/c/workspace");
    assert.equal(samples[0].options.identityBenchmarkRuntime, "docker");
    assert.equal(samples[0].options.identityBenchmarkDockerImage, "golang:1.26-alpine");
    assert.equal(samples[0].options.identityBenchmarkDockerHost, "host.docker.internal");
    assert.equal(samples[0].options.teachingBenchmarkRuntime, "docker");
    assert.equal(samples[0].options.teachingBenchmarkDockerHost, "host.docker.internal");
    assert.equal(samples[0].options.teachingDbMinConns, "12");
    assert.equal(samples[0].options.teachingDbPrewarmConns, "12");
    assert.equal(samples[0].options.teachingMaxConnsPerHost, "128");
    assert.equal(samples[0].options.teachingWarmConnectionsPerHost, "96");
    assert.equal(samples[0].options.teachingClientTrace, "true");
    assert.equal(samples[0].options.teachingArchiveCreateBatchSize, "64");
    assert.equal(samples[0].options.teachingArchiveCreateBatchDelayMs, "1");
    assert.equal(samples[0].options.teachingArchiveCreateBatchWorkers, "2");
    assert.equal(samples[0].options.teachingArchiveCreateBatchMode, "copy");
    assert.equal(samples[0].options.teachingQuizSubmissionBatchSize, "16");
    assert.equal(samples[0].options.teachingQuizSubmissionBatchDelayMs, "0");
    assert.equal(samples[0].options.teachingQuizSubmissionBatchWorkers, "8");
    assert.equal(samples[0].options.teachingArchiveListCacheTtlMs, "250");
    assert.equal(samples[0].options.teachingArchiveListCacheMaxEntries, "4096");
    assert.equal(samples[0].options.teachingArchiveSchemaIndexProfile, "hot_write");
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
    assert.equal(report.samples[0].readWriteRps, 370);
    assert.equal(report.samples[0].aggregateRps, 370);
    assert.deepEqual(report.samples[0].readWriteWorkloads, [
      { name: "identity_http", rps: 90 },
      { name: "conversation_write", rps: 210 },
      { name: "teaching_archive", rps: 70 },
    ]);
    assert.equal(report.summary.readWriteRps, 370);
    assert.equal(report.summary.aggregateReadWriteRps, 370);
    assert.equal(report.summary.minPassedReadWriteRps, 370);
    assert.equal(report.summary.maxPassedReadWriteRps, 370);
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
      teachingArchiveSchemaIndexProfile: "full",
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
    assert.equal(report.concurrencyProfile.teachingGatewayCount, 3);
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
    assert.equal(report.databaseProfile.teachingArchiveSchemaIndexProfile, "full");
    assert.equal(report.conversationBenchmarkRuntimeProfile.executor, "WSL_GO");
    assert.equal(report.conversationBenchmarkRuntimeProfile.wslHostAlias, "172.28.160.1");
    assert.equal(report.conversationBenchmarkRuntimeProfile.wslWorkspace, "/mnt/c/workspace");
    assert.equal(report.identityBenchmarkRuntimeProfile.executor, "DOCKER_GO");
    assert.equal(report.identityBenchmarkRuntimeProfile.dockerImage, "golang:1.26-alpine");
    assert.equal(report.identityBenchmarkRuntimeProfile.dockerHostAlias, "host.docker.internal");
    assert.equal(report.teachingBenchmarkRuntimeProfile.executor, "DOCKER_GO");
    assert.equal(report.teachingBenchmarkRuntimeProfile.dockerHostAlias, "host.docker.internal");
    const identity = report.samples[0].workloads.find((workload) => workload.name === "identity_http");
    assert.equal(identity.summary.dominantPhase, "revokeCycle");
    assert.equal(identity.summary.dominantPhaseP99Ms, 66);
    assert.equal(identity.summary.phases.passwordLogin.p99Ms, 30);
    assert.equal(identity.summary.phases.passwordLogin.slowestSessionOperation, "saveSession");
    assert.equal(identity.summary.phases.passwordLogin.sessionOperations.saveSession.averageElapsedMs, 10);
    assert.equal(identity.summary.phases.revokeCycle.slowestStep, "revoke");
    assert.equal(identity.summary.phases.revokeCycle.slowestSessionOperation, "revokeOwnSession");
    assert.equal(identity.summary.phases.revokeCycle.sessionOperations.revokeOwnSession.averageElapsedMs, 20);
    const conversation = report.samples[0].workloads.find((workload) => workload.name === "conversation_write");
    assert.equal(conversation.summary.clientServerGapP99Ms, 77);
    assert.equal(conversation.summary.acceptanceMode, "durable-log");
    assert.equal(conversation.summary.commandAppendP99Ms, 4);
    assert.equal(conversation.summary.projectionEnqueueP99Ms, 1);
    assert.equal(conversation.summary.dbBatchWaitP99Ms, 12);
    assert.equal(conversation.summary.benchmarkRuntimeProfile.executor, "WSL_GO");
    assert.equal(conversation.summary.runtimeDiagnostics.after.maxCurrentConns, 33);
    assert.equal(conversation.summary.commandLogDiagnostics.after.projectionFailed, 0);
    assert.equal(conversation.summary.commandLogDiagnostics.after.queueDepth, 3);
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
      workload("identity_http", status, errors, maxP99Ms, identitySummary()),
      workload("conversation_write", status, 0, maxP99Ms - 1, conversationSummary()),
      workload("teaching_archive", status, 0, maxP99Ms - 2, { rps: 70 }),
      workload("knowledge_retrieval", "READY", 0, null, { rps: 9999 }),
      workload("ai_worker_admission", "READY", 0, null, { rps: 9999 }),
    ],
  };
}

function workload(name, status, errors, p99Ms, summary = undefined) {
  return {
    name,
    status,
    errors,
    p95Ms: Number.isFinite(p99Ms) ? p99Ms * 0.8 : null,
    p99Ms,
    summary,
  };
}

function identitySummary() {
  return {
    errors: 0,
    rps: 90,
    dominantPhase: "revokeCycle",
    dominantPhaseP99Ms: 66,
    phases: {
      passwordLogin: {
        errors: 0,
        p95Ms: 20,
        p99Ms: 30,
        rps: 110,
        sessionOperations: {
          saveSession: {
            count: 16,
            totalElapsedMs: 160,
            averageElapsedMs: 10,
          },
        },
        slowestSessionOperation: "saveSession",
        slowestSessionOperationAverageElapsedMs: 10,
      },
      revokeCycle: {
        errors: 0,
        p95Ms: 60,
        p99Ms: 66,
        rps: 90,
        slowestStep: "revoke",
        slowestStepP99Ms: 44,
        sessionOperations: {
          revokeOwnSession: {
            count: 16,
            totalElapsedMs: 320,
            averageElapsedMs: 20,
          },
          saveSession: {
            count: 16,
            totalElapsedMs: 240,
            averageElapsedMs: 15,
          },
        },
        slowestSessionOperation: "revokeOwnSession",
        slowestSessionOperationAverageElapsedMs: 20,
      },
    },
  };
}

function conversationSummary() {
  return {
    errors: 0,
    rps: 210,
    clientServerGapP99Ms: 77,
    acceptanceMode: "durable-log",
    commandAppendP99Ms: 4,
    projectionEnqueueP99Ms: 1,
    dbBatchWaitP99Ms: 12,
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
        maxCurrentConns: 33,
      },
    },
    commandLogDiagnostics: {
      after: {
        acceptedCommands: 210,
        projectionEnqueued: 210,
        projectionSucceeded: 207,
        projectionFailed: 0,
        queueDepth: 3,
        maxOldestPendingAgeMs: 5,
      },
    },
  };
}

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ita-sustained-mixed-"));
}

function fixedClock() {
  let tick = 0;
  return () => `2026-06-01T00:00:0${tick++}.000Z`;
}
