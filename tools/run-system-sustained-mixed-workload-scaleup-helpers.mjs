import { spawnSync } from "node:child_process";

import {
  maskSensitive,
  maxFinite,
  maxNullable,
  minFinite,
  numberOrNull,
  numberOrZero,
  parseInteger,
  tailText,
  toRunnableCommand,
} from "./benchmark-runner-utils.mjs";
import { dockerStackScript } from "./run-system-mixed-workload-benchmark.mjs";
import { mergeCommandLogDiagnostics } from "./conversation-command-log-summary.mjs";
import { mergeSystemIdentityPhaseSummary } from "./system-identity-phase-summary.mjs";

export function cleanupDocker(options, root, runSyncFn) {
  if (options.dockerCleanup === "none") return [];
  const script = dockerStackScript(options, options.dockerCleanup === "down" ? "down" : "reset");
  return [{ phase: "cleanup", ...runSyncFn("npm", ["run", script], root) }];
}

export function runSync(command, args, root) {
  const startedAt = Date.now();
  const runnable = toRunnableCommand(command, args);
  const result = spawnSync(runnable.command, runnable.args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  return {
    command,
    args,
    exitCode: result.status ?? 1,
    elapsedMs: Date.now() - startedAt,
    outputTail: tailText(maskSensitive(`${result.stdout ?? ""}${result.stderr ?? ""}`), 40),
    error: result.error?.message,
  };
}

export function summarizeStep(step, report, options) {
  if (!report || typeof report !== "object") {
    return {
      name: step.name,
      executed: false,
      status: "NOT_RUN",
      guardrailStatus: "NOT_RUN",
      reportPath: step.reportPath,
      identityConcurrency: step.identityConcurrency,
      identityOperations: step.identityOperations,
      conversationConcurrency: step.conversationConcurrency,
      conversationOperations: step.conversationOperations,
      teachingConcurrency: step.teachingConcurrency,
      teachingOperations: step.teachingOperations,
      totalErrors: 0,
      maxP95Ms: null,
      maxP99Ms: null,
      p99DriftMs: null,
      readWriteRps: null,
      aggregateRps: null,
      targetReadWriteRps: step.targetReadWriteRps,
      targetCandidate: Number.isFinite(step.targetReadWriteRps),
      guardrailFindings: [],
    };
  }
  const guardrailFindings = buildGuardrailFindings(report, options);
  const throughput = summarizeStepThroughput(report);
  return {
    name: step.name,
    executed: true,
    status: report.status ?? "FAILED",
    guardrailStatus: guardrailFindings.every((finding) => finding.passed) ? "PASSED" : "BLOCKED",
    reportPath: step.reportPath,
    identityConcurrency: step.identityConcurrency,
    identityOperations: step.identityOperations,
    conversationConcurrency: step.conversationConcurrency,
    conversationOperations: step.conversationOperations,
    teachingConcurrency: step.teachingConcurrency,
    teachingOperations: step.teachingOperations,
    samples: numberOrNull(report.summary?.executedSamples),
    totalErrors: numberOrZero(report.summary?.totalErrors),
    maxP95Ms: numberOrNull(report.summary?.maxP95Ms),
    maxP99Ms: numberOrNull(report.summary?.maxP99Ms),
    p99DriftMs: numberOrNull(report.summary?.p99DriftMs),
    readWriteRps: throughput.readWriteRps,
    aggregateRps: throughput.aggregateRps,
    targetReadWriteRps: step.targetReadWriteRps,
    targetCandidate: Number.isFinite(step.targetReadWriteRps),
    workloads: summarizeWorkloads(report),
    guardrailFindings,
  };
}

export function summarizeScaleUp(steps, orchestrationErrors) {
  const executedSteps = steps.filter((step) => step.executed);
  const passedSteps = executedSteps.filter((step) => step.status === "PASSED" && step.guardrailStatus === "PASSED");
  const blockedSteps = executedSteps.filter((step) => step.status !== "PASSED" || step.guardrailStatus !== "PASSED");
  const highestPassedStep = passedSteps.at(-1) ?? null;
  const highestPassedReadWriteRps = numberOrNull(highestPassedStep?.readWriteRps);
  const highestPassedAggregateRps = numberOrNull(highestPassedStep?.aggregateRps);
  return {
    configuredSteps: steps.length,
    executedSteps: executedSteps.length,
    passedSteps: passedSteps.length,
    blockedSteps: blockedSteps.length,
    totalErrors: executedSteps.reduce((total, step) => total + step.totalErrors, 0) + orchestrationErrors,
    orchestrationErrors,
    maxP95Ms: maxFinite(executedSteps.map((step) => step.maxP95Ms)),
    maxP99Ms: maxFinite(executedSteps.map((step) => step.maxP99Ms)),
    maxP99DriftMs: maxFinite(executedSteps.map((step) =>
      Number.isFinite(step.p99DriftMs) ? Math.abs(step.p99DriftMs) : null,
    )),
    highestPassedReadWriteRps,
    highestPassedAggregateRps,
    maxPassedReadWriteRps: maxFinite(passedSteps.map((step) => step.readWriteRps)),
    aggregateReadWriteRps: highestPassedReadWriteRps,
    highestPassedStep: highestPassedStep?.name ?? null,
    firstBlockedStep: blockedSteps.at(0)?.name ?? null,
  };
}

export function stepBlocksFurtherScale(report, options) {
  if (!report || typeof report !== "object") return true;
  return buildGuardrailFindings(report, options).some((finding) => !finding.passed);
}

function buildGuardrailFindings(report, options) {
  const maxP99Ms = numberOrNull(report.summary?.maxP99Ms);
  const p99DriftMs = numberOrNull(report.summary?.p99DriftMs);
  const totalErrors = numberOrZero(report.summary?.totalErrors);
  const p99Limit = parseInteger(options.maxP99Ms);
  const driftLimit = parseInteger(options.maxP99DriftMs);
  return [
    {
      id: "step.status_passed",
      passed: report.status === "PASSED",
      actual: report.status ?? "missing",
      expected: "PASSED",
    },
    {
      id: "step.total_errors_zero",
      passed: totalErrors === 0,
      actual: totalErrors,
      expected: 0,
    },
    {
      id: "step.max_p99_within_guardrail",
      passed: Number.isFinite(maxP99Ms) && maxP99Ms <= p99Limit,
      actual: maxP99Ms,
      expected: `<=${p99Limit}`,
    },
    {
      id: "step.p99_drift_within_guardrail",
      passed: !Number.isFinite(p99DriftMs) || Math.abs(p99DriftMs) <= driftLimit,
      actual: p99DriftMs,
      expected: `abs<=${driftLimit}`,
    },
  ];
}

function summarizeWorkloads(report) {
  return Array.isArray(report.samples)
    ? report.samples.flatMap((sample) => sample.workloads ?? []).reduce((workloads, workload) => {
        const existing = workloads.find((entry) => entry.name === workload.name);
        if (existing) {
          existing.errors += numberOrZero(workload.errors);
          existing.maxP99Ms = maxNullable(existing.maxP99Ms, numberOrNull(workload.p99Ms));
          existing.summary = mergeWorkloadSummary(existing.summary, workload.summary);
          return workloads;
        }
        workloads.push({
          name: workload.name,
          errors: numberOrZero(workload.errors),
          maxP99Ms: numberOrNull(workload.p99Ms),
          summary: copyWorkloadSummary(workload.summary),
        });
        return workloads;
      }, [])
    : [];
}

function copyWorkloadSummary(summary) {
  return summary && typeof summary === "object" ? { ...summary } : undefined;
}

function mergeWorkloadSummary(left, right) {
  if (!left || typeof left !== "object") return copyWorkloadSummary(right);
  if (!right || typeof right !== "object") return left;
  const merged = {
    ...left,
    ...right,
    errors: numberOrZero(left.errors) + numberOrZero(right.errors),
    p95Ms: maxNullable(numberOrNull(left.p95Ms), numberOrNull(right.p95Ms)),
    p99Ms: maxNullable(numberOrNull(left.p99Ms), numberOrNull(right.p99Ms)),
    serverTimingP99Ms: maxNullable(numberOrNull(left.serverTimingP99Ms), numberOrNull(right.serverTimingP99Ms)),
    clientServerGapP99Ms: maxNullable(
      numberOrNull(left.clientServerGapP99Ms),
      numberOrNull(right.clientServerGapP99Ms),
    ),
    acceptanceMode: right.acceptanceMode ?? left.acceptanceMode,
    commandAppendP99Ms: maxNullable(numberOrNull(left.commandAppendP99Ms), numberOrNull(right.commandAppendP99Ms)),
    projectionEnqueueP99Ms: maxNullable(
      numberOrNull(left.projectionEnqueueP99Ms),
      numberOrNull(right.projectionEnqueueP99Ms),
    ),
    dbAcquireP99Ms: maxNullable(numberOrNull(left.dbAcquireP99Ms), numberOrNull(right.dbAcquireP99Ms)),
    dbBatchWaitP99Ms: maxNullable(numberOrNull(left.dbBatchWaitP99Ms), numberOrNull(right.dbBatchWaitP99Ms)),
    dbExecP99Ms: maxNullable(numberOrNull(left.dbExecP99Ms), numberOrNull(right.dbExecP99Ms)),
    dbInsertP99Ms: maxNullable(numberOrNull(left.dbInsertP99Ms), numberOrNull(right.dbInsertP99Ms)),
    responseEncodeP99Ms: maxNullable(
      numberOrNull(left.responseEncodeP99Ms),
      numberOrNull(right.responseEncodeP99Ms),
    ),
    runtimeDiagnostics: right.runtimeDiagnostics ?? left.runtimeDiagnostics,
    databaseDiagnostics: right.databaseDiagnostics ?? left.databaseDiagnostics,
    commandLogDiagnostics: mergeCommandLogDiagnostics(left.commandLogDiagnostics, right.commandLogDiagnostics),
    gatewayExitCode: right.gatewayExitCode ?? left.gatewayExitCode,
    gatewaySignal: right.gatewaySignal ?? left.gatewaySignal,
  };
  if (left.phases || right.phases || left.dominantPhase || right.dominantPhase) {
    const identityPhaseSummary = mergeSystemIdentityPhaseSummary(left, right);
    merged.phases = identityPhaseSummary?.phases;
    merged.dominantPhase = identityPhaseSummary?.dominantPhase ?? null;
    merged.dominantPhaseP99Ms = identityPhaseSummary?.dominantPhaseP99Ms ?? null;
  }
  return merged;
}

function summarizeStepThroughput(report) {
  const readWriteRps = firstFinite(
    report.summary?.readWriteRps,
    report.summary?.aggregateReadWriteRps,
    report.summary?.minPassedReadWriteRps,
    minFinite((report.samples ?? []).map((sample) => numberOrNull(sample.readWriteRps))),
  );
  return {
    readWriteRps,
    aggregateRps: firstFinite(report.summary?.aggregateReadWriteRps, report.summary?.readWriteRps, readWriteRps),
  };
}

function firstFinite(...values) {
  return values.find(Number.isFinite) ?? null;
}
