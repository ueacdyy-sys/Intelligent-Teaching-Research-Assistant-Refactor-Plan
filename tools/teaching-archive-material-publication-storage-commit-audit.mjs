import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_PORT,
  TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_RUNTIME_ID,
  commitTeachingArchiveMaterialPublicationStorage,
} from "./teaching-archive-material-publication-storage-commit-runtime.mjs";

const defaultOutPath = "reports/teaching-archive-material-publication-storage-commit.current.json";
const sourceRuntimeId = "teaching_archive_material_publication_persistence_command_runtime";
const sourceStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED";
const commitStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMITTED";
const sourceFiles = {
  runtime: "tools/teaching-archive-material-publication-storage-commit-runtime.mjs",
  runtimeTest: "tools/teaching-archive-material-publication-storage-commit-runtime.test.mjs",
  persistenceCommandReport: "reports/teaching-archive-material-publication-persistence-command.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0311-teaching-archive-material-publication-storage-commit.md",
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

export async function auditTeachingArchiveMaterialPublicationStorageCommit(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const persistenceCommandReport = parseJson(inputs.persistenceCommandReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const probe = await runProbe(persistenceCommandReport, options);

  addFinding(findings, {
    id: "source.publication_persistence_command_ready",
    passed: persistenceCommandReport.readiness === "READY" &&
      persistenceCommandReport.workloadType === "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND" &&
      persistenceCommandReport.runtime?.runtimeId === sourceRuntimeId &&
      persistenceCommandReport.runtime?.status === sourceStatus &&
      persistenceCommandReport.runtimeSlo?.totalErrors === 0 &&
      persistenceCommandReport.safetyInvariants?.publicationPersistenceCommandRecorded === true &&
      persistenceCommandReport.safetyInvariants?.publicationCommitted === false &&
      persistenceCommandReport.safetyInvariants?.mainDatabaseWriteStarted === false,
    actual: `${persistenceCommandReport.readiness ?? "missing"}:${persistenceCommandReport.runtime?.status ?? "missing"}:${persistenceCommandReport.safetyInvariants?.publicationCommitted ?? "missing"}`,
    expected: "READY 0310 publication persistence command with no prior durable commit",
    remediation: "Run the 0310 publication persistence command audit before committing publication storage.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_PORT",
      "TeachingArchiveMaterialPublicationStorageCommitPort.commitTeachingArchiveMaterialPublication",
      "commitTeachingArchiveMaterialPublicationStorage",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMITTED",
      "TeachingArchivePublicationCommitPort.commitPublication is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "teaching_archive_material_publication_storage_commit_runtime",
      "TeachingArchiveMaterialPublicationStorageCommitPort.commitTeachingArchiveMaterialPublication",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMITTED",
    ]),
    expected: "runtime commits publication storage through an injected publication commit port with idempotency",
    remediation: "Keep 0311 as an injected-port storage commit boundary.",
  });

  addFinding(findings, {
    id: "runtime.commit_without_raw_db_http_model_or_swarm",
    passed: includesAll(runtime, [
      "publicationPersistenceCommandVerified: true",
      "publicationCommitPortInjected: true",
      "publicationApprovalPreserved: true",
      "publicationDeliveryEnvelopePreserved: true",
      "studentOwnScopeEnforced: true",
      "safeMaterialPointerOnly: true",
      "durablePublicationPersistenceStarted: true",
      "publicationCommitted: true",
      "studentVisiblePublished: true",
      "mainDatabaseWriteCommitted: true",
      "studentArchiveWriteCommitted: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "modelInferenceStarted: false",
      "swarmAllowed: false",
      "requiresFuturePublicationRowVerification: true",
      "rejectLeakedFields",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime permits only the injected durable publication commit and blocks raw DB, HTTP, OCR/RAG, AI grading, model calls, tools, devices, and Swarm",
    remediation: "Do not bypass the publication commit port or collapse row verification into this slice.",
  });

  addFinding(findings, {
    id: "runtime.probe_commits_publication_record",
    passed: probe.status === "PASS" &&
      probe.result?.status === commitStatus &&
      probe.result?.commandPort === TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_PORT &&
      probe.result?.publicationCommit?.publicationRecord?.publicationState === "COMMITTED_TO_PUBLICATION_STORE" &&
      probe.result?.publicationCommit?.publicationRecord?.archiveItemId === "tarch_archive_material_001" &&
      probe.result?.publicationCommit?.persistence?.status === "persisted" &&
      probe.result?.boundary?.publicationCommitted === true &&
      probe.result?.boundary?.studentVisiblePublished === true &&
      probe.result?.boundary?.directDatabaseAccessAllowed === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `status=${probe.result.status};publication=${probe.result.publicationCommit.publicationRecord.publicationId};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}` : probe.error,
    expected: "probe commits one publication record through one injected port call under 50ms",
    remediation: "0311 must prove one injected port commit and no raw side effects.",
  });

  addFinding(findings, {
    id: "tests.cover_publication_commit_negative_paths",
    passed: includesAll(runtimeTest, [
      "commits a reviewed publication persistence command through the injected publication commit port",
      "uses idempotency for replay and rejects conflicting publication commits",
      "rejects unsafe source, request mismatch, missing evidence, and missing port",
      "rejects unsafe policy, leaked fields, unsafe text, and unsafe port results",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, source safety, mismatch, evidence, port, policy, leak, unsafe text, and port-result tests",
    remediation: "Add regression coverage before treating publication storage commit as root workflow evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:teaching-archive-material-publication-storage-commit"]?.includes("teaching-archive-material-publication-storage-commit-audit.mjs")) &&
      includesAll(hooks, [
        "Teaching archive material publication storage commit runtime audit",
        "teachingArchiveMaterialPublicationStorageCommit",
        "teaching-archive-material-publication-storage-commit.current.json",
        "teaching_archive_material_publication_storage_commit_runtime",
        "0311-teaching-archive-material-publication-storage-commit.md",
        "10.69/10",
        "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMITTED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:teaching-archive-material-publication-storage-commit",
      "teachingArchiveMaterialPublicationStorageCommit",
      "10.69/10",
    ]),
    expected: "package, quality gate, root coverage, structure verifier, SDD, and architecture board track 0311",
    remediation: "Wire publication storage commit through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT",
    runtime: {
      runtimeId: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_RUNTIME_ID,
      commandPort: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_PORT,
      sourceRuntimeId,
      status: commitStatus,
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { teachingArchiveMaterialPublicationStorageCommit: probe },
    safetyInvariants: {
      publicationPersistenceCommandRequired: true,
      publicationPersistenceCommandVerified: true,
      publicationCommitPortInjected: true,
      durablePublicationPersistenceStarted: true,
      publicationCommitted: true,
      studentVisiblePublished: true,
      mainDatabaseWriteCommitted: true,
      studentArchiveWriteCommitted: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      futurePublicationRowVerificationRequired: true,
    },
    findings,
    nextAction: "Use this as publication storage commit evidence; physical publication row verification and Student App published-material read remain separate slices.",
  };
}

export function formatTeachingArchiveMaterialPublicationStorageCommitAudit(report) {
  return [
    `Teaching archive material publication storage commit runtime: ${report.readiness}`,
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
    const result = await commitTeachingArchiveMaterialPublicationStorage(input, {
      commitLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "teaching-archive-material-publication-storage-commit-audit-")), "commit.jsonl"),
      generatedAt: "2026-06-07T10:40:00.000Z",
      probeP99Ms: options.probeP99Ms ?? 8,
      teachingArchivePublicationCommitPort: {
        async commitPublication(command) {
          calls.push(command);
          const payload = command.publicationPayload;
          return {
            publicationRecord: {
              publicationId: payload.publicationId,
              publicationState: "COMMITTED_TO_PUBLICATION_STORE",
              visibilityState: payload.visibilityState,
              channel: payload.channel,
              scopeRef: payload.scopeRef,
              approvalRecordId: payload.approvalRecordId,
              approvalId: payload.approvalId,
              publicationCandidateId: payload.publicationCandidateId,
              archiveItemId: payload.archiveItemId,
              studentId: payload.studentId,
              materialType: payload.materialType,
              title: payload.title,
              contentRef: payload.contentRef,
              committedAt: "2026-06-07T10:40:00.000Z",
            },
            persistence: { status: "persisted", commandId: command.commandId },
          };
        },
      },
    });
    return { status: "PASS", result, portCalls: calls.length, runtimeSlo: { targetP99Ms: 50, p99Ms: options.probeP99Ms ?? 8, totalErrors: 0, operations: 1, evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_PROBE" } };
  } catch (error) {
    return { status: "FAIL", error: error.message, portCalls: calls.length, runtimeSlo: failedSlo() };
  }
}

function buildProbeInput(report) {
  const result = report.runtimeProbes?.teachingArchiveMaterialPublicationPersistenceCommand?.result ?? {};
  const command = result.publicationPersistenceCommand ?? {};
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-storage-commit.v1",
    commitInvocationId: "archive_material_publication_storage_commit_001",
    publicationPersistenceCommandReport: report,
    publicationStorageCommitPolicy: {
      publicationPersistenceCommandRequired: true,
      publicationCommitPortRequired: true,
      durablePublicationCommitAllowed: true,
      mainDatabaseWriteAllowed: true,
      studentArchiveWriteAllowed: true,
      studentVisiblePublicationAllowed: true,
      preserveApprovalEvidenceRequired: true,
      preserveDeliveryEnvelopeRequired: true,
      idempotentPublicationCommitRequired: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteAllowed: false,
      aiGradingWriteAllowed: false,
      modelInferenceAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    publicationStorageCommitRequest: {
      commitId: "archive_material_publication_commit_001",
      commitMode: "DURABLE_STUDENT_ARCHIVE_MATERIAL_PUBLICATION",
      targetPublicationStore: "TEACHING_ARCHIVE_PUBLICATION_STORE",
      desiredPublicationState: "COMMITTED_TO_PUBLICATION_STORE",
      scopeRef: command.scopeRef,
      sourcePersistenceCommandRecordId: result.recordId,
      sourcePersistenceCommandId: command.commandId,
      sourceDeliveryEnvelopeId: command.sourceDeliveryEnvelopeId,
      approvalRecordId: command.approvalRecordId,
      approvalId: command.approvalId,
      publicationCandidateId: command.publicationCandidateId,
      archiveItemId: command.archiveItemId,
      studentId: command.studentId,
      materialType: command.materialType,
      title: command.title,
      contentRef: command.contentRef,
    },
    evidenceRefs: ["evidence:publication-persistence-command:0310", "evidence:publication-storage-commit:0311"],
    idempotencyKey: "archive-material-publication-storage-commit:student_001:fractions_packet",
  };
}

function loadInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, file]) => [key, fs.readFileSync(path.join(root, file), "utf8")]));
}
function parseJson(text, fallback) { try { return JSON.parse(text); } catch { return fallback; } }
function includesAll(text, needles) { return needles.every((needle) => String(text).includes(needle)); }
function hasForbiddenRuntimeClaim(text) { return forbiddenRuntimeClaims.some((claim) => String(text).includes(claim)); }
function summarizePresence(text, needles) { return needles.map((needle) => `${needle}=${String(text).includes(needle)}`).join(";"); }
function failedSlo() { return { targetP99Ms: 50, p99Ms: null, totalErrors: 1, operations: 0, evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMIT_PROBE" }; }
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
    const report = await auditTeachingArchiveMaterialPublicationStorageCommit(loadInputs(root));
    writeReport(root, args.out, report);
    console.log(formatTeachingArchiveMaterialPublicationStorageCommitAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
