import fs from "node:fs";
import path from "node:path";

export function readOptionalJson(root, relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) return { present: false, parseable: false };
  try {
    return { present: true, parseable: true, value: JSON.parse(fs.readFileSync(absolute, "utf8")) };
  } catch (error) {
    return { present: true, parseable: false, error: error.message };
  }
}

export function writeJsonReport(absolutePath, report) {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`);
}

export function removeReports(root, relativePaths) {
  for (const relativePath of relativePaths) {
    removeExistingReport(root, relativePath);
  }
}

export function removeExistingReport(root, relativePath) {
  const absolute = path.join(root, relativePath);
  if (fs.existsSync(absolute)) fs.rmSync(absolute);
}

export function sanitizeCommandLine(command) {
  return maskSensitive([command.command, ...command.args].join(" "));
}

export function sanitizeCommandResult(result) {
  return {
    phase: result.phase,
    command: result.command,
    args: result.args,
    exitCode: result.exitCode ?? 1,
    elapsedMs: result.elapsedMs ?? null,
    outputTail: tailText(maskSensitive(result.outputTail ?? ""), 80),
    error: result.error ? maskSensitive(result.error) : undefined,
  };
}

export function maskSensitive(value) {
  return String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/giu, "[database-url]")
    .replaceAll("ueacd", "***");
}

export function tailText(value, maxLines = 80) {
  const text = String(value ?? "").replace(/\s+$/u, "");
  if (!text) return "";
  return text.split(/\r\n|\r|\n/u).slice(-maxLines).join("\n");
}

export function assertPositiveInteger(value, name) {
  const parsed = parseInteger(value);
  if (parsed <= 0) throw new Error(`${name} must be a positive integer`);
}

export function assertNonNegativeInteger(value, name) {
  if (!/^\d+$/u.test(String(value))) throw new Error(`${name} must be a non-negative integer`);
}

export function assertLooseNonNegativeInteger(value, name) {
  const parsed = parseInteger(value);
  if (parsed < 0) throw new Error(`${name} must be a non-negative integer`);
}

export function parseInteger(value) {
  if (!/^-?\d+$/u.test(String(value))) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseOptionalInteger(value) {
  if (value === undefined || value === "") return null;
  return parseInteger(value);
}

export function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

export function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

export function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

export function maxFinite(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? Math.max(...finite) : null;
}

export function maxNullable(left, right) {
  if (Number.isFinite(left) && Number.isFinite(right)) return Math.max(left, right);
  return Number.isFinite(left) ? left : right;
}

export function minFinite(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? Math.min(...finite) : null;
}

export function sumFinite(values) {
  return values.filter(Number.isFinite).reduce((total, value) => total + value, 0);
}

export function round(value, digits) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

export function nullableDelta(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return round(left - right, 2);
}

export function countCommandErrors(results) {
  return results.filter((result) => result.exitCode !== 0).length;
}

export function kebabToCamel(value) {
  return value.replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
}

export function toRunnableCommand(command, args) {
  if (process.platform === "win32" && command === "npm") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", ["npm", ...args].join(" ")],
    };
  }
  return { command, args };
}
