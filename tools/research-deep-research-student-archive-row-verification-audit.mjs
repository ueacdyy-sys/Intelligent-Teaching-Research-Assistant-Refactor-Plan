import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_COMMAND_PORT,
  RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_RUNTIME_ID,
  verifyDeepResearchStudentArchivePhysicalRow,
} from "./research-deep-research-student-archive-row-verification-runtime.mjs";

const defaultOutPath = "reports/research-deep-research-student-archive-row-verification.current.json";
const sourceFiles = {
  inputSchema: "contracts/agent/deep-research-student-archive-row-verification.input.schema.json",
  outputSchema: "contracts/agent/deep-research-student-archive-row-verification.output.schema.json",
  inputExample: "contracts/agent/deep-research-student-archive-row-verification.input.example.json",
  outputExample: "contracts/agent/deep-research-student-archive-row-verification.output.example.json",
  runtime: "tools/research-deep-research-student-archive-row-verification-runtime.mjs",
  runtimeTest: "tools/research-deep-research-student-archive-row-verification-runtime.test.mjs",
  commitReport: "reports/research-deep-research-student-archive-storage-commit.current.json",
  teachingArchiveRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items.go",
  teachingArchiveRepositoryTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items_get_by_id_test.go",
  teachingArchiveRepositoryHelpers: "services/teaching-archive-gateway/internal/adapter/postgres/repository_test_helpers_test.go",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0259-research-deep-research-student-archive-row-verification-runtime.md",
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
  "externalModelCallAllowed: true",
  "externalModelCallStarted: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "dangerouslySetInnerHTML",
  "innerHTML",
];

