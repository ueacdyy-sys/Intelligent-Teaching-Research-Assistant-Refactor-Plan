import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditSystemCapacityClaim,
  formatSystemCapacityClaimAudit,
  requiredEvidence,
} from "./system-capacity-claim-audit.mjs";

const currentIdentityEvidenceId = "identity_http_gateway_pgbouncer120_preconnect_retry_4400";
const currentIdentitySourceReport =
  "reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-unlogged-session-table-pgbouncer120-preconnect-retry-ingress19080-clean-table-docker-bench.json";
const sustainedFixtureReadWriteRps = 2107.3;

describe("system capacity claim audit", () => {
  it("passes the current module evidence while blocking full-system ultra-concurrency promotion", () => {
    const report = auditSystemCapacityClaim(currentInputs());

    const identityRequirement = requiredEvidence.find((requirement) => requirement.key === "identity");
    assert.equal(identityRequirement.evidenceId, currentIdentityEvidenceId);
    assert.equal(identityRequirement.reportPath, currentIdentitySourceReport);
    assert.equal(report.readiness, "READY");
    assert.equal(report.claim.fullSystemUltraConcurrency.status, "NOT_SUPPORTED_BY_CURRENT_EVIDENCE");
    assert.equal(report.mixedWorkloadEvidence.count, 0);
    assert.equal(report.sustainedMixedWorkloadEvidence.count, 0);
    assert.match(formatSystemCapacityClaimAudit(report), /System capacity claim audit: READY/);
    assert.match(report.claim.moduleLimits.find((limit) => limit.module === "Research Conversation Write").summary, /WSL burst 30000/);
    assert.equal(report.claim.moduleLimits.find((limit) => limit.module === "Teaching Archive And Quiz").status, "MODULE_SMOKE_ONLY");
  });

  it("fails readiness when required evidence is not registered", () => {
    const inputs = currentInputs();
    inputs.registry.entries = inputs.registry.entries.filter((entry) => entry.evidenceId !== requiredEvidence[0].evidenceId);

    const report = auditSystemCapacityClaim(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "sources.required_evidence_registered").passed, false);
  });

  it("requires review instead of promotion when mixed workload smoke evidence is registered", () => {
    const inputs = currentInputs();
    inputs.registry.entries.push({
      evidenceId: "system_mixed_workload_smoke_current",
      workloadType: "MIXED_WORKLOAD",
      sourceReportPath: "reports/system-mixed-workload-benchmark.current.json",
      status: "PASSED",
    });

    const report = auditSystemCapacityClaim(inputs);

    assert.equal(report.readiness, "READY");
    assert.equal(report.mixedWorkloadEvidence.count, 1);
    assert.equal(report.sustainedMixedWorkloadEvidence.count, 0);
    assert.equal(report.claim.fullSystemUltraConcurrency.status, "MIXED_WORKLOAD_EVIDENCE_PRESENT_REVIEW_REQUIRED");
    assert.deepEqual(report.claim.fullSystemUltraConcurrency.requiredNextEvidence, [
      "SUSTAINED_MIXED_WORKLOAD_PROFILE",
      "ROOT_WORKFLOW_COVERAGE",
      "CROSS_MODULE_DATABASE_AND_QUEUE_DIAGNOSTICS",
      "PROMOTION_REVIEW_AGAINST_ROOT_SLOS",
    ]);
  });

  it("tracks sustained mixed workload smoke while still requiring scale-up review", () => {
    const inputs = currentInputs();
    inputs.registry.entries.push({
      evidenceId: "system_mixed_workload_smoke_current",
      workloadType: "MIXED_WORKLOAD",
      sourceReportPath: "reports/system-mixed-workload-benchmark.current.json",
      status: "PASSED",
    });
    inputs.registry.entries.push({
      evidenceId: "system_sustained_mixed_workload_current",
      workloadType: "SUSTAINED_MIXED_WORKLOAD",
      sourceReportPath: "reports/system-sustained-mixed-workload.current.json",
      status: "PASSED",
    });

    const report = auditSystemCapacityClaim(inputs);

    assert.equal(report.readiness, "READY");
    assert.equal(report.mixedWorkloadEvidence.count, 2);
    assert.equal(report.sustainedMixedWorkloadEvidence.count, 1);
    assert.equal(report.claim.fullSystemUltraConcurrency.status, "MIXED_WORKLOAD_EVIDENCE_PRESENT_REVIEW_REQUIRED");
    assert.deepEqual(report.claim.fullSystemUltraConcurrency.requiredNextEvidence, [
      "SUSTAINED_MIXED_WORKLOAD_SCALE_UP",
      "ROOT_WORKFLOW_COVERAGE",
      "CROSS_MODULE_DATABASE_AND_QUEUE_DIAGNOSTICS",
      "PROMOTION_REVIEW_AGAINST_ROOT_SLOS",
    ]);
  });

  it("tracks sustained scale-up evidence while still blocking promotion until root workflow review", () => {
    const inputs = currentInputs();
    inputs.registry.entries.push({
      evidenceId: "system_mixed_workload_smoke_current",
      workloadType: "MIXED_WORKLOAD",
      sourceReportPath: "reports/system-mixed-workload-benchmark.current.json",
      status: "PASSED",
    });
    inputs.registry.entries.push({
      evidenceId: "system_sustained_mixed_workload_current",
      workloadType: "SUSTAINED_MIXED_WORKLOAD",
      sourceReportPath: "reports/system-sustained-mixed-workload.current.json",
      status: "PASSED",
    });
    inputs.registry.entries.push({
      evidenceId: "system_sustained_mixed_workload_scaleup_current",
      workloadType: "SUSTAINED_MIXED_WORKLOAD_SCALE_UP",
      sourceReportPath: "reports/system-sustained-mixed-workload-scaleup.current.json",
      status: "PASSED",
    });

    const report = auditSystemCapacityClaim(inputs);

    assert.equal(report.readiness, "READY");
    assert.equal(report.mixedWorkloadEvidence.count, 3);
    assert.equal(report.sustainedMixedWorkloadEvidence.count, 1);
    assert.equal(report.sustainedMixedWorkloadScaleUpEvidence.count, 1);
    assert.equal(report.claim.fullSystemUltraConcurrency.status, "MIXED_WORKLOAD_EVIDENCE_PRESENT_REVIEW_REQUIRED");
    assert.deepEqual(report.claim.fullSystemUltraConcurrency.requiredNextEvidence, [
      "ROOT_WORKFLOW_COVERAGE",
      "CROSS_MODULE_DATABASE_AND_QUEUE_DIAGNOSTICS",
      "PROMOTION_REVIEW_AGAINST_ROOT_SLOS",
    ]);
  });

  it("tracks root workflow coverage while still requiring diagnostics and SLO review", () => {
    const inputs = currentInputs();
    inputs.registry.entries.push({
      evidenceId: "system_mixed_workload_smoke_current",
      workloadType: "MIXED_WORKLOAD",
      sourceReportPath: "reports/system-mixed-workload-benchmark.current.json",
      status: "PASSED",
    });
    inputs.registry.entries.push({
      evidenceId: "system_sustained_mixed_workload_current",
      workloadType: "SUSTAINED_MIXED_WORKLOAD",
      sourceReportPath: "reports/system-sustained-mixed-workload.current.json",
      status: "PASSED",
    });
    inputs.registry.entries.push({
      evidenceId: "system_sustained_mixed_workload_scaleup_current",
      workloadType: "SUSTAINED_MIXED_WORKLOAD_SCALE_UP",
      sourceReportPath: "reports/system-sustained-mixed-workload-scaleup.current.json",
      status: "PASSED",
    });
    inputs.registry.entries.push({
      evidenceId: "root_workflow_coverage_current",
      workloadType: "ROOT_WORKFLOW_COVERAGE",
      sourceReportPath: "reports/root-workflow-coverage.current.json",
      status: "READY",
    });

    const report = auditSystemCapacityClaim(inputs);

    assert.equal(report.readiness, "READY");
    assert.equal(report.mixedWorkloadEvidence.count, 3);
    assert.equal(report.sustainedMixedWorkloadEvidence.count, 1);
    assert.equal(report.sustainedMixedWorkloadScaleUpEvidence.count, 1);
    assert.equal(report.rootWorkflowCoverageEvidence.count, 1);
    assert.equal(report.claim.fullSystemUltraConcurrency.status, "MIXED_WORKLOAD_EVIDENCE_PRESENT_REVIEW_REQUIRED");
    assert.deepEqual(report.claim.fullSystemUltraConcurrency.requiredNextEvidence, [
      "CROSS_MODULE_DATABASE_AND_QUEUE_DIAGNOSTICS",
      "PROMOTION_REVIEW_AGAINST_ROOT_SLOS",
    ]);
  });

  it("tracks cross-module diagnostics while still requiring root SLO promotion review", () => {
    const inputs = currentInputs();
    inputs.registry.entries.push({
      evidenceId: "system_mixed_workload_smoke_current",
      workloadType: "MIXED_WORKLOAD",
      sourceReportPath: "reports/system-mixed-workload-benchmark.current.json",
      status: "PASSED",
    });
    inputs.registry.entries.push({
      evidenceId: "system_sustained_mixed_workload_current",
      workloadType: "SUSTAINED_MIXED_WORKLOAD",
      sourceReportPath: "reports/system-sustained-mixed-workload.current.json",
      status: "PASSED",
    });
    inputs.registry.entries.push({
      evidenceId: "system_sustained_mixed_workload_scaleup_current",
      workloadType: "SUSTAINED_MIXED_WORKLOAD_SCALE_UP",
      sourceReportPath: "reports/system-sustained-mixed-workload-scaleup.current.json",
      status: "PASSED",
    });
    inputs.registry.entries.push({
      evidenceId: "root_workflow_coverage_current",
      workloadType: "ROOT_WORKFLOW_COVERAGE",
      sourceReportPath: "reports/root-workflow-coverage.current.json",
      status: "READY",
    });
    inputs.registry.entries.push({
      evidenceId: "cross_module_db_queue_diagnostics_current",
      workloadType: "CROSS_MODULE_DATABASE_AND_QUEUE_DIAGNOSTICS",
      sourceReportPath: "reports/cross-module-db-queue-diagnostics.current.json",
      status: "READY",
    });
    inputs.reports["reports/cross-module-db-queue-diagnostics.current.json"] = JSON.stringify(crossModuleDiagnosticsReport());

    const report = auditSystemCapacityClaim(inputs);

    assert.equal(report.readiness, "READY");
    assert.equal(report.rootWorkflowCoverageEvidence.count, 1);
    assert.equal(report.crossModuleDiagnosticsEvidence.count, 1);
    assert.equal(report.crossModuleDiagnosticsEvidence.reportParseable, true);
    assert.equal(
      report.claim.moduleLimits.find((limit) => limit.module === "Teaching Archive And Quiz").status,
      "MODULE_RUNTIME_SLO_FROM_SUSTAINED_MIXED_WORKLOAD",
    );
    assert.equal(
      report.claim.moduleLimits.find((limit) => limit.module === "Knowledge Retrieval").status,
      "POLICY_RUNTIME_SLO_FROM_SUSTAINED_MIXED_WORKLOAD",
    );
    assert.equal(
      report.claim.moduleLimits.find((limit) => limit.module === "AI Worker Runtime").status,
      "WORKER_ADMISSION_RUNTIME_SLO_FROM_SUSTAINED_MIXED_WORKLOAD",
    );
    assert.equal(
      report.claim.moduleLimits.find((limit) => limit.module === "Agent Harness And Workflow Plugin").status,
      "REVIEW_RUNTIME_SLO_AND_QUEUE_BOUNDARY",
    );
    assert.equal(report.claim.fullSystemUltraConcurrency.status, "MIXED_WORKLOAD_EVIDENCE_PRESENT_REVIEW_REQUIRED");
    assert.deepEqual(report.claim.fullSystemUltraConcurrency.requiredNextEvidence, [
      "PROMOTION_REVIEW_AGAINST_ROOT_SLOS",
    ]);
  });

  it("keeps conservative module summaries when cross-module diagnostics are missing", () => {
    const inputs = currentInputs();
    addCompletePrePromotionEvidence(inputs);

    const report = auditSystemCapacityClaim(inputs);

    assert.equal(report.readiness, "READY");
    assert.equal(report.crossModuleDiagnosticsEvidence.count, 1);
    assert.equal(report.crossModuleDiagnosticsEvidence.reportPresent, false);
    assert.equal(
      report.claim.moduleLimits.find((limit) => limit.module === "Teaching Archive And Quiz").status,
      "MODULE_SMOKE_ONLY",
    );
    assert.equal(
      report.claim.moduleLimits.find((limit) => limit.module === "Knowledge Retrieval").status,
      "POLICY_SMOKE_ONLY",
    );
    assert.equal(
      report.claim.moduleLimits.find((limit) => limit.module === "AI Worker Runtime").status,
      "DEPENDENCY_BOUNDARY_ONLY",
    );
    assert.equal(
      report.claim.moduleLimits.some((limit) => limit.module === "Agent Harness And Workflow Plugin"),
      false,
    );
  });

  it("uses a blocked root SLO promotion review to block the full-system claim", () => {
    const inputs = currentInputs();
    addCompletePrePromotionEvidence(inputs);
    inputs.registry.entries.push({
      evidenceId: "root_slo_promotion_review_current",
      workloadType: "ROOT_SLO_PROMOTION_REVIEW",
      sourceReportPath: "reports/root-slo-promotion-review.current.json",
      status: "READY",
    });
    inputs.reports["reports/cross-module-db-queue-diagnostics.current.json"] = JSON.stringify(crossModuleDiagnosticsReport());
    inputs.reports["reports/root-slo-promotion-review.current.json"] = JSON.stringify(rootSloReviewReport({
      decision: "BLOCK_PROMOTION",
      claimStatus: "NOT_SUPPORTED_BY_CURRENT_ROOT_SLO_REVIEW",
      requiredNextEvidence: [
        "ROOT_INTERACTIVE_TAIL_LATENCY_REMEDIATION",
        "PRODUCTION_PGBOUNCER_HEADROOM_PROFILE",
      ],
    }));

    const report = auditSystemCapacityClaim(inputs);

    assert.equal(report.readiness, "READY");
    assert.equal(report.rootSloPromotionReviewEvidence.count, 1);
    assert.equal(report.rootSloPromotionReviewEvidence.summary.reviewedClaim, "FULL_SYSTEM_PRODUCTION_READ_WRITE_10000_RPS");
    assert.equal(report.rootSloPromotionReviewEvidence.summary.productionReadWriteRpsTarget, 10000);
    assert.equal(report.rootSloPromotionReviewEvidence.summary.interactiveP99TargetMs, 10);
    assert.equal(report.rootSloPromotionReviewEvidence.summary.measuredReadWriteRps, null);
    assert.equal(report.claim.fullSystemUltraConcurrency.status, "NOT_SUPPORTED_BY_CURRENT_ROOT_SLO_REVIEW");
    assert.deepEqual(report.claim.fullSystemUltraConcurrency.requiredNextEvidence, [
      "ROOT_INTERACTIVE_TAIL_LATENCY_REMEDIATION",
      "PRODUCTION_PGBOUNCER_HEADROOM_PROFILE",
    ]);
    assert.match(report.claim.fullSystemUltraConcurrency.reason, /Root SLO promotion review blocks/u);
    assert.match(formatSystemCapacityClaimAudit(report), /Production RPS target: 10000/u);
    assert.match(formatSystemCapacityClaimAudit(report), /Interactive P99 target: 10ms/u);
  });

  it("fails readiness when a source report is missing", () => {
    const inputs = currentInputs();
    delete inputs.reports[requiredEvidence[1].reportPath];

    const report = auditSystemCapacityClaim(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "sources.required_reports_parseable").passed, false);
  });

  it("fails readiness when the strict quality gate is not passing", () => {
    const inputs = currentInputs();
    const quality = JSON.parse(inputs.reports[requiredEvidence.find((entry) => entry.key === "quality").reportPath]);
    quality.allPassed = false;
    inputs.reports["reports/quality-gate.current.json"] = JSON.stringify(quality);

    const report = auditSystemCapacityClaim(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_passed").passed, false);
  });

  it("detects forbidden baseline AI dependencies before capacity promotion", () => {
    const inputs = currentInputs();
    const aiWorker = JSON.parse(inputs.reports[requiredEvidence.find((entry) => entry.key === "aiWorker").reportPath]);
    aiWorker.findings = aiWorker.findings.map((finding) =>
      finding.id === "baseline.no_forbidden_ai_packages" ? { ...finding, actual: "torch" } : finding,
    );
    inputs.reports["reports/ai-worker-runtime-dependency-profile.current.json"] = JSON.stringify(aiWorker);

    const report = auditSystemCapacityClaim(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "baseline.no_forbidden_ai_runtime_dependencies").passed, false);
  });

  it("requires explicit module-limit classifications", () => {
    const inputs = currentInputs();
    const conversation = JSON.parse(inputs.reports["reports/conversation-loadgen-runtime-decision.current.json"]);
    conversation.readiness = "NEEDS_REMEDIATION";
    inputs.reports["reports/conversation-loadgen-runtime-decision.current.json"] = JSON.stringify(conversation);

    const report = auditSystemCapacityClaim(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.claim.moduleLimits.find((limit) => limit.module === "Research Conversation Write").status, "UNKNOWN");
    assert.equal(report.findings.find((finding) => finding.id === "claim.module_limits_are_explicit").passed, false);
  });
});

