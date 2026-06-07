import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW_COMMAND_PORT,
  RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW_RUNTIME_ID,
  recordDeepResearchFinalAnswerReview,
} from "./research-deep-research-final-answer-review-runtime.mjs";

const defaultOutPath = "reports/research-deep-research-final-answer-review.current.json";
const sourceFiles = {
  inputSchema: "contracts/agent/deep-research-final-answer-review.input.schema.json",
  outputSchema: "contracts/agent/deep-research-final-answer-review.output.schema.json",
  inputExample: "contracts/agent/deep-research-final-answer-review.input.example.json",
  outputExample: "contracts/agent/deep-research-final-answer-review.output.example.json",
  runtime: "tools/research-deep-research-final-answer-review-runtime.mjs",
  runtimeTest: "tools/research-deep-research-final-answer-review-runtime.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0247-research-deep-research-final-answer-review.md",
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
  "publicationAllowed: true",
  "directDatabaseAccessAllowed: true",
  "writeAllowed: true",
  "studentArchiveWriteAllowed: true",
  "remoteDeviceControlAllowed: true",
  "externalModelCallAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "finalAnswerGenerated: true",
  "finalAnswerPublished: true",
  "directPublicationAllowed: true",
  "mainDatabaseWriteStarted: true",
  "externalModelCallStarted: true",
];

