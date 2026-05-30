import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const REPORT_SCHEMA_VERSION = "2026-05-30.knowledge.retrieval-benchmark.report.v1";
const BENCHMARK_FILES = {
  policy: "contracts/knowledge/knowledge-access-policy.current.json",
  benchmark: "contracts/knowledge/knowledge-retrieval-benchmark.current.json",
};
const REQUIRED_NODE_TYPES = ["CLOUD", "LOCAL", "REMOTE_DEVICE"];
const REQUIRED_CLASSIFICATIONS = ["PUBLIC", "PRIVATE", "STUDENT_ARCHIVE", "REMOTE_DEVICE_OWNED"];

export function runKnowledgeRetrievalBenchmark(input) {
  const policy = input.policy ?? {};
  const benchmark = input.benchmark ?? {};
  const documents = Array.isArray(benchmark.corpus?.documents) ? benchmark.corpus.documents : [];
  const workloads = Array.isArray(benchmark.workloads) ? benchmark.workloads : [];
  const iterations = Number.isInteger(benchmark.iterations) && benchmark.iterations > 0
    ? benchmark.iterations
    : 1;
  const retrievalPolicy = policy.retrievalPolicy ?? {};
  const budget = retrievalPolicy.queryPlanBudget ?? {};
  const samples = [];
  const workloadResults = workloads.map((workload) => {
    const firstPlan = planRetrieval({ workload, documents, policy, retrievalPolicy, budget });
    for (let index = 0; index < iterations; index += 1) {
      samples.push(runMeasuredPlan({ workload, documents, policy, retrievalPolicy, budget }));
    }
    return firstPlan;
  });

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourcePolicyVersion: policy.schemaVersion ?? "unknown",
    benchmarkProfileVersion: benchmark.schemaVersion ?? "unknown",
    benchmarkId: benchmark.benchmarkId ?? "unknown",
    iterations,
    metrics: buildMetrics(samples, workloadResults),
    workloadResults,
  };
}

export function auditKnowledgeRetrievalBenchmark(inputs) {
  const findings = [];
  const policy = inputs.policy ?? {};
  const benchmark = inputs.benchmark ?? {};
  const documents = Array.isArray(benchmark.corpus?.documents) ? benchmark.corpus.documents : [];
  const workloads = Array.isArray(benchmark.workloads) ? benchmark.workloads : [];
  const retrievalPolicy = policy.retrievalPolicy ?? {};
  const budget = retrievalPolicy.queryPlanBudget ?? {};
  const report = runKnowledgeRetrievalBenchmark(inputs);

  addFinding(findings, {
    id: "profile.non_empty_corpus",
    passed: documents.length > 0 && countChunks(documents) > 0 && workloads.length > 0,
    actual: `documents=${documents.length} chunks=${countChunks(documents)} workloads=${workloads.length}`,
    expected: "documents>0 chunks>0 workloads>0",
    remediation: "Retrieval benchmarks must use a real non-empty corpus and workload set.",
  });

  addFinding(findings, {
    id: "profile.workload_coverage",
    passed: hasAll(unique(workloads.map((workload) => workload.nodeType)), REQUIRED_NODE_TYPES) &&
      hasAll(unique(workloads.flatMap((workload) => workload.expectedClassifications ?? [])), REQUIRED_CLASSIFICATIONS),
    actual: summarizeCoverage(workloads),
    expected: "nodes=CLOUD,LOCAL,REMOTE_DEVICE classifications=PUBLIC,PRIVATE,STUDENT_ARCHIVE,REMOTE_DEVICE_OWNED",
    remediation: "Benchmark workloads must cover cloud, local, remote-device, and all knowledge classifications.",
  });

  addFinding(findings, {
    id: "policy.hybrid_enabled",
    passed: retrievalPolicy.defaultStrategy === "HYBRID" &&
      retrievalPolicy.chunkingRetained === true &&
      retrievalPolicy.directoryIntentIndexEnabled === true,
    actual: summarizeRetrievalPolicy(retrievalPolicy),
    expected: "default=HYBRID chunkingRetained=true directoryIntentIndexEnabled=true",
    remediation: "Retrieval benchmark evidence must be tied to the hybrid retrieval policy.",
  });

  addFinding(findings, {
    id: "benchmark.non_empty_hybrid_plans",
    passed: report.workloadResults.length > 0 && report.workloadResults.every(isNonEmptyHybridPlan),
    actual: summarizePlans(report.workloadResults),
    expected: "every workload HYBRID with directoryCandidates>0 chunkCandidates>0 returnedCandidates>0",
    remediation: "Benchmarks must exercise both directory-intent and chunk candidate paths.",
  });

  addFinding(findings, {
    id: "benchmark.candidate_budget",
    passed: report.metrics.maxDirectoryCandidates <= budget.maxDirectoryCandidates &&
      report.metrics.maxChunkCandidates <= budget.maxChunkCandidates,
    actual: `directory=${report.metrics.maxDirectoryCandidates} chunk=${report.metrics.maxChunkCandidates}`,
    expected: `directory<=${budget.maxDirectoryCandidates} chunk<=${budget.maxChunkCandidates}`,
    remediation: "Retrieval planning must respect the current query-plan candidate budgets.",
  });

  addFinding(findings, {
    id: "benchmark.p95_budget",
    passed: report.metrics.p95QueryPlanMs <= budget.targetP95Ms,
    actual: `${report.metrics.p95QueryPlanMs}ms`,
    expected: `<=${budget.targetP95Ms}ms`,
    remediation: "Hybrid retrieval planning must stay within the current P95 query-plan budget.",
  });

  addFinding(findings, {
    id: "benchmark.no_cross_classification_leakage",
    passed: report.workloadResults.every((result) => result.policyAllowed === true && result.returnedWithinPolicy === true),
    actual: summarizeClassificationLeaks(report.workloadResults),
    expected: "all expected and returned classifications are allowed by node policy",
    remediation: "Benchmark workloads and returned candidates must not cross node knowledge-access policy.",
  });

  return {
    generatedAt: new Date().toISOString(),
    readiness: findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION",
    benchmark: report,
    findings,
  };
}

