import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const defaults = {
  out: "reports/identity-phase-matrix.current.json",
  casePrefix: "reports/identity-phase-matrix",
  profile: "IDENTITY_PHASE_MATRIX_SMOKE",
  manageDocker: "true",
  dockerCleanup: "down",
  stopOnFailure: "false",
  baseUrl: "http://127.0.0.1:18100",
  ingressPort: "19080",
  concurrency: "64",
  operations: "128",
  sessionDbMinConns: "0",
  sessionDbWriteConcurrency: "0",
  sessionDbSessionTablePersistence: "unlogged",
  benchmarkRuntime: "docker",
  pgbouncerDiagnostics: "true",
  timeout: "180s",
  startupTimeoutMs: "120000",
  cases: "g2-p8-i2-c32:2:8:2:32:16:32:16,g4-p8-i2-c32:4:8:2:32:16:32:16",
};

const phaseNames = ["passwordLogin", "principalLookup", "refreshRotation", "revokeCycle"];
const localSecretValues = ["ueacd"];

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

export function buildMatrixCases(options) {
  const defaultSessionDbMinConns = parseInteger(options.sessionDbMinConns);
  return parseCaseSpecs(options.cases).map((matrixCase, index) => {
    const reportPath = `${options.casePrefix}.${index + 1}-${safeName(matrixCase.name)}.json`;
    const resolvedCase = {
      ...matrixCase,
      sessionDbMinConns: matrixCase.sessionDbMinConns ?? defaultSessionDbMinConns,
      reportPath,
    };
    return {
      ...resolvedCase,
      args: buildCaseArgs(options, resolvedCase, reportPath),
    };
  });
}

export async function runIdentityPhaseMatrix(options = parseArgs(process.argv.slice(2)), dependencies = {}) {
  const root = dependencies.root ?? process.cwd();
  const runSyncFn = dependencies.runSync ?? runSync;
  const runCaseFn = dependencies.runCase ?? runCase;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const setup = [];
  const cleanup = [];
  const runnerErrors = [];
  const cases = buildMatrixCases(options);
  const caseReports = [];

  try {
    validateOptions(options, cases);
    removeReport(root, options.out);
    if (parseBoolean(options.manageDocker)) {
      setup.push({ phase: "setup-reset", ...runSyncFn("npm", ["run", "perf:identity-session:reset"], root) });
      if (setup.at(-1).exitCode !== 0) throw new Error("managed Docker reset failed before matrix execution");
      setup.push({ phase: "setup-up", ...runSyncFn("npm", ["run", "perf:identity-session:up"], root) });
      if (setup.at(-1).exitCode !== 0) throw new Error("managed Docker setup failed before matrix execution");
    }

    for (const matrixCase of cases) {
      const report = await runCaseFn(matrixCase, options, root);
      caseReports.push({ case: matrixCase, report });
      if (parseBoolean(options.stopOnFailure) && report.status !== "PASSED") break;
    }
  } catch (error) {
    runnerErrors.push(maskSensitive(error instanceof Error ? error.message : String(error)));
  } finally {
    if (parseBoolean(options.manageDocker)) {
      cleanup.push({ phase: "cleanup", ...runSyncFn("npm", ["run", `perf:identity-session:${options.dockerCleanup}`], root) });
    }
  }

  const endedAt = now();
  const report = buildIdentityPhaseMatrixReport({
    options,
    cases,
    caseReports,
    setup,
    cleanup,
    runnerErrors,
    startedAt,
    endedAt,
  });
  writeJsonReport(path.join(root, options.out), report);
  return report;
}

