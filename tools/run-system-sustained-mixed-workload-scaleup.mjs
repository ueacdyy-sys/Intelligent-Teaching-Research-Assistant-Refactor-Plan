import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { assertNonNegativeInteger, assertPositiveInteger, countCommandErrors, kebabToCamel, maskSensitive, parseBoolean, parseInteger, parseOptionalInteger, removeReports, sanitizeCommandResult, writeJsonReport } from "./benchmark-runner-utils.mjs";
import { dockerStack, dockerStackScript } from "./run-system-mixed-workload-benchmark.mjs";
import { buildSustainedMixedWorkloadConversationBenchmarkRuntimeProfile, buildSustainedMixedWorkloadIdentityBenchmarkRuntimeProfile, buildSustainedMixedWorkloadIdentityIngressProfile, buildSustainedMixedWorkloadPersistenceProfile, buildSustainedMixedWorkloadTeachingBenchmarkRuntimeProfile, buildSustainedMixedWorkloadTransportProfile, defaults as sustainedDefaults, runSystemSustainedMixedWorkload } from "./run-system-sustained-mixed-workload.mjs";
import { defaultSessionTablePersistence, normalizeSessionTablePersistence } from "./identity-http-benchmark-session-profile.mjs";
import { assertProductionTargetPressure as assertProductionTargetPressureProfile } from "./system-production-target-pressure-profile.mjs";
import { buildThroughputTargetNextAction, resolveTargetReadWriteRps, summarizeThroughputTarget, targetBearingSteps } from "./system-throughput-target-profile.mjs";
import { assertConversationFastLaneOptions, conversationFastLaneOptionDefaults, conversationFastLaneProfile } from "./conversation-fast-lane-options.mjs";
import { normalizeScaleProfile, scaleProfileDefaults, scaleProfileNames, standardScaleSteps } from "./system-sustained-scaleup-profiles.mjs";
import {
  cleanupDocker,
  runSync,
  stepBlocksFurtherScale,
  summarizeScaleUp,
  summarizeStep,
} from "./run-system-sustained-mixed-workload-scaleup-helpers.mjs";
import {
  teachingQuizSubmissionBatchDelayMs,
  teachingQuizSubmissionBatchSize,
  teachingQuizSubmissionBatchWorkers,
} from "./system-teaching-benchmark-runtime-profile.mjs";

