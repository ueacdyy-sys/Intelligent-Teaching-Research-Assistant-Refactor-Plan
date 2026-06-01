import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultReportPath = "reports/conversation-fanout-decision.current.json";
const defaultBudgetPath = "contracts/config/connection-budget.proposed-pgbouncer-transaction.json";
const targetServiceName = "conversation-write-gateway-via-pgbouncer";
const dbAcquireBottleneckP99Ms = 10;

export const defaultCandidateReports = [
  {
    path: "reports/conversation-write-http-benchmark.wsl-direct16-concurrency30000-batched64.json",
    role: "baseline",
  },
  {
    path: "reports/conversation-write-http-benchmark.wsl-direct24-concurrency30000-batched64.json",
    role: "candidate",
  },
  {
    path: "reports/conversation-write-http-benchmark.wsl-direct32-concurrency30000-batched64.json",
    role: "candidate",
  },
];

export function auditConversationFanoutDecision(inputs) {
  const candidateReports = inputs.candidateReports ?? defaultCandidateReports;
  const parsedReports = parseReports(inputs.reports ?? {});
  const comparedReports = candidateReports
    .map((candidate) => summarizeCandidate(candidate, parsedReports[candidate.path]))
    .filter((summary) => summary.present && summary.parseable);
  const findings = [];

  addFinding(findings, {
    id: "sources.present",
    passed: candidateReports.every((candidate) => parsedReports[candidate.path]?.present === true),
    actual: summarizePresence(candidateReports, parsedReports),
    expected: "all configured fanout source reports are present",
    remediation: "Restore or regenerate the missing WSL fanout benchmark report before auditing the decision.",
  });
  addFinding(findings, {
    id: "sources.parseable",
    passed: candidateReports.every((candidate) => parsedReports[candidate.path]?.parseable === true),
    actual: summarizeParse(candidateReports, parsedReports),
    expected: "all configured fanout source reports are valid JSON",
    remediation: "Fanout decision evidence must be machine-readable JSON reports.",
  });
  addFinding(findings, {
    id: "sources.same_concurrency",
    passed: sameConcurrency(comparedReports),
    actual: uniqueValues(comparedReports.map((report) => report.concurrency)).join(","),
    expected: "exactly one shared concurrency value",
    remediation: "Compare fanout candidates at the same concurrency before promoting a worker count.",
  });
  addFinding(findings, {
    id: "sources.wsl_runtime",
    passed: comparedReports.every((report) => report.runtimeExecutor === "WSL_GO"),
    actual: summarizeRuntime(comparedReports),
    expected: "every compared report uses benchmarkRuntimeProfile.executor=WSL_GO",
    remediation: "Use the WSL load generator reports for the high-concurrency fanout decision.",
  });
  addFinding(findings, {
    id: "sources.batched_write_profile",
    passed: comparedReports.every((report) => report.batchSize === 64 && report.batchDelayMs === 0),
    actual: summarizeBatchProfile(comparedReports),
    expected: "batchSize=64 and batchDelayMs=0 for every compared report",
    remediation: "Keep write batching variables fixed while comparing worker fanout.",
  });
  addFinding(findings, {
    id: "database.acquire_not_bottleneck",
    passed: comparedReports.every((report) => report.dbAcquireP99Ms <= dbAcquireBottleneckP99Ms),
    actual: summarizeDbAcquire(comparedReports),
    expected: `db.acquire.p99_ms<=${dbAcquireBottleneckP99Ms}`,
    remediation: "Investigate PostgreSQL or PgBouncer acquisition waits before attributing the limit to worker fanout.",
  });
  addFinding(findings, {
    id: "runtime.diagnostics_worker_coverage",
    passed: comparedReports.every((report) => report.runtimeGatewayCount === report.gatewayWorkerCount),
    actual: summarizeRuntimeCoverage(comparedReports),
    expected: "runtime diagnostics include every gateway worker",
    remediation: "Regenerate fanout reports with complete runtime diagnostics before auditing fanout.",
  });

  const eligibleReports = comparedReports.filter((report) => report.passed && report.errors === 0);
  const selected = selectBestReport(eligibleReports);
  const baseline = comparedReports.find((report) => report.role === "baseline") ?? comparedReports[0];
  const budgetFanout = conversationBudgetFanout(inputs.budget);
  addFinding(findings, {
    id: "decision.zero_error_candidate",
    passed: Boolean(selected),
    actual: eligibleReports.map((report) => `direct${report.gatewayWorkerCount}`).join(","),
    expected: "at least one zero-error passed fanout report",
    remediation: "Do not promote a fanout setting without a zero-error benchmark report.",
  });
  addFinding(findings, {
    id: "budget.selected_fanout",
    passed: selected ? budgetFanout === selected.gatewayWorkerCount : false,
    actual: `budget=${budgetFanout ?? "missing"} selected=${selected?.gatewayWorkerCount ?? "none"}`,
    expected: "proposed PgBouncer connection budget matches selected conversation fanout",
    remediation: `Set ${targetServiceName}.maxConns to the selected gateway fanout or rerun the audit with updated evidence.`,
  });

  const negativeProbes = comparedReports.filter((report) => !report.passed || report.errors > 0);
  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  const decision = selected && baseline && selected.gatewayWorkerCount === baseline.gatewayWorkerCount
    ? `KEEP_DIRECT${selected.gatewayWorkerCount}`
    : selected
      ? `PROMOTE_DIRECT${selected.gatewayWorkerCount}`
      : "NO_PROMOTION";

  return {
    generatedAt: new Date().toISOString(),
    readiness,
    decision,
    recommendation: selected
      ? `Keep ${selected.gatewayWorkerCount} Research conversation gateway workers for this profile.`
      : "No Research conversation gateway fanout can be promoted from the provided evidence.",
    recommendedGatewayCount: selected?.gatewayWorkerCount ?? null,
    recommendedDbMaxConnsPerGateway: selected?.dbMaxConnsPerWorker ?? null,
    recommendedDbMaxConnsTotal: selected?.dbMaxConnsTotal ?? null,
    selectedSourceReportPath: selected?.sourceReportPath ?? null,
    comparisonBasis: {
      workload: "Research conversation createConversation short-burst write path",
      runtimeExecutor: "WSL_GO",
      concurrency: selected?.concurrency ?? baseline?.concurrency ?? null,
      databaseAcquireBottleneckP99Ms: dbAcquireBottleneckP99Ms,
      ranking: "zero errors first, then lower same-concurrency P99, lower gap P99, higher RPS",
    },
    comparedReports,
    negativeProbes,
    proposedBudget: {
      serviceName: targetServiceName,
      maxConns: budgetFanout ?? null,
    },
    rationale: buildRationale(selected, comparedReports, negativeProbes),
    findings,
    sourceReferences: [
      "docs/sdd/0130-conversation-wsl-loadgen-runtime.md",
      "docs/sdd/0131-conversation-wsl-worker-fanout-profile.md",
      "docs/sdd/0132-conversation-fanout-decision-audit.md",
      "reports/2026-06-01-p50-conversation-wsl-worker-fanout-profile.md",
    ],
  };
}

