import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  runDispatcherRuntimeProbes,
  summarizeDispatchProbes,
} from "./agent-readonly-runtime-dispatcher-audit-probes.mjs";

const defaultOutPath = "reports/agent-readonly-runtime-dispatcher.current.json";
const contractFiles = {
  dispatcherSchema: "contracts/agent/readonly-runtime-dispatcher.schema.json",
  dispatcherExample: "contracts/agent/readonly-runtime-dispatcher.example.json",
  teachingRuntimeSlo: "reports/teaching-agent-readonly-runtime-slo.current.json",
  studentTutorRuntimeSlo: "reports/student-tutor-agent-readonly-runtime-slo.current.json",
  researchRuntimeSlo: "reports/research-agent-readonly-runtime-slo.current.json",
  runtime: "tools/agent-readonly-runtime-dispatcher.mjs",
  runtimeTest: "tools/agent-readonly-runtime-dispatcher.test.mjs",
};

const requiredAdapters = [
  {
    workerAgent: "TeachingAgent",
    skillId: "search_teaching_material",
    adapterRef: "contracts/agent/teaching-agent-readonly-adapter.example.json",
    runtimeSloReportRef: "reports/teaching-agent-readonly-runtime-slo.current.json",
    inputSchemaRef: "contracts/agent/skills/search-teaching-material.input.schema.json",
    outputSchemaRef: "contracts/agent/skills/search-teaching-material.output.schema.json",
    readPort: {
      portName: "TeachingArchiveReadPort",
      operation: "searchTeachingMaterials",
    },
  },
  {
    workerAgent: "StudentTutorAgent",
    skillId: "recommend_practice",
    adapterRef: "contracts/agent/student-tutor-agent-readonly-adapter.example.json",
    runtimeSloReportRef: "reports/student-tutor-agent-readonly-runtime-slo.current.json",
    inputSchemaRef: "contracts/agent/skills/recommend-practice.input.schema.json",
    outputSchemaRef: "contracts/agent/skills/recommend-practice.output.schema.json",
    readPort: {
      portName: "StudentLearningReadPort",
      operation: "recommendPracticeContext",
    },
  },
  {
    workerAgent: "ResearchAgent",
    skillId: "search_knowledge",
    adapterRef: "contracts/agent/research-agent-readonly-adapter.example.json",
    runtimeSloReportRef: "reports/research-agent-readonly-runtime-slo.current.json",
    inputSchemaRef: "contracts/agent/skills/search-knowledge.input.schema.json",
    outputSchemaRef: "contracts/agent/skills/search-knowledge.output.schema.json",
    readPort: {
      portName: "KnowledgeQueryReadPort",
      operation: "searchKnowledge",
    },
  },
];

