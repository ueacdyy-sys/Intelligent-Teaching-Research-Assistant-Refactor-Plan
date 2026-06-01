import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const defaultTraceReportPath =
  "reports/conversation-write-http-benchmark.direct16-concurrency5800-multi16-pool1-client362-batched64-delay0-client-trace.json";

const defaultOutPath = "reports/conversation-client-trace-attribution.current.json";
const dbAcquireBottleneckP99Ms = 10;
const significantGapRatio = 0.4;

const requiredTraceMetrics = [
  "client.transport_wait",
  "client.first_byte_app_gap",
  "client.response_body_read",
  "client.request_write",
  "client.request_prepare",
  "client.first_response_byte_wait",
  "client.round_trip",
];

const attributionLabels = {
  "client.transport_wait": "CLIENT_TRANSPORT_WAIT",
  "client.first_byte_app_gap": "PRE_HANDLER_OR_LISTENER_GAP",
  "client.response_body_read": "RESPONSE_BODY_READ_BACKPRESSURE",
  "client.request_write": "REQUEST_WRITE_BACKPRESSURE",
  "client.request_prepare": "CLIENT_REQUEST_PREPARE_OVERHEAD",
};

export function auditConversationClientTraceAttribution(inputs) {
  const sourceReportPath = inputs.sourceReportPath ?? defaultTraceReportPath;
  const parsed = parseReport(inputs.reports?.[sourceReportPath]);
  const findings = [];

  addFinding(findings, {
    id: "source.present",
    passed: parsed.present,
    actual: parsed.present ? "present" : "missing",
    expected: "source trace report is present",
    remediation: "Restore or regenerate the client-trace benchmark report before auditing attribution.",
  });
  addFinding(findings, {
    id: "source.parseable",
    passed: parsed.parseable,
    actual: parsed.parseable ? "parseable" : parsed.error ?? "missing",
    expected: "source trace report is valid JSON",
    remediation: "Client trace attribution evidence must be a machine-readable benchmark JSON report.",
  });

  const source = parsed.value ?? {};
  const phase = source.phases?.createConversation ?? {};
  const metrics = summarizeTraceReport(source, phase);
  const missingTraceMetrics = requiredTraceMetrics.filter((metric) => metrics.traceComponents[metric] === undefined);

  addFinding(findings, {
    id: "report.passed_without_errors",
    passed: source.status === "PASSED" && metrics.errors === 0,
    actual: `status=${source.status ?? "missing"} errors=${metrics.errors ?? "missing"}`,
    expected: "status=PASSED and errors=0",
    remediation: "Use a zero-error diagnostic trace report before attributing steady-state latency.",
  });
  addFinding(findings, {
    id: "gap.client_server_present",
    passed: isFiniteNumber(metrics.clientServerGapP99Ms) && metrics.clientServerGapSamples > 0,
    actual: `p99=${metrics.clientServerGapP99Ms ?? "missing"} samples=${metrics.clientServerGapSamples ?? "missing"}`,
    expected: "clientServerGapMs.p99 and positive clientServerGapSamples",
    remediation: "Regenerate the report with SDD 0121 client/server gap support.",
  });
  addFinding(findings, {
    id: "server_timing.required_metrics",
    passed: isFiniteNumber(metrics.serverAppP99Ms) && isFiniteNumber(metrics.dbAcquireP99Ms),
    actual: `app=${metrics.serverAppP99Ms ?? "missing"} db.acquire=${metrics.dbAcquireP99Ms ?? "missing"}`,
    expected: "serverTimingBreakdownMs.app and serverTimingBreakdownMs.db.acquire",
    remediation: "Regenerate the report with Server-Timing app and database breakdown metrics.",
  });
  addFinding(findings, {
    id: "trace.required_metrics",
    passed: missingTraceMetrics.length === 0,
    actual: missingTraceMetrics.length === 0 ? "complete" : `missing=${missingTraceMetrics.join(",")}`,
    expected: requiredTraceMetrics.join(","),
    remediation: "Run the conversation benchmark with --client-trace true before auditing trace attribution.",
  });
  addFinding(findings, {
    id: "trace.sample_coverage",
    passed: traceSampleCoverageMatches(metrics),
    actual: summarizeTraceCoverage(metrics),
    expected: "required trace metrics have a sample count equal to operations",
    remediation: "Use a complete trace diagnostic report so percentiles are comparable across trace components.",
  });

  const databaseBottleneck = metrics.dbAcquireP99Ms > dbAcquireBottleneckP99Ms;
  const attribution = classifyAttribution(metrics, databaseBottleneck);
  addFinding(findings, {
    id: "database.acquire_not_bottleneck",
    passed: !databaseBottleneck,
    actual: `${metrics.dbAcquireP99Ms ?? "missing"}ms`,
    expected: `<=${dbAcquireBottleneckP99Ms}ms`,
    remediation: "Fix or profile PostgreSQL/PgBouncer acquisition before assigning the gap to transport or listener scheduling.",
  });
  addFinding(findings, {
    id: "attribution.non_database_gap_identified",
    passed: !databaseBottleneck && Boolean(attribution.primary),
    actual: attribution.primary ?? "none",
    expected: "non-database primary attribution",
    remediation: "Regenerate trace evidence or investigate database acquisition before selecting the next performance slice.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: new Date().toISOString(),
    readiness,
    sourceReportPath,
    benchmarkKind: source.benchmarkKind ?? null,
    workloadType: "DIAGNOSTIC_PROFILE",
    traceEvidencePresent: missingTraceMetrics.length === 0,
    databaseBottleneck,
    attribution,
    metrics,
    recommendedNextAction: recommendedNextAction(attribution, databaseBottleneck),
    rationale: buildRationale(metrics, attribution, databaseBottleneck),
    findings,
    sourceReferences: [
      "docs/sdd/0121-conversation-client-server-gap.md",
      "docs/sdd/0126-conversation-client-trace-diagnostics.md",
      "docs/sdd/0132-conversation-fanout-decision-audit.md",
      "docs/sdd/0133-conversation-client-trace-attribution-audit.md",
      "reports/2026-06-01-p44-conversation-client-trace-diagnostics.md",
    ],
  };
}

export function formatConversationClientTraceAttributionAudit(report) {
  const lines = [
    `Conversation client trace attribution: ${report.readiness}`,
    "",
    `Source: ${report.sourceReportPath}`,
    `Primary attribution: ${report.attribution.primary ?? "none"}`,
    `Secondary attribution: ${report.attribution.secondary ?? "none"}`,
    `Recommended next action: ${report.recommendedNextAction}`,
    "",
    "Trace component P99:",
  ];
  for (const component of report.attribution.components) {
    lines.push(`- ${component.metric}: p99=${component.p99Ms}ms ratio=${component.gapRatio}`);
  }
  lines.push("", "Findings:");
  for (const finding of report.findings) {
    lines.push(
      `- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`,
    );
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  return lines.join("\n");
}

function parseReport(text) {
  if (typeof text !== "string" || text.trim().length === 0) {
    return { present: false, parseable: false };
  }
  try {
    return { present: true, parseable: true, value: JSON.parse(text) };
  } catch (error) {
    return { present: true, parseable: false, error: error.message };
  }
}

function summarizeTraceReport(source, phase) {
  const traceComponents = {};
  for (const metric of requiredTraceMetrics) {
    const p99 = phase.clientTraceBreakdownMs?.[metric]?.p99;
    if (isFiniteNumber(p99)) traceComponents[metric] = p99;
  }
  return {
    status: source.status ?? null,
    gatewayCount: numberOrNull(source.gatewayCount),
    concurrency: numberOrNull(source.concurrency),
    operations: numberOrNull(source.operations ?? phase.operations),
    errors: numberOrNull(phase.errors),
    rps: numberOrNull(phase.rps),
    latencyP99Ms: numberOrNull(phase.latencyMs?.p99),
    serverAppP99Ms: numberOrNull(phase.serverTimingBreakdownMs?.app?.p99 ?? phase.serverTimingMs?.p99),
    clientServerGapP99Ms: numberOrNull(phase.clientServerGapMs?.p99),
    clientServerGapSamples: numberOrNull(phase.clientServerGapSamples),
    dbAcquireP99Ms: numberOrNull(phase.serverTimingBreakdownMs?.["db.acquire"]?.p99),
    dbInsertP99Ms: numberOrNull(phase.serverTimingBreakdownMs?.["db.insert"]?.p99),
    transportProfile: source.transportProfile ?? {},
    traceComponents,
    traceSamples: phase.clientTraceBreakdownSamples ?? {},
  };
}

function traceSampleCoverageMatches(metrics) {
  if (!isFiniteNumber(metrics.operations)) return false;
  return requiredTraceMetrics.every((metric) => metrics.traceSamples[metric] === metrics.operations);
}

function summarizeTraceCoverage(metrics) {
  return requiredTraceMetrics
    .map((metric) => `${metric}=${metrics.traceSamples[metric] ?? "missing"}`)
    .join(";");
}

function classifyAttribution(metrics, databaseBottleneck) {
  if (databaseBottleneck) {
    return {
      primary: "DATABASE_ACQUIRE_WAIT",
      secondary: null,
      components: traceComponentSummaries(metrics),
    };
  }
  const components = traceComponentSummaries(metrics)
    .filter((component) => attributionLabels[component.metric])
    .sort((left, right) => right.p99Ms - left.p99Ms);
  const primary = components[0];
  const secondary = components.find(
    (component) => component.metric !== primary?.metric && component.gapRatio >= significantGapRatio,
  );
  return {
    primary: primary ? attributionLabels[primary.metric] : null,
    secondary: secondary ? attributionLabels[secondary.metric] : null,
    components,
  };
}

function traceComponentSummaries(metrics) {
  const gap = metrics.clientServerGapP99Ms;
  return Object.entries(metrics.traceComponents).map(([metric, p99Ms]) => ({
    metric,
    p99Ms,
    gapRatio: isFiniteNumber(gap) && gap > 0 ? roundRatio(p99Ms / gap) : null,
  }));
}

function recommendedNextAction(attribution, databaseBottleneck) {
  if (databaseBottleneck) {
    return "Profile PostgreSQL and PgBouncer acquisition before changing transport or worker fanout.";
  }
  if (attribution.primary === "CLIENT_TRANSPORT_WAIT") {
    return "Test transport and listener scheduling changes before increasing gateway worker or database pool budgets.";
  }
  if (attribution.primary === "PRE_HANDLER_OR_LISTENER_GAP") {
    return "Instrument ingress, accept queue, and pre-handler runtime scheduling before touching the database path.";
  }
  if (attribution.primary === "RESPONSE_BODY_READ_BACKPRESSURE") {
    return "Investigate response drain and client read backpressure before changing server write internals.";
  }
  if (attribution.primary === "REQUEST_WRITE_BACKPRESSURE") {
    return "Investigate request write and client-side socket pressure before changing database settings.";
  }
  return "Regenerate client trace evidence before choosing the next performance optimization.";
}

function buildRationale(metrics, attribution, databaseBottleneck) {
  if (databaseBottleneck) {
    return [
      `db.acquire P99 is ${metrics.dbAcquireP99Ms}ms, above the ${dbAcquireBottleneckP99Ms}ms attribution threshold.`,
    ];
  }
  const primary = attribution.components[0];
  const secondary = attribution.components[1];
  return [
    `Client/server gap P99 is ${metrics.clientServerGapP99Ms}ms while app Server-Timing P99 is ${metrics.serverAppP99Ms}ms.`,
    `db.acquire P99 is ${metrics.dbAcquireP99Ms}ms, so database acquisition is not the observed limiter.`,
    primary ? `Largest trace component is ${primary.metric} at ${primary.p99Ms}ms P99.` : "No dominant trace component was available.",
    secondary ? `Second trace component is ${secondary.metric} at ${secondary.p99Ms}ms P99.` : "No significant secondary trace component was available.",
  ];
}

function addFinding(findings, finding) {
  findings.push({
    ...finding,
    passed: Boolean(finding.passed),
  });
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function roundRatio(value) {
  return Math.round(value * 1000) / 1000;
}

function stringifyScalar(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function readReports(root, sourceReportPath) {
  const absolute = path.join(root, sourceReportPath);
  return {
    [sourceReportPath]: fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : "",
  };
}

function writeReport(root, reportPath, report) {
  const absolute = path.join(root, reportPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  const reportIndex = argv.indexOf("--source-report");
  return {
    out: outIndex === -1 ? defaultOutPath : argv[outIndex + 1],
    sourceReportPath: reportIndex === -1 ? defaultTraceReportPath : argv[reportIndex + 1],
  };
}

async function main() {
  const root = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const report = auditConversationClientTraceAttribution({
    reports: readReports(root, args.sourceReportPath),
    sourceReportPath: args.sourceReportPath,
  });
  writeReport(root, args.out, report);
  console.log(formatConversationClientTraceAttributionAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
