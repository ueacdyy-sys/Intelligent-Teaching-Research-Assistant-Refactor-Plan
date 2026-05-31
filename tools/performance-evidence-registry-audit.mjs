import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REGISTRY_PATH = "contracts/ops/performance-evidence-registry.current.json";
const REQUIRED_SOURCE_REPORTS = [
  "reports/pgbouncer-perf-profile.current.json",
  "reports/identity-http-benchmark.current.json",
  "reports/identity-http-benchmark.concurrency360.json",
  "reports/identity-http-benchmark.concurrency640-multi2.json",
  "reports/identity-http-benchmark.concurrency704-multi2.json",
  "reports/identity-http-benchmark.concurrency768-multi3.json",
  "reports/identity-http-benchmark.concurrency832-multi3.json",
  "reports/identity-http-benchmark.concurrency1184-multi4.json",
  "reports/identity-http-benchmark.concurrency1200-multi4.json",
  "reports/identity-http-benchmark.concurrency1200-multi4-warm300.json",
  "reports/identity-http-benchmark.concurrency1200-multi4-ingress.json",
  "reports/identity-http-benchmark.concurrency2000-multi4-ingress10-warm200-fast-refresh.json",
  "reports/identity-http-benchmark.concurrency2600-multi4-ingress13-warm200.json",
  "reports/identity-http-benchmark.concurrency2800-multi4-ingress14-warm200.json",
  "reports/identity-http-benchmark.concurrency2800-multi6-ingress14-pool12-client150-upwarm34.json",
  "reports/identity-http-benchmark.concurrency3000-multi6-ingress15-pool12-client150-upwarm30.json",
  "reports/identity-http-benchmark.concurrency3000-multi6-ingress15-pool12-client150-upwarm30-safe-retry.json",
  "reports/identity-http-benchmark.concurrency3200-multi6-ingress16-pool12-client150-upwarm28.json",
  "reports/identity-http-benchmark.concurrency4000-multi6-ingress20-pool12-client150-upwarm22-docker-bench.json",
  "reports/identity-http-benchmark.concurrency4000-multi6-ingress20-pool12-client150-upwarm22-docker-bench-revoke-profile.json",
  "reports/identity-session-maintenance.prune-inactive-current.json",
  "reports/identity-http-benchmark.concurrency4000-multi6-ingress20-pool12-client150-upwarm22-clean-table-docker-bench.json",
  "reports/knowledge-retrieval-benchmark.current.json",
  "reports/ai-worker-runtime-dependency-profile.current.json",
  "reports/quality-gate.current.json",
];

