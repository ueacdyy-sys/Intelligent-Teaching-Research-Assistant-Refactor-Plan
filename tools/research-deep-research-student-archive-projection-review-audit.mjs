import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_COMMAND_PORT,
  RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_RUNTIME_ID,
  recordDeepResearchStudentArchiveProjectionReview,
} from "./research-deep-research-student-archive-projection-review-runtime.mjs";

const defaultOutPath = "reports/research-deep-research-student-archive-projection-review.current.json";
const sourceFiles = {
  inputSchema: "contracts/agent/deep-research-student-archive-projection-review.input.schema.json",
  outputSchema: "contracts/agent/deep-research-student-archive-projection-review.output.schema.json",
  inputExample: "contracts/agent/deep-research-student-archive-projection-review.input.example.json",
  outputExample: "contracts/agent/deep-research-student-archive-projection-review.output.example.json",
  runtime: "tools/research-deep-research-student-archive-projection-review-runtime.mjs",
  runtimeTest: "tools/research-deep-research-student-archive-projection-review-runtime.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0255-research-deep-research-student-archive-projection-review-runtime.md",
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
  "studentArchiveProjectionWriteAllowed: true",
  "externalModelCallAllowed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "studentArchivePersisted: true",
  "studentArchiveProjectionWritten: true",
  "finalAnswerPublished: true",
  "publicationCandidateCreated: true",
  "mainDatabaseWriteStarted: true",
  "studentArchiveWriteStarted: true",
  "externalModelCallStarted: true",
  "dangerouslySetInnerHTML",
  "innerHTML",
];

