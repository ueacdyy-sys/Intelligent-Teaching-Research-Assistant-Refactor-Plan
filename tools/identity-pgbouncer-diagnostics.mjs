import { spawnSync } from "node:child_process";

const localSecretValues = ["ueacd"];
const pgbouncerDiagnosticsQueries = {
  stats: "SHOW STATS;",
  pools: "SHOW POOLS;",
  config: "SHOW CONFIG;",
};

export function collectPgbouncerDiagnostics(options, dependencies = {}) {
  if (!pgbouncerDiagnosticsEnabled(options)) return undefined;
  const spawnCommandSync = dependencies.spawnSync ?? spawnSync;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const queries = Object.fromEntries(Object.entries(pgbouncerDiagnosticsQueries).map(([name, sql]) => [
    name,
    runPgbouncerDiagnosticsQuery(options, sql, spawnCommandSync),
  ]));
  return {
    status: Object.values(queries).every((query) => query.status === "OK") ? "OK" : "ERROR",
    sampledAt: now(),
    executor: "DOCKER_EXEC_PSQL",
    postgresContainer: options.pgbouncerPostgresContainer,
    pgbouncerHost: options.pgbouncerHost,
    pgbouncerPort: parseIntegerOption(options.pgbouncerPort),
    pgbouncerDatabase: options.pgbouncerDatabase,
    queries,
  };
}

export function parsePsqlUnalignedRows(output) {
  const lines = String(output ?? "")
    .split(/\r\n|\r|\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^\(\d+ rows?\)$/u.test(line));
  if (lines.length === 0) return [];
  const headers = lines[0].split("|");
  return lines.slice(1).map((line) => {
    const values = line.split("|");
    return Object.fromEntries(headers.map((header, index) => [header, parsePsqlScalar(values[index] ?? "")]));
  });
}

function runPgbouncerDiagnosticsQuery(options, sql, spawnCommandSync) {
  const result = spawnCommandSync(
    "docker",
    [
      "exec",
      "-e",
      "PGPASSWORD=ueacd",
      options.pgbouncerPostgresContainer,
      "psql",
      "-h",
      options.pgbouncerHost,
      "-p",
      String(options.pgbouncerPort),
      "-U",
      options.pgbouncerUser,
      "-d",
      options.pgbouncerDatabase,
      "-A",
      "-F",
      "|",
      "-P",
      "footer=off",
      "-c",
      sql,
    ],
    {
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.error || result.status !== 0) {
    return {
      status: "ERROR",
      query: sql,
      exitCode: result.status ?? null,
      errorMessage: maskSensitive(result.error?.message ?? result.stderr ?? "PgBouncer diagnostics query failed"),
    };
  }
  return {
    status: "OK",
    query: sql,
    rows: parsePsqlUnalignedRows(result.stdout),
  };
}

function pgbouncerDiagnosticsEnabled(options) {
  return ["1", "true", "yes", "on"].includes(String(options.pgbouncerDiagnostics).toLowerCase());
}

function parseIntegerOption(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parsePsqlScalar(value) {
  const text = String(value ?? "").trim();
  if (text === "") return "";
  if (/^-?\d+$/u.test(text)) return Number.parseInt(text, 10);
  if (/^-?\d+\.\d+$/u.test(text)) return Number.parseFloat(text);
  return text;
}

function maskSensitive(value) {
  let text = String(value ?? "");
  text = text.replace(/postgres:\/\/[^\s"']+/giu, "[masked-postgres-dsn]");
  for (const secret of localSecretValues) {
    text = text.replaceAll(secret, "***");
  }
  return text;
}
