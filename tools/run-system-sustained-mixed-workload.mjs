import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import {
  assertNonNegativeInteger,
  assertPositiveInteger,
  countCommandErrors,
  kebabToCamel,
  maskSensitive,
  maxFinite,
  minFinite,
  numberOrNull,
  numberOrZero,
  parseBoolean,
  parseInteger,
  removeReports,
  round,
  sanitizeCommandResult,
  writeJsonReport,
} from "./benchmark-runner-utils.mjs";
import {
  buildMixedWorkloadPersistenceProfile,
  buildMixedWorkloadIdentityIngressProfile,
  buildMixedWorkloadConversationBenchmarkRuntimeProfile,
  buildMixedWorkloadTeachingBenchmarkRuntimeProfile,
  buildMixedWorkloadTransportProfile,
  defaults as mixedDefaults,
  dockerStack,
  dockerStackScript,
  runSystemMixedWorkloadBenchmark,
} from "./run-system-mixed-workload-benchmark.mjs";
import { buildSystemIdentityBenchmarkRuntimeProfile } from "./system-identity-benchmark-runtime-profile.mjs";
import {
  defaultSessionTablePersistence,
  normalizeSessionTablePersistence,
} from "./identity-http-benchmark-session-profile.mjs";
import {
  teachingQuizSubmissionBatchDelayMs,
  teachingQuizSubmissionBatchSize,
  teachingQuizSubmissionBatchWorkers,
} from "./system-teaching-benchmark-runtime-profile.mjs";
import { assertConversationFastLaneOptions, conversationFastLaneOptionDefaults, conversationFastLaneProfile } from "./conversation-fast-lane-options.mjs";
import {
  cleanupDocker,
  runSync,
} from "./run-system-sustained-mixed-workload-scaleup-helpers.mjs";

const readWriteWorkloadNames = new Set(["identity_http", "conversation_write", "teaching_archive"]);

