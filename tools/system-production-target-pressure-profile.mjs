const production10kPressureConcurrencyPer1000Rps = {
  identity: 8,
  conversation: 32,
  teaching: 8,
};
const production10kPressureOperationMultiplier = 2;

export function buildProductionTargetPressureSummary({
  candidateSteps,
  targetReadWriteRps,
  scaleProfile,
}) {
  const required = requiresProductionTargetPressure(scaleProfile, targetReadWriteRps);
  const targetStepNames = candidateSteps.map((step) => step.name);
  if (!required) {
    return {
      required: false,
      status: "NOT_REQUIRED",
      targetStepNames,
      validStepNames: targetStepNames,
      invalidStepNames: [],
      findings: [],
    };
  }
  if (candidateSteps.length === 0) {
    return {
      required: true,
      status: "NOT_CONFIGURED",
      targetReadWriteRps: numberOrNull(targetReadWriteRps),
      floor: productionTargetPressureFloor(targetReadWriteRps),
      targetStepNames,
      validStepNames: [],
      invalidStepNames: [],
      findings: [],
    };
  }
  const findings = candidateSteps.flatMap((step) => targetPressureFindings(step, targetReadWriteRps));
  const invalidStepNames = [
    ...new Set(findings.filter((finding) => !finding.passed).map((finding) => finding.step)),
  ];
  const validStepNames = candidateSteps
    .filter((step) => !invalidStepNames.includes(step.name))
    .map((step) => step.name);
  return {
    required: true,
    status: validStepNames.length > 0 ? "PASSED" : "INVALID_PRESSURE",
    targetReadWriteRps: numberOrNull(targetReadWriteRps),
    floor: productionTargetPressureFloor(targetReadWriteRps),
    targetStepNames,
    validStepNames,
    invalidStepNames,
    findings,
  };
}

export function assertProductionTargetPressure({
  candidateSteps,
  required,
  scaleProfile,
  targetReadWriteRps,
}) {
  if (!required) return;
  const pressure = buildProductionTargetPressureSummary({
    candidateSteps,
    scaleProfile,
    targetReadWriteRps,
  });
  if (pressure.status !== "INVALID_PRESSURE") return;
  const invalidStepNames = pressure.invalidStepNames.join(", ");
  throw new Error(
    `required production 10k target step effective pressure is invalid for ${invalidStepNames}; use the full production10k ladder or raise custom target concurrency and operations`,
  );
}

export function productionTargetPressureFloor(targetReadWriteRps) {
  const targetUnits = Math.ceil(targetReadWriteRps / 1000);
  const identityConcurrency = targetUnits * production10kPressureConcurrencyPer1000Rps.identity;
  const conversationConcurrency = targetUnits * production10kPressureConcurrencyPer1000Rps.conversation;
  const teachingConcurrency = targetUnits * production10kPressureConcurrencyPer1000Rps.teaching;
  return {
    identityConcurrency,
    identityOperations: identityConcurrency * production10kPressureOperationMultiplier,
    conversationConcurrency,
    conversationOperations: conversationConcurrency * production10kPressureOperationMultiplier,
    teachingConcurrency,
    teachingOperations: teachingConcurrency * production10kPressureOperationMultiplier,
  };
}

function requiresProductionTargetPressure(scaleProfile, targetReadWriteRps) {
  return normalizeScaleProfile(scaleProfile) === "production10k" &&
    Number.isFinite(targetReadWriteRps) &&
    targetReadWriteRps > 0;
}

function targetPressureFindings(step, targetReadWriteRps) {
  const floor = productionTargetPressureFloor(targetReadWriteRps);
  return [
    pressureFloorFinding(step, "identityConcurrency", floor.identityConcurrency),
    pressureFloorFinding(step, "identityOperations", floor.identityOperations),
    pressureFloorFinding(step, "conversationConcurrency", floor.conversationConcurrency),
    pressureFloorFinding(step, "conversationOperations", floor.conversationOperations),
    pressureFloorFinding(step, "teachingConcurrency", floor.teachingConcurrency),
    pressureFloorFinding(step, "teachingOperations", floor.teachingOperations),
  ];
}

function pressureFloorFinding(step, field, expectedFloor) {
  return {
    id: `target_pressure.${kebabField(field)}_floor`,
    step: step.name,
    passed: numberOrZero(step[field]) >= expectedFloor,
    actual: numberOrZero(step[field]),
    expected: `>=${expectedFloor}`,
  };
}

function normalizeScaleProfile(value) {
  const normalized = String(value ?? "standard").trim().toLowerCase().replace(/[^a-z0-9]/gu, "");
  return normalized || "standard";
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function kebabField(value) {
  return String(value).replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);
}
