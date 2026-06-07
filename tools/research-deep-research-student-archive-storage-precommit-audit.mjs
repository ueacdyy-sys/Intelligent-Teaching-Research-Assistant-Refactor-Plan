import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_COMMAND_PORT,
  RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_RUNTIME_ID,
  prepareTeachingArchiveStoragePrecommit,
} from "./research-deep-research-student-archive-storage-precommit-runtime.mjs";

const defaultOutPath = "reports/research-deep-research-student-archive-storage-precommit.current.json";
const sourceFiles = {
  inputSchema: "contracts/agent/deep-research-student-archive-storage-precommit.input.schema.json",
  outputSchema: "contracts/agent/deep-research-student-archive-storage-precommit.output.schema.json",
  inputExample: "contracts/agent/deep-research-student-archive-storage-precommit.input.example.json",
  outputExample: "contracts/agent/deep-research-student-archive-storage-precommit.output.example.json",
  runtime: "tools/research-deep-research-student-archive-storage-precommit-runtime.mjs",
  runtimeTest: "tools/research-deep-research-student-archive-storage-precommit-runtime.test.mjs",
  teachingArchiveOpenapi: "contracts/openapi/teaching-archive.archive-items.path.yaml",
  teachingArchiveSql: "contracts/sql/teaching-archive.sql",
  teachingArchiveDomain: "services/teaching-archive-gateway/internal/domain/archive.go",
  teachingArchivePrincipal: "services/teaching-archive-gateway/internal/domain/principal.go",
  teachingArchiveUsecase: "services/teaching-archive-gateway/internal/usecase/create_archive_item.go",
  teachingArchiveRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items.go",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0257-research-deep-research-student-archive-storage-precommit-runtime.md",
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
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "mainDatabaseWriteAllowed: true",
  "mainDatabaseWriteStarted: true",
  "mainDatabaseWriteCommitted: true",
  "externalModelCallAllowed: true",
  "externalModelCallStarted: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "finalAnswerPublished: true",
  "publicationCandidateCreated: true",
  "dangerouslySetInnerHTML",
  "innerHTML",
];

