import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import {
  buildSustainedMixedWorkloadConversationBenchmarkRuntimeProfile,
  buildSustainedMixedWorkloadIdentityIngressProfile,
  buildSustainedMixedWorkloadTransportProfile,
  defaults as sustainedDefaults,
  runSystemSustainedMixedWorkload,
} from "./run-system-sustained-mixed-workload.mjs";
import {
  defaultSessionTablePersistence,
  normalizeSessionTablePersistence,
} from "./identity-http-benchmark-session-profile.mjs";
import { mergeSystemIdentityPhaseSummary } from "./system-identity-phase-summary.mjs";

export const defaults = {
  out: "reports/system-sustained-mixed-workload-scaleup.current.json",
  stepPrefix: "reports/system-sustained-mixed-workload-scaleup",
  profile: "SUSTAINED_SCALEUP",
  manageDocker: "true",
  dockerCleanup: "reset",
  stopOnFailure: "true",
  steps: "smoke:2:4:8:16:2:4,low:4:8:16:32:4:8",
  samples: "2",
  sampleIntervalMs: "0",
  identityBaseUrl: sustainedDefaults.identityBaseUrl,
  conversationBaseUrl: sustainedDefaults.conversationBaseUrl,
  teachingBaseUrl: sustainedDefaults.teachingBaseUrl,
  identityGatewayCount: "1",
  conversationGatewayCount: "1",
  identitySessionDbMaxConns: "4",
  identitySessionDbWriteConcurrency: "0",
  identitySessionDbSessionTablePersistence: defaultSessionTablePersistence,
  conversationDbMaxConns: "1",
  teachingDbMaxConns: "1",
  conversationWriteBatchSize: "8",
  conversationBenchmarkRuntime: sustainedDefaults.conversationBenchmarkRuntime,
  conversationBenchmarkDockerImage: sustainedDefaults.conversationBenchmarkDockerImage,
  conversationBenchmarkDockerHost: sustainedDefaults.conversationBenchmarkDockerHost,
  conversationBenchmarkWslDistro: sustainedDefaults.conversationBenchmarkWslDistro,
  conversationBenchmarkWslHost: sustainedDefaults.conversationBenchmarkWslHost,
  conversationBenchmarkWslWorkspace: sustainedDefaults.conversationBenchmarkWslWorkspace,
  maxConnsPerHost: "0",
  warmConnectionsPerHost: "0",
  identityMaxConnsPerHost: sustainedDefaults.identityMaxConnsPerHost,
  identityWarmConnectionsPerHost: sustainedDefaults.identityWarmConnectionsPerHost,
  identityIngressProxy: sustainedDefaults.identityIngressProxy,
  identityIngressPort: sustainedDefaults.identityIngressPort,
  identityIngressCount: sustainedDefaults.identityIngressCount,
  identityIngressMaxConnsPerHost: sustainedDefaults.identityIngressMaxConnsPerHost,
  identityIngressWarmConnectionsPerHost: sustainedDefaults.identityIngressWarmConnectionsPerHost,
  timeout: "180s",
  teachingTimeoutMs: sustainedDefaults.teachingTimeoutMs,
  startupTimeoutMs: "120000",
  maxP99Ms: "1000",
  maxP99DriftMs: "250",
};

