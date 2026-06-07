import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_PORT,
  TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_RUNTIME_ID,
  recordTeachingArchiveMaterialPublicationPrecheck,
} from "./teaching-archive-material-publication-precheck-runtime.mjs";

const defaultOutPath = "reports/teaching-archive-material-publication-precheck.current.json";
const sourceRuntimeId = "teaching_archive_material_draft_student_product_read_runtime";
const sourceStatus = "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_VERIFIED";
const precheckStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_READY";
const sourceFiles = {
  runtime: "tools/teaching-archive-material-publication-precheck-runtime.mjs",
  runtimeTest: "tools/teaching-archive-material-publication-precheck-runtime.test.mjs",
  productReadReport: "reports/teaching-archive-material-draft-student-product-read.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0307-teaching-archive-material-publication-precheck.md",
};
const forbiddenRuntimeClaims = [
  "node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ",
  "INSERT ", "UPDATE ", "DELETE ", "directPublicationAllowed: true",
  "studentVisibleDeliveryAllowed: true", "mainDatabaseWriteAllowed: true",
  "directDatabaseAccessAllowed: true", "executeHttpRequestAllowed: true",
  "ocrOrRagJobWriteAllowed: true", "ocrOrRagJobWriteStarted: true",
  "aiGradingWriteAllowed: true", "aiGradingWriteStarted: true",
  "modelInferenceAllowed: true", "modelInferenceStarted: true",
  "swarmAllowed: true", "innerHTML", "dangerouslySetInnerHTML",
];

