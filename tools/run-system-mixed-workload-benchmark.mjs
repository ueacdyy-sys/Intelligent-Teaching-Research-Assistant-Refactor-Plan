import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import {
  defaultSessionTablePersistence,
  normalizeSessionTablePersistence,
} from "./identity-http-benchmark-session-profile.mjs";
import { benchmarkRuntimeDefaults } from "./conversation-benchmark-runtime.mjs";
import {
  buildSystemConversationBenchmarkRuntimeProfile,
  systemConversationBenchmarkRuntime,
} from "./system-conversation-benchmark-runtime-profile.mjs";
import {
  buildSystemIdentityBenchmarkRuntimeProfile,
  systemIdentityBenchmarkRuntimeArgs,
  systemIdentityBenchmarkRuntime,
} from "./system-identity-benchmark-runtime-profile.mjs";
import {
  assertSystemTeachingBenchmarkOptions,
  buildSystemTeachingBenchmarkRuntimeProfile,
  buildSystemTeachingTransportProfile,
  summarizeTeachingArchiveReport,
  systemTeachingBenchmarkDefaults,
  systemTeachingBenchmarkRuntimeArgs,
} from "./system-teaching-benchmark-runtime-profile.mjs";
import { buildSystemIdentityPhaseSummary } from "./system-identity-phase-summary.mjs";
import { portRange, portSequence } from "./system-port-profile.mjs";

