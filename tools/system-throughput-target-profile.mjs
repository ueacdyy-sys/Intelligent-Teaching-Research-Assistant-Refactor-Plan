import { buildProductionTargetPressureSummary } from "./system-production-target-pressure-profile.mjs";

export function summarizeThroughputTarget({ steps, summary, options }) {
  const configuredTargetSteps = targetBearingSteps(steps);
  const targetReadWriteRps = resolveTargetReadWriteRps(steps, options);
  const configured = Number.isFinite(targetReadWriteRps) && configuredTargetSteps.length > 0;
  const candidateSteps = configured
    ? configuredTargetSteps.filter((step) => step.targetReadWriteRps >= targetReadWriteRps)
    : [];
  const pressure = buildProductionTargetPressureSummary({
    candidateSteps,
    scaleProfile: options.scaleProfile,
    targetReadWriteRps,
  });
  const validCandidateStepNames = new Set(pressure.validStepNames ?? candidateSteps.map((step) => step.name));
  const validCandidateSteps = candidateSteps.filter((step) => validCandidateStepNames.has(step.name));
  const attemptedStepNames = validCandidateSteps.filter((step) => step.executed).map((step) => step.name);
  const highestPassedReadWriteRps = !configured
    ? numberOrNull(summary.maxPassedReadWriteRps)
    : pressure.status === "INVALID_PRESSURE"
    ? null
    : maxFinite(validCandidateSteps
      .filter((step) => step.executed && step.status === "PASSED" && step.guardrailStatus === "PASSED")
      .map((step) => step.readWriteRps));
  const met = configured && Number.isFinite(highestPassedReadWriteRps) &&
    highestPassedReadWriteRps >= targetReadWriteRps;
  const attempted = attemptedStepNames.length > 0 || met;
  const status = targetStatus({ configured, attempted, met, pressure });
  return {
    targetReadWriteRps: numberOrNull(targetReadWriteRps),
    required: parseBoolean(options.requireTargetReadWriteRps),
    configured,
    attempted,
    met,
    status,
    targetStepNames: candidateSteps.map((step) => step.name),
    attemptedStepNames,
    highestPassedStep: summary.highestPassedStep,
    highestPassedReadWriteRps,
    pressure,
    shortfallRps: configured && Number.isFinite(highestPassedReadWriteRps)
      ? roundRps(Math.max(targetReadWriteRps - highestPassedReadWriteRps, 0))
      : null,
  };
}

export function buildThroughputTargetNextAction(status, throughputTarget) {
  if (throughputTarget.required && throughputTarget.status === "NOT_CONFIGURED") {
    return "Configure a target-bearing production 10k sustained scale-up step before making a production RPS claim.";
  }
  if (throughputTarget.required && throughputTarget.status === "INVALID_PRESSURE") {
    return "Rerun with the full production 10k ladder or a custom target step that meets the effective pressure floor before treating the target as attempted.";
  }
  if (throughputTarget.required && throughputTarget.status === "NOT_ATTEMPTED") {
    return "Rerun the production 10k scale profile until the target step executes, then review the first blocking step.";
  }
  if (throughputTarget.required && throughputTarget.status === "ATTEMPTED_NOT_MET") {
    return "Optimize the bottlenecked root workflow and rerun the production 10k target step before promotion.";
  }
  return status === "PASSED"
    ? "Treat this as sustained mixed workload scale-up evidence only; add root workflow coverage and cross-module diagnostics before any full-system capacity promotion."
    : "Fix the first failed or guardrail-blocked sustained scale-up step before increasing full-system concurrency.";
}

export function targetBearingSteps(steps) {
  return steps.filter((step) => Number.isFinite(step.targetReadWriteRps));
}

export function resolveTargetReadWriteRps(steps, options) {
  const stepTargetReadWriteRps = maxFinite(targetBearingSteps(steps).map((step) => step.targetReadWriteRps));
  const optionTargetReadWriteRps = parseInteger(options.targetReadWriteRps);
  return optionTargetReadWriteRps > 0 ? optionTargetReadWriteRps : stepTargetReadWriteRps;
}

function targetStatus({ configured, attempted, met, pressure }) {
  if (!configured) return "NOT_CONFIGURED";
  if (pressure?.status === "INVALID_PRESSURE") return "INVALID_PRESSURE";
  if (met) return "MET";
  return attempted ? "ATTEMPTED_NOT_MET" : "NOT_ATTEMPTED";
}

function parseInteger(value) {
  if (!/^-?\d+$/u.test(String(value))) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function maxFinite(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? Math.max(...finite) : null;
}

function roundRps(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}
