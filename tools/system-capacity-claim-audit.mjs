import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  allowInProgressQualityGateFromEnv,
  isQualityGateReportPassing,
  summarizeQualityGateReportState,
} from "./quality-gate-report-state.mjs";

const defaultOutPath = "reports/system-capacity-claim.current.json";
const registryPath = "contracts/ops/performance-evidence-registry.current.json";
const rootSloPromotionReviewReportPath = "reports/root-slo-promotion-review.current.json";

export const requiredEvidence = [
  {
    key: "identity",
    evidenceId: "identity_http_gateway_pgbouncer120_preconnect_retry_4400",
    reportPath: "reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-unlogged-session-table-pgbouncer120-preconnect-retry-ingress19080-clean-table-docker-bench.json",
  },
  {
    key: "conversation",
    evidenceId: "conversation_write_gateway_loadgen_runtime_decision_current",
    reportPath: "reports/conversation-loadgen-runtime-decision.current.json",
  },
  {
    key: "teachingArchive",
    evidenceId: "teaching_archive_gateway_current",
    reportPath: "reports/teaching-archive-benchmark.current.json",
  },
  {
    key: "knowledge",
    evidenceId: "knowledge_hybrid_retrieval_policy_smoke",
    reportPath: "reports/knowledge-retrieval-benchmark.current.json",
  },
  {
    key: "aiWorker",
    evidenceId: "ai_worker_runtime_dependency_profile",
    reportPath: "reports/ai-worker-runtime-dependency-profile.current.json",
  },
  {
    key: "quality",
    evidenceId: "strict_quality_gate_current",
    reportPath: "reports/quality-gate.current.json",
  },
];

