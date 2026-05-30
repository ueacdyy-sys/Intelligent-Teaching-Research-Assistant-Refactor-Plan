import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const sourceRoots = ["services", "tools", "contracts", "docs", "README.md", "package.json"];
const sourceExtensions = new Set([".go", ".mjs", ".md", ".yaml", ".yml", ".json", ".rs", ".toml"]);
const defaultReportPath = "reports/quality-gate.current.json";
const runtimeMarkerPattern = /\b(TODO|FIXME|HACK|XXX)\b/;
const goServicePatterns = [
  "./services/conversation-write-gateway/...",
  "./services/identity-access-gateway/...",
  "./services/teaching-archive-gateway/...",
];
const goServiceDirs = [
  "services/conversation-write-gateway",
  "services/identity-access-gateway",
  "services/teaching-archive-gateway",
];

export function checkFileSizeThreshold(files, options = {}) {
  const maxLines = options.maxLines ?? 800;
  return files
    .map((file) => ({ ...file, lines: countLines(file.text) }))
    .filter((file) => file.lines > maxLines)
    .map((file) => ({
      id: "source.file_size",
      path: normalizePath(file.path),
      passed: false,
      message: `${normalizePath(file.path)} has ${file.lines} lines; max is ${maxLines}`,
    }));
}

export function checkNoRuntimeTodoMarkers(files) {
  const findings = [];
  for (const file of files) {
    const filePath = normalizePath(file.path);
    if (!isRuntimeSource(filePath)) continue;
    const lines = file.text.split(/\r\n|\r|\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (runtimeMarkerPattern.test(lines[index])) {
        findings.push({
          id: "source.runtime_todo",
          path: filePath,
          passed: false,
          message: `${filePath}:${index + 1} contains unfinished runtime marker`,
        });
      }
    }
  }
  return findings;
}

export function checkArchitectureBoundaries(files) {
  const findings = [];
  for (const file of files) {
    const filePath = normalizePath(file.path);
    if (!filePath.endsWith(".go") || !isInnerLayerFile(filePath)) continue;
    for (const importPath of extractGoImports(file.text)) {
      if (!isForbiddenInnerImport(importPath)) continue;
      findings.push({
        id: "architecture.inner_import",
        path: filePath,
        passed: false,
        message: `${filePath} imports forbidden inner-layer dependency ${importPath}`,
      });
    }
  }
  return findings;
}

export function checkGoFormatOutput(output) {
  const files = output
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return files.map((filePath) => ({
    id: "source.gofmt",
    path: normalizePath(filePath),
    passed: false,
    message: `${normalizePath(filePath)} is not gofmt-formatted`,
  }));
}

export function checkRustFormatResult(result) {
  if (result.status === 0 && !result.error) return [];
  return [{
    id: "source.rustfmt",
    path: "services/agent-harness",
    passed: false,
    message: `services/agent-harness is not rustfmt-formatted${result.error ? `: ${result.error.message}` : ""}`,
  }];
}

export function buildQualityCommandPlan() {
  return [
    { name: "npm test", command: npmCommand(), args: ["test"] },
    {
      name: "go vet",
      command: "go",
      args: ["vet", ...goServicePatterns],
    },
    {
      name: "cargo test",
      command: "cargo",
      args: ["test", "--manifest-path", "services/agent-harness/Cargo.toml"],
    },
    { name: "identity session runtime audit", command: npmCommand(), args: ["run", "audit:identity-session-runtime"] },
    { name: "identity access contract audit", command: npmCommand(), args: ["run", "audit:identity-access"] },
    { name: "student app flow audit", command: npmCommand(), args: ["run", "audit:student-app-flow"] },
    { name: "agent harness flow audit", command: npmCommand(), args: ["run", "audit:agent-harness-flow"] },
    { name: "workflow plugin flow audit", command: npmCommand(), args: ["run", "audit:workflow-plugin-flow"] },
    { name: "direct-limited connection budget", command: npmCommand(), args: ["run", "budget:connections:direct-limited"] },
    { name: "pgbouncer connection budget", command: npmCommand(), args: ["run", "budget:connections:pgbouncer"] },
  ];
}

export function collectSourceFiles(root) {
  const files = [];
  for (const sourceRoot of sourceRoots) {
    const absolute = path.join(root, sourceRoot);
    if (!fs.existsSync(absolute)) continue;
    collectSourceFile(absolute, root, files);
  }
  return files;
}

export function runStaticQualityChecks(root) {
  const files = collectSourceFiles(root);
  const findings = [
    ...checkFileSizeThreshold(files),
    ...checkGoFormatting(root),
    ...checkRustFormatting(root),
    ...checkNoRuntimeTodoMarkers(files),
    ...checkArchitectureBoundaries(files),
  ];
  return {
    passed: findings.length === 0,
    findings,
  };
}

