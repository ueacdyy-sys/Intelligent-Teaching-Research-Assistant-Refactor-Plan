import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { parsePsqlUnalignedRows } from "./pgbouncer-diagnostics.mjs";

const localSecretValues = ["ueacd"];
export const postgresDiagnosticsDefaults = {
  postgresDiagnostics: "false",
  postgresDiagnosticsContainer: "ita-identity-session-postgres",
  postgresDiagnosticsHost: "127.0.0.1",
  postgresDiagnosticsPort: "5432",
  postgresDiagnosticsUser: "app_user",
  postgresDiagnosticsDatabase: "intelligent_teaching_assistant",
  postgresDiagnosticsRelations: "",
  postgresDiagnosticsIntervalMs: "1000",
  postgresDiagnosticsMaxSamples: "240",
  postgresDiagnosticsQueryTimeoutMs: "5000",
};

const postgresDiagnosticsArgMap = {
  "--postgres-diagnostics": "postgresDiagnostics",
  "--postgres-diagnostics-container": "postgresDiagnosticsContainer",
  "--postgres-diagnostics-host": "postgresDiagnosticsHost",
  "--postgres-diagnostics-port": "postgresDiagnosticsPort",
  "--postgres-diagnostics-user": "postgresDiagnosticsUser",
  "--postgres-diagnostics-database": "postgresDiagnosticsDatabase",
  "--postgres-diagnostics-relations": "postgresDiagnosticsRelations",
  "--postgres-diagnostics-interval-ms": "postgresDiagnosticsIntervalMs",
  "--postgres-diagnostics-max-samples": "postgresDiagnosticsMaxSamples",
  "--postgres-diagnostics-query-timeout-ms": "postgresDiagnosticsQueryTimeoutMs",
};

const postgresDiagnosticsBaseQueries = {
  activity: `
SELECT COALESCE(state, '') AS state,
       COALESCE(wait_event_type, '') AS wait_event_type,
       COALESCE(wait_event, '') AS wait_event,
       count(*) AS connections
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY 1, 2, 3
ORDER BY connections DESC, state, wait_event_type, wait_event;
`,
  database: `
SELECT datname,
       numbackends,
       xact_commit,
       xact_rollback,
       blks_read,
       blks_hit,
       tup_returned,
       tup_fetched,
       tup_inserted,
       tup_updated,
       tup_deleted,
       deadlocks
FROM pg_stat_database
WHERE datname = current_database();
`,
  locks: `
SELECT COALESCE(mode, '') AS mode,
       granted,
       count(*) AS locks
FROM pg_locks l
LEFT JOIN pg_database d ON l.database = d.oid
WHERE d.datname = current_database()
   OR l.database IS NULL
GROUP BY 1, 2
ORDER BY locks DESC, mode, granted;
`,
};

export function applyPostgresDiagnosticsArg(parsed, key, value) {
  const optionName = postgresDiagnosticsArgMap[key];
  if (!optionName) return false;
  parsed[optionName] = value;
  return true;
}

export async function runBenchmarkWithPostgresDiagnostics(options, benchmarkCommand, dependencies = {}) {
  const spawnCommandSync = dependencies.spawnSync ?? spawnSync;
  if (!postgresDiagnosticsEnabled(options)) {
    return {
      result: runBenchmarkCommandSync(benchmarkCommand, spawnCommandSync),
      postgresDiagnostics: undefined,
    };
  }
  let postgresDiagnostics;
  let timeline;
  try {
    postgresDiagnostics = addDiagnosticsSnapshot(
      postgresDiagnostics,
      "before",
      collectPostgresDiagnostics(options, { spawnSync: spawnCommandSync }),
    );
    timeline = startPostgresDiagnosticsTimeline(options, dependencies);
    const result = await runBenchmarkCommandAsync(benchmarkCommand, dependencies.spawn ?? spawn);
    postgresDiagnostics = addDiagnosticsSnapshot(
      postgresDiagnostics,
      "timeline",
      await stopPostgresDiagnosticsTimeline(timeline),
    );
    timeline = undefined;
    postgresDiagnostics = addDiagnosticsSnapshot(
      postgresDiagnostics,
      "after",
      collectPostgresDiagnostics(options, { spawnSync: spawnCommandSync }),
    );
    return { result, postgresDiagnostics };
  } catch (error) {
    postgresDiagnostics = addDiagnosticsSnapshot(
      postgresDiagnostics,
      "timeline",
      await stopPostgresDiagnosticsTimeline(timeline),
    );
    return {
      result: {
        error,
        status: null,
        stdout: "",
        stderr: "",
      },
      postgresDiagnostics,
    };
  }
}

export function collectPostgresDiagnostics(options, dependencies = {}) {
  if (!postgresDiagnosticsEnabled(options)) return undefined;
  const spawnCommandSync = dependencies.spawnSync ?? spawnSync;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const sampledAt = now();
  let relationNames;
  try {
    relationNames = relationNamesFromOptions(options);
  } catch (error) {
    return {
      ...postgresDiagnosticsMetadata(options, sampledAt, []),
      status: "ERROR",
      queries: {
        configuration: {
          status: "ERROR",
          errorMessage: maskSensitive(error instanceof Error ? error.message : String(error)),
        },
      },
    };
  }
  const metadata = postgresDiagnosticsMetadata(options, sampledAt, relationNames);
  const queryEntries = Object.entries(postgresDiagnosticsQueries(relationNames));
  const queries = Object.fromEntries(queryEntries.map(([name, sql]) => [
    name,
    runPostgresDiagnosticsQuery(options, sql.trim(), spawnCommandSync),
  ]));
  return {
    ...metadata,
    status: Object.values(queries).every((query) => query.status === "OK") ? "OK" : "ERROR",
    queries,
  };
}