export const defaults = {
  out: "reports/system-sustained-mixed-workload-scaleup.current.json",
  stepPrefix: "reports/system-sustained-mixed-workload-scaleup",
  profile: "SUSTAINED_SCALEUP",
  scaleProfile: "standard",
  manageDocker: "true",
  dockerStack: sustainedDefaults.dockerStack,
  dockerCleanup: "reset",
  stopOnFailure: "true",
  steps: standardScaleSteps,
  targetReadWriteRps: "0",
  requireTargetReadWriteRps: "false",
  samples: "2",
  sampleIntervalMs: "0",
  identityBaseUrl: sustainedDefaults.identityBaseUrl,
  conversationBaseUrl: sustainedDefaults.conversationBaseUrl,
  teachingBaseUrl: sustainedDefaults.teachingBaseUrl,
  identityDsn: sustainedDefaults.identityDsn,
  conversationDsn: sustainedDefaults.conversationDsn,
  teachingDsn: sustainedDefaults.teachingDsn,
  identityGatewayCount: "1",
  conversationGatewayCount: "1",
  teachingGatewayCount: "1",
  identitySessionDbMaxConns: "4",
  identitySessionDbMinConns: sustainedDefaults.identitySessionDbMinConns,
  identitySessionDbPrewarmConns: sustainedDefaults.identitySessionDbPrewarmConns,
  identitySessionDbReadMaxConns: sustainedDefaults.identitySessionDbReadMaxConns,
  identitySessionDbReadMinConns: sustainedDefaults.identitySessionDbReadMinConns,
  identitySessionDbReadPrewarmConns: sustainedDefaults.identitySessionDbReadPrewarmConns,
  identitySessionDbWriteConcurrency: "0",
  identityWarmupOperations: sustainedDefaults.identityWarmupOperations,
  identitySessionAccessCacheMaxEntries: sustainedDefaults.identitySessionAccessCacheMaxEntries,
  identitySessionAccessCacheTtlMs: sustainedDefaults.identitySessionAccessCacheTtlMs,
  identitySessionDbSessionTablePersistence: defaultSessionTablePersistence,
  conversationDbMaxConns: "1",
  teachingDbMaxConns: "1",
  teachingDbMinConns: sustainedDefaults.teachingDbMinConns,
  teachingDbPrewarmConns: sustainedDefaults.teachingDbPrewarmConns,
  conversationWriteBatchSize: "8",
  conversationWriteBatchWorkers: sustainedDefaults.conversationWriteBatchWorkers,
  conversationWriteBatchMode: sustainedDefaults.conversationWriteBatchMode,
  ...conversationFastLaneOptionDefaults,
  conversationClientTrace: sustainedDefaults.conversationClientTrace,
  conversationBenchmarkRuntime: sustainedDefaults.conversationBenchmarkRuntime,
  conversationBenchmarkDockerImage: sustainedDefaults.conversationBenchmarkDockerImage,
  conversationBenchmarkDockerHost: sustainedDefaults.conversationBenchmarkDockerHost,
  conversationBenchmarkWslDistro: sustainedDefaults.conversationBenchmarkWslDistro,
  conversationBenchmarkWslHost: sustainedDefaults.conversationBenchmarkWslHost,
  conversationBenchmarkWslWorkspace: sustainedDefaults.conversationBenchmarkWslWorkspace,
  identityBenchmarkRuntime: sustainedDefaults.identityBenchmarkRuntime,
  identityBenchmarkDockerImage: sustainedDefaults.identityBenchmarkDockerImage,
  identityBenchmarkDockerHost: sustainedDefaults.identityBenchmarkDockerHost,
  identityBenchmarkWslDistro: sustainedDefaults.identityBenchmarkWslDistro,
  identityBenchmarkWslHost: sustainedDefaults.identityBenchmarkWslHost,
  identityBenchmarkWslWorkspace: sustainedDefaults.identityBenchmarkWslWorkspace,
  teachingBenchmarkRuntime: sustainedDefaults.teachingBenchmarkRuntime,
  teachingBenchmarkDockerImage: sustainedDefaults.teachingBenchmarkDockerImage,
  teachingBenchmarkDockerHost: sustainedDefaults.teachingBenchmarkDockerHost,
  teachingBenchmarkWslDistro: sustainedDefaults.teachingBenchmarkWslDistro,
  teachingBenchmarkWslHost: sustainedDefaults.teachingBenchmarkWslHost,
  teachingBenchmarkWslWorkspace: sustainedDefaults.teachingBenchmarkWslWorkspace,
  maxConnsPerHost: "0",
  warmConnectionsPerHost: "0",
  teachingMaxConnsPerHost: sustainedDefaults.teachingMaxConnsPerHost,
  teachingWarmConnectionsPerHost: sustainedDefaults.teachingWarmConnectionsPerHost,
  teachingClientTrace: sustainedDefaults.teachingClientTrace,
  teachingArchiveCreateBatchSize: sustainedDefaults.teachingArchiveCreateBatchSize,
  teachingArchiveCreateBatchDelayMs: sustainedDefaults.teachingArchiveCreateBatchDelayMs,
  teachingArchiveCreateBatchWorkers: sustainedDefaults.teachingArchiveCreateBatchWorkers,
  teachingArchiveCreateBatchMode: sustainedDefaults.teachingArchiveCreateBatchMode,
  teachingQuizSubmissionBatchSize: sustainedDefaults.teachingQuizSubmissionBatchSize,
  teachingQuizSubmissionBatchDelayMs: sustainedDefaults.teachingQuizSubmissionBatchDelayMs,
  teachingQuizSubmissionBatchWorkers: sustainedDefaults.teachingQuizSubmissionBatchWorkers,
  teachingWriteAcceptanceMode: sustainedDefaults.teachingWriteAcceptanceMode,
  teachingCommandLogPath: sustainedDefaults.teachingCommandLogPath,
  teachingCommandLogAppendBatchSize: sustainedDefaults.teachingCommandLogAppendBatchSize,
  teachingCommandLogQueueCapacity: sustainedDefaults.teachingCommandLogQueueCapacity,
  teachingCommandLogProjectionWorkers: sustainedDefaults.teachingCommandLogProjectionWorkers,
  teachingCommandLogSync: sustainedDefaults.teachingCommandLogSync,
  teachingCommandLogSettleTimeoutMs: sustainedDefaults.teachingCommandLogSettleTimeoutMs,
  teachingArchiveListCacheTtlMs: sustainedDefaults.teachingArchiveListCacheTtlMs,
  teachingArchiveListCacheMaxEntries: sustainedDefaults.teachingArchiveListCacheMaxEntries,
  teachingArchiveSchemaIndexProfile: sustainedDefaults.teachingArchiveSchemaIndexProfile,
  identityMaxConnsPerHost: sustainedDefaults.identityMaxConnsPerHost,
  identityWarmConnectionsPerHost: sustainedDefaults.identityWarmConnectionsPerHost,
  identityIngressProxy: sustainedDefaults.identityIngressProxy,
  identityIngressPort: sustainedDefaults.identityIngressPort,
  identityIngressCount: sustainedDefaults.identityIngressCount,
  identityIngressMaxConnsPerHost: sustainedDefaults.identityIngressMaxConnsPerHost,
  identityIngressWarmConnectionsPerHost: sustainedDefaults.identityIngressWarmConnectionsPerHost,
  timeout: "180s",
  teachingTimeoutMs: sustainedDefaults.teachingTimeoutMs,
  startupTimeoutMs: "120000",
  maxP99Ms: "1000",
  maxP99DriftMs: "250",
  pgbouncerDiagnostics: sustainedDefaults.pgbouncerDiagnostics,
  pgbouncerPostgresContainer: sustainedDefaults.pgbouncerPostgresContainer,
  pgbouncerHost: sustainedDefaults.pgbouncerHost,
  pgbouncerPort: sustainedDefaults.pgbouncerPort,
  pgbouncerUser: sustainedDefaults.pgbouncerUser,
  pgbouncerDatabase: sustainedDefaults.pgbouncerDatabase,
  postgresDiagnostics: sustainedDefaults.postgresDiagnostics,
  postgresDiagnosticsContainer: sustainedDefaults.postgresDiagnosticsContainer,
  postgresDiagnosticsHost: sustainedDefaults.postgresDiagnosticsHost,
  postgresDiagnosticsPort: sustainedDefaults.postgresDiagnosticsPort,
  postgresDiagnosticsUser: sustainedDefaults.postgresDiagnosticsUser,
  postgresDiagnosticsDatabase: sustainedDefaults.postgresDiagnosticsDatabase,
  postgresDiagnosticsRelations: sustainedDefaults.postgresDiagnosticsRelations,
  postgresDiagnosticsIntervalMs: sustainedDefaults.postgresDiagnosticsIntervalMs,
  postgresDiagnosticsMaxSamples: sustainedDefaults.postgresDiagnosticsMaxSamples,
  postgresDiagnosticsQueryTimeoutMs: sustainedDefaults.postgresDiagnosticsQueryTimeoutMs,
};

