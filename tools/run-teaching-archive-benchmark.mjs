import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import {
  applyBenchmarkRuntimeArg,
  benchmarkRuntimeDefaults,
  benchmarkRuntimeProfile as buildGoBenchmarkRuntimeProfile,
  benchmarkTargetBaseUrls,
  buildBenchmarkRuntimeCommand,
} from "./conversation-benchmark-runtime.mjs";

export const defaults = {
  dsn: "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable",
  baseUrl: "http://127.0.0.1:18500",
  port: "18500",
  out: "reports/teaching-archive-benchmark.current.json",
  concurrency: "4",
  operations: "16",
  gatewayCount: "1",
  dbMaxConns: "4",
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
};

export function parseArgs(argv) {
  const parsed = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--") || value === undefined) continue;
    if (applyBenchmarkRuntimeArg(parsed, key, value)) {
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

    if (teachingBenchmarkRuntime(options) !== "js") {
      const report = runGoBenchmark(options, root, spawnCommandSync, gatewayOutput, Date.now() - startedAt);
      writeJsonReport(path.join(root, options.out), report);
      return report;
    }

    const createArchiveItem = await runCreateArchiveItemPhase(options, fetchFn);
    const createQuizSubmission = await runCreateQuizSubmissionPhase(options, fetchFn, createArchiveItem.items);
    const listArchiveItems = await runListArchiveItemsPhase(options, fetchFn);
    const phases = { createArchiveItem, createQuizSubmission, listArchiveItems };
    const report = buildBenchmarkReport({
      options,
      generatedAt: now(),
      status: phaseErrors(phases) === 0 ? "PASSED" : "FAILED",
      phases,
      totalDurationMs: Date.now() - startedAt,
      gatewayOutput,
    });
    writeJsonReport(path.join(root, options.out), report);
    return report;
  } catch (error) {
    const report = buildFailureReport({
      options,
      generatedAt,
      errorMessage: error instanceof Error ? error.message : String(error),
      gatewayOutput,
      totalDurationMs: Date.now() - startedAt,
    });
    writeJsonReport(path.join(root, options.out), report);
    return report;
  } finally {
    for (const gateway of gateways) stopProcess(gateway, spawnCommandSync);
    await sleepFn(200);
  }
}

export function buildBenchmarkReport({ options, generatedAt, status, phases, totalDurationMs, gatewayOutput = "" }) {
  const phaseSummaries = Object.fromEntries(Object.entries(phases).map(([name, phase]) => [name, summarizePhase(phase)]));
  return {
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
      databaseUrl: "[database-url]",
    },
    phases: phaseSummaries,
    summary: summarizeBenchmark(phaseSummaries),
    totalDurationMs,
    gatewayOutputTail: tailText(maskSensitive(gatewayOutput), 80),
    dockerRequiredForEvidence: true,
  };
}

export function buildFailureReport({ options, generatedAt, errorMessage, gatewayOutput = "", totalDurationMs = 0 }) {
  return {
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
      databaseUrl: "[database-url]",
    },
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
  };
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
      databaseUrl: "[database-url]",
    },
    benchmarkRuntimeProfile: benchmarkRuntimeProfile(options),
    totalDurationMs: numberOrZero(report.totalDurationMs) + elapsedBeforeBenchmarkMs,
    gatewayOutputTail: tailText(maskSensitive(`${gatewayOutput}\n${benchmarkOutput}`), 80),
    dockerRequiredForEvidence: true,
  };
}

export function principalHeader(principal) {
  return Buffer.from(JSON.stringify(principal)).toString("base64url");
}

export function teacherPrincipal(now = new Date()) {
  return {
    principalId: "teacher_perf",
    subjectType: "USER",
    role: "TEACHER",
    entryPoint: "DESKTOP_TEACHER",
    scopes: ["TEACHING_READ", "TEACHING_WRITE", "STUDENT_ASSIGNED_READ", "STUDENT_ARCHIVE_WRITE"],
    knowledgeAccess: { public: true, private: "ASSIGNED" },
    studentAccess: { mode: "ASSIGNED", studentIds: ["student_perf"] },
    requiresHarnessApproval: false,
    sessionId: "sess_teacher_perf",
    issuedAt: new Date(now.getTime() - 60000).toISOString(),
    expiresAt: new Date(now.getTime() + 3600000).toISOString(),
  };
}