export function auditSystemCapacityClaim(inputs) {
  const registry = inputs.registry ?? {};
  const entries = Array.isArray(registry.entries) ? registry.entries : [];
  const reports = parseReports(inputs.reports ?? {});
  const mixedWorkloadEntries = entries.filter(isMixedWorkloadEvidence);
  const sustainedMixedWorkloadEntries = entries.filter(isSustainedMixedWorkloadEvidence);
  const sustainedMixedWorkloadScaleUpEntries = entries.filter(isSustainedMixedWorkloadScaleUpEvidence);
  const rootWorkflowCoverageEntries = entries.filter(isRootWorkflowCoverageEvidence);
  const crossModuleDiagnosticsEntries = entries.filter(isCrossModuleDiagnosticsEvidence);
  const rootSloPromotionReviewEntries = entries.filter(isRootSloPromotionReviewEvidence);
  const evidence = Object.fromEntries(requiredEvidence.map((requirement) => [
    requirement.key,
    summarizeRequiredEvidence(requirement, entries, reports[requirement.reportPath]),
  ]));
  const rootSloPromotionReview = summarizeRootSloPromotionReview(
    reports[rootSloPromotionReviewReportPath],
  );

  const claim = buildClaimAssessment(
    evidence,
    mixedWorkloadEntries,
    sustainedMixedWorkloadEntries,
    sustainedMixedWorkloadScaleUpEntries,
    rootWorkflowCoverageEntries,
    crossModuleDiagnosticsEntries,
    rootSloPromotionReviewEntries,
    rootSloPromotionReview.summary,
  );
  const findings = [];
  addFinding(findings, {
    id: "sources.required_evidence_registered",
    passed: requiredEvidence.every((requirement) => evidence[requirement.key].registered),
    actual: requiredEvidence.map((requirement) => `${requirement.key}:${evidence[requirement.key].registered ? "registered" : "missing"}`).join(";"),
    expected: "identity, conversation, teachingArchive, knowledge, aiWorker, and quality evidence entries are registered",
    remediation: "Register every root-requirement performance and quality evidence source before auditing system capacity claims.",
  });
  addFinding(findings, {
    id: "sources.required_reports_parseable",
    passed: requiredEvidence.every((requirement) => evidence[requirement.key].reportPresent && evidence[requirement.key].reportParseable),
    actual: requiredEvidence.map((requirement) => `${requirement.key}:${evidence[requirement.key].reportParseable ? "json" : "missing_or_invalid"}`).join(";"),
    expected: "all required current source reports are readable JSON",
    remediation: "Regenerate the missing or invalid source report before using it for whole-system capacity assessment.",
  });
  addFinding(findings, {
    id: "quality.gate_passed",
    passed: evidence.quality.summary.allPassed === true,
    actual: evidence.quality.summary.reportState,
    expected: "quality gate allPassed=true",
    remediation: "Do not assess system capacity from a workspace whose strict quality gate is failing.",
  });
  addFinding(findings, {
    id: "baseline.no_forbidden_ai_runtime_dependencies",
    passed: evidence.aiWorker.summary.forbiddenAiPackageHits === 0,
    actual: `forbiddenHits=${evidence.aiWorker.summary.forbiddenAiPackageHits}`,
    expected: "forbidden AI/model/OCR/RAG/vector/training dependency hits=0",
    remediation: "Keep model, OCR, RAG, vector, embedding, and training dependencies outside the baseline runtime.",
  });
  addFinding(findings, {
    id: "claim.no_full_system_promotion_without_mixed_workload",
    passed: mixedWorkloadEntries.length > 0 || claim.fullSystemUltraConcurrency.status === "NOT_SUPPORTED_BY_CURRENT_EVIDENCE",
    actual: `mixedWorkloadEvidence=${mixedWorkloadEntries.length};claim=${claim.fullSystemUltraConcurrency.status}`,
    expected: "no full-system ultra-concurrency claim when mixed workload evidence is absent",
    remediation: "Add a mixed workload benchmark covering identity, conversation, teaching archive, knowledge, and worker admission before promoting a full-system claim.",
  });
  addFinding(findings, {
    id: "claim.module_limits_are_explicit",
    passed: claim.moduleLimits.every((limit) => limit.status !== "UNKNOWN"),
    actual: claim.moduleLimits.map((limit) => `${limit.module}:${limit.status}`).join(";"),
    expected: "each root module has an explicit current capacity or evidence-gap classification",
    remediation: "Record the current capacity boundary or evidence gap for every root module.",
  });

  return {
    generatedAt: new Date().toISOString(),
    readiness: findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION",
    workloadType: "SYSTEM_CAPACITY_CLAIM_AUDIT",
    claim,
    evidence,
    mixedWorkloadEvidence: {
      count: mixedWorkloadEntries.length,
      entries: mixedWorkloadEntries.map((entry) => ({
        evidenceId: entry.evidenceId,
        sourceReportPath: entry.sourceReportPath,
        status: entry.status,
      })),
    },
    sustainedMixedWorkloadEvidence: {
      count: sustainedMixedWorkloadEntries.length,
      entries: sustainedMixedWorkloadEntries.map((entry) => ({
        evidenceId: entry.evidenceId,
        sourceReportPath: entry.sourceReportPath,
        status: entry.status,
      })),
    },
    sustainedMixedWorkloadScaleUpEvidence: {
      count: sustainedMixedWorkloadScaleUpEntries.length,
      entries: sustainedMixedWorkloadScaleUpEntries.map((entry) => ({
        evidenceId: entry.evidenceId,
        sourceReportPath: entry.sourceReportPath,
        status: entry.status,
      })),
    },
    rootWorkflowCoverageEvidence: {
      count: rootWorkflowCoverageEntries.length,
      entries: rootWorkflowCoverageEntries.map((entry) => ({
        evidenceId: entry.evidenceId,
        sourceReportPath: entry.sourceReportPath,
        status: entry.status,
      })),
    },
    crossModuleDiagnosticsEvidence: {
      count: crossModuleDiagnosticsEntries.length,
      entries: crossModuleDiagnosticsEntries.map((entry) => ({
        evidenceId: entry.evidenceId,
        sourceReportPath: entry.sourceReportPath,
        status: entry.status,
      })),
    },
    rootSloPromotionReviewEvidence: {
      count: rootSloPromotionReviewEntries.length,
      reportPresent: rootSloPromotionReview.reportPresent,
      reportParseable: rootSloPromotionReview.reportParseable,
      summary: rootSloPromotionReview.summary,
      entries: rootSloPromotionReviewEntries.map((entry) => ({
        evidenceId: entry.evidenceId,
        sourceReportPath: entry.sourceReportPath,
        status: entry.status,
      })),
    },
    findings,
    sourceReferences: [
      "docs/sdd/0132-conversation-fanout-decision-audit.md",
      "docs/sdd/0133-conversation-client-trace-attribution-audit.md",
      "docs/sdd/0135-conversation-loadgen-runtime-decision-audit.md",
      "docs/sdd/0136-system-capacity-claim-audit.md",
      "docs/sdd/0137-system-mixed-workload-benchmark-runner.md",
      "docs/sdd/0138-system-mixed-workload-ladder-runner.md",
      "docs/sdd/0139-teaching-archive-mixed-workload-slice.md",
      "docs/sdd/0140-system-sustained-mixed-workload-runner.md",
      "docs/sdd/0141-system-sustained-mixed-workload-scale-up-runner.md",
      "docs/sdd/0142-root-workflow-coverage-audit.md",
      "docs/sdd/0144-root-slo-promotion-review-audit.md",
    ],
  };
}

