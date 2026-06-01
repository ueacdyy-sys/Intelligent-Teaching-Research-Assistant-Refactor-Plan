const gatewayDiagnosticsPath = "/internal/identity/session-db-pool";
const internalDiagnosticsSecretHeader = "X-Internal-Diagnostics-Secret";
export const identityInternalDiagnosticsSecretValue = "ueacd";
const localSecretValues = [identityInternalDiagnosticsSecretValue];

export async function collectGatewayDatabaseDiagnostics(baseUrls, dependencies = {}) {
  const fetchFn = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const gateways = [];
  for (const baseUrl of baseUrls) {
    const trimmedBaseUrl = trimURL(baseUrl);
    try {
      const response = await fetchFn(`${trimmedBaseUrl}${gatewayDiagnosticsPath}`, {
        headers: {
          [internalDiagnosticsSecretHeader]: identityInternalDiagnosticsSecretValue,
        },
      });
      if (!response.ok) {
        gateways.push({
          baseUrl: maskURL(trimmedBaseUrl),
          status: "UNAVAILABLE",
          httpStatus: response.status,
        });
        continue;
      }
      const body = await response.json();
      gateways.push({
        baseUrl: maskURL(trimmedBaseUrl),
        status: "OK",
        httpStatus: response.status,
        stats: body.stats ?? null,
      });
    } catch (error) {
      gateways.push({
        baseUrl: maskURL(trimmedBaseUrl),
        status: "ERROR",
        errorMessage: maskSensitive(error instanceof Error ? error.message : String(error)),
      });
    }
  }
  return {
    endpoint: gatewayDiagnosticsPath,
    secretHeader: internalDiagnosticsSecretHeader,
    sampledAt: now(),
    gateways,
  };
}

function maskURL(value) {
  try {
    const parsed = new URL(value);
    if (!parsed.password) return value;
    parsed.password = "***";
    return parsed.toString();
  } catch {
    return value;
  }
}

function trimURL(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function maskSensitive(value) {
  let text = String(value ?? "");
  text = text.replace(/postgres:\/\/[^\s"']+/giu, "[masked-postgres-dsn]");
  for (const secret of localSecretValues) {
    text = text.replaceAll(secret, "***");
  }
  return text;
}
