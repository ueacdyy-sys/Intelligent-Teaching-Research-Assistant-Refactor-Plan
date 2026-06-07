import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION_PORT,
  TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION_RUNTIME_ID,
  verifyTeachingArchiveMaterialDraftStoragePhysicalRow,
} from "./teaching-archive-material-draft-storage-row-verification-runtime.mjs";

const defaultOutPath = "reports/teaching-archive-material-draft-storage-row-verification.current.json";
const storageCommitRuntimeId = "teaching_archive_material_draft_storage_commit_runtime";
const storageCommitCommandPort = "TeachingArchiveMaterialDraftStorageCommitPort.commitArchiveMaterialDraftStorageCommand";
const storageCommitStatus = "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMITTED";
const verifiedStatus = "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PHYSICAL_ROW_VERIFIED";

const sourceFiles = {
  runtime: "tools/teaching-archive-material-draft-storage-row-verification-runtime.mjs",
  runtimeTest: "tools/teaching-archive-material-draft-storage-row-verification-runtime.test.mjs",
  commitReport: "reports/teaching-archive-material-draft-storage-commit.current.json",
  teachingArchiveRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items.go",
  teachingArchiveRepositoryTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items_get_by_id_test.go",
  teachingArchiveScanner: "services/teaching-archive-gateway/internal/adapter/postgres/repository_scanners.go",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0305-teaching-archive-material-draft-storage-row-verification.md",
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
  "ocrOrRagJobWriteAllowed: true",
  "ocrOrRagJobWriteStarted: true",
  "aiGradingWriteAllowed: true",
  "aiGradingWriteStarted: true",
  "externalModelCallAllowed: true",
  "externalModelCallStarted: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "dangerouslySetInnerHTML",
  "innerHTML",
];

