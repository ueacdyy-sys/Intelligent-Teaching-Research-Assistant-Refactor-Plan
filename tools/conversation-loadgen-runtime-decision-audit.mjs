import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/conversation-loadgen-runtime-decision.current.json";
const dbAcquireBottleneckP99Ms = 10;
const practicalEdgeP99Ms = 600;
const dockerTailInflationRatio = 2;

export const defaultRuntimeReports = [
  {
    path: "reports/conversation-write-http-benchmark.direct16-concurrency5800-multi16-pool1-client-unlimited-batched64-delay0.json",
    role: "low-tail-local",
  },
  {
    path: "reports/conversation-write-http-benchmark.wsl-direct16-concurrency5800-batched64.json",
    role: "low-tail-wsl",
  },
  {
    path: "reports/conversation-write-http-benchmark.docker-direct16-concurrency5800-batched64.json",
    role: "low-tail-docker",
  },
  {
    path: "reports/conversation-write-http-benchmark.direct16-concurrency6200-multi16-pool1-client-unlimited-batched64-delay0.json",
    role: "edge-local-unlimited-negative",
  },
  {
    path: "reports/conversation-write-http-benchmark.direct16-concurrency6200-multi16-pool1-client388-batched64-delay0.json",
    role: "edge-local-capped",
  },
  {
    path: "reports/conversation-write-http-benchmark.wsl-direct16-concurrency6200-batched64.json",
    role: "edge-wsl-relief",
  },
  {
    path: "reports/conversation-write-http-benchmark.wsl-direct16-concurrency8000-batched64.json",
    role: "edge-wsl-practical",
  },
  {
    path: "reports/conversation-write-http-benchmark.wsl-direct16-concurrency30000-batched64.json",
    role: "burst-wsl-ceiling",
  },
  {
    path: "reports/conversation-write-http-benchmark.docker-direct16-concurrency6200-batched64.json",
    role: "edge-docker-smoke",
  },
  {
    path: "reports/conversation-write-http-benchmark.docker-direct16-concurrency7000-batched64.json",
    role: "edge-docker-smoke-confirmation",
  },
];

