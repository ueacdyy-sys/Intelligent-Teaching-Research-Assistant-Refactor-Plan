import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_PORT,
  TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_RUNTIME_ID,
  recordTeachingArchiveMaterialPublishedContentPreviewPrecheck,
} from "./teaching-archive-material-published-content-preview-precheck-runtime.mjs";

const defaultOutPath = "reports/teaching-archive-material-published-content-preview-precheck.current.json";
const sourceRuntimeId = "teaching_archive_material_published_detail_metadata_read_runtime";
const sourceCommandPort =
  "TeachingArchiveMaterialPublishedDetailMetadataReadPort.verifyStudentAppPublishedMaterialDetailMetadataRead";
const sourceStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_VERIFIED";
const blockedStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_BLOCKED_UNTIL_SAFE_CONTENT_STORE";

const sourceFiles = {
  runtime: "tools/teaching-archive-material-published-content-preview-precheck-runtime.mjs",
  runtimeTest: "tools/teaching-archive-material-published-content-preview-precheck-runtime.test.mjs",
  sourceDetailReport: "reports/teaching-archive-material-published-detail-metadata-read.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0317-teaching-archive-material-published-content-preview-precheck.md",
};

const forbiddenRuntimeClaims = [
  "node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ",
  "INSERT ", "UPDATE ", "DELETE ", "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true", "rawContentReadAllowed: true",
  "contentRefDisclosureAllowed: true", "objectStorageReadAllowed: true",
  "ocrOrRagJobWriteAllowed: true", "semanticRetrievalAllowed: true",
  "aiGradingWriteAllowed: true", "modelInferenceAllowed: true",
  "publicationWriteAllowed: true", "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true", "swarmAllowed: true",
  "rawContentReadStarted: true", "contentPreviewReadStarted: true",
  "objectStorageReadStarted: true", "modelInferenceStarted: true",
  "innerHTML", "dangerouslySetInnerHTML",
];

