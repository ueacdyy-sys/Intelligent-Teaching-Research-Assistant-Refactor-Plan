export const defaultSessionDbQueryExecMode = "cache_statement";

const sessionDbQueryExecModes = new Set([
  "cache_statement",
  "cache_describe",
  "describe_exec",
  "exec",
  "simple_protocol",
]);

export function applySessionDbQueryExecModeArg(parsed, key, value) {
  if (key !== "--session-db-query-exec-mode") return false;
  parsed.sessionDbQueryExecMode = value;
  return true;
}

export function gatewaySessionQueryExecModeEnv(options) {
  return {
    SESSION_DB_QUERY_EXEC_MODE: sessionDbQueryExecMode(options),
  };
}

export function sessionDbQueryExecModeForProfile(optionsOrValue) {
  const value = typeof optionsOrValue === "object" && optionsOrValue !== null
    ? optionsOrValue.sessionDbQueryExecMode
    : optionsOrValue;
  return normalizeSessionDbQueryExecMode(value, { strict: false });
}

export function validateSessionDbQueryExecMode(optionsOrValue) {
  const value = typeof optionsOrValue === "object" && optionsOrValue !== null
    ? optionsOrValue.sessionDbQueryExecMode
    : optionsOrValue;
  normalizeSessionDbQueryExecMode(value);
}

export function normalizeSessionDbQueryExecMode(value = defaultSessionDbQueryExecMode, { strict = true } = {}) {
  const normalized = String(value || defaultSessionDbQueryExecMode).trim().toLowerCase();
  if (sessionDbQueryExecModes.has(normalized)) return normalized;
  if (!strict) return normalized;
  throw new Error(
    `session-db-query-exec-mode must be cache_statement, cache_describe, describe_exec, exec, or simple_protocol: ${value}`,
  );
}

function sessionDbQueryExecMode(options) {
  return normalizeSessionDbQueryExecMode(options.sessionDbQueryExecMode);
}
