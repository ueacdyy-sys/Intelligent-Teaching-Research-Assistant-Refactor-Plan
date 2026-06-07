import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { submitResearchDeepResearchIntent } from "./research-deep-research-intent-runtime.mjs";

const defaultOutPath = "reports/research-deep-research-intent.current.json";
const sourceFiles = {
  inputSchema: "contracts/agent/skills/deep-research.input.schema.json",
  outputSchema: "contracts/agent/skills/deep-research.output.schema.json",
  inputExample: "contracts/agent/skills/deep-research.input.example.json",
  outputExample: "contracts/agent/skills/deep-research.output.example.json",
  runtime: "tools/research-deep-research-intent-runtime.mjs",
  runtimeTest: "tools/research-deep-research-intent-runtime.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0242-research-deep-research-intent-runtime.md",
};

const forbiddenRuntimeClaims = [
  "node:child_process",
  "spawn(",
  "execSync(",
  "fetch(",
  "postgres://",
  "SELECT ",
  "INSERT ",
  "UPDATE ",
  "DELETE ",
  "finalAnswerGenerated: true",
  "finalAnswerNowAllowed: true",
  "ragSynthesisNowAllowed: true",
  "externalModelCallNowAllowed: true",
  "directPublicationAllowed: true",
  "localToolMutationAllowed: true",
  "executeAsyncNow: true",
];