export const defaults = {
  out: "reports/system-sustained-mixed-workload.current.json",
  samplePrefix: "reports/system-sustained-mixed-workload",
  profile: "SUSTAINED_SMOKE",
  manageDocker: "true",
  dockerStack: mixedDefaults.dockerStack,
  dockerCleanup: "reset",
  stopOnFailure: "true",
  samples: "2",
  sampleIntervalMs: "0",
  identityBaseUrl: mixedDefaults.identityBaseUrl,
  conversationBaseUrl: mixedDefaults.conversationBaseUrl,
  teachingBaseUrl: mixedDefaults.teachingBaseUrl,
  identityDsn: mixedDefaults.identityDsn,
  conversationDsn: mixedDefaults.conversationDsn,
  teachingDsn: mixedDefaults.teachingDsn,
  identityConcurrency: "4",
  identityOperations: "8",
  identityWarmupOperations: mixedDefaults.identityWarmupOperations,
  conversationConcurrency: "16",
  conversationOperations: "32",
  teachingConcurrency: "4",
  teachingOperations: "8",
  identityGatewayCount: "1",
  conversationGatewayCount: "1",
  teachingGatewayCount: "1",
  identitySessionDbMaxConns: "4",
  identitySessionDbMinConns: mixedDefaults.identitySessionDbMinConns,
  identitySessionDbPrewarmConns: mixedDefaults.identitySessionDbPrewarmConns,
  identitySessionDbReadMaxConns: mixedDefaults.identitySessionDbReadMaxConns,
  identitySessionDbReadMinConns: mixedDefaults.identitySessionDbReadMinConns,
  identitySessionDbReadPrewarmConns: mixedDefaults.identitySessionDbReadPrewarmConns,
  identitySessionDbWriteConcurrency: "0",
  identitySessionAccessCacheMaxEntries: mixedDefaults.identitySessionAccessCacheMaxEntries,
  identitySessionAccessCacheTtlMs: mixedDefaults.identitySessionAccessCacheTtlMs,
  identitySessionDbSessionTablePersistence: defaultSessionTablePersistence,
  conversationDbMaxConns: "1",
  teachingDbMaxConns: "1",
  teachingDbMinConns: mixedDefaults.teachingDbMinConns,
  teachingDbPrewarmConns: mixedDefaults.teachingDbPrewarmConns,
  conversationWriteBatchSize: "8",
  conversationWriteBatchWorkers: mixedDefaults.conversationWriteBatchWorkers,
  conversationWriteBatchMode: mixedDefaults.conversationWriteBatchMode,
  ...conversationFastLaneOptionDefaults,
  conversationClientTrace: mixedDefaults.conversationClientTrace,
  conversationBenchmarkRuntime: mixedDefaults.conversationBenchmarkRuntime,
  conversationBenchmarkDockerImage: mixedDefaults.conversationBenchmarkDockerImage,
  conversationBenchmarkDockerHost: mixedDefaults.conversationBenchmarkDockerHost,
  conversationBenchmarkWslDistro: mixedDefaults.conversationBenchmarkWslDistro,
  conversationBenchmarkWslHost: mixedDefaults.conversationBenchmarkWslHost,
  conversationBenchmarkWslWorkspace: mixedDefaults.conversationBenchmarkWslWorkspace,
  identityBenchmarkRuntime: mixedDefaults.identityBenchmarkRuntime,
  identityBenchmarkDockerImage: mixedDefaults.identityBenchmarkDockerImage,
  identityBenchmarkDockerHost: mixedDefaults.identityBenchmarkDockerHost,
  identityBenchmarkWslDistro: mixedDefaults.identityBenchmarkWslDistro,
  identityBenchmarkWslHost: mixedDefaults.identityBenchmarkWslHost,
  identityBenchmarkWslWorkspace: mixedDefaults.identityBenchmarkWslWorkspace,
  teachingBenchmarkRuntime: mixedDefaults.teachingBenchmarkRuntime,
  teachingBenchmarkDockerImage: mixedDefaults.teachingBenchmarkDockerImage,
  teachingBenchmarkDockerHost: mixedDefaults.teachingBenchmarkDockerHost,
  teachingBenchmarkWslDistro: mixedDefaults.teachingBenchmarkWslDistro,
  teachingBenchmarkWslHost: mixedDefaults.teachingBenchmarkWslHost,
  teachingBenchmarkWslWorkspace: mixedDefaults.teachingBenchmarkWslWorkspace,
  maxConnsPerHost: "0",
  warmConnectionsPerHost: "0",
  teachingMaxConnsPerHost: mixedDefaults.teachingMaxConnsPerHost,
  teachingWarmConnectionsPerHost: mixedDefaults.teachingWarmConnectionsPerHost,
  teachingClientTrace: mixedDefaults.teachingClientTrace,
  teachingArchiveCreateBatchSize: mixedDefaults.teachingArchiveCreateBatchSize,
  teachingArchiveCreateBatchDelayMs: mixedDefaults.teachingArchiveCreateBatchDelayMs,
  teachingArchiveCreateBatchWorkers: mixedDefaults.teachingArchiveCreateBatchWorkers,
  teachingArchiveCreateBatchMode: mixedDefaults.teachingArchiveCreateBatchMode,
  teachingQuizSubmissionBatchSize: mixedDefaults.teachingQuizSubmissionBatchSize,
  teachingQuizSubmissionBatchDelayMs: mixedDefaults.teachingQuizSubmissionBatchDelayMs,
  teachingQuizSubmissionBatchWorkers: mixedDefaults.teachingQuizSubmissionBatchWorkers,
  teachingWriteAcceptanceMode: mixedDefaults.teachingWriteAcceptanceMode,
  teachingCommandLogPath: mixedDefaults.teachingCommandLogPath,
  teachingCommandLogAppendBatchSize: mixedDefaults.teachingCommandLogAppendBatchSize,
  teachingCommandLogQueueCapacity: mixedDefaults.teachingCommandLogQueueCapacity,
  teachingCommandLogProjectionWorkers: mixedDefaults.teachingCommandLogProjectionWorkers,
  teachingCommandLogSync: mixedDefaults.teachingCommandLogSync,
  teachingCommandLogSettleTimeoutMs: mixedDefaults.teachingCommandLogSettleTimeoutMs,
  teachingArchiveListCacheTtlMs: mixedDefaults.teachingArchiveListCacheTtlMs,
  teachingArchiveListCacheMaxEntries: mixedDefaults.teachingArchiveListCacheMaxEntries,
  teachingArchiveSchemaIndexProfile: mixedDefaults.teachingArchiveSchemaIndexProfile,
  identityMaxConnsPerHost: mixedDefaults.identityMaxConnsPerHost,
  identityWarmConnectionsPerHost: mixedDefaults.identityWarmConnectionsPerHost,
  identityIngressProxy: mixedDefaults.identityIngressProxy,
  identityIngressPort: mixedDefaults.identityIngressPort,
  identityIngressCount: mixedDefaults.identityIngressCount,
  identityIngressMaxConnsPerHost: mixedDefaults.identityIngressMaxConnsPerHost,
  identityIngressWarmConnectionsPerHost: mixedDefaults.identityIngressWarmConnectionsPerHost,
  timeout: "180s",
  teachingTimeoutMs: mixedDefaults.teachingTimeoutMs,
  startupTimeoutMs: "120000",
  pgbouncerDiagnostics: mixedDefaults.pgbouncerDiagnostics,
  pgbouncerPostgresContainer: mixedDefaults.pgbouncerPostgresContainer,
  pgbouncerHost: mixedDefaults.pgbouncerHost,
  pgbouncerPort: mixedDefaults.pgbouncerPort,
  pgbouncerUser: mixedDefaults.pgbouncerUser,
  pgbouncerDatabase: mixedDefaults.pgbouncerDatabase,
  postgresDiagnostics: mixedDefaults.postgresDiagnostics,
  postgresDiagnosticsContainer: mixedDefaults.postgresDiagnosticsContainer,
  postgresDiagnosticsHost: mixedDefaults.postgresDiagnosticsHost,
  postgresDiagnosticsPort: mixedDefaults.postgresDiagnosticsPort,
  postgresDiagnosticsUser: mixedDefaults.postgresDiagnosticsUser,
  postgresDiagnosticsDatabase: mixedDefaults.postgresDiagnosticsDatabase,
  postgresDiagnosticsRelations: mixedDefaults.postgresDiagnosticsRelations,
  postgresDiagnosticsIntervalMs: mixedDefaults.postgresDiagnosticsIntervalMs,
  postgresDiagnosticsMaxSamples: mixedDefaults.postgresDiagnosticsMaxSamples,
  postgresDiagnosticsQueryTimeoutMs: mixedDefaults.postgresDiagnosticsQueryTimeoutMs,
};

