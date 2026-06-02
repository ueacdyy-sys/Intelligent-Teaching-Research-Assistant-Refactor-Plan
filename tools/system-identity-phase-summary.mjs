export function buildSystemIdentityPhaseSummary(phases, gatewayDatabasePhaseDiagnostics = undefined) {
  const summarizedPhases = summarizeIdentityPhases(phases, gatewayDatabasePhaseDiagnostics);
  const dominantPhase = dominantIdentityPhase(summarizedPhases);
  return {
    phases: summarizedPhases,
    dominantPhase: dominantPhase?.name ?? null,
    dominantPhaseP99Ms: dominantPhase?.p99Ms ?? null,
  };
}

export function mergeSystemIdentityPhaseSummary(left, right) {
  if (!left || typeof left !== "object") return copySummary(right);
  if (!right || typeof right !== "object") return copySummary(left);
  const phaseNames = new Set([
    ...Object.keys(left.phases ?? {}),
    ...Object.keys(right.phases ?? {}),
  ]);
  const phases = {};
  for (const phaseName of phaseNames) {
    phases[phaseName] = mergePhase(left.phases?.[phaseName], right.phases?.[phaseName]);
  }
  const dominantPhase = dominantIdentityPhase(phases);
  return {
    ...left,
    ...right,
    phases,
    dominantPhase: dominantPhase?.name ?? null,
    dominantPhaseP99Ms: dominantPhase?.p99Ms ?? null,
  };
}

function summarizeIdentityPhases(phases, gatewayDatabasePhaseDiagnostics) {
  const summarized = {};
  for (const [phaseName, phase] of Object.entries(phases ?? {})) {
    if (!phase || typeof phase !== "object") continue;
    summarized[phaseName] = {
      errors: numberOrZero(phase.errors),
      p95Ms: numberOrNull(phase.latencyMs?.p95),
      p99Ms: numberOrNull(phase.latencyMs?.p99),
      rps: numberOrNull(phase.rps),
    };
    const slowestStep = phase.stepLatencyAttribution?.slowestStep;
    const slowestStepP99Ms = numberOrNull(phase.stepLatencyAttribution?.slowestStepP99Ms);
    if (slowestStep) summarized[phaseName].slowestStep = slowestStep;
    if (Number.isFinite(slowestStepP99Ms)) summarized[phaseName].slowestStepP99Ms = slowestStepP99Ms;
    const stepOperationAttribution = summarizeStepOperationAttribution(phase.stepOperationAttribution);
    if (Object.keys(stepOperationAttribution).length > 0) {
      summarized[phaseName].stepOperationAttribution = stepOperationAttribution;
    }
    const sessionOperations = summarizeSessionOperations(
      gatewayDatabasePhaseDiagnostics?.[phaseName]?.delta?.sessionOperations,
    );
    const writeLimiter = summarizeWriteLimiter(gatewayDatabasePhaseDiagnostics?.[phaseName]?.delta?.writeLimiter);
    if (writeLimiter) {
      const highestWriteLimiterWait = highestWriteLimiterWaitOperation(writeLimiter.operations);
      summarized[phaseName].writeLimiter = writeLimiter;
      summarized[phaseName].highestWriteLimiterWaitOperation = highestWriteLimiterWait?.name ?? null;
      summarized[phaseName].highestWriteLimiterWaitTimeMs = highestWriteLimiterWait?.acquireWaitTimeMs ?? null;
    }
    if (Object.keys(sessionOperations).length > 0) {
      const slowest = slowestSessionOperation(sessionOperations);
      summarized[phaseName].sessionOperations = sessionOperations;
      summarized[phaseName].slowestSessionOperation = slowest?.name ?? null;
      summarized[phaseName].slowestSessionOperationAverageElapsedMs = slowest?.averageElapsedMs ?? null;
    }
  }
  return summarized;
}

function dominantIdentityPhase(phases) {
  return Object.entries(phases ?? {})
    .map(([name, phase]) => ({ name, p99Ms: numberOrNull(phase?.p99Ms) }))
    .filter((entry) => Number.isFinite(entry.p99Ms))
    .sort((left, right) => right.p99Ms - left.p99Ms)[0] ?? null;
}

