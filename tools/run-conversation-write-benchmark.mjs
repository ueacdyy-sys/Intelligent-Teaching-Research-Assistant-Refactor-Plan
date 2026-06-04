import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { collectPgbouncerDiagnostics } from "./pgbouncer-diagnostics.mjs";
import { applyBenchmarkRuntimeArg, benchmarkRuntimeDefaults, benchmarkRuntimeProfile as buildBenchmarkRuntimeProfile, benchmarkTargetBaseUrls, buildBenchmarkRuntimeCommand } from "./conversation-benchmark-runtime.mjs";
import { combineOutput, executableName, expectedConversationStatus, extractFailureMessage, gatewayCommandLogPath, gatewayCount, gatewayDatabaseProfile, gatewayWriteProfile, ingressCount, ingressEnabled, ingressProfile, loadBalancingStrategy, maskURL, parseBooleanOption, parseIntegerOption, parsePositiveIntegerOption, parseURL, portFromOptions, portRange, transportProfile, trimURL, writeAcceptanceMode, writeBatchMode } from "./conversation-write-benchmark-profiles.mjs";
import { tailText, writeJsonReport } from "./benchmark-runner-utils.mjs";
import { applyPostgresDiagnosticsArg, collectPostgresDiagnostics, postgresDiagnosticsDefaults, startPostgresDiagnosticsTimeline } from "./postgres-diagnostics.mjs";

export const defaults = {
  dsn: "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable",
  baseUrl: "http://127.0.0.1:18080",
  port: "18080",
  out: "reports/conversation-write-http-benchmark.current.json",
  concurrency: "64",
  operations: "300",
  dbMaxConns: "8",
  gatewayCount: "1",
  writeBatchSize: "1",
  writeBatchDelayMs: "0",
  writeBatchWorkers: "1",
  writeBatchMode: "insert",
  writeAcceptanceMode: "sync",
  commandLogDir: "reports/conversation-command-log",
  commandLogAppendBatchSize: "32",
  commandLogAppendDelayMs: "0",
  commandLogQueueCapacity: "65536",
  commandLogProjectionWorkers: "4",
  commandLogSync: "true",
  commandLogSettleTimeoutMs: "0",
  commandLogSettlePollMs: "100",
  agentApiKey: "ueacd",
  maxConnsPerHost: "0",
  warmConnectionsPerHost: "0",
  warmConnectionRetries: "3",
  clientTrace: "false",
  ...benchmarkRuntimeDefaults,
  ingressProxy: "false",
  ingressPort: "19080",
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
  postgresDiagnosticsRelations: "research_conversations",
  timeout: "120s",
  startupTimeoutMs: "120000",
};

const localSecretValue = "ueacd";
const gatewayDiagnosticsPath = "/internal/conversation/db-pool";
const gatewayRuntimeDiagnosticsPath = "/internal/conversation/runtime";
const gatewayCommandLogDiagnosticsPath = "/internal/conversation/command-log";
const internalDiagnosticsSecretHeader = "X-Internal-Diagnostics-Secret";
const internalDiagnosticsSecretValue = "ueacd";

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
    if (key === "--dsn") parsed.dsn = value;
    if (key === "--base-url") parsed.baseUrl = value;
    if (key === "--port") parsed.port = value;
    if (key === "--out") parsed.out = value;
    if (key === "--concurrency") parsed.concurrency = value;
    if (key === "--operations") parsed.operations = value;
    if (key === "--db-max-conns") parsed.dbMaxConns = value;
    if (key === "--gateway-count") parsed.gatewayCount = value;
    if (key === "--write-batch-size") parsed.writeBatchSize = value;
    if (key === "--write-batch-delay-ms") parsed.writeBatchDelayMs = value;
    if (key === "--write-batch-workers") parsed.writeBatchWorkers = value;
    if (key === "--write-batch-mode") parsed.writeBatchMode = value;
    if (key === "--write-acceptance-mode") parsed.writeAcceptanceMode = value;
    if (key === "--command-log-dir") parsed.commandLogDir = value;
    if (key === "--command-log-append-batch-size") parsed.commandLogAppendBatchSize = value;
    if (key === "--command-log-append-delay-ms") parsed.commandLogAppendDelayMs = value;
    if (key === "--command-log-queue-capacity") parsed.commandLogQueueCapacity = value;
    if (key === "--command-log-projection-workers") parsed.commandLogProjectionWorkers = value;
    if (key === "--command-log-sync") parsed.commandLogSync = value;
    if (key === "--command-log-settle-timeout-ms") parsed.commandLogSettleTimeoutMs = value;
    if (key === "--command-log-settle-poll-ms") parsed.commandLogSettlePollMs = value;
    if (key === "--agent-api-key") parsed.agentApiKey = value;
    if (key === "--max-conns-per-host") parsed.maxConnsPerHost = value;
    if (key === "--warm-connections-per-host") parsed.warmConnectionsPerHost = value;
    if (key === "--warm-connection-retries") parsed.warmConnectionRetries = value;
    if (key === "--client-trace") parsed.clientTrace = value;
    if (applyBenchmarkRuntimeArg(parsed, key, value)) { index += 1; continue; }
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

