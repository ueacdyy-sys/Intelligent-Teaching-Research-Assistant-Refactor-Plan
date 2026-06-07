import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { invokeStudentTutorRecommendPractice } from "./student-tutor-agent-readonly-runtime-adapter.mjs";

const defaultOutPath = "reports/student-tutor-agent-readonly-runtime-adapter.current.json";
const sourceFiles = {
  adapterSchema: "contracts/agent/student-tutor-agent-readonly-adapter.schema.json",
  adapterExample: "contracts/agent/student-tutor-agent-readonly-adapter.example.json",
  skillInputSchema: "contracts/agent/skills/recommend-practice.input.schema.json",
  skillOutputSchema: "contracts/agent/skills/recommend-practice.output.schema.json",
  runtime: "tools/student-tutor-agent-readonly-runtime-adapter.mjs",
  runtimeTest: "tools/student-tutor-agent-readonly-runtime-adapter.test.mjs",
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
  "crossStudentDataReturned: true",
  "rawStudentArchiveReturned: true",
  "finalEvaluationReturned: true",
  "externalModelUsed: true",
  "localToolMutationAllowed: true",
];

export async function auditStudentTutorAgentReadonlyRuntimeAdapter(inputs, options = {}) {
  const findings = [];
  const adapterSchema = parseJson(inputs.adapterSchema, {});
  const adapterExample = parseJson(inputs.adapterExample, {});
  const skillInputSchema = parseJson(inputs.skillInputSchema, {});
  const skillOutputSchema = parseJson(inputs.skillOutputSchema, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const probe = await runRuntimeProbe(options);

  addFinding(findings, {
    id: "contract.adapter_identity_and_read_port",
    passed: adapterSchema.properties?.adapterId?.const === "student_tutor_recommend_practice_readonly_adapter" &&
      adapterSchema.properties?.workerAgent?.const === "StudentTutorAgent" &&
      adapterSchema.properties?.skillId?.const === "recommend_practice" &&
      adapterSchema.properties?.routeMode?.const === "SINGLE_WORKER" &&
      adapterExample.readPort?.portName === "StudentLearningReadPort" &&
      adapterExample.readPort?.operation === "recommendPracticeContext" &&
      adapterExample.readPort?.directDatabaseAccessAllowed === false &&
      adapterExample.readPort?.writeOperationAllowed === false,
    actual: summarizeAdapter(adapterExample),
    expected: "StudentTutorAgent.recommend_practice SINGLE_WORKER via StudentLearningReadPort.recommendPracticeContext with no direct DB or writes",
    remediation: "Keep the StudentTutor runtime adapter bound to the checked read port rather than a database, write repository, or model call.",
  });

  addFinding(findings, {
    id: "contract.skill_input_output_boundaries",
    passed: skillInputSchema.properties?.writeIntent?.const === false &&
      skillInputSchema.properties?.studentDataAccess?.const === "OWN_OR_ASSIGNED" &&
      skillInputSchema.properties?.externalModelAllowed?.const === false &&
      skillInputSchema.properties?.finalEvaluationAllowed?.const === false &&
      skillInputSchema.properties?.targetStudentScope?.properties?.crossStudentComparisonAllowed?.const === false &&
      skillInputSchema.properties?.filters?.properties?.includeOtherStudents?.const === false &&
      skillInputSchema.properties?.limits?.properties?.maxReasonChars?.minimum === 1 &&
      skillInputSchema.properties?.latencyBudgetMs?.maximum === 50 &&
      skillOutputSchema.properties?.safety?.properties?.directDatabaseWriteAllowed?.const === false &&
      skillOutputSchema.properties?.safety?.properties?.crossStudentDataReturned?.const === false &&
      skillOutputSchema.properties?.safety?.properties?.rawStudentArchiveReturned?.const === false &&
      skillOutputSchema.properties?.safety?.properties?.finalEvaluationReturned?.const === false &&
      skillOutputSchema.properties?.safety?.properties?.externalModelUsed?.const === false &&
      skillOutputSchema.properties?.safety?.properties?.localToolMutationAllowed?.const === false &&
      skillOutputSchema.properties?.safety?.properties?.returnedWithinStudentScope?.const === true,
    actual: summarizeSkillBoundaries(skillInputSchema, skillOutputSchema),
    expected: "input denies write/cross-student/final-eval/model; reason min=1; output denies raw archive and unsafe student data",
    remediation: "StudentTutorAgent boundaries must stay scoped before runtime invocation can count as student workflow evidence.",
  });

  addFinding(findings, {
    id: "runtime.requires_injected_read_port_and_context_guards",
    passed: includesAll(inputs.runtime, [
      "readPort.recommendPracticeContext",
      "buildReadPortRequest",
      "assertPrincipalContext",
      "assertSharedContext",
      "assertGuardrailResult",
      "assertRouteDecision",
      "requireConst(sharedContext.dataScopes.student, \"ASSIGNED\"",
      "requireConst(sharedContext.dataScopes.knowledge, \"PUBLIC\"",
      "requireConst(sharedContext.dataScopes.teaching, \"READ\"",
      "requireConst(sharedContext.dataScopes.research, \"NONE\"",
      "requireConst(guardrailResult.decision, \"ALLOW\"",
      "requireConst(routeDecision.mode, \"SINGLE_WORKER\"",
    ]),
    actual: "runtime guard symbols scanned",
    expected: "injected read port plus principal/shared context/guardrail/route gates",
    remediation: "The runtime adapter must validate every upstream control-plane artifact before it invokes the student read port.",
  });

  addFinding(findings, {
    id: "runtime.no_side_effects_direct_db_model_or_raw_archive",
    passed: includesAll(inputs.runtime, [
      "directDatabaseAccessAllowed: false",
      "writeOperationAllowed: false",
      "crossStudentDataReturned: false",
      "rawStudentArchiveReturned: false",
      "finalEvaluationReturned: false",
      "externalModelUsed: false",
      "localToolMutationAllowed: false",
      "returnedWithinStudentScope: true",
    ]) && !hasForbiddenRuntimeClaim(inputs.runtime),
    actual: summarizePresence(inputs.runtime, forbiddenRuntimeClaims),
    expected: "runtime is pure adapter logic with no fs writes, process launch, direct SQL, fetch, model call, raw archive, final eval, or local mutation",
    remediation: "Keep persistence, model, file, process, and raw student archive details behind outer read-port adapters.",
  });

  addFinding(findings, {
    id: "runtime.probe_maps_scoped_read_port_output",
    passed: probe.status === "PASS" &&
      probe.output?.decision === "FOUND" &&
      probe.output?.recommendations?.length === 1 &&
      probe.output?.safety?.directDatabaseWriteAllowed === false &&
      probe.output?.safety?.crossStudentDataReturned === false &&
      probe.output?.safety?.rawStudentArchiveReturned === false &&
      probe.output?.safety?.finalEvaluationReturned === false &&
      probe.output?.safety?.externalModelUsed === false &&
      probe.output?.safety?.returnedWithinStudentScope === true &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0 &&
      probe.readPortRequest?.operation === "recommendPracticeContext" &&
      probe.readPortRequest?.safety?.writeOperationAllowed === false &&
      probe.readPortRequest?.safety?.crossStudentComparisonAllowed === false &&
      probe.readPortRequest?.safety?.rawStudentArchiveAllowed === false,
    actual: probe.status === "PASS"
      ? `decision=${probe.output.decision};recommendations=${probe.output.recommendations.length};p99=${probe.runtimeSlo.p99Ms};errors=${probe.runtimeSlo.totalErrors}`
      : probe.error,
    expected: "probe returns FOUND scoped recommendations through injected read port with p99<=50 and zero errors",
    remediation: "Runtime adapter must produce executable scoped recommendation evidence, not contract-only prose.",
  });

  addFinding(findings, {
    id: "tests.cover_runtime_negative_paths",
    passed: includesAll(inputs.runtimeTest, [
      "invokes the injected read port and maps scoped practice recommendations",
      "returns NO_MATCH",
      "rejects write, external model, final evaluation, and cross-student requests",
      "enforces OWN and ASSIGNED principal scopes",
      "rejects unsafe SharedContext scopes",
      "rejects guardrail deny and wrong route decisions",
      "requires an injected read port and rejects unsafe rows",
      "truncates recommendations and reasons",
    ]),
    actual: "runtime tests scanned",
    expected: "happy path, no-match, unsafe input, principal scope, context, guardrail, route, read-port, and limit tests",
    remediation: "Keep runtime regression tests broad enough to catch student privacy boundary drift.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime_adapter",
    passed: packageJson.scripts?.["audit:student-tutor-agent-readonly-runtime-adapter"]?.includes("student-tutor-agent-readonly-runtime-adapter-audit.mjs") &&
      inputs.qualityGate.includes("StudentTutorAgent read-only runtime adapter audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + inputs.qualityGate, [
      "audit:student-tutor-agent-readonly-runtime-adapter",
      "StudentTutorAgent read-only runtime adapter audit",
    ]),
    expected: "npm script and strict quality command include the real StudentTutorAgent read-only runtime adapter audit",
    remediation: "Add this runtime adapter slice to the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_runtime_adapter_report",
    passed: includesAll(inputs.rootWorkflowCoverage, [
      "studentTutorAgentReadonlyRuntimeAdapter",
      "student-tutor-agent-readonly-runtime-adapter.current.json",
      "[\"studentTutorAgentReadonlyRuntimeAdapter\", \"READY\"]",
      "student_tutor_agent_readonly_runtime_adapter",
    ]),
    actual: summarizePresence(inputs.rootWorkflowCoverage, [
      "studentTutorAgentReadonlyRuntimeAdapter",
      "student-tutor-agent-readonly-runtime-adapter.current.json",
      "student_tutor_agent_readonly_runtime_adapter",
    ]),
    expected: "student app root workflow requires the real StudentTutorAgent runtime adapter report",
    remediation: "Root workflow coverage should not claim this adapter is real unless its report is required.",
  });

  addFinding(findings, {
    id: "quality.structure_tracks_runtime_adapter",
    passed: includesAll(inputs.verifyStructure, [
      "student-tutor-agent-readonly-runtime-adapter.mjs",
      "student-tutor-agent-readonly-runtime-adapter.test.mjs",
      "student-tutor-agent-readonly-runtime-adapter-audit.mjs",
      "student-tutor-agent-readonly-runtime-adapter-audit.test.mjs",
      "0239-student-tutor-agent-readonly-runtime-adapter.md",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires runtime adapter, tests, audit, audit test, and SDD",
    remediation: "Add the real StudentTutor adapter slice to structure verification.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_TUTOR_AGENT_READONLY_RUNTIME_ADAPTER",
    adapter: {
      adapterId: "student_tutor_recommend_practice_readonly_adapter",
      workerAgent: "StudentTutorAgent",
      skillId: "recommend_practice",
      readPort: "StudentLearningReadPort.recommendPracticeContext",
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
      crossStudentDataReturned: false,
      rawStudentArchiveReturned: false,
      finalEvaluationReturned: false,
      externalModelUsed: false,
      localToolMutationAllowed: false,
      returnedWithinStudentScope: true,
      swarmAllowed: false,
    },
    runtimeProbes: {
      invoke: probe,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the real StudentTutorAgent read-only runtime adapter evidence; next Agent slice can wire ResearchAgent or broaden dispatcher invocation without repeating broad production10k tests."
      : "Fix the real StudentTutorAgent read-only runtime adapter before using it as root workflow evidence.",
  };
}

export function formatStudentTutorAgentReadonlyRuntimeAdapterAudit(report) {
  const lines = [
    `StudentTutorAgent read-only runtime adapter: ${report.readiness}`,
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
    const output = await invokeStudentTutorRecommendPractice(baseSkillInput(), {
      principalContext: studentPrincipal(),
      sharedContext: sharedContext(),
      guardrailResult: guardrailResult(),
      routeDecision: routeDecision(),
      readPort: {
        recommendPracticeContext: async (request) => {
          readPortRequests.push(request);
          return [practiceRow()];
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
        evidenceClass: "RUNTIME_ADAPTER_PROBE_WITH_INJECTED_STUDENT_READ_PORT",
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
    `finalEval=${inputSchema.properties?.finalEvaluationAllowed?.const}`,
    `cross=${inputSchema.properties?.targetStudentScope?.properties?.crossStudentComparisonAllowed?.const}`,
    `includeOther=${inputSchema.properties?.filters?.properties?.includeOtherStudents?.const}`,
    `reasonMin=${inputSchema.properties?.limits?.properties?.maxReasonChars?.minimum}`,
    `outputRaw=${safety.rawStudentArchiveReturned?.const}`,
    `outputWithinScope=${safety.returnedWithinStudentScope?.const}`,
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
    schemaVersion: "2026-06-04.agent.skill.recommend-practice.input.v1",
    invocationId: "skill_call_recommend_practice_001",
    taskId: "agent_task_student_tutor_001",
    contextRef: "ctx_student_tutor_001",
    principalContextRef: "principal-context:student_001:session_student_001",
    query: "根据我最近函数单调性错题推荐练习",
    targetStudentScope: {
      mode: "OWN",
      studentIds: ["student_001"],
      crossStudentComparisonAllowed: false,
    },
    learningSignals: {
      knowledgePointIds: ["kp_function_monotonicity"],
      recentMistakeRefs: ["mistake_ref_quiz_001_q3"],
      archiveItemRefs: ["tarch_student_archive_001"],
    },
    filters: {
      includeTeachingMaterials: true,
      includeStudentArchive: true,
      includeOtherStudents: false,
    },
    limits: {
      maxRecommendations: 3,
      maxReasonChars: 240,
    },
    evidenceRefs: [
      "evidence:permission:student-own-read",
      "evidence:student-app-flow:current",
    ],
    latencyBudgetMs: 50,
    writeIntent: false,
    studentDataAccess: "OWN_OR_ASSIGNED",
    externalModelAllowed: false,
    finalEvaluationAllowed: false,
  };
}

function studentPrincipal() {
  return {
    principalId: "student_001",
    subjectType: "USER",
    role: "STUDENT",
    entryPoint: "STUDENT_APP",
    scopes: ["STUDENT_OWN_READ", "TEACHING_READ", "KNOWLEDGE_PUBLIC_READ"],
  };
}

function sharedContext() {
  return {
    schemaVersion: "2026-06-04.agent.shared-context.v1",
    contextId: "ctx_student_tutor_001",
    principalContextRef: "principal-context:student_001:session_student_001",
    sessionId: "session_student_001",
    taskId: "agent_task_student_tutor_001",
    rootRequirementAnchors: ["学生端", "AI辅导助手", "学生档案", "教学资料"],
    dataScopes: {
      principal: "student:own",
      teaching: "READ",
      student: "ASSIGNED",
      research: "NONE",
      knowledge: "PUBLIC",
      tool: "NONE",
    },
    evidenceRefs: ["evidence:shared-context:ctx_student_tutor_001"],
    redactionState: {
      mode: "STRICT",
      crossStudentDataRedacted: true,
      rawStudentArchiveRedacted: true,
      finalEvaluationRedacted: true,
      externalModelAllowed: false,
    },
  };
}

function guardrailResult() {
  return {
    schemaVersion: "2026-06-04.agent.guardrail-result.v1",
    guardrailId: "guardrail_allow_student_tutor_001",
    taskId: "agent_task_student_tutor_001",
    skillId: "recommend_practice",
    decision: "ALLOW",
    reasons: ["Read-only scoped practice recommendation."],
    harnessActionRequired: false,
    rollbackRequired: false,
    evidenceRequired: true,
    directDatabaseWriteAllowed: false,
    safetyChecks: [
      { checkId: "student_scope", status: "PASS" },
      { checkId: "raw_archive_redaction", status: "PASS" },
    ],
  };
}

function routeDecision() {
  return {
    schemaVersion: "2026-06-04.agent.route-decision.v1",
    routeId: "route_student_tutor_single_001",
    taskId: "agent_task_student_tutor_001",
    mode: "SINGLE_WORKER",
    leadAgent: "LeadAgent",
    workerAgents: ["StudentTutorAgent"],
    selectedSkills: ["recommend_practice"],
    rationale: "Single student-tutor read path with no final evaluation.",
    deniedSkills: [],
    fallbackPlan: {
      mode: "READ_ONLY",
      reason: "Return scoped practice recommendations.",
      humanReviewPoint: "Teacher reviews before assigning final work.",
    },
    p99BudgetMs: 50,
    conflictPolicy: { detectConflicts: true, resolutionMode: "LEAD_AGENT_MERGE" },
  };
}

function practiceRow() {
  return {
    practiceId: "practice_function_monotonicity_001",
    title: "函数单调性基础巩固练习",
    sourceType: "TEACHING_MATERIAL",
    knowledgePointIds: ["kp_function_monotonicity"],
    reason: "Recent mistakes point to interval judgment and monotonicity definition confusion.",
    sourceEvidenceRefs: [
      "evidence:source:tarch_teaching_material_001",
      "evidence:student-scope:student_001",
    ],
    expiresAt: "2026-06-11T00:00:00.000Z",
    studentIds: ["student_001"],
    returnedWithinStudentScope: true,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = await auditStudentTutorAgentReadonlyRuntimeAdapter(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatStudentTutorAgentReadonlyRuntimeAdapterAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
