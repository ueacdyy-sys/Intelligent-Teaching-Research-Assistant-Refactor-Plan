import { benchmarkRuntimeDefaults } from "./conversation-benchmark-runtime.mjs";

export const systemTeachingBenchmarkDefaults = {
  teachingBenchmarkRuntime: "js",
  teachingBenchmarkDockerImage: benchmarkRuntimeDefaults.benchmarkDockerImage,
  teachingBenchmarkDockerHost: benchmarkRuntimeDefaults.benchmarkDockerHost,
  teachingBenchmarkWslDistro: benchmarkRuntimeDefaults.benchmarkWslDistro,
  teachingBenchmarkWslHost: benchmarkRuntimeDefaults.benchmarkWslHost,
  teachingBenchmarkWslWorkspace: benchmarkRuntimeDefaults.benchmarkWslWorkspace,
  teachingMaxConnsPerHost: "",
  teachingWarmConnectionsPerHost: "",
  teachingClientTrace: "false",
};

export function systemTeachingBenchmarkRuntime(options) {
  const runtime = String(options.teachingBenchmarkRuntime ?? "").toLowerCase();
  if (["js", "local", "docker", "wsl"].includes(runtime)) return runtime;
  throw new Error("teaching-benchmark-runtime must be js, local, docker, or wsl");
}

export function buildSystemTeachingBenchmarkRuntimeProfile(options) {
  const runtime = systemTeachingBenchmarkRuntime(options);
  return {
    runtime,
    executor: systemTeachingBenchmarkRuntimeExecutor(runtime),
    dockerImage: runtime === "docker" ? options.teachingBenchmarkDockerImage : null,
    dockerHostAlias: runtime === "docker" ? options.teachingBenchmarkDockerHost : null,
    wslDistro: runtime === "wsl" ? options.teachingBenchmarkWslDistro : null,
    wslHostAlias: runtime === "wsl" ? options.teachingBenchmarkWslHost : null,
    wslWorkspace: runtime === "wsl" ? optionOrFallback(options.teachingBenchmarkWslWorkspace, null) : null,
  };
}

export function systemTeachingBenchmarkRuntimeArgs(options) {
  return [
    "--benchmark-runtime",
    systemTeachingBenchmarkRuntime(options),
    "--benchmark-docker-image",
    options.teachingBenchmarkDockerImage,
    "--benchmark-docker-host",
    options.teachingBenchmarkDockerHost,
    "--benchmark-wsl-distro",
    options.teachingBenchmarkWslDistro,
    "--benchmark-wsl-host",
    options.teachingBenchmarkWslHost,
    "--benchmark-wsl-workspace",
    options.teachingBenchmarkWslWorkspace,
    "--max-conns-per-host",
    teachingMaxConnsPerHost(options),
    "--warm-connections-per-host",
    teachingWarmConnectionsPerHost(options),
    "--client-trace",
    options.teachingClientTrace,
  ];
}

export function buildSystemTeachingTransportProfile(options) {
  return {
    teachingMaxConnsPerHost: parseInteger(teachingMaxConnsPerHost(options)),
    teachingWarmConnectionsPerHost: parseInteger(teachingWarmConnectionsPerHost(options)),
    teachingClientTrace: parseBoolean(options.teachingClientTrace),
  };
}

export function assertSystemTeachingBenchmarkOptions(options) {
  systemTeachingBenchmarkRuntime(options);
  assertNonNegativeInteger(teachingMaxConnsPerHost(options), "teaching-max-conns-per-host");
  assertNonNegativeInteger(teachingWarmConnectionsPerHost(options), "teaching-warm-connections-per-host");
}

export function summarizeTeachingArchiveReport(report) {
  const phases = Object.values(report.phases ?? {});
  const p95Values = phases.map((phase) => numberOrNull(phase.latencyMs?.p95)).filter(Number.isFinite);
  const p99Values = phases.map((phase) => numberOrNull(phase.latencyMs?.p99)).filter(Number.isFinite);
  const phaseErrors = phases.reduce((total, phase) => total + numberOrZero(phase.errors), 0);
  const reportedErrors = numberOrNull(report.summary?.totalErrors);
  const errors = Number.isFinite(reportedErrors) ? reportedErrors : fallbackFailedErrors(report.status, phaseErrors);
  const handlerP99Ms = maxFinite(phases.map((phase) => numberOrNull(phase.serverTimingBreakdownMs?.handler?.p99)));
  const preUsecaseP99Ms = maxFinite(phases.map((phase) => numberOrNull(phase.serverTimingBreakdownMs?.["pre.usecase"]?.p99)));
  const appP99Ms = maxFinite(phases.map((phase) => numberOrNull(phase.serverTimingMs?.p99)));
  return {
    errors,
    p95Ms: p95Values.length ? Math.max(...p95Values) : null,
    p99Ms: p99Values.length ? Math.max(...p99Values) : null,
    rps: minFinite(phases.map((phase) => numberOrNull(phase.rps))),
    concurrency: numberOrNull(report.concurrency),
    serverTimingP99Ms: appP99Ms,
    handlerP99Ms,
    preUsecaseP99Ms,
    appP99Ms,
    dbInsertP99Ms: maxFinite(phases.map((phase) => numberOrNull(phase.serverTimingBreakdownMs?.["db.insert"]?.p99))),
    clientHandlerGapP99Ms: maxFinite(phases.map((phase) =>
      nullableDelta(numberOrNull(phase.latencyMs?.p99), numberOrNull(phase.serverTimingBreakdownMs?.handler?.p99))
    )),
    benchmarkRuntimeProfile: report.benchmarkRuntimeProfile ?? null,
  };
}

function systemTeachingBenchmarkRuntimeExecutor(runtime) {
  if (runtime === "docker") return "DOCKER_GO";
  if (runtime === "wsl") return "WSL_GO";
  if (runtime === "local") return "LOCAL_GO";
  return "LOCAL_NODE_FETCH";
}

function teachingMaxConnsPerHost(options) {
  return optionOrFallback(options.teachingMaxConnsPerHost, options.maxConnsPerHost);
}

function teachingWarmConnectionsPerHost(options) {
  return optionOrFallback(options.teachingWarmConnectionsPerHost, options.warmConnectionsPerHost);
}

function optionOrFallback(value, fallback) {
  return String(value ?? "").trim() === "" ? fallback : value;
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

function nullableDelta(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return round(left - right, 2);
}

function fallbackFailedErrors(status, errors) {
  if (errors > 0) return errors;
  return status === "FAILED" ? 1 : 0;
}
