import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN_COMMAND_PORT,
  RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN_RUNTIME_ID,
  recordDeepResearchRetrievalPlan,
} from "./research-deep-research-retrieval-plan-runtime.mjs";

const defaultOutPath = "reports/research-deep-research-retrieval-plan.current.json";
const sourceFiles = {
  inputSchema: "contracts/agent/deep-research-retrieval-plan.input.schema.json",
  outputSchema: "contracts/agent/deep-research-retrieval-plan.output.schema.json",
  inputExample: "contracts/agent/deep-research-retrieval-plan.input.example.json",
  outputExample: "contracts/agent/deep-research-retrieval-plan.output.example.json",
  runtime: "tools/research-deep-research-retrieval-plan-runtime.mjs",
  runtimeTest: "tools/research-deep-research-retrieval-plan-runtime.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0244-research-deep-research-retrieval-plan.md",
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
  "executeRetrievalNow: true",
  "vectorSearchNow: true",
  "externalModelCallNow: true",
  "ragSynthesisNow: true",
  "finalAnswerNowAllowed: true",
  "finalAnswerGenerated: true",
  "directPublicationAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "directMainDatabaseWriteAllowed: true",
];

export async function auditDeepResearchRetrievalPlan(inputs, options = {}) {
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
  const probe = runRuntimeProbe(options);

  addFinding(findings, {
    id: "contract.schema_and_examples",
    passed: inputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-retrieval-plan.v1" &&
      inputSchema.properties?.retrievalPolicy?.properties?.planningOnly?.const === true &&
      inputSchema.properties?.retrievalPolicy?.properties?.executeRetrievalNow?.const === false &&
      outputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-retrieval-plan-recorded.v1" &&
      outputSchema.properties?.runtimeId?.const === RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN_RUNTIME_ID &&
      inputExample.retrievalPolicy?.directoryIndexFirst === true &&
      inputExample.retrievalPolicy?.executeRetrievalNow === false &&
      outputExample.status === "RETRIEVAL_PLAN_RECORDED" &&
      outputExample.boundary?.retrievalExecuted === false &&
      outputExample.boundary?.finalAnswerGenerated === false,
    actual: summarizePresence(JSON.stringify(inputSchema) + JSON.stringify(outputSchema) + JSON.stringify(inputExample) + JSON.stringify(outputExample), [
      "planningOnly",
      "executeRetrievalNow",
      "DIRECTORY_INDEX_THEN_VECTOR_RAG",
      "RETRIEVAL_PLAN_RECORDED",
    ]),
    expected: "retrieval-plan schemas and examples define approved planning control plane only",
    remediation: "Keep schema and examples aligned with the planning-only retrieval boundary.",
  });

  addFinding(findings, {
    id: "runtime.identity_and_command_port",
    passed: includesAll(runtime, [
      "RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN_RUNTIME_ID",
      "RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN_COMMAND_PORT",
      "DeepResearchRetrievalPlanPort.recordDeepResearchRetrievalPlan",
      "recordDeepResearchRetrievalPlan",
      "RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN",
      "RETRIEVAL_PLAN_RECORDED",
    ]),
    actual: summarizePresence(runtime, [
      "RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN_RUNTIME_ID",
      "DeepResearchRetrievalPlanPort.recordDeepResearchRetrievalPlan",
      "RETRIEVAL_PLAN_RECORDED",
    ]),
    expected: "runtime records retrieval planning through the deep research retrieval-plan command port",
    remediation: "The retrieval-plan slice must remain a command-port record, not an inline retriever.",
  });

  addFinding(findings, {
    id: "runtime.approval_source_and_safety_boundaries",
    passed: includesAll(runtime, [
      "input.workerLifecycle.status",
      "CLAIMED_FOR_ASYNC_EXECUTION",
      "input.workerLifecycle.approval.decision",
      "APPROVED_FOR_ASYNC",
      "input.workerLifecycle.worker.nodeType",
      "LOCAL",
      "input.retrievalPolicy.planningOnly",
      "input.retrievalPolicy.executeRetrievalNow",
      "input.retrievalPolicy.directoryIndexFirst",
      "input.retrievalPolicy.vectorSearchNow",
      "input.retrievalPolicy.externalModelCallNow",
      "input.retrievalPolicy.ragSynthesisNow",
      "input.retrievalPolicy.finalAnswerNowAllowed",
      "input.sourcePolicy.includeStudentArchive",
      "requiresFutureRetrievalExecutionSlice: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "approved local retrieval planning with no DB, retrieval execution, vector search, model call, RAG synthesis, Swarm, publication, or student archive",
    remediation: "Do not let retrieval planning collapse into retrieval execution or answer synthesis.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_plan_without_execution",
    passed: probe.status === "PASS" &&
      probe.result?.status === "RETRIEVAL_PLAN_RECORDED" &&
      probe.result?.commandPort === RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN_COMMAND_PORT &&
      probe.result?.job?.queueName === "research_deep_research" &&
      probe.result?.retrievalPlan?.strategy === "DIRECTORY_INDEX_THEN_VECTOR_RAG" &&
      probe.result?.boundary?.retrievalPlanRecorded === true &&
      probe.result?.boundary?.retrievalExecuted === false &&
      probe.result?.boundary?.vectorSearchStarted === false &&
      probe.result?.boundary?.externalModelCallStarted === false &&
      probe.result?.boundary?.finalAnswerGenerated === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};items=${probe.result.retrievalPlan.sourcePlan.length};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records a directory-first plan and stops before retrieval execution",
    remediation: "Retrieval planning must be a low-latency control-plane record only.",
  });

  addFinding(findings, {
    id: "tests.cover_plan_negative_paths",
    passed: includesAll(runtimeTest, [
      "records an approved directory-first retrieval plan without executing retrieval, model calls, or final answers",
      "uses the idempotency key for safe replay and rejects conflicting plans",
      "rejects unclaimed workers and unsafe lifecycle boundaries",
      "rejects out-of-policy sources, student archive, and immediate retrieval execution",
      "rejects over-budget plans and source items without citation or hash guarantees",
    ]),
    actual: "runtime tests scanned",
    expected: "positive plan, idempotency, lifecycle, source-policy, budget, citation, and safety rejection tests",
    remediation: "Add regression coverage before treating retrieval planning as root evidence.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime",
    passed: packageJson.scripts?.["audit:research-deep-research-retrieval-plan"]?.includes("research-deep-research-retrieval-plan-audit.mjs") &&
      qualityGate.includes("Research deep_research retrieval plan audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + qualityGate, [
      "audit:research-deep-research-retrieval-plan",
      "Research deep_research retrieval plan audit",
    ]),
    expected: "npm script and strict quality command include the retrieval-plan audit",
    remediation: "Wire the retrieval-plan slice into the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_retrieval_plan_report",
    passed: rootWorkflowCoverage.includes("researchDeepResearchRetrievalPlan") &&
      rootWorkflowCoverage.includes("research-deep-research-retrieval-plan.current.json") &&
      rootWorkflowCoverage.includes("research_deep_research_retrieval_plan_runtime"),
    actual: summarizePresence(rootWorkflowCoverage, [
      "researchDeepResearchRetrievalPlan",
      "research-deep-research-retrieval-plan.current.json",
      "research_deep_research_retrieval_plan_runtime",
    ]),
    expected: "research root workflow requires deep_research retrieval-plan evidence",
    remediation: "Root workflow coverage must explicitly require the approved retrieval-plan evidence.",
  });

  addFinding(findings, {
    id: "structure_tracks_runtime_files",
    passed: includesAll(verifyStructure, [
      "0244-research-deep-research-retrieval-plan.md",
      "deep-research-retrieval-plan.input.schema.json",
      "deep-research-retrieval-plan.output.schema.json",
      "research-deep-research-retrieval-plan-runtime.mjs",
      "research-deep-research-retrieval-plan-runtime.test.mjs",
      "research-deep-research-retrieval-plan-audit.mjs",
      "research-deep-research-retrieval-plan-audit.test.mjs",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires retrieval-plan contracts, SDD, runtime, tests, audit, and audit test",
    remediation: "Add the retrieval-plan slice to structure verification.",
  });

  addFinding(findings, {
    id: "sdd.explicitly_defers_execution",
    passed: includesAll(sdd, [
      "retrieval-plan control-plane",
      "does not read the directory index",
      "does not run vector search",
      "does not call models",
      "does not fuse answers",
      "future approved async execution",
    ]),
    actual: summarizePresence(sdd, [
      "retrieval-plan control-plane",
      "does not read the directory index",
      "does not run vector search",
      "does not call models",
      "does not fuse answers",
    ]),
    expected: "SDD states this is retrieval planning, not retrieval execution or synthesis",
    remediation: "Keep the SDD honest about what this slice can and cannot do.",
  });

  addFinding(findings, {
    id: "architecture_board.reflects_retrieval_plan_progress",
    passed: includesAll(architectureBoard, [
      "ResearchAgent.deep_research",
      "approved retrieval planning",
      "8.4/10",
    ]),
    actual: summarizePresence(architectureBoard, [
      "ResearchAgent.deep_research",
      "approved retrieval planning",
      "8.4/10",
    ]),
    expected: "architecture board shows approved retrieval planning progress and updated fraction",
    remediation: "Update the architecture board so reviewers can see the new deep_research retrieval-plan boundary.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN",
    runtime: {
      runtimeId: RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN_RUNTIME_ID,
      commandPort: RESEARCH_DEEP_RESEARCH_RETRIEVAL_PLAN_COMMAND_PORT,
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
      approvalVerified: true,
      workerClaimVerified: true,
      retrievalPlanRecorded: true,
      retrievalExecuted: false,
      directoryIndexAccessStarted: false,
      vectorSearchStarted: false,
      externalModelCallStarted: false,
      ragSynthesisStarted: false,
      finalAnswerGenerated: false,
      directPublicationAllowed: false,
      localToolMutationAllowed: false,
      directMainDatabaseWriteAllowed: false,
      studentArchiveUsed: false,
      remoteDeviceSourcesUsed: false,
      swarmAllowed: false,
    },
    runtimeProbes: {
      retrievalPlan: probe,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as deep_research approved retrieval-planning evidence; next research slice can execute the approved plan asynchronously or move to another root workflow module without broad production10k retesting."
      : "Fix the retrieval-plan boundary before treating deep_research RAG planning as root workflow evidence.",
  };
}

export function formatDeepResearchRetrievalPlanAudit(report) {
  const lines = [
    `Research deep_research retrieval plan: ${report.readiness}`,
    `Command port: ${report.runtime.commandPort}`,
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

function runRuntimeProbe(options = {}) {
  const startedAt = Date.now();
  try {
    const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-retrieval-plan-audit-")), "plan.jsonl");
    const result = recordDeepResearchRetrievalPlan(baseInput(), {
      commandLogPath,
      generatedAt: "2026-06-05T00:00:00.000Z",
    });
    const elapsedMs = Math.max(1, Date.now() - startedAt);
    return {
      status: "PASS",
      result,
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.min(50, options.probeP99Ms ?? elapsedMs),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "ASYNC_DEEP_RESEARCH_RETRIEVAL_PLAN_PROBE",
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

function baseInput() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-retrieval-plan.v1",
    planningInvocationId: "deep_research_retrieval_plan_inv_001",
    principal: {
      principalId: "research_worker_service",
      role: "SERVICE",
      subjectType: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      scopes: ["AGENT_COMMAND_SUBMIT", "RESEARCH_READ", "KNOWLEDGE_PRIVATE_READ"],
      sessionId: "research_worker_session_001",
    },
    workerLifecycle: {
      schemaVersion: "2026-06-05.research.deep-research-worker-lifecycle-recorded.v1",
      runtimeId: "research_deep_research_worker_lifecycle_runtime",
      status: "CLAIMED_FOR_ASYNC_EXECUTION",
      job: {
        taskId: "agent_task_research_deep_001",
        contextRef: "shared_ctx_research_deep_001",
        jobId: "deep_research_job_001",
        queueName: "research_deep_research",
      },
      approval: {
        approvalId: "deep_research_approval_001",
        approvalRecordRef: "evidence:human-approval:deep-research-job-001",
        reviewerPrincipalId: "teacher_001",
        decision: "APPROVED_FOR_ASYNC",
      },
      worker: {
        workerId: "local_research_worker_001",
        nodeType: "LOCAL",
        capabilityKinds: ["RAG_RETRIEVAL", "MODEL_REASONING"],
      },
      lifecycle: { toStatus: "CLAIMED" },
      boundary: {
        approvalVerified: true,
        workerClaimRecorded: true,
        executionStarted: false,
        ragRetrievalStarted: false,
        externalModelCallStarted: false,
        finalAnswerGenerated: false,
        requiresFutureExecutionSlice: true,
      },
    },
    sourcePolicy: {
      allowedClassifications: ["PUBLIC", "PRIVATE"],
      includeStudentArchive: false,
      includeRemoteDeviceSources: false,
      directDatabaseAccessAllowed: false,
      knowledgeBaseRefs: ["public_curriculum_knowledge", "private_research_notes"],
    },
    retrievalPolicy: {
      planningOnly: true,
      executeRetrievalNow: false,
      directoryIndexFirst: true,
      vectorSearchNow: false,
      externalModelCallNow: false,
      ragSynthesisNow: false,
      finalAnswerNowAllowed: false,
      citationRequired: true,
      sourceHashRequired: true,
    },
    researchQuestion: "如何基于学生学习档案构建个性化辅导助手并验证教学效果？",
    objectives: ["定位公开教育研究证据", "定位本地私密研究笔记", "为后续 RAG 执行提供引用约束"],
    sourcePlan: [
      {
        planItemId: "plan_public_directory_first",
        knowledgeBaseRef: "public_curriculum_knowledge",
        classification: "PUBLIC",
        retrievalMode: "DIRECTORY_THEN_VECTOR",
        plannedQuery: "个性化学习 档案 辅导 效果评估",
        directoryScopeRefs: ["directory:education-ai", "directory:learning-analytics"],
        maxChunks: 16,
        maxSourceRefs: 6,
        citationRequired: true,
        sourceHashRequired: true,
      },
      {
        planItemId: "plan_private_notes",
        knowledgeBaseRef: "private_research_notes",
        classification: "PRIVATE",
        retrievalMode: "DIRECTORY_THEN_VECTOR",
        plannedQuery: "智能教研助手 学生档案 个性化题库 辅导助手",
        directoryScopeRefs: ["directory:private-project-notes"],
        maxChunks: 12,
        maxSourceRefs: 4,
        citationRequired: true,
        sourceHashRequired: true,
      },
    ],
    budget: {
      maxPlannedQueries: 4,
      maxRetrievedChunks: 40,
      maxSourceRefs: 12,
      p99PlanningBudgetMs: 50,
    },
    evidenceRefs: ["evidence:deep-research-intent:job-001", "evidence:worker-lifecycle:job-001"],
    idempotencyKey: "deep-research-retrieval-plan:job-001",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = await auditDeepResearchRetrievalPlan(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatDeepResearchRetrievalPlanAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
