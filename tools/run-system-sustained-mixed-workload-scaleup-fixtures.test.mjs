import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function sustainedReport(options, overrides = {}) {
  const errors = overrides.errors ?? 0;
  const status = overrides.status ?? "PASSED";
  const maxP99Ms = overrides.maxP99Ms ?? Number(options.conversationConcurrency) + 10;
  const p99DriftMs = Object.hasOwn(overrides, "p99DriftMs") ? overrides.p99DriftMs : 0;
  const readWriteRps = overrides.readWriteRps ?? 370;
  const sampleCount = Number(options.samples);
  return {
    status,
    summary: {
      executedSamples: Number(options.samples),
      totalErrors: errors,
      maxP95Ms: maxP99Ms * 0.8,
      maxP99Ms,
      p99DriftMs,
      readWriteRps,
      aggregateReadWriteRps: readWriteRps,
      minPassedReadWriteRps: readWriteRps,
      maxPassedReadWriteRps: readWriteRps,
    },
    samples: Array.from({ length: sampleCount }, (_entry, index) => ({
      name: `sample-${index + 1}`,
      readWriteRps,
      aggregateRps: readWriteRps,
      workloads: [
        workload("identity_http", index === 0 ? errors : 0, maxP99Ms, identitySummary(index)),
        workload("conversation_write", 0, maxP99Ms - 1, conversationSummary(index)),
        workload("teaching_archive", 0, maxP99Ms - 2, { rps: 70 }),
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

function identitySummary(index) {
  return {
    errors: 0,
    rps: index === 0 ? 90 : 85,
    dominantPhase: "revokeCycle",
    dominantPhaseP99Ms: index === 0 ? 66 : 88,
    phases: {
      passwordLogin: {
        errors: 0,
        p95Ms: index === 0 ? 20 : 25,
        p99Ms: index === 0 ? 30 : 35,
        rps: index === 0 ? 110 : 100,
        sessionOperations: {
          saveSession: {
            count: index === 0 ? 16 : 24,
            totalElapsedMs: index === 0 ? 160 : 360,
            averageElapsedMs: index === 0 ? 10 : 15,
          },
        },
        slowestSessionOperation: "saveSession",
        slowestSessionOperationAverageElapsedMs: index === 0 ? 10 : 15,
      },
      revokeCycle: {
        errors: 0,
        p95Ms: index === 0 ? 60 : 80,
        p99Ms: index === 0 ? 66 : 88,
        rps: index === 0 ? 90 : 85,
        slowestStep: "revoke",
        slowestStepP99Ms: index === 0 ? 44 : 55,
        sessionOperations: {
          revokeOwnSession: {
            count: index === 0 ? 16 : 24,
            totalElapsedMs: index === 0 ? 320 : 720,
            averageElapsedMs: index === 0 ? 20 : 30,
          },
          saveSession: {
            count: index === 0 ? 16 : 24,
            totalElapsedMs: index === 0 ? 240 : 480,
            averageElapsedMs: index === 0 ? 15 : 20,
          },
        },
        slowestSessionOperation: "revokeOwnSession",
        slowestSessionOperationAverageElapsedMs: index === 0 ? 20 : 30,
      },
    },
  };
}

function conversationSummary(index) {
  return {
    errors: 0,
    rps: index === 0 ? 210 : 205,
    clientServerGapP99Ms: index === 0 ? 77 : 101,
    acceptanceMode: "durable-log",
    commandAppendP99Ms: index === 0 ? 4 : 6,
    projectionEnqueueP99Ms: index === 0 ? 1 : 2,
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
    commandLogDiagnostics: {
      after: {
        acceptedCommands: index === 0 ? 210 : 205,
        projectionEnqueued: index === 0 ? 210 : 205,
        projectionSucceeded: index === 0 ? 207 : 198,
        projectionFailed: 0,
        queueDepth: index === 0 ? 3 : 12,
        maxOldestPendingAgeMs: index === 0 ? 5 : 9,
      },
    },
  };
}

export function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ita-sustained-scaleup-"));
}

export function fixedClock() {
  let tick = 0;
  return () => `2026-06-01T00:00:0${tick++}.000Z`;
}

export const production10kTargetOptions = {
  identityConcurrency: "192", identityOperations: "768", conversationConcurrency: "2304", conversationOperations: "9216",
  teachingConcurrency: "256", teachingOperations: "1536", identityGatewayCount: "2", conversationGatewayCount: "4",
  teachingGatewayCount: "2", dockerStack: "system-persistence",
  identityDsn: "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable",
  conversationDsn: "postgres://app_user:ueacd@127.0.0.1:16433/intelligent_teaching_assistant?sslmode=disable",
  teachingDsn: "postgres://app_user:ueacd@127.0.0.1:16434/intelligent_teaching_assistant?sslmode=disable",
  identitySessionDbMaxConns: "8", identitySessionDbMinConns: "8",
  identitySessionDbPrewarmConns: "8", identitySessionDbReadMaxConns: "8",
  identitySessionDbReadMinConns: "8", identitySessionDbReadPrewarmConns: "8",
  identitySessionDbWriteConcurrency: "8", identityWarmupOperations: "80",
  identitySessionAccessCacheMaxEntries: "262144",
  identitySessionAccessCacheTtlMs: "30000",
  identitySessionDbSessionTablePersistence: "unlogged",
  conversationDbMaxConns: "8", teachingDbMaxConns: "16", teachingDbMinConns: "16", teachingDbPrewarmConns: "16",
  conversationWriteBatchSize: "128", conversationWriteBatchWorkers: "4", conversationWriteBatchMode: "copy",
  conversationWriteAcceptanceMode: "durable-log", conversationCommandLogAppendBatchSize: "128",
  conversationCommandLogQueueCapacity: "262144", conversationCommandLogProjectionWorkers: "8",
  conversationCommandLogSync: "true", conversationCommandLogSettleTimeoutMs: "30000",
  conversationBenchmarkRuntime: "local", conversationBenchmarkWslHost: "172.28.160.1", maxConnsPerHost: "256",
  warmConnectionsPerHost: "144", teachingBenchmarkRuntime: "local", teachingMaxConnsPerHost: "96",
  teachingWarmConnectionsPerHost: "32", teachingClientTrace: "false", teachingArchiveCreateBatchSize: "4",
  teachingArchiveCreateBatchDelayMs: "0", teachingArchiveCreateBatchWorkers: "4",
  teachingArchiveCreateBatchMode: "insert", teachingQuizSubmissionBatchSize: "4",
  teachingQuizSubmissionBatchDelayMs: "0", teachingQuizSubmissionBatchWorkers: "4", teachingArchiveListCacheTtlMs: "250",
  teachingArchiveListCacheMaxEntries: "4096", teachingArchiveSchemaIndexProfile: "hot_write", identityIngressProxy: "true",
  identityIngressCount: "8", identityMaxConnsPerHost: "64", identityWarmConnectionsPerHost: "16",
  identityIngressMaxConnsPerHost: "64", identityIngressWarmConnectionsPerHost: "8",
  identityBenchmarkRuntime: "local", identityBenchmarkDockerHost: "host.docker.internal",
  requireTargetReadWriteRps: "true",
};

export function pickOptions(options, expected) {
  return Object.fromEntries(Object.keys(expected).map((key) => [key, options[key]]));
}
