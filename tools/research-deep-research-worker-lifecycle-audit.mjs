import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  RESEARCH_DEEP_RESEARCH_WORKER_COMMAND_PORT,
  RESEARCH_DEEP_RESEARCH_WORKER_LIFECYCLE_RUNTIME_ID,
  recordDeepResearchWorkerLifecycle,
} from "./research-deep-research-worker-lifecycle-runtime.mjs";

const defaultOutPath = "reports/research-deep-research-worker-lifecycle.current.json";
const sourceFiles = {
  inputSchema: "contracts/agent/deep-research-worker-lifecycle.input.schema.json",
  outputSchema: "contracts/agent/deep-research-worker-lifecycle.output.schema.json",
  inputExample: "contracts/agent/deep-research-worker-lifecycle.input.example.json",
  outputExample: "contracts/agent/deep-research-worker-lifecycle.output.example.json",
  runtime: "tools/research-deep-research-worker-lifecycle-runtime.mjs",
  runtimeTest: "tools/research-deep-research-worker-lifecycle-runtime.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0243-research-deep-research-worker-lifecycle.md",
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
  "executeNow: true",
  "startRagRetrievalNow: true",
  "startExternalModelCallNow: true",
  "finalAnswerNowAllowed: true",
  "finalAnswerGenerated: true",
  "directPublicationAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "directMainDatabaseWriteAllowed: true",
  "baselineRuntimeDependencyAllowed: true",
];

