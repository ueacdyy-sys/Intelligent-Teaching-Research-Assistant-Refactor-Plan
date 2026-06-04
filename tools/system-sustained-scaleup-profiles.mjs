export const standardScaleSteps =
  "smoke:2:4:8:16:2:4,low:4:8:16:32:4:8,medium:8:16:32:64:8:16,high:16:32:64:128:16:32";

const production10kScaleSteps = [
  standardScaleSteps,
  "target-3k:48:192:512:2048:96:384:3000",
  "target-5k:80:320:1024:4096:160:640:5000",
  "target-8k:128:512:1536:6144:256:1024:8000",
  "target-10k:192:768:2304:9216:384:1536:10000",
].join(",");

export const scaleProfileDefaults = {
  standard: {},
  production10k: {
    steps: production10kScaleSteps,
    targetReadWriteRps: "10000",
    requireTargetReadWriteRps: "true",
    identityGatewayCount: "8",
    conversationGatewayCount: "16",
    teachingGatewayCount: "4",
    identitySessionDbMaxConns: "32",
    identitySessionDbWriteConcurrency: "32",
    identitySessionDbSessionTablePersistence: "unlogged",
    conversationDbMaxConns: "32",
    teachingDbMaxConns: "12",
    teachingDbMinConns: "12",
    teachingDbPrewarmConns: "12",
    conversationWriteBatchSize: "128",
    conversationWriteBatchWorkers: "4",
    conversationWriteBatchMode: "copy",
    conversationWriteAcceptanceMode: "sync",
    conversationClientTrace: "false",
    conversationBenchmarkRuntime: "wsl",
    conversationBenchmarkWslHost: "172.28.160.1",
    maxConnsPerHost: "256",
    warmConnectionsPerHost: "144",
    teachingBenchmarkRuntime: "docker",
    teachingMaxConnsPerHost: "128",
    teachingWarmConnectionsPerHost: "96",
    teachingClientTrace: "true",
    teachingArchiveCreateBatchSize: "64",
    teachingArchiveCreateBatchDelayMs: "0",
    teachingArchiveCreateBatchWorkers: "1",
    identityMaxConnsPerHost: "64",
    identityWarmConnectionsPerHost: "16",
    identityIngressProxy: "true",
    identityIngressCount: "8",
    identityIngressMaxConnsPerHost: "64",
    identityIngressWarmConnectionsPerHost: "8",
    identityBenchmarkRuntime: "docker",
  },
};

export function normalizeScaleProfile(value) {
  const normalized = String(value ?? "standard").trim().toLowerCase().replace(/[^a-z0-9]/gu, "");
  return normalized || "standard";
}

export function scaleProfileNames() {
  return Object.keys(scaleProfileDefaults);
}