export function buildIdentityPhaseMatrixReport({
  options,
  cases,
  caseReports,
  setup = [],
  cleanup = [],
  runnerErrors = [],
  startedAt,
  endedAt,
}) {
  const caseSummaries = cases.map((matrixCase) => {
    const report = caseReports.find((entry) => entry.case.name === matrixCase.name)?.report;
    return summarizeCase(matrixCase, report);
  });
  const orchestrationErrors = countCommandErrors(setup) + countCommandErrors(cleanup) + runnerErrors.length;
  const executedCases = caseSummaries.filter((entry) => entry.executed);
  const status = orchestrationErrors === 0 &&
    executedCases.length === cases.length &&
    executedCases.every((entry) => entry.status === "PASSED")
    ? "PASSED"
    : "FAILED";

  return {
    generatedAt: endedAt,
    startedAt,
    endedAt,
    benchmarkKind: "identity_phase_matrix",
    workloadType: "IDENTITY_PHASE_MATRIX",
    profile: options.profile,
    status,
    stopOnFailure: parseBoolean(options.stopOnFailure),
    targetProfile: {
      concurrency: parseInteger(options.concurrency),
      operationsPerPhase: parseInteger(options.operations),
      sessionDbMinConnsPerWorker: parseInteger(options.sessionDbMinConns),
      caseScopedSessionDbMinConns: hasCaseScopedSessionDbMinConns(cases),
      sessionDbMinConnsPerWorkerValues: uniqueSortedNumbers(cases.map((matrixCase) => matrixCase.sessionDbMinConns)),
      sessionTablePersistence: options.sessionDbSessionTablePersistence,
      benchmarkRuntime: options.benchmarkRuntime,
    },
    runtimeProfile: {
      executor: "LOCAL_NODE_IDENTITY_PHASE_MATRIX",
      managedDocker: parseBoolean(options.manageDocker),
      dockerCleanup: options.dockerCleanup,
    },
    cases: caseSummaries,
    summary: summarizeMatrix(caseSummaries, orchestrationErrors),
    setup: setup.map((entry) => sanitizeCommandResult(entry)),
    cleanup: cleanup.map((entry) => sanitizeCommandResult(entry)),
    runnerErrors,
    nextAction: status === "PASSED"
      ? "Use the recommended passing case as the next Identity tuning baseline, then rerun a larger phase-aware matrix before any capacity promotion."
      : "Inspect the first failed or highest-tail case before increasing Identity concurrency.",
  };
}