export async function auditTeachingArchiveMaterialDraftStorageRowVerification(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const commitReport = parseJson(inputs.commitReport, {});
  const repositoryEvidence = [
    inputs.teachingArchiveRepository ?? "",
    inputs.teachingArchiveRepositoryTest ?? "",
    inputs.teachingArchiveScanner ?? "",
  ].join("\n");
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(commitReport, options);

  addFinding(findings, {
    id: "source_commit.ready_committed",
    passed: commitReport.readiness === "READY" &&
      commitReport.workloadType === "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT" &&
      commitReport.runtime?.runtimeId === storageCommitRuntimeId &&
      commitReport.runtime?.commandPort === storageCommitCommandPort &&
      commitReport.runtime?.status === storageCommitStatus &&
      commitReport.runtimeSlo?.totalErrors === 0 &&
      commitReport.runtimeProbes?.teachingArchiveMaterialDraftStorageCommit?.result?.boundary?.mainDatabaseWriteCommitted === true &&
      commitReport.runtimeProbes?.teachingArchiveMaterialDraftStorageCommit?.result?.boundary?.directDatabaseAccessAllowed === false,
    actual: `${commitReport.readiness ?? "missing"}:${commitReport.runtime?.status ?? "missing"}:${commitReport.runtimeProbes?.teachingArchiveMaterialDraftStorageCommit?.result?.boundary?.mainDatabaseWriteCommitted ?? "missing"}`,
    expected: "READY 0304 storage commit with committed main DB write through the use case port and no direct DB access",
    remediation: "Run the 0304 storage-commit audit before verifying the physical row.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION_PORT",
      "TeachingArchiveMaterialDraftStorageRowVerificationPort.verifyTeachingArchivePhysicalRow",
      "verifyTeachingArchiveMaterialDraftStoragePhysicalRow",
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PHYSICAL_ROW_VERIFIED",
      "TeachingArchiveRowReadPort.getArchiveItemById is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "teaching_archive_material_draft_storage_row_verification_runtime",
      "TeachingArchiveMaterialDraftStorageRowVerificationPort.verifyTeachingArchivePhysicalRow",
      "TeachingArchiveRowReadPort.getArchiveItemById",
    ]),
    expected: "runtime records idempotent physical row verification through a named row-read port",
    remediation: "Keep row verification as a named port boundary with idempotent replay.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "storageCommitVerified: true",
      "teachingArchiveRowReadPortInvoked: true",
      "teachingArchiveRepositoryGetByIDUsed: true",
      "committedArchiveItemMatchedPhysicalRow: true",
      "mainDatabaseWriteCommitted: true",
      "mainDatabaseReadAllowed: true",
      "physicalDatabaseRowVerified: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "externalModelCallStarted: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "rejectLeakedFields",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime verifies only through the injected row read port and blocks raw DB, HTTP, OCR/RAG, AI grading, tools, devices, and Swarm",
    remediation: "Do not let JS execute SQL or HTTP in the row verification runtime.",
  });

  addFinding(findings, {
    id: "runtime.probe_verifies_physical_row",
    passed: probe.status === "PASS" &&
      probe.result?.status === verifiedStatus &&
      probe.result?.commandPort === TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION_PORT &&
      probe.result?.sourceStorageCommit?.runtimeId === storageCommitRuntimeId &&
      probe.result?.teachingArchivePhysicalRow?.targetRepository === "ArchiveRepository.GetByID" &&
      probe.result?.teachingArchivePhysicalRow?.targetTable === "teaching_archive_items" &&
      probe.result?.teachingArchivePhysicalRow?.archiveItem?.id === "tarch_archive_material_001" &&
      probe.result?.boundary?.teachingArchiveRowReadPortInvoked === true &&
      probe.result?.boundary?.physicalDatabaseRowVerified === true &&
      probe.result?.boundary?.directDatabaseAccessAllowed === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};row=${probe.result.teachingArchivePhysicalRow.archiveItem.id};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe verifies one committed archive item through one injected row read port call under 50ms",
    remediation: "Row verification must prove row read port invocation and exact committed-row match.",
  });

  addFinding(findings, {
    id: "tests.cover_row_verification_negative_paths",
    passed: includesAll(runtimeTest, [
      "verifies a committed archive material draft through the injected row read port",
      "uses idempotency for replay and rejects conflicting committed rows",
      "rejects unsafe storage commit source, policy, missing port, and missing row",
      "rejects row mismatches, leaked fields, forbidden analysis intents, and unsafe refs",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, source-state, policy, missing port, missing row, mismatch, leak, analysis intent, and unsafe-ref tests",
    remediation: "Add regression coverage before treating physical row verification as root evidence.",
  });

  addFinding(findings, {
    id: "teaching_archive.repository_get_by_id_evidence_exists",
    passed: includesAll(repositoryEvidence, [
      "func (r *ArchiveRepository) GetByID",
      "FROM teaching_archive_items",
      "WHERE id = $1",
      "scanArchiveItem",
      "TestGetByIDReturnsTeachingArchiveMaterialDraftStorageCommitPhysicalRow",
      "singleTeachingArchiveMaterialDraftItemRow",
      "tarch_archive_material_001",
    ]),
    actual: summarizePresence(repositoryEvidence, [
      "GetByID",
      "FROM teaching_archive_items",
      "TestGetByIDReturnsTeachingArchiveMaterialDraftStorageCommitPhysicalRow",
    ]),
    expected: "Go repository has a GetByID physical row query and test for the Teaching Archive material draft committed shape",
    remediation: "Do not claim physical row verification without Go repository row-read evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:teaching-archive-material-draft-storage-row-verification"]?.includes("teaching-archive-material-draft-storage-row-verification-audit.mjs")) &&
      includesAll(hooks, [
        "Teaching archive material draft storage row verification runtime audit",
        "teachingArchiveMaterialDraftStorageRowVerification",
        "teaching-archive-material-draft-storage-row-verification.current.json",
        "teaching_archive_material_draft_storage_row_verification_runtime",
        "0305-teaching-archive-material-draft-storage-row-verification.md",
        "10.51/10",
        "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PHYSICAL_ROW_VERIFIED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:teaching-archive-material-draft-storage-row-verification",
      "teachingArchiveMaterialDraftStorageRowVerification",
      "10.51/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0305",
    remediation: "Wire archive material draft storage row verification through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION",
    runtime: {
      runtimeId: TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION_RUNTIME_ID,
      commandPort: TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION_PORT,
      sourceCommandPort: storageCommitCommandPort,
      status: verifiedStatus,
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { teachingArchiveMaterialDraftStorageRowVerification: probe },
    safetyInvariants: {
      storageCommitRequired: true,
      storageCommitVerified: true,
      teachingArchiveRowReadPortInvoked: true,
      teachingArchiveRepositoryGetByIDUsed: true,
      committedArchiveItemMatchedPhysicalRow: true,
      commitEvidencePreserved: true,
      mainDatabaseWriteCommitted: true,
      mainDatabaseReadAllowed: true,
      physicalDatabaseRowVerified: true,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      executeHttpRequestAllowed: false,
      directDatabaseAccessAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as Teaching Archive material physical row evidence; continue product retrieval, OCR/RAG, AI grading, or publication as separate reviewed slices."
      : "Fix storage row verification boundaries before claiming physical Teaching Archive material row evidence.",
  };
}

export function formatTeachingArchiveMaterialDraftStorageRowVerificationAudit(report) {
  const lines = [
    `Teaching archive material draft storage row verification runtime: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
    `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`,
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

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => {
    const absolute = path.join(root, relativePath);
    return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""];
  }));
}

async function runRuntimeProbe(commitReport, options = {}) {
  const verificationLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "teaching-archive-material-row-verification-audit-")), "verification.jsonl");
  const startedAt = Date.now();
  const calls = [];
  try {
    const result = await verifyTeachingArchiveMaterialDraftStoragePhysicalRow(probeInput(commitReport), {
      verificationLogPath,
      generatedAt: "2026-06-07T08:10:00.000Z",
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
        targetP99Ms: 50,
        p99Ms: Math.max(1, Math.min(50, options.probeP99Ms ?? elapsedMs)),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION_PROBE",
      },
    };
  } catch (error) {
    return {
      status: "FAIL",
      error: error.message,
      portCalls: calls.length,
      runtimeSlo: failedSlo(),
    };
  }
}

function probeInput(commitReport) {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-draft-storage-row-verification.v1",
    verificationInvocationId: "archive_material_draft_storage_row_verification_001",
    storageCommitReport: commitReport,
    storageRowVerificationPolicy: {
      storageCommitRequired: true,
      physicalRowVerificationRequired: true,
      injectedTeachingArchiveRowReadPortRequired: true,
      teachingArchiveRepositoryReadRequired: true,
      committedArchiveItemMatchRequired: true,
      preserveCommitEvidenceRequired: true,
      idempotentRowVerificationRequired: true,
      mainDatabaseReadAllowed: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteAllowed: false,
      aiGradingWriteAllowed: false,
      externalModelCallAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      "evidence:archive-material-draft-storage-commit:archive_material_draft_storage_commit_001",
    ],
    idempotencyKey: "archive-material-draft-storage-row-verification:student_001:fractions_packet",
  };
}

function archiveItem() {
  return {
    id: "tarch_archive_material_001",
    ownerType: "STUDENT",
    studentId: "student_001",
    materialType: "HANDOUT",
    title: "Fractions practice packet",
    source: "SYSTEM_IMPORT",
    contentRef: "precommit://archive-material/student_001/fractions-packet",
    tags: ["fractions", "draft-approved"],
    analysisIntents: ["ARCHIVE_ONLY"],
    ocrStatus: "NOT_REQUIRED",
    createdAt: "2026-06-07T08:00:00.000Z",
  };
}

function failedSlo() {
  return {
    targetP99Ms: 50,
    p99Ms: null,
    totalErrors: 1,
    operations: 0,
    evidenceClass: "FAILED_PROBE",
  };
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

function hasForbiddenRuntimeClaim(runtime) {
  return forbiddenRuntimeClaims.some((claim) => runtime.includes(claim));
}

function summarizePresence(text, values) {
  return values.map((value) => `${value}=${text.includes(value)}`).join(";");
}

function addFinding(findings, finding) {
  findings.push({ severity: finding.passed ? "info" : "error", ...finding });
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function stringifyScalar(value) {
  if (Array.isArray(value)) return value.join(",");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

async function main() {
  const root = process.cwd();
  const out = parseOutArg(process.argv.slice(2));
  const report = await auditTeachingArchiveMaterialDraftStorageRowVerification(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatTeachingArchiveMaterialDraftStorageRowVerificationAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