export function parseArgs(argv) {
  const parsed = { ...defaults };
  const explicit = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--") || value === undefined) continue;
    if (key === "--identity-session-db-session-table-persistence") {
      parsed.identitySessionDbSessionTablePersistence = normalizeSessionTablePersistence(value);
      explicit.add("identitySessionDbSessionTablePersistence");
      index += 1;
      continue;
    }
    const property = kebabToCamel(key.slice(2));
    if (Object.hasOwn(parsed, property)) {
      parsed[property] = value;
      explicit.add(property);
      index += 1;
    }
  }
  return applyScaleProfile(parsed, explicit);
}

function applyScaleProfile(options, explicit = new Set()) {
  const scaleProfile = normalizeScaleProfile(options.scaleProfile);
  const resolved = { ...options, scaleProfile };
  const profileDefaults = scaleProfileDefaults[scaleProfile] ?? {};
  for (const [key, value] of Object.entries(profileDefaults)) {
    if (!explicit.has(key)) resolved[key] = value;
  }
  return resolved;
}

export function buildScaleUpSteps(options) {
  return parseStepSpecs(options.steps).map((step, index) => {
    const reportPrefix = `${options.stepPrefix}.${index + 1}-${step.name}`;
    return {
      ...step,
      reportPath: `${reportPrefix}.json`,
      options: {
        ...sustainedDefaults,
        profile: `${options.profile}_${step.name.toUpperCase()}`,
        manageDocker: "false",
        dockerStack: options.dockerStack,
        dockerCleanup: "none",
        out: `${reportPrefix}.json`,
        samplePrefix: reportPrefix,
        samples: options.samples,
        sampleIntervalMs: options.sampleIntervalMs,
        stopOnFailure: options.stopOnFailure,
        identityBaseUrl: options.identityBaseUrl,
        conversationBaseUrl: options.conversationBaseUrl,
        teachingBaseUrl: options.teachingBaseUrl,
        identityDsn: options.identityDsn,
        conversationDsn: options.conversationDsn,
        teachingDsn: options.teachingDsn,
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
        identityWarmupOperations: options.identityWarmupOperations,
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
        identityConcurrency: String(step.identityConcurrency),
        identityOperations: String(step.identityOperations),
        conversationConcurrency: String(step.conversationConcurrency),
        conversationOperations: String(step.conversationOperations),
        teachingConcurrency: String(step.teachingConcurrency),
        teachingOperations: String(step.teachingOperations),
        requireTargetReadWriteRps: options.requireTargetReadWriteRps,
      },
    };
  });
}

