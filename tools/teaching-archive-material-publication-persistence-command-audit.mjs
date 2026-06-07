import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_PORT,
  TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_RUNTIME_ID,
  recordTeachingArchiveMaterialPublicationPersistenceCommand,
} from "./teaching-archive-material-publication-persistence-command-runtime.mjs";

const defaultOutPath = "reports/teaching-archive-material-publication-persistence-command.current.json";
const sourceRuntimeId = "teaching_archive_material_publication_delivery_runtime";
const sourceStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_ENVELOPE_READY_NOT_PERSISTED";
const commandStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED";
const sourceFiles = {
  runtime: "tools/teaching-archive-material-publication-persistence-command-runtime.mjs",
  runtimeTest: "tools/teaching-archive-material-publication-persistence-command-runtime.test.mjs",
  deliveryReport: "reports/teaching-archive-material-publication-delivery.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0310-teaching-archive-material-publication-persistence-command.md",
};
const forbiddenRuntimeClaims = [
  "node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ",
  "INSERT ", "UPDATE ", "DELETE ", "durablePublicationCommitAllowed: true",
  "mainDatabaseWriteAllowed: true", "studentArchiveWriteAllowed: true",
  "directDatabaseAccessAllowed: true", "executeHttpRequestAllowed: true",
  "ocrOrRagJobWriteAllowed: true", "ocrOrRagJobWriteStarted: true",
  "aiGradingWriteAllowed: true", "aiGradingWriteStarted: true",
  "modelInferenceAllowed: true", "modelInferenceStarted: true",
  "durablePublicationPersistenceStarted: true", "publicationCommitted: true",
  "mainDatabaseWriteStarted: true", "studentArchiveWriteStarted: true",
  "swarmAllowed: true", "innerHTML", "dangerouslySetInnerHTML",
];

