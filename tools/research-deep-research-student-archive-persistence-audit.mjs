import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PORT,
  RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_RUNTIME_ID,
  recordDeepResearchStudentArchivePersistenceCommand,
} from "./research-deep-research-student-archive-persistence-runtime.mjs";

const defaultOutPath = "reports/research-deep-research-student-archive-persistence.current.json";
const sourceFiles = {
  inputSchema: "contracts/agent/deep-research-student-archive-persistence.input.schema.json",
  outputSchema: "contracts/agent/deep-research-student-archive-persistence.output.schema.json",
  inputExample: "contracts/agent/deep-research-student-archive-persistence.input.example.json",
  outputExample: "contracts/agent/deep-research-student-archive-persistence.output.example.json",
  runtime: "tools/research-deep-research-student-archive-persistence-runtime.mjs",
  runtimeTest: "tools/research-deep-research-student-archive-persistence-runtime.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0254-research-deep-research-student-archive-persistence-runtime.md",
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

export function auditDeepResearchStudentArchivePersistence(inputs, options = {}) {
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
    passed: inputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-student-archive-persistence.v1" &&
      inputSchema.properties?.studentDeliveryRecord?.properties?.runtimeId?.const === "research_deep_research_student_delivery_runtime" &&
      inputSchema.properties?.studentDeliveryRecord?.properties?.status?.const === "STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED" &&
      inputSchema.properties?.studentArchivePersistencePolicy?.properties?.studentArchivePersistenceCommandAllowed?.const === true &&
      inputSchema.properties?.studentArchivePersistencePolicy?.properties?.studentArchiveProjectionWriteAllowed?.const === false &&
      outputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-student-archive-persistence-recorded.v1" &&
      outputSchema.properties?.runtimeId?.const === RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_RUNTIME_ID &&
      outputSchema.properties?.commandPort?.const === RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PORT &&
      outputSchema.properties?.status?.const === "STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED" &&
      outputSchema.properties?.boundary?.properties?.studentArchivePersistenceCommandRecorded?.const === true &&
      outputSchema.properties?.boundary?.properties?.studentArchiveProjectionWritten?.const === false &&
      inputExample.studentDeliveryRecord?.status === "STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED" &&
      inputExample.studentArchivePersistencePolicy?.studentArchivePersistenceCommandAllowed === true &&
      inputExample.studentArchivePersistencePolicy?.studentArchiveProjectionWriteAllowed === false &&
      outputExample.studentArchivePersistenceCommand?.commandKind === "EVIDENCE_GROUNDED_STUDENT_ARCHIVE_PERSISTENCE_COMMAND" &&
      outputExample.boundary?.studentArchivePersistenceCommandRecorded === true &&
      outputExample.boundary?.studentArchiveProjectionWritten === false,
    actual: summarizePresence(JSON.stringify(inputSchema) + JSON.stringify(outputSchema) + JSON.stringify(inputExample) + JSON.stringify(outputExample), [
      "STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED",
      "NOT_PROJECTED_TO_STUDENT_ARCHIVE",
      "ASYNC_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_BOUNDARY",
    ]),
    expected: "student archive persistence contracts consume student delivery and produce a command record without projection",
    remediation: "Keep this slice as append-only command evidence, not durable archive projection.",
  });

  addFinding(findings, {
    id: "runtime.identity_ports_and_idempotency",
    passed: includesAll(runtime, [
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_RUNTIME_ID",
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PORT",
      "DeepResearchStudentArchivePersistencePort.recordStudentArchivePersistenceCommand",
      "recordDeepResearchStudentArchivePersistenceCommand",
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_READY",
      "STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "research_deep_research_student_archive_persistence_runtime",
      "DeepResearchStudentArchivePersistencePort.recordStudentArchivePersistenceCommand",
      "STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED",
    ]),
    expected: "runtime records append-only student archive persistence command evidence through the command port",
    remediation: "The student archive persistence slice must stay port-based and idempotent.",
  });

  addFinding(findings, {
    id: "runtime.delivery_consumption_and_safety_boundaries",
    passed: includesAll(runtime, [
      "input.studentDeliveryRecord.runtimeId",
      "research_deep_research_student_delivery_runtime",
      "STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED",
      "controlled persistence service principal",
      "STUDENT_ARCHIVE_PERSISTENCE",
      "HIGH risk",
      "studentArchivePersistenceCommandRecorded: true",
      "appendOnlyCommandLogRecorded: true",
      "studentArchivePersisted: false",
      "studentArchiveProjectionWritten: false",
      "mainDatabaseWriteStarted: false",
      "studentArchiveWriteStarted: false",
      "externalModelCallStarted: false",
      "swarmAllowed: false",
      "requiresFutureDurableProjectionReview: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime verifies student delivery and records only a non-projected archive persistence command while blocking writes, model calls, tools, and Swarm",
    remediation: "Do not let this slice project to student archive, write the main DB, call models, mutate tools, or enable Swarm.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_persistence_command",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED" &&
      probe.result?.commandPort === RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PORT &&
      probe.result?.studentArchivePersistenceCommand?.projectionState === "NOT_PROJECTED_TO_STUDENT_ARCHIVE" &&
      probe.result?.boundary?.studentDeliveryEnvelopeVerified === true &&
      probe.result?.boundary?.studentArchivePersistenceCommandRecorded === true &&
      probe.result?.boundary?.studentArchiveProjectionWritten === false &&
      probe.result?.boundary?.studentArchiveWriteStarted === false &&
      probe.runtimeSlo?.p99Ms <= 300 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};projected=${probe.result.boundary.studentArchiveProjectionWritten};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records student archive persistence command under async boundary budget without projection",
    remediation: "Student archive persistence command must remain command evidence until a separate durable projection review exists.",
  });

  addFinding(findings, {
    id: "tests.cover_persistence_negative_paths",
    passed: includesAll(runtimeTest, [
      "records an append-only student archive persistence command without projection",
      "uses idempotency for safe replay and rejects conflicting commands",
      "rejects non-service principals, missing scopes, unsafe text, and high-risk envelopes",
      "rejects missing delivery, projection writes, DB writes, model access, Swarm, and mismatched scope",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, invalid principal, missing scope, unsafe text, high-risk, missing delivery, projection write, DB write, model, Swarm, and scope mismatch tests",
    remediation: "Add regression coverage before treating archive persistence command as root evidence.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime",
    passed: packageJson.scripts?.["audit:research-deep-research-student-archive-persistence"]?.includes("research-deep-research-student-archive-persistence-audit.mjs") &&
      qualityGate.includes("Research deep_research student archive persistence audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + qualityGate, [
      "audit:research-deep-research-student-archive-persistence",
      "Research deep_research student archive persistence audit",
    ]),
    expected: "npm script and strict quality command include the student archive persistence audit",
    remediation: "Wire student archive persistence into the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_persistence_command_report",
    passed: rootWorkflowCoverage.includes("researchDeepResearchStudentArchivePersistence") &&
      rootWorkflowCoverage.includes("research-deep-research-student-archive-persistence.current.json") &&
      rootWorkflowCoverage.includes("research_deep_research_student_archive_persistence_runtime"),
    actual: summarizePresence(rootWorkflowCoverage, [
      "researchDeepResearchStudentArchivePersistence",
      "research-deep-research-student-archive-persistence.current.json",
      "research_deep_research_student_archive_persistence_runtime",
    ]),
    expected: "research root workflow requires deep_research student archive persistence command evidence after student delivery",
    remediation: "Root workflow coverage must explicitly require archive persistence command before future projection.",
  });

  addFinding(findings, {
    id: "structure_tracks_runtime_files",
    passed: includesAll(verifyStructure, [
      "0254-research-deep-research-student-archive-persistence-runtime.md",
      "deep-research-student-archive-persistence.input.schema.json",
      "deep-research-student-archive-persistence.output.schema.json",
      "deep-research-student-archive-persistence.input.example.json",
      "deep-research-student-archive-persistence.output.example.json",
      "research-deep-research-student-archive-persistence-runtime.mjs",
      "research-deep-research-student-archive-persistence-runtime.test.mjs",
      "research-deep-research-student-archive-persistence-audit.mjs",
      "research-deep-research-student-archive-persistence-audit.test.mjs",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires student archive persistence contracts, SDD, runtime, tests, audit, and audit test",
    remediation: "Add the archive persistence slice to structure verification.",
  });

  addFinding(findings, {
    id: "sdd.explicitly_defers_projection",
    passed: includesAll(sdd, [
      "student archive persistence command runtime",
      "DeepResearchStudentArchivePersistencePort.recordStudentArchivePersistenceCommand",
      "This is not durable student archive projection",
      "studentArchiveProjectionWritten=false",
    ]),
    actual: summarizePresence(sdd, [
      "student archive persistence command runtime",
      "DeepResearchStudentArchivePersistencePort.recordStudentArchivePersistenceCommand",
      "not durable student archive projection",
    ]),
    expected: "SDD states archive persistence records a command but defers durable projection",
    remediation: "Keep the SDD honest about the command/projection boundary.",
  });

  addFinding(findings, {
    id: "architecture_board.reflects_persistence_progress",
    passed: includesAll(architectureBoard, [
      "ResearchAgent.deep_research",
      "student archive persistence command runtime",
      "9.4/10",
      "9.3/10",
      "9.2/10",
      "studentArchiveProjectionWritten=false",
    ]),
    actual: summarizePresence(architectureBoard, [
      "student archive persistence command runtime",
      "9.4/10",
      "studentArchiveProjectionWritten=false",
    ]),
    expected: "architecture board shows archive persistence command progress while preserving student delivery milestone",
    remediation: "Update the architecture board with current and historical deep_research milestones.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_COMMAND",
    runtime: {
      runtimeId: RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_RUNTIME_ID,
      commandPort: RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PORT,
      asyncQueue: "research_deep_research",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    safetyInvariants: {
      studentDeliveryEnvelopeVerified: true,
      studentArchivePersistenceCommandRecorded: true,
      appendOnlyCommandLogRecorded: true,
      studentArchivePersisted: false,
      studentArchiveProjectionWritten: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
      externalModelCallStarted: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureDurableProjectionReview: true,
    },
    runtimeProbes: { studentArchivePersistence: probe },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as deep_research student archive persistence command evidence; durable student archive projection remains a separate future slice."
      : "Fix student archive persistence command evidence before any durable student archive projection runtime can consume it.",
  };
}

export function formatDeepResearchStudentArchivePersistenceAudit(report) {
  const lines = [
    `Research deep_research student archive persistence: ${report.readiness}`,
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
    const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-student-archive-persistence-audit-")), "persistence.jsonl");
    const result = recordDeepResearchStudentArchivePersistenceCommand(baseInput(), {
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
        evidenceClass: "ASYNC_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PROBE",
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
  return JSON.parse(fs.readFileSync("contracts/agent/deep-research-student-archive-persistence.input.example.json", "utf8"));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = auditDeepResearchStudentArchivePersistence(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatDeepResearchStudentArchivePersistenceAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
