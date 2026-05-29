import { spawnSync } from "node:child_process";

const defaults = {
  dsn: "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable",
  out: "reports/identity-session-benchmark.current.json",
  concurrency: "64",
  operations: "500",
  poolMaxConns: "8",
  timeout: "60s",
};

function parseArgs(argv) {
  const parsed = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--") || value === undefined) continue;
    if (key === "--dsn") parsed.dsn = value;
    if (key === "--out") parsed.out = value;
    if (key === "--concurrency") parsed.concurrency = value;
    if (key === "--operations") parsed.operations = value;
    if (key === "--pool-max-conns") parsed.poolMaxConns = value;
    if (key === "--timeout") parsed.timeout = value;
    index += 1;
  }
  return parsed;
}

const options = parseArgs(process.argv.slice(2));
const result = spawnSync(
  "go",
  [
    "run",
    "./services/identity-access-gateway/cmd/sessionbench",
    "-database-url",
    options.dsn,
    "-out",
    options.out,
    "-concurrency",
    options.concurrency,
    "-operations",
    options.operations,
    "-pool-max-conns",
    options.poolMaxConns,
    "-timeout",
    options.timeout,
  ],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
