export const standardScaleSteps =
  "smoke:2:4:8:16:2:4,low:4:8:16:32:4:8,medium:8:16:32:64:8:16,high:16:32:64:128:16:32";

const production10kScaleSteps = [
  standardScaleSteps,
  "target-3k:48:192:512:2048:96:384:3000",
  "target-5k:80:320:1024:4096:160:640:5000",
  "target-8k:128:512:1536:6144:192:1024:8000",
  "target-10k:192:768:2304:9216:256:1536:10000",
].join(",");

export const scaleProfileDefaults = {
  standard: {},
  production10k: {
    steps: production10kScaleSteps,
    targetReadWriteRps: "10000",
    requireTargetReadWriteRps: "true",
    dockerStack: "system-persistence",
    identityDsn: "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable",
    conversationDsn: "postgres://app_user:ueacd@127.0.0.1:16433/intelligent_teaching_assistant?sslmode=disable",
    teachingDsn: "postgres://app_user:ueacd@127.0.0.1:16434/intelligent_teaching_assistant?sslmode=disable",
    identityGatewayCount: "2",
    conversationGatewayCount: "4",
    teachingGatewayCount: "2",
    identitySessionDbMaxConns: "8",
    identitySessionDbMinConns: "8",
    identitySessionDbPrewarmConns: "8",
    identitySessionDbReadMaxConns: "8",
    identitySessionDbReadMinConns: "8",
    identitySessionDbReadPrewarmConns: "8",
    identitySessionDbWriteConcurrency: "8",
    identityWarmupOperations: "80",
    identitySessionAccessCacheMaxEntries: "262144",
    identitySessionAccessCacheTtlMs: "30000",
    identitySessionDbSessionTablePersistence: "unlogged",
    conversationDbMaxConns: "8",
    teachingDbMaxConns: "16",
    teachingDbMinConns: "16",
    teachingDbPrewarmConns: "16",
    conversationWriteBatchSize: "128",
    conversationWriteBatchWorkers: "4",
    conversationWriteBatchMode: "copy",
    conversationWriteAcceptanceMode: "durable-log",
    conversationCommandLogAppendBatchSize: "128",
    conversationCommandLogQueueCapacity: "262144",
    conversationCommandLogProjectionWorkers: "8",
    conversationCommandLogSync: "true",
    conversationCommandLogSettleTimeoutMs: "30000",
    conversationClientTrace: "false",
    conversationBenchmarkRuntime: "local",
    conversationBenchmarkWslHost: "172.28.160.1",
    maxConnsPerHost: "256",
    warmConnectionsPerHost: "144",
    teachingBenchmarkRuntime: "local",
    teachingMaxConnsPerHost: "96",
    teachingWarmConnectionsPerHost: "32",
    teachingClientTrace: "false",
    teachingArchiveCreateBatchSize: "4",
    teachingArchiveCreateBatchDelayMs: "0",
    teachingArchiveCreateBatchWorkers: "4",
    teachingArchiveCreateBatchMode: "insert",
    teachingQuizSubmissionBatchSize: "4",
    teachingQuizSubmissionBatchDelayMs: "0",
    teachingQuizSubmissionBatchWorkers: "4",
    teachingWriteAcceptanceMode: "durable-log",
    teachingCommandLogAppendBatchSize: "128",
    teachingCommandLogQueueCapacity: "262144",
    teachingCommandLogProjectionWorkers: "8",
    teachingCommandLogSync: "true",
    teachingCommandLogSettleTimeoutMs: "30000",
    teachingArchiveListCacheTtlMs: "250",
    teachingArchiveListCacheMaxEntries: "4096",
    teachingArchiveSchemaIndexProfile: "hot_write",
    identityMaxConnsPerHost: "64",
    identityWarmConnectionsPerHost: "16",
    identityIngressProxy: "true",
    identityIngressCount: "8",
    identityIngressMaxConnsPerHost: "64",
    identityIngressWarmConnectionsPerHost: "8",
    identityBenchmarkRuntime: "local",
  },
};

export function normalizeScaleProfile(value) {
  const normalized = String(value ?? "standard").trim().toLowerCase().replace(/[^a-z0-9]/gu, "");
  return normalized || "standard";
}

export function scaleProfileNames() {
  return Object.keys(scaleProfileDefaults);
}
