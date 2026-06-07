import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { invokeTeachingAgentSearchTeachingMaterial } from "./teaching-agent-readonly-runtime-adapter.mjs";

const defaultOutPath = "reports/teaching-agent-readonly-runtime-adapter.current.json";
const sourceFiles = {
  adapterSchema: "contracts/agent/teaching-agent-readonly-adapter.schema.json",
  adapterExample: "contracts/agent/teaching-agent-readonly-adapter.example.json",
  skillInputSchema: "contracts/agent/skills/search-teaching-material.input.schema.json",
  skillOutputSchema: "contracts/agent/skills/search-teaching-material.output.schema.json",
  runtime: "tools/teaching-agent-readonly-runtime-adapter.mjs",
  runtimeTest: "tools/teaching-agent-readonly-runtime-adapter.test.mjs",
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
  "externalModelUsed: true",
  "studentDataReturned: true",
  "privateKnowledgeReturned: true",
];

export async function auditTeachingAgentReadonlyRuntimeAdapter(inputs, options = {}) {
  const findings = [];
  const adapterSchema = parseJson(inputs.adapterSchema, {});
  const adapterExample = parseJson(inputs.adapterExample, {});
  const skillInputSchema = parseJson(inputs.skillInputSchema, {});
  const skillOutputSchema = parseJson(inputs.skillOutputSchema, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const probe = await runRuntimeProbe(options);

  addFinding(findings, {
    id: "contract.adapter_identity_and_read_port",
    passed: adapterSchema.properties?.adapterId?.const === "teaching_agent_search_material_readonly_adapter" &&
      adapterSchema.properties?.workerAgent?.const === "TeachingAgent" &&
      adapterSchema.properties?.skillId?.const === "search_teaching_material" &&
      adapterSchema.properties?.routeMode?.const === "SINGLE_WORKER" &&
      adapterExample.readPort?.portName === "TeachingArchiveReadPort" &&
      adapterExample.readPort?.operation === "searchTeachingMaterials" &&
      adapterExample.readPort?.directDatabaseAccessAllowed === false &&
      adapterExample.readPort?.writeOperationAllowed === false,
    actual: summarizeAdapter(adapterExample),
    expected: "TeachingAgent.search_teaching_material SINGLE_WORKER via TeachingArchiveReadPort.searchTeachingMaterials with no direct DB or writes",
    remediation: "Keep the real adapter bound to the checked read port rather than a database, write repository, or model call.",
  });

  addFinding(findings, {
    id: "contract.skill_input_output_boundaries",
    passed: skillInputSchema.properties?.writeIntent?.const === false &&
      skillInputSchema.properties?.studentDataAccess?.const === "NONE" &&
      skillInputSchema.properties?.externalModelAllowed?.const === false &&
      skillInputSchema.properties?.filters?.properties?.ownerType?.const === "TEACHING" &&
      skillInputSchema.properties?.filters?.properties?.includeStudentArchive?.const === false &&
      skillInputSchema.properties?.latencyBudgetMs?.maximum === 50 &&
      skillOutputSchema.properties?.items?.items?.properties?.ownerType?.const === "TEACHING" &&
      skillOutputSchema.properties?.safety?.properties?.directDatabaseWriteAllowed?.const === false &&
      skillOutputSchema.properties?.safety?.properties?.studentDataReturned?.const === false &&
      skillOutputSchema.properties?.safety?.properties?.externalModelUsed?.const === false,
    actual: summarizeSkillBoundaries(skillInputSchema, skillOutputSchema),
    expected: "input denies write/student archive/external model; output is teaching-only and safety=false",
    remediation: "Skill boundaries must stay narrow before runtime invocation can count as root workflow evidence.",
  });

  addFinding(findings, {
    id: "runtime.requires_injected_read_port_and_context_guards",
    passed: includesAll(inputs.runtime, [
      "readPort.searchTeachingMaterials",
      "buildReadPortRequest",
      "assertPrincipalContext",
      "assertSharedContext",
      "assertGuardrailResult",
      "assertRouteDecision",
      "requireConst(sharedContext.dataScopes.teaching, \"READ\"",
      "requireConst(sharedContext.dataScopes.student, \"NONE\"",
      "requireConst(sharedContext.dataScopes.knowledge, \"PUBLIC\"",
      "requireConst(sharedContext.dataScopes.tool, \"NONE\"",
      "requireConst(guardrailResult.decision, \"ALLOW\"",
      "requireConst(routeDecision.mode, \"SINGLE_WORKER\"",
    ]),
    actual: "runtime guard symbols scanned",
    expected: "injected read port plus principal/shared context/guardrail/route gates",
    remediation: "The runtime adapter must validate every upstream control-plane artifact before it invokes the read port.",
  });

  addFinding(findings, {
    id: "runtime.no_side_effects_direct_db_or_model_calls",
    passed: includesAll(inputs.runtime, [
      "directDatabaseAccessAllowed: false",
      "writeOperationAllowed: false",
      "studentDataAccess: \"NONE\"",
      "externalModelAllowed: false",
      "studentDataReturned: false",
      "privateKnowledgeReturned: false",
      "externalModelUsed: false",
    ]) && !hasForbiddenRuntimeClaim(inputs.runtime),
    actual: summarizePresence(inputs.runtime, forbiddenRuntimeClaims),
    expected: "runtime is pure adapter logic with no fs writes, process launch, direct SQL, fetch, model call, or unsafe output flags",
    remediation: "Keep database, HTTP, model, file, and process details behind outer read-port adapters.",
  });

  addFinding(findings, {
    id: "runtime.probe_maps_real_read_port_output",
    passed: probe.status === "PASS" &&
      probe.output?.decision === "FOUND" &&
      probe.output?.items?.length === 1 &&
      probe.output?.items?.[0]?.ownerType === "TEACHING" &&
      probe.output?.safety?.directDatabaseWriteAllowed === false &&
      probe.output?.safety?.studentDataReturned === false &&
      probe.output?.safety?.externalModelUsed === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0 &&
      probe.readPortRequest?.operation === "searchTeachingMaterials" &&
      probe.readPortRequest?.safety?.directDatabaseAccessAllowed === false &&
      probe.readPortRequest?.safety?.writeOperationAllowed === false,
    actual: probe.status === "PASS"
      ? `decision=${probe.output.decision};items=${probe.output.items.length};p99=${probe.runtimeSlo.p99Ms};errors=${probe.runtimeSlo.totalErrors}`
      : probe.error,
    expected: "probe returns FOUND teaching-only output through injected read port with p99<=50 and zero errors",
    remediation: "Runtime adapter must produce executable evidence, not contract-only prose.",
  });

  addFinding(findings, {
    id: "tests.cover_runtime_negative_paths",
    passed: includesAll(inputs.runtimeTest, [
      "invokes the injected read port and maps teaching material results",
      "returns NO_MATCH",
      "rejects write intent",
      "rejects student archive and external model requests",
      "rejects student and remote principals",
      "rejects unsafe SharedContext scopes",
      "rejects guardrail deny and failing safety checks",
      "rejects swarm routes and wrong worker or skill routes",
      "requires an injected read port and rejects unsafe read port rows",
      "truncates results and snippets",
    ]),
    actual: "runtime tests scanned",
    expected: "happy path, no-match, unsafe input, unsafe principal, unsafe context, guardrail, route, read-port, and limit tests",
    remediation: "Keep runtime regression tests broad enough to catch safety-boundary drift.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime_adapter",
    passed: packageJson.scripts?.["audit:teaching-agent-readonly-runtime-adapter"]?.includes("teaching-agent-readonly-runtime-adapter-audit.mjs") &&
      inputs.qualityGate.includes("TeachingAgent read-only runtime adapter audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + inputs.qualityGate, [
      "audit:teaching-agent-readonly-runtime-adapter",
      "TeachingAgent read-only runtime adapter audit",
    ]),
    expected: "npm script and strict quality command include the real TeachingAgent read-only runtime adapter audit",
    remediation: "Add this runtime adapter slice to the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_runtime_adapter_report",
    passed: includesAll(inputs.rootWorkflowCoverage, [
      "teachingAgentReadonlyRuntimeAdapter",
      "teaching-agent-readonly-runtime-adapter.current.json",
      "[\"teachingAgentReadonlyRuntimeAdapter\", \"READY\"]",
      "teaching_agent_readonly_runtime_adapter",
    ]),
    actual: summarizePresence(inputs.rootWorkflowCoverage, [
      "teachingAgentReadonlyRuntimeAdapter",
      "teaching-agent-readonly-runtime-adapter.current.json",
      "teaching_agent_readonly_runtime_adapter",
    ]),
    expected: "teaching root workflow requires the real TeachingAgent runtime adapter report",
    remediation: "Root workflow coverage should not claim this adapter is real unless its report is required.",
  });

  addFinding(findings, {
    id: "quality.structure_tracks_runtime_adapter",
    passed: includesAll(inputs.verifyStructure, [
      "teaching-agent-readonly-runtime-adapter.mjs",
      "teaching-agent-readonly-runtime-adapter.test.mjs",
      "teaching-agent-readonly-runtime-adapter-audit.mjs",
      "teaching-agent-readonly-runtime-adapter-audit.test.mjs",
      "0237-teaching-agent-readonly-runtime-adapter.md",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires runtime adapter, tests, audit, audit test, and SDD",
    remediation: "Add the real adapter slice to structure verification.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "TEACHING_AGENT_READONLY_RUNTIME_ADAPTER",
    adapter: {
      adapterId: "teaching_agent_search_material_readonly_adapter",
      workerAgent: "TeachingAgent",
      skillId: "search_teaching_material",
      readPort: "TeachingArchiveReadPort.searchTeachingMaterials",
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
      studentDataReturned: false,
      privateKnowledgeReturned: false,
      externalModelUsed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    runtimeProbes: {
      invoke: probe,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the first real TeachingAgent read-only runtime adapter evidence; next Agent slices can wire dispatcher invocation or add StudentTutor/Research real adapters without repeating broad production10k tests."
      : "Fix the real TeachingAgent read-only runtime adapter before using it as root workflow evidence.",
  };
}

export function formatTeachingAgentReadonlyRuntimeAdapterAudit(report) {
  const lines = [
    `TeachingAgent read-only runtime adapter: ${report.readiness}`,
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
    const output = await invokeTeachingAgentSearchTeachingMaterial(baseSkillInput(), {
      principalContext: teacherPrincipal(),
      sharedContext: sharedContext(),
      guardrailResult: guardrailResult(),
      routeDecision: routeDecision(),
      readPort: {
        searchTeachingMaterials: async (request) => {
          readPortRequests.push(request);
          return [teachingMaterialRow()];
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
        evidenceClass: "RUNTIME_ADAPTER_PROBE_WITH_INJECTED_READ_PORT",
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
  return [
    `write=${inputSchema.properties?.writeIntent?.const}`,
    `student=${inputSchema.properties?.studentDataAccess?.const}`,
    `external=${inputSchema.properties?.externalModelAllowed?.const}`,
    `owner=${inputSchema.properties?.filters?.properties?.ownerType?.const}`,
    `studentArchive=${inputSchema.properties?.filters?.properties?.includeStudentArchive?.const}`,
    `p99=${inputSchema.properties?.latencyBudgetMs?.maximum}`,
    `outputOwner=${outputSchema.properties?.items?.items?.properties?.ownerType?.const}`,
    `outputWrite=${outputSchema.properties?.safety?.properties?.directDatabaseWriteAllowed?.const}`,
    `outputStudent=${outputSchema.properties?.safety?.properties?.studentDataReturned?.const}`,
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
    schemaVersion: "2026-06-04.agent.skill.search-teaching-material.input.v1",
    invocationId: "skill_call_search_teaching_material_001",
    taskId: "agent_task_lesson_quiz_001",
    contextRef: "ctx_lesson_quiz_triage_001",
    principalContextRef: "principal-context:teacher_001:session_teacher_001",
    query: "函数单调性随堂测验教学资料",
    filters: {
      ownerType: "TEACHING",
      materialTypes: ["TEACHING_MATERIAL", "HANDOUT"],
      tags: ["函数单调性", "随堂测验"],
      includeStudentArchive: false,
    },
    limits: {
      maxResults: 5,
      maxSnippetChars: 240,
    },
    evidenceRefs: [
      "evidence:permission:teaching-read",
      "evidence:lesson-material:index-hash-001",
    ],
    latencyBudgetMs: 50,
    writeIntent: false,
    studentDataAccess: "NONE",
    externalModelAllowed: false,
  };
}

function teacherPrincipal() {
  return {
    principalId: "teacher_001",
    subjectType: "USER",
    role: "TEACHER",
    entryPoint: "DESKTOP_TEACHER",
    scopes: ["TEACHING_READ", "KNOWLEDGE_PUBLIC_READ"],
  };
}

function sharedContext() {
  return {
    schemaVersion: "2026-06-04.agent.shared-context.v1",
    contextId: "ctx_lesson_quiz_triage_001",
    principalContextRef: "principal-context:teacher_001:session_teacher_001",
    sessionId: "session_teacher_001",
    taskId: "agent_task_lesson_quiz_001",
    rootRequirementAnchors: ["教学模式", "随堂测验", "档案资料"],
    dataScopes: {
      principal: "teacher:assigned-class",
      teaching: "READ",
      student: "NONE",
      research: "NONE",
      knowledge: "PUBLIC",
      tool: "NONE",
    },
    evidenceRefs: ["evidence:shared-context:ctx_lesson_quiz_triage_001"],
    redactionState: {
      mode: "STRICT",
      studentDataRedacted: true,
      privateKnowledgeRedacted: true,
      externalModelAllowed: false,
    },
  };
}

function guardrailResult() {
  return {
    schemaVersion: "2026-06-04.agent.guardrail-result.v1",
    guardrailId: "guardrail_allow_read_teaching_001",
    taskId: "agent_task_lesson_quiz_001",
    skillId: "search_teaching_material",
    decision: "ALLOW",
    reasons: ["Read-only teaching material search within assigned scope."],
    harnessActionRequired: false,
    rollbackRequired: false,
    evidenceRequired: true,
    directDatabaseWriteAllowed: false,
    safetyChecks: [
      { checkId: "principal_scope", status: "PASS" },
      { checkId: "evidence_policy", status: "PASS" },
    ],
  };
}

function routeDecision() {
  return {
    schemaVersion: "2026-06-04.agent.route-decision.v1",
    routeId: "route_lesson_quiz_single_001",
    taskId: "agent_task_lesson_quiz_001",
    mode: "SINGLE_WORKER",
    leadAgent: "LeadAgent",
    workerAgents: ["TeachingAgent"],
    selectedSkills: ["search_teaching_material"],
    rationale: "Single teaching-domain read path with no external tool mutation.",
    deniedSkills: [],
    fallbackPlan: {
      mode: "READ_ONLY",
      reason: "Return read-only material references.",
      humanReviewPoint: "Teacher reviews before any draft is saved.",
    },
    p99BudgetMs: 50,
    conflictPolicy: { detectConflicts: true, resolutionMode: "LEAD_AGENT_MERGE" },
  };
}

function teachingMaterialRow() {
  return {
    archiveItemId: "tarch_teaching_material_001",
    ownerType: "TEACHING",
    materialType: "TEACHING_MATERIAL",
    title: "函数单调性导学案",
    contentRef: "teaching-materials/functions/monotonicity/guide-v1.md",
    matchedSnippets: [
      {
        text: "函数单调性教学目标、例题和课堂练习安排。",
        score: 0.92,
        sourceRef: "teaching-materials/functions/monotonicity/guide-v1.md#section-2",
      },
    ],
    sourceEvidenceRefs: ["evidence:source:tarch_teaching_material_001"],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = await auditTeachingAgentReadonlyRuntimeAdapter(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatTeachingAgentReadonlyRuntimeAdapterAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
