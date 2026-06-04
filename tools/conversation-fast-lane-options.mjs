export const conversationFastLaneOptionDefaults = {
  conversationWriteAcceptanceMode: "sync",
  conversationCommandLogAppendBatchSize: "32",
  conversationCommandLogQueueCapacity: "65536",
  conversationCommandLogProjectionWorkers: "4",
  conversationCommandLogSync: "true",
  conversationCommandLogSettleTimeoutMs: "0",
};

export function conversationFastLaneArgs(options) {
  return [
    "--write-acceptance-mode",
    options.conversationWriteAcceptanceMode,
    "--command-log-append-batch-size",
    options.conversationCommandLogAppendBatchSize,
    "--command-log-queue-capacity",
    options.conversationCommandLogQueueCapacity,
    "--command-log-projection-workers",
    options.conversationCommandLogProjectionWorkers,
    "--command-log-sync",
    options.conversationCommandLogSync,
    "--command-log-settle-timeout-ms",
    options.conversationCommandLogSettleTimeoutMs,
  ];
}

export function conversationFastLaneProfile(options) {
  return {
    conversationWriteAcceptanceMode: conversationWriteAcceptanceMode(options),
    conversationCommandLogAppendBatchSize: parseIntegerOption(options.conversationCommandLogAppendBatchSize),
    conversationCommandLogQueueCapacity: parseIntegerOption(options.conversationCommandLogQueueCapacity),
    conversationCommandLogProjectionWorkers: parseIntegerOption(options.conversationCommandLogProjectionWorkers),
    conversationCommandLogSync: parseBooleanOption(options.conversationCommandLogSync),
    conversationCommandLogSettleTimeoutMs: parseIntegerOption(options.conversationCommandLogSettleTimeoutMs),
  };
}

export function assertConversationFastLaneOptions(options) {
  conversationWriteAcceptanceMode(options);
  assertPositiveInteger(options.conversationCommandLogAppendBatchSize, "conversation-command-log-append-batch-size");
  assertPositiveInteger(options.conversationCommandLogQueueCapacity, "conversation-command-log-queue-capacity");
  assertPositiveInteger(options.conversationCommandLogProjectionWorkers, "conversation-command-log-projection-workers");
  assertNonNegativeInteger(options.conversationCommandLogSettleTimeoutMs, "conversation-command-log-settle-timeout-ms");
}

export function conversationWriteAcceptanceMode(options) {
  const normalized = String(options.conversationWriteAcceptanceMode ?? "sync").trim().toLowerCase();
  if (normalized !== "sync" && normalized !== "durable-log") {
    throw new Error("conversation-write-acceptance-mode must be sync or durable-log");
  }
  return normalized;
}

function assertPositiveInteger(value, name) {
  const parsed = parseIntegerOption(value);
  if (parsed <= 0) throw new Error(`${name} must be positive`);
}

function assertNonNegativeInteger(value, name) {
  parseIntegerOption(value);
  if (Number(value) < 0) throw new Error(`${name} must be zero or positive`);
}

function parseIntegerOption(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`expected zero or positive integer, got ${value}`);
  }
  return parsed;
}

function parseBooleanOption(value) {
  return String(value).toLowerCase() === "true";
}
