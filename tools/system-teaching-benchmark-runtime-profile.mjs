import { benchmarkRuntimeDefaults } from "./conversation-benchmark-runtime.mjs";

export const systemTeachingBenchmarkDefaults = {
  teachingBenchmarkRuntime: "js",
  teachingBenchmarkDockerImage: benchmarkRuntimeDefaults.benchmarkDockerImage,
  teachingBenchmarkDockerHost: benchmarkRuntimeDefaults.benchmarkDockerHost,
  teachingBenchmarkWslDistro: benchmarkRuntimeDefaults.benchmarkWslDistro,
  teachingBenchmarkWslHost: benchmarkRuntimeDefaults.benchmarkWslHost,
  teachingBenchmarkWslWorkspace: benchmarkRuntimeDefaults.benchmarkWslWorkspace,
  teachingMaxConnsPerHost: "",
  teachingWarmConnectionsPerHost: "",
  teachingClientTrace: "false",
  teachingArchiveCreateBatchSize: "1",
  teachingArchiveCreateBatchDelayMs: "0",
  teachingArchiveCreateBatchWorkers: "1",
  teachingArchiveCreateBatchMode: "insert",
  teachingQuizSubmissionBatchSize: "",
  teachingQuizSubmissionBatchDelayMs: "",
  teachingQuizSubmissionBatchWorkers: "",
  teachingWriteAcceptanceMode: "sync",
  teachingCommandLogPath: "",
  teachingCommandLogAppendBatchSize: "64",
  teachingCommandLogQueueCapacity: "65536",
  teachingCommandLogProjectionWorkers: "4",
  teachingCommandLogSync: "true",
  teachingCommandLogSettleTimeoutMs: "0",
  teachingArchiveListCacheTtlMs: "0",
  teachingArchiveListCacheMaxEntries: "1024",
  teachingArchiveSchemaIndexProfile: "full",
};

export function systemTeachingBenchmarkRuntime(options) {
  const runtime = String(options.teachingBenchmarkRuntime ?? "").toLowerCase();
  if (["js", "local", "docker", "wsl"].includes(runtime)) return runtime;
  throw new Error("teaching-benchmark-runtime must be js, local, docker, or wsl");
}

export function buildSystemTeachingBenchmarkRuntimeProfile(options) {
  const runtime = systemTeachingBenchmarkRuntime(options);
  return {
    runtime,
    executor: systemTeachingBenchmarkRuntimeExecutor(runtime),
    dockerImage: runtime === "docker" ? options.teachingBenchmarkDockerImage : null,
    dockerHostAlias: runtime === "docker" ? options.teachingBenchmarkDockerHost : null,
    wslDistro: runtime === "wsl" ? options.teachingBenchmarkWslDistro : null,
    wslHostAlias: runtime === "wsl" ? options.teachingBenchmarkWslHost : null,
    wslWorkspace: runtime === "wsl" ? optionOrFallback(options.teachingBenchmarkWslWorkspace, null) : null,
  };
}