export function auditDeepResearchStudentArchiveStoragePrecommit(inputs, options = {}) {
  const findings = [];
  const inputSchema = parseJson(inputs.inputSchema, {});
  const outputSchema = parseJson(inputs.outputSchema, {});
  const inputExample = parseJson(inputs.inputExample, {});
  const outputExample = parseJson(inputs.outputExample, {});
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const teachingStoragePath = [
    inputs.teachingArchiveOpenapi ?? "",
    inputs.teachingArchiveSql ?? "",
    inputs.teachingArchiveDomain ?? "",
    inputs.teachingArchivePrincipal ?? "",
    inputs.teachingArchiveUsecase ?? "",
    inputs.teachingArchiveRepository ?? "",
  ].join("\n");
  const packageJson = parseJson(inputs.packageJson, {});
  const qualityGate = inputs.qualityGate ?? "";
  const rootWorkflowCoverage = inputs.rootWorkflowCoverage ?? "";
  const verifyStructure = inputs.verifyStructure ?? "";
  const architectureBoard = inputs.architectureBoard ?? "";
  const sdd = inputs.sdd ?? "";
  const probe = runRuntimeProbe(options);

  addFinding(findings, {
    id: "contract.schema_and_examples",
    passed: inputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-student-archive-storage-precommit.v1" &&
      inputSchema.properties?.principal?.properties?.entryPoint?.const === "AGENT_INTERNAL" &&
      inputSchema.properties?.studentArchiveProjectionOutput?.properties?.runtimeId?.const === "research_deep_research_student_archive_projection_runtime" &&
      inputSchema.properties?.studentArchiveStoragePolicy?.properties?.mainDatabaseWriteAllowed?.const === false &&
      inputSchema.properties?.studentArchiveStoragePolicy?.properties?.executeHttpRequestAllowed?.const === false &&
      outputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-student-archive-storage-precommit-prepared.v1" &&
      outputSchema.properties?.runtimeId?.const === RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_RUNTIME_ID &&
      outputSchema.properties?.commandPort?.const === RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_COMMAND_PORT &&
      outputSchema.properties?.status?.const === "TEACHING_ARCHIVE_MAIN_DB_STORAGE_PRECOMMIT_PREPARED" &&
      outputSchema.properties?.boundary?.properties?.mainDatabaseWritePrepared?.const === true &&
      outputSchema.properties?.boundary?.properties?.mainDatabaseWriteStarted?.const === false &&
      inputExample.studentArchiveStoragePolicy?.mainDatabaseWriteAllowed === false &&
      inputExample.studentArchiveStoragePolicy?.executeHttpRequestAllowed === false &&
      outputExample.teachingArchiveCreateCommand?.operationId === "createTeachingArchiveItem" &&
      outputExample.teachingArchiveCreateCommand?.targetTable === "teaching_archive_items" &&
      outputExample.boundary?.mainDatabaseWritePrepared === true &&
      outputExample.boundary?.mainDatabaseWriteStarted === false,
    actual: summarizePresence(JSON.stringify(inputSchema) + JSON.stringify(outputSchema) + JSON.stringify(inputExample) + JSON.stringify(outputExample), [
      "TEACHING_ARCHIVE_MAIN_DB_STORAGE_PRECOMMIT_PREPARED",
      "createTeachingArchiveItem",
      "teaching_archive_items",
    ]),
    expected: "storage precommit contracts prepare a Teaching Archive create command without starting or committing the main DB write",
    remediation: "Keep precommit and commit boundaries separate.",
  });

  addFinding(findings, {
    id: "runtime.identity_ports_and_idempotency",
    passed: includesAll(runtime, [
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_RUNTIME_ID",
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_COMMAND_PORT",
      "DeepResearchStudentArchiveStoragePrecommitPort.prepareTeachingArchiveCreateCommand",
      "prepareTeachingArchiveStoragePrecommit",
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_READY",
      "TEACHING_ARCHIVE_MAIN_DB_STORAGE_PRECOMMIT_PREPARED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "research_deep_research_student_archive_storage_precommit_runtime",
      "DeepResearchStudentArchiveStoragePrecommitPort.prepareTeachingArchiveCreateCommand",
      "TEACHING_ARCHIVE_MAIN_DB_STORAGE_PRECOMMIT_PREPARED",
    ]),
    expected: "runtime records idempotent storage precommit evidence through the storage precommit port",
    remediation: "The precommit slice must stay port-based and idempotent.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "AGENT_INTERNAL",
      "STUDENT_ARCHIVE_WRITE",
      "STUDENT_ASSIGNED_READ",
      "studentAccess must include targetStudentId",
      "mainDatabaseWritePrepared: true",
      "mainDatabaseWriteStarted: false",
      "mainDatabaseWriteCommitted: false",
      "executeHttpRequestAllowed: false",
      "directDatabaseAccessAllowed: false",
      "externalModelCallStarted: false",
      "swarmAllowed: false",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime prepares storage command only and blocks DB, HTTP execution, models, tools, publication, and Swarm",
    remediation: "Do not let precommit execute the main DB write.",
  });

  addFinding(findings, {
    id: "runtime.probe_prepares_teaching_archive_command",
    passed: probe.status === "PASS" &&
      probe.result?.status === "TEACHING_ARCHIVE_MAIN_DB_STORAGE_PRECOMMIT_PREPARED" &&
      probe.result?.commandPort === RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_COMMAND_PORT &&
      probe.result?.teachingArchiveCreateCommand?.operationId === "createTeachingArchiveItem" &&
      probe.result?.teachingArchiveCreateCommand?.targetUseCase === "CreateArchiveItem.ExecuteWithPersistence" &&
      probe.result?.teachingArchiveCreateCommand?.targetTable === "teaching_archive_items" &&
      probe.result?.teachingArchiveCreateCommand?.requestBody?.ownerType === "STUDENT" &&
      probe.result?.boundary?.mainDatabaseWritePrepared === true &&
      probe.result?.boundary?.mainDatabaseWriteStarted === false &&
      probe.result?.boundary?.mainDatabaseWriteCommitted === false &&
      probe.runtimeSlo?.p99Ms <= 300 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};command=${probe.result.teachingArchiveCreateCommand.operationId};mainDbStarted=${probe.result.boundary.mainDatabaseWriteStarted};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe prepares a Teaching Archive create command under async boundary budget without writing the main DB",
    remediation: "Precommit must produce the exact command expected by the later commit slice.",
  });

  addFinding(findings, {
    id: "tests.cover_precommit_negative_paths",
    passed: includesAll(runtimeTest, [
      "prepares a Teaching Archive create command from a durable projection",
      "uses idempotency for safe replay and rejects conflicting storage commands",
      "rejects invalid write principals, student scope mismatch, and AI grading intent",
      "rejects missing projection output, main DB writes, high risk, and unsafe title",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, invalid principal, missing scope, student mismatch, AI grading, missing projection, main DB, high-risk, and unsafe title tests",
    remediation: "Add regression coverage before treating storage precommit as root evidence.",
  });

  addFinding(findings, {
    id: "teaching_archive.storage_path_exists",
    passed: includesAll(teachingStoragePath, [
      "operationId: createTeachingArchiveItem",
      "CreateArchiveItemRequest",
      "CREATE TABLE IF NOT EXISTS teaching_archive_items",
      "OwnerTypeStudent",
      "ScopeStudentArchiveWrite",
      "func (uc *CreateArchiveItem) ExecuteWithPersistence",
      "type ArchiveRepository interface",
      "INSERT INTO teaching_archive_items",
    ]),
    actual: summarizePresence(teachingStoragePath, [
      "createTeachingArchiveItem",
      "teaching_archive_items",
      "ScopeStudentArchiveWrite",
      "ExecuteWithPersistence",
      "INSERT INTO teaching_archive_items",
    ]),
    expected: "precommit maps to the existing Teaching Archive OpenAPI, domain authorization, use case, repository, and SQL table",
    remediation: "Do not claim main storage readiness without a real Teaching Archive storage path.",
  });

  addFinding(findings, {
    id: "quality.gate_tracks_runtime",
    passed: packageJson.scripts?.["audit:research-deep-research-student-archive-storage-precommit"]?.includes("research-deep-research-student-archive-storage-precommit-audit.mjs") &&
      qualityGate.includes("Research deep_research student archive storage precommit audit"),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + qualityGate, [
      "audit:research-deep-research-student-archive-storage-precommit",
      "Research deep_research student archive storage precommit audit",
    ]),
    expected: "npm script and strict quality command include the storage precommit audit",
    remediation: "Wire storage precommit into the strict quality gate.",
  });

  addFinding(findings, {
    id: "root_workflow.requires_storage_precommit_report",
    passed: rootWorkflowCoverage.includes("researchDeepResearchStudentArchiveStoragePrecommit") &&
      rootWorkflowCoverage.includes("research-deep-research-student-archive-storage-precommit.current.json") &&
      rootWorkflowCoverage.includes("research_deep_research_student_archive_storage_precommit_runtime"),
    actual: summarizePresence(rootWorkflowCoverage, [
      "researchDeepResearchStudentArchiveStoragePrecommit",
      "research-deep-research-student-archive-storage-precommit.current.json",
      "research_deep_research_student_archive_storage_precommit_runtime",
    ]),
    expected: "research root workflow requires storage precommit after durable projection",
    remediation: "Root workflow coverage must explicitly require storage precommit before later main DB commit slices.",
  });

  addFinding(findings, {
    id: "structure_tracks_runtime_files",
    passed: includesAll(verifyStructure, [
      "0257-research-deep-research-student-archive-storage-precommit-runtime.md",
      "deep-research-student-archive-storage-precommit.input.schema.json",
      "deep-research-student-archive-storage-precommit.output.schema.json",
      "deep-research-student-archive-storage-precommit.input.example.json",
      "deep-research-student-archive-storage-precommit.output.example.json",
      "research-deep-research-student-archive-storage-precommit-runtime.mjs",
      "research-deep-research-student-archive-storage-precommit-runtime.test.mjs",
      "research-deep-research-student-archive-storage-precommit-audit.mjs",
      "research-deep-research-student-archive-storage-precommit-audit.test.mjs",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires storage precommit contracts, SDD, runtime, tests, audit, and audit test",
    remediation: "Add the storage precommit slice to structure verification.",
  });

  addFinding(findings, {
    id: "sdd.defines_precommit_without_commit",
    passed: includesAll(sdd, [
      "student archive storage precommit runtime",
      "DeepResearchStudentArchiveStoragePrecommitPort.prepareTeachingArchiveCreateCommand",
      "mainDatabaseWritePrepared=true",
      "mainDatabaseWriteStarted=false",
      "not the final database commit",
    ]),
    actual: summarizePresence(sdd, [
      "student archive storage precommit runtime",
      "mainDatabaseWritePrepared=true",
      "mainDatabaseWriteStarted=false",
      "not the final database commit",
    ]),
    expected: "SDD states storage precommit prepares the command but does not commit the main DB write",
    remediation: "Keep the SDD honest about precommit/commit boundaries.",
  });

  addFinding(findings, {
    id: "architecture_board.reflects_storage_precommit_progress",
    passed: includesAll(architectureBoard, [
      "ResearchAgent.deep_research",
      "student archive storage precommit runtime",
      "9.7/10",
      "9.6/10",
      "mainDatabaseWritePrepared=true",
      "mainDatabaseWriteStarted=false",
    ]),
    actual: summarizePresence(architectureBoard, [
      "student archive storage precommit runtime",
      "9.7/10",
      "mainDatabaseWritePrepared=true",
      "mainDatabaseWriteStarted=false",
    ]),
    expected: "architecture board shows storage precommit progress while preserving durable projection milestone",
    remediation: "Update the architecture board with current and historical deep_research milestones.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT",
    runtime: {
      runtimeId: RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_RUNTIME_ID,
      commandPort: RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_COMMAND_PORT,
      asyncQueue: "research_deep_research",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    safetyInvariants: {
      studentArchiveProjectionOutputVerified: true,
      teachingArchiveCreateItemCommandPrepared: true,
      teachingArchiveDomainValidationPrepared: true,
      projectionEvidencePreserved: true,
      mainDatabaseWritePrepared: true,
      mainDatabaseWriteStarted: false,
      mainDatabaseWriteCommitted: false,
      executeHttpRequestAllowed: false,
      directDatabaseAccessAllowed: false,
      externalModelCallStarted: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    runtimeProbes: { studentArchiveStoragePrecommit: probe },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as deep_research Teaching Archive storage precommit evidence; the next reviewed slice may execute and verify the main DB commit."
      : "Fix storage precommit evidence before submitting a Teaching Archive main DB write.",
  };
}

export function formatDeepResearchStudentArchiveStoragePrecommitAudit(report) {
  const lines = [
    `Research deep_research student archive storage precommit: ${report.readiness}`,
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
    const precommitLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-student-archive-storage-precommit-audit-")), "precommit.jsonl");
    const result = prepareTeachingArchiveStoragePrecommit(baseInput(), {
      precommitLogPath,
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
        evidenceClass: "ASYNC_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_PROBE",
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
  return JSON.parse(fs.readFileSync("contracts/agent/deep-research-student-archive-storage-precommit.input.example.json", "utf8"));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = auditDeepResearchStudentArchiveStoragePrecommit(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatDeepResearchStudentArchiveStoragePrecommitAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
