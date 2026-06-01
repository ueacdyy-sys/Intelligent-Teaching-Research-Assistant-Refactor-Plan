import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import {
  defaults as mixedDefaults,
  runSystemMixedWorkloadBenchmark,
} from "./run-system-mixed-workload-benchmark.mjs";

export const defaults = {
  out: "reports/system-sustained-mixed-workload.current.json",
  samplePrefix: "reports/system-sustained-mixed-workload",
  profile: "SUSTAINED_SMOKE",
  manageDocker: "true",
  dockerCleanup: "reset",
  stopOnFailure: "true",
  samples: "2",
  sampleIntervalMs: "0",
  identityBaseUrl: mixedDefaults.identityBaseUrl,
  conversationBaseUrl: mixedDefaults.conversationBaseUrl,
  teachingBaseUrl: mixedDefaults.teachingBaseUrl,
  identityConcurrency: "4",
  identityOperations: "8",
  conversationConcurrency: "16",
  conversationOperations: "32",
  teachingConcurrency: "4",
  teachingOperations: "8",
  identityGatewayCount: "1",
  conversationGatewayCount: "1",
  identitySessionDbMaxConns: "4",
  conversationDbMaxConns: "1",
  teachingDbMaxConns: "1",
  conversationWriteBatchSize: "8",
  maxConnsPerHost: "0",
  warmConnectionsPerHost: "0",
  timeout: "180s",
  teachingTimeoutMs: mixedDefaults.teachingTimeoutMs,
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

export function buildSampleRuns(options) {
  const samples = parseInteger(options.samples);
  return Array.from({ length: samples }, (_entry, index) => {
    const sampleNumber = index + 1;
    const reportPrefix = `${options.samplePrefix}.${sampleNumber}`;
    return {
      sampleNumber,
      name: `sample-${sampleNumber}`,
      reportPath: `${reportPrefix}.json`,
      options: {
        ...mixedDefaults,
        profile: `${options.profile}_SAMPLE_${sampleNumber}`,
        manageDocker: "false",
        dockerCleanup: "none",
        out: `${reportPrefix}.json`,
        identityOut: `${reportPrefix}.identity-http.json`,
        conversationOut: `${reportPrefix}.conversation-write.json`,
        teachingOut: `${reportPrefix}.teaching-archive.json`,
        knowledgeOut: `${reportPrefix}.knowledge-retrieval.json`,
        aiAdmissionOut: `${reportPrefix}.ai-worker-admission.json`,
        identityBaseUrl: options.identityBaseUrl,
        conversationBaseUrl: options.conversationBaseUrl,
        teachingBaseUrl: options.teachingBaseUrl,
        identityConcurrency: options.identityConcurrency,
        identityOperations: options.identityOperations,
        conversationConcurrency: options.conversationConcurrency,
        conversationOperations: options.conversationOperations,
        teachingConcurrency: options.teachingConcurrency,
        teachingOperations: options.teachingOperations,
        identityGatewayCount: options.identityGatewayCount,
        conversationGatewayCount: options.conversationGatewayCount,
        identitySessionDbMaxConns: options.identitySessionDbMaxConns,
        conversationDbMaxConns: options.conversationDbMaxConns,
        teachingDbMaxConns: options.teachingDbMaxConns,
        conversationWriteBatchSize: options.conversationWriteBatchSize,
        maxConnsPerHost: options.maxConnsPerHost,
        warmConnectionsPerHost: options.warmConnectionsPerHost,
        timeout: options.timeout,
        teachingTimeoutMs: options.teachingTimeoutMs,
        startupTimeoutMs: options.startupTimeoutMs,
      },
    };
  });
}

export async function runSystemSustainedMixedWorkload(options = parseArgs(process.argv.slice(2)), dependencies = {}) {
  const root = dependencies.root ?? process.cwd();
  const runSyncFn = dependencies.runSync ?? runSync;
  const runSampleFn = dependencies.runSample ?? runSystemMixedWorkloadBenchmark;
  const sleepFn = dependencies.sleep ?? sleep;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const setup = [];
  const cleanup = [];
  const runnerErrors = [];
  const sampleRuns = buildSampleRuns(options);
  const sampleReports = [];

  try {
    validateOptions(options, sampleRuns);
    removeReports(root, [options.out, ...sampleRuns.map((sample) => sample.reportPath)]);
    if (parseBoolean(options.manageDocker)) {
      setup.push({ phase: "setup-reset", ...runSyncFn("npm", ["run", "perf:identity-session:reset"], root) });
      if (setup.at(-1).exitCode !== 0) throw new Error("managed Docker reset failed before sustained mixed workload");
      setup.push({ phase: "setup-up", ...runSyncFn("npm", ["run", "perf:identity-session:up"], root) });
      if (setup.at(-1).exitCode !== 0) throw new Error("managed Docker setup failed before sustained mixed workload");
    }

    for (const sample of sampleRuns) {
      const report = await runSampleFn(sample.options, { root });
      sampleReports.push({ sample, report });
      if (parseBoolean(options.stopOnFailure) && report.status !== "PASSED") break;
      if (sampleReports.length < sampleRuns.length) {
        await sleepFn(parseInteger(options.sampleIntervalMs));
      }
    }
  } catch (error) {
    runnerErrors.push(maskSensitive(error.message));
  } finally {
    if (parseBoolean(options.manageDocker)) {
      cleanup.push(...cleanupDocker(options, root, runSyncFn));
    }
  }

  const endedAt = now();
  const report = buildSystemSustainedMixedWorkloadReport({
    options,
    sampleRuns,
    sampleReports,
    setup,
    cleanup,
    runnerErrors,
    startedAt,
    endedAt,
  });
  writeJsonReport(path.join(root, options.out), report);
  return report;
}

export function buildSystemSustainedMixedWorkloadReport({
  options,
  sampleRuns,
  sampleReports,
  setup = [],
  cleanup = [],
  runnerErrors = [],
  startedAt,
  endedAt,
}) {
  const samples = sampleRuns.map((sample) => {
    const report = sampleReports.find((entry) => entry.sample.name === sample.name)?.report;
    return summarizeSample(sample, report);
  });
  const orchestrationErrors = countCommandErrors(setup) + countCommandErrors(cleanup) + runnerErrors.length;
  const executedSamples = samples.filter((sample) => sample.executed);
  const allSamplesPassed = executedSamples.length === sampleRuns.length &&
    executedSamples.every((sample) => sample.status === "PASSED");
  const status = orchestrationErrors === 0 && allSamplesPassed ? "PASSED" : "FAILED";

  return {
    generatedAt: endedAt,
    startedAt,
    endedAt,
    benchmarkKind: "system_sustained_mixed_workload",
    workloadType: "SUSTAINED_MIXED_WORKLOAD",
    profile: options.profile,
    status,
    stopOnFailure: parseBoolean(options.stopOnFailure),
    sampleIntervalMs: parseInteger(options.sampleIntervalMs),
    concurrencyProfile: {
      identityConcurrency: parseInteger(options.identityConcurrency),
      conversationConcurrency: parseInteger(options.conversationConcurrency),
      teachingConcurrency: parseInteger(options.teachingConcurrency),
      identityGatewayCount: parseInteger(options.identityGatewayCount),
      conversationGatewayCount: parseInteger(options.conversationGatewayCount),
      configuredSamples: sampleRuns.length,
    },
    databaseProfile: {
      identitySessionDbMaxConns: parseInteger(options.identitySessionDbMaxConns),
      conversationDbMaxConns: parseInteger(options.conversationDbMaxConns),
      teachingDbMaxConns: parseInteger(options.teachingDbMaxConns),
      conversationWriteBatchSize: parseInteger(options.conversationWriteBatchSize),
    },
    runtimeProfile: {
      executor: "LOCAL_NODE_SUSTAINED_ORCHESTRATOR",
      managedDocker: parseBoolean(options.manageDocker),
      dockerCleanup: options.dockerCleanup,
    },
    samples,
    summary: summarizeSustainedSamples(samples, orchestrationErrors),
    setup: setup.map((entry) => sanitizeCommandResult(entry)),
    cleanup: cleanup.map((entry) => sanitizeCommandResult(entry)),
    runnerErrors,
    nextAction: status === "PASSED"
      ? "Treat this as sustained mixed workload smoke evidence only; increase duration, concurrency, and workflow coverage before any full-system capacity promotion."
      : "Fix the first failed sustained mixed workload sample before increasing duration or concurrency.",
  };
}

export function formatSystemSustainedMixedWorkload(report) {
  const lines = [
    `System sustained mixed workload: ${report.status}`,
    `Profile: ${report.profile}`,
    `Executed samples: ${report.summary.executedSamples}/${report.summary.configuredSamples}`,
    `Total errors: ${report.summary.totalErrors}`,
    `P99 drift: ${report.summary.p99DriftMs ?? "n/a"}ms`,
    "",
    "Sample results:",
  ];
  for (const sample of report.samples) {
    lines.push(`- ${sample.name} ${sample.status} maxP99=${sample.maxP99Ms ?? "n/a"}ms errors=${sample.totalErrors}`);
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function summarizeSample(sample, report) {
  if (!report || typeof report !== "object") {
    return {
      name: sample.name,
      sampleNumber: sample.sampleNumber,
      executed: false,
      status: "NOT_RUN",
      reportPath: sample.reportPath,
      totalErrors: 0,
      maxP95Ms: null,
      maxP99Ms: null,
      workloads: [],
    };
  }
  return {
    name: sample.name,
    sampleNumber: sample.sampleNumber,
    executed: true,
    status: report.status ?? "FAILED",
    reportPath: sample.reportPath,
    totalErrors: numberOrZero(report.summary?.totalErrors),
    maxP95Ms: numberOrNull(report.summary?.maxP95Ms),
    maxP99Ms: numberOrNull(report.summary?.maxP99Ms),
    workloads: Array.isArray(report.workloads)
      ? report.workloads.map((workload) => ({
          name: workload.name,
          status: workload.status,
          errors: numberOrZero(workload.errors),
          p95Ms: numberOrNull(workload.p95Ms),
          p99Ms: numberOrNull(workload.p99Ms),
        }))
      : [],
  };
}

function summarizeSustainedSamples(samples, orchestrationErrors) {
  const executedSamples = samples.filter((sample) => sample.executed);
  const passedSamples = executedSamples.filter((sample) => sample.status === "PASSED");
  const failedSamples = executedSamples.filter((sample) => sample.status !== "PASSED");
  const firstP99 = passedSamples.at(0)?.maxP99Ms;
  const lastP99 = passedSamples.at(-1)?.maxP99Ms;
  return {
    configuredSamples: samples.length,
    executedSamples: executedSamples.length,
    passedSamples: passedSamples.length,
    failedSamples: failedSamples.length,
    totalErrors: executedSamples.reduce((total, sample) => total + sample.totalErrors, 0) + orchestrationErrors,
    orchestrationErrors,
    maxP95Ms: maxFinite(executedSamples.map((sample) => sample.maxP95Ms)),
    maxP99Ms: maxFinite(executedSamples.map((sample) => sample.maxP99Ms)),
    p99DriftMs: Number.isFinite(firstP99) && Number.isFinite(lastP99) ? round(lastP99 - firstP99, 2) : null,
    highestPassedSample: passedSamples.at(-1)?.name ?? null,
    firstFailedSample: failedSamples.at(0)?.name ?? null,
  };
}

function validateOptions(options, sampleRuns) {
  if (sampleRuns.length === 0) throw new Error("at least one sustained sample is required");
  assertPositiveInteger(options.samples, "samples");
  assertNonNegativeInteger(options.sampleIntervalMs, "sample-interval-ms");
  assertPositiveInteger(options.identityConcurrency, "identity-concurrency");
  assertPositiveInteger(options.identityOperations, "identity-operations");
  assertPositiveInteger(options.conversationConcurrency, "conversation-concurrency");
  assertPositiveInteger(options.conversationOperations, "conversation-operations");
  assertPositiveInteger(options.teachingConcurrency, "teaching-concurrency");
  assertPositiveInteger(options.teachingOperations, "teaching-operations");
  assertPositiveInteger(options.identityGatewayCount, "identity-gateway-count");
  assertPositiveInteger(options.conversationGatewayCount, "conversation-gateway-count");
  assertPositiveInteger(options.identitySessionDbMaxConns, "identity-session-db-max-conns");
  assertPositiveInteger(options.conversationDbMaxConns, "conversation-db-max-conns");
  assertPositiveInteger(options.teachingDbMaxConns, "teaching-db-max-conns");
  assertPositiveInteger(options.conversationWriteBatchSize, "conversation-write-batch-size");
  assertPositiveInteger(options.teachingTimeoutMs, "teaching-timeout-ms");
}

function cleanupDocker(options, root, runSyncFn) {
  if (options.dockerCleanup === "none") return [];
  const script = options.dockerCleanup === "down" ? "perf:identity-session:down" : "perf:identity-session:reset";
  return [{ phase: "cleanup", ...runSyncFn("npm", ["run", script], root) }];
}

function runSync(command, args, root) {
  const startedAt = Date.now();
  const runnable = toRunnableCommand(command, args);
  const result = spawnSync(runnable.command, runnable.args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  return {
    command,
    args,
    exitCode: result.status ?? 1,
    elapsedMs: Date.now() - startedAt,
    outputTail: tailText(maskSensitive(`${result.stdout ?? ""}${result.stderr ?? ""}`), 40),
    error: result.error?.message,
  };
}

function toRunnableCommand(command, args) {
  if (process.platform === "win32" && command === "npm") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", ["npm", ...args].join(" ")],
    };
  }
  return { command, args };
}

function removeReports(root, relativePaths) {
  for (const relativePath of relativePaths) {
    const absolute = path.join(root, relativePath);
    if (fs.existsSync(absolute)) fs.rmSync(absolute);
  }
}

function writeJsonReport(absolutePath, report) {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`);
}

function sanitizeCommandResult(result) {
  return {
    phase: result.phase,
    command: result.command,
    args: result.args,
    exitCode: result.exitCode ?? 1,
    elapsedMs: result.elapsedMs ?? null,
    outputTail: tailText(maskSensitive(result.outputTail ?? ""), 80),
    error: result.error ? maskSensitive(result.error) : undefined,
  };
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
  return String(value).toLowerCase() === "true";
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

function round(value, digits) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function countCommandErrors(results) {
  return results.filter((result) => result.exitCode !== 0).length;
}

function kebabToCamel(value) {
  return value.replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runSystemSustainedMixedWorkload();
  console.log(formatSystemSustainedMixedWorkload(report));
  process.exit(report.status === "PASSED" ? 0 : 1);
}