export function formatKnowledgeRetrievalBenchmarkAudit(report) {
  const lines = [
    `Knowledge retrieval benchmark: ${report.readiness}`,
    "",
    `P95 query plan: ${report.benchmark.metrics.p95QueryPlanMs}ms`,
    `Max candidates: directory=${report.benchmark.metrics.maxDirectoryCandidates} chunk=${report.benchmark.metrics.maxChunkCandidates}`,
    "",
    "Findings:",
  ];
  for (const finding of report.findings) {
    lines.push(
      `- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`,
    );
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  return lines.join("\n");
}

function runMeasuredPlan(args) {
  const startedAt = performance.now();
  const plan = planRetrieval(args);
  const elapsedMs = performance.now() - startedAt;
  return {
    workloadId: plan.workloadId,
    elapsedMs: roundToMillis(Math.max(elapsedMs, plan.estimatedQueryPlanMs)),
  };
}

function planRetrieval({ workload, documents, policy, retrievalPolicy, budget }) {
  const allowed = allowedClassificationsForNode(policy, workload.nodeType);
  const expectedClassifications = workload.expectedClassifications ?? [];
  const visibleDocuments = documents.filter((document) =>
    allowed.includes(document.classification) &&
    expectedClassifications.includes(document.classification));
  const queryTerms = queryTokens([workload.query, ...(workload.intentTags ?? [])].join(" "));
  const directoryCandidates = visibleDocuments
    .map((document) => ({
      document,
      score: scoreText(`${document.directoryPath} ${(document.intentTags ?? []).join(" ")}`, queryTerms),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort(compareScoredDocument)
    .slice(0, budget.maxDirectoryCandidates ?? Number.MAX_SAFE_INTEGER);
  const chunkCandidates = visibleDocuments
    .flatMap((document) => (document.chunks ?? []).map((chunk) => ({
      document,
      chunk,
      score: scoreText(`${chunk.text} ${(chunk.intentTags ?? []).join(" ")}`, queryTerms),
    })))
    .filter((candidate) => candidate.score > 0)
    .sort(compareScoredChunk)
    .slice(0, budget.maxChunkCandidates ?? Number.MAX_SAFE_INTEGER);
  const returnedClassifications = unique([
    ...directoryCandidates.map((candidate) => candidate.document.classification),
    ...chunkCandidates.map((candidate) => candidate.document.classification),
  ]);

  return {
    workloadId: workload.workloadId ?? "",
    nodeType: workload.nodeType ?? "",
    strategy: retrievalPolicy.defaultStrategy ?? "UNKNOWN",
    expectedClassifications,
    allowedClassifications: allowed,
    returnedClassifications,
    policyAllowed: expectedClassifications.every((classification) => allowed.includes(classification)),
    returnedWithinPolicy: returnedClassifications.every((classification) => allowed.includes(classification)),
    directoryCandidatesExamined: directoryCandidates.length,
    chunkCandidatesExamined: chunkCandidates.length,
    returnedCandidateCount: directoryCandidates.length + chunkCandidates.length,
    estimatedQueryPlanMs: estimateQueryPlanMs(retrievalPolicy, directoryCandidates.length, chunkCandidates.length),
  };
}

function allowedClassificationsForNode(policy, nodeType) {
  const nodePolicy = (policy.nodePolicies ?? []).find((item) => item.nodeType === nodeType);
  if (!nodePolicy) return [];
  return [
    ...(nodePolicy.allowedLocalClassifications ?? []),
    ...(nodePolicy.allowedRemoteClassifications ?? []),
  ];
}

function buildMetrics(samples, workloadResults) {
  const elapsed = samples.map((sample) => sample.elapsedMs);
  return {
    totalPlans: samples.length,
    p95QueryPlanMs: percentile(elapsed, 95),
    maxQueryPlanMs: elapsed.length === 0 ? 0 : Math.max(...elapsed),
    maxDirectoryCandidates: maxOf(workloadResults, (result) => result.directoryCandidatesExamined),
    maxChunkCandidates: maxOf(workloadResults, (result) => result.chunkCandidatesExamined),
  };
}

function estimateQueryPlanMs(retrievalPolicy, directoryCount, chunkCount) {
  const hybridOverhead = retrievalPolicy.defaultStrategy === "HYBRID" ? 0.6 : 0;
  const directoryCost = retrievalPolicy.directoryIntentIndexEnabled === true ? directoryCount * 0.45 : 0;
  const chunkCost = retrievalPolicy.chunkingRetained === true ? chunkCount * 0.35 : 0;
  return roundToMillis(0.8 + hybridOverhead + directoryCost + chunkCost);
}

function isNonEmptyHybridPlan(result) {
  return result.strategy === "HYBRID" &&
    result.directoryCandidatesExamined > 0 &&
    result.chunkCandidatesExamined > 0 &&
    result.returnedCandidateCount > 0;
}

function queryTokens(text) {
  return unique(String(text).toLowerCase().split(/[^a-z0-9_]+/).filter((token) => token.length > 1));
}

function scoreText(text, queryTerms) {
  const haystack = String(text).toLowerCase();
  return queryTerms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function compareScoredDocument(left, right) {
  return right.score - left.score || left.document.documentId.localeCompare(right.document.documentId);
}

function compareScoredChunk(left, right) {
  return right.score - left.score || left.chunk.chunkId.localeCompare(right.chunk.chunkId);
}

function percentile(values, percentileValue) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return roundToMillis(sorted[index]);
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

function countChunks(documents) {
  return documents.reduce((total, document) => total + (document.chunks ?? []).length, 0);
}

function summarizeCoverage(workloads) {
  return [
    `nodes=${unique(workloads.map((workload) => workload.nodeType)).join(",")}`,
    `classifications=${unique(workloads.flatMap((workload) => workload.expectedClassifications ?? [])).join(",")}`,
  ].join(" ");
}

function summarizeRetrievalPolicy(retrievalPolicy) {
  return [
    `default=${stringifyScalar(retrievalPolicy.defaultStrategy)}`,
    `chunkingRetained=${stringifyScalar(retrievalPolicy.chunkingRetained)}`,
    `directoryIntentIndexEnabled=${stringifyScalar(retrievalPolicy.directoryIntentIndexEnabled)}`,
  ].join(" ");
}

function summarizePlans(results) {
  if (results.length === 0) return "no plans";
  return results
    .map((result) => `${result.workloadId}:${result.strategy}:dir=${result.directoryCandidatesExamined}:chunk=${result.chunkCandidatesExamined}:returned=${result.returnedCandidateCount}`)
    .join(";");
}

function summarizeClassificationLeaks(results) {
  const leaks = results.filter((result) => result.policyAllowed !== true || result.returnedWithinPolicy !== true);
  if (leaks.length === 0) return "none";
  return leaks
    .map((result) => `${result.workloadId}:allowed=${result.allowedClassifications.join(",")}:expected=${result.expectedClassifications.join(",")}:returned=${result.returnedClassifications.join(",")}`)
    .join(";");
}

function hasAll(values, required) {
  return required.every((value) => values.includes(value));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function maxOf(values, accessor) {
  if (values.length === 0) return 0;
  return Math.max(...values.map(accessor));
}

function roundToMillis(value) {
  return Number(value.toFixed(3));
}

function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return String(value);
}

function loadCurrentInputs(root) {
  return Object.fromEntries(
    Object.entries(BENCHMARK_FILES).map(([key, relativePath]) => [
      key,
      JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8")),
    ]),
  );
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  return {
    outPath: outIndex === -1 ? undefined : argv[outIndex + 1],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = auditKnowledgeRetrievalBenchmark(loadCurrentInputs(process.cwd()));
    if (args.outPath) {
      fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
      fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(formatKnowledgeRetrievalBenchmarkAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
