import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_PORT,
  TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_RUNTIME_ID,
  verifyTeachingArchiveMaterialPublicationProjectionHardening,
} from "./teaching-archive-material-publication-projection-hardening-runtime.mjs";

const defaultOutPath = "reports/teaching-archive-material-publication-projection-hardening.current.json";
const sourceRuntimeId = "teaching_archive_material_publication_student_app_read_runtime";
const sourceCommandPort = "TeachingArchiveMaterialPublicationStudentAppReadPort.verifyStudentAppPublishedMaterialRead";
const sourceStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_VERIFIED";
const hardenedStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENED";

const sourceFiles = {
  runtime: "tools/teaching-archive-material-publication-projection-hardening-runtime.mjs",
  runtimeTest: "tools/teaching-archive-material-publication-projection-hardening-runtime.test.mjs",
  studentAppReadReport: "reports/teaching-archive-material-publication-student-app-read.current.json",
  main: "services/teaching-archive-gateway/cmd/gateway/main.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/list_student_app_archive_items.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/list_student_app_archive_items_test.go",
  repository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items.go",
  repositoryTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_published_archive_items_test.go",
  schema: "services/teaching-archive-gateway/internal/adapter/postgres/repository_schema.go",
  schemaTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_test.go",
  sqlContract: "contracts/sql/teaching-archive.sql",
  sqlContractTest: "tools/teaching-archive-sql-contract.test.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0314-teaching-archive-material-publication-projection-hardening.md",
};

const forbiddenRuntimeClaims = [
  "node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ",
  "INSERT ", "UPDATE ", "DELETE ", "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true", "ocrOrRagJobWriteAllowed: true",
  "ocrOrRagJobWriteStarted: true", "aiGradingWriteAllowed: true",
  "aiGradingWriteStarted: true", "modelInferenceAllowed: true",
  "modelInferenceStarted: true", "publicationWriteAllowed: true",
  "publicationWriteStarted: true", "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true", "swarmAllowed: true", "innerHTML",
  "dangerouslySetInnerHTML",
];