export function formatIdentityPhaseMatrix(report) {
  const lines = [
    `Identity phase matrix: ${report.status}`,
    `Profile: ${report.profile}`,
    `Executed cases: ${report.summary.executedCases}/${report.summary.configuredCases}`,
    `Recommended case: ${report.summary.recommendedCaseName ?? "none"}`,
    "",
    "Case results:",
  ];
  for (const entry of report.cases) {
    lines.push(`- ${entry.name} ${entry.status} maxP99=${entry.maxPhaseP99Ms ?? "n/a"}ms errors=${entry.totalErrors} acquireWait=${entry.totalPoolAcquireDurationMs ?? "n/a"}ms`);
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function buildCaseArgs(options, matrixCase, reportPath) {
  return [
    "--base-url", options.baseUrl,
    "--ingress-proxy", "true",
    "--ingress-port", options.ingressPort,
    "--concurrency", options.concurrency,
    "--operations", options.operations,
    "--session-db-max-conns", String(matrixCase.sessionDbMaxConns),
    "--session-db-min-conns", String(matrixCase.sessionDbMinConns),
    "--session-db-write-concurrency", options.sessionDbWriteConcurrency,
    "--session-db-session-table-persistence", options.sessionDbSessionTablePersistence,
    "--gateway-count", String(matrixCase.gatewayCount),
    "--ingress-count", String(matrixCase.ingressCount),
    "--max-conns-per-host", String(matrixCase.clientMaxConnsPerHost),
    "--warm-connections-per-host", String(matrixCase.clientWarmConnectionsPerHost),
    "--ingress-max-conns-per-host", String(matrixCase.ingressMaxConnsPerHost),
    "--ingress-warm-connections-per-host", String(matrixCase.ingressWarmConnectionsPerHost),
    "--benchmark-runtime", options.benchmarkRuntime,
    "--pgbouncer-diagnostics", options.pgbouncerDiagnostics,
    "--timeout", options.timeout,
    "--startup-timeout-ms", options.startupTimeoutMs,
    "--out", reportPath,
  ];
}

function summarizeCase(matrixCase, report) {
  const base = {
    name: matrixCase.name,
    executed: Boolean(report),
    status: report?.status ?? "NOT_RUN",
    reportPath: matrixCase.reportPath,
    config: {
      gatewayCount: matrixCase.gatewayCount,
      sessionDbMaxConnsPerWorker: matrixCase.sessionDbMaxConns,
      sessionDbMaxConnsTotal: matrixCase.gatewayCount * matrixCase.sessionDbMaxConns,
      sessionDbMinConnsPerWorker: matrixCase.sessionDbMinConns,
      sessionDbMinConnsTotal: matrixCase.gatewayCount * matrixCase.sessionDbMinConns,
      ingressCount: matrixCase.ingressCount,
      clientMaxConnsPerHost: matrixCase.clientMaxConnsPerHost,
      clientWarmConnectionsPerHost: matrixCase.clientWarmConnectionsPerHost,
      ingressMaxConnsPerHost: matrixCase.ingressMaxConnsPerHost,
      ingressWarmConnectionsPerHost: matrixCase.ingressWarmConnectionsPerHost,
    },
  };
  if (!report) return { ...base, totalErrors: 0, maxPhaseP99Ms: null, totalPoolAcquireDurationMs: null, phases: [] };
  const phases = phaseNames.map((phaseName) => summarizePhase(phaseName, report));
  const dominantPoolWait = dominantPoolWaitOperation(phases);
  return {
    ...base,
    totalErrors: phases.reduce((sum, phase) => sum + phase.errors, 0),
    maxPhaseP99Ms: maxNumber(phases.map((phase) => phase.p99Ms)),
    slowestPhase: slowestPhase(phases),
    dominantPoolWaitPhase: dominantPoolWait?.phase ?? null,
    dominantPoolWaitOperation: dominantPoolWait?.operation ?? null,
    dominantPoolAcquireShare: dominantPoolWait?.poolAcquireShare ?? null,
    totalPoolAcquireDurationMs: roundFloat(phases.reduce((sum, phase) => sum + numberOrZero(phase.poolAcquireDurationMs), 0)),
    totalEmptyAcquireWaitTimeMs: roundFloat(phases.reduce((sum, phase) => sum + numberOrZero(phase.emptyAcquireWaitTimeMs), 0)),
    phases,
  };
}

function summarizePhase(phaseName, report) {
  const phase = report.phases?.[phaseName] ?? {};
  const delta = report.gatewayDatabasePhaseDiagnostics?.[phaseName]?.delta ?? {};
  const sessionOperations = summarizeSessionOperations(delta.sessionOperations);
  const slowestOperation = slowestSessionOperation(sessionOperations);
  const highestPoolAcquireShare = highestPoolAcquireShareOperation(sessionOperations);
  return omitNullish({
    name: phaseName,
    status: numberOrZero(phase.errors) === 0 ? "PASSED" : "FAILED",
    errors: numberOrZero(phase.errors),
    rps: numberOrNull(phase.rps),
    p95Ms: numberOrNull(phase.latencyMs?.p95),
    p99Ms: numberOrNull(phase.latencyMs?.p99),
    poolAcquireCount: numberOrZero(delta.pool?.acquireCount),
    poolAcquireDurationMs: numberOrNull(delta.pool?.acquireDurationMs),
    emptyAcquireWaitTimeMs: numberOrNull(delta.pool?.emptyAcquireWaitTimeMs),
    sessionOperations,
    slowestSessionOperation: slowestOperation?.name ?? null,
    slowestSessionOperationAverageElapsedMs: slowestOperation?.averageElapsedMs ?? null,
    highestPoolAcquireShareOperation: highestPoolAcquireShare?.name ?? null,
    highestPoolAcquireShare: highestPoolAcquireShare?.poolAcquireShare ?? null,
  });
}

function summarizeMatrix(cases, orchestrationErrors) {
  const executedCases = cases.filter((entry) => entry.executed);
  const failedCases = executedCases.filter((entry) => entry.status !== "PASSED");
  const recommended = recommendCase(cases);
  return {
    configuredCases: cases.length,
    executedCases: executedCases.length,
    passedCases: executedCases.length - failedCases.length,
    failedCases: failedCases.length,
    orchestrationErrors,
    totalErrors: cases.reduce((sum, entry) => sum + numberOrZero(entry.totalErrors), 0) + orchestrationErrors,
    maxPhaseP99Ms: maxNumber(cases.map((entry) => entry.maxPhaseP99Ms)),
    recommendedCaseName: recommended?.name ?? null,
    recommendedCaseReportPath: recommended?.reportPath ?? null,
    firstFailedCaseName: failedCases[0]?.name ?? null,
  };
}

function recommendCase(cases) {
  return cases
    .filter((entry) => entry.executed && entry.status === "PASSED")
    .sort((left, right) =>
      numberOrInfinity(left.maxPhaseP99Ms) - numberOrInfinity(right.maxPhaseP99Ms) ||
      numberOrInfinity(left.totalPoolAcquireDurationMs) - numberOrInfinity(right.totalPoolAcquireDurationMs) ||
      left.name.localeCompare(right.name),
    )[0] ?? null;
}

function hasCaseScopedSessionDbMinConns(cases) {
  return uniqueSortedNumbers(cases.map((matrixCase) => matrixCase.sessionDbMinConns)).length > 1;
}

function uniqueSortedNumbers(values) {
  return [...new Set(values.filter((value) => typeof value === "number" && Number.isFinite(value)))]
    .sort((left, right) => left - right);
}

async function runCase(matrixCase, _options, root) {
  removeReport(root, matrixCase.reportPath);
  const result = runSync("node", ["tools/run-identity-http-benchmark.mjs", ...matrixCase.args], root);
  const reportPath = path.join(root, matrixCase.reportPath);
  if (fs.existsSync(reportPath)) return JSON.parse(fs.readFileSync(reportPath, "utf8"));
  return {
    status: "FAILED",
    errorMessage: result.outputTail || `identity case ${matrixCase.name} exited with ${result.exitCode}`,
    phases: {},
  };
}

function parseCaseSpecs(value) {
  const specs = String(value ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  if (specs.length === 0) throw new Error("at least one identity phase matrix case is required");
  return specs.map(parseCaseSpec);
}

function parseCaseSpec(value) {
  const parts = value.split(":");
  if (![8, 9].includes(parts.length)) {
    throw new Error(`invalid identity phase matrix case ${value}: expected 8 or 9 colon-separated fields`);
  }
  const [
    name,
    gatewayCount,
    sessionDbMaxConns,
    sessionDbMinConnsOrIngressCount,
    ingressCountOrClientMaxConnsPerHost,
    clientMaxConnsPerHostOrClientWarmConnectionsPerHost,
    clientWarmConnectionsPerHostOrIngressMaxConnsPerHost,
    ingressMaxConnsPerHostOrIngressWarmConnectionsPerHost,
    ingressWarmConnectionsPerHost,
  ] = parts;
  const hasCaseScopedMinConns = parts.length === 9;
  const ingressCount = hasCaseScopedMinConns ? ingressCountOrClientMaxConnsPerHost : sessionDbMinConnsOrIngressCount;
  const clientMaxConnsPerHost = hasCaseScopedMinConns ? clientMaxConnsPerHostOrClientWarmConnectionsPerHost : ingressCountOrClientMaxConnsPerHost;
  const clientWarmConnectionsPerHost = hasCaseScopedMinConns ? clientWarmConnectionsPerHostOrIngressMaxConnsPerHost : clientMaxConnsPerHostOrClientWarmConnectionsPerHost;
  const ingressMaxConnsPerHost = hasCaseScopedMinConns ? ingressMaxConnsPerHostOrIngressWarmConnectionsPerHost : clientWarmConnectionsPerHostOrIngressMaxConnsPerHost;
  const resolvedIngressWarmConnectionsPerHost = hasCaseScopedMinConns ? ingressWarmConnectionsPerHost : ingressMaxConnsPerHostOrIngressWarmConnectionsPerHost;
  if (!name) throw new Error(`invalid identity phase matrix case ${value}: name is required`);
  const parsedCase = {
    name,
    gatewayCount: positiveInteger(gatewayCount, value, "gatewayCount"),
    sessionDbMaxConns: positiveInteger(sessionDbMaxConns, value, "sessionDbMaxConns"),
    ingressCount: positiveInteger(ingressCount, value, "ingressCount"),
    clientMaxConnsPerHost: nonNegativeInteger(clientMaxConnsPerHost, value, "clientMaxConnsPerHost"),
    clientWarmConnectionsPerHost: nonNegativeInteger(clientWarmConnectionsPerHost, value, "clientWarmConnectionsPerHost"),
    ingressMaxConnsPerHost: nonNegativeInteger(ingressMaxConnsPerHost, value, "ingressMaxConnsPerHost"),
    ingressWarmConnectionsPerHost: nonNegativeInteger(resolvedIngressWarmConnectionsPerHost, value, "ingressWarmConnectionsPerHost"),
  };
  if (hasCaseScopedMinConns) {
    parsedCase.sessionDbMinConns = nonNegativeInteger(sessionDbMinConnsOrIngressCount, value, "sessionDbMinConns");
  }
  return parsedCase;
}

function validateOptions(options, cases) {
  positiveInteger(options.concurrency, "options", "concurrency");
  positiveInteger(options.operations, "options", "operations");
  nonNegativeInteger(options.sessionDbMinConns, "options", "sessionDbMinConns");
  for (const matrixCase of cases) {
    if (matrixCase.sessionDbMinConns > matrixCase.sessionDbMaxConns) {
      throw new Error(`sessionDbMinConns must be <= sessionDbMaxConns for case ${matrixCase.name}`);
    }
  }
  if (!["down", "reset"].includes(options.dockerCleanup)) {
    throw new Error("docker-cleanup must be down or reset");
  }
  if (cases.length === 0) throw new Error("at least one matrix case is required");
}

function runSync(command, args, cwd) {
  const started = Date.now();
  const runnable = toRunnableCommand(command, args);
  const result = spawnSync(runnable.command, runnable.args, { cwd, encoding: "utf8", shell: false });
  return {
    command,
    args,
    exitCode: result.status ?? 1,
    elapsedMs: Date.now() - started,
    outputTail: tailText(maskSensitive(`${result.stdout ?? ""}\n${result.stderr ?? ""}`), 60),
    error: result.error ? maskSensitive(result.error.message) : undefined,
  };
}

function sanitizeCommandResult(entry) {
  return {
    ...entry,
    args: Array.isArray(entry.args) ? entry.args.map((arg) => maskSensitive(arg)) : entry.args,
    outputTail: maskSensitive(entry.outputTail ?? ""),
    error: entry.error ? maskSensitive(entry.error) : undefined,
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

function summarizeSessionOperations(operations) {
  if (!operations || typeof operations !== "object") return [];
  return Object.entries(operations)
    .map(([name, stats]) => summarizeSessionOperation(name, stats))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function summarizeSessionOperation(name, stats) {
  const totalElapsedMs = numberOrNull(stats?.totalElapsedMs);
  const poolAcquireElapsedMs = numberOrNull(stats?.poolAcquireElapsedMs);
  const dbExecuteElapsedMs = numberOrNull(stats?.dbExecuteElapsedMs);
  return omitNullish({
    name,
    count: numberOrZero(stats?.count),
    totalElapsedMs,
    averageElapsedMs: numberOrNull(stats?.averageElapsedMs),
    poolAcquireCount: numberOrNull(stats?.poolAcquireCount),
    poolAcquireElapsedMs,
    averagePoolAcquireElapsedMs: numberOrNull(stats?.averagePoolAcquireElapsedMs),
    poolAcquireShare: elapsedShare(poolAcquireElapsedMs, totalElapsedMs),
    dbExecuteElapsedMs,
    averageDbExecuteElapsedMs: numberOrNull(stats?.averageDbExecuteElapsedMs),
    dbExecuteShare: elapsedShare(dbExecuteElapsedMs, totalElapsedMs),
  });
}

function slowestSessionOperation(sessionOperations) {
  return sessionOperations
    .filter((operation) => typeof operation.averageElapsedMs === "number" && Number.isFinite(operation.averageElapsedMs))
    .sort((left, right) =>
      numberOrInfinity(right.averageElapsedMs) - numberOrInfinity(left.averageElapsedMs) ||
      left.name.localeCompare(right.name),
    )[0] ?? null;
}

function highestPoolAcquireShareOperation(sessionOperations) {
  return sessionOperations
    .filter((operation) => typeof operation.poolAcquireShare === "number" && Number.isFinite(operation.poolAcquireShare))
    .sort((left, right) =>
      numberOrInfinity(right.poolAcquireShare) - numberOrInfinity(left.poolAcquireShare) ||
      numberOrNegativeInfinity(right.averageElapsedMs) - numberOrNegativeInfinity(left.averageElapsedMs) ||
      left.name.localeCompare(right.name),
    )[0] ?? null;
}

function dominantPoolWaitOperation(phases) {
  const candidates = phases
    .filter((phase) => typeof phase.highestPoolAcquireShare === "number" && Number.isFinite(phase.highestPoolAcquireShare))
    .map((phase) => ({
      phase: phase.name,
      operation: phase.highestPoolAcquireShareOperation,
      poolAcquireShare: phase.highestPoolAcquireShare,
      p99Ms: phase.p99Ms,
    }));
  return candidates.sort((left, right) =>
    numberOrInfinity(right.poolAcquireShare) - numberOrInfinity(left.poolAcquireShare) ||
    numberOrInfinity(right.p99Ms) - numberOrInfinity(left.p99Ms) ||
    left.phase.localeCompare(right.phase),
  )[0] ?? null;
}

function elapsedShare(partMs, totalMs) {
  if (!Number.isFinite(partMs) || !Number.isFinite(totalMs) || totalMs <= 0) return null;
  return roundFloat(partMs / totalMs);
}

function omitNullish(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== null && entryValue !== undefined));
}

function countCommandErrors(entries) {
  return entries.filter((entry) => entry.exitCode !== 0).length;
}

function removeReport(root, reportPath) {
  fs.rmSync(path.join(root, reportPath), { force: true });
}

function writeJsonReport(absolutePath, report) {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`);
}

function slowestPhase(phases) {
  return [...phases].sort((left, right) => numberOrInfinity(right.p99Ms) - numberOrInfinity(left.p99Ms))[0]?.name ?? null;
}

function maxNumber(values) {
  const numbers = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (numbers.length === 0) return null;
  return Math.max(...numbers);
}

function positiveInteger(value, source, field) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`invalid ${field} in ${source}: must be a positive integer`);
  return parsed;
}

function nonNegativeInteger(value, source, field) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`invalid ${field} in ${source}: must be zero or positive`);
  return parsed;
}

function parseInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function numberOrZero(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberOrInfinity(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function numberOrNegativeInfinity(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function roundFloat(value) {
  return Math.round(value * 100) / 100;
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function safeName(value) {
  return String(value).replace(/[^a-z0-9._-]+/giu, "-").replace(/^-+|-+$/gu, "") || "case";
}

function kebabToCamel(value) {
  return value.replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
}

function tailText(value, maxLines = 60) {
  const text = String(value ?? "").replace(/\s+$/u, "");
  if (!text) return "";
  return text.split(/\r\n|\r|\n/u).slice(-maxLines).join("\n");
}

function maskSensitive(value) {
  let text = String(value ?? "");
  text = text.replace(/postgres:\/\/[^\s"']+/giu, "[masked-postgres-dsn]");
  for (const secret of localSecretValues) {
    text = text.replaceAll(secret, "***");
  }
  return text;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runIdentityPhaseMatrix();
  console.log(formatIdentityPhaseMatrix(report));
  process.exit(report.status === "PASSED" ? 0 : 1);
}
