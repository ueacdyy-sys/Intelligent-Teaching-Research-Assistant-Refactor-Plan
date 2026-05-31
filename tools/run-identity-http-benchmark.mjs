import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

export const defaults = {
  dsn: "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable",
  baseUrl: "http://127.0.0.1:18100",
  port: "18100",
  out: "reports/identity-http-benchmark.current.json",
  concurrency: "64",
  operations: "300",
  sessionDbMaxConns: "16",
  gatewayCount: "1",
  maxConnsPerHost: "0",
  warmConnectionsPerHost: "0",
  benchmarkRuntime: "local",
  benchmarkDockerImage: "golang:1.26-alpine",
  benchmarkDockerHost: "host.docker.internal",
  ingressProxy: "false",
  ingressPort: "18080",
  ingressCount: "1",
  ingressMaxConnsPerHost: "0",
  ingressWarmConnectionsPerHost: "0",
  timeout: "120s",
  startupTimeoutMs: "120000",
};

const phaseNames = ["passwordLogin", "principalLookup", "refreshRotation", "revokeCycle"];
const localSecretValues = ["ueacd"];

export function parseArgs(argv) {
  const parsed = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--") || value === undefined) continue;
    if (key === "--dsn") parsed.dsn = value;
    if (key === "--base-url") parsed.baseUrl = value;
    if (key === "--port") parsed.port = value;
    if (key === "--out") parsed.out = value;
    if (key === "--concurrency") parsed.concurrency = value;
    if (key === "--operations") parsed.operations = value;
    if (key === "--session-db-max-conns") parsed.sessionDbMaxConns = value;
    if (key === "--gateway-count") parsed.gatewayCount = value;
    if (key === "--max-conns-per-host") parsed.maxConnsPerHost = value;
    if (key === "--warm-connections-per-host") parsed.warmConnectionsPerHost = value;
    if (key === "--benchmark-runtime") parsed.benchmarkRuntime = value;
    if (key === "--benchmark-docker-image") parsed.benchmarkDockerImage = value;
    if (key === "--benchmark-docker-host") parsed.benchmarkDockerHost = value;
    if (key === "--ingress-proxy") parsed.ingressProxy = value;
    if (key === "--ingress-port") parsed.ingressPort = value;
    if (key === "--ingress-count") parsed.ingressCount = value;
    if (key === "--ingress-max-conns-per-host") parsed.ingressMaxConnsPerHost = value;
    if (key === "--ingress-warm-connections-per-host") parsed.ingressWarmConnectionsPerHost = value;
    if (key === "--timeout") parsed.timeout = value;
    if (key === "--startup-timeout-ms") parsed.startupTimeoutMs = value;
    index += 1;
  }
  return parsed;
}

export function buildFailureReport({
  options,
  exitCode,
  errorMessage,
  gatewayOutput = "",
  benchmarkOutput = "",
  gatewayExitCode,
  gatewaySignal,
  ingressExitCode,
  ingressSignal,
  generatedAt = new Date().toISOString(),
}) {
  const sanitizedError = maskSensitive(errorMessage);
  const sanitizedGatewayOutput = maskSensitive(gatewayOutput);
  const sanitizedBenchmarkOutput = maskSensitive(benchmarkOutput);
  const phase = inferFailurePhase(`${sanitizedError}\n${sanitizedBenchmarkOutput}`);
  const report = {
    generatedAt,
    benchmarkKind: "identity_http_gateway",
    workloadType: "HTTP_BENCHMARK",
    status: "FAILED",
    baseUrl: maskURL(options.baseUrl),
    concurrency: parseIntegerOption(options.concurrency),
    operationsPerPhase: parseIntegerOption(options.operations),
    sessionDbMaxConns: parseIntegerOption(options.sessionDbMaxConns),
    gatewayCount: gatewayCount(options),
    gatewayDatabaseProfile: gatewayDatabaseProfile(options),
    gatewayBaseUrls: gatewayBaseUrls(options).map(maskURL),
    loadBalancingStrategy: gatewayCount(options) > 1 ? "ROUND_ROBIN" : "SINGLE_GATEWAY",
    transportProfile: transportProfile(options),
    benchmarkRuntimeProfile: benchmarkRuntimeProfile(options, benchmarkBaseUrls(options)),
    ingressProfile: ingressProfile(options),
    dockerRequiredForEvidence: true,
    exitCode,
    errorMessage: sanitizedError || `identity HTTP benchmark exited with code ${exitCode}`,
    gatewayOutputTail: tailText(sanitizedGatewayOutput, 80),
    benchmarkOutputTail: tailText(sanitizedBenchmarkOutput, 80),
  };
  if (gatewayExitCode !== undefined) report.gatewayExitCode = gatewayExitCode;
  if (gatewaySignal !== undefined) report.gatewaySignal = gatewaySignal;
  if (ingressExitCode !== undefined) report.ingressExitCode = ingressExitCode;
  if (ingressSignal !== undefined) report.ingressSignal = ingressSignal;
  if (phase) report.phase = phase;
  return report;
}

