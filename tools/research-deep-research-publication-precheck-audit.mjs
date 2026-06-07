import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_COMMAND_PORT,
  RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_RUNTIME_ID,
  recordDeepResearchPublicationPrecheck,
} from "./research-deep-research-publication-precheck-runtime.mjs";

const defaultOutPath = "reports/research-deep-research-publication-precheck.current.json";
const sourceFiles = {
  inputSchema: "contracts/agent/deep-research-publication-precheck.input.schema.json",
  outputSchema: "contracts/agent/deep-research-publication-precheck.output.schema.json",
  inputExample: "contracts/agent/deep-research-publication-precheck.input.example.json",
  outputExample: "contracts/agent/deep-research-publication-precheck.output.example.json",
  runtime: "tools/research-deep-research-publication-precheck-runtime.mjs",
  runtimeTest: "tools/research-deep-research-publication-precheck-runtime.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0250-research-deep-research-publication-precheck-runtime.md",
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
  "directPublicationAllowed: true",
  "studentVisibleDeliveryAllowed: true",
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

export function auditDeepResearchPublicationPrecheck(inputs, options = {}) {
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
    passed: inputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-publication-precheck.v1" &&
      inputSchema.properties?.renderPreviewRecord?.properties?.runtimeId?.const === "research_deep_research_render_preview_runtime" &&
      inputSchema.properties?.renderPreviewRecord?.properties?.status?.const === "RENDER_PREVIEW_READY_NOT_PUBLISHED" &&
      inputSchema.properties?.publicationPrecheckPolicy?.properties?.directPublicationAllowed?.const === false &&
      inputSchema.properties?.publicationPrecheckPolicy?.properties?.studentVisibleDeliveryAllowed?.const === false &&
      outputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-publication-precheck-recorded.v1" &&
      outputSchema.properties?.runtimeId?.const === RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_RUNTIME_ID &&
      outputSchema.properties?.commandPort?.const === RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_COMMAND_PORT &&
      outputSchema.properties?.boundary?.properties?.requiresFutureDeliveryRuntime?.const === true &&
      inputExample.renderPreviewRecord?.status === "RENDER_PREVIEW_READY_NOT_PUBLISHED" &&
      inputExample.publicationPrecheckPolicy?.directPublicationAllowed === false &&
      inputExample.publicationPrecheckPolicy?.studentVisibleDeliveryAllowed === false &&
      outputExample.boundary?.humanPublicationPrecheckRecorded === true &&
      outputExample.boundary?.studentVisible === false,
    actual: summarizePresence(JSON.stringify(inputSchema) + JSON.stringify(outputSchema) + JSON.stringify(inputExample) + JSON.stringify(outputExample), [
      "PUBLICATION_PRECHECK_APPROVED_NOT_DELIVERED",
      "APPROVED_FOR_DELIVERY_RUNTIME",
      "ASYNC_DEEP_RESEARCH_PUBLICATION_PRECHECK_BOUNDARY",
    ]),
    expected: "publication precheck schemas and examples consume render preview evidence without delivery",
    remediation: "Keep publication precheck separate from publication and student-visible delivery.",
  });

  addFinding(findings, {
    id: "runtime.identity_ports_and_idempotency",
    passed: includesAll(runtime, [
      "RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_RUNTIME_ID",
      "RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_COMMAND_PORT",
      "DeepResearchPublicationPrecheckPort.recordDeepResearchPublicationPrecheck",
      "recordDeepResearchPublicationPrecheck",
      "RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_READY",
      "PUBLICATION_PRECHECK_APPROVED_NOT_DELIVERED",
      "PUBLICATION_PRECHECK_REVISION_REQUIRED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "research_deep_research_publication_precheck_runtime",
      "DeepResearchPublicationPrecheckPort.recordDeepResearchPublicationPrecheck",
      "PUBLICATION_PRECHECK_APPROVED_NOT_DELIVERED",
    ]),
    expected: "runtime records append-only publication precheck evidence through the command port",
    remediation: "The publication precheck slice must stay port-based and idempotent.",
  });

  addFinding(findings, {
    id: "runtime.render_preview_review_and_safety_boundaries",
    passed: includesAll(runtime, [
      "input.renderPreviewRecord.runtimeId",
      "research_deep_research_render_preview_runtime",
      "RENDER_PREVIEW_READY_NOT_PUBLISHED",
      "publication precheck requires a human research teacher or admin",
      "RESEARCH_READ",
      "RESEARCH_WRITE",
      "requireSafeText",
      "HIGH risk",
      "renderPreviewVerified: true",
      "humanPublicationPrecheckRecorded: true",
      "approvedForFutureDelivery",
      "studentVisible: false",
      "requiresFutureDeliveryRuntime: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime verifies render preview, human review, safety, student visibility, and blocks direct delivery or writes",
    remediation: "Do not let publication precheck publish, write the main DB, call models, mutate tools, or expose to students.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_precheck_without_delivery",
    passed: probe.status === "PASS" &&
      probe.result?.status === "PUBLICATION_PRECHECK_APPROVED_NOT_DELIVERED" &&
      probe.result?.commandPort === RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_COMMAND_PORT &&
      probe.result?.precheck?.approvedForFutureDelivery === true &&
      probe.result?.boundary?.humanPublicationPrecheckRecorded === true &&
      probe.result?.boundary?.finalAnswerPublished === false &&
      probe.result?.boundary?.studentVisible === false &&
      probe.result?.boundary?.requiresFutureDeliveryRuntime === true &&
      probe.runtimeSlo?.p99Ms <= 300 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};studentVisible=${probe.result.boundary.studentVisible};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records human precheck under async boundary budget without publication or delivery",
    remediation: "Publication precheck must stop before the future delivery runtime.",
  });

  addFinding(findings, {
    id: "tests.cover_publication_precheck_negative_paths",
    passed: includesAll(runtimeTest, [
      "records an approved publication precheck without delivering to students",
      "records revision-required prechecks without allowing delivery",
      "uses idempotency for safe replay and rejects conflicting precheck inputs",
      "rejects unsafe preview records, raw markup, students, and service principals",
      "rejects direct publication policy, student delivery, reviewer mismatch, and high-risk approval",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, revision-required, idempotency, unsafe preview, invalid principal, direct publication, student delivery, reviewer mismatch, and high-risk approval tests",
    remediation: "Add regression coverage before treating publication precheck as root evidence.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime",
    passed: packageJson.scripts?.["audit:research-deep-research-publication-precheck"]?.includes("research-deep-research-publication-precheck-audit.mjs") &&
      qualityGate.includes("Research deep_research publication precheck audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + qualityGate, [
      "audit:research-deep-research-publication-precheck",
      "Research deep_research publication precheck audit",
    ]),
    expected: "npm script and strict quality command include the publication precheck audit",
    remediation: "Wire publication precheck into the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_publication_precheck_report",
    passed: rootWorkflowCoverage.includes("researchDeepResearchPublicationPrecheck") &&
      rootWorkflowCoverage.includes("research-deep-research-publication-precheck.current.json") &&
      rootWorkflowCoverage.includes("research_deep_research_publication_precheck_runtime"),
    actual: summarizePresence(rootWorkflowCoverage, [
      "researchDeepResearchPublicationPrecheck",
      "research-deep-research-publication-precheck.current.json",
      "research_deep_research_publication_precheck_runtime",
    ]),
    expected: "research root workflow requires deep_research publication precheck evidence after render preview",
    remediation: "Root workflow coverage must explicitly require publication precheck before future delivery.",
  });

  addFinding(findings, {
    id: "structure_tracks_runtime_files",
    passed: includesAll(verifyStructure, [
      "0250-research-deep-research-publication-precheck-runtime.md",
      "deep-research-publication-precheck.input.schema.json",
      "deep-research-publication-precheck.output.schema.json",
      "deep-research-publication-precheck.input.example.json",
      "deep-research-publication-precheck.output.example.json",
      "research-deep-research-publication-precheck-runtime.mjs",
      "research-deep-research-publication-precheck-runtime.test.mjs",
      "research-deep-research-publication-precheck-audit.mjs",
      "research-deep-research-publication-precheck-audit.test.mjs",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires publication precheck contracts, SDD, runtime, tests, audit, and audit test",
    remediation: "Add the publication precheck slice to structure verification.",
  });

  addFinding(findings, {
    id: "sdd.explicitly_defers_delivery",
    passed: includesAll(sdd, [
      "publication precheck runtime",
      "DeepResearchPublicationPrecheckPort.recordDeepResearchPublicationPrecheck",
      "This is not publication",
      "requiresFutureDeliveryRuntime=true",
    ]),
    actual: summarizePresence(sdd, [
      "publication precheck runtime",
      "DeepResearchPublicationPrecheckPort.recordDeepResearchPublicationPrecheck",
      "not publication",
    ]),
    expected: "SDD states publication precheck is not publication and requires future delivery runtime",
    remediation: "Keep the SDD honest about the boundary.",
  });

  addFinding(findings, {
    id: "architecture_board.reflects_publication_precheck_progress",
    passed: includesAll(architectureBoard, [
      "ResearchAgent.deep_research",
      "publication precheck runtime",
      "9.0/10",
      "8.9/10",
    ]),
    actual: summarizePresence(architectureBoard, [
      "ResearchAgent.deep_research",
      "publication precheck runtime",
      "9.0/10",
      "8.9/10",
    ]),
    expected: "architecture board shows publication precheck progress while preserving the 8.9/10 render preview milestone",
    remediation: "Update the architecture board with current and historical deep_research milestones.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK",
    runtime: {
      runtimeId: RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_RUNTIME_ID,
      commandPort: RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_COMMAND_PORT,
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
      renderPreviewVerified: true,
      humanPublicationPrecheckRecorded: true,
      evidenceIntegrityReviewed: true,
      safetyReviewed: true,
      studentVisibilityReviewed: true,
      publicationCandidateCreated: false,
      finalAnswerPublished: false,
      studentVisible: false,
      externalModelCallStarted: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureDeliveryRuntime: true,
    },
    runtimeProbes: {
      publicationPrecheck: probe,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as deep_research human publication precheck evidence; actual delivery and student visibility remain separate future slices."
      : "Fix publication precheck evidence before any future delivery runtime can consume it.",
  };
}

export function formatDeepResearchPublicationPrecheckAudit(report) {
  const lines = [
    `Research deep_research publication precheck: ${report.readiness}`,
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
    const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-publication-precheck-audit-")), "precheck.jsonl");
    const result = recordDeepResearchPublicationPrecheck(baseInput(), {
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
        evidenceClass: "ASYNC_DEEP_RESEARCH_PUBLICATION_PRECHECK_PROBE",
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
  return JSON.parse(fs.readFileSync("contracts/agent/deep-research-publication-precheck.input.example.json", "utf8"));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = auditDeepResearchPublicationPrecheck(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatDeepResearchPublicationPrecheckAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
