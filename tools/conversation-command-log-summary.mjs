import { maxFinite, maxNullable, numberOrNull, numberOrZero, sumFinite } from "./benchmark-runner-utils.mjs";

export function summarizeCommandLogDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== "object") return undefined;
  const summarized = Object.fromEntries(
    ["before", "after", "settled"]
      .map((snapshotName) => [snapshotName, summarizeCommandLogSnapshot(diagnostics[snapshotName])])
      .filter(([_name, snapshot]) => snapshot !== undefined),
  );
  return Object.keys(summarized).length > 0 ? summarized : undefined;
}

function summarizeCommandLogSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.gateways)) return undefined;
  const gateways = snapshot.gateways;
  const stats = gateways.map((gateway) => gateway.stats ?? {});
  return {
    gatewayCount: gateways.length,
    okGateways: gateways.filter((gateway) => gateway.status === "OK").length,
    unavailableGateways: gateways.filter((gateway) => gateway.status !== "OK").length,
    acceptedCommands: sumFinite(stats.map((entry) => numberOrNull(entry.acceptedCommands))),
    appendErrors: sumFinite(stats.map((entry) => numberOrNull(entry.appendErrors))),
    projectionEnqueued: sumFinite(stats.map((entry) => numberOrNull(entry.projectionEnqueued))),
    projectionSucceeded: sumFinite(stats.map((entry) => numberOrNull(entry.projectionSucceeded))),
    projectionFailed: sumFinite(stats.map((entry) => numberOrNull(entry.projectionFailed))),
    queueDepth: sumFinite(stats.map((entry) => numberOrNull(entry.queueDepth))),
    maxOldestPendingAgeMs: maxFinite(stats.map((entry) => numberOrNull(entry.oldestPendingAgeMs))),
  };
}

export function mergeCommandLogDiagnostics(left, right) {
  if (!left || typeof left !== "object") return right && typeof right === "object" ? { ...right } : undefined;
  if (!right || typeof right !== "object") return { ...left };
  return {
    ...left,
    ...right,
    after: mergeCommandLogSnapshot(left.after, right.after),
    settled: mergeCommandLogSnapshot(left.settled, right.settled),
  };
}

function mergeCommandLogSnapshot(left, right) {
  if (!left || typeof left !== "object") return right;
  if (!right || typeof right !== "object") return left;
  return {
    ...left,
    ...right,
    acceptedCommands: numberOrZero(left.acceptedCommands) + numberOrZero(right.acceptedCommands),
    appendErrors: numberOrZero(left.appendErrors) + numberOrZero(right.appendErrors),
    projectionEnqueued: numberOrZero(left.projectionEnqueued) + numberOrZero(right.projectionEnqueued),
    projectionSucceeded: numberOrZero(left.projectionSucceeded) + numberOrZero(right.projectionSucceeded),
    projectionFailed: numberOrZero(left.projectionFailed) + numberOrZero(right.projectionFailed),
    queueDepth: numberOrZero(left.queueDepth) + numberOrZero(right.queueDepth),
    maxOldestPendingAgeMs: maxNullable(
      numberOrNull(left.maxOldestPendingAgeMs),
      numberOrNull(right.maxOldestPendingAgeMs),
    ),
  };
}