export function auditPerformanceEvidenceRegistry(inputs) {
  const registry = inputs.registry ?? {};
  const reports = inputs.reports ?? {};
  const entries = Array.isArray(registry.entries) ? registry.entries : [];
  const parsedReports = parseReports(reports);
  const findings = [];

  addFinding(findings, {
    id: "registry.entries_present",
    passed: entries.length > 0,
    actual: `entries=${entries.length}`,
    expected: "entries>0",
    remediation: "Performance evidence registry must contain current evidence entries.",
  });

  addFinding(findings, {
    id: "registry.required_report_coverage",
    passed: hasAll(entries.map((entry) => entry.sourceReportPath), REQUIRED_SOURCE_REPORTS),
    actual: summarizeSourceReports(entries),
    expected: REQUIRED_SOURCE_REPORTS.join(","),
    remediation: "Register every current required performance or performance-adjacent report.",
  });

  addFinding(findings, {
    id: "sources.current_reports_present",
    passed: entries.every((entry) => hasReadableReport(reports, entry.sourceReportPath)),
    actual: summarizeReportPresence(entries, reports),
    expected: "every sourceReportPath is present and readable",
    remediation: "Generate or restore the current source report before citing it as performance evidence.",
  });

  addFinding(findings, {
    id: "sources.current_reports_parseable",
    passed: entries.every((entry) => parsedReports[entry.sourceReportPath]?.parsed === true),
    actual: summarizeReportParse(entries, parsedReports),
    expected: "every source report is valid JSON",
    remediation: "Performance evidence source reports must be machine-readable JSON.",
  });

  addFinding(findings, {
    id: "entries.core_fields",
    passed: entries.every(hasCoreFields),
    actual: summarizeCoreFields(entries),
    expected: "each entry has id, module, workload, command, report, runtime, status, and action",
    remediation: "Fill every registry entry with the operational context needed to interpret the evidence.",
  });

  addFinding(findings, {
    id: "entries.metric_summary",
    passed: entries.every(hasMetricSummary),
    actual: summarizeMetrics(entries),
    expected: "each entry has at least one named metric with interpretation",
    remediation: "Every performance evidence entry needs a metric summary or explicit contract-only metric.",
  });

  const databaseEntries = entries.filter((entry) => entry.databaseEvidence?.required === true);
  addFinding(findings, {
    id: "database.database_evidence_present",
    passed: databaseEntries.length > 0,
    actual: `databaseEntries=${databaseEntries.length}`,
    expected: "databaseEntries>0",
    remediation: "At least one current performance evidence entry must record database performance settings.",
  });

  addFinding(findings, {
    id: "database.postgres_settings",
    passed: databaseEntries.every(hasPostgresSettings),
    actual: summarizePostgresSettings(databaseEntries),
    expected: "database entries include PostgreSQL serviceName, maxConnections, and sharedBuffers",
    remediation: "Record PostgreSQL settings in database-backed performance evidence.",
  });

  addFinding(findings, {
    id: "database.pgbouncer_settings",
    passed: databaseEntries.every(hasPgbouncerSettings),
    actual: summarizePgbouncerSettings(databaseEntries),
    expected: "database entries include PgBouncer serviceName, poolMode, listenPort, and maxDbConnections",
    remediation: "Record PgBouncer settings in database-backed performance evidence.",
  });

  const nonDatabaseEntries = entries.filter((entry) => entry.databaseEvidence?.required === false);
  addFinding(findings, {
    id: "database.non_database_rationale",
    passed: nonDatabaseEntries.every((entry) => hasText(entry.databaseEvidence.notRequiredReason)),
    actual: summarizeNonDatabaseRationale(nonDatabaseEntries),
    expected: "non-database entries explain why PostgreSQL settings are not required",
    remediation: "Contract-only and dependency-only evidence must state why database settings do not apply.",
  });

  addFinding(findings, {
    id: "sources.status_matches_registry",
    passed: entries.every((entry) => sourceStatusMatches(entry, parsedReports[entry.sourceReportPath]?.value)),
    actual: summarizeSourceStatuses(entries, parsedReports),
    expected: "non-quality registry status matches source readiness; quality gate report is present",
    remediation: "Update the registry status when the underlying current report status changes.",
  });

  return {
    generatedAt: new Date().toISOString(),
    readiness: findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION",
    registryId: registry.registryId ?? null,
    evidenceCount: entries.length,
    sourceReports: entries.map((entry) => entry.sourceReportPath),
    findings,
  };
}

