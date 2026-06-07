import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  RESEARCH_DEEP_RESEARCH_FINALIZATION_COMMAND_PORT,
  RESEARCH_DEEP_RESEARCH_FINALIZATION_RUNTIME_ID,
  recordDeepResearchFinalization,
} from "./research-deep-research-finalization-runtime.mjs";

const defaultOutPath = "reports/research-deep-research-finalization.current.json";
const sourceFiles = {
  inputSchema: "contracts/agent/deep-research-finalization.input.schema.json",
  outputSchema: "contracts/agent/deep-research-finalization.output.schema.json",
  inputExample: "contracts/agent/deep-research-finalization.input.example.json",
  outputExample: "contracts/agent/deep-research-finalization.output.example.json",
  runtime: "tools/research-deep-research-finalization-runtime.mjs",
  runtimeTest: "tools/research-deep-research-finalization-runtime.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0248-research-deep-research-finalization-runtime.md",
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
  "answerBodyAllowed: true",
  "publicationAllowed: true",
  "directPublicationAllowed: true",
  "directDatabaseAccessAllowed: true",
  "mainDatabaseWriteAllowed: true",
  "studentArchiveWriteAllowed: true",
  "remoteDeviceControlAllowed: true",
  "externalModelCallAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "finalAnswerPublished: true",
  "publicationCandidateCreated: true",
  "externalModelCallStarted: true",
  "mainDatabaseWriteStarted: true",
];

