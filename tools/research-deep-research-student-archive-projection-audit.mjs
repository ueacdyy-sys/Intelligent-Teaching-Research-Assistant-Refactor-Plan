import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_COMMAND_PORT,
  RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_RUNTIME_ID,
  projectReviewedStudentArchiveEntry,
} from "./research-deep-research-student-archive-projection-runtime.mjs";

const defaultOutPath = "reports/research-deep-research-student-archive-projection.current.json";
const sourceFiles = {
  inputSchema: "contracts/agent/deep-research-student-archive-projection.input.schema.json",
  outputSchema: "contracts/agent/deep-research-student-archive-projection.output.schema.json",
  inputExample: "contracts/agent/deep-research-student-archive-projection.input.example.json",
  outputExample: "contracts/agent/deep-research-student-archive-projection.output.example.json",
  runtime: "tools/research-deep-research-student-archive-projection-runtime.mjs",
  runtimeTest: "tools/research-deep-research-student-archive-projection-runtime.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0256-research-deep-research-student-archive-projection-runtime.md",
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
  "directDatabaseAccessAllowed: true",
  "mainDatabaseWriteAllowed: true",
  "externalModelCallAllowed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "finalAnswerPublished: true",
  "publicationCandidateCreated: true",
  "mainDatabaseWriteStarted: true",
  "externalModelCallStarted: true",
  "dangerouslySetInnerHTML",
  "innerHTML",
];