export function gatewayBaseUrls(options) {
  const count = gatewayCount(options);
  const base = parseURL(options.baseUrl);
  const basePort = portFromOptions(options, base);
  const urls = [];
  for (let index = 0; index < count; index += 1) {
    const value = new URL(base);
    value.port = String(basePort + index);
    urls.push(trimURL(value.toString()));
  }
  return urls;
}

export function ingressBaseUrls(options) {
  if (!ingressEnabled(options)) return [];
  const count = ingressCount(options);
  const base = parseURL(options.baseUrl);
  const basePort = parseIntegerOption(options.ingressPort);
  const urls = [];
  for (let index = 0; index < count; index += 1) {
    const value = new URL(base);
    value.port = String(basePort + index);
    urls.push(trimURL(value.toString()));
  }
  return urls;
}

export function benchmarkBaseUrls(options) {
  return ingressEnabled(options) ? ingressBaseUrls(options) : gatewayBaseUrls(options);
}

export function validateRuntimePortPlan(options) {
  const base = parseURL(options.baseUrl);
  const basePort = portFromOptions(options, base);
  if (basePort <= 0) {
    throw new Error("base-url port must be positive");
  }
  if (!ingressEnabled(options)) return;
  const ingressPort = parseIntegerOption(options.ingressPort);
  if (ingressPort <= 0) {
    throw new Error("ingress-port must be positive");
  }
  const gatewayPorts = portRange(basePort, gatewayCount(options));
  const ingressPorts = portRange(ingressPort, ingressCount(options));
  const overlaps = ingressPorts.filter((port) => gatewayPorts.includes(port));
  if (overlaps.length > 0) {
    throw new Error(
      `conversation benchmark ingress/gateway port overlap: ${overlaps.join(", ")}`,
    );
  }
}

export function validateLocalSecrets(options) {
  if (options.agentApiKey !== localSecretValue) {
    throw new Error("agent-api-key must be ueacd for local performance evidence");
  }
  const parsed = parseURL(options.dsn);
  if (parsed.password !== localSecretValue) {
    throw new Error("dsn password must be ueacd for local performance evidence");
  }
}

export const collectGatewayDatabaseDiagnostics = (baseUrls, dependencies = {}) =>
  collectGatewayInternalDiagnostics(baseUrls, gatewayDiagnosticsPath, dependencies);
export const collectGatewayRuntimeDiagnostics = (baseUrls, dependencies = {}) =>
  collectGatewayInternalDiagnostics(baseUrls, gatewayRuntimeDiagnosticsPath, dependencies);
export const collectGatewayCommandLogDiagnostics = (baseUrls, dependencies = {}) =>
  collectGatewayInternalDiagnostics(baseUrls, gatewayCommandLogDiagnosticsPath, dependencies);