function mergePhase(left, right) {
  if (!left || typeof left !== "object") return copySummary(right);
  if (!right || typeof right !== "object") return copySummary(left);
  const leftP99 = numberOrNull(left.p99Ms);
  const rightP99 = numberOrNull(right.p99Ms);
  const winner = Number.isFinite(rightP99) && (!Number.isFinite(leftP99) || rightP99 >= leftP99) ? right : left;
  const merged = {
    ...winner,
    errors: numberOrZero(left.errors) + numberOrZero(right.errors),
    p95Ms: maxNullable(numberOrNull(left.p95Ms), numberOrNull(right.p95Ms)),
    p99Ms: maxNullable(leftP99, rightP99),
    rps: minNullable(numberOrNull(left.rps), numberOrNull(right.rps)),
  };
  const sessionOperations = mergeSessionOperations(left.sessionOperations, right.sessionOperations);
  if (Object.keys(sessionOperations).length > 0) {
    const slowest = slowestSessionOperation(sessionOperations);
    merged.sessionOperations = sessionOperations;
    merged.slowestSessionOperation = slowest?.name ?? null;
    merged.slowestSessionOperationAverageElapsedMs = slowest?.averageElapsedMs ?? null;
  }
  const writeLimiter = mergeWriteLimiter(left.writeLimiter, right.writeLimiter);
  if (writeLimiter) {
    const highestWriteLimiterWait = highestWriteLimiterWaitOperation(writeLimiter.operations);
    merged.writeLimiter = writeLimiter;
    merged.highestWriteLimiterWaitOperation = highestWriteLimiterWait?.name ?? null;
    merged.highestWriteLimiterWaitTimeMs = highestWriteLimiterWait?.acquireWaitTimeMs ?? null;
  }
  const stepOperationAttribution = mergeStepOperationAttribution(
    left.stepOperationAttribution,
    right.stepOperationAttribution,
  );
  if (Object.keys(stepOperationAttribution).length > 0) {
    merged.stepOperationAttribution = stepOperationAttribution;
  }
  return merged;
}

function copySummary(value) {
  return value && typeof value === "object" ? structuredClone(value) : undefined;
}

function summarizeSessionOperations(operations) {
  if (!operations || typeof operations !== "object") return {};
  return Object.fromEntries(
    Object.entries(operations)
      .map(([name, stats]) => summarizeSessionOperation(name, stats))
      .filter((entry) => entry !== null)
      .sort((left, right) => left[0].localeCompare(right[0])),
  );
}

function summarizeWriteLimiter(stats) {
  if (!stats || typeof stats !== "object") return null;
  const operations = summarizeWriteLimiterOperations(stats.operations);
  const acquireCount = numberOrZero(stats.acquireCount);
  const canceledAcquireCount = positiveNumberOrNull(stats.canceledAcquireCount);
  if (acquireCount === 0 && canceledAcquireCount === null && Object.keys(operations).length === 0) return null;
  return omitNullish({
    enabledGateways: numberOrZero(stats.enabledGateways),
    configuredLimitTotal: numberOrZero(stats.configuredLimitTotal),
    acquireCount,
    acquireWaitTimeMs: numberOrNull(stats.acquireWaitTimeMs),
    averageAcquireWaitTimeMs: averageElapsed(
      numberOrNull(stats.acquireWaitTimeMs),
      acquireCount,
      stats.averageAcquireWaitTimeMs,
    ),
    canceledAcquireCount,
    canceledAcquireWaitTimeMs: numberOrNull(stats.canceledAcquireWaitTimeMs),
    averageCanceledAcquireWaitTimeMs: averageElapsed(
      numberOrNull(stats.canceledAcquireWaitTimeMs),
      numberOrZero(stats.canceledAcquireCount),
      stats.averageCanceledAcquireWaitTimeMs,
    ),
    operations: Object.keys(operations).length > 0 ? operations : null,
  });
}

function summarizeWriteLimiterOperations(operations) {
  if (!operations || typeof operations !== "object") return {};
  return Object.fromEntries(
    Object.entries(operations)
      .map(([name, stats]) => summarizeWriteLimiterOperation(name, stats))
      .filter((entry) => entry !== null)
      .sort((left, right) => left[0].localeCompare(right[0])),
  );
}

