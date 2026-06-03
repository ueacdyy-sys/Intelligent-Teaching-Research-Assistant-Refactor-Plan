import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { evaluateConnectionBudget } from "./connection-budget.mjs";
import {
  allowInProgressQualityGateFromEnv,
  isQualityGateReportPassing,
  summarizeQualityGateReportState,
} from "./quality-gate-report-state.mjs";

const defaultOutPath = "reports/cross-module-db-queue-diagnostics.current.json";

export const sourceFiles = {
  connectionBudget: "contracts/config/connection-budget.proposed-pgbouncer-transaction.json",
  pgbouncerPerf: "reports/pgbouncer-perf-profile.current.json",
  identity: "reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-unlogged-session-table-pgbouncer120-preconnect-retry-ingress19080-clean-table-docker-bench.json",
  conversationLowTail: "reports/conversation-write-http-benchmark.direct16-concurrency5800-multi16-pool1-client-unlimited-batched64-delay0.json",
  conversationBurst: "reports/conversation-write-http-benchmark.wsl-direct16-concurrency30000-batched64.json",
  conversationRuntime: "reports/conversation-loadgen-runtime-decision.current.json",
  teachingArchive: "reports/teaching-archive-benchmark.current.json",
  knowledgeRetrieval: "reports/knowledge-retrieval-benchmark.current.json",
  aiWorkerJob: "reports/ai-worker-job.current.json",
  aiWorkerAdmission: "reports/ai-worker-job-admission.current.json",
  agentHarness: "reports/agent-harness-flow.current.json",
  workflowPluginFlow: "reports/workflow-plugin-flow.current.json",
  workflowPluginRegistry: "reports/workflow-plugin-registry-admission.current.json",
  workflowPluginRuntimeSlo: "reports/workflow-plugin-runtime-slo.current.json",
  sustainedScaleUp: "reports/system-sustained-mixed-workload-scaleup.current.json",
  rootWorkflowCoverage: "reports/root-workflow-coverage.current.json",
  quality: "reports/quality-gate.current.json",
};

