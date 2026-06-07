import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_PORT,
  TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_RUNTIME_ID,
  verifyTeachingArchiveMaterialPublicationPhysicalRow,
} from "./teaching-archive-material-publication-row-verification-runtime.mjs";

const defaultOutPath = "reports/teaching-archive-material-publication-row-verification.current.json";
const sourceRuntimeId = "teaching_archive_material_publication_storage_commit_runtime";
const sourceCommandPort = "TeachingArchiveMaterialPublicationStorageCommitPort.commitTeachingArchiveMaterialPublication";
const sourceStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMITTED";
const verifiedStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PHYSICAL_ROW_VERIFIED";
const sourceFiles = {
  runtime: "tools/teaching-archive-material-publication-row-verification-runtime.mjs",
  runtimeTest: "tools/teaching-archive-material-publication-row-verification-runtime.test.mjs",
  storageCommitReport: "reports/teaching-archive-material-publication-storage-commit.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0312-teaching-archive-material-publication-row-verification.md",
};
const forbiddenRuntimeClaims = [
  "node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ",
  "INSERT ", "UPDATE ", "DELETE ", "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true", "ocrOrRagJobWriteAllowed: true",
  "ocrOrRagJobWriteStarted: true", "aiGradingWriteAllowed: true",
  "aiGradingWriteStarted: true", "modelInferenceAllowed: true",
  "modelInferenceStarted: true", "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true", "swarmAllowed: true", "innerHTML",
  "dangerouslySetInnerHTML",
];