function currentInputs() {
  return {
    registry: {
      entries: requiredEvidence.map((requirement) => ({
        evidenceId: requirement.evidenceId,
        sourceReportPath: requirement.reportPath,
        status: requirement.key === "quality" ? "PASSED" : "READY",
      })),
    },
    reports: {
      [currentIdentitySourceReport]: JSON.stringify(identityReport()),
      "reports/conversation-loadgen-runtime-decision.current.json": JSON.stringify(conversationReport()),
      "reports/teaching-archive-benchmark.current.json": JSON.stringify(teachingArchiveReport()),
      "reports/knowledge-retrieval-benchmark.current.json": JSON.stringify(knowledgeReport()),
      "reports/ai-worker-runtime-dependency-profile.current.json": JSON.stringify(aiWorkerReport()),
      "reports/quality-gate.current.json": JSON.stringify(qualityReport()),
    },
  };
}

function addCompletePrePromotionEvidence(inputs) {
  inputs.registry.entries.push({
    evidenceId: "system_mixed_workload_smoke_current",
    workloadType: "MIXED_WORKLOAD",
    sourceReportPath: "reports/system-mixed-workload-benchmark.current.json",
    status: "PASSED",
  });
  inputs.registry.entries.push({
    evidenceId: "system_sustained_mixed_workload_current",
    workloadType: "SUSTAINED_MIXED_WORKLOAD",
    sourceReportPath: "reports/system-sustained-mixed-workload.current.json",
    status: "PASSED",
  });
  inputs.registry.entries.push({
    evidenceId: "system_sustained_mixed_workload_scaleup_current",
    workloadType: "SUSTAINED_MIXED_WORKLOAD_SCALE_UP",
    sourceReportPath: "reports/system-sustained-mixed-workload-scaleup.current.json",
    status: "PASSED",
  });
  inputs.registry.entries.push({
    evidenceId: "root_workflow_coverage_current",
    workloadType: "ROOT_WORKFLOW_COVERAGE",
    sourceReportPath: "reports/root-workflow-coverage.current.json",
    status: "READY",
  });
  inputs.registry.entries.push({
    evidenceId: "cross_module_db_queue_diagnostics_current",
    workloadType: "CROSS_MODULE_DATABASE_AND_QUEUE_DIAGNOSTICS",
    sourceReportPath: "reports/cross-module-db-queue-diagnostics.current.json",
    status: "READY",
  });
}

