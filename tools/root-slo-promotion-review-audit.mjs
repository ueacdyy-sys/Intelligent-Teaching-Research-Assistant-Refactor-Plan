import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  allowInProgressQualityGateFromEnv,
  isQualityGateReportPassing,
  summarizeQualityGateReportState,
} from "./quality-gate-report-state.mjs";

const defaultOutPath = "reports/root-slo-promotion-review.current.json";
const defaultRootRequirementsPath = "../智能教研助手/项目根本需求（禁止改动）";

export const sourceReports = {
  rootWorkflowCoverage: "reports/root-workflow-coverage.current.json",
  crossModuleDiagnostics: "reports/cross-module-db-queue-diagnostics.current.json",
  pgbouncerProductionHeadroom: "reports/pgbouncer-production-headroom.current.json",
  sustainedScaleUp: "reports/system-sustained-mixed-workload-scaleup.current.json",
  quality: "reports/quality-gate.current.json",
};

export const rootSloPromotionPolicy = {
  reviewedClaim: "FULL_SYSTEM_PRODUCTION_READ_WRITE_10000_RPS",
  productionReadWriteRpsTarget: 10000,
  interactiveP99TargetMs: 300,
  minimumPgbouncerHeadroomRatio: 0.2,
  minimumSustainedStepName: "high",
  minimumSustainedStepRank: 4,
  rootAnchors: [
    "科研模式",
    "教学模式",
    "学生端",
    "知识库",
    "模型微调",
    "操纵电脑上的所有应用",
    "工作流",
    "插件",
  ],
};

export function auditRootSloPromotionReview(inputs) {
  const reports = parseReports(inputs.reports ?? {});
  const rootRequirementsText = String(inputs.rootRequirementsText ?? "");
  const auditFindings = buildAuditFindings(rootRequirementsText, reports);
  const evidence = buildPromotionEvidence(reports);
  const promotionFindings = buildPromotionFindings(evidence);
  const decision = promotionFindings.every((finding) => finding.passed)
    ? "APPROVE_PROMOTION"
    : "BLOCK_PROMOTION";
  const blockers = promotionFindings.filter((finding) => !finding.passed).map((finding) => ({
    id: finding.id,
    actual: finding.actual,
    expected: finding.expected,
    remediation: finding.remediation,
  }));
  const readiness = auditFindings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";

  return {
    generatedAt: new Date().toISOString(),
    readiness,
    workloadType: "ROOT_SLO_PROMOTION_REVIEW",
    rootRequirements: {
      sourcePath: inputs.rootRequirementsPath ?? null,
      matchedAnchors: rootSloPromotionPolicy.rootAnchors.filter((anchor) => containsText(rootRequirementsText, anchor)),
    },
    promotionPolicy: rootSloPromotionPolicy,
    evidence,
    promotion: {
      reviewedClaim: rootSloPromotionPolicy.reviewedClaim,
      decision: readiness === "READY" ? decision : "REVIEW_NOT_READY",
      claimStatus: readiness === "READY" && decision === "APPROVE_PROMOTION"
        ? "SUPPORTED_BY_CURRENT_ROOT_SLO_REVIEW"
        : "NOT_SUPPORTED_BY_CURRENT_ROOT_SLO_REVIEW",
      blockerCount: readiness === "READY" ? blockers.length : null,
      blockers: readiness === "READY" ? blockers : [],
      requiredNextEvidence: readiness === "READY"
        ? requiredNextEvidence(blockers)
        : ["REPAIR_ROOT_SLO_REVIEW_INPUTS"],
    },
    auditFindings,
    promotionFindings,
    nextAction: readiness !== "READY"
      ? "Fix the root SLO promotion review inputs before capacity assessment."
      : decision === "APPROVE_PROMOTION"
        ? "Promotion review approves the current production 10k read/write RPS claim; keep the exact SLO profile, workload shape, and quality gate attached to the claim."
        : "Do not promote the production 10k read/write RPS claim; remediate the listed root SLO blockers and rerun the review.",
  };
}