export function parseArgs(argv) {
  const parsed = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--") || value === undefined) continue;
    if (key === "--identity-session-db-session-table-persistence") {
      parsed.identitySessionDbSessionTablePersistence = normalizeSessionTablePersistence(value);
      index += 1;
      continue;
    }
    const property = kebabToCamel(key.slice(2));
    if (Object.hasOwn(parsed, property)) {
      parsed[property] = value;
      index += 1;
    }
  }
  return parsed;
}

export function buildSampleRuns(options) {
  const samples = parseInteger(options.samples);
  return Array.from({ length: samples }, (_entry, index) => {
    const sampleNumber = index + 1;
    const reportPrefix = `${options.samplePrefix}.${sampleNumber}`;
    return {
      sampleNumber,
      name: `sample-${sampleNumber}`,
      reportPath: `${reportPrefix}.json`,
      options: {
        ...mixedDefaults,
        profile: `${options.profile}_SAMPLE_${sampleNumber}`,
        manageDocker: "false",
        dockerStack: options.dockerStack,
        dockerCleanup: "none",
        out: `${reportPrefix}.json`,
        identityOut: `${reportPrefix}.identity-http.json`,
        conversationOut: `${reportPrefix}.conversation-write.json`,
        teachingOut: `${reportPrefix}.teaching-archive.json`,
        knowledgeOut: `${reportPrefix}.knowledge-retrieval.json`,
        aiAdmissionOut: `${reportPrefix}.ai-worker-admission.json`,
        identityBaseUrl: options.identityBaseUrl,
        conversationBaseUrl: options.conversationBaseUrl,
        teachingBaseUrl: options.teachingBaseUrl,
        identityDsn: options.identityDsn,
        conversationDsn: options.conversationDsn,
        teachingDsn: options.teachingDsn,
        identityConcurrency: options.identityConcurrency,
        identityOperations: options.identityOperations,
        identityWarmupOperations: options.identityWarmupOperations,
        conversationConcurrency: options.conversationConcurrency,
        conversationOperations: options.conversationOperations,
        teachingConcurrency: options.teachingConcurrency,
        teachingOperations: options.teachingOperations,
        identityGatewayCount: options.identityGatewayCount,
        conversationGatewayCount: options.conversationGatewayCount,
        teachingGatewayCount: options.teachingGatewayCount,
        identitySessionDbMaxConns: options.identitySessionDbMaxConns,
        identitySessionDbMinConns: options.identitySessionDbMinConns,
        identitySessionDbPrewarmConns: options.identitySessionDbPrewarmConns,
        identitySessionDbReadMaxConns: options.identitySessionDbReadMaxConns,
        identitySessionDbReadMinConns: options.identitySessionDbReadMinConns,
        identitySessionDbReadPrewarmConns: options.identitySessionDbReadPrewarmConns,
        identitySessionDbWriteConcurrency: options.identitySessionDbWriteConcurrency,
        identitySessionAccessCacheMaxEntries: options.identitySessionAccessCacheMaxEntries,
        identitySessionAccessCacheTtlMs: options.identitySessionAccessCacheTtlMs,
        identitySessionDbSessionTablePersistence: identitySessionTablePersistence(options),
        conversationDbMaxConns: options.conversationDbMaxConns,
        teachingDbMaxConns: options.teachingDbMaxConns,
        teachingDbMinConns: options.teachingDbMinConns,
        teachingDbPrewarmConns: options.teachingDbPrewarmConns,
        conversationWriteBatchSize: options.conversationWriteBatchSize,
        conversationWriteBatchWorkers: options.conversationWriteBatchWorkers,
        conversationWriteBatchMode: options.conversationWriteBatchMode,
        conversationWriteAcceptanceMode: options.conversationWriteAcceptanceMode,
        conversationCommandLogAppendBatchSize: options.conversationCommandLogAppendBatchSize,
        conversationCommandLogQueueCapacity: options.conversationCommandLogQueueCapacity,
        conversationCommandLogProjectionWorkers: options.conversationCommandLogProjectionWorkers,
        conversationCommandLogSync: options.conversationCommandLogSync,
        conversationCommandLogSettleTimeoutMs: options.conversationCommandLogSettleTimeoutMs,
        conversationClientTrace: options.conversationClientTrace,
        conversationBenchmarkRuntime: options.conversationBenchmarkRuntime,
        conversationBenchmarkDockerImage: options.conversationBenchmarkDockerImage,
        conversationBenchmarkDockerHost: options.conversationBenchmarkDockerHost,
        conversationBenchmarkWslDistro: options.conversationBenchmarkWslDistro,
        conversationBenchmarkWslHost: options.conversationBenchmarkWslHost,
        conversationBenchmarkWslWorkspace: options.conversationBenchmarkWslWorkspace,
        identityBenchmarkRuntime: options.identityBenchmarkRuntime,
        identityBenchmarkDockerImage: options.identityBenchmarkDockerImage,
        identityBenchmarkDockerHost: options.identityBenchmarkDockerHost,
        identityBenchmarkWslDistro: options.identityBenchmarkWslDistro,
        identityBenchmarkWslHost: options.identityBenchmarkWslHost,
        identityBenchmarkWslWorkspace: options.identityBenchmarkWslWorkspace,
        teachingBenchmarkRuntime: options.teachingBenchmarkRuntime,
        teachingBenchmarkDockerImage: options.teachingBenchmarkDockerImage,
        teachingBenchmarkDockerHost: options.teachingBenchmarkDockerHost,
        teachingBenchmarkWslDistro: options.teachingBenchmarkWslDistro,
        teachingBenchmarkWslHost: options.teachingBenchmarkWslHost,
        teachingBenchmarkWslWorkspace: options.teachingBenchmarkWslWorkspace,
        maxConnsPerHost: options.maxConnsPerHost,
        warmConnectionsPerHost: options.warmConnectionsPerHost,
        teachingMaxConnsPerHost: options.teachingMaxConnsPerHost,
        teachingWarmConnectionsPerHost: options.teachingWarmConnectionsPerHost,
        teachingClientTrace: options.teachingClientTrace,
        teachingArchiveCreateBatchSize: options.teachingArchiveCreateBatchSize,
        teachingArchiveCreateBatchDelayMs: options.teachingArchiveCreateBatchDelayMs,
        teachingArchiveCreateBatchWorkers: options.teachingArchiveCreateBatchWorkers,
        teachingArchiveCreateBatchMode: options.teachingArchiveCreateBatchMode,
        teachingQuizSubmissionBatchSize: options.teachingQuizSubmissionBatchSize,
        teachingQuizSubmissionBatchDelayMs: options.teachingQuizSubmissionBatchDelayMs,
        teachingQuizSubmissionBatchWorkers: options.teachingQuizSubmissionBatchWorkers,
        teachingWriteAcceptanceMode: options.teachingWriteAcceptanceMode,
        teachingCommandLogPath: options.teachingCommandLogPath,
        teachingCommandLogAppendBatchSize: options.teachingCommandLogAppendBatchSize,
        teachingCommandLogQueueCapacity: options.teachingCommandLogQueueCapacity,
        teachingCommandLogProjectionWorkers: options.teachingCommandLogProjectionWorkers,
        teachingCommandLogSync: options.teachingCommandLogSync,
        teachingCommandLogSettleTimeoutMs: options.teachingCommandLogSettleTimeoutMs,
        teachingArchiveListCacheTtlMs: options.teachingArchiveListCacheTtlMs,
        teachingArchiveListCacheMaxEntries: options.teachingArchiveListCacheMaxEntries,
        teachingArchiveSchemaIndexProfile: options.teachingArchiveSchemaIndexProfile,
        identityMaxConnsPerHost: options.identityMaxConnsPerHost,
        identityWarmConnectionsPerHost: options.identityWarmConnectionsPerHost,
        identityIngressProxy: options.identityIngressProxy,
        identityIngressPort: options.identityIngressPort,
        identityIngressCount: options.identityIngressCount,
        identityIngressMaxConnsPerHost: options.identityIngressMaxConnsPerHost,
        identityIngressWarmConnectionsPerHost: options.identityIngressWarmConnectionsPerHost,
        timeout: options.timeout,
        teachingTimeoutMs: options.teachingTimeoutMs,
        startupTimeoutMs: options.startupTimeoutMs,
        pgbouncerDiagnostics: options.pgbouncerDiagnostics,
        pgbouncerPostgresContainer: options.pgbouncerPostgresContainer,
        pgbouncerHost: options.pgbouncerHost,
        pgbouncerPort: options.pgbouncerPort,
        pgbouncerUser: options.pgbouncerUser,
        pgbouncerDatabase: options.pgbouncerDatabase,
        postgresDiagnostics: options.postgresDiagnostics,
        postgresDiagnosticsContainer: options.postgresDiagnosticsContainer,
        postgresDiagnosticsHost: options.postgresDiagnosticsHost,
        postgresDiagnosticsPort: options.postgresDiagnosticsPort,
        postgresDiagnosticsUser: options.postgresDiagnosticsUser,
        postgresDiagnosticsDatabase: options.postgresDiagnosticsDatabase,
        postgresDiagnosticsRelations: options.postgresDiagnosticsRelations,
        postgresDiagnosticsIntervalMs: options.postgresDiagnosticsIntervalMs,
        postgresDiagnosticsMaxSamples: options.postgresDiagnosticsMaxSamples,
        postgresDiagnosticsQueryTimeoutMs: options.postgresDiagnosticsQueryTimeoutMs,
      },
    };
  });
}