function checkGoFormatting(root) {
  const result = spawnSync("gofmt", ["-l", ...goServiceDirs], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  if (result.error) {
    return [{
      id: "source.gofmt",
      path: "",
      passed: false,
      message: `gofmt check failed: ${result.error.message}`,
    }];
  }
  return checkGoFormatOutput(result.stdout ?? "");
}

function checkRustFormatting(root) {
  const manifest = path.join(root, "services", "agent-harness", "Cargo.toml");
  if (!fs.existsSync(manifest)) return [];
  const result = spawnSync("cargo", ["fmt", "--manifest-path", "services/agent-harness/Cargo.toml", "--", "--check"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  return checkRustFormatResult(result);
}

export function runQualityCommands(root, plan = buildQualityCommandPlan()) {
  const results = [];
  for (const step of plan) {
    const startedAt = Date.now();
    const runnable = toRunnableCommand(step);
    const result = spawnSync(runnable.command, runnable.args, {
      cwd: root,
      stdio: "inherit",
      shell: false,
    });
    results.push({
      name: step.name,
      passed: result.status === 0 && !result.error,
      exitCode: result.status ?? 1,
      elapsedMs: Date.now() - startedAt,
      error: result.error?.message,
    });
  }
  return results;
}

function collectSourceFile(absolute, root, files) {
  const stat = fs.statSync(absolute);
  if (stat.isDirectory()) {
    const name = path.basename(absolute);
    if (["node_modules", ".git", "reports", "dist", "build", "target"].includes(name)) return;
    for (const child of fs.readdirSync(absolute)) {
      collectSourceFile(path.join(absolute, child), root, files);
    }
    return;
  }
  if (!stat.isFile() || !sourceExtensions.has(path.extname(absolute))) return;
  files.push({
    path: normalizePath(path.relative(root, absolute)),
    text: fs.readFileSync(absolute, "utf8"),
  });
}

function isRuntimeSource(filePath) {
  if (!filePath.startsWith("services/")) return false;
  if (filePath.endsWith("_test.go") || filePath.endsWith(".test.mjs")) return false;
  return filePath.endsWith(".go") || filePath.endsWith(".mjs") || filePath.endsWith(".rs");
}

function isInnerLayerFile(filePath) {
  return filePath.includes("/internal/domain/") || filePath.includes("/internal/usecase/");
}

function isForbiddenInnerImport(importPath) {
  return [
    importPath === "net/http",
    importPath === "database/sql",
    importPath.includes("/internal/adapter/"),
    importPath.includes("/cmd/"),
    importPath.startsWith("github.com/jackc/pgx"),
    importPath.toLowerCase().includes("redis"),
  ].some(Boolean);
}

function extractGoImports(text) {
  const imports = [];
  const singleImport = text.matchAll(/import\s+"([^"]+)"/g);
  for (const match of singleImport) imports.push(match[1]);

  const importBlocks = text.matchAll(/import\s*\(([\s\S]*?)\)/g);
  for (const block of importBlocks) {
    for (const match of block[1].matchAll(/"([^"]+)"/g)) {
      imports.push(match[1]);
    }
  }
  return imports;
}

function countLines(text) {
  if (text.length === 0) return 0;
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines.length;
}

function npmCommand() {
  return "npm";
}

function toRunnableCommand(step) {
  if (process.platform === "win32" && step.command === "npm") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", ["npm", ...step.args].join(" ")],
    };
  }
  return step;
}

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}

function writeReport(root, reportPath, report) {
  const absolute = path.join(root, reportPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  return {
    out: outIndex === -1 ? defaultReportPath : argv[outIndex + 1],
  };
}

async function main() {
  const root = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();
  const staticChecks = runStaticQualityChecks(root);

  for (const finding of staticChecks.findings) {
    console.error(`[FAIL] ${finding.message}`);
  }

  const commandResults = staticChecks.passed ? runQualityCommands(root) : [];
  const allPassed = staticChecks.passed && commandResults.every((result) => result.passed);
  const report = {
    generatedAt: new Date().toISOString(),
    allPassed,
    elapsedMs: Date.now() - startedAt,
    staticChecks,
    commandResults,
  };
  writeReport(root, args.out, report);

  for (const result of commandResults) {
    const status = result.passed ? "PASS" : "FAIL";
    console.log(`[${status}] ${result.name} (${result.elapsedMs}ms)`);
  }
  console.log(`[summary] ${args.out}`);
  process.exit(allPassed ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
