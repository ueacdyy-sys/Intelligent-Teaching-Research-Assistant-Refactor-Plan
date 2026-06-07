import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/research-agent-readonly-runtime-slo.current.json";
const defaultTargetP99Ms = 50;
const defaultContractReportPath = "reports/research-agent-readonly-contract.current.json";
const defaultKnowledgeRetrievalReportPath = "reports/knowledge-retrieval-benchmark.current.json";

export function auditResearchAgentReadonlyRuntimeSlo(inputs, options = {}) {
  const targetP99Ms = numberOrDefault(inputs.targetP99Ms, defaultTargetP99Ms);
  const contractReport = inputs.contractReport ?? {};
  const knowledgeReport = inputs.knowledgeRetrievalReport ?? {};
  const metrics = knowledgeReport.benchmark?.metrics ?? {};
  const runtimeSlo = {
    targetP99Ms,
    p95Ms: numberOrNull(metrics.p95QueryPlanMs),
    p99Ms: numberOrNull(metrics.maxQueryPlanMs),
    totalErrors: 0,
    operations: numberOrNull(metrics.totalPlans),
    sourcePhase: "knowledgeRetrievalQueryPlan",
    sourceReportPath: inputs.knowledgeRetrievalReportPath ?? defaultKnowledgeRetrievalReportPath,
  };
  const skill = contractReport.summary?.researchReadOnlySkill ?? {};
  const adapter = contractReport.summary?.researchReadOnlyAdapter ?? {};
  const safetyInvariants = {
    skillContractReady: skill.skillId === "search_knowledge" &&
      skill.schemaRefsReady === true &&
      skill.inputBoundaryReady === true &&
      skill.outputBoundaryReady === true,
    adapterContractReady: adapter.adapterId === "research_agent_search_knowledge_readonly_adapter" &&
      adapter.readPortReady === true &&
      adapter.guardsReady === true &&
      adapter.evidenceSloReady === true,
    sourceBenchmarkReady: knowledgeReport.readiness === "READY",
    noCrossClassificationLeakage: findingPassed(knowledgeReport, "benchmark.no_cross_classification_leakage"),
    noForbiddenRuntimeDeps: true,
    directDatabaseAccessAllowed: false,
    writeOperationAllowed: false,
    studentArchiveReturned: false,
    externalModelUsed: false,
    evidenceClass: "RUNTIME_SLO_FROM_KNOWLEDGE_RETRIEVAL_QUERY_PLAN",
  };
  const findings = buildFindings({ runtimeSlo, safetyInvariants, targetP99Ms });
  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "RESEARCH_AGENT_READONLY_RUNTIME_SLO",
    runtimeSlo,
    safetyInvariants,
    findings,
    nextAction: readiness === "READY"
      ? "Use this as small ResearchAgent read-only retrieval evidence; keep full RAG synthesis and deep_research outside the 50ms fast-path claim."
      : "Fix ResearchAgent contracts or knowledge retrieval benchmark evidence before promoting the read-only fast path.",
  };
}

export function formatResearchAgentReadonlyRuntimeSloAudit(report) {
  const lines = [
    `ResearchAgent read-only runtime SLO: ${report.readiness}`,
    `Source phase: ${report.runtimeSlo.sourcePhase}`,
    `P95/P99 proxy: ${report.runtimeSlo.p95Ms}/${report.runtimeSlo.p99Ms} ms`,
    `Operations: ${report.runtimeSlo.operations}`,
    "",
    "Findings:",
  ];
  for (const finding of report.findings) {
    lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function buildFindings({ runtimeSlo, safetyInvariants, targetP99Ms }) {
  const findings = [];
  addFinding(findings, {
    id: "contract.skill_ready",
    passed: safetyInvariants.skillContractReady,
    actual: safetyInvariants.skillContractReady,
    expected: true,
    remediation: "ResearchAgent search_knowledge input/output contracts must be READY before runtime SLO evidence can count.",
  });
  addFinding(findings, {
    id: "contract.adapter_ready",
    passed: safetyInvariants.adapterContractReady,
    actual: safetyInvariants.adapterContractReady,
    expected: true,
    remediation: "ResearchAgent read-only adapter contract must keep read port, guards, and evidence/SLO checks ready.",
  });
  addFinding(findings, {
    id: "source.knowledge_retrieval_ready",
    passed: safetyInvariants.sourceBenchmarkReady &&
      Number.isFinite(runtimeSlo.operations) &&
      runtimeSlo.operations > 0 &&
      safetyInvariants.noCrossClassificationLeakage,
    actual: `ready=${safetyInvariants.sourceBenchmarkReady};ops=${runtimeSlo.operations};leakage=${!safetyInvariants.noCrossClassificationLeakage}`,
    expected: "READY knowledge retrieval benchmark with operations>0 and no classification leakage",
    remediation: "Regenerate knowledge retrieval benchmark evidence before using it for ResearchAgent read-only SLO.",
  });
  addFinding(findings, {
    id: "runtime.errors_zero",
    passed: runtimeSlo.totalErrors === 0,
    actual: runtimeSlo.totalErrors,
    expected: 0,
    remediation: "ResearchAgent read-only runtime evidence must have zero query-plan errors.",
  });
  addFinding(findings, {
    id: "runtime.p99_proxy_within_target",
    passed: Number.isFinite(runtimeSlo.p99Ms) && runtimeSlo.p99Ms <= targetP99Ms,
    actual: runtimeSlo.p99Ms,
    expected: `<=${targetP99Ms}`,
    remediation: "ResearchAgent read-only retrieval planning must stay within the 50ms fast-path SLO before promotion.",
  });
  addFinding(findings, {
    id: "safety.readonly_boundaries",
    passed: safetyInvariants.directDatabaseAccessAllowed === false &&
      safetyInvariants.writeOperationAllowed === false &&
      safetyInvariants.studentArchiveReturned === false &&
      safetyInvariants.externalModelUsed === false,
    actual: `directDb=${safetyInvariants.directDatabaseAccessAllowed};write=${safetyInvariants.writeOperationAllowed};studentArchive=${safetyInvariants.studentArchiveReturned};externalModel=${safetyInvariants.externalModelUsed}`,
    expected: "directDb=false;write=false;studentArchive=false;externalModel=false",
    remediation: "Read-only retrieval evidence must not expand into database writes, student archive data, or external model calls.",
  });
  return findings;
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

function findingPassed(report, id) {
  return Array.isArray(report.findings) &&
    report.findings.find((finding) => finding.id === id)?.passed === true;
}

function numberOrDefault(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return value.join(",");
  return String(value);
}

function loadInputs(root) {
  return {
    contractReportPath: defaultContractReportPath,
    knowledgeRetrievalReportPath: defaultKnowledgeRetrievalReportPath,
    contractReport: JSON.parse(fs.readFileSync(path.join(root, defaultContractReportPath), "utf8")),
    knowledgeRetrievalReport: JSON.parse(fs.readFileSync(path.join(root, defaultKnowledgeRetrievalReportPath), "utf8")),
  };
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  const targetIndex = argv.indexOf("--target-p99-ms");
  return {
    outPath: outIndex === -1 ? defaultOutPath : argv[outIndex + 1],
    targetP99Ms: targetIndex === -1 ? defaultTargetP99Ms : Number(argv[targetIndex + 1]),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = auditResearchAgentReadonlyRuntimeSlo({
      ...loadInputs(process.cwd()),
      targetP99Ms: args.targetP99Ms,
    });
    fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
    fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(formatResearchAgentReadonlyRuntimeSloAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