export async function runSystemSustainedMixedWorkloadScaleUp(
  options = parseArgs(process.argv.slice(2)),
  dependencies = {},
) {
  const root = dependencies.root ?? process.cwd();
  const runSyncFn = dependencies.runSync ?? runSync;
  const runStepFn = dependencies.runStep ?? runSystemSustainedMixedWorkload;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const setup = [];
  const cleanup = [];
  const runnerErrors = [];
  const steps = buildScaleUpSteps(options);
  const stepReports = [];

  try {
    validateOptions(options, steps);
    removeReports(root, [options.out, ...steps.map((step) => step.reportPath)]);
    if (parseBoolean(options.manageDocker)) {
      setup.push({ phase: "setup-reset", ...runSyncFn("npm", ["run", dockerStackScript(options, "reset")], root) });
      if (setup.at(-1).exitCode !== 0) throw new Error("managed Docker reset failed before sustained scale-up");
      setup.push({ phase: "setup-up", ...runSyncFn("npm", ["run", dockerStackScript(options, "up")], root) });
      if (setup.at(-1).exitCode !== 0) throw new Error("managed Docker setup failed before sustained scale-up");
    }

    for (const step of steps) {
      const report = await runStepFn(step.options, { root });
      stepReports.push({ step, report });
      if (parseBoolean(options.stopOnFailure) && stepBlocksFurtherScale(report, options)) break;
    }
  } catch (error) {
    runnerErrors.push(maskSensitive(error.message));
  } finally {
    if (parseBoolean(options.manageDocker)) {
      cleanup.push(...cleanupDocker(options, root, runSyncFn));
    }
  }

  const endedAt = now();
  const report = buildSystemSustainedMixedWorkloadScaleUpReport({
    options,
    steps,
    stepReports,
    setup,
    cleanup,
    runnerErrors,
    startedAt,
    endedAt,
  });
  writeJsonReport(path.join(root, options.out), report);
  return report;
}

