import path from "node:path";

const localSecretValue = "ueacd";

export function maskSensitive(value) {
  return String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/giu, "[database-url]")
    .replaceAll(localSecretValue, "***");
}

export function gatewayDatabaseProfile(options, gatewayCountValue = gatewayCount(options)) {
  const workers = gatewayCountValue;
  const dbMaxConns = parseIntegerOption(options.dbMaxConns);
  return {
    workerCount: workers,
    dbMaxConnsPerWorker: dbMaxConns,
    dbMaxConnsTotal: workers * dbMaxConns,
  };
}

export function gatewayWriteProfile(options) {
  const batchSize = parseIntegerOption(options.writeBatchSize);
  const batchDelayMs = parseIntegerOption(options.writeBatchDelayMs);
  const batchWorkers = parsePositiveIntegerOption(options.writeBatchWorkers);
  const batchMode = writeBatchMode(options);
  return {
    acceptanceMode: writeAcceptanceMode(options),
    batchingEnabled: batchSize > 1,
    batchSize,
    batchDelayMs,
    batchWorkers,
    batchMode,
    commandLog: writeAcceptanceMode(options) === "durable-log" ? {
      appendBatchSize: parsePositiveIntegerOption(options.commandLogAppendBatchSize),
      appendDelayMs: parseIntegerOption(options.commandLogAppendDelayMs),
      queueCapacity: parsePositiveIntegerOption(options.commandLogQueueCapacity),
      projectionWorkers: parsePositiveIntegerOption(options.commandLogProjectionWorkers),
      sync: parseBooleanOption(options.commandLogSync),
      settleTimeoutMs: parseIntegerOption(options.commandLogSettleTimeoutMs),
    } : null,
  };
}

export function transportProfile(options, targetCount) {
  const warmConnectionsPerHost = parseIntegerOption(options.warmConnectionsPerHost);
  return {
    maxConnsPerHost: parseIntegerOption(options.maxConnsPerHost),
    warmConnectionsPerHost,
    warmConnectionsTotal: targetCount * warmConnectionsPerHost,
    warmConnectionStrategy: warmConnectionsPerHost > 0 ? "PER_HOST_PARALLEL" : "DISABLED",
    warmConnectionRetries: parseIntegerOption(options.warmConnectionRetries),
  };
}

export function ingressProfile(options, ingressBaseUrls, upstreamGatewayCount) {
  const warmConnectionsPerHost = parseIntegerOption(options.ingressWarmConnectionsPerHost);
  return {
    enabled: true,
    count: ingressCount(options),
    baseUrls: ingressBaseUrls.map(maskURL),
    upstreamGatewayCount,
    maxConnsPerHost: parseIntegerOption(options.ingressMaxConnsPerHost),
    warmConnectionsPerHost,
    warmConnectionsTotal: ingressCount(options) * warmConnectionsPerHost,
  };
}

export function writeBatchMode(options) {
  const normalized = String(options.writeBatchMode ?? "insert").trim().toLowerCase();
  if (normalized !== "insert" && normalized !== "copy") {
    throw new Error("write-batch-mode must be insert or copy");
  }
  return normalized;
}

export function writeAcceptanceMode(options) {
  const normalized = String(options.writeAcceptanceMode ?? "sync").trim().toLowerCase();
  if (normalized !== "sync" && normalized !== "durable-log") {
    throw new Error("write-acceptance-mode must be sync or durable-log");
  }
  return normalized;
}

export function expectedConversationStatus(options) {
  return writeAcceptanceMode(options) === "durable-log" ? 202 : 201;
}

export function gatewayCommandLogPath(options, root, port) {
  const commandLogDir = path.isAbsolute(options.commandLogDir)
    ? options.commandLogDir
    : path.join(root, options.commandLogDir);
  return path.join(commandLogDir, `conversation-commands-${port}.jsonl`);
}

export function loadBalancingStrategy(options, targetBaseUrls) {
  if (ingressEnabled(options)) return "INGRESS_ROUND_ROBIN";
  return targetBaseUrls.length > 1 ? "ROUND_ROBIN" : "SINGLE_GATEWAY";
}

export function gatewayCount(options) {
  return Math.max(1, parseIntegerOption(options.gatewayCount));
}

export function ingressCount(options) {
  return Math.max(1, parseIntegerOption(options.ingressCount));
}

export function ingressEnabled(options) {
  return parseBooleanOption(options.ingressProxy);
}

export function parseBooleanOption(value) {
  return String(value).toLowerCase() === "true";
}

export function parseIntegerOption(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`expected zero or positive integer, got ${value}`);
  }
  return parsed;
}

export function parsePositiveIntegerOption(value) {
  const parsed = parseIntegerOption(value);
  if (parsed < 1) {
    throw new Error(`expected positive integer, got ${value}`);
  }
  return parsed;
}

export function portRange(start, count) {
  return Array.from({ length: count }, (_, index) => start + index);
}

export function parseURL(value) {
  try {
    return new URL(value);
  } catch {
    throw new Error(`invalid URL: ${value}`);
  }
}

export function portFromOptions(options, base) {
  if (base.port) return Number.parseInt(base.port, 10);
  return parseIntegerOption(options.port);
}

export function trimURL(value) {
  return String(value).replace(/\/$/u, "");
}

export function maskURL(value) {
  const parsed = parseURL(value);
  if (parsed.password) parsed.password = "***";
  return trimURL(parsed.toString()).replaceAll(localSecretValue, "***");
}

export function combineOutput(outputs, label) {
  return outputs
    .map((output, index) => output.trim() ? `[${label} ${index + 1}]\n${output.trim()}` : "")
    .filter(Boolean)
    .join("\n\n");
}

export function extractFailureMessage(output, exitCode) {
  const lines = String(output ?? "")
    .split(/\r\n|\r|\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const lastMeaningful = [...lines].reverse().find((line) => !line.startsWith("{") && !line.startsWith("}"));
  return maskSensitive(lastMeaningful ?? `conversation write benchmark exited with code ${exitCode}`);
}

export function executableName(name) {
  return process.platform === "win32" ? `${name}.exe` : name;
}
