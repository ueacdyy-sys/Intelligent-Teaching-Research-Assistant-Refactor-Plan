import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function auditPgbouncerPerfProfile(profile, sourceTexts) {
  validateProfile(profile);
  const sources = sourceTexts ?? readSourceTexts(profile.sourceFiles);
  const composeObservation = observeCompose(
    sources.composeText,
    sources.overrideText ?? "",
    profile.expected,
  );
  const pgbouncerIni = parseIni(sources.pgbouncerIniText);
  const pgbouncerUsers = parsePgbouncerUserlist(sources.pgbouncerUserlistText);
  const findings = [];

  addFinding(findings, {
    id: "postgres.service_present",
    passed: Boolean(composeObservation.postgres.present),
    message: `PostgreSQL service ${profile.expected.postgres.serviceName} is present.`,
    actual: composeObservation.postgres.present,
    expected: true,
    remediation: "Restore the postgres performance service in docker-compose.perf.yml.",
  });
  addFinding(findings, {
    id: "postgres.max_connections",
    passed: composeObservation.postgres.maxConnections >= profile.expected.postgres.minMaxConnections,
    message: "PostgreSQL max_connections meets the performance-test floor.",
    actual: composeObservation.postgres.maxConnections,
    expected: `>=${profile.expected.postgres.minMaxConnections}`,
    remediation: "Set the perf PostgreSQL command to include -c max_connections=300 or higher.",
  });
  addFinding(findings, {
    id: "postgres.shared_buffers",
    passed: memoryToMiB(composeObservation.postgres.sharedBuffers) >= memoryToMiB(profile.expected.postgres.minSharedBuffers),
    message: "PostgreSQL shared_buffers meets the performance-test floor.",
    actual: composeObservation.postgres.sharedBuffers,
    expected: `>=${profile.expected.postgres.minSharedBuffers}`,
    remediation: "Set the perf PostgreSQL command to include -c shared_buffers=1GB or higher.",
  });

  const pgbouncerSection = pgbouncerIni.pgbouncer ?? {};
  addFinding(findings, {
    id: "pgbouncer.service_present",
    passed: Boolean(composeObservation.pgbouncer.present),
    message: `PgBouncer service ${profile.expected.pgbouncer.serviceName} is present.`,
    actual: composeObservation.pgbouncer.present,
    expected: true,
    remediation: "Add the PgBouncer service to the performance compose file.",
  });
  addFinding(findings, {
    id: "pgbouncer.pool_mode",
    passed: pgbouncerSection.pool_mode === profile.expected.pgbouncer.requiredPoolMode,
    message: "PgBouncer uses transaction pooling.",
    actual: pgbouncerSection.pool_mode,
    expected: profile.expected.pgbouncer.requiredPoolMode,
    remediation: "Set pool_mode = transaction in pgbouncer/perf.ini.",
  });
  addFinding(findings, {
    id: "pgbouncer.listen_port",
    passed: toInteger(pgbouncerSection.listen_port) === profile.expected.pgbouncer.requiredListenPort,
    message: "PgBouncer listens on the expected performance port.",
    actual: toInteger(pgbouncerSection.listen_port),
    expected: profile.expected.pgbouncer.requiredListenPort,
    remediation: "Set listen_port = 6432 in pgbouncer/perf.ini.",
  });
  addFinding(findings, {
    id: "pgbouncer.max_db_connections",
    passed: toInteger(pgbouncerSection.max_db_connections) <= profile.expected.pgbouncer.maxDbConnectionsCeiling,
    message: "PgBouncer caps server connections below the target safe budget.",
    actual: toInteger(pgbouncerSection.max_db_connections),
    expected: `<=${profile.expected.pgbouncer.maxDbConnectionsCeiling}`,
    remediation: "Lower max_db_connections or raise the explicit PostgreSQL performance capacity profile.",
  });

  addFinding(findings, {
    id: "backend.postgres_host",
    passed: composeObservation.backend.environment.POSTGRES_HOST === profile.expected.backend.requiredPostgresHost,
    message: "Backend routes PostgreSQL traffic through PgBouncer.",
    actual: composeObservation.backend.environment.POSTGRES_HOST,
    expected: profile.expected.backend.requiredPostgresHost,
    remediation: "Apply infra/perf/docker-compose.pgbouncer.override.yml or set POSTGRES_HOST=pgbouncer-perf.",
  });
  addFinding(findings, {
    id: "backend.postgres_port",
    passed: toInteger(effectiveValue(composeObservation.backend.environment.POSTGRES_PORT)) === profile.expected.backend.requiredPostgresPort,
    message: "Backend uses the PgBouncer port.",
    actual: effectiveValue(composeObservation.backend.environment.POSTGRES_PORT),
    expected: String(profile.expected.backend.requiredPostgresPort),
    remediation: "Apply the PgBouncer override or set POSTGRES_PORT=6432.",
  });
  addFinding(findings, {
    id: "backend.db_pool_size",
    passed: toInteger(effectiveValue(composeObservation.backend.environment.DB_POOL_SIZE)) <= profile.expected.backend.maxDbPoolSize,
    message: "Backend per-worker DB pool stays within the combined-test target.",
    actual: effectiveValue(composeObservation.backend.environment.DB_POOL_SIZE),
    expected: `<=${profile.expected.backend.maxDbPoolSize}`,
    remediation: "Set DB_POOL_SIZE=2 for combined legacy plus Go performance tests.",
  });
  addFinding(findings, {
    id: "backend.db_max_overflow",
    passed: toInteger(effectiveValue(composeObservation.backend.environment.DB_MAX_OVERFLOW)) === profile.expected.backend.requiredDbMaxOverflow,
    message: "Backend disables DB pool overflow for the performance profile.",
    actual: effectiveValue(composeObservation.backend.environment.DB_MAX_OVERFLOW),
    expected: String(profile.expected.backend.requiredDbMaxOverflow),
    remediation: "Set DB_MAX_OVERFLOW=0.",
  });
  addFinding(findings, {
    id: "backend.workers",
    passed: toInteger(effectiveValue(composeObservation.backend.environment.GUNICORN_WORKERS)) === profile.expected.backend.requiredWorkers,
    message: "Backend worker count matches the target high-concurrency profile.",
    actual: effectiveValue(composeObservation.backend.environment.GUNICORN_WORKERS),
    expected: String(profile.expected.backend.requiredWorkers),
    remediation: "Set GUNICORN_WORKERS=24 for this performance profile or update the connection budget.",
  });
  addFinding(findings, {
    id: "backend.depends_on_pgbouncer",
    passed: composeObservation.backend.dependsOnPgbouncer,
    message: "Backend startup is ordered after PgBouncer in the proposed profile.",
    actual: composeObservation.backend.dependsOnPgbouncer,
    expected: true,
    remediation: "Add backend-perf depends_on pgbouncer-perf in the PgBouncer override.",
  });

  for (const key of profile.expected.secrets.keys) {
    const actual = key.startsWith("pgbouncer.")
      ? pgbouncerUsers[key.slice("pgbouncer.".length)]
      : composeObservation.secrets[key];
    addFinding(findings, {
      id: `secret.${key}`,
      passed: actual === profile.expected.secrets.requiredValue,
      message: `Secret ${key} uses the required local test value.`,
      actual: maskSecret(actual),
      expected: maskSecret(profile.expected.secrets.requiredValue),
      remediation: `Set ${key} to ${profile.expected.secrets.requiredValue} in the performance profile.`,
    });
  }

  const failedFindings = findings.filter((finding) => !finding.passed);
  return {
    sourceFiles: profile.sourceFiles,
    generatedAt: new Date().toISOString(),
    readiness: failedFindings.length === 0 ? "READY" : "NEEDS_REMEDIATION",
    observed: {
      postgres: composeObservation.postgres,
      pgbouncer: {
        ...composeObservation.pgbouncer,
        poolMode: pgbouncerSection.pool_mode,
        listenPort: toInteger(pgbouncerSection.listen_port),
        maxDbConnections: toInteger(pgbouncerSection.max_db_connections),
      },
      backend: composeObservation.backend,
    },
    findings,
  };
}