export function auditCrossModuleDbQueueDiagnostics(inputs) {
  const sources = parseSources(inputs.sources ?? {});
  const reports = Object.fromEntries(
    Object.entries(sourceFiles).map(([key, sourcePath]) => [key, sources[sourcePath]?.value]),
  );
  const budget = safeEvaluateBudget(reports.connectionBudget);
  const topology = buildDatabaseTopology(reports, budget);
  const mixedWorkload = buildMixedWorkloadDiagnostics(reports);
  const modules = buildModuleDiagnostics(reports, mixedWorkload);
  const queues = buildQueueAndWorkerDiagnostics(reports);
  const findings = [];

  addFinding(findings, {
    id: "sources.required_json_parseable",
    passed: Object.values(sourceFiles).every((sourcePath) => sources[sourcePath]?.parseable === true),
    actual: Object.values(sourceFiles).map((sourcePath) => `${sourcePath}:${sources[sourcePath]?.parseable === true ? "json" : "missing_or_invalid"}`).join(";"),
    expected: "all cross-module diagnostic source files are readable JSON",
    remediation: "Regenerate the missing report or restore the required config before diagnosing cross-module DB and queue capacity.",
  });
  addFinding(findings, {
    id: "database.foundation_ready",
    passed: topology.postgres.present === true &&
      topology.postgres.maxConnections >= 300 &&
      topology.pgbouncer.present === true &&
      topology.pgbouncer.poolMode === "transaction" &&
      topology.pgbouncer.maxDbConnections > 0 &&
      reports.pgbouncerPerf?.readiness === "READY",
    actual: `postgres=${topology.postgres.present}:${topology.postgres.maxConnections};pgbouncer=${topology.pgbouncer.present}:${topology.pgbouncer.poolMode}:${topology.pgbouncer.maxDbConnections};profile=${reports.pgbouncerPerf?.readiness}`,
    expected: "PostgreSQL max_connections>=300 and PgBouncer transaction profile READY",
    remediation: "Fix the PgBouncer performance profile before using mixed workload evidence for capacity review.",
  });
  addFinding(findings, {
    id: "database.connection_budget_passed",
    passed: budget?.passed === true,
    actual: budget ? `planned=${budget.totalPlannedConnections};safe=${budget.safeLimit}` : "missing",
    expected: "planned cross-service connections stay within the PostgreSQL safe budget",
    remediation: "Reduce worker pool sizes or adjust the explicit PostgreSQL capacity profile before capacity promotion.",
  });
  addFinding(findings, {
    id: "database.hot_path_pool_within_pgbouncer_cap",
    passed: Number.isFinite(topology.hotPathPool.totalMaxConns) &&
      Number.isFinite(topology.pgbouncer.maxDbConnections) &&
      topology.hotPathPool.totalMaxConns <= topology.pgbouncer.maxDbConnections,
    actual: `hotPath=${topology.hotPathPool.totalMaxConns};pgbouncerMaxDb=${topology.pgbouncer.maxDbConnections};headroom=${topology.hotPathPool.pgbouncerHeadroom}`,
    expected: "identity + conversation + teaching current source-evidence pools fit within PgBouncer max_db_connections",
    remediation: "Do not sum module peak profiles into one production SLO until the PgBouncer server pool has explicit headroom.",
  });
  addFinding(findings, {
    id: "database.module_profiles_present",
    passed: modules
      .filter((module) => module.database.required)
      .every((module) => Number.isFinite(module.database.maxConnectionsTotal) && module.database.maxConnectionsTotal >= 0),
    actual: modules.map((module) => `${module.id}:${module.database.required ? module.database.maxConnectionsTotal : module.database.mode}`).join(";"),
    expected: "every database-backed root module records an explicit database pool profile",
    remediation: "Regenerate the module benchmark report with gatewayDatabaseProfile evidence.",
  });
  addFinding(findings, {
    id: "database.conversation_acquire_not_current_bottleneck",
    passed: queueMetric(modules, "research_conversation_write", "dbAcquireP99Ms") <= 10 &&
      queueMetric(modules, "research_conversation_write", "burstDbAcquireP99Ms") <= 10,
    actual: `lowTail=${queueMetric(modules, "research_conversation_write", "dbAcquireP99Ms")};burst=${queueMetric(modules, "research_conversation_write", "burstDbAcquireP99Ms")}`,
    expected: "conversation db.acquire P99 stays <=10ms in low-tail and WSL burst source evidence",
    remediation: "If database acquisition rises, investigate PgBouncer wait time before tuning transport or worker fanout.",
  });
  addFinding(findings, {
    id: "queues.worker_boundaries_ready",
    passed: queues.every((queue) => queue.status === "READY"),
    actual: queues.map((queue) => `${queue.id}:${queue.status}`).join(";"),
    expected: "batch, AI worker, approval, and workflow/plugin queues have explicit safe boundaries",
    remediation: "Restore the worker admission, approval queue, or sandbox/registry guard before capacity promotion.",
  });
  addFinding(findings, {
    id: "performance.mixed_scaleup_clean",
    passed: mixedWorkload.status === "PASSED" &&
      mixedWorkload.totalErrors === 0 &&
      mixedWorkload.orchestrationErrors === 0 &&
      mixedWorkload.workloadNamesComplete === true,
    actual: `status=${mixedWorkload.status};errors=${mixedWorkload.totalErrors};orchestration=${mixedWorkload.orchestrationErrors};workloads=${mixedWorkload.workloadNames.join(",")}`,
    expected: "sustained scale-up passed with zero workload/orchestration errors and every root slice present",
    remediation: "Rerun the sustained mixed workload scale-up before using these diagnostics.",
  });
  addFinding(findings, {
    id: "root_workflow.coverage_ready",
    passed: reports.rootWorkflowCoverage?.readiness === "READY" &&
      reports.rootWorkflowCoverage?.summary?.coveredWorkflows === reports.rootWorkflowCoverage?.summary?.totalWorkflows,
    actual: `readiness=${reports.rootWorkflowCoverage?.readiness};covered=${reports.rootWorkflowCoverage?.summary?.coveredWorkflows}/${reports.rootWorkflowCoverage?.summary?.totalWorkflows}`,
    expected: "root workflow coverage READY with all workflows covered",
    remediation: "Keep diagnostics tied to the immutable root workflows, not isolated benchmark vanity numbers.",
  });
  addFinding(findings, {
    id: "quality.gate_passed",
    passed: isQualityGateReportPassing(reports.quality, {
      allowInProgress: allowInProgressQualityGateFromEnv(),
    }),
    actual: summarizeQualityGateReportState(reports.quality),
    expected: "quality gate allPassed=true",
    remediation: "Cross-module diagnostics must not promote evidence from a failing quality gate.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: new Date().toISOString(),
    readiness,
    workloadType: "CROSS_MODULE_DATABASE_AND_QUEUE_DIAGNOSTICS",
    databaseTopology: topology,
    moduleDiagnostics: modules,
    queueAndWorkerDiagnostics: queues,
    mixedWorkloadDiagnostics: mixedWorkload,
    findings,
    nextAction: readiness === "READY"
      ? "Cross-module DB and queue diagnostics are ready; root SLO promotion review is still required before any full-system ultra-concurrency claim."
      : "Fix the failing cross-module database or queue diagnostic before reviewing full-system capacity claims.",
  };
}

export function formatCrossModuleDbQueueDiagnostics(report) {
  const lines = [
    `Cross-module DB/queue diagnostics: ${report.readiness}`,
    "",
    `Connection budget: planned=${report.databaseTopology.connectionBudget?.totalPlannedConnections ?? "unknown"} safe=${report.databaseTopology.connectionBudget?.safeLimit ?? "unknown"}`,
    `Hot-path DB pool: ${report.databaseTopology.hotPathPool.totalMaxConns}/${report.databaseTopology.pgbouncer.maxDbConnections} PgBouncer server connections`,
    "",
    "Module diagnostics:",
  ];
  for (const module of report.moduleDiagnostics) {
    lines.push(`- ${module.id}: ${module.classification} db=${module.database.mode} queue=${module.queueOrWorkerBoundary.mode}`);
  }
  lines.push("", "Queue and worker boundaries:");
  for (const queue of report.queueAndWorkerDiagnostics) {
    lines.push(`- ${queue.id}: ${queue.status} ${queue.summary}`);
  }
  lines.push("", "Findings:");
  for (const finding of report.findings) {
    lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function buildDatabaseTopology(reports, budget) {
  const observed = reports.pgbouncerPerf?.observed ?? {};
  const pgbouncerMax = numberOrNull(observed.pgbouncer?.maxDbConnections);
  const identityPool = numberOrNull(reports.identity?.gatewayDatabaseProfile?.sessionDbMaxConnsTotal);
  const conversationPool = numberOrNull(reports.conversationLowTail?.gatewayDatabaseProfile?.dbMaxConnsTotal);
  const teachingPool = numberOrNull(reports.teachingArchive?.gatewayDatabaseProfile?.dbMaxConns);
  const total = sumNumbers([identityPool, conversationPool, teachingPool]);
  return {
    postgres: {
      present: observed.postgres?.present === true,
      maxConnections: numberOrNull(observed.postgres?.maxConnections),
      sharedBuffers: observed.postgres?.sharedBuffers ?? null,
    },
    pgbouncer: {
      present: observed.pgbouncer?.present === true,
      poolMode: observed.pgbouncer?.poolMode ?? null,
      listenPort: numberOrNull(observed.pgbouncer?.listenPort),
      maxDbConnections: pgbouncerMax,
    },
    backend: {
      postgresHost: observed.backend?.environment?.POSTGRES_HOST ?? null,
      postgresPort: numberOrNull(Number(observed.backend?.environment?.POSTGRES_PORT)),
      workerCount: numberOrNull(Number(observed.backend?.environment?.GUNICORN_WORKERS)),
      dbPoolSize: numberOrNull(Number(observed.backend?.environment?.DB_POOL_SIZE)),
      dbMaxOverflow: numberOrNull(Number(observed.backend?.environment?.DB_MAX_OVERFLOW)),
      dependsOnPgbouncer: observed.backend?.dependsOnPgbouncer === true,
    },
    connectionBudget: budget ? {
      passed: budget.passed,
      totalPlannedConnections: budget.totalPlannedConnections,
      safeLimit: budget.safeLimit,
      hardLimit: budget.hardLimit,
      services: budget.services,
    } : null,
    hotPathPool: {
      identityMaxConns: identityPool,
      conversationMaxConns: conversationPool,
      teachingArchiveMaxConns: teachingPool,
      totalMaxConns: total,
      pgbouncerHeadroom: Number.isFinite(pgbouncerMax) && Number.isFinite(total) ? pgbouncerMax - total : null,
      interpretation: "Current source-evidence module peaks fit PgBouncer with very little headroom; root SLO review must choose a single production pool profile before claiming ultra-concurrency.",
    },
  };
}

function buildModuleDiagnostics(reports, mixedWorkload) {
  const identityPhase = slowestPhase(reports.identity?.phases, "p99");
  const identityRevokeAttribution = stepLatencyAttribution(reports.identity?.phases?.revokeCycle);
  const conversationPhase = reports.conversationLowTail?.phases?.createConversation ?? {};
  const conversationBurstPhase = reports.conversationBurst?.phases?.createConversation ?? {};
  const teachingPhase = slowestPhase(reports.teachingArchive?.phases, "p99");
  const teachingRuntimeEvidence = sustainedWorkloadRuntimeEvidence(reports, mixedWorkload, "teaching_archive");
  const knowledgeRuntimeEvidence = sustainedWorkloadRuntimeEvidence(reports, mixedWorkload, "knowledge_retrieval");
  const aiWorkerRuntimeEvidence = sustainedWorkloadRuntimeEvidence(reports, mixedWorkload, "ai_worker_admission");
  const workflowRuntimeEvidence = workflowPluginRuntimeEvidence(reports);
  return [
    {
      id: "identity_and_access",
      classification: "MODULE_CAPACITY_ONLY",
      sourceReportPath: sourceFiles.identity,
      status: reports.identity?.status ?? null,
      database: {
        required: true,
        mode: "POSTGRES_VIA_PGBOUNCER",
        workerCount: numberOrNull(reports.identity?.gatewayDatabaseProfile?.workerCount),
        maxConnectionsTotal: numberOrNull(reports.identity?.gatewayDatabaseProfile?.sessionDbMaxConnsTotal),
        sessionTablePersistence: reports.identity?.gatewayDatabaseProfile?.sessionTablePersistence ?? null,
      },
      queueOrWorkerBoundary: {
        mode: "SYNCHRONOUS_HTTP_MULTI_GATEWAY",
        workerCount: numberOrNull(reports.identity?.gatewayWorkerCount ?? reports.identity?.gatewayDatabaseProfile?.workerCount),
      },
      metrics: {
        concurrency: numberOrNull(reports.identity?.concurrency),
        errors: sumPhaseErrors(reports.identity?.phases),
        slowestP99Ms: identityPhase?.p99Ms ?? null,
        slowestP99Phase: identityPhase?.name ?? null,
        revokeCycleSlowestStep: identityRevokeAttribution.slowestStep,
        revokeCycleSlowestStepP99Ms: identityRevokeAttribution.slowestStepP99Ms,
        revokeCycleStepP99SumMs: identityRevokeAttribution.stepP99SumMs,
        revokeCycleP99ResidualMs: identityRevokeAttribution.p99ResidualMs,
      },
    },
    {
      id: "research_conversation_write",
      classification: "MODULE_CAPACITY_AND_TRANSPORT_DECISION",
      sourceReportPath: sourceFiles.conversationLowTail,
      status: reports.conversationLowTail?.status ?? null,
      database: {
        required: true,
        mode: "POSTGRES_VIA_PGBOUNCER",
        workerCount: numberOrNull(reports.conversationLowTail?.gatewayDatabaseProfile?.workerCount),
        maxConnectionsTotal: numberOrNull(reports.conversationLowTail?.gatewayDatabaseProfile?.dbMaxConnsTotal),
      },
      queueOrWorkerBoundary: {
        mode: "IN_PROCESS_BATCHED_WRITE_QUEUE",
        batchingEnabled: reports.conversationLowTail?.gatewayWriteProfile?.batchingEnabled === true,
        batchSize: numberOrNull(reports.conversationLowTail?.gatewayWriteProfile?.batchSize),
        batchDelayMs: numberOrNull(reports.conversationLowTail?.gatewayWriteProfile?.batchDelayMs),
      },
      metrics: {
        lowTailConcurrency: numberOrNull(reports.conversationLowTail?.concurrency),
        lowTailP99Ms: numberOrNull(conversationPhase.latencyMs?.p99),
        dbAcquireP99Ms: numberOrNull(conversationPhase.serverTimingBreakdownMs?.["db.acquire"]?.p99),
        burstConcurrency: numberOrNull(reports.conversationBurst?.concurrency),
        burstP99Ms: numberOrNull(conversationBurstPhase.latencyMs?.p99),
        burstDbAcquireP99Ms: numberOrNull(conversationBurstPhase.serverTimingBreakdownMs?.["db.acquire"]?.p99),
        runtimeRecommendation: reports.conversationRuntime?.decisions?.highConcurrency?.recommendation ?? null,
      },
    },
    {
      id: "teaching_archive_and_quiz",
      classification: runtimeBackedClassification({
        fallback: "MODULE_SMOKE_ONLY",
        promoted: "MODULE_RUNTIME_SLO_FROM_SUSTAINED_MIXED_WORKLOAD",
        ready: reports.teachingArchive?.status === "PASSED",
        evidence: teachingRuntimeEvidence,
      }),
      sourceReportPath: sourceFiles.teachingArchive,
      status: reports.teachingArchive?.status ?? null,
      database: {
        required: true,
        mode: "POSTGRES_VIA_PGBOUNCER",
        workerCount: numberOrNull(reports.teachingArchive?.gatewayCount),
        maxConnectionsTotal: numberOrNull(reports.teachingArchive?.gatewayDatabaseProfile?.dbMaxConns),
      },
      queueOrWorkerBoundary: {
        mode: "HTTP_WORKFLOW_PLUS_OPTIONAL_AI_WORKER_CLAIMS",
        workerClaimsCoveredByContracts: true,
      },
      metrics: {
        concurrency: numberOrNull(reports.teachingArchive?.concurrency),
        errors: numberOrNull(reports.teachingArchive?.summary?.totalErrors),
        slowestP99Ms: teachingPhase?.p99Ms ?? null,
        slowestP99Phase: teachingPhase?.name ?? null,
        sustainedRuntimeEvidence: teachingRuntimeEvidence,
      },
    },
    {
      id: "knowledge_retrieval",
      classification: runtimeBackedClassification({
        fallback: "POLICY_SMOKE_ONLY",
        promoted: "POLICY_RUNTIME_SLO_FROM_SUSTAINED_MIXED_WORKLOAD",
        ready: reports.knowledgeRetrieval?.readiness === "READY",
        evidence: knowledgeRuntimeEvidence,
      }),
      sourceReportPath: sourceFiles.knowledgeRetrieval,
      status: reports.knowledgeRetrieval?.readiness ?? null,
      database: {
        required: false,
        mode: "POLICY_CORPUS_NO_POSTGRES_RUNTIME_IN_CURRENT_EVIDENCE",
        maxConnectionsTotal: 0,
      },
      queueOrWorkerBoundary: {
        mode: "HYBRID_QUERY_PLAN",
        workloadCount: Array.isArray(reports.knowledgeRetrieval?.benchmark?.workloadResults)
          ? reports.knowledgeRetrieval.benchmark.workloadResults.length
          : 0,
      },
      metrics: {
        p95QueryPlanMs: numberOrNull(reports.knowledgeRetrieval?.benchmark?.metrics?.p95QueryPlanMs),
        totalPlans: numberOrNull(reports.knowledgeRetrieval?.benchmark?.metrics?.totalPlans),
        sustainedRuntimeEvidence: knowledgeRuntimeEvidence,
      },
    },
    {
      id: "ai_worker_optional_runtime",
      classification: runtimeBackedClassification({
        fallback: "WORKER_BOUNDARY_ONLY",
        promoted: "WORKER_ADMISSION_RUNTIME_SLO_FROM_SUSTAINED_MIXED_WORKLOAD",
        ready: reports.aiWorkerAdmission?.readiness === "READY" &&
          findingPassed(reports.aiWorkerAdmission, "admission.no_baseline_runtime_dependency") &&
          findingPassed(reports.aiWorkerAdmission, "admission.no_direct_db_write"),
        evidence: aiWorkerRuntimeEvidence,
      }),
      sourceReportPath: sourceFiles.aiWorkerAdmission,
      status: reports.aiWorkerAdmission?.readiness ?? null,
      database: {
        required: false,
        mode: "NO_DIRECT_MAIN_DATABASE_WRITE",
        maxConnectionsTotal: 0,
      },
      queueOrWorkerBoundary: {
        mode: "ADMISSION_TO_ISOLATED_PYTHON_WORKER",
        dispatchDecision: reports.aiWorkerAdmission?.admission?.decision ?? null,
      },
      metrics: {
        allowedDispatchExamples: countDelimitedFinding(reports.aiWorkerAdmission, "admission.current_jobs_allowed"),
        noDirectDbWrite: findingPassed(reports.aiWorkerAdmission, "admission.no_direct_db_write"),
        noBaselineRuntimeDependency: findingPassed(reports.aiWorkerAdmission, "admission.no_baseline_runtime_dependency"),
        sustainedRuntimeEvidence: aiWorkerRuntimeEvidence,
      },
    },
    {
      id: "agent_harness_and_workflow_plugin",
      classification: runtimeBackedClassification({
        fallback: "REVIEW_ONLY_QUEUE_BOUNDARY",
        promoted: "REVIEW_RUNTIME_SLO_AND_QUEUE_BOUNDARY",
        ready: reports.agentHarness?.readiness === "READY" &&
          findingPassed(reports.agentHarness, "approval.queue.no_execution_candidates") &&
          findingPassed(reports.workflowPluginFlow, "sandbox.no_host_write") &&
          reports.workflowPluginRegistry?.decision === "ALLOW_SAVE",
        evidence: workflowRuntimeEvidence,
      }),
      sourceReportPath: sourceFiles.agentHarness,
      status: reports.agentHarness?.readiness ?? null,
      database: {
        required: false,
        mode: "JSONL_AND_REGISTRY_CONTRACTS",
        maxConnectionsTotal: 0,
      },
      queueOrWorkerBoundary: {
        mode: "APPROVAL_QUEUE_AND_SANDBOXED_WORKFLOW_REGISTRY",
        approvalQueueExecutionCandidates: findingActual(reports.agentHarness, "approval.queue.no_execution_candidates"),
        registryDecision: reports.workflowPluginRegistry?.decision ?? null,
      },
      metrics: {
        approvalExecutionReadyFalse: findingPassed(reports.agentHarness, "approval.decision.execution_ready_false"),
        workflowSandboxNoHostWrite: findingPassed(reports.workflowPluginFlow, "sandbox.no_host_write"),
        workflowRegistryAllowsSave: reports.workflowPluginRegistry?.decision === "ALLOW_SAVE",
        workflowRuntimeEvidence,
      },
    },
  ];
}

function buildQueueAndWorkerDiagnostics(reports) {
  return [
    {
      id: "conversation_batched_write_queue",
      status: reports.conversationLowTail?.gatewayWriteProfile?.batchingEnabled === true ? "READY" : "NEEDS_REMEDIATION",
      summary: `batchSize=${reports.conversationLowTail?.gatewayWriteProfile?.batchSize ?? "missing"} delayMs=${reports.conversationLowTail?.gatewayWriteProfile?.batchDelayMs ?? "missing"}`,
      sourceReportPath: sourceFiles.conversationLowTail,
    },
    {
      id: "ai_worker_dispatch_boundary",
      status: findingPassed(reports.aiWorkerAdmission, "admission.current_jobs_allowed") &&
        findingPassed(reports.aiWorkerAdmission, "admission.no_direct_db_write") &&
        findingPassed(reports.aiWorkerJob, "job.no_baseline_dependency") &&
        findingPassed(reports.aiWorkerJob, "result.no_direct_db_write")
        ? "READY"
        : "NEEDS_REMEDIATION",
      summary: "worker jobs dispatch through admission and cannot write directly to the main database",
      sourceReportPath: sourceFiles.aiWorkerAdmission,
    },
    {
      id: "agent_harness_approval_queue",
      status: findingPassed(reports.agentHarness, "approval.queue.no_execution_candidates") &&
        findingPassed(reports.agentHarness, "approval.decision.execution_ready_false")
        ? "READY"
        : "NEEDS_REMEDIATION",
      summary: "approval queue is review-only and exposes zero execution candidates",
      sourceReportPath: sourceFiles.agentHarness,
    },
    {
      id: "workflow_plugin_sandbox_registry",
      status: findingPassed(reports.workflowPluginFlow, "sandbox.no_host_write") &&
        findingPassed(reports.workflowPluginFlow, "sandbox.network_default_deny") &&
        findingPassed(reports.workflowPluginFlow, "registry.requires_sandbox_and_approval") &&
        reports.workflowPluginRegistry?.decision === "ALLOW_SAVE"
        ? "READY"
        : "NEEDS_REMEDIATION",
      summary: "generated workflow/plugin artifacts require sandbox, approval, and registry admission",
      sourceReportPath: sourceFiles.workflowPluginFlow,
    },
  ];
}

function buildMixedWorkloadDiagnostics(reports) {
  const summary = reports.sustainedScaleUp?.summary ?? {};
  const workloadNames = collectMixedWorkloadNames(reports.sustainedScaleUp);
  const requiredNames = ["ai_worker_admission", "conversation_write", "identity_http", "knowledge_retrieval", "teaching_archive"];
  return {
    sourceReportPath: sourceFiles.sustainedScaleUp,
    status: reports.sustainedScaleUp?.status ?? null,
    highestPassedStep: summary.highestPassedStep ?? null,
    totalErrors: numberOrNull(summary.totalErrors),
    orchestrationErrors: numberOrNull(summary.orchestrationErrors),
    maxP99Ms: numberOrNull(summary.maxP99Ms),
    maxP99DriftMs: numberOrNull(summary.maxP99DriftMs),
    workloadNames,
    workloadNamesComplete: requiredNames.every((name) => workloadNames.includes(name)),
  };
}

function sustainedWorkloadRuntimeEvidence(reports, mixedWorkload, workloadName) {
  const report = reports.sustainedScaleUp;
  const { step, workload } = selectSustainedRuntimeEvidenceStep(report, workloadName);
  const passed = report?.status === "PASSED" &&
    mixedWorkload?.totalErrors === 0 &&
    mixedWorkload?.orchestrationErrors === 0 &&
    stepRank(step?.name) >= stepRank("high") &&
    step?.status === "PASSED" &&
    workload?.errors === 0;
  return {
    sourceReportPath: sourceFiles.sustainedScaleUp,
    workloadName,
    stepName: step?.name ?? null,
    present: Boolean(workload),
    passed,
    errors: numberOrNull(workload?.errors),
    p95Ms: numberOrNull(workload?.summary?.p95Ms),
    p99Ms: numberOrNull(workload?.summary?.p99Ms ?? workload?.maxP99Ms),
    stepReadWriteRps: numberOrNull(step?.readWriteRps),
  };
}

function workflowPluginRuntimeEvidence(reports) {
  const report = reports.workflowPluginRuntimeSlo;
  const targetP99Ms = numberOrNull(report?.runtimeSlo?.targetP99Ms);
  const p99Ms = numberOrNull(report?.runtimeSlo?.p99Ms);
  const totalErrors = numberOrNull(report?.runtimeSlo?.totalErrors);
  const passed = report?.readiness === "READY" &&
    totalErrors === 0 &&
    Number.isFinite(p99Ms) &&
    Number.isFinite(targetP99Ms) &&
    p99Ms <= targetP99Ms &&
    report?.safetyInvariants?.localExecutionEnabled === false &&
    report?.safetyInvariants?.localGeneratedCodeExecuted === false &&
    report?.safetyInvariants?.sandboxNoHostWrite === true;
  return {
    sourceReportPath: sourceFiles.workflowPluginRuntimeSlo,
    workloadName: "workflow_plugin_runtime_slo",
    present: Boolean(report),
    passed,
    targetP99Ms,
    p95Ms: numberOrNull(report?.runtimeSlo?.p95Ms),
    p99Ms,
    totalErrors,
    localGeneratedCodeExecuted: report?.safetyInvariants?.localGeneratedCodeExecuted ?? null,
    localExecutionEnabled: report?.safetyInvariants?.localExecutionEnabled ?? null,
  };
}

function runtimeBackedClassification({ fallback, promoted, ready, evidence }) {
  return ready === true && evidence?.passed === true ? promoted : fallback;
}

function selectSustainedRuntimeEvidenceStep(report, workloadName) {
  return (report?.steps ?? [])
    .map((step, index) => ({
      step,
      index,
      rank: stepRank(step?.name),
      workload: (step?.workloads ?? []).find((candidate) => candidate.name === workloadName),
    }))
    .filter((candidate) =>
      candidate.step?.status === "PASSED" &&
      candidate.rank >= stepRank("high") &&
      candidate.workload
    )
    .sort((left, right) => right.rank - left.rank || right.index - left.index)
    .at(0) ?? { step: null, workload: null };
}

function stepRank(stepName) {
  const ranks = {
    smoke: 1,
    low: 2,
    medium: 3,
    high: 4,
    production_candidate: 5,
    "target-3k": 5,
    "target-5k": 6,
    "target-8k": 7,
    "target-10k": 8,
  };
  return ranks[String(stepName ?? "").toLowerCase()] ?? 0;
}

function safeEvaluateBudget(config) {
  try {
    return evaluateConnectionBudget(config);
  } catch {
    return null;
  }
}

function parseSources(sources) {
  return Object.fromEntries(Object.values(sourceFiles).map((sourcePath) => {
    const text = sources[sourcePath];
    if (typeof text !== "string" || text.trim().length === 0) {
      return [sourcePath, { present: false, parseable: false }];
    }
    try {
      return [sourcePath, { present: true, parseable: true, value: JSON.parse(text) }];
    } catch (error) {
      return [sourcePath, { present: true, parseable: false, error: error.message }];
    }
  }));
}

function slowestPhase(phases, percentile) {
  return Object.entries(phases ?? {})
    .map(([name, phase]) => ({ name, p99Ms: numberOrNull(phase.latencyMs?.[percentile]) }))
    .filter((phase) => Number.isFinite(phase.p99Ms))
    .sort((left, right) => right.p99Ms - left.p99Ms)
    .at(0) ?? null;
}

function stepLatencyAttribution(phase) {
  const existing = phase?.stepLatencyAttribution;
  if (existing && typeof existing === "object") {
    return {
      slowestStep: existing.slowestStep ?? null,
      slowestStepP99Ms: numberOrNull(existing.slowestStepP99Ms),
      stepP99SumMs: numberOrNull(existing.stepP99SumMs),
      p99ResidualMs: numberOrNull(existing.p99ResidualMs),
    };
  }
  const stepLatencyMs = phase?.stepLatencyMs;
  if (!stepLatencyMs || typeof stepLatencyMs !== "object") {
    return {
      slowestStep: null,
      slowestStepP99Ms: null,
      stepP99SumMs: null,
      p99ResidualMs: null,
    };
  }
  let slowestStep = null;
  let slowestStepP99Ms = null;
  let stepP99SumMs = 0;
  for (const [stepName, latency] of Object.entries(stepLatencyMs)) {
    const p99 = numberOrNull(latency?.p99);
    if (!Number.isFinite(p99)) continue;
    stepP99SumMs += p99;
    if (slowestStep === null || p99 > slowestStepP99Ms) {
      slowestStep = stepName;
      slowestStepP99Ms = p99;
    }
  }
  if (slowestStep === null) {
    return {
      slowestStep: null,
      slowestStepP99Ms: null,
      stepP99SumMs: null,
      p99ResidualMs: null,
    };
  }
  const phaseP99Ms = numberOrNull(phase?.latencyMs?.p99);
  const roundedStepP99SumMs = roundNumber(stepP99SumMs);
  return {
    slowestStep,
    slowestStepP99Ms,
    stepP99SumMs: roundedStepP99SumMs,
    p99ResidualMs: Number.isFinite(phaseP99Ms) ? roundNumber(phaseP99Ms - roundedStepP99SumMs) : null,
  };
}

function findingPassed(report, id) {
  return (report?.findings ?? []).some((finding) => finding.id === id && finding.passed === true);
}

function findingActual(report, id) {
  return (report?.findings ?? []).find((finding) => finding.id === id)?.actual ?? null;
}

function countDelimitedFinding(report, id) {
  const actual = findingActual(report, id);
  if (typeof actual !== "string" || actual.trim().length === 0) return 0;
  return actual.split(";").filter(Boolean).length;
}

function collectMixedWorkloadNames(report) {
  const names = new Set();
  for (const step of report?.steps ?? []) {
    for (const workload of step.workloads ?? []) {
      if (typeof workload.name === "string") names.add(workload.name);
    }
  }
  return [...names].sort();
}

function sumPhaseErrors(phases) {
  return Object.values(phases ?? {}).reduce((total, phase) => total + (Number.isFinite(phase.errors) ? phase.errors : 0), 0);
}

function queueMetric(modules, id, metric) {
  const value = modules.find((module) => module.id === id)?.metrics?.[metric];
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function sumNumbers(values) {
  const numbers = values.filter(Number.isFinite);
  if (numbers.length !== values.length) return null;
  return numbers.reduce((total, value) => total + value, 0);
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function roundNumber(value) {
  return Math.round(value * 100) / 100;
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
  return {
    sources: Object.fromEntries(Object.values(sourceFiles).map((sourcePath) => [
      sourcePath,
      fs.readFileSync(path.join(root, sourcePath), "utf8"),
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
    const report = auditCrossModuleDbQueueDiagnostics(loadCurrentInputs(root));
    writeReport(root, args.out, report);
    console.log(formatCrossModuleDbQueueDiagnostics(report));
    process.exit(report.readiness === "READY" ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
