import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultInputs = [
  "reports/identity-session-benchmark.pool4.json",
  "reports/identity-session-benchmark.pool8.json",
  "reports/identity-session-benchmark.pool16.json",
  "reports/identity-session-benchmark.current.json",
  "reports/identity-session-benchmark.concurrency128.json",
  "reports/identity-session-benchmark.concurrency256.json",
];

export function summarizeBenchmarkReports(reports) {
  const rows = dedupeReports(reports)
    .map(toRow)
    .sort((left, right) => left.concurrency - right.concurrency || left.poolMaxConns - right.poolMaxConns);
  const bestByRevokeP95 = rows.length === 0
    ? null
    : rows.reduce((best, row) => row.revokeCycleP95MS < best.revokeCycleP95MS ? row : best, rows[0]);
  return {
    generatedAt: new Date().toISOString(),
    rows,
    bestByRevokeP95,
  };
}

function dedupeReports(reports) {
  const latestByKey = new Map();
  for (const report of reports) {
    const key = `${report.concurrency}:${report.poolMaxConns}`;
    const current = latestByKey.get(key);
    if (!current || Date.parse(report.generatedAt) >= Date.parse(current.generatedAt)) {
      latestByKey.set(key, report);
    }
  }
  return [...latestByKey.values()];
}

export function formatBenchmarkMarkdown(summary) {
  const lines = [
    "| Concurrency | Pool max conns | Access lookup P95 | Refresh rotation P95 | Revoke cycle P95 | Access RPS | Refresh RPS | Revoke RPS | Errors |",
    "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const row of summary.rows) {
    lines.push(
      `| ${row.concurrency} | ${row.poolMaxConns} | ${formatMS(row.accessLookupP95MS)} | ${formatMS(row.refreshRotationP95MS)} | ${formatMS(row.revokeCycleP95MS)} | ${formatNumber(row.accessLookupRPS)} | ${formatNumber(row.refreshRotationRPS)} | ${formatNumber(row.revokeCycleRPS)} | ${row.errors} |`,
    );
  }
  if (summary.bestByRevokeP95) {
    lines.push(
      "",
      `Best observed revoke-cycle P95: concurrency ${summary.bestByRevokeP95.concurrency}, pool ${summary.bestByRevokeP95.poolMaxConns}, ${formatMS(summary.bestByRevokeP95.revokeCycleP95MS)}.`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function toRow(report) {
  const access = report.phases.accessLookup;
  const refresh = report.phases.refreshRotation;
  const revoke = report.phases.revokeCycle;
  return {
    generatedAt: report.generatedAt,
    concurrency: report.concurrency,
    operationsPerPhase: report.operationsPerPhase,
    poolMaxConns: report.poolMaxConns,
    accessLookupP95MS: access.latencyMs.p95,
    refreshRotationP95MS: refresh.latencyMs.p95,
    revokeCycleP95MS: revoke.latencyMs.p95,
    accessLookupRPS: access.rps,
    refreshRotationRPS: refresh.rps,
    revokeCycleRPS: revoke.rps,
    errors: access.errors + refresh.errors + revoke.errors,
  };
}

function readExistingReports(inputPaths) {
  const reports = [];
  const seen = new Set();
  for (const inputPath of inputPaths) {
    const fullPath = path.resolve(process.cwd(), inputPath);
    if (seen.has(fullPath) || !fs.existsSync(fullPath)) continue;
    seen.add(fullPath);
    reports.push(JSON.parse(fs.readFileSync(fullPath, "utf8")));
  }
  return reports;
}

function parseArgs(argv) {
  const outJsonIndex = argv.indexOf("--out-json");
  const outMarkdownIndex = argv.indexOf("--out-md");
  const inputIndex = argv.indexOf("--inputs");
  return {
    outJson: outJsonIndex === -1 ? "reports/identity-session-benchmark.summary.json" : argv[outJsonIndex + 1],
    outMarkdown: outMarkdownIndex === -1 ? "reports/identity-session-benchmark.summary.md" : argv[outMarkdownIndex + 1],
    inputs: inputIndex === -1 ? defaultInputs : argv[inputIndex + 1].split(",").map((item) => item.trim()).filter(Boolean),
  };
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function formatMS(value) {
  return `${formatNumber(value)}ms`;
}

function formatNumber(value) {
  return Number(value).toFixed(2);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const reports = readExistingReports(args.inputs);
    if (reports.length === 0) {
      throw new Error("no benchmark reports found");
    }
    const summary = summarizeBenchmarkReports(reports);
    writeFile(args.outJson, `${JSON.stringify(summary, null, 2)}\n`);
    writeFile(args.outMarkdown, formatBenchmarkMarkdown(summary));
    console.log(formatBenchmarkMarkdown(summary));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
