import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { assertNonNegativeInteger, assertPositiveInteger, countCommandErrors, kebabToCamel, maskSensitive, parseBoolean, parseInteger, readOptionalJson, removeReports, sanitizeCommandLine, sanitizeCommandResult, tailText, toRunnableCommand, writeJsonReport } from "./benchmark-runner-utils.mjs";
import {
  defaultSessionTablePersistence,
  normalizeSessionTablePersistence,
} from "./identity-http-benchmark-session-profile.mjs";
import { benchmarkRuntimeDefaults } from "./conversation-benchmark-runtime.mjs";
import { systemConversationBenchmarkRuntime } from "./system-conversation-benchmark-runtime-profile.mjs";
import {
  buildSystemIdentityBenchmarkRuntimeProfile,
  systemIdentityBenchmarkRuntimeArgs,
  systemIdentityBenchmarkRuntime,
} from "./system-identity-benchmark-runtime-profile.mjs";
import {
  assertSystemTeachingBenchmarkOptions,
  systemTeachingBenchmarkDefaults,
  systemTeachingBenchmarkRuntimeArgs,
  teachingQuizSubmissionBatchDelayMs,
  teachingQuizSubmissionBatchSize,
  teachingQuizSubmissionBatchWorkers,
} from "./system-teaching-benchmark-runtime-profile.mjs";
import { portRange, portSequence } from "./system-port-profile.mjs";
import { postgresDiagnosticsDefaults } from "./postgres-diagnostics.mjs";
import { assertConversationFastLaneOptions, conversationFastLaneArgs, conversationFastLaneOptionDefaults, conversationFastLaneProfile } from "./conversation-fast-lane-options.mjs";
import {
  runWorkloadCommand,
  summarizeMixedWorkload,
  summarizeWorkload,
} from "./run-system-mixed-workload-benchmark-helpers.mjs";
import {
  assertPostgresDsn,
  buildMixedWorkloadConversationBenchmarkRuntimeProfile,
  buildMixedWorkloadIdentityIngressProfile,
  buildMixedWorkloadPersistenceProfile,
  buildMixedWorkloadTeachingBenchmarkRuntimeProfile,
  buildMixedWorkloadTransportProfile,
  dockerStack,
  dockerStackScript,
  identityMaxConnsPerHost,
  identityWarmConnectionsPerHost,
} from "./run-system-mixed-workload-benchmark-profiles.mjs";

export {
  buildMixedWorkloadConversationBenchmarkRuntimeProfile,
  buildMixedWorkloadIdentityIngressProfile,
  buildMixedWorkloadPersistenceProfile,
  buildMixedWorkloadTeachingBenchmarkRuntimeProfile,
  buildMixedWorkloadTransportProfile,
  dockerStack,
  dockerStackScript,
};

export const defaultPersistenceDsn = "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable";

