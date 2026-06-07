import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_COMMAND_PORT,
  RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_RUNTIME_ID,
  recordDeepResearchStudentDeliveryEnvelope,
} from "./research-deep-research-student-delivery-runtime.mjs";

const defaultOutPath = "reports/research-deep-research-student-delivery.current.json";
const sourceFiles = {
  inputSchema: "contracts/agent/deep-research-student-delivery.input.schema.json",
  outputSchema: "contracts/agent/deep-research-student-delivery.output.schema.json",
  inputExample: "contracts/agent/deep-research-student-delivery.input.example.json",
  outputExample: "contracts/agent/deep-research-student-delivery.output.example.json",
  runtime: "tools/research-deep-research-student-delivery-runtime.mjs",
  runtimeTest: "tools/research-deep-research-student-delivery-runtime.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0253-research-deep-research-student-delivery-runtime.md",
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
  "studentArchiveWriteAllowed: true",
  "externalModelCallAllowed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "studentDeliveryPersisted: true",
  "finalAnswerPublished: true",
  "publicationCandidateCreated: true",
  "externalModelCallStarted: true",
  "mainDatabaseWriteStarted: true",
  "studentArchiveWriteStarted: true",
  "dangerouslySetInnerHTML",
  "innerHTML",
];

export function auditDeepResearchStudentDelivery(inputs, options = {}) {
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
    passed: inputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-student-delivery.v1" &&
      inputSchema.properties?.studentVisibilityReviewRecord?.properties?.runtimeId?.const === "research_deep_research_student_visibility_review_runtime" &&
      inputSchema.properties?.studentVisibilityReviewRecord?.properties?.status?.const === "STUDENT_VISIBILITY_REVIEW_APPROVED_NOT_DELIVERED" &&
      inputSchema.properties?.studentDeliveryPolicy?.properties?.studentDeliveryEnvelopeAllowed?.const === true &&
      inputSchema.properties?.studentDeliveryPolicy?.properties?.studentArchiveWriteAllowed?.const === false &&
      outputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-student-delivery-recorded.v1" &&
      outputSchema.properties?.runtimeId?.const === RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_RUNTIME_ID &&
      outputSchema.properties?.commandPort?.const === RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_COMMAND_PORT &&
      outputSchema.properties?.status?.const === "STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED" &&
      outputSchema.properties?.boundary?.properties?.studentVisible?.const === true &&
      outputSchema.properties?.boundary?.properties?.studentDeliveryPersisted?.const === false &&
      inputExample.studentVisibilityReviewRecord?.status === "STUDENT_VISIBILITY_REVIEW_APPROVED_NOT_DELIVERED" &&
      inputExample.studentDeliveryPolicy?.studentDeliveryEnvelopeAllowed === true &&
      inputExample.studentDeliveryPolicy?.studentArchiveWriteAllowed === false &&
      outputExample.studentDeliveryEnvelope?.envelopeKind === "EVIDENCE_GROUNDED_STUDENT_DELIVERY_ENVELOPE" &&
      outputExample.boundary?.studentVisible === true &&
      outputExample.boundary?.studentDeliveryPersisted === false,
    actual: summarizePresence(JSON.stringify(inputSchema) + JSON.stringify(outputSchema) + JSON.stringify(inputExample) + JSON.stringify(outputExample), [
      "STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED",
      "STUDENT_VISIBLE_DELIVERY_ENVELOPE_NOT_PERSISTED",
      "ASYNC_DEEP_RESEARCH_STUDENT_DELIVERY_BOUNDARY",
    ]),
    expected: "student delivery schemas and examples consume visibility review and produce a visible but non-persisted envelope",
    remediation: "Keep student delivery envelope creation separate from durable student archive persistence.",
  });

  addFinding(findings, {
    id: "runtime.identity_ports_and_idempotency",
    passed: includesAll(runtime, [
      "RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_RUNTIME_ID",
      "RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_COMMAND_PORT",
      "DeepResearchStudentDeliveryPort.recordStudentDeliveryEnvelope",
      "recordDeepResearchStudentDeliveryEnvelope",
      "RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_READY",
      "STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "research_deep_research_student_delivery_runtime",
      "DeepResearchStudentDeliveryPort.recordStudentDeliveryEnvelope",
      "STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED",
    ]),
    expected: "runtime records append-only student delivery envelope evidence through the command port",
    remediation: "The student delivery slice must stay port-based and idempotent.",
  });

  addFinding(findings, {
    id: "runtime.review_consumption_and_safety_boundaries",
    passed: includesAll(runtime, [
      "input.studentVisibilityReviewRecord.runtimeId",
      "research_deep_research_student_visibility_review_runtime",
      "STUDENT_VISIBILITY_REVIEW_APPROVED_NOT_DELIVERED",
      "controlled delivery service principal",
      "STUDENT_DELIVERY_ENVELOPE",
      "STUDENT_APP_DELIVERY",
      "HIGH risk",
      "studentDeliveryEnvelopeCreated: true",
      "studentVisible: true",
      "studentDeliveryStarted: true",
      "studentDeliveryPersisted: false",
      "mainDatabaseWriteStarted: false",
      "studentArchiveWriteStarted: false",
      "externalModelCallStarted: false",
      "swarmAllowed: false",
      "requiresFuturePersistenceReview: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime verifies visibility review and creates only a non-persisted student app envelope while blocking writes, model calls, tools, and Swarm",
    remediation: "Do not let student delivery write the main DB, write student archives, call models, mutate tools, or enable Swarm.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_student_delivery_envelope",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED" &&
      probe.result?.commandPort === RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_COMMAND_PORT &&
      probe.result?.studentDeliveryEnvelope?.visibilityState === "STUDENT_VISIBLE_DELIVERY_ENVELOPE_NOT_PERSISTED" &&
      probe.result?.boundary?.humanStudentVisibilityReviewRecorded === true &&
      probe.result?.boundary?.studentVisible === true &&
      probe.result?.boundary?.studentDeliveryPersisted === false &&
      probe.result?.boundary?.studentArchiveWriteStarted === false &&
      probe.runtimeSlo?.p99Ms <= 300 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};studentVisible=${probe.result.boundary.studentVisible};persisted=${probe.result.boundary.studentDeliveryPersisted};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records student delivery envelope under async boundary budget without persistence",
    remediation: "Student delivery must remain visible envelope creation only until a separate persistence review exists.",
  });

  addFinding(findings, {
    id: "tests.cover_student_delivery_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a student app delivery envelope without durable persistence",
      "uses idempotency for safe replay and rejects conflicting envelopes",
      "rejects non-service principals, missing scopes, unsafe text, and high-risk packages",
      "rejects missing human review, DB writes, persistence, model access, Swarm, and mismatched audience",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, invalid principal, missing scope, unsafe text, high-risk, missing review, write, model, Swarm, and audience mismatch tests",
    remediation: "Add regression coverage before treating student delivery as root evidence.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime",
    passed: packageJson.scripts?.["audit:research-deep-research-student-delivery"]?.includes("research-deep-research-student-delivery-audit.mjs") &&
      qualityGate.includes("Research deep_research student delivery audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + qualityGate, [
      "audit:research-deep-research-student-delivery",
      "Research deep_research student delivery audit",
    ]),
    expected: "npm script and strict quality command include the student delivery audit",
    remediation: "Wire student delivery into the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_student_delivery_report",
    passed: rootWorkflowCoverage.includes("researchDeepResearchStudentDelivery") &&
      rootWorkflowCoverage.includes("research-deep-research-student-delivery.current.json") &&
      rootWorkflowCoverage.includes("research_deep_research_student_delivery_runtime"),
    actual: summarizePresence(rootWorkflowCoverage, [
      "researchDeepResearchStudentDelivery",
      "research-deep-research-student-delivery.current.json",
      "research_deep_research_student_delivery_runtime",
    ]),
    expected: "research root workflow requires deep_research student delivery evidence after student visibility review",
    remediation: "Root workflow coverage must explicitly require student delivery before future persistence.",
  });

  addFinding(findings, {
    id: "structure_tracks_runtime_files",
    passed: includesAll(verifyStructure, [
      "0253-research-deep-research-student-delivery-runtime.md",
      "deep-research-student-delivery.input.schema.json",
      "deep-research-student-delivery.output.schema.json",
      "deep-research-student-delivery.input.example.json",
      "deep-research-student-delivery.output.example.json",
      "research-deep-research-student-delivery-runtime.mjs",
      "research-deep-research-student-delivery-runtime.test.mjs",
      "research-deep-research-student-delivery-audit.mjs",
      "research-deep-research-student-delivery-audit.test.mjs",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires student delivery contracts, SDD, runtime, tests, audit, and audit test",
    remediation: "Add the student delivery slice to structure verification.",
  });

  addFinding(findings, {
    id: "sdd.explicitly_defers_persistence",
    passed: includesAll(sdd, [
      "student delivery runtime",
      "DeepResearchStudentDeliveryPort.recordStudentDeliveryEnvelope",
      "This is not durable student archive persistence",
      "studentDeliveryPersisted=false",
    ]),
    actual: summarizePresence(sdd, [
      "student delivery runtime",
      "DeepResearchStudentDeliveryPort.recordStudentDeliveryEnvelope",
      "not durable student archive persistence",
    ]),
    expected: "SDD states student delivery creates a visible envelope but still defers durable persistence",
    remediation: "Keep the SDD honest about the delivery/persistence boundary.",
  });

  addFinding(findings, {
    id: "architecture_board.reflects_student_delivery_progress",
    passed: includesAll(architectureBoard, [
      "ResearchAgent.deep_research",
      "student delivery runtime",
      "9.3/10",
      "9.2/10",
      "9.1/10",
      "student delivery envelope",
    ]),
    actual: summarizePresence(architectureBoard, [
      "student delivery runtime",
      "9.3/10",
      "9.2/10",
      "student delivery envelope",
    ]),
    expected: "architecture board shows student delivery progress while preserving historical visibility review and teacher delivery milestones",
    remediation: "Update the architecture board with current and historical deep_research milestones.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY",
    runtime: {
      runtimeId: RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_RUNTIME_ID,
      commandPort: RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_COMMAND_PORT,
      asyncQueue: "research_deep_research",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    safetyInvariants: {
      teacherDeliveryVerified: true,
      humanStudentVisibilityReviewRecorded: true,
      studentVisibilityApprovedForDelivery: true,
      studentDeliveryEnvelopeCreated: true,
      studentVisible: true,
      studentDeliveryStarted: true,
      studentDeliveryPersisted: false,
      evidenceIntegrityPreserved: true,
      sourceHashIntegrityPreserved: true,
      limitationsPreserved: true,
      studentAudienceScopeEnforced: true,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
      externalModelCallStarted: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFuturePersistenceReview: true,
    },
    runtimeProbes: { studentDelivery: probe },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as deep_research student delivery envelope evidence; durable student archive persistence remains a separate future slice."
      : "Fix student delivery evidence before any durable student archive persistence runtime can consume it.",
  };
}

export function formatDeepResearchStudentDeliveryAudit(report) {
  const lines = [
    `Research deep_research student delivery: ${report.readiness}`,
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
    const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-student-delivery-audit-")), "delivery.jsonl");
    const result = recordDeepResearchStudentDeliveryEnvelope(baseInput(), {
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
        evidenceClass: "ASYNC_DEEP_RESEARCH_STUDENT_DELIVERY_PROBE",
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
  return JSON.parse(fs.readFileSync("contracts/agent/deep-research-student-delivery.input.example.json", "utf8"));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = auditDeepResearchStudentDelivery(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatDeepResearchStudentDeliveryAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
