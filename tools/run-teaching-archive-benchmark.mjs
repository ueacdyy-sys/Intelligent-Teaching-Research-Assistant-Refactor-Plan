import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import {
  assertLooseNonNegativeInteger as assertNonNegativeInteger,
  assertPositiveInteger,
  kebabToCamel,
  maskSensitive,
  numberOrZero,
  parseBoolean,
  parseInteger,
  removeExistingReport,
  tailText,
  writeJsonReport,
} from "./benchmark-runner-utils.mjs";
import {
  applyBenchmarkRuntimeArg,
  benchmarkRuntimeDefaults,
  benchmarkRuntimeProfile as buildGoBenchmarkRuntimeProfile,
  benchmarkTargetBaseUrls,
  buildBenchmarkRuntimeCommand,
} from "./conversation-benchmark-runtime.mjs";
import {
  buildGatewayBinary,
  archiveCreateBatchMode,
  archiveSchemaIndexProfile,
  gatewayBaseUrls,
  gatewayReadProfile,
  gatewaySchemaProfile,
  gatewayWriteProfile,
  maskURL,
  portFromUrl,
  quizSubmissionBatchDelayMs,
  quizSubmissionBatchSize,
  quizSubmissionBatchWorkers,
  spawnGateways,
  stopProcess,
  teachingBenchmarkRuntime,
  teachingWriteAcceptanceMode,
  waitForGateways,
} from "./teaching-archive-benchmark-gateway-runtime.mjs";
import { collectPgbouncerDiagnostics } from "./pgbouncer-diagnostics.mjs";
import {
  applyPostgresDiagnosticsArg,
  collectPostgresDiagnostics,
  postgresDiagnosticsDefaults,
  startPostgresDiagnosticsTimeline,
} from "./postgres-diagnostics.mjs";
import {
  addDiagnosticsSnapshot,
  addRuntimeDiagnosticsToReport,
  phaseErrors,
  principalHeader,
  runCreateArchiveItemPhase,
  runCreateQuizSubmissionPhase,
  runListArchiveItemsPhase,
  studentPrincipal,
  summarizeBenchmark,
  summarizePhase,
  teacherPrincipal,
  stopDiagnosticsTimeline,
} from "./run-teaching-archive-benchmark-helpers.mjs";

export { principalHeader, studentPrincipal, teacherPrincipal };

const gatewayDiagnosticsPath = "/internal/teaching/db-pool";
const gatewayCommandLogDiagnosticsPath = "/internal/teaching/command-log";
const internalDiagnosticsSecretHeader = "X-Internal-Diagnostics-Secret";
const internalDiagnosticsSecretValue = "ueacd";

export const defaults = {
  dsn: "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable",
  baseUrl: "http://127.0.0.1:18500",
  port: "18500",
  out: "reports/teaching-archive-benchmark.current.json",
  concurrency: "4",
  operations: "16",
  gatewayCount: "1",
  dbMaxConns: "4",
  dbMinConns: "0",
  dbPrewarmConns: "1",
  archiveCreateBatchSize: "1",
  archiveCreateBatchDelayMs: "0",
  archiveCreateBatchWorkers: "1",
  archiveCreateBatchMode: "insert",
  quizSubmissionBatchSize: "",
  quizSubmissionBatchDelayMs: "",
  quizSubmissionBatchWorkers: "",
  teachingWriteAcceptanceMode: "sync",
  teachingCommandLogPath: "",
  teachingCommandLogAppendBatchSize: "64",
  teachingCommandLogQueueCapacity: "65536",
  teachingCommandLogProjectionWorkers: "4",
  teachingCommandLogSync: "true",
  teachingCommandLogSettleTimeoutMs: "0",
  archiveListCacheTtlMs: "0",
  archiveListCacheMaxEntries: "1024",
  archiveSchemaIndexProfile: "full",
  agentApiKey: "ueacd",
  timeoutMs: "10000",
  timeout: "60s",
  startupTimeoutMs: "120000",
  benchmarkRuntime: "js",
  benchmarkDockerImage: benchmarkRuntimeDefaults.benchmarkDockerImage,
  benchmarkDockerHost: benchmarkRuntimeDefaults.benchmarkDockerHost,
  benchmarkWslDistro: benchmarkRuntimeDefaults.benchmarkWslDistro,
  benchmarkWslHost: benchmarkRuntimeDefaults.benchmarkWslHost,
  benchmarkWslWorkspace: benchmarkRuntimeDefaults.benchmarkWslWorkspace,
  maxConnsPerHost: "0",
  warmConnectionsPerHost: "0",
  warmConnectionRetries: "3",
  clientTrace: "false",
  pgbouncerDiagnostics: "false",
  pgbouncerPostgresContainer: "ita-identity-session-postgres",
  pgbouncerHost: "identity-session-pgbouncer",
  pgbouncerPort: "6432",
  pgbouncerUser: "app_user",
  pgbouncerDatabase: "pgbouncer",
  ...postgresDiagnosticsDefaults,
  postgresDiagnosticsRelations: "teaching_archive_items,teaching_quiz_submissions",
};