export const defaults = {
  out: "reports/system-mixed-workload-benchmark.current.json",
  profile: "SMOKE",
  manageDocker: "false",
  dockerStack: "identity-session",
  dockerCleanup: "down",
  identityOut: "reports/system-mixed-workload.identity-http-smoke.json",
  conversationOut: "reports/system-mixed-workload.conversation-write-smoke.json",
  teachingOut: "reports/system-mixed-workload.teaching-archive-smoke.json",
  knowledgeOut: "reports/system-mixed-workload.knowledge-retrieval-smoke.json",
  aiAdmissionOut: "reports/system-mixed-workload.ai-worker-admission-smoke.json",
  identityBaseUrl: "http://127.0.0.1:18300",
  conversationBaseUrl: "http://127.0.0.1:18400",
  teachingBaseUrl: "http://127.0.0.1:18500",
  identityDsn: defaultPersistenceDsn,
  conversationDsn: defaultPersistenceDsn,
  teachingDsn: defaultPersistenceDsn,
  identityConcurrency: "16",
  identityOperations: "40",
  identityWarmupOperations: "0",
  conversationConcurrency: "64",
  conversationOperations: "128",
  teachingConcurrency: "8",
  teachingOperations: "24",
  identityGatewayCount: "1",
  conversationGatewayCount: "1",
  teachingGatewayCount: "1",
  identitySessionDbMaxConns: "8",
  identitySessionDbMinConns: "0",
  identitySessionDbPrewarmConns: "1",
  identitySessionDbReadMaxConns: "0",
  identitySessionDbReadMinConns: "0",
  identitySessionDbReadPrewarmConns: "0",
  identitySessionDbWriteConcurrency: "0",
  identitySessionAccessCacheMaxEntries: "0",
  identitySessionAccessCacheTtlMs: "30000",
  identitySessionDbSessionTablePersistence: defaultSessionTablePersistence,
  conversationDbMaxConns: "4",
  teachingDbMaxConns: "2",
  teachingDbMinConns: "0",
  teachingDbPrewarmConns: "1",
  conversationWriteBatchSize: "32",
  conversationWriteBatchWorkers: "1",
  conversationWriteBatchMode: "insert",
  ...conversationFastLaneOptionDefaults,
  conversationClientTrace: "false",
  conversationBenchmarkRuntime: benchmarkRuntimeDefaults.benchmarkRuntime,
  conversationBenchmarkDockerImage: benchmarkRuntimeDefaults.benchmarkDockerImage,
  conversationBenchmarkDockerHost: benchmarkRuntimeDefaults.benchmarkDockerHost,
  conversationBenchmarkWslDistro: benchmarkRuntimeDefaults.benchmarkWslDistro,
  conversationBenchmarkWslHost: benchmarkRuntimeDefaults.benchmarkWslHost,
  conversationBenchmarkWslWorkspace: benchmarkRuntimeDefaults.benchmarkWslWorkspace,
  identityBenchmarkRuntime: "local",
  identityBenchmarkDockerImage: benchmarkRuntimeDefaults.benchmarkDockerImage,
  identityBenchmarkDockerHost: benchmarkRuntimeDefaults.benchmarkDockerHost,
  identityBenchmarkWslDistro: benchmarkRuntimeDefaults.benchmarkWslDistro,
  identityBenchmarkWslHost: benchmarkRuntimeDefaults.benchmarkWslHost,
  identityBenchmarkWslWorkspace: benchmarkRuntimeDefaults.benchmarkWslWorkspace,
  ...systemTeachingBenchmarkDefaults,
  maxConnsPerHost: "0",
  warmConnectionsPerHost: "0",
  identityMaxConnsPerHost: "",
  identityWarmConnectionsPerHost: "",
  identityIngressProxy: "false",
  identityIngressPort: "18080",
  identityIngressCount: "1",
  identityIngressMaxConnsPerHost: "0",
  identityIngressWarmConnectionsPerHost: "0",
  timeout: "180s",
  teachingTimeoutMs: "10000",
  startupTimeoutMs: "120000",
  pgbouncerDiagnostics: "false",
  pgbouncerPostgresContainer: "ita-identity-session-postgres",
  pgbouncerHost: "identity-session-pgbouncer",
  pgbouncerPort: "6432",
  pgbouncerUser: "app_user",
  pgbouncerDatabase: "pgbouncer",
  ...postgresDiagnosticsDefaults,
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

export function buildWorkloadCommands(options) {
  return [
    {
      name: "identity_http",
      moduleSlice: "Identity And Access",
      sourceReportPath: options.identityOut,
      command: process.execPath,
      args: [
        "tools/run-identity-http-benchmark.mjs",
        "--dsn",
        options.identityDsn,
        "--base-url",
        options.identityBaseUrl,
        "--gateway-count",
        options.identityGatewayCount,
        "--session-db-max-conns",
        options.identitySessionDbMaxConns,
        "--session-db-min-conns",
        options.identitySessionDbMinConns,
        "--session-db-prewarm-conns",
        options.identitySessionDbPrewarmConns,
        "--session-db-read-max-conns",
        options.identitySessionDbReadMaxConns,
        "--session-db-read-min-conns",
        options.identitySessionDbReadMinConns,
        "--session-db-read-prewarm-conns",
        options.identitySessionDbReadPrewarmConns,
        "--session-db-write-concurrency",
        options.identitySessionDbWriteConcurrency,
        "--session-access-cache-max-entries",
        options.identitySessionAccessCacheMaxEntries,
        "--session-access-cache-ttl-ms",
        options.identitySessionAccessCacheTtlMs,
        "--session-db-session-table-persistence",
        identitySessionTablePersistence(options),
        "--concurrency",
        options.identityConcurrency,
        "--operations",
        options.identityOperations,
        "--warmup-operations",
        options.identityWarmupOperations,
        "--max-conns-per-host",
        identityMaxConnsPerHost(options),
        "--warm-connections-per-host",
        identityWarmConnectionsPerHost(options),
        "--ingress-proxy",
        options.identityIngressProxy,
        "--ingress-port",
        options.identityIngressPort,
        "--ingress-count",
        options.identityIngressCount,
        "--ingress-max-conns-per-host",
        options.identityIngressMaxConnsPerHost,
        "--ingress-warm-connections-per-host",
        options.identityIngressWarmConnectionsPerHost,
        ...systemIdentityBenchmarkRuntimeArgs(options),
        "--out",
        options.identityOut,
        "--timeout",
        options.timeout,
        "--startup-timeout-ms",
        options.startupTimeoutMs,
        ...sharedDatabaseDiagnosticsArgs(options),
      ],
    },
    {
      name: "conversation_write",
      moduleSlice: "Research Conversation Write",
      sourceReportPath: options.conversationOut,
      command: process.execPath,
      args: [
        "tools/run-conversation-write-benchmark.mjs",
        "--dsn",
        options.conversationDsn,
        "--base-url",
        options.conversationBaseUrl,
        "--gateway-count",
        options.conversationGatewayCount,
        "--db-max-conns",
        options.conversationDbMaxConns,
        "--write-batch-size",
        options.conversationWriteBatchSize,
        "--write-batch-delay-ms",
        "0",
        "--write-batch-workers",
        options.conversationWriteBatchWorkers,
        "--write-batch-mode",
        options.conversationWriteBatchMode,
        ...conversationFastLaneArgs(options),
        "--benchmark-runtime",
        systemConversationBenchmarkRuntime(options),
        "--benchmark-docker-image",
        options.conversationBenchmarkDockerImage,
        "--benchmark-docker-host",
        options.conversationBenchmarkDockerHost,
        "--benchmark-wsl-distro",
        options.conversationBenchmarkWslDistro,
        "--benchmark-wsl-host",
        options.conversationBenchmarkWslHost,
        "--benchmark-wsl-workspace",
        options.conversationBenchmarkWslWorkspace,
        "--agent-api-key",
        "ueacd",
        "--concurrency",
        options.conversationConcurrency,
        "--operations",
        options.conversationOperations,
        "--max-conns-per-host",
        options.maxConnsPerHost,
        "--warm-connections-per-host",
        options.warmConnectionsPerHost,
        "--client-trace",
        options.conversationClientTrace,
        "--out",
        options.conversationOut,
        "--timeout",
        options.timeout,
        "--startup-timeout-ms",
        options.startupTimeoutMs,
        ...sharedDatabaseDiagnosticsArgs(options),
      ],
    },
    {
      name: "teaching_archive",
      moduleSlice: "Teaching Archive And Quiz",
      sourceReportPath: options.teachingOut,
      command: process.execPath,
      args: [
        "tools/run-teaching-archive-benchmark.mjs",
        "--dsn",
        options.teachingDsn,
        "--base-url",
        options.teachingBaseUrl,
        "--gateway-count",
        options.teachingGatewayCount,
        "--db-max-conns",
        options.teachingDbMaxConns,
        "--db-min-conns",
        options.teachingDbMinConns,
        "--db-prewarm-conns",
        options.teachingDbPrewarmConns,
        "--agent-api-key",
        "ueacd",
        "--concurrency",
        options.teachingConcurrency,
        "--operations",
        options.teachingOperations,
        ...systemTeachingBenchmarkRuntimeArgs(options),
        "--out",
        options.teachingOut,
        "--timeout",
        options.timeout,
        "--timeout-ms",
        options.teachingTimeoutMs,
        "--startup-timeout-ms",
        options.startupTimeoutMs,
        ...sharedDatabaseDiagnosticsArgs(options),
      ],
    },
    {
      name: "knowledge_retrieval",
      moduleSlice: "Knowledge Retrieval",
      sourceReportPath: options.knowledgeOut,
      command: process.execPath,
      args: ["tools/knowledge-retrieval-benchmark-audit.mjs", "--out", options.knowledgeOut],
    },
    {
      name: "ai_worker_admission",
      moduleSlice: "AI Worker Admission",
      sourceReportPath: options.aiAdmissionOut,
      command: process.execPath,
      args: ["tools/ai-worker-job-admission.mjs", "--out", options.aiAdmissionOut],
    },
  ];
}

export async function runSystemMixedWorkloadBenchmark(options = parseArgs(process.argv.slice(2)), dependencies = {}) {
  const root = dependencies.root ?? process.cwd();
  const runCommandFn = dependencies.runCommand ?? runCommand;
  const runSyncFn = dependencies.runSync ?? runSync;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const setup = [];
  const cleanup = [];
  const runnerErrors = [];
  let results = [];
  const commands = buildWorkloadCommands(options);

  validateOptions(options);
  removeReports(root, [options.out, ...commands.map((command) => command.sourceReportPath)]);
  try {
    if (parseBoolean(options.manageDocker)) {
      setup.push({ phase: "setup", ...runSyncFn("npm", ["run", dockerStackScript(options, "up")], root) });
      if (setup.at(-1).exitCode !== 0) {
        throw new Error("managed Docker setup failed before mixed workload execution");
      }
    }
    results = await Promise.all(commands.map((command) => runWorkloadCommand(command, root, runCommandFn)));
  } catch (error) {
    runnerErrors.push(maskSensitive(error.message));
  } finally {
    if (parseBoolean(options.manageDocker)) {
      cleanup.push(...cleanupDocker(options, root, runSyncFn));
    }
  }
  const endedAt = now();
  const childReports = Object.fromEntries(commands.map((command) => [
    command.name,
    readOptionalJson(root, command.sourceReportPath),
  ]));
  const report = buildSystemMixedWorkloadReport({
    options,
    commands,
    results,
    childReports,
    setup,
    cleanup,
    runnerErrors,
    startedAt,
    endedAt,
  });
  writeJsonReport(path.join(root, options.out), report);
  return report;
}

export function buildSystemMixedWorkloadReport({
  options,
  commands,
  results,
  childReports,
  setup = [],
  cleanup = [],
  runnerErrors = [],
  startedAt,
  endedAt,
}) {
  const workloads = commands.map((command) => summarizeWorkload(
    command,
    results.find((result) => result.name === command.name),
    childReports[command.name],
  ));
  const orchestrationErrors = countCommandErrors(setup) + countCommandErrors(cleanup) + runnerErrors.length;
  const status = orchestrationErrors === 0 &&
    workloads.every((workload) => workload.status === "PASSED" || workload.status === "READY")
    ? "PASSED"
    : "FAILED";
  const workloadErrors = workloads.reduce((total, workload) => total + workload.errors, 0);
  return {
    generatedAt: endedAt,
    startedAt,
    endedAt,
    benchmarkKind: "system_mixed_workload",
    workloadType: "MIXED_WORKLOAD",
    profile: options.profile,
    status,
    concurrencyProfile: {
      identityConcurrency: parseInteger(options.identityConcurrency),
      conversationConcurrency: parseInteger(options.conversationConcurrency),
      teachingConcurrency: parseInteger(options.teachingConcurrency),
      identityGatewayCount: parseInteger(options.identityGatewayCount),
      conversationGatewayCount: parseInteger(options.conversationGatewayCount),
      teachingGatewayCount: parseInteger(options.teachingGatewayCount),
    },
    transportProfile: buildMixedWorkloadTransportProfile(options),
    identityIngressProfile: buildMixedWorkloadIdentityIngressProfile(options),
    persistenceProfile: buildMixedWorkloadPersistenceProfile(options),
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
      executor: "LOCAL_NODE_ORCHESTRATOR",
      managedDocker: parseBoolean(options.manageDocker),
      dockerStack: dockerStack(options),
      dockerCleanup: options.dockerCleanup,
    },
    diagnosticsProfile: buildDiagnosticsProfile(options),
    conversationBenchmarkRuntimeProfile: buildMixedWorkloadConversationBenchmarkRuntimeProfile(options),
    identityBenchmarkRuntimeProfile: buildSystemIdentityBenchmarkRuntimeProfile(options),
    teachingBenchmarkRuntimeProfile: buildMixedWorkloadTeachingBenchmarkRuntimeProfile(options),
    workloads,
    summary: summarizeMixedWorkload(workloads, orchestrationErrors),
    setup: setup.map((entry) => sanitizeCommandResult(entry)),
    cleanup: cleanup.map((entry) => sanitizeCommandResult(entry)),
    runnerErrors,
    sourceCommands: commands.map((command) => ({
      name: command.name,
      moduleSlice: command.moduleSlice,
      sourceReportPath: command.sourceReportPath,
      command: sanitizeCommandLine(command),
    })),
    errors: workloadErrors + orchestrationErrors,
    nextAction: status === "PASSED"
      ? "Treat this as mixed workload smoke evidence only; increase duration, concurrency, and root workflow coverage before promoting full-system ultra-concurrency."
      : "Fix the failed mixed workload slice before using it for system capacity claims.",
  };
}

