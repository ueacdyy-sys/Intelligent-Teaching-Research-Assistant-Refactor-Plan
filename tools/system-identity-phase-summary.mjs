export function buildSystemIdentityPhaseSummary(phases) {
  const summarizedPhases = summarizeIdentityPhases(phases);
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

function summarizeIdentityPhases(phases) {
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
  return {
    ...winner,
    errors: numberOrZero(left.errors) + numberOrZero(right.errors),
    p95Ms: maxNullable(numberOrNull(left.p95Ms), numberOrNull(right.p95Ms)),
    p99Ms: maxNullable(leftP99, rightP99),
    rps: minNullable(numberOrNull(left.rps), numberOrNull(right.rps)),
  };
}

function copySummary(value) {
  return value && typeof value === "object" ? structuredClone(value) : undefined;
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