export function parseArgs(argv) {
  const parsed = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--") || value === undefined) continue;
    if (applyPostgresDiagnosticsArg(parsed, key, value)) {
      index += 1;
      continue;
    }
    if (applyBenchmarkRuntimeArg(parsed, key, value)) {
      index += 1;
      continue;
    }
    if (key === "--pgbouncer-diagnostics") parsed.pgbouncerDiagnostics = value;
    if (key === "--pgbouncer-postgres-container") parsed.pgbouncerPostgresContainer = value;
    if (key === "--pgbouncer-host") parsed.pgbouncerHost = value;
    if (key === "--pgbouncer-port") parsed.pgbouncerPort = value;
    if (key === "--pgbouncer-user") parsed.pgbouncerUser = value;
    if (key === "--pgbouncer-database") parsed.pgbouncerDatabase = value;
    const property = kebabToCamel(key.slice(2));
    if (Object.hasOwn(parsed, property)) {
      parsed[property] = value;
      index += 1;
    }
  }
  return parsed;
}

export async function runTeachingArchiveBenchmark(options = parseArgs(process.argv.slice(2)), dependencies = {}) {
  const root = dependencies.root ?? process.cwd();
  const spawnProcess = dependencies.spawnProcess ?? spawn;
  const spawnCommandSync = dependencies.spawnCommandSync ?? spawnSync;
  const fetchFn = dependencies.fetch ?? fetch;
  const sleepFn = dependencies.sleep ?? sleep;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const startedAt = Date.now();
  const generatedAt = now();
  let gateways = [];
  let gatewayOutput = "";
  let gatewayDatabaseDiagnostics;
  let gatewayCommandLogDiagnostics;
  let pgbouncerDiagnostics;
  let postgresDiagnostics;
  let postgresDiagnosticsTimeline;

  try {
    validateOptions(options);
    removeExistingReport(root, options.out);
    const gatewayBinary = buildGatewayBinary(root, spawnCommandSync);
    gateways = spawnGateways(options, root, spawnProcess, gatewayBinary);
    gateways.forEach((gateway, index) => {
      gateway.stdout?.on("data", (chunk) => { gatewayOutput += `[gateway ${index + 1}]\n${chunk.toString()}`; });
      gateway.stderr?.on("data", (chunk) => { gatewayOutput += `[gateway ${index + 1}]\n${chunk.toString()}`; });
    });
    await waitForGateways(gatewayBaseUrls(options), parseInteger(options.startupTimeoutMs), gateways, {
      fetch: fetchFn,
      sleep: sleepFn,
    });
    gatewayDatabaseDiagnostics = addDiagnosticsSnapshot(
      gatewayDatabaseDiagnostics,
      "before",
      await collectGatewayDatabaseDiagnostics(gatewayBaseUrls(options), { fetch: fetchFn, now }),
    );
    gatewayCommandLogDiagnostics = addDiagnosticsSnapshot(
      gatewayCommandLogDiagnostics,
      "before",
      await collectGatewayCommandLogDiagnosticsIfEnabled(options, gatewayBaseUrls(options), { fetch: fetchFn, now }),
    );
    pgbouncerDiagnostics = addDiagnosticsSnapshot(
      pgbouncerDiagnostics,
      "before",
      collectPgbouncerDiagnostics(options, { spawnSync: spawnCommandSync, now }),
    );
    postgresDiagnostics = addDiagnosticsSnapshot(
      postgresDiagnostics,
      "before",
      collectPostgresDiagnostics(options, { spawnSync: spawnCommandSync, now }),
    );
    postgresDiagnosticsTimeline = startPostgresDiagnosticsTimeline(options, {
      spawnSync: spawnCommandSync,
      sleep: sleepFn,
      now,
    });

    if (teachingBenchmarkRuntime(options) !== "js") {
      const report = runGoBenchmark(options, root, spawnCommandSync, gatewayOutput, Date.now() - startedAt);
      postgresDiagnostics = addDiagnosticsSnapshot(
        postgresDiagnostics,
        "timeline",
        await stopDiagnosticsTimeline(postgresDiagnosticsTimeline),
      );
      postgresDiagnosticsTimeline = undefined;
      gatewayDatabaseDiagnostics = addDiagnosticsSnapshot(
        gatewayDatabaseDiagnostics,
        "after",
        await collectGatewayDatabaseDiagnostics(gatewayBaseUrls(options), { fetch: fetchFn, now }),
      );
      gatewayCommandLogDiagnostics = addDiagnosticsSnapshot(
        gatewayCommandLogDiagnostics,
        "after",
        await collectGatewayCommandLogDiagnosticsIfEnabled(options, gatewayBaseUrls(options), { fetch: fetchFn, now }),
      );
      gatewayCommandLogDiagnostics = await collectSettledCommandLogDiagnostics(
        gatewayCommandLogDiagnostics,
        gatewayBaseUrls(options),
        options,
        { fetch: fetchFn, sleep: sleepFn, now },
      );
      pgbouncerDiagnostics = addDiagnosticsSnapshot(
        pgbouncerDiagnostics,
        "after",
        collectPgbouncerDiagnostics(options, { spawnSync: spawnCommandSync, now }),
      );
      postgresDiagnostics = addDiagnosticsSnapshot(
        postgresDiagnostics,
        "after",
        collectPostgresDiagnostics(options, { spawnSync: spawnCommandSync, now }),
      );
      const enriched = addRuntimeDiagnosticsToReport(report, {
        gatewayDatabaseDiagnostics,
        gatewayCommandLogDiagnostics,
        pgbouncerDiagnostics,
        postgresDiagnostics,
      });
      writeJsonReport(path.join(root, options.out), enriched);
      return enriched;
    }

    const createArchiveItem = await runCreateArchiveItemPhase(options, fetchFn);
    const createQuizSubmission = await runCreateQuizSubmissionPhase(options, fetchFn, createArchiveItem.items);
    const listArchiveItems = await runListArchiveItemsPhase(options, fetchFn);
    const phases = { createArchiveItem, createQuizSubmission, listArchiveItems };
    postgresDiagnostics = addDiagnosticsSnapshot(
      postgresDiagnostics,
      "timeline",
      await stopDiagnosticsTimeline(postgresDiagnosticsTimeline),
    );
    postgresDiagnosticsTimeline = undefined;
    gatewayDatabaseDiagnostics = addDiagnosticsSnapshot(
      gatewayDatabaseDiagnostics,
      "after",
      await collectGatewayDatabaseDiagnostics(gatewayBaseUrls(options), { fetch: fetchFn, now }),
    );
    gatewayCommandLogDiagnostics = addDiagnosticsSnapshot(
      gatewayCommandLogDiagnostics,
      "after",
      await collectGatewayCommandLogDiagnosticsIfEnabled(options, gatewayBaseUrls(options), { fetch: fetchFn, now }),
    );
    gatewayCommandLogDiagnostics = await collectSettledCommandLogDiagnostics(
      gatewayCommandLogDiagnostics,
      gatewayBaseUrls(options),
      options,
      { fetch: fetchFn, sleep: sleepFn, now },
    );
    pgbouncerDiagnostics = addDiagnosticsSnapshot(
      pgbouncerDiagnostics,
      "after",
      collectPgbouncerDiagnostics(options, { spawnSync: spawnCommandSync, now }),
    );
    postgresDiagnostics = addDiagnosticsSnapshot(
      postgresDiagnostics,
      "after",
      collectPostgresDiagnostics(options, { spawnSync: spawnCommandSync, now }),
    );
    const report = buildBenchmarkReport({
      options,
      generatedAt: now(),
      status: phaseErrors(phases) === 0 ? "PASSED" : "FAILED",
      phases,
      totalDurationMs: Date.now() - startedAt,
      gatewayOutput,
      gatewayDatabaseDiagnostics,
      gatewayCommandLogDiagnostics,
      pgbouncerDiagnostics,
      postgresDiagnostics,
    });
    writeJsonReport(path.join(root, options.out), report);
    return report;
  } catch (error) {
    postgresDiagnostics = addDiagnosticsSnapshot(
      postgresDiagnostics,
      "timeline",
      await stopDiagnosticsTimeline(postgresDiagnosticsTimeline),
    );
    postgresDiagnosticsTimeline = undefined;
    const report = buildFailureReport({
      options,
      generatedAt,
      errorMessage: error instanceof Error ? error.message : String(error),
      gatewayOutput,
      totalDurationMs: Date.now() - startedAt,
      gatewayDatabaseDiagnostics,
      gatewayCommandLogDiagnostics,
      pgbouncerDiagnostics,
      postgresDiagnostics,
    });
    writeJsonReport(path.join(root, options.out), report);
    return report;
  } finally {
    for (const gateway of gateways) stopProcess(gateway, spawnCommandSync);
    await sleepFn(200);
  }
}