export function auditConversationLoadgenRuntimeDecision(inputs) {
  const runtimeReports = inputs.runtimeReports ?? defaultRuntimeReports;
  const parsedReports = parseReports(inputs.reports ?? {});
  const comparedReports = runtimeReports
    .map((entry) => summarizeReport(entry, parsedReports[entry.path]))
    .filter((entry) => entry.present && entry.parseable);
  const findings = [];

  addFinding(findings, {
    id: "sources.present",
    passed: runtimeReports.every((entry) => parsedReports[entry.path]?.present === true),
    actual: summarizePresence(runtimeReports, parsedReports),
    expected: "all configured loadgen runtime reports are present",
    remediation: "Restore or regenerate the Local, WSL, and Docker conversation benchmark reports before auditing runtime selection.",
  });
  addFinding(findings, {
    id: "sources.parseable",
    passed: runtimeReports.every((entry) => parsedReports[entry.path]?.parseable === true),
    actual: summarizeParse(runtimeReports, parsedReports),
    expected: "all configured loadgen runtime reports are valid JSON",
    remediation: "Loadgen runtime decision evidence must stay machine-readable benchmark JSON.",
  });
  addFinding(findings, {
    id: "metrics.required",
    passed: comparedReports.every(hasRequiredMetrics),
    actual: summarizeMetricPresence(comparedReports),
    expected: "status, executor, concurrency, maxConnsPerHost, p99, serverP99, gapP99, db.acquireP99, and errors",
    remediation: "Use benchmark reports with runtime profile, transport, latency, Server-Timing, and error metrics.",
  });
  addFinding(findings, {
    id: "database.acquire_not_bottleneck",
    passed: comparedReports.every((entry) => entry.dbAcquireP99Ms <= dbAcquireBottleneckP99Ms),
    actual: comparedReports.map((entry) => `${entry.label}:${entry.dbAcquireP99Ms}`).join(";"),
    expected: `db.acquire.p99_ms<=${dbAcquireBottleneckP99Ms}`,
    remediation: "Investigate PostgreSQL or PgBouncer acquisition before attributing runtime differences to the load generator.",
  });

  const localNegative = comparedReports.find((entry) => entry.role === "edge-local-unlimited-negative");
  const wslRelief = comparedReports.find((entry) => entry.role === "edge-wsl-relief");
  addFinding(findings, {
    id: "runtime.wsl_relieves_local_socket_pressure",
    passed: isSocketPressureProbe(localNegative) && isZeroErrorPass(wslRelief) &&
      localNegative.concurrency === wslRelief.concurrency && wslRelief.maxConnsPerHost === 0,
    actual: `local=${describeOutcome(localNegative)};wsl=${describeOutcome(wslRelief)}`,
    expected: "failed local unlimited 6200 socket probe and zero-error same-concurrency WSL unlimited pass",
    remediation: "Keep high-concurrency runtime selection undecided until WSL proves the same unlimited edge load without socket pressure errors.",
  });

  const databaseBottleneck = comparedReports.some((entry) => entry.dbAcquireP99Ms > dbAcquireBottleneckP99Ms);
  const lowTail = selectLowTailRuntime(comparedReports, databaseBottleneck);
  const highConcurrency = selectHighConcurrencyRuntime(comparedReports, databaseBottleneck);
  const burstCeiling = selectBurstCeiling(comparedReports, databaseBottleneck);
  const docker = selectDockerRuntime(comparedReports, lowTail.selected, databaseBottleneck);

  addFinding(findings, {
    id: "decision.low_tail_runtime_selected",
    passed: Boolean(lowTail.selected),
    actual: lowTail.selected?.label ?? "none",
    expected: "one zero-error low-tail runtime selected",
    remediation: "Keep low-tail runtime undecided until a zero-error Local, WSL, or Docker comparison exists.",
  });
  addFinding(findings, {
    id: "decision.high_concurrency_runtime_selected",
    passed: Boolean(highConcurrency.selected),
    actual: highConcurrency.selected?.label ?? "none",
    expected: `one zero-error WSL edge runtime selected with p99<=${practicalEdgeP99Ms}ms`,
    remediation: "Use a WSL edge report that stays under the practical high-concurrency tail threshold before claiming the edge profile.",
  });
  addFinding(findings, {
    id: "decision.burst_ceiling_selected",
    passed: Boolean(burstCeiling.selected),
    actual: burstCeiling.selected?.label ?? "none",
    expected: "highest zero-error WSL burst ceiling selected",
    remediation: "Keep burst ceiling undecided until a zero-error WSL report is registered.",
  });

  return {
    generatedAt: new Date().toISOString(),
    readiness: findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION",
    workloadType: "CONFIG_PROFILE",
    databaseBottleneck,
    decisions: {
      lowTail,
      highConcurrency,
      burstCeiling,
      docker,
    },
    comparedReports,
    recommendedNextAction: recommendedNextAction(databaseBottleneck, lowTail, highConcurrency, burstCeiling, docker),
    rationale: buildRationale(databaseBottleneck, lowTail, highConcurrency, burstCeiling, docker),
    findings,
    sourceReferences: [
      "docs/sdd/0132-conversation-fanout-decision-audit.md",
      "docs/sdd/0133-conversation-client-trace-attribution-audit.md",
      "docs/sdd/0134-conversation-transport-profile-decision-audit.md",
      "docs/sdd/0135-conversation-loadgen-runtime-decision-audit.md",
    ],
  };
}