async function collectGatewayInternalDiagnostics(baseUrls, endpointPath, dependencies = {}) {
  const fetchFn = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const gateways = [];
  for (const baseUrl of baseUrls) {
    const trimmedBaseUrl = trimURL(baseUrl);
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
  return { endpoint: endpointPath, secretHeader: internalDiagnosticsSecretHeader, sampledAt: now(), gateways };
}

export function buildBenchmarkCommand(options, baseUrls = benchmarkBaseUrls(options)) {
  const args = [
    "run",
    "./services/conversation-write-gateway/cmd/httpbench",
    "--base-url",
    benchmarkTargetBaseUrls(options, baseUrls).join(","),
    "--agent-api-key",
    options.agentApiKey,
    "--concurrency",
    String(parseIntegerOption(options.concurrency)),
    "--operations",
    String(parseIntegerOption(options.operations)),
    "--max-conns-per-host",
    String(parseIntegerOption(options.maxConnsPerHost)),
    "--warm-connections-per-host",
    String(parseIntegerOption(options.warmConnectionsPerHost)),
    "--warm-connection-retries",
    String(parseIntegerOption(options.warmConnectionRetries)),
    "--expected-status",
    String(expectedConversationStatus(options)),
    "--out",
    options.out,
    "--timeout",
    options.timeout,
  ];
  if (parseBooleanOption(options.clientTrace)) {
    args.push("--client-trace");
  }
  return buildBenchmarkRuntimeCommand(options, args);
}

export function buildFailureReport({
  options,
  exitCode,
  errorMessage,
  gatewayOutput = "",
  benchmarkOutput = "",
  ingressOutput = "",
  gatewayExitCode,
  gatewaySignal,
  ingressExitCode,
  ingressSignal,
  gatewayDatabaseDiagnostics,
  gatewayRuntimeDiagnostics,
  gatewayCommandLogDiagnostics,
  pgbouncerDiagnostics,
  postgresDiagnostics,
  generatedAt = new Date().toISOString(),
}) {
  const baseUrls = gatewayBaseUrls(options);
  const targetBaseUrls = benchmarkBaseUrls(options);
  const report = {
    generatedAt,
    benchmarkKind: "conversation_write_gateway",
    workloadType: "HTTP_BENCHMARK",
    status: "FAILED",
    baseUrl: maskURL(options.baseUrl),
    concurrency: parseIntegerOption(options.concurrency),
    operations: parseIntegerOption(options.operations),
    gatewayCount: gatewayCount(options),
    gatewayBaseUrls: baseUrls.map(maskURL),
    loadBalancingStrategy: loadBalancingStrategy(options, targetBaseUrls),
    gatewayDatabaseProfile: gatewayDatabaseProfile(options),
    gatewayWriteProfile: gatewayWriteProfile(options),
    benchmarkRuntimeProfile: benchmarkRuntimeProfile(options, targetBaseUrls),
    transportProfile: transportProfile(options, targetBaseUrls.length),
    clientTraceEnabled: parseBooleanOption(options.clientTrace),
    exitCode,
    errorMessage: maskSensitive(errorMessage) || `conversation write benchmark exited with code ${exitCode}`,
    gatewayOutputTail: tailText(maskSensitive(gatewayOutput), 80),
    benchmarkOutputTail: tailText(maskSensitive(benchmarkOutput), 80),
  };
  if (ingressEnabled(options)) report.ingressProfile = ingressProfile(options, ingressBaseUrls(options), gatewayCount(options));
  if (gatewayExitCode !== undefined) report.gatewayExitCode = gatewayExitCode;
  if (gatewaySignal !== undefined) report.gatewaySignal = gatewaySignal;
  if (ingressExitCode !== undefined) report.ingressExitCode = ingressExitCode;
  if (ingressSignal !== undefined) report.ingressSignal = ingressSignal;
  if (ingressOutput) report.ingressOutputTail = tailText(maskSensitive(ingressOutput), 80);
  if (gatewayDatabaseDiagnostics) report.gatewayDatabaseDiagnostics = gatewayDatabaseDiagnostics;
  if (gatewayRuntimeDiagnostics) report.gatewayRuntimeDiagnostics = gatewayRuntimeDiagnostics;
  if (gatewayCommandLogDiagnostics) report.gatewayCommandLogDiagnostics = gatewayCommandLogDiagnostics;
  if (pgbouncerDiagnostics) report.pgbouncerDiagnostics = pgbouncerDiagnostics;
  if (postgresDiagnostics) report.postgresDiagnostics = postgresDiagnostics;
  return report;
}

export function addRuntimeProfileToReport(report, options, baseUrls = benchmarkBaseUrls(options), diagnostics = {}) {
  const gatewayUrls = gatewayBaseUrls(options);
  const enriched = {
    ...report,
    gatewayCount: gatewayCount(options),
    gatewayBaseUrls: gatewayUrls.map(maskURL),
    loadBalancingStrategy: ingressEnabled(options) ? "INGRESS_ROUND_ROBIN" : report.loadBalancingStrategy,
    gatewayWorkerCount: gatewayCount(options),
    gatewayDatabaseProfile: gatewayDatabaseProfile(options),
    gatewayWriteProfile: gatewayWriteProfile(options),
    benchmarkRuntimeProfile: benchmarkRuntimeProfile(options, baseUrls),
    transportProfile: report.transportProfile ?? transportProfile(options, baseUrls.length),
    clientTraceEnabled: parseBooleanOption(options.clientTrace),
  };
  if (ingressEnabled(options)) enriched.ingressProfile = ingressProfile(options, ingressBaseUrls(options), gatewayCount(options));
  if (diagnostics.gatewayExitCode !== undefined) enriched.gatewayExitCode = diagnostics.gatewayExitCode;
  if (diagnostics.gatewaySignal !== undefined) enriched.gatewaySignal = diagnostics.gatewaySignal;
  if (diagnostics.gatewayOutput) enriched.gatewayOutputTail = tailText(maskSensitive(diagnostics.gatewayOutput), 80);
  if (diagnostics.ingressExitCode !== undefined) enriched.ingressExitCode = diagnostics.ingressExitCode;
  if (diagnostics.ingressSignal !== undefined) enriched.ingressSignal = diagnostics.ingressSignal;
  if (diagnostics.ingressOutput) enriched.ingressOutputTail = tailText(maskSensitive(diagnostics.ingressOutput), 80);
  if (diagnostics.gatewayDatabaseDiagnostics) {
    enriched.gatewayDatabaseDiagnostics = diagnostics.gatewayDatabaseDiagnostics;
  }
  if (diagnostics.gatewayRuntimeDiagnostics) {
    enriched.gatewayRuntimeDiagnostics = diagnostics.gatewayRuntimeDiagnostics;
  }
  if (diagnostics.gatewayCommandLogDiagnostics) {
    enriched.gatewayCommandLogDiagnostics = diagnostics.gatewayCommandLogDiagnostics;
  }
  if (diagnostics.pgbouncerDiagnostics) enriched.pgbouncerDiagnostics = diagnostics.pgbouncerDiagnostics;
  if (diagnostics.postgresDiagnostics) enriched.postgresDiagnostics = diagnostics.postgresDiagnostics;
  return enriched;
}

export function maskSensitive(value) {
  return String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/giu, "[database-url]")
    .replaceAll(localSecretValue, "***");
}