export function formatPgbouncerPerfProfileAudit(report) {
  const lines = [
    `PgBouncer perf profile: ${report.readiness}`,
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

export function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readSourceTexts(sourceFiles) {
  return {
    composeText: fs.readFileSync(resolveSourcePath(sourceFiles.composeFile), "utf8"),
    overrideText: sourceFiles.composeOverrideFile
      ? fs.readFileSync(resolveSourcePath(sourceFiles.composeOverrideFile), "utf8")
      : "",
    pgbouncerIniText: fs.readFileSync(resolveSourcePath(sourceFiles.pgbouncerIni), "utf8"),
    pgbouncerUserlistText: fs.readFileSync(resolveSourcePath(sourceFiles.pgbouncerUserlist), "utf8"),
  };
}

function resolveSourcePath(filePath) {
  return path.resolve(process.cwd(), filePath);
}

function validateProfile(profile) {
  if (!profile || typeof profile !== "object") {
    throw new Error("PgBouncer profile must be an object");
  }
  if (!profile.sourceFiles || !profile.expected) {
    throw new Error("PgBouncer profile requires sourceFiles and expected");
  }
  for (const key of ["composeFile", "pgbouncerIni", "pgbouncerUserlist"]) {
    if (!profile.sourceFiles[key]) {
      throw new Error(`PgBouncer profile sourceFiles.${key} is required`);
    }
  }
}

function observeCompose(composeText, overrideText, expected) {
  const postgresBlock = extractServiceBlock(composeText, expected.postgres.serviceName);
  const pgbouncerBlock = extractServiceBlock(composeText, expected.pgbouncer.serviceName);
  const backendBaseBlock = extractServiceBlock(composeText, expected.backend.serviceName);
  const backendOverrideBlock = extractServiceBlock(overrideText, expected.backend.serviceName);
  const postgresEnv = extractMappingSection(postgresBlock, "environment");
  const backendEnvironment = {
    ...extractMappingSection(backendBaseBlock, "environment"),
    ...extractMappingSection(backendOverrideBlock, "environment"),
  };
  const secrets = {
    ...postgresEnv,
    ...backendEnvironment,
  };

  return {
    postgres: {
      present: postgresBlock.length > 0,
      maxConnections: toInteger(matchFirst(postgresBlock, /-c\s+max_connections=(\S+)/)),
      sharedBuffers: matchFirst(postgresBlock, /-c\s+shared_buffers=(\S+)/),
    },
    pgbouncer: {
      present: pgbouncerBlock.length > 0,
      hasProfile: /\bprofiles\s*:/.test(pgbouncerBlock) && /pgbouncer/.test(pgbouncerBlock),
    },
    backend: {
      present: backendBaseBlock.length > 0 || backendOverrideBlock.length > 0,
      environment: backendEnvironment,
      dependsOnPgbouncer:
        blockDependsOn(backendBaseBlock, expected.pgbouncer.serviceName)
        || blockDependsOn(backendOverrideBlock, expected.pgbouncer.serviceName),
    },
    secrets,
  };
}

function extractServiceBlock(text, serviceName) {
  if (!text) return "";
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

function addFinding(findings, finding) {
  findings.push({
    id: finding.id,
    passed: Boolean(finding.passed),
    severity: finding.passed ? "info" : "error",
    message: finding.message,
    actual: finding.actual ?? null,
    expected: finding.expected,
    remediation: finding.remediation,
  });
}

function effectiveValue(value) {
  if (value === undefined || value === null) return undefined;
  const defaultMatch = String(value).match(/^\$\{[^:}]+:-([^}]+)\}$/);
  return defaultMatch ? defaultMatch[1] : value;
}

function toInteger(value) {
  if (value === undefined || value === null || value === "") return Number.NaN;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function memoryToMiB(value) {
  if (!value) return 0;
  const match = String(value).trim().match(/^(\d+)([KMG]B?)?$/i);
  if (!match) return 0;
  const amount = Number.parseInt(match[1], 10);
  const unit = (match[2] ?? "MB").toUpperCase();
  if (unit.startsWith("G")) return amount * 1024;
  if (unit.startsWith("K")) return amount / 1024;
  return amount;
}

function matchFirst(text, pattern) {
  const match = text.match(pattern);
  return match ? unquote(match[1]) : undefined;
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

function parseArgs(argv) {
  const profileIndex = argv.indexOf("--profile");
  const outIndex = argv.indexOf("--out");
  return {
    profilePath: profileIndex === -1 ? undefined : argv[profileIndex + 1],
    outPath: outIndex === -1 ? undefined : argv[outIndex + 1],
    allowFail: argv.includes("--allow-fail"),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (!args.profilePath) {
      throw new Error("usage: node tools/pgbouncer-perf-profile-audit.mjs --profile <profile-json> [--out <report-json>] [--allow-fail]");
    }
    const report = auditPgbouncerPerfProfile(loadJSON(args.profilePath));
    if (args.outPath) {
      fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
      fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(formatPgbouncerPerfProfileAudit(report));
    process.exit(report.readiness === "READY" || args.allowFail ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