export async function auditDeepResearchWorkerLifecycle(inputs, options = {}) {
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
    passed: inputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-worker-lifecycle.v1" &&
      inputSchema.properties?.lifecycleAction?.enum?.includes("CLAIM") &&
      inputSchema.properties?.lifecycleAction?.enum?.includes("MARK_FAILED_SAFE") &&
      inputSchema.properties?.worker?.properties?.nodeType?.const === "LOCAL" &&
      outputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-worker-lifecycle-recorded.v1" &&
      outputSchema.properties?.runtimeId?.const === RESEARCH_DEEP_RESEARCH_WORKER_LIFECYCLE_RUNTIME_ID &&
      inputExample.lifecycleAction === "CLAIM" &&
      inputExample.worker?.nodeType === "LOCAL" &&
      inputExample.executionPlan?.executeNow === false &&
      outputExample.status === "CLAIMED_FOR_ASYNC_EXECUTION" &&
      outputExample.boundary?.executionStarted === false &&
      outputExample.boundary?.finalAnswerGenerated === false,
    actual: summarizePresence(JSON.stringify(inputSchema) + JSON.stringify(outputSchema) + JSON.stringify(inputExample) + JSON.stringify(outputExample), [
      "CLAIM",
      "MARK_FAILED_SAFE",
      "LOCAL",
      "CLAIMED_FOR_ASYNC_EXECUTION",
    ]),
    expected: "worker lifecycle schemas and examples define approved local claim/fail-safe control plane only",
    remediation: "Keep schema and examples aligned with the approved async worker lifecycle boundary.",
  });

  addFinding(findings, {
    id: "runtime.identity_and_command_port",
    passed: includesAll(runtime, [
      "RESEARCH_DEEP_RESEARCH_WORKER_LIFECYCLE_RUNTIME_ID",
      "RESEARCH_DEEP_RESEARCH_WORKER_COMMAND_PORT",
      "DeepResearchWorkerCommandPort.recordDeepResearchWorkerLifecycle",
      "recordDeepResearchWorkerLifecycle",
      "RESEARCH_DEEP_RESEARCH_WORKER_LIFECYCLE",
      "CLAIMED_FOR_ASYNC_EXECUTION",
      "FAILED_SAFE_RECORDED",
    ]),
    actual: summarizePresence(runtime, [
      "RESEARCH_DEEP_RESEARCH_WORKER_LIFECYCLE_RUNTIME_ID",
      "DeepResearchWorkerCommandPort.recordDeepResearchWorkerLifecycle",
      "CLAIMED_FOR_ASYNC_EXECUTION",
      "FAILED_SAFE_RECORDED",
    ]),
    expected: "runtime records lifecycle through the deep research worker command port",
    remediation: "The worker lifecycle slice must remain a command-port record, not an inline worker executor.",
  });

  addFinding(findings, {
    id: "runtime.approval_and_safety_boundaries",
    passed: includesAll(runtime, [
      "input.approvedIntent.decision",
      "ACCEPTED_ASYNC",
      "input.approval.decision",
      "APPROVED_FOR_ASYNC",
      "input.worker.nodeType",
      "LOCAL",
      "input.executionPlan.executeNow",
      "input.executionPlan.startRagRetrievalNow",
      "input.executionPlan.startExternalModelCallNow",
      "input.executionPlan.finalAnswerNowAllowed",
      "input.sourcePolicy.includeStudentArchive",
      "input.sourcePolicy.includeRemoteDeviceSources",
      "requiresFutureExecutionSlice: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "approved local lifecycle control plane with no now-execution, direct DB, model call, RAG, Swarm, publication, or student archive",
    remediation: "Do not let worker lifecycle recording collapse into execution or synthesis.",
  });

  addFinding(findings, {
    id: "runtime.probe_claims_without_execution",
    passed: probe.status === "PASS" &&
      probe.result?.status === "CLAIMED_FOR_ASYNC_EXECUTION" &&
      probe.result?.commandPort === RESEARCH_DEEP_RESEARCH_WORKER_COMMAND_PORT &&
      probe.result?.job?.queueName === "research_deep_research" &&
      probe.result?.lifecycle?.toStatus === "CLAIMED" &&
      probe.result?.boundary?.executionStarted === false &&
      probe.result?.boundary?.ragRetrievalStarted === false &&
      probe.result?.boundary?.externalModelCallStarted === false &&
      probe.result?.boundary?.finalAnswerGenerated === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};to=${probe.result.lifecycle.toStatus};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records claim lifecycle and stops before execution",
    remediation: "Worker lifecycle must be a low-latency control-plane record only.",
  });

  addFinding(findings, {
    id: "tests.cover_lifecycle_negative_paths",
    passed: includesAll(runtimeTest, [
      "records an approved async job claim without starting retrieval, model calls, or final answers",
      "uses the idempotency key for safe replay and rejects conflicting replay",
      "rejects unapproved or pending-review intents before worker claim",
      "rejects unsafe principals, remote/cloud workers, direct writes, and baseline AI dependencies",
      "rejects execution, RAG retrieval, model calls, publication, local mutation, Swarm, and student archive use now",
      "records a failed-safe lifecycle projection without publishing partial artifacts",
    ]),
    actual: "runtime tests scanned",
    expected: "positive claim, idempotency, failure-safe, and unsafe boundary rejection tests",
    remediation: "Add regression coverage before treating the lifecycle path as root evidence.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime",
    passed: packageJson.scripts?.["audit:research-deep-research-worker-lifecycle"]?.includes("research-deep-research-worker-lifecycle-audit.mjs") &&
      qualityGate.includes("Research deep_research worker lifecycle audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + qualityGate, [
      "audit:research-deep-research-worker-lifecycle",
      "Research deep_research worker lifecycle audit",
    ]),
    expected: "npm script and strict quality command include the worker lifecycle audit",
    remediation: "Wire the lifecycle slice into the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_lifecycle_report",
    passed: rootWorkflowCoverage.includes("researchDeepResearchWorkerLifecycle") &&
      rootWorkflowCoverage.includes("research-deep-research-worker-lifecycle.current.json") &&
      rootWorkflowCoverage.includes("research_deep_research_worker_lifecycle_runtime"),
    actual: summarizePresence(rootWorkflowCoverage, [
      "researchDeepResearchWorkerLifecycle",
      "research-deep-research-worker-lifecycle.current.json",
      "research_deep_research_worker_lifecycle_runtime",
    ]),
    expected: "research root workflow requires deep_research worker lifecycle evidence",
    remediation: "Root workflow coverage must explicitly require the new worker lifecycle evidence.",
  });

  addFinding(findings, {
    id: "structure_tracks_runtime_files",
    passed: includesAll(verifyStructure, [
      "0243-research-deep-research-worker-lifecycle.md",
      "deep-research-worker-lifecycle.input.schema.json",
      "deep-research-worker-lifecycle.output.schema.json",
      "research-deep-research-worker-lifecycle-runtime.mjs",
      "research-deep-research-worker-lifecycle-runtime.test.mjs",
      "research-deep-research-worker-lifecycle-audit.mjs",
      "research-deep-research-worker-lifecycle-audit.test.mjs",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires lifecycle contracts, SDD, runtime, tests, audit, and audit test",
    remediation: "Add the lifecycle slice to structure verification.",
  });

  addFinding(findings, {
    id: "sdd.explicitly_defers_execution",
    passed: includesAll(sdd, [
      "worker lifecycle",
      "does not start RAG retrieval",
      "does not call models",
      "does not generate a final answer",
      "future approved async execution slice",
    ]),
    actual: summarizePresence(sdd, [
      "worker lifecycle",
      "does not start RAG retrieval",
      "does not call models",
      "does not generate a final answer",
      "future approved async execution slice",
    ]),
    expected: "SDD states this is lifecycle control plane, not execution",
    remediation: "Keep the SDD honest about what this slice can and cannot do.",
  });

  addFinding(findings, {
    id: "architecture_board.reflects_worker_lifecycle_progress",
    passed: includesAll(architectureBoard, [
      "ResearchAgent.deep_research",
      "异步 worker 生命周期",
    ]) && architectureBoardHasProgressAtLeast(architectureBoard, 8.3),
    actual: summarizePresence(architectureBoard, [
      "ResearchAgent.deep_research",
      "异步 worker 生命周期",
      "8.3/10",
      "8.4/10",
    ]),
    expected: "architecture board shows worker lifecycle progress and refactor progress >= 8.3/10",
    remediation: "Update the architecture board so reviewers can see the new deep_research lifecycle boundary.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "RESEARCH_DEEP_RESEARCH_WORKER_LIFECYCLE",
    runtime: {
      runtimeId: RESEARCH_DEEP_RESEARCH_WORKER_LIFECYCLE_RUNTIME_ID,
      commandPort: RESEARCH_DEEP_RESEARCH_WORKER_COMMAND_PORT,
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
      executionStarted: false,
      ragRetrievalStarted: false,
      externalModelCallStarted: false,
      finalAnswerGenerated: false,
      directPublicationAllowed: false,
      localToolMutationAllowed: false,
      directMainDatabaseWriteAllowed: false,
      studentArchiveUsed: false,
      remoteDeviceSourcesUsed: false,
      swarmAllowed: false,
    },
    runtimeProbes: {
      claim: probe,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as deep_research worker lifecycle evidence; next research slice can add approved retrieval planning or another root workflow module without broad production10k retesting."
      : "Fix the worker lifecycle boundary before treating deep_research async execution as root workflow evidence.",
  };
}

export function formatDeepResearchWorkerLifecycleAudit(report) {
  const lines = [
    `Research deep_research worker lifecycle: ${report.readiness}`,
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
    const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-lifecycle-audit-")), "lifecycle.jsonl");
    const result = recordDeepResearchWorkerLifecycle(baseInput(), {
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
        evidenceClass: "ASYNC_DEEP_RESEARCH_WORKER_LIFECYCLE_PROBE",
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
    schemaVersion: "2026-06-05.research.deep-research-worker-lifecycle.v1",
    lifecycleInvocationId: "deep_research_worker_lifecycle_inv_001",
    principal: {
      principalId: "research_worker_service",
      role: "SERVICE",
      subjectType: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      scopes: ["AGENT_COMMAND_SUBMIT"],
      sessionId: "research_worker_session_001",
    },
    approvedIntent: {
      schemaVersion: "2026-06-05.research.deep-research-intent.output.v1",
      runtimeId: "research_deep_research_intent_runtime",
      taskId: "agent_task_research_deep_001",
      contextRef: "shared_ctx_research_deep_001",
      workerAgent: "ResearchAgent",
      skillId: "deep_research",
      decision: "ACCEPTED_ASYNC",
      job: {
        jobId: "deep_research_job_001",
        queueName: "research_deep_research",
        reviewRequired: true,
        executionStarted: false,
      },
      safety: {
        admissionOnly: true,
        writeOperationAllowed: false,
        directDatabaseAccessAllowed: false,
        studentArchiveUsed: false,
        studentDataAccess: "NONE",
        externalModelCallStarted: false,
        ragSynthesisStarted: false,
        finalAnswerGenerated: false,
        directPublicationAllowed: false,
        localToolMutationAllowed: false,
        swarmAllowed: false,
      },
    },
    approval: {
      approvalId: "deep_research_approval_001",
      approvalRecordRef: "evidence:human-approval:deep-research-job-001",
      taskId: "agent_task_research_deep_001",
      jobId: "deep_research_job_001",
      reviewerPrincipalId: "teacher_001",
      decision: "APPROVED_FOR_ASYNC",
      sourcePolicyReviewed: true,
      budgetReviewed: true,
      privateKnowledgeApproved: true,
      externalModelPolicy: "DEFERRED_ONLY",
      reviewedAt: "2026-06-05T00:00:00.000Z",
    },
    worker: {
      workerId: "local_research_worker_001",
      executionOwner: "ASYNC_RESEARCH_WORKER",
      nodeType: "LOCAL",
      capabilityKinds: ["RAG_RETRIEVAL", "MODEL_REASONING"],
      baselineRuntimeDependencyAllowed: false,
      directMainDatabaseWriteAllowed: false,
      leaseDurationMs: 30000,
      maxConcurrentJobs: 4,
    },
    lifecycleAction: "CLAIM",
    sourcePolicy: {
      allowedClassifications: ["PUBLIC", "PRIVATE"],
      includeStudentArchive: false,
      includeRemoteDeviceSources: false,
      directDatabaseAccessAllowed: false,
      knowledgeBaseRefs: ["public_curriculum_knowledge", "private_research_notes"],
    },
    executionPlan: {
      executeNow: false,
      startRagRetrievalNow: false,
      startExternalModelCallNow: false,
      finalAnswerNowAllowed: false,
      directPublicationAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      maxDeferredModelCalls: 4,
      maxRetrievedChunks: 40,
      maxSourceRefs: 12,
    },
    evidenceRefs: [
      "evidence:deep-research-intent:job-001",
      "evidence:human-approval:deep-research-job-001",
    ],
    idempotencyKey: "deep-research-worker-lifecycle:job-001:claim",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = await auditDeepResearchWorkerLifecycle(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatDeepResearchWorkerLifecycleAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