export function formatConversationLoadgenRuntimeDecisionAudit(report) {
  const lines = [
    `Conversation loadgen runtime decision: ${report.readiness}`,
    "",
    `Low-tail recommendation: ${report.decisions.lowTail.recommendation}`,
    `Low-tail selected: ${report.decisions.lowTail.selected?.sourceReportPath ?? "none"}`,
    `High-concurrency recommendation: ${report.decisions.highConcurrency.recommendation}`,
    `High-concurrency selected: ${report.decisions.highConcurrency.selected?.sourceReportPath ?? "none"}`,
    `Burst ceiling recommendation: ${report.decisions.burstCeiling.recommendation}`,
    `Burst ceiling selected: ${report.decisions.burstCeiling.selected?.sourceReportPath ?? "none"}`,
    `Docker recommendation: ${report.decisions.docker.recommendation}`,
    "",
    "Compared reports:",
  ];
  for (const entry of report.comparedReports) {
    lines.push(
      `- ${entry.label} ${entry.status} executor=${entry.executor} concurrency=${entry.concurrency} maxConnsPerHost=${entry.maxConnsPerHost} p99=${entry.p99Ms}ms gap=${entry.clientServerGapP99Ms}ms errors=${entry.errors}`,
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
  const executor = report.benchmarkRuntimeProfile?.executor ?? "LOCAL_GO";
  const concurrency = numberOrNull(report.concurrency);
  const maxConnsPerHost = numberOrNull(report.transportProfile?.maxConnsPerHost);
  return {
    sourceReportPath: source.path,
    role: source.role,
    label: `${source.role}:${executor}:c${concurrency}:max${maxConnsPerHost}`,
    present: true,
    parseable: true,
    status: report.status ?? null,
    passed: report.status === "PASSED",
    executor,
    gatewayCount: numberOrNull(report.gatewayCount ?? report.gatewayWorkerCount),
    concurrency,
    operations: numberOrNull(report.operations ?? phase.operations),
    maxConnsPerHost,
    warmConnectionsPerHost: numberOrNull(report.transportProfile?.warmConnectionsPerHost),
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
    entry.executor,
    entry.concurrency,
    entry.maxConnsPerHost,
    entry.p99Ms,
    entry.serverP99Ms,
    entry.clientServerGapP99Ms,
    entry.dbAcquireP99Ms,
    entry.errors,
  ].every((value) => value !== null && value !== undefined);
}

function selectLowTailRuntime(entries, databaseBottleneck) {
  if (databaseBottleneck) return { recommendation: "INVESTIGATE_DATABASE_ACQUIRE", selected: null, candidates: [] };
  const candidates = entries.filter((entry) => entry.role.startsWith("low-tail"));
  const selected = selectBestZeroError(candidates);
  return {
    recommendation: selected ? recommendationForLowTailExecutor(selected.executor) : "NO_LOW_TAIL_RUNTIME",
    selected,
    candidates,
  };
}

function selectHighConcurrencyRuntime(entries, databaseBottleneck) {
  if (databaseBottleneck) return { recommendation: "INVESTIGATE_DATABASE_ACQUIRE", selected: null, candidates: [] };
  const candidates = entries.filter((entry) => entry.executor === "WSL_GO" && entry.concurrency >= 6200);
  const selected = [...candidates]
    .filter((entry) => isZeroErrorPass(entry) && entry.p99Ms <= practicalEdgeP99Ms)
    .sort((left, right) => compareNullableNumber(right.concurrency, left.concurrency) || compareNullableNumber(left.p99Ms, right.p99Ms))
    .at(0) ?? null;
  return {
    recommendation: selected ? "USE_WSL_LOADGEN_FOR_HIGH_CONCURRENCY_EDGE" : "NO_HIGH_CONCURRENCY_RUNTIME",
    selected,
    thresholdP99Ms: practicalEdgeP99Ms,
    candidates,
  };
}

function selectBurstCeiling(entries, databaseBottleneck) {
  if (databaseBottleneck) return { recommendation: "INVESTIGATE_DATABASE_ACQUIRE", selected: null, candidates: [] };
  const candidates = entries.filter((entry) => entry.executor === "WSL_GO" && entry.concurrency >= 6200);
  const selected = [...candidates]
    .filter(isZeroErrorPass)
    .sort((left, right) => compareNullableNumber(right.concurrency, left.concurrency))
    .at(0) ?? null;
  return {
    recommendation: selected ? "USE_WSL_AS_FUNCTIONAL_BURST_CEILING_EVIDENCE" : "NO_BURST_CEILING",
    selected,
    candidates,
  };
}

function selectDockerRuntime(entries, lowTailSelected, databaseBottleneck) {
  if (databaseBottleneck) return { recommendation: "INVESTIGATE_DATABASE_ACQUIRE", selected: null, candidates: [] };
  const candidates = entries.filter((entry) => entry.executor === "DOCKER_GO");
  const selected = selectBestZeroError(candidates);
  const sameConcurrencyDocker = lowTailSelected
    ? candidates.find((entry) => entry.concurrency === lowTailSelected.concurrency)
    : null;
  const p99RatioToLowTail = sameConcurrencyDocker && lowTailSelected?.p99Ms
    ? round(sameConcurrencyDocker.p99Ms / lowTailSelected.p99Ms)
    : null;
  const recommendation = p99RatioToLowTail !== null && p99RatioToLowTail >= dockerTailInflationRatio
    ? "DOCKER_RUNTIME_SMOKE_ONLY"
    : selected ? "DOCKER_RUNTIME_REQUIRES_REPEAT_BEFORE_PROMOTION" : "NO_DOCKER_RUNTIME";
  return {
    recommendation,
    selected,
    p99RatioToLowTail,
    tailInflationRatioThreshold: dockerTailInflationRatio,
    candidates,
  };
}

function recommendationForLowTailExecutor(executor) {
  if (executor === "LOCAL_GO") return "USE_LOCAL_DIRECT_FOR_LOW_TAIL";
  if (executor === "WSL_GO") return "USE_WSL_LOADGEN_FOR_LOW_TAIL";
  if (executor === "DOCKER_GO") return "USE_DOCKER_LOADGEN_FOR_LOW_TAIL";
  return "USE_SELECTED_LOADGEN_FOR_LOW_TAIL";
}

function recommendedNextAction(databaseBottleneck, lowTail, highConcurrency, burstCeiling, docker) {
  if (databaseBottleneck) return "Profile database acquisition before changing load generator runtime or worker limits.";
  if (lowTail.selected && highConcurrency.selected && burstCeiling.selected) {
    return "Keep Local Go as the low-tail claim, use WSL Go for high-concurrency edge and burst probes, and keep Docker Go as smoke evidence until repeated Docker reports close the tail gap.";
  }
  if (docker.recommendation === "DOCKER_RUNTIME_REQUIRES_REPEAT_BEFORE_PROMOTION") {
    return "Repeat Docker and WSL same-concurrency probes before promoting Docker as the primary high-concurrency load generator.";
  }
  return "Keep loadgen runtime decisions evidence-gated by same-concurrency zero-error comparisons.";
}

function buildRationale(databaseBottleneck, lowTail, highConcurrency, burstCeiling, docker) {
  if (databaseBottleneck) return ["At least one runtime comparison has db.acquire P99 above the attribution threshold."];
  const lines = [];
  if (lowTail.selected) {
    lines.push(`${lowTail.selected.label} is the best zero-error low-tail runtime at ${lowTail.selected.p99Ms}ms P99.`);
  }
  if (highConcurrency.selected) {
    lines.push(`${highConcurrency.selected.label} is the practical WSL high-concurrency edge profile under ${practicalEdgeP99Ms}ms P99.`);
  }
  if (burstCeiling.selected) {
    lines.push(`${burstCeiling.selected.label} is the highest zero-error WSL functional burst profile.`);
  }
  if (docker.p99RatioToLowTail !== null) {
    lines.push(`Docker same-concurrency P99 is ${docker.p99RatioToLowTail}x the selected low-tail runtime, so Docker remains smoke evidence for now.`);
  }
  return lines;
}

function selectBestZeroError(entries) {
  return [...entries]
    .filter(isZeroErrorPass)
    .sort((left, right) => compareNullableNumber(left.p99Ms, right.p99Ms) || compareNullableNumber(right.concurrency, left.concurrency))
    .at(0) ?? null;
}

function isZeroErrorPass(entry) {
  return Boolean(entry?.passed) && entry.errors === 0;
}

function isSocketPressureProbe(entry) {
  return Boolean(entry) && (!entry.passed || entry.errors > 0) && /socket|buffer|bind|queue/i.test(entry.firstError ?? "");
}

function describeOutcome(entry) {
  if (!entry) return "missing";
  return `${entry.status}:c${entry.concurrency}:max${entry.maxConnsPerHost}:errors${entry.errors}`;
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

function round(value) {
  return Math.round(value * 100) / 100;
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
  const report = auditConversationLoadgenRuntimeDecision({
    reports: readReports(root, defaultRuntimeReports),
  });
  writeReport(root, args.out, report);
  console.log(formatConversationLoadgenRuntimeDecisionAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