function identityReport() {
  return {
    status: "PASSED",
    concurrency: 4400,
    operationsPerPhase: 8800,
    totalDurationMs: 187979.91,
    benchmarkRuntimeProfile: { executor: "DOCKER_GO" },
    gatewayDatabaseProfile: { sessionTablePersistence: "unlogged", sessionDbMaxConnsTotal: 72 },
    phases: {
      passwordLogin: phase("passwordLogin", 1594.26, 1733.55, 3772.29),
      principalLookup: phase("principalLookup", 1139.32, 1248.8, 4190.89),
      refreshRotation: phase("refreshRotation", 1169.51, 1457.27, 4067.14),
      revokeCycle: {
        ...phase("revokeCycle", 2640.17, 3071.17, 1790.59),
        stepLatencyAttribution: {
          slowestStep: "login",
          slowestStepP99Ms: 1498.29,
          stepP99SumMs: 3502.89,
          p99ResidualMs: -431.72,
        },
      },
    },
  };
}

function conversationReport() {
  return {
    readiness: "READY",
    decisions: {
      lowTail: { selected: { concurrency: 5800, p99Ms: 349.9 } },
      highConcurrency: {
        recommendation: "USE_WSL_LOADGEN_FOR_HIGH_CONCURRENCY_EDGE",
        selected: { concurrency: 8000, p99Ms: 518.15 },
      },
      burstCeiling: { selected: { concurrency: 30000, p99Ms: 1795.33 } },
    },
  };
}

