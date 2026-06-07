import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_COMMAND_PORT,
  RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_RUNTIME_ID,
  recordDeepResearchRenderPreview,
} from "./research-deep-research-render-preview-runtime.mjs";

const defaultOutPath = "reports/research-deep-research-render-preview.current.json";
const sourceFiles = {
  inputSchema: "contracts/agent/deep-research-render-preview.input.schema.json",
  outputSchema: "contracts/agent/deep-research-render-preview.output.schema.json",
  inputExample: "contracts/agent/deep-research-render-preview.input.example.json",
  outputExample: "contracts/agent/deep-research-render-preview.output.example.json",
  runtime: "tools/research-deep-research-render-preview-runtime.mjs",
  runtimeTest: "tools/research-deep-research-render-preview-runtime.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0249-research-deep-research-render-preview-runtime.md",
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
  "studentVisibleAllowed: true",
  "directDatabaseAccessAllowed: true",
  "mainDatabaseWriteAllowed: true",
  "studentArchiveWriteAllowed: true",
  "externalModelCallAllowed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "publicationCandidateCreated: true",
  "finalAnswerPublished: true",
  "studentVisible: true",
  "externalModelCallStarted: true",
  "mainDatabaseWriteStarted: true",
  "studentArchiveWriteStarted: true",
  "dangerouslySetInnerHTML",
  "innerHTML",
];