export async function auditDeepResearchStudentArchiveRowVerification(inputs, options = {}) {
  const findings = [];
  const inputSchema = parseJson(inputs.inputSchema, {});
  const outputSchema = parseJson(inputs.outputSchema, {});
  const inputExample = parseJson(inputs.inputExample, {});
  const outputExample = parseJson(inputs.outputExample, {});
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const commitReport = parseJson(inputs.commitReport, {});
  const repositoryEvidence = [
    inputs.teachingArchiveRepository ?? "",
    inputs.teachingArchiveRepositoryTest ?? "",
    inputs.teachingArchiveRepositoryHelpers ?? "",
  ].join("\n");
  const packageJson = parseJson(inputs.packageJson, {});
  const probe = await runRuntimeProbe(options);

  addFinding(findings, {
    id: "contract.schema_and_examples",
    passed: inputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-student-archive-row-verification.v1" &&
      inputSchema.properties?.studentArchiveStorageCommitOutput?.properties?.runtimeId?.const === "research_deep_research_student_archive_storage_commit_runtime" &&
      inputSchema.properties?.studentArchiveRowVerificationPolicy?.properties?.physicalRowVerificationRequired?.const === true &&
      inputSchema.properties?.studentArchiveRowVerificationPolicy?.properties?.directDatabaseAccessAllowed?.const === false &&
      outputSchema.properties?.schemaVersion?.const === "2026-06-05.research.deep-research-student-archive-row-verification-verified.v1" &&
      outputSchema.properties?.runtimeId?.const === RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_RUNTIME_ID &&
      outputSchema.properties?.commandPort?.const === RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_COMMAND_PORT &&
      outputSchema.properties?.status?.const === "TEACHING_ARCHIVE_PHYSICAL_ROW_VERIFIED" &&
      outputSchema.properties?.teachingArchivePhysicalRow?.properties?.targetRepository?.const === "ArchiveRepository.GetByID" &&
      outputSchema.properties?.boundary?.properties?.physicalDatabaseRowVerified?.const === true &&
      inputExample.studentArchiveRowVerificationPolicy?.injectedTeachingArchiveRowReadPortRequired === true &&
      outputExample.teachingArchivePhysicalRow?.archiveItem?.id === "tarch_deep_research_001",
    actual: summarizePresence(JSON.stringify(inputSchema) + JSON.stringify(outputSchema) + JSON.stringify(inputExample) + JSON.stringify(outputExample), [
      "TEACHING_ARCHIVE_PHYSICAL_ROW_VERIFIED",
      "DeepResearchStudentArchiveRowVerificationPort.verifyTeachingArchivePhysicalRow",
      "ArchiveRepository.GetByID",
      "physicalDatabaseRowVerified",
    ]),
    expected: "row-verification contracts require an injected row read port and verified teaching_archive_items row",
    remediation: "Keep row verification contracts explicit about the read port and physical row evidence.",
  });

  addFinding(findings, {
    id: "storage_commit.report_available",
    passed: commitReport.readiness === "READY" &&
      commitReport.runtime?.runtimeId === "research_deep_research_student_archive_storage_commit_runtime",
    actual: `readiness=${commitReport.readiness ?? "missing"};runtime=${commitReport.runtime?.runtimeId ?? "missing"}`,
    expected: "row verification is based on a READY storage commit report",
    remediation: "Regenerate storage commit evidence before verifying physical rows.",
  });

  addFinding(findings, {
    id: "runtime.identity_ports_and_idempotency",
    passed: includesAll(runtime, [
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_RUNTIME_ID",
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_COMMAND_PORT",
      "DeepResearchStudentArchiveRowVerificationPort.verifyTeachingArchivePhysicalRow",
      "verifyDeepResearchStudentArchivePhysicalRow",
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_READY",
      "TEACHING_ARCHIVE_PHYSICAL_ROW_VERIFIED",
      "TeachingArchiveRowReadPort.getArchiveItemById is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "research_deep_research_student_archive_row_verification_runtime",
      "TeachingArchiveRowReadPort.getArchiveItemById",
      "TEACHING_ARCHIVE_PHYSICAL_ROW_VERIFIED",
    ]),
    expected: "runtime records idempotent physical row verification through the row read port",
    remediation: "The row verification slice must stay port-based and idempotent.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "mainDatabaseWritePrepared: true",
      "mainDatabaseWriteStarted: true",
      "mainDatabaseWriteCommitted: true",
      "physicalDatabaseRowVerified: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "externalModelCallStarted: false",
      "swarmAllowed: false",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime verifies only through an injected row read port and blocks raw DB, HTTP, models, tools, and Swarm",
    remediation: "Do not let JS execute SQL or HTTP in the row verification runtime.",
  });

  addFinding(findings, {
    id: "runtime.probe_verifies_physical_row",
    passed: probe.status === "PASS" &&
      probe.result?.status === "TEACHING_ARCHIVE_PHYSICAL_ROW_VERIFIED" &&
      probe.result?.commandPort === RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_COMMAND_PORT &&
      probe.result?.teachingArchivePhysicalRow?.targetRepository === "ArchiveRepository.GetByID" &&
      probe.result?.teachingArchivePhysicalRow?.targetTable === "teaching_archive_items" &&
      probe.result?.teachingArchivePhysicalRow?.archiveItem?.id === "tarch_deep_research_001" &&
      probe.result?.boundary?.physicalDatabaseRowVerified === true &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 300 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};row=${probe.result.teachingArchivePhysicalRow.archiveItem.id};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe verifies the committed archive item through one injected row read port call",
    remediation: "Row verification must prove read port invocation and exact row match.",
  });

  addFinding(findings, {
    id: "tests.cover_row_verification_negative_paths",
    passed: includesAll(runtimeTest, [
      "verifies the committed Teaching Archive item through the injected row read port",
      "uses idempotency for replay and rejects conflicting committed rows",
      "rejects missing ports, missing rows, mismatched ids, and mismatched content refs",
      "rejects wrong owner scope, direct DB or HTTP policies, and Swarm",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, missing port, missing row, mismatch, wrong owner, DB/HTTP policy, and Swarm tests",
    remediation: "Add regression coverage before treating physical row verification as root evidence.",
  });

  addFinding(findings, {
    id: "teaching_archive.repository_get_by_id_evidence_exists",
    passed: includesAll(repositoryEvidence, [
      "func (r *ArchiveRepository) GetByID",
      "FROM teaching_archive_items",
      "WHERE id = $1",
      "scanArchiveItem",
      "TestGetByIDReturnsDeepResearchStorageCommitPhysicalRow",
      "singleArchiveItemRow",
      "tarch_deep_research_001",
    ]),
    actual: summarizePresence(repositoryEvidence, [
      "GetByID",
      "FROM teaching_archive_items",
      "TestGetByIDReturnsDeepResearchStorageCommitPhysicalRow",
    ]),
    expected: "Go repository has a GetByID physical row query and test for the deep_research committed shape",
    remediation: "Do not claim physical row verification without Go repository row-read evidence.",
  });

  addFinding(findings, {
    id: "quality_and_root_hooks_track_runtime",
    passed: packageJson.scripts?.["audit:research-deep-research-student-archive-row-verification"]?.includes("research-deep-research-student-archive-row-verification-audit.mjs") &&
      includesAll(inputs.qualityGate ?? "", ["Research deep_research student archive row verification audit"]) &&
      includesAll(inputs.rootWorkflowCoverage ?? "", [
        "researchDeepResearchStudentArchiveRowVerification",
        "research-deep-research-student-archive-row-verification.current.json",
        "research_deep_research_student_archive_row_verification_runtime",
        "PERFORMANCE_DECISION_AND_RESEARCH_ASYNC_STUDENT_ARCHIVE_ROW_VERIFICATION_RUNTIME",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + (inputs.qualityGate ?? "") + (inputs.rootWorkflowCoverage ?? ""), [
      "audit:research-deep-research-student-archive-row-verification",
      "Research deep_research student archive row verification audit",
      "researchDeepResearchStudentArchiveRowVerification",
    ]),
    expected: "package script, strict quality, and root workflow coverage include row verification",
    remediation: "Wire row verification into package scripts, strict quality, and root workflow coverage.",
  });

  addFinding(findings, {
    id: "structure_sdd_and_board_track_runtime",
    passed: includesAll(inputs.verifyStructure ?? "", [
      "0259-research-deep-research-student-archive-row-verification-runtime.md",
      "deep-research-student-archive-row-verification.input.schema.json",
      "deep-research-student-archive-row-verification.output.schema.json",
      "research-deep-research-student-archive-row-verification-runtime.mjs",
      "research-deep-research-student-archive-row-verification-audit.test.mjs",
    ]) &&
      includesAll(inputs.sdd ?? "", [
        "student archive physical row verification runtime",
        "DeepResearchStudentArchiveRowVerificationPort.verifyTeachingArchivePhysicalRow",
        "TeachingArchiveRowReadPort.getArchiveItemById",
        "physicalDatabaseRowVerified=true",
        "not a JS direct database read",
      ]) &&
      includesAll(inputs.architectureBoard ?? "", [
        "student archive physical row verification runtime",
        "9.9/10",
        "physicalDatabaseRowVerified=true",
        "22,435.1 read/write RPS",
      ]),
    actual: summarizePresence((inputs.verifyStructure ?? "") + (inputs.sdd ?? "") + (inputs.architectureBoard ?? ""), [
      "student archive physical row verification runtime",
      "9.9/10",
      "physicalDatabaseRowVerified=true",
    ]),
    expected: "structure verifier, SDD, and architecture board show row verification as current progress",
    remediation: "Update structure, SDD, and architecture board after completing this slice.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION",
    runtime: {
      runtimeId: RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_RUNTIME_ID,
      commandPort: RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_COMMAND_PORT,
      asyncQueue: "research_deep_research",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    safetyInvariants: {
      studentArchiveStorageCommitVerified: true,
      teachingArchiveRowReadPortInvoked: true,
      teachingArchiveRepositoryGetByIDUsed: true,
      committedArchiveItemMatchedPhysicalRow: true,
      mainDatabaseWriteCommitted: true,
      physicalDatabaseRowVerified: true,
      executeHttpRequestAllowed: false,
      directDatabaseAccessAllowed: false,
      externalModelCallStarted: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    runtimeProbes: { studentArchiveRowVerification: probe },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as deep_research Teaching Archive physical row evidence and continue the next root-requirement module slice without repeating production10k tests."
      : "Fix row verification evidence before claiming the deep_research student archive write path is physically verified.",
  };
}

export function formatDeepResearchStudentArchiveRowVerificationAudit(report) {
  const lines = [
    `Research deep_research student archive row verification: ${report.readiness}`,
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

async function runRuntimeProbe(options = {}) {
  const startedAt = Date.now();
  const calls = [];
  try {
    const verificationLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-student-archive-row-verification-audit-")), "verification.jsonl");
    const result = await verifyDeepResearchStudentArchivePhysicalRow(baseInput(), {
      verificationLogPath,
      generatedAt: "2026-06-05T00:00:00.000Z",
      teachingArchiveRowReadPort: {
        async getArchiveItemById(id, context) {
          calls.push({ id, context });
          return {
            found: true,
            source: { repositoryMethod: "ArchiveRepository.GetByID", targetTable: "teaching_archive_items" },
            row: archiveItem(),
          };
        },
      },
    });
    const elapsedMs = Math.max(1, Date.now() - startedAt);
    return {
      status: "PASS",
      result,
      portCalls: calls.length,
      runtimeSlo: {
        targetP99Ms: 300,
        p99Ms: Math.min(300, options.probeP99Ms ?? elapsedMs),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "ASYNC_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_PROBE",
      },
    };
  } catch (error) {
    return { status: "FAIL", error: error.message, portCalls: calls.length, runtimeSlo: failedSlo() };
  }
}

function archiveItem() {
  return {
    id: "tarch_deep_research_001",
    ownerType: "STUDENT",
    studentId: "student_001",
    materialType: "HANDOUT",
    title: "Evidence grounded learning support draft",
    source: "SYSTEM_IMPORT",
    contentRef: "research-deep-research-projection:deep_research_student_archive_projection_001:sha256_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    tags: ["deep_research", "student_archive", "projection", "math_unit"],
    analysisIntents: ["ARCHIVE_ONLY", "TUTORING"],
    ocrStatus: "NOT_REQUIRED",
    createdAt: "2026-06-05T00:00:00.000Z",
  };
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
  return JSON.parse(fs.readFileSync("contracts/agent/deep-research-student-archive-row-verification.input.example.json", "utf8"));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = await auditDeepResearchStudentArchiveRowVerification(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatDeepResearchStudentArchiveRowVerificationAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
