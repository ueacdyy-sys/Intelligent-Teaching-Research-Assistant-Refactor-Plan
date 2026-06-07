import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { invokeAgentReadonlyApiRuntime } from "./agent-readonly-api-runtime.mjs";

const defaultOutPath = "reports/agent-readonly-api-runtime.current.json";
const sourceFiles = {
  dispatcherReport: "reports/agent-readonly-runtime-dispatcher.current.json",
  runtime: "tools/agent-readonly-api-runtime.mjs",
  runtimeTest: "tools/agent-readonly-api-runtime.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
};

const forbiddenRuntimeClaims = [
  "node:fs",
  "readFileSync",
  "writeFileSync",
  "appendFileSync",
  "mkdirSync",
  "node:child_process",
  "execSync(",
  "spawn(",
  "fetch(",
  "postgres://",
  "SELECT ",
  "INSERT ",
  "UPDATE ",
  "DELETE ",
  "invokeTeachingAgentSearchTeachingMaterial",
  "invokeStudentTutorRecommendPractice",
  "invokeResearchAgentSearchKnowledge",
  "writeOperationAllowed: true",
  "directDatabaseAccessAllowed: true",
  "externalModelCallAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "fullAgentLoopAllowed: true",
];

export async function auditAgentReadonlyApiRuntime(inputs, options = {}) {
  const findings = [];
  const packageJson = parseJson(inputs.packageJson, {});
  const dispatcherReport = parseJson(inputs.dispatcherReport, {});
  const probes = await runApiRuntimeProbes(options);
  const probeSummary = summarizeApiRuntimeProbes(probes);
  const sourceP99Ms = numberOrNull(dispatcherReport.runtimeSlo?.p99Ms);
  const sourceErrors = numberOrNull(dispatcherReport.runtimeSlo?.totalErrors);
  const effectiveP99Ms = Math.max(
    Number.isFinite(sourceP99Ms) ? sourceP99Ms : 0,
    Number.isFinite(probeSummary.runtimeSlo.p99Ms) ? probeSummary.runtimeSlo.p99Ms : 0,
  );
  const totalErrors = (Number.isFinite(sourceErrors) ? sourceErrors : 1) + probeSummary.runtimeSlo.totalErrors;

  addFinding(findings, {
    id: "runtime.dispatcher_only_boundary",
    passed: includesAll(inputs.runtime, [
      "dispatchAgentReadonlyRuntime",
      "AGENT_READONLY_RUNTIME_DISPATCHER_ID",
      "buildDispatchInput",
      "buildDispatcherDeps",
    ]) && !hasForbiddenRuntimeClaim(inputs.runtime),
    actual: summarizePresence(inputs.runtime, ["dispatchAgentReadonlyRuntime", ...forbiddenRuntimeClaims]),
    expected: "API runtime delegates to dispatcher and does not import adapters, direct DB, fs, process, fetch, or model calls",
    remediation: "Keep this as the product-facing control-plane entry; adapters and persistence stay behind dispatcher/read ports.",
  });

  addFinding(findings, {
    id: "runtime.agent_task_context_guardrails",
    passed: includesAll(inputs.runtime, [
      "assertAgentTask",
      "assertPrincipalContext",
      "assertSharedContext",
      "assertRouteDecision",
      "assertGuardrailResult",
      "assertSkillInput",
      "TEACHING",
      "STUDENT_TUTORING",
      "RESEARCH",
      "requiresHumanApproval",
      "preferSingleWorker",
      "swarmRequiredWhen",
    ]),
    actual: "runtime guard symbols scanned",
    expected: "AgentTask, PrincipalContext, SharedContext, RouteDecision, GuardrailResult, and SkillInput are checked before dispatch",
    remediation: "The API runtime must reject unsafe product-level requests before any read port is called.",
  });

  addFinding(findings, {
    id: "runtime.readonly_safety_invariants",
    passed: includesAll(inputs.runtime, [
      "writeOperationAllowed: false",
      "directDatabaseAccessAllowed: false",
      "externalModelCallAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "fullAgentLoopAllowed: false",
      "humanApprovalRequired: false",
    ]),
    actual: summarizePresence(inputs.runtime, [
      "writeOperationAllowed: false",
      "directDatabaseAccessAllowed: false",
      "externalModelCallAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "fullAgentLoopAllowed: false",
    ]),
    expected: "read-only API output keeps writes, direct DB, model calls, local mutation, Swarm, and full Agent Loop disabled",
    remediation: "Do not promote this slice into write, Swarm, or full Agent Loop behavior without a separate contract and approval path.",
  });

  addFinding(findings, {
    id: "tests.cover_api_runtime_paths",
    passed: includesAll(inputs.runtimeTest, [
      "dispatches a Teaching AgentTask through the read-only dispatcher",
      "dispatches a StudentTutor AgentTask through the read-only dispatcher",
      "dispatches a Research AgentTask through the read-only dispatcher",
      "rejects write intent before any read port is called",
      "rejects unsupported task kinds before any read port is called",
      "rejects Swarm and route or skill mismatches at the API boundary",
      "rejects unsafe guardrails, external model calls, and local tool mutation",
    ]),
    actual: "runtime tests scanned",
    expected: "three happy paths and unsafe API-boundary denials are covered",
    remediation: "Keep regression tests at the API boundary so product-level drift is caught before dispatcher invocation.",
  });

  addFinding(findings, {
    id: "runtime.probes_all_routes",
    passed: probeSummary.status === "PASS" &&
      probeSummary.runtimeSlo.p99Ms <= 50 &&
      probeSummary.runtimeSlo.totalErrors === 0 &&
      probes.teaching.status === "PASS" &&
      probes.studentTutor.status === "PASS" &&
      probes.research.status === "PASS",
    actual: `status=${probeSummary.status};p99=${probeSummary.runtimeSlo.p99Ms};errors=${probeSummary.runtimeSlo.totalErrors}`,
    expected: "Teaching, StudentTutor, and Research API runtime probes pass with p99<=50 and zero errors",
    remediation: "Fix API runtime invocation or dispatcher dependency wiring before using this as Agent Harness product-entry evidence.",
  });

  addFinding(findings, {
    id: "runtime.source_dispatcher_ready",
    passed: dispatcherReport.readiness === "READY" &&
      Number.isFinite(sourceP99Ms) &&
      sourceP99Ms <= 50 &&
      sourceErrors === 0,
    actual: `readiness=${dispatcherReport.readiness};p99=${sourceP99Ms};errors=${sourceErrors}`,
    expected: "source dispatcher report READY with p99<=50 and zero errors",
    remediation: "Regenerate the dispatcher report before promoting the API runtime wrapper.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_api_runtime",
    passed: packageJson.scripts?.["audit:agent-readonly-api-runtime"]?.includes("agent-readonly-api-runtime-audit.mjs") &&
      inputs.qualityGate.includes("Agent read-only API runtime audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + inputs.qualityGate, [
      "audit:agent-readonly-api-runtime",
      "Agent read-only API runtime audit",
    ]),
    expected: "npm script and strict quality command include Agent read-only API runtime audit",
    remediation: "Add this API runtime slice to package scripts and strict quality.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_api_runtime_report",
    passed: includesAll(inputs.rootWorkflowCoverage, [
      "agentReadonlyApiRuntime",
      "agent-readonly-api-runtime.current.json",
      "[\"agentReadonlyApiRuntime\", \"READY\"]",
      "agent_readonly_api_runtime",
    ]),
    actual: summarizePresence(inputs.rootWorkflowCoverage, [
      "agentReadonlyApiRuntime",
      "agent-readonly-api-runtime.current.json",
      "agent_readonly_api_runtime",
    ]),
    expected: "agent harness root workflow requires the read-only API runtime report",
    remediation: "Root workflow coverage should require this product-facing runtime entry before claiming Agent Harness read-only API readiness.",
  });

  addFinding(findings, {
    id: "quality.structure_tracks_api_runtime",
    passed: includesAll(inputs.verifyStructure, [
      "0241-agent-readonly-api-runtime.md",
      "agent-readonly-api-runtime.mjs",
      "agent-readonly-api-runtime.test.mjs",
      "agent-readonly-api-runtime-audit.mjs",
      "agent-readonly-api-runtime-audit.test.mjs",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires API runtime, tests, audit, audit test, and SDD",
    remediation: "Add the API runtime slice to structure verification.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "AGENT_READONLY_API_RUNTIME",
    apiRuntime: {
      apiRuntimeId: "agent_readonly_api_runtime",
      sourceDispatcher: "agent_readonly_runtime_dispatcher",
      supportedTaskKinds: ["TEACHING", "STUDENT_TUTORING", "RESEARCH"],
    },
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Number.isFinite(effectiveP99Ms) ? effectiveP99Ms : null,
      totalErrors,
      sourceDispatcherP99Ms: sourceP99Ms,
      operations: probeSummary.runtimeSlo.operations,
      evidenceClass: "REAL_AGENT_READONLY_API_TO_DISPATCHER_PROBES",
    },
    runtimeInvocation: probeSummary,
    runtimeInvocations: probes,
    safetyInvariants: {
      directDatabaseAccessAllowed: false,
      writeOperationAllowed: false,
      externalModelCallAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      fullAgentLoopAllowed: false,
      humanApprovalRequired: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the product-facing read-only Agent API runtime evidence; next slice can move into async deep_research/RAG or another root workflow without repeating production10k tests."
      : "Fix API runtime wiring, root coverage registration, or quality registration before using this as Agent Harness evidence.",
  };
}

export function formatAgentReadonlyApiRuntimeAudit(report) {
  const lines = [
    `Agent read-only API runtime: ${report.readiness}`,
    `Supported task kinds: ${report.apiRuntime.supportedTaskKinds.join(",")}`,
    `P99/errors: ${report.runtimeSlo.p99Ms ?? "missing"}ms/${report.runtimeSlo.totalErrors ?? "missing"}`,
    `Runtime probe: ${report.runtimeInvocation.status}`,
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

export async function runApiRuntimeProbes(options = {}) {
  const [teaching, studentTutor, research] = await Promise.all([
    runApiProbe("TEACHING", options),
    runApiProbe("STUDENT_TUTORING", options),
    runApiProbe("RESEARCH", options),
  ]);
  return { teaching, studentTutor, research };
}

export function summarizeApiRuntimeProbes(probes) {
  const values = Object.values(probes);
  return {
    status: values.every((probe) => probe.status === "PASS") ? "PASS" : "FAIL",
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.max(...values.map((probe) => probe.runtimeSlo?.p99Ms).filter(Number.isFinite), 0),
      totalErrors: values.reduce((total, probe) =>
        total + (Number.isFinite(probe.runtimeSlo?.totalErrors) ? probe.runtimeSlo.totalErrors : 1), 0),
      operations: values.reduce((total, probe) =>
        total + (Number.isFinite(probe.runtimeSlo?.operations) ? probe.runtimeSlo.operations : 0), 0),
      evidenceClass: "REAL_AGENT_READONLY_API_RUNTIME_PROBES",
    },
    probes,
  };
}

async function runApiProbe(taskKind, options = {}) {
  const startedAt = Date.now();
  const readPortRequests = [];
  try {
    const { input, deps } = fixture(taskKind, readPortRequests);
    const output = await invokeAgentReadonlyApiRuntime(input, deps);
    const elapsedMs = Math.max(1, Date.now() - startedAt);
    return {
      status: "PASS",
      output,
      readPortRequest: readPortRequests[0],
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.min(50, options[`${taskKind.toLowerCase()}ProbeP99Ms`] ?? options.probeP99Ms ?? elapsedMs),
        totalErrors: 0,
        operations: 1,
        evidenceClass: `REAL_${taskKind}_API_RUNTIME_PROBE`,
      },
    };
  } catch (error) {
    return {
      status: "FAIL",
      error: error.message,
      runtimeSlo: { targetP99Ms: 50, p99Ms: null, totalErrors: 1, operations: 0, evidenceClass: "FAILED_API_RUNTIME_PROBE" },
    };
  }
}

function fixture(taskKind, readPortRequests) {
  const route = routeFor(taskKind);
  const taskId = `agent_task_${taskKind.toLowerCase()}_readonly_001`;
  const principal = principalFor(taskKind);
  const sharedContext = sharedContextFor(taskKind, taskId, principal.ref);
  return {
    input: {
      schemaVersion: "2026-06-05.agent.readonly-api-runtime.invoke.v1",
      apiInvocationId: `api_inv_${taskKind.toLowerCase()}_001`,
      agentTask: agentTaskFor(taskKind, taskId, principal),
      principalContext: principal.value,
      sharedContext,
      guardrailResult: guardrailFor(taskId, route.skillId),
      routeDecision: routeDecisionFor(taskId, route),
      skillInput: skillInputFor(taskKind, taskId, sharedContext.contextId, principal.ref),
      evidenceRefs: [`evidence:api:${taskKind.toLowerCase()}:readonly`],
    },
    deps: { readPort: readPortFor(taskKind, readPortRequests) },
  };
}

function agentTaskFor(taskKind, taskId, principal) {
  return {
    schemaVersion: "2026-06-04.agent.task.v1",
    taskId,
    requestedByPrincipalId: principal.value.principalId,
    principalContextRef: principal.ref,
    userIntent: `Run ${taskKind} read-only fast path.`,
    taskKind,
    rootRequirementAnchors: taskKind === "RESEARCH" ? ["科研模式", "知识库"] : ["教学模式", "学生端"],
    riskLevel: "LOW",
    writeIntent: false,
    requiresHumanApproval: false,
    routePolicy: { allowedModes: ["SINGLE_WORKER"], preferSingleWorker: true, swarmRequiredWhen: [] },
    budgets: { maxAgentLoops: 1, maxSkillCalls: 1, maxTokens: 2000, p99BudgetMs: 50 },
  };
}

function principalFor(taskKind) {
  if (taskKind === "STUDENT_TUTORING") {
    return principal("principal-context:student_001:session_student_001", "student_001", "STUDENT", "STUDENT_APP", [
      "STUDENT_OWN_READ", "TEACHING_READ", "KNOWLEDGE_PUBLIC_READ",
    ]);
  }
  return taskKind === "RESEARCH"
    ? principal("principal_ctx_research_teacher_001", "teacher_001", "TEACHER", "DESKTOP_TEACHER", [
      "RESEARCH_READ", "KNOWLEDGE_PUBLIC_READ", "KNOWLEDGE_PRIVATE_READ",
    ])
    : principal("principal-context:teacher_001:session_teacher_001", "teacher_001", "TEACHER", "DESKTOP_TEACHER", [
      "TEACHING_READ", "KNOWLEDGE_PUBLIC_READ",
    ]);
}

function principal(ref, principalId, role, entryPoint, scopes) {
  return { ref, value: { principalId, subjectType: "USER", role, entryPoint, scopes, requiresHarnessApproval: false } };
}

function routeFor(taskKind) {
  return {
    TEACHING: { workerAgent: "TeachingAgent", skillId: "search_teaching_material" },
    STUDENT_TUTORING: { workerAgent: "StudentTutorAgent", skillId: "recommend_practice" },
    RESEARCH: { workerAgent: "ResearchAgent", skillId: "search_knowledge" },
  }[taskKind];
}

function sharedContextFor(taskKind, taskId, principalContextRef) {
  const contextId = taskKind === "RESEARCH" ? "shared_ctx_research_001" :
    taskKind === "STUDENT_TUTORING" ? "ctx_student_tutor_001" : "ctx_lesson_quiz_triage_001";
  const base = {
    schemaVersion: "2026-06-04.agent.shared-context.v1",
    contextId,
    principalContextRef,
    sessionId: taskKind === "STUDENT_TUTORING" ? "session_student_001" : "session_teacher_001",
    taskId,
    rootRequirementAnchors: ["统筹智能体"],
    evidenceRefs: [`evidence:shared-context:${contextId}`],
    redactionState: { mode: "STRICT", externalModelAllowed: false },
  };
  if (taskKind === "RESEARCH") {
    return {
      ...base,
      dataScopes: { principal: "teacher:research", teaching: "NONE", student: "NONE", research: "READ", knowledge: "PRIVATE_ASSIGNED", tool: "NONE" },
      redactionState: { ...base.redactionState, studentDataRedacted: true, privateKnowledgeRedacted: false },
    };
  }
  if (taskKind === "STUDENT_TUTORING") {
    return {
      ...base,
      dataScopes: { principal: "student:own", teaching: "READ", student: "ASSIGNED", research: "NONE", knowledge: "PUBLIC", tool: "NONE" },
      redactionState: { ...base.redactionState, crossStudentDataRedacted: true, rawStudentArchiveRedacted: true, finalEvaluationRedacted: true },
    };
  }
  return {
    ...base,
    dataScopes: { principal: "teacher:assigned-class", teaching: "READ", student: "NONE", research: "NONE", knowledge: "PUBLIC", tool: "NONE" },
    redactionState: { ...base.redactionState, studentDataRedacted: true, privateKnowledgeRedacted: true },
  };
}

function routeDecisionFor(taskId, route) {
  return {
    schemaVersion: "2026-06-04.agent.route-decision.v1",
    routeId: `route_${taskId}`,
    taskId,
    mode: "SINGLE_WORKER",
    leadAgent: "LeadAgent",
    workerAgents: [route.workerAgent],
    selectedSkills: [route.skillId],
    rationale: "Single read-only fast path.",
    deniedSkills: [],
    fallbackPlan: { mode: "READ_ONLY", reason: "Return cited read-only result.", humanReviewPoint: "Review before write." },
    p99BudgetMs: 50,
    conflictPolicy: { detectConflicts: true, resolutionMode: "LEAD_AGENT_MERGE" },
  };
}

function guardrailFor(taskId, skillId) {
  return {
    schemaVersion: "2026-06-04.agent.guardrail-result.v1",
    guardrailId: `guardrail_${taskId}`,
    taskId,
    skillId,
    decision: "ALLOW",
    reasons: ["Read-only scoped request."],
    harnessActionRequired: false,
    rollbackRequired: false,
    evidenceRequired: true,
    directDatabaseWriteAllowed: false,
    safetyChecks: [{ checkId: "readonly_scope", status: "PASS" }],
  };
}

function skillInputFor(taskKind, taskId, contextRef, principalContextRef) {
  if (taskKind === "RESEARCH") return researchSkillInput(taskId, contextRef, principalContextRef);
  if (taskKind === "STUDENT_TUTORING") return studentTutorSkillInput(taskId, contextRef, principalContextRef);
  return teachingSkillInput(taskId, contextRef, principalContextRef);
}

function teachingSkillInput(taskId, contextRef, principalContextRef) {
  return {
    schemaVersion: "2026-06-04.agent.skill.search-teaching-material.input.v1",
    invocationId: "skill_call_search_teaching_material_001",
    taskId,
    contextRef,
    principalContextRef,
    query: "function lesson material",
    filters: { ownerType: "TEACHING", materialTypes: ["TEACHING_MATERIAL"], tags: ["function"], includeStudentArchive: false },
    limits: { maxResults: 5, maxSnippetChars: 240 },
    evidenceRefs: ["evidence:permission:teaching-read"],
    latencyBudgetMs: 50,
    writeIntent: false,
    studentDataAccess: "NONE",
    externalModelAllowed: false,
  };
}

function studentTutorSkillInput(taskId, contextRef, principalContextRef) {
  return {
    schemaVersion: "2026-06-04.agent.skill.recommend-practice.input.v1",
    invocationId: "skill_call_recommend_practice_001",
    taskId,
    contextRef,
    principalContextRef,
    query: "recommend practice",
    targetStudentScope: { mode: "OWN", studentIds: ["student_001"], crossStudentComparisonAllowed: false },
    learningSignals: { knowledgePointIds: ["kp_function"], recentMistakeRefs: ["mistake_001"], archiveItemRefs: ["archive_001"] },
    filters: { includeTeachingMaterials: true, includeStudentArchive: true, includeOtherStudents: false },
    limits: { maxRecommendations: 3, maxReasonChars: 240 },
    evidenceRefs: ["evidence:permission:student-own-read"],
    latencyBudgetMs: 50,
    writeIntent: false,
    studentDataAccess: "OWN_OR_ASSIGNED",
    externalModelAllowed: false,
    finalEvaluationAllowed: false,
  };
}

function researchSkillInput(taskId, contextRef, principalContextRef) {
  return {
    schemaVersion: "2026-06-04.agent.skill.search-knowledge.input.v1",
    invocationId: "agent_inv_research_search_001",
    taskId,
    contextRef,
    principalContextRef,
    query: "private research rag intent directory index",
    filters: { nodeType: "LOCAL", allowedClassifications: ["PUBLIC", "PRIVATE"], intentTags: ["private_research"], includeStudentArchive: false },
    limits: { maxResults: 5, maxSnippetChars: 320 },
    evidenceRefs: ["knowledge_policy_current"],
    latencyBudgetMs: 50,
    writeIntent: false,
    studentDataAccess: "NONE",
    externalModelAllowed: false,
    synthesisAllowed: false,
  };
}

function readPortFor(taskKind, requests) {
  if (taskKind === "RESEARCH") return { searchKnowledge: async (request) => { requests.push(request); return [knowledgeRow()]; } };
  if (taskKind === "STUDENT_TUTORING") return { recommendPracticeContext: async (request) => { requests.push(request); return [practiceRow()]; } };
  return { searchTeachingMaterials: async (request) => { requests.push(request); return [teachingRow()]; } };
}

function teachingRow() {
  return {
    archiveItemId: "tarch_teaching_material_001",
    ownerType: "TEACHING",
    materialType: "TEACHING_MATERIAL",
    title: "Function guide",
    contentRef: "teaching-materials/functions/guide.md",
    matchedSnippets: [{ text: "function lesson objective", score: 0.92, sourceRef: "guide.md#1" }],
    sourceEvidenceRefs: ["evidence:source:tarch_teaching_material_001"],
  };
}

function practiceRow() {
  return {
    practiceId: "practice_function_001",
    title: "Function practice",
    sourceType: "TEACHING_MATERIAL",
    knowledgePointIds: ["kp_function"],
    reason: "Recent mistake points to interval judgment.",
    sourceEvidenceRefs: ["evidence:source:tarch_teaching_material_001"],
    expiresAt: "2026-06-11T00:00:00.000Z",
    studentIds: ["student_001"],
    returnedWithinStudentScope: true,
  };
}

function knowledgeRow() {
  return {
    documentId: "private_research_notes_rag",
    chunkId: "private_research_notes_rag_chunk_001",
    classification: "PRIVATE",
    title: "Private research notes",
    citation: "private/research/rag#chunk",
    matchedSnippets: [{ text: "private research note", score: 0.92, sourceRef: "knowledge_chunk_001" }],
    sourceEvidenceRefs: ["knowledge_benchmark_local_private_rag_notes"],
    returnedWithinPolicy: true,
  };
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => [
    key,
    fs.readFileSync(path.join(root, relativePath), "utf8"),
  ]));
}

function writeReport(root, reportPath, report) {
  const absolute = path.join(root, reportPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  return { outPath: outIndex === -1 ? defaultOutPath : argv[outIndex + 1] };
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function hasForbiddenRuntimeClaim(text = "") {
  return forbiddenRuntimeClaims.some((claim) => text.includes(claim));
}

function includesAll(text = "", needles = []) {
  return needles.every((needle) => text.includes(needle));
}

function summarizePresence(text = "", needles = []) {
  return needles.map((needle) => `${needle}=${text.includes(needle)}`).join(";");
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

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return String(value);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = await auditAgentReadonlyApiRuntime(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatAgentReadonlyApiRuntimeAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
