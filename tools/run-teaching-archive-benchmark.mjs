import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

export const defaults = {
  dsn: "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable",
  baseUrl: "http://127.0.0.1:18500",
  port: "18500",
  out: "reports/teaching-archive-benchmark.current.json",
  concurrency: "4",
  operations: "16",
  dbMaxConns: "4",
  agentApiKey: "ueacd",
  timeoutMs: "10000",
  startupTimeoutMs: "120000",
};

export function parseArgs(argv) {
  const parsed = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--") || value === undefined) continue;
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
  let gateway;
  let gatewayOutput = "";

  try {
    validateOptions(options);
    removeExistingReport(root, options.out);
    gateway = spawnGateway(options, root, spawnProcess);
    gateway.stdout?.on("data", (chunk) => { gatewayOutput += chunk.toString(); });
    gateway.stderr?.on("data", (chunk) => { gatewayOutput += chunk.toString(); });
    await waitForGateway(options.baseUrl, parseInteger(options.startupTimeoutMs), gateway, { fetch: fetchFn, sleep: sleepFn });

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
    if (gateway) stopProcess(gateway, spawnCommandSync);
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
    concurrency: parseInteger(options.concurrency),
    operationsPerPhase: parseInteger(options.operations),
    gatewayCount: 1,
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
    concurrency: parseInteger(options.concurrency),
    operationsPerPhase: parseInteger(options.operations),
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
    const response = await requestJson(fetchFn, `${options.baseUrl}/v1/teaching/archive-items`, {
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
    items.push(response.id);
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
    await requestJson(fetchFn, `${options.baseUrl}/v1/teaching/archive-items/${archiveItemId}/quiz-submissions`, {
      method: "POST",
      headers: requestHeaders(options.agentApiKey, studentPrincipal()),
      body: JSON.stringify({
        answerRef: `local://perf/student_perf/answers/${Date.now()}-${index}.json`,
      }),
    }, options);
  });
}

async function runListArchiveItemsPhase(options, fetchFn) {
  return runPhase(options, "listArchiveItems", async () => {
    await requestJson(
      fetchFn,
      `${options.baseUrl}/v1/teaching/archive-items?ownerType=TEACHING&materialType=QUIZ&pageSize=10`,
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
        await operation(index);
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
  return text.trim() ? JSON.parse(text) : {};
}

function requestHeaders(agentApiKey, principal) {
  return {
    "Content-Type": "application/json",
    "X-Agent-Api-Key": agentApiKey,
    "X-Principal-Context": principalHeader(principal),
  };
}

function summarizePhase(phase) {
  return {
    operations: phase.operations,
    errors: phase.errors,
    firstError: phase.firstError || undefined,
    rps: phase.durationMs > 0 ? round((phase.operations - phase.errors) / (phase.durationMs / 1000), 2) : 0,
    latencyMs: summarizeLatencies(phase.latencies),
  };
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

function spawnGateway(options, root, spawnProcess) {
  return spawnProcess("go", ["run", "./services/teaching-archive-gateway/cmd/gateway"], {
    cwd: root,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: portFromUrl(options.baseUrl, options.port),
      DATABASE_URL: options.dsn,
      DB_MAX_CONNS: String(parseInteger(options.dbMaxConns)),
      AGENT_API_KEY: options.agentApiKey,
    },
  });
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
  assertPositiveInteger(options.dbMaxConns, "db-max-conns");
  assertPositiveInteger(options.startupTimeoutMs, "startup-timeout-ms");
  assertPositiveInteger(options.timeoutMs, "timeout-ms");
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

function parseInteger(value) {
  if (!/^-?\d+$/u.test(String(value))) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
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