export function formatSystemMixedWorkloadBenchmark(report) {
  const lines = [
    `System mixed workload benchmark: ${report.status}`,
    `Profile: ${report.profile}`,
    `Workloads: ${report.workloads.length}`,
    `Total errors: ${report.summary.totalErrors}`,
    "",
    "Workload results:",
  ];
  for (const workload of report.workloads) {
    lines.push(`- ${workload.name} ${workload.status} p95=${workload.p95Ms ?? "n/a"}ms p99=${workload.p99Ms ?? "n/a"}ms errors=${workload.errors}`);
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function validateOptions(options) {
  assertPositiveInteger(options.identityConcurrency, "identity-concurrency");
  assertPositiveInteger(options.identityOperations, "identity-operations");
  assertNonNegativeInteger(options.identityWarmupOperations, "identity-warmup-operations");
  assertPositiveInteger(options.conversationConcurrency, "conversation-concurrency");
  assertPositiveInteger(options.conversationOperations, "conversation-operations");
  assertPositiveInteger(options.teachingConcurrency, "teaching-concurrency");
  assertPositiveInteger(options.teachingOperations, "teaching-operations");
  assertPostgresDsn(options.identityDsn, "identity-dsn");
  assertPostgresDsn(options.conversationDsn, "conversation-dsn");
  assertPostgresDsn(options.teachingDsn, "teaching-dsn");
  dockerStack(options);
  assertPositiveInteger(options.identityGatewayCount, "identity-gateway-count");
  assertPositiveInteger(options.conversationGatewayCount, "conversation-gateway-count");
  assertPositiveInteger(options.teachingGatewayCount, "teaching-gateway-count");
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
  systemConversationBenchmarkRuntime(options);
  systemIdentityBenchmarkRuntime(options);
  assertSystemTeachingBenchmarkOptions(options);
  assertPositiveInteger(options.teachingTimeoutMs, "teaching-timeout-ms");
  validateSharedDatabaseDiagnosticsOptions(options);
  if (parseBoolean(options.identityIngressProxy)) {
    assertPositiveInteger(options.identityIngressCount, "identity-ingress-count");
  }
  assertNoPortOverlap(options);
}

function conversationWriteBatchMode(options) {
  const normalized = String(options.conversationWriteBatchMode ?? "insert").trim().toLowerCase();
  if (normalized !== "insert" && normalized !== "copy") {
    throw new Error("conversation-write-batch-mode must be insert or copy");
  }
  return normalized;
}

function sharedDatabaseDiagnosticsArgs(options) {
  return [
    "--pgbouncer-diagnostics",
    options.pgbouncerDiagnostics,
    "--pgbouncer-postgres-container",
    options.pgbouncerPostgresContainer,
    "--pgbouncer-host",
    options.pgbouncerHost,
    "--pgbouncer-port",
    options.pgbouncerPort,
    "--pgbouncer-user",
    options.pgbouncerUser,
    "--pgbouncer-database",
    options.pgbouncerDatabase,
    "--postgres-diagnostics",
    options.postgresDiagnostics,
    "--postgres-diagnostics-container",
    options.postgresDiagnosticsContainer,
    "--postgres-diagnostics-host",
    options.postgresDiagnosticsHost,
    "--postgres-diagnostics-port",
    options.postgresDiagnosticsPort,
    "--postgres-diagnostics-user",
    options.postgresDiagnosticsUser,
    "--postgres-diagnostics-database",
    options.postgresDiagnosticsDatabase,
    "--postgres-diagnostics-interval-ms",
    options.postgresDiagnosticsIntervalMs,
    "--postgres-diagnostics-max-samples",
    options.postgresDiagnosticsMaxSamples,
    "--postgres-diagnostics-query-timeout-ms",
    options.postgresDiagnosticsQueryTimeoutMs,
    ...optionalPostgresDiagnosticsRelationsArgs(options),
  ];
}

function optionalPostgresDiagnosticsRelationsArgs(options) {
  const relations = String(options.postgresDiagnosticsRelations ?? "").trim();
  return relations === "" ? [] : ["--postgres-diagnostics-relations", relations];
}

function buildDiagnosticsProfile(options) {
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

function validateSharedDatabaseDiagnosticsOptions(options) {
  assertPositiveInteger(options.pgbouncerPort, "pgbouncer-port");
  assertPositiveInteger(options.postgresDiagnosticsPort, "postgres-diagnostics-port");
  assertPositiveInteger(options.postgresDiagnosticsIntervalMs, "postgres-diagnostics-interval-ms");
  assertPositiveInteger(options.postgresDiagnosticsMaxSamples, "postgres-diagnostics-max-samples");
  assertPositiveInteger(options.postgresDiagnosticsQueryTimeoutMs, "postgres-diagnostics-query-timeout-ms");
}

function assertNoPortOverlap(options) {
  const identityPorts = portRange(options.identityBaseUrl, parseInteger(options.identityGatewayCount), "identity-base-url");
  const identityIngressPorts = parseBoolean(options.identityIngressProxy)
    ? portSequence(options.identityIngressPort, parseInteger(options.identityIngressCount), "identity-ingress-port")
    : [];
  const conversationPorts = portRange(
    options.conversationBaseUrl,
    parseInteger(options.conversationGatewayCount),
    "conversation-base-url",
  );
  const teachingPorts = portRange(
    options.teachingBaseUrl,
    parseInteger(options.teachingGatewayCount),
    "teaching-base-url",
  );
  const overlap = identityPorts
    .filter((port) =>
      identityIngressPorts.includes(port) || conversationPorts.includes(port) || teachingPorts.includes(port))
    .concat(identityIngressPorts.filter((port) =>
      conversationPorts.includes(port) || teachingPorts.includes(port)))
    .concat(conversationPorts.filter((port) => teachingPorts.includes(port)));
  if (overlap.length > 0) {
    throw new Error(`mixed workload gateway port overlap: ${[...new Set(overlap)].join(", ")}`);
  }
}

function cleanupDocker(options, root, runSyncFn) {
  if (options.dockerCleanup === "none") return [];
  const script = dockerStackScript(options, options.dockerCleanup === "reset" ? "reset" : "down");
  return [{ phase: "cleanup", ...runSyncFn("npm", ["run", script], root) }];
}

function runSync(command, args, root) {
  const startedAt = Date.now();
  const runnable = toRunnableCommand(command, args);
  const result = spawnSync(runnable.command, runnable.args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  return {
    command,
    args,
    exitCode: result.status ?? 1,
    elapsedMs: Date.now() - startedAt,
    outputTail: tailText(maskSensitive(`${result.stdout ?? ""}${result.stderr ?? ""}`), 40),
    error: result.error?.message,
  };
}

function runCommand(command, args, root) {
  const startedAt = Date.now();
  const runnable = toRunnableCommand(command, args);
  return new Promise((resolve) => {
    const child = spawn(runnable.command, runnable.args, {
      cwd: root,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout?.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { output += chunk.toString(); });
    child.on("error", (error) => {
      resolve({
        exitCode: 1,
        elapsedMs: Date.now() - startedAt,
        outputTail: tailText(maskSensitive(output), 80),
        error: error.message,
      });
    });
    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        elapsedMs: Date.now() - startedAt,
        outputTail: tailText(maskSensitive(output), 80),
      });
    });
  });
}

function identitySessionTablePersistence(options) { return normalizeSessionTablePersistence(options.identitySessionDbSessionTablePersistence); }

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runSystemMixedWorkloadBenchmark();
  console.log(formatSystemMixedWorkloadBenchmark(report));
  process.exit(report.status === "PASSED" ? 0 : 1);
}