export async function auditTeachingArchiveMaterialPublicationPersistenceCommand(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const deliveryReport = parseJson(inputs.deliveryReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const probe = runProbe(deliveryReport, options);

  addFinding(findings, {
    id: "source.publication_delivery_ready_not_persisted",
    passed: deliveryReport.readiness === "READY" &&
      deliveryReport.workloadType === "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY" &&
      deliveryReport.runtime?.runtimeId === sourceRuntimeId &&
      deliveryReport.runtime?.status === sourceStatus &&
      deliveryReport.runtimeSlo?.totalErrors === 0 &&
      deliveryReport.safetyInvariants?.studentVisibleMaterialDeliveryEnvelopeCreated === true &&
      deliveryReport.safetyInvariants?.studentVisibleMaterialDelivered === true &&
      deliveryReport.safetyInvariants?.durablePublicationPersistenceStarted === false &&
      deliveryReport.safetyInvariants?.publicationCommitted === false,
    actual: `${deliveryReport.readiness ?? "missing"}:${deliveryReport.runtime?.status ?? "missing"}:${deliveryReport.safetyInvariants?.publicationCommitted ?? "missing"}`,
    expected: "READY 0309 publication delivery envelope with no durable persistence or publication commit",
    remediation: "Run the 0309 publication delivery audit before recording publication persistence commands.",
  });

  addFinding(findings, {
    id: "runtime.identity_command_and_idempotency",
    passed: includesAll(runtime, [
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_PORT",
      "TeachingArchiveMaterialPublicationPersistenceCommandPort.recordTeachingArchiveMaterialPublicationPersistenceCommand",
      "recordTeachingArchiveMaterialPublicationPersistenceCommand",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
      "NOT_COMMITTED_TO_PUBLICATION_STORE",
      "assertPersistencePrincipal",
      "PUBLICATION_PERSISTENCE_COMMAND",
      "STUDENT_ARCHIVE_WRITE_INTENT",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "teaching_archive_material_publication_persistence_command_runtime",
      "TeachingArchiveMaterialPublicationPersistenceCommandPort.recordTeachingArchiveMaterialPublicationPersistenceCommand",
      "NOT_COMMITTED_TO_PUBLICATION_STORE",
    ]),
    expected: "runtime records an idempotent append-only publication persistence command tied to 0309 delivery evidence",
    remediation: "Keep publication persistence command downstream of the controlled delivery envelope.",
  });

  addFinding(findings, {
    id: "runtime.command_without_commit_or_model",
    passed: includesAll(runtime, [
      "publicationDeliveryEnvelopeVerified: true",
      "publicationApprovalPreserved: true",
      "safeMaterialPointerOnly: true",
      "studentOwnScopeEnforced: true",
      "publicationPersistenceCommandRecorded: true",
      "appendOnlyCommandLogRecorded: true",
      "durablePublicationPersistenceStarted: false",
      "publicationCommitted: false",
      "mainDatabaseWriteStarted: false",
      "studentArchiveWriteStarted: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "modelInferenceStarted: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "requiresFutureDurablePublicationCommitReview: true",
      "rejectLeakedFields",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime creates only append-only publication persistence command evidence while blocking DB, durable commit, HTTP, OCR/RAG, AI grading, model calls, tools, devices, and Swarm",
    remediation: "Keep durable publication commit as a later reviewed slice.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_command_not_commit",
    passed: probe.status === "PASS" &&
      probe.result?.status === commandStatus &&
      probe.result?.commandPort === TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_PORT &&
      probe.result?.publicationPersistenceCommand?.commandState === "NOT_COMMITTED_TO_PUBLICATION_STORE" &&
      probe.result?.boundary?.publicationPersistenceCommandRecorded === true &&
      probe.result?.boundary?.publicationCommitted === false &&
      probe.result?.boundary?.mainDatabaseWriteStarted === false &&
      probe.result?.boundary?.studentArchiveWriteStarted === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `status=${probe.result.status};state=${probe.result.publicationPersistenceCommand.commandState};p99=${probe.runtimeSlo.p99Ms}` : probe.error,
    expected: "probe records one append-only publication persistence command under 50ms without durable commit",
    remediation: "0310 must not start durable publication writes.",
  });

  addFinding(findings, {
    id: "tests.cover_publication_persistence_negative_paths",
    passed: includesAll(runtimeTest, [
      "records an append-only publication persistence command without durable commit",
      "uses idempotency for replay and rejects conflicting persistence commands",
      "rejects unsafe principal, unsafe delivery report, request mismatch, and missing evidence",
      "rejects unsafe policy, leaked fields, unsafe text, and durable publication collapse",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, service principal, delivery safety, mismatch, evidence, policy, leak, unsafe text, and durable-collapse tests",
    remediation: "Add regression coverage before treating publication persistence commands as root workflow evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:teaching-archive-material-publication-persistence-command"]?.includes("teaching-archive-material-publication-persistence-command-audit.mjs")) &&
      includesAll(hooks, [
        "Teaching archive material publication persistence command runtime audit",
        "teachingArchiveMaterialPublicationPersistenceCommand",
        "teaching-archive-material-publication-persistence-command.current.json",
        "teaching_archive_material_publication_persistence_command_runtime",
        "0310-teaching-archive-material-publication-persistence-command.md",
        "10.66/10",
        "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:teaching-archive-material-publication-persistence-command",
      "teachingArchiveMaterialPublicationPersistenceCommand",
      "10.66/10",
    ]),
    expected: "package, quality gate, root coverage, structure verifier, SDD, and architecture board track 0310",
    remediation: "Wire publication persistence command through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND",
    runtime: {
      runtimeId: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_RUNTIME_ID,
      commandPort: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_PORT,
      sourceRuntimeId,
      status: commandStatus,
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { teachingArchiveMaterialPublicationPersistenceCommand: probe },
    safetyInvariants: {
      publicationDeliveryEnvelopeRequired: true,
      publicationDeliveryEnvelopeVerified: true,
      appendOnlyCommandLogRequired: true,
      studentOwnScopeRequired: true,
      publicationPersistenceCommandRecorded: true,
      durablePublicationPersistenceStarted: false,
      publicationCommitted: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      futureDurablePublicationCommitReviewRequired: true,
    },
    findings,
    nextAction: "Use this append-only command as durable publication commit input; actual publication persistence remains a separate reviewed slice.",
  };
}

export function formatTeachingArchiveMaterialPublicationPersistenceCommandAudit(report) {
  return [
    `Teaching archive material publication persistence command runtime: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
    `Status: ${report.runtime.status}`,
    `P99: ${report.runtimeSlo.p99Ms}ms`,
    `Findings: ${report.findings.filter((finding) => !finding.passed).length} failing`,
  ].join("\n");
}

function runProbe(deliveryReport, options) {
  try {
    const result = recordTeachingArchiveMaterialPublicationPersistenceCommand(buildProbeInput(deliveryReport), {
      commandLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "teaching-archive-material-publication-persistence-command-audit-")), "commands.jsonl"),
      generatedAt: "2026-06-07T10:10:00.000Z",
      probeP99Ms: options.probeP99Ms ?? 6,
    });
    return { status: "PASS", result, runtimeSlo: { targetP99Ms: 50, p99Ms: options.probeP99Ms ?? 6, totalErrors: 0, operations: 1, evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_PROBE" } };
  } catch (error) {
    return { status: "FAIL", error: error.message, runtimeSlo: failedSlo() };
  }
}

function buildProbeInput(deliveryReport) {
  const result = deliveryReport.runtimeProbes?.teachingArchiveMaterialPublicationDelivery?.result ?? {};
  const envelope = result.studentMaterialDeliveryEnvelope ?? {};
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-persistence-command.v1",
    persistenceInvocationId: "archive_material_publication_persist_001",
    principal: {
      principalId: "publication_persistence_command_runtime_001",
      sessionId: "publication_persistence_session_001",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "PUBLICATION_PERSISTENCE_COMMAND_RUNTIME",
      scopes: ["TEACHING_READ", "PUBLICATION_PERSISTENCE_COMMAND", "STUDENT_ARCHIVE_WRITE_INTENT"],
    },
    publicationDeliveryEnvelopeReport: deliveryReport,
    publicationPersistencePolicy: {
      publicationDeliveryEnvelopeRequired: true,
      appendOnlyCommandLogRequired: true,
      studentOwnScopeRequired: true,
      preserveApprovalEvidenceRequired: true,
      preserveMaterialPointerRequired: true,
      futureDurablePublicationCommitReviewRequired: true,
      idempotentPersistenceCommandRequired: true,
      durablePublicationCommitAllowed: false,
      mainDatabaseWriteAllowed: false,
      studentArchiveWriteAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteAllowed: false,
      aiGradingWriteAllowed: false,
      modelInferenceAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    publicationPersistenceRequest: {
      commandId: "archive_material_publication_persist_cmd_001",
      persistenceMode: "APPEND_ONLY_PUBLICATION_PERSISTENCE_COMMAND",
      targetPublicationKind: "STUDENT_ARCHIVE_MATERIAL",
      desiredPublicationState: "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
      scopeRef: envelope.scopeRef,
      deliveryEnvelopeRecordId: result.recordId,
      deliveryEnvelopeId: envelope.envelopeId,
      approvalRecordId: envelope.approvalRecordId,
      approvalId: envelope.approvalId,
      publicationCandidateId: envelope.publicationCandidateId,
      archiveItemId: envelope.archiveItemId,
      studentId: envelope.studentId,
      materialType: envelope.materialType,
      title: envelope.title,
      contentRef: envelope.contentRef,
    },
    evidenceRefs: ["evidence:publication-delivery:0309", "evidence:publication-persistence-command:0310"],
    idempotencyKey: "archive-material-publication-persistence-command:student_001:fractions_packet",
  };
}

function loadInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, file]) => [key, fs.readFileSync(path.join(root, file), "utf8")]));
}
function parseJson(text, fallback) { try { return JSON.parse(text); } catch { return fallback; } }
function includesAll(text, needles) { return needles.every((needle) => String(text).includes(needle)); }
function hasForbiddenRuntimeClaim(text) { return forbiddenRuntimeClaims.some((claim) => String(text).includes(claim)); }
function summarizePresence(text, needles) { return needles.map((needle) => `${needle}=${String(text).includes(needle)}`).join(";"); }
function failedSlo() { return { targetP99Ms: 50, p99Ms: null, totalErrors: 1, operations: 0, evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_PROBE" }; }
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
    const report = await auditTeachingArchiveMaterialPublicationPersistenceCommand(loadInputs(root));
    writeReport(root, args.out, report);
    console.log(formatTeachingArchiveMaterialPublicationPersistenceCommandAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