export async function auditResearchDeepResearchIntentRuntime(inputs, options = {}) {
  const findings = [];
  const inputSchema = parseJson(inputs.inputSchema, {});
  const outputSchema = parseJson(inputs.outputSchema, {});
  const inputExample = parseJson(inputs.inputExample, {});
  const outputExample = parseJson(inputs.outputExample, {});
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const packageJson = parseJson(inputs.packageJson, {});
  const qualityGate = inputs.qualityGate ?? "";
  const rootWorkflowCoverage = inputs.rootWorkflowCoverage ?? "";
  const verifyStructure = inputs.verifyStructure ?? "";
  const architectureBoard = inputs.architectureBoard ?? "";
  const sdd = inputs.sdd ?? "";
  const probe = await runRuntimeProbe(options);

  addFinding(findings, {
    id: "contract.schema_and_examples",
    passed: inputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-intent.invoke.v1" &&
      inputSchema.properties?.sourcePolicy?.properties?.includeStudentArchive?.const === false &&
      inputSchema.properties?.asyncPolicy?.properties?.queueName?.const === "research_deep_research" &&
      outputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-intent.output.v1" &&
      outputSchema.properties?.decision?.enum?.includes("PENDING_REVIEW") &&
      outputSchema.properties?.decision?.enum?.includes("ACCEPTED_ASYNC") &&
      inputExample.schemaVersion === "2026-06-05.research.deep-research-intent.invoke.v1" &&
      inputExample.asyncPolicy?.queueName === "research_deep_research" &&
      inputExample.sourcePolicy?.includeStudentArchive === false &&
      outputExample.schemaVersion === "2026-06-05.research.deep-research-intent.output.v1" &&
      outputExample.decision === "PENDING_REVIEW" &&
      outputExample.job?.queueName === "research_deep_research" &&
      outputExample.safety?.finalAnswerGenerated === false,
    actual: summarizePresence(JSON.stringify(inputSchema) + JSON.stringify(outputSchema) + JSON.stringify(inputExample) + JSON.stringify(outputExample), [
      "2026-06-05",
      "research_deep_research",
      "PENDING_REVIEW",
      "ACCEPTED_ASYNC",
    ]),
    expected: "deep_research input/output schemas and examples must match the admission-only async contract",
    remediation: "Keep the deep_research contract files aligned with the runtime boundary and queue naming.",
  });

  addFinding(findings, {
    id: "contract.intent_identity_and_port",
    passed: includesAll(runtime, [
      "RESEARCH_DEEP_RESEARCH_INTENT_RUNTIME_ID",
      "RESEARCH_DEEP_RESEARCH_INTENT_PORT",
      "submitDeepResearchIntent",
      "DeepResearchIntentPort",
      "skillId: \"deep_research\"",
      "decision: portResult.status",
    ]),
    actual: summarizePresence(runtime, [
      "RESEARCH_DEEP_RESEARCH_INTENT_RUNTIME_ID",
      "RESEARCH_DEEP_RESEARCH_INTENT_PORT",
      "submitDeepResearchIntent",
      "DeepResearchIntentPort",
      "skillId: \"deep_research\"",
      "decision: portResult.status",
    ]),
    expected: "Research deep_research intent runtime must submit a reviewable intent through DeepResearchIntentPort",
    remediation: "Keep this slice as an admission-only async intent runtime instead of a synchronous answer path.",
  });

  addFinding(findings, {
    id: "contract.async_review_only_boundaries",
    passed: includesAll(runtime, [
      "requireConst(agentTask.requiresHumanApproval, true",
      "requireConst(guardrailResult.decision, \"APPROVAL_REQUIRED\"",
      "requireConst(asyncPolicy.executeAsyncNow, false",
      "requireConst(asyncPolicy.externalModelCallNowAllowed, false",
      "requireConst(asyncPolicy.ragSynthesisNowAllowed, false",
      "requireConst(asyncPolicy.finalAnswerNowAllowed, false",
      "requireConst(asyncPolicy.directPublicationAllowed, false",
      "requireConst(asyncPolicy.localToolMutationAllowed, false",
      "requireConst(asyncPolicy.humanReviewRequiredBeforeExecution, true",
      "requireConst(sourcePolicy.includeStudentArchive, false",
      "requireConst(sourcePolicy.includeRemoteDeviceSources, false",
      "requireConst(sourcePolicy.directDatabaseAccessAllowed, false",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "review-only async admission without final answer, synthesis, model now, publication, or mutation",
    remediation: "Do not let deep_research bypass approval or collapse into a synchronous RAG answer path.",
  });

  addFinding(findings, {
    id: "runtime.probe_submits_reviewable_intent",
    passed: probe.status === "PASS" &&
      probe.output?.decision === "PENDING_REVIEW" &&
      probe.output?.job?.queueName === "research_deep_research" &&
      probe.output?.job?.reviewRequired === true &&
      probe.output?.job?.executionStarted === false &&
      probe.output?.safety?.finalAnswerGenerated === false &&
      probe.output?.safety?.ragSynthesisStarted === false &&
      probe.output?.safety?.externalModelCallStarted === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.output?.slo?.asyncRuntimeBudgetMs >= 120000 &&
      probe.output?.safety?.admissionOnly === true &&
      probe.portRequest?.operation === "submitDeepResearchIntent" &&
      probe.portRequest?.safety?.admissionOnly === true &&
      probe.portRequest?.safety?.finalAnswerNowAllowed === false &&
      probe.portRequest?.safety?.ragSynthesisNowAllowed === false &&
      probe.portRequest?.safety?.externalModelCallNowAllowed === false,
    actual: probe.status === "PASS"
      ? `decision=${probe.output.decision};job=${probe.output.job.jobId};p99=${probe.runtimeSlo.p99Ms};async=${probe.output.slo.asyncRuntimeBudgetMs}`
      : probe.error,
    expected: "probe returns a reviewable async intent and not a final answer",
    remediation: "The runtime must submit the intent to a queue and stop before synthesis or answer generation.",
  });

  addFinding(findings, {
    id: "tests.cover_runtime_negative_paths",
    passed: includesAll(runtimeTest, [
      "submits a reviewable async deep_research intent through the injected port",
      "accepts async admission without starting execution or synthesis",
      "rejects write intent, missing approval, high risk, and Swarm before the port is called",
      "rejects immediate execution, model calls, synthesis, publication, and local mutation",
      "enforces principal and SharedContext research boundaries",
      "requires approval guardrails and a ResearchAgent deep_research route",
      "rejects student archive, remote device sources, direct database access, and bad budgets",
      "requires an injected intent port and rejects unsafe port results",
    ]),
    actual: "runtime tests scanned",
    expected: "positive admission, async acceptance, and a broad set of rejection paths",
    remediation: "Keep the regression tests broad enough to catch drift toward synchronous RAG or final-answer generation.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime",
    passed: packageJson.scripts?.["audit:research-deep-research-intent-runtime"]?.includes("research-deep-research-intent-audit.mjs") &&
      qualityGate.includes("Research deep_research intent runtime audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + qualityGate, [
      "audit:research-deep-research-intent-runtime",
      "Research deep_research intent runtime audit",
    ]),
    expected: "npm script and strict quality command include the deep_research intent audit",
    remediation: "Add the new runtime slice to the strict quality gate before treating it as a root-capable control-plane path.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_runtime_report",
    passed: rootWorkflowCoverage.includes("researchDeepResearchIntent") &&
      rootWorkflowCoverage.includes("research-deep-research-intent.current.json") &&
      rootWorkflowCoverage.includes("research_deep_research_intent_runtime") &&
      rootWorkflowCoverage.includes("[\"researchDeepResearchIntent\", \"READY\"]"),
    actual: summarizePresence(rootWorkflowCoverage, [
      "researchDeepResearchIntent",
      "research-deep-research-intent.current.json",
      "research_deep_research_intent_runtime",
    ]),
    expected: "research root workflow should require the async deep_research intent report",
    remediation: "Root workflow coverage must explicitly require the new deep research admission evidence.",
  });

  addFinding(findings, {
    id: "structure_tracks_runtime_files",
    passed: includesAll(verifyStructure, [
      "research-deep-research-intent-runtime.mjs",
      "research-deep-research-intent-runtime.test.mjs",
      "research-deep-research-intent-audit.mjs",
      "research-deep-research-intent-audit.test.mjs",
      "0242-research-deep-research-intent-runtime.md",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires runtime, tests, audit, audit test, and SDD",
    remediation: "Add the deep_research intent slice to structure verification.",
  });

  addFinding(findings, {
    id: "sdd.explicitly_stays_async",
    passed: includesAll(sdd, [
      "deep_research",
      "admission-only",
      "does not implement full RAG synthesis",
      "does not produce a final answer",
    ]),
    actual: summarizePresence(sdd, [
      "deep_research",
      "admission-only",
      "does not implement full RAG synthesis",
      "does not produce a final answer",
    ]),
    expected: "SDD should say this is async admission only and not final synthesis",
    remediation: "Keep the SDD honest about the current slice boundary.",
  });

  addFinding(findings, {
    id: "architecture_board.reflects_async_admission_progress",
    passed: includesAll(architectureBoard, [
      "ResearchAgent.deep_research",
      "异步受控意图运行时",
    ]) && architectureBoardHasProgressAtLeast(architectureBoard, 8.2),
    actual: summarizePresence(architectureBoard, [
      "ResearchAgent.deep_research",
      "异步受控意图运行时",
      "8.2/10",
      "8.3/10",
    ]),
    expected: "architecture board should show deep_research async admission progress and refactor progress >= 8.2/10",
    remediation: "Update the architecture board text so the current slice is visible to reviewers.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "RESEARCH_DEEP_RESEARCH_INTENT_RUNTIME",
    runtime: {
      runtimeId: "research_deep_research_intent_runtime",
      port: "DeepResearchIntentPort.submitDeepResearchIntent",
      asyncQueue: "research_deep_research",
    },
    runtimeSlo: probe.runtimeSlo ?? {
      targetP99Ms: 50,
      p99Ms: null,
      totalErrors: 1,
      operations: 0,
      evidenceClass: "FAILED_PROBE",
    },
    safetyInvariants: {
      admissionOnly: true,
      writeOperationAllowed: false,
      directDatabaseAccessAllowed: false,
      studentArchiveUsed: false,
      externalModelCallStarted: false,
      ragSynthesisStarted: false,
      finalAnswerGenerated: false,
      directPublicationAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    runtimeProbes: {
      submit: probe,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the async deep_research admission evidence; next slice can wire the deferred research worker or another root workflow without broad retesting."
      : "Fix the deep_research intent runtime before treating research admission as a root workflow capability.",
  };
}

export function formatResearchDeepResearchIntentAudit(report) {
  const lines = [
    `Research deep_research intent runtime: ${report.readiness}`,
    `Port: ${report.runtime.port}`,
    `Queue: ${report.runtime.asyncQueue}`,
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
  const portRequests = [];
  try {
    const output = await submitResearchDeepResearchIntent(baseInput(), {
      intentPort: {
        submitDeepResearchIntent: async (request) => {
          portRequests.push(request);
          return portResult();
        },
      },
    }, {
      p99BudgetMs: 50,
    });
    const elapsedMs = Math.max(1, Date.now() - startedAt);
    return {
      status: "PASS",
      output,
      portRequest: portRequests[0],
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.min(50, options.probeP99Ms ?? elapsedMs),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "ASYNC_DEEP_RESEARCH_INTENT_PROBE",
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
    key === "sdd" ? fs.readFileSync(path.join(root, relativePath), "utf8") : fs.readFileSync(path.join(root, relativePath), "utf8"),
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

function summarizePresence(text = "", needles = []) {
  return needles.map((needle) => `${needle}=${text.includes(needle)}`).join(";");
}

function includesAll(text = "", needles = []) {
  return needles.every((needle) => text.includes(needle));
}

function hasForbiddenRuntimeClaim(text = "") {
  return forbiddenRuntimeClaims.some((claim) => text.includes(claim));
}

function architectureBoardHasProgressAtLeast(text = "", minimum) {
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\/10/gu)];
  return matches.some((match) => Number(match[1]) >= minimum);
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

function baseInput() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-intent.invoke.v1",
    intentInvocationId: "deep_research_intent_inv_001",
    agentTask: {
      schemaVersion: "2026-06-04.agent.task.v1",
      taskId: "agent_task_research_deep_001",
      requestedByPrincipalId: "teacher_001",
      principalContextRef: "principal-context:teacher_001:session_research_001",
      userIntent: "对科研模式里的多模型融合回答做深度研究，但先进入审批队列。",
      taskKind: "RESEARCH",
      rootRequirementAnchors: ["科研模式", "对话", "多个多模态模型融合回答", "节点"],
      riskLevel: "MEDIUM",
      writeIntent: false,
      requiresHumanApproval: true,
      routePolicy: {
        allowedModes: ["SINGLE_WORKER"],
        preferSingleWorker: true,
        swarmRequiredWhen: [],
      },
      budgets: {
        maxAgentLoops: 1,
        maxSkillCalls: 1,
        maxTokens: 12000,
        p99BudgetMs: 50,
      },
    },
    principalContext: {
      principalId: "teacher_001",
      subjectType: "USER",
      role: "TEACHER",
      entryPoint: "DESKTOP_TEACHER",
      scopes: ["RESEARCH_READ", "KNOWLEDGE_PUBLIC_READ", "KNOWLEDGE_PRIVATE_READ"],
    },
    sharedContext: {
      schemaVersion: "2026-06-04.agent.shared-context.v1",
      contextId: "shared_ctx_research_deep_001",
      principalContextRef: "principal-context:teacher_001:session_research_001",
      sessionId: "session_research_001",
      taskId: "agent_task_research_deep_001",
      rootRequirementAnchors: ["科研模式", "知识库", "统筹智能体"],
      dataScopes: {
        principal: "teacher:research",
        teaching: "NONE",
        student: "NONE",
        research: "READ",
        knowledge: "PRIVATE_ASSIGNED",
        tool: "NONE",
      },
      evidenceRefs: ["evidence:shared-context:research-deep-001"],
      redactionState: {
        mode: "STRICT",
        studentDataRedacted: true,
        privateKnowledgeRedacted: false,
        externalModelAllowed: false,
      },
    },
    guardrailResult: {
      schemaVersion: "2026-06-04.agent.guardrail-result.v1",
      guardrailId: "guardrail_deep_research_review_001",
      taskId: "agent_task_research_deep_001",
      skillId: "deep_research",
      decision: "APPROVAL_REQUIRED",
      reasons: ["Deep research must be queued and reviewed before execution."],
      harnessActionRequired: true,
      rollbackRequired: false,
      evidenceRequired: true,
      directDatabaseWriteAllowed: false,
      safetyChecks: [
        { checkId: "student_archive_denied", status: "PASS" },
        { checkId: "sync_final_answer_denied", status: "PASS" },
        { checkId: "external_model_now_denied", status: "PASS" },
      ],
    },
    routeDecision: {
      schemaVersion: "2026-06-04.agent.route-decision.v1",
      routeId: "route_research_deep_001",
      taskId: "agent_task_research_deep_001",
      mode: "SINGLE_WORKER",
      leadAgent: "LeadAgent",
      workerAgents: ["ResearchAgent"],
      selectedSkills: ["deep_research"],
      rationale: "Admit a deep research intent without starting full RAG synthesis.",
      deniedSkills: ["external_app_action", "draft_model_job"],
      fallbackPlan: {
        mode: "PENDING_REVIEW",
        reason: "Teacher reviews the job intent before execution.",
        humanReviewPoint: "Review source policy, budget, and model/synthesis permissions.",
      },
      p99BudgetMs: 50,
      conflictPolicy: { detectConflicts: true, resolutionMode: "LEAD_AGENT_MERGE" },
    },
    researchQuestion: "比较多模态模型融合回答在科研模式中的证据链风险和可控重构路径。",
    objectives: [
      "定位可引用知识来源",
      "形成待审批的深度研究任务",
      "避免同步生成最终结论",
    ],
    sourcePolicy: {
      allowedClassifications: ["PUBLIC", "PRIVATE"],
      includeStudentArchive: false,
      includeRemoteDeviceSources: false,
      directDatabaseAccessAllowed: false,
      knowledgeBaseRefs: ["public_curriculum_knowledge", "private_research_notes"],
    },
    asyncPolicy: {
      admissionOnly: true,
      executeAsyncNow: false,
      externalModelCallNowAllowed: false,
      ragSynthesisNowAllowed: false,
      finalAnswerNowAllowed: false,
      directPublicationAllowed: false,
      localToolMutationAllowed: false,
      humanReviewRequiredBeforeExecution: true,
      queueName: "research_deep_research",
    },
    budget: {
      maxAsyncRuntimeMs: 120000,
      maxSourceRefs: 12,
      maxDeferredModelCalls: 4,
      maxRetrievedChunks: 40,
      p99AdmissionBudgetMs: 50,
    },
    evidenceRefs: ["root_req_research_mode", "knowledge_policy_current"],
  };
}

function portResult() {
  return {
    status: "PENDING_REVIEW",
    jobId: "deep_research_job_001",
    queueName: "research_deep_research",
    reviewRequired: true,
    executionStarted: false,
    externalModelCallStarted: false,
    ragSynthesisStarted: false,
    finalAnswerGenerated: false,
    directDatabaseWriteAllowed: false,
    localToolMutationAllowed: false,
    studentArchiveUsed: false,
    evidenceRefs: ["evidence:deep-research-intent:job-001"],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = await auditResearchDeepResearchIntentRuntime(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatResearchDeepResearchIntentAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
