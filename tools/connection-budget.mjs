import fs from "node:fs";
import { pathToFileURL } from "node:url";

export function evaluateConnectionBudget(config) {
  validateConfig(config);

  const database = config.database;
  const hardLimit = database.maxConnections - database.reservedConnections;
  const safeLimit = Math.floor(database.maxConnections * database.safetyRatio) - database.reservedConnections;
  const services = config.services.map((service) => {
    const workers = service.workers ?? 1;
    const poolConnections = service.pools
      ? service.pools.reduce((sum, pool) => sum + pool.maxConnsPerWorker, 0)
      : service.maxConns ?? 0;
    const plannedConnections = service.instances * workers * poolConnections;
    return {
      name: service.name,
      instances: service.instances,
      workers,
      poolConnections,
      plannedConnections,
    };
  });
  const totalPlannedConnections = services.reduce(
    (sum, service) => sum + service.plannedConnections,
    0,
  );
  const passed = totalPlannedConnections <= safeLimit;

  return {
    passed,
    totalPlannedConnections,
    hardLimit,
    safeLimit,
    maxConnections: database.maxConnections,
    reservedConnections: database.reservedConnections,
    safetyRatio: database.safetyRatio,
    services,
    remediation: passed ? [] : remediationHints(totalPlannedConnections, safeLimit),
  };
}

export function loadConnectionBudgetConfig(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function formatConnectionBudgetReport(result) {
  const lines = [
    `Connection budget: ${result.passed ? "PASS" : "FAIL"}`,
    `planned=${result.totalPlannedConnections}`,
    `safeLimit=${result.safeLimit}`,
    `hardLimit=${result.hardLimit}`,
    `maxConnections=${result.maxConnections}`,
    "",
    "Services:",
  ];

  for (const service of result.services) {
    lines.push(
      `- ${service.name}: instances=${service.instances}, workers=${service.workers}, poolConnections=${service.poolConnections}, planned=${service.plannedConnections}`,
    );
  }

  if (result.remediation.length > 0) {
    lines.push("", "Remediation:");
    for (const hint of result.remediation) {
      lines.push(`- ${hint}`);
    }
  }

  return lines.join("\n");
}

function validateConfig(config) {
  if (!config || typeof config !== "object") {
    throw new Error("connection budget config must be an object");
  }
  if (!config.database || typeof config.database !== "object") {
    throw new Error("database config is required");
  }
  requirePositiveInteger(config.database.maxConnections, "database.maxConnections");
  requireNonNegativeInteger(config.database.reservedConnections, "database.reservedConnections");
  if (typeof config.database.safetyRatio !== "number" || config.database.safetyRatio <= 0 || config.database.safetyRatio > 1) {
    throw new Error("database.safetyRatio must be a number in (0, 1]");
  }
  if (!Array.isArray(config.services) || config.services.length === 0) {
    throw new Error("services must be a non-empty array");
  }

  for (const service of config.services) {
    if (!service.name || typeof service.name !== "string") {
      throw new Error("service.name is required");
    }
    requirePositiveInteger(service.instances, `${service.name}.instances`);
    if (service.workers !== undefined) {
      requirePositiveInteger(service.workers, `${service.name}.workers`);
    }

    const hasPools = service.pools !== undefined;
    const hasMaxConns = service.maxConns !== undefined;
    if (hasPools === hasMaxConns) {
      throw new Error(`${service.name} must define exactly one of pools or maxConns`);
    }

    if (hasMaxConns) {
      requireNonNegativeInteger(service.maxConns, `${service.name}.maxConns`);
    }
    if (hasPools) {
      if (!Array.isArray(service.pools) || service.pools.length === 0) {
        throw new Error(`${service.name}.pools must be a non-empty array`);
      }
      for (const pool of service.pools) {
        if (!pool.name || typeof pool.name !== "string") {
          throw new Error(`${service.name}.pools[].name is required`);
        }
        requireNonNegativeInteger(
          pool.maxConnsPerWorker,
          `${service.name}.${pool.name}.maxConnsPerWorker`,
        );
      }
    }
  }
}

function requirePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function requireNonNegativeInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
}

function remediationHints(total, safeLimit) {
  return [
    `reduce planned connections by at least ${total - safeLimit}`,
    "lower legacy worker pool sizes or worker count",
    "route bursty services through PgBouncer transaction pooling",
    "increase PostgreSQL max_connections only with matching memory/WAL tuning",
    "record pg_stat_activity state before every combined load test",
  ];
}

function parseArgs(argv) {
  const configIndex = argv.indexOf("--config");
  if (configIndex === -1 || !argv[configIndex + 1]) {
    throw new Error("usage: node tools/connection-budget.mjs --config <file>");
  }
  return { configPath: argv[configIndex + 1] };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { configPath } = parseArgs(process.argv.slice(2));
    const result = evaluateConnectionBudget(loadConnectionBudgetConfig(configPath));
    console.log(formatConnectionBudgetReport(result));
    process.exit(result.passed ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