export function inferFailurePhase(message) {
  const text = String(message ?? "");
  return phaseNames.find((phase) => text.includes(phase));
}

export function tailText(value, maxLines = 80) {
  const text = String(value ?? "").replace(/\s+$/u, "");
  if (!text) return "";
  return text.split(/\r\n|\r|\n/u).slice(-maxLines).join("\n");
}

export function gatewayBaseUrls(options) {
  const count = gatewayCount(options);
  const urls = [];
  for (let index = 0; index < count; index += 1) {
    urls.push(gatewayBaseUrlAt(options, index));
  }
  return urls;
}

export function writeJsonReport(outPath, report) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
}

export async function runIdentityHttpBenchmark(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(argv);
  const baseUrls = gatewayBaseUrls(options);
  const spawnProcess = dependencies.spawn ?? spawn;
  const spawnCommandSync = dependencies.spawnSync ?? spawnSync;
  const sleepFn = dependencies.sleep ?? sleep;
  const fetchFn = dependencies.fetch ?? fetch;
  const gateways = baseUrls.map((baseUrl) => spawnGateway(baseUrl, options, spawnProcess));
  const ingressBaseURLs = ingressBaseUrls(options);
  const gatewayOutputs = gateways.map(() => "");
  let ingresses = [];
  let ingressOutputs = [];
  for (const [index, gateway] of gateways.entries()) {
    gateway.stdout?.on("data", (chunk) => {
      gatewayOutputs[index] += chunk.toString();
    });
    gateway.stderr?.on("data", (chunk) => {
      gatewayOutputs[index] += chunk.toString();
    });
  }

  let exitCode = 1;
  try {
    for (const [index, gateway] of gateways.entries()) {
      await waitForGateway(
        baseUrls[index],
        Number.parseInt(options.startupTimeoutMs, 10),
        gateway,
        { fetch: fetchFn, sleep: sleepFn },
      );
    }
    if (ingressEnabled(options)) {
      for (const [index, ingressBaseURL] of ingressBaseURLs.entries()) {
        const ingress = spawnIngressProxy(baseUrls, options, index, spawnProcess);
        ingresses.push(ingress);
        ingressOutputs.push("");
        ingress.stdout?.on("data", (chunk) => {
          ingressOutputs[index] += chunk.toString();
        });
        ingress.stderr?.on("data", (chunk) => {
          ingressOutputs[index] += chunk.toString();
        });
        await waitForGateway(
          ingressBaseURL,
          Number.parseInt(options.startupTimeoutMs, 10),
          ingress,
          { fetch: fetchFn, sleep: sleepFn },
        );
      }
    }
    const benchmarkCommand = buildBenchmarkCommand(
      options,
      ingressEnabled(options) ? ingressBaseURLs : baseUrls,
    );
    const result = spawnCommandSync(
      benchmarkCommand.command,
      benchmarkCommand.args,
      {
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    replayCapturedOutput(result);
    exitCode = result.error ? 1 : result.status ?? 1;
    if (exitCode !== 0) {
      const benchmarkOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      const message = result.error?.message ?? extractFailureMessage(benchmarkOutput, exitCode);
      writeFailureReport(options, {
        exitCode,
        errorMessage: message,
        gatewayOutput: combineGatewayOutput(gatewayOutputs, ingressOutputs),
        benchmarkOutput,
        gatewayExitCode: gatewayExitCodes(gateways),
        gatewaySignal: gatewaySignals(gateways),
        ingressExitCode: processExitCodes(ingresses),
        ingressSignal: processSignals(ingresses),
      });
    } else {
      enhanceSuccessReport(options);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(maskSensitive(message));
    const gatewayOutput = combineGatewayOutput(gatewayOutputs, ingressOutputs);
    if (gatewayOutput.trim()) {
      console.error(maskSensitive(gatewayOutput.trim()));
    }
    writeFailureReport(options, {
      exitCode: 1,
      errorMessage: message,
      gatewayOutput,
      gatewayExitCode: gatewayExitCodes(gateways),
      gatewaySignal: gatewaySignals(gateways),
      ingressExitCode: processExitCodes(ingresses),
      ingressSignal: processSignals(ingresses),
    });
    exitCode = 1;
  } finally {
    for (const ingress of ingresses) {
      stopGateway(ingress, spawnCommandSync);
    }
    for (const gateway of gateways) {
      stopGateway(gateway, spawnCommandSync);
    }
    await sleepFn(500);
  }

  return exitCode;
}

export async function waitForGateway(baseUrl, startupTimeoutMs, processHandle, dependencies = {}) {
  const fetchFn = dependencies.fetch ?? fetch;
  const sleepFn = dependencies.sleep ?? sleep;
  const deadline = Date.now() + startupTimeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error(`identity gateway exited early with code ${processHandle.exitCode}`);
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
  throw new Error(`identity gateway did not become healthy: ${lastError}`);
}

function writeFailureReport(options, details) {
  const report = buildFailureReport({ options, ...details });
  writeJsonReport(options.out, report);
}

function spawnGateway(baseUrl, options, spawnProcess) {
  return spawnProcess(
    "go",
    ["run", "./services/identity-access-gateway/cmd/gateway"],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PORT: gatewayPort(baseUrl, options.port),
        SESSION_DATABASE_URL: options.dsn,
        SESSION_DB_MAX_CONNS: options.sessionDbMaxConns,
        BOOTSTRAP_PASSWORD: "ueacd",
        CHANNEL_SIGNATURE_SECRET: "ueacd",
      },
    },
  );
}

function spawnIngressProxy(baseUrls, options, index, spawnProcess) {
  return spawnProcess(
    "go",
    [
      "run",
      "./services/identity-access-gateway/cmd/ingressproxy",
      "-listen",
      `:${ingressPortAt(options, index)}`,
      "-upstreams",
      baseUrls.join(","),
      "-max-conns-per-host",
      options.ingressMaxConnsPerHost,
      "-warm-connections-per-host",
      options.ingressWarmConnectionsPerHost,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
      },
    },
  );
}

