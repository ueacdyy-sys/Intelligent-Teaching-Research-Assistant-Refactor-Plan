import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultFiles = {
  composeFile: "infra/perf/docker-compose.identity-session.yml",
  pgbouncerIni: "infra/perf/identity-session-pgbouncer.ini",
  userlist: "infra/perf/identity-session-userlist.txt",
};

const expected = {
  postgresService: "identity-session-postgres",
  pgbouncerService: "identity-session-pgbouncer",
  postgresHostPort: 15432,
  pgbouncerHostPort: 16432,
  pgbouncerListenPort: 6432,
  pgbouncerPoolMode: "transaction",
  postgresMinMaxConnections: 300,
  postgresMinSharedBuffers: "1GB",
  pgbouncerMaxDbConnections: 180,
  databaseName: "intelligent_teaching_assistant",
  databaseUser: "app_user",
  secretValue: "ueacd",
};

export function auditIdentitySessionRuntimeProfile(sourceTexts) {
  const sources = sourceTexts ?? readSourceTexts(defaultFiles);
  const compose = observeCompose(sources.composeText);
  const ini = parseIni(sources.pgbouncerIniText);
  const userlist = parsePgbouncerUserlist(sources.userlistText);
  const pgbouncerSection = ini.pgbouncer ?? {};
  const databaseLine = (ini.databases ?? {})[expected.databaseName] ?? "";
  const findings = [];

  addFinding(findings, {
    id: "postgres.service_present",
    passed: compose.postgres.present,
    actual: compose.postgres.present,
    expected: true,
    remediation: "Add identity-session-postgres to the identity runtime compose profile.",
  });
  addFinding(findings, {
    id: "postgres.host_port",
    passed: compose.postgres.hostPort === expected.postgresHostPort,
    actual: compose.postgres.hostPort,
    expected: expected.postgresHostPort,
    remediation: "Expose identity runtime PostgreSQL on host port 15432 to avoid the dev 5433 profile.",
  });
  addFinding(findings, {
    id: "postgres.password",
    passed: compose.postgres.environment.POSTGRES_PASSWORD === expected.secretValue,
    actual: maskSecret(compose.postgres.environment.POSTGRES_PASSWORD),
    expected: maskSecret(expected.secretValue),
    remediation: "Set POSTGRES_PASSWORD to ueacd in the identity runtime profile.",
  });
  addFinding(findings, {
    id: "postgres.database",
    passed: compose.postgres.environment.POSTGRES_DB === expected.databaseName,
    actual: compose.postgres.environment.POSTGRES_DB,
    expected: expected.databaseName,
    remediation: "Use the shared intelligent_teaching_assistant test database name.",
  });
  addFinding(findings, {
    id: "postgres.volume_target",
    passed: compose.postgres.volumeTargets.includes("/var/lib/postgresql"),
    actual: compose.postgres.volumeTargets.join(","),
    expected: "/var/lib/postgresql",
    remediation: "PostgreSQL 18 images need the volume mounted at /var/lib/postgresql, not /var/lib/postgresql/data.",
  });
  addFinding(findings, {
    id: "postgres.max_connections",
    passed: compose.postgres.maxConnections >= expected.postgresMinMaxConnections,
    actual: compose.postgres.maxConnections,
    expected: `>=${expected.postgresMinMaxConnections}`,
    remediation: "Set identity runtime PostgreSQL max_connections to 300 or higher before claiming a high-concurrency ceiling.",
  });
  addFinding(findings, {
    id: "postgres.shared_buffers",
    passed: compareSize(compose.postgres.sharedBuffers, expected.postgresMinSharedBuffers) >= 0,
    actual: compose.postgres.sharedBuffers,
    expected: `>=${expected.postgresMinSharedBuffers}`,
    remediation: "Set identity runtime PostgreSQL shared_buffers to 1GB or higher for performance evidence runs.",
  });

  addFinding(findings, {
    id: "pgbouncer.service_present",
    passed: compose.pgbouncer.present,
    actual: compose.pgbouncer.present,
    expected: true,
    remediation: "Add identity-session-pgbouncer to the identity runtime compose profile.",
  });
  addFinding(findings, {
    id: "pgbouncer.host_port",
    passed: compose.pgbouncer.hostPort === expected.pgbouncerHostPort,
    actual: compose.pgbouncer.hostPort,
    expected: expected.pgbouncerHostPort,
    remediation: "Expose identity runtime PgBouncer on host port 16432.",
  });
  addFinding(findings, {
    id: "pgbouncer.depends_on_postgres",
    passed: compose.pgbouncer.dependsOnPostgres,
    actual: compose.pgbouncer.dependsOnPostgres,
    expected: true,
    remediation: "Order identity-session-pgbouncer after identity-session-postgres.",
  });
  addFinding(findings, {
    id: "pgbouncer.database_host",
    passed: new RegExp(`host=${expected.postgresService}\\b`).test(databaseLine),
    actual: databaseLine,
    expected: `host=${expected.postgresService}`,
    remediation: "Route PgBouncer database traffic to identity-session-postgres.",
  });
  addFinding(findings, {
    id: "pgbouncer.listen_port",
    passed: toInteger(pgbouncerSection.listen_port) === expected.pgbouncerListenPort,
    actual: toInteger(pgbouncerSection.listen_port),
    expected: expected.pgbouncerListenPort,
    remediation: "Set listen_port = 6432 in the identity PgBouncer profile.",
  });
  addFinding(findings, {
    id: "pgbouncer.pool_mode",
    passed: pgbouncerSection.pool_mode === expected.pgbouncerPoolMode,
    actual: pgbouncerSection.pool_mode,
    expected: expected.pgbouncerPoolMode,
    remediation: "Use PgBouncer transaction pooling for high-concurrency session tests.",
  });
  addFinding(findings, {
    id: "pgbouncer.max_db_connections",
    passed: toInteger(pgbouncerSection.max_db_connections) === expected.pgbouncerMaxDbConnections,
    actual: toInteger(pgbouncerSection.max_db_connections),
    expected: expected.pgbouncerMaxDbConnections,
    remediation: "Set identity runtime PgBouncer max_db_connections to 180 to match the reviewed production headroom profile.",
  });
  addFinding(findings, {
    id: "pgbouncer.userlist_secret",
    passed: userlist[expected.databaseUser] === expected.secretValue,
    actual: maskSecret(userlist[expected.databaseUser]),
    expected: maskSecret(expected.secretValue),
    remediation: "Set app_user in identity-session-userlist.txt to ueacd.",
  });

  const failed = findings.filter((finding) => !finding.passed);
  return {
    generatedAt: new Date().toISOString(),
    readiness: failed.length === 0 ? "READY" : "NEEDS_REMEDIATION",
    expected,
    observed: compose,
    findings,
  };
}