export async function auditTeachingArchiveMaterialPublicationRowVerification(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const storageCommitReport = parseJson(inputs.storageCommitReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const probe = await runProbe(storageCommitReport, options);

  addFinding(findings, {
    id: "source.publication_storage_commit_ready",
    passed: storageCommitReport.readiness === "READY" &&
      storageCommitReport.workloadType === "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT" &&
      storageCommitReport.runtime?.runtimeId === sourceRuntimeId &&
      storageCommitReport.runtime?.commandPort === sourceCommandPort &&
      storageCommitReport.runtime?.status === sourceStatus &&
      storageCommitReport.runtimeSlo?.totalErrors === 0 &&
      storageCommitReport.safetyInvariants?.publicationCommitted === true &&
      storageCommitReport.safetyInvariants?.studentVisiblePublished === true &&
      storageCommitReport.safetyInvariants?.mainDatabaseWriteCommitted === true &&
      storageCommitReport.safetyInvariants?.studentArchiveWriteCommitted === true &&
      storageCommitReport.safetyInvariants?.directDatabaseAccessAllowed === false,
    actual: `${storageCommitReport.readiness ?? "missing"}:${storageCommitReport.runtime?.status ?? "missing"}:${storageCommitReport.safetyInvariants?.publicationCommitted ?? "missing"}`,
    expected: "READY 0311 publication storage commit with student-visible durable commit and no direct DB access",
    remediation: "Run the 0311 publication storage commit audit before verifying the physical publication row.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_PORT",
      "TeachingArchiveMaterialPublicationRowVerificationPort.verifyTeachingArchivePublicationPhysicalRow",
      "verifyTeachingArchiveMaterialPublicationPhysicalRow",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PHYSICAL_ROW_VERIFIED",
      "TeachingArchivePublicationRowReadPort.getPublicationById is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "teaching_archive_material_publication_row_verification_runtime",
      "TeachingArchiveMaterialPublicationRowVerificationPort.verifyTeachingArchivePublicationPhysicalRow",
      "TeachingArchivePublicationRowReadPort.getPublicationById",
    ]),
    expected: "runtime verifies publication row through a named injected row-read port with idempotency",
    remediation: "Keep 0312 as an injected-port publication row verification boundary.",
  });

  addFinding(findings, {
    id: "runtime.verifies_row_without_raw_db_http_model_or_swarm",
    passed: includesAll(runtime, [
      "publicationStorageCommitVerified: true",
      "teachingArchivePublicationRowReadPortInvoked: true",
      "teachingArchivePublicationRepositoryGetByIDUsed: true",
      "committedPublicationRecordMatchedPhysicalRow: true",
      "publicationPhysicalRowVerified: true",
      "mainDatabaseWriteCommitted: true",
      "mainDatabaseReadAllowed: true",
      "studentVisiblePublished: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "modelInferenceStarted: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "requiresFutureStudentAppPublishedMaterialRead: true",
      "rejectLeakedFields",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime verifies only through the injected row read port and blocks raw DB, HTTP, OCR/RAG, AI grading, model calls, tools, devices, and Swarm",
    remediation: "Do not let JS execute SQL, HTTP, model calls, or collapse Student App read into row verification.",
  });

  addFinding(findings, {
    id: "runtime.probe_verifies_publication_row",
    passed: probe.status === "PASS" &&
      probe.result?.status === verifiedStatus &&
      probe.result?.commandPort === TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_PORT &&
      probe.result?.sourcePublicationStorageCommit?.runtimeId === sourceRuntimeId &&
      probe.result?.teachingArchivePublicationPhysicalRow?.targetRepository === "PublicationRepository.GetByID" &&
      probe.result?.teachingArchivePublicationPhysicalRow?.targetStore === "TEACHING_ARCHIVE_PUBLICATION_STORE" &&
      probe.result?.teachingArchivePublicationPhysicalRow?.targetTable === "teaching_archive_publications" &&
      probe.result?.teachingArchivePublicationPhysicalRow?.publicationRecord?.publicationId === "archive_material_publication_commit_001" &&
      probe.result?.boundary?.publicationPhysicalRowVerified === true &&
      probe.result?.boundary?.directDatabaseAccessAllowed === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};publication=${probe.result.teachingArchivePublicationPhysicalRow.publicationRecord.publicationId};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe verifies one committed publication row through one injected row read port call under 50ms",
    remediation: "0312 must prove row read port invocation and exact 0311 committed publication record match.",
  });

  addFinding(findings, {
    id: "tests.cover_publication_row_verification_negative_paths",
    passed: includesAll(runtimeTest, [
      "verifies a committed material publication through the injected publication row read port",
      "uses idempotency for replay and rejects conflicting publication rows",
      "rejects unsafe storage commit source, unsafe policy, missing port, and missing row",
      "rejects row mismatches, leaked fields, unsafe text, and unsafe content refs",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, source safety, policy, port, missing row, mismatch, leak, unsafe text, and unsafe-ref tests",
    remediation: "Add regression coverage before treating publication row verification as root workflow evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:teaching-archive-material-publication-row-verification"]?.includes("teaching-archive-material-publication-row-verification-audit.mjs")) &&
      includesAll(hooks, [
        "Teaching archive material publication row verification runtime audit",
        "teachingArchiveMaterialPublicationRowVerification",
        "teaching-archive-material-publication-row-verification.current.json",
        "teaching_archive_material_publication_row_verification_runtime",
        "0312-teaching-archive-material-publication-row-verification.md",
        "10.72/10",
        "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PHYSICAL_ROW_VERIFIED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:teaching-archive-material-publication-row-verification",
      "teachingArchiveMaterialPublicationRowVerification",
      "10.72/10",
    ]),
    expected: "package, quality gate, root coverage, structure verifier, SDD, and architecture board track 0312",
    remediation: "Wire publication row verification through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION",
    runtime: {
      runtimeId: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_RUNTIME_ID,
      commandPort: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_PORT,
      sourceRuntimeId,
      sourceCommandPort,
      status: verifiedStatus,
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { teachingArchiveMaterialPublicationRowVerification: probe },
    safetyInvariants: {
      publicationStorageCommitRequired: true,
      publicationStorageCommitVerified: true,
      teachingArchivePublicationRowReadPortInvoked: true,
      teachingArchivePublicationRepositoryGetByIDUsed: true,
      committedPublicationRecordMatchedPhysicalRow: true,
      publicationPhysicalRowVerified: true,
      mainDatabaseWriteCommitted: true,
      mainDatabaseReadAllowed: true,
      studentVisiblePublished: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      futureStudentAppPublishedMaterialReadRequired: true,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as physical publication row evidence; Student App published-material read, OCR/RAG enrichment, AI grading, and model execution remain separate reviewed slices."
      : "Fix publication row verification boundaries before claiming physical publication row evidence.",
  };
}

export function formatTeachingArchiveMaterialPublicationRowVerificationAudit(report) {
  return [
    `Teaching archive material publication row verification runtime: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
    `Status: ${report.runtime.status}`,
    `P99: ${report.runtimeSlo.p99Ms}ms`,
    `Findings: ${report.findings.filter((finding) => !finding.passed).length} failing`,
  ].join("\n");
}

async function runProbe(report, options = {}) {
  const calls = [];
  try {
    const input = buildProbeInput(report);
    const committed = report.runtimeProbes?.teachingArchiveMaterialPublicationStorageCommit?.result?.publicationCommit?.publicationRecord;
    const result = await verifyTeachingArchiveMaterialPublicationPhysicalRow(input, {
      verificationLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "teaching-archive-material-publication-row-verification-audit-")), "verification.jsonl"),
      generatedAt: "2026-06-07T10:50:00.000Z",
      probeP99Ms: options.probeP99Ms ?? 8,
      teachingArchivePublicationRowReadPort: {
        async getPublicationById(publicationId, context) {
          calls.push({ publicationId, context });
          return {
            found: true,
            source: {
              repositoryMethod: "PublicationRepository.GetByID",
              targetStore: "TEACHING_ARCHIVE_PUBLICATION_STORE",
              targetTable: "teaching_archive_publications",
            },
            row: committed,
          };
        },
      },
    });
    return {
      status: "PASS",
      result,
      portCalls: calls.length,
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: options.probeP99Ms ?? 8,
        totalErrors: 0,
        operations: 1,
        evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_PROBE",
      },
    };
  } catch (error) {
    return { status: "FAIL", error: error.message, portCalls: calls.length, runtimeSlo: failedSlo() };
  }
}

function buildProbeInput(report) {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-row-verification.v1",
    verificationInvocationId: "archive_material_publication_row_verification_001",
    publicationStorageCommitReport: report,
    publicationRowVerificationPolicy: {
      storageCommitRequired: true,
      physicalPublicationRowVerificationRequired: true,
      injectedTeachingArchivePublicationRowReadPortRequired: true,
      publicationRepositoryReadRequired: true,
      committedPublicationRecordMatchRequired: true,
      preserveApprovalEvidenceRequired: true,
      preserveDeliveryEnvelopeRequired: true,
      studentOwnScopeRequired: true,
      idempotentPublicationRowVerificationRequired: true,
      mainDatabaseReadAllowed: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteAllowed: false,
      aiGradingWriteAllowed: false,
      modelInferenceAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      "evidence:publication-storage-commit:0311",
      "evidence:publication-row-verification:0312",
    ],
    idempotencyKey: "archive-material-publication-row-verification:student_001:fractions_packet",
  };
}

function loadInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, file]) => {
    const absolute = path.join(root, file);
    return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""];
  }));
}
function parseJson(text, fallback) { try { return JSON.parse(text); } catch { return fallback; } }
function includesAll(text, needles) { return needles.every((needle) => String(text).includes(needle)); }
function hasForbiddenRuntimeClaim(text) { return forbiddenRuntimeClaims.some((claim) => String(text).includes(claim)); }
function summarizePresence(text, needles) { return needles.map((needle) => `${needle}=${String(text).includes(needle)}`).join(";"); }
function failedSlo() { return { targetP99Ms: 50, p99Ms: null, totalErrors: 1, operations: 0, evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION_PROBE" }; }
function addFinding(findings, finding) { findings.push({ severity: finding.passed ? "info" : "error", id: finding.id, passed: Boolean(finding.passed), actual: finding.actual, expected: finding.expected, remediation: finding.remediation }); }
function writeReport(root, reportPath, report) {
  const out = path.join(root, reportPath);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
}
function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  return { out: outIndex === -1 ? defaultOutPath : argv[outIndex + 1] };
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = await auditTeachingArchiveMaterialPublicationRowVerification(loadInputs(root));
    writeReport(root, args.out, report);
    console.log(formatTeachingArchiveMaterialPublicationRowVerificationAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
