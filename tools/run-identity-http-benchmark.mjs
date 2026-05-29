import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const defaults = {
  dsn: "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable",
  baseUrl: "http://127.0.0.1:18100",
  port: "18100",
  out: "reports/identity-http-benchmark.current.json",
  concurrency: "64",
  operations: "300",
  sessionDbMaxConns: "16",
  timeout: "120s",
  startupTimeoutMs: "120000",
};

function parseArgs(argv) {
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
    if (key === "--timeout") parsed.timeout = value;
    if (key === "--startup-timeout-ms") parsed.startupTimeoutMs = value;
    index += 1;
  }
  return parsed;
}

const options = parseArgs(process.argv.slice(2));
const gateway = spawn(
  "go",
  ["run", "./services/identity-access-gateway/cmd/gateway"],
  {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: options.port,
      SESSION_DATABASE_URL: options.dsn,
      SESSION_DB_MAX_CONNS: options.sessionDbMaxConns,
      BOOTSTRAP_PASSWORD: "ueacd",
      CHANNEL_SIGNATURE_SECRET: "ueacd",
    },
  },
);

let gatewayOutput = "";
gateway.stdout.on("data", (chunk) => {
  gatewayOutput += chunk.toString();
});
gateway.stderr.on("data", (chunk) => {
  gatewayOutput += chunk.toString();
});

let exitCode = 1;
try {
  await waitForGateway(options.baseUrl, Number.parseInt(options.startupTimeoutMs, 10));
  const result = spawnSync(
    "go",
    [
      "run",
      "./services/identity-access-gateway/cmd/httpbench",
      "-base-url",
      options.baseUrl,
      "-out",
      options.out,
      "-concurrency",
      options.concurrency,
      "-operations",
      options.operations,
      "-timeout",
      options.timeout,
    ],
    { stdio: "inherit" },
  );
  if (result.error) {
    console.error(result.error.message);
    exitCode = 1;
  } else {
    exitCode = result.status ?? 1;
  }
} catch (error) {
  console.error(error.message);
  if (gatewayOutput.trim()) {
    console.error(gatewayOutput.trim());
  }
  exitCode = 1;
} finally {
  stopGateway(gateway);
  await sleep(500);
}

process.exit(exitCode);

async function waitForGateway(baseUrl, startupTimeoutMs) {
  const deadline = Date.now() + startupTimeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) {
      throw new Error(`identity gateway exited early with code ${gateway.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
      lastError = `health status ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await sleep(250);
  }
  throw new Error(`identity gateway did not become healthy: ${lastError}`);
}

function stopGateway(processHandle) {
  if (processHandle.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(processHandle.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  processHandle.kill("SIGTERM");
}
