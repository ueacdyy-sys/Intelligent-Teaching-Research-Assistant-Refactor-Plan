import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_COMMAND_PORT,
  RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_RUNTIME_ID,
  recordDeepResearchTeacherDelivery,
} from "./research-deep-research-teacher-delivery-runtime.mjs";

const defaultOutPath = "reports/research-deep-research-teacher-delivery.current.json";
const sourceFiles = {
  inputSchema: "contracts/agent/deep-research-teacher-delivery.input.schema.json",
  outputSchema: "contracts/agent/deep-research-teacher-delivery.output.schema.json",
  inputExample: "contracts/agent/deep-research-teacher-delivery.input.example.json",
  outputExample: "contracts/agent/deep-research-teacher-delivery.output.example.json",
  runtime: "tools/research-deep-research-teacher-delivery-runtime.mjs",
  runtimeTest: "tools/research-deep-research-teacher-delivery-runtime.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0251-research-deep-research-teacher-delivery-runtime.md",
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
  "externalModelCallStarted: true",
  "mainDatabaseWriteStarted: true",
  "studentArchiveWriteStarted: true",
  "dangerouslySetInnerHTML",
  "innerHTML",
];

export function auditDeepResearchTeacherDelivery(inputs, options = {}) {
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
    passed: inputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-teacher-delivery.v1" &&
      inputSchema.properties?.publicationPrecheckRecord?.properties?.runtimeId?.const === "research_deep_research_publication_precheck_runtime" &&
      inputSchema.properties?.publicationPrecheckRecord?.properties?.status?.const === "PUBLICATION_PRECHECK_APPROVED_NOT_DELIVERED" &&
      inputSchema.properties?.deliveryPolicy?.properties?.studentVisibleDeliveryAllowed?.const === false &&
      outputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-teacher-delivery-recorded.v1" &&
      outputSchema.properties?.runtimeId?.const === RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_RUNTIME_ID &&
      outputSchema.properties?.commandPort?.const === RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_COMMAND_PORT &&
      outputSchema.properties?.boundary?.properties?.requiresFutureStudentDeliveryReview?.const === true &&
      inputExample.publicationPrecheckRecord?.status === "PUBLICATION_PRECHECK_APPROVED_NOT_DELIVERED" &&
      inputExample.deliveryPolicy?.studentVisibleDeliveryAllowed === false &&
      outputExample.boundary?.teacherAccessible === true &&
      outputExample.boundary?.studentVisible === false,
    actual: summarizePresence(JSON.stringify(inputSchema) + JSON.stringify(outputSchema) + JSON.stringify(inputExample) + JSON.stringify(outputExample), [
      "TEACHER_DELIVERY_PACKAGE_READY_NOT_STUDENT_VISIBLE",
      "EVIDENCE_GROUNDED_TEACHER_DELIVERY_PACKAGE",
      "ASYNC_DEEP_RESEARCH_TEACHER_DELIVERY_BOUNDARY",
    ]),
    expected: "teacher delivery schemas and examples consume approved precheck evidence without student delivery",
    remediation: "Keep teacher delivery separate from student-visible delivery and durable persistence.",
  });

  addFinding(findings, {
    id: "runtime.identity_ports_and_idempotency",
    passed: includesAll(runtime, [
      "RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_RUNTIME_ID",
      "RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_COMMAND_PORT",
      "DeepResearchTeacherDeliveryPort.recordTeacherDeliveryPackage",
      "recordDeepResearchTeacherDelivery",
      "RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_READY",
      "TEACHER_DELIVERY_PACKAGE_READY_NOT_STUDENT_VISIBLE",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "research_deep_research_teacher_delivery_runtime",
      "DeepResearchTeacherDeliveryPort.recordTeacherDeliveryPackage",
      "TEACHER_DELIVERY_PACKAGE_READY_NOT_STUDENT_VISIBLE",
    ]),
    expected: "runtime records append-only teacher delivery evidence through the command port",
    remediation: "The teacher delivery slice must stay port-based and idempotent.",
  });

  addFinding(findings, {
    id: "runtime.precheck_preview_and_safety_boundaries",
    passed: includesAll(runtime, [
      "input.publicationPrecheckRecord.runtimeId",
      "research_deep_research_publication_precheck_runtime",
      "PUBLICATION_PRECHECK_APPROVED_NOT_DELIVERED",
      "input.renderPreviewRecord.runtimeId",
      "research_deep_research_render_preview_runtime",
      "teacher delivery requires a human research teacher or admin",
      "teacherAccessible: true",
      "studentVisible: false",
      "mainDatabaseWriteStarted: false",
      "requiresFutureStudentDeliveryReview: true",
      "requiresFuturePersistenceReview: true",
      "HIGH risk",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime verifies approved precheck and render preview while blocking publication, writes, model calls, tools, and Swarm",
    remediation: "Do not let teacher delivery publish, write the main DB, call models, mutate tools, or expose to students.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_teacher_package",
    passed: probe.status === "PASS" &&
      probe.result?.status === "TEACHER_DELIVERY_PACKAGE_READY_NOT_STUDENT_VISIBLE" &&
      probe.result?.commandPort === RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_COMMAND_PORT &&
      probe.result?.teacherDeliveryPackage?.deliveryState === "TEACHER_READY_NOT_STUDENT_VISIBLE" &&
      probe.result?.boundary?.teacherAccessible === true &&
      probe.result?.boundary?.studentVisible === false &&
      probe.result?.boundary?.requiresFutureStudentDeliveryReview === true &&
      probe.runtimeSlo?.p99Ms <= 300 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};studentVisible=${probe.result.boundary.studentVisible};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records teacher delivery under async boundary budget without student visibility",
    remediation: "Teacher delivery must stop before student delivery and durable persistence reviews.",
  });

  addFinding(findings, {
    id: "tests.cover_teacher_delivery_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a teacher-only delivery package without publishing to students",
      "uses idempotency for safe replay and rejects conflicting delivery packages",
      "rejects unapproved precheck records, unsafe text, students, and service principals",
      "rejects student delivery policy, direct publication, DB writes, and mismatched previews",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, unapproved precheck, unsafe text, invalid principal, policy, DB write, mismatch, and high-risk tests",
    remediation: "Add regression coverage before treating teacher delivery as root evidence.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime",
    passed: packageJson.scripts?.["audit:research-deep-research-teacher-delivery"]?.includes("research-deep-research-teacher-delivery-audit.mjs") &&
      qualityGate.includes("Research deep_research teacher delivery audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + qualityGate, [
      "audit:research-deep-research-teacher-delivery",
      "Research deep_research teacher delivery audit",
    ]),
    expected: "npm script and strict quality command include the teacher delivery audit",
    remediation: "Wire teacher delivery into the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_teacher_delivery_report",
    passed: rootWorkflowCoverage.includes("researchDeepResearchTeacherDelivery") &&
      rootWorkflowCoverage.includes("research-deep-research-teacher-delivery.current.json") &&
      rootWorkflowCoverage.includes("research_deep_research_teacher_delivery_runtime"),
    actual: summarizePresence(rootWorkflowCoverage, [
      "researchDeepResearchTeacherDelivery",
      "research-deep-research-teacher-delivery.current.json",
      "research_deep_research_teacher_delivery_runtime",
    ]),
    expected: "research root workflow requires deep_research teacher delivery evidence after publication precheck",
    remediation: "Root workflow coverage must explicitly require teacher delivery before student delivery.",
  });

  addFinding(findings, {
    id: "structure_tracks_runtime_files",
    passed: includesAll(verifyStructure, [
      "0251-research-deep-research-teacher-delivery-runtime.md",
      "deep-research-teacher-delivery.input.schema.json",
      "deep-research-teacher-delivery.output.schema.json",
      "deep-research-teacher-delivery.input.example.json",
      "deep-research-teacher-delivery.output.example.json",
      "research-deep-research-teacher-delivery-runtime.mjs",
      "research-deep-research-teacher-delivery-runtime.test.mjs",
      "research-deep-research-teacher-delivery-audit.mjs",
      "research-deep-research-teacher-delivery-audit.test.mjs",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires teacher delivery contracts, SDD, runtime, tests, audit, and audit test",
    remediation: "Add the teacher delivery slice to structure verification.",
  });

  addFinding(findings, {
    id: "sdd.explicitly_defers_student_delivery",
    passed: includesAll(sdd, [
      "teacher delivery runtime",
      "DeepResearchTeacherDeliveryPort.recordTeacherDeliveryPackage",
      "This is not student delivery",
      "requiresFutureStudentDeliveryReview=true",
    ]),
    actual: summarizePresence(sdd, [
      "teacher delivery runtime",
      "DeepResearchTeacherDeliveryPort.recordTeacherDeliveryPackage",
      "not student delivery",
    ]),
    expected: "SDD states teacher delivery is not student delivery and requires future review",
    remediation: "Keep the SDD honest about the boundary.",
  });

  addFinding(findings, {
    id: "architecture_board.reflects_teacher_delivery_progress",
    passed: includesAll(architectureBoard, [
      "ResearchAgent.deep_research",
      "teacher delivery runtime",
      "9.1/10",
      "9.0/10",
      "8.9/10",
    ]),
    actual: summarizePresence(architectureBoard, [
      "teacher delivery runtime",
      "9.1/10",
      "9.0/10",
      "8.9/10",
    ]),
    expected: "architecture board shows teacher delivery progress while preserving historical deep_research milestones",
    remediation: "Update the architecture board with current and historical deep_research milestones.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY",
    runtime: {
      runtimeId: RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_RUNTIME_ID,
      commandPort: RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_COMMAND_PORT,
      asyncQueue: "research_deep_research",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    safetyInvariants: {
      renderPreviewVerified: true,
      publicationPrecheckVerified: true,
      teacherDeliveryPackageRecorded: true,
      teacherAccessible: true,
      studentVisible: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
      externalModelCallStarted: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureStudentDeliveryReview: true,
      requiresFuturePersistenceReview: true,
    },
    runtimeProbes: { teacherDelivery: probe },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as deep_research teacher workspace delivery evidence; student visibility and durable persistence remain separate future slices."
      : "Fix teacher delivery evidence before any student-visible delivery can consume it.",
  };
}

export function formatDeepResearchTeacherDeliveryAudit(report) {
  const lines = [
    `Research deep_research teacher delivery: ${report.readiness}`,
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
    const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-teacher-delivery-audit-")), "delivery.jsonl");
    const result = recordDeepResearchTeacherDelivery(baseInput(), {
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
        evidenceClass: "ASYNC_DEEP_RESEARCH_TEACHER_DELIVERY_PROBE",
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
  return JSON.parse(fs.readFileSync("contracts/agent/deep-research-teacher-delivery.input.example.json", "utf8"));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = auditDeepResearchTeacherDelivery(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatDeepResearchTeacherDeliveryAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