export function buildSystemSustainedMixedWorkloadScaleUpReport({
  options,
  steps,
  stepReports,
  setup = [],
  cleanup = [],
  runnerErrors = [],
  startedAt,
  endedAt,
}) {
  const stepSummaries = steps.map((step) => {
    const report = stepReports.find((entry) => entry.step.name === step.name)?.report;
    return summarizeStep(step, report, options);
  });
  const orchestrationErrors = countCommandErrors(setup) + countCommandErrors(cleanup) + runnerErrors.length;
  const executedSteps = stepSummaries.filter((step) => step.executed);
  const allStepsPassed = executedSteps.length === steps.length &&
    executedSteps.every((step) => step.status === "PASSED" && step.guardrailStatus === "PASSED");
  const summary = summarizeScaleUp(stepSummaries, orchestrationErrors);
  const throughputTarget = summarizeThroughputTarget({ steps: stepSummaries, summary, options });
  const targetBlocks = throughputTarget.required && throughputTarget.status !== "MET";
  const status = orchestrationErrors === 0 && allStepsPassed && !targetBlocks ? "PASSED" : "FAILED";

  return {
    generatedAt: endedAt,
    startedAt,
    endedAt,
    benchmarkKind: "system_sustained_mixed_workload_scale_up",
    workloadType: "SUSTAINED_MIXED_WORKLOAD_SCALE_UP",
    profile: options.profile,
    scaleProfile: normalizeScaleProfile(options.scaleProfile),
    status,
    stopOnFailure: parseBoolean(options.stopOnFailure),
    scaleGuardrails: {
      maxP99Ms: parseInteger(options.maxP99Ms),
      maxP99DriftMs: parseInteger(options.maxP99DriftMs),
      maxTotalErrors: 0,
    },
    concurrencyProfile: {
      identityGatewayCount: parseInteger(options.identityGatewayCount),
      conversationGatewayCount: parseInteger(options.conversationGatewayCount),
      teachingGatewayCount: parseInteger(options.teachingGatewayCount),
      configuredSteps: steps.length,
      samplesPerStep: parseInteger(options.samples),
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
      executor: "LOCAL_NODE_SUSTAINED_SCALEUP_ORCHESTRATOR",
      managedDocker: parseBoolean(options.manageDocker),
      dockerStack: dockerStack(options),
      dockerCleanup: options.dockerCleanup,
    },
    diagnosticsProfile: buildSustainedScaleUpDiagnosticsProfile(options),
    conversationBenchmarkRuntimeProfile: buildSustainedMixedWorkloadConversationBenchmarkRuntimeProfile(options),
    identityBenchmarkRuntimeProfile: buildSustainedMixedWorkloadIdentityBenchmarkRuntimeProfile(options),
    teachingBenchmarkRuntimeProfile: buildSustainedMixedWorkloadTeachingBenchmarkRuntimeProfile(options),
    steps: stepSummaries,
    summary,
    throughputTarget,
    setup: setup.map((entry) => sanitizeCommandResult(entry)),
    cleanup: cleanup.map((entry) => sanitizeCommandResult(entry)),
    runnerErrors,
    nextAction: buildThroughputTargetNextAction(status, throughputTarget),
  };
}