export const defaults = {
  out: "reports/system-mixed-workload-benchmark.current.json",
  profile: "SMOKE",
  manageDocker: "false",
  dockerCleanup: "down",
  identityOut: "reports/system-mixed-workload.identity-http-smoke.json",
  conversationOut: "reports/system-mixed-workload.conversation-write-smoke.json",
  teachingOut: "reports/system-mixed-workload.teaching-archive-smoke.json",
  knowledgeOut: "reports/system-mixed-workload.knowledge-retrieval-smoke.json",
  aiAdmissionOut: "reports/system-mixed-workload.ai-worker-admission-smoke.json",
  identityBaseUrl: "http://127.0.0.1:18300",
  conversationBaseUrl: "http://127.0.0.1:18400",
  teachingBaseUrl: "http://127.0.0.1:18500",
  identityConcurrency: "16",
  identityOperations: "40",
  conversationConcurrency: "64",
  conversationOperations: "128",
  teachingConcurrency: "8",
  teachingOperations: "24",
  identityGatewayCount: "1",
  conversationGatewayCount: "1",
  teachingGatewayCount: "1",
  identitySessionDbMaxConns: "8",
  identitySessionDbWriteConcurrency: "0",
  identitySessionDbSessionTablePersistence: defaultSessionTablePersistence,
  conversationDbMaxConns: "4",
  teachingDbMaxConns: "2",
  conversationWriteBatchSize: "32",
  conversationBenchmarkRuntime: benchmarkRuntimeDefaults.benchmarkRuntime,
  conversationBenchmarkDockerImage: benchmarkRuntimeDefaults.benchmarkDockerImage,
  conversationBenchmarkDockerHost: benchmarkRuntimeDefaults.benchmarkDockerHost,
  conversationBenchmarkWslDistro: benchmarkRuntimeDefaults.benchmarkWslDistro,
  conversationBenchmarkWslHost: benchmarkRuntimeDefaults.benchmarkWslHost,
  conversationBenchmarkWslWorkspace: benchmarkRuntimeDefaults.benchmarkWslWorkspace,
  identityBenchmarkRuntime: "local", identityBenchmarkDockerImage: "golang:1.26-alpine", identityBenchmarkDockerHost: "host.docker.internal",
  ...systemTeachingBenchmarkDefaults,
  maxConnsPerHost: "0",
  warmConnectionsPerHost: "0",
  identityMaxConnsPerHost: "",
  identityWarmConnectionsPerHost: "",
  identityIngressProxy: "false",
  identityIngressPort: "18080",
  identityIngressCount: "1",
  identityIngressMaxConnsPerHost: "0",
  identityIngressWarmConnectionsPerHost: "0",
  timeout: "180s",
  teachingTimeoutMs: "10000",
  startupTimeoutMs: "120000",
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

export function buildWorkloadCommands(options) {
  return [
    {
      name: "identity_http",
      moduleSlice: "Identity And Access",
      sourceReportPath: options.identityOut,
      command: process.execPath,
      args: [
        "tools/run-identity-http-benchmark.mjs",
        "--base-url",
        options.identityBaseUrl,
        "--gateway-count",
        options.identityGatewayCount,
        "--session-db-max-conns",
        options.identitySessionDbMaxConns,
        "--session-db-write-concurrency",
        options.identitySessionDbWriteConcurrency,
        "--session-db-session-table-persistence",
        identitySessionTablePersistence(options),
        "--concurrency",
        options.identityConcurrency,
        "--operations",
        options.identityOperations,
        "--max-conns-per-host",
        identityMaxConnsPerHost(options),
        "--warm-connections-per-host",
        identityWarmConnectionsPerHost(options),
        "--ingress-proxy",
        options.identityIngressProxy,
        "--ingress-port",
        options.identityIngressPort,
        "--ingress-count",
        options.identityIngressCount,
        "--ingress-max-conns-per-host",
        options.identityIngressMaxConnsPerHost,
        "--ingress-warm-connections-per-host",
        options.identityIngressWarmConnectionsPerHost,
        ...systemIdentityBenchmarkRuntimeArgs(options),
        "--out",
        options.identityOut,
        "--timeout",
        options.timeout,
        "--startup-timeout-ms",
        options.startupTimeoutMs,
      ],
    },
    {
      name: "conversation_write",
      moduleSlice: "Research Conversation Write",
      sourceReportPath: options.conversationOut,
      command: process.execPath,
      args: [
        "tools/run-conversation-write-benchmark.mjs",
        "--base-url",
        options.conversationBaseUrl,
        "--gateway-count",
        options.conversationGatewayCount,
        "--db-max-conns",
        options.conversationDbMaxConns,
        "--write-batch-size",
        options.conversationWriteBatchSize,
        "--write-batch-delay-ms",
        "0",
        "--benchmark-runtime",
        systemConversationBenchmarkRuntime(options),
        "--benchmark-docker-image",
        options.conversationBenchmarkDockerImage,
        "--benchmark-docker-host",
        options.conversationBenchmarkDockerHost,
        "--benchmark-wsl-distro",
        options.conversationBenchmarkWslDistro,
        "--benchmark-wsl-host",
        options.conversationBenchmarkWslHost,
        "--benchmark-wsl-workspace",
        options.conversationBenchmarkWslWorkspace,
        "--agent-api-key",
        "ueacd",
        "--concurrency",
        options.conversationConcurrency,
        "--operations",
        options.conversationOperations,
        "--max-conns-per-host",
        options.maxConnsPerHost,
        "--warm-connections-per-host",
        options.warmConnectionsPerHost,
        "--out",
        options.conversationOut,
        "--timeout",
        options.timeout,
        "--startup-timeout-ms",
        options.startupTimeoutMs,
      ],
    },
    {
      name: "teaching_archive",
      moduleSlice: "Teaching Archive And Quiz",
      sourceReportPath: options.teachingOut,
      command: process.execPath,
      args: [
        "tools/run-teaching-archive-benchmark.mjs",
        "--base-url",
        options.teachingBaseUrl,
        "--gateway-count",
        options.teachingGatewayCount,
        "--db-max-conns",
        options.teachingDbMaxConns,
        "--agent-api-key",
        "ueacd",
        "--concurrency",
        options.teachingConcurrency,
        "--operations",
        options.teachingOperations,
        ...systemTeachingBenchmarkRuntimeArgs(options),
        "--out",
        options.teachingOut,
        "--timeout",
        options.timeout,
        "--timeout-ms",
        options.teachingTimeoutMs,
        "--startup-timeout-ms",
        options.startupTimeoutMs,
      ],
    },
    {
      name: "knowledge_retrieval",
      moduleSlice: "Knowledge Retrieval",
      sourceReportPath: options.knowledgeOut,
      command: process.execPath,
      args: ["tools/knowledge-retrieval-benchmark-audit.mjs", "--out", options.knowledgeOut],
    },
    {
      name: "ai_worker_admission",
      moduleSlice: "AI Worker Admission",
      sourceReportPath: options.aiAdmissionOut,
      command: process.execPath,
      args: ["tools/ai-worker-job-admission.mjs", "--out", options.aiAdmissionOut],
    },
  ];
}

export async function runSystemMixedWorkloadBenchmark(options = parseArgs(process.argv.slice(2)), dependencies = {}) {
  const root = dependencies.root ?? process.cwd();
  const runCommandFn = dependencies.runCommand ?? runCommand;
  const runSyncFn = dependencies.runSync ?? runSync;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const setup = [];
  const cleanup = [];
  const runnerErrors = [];
  let results = [];
  const commands = buildWorkloadCommands(options);

  validateOptions(options);
  removeReports(root, [options.out, ...commands.map((command) => command.sourceReportPath)]);
  try {
    if (parseBoolean(options.manageDocker)) {
      setup.push({ phase: "setup", ...runSyncFn("npm", ["run", "perf:identity-session:up"], root) });
      if (setup.at(-1).exitCode !== 0) {
        throw new Error("managed Docker setup failed before mixed workload execution");
      }
    }
    results = await Promise.all(commands.map((command) => runWorkloadCommand(command, root, runCommandFn)));
  } catch (error) {
    runnerErrors.push(maskSensitive(error.message));
  } finally {
    if (parseBoolean(options.manageDocker)) {
      cleanup.push(...cleanupDocker(options, root, runSyncFn));
    }
  }
  const endedAt = now();
  const childReports = Object.fromEntries(commands.map((command) => [
    command.name,
    readOptionalJson(root, command.sourceReportPath),
  ]));
  const report = buildSystemMixedWorkloadReport({
    options,
    commands,
    results,
    childReports,
    setup,
    cleanup,
    runnerErrors,
    startedAt,
    endedAt,
  });
  writeJsonReport(path.join(root, options.out), report);
  return report;
}

export function buildSystemMixedWorkloadReport({
  options,
  commands,
  results,
  childReports,
  setup = [],
  cleanup = [],
  runnerErrors = [],
  startedAt,
  endedAt,
}) {
  const workloads = commands.map((command) => summarizeWorkload(
    command,
    results.find((result) => result.name === command.name),
    childReports[command.name],
  ));
  const orchestrationErrors = countCommandErrors(setup) + countCommandErrors(cleanup) + runnerErrors.length;
  const status = orchestrationErrors === 0 &&
    workloads.every((workload) => workload.status === "PASSED" || workload.status === "READY")
    ? "PASSED"
    : "FAILED";
  const workloadErrors = workloads.reduce((total, workload) => total + workload.errors, 0);
  return {
    generatedAt: endedAt,
    startedAt,
    endedAt,
    benchmarkKind: "system_mixed_workload",
    workloadType: "MIXED_WORKLOAD",
    profile: options.profile,
    status,
    concurrencyProfile: {
      identityConcurrency: parseInteger(options.identityConcurrency),
      conversationConcurrency: parseInteger(options.conversationConcurrency),
      teachingConcurrency: parseInteger(options.teachingConcurrency),
      identityGatewayCount: parseInteger(options.identityGatewayCount),
      conversationGatewayCount: parseInteger(options.conversationGatewayCount),
      teachingGatewayCount: parseInteger(options.teachingGatewayCount),
    },
    transportProfile: buildMixedWorkloadTransportProfile(options),
    identityIngressProfile: buildMixedWorkloadIdentityIngressProfile(options),
    databaseProfile: {
      identitySessionDbMaxConns: parseInteger(options.identitySessionDbMaxConns),
      identitySessionDbWriteConcurrency: parseInteger(options.identitySessionDbWriteConcurrency),
      identitySessionTablePersistence: identitySessionTablePersistence(options),
      conversationDbMaxConns: parseInteger(options.conversationDbMaxConns),
      teachingDbMaxConns: parseInteger(options.teachingDbMaxConns),
      conversationWriteBatchSize: parseInteger(options.conversationWriteBatchSize),
    },
    runtimeProfile: {
      executor: "LOCAL_NODE_ORCHESTRATOR",
      managedDocker: parseBoolean(options.manageDocker),
      dockerCleanup: options.dockerCleanup,
    },
    conversationBenchmarkRuntimeProfile: buildMixedWorkloadConversationBenchmarkRuntimeProfile(options),
    identityBenchmarkRuntimeProfile: buildSystemIdentityBenchmarkRuntimeProfile(options),
    teachingBenchmarkRuntimeProfile: buildMixedWorkloadTeachingBenchmarkRuntimeProfile(options),
    workloads,
    summary: summarizeMixedWorkload(workloads, orchestrationErrors),
    setup: setup.map((entry) => sanitizeCommandResult(entry)),
    cleanup: cleanup.map((entry) => sanitizeCommandResult(entry)),
    runnerErrors,
    sourceCommands: commands.map((command) => ({
      name: command.name,
      moduleSlice: command.moduleSlice,
      sourceReportPath: command.sourceReportPath,
      command: sanitizeCommandLine(command),
    })),
    errors: workloadErrors + orchestrationErrors,
    nextAction: status === "PASSED"
      ? "Treat this as mixed workload smoke evidence only; increase duration, concurrency, and root workflow coverage before promoting full-system ultra-concurrency."
      : "Fix the failed mixed workload slice before using it for system capacity claims.",
  };
}

export function buildMixedWorkloadTransportProfile(options) {
  return {
    sharedMaxConnsPerHost: parseInteger(options.maxConnsPerHost),
    sharedWarmConnectionsPerHost: parseInteger(options.warmConnectionsPerHost),
    ...buildSystemTeachingTransportProfile(options),
    identityMaxConnsPerHost: parseInteger(identityMaxConnsPerHost(options)),
    identityWarmConnectionsPerHost: parseInteger(identityWarmConnectionsPerHost(options)),
  };
}

export function buildMixedWorkloadIdentityIngressProfile(options) {
  return {
    enabled: parseBoolean(options.identityIngressProxy),
    basePort: parseInteger(options.identityIngressPort),
    workerCount: parseInteger(options.identityIngressCount),
    upstreamGatewayCount: parseInteger(options.identityGatewayCount),
    maxConnsPerHost: parseInteger(options.identityIngressMaxConnsPerHost),
    warmConnectionsPerHost: parseInteger(options.identityIngressWarmConnectionsPerHost),
  };
}

export function buildMixedWorkloadConversationBenchmarkRuntimeProfile(options) {
  return buildSystemConversationBenchmarkRuntimeProfile(options);
}

export function buildMixedWorkloadTeachingBenchmarkRuntimeProfile(options) {
  return buildSystemTeachingBenchmarkRuntimeProfile(options);
}

export function formatSystemMixedWorkloadBenchmark(report) {
  const lines = [
    `System mixed workload benchmark: ${report.status}`,
    `Profile: ${report.profile}`,
    `Workloads: ${report.workloads.length}`,
    `Total errors: ${report.summary.totalErrors}`,
    "",
    "Workload results:",
  ];
  for (const workload of report.workloads) {
    lines.push(`- ${workload.name} ${workload.status} p95=${workload.p95Ms ?? "n/a"}ms p99=${workload.p99Ms ?? "n/a"}ms errors=${workload.errors}`);
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

async function runWorkloadCommand(command, root, runCommandFn) {
  const startedAt = new Date().toISOString();
  const result = await runCommandFn(command.command, command.args, root);
  return {
    name: command.name,
    startedAt,
    endedAt: new Date().toISOString(),
    ...sanitizeCommandResult(result),
  };
}

function summarizeWorkload(command, result, reportState) {
  const report = reportState?.value;
  const status = sourceStatus(report, result);
  const summary = summarizeSourceReport(command.name, report);
  return {
    name: command.name,
    moduleSlice: command.moduleSlice,
    sourceReportPath: command.sourceReportPath,
    status,
    exitCode: result?.exitCode ?? 1,
    elapsedMs: result?.elapsedMs ?? null,
    errors: summary.errors ?? (status === "PASSED" || status === "READY" ? 0 : 1),
    p95Ms: summary.p95Ms ?? null,
    p99Ms: summary.p99Ms ?? null,
    rps: summary.rps ?? null,
    readiness: summary.readiness ?? null,
    reportPresent: reportState?.present === true,
    reportParseable: reportState?.parseable === true,
    outputTail: result?.outputTail ?? "",
    summary,
  };
}

function summarizeSourceReport(name, report) {
  if (!report || typeof report !== "object") return {};
  if (name === "identity_http") return summarizeIdentity(report);
  if (name === "conversation_write") return summarizeConversation(report);
  if (name === "teaching_archive") return summarizeTeachingArchiveReport(report);
  if (name === "knowledge_retrieval") {
    return {
      readiness: report.readiness ?? null,
      errors: report.readiness === "READY" ? 0 : 1,
      p95Ms: numberOrNull(report.benchmark?.metrics?.p95QueryPlanMs),
    };
  }
  if (name === "ai_worker_admission") {
    return {
      readiness: report.readiness ?? null,
      errors: report.readiness === "READY" ? 0 : 1,
    };
  }
  return {};
}

function summarizeIdentity(report) {
  const phases = Object.values(report.phases ?? {});
  const p95Values = phases.map((phase) => numberOrNull(phase.latencyMs?.p95)).filter(Number.isFinite);
  const p99Values = phases.map((phase) => numberOrNull(phase.latencyMs?.p99)).filter(Number.isFinite);
  const errors = phases.reduce((total, phase) => total + numberOrZero(phase.errors), 0);
  return {
    errors,
    p95Ms: p95Values.length ? Math.max(...p95Values) : null,
    p99Ms: p99Values.length ? Math.max(...p99Values) : null,
    rps: minFinite(phases.map((phase) => numberOrNull(phase.rps))),
    concurrency: numberOrNull(report.concurrency),
    ...buildSystemIdentityPhaseSummary(report.phases, report.gatewayDatabasePhaseDiagnostics),
  };
}

function summarizeConversation(report) {
  const phase = report.phases?.createConversation ?? {};
  return {
    errors: numberOrZero(phase.errors),
    p95Ms: numberOrNull(phase.latencyMs?.p95),
    p99Ms: numberOrNull(phase.latencyMs?.p99),
    rps: numberOrNull(phase.rps),
    concurrency: numberOrNull(report.concurrency),
    serverTimingP99Ms: numberOrNull(phase.serverTimingMs?.p99),
    clientServerGapP99Ms: numberOrNull(phase.clientServerGapMs?.p99),
    dbAcquireP99Ms: numberOrNull(phase.serverTimingBreakdownMs?.["db.acquire"]?.p99),
    dbBatchWaitP99Ms: numberOrNull(phase.serverTimingBreakdownMs?.["db.batch_wait"]?.p99),
    dbInsertP99Ms: numberOrNull(phase.serverTimingBreakdownMs?.["db.insert"]?.p99),
    benchmarkRuntimeProfile: report.benchmarkRuntimeProfile ?? null,
    gatewayExitCode: report.gatewayExitCode ?? null,
    gatewaySignal: report.gatewaySignal ?? null,
    runtimeDiagnostics: summarizeGatewayDiagnostics(report.gatewayRuntimeDiagnostics),
    databaseDiagnostics: summarizeGatewayDiagnostics(report.gatewayDatabaseDiagnostics),
  };
}

function summarizeGatewayDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== "object") return undefined;
  const summarized = Object.fromEntries(
    ["before", "after"].map((snapshotName) => [snapshotName, summarizeGatewaySnapshot(diagnostics[snapshotName])])
      .filter(([_name, snapshot]) => snapshot !== undefined),
  );
  return Object.keys(summarized).length > 0 ? summarized : undefined;
}

function summarizeGatewaySnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.gateways)) return undefined;
  const gateways = snapshot.gateways;
  const stats = gateways.map((gateway) => gateway.stats ?? {});
  return {
    gatewayCount: gateways.length,
    okGateways: gateways.filter((gateway) => gateway.status === "OK").length,
    unavailableGateways: gateways.filter((gateway) => gateway.status !== "OK").length,
    maxCurrentConns: maxFinite(stats.map((entry) => numberOrNull(entry.maxCurrentConns))),
    totalAcceptedConns: sumFinite(stats.map((entry) => numberOrNull(entry.acceptedConns))),
    totalEmptyAcquireCount: sumFinite(stats.map((entry) => numberOrNull(entry.emptyAcquireCount))),
    totalAcquireWaitTimeMs: round(sumFinite(stats.map((entry) => numberOrNull(entry.emptyAcquireWaitTimeMs))), 2),
  };
}