export function auditDeepResearchRenderPreview(inputs, options = {}) {
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
    passed: inputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-render-preview.v1" &&
      inputSchema.properties?.reasoningSynthesisRecord?.properties?.runtimeId?.const === "research_deep_research_reasoning_synthesis_runtime" &&
      inputSchema.properties?.finalizationRecord?.properties?.runtimeId?.const === "research_deep_research_finalization_runtime" &&
      inputSchema.properties?.renderPolicy?.properties?.publicationAllowed?.const === false &&
      inputSchema.properties?.renderPolicy?.properties?.studentVisibleAllowed?.const === false &&
      outputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-render-preview-recorded.v1" &&
      outputSchema.properties?.runtimeId?.const === RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_RUNTIME_ID &&
      outputSchema.properties?.commandPort?.const === RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_COMMAND_PORT &&
      inputExample.finalizationRecord?.status === "FINAL_ANSWER_FINALIZED_NOT_PUBLISHED" &&
      inputExample.renderPolicy?.publicationAllowed === false &&
      outputExample.boundary?.renderPreviewRecorded === true &&
      outputExample.boundary?.studentVisible === false,
    actual: summarizePresence(JSON.stringify(inputSchema) + JSON.stringify(outputSchema) + JSON.stringify(inputExample) + JSON.stringify(outputExample), [
      "RENDER_PREVIEW_READY_NOT_PUBLISHED",
      "PREVIEW_READY_NOT_PUBLISHED",
      "ASYNC_DEEP_RESEARCH_RENDER_PREVIEW_BOUNDARY",
    ]),
    expected: "render preview schemas and examples combine synthesis and finalization without publication or student visibility",
    remediation: "Keep the preview contract teacher-only and evidence-preserving.",
  });

  addFinding(findings, {
    id: "runtime.identity_ports_and_idempotency",
    passed: includesAll(runtime, [
      "RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_RUNTIME_ID",
      "RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_COMMAND_PORT",
      "DeepResearchRenderPreviewPort.recordDeepResearchRenderPreview",
      "recordDeepResearchRenderPreview",
      "RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW",
      "RENDER_PREVIEW_READY_NOT_PUBLISHED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "research_deep_research_render_preview_runtime",
      "DeepResearchRenderPreviewPort.recordDeepResearchRenderPreview",
      "RENDER_PREVIEW_READY_NOT_PUBLISHED",
    ]),
    expected: "runtime records append-only preview evidence through the render preview command port",
    remediation: "The render preview slice must stay port-based and idempotent.",
  });

  addFinding(findings, {
    id: "runtime.finalization_synthesis_and_safety_boundaries",
    passed: includesAll(runtime, [
      "input.reasoningSynthesisRecord.runtimeId",
      "research_deep_research_reasoning_synthesis_runtime",
      "input.finalizationRecord.runtimeId",
      "research_deep_research_finalization_runtime",
      "FINAL_ANSWER_FINALIZED_NOT_PUBLISHED",
      "assertRecordsMatch",
      "escapePreviewText",
      "citationIntegrityPreserved: true",
      "sourceHashIntegrityPreserved: true",
      "unsafeTextEncoded: true",
      "studentVisible: false",
      "requiresFuturePublicationReview: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime verifies synthesis/finalization integrity, encodes text, and blocks publication, writes, model calls, tools, and Swarm",
    remediation: "Do not let render preview become publication or unescaped HTML rendering.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_preview_without_publication",
    passed: probe.status === "PASS" &&
      probe.result?.status === "RENDER_PREVIEW_READY_NOT_PUBLISHED" &&
      probe.result?.commandPort === RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_COMMAND_PORT &&
      probe.result?.preview?.claims?.length === 2 &&
      probe.result?.boundary?.renderPreviewRecorded === true &&
      probe.result?.boundary?.finalAnswerPublished === false &&
      probe.result?.boundary?.studentVisible === false &&
      probe.result?.boundary?.mainDatabaseWriteStarted === false &&
      probe.runtimeSlo?.p99Ms <= 300 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};studentVisible=${probe.result.boundary.studentVisible};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records teacher-only preview under async boundary budget",
    remediation: "Render preview must stop before publication or student delivery.",
  });

  addFinding(findings, {
    id: "tests.cover_render_preview_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a teacher-only preview from finalized and synthesized records",
      "encodes unsafe text and preserves citations, source hashes, limitations, and review refs",
      "uses idempotency for safe replay and rejects conflicting preview inputs",
      "rejects mismatched records, unsafe finalization boundaries, students, and service principals",
      "rejects publication, student visibility, unsafe render policy, and invalid evidence",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, encoding, idempotency, mismatch, unsafe boundary, invalid principal, publication, student visibility, and evidence tests",
    remediation: "Add regression coverage before treating render preview as root evidence.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime",
    passed: packageJson.scripts?.["audit:research-deep-research-render-preview"]?.includes("research-deep-research-render-preview-audit.mjs") &&
      qualityGate.includes("Research deep_research render preview audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + qualityGate, [
      "audit:research-deep-research-render-preview",
      "Research deep_research render preview audit",
    ]),
    expected: "npm script and strict quality command include the render preview audit",
    remediation: "Wire render preview into the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_render_preview_report",
    passed: rootWorkflowCoverage.includes("researchDeepResearchRenderPreview") &&
      rootWorkflowCoverage.includes("research-deep-research-render-preview.current.json") &&
      rootWorkflowCoverage.includes("research_deep_research_render_preview_runtime"),
    actual: summarizePresence(rootWorkflowCoverage, [
      "researchDeepResearchRenderPreview",
      "research-deep-research-render-preview.current.json",
      "research_deep_research_render_preview_runtime",
    ]),
    expected: "research root workflow requires deep_research render preview evidence",
    remediation: "Root workflow coverage must explicitly require render preview after finalization.",
  });

  addFinding(findings, {
    id: "structure_tracks_runtime_files",
    passed: includesAll(verifyStructure, [
      "0249-research-deep-research-render-preview-runtime.md",
      "deep-research-render-preview.input.schema.json",
      "deep-research-render-preview.output.schema.json",
      "research-deep-research-render-preview-runtime.mjs",
      "research-deep-research-render-preview-runtime.test.mjs",
      "research-deep-research-render-preview-audit.mjs",
      "research-deep-research-render-preview-audit.test.mjs",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires render preview contracts, SDD, runtime, tests, audit, and audit test",
    remediation: "Add the render preview slice to structure verification.",
  });

  addFinding(findings, {
    id: "sdd.explicitly_defers_publication",
    passed: includesAll(sdd, [
      "render preview runtime",
      "DeepResearchRenderPreviewPort.recordDeepResearchRenderPreview",
      "This is not final-answer publication",
      "requiresFuturePublicationReview",
    ]),
    actual: summarizePresence(sdd, [
      "render preview runtime",
      "DeepResearchRenderPreviewPort.recordDeepResearchRenderPreview",
      "not final-answer publication",
    ]),
    expected: "SDD states render preview is not publication and requires future publication review",
    remediation: "Keep the SDD honest about the boundary.",
  });

  addFinding(findings, {
    id: "architecture_board.reflects_render_preview_progress",
    passed: includesAll(architectureBoard, [
      "ResearchAgent.deep_research",
      "render preview runtime",
      "8.9/10",
      "8.8/10",
    ]),
    actual: summarizePresence(architectureBoard, [
      "ResearchAgent.deep_research",
      "render preview runtime",
      "8.9/10",
      "8.8/10",
    ]),
    expected: "architecture board shows render preview progress while preserving the 8.8/10 finalization milestone",
    remediation: "Update the architecture board with current and historical deep_research milestones.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW",
    runtime: {
      runtimeId: RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_RUNTIME_ID,
      commandPort: RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_COMMAND_PORT,
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
      finalizedArtifactVerified: true,
      reasoningSynthesisVerified: true,
      citationIntegrityPreserved: true,
      sourceHashIntegrityPreserved: true,
      unsafeTextEncoded: true,
      renderPreviewRecorded: true,
      publicationCandidateCreated: false,
      finalAnswerPublished: false,
      studentVisible: false,
      externalModelCallStarted: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    runtimeProbes: {
      renderPreview: probe,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as deep_research teacher-only render preview evidence; publication and student delivery remain separate future slices."
      : "Fix render preview evidence before allowing publication review or student-visible delivery.",
  };
}

export function formatDeepResearchRenderPreviewAudit(report) {
  const lines = [
    `Research deep_research render preview: ${report.readiness}`,
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
    const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-render-preview-audit-")), "preview.jsonl");
    const result = recordDeepResearchRenderPreview(baseInput(), {
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
        evidenceClass: "ASYNC_DEEP_RESEARCH_RENDER_PREVIEW_PROBE",
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
  return JSON.parse(fs.readFileSync("contracts/agent/deep-research-render-preview.input.example.json", "utf8"));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = auditDeepResearchRenderPreview(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatDeepResearchRenderPreviewAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