export async function runSystemSustainedMixedWorkload(options = parseArgs(process.argv.slice(2)), dependencies = {}) {
  const root = dependencies.root ?? process.cwd();
  const runSyncFn = dependencies.runSync ?? runSync;
  const runSampleFn = dependencies.runSample ?? runSystemMixedWorkloadBenchmark;
  const sleepFn = dependencies.sleep ?? sleep;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const setup = [];
  const cleanup = [];
  const runnerErrors = [];
  const sampleRuns = buildSampleRuns(options);
  const sampleReports = [];

  try {
    validateOptions(options, sampleRuns);
    removeReports(root, [options.out, ...sampleRuns.map((sample) => sample.reportPath)]);
    if (parseBoolean(options.manageDocker)) {
      setup.push({ phase: "setup-reset", ...runSyncFn("npm", ["run", dockerStackScript(options, "reset")], root) });
      if (setup.at(-1).exitCode !== 0) throw new Error("managed Docker reset failed before sustained mixed workload");
      setup.push({ phase: "setup-up", ...runSyncFn("npm", ["run", dockerStackScript(options, "up")], root) });
      if (setup.at(-1).exitCode !== 0) throw new Error("managed Docker setup failed before sustained mixed workload");
    }

    for (const sample of sampleRuns) {
      const report = await runSampleFn(sample.options, { root });
      sampleReports.push({ sample, report });
      if (parseBoolean(options.stopOnFailure) && report.status !== "PASSED") break;
      if (sampleReports.length < sampleRuns.length) {
        await sleepFn(parseInteger(options.sampleIntervalMs));
      }
    }
  } catch (error) {
    runnerErrors.push(maskSensitive(error.message));
  } finally {
    if (parseBoolean(options.manageDocker)) {
      cleanup.push(...cleanupDocker(options, root, runSyncFn));
    }
  }

  const endedAt = now();
  const report = buildSystemSustainedMixedWorkloadReport({
    options,
    sampleRuns,
    sampleReports,
    setup,
    cleanup,
    runnerErrors,
    startedAt,
    endedAt,
  });
  writeJsonReport(path.join(root, options.out), report);
  return report;
}