export function systemTeachingBenchmarkRuntimeArgs(options) {
  return [
    "--benchmark-runtime",
    systemTeachingBenchmarkRuntime(options),
    "--benchmark-docker-image",
    options.teachingBenchmarkDockerImage,
    "--benchmark-docker-host",
    options.teachingBenchmarkDockerHost,
    "--benchmark-wsl-distro",
    options.teachingBenchmarkWslDistro,
    "--benchmark-wsl-host",
    options.teachingBenchmarkWslHost,
    "--benchmark-wsl-workspace",
    options.teachingBenchmarkWslWorkspace,
    "--max-conns-per-host",
    teachingMaxConnsPerHost(options),
    "--warm-connections-per-host",
    teachingWarmConnectionsPerHost(options),
    "--client-trace",
    options.teachingClientTrace,
    "--archive-create-batch-size",
    options.teachingArchiveCreateBatchSize,
    "--archive-create-batch-delay-ms",
    options.teachingArchiveCreateBatchDelayMs,
    "--archive-create-batch-workers",
    options.teachingArchiveCreateBatchWorkers,
    "--archive-create-batch-mode",
    options.teachingArchiveCreateBatchMode,
    "--quiz-submission-batch-size",
    teachingQuizSubmissionBatchSize(options),
    "--quiz-submission-batch-delay-ms",
    teachingQuizSubmissionBatchDelayMs(options),
    "--quiz-submission-batch-workers",
    teachingQuizSubmissionBatchWorkers(options),
    "--teaching-write-acceptance-mode",
    teachingWriteAcceptanceMode(options),
    "--teaching-command-log-path",
    options.teachingCommandLogPath,
    "--teaching-command-log-append-batch-size",
    options.teachingCommandLogAppendBatchSize,
    "--teaching-command-log-queue-capacity",
    options.teachingCommandLogQueueCapacity,
    "--teaching-command-log-projection-workers",
    options.teachingCommandLogProjectionWorkers,
    "--teaching-command-log-sync",
    options.teachingCommandLogSync,
    "--teaching-command-log-settle-timeout-ms",
    options.teachingCommandLogSettleTimeoutMs,
    "--archive-list-cache-ttl-ms",
    options.teachingArchiveListCacheTtlMs,
    "--archive-list-cache-max-entries",
    options.teachingArchiveListCacheMaxEntries,
    "--archive-schema-index-profile",
    options.teachingArchiveSchemaIndexProfile,
  ];
}

export function buildSystemTeachingTransportProfile(options) {
  return {
    teachingMaxConnsPerHost: parseInteger(teachingMaxConnsPerHost(options)),
    teachingWarmConnectionsPerHost: parseInteger(teachingWarmConnectionsPerHost(options)),
    teachingClientTrace: parseBoolean(options.teachingClientTrace),
    teachingArchiveCreateBatchSize: parseInteger(options.teachingArchiveCreateBatchSize),
    teachingArchiveCreateBatchDelayMs: parseInteger(options.teachingArchiveCreateBatchDelayMs),
    teachingArchiveCreateBatchWorkers: parseInteger(options.teachingArchiveCreateBatchWorkers),
    teachingArchiveCreateBatchMode: archiveCreateBatchMode(options.teachingArchiveCreateBatchMode),
    teachingQuizSubmissionBatchSize: parseInteger(teachingQuizSubmissionBatchSize(options)),
    teachingQuizSubmissionBatchDelayMs: parseInteger(teachingQuizSubmissionBatchDelayMs(options)),
    teachingQuizSubmissionBatchWorkers: parseInteger(teachingQuizSubmissionBatchWorkers(options)),
    teachingWriteAcceptanceMode: teachingWriteAcceptanceMode(options),
    teachingCommandLogAppendBatchSize: parseInteger(options.teachingCommandLogAppendBatchSize),
    teachingCommandLogQueueCapacity: parseInteger(options.teachingCommandLogQueueCapacity),
    teachingCommandLogProjectionWorkers: parseInteger(options.teachingCommandLogProjectionWorkers),
    teachingCommandLogSync: parseBoolean(options.teachingCommandLogSync),
    teachingCommandLogSettleTimeoutMs: parseInteger(options.teachingCommandLogSettleTimeoutMs),
    teachingArchiveListCacheTtlMs: parseInteger(options.teachingArchiveListCacheTtlMs),
    teachingArchiveListCacheMaxEntries: parseInteger(options.teachingArchiveListCacheMaxEntries),
    teachingArchiveSchemaIndexProfile: archiveSchemaIndexProfile(options.teachingArchiveSchemaIndexProfile),
  };
}