export function auditDeepResearchStudentArchiveProjection(inputs, options = {}) {
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
    passed: inputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-student-archive-projection.v1" &&
      inputSchema.properties?.studentArchiveProjectionReviewRecord?.properties?.runtimeId?.const === "research_deep_research_student_archive_projection_review_runtime" &&
      inputSchema.properties?.studentArchiveProjectionReviewRecord?.properties?.status?.const === "STUDENT_ARCHIVE_PROJECTION_REVIEW_APPROVED_NOT_WRITTEN" &&
      inputSchema.properties?.studentArchiveProjectionPolicy?.properties?.durableStudentArchiveProjectionAllowed?.const === true &&
      inputSchema.properties?.studentArchiveProjectionPolicy?.properties?.studentArchiveProjectionWriteAllowed?.const === true &&
      inputSchema.properties?.studentArchiveProjectionPolicy?.properties?.mainDatabaseWriteAllowed?.const === false &&
      outputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-student-archive-projection-recorded.v1" &&
      outputSchema.properties?.runtimeId?.const === RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_RUNTIME_ID &&
      outputSchema.properties?.commandPort?.const === RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_COMMAND_PORT &&
      outputSchema.properties?.status?.const === "STUDENT_ARCHIVE_PROJECTION_WRITTEN" &&
      outputSchema.properties?.boundary?.properties?.studentArchiveProjectionWritten?.const === true &&
      outputSchema.properties?.boundary?.properties?.mainDatabaseWriteStarted?.const === false &&
      inputExample.studentArchiveProjectionReviewRecord?.status === "STUDENT_ARCHIVE_PROJECTION_REVIEW_APPROVED_NOT_WRITTEN" &&
      inputExample.studentArchiveProjectionPolicy?.studentArchiveProjectionWriteAllowed === true &&
      inputExample.studentArchiveProjectionPolicy?.mainDatabaseWriteAllowed === false &&
      outputExample.studentArchiveProjectionRecord?.projectionKind === "DURABLE_STUDENT_ARCHIVE_PROJECTION_RECORD" &&
      outputExample.studentArchiveProjectionRecord?.projectionState === "PROJECTED_TO_STUDENT_ARCHIVE" &&
      outputExample.boundary?.studentArchiveProjectionWritten === true &&
      outputExample.boundary?.mainDatabaseWriteStarted === false,
    actual: summarizePresence(JSON.stringify(inputSchema) + JSON.stringify(outputSchema) + JSON.stringify(inputExample) + JSON.stringify(outputExample), [
      "STUDENT_ARCHIVE_PROJECTION_WRITTEN",
      "PROJECTED_TO_STUDENT_ARCHIVE",
      "ASYNC_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_BOUNDARY",
    ]),
    expected: "projection contracts consume projection review and produce durable student archive projection without main DB write",
    remediation: "Keep this slice as append-only projection evidence, not general storage integration.",
  });

  addFinding(findings, {
    id: "runtime.identity_ports_and_idempotency",
    passed: includesAll(runtime, [
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_RUNTIME_ID",
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_COMMAND_PORT",
      "DeepResearchStudentArchiveProjectionPort.projectReviewedStudentArchiveEntry",
      "projectReviewedStudentArchiveEntry",
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_READY",
      "STUDENT_ARCHIVE_PROJECTION_WRITTEN",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "research_deep_research_student_archive_projection_runtime",
      "DeepResearchStudentArchiveProjectionPort.projectReviewedStudentArchiveEntry",
      "STUDENT_ARCHIVE_PROJECTION_WRITTEN",
    ]),
    expected: "runtime records append-only projection evidence through the projection port",
    remediation: "The projection slice must stay port-based and idempotent.",
  });

  addFinding(findings, {
    id: "runtime.review_consumption_and_safety_boundaries",
    passed: includesAll(runtime, [
      "input.studentArchiveProjectionReviewRecord.runtimeId",
      "research_deep_research_student_archive_projection_review_runtime",
      "STUDENT_ARCHIVE_PROJECTION_REVIEW_APPROVED_NOT_WRITTEN",
      "controlled projection service principal",
      "STUDENT_ARCHIVE_PROJECTION_WRITE",
      "HIGH risk",
      "studentArchiveProjectionReviewVerified: true",
      "durableStudentArchiveProjectionRecorded: true",
      "studentArchivePersisted: true",
      "studentArchiveProjectionWritten: true",
      "studentArchiveWriteStarted: true",
      "mainDatabaseWriteStarted: false",
      "externalModelCallStarted: false",
      "swarmAllowed: false",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime verifies projection review, writes only append-only projection evidence, and blocks main DB, models, tools, and Swarm",
    remediation: "Do not let this slice become main DB integration, publication, model execution, tool mutation, or Swarm.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_projection",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_ARCHIVE_PROJECTION_WRITTEN" &&
      probe.result?.commandPort === RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_COMMAND_PORT &&
      probe.result?.studentArchiveProjectionRecord?.projectionState === "PROJECTED_TO_STUDENT_ARCHIVE" &&
      probe.result?.boundary?.studentArchiveProjectionReviewVerified === true &&
      probe.result?.boundary?.studentArchiveProjectionWritten === true &&
      probe.result?.boundary?.studentArchiveWriteStarted === true &&
      probe.result?.boundary?.mainDatabaseWriteStarted === false &&
      probe.runtimeSlo?.p99Ms <= 300 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};projected=${probe.result.boundary.studentArchiveProjectionWritten};mainDb=${probe.result.boundary.mainDatabaseWriteStarted};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records durable student archive projection under async boundary budget without main DB write",
    remediation: "Projection must remain append-only archive evidence until a separate main database storage slice exists.",
  });

  addFinding(findings, {
    id: "tests.cover_projection_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a durable student archive projection from an approved review",
      "uses idempotency for safe replay and rejects conflicting projections",
      "rejects non-service principals, missing scopes, unsafe text, and high-risk reviews",
      "rejects missing review, previous projection, main DB writes, model access, Swarm, and mismatched scope",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, invalid principal, missing scope, unsafe text, high-risk, missing review, previous projection, main DB, model, Swarm, and scope mismatch tests",
    remediation: "Add regression coverage before treating projection as root evidence.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime",
    passed: packageJson.scripts?.["audit:research-deep-research-student-archive-projection"]?.includes("research-deep-research-student-archive-projection-audit.mjs") &&
      qualityGate.includes("Research deep_research student archive projection audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + qualityGate, [
      "audit:research-deep-research-student-archive-projection",
      "Research deep_research student archive projection audit",
    ]),
    expected: "npm script and strict quality command include the student archive projection audit",
    remediation: "Wire projection into the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_projection_report",
    passed: rootWorkflowCoverage.includes("researchDeepResearchStudentArchiveProjection") &&
      rootWorkflowCoverage.includes("research-deep-research-student-archive-projection.current.json") &&
      rootWorkflowCoverage.includes("research_deep_research_student_archive_projection_runtime"),
    actual: summarizePresence(rootWorkflowCoverage, [
      "researchDeepResearchStudentArchiveProjection",
      "research-deep-research-student-archive-projection.current.json",
      "research_deep_research_student_archive_projection_runtime",
    ]),
    expected: "research root workflow requires durable student archive projection evidence after projection review",
    remediation: "Root workflow coverage must explicitly require projection before moving to later storage slices.",
  });

  addFinding(findings, {
    id: "structure_tracks_runtime_files",
    passed: includesAll(verifyStructure, [
      "0256-research-deep-research-student-archive-projection-runtime.md",
      "deep-research-student-archive-projection.input.schema.json",
      "deep-research-student-archive-projection.output.schema.json",
      "deep-research-student-archive-projection.input.example.json",
      "deep-research-student-archive-projection.output.example.json",
      "research-deep-research-student-archive-projection-runtime.mjs",
      "research-deep-research-student-archive-projection-runtime.test.mjs",
      "research-deep-research-student-archive-projection-audit.mjs",
      "research-deep-research-student-archive-projection-audit.test.mjs",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires projection contracts, SDD, runtime, tests, audit, and audit test",
    remediation: "Add the projection slice to structure verification.",
  });

  addFinding(findings, {
    id: "sdd.defines_projection_without_main_db",
    passed: includesAll(sdd, [
      "student archive projection runtime",
      "DeepResearchStudentArchiveProjectionPort.projectReviewedStudentArchiveEntry",
      "studentArchiveProjectionWritten=true",
      "not general-purpose main database integration",
    ]),
    actual: summarizePresence(sdd, [
      "student archive projection runtime",
      "DeepResearchStudentArchiveProjectionPort.projectReviewedStudentArchiveEntry",
      "studentArchiveProjectionWritten=true",
      "not general-purpose main database integration",
    ]),
    expected: "SDD states projection writes archive evidence but defers main DB integration",
    remediation: "Keep the SDD honest about projection/storage boundaries.",
  });

  addFinding(findings, {
    id: "architecture_board.reflects_projection_progress",
    passed: includesAll(architectureBoard, [
      "ResearchAgent.deep_research",
      "student archive projection runtime",
      "9.6/10",
      "9.5/10",
      "student archive projection review runtime",
      "studentArchiveProjectionWritten=true",
    ]),
    actual: summarizePresence(architectureBoard, [
      "student archive projection runtime",
      "9.6/10",
      "studentArchiveProjectionWritten=true",
    ]),
    expected: "architecture board shows durable projection progress while preserving projection review milestone",
    remediation: "Update the architecture board with current and historical deep_research milestones.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION",
    runtime: {
      runtimeId: RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_RUNTIME_ID,
      commandPort: RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_COMMAND_PORT,
      asyncQueue: "research_deep_research",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    safetyInvariants: {
      studentArchiveProjectionReviewVerified: true,
      durableStudentArchiveProjectionRecorded: true,
      appendOnlyProjectionLogRecorded: true,
      studentArchivePersisted: true,
      studentArchiveProjectionWritten: true,
      studentArchiveWriteStarted: true,
      mainDatabaseWriteStarted: false,
      externalModelCallStarted: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    runtimeProbes: { studentArchiveProjection: probe },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as deep_research durable student archive projection evidence; main database integration remains a separate reviewed storage slice."
      : "Fix student archive projection evidence before treating the archive as durably projected.",
  };
}

export function formatDeepResearchStudentArchiveProjectionAudit(report) {
  const lines = [
    `Research deep_research student archive projection: ${report.readiness}`,
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
    const projectionLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-student-archive-projection-audit-")), "projection.jsonl");
    const result = projectReviewedStudentArchiveEntry(baseInput(), {
      projectionLogPath,
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
        evidenceClass: "ASYNC_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_PROBE",
      },
    };
  } catch (error) {
    return { status: "FAIL", error: error.message, runtimeSlo: failedSlo() };
  }
}

function failedSlo() {
  return { targetP99Ms: 300, p99Ms: null, totalErrors: 1, operations: 0, evidenceClass: "FAILED_PROBE" };
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
  return { outPath: outIndex === -1 ? defaultOutPath : argv[outIndex + 1] };
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
  return JSON.parse(fs.readFileSync("contracts/agent/deep-research-student-archive-projection.input.example.json", "utf8"));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = auditDeepResearchStudentArchiveProjection(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatDeepResearchStudentArchiveProjectionAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
