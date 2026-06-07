import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  argumentAfter,
  childReportsFor,
  fixedClock,
  makeTempRoot,
  successfulChildCommand,
} from "./run-system-mixed-workload-benchmark-fixtures.test.mjs";
import {
  buildSystemMixedWorkloadReport,
  buildWorkloadCommands,
  defaults,
  formatSystemMixedWorkloadBenchmark,
  parseArgs,
  runSystemMixedWorkloadBenchmark,
} from "./run-system-mixed-workload-benchmark.mjs";

describe("system mixed workload benchmark runner", () => {
  it("parses kebab-case options into the runner profile", () => {
    const parsed = parseArgs([
      "--identity-base-url",
      "http://127.0.0.1:19000",
      "--identity-dsn",
      "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable",
      "--conversation-dsn",
      "postgres://app_user:ueacd@127.0.0.1:16433/intelligent_teaching_assistant?sslmode=disable",
      "--teaching-dsn",
      "postgres://app_user:ueacd@127.0.0.1:16434/intelligent_teaching_assistant?sslmode=disable",
      "--conversation-gateway-count",
      "16",
      "--teaching-gateway-count",
      "4",
      "--conversation-write-batch-size",
      "64",
      "--conversation-write-batch-workers",
      "2",
      "--conversation-write-batch-mode",
      "copy",
      "--conversation-write-acceptance-mode",
      "durable-log",
      "--conversation-command-log-append-batch-size",
      "64",
      "--conversation-command-log-queue-capacity",
      "65536",
      "--conversation-command-log-projection-workers",
      "8",
      "--conversation-command-log-settle-timeout-ms",
      "30000",
      "--conversation-benchmark-runtime",
      "wsl",
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
      "--unknown-option",
      "ignored",
    ]);

    assert.equal(parsed.identityBaseUrl, "http://127.0.0.1:19000");
    assert.equal(parsed.identityDsn, "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable");
    assert.equal(parsed.conversationDsn, "postgres://app_user:ueacd@127.0.0.1:16433/intelligent_teaching_assistant?sslmode=disable");
    assert.equal(parsed.teachingDsn, "postgres://app_user:ueacd@127.0.0.1:16434/intelligent_teaching_assistant?sslmode=disable");
    assert.equal(parsed.conversationGatewayCount, "16");
    assert.equal(parsed.teachingGatewayCount, "4");
    assert.equal(parsed.conversationWriteBatchSize, "64");
    assert.equal(parsed.conversationWriteBatchWorkers, "2");
    assert.equal(parsed.conversationWriteBatchMode, "copy");
    assert.equal(parsed.conversationWriteAcceptanceMode, "durable-log");
    assert.equal(parsed.conversationCommandLogAppendBatchSize, "64");
    assert.equal(parsed.conversationCommandLogQueueCapacity, "65536");
    assert.equal(parsed.conversationCommandLogProjectionWorkers, "8");
    assert.equal(parsed.conversationCommandLogSettleTimeoutMs, "30000");
    assert.equal(parsed.conversationBenchmarkRuntime, "wsl");
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
    assert.equal(parsed.teachingConcurrency, "6");
    assert.equal(parsed.identityIngressProxy, "true");
    assert.equal(parsed.identityIngressCount, "16");
    assert.equal(parsed.identityMaxConnsPerHost, "150");
    assert.equal(parsed.identitySessionDbSessionTablePersistence, "unlogged");
    assert.equal(parsed.identitySessionDbReadMaxConns, "24");
    assert.equal(parsed.identitySessionDbReadMinConns, "12");
    assert.equal(parsed.identitySessionDbReadPrewarmConns, "12");
    assert.equal(parsed.identitySessionDbWriteConcurrency, "10");
    assert.equal(parsed.identityWarmupOperations, "80");
    assert.equal(parsed.profile, defaults.profile);
    assert.equal(Object.hasOwn(parsed, "unknownOption"), false);
  });

  it("builds the five root-module workload commands with the configured ports and outputs", () => {
    const identityDsn = "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable";
    const conversationDsn = "postgres://app_user:ueacd@127.0.0.1:16433/intelligent_teaching_assistant?sslmode=disable";
    const teachingDsn = "postgres://app_user:ueacd@127.0.0.1:16434/intelligent_teaching_assistant?sslmode=disable";
    const commands = buildWorkloadCommands({
      ...defaults,
      identityBaseUrl: "http://127.0.0.1:19000",
      conversationBaseUrl: "http://127.0.0.1:19100",
      teachingBaseUrl: "http://127.0.0.1:19200",
      identityDsn,
      conversationDsn,
      teachingDsn,
      identityOut: "reports/identity.json",
      conversationOut: "reports/conversation.json",
      teachingOut: "reports/teaching.json",
      teachingGatewayCount: "3",
      knowledgeOut: "reports/knowledge.json",
      aiAdmissionOut: "reports/ai.json",
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
      conversationWriteAcceptanceMode: "durable-log",
      conversationCommandLogAppendBatchSize: "64",
      conversationCommandLogQueueCapacity: "65536",
      conversationCommandLogProjectionWorkers: "8",
      conversationCommandLogSync: "true",
      conversationCommandLogSettleTimeoutMs: "30000",
      conversationClientTrace: "true",
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
      pgbouncerDiagnostics: "true",
      postgresDiagnostics: "true",
      postgresDiagnosticsRelations: "teaching_archive_items",
    });

    assert.deepEqual(commands.map((command) => command.name), [
      "identity_http",
      "conversation_write",
      "teaching_archive",
      "knowledge_retrieval",
      "ai_worker_admission",
    ]);
    assert.equal(argumentAfter(commands[0].args, "--base-url"), "http://127.0.0.1:19000");
    assert.equal(argumentAfter(commands[0].args, "--dsn"), identityDsn);
    assert.equal(argumentAfter(commands[0].args, "--max-conns-per-host"), "150");
    assert.equal(argumentAfter(commands[0].args, "--warm-connections-per-host"), "150");
    assert.equal(argumentAfter(commands[0].args, "--ingress-proxy"), "true");
    assert.equal(argumentAfter(commands[0].args, "--ingress-port"), "19080");
    assert.equal(argumentAfter(commands[0].args, "--ingress-count"), "16");
    assert.equal(argumentAfter(commands[0].args, "--ingress-max-conns-per-host"), "40");
    assert.equal(argumentAfter(commands[0].args, "--ingress-warm-connections-per-host"), "16");
    assert.equal(argumentAfter(commands[0].args, "--session-db-min-conns"), "6");
    assert.equal(argumentAfter(commands[0].args, "--session-db-prewarm-conns"), "6");
    assert.equal(argumentAfter(commands[0].args, "--session-db-read-max-conns"), "24");
    assert.equal(argumentAfter(commands[0].args, "--session-db-read-min-conns"), "12");
    assert.equal(argumentAfter(commands[0].args, "--session-db-read-prewarm-conns"), "12");
    assert.equal(argumentAfter(commands[0].args, "--session-db-session-table-persistence"), "unlogged");
    assert.equal(argumentAfter(commands[0].args, "--session-db-write-concurrency"), "10");
    assert.equal(argumentAfter(commands[0].args, "--warmup-operations"), "80");
    assert.equal(argumentAfter(commands[0].args, "--benchmark-runtime"), "docker");
    assert.equal(argumentAfter(commands[0].args, "--benchmark-docker-image"), "golang:1.26-alpine");
    assert.equal(argumentAfter(commands[0].args, "--benchmark-docker-host"), "host.docker.internal");
    assert.equal(argumentAfter(commands[1].args, "--base-url"), "http://127.0.0.1:19100");
    assert.equal(argumentAfter(commands[1].args, "--dsn"), conversationDsn);
    assert.equal(argumentAfter(commands[1].args, "--agent-api-key"), "ueacd");
    assert.equal(argumentAfter(commands[1].args, "--benchmark-runtime"), "wsl");
    assert.equal(argumentAfter(commands[1].args, "--benchmark-wsl-host"), "172.28.160.1");
    assert.equal(argumentAfter(commands[1].args, "--benchmark-wsl-workspace"), "/mnt/c/workspace");
    assert.equal(argumentAfter(commands[1].args, "--max-conns-per-host"), "70");
    assert.equal(argumentAfter(commands[1].args, "--warm-connections-per-host"), "9");
    assert.equal(argumentAfter(commands[1].args, "--write-batch-workers"), "2");
    assert.equal(argumentAfter(commands[1].args, "--write-acceptance-mode"), "durable-log");
    assert.equal(argumentAfter(commands[1].args, "--command-log-append-batch-size"), "64");
    assert.equal(argumentAfter(commands[1].args, "--command-log-queue-capacity"), "65536");
    assert.equal(argumentAfter(commands[1].args, "--command-log-projection-workers"), "8");
    assert.equal(argumentAfter(commands[1].args, "--command-log-sync"), "true");
    assert.equal(argumentAfter(commands[1].args, "--command-log-settle-timeout-ms"), "30000");
    assert.equal(argumentAfter(commands[1].args, "--client-trace"), "true");
    assert.equal(argumentAfter(commands[2].args, "--base-url"), "http://127.0.0.1:19200");
    assert.equal(argumentAfter(commands[2].args, "--dsn"), teachingDsn);
    assert.equal(argumentAfter(commands[2].args, "--gateway-count"), "3");
    assert.equal(argumentAfter(commands[2].args, "--db-min-conns"), "12");
    assert.equal(argumentAfter(commands[2].args, "--db-prewarm-conns"), "12");
    assert.equal(argumentAfter(commands[2].args, "--agent-api-key"), "ueacd");
    assert.equal(argumentAfter(commands[2].args, "--benchmark-runtime"), "docker");
    assert.equal(argumentAfter(commands[2].args, "--benchmark-docker-image"), "golang:1.26-alpine");
    assert.equal(argumentAfter(commands[2].args, "--benchmark-docker-host"), "host.docker.internal");
    assert.equal(argumentAfter(commands[2].args, "--max-conns-per-host"), "128");
    assert.equal(argumentAfter(commands[2].args, "--warm-connections-per-host"), "96");
    assert.equal(argumentAfter(commands[2].args, "--client-trace"), "true");
    assert.equal(argumentAfter(commands[2].args, "--archive-create-batch-size"), "64");
    assert.equal(argumentAfter(commands[2].args, "--archive-create-batch-delay-ms"), "1");
    assert.equal(argumentAfter(commands[2].args, "--archive-create-batch-workers"), "2");
    assert.equal(argumentAfter(commands[2].args, "--archive-create-batch-mode"), "copy");
    assert.equal(argumentAfter(commands[2].args, "--quiz-submission-batch-size"), "16");
    assert.equal(argumentAfter(commands[2].args, "--quiz-submission-batch-delay-ms"), "0");
    assert.equal(argumentAfter(commands[2].args, "--quiz-submission-batch-workers"), "8");
    assert.equal(argumentAfter(commands[2].args, "--archive-list-cache-ttl-ms"), "250");
    assert.equal(argumentAfter(commands[2].args, "--archive-list-cache-max-entries"), "4096");
    assert.equal(argumentAfter(commands[2].args, "--archive-schema-index-profile"), "hot_write");
    assert.equal(argumentAfter(commands[2].args, "--pgbouncer-diagnostics"), "true");
    assert.equal(argumentAfter(commands[2].args, "--postgres-diagnostics"), "true");
    assert.equal(argumentAfter(commands[2].args, "--postgres-diagnostics-relations"), "teaching_archive_items");
    assert.equal(commands[3].sourceReportPath, "reports/knowledge.json");
    assert.equal(commands[4].sourceReportPath, "reports/ai.json");
  });

  it("summarizes PASSED and READY child reports as a passed mixed workload smoke", async () => {
    const root = makeTempRoot();
    const report = await runSystemMixedWorkloadBenchmark(
      {
        ...defaults,
        out: "reports/mixed.json",
      },
      {
        root,
        runCommand: successfulChildCommand,
        now: fixedClock(),
      },
    );

    assert.equal(report.status, "PASSED");
    assert.equal(report.workloadType, "MIXED_WORKLOAD");
    assert.equal(report.benchmarkKind, "system_mixed_workload");
    assert.equal(report.summary.passedWorkloads, 5);
    assert.equal(report.summary.totalErrors, 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, "reports/mixed.json"), "utf8")).status, "PASSED");
    assert.match(formatSystemMixedWorkloadBenchmark(report), /System mixed workload benchmark: PASSED/u);
  });

  it("masks secrets and database URLs in command and output evidence", async () => {
    const root = makeTempRoot();
    const report = await runSystemMixedWorkloadBenchmark(
      {
        ...defaults,
        out: "reports/mixed.json",
      },
      {
        root,
        runCommand: successfulChildCommand,
        now: fixedClock(),
      },
    );
    const reportText = JSON.stringify(report);

    assert.doesNotMatch(reportText, /ueacd/u);
    assert.doesNotMatch(reportText, /postgres:\/\/app_user/u);
    assert.equal(report.persistenceProfile.mode, "shared");
    assert.equal(report.persistenceProfile.domains.identity.password, "[masked]");
    assert.match(report.sourceCommands.find((command) => command.name === "conversation_write").command, /--agent-api-key \*\*\*/u);
    assert.match(report.workloads[0].outputTail, /\[database-url\]/u);
  });

  it("marks the mixed workload failed when a child command fails", async () => {
    const root = makeTempRoot();
    const report = await runSystemMixedWorkloadBenchmark(
      {
        ...defaults,
        out: "reports/mixed.json",
      },
      {
        root,
        runCommand: async (command, args, commandRoot) => {
          if (args[0].includes("run-conversation-write-benchmark")) {
            return {
              command,
              args,
              exitCode: 1,
              elapsedMs: 17,
              outputTail: "conversation failed with key ueacd",
            };
          }
          return successfulChildCommand(command, args, commandRoot);
        },
        now: fixedClock(),
      },
    );

    const conversation = report.workloads.find((workload) => workload.name === "conversation_write");
    assert.equal(report.status, "FAILED");
    assert.equal(conversation.status, "FAILED");
    assert.equal(conversation.errors, 1);
    assert.match(conversation.outputTail, /\*\*\*/u);
  });

  it("rejects overlapping identity and conversation gateway port ranges", async () => {
    const root = makeTempRoot();

    await assert.rejects(
      () => runSystemMixedWorkloadBenchmark(
        {
          ...defaults,
          identityBaseUrl: "http://127.0.0.1:18400",
          identityGatewayCount: "2",
          conversationBaseUrl: "http://127.0.0.1:18401",
          conversationGatewayCount: "1",
        },
        { root, runCommand: successfulChildCommand },
      ),
      /port overlap: 18401/u,
    );
  });

  it("rejects overlapping teaching archive gateway ports", async () => {
    const root = makeTempRoot();

    await assert.rejects(
      () => runSystemMixedWorkloadBenchmark(
        {
          ...defaults,
          conversationBaseUrl: "http://127.0.0.1:18400",
          conversationGatewayCount: "2",
          teachingBaseUrl: "http://127.0.0.1:18401",
        },
        { root, runCommand: successfulChildCommand },
      ),
      /port overlap: 18401/u,
    );
  });

  it("rejects overlapping identity ingress and downstream gateway ports", async () => {
    const root = makeTempRoot();

    await assert.rejects(
      () => runSystemMixedWorkloadBenchmark(
        {
          ...defaults,
          identityBaseUrl: "http://127.0.0.1:18300",
          identityGatewayCount: "2",
          identityIngressProxy: "true",
          identityIngressPort: "18400",
          identityIngressCount: "2",
          conversationBaseUrl: "http://127.0.0.1:18401",
          conversationGatewayCount: "1",
        },
        { root, runCommand: successfulChildCommand },
      ),
      /port overlap: 18401/u,
    );
  });

  it("does not execute workloads when managed Docker setup fails, but still records cleanup", async () => {
    const root = makeTempRoot();
    let workloadRuns = 0;

    const report = await runSystemMixedWorkloadBenchmark(
      {
        ...defaults,
        manageDocker: "true",
        dockerCleanup: "down",
        out: "reports/mixed.json",
      },
      {
        root,
        runCommand: async (...args) => {
          workloadRuns += 1;
          return successfulChildCommand(...args);
        },
        runSync: (_command, args) => ({
          command: "npm",
          args,
          exitCode: args.includes("perf:identity-session:up") ? 1 : 0,
          elapsedMs: 3,
          outputTail: "docker setup output",
        }),
        now: fixedClock(),
      },
    );

    assert.equal(report.status, "FAILED");
    assert.equal(workloadRuns, 0);
    assert.equal(report.setup[0].phase, "setup");
    assert.equal(report.cleanup[0].phase, "cleanup");
    assert.match(report.runnerErrors.join("\n"), /managed Docker setup failed/u);
    assert.equal(report.summary.orchestrationErrors, 2);
  });

  it("builds a direct report object from supplied child reports", () => {
    const options = {
      ...defaults,
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
    const commands = buildWorkloadCommands(options);
    const results = commands.map((command) => ({
      name: command.name,
      exitCode: 0,
      elapsedMs: 5,
      outputTail: "ok",
    }));
    const childReports = childReportsFor(commands);

    const report = buildSystemMixedWorkloadReport({
      options,
      commands,
      results,
      childReports,
      startedAt: "2026-06-01T00:00:00.000Z",
      endedAt: "2026-06-01T00:00:01.000Z",
    });

    assert.equal(report.status, "PASSED");
    assert.equal(report.workloadType, "MIXED_WORKLOAD");
    assert.equal(report.summary.maxP99Ms, 66);
    assert.equal(report.workloads.find((workload) => workload.name === "knowledge_retrieval").status, "READY");
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
    const identity = report.workloads.find((workload) => workload.name === "identity_http");
    assert.equal(identity.summary.dominantPhase, "revokeCycle");
    assert.equal(identity.summary.dominantPhaseP99Ms, 66);
    assert.deepEqual(identity.summary.phases.passwordLogin, {
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
    });
    assert.deepEqual(identity.summary.phases.revokeCycle, {
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
    });
    const conversation = report.workloads.find((workload) => workload.name === "conversation_write");
    assert.equal(conversation.summary.serverTimingP99Ms, 21);
    assert.equal(conversation.summary.clientServerGapP99Ms, 44);
    assert.equal(conversation.summary.acceptanceMode, "durable-log");
    assert.equal(conversation.summary.commandAppendP99Ms, 4.4);
    assert.equal(conversation.summary.projectionEnqueueP99Ms, 0.6);
    assert.equal(conversation.summary.dbAcquireP99Ms, 0.3);
    assert.equal(conversation.summary.dbBatchWaitP99Ms, 12.5);
    assert.equal(conversation.summary.dbInsertP99Ms, 15.2);
    assert.deepEqual(conversation.summary.gatewayExitCode, [null, null]);
    assert.deepEqual(conversation.summary.gatewaySignal, [null, null]);
    assert.equal(conversation.summary.benchmarkRuntimeProfile.executor, "WSL_GO");
    assert.deepEqual(conversation.summary.runtimeDiagnostics.after, {
      gatewayCount: 2,
      okGateways: 2,
      unavailableGateways: 0,
      maxCurrentConns: 276,
      totalAcceptedConns: 546,
      totalEmptyAcquireCount: 0,
      totalAcquireWaitTimeMs: 0,
    });
    assert.deepEqual(conversation.summary.databaseDiagnostics.after, {
      gatewayCount: 2,
      okGateways: 2,
      unavailableGateways: 0,
      maxCurrentConns: null,
      totalAcceptedConns: 0,
      totalEmptyAcquireCount: 3,
      totalAcquireWaitTimeMs: 17,
    });
    assert.deepEqual(conversation.summary.commandLogDiagnostics.after, {
      gatewayCount: 2,
      okGateways: 2,
      unavailableGateways: 0,
      acceptedCommands: 1024,
      appendErrors: 0,
      projectionEnqueued: 1024,
      projectionSucceeded: 1006,
      projectionFailed: 0,
      queueDepth: 18,
      maxOldestPendingAgeMs: 8,
    });
    const teaching = report.workloads.find((workload) => workload.name === "teaching_archive");
    assert.equal(teaching.summary.serverTimingP99Ms, 31);
    assert.equal(teaching.summary.handlerP99Ms, 36);
    assert.equal(teaching.summary.preUsecaseP99Ms, 5);
    assert.equal(teaching.summary.appP99Ms, 31);
    assert.equal(teaching.summary.dbBatchWaitP99Ms, 7);
    assert.equal(teaching.summary.dbInsertP99Ms, 24);
    assert.equal(teaching.summary.responseEncodeP99Ms, 2);
    assert.deepEqual(teaching.summary.gatewayWriteProfile, {
      archiveCreateBatchingEnabled: true,
      archiveCreateBatchSize: 64,
      archiveCreateBatchDelayMs: 1,
      archiveCreateBatchWorkers: 2,
      archiveCreateBatchMode: "copy",
      quizSubmissionBatchingEnabled: true,
      quizSubmissionBatchSize: 16,
      quizSubmissionBatchDelayMs: 0,
      quizSubmissionBatchWorkers: 8,
    });
    assert.equal(teaching.summary.clientHandlerGapP99Ms, 14);
    assert.equal(teaching.summary.benchmarkRuntimeProfile.executor, "DOCKER_GO");
    assert.deepEqual(teaching.summary.databaseDiagnostics.after, {
      gatewayCount: 2,
      okGateways: 2,
      unavailableGateways: 0,
      maxTotalConns: 12,
      maxAcquiredConns: 8,
      maxIdleConns: 6,
      totalEmptyAcquireCount: 3,
      totalEmptyAcquireWaitTimeMs: 17,
      totalNewConnsCount: 24,
    });
  });

  it("counts failed teaching reports without phase metrics as errors", () => {
    const options = { ...defaults };
    const commands = buildWorkloadCommands(options);
    const results = commands.map((command) => ({
      name: command.name,
      exitCode: 0,
      elapsedMs: 5,
      outputTail: "ok",
    }));
    const childReports = childReportsFor(commands);
    childReports.teaching_archive.value = {
      status: "FAILED",
      summary: { totalErrors: 1 },
      phases: {},
    };

    const report = buildSystemMixedWorkloadReport({
      options,
      commands,
      results,
      childReports,
      startedAt: "2026-06-01T00:00:00.000Z",
      endedAt: "2026-06-01T00:00:01.000Z",
    });
    const teaching = report.workloads.find((workload) => workload.name === "teaching_archive");

    assert.equal(report.status, "FAILED");
    assert.equal(report.summary.totalErrors, 1);
    assert.equal(teaching.errors, 1);
  });
});