export async function auditAgentReadonlyRuntimeDispatcher(inputs, options = {}) {
  const findings = [];
  const schema = inputs.dispatcherSchema ?? {};
  const dispatcher = inputs.dispatcherExample ?? {};
  const runtimeReports = {
    TeachingAgent: inputs.teachingRuntimeSlo ?? {},
    StudentTutorAgent: inputs.studentTutorRuntimeSlo ?? {},
    ResearchAgent: inputs.researchRuntimeSlo ?? {},
  };
  const componentRuntime = summarizeComponentRuntime(dispatcher.adapters, runtimeReports);
  const maxP99Ms = Math.max(...componentRuntime.map((component) => component.p99Ms).filter(Number.isFinite));
  const totalErrors = componentRuntime.reduce(
    (total, component) => total + (Number.isFinite(component.totalErrors) ? component.totalErrors : 0),
    0,
  );
  const dispatchProbes = await runDispatcherRuntimeProbes(options);
  const teachingDispatchProbe = dispatchProbes.teachingAgentSearchTeachingMaterial;
  const studentTutorDispatchProbe = dispatchProbes.studentTutorRecommendPractice;
  const researchDispatchProbe = dispatchProbes.researchAgentSearchKnowledge;
  const dispatchProbeSummary = summarizeDispatchProbes(dispatchProbes);
  const effectiveP99Ms = Math.max(
    Number.isFinite(maxP99Ms) ? maxP99Ms : 0,
    Number.isFinite(dispatchProbeSummary.runtimeSlo?.p99Ms) ? dispatchProbeSummary.runtimeSlo.p99Ms : 0,
  );
  const effectiveTotalErrors = totalErrors + dispatchProbeSummary.runtimeSlo.totalErrors;

  addFinding(findings, {
    id: "dispatcher.schema_identity",
    passed: schema.properties?.schemaVersion?.const === "2026-06-04.agent.readonly-runtime-dispatcher.v1" &&
      schema.properties?.dispatcherId?.const === "agent_readonly_runtime_dispatcher" &&
      schema.properties?.routeMode?.const === "SINGLE_WORKER_ONLY" &&
      dispatcher.schemaVersion === "2026-06-04.agent.readonly-runtime-dispatcher.v1" &&
      dispatcher.dispatcherId === "agent_readonly_runtime_dispatcher" &&
      dispatcher.routeMode === "SINGLE_WORKER_ONLY",
    actual: `schema=${schema.properties?.schemaVersion?.const};dispatcher=${dispatcher.dispatcherId};route=${dispatcher.routeMode}`,
    expected: "readonly runtime dispatcher v1, agent_readonly_runtime_dispatcher, SINGLE_WORKER_ONLY",
    remediation: "Keep this dispatcher as the narrow read-only single-worker entry until the full Agent Loop is implemented.",
  });

  addFinding(findings, {
    id: "dispatcher.adapters_allowlist",
    passed: adaptersMatch(dispatcher.adapters),
    actual: summarizeAdapters(dispatcher.adapters),
    expected: requiredAdapters.map((adapter) => `${adapter.workerAgent}.${adapter.skillId}`).join(","),
    remediation: "Dispatcher must only expose TeachingAgent, StudentTutorAgent, and ResearchAgent read-only fast paths.",
  });

  addFinding(findings, {
    id: "dispatcher.boundary_readonly_only",
    passed: dispatcher.dispatchBoundary?.writeIntentAllowed === false &&
      dispatcher.dispatchBoundary?.directDatabaseAccessAllowed === false &&
      dispatcher.dispatchBoundary?.externalModelCallAllowed === false &&
      dispatcher.dispatchBoundary?.localToolMutationAllowed === false &&
      dispatcher.dispatchBoundary?.swarmAllowed === false &&
      dispatcher.dispatchBoundary?.deepResearchAllowed === false &&
      dispatcher.dispatchBoundary?.finalEvaluationAllowed === false &&
      dispatcher.dispatchBoundary?.rejectionMode === "DENY_WITH_EVIDENCE",
    actual: summarizeBoundary(dispatcher.dispatchBoundary),
    expected: "no writes, no direct DB, no model calls, no local mutation, no swarm, no deep research, no final evaluation",
    remediation: "Read-only runtime dispatcher must deny unsafe requests with evidence instead of silently routing them.",
  });

  addFinding(findings, {
    id: "dispatcher.admission_guards",
    passed: allTrue(dispatcher.admissionGuards, [
      "principalContextRequired",
      "sharedContextRequired",
      "guardrailResultRequired",
      "adapterAllowlistRequired",
      "denyUnknownSkill",
      "denyOnWriteIntent",
      "denyOnCrossScopeData",
      "denyOnExternalModelRequest",
      "denyOnLocalToolMutation",
    ]),
    actual: summarizeBooleanMap(dispatcher.admissionGuards),
    expected: "principal/shared/guardrail/allowlist and denial guards all true",
    remediation: "Dispatcher admission must keep identity, context, guardrail, and allowlist checks mandatory.",
  });

  addFinding(findings, {
    id: "dispatcher.evidence_required",
    passed: allTrue(dispatcher.evidence, [
      "routeDecisionRequired",
      "skillInvocationTraceRequired",
      "inputHashRequired",
      "outputSummaryRequired",
      "adapterDecisionRequired",
      "sourceSloReportRequired",
      "runtimeTimingRequired",
    ]),
    actual: summarizeBooleanMap(dispatcher.evidence),
    expected: "route, invocation, input hash, output summary, adapter decision, source SLO, and timing evidence all true",
    remediation: "Every dispatch must be traceable before this can become a real runtime entry.",
  });

  addFinding(findings, {
    id: "dispatcher.aggregate_slo_contract",
    passed: dispatcher.aggregateSlo?.p99BudgetMs <= 50 &&
      dispatcher.aggregateSlo?.aggregateStrategy === "MAX_COMPONENT_P99" &&
      dispatcher.aggregateSlo?.requiredZeroErrors === true &&
      dispatcher.aggregateSlo?.minComponentCount === 3,
    actual: `p99=${dispatcher.aggregateSlo?.p99BudgetMs};strategy=${dispatcher.aggregateSlo?.aggregateStrategy};zeroErrors=${dispatcher.aggregateSlo?.requiredZeroErrors};min=${dispatcher.aggregateSlo?.minComponentCount}`,
    expected: "p99<=50, MAX_COMPONENT_P99, requiredZeroErrors=true, minComponentCount=3",
    remediation: "Aggregate SLO must be based on the slowest component and require all three read-only paths.",
  });

  addFinding(findings, {
    id: "runtime.components_ready",
    passed: componentRuntime.length === 3 && componentRuntime.every((component) => component.ready),
    actual: componentRuntime.map((component) => `${component.workerAgent}:ready=${component.ready}:p99=${component.p99Ms}:errors=${component.totalErrors}`).join(";"),
    expected: "all three component runtime SLO reports READY",
    remediation: "Regenerate TeachingAgent, StudentTutorAgent, and ResearchAgent read-only runtime SLO reports before promoting dispatcher evidence.",
  });

  addFinding(findings, {
    id: "runtime.aggregate_p99_within_target",
    passed: Number.isFinite(maxP99Ms) && Number.isFinite(effectiveP99Ms) && effectiveP99Ms <= 50,
    actual: Number.isFinite(effectiveP99Ms) ? effectiveP99Ms : "missing",
    expected: "<=50",
    remediation: "The dispatcher cannot claim 50ms if any read-only component exceeds 50ms P99.",
  });

  addFinding(findings, {
    id: "runtime.aggregate_errors_zero",
    passed: componentRuntime.length === 3 && effectiveTotalErrors === 0,
    actual: effectiveTotalErrors,
    expected: 0,
    remediation: "The dispatcher cannot promote while any component reports runtime errors.",
  });

  addFinding(findings, {
    id: "runtime.implementation_invokes_teaching_adapter",
    passed: teachingDispatchProbe.status === "PASS" &&
      teachingDispatchProbe.output?.decision === "DISPATCHED" &&
      teachingDispatchProbe.output?.workerAgent === "TeachingAgent" &&
      teachingDispatchProbe.output?.skillId === "search_teaching_material" &&
      teachingDispatchProbe.output?.skillOutput?.decision === "FOUND" &&
      teachingDispatchProbe.output?.safety?.writeOperationAllowed === false &&
      teachingDispatchProbe.output?.safety?.directDatabaseAccessAllowed === false &&
      teachingDispatchProbe.output?.safety?.externalModelCallAllowed === false &&
      teachingDispatchProbe.readPortRequest?.operation === "searchTeachingMaterials" &&
      teachingDispatchProbe.readPortRequest?.safety?.writeOperationAllowed === false &&
      teachingDispatchProbe.runtimeSlo?.p99Ms <= 50 &&
      teachingDispatchProbe.runtimeSlo?.totalErrors === 0,
    actual: teachingDispatchProbe.status === "PASS"
      ? `decision=${teachingDispatchProbe.output.decision};skill=${teachingDispatchProbe.output.workerAgent}.${teachingDispatchProbe.output.skillId};p99=${teachingDispatchProbe.runtimeSlo.p99Ms};errors=${teachingDispatchProbe.runtimeSlo.totalErrors}`
      : teachingDispatchProbe.error,
    expected: "dispatcher invokes the real TeachingAgent runtime adapter through the injected read port with p99<=50 and zero errors",
    remediation: "Wire the dispatcher to a real adapter implementation before claiming more than contract-level dispatcher evidence.",
  });

  addFinding(findings, {
    id: "runtime.implementation_invokes_student_tutor_adapter",
    passed: studentTutorDispatchProbe.status === "PASS" &&
      studentTutorDispatchProbe.output?.decision === "DISPATCHED" &&
      studentTutorDispatchProbe.output?.workerAgent === "StudentTutorAgent" &&
      studentTutorDispatchProbe.output?.skillId === "recommend_practice" &&
      studentTutorDispatchProbe.output?.skillOutput?.decision === "FOUND" &&
      studentTutorDispatchProbe.output?.skillOutput?.safety?.crossStudentDataReturned === false &&
      studentTutorDispatchProbe.output?.skillOutput?.safety?.rawStudentArchiveReturned === false &&
      studentTutorDispatchProbe.output?.skillOutput?.safety?.finalEvaluationReturned === false &&
      studentTutorDispatchProbe.output?.safety?.writeOperationAllowed === false &&
      studentTutorDispatchProbe.output?.safety?.directDatabaseAccessAllowed === false &&
      studentTutorDispatchProbe.output?.safety?.externalModelCallAllowed === false &&
      studentTutorDispatchProbe.readPortRequest?.operation === "recommendPracticeContext" &&
      studentTutorDispatchProbe.readPortRequest?.safety?.writeOperationAllowed === false &&
      studentTutorDispatchProbe.readPortRequest?.safety?.crossStudentComparisonAllowed === false &&
      studentTutorDispatchProbe.readPortRequest?.safety?.rawStudentArchiveAllowed === false &&
      studentTutorDispatchProbe.runtimeSlo?.p99Ms <= 50 &&
      studentTutorDispatchProbe.runtimeSlo?.totalErrors === 0,
    actual: studentTutorDispatchProbe.status === "PASS"
      ? `decision=${studentTutorDispatchProbe.output.decision};skill=${studentTutorDispatchProbe.output.workerAgent}.${studentTutorDispatchProbe.output.skillId};p99=${studentTutorDispatchProbe.runtimeSlo.p99Ms};errors=${studentTutorDispatchProbe.runtimeSlo.totalErrors}`
      : studentTutorDispatchProbe.error,
    expected: "dispatcher invokes the real StudentTutorAgent runtime adapter through the injected read port with p99<=50 and zero errors",
    remediation: "Wire StudentTutorAgent.recommend_practice through the real read-only runtime adapter before using it as student workflow evidence.",
  });

  addFinding(findings, {
    id: "runtime.implementation_invokes_research_adapter",
    passed: researchDispatchProbe.status === "PASS" &&
      researchDispatchProbe.output?.decision === "DISPATCHED" &&
      researchDispatchProbe.output?.workerAgent === "ResearchAgent" &&
      researchDispatchProbe.output?.skillId === "search_knowledge" &&
      researchDispatchProbe.output?.skillOutput?.decision === "FOUND" &&
      researchDispatchProbe.output?.skillOutput?.safety?.studentArchiveReturned === false &&
      researchDispatchProbe.output?.skillOutput?.safety?.studentDataReturned === false &&
      researchDispatchProbe.output?.skillOutput?.safety?.returnedWithinPolicy === true &&
      researchDispatchProbe.output?.skillOutput?.safety?.externalModelUsed === false &&
      researchDispatchProbe.output?.safety?.writeOperationAllowed === false &&
      researchDispatchProbe.output?.safety?.directDatabaseAccessAllowed === false &&
      researchDispatchProbe.output?.safety?.externalModelCallAllowed === false &&
      researchDispatchProbe.readPortRequest?.operation === "searchKnowledge" &&
      researchDispatchProbe.readPortRequest?.safety?.writeOperationAllowed === false &&
      researchDispatchProbe.readPortRequest?.safety?.studentArchiveAllowed === false &&
      researchDispatchProbe.readPortRequest?.safety?.synthesisAllowed === false &&
      researchDispatchProbe.runtimeSlo?.p99Ms <= 50 &&
      researchDispatchProbe.runtimeSlo?.totalErrors === 0,
    actual: researchDispatchProbe.status === "PASS"
      ? `decision=${researchDispatchProbe.output.decision};skill=${researchDispatchProbe.output.workerAgent}.${researchDispatchProbe.output.skillId};p99=${researchDispatchProbe.runtimeSlo.p99Ms};errors=${researchDispatchProbe.runtimeSlo.totalErrors}`
      : researchDispatchProbe.error,
    expected: "dispatcher invokes the real ResearchAgent runtime adapter through the injected read port with p99<=50 and zero errors",
    remediation: "Wire ResearchAgent.search_knowledge through the real read-only runtime adapter before using it as research workflow evidence.",
  });

  addFinding(findings, {
    id: "runtime.implementation_boundary_scanned",
    passed: includesAll(inputs.runtime, [
      "implementedRuntimeAdapters",
      "TeachingAgent.search_teaching_material",
      "StudentTutorAgent.recommend_practice",
      "invokeStudentTutorRecommendPractice",
      "ResearchAgent.search_knowledge",
      "invokeResearchAgentSearchKnowledge",
      "dispatchAgentReadonlyRuntime",
      "writeOperationAllowed: false",
      "directDatabaseAccessAllowed: false",
      "externalModelCallAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
    ]) && includesAll(inputs.runtimeTest, [
      "dispatches TeachingAgent search_teaching_material to the real runtime adapter",
      "dispatches StudentTutorAgent recommend_practice to the real runtime adapter",
      "dispatches ResearchAgent search_knowledge to the real runtime adapter",
      "rejects write intent before the read port is called",
      "rejects Swarm routes and multi-worker route decisions",
      "rejects unknown workers and skills outside the dispatcher allowlist",
      "rejects research synthesis requests before the read port is called",
      "rejects external model or local tool mutation requests",
    ]),
    actual: "dispatcher runtime and tests scanned",
    expected: "TeachingAgent, StudentTutorAgent, and ResearchAgent real runtimes wired; unsafe paths are tested",
    remediation: "Keep the runtime implementation and negative tests registered so the dispatcher cannot drift back into a prose-only contract.",
  });

  addFinding(findings, {
    id: "promotion.no_full_agent_claims",
    passed: dispatcher.promotion?.currentEvidenceClass === "AGGREGATED_RUNTIME_SLO_FROM_READONLY_FAST_PATHS" &&
      dispatcher.promotion?.rootWorkflowRequired === true &&
      dispatcher.promotion?.fullAgentLoopClaimAllowed === false &&
      dispatcher.promotion?.fullSwarmClaimAllowed === false &&
      dispatcher.promotion?.modelReasoningClaimAllowed === false,
    actual: summarizePromotion(dispatcher.promotion),
    expected: "aggregated read-only evidence only; no full Agent Loop, Swarm, or model reasoning claims",
    remediation: "Keep this report honest: it is a dispatcher for read-only fast paths, not a completed Agent product.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "AGENT_READONLY_RUNTIME_DISPATCHER",
    dispatcher: {
      dispatcherId: dispatcher.dispatcherId ?? null,
      routeMode: dispatcher.routeMode ?? null,
      adapterCount: Array.isArray(dispatcher.adapters) ? dispatcher.adapters.length : 0,
      evidenceClass: dispatcher.promotion?.currentEvidenceClass ?? null,
    },
    runtimeSlo: {
      targetP99Ms: dispatcher.aggregateSlo?.p99BudgetMs ?? null,
      aggregateStrategy: dispatcher.aggregateSlo?.aggregateStrategy ?? null,
      p99Ms: Number.isFinite(effectiveP99Ms) ? effectiveP99Ms : null,
      totalErrors: effectiveTotalErrors,
      components: componentRuntime,
    },
    runtimeInvocation: dispatchProbeSummary,
    runtimeInvocations: dispatchProbes,
    safetyInvariants: {
      singleWorkerOnly: dispatcher.routeMode === "SINGLE_WORKER_ONLY",
      directDatabaseAccessAllowed: false,
      writeOperationAllowed: false,
      externalModelCallAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      fullAgentLoopClaimAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the shared read-only Agent Runtime Dispatcher evidence with real TeachingAgent, StudentTutorAgent, and ResearchAgent adapter calls; next slice can expose the higher Agent API without repeating broad production10k tests."
      : "Fix dispatcher contracts or component runtime SLO reports before claiming a shared Agent runtime entry.",
  };
}

export function formatAgentReadonlyRuntimeDispatcherAudit(report) {
  const lines = [
    `Agent read-only runtime dispatcher: ${report.readiness}`,
    `Dispatcher: ${report.dispatcher.dispatcherId ?? "missing"}`,
    `Route mode: ${report.dispatcher.routeMode ?? "missing"}`,
    `Components: ${report.runtimeSlo.components.map((component) => `${component.workerAgent}=${component.p99Ms}ms`).join(",")}`,
    `Aggregate P99: ${report.runtimeSlo.p99Ms ?? "missing"}ms`,
    `Runtime probe: ${report.runtimeInvocation?.status ?? "missing"}`,
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

function adaptersMatch(adapters = []) {
  if (!Array.isArray(adapters) || adapters.length !== requiredAdapters.length) return false;
  return requiredAdapters.every((required) => {
    const adapter = adapters.find((candidate) =>
      candidate.workerAgent === required.workerAgent && candidate.skillId === required.skillId
    );
    return adapter?.adapterRef === required.adapterRef &&
      adapter?.runtimeSloReportRef === required.runtimeSloReportRef &&
      adapter?.inputSchemaRef === required.inputSchemaRef &&
      adapter?.outputSchemaRef === required.outputSchemaRef &&
      adapter?.readPort?.portName === required.readPort.portName &&
      adapter?.readPort?.operation === required.readPort.operation &&
      adapter?.readPort?.directDatabaseAccessAllowed === false &&
      adapter?.readPort?.writeOperationAllowed === false &&
      adapter?.targetP99Ms <= 50;
  });
}

function summarizeComponentRuntime(adapters = [], runtimeReports = {}) {
  if (!Array.isArray(adapters)) return [];
  return adapters.map((adapter) => {
    const report = runtimeReports[adapter.workerAgent] ?? {};
    const p99Ms = numberOrNull(report.runtimeSlo?.p99Ms);
    const totalErrors = numberOrNull(report.runtimeSlo?.totalErrors);
    return {
      workerAgent: adapter.workerAgent,
      skillId: adapter.skillId,
      reportRef: adapter.runtimeSloReportRef,
      ready: report.readiness === "READY" &&
        Number.isFinite(p99Ms) &&
        p99Ms <= (adapter.targetP99Ms ?? 50) &&
        totalErrors === 0,
      p99Ms,
      totalErrors,
      targetP99Ms: adapter.targetP99Ms ?? null,
    };
  });
}

function summarizeAdapters(adapters = []) {
  if (!Array.isArray(adapters) || adapters.length === 0) return "missing";
  return adapters.map((adapter) =>
    `${adapter.workerAgent}.${adapter.skillId}:${adapter.readPort?.portName}.${adapter.readPort?.operation}:p99=${adapter.targetP99Ms}`,
  ).join(";");
}

function summarizeBoundary(boundary = {}) {
  return [
    `write=${boundary.writeIntentAllowed}`,
    `directDb=${boundary.directDatabaseAccessAllowed}`,
    `model=${boundary.externalModelCallAllowed}`,
    `localTool=${boundary.localToolMutationAllowed}`,
    `swarm=${boundary.swarmAllowed}`,
    `deepResearch=${boundary.deepResearchAllowed}`,
    `finalEval=${boundary.finalEvaluationAllowed}`,
    `rejection=${boundary.rejectionMode}`,
  ].join(";");
}

function summarizePromotion(promotion = {}) {
  return [
    `class=${promotion.currentEvidenceClass}`,
    `root=${promotion.rootWorkflowRequired}`,
    `loop=${promotion.fullAgentLoopClaimAllowed}`,
    `swarm=${promotion.fullSwarmClaimAllowed}`,
    `model=${promotion.modelReasoningClaimAllowed}`,
  ].join(";");
}

function summarizeBooleanMap(value = {}) {
  return Object.entries(value).map(([key, item]) => `${key}=${item}`).join(";");
}

function allTrue(value = {}, keys = []) {
  return keys.every((key) => value[key] === true);
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return value.join(",");
  return String(value);
}

function includesAll(text = "", needles = []) {
  return needles.every((needle) => String(text).includes(needle));
}

function loadInputs(root) {
  return Object.fromEntries(Object.entries(contractFiles).map(([key, relativePath]) => [
    key,
    loadInputFile(root, relativePath),
  ]));
}

function loadInputFile(root, relativePath) {
  const text = fs.readFileSync(path.join(root, relativePath), "utf8");
  return relativePath.endsWith(".json") ? JSON.parse(text) : text;
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  return {
    outPath: outIndex === -1 ? defaultOutPath : argv[outIndex + 1],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = await auditAgentReadonlyRuntimeDispatcher(loadInputs(process.cwd()));
    fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
    fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(formatAgentReadonlyRuntimeDispatcherAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
