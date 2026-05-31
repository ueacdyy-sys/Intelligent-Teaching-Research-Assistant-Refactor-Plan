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
  }
  return summary;
}

function summarizeLimiterSnapshot(snapshot) {
  const gateways = Array.isArray(snapshot?.gateways) ? snapshot.gateways : [];
  const limiterStats = gateways
    .map((gateway) => gateway?.stats?.writeLimiter)
    .filter((stats) => stats && typeof stats === "object");
  if (limiterStats.length === 0) return null;
  return {
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
