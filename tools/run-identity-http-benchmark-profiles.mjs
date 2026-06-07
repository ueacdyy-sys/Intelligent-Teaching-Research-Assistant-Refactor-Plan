import { identityInternalDiagnosticsSecretValue } from "./identity-gateway-diagnostics.mjs";
import { addSessionPersistenceToDatabaseProfile } from "./identity-http-benchmark-session-profile.mjs";
import { sessionDbQueryExecModeForProfile } from "./identity-session-query-exec-mode-profile.mjs";
import {
  benchmarkRuntimeProfile as buildBenchmarkRuntimeProfile,
  benchmarkTargetBaseUrls as resolveBenchmarkTargetBaseUrls,
  buildBenchmarkRuntimeCommand,
} from "./conversation-benchmark-runtime.mjs";

const localSecretValues = ["ueacd"];

export function maskURL(value) {
  try {
    const parsed = new URL(value);
    if (!parsed.password) return value;
    parsed.password = "***";
    return parsed.toString();
  } catch {
    return value;
  }
}

export function gatewayCount(options) { return Math.max(1, parseIntegerOption(options.gatewayCount)); }

export function transportProfile(options) {
  const warmConnectionsPerHost = parseIntegerOption(options.warmConnectionsPerHost);
  const targetHostCount = ingressEnabled(options) ? ingressCount(options) : gatewayCount(options);
  return {
    maxConnsPerHost: parseIntegerOption(options.maxConnsPerHost),
    warmConnectionsPerHost,
    warmConnectionsTotal: targetHostCount * warmConnectionsPerHost,
  };
}

export function gatewayBaseUrls(options) {
  const count = gatewayCount(options);
  const urls = [];
  for (let index = 0; index < count; index += 1) {
    urls.push(gatewayBaseUrlAt(options, index));
  }
  return urls;
}

function gatewayBaseUrlAt(options, index) {
  try {
    const parsed = new URL(options.baseUrl);
    const basePort = Number.parseInt(parsed.port || options.port, 10);
    if (!Number.isNaN(basePort)) {
      parsed.port = String(basePort + index);
    }
    return trimURL(parsed.toString());
  } catch {
    return options.baseUrl;
  }
}

export function gatewayPort(baseUrl, fallback) {
  try {
    const parsed = new URL(baseUrl);
    return parsed.port || fallback;
  } catch {
    return fallback;
  }
}

export function gatewayExitCodes(gateways) { return processExitCodes(gateways); }

export function gatewaySignals(gateways) { return processSignals(gateways); }

export function processExitCodes(processes) {
  if (processes.length === 0) return undefined;
  const values = processes.map((processHandle) => processHandle.exitCode);
  return values.length === 1 ? values[0] : values;
}

export function processSignals(processes) {
  if (processes.length === 0) return undefined;
  const values = processes.map((processHandle) => processHandle.signalCode);
  return values.length === 1 ? values[0] : values;
}

export function combineGatewayOutput(outputs, ingressOutputs = []) {
  const ingressValues = Array.isArray(ingressOutputs) ? ingressOutputs : [ingressOutputs];
  const ingress = ingressValues
    .map((output, index) => output.trim() ? `[ingress ${index + 1}]\n${output.trim()}` : "")
    .filter(Boolean);
  return outputs
    .map((output, index) => output.trim() ? `[gateway ${index + 1}]\n${output.trim()}` : "")
    .concat(ingress)
    .filter(Boolean)
    .join("\n");
}

function trimURL(value) { return value.endsWith("/") ? value.slice(0, -1) : value; }

export function urlPort(value) {
  try {
    const parsed = new URL(value);
    if (parsed.port) return Number.parseInt(parsed.port, 10);
    if (parsed.protocol === "https:") return 443;
    if (parsed.protocol === "http:") return 80;
    return null;
  } catch {
    return null;
  }
}

