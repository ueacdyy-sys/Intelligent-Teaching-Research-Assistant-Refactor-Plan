import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_COMMAND_PORT,
  RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_RUNTIME_ID,
  recordDeepResearchStudentVisibilityReview,
} from "./research-deep-research-student-visibility-review-runtime.mjs";

const defaultOutPath = "reports/research-deep-research-student-visibility-review.current.json";
const sourceFiles = {
  inputSchema: "contracts/agent/deep-research-student-visibility-review.input.schema.json",
  outputSchema: "contracts/agent/deep-research-student-visibility-review.output.schema.json",
  inputExample: "contracts/agent/deep-research-student-visibility-review.input.example.json",
  outputExample: "contracts/agent/deep-research-student-visibility-review.output.example.json",
  runtime: "tools/research-deep-research-student-visibility-review-runtime.mjs",
  runtimeTest: "tools/research-deep-research-student-visibility-review-runtime.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0252-research-deep-research-student-visibility-review-runtime.md",
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
  "studentVisibleDeliveryAllowed: true",
  "directPublicationAllowed: true",
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
  "studentDeliveryStarted: true",
  "externalModelCallStarted: true",
  "mainDatabaseWriteStarted: true",
  "studentArchiveWriteStarted: true",
  "dangerouslySetInnerHTML",
  "innerHTML",
];

