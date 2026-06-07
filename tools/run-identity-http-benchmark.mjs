import fs from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { tailText, writeJsonReport } from "./benchmark-runner-utils.mjs";
import { collectPgbouncerDiagnostics, parsePsqlUnalignedRows } from "./identity-pgbouncer-diagnostics.mjs";
import { collectGatewayDatabaseDiagnostics, identityInternalDiagnosticsSecretValue } from "./identity-gateway-diagnostics.mjs";
import { addGatewayWriteLimiterSummary } from "./identity-gateway-diagnostics-summary.mjs";
import { applySessionDbQueryExecModeArg, defaultSessionDbQueryExecMode, gatewaySessionQueryExecModeEnv, validateSessionDbQueryExecMode } from "./identity-session-query-exec-mode-profile.mjs";
import { applyPostgresDiagnosticsArg, collectPostgresDiagnostics, postgresDiagnosticsDefaults, runBenchmarkWithPostgresDiagnostics } from "./identity-postgres-diagnostics.mjs";
import { applySessionTablePersistenceArg, defaultSessionTablePersistence, gatewaySessionPersistenceEnv } from "./identity-http-benchmark-session-profile.mjs";
import {
  benchmarkRuntimeDefaults,
} from "./conversation-benchmark-runtime.mjs";
import {
  benchmarkBaseUrls,
  benchmarkRuntimeProfile,
  buildBenchmarkCommand,
  combineGatewayOutput,
  gatewayBaseUrls,
  gatewayCount,
  gatewayDatabaseProfile,
  gatewayExitCodes,
  gatewayPort,
  gatewaySignals,
  ingressBaseUrls,
  ingressEnabled,
  ingressPortAt,
  ingressProfile,
  maskSensitive,
  maskURL,
  parseIntegerOption,
  parseStrictIntegerOption,
  processExitCodes,
  processSignals,
  transportProfile,
  urlPort,
} from "./run-identity-http-benchmark-profiles.mjs";

export { collectGatewayDatabaseDiagnostics, collectPgbouncerDiagnostics, collectPostgresDiagnostics, parsePsqlUnalignedRows, tailText, validateSessionDbQueryExecMode, writeJsonReport };
export { benchmarkRuntimeProfile, buildBenchmarkCommand, gatewayBaseUrls, gatewayDatabaseProfile };

export const defaults = {
  dsn: "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable",
  baseUrl: "http://127.0.0.1:18100",
  port: "18100",
  out: "reports/identity-http-benchmark.current.json",
  concurrency: "64",
  operations: "300",
  warmupOperations: "0",
  sessionDbMaxConns: "16",
  sessionDbMinConns: "0",
  sessionDbPrewarmConns: "1",
  sessionDbReadMaxConns: "0",
  sessionDbReadMinConns: "0",
  sessionDbReadPrewarmConns: "0",
  sessionDbQueryExecMode: defaultSessionDbQueryExecMode,
  sessionDbWriteConcurrency: "0",
  sessionAccessCacheMaxEntries: "0",
  sessionAccessCacheTtlMs: "30000",
  sessionDbSessionTablePersistence: defaultSessionTablePersistence,
  gatewayCount: "1",
  maxConnsPerHost: "0",
  warmConnectionsPerHost: "0",
  benchmarkRuntime: "local",
  benchmarkDockerImage: benchmarkRuntimeDefaults.benchmarkDockerImage,
  benchmarkDockerHost: benchmarkRuntimeDefaults.benchmarkDockerHost,
  benchmarkWslDistro: benchmarkRuntimeDefaults.benchmarkWslDistro,
  benchmarkWslHost: benchmarkRuntimeDefaults.benchmarkWslHost,
  benchmarkWslWorkspace: benchmarkRuntimeDefaults.benchmarkWslWorkspace,
  ingressProxy: "false",
  ingressPort: "18080",
  ingressCount: "1",
  ingressMaxConnsPerHost: "0",
  ingressWarmConnectionsPerHost: "0",
  pgbouncerDiagnostics: "false",
  pgbouncerPostgresContainer: "ita-identity-session-postgres",
  pgbouncerHost: "identity-session-pgbouncer",
  pgbouncerPort: "6432",
  pgbouncerUser: "app_user",
  pgbouncerDatabase: "pgbouncer",
  ...postgresDiagnosticsDefaults,
  timeout: "120s",
  startupTimeoutMs: "120000",
};

