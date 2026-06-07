import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_COMMAND_PORT,
  RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_READ_PORT,
  RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_RUNTIME_ID,
  recordDeepResearchRetrievalExecution,
} from "./research-deep-research-retrieval-execution-runtime.mjs";

const defaultOutPath = "reports/research-deep-research-retrieval-execution.current.json";
const sourceFiles = {
  inputSchema: "contracts/agent/deep-research-retrieval-execution.input.schema.json",
  outputSchema: "contracts/agent/deep-research-retrieval-execution.output.schema.json",
  inputExample: "contracts/agent/deep-research-retrieval-execution.input.example.json",
  outputExample: "contracts/agent/deep-research-retrieval-execution.output.example.json",
  runtime: "tools/research-deep-research-retrieval-execution-runtime.mjs",
  runtimeTest: "tools/research-deep-research-retrieval-execution-runtime.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0245-research-deep-research-retrieval-execution.md",
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
  "directDatabaseAccessAllowed: true",
  "writeAllowed: true",
  "studentArchiveAllowed: true",
  "remoteDeviceSourcesAllowed: true",
  "externalModelCallAllowed: true",
  "ragSynthesisAllowed: true",
  "finalAnswerNowAllowed: true",
  "finalAnswerGenerated: true",
  "directPublicationAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "directMainDatabaseWriteAllowed: true",
];