export function studentPrincipal(now = new Date()) {
  return {
    principalId: "student_perf",
    subjectType: "USER",
    role: "STUDENT",
    entryPoint: "STUDENT_APP",
    scopes: ["TEACHING_READ", "STUDENT_OWN_READ", "STUDENT_OWN_WRITE"],
    knowledgeAccess: { public: true, private: "NONE" },
    studentAccess: { mode: "OWN", studentIds: ["student_perf"] },
    requiresHarnessApproval: false,
    sessionId: "sess_student_perf",
    issuedAt: new Date(now.getTime() - 60000).toISOString(),
    expiresAt: new Date(now.getTime() + 3600000).toISOString(),
  };
}

async function runCreateArchiveItemPhase(options, fetchFn) {
  const items = [];
  const phase = await runPhase(options, "createArchiveItem", async (index) => {
    const response = await requestJson(fetchFn, `${gatewayBaseUrl(options, index)}/v1/teaching/archive-items`, {
      method: "POST",
      headers: requestHeaders(options.agentApiKey, teacherPrincipal()),
      body: JSON.stringify({
        ownerType: "TEACHING",
        materialType: "QUIZ",
        title: `Mixed workload quiz ${Date.now()} ${index}`,
        source: "TEACHER_UPLOAD",
        contentRef: `local://perf/teaching/quizzes/${Date.now()}-${index}.json`,
        tags: ["performance", "mixed-workload"],
        analysisIntents: ["AI_GRADING", "ARCHIVE_ONLY"],
      }),
    }, options);
    items.push(response.body.id);
    return response;
  });
  return { ...phase, items };
}

async function runCreateQuizSubmissionPhase(options, fetchFn, archiveItemIds) {
  if (archiveItemIds.length === 0) {
    return {
      operations: parseInteger(options.operations),
      errors: parseInteger(options.operations),
      firstError: "createArchiveItem produced no archive item ids",
      latencies: [],
      durationMs: 0,
    };
  }
  return runPhase(options, "createQuizSubmission", async (index) => {
    const archiveItemId = archiveItemIds[index % archiveItemIds.length];
    return requestJson(fetchFn, `${gatewayBaseUrl(options, index)}/v1/teaching/archive-items/${archiveItemId}/quiz-submissions`, {
      method: "POST",
      headers: requestHeaders(options.agentApiKey, studentPrincipal()),
      body: JSON.stringify({
        answerRef: `local://perf/student_perf/answers/${Date.now()}-${index}.json`,
      }),
    }, options);
  });
}

async function runListArchiveItemsPhase(options, fetchFn) {
  return runPhase(options, "listArchiveItems", async (index) => {
    return requestJson(
      fetchFn,
      `${gatewayBaseUrl(options, index)}/v1/teaching/archive-items?ownerType=TEACHING&materialType=QUIZ&pageSize=10`,
      {
        method: "GET",
        headers: requestHeaders(options.agentApiKey, teacherPrincipal()),
      },
      options,
    );
  });
}

async function runPhase(options, _name, operation) {
  const totalOperations = parseInteger(options.operations);
  const concurrency = parseInteger(options.concurrency);
  const latencies = [];
  const serverTimings = [];
  let nextIndex = 0;
  let errors = 0;
  let firstError = "";
  const startedAt = Date.now();

  async function worker() {
    while (nextIndex < totalOperations) {
      const index = nextIndex;
      nextIndex += 1;
      const operationStartedAt = Date.now();
      try {
        const result = await operation(index);
        if (result?.serverTimings && Object.keys(result.serverTimings).length > 0) {
          serverTimings.push(result.serverTimings);
        }
      } catch (error) {
        errors += 1;
        if (!firstError) firstError = maskSensitive(error instanceof Error ? error.message : String(error));
      } finally {
        latencies.push(Date.now() - operationStartedAt);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, totalOperations) }, () => worker()));
  return {
    operations: totalOperations,
    errors,
    firstError,
    latencies,
    serverTimings,
    durationMs: Date.now() - startedAt,
  };
}