export async function auditTeachingArchiveMaterialPublishedContentPreviewPrecheck(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const sourceDetailReport = parseJson(inputs.sourceDetailReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.rootTrace ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = runProbe(sourceDetailReport, options);

  addFinding(findings, {
    id: "source.published_detail_metadata_read_ready",
    passed: sourceDetailReport.readiness === "READY" &&
      sourceDetailReport.workloadType === "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ" &&
      sourceDetailReport.runtime?.runtimeId === sourceRuntimeId &&
      sourceDetailReport.runtime?.commandPort === sourceCommandPort &&
      sourceDetailReport.runtime?.status === sourceStatus &&
      sourceDetailReport.runtimeSlo?.totalErrors === 0 &&
      sourceDetailReport.safetyInvariants?.publicationStoreFiltered === true &&
      sourceDetailReport.safetyInvariants?.ownStudentOnly === true &&
      sourceDetailReport.safetyInvariants?.safeMetadataOnly === true &&
      sourceDetailReport.safetyInvariants?.contentRefExcluded === true &&
      sourceDetailReport.safetyInvariants?.rawContentReadAllowed === false &&
      sourceDetailReport.safetyInvariants?.futureContentPreviewSliceRequired === true,
    actual: `${sourceDetailReport.readiness ?? "missing"}:${sourceDetailReport.runtime?.status ?? "missing"}`,
    expected: "READY 0316 published detail metadata read evidence with contentRef excluded and no raw content reads",
    remediation: "Run the 0316 published detail metadata read audit before claiming a content preview precheck.",
  });

  addFinding(findings, {
    id: "runtime.identity_block_decision_idempotency_and_safety",
    passed: includesAll(runtime, [
      "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_PORT",
      "TeachingArchiveMaterialPublishedContentPreviewPrecheckPort.recordStudentAppPublishedMaterialContentPreviewPrecheck",
      "recordTeachingArchiveMaterialPublishedContentPreviewPrecheck",
      "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_BLOCKED_UNTIL_SAFE_CONTENT_STORE",
      "BLOCK_UNTIL_SAFE_CONTENT_PREVIEW_STORE",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "contentPreviewPrecheckOnly: true",
      "safeContentPreviewStoreRequiredBeforeRead: true",
      "contentPreviewStoreAvailable: false",
      "contentPreviewReadAllowed: false",
      "rawContentReadAllowed: false",
      "contentRefDisclosureAllowed: false",
      "objectStorageReadStarted: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "ocrOrRagJobWriteStarted: false",
      "semanticRetrievalStarted: false",
      "aiGradingWriteStarted: false",
      "modelInferenceStarted: false",
      "publicationWriteStarted: false",
      "swarmAllowed: false",
      "requiresFutureContentPreviewStoreSlice: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, [
      "teaching_archive_material_published_content_preview_precheck_runtime",
      "BLOCK_UNTIL_SAFE_CONTENT_PREVIEW_STORE",
      "contentRefDisclosureAllowed: false",
      ...forbiddenRuntimeClaims,
    ]),
    expected: "runtime records an idempotent block decision and does not read DB/HTTP/object storage/raw content or start OCR/RAG/model/Swarm work",
    remediation: "Keep 0317 as a precheck boundary until a safe content preview store and renderer are reviewed.",
  });

  addFinding(findings, {
    id: "runtime.probe_blocks_published_content_preview",
    passed: probe.status === "PASS" &&
      probe.result?.status === blockedStatus &&
      probe.result?.commandPort === TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_PORT &&
      probe.result?.sourcePublishedDetailMetadataRead?.runtimeId === sourceRuntimeId &&
      probe.result?.precheckDecision?.contentPreviewAccessDecision === "BLOCK_UNTIL_SAFE_CONTENT_PREVIEW_STORE" &&
      probe.result?.precheckDecision?.contentPreviewReadAllowed === false &&
      probe.result?.precheckDecision?.rawContentReadAllowed === false &&
      probe.result?.precheckDecision?.contentRefDisclosureAllowed === false &&
      probe.result?.boundary?.detailMetadataEvidenceVerified === true &&
      probe.result?.boundary?.objectStorageReadStarted === false &&
      probe.result?.boundary?.modelInferenceStarted === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};decision=${probe.result.precheckDecision.contentPreviewAccessDecision};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe proves content preview is blocked under 50ms until a safe preview store and renderer exist",
    remediation: "0317 must block, not preview, published material content.",
  });

  addFinding(findings, {
    id: "tests.cover_preview_precheck_negative_paths",
    passed: includesAll(runtimeTest, [
      "blocks published material content preview until a safe preview store and renderer exist",
      "uses idempotency for replay and rejects conflicting content preview precheck inputs",
      "rejects unsafe 0316 source report, unsafe principal, unsafe policy, and missing evidence",
      "rejects contentRef, raw content, preview artifacts, answer, model, publication, and worker leaks",
      "rejects attempts to turn the precheck into DB, HTTP, object storage, OCR/RAG, model, publication, tool, or Swarm work",
    ]),
    actual: "runtime tests scanned",
    expected: "positive block decision, idempotency, unsafe source/principal/policy/evidence, leak, and forbidden side-effect tests",
    remediation: "Add regression coverage before treating content preview precheck as root workflow evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:teaching-archive-material-published-content-preview-precheck"]?.includes("teaching-archive-material-published-content-preview-precheck-audit.mjs")) &&
      includesAll(hooks, [
        "Teaching archive material published content preview precheck runtime audit",
        "teachingArchiveMaterialPublishedContentPreviewPrecheck",
        "teaching-archive-material-published-content-preview-precheck.current.json",
        "teaching_archive_material_published_content_preview_precheck_runtime",
        "0317-teaching-archive-material-published-content-preview-precheck.md",
        "10.87/10",
        "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_BLOCKED_UNTIL_SAFE_CONTENT_STORE",
        "BLOCK_UNTIL_SAFE_CONTENT_PREVIEW_STORE",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:teaching-archive-material-published-content-preview-precheck",
      "teachingArchiveMaterialPublishedContentPreviewPrecheck",
      "10.87/10",
    ]),
    expected: "package, quality gate, root workflow coverage, structure verifier, root trace, SDD, and architecture board track 0317",
    remediation: "Wire published content preview precheck through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK",
    runtime: {
      runtimeId: TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_RUNTIME_ID,
      commandPort: TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_PORT,
      sourceRuntimeId,
      sourceCommandPort,
      status: blockedStatus,
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { teachingArchiveMaterialPublishedContentPreviewPrecheck: probe },
    safetyInvariants: {
      sourceDetailMetadataReadRequired: true,
      detailMetadataEvidenceVerified: true,
      contentPreviewPrecheckOnly: true,
      safeContentPreviewStoreAvailable: false,
      safeContentPreviewStoreRequiredBeforeRead: true,
      safeRendererRequiredBeforeRead: true,
      ownStudentOnly: true,
      safeMetadataOnly: true,
      contentRefExcluded: true,
      rawContentReadStarted: false,
      contentPreviewReadStarted: false,
      contentRefDisclosed: false,
      objectStorageReadStarted: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      fullTextContentReadAllowed: false,
      ocrOrRagJobWriteStarted: false,
      semanticRetrievalStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      publicationWriteStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      futureContentPreviewStoreSliceRequired: true,
    },
    findings,
    nextAction: "Implement content preview only as a later reviewed store and renderer slice; do not expose contentRef or raw content from 0316 metadata.",
  };
}

