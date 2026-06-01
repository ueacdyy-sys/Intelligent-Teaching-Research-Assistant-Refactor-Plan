import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/conversation-transport-profile-decision.current.json";
const dbAcquireBottleneckP99Ms = 10;

export const defaultTransportReports = [
  {
    path: "reports/conversation-write-http-benchmark.direct16-concurrency5800-multi16-pool1-client362-batched64-delay0.json",
    role: "low-tail-capped",
  },
  {
    path: "reports/conversation-write-http-benchmark.direct16-concurrency5800-multi16-pool1-client-unlimited-batched64-delay0.json",
    role: "low-tail-unlimited",
  },
  {
    path: "reports/conversation-write-http-benchmark.direct16-concurrency6200-multi16-pool1-client-unlimited-batched64-delay0.json",
    role: "edge-unlimited",
  },
  {
    path: "reports/conversation-write-http-benchmark.direct16-concurrency6200-multi16-pool1-client388-batched64-delay0.json",
    role: "edge-capped",
  },
  {
    path: "reports/conversation-write-http-benchmark.direct16-concurrency6400-multi16-pool1-client400-batched64-delay0.json",
    role: "edge-capped-confirmation",
  },
];

export function auditConversationTransportProfileDecision(inputs) {
  const transportReports = inputs.transportReports ?? defaultTransportReports;
  const parsedReports = parseReports(inputs.reports ?? {});
  const comparedReports = transportReports
    .map((entry) => summarizeReport(entry, parsedReports[entry.path]))
    .filter((entry) => entry.present && entry.parseable);
  const findings = [];

  addFinding(findings, {
    id: "sources.present",
    passed: transportReports.every((entry) => parsedReports[entry.path]?.present === true),
    actual: summarizePresence(transportReports, parsedReports),
    expected: "all configured transport profile reports are present",
    remediation: "Restore or regenerate the missing direct16 transport benchmark reports before auditing the decision.",
  });
  addFinding(findings, {
    id: "sources.parseable",
    passed: transportReports.every((entry) => parsedReports[entry.path]?.parseable === true),
    actual: summarizeParse(transportReports, parsedReports),
    expected: "all configured transport profile reports are valid JSON",
    remediation: "Transport profile decision evidence must be machine-readable benchmark JSON.",
  });
  addFinding(findings, {
    id: "metrics.required",
    passed: comparedReports.every(hasRequiredMetrics),
    actual: summarizeMetricPresence(comparedReports),
    expected: "status, concurrency, maxConnsPerHost, p99, gapP99, db.acquireP99, and errors",
    remediation: "Use benchmark reports with latency, transport, Server-Timing, and error metrics.",
  });
  addFinding(findings, {
    id: "database.acquire_not_bottleneck",
    passed: comparedReports.every((entry) => entry.dbAcquireP99Ms <= dbAcquireBottleneckP99Ms),
    actual: comparedReports.map((entry) => `${entry.label}:${entry.dbAcquireP99Ms}`).join(";"),
    expected: `db.acquire.p99_ms<=${dbAcquireBottleneckP99Ms}`,
    remediation: "Investigate PostgreSQL or PgBouncer acquisition before selecting a transport profile.",
  });

  const databaseBottleneck = comparedReports.some((entry) => entry.dbAcquireP99Ms > dbAcquireBottleneckP99Ms);
  const lowTail = selectLowTailDecision(comparedReports, databaseBottleneck);
  const edgeStability = selectEdgeStabilityDecision(comparedReports, databaseBottleneck);
  const negativeTransportProbes = comparedReports.filter((entry) => isNegativeTransportProbe(entry));
  const edgeReportsConfigured = comparedReports.some((entry) => entry.role.startsWith("edge"));

  addFinding(findings, {
    id: "decision.low_tail_selected",
    passed: Boolean(lowTail.selected),
    actual: lowTail.selected?.label ?? "none",
    expected: "one zero-error low-tail transport profile selected",
    remediation: "Keep low-tail transport undecided until a zero-error same-concurrency comparison exists.",
  });
  addFinding(findings, {
    id: "decision.edge_guard_selected",
    passed: !edgeReportsConfigured || Boolean(edgeStability.selected),
    actual: edgeStability.selected?.label ?? "none",
    expected: "one zero-error edge-stability guard selected",
    remediation: "Keep edge transport undecided until a zero-error capped or otherwise stable boundary profile exists.",
  });
  addFinding(findings, {
    id: "negative.socket_probe_recorded",
    passed: !edgeReportsConfigured ||
      negativeTransportProbes.some((entry) => entry.maxConnsPerHost === 0 && /socket|buffer|bind/i.test(entry.firstError ?? "")),
    actual: negativeTransportProbes.map((entry) => `${entry.label}:${entry.firstError ?? "error"}`).join(";"),
    expected: "failed unlimited socket or buffer probe is recorded",
    remediation: "Retain the failed unlimited edge probe so lower latency does not hide socket instability.",
  });

  return {
    generatedAt: new Date().toISOString(),
    readiness: findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION",
    workloadType: "CONFIG_PROFILE",
    databaseBottleneck,
    decisions: {
      lowTail,
      edgeStability,
    },
    comparedReports,
    negativeTransportProbes,
    recommendedNextAction: recommendedNextAction(databaseBottleneck, lowTail, edgeStability),
    rationale: buildRationale(databaseBottleneck, lowTail, edgeStability, negativeTransportProbes),
    findings,
    sourceReferences: [
      "docs/sdd/0126-conversation-client-trace-diagnostics.md",
      "docs/sdd/0133-conversation-client-trace-attribution-audit.md",
      "docs/sdd/0134-conversation-transport-profile-decision-audit.md",
    ],
  };
}