export function maskSensitive(value) {
  let text = String(value ?? "").replace(/postgres:\/\/[^\s"']+/giu, "[masked-postgres-dsn]");
  for (const secret of localSecretValues) {
    text = text.replaceAll(secret, "***");
  }
  return text;
}

export function gatewayDatabaseProfile(options) {
  const workerCount = gatewayCount(options);
  const sessionDbMaxConnsPerWorker = parseIntegerOption(options.sessionDbMaxConns);
  const sessionDbMinConnsPerWorker = parseIntegerOption(options.sessionDbMinConns);
  const sessionDbPrewarmConnsPerWorker = parseIntegerOption(options.sessionDbPrewarmConns);
  const sessionDbReadMaxConnsPerWorker = parseIntegerOption(options.sessionDbReadMaxConns);
  const sessionDbReadMinConnsPerWorker = parseIntegerOption(options.sessionDbReadMinConns);
  const sessionDbReadPrewarmConnsPerWorker = parseIntegerOption(options.sessionDbReadPrewarmConns);
  const sessionDbWriteConcurrencyPerWorker = parseIntegerOption(options.sessionDbWriteConcurrency);
  const sessionAccessCacheMaxEntriesPerWorker = parseIntegerOption(options.sessionAccessCacheMaxEntries);
  return addSessionPersistenceToDatabaseProfile({
    workerCount,
    sessionDbMaxConnsPerWorker,
    sessionDbMaxConnsTotal: workerCount * sessionDbMaxConnsPerWorker,
    sessionDbMinConnsPerWorker,
    sessionDbMinConnsTotal: workerCount * sessionDbMinConnsPerWorker,
    sessionDbPrewarmConnsPerWorker,
    sessionDbPrewarmConnsTotal: workerCount * sessionDbPrewarmConnsPerWorker,
    sessionDbReadMaxConnsPerWorker,
    sessionDbReadMaxConnsTotal: workerCount * sessionDbReadMaxConnsPerWorker,
    sessionDbReadMinConnsPerWorker,
    sessionDbReadMinConnsTotal: workerCount * sessionDbReadMinConnsPerWorker,
    sessionDbReadPrewarmConnsPerWorker,
    sessionDbReadPrewarmConnsTotal: workerCount * sessionDbReadPrewarmConnsPerWorker,
    sessionDbQueryExecMode: sessionDbQueryExecModeForProfile(options),
    sessionDbWriteConcurrencyPerWorker,
    sessionDbWriteConcurrencyTotal: workerCount * sessionDbWriteConcurrencyPerWorker,
    sessionAccessCacheMaxEntriesPerWorker,
    sessionAccessCacheMaxEntriesTotal: workerCount * sessionAccessCacheMaxEntriesPerWorker,
    sessionAccessCacheTtlMs: parseIntegerOption(options.sessionAccessCacheTtlMs),
    tokenOwnerAffinity: true,
  }, options);
}

export function buildBenchmarkCommand(options, baseUrls) {
  const args = [
    "run",
    "./services/identity-access-gateway/cmd/httpbench",
    "-timeout",
    options.timeout,
    "-base-url",
    benchmarkTargetBaseUrls(options, baseUrls).join(","),
    "-gateway-diagnostics-base-url",
    gatewayDiagnosticsTargetBaseUrls(options).join(","),
    "-gateway-diagnostics-secret",
    identityInternalDiagnosticsSecretValue,
    "-out",
    options.out,
    "-concurrency",
    options.concurrency,
    "-operations",
    options.operations,
    "-warmup-operations",
    options.warmupOperations,
    "-max-conns-per-host",
    options.maxConnsPerHost,
    "-warm-connections-per-host",
    options.warmConnectionsPerHost,
  ];
  const [command, ...runtimeArgs] = buildBenchmarkRuntimeCommand(options, args);
  return { command, args: runtimeArgs };
}

export function benchmarkRuntimeProfile(options, baseUrls) {
  return buildBenchmarkRuntimeProfile(options, baseUrls);
}

export function ingressProfile(options) {
  return {
    enabled: ingressEnabled(options),
    workerCount: ingressCount(options),
    baseUrl: maskURL(ingressBaseUrl(options)),
    baseUrls: ingressBaseUrls(options).map(maskURL),
    upstreamBaseUrls: gatewayBaseUrls(options).map(maskURL),
    upstreamTransportProfile: ingressTransportProfile(options),
  };
}

function ingressTransportProfile(options) {
  const warmConnectionsPerHost = parseIntegerOption(options.ingressWarmConnectionsPerHost);
  return {
    maxConnsPerHost: parseIntegerOption(options.ingressMaxConnsPerHost),
    warmConnectionsPerHost,
    warmConnectionsTotal: ingressCount(options) * gatewayCount(options) * warmConnectionsPerHost,
  };
}

export function benchmarkBaseUrls(options) {
  return ingressEnabled(options) ? ingressBaseUrls(options) : gatewayBaseUrls(options);
}

function benchmarkTargetBaseUrls(options, baseUrls) {
  return resolveBenchmarkTargetBaseUrls(options, baseUrls);
}

export function gatewayDiagnosticsTargetBaseUrls(options) {
  return benchmarkTargetBaseUrls(options, gatewayBaseUrls(options));
}

export function ingressEnabled(options) {
  return ["1", "true", "yes", "on"].includes(String(options.ingressProxy).toLowerCase());
}

export function ingressCount(options) {
  return Math.max(1, parseIntegerOption(options.ingressCount));
}

export function ingressBaseUrls(options) {
  const urls = [];
  for (let index = 0; index < ingressCount(options); index += 1) {
    urls.push(ingressBaseUrlAt(options, index));
  }
  return urls;
}

function ingressBaseUrl(options) {
  return ingressBaseUrlAt(options, 0);
}

function ingressBaseUrlAt(options, index) {
  try {
    const parsed = new URL(options.baseUrl);
    parsed.port = String(ingressPortAt(options, index));
    return trimURL(parsed.toString());
  } catch {
    return `http://127.0.0.1:${ingressPortAt(options, index)}`;
  }
}

export function ingressPortAt(options, index) {
  const basePort = parseIntegerOption(options.ingressPort);
  return basePort + index;
}

export function parseIntegerOption(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function parseStrictIntegerOption(value, name) {
  const text = String(value ?? "").trim();
  if (!/^-?\d+$/u.test(text)) {
    throw new Error(`${name} must be an integer`);
  }
  return Number.parseInt(text, 10);
}
