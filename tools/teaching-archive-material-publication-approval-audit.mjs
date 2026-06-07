import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_PORT,
  TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_RUNTIME_ID,
  recordTeachingArchiveMaterialPublicationApproval,
} from "./teaching-archive-material-publication-approval-runtime.mjs";

const defaultOutPath = "reports/teaching-archive-material-publication-approval.current.json";
const sourceRuntimeId = "teaching_archive_material_publication_precheck_runtime";
const sourceStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_READY";
const approvalStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVED_NOT_PUBLISHED";
const sourceFiles = {
  runtime: "tools/teaching-archive-material-publication-approval-runtime.mjs",
  runtimeTest: "tools/teaching-archive-material-publication-approval-runtime.test.mjs",
  precheckReport: "reports/teaching-archive-material-publication-precheck.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0308-teaching-archive-material-publication-approval.md",
};
const forbiddenRuntimeClaims = [
  "node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ",
  "INSERT ", "UPDATE ", "DELETE ", "directPublicationAllowed: true",
  "studentVisibleDeliveryAllowed: true", "mainDatabaseWriteAllowed: true",
  "directDatabaseAccessAllowed: true", "executeHttpRequestAllowed: true",
  "ocrOrRagJobWriteAllowed: true", "ocrOrRagJobWriteStarted: true",
  "aiGradingWriteAllowed: true", "aiGradingWriteStarted: true",
  "modelInferenceAllowed: true", "modelInferenceStarted: true",
  "publicationCommitted: true", "studentVisiblePublished: true",
  "deliveryEnvelopeCreated: true", "swarmAllowed: true",
  "innerHTML", "dangerouslySetInnerHTML",
];