function summarizeMixedWorkload(workloads, orchestrationErrors = 0) {
  const workloadErrors = workloads.reduce((total, workload) => total + workload.errors, 0);
  return {
    totalErrors: workloadErrors + orchestrationErrors,
    workloadErrors,
    orchestrationErrors,
    maxP95Ms: maxFinite(workloads.map((workload) => workload.p95Ms)),
    maxP99Ms: maxFinite(workloads.map((workload) => workload.p99Ms)),
    passedWorkloads: workloads.filter((workload) => workload.status === "PASSED" || workload.status === "READY").length,
    failedWorkloads: workloads.filter((workload) => workload.status !== "PASSED" && workload.status !== "READY").length,
  };
}

function sourceStatus(report, result) {
  if (result?.exitCode !== 0) return "FAILED";
  if (!report || typeof report !== "object") return "FAILED";
  if (typeof report.status === "string") return report.status;
  if (typeof report.readiness === "string") return report.readiness;
  if (typeof report.allPassed === "boolean") return report.allPassed ? "PASSED" : "FAILED";
  return "FAILED";
}

function validateOptions(options) {
  assertPositiveInteger(options.identityConcurrency, "identity-concurrency");
  assertPositiveInteger(options.identityOperations, "identity-operations");
  assertPositiveInteger(options.conversationConcurrency, "conversation-concurrency");
  assertPositiveInteger(options.conversationOperations, "conversation-operations");
  assertPositiveInteger(options.teachingConcurrency, "teaching-concurrency");
  assertPositiveInteger(options.teachingOperations, "teaching-operations");
  assertPositiveInteger(options.identityGatewayCount, "identity-gateway-count");
  assertPositiveInteger(options.conversationGatewayCount, "conversation-gateway-count");
  assertPositiveInteger(options.teachingGatewayCount, "teaching-gateway-count");
  assertPositiveInteger(options.identitySessionDbMaxConns, "identity-session-db-max-conns");
  assertNonNegativeInteger(options.identitySessionDbWriteConcurrency, "identity-session-db-write-concurrency");
  identitySessionTablePersistence(options);
  assertPositiveInteger(options.conversationDbMaxConns, "conversation-db-max-conns");
  assertPositiveInteger(options.teachingDbMaxConns, "teaching-db-max-conns");
  assertPositiveInteger(options.conversationWriteBatchSize, "conversation-write-batch-size");
  systemConversationBenchmarkRuntime(options);
  systemIdentityBenchmarkRuntime(options);
  assertSystemTeachingBenchmarkOptions(options);
  assertPositiveInteger(options.teachingTimeoutMs, "teaching-timeout-ms");
  if (parseBoolean(options.identityIngressProxy)) {
    assertPositiveInteger(options.identityIngressCount, "identity-ingress-count");
  }
  assertNoPortOverlap(options);
}

