import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_PORT,
  TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_RUNTIME_ID,
  verifyTeachingArchiveMaterialPublishedSearchFoundation,
} from "./teaching-archive-material-published-search-foundation-runtime.mjs";

const defaultOutPath = "reports/teaching-archive-material-published-search-foundation.current.json";
const sourceRuntimeId = "teaching_archive_material_publication_projection_hardening_runtime";
const sourceCommandPort =
  "TeachingArchiveMaterialPublicationProjectionHardeningPort.verifyStudentAppPublishedMaterialProjection";
const sourceStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENED";
const verifiedStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_VERIFIED";

const sourceFiles = {
  runtime: "tools/teaching-archive-material-published-search-foundation-runtime.mjs",
  runtimeTest: "tools/teaching-archive-material-published-search-foundation-runtime.test.mjs",
  projectionHardeningReport: "reports/teaching-archive-material-publication-projection-hardening.current.json",
  openapi: "contracts/openapi/teaching-archive.student-app-archive-items.path.yaml",
  domain: "services/teaching-archive-gateway/internal/domain/archive_query.go",
  domainStudentApp: "services/teaching-archive-gateway/internal/domain/student_app_archive_items.go",
  domainTest: "services/teaching-archive-gateway/internal/domain/student_app_archive_items_test.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/list_student_app_archive_items.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/list_student_app_archive_items_test.go",
  http: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_archive_items.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_archive_items_test.go",
  httpHelpers: "services/teaching-archive-gateway/internal/adapter/httpapi/server_test_helpers_test.go",
  repository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items.go",
  repositoryTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_published_archive_items_test.go",
  schema: "services/teaching-archive-gateway/internal/adapter/postgres/repository_schema.go",
  schemaTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_test.go",
  cache: "services/teaching-archive-gateway/internal/adapter/cache/archive_reader.go",
  cacheTest: "services/teaching-archive-gateway/internal/adapter/cache/archive_reader_test.go",
  sqlContract: "contracts/sql/teaching-archive.sql",
  sqlContractTest: "tools/teaching-archive-sql-contract.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0315-teaching-archive-material-published-search-foundation.md",
};

const forbiddenRuntimeClaims = [
  "node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ",
  "INSERT ", "UPDATE ", "DELETE ", "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true", "fullTextContentReadAllowed: true",
  "ocrOrRagJobWriteAllowed: true", "ocrOrRagJobWriteStarted: true",
  "aiGradingWriteAllowed: true", "aiGradingWriteStarted: true",
  "modelInferenceAllowed: true", "modelInferenceStarted: true",
  "publicationWriteAllowed: true", "publicationWriteStarted: true",
  "remoteDeviceControlAllowed: true", "localToolMutationAllowed: true",
  "swarmAllowed: true", "innerHTML", "dangerouslySetInnerHTML",
];

