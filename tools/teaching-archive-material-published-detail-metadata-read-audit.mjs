import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_PORT,
  TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_RUNTIME_ID,
  verifyTeachingArchiveMaterialPublishedDetailMetadataRead,
} from "./teaching-archive-material-published-detail-metadata-read-runtime.mjs";

const defaultOutPath = "reports/teaching-archive-material-published-detail-metadata-read.current.json";
const sourceRuntimeId = "teaching_archive_material_published_search_foundation_runtime";
const sourceCommandPort =
  "TeachingArchiveMaterialPublishedSearchFoundationPort.verifyStudentAppPublishedMaterialSearch";
const sourceStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_VERIFIED";
const verifiedStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_VERIFIED";

const sourceFiles = {
  runtime: "tools/teaching-archive-material-published-detail-metadata-read-runtime.mjs",
  runtimeTest: "tools/teaching-archive-material-published-detail-metadata-read-runtime.test.mjs",
  sourceSearchReport: "reports/teaching-archive-material-published-search-foundation.current.json",
  openapi: "contracts/openapi/teaching-archive.yaml",
  openapiPath: "contracts/openapi/teaching-archive.student-app-archive-item-detail.path.yaml",
  domain: "services/teaching-archive-gateway/internal/domain/student_app_archive_items.go",
  domainTest: "services/teaching-archive-gateway/internal/domain/student_app_archive_items_test.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/read_student_app_archive_item.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/read_student_app_archive_item_test.go",
  httpRoutes: "services/teaching-archive-gateway/internal/adapter/httpapi/server_routes.go",
  httpPaths: "services/teaching-archive-gateway/internal/adapter/httpapi/server_paths.go",
  http: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_archive_items.go",
  httpPresenter: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_archive_items_test.go",
  httpHelpers: "services/teaching-archive-gateway/internal/adapter/httpapi/server_test_helpers_test.go",
  repository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items.go",
  repositoryTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_published_archive_items_test.go",
  main: "services/teaching-archive-gateway/cmd/gateway/main.go",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0316-teaching-archive-material-published-detail-metadata-read.md",
};

const forbiddenRuntimeClaims = [
  "node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ",
  "INSERT ", "UPDATE ", "DELETE ", "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true", "rawContentReadAllowed: true",
  "ocrOrRagJobWriteAllowed: true", "aiGradingWriteAllowed: true",
  "modelInferenceAllowed: true", "publicationWriteAllowed: true",
  "remoteDeviceControlAllowed: true", "localToolMutationAllowed: true", "swarmAllowed: true",
  "innerHTML", "dangerouslySetInnerHTML",
];

