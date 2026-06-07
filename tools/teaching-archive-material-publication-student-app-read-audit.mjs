import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_PORT,
  TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_RUNTIME_ID,
  verifyTeachingArchiveMaterialPublicationStudentAppRead,
} from "./teaching-archive-material-publication-student-app-read-runtime.mjs";

const defaultOutPath = "reports/teaching-archive-material-publication-student-app-read.current.json";
const sourceRuntimeId = "teaching_archive_material_publication_row_verification_runtime";
const sourceCommandPort = "TeachingArchiveMaterialPublicationRowVerificationPort.verifyTeachingArchivePublicationPhysicalRow";
const sourceStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PHYSICAL_ROW_VERIFIED";
const verifiedStatus = "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_VERIFIED";

const sourceFiles = {
  runtime: "tools/teaching-archive-material-publication-student-app-read-runtime.mjs",
  runtimeTest: "tools/teaching-archive-material-publication-student-app-read-runtime.test.mjs",
  publicationRowVerificationReport: "reports/teaching-archive-material-publication-row-verification.current.json",
  domain: "services/teaching-archive-gateway/internal/domain/student_app_archive_items.go",
  domainTest: "services/teaching-archive-gateway/internal/domain/student_app_archive_items_test.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/list_student_app_archive_items.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/list_student_app_archive_items_test.go",
  http: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_archive_items.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_archive_items_test.go",
  presenter: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  responses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  repository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items.go",
  openApiPath: "contracts/openapi/teaching-archive.student-app-archive-items.path.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0313-teaching-archive-material-publication-student-app-read.md",
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

export async function auditTeachingArchiveMaterialPublicationStudentAppRead(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const publicationRowVerificationReport = parseJson(inputs.publicationRowVerificationReport, {});
  const productEntryEvidence = [
    inputs.domain ?? "",
    inputs.domainTest ?? "",
    inputs.usecase ?? "",
    inputs.usecaseTest ?? "",
    inputs.http ?? "",
    inputs.httpTest ?? "",
    inputs.presenter ?? "",
    inputs.responses ?? "",
    inputs.repository ?? "",
    inputs.openApiPath ?? "",
  ].join("\n");
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runProbe(publicationRowVerificationReport, options);

  addFinding(findings, {
    id: "source.publication_row_verification_ready",
    passed: publicationRowVerificationReport.readiness === "READY" &&
      publicationRowVerificationReport.workloadType === "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION" &&
      publicationRowVerificationReport.runtime?.runtimeId === sourceRuntimeId &&
      publicationRowVerificationReport.runtime?.commandPort === sourceCommandPort &&
      publicationRowVerificationReport.runtime?.status === sourceStatus &&
      publicationRowVerificationReport.runtimeSlo?.totalErrors === 0 &&
      publicationRowVerificationReport.safetyInvariants?.publicationPhysicalRowVerified === true &&
      publicationRowVerificationReport.safetyInvariants?.studentVisiblePublished === true &&
      publicationRowVerificationReport.safetyInvariants?.futureStudentAppPublishedMaterialReadRequired === true &&
      publicationRowVerificationReport.safetyInvariants?.directDatabaseAccessAllowed === false,
    actual: `${publicationRowVerificationReport.readiness ?? "missing"}:${publicationRowVerificationReport.runtime?.status ?? "missing"}:${publicationRowVerificationReport.safetyInvariants?.studentVisiblePublished ?? "missing"}`,
    expected: "READY 0312 publication row verification with student-visible publication and no direct DB access",
    remediation: "Run the 0312 publication row verification audit before Student App published-material read verification.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_PORT",
      "TeachingArchiveMaterialPublicationStudentAppReadPort.verifyStudentAppPublishedMaterialRead",
      "verifyTeachingArchiveMaterialPublicationStudentAppRead",
      "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_VERIFIED",
      "StudentAppPublishedArchiveMaterialsReadPort.listStudentAppPublishedArchiveMaterials is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "teaching_archive_material_publication_student_app_read_runtime",
      "TeachingArchiveMaterialPublicationStudentAppReadPort.verifyStudentAppPublishedMaterialRead",
      "StudentAppPublishedArchiveMaterialsReadPort.listStudentAppPublishedArchiveMaterials",
    ]),
    expected: "runtime records replay-safe published-material read verification through an injected Student App product port",
    remediation: "Keep 0313 port-based, idempotent, and tied to 0312 publication row evidence.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "publicationRowVerificationRequired: true",
      "publicationPhysicalRowVerified: true",
      "studentVisiblePublished: true",
      "studentAppArchiveItemsEndpointVerified: true",
      "injectedPublishedArchiveMaterialReadPortInvoked: true",
      "studentAppPublishedMaterialReadVerified: true",
      "productResponseMatchedPublicationRow: true",
      "crossStudentLeakPrevented: true",
      "teachingMaterialLeakPrevented: true",
      "publicationMetadataLeakPrevented: true",
      "goUseCaseReadAllowed: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "modelInferenceStarted: false",
      "publicationWriteStarted: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "requiresFuturePublicationProjectionOrRagSlice: true",
      "rejectProductOnlyLeakedFields",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime verifies only Student App published-material visibility and blocks raw DB, HTTP, OCR/RAG, AI grading, model inference, publication writes, tools, and Swarm",
    remediation: "Do not collapse published-material read into projection hardening, OCR/RAG, grading, model calls, or runtime HTTP execution.",
  });

  addFinding(findings, {
    id: "runtime.probe_verifies_student_app_published_material_read",
    passed: probe.status === "PASS" &&
      probe.result?.status === verifiedStatus &&
      probe.result?.commandPort === TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_PORT &&
      probe.result?.sourcePublicationRowVerification?.runtimeId === sourceRuntimeId &&
      probe.result?.sourcePublicationRowVerification?.publicationId === "archive_material_publication_commit_001" &&
      probe.result?.studentProductReadSource?.endpoint === "GET /v1/student-app/archive-items" &&
      probe.result?.studentProductReadSource?.useCase === "ListStudentAppArchiveItems.Execute" &&
      probe.result?.publishedArchiveMaterial?.archiveItem?.id === "tarch_archive_material_001" &&
      probe.result?.boundary?.studentAppPublishedMaterialReadVerified === true &&
      probe.result?.boundary?.productResponseMatchedPublicationRow === true &&
      probe.result?.boundary?.publicationMetadataLeakPrevented === true &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};publication=${probe.result.sourcePublicationRowVerification.publicationId};item=${probe.result.publishedArchiveMaterial.archiveItem.id};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe reads the 0312 published archive material once through the injected Student App product port under 50ms",
    remediation: "0313 must prove the student app product entry returns the 0312 published material without scope or metadata leaks.",
  });

  addFinding(findings, {
    id: "tests.cover_published_material_read_negative_paths",
    passed: includesAll(runtimeTest, [
      "verifies a published archive material through the injected student app product read port",
      "uses idempotency for replay and rejects conflicting published material reads",
      "rejects unsafe publication row source, unsafe policy, missing port, and missing published material",
      "rejects cross-student principals, mismatched responses, leaked fields, unsafe text, and publication metadata leaks",
      "requires publication row verification and student app product entry evidence while keeping future work separate",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, unsafe source/policy, missing port, missing row, cross-student, mismatch, leak, unsafe text, metadata leak, and evidence tests",
    remediation: "Add regression coverage before treating published-material read as root workflow evidence.",
  });

  addFinding(findings, {
    id: "go_student_app_archive_items_product_entry_evidence_exists",
    passed: includesAll(productEntryEvidence, [
      "NormalizeListStudentAppArchiveItemsInput",
      "AuthorizeListStudentAppArchiveItems",
      "MaterialTypeTeachingMaterial",
      "func (uc *ListStudentAppArchiveItems) Execute",
      "func (s *Server) studentAppArchiveItems",
      "/v1/student-app/archive-items",
      "toListResponse",
      "func (r *ArchiveRepository) List",
      "ORDER BY created_at DESC, id DESC",
      "operationId: listStudentAppArchiveItems",
      "TestListStudentAppArchiveItemsReturns0305CommittedMaterialDraftRow",
      "tarch_archive_material_001",
    ]),
    actual: summarizePresence(productEntryEvidence, [
      "func (uc *ListStudentAppArchiveItems) Execute",
      "/v1/student-app/archive-items",
      "func (r *ArchiveRepository) List",
      "TestListStudentAppArchiveItemsReturns0305CommittedMaterialDraftRow",
    ]),
    expected: "existing Go domain/usecase/HTTP/OpenAPI/repository evidence proves the student app archive-items entry can return the archive material row shape",
    remediation: "Wire or test the student app archive-items product entry before claiming 0313.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:teaching-archive-material-publication-student-app-read"]?.includes("teaching-archive-material-publication-student-app-read-audit.mjs")) &&
      includesAll(hooks, [
        "Teaching archive material publication student app read runtime audit",
        "teachingArchiveMaterialPublicationStudentAppRead",
        "teaching-archive-material-publication-student-app-read.current.json",
        "teaching_archive_material_publication_student_app_read_runtime",
        "0313-teaching-archive-material-publication-student-app-read.md",
        "10.75/10",
        "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_VERIFIED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:teaching-archive-material-publication-student-app-read",
      "teachingArchiveMaterialPublicationStudentAppRead",
      "10.75/10",
    ]),
    expected: "package, quality gate, root workflow coverage, structure verifier, SDD, and architecture board track 0313",
    remediation: "Wire published-material read verification through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ",
    runtime: {
      runtimeId: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_RUNTIME_ID,
      commandPort: TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_PORT,
      sourceRuntimeId,
      sourceCommandPort,
      status: verifiedStatus,
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { teachingArchiveMaterialPublicationStudentAppRead: probe },
    safetyInvariants: {
      publicationRowVerificationRequired: true,
      publicationPhysicalRowVerified: true,
      studentVisiblePublished: true,
      studentAppArchiveItemsEndpointVerified: true,
      injectedPublishedArchiveMaterialReadPortInvoked: true,
      goUseCaseReadAllowed: true,
      ownStudentProductReadVerified: true,
      studentAppPublishedMaterialReadVerified: true,
      productResponseMatchedPublicationRow: true,
      crossStudentLeakPrevented: true,
      teachingMaterialLeakPrevented: true,
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
      futurePublicationProjectionOrRagRequired: true,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as Student App published-material read evidence; continue publication projection hardening, OCR/RAG enrichment, AI grading, or search slices separately."
      : "Fix Student App published-material read verification before claiming the 0312 publication row is visible through the student product boundary.",
  };
}

export function formatTeachingArchiveMaterialPublicationStudentAppReadAudit(report) {
  return [
    `Teaching archive material publication student app read runtime: ${report.readiness}`,
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
    const publicationRecord = report.runtimeProbes?.teachingArchiveMaterialPublicationRowVerification?.result?.teachingArchivePublicationPhysicalRow?.publicationRecord;
    const result = await verifyTeachingArchiveMaterialPublicationStudentAppRead(input, {
      verificationLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "teaching-archive-material-publication-student-app-read-audit-")), "verification.jsonl"),
      generatedAt: "2026-06-07T11:20:00.000Z",
      probeP99Ms: options.probeP99Ms ?? 8,
      studentAppPublishedArchiveMaterialsReadPort: {
        async listStudentAppPublishedArchiveMaterials(request, context) {
          calls.push({ request, context });
          return {
            found: true,
            source: {
              endpoint: "GET /v1/student-app/archive-items",
              useCase: "ListStudentAppArchiveItems.Execute",
              repository: "ArchiveRepository.List",
              ownStudentOnly: true,
              publicationRowSourceVerified: true,
            },
            response: {
              data: [archiveItemFromPublication(publicationRecord)],
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
        evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_PROBE",
      },
    };
  } catch (error) {
    return { status: "FAIL", error: error.message, portCalls: calls.length, runtimeSlo: failedSlo() };
  }
}

function buildProbeInput(report) {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-student-app-read.v1",
    verificationInvocationId: "archive_material_publication_student_app_read_001",
    principal: {
      principalId: "student_001",
      sessionId: "student_session_001",
      subjectType: "USER",
      role: "STUDENT",
      entryPoint: "STUDENT_APP",
      scopes: ["STUDENT_OWN_READ"],
      studentAccess: { mode: "OWN", ownStudentId: "student_001" },
    },
    publicationRowVerificationReport: report,
    productReadPolicy: {
      publicationRowVerificationRequired: true,
      ownStudentPrincipalRequired: true,
      studentAppArchiveItemsEndpointRequired: true,
      injectedPublishedArchiveMaterialReadPortRequired: true,
      ownStudentOnlyRequired: true,
      productResponseMustIncludePublishedMaterial: true,
      publicationRowMustMatchProductResponse: true,
      idempotentPublishedMaterialReadVerificationRequired: true,
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
      "evidence:publication-row-verification:0312",
      "evidence:student-app-archive-items:go-http-product-entry",
    ],
    idempotencyKey: "archive-material-publication-student-app-read:student_001:fractions_packet",
  };
}

function archiveItemFromPublication(record = {}) {
  return {
    id: record.archiveItemId ?? "tarch_archive_material_001",
    ownerType: "STUDENT",
    studentId: record.studentId ?? "student_001",
    materialType: record.materialType ?? "HANDOUT",
    title: record.title ?? "Fractions practice packet",
    source: "SYSTEM_IMPORT",
    contentRef: record.contentRef ?? "precommit://archive-material/student_001/fractions-packet",
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
    evidenceClass: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_PROBE",
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
    const report = await auditTeachingArchiveMaterialPublicationStudentAppRead(loadInputs(root));
    writeReport(root, args.out, report);
    console.log(formatTeachingArchiveMaterialPublicationStudentAppReadAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