export function formatRootSloPromotionReview(report) {
  const lines = [
    `Root SLO promotion review: ${report.readiness}`,
    `Decision: ${report.promotion.decision}`,
    `Claim status: ${report.promotion.claimStatus}`,
    "",
    "Promotion blockers:",
  ];
  if (report.promotion.blockers.length === 0) {
    lines.push("- none");
  } else {
    for (const blocker of report.promotion.blockers) {
      lines.push(`- ${blocker.id}: actual=${stringifyScalar(blocker.actual)} expected=${stringifyScalar(blocker.expected)}`);
    }
  }
  lines.push("", "Audit findings:");
  for (const finding of report.auditFindings) {
    lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
  }
  lines.push("", "Promotion findings:");
  for (const finding of report.promotionFindings) {
    lines.push(`- ${finding.passed ? "PASS" : "BLOCK"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function buildAuditFindings(rootRequirementsText, reports) {
  const findings = [];
  const matchedAnchors = rootSloPromotionPolicy.rootAnchors.filter((anchor) => containsText(rootRequirementsText, anchor));
  addFinding(findings, {
    id: "root_requirements.present",
    passed: rootRequirementsText.trim().length > 0,
    actual: rootRequirementsText.trim().length > 0 ? "present" : "missing",
    expected: "immutable root requirements text is readable",
    remediation: "Read the immutable root requirements file before reviewing root SLO promotion.",
  });
  addFinding(findings, {
    id: "root_requirements.anchors_present",
    passed: matchedAnchors.length === rootSloPromotionPolicy.rootAnchors.length,
    actual: matchedAnchors.join(","),
    expected: rootSloPromotionPolicy.rootAnchors.join(","),
    remediation: "The promotion review must be anchored to teaching, research, student, knowledge, worker, agent, workflow, and plugin requirements.",
  });
  addFinding(findings, {
    id: "sources.required_reports_parseable",
    passed: Object.entries(sourceReports).every(([key]) => reports[key]?.parseable === true),
    actual: Object.entries(sourceReports).map(([key, reportPath]) => `${key}:${reports[key]?.parseable === true ? "json" : "missing_or_invalid"}:${reportPath}`).join(";"),
    expected: "root workflow, cross-module diagnostics, PgBouncer headroom, sustained scale-up, and quality reports are readable JSON",
    remediation: "Regenerate the missing prerequisite report before reviewing promotion.",
  });
  addFinding(findings, {
    id: "root_workflow.coverage_ready",
    passed: reports.rootWorkflowCoverage?.value?.readiness === "READY",
    actual: reports.rootWorkflowCoverage?.value?.readiness ?? "missing",
    expected: "READY",
    remediation: "Root workflow coverage must be ready before promotion review.",
  });
  addFinding(findings, {
    id: "cross_module.diagnostics_ready",
    passed: reports.crossModuleDiagnostics?.value?.readiness === "READY",
    actual: reports.crossModuleDiagnostics?.value?.readiness ?? "missing",
    expected: "READY",
    remediation: "Cross-module DB and queue diagnostics must be ready before promotion review.",
  });
  addFinding(findings, {
    id: "pgbouncer.production_headroom_ready",
    passed: reports.pgbouncerProductionHeadroom?.value?.readiness === "READY",
    actual: reports.pgbouncerProductionHeadroom?.value?.readiness ?? "missing",
    expected: "READY",
    remediation: "PgBouncer production headroom profile must be ready before root SLO promotion review.",
  });
  addFinding(findings, {
    id: "quality.gate_passed",
    passed: isQualityGateReportPassing(reports.quality?.value, {
      allowInProgress: allowInProgressQualityGateFromEnv(),
    }),
    actual: summarizeQualityGateReportState(reports.quality?.value),
    expected: "quality gate allPassed=true",
    remediation: "Never promote capacity from a failing quality gate.",
  });
  return findings;
}

function buildPromotionEvidence(reports) {
  const rootCoverage = reports.rootWorkflowCoverage?.value ?? {};
  const diagnostics = reports.crossModuleDiagnostics?.value ?? {};
  const productionHeadroom = reports.pgbouncerProductionHeadroom?.value ?? {};
  const sustainedScaleUp = reports.sustainedScaleUp?.value ?? {};
  const modules = Array.isArray(diagnostics.moduleDiagnostics) ? diagnostics.moduleDiagnostics : [];
  const identity = moduleById(modules, "identity_and_access");
  const conversation = moduleById(modules, "research_conversation_write");
  const teaching = moduleById(modules, "teaching_archive_and_quiz");
  const latencySamples = [
    latencySample("identity.slowest_p99_ms", identity?.metrics?.slowestP99Ms),
    latencySample("conversation.low_tail_p99_ms", conversation?.metrics?.lowTailP99Ms),
    latencySample("conversation.burst_p99_ms", conversation?.metrics?.burstP99Ms),
    latencySample("teaching_archive.slowest_p99_ms", teaching?.metrics?.slowestP99Ms),
    latencySample("sustained_scaleup.max_p99_ms", diagnostics.mixedWorkloadDiagnostics?.maxP99Ms),
  ].filter((sample) => Number.isFinite(sample.value));
  const maxLatency = latencySamples.sort((left, right) => right.value - left.value).at(0) ?? null;
  const pgbouncerMax = numberOrNull(diagnostics.databaseTopology?.pgbouncer?.maxDbConnections);
  const headroom = numberOrNull(diagnostics.databaseTopology?.hotPathPool?.pgbouncerHeadroom);
  const minimumHeadroom = Number.isFinite(pgbouncerMax)
    ? Math.ceil(pgbouncerMax * rootSloPromotionPolicy.minimumPgbouncerHeadroomRatio)
    : null;
  const productionHeadroomReady = productionHeadroom.readiness === "READY";
  const productionCandidateHeadroom = numberOrNull(productionHeadroom.candidate?.sourceHotPathHeadroom);
  const productionCandidateMinimumHeadroom = numberOrNull(productionHeadroom.candidate?.minimumHeadroom);
  const productionThroughput = productionThroughputEvidence(sustainedScaleUp, diagnostics);
  const shallowModules = modules
    .filter((module) => isShallowEvidenceClass(module.classification))
    .map((module) => `${module.id}:${module.classification}`);
  const contractOnlyWorkflows = Array.isArray(rootCoverage.workflows)
    ? rootCoverage.workflows
      .filter((workflow) => workflow.mixedWorkloadResults?.length === 0 || /CONTRACT_ONLY/i.test(workflow.coverageClass ?? ""))
      .map((workflow) => workflow.id)
    : [];
  const highestStep = diagnostics.mixedWorkloadDiagnostics?.highestPassedStep ?? sustainedScaleUp.summary?.highestPassedStep ?? null;
  return {
    rootWorkflowCoverage: {
      readiness: rootCoverage.readiness ?? null,
      coveredWorkflows: numberOrNull(rootCoverage.summary?.coveredWorkflows),
      totalWorkflows: numberOrNull(rootCoverage.summary?.totalWorkflows),
      contractOnlyWorkflows,
    },
    moduleEvidenceDepth: {
      shallowModules,
    },
    latency: {
      targetP99Ms: rootSloPromotionPolicy.interactiveP99TargetMs,
      samples: latencySamples,
      maxP99Ms: maxLatency?.value ?? null,
      maxP99Source: maxLatency?.name ?? null,
      identityRevokeCycleAttribution: {
        slowestStep: identity?.metrics?.revokeCycleSlowestStep ?? null,
        slowestStepP99Ms: numberOrNull(identity?.metrics?.revokeCycleSlowestStepP99Ms),
        stepP99SumMs: numberOrNull(identity?.metrics?.revokeCycleStepP99SumMs),
        p99ResidualMs: numberOrNull(identity?.metrics?.revokeCycleP99ResidualMs),
      },
    },
    databaseHeadroom: {
      pgbouncerMaxDbConnections: pgbouncerMax,
      currentHotPathPoolTotal: numberOrNull(diagnostics.databaseTopology?.hotPathPool?.totalMaxConns),
      currentHeadroom: headroom,
      minimumHeadroom,
      productionProfile: {
        readiness: productionHeadroom.readiness ?? null,
        candidateMaxDbConnections: numberOrNull(productionHeadroom.candidate?.maxDbConnections),
        sourceHotPathHeadroom: productionCandidateHeadroom,
        plannedBudgetHeadroom: numberOrNull(productionHeadroom.candidate?.plannedBudgetHeadroom),
        minimumHeadroom: productionCandidateMinimumHeadroom,
      },
      effectiveHeadroom: productionHeadroomReady ? productionCandidateHeadroom : headroom,
      effectiveMinimumHeadroom: productionHeadroomReady ? productionCandidateMinimumHeadroom : minimumHeadroom,
      satisfiedBy: productionHeadroomReady ? "production_headroom_profile" : "current_cross_module_diagnostics",
    },
    sustainedScale: {
      highestPassedStep: highestStep,
      highestPassedStepRank: stepRank(highestStep),
      minimumStepName: rootSloPromotionPolicy.minimumSustainedStepName,
      minimumStepRank: rootSloPromotionPolicy.minimumSustainedStepRank,
      totalErrors: numberOrNull(diagnostics.mixedWorkloadDiagnostics?.totalErrors ?? sustainedScaleUp.summary?.totalErrors),
      orchestrationErrors: numberOrNull(diagnostics.mixedWorkloadDiagnostics?.orchestrationErrors ?? sustainedScaleUp.summary?.orchestrationErrors),
    },
    productionThroughput: {
      targetReadWriteRps: rootSloPromotionPolicy.productionReadWriteRpsTarget,
      measuredReadWriteRps: productionThroughput.measuredReadWriteRps,
      source: productionThroughput.source,
    },
    quality: {
      allPassed: isQualityGateReportPassing(reports.quality?.value, {
        allowInProgress: allowInProgressQualityGateFromEnv(),
      }),
      commandCount: Array.isArray(reports.quality?.value?.commandResults) ? reports.quality.value.commandResults.length : null,
    },
  };
}

function buildPromotionFindings(evidence) {
  const findings = [];
  addPromotionFinding(findings, {
    id: "promotion.root_workflows_runtime_slo_covered",
    passed: evidence.rootWorkflowCoverage.contractOnlyWorkflows.length === 0,
    actual: evidence.rootWorkflowCoverage.contractOnlyWorkflows.join(",") || "none",
    expected: "no contract-only root workflows in a full-system runtime SLO claim",
    remediation: "Add runtime SLO evidence for workflow/plugin self-evolution before promoting the whole system.",
  });
  addPromotionFinding(findings, {
    id: "promotion.module_evidence_depth_sufficient",
    passed: evidence.moduleEvidenceDepth.shallowModules.length === 0,
    actual: evidence.moduleEvidenceDepth.shallowModules.join(";") || "none",
    expected: "no root module remains smoke-only, policy-only, worker-boundary-only, or review-only",
    remediation: "Promote Teaching, Knowledge, AI worker, and Agent/Workflow paths from boundary smoke to measurable runtime SLO evidence.",
  });
  addPromotionFinding(findings, {
    id: "promotion.interactive_tail_latency_within_target",
    passed: Number.isFinite(evidence.latency.maxP99Ms) &&
      evidence.latency.maxP99Ms <= rootSloPromotionPolicy.interactiveP99TargetMs,
    actual: formatLatencyActual(evidence.latency),
    expected: `max interactive/root workflow P99 <= ${rootSloPromotionPolicy.interactiveP99TargetMs}ms`,
    remediation: "Reduce the slowest root workflow tail latency before making a production 10k RPS claim.",
  });
  addPromotionFinding(findings, {
    id: "promotion.database_headroom_sufficient",
    passed: Number.isFinite(evidence.databaseHeadroom.effectiveHeadroom) &&
      Number.isFinite(evidence.databaseHeadroom.effectiveMinimumHeadroom) &&
      evidence.databaseHeadroom.effectiveHeadroom >= evidence.databaseHeadroom.effectiveMinimumHeadroom,
    actual: `satisfiedBy=${evidence.databaseHeadroom.satisfiedBy};current=${evidence.databaseHeadroom.currentHeadroom}/${evidence.databaseHeadroom.pgbouncerMaxDbConnections};candidate=${evidence.databaseHeadroom.productionProfile.sourceHotPathHeadroom}/${evidence.databaseHeadroom.productionProfile.candidateMaxDbConnections};minimum=${evidence.databaseHeadroom.effectiveMinimumHeadroom}`,
    expected: `PgBouncer headroom >= ${Math.round(rootSloPromotionPolicy.minimumPgbouncerHeadroomRatio * 100)}% of max_db_connections`,
    remediation: "Choose a production pool profile with enough PgBouncer headroom for combined root workflows.",
  });
  addPromotionFinding(findings, {
    id: "promotion.sustained_scale_depth_sufficient",
    passed: evidence.sustainedScale.highestPassedStepRank >= rootSloPromotionPolicy.minimumSustainedStepRank &&
      evidence.sustainedScale.totalErrors === 0 &&
      evidence.sustainedScale.orchestrationErrors === 0,
    actual: `highest=${evidence.sustainedScale.highestPassedStep};rank=${evidence.sustainedScale.highestPassedStepRank};errors=${evidence.sustainedScale.totalErrors};orchestration=${evidence.sustainedScale.orchestrationErrors}`,
    expected: `highest passed sustained mixed workload step >= ${rootSloPromotionPolicy.minimumSustainedStepName} with zero errors`,
    remediation: "Run a higher sustained mixed workload step before promotion.",
  });
  addPromotionFinding(findings, {
    id: "promotion.production_read_write_rps_target_met",
    passed: Number.isFinite(evidence.productionThroughput.measuredReadWriteRps) &&
      evidence.productionThroughput.measuredReadWriteRps >= rootSloPromotionPolicy.productionReadWriteRpsTarget,
    actual: formatProductionThroughputActual(evidence.productionThroughput),
    expected: `measured sustained read/write RPS >= ${rootSloPromotionPolicy.productionReadWriteRpsTarget}`,
    remediation: "Run a sustained mixed workload that records aggregate read/write RPS before making a production 10k RPS claim.",
  });
  return findings;
}

function requiredNextEvidence(blockers) {
  const ids = new Set();
  for (const blocker of blockers) {
    if (blocker.id === "promotion.root_workflows_runtime_slo_covered") ids.add("ROOT_WORKFLOW_RUNTIME_SLO_COVERAGE");
    if (blocker.id === "promotion.module_evidence_depth_sufficient") ids.add("MODULE_RUNTIME_SLO_DEPTH_FOR_TEACHING_KNOWLEDGE_WORKER_AGENT");
    if (blocker.id === "promotion.interactive_tail_latency_within_target") ids.add("ROOT_INTERACTIVE_TAIL_LATENCY_REMEDIATION");
    if (blocker.id === "promotion.database_headroom_sufficient") ids.add("PRODUCTION_PGBOUNCER_HEADROOM_PROFILE");
    if (blocker.id === "promotion.sustained_scale_depth_sufficient") ids.add("HIGHER_SUSTAINED_MIXED_WORKLOAD_STEP");
    if (blocker.id === "promotion.production_read_write_rps_target_met") ids.add("PRODUCTION_10000_RPS_SUSTAINED_EVIDENCE");
  }
  return [...ids];
}

function productionThroughputEvidence(sustainedScaleUp, diagnostics) {
  const candidates = [
    {
      source: "sustained_scaleup.summary.highestPassedReadWriteRps",
      value: sustainedScaleUp.summary?.highestPassedReadWriteRps,
    },
    {
      source: "sustained_scaleup.summary.highestPassedAggregateRps",
      value: sustainedScaleUp.summary?.highestPassedAggregateRps,
    },
    {
      source: "sustained_scaleup.summary.aggregateReadWriteRps",
      value: sustainedScaleUp.summary?.aggregateReadWriteRps,
    },
    {
      source: "cross_module.mixedWorkloadDiagnostics.highestPassedReadWriteRps",
      value: diagnostics.mixedWorkloadDiagnostics?.highestPassedReadWriteRps,
    },
  ];
  const highestStep = sustainedScaleUp.summary?.highestPassedStep;
  const highestStepReport = Array.isArray(sustainedScaleUp.steps)
    ? sustainedScaleUp.steps.find((step) => step.name === highestStep)
    : null;
  candidates.push(
    { source: `sustained_scaleup.steps.${highestStep}.readWriteRps`, value: highestStepReport?.readWriteRps },
    { source: `sustained_scaleup.steps.${highestStep}.aggregateRps`, value: highestStepReport?.aggregateRps },
    { source: `sustained_scaleup.steps.${highestStep}.totalRps`, value: highestStepReport?.totalRps },
  );
  for (const candidate of candidates) {
    const value = numberOrNull(candidate.value);
    if (Number.isFinite(value)) return { measuredReadWriteRps: value, source: candidate.source };
  }
  return { measuredReadWriteRps: null, source: "missing" };
}

function formatProductionThroughputActual(throughput) {
  if (!Number.isFinite(throughput.measuredReadWriteRps)) return "missing";
  return `${throughput.measuredReadWriteRps} rps from ${throughput.source}`;
}

function formatLatencyActual(latency) {
  const base = `${latency.maxP99Source ?? "missing"}=${latency.maxP99Ms}`;
  const attribution = latency.identityRevokeCycleAttribution;
  if (!attribution?.slowestStep) return base;
  return `${base};identityRevokeSlowestStep=${attribution.slowestStep}:${attribution.slowestStepP99Ms};stepP99Sum=${attribution.stepP99SumMs};p99Residual=${attribution.p99ResidualMs}`;
}

function parseReports(reports) {
  return Object.fromEntries(Object.entries(sourceReports).map(([key, reportPath]) => {
    const text = reports[reportPath];
    if (typeof text !== "string" || text.trim().length === 0) {
      return [key, { present: false, parseable: false }];
    }
    try {
      return [key, { present: true, parseable: true, value: JSON.parse(text) }];
    } catch (error) {
      return [key, { present: true, parseable: false, error: error.message }];
    }
  }));
}

function moduleById(modules, id) {
  return modules.find((module) => module.id === id) ?? null;
}

function isShallowEvidenceClass(classification) {
  return /SMOKE_ONLY|POLICY_SMOKE_ONLY|WORKER_BOUNDARY_ONLY|REVIEW_ONLY/i.test(classification ?? "");
}

function latencySample(name, value) {
  return { name, value: numberOrNull(value) };
}

function stepRank(step) {
  const ranks = {
    smoke: 1,
    low: 2,
    medium: 3,
    high: 4,
    production_candidate: 5,
  };
  return ranks[String(step ?? "").toLowerCase()] ?? 0;
}

function containsText(text, needle) {
  return String(text).toLowerCase().includes(String(needle).toLowerCase());
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function addFinding(findings, finding) {
  findings.push({
    id: finding.id,
    passed: Boolean(finding.passed),
    severity: finding.passed ? "info" : "error",
    actual: finding.actual ?? null,
    expected: finding.expected,
    remediation: finding.remediation,
  });
}

function addPromotionFinding(findings, finding) {
  findings.push({
    id: finding.id,
    passed: Boolean(finding.passed),
    severity: finding.passed ? "info" : "promotion_blocker",
    actual: finding.actual ?? null,
    expected: finding.expected,
    remediation: finding.remediation,
  });
}

function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return String(value);
}

function loadCurrentInputs(root, rootRequirementsPath) {
  return {
    rootRequirementsPath,
    rootRequirementsText: fs.readFileSync(path.resolve(root, rootRequirementsPath), "utf8"),
    reports: Object.fromEntries(Object.values(sourceReports).map((reportPath) => [
      reportPath,
      fs.readFileSync(path.join(root, reportPath), "utf8"),
    ])),
  };
}

function writeReport(root, reportPath, report) {
  const absolute = path.join(root, reportPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  const rootRequirementsIndex = argv.indexOf("--root-requirements");
  return {
    out: outIndex === -1 ? defaultOutPath : argv[outIndex + 1],
    rootRequirementsPath: rootRequirementsIndex === -1
      ? defaultRootRequirementsPath
      : argv[rootRequirementsIndex + 1],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = auditRootSloPromotionReview(loadCurrentInputs(root, args.rootRequirementsPath));
    writeReport(root, args.out, report);
    console.log(formatRootSloPromotionReview(report));
    process.exit(report.readiness === "READY" ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