export function formatIdentitySessionRuntimeProfileAudit(report) {
  const lines = [
    `Identity session runtime profile: ${report.readiness}`,
    "",
    "Findings:",
  ];
  for (const finding of report.findings) {
    lines.push(
      `- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`,
    );
    if (!finding.passed) {
      lines.push(`  ${finding.remediation}`);
    }
  }
  return lines.join("\n");
}

function readSourceTexts(files) {
  return {
    composeText: fs.readFileSync(path.resolve(process.cwd(), files.composeFile), "utf8"),
    pgbouncerIniText: fs.readFileSync(path.resolve(process.cwd(), files.pgbouncerIni), "utf8"),
    userlistText: fs.readFileSync(path.resolve(process.cwd(), files.userlist), "utf8"),
  };
}

function observeCompose(text) {
  const postgresBlock = extractServiceBlock(text, expected.postgresService);
  const pgbouncerBlock = extractServiceBlock(text, expected.pgbouncerService);
  return {
    postgres: {
      present: postgresBlock.length > 0,
      hostPort: firstHostPort(postgresBlock, 5432),
      environment: extractMappingSection(postgresBlock, "environment"),
      maxConnections: toInteger(matchFirst(postgresBlock, /-c\s+max_connections=(\S+)/)),
      sharedBuffers: matchFirst(postgresBlock, /-c\s+shared_buffers=(\S+)/),
      volumeTargets: extractVolumeTargets(postgresBlock),
    },
    pgbouncer: {
      present: pgbouncerBlock.length > 0,
      hostPort: firstHostPort(pgbouncerBlock, 6432),
      dependsOnPostgres: blockDependsOn(pgbouncerBlock, expected.postgresService),
    },
  };
}