export function buildSystemSustainedMixedWorkloadReport({
  options,
  sampleRuns,
  sampleReports,
  setup = [],
  cleanup = [],
  runnerErrors = [],
  startedAt,
  endedAt,
}) {
  const samples = sampleRuns.map((sample) => {
    const report = sampleReports.find((entry) => entry.sample.name === sample.name)?.report;
    return summarizeSample(sample, report);
  });
  const orchestrationErrors = countCommandErrors(setup) + countCommandErrors(cleanup) + runnerErrors.length;
  const executedSamples = samples.filter((sample) => sample.executed);
  const allSamplesPassed = executedSamples.length === sampleRuns.length &&
    executedSamples.every((sample) => sample.status === "PASSED");
  const status = orchestrationErrors === 0 && allSamplesPassed ? "PASSED" : "FAILED";

  return {
    generatedAt: endedAt,
    startedAt,
    endedAt,
    benchmarkKind: "system_sustained_mixed_workload",
    workloadType: "SUSTAINED_MIXED_WORKLOAD",
    profile: options.profile,
    status,
    stopOnFailure: parseBoolean(options.stopOnFailure),
    sampleIntervalMs: parseInteger(options.sampleIntervalMs),
    concurrencyProfile: {
      identityConcurrency: parseInteger(options.identityConcurrency),
      conversationConcurrency: parseInteger(options.conversationConcurrency),
      teachingConcurrency: parseInteger(options.teachingConcurrency),
      identityGatewayCount: parseInteger(options.identityGatewayCount),
      conversationGatewayCount: parseInteger(options.conversationGatewayCount),
      teachingGatewayCount: parseInteger(options.teachingGatewayCount),
      configuredSamples: sampleRuns.length,
    },
    transportProfile: buildSustainedMixedWorkloadTransportProfile(options),
    identityIngressProfile: buildSustainedMixedWorkloadIdentityIngressProfile(options),
    persistenceProfile: buildSustainedMixedWorkloadPersistenceProfile(options),
    databaseProfile: {
      identitySessionDbMaxConns: parseInteger(options.identitySessionDbMaxConns),
      identitySessionDbMinConns: parseInteger(options.identitySessionDbMinConns),
      identitySessionDbPrewarmConns: parseInteger(options.identitySessionDbPrewarmConns),
      identitySessionDbReadMaxConns: parseInteger(options.identitySessionDbReadMaxConns),
      identitySessionDbReadMinConns: parseInteger(options.identitySessionDbReadMinConns),
      identitySessionDbReadPrewarmConns: parseInteger(options.identitySessionDbReadPrewarmConns),
      identitySessionDbWriteConcurrency: parseInteger(options.identitySessionDbWriteConcurrency),
      identityWarmupOperations: parseInteger(options.identityWarmupOperations),
      identitySessionAccessCacheMaxEntries: parseInteger(options.identitySessionAccessCacheMaxEntries),
      identitySessionAccessCacheTtlMs: parseInteger(options.identitySessionAccessCacheTtlMs),
      identitySessionTablePersistence: identitySessionTablePersistence(options),
      conversationDbMaxConns: parseInteger(options.conversationDbMaxConns),
      teachingDbMaxConns: parseInteger(options.teachingDbMaxConns),
      teachingDbMinConns: parseInteger(options.teachingDbMinConns),
      teachingDbPrewarmConns: parseInteger(options.teachingDbPrewarmConns),
      conversationWriteBatchSize: parseInteger(options.conversationWriteBatchSize),
      conversationWriteBatchWorkers: parseInteger(options.conversationWriteBatchWorkers),
      conversationWriteBatchMode: conversationWriteBatchMode(options),
      ...conversationFastLaneProfile(options),
      teachingArchiveCreateBatchSize: parseInteger(options.teachingArchiveCreateBatchSize),
      teachingArchiveCreateBatchDelayMs: parseInteger(options.teachingArchiveCreateBatchDelayMs),
      teachingArchiveCreateBatchWorkers: parseInteger(options.teachingArchiveCreateBatchWorkers),
      teachingArchiveCreateBatchMode: options.teachingArchiveCreateBatchMode,
      teachingQuizSubmissionBatchSize: parseInteger(teachingQuizSubmissionBatchSize(options)),
      teachingQuizSubmissionBatchDelayMs: parseInteger(teachingQuizSubmissionBatchDelayMs(options)),
      teachingQuizSubmissionBatchWorkers: parseInteger(teachingQuizSubmissionBatchWorkers(options)),
      teachingWriteAcceptanceMode: options.teachingWriteAcceptanceMode,
      teachingCommandLogAppendBatchSize: parseInteger(options.teachingCommandLogAppendBatchSize),
      teachingCommandLogQueueCapacity: parseInteger(options.teachingCommandLogQueueCapacity),
      teachingCommandLogProjectionWorkers: parseInteger(options.teachingCommandLogProjectionWorkers),
      teachingCommandLogSync: parseBoolean(options.teachingCommandLogSync),
      teachingCommandLogSettleTimeoutMs: parseInteger(options.teachingCommandLogSettleTimeoutMs),
      teachingArchiveSchemaIndexProfile: options.teachingArchiveSchemaIndexProfile,
    },
    runtimeProfile: {
      executor: "LOCAL_NODE_SUSTAINED_ORCHESTRATOR",
      managedDocker: parseBoolean(options.manageDocker),
      dockerStack: dockerStack(options),
      dockerCleanup: options.dockerCleanup,
    },
    diagnosticsProfile: buildSustainedMixedWorkloadDiagnosticsProfile(options),
    conversationBenchmarkRuntimeProfile: buildSustainedMixedWorkloadConversationBenchmarkRuntimeProfile(options),
    identityBenchmarkRuntimeProfile: buildSustainedMixedWorkloadIdentityBenchmarkRuntimeProfile(options),
    teachingBenchmarkRuntimeProfile: buildSustainedMixedWorkloadTeachingBenchmarkRuntimeProfile(options),
    samples,
    summary: summarizeSustainedSamples(samples, orchestrationErrors),
    setup: setup.map((entry) => sanitizeCommandResult(entry)),
    cleanup: cleanup.map((entry) => sanitizeCommandResult(entry)),
    runnerErrors,
    nextAction: status === "PASSED"
      ? "Treat this as sustained mixed workload smoke evidence only; increase duration, concurrency, and workflow coverage before any full-system capacity promotion."
      : "Fix the first failed sustained mixed workload sample before increasing duration or concurrency.",
  };
}