async function requestJson(fetchFn, url, init, options) {
  const response = await fetchFn(url, {
    ...init,
    signal: AbortSignal.timeout(parseInteger(options.timeoutMs)),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init.method} ${url} failed ${response.status}: ${text}`);
  }
  return {
    body: text.trim() ? JSON.parse(text) : {},
    serverTimings: parseServerTimingDurations(response.headers?.get?.("Server-Timing") ?? ""),
  };
}

function requestHeaders(agentApiKey, principal) {
  return {
    "Content-Type": "application/json",
    "X-Agent-Api-Key": agentApiKey,
    "X-Principal-Context": principalHeader(principal),
  };
}

function summarizePhase(phase) {
  const report = {
    operations: phase.operations,
    errors: phase.errors,
    firstError: phase.firstError || undefined,
    rps: phase.durationMs > 0 ? round((phase.operations - phase.errors) / (phase.durationMs / 1000), 2) : 0,
    latencyMs: summarizeLatencies(phase.latencies),
  };
  const serverTimingBreakdown = observedTimings(phase.serverTimings ?? []);
  if (Object.keys(serverTimingBreakdown).length > 0) {
    report.serverTimingBreakdownMs = {};
    report.serverTimingBreakdownSamples = {};
    for (const [name, values] of Object.entries(serverTimingBreakdown)) {
      report.serverTimingBreakdownMs[name] = summarizeLatencies(values);
      report.serverTimingBreakdownSamples[name] = values.length;
    }
    if (serverTimingBreakdown.app?.length > 0) {
      report.serverTimingMs = summarizeLatencies(serverTimingBreakdown.app);
      report.serverTimingSamples = serverTimingBreakdown.app.length;
    }
  }
  return report;
}

function observedTimings(values) {
  const observed = {};
  for (const metrics of values) {
    for (const [name, durationMs] of Object.entries(metrics)) {
      if (!Number.isFinite(durationMs)) continue;
      observed[name] ??= [];
      observed[name].push(durationMs);
    }
  }
  return observed;
}

function parseServerTimingDurations(value) {
  const timings = {};
  for (const part of value.split(",")) {
    const [rawName, ...attributes] = part.trim().split(";");
    const name = rawName.trim();
    if (!name) continue;
    const durationAttribute = attributes.find((attribute) => attribute.trim().startsWith("dur="));
    if (!durationAttribute) continue;
    const durationMs = Number.parseFloat(durationAttribute.trim().slice("dur=".length));
    if (Number.isFinite(durationMs)) timings[name] = durationMs;
  }
  return timings;
}

function summarizeBenchmark(phases) {
  const values = Object.values(phases);
  return {
    totalErrors: values.reduce((total, phase) => total + numberOrZero(phase.errors), 0),
    maxP95Ms: maxFinite(values.map((phase) => numberOrNull(phase.latencyMs?.p95))),
    maxP99Ms: maxFinite(values.map((phase) => numberOrNull(phase.latencyMs?.p99))),
    minRps: minFinite(values.map((phase) => numberOrNull(phase.rps))),
  };
}

function summarizeLatencies(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return { min: null, p50: null, p95: null, p99: null, max: null };
  return {
    min: sorted[0],
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.at(-1),
  };
}

function percentile(sorted, percentileValue) {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));
  return sorted[index];
}

function phaseErrors(phases) {
  return Object.values(phases).reduce((total, phase) => total + phase.errors, 0);
}

function buildGatewayBinary(root, spawnCommandSync) {
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

function spawnGateways(options, root, spawnProcess, gatewayBinary) {
  return gatewayBaseUrls(options).map((baseUrl) => spawnGateway(options, root, spawnProcess, baseUrl, gatewayBinary));
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
      AGENT_API_KEY: options.agentApiKey,
    },
  });
}

function executableName(value) {
  return process.platform === "win32" ? `${value}.exe` : value;
}

async function waitForGateways(baseUrls, startupTimeoutMs, gateways, dependencies) {
  await Promise.all(baseUrls.map((baseUrl, index) =>
    waitForGateway(baseUrl, startupTimeoutMs, gateways[index], dependencies)
  ));
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

function validateOptions(options) {
  assertPositiveInteger(options.concurrency, "concurrency");
  assertPositiveInteger(options.operations, "operations");
  assertPositiveInteger(options.gatewayCount, "gateway-count");
  assertPositiveInteger(options.dbMaxConns, "db-max-conns");
  assertPositiveInteger(options.startupTimeoutMs, "startup-timeout-ms");
  assertPositiveInteger(options.timeoutMs, "timeout-ms");
  assertNonNegativeInteger(options.maxConnsPerHost, "max-conns-per-host");
  assertNonNegativeInteger(options.warmConnectionsPerHost, "warm-connections-per-host");
  assertNonNegativeInteger(options.warmConnectionRetries, "warm-connection-retries");
  teachingBenchmarkRuntime(options);
  if (options.agentApiKey !== "ueacd") throw new Error("agent-api-key must be ueacd for local performance evidence");
  const url = new URL(options.dsn);
  if (url.password !== "ueacd") throw new Error("dsn password must be ueacd for local performance evidence");
  portFromUrl(options.baseUrl, options.port);
}

function stopProcess(processHandle, spawnCommandSync) {
  if (processHandle.exitCode !== null) return;
  if (process.platform === "win32" && processHandle.pid) {
    spawnCommandSync("taskkill", ["/pid", String(processHandle.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  processHandle.kill?.();
}

function removeExistingReport(root, relativePath) {
  const absolute = path.join(root, relativePath);
  if (fs.existsSync(absolute)) fs.rmSync(absolute);
}

function writeJsonReport(absolutePath, report) {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`);
}