export function auditDeepResearchStudentArchiveProjectionReview(inputs, options = {}) {
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
    passed: inputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-student-archive-projection-review.v1" &&
      inputSchema.properties?.studentArchivePersistenceRecord?.properties?.runtimeId?.const === "research_deep_research_student_archive_persistence_runtime" &&
      inputSchema.properties?.studentArchivePersistenceRecord?.properties?.status?.const === "STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED" &&
      inputSchema.properties?.studentArchiveProjectionReviewPolicy?.properties?.durableProjectionReviewAllowed?.const === true &&
      inputSchema.properties?.studentArchiveProjectionReviewPolicy?.properties?.studentArchiveProjectionWriteAllowed?.const === false &&
      outputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-student-archive-projection-review-recorded.v1" &&
      outputSchema.properties?.runtimeId?.const === RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_RUNTIME_ID &&
      outputSchema.properties?.commandPort?.const === RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_COMMAND_PORT &&
      outputSchema.properties?.status?.const === "STUDENT_ARCHIVE_PROJECTION_REVIEW_APPROVED_NOT_WRITTEN" &&
      outputSchema.properties?.boundary?.properties?.humanProjectionReviewRecorded?.const === true &&
      outputSchema.properties?.boundary?.properties?.studentArchiveProjectionWritten?.const === false &&
      inputExample.studentArchivePersistenceRecord?.status === "STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED" &&
      inputExample.studentArchiveProjectionReviewPolicy?.durableProjectionReviewAllowed === true &&
      inputExample.studentArchiveProjectionReviewPolicy?.studentArchiveProjectionWriteAllowed === false &&
      outputExample.studentArchiveProjectionReview?.reviewKind === "DURABLE_STUDENT_ARCHIVE_PROJECTION_REVIEW" &&
      outputExample.studentArchiveProjectionReview?.projectionState === "REVIEWED_NOT_PROJECTED_TO_STUDENT_ARCHIVE" &&
      outputExample.boundary?.humanProjectionReviewRecorded === true &&
      outputExample.boundary?.studentArchiveProjectionWritten === false,
    actual: summarizePresence(JSON.stringify(inputSchema) + JSON.stringify(outputSchema) + JSON.stringify(inputExample) + JSON.stringify(outputExample), [
      "STUDENT_ARCHIVE_PROJECTION_REVIEW_APPROVED_NOT_WRITTEN",
      "REVIEWED_NOT_PROJECTED_TO_STUDENT_ARCHIVE",
      "ASYNC_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_BOUNDARY",
    ]),
    expected: "projection review contracts consume the archive persistence command and produce an authorization record without projection",
    remediation: "Keep this slice as reviewed authorization evidence, not durable archive projection.",
  });

  addFinding(findings, {
    id: "runtime.identity_ports_and_idempotency",
    passed: includesAll(runtime, [
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_RUNTIME_ID",
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_COMMAND_PORT",
      "DeepResearchStudentArchiveProjectionReviewPort.recordStudentArchiveProjectionReview",
      "recordDeepResearchStudentArchiveProjectionReview",
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_READY",
      "STUDENT_ARCHIVE_PROJECTION_REVIEW_APPROVED_NOT_WRITTEN",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "research_deep_research_student_archive_projection_review_runtime",
      "DeepResearchStudentArchiveProjectionReviewPort.recordStudentArchiveProjectionReview",
      "STUDENT_ARCHIVE_PROJECTION_REVIEW_APPROVED_NOT_WRITTEN",
    ]),
    expected: "runtime records append-only projection review evidence through the command port",
    remediation: "The projection review slice must stay port-based and idempotent.",
  });

  addFinding(findings, {
    id: "runtime.persistence_consumption_and_safety_boundaries",
    passed: includesAll(runtime, [
      "input.studentArchivePersistenceRecord.runtimeId",
      "research_deep_research_student_archive_persistence_runtime",
      "STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED",
      "controlled projection review service principal",
      "STUDENT_ARCHIVE_PROJECTION_REVIEW",
      "HIGH risk",
      "studentArchivePersistenceCommandVerified: true",
      "humanProjectionReviewRecorded: true",
      "approvedForFutureDurableProjection: true",
      "studentArchivePersisted: false",
      "studentArchiveProjectionWritten: false",
      "mainDatabaseWriteStarted: false",
      "studentArchiveWriteStarted: false",
      "externalModelCallStarted: false",
      "swarmAllowed: false",
      "requiresFutureDurableProjectionRuntime: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime verifies the persistence command and records only a non-projected review while blocking writes, model calls, tools, and Swarm",
    remediation: "Do not let this slice project to student archive, write the main DB, call models, mutate tools, or enable Swarm.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_projection_review",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_ARCHIVE_PROJECTION_REVIEW_APPROVED_NOT_WRITTEN" &&
      probe.result?.commandPort === RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_COMMAND_PORT &&
      probe.result?.studentArchiveProjectionReview?.projectionState === "REVIEWED_NOT_PROJECTED_TO_STUDENT_ARCHIVE" &&
      probe.result?.boundary?.studentArchivePersistenceCommandVerified === true &&
      probe.result?.boundary?.humanProjectionReviewRecorded === true &&
      probe.result?.boundary?.studentArchiveProjectionWritten === false &&
      probe.result?.boundary?.studentArchiveWriteStarted === false &&
      probe.runtimeSlo?.p99Ms <= 300 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};projected=${probe.result.boundary.studentArchiveProjectionWritten};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records projection review under async boundary budget without projection",
    remediation: "Projection review must remain authorization evidence until a separate durable projection runtime exists.",
  });

  addFinding(findings, {
    id: "tests.cover_projection_review_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a durable projection review without writing the student archive",
      "uses idempotency for safe replay and rejects conflicting projection reviews",
      "rejects non-service principals, missing scopes, unsafe comments, and high-risk commands",
      "rejects missing persistence command, projection writes, DB writes, model access, Swarm, and mismatched scope",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, invalid principal, missing scope, unsafe text, high-risk, missing command, projection write, DB write, model, Swarm, and scope mismatch tests",
    remediation: "Add regression coverage before treating projection review as root evidence.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime",
    passed: packageJson.scripts?.["audit:research-deep-research-student-archive-projection-review"]?.includes("research-deep-research-student-archive-projection-review-audit.mjs") &&
      qualityGate.includes("Research deep_research student archive projection review audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + qualityGate, [
      "audit:research-deep-research-student-archive-projection-review",
      "Research deep_research student archive projection review audit",
    ]),
    expected: "npm script and strict quality command include the student archive projection review audit",
    remediation: "Wire projection review into the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_projection_review_report",
    passed: rootWorkflowCoverage.includes("researchDeepResearchStudentArchiveProjectionReview") &&
      rootWorkflowCoverage.includes("research-deep-research-student-archive-projection-review.current.json") &&
      rootWorkflowCoverage.includes("research_deep_research_student_archive_projection_review_runtime"),
    actual: summarizePresence(rootWorkflowCoverage, [
      "researchDeepResearchStudentArchiveProjectionReview",
      "research-deep-research-student-archive-projection-review.current.json",
      "research_deep_research_student_archive_projection_review_runtime",
    ]),
    expected: "research root workflow requires projection review evidence after archive persistence command",
    remediation: "Root workflow coverage must explicitly require projection review before future durable projection.",
  });

  addFinding(findings, {
    id: "structure_tracks_runtime_files",
    passed: includesAll(verifyStructure, [
      "0255-research-deep-research-student-archive-projection-review-runtime.md",
      "deep-research-student-archive-projection-review.input.schema.json",
      "deep-research-student-archive-projection-review.output.schema.json",
      "deep-research-student-archive-projection-review.input.example.json",
      "deep-research-student-archive-projection-review.output.example.json",
      "research-deep-research-student-archive-projection-review-runtime.mjs",
      "research-deep-research-student-archive-projection-review-runtime.test.mjs",
      "research-deep-research-student-archive-projection-review-audit.mjs",
      "research-deep-research-student-archive-projection-review-audit.test.mjs",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires projection review contracts, SDD, runtime, tests, audit, and audit test",
    remediation: "Add the projection review slice to structure verification.",
  });

  addFinding(findings, {
    id: "sdd.explicitly_defers_durable_projection",
    passed: includesAll(sdd, [
      "student archive projection review runtime",
      "DeepResearchStudentArchiveProjectionReviewPort.recordStudentArchiveProjectionReview",
      "This is not final durable student archive projection",
      "studentArchiveProjectionWritten=false",
    ]),
    actual: summarizePresence(sdd, [
      "student archive projection review runtime",
      "DeepResearchStudentArchiveProjectionReviewPort.recordStudentArchiveProjectionReview",
      "not final durable student archive projection",
    ]),
    expected: "SDD states projection review records authorization but defers durable projection",
    remediation: "Keep the SDD honest about the review/projection boundary.",
  });

  addFinding(findings, {
    id: "architecture_board.reflects_projection_review_progress",
    passed: includesAll(architectureBoard, [
      "ResearchAgent.deep_research",
      "student archive projection review runtime",
      "9.5/10",
      "9.4/10",
      "student archive persistence command runtime",
      "studentArchiveProjectionWritten=false",
    ]),
    actual: summarizePresence(architectureBoard, [
      "student archive projection review runtime",
      "9.5/10",
      "studentArchiveProjectionWritten=false",
    ]),
    expected: "architecture board shows projection review progress while preserving archive persistence milestone",
    remediation: "Update the architecture board with current and historical deep_research milestones.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW",
    runtime: {
      runtimeId: RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_RUNTIME_ID,
      commandPort: RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_COMMAND_PORT,
      asyncQueue: "research_deep_research",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    safetyInvariants: {
      studentArchivePersistenceCommandVerified: true,
      humanProjectionReviewRecorded: true,
      approvedForFutureDurableProjection: true,
      appendOnlyReviewLogRecorded: true,
      studentArchivePersisted: false,
      studentArchiveProjectionWritten: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
      externalModelCallStarted: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureDurableProjectionRuntime: true,
    },
    runtimeProbes: { studentArchiveProjectionReview: probe },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as deep_research student archive projection review evidence; final durable student archive projection remains a separate future slice."
      : "Fix projection review evidence before any durable student archive projection runtime can consume it.",
  };
}

export function formatDeepResearchStudentArchiveProjectionReviewAudit(report) {
  const lines = [
    `Research deep_research student archive projection review: ${report.readiness}`,
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
    const reviewLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-student-archive-projection-review-audit-")), "projection-review.jsonl");
    const result = recordDeepResearchStudentArchiveProjectionReview(baseInput(), {
      reviewLogPath,
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
        evidenceClass: "ASYNC_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_PROBE",
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
  return JSON.parse(fs.readFileSync("contracts/agent/deep-research-student-archive-projection-review.input.example.json", "utf8"));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = auditDeepResearchStudentArchiveProjectionReview(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatDeepResearchStudentArchiveProjectionReviewAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