export function buildSustainedMixedWorkloadPersistenceProfile(options) {
  return buildMixedWorkloadPersistenceProfile(options);
}

export function buildSustainedMixedWorkloadTransportProfile(options) {
  return buildMixedWorkloadTransportProfile(options);
}

export function buildSustainedMixedWorkloadIdentityIngressProfile(options) {
  return buildMixedWorkloadIdentityIngressProfile(options);
}

export function buildSustainedMixedWorkloadConversationBenchmarkRuntimeProfile(options) {
  return buildMixedWorkloadConversationBenchmarkRuntimeProfile(options);
}

export function buildSustainedMixedWorkloadIdentityBenchmarkRuntimeProfile(options) {
  return buildSystemIdentityBenchmarkRuntimeProfile(options);
}

export function buildSustainedMixedWorkloadTeachingBenchmarkRuntimeProfile(options) {
  return buildMixedWorkloadTeachingBenchmarkRuntimeProfile(options);
}

export function buildSustainedMixedWorkloadDiagnosticsProfile(options) {
  return {
    pgbouncerDiagnostics: parseBoolean(options.pgbouncerDiagnostics),
    postgresDiagnostics: parseBoolean(options.postgresDiagnostics),
    pgbouncerPostgresContainer: options.pgbouncerPostgresContainer,
    pgbouncerHost: options.pgbouncerHost,
    pgbouncerPort: parseInteger(options.pgbouncerPort),
    pgbouncerDatabase: options.pgbouncerDatabase,
    postgresDiagnosticsContainer: options.postgresDiagnosticsContainer,
    postgresDiagnosticsHost: options.postgresDiagnosticsHost,
    postgresDiagnosticsPort: parseInteger(options.postgresDiagnosticsPort),
    postgresDiagnosticsDatabase: options.postgresDiagnosticsDatabase,
    postgresDiagnosticsRelations: String(options.postgresDiagnosticsRelations ?? "").trim() || null,
    postgresDiagnosticsIntervalMs: parseInteger(options.postgresDiagnosticsIntervalMs),
    postgresDiagnosticsMaxSamples: parseInteger(options.postgresDiagnosticsMaxSamples),
    postgresDiagnosticsQueryTimeoutMs: parseInteger(options.postgresDiagnosticsQueryTimeoutMs),
  };
}

