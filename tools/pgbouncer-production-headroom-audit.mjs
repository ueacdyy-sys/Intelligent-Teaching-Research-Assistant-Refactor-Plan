import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { evaluateConnectionBudget } from "./connection-budget.mjs";

const defaultProfilePath = "contracts/config/pgbouncer-production-headroom.profile.json";
const defaultOutPath = "reports/pgbouncer-production-headroom.current.json";

export function auditPgbouncerProductionHeadroomProfile(inputs) {
  const profile = inputs.profile ?? {};
  const diagnostics = inputs.crossModuleDiagnostics ?? {};
  const connectionBudget = inputs.connectionBudget ?? {};
  const budget = safeEvaluateConnectionBudget(connectionBudget);
  const pgbouncer = profile.pgbouncer ?? {};
  const policy = profile.policy ?? {};
  const minimumHeadroomRatio = numberOrNull(policy.minimumHeadroomRatio) ?? 0.2;
  const currentHotPathPoolTotal = numberOrNull(diagnostics.databaseTopology?.hotPathPool?.totalMaxConns);
  const currentPgbouncerMaxDbConnections = numberOrNull(diagnostics.databaseTopology?.pgbouncer?.maxDbConnections);
  const currentHeadroom = numberOrNull(diagnostics.databaseTopology?.hotPathPool?.pgbouncerHeadroom);
  const candidateMaxDbConnections = numberOrNull(pgbouncer.maxDbConnections);
  const candidateMinimumHeadroom = Number.isFinite(candidateMaxDbConnections)
    ? Math.ceil(candidateMaxDbConnections * minimumHeadroomRatio)
    : null;
  const sourceHotPathHeadroom = Number.isFinite(candidateMaxDbConnections) && Number.isFinite(currentHotPathPoolTotal)
    ? candidateMaxDbConnections - currentHotPathPoolTotal
    : null;
  const plannedBudgetHeadroom = Number.isFinite(candidateMaxDbConnections) && Number.isFinite(budget.result?.totalPlannedConnections)
    ? candidateMaxDbConnections - budget.result.totalPlannedConnections
    : null;
  const findings = [];

  addFinding(findings, {
    id: "sources.cross_module_diagnostics_ready",
    passed: diagnostics.readiness === "READY",
    actual: diagnostics.readiness ?? "missing",
    expected: "READY",
    remediation: "Regenerate cross-module DB/queue diagnostics before reviewing a production PgBouncer headroom profile.",
  });
  addFinding(findings, {
    id: "sources.connection_budget_passed",
    passed: budget.result?.passed === true,
    actual: budget.result ? `planned=${budget.result.totalPlannedConnections};safe=${budget.result.safeLimit}` : budget.error,
    expected: "connection budget passes",
    remediation: "Fix the proposed PgBouncer transaction connection budget before using it as a production headroom profile input.",
  });
  addFinding(findings, {
    id: "pgbouncer.transaction_pooling",
    passed: pgbouncer.poolMode === "transaction",
    actual: pgbouncer.poolMode ?? "missing",
    expected: "transaction",
    remediation: "Keep PgBouncer in transaction pooling mode for the high-concurrency profile.",
  });
  addFinding(findings, {
    id: "pgbouncer.pool_sum_within_cap",
    passed: Number.isFinite(candidateMaxDbConnections) &&
      Number.isFinite(pgbouncer.defaultPoolSize) &&
      Number.isFinite(pgbouncer.reservePoolSize) &&
      pgbouncer.defaultPoolSize + pgbouncer.reservePoolSize <= candidateMaxDbConnections,
    actual: `default=${pgbouncer.defaultPoolSize};reserve=${pgbouncer.reservePoolSize};maxDb=${candidateMaxDbConnections}`,
    expected: "default_pool_size + reserve_pool_size <= max_db_connections",
    remediation: "Keep default and reserve server pools inside the PgBouncer max_db_connections cap.",
  });
  addFinding(findings, {
    id: "pgbouncer.current_hot_path_headroom",
    passed: Number.isFinite(sourceHotPathHeadroom) &&
      Number.isFinite(candidateMinimumHeadroom) &&
      sourceHotPathHeadroom >= candidateMinimumHeadroom,
    actual: `sourceHotPath=${currentHotPathPoolTotal};candidateMax=${candidateMaxDbConnections};headroom=${sourceHotPathHeadroom};minimum=${candidateMinimumHeadroom}`,
    expected: `candidate headroom >= ${Math.round(minimumHeadroomRatio * 100)}% of max_db_connections for current hot-path source evidence`,
    remediation: "Raise the candidate PgBouncer max_db_connections or reduce per-service hot-path pools before root SLO promotion review.",
  });
  addFinding(findings, {
    id: "pgbouncer.planned_budget_headroom",
    passed: Number.isFinite(plannedBudgetHeadroom) &&
      Number.isFinite(candidateMinimumHeadroom) &&
      plannedBudgetHeadroom >= candidateMinimumHeadroom,
    actual: `planned=${budget.result?.totalPlannedConnections};candidateMax=${candidateMaxDbConnections};headroom=${plannedBudgetHeadroom};minimum=${candidateMinimumHeadroom}`,
    expected: `candidate headroom >= ${Math.round(minimumHeadroomRatio * 100)}% of max_db_connections for planned cross-service budget`,
    remediation: "Keep the explicit planned connection budget below the candidate PgBouncer cap with root SLO headroom.",
  });
  addFinding(findings, {
    id: "postgres.safe_budget_ceiling",
    passed: Number.isFinite(candidateMaxDbConnections) &&
      Number.isFinite(budget.result?.safeLimit) &&
      candidateMaxDbConnections <= budget.result.safeLimit,
    actual: `candidateMax=${candidateMaxDbConnections};safeLimit=${budget.result?.safeLimit}`,
    expected: "candidate PgBouncer max_db_connections stays within the PostgreSQL safe budget",
    remediation: "Do not raise PgBouncer server connections above the explicit PostgreSQL safe budget without a new database capacity profile.",
  });
  addFinding(findings, {
    id: "pgbouncer.improves_current_headroom",
    passed: Number.isFinite(sourceHotPathHeadroom) &&
      Number.isFinite(currentHeadroom) &&
      sourceHotPathHeadroom > currentHeadroom,
    actual: `currentMax=${currentPgbouncerMaxDbConnections};currentHeadroom=${currentHeadroom};candidateMax=${candidateMaxDbConnections};candidateHeadroom=${sourceHotPathHeadroom}`,
    expected: "candidate profile increases PgBouncer headroom over current source evidence",
    remediation: "Choose a candidate profile that materially improves the current PgBouncer headroom bottleneck.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: new Date().toISOString(),
    readiness,
    workloadType: "PGBOUNCER_PRODUCTION_HEADROOM_PROFILE",
    profileId: profile.profileId ?? null,
    policy: {
      minimumHeadroomRatio,
    },
    current: {
      pgbouncerMaxDbConnections: currentPgbouncerMaxDbConnections,
      hotPathPoolTotal: currentHotPathPoolTotal,
      headroom: currentHeadroom,
    },
    candidate: {
      poolMode: pgbouncer.poolMode ?? null,
      maxClientConn: numberOrNull(pgbouncer.maxClientConn),
      defaultPoolSize: numberOrNull(pgbouncer.defaultPoolSize),
      reservePoolSize: numberOrNull(pgbouncer.reservePoolSize),
      maxDbConnections: candidateMaxDbConnections,
      minimumHeadroom: candidateMinimumHeadroom,
      sourceHotPathHeadroom,
      plannedBudgetHeadroom,
    },
    connectionBudget: budget.result ? {
      passed: budget.result.passed,
      totalPlannedConnections: budget.result.totalPlannedConnections,
      safeLimit: budget.result.safeLimit,
      hardLimit: budget.result.hardLimit,
      maxConnections: budget.result.maxConnections,
    } : {
      passed: false,
      error: budget.error,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Apply this candidate PgBouncer headroom profile to the performance runtime and rerun sustained mixed workload scale-up before root SLO promotion."
      : "Fix the candidate PgBouncer headroom profile before using it to remediate the root SLO database-headroom blocker.",
  };
}

export function formatPgbouncerProductionHeadroomProfileAudit(report) {
  const lines = [
    `PgBouncer production headroom profile: ${report.readiness}`,
    `Profile: ${report.profileId ?? "unknown"}`,
    `Current headroom: ${report.current.headroom}/${report.current.pgbouncerMaxDbConnections}`,
    `Candidate headroom: ${report.candidate.sourceHotPathHeadroom}/${report.candidate.maxDbConnections}`,
    "",
    "Findings:",
  ];
  for (const finding of report.findings) {
    lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function safeEvaluateConnectionBudget(config) {
  try {
    return { result: evaluateConnectionBudget(config), error: null };
  } catch (error) {
    return { result: null, error: error.message };
  }
}

function loadJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function loadCurrentInputs(root, profilePath) {
  const profile = loadJson(root, profilePath);
  return {
    profile,
    crossModuleDiagnostics: loadJson(root, profile.sourceReports.crossModuleDiagnostics),
    connectionBudget: loadJson(root, profile.sourceConfigs.connectionBudget),
  };
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

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return String(value);
}

function writeReport(root, reportPath, report) {
  const absolute = path.join(root, reportPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

function parseArgs(argv) {
  const profileIndex = argv.indexOf("--profile");
  const outIndex = argv.indexOf("--out");
  return {
    profile: profileIndex === -1 ? defaultProfilePath : argv[profileIndex + 1],
    out: outIndex === -1 ? defaultOutPath : argv[outIndex + 1],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = auditPgbouncerProductionHeadroomProfile(loadCurrentInputs(root, args.profile));
    writeReport(root, args.out, report);
    console.log(formatPgbouncerProductionHeadroomProfileAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
