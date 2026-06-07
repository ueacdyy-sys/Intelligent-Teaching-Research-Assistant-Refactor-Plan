import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
  assertPositiveInteger,
  parseInteger,
} from "./benchmark-runner-utils.mjs";

export function buildGatewayBinary(root, spawnCommandSync) {
  const binaryPath = path.join(root, "tmp", "bin", executableName("teaching-archive-gateway-runner"));
  fs.mkdirSync(path.dirname(binaryPath), { recursive: true });
  const result = spawnCommandSync("go", [
    "build",
    "-o",
    binaryPath,
    "./services/teaching-archive-gateway/cmd/gateway",
  ], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0 || result.error) {
    throw new Error(`build teaching archive gateway failed: ${result.error?.message ?? result.stderr}`);
  }
  return binaryPath;
}

export function spawnGateways(options, root, spawnProcess, gatewayBinary) {
  prepareGatewayCommandLogs(options, root);
  return gatewayBaseUrls(options).map((baseUrl) => spawnGateway(options, root, spawnProcess, baseUrl, gatewayBinary));
}

export async function waitForGateways(baseUrls, startupTimeoutMs, gateways, dependencies) {
  await Promise.all(baseUrls.map((baseUrl, index) =>
    waitForGateway(baseUrl, startupTimeoutMs, gateways[index], dependencies)
  ));
}

export function gatewayWriteProfile(options) {
  const archiveBatchSize = parseInteger(options.archiveCreateBatchSize);
  const quizBatchSize = parseInteger(quizSubmissionBatchSize(options));
  const acceptanceMode = teachingWriteAcceptanceMode(options);
  return {
    acceptanceMode,
    commandLog: acceptanceMode === "durable-log" ? {
      pathMode: commandLogPathMode(options),
      runId: commandLogRunId(options),
      appendBatchSize: parseInteger(options.teachingCommandLogAppendBatchSize),
      queueCapacity: parseInteger(options.teachingCommandLogQueueCapacity),
      projectionWorkers: parseInteger(options.teachingCommandLogProjectionWorkers),
      sync: parseBoolean(options.teachingCommandLogSync),
    } : null,
    archiveCreateBatchingEnabled: archiveBatchSize > 1,
    archiveCreateBatchSize: archiveBatchSize,
    archiveCreateBatchDelayMs: parseInteger(options.archiveCreateBatchDelayMs),
    archiveCreateBatchWorkers: parseInteger(options.archiveCreateBatchWorkers),
    archiveCreateBatchMode: archiveCreateBatchMode(options),
    quizSubmissionBatchingEnabled: quizBatchSize > 1,
    quizSubmissionBatchSize: quizBatchSize,
    quizSubmissionBatchDelayMs: parseInteger(quizSubmissionBatchDelayMs(options)),
    quizSubmissionBatchWorkers: parseInteger(quizSubmissionBatchWorkers(options)),
  };
}

export function gatewayReadProfile(options) {
  const ttlMs = parseInteger(options.archiveListCacheTtlMs);
  return {
    archiveListCacheEnabled: ttlMs > 0,
    archiveListCacheTtlMs: ttlMs,
    archiveListCacheMaxEntries: parseInteger(options.archiveListCacheMaxEntries),
  };
}

export function gatewaySchemaProfile(options) {
  return {
    archiveSchemaIndexProfile: archiveSchemaIndexProfile(options),
  };
}