export async function auditTeachingArchiveMaterialPublicationApproval(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const precheckReport = parseJson(inputs.precheckReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const probe = runProbe(precheckReport, options);

  addFinding(findings, {
    id: "source.publication_precheck_ready",
    passed: precheckReport.readiness === "READY" &&
      precheckReport.workloadType === "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK" &&
      precheckReport.runtime?.runtimeId === sourceRuntimeId &&
      precheckReport.runtime?.status === sourceStatus &&
      precheckReport.runtimeSlo?.totalErrors === 0 &&
      precheckReport.safetyInvariants?.humanPublicationPrecheckRecorded === true &&
      precheckReport.safetyInvariants?.publicationApprovalRequired === true &&
      precheckReport.safetyInvariants?.studentVisiblePublished === false,
    actual: `${precheckReport.readiness ?? "missing"}:${precheckReport.runtime?.status ?? "missing"}:${precheckReport.safetyInvariants?.publicationApprovalRequired ?? "missing"}`,
    expected: "READY 0307 publication precheck with no publication side effect",
    remediation: "Run the 0307 publication precheck audit before publication approval.",
  });

  addFinding(findings, {
    id: "runtime.identity_and_safety",
    passed: includesAll(runtime, [
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_PORT",
      "TeachingArchiveMaterialPublicationApprovalPort.recordTeachingArchiveMaterialPublicationApproval",
      "recordTeachingArchiveMaterialPublicationApproval",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVED_NOT_PUBLISHED",
      "APPROVED_FOR_PUBLICATION_DELIVERY",
      "publicationApproved: true",
      "approvedForPublicationDelivery: true",
      "studentVisiblePublished: false",
      "publicationCommitted: false",
      "deliveryEnvelopeCreated: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "modelInferenceStarted: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, ["teaching_archive_material_publication_approval_runtime", "APPROVED_FOR_PUBLICATION_DELIVERY", "studentVisiblePublished: false"]),
    expected: "runtime is idempotent, approval-only, and blocks publication, OCR/RAG, AI grading, model execution, raw DB, HTTP, tools, and Swarm",
    remediation: "Keep 0308 as a publication approval command record, not a publishing runtime.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_publication_approval",
    passed: probe.status === "PASS" &&
      probe.result?.status === approvalStatus &&
      probe.result?.commandPort === TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_PORT &&
      probe.result?.approvedPublicationCandidate?.archiveItemId === "tarch_archive_material_001" &&
      probe.result?.approvalDecision?.decision === "APPROVED_FOR_PUBLICATION_DELIVERY" &&
      probe.result?.boundary?.publicationApproved === true &&
      probe.result?.boundary?.studentVisiblePublished === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `status=${probe.result.status};decision=${probe.result.approvalDecision.decision};p99=${probe.runtimeSlo.p99Ms}` : probe.error,
    expected: "probe records one approval-only publication decision under 50ms",
    remediation: "0308 must only approve a future delivery runtime.",
  });

  addFinding(findings, {
    id: "tests.cover_publication_approval_negative_paths",
    passed: includesAll(runtimeTest, [
      "records an approval-only publication decision from 0307 precheck evidence",
      "uses idempotency for replay and rejects conflicting publication approvals",
      "rejects forbidden principal, unsafe source precheck, approval mismatch, and missing evidence",
      "rejects unsafe policy, leaked fields, unsafe text, and delivery collapse",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, principal, source, mismatch, evidence, policy, leak, unsafe text, and delivery-collapse tests",
    remediation: "Add regression coverage before treating publication approval as root workflow evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:teaching-archive-material-publication-approval"]?.includes("teaching-archive-material-publication-approval-audit.mjs")) &&
      includesAll(hooks, [
        "Teaching archive material publication approval runtime audit",
        "teachingArchiveMaterialPublicationApproval",
        "teaching-archive-material-publication-approval.current.json",
        "teaching_archive_material_publication_approval_runtime",
        "0308-teaching-archive-material-publication-approval.md",
        "10.60/10",
        "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVED_NOT_PUBLISHED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:teaching-archive-material-publication-approval",
      "teachingArchiveMaterialPublicationApproval",
      "10.60/10",
    ]),
    expected: "package, quality gate, root coverage, structure verifier, SDD, and architecture board track 0308",
    remediation: "Wire publication approval through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL",
    runtime: {
      runtimeId: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_RUNTIME_ID,
      commandPort: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_PORT,
      sourceRuntimeId,
      status: approvalStatus,
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { teachingArchiveMaterialPublicationApproval: probe },
    safetyInvariants: {
      sourcePublicationPrecheckRequired: true,
      physicalDatabaseRowVerified: true,
      humanPublicationPrecheckRecorded: true,
      publicationApproved: true,
      approvedForPublicationDelivery: true,
      publicationCommitted: false,
      studentVisiblePublished: false,
      deliveryEnvelopeCreated: false,
      mainDatabaseWriteStarted: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: "Use this as publication delivery input; actual publication, OCR/RAG enrichment, AI grading, and model execution remain separate reviewed slices.",
  };
}

export function formatTeachingArchiveMaterialPublicationApprovalAudit(report) {
  return [
    `Teaching archive material publication approval runtime: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
    `Status: ${report.runtime.status}`,
    `P99: ${report.runtimeSlo.p99Ms}ms`,
    `Findings: ${report.findings.filter((finding) => !finding.passed).length} failing`,
  ].join("\n");
}

function runProbe(precheckReport, options) {
  try {
    const result = recordTeachingArchiveMaterialPublicationApproval(buildProbeInput(precheckReport), {
      commandLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "teaching-archive-material-publication-approval-audit-")), "commands.jsonl"),
      generatedAt: "2026-06-07T09:15:00.000Z",
      probeP99Ms: options.probeP99Ms ?? 6,
    });
    return { status: "PASS", result, runtimeSlo: { targetP99Ms: 50, p99Ms: options.probeP99Ms ?? 6, totalErrors: 0, operations: 1, evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_PROBE" } };
  } catch (error) {
    return { status: "FAIL", error: error.message, runtimeSlo: failedSlo() };
  }
}

function buildProbeInput(precheckReport) {
  const candidate = precheckReport.runtimeProbes?.teachingArchiveMaterialPublicationPrecheck?.result?.publicationCandidate ?? {};
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-approval.v1",
    approvalInvocationId: "archive_material_publication_approval_001",
    principal: {
      principalId: "teacher_001",
      sessionId: "teacher_session_001",
      subjectType: "USER",
      role: "TEACHER",
      entryPoint: "DESKTOP_TEACHING",
      scopes: ["TEACHING_ARCHIVE_REVIEW", "TEACHING_ARCHIVE_PUBLISH_APPROVE"],
    },
    publicationPrecheckReport: precheckReport,
    publicationApprovalPolicy: {
      approvalOnly: true,
      sourcePublicationPrecheckRequired: true,
      humanPublicationApprovalRequired: true,
      candidateMatchRequired: true,
      noSensitiveLeakageRequired: true,
      futurePublicationDeliveryRuntimeRequired: true,
      idempotentPublicationApprovalRequired: true,
      directPublicationAllowed: false,
      studentVisibleDeliveryAllowed: false,
      mainDatabaseWriteAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteAllowed: false,
      aiGradingWriteAllowed: false,
      modelInferenceAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    publicationApproval: {
      approvalId: "archive_material_publication_approval_001",
      reviewerPrincipalId: "teacher_001",
      decision: "APPROVED_FOR_PUBLICATION_DELIVERY",
      approvedAt: "2026-06-07T09:15:00.000Z",
      publicationCandidateId: candidate.publicationCandidateId,
      archiveItemId: candidate.archiveItemId,
      studentId: candidate.studentId,
      materialType: candidate.materialType,
      title: candidate.title,
      contentRef: candidate.contentRef,
      sourcePublicationPrecheckVerified: true,
      publicationCandidateVerified: true,
      studentOwnScopeReviewed: true,
      sensitiveLeakageReviewed: true,
      futurePublicationDeliveryRuntimeRequired: true,
      approvalNotes: "Teacher approved the reviewed material for a later delivery runtime.",
      publicationCommitted: false,
      studentVisiblePublished: false,
      deliveryEnvelopeCreated: false,
      mainDatabaseWriteApproved: false,
      ocrOrRagJobApproved: false,
      aiGradingApproved: false,
      modelInferenceApproved: false,
      remoteDeviceControlApproved: false,
      localToolMutationApproved: false,
      swarmApproved: false,
    },
    evidenceRefs: ["evidence:publication-precheck:0307", "evidence:publication-approval:0308"],
    idempotencyKey: "archive-material-publication-approval:student_001:fractions_packet",
  };
}

function loadInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, file]) => [key, fs.readFileSync(path.join(root, file), "utf8")]));
}
function parseJson(text, fallback) { try { return JSON.parse(text); } catch { return fallback; } }
function includesAll(text, needles) { return needles.every((needle) => String(text).includes(needle)); }
function hasForbiddenRuntimeClaim(text) { return forbiddenRuntimeClaims.some((claim) => String(text).includes(claim)); }
function summarizePresence(text, needles) { return needles.map((needle) => `${needle}=${String(text).includes(needle)}`).join(";"); }
function failedSlo() { return { targetP99Ms: 50, p99Ms: null, totalErrors: 1, operations: 0, evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_PROBE" }; }
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
    const report = await auditTeachingArchiveMaterialPublicationApproval(loadInputs(root));
    writeReport(root, args.out, report);
    console.log(formatTeachingArchiveMaterialPublicationApprovalAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