export async function collectGatewayDatabaseDiagnostics(baseUrls, dependencies = {}) {
  return collectGatewayInternalDiagnostics(baseUrls, gatewayDiagnosticsPath, dependencies);
}

export async function collectGatewayCommandLogDiagnostics(baseUrls, dependencies = {}) {
  return collectGatewayInternalDiagnostics(baseUrls, gatewayCommandLogDiagnosticsPath, dependencies);
}

async function collectGatewayCommandLogDiagnosticsIfEnabled(options, baseUrls, dependencies = {}) {
  if (teachingWriteAcceptanceMode(options) !== "durable-log") return undefined;
  return collectGatewayCommandLogDiagnostics(baseUrls, dependencies);
}

async function collectSettledCommandLogDiagnostics(current, baseUrls, options, dependencies = {}) {
  const timeoutMs = parseInteger(options.teachingCommandLogSettleTimeoutMs);
  if (teachingWriteAcceptanceMode(options) !== "durable-log" || timeoutMs <= 0) return current;
  const sleepFn = dependencies.sleep ?? sleep;
  const fetchFn = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const deadline = Date.now() + timeoutMs;
  let latest = current;
  while (Date.now() <= deadline) {
    const snapshot = await collectGatewayCommandLogDiagnostics(baseUrls, { fetch: fetchFn, now });
    latest = addDiagnosticsSnapshot(latest, "settled", snapshot);
    if (commandLogSnapshotSettled(snapshot)) return latest;
    await sleepFn(25);
  }
  return latest;
}

