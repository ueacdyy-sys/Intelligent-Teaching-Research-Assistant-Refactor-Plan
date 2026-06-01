export function isQualityGateReportPassing(report, options = {}) {
  if (report?.allPassed === true) return true;
  return options.allowInProgress === true &&
    report?.status === "IN_PROGRESS" &&
    report?.staticChecks?.passed === true;
}

export function allowInProgressQualityGateFromEnv(env = process.env) {
  return env.ITA_QUALITY_GATE_IN_PROGRESS === "1";
}

export function summarizeQualityGateReportState(report) {
  return [
    `allPassed=${report?.allPassed}`,
    `status=${report?.status}`,
    `staticPassed=${report?.staticChecks?.passed}`,
  ].join(";");
}