function summarizeWriteLimiterOperation(name, stats) {
  if (!stats || typeof stats !== "object") return null;
  const acquireCount = numberOrZero(stats.acquireCount);
  const acquireWaitTimeMs = numberOrNull(stats.acquireWaitTimeMs);
  const canceledAcquireCount = numberOrZero(stats.canceledAcquireCount);
  const canceledAcquireWaitTimeMs = numberOrNull(stats.canceledAcquireWaitTimeMs);
  return [
    name,
    omitNullish({
      acquireCount,
      acquireWaitTimeMs,
      averageAcquireWaitTimeMs: averageElapsed(acquireWaitTimeMs, acquireCount, stats.averageAcquireWaitTimeMs),
      canceledAcquireCount: canceledAcquireCount > 0 ? canceledAcquireCount : null,
      canceledAcquireWaitTimeMs,
      averageCanceledAcquireWaitTimeMs: averageElapsed(
        canceledAcquireWaitTimeMs,
        canceledAcquireCount,
        stats.averageCanceledAcquireWaitTimeMs,
      ),
    }),
  ];
}

function summarizeStepOperationAttribution(attribution) {
  if (!attribution || typeof attribution !== "object") return {};
  return Object.fromEntries(
    Object.entries(attribution)
      .map(([stepName, stats]) => [stepName, summarizeStepOperation(stats)])
      .filter(([, summary]) => Object.keys(summary).length > 0)
      .sort((left, right) => left[0].localeCompare(right[0])),
  );
}

function summarizeStepOperation(stats) {
  if (!stats || typeof stats !== "object") return {};
  const sessionOperations = summarizeSessionOperations(stats.sessionOperations);
  const writeLimiterOperations = summarizeWriteLimiterOperations(stats.writeLimiterOperations);
  return omitNullish({
    stepP99Ms: numberOrNull(stats.stepP99Ms) ?? numberOrNull(stats.stepLatencyMs?.p99),
    stepAvgMs: numberOrNull(stats.stepAvgMs) ?? numberOrNull(stats.stepLatencyMs?.avg),
    expectedSessionOperations: stringArray(stats.expectedSessionOperations),
    missingSessionOperations: stringArray(stats.missingSessionOperations),
    sessionOperations: Object.keys(sessionOperations).length > 0 ? sessionOperations : null,
    writeLimiterOperations: Object.keys(writeLimiterOperations).length > 0 ? writeLimiterOperations : null,
  });
}

function summarizeSessionOperation(name, stats) {
  if (!stats || typeof stats !== "object") return null;
  const count = numberOrZero(stats.count);
  const totalElapsedMs = numberOrNull(stats.totalElapsedMs);
  const averageElapsedMs = averageElapsed(totalElapsedMs, count, stats.averageElapsedMs);
  const poolAcquireCount = numberOrZero(stats.poolAcquireCount);
  const poolAcquireElapsedMs = numberOrNull(stats.poolAcquireElapsedMs);
  const dbExecuteElapsedMs = numberOrNull(stats.dbExecuteElapsedMs);
  const rowsAffectedCount = numberOrZero(stats.rowsAffectedCount);
  const rowsAffected = numberOrZero(stats.rowsAffected);
  return [
    name,
    omitNullish({
      count,
      totalElapsedMs,
      averageElapsedMs,
      poolAcquireCount: poolAcquireCount > 0 ? poolAcquireCount : null,
      poolAcquireElapsedMs,
      averagePoolAcquireElapsedMs: averageElapsed(
        poolAcquireElapsedMs,
        poolAcquireCount,
        stats.averagePoolAcquireElapsedMs,
      ),
      dbExecuteElapsedMs,
      averageDbExecuteElapsedMs: averageElapsed(dbExecuteElapsedMs, count, stats.averageDbExecuteElapsedMs),
      rowsAffectedCount: rowsAffectedCount > 0 ? rowsAffectedCount : null,
      rowsAffected: rowsAffectedCount > 0 ? rowsAffected : null,
      averageRowsAffected: averageRowsAffected(rowsAffected, rowsAffectedCount, stats.averageRowsAffected),
    }),
  ];
}

function mergeWriteLimiter(left, right) {
  if (!left || typeof left !== "object") return copySummary(right);
  if (!right || typeof right !== "object") return copySummary(left);
  const acquireCount = numberOrZero(left.acquireCount) + numberOrZero(right.acquireCount);
  const acquireWaitTimeMs = sumNullable(numberOrNull(left.acquireWaitTimeMs), numberOrNull(right.acquireWaitTimeMs));
  const canceledAcquireCount = numberOrZero(left.canceledAcquireCount) + numberOrZero(right.canceledAcquireCount);
  const canceledAcquireWaitTimeMs = sumNullable(
    numberOrNull(left.canceledAcquireWaitTimeMs),
    numberOrNull(right.canceledAcquireWaitTimeMs),
  );
  const operations = mergeWriteLimiterOperations(left.operations, right.operations);
  return omitNullish({
    enabledGateways: maxNullable(numberOrNull(left.enabledGateways), numberOrNull(right.enabledGateways)),
    configuredLimitTotal: maxNullable(numberOrNull(left.configuredLimitTotal), numberOrNull(right.configuredLimitTotal)),
    acquireCount,
    acquireWaitTimeMs,
    averageAcquireWaitTimeMs: averageElapsed(acquireWaitTimeMs, acquireCount),
    canceledAcquireCount: canceledAcquireCount > 0 ? canceledAcquireCount : null,
    canceledAcquireWaitTimeMs,
    averageCanceledAcquireWaitTimeMs: averageElapsed(canceledAcquireWaitTimeMs, canceledAcquireCount),
    operations: Object.keys(operations).length > 0 ? operations : null,
  });
}