const phaseNames = ["passwordLogin", "principalLookup", "refreshRotation", "revokeCycle"];
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
    if (applySessionTablePersistenceArg(parsed, key, value)) {
      index += 1;
      continue;
    }
    if (applySessionDbQueryExecModeArg(parsed, key, value)) {
      index += 1;
      continue;
    }
    if (key === "--dsn") parsed.dsn = value;
    if (key === "--base-url") parsed.baseUrl = value;
    if (key === "--port") parsed.port = value;
    if (key === "--out") parsed.out = value;
    if (key === "--concurrency") parsed.concurrency = value;
    if (key === "--operations") parsed.operations = value;
    if (key === "--warmup-operations") parsed.warmupOperations = value;
    if (key === "--session-db-max-conns") parsed.sessionDbMaxConns = value;
    if (key === "--session-db-min-conns") parsed.sessionDbMinConns = value;
    if (key === "--session-db-prewarm-conns") parsed.sessionDbPrewarmConns = value;
    if (key === "--session-db-read-max-conns") parsed.sessionDbReadMaxConns = value;
    if (key === "--session-db-read-min-conns") parsed.sessionDbReadMinConns = value;
    if (key === "--session-db-read-prewarm-conns") parsed.sessionDbReadPrewarmConns = value;
    if (key === "--session-db-write-concurrency") parsed.sessionDbWriteConcurrency = value;
    if (key === "--session-access-cache-max-entries") parsed.sessionAccessCacheMaxEntries = value;
    if (key === "--session-access-cache-ttl-ms") parsed.sessionAccessCacheTtlMs = value;
    if (key === "--gateway-count") parsed.gatewayCount = value;
    if (key === "--max-conns-per-host") parsed.maxConnsPerHost = value;
    if (key === "--warm-connections-per-host") parsed.warmConnectionsPerHost = value;
    if (key === "--benchmark-runtime") parsed.benchmarkRuntime = value;
    if (key === "--benchmark-docker-image") parsed.benchmarkDockerImage = value;
    if (key === "--benchmark-docker-host") parsed.benchmarkDockerHost = value;
    if (key === "--benchmark-wsl-distro") parsed.benchmarkWslDistro = value;
    if (key === "--benchmark-wsl-host") parsed.benchmarkWslHost = value;
    if (key === "--benchmark-wsl-workspace") parsed.benchmarkWslWorkspace = value;
    if (key === "--ingress-proxy") parsed.ingressProxy = value;
    if (key === "--ingress-port") parsed.ingressPort = value;
    if (key === "--ingress-count") parsed.ingressCount = value;
    if (key === "--ingress-max-conns-per-host") parsed.ingressMaxConnsPerHost = value;
    if (key === "--ingress-warm-connections-per-host") parsed.ingressWarmConnectionsPerHost = value;
    if (key === "--pgbouncer-diagnostics") parsed.pgbouncerDiagnostics = value;
    if (key === "--pgbouncer-postgres-container") parsed.pgbouncerPostgresContainer = value;
    if (key === "--pgbouncer-host") parsed.pgbouncerHost = value;
    if (key === "--pgbouncer-port") parsed.pgbouncerPort = value;
    if (key === "--pgbouncer-user") parsed.pgbouncerUser = value;
    if (key === "--pgbouncer-database") parsed.pgbouncerDatabase = value;
    if (key === "--timeout") parsed.timeout = value;
    if (key === "--startup-timeout-ms") parsed.startupTimeoutMs = value;
    index += 1;
  }
  return parsed;
}

