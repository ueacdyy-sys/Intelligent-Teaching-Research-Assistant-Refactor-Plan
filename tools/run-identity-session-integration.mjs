import { spawnSync } from "node:child_process";

const defaultDsn = "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable";

function parseArgs(argv) {
  const dsnIndex = argv.indexOf("--dsn");
  return {
    dsn: dsnIndex === -1 ? defaultDsn : argv[dsnIndex + 1],
  };
}

const { dsn } = parseArgs(process.argv.slice(2));
const result = spawnSync(
  "go",
  [
    "test",
    "./services/identity-access-gateway/internal/adapter/postgres",
    "-run",
    "TestSessionStorePostgresIntegrationLifecycle",
    "-count=1",
    "-v",
  ],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      IDENTITY_SESSION_INTEGRATION_DATABASE_URL: dsn,
    },
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