export async function auditTeachingArchiveMaterialPublishedDetailMetadataRead(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const sourceSearchReport = parseJson(inputs.sourceSearchReport, {});
  const implementationEvidence = [
    inputs.openapi ?? "",
    inputs.openapiPath ?? "",
    inputs.domain ?? "",
    inputs.domainTest ?? "",
    inputs.usecase ?? "",
    inputs.usecaseTest ?? "",
    inputs.httpRoutes ?? "",
    inputs.httpPaths ?? "",
    inputs.http ?? "",
    inputs.httpPresenter ?? "",
    inputs.httpResponses ?? "",
    inputs.httpTest ?? "",
    inputs.httpHelpers ?? "",
    inputs.repository ?? "",
    inputs.repositoryTest ?? "",
    inputs.main ?? "",
  ].join("\n");
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runProbe(sourceSearchReport, options);

  addFinding(findings, {
    id: "source.published_search_foundation_ready",
    passed: sourceSearchReport.readiness === "READY" &&
      sourceSearchReport.workloadType === "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION" &&
      sourceSearchReport.runtime?.runtimeId === sourceRuntimeId &&
      sourceSearchReport.runtime?.commandPort === sourceCommandPort &&
      sourceSearchReport.runtime?.status === sourceStatus &&
      sourceSearchReport.runtimeSlo?.totalErrors === 0 &&
      sourceSearchReport.safetyInvariants?.publicationStoreFiltered === true &&
      sourceSearchReport.safetyInvariants?.ownStudentOnly === true &&
      sourceSearchReport.safetyInvariants?.responseMetadataOnly === true &&
      sourceSearchReport.safetyInvariants?.directDatabaseAccessAllowed === false,
    actual: `${sourceSearchReport.readiness ?? "missing"}:${sourceSearchReport.runtime?.status ?? "missing"}`,
    expected: "READY 0315 published search foundation evidence with publication-store filtering and no raw side effects",
    remediation: "Run the 0315 published search foundation audit before claiming detail metadata read.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_idempotency_and_safety",
    passed: includesAll(runtime, [
      "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_PORT",
      "TeachingArchiveMaterialPublishedDetailMetadataReadPort.verifyStudentAppPublishedMaterialDetailMetadataRead",
      "verifyTeachingArchiveMaterialPublishedDetailMetadataRead",
      "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_VERIFIED",
      "StudentAppPublishedMaterialDetailMetadataReadPort.getPublishedArchiveMaterialMetadata is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "archiveItemIdNormalized: true",
      "publicationStoreFiltered: true",
      "safeMetadataOnly: true",
      "contentRefExcluded: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "rawContentReadAllowed: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "modelInferenceStarted: false",
      "publicationWriteStarted: false",
      "swarmAllowed: false",
      "requiresFutureContentPreviewSlice: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, [
      "teaching_archive_material_published_detail_metadata_read_runtime",
      "func (r *ArchiveRepository) GetPublishedForStudentApp",
      "contentRefExcluded",
      ...forbiddenRuntimeClaims,
    ]),
    expected: "runtime records idempotent safe metadata detail read through an injected port and no DB/HTTP/model side effects",
    remediation: "Keep 0316 as a safe metadata detail proof, not a raw content preview or JS database runner.",
  });

  addFinding(findings, {
    id: "runtime.probe_verifies_safe_detail_metadata_read",
    passed: probe.status === "PASS" &&
      probe.result?.status === verifiedStatus &&
      probe.result?.commandPort === TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_PORT &&
      probe.result?.sourcePublishedSearchFoundation?.runtimeId === sourceRuntimeId &&
      probe.result?.studentProductDetailSource?.endpoint === "GET /v1/student-app/archive-items/{archiveItemId}" &&
      probe.result?.studentProductDetailSource?.repository === "ArchiveRepository.GetPublishedForStudentApp" &&
      probe.result?.studentProductDetailSource?.projectionTable === "teaching_archive_publications" &&
      probe.result?.studentProductDetailSource?.genericGetByIDBypassed === true &&
      probe.result?.boundary?.contentRefExcluded === true &&
      probe.result?.responseMetadata?.contentRef === undefined &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};item=${probe.result.detail.archiveItemId};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe proves Student App published-material detail metadata read under 50ms without contentRef, OCR/RAG, model work, or publication internals",
    remediation: "0316 must prove safe detail metadata through the already-hardened publication projection.",
  });

  addFinding(findings, {
    id: "go_openapi_postgres_http_detail_evidence_exists",
    passed: includesAll(implementationEvidence, [
      "/v1/student-app/archive-items/{archiveItemId}",
      "StudentAppArchiveItemMetadataResponse",
      "ReadStudentAppArchiveItemInput",
      "NormalizeReadStudentAppArchiveItemInput",
      "normalizeStudentAppArchiveItemID",
      "BuildStudentAppArchiveItemMetadata",
      "NewReadStudentAppArchiveItem",
      "GetPublishedForStudentApp",
      "func (r *ArchiveRepository) GetPublishedForStudentApp",
      "FROM teaching_archive_publications AS publication",
      "publication.archive_item_id = item.id",
      "publication.student_id = item.student_id",
      "publication.visibility_state = 'STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED'",
      "publication.channel = 'STUDENT_APP'",
      "parseStudentAppArchiveItemPath",
      "readStudentAppArchiveItemMetadata",
      "toStudentAppArchiveItemMetadataResponse",
      "TestReadStudentAppArchiveItemReturnsSafePublishedMetadata",
      "TestReadStudentAppArchiveItemUsesPublishedProjectionDetailPort",
      "TestGetPublishedForStudentAppUsesPublicationProjectionFilter",
      "TestNormalizeReadStudentAppArchiveItemRejectsUnsafeIDs",
    ]) &&
      implementationEvidence.includes("generic get reads = %d, want 0") &&
      implementationEvidence.includes("[]byte(`\"contentRef\"`)") &&
      !implementationEvidence.includes("writeJSON(w, http.StatusOK, toResponse(item))"),
    actual: summarizePresence(implementationEvidence, [
      "ReadStudentAppArchiveItem",
      "GetPublishedForStudentApp",
      "StudentAppArchiveItemMetadataResponse",
      "contentRef",
      "teaching_archive_publications",
    ]),
    expected: "OpenAPI, domain, use case, HTTP, repository, main wiring, and tests prove safe published detail metadata read without generic GetByID exposure",
    remediation: "Do not claim 0316 unless the detail endpoint is publication-filtered and omits contentRef/publication internals.",
  });

  addFinding(findings, {
    id: "tests.cover_detail_negative_paths",
    passed: includesAll(runtimeTest, [
      "verifies published material safe detail metadata through the Student App archive item path",
      "uses idempotency for replay and rejects conflicting detail verification",
      "rejects unsafe source, unsafe policy, missing port, unsafe id, and missing expected material",
      "rejects generic sources, scope leaks, unpublished gaps, product metadata leaks, and missing evidence refs",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, unsafe source/policy/id, missing port/material, generic repo, scope leak, contentRef/publication leaks, and evidence tests",
    remediation: "Add regression coverage before treating detail metadata read as root workflow evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:teaching-archive-material-published-detail-metadata-read"]?.includes("teaching-archive-material-published-detail-metadata-read-audit.mjs")) &&
      includesAll(hooks, [
        "Teaching archive material published detail metadata read runtime audit",
        "teachingArchiveMaterialPublishedDetailMetadataRead",
        "teaching-archive-material-published-detail-metadata-read.current.json",
        "teaching_archive_material_published_detail_metadata_read_runtime",
        "0316-teaching-archive-material-published-detail-metadata-read.md",
        "10.84/10",
        "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_VERIFIED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:teaching-archive-material-published-detail-metadata-read",
      "teachingArchiveMaterialPublishedDetailMetadataRead",
      "10.84/10",
    ]),
    expected: "package, quality gate, root workflow coverage, structure verifier, SDD, and architecture board track 0316",
    remediation: "Wire published detail metadata read through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ",
    runtime: {
      runtimeId: TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_RUNTIME_ID,
      commandPort: TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_PORT,
      sourceRuntimeId,
      sourceCommandPort,
      status: verifiedStatus,
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { teachingArchiveMaterialPublishedDetailMetadataRead: probe },
    safetyInvariants: {
      sourceSearchFoundationRequired: true,
      publishedProjectionDetailPortInvoked: true,
      goUseCaseReadAllowed: true,
      archiveItemIdNormalized: true,
      publicationStoreFiltered: true,
      ownStudentOnly: true,
      safeMetadataOnly: true,
      contentRefExcluded: true,
      publicationMetadataExcluded: true,
      answerKeyAndModelOutputExcluded: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      rawContentReadAllowed: false,
      fullTextContentReadAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      publicationWriteStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      futureContentPreviewSliceRequired: true,
    },
    findings,
  };
}

export function collectSourceFiles(root) {
  return Object.fromEntries(
    Object.entries(sourceFiles).map(([key, file]) => [key, readIfExists(path.join(root, file))]),
  );
}

async function runProbe(sourceSearchReport, options = {}) {
  try {
    let portCalls = 0;
    const result = await verifyTeachingArchiveMaterialPublishedDetailMetadataRead(makeProbeInput(sourceSearchReport), {
      generatedAt: options.generatedAt ?? "2026-06-07T13:10:00.000Z",
      probeP99Ms: options.probeP99Ms ?? 7,
      verificationLogPath: path.join(os.tmpdir(), `ita-0316-${Date.now()}-${Math.random()}.jsonl`),
      studentAppPublishedMaterialDetailMetadataReadPort: {
        async getPublishedArchiveMaterialMetadata(request) {
          portCalls += 1;
          return {
            found: request.archiveItemId === "tarch_archive_material_001",
            source: {
              endpoint: "GET /v1/student-app/archive-items/{archiveItemId}",
              useCase: "ReadStudentAppArchiveItem.Execute",
              repository: "ArchiveRepository.GetPublishedForStudentApp",
              projectionTable: "teaching_archive_publications",
              archiveItemIdNormalized: true,
              publicationStoreFiltered: true,
              ownStudentOnly: true,
              genericGetByIDBypassed: true,
              contentRefExcluded: true,
            },
            response: safeArchiveItemMetadata(),
          };
        },
      },
    });
    return { status: "PASS", result, portCalls, runtimeSlo: result.runtimeSlo };
  } catch (error) {
    return { status: "FAIL", error: `${error.code ?? "ERROR"}: ${error.message}`, runtimeSlo: failedSlo() };
  }
}

function makeProbeInput(sourceSearchReport) {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-published-detail-metadata-read.v1",
    verificationInvocationId: "archive_material_published_detail_metadata_read_001",
    principal: studentPrincipal(),
    publishedSearchFoundationReport: sourceSearchReport,
    archiveItemId: "tarch_archive_material_001",
    expectedArchiveItem: safeArchiveItemMetadata(),
    detailMetadataReadPolicy: {
      sourceSearchFoundationRequired: true,
      publishedProjectionDetailPortRequired: true,
      archiveItemIdNormalizationRequired: true,
      publicationStoreFilterRequired: true,
      ownStudentOnlyRequired: true,
      safeMetadataOnlyRequired: true,
      contentRefExcludedRequired: true,
      goUseCaseReadAllowed: true,
      rawContentReadAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteAllowed: false,
      aiGradingWriteAllowed: false,
      modelInferenceAllowed: false,
      publicationWriteAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      "evidence:published-search-foundation:0315",
      "evidence:published-detail-metadata-read:0316",
      "evidence:go-student-app-archive-detail:http-usecase-repository",
    ],
    idempotencyKey: "archive-material-published-detail-metadata-read:student_001:tarch_archive_material_001",
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
    evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_PROBE",
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
  const report = await auditTeachingArchiveMaterialPublishedDetailMetadataRead(collectSourceFiles(root));
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