export async function runConversationWriteBenchmark(options = parseArgs(process.argv.slice(2)), dependencies = {}) {
  validateRuntimePortPlan(options);
  validateLocalSecrets(options);
  const root = dependencies.root ?? process.cwd();
  const spawnProcess = dependencies.spawnProcess ?? spawn;
  const spawnCommandSync = dependencies.spawnCommandSync ?? spawnSync;
  const baseUrls = gatewayBaseUrls(options);
  const targetBaseUrls = benchmarkBaseUrls(options);
  const gateways = [];
  const ingresses = [];
  const gatewayOutputs = [];
  const ingressOutputs = [];
  let benchmarkOutput = "";
  let gatewayDatabaseDiagnostics;
  let gatewayRuntimeDiagnostics;
  let gatewayCommandLogDiagnostics;
  let pgbouncerDiagnostics;
  let postgresDiagnostics;
  let postgresDiagnosticsTimeline;
  let reportWritten = false;
  const fetchFn = dependencies.fetch ?? fetch;

  try {
    const gatewayBinary = buildGatewayBinary(root, spawnCommandSync);
    for (const [index, baseUrl] of baseUrls.entries()) {
      const gateway = spawnGateway(gatewayBinary, options, baseUrl, root, spawnProcess);
      gateways.push(gateway);
      gatewayOutputs.push("");
      gateway.stdout?.on("data", (chunk) => {
        gatewayOutputs[index] += chunk.toString();
      });
      gateway.stderr?.on("data", (chunk) => {
        gatewayOutputs[index] += chunk.toString();
      });
    }
    await waitForGateways(baseUrls, parseIntegerOption(options.startupTimeoutMs), fetchFn);
    if (ingressEnabled(options)) {
      const ingressBinary = buildIngressProxyBinary(root, spawnCommandSync);
      for (const [index, ingressBaseUrl] of targetBaseUrls.entries()) {
        const ingress = spawnIngressProxy(ingressBinary, options, ingressBaseUrl, baseUrls, root, spawnProcess);
        ingresses.push(ingress);
        ingressOutputs.push("");
        ingress.stdout?.on("data", (chunk) => {
          ingressOutputs[index] += chunk.toString();
        });
        ingress.stderr?.on("data", (chunk) => {
          ingressOutputs[index] += chunk.toString();
        });
      }
      await waitForGateways(targetBaseUrls, parseIntegerOption(options.startupTimeoutMs), fetchFn);
    }

    gatewayDatabaseDiagnostics = addDiagnosticsSnapshot(
      gatewayDatabaseDiagnostics,
      "before",
      await collectGatewayDatabaseDiagnostics(baseUrls, { fetch: fetchFn }),
    );
    gatewayRuntimeDiagnostics = addDiagnosticsSnapshot(
      gatewayRuntimeDiagnostics,
      "before",
      await collectGatewayRuntimeDiagnostics(baseUrls, { fetch: fetchFn }),
    );
    gatewayCommandLogDiagnostics = addDiagnosticsSnapshot(
      gatewayCommandLogDiagnostics,
      "before",
      await collectGatewayCommandLogDiagnostics(baseUrls, { fetch: fetchFn }),
    );
    pgbouncerDiagnostics = addDiagnosticsSnapshot(
      pgbouncerDiagnostics,
      "before",
      collectPgbouncerDiagnostics(options, { spawnSync: spawnCommandSync }),
    );
    postgresDiagnostics = addDiagnosticsSnapshot(
      postgresDiagnostics,
      "before",
      collectPostgresDiagnostics(options, { spawnSync: spawnCommandSync }),
    );
    postgresDiagnosticsTimeline = startPostgresDiagnosticsTimeline(options, {
      spawnSync: spawnCommandSync,
      sleep: dependencies.sleep ?? sleep,
    });
    const command = buildBenchmarkCommand(options, targetBaseUrls);
    removeExistingReport(options.out);
    const result = await runCommand(command[0], command.slice(1), root, spawnProcess, (chunk) => {
      benchmarkOutput += chunk;
    });
    postgresDiagnostics = addDiagnosticsSnapshot(
      postgresDiagnostics,
      "timeline",
      await stopDiagnosticsTimeline(postgresDiagnosticsTimeline),
    );
    postgresDiagnosticsTimeline = undefined;
    postgresDiagnostics = addDiagnosticsSnapshot(
      postgresDiagnostics,
      "after",
      collectPostgresDiagnostics(options, { spawnSync: spawnCommandSync }),
    );
    gatewayDatabaseDiagnostics = addDiagnosticsSnapshot(
      gatewayDatabaseDiagnostics,
      "after",
      await collectGatewayDatabaseDiagnostics(baseUrls, { fetch: fetchFn }),
    );
    gatewayRuntimeDiagnostics = addDiagnosticsSnapshot(
      gatewayRuntimeDiagnostics,
      "after",
      await collectGatewayRuntimeDiagnostics(baseUrls, { fetch: fetchFn }),
    );
    gatewayCommandLogDiagnostics = addDiagnosticsSnapshot(
      gatewayCommandLogDiagnostics,
      "after",
      await collectGatewayCommandLogDiagnostics(baseUrls, { fetch: fetchFn }),
    );
    gatewayCommandLogDiagnostics = await collectSettledCommandLogDiagnostics(
      gatewayCommandLogDiagnostics,
      baseUrls,
      options,
      {
        fetch: fetchFn,
        sleep: dependencies.sleep ?? sleep,
      },
    );
    pgbouncerDiagnostics = addDiagnosticsSnapshot(
      pgbouncerDiagnostics,
      "after",
      collectPgbouncerDiagnostics(options, { spawnSync: spawnCommandSync }),
    );
    const report = readReportOrFailure(options, {
      exitCode: result.exitCode,
      errorMessage: extractFailureMessage(benchmarkOutput, result.exitCode),
      gatewayOutput: combineOutput(gatewayOutputs, "gateway"),
      benchmarkOutput,
      gatewayExitCode: processExitCodes(gateways),
      gatewaySignal: processSignals(gateways),
      ingressExitCode: processExitCodes(ingresses),
      ingressSignal: processSignals(ingresses),
      ingressOutput: combineOutput(ingressOutputs, "ingress"),
      gatewayDatabaseDiagnostics,
      gatewayRuntimeDiagnostics,
      gatewayCommandLogDiagnostics,
      pgbouncerDiagnostics,
      postgresDiagnostics,
    });
    const enriched = addRuntimeProfileToReport(report, options, targetBaseUrls, {
      gatewayExitCode: processExitCodes(gateways),
      gatewaySignal: processSignals(gateways),
      gatewayOutput: combineOutput(gatewayOutputs, "gateway"),
      ingressExitCode: processExitCodes(ingresses),
      ingressSignal: processSignals(ingresses),
      ingressOutput: combineOutput(ingressOutputs, "ingress"),
      gatewayDatabaseDiagnostics,
      gatewayRuntimeDiagnostics,
      gatewayCommandLogDiagnostics,
      pgbouncerDiagnostics,
      postgresDiagnostics,
    });
    writeJsonReport(options.out, enriched);
    reportWritten = true;
    if (result.exitCode !== 0) {
      throw new Error(enriched.errorMessage ?? `conversation write benchmark exited with code ${result.exitCode}`);
    }
    return enriched;
  } catch (error) {
    if (reportWritten) {
      throw error;
    }
    postgresDiagnostics = addDiagnosticsSnapshot(
      postgresDiagnostics,
      "timeline",
      await stopDiagnosticsTimeline(postgresDiagnosticsTimeline),
    );
    postgresDiagnosticsTimeline = undefined;
    const report = buildFailureReport({
      options,
      exitCode: 1,
      errorMessage: error.message,
      gatewayOutput: combineOutput(gatewayOutputs, "gateway"),
      benchmarkOutput,
      gatewayExitCode: processExitCodes(gateways),
      gatewaySignal: processSignals(gateways),
      ingressExitCode: processExitCodes(ingresses),
      ingressSignal: processSignals(ingresses),
      ingressOutput: combineOutput(ingressOutputs, "ingress"),
      gatewayDatabaseDiagnostics,
      gatewayRuntimeDiagnostics,
      pgbouncerDiagnostics,
      postgresDiagnostics,
    });
    writeJsonReport(options.out, report);
    throw error;
  } finally {
    for (const ingress of ingresses) {
      stopGateway(ingress, spawnCommandSync);
    }
    for (const gateway of gateways) {
      stopGateway(gateway, spawnCommandSync);
    }
  }
}