export function formatPerformanceEvidenceRegistryAudit(report) {
  const lines = [
    `Performance evidence registry: ${report.readiness}`,
    "",
    `Registry: ${report.registryId ?? "unknown"}`,
    `Evidence entries: ${report.evidenceCount}`,
    "",
    "Findings:",
  ];
  for (const finding of report.findings) {
    lines.push(
      `- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`,
    );
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  return lines.join("\n");
}

function parseReports(reports) {
  return Object.fromEntries(Object.entries(reports).map(([reportPath, text]) => {
    try {
      return [reportPath, { parsed: true, value: JSON.parse(text) }];
    } catch (error) {
      return [reportPath, { parsed: false, error: error.message }];
    }
  }));
}

function hasReadableReport(reports, reportPath) {
  return typeof reports[reportPath] === "string" && reports[reportPath].trim().length > 0;
}

function hasCoreFields(entry) {
  return [
    entry.evidenceId,
    entry.moduleSlice,
    entry.workloadType,
    entry.sourceCommand,
    entry.sourceReportPath,
    entry.status,
    entry.rollbackOrNextAction,
    entry.runtimeProfile?.name,
    entry.runtimeProfile?.executionEnvironment,
  ].every(hasText) &&
    typeof entry.runtimeProfile?.dockerRequiredForEvidence === "boolean" &&
    typeof entry.runtimeProfile?.includedInNpmTest === "boolean";
}

function hasMetricSummary(entry) {
  return Array.isArray(entry.metrics) &&
    entry.metrics.length > 0 &&
    entry.metrics.every((metric) => hasText(metric.name) && Object.hasOwn(metric, "value") && hasText(metric.interpretation));
}

function hasPostgresSettings(entry) {
  const postgres = entry.databaseEvidence?.postgres;
  return hasText(postgres?.serviceName) &&
    Number.isInteger(postgres?.maxConnections) &&
    postgres.maxConnections > 0 &&
    hasText(postgres?.sharedBuffers);
}

function hasPgbouncerSettings(entry) {
  const pgbouncer = entry.databaseEvidence?.pgbouncer;
  return hasText(pgbouncer?.serviceName) &&
    hasText(pgbouncer?.poolMode) &&
    Number.isInteger(pgbouncer?.listenPort) &&
    pgbouncer.listenPort > 0 &&
    Number.isInteger(pgbouncer?.maxDbConnections) &&
    pgbouncer.maxDbConnections > 0;
}

function sourceStatusMatches(entry, report) {
  if (!report || typeof report !== "object") return false;
  if (entry.workloadType === "QUALITY_GATE") return true;
  if (typeof report.status === "string") return entry.status === report.status;
  if (entry.workloadType === "HTTP_BENCHMARK") return false;
  if (typeof report.readiness === "string") return entry.status === report.readiness;
  if (typeof report.allPassed === "boolean") return entry.status === (report.allPassed ? "PASSED" : "FAILED");
  return true;
}

function hasAll(values, required) {
  return required.every((value) => values.includes(value));
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function summarizeSourceReports(entries) {
  if (entries.length === 0) return "none";
  return entries.map((entry) => entry.sourceReportPath ?? "missing").join(",");
}

function summarizeReportPresence(entries, reports) {
  if (entries.length === 0) return "none";
  return entries
    .map((entry) => `${entry.sourceReportPath}:${hasReadableReport(reports, entry.sourceReportPath) ? "present" : "missing"}`)
    .join(";");
}

function summarizeReportParse(entries, parsedReports) {
  if (entries.length === 0) return "none";
  return entries
    .map((entry) => `${entry.sourceReportPath}:${parsedReports[entry.sourceReportPath]?.parsed === true ? "json" : "invalid"}`)
    .join(";");
}

function summarizeCoreFields(entries) {
  if (entries.length === 0) return "none";
  return entries
    .map((entry) => `${entry.evidenceId ?? "missing"}:${hasCoreFields(entry) ? "complete" : "incomplete"}`)
    .join(";");
}

function summarizeMetrics(entries) {
  if (entries.length === 0) return "none";
  return entries
    .map((entry) => `${entry.evidenceId ?? "missing"}:metrics=${Array.isArray(entry.metrics) ? entry.metrics.length : 0}`)
    .join(";");
}

function summarizePostgresSettings(entries) {
  if (entries.length === 0) return "none";
  return entries
    .map((entry) => {
      const postgres = entry.databaseEvidence?.postgres;
      return `${entry.evidenceId}:${postgres?.serviceName ?? "missing"}:${postgres?.maxConnections ?? "missing"}:${postgres?.sharedBuffers ?? "missing"}`;
    })
    .join(";");
}

function summarizePgbouncerSettings(entries) {
  if (entries.length === 0) return "none";
  return entries
    .map((entry) => {
      const pgbouncer = entry.databaseEvidence?.pgbouncer;
      return `${entry.evidenceId}:${pgbouncer?.serviceName ?? "missing"}:${pgbouncer?.poolMode ?? "missing"}:${pgbouncer?.listenPort ?? "missing"}:${pgbouncer?.maxDbConnections ?? "missing"}`;
    })
    .join(";");
}

function summarizeNonDatabaseRationale(entries) {
  if (entries.length === 0) return "none";
  return entries
    .map((entry) => `${entry.evidenceId ?? "missing"}:${hasText(entry.databaseEvidence?.notRequiredReason) ? "present" : "missing"}`)
    .join(";");
}

function summarizeSourceStatuses(entries, parsedReports) {
  if (entries.length === 0) return "none";
  return entries
    .map((entry) => {
      const sourceStatus = sourceReportStatus(entry, parsedReports[entry.sourceReportPath]?.value);
      return `${entry.evidenceId ?? "missing"}:registry=${entry.status ?? "missing"}:source=${sourceStatus}`;
    })
    .join(";");
}

function sourceReportStatus(entry, report) {
  if (!report || typeof report !== "object") return "missing";
  if (entry.workloadType === "QUALITY_GATE") return "current_run_rollup";
  if (typeof report.status === "string") return report.status;
  if (entry.workloadType === "HTTP_BENCHMARK") return "missing_status";
  if (typeof report.readiness === "string") return report.readiness;
  if (typeof report.allPassed === "boolean") return report.allPassed ? "PASSED" : "FAILED";
  return "not_applicable";
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

function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return String(value);
}

function loadCurrentInputs(root) {
  const registry = JSON.parse(fs.readFileSync(path.join(root, REGISTRY_PATH), "utf8"));
  return {
    registry,
    reports: Object.fromEntries(
      registry.entries.map((entry) => [
        entry.sourceReportPath,
        fs.readFileSync(path.join(root, entry.sourceReportPath), "utf8"),
      ]),
    ),
  };
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  return {
    outPath: outIndex === -1 ? undefined : argv[outIndex + 1],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = auditPerformanceEvidenceRegistry(loadCurrentInputs(process.cwd()));
    if (args.outPath) {
      fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
      fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(formatPerformanceEvidenceRegistryAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