function commandLogSnapshotSettled(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.gateways) || snapshot.gateways.length === 0) return false;
  return snapshot.gateways.every((gateway) => {
    if (gateway.status !== "OK") return false;
    const stats = gateway.stats ?? {};
    const accepted = Number(stats.acceptedCommands ?? 0);
    const succeeded = Number(stats.projectionSucceeded ?? 0);
    const failed = Number(stats.projectionFailed ?? 0);
    const queueDepth = Number(stats.queueDepth ?? 0);
    const appendErrors = Number(stats.appendErrors ?? 0);
    return appendErrors === 0 && failed === 0 && queueDepth === 0 && succeeded >= accepted;
  });
}

async function collectGatewayInternalDiagnostics(baseUrls, endpointPath, dependencies = {}) {
  const fetchFn = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const gateways = [];
  for (const baseUrl of baseUrls) {
    const trimmedBaseUrl = baseUrl.replace(/\/+$/u, "");
    try {
      const response = await fetchFn(`${trimmedBaseUrl}${endpointPath}`, {
        headers: {
          [internalDiagnosticsSecretHeader]: internalDiagnosticsSecretValue,
        },
      });
      if (!response.ok) {
        gateways.push({
          baseUrl: maskURL(trimmedBaseUrl),
          status: "UNAVAILABLE",
          httpStatus: response.status,
        });
        continue;
      }
      const body = await response.json();
      gateways.push({
        baseUrl: maskURL(trimmedBaseUrl),
        status: "OK",
        httpStatus: response.status,
        stats: body.stats ?? null,
      });
    } catch (error) {
      gateways.push({
        baseUrl: maskURL(trimmedBaseUrl),
        status: "ERROR",
        errorMessage: maskSensitive(error instanceof Error ? error.message : String(error)),
      });
    }
  }
  return {
    endpoint: endpointPath,
    secretHeader: internalDiagnosticsSecretHeader,
    sampledAt: now(),
    gateways,
  };
}