function assertNoPortOverlap(options) {
  const identityPorts = portRange(options.identityBaseUrl, parseInteger(options.identityGatewayCount), "identity-base-url");
  const identityIngressPorts = parseBoolean(options.identityIngressProxy)
    ? portSequence(options.identityIngressPort, parseInteger(options.identityIngressCount), "identity-ingress-port")
    : [];
  const conversationPorts = portRange(
    options.conversationBaseUrl,
    parseInteger(options.conversationGatewayCount),
    "conversation-base-url",
  );
  const teachingPorts = portRange(
    options.teachingBaseUrl,
    parseInteger(options.teachingGatewayCount),
    "teaching-base-url",
  );
  const overlap = identityPorts
    .filter((port) =>
      identityIngressPorts.includes(port) || conversationPorts.includes(port) || teachingPorts.includes(port))
    .concat(identityIngressPorts.filter((port) =>
      conversationPorts.includes(port) || teachingPorts.includes(port)))
    .concat(conversationPorts.filter((port) => teachingPorts.includes(port)));
  if (overlap.length > 0) {
    throw new Error(`mixed workload gateway port overlap: ${[...new Set(overlap)].join(", ")}`);
  }
}

function cleanupDocker(options, root, runSyncFn) {
  if (options.dockerCleanup === "none") return [];
  const script = options.dockerCleanup === "reset" ? "perf:identity-session:reset" : "perf:identity-session:down";
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

function runCommand(command, args, root) {
  const startedAt = Date.now();
  const runnable = toRunnableCommand(command, args);
  return new Promise((resolve) => {
    const child = spawn(runnable.command, runnable.args, {
      cwd: root,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout?.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { output += chunk.toString(); });
    child.on("error", (error) => {
      resolve({
        exitCode: 1,
        elapsedMs: Date.now() - startedAt,
        outputTail: tailText(maskSensitive(output), 80),
        error: error.message,
      });
    });
    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        elapsedMs: Date.now() - startedAt,
        outputTail: tailText(maskSensitive(output), 80),
      });
    });
  });
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