function mergeWriteLimiterOperations(left, right) {
  const operationNames = new Set([
    ...Object.keys(left ?? {}),
    ...Object.keys(right ?? {}),
  ]);
  return Object.fromEntries(
    [...operationNames]
      .map((name) => [name, mergeWriteLimiterOperation(left?.[name], right?.[name])])
      .filter(([, value]) => value !== undefined)
      .sort((leftEntry, rightEntry) => leftEntry[0].localeCompare(rightEntry[0])),
  );
}

function mergeWriteLimiterOperation(left, right) {
  if (!left || typeof left !== "object") return copySummary(right);
  if (!right || typeof right !== "object") return copySummary(left);
  const acquireCount = numberOrZero(left.acquireCount) + numberOrZero(right.acquireCount);
  const acquireWaitTimeMs = sumNullable(numberOrNull(left.acquireWaitTimeMs), numberOrNull(right.acquireWaitTimeMs));
  const canceledAcquireCount = numberOrZero(left.canceledAcquireCount) + numberOrZero(right.canceledAcquireCount);
  const canceledAcquireWaitTimeMs = sumNullable(
    numberOrNull(left.canceledAcquireWaitTimeMs),
    numberOrNull(right.canceledAcquireWaitTimeMs),
  );
  return omitNullish({
    acquireCount,
    acquireWaitTimeMs,
    averageAcquireWaitTimeMs: averageElapsed(acquireWaitTimeMs, acquireCount),
    canceledAcquireCount: canceledAcquireCount > 0 ? canceledAcquireCount : null,
    canceledAcquireWaitTimeMs,
    averageCanceledAcquireWaitTimeMs: averageElapsed(canceledAcquireWaitTimeMs, canceledAcquireCount),
  });
}

function mergeSessionOperations(left, right) {
  const operationNames = new Set([
    ...Object.keys(left ?? {}),
    ...Object.keys(right ?? {}),
  ]);
  return Object.fromEntries(
    [...operationNames]
      .map((name) => [name, mergeSessionOperation(left?.[name], right?.[name])])
      .filter(([, value]) => value !== undefined)
      .sort((leftEntry, rightEntry) => leftEntry[0].localeCompare(rightEntry[0])),
  );
}

function mergeSessionOperation(left, right) {
  if (!left || typeof left !== "object") return copySummary(right);
  if (!right || typeof right !== "object") return copySummary(left);
  const count = numberOrZero(left.count) + numberOrZero(right.count);
  const totalElapsedMs = sumNullable(numberOrNull(left.totalElapsedMs), numberOrNull(right.totalElapsedMs));
  const poolAcquireCount = numberOrZero(left.poolAcquireCount) + numberOrZero(right.poolAcquireCount);
  const poolAcquireElapsedMs = sumNullable(
    numberOrNull(left.poolAcquireElapsedMs),
    numberOrNull(right.poolAcquireElapsedMs),
  );
  const dbExecuteElapsedMs = sumNullable(numberOrNull(left.dbExecuteElapsedMs), numberOrNull(right.dbExecuteElapsedMs));
  const rowsAffectedCount = numberOrZero(left.rowsAffectedCount) + numberOrZero(right.rowsAffectedCount);
  const rowsAffected = numberOrZero(left.rowsAffected) + numberOrZero(right.rowsAffected);
  return omitNullish({
    count,
    totalElapsedMs,
    averageElapsedMs: averageElapsed(totalElapsedMs, count),
    poolAcquireCount: poolAcquireCount > 0 ? poolAcquireCount : null,
    poolAcquireElapsedMs,
    averagePoolAcquireElapsedMs: averageElapsed(poolAcquireElapsedMs, poolAcquireCount),
    dbExecuteElapsedMs,
    averageDbExecuteElapsedMs: averageElapsed(dbExecuteElapsedMs, count),
    rowsAffectedCount: rowsAffectedCount > 0 ? rowsAffectedCount : null,
    rowsAffected: rowsAffectedCount > 0 ? rowsAffected : null,
    averageRowsAffected: averageRowsAffected(rowsAffected, rowsAffectedCount),
  });
}