export function parseArgs(argv) {
  const parsed = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--") || value === undefined) continue;
    if (key === "--identity-session-db-session-table-persistence") {
      parsed.identitySessionDbSessionTablePersistence = normalizeSessionTablePersistence(value);
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

export function buildScaleUpSteps(options) {
  return parseStepSpecs(options.steps).map((step, index) => {
    const reportPrefix = `${options.stepPrefix}.${index + 1}-${step.name}`;
    return {
      ...step,
      reportPath: `${reportPrefix}.json`,
      options: {
        ...sustainedDefaults,
        profile: `${options.profile}_${step.name.toUpperCase()}`,
        manageDocker: "false",
        dockerCleanup: "none",
        out: `${reportPrefix}.json`,
        samplePrefix: reportPrefix,
        samples: options.samples,
        sampleIntervalMs: options.sampleIntervalMs,
        stopOnFailure: options.stopOnFailure,
        identityBaseUrl: options.identityBaseUrl,
        conversationBaseUrl: options.conversationBaseUrl,
        teachingBaseUrl: options.teachingBaseUrl,
        identityGatewayCount: options.identityGatewayCount,
        conversationGatewayCount: options.conversationGatewayCount,
        identitySessionDbMaxConns: options.identitySessionDbMaxConns,
        identitySessionDbWriteConcurrency: options.identitySessionDbWriteConcurrency,
        identitySessionDbSessionTablePersistence: identitySessionTablePersistence(options),
        conversationDbMaxConns: options.conversationDbMaxConns,
        teachingDbMaxConns: options.teachingDbMaxConns,
        conversationWriteBatchSize: options.conversationWriteBatchSize,
        conversationBenchmarkRuntime: options.conversationBenchmarkRuntime,
        conversationBenchmarkDockerImage: options.conversationBenchmarkDockerImage,
        conversationBenchmarkDockerHost: options.conversationBenchmarkDockerHost,
        conversationBenchmarkWslDistro: options.conversationBenchmarkWslDistro,
        conversationBenchmarkWslHost: options.conversationBenchmarkWslHost,
        conversationBenchmarkWslWorkspace: options.conversationBenchmarkWslWorkspace,
        maxConnsPerHost: options.maxConnsPerHost,
        warmConnectionsPerHost: options.warmConnectionsPerHost,
        identityMaxConnsPerHost: options.identityMaxConnsPerHost,
        identityWarmConnectionsPerHost: options.identityWarmConnectionsPerHost,
        identityIngressProxy: options.identityIngressProxy,
        identityIngressPort: options.identityIngressPort,
        identityIngressCount: options.identityIngressCount,
        identityIngressMaxConnsPerHost: options.identityIngressMaxConnsPerHost,
        identityIngressWarmConnectionsPerHost: options.identityIngressWarmConnectionsPerHost,
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

export async function runSystemSustainedMixedWorkloadScaleUp(
  options = parseArgs(process.argv.slice(2)),
  dependencies = {},
) {
  const root = dependencies.root ?? process.cwd();
  const runSyncFn = dependencies.runSync ?? runSync;
  const runStepFn = dependencies.runStep ?? runSystemSustainedMixedWorkload;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const setup = [];
  const cleanup = [];
  const runnerErrors = [];
  const steps = buildScaleUpSteps(options);
  const stepReports = [];

  try {
    validateOptions(options, steps);
    removeReports(root, [options.out, ...steps.map((step) => step.reportPath)]);
    if (parseBoolean(options.manageDocker)) {
      setup.push({ phase: "setup-reset", ...runSyncFn("npm", ["run", "perf:identity-session:reset"], root) });
      if (setup.at(-1).exitCode !== 0) throw new Error("managed Docker reset failed before sustained scale-up");
      setup.push({ phase: "setup-up", ...runSyncFn("npm", ["run", "perf:identity-session:up"], root) });
      if (setup.at(-1).exitCode !== 0) throw new Error("managed Docker setup failed before sustained scale-up");
    }

    for (const step of steps) {
      const report = await runStepFn(step.options, { root });
      stepReports.push({ step, report });
      if (parseBoolean(options.stopOnFailure) && stepBlocksFurtherScale(report, options)) break;
    }
  } catch (error) {
    runnerErrors.push(maskSensitive(error.message));
  } finally {
    if (parseBoolean(options.manageDocker)) {
      cleanup.push(...cleanupDocker(options, root, runSyncFn));
    }
  }

  const endedAt = now();
  const report = buildSystemSustainedMixedWorkloadScaleUpReport({
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

export function buildSystemSustainedMixedWorkloadScaleUpReport({
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
    return summarizeStep(step, report, options);
  });
  const orchestrationErrors = countCommandErrors(setup) + countCommandErrors(cleanup) + runnerErrors.length;
  const executedSteps = stepSummaries.filter((step) => step.executed);
  const allStepsPassed = executedSteps.length === steps.length &&
    executedSteps.every((step) => step.status === "PASSED" && step.guardrailStatus === "PASSED");
  const status = orchestrationErrors === 0 && allStepsPassed ? "PASSED" : "FAILED";

  return {
    generatedAt: endedAt,
    startedAt,
    endedAt,
    benchmarkKind: "system_sustained_mixed_workload_scale_up",
    workloadType: "SUSTAINED_MIXED_WORKLOAD_SCALE_UP",
    profile: options.profile,
    status,
    stopOnFailure: parseBoolean(options.stopOnFailure),
    scaleGuardrails: {
      maxP99Ms: parseInteger(options.maxP99Ms),
      maxP99DriftMs: parseInteger(options.maxP99DriftMs),
      maxTotalErrors: 0,
    },
    concurrencyProfile: {
      identityGatewayCount: parseInteger(options.identityGatewayCount),
      conversationGatewayCount: parseInteger(options.conversationGatewayCount),
      configuredSteps: steps.length,
      samplesPerStep: parseInteger(options.samples),
    },
    transportProfile: buildSustainedMixedWorkloadTransportProfile(options),
    identityIngressProfile: buildSustainedMixedWorkloadIdentityIngressProfile(options),
    databaseProfile: {
      identitySessionDbMaxConns: parseInteger(options.identitySessionDbMaxConns),
      identitySessionDbWriteConcurrency: parseInteger(options.identitySessionDbWriteConcurrency),
      identitySessionTablePersistence: identitySessionTablePersistence(options),
      conversationDbMaxConns: parseInteger(options.conversationDbMaxConns),
      teachingDbMaxConns: parseInteger(options.teachingDbMaxConns),
      conversationWriteBatchSize: parseInteger(options.conversationWriteBatchSize),
    },
    runtimeProfile: {
      executor: "LOCAL_NODE_SUSTAINED_SCALEUP_ORCHESTRATOR",
      managedDocker: parseBoolean(options.manageDocker),
      dockerCleanup: options.dockerCleanup,
    },
    conversationBenchmarkRuntimeProfile: buildSustainedMixedWorkloadConversationBenchmarkRuntimeProfile(options),
    steps: stepSummaries,
    summary: summarizeScaleUp(stepSummaries, orchestrationErrors),
    setup: setup.map((entry) => sanitizeCommandResult(entry)),
    cleanup: cleanup.map((entry) => sanitizeCommandResult(entry)),
    runnerErrors,
    nextAction: status === "PASSED"
      ? "Treat this as sustained mixed workload scale-up evidence only; add root workflow coverage and cross-module diagnostics before any full-system capacity promotion."
      : "Fix the first failed or guardrail-blocked sustained scale-up step before increasing full-system concurrency.",
  };
}

export function formatSystemSustainedMixedWorkloadScaleUp(report) {
  const lines = [
    `System sustained mixed workload scale-up: ${report.status}`,
    `Profile: ${report.profile}`,
    `Executed steps: ${report.summary.executedSteps}/${report.summary.configuredSteps}`,
    `Highest passed step: ${report.summary.highestPassedStep ?? "none"}`,
    `First blocked step: ${report.summary.firstBlockedStep ?? "none"}`,
    `Total errors: ${report.summary.totalErrors}`,
    "",
    "Step results:",
  ];
  for (const step of report.steps) {
    lines.push(
      `- ${step.name} ${step.status}/${step.guardrailStatus} identity=${step.identityConcurrency} conversation=${step.conversationConcurrency} teaching=${step.teachingConcurrency} maxP99=${step.maxP99Ms ?? "n/a"}ms drift=${step.p99DriftMs ?? "n/a"}ms errors=${step.totalErrors}`,
    );
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function summarizeStep(step, report, options) {
  if (!report || typeof report !== "object") {
    return {
      name: step.name,
      executed: false,
      status: "NOT_RUN",
      guardrailStatus: "NOT_RUN",
      reportPath: step.reportPath,
      identityConcurrency: step.identityConcurrency,
      conversationConcurrency: step.conversationConcurrency,
      teachingConcurrency: step.teachingConcurrency,
      totalErrors: 0,
      maxP95Ms: null,
      maxP99Ms: null,
      p99DriftMs: null,
      readWriteRps: null,
      aggregateRps: null,
      guardrailFindings: [],
    };
  }
  const guardrailFindings = buildGuardrailFindings(report, options);
  const throughput = summarizeStepThroughput(report);
  return {
    name: step.name,
    executed: true,
    status: report.status ?? "FAILED",
    guardrailStatus: guardrailFindings.every((finding) => finding.passed) ? "PASSED" : "BLOCKED",
    reportPath: step.reportPath,
    identityConcurrency: step.identityConcurrency,
    identityOperations: step.identityOperations,
    conversationConcurrency: step.conversationConcurrency,
    conversationOperations: step.conversationOperations,
    teachingConcurrency: step.teachingConcurrency,
    teachingOperations: step.teachingOperations,
    samples: numberOrNull(report.summary?.executedSamples),
    totalErrors: numberOrZero(report.summary?.totalErrors),
    maxP95Ms: numberOrNull(report.summary?.maxP95Ms),
    maxP99Ms: numberOrNull(report.summary?.maxP99Ms),
    p99DriftMs: numberOrNull(report.summary?.p99DriftMs),
    readWriteRps: throughput.readWriteRps,
    aggregateRps: throughput.aggregateRps,
    workloads: summarizeWorkloads(report),
    guardrailFindings,
  };
}

function buildGuardrailFindings(report, options) {
  const maxP99Ms = numberOrNull(report.summary?.maxP99Ms);
  const p99DriftMs = numberOrNull(report.summary?.p99DriftMs);
  const totalErrors = numberOrZero(report.summary?.totalErrors);
  const p99Limit = parseInteger(options.maxP99Ms);
  const driftLimit = parseInteger(options.maxP99DriftMs);
  return [
    {
      id: "step.status_passed",
      passed: report.status === "PASSED",
      actual: report.status ?? "missing",
      expected: "PASSED",
    },
    {
      id: "step.total_errors_zero",
      passed: totalErrors === 0,
      actual: totalErrors,
      expected: 0,
    },
    {
      id: "step.max_p99_within_guardrail",
      passed: Number.isFinite(maxP99Ms) && maxP99Ms <= p99Limit,
      actual: maxP99Ms,
      expected: `<=${p99Limit}`,
    },
    {
      id: "step.p99_drift_within_guardrail",
      passed: !Number.isFinite(p99DriftMs) || Math.abs(p99DriftMs) <= driftLimit,
      actual: p99DriftMs,
      expected: `abs<=${driftLimit}`,
    },
  ];
}

function summarizeWorkloads(report) {
  return Array.isArray(report.samples)
    ? report.samples.flatMap((sample) => sample.workloads ?? []).reduce((workloads, workload) => {
        const existing = workloads.find((entry) => entry.name === workload.name);
        if (existing) {
          existing.errors += numberOrZero(workload.errors);
          existing.maxP99Ms = maxNullable(existing.maxP99Ms, numberOrNull(workload.p99Ms));
          existing.summary = mergeWorkloadSummary(existing.summary, workload.summary);
          return workloads;
        }
        workloads.push({
          name: workload.name,
          errors: numberOrZero(workload.errors),
          maxP99Ms: numberOrNull(workload.p99Ms),
          summary: copyWorkloadSummary(workload.summary),
        });
        return workloads;
      }, [])
    : [];
}

function copyWorkloadSummary(summary) {
  return summary && typeof summary === "object" ? { ...summary } : undefined;
}

function mergeWorkloadSummary(left, right) {
  if (!left || typeof left !== "object") return copyWorkloadSummary(right);
  if (!right || typeof right !== "object") return left;
  const merged = {
    ...left,
    ...right,
    errors: numberOrZero(left.errors) + numberOrZero(right.errors),
    p95Ms: maxNullable(numberOrNull(left.p95Ms), numberOrNull(right.p95Ms)),
    p99Ms: maxNullable(numberOrNull(left.p99Ms), numberOrNull(right.p99Ms)),
    serverTimingP99Ms: maxNullable(numberOrNull(left.serverTimingP99Ms), numberOrNull(right.serverTimingP99Ms)),
    clientServerGapP99Ms: maxNullable(
      numberOrNull(left.clientServerGapP99Ms),
      numberOrNull(right.clientServerGapP99Ms),
    ),
    dbAcquireP99Ms: maxNullable(numberOrNull(left.dbAcquireP99Ms), numberOrNull(right.dbAcquireP99Ms)),
    dbBatchWaitP99Ms: maxNullable(numberOrNull(left.dbBatchWaitP99Ms), numberOrNull(right.dbBatchWaitP99Ms)),
    dbInsertP99Ms: maxNullable(numberOrNull(left.dbInsertP99Ms), numberOrNull(right.dbInsertP99Ms)),
    runtimeDiagnostics: right.runtimeDiagnostics ?? left.runtimeDiagnostics,
    databaseDiagnostics: right.databaseDiagnostics ?? left.databaseDiagnostics,
    gatewayExitCode: right.gatewayExitCode ?? left.gatewayExitCode,
    gatewaySignal: right.gatewaySignal ?? left.gatewaySignal,
  };
  if (left.phases || right.phases || left.dominantPhase || right.dominantPhase) {
    const identityPhaseSummary = mergeSystemIdentityPhaseSummary(left, right);
    merged.phases = identityPhaseSummary?.phases;
    merged.dominantPhase = identityPhaseSummary?.dominantPhase ?? null;
    merged.dominantPhaseP99Ms = identityPhaseSummary?.dominantPhaseP99Ms ?? null;
  }
  return merged;
}

function summarizeScaleUp(steps, orchestrationErrors) {
  const executedSteps = steps.filter((step) => step.executed);
  const passedSteps = executedSteps.filter((step) => step.status === "PASSED" && step.guardrailStatus === "PASSED");
  const blockedSteps = executedSteps.filter((step) => step.status !== "PASSED" || step.guardrailStatus !== "PASSED");
  const highestPassedStep = passedSteps.at(-1) ?? null;
  const highestPassedReadWriteRps = numberOrNull(highestPassedStep?.readWriteRps);
  const highestPassedAggregateRps = numberOrNull(highestPassedStep?.aggregateRps);
  return {
    configuredSteps: steps.length,
    executedSteps: executedSteps.length,
    passedSteps: passedSteps.length,
    blockedSteps: blockedSteps.length,
    totalErrors: executedSteps.reduce((total, step) => total + step.totalErrors, 0) + orchestrationErrors,
    orchestrationErrors,
    maxP95Ms: maxFinite(executedSteps.map((step) => step.maxP95Ms)),
    maxP99Ms: maxFinite(executedSteps.map((step) => step.maxP99Ms)),
    maxP99DriftMs: maxFinite(executedSteps.map((step) =>
      Number.isFinite(step.p99DriftMs) ? Math.abs(step.p99DriftMs) : null,
    )),
    highestPassedReadWriteRps,
    highestPassedAggregateRps,
    maxPassedReadWriteRps: maxFinite(passedSteps.map((step) => step.readWriteRps)),
    aggregateReadWriteRps: highestPassedReadWriteRps,
    highestPassedStep: highestPassedStep?.name ?? null,
    firstBlockedStep: blockedSteps.at(0)?.name ?? null,
  };
}

function summarizeStepThroughput(report) {
  const readWriteRps = firstFinite(
    report.summary?.readWriteRps,
    report.summary?.aggregateReadWriteRps,
    report.summary?.minPassedReadWriteRps,
    minFinite((report.samples ?? []).map((sample) => numberOrNull(sample.readWriteRps))),
  );
  return {
    readWriteRps,
    aggregateRps: firstFinite(report.summary?.aggregateReadWriteRps, report.summary?.readWriteRps, readWriteRps),
  };
}

function stepBlocksFurtherScale(report, options) {
  if (!report || typeof report !== "object") return true;
  return buildGuardrailFindings(report, options).some((finding) => !finding.passed);
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
    if (parsed <= 0) throw new Error(`invalid sustained scale-up step ${value}: ${field} must be a positive integer`);
  }
  return step;
}

function validateOptions(options, steps) {
  if (steps.length === 0) throw new Error("at least one sustained scale-up step is required");
  assertPositiveInteger(options.samples, "samples");
  assertNonNegativeInteger(options.sampleIntervalMs, "sample-interval-ms");
  assertPositiveInteger(options.identityGatewayCount, "identity-gateway-count");
  assertPositiveInteger(options.conversationGatewayCount, "conversation-gateway-count");
  assertPositiveInteger(options.identitySessionDbMaxConns, "identity-session-db-max-conns");
  assertNonNegativeInteger(options.identitySessionDbWriteConcurrency, "identity-session-db-write-concurrency");
  identitySessionTablePersistence(options);
  assertPositiveInteger(options.conversationDbMaxConns, "conversation-db-max-conns");
  assertPositiveInteger(options.teachingDbMaxConns, "teaching-db-max-conns");
  assertPositiveInteger(options.conversationWriteBatchSize, "conversation-write-batch-size");
  assertPositiveInteger(options.teachingTimeoutMs, "teaching-timeout-ms");
  assertPositiveInteger(options.maxP99Ms, "max-p99-ms");
  assertPositiveInteger(options.maxP99DriftMs, "max-p99-drift-ms");
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

function sanitizeStepName(value) {
  const name = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/gu, "-");
  if (!name) throw new Error("sustained scale-up step name is required");
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

function assertNonNegativeInteger(value, name) {
  if (!/^\d+$/u.test(String(value))) throw new Error(`${name} must be a non-negative integer`);
}

function parseInteger(value) {
  if (!/^-?\d+$/u.test(String(value))) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function identitySessionTablePersistence(options) {
  return normalizeSessionTablePersistence(options.identitySessionDbSessionTablePersistence);
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

function maxNullable(left, right) {
  if (Number.isFinite(left) && Number.isFinite(right)) return Math.max(left, right);
  return Number.isFinite(left) ? left : right;
}

function firstFinite(...values) {
  return values.find(Number.isFinite) ?? null;
}

function countCommandErrors(results) {
  return results.filter((result) => result.exitCode !== 0).length;
}

function kebabToCamel(value) {
  return value.replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runSystemSustainedMixedWorkloadScaleUp();
  console.log(formatSystemSustainedMixedWorkloadScaleUp(report));
  process.exit(report.status === "PASSED" ? 0 : 1);
}
