import {
  maxFinite,
  minFinite,
  numberOrNull,
  numberOrZero,
  round,
  sanitizeCommandResult,
  sumFinite,
} from "./benchmark-runner-utils.mjs";
import { summarizeCommandLogDiagnostics } from "./conversation-command-log-summary.mjs";
import { buildSystemIdentityPhaseSummary } from "./system-identity-phase-summary.mjs";
import { summarizeTeachingArchiveReport } from "./system-teaching-benchmark-runtime-profile.mjs";

export async function runWorkloadCommand(command, root, runCommandFn) {
  const startedAt = new Date().toISOString();
  const result = await runCommandFn(command.command, command.args, root);
  return {
    name: command.name,
    startedAt,
    endedAt: new Date().toISOString(),
    ...sanitizeCommandResult(result),
  };
}

export function summarizeWorkload(command, result, reportState) {
  const report = reportState?.value;
  const status = sourceStatus(report, result);
  const summary = summarizeSourceReport(command.name, report);
  return {
    name: command.name,
    moduleSlice: command.moduleSlice,
    sourceReportPath: command.sourceReportPath,
    status,
    exitCode: result?.exitCode ?? 1,
    elapsedMs: result?.elapsedMs ?? null,
    errors: summary.errors ?? (status === "PASSED" || status === "READY" ? 0 : 1),
    p95Ms: summary.p95Ms ?? null,
    p99Ms: summary.p99Ms ?? null,
    rps: summary.rps ?? null,
    readiness: summary.readiness ?? null,
    reportPresent: reportState?.present === true,
    reportParseable: reportState?.parseable === true,
    outputTail: result?.outputTail ?? "",
    summary,
  };
}

function summarizeSourceReport(name, report) {
  if (!report || typeof report !== "object") return {};
  if (name === "identity_http") return summarizeIdentity(report);
  if (name === "conversation_write") return summarizeConversation(report);
  if (name === "teaching_archive") return summarizeTeachingArchiveReport(report);
  if (name === "knowledge_retrieval") {
    return {
      readiness: report.readiness ?? null,
      errors: report.readiness === "READY" ? 0 : 1,
      p95Ms: numberOrNull(report.benchmark?.metrics?.p95QueryPlanMs),
    };
  }
  if (name === "ai_worker_admission") {
    return {
      readiness: report.readiness ?? null,
      errors: report.readiness === "READY" ? 0 : 1,
    };
  }
  return {};
}

function summarizeIdentity(report) {
  const phases = Object.values(report.phases ?? {});
  const p95Values = phases.map((phase) => numberOrNull(phase.latencyMs?.p95)).filter(Number.isFinite);
  const p99Values = phases.map((phase) => numberOrNull(phase.latencyMs?.p99)).filter(Number.isFinite);
  const errors = phases.reduce((total, phase) => total + numberOrZero(phase.errors), 0);
  return {
    errors,
    p95Ms: p95Values.length ? Math.max(...p95Values) : null,
    p99Ms: p99Values.length ? Math.max(...p99Values) : null,
    rps: minFinite(phases.map((phase) => numberOrNull(phase.rps))),
    concurrency: numberOrNull(report.concurrency),
    ...buildSystemIdentityPhaseSummary(report.phases, report.gatewayDatabasePhaseDiagnostics),
  };
}

function summarizeConversation(report) {
  const phase = report.phases?.createConversation ?? {};
  return {
    errors: numberOrZero(phase.errors),
    p95Ms: numberOrNull(phase.latencyMs?.p95),
    p99Ms: numberOrNull(phase.latencyMs?.p99),
    rps: numberOrNull(phase.rps),
    concurrency: numberOrNull(report.concurrency),
    serverTimingP99Ms: numberOrNull(phase.serverTimingMs?.p99),
    clientServerGapP99Ms: numberOrNull(phase.clientServerGapMs?.p99),
    acceptanceMode: report.gatewayWriteProfile?.acceptanceMode ?? null,
    commandAppendP99Ms: numberOrNull(phase.serverTimingBreakdownMs?.["command.append"]?.p99),
    projectionEnqueueP99Ms: numberOrNull(phase.serverTimingBreakdownMs?.["projection.enqueue"]?.p99),
    dbAcquireP99Ms: numberOrNull(phase.serverTimingBreakdownMs?.["db.acquire"]?.p99),
    dbBatchWaitP99Ms: numberOrNull(phase.serverTimingBreakdownMs?.["db.batch_wait"]?.p99),
    dbInsertP99Ms: numberOrNull(phase.serverTimingBreakdownMs?.["db.insert"]?.p99),
    benchmarkRuntimeProfile: report.benchmarkRuntimeProfile ?? null,
    gatewayExitCode: report.gatewayExitCode ?? null,
    gatewaySignal: report.gatewaySignal ?? null,
    runtimeDiagnostics: summarizeGatewayDiagnostics(report.gatewayRuntimeDiagnostics),
    databaseDiagnostics: summarizeGatewayDiagnostics(report.gatewayDatabaseDiagnostics),
    commandLogDiagnostics: summarizeCommandLogDiagnostics(report.gatewayCommandLogDiagnostics),
  };
}

function summarizeGatewayDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== "object") return undefined;
  const summarized = Object.fromEntries(
    ["before", "after"].map((snapshotName) => [snapshotName, summarizeGatewaySnapshot(diagnostics[snapshotName])])
      .filter(([_name, snapshot]) => snapshot !== undefined),
  );
  return Object.keys(summarized).length > 0 ? summarized : undefined;
}

function summarizeGatewaySnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.gateways)) return undefined;
  const gateways = snapshot.gateways;
  const stats = gateways.map((gateway) => gateway.stats ?? {});
  return {
    gatewayCount: gateways.length,
    okGateways: gateways.filter((gateway) => gateway.status === "OK").length,
    unavailableGateways: gateways.filter((gateway) => gateway.status !== "OK").length,
    maxCurrentConns: maxFinite(stats.map((entry) => numberOrNull(entry.maxCurrentConns))),
    totalAcceptedConns: sumFinite(stats.map((entry) => numberOrNull(entry.acceptedConns))),
    totalEmptyAcquireCount: sumFinite(stats.map((entry) => numberOrNull(entry.emptyAcquireCount))),
    totalAcquireWaitTimeMs: round(sumFinite(stats.map((entry) => numberOrNull(entry.emptyAcquireWaitTimeMs))), 2),
  };
}

export function summarizeMixedWorkload(workloads, orchestrationErrors = 0) {
  const workloadErrors = workloads.reduce((total, workload) => total + workload.errors, 0);
  return {
    totalErrors: workloadErrors + orchestrationErrors,
    workloadErrors,
    orchestrationErrors,
    maxP95Ms: maxFinite(workloads.map((workload) => workload.p95Ms)),
    maxP99Ms: maxFinite(workloads.map((workload) => workload.p99Ms)),
    passedWorkloads: workloads.filter((workload) => workload.status === "PASSED" || workload.status === "READY").length,
    failedWorkloads: workloads.filter((workload) => workload.status !== "PASSED" && workload.status !== "READY").length,
  };
}

function sourceStatus(report, result) {
  if (result?.exitCode !== 0) return "FAILED";
  if (!report || typeof report !== "object") return "FAILED";
  if (typeof report.status === "string") return report.status;
  if (typeof report.readiness === "string") return report.readiness;
  if (typeof report.allPassed === "boolean") return report.allPassed ? "PASSED" : "FAILED";
  return "FAILED";
}