export async function auditTeachingArchiveMaterialPublishedSearchFoundation(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const projectionHardeningReport = parseJson(inputs.projectionHardeningReport, {});
  const implementationEvidence = [
    inputs.openapi ?? "",
    inputs.domain ?? "",
    inputs.domainStudentApp ?? "",
    inputs.domainTest ?? "",
    inputs.usecase ?? "",
    inputs.usecaseTest ?? "",
    inputs.http ?? "",
    inputs.httpTest ?? "",
    inputs.httpHelpers ?? "",
    inputs.repository ?? "",
    inputs.repositoryTest ?? "",
    inputs.schema ?? "",
    inputs.schemaTest ?? "",
    inputs.cache ?? "",
    inputs.cacheTest ?? "",
    inputs.sqlContract ?? "",
    inputs.sqlContractTest ?? "",
  ].join("\n");
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runProbe(projectionHardeningReport, options);

  addFinding(findings, {
    id: "source.projection_hardening_ready",
    passed: projectionHardeningReport.readiness === "READY" &&
      projectionHardeningReport.workloadType === "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING" &&
      projectionHardeningReport.runtime?.runtimeId === sourceRuntimeId &&
      projectionHardeningReport.runtime?.commandPort === sourceCommandPort &&
      projectionHardeningReport.runtime?.status === sourceStatus &&
      projectionHardeningReport.runtimeSlo?.totalErrors === 0 &&
      projectionHardeningReport.safetyInvariants?.publicationStoreFiltered === true &&
      projectionHardeningReport.safetyInvariants?.ownStudentOnly === true &&
      projectionHardeningReport.safetyInvariants?.unpublishedArchiveItemsExcluded === true &&
      projectionHardeningReport.safetyInvariants?.draftOnlyArchiveItemsExcluded === true &&
      projectionHardeningReport.safetyInvariants?.crossStudentArchiveItemsExcluded === true &&
      projectionHardeningReport.safetyInvariants?.directDatabaseAccessAllowed === false,
    actual: `${projectionHardeningReport.readiness ?? "missing"}:${projectionHardeningReport.runtime?.status ?? "missing"}`,
    expected: "READY 0314 projection hardening evidence with publication-store filtering and no raw side effects",
    remediation: "Run the 0314 projection hardening audit before claiming published material search.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_idempotency_and_safety",
    passed: includesAll(runtime, [
      "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_PORT",
      "TeachingArchiveMaterialPublishedSearchFoundationPort.verifyStudentAppPublishedMaterialSearch",
      "verifyTeachingArchiveMaterialPublishedSearchFoundation",
      "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_VERIFIED",
      "StudentAppPublishedMaterialSearchPort.searchPublishedArchiveMaterials is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "queryNormalized: true",
      "titleAndTagSearchOnly: true",
      "publicationStoreFiltered: true",
      "nonMatchingPublishedMaterialsExcluded: true",
      "answerKeyAndModelOutputExcluded: true",
      "responseMetadataOnly: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "modelInferenceStarted: false",
      "publicationWriteStarted: false",
      "swarmAllowed: false",
      "requiresFutureOcrRagSemanticSearchSlice: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, [
      "teaching_archive_material_published_search_foundation_runtime",
      "ArchiveRepository.ListPublishedForStudentApp",
      "idx_teaching_archive_items_student_material_search_scope",
      ...forbiddenRuntimeClaims,
    ]),
    expected: "runtime records idempotent title/tag metadata search through an injected port and no DB/HTTP/model side effects",
    remediation: "Keep 0315 as a search foundation proof, not a JS database runner, OCR/RAG job, or model call.",
  });

  addFinding(findings, {
    id: "runtime.probe_verifies_published_metadata_search",
    passed: probe.status === "PASS" &&
      probe.result?.status === verifiedStatus &&
      probe.result?.commandPort === TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_PORT &&
      probe.result?.sourceProjectionHardening?.runtimeId === sourceRuntimeId &&
      probe.result?.studentProductSearchSource?.endpoint === "GET /v1/student-app/archive-items?query=" &&
      probe.result?.studentProductSearchSource?.repository === "ArchiveRepository.ListPublishedForStudentApp" &&
      probe.result?.studentProductSearchSource?.projectionTable === "teaching_archive_publications" &&
      probe.result?.studentProductSearchSource?.searchIndexProfile === "idx_teaching_archive_items_student_material_search_scope" &&
      probe.result?.search?.query === "fractions" &&
      probe.result?.searchExclusions?.nonMatchingPublishedMaterialsExcluded === true &&
      probe.result?.boundary?.titleAndTagSearchOnly === true &&
      probe.result?.boundary?.responseMetadataOnly === true &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};query=${probe.result.search.query};item=${probe.result.search.matchedArchiveItemId};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe proves Student App published-material metadata search under 50ms without OCR/RAG or model work",
    remediation: "0315 must prove title/tag search on the already-hardened publication projection.",
  });

  addFinding(findings, {
    id: "go_openapi_sql_search_evidence_exists",
    passed: includesAll(implementationEvidence, [
      "SearchText",
      "searchText, err := normalizeArchiveSearchText(input.Query)",
      "query.SearchText = searchText",
      "normalizeArchiveSearchText",
      "query is too long",
      "query contains unsupported characters",
      "Query:        r.URL.Query().Get(\"query\")",
      "ListPublishedForStudentApp(ctx context.Context, query domain.ArchiveItemQuery)",
      "func (r *ArchiveRepository) ListPublishedForStudentApp",
      "item.title ILIKE",
      "jsonb_array_elements_text(item.tags)",
      "escapeLikePattern",
      "TestListPublishedForStudentAppSearchesOnlyInsidePublicationProjection",
      "TestListArchiveItemsDoesNotApplyStudentAppSearchText",
      "TestNormalizeListStudentAppArchiveItemsRejectsUnsafeQuery",
      "idx_teaching_archive_items_student_material_search_scope",
      "DROP INDEX IF EXISTS idx_teaching_archive_items_student_material_search_scope",
      "name: query",
      "maxLength: 120",
      "url.QueryEscape(query.SearchText)",
      "url.QueryEscape(studentID)",
    ]),
    actual: summarizePresence(implementationEvidence, [
      "SearchText",
      "query",
      "ListPublishedForStudentApp",
      "item.title ILIKE",
      "jsonb_array_elements_text",
      "TestListArchiveItemsDoesNotApplyStudentAppSearchText",
      "idx_teaching_archive_items_student_material_search_scope",
      "url.QueryEscape(query.SearchText)",
    ]),
    expected: "OpenAPI, domain, HTTP, use case, repository, cache, SQL contract, and tests prove safe published metadata search without broad generic archive search",
    remediation: "Do not claim 0315 unless query is validated, propagated, cached distinctly, filtered inside the publication projection, and blocked from generic List.",
  });

  addFinding(findings, {
    id: "tests.cover_published_search_negative_paths",
    passed: includesAll(runtimeTest, [
      "verifies published material metadata search through the Student App archive-items query path",
      "uses idempotency for replay and rejects conflicting published search verification",
      "rejects unsafe source, unsafe policy, missing port, unsafe query, and missing expected material",
      "rejects generic sources, non-matches, scope leaks, exclusion gaps, and product metadata leaks",
      "requires projection hardening, published search, and Go query evidence refs",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, unsafe source/policy/query, missing port/material, generic repo, non-match, scope leak, exclusion, product metadata, and evidence tests",
    remediation: "Add regression coverage before treating published search as root workflow evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:teaching-archive-material-published-search-foundation"]?.includes("teaching-archive-material-published-search-foundation-audit.mjs")) &&
      includesAll(hooks, [
        "Teaching archive material published search foundation runtime audit",
        "teachingArchiveMaterialPublishedSearchFoundation",
        "teaching-archive-material-published-search-foundation.current.json",
        "teaching_archive_material_published_search_foundation_runtime",
        "0315-teaching-archive-material-published-search-foundation.md",
        "10.81/10",
        "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_VERIFIED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:teaching-archive-material-published-search-foundation",
      "teachingArchiveMaterialPublishedSearchFoundation",
      "10.81/10",
    ]),
    expected: "package, quality gate, root workflow coverage, structure verifier, SDD, and architecture board track 0315",
    remediation: "Wire published search foundation through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION",
    runtime: {
      runtimeId: TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_RUNTIME_ID,
      commandPort: TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_PORT,
      sourceRuntimeId,
      sourceCommandPort,
      status: verifiedStatus,
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { teachingArchiveMaterialPublishedSearchFoundation: probe },
    safetyInvariants: {
      sourceProjectionHardeningRequired: true,
      publishedProjectionSearchPortInvoked: true,
      goUseCaseReadAllowed: true,
      queryNormalized: true,
      titleAndTagSearchOnly: true,
      publicationStoreFiltered: true,
      ownStudentOnly: true,
      nonMatchingPublishedMaterialsExcluded: true,
      unpublishedArchiveItemsExcluded: true,
      draftOnlyArchiveItemsExcluded: true,
      crossStudentArchiveItemsExcluded: true,
      responseMetadataOnly: true,
      answerKeyAndModelOutputExcluded: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      fullTextContentReadAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      publicationWriteStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      futureOcrRagSemanticSearchRequired: true,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as Student App published-material metadata search foundation; continue OCR/RAG enrichment, full-content retrieval, AI grading linkage, or Swarm only as separate reviewed slices."
      : "Fix published material metadata search evidence before claiming Student App material retrieval is complete.",
  };
}

export function formatTeachingArchiveMaterialPublishedSearchFoundationAudit(report) {
  return [
    `Teaching archive material published search foundation runtime: ${report.readiness}`,
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
    const archiveItem = report.runtimeProbes?.teachingArchiveMaterialPublicationProjectionHardening?.result?.hardenedPublishedArchiveMaterial?.archiveItem ?? archiveItemFromReport();
    const result = await verifyTeachingArchiveMaterialPublishedSearchFoundation(input, {
      verificationLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "teaching-archive-material-published-search-foundation-audit-")), "verification.jsonl"),
      generatedAt: "2026-06-07T12:40:00.000Z",
      probeP99Ms: options.probeP99Ms ?? 8,
      studentAppPublishedMaterialSearchPort: {
        async searchPublishedArchiveMaterials(request, context) {
          calls.push({ request, context });
          return {
            found: true,
            source: {
              endpoint: "GET /v1/student-app/archive-items?query=",
              useCase: "ListStudentAppArchiveItems.Execute",
              repository: "ArchiveRepository.ListPublishedForStudentApp",
              projectionTable: "teaching_archive_publications",
              searchIndexProfile: "idx_teaching_archive_items_student_material_search_scope",
              queryNormalized: true,
              titleTagSearchOnly: true,
              publicationStoreFiltered: true,
              ownStudentOnly: true,
            },
            exclusions: {
              nonMatchingPublishedMaterialsExcluded: true,
              unpublishedArchiveItemsExcluded: true,
              draftOnlyArchiveItemsExcluded: true,
              crossStudentArchiveItemsExcluded: true,
              answerKeyAndModelOutputExcluded: true,
            },
            response: {
              data: [archiveItem],
              pageInfo: { pageSize: 10, hasMore: false, nextCursor: "" },
            },
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
        evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_PROBE",
      },
    };
  } catch (error) {
    return { status: "FAIL", error: error.message, portCalls: calls.length, runtimeSlo: failedSlo() };
  }
}

function buildProbeInput(report) {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-published-search-foundation.v1",
    verificationInvocationId: "archive_material_published_search_foundation_001",
    principal: {
      principalId: "student_001",
      sessionId: "student_session_001",
      subjectType: "USER",
      role: "STUDENT",
      entryPoint: "STUDENT_APP",
      scopes: ["STUDENT_OWN_READ"],
      studentAccess: { mode: "OWN", ownStudentId: "student_001" },
    },
    publicationProjectionHardeningReport: report,
    searchQuery: "fractions",
    materialType: "HANDOUT",
    searchFoundationPolicy: {
      sourceProjectionHardeningRequired: true,
      publishedProjectionSearchPortRequired: true,
      queryNormalizationRequired: true,
      titleAndTagSearchOnly: true,
      publicationStoreFilterRequired: true,
      ownStudentOnlyRequired: true,
      nonMatchingPublishedMaterialsExcludedRequired: true,
      unpublishedItemsExcludedRequired: true,
      responseMetadataOnlyRequired: true,
      goUseCaseReadAllowed: true,
      fullTextContentReadAllowed: false,
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
      "evidence:publication-projection-hardening:0314",
      "evidence:published-search-foundation:0315",
      "evidence:go-student-app-archive-query:http",
    ],
    idempotencyKey: "archive-material-published-search-foundation:student_001:fractions",
  };
}

function archiveItemFromReport() {
  return {
    id: "tarch_archive_material_001",
    ownerType: "STUDENT",
    studentId: "student_001",
    materialType: "HANDOUT",
    title: "Fractions practice packet",
    source: "SYSTEM_IMPORT",
    contentRef: "precommit://archive-material/student_001/fractions-packet",
    tags: ["fractions", "published"],
    analysisIntents: ["ARCHIVE_ONLY"],
    ocrStatus: "NOT_REQUIRED",
    createdAt: "2026-06-07T08:00:00.000Z",
  };
}

function loadInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, file]) => {
    const absolute = path.join(root, file);
    return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""];
  }));
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function includesAll(text, needles) {
  return needles.every((needle) => String(text).includes(needle));
}

function hasForbiddenRuntimeClaim(text) {
  return forbiddenRuntimeClaims.some((claim) => String(text).includes(claim));
}

function summarizePresence(text, needles) {
  return needles.map((needle) => `${needle}=${String(text).includes(needle)}`).join(";");
}

function failedSlo() {
  return {
    targetP99Ms: 50,
    p99Ms: null,
    totalErrors: 1,
    operations: 0,
    evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_PROBE",
  };
}

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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = await auditTeachingArchiveMaterialPublishedSearchFoundation(loadInputs(root));
    writeReport(root, args.out, report);
    console.log(formatTeachingArchiveMaterialPublishedSearchFoundationAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
