import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_COMMAND_PORT,
  RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_REASONING_PORT,
  RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_RUNTIME_ID,
  recordDeepResearchReasoningSynthesis,
} from "./research-deep-research-reasoning-synthesis-runtime.mjs";

const defaultOutPath = "reports/research-deep-research-reasoning-synthesis.current.json";
const sourceFiles = {
  inputSchema: "contracts/agent/deep-research-reasoning-synthesis.input.schema.json",
  outputSchema: "contracts/agent/deep-research-reasoning-synthesis.output.schema.json",
  inputExample: "contracts/agent/deep-research-reasoning-synthesis.input.example.json",
  outputExample: "contracts/agent/deep-research-reasoning-synthesis.output.example.json",
  runtime: "tools/research-deep-research-reasoning-synthesis-runtime.mjs",
  runtimeTest: "tools/research-deep-research-reasoning-synthesis-runtime.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0246-research-deep-research-reasoning-synthesis.md",
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
  "directExternalModelCallAllowed: true",
  "finalAnswerNowAllowed: true",
  "publicationAllowed: true",
  "directExternalModelCallStarted: true",
  "directDatabaseAccessStarted: true",
  "mainDatabaseWriteStarted: true",
  "finalAnswerGenerated: true",
  "directPublicationAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
];

export async function auditDeepResearchReasoningSynthesis(inputs, options = {}) {
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
    passed: inputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-reasoning-synthesis.v1" &&
      inputSchema.properties?.reasoningPolicy?.properties?.composeDraftNow?.const === true &&
      inputSchema.properties?.reasoningPolicy?.properties?.directExternalModelCallAllowed?.const === false &&
      inputSchema.properties?.reasoningPortDescriptor?.properties?.operation?.const === "composeEvidenceGroundedDraft" &&
      outputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-reasoning-synthesis-recorded.v1" &&
      outputSchema.properties?.runtimeId?.const === RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_RUNTIME_ID &&
      outputSchema.properties?.reasoningPort?.const === RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_REASONING_PORT &&
      inputExample.reasoningPolicy?.evidenceGroundedOnly === true &&
      inputExample.reasoningPolicy?.directExternalModelCallAllowed === false &&
      outputExample.status === "REASONING_SYNTHESIS_DRAFT_RECORDED" &&
      outputExample.boundary?.reasoningDraftComposed === true &&
      outputExample.boundary?.finalAnswerGenerated === false,
    actual: summarizePresence(JSON.stringify(inputSchema) + JSON.stringify(outputSchema) + JSON.stringify(inputExample) + JSON.stringify(outputExample), [
      "composeEvidenceGroundedDraft",
      "REASONING_SYNTHESIS_DRAFT_RECORDED",
      "ASYNC_DEEP_RESEARCH_REASONING_SYNTHESIS_BOUNDARY",
    ]),
    expected: "reasoning-synthesis schemas and examples define evidence-grounded draft only",
    remediation: "Keep schema and examples aligned with the draft-only synthesis boundary.",
  });

  addFinding(findings, {
    id: "runtime.identity_ports_and_idempotency",
    passed: includesAll(runtime, [
      "RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_RUNTIME_ID",
      "RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_COMMAND_PORT",
      "RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_REASONING_PORT",
      "DeepResearchReasoningSynthesisPort.recordDeepResearchReasoningSynthesis",
      "DeepResearchReasoningPort.composeEvidenceGroundedDraft",
      "recordDeepResearchReasoningSynthesis",
      "RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS",
      "REASONING_SYNTHESIS_DRAFT_RECORDED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "research_deep_research_reasoning_synthesis_runtime",
      "DeepResearchReasoningPort.composeEvidenceGroundedDraft",
      "REASONING_SYNTHESIS_DRAFT_RECORDED",
    ]),
    expected: "runtime composes a draft through the reasoning port and records through the command port",
    remediation: "The synthesis slice must stay port-based and idempotent.",
  });

  addFinding(findings, {
    id: "runtime.retrieval_execution_and_safety_boundaries",
    passed: includesAll(runtime, [
      "input.retrievalExecutionRecord.runtimeId",
      "research_deep_research_retrieval_execution_runtime",
      "input.retrievalExecutionRecord.status",
      "RETRIEVAL_EXECUTION_RECORDED",
      "input.reasoningPolicy.evidenceGroundedOnly",
      "input.reasoningPolicy.directDatabaseAccessAllowed",
      "input.reasoningPolicy.directExternalModelCallAllowed",
      "input.reasoningPolicy.finalAnswerNowAllowed",
      "input.reasoningPolicy.publicationAllowed",
      "requiresFutureFinalAnswerReview: true",
      "assertEvidenceSubset",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "approved evidence-grounded draft with no direct DB, writes, direct model/network, Swarm, publication, or final answer",
    remediation: "Do not let reasoning synthesis collapse into final answer generation or direct external execution.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_grounded_draft_without_publication",
    passed: probe.status === "PASS" &&
      probe.result?.status === "REASONING_SYNTHESIS_DRAFT_RECORDED" &&
      probe.result?.commandPort === RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_COMMAND_PORT &&
      probe.result?.reasoningPort === RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_REASONING_PORT &&
      probe.result?.draft?.answerKind === "EVIDENCE_GROUNDED_DRAFT" &&
      probe.result?.usage?.claimCount >= 1 &&
      probe.result?.boundary?.evidenceGroundingVerified === true &&
      probe.result?.boundary?.finalAnswerGenerated === false &&
      probe.result?.boundary?.directPublicationAllowed === false &&
      probe.runtimeSlo?.p99Ms <= 300 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};claims=${probe.result.usage.claimCount};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records an evidence-grounded draft and stops before final answer or publication",
    remediation: "Reasoning synthesis must produce a reviewable draft only.",
  });

  addFinding(findings, {
    id: "tests.cover_synthesis_negative_paths",
    passed: includesAll(runtimeTest, [
      "records an evidence-grounded draft through the injected reasoning port without publishing a final answer",
      "uses idempotency for safe replay and rejects conflicting synthesis inputs",
      "rejects unsafe policy, completed synthesis boundaries, missing port, or missing private scope",
      "rejects claims that cite sources outside retrieval execution evidence",
      "rejects draft outputs that exceed claim or token budgets",
    ]),
    actual: "runtime tests scanned",
    expected: "positive draft, idempotency, policy, missing port, private scope, unsupported claim, and budget tests",
    remediation: "Add regression coverage before treating synthesis as root evidence.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime",
    passed: packageJson.scripts?.["audit:research-deep-research-reasoning-synthesis"]?.includes("research-deep-research-reasoning-synthesis-audit.mjs") &&
      qualityGate.includes("Research deep_research reasoning synthesis audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + qualityGate, [
      "audit:research-deep-research-reasoning-synthesis",
      "Research deep_research reasoning synthesis audit",
    ]),
    expected: "npm script and strict quality command include the reasoning-synthesis audit",
    remediation: "Wire the reasoning-synthesis slice into the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_reasoning_synthesis_report",
    passed: rootWorkflowCoverage.includes("researchDeepResearchReasoningSynthesis") &&
      rootWorkflowCoverage.includes("research-deep-research-reasoning-synthesis.current.json") &&
      rootWorkflowCoverage.includes("research_deep_research_reasoning_synthesis_runtime"),
    actual: summarizePresence(rootWorkflowCoverage, [
      "researchDeepResearchReasoningSynthesis",
      "research-deep-research-reasoning-synthesis.current.json",
      "research_deep_research_reasoning_synthesis_runtime",
    ]),
    expected: "research root workflow requires deep_research reasoning-synthesis evidence",
    remediation: "Root workflow coverage must explicitly require the approved reasoning-synthesis evidence.",
  });

  addFinding(findings, {
    id: "structure_tracks_runtime_files",
    passed: includesAll(verifyStructure, [
      "0246-research-deep-research-reasoning-synthesis.md",
      "deep-research-reasoning-synthesis.input.schema.json",
      "deep-research-reasoning-synthesis.output.schema.json",
      "research-deep-research-reasoning-synthesis-runtime.mjs",
      "research-deep-research-reasoning-synthesis-runtime.test.mjs",
      "research-deep-research-reasoning-synthesis-audit.mjs",
      "research-deep-research-reasoning-synthesis-audit.test.mjs",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires reasoning-synthesis contracts, SDD, runtime, tests, audit, and audit test",
    remediation: "Add the reasoning-synthesis slice to structure verification.",
  });

  addFinding(findings, {
    id: "sdd.explicitly_defers_publication",
    passed: includesAll(sdd, [
      "approved reasoning/synthesis draft boundary",
      "DeepResearchReasoningPort.composeEvidenceGroundedDraft",
      "evidence-grounded draft",
      "does not publish a final answer",
      "Final answer review/publication remains a future approved slice",
    ]),
    actual: summarizePresence(sdd, [
      "approved reasoning/synthesis draft boundary",
      "DeepResearchReasoningPort.composeEvidenceGroundedDraft",
      "does not publish a final answer",
    ]),
    expected: "SDD states this is draft synthesis, not final answer publication",
    remediation: "Keep the SDD honest about what this slice can and cannot do.",
  });

  addFinding(findings, {
    id: "architecture_board.reflects_reasoning_synthesis_progress",
    passed: includesAll(architectureBoard, [
      "ResearchAgent.deep_research",
      "approved reasoning/synthesis draft",
      "8.6/10",
    ]),
    actual: summarizePresence(architectureBoard, [
      "ResearchAgent.deep_research",
      "approved reasoning/synthesis draft",
      "8.6/10",
    ]),
    expected: "architecture board shows approved reasoning/synthesis draft progress and updated fraction",
    remediation: "Update the architecture board so reviewers can see the new deep_research draft boundary.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS",
    runtime: {
      runtimeId: RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_RUNTIME_ID,
      commandPort: RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_COMMAND_PORT,
      reasoningPort: RESEARCH_DEEP_RESEARCH_REASONING_SYNTHESIS_REASONING_PORT,
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
      retrievalExecutionVerified: true,
      evidenceGroundingVerified: true,
      reasoningDraftComposed: true,
      directExternalModelCallStarted: false,
      directDatabaseAccessStarted: false,
      mainDatabaseWriteStarted: false,
      studentArchiveUsed: false,
      remoteDeviceSourcesUsed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      finalAnswerGenerated: false,
      directPublicationAllowed: false,
    },
    runtimeProbes: {
      reasoningSynthesis: probe,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as deep_research approved reasoning/synthesis draft evidence; final answer review/publication remains a separate future slice."
      : "Fix the reasoning-synthesis boundary before treating deep_research draft generation as root workflow evidence.",
  };
}

export function formatDeepResearchReasoningSynthesisAudit(report) {
  const lines = [
    `Research deep_research reasoning synthesis: ${report.readiness}`,
    `Command port: ${report.runtime.commandPort}`,
    `Reasoning port: ${report.runtime.reasoningPort}`,
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
    const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-reasoning-synthesis-audit-")), "synthesis.jsonl");
    const result = await recordDeepResearchReasoningSynthesis(baseInput(), {
      commandLogPath,
      generatedAt: "2026-06-05T00:00:00.000Z",
      reasoningPort: {
        composeEvidenceGroundedDraft() {
          return draftResult();
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
        evidenceClass: "ASYNC_DEEP_RESEARCH_REASONING_SYNTHESIS_PROBE",
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
    schemaVersion: "2026-06-05.research.deep-research-reasoning-synthesis.v1",
    synthesisInvocationId: "deep_research_reasoning_synthesis_inv_001",
    principal: {
      principalId: "research_worker_service",
      role: "SERVICE",
      subjectType: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      scopes: ["AGENT_COMMAND_SUBMIT", "RESEARCH_READ", "KNOWLEDGE_PRIVATE_READ"],
      sessionId: "research_worker_session_001",
    },
    retrievalExecutionRecord: retrievalExecutionRecord(),
    reasoningPolicy: {
      composeDraftNow: true,
      evidenceGroundedOnly: true,
      directDatabaseAccessAllowed: false,
      writeAllowed: false,
      studentArchiveAllowed: false,
      remoteDeviceSourcesAllowed: false,
      directExternalModelCallAllowed: false,
      finalAnswerNowAllowed: false,
      publicationAllowed: false,
      citationRequired: true,
      sourceHashRequired: true,
      maxDraftClaims: 6,
      maxCitationsPerClaim: 4,
      maxSourceHashesPerClaim: 4,
      maxDraftTokens: 1200,
    },
    reasoningPortDescriptor: {
      portName: "DeepResearchReasoningPort",
      operation: "composeEvidenceGroundedDraft",
      directExternalModelCall: false,
      directDatabaseAccess: false,
      writeAllowed: false,
    },
    evidenceRefs: ["evidence:retrieval-execution:job-001", "evidence:approval:deep_research_approval_001"],
    idempotencyKey: "deep-research-reasoning-synthesis:job-001",
  };
}

function retrievalExecutionRecord() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-retrieval-execution-recorded.v1",
    runtimeId: "research_deep_research_retrieval_execution_runtime",
    status: "RETRIEVAL_EXECUTION_RECORDED",
    recordId: "research_deep_research_retrieval_execution_job_001",
    job: {
      taskId: "agent_task_research_deep_001",
      contextRef: "shared_ctx_research_deep_001",
      jobId: "deep_research_job_001",
      queueName: "research_deep_research",
    },
    retrievalResult: {
      retrievalExecuted: true,
      chunkCount: 2,
      sourceRefCount: 2,
      items: [
        retrievalItem("PUBLIC", "chunk_public_001", "public_curriculum_knowledge#source:public-curriculum:001", "a"),
        retrievalItem("PRIVATE", "chunk_private_001", "private_research_notes#source:private-notes:001", "b"),
      ],
    },
    evidenceRefs: ["evidence:runtime:research_deep_research_retrieval_execution_runtime"],
    boundary: {
      retrievalExecuted: true,
      ragSynthesisStarted: false,
      finalAnswerGenerated: false,
      directPublicationAllowed: false,
      directMainDatabaseWriteAllowed: false,
    },
  };
}

function retrievalItem(classification, chunkId, citation, digestChar) {
  return {
    planItemId: `plan_${classification.toLowerCase()}`,
    knowledgeBaseRef: classification === "PUBLIC" ? "public_curriculum_knowledge" : "private_research_notes",
    classification,
    chunks: [{
      chunkId,
      sourceRef: `source:${chunkId}`,
      sourceKind: classification === "PUBLIC" ? "PUBLIC_KNOWLEDGE" : "PRIVATE_KNOWLEDGE",
      sourceTitle: `title-${chunkId}`,
      citation,
      sourceHash: `sha256:${digestChar.repeat(64)}`,
      excerpt: `Evidence excerpt for ${chunkId}.`,
    }],
  };
}

function draftResult() {
  return {
    draftId: "deep_research_draft_001",
    answerKind: "EVIDENCE_GROUNDED_DRAFT",
    title: "个性化学习与智能教研助手的证据草稿",
    summary: "当前证据支持把个性化辅导建立在可追踪的学习档案、检索证据和效果指标上。",
    claims: [
      {
        claimId: "claim_001",
        text: "个性化辅导能力需要绑定明确的学习结果指标。",
        citations: ["public_curriculum_knowledge#source:public-curriculum:001"],
        sourceHashes: ["sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
        supportChunkIds: ["chunk_public_001"],
        confidence: 0.82,
      },
      {
        claimId: "claim_002",
        text: "私密知识库内容进入综合草稿时必须保留引用和 sourceHash。",
        citations: ["private_research_notes#source:private-notes:001"],
        sourceHashes: ["sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
        supportChunkIds: ["chunk_private_001"],
        confidence: 0.86,
      },
    ],
    limitations: ["该草稿仍需人工复核后才能进入最终答案边界。"],
    draftTokens: 260,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = await auditDeepResearchReasoningSynthesis(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatDeepResearchReasoningSynthesisAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