function buildGatewayBinary(root, spawnCommandSync) {
  const binaryPath = path.join(root, "tmp", "bin", executableName("conversation-write-gateway-runner"));
  fs.mkdirSync(path.dirname(binaryPath), { recursive: true });
  const result = spawnCommandSync("go", [
    "build",
    "-o",
    binaryPath,
    "./services/conversation-write-gateway/cmd/gateway",
  ], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0 || result.error) {
    throw new Error(`build conversation write gateway failed: ${result.error?.message ?? result.stderr}`);
  }
  return binaryPath;
}

function buildIngressProxyBinary(root, spawnCommandSync) {
  const binaryPath = path.join(root, "tmp", "bin", executableName("conversation-write-ingressproxy-runner"));
  fs.mkdirSync(path.dirname(binaryPath), { recursive: true });
  const result = spawnCommandSync("go", [
    "build",
    "-o",
    binaryPath,
    "./services/conversation-write-gateway/cmd/ingressproxy",
  ], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0 || result.error) {
    throw new Error(`build conversation write ingress proxy failed: ${result.error?.message ?? result.stderr}`);
  }
  return binaryPath;
}

function spawnGateway(binaryPath, options, baseUrl, root, spawnProcess) {
  const url = parseURL(baseUrl);
  const commandLogPath = gatewayCommandLogPath(options, root, url.port);
  if (writeAcceptanceMode(options) === "durable-log") {
    fs.mkdirSync(path.dirname(commandLogPath), { recursive: true });
    fs.rmSync(commandLogPath, { force: true });
  }
  return spawnProcess(binaryPath, [], {
    cwd: root,
    shell: false,
    env: {
      ...process.env,
      PORT: url.port,
      DATABASE_URL: options.dsn,
      DB_MAX_CONNS: String(parseIntegerOption(options.dbMaxConns)),
      CONVERSATION_WRITE_BATCH_SIZE: String(parseIntegerOption(options.writeBatchSize)),
      CONVERSATION_WRITE_BATCH_DELAY_MS: String(parseIntegerOption(options.writeBatchDelayMs)),
      CONVERSATION_WRITE_BATCH_WORKERS: String(parsePositiveIntegerOption(options.writeBatchWorkers)),
      CONVERSATION_WRITE_BATCH_MODE: writeBatchMode(options),
      CONVERSATION_WRITE_ACCEPTANCE_MODE: writeAcceptanceMode(options),
      CONVERSATION_COMMAND_LOG_PATH: commandLogPath,
      CONVERSATION_COMMAND_LOG_APPEND_BATCH_SIZE: String(parsePositiveIntegerOption(options.commandLogAppendBatchSize)),
      CONVERSATION_COMMAND_LOG_APPEND_DELAY_MS: String(parseIntegerOption(options.commandLogAppendDelayMs)),
      CONVERSATION_COMMAND_LOG_QUEUE_CAPACITY: String(parsePositiveIntegerOption(options.commandLogQueueCapacity)),
      CONVERSATION_COMMAND_LOG_PROJECTION_WORKERS: String(parsePositiveIntegerOption(options.commandLogProjectionWorkers)),
      CONVERSATION_COMMAND_LOG_SYNC: String(parseBooleanOption(options.commandLogSync)),
      AGENT_API_KEY: options.agentApiKey,
      INTERNAL_DIAGNOSTICS_SECRET: internalDiagnosticsSecretValue,
    },
  });
}

