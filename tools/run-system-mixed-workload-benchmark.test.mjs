import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

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
      "--conversation-gateway-count",
      "16",
      "--conversation-write-batch-size",
      "64",
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
      "--unknown-option",
      "ignored",
    ]);

    assert.equal(parsed.identityBaseUrl, "http://127.0.0.1:19000");
    assert.equal(parsed.conversationGatewayCount, "16");
    assert.equal(parsed.conversationWriteBatchSize, "64");
    assert.equal(parsed.conversationBenchmarkRuntime, "wsl");
    assert.equal(parsed.conversationBenchmarkWslHost, "172.28.160.1");
    assert.equal(parsed.conversationBenchmarkWslWorkspace, "/mnt/c/workspace");
    assert.equal(parsed.identityBenchmarkRuntime, "docker");
    assert.equal(parsed.identityBenchmarkDockerImage, "golang:1.26-alpine");
    assert.equal(parsed.identityBenchmarkDockerHost, "host.docker.internal");
    assert.equal(parsed.teachingConcurrency, "6");
    assert.equal(parsed.identityIngressProxy, "true");
    assert.equal(parsed.identityIngressCount, "16");
    assert.equal(parsed.identityMaxConnsPerHost, "150");
    assert.equal(parsed.identitySessionDbSessionTablePersistence, "unlogged");
    assert.equal(parsed.identitySessionDbWriteConcurrency, "10");
    assert.equal(parsed.profile, defaults.profile);
    assert.equal(Object.hasOwn(parsed, "unknownOption"), false);
  });

  it("builds the five root-module workload commands with the configured ports and outputs", () => {
    const commands = buildWorkloadCommands({
      ...defaults,
      identityBaseUrl: "http://127.0.0.1:19000",
      conversationBaseUrl: "http://127.0.0.1:19100",
      teachingBaseUrl: "http://127.0.0.1:19200",
      identityOut: "reports/identity.json",
      conversationOut: "reports/conversation.json",
      teachingOut: "reports/teaching.json",
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
      identitySessionDbSessionTablePersistence: "unlogged",
      identitySessionDbWriteConcurrency: "10",
      conversationBenchmarkRuntime: "wsl",
      conversationBenchmarkWslHost: "172.28.160.1",
      conversationBenchmarkWslWorkspace: "/mnt/c/workspace",
      identityBenchmarkRuntime: "docker",
      identityBenchmarkDockerImage: "golang:1.26-alpine",
      identityBenchmarkDockerHost: "host.docker.internal",
    });

    assert.deepEqual(commands.map((command) => command.name), [
      "identity_http",
      "conversation_write",
      "teaching_archive",
      "knowledge_retrieval",
      "ai_worker_admission",
    ]);
    assert.equal(argumentAfter(commands[0].args, "--base-url"), "http://127.0.0.1:19000");
    assert.equal(argumentAfter(commands[0].args, "--max-conns-per-host"), "150");
    assert.equal(argumentAfter(commands[0].args, "--warm-connections-per-host"), "150");
    assert.equal(argumentAfter(commands[0].args, "--ingress-proxy"), "true");
    assert.equal(argumentAfter(commands[0].args, "--ingress-port"), "19080");
    assert.equal(argumentAfter(commands[0].args, "--ingress-count"), "16");
    assert.equal(argumentAfter(commands[0].args, "--ingress-max-conns-per-host"), "40");
    assert.equal(argumentAfter(commands[0].args, "--ingress-warm-connections-per-host"), "16");
    assert.equal(argumentAfter(commands[0].args, "--session-db-session-table-persistence"), "unlogged");
    assert.equal(argumentAfter(commands[0].args, "--session-db-write-concurrency"), "10");
    assert.equal(argumentAfter(commands[0].args, "--benchmark-runtime"), "docker");
    assert.equal(argumentAfter(commands[0].args, "--benchmark-docker-image"), "golang:1.26-alpine");
    assert.equal(argumentAfter(commands[0].args, "--benchmark-docker-host"), "host.docker.internal");
    assert.equal(argumentAfter(commands[1].args, "--base-url"), "http://127.0.0.1:19100");
    assert.equal(argumentAfter(commands[1].args, "--agent-api-key"), "ueacd");
    assert.equal(argumentAfter(commands[1].args, "--benchmark-runtime"), "wsl");
    assert.equal(argumentAfter(commands[1].args, "--benchmark-wsl-host"), "172.28.160.1");
    assert.equal(argumentAfter(commands[1].args, "--benchmark-wsl-workspace"), "/mnt/c/workspace");
    assert.equal(argumentAfter(commands[1].args, "--max-conns-per-host"), "70");
    assert.equal(argumentAfter(commands[1].args, "--warm-connections-per-host"), "9");
    assert.equal(argumentAfter(commands[2].args, "--base-url"), "http://127.0.0.1:19200");
    assert.equal(argumentAfter(commands[2].args, "--agent-api-key"), "ueacd");
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
      identitySessionDbSessionTablePersistence: "unlogged",
      identitySessionDbWriteConcurrency: "10",
      conversationBenchmarkRuntime: "wsl",
      conversationBenchmarkWslHost: "172.28.160.1",
      conversationBenchmarkWslWorkspace: "/mnt/c/workspace",
      identityBenchmarkRuntime: "docker",
      identityBenchmarkDockerImage: "golang:1.26-alpine",
      identityBenchmarkDockerHost: "host.docker.internal",
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
    assert.equal(report.identityBenchmarkRuntimeProfile.executor, "DOCKER_GO");
    assert.equal(report.identityBenchmarkRuntimeProfile.dockerImage, "golang:1.26-alpine");
    assert.equal(report.identityBenchmarkRuntimeProfile.dockerHostAlias, "host.docker.internal");
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
  });

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
          identityBenchmarkRuntime: "wsl",
        },
        { root, runCommand: successfulChildCommand },
      ),
      /identity-benchmark-runtime must be local or docker/u,
    );
  });
});