export function buildFailureReport({
  options,
  exitCode,
  errorMessage,
  gatewayOutput = "",
  benchmarkOutput = "",
  gatewayExitCode,
  gatewaySignal,
  ingressExitCode,
  ingressSignal,
  gatewayDatabaseDiagnostics,
  pgbouncerDiagnostics,
  postgresDiagnostics,
  generatedAt = new Date().toISOString(),
}) {
  const sanitizedError = maskSensitive(errorMessage);
  const sanitizedGatewayOutput = maskSensitive(gatewayOutput);
  const sanitizedBenchmarkOutput = maskSensitive(benchmarkOutput);
  const phase = inferFailurePhase(`${sanitizedError}\n${sanitizedBenchmarkOutput}`);
  const report = {
    generatedAt,
    benchmarkKind: "identity_http_gateway",
    workloadType: "HTTP_BENCHMARK",
    status: "FAILED",
    baseUrl: maskURL(options.baseUrl),
    concurrency: parseIntegerOption(options.concurrency),
    operationsPerPhase: parseIntegerOption(options.operations),
    warmupOperations: parseIntegerOption(options.warmupOperations),
    sessionDbMaxConns: parseIntegerOption(options.sessionDbMaxConns),
    sessionDbMinConns: parseIntegerOption(options.sessionDbMinConns),
    sessionDbPrewarmConns: parseIntegerOption(options.sessionDbPrewarmConns),
    sessionDbReadMaxConns: parseIntegerOption(options.sessionDbReadMaxConns),
    sessionDbReadMinConns: parseIntegerOption(options.sessionDbReadMinConns),
    sessionDbReadPrewarmConns: parseIntegerOption(options.sessionDbReadPrewarmConns),
    sessionDbWriteConcurrency: parseIntegerOption(options.sessionDbWriteConcurrency),
    sessionAccessCacheMaxEntries: parseIntegerOption(options.sessionAccessCacheMaxEntries),
    sessionAccessCacheTtlMs: parseIntegerOption(options.sessionAccessCacheTtlMs),
    gatewayCount: gatewayCount(options),
    gatewayDatabaseProfile: gatewayDatabaseProfile(options),
    gatewayBaseUrls: gatewayBaseUrls(options).map(maskURL),
    loadBalancingStrategy: gatewayCount(options) > 1 ? "ROUND_ROBIN" : "SINGLE_GATEWAY",
    transportProfile: transportProfile(options),
    benchmarkRuntimeProfile: benchmarkRuntimeProfile(options, benchmarkBaseUrls(options)),
    ingressProfile: ingressProfile(options),
    dockerRequiredForEvidence: true,
    exitCode,
    errorMessage: sanitizedError || `identity HTTP benchmark exited with code ${exitCode}`,
    gatewayOutputTail: tailText(sanitizedGatewayOutput, 80),
    benchmarkOutputTail: tailText(sanitizedBenchmarkOutput, 80),
  };
  if (gatewayExitCode !== undefined) report.gatewayExitCode = gatewayExitCode;
  if (gatewaySignal !== undefined) report.gatewaySignal = gatewaySignal;
  if (ingressExitCode !== undefined) report.ingressExitCode = ingressExitCode;
  if (ingressSignal !== undefined) report.ingressSignal = ingressSignal;
  if (gatewayDatabaseDiagnostics) {
    report.gatewayDatabaseDiagnostics = gatewayDatabaseDiagnostics;
  }
  if (pgbouncerDiagnostics) {
    report.pgbouncerDiagnostics = pgbouncerDiagnostics;
  }
  if (postgresDiagnostics) {
    report.postgresDiagnostics = postgresDiagnostics;
  }
  if (phase) report.phase = phase;
  return addGatewayWriteLimiterSummary(report, gatewayDatabaseDiagnostics);
}

export function inferFailurePhase(message) {
  const text = String(message ?? "");
  return phaseNames.find((phase) => text.includes(phase));
}

export function validateRuntimePortPlan(options) {
  if (!ingressEnabled(options)) return;
  const gatewayPorts = new Set(gatewayBaseUrls(options).map(urlPort).filter((port) => port !== null));
  const overlaps = ingressBaseUrls(options)
    .map(urlPort)
    .filter((port) => port !== null && gatewayPorts.has(port));
  const uniqueOverlaps = [...new Set(overlaps)].sort((left, right) => left - right);
  if (uniqueOverlaps.length === 0) return;
  throw new Error(
    `identity HTTP benchmark ingress/gateway port overlap: ${uniqueOverlaps.join(", ")}. `
    + "Choose --ingress-port outside the gateway port range.",
  );
}