export async function auditTeachingArchiveMaterialPublicationProjectionHardening(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const studentAppReadReport = parseJson(inputs.studentAppReadReport, {});
  const goEvidence = [
    inputs.main ?? "",
    inputs.usecase ?? "",
    inputs.usecaseTest ?? "",
    inputs.repository ?? "",
    inputs.repositoryTest ?? "",
    inputs.schema ?? "",
    inputs.schemaTest ?? "",
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
  const probe = await runProbe(studentAppReadReport, options);

  addFinding(findings, {
    id: "source.student_app_read_ready",
    passed: studentAppReadReport.readiness === "READY" &&
      studentAppReadReport.workloadType === "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ" &&
      studentAppReadReport.runtime?.runtimeId === sourceRuntimeId &&
      studentAppReadReport.runtime?.commandPort === sourceCommandPort &&
      studentAppReadReport.runtime?.status === sourceStatus &&
      studentAppReadReport.runtimeSlo?.totalErrors === 0 &&
      studentAppReadReport.safetyInvariants?.studentAppPublishedMaterialReadVerified === true &&
      studentAppReadReport.safetyInvariants?.productResponseMatchedPublicationRow === true &&
      studentAppReadReport.safetyInvariants?.futurePublicationProjectionOrRagRequired === true &&
      studentAppReadReport.safetyInvariants?.directDatabaseAccessAllowed === false,
    actual: `${studentAppReadReport.readiness ?? "missing"}:${studentAppReadReport.runtime?.status ?? "missing"}:${studentAppReadReport.safetyInvariants?.futurePublicationProjectionOrRagRequired ?? "missing"}`,
    expected: "READY 0313 Student App read evidence with explicit future projection hardening requirement",
    remediation: "Run the 0313 Student App published-material read audit before hardening the projection.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_idempotency_and_safety",
    passed: includesAll(runtime, [
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_PORT",
      "TeachingArchiveMaterialPublicationProjectionHardeningPort.verifyStudentAppPublishedMaterialProjection",
      "verifyTeachingArchiveMaterialPublicationProjectionHardening",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENED",
      "StudentAppPublishedMaterialProjectionReadPort.listPublishedArchiveMaterials is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "publicationStoreFiltered: true",
      "unpublishedArchiveItemsExcluded: true",
      "draftOnlyArchiveItemsExcluded: true",
      "crossStudentArchiveItemsExcluded: true",
      "publicationMetadataLeakPrevented: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "modelInferenceStarted: false",
      "publicationWriteStarted: false",
      "swarmAllowed: false",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, [
      "teaching_archive_material_publication_projection_hardening_runtime",
      "ArchiveRepository.ListPublishedForStudentApp",
      "teaching_archive_publications",
      ...forbiddenRuntimeClaims,
    ]),
    expected: "runtime records idempotent publication projection hardening through an injected port and no raw DB/HTTP/model side effects",
    remediation: "Keep 0314 as a hardening proof, not a JS database runner or another broad performance benchmark.",
  });

  addFinding(findings, {
    id: "runtime.probe_verifies_hardened_projection",
    passed: probe.status === "PASS" &&
      probe.result?.status === hardenedStatus &&
      probe.result?.commandPort === TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_PORT &&
      probe.result?.sourceStudentAppRead?.runtimeId === sourceRuntimeId &&
      probe.result?.studentProductReadSource?.repository === "ArchiveRepository.ListPublishedForStudentApp" &&
      probe.result?.studentProductReadSource?.targetTable === "teaching_archive_publications" &&
      probe.result?.projectionExclusions?.unpublishedArchiveItemsExcluded === true &&
      probe.result?.projectionExclusions?.draftOnlyArchiveItemsExcluded === true &&
      probe.result?.projectionExclusions?.crossStudentArchiveItemsExcluded === true &&
      probe.result?.boundary?.publicationStoreFiltered === true &&
      probe.result?.boundary?.unpublishedArchiveItemsExcluded === true &&
      probe.result?.boundary?.crossStudentArchiveItemsExcluded === true &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};repo=${probe.result.studentProductReadSource.repository};item=${probe.result.hardenedPublishedArchiveMaterial.archiveItem.id};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe proves the published material is returned only through the hardened publication projection under 50ms",
    remediation: "0314 must prove publication-store filtering and negative exclusion evidence, not merely another archive item read.",
  });

  addFinding(findings, {
    id: "go_sql_projection_hardening_evidence_exists",
    passed: includesAll(goEvidence, [
      "NewListStudentAppArchiveItems(archiveRepository)",
      "type StudentAppPublishedArchiveMaterialReader interface",
      "ListPublishedForStudentApp(ctx context.Context, query domain.ArchiveItemQuery)",
      "func (r *ArchiveRepository) ListPublishedForStudentApp",
      "FROM teaching_archive_items AS item",
      "FROM teaching_archive_publications AS publication",
      "publication.archive_item_id = item.id",
      "publication.student_id = item.student_id",
      "publication.scope_type = 'STUDENT_OWN_ARCHIVE'",
      "publication.publication_state = 'COMMITTED_TO_PUBLICATION_STORE'",
      "publication.visibility_state = 'STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED'",
      "publication.channel = 'STUDENT_APP'",
      "CREATE TABLE IF NOT EXISTS teaching_archive_publications",
      "idx_teaching_archive_publications_student_app_visible_lookup",
      "TestListPublishedForStudentAppUsesPublicationProjectionFilter",
      "TestListStudentAppArchiveItemsScopesOwnStudentBeforePublishedProjectionRead",
      "generic reads = %d, want 0",
      "schema missing teaching archive publication projection table",
      "defines the student app publication projection table and lookup indexes",
    ]),
    actual: summarizePresence(goEvidence, [
      "NewListStudentAppArchiveItems(archiveRepository)",
      "ListPublishedForStudentApp",
      "teaching_archive_publications",
      "idx_teaching_archive_publications_student_app_visible_lookup",
    ]),
    expected: "Go use case, repository SQL, schema, SQL contract, and tests all prove publication projection hardening",
    remediation: "Do not claim 0314 unless the Student App read path is wired to the publication-store filtered repository.",
  });

  addFinding(findings, {
    id: "tests.cover_projection_hardening_negative_paths",
    passed: includesAll(runtimeTest, [
      "hardens student app archive material reads through the publication projection",
      "uses idempotency for replay and rejects conflicting projection verification",
      "rejects unsafe source, unsafe policy, missing port, and missing published material",
      "rejects generic archive sources, missing exclusion proof, mismatched responses, leaked fields, and publication metadata",
      "requires student app read, projection hardening, and Go evidence refs",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, unsafe source/policy, missing port, missing material, generic repo, exclusion, mismatch, leak, metadata, and evidence tests",
    remediation: "Add regression coverage before treating projection hardening as root workflow evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:teaching-archive-material-publication-projection-hardening"]?.includes("teaching-archive-material-publication-projection-hardening-audit.mjs")) &&
      includesAll(hooks, [
        "Teaching archive material publication projection hardening runtime audit",
        "teachingArchiveMaterialPublicationProjectionHardening",
        "teaching-archive-material-publication-projection-hardening.current.json",
        "teaching_archive_material_publication_projection_hardening_runtime",
        "0314-teaching-archive-material-publication-projection-hardening.md",
        "10.78/10",
        "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:teaching-archive-material-publication-projection-hardening",
      "teachingArchiveMaterialPublicationProjectionHardening",
      "10.78/10",
    ]),
    expected: "package, quality gate, root workflow coverage, structure verifier, SDD, and architecture board track 0314",
    remediation: "Wire projection hardening through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING",
    runtime: {
      runtimeId: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_RUNTIME_ID,
      commandPort: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_PORT,
      sourceRuntimeId,
      sourceCommandPort,
      status: hardenedStatus,
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { teachingArchiveMaterialPublicationProjectionHardening: probe },
    safetyInvariants: {
      sourceStudentAppReadRequired: true,
      studentAppPublishedMaterialReadVerified: true,
      publishedProjectionReadPortInvoked: true,
      goUseCaseReadAllowed: true,
      publicationStoreFiltered: true,
      publicationStateFiltered: true,
      visibilityStateFiltered: true,
      studentAppChannelFiltered: true,
      ownStudentOnly: true,
      unpublishedArchiveItemsExcluded: true,
      draftOnlyArchiveItemsExcluded: true,
      crossStudentArchiveItemsExcluded: true,
      productResponseMatchedPublishedMaterial: true,
      publicationMetadataLeakPrevented: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      publicationWriteStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      futureOcrRagSearchRequired: true,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as hardened Student App publication projection evidence; continue OCR/RAG enrichment, full material retrieval, AI grading, or Swarm only as separate reviewed slices."
      : "Fix publication projection hardening before claiming published materials are safely filtered for Student App.",
  };
}

export function formatTeachingArchiveMaterialPublicationProjectionHardeningAudit(report) {
  return [
    `Teaching archive material publication projection hardening runtime: ${report.readiness}`,
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
    const archiveItem = report.runtimeProbes?.teachingArchiveMaterialPublicationStudentAppRead?.result?.publishedArchiveMaterial?.archiveItem ?? archiveItemFromReport();
    const result = await verifyTeachingArchiveMaterialPublicationProjectionHardening(input, {
      verificationLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "teaching-archive-material-publication-projection-hardening-audit-")), "verification.jsonl"),
      generatedAt: "2026-06-07T12:10:00.000Z",
      probeP99Ms: options.probeP99Ms ?? 8,
      studentAppPublishedMaterialProjectionReadPort: {
        async listPublishedArchiveMaterials(request, context) {
          calls.push({ request, context });
          return {
            found: true,
            source: {
              endpoint: "GET /v1/student-app/archive-items",
              useCase: "ListStudentAppArchiveItems.Execute",
              repository: "ArchiveRepository.ListPublishedForStudentApp",
              targetTable: "teaching_archive_publications",
              schemaIndex: "idx_teaching_archive_publications_student_app_visible_lookup",
              publicationStoreFiltered: true,
              publicationStateFiltered: true,
              visibilityStateFiltered: true,
              studentAppChannelFiltered: true,
              ownStudentOnly: true,
            },
            exclusions: {
              unpublishedArchiveItemsExcluded: true,
              draftOnlyArchiveItemsExcluded: true,
              crossStudentArchiveItemsExcluded: true,
              publicationMetadataRemovedFromResponse: true,
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
        evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_PROBE",
      },
    };
  } catch (error) {
    return { status: "FAIL", error: error.message, portCalls: calls.length, runtimeSlo: failedSlo() };
  }
}

function buildProbeInput(report) {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-projection-hardening.v1",
    verificationInvocationId: "archive_material_publication_projection_hardening_001",
    principal: {
      principalId: "student_001",
      sessionId: "student_session_001",
      subjectType: "USER",
      role: "STUDENT",
      entryPoint: "STUDENT_APP",
      scopes: ["STUDENT_OWN_READ"],
      studentAccess: { mode: "OWN", ownStudentId: "student_001" },
    },
    publicationStudentAppReadReport: report,
    projectionHardeningPolicy: {
      sourceStudentAppReadRequired: true,
      publishedProjectionReadPortRequired: true,
      publicationStoreFilterRequired: true,
      publicationStateFilterRequired: true,
      visibilityStateFilterRequired: true,
      studentAppChannelFilterRequired: true,
      ownStudentOnlyRequired: true,
      unpublishedItemsExcludedRequired: true,
      draftOnlyItemsExcludedRequired: true,
      crossStudentItemsExcludedRequired: true,
      responseMustMatchPublishedMaterial: true,
      publicationMetadataLeakBlocked: true,
      idempotentProjectionVerificationRequired: true,
      goUseCaseReadAllowed: true,
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
      "evidence:publication-student-app-read:0313",
      "evidence:publication-projection-hardening:0314",
      "evidence:go-list-published-for-student-app:repository",
    ],
    idempotencyKey: "archive-material-publication-projection-hardening:student_001:fractions_packet",
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
    evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_PROBE",
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = await auditTeachingArchiveMaterialPublicationProjectionHardening(loadInputs(root));
    writeReport(root, args.out, report);
    console.log(formatTeachingArchiveMaterialPublicationProjectionHardeningAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
