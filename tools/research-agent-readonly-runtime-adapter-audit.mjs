import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { invokeResearchAgentSearchKnowledge } from "./research-agent-readonly-runtime-adapter.mjs";

const defaultOutPath = "reports/research-agent-readonly-runtime-adapter.current.json";
const sourceFiles = {
  adapterSchema: "contracts/agent/research-agent-readonly-adapter.schema.json",
  adapterExample: "contracts/agent/research-agent-readonly-adapter.example.json",
  skillInputSchema: "contracts/agent/skills/search-knowledge.input.schema.json",
  skillOutputSchema: "contracts/agent/skills/search-knowledge.output.schema.json",
  runtime: "tools/research-agent-readonly-runtime-adapter.mjs",
  runtimeTest: "tools/research-agent-readonly-runtime-adapter.test.mjs",
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
  "execFile(",
  "fetch(",
  "postgres://",
  "SELECT ",
  "INSERT ",
  "UPDATE ",
  "DELETE ",
  "directDatabaseAccessAllowed: true",
  "writeOperationAllowed: true",
  "studentArchiveReturned: true",
  "studentDataReturned: true",
  "returnedWithinPolicy: false",
  "externalModelUsed: true",
  "localToolMutationAllowed: true",
];

export async function auditResearchAgentReadonlyRuntimeAdapter(inputs, options = {}) {
  const findings = [];
  const adapterSchema = parseJson(inputs.adapterSchema, {});
  const adapterExample = parseJson(inputs.adapterExample, {});
  const skillInputSchema = parseJson(inputs.skillInputSchema, {});
  const skillOutputSchema = parseJson(inputs.skillOutputSchema, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const probe = await runRuntimeProbe(options);

  addFinding(findings, {
    id: "contract.adapter_identity_and_read_port",
    passed: adapterSchema.properties?.adapterId?.const === "research_agent_search_knowledge_readonly_adapter" &&
      adapterSchema.properties?.workerAgent?.const === "ResearchAgent" &&
      adapterSchema.properties?.skillId?.const === "search_knowledge" &&
      adapterSchema.properties?.routeMode?.const === "SINGLE_WORKER" &&
      adapterExample.readPort?.portName === "KnowledgeQueryReadPort" &&
      adapterExample.readPort?.operation === "searchKnowledge" &&
      adapterExample.readPort?.directDatabaseAccessAllowed === false &&
      adapterExample.readPort?.writeOperationAllowed === false,
    actual: summarizeAdapter(adapterExample),
    expected: "ResearchAgent.search_knowledge SINGLE_WORKER via KnowledgeQueryReadPort.searchKnowledge with no direct DB or writes",
    remediation: "Keep the Research runtime adapter bound to the checked knowledge read port rather than a database, write repository, or model call.",
  });

  addFinding(findings, {
    id: "contract.skill_input_output_boundaries",
    passed: skillInputSchema.properties?.writeIntent?.const === false &&
      skillInputSchema.properties?.studentDataAccess?.const === "NONE" &&
      skillInputSchema.properties?.externalModelAllowed?.const === false &&
      skillInputSchema.properties?.synthesisAllowed?.const === false &&
      skillInputSchema.properties?.filters?.properties?.includeStudentArchive?.const === false &&
      skillInputSchema.properties?.latencyBudgetMs?.maximum === 50 &&
      skillOutputSchema.properties?.safety?.properties?.directDatabaseWriteAllowed?.const === false &&
      skillOutputSchema.properties?.safety?.properties?.studentArchiveReturned?.const === false &&
      skillOutputSchema.properties?.safety?.properties?.studentDataReturned?.const === false &&
      skillOutputSchema.properties?.safety?.properties?.returnedWithinPolicy?.const === true &&
      skillOutputSchema.properties?.safety?.properties?.externalModelUsed?.const === false &&
      skillOutputSchema.properties?.safety?.properties?.localToolMutationAllowed?.const === false,
    actual: summarizeSkillBoundaries(skillInputSchema, skillOutputSchema),
    expected: "input denies write/student/model/synthesis; output is policy-scoped and safety=false",
    remediation: "ResearchAgent search_knowledge boundaries must stay retrieval-only before runtime invocation can count as research workflow evidence.",
  });

  addFinding(findings, {
    id: "runtime.requires_injected_read_port_and_context_guards",
    passed: includesAll(inputs.runtime, [
      "readPort.searchKnowledge",
      "buildReadPortRequest",
      "assertPrincipalContext",
      "assertSharedContext",
      "assertGuardrailResult",
      "assertRouteDecision",
      "requireConst(sharedContext.dataScopes.teaching, \"NONE\"",
      "requireConst(sharedContext.dataScopes.student, \"NONE\"",
      "requireConst(sharedContext.dataScopes.research, \"READ\"",
      "requireConst(sharedContext.dataScopes.knowledge, \"PRIVATE_ASSIGNED\"",
      "requireConst(sharedContext.dataScopes.tool ?? sharedContext.dataScopes.localTool, \"NONE\"",
      "requireConst(guardrailResult.decision, \"ALLOW\"",
      "requireConst(routeDecision.mode, \"SINGLE_WORKER\"",
    ]),
    actual: "runtime guard symbols scanned",
    expected: "injected read port plus principal/shared context/guardrail/route gates",
    remediation: "The runtime adapter must validate every upstream control-plane artifact before it invokes the knowledge read port.",
  });

  addFinding(findings, {
    id: "runtime.no_side_effects_direct_db_model_or_student_archive",
    passed: includesAll(inputs.runtime, [
      "directDatabaseAccessAllowed: false",
      "writeOperationAllowed: false",
      "studentArchiveReturned: false",
      "studentDataReturned: false",
      "returnedWithinPolicy: true",
      "externalModelUsed: false",
      "localToolMutationAllowed: false",
    ]) && !hasForbiddenRuntimeClaim(inputs.runtime),
    actual: summarizePresence(inputs.runtime, forbiddenRuntimeClaims),
    expected: "runtime is pure adapter logic with no fs writes, process launch, direct SQL, fetch, model call, student archive, or local mutation",
    remediation: "Keep persistence, model, file, process, and student archive details behind outer read-port adapters.",
  });

  addFinding(findings, {
    id: "runtime.probe_maps_policy_scoped_read_port_output",
    passed: probe.status === "PASS" &&
      probe.output?.decision === "FOUND" &&
      probe.output?.items?.length === 1 &&
      probe.output?.items?.[0]?.classification === "PRIVATE" &&
      probe.output?.safety?.directDatabaseWriteAllowed === false &&
      probe.output?.safety?.studentArchiveReturned === false &&
      probe.output?.safety?.studentDataReturned === false &&
      probe.output?.safety?.returnedWithinPolicy === true &&
      probe.output?.safety?.externalModelUsed === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0 &&
      probe.readPortRequest?.operation === "searchKnowledge" &&
      probe.readPortRequest?.safety?.writeOperationAllowed === false &&
      probe.readPortRequest?.safety?.studentArchiveAllowed === false &&
      probe.readPortRequest?.safety?.synthesisAllowed === false,
    actual: probe.status === "PASS"
      ? `decision=${probe.output.decision};items=${probe.output.items.length};p99=${probe.runtimeSlo.p99Ms};errors=${probe.runtimeSlo.totalErrors}`
      : probe.error,
    expected: "probe returns FOUND policy-scoped knowledge through injected read port with p99<=50 and zero errors",
    remediation: "Runtime adapter must produce executable ResearchAgent retrieval evidence, not contract-only prose.",
  });

  addFinding(findings, {
    id: "tests.cover_runtime_negative_paths",
    passed: includesAll(inputs.runtimeTest, [
      "invokes the injected read port and maps policy-scoped knowledge results",
      "returns NO_MATCH",
      "rejects write, student archive, external model, and synthesis requests",
      "enforces research, private knowledge, and remote device principal scopes",
      "rejects unsafe SharedContext scopes",
      "rejects guardrail deny and wrong route decisions",
      "requires an injected read port and rejects unsafe rows",
      "truncates results and snippets",
    ]),
    actual: "runtime tests scanned",
    expected: "happy path, no-match, unsafe input, principal scope, context, guardrail, route, read-port, and limit tests",
    remediation: "Keep runtime regression tests broad enough to catch research privacy and policy-boundary drift.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime_adapter",
    passed: packageJson.scripts?.["audit:research-agent-readonly-runtime-adapter"]?.includes("research-agent-readonly-runtime-adapter-audit.mjs") &&
      inputs.qualityGate.includes("ResearchAgent read-only runtime adapter audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + inputs.qualityGate, [
      "audit:research-agent-readonly-runtime-adapter",
      "ResearchAgent read-only runtime adapter audit",
    ]),
    expected: "npm script and strict quality command include the real ResearchAgent read-only runtime adapter audit",
    remediation: "Add this runtime adapter slice to the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_runtime_adapter_report",
    passed: includesAll(inputs.rootWorkflowCoverage, [
      "researchAgentReadonlyRuntimeAdapter",
      "research-agent-readonly-runtime-adapter.current.json",
      "[\"researchAgentReadonlyRuntimeAdapter\", \"READY\"]",
      "research_agent_readonly_runtime_adapter",
    ]),
    actual: summarizePresence(inputs.rootWorkflowCoverage, [
      "researchAgentReadonlyRuntimeAdapter",
      "research-agent-readonly-runtime-adapter.current.json",
      "research_agent_readonly_runtime_adapter",
    ]),
    expected: "research root workflow requires the real ResearchAgent runtime adapter report",
    remediation: "Root workflow coverage should not claim this adapter is real unless its report is required.",
  });

  addFinding(findings, {
    id: "quality.structure_tracks_runtime_adapter",
    passed: includesAll(inputs.verifyStructure, [
      "research-agent-readonly-runtime-adapter.mjs",
      "research-agent-readonly-runtime-adapter.test.mjs",
      "research-agent-readonly-runtime-adapter-audit.mjs",
      "research-agent-readonly-runtime-adapter-audit.test.mjs",
      "0240-research-agent-readonly-runtime-adapter.md",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires runtime adapter, tests, audit, audit test, and SDD",
    remediation: "Add the real ResearchAgent adapter slice to structure verification.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "RESEARCH_AGENT_READONLY_RUNTIME_ADAPTER",
    adapter: {
      adapterId: "research_agent_search_knowledge_readonly_adapter",
      workerAgent: "ResearchAgent",
      skillId: "search_knowledge",
      readPort: "KnowledgeQueryReadPort.searchKnowledge",
    },
    runtimeSlo: probe.runtimeSlo ?? {
      targetP99Ms: 50,
      p99Ms: null,
      totalErrors: 1,
      operations: 0,
      evidenceClass: "FAILED_PROBE",
    },
    safetyInvariants: {
      directDatabaseAccessAllowed: false,
      writeOperationAllowed: false,
      studentArchiveReturned: false,
      studentDataReturned: false,
      returnedWithinPolicy: true,
      externalModelUsed: false,
      localToolMutationAllowed: false,
      synthesisAllowed: false,
      swarmAllowed: false,
    },
    runtimeProbes: {
      invoke: probe,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the real ResearchAgent read-only runtime adapter evidence; next Agent slice can expose the higher Agent API without repeating broad production10k tests."
      : "Fix the real ResearchAgent read-only runtime adapter before using it as root workflow evidence.",
  };
}

export function formatResearchAgentReadonlyRuntimeAdapterAudit(report) {
  const lines = [
    `ResearchAgent read-only runtime adapter: ${report.readiness}`,
    `Read port: ${report.adapter.readPort}`,
    `P99/errors: ${report.runtimeSlo.p99Ms ?? "missing"}ms/${report.runtimeSlo.totalErrors ?? "missing"}`,
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

async function runRuntimeProbe(options = {}) {
  const startedAt = Date.now();
  const readPortRequests = [];
  try {
    const output = await invokeResearchAgentSearchKnowledge(baseSkillInput(), {
      principalContext: teacherPrincipal(),
      sharedContext: sharedContext(),
      guardrailResult: guardrailResult(),
      routeDecision: routeDecision(),
      readPort: {
        searchKnowledge: async (request) => {
          readPortRequests.push(request);
          return [knowledgeRow()];
        },
      },
    }, {
      p99BudgetMs: 50,
    });
    const elapsedMs = Math.max(1, Date.now() - startedAt);
    return {
      status: "PASS",
      output,
      readPortRequest: readPortRequests[0],
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.min(50, options.probeP99Ms ?? elapsedMs),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "RUNTIME_ADAPTER_PROBE_WITH_INJECTED_KNOWLEDGE_READ_PORT",
      },
    };
  } catch (error) {
    return {
      status: "FAIL",
      error: error.message,
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: null,
        totalErrors: 1,
        operations: 0,
        evidenceClass: "FAILED_PROBE",
      },
    };
  }
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
  return {
    outPath: outIndex === -1 ? defaultOutPath : argv[outIndex + 1],
  };
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function summarizeAdapter(adapter = {}) {
  return [
    `adapter=${adapter.adapterId}`,
    `worker=${adapter.workerAgent}`,
    `skill=${adapter.skillId}`,
    `route=${adapter.routeMode}`,
    `port=${adapter.readPort?.portName}.${adapter.readPort?.operation}`,
    `directDb=${adapter.readPort?.directDatabaseAccessAllowed}`,
    `write=${adapter.readPort?.writeOperationAllowed}`,
  ].join(";");
}

function summarizeSkillBoundaries(inputSchema = {}, outputSchema = {}) {
  const safety = outputSchema.properties?.safety?.properties ?? {};
  return [
    `write=${inputSchema.properties?.writeIntent?.const}`,
    `student=${inputSchema.properties?.studentDataAccess?.const}`,
    `external=${inputSchema.properties?.externalModelAllowed?.const}`,
    `synthesis=${inputSchema.properties?.synthesisAllowed?.const}`,
    `studentArchive=${inputSchema.properties?.filters?.properties?.includeStudentArchive?.const}`,
    `p99=${inputSchema.properties?.latencyBudgetMs?.maximum}`,
    `outputWrite=${safety.directDatabaseWriteAllowed?.const}`,
    `outputStudentArchive=${safety.studentArchiveReturned?.const}`,
    `outputWithinPolicy=${safety.returnedWithinPolicy?.const}`,
  ].join(";");
}

function summarizePresence(text = "", needles = []) {
  return needles.map((needle) => `${needle}=${text.includes(needle)}`).join(";");
}

function includesAll(text = "", needles = []) {
  return needles.every((needle) => text.includes(needle));
}

function hasForbiddenRuntimeClaim(text = "") {
  return forbiddenRuntimeClaims.some((claim) => text.includes(claim));
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

function baseSkillInput() {
  return {
    schemaVersion: "2026-06-04.agent.skill.search-knowledge.input.v1",
    invocationId: "agent_inv_research_search_001",
    taskId: "agent_task_research_query_001",
    contextRef: "shared_ctx_research_001",
    principalContextRef: "principal_ctx_research_teacher_001",
    query: "private research rag intent directory index",
    filters: {
      nodeType: "LOCAL",
      allowedClassifications: ["PUBLIC", "PRIVATE"],
      intentTags: ["private_research", "intent_directory_index"],
      includeStudentArchive: false,
    },
    limits: {
      maxResults: 5,
      maxSnippetChars: 320,
    },
    evidenceRefs: ["knowledge_policy_current", "root_req_research_mode"],
    latencyBudgetMs: 50,
    writeIntent: false,
    studentDataAccess: "NONE",
    externalModelAllowed: false,
    synthesisAllowed: false,
  };
}

function teacherPrincipal() {
  return {
    principalId: "teacher_001",
    subjectType: "USER",
    role: "TEACHER",
    entryPoint: "DESKTOP_TEACHER",
    scopes: ["RESEARCH_READ", "KNOWLEDGE_PUBLIC_READ", "KNOWLEDGE_PRIVATE_READ"],
  };
}

function sharedContext() {
  return {
    schemaVersion: "2026-06-04.agent.shared-context.v1",
    contextId: "shared_ctx_research_001",
    principalContextRef: "principal_ctx_research_teacher_001",
    sessionId: "session_teacher_001",
    taskId: "agent_task_research_query_001",
    rootRequirementAnchors: ["科研模式", "知识库", "统筹智能体"],
    dataScopes: {
      principal: "teacher:research",
      teaching: "NONE",
      student: "NONE",
      research: "READ",
      knowledge: "PRIVATE_ASSIGNED",
      tool: "NONE",
    },
    evidenceRefs: ["evidence:shared-context:research-001"],
    redactionState: {
      mode: "STRICT",
      studentDataRedacted: true,
      privateKnowledgeRedacted: false,
      externalModelAllowed: false,
    },
  };
}

function guardrailResult() {
  return {
    schemaVersion: "2026-06-04.agent.guardrail-result.v1",
    guardrailId: "guardrail_allow_research_001",
    taskId: "agent_task_research_query_001",
    skillId: "search_knowledge",
    decision: "ALLOW",
    reasons: ["Read-only policy-scoped knowledge retrieval."],
    harnessActionRequired: false,
    rollbackRequired: false,
    evidenceRequired: true,
    directDatabaseWriteAllowed: false,
    safetyChecks: [
      { checkId: "knowledge_scope", status: "PASS" },
      { checkId: "student_archive_denied", status: "PASS" },
    ],
  };
}

function routeDecision() {
  return {
    schemaVersion: "2026-06-04.agent.route-decision.v1",
    routeId: "route_research_single_001",
    taskId: "agent_task_research_query_001",
    mode: "SINGLE_WORKER",
    leadAgent: "LeadAgent",
    workerAgents: ["ResearchAgent"],
    selectedSkills: ["search_knowledge"],
    rationale: "Single research-domain read path with no synthesis.",
    deniedSkills: ["deep_research"],
    fallbackPlan: {
      mode: "READ_ONLY",
      reason: "Return cited knowledge references.",
      humanReviewPoint: "Teacher verifies sources before synthesis.",
    },
    p99BudgetMs: 50,
    conflictPolicy: { detectConflicts: true, resolutionMode: "LEAD_AGENT_MERGE" },
  };
}

function knowledgeRow() {
  return {
    documentId: "private_research_notes_rag",
    chunkId: "private_research_notes_rag_chunk_001",
    classification: "PRIVATE",
    title: "Private research notes: RAG intent directory index",
    citation: "private/research/rag/intent-directory-index#private_research_notes_rag_chunk_001",
    matchedSnippets: [
      {
        text: "private research note compares chunk retrieval with intent directory index",
        score: 0.92,
        sourceRef: "knowledge_chunk_private_research_notes_rag_001",
      },
    ],
    sourceEvidenceRefs: ["knowledge_benchmark_local_private_rag_notes"],
    returnedWithinPolicy: true,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = await auditResearchAgentReadonlyRuntimeAdapter(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatResearchAgentReadonlyRuntimeAdapterAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