function mergeStepOperationAttribution(left, right) {
  const stepNames = new Set([
    ...Object.keys(left ?? {}),
    ...Object.keys(right ?? {}),
  ]);
  return Object.fromEntries(
    [...stepNames]
      .map((stepName) => [stepName, mergeStepOperation(left?.[stepName], right?.[stepName])])
      .filter(([, value]) => value !== undefined)
      .sort((leftEntry, rightEntry) => leftEntry[0].localeCompare(rightEntry[0])),
  );
}

function mergeStepOperation(left, right) {
  if (!left || typeof left !== "object") return copySummary(right);
  if (!right || typeof right !== "object") return copySummary(left);
  const sessionOperations = mergeSessionOperations(left.sessionOperations, right.sessionOperations);
  const writeLimiterOperations = mergeWriteLimiterOperations(left.writeLimiterOperations, right.writeLimiterOperations);
  return omitNullish({
    stepP99Ms: maxNullable(numberOrNull(left.stepP99Ms), numberOrNull(right.stepP99Ms)),
    stepAvgMs: maxNullable(numberOrNull(left.stepAvgMs), numberOrNull(right.stepAvgMs)),
    expectedSessionOperations: mergeStringArrays(left.expectedSessionOperations, right.expectedSessionOperations),
    missingSessionOperations: mergeStringArrays(left.missingSessionOperations, right.missingSessionOperations),
    sessionOperations: Object.keys(sessionOperations).length > 0 ? sessionOperations : null,
    writeLimiterOperations: Object.keys(writeLimiterOperations).length > 0 ? writeLimiterOperations : null,
  });
}

function slowestSessionOperation(operations) {
  return Object.entries(operations ?? {})
    .map(([name, stats]) => ({ name, averageElapsedMs: numberOrNull(stats?.averageElapsedMs) }))
    .filter((entry) => Number.isFinite(entry.averageElapsedMs))
    .sort((left, right) => right.averageElapsedMs - left.averageElapsedMs || left.name.localeCompare(right.name))[0] ?? null;
}

function highestWriteLimiterWaitOperation(operations) {
  return Object.entries(operations ?? {})
    .map(([name, stats]) => ({ name, acquireWaitTimeMs: numberOrNull(stats?.acquireWaitTimeMs) }))
    .filter((entry) => Number.isFinite(entry.acquireWaitTimeMs))
    .sort((left, right) => right.acquireWaitTimeMs - left.acquireWaitTimeMs || left.name.localeCompare(right.name))[0] ?? null;
}

function averageElapsed(totalElapsedMs, count, fallback = undefined) {
  if (Number.isFinite(totalElapsedMs) && count > 0) return roundFloat(totalElapsedMs / count);
  return numberOrNull(fallback);
}

function averageRowsAffected(rowsAffected, rowsAffectedCount, fallback = undefined) {
  if (rowsAffectedCount > 0) return roundFloat(rowsAffected / rowsAffectedCount);
  return numberOrNull(fallback);
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function positiveNumberOrNull(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function stringArray(value) {
  if (!Array.isArray(value)) return null;
  const values = [...new Set(value.filter((entry) => typeof entry === "string" && entry.length > 0))];
  return values.length > 0 ? values : null;
}

function mergeStringArrays(left, right) {
  const values = [...new Set([...(left ?? []), ...(right ?? [])].filter((entry) => typeof entry === "string" && entry.length > 0))];
  return values.length > 0 ? values.sort((leftValue, rightValue) => leftValue.localeCompare(rightValue)) : null;
}

function maxNullable(left, right) {
  if (Number.isFinite(left) && Number.isFinite(right)) return Math.max(left, right);
  return Number.isFinite(left) ? left : right;
}

function minNullable(left, right) {
  if (Number.isFinite(left) && Number.isFinite(right)) return Math.min(left, right);
  return Number.isFinite(left) ? left : right;
}

function sumNullable(left, right) {
  if (Number.isFinite(left) && Number.isFinite(right)) return roundFloat(left + right);
  return Number.isFinite(left) ? left : right;
}

function omitNullish(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== null && entryValue !== undefined));
}

function roundFloat(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}
