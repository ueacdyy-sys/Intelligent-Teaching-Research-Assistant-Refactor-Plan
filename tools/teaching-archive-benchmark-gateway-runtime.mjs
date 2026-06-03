import fs from "node:fs";
import path from "node:path";

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
  return gatewayBaseUrls(options).map((baseUrl) => spawnGateway(options, root, spawnProcess, baseUrl, gatewayBinary));
}

export async function waitForGateways(baseUrls, startupTimeoutMs, gateways, dependencies) {
  await Promise.all(baseUrls.map((baseUrl, index) =>
    waitForGateway(baseUrl, startupTimeoutMs, gateways[index], dependencies)
  ));
}

export function gatewayWriteProfile(options) {
  const batchSize = parseInteger(options.archiveCreateBatchSize);
  return {
    archiveCreateBatchingEnabled: batchSize > 1,
    archiveCreateBatchSize: batchSize,
    archiveCreateBatchDelayMs: parseInteger(options.archiveCreateBatchDelayMs),
    archiveCreateBatchWorkers: parseInteger(options.archiveCreateBatchWorkers),
    quizSubmissionBatchingEnabled: batchSize > 1,
    quizSubmissionBatchSize: batchSize,
    quizSubmissionBatchDelayMs: parseInteger(options.archiveCreateBatchDelayMs),
    quizSubmissionBatchWorkers: parseInteger(options.archiveCreateBatchWorkers),
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
      TEACHING_QUIZ_SUBMISSION_BATCH_SIZE: String(parseInteger(options.archiveCreateBatchSize)),
      TEACHING_QUIZ_SUBMISSION_BATCH_DELAY_MS: String(parseInteger(options.archiveCreateBatchDelayMs)),
      TEACHING_QUIZ_SUBMISSION_BATCH_WORKERS: String(parseInteger(options.archiveCreateBatchWorkers)),
      AGENT_API_KEY: options.agentApiKey,
      INTERNAL_DIAGNOSTICS_SECRET: options.agentApiKey,
    },
  });
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