async function successfulChildCommand(command, args, root) {
  const sourceReportPath = argumentAfter(args, "--out");
  fs.mkdirSync(path.dirname(path.join(root, sourceReportPath)), { recursive: true });
  fs.writeFileSync(
    path.join(root, sourceReportPath),
    `${JSON.stringify(reportForScript(args[0]), null, 2)}\n`,
  );
  return {
    command,
    args,
    exitCode: 0,
    elapsedMs: 11,
    outputTail: "ok ueacd postgres://app_user:ueacd@127.0.0.1:16432/db",
  };
}

function childReportsFor(commands) {
  return Object.fromEntries(commands.map((command) => [
    command.name,
    { present: true, parseable: true, value: reportForScript(command.args[0]) },
  ]));
}

function reportForScript(script) {
  if (script.includes("run-identity-http-benchmark")) return identityReport();
  if (script.includes("run-conversation-write-benchmark")) return conversationReport();
  if (script.includes("run-teaching-archive-benchmark")) return teachingReport();
  if (script.includes("knowledge-retrieval-benchmark-audit")) return knowledgeReport();
  if (script.includes("ai-worker-job-admission")) return aiAdmissionReport();
  throw new Error(`unknown child script: ${script}`);
}

function identityReport() {
  return {
    status: "PASSED",
    concurrency: 16,
    phases: {
      passwordLogin: phase("passwordLogin", 20, 30, 110),
      principalLookup: phase("principalLookup", 12, 18, 150),
      refreshRotation: phase("refreshRotation", 18, 25, 120),
      revokeCycle: {
        ...phase("revokeCycle", 60, 66, 90),
        stepLatencyAttribution: {
          slowestStep: "revoke",
          slowestStepP99Ms: 44,
          phaseP99Ms: 66,
        },
      },
    },
    gatewayDatabasePhaseDiagnostics: {
      passwordLogin: {
        delta: {
          sessionOperations: {
            saveSession: {
              count: 16,
              totalElapsedMs: 160,
              averageElapsedMs: 10,
            },
          },
        },
      },
      revokeCycle: {
        delta: {
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
        },
      },
    },
  };
}

function conversationReport() {
  return {
    status: "PASSED",
    concurrency: 64,
    benchmarkRuntimeProfile: {
      executor: "WSL_GO",
      wslDistro: "Ubuntu",
      wslHostAlias: "172.28.160.1",
      wslWorkspace: "/mnt/c/workspace",
      targetBaseUrls: ["http://172.28.160.1:18100"],
    },
    gatewayExitCode: [null, null],
    gatewaySignal: [null, null],
    gatewayRuntimeDiagnostics: {
      before: {
        gateways: [
          { status: "OK", stats: { acceptedConns: 1, maxCurrentConns: 1 } },
          { status: "OK", stats: { acceptedConns: 1, maxCurrentConns: 1 } },
        ],
      },
      after: {
        gateways: [
          { status: "OK", stats: { acceptedConns: 276, maxCurrentConns: 276 } },
          { status: "OK", stats: { acceptedConns: 270, maxCurrentConns: 270 } },
        ],
      },
    },
    gatewayDatabaseDiagnostics: {
      after: {
        gateways: [
          { status: "OK", stats: { emptyAcquireCount: 1, emptyAcquireWaitTimeMs: 11.5 } },
          { status: "OK", stats: { emptyAcquireCount: 2, emptyAcquireWaitTimeMs: 5.5 } },
        ],
      },
    },
    phases: {
      createConversation: {
        errors: 0,
        rps: 900,
        latencyMs: { p95: 25, p99: 35 },
        serverTimingMs: { p99: 21 },
        clientServerGapMs: { p99: 44 },
        serverTimingBreakdownMs: {
          "db.acquire": { p99: 0.3 },
          "db.batch_wait": { p99: 12.5 },
          "db.insert": { p99: 15.2 },
        },
      },
    },
  };
}

function teachingReport() {
  return {
    status: "PASSED",
    concurrency: 8,
    phases: {
      createArchiveItem: phase("createArchiveItem", 12, 17, 180),
      createQuizSubmission: phase("createQuizSubmission", 14, 19, 160),
      listArchiveItems: phase("listArchiveItems", 7, 9, 300),
    },
  };
}

function knowledgeReport() {
  return {
    readiness: "READY",
    benchmark: {
      metrics: { p95QueryPlanMs: 2.55 },
    },
  };
}

function aiAdmissionReport() {
  return {
    readiness: "READY",
  };
}

function phase(name, p95, p99, rps) {
  return {
    name,
    errors: 0,
    rps,
    latencyMs: { p95, p99 },
  };
}

function argumentAfter(args, name) {
  const index = args.indexOf(name);
  assert.notEqual(index, -1, `${name} argument should exist`);
  return args[index + 1];
}

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ita-mixed-workload-"));
}

function fixedClock() {
  let tick = 0;
  return () => `2026-06-01T00:00:0${tick++}.000Z`;
}