export function buildBenchmarkReport({
  options,
  generatedAt,
  status,
  phases,
  totalDurationMs,
  gatewayOutput = "",
  gatewayDatabaseDiagnostics,
  gatewayCommandLogDiagnostics,
  pgbouncerDiagnostics,
  postgresDiagnostics,
}) {
  const phaseSummaries = Object.fromEntries(Object.entries(phases).map(([name, phase]) => [name, summarizePhase(phase)]));
  return addRuntimeDiagnosticsToReport({
    generatedAt,
    benchmarkKind: "teaching_archive_gateway",
    workloadType: "HTTP_BENCHMARK",
    status,
    baseUrl: maskURL(options.baseUrl),
    gatewayBaseUrls: gatewayBaseUrls(options).map(maskURL),
    concurrency: parseInteger(options.concurrency),
    operationsPerPhase: parseInteger(options.operations),
    gatewayCount: parseInteger(options.gatewayCount),
    benchmarkRuntimeProfile: benchmarkRuntimeProfile(options),
    gatewayDatabaseProfile: {
      dbMaxConns: parseInteger(options.dbMaxConns),
      dbMinConns: parseInteger(options.dbMinConns),
      dbPrewarmConns: parseInteger(options.dbPrewarmConns),
      databaseUrl: "[database-url]",
    },
    gatewayWriteProfile: gatewayWriteProfile(options),
    gatewayReadProfile: gatewayReadProfile(options),
    gatewaySchemaProfile: gatewaySchemaProfile(options),
    phases: phaseSummaries,
    summary: summarizeBenchmark(phaseSummaries),
    totalDurationMs,
    gatewayOutputTail: tailText(maskSensitive(gatewayOutput), 80),
    dockerRequiredForEvidence: true,
  }, { gatewayDatabaseDiagnostics, gatewayCommandLogDiagnostics, pgbouncerDiagnostics, postgresDiagnostics });
}

export function buildFailureReport({
  options,
  generatedAt,
  errorMessage,
  gatewayOutput = "",
  totalDurationMs = 0,
  gatewayDatabaseDiagnostics,
  gatewayCommandLogDiagnostics,
  pgbouncerDiagnostics,
  postgresDiagnostics,
}) {
  return addRuntimeDiagnosticsToReport({
    generatedAt,
    benchmarkKind: "teaching_archive_gateway",
    workloadType: "HTTP_BENCHMARK",
    status: "FAILED",
    baseUrl: maskURL(options.baseUrl),
    gatewayBaseUrls: gatewayBaseUrls(options).map(maskURL),
    concurrency: parseInteger(options.concurrency),
    operationsPerPhase: parseInteger(options.operations),
    gatewayCount: parseInteger(options.gatewayCount),
    benchmarkRuntimeProfile: benchmarkRuntimeProfile(options),
    gatewayDatabaseProfile: {
      dbMaxConns: parseInteger(options.dbMaxConns),
      dbMinConns: parseInteger(options.dbMinConns),
      dbPrewarmConns: parseInteger(options.dbPrewarmConns),
      databaseUrl: "[database-url]",
    },
    gatewayWriteProfile: gatewayWriteProfile(options),
    gatewayReadProfile: gatewayReadProfile(options),
    gatewaySchemaProfile: gatewaySchemaProfile(options),
    phases: {},
    summary: {
      totalErrors: 1,
      maxP95Ms: null,
      maxP99Ms: null,
      minRps: null,
    },
    totalDurationMs,
    errorMessage: maskSensitive(errorMessage),
    gatewayOutputTail: tailText(maskSensitive(gatewayOutput), 80),
    dockerRequiredForEvidence: true,
  }, { gatewayDatabaseDiagnostics, gatewayCommandLogDiagnostics, pgbouncerDiagnostics, postgresDiagnostics });
}