function spawnIngressProxy(binaryPath, options, ingressBaseUrl, upstreamBaseUrls, root, spawnProcess) {
  const url = parseURL(ingressBaseUrl);
  return spawnProcess(binaryPath, [
    "-listen",
    `:${url.port}`,
    "-upstreams",
    upstreamBaseUrls.join(","),
    "-max-conns-per-host",
    String(parseIntegerOption(options.ingressMaxConnsPerHost)),
    "-warm-connections-per-host",
    String(parseIntegerOption(options.ingressWarmConnectionsPerHost)),
  ], {
    cwd: root,
    shell: false,
    env: {
      ...process.env,
    },
  });
}

async function waitForGateways(baseUrls, startupTimeoutMs, fetchFn) {
  const deadline = Date.now() + startupTimeoutMs;
  for (const baseUrl of baseUrls) {
    let lastError;
    while (Date.now() < deadline) {
      try {
        const response = await fetchFn(`${baseUrl}/health`);
        if (response.ok) break;
        lastError = new Error(`health status = ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      await sleep(200);
    }
    if (Date.now() >= deadline) {
      throw new Error(`gateway health check failed for ${baseUrl}: ${lastError?.message ?? "timeout"}`);
    }
  }
}

function runCommand(command, args, cwd, spawnProcess, onOutput) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, { cwd, shell: false });
    child.stdout?.on("data", (chunk) => onOutput(chunk.toString()));
    child.stderr?.on("data", (chunk) => onOutput(chunk.toString()));
    child.on("error", reject);
    child.on("close", (exitCode, signal) => resolve({ exitCode, signal }));
  });
}

function readReportOrFailure(options, failureContext) {
  if (fs.existsSync(options.out)) {
    try {
      return JSON.parse(fs.readFileSync(options.out, "utf8"));
    } catch {
      // Fall through to a generated failure report.
    }
  }
  return buildFailureReport({ options, ...failureContext });
}

function removeExistingReport(outPath) {
  fs.rmSync(outPath, { force: true });
}

function stopGateway(gateway, spawnCommandSync) {
  if (!gateway || gateway.exitCode !== null) return;
  if (process.platform === "win32" && gateway.pid) {
    spawnCommandSync("taskkill", ["/PID", String(gateway.pid), "/T", "/F"], {
      stdio: "ignore",
      shell: false,
    });
    return;
  }
  gateway.kill("SIGTERM");
}

function processExitCodes(processes) {
  if (processes.length === 0) return undefined;
  return processes.map((processValue) => processValue.exitCode);
}

function processSignals(processes) {
  if (processes.length === 0) return undefined;
  return processes.map((processValue) => processValue.signalCode);
}

function addDiagnosticsSnapshot(current, name, snapshot) {
  if (!snapshot) return current;
  return {
    ...(current ?? {}),
    [name]: snapshot,
  };
}

async function stopDiagnosticsTimeline(timeline) {
  if (!timeline) return undefined;
  return timeline.stop();
}

async function collectSettledCommandLogDiagnostics(current, baseUrls, options, dependencies = {}) {
  const timeoutMs = parseIntegerOption(options.commandLogSettleTimeoutMs);
  if (writeAcceptanceMode(options) !== "durable-log" || timeoutMs <= 0) return current;
  const pollMs = Math.max(10, parseIntegerOption(options.commandLogSettlePollMs));
  const sleepFn = dependencies.sleep ?? sleep;
  const fetchFn = dependencies.fetch ?? fetch;
  const deadline = Date.now() + timeoutMs;
  let latest = current;
  while (Date.now() <= deadline) {
    const snapshot = await collectGatewayCommandLogDiagnostics(baseUrls, { fetch: fetchFn });
    latest = addDiagnosticsSnapshot(latest, "settled", snapshot);
    if (commandLogSnapshotSettled(snapshot)) return latest;
    await sleepFn(pollMs);
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

export function benchmarkRuntimeProfile(options, baseUrls) {
  return buildBenchmarkRuntimeProfile(options, baseUrls, maskURL);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runConversationWriteBenchmark().catch((error) => {
    console.error(maskSensitive(error.message));
    process.exit(1);
  });
}