export function formatSystemCapacityClaimAudit(report) {
  const lines = [
    `System capacity claim audit: ${report.readiness}`,
    "",
    `Full-system ultra-concurrency claim: ${report.claim.fullSystemUltraConcurrency.status}`,
    `Mixed workload evidence: ${report.mixedWorkloadEvidence.count}`,
    `Sustained mixed workload evidence: ${report.sustainedMixedWorkloadEvidence?.count ?? 0}`,
    `Sustained scale-up evidence: ${report.sustainedMixedWorkloadScaleUpEvidence?.count ?? 0}`,
    `Root workflow coverage evidence: ${report.rootWorkflowCoverageEvidence?.count ?? 0}`,
    `Cross-module DB/queue diagnostics evidence: ${report.crossModuleDiagnosticsEvidence?.count ?? 0}`,
    `Root SLO promotion review evidence: ${report.rootSloPromotionReviewEvidence?.count ?? 0}`,
    "",
    "Module limits:",
  ];
  for (const limit of report.claim.moduleLimits) {
    lines.push(`- ${limit.module}: ${limit.status} ${limit.summary}`);
  }
  lines.push("", "Findings:");
  for (const finding of report.findings) {
    lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  return lines.join("\n");
}

function summarizeRequiredEvidence(requirement, entries, reportState) {
  const entry = entries.find((candidate) => candidate.evidenceId === requirement.evidenceId);
  const base = {
    key: requirement.key,
    evidenceId: requirement.evidenceId,
    sourceReportPath: requirement.reportPath,
    registered: Boolean(entry),
    registryStatus: entry?.status ?? null,
    reportPresent: reportState?.present === true,
    reportParseable: reportState?.parseable === true,
  };
  if (!reportState?.parseable) return { ...base, summary: {} };
  return { ...base, summary: summarizeReport(requirement.key, reportState.value) };
}

function summarizeReport(key, report) {
  if (key === "identity") return summarizeIdentityReport(report);
  if (key === "conversation") return summarizeConversationRuntimeDecision(report);
  if (key === "teachingArchive") return summarizeTeachingArchiveReport(report);
  if (key === "knowledge") return summarizeKnowledgeReport(report);
  if (key === "aiWorker") return summarizeAiWorkerReport(report);
  if (key === "quality") return summarizeQualityReport(report);
  return {};
}

function summarizeIdentityReport(report) {
  const phases = Object.values(report.phases ?? {});
  const phaseSummaries = phases.map((phase) => ({
    name: phase.name,
    errors: numberOrZero(phase.errors),
    rps: numberOrNull(phase.rps),
    p95Ms: numberOrNull(phase.latencyMs?.p95),
    p99Ms: numberOrNull(phase.latencyMs?.p99),
  }));
  const slowestP95 = maxBy(phaseSummaries, "p95Ms");
  const slowestP99 = maxBy(phaseSummaries, "p99Ms");
  return {
    status: report.status ?? null,
    concurrency: numberOrNull(report.concurrency),
    operationsPerPhase: numberOrNull(report.operationsPerPhase),
    totalDurationMs: numberOrNull(report.totalDurationMs),
    executor: report.benchmarkRuntimeProfile?.executor ?? null,
    sessionTablePersistence: report.gatewayDatabaseProfile?.sessionTablePersistence ?? null,
    phaseErrors: sum(phaseSummaries.map((phase) => phase.errors)),
    slowestP95Phase: slowestP95?.name ?? null,
    slowestP95Ms: slowestP95?.p95Ms ?? null,
    slowestP99Phase: slowestP99?.name ?? null,
    slowestP99Ms: slowestP99?.p99Ms ?? null,
  };
}

function summarizeConversationRuntimeDecision(report) {
  return {
    readiness: report.readiness ?? null,
    lowTailConcurrency: numberOrNull(report.decisions?.lowTail?.selected?.concurrency),
    lowTailP99Ms: numberOrNull(report.decisions?.lowTail?.selected?.p99Ms),
    highConcurrency: numberOrNull(report.decisions?.highConcurrency?.selected?.concurrency),
    highConcurrencyP99Ms: numberOrNull(report.decisions?.highConcurrency?.selected?.p99Ms),
    burstCeilingConcurrency: numberOrNull(report.decisions?.burstCeiling?.selected?.concurrency),
    burstCeilingP99Ms: numberOrNull(report.decisions?.burstCeiling?.selected?.p99Ms),
    loadgenRecommendation: report.decisions?.highConcurrency?.recommendation ?? null,
  };
}

function summarizeTeachingArchiveReport(report) {
  const phases = Object.entries(report.phases ?? {}).map(([name, phase]) => ({
    name,
    errors: numberOrZero(phase.errors),
    rps: numberOrNull(phase.rps),
    p95Ms: numberOrNull(phase.latencyMs?.p95),
    p99Ms: numberOrNull(phase.latencyMs?.p99),
  }));
  const slowestP95 = maxBy(phases, "p95Ms");
  const slowestP99 = maxBy(phases, "p99Ms");
  return {
    status: report.status ?? null,
    concurrency: numberOrNull(report.concurrency),
    operationsPerPhase: numberOrNull(report.operationsPerPhase),
    dbMaxConns: numberOrNull(report.gatewayDatabaseProfile?.dbMaxConns),
    phaseErrors: sum(phases.map((phase) => phase.errors)),
    slowestP95Phase: slowestP95?.name ?? null,
    slowestP95Ms: slowestP95?.p95Ms ?? null,
    slowestP99Phase: slowestP99?.name ?? null,
    slowestP99Ms: slowestP99?.p99Ms ?? null,
  };
}

function summarizeKnowledgeReport(report) {
  return {
    readiness: report.readiness ?? null,
    p95QueryPlanMs: numberOrNull(report.benchmark?.metrics?.p95QueryPlanMs),
    totalPlans: numberOrNull(report.benchmark?.metrics?.totalPlans),
    workloadCount: Array.isArray(report.benchmark?.workloadResults) ? report.benchmark.workloadResults.length : 0,
  };
}

function summarizeAiWorkerReport(report) {
  return {
    readiness: report.readiness ?? null,
    baselineDependenciesScanned: Array.isArray(report.baselineDependencies) ? report.baselineDependencies.length : null,
    forbiddenAiPackageHits: countFindingActualNone(report, "baseline.no_forbidden_ai_packages") ? 0 : null,
  };
}

function summarizeQualityReport(report) {
  return {
    allPassed: isQualityGateReportPassing(report, {
      allowInProgress: allowInProgressQualityGateFromEnv(),
    }),
    reportState: summarizeQualityGateReportState(report),
    commandCount: Array.isArray(report.commandResults) ? report.commandResults.length : 0,
    staticFindings: Array.isArray(report.staticChecks?.findings) ? report.staticChecks.findings.length : null,
  };
}

function summarizeRootSloPromotionReview(reportState) {
  const base = {
    reportPresent: reportState?.present === true,
    reportParseable: reportState?.parseable === true,
  };
  if (!reportState?.parseable) return { ...base, summary: {} };
  const report = reportState.value;
  return {
    ...base,
    summary: {
      readiness: report.readiness ?? null,
      decision: report.promotion?.decision ?? null,
      claimStatus: report.promotion?.claimStatus ?? null,
      blockerCount: numberOrNull(report.promotion?.blockerCount),
      blockerIds: Array.isArray(report.promotion?.blockers)
        ? report.promotion.blockers.map((blocker) => blocker.id).filter(Boolean)
        : [],
      requiredNextEvidence: Array.isArray(report.promotion?.requiredNextEvidence)
        ? report.promotion.requiredNextEvidence.filter((item) => typeof item === "string")
        : [],
    },
  };
}

function buildClaimAssessment(
  evidence,
  mixedWorkloadEntries,
  sustainedMixedWorkloadEntries = [],
  sustainedMixedWorkloadScaleUpEntries = [],
  rootWorkflowCoverageEntries = [],
  crossModuleDiagnosticsEntries = [],
  rootSloPromotionReviewEntries = [],
  rootSloPromotionReview = {},
) {
  const moduleLimits = [
    identityLimit(evidence.identity.summary),
    conversationLimit(evidence.conversation.summary),
    teachingArchiveLimit(evidence.teachingArchive.summary),
    knowledgeLimit(evidence.knowledge.summary),
    aiWorkerLimit(evidence.aiWorker.summary),
    qualityLimit(evidence.quality.summary),
  ];
  const fullSystemStatus = fullSystemUltraConcurrencyStatus(
    mixedWorkloadEntries,
    rootSloPromotionReviewEntries,
    rootSloPromotionReview,
  );
  const requiredNextEvidence = mixedWorkloadEntries.length === 0
    ? [
        "MIXED_WORKLOAD_BENCHMARK",
        "SUSTAINED_DURATION_PROFILE",
        "ROOT_WORKFLOW_COVERAGE",
        "CROSS_MODULE_DATABASE_AND_QUEUE_DIAGNOSTICS",
      ]
    : sustainedMixedWorkloadEntries.length === 0
      ? [
          "SUSTAINED_MIXED_WORKLOAD_PROFILE",
          "ROOT_WORKFLOW_COVERAGE",
          "CROSS_MODULE_DATABASE_AND_QUEUE_DIAGNOSTICS",
          "PROMOTION_REVIEW_AGAINST_ROOT_SLOS",
        ]
    : sustainedMixedWorkloadScaleUpEntries.length === 0
      ? [
          "SUSTAINED_MIXED_WORKLOAD_SCALE_UP",
          "ROOT_WORKFLOW_COVERAGE",
          "CROSS_MODULE_DATABASE_AND_QUEUE_DIAGNOSTICS",
          "PROMOTION_REVIEW_AGAINST_ROOT_SLOS",
        ]
      : rootWorkflowCoverageEntries.length === 0
        ? [
            "ROOT_WORKFLOW_COVERAGE",
            "CROSS_MODULE_DATABASE_AND_QUEUE_DIAGNOSTICS",
            "PROMOTION_REVIEW_AGAINST_ROOT_SLOS",
          ]
      : crossModuleDiagnosticsEntries.length === 0
        ? [
            "CROSS_MODULE_DATABASE_AND_QUEUE_DIAGNOSTICS",
            "PROMOTION_REVIEW_AGAINST_ROOT_SLOS",
          ]
        : isBlockedRootSloPromotionReview(rootSloPromotionReviewEntries, rootSloPromotionReview)
        ? rootSloPromotionReview.requiredNextEvidence
        : isApprovedRootSloPromotionReview(rootSloPromotionReviewEntries, rootSloPromotionReview)
        ? []
        : [
            "PROMOTION_REVIEW_AGAINST_ROOT_SLOS",
          ];
  return {
    fullSystemUltraConcurrency: {
      status: fullSystemStatus,
      reason: fullSystemUltraConcurrencyReason(
        mixedWorkloadEntries,
        sustainedMixedWorkloadEntries,
        sustainedMixedWorkloadScaleUpEntries,
        rootWorkflowCoverageEntries,
        crossModuleDiagnosticsEntries,
        rootSloPromotionReviewEntries,
        rootSloPromotionReview,
      ),
      requiredNextEvidence,
    },
    moduleLimits,
  };
}

function fullSystemUltraConcurrencyStatus(
  mixedWorkloadEntries,
  rootSloPromotionReviewEntries,
  rootSloPromotionReview,
) {
  if (mixedWorkloadEntries.length === 0) return "NOT_SUPPORTED_BY_CURRENT_EVIDENCE";
  if (isApprovedRootSloPromotionReview(rootSloPromotionReviewEntries, rootSloPromotionReview)) {
    return "SUPPORTED_BY_CURRENT_ROOT_SLO_REVIEW";
  }
  if (isBlockedRootSloPromotionReview(rootSloPromotionReviewEntries, rootSloPromotionReview)) {
    return "NOT_SUPPORTED_BY_CURRENT_ROOT_SLO_REVIEW";
  }
  return "MIXED_WORKLOAD_EVIDENCE_PRESENT_REVIEW_REQUIRED";
}

function fullSystemUltraConcurrencyReason(
  mixedWorkloadEntries,
  sustainedMixedWorkloadEntries,
  sustainedMixedWorkloadScaleUpEntries,
  rootWorkflowCoverageEntries,
  crossModuleDiagnosticsEntries,
  rootSloPromotionReviewEntries,
  rootSloPromotionReview,
) {
  if (mixedWorkloadEntries.length === 0) {
    return "Current evidence is module-scoped; no mixed workload benchmark proves simultaneous identity, conversation, teaching archive, knowledge, and worker-admission capacity.";
  }
  if (sustainedMixedWorkloadEntries.length === 0) {
    return "Mixed workload evidence exists, but sustained five-slice execution evidence is still missing.";
  }
  if (sustainedMixedWorkloadScaleUpEntries.length === 0) {
    return "Sustained mixed workload smoke evidence exists and must still be scaled and reviewed against root requirement SLOs before promotion.";
  }
  if (rootWorkflowCoverageEntries.length === 0) {
    return "Sustained mixed workload scale-up evidence exists, but root workflow coverage, cross-module diagnostics, and root SLO review are still required before promotion.";
  }
  if (crossModuleDiagnosticsEntries.length === 0) {
    return "Root workflow coverage exists, but cross-module diagnostics and root SLO review are still required before promotion.";
  }
  if (isBlockedRootSloPromotionReview(rootSloPromotionReviewEntries, rootSloPromotionReview)) {
    return `Root SLO promotion review blocks the claim with ${rootSloPromotionReview.blockerCount} blocker(s): ${rootSloPromotionReview.blockerIds.join(",")}.`;
  }
  if (isApprovedRootSloPromotionReview(rootSloPromotionReviewEntries, rootSloPromotionReview)) {
    return "Root workflow coverage, cross-module diagnostics, sustained scale-up, quality, and root SLO promotion review all support the current full-system claim.";
  }
  return "Root workflow coverage and cross-module diagnostics exist, but root SLO promotion review is still required before any full-system ultra-concurrency claim.";
}

function isBlockedRootSloPromotionReview(entries, summary) {
  return entries.length > 0 &&
    summary.readiness === "READY" &&
    summary.claimStatus === "NOT_SUPPORTED_BY_CURRENT_ROOT_SLO_REVIEW";
}

function isApprovedRootSloPromotionReview(entries, summary) {
  return entries.length > 0 &&
    summary.readiness === "READY" &&
    summary.decision === "APPROVE_PROMOTION" &&
    summary.claimStatus === "SUPPORTED_BY_CURRENT_ROOT_SLO_REVIEW";
}

function identityLimit(summary) {
  if (summary.status !== "PASSED") return { module: "Identity And Access", status: "UNKNOWN", summary: "no passing identity source report" };
  return {
    module: "Identity And Access",
    status: "MODULE_CAPACITY_ONLY",
    summary: `passed ${summary.concurrency} clients with ${summary.slowestP99Phase} P99 ${summary.slowestP99Ms}ms; this is a module benchmark, not a full-system SLO`,
    concurrency: summary.concurrency,
    slowestP99Ms: summary.slowestP99Ms,
  };
}

function conversationLimit(summary) {
  if (summary.readiness !== "READY") return { module: "Research Conversation Write", status: "UNKNOWN", summary: "conversation runtime decision not ready" };
  return {
    module: "Research Conversation Write",
    status: "MODULE_CAPACITY_ONLY",
    summary: `low-tail ${summary.lowTailConcurrency} clients at P99 ${summary.lowTailP99Ms}ms; WSL burst ${summary.burstCeilingConcurrency} clients at P99 ${summary.burstCeilingP99Ms}ms is functional capacity only`,
    lowTailConcurrency: summary.lowTailConcurrency,
    burstCeilingConcurrency: summary.burstCeilingConcurrency,
  };
}

function teachingArchiveLimit(summary) {
  if (summary.status !== "PASSED") return { module: "Teaching Archive And Quiz", status: "UNKNOWN", summary: "teaching archive benchmark not passed" };
  return {
    module: "Teaching Archive And Quiz",
    status: "MODULE_SMOKE_ONLY",
    summary: `passed ${summary.concurrency} clients across archive create, quiz submission, and archive list phases; slowest P99 ${summary.slowestP99Ms}ms in ${summary.slowestP99Phase}`,
    concurrency: summary.concurrency,
    slowestP99Ms: summary.slowestP99Ms,
  };
}

function knowledgeLimit(summary) {
  if (summary.readiness !== "READY") return { module: "Knowledge Retrieval", status: "UNKNOWN", summary: "knowledge retrieval evidence not ready" };
  return {
    module: "Knowledge Retrieval",
    status: "POLICY_SMOKE_ONLY",
    summary: `hybrid query-plan P95 ${summary.p95QueryPlanMs}ms over ${summary.workloadCount} policy workloads; not a production corpus throughput benchmark`,
    p95QueryPlanMs: summary.p95QueryPlanMs,
  };
}

function aiWorkerLimit(summary) {
  if (summary.readiness !== "READY") return { module: "AI Worker Runtime", status: "UNKNOWN", summary: "AI worker dependency profile not ready" };
  return {
    module: "AI Worker Runtime",
    status: "DEPENDENCY_BOUNDARY_ONLY",
    summary: `${summary.baselineDependenciesScanned} baseline dependencies scanned with forbidden AI dependency hits ${summary.forbiddenAiPackageHits}; no worker throughput benchmark yet`,
    baselineDependenciesScanned: summary.baselineDependenciesScanned,
  };
}

function qualityLimit(summary) {
  if (summary.allPassed !== true) return { module: "Quality Gate", status: "UNKNOWN", summary: "strict quality gate failing or missing" };
  return {
    module: "Quality Gate",
    status: "QUALITY_READY",
    summary: `${summary.commandCount} quality commands passed with ${summary.staticFindings} static findings`,
    commandCount: summary.commandCount,
  };
}

function parseReports(reports) {
  return Object.fromEntries(Object.entries(reports).map(([reportPath, text]) => {
    if (typeof text !== "string" || text.trim().length === 0) {
      return [reportPath, { present: false, parseable: false }];
    }
    try {
      return [reportPath, { present: true, parseable: true, value: JSON.parse(text) }];
    } catch (error) {
      return [reportPath, { present: true, parseable: false, error: error.message }];
    }
  }));
}

function isMixedWorkloadEvidence(entry) {
  return ["MIXED_WORKLOAD", "MIXED_WORKLOAD_LADDER", "SUSTAINED_MIXED_WORKLOAD"].includes(entry.workloadType) ||
    /mixed|full.?system/i.test(entry.evidenceId ?? "");
}

function isSustainedMixedWorkloadEvidence(entry) {
  return entry.workloadType === "SUSTAINED_MIXED_WORKLOAD" ||
    (/sustained.*mixed/i.test(entry.evidenceId ?? "") && !/scale/i.test(entry.evidenceId ?? ""));
}

function isSustainedMixedWorkloadScaleUpEvidence(entry) {
  return entry.workloadType === "SUSTAINED_MIXED_WORKLOAD_SCALE_UP" || /sustained.*mixed.*scale/i.test(entry.evidenceId ?? "");
}

function isRootWorkflowCoverageEvidence(entry) {
  return entry.workloadType === "ROOT_WORKFLOW_COVERAGE" || /root.*workflow.*coverage/i.test(entry.evidenceId ?? "");
}

function isCrossModuleDiagnosticsEvidence(entry) {
  return entry.workloadType === "CROSS_MODULE_DATABASE_AND_QUEUE_DIAGNOSTICS" ||
    /cross.*module.*(db|database).*queue/i.test(entry.evidenceId ?? "");
}

function isRootSloPromotionReviewEvidence(entry) {
  return entry.workloadType === "ROOT_SLO_PROMOTION_REVIEW" ||
    /root.*slo.*promotion.*review/i.test(entry.evidenceId ?? "");
}

function countFindingActualNone(report, findingId) {
  return Array.isArray(report.findings) &&
    report.findings.some((finding) => finding.id === findingId && String(finding.actual).toLowerCase() === "none");
}

function maxBy(values, key) {
  return values
    .filter((value) => Number.isFinite(value[key]))
    .sort((left, right) => right[key] - left[key])
    .at(0) ?? null;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
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

function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return String(value);
}

function loadCurrentInputs(root) {
  const registry = JSON.parse(fs.readFileSync(path.join(root, registryPath), "utf8"));
  return {
    registry,
    reports: Object.fromEntries([
      ...requiredEvidence.map((requirement) => requirement.reportPath),
      rootSloPromotionReviewReportPath,
    ].map((reportPath) => [
      reportPath,
      fs.existsSync(path.join(root, reportPath))
        ? fs.readFileSync(path.join(root, reportPath), "utf8")
        : "",
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
  return {
    out: outIndex === -1 ? defaultOutPath : argv[outIndex + 1],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = auditSystemCapacityClaim(loadCurrentInputs(root));
    writeReport(root, args.out, report);
    console.log(formatSystemCapacityClaimAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
