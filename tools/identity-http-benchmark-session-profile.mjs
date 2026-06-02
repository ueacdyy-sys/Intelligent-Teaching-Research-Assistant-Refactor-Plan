export const defaultSessionTablePersistence = "logged";

export function applySessionTablePersistenceArg(parsed, key, value) {
  if (key !== "--session-db-session-table-persistence") return false;
  parsed.sessionDbSessionTablePersistence = normalizeSessionTablePersistence(value);
  return true;
}

export function gatewaySessionPersistenceEnv(options) {
  return {
    SESSION_DB_SESSION_TABLE_PERSISTENCE: sessionTablePersistence(options),
  };
}

export function addSessionPersistenceToDatabaseProfile(profile, options) {
  return {
    ...profile,
    sessionTablePersistence: sessionTablePersistence(options),
  };
}

function sessionTablePersistence(options) {
  return normalizeSessionTablePersistence(options.sessionDbSessionTablePersistence);
}

export function normalizeSessionTablePersistence(value = defaultSessionTablePersistence) {
  const normalized = String(value || defaultSessionTablePersistence).trim().toLowerCase();
  if (normalized === "logged" || normalized === "unlogged") return normalized;
  throw new Error(`session table persistence must be logged or unlogged: ${value}`);
}