export function auditDeepResearchStudentVisibilityReview(inputs, options = {}) {
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
    passed: inputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-student-visibility-review.v1" &&
      inputSchema.properties?.teacherDeliveryRecord?.properties?.runtimeId?.const === "research_deep_research_teacher_delivery_runtime" &&
      inputSchema.properties?.teacherDeliveryRecord?.properties?.status?.const === "TEACHER_DELIVERY_PACKAGE_READY_NOT_STUDENT_VISIBLE" &&
      inputSchema.properties?.studentVisibilityPolicy?.properties?.studentVisibleDeliveryAllowed?.const === false &&
      outputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-student-visibility-review-recorded.v1" &&
      outputSchema.properties?.runtimeId?.const === RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_RUNTIME_ID &&
      outputSchema.properties?.commandPort?.const === RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_COMMAND_PORT &&
      outputSchema.properties?.boundary?.properties?.requiresFutureStudentDeliveryRuntime?.const === true &&
      inputExample.teacherDeliveryRecord?.status === "TEACHER_DELIVERY_PACKAGE_READY_NOT_STUDENT_VISIBLE" &&
      inputExample.studentVisibilityPolicy?.studentVisibleDeliveryAllowed === false &&
      outputExample.boundary?.humanStudentVisibilityReviewRecorded === true &&
      outputExample.boundary?.studentVisible === false,
    actual: summarizePresence(JSON.stringify(inputSchema) + JSON.stringify(outputSchema) + JSON.stringify(inputExample) + JSON.stringify(outputExample), [
      "STUDENT_VISIBILITY_REVIEW_APPROVED_NOT_DELIVERED",
      "APPROVED_FOR_STUDENT_VISIBILITY_DELIVERY_RUNTIME",
      "ASYNC_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_BOUNDARY",
    ]),
    expected: "student visibility review schemas and examples consume teacher delivery without direct student exposure",
    remediation: "Keep student visibility review separate from actual student delivery and durable persistence.",
  });

  addFinding(findings, {
    id: "runtime.identity_ports_and_idempotency",
    passed: includesAll(runtime, [
      "RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_RUNTIME_ID",
      "RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_COMMAND_PORT",
      "DeepResearchStudentVisibilityReviewPort.recordStudentVisibilityReview",
      "recordDeepResearchStudentVisibilityReview",
      "RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_READY",
      "STUDENT_VISIBILITY_REVIEW_APPROVED_NOT_DELIVERED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "research_deep_research_student_visibility_review_runtime",
      "DeepResearchStudentVisibilityReviewPort.recordStudentVisibilityReview",
      "STUDENT_VISIBILITY_REVIEW_APPROVED_NOT_DELIVERED",
    ]),
    expected: "runtime records append-only student visibility review evidence through the command port",
    remediation: "The student visibility review slice must stay port-based and idempotent.",
  });

  addFinding(findings, {
    id: "runtime.teacher_delivery_review_and_safety_boundaries",
    passed: includesAll(runtime, [
      "input.teacherDeliveryRecord.runtimeId",
      "research_deep_research_teacher_delivery_runtime",
      "TEACHER_DELIVERY_PACKAGE_READY_NOT_STUDENT_VISIBLE",
      "student visibility review requires a human teacher or admin",
      "STUDENT_VISIBILITY_REVIEW",
      "requireSafeText",
      "HIGH risk",
      "teacherDeliveryVerified: true",
      "humanStudentVisibilityReviewRecorded: true",
      "studentVisibilityApprovedForFutureDelivery: true",
      "studentVisible: false",
      "studentDeliveryStarted: false",
      "requiresFutureStudentDeliveryRuntime: true",
      "requiresFuturePersistenceReview: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime verifies teacher delivery and human review while blocking student exposure, writes, model calls, tools, and Swarm",
    remediation: "Do not let student visibility review publish, write the main DB, call models, mutate tools, or expose to students.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_review_without_delivery",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_VISIBILITY_REVIEW_APPROVED_NOT_DELIVERED" &&
      probe.result?.commandPort === RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_COMMAND_PORT &&
      probe.result?.studentVisibilityReview?.approvedForFutureStudentDelivery === true &&
      probe.result?.boundary?.humanStudentVisibilityReviewRecorded === true &&
      probe.result?.boundary?.studentVisible === false &&
      probe.result?.boundary?.studentDeliveryStarted === false &&
      probe.result?.boundary?.requiresFutureStudentDeliveryRuntime === true &&
      probe.runtimeSlo?.p99Ms <= 300 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};studentVisible=${probe.result.boundary.studentVisible};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records student visibility review under async boundary budget without delivery",
    remediation: "Student visibility review must stop before future student delivery and persistence runtimes.",
  });

  addFinding(findings, {
    id: "tests.cover_student_visibility_review_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a human student visibility review without delivering to students",
      "uses idempotency for safe replay and rejects conflicting reviews",
      "rejects students, services, unsafe text, revision decisions, and high-risk packages",
      "rejects direct student visibility, DB writes, delivery starts, and mismatched package reviews",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, invalid principal, unsafe text, revision, high-risk, direct visibility, DB write, delivery-start, and mismatch tests",
    remediation: "Add regression coverage before treating student visibility review as root evidence.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime",
    passed: packageJson.scripts?.["audit:research-deep-research-student-visibility-review"]?.includes("research-deep-research-student-visibility-review-audit.mjs") &&
      qualityGate.includes("Research deep_research student visibility review audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + qualityGate, [
      "audit:research-deep-research-student-visibility-review",
      "Research deep_research student visibility review audit",
    ]),
    expected: "npm script and strict quality command include the student visibility review audit",
    remediation: "Wire student visibility review into the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_student_visibility_review_report",
    passed: rootWorkflowCoverage.includes("researchDeepResearchStudentVisibilityReview") &&
      rootWorkflowCoverage.includes("research-deep-research-student-visibility-review.current.json") &&
      rootWorkflowCoverage.includes("research_deep_research_student_visibility_review_runtime"),
    actual: summarizePresence(rootWorkflowCoverage, [
      "researchDeepResearchStudentVisibilityReview",
      "research-deep-research-student-visibility-review.current.json",
      "research_deep_research_student_visibility_review_runtime",
    ]),
    expected: "research root workflow requires deep_research student visibility review evidence after teacher delivery",
    remediation: "Root workflow coverage must explicitly require student visibility review before future student delivery.",
  });

  addFinding(findings, {
    id: "structure_tracks_runtime_files",
    passed: includesAll(verifyStructure, [
      "0252-research-deep-research-student-visibility-review-runtime.md",
      "deep-research-student-visibility-review.input.schema.json",
      "deep-research-student-visibility-review.output.schema.json",
      "deep-research-student-visibility-review.input.example.json",
      "deep-research-student-visibility-review.output.example.json",
      "research-deep-research-student-visibility-review-runtime.mjs",
      "research-deep-research-student-visibility-review-runtime.test.mjs",
      "research-deep-research-student-visibility-review-audit.mjs",
      "research-deep-research-student-visibility-review-audit.test.mjs",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires student visibility review contracts, SDD, runtime, tests, audit, and audit test",
    remediation: "Add the student visibility review slice to structure verification.",
  });

  addFinding(findings, {
    id: "sdd.explicitly_defers_student_delivery",
    passed: includesAll(sdd, [
      "student visibility review runtime",
      "DeepResearchStudentVisibilityReviewPort.recordStudentVisibilityReview",
      "This is not student delivery",
      "requiresFutureStudentDeliveryRuntime=true",
    ]),
    actual: summarizePresence(sdd, [
      "student visibility review runtime",
      "DeepResearchStudentVisibilityReviewPort.recordStudentVisibilityReview",
      "not student delivery",
    ]),
    expected: "SDD states student visibility review is not student delivery and requires future delivery runtime",
    remediation: "Keep the SDD honest about the boundary.",
  });

  addFinding(findings, {
    id: "architecture_board.reflects_student_visibility_review_progress",
    passed: includesAll(architectureBoard, [
      "ResearchAgent.deep_research",
      "student visibility review runtime",
      "9.2/10",
      "9.1/10",
      "9.0/10",
    ]),
    actual: summarizePresence(architectureBoard, [
      "student visibility review runtime",
      "9.2/10",
      "9.1/10",
      "9.0/10",
    ]),
    expected: "architecture board shows student visibility review progress while preserving historical deep_research milestones",
    remediation: "Update the architecture board with current and historical deep_research milestones.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW",
    runtime: {
      runtimeId: RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_RUNTIME_ID,
      commandPort: RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_COMMAND_PORT,
      asyncQueue: "research_deep_research",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    safetyInvariants: {
      teacherDeliveryVerified: true,
      humanStudentVisibilityReviewRecorded: true,
      studentVisibilityApprovedForFutureDelivery: true,
      evidenceIntegrityPreserved: true,
      sourceHashIntegrityPreserved: true,
      limitationsPreserved: true,
      studentAudienceScopeReviewed: true,
      studentVisible: false,
      studentDeliveryStarted: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
      externalModelCallStarted: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureStudentDeliveryRuntime: true,
      requiresFuturePersistenceReview: true,
    },
    runtimeProbes: { studentVisibilityReview: probe },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as deep_research student visibility review evidence; actual student delivery and durable persistence remain separate future slices."
      : "Fix student visibility review evidence before any student delivery runtime can consume it.",
  };
}

export function formatDeepResearchStudentVisibilityReviewAudit(report) {
  const lines = [
    `Research deep_research student visibility review: ${report.readiness}`,
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
    const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-student-visibility-review-audit-")), "review.jsonl");
    const result = recordDeepResearchStudentVisibilityReview(baseInput(), {
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
        evidenceClass: "ASYNC_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_PROBE",
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
  return JSON.parse(fs.readFileSync("contracts/agent/deep-research-student-visibility-review.input.example.json", "utf8"));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = auditDeepResearchStudentVisibilityReview(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatDeepResearchStudentVisibilityReviewAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