export function formatSystemSustainedMixedWorkload(report) {
  const lines = [
    `System sustained mixed workload: ${report.status}`,
    `Profile: ${report.profile}`,
    `Executed samples: ${report.summary.executedSamples}/${report.summary.configuredSamples}`,
    `Total errors: ${report.summary.totalErrors}`,
    `P99 drift: ${report.summary.p99DriftMs ?? "n/a"}ms`,
    "",
    "Sample results:",
  ];
  for (const sample of report.samples) {
    lines.push(
      `- ${sample.name} ${sample.status} readWriteRps=${sample.readWriteRps ?? "n/a"} maxP99=${sample.maxP99Ms ?? "n/a"}ms errors=${sample.totalErrors}`,
    );
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function summarizeSample(sample, report) {
  if (!report || typeof report !== "object") {
    return {
      name: sample.name,
      sampleNumber: sample.sampleNumber,
      executed: false,
      status: "NOT_RUN",
      reportPath: sample.reportPath,
      totalErrors: 0,
      maxP95Ms: null,
      maxP99Ms: null,
      readWriteRps: null,
      aggregateRps: null,
      readWriteWorkloads: [],
      workloads: [],
    };
  }
  const workloads = Array.isArray(report.workloads)
    ? report.workloads.map((workload) => ({
        name: workload.name,
        status: workload.status,
        errors: numberOrZero(workload.errors),
        p95Ms: numberOrNull(workload.p95Ms),
        p99Ms: numberOrNull(workload.p99Ms),
        rps: workloadRps(workload),
        summary: workload.summary && typeof workload.summary === "object" ? workload.summary : undefined,
      }))
    : [];
  const throughput = summarizeReadWriteThroughput(workloads);
  return {
    name: sample.name,
    sampleNumber: sample.sampleNumber,
    executed: true,
    status: report.status ?? "FAILED",
    reportPath: sample.reportPath,
    totalErrors: numberOrZero(report.summary?.totalErrors),
    maxP95Ms: numberOrNull(report.summary?.maxP95Ms),
    maxP99Ms: numberOrNull(report.summary?.maxP99Ms),
    readWriteRps: throughput.readWriteRps,
    aggregateRps: throughput.aggregateRps,
    readWriteWorkloads: throughput.readWriteWorkloads,
    workloads,
  };
}

function summarizeSustainedSamples(samples, orchestrationErrors) {
  const executedSamples = samples.filter((sample) => sample.executed);
  const passedSamples = executedSamples.filter((sample) => sample.status === "PASSED");
  const failedSamples = executedSamples.filter((sample) => sample.status !== "PASSED");
  const firstP99 = passedSamples.at(0)?.maxP99Ms;
  const lastP99 = passedSamples.at(-1)?.maxP99Ms;
  const passedReadWriteRps = passedSamples.map((sample) => sample.readWriteRps);
  const sustainedReadWriteRps = minFinite(passedReadWriteRps);
  const maxPassedReadWriteRps = maxFinite(passedReadWriteRps);
  return {
    configuredSamples: samples.length,
    executedSamples: executedSamples.length,
    passedSamples: passedSamples.length,
    failedSamples: failedSamples.length,
    totalErrors: executedSamples.reduce((total, sample) => total + sample.totalErrors, 0) + orchestrationErrors,
    orchestrationErrors,
    maxP95Ms: maxFinite(executedSamples.map((sample) => sample.maxP95Ms)),
    maxP99Ms: maxFinite(executedSamples.map((sample) => sample.maxP99Ms)),
    p99DriftMs: Number.isFinite(firstP99) && Number.isFinite(lastP99) ? round(lastP99 - firstP99, 2) : null,
    readWriteRps: sustainedReadWriteRps,
    aggregateReadWriteRps: sustainedReadWriteRps,
    minPassedReadWriteRps: sustainedReadWriteRps,
    maxPassedReadWriteRps,
    highestPassedSample: passedSamples.at(-1)?.name ?? null,
    firstFailedSample: failedSamples.at(0)?.name ?? null,
  };
}

function summarizeReadWriteThroughput(workloads) {
  const readWriteWorkloads = workloads
    .filter((workload) => readWriteWorkloadNames.has(workload.name) && workload.status === "PASSED")
    .map((workload) => ({ name: workload.name, rps: numberOrNull(workload.rps) }))
    .filter((workload) => Number.isFinite(workload.rps));
  if (readWriteWorkloads.length === 0) {
    return {
      readWriteRps: null,
      aggregateRps: null,
      readWriteWorkloads: [],
    };
  }
  const aggregateRps = round(readWriteWorkloads.reduce((total, workload) => total + workload.rps, 0), 2);
  return {
    readWriteRps: aggregateRps,
    aggregateRps,
    readWriteWorkloads,
  };
}

function workloadRps(workload) {
  return firstFinite(
    workload.rps,
    workload.summary?.rps,
    workload.summary?.minRps,
    minFinite(Object.values(workload.summary?.phases ?? {}).map((phase) => numberOrNull(phase.rps))),
  );
}

function validateOptions(options, sampleRuns) {
  if (sampleRuns.length === 0) throw new Error("at least one sustained sample is required");
  assertPositiveInteger(options.samples, "samples");
  assertNonNegativeInteger(options.sampleIntervalMs, "sample-interval-ms");
  assertPositiveInteger(options.identityConcurrency, "identity-concurrency");
  assertPositiveInteger(options.identityOperations, "identity-operations");
  assertNonNegativeInteger(options.identityWarmupOperations, "identity-warmup-operations");
  assertPositiveInteger(options.conversationConcurrency, "conversation-concurrency");
  assertPositiveInteger(options.conversationOperations, "conversation-operations");
  assertPositiveInteger(options.teachingConcurrency, "teaching-concurrency");
  assertPositiveInteger(options.teachingOperations, "teaching-operations");
  buildSustainedMixedWorkloadPersistenceProfile(options);
  dockerStack(options);
  assertPositiveInteger(options.identityGatewayCount, "identity-gateway-count");
  assertPositiveInteger(options.conversationGatewayCount, "conversation-gateway-count");
  assertPositiveInteger(options.identitySessionDbMaxConns, "identity-session-db-max-conns");
  assertNonNegativeInteger(options.identitySessionDbMinConns, "identity-session-db-min-conns");
  assertNonNegativeInteger(options.identitySessionDbPrewarmConns, "identity-session-db-prewarm-conns");
  assertNonNegativeInteger(options.identitySessionDbReadMaxConns, "identity-session-db-read-max-conns");
  assertNonNegativeInteger(options.identitySessionDbReadMinConns, "identity-session-db-read-min-conns");
  assertNonNegativeInteger(options.identitySessionDbReadPrewarmConns, "identity-session-db-read-prewarm-conns");
  assertNonNegativeInteger(options.identitySessionDbWriteConcurrency, "identity-session-db-write-concurrency");
  assertNonNegativeInteger(options.identitySessionAccessCacheMaxEntries, "identity-session-access-cache-max-entries");
  assertNonNegativeInteger(options.identitySessionAccessCacheTtlMs, "identity-session-access-cache-ttl-ms");
  identitySessionTablePersistence(options);
  if (parseInteger(options.identitySessionDbMinConns) > parseInteger(options.identitySessionDbMaxConns)) {
    throw new Error("identity-session-db-min-conns must be <= identity-session-db-max-conns");
  }
  if (parseInteger(options.identitySessionDbPrewarmConns) > parseInteger(options.identitySessionDbMaxConns)) {
    throw new Error("identity-session-db-prewarm-conns must be <= identity-session-db-max-conns");
  }
  if (parseInteger(options.identitySessionDbReadMaxConns) === 0 &&
    (parseInteger(options.identitySessionDbReadMinConns) > 0 || parseInteger(options.identitySessionDbReadPrewarmConns) > 0)) {
    throw new Error("identity-session-db-read-min-conns and identity-session-db-read-prewarm-conns require identity-session-db-read-max-conns");
  }
  if (parseInteger(options.identitySessionDbReadMaxConns) > 0 &&
    parseInteger(options.identitySessionDbReadMinConns) > parseInteger(options.identitySessionDbReadMaxConns)) {
    throw new Error("identity-session-db-read-min-conns must be <= identity-session-db-read-max-conns");
  }
  if (parseInteger(options.identitySessionDbReadMaxConns) > 0 &&
    parseInteger(options.identitySessionDbReadPrewarmConns) > parseInteger(options.identitySessionDbReadMaxConns)) {
    throw new Error("identity-session-db-read-prewarm-conns must be <= identity-session-db-read-max-conns");
  }
  assertPositiveInteger(options.conversationDbMaxConns, "conversation-db-max-conns");
  assertPositiveInteger(options.teachingDbMaxConns, "teaching-db-max-conns");
  assertNonNegativeInteger(options.teachingDbMinConns, "teaching-db-min-conns");
  assertNonNegativeInteger(options.teachingDbPrewarmConns, "teaching-db-prewarm-conns");
  if (parseInteger(options.teachingDbMinConns) > parseInteger(options.teachingDbMaxConns)) {
    throw new Error("teaching-db-min-conns must be <= teaching-db-max-conns");
  }
  if (parseInteger(options.teachingDbPrewarmConns) > parseInteger(options.teachingDbMaxConns)) {
    throw new Error("teaching-db-prewarm-conns must be <= teaching-db-max-conns");
  }
  assertPositiveInteger(options.conversationWriteBatchSize, "conversation-write-batch-size");
  assertPositiveInteger(options.conversationWriteBatchWorkers, "conversation-write-batch-workers");
  conversationWriteBatchMode(options);
  assertConversationFastLaneOptions(options);
  buildSustainedMixedWorkloadConversationBenchmarkRuntimeProfile(options);
  buildSustainedMixedWorkloadIdentityBenchmarkRuntimeProfile(options);
  buildSustainedMixedWorkloadTeachingBenchmarkRuntimeProfile(options);
  assertPositiveInteger(options.teachingTimeoutMs, "teaching-timeout-ms");
}

function conversationWriteBatchMode(options) {
  const normalized = String(options.conversationWriteBatchMode ?? "insert").trim().toLowerCase();
  if (normalized !== "insert" && normalized !== "copy") {
    throw new Error("conversation-write-batch-mode must be insert or copy");
  }
  return normalized;
}

function identitySessionTablePersistence(options) {
  return normalizeSessionTablePersistence(options.identitySessionDbSessionTablePersistence);
}

function firstFinite(...values) {
  return values.find(Number.isFinite) ?? null;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runSystemSustainedMixedWorkload();
  console.log(formatSystemSustainedMixedWorkload(report));
  process.exit(report.status === "PASSED" ? 0 : 1);
}