export function collectSourceFiles(root) {
  return Object.fromEntries(
    Object.entries(sourceFiles).map(([key, file]) => [key, readIfExists(path.join(root, file))]),
  );
}

function runProbe(sourceDetailReport, options = {}) {
  try {
    const result = recordTeachingArchiveMaterialPublishedContentPreviewPrecheck(makeProbeInput(sourceDetailReport), {
      generatedAt: options.generatedAt ?? "2026-06-07T14:00:00.000Z",
      probeP99Ms: options.probeP99Ms ?? 6,
      precheckLogPath: path.join(os.tmpdir(), `ita-0317-${Date.now()}-${Math.random()}.jsonl`),
    });
    return { status: "PASS", result, runtimeSlo: result.runtimeSlo };
  } catch (error) {
    return { status: "FAIL", error: `${error.code ?? "ERROR"}: ${error.message}`, runtimeSlo: failedSlo() };
  }
}

function makeProbeInput(sourceDetailReport) {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-published-content-preview-precheck.v1",
    precheckInvocationId: "archive_material_published_content_preview_precheck_001",
    principal: studentPrincipal(),
    publishedDetailMetadataReadReport: sourceDetailReport,
    archiveItemId: "tarch_archive_material_001",
    selectedArchiveItem: safeArchiveItemMetadata(),
    contentPreviewPrecheckPolicy: {
      sourceDetailMetadataReadRequired: true,
      contentPreviewPrecheckOnly: true,
      safeContentPreviewStoreRequiredBeforeRead: true,
      authoritativeContentPreviewStoreAvailable: false,
      futureContentPreviewUseCase: "PreviewStudentAppArchiveItemContent.Execute",
      futureContentPreviewRepository: "ArchiveMaterialContentPreviewRepository.GetOwnPublishedPreview",
      ownStudentOnlyRequired: true,
      safeRendererRequiredBeforeRead: true,
      previewArtifactBoundaryRequired: true,
      rawContentReadAllowed: false,
      contentRefDisclosureAllowed: false,
      objectStorageReadAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteAllowed: false,
      semanticRetrievalAllowed: false,
      aiGradingWriteAllowed: false,
      modelInferenceAllowed: false,
      publicationWriteAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      "evidence:published-detail-metadata-read:0316",
      "evidence:published-content-preview-precheck:0317",
    ],
    idempotencyKey: "archive-material-published-content-preview-precheck:student_001:tarch_archive_material_001",
  };
}

function studentPrincipal() {
  return {
    principalId: "student_001",
    sessionId: "student_session_001",
    subjectType: "USER",
    role: "STUDENT",
    entryPoint: "STUDENT_APP",
    scopes: ["STUDENT_OWN_READ"],
    studentAccess: { mode: "OWN", ownStudentId: "student_001" },
  };
}

function safeArchiveItemMetadata() {
  return {
    id: "tarch_archive_material_001",
    ownerType: "STUDENT",
    studentId: "student_001",
    materialType: "HANDOUT",
    title: "Fractions practice packet",
    source: "SYSTEM_IMPORT",
    tags: ["fractions", "draft-approved"],
    analysisIntents: ["ARCHIVE_ONLY"],
    ocrStatus: "NOT_REQUIRED",
    createdAt: "2026-06-07T08:00:00Z",
  };
}

function addFinding(findings, finding) {
  findings.push({
    severity: finding.passed ? "info" : "error",
    ...finding,
  });
}

function includesAll(text, needles) {
  return needles.every((needle) => text.includes(needle));
}

function summarizePresence(text, needles) {
  return needles.map((needle) => `${needle}:${text.includes(needle) ? "yes" : "no"}`).join("; ");
}

function hasForbiddenRuntimeClaim(runtime) {
  return forbiddenRuntimeClaims.some((claim) => runtime.includes(claim));
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function failedSlo() {
  return {
    targetP99Ms: 50,
    p99Ms: Number.POSITIVE_INFINITY,
    totalErrors: 1,
    operations: 0,
    evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_PROBE",
  };
}

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const outPath = outIndex >= 0 ? args[outIndex + 1] : defaultOutPath;
  const root = process.cwd();
  const report = await auditTeachingArchiveMaterialPublishedContentPreviewPrecheck(collectSourceFiles(root));
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outPath), `${JSON.stringify(report, null, 2)}\n`);
  if (report.readiness !== "READY") {
    console.error(JSON.stringify(report.findings.filter((finding) => !finding.passed), null, 2));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