export function formatTeachingArchiveBenchmark(report) {
  const lines = [
    `Teaching archive benchmark: ${report.status}`,
    `Concurrency: ${report.concurrency}`,
    `Operations per phase: ${report.operationsPerPhase}`,
    `Total errors: ${report.summary?.totalErrors ?? "n/a"}`,
    "",
    "Phase results:",
  ];
  for (const [name, phase] of Object.entries(report.phases ?? {})) {
    lines.push(`- ${name} p95=${phase.latencyMs?.p95 ?? "n/a"}ms p99=${phase.latencyMs?.p99 ?? "n/a"}ms errors=${phase.errors}`);
  }
  return lines.join("\n");
}

export function buildBenchmarkCommand(options, baseUrls = gatewayBaseUrls(options), root = process.cwd()) {
  if (teachingBenchmarkRuntime(options) === "js") {
    throw new Error("buildBenchmarkCommand requires benchmark-runtime local, docker, or wsl");
  }
  const args = [
    "run",
    "./services/teaching-archive-gateway/cmd/httpbench",
    "--base-url",
    benchmarkTargetBaseUrls(options, baseUrls).join(","),
    "--agent-api-key",
    options.agentApiKey,
    "--concurrency",
    String(parseInteger(options.concurrency)),
    "--operations",
    String(parseInteger(options.operations)),
    "--max-conns-per-host",
    String(parseInteger(options.maxConnsPerHost)),
    "--warm-connections-per-host",
    String(parseInteger(options.warmConnectionsPerHost)),
    "--warm-connection-retries",
    String(parseInteger(options.warmConnectionRetries)),
    "--out",
    options.out,
    "--timeout",
    options.timeout,
    "--write-acceptance-mode",
    teachingWriteAcceptanceMode(options),
  ];
  if (parseBoolean(options.clientTrace)) {
    args.push("--client-trace");
  }
  return buildBenchmarkRuntimeCommand(options, args, root);
}

export function benchmarkRuntimeProfile(options, baseUrls = gatewayBaseUrls(options)) {
  if (teachingBenchmarkRuntime(options) === "js") {
    return {
      executor: "LOCAL_NODE_FETCH",
      targetBaseUrls: baseUrls.map(maskURL),
    };
  }
  return buildGoBenchmarkRuntimeProfile(options, baseUrls, maskURL);
}

function runGoBenchmark(options, root, spawnCommandSync, gatewayOutput, elapsedBeforeBenchmarkMs) {
  const command = buildBenchmarkCommand(options, gatewayBaseUrls(options), root);
  const result = spawnCommandSync(command[0], command.slice(1), {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const benchmarkOutput = [result.stdout, result.stderr].filter(Boolean).join("\n");
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`teaching archive Go benchmark failed with exit code ${result.status}: ${benchmarkOutput}`);
  }
  const reportPath = path.join(root, options.out);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  return {
    ...report,
    summary: report.summary ?? summarizeBenchmark(report.phases ?? {}),
    gatewayDatabaseProfile: {
      dbMaxConns: parseInteger(options.dbMaxConns),
      dbMinConns: parseInteger(options.dbMinConns),
      dbPrewarmConns: parseInteger(options.dbPrewarmConns),
      databaseUrl: "[database-url]",
    },
    gatewayWriteProfile: gatewayWriteProfile(options),
    gatewayReadProfile: gatewayReadProfile(options),
    gatewaySchemaProfile: gatewaySchemaProfile(options),
    benchmarkRuntimeProfile: benchmarkRuntimeProfile(options),
    totalDurationMs: numberOrZero(report.totalDurationMs) + elapsedBeforeBenchmarkMs,
    gatewayOutputTail: tailText(maskSensitive(`${gatewayOutput}\n${benchmarkOutput}`), 80),
    dockerRequiredForEvidence: true,
  };
}

