import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import {
  defaults as mixedDefaults,
  runSystemMixedWorkloadBenchmark,
} from "./run-system-mixed-workload-benchmark.mjs";

export const defaults = {
  out: "reports/system-mixed-workload-ladder.current.json",
  stepPrefix: "reports/system-mixed-workload-ladder",
  profile: "SMOKE_LADDER",
  manageDocker: "true",
  dockerCleanup: "reset",
  stopOnFailure: "true",
  steps: "smoke:2:4:8:16,low:4:8:16:32",
  identityBaseUrl: mixedDefaults.identityBaseUrl,
  conversationBaseUrl: mixedDefaults.conversationBaseUrl,
  teachingBaseUrl: mixedDefaults.teachingBaseUrl,
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

export function buildLadderSteps(options) {
  return parseStepSpecs(options.steps).map((step, index) => {
    const reportPrefix = `${options.stepPrefix}.${index + 1}-${step.name}`;
    return {
      ...step,
      reportPath: `${reportPrefix}.json`,
      options: {
        ...mixedDefaults,
        profile: `${options.profile}_${step.name.toUpperCase()}`,
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
        identityConcurrency: String(step.identityConcurrency),
        identityOperations: String(step.identityOperations),
        conversationConcurrency: String(step.conversationConcurrency),
        conversationOperations: String(step.conversationOperations),
        teachingConcurrency: String(step.teachingConcurrency),
        teachingOperations: String(step.teachingOperations),
      },
    };
  });
}

export async function runSystemMixedWorkloadLadder(options = parseArgs(process.argv.slice(2)), dependencies = {}) {
  const root = dependencies.root ?? process.cwd();
  const runSyncFn = dependencies.runSync ?? runSync;
  const runStepFn = dependencies.runStep ?? runSystemMixedWorkloadBenchmark;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const setup = [];
  const cleanup = [];
  const runnerErrors = [];
  const steps = buildLadderSteps(options);
  const stepReports = [];

  try {
    validateOptions(options, steps);
    removeReport(root, options.out);
    if (parseBoolean(options.manageDocker)) {
      setup.push({ phase: "setup-reset", ...runSyncFn("npm", ["run", "perf:identity-session:reset"], root) });
      if (setup.at(-1).exitCode !== 0) throw new Error("managed Docker reset failed before ladder execution");
      setup.push({ phase: "setup-up", ...runSyncFn("npm", ["run", "perf:identity-session:up"], root) });
      if (setup.at(-1).exitCode !== 0) throw new Error("managed Docker setup failed before ladder execution");
    }

    for (const step of steps) {
      const report = await runStepFn(step.options, { root });
      stepReports.push({ step, report });
      if (parseBoolean(options.stopOnFailure) && report.status !== "PASSED") break;
    }
  } catch (error) {
    runnerErrors.push(maskSensitive(error.message));
  } finally {
    if (parseBoolean(options.manageDocker)) {
      cleanup.push(...cleanupDocker(options, root, runSyncFn));
    }
  }

  const endedAt = now();
  const report = buildSystemMixedWorkloadLadderReport({
    options,
    steps,
    stepReports,
    setup,
    cleanup,
    runnerErrors,
    startedAt,
    endedAt,
  });
  writeJsonReport(path.join(root, options.out), report);
  return report;
}

export function buildSystemMixedWorkloadLadderReport({
  options,
  steps,
  stepReports,
  setup = [],
  cleanup = [],
  runnerErrors = [],
  startedAt,
  endedAt,
}) {
  const stepSummaries = steps.map((step) => {
    const report = stepReports.find((entry) => entry.step.name === step.name)?.report;
    return summarizeStep(step, report);
  });
  const orchestrationErrors = countCommandErrors(setup) + countCommandErrors(cleanup) + runnerErrors.length;
  const executedSteps = stepSummaries.filter((step) => step.executed);
  const allExecutedStepsPassed = executedSteps.length === steps.length &&
    executedSteps.every((step) => step.status === "PASSED");
  const status = orchestrationErrors === 0 && allExecutedStepsPassed ? "PASSED" : "FAILED";

  return {
    generatedAt: endedAt,
    startedAt,
    endedAt,
    benchmarkKind: "system_mixed_workload_ladder",
    workloadType: "MIXED_WORKLOAD_LADDER",
    profile: options.profile,
    status,
    stopOnFailure: parseBoolean(options.stopOnFailure),
    concurrencyProfile: {
      identityGatewayCount: parseInteger(options.identityGatewayCount),
      conversationGatewayCount: parseInteger(options.conversationGatewayCount),
      configuredSteps: steps.length,
    },
    databaseProfile: {
      identitySessionDbMaxConns: parseInteger(options.identitySessionDbMaxConns),
      conversationDbMaxConns: parseInteger(options.conversationDbMaxConns),
      teachingDbMaxConns: parseInteger(options.teachingDbMaxConns),
      conversationWriteBatchSize: parseInteger(options.conversationWriteBatchSize),
    },
    runtimeProfile: {
      executor: "LOCAL_NODE_LADDER_ORCHESTRATOR",
      managedDocker: parseBoolean(options.manageDocker),
      dockerCleanup: options.dockerCleanup,
    },
    steps: stepSummaries,
    summary: summarizeLadder(stepSummaries, orchestrationErrors),
    setup: setup.map((entry) => sanitizeCommandResult(entry)),
    cleanup: cleanup.map((entry) => sanitizeCommandResult(entry)),
    runnerErrors,
    nextAction: status === "PASSED"
      ? "Treat this as a small mixed workload ladder only; increase duration, root workflow coverage, and concurrency before promoting full-system capacity."
      : "Fix the first failed mixed workload ladder step before increasing full-system concurrency.",
  };
}

export function formatSystemMixedWorkloadLadder(report) {
  const lines = [
    `System mixed workload ladder: ${report.status}`,
    `Profile: ${report.profile}`,
    `Executed steps: ${report.summary.executedSteps}/${report.summary.configuredSteps}`,
    `Total errors: ${report.summary.totalErrors}`,
    "",
    "Step results:",
  ];
  for (const step of report.steps) {
    lines.push(`- ${step.name} ${step.status} identity=${step.identityConcurrency} conversation=${step.conversationConcurrency} teaching=${step.teachingConcurrency} maxP99=${step.maxP99Ms ?? "n/a"}ms errors=${step.totalErrors}`);
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function summarizeStep(step, report) {
  if (!report || typeof report !== "object") {
    return {
      name: step.name,
      executed: false,
      status: "NOT_RUN",
      reportPath: step.reportPath,
      identityConcurrency: step.identityConcurrency,
      conversationConcurrency: step.conversationConcurrency,
      teachingConcurrency: step.teachingConcurrency,
      totalErrors: 0,
      maxP95Ms: null,
      maxP99Ms: null,
      workloads: [],
    };
  }
  return {
    name: step.name,
    executed: true,
    status: report.status ?? "FAILED",
    reportPath: step.reportPath,
    identityConcurrency: step.identityConcurrency,
    identityOperations: step.identityOperations,
    conversationConcurrency: step.conversationConcurrency,
    conversationOperations: step.conversationOperations,
    teachingConcurrency: step.teachingConcurrency,
    teachingOperations: step.teachingOperations,
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

function summarizeLadder(steps, orchestrationErrors) {
  const executedSteps = steps.filter((step) => step.executed);
  const passedSteps = executedSteps.filter((step) => step.status === "PASSED");
  const failedSteps = executedSteps.filter((step) => step.status !== "PASSED");
  return {
    configuredSteps: steps.length,
    executedSteps: executedSteps.length,
    passedSteps: passedSteps.length,
    failedSteps: failedSteps.length,
    totalErrors: executedSteps.reduce((total, step) => total + step.totalErrors, 0) + orchestrationErrors,
    orchestrationErrors,
    maxP95Ms: maxFinite(executedSteps.map((step) => step.maxP95Ms)),
    maxP99Ms: maxFinite(executedSteps.map((step) => step.maxP99Ms)),
    highestPassedStep: passedSteps.at(-1)?.name ?? null,
    firstFailedStep: failedSteps.at(0)?.name ?? null,
  };
}

function parseStepSpecs(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(parseStepSpec);
}

function parseStepSpec(value) {
  const [
    rawName,
    identityConcurrency,
    identityOperations,
    conversationConcurrency,
    conversationOperations,
    teachingConcurrency,
    teachingOperations,
  ] = value.split(":");
  const name = sanitizeStepName(rawName);
  const step = {
    name,
    identityConcurrency: parseInteger(identityConcurrency),
    identityOperations: parseInteger(identityOperations),
    conversationConcurrency: parseInteger(conversationConcurrency),
    conversationOperations: parseInteger(conversationOperations),
    teachingConcurrency: parseInteger(teachingConcurrency ?? identityConcurrency),
    teachingOperations: parseInteger(teachingOperations ?? identityOperations),
  };
  for (const [field, parsed] of Object.entries(step)) {
    if (field === "name") continue;
    if (parsed <= 0) throw new Error(`invalid ladder step ${value}: ${field} must be a positive integer`);
  }
  return step;
}

function validateOptions(options, steps) {
  if (steps.length === 0) throw new Error("at least one ladder step is required");
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

function removeReport(root, relativePath) {
  const absolute = path.join(root, relativePath);
  if (fs.existsSync(absolute)) fs.rmSync(absolute);
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

function sanitizeStepName(value) {
  const name = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/gu, "-");
  if (!name) throw new Error("ladder step name is required");
  return name;
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

function countCommandErrors(results) {
  return results.filter((result) => result.exitCode !== 0).length;
}

function kebabToCamel(value) {
  return value.replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runSystemMixedWorkloadLadder();
  console.log(formatSystemMixedWorkloadLadder(report));
  process.exit(report.status === "PASSED" ? 0 : 1);
}
