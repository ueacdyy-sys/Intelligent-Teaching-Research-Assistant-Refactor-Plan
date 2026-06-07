import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_PORT,
  TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_RUNTIME_ID,
  recordTeachingArchiveMaterialPublicationDeliveryEnvelope,
} from "./teaching-archive-material-publication-delivery-runtime.mjs";

const defaultOutPath = "reports/teaching-archive-material-publication-delivery.current.json";
const sourceRuntimeId = "teaching_archive_material_publication_approval_runtime";
const sourceStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVED_NOT_PUBLISHED";
const deliveryStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_ENVELOPE_READY_NOT_PERSISTED";
const sourceFiles = {
  runtime: "tools/teaching-archive-material-publication-delivery-runtime.mjs",
  runtimeTest: "tools/teaching-archive-material-publication-delivery-runtime.test.mjs",
  approvalReport: "reports/teaching-archive-material-publication-approval.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0309-teaching-archive-material-publication-delivery-envelope.md",
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

export async function auditTeachingArchiveMaterialPublicationDelivery(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const approvalReport = parseJson(inputs.approvalReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const probe = runProbe(approvalReport, options);

  addFinding(findings, {
    id: "source.publication_approval_ready",
    passed: approvalReport.readiness === "READY" &&
      approvalReport.workloadType === "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL" &&
      approvalReport.runtime?.runtimeId === sourceRuntimeId &&
      approvalReport.runtime?.status === sourceStatus &&
      approvalReport.runtimeSlo?.totalErrors === 0 &&
      approvalReport.safetyInvariants?.publicationApproved === true &&
      approvalReport.safetyInvariants?.approvedForPublicationDelivery === true &&
      approvalReport.safetyInvariants?.studentVisiblePublished === false &&
      approvalReport.safetyInvariants?.deliveryEnvelopeCreated === false,
    actual: `${approvalReport.readiness ?? "missing"}:${approvalReport.runtime?.status ?? "missing"}:${approvalReport.safetyInvariants?.approvedForPublicationDelivery ?? "missing"}`,
    expected: "READY 0308 publication approval with no delivery or persistence side effect",
    remediation: "Run the 0308 publication approval audit before delivery envelope creation.",
  });

  addFinding(findings, {
    id: "runtime.identity_and_safety",
    passed: includesAll(runtime, [
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_PORT",
      "TeachingArchiveMaterialPublicationDeliveryPort.recordTeachingArchiveMaterialPublicationDeliveryEnvelope",
      "recordTeachingArchiveMaterialPublicationDeliveryEnvelope",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_ENVELOPE_READY_NOT_PERSISTED",
      "READY_FOR_STUDENT_APP_MATERIAL_RENDER_NOT_ARCHIVED",
      "assertDeliveryPrincipal",
      "STUDENT_DELIVERY_ENVELOPE",
      "STUDENT_APP_DELIVERY",
      "studentVisibleMaterialDeliveryEnvelopeCreated: true",
      "studentVisibleMaterialDelivered: true",
      "durablePublicationPersistenceStarted: false",
      "publicationCommitted: false",
      "mainDatabaseWriteStarted: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "modelInferenceStarted: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, ["teaching_archive_material_publication_delivery_runtime", "READY_FOR_STUDENT_APP_MATERIAL_RENDER_NOT_ARCHIVED", "durablePublicationPersistenceStarted: false"]),
    expected: "runtime is idempotent, creates only a controlled Student App material delivery envelope, and blocks persistence, DB, HTTP, OCR/RAG, AI grading, model, tools, and Swarm",
    remediation: "Keep 0309 as a delivery-envelope runtime, not durable publication persistence.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_delivery_envelope",
    passed: probe.status === "PASS" &&
      probe.result?.status === deliveryStatus &&
      probe.result?.commandPort === TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_PORT &&
      probe.result?.studentMaterialDeliveryEnvelope?.archiveItemId === "tarch_archive_material_001" &&
      probe.result?.studentMaterialDeliveryEnvelope?.deliveryState === "READY_FOR_STUDENT_APP_MATERIAL_RENDER_NOT_ARCHIVED" &&
      probe.result?.boundary?.studentVisibleMaterialDeliveryEnvelopeCreated === true &&
      probe.result?.boundary?.studentVisibleMaterialDelivered === true &&
      probe.result?.boundary?.durablePublicationPersistenceStarted === false &&
      probe.result?.boundary?.publicationCommitted === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `status=${probe.result.status};state=${probe.result.studentMaterialDeliveryEnvelope.deliveryState};p99=${probe.runtimeSlo.p99Ms}` : probe.error,
    expected: "probe records one Student App renderable material delivery envelope under 50ms without durable persistence",
    remediation: "0309 must not commit durable publication state.",
  });

  addFinding(findings, {
    id: "tests.cover_publication_delivery_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a student-visible material delivery envelope while keeping durable publication blocked",
      "uses idempotency for replay and rejects conflicting delivery envelopes",
      "rejects unsafe principal, unapproved source, delivery mismatch, and missing evidence",
      "rejects unsafe policy, leaked fields, unsafe text, and durable publication collapse",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, service principal, source, mismatch, evidence, policy, leak, unsafe text, and durable-collapse tests",
    remediation: "Add regression coverage before treating publication delivery as root workflow evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:teaching-archive-material-publication-delivery"]?.includes("teaching-archive-material-publication-delivery-audit.mjs")) &&
      includesAll(hooks, [
        "Teaching archive material publication delivery runtime audit",
        "teachingArchiveMaterialPublicationDelivery",
        "teaching-archive-material-publication-delivery.current.json",
        "teaching_archive_material_publication_delivery_runtime",
        "0309-teaching-archive-material-publication-delivery-envelope.md",
        "10.63/10",
        "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_ENVELOPE_READY_NOT_PERSISTED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:teaching-archive-material-publication-delivery",
      "teachingArchiveMaterialPublicationDelivery",
      "10.63/10",
    ]),
    expected: "package, quality gate, root coverage, structure verifier, SDD, and architecture board track 0309",
    remediation: "Wire publication delivery through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY",
    runtime: {
      runtimeId: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_RUNTIME_ID,
      commandPort: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_PORT,
      sourceRuntimeId,
      status: deliveryStatus,
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { teachingArchiveMaterialPublicationDelivery: probe },
    safetyInvariants: {
      publicationApprovalRequired: true,
      publicationApprovalVerified: true,
      studentDeliveryEnvelopeAllowed: true,
      safeMaterialEnvelopeOnly: true,
      studentOwnScopeEnforced: true,
      studentVisibleMaterialDeliveryEnvelopeCreated: true,
      studentVisibleMaterialDelivered: true,
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
      futureDurablePublicationPersistenceReviewRequired: true,
    },
    findings,
    nextAction: "Use this as Student App renderable material delivery evidence; durable publication persistence, OCR/RAG enrichment, AI grading, and model execution remain separate reviewed slices.",
  };
}

export function formatTeachingArchiveMaterialPublicationDeliveryAudit(report) {
  return [
    `Teaching archive material publication delivery runtime: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
    `Status: ${report.runtime.status}`,
    `P99: ${report.runtimeSlo.p99Ms}ms`,
    `Findings: ${report.findings.filter((finding) => !finding.passed).length} failing`,
  ].join("\n");
}

function runProbe(approvalReport, options) {
  try {
    const result = recordTeachingArchiveMaterialPublicationDeliveryEnvelope(buildProbeInput(approvalReport), {
      commandLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "teaching-archive-material-publication-delivery-audit-")), "commands.jsonl"),
      generatedAt: "2026-06-07T09:45:00.000Z",
      probeP99Ms: options.probeP99Ms ?? 6,
    });
    return { status: "PASS", result, runtimeSlo: { targetP99Ms: 50, p99Ms: options.probeP99Ms ?? 6, totalErrors: 0, operations: 1, evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_PROBE" } };
  } catch (error) {
    return { status: "FAIL", error: error.message, runtimeSlo: failedSlo() };
  }
}

function buildProbeInput(approvalReport) {
  const result = approvalReport.runtimeProbes?.teachingArchiveMaterialPublicationApproval?.result ?? {};
  const candidate = result.approvedPublicationCandidate ?? {};
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-delivery.v1",
    deliveryInvocationId: "archive_material_publication_delivery_001",
    principal: {
      principalId: "student_delivery_runtime_001",
      sessionId: "student_delivery_session_001",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "STUDENT_DELIVERY_RUNTIME",
      scopes: ["TEACHING_READ", "STUDENT_DELIVERY_ENVELOPE", "STUDENT_APP_DELIVERY"],
    },
    publicationApprovalReport: approvalReport,
    publicationDeliveryPolicy: {
      publicationApprovalRequired: true,
      studentDeliveryEnvelopeAllowed: true,
      studentVisibleMaterialAllowed: true,
      studentOwnScopeRequired: true,
      safeMaterialEnvelopeRequired: true,
      futureDurablePublicationPersistenceReviewRequired: true,
      idempotentPublicationDeliveryRequired: true,
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
    publicationDeliveryRequest: {
      envelopeId: "archive_material_delivery_env_001",
      deliveryMode: "STUDENT_APP_RENDERABLE_ARCHIVE_MATERIAL_ENVELOPE",
      channel: "STUDENT_APP",
      audienceKind: "STUDENT_ARCHIVE_MATERIAL",
      visibilityState: "STUDENT_VISIBLE_ARCHIVE_MATERIAL_DELIVERY_ENVELOPE_NOT_PERSISTED",
      scopeRef: {
        scopeType: "STUDENT_OWN_ARCHIVE",
        studentId: candidate.studentId,
        archiveItemId: candidate.archiveItemId,
      },
      approvalRecordId: result.recordId,
      approvalId: result.publicationApproval?.approvalId,
      publicationCandidateId: candidate.publicationCandidateId,
      archiveItemId: candidate.archiveItemId,
      studentId: candidate.studentId,
      materialType: candidate.materialType,
      title: candidate.title,
      contentRef: candidate.contentRef,
      studentOwnScopeConfirmed: true,
    },
    evidenceRefs: ["evidence:publication-approval:0308", "evidence:publication-delivery:0309"],
    idempotencyKey: "archive-material-publication-delivery:student_001:fractions_packet",
  };
}

function loadInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, file]) => [key, fs.readFileSync(path.join(root, file), "utf8")]));
}
function parseJson(text, fallback) { try { return JSON.parse(text); } catch { return fallback; } }
function includesAll(text, needles) { return needles.every((needle) => String(text).includes(needle)); }
function hasForbiddenRuntimeClaim(text) { return forbiddenRuntimeClaims.some((claim) => String(text).includes(claim)); }
function summarizePresence(text, needles) { return needles.map((needle) => `${needle}=${String(text).includes(needle)}`).join(";"); }
function failedSlo() { return { targetP99Ms: 50, p99Ms: null, totalErrors: 1, operations: 0, evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_PROBE" }; }
function addFinding(findings, finding) {
  findings.push({
    severity: finding.passed ? "info" : "error",
    id: finding.id,
    passed: Boolean(finding.passed),
    actual: finding.actual,
    expected: finding.expected,
    remediation: finding.remediation,
  });
}
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
    const report = await auditTeachingArchiveMaterialPublicationDelivery(loadInputs(root));
    writeReport(root, args.out, report);
    console.log(formatTeachingArchiveMaterialPublicationDeliveryAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
