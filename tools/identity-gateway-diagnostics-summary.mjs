export function addGatewayWriteLimiterSummary(report, gatewayDatabaseDiagnostics) {
  const summary = summarizeGatewayWriteLimiterDiagnostics(gatewayDatabaseDiagnostics);
  if (!summary) return report;
  return {
    ...report,
    gatewayWriteLimiterDiagnostics: summary,
  };
}

export function summarizeGatewayWriteLimiterDiagnostics(gatewayDatabaseDiagnostics) {
  if (!gatewayDatabaseDiagnostics || typeof gatewayDatabaseDiagnostics !== "object") return null;
  const before = summarizeLimiterSnapshot(gatewayDatabaseDiagnostics.before);
  const after = summarizeLimiterSnapshot(gatewayDatabaseDiagnostics.after);
  if (!before && !after) return null;
  const summary = {};
  if (before) summary.before = before;
  if (after) summary.after = after;
  if (before && after) {
    summary.delta = {
      acquireCount: after.acquireCountTotal - before.acquireCountTotal,
      acquireWaitTimeMs: after.acquireWaitTimeMsTotal - before.acquireWaitTimeMsTotal,
      canceledAcquireCount: after.canceledAcquireCountTotal - before.canceledAcquireCountTotal,
      canceledAcquireWaitTimeMs: after.canceledAcquireWaitTimeMsTotal - before.canceledAcquireWaitTimeMsTotal,
    };
    const operations = deltaOperationSummaries(before.operations, after.operations);
    if (operations) summary.delta.operations = operations;
  }
  return summary;
}

function summarizeLimiterSnapshot(snapshot) {
  const gateways = Array.isArray(snapshot?.gateways) ? snapshot.gateways : [];
  const limiterStats = gateways
    .map((gateway) => gateway?.stats?.writeLimiter)
    .filter((stats) => stats && typeof stats === "object");
  if (limiterStats.length === 0) return null;
  const summary = {
    sampledAt: snapshot?.sampledAt ?? null,
    gatewayCount: gateways.length,
    gatewaysWithWriteLimiterStats: limiterStats.length,
    enabledGateways: limiterStats.filter((stats) => stats.enabled === true).length,
    configuredLimitTotal: sum(limiterStats, "limit"),
    inUseTotal: sum(limiterStats, "inUse"),
    waitingTotal: sum(limiterStats, "waiting"),
    acquireCountTotal: sum(limiterStats, "acquireCount"),
    acquireWaitTimeMsTotal: sum(limiterStats, "acquireWaitTimeMs"),
    canceledAcquireCountTotal: sum(limiterStats, "canceledAcquireCount"),
    canceledAcquireWaitTimeMsTotal: sum(limiterStats, "canceledAcquireWaitTimeMs"),
    maxInUsePerGateway: max(limiterStats, "inUse"),
    maxWaitingPerGateway: max(limiterStats, "waiting"),
    maxAcquireWaitTimeMsPerGateway: max(limiterStats, "acquireWaitTimeMs"),
  };
  const operations = summarizeOperationSnapshots(limiterStats);
  if (operations) summary.operations = operations;
  return summary;
}

function summarizeOperationSnapshots(limiterStats) {
  const operationNames = new Set();
  for (const stats of limiterStats) {
    if (!stats.operations || typeof stats.operations !== "object") continue;
    for (const operationName of Object.keys(stats.operations)) {
      operationNames.add(operationName);
    }
  }
  if (operationNames.size === 0) return undefined;

  const summaries = {};
  for (const operationName of [...operationNames].sort()) {
    const rows = limiterStats
      .map((stats) => stats.operations?.[operationName])
      .filter((stats) => stats && typeof stats === "object");
    summaries[operationName] = {
      waitingTotal: sum(rows, "waiting"),
      acquireCountTotal: sum(rows, "acquireCount"),
      acquireWaitTimeMsTotal: sum(rows, "acquireWaitTimeMs"),
      canceledAcquireCountTotal: sum(rows, "canceledAcquireCount"),
      canceledAcquireWaitTimeMsTotal: sum(rows, "canceledAcquireWaitTimeMs"),
      maxWaitingPerGateway: max(rows, "waiting"),
      maxAcquireWaitTimeMsPerGateway: max(rows, "acquireWaitTimeMs"),
    };
  }
  return summaries;
}

function deltaOperationSummaries(beforeOperations = {}, afterOperations = {}) {
  const operationNames = new Set([...Object.keys(beforeOperations), ...Object.keys(afterOperations)]);
  if (operationNames.size === 0) return undefined;

  const deltas = {};
  for (const operationName of [...operationNames].sort()) {
    const before = beforeOperations[operationName] ?? {};
    const after = afterOperations[operationName] ?? {};
    deltas[operationName] = {
      acquireCount: number(after.acquireCountTotal) - number(before.acquireCountTotal),
      acquireWaitTimeMs: number(after.acquireWaitTimeMsTotal) - number(before.acquireWaitTimeMsTotal),
      canceledAcquireCount: number(after.canceledAcquireCountTotal) - number(before.canceledAcquireCountTotal),
      canceledAcquireWaitTimeMs:
        number(after.canceledAcquireWaitTimeMsTotal) - number(before.canceledAcquireWaitTimeMsTotal),
    };
  }
  return deltas;
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + number(row[key]), 0);
}

function max(rows, key) {
  return rows.reduce((highest, row) => Math.max(highest, number(row[key])), 0);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