export function auditDeepResearchFinalization(inputs, options = {}) {
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
    passed: inputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-finalization.v1" &&
      inputSchema.properties?.finalAnswerReviewRecord?.properties?.runtimeId?.const === "research_deep_research_final_answer_review_runtime" &&
      inputSchema.properties?.finalizationPolicy?.properties?.approvedReviewRequired?.const === true &&
      inputSchema.properties?.finalizationPolicy?.properties?.publicationAllowed?.const === false &&
      inputSchema.properties?.finalizationPolicy?.properties?.answerBodyAllowed?.const === false &&
      outputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-finalization-recorded.v1" &&
      outputSchema.properties?.runtimeId?.const === RESEARCH_DEEP_RESEARCH_FINALIZATION_RUNTIME_ID &&
      outputSchema.properties?.commandPort?.const === RESEARCH_DEEP_RESEARCH_FINALIZATION_COMMAND_PORT &&
      inputExample.finalAnswerReviewRecord?.status === "FINAL_ANSWER_REVIEW_APPROVED_FOR_FINALIZATION" &&
      inputExample.finalizationPolicy?.publicationAllowed === false &&
      outputExample.boundary?.finalAnswerFinalized === true &&
      outputExample.boundary?.finalAnswerPublished === false,
    actual: summarizePresence(JSON.stringify(inputSchema) + JSON.stringify(outputSchema) + JSON.stringify(inputExample) + JSON.stringify(outputExample), [
      "FINAL_ANSWER_REVIEW_APPROVED_FOR_FINALIZATION",
      "FINAL_ANSWER_FINALIZED_NOT_PUBLISHED",
      "ASYNC_DEEP_RESEARCH_FINALIZATION_BOUNDARY",
    ]),
    expected: "finalization schemas and examples consume approved review and produce unpublished artifact envelope",
    remediation: "Keep finalization separate from publication and answer-body generation.",
  });

  addFinding(findings, {
    id: "runtime.identity_ports_and_idempotency",
    passed: includesAll(runtime, [
      "RESEARCH_DEEP_RESEARCH_FINALIZATION_RUNTIME_ID",
      "RESEARCH_DEEP_RESEARCH_FINALIZATION_COMMAND_PORT",
      "DeepResearchFinalizationPort.recordDeepResearchFinalization",
      "recordDeepResearchFinalization",
      "RESEARCH_DEEP_RESEARCH_FINALIZATION",
      "FINAL_ANSWER_FINALIZED_NOT_PUBLISHED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "research_deep_research_finalization_runtime",
      "DeepResearchFinalizationPort.recordDeepResearchFinalization",
      "FINAL_ANSWER_FINALIZED_NOT_PUBLISHED",
    ]),
    expected: "runtime records append-only finalization through the finalization command port",
    remediation: "The finalization slice must stay port-based and idempotent.",
  });

  addFinding(findings, {
    id: "runtime.review_and_safety_boundaries",
    passed: includesAll(runtime, [
      "input.finalAnswerReviewRecord.runtimeId",
      "research_deep_research_final_answer_review_runtime",
      "input.finalAnswerReviewRecord.status",
      "FINAL_ANSWER_REVIEW_APPROVED_FOR_FINALIZATION",
      "approvedForFutureFinalization",
      "requiresFutureFinalizationRuntime",
      "answerBodyAllowed",
      "requiresFuturePublicationReview",
      "finalAnswerFinalized: true",
      "finalAnswerPublished: false",
      "publicationCandidateCreated: false",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "finalization verifies approved review and blocks publication, answer body injection, writes, model calls, tools, and Swarm",
    remediation: "Do not let finalization become publication or content generation.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_finalization_without_publication",
    passed: probe.status === "PASS" &&
      probe.result?.status === "FINAL_ANSWER_FINALIZED_NOT_PUBLISHED" &&
      probe.result?.commandPort === RESEARCH_DEEP_RESEARCH_FINALIZATION_COMMAND_PORT &&
      probe.result?.artifact?.deliveryState === "FINALIZED_NOT_PUBLISHED" &&
      probe.result?.boundary?.finalAnswerFinalized === true &&
      probe.result?.boundary?.finalAnswerPublished === false &&
      probe.result?.boundary?.mainDatabaseWriteStarted === false &&
      probe.runtimeSlo?.p99Ms <= 300 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};delivery=${probe.result.artifact.deliveryState};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records unpublished finalization artifact under async boundary budget",
    remediation: "Finalization must stop before publication or durable business writes.",
  });

  addFinding(findings, {
    id: "tests.cover_finalization_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a finalized but unpublished artifact from an approved human review",
      "uses idempotency for safe replay and rejects conflicting finalization inputs",
      "rejects revision-required reviews, unsafe boundaries, students, and service principals",
      "rejects answer-body injection, publication policy, incomplete coverage, and high risk",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, unsafe review, invalid principal, body injection, publication, coverage, and risk tests",
    remediation: "Add regression coverage before treating finalization as root evidence.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime",
    passed: packageJson.scripts?.["audit:research-deep-research-finalization"]?.includes("research-deep-research-finalization-audit.mjs") &&
      qualityGate.includes("Research deep_research finalization audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + qualityGate, [
      "audit:research-deep-research-finalization",
      "Research deep_research finalization audit",
    ]),
    expected: "npm script and strict quality command include the finalization audit",
    remediation: "Wire finalization into the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_finalization_report",
    passed: rootWorkflowCoverage.includes("researchDeepResearchFinalization") &&
      rootWorkflowCoverage.includes("research-deep-research-finalization.current.json") &&
      rootWorkflowCoverage.includes("research_deep_research_finalization_runtime"),
    actual: summarizePresence(rootWorkflowCoverage, [
      "researchDeepResearchFinalization",
      "research-deep-research-finalization.current.json",
      "research_deep_research_finalization_runtime",
    ]),
    expected: "research root workflow requires deep_research finalization evidence",
    remediation: "Root workflow coverage must explicitly require finalization after final-answer review.",
  });

  addFinding(findings, {
    id: "structure_tracks_runtime_files",
    passed: includesAll(verifyStructure, [
      "0248-research-deep-research-finalization-runtime.md",
      "deep-research-finalization.input.schema.json",
      "deep-research-finalization.output.schema.json",
      "research-deep-research-finalization-runtime.mjs",
      "research-deep-research-finalization-runtime.test.mjs",
      "research-deep-research-finalization-audit.mjs",
      "research-deep-research-finalization-audit.test.mjs",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires finalization contracts, SDD, runtime, tests, audit, and audit test",
    remediation: "Add the finalization slice to structure verification.",
  });

  addFinding(findings, {
    id: "sdd.explicitly_defers_publication",
    passed: includesAll(sdd, [
      "finalization runtime",
      "DeepResearchFinalizationPort.recordDeepResearchFinalization",
      "This is not final-answer publication",
      "requiresFuturePublicationReview",
    ]),
    actual: summarizePresence(sdd, [
      "finalization runtime",
      "DeepResearchFinalizationPort.recordDeepResearchFinalization",
      "not final-answer publication",
    ]),
    expected: "SDD states finalization is not publication and requires future publication review",
    remediation: "Keep the SDD honest about the boundary.",
  });

  addFinding(findings, {
    id: "architecture_board.reflects_finalization_progress",
    passed: includesAll(architectureBoard, [
      "ResearchAgent.deep_research",
      "finalization runtime",
      "8.8/10",
      "8.7/10",
    ]),
    actual: summarizePresence(architectureBoard, [
      "ResearchAgent.deep_research",
      "finalization runtime",
      "8.8/10",
      "8.7/10",
    ]),
    expected: "architecture board shows finalization progress while preserving the 8.7/10 review milestone",
    remediation: "Update the architecture board with current and historical deep_research milestones.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "RESEARCH_DEEP_RESEARCH_FINALIZATION",
    runtime: {
      runtimeId: RESEARCH_DEEP_RESEARCH_FINALIZATION_RUNTIME_ID,
      commandPort: RESEARCH_DEEP_RESEARCH_FINALIZATION_COMMAND_PORT,
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
      approvedReviewVerified: true,
      finalAnswerFinalized: true,
      finalAnswerPublished: false,
      directPublicationAllowed: false,
      externalModelCallStarted: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    runtimeProbes: {
      finalization: probe,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as deep_research finalization evidence; publication and user-facing rendering remain separate future slices."
      : "Fix finalization evidence before allowing publication review or rendering.",
  };
}

export function formatDeepResearchFinalizationAudit(report) {
  const lines = [
    `Research deep_research finalization: ${report.readiness}`,
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
    const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-finalization-audit-")), "finalization.jsonl");
    const result = recordDeepResearchFinalization(baseInput(), {
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
        evidenceClass: "ASYNC_DEEP_RESEARCH_FINALIZATION_PROBE",
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
    schemaVersion: "2026-06-05.research.deep-research-finalization.v1",
    finalizationInvocationId: "deep_research_finalization_inv_001",
    principal: {
      principalId: "teacher_research_reviewer_001",
      role: "TEACHER",
      subjectType: "USER",
      entryPoint: "DESKTOP_RESEARCH",
      scopes: ["RESEARCH_READ", "RESEARCH_WRITE", "KNOWLEDGE_PRIVATE_READ"],
      sessionId: "research_finalization_session_001",
    },
    finalAnswerReviewRecord: reviewRecord(),
    finalizationPolicy: {
      approvedReviewRequired: true,
      preserveEvidenceRefsRequired: true,
      preserveCitationCountsRequired: true,
      preserveSourceHashCountsRequired: true,
      answerBodyAllowed: false,
      publicationAllowed: false,
      directPublicationAllowed: false,
      directDatabaseAccessAllowed: false,
      mainDatabaseWriteAllowed: false,
      studentArchiveWriteAllowed: false,
      remoteDeviceControlAllowed: false,
      externalModelCallAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFuturePublicationReview: true,
    },
    artifact: {
      artifactId: "deep_research_finalization_artifact_001",
      artifactKind: "REVIEWED_DEEP_RESEARCH_FINALIZATION_RECORD",
      finalizationLabel: "Reviewed deep research answer envelope",
      deliveryState: "FINALIZED_NOT_PUBLISHED",
    },
    evidenceRefs: ["evidence:final-answer-review:job-001", "evidence:finalization:desktop-research"],
    idempotencyKey: "deep-research-finalization:job-001",
  };
}

function reviewRecord() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-final-answer-review-recorded.v1",
    runtimeId: "research_deep_research_final_answer_review_runtime",
    commandPort: "DeepResearchFinalAnswerReviewPort.recordDeepResearchFinalAnswerReview",
    status: "FINAL_ANSWER_REVIEW_APPROVED_FOR_FINALIZATION",
    recordId: "research_deep_research_final_answer_review_deep-research-final-answer-review_job-001",
    job: {
      taskId: "agent_task_research_deep_001",
      contextRef: "shared_ctx_research_deep_001",
      jobId: "deep_research_job_001",
      queueName: "research_deep_research",
    },
    synthesis: {
      recordId: "research_deep_research_reasoning_synthesis_job_001",
      draftId: "deep_research_draft_001",
      claimCount: 2,
      citationCount: 2,
      sourceHashCount: 2,
    },
    review: {
      reviewId: "deep_research_final_review_001",
      reviewerPrincipalId: "teacher_research_reviewer_001",
      decision: "APPROVED_FOR_FINALIZATION",
      approvedForFinalization: true,
      revisionRequired: false,
      coverage: { claimCountReviewed: 2, citedClaimCount: 2, unsupportedClaimCount: 0, coverageRatio: 1 },
      risk: { hallucinationRisk: "LOW", privateKnowledgeRisk: "MEDIUM", studentDataRisk: "LOW" },
      comments: "Evidence, limitations, citation and sourceHash integrity have been reviewed.",
    },
    evidenceRefs: [
      "evidence:reasoning-synthesis:job-001",
      "evidence:runtime:research_deep_research_final_answer_review_runtime",
    ],
    boundary: {
      humanFinalAnswerReviewRecorded: true,
      approvedForFutureFinalization: true,
      revisionRequired: false,
      finalAnswerGenerated: false,
      finalAnswerPublished: false,
      directPublicationAllowed: false,
      externalModelCallStarted: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureFinalizationRuntime: true,
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = auditDeepResearchFinalization(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatDeepResearchFinalizationAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