function teachingArchiveReport() {
  return {
    status: "PASSED",
    concurrency: 4,
    operationsPerPhase: 8,
    gatewayDatabaseProfile: { dbMaxConns: 1 },
    phases: {
      createArchiveItem: phase("createArchiveItem", 18, 25, 220),
      createQuizSubmission: phase("createQuizSubmission", 20, 30, 180),
      listArchiveItems: phase("listArchiveItems", 8, 10, 350),
    },
  };
}

function knowledgeReport() {
  return {
    readiness: "READY",
    benchmark: {
      metrics: { p95QueryPlanMs: 2.55, totalPlans: 256 },
      workloadResults: [{ workloadId: "cloud" }, { workloadId: "local" }, { workloadId: "remote" }],
    },
  };
}

function aiWorkerReport() {
  return {
    readiness: "READY",
    baselineDependencies: [{ name: "pgx" }, { name: "serde" }],
    findings: [{ id: "baseline.no_forbidden_ai_packages", actual: "none" }],
  };
}

function qualityReport() {
  return {
    allPassed: true,
    commandResults: Array.from({ length: 23 }, (_, index) => ({ name: `cmd-${index}`, passed: true })),
    staticChecks: { findings: [] },
  };
}

function rootSloReviewReport({ decision, claimStatus, requiredNextEvidence }) {
  return {
    readiness: "READY",
    workloadType: "ROOT_SLO_PROMOTION_REVIEW",
    promotionPolicy: {
      reviewedClaim: "FULL_SYSTEM_PRODUCTION_READ_WRITE_10000_RPS",
      productionReadWriteRpsTarget: 10000,
      interactiveP99TargetMs: 10,
    },
    evidence: {
      productionThroughput: {
        measuredReadWriteRps: null,
      },
    },
    promotion: {
      decision,
      claimStatus,
      blockerCount: claimStatus === "SUPPORTED_BY_CURRENT_ROOT_SLO_REVIEW" ? 0 : 2,
      blockers: claimStatus === "SUPPORTED_BY_CURRENT_ROOT_SLO_REVIEW"
        ? []
        : [
            { id: "promotion.interactive_tail_latency_within_target" },
            { id: "promotion.database_headroom_sufficient" },
          ],
      requiredNextEvidence,
    },
  };
}