export function formatConversationFanoutDecisionAudit(report) {
  const lines = [
    `Conversation fanout decision: ${report.readiness}`,
    "",
    `Decision: ${report.decision}`,
    `Recommended gateway workers: ${report.recommendedGatewayCount ?? "none"}`,
    `Selected source: ${report.selectedSourceReportPath ?? "none"}`,
    "",
    "Compared reports:",
  ];
  for (const candidate of report.comparedReports) {
    lines.push(
      `- direct${candidate.gatewayWorkerCount} ${candidate.status} concurrency=${candidate.concurrency} p99=${candidate.p99Ms}ms gapP99=${candidate.clientServerGapP99Ms}ms rps=${candidate.rps} errors=${candidate.errors}`,
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

function summarizeCandidate(candidate, parsed) {
  if (!parsed?.present) {
    return {
      sourceReportPath: candidate.path,
      role: candidate.role,
      present: false,
      parseable: false,
    };
  }
  if (!parsed.parseable) {
    return {
      sourceReportPath: candidate.path,
      role: candidate.role,
      present: true,
      parseable: false,
      parseError: parsed.error,
    };
  }

  const report = parsed.value;
  const phase = report.phases?.createConversation ?? {};
  const runtimeMaxCurrentConns = maxCurrentConnectionValues(report);
  const status = stringOrNull(report.status);
  const errors = numberOrZero(phase.errors);
  const workerCount = numberOrNull(report.gatewayWorkerCount ?? report.gatewayCount);
  const dbMaxConnsPerWorker = numberOrNull(report.gatewayDatabaseProfile?.dbMaxConnsPerWorker);
  return {
    sourceReportPath: candidate.path,
    role: candidate.role,
    present: true,
    parseable: true,
    benchmarkKind: stringOrNull(report.benchmarkKind),
    status,
    passed: status === "PASSED",
    gatewayWorkerCount: workerCount,
    concurrency: numberOrNull(report.concurrency),
    operations: numberOrNull(report.operations ?? phase.operations),
    errors,
    firstError: stringOrNull(phase.firstError),
    rps: numberOrNull(phase.rps),
    p95Ms: numberOrNull(phase.latencyMs?.p95),
    p99Ms: numberOrNull(phase.latencyMs?.p99),
    serverP99Ms: numberOrNull(phase.serverTimingMs?.p99),
    clientServerGapP99Ms: numberOrNull(phase.clientServerGapMs?.p99),
    dbAcquireP99Ms: numberOrNull(phase.serverTimingBreakdownMs?.["db.acquire"]?.p99),
    dbInsertP99Ms: numberOrNull(phase.serverTimingBreakdownMs?.["db.insert"]?.p99),
    dbMaxConnsPerWorker,
    dbMaxConnsTotal: numberOrNull(report.gatewayDatabaseProfile?.dbMaxConnsTotal),
    batchSize: numberOrNull(report.gatewayWriteProfile?.batchSize),
    batchDelayMs: numberOrNull(report.gatewayWriteProfile?.batchDelayMs),
    runtimeExecutor: stringOrNull(report.benchmarkRuntimeProfile?.executor),
    runtimeGatewayCount: runtimeMaxCurrentConns.length,
    runtimeMaxCurrentConnections: {
      min: runtimeMaxCurrentConns.length ? Math.min(...runtimeMaxCurrentConns) : null,
      max: runtimeMaxCurrentConns.length ? Math.max(...runtimeMaxCurrentConns) : null,
    },
  };
}

function selectBestReport(reports) {
  return [...reports]
    .filter((report) => report.gatewayWorkerCount !== null)
    .sort(compareReports)
    .at(0);
}

function compareReports(left, right) {
  return compareNullableNumber(left.p99Ms, right.p99Ms)
    || compareNullableNumber(left.clientServerGapP99Ms, right.clientServerGapP99Ms)
    || compareNullableNumber(right.rps, left.rps)
    || compareNullableNumber(left.gatewayWorkerCount, right.gatewayWorkerCount);
}

function compareNullableNumber(left, right) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function conversationBudgetFanout(budget) {
  const service = budget?.services?.find((candidate) => candidate.name === targetServiceName);
  return numberOrNull(service?.maxConns);
}

function maxCurrentConnectionValues(report) {
  const gateways = report.gatewayRuntimeDiagnostics?.after?.gateways;
  if (!Array.isArray(gateways)) return [];
  return gateways
    .map((gateway) => gateway.stats?.maxCurrentConns)
    .filter((value) => Number.isFinite(value));
}

function sameConcurrency(reports) {
  const values = uniqueValues(reports.map((report) => report.concurrency).filter((value) => value !== null));
  return reports.length > 0 && values.length === 1;
}

function buildRationale(selected, comparedReports, negativeProbes) {
  if (!selected) {
    return [
      "No zero-error passed fanout report was available, so the audit cannot promote a worker count.",
    ];
  }
  const worseCandidates = comparedReports
    .filter((report) => report.gatewayWorkerCount !== selected.gatewayWorkerCount)
    .map((report) => `direct${report.gatewayWorkerCount} status=${report.status} p99=${report.p99Ms}ms errors=${report.errors}`);
  const lines = [
    `direct${selected.gatewayWorkerCount} has the best zero-error same-concurrency P99 among the provided WSL fanout reports.`,
    `db.acquire P99 stays at ${selected.dbAcquireP99Ms}ms, so PostgreSQL pool acquisition is not the limiter for the selected profile.`,
  ];
  if (worseCandidates.length > 0) {
    lines.push(`Non-selected candidates: ${worseCandidates.join("; ")}.`);
  }
  if (negativeProbes.length > 0) {
    lines.push(`Negative probes captured: ${negativeProbes.map((report) => `direct${report.gatewayWorkerCount}`).join(", ")}.`);
  }
  return lines;
}

function addFinding(findings, finding) {
  findings.push({
    ...finding,
    passed: Boolean(finding.passed),
  });
}

function summarizePresence(candidates, parsedReports) {
  return candidates
    .map((candidate) => `${candidate.path}:${parsedReports[candidate.path]?.present === true ? "present" : "missing"}`)
    .join(";");
}

function summarizeParse(candidates, parsedReports) {
  return candidates
    .map((candidate) => `${candidate.path}:${parsedReports[candidate.path]?.parseable === true ? "parseable" : "invalid"}`)
    .join(";");
}

function summarizeRuntime(reports) {
  return reports.map((report) => `direct${report.gatewayWorkerCount}:${report.runtimeExecutor}`).join(";");
}

function summarizeBatchProfile(reports) {
  return reports
    .map((report) => `direct${report.gatewayWorkerCount}:batch=${report.batchSize}:delay=${report.batchDelayMs}`)
    .join(";");
}

function summarizeDbAcquire(reports) {
  return reports.map((report) => `direct${report.gatewayWorkerCount}:${report.dbAcquireP99Ms}`).join(";");
}

function summarizeRuntimeCoverage(reports) {
  return reports
    .map((report) => `direct${report.gatewayWorkerCount}:runtime_gateways=${report.runtimeGatewayCount}`)
    .join(";");
}

function uniqueValues(values) {
  return [...new Set(values)];
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function stringOrNull(value) {
  return typeof value === "string" ? value : null;
}

function stringifyScalar(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function readReports(root, candidates) {
  return Object.fromEntries(candidates.map((candidate) => {
    const absolute = path.join(root, candidate.path);
    if (!fs.existsSync(absolute)) return [candidate.path, ""];
    return [candidate.path, fs.readFileSync(absolute, "utf8")];
  }));
}

function readJson(root, filePath) {
  return JSON.parse(fs.readFileSync(path.join(root, filePath), "utf8"));
}

function writeReport(root, reportPath, report) {
  const absolute = path.join(root, reportPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  const budgetIndex = argv.indexOf("--budget");
  return {
    out: outIndex === -1 ? defaultReportPath : argv[outIndex + 1],
    budget: budgetIndex === -1 ? defaultBudgetPath : argv[budgetIndex + 1],
  };
}

async function main() {
  const root = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const report = auditConversationFanoutDecision({
    reports: readReports(root, defaultCandidateReports),
    budget: readJson(root, args.budget),
  });
  writeReport(root, args.out, report);
  console.log(formatConversationFanoutDecisionAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