export function validateSessionDbPoolProfile(options) {
  const warmupOperations = parseStrictIntegerOption(options.warmupOperations, "warmup-operations");
  if (warmupOperations < 0) {
    throw new Error("warmup-operations must be non-negative");
  }
  const maxConns = parseStrictIntegerOption(options.sessionDbMaxConns, "session-db-max-conns");
  const minConns = parseStrictIntegerOption(options.sessionDbMinConns, "session-db-min-conns");
  const prewarmConns = parseStrictIntegerOption(options.sessionDbPrewarmConns, "session-db-prewarm-conns");
  if (maxConns < 1) {
    throw new Error("session-db-max-conns must be positive");
  }
  if (minConns < 0) {
    throw new Error("session-db-min-conns must be non-negative");
  }
  if (minConns > maxConns) {
    throw new Error("session-db-min-conns must be <= session-db-max-conns");
  }
  if (prewarmConns < 0) {
    throw new Error("session-db-prewarm-conns must be non-negative");
  }
  if (prewarmConns > maxConns) {
    throw new Error("session-db-prewarm-conns must be <= session-db-max-conns");
  }
  const readMaxConns = parseStrictIntegerOption(options.sessionDbReadMaxConns, "session-db-read-max-conns");
  const readMinConns = parseStrictIntegerOption(options.sessionDbReadMinConns, "session-db-read-min-conns");
  const readPrewarmConns = parseStrictIntegerOption(options.sessionDbReadPrewarmConns, "session-db-read-prewarm-conns");
  if (readMaxConns < 0) {
    throw new Error("session-db-read-max-conns must be non-negative");
  }
  if (readMinConns < 0) {
    throw new Error("session-db-read-min-conns must be non-negative");
  }
  if (readPrewarmConns < 0) {
    throw new Error("session-db-read-prewarm-conns must be non-negative");
  }
  if (readMaxConns === 0 && (readMinConns > 0 || readPrewarmConns > 0)) {
    throw new Error("session-db-read-min-conns and session-db-read-prewarm-conns require session-db-read-max-conns");
  }
  if (readMaxConns > 0 && readMinConns > readMaxConns) {
    throw new Error("session-db-read-min-conns must be <= session-db-read-max-conns");
  }
  if (readMaxConns > 0 && readPrewarmConns > readMaxConns) {
    throw new Error("session-db-read-prewarm-conns must be <= session-db-read-max-conns");
  }
  const cacheMaxEntries = parseStrictIntegerOption(options.sessionAccessCacheMaxEntries, "session-access-cache-max-entries");
  const cacheTtlMs = parseStrictIntegerOption(options.sessionAccessCacheTtlMs, "session-access-cache-ttl-ms");
  if (cacheMaxEntries < 0) {
    throw new Error("session-access-cache-max-entries must be non-negative");
  }
  if (cacheTtlMs < 0) {
    throw new Error("session-access-cache-ttl-ms must be non-negative");
  }
}

