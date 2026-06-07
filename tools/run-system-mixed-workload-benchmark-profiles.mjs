import { parseBoolean, parseInteger } from "./benchmark-runner-utils.mjs";
import {
  buildSystemConversationBenchmarkRuntimeProfile,
} from "./system-conversation-benchmark-runtime-profile.mjs";
import {
  buildSystemTeachingBenchmarkRuntimeProfile,
  buildSystemTeachingTransportProfile,
} from "./system-teaching-benchmark-runtime-profile.mjs";

export function buildMixedWorkloadPersistenceProfile(options) {
  const domains = {
    identity: persistenceDomainProfile(options.identityDsn),
    conversation: persistenceDomainProfile(options.conversationDsn),
    teaching: persistenceDomainProfile(options.teachingDsn),
  };
  const domainCount = new Set(Object.values(domains).map((domain) => domain.domainKey)).size;
  return {
    mode: domainCount === 1 ? "shared" : domainCount === 3 ? "isolated" : "mixed",
    domainCount,
    domains,
  };
}

function persistenceDomainProfile(dsn) {
  const url = parsePostgresDsn(dsn, "dsn");
  const database = decodeURIComponent(url.pathname.replace(/^\/+/u, ""));
  const port = url.port || "5432";
  return {
    adapter: "postgres",
    host: url.hostname,
    port: parseInteger(port),
    database,
    userConfigured: Boolean(url.username),
    password: "[masked]",
    sslmode: url.searchParams.get("sslmode") ?? null,
    domainKey: `${url.hostname.toLowerCase()}:${port}/${database}`,
  };
}

export function buildMixedWorkloadTransportProfile(options) {
  return {
    sharedMaxConnsPerHost: parseInteger(options.maxConnsPerHost),
    sharedWarmConnectionsPerHost: parseInteger(options.warmConnectionsPerHost),
    ...buildSystemTeachingTransportProfile(options),
    identityMaxConnsPerHost: parseInteger(identityMaxConnsPerHost(options)),
    identityWarmConnectionsPerHost: parseInteger(identityWarmConnectionsPerHost(options)),
  };
}

export function buildMixedWorkloadIdentityIngressProfile(options) {
  return {
    enabled: parseBoolean(options.identityIngressProxy),
    basePort: parseInteger(options.identityIngressPort),
    workerCount: parseInteger(options.identityIngressCount),
    upstreamGatewayCount: parseInteger(options.identityGatewayCount),
    maxConnsPerHost: parseInteger(options.identityIngressMaxConnsPerHost),
    warmConnectionsPerHost: parseInteger(options.identityIngressWarmConnectionsPerHost),
  };
}

export function buildMixedWorkloadConversationBenchmarkRuntimeProfile(options) {
  return buildSystemConversationBenchmarkRuntimeProfile(options);
}

export function buildMixedWorkloadTeachingBenchmarkRuntimeProfile(options) {
  return buildSystemTeachingBenchmarkRuntimeProfile(options);
}

export function assertPostgresDsn(value, name) {
  parsePostgresDsn(value, name);
}

function parsePostgresDsn(value, name) {
  let parsed;
  try {
    parsed = new URL(String(value ?? ""));
  } catch {
    throw new Error(`${name} must be a valid postgres DSN`);
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`${name} must use postgres:// or postgresql://`);
  }
  if (!parsed.hostname || parsed.pathname === "/" || parsed.pathname === "") {
    throw new Error(`${name} must include host and database`);
  }
  return parsed;
}

export function dockerStack(options) {
  const stack = String(options.dockerStack ?? "identity-session").trim().toLowerCase();
  if (stack === "identity-session" || stack === "system-persistence") return stack;
  throw new Error("docker-stack must be identity-session or system-persistence");
}

export function dockerStackScript(options, action) {
  return `perf:${dockerStack(options)}:${action}`;
}

export function identityMaxConnsPerHost(options) { return optionOrFallback(options.identityMaxConnsPerHost, options.maxConnsPerHost); }
export function identityWarmConnectionsPerHost(options) { return optionOrFallback(options.identityWarmConnectionsPerHost, options.warmConnectionsPerHost); }
function optionOrFallback(value, fallback) { return String(value ?? "").trim() === "" ? fallback : value; }