export function assertSystemTeachingBenchmarkOptions(options) {
  systemTeachingBenchmarkRuntime(options);
  assertNonNegativeInteger(teachingMaxConnsPerHost(options), "teaching-max-conns-per-host");
  assertNonNegativeInteger(teachingWarmConnectionsPerHost(options), "teaching-warm-connections-per-host");
  assertNonNegativeInteger(options.teachingArchiveCreateBatchSize, "teaching-archive-create-batch-size");
  assertNonNegativeInteger(options.teachingArchiveCreateBatchDelayMs, "teaching-archive-create-batch-delay-ms");
  assertPositiveInteger(options.teachingArchiveCreateBatchWorkers, "teaching-archive-create-batch-workers");
  assertArchiveCreateBatchMode(options.teachingArchiveCreateBatchMode, "teaching-archive-create-batch-mode");
  assertNonNegativeInteger(teachingQuizSubmissionBatchSize(options), "teaching-quiz-submission-batch-size");
  assertNonNegativeInteger(teachingQuizSubmissionBatchDelayMs(options), "teaching-quiz-submission-batch-delay-ms");
  assertPositiveInteger(teachingQuizSubmissionBatchWorkers(options), "teaching-quiz-submission-batch-workers");
  teachingWriteAcceptanceMode(options);
  assertPositiveInteger(options.teachingCommandLogAppendBatchSize, "teaching-command-log-append-batch-size");
  assertPositiveInteger(options.teachingCommandLogQueueCapacity, "teaching-command-log-queue-capacity");
  assertPositiveInteger(options.teachingCommandLogProjectionWorkers, "teaching-command-log-projection-workers");
  assertNonNegativeInteger(options.teachingCommandLogSettleTimeoutMs, "teaching-command-log-settle-timeout-ms");
  assertNonNegativeInteger(options.teachingArchiveListCacheTtlMs, "teaching-archive-list-cache-ttl-ms");
  assertPositiveInteger(options.teachingArchiveListCacheMaxEntries, "teaching-archive-list-cache-max-entries");
  assertArchiveSchemaIndexProfile(options.teachingArchiveSchemaIndexProfile, "teaching-archive-schema-index-profile");
}

export function summarizeTeachingArchiveReport(report) {
  const phases = Object.values(report.phases ?? {});
  const p95Values = phases.map((phase) => numberOrNull(phase.latencyMs?.p95)).filter(Number.isFinite);
  const p99Values = phases.map((phase) => numberOrNull(phase.latencyMs?.p99)).filter(Number.isFinite);
  const phaseErrors = phases.reduce((total, phase) => total + numberOrZero(phase.errors), 0);
  const reportedErrors = numberOrNull(report.summary?.totalErrors);
  const errors = Number.isFinite(reportedErrors) ? reportedErrors : fallbackFailedErrors(report.status, phaseErrors);
  const handlerP99Ms = maxFinite(phases.map((phase) => numberOrNull(phase.serverTimingBreakdownMs?.handler?.p99)));
  const preUsecaseP99Ms = maxFinite(phases.map((phase) => numberOrNull(phase.serverTimingBreakdownMs?.["pre.usecase"]?.p99)));
  const appP99Ms = maxFinite(phases.map((phase) => numberOrNull(phase.serverTimingMs?.p99)));
  return {
    errors,
    p95Ms: p95Values.length ? Math.max(...p95Values) : null,
    p99Ms: p99Values.length ? Math.max(...p99Values) : null,
    rps: minFinite(phases.map((phase) => numberOrNull(phase.rps))),
    concurrency: numberOrNull(report.concurrency),
    serverTimingP99Ms: appP99Ms,
    handlerP99Ms,
    preUsecaseP99Ms,
    appP99Ms,
    dbBatchWaitP99Ms: maxFinite(phases.map((phase) => numberOrNull(phase.serverTimingBreakdownMs?.["db.batch_wait"]?.p99))),
    dbAcquireP99Ms: maxFinite(phases.map((phase) => numberOrNull(phase.serverTimingBreakdownMs?.["db.acquire"]?.p99))),
    dbExecP99Ms: maxFinite(phases.map((phase) => numberOrNull(phase.serverTimingBreakdownMs?.["db.exec"]?.p99))),
    dbQueryP99Ms: maxFinite(phases.map((phase) => numberOrNull(phase.serverTimingBreakdownMs?.["db.query"]?.p99))),
    dbInsertP99Ms: maxFinite(phases.map((phase) => numberOrNull(phase.serverTimingBreakdownMs?.["db.insert"]?.p99))),
    commandAppendP99Ms: maxFinite(phases.map((phase) => numberOrNull(phase.serverTimingBreakdownMs?.["command.append"]?.p99))),
    projectionEnqueueP99Ms: maxFinite(phases.map((phase) => numberOrNull(phase.serverTimingBreakdownMs?.["projection.enqueue"]?.p99))),
    responseEncodeP99Ms: maxFinite(phases.map((phase) => numberOrNull(phase.serverTimingBreakdownMs?.["response.encode"]?.p99))),
    cacheHitP99Ms: maxFinite(phases.map((phase) => numberOrNull(phase.serverTimingBreakdownMs?.["cache.hit"]?.p99))),
    cacheSharedWaitP99Ms: maxFinite(phases.map((phase) => numberOrNull(phase.serverTimingBreakdownMs?.["cache.shared_wait"]?.p99))),
    gatewayReadProfile: report.gatewayReadProfile ?? null,
    gatewayWriteProfile: report.gatewayWriteProfile ?? null,
    gatewaySchemaProfile: report.gatewaySchemaProfile ?? null,
    clientHandlerGapP99Ms: maxFinite(phases.map((phase) =>
      nullableDelta(numberOrNull(phase.latencyMs?.p99), numberOrNull(phase.serverTimingBreakdownMs?.handler?.p99))
    )),
    benchmarkRuntimeProfile: report.benchmarkRuntimeProfile ?? null,
    databaseDiagnostics: summarizeGatewayDatabaseDiagnostics(report.gatewayDatabaseDiagnostics),
    commandLogDiagnostics: summarizeTeachingCommandLogDiagnostics(report.gatewayCommandLogDiagnostics),
  };
}

function summarizeGatewayDatabaseDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== "object") return undefined;
  const summarized = Object.fromEntries(
    ["before", "after"].map((snapshotName) => [snapshotName, summarizeGatewaySnapshot(diagnostics[snapshotName])])
      .filter(([_name, snapshot]) => snapshot !== undefined),
  );
  return Object.keys(summarized).length > 0 ? summarized : undefined;
}

function summarizeGatewaySnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.gateways)) return undefined;
  const gateways = snapshot.gateways;
  const stats = gateways.map((gateway) => gateway.stats ?? {});
  return {
    gatewayCount: gateways.length,
    okGateways: gateways.filter((gateway) => gateway.status === "OK").length,
    unavailableGateways: gateways.filter((gateway) => gateway.status !== "OK").length,
    maxTotalConns: maxFinite(stats.map((entry) => numberOrNull(entry.totalConns))),
    maxAcquiredConns: maxFinite(stats.map((entry) => numberOrNull(entry.acquiredConns))),
    maxIdleConns: maxFinite(stats.map((entry) => numberOrNull(entry.idleConns))),
    totalEmptyAcquireCount: sumFinite(stats.map((entry) => numberOrNull(entry.emptyAcquireCount))),
    totalEmptyAcquireWaitTimeMs: round(sumFinite(stats.map((entry) => numberOrNull(entry.emptyAcquireWaitTimeMs))), 2),
    totalNewConnsCount: sumFinite(stats.map((entry) => numberOrNull(entry.newConnsCount))),
  };
}

function summarizeTeachingCommandLogDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== "object") return undefined;
  const summarized = Object.fromEntries(
    ["before", "after", "settled"].map((snapshotName) => [snapshotName, summarizeCommandLogSnapshot(diagnostics[snapshotName])])
      .filter(([_name, snapshot]) => snapshot !== undefined),
  );
  return Object.keys(summarized).length > 0 ? summarized : undefined;
}

function summarizeCommandLogSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.gateways)) return undefined;
  const gateways = snapshot.gateways;
  const stats = gateways.map((gateway) => gateway.stats ?? {});
  return {
    gatewayCount: gateways.length,
    okGateways: gateways.filter((gateway) => gateway.status === "OK").length,
    unavailableGateways: gateways.filter((gateway) => gateway.status !== "OK").length,
    acceptedCommands: sumFinite(stats.map((entry) => numberOrNull(entry.acceptedCommands))),
    appendErrors: sumFinite(stats.map((entry) => numberOrNull(entry.appendErrors))),
    projectionEnqueued: sumFinite(stats.map((entry) => numberOrNull(entry.projectionEnqueued))),
    projectionSucceeded: sumFinite(stats.map((entry) => numberOrNull(entry.projectionSucceeded))),
    projectionFailed: sumFinite(stats.map((entry) => numberOrNull(entry.projectionFailed))),
    queueDepth: sumFinite(stats.map((entry) => numberOrNull(entry.queueDepth))),
    maxOldestPendingAgeMs: maxFinite(stats.map((entry) => numberOrNull(entry.oldestPendingAgeMs))),
  };
}

function systemTeachingBenchmarkRuntimeExecutor(runtime) {
  if (runtime === "docker") return "DOCKER_GO";
  if (runtime === "wsl") return "WSL_GO";
  if (runtime === "local") return "LOCAL_GO";
  return "LOCAL_NODE_FETCH";
}

function teachingMaxConnsPerHost(options) {
  return optionOrFallback(options.teachingMaxConnsPerHost, options.maxConnsPerHost);
}

function teachingWarmConnectionsPerHost(options) {
  return optionOrFallback(options.teachingWarmConnectionsPerHost, options.warmConnectionsPerHost);
}

export function teachingQuizSubmissionBatchSize(options) {
  return optionOrFallback(options.teachingQuizSubmissionBatchSize, options.teachingArchiveCreateBatchSize);
}

export function teachingQuizSubmissionBatchDelayMs(options) {
  return optionOrFallback(options.teachingQuizSubmissionBatchDelayMs, options.teachingArchiveCreateBatchDelayMs);
}

export function teachingQuizSubmissionBatchWorkers(options) {
  return optionOrFallback(options.teachingQuizSubmissionBatchWorkers, options.teachingArchiveCreateBatchWorkers);
}

export function teachingWriteAcceptanceMode(options) {
  const normalized = String(options.teachingWriteAcceptanceMode ?? "sync").trim().toLowerCase();
  if (normalized !== "sync" && normalized !== "durable-log") {
    throw new Error("teaching-write-acceptance-mode must be sync or durable-log");
  }
  return normalized;
}

function optionOrFallback(value, fallback) {
  return String(value ?? "").trim() === "" ? fallback : value;
}

function assertNonNegativeInteger(value, name) {
  if (!/^\d+$/u.test(String(value))) throw new Error(`${name} must be a non-negative integer`);
}

function assertPositiveInteger(value, name) {
  if (!/^[1-9]\d*$/u.test(String(value))) throw new Error(`${name} must be a positive integer`);
}

function parseInteger(value) {
  if (!/^-?\d+$/u.test(String(value))) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function archiveCreateBatchMode(value) {
  return String(value ?? "").trim().toLowerCase() === "copy" ? "copy" : "insert";
}

function archiveSchemaIndexProfile(value) {
  return String(value ?? "").trim().toLowerCase() === "hot_write" ? "hot_write" : "full";
}

function assertArchiveCreateBatchMode(value, name) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized !== "insert" && normalized !== "copy") throw new Error(`${name} must be insert or copy`);
}

function assertArchiveSchemaIndexProfile(value, name) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized !== "full" && normalized !== "hot_write") throw new Error(`${name} must be full or hot_write`);
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function maxFinite(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? Math.max(...finite) : null;
}

function minFinite(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? Math.min(...finite) : null;
}

function sumFinite(values) {
  return values.filter(Number.isFinite).reduce((total, value) => total + value, 0);
}

function round(value, digits) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function nullableDelta(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return round(left - right, 2);
}

function fallbackFailedErrors(status, errors) {
  if (errors > 0) return errors;
  return status === "FAILED" ? 1 : 0;
}