export function formatConversationTransportProfileDecisionAudit(report) {
  const lines = [
    `Conversation transport profile decision: ${report.readiness}`,
    "",
    `Low-tail recommendation: ${report.decisions.lowTail.recommendation}`,
    `Low-tail selected: ${report.decisions.lowTail.selected?.sourceReportPath ?? "none"}`,
    `Edge recommendation: ${report.decisions.edgeStability.recommendation}`,
    `Edge selected: ${report.decisions.edgeStability.selected?.sourceReportPath ?? "none"}`,
    "",
    "Compared reports:",
  ];
  for (const entry of report.comparedReports) {
    lines.push(
      `- ${entry.label} ${entry.status} concurrency=${entry.concurrency} maxConnsPerHost=${entry.maxConnsPerHost} p99=${entry.p99Ms}ms errors=${entry.errors}`,
    );
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

function parseReports(reports) {
  return Object.fromEntries(Object.entries(reports).map(([reportPath, text]) => {
    if (typeof text !== "string" || text.trim().length === 0) {
      return [reportPath, { present: false, parseable: false }];
    }
    try {
      return [reportPath, { present: true, parseable: true, value: JSON.parse(text) }];
    } catch (error) {
      return [reportPath, { present: true, parseable: false, error: error.message }];
    }
  }));
}

function summarizeReport(source, parsed) {
  if (!parsed?.present) {
    return { sourceReportPath: source.path, role: source.role, present: false, parseable: false };
  }
  if (!parsed.parseable) {
    return { sourceReportPath: source.path, role: source.role, present: true, parseable: false, parseError: parsed.error };
  }
  const report = parsed.value;
  const phase = report.phases?.createConversation ?? {};
  const maxConnsPerHost = numberOrNull(report.transportProfile?.maxConnsPerHost);
  const concurrency = numberOrNull(report.concurrency);
  return {
    sourceReportPath: source.path,
    role: source.role,
    label: `${source.role}:c${concurrency}:max${maxConnsPerHost}`,
    present: true,
    parseable: true,
    status: report.status ?? null,
    passed: report.status === "PASSED",
    gatewayCount: numberOrNull(report.gatewayCount ?? report.gatewayWorkerCount),
    concurrency,
    operations: numberOrNull(report.operations ?? phase.operations),
    maxConnsPerHost,
    warmConnectionsPerHost: numberOrNull(report.transportProfile?.warmConnectionsPerHost),
    warmConnectionsTotal: numberOrNull(report.transportProfile?.warmConnectionsTotal),
    errors: numberOrZero(phase.errors),
    firstError: typeof phase.firstError === "string" ? phase.firstError : null,
    rps: numberOrNull(phase.rps),
    p95Ms: numberOrNull(phase.latencyMs?.p95),
    p99Ms: numberOrNull(phase.latencyMs?.p99),
    serverP99Ms: numberOrNull(phase.serverTimingMs?.p99),
    clientServerGapP99Ms: numberOrNull(phase.clientServerGapMs?.p99),
    dbAcquireP99Ms: numberOrNull(phase.serverTimingBreakdownMs?.["db.acquire"]?.p99),
    dbInsertP99Ms: numberOrNull(phase.serverTimingBreakdownMs?.["db.insert"]?.p99),
  };
}

function hasRequiredMetrics(entry) {
  return [
    entry.status,
    entry.concurrency,
    entry.maxConnsPerHost,
    entry.p99Ms,
    entry.clientServerGapP99Ms,
    entry.dbAcquireP99Ms,
    entry.errors,
  ].every((value) => value !== null && value !== undefined);
}

function selectLowTailDecision(entries, databaseBottleneck) {
  if (databaseBottleneck) return { recommendation: "INVESTIGATE_DATABASE_ACQUIRE", selected: null };
  const lowTailEntries = sameConcurrencyGroup(entries.filter((entry) => entry.role.startsWith("low-tail")));
  const selected = selectBestZeroError(lowTailEntries);
  return {
    recommendation: selected?.maxConnsPerHost === 0 ? "USE_UNLIMITED_TRANSPORT" : selected ? "USE_CAPPED_TRANSPORT" : "NO_LOW_TAIL_PROMOTION",
    selected,
    candidates: lowTailEntries,
  };
}

function selectEdgeStabilityDecision(entries, databaseBottleneck) {
  if (databaseBottleneck) return { recommendation: "INVESTIGATE_DATABASE_ACQUIRE", selected: null };
  const edgeEntries = entries.filter((entry) => entry.role.startsWith("edge"));
  const selected = selectBestZeroError(edgeEntries);
  return {
    recommendation: selected?.maxConnsPerHost === 0 ? "UNLIMITED_EDGE_REQUIRES_MORE_EVIDENCE" : selected ? "KEEP_CAPPED_EDGE_GUARD" : "NO_EDGE_GUARD",
    selected,
    candidates: edgeEntries,
  };
}

function sameConcurrencyGroup(entries) {
  const counts = new Map();
  for (const entry of entries) counts.set(entry.concurrency, (counts.get(entry.concurrency) ?? 0) + 1);
  const shared = [...counts.entries()].find(([, count]) => count > 1)?.[0];
  return shared === undefined ? entries : entries.filter((entry) => entry.concurrency === shared);
}

function selectBestZeroError(entries) {
  return [...entries]
    .filter((entry) => entry.passed && entry.errors === 0)
    .sort((left, right) => compareNullableNumber(left.p99Ms, right.p99Ms) || compareNullableNumber(right.concurrency, left.concurrency))
    .at(0) ?? null;
}

function isNegativeTransportProbe(entry) {
  return !entry.passed || entry.errors > 0;
}

function recommendedNextAction(databaseBottleneck, lowTail, edgeStability) {
  if (databaseBottleneck) return "Profile database acquisition before changing client transport limits.";
  if (lowTail.recommendation === "USE_UNLIMITED_TRANSPORT" && edgeStability.recommendation === "KEEP_CAPPED_EDGE_GUARD") {
    return "Use unlimited transport for the 5800 low-tail claim, keep capped transport as the edge-stability guard, then test OS socket or WSL load generation before promoting unlimited above 5800.";
  }
  return "Keep transport changes evidence-gated by same-concurrency zero-error comparisons.";
}

function buildRationale(databaseBottleneck, lowTail, edgeStability, negativeProbes) {
  if (databaseBottleneck) return ["At least one transport comparison has db.acquire P99 above the attribution threshold."];
  const lines = [];
  if (lowTail.selected) {
    lines.push(`${lowTail.selected.label} has the best zero-error low-tail P99 at ${lowTail.selected.p99Ms}ms.`);
  }
  if (edgeStability.selected) {
    lines.push(`${edgeStability.selected.label} is the selected zero-error edge guard at ${edgeStability.selected.p99Ms}ms P99.`);
  }
  if (negativeProbes.length > 0) {
    lines.push(`Negative transport probes retained: ${negativeProbes.map((entry) => entry.label).join(", ")}.`);
  }
  return lines;
}

function compareNullableNumber(left, right) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function addFinding(findings, finding) {
  findings.push({ ...finding, passed: Boolean(finding.passed) });
}

function summarizePresence(entries, parsedReports) {
  return entries.map((entry) => `${entry.path}:${parsedReports[entry.path]?.present === true ? "present" : "missing"}`).join(";");
}

function summarizeParse(entries, parsedReports) {
  return entries.map((entry) => `${entry.path}:${parsedReports[entry.path]?.parseable === true ? "parseable" : "invalid"}`).join(";");
}

function summarizeMetricPresence(entries) {
  return entries.map((entry) => `${entry.label}:${hasRequiredMetrics(entry) ? "complete" : "missing"}`).join(";");
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function stringifyScalar(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function readReports(root, entries) {
  return Object.fromEntries(entries.map((entry) => {
    const absolute = path.join(root, entry.path);
    return [entry.path, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""];
  }));
}

function writeReport(root, reportPath, report) {
  const absolute = path.join(root, reportPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  return {
    out: outIndex === -1 ? defaultOutPath : argv[outIndex + 1],
  };
}

async function main() {
  const root = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const report = auditConversationTransportProfileDecision({
    reports: readReports(root, defaultTransportReports),
  });
  writeReport(root, args.out, report);
  console.log(formatConversationTransportProfileDecisionAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