export function runBenchmarkCommandAsync(benchmarkCommand, spawnProcess = spawn) {
  return new Promise((resolve) => {
    const child = spawnProcess(benchmarkCommand.command, benchmarkCommand.args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({ error, status: null, stdout, stderr });
    });
    child.on("close", (code, signal) => {
      resolve({ status: code, signal, stdout, stderr });
    });
  });
}

export function startPostgresDiagnosticsTimeline(options, dependencies = {}) {
  if (!postgresDiagnosticsEnabled(options)) return undefined;
  const collect = dependencies.collect ?? ((currentOptions) => collectPostgresDiagnostics(currentOptions, dependencies));
  const sleepFn = dependencies.sleep ?? sleep;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const intervalMs = Math.max(100, parseIntegerOption(options.postgresDiagnosticsIntervalMs));
  const maxSamples = Math.max(1, parseIntegerOption(options.postgresDiagnosticsMaxSamples));
  const samples = [];
  let stopped = false;
  const done = (async () => {
    while (!stopped && samples.length < maxSamples) {
      samples.push(collectTimelineSample(collect, options, now));
      if (samples.length >= maxSamples) break;
      await sleepFn(intervalMs);
    }
  })();
  return {
    async stop() {
      stopped = true;
      await done;
      return {
        status: timelineStatus(samples),
        intervalMs,
        maxSamples,
        samples,
      };
    },
  };
}

export function postgresDiagnosticsEnabled(options) {
  return ["1", "true", "yes", "on"].includes(String(options.postgresDiagnostics).toLowerCase());
}

function postgresDiagnosticsMetadata(options, sampledAt, relationNames) {
  return {
    sampledAt,
    executor: "DOCKER_EXEC_PSQL",
    postgresContainer: options.postgresDiagnosticsContainer,
    postgresHost: options.postgresDiagnosticsHost,
    postgresPort: parseIntegerOption(options.postgresDiagnosticsPort),
    postgresDatabase: options.postgresDiagnosticsDatabase,
    postgresRelations: relationNames,
  };
}

function postgresDiagnosticsQueries(relationNames) {
  return {
    ...postgresDiagnosticsBaseQueries,
    relations: relationsQuery(relationNames),
  };
}

function relationsQuery(relationNames) {
  const relationFilter = relationNames.length === 0
    ? "AND false"
    : `AND c.relname IN (${relationNames.map(sqlStringLiteral).join(", ")})`;
  return `
SELECT c.relname,
       CASE c.relpersistence
         WHEN 'p' THEN 'logged'
         WHEN 'u' THEN 'unlogged'
         WHEN 't' THEN 'temporary'
         ELSE c.relpersistence::text
       END AS persistence,
       pg_total_relation_size(c.oid) AS total_size_bytes
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  ${relationFilter}
ORDER BY c.relname;
`;
}

function relationNamesFromOptions(options) {
  const values = String(options.postgresDiagnosticsRelations ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const invalid = values.find((value) => !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value));
  if (invalid) {
    throw new Error(`invalid postgres diagnostics relation name: ${invalid}`);
  }
  return values;
}

function sqlStringLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runPostgresDiagnosticsQuery(options, sql, spawnCommandSync) {
  let result;
  try {
    result = spawnCommandSync(
      "docker",
      [
        "exec",
        "-e",
        "PGPASSWORD=ueacd",
        options.postgresDiagnosticsContainer,
        "psql",
        "-h",
        options.postgresDiagnosticsHost,
        "-p",
        String(options.postgresDiagnosticsPort),
        "-U",
        options.postgresDiagnosticsUser,
        "-d",
        options.postgresDiagnosticsDatabase,
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
        timeout: Math.max(1000, parseIntegerOption(options.postgresDiagnosticsQueryTimeoutMs)),
      },
    );
  } catch (error) {
    return {
      status: "ERROR",
      query: sql,
      exitCode: null,
      errorMessage: maskSensitive(error instanceof Error ? error.message : String(error)),
    };
  }
  if (result.error || result.status !== 0) {
    return {
      status: "ERROR",
      query: sql,
      exitCode: result.status ?? null,
      errorMessage: maskSensitive(result.error?.message ?? result.stderr ?? "PostgreSQL diagnostics query failed"),
    };
  }
  return {
    status: "OK",
    query: sql,
    rows: parsePsqlUnalignedRows(result.stdout),
  };
}

function runBenchmarkCommandSync(benchmarkCommand, spawnCommandSync) {
  return spawnCommandSync(
    benchmarkCommand.command,
    benchmarkCommand.args,
    {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

function addDiagnosticsSnapshot(current, name, snapshot) {
  if (!snapshot) return current;
  return {
    ...(current ?? {}),
    [name]: snapshot,
  };
}

async function stopPostgresDiagnosticsTimeline(timeline) {
  if (!timeline) return undefined;
  return timeline.stop();
}

function collectTimelineSample(collect, options, now) {
  try {
    return collect(options) ?? {
      status: "DISABLED",
      sampledAt: now(),
    };
  } catch (error) {
    return {
      status: "ERROR",
      sampledAt: now(),
      errorMessage: maskSensitive(error instanceof Error ? error.message : String(error)),
    };
  }
}

function timelineStatus(samples) {
  if (samples.length === 0) return "EMPTY";
  return samples.every((sample) => sample?.status === "OK") ? "OK" : "ERROR";
}

function parseIntegerOption(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function maskSensitive(value) {
  let text = String(value ?? "");
  text = text.replace(/postgres(?:ql)?:\/\/[^\s"']+/giu, "[masked-postgres-dsn]");
  for (const secret of localSecretValues) {
    text = text.replaceAll(secret, "***");
  }
  return text;
}