function portFromUrl(urlText, fallback) {
  const parsed = new URL(urlText);
  const port = parsed.port || fallback;
  assertPositiveInteger(port, "base-url port");
  return String(port);
}

function gatewayBaseUrls(options) {
  const count = parseInteger(options.gatewayCount);
  const base = new URL(options.baseUrl);
  const startPort = Number.parseInt(base.port || options.port, 10);
  return Array.from({ length: count }, (_entry, index) => {
    const url = new URL(options.baseUrl);
    url.port = String(startPort + index);
    return `${url.protocol}//${url.hostname}:${url.port}`;
  });
}

function gatewayBaseUrl(options, operationIndex) {
  const urls = gatewayBaseUrls(options);
  return urls[operationIndex % urls.length];
}

function maskURL(value) {
  const url = new URL(value);
  return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}`;
}

function maskSensitive(value) {
  return String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/giu, "[database-url]")
    .replaceAll("ueacd", "***");
}

function tailText(value, maxLines = 80) {
  const text = String(value ?? "").replace(/\s+$/u, "");
  if (!text) return "";
  return text.split(/\r\n|\r|\n/u).slice(-maxLines).join("\n");
}

function assertPositiveInteger(value, name) {
  const parsed = parseInteger(value);
  if (parsed <= 0) throw new Error(`${name} must be a positive integer`);
}

function assertNonNegativeInteger(value, name) {
  const parsed = parseInteger(value);
  if (parsed < 0) throw new Error(`${name} must be a non-negative integer`);
}

function parseInteger(value) {
  if (!/^-?\d+$/u.test(String(value))) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function teachingBenchmarkRuntime(options) {
  const runtime = String(options.benchmarkRuntime ?? "js").toLowerCase();
  if (["js", "local", "docker", "wsl"].includes(runtime)) return runtime;
  throw new Error(`benchmark-runtime must be js, local, docker, or wsl: ${runtime}`);
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

function round(value, digits) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function kebabToCamel(value) {
  return value.replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runTeachingArchiveBenchmark();
  console.log(formatTeachingArchiveBenchmark(report));
  process.exit(report.status === "PASSED" ? 0 : 1);
}