export function stopProcess(processHandle, spawnCommandSync) {
  if (processHandle.exitCode !== null) return;
  if (process.platform === "win32" && processHandle.pid) {
    spawnCommandSync("taskkill", ["/pid", String(processHandle.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  processHandle.kill?.();
}

export function portFromUrl(urlText, fallback) {
  const parsed = new URL(urlText);
  const port = parsed.port || fallback;
  assertPositiveInteger(port, "base-url port");
  return String(port);
}

export function gatewayBaseUrls(options) {
  const count = parseInteger(options.gatewayCount);
  const base = new URL(options.baseUrl);
  const startPort = Number.parseInt(base.port || options.port, 10);
  return Array.from({ length: count }, (_entry, index) => {
    const url = new URL(options.baseUrl);
    url.port = String(startPort + index);
    return `${url.protocol}//${url.hostname}:${url.port}`;
  });
}

export function gatewayBaseUrl(options, operationIndex) {
  const urls = gatewayBaseUrls(options);
  return urls[operationIndex % urls.length];
}

export function maskURL(value) {
  const url = new URL(value);
  return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}`;
}

export function teachingBenchmarkRuntime(options) {
  const runtime = String(options.benchmarkRuntime ?? "js").toLowerCase();
  if (["js", "local", "docker", "wsl"].includes(runtime)) return runtime;
  throw new Error(`benchmark-runtime must be js, local, docker, or wsl: ${runtime}`);
}

function spawnGateway(options, root, spawnProcess, baseUrl, gatewayBinary) {
  return spawnProcess(gatewayBinary, [], {
    cwd: root,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: portFromUrl(baseUrl, options.port),
      DATABASE_URL: options.dsn,
      DB_MAX_CONNS: String(parseInteger(options.dbMaxConns)),
      DB_MIN_CONNS: String(parseInteger(options.dbMinConns)),
      DB_PREWARM_CONNS: String(parseInteger(options.dbPrewarmConns)),
      TEACHING_ARCHIVE_CREATE_BATCH_SIZE: String(parseInteger(options.archiveCreateBatchSize)),
      TEACHING_ARCHIVE_CREATE_BATCH_DELAY_MS: String(parseInteger(options.archiveCreateBatchDelayMs)),
      TEACHING_ARCHIVE_CREATE_BATCH_WORKERS: String(parseInteger(options.archiveCreateBatchWorkers)),
      TEACHING_ARCHIVE_CREATE_BATCH_MODE: archiveCreateBatchMode(options),
      TEACHING_QUIZ_SUBMISSION_BATCH_SIZE: String(parseInteger(quizSubmissionBatchSize(options))),
      TEACHING_QUIZ_SUBMISSION_BATCH_DELAY_MS: String(parseInteger(quizSubmissionBatchDelayMs(options))),
      TEACHING_QUIZ_SUBMISSION_BATCH_WORKERS: String(parseInteger(quizSubmissionBatchWorkers(options))),
      TEACHING_ARCHIVE_LIST_CACHE_TTL_MS: String(parseInteger(options.archiveListCacheTtlMs)),
      TEACHING_ARCHIVE_LIST_CACHE_MAX_ENTRIES: String(parseInteger(options.archiveListCacheMaxEntries)),
      TEACHING_ARCHIVE_SCHEMA_INDEX_PROFILE: archiveSchemaIndexProfile(options),
      TEACHING_WRITE_ACCEPTANCE_MODE: teachingWriteAcceptanceMode(options),
      TEACHING_COMMAND_LOG_PATH: gatewayCommandLogPath(options, root, portFromUrl(baseUrl, options.port)),
      TEACHING_COMMAND_LOG_APPEND_BATCH_SIZE: String(parseInteger(options.teachingCommandLogAppendBatchSize)),
      TEACHING_COMMAND_LOG_QUEUE_CAPACITY: String(parseInteger(options.teachingCommandLogQueueCapacity)),
      TEACHING_COMMAND_LOG_PROJECTION_WORKERS: String(parseInteger(options.teachingCommandLogProjectionWorkers)),
      TEACHING_COMMAND_LOG_SYNC: String(parseBoolean(options.teachingCommandLogSync)),
      AGENT_API_KEY: options.agentApiKey,
      INTERNAL_DIAGNOSTICS_SECRET: options.agentApiKey,
    },
  });
}

export function archiveCreateBatchMode(options) {
  return String(options.archiveCreateBatchMode ?? "").trim().toLowerCase() === "copy" ? "copy" : "insert";
}

export function quizSubmissionBatchSize(options) {
  return optionOrFallback(options.quizSubmissionBatchSize, options.archiveCreateBatchSize);
}

export function quizSubmissionBatchDelayMs(options) {
  return optionOrFallback(options.quizSubmissionBatchDelayMs, options.archiveCreateBatchDelayMs);
}

export function quizSubmissionBatchWorkers(options) {
  return optionOrFallback(options.quizSubmissionBatchWorkers, options.archiveCreateBatchWorkers);
}

export function archiveSchemaIndexProfile(options) {
  return String(options.archiveSchemaIndexProfile ?? "").trim().toLowerCase() === "hot_write" ? "hot_write" : "full";
}

export function teachingWriteAcceptanceMode(options) {
  const normalized = String(options.teachingWriteAcceptanceMode ?? "sync").trim().toLowerCase();
  if (normalized !== "sync" && normalized !== "durable-log") {
    throw new Error(`teaching-write-acceptance-mode must be sync or durable-log: ${normalized}`);
  }
  return normalized;
}

export function gatewayCommandLogPath(options, root, port) {
  const configured = String(options.teachingCommandLogPath ?? "").trim();
  if (configured !== "") return configured;
  return path.join(defaultCommandLogDir(root, commandLogRunId(options)), `teaching-${port}.jsonl`);
}

export function prepareGatewayCommandLogs(options, root) {
  if (teachingWriteAcceptanceMode(options) !== "durable-log") return;
  if (commandLogPathMode(options) !== "per-report") return;
  const dir = defaultCommandLogDir(root, commandLogRunId(options));
  assertSafeDefaultCommandLogDir(root, dir);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function commandLogPathMode(options) {
  return String(options.teachingCommandLogPath ?? "").trim() === "" ? "per-report" : "configured";
}

function commandLogRunId(options) {
  const outputPath = String(options.out ?? "teaching-archive-benchmark.current.json").trim();
  const normalized = outputPath.replace(/\\/gu, "/").replace(/^reports\//iu, "");
  const withoutExtension = normalized.replace(/\.[a-z0-9]+$/iu, "");
  const slug = withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 120) || "teaching-archive-benchmark";
  const hash = crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 10);
  return `${slug}-${hash}`;
}

function defaultCommandLogDir(root, runId) {
  return path.join(root, "reports", "teaching-command-log", runId);
}

function assertSafeDefaultCommandLogDir(root, dir) {
  const reportsCommandLogRoot = path.resolve(root, "reports", "teaching-command-log");
  const resolvedDir = path.resolve(dir);
  const relative = path.relative(reportsCommandLogRoot, resolvedDir);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("refusing to reset teaching command-log outside reports/teaching-command-log");
  }
}

function optionOrFallback(value, fallback) {
  return String(value ?? "").trim() === "" ? fallback : value;
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function executableName(value) {
  return process.platform === "win32" ? `${value}.exe` : value;
}

async function waitForGateway(baseUrl, startupTimeoutMs, processHandle, dependencies) {
  const fetchFn = dependencies.fetch;
  const sleepFn = dependencies.sleep;
  const deadline = Date.now() + startupTimeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error(`teaching archive gateway exited early with code ${processHandle.exitCode}`);
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
  throw new Error(`teaching archive gateway did not become healthy: ${lastError}`);
}
