import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_QUEUE_POOL_SIZE = 5;
const DEFAULT_MAX_OVERFLOW = 10;

export function auditLegacyDbPools(rootDir, options = {}) {
  const rootPath = rootDir instanceof URL ? fileURLToPath(rootDir) : rootDir;
  const root = path.resolve(rootPath);
  const files = listPythonFiles(root);
  const findings = [];

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    findings.push(...findEngineSites(text, file, root));
  }

  const highRiskSites = findings.filter((finding) => finding.risk === "high").length;
  const estimatedDefaultQueuePoolMaxPerWorker = findings.reduce(
    (sum, finding) => sum + finding.estimatedMaxConnectionsPerWorker,
    0,
  );

  return {
    scannedRoot: root,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    summary: {
      filesScanned: files.length,
      engineSites: findings.length,
      highRiskSites,
      estimatedDefaultQueuePoolMaxPerWorker,
    },
    findings,
  };
}

export function findEngineSites(text, filePath = "fixture.py", rootDir = "") {
  const sites = [];
  const pattern = /(?:(?<assignment>[A-Za-z_][\w]*)\s*=\s*|return\s+)(?<fn>create_async_engine|create_engine)\s*\(/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const start = match.index + match[0].lastIndexOf(match.groups.fn);
    const openParen = text.indexOf("(", start);
    const closeParen = findMatchingParen(text, openParen);
    const callText = closeParen === -1 ? text.slice(openParen) : text.slice(openParen, closeParen + 1);
    const line = lineNumberAt(text, match.index);
    const finding = classifyEngineSite({
      file: rootDir ? path.relative(rootDir, filePath).replaceAll(path.sep, "/") : filePath,
      line,
      engineFunction: match.groups.fn,
      assignment: match.groups.assignment ?? "return",
      callText,
    });
    sites.push(finding);
  }

  return sites;
}

export function formatLegacyDbPoolAudit(report) {
  const lines = [
    `Legacy DB pool audit: ${report.summary.highRiskSites > 0 ? "HIGH-RISK" : "OK"}`,
    `scannedRoot=${report.scannedRoot}`,
    `filesScanned=${report.summary.filesScanned}`,
    `engineSites=${report.summary.engineSites}`,
    `highRiskSites=${report.summary.highRiskSites}`,
    `estimatedDefaultQueuePoolMaxPerWorker=${report.summary.estimatedDefaultQueuePoolMaxPerWorker}`,
    "",
    "Findings:",
  ];

  for (const finding of report.findings) {
    lines.push(
      `- ${finding.file}:${finding.line} ${finding.engineFunction} ${finding.assignment} risk=${finding.risk} estimated=${finding.estimatedMaxConnectionsPerWorker} poolClass=${finding.poolClass}`,
    );
    lines.push(`  ${finding.recommendation}`);
  }

  return lines.join("\n");
}

function classifyEngineSite(site) {
  const poolClass = extractKeyword(site.callText, "poolclass") ?? "default";
  const poolSize = extractKeyword(site.callText, "pool_size") ?? "default";
  const maxOverflow = extractKeyword(site.callText, "max_overflow") ?? "default";

  if (poolClass.includes("NullPool")) {
    return {
      ...site,
      poolClass,
      poolSize,
      maxOverflow,
      estimatedMaxConnectionsPerWorker: 0,
      risk: "low",
      recommendation: "NullPool does not keep persistent per-worker connections; suitable behind PgBouncer transaction pooling or one-shot scripts.",
    };
  }

  if (poolSize !== "default" || maxOverflow !== "default") {
    return {
      ...site,
      poolClass,
      poolSize,
      maxOverflow,
      estimatedMaxConnectionsPerWorker: estimateConfiguredPool(poolSize, maxOverflow),
      risk: "medium",
      recommendation: "Explicit pool sizing exists; include this site in the global connection budget for every worker/process.",
    };
  }

  if (site.engineFunction === "create_engine") {
    return {
      ...site,
      poolClass,
      poolSize,
      maxOverflow,
      estimatedMaxConnectionsPerWorker: DEFAULT_QUEUE_POOL_SIZE + DEFAULT_MAX_OVERFLOW,
      risk: "high",
      recommendation: "Sync create_engine defaults to QueuePool 5 + max_overflow 10 per process; set explicit poolclass/pool_size or move behind PgBouncer.",
    };
  }

  return {
    ...site,
    poolClass,
    poolSize,
    maxOverflow,
    estimatedMaxConnectionsPerWorker: DEFAULT_QUEUE_POOL_SIZE + DEFAULT_MAX_OVERFLOW,
    risk: "high",
    recommendation: "Async engine has no explicit pool sizing; set pool_size/max_overflow or NullPool depending on deployment mode.",
  };
}

function estimateConfiguredPool(poolSize, maxOverflow) {
  const size = numericLiteral(poolSize);
  const overflow = numericLiteral(maxOverflow);
  if (size !== null && overflow !== null) {
    return size + overflow;
  }
  if (size !== null && maxOverflow === "default") {
    return size + DEFAULT_MAX_OVERFLOW;
  }
  return DEFAULT_QUEUE_POOL_SIZE + DEFAULT_MAX_OVERFLOW;
}

function extractKeyword(callText, keyword) {
  const match = new RegExp(`${keyword}\\s*=\\s*([^,\\n\\)]+)`).exec(callText);
  return match ? match[1].trim() : null;
}

function numericLiteral(value) {
  return /^\d+$/.test(value) ? Number(value) : null;
}

function listPythonFiles(root) {
  const files = [];
  walk(root, files);
  return files.sort();
}

function walk(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDirectory(entry.name)) continue;
      walk(fullPath, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".py")) {
      files.push(fullPath);
    }
  }
}

function shouldSkipDirectory(name) {
  return new Set(["__pycache__", ".pytest_cache", ".venv", "venv", "tests", "scripts", "alembic"]).has(name);
}

function findMatchingParen(text, openParen) {
  if (openParen === -1) return -1;
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = openParen; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function parseArgs(argv) {
  const rootIndex = argv.indexOf("--root");
  if (rootIndex === -1 || !argv[rootIndex + 1]) {
    throw new Error("usage: node tools/legacy-db-pool-audit.mjs --root <legacy-app-root> [--out <file>]");
  }
  const outIndex = argv.indexOf("--out");
  return {
    root: argv[rootIndex + 1],
    out: outIndex === -1 ? null : argv[outIndex + 1],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = auditLegacyDbPools(args.root);
    if (args.out) {
      fs.mkdirSync(path.dirname(args.out), { recursive: true });
      fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(formatLegacyDbPoolAudit(report));
    process.exit(report.summary.highRiskSites > 0 ? 2 : 0);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