function validateOptions(options) {
  assertPositiveInteger(options.concurrency, "concurrency");
  assertPositiveInteger(options.operations, "operations");
  assertPositiveInteger(options.gatewayCount, "gateway-count");
  assertPositiveInteger(options.dbMaxConns, "db-max-conns");
  assertNonNegativeInteger(options.dbMinConns, "db-min-conns");
  assertNonNegativeInteger(options.dbPrewarmConns, "db-prewarm-conns");
  assertNonNegativeInteger(options.archiveCreateBatchSize, "archive-create-batch-size");
  assertNonNegativeInteger(options.archiveCreateBatchDelayMs, "archive-create-batch-delay-ms");
  assertPositiveInteger(options.archiveCreateBatchWorkers, "archive-create-batch-workers");
  assertArchiveCreateBatchMode(options.archiveCreateBatchMode);
  assertNonNegativeInteger(quizSubmissionBatchSize(options), "quiz-submission-batch-size");
  assertNonNegativeInteger(quizSubmissionBatchDelayMs(options), "quiz-submission-batch-delay-ms");
  assertPositiveInteger(quizSubmissionBatchWorkers(options), "quiz-submission-batch-workers");
  teachingWriteAcceptanceMode(options);
  assertPositiveInteger(options.teachingCommandLogAppendBatchSize, "teaching-command-log-append-batch-size");
  assertPositiveInteger(options.teachingCommandLogQueueCapacity, "teaching-command-log-queue-capacity");
  assertPositiveInteger(options.teachingCommandLogProjectionWorkers, "teaching-command-log-projection-workers");
  assertNonNegativeInteger(options.teachingCommandLogSettleTimeoutMs, "teaching-command-log-settle-timeout-ms");
  assertNonNegativeInteger(options.archiveListCacheTtlMs, "archive-list-cache-ttl-ms");
  assertPositiveInteger(options.archiveListCacheMaxEntries, "archive-list-cache-max-entries");
  assertArchiveSchemaIndexProfile(options.archiveSchemaIndexProfile);
  if (parseInteger(options.dbMinConns) > parseInteger(options.dbMaxConns)) {
    throw new Error("db-min-conns must be <= db-max-conns");
  }
  if (parseInteger(options.dbPrewarmConns) > parseInteger(options.dbMaxConns)) {
    throw new Error("db-prewarm-conns must be <= db-max-conns");
  }
  assertPositiveInteger(options.startupTimeoutMs, "startup-timeout-ms");
  assertPositiveInteger(options.timeoutMs, "timeout-ms");
  assertNonNegativeInteger(options.maxConnsPerHost, "max-conns-per-host");
  assertNonNegativeInteger(options.warmConnectionsPerHost, "warm-connections-per-host");
  assertNonNegativeInteger(options.warmConnectionRetries, "warm-connection-retries");
  assertPositiveInteger(options.pgbouncerPort, "pgbouncer-port");
  assertPositiveInteger(options.postgresDiagnosticsPort, "postgres-diagnostics-port");
  assertPositiveInteger(options.postgresDiagnosticsIntervalMs, "postgres-diagnostics-interval-ms");
  assertPositiveInteger(options.postgresDiagnosticsMaxSamples, "postgres-diagnostics-max-samples");
  assertPositiveInteger(options.postgresDiagnosticsQueryTimeoutMs, "postgres-diagnostics-query-timeout-ms");
  teachingBenchmarkRuntime(options);
  if (options.agentApiKey !== "ueacd") throw new Error("agent-api-key must be ueacd for local performance evidence");
  const url = new URL(options.dsn);
  if (url.password !== "ueacd") throw new Error("dsn password must be ueacd for local performance evidence");
  portFromUrl(options.baseUrl, options.port);
}

function assertArchiveCreateBatchMode(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized !== "insert" && normalized !== "copy") {
    throw new Error("archive-create-batch-mode must be insert or copy");
  }
  archiveCreateBatchMode({ archiveCreateBatchMode: normalized });
}

function assertArchiveSchemaIndexProfile(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized !== "full" && normalized !== "hot_write") {
    throw new Error("archive-schema-index-profile must be full or hot_write");
  }
  archiveSchemaIndexProfile({ archiveSchemaIndexProfile: normalized });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runTeachingArchiveBenchmark();
  console.log(formatTeachingArchiveBenchmark(report));
  process.exit(report.status === "PASSED" ? 0 : 1);
}