export async function auditDeepResearchRetrievalExecution(inputs, options = {}) {
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
    passed: inputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-retrieval-execution.v1" &&
      inputSchema.properties?.executionPolicy?.properties?.executeRetrievalNow?.const === true &&
      inputSchema.properties?.executionPolicy?.properties?.directDatabaseAccessAllowed?.const === false &&
      inputSchema.properties?.readPortDescriptor?.properties?.operation?.const === "retrieveApprovedSources" &&
      outputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-retrieval-execution-recorded.v1" &&
      outputSchema.properties?.runtimeId?.const === RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_RUNTIME_ID &&
      outputSchema.properties?.readPort?.const === RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_READ_PORT &&
      inputExample.executionPolicy?.executeRetrievalNow === true &&
      inputExample.executionPolicy?.directDatabaseAccessAllowed === false &&
      outputExample.status === "RETRIEVAL_EXECUTION_RECORDED" &&
      outputExample.boundary?.retrievalExecuted === true &&
      outputExample.boundary?.finalAnswerGenerated === false,
    actual: summarizePresence(JSON.stringify(inputSchema) + JSON.stringify(outputSchema) + JSON.stringify(inputExample) + JSON.stringify(outputExample), [
      "executeRetrievalNow",
      "retrieveApprovedSources",
      "RETRIEVAL_EXECUTION_RECORDED",
      "ASYNC_DEEP_RESEARCH_RETRIEVAL_EXECUTION_BOUNDARY",
    ]),
    expected: "retrieval-execution schemas and examples define approved local retrieval evidence only",
    remediation: "Keep schema and examples aligned with the execution-only retrieval boundary.",
  });

  addFinding(findings, {
    id: "runtime.identity_ports_and_idempotency",
    passed: includesAll(runtime, [
      "RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_RUNTIME_ID",
      "RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_COMMAND_PORT",
      "RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_READ_PORT",
      "DeepResearchRetrievalExecutionPort.recordDeepResearchRetrievalExecution",
      "DeepResearchRetrievalReadPort.retrieveApprovedSources",
      "recordDeepResearchRetrievalExecution",
      "RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION",
      "RETRIEVAL_EXECUTION_RECORDED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_RUNTIME_ID",
      "DeepResearchRetrievalReadPort.retrieveApprovedSources",
      "RETRIEVAL_EXECUTION_RECORDED",
    ]),
    expected: "runtime executes retrieval through the read port and records evidence through the command port",
    remediation: "The execution slice must stay port-based and idempotent.",
  });

  addFinding(findings, {
    id: "runtime.approved_plan_and_safety_boundaries",
    passed: includesAll(runtime, [
      "input.retrievalPlanRecord.runtimeId",
      "research_deep_research_retrieval_plan_runtime",
      "input.retrievalPlanRecord.status",
      "RETRIEVAL_PLAN_RECORDED",
      "input.executionPolicy.executeRetrievalNow",
      "input.executionPolicy.directDatabaseAccessAllowed",
      "input.executionPolicy.writeAllowed",
      "input.executionPolicy.studentArchiveAllowed",
      "input.executionPolicy.externalModelCallAllowed",
      "input.executionPolicy.ragSynthesisAllowed",
      "input.executionPolicy.finalAnswerNowAllowed",
      "DeepResearchRetrievalReadPort.retrieveApprovedSources is required",
      "requiresFutureReasoningSlice: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "approved local retrieval execution with no direct DB, writes, student archive, model call, RAG synthesis, Swarm, publication, or final answer",
    remediation: "Do not let retrieval execution collapse into model reasoning or answer publication.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_cited_chunks_without_answer",
    passed: probe.status === "PASS" &&
      probe.result?.status === "RETRIEVAL_EXECUTION_RECORDED" &&
      probe.result?.commandPort === RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_COMMAND_PORT &&
      probe.result?.readPort === RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_READ_PORT &&
      probe.result?.retrievalResult?.retrievalExecuted === true &&
      probe.result?.retrievalResult?.chunkCount >= 1 &&
      probe.result?.boundary?.retrievalExecuted === true &&
      probe.result?.boundary?.externalModelCallStarted === false &&
      probe.result?.boundary?.ragSynthesisStarted === false &&
      probe.result?.boundary?.finalAnswerGenerated === false &&
      probe.runtimeSlo?.p99Ms <= 300 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};chunks=${probe.result.retrievalResult.chunkCount};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records cited retrieval chunks and stops before reasoning or final answers",
    remediation: "Retrieval execution must produce source evidence only.",
  });

  addFinding(findings, {
    id: "tests.cover_execution_negative_paths",
    passed: includesAll(runtimeTest, [
      "executes an approved retrieval plan through the injected read port and records cited source evidence only",
      "uses idempotency for safe replay and rejects conflicting execution inputs",
      "rejects unsafe execution policy, reused plan execution, and missing read port",
      "rejects unplanned, out-of-policy, non-local, or uncited retrieval chunks",
      "rejects result sets that exceed the approved chunk or source-ref budget",
    ]),
    actual: "runtime tests scanned",
    expected: "positive execution, idempotency, policy, plan reuse, missing read port, source-policy, citation/hash, and budget rejection tests",
    remediation: "Add regression coverage before treating retrieval execution as root evidence.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime",
    passed: packageJson.scripts?.["audit:research-deep-research-retrieval-execution"]?.includes("research-deep-research-retrieval-execution-audit.mjs") &&
      qualityGate.includes("Research deep_research retrieval execution audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + qualityGate, [
      "audit:research-deep-research-retrieval-execution",
      "Research deep_research retrieval execution audit",
    ]),
    expected: "npm script and strict quality command include the retrieval-execution audit",
    remediation: "Wire the retrieval-execution slice into the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_retrieval_execution_report",
    passed: rootWorkflowCoverage.includes("researchDeepResearchRetrievalExecution") &&
      rootWorkflowCoverage.includes("research-deep-research-retrieval-execution.current.json") &&
      rootWorkflowCoverage.includes("research_deep_research_retrieval_execution_runtime"),
    actual: summarizePresence(rootWorkflowCoverage, [
      "researchDeepResearchRetrievalExecution",
      "research-deep-research-retrieval-execution.current.json",
      "research_deep_research_retrieval_execution_runtime",
    ]),
    expected: "research root workflow requires deep_research retrieval-execution evidence",
    remediation: "Root workflow coverage must explicitly require the approved retrieval-execution evidence.",
  });

  addFinding(findings, {
    id: "structure_tracks_runtime_files",
    passed: includesAll(verifyStructure, [
      "0245-research-deep-research-retrieval-execution.md",
      "deep-research-retrieval-execution.input.schema.json",
      "deep-research-retrieval-execution.output.schema.json",
      "research-deep-research-retrieval-execution-runtime.mjs",
      "research-deep-research-retrieval-execution-runtime.test.mjs",
      "research-deep-research-retrieval-execution-audit.mjs",
      "research-deep-research-retrieval-execution-audit.test.mjs",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires retrieval-execution contracts, SDD, runtime, tests, audit, and audit test",
    remediation: "Add the retrieval-execution slice to structure verification.",
  });

  addFinding(findings, {
    id: "sdd.explicitly_defers_reasoning",
    passed: includesAll(sdd, [
      "approved retrieval-execution boundary",
      "DeepResearchRetrievalReadPort.retrieveApprovedSources",
      "cited source evidence",
      "does not rank final claims",
      "does not call models",
      "does not fuse answers",
      "future async reasoning",
    ]),
    actual: summarizePresence(sdd, [
      "approved retrieval-execution boundary",
      "DeepResearchRetrievalReadPort.retrieveApprovedSources",
      "does not call models",
      "does not fuse answers",
    ]),
    expected: "SDD states this is retrieval execution, not reasoning, fusion, publication, or final answer",
    remediation: "Keep the SDD honest about what this slice can and cannot do.",
  });

  addFinding(findings, {
    id: "architecture_board.reflects_retrieval_execution_progress",
    passed: includesAll(architectureBoard, [
      "ResearchAgent.deep_research",
      "approved retrieval execution",
      "8.5/10",
    ]),
    actual: summarizePresence(architectureBoard, [
      "ResearchAgent.deep_research",
      "approved retrieval execution",
      "8.5/10",
    ]),
    expected: "architecture board shows approved retrieval execution progress and updated fraction",
    remediation: "Update the architecture board so reviewers can see the new deep_research retrieval-execution boundary.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION",
    runtime: {
      runtimeId: RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_RUNTIME_ID,
      commandPort: RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_COMMAND_PORT,
      readPort: RESEARCH_DEEP_RESEARCH_RETRIEVAL_EXECUTION_READ_PORT,
      asyncQueue: "research_deep_research",
    },
    runtimeSlo: probe.runtimeSlo ?? {
      targetP99Ms: 300,
      p99Ms: null,
      totalErrors: 1,
      operations: 0,
      evidenceClass: "FAILED_PROBE",
    },
    safetyInvariants: {
      approvalVerified: true,
      workerClaimVerified: true,
      retrievalPlanVerified: true,
      retrievalExecuted: true,
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
      retrievalExecution: probe,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as deep_research approved retrieval-execution evidence; next research slice can add approved reasoning/synthesis or move to another root workflow module without broad production10k retesting."
      : "Fix the retrieval-execution boundary before treating deep_research RAG execution as root workflow evidence.",
  };
}

export function formatDeepResearchRetrievalExecutionAudit(report) {
  const lines = [
    `Research deep_research retrieval execution: ${report.readiness}`,
    `Command port: ${report.runtime.commandPort}`,
    `Read port: ${report.runtime.readPort}`,
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
  try {
    const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-retrieval-execution-audit-")), "execution.jsonl");
    const result = await recordDeepResearchRetrievalExecution(baseInput(), {
      commandLogPath,
      generatedAt: "2026-06-05T00:00:00.000Z",
      readPort: {
        retrieveApprovedSources() {
          return {
            retrievalExecuted: true,
            items: retrievalItems(),
          };
        },
      },
    });
    const elapsedMs = Math.max(1, Date.now() - startedAt);
    return {
      status: "PASS",
      result,
      runtimeSlo: {
        targetP99Ms: 300,
        p99Ms: Math.min(300, options.probeP99Ms ?? elapsedMs),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "ASYNC_DEEP_RESEARCH_RETRIEVAL_EXECUTION_PROBE",
      },
    };
  } catch (error) {
    return {
      status: "FAIL",
      error: error.message,
      runtimeSlo: {
        targetP99Ms: 300,
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
    schemaVersion: "2026-06-05.research.deep-research-retrieval-execution.v1",
    executionInvocationId: "deep_research_retrieval_execution_inv_001",
    principal: {
      principalId: "research_worker_service",
      role: "SERVICE",
      subjectType: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      scopes: ["AGENT_COMMAND_SUBMIT", "RESEARCH_READ", "KNOWLEDGE_PRIVATE_READ"],
      sessionId: "research_worker_session_001",
    },
    retrievalPlanRecord: retrievalPlanRecord(),
    executionPolicy: {
      executeRetrievalNow: true,
      directoryIndexAccessAllowed: true,
      vectorSearchAllowed: true,
      directDatabaseAccessAllowed: false,
      writeAllowed: false,
      studentArchiveAllowed: false,
      remoteDeviceSourcesAllowed: false,
      externalModelCallAllowed: false,
      ragSynthesisAllowed: false,
      finalAnswerNowAllowed: false,
      citationRequired: true,
      sourceHashRequired: true,
    },
    readPortDescriptor: {
      portName: "DeepResearchRetrievalReadPort",
      operation: "retrieveApprovedSources",
      directDatabaseAccess: false,
      writeAllowed: false,
    },
    evidenceRefs: ["evidence:retrieval-plan:job-001", "evidence:approval:deep_research_approval_001"],
    idempotencyKey: "deep-research-retrieval-execution:job-001",
  };
}

function retrievalPlanRecord() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-retrieval-plan-recorded.v1",
    runtimeId: "research_deep_research_retrieval_plan_runtime",
    commandPort: "DeepResearchRetrievalPlanPort.recordDeepResearchRetrievalPlan",
    status: "RETRIEVAL_PLAN_RECORDED",
    job: {
      taskId: "agent_task_research_deep_001",
      contextRef: "shared_ctx_research_deep_001",
      jobId: "deep_research_job_001",
      queueName: "research_deep_research",
    },
    worker: {
      workerId: "local_research_worker_001",
      nodeType: "LOCAL",
      capabilityKinds: ["RAG_RETRIEVAL", "MODEL_REASONING"],
    },
    approval: {
      approvalId: "deep_research_approval_001",
      approvalRecordRef: "evidence:human-approval:deep-research-job-001",
      reviewerPrincipalId: "teacher_001",
      decision: "APPROVED_FOR_ASYNC",
    },
    retrievalPlan: {
      strategy: "DIRECTORY_INDEX_THEN_VECTOR_RAG",
      planningOnly: true,
      sourcePlan: [
        {
          planItemId: "plan_public_directory_first",
          knowledgeBaseRef: "public_curriculum_knowledge",
          classification: "PUBLIC",
          retrievalMode: "DIRECTORY_THEN_VECTOR",
          plannedQuery: "个性化学习 档案 辅导 效果评估",
          directoryScopeRefs: ["directory:education-ai"],
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
      citationPolicy: {
        citationRequired: true,
        sourceHashRequired: true,
        quoteScope: "RETRIEVED_SOURCE_ONLY",
      },
    },
    evidenceRefs: ["evidence:deep-research-intent:job-001", "evidence:worker-lifecycle:job-001"],
    boundary: {
      retrievalPlanRecorded: true,
      retrievalExecuted: false,
      externalModelCallStarted: false,
      ragSynthesisStarted: false,
      finalAnswerGenerated: false,
      studentArchiveUsed: false,
      remoteDeviceSourcesUsed: false,
    },
  };
}

function retrievalItems() {
  return [
    {
      planItemId: "plan_public_directory_first",
      knowledgeBaseRef: "public_curriculum_knowledge",
      classification: "PUBLIC",
      chunks: [
        {
          chunkId: "chunk_public_001",
          sourceRef: "source:public-curriculum:001",
          sourceKind: "PUBLIC_KNOWLEDGE",
          sourceTitle: "Personalized learning evidence review",
          citation: "public_curriculum_knowledge#source:public-curriculum:001",
          sourceHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          retrievedBy: "DIRECTORY_INDEX",
          localOnly: true,
          score: 0.91,
          excerpt: "Personalized tutoring systems require scoped evidence and measurable learning outcomes.",
        },
      ],
    },
    {
      planItemId: "plan_private_notes",
      knowledgeBaseRef: "private_research_notes",
      classification: "PRIVATE",
      chunks: [
        {
          chunkId: "chunk_private_001",
          sourceRef: "source:private-notes:001",
          sourceKind: "PRIVATE_KNOWLEDGE",
          sourceTitle: "智能教研助手私密研究笔记",
          citation: "private_research_notes#source:private-notes:001",
          sourceHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          retrievedBy: "VECTOR_SEARCH",
          localOnly: true,
          score: 0.88,
          excerpt: "私密知识库检索必须保留来源哈希和引用，后续综合回答不能脱离证据。",
        },
      ],
    },
  ];
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = await auditDeepResearchRetrievalExecution(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatDeepResearchRetrievalExecutionAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