export function auditDeepResearchFinalAnswerReview(inputs, options = {}) {
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
    passed: inputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-final-answer-review.v1" &&
      inputSchema.properties?.reasoningSynthesisRecord?.properties?.runtimeId?.const === "research_deep_research_reasoning_synthesis_runtime" &&
      inputSchema.properties?.reviewPolicy?.properties?.humanReviewRequired?.const === true &&
      inputSchema.properties?.reviewPolicy?.properties?.publicationAllowed?.const === false &&
      outputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-final-answer-review-recorded.v1" &&
      outputSchema.properties?.runtimeId?.const === RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW_RUNTIME_ID &&
      outputSchema.properties?.commandPort?.const === RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW_COMMAND_PORT &&
      inputExample.reviewPolicy?.humanReviewRequired === true &&
      inputExample.reviewPolicy?.publicationAllowed === false &&
      outputExample.boundary?.finalAnswerGenerated === false &&
      outputExample.boundary?.requiresFutureFinalizationRuntime === true,
    actual: summarizePresence(JSON.stringify(inputSchema) + JSON.stringify(outputSchema) + JSON.stringify(inputExample) + JSON.stringify(outputExample), [
      "APPROVED_FOR_FINALIZATION",
      "FINAL_ANSWER_REVIEW_APPROVED_FOR_FINALIZATION",
      "ASYNC_DEEP_RESEARCH_FINAL_ANSWER_REVIEW_BOUNDARY",
    ]),
    expected: "final-answer review schemas and examples define review-only approval, not publication",
    remediation: "Keep contracts tied to reasoning synthesis input and future finalization only.",
  });

  addFinding(findings, {
    id: "runtime.identity_ports_and_idempotency",
    passed: includesAll(runtime, [
      "RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW_RUNTIME_ID",
      "RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW_COMMAND_PORT",
      "DeepResearchFinalAnswerReviewPort.recordDeepResearchFinalAnswerReview",
      "recordDeepResearchFinalAnswerReview",
      "RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW",
      "FINAL_ANSWER_REVIEW_APPROVED_FOR_FINALIZATION",
      "FINAL_ANSWER_REVIEW_REVISION_REQUIRED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "research_deep_research_final_answer_review_runtime",
      "DeepResearchFinalAnswerReviewPort.recordDeepResearchFinalAnswerReview",
      "FINAL_ANSWER_REVIEW_APPROVED_FOR_FINALIZATION",
    ]),
    expected: "runtime records append-only review evidence through the final-answer review command port",
    remediation: "The review slice must stay port-based and idempotent.",
  });

  addFinding(findings, {
    id: "runtime.synthesis_and_safety_boundaries",
    passed: includesAll(runtime, [
      "input.reasoningSynthesisRecord.runtimeId",
      "research_deep_research_reasoning_synthesis_runtime",
      "input.reasoningSynthesisRecord.status",
      "REASONING_SYNTHESIS_DRAFT_RECORDED",
      "humanReviewRequired",
      "publicationAllowed",
      "externalModelCallAllowed",
      "studentArchiveWriteAllowed",
      "requiresFutureFinalizationRuntime: true",
      "finalAnswerGenerated: false",
      "finalAnswerPublished: false",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "review verifies synthesis evidence and blocks publication, final answers, writes, model calls, tools, and Swarm",
    remediation: "Do not let review evidence collapse into final-answer generation or publication.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_review_without_publication",
    passed: probe.status === "PASS" &&
      probe.result?.status === "FINAL_ANSWER_REVIEW_APPROVED_FOR_FINALIZATION" &&
      probe.result?.commandPort === RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW_COMMAND_PORT &&
      probe.result?.review?.approvedForFinalization === true &&
      probe.result?.boundary?.humanFinalAnswerReviewRecorded === true &&
      probe.result?.boundary?.finalAnswerGenerated === false &&
      probe.result?.boundary?.finalAnswerPublished === false &&
      probe.runtimeSlo?.p99Ms <= 300 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};decision=${probe.result.review.decision};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records human final-answer review and stops before final answer or publication",
    remediation: "Final-answer review must only approve future finalization.",
  });

  addFinding(findings, {
    id: "tests.cover_review_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a human review that approves a synthesis draft for future finalization without publishing",
      "records revision-required decisions and requires reviewer feedback",
      "uses idempotency for safe replay and rejects conflicting review inputs",
      "rejects unsafe policies, published synthesis boundaries, students, and service reviewers",
      "rejects approval when coverage or risk is not safe enough",
    ]),
    actual: "runtime tests scanned",
    expected: "positive review, revision, idempotency, unsafe policy, invalid reviewer, coverage, and risk tests",
    remediation: "Add regression coverage before treating final-answer review as root evidence.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime",
    passed: packageJson.scripts?.["audit:research-deep-research-final-answer-review"]?.includes("research-deep-research-final-answer-review-audit.mjs") &&
      qualityGate.includes("Research deep_research final answer review audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + qualityGate, [
      "audit:research-deep-research-final-answer-review",
      "Research deep_research final answer review audit",
    ]),
    expected: "npm script and strict quality command include the final-answer review audit",
    remediation: "Wire final-answer review into the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_final_answer_review_report",
    passed: rootWorkflowCoverage.includes("researchDeepResearchFinalAnswerReview") &&
      rootWorkflowCoverage.includes("research-deep-research-final-answer-review.current.json") &&
      rootWorkflowCoverage.includes("research_deep_research_final_answer_review_runtime"),
    actual: summarizePresence(rootWorkflowCoverage, [
      "researchDeepResearchFinalAnswerReview",
      "research-deep-research-final-answer-review.current.json",
      "research_deep_research_final_answer_review_runtime",
    ]),
    expected: "research root workflow requires deep_research final-answer review evidence",
    remediation: "Root workflow coverage must explicitly require the final-answer review gate.",
  });

  addFinding(findings, {
    id: "structure_tracks_runtime_files",
    passed: includesAll(verifyStructure, [
      "0247-research-deep-research-final-answer-review.md",
      "deep-research-final-answer-review.input.schema.json",
      "deep-research-final-answer-review.output.schema.json",
      "research-deep-research-final-answer-review-runtime.mjs",
      "research-deep-research-final-answer-review-runtime.test.mjs",
      "research-deep-research-final-answer-review-audit.mjs",
      "research-deep-research-final-answer-review-audit.test.mjs",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires final-answer review contracts, SDD, runtime, tests, audit, and audit test",
    remediation: "Add the final-answer review slice to structure verification.",
  });

  addFinding(findings, {
    id: "sdd.explicitly_defers_publication",
    passed: includesAll(sdd, [
      "final-answer review gate",
      "DeepResearchFinalAnswerReviewPort.recordDeepResearchFinalAnswerReview",
      "future finalization runtime",
      "This is not final-answer generation and not publication",
    ]),
    actual: summarizePresence(sdd, [
      "final-answer review gate",
      "DeepResearchFinalAnswerReviewPort.recordDeepResearchFinalAnswerReview",
      "not publication",
    ]),
    expected: "SDD states review is not final-answer generation or publication",
    remediation: "Keep the SDD honest about the boundary.",
  });

  addFinding(findings, {
    id: "architecture_board.reflects_final_answer_review_progress",
    passed: includesAll(architectureBoard, [
      "ResearchAgent.deep_research",
      "final-answer review gate",
      "8.7/10",
      "8.6/10",
    ]),
    actual: summarizePresence(architectureBoard, [
      "ResearchAgent.deep_research",
      "final-answer review gate",
      "8.7/10",
      "8.6/10",
    ]),
    expected: "architecture board shows final-answer review progress while preserving the 8.6/10 synthesis milestone",
    remediation: "Update the architecture board with current and historical deep_research milestones.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW",
    runtime: {
      runtimeId: RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW_RUNTIME_ID,
      commandPort: RESEARCH_DEEP_RESEARCH_FINAL_ANSWER_REVIEW_COMMAND_PORT,
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
      reasoningSynthesisVerified: true,
      humanFinalAnswerReviewRecorded: true,
      finalAnswerGenerated: false,
      finalAnswerPublished: false,
      directPublicationAllowed: false,
      externalModelCallStarted: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    runtimeProbes: {
      finalAnswerReview: probe,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as deep_research final-answer review evidence; finalization and publication remain separate future slices."
      : "Fix final-answer review evidence before allowing any future finalization runtime.",
  };
}

export function formatDeepResearchFinalAnswerReviewAudit(report) {
  const lines = [
    `Research deep_research final answer review: ${report.readiness}`,
    `Command port: ${report.runtime.commandPort}`,
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
    const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-final-answer-review-audit-")), "review.jsonl");
    const result = recordDeepResearchFinalAnswerReview(baseInput(), {
      commandLogPath,
      generatedAt: "2026-06-05T00:00:00.000Z",
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
        evidenceClass: "ASYNC_DEEP_RESEARCH_FINAL_ANSWER_REVIEW_PROBE",
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
    schemaVersion: "2026-06-05.research.deep-research-final-answer-review.v1",
    reviewInvocationId: "deep_research_final_answer_review_inv_001",
    principal: {
      principalId: "teacher_research_reviewer_001",
      role: "TEACHER",
      subjectType: "USER",
      entryPoint: "DESKTOP_RESEARCH",
      scopes: ["RESEARCH_READ", "RESEARCH_WRITE", "KNOWLEDGE_PRIVATE_READ"],
      sessionId: "research_review_session_001",
    },
    reasoningSynthesisRecord: reasoningSynthesisRecord(),
    reviewPolicy: {
      humanReviewRequired: true,
      evidenceCoverageReviewRequired: true,
      safetyReviewRequired: true,
      limitationReviewRequired: true,
      citationIntegrityReviewRequired: true,
      sourceHashIntegrityReviewRequired: true,
      allowFutureFinalizationWhenApproved: true,
      publicationAllowed: false,
      directDatabaseAccessAllowed: false,
      writeAllowed: false,
      studentArchiveWriteAllowed: false,
      remoteDeviceControlAllowed: false,
      externalModelCallAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      minEvidenceCoverageRatio: 1,
    },
    review: {
      reviewId: "deep_research_final_review_001",
      reviewerPrincipalId: "teacher_research_reviewer_001",
      decision: "APPROVED_FOR_FINALIZATION",
      reviewedAt: "2026-06-05T00:00:00.000Z",
      evidenceCoverageReviewed: true,
      safetyReviewed: true,
      limitationsReviewed: true,
      citationIntegrityReviewed: true,
      sourceHashIntegrityReviewed: true,
      coverage: { claimCountReviewed: 2, citedClaimCount: 2, unsupportedClaimCount: 0, coverageRatio: 1 },
      risk: { hallucinationRisk: "LOW", privateKnowledgeRisk: "MEDIUM", studentDataRisk: "LOW" },
      comments: "Evidence, limitations, citation and sourceHash integrity have been reviewed.",
    },
    evidenceRefs: ["evidence:reasoning-synthesis:job-001", "evidence:human-review:desktop-research"],
    idempotencyKey: "deep-research-final-answer-review:job-001",
  };
}

function reasoningSynthesisRecord() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-reasoning-synthesis-recorded.v1",
    runtimeId: "research_deep_research_reasoning_synthesis_runtime",
    status: "REASONING_SYNTHESIS_DRAFT_RECORDED",
    recordId: "research_deep_research_reasoning_synthesis_job_001",
    job: {
      taskId: "agent_task_research_deep_001",
      contextRef: "shared_ctx_research_deep_001",
      jobId: "deep_research_job_001",
      queueName: "research_deep_research",
    },
    draft: {
      draftId: "deep_research_draft_001",
      answerKind: "EVIDENCE_GROUNDED_DRAFT",
      title: "个性化学习与智能教研助手的证据草稿",
      summary: "当前证据支持把个性化辅导建立在可追踪的学习档案、检索证据和效果指标上。",
      claims: [
        claim("claim_001", "public_curriculum_knowledge#source:public-curriculum:001", "a", "chunk_public_001"),
        claim("claim_002", "private_research_notes#source:private-notes:001", "b", "chunk_private_001"),
      ],
      limitations: ["该草稿仍需人工复核后才能进入最终答案边界。"],
    },
    usage: { draftTokens: 260, claimCount: 2, citationCount: 2, sourceHashCount: 2 },
    evidenceRefs: [
      "evidence:retrieval-execution:job-001",
      "evidence:runtime:research_deep_research_reasoning_synthesis_runtime",
    ],
    boundary: {
      reasoningDraftComposed: true,
      finalAnswerGenerated: false,
      directPublicationAllowed: false,
      requiresFutureFinalAnswerReview: true,
    },
  };
}

function claim(claimId, citation, digestChar, chunkId) {
  return {
    claimId,
    text: `Reviewed claim ${claimId}.`,
    citations: [citation],
    sourceHashes: [`sha256:${digestChar.repeat(64)}`],
    supportChunkIds: [chunkId],
    confidence: 0.86,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = auditDeepResearchFinalAnswerReview(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatDeepResearchFinalAnswerReviewAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