function readOptionalJson(root, relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) return { present: false, parseable: false };
  try {
    return { present: true, parseable: true, value: JSON.parse(fs.readFileSync(absolute, "utf8")) };
  } catch (error) {
    return { present: true, parseable: false, error: error.message };
  }
}

function writeJsonReport(absolutePath, report) {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`);
}

function removeReports(root, relativePaths) {
  for (const relativePath of relativePaths) {
    const absolute = path.join(root, relativePath);
    if (fs.existsSync(absolute)) fs.rmSync(absolute);
  }
}

function sanitizeCommandLine(command) {
  return maskSensitive([command.command, ...command.args].join(" "));
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

function identityMaxConnsPerHost(options) {
  return optionOrFallback(options.identityMaxConnsPerHost, options.maxConnsPerHost);
}

function identityWarmConnectionsPerHost(options) {
  return optionOrFallback(options.identityWarmConnectionsPerHost, options.warmConnectionsPerHost);
}

function identitySessionTablePersistence(options) {
  return normalizeSessionTablePersistence(options.identitySessionDbSessionTablePersistence);
}

function optionOrFallback(value, fallback) {
  return String(value ?? "").trim() === "" ? fallback : value;
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

function sumFinite(values) {
  return values.filter(Number.isFinite).reduce((total, value) => total + value, 0);
}

function round(value, digits) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function nullableDelta(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return round(left - right, 2);
}

function countCommandErrors(results) {
  return results.filter((result) => result.exitCode !== 0).length;
}

function kebabToCamel(value) {
  return value.replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runSystemMixedWorkloadBenchmark();
  console.log(formatSystemMixedWorkloadBenchmark(report));
  process.exit(report.status === "PASSED" ? 0 : 1);
}