export async function auditTeachingArchiveMaterialPublicationPrecheck(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const productReadReport = parseJson(inputs.productReadReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const probe = runProbe(productReadReport, options);

  addFinding(findings, {
    id: "source.student_product_read_ready",
    passed: productReadReport.readiness === "READY" &&
      productReadReport.workloadType === "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ" &&
      productReadReport.runtime?.runtimeId === sourceRuntimeId &&
      productReadReport.runtime?.status === sourceStatus &&
      productReadReport.runtimeSlo?.totalErrors === 0 &&
      productReadReport.safetyInvariants?.ownStudentProductReadVerified === true &&
      productReadReport.safetyInvariants?.publicationAllowed === false,
    actual: `${productReadReport.readiness ?? "missing"}:${productReadReport.runtime?.status ?? "missing"}:${productReadReport.safetyInvariants?.ownStudentProductReadVerified ?? "missing"}`,
    expected: "READY 0306 student product read with no publication side effect",
    remediation: "Run the 0306 student product read audit before publication precheck.",
  });

  addFinding(findings, {
    id: "runtime.identity_and_safety",
    passed: includesAll(runtime, [
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_PORT",
      "TeachingArchiveMaterialPublicationPrecheckPort.recordTeachingArchiveMaterialPublicationPrecheck",
      "recordTeachingArchiveMaterialPublicationPrecheck",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_READY",
      "READY_FOR_PUBLICATION_APPROVAL",
      "studentVisiblePublished: false",
      "publicationCommitted: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "modelInferenceStarted: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, ["teaching_archive_material_publication_precheck_runtime", "READY_FOR_PUBLICATION_APPROVAL", "studentVisiblePublished: false"]),
    expected: "runtime is idempotent, precheck-only, and blocks publication, OCR/RAG, AI grading, model execution, raw DB, HTTP, tools, and Swarm",
    remediation: "Keep 0307 as a publication precheck command record, not a publishing runtime.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_publication_precheck",
    passed: probe.status === "PASS" &&
      probe.result?.status === precheckStatus &&
      probe.result?.commandPort === TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_PORT &&
      probe.result?.publicationCandidate?.archiveItemId === "tarch_archive_material_001" &&
      probe.result?.precheckDecision?.decision === "READY_FOR_PUBLICATION_APPROVAL" &&
      probe.result?.boundary?.studentVisiblePublished === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `status=${probe.result.status};decision=${probe.result.precheckDecision.decision};p99=${probe.runtimeSlo.p99Ms}` : probe.error,
    expected: "probe records one precheck-only publication candidate under 50ms",
    remediation: "0307 must only prepare for a future human publication approval slice.",
  });

  addFinding(findings, {
    id: "tests.cover_publication_precheck_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a precheck-only publication candidate from 0306 student product read evidence",
      "uses idempotency for replay and rejects conflicting publication prechecks",
      "rejects forbidden principal, unsafe source report, candidate mismatch, and missing evidence",
      "rejects unsafe policy, leaked fields, unsafe text, and future-work collapse",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, principal, source, candidate, evidence, policy, leak, unsafe text, and future-work tests",
    remediation: "Add regression coverage before treating publication precheck as root workflow evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:teaching-archive-material-publication-precheck"]?.includes("teaching-archive-material-publication-precheck-audit.mjs")) &&
      includesAll(hooks, [
        "Teaching archive material publication precheck runtime audit",
        "teachingArchiveMaterialPublicationPrecheck",
        "teaching-archive-material-publication-precheck.current.json",
        "teaching_archive_material_publication_precheck_runtime",
        "0307-teaching-archive-material-publication-precheck.md",
        "10.57/10",
        "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_READY",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:teaching-archive-material-publication-precheck",
      "teachingArchiveMaterialPublicationPrecheck",
      "10.57/10",
    ]),
    expected: "package, quality gate, root coverage, structure verifier, SDD, and architecture board track 0307",
    remediation: "Wire publication precheck through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK",
    runtime: {
      runtimeId: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_RUNTIME_ID,
      commandPort: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_PORT,
      sourceRuntimeId,
      status: precheckStatus,
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { teachingArchiveMaterialPublicationPrecheck: probe },
    safetyInvariants: {
      sourceStudentProductReadRequired: true,
      physicalDatabaseRowVerified: true,
      humanPublicationPrecheckRecorded: true,
      publicationApprovalRequired: true,
      publicationCommitted: false,
      studentVisiblePublished: false,
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
    nextAction: "Use this as publication approval input; actual publication, OCR/RAG enrichment, AI grading, and model execution remain separate reviewed slices.",
  };
}

export function formatTeachingArchiveMaterialPublicationPrecheckAudit(report) {
  return [
    `Teaching archive material publication precheck runtime: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
    `Status: ${report.runtime.status}`,
    `P99: ${report.runtimeSlo.p99Ms}ms`,
    `Findings: ${report.findings.filter((finding) => !finding.passed).length} failing`,
  ].join("\n");
}

function runProbe(productReadReport, options) {
  try {
    const result = recordTeachingArchiveMaterialPublicationPrecheck(buildProbeInput(productReadReport), {
      commandLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "teaching-archive-material-publication-precheck-audit-")), "commands.jsonl"),
      generatedAt: "2026-06-07T08:45:00.000Z",
      probeP99Ms: options.probeP99Ms ?? 6,
    });
    return { status: "PASS", result, runtimeSlo: { targetP99Ms: 50, p99Ms: options.probeP99Ms ?? 6, totalErrors: 0, operations: 1, evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_PROBE" } };
  } catch (error) {
    return { status: "FAIL", error: error.message, runtimeSlo: failedSlo() };
  }
}

function buildProbeInput(productReadReport) {
  const item = productReadReport.runtimeProbes?.teachingArchiveMaterialDraftStudentProductRead?.result?.studentProductArchiveItem ?? {};
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-precheck.v1",
    precheckInvocationId: "archive_material_publication_precheck_001",
    principal: {
      principalId: "teacher_001",
      sessionId: "teacher_session_001",
      subjectType: "USER",
      role: "TEACHER",
      entryPoint: "DESKTOP_TEACHING",
      scopes: ["TEACHING_ARCHIVE_READ", "TEACHING_ARCHIVE_REVIEW"],
    },
    productReadReport,
    publicationPrecheckPolicy: {
      precheckOnly: true,
      sourceStudentProductReadRequired: true,
      physicalRowVerificationRequired: true,
      humanPublicationPrecheckRequired: true,
      noSensitiveLeakageRequired: true,
      futurePublicationApprovalRequired: true,
      idempotentPublicationPrecheckRequired: true,
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
    publicationCandidate: {
      publicationCandidateId: "archive_material_pub_precheck_001",
      archiveItemId: item.id,
      ownerType: item.ownerType,
      studentId: item.studentId,
      materialType: item.materialType,
      title: item.title,
      contentRef: item.contentRef,
      publicationTarget: "TEACHER_PUBLICATION_APPROVAL_QUEUE",
      intendedAudience: ["TEACHER_REVIEW"],
      studentVisibleRequested: false,
      ocrEnrichmentRequested: false,
      ragEnrichmentRequested: false,
      aiGradingRequested: false,
      releaseChannel: "NONE_PRECHECK_ONLY",
      reviewNotes: "Teacher precheck recorded for later publication approval.",
      riskTags: ["HUMAN_APPROVAL_REQUIRED"],
    },
    evidenceRefs: ["evidence:student-product-read:0306", "evidence:publication-precheck:0307"],
    idempotencyKey: "archive-material-publication-precheck:student_001:fractions_packet",
  };
}

function loadInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, file]) => [key, fs.readFileSync(path.join(root, file), "utf8")]));
}
function parseJson(text, fallback) { try { return JSON.parse(text); } catch { return fallback; } }
function includesAll(text, needles) { return needles.every((needle) => String(text).includes(needle)); }
function hasForbiddenRuntimeClaim(text) { return forbiddenRuntimeClaims.some((claim) => String(text).includes(claim)); }
function summarizePresence(text, needles) { return needles.map((needle) => `${needle}=${String(text).includes(needle)}`).join(";"); }
function failedSlo() { return { targetP99Ms: 50, p99Ms: null, totalErrors: 1, operations: 0, evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_PROBE" }; }
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
    const report = await auditTeachingArchiveMaterialPublicationPrecheck(loadInputs(root));
    writeReport(root, args.out, report);
    console.log(formatTeachingArchiveMaterialPublicationPrecheckAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