function replayCapturedOutput(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) console.error(maskSensitive(result.error.message));
}

export function extractFailureMessage(output, exitCode) {
  const lines = tailText(output, 20).split(/\r\n|\r|\n/u).filter(Boolean);
  const phaseFailure = lines.find((line) => /failed with \d+ errors/u.test(line));
  if (phaseFailure) return phaseFailure;
  return lines.at(-1) || `identity HTTP benchmark exited with code ${exitCode}`;
}

function stopGateway(processHandle, spawnCommandSync = spawnSync) {
  if (processHandle.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnCommandSync("taskkill", ["/PID", String(processHandle.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  processHandle.kill("SIGTERM");
}

function maskURL(value) {
  try {
    const parsed = new URL(value);
    if (!parsed.password) return value;
    parsed.password = "***";
    return parsed.toString();
  } catch {
    return value;
  }
}

function gatewayCount(options) {
  return Math.max(1, parseIntegerOption(options.gatewayCount));
}

function transportProfile(options) {
  const warmConnectionsPerHost = parseIntegerOption(options.warmConnectionsPerHost);
  const targetHostCount = ingressEnabled(options) ? ingressCount(options) : gatewayCount(options);
  return {
    maxConnsPerHost: parseIntegerOption(options.maxConnsPerHost),
    warmConnectionsPerHost,
    warmConnectionsTotal: targetHostCount * warmConnectionsPerHost,
  };
}

function gatewayBaseUrlAt(options, index) {
  try {
    const parsed = new URL(options.baseUrl);
    const basePort = Number.parseInt(parsed.port || options.port, 10);
    if (!Number.isNaN(basePort)) {
      parsed.port = String(basePort + index);
    }
    return trimURL(parsed.toString());
  } catch {
    return options.baseUrl;
  }
}

function gatewayPort(baseUrl, fallback) {
  try {
    const parsed = new URL(baseUrl);
    return parsed.port || fallback;
  } catch {
    return fallback;
  }
}

function gatewayExitCodes(gateways) {
  return processExitCodes(gateways);
}

function gatewaySignals(gateways) {
  return processSignals(gateways);
}

function processExitCodes(processes) {
  if (processes.length === 0) return undefined;
  const values = processes.map((processHandle) => processHandle.exitCode);
  return values.length === 1 ? values[0] : values;
}

function processSignals(processes) {
  if (processes.length === 0) return undefined;
  const values = processes.map((processHandle) => processHandle.signalCode);
  return values.length === 1 ? values[0] : values;
}

function combineGatewayOutput(outputs, ingressOutputs = []) {
  const ingressValues = Array.isArray(ingressOutputs) ? ingressOutputs : [ingressOutputs];
  const ingress = ingressValues
    .map((output, index) => output.trim() ? `[ingress ${index + 1}]\n${output.trim()}` : "")
    .filter(Boolean);
  return outputs
    .map((output, index) => output.trim() ? `[gateway ${index + 1}]\n${output.trim()}` : "")
    .concat(ingress)
    .filter(Boolean)
    .join("\n");
}

function trimURL(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function maskSensitive(value) {
  let text = String(value ?? "");
  text = text.replace(/postgres:\/\/[^\s"']+/giu, "[masked-postgres-dsn]");
  for (const secret of localSecretValues) {
    text = text.replaceAll(secret, "***");
  }
  return text;
}

function enhanceSuccessReport(options) {
  if (!options.out || !fs.existsSync(options.out)) return;
  const report = JSON.parse(fs.readFileSync(options.out, "utf8"));
  writeJsonReport(options.out, addRuntimeProfileToReport(report, options));
}

export function addIngressProfileToReport(report, options) {
  return addRuntimeProfileToReport(report, options);
}

export function addRuntimeProfileToReport(report, options) {
  const enhanced = {
    ...report,
    gatewayWorkerCount: gatewayCount(options),
    gatewayDatabaseProfile: gatewayDatabaseProfile(options),
    benchmarkRuntimeProfile: benchmarkRuntimeProfile(options, benchmarkBaseUrls(options)),
  };
  if (!ingressEnabled(options)) return enhanced;
  return {
    ...enhanced,
    ingressProfile: ingressProfile(options),
  };
}

export function gatewayDatabaseProfile(options) {
  const workerCount = gatewayCount(options);
  const sessionDbMaxConnsPerWorker = parseIntegerOption(options.sessionDbMaxConns);
  return {
    workerCount,
    sessionDbMaxConnsPerWorker,
    sessionDbMaxConnsTotal: workerCount * sessionDbMaxConnsPerWorker,
  };
}

export function buildBenchmarkCommand(options, baseUrls) {
  const args = [
    "run",
    "./services/identity-access-gateway/cmd/httpbench",
    "-timeout",
    options.timeout,
    "-base-url",
    benchmarkTargetBaseUrls(options, baseUrls).join(","),
    "-out",
    options.out,
    "-concurrency",
    options.concurrency,
    "-operations",
    options.operations,
    "-max-conns-per-host",
    options.maxConnsPerHost,
    "-warm-connections-per-host",
    options.warmConnectionsPerHost,
  ];
  if (!dockerBenchmarkRuntime(options)) {
    return { command: "go", args };
  }
  return {
    command: "docker",
    args: [
      "run",
      "--rm",
      "-v",
      `${process.cwd()}:/workspace`,
      "-w",
      "/workspace",
      options.benchmarkDockerImage,
      "go",
      ...args,
    ],
  };
}

export function benchmarkRuntimeProfile(options, baseUrls) {
  const dockerRuntime = dockerBenchmarkRuntime(options);
  return {
    executor: dockerRuntime ? "DOCKER_GO" : "LOCAL_GO",
    dockerImage: dockerRuntime ? options.benchmarkDockerImage : null,
    dockerHostAlias: dockerRuntime ? options.benchmarkDockerHost : null,
    targetBaseUrls: benchmarkTargetBaseUrls(options, baseUrls),
  };
}

function ingressProfile(options) {
  return {
    enabled: ingressEnabled(options),
    workerCount: ingressCount(options),
    baseUrl: maskURL(ingressBaseUrl(options)),
    baseUrls: ingressBaseUrls(options).map(maskURL),
    upstreamBaseUrls: gatewayBaseUrls(options).map(maskURL),
    upstreamTransportProfile: ingressTransportProfile(options),
  };
}

function ingressTransportProfile(options) {
  const warmConnectionsPerHost = parseIntegerOption(options.ingressWarmConnectionsPerHost);
  return {
    maxConnsPerHost: parseIntegerOption(options.ingressMaxConnsPerHost),
    warmConnectionsPerHost,
    warmConnectionsTotal: ingressCount(options) * gatewayCount(options) * warmConnectionsPerHost,
  };
}

function benchmarkBaseUrls(options) {
  return ingressEnabled(options) ? ingressBaseUrls(options) : gatewayBaseUrls(options);
}

function benchmarkTargetBaseUrls(options, baseUrls) {
  if (!dockerBenchmarkRuntime(options)) return baseUrls.map(trimURL);
  return baseUrls.map((baseUrl) => dockerReachableBaseUrl(baseUrl, options.benchmarkDockerHost));
}

function dockerReachableBaseUrl(value, hostAlias) {
  try {
    const parsed = new URL(value);
    if (["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
      parsed.hostname = hostAlias;
    }
    return trimURL(parsed.toString());
  } catch {
    return value;
  }
}

function dockerBenchmarkRuntime(options) {
  return String(options.benchmarkRuntime ?? "").toLowerCase() === "docker";
}

function ingressEnabled(options) {
  return ["1", "true", "yes", "on"].includes(String(options.ingressProxy).toLowerCase());
}

function ingressCount(options) {
  return Math.max(1, parseIntegerOption(options.ingressCount));
}

function ingressBaseUrls(options) {
  const urls = [];
  for (let index = 0; index < ingressCount(options); index += 1) {
    urls.push(ingressBaseUrlAt(options, index));
  }
  return urls;
}

function ingressBaseUrl(options) {
  return ingressBaseUrlAt(options, 0);
}

function ingressBaseUrlAt(options, index) {
  try {
    const parsed = new URL(options.baseUrl);
    parsed.port = String(ingressPortAt(options, index));
    return trimURL(parsed.toString());
  } catch {
    return `http://127.0.0.1:${ingressPortAt(options, index)}`;
  }
}

function ingressPortAt(options, index) {
  const basePort = parseIntegerOption(options.ingressPort);
  return basePort + index;
}

function parseIntegerOption(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runIdentityHttpBenchmark();
  process.exit(exitCode);
}