function extractServiceBlock(text, serviceName) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const servicePattern = new RegExp(`^\\s{2}${escapeRegExp(serviceName)}:\\s*(?:#.*)?$`);
  const start = lines.findIndex((line) => servicePattern.test(line));
  if (start === -1) return "";
  const startIndent = leadingSpaces(lines[start]);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (leadingSpaces(line) <= startIndent) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function extractMappingSection(block, sectionName) {
  const result = {};
  if (!block) return result;
  const lines = block.split("\n");
  const sectionPattern = new RegExp(`^(\\s*)${escapeRegExp(sectionName)}:\\s*$`);
  const start = lines.findIndex((line) => sectionPattern.test(line));
  if (start === -1) return result;
  const sectionIndent = leadingSpaces(lines[start]);
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const indent = leadingSpaces(line);
    if (indent <= sectionIndent) break;
    const match = line.match(/^\s*([A-Za-z0-9_]+):\s*(.*)$/);
    if (match) {
      result[match[1]] = unquote(match[2].trim());
    }
  }
  return result;
}

function blockDependsOn(block, serviceName) {
  if (!block) return false;
  const dependsBlock = extractNestedBlock(block, "depends_on");
  return new RegExp(`(^|\\n)\\s*${escapeRegExp(serviceName)}\\s*:`).test(dependsBlock);
}

function extractNestedBlock(block, sectionName) {
  const lines = block.split("\n");
  const sectionPattern = new RegExp(`^(\\s*)${escapeRegExp(sectionName)}:\\s*$`);
  const start = lines.findIndex((line) => sectionPattern.test(line));
  if (start === -1) return "";
  const sectionIndent = leadingSpaces(lines[start]);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (leadingSpaces(line) <= sectionIndent) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function firstHostPort(block, containerPort) {
  const pattern = new RegExp(`["']?(\\d+):${containerPort}["']?`);
  const match = block.match(pattern);
  return match ? toInteger(match[1]) : Number.NaN;
}

function extractVolumeTargets(block) {
  const targets = [];
  const volumesBlock = extractNestedBlock(block, "volumes");
  for (const line of volumesBlock.split("\n")) {
    const match = line.match(/-\s+[^:\s]+:([^:\s]+)(?::\w+)?\s*$/);
    if (match) {
      targets.push(unquote(match[1]));
    }
  }
  return targets;
}

function parseIni(text) {
  const result = {};
  let currentSection = "";
  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      result[currentSection] = result[currentSection] ?? {};
      continue;
    }
    const keyValue = line.match(/^([^=]+?)\s*=\s*(.*)$/);
    if (keyValue && currentSection) {
      result[currentSection][keyValue[1].trim()] = keyValue[2].trim();
    }
  }
  return result;
}

function parsePgbouncerUserlist(text) {
  const users = {};
  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^"([^"]+)"\s+"([^"]+)"$/);
    if (match) {
      users[match[1]] = match[2];
    }
  }
  return users;
}

function matchFirst(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1] : "";
}

function compareSize(actual, expectedValue) {
  return parseSizeBytes(actual) - parseSizeBytes(expectedValue);
}

function parseSizeBytes(value) {
  const match = String(value ?? "").trim().match(/^(\d+(?:\.\d+)?)([KMG]B?)?$/i);
  if (!match) return Number.NEGATIVE_INFINITY;
  const number = Number.parseFloat(match[1]);
  const unit = (match[2] ?? "B").toUpperCase();
  const multipliers = {
    B: 1,
    KB: 1024,
    K: 1024,
    MB: 1024 ** 2,
    M: 1024 ** 2,
    GB: 1024 ** 3,
    G: 1024 ** 3,
  };
  return number * (multipliers[unit] ?? Number.NEGATIVE_INFINITY);
}

function addFinding(findings, finding) {
  findings.push({
    id: finding.id,
    passed: Boolean(finding.passed),
    severity: finding.passed ? "info" : "error",
    actual: finding.actual ?? null,
    expected: finding.expected,
    remediation: finding.remediation,
  });
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  return {
    outPath: outIndex === -1 ? undefined : argv[outIndex + 1],
  };
}

function toInteger(value) {
  if (value === undefined || value === null || value === "") return Number.NaN;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function unquote(value) {
  return String(value).replace(/^["']|["']$/g, "");
}

function leadingSpaces(line) {
  const match = line.match(/^ */);
  return match ? match[0].length : 0;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function maskSecret(value) {
  if (value === undefined || value === null) return null;
  return value === "" ? "" : "***";
}

function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return String(value);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = auditIdentitySessionRuntimeProfile();
    if (args.outPath) {
      fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
      fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(formatIdentitySessionRuntimeProfileAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