export async function runIdentityHttpBenchmark(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(argv);
  try {
    validateRuntimePortPlan(options);
    validateSessionDbPoolProfile(options);
    validateSessionDbQueryExecMode(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const consoleError = dependencies.consoleError ?? console.error;
    consoleError(maskSensitive(message));
    writeFailureReport(options, {
      exitCode: 1,
      errorMessage: message,
    });
    return 1;
  }
  const baseUrls = gatewayBaseUrls(options);
  const spawnProcess = dependencies.spawn ?? spawn;
  const spawnCommandSync = dependencies.spawnSync ?? spawnSync;
  const sleepFn = dependencies.sleep ?? sleep;
  const fetchFn = dependencies.fetch ?? fetch;
  const gateways = baseUrls.map((baseUrl, index) => spawnGateway(baseUrl, options, index, spawnProcess));
  const ingressBaseURLs = ingressBaseUrls(options);
  const gatewayOutputs = gateways.map(() => "");
  let ingresses = [];
  let ingressOutputs = [];
  let gatewayDatabaseDiagnostics;
  let pgbouncerDiagnostics;
  let postgresDiagnostics;
  for (const [index, gateway] of gateways.entries()) {
    gateway.stdout?.on("data", (chunk) => {
      gatewayOutputs[index] += chunk.toString();
    });
    gateway.stderr?.on("data", (chunk) => {
      gatewayOutputs[index] += chunk.toString();
    });
  }

  let exitCode = 1;
  try {
    for (const [index, gateway] of gateways.entries()) {
      await waitForGateway(
        baseUrls[index],
        Number.parseInt(options.startupTimeoutMs, 10),
        gateway,
        { fetch: fetchFn, sleep: sleepFn },
      );
    }
    gatewayDatabaseDiagnostics = addGatewayDatabaseDiagnosticsSnapshot(
      gatewayDatabaseDiagnostics,
      "before",
      await collectGatewayDatabaseDiagnostics(baseUrls, { fetch: fetchFn }),
    );
    if (ingressEnabled(options)) {
      for (const [index, ingressBaseURL] of ingressBaseURLs.entries()) {
        const ingress = spawnIngressProxy(baseUrls, options, index, spawnProcess);
        ingresses.push(ingress);
        ingressOutputs.push("");
        ingress.stdout?.on("data", (chunk) => {
          ingressOutputs[index] += chunk.toString();
        });
        ingress.stderr?.on("data", (chunk) => {
          ingressOutputs[index] += chunk.toString();
        });
        await waitForGateway(
          ingressBaseURL,
          Number.parseInt(options.startupTimeoutMs, 10),
          ingress,
          { fetch: fetchFn, sleep: sleepFn },
        );
      }
    }
    pgbouncerDiagnostics = addPgbouncerDiagnosticsSnapshot(
      pgbouncerDiagnostics,
      "before",
      collectPgbouncerDiagnostics(options, { spawnSync: spawnCommandSync }),
    );
    const benchmarkCommand = buildBenchmarkCommand(
      options,
      ingressEnabled(options) ? ingressBaseURLs : baseUrls,
    );
    const benchmarkRun = await runBenchmarkWithPostgresDiagnostics(options, benchmarkCommand, {
      spawn: spawnProcess,
      spawnSync: spawnCommandSync,
      sleep: sleepFn,
    });
    const result = benchmarkRun.result;
    postgresDiagnostics = benchmarkRun.postgresDiagnostics;
    replayCapturedOutput(result);
    exitCode = result.error ? 1 : result.status ?? 1;
    gatewayDatabaseDiagnostics = addGatewayDatabaseDiagnosticsSnapshot(
      gatewayDatabaseDiagnostics,
      "after",
      await collectGatewayDatabaseDiagnostics(baseUrls, { fetch: fetchFn }),
    );
    pgbouncerDiagnostics = addPgbouncerDiagnosticsSnapshot(
      pgbouncerDiagnostics,
      "after",
      collectPgbouncerDiagnostics(options, { spawnSync: spawnCommandSync }),
    );
    if (exitCode !== 0) {
      const benchmarkOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      const message = result.error?.message ?? extractFailureMessage(benchmarkOutput, exitCode);
      writeFailureReport(options, {
        exitCode,
        errorMessage: message,
        gatewayOutput: combineGatewayOutput(gatewayOutputs, ingressOutputs),
        benchmarkOutput,
        gatewayExitCode: gatewayExitCodes(gateways),
        gatewaySignal: gatewaySignals(gateways),
        ingressExitCode: processExitCodes(ingresses),
        ingressSignal: processSignals(ingresses),
        gatewayDatabaseDiagnostics,
        pgbouncerDiagnostics,
        postgresDiagnostics,
      });
    } else {
      enhanceSuccessReport(options, gatewayDatabaseDiagnostics, pgbouncerDiagnostics, postgresDiagnostics);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(maskSensitive(message));
    const gatewayOutput = combineGatewayOutput(gatewayOutputs, ingressOutputs);
    if (gatewayOutput.trim()) {
      console.error(maskSensitive(gatewayOutput.trim()));
    }
    writeFailureReport(options, {
      exitCode: 1,
      errorMessage: message,
      gatewayOutput,
      gatewayExitCode: gatewayExitCodes(gateways),
      gatewaySignal: gatewaySignals(gateways),
      ingressExitCode: processExitCodes(ingresses),
      ingressSignal: processSignals(ingresses),
      gatewayDatabaseDiagnostics,
      pgbouncerDiagnostics,
      postgresDiagnostics,
    });
    exitCode = 1;
  } finally {
    for (const ingress of ingresses) {
      stopGateway(ingress, spawnCommandSync);
    }
    for (const gateway of gateways) {
      stopGateway(gateway, spawnCommandSync);
    }
    await sleepFn(500);
  }

  return exitCode;
}

export async function waitForGateway(baseUrl, startupTimeoutMs, processHandle, dependencies = {}) {
  const fetchFn = dependencies.fetch ?? fetch;
  const sleepFn = dependencies.sleep ?? sleep;
  const deadline = Date.now() + startupTimeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error(`identity gateway exited early with code ${processHandle.exitCode}`);
    }
    try {
      const response = await fetchFn(`${baseUrl}/health`);
      if (response.ok) return;
      lastError = `health status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleepFn(250);
  }
  throw new Error(`identity gateway did not become healthy: ${lastError}`);
}

function writeFailureReport(options, details) {
  const report = buildFailureReport({ options, ...details });
  writeJsonReport(options.out, report);
}

function addGatewayDatabaseDiagnosticsSnapshot(current, name, snapshot) {
  if (!snapshot) return current;
  return {
    ...(current ?? {}),
    [name]: snapshot,
  };
}

function addPgbouncerDiagnosticsSnapshot(current, name, snapshot) {
  if (!snapshot) return current;
  return {
    ...(current ?? {}),
    [name]: snapshot,
  };
}

function spawnGateway(baseUrl, options, index, spawnProcess) {
  return spawnProcess(
    "go",
    ["run", "./services/identity-access-gateway/cmd/gateway"],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PORT: gatewayPort(baseUrl, options.port),
        SESSION_DATABASE_URL: options.dsn,
        SESSION_DB_MAX_CONNS: options.sessionDbMaxConns,
        SESSION_DB_MIN_CONNS: options.sessionDbMinConns,
        SESSION_DB_PREWARM_CONNS: options.sessionDbPrewarmConns,
        SESSION_DB_READ_MAX_CONNS: options.sessionDbReadMaxConns,
        SESSION_DB_READ_MIN_CONNS: options.sessionDbReadMinConns,
        SESSION_DB_READ_PREWARM_CONNS: options.sessionDbReadPrewarmConns,
        SESSION_DB_WRITE_CONCURRENCY: options.sessionDbWriteConcurrency,
        SESSION_ACCESS_CACHE_MAX_ENTRIES: options.sessionAccessCacheMaxEntries,
        SESSION_ACCESS_CACHE_TTL_MS: options.sessionAccessCacheTtlMs,
        IDENTITY_TOKEN_OWNER: `g${index}`,
        ...gatewaySessionQueryExecModeEnv(options),
        ...gatewaySessionPersistenceEnv(options),
        BOOTSTRAP_PASSWORD: "ueacd",
        CHANNEL_SIGNATURE_SECRET: "ueacd",
        INTERNAL_DIAGNOSTICS_SECRET: identityInternalDiagnosticsSecretValue,
      },
    },
  );
}

function spawnIngressProxy(baseUrls, options, index, spawnProcess) {
  return spawnProcess(
    "go",
    [
      "run",
      "./services/identity-access-gateway/cmd/ingressproxy",
      "-listen",
      `:${ingressPortAt(options, index)}`,
      "-upstreams",
      baseUrls.join(","),
      "-max-conns-per-host",
      options.ingressMaxConnsPerHost,
      "-warm-connections-per-host",
      options.ingressWarmConnectionsPerHost,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
      },
    },
  );
}

function replayCapturedOutput(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) console.error(maskSensitive(result.error.message));
}

export function extractFailureMessage(output, exitCode) {
  const lines = tailText(output, 20).split(/\r\n|\r|\n/u).filter(Boolean);
  const phaseFailure = lines.find((line) => /failed with \d+ errors/u.test(line));
  if (phaseFailure) return phaseFailure;
  return lines.at(-1) || `identity HTTP benchmark exited with code ${exitCode}`;
}

function stopGateway(processHandle, spawnCommandSync = spawnSync) {
  if (processHandle.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnCommandSync("taskkill", ["/PID", String(processHandle.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  processHandle.kill("SIGTERM");
}

function enhanceSuccessReport(options, gatewayDatabaseDiagnostics, pgbouncerDiagnostics, postgresDiagnostics) {
  if (!options.out || !fs.existsSync(options.out)) return;
  const report = JSON.parse(fs.readFileSync(options.out, "utf8"));
  writeJsonReport(
    options.out,
    addRuntimeProfileToReport(report, options, gatewayDatabaseDiagnostics, pgbouncerDiagnostics, postgresDiagnostics),
  );
}

export function addIngressProfileToReport(report, options) {
  return addRuntimeProfileToReport(report, options);
}

export function addRuntimeProfileToReport(report, options, gatewayDatabaseDiagnostics, pgbouncerDiagnostics, postgresDiagnostics) {
  const enhanced = {
    ...report,
    gatewayWorkerCount: gatewayCount(options),
    gatewayDatabaseProfile: gatewayDatabaseProfile(options),
    benchmarkRuntimeProfile: benchmarkRuntimeProfile(options, benchmarkBaseUrls(options)),
  };
  if (gatewayDatabaseDiagnostics) {
    enhanced.gatewayDatabaseDiagnostics = gatewayDatabaseDiagnostics;
  }
  if (pgbouncerDiagnostics) {
    enhanced.pgbouncerDiagnostics = pgbouncerDiagnostics;
  }
  if (postgresDiagnostics) {
    enhanced.postgresDiagnostics = postgresDiagnostics;
  }
  const enhancedWithLimiterSummary = addGatewayWriteLimiterSummary(enhanced, gatewayDatabaseDiagnostics);
  if (!ingressEnabled(options)) return enhancedWithLimiterSummary;
  return {
    ...enhancedWithLimiterSummary,
    ingressProfile: ingressProfile(options),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runIdentityHttpBenchmark();
  process.exit(exitCode);
}