function crossModuleDiagnosticsReport() {
  return {
    readiness: "READY",
    workloadType: "CROSS_MODULE_DATABASE_AND_QUEUE_DIAGNOSTICS",
    moduleDiagnostics: [
      {
        id: "identity_and_access",
        classification: "MODULE_CAPACITY_ONLY",
        status: "PASSED",
        metrics: {
          concurrency: 4400,
          slowestP99Ms: 3071.17,
        },
      },
      {
        id: "research_conversation_write",
        classification: "MODULE_CAPACITY_AND_TRANSPORT_DECISION",
        status: "PASSED",
        metrics: {
          lowTailConcurrency: 5800,
          burstConcurrency: 30000,
        },
      },
      {
        id: "teaching_archive_and_quiz",
        classification: "MODULE_RUNTIME_SLO_FROM_SUSTAINED_MIXED_WORKLOAD",
        status: "PASSED",
        metrics: {
          sustainedRuntimeEvidence: {
            present: true,
            passed: true,
            stepName: "high",
            stepReadWriteRps: sustainedFixtureReadWriteRps,
            p99Ms: 94,
          },
        },
      },
      {
        id: "knowledge_retrieval",
        classification: "POLICY_RUNTIME_SLO_FROM_SUSTAINED_MIXED_WORKLOAD",
        status: "READY",
        metrics: {
          p95QueryPlanMs: 2.55,
          sustainedRuntimeEvidence: {
            present: true,
            passed: true,
            stepName: "high",
            stepReadWriteRps: sustainedFixtureReadWriteRps,
          },
        },
      },
      {
        id: "ai_worker_optional_runtime",
        classification: "WORKER_ADMISSION_RUNTIME_SLO_FROM_SUSTAINED_MIXED_WORKLOAD",
        status: "READY",
        metrics: {
          noDirectDbWrite: true,
          noBaselineRuntimeDependency: true,
          sustainedRuntimeEvidence: {
            present: true,
            passed: true,
            stepName: "high",
            stepReadWriteRps: sustainedFixtureReadWriteRps,
          },
        },
      },
      {
        id: "agent_harness_and_workflow_plugin",
        classification: "REVIEW_RUNTIME_SLO_AND_QUEUE_BOUNDARY",
        status: "READY",
        metrics: {
          workflowRuntimeEvidence: {
            passed: true,
            p99Ms: 2.08,
            localExecutionEnabled: false,
            localGeneratedCodeExecuted: false,
          },
        },
      },
    ],
  };
}

function phase(name, p95, p99, rps) {
  return {
    name,
    errors: 0,
    rps,
    latencyMs: { p95, p99 },
  };
}
