import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  auditRootSloPromotionReview,
  formatRootSloPromotionReview,
  sourceReports,
} from "./root-slo-promotion-review-audit.mjs";
import {
  auditCrossModuleDbQueueDiagnostics,
  sourceFiles as crossModuleSourceFiles,
} from "./cross-module-db-queue-diagnostics-audit.mjs";

const root = process.cwd();
const rootRequirementsPath = "../智能教研助手/项目根本需求（禁止改动）";

describe("root SLO promotion review audit", () => {
  it("reviews the current evidence and blocks full-system ultra-concurrency promotion", () => {
    const inputs = loadCurrentInputs();
    inputs.reports[sourceReports.crossModuleDiagnostics] = JSON.stringify(loadCurrentCrossModuleDiagnostics());
    const report = auditRootSloPromotionReview(inputs);

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "ROOT_SLO_PROMOTION_REVIEW");
    assert.equal(report.promotionPolicy.reviewedClaim, "FULL_SYSTEM_PRODUCTION_READ_WRITE_10000_RPS");
    assert.equal(report.promotionPolicy.productionReadWriteRpsTarget, 10000);
    assert.equal(report.promotionPolicy.interactiveP99TargetMs, 300);
    assert.equal(report.promotion.decision, "BLOCK_PROMOTION");
    assert.equal(report.promotion.claimStatus, "NOT_SUPPORTED_BY_CURRENT_ROOT_SLO_REVIEW");
    assert.equal(report.promotion.blockerCount, 2);
    assert.match(
      report.promotion.blockers.find((blocker) => blocker.id === "promotion.interactive_tail_latency_within_target").actual,
      /identityRevokeSlowestStep=login:1498\.29/,
    );
    const expectedReadWriteRps = parseReport(inputs, sourceReports.sustainedScaleUp).summary.highestPassedReadWriteRps;
    assert.equal(report.evidence.productionThroughput.targetReadWriteRps, 10000);
    assert.equal(report.evidence.productionThroughput.measuredReadWriteRps, expectedReadWriteRps);
    assert.equal(report.evidence.productionThroughput.source, "sustained_scaleup.summary.highestPassedReadWriteRps");
    assert.equal(report.evidence.productionThroughput.targetAttemptStatus, "NOT_CONFIGURED");
    assert.equal(report.evidence.productionThroughput.targetAttempted, false);
    assert.equal(report.evidence.productionThroughput.targetConfigured, false);
    assert.equal(report.evidence.productionThroughput.targetShortfallRps, 7892.7);
    assert.equal(
      report.promotion.blockers.find((blocker) => blocker.id === "promotion.production_read_write_rps_target_met").actual,
      `${expectedReadWriteRps} rps from sustained_scaleup.summary.highestPassedReadWriteRps;targetStatus=NOT_CONFIGURED;targetAttempted=false;shortfall=7892.7`,
    );
    assert(report.promotion.requiredNextEvidence.includes("ROOT_INTERACTIVE_TAIL_LATENCY_REMEDIATION"));
    assert(report.promotion.requiredNextEvidence.includes("PRODUCTION_10000_RPS_SUSTAINED_EVIDENCE"));
    assert(!report.promotion.requiredNextEvidence.includes("MODULE_RUNTIME_SLO_DEPTH_FOR_TEACHING_KNOWLEDGE_WORKER_AGENT"));
    assert(!report.promotion.requiredNextEvidence.includes("ROOT_WORKFLOW_RUNTIME_SLO_COVERAGE"));
    assert(!report.promotion.requiredNextEvidence.includes("HIGHER_SUSTAINED_MIXED_WORKLOAD_STEP"));
    assert(!report.promotion.requiredNextEvidence.includes("PRODUCTION_PGBOUNCER_HEADROOM_PROFILE"));
    assert.equal(report.promotionFindings.find((finding) => finding.id === "promotion.module_evidence_depth_sufficient").passed, true);
    assert.equal(report.promotionFindings.find((finding) => finding.id === "promotion.sustained_scale_depth_sufficient").passed, true);
    assert.equal(report.evidence.databaseHeadroom.satisfiedBy, "production_headroom_profile");
    assert.match(formatRootSloPromotionReview(report), /Decision: BLOCK_PROMOTION/);
  });

  it("fails readiness when immutable root requirements text is missing", () => {
    const inputs = loadCurrentInputs();
    inputs.rootRequirementsText = "";

    const report = auditRootSloPromotionReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.promotion.decision, "REVIEW_NOT_READY");
    assert.equal(report.auditFindings.find((finding) => finding.id === "root_requirements.present").passed, false);
  });

  it("fails readiness when root workflow coverage is not ready", () => {
    const inputs = loadCurrentInputs();
    const coverage = parseReport(inputs, sourceReports.rootWorkflowCoverage);
    coverage.readiness = "NEEDS_REMEDIATION";
    inputs.reports[sourceReports.rootWorkflowCoverage] = JSON.stringify(coverage);

    const report = auditRootSloPromotionReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.auditFindings.find((finding) => finding.id === "root_workflow.coverage_ready").passed, false);
  });

  it("fails readiness when cross-module diagnostics are not ready", () => {
    const inputs = loadCurrentInputs();
    const diagnostics = parseReport(inputs, sourceReports.crossModuleDiagnostics);
    diagnostics.readiness = "NEEDS_REMEDIATION";
    inputs.reports[sourceReports.crossModuleDiagnostics] = JSON.stringify(diagnostics);

    const report = auditRootSloPromotionReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.auditFindings.find((finding) => finding.id === "cross_module.diagnostics_ready").passed, false);
  });

  it("fails readiness when the production PgBouncer headroom profile is not ready", () => {
    const inputs = loadCurrentInputs();
    const headroom = parseReport(inputs, sourceReports.pgbouncerProductionHeadroom);
    headroom.readiness = "NEEDS_REMEDIATION";
    inputs.reports[sourceReports.pgbouncerProductionHeadroom] = JSON.stringify(headroom);

    const report = auditRootSloPromotionReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.auditFindings.find((finding) => finding.id === "pgbouncer.production_headroom_ready").passed, false);
  });

  it("keeps the review ready but blocks promotion when quality prerequisites pass and SLO gates fail", () => {
    const inputs = loadCurrentInputs();
    inputs.reports[sourceReports.crossModuleDiagnostics] = JSON.stringify(loadCurrentCrossModuleDiagnostics());
    const report = auditRootSloPromotionReview(inputs);
    const failedGateIds = report.promotionFindings.filter((finding) => !finding.passed).map((finding) => finding.id);

    assert.equal(report.readiness, "READY");
    assert(!failedGateIds.includes("promotion.root_workflows_runtime_slo_covered"));
    assert(!failedGateIds.includes("promotion.module_evidence_depth_sufficient"));
    assert(failedGateIds.includes("promotion.interactive_tail_latency_within_target"));
    assert(!failedGateIds.includes("promotion.database_headroom_sufficient"));
    assert(!failedGateIds.includes("promotion.sustained_scale_depth_sufficient"));
    assert(failedGateIds.includes("promotion.production_read_write_rps_target_met"));
  });

  it("records whether the production 10k target step was attempted", () => {
    const inputs = loadCurrentInputs();
    inputs.reports[sourceReports.crossModuleDiagnostics] = JSON.stringify(loadCurrentCrossModuleDiagnostics());
    const scaleUp = parseReport(inputs, sourceReports.sustainedScaleUp);
    scaleUp.throughputTarget = {
      targetReadWriteRps: 10000,
      required: true,
      configured: true,
      attempted: false,
      met: false,
      status: "NOT_ATTEMPTED",
      shortfallRps: 7892.7,
      targetStepNames: ["target-10k"],
      attemptedStepNames: [],
    };
    inputs.reports[sourceReports.sustainedScaleUp] = JSON.stringify(scaleUp);

    const report = auditRootSloPromotionReview(inputs);
    const throughput = report.evidence.productionThroughput;
    const blocker = report.promotion.blockers.find((entry) =>
      entry.id === "promotion.production_read_write_rps_target_met"
    );

    assert.equal(throughput.targetAttemptStatus, "NOT_ATTEMPTED");
    assert.equal(throughput.targetAttempted, false);
    assert.equal(throughput.targetConfigured, true);
    assert.equal(throughput.targetShortfallRps, 7892.7);
    assert.match(blocker.actual, /targetStatus=NOT_ATTEMPTED/u);
    assert.match(blocker.actual, /targetAttempted=false/u);
  });

  it("blocks module-depth promotion when cross-module classifications fall back to shallow evidence", () => {
    const inputs = loadCurrentInputs();
    const diagnostics = loadCurrentCrossModuleDiagnostics();
    diagnostics.moduleDiagnostics = diagnostics.moduleDiagnostics.map((module) =>
      module.id === "teaching_archive_and_quiz"
        ? { ...module, classification: "MODULE_SMOKE_ONLY" }
        : module,
    );
    inputs.reports[sourceReports.crossModuleDiagnostics] = JSON.stringify(diagnostics);

    const report = auditRootSloPromotionReview(inputs);
    const moduleDepthFinding = report.promotionFindings.find((finding) =>
      finding.id === "promotion.module_evidence_depth_sufficient"
    );

    assert.equal(report.readiness, "READY");
    assert.equal(moduleDepthFinding.passed, false);
    assert(report.promotion.requiredNextEvidence.includes("MODULE_RUNTIME_SLO_DEPTH_FOR_TEACHING_KNOWLEDGE_WORKER_AGENT"));
  });

  it("blocks promotion when workflow/plugin runtime SLO evidence is removed", () => {
    const inputs = loadCurrentInputs();
    const coverage = parseReport(inputs, sourceReports.rootWorkflowCoverage);
    coverage.workflows = coverage.workflows.map((workflow) =>
      workflow.id === "workflow_plugin_self_evolution"
        ? {
            ...workflow,
            coverageClass: "CONTRACT_ONLY_REQUIRES_LATER_RUNTIME_BENCHMARK",
            mixedWorkloadResults: [],
            runtimeEvidenceResults: [],
          }
        : workflow,
    );
    inputs.reports[sourceReports.rootWorkflowCoverage] = JSON.stringify(coverage);

    const report = auditRootSloPromotionReview(inputs);
    const rootWorkflowFinding = report.promotionFindings.find((finding) =>
      finding.id === "promotion.root_workflows_runtime_slo_covered"
    );

    assert.equal(report.readiness, "READY");
    assert.equal(rootWorkflowFinding.passed, false);
    assert(report.promotion.requiredNextEvidence.includes("ROOT_WORKFLOW_RUNTIME_SLO_COVERAGE"));
  });

  it("blocks promotion when sustained scale-up depth drops below high", () => {
    const inputs = loadCurrentInputs();
    const diagnostics = parseReport(inputs, sourceReports.crossModuleDiagnostics);
    diagnostics.mixedWorkloadDiagnostics.highestPassedStep = "low";
    inputs.reports[sourceReports.crossModuleDiagnostics] = JSON.stringify(diagnostics);

    const scaleUp = parseReport(inputs, sourceReports.sustainedScaleUp);
    scaleUp.summary.highestPassedStep = "low";
    inputs.reports[sourceReports.sustainedScaleUp] = JSON.stringify(scaleUp);

    const report = auditRootSloPromotionReview(inputs);
    const sustainedFinding = report.promotionFindings.find((finding) =>
      finding.id === "promotion.sustained_scale_depth_sufficient"
    );

    assert.equal(report.readiness, "READY");
    assert.equal(sustainedFinding.passed, false);
    assert(report.promotion.requiredNextEvidence.includes("HIGHER_SUSTAINED_MIXED_WORKLOAD_STEP"));
  });

  it("approves promotion only when every root SLO gate is satisfied", () => {
    const inputs = loadCurrentInputs();
    const coverage = parseReport(inputs, sourceReports.rootWorkflowCoverage);
    coverage.summary.contractOnlyWorkflows = 0;
    coverage.workflows = coverage.workflows.map((workflow) => ({
      ...workflow,
      coverageClass: "RUNTIME_SLO_AND_MIXED_WORKLOAD",
      mixedWorkloadResults: [{ name: "runtime_slo", passed: true }],
    }));
    inputs.reports[sourceReports.rootWorkflowCoverage] = JSON.stringify(coverage);

    const diagnostics = parseReport(inputs, sourceReports.crossModuleDiagnostics);
    diagnostics.databaseTopology.hotPathPool.pgbouncerHeadroom = 30;
    diagnostics.moduleDiagnostics = diagnostics.moduleDiagnostics.map((module) => ({
        ...module,
        classification: "RUNTIME_SLO_EVIDENCE",
        metrics: {
          ...module.metrics,
          slowestP99Ms: module.id === "identity_and_access" ? 180 : module.metrics?.slowestP99Ms,
          lowTailP99Ms: module.id === "research_conversation_write" ? 160 : module.metrics?.lowTailP99Ms,
          burstP99Ms: module.id === "research_conversation_write" ? 240 : module.metrics?.burstP99Ms,
        },
      }));
    diagnostics.mixedWorkloadDiagnostics.highestPassedStep = "high";
    diagnostics.mixedWorkloadDiagnostics.maxP99Ms = 240;
    inputs.reports[sourceReports.crossModuleDiagnostics] = JSON.stringify(diagnostics);

    const scaleUp = parseReport(inputs, sourceReports.sustainedScaleUp);
    scaleUp.summary.highestPassedStep = "high";
    scaleUp.summary.maxP99Ms = 240;
    scaleUp.summary.highestPassedReadWriteRps = 12000;
    inputs.reports[sourceReports.sustainedScaleUp] = JSON.stringify(scaleUp);

    const report = auditRootSloPromotionReview(inputs);

    assert.equal(report.readiness, "READY");
    assert.equal(report.promotion.decision, "APPROVE_PROMOTION");
    assert.equal(report.promotion.blockerCount, 0);
    assert.deepEqual(report.promotion.requiredNextEvidence, []);
  });

  it("fails readiness when strict quality is not passing", () => {
    const inputs = loadCurrentInputs();
    const quality = parseReport(inputs, sourceReports.quality);
    quality.allPassed = false;
    quality.status = "FAILED";
    inputs.reports[sourceReports.quality] = JSON.stringify(quality);

    const report = auditRootSloPromotionReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.auditFindings.find((finding) => finding.id === "quality.gate_passed").passed, false);
  });
});

function loadCurrentInputs() {
  return {
    rootRequirementsPath,
    rootRequirementsText: fs.readFileSync(path.resolve(root, rootRequirementsPath), "utf8"),
    reports: Object.fromEntries(Object.values(sourceReports).map((reportPath) => [
      reportPath,
      fs.readFileSync(path.join(root, reportPath), "utf8"),
    ])),
  };
}

function loadCurrentCrossModuleDiagnostics() {
  return auditCrossModuleDbQueueDiagnostics({
    sources: Object.fromEntries(Object.values(crossModuleSourceFiles).map((sourcePath) => [
      sourcePath,
      fs.readFileSync(path.join(root, sourcePath), "utf8"),
    ])),
  });
}

function parseReport(inputs, reportPath) {
  return JSON.parse(inputs.reports[reportPath]);
}
