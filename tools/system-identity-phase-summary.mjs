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
    const sessionOperations = summarizeSessionOperations(
      gatewayDatabasePhaseDiagnostics?.[phaseName]?.delta?.sessionOperations,
    );
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

function summarizeSessionOperation(name, stats) {
  if (!stats || typeof stats !== "object") return null;
  const count = numberOrZero(stats.count);
  const totalElapsedMs = numberOrNull(stats.totalElapsedMs);
  const averageElapsedMs = averageElapsed(totalElapsedMs, count, stats.averageElapsedMs);
  const poolAcquireCount = numberOrZero(stats.poolAcquireCount);
  const poolAcquireElapsedMs = numberOrNull(stats.poolAcquireElapsedMs);
  const dbExecuteElapsedMs = numberOrNull(stats.dbExecuteElapsedMs);
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
    }),
  ];
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
  return omitNullish({
    count,
    totalElapsedMs,
    averageElapsedMs: averageElapsed(totalElapsedMs, count),
    poolAcquireCount: poolAcquireCount > 0 ? poolAcquireCount : null,
    poolAcquireElapsedMs,
    averagePoolAcquireElapsedMs: averageElapsed(poolAcquireElapsedMs, poolAcquireCount),
    dbExecuteElapsedMs,
    averageDbExecuteElapsedMs: averageElapsed(dbExecuteElapsedMs, count),
  });
}

function slowestSessionOperation(operations) {
  return Object.entries(operations ?? {})
    .map(([name, stats]) => ({ name, averageElapsedMs: numberOrNull(stats?.averageElapsedMs) }))
    .filter((entry) => Number.isFinite(entry.averageElapsedMs))
    .sort((left, right) => right.averageElapsedMs - left.averageElapsedMs || left.name.localeCompare(right.name))[0] ?? null;
}

function averageElapsed(totalElapsedMs, count, fallback = undefined) {
  if (Number.isFinite(totalElapsedMs) && count > 0) return roundFloat(totalElapsedMs / count);
  return numberOrNull(fallback);
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
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