export function formatSystemSustainedMixedWorkloadScaleUp(report) {
  const lines = [
    `System sustained mixed workload scale-up: ${report.status}`,
    `Profile: ${report.profile}`,
    `Scale profile: ${report.scaleProfile ?? "standard"}`,
    `Executed steps: ${report.summary.executedSteps}/${report.summary.configuredSteps}`,
    `Highest passed step: ${report.summary.highestPassedStep ?? "none"}`,
    `First blocked step: ${report.summary.firstBlockedStep ?? "none"}`,
    `Total errors: ${report.summary.totalErrors}`,
    "",
    "Step results:",
  ];
  for (const step of report.steps) {
    lines.push(
      `- ${step.name} ${step.status}/${step.guardrailStatus} readWriteRps=${step.readWriteRps ?? "n/a"} identity=${step.identityConcurrency} conversation=${step.conversationConcurrency} teaching=${step.teachingConcurrency} maxP99=${step.maxP99Ms ?? "n/a"}ms drift=${step.p99DriftMs ?? "n/a"}ms errors=${step.totalErrors}`,
    );
  }
  if (report.throughputTarget?.status && report.throughputTarget.status !== "NOT_CONFIGURED") {
    lines.push(
      "",
      `Target read/write RPS: ${report.throughputTarget.targetReadWriteRps} ${report.throughputTarget.status} attempted=${report.throughputTarget.attempted} highest=${report.throughputTarget.highestPassedReadWriteRps ?? "n/a"} shortfall=${report.throughputTarget.shortfallRps ?? "n/a"}`,
    );
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

export function buildSustainedScaleUpDiagnosticsProfile(options) {
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

function parseStepSpecs(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(parseStepSpec);
}

function parseStepSpec(value) {
  const [
    rawName,
    identityConcurrency,
    identityOperations,
    conversationConcurrency,
    conversationOperations,
    teachingConcurrency,
    teachingOperations,
    targetReadWriteRps,
  ] = value.split(":");
  const name = sanitizeStepName(rawName);
  const step = {
    name,
    identityConcurrency: parseInteger(identityConcurrency),
    identityOperations: parseInteger(identityOperations),
    conversationConcurrency: parseInteger(conversationConcurrency),
    conversationOperations: parseInteger(conversationOperations),
    teachingConcurrency: parseInteger(teachingConcurrency ?? identityConcurrency),
    teachingOperations: parseInteger(teachingOperations ?? identityOperations),
    targetReadWriteRps: parseOptionalInteger(targetReadWriteRps),
  };
  for (const [field, parsed] of Object.entries(step)) {
    if (field === "name") continue;
    if (field === "targetReadWriteRps" && parsed === null) continue;
    if (parsed <= 0) throw new Error(`invalid sustained scale-up step ${value}: ${field} must be a positive integer`);
  }
  return step;
}

function validateOptions(options, steps) {
  if (steps.length === 0) throw new Error("at least one sustained scale-up step is required");
  assertKnownScaleProfile(options.scaleProfile);
  assertNonNegativeInteger(options.targetReadWriteRps, "target-read-write-rps");
  assertPositiveInteger(options.samples, "samples");
  assertNonNegativeInteger(options.sampleIntervalMs, "sample-interval-ms");
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
  assertNonNegativeInteger(options.identityWarmupOperations, "identity-warmup-operations");
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
  assertPositiveInteger(options.maxP99Ms, "max-p99-ms");
  assertPositiveInteger(options.maxP99DriftMs, "max-p99-drift-ms");
  const targetReadWriteRps = resolveTargetReadWriteRps(steps, options);
  const candidateSteps = Number.isFinite(targetReadWriteRps)
    ? targetBearingSteps(steps).filter((step) => step.targetReadWriteRps >= targetReadWriteRps)
    : [];
  assertProductionTargetPressureProfile({
    candidateSteps,
    required: parseBoolean(options.requireTargetReadWriteRps),
    scaleProfile: options.scaleProfile,
    targetReadWriteRps,
  });
}

function conversationWriteBatchMode(options) {
  const normalized = String(options.conversationWriteBatchMode ?? "insert").trim().toLowerCase();
  if (normalized !== "insert" && normalized !== "copy") {
    throw new Error("conversation-write-batch-mode must be insert or copy");
  }
  return normalized;
}

function sanitizeStepName(value) {
  const name = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/gu, "-");
  if (!name) throw new Error("sustained scale-up step name is required");
  return name;
}

function assertKnownScaleProfile(value) {
  const scaleProfile = normalizeScaleProfile(value);
  if (!Object.hasOwn(scaleProfileDefaults, scaleProfile)) {
    throw new Error(`scale-profile must be one of ${scaleProfileNames().join(",")}`);
  }
}

function identitySessionTablePersistence(options) {
  return normalizeSessionTablePersistence(options.identitySessionDbSessionTablePersistence);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runSystemSustainedMixedWorkloadScaleUp();
  console.log(formatSystemSustainedMixedWorkloadScaleUp(report));
  process.exit(report.status === "PASSED" ? 0 : 1);
}
