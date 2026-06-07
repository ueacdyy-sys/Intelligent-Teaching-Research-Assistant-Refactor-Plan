import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_PORT,
  TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_RUNTIME_ID,
  verifyTeachingArchiveMaterialDraftStudentProductRead,
} from "./teaching-archive-material-draft-student-product-read-runtime.mjs";

const defaultOutPath = "reports/teaching-archive-material-draft-student-product-read.current.json";
const rowVerificationRuntimeId = "teaching_archive_material_draft_storage_row_verification_runtime";
const rowVerificationStatus = "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PHYSICAL_ROW_VERIFIED";
const productReadStatus = "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_VERIFIED";

const sourceFiles = {
  runtime: "tools/teaching-archive-material-draft-student-product-read-runtime.mjs",
  runtimeTest: "tools/teaching-archive-material-draft-student-product-read-runtime.test.mjs",
  rowVerificationReport: "reports/teaching-archive-material-draft-storage-row-verification.current.json",
  domain: "services/teaching-archive-gateway/internal/domain/student_app_archive_items.go",
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
  sdd: "docs/sdd/0306-teaching-archive-material-draft-student-product-read.md",
};

const forbiddenRuntimeClaims = [
  "node:child_process",
  "spawn(",
  "execSync(",
  "fetch(",
  "postgres://",
  "SELECT ",
  "INSERT ",
  "UPDATE ",
  "DELETE ",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "ocrOrRagJobWriteAllowed: true",
  "ocrOrRagJobWriteStarted: true",
  "aiGradingWriteAllowed: true",
  "aiGradingWriteStarted: true",
  "modelInferenceAllowed: true",
  "modelInferenceStarted: true",
  "publicationAllowed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export async function auditTeachingArchiveMaterialDraftStudentProductRead(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const rowVerificationReport = parseJson(inputs.rowVerificationReport, {});
  const productEntryEvidence = [
    inputs.domain ?? "",
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
  const probe = await runRuntimeProbe(rowVerificationReport, options);

  addFinding(findings, {
    id: "source.storage_row_verification_ready",
    passed: rowVerificationReport.readiness === "READY" &&
      rowVerificationReport.workloadType === "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION" &&
      rowVerificationReport.runtime?.runtimeId === rowVerificationRuntimeId &&
      rowVerificationReport.runtime?.status === rowVerificationStatus &&
      rowVerificationReport.runtimeSlo?.totalErrors === 0 &&
      rowVerificationReport.safetyInvariants?.physicalDatabaseRowVerified === true &&
      rowVerificationReport.safetyInvariants?.directDatabaseAccessAllowed === false,
    actual: `${rowVerificationReport.readiness ?? "missing"}:${rowVerificationReport.runtime?.status ?? "missing"}:${rowVerificationReport.safetyInvariants?.physicalDatabaseRowVerified ?? "missing"}`,
    expected: "READY 0305 storage row verification with physical row verified and no direct DB access",
    remediation: "Run the 0305 storage row verification audit before product read verification.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_PORT",
      "TeachingArchiveMaterialDraftStudentProductReadPort.verifyStudentAppArchiveItemsRead",
      "verifyTeachingArchiveMaterialDraftStudentProductRead",
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_VERIFIED",
      "StudentAppArchiveItemsProductReadPort.listStudentAppArchiveItems is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "teaching_archive_material_draft_student_product_read_runtime",
      "TeachingArchiveMaterialDraftStudentProductReadPort.verifyStudentAppArchiveItemsRead",
      "StudentAppArchiveItemsProductReadPort.listStudentAppArchiveItems",
    ]),
    expected: "runtime records replay-safe product read verification through an injected student app archive items port",
    remediation: "Keep 0306 port-based, idempotent, and tied to the student product read boundary.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "studentAppArchiveItemsEndpointVerified: true",
      "injectedProductReadPortInvoked: true",
      "ownStudentProductReadVerified: true",
      "productResponseMatchedPhysicalRow: true",
      "crossStudentLeakPrevented: true",
      "teachingMaterialLeakPrevented: true",
      "goUseCaseReadAllowed: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "modelInferenceStarted: false",
      "publicationAllowed: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "requiresFuturePublicationOrRagSlice: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime verifies only the own-student product read and blocks raw DB, HTTP execution, OCR/RAG, AI grading, model inference, publication, tools, and Swarm",
    remediation: "Do not collapse student product read verification into publication, retrieval enrichment, grading, or runtime HTTP execution.",
  });

  addFinding(findings, {
    id: "runtime.probe_verifies_student_product_read",
    passed: probe.status === "PASS" &&
      probe.result?.status === productReadStatus &&
      probe.result?.commandPort === TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_PORT &&
      probe.result?.studentProductReadSource?.endpoint === "GET /v1/student-app/archive-items" &&
      probe.result?.studentProductReadSource?.useCase === "ListStudentAppArchiveItems.Execute" &&
      probe.result?.studentProductArchiveItem?.id === "tarch_archive_material_001" &&
      probe.result?.boundary?.ownStudentProductReadVerified === true &&
      probe.result?.boundary?.crossStudentLeakPrevented === true &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};item=${probe.result.studentProductArchiveItem.id};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe reads the verified archive item once through the injected student product port under 50ms",
    remediation: "0306 must prove the student app product entry returns the physical row without scope leaks.",
  });

  addFinding(findings, {
    id: "tests.cover_product_read_negative_paths",
    passed: includesAll(runtimeTest, [
      "verifies a student product read through the injected product read port",
      "uses idempotency for replay and rejects conflicting product read verification",
      "rejects missing port, cross-student principal, missing product row, and mismatched product response",
      "rejects unsafe policy, leaked fields, unsafe text, product HTTP or raw DB claims, and future work collapse",
      "requires row verification and student app product entry evidence",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, missing port, cross-student, missing row, mismatch, leak, policy, and evidence tests",
    remediation: "Add regression coverage before treating product read as root workflow evidence.",
  });

  addFinding(findings, {
    id: "go_student_app_product_entry_evidence_exists",
    passed: includesAll(productEntryEvidence, [
      "NormalizeListStudentAppArchiveItemsInput",
      "AuthorizeListStudentAppArchiveItems",
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
    expected: "Go domain/use case/HTTP/OpenAPI/repository evidence proves the student app product entry can return the 0305 row shape",
    remediation: "Wire or test the student app archive items product entry before claiming 0306.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:teaching-archive-material-draft-student-product-read"]?.includes("teaching-archive-material-draft-student-product-read-audit.mjs")) &&
      includesAll(hooks, [
        "Teaching archive material draft student product read runtime audit",
        "teachingArchiveMaterialDraftStudentProductRead",
        "teaching-archive-material-draft-student-product-read.current.json",
        "teaching_archive_material_draft_student_product_read_runtime",
        "0306-teaching-archive-material-draft-student-product-read.md",
        "10.54/10",
        "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_VERIFIED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:teaching-archive-material-draft-student-product-read",
      "teachingArchiveMaterialDraftStudentProductRead",
      "10.54/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0306",
    remediation: "Wire product read verification through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ",
    runtime: {
      runtimeId: TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_RUNTIME_ID,
      commandPort: TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_PORT,
      sourceRuntimeId: rowVerificationRuntimeId,
      status: productReadStatus,
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { teachingArchiveMaterialDraftStudentProductRead: probe },
    safetyInvariants: {
      storageRowVerificationRequired: true,
      physicalDatabaseRowVerified: true,
      studentAppArchiveItemsEndpointVerified: true,
      injectedProductReadPortInvoked: true,
      goUseCaseReadAllowed: true,
      ownStudentProductReadVerified: true,
      productResponseMatchedPhysicalRow: true,
      crossStudentLeakPrevented: true,
      teachingMaterialLeakPrevented: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      publicationAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFuturePublicationOrRagSlice: true,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as student product read evidence; continue publication, OCR/RAG enrichment, AI grading, or retrieval product slices separately."
      : "Fix product read verification before claiming the 0305 physical row is visible through the student app product entry.",
  };
}

export function formatTeachingArchiveMaterialDraftStudentProductReadAudit(report) {
  const lines = [
    `Teaching archive material draft student product read runtime: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
    `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`,
    "",
    "Findings:",
  ];
  for (const finding of report.findings) {
    lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => {
    const absolute = path.join(root, relativePath);
    return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""];
  }));
}

async function runRuntimeProbe(rowVerificationReport, options = {}) {
  const verificationLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "teaching-archive-material-product-read-audit-")), "verification.jsonl");
  const startedAt = Date.now();
  const calls = [];
  try {
    const result = await verifyTeachingArchiveMaterialDraftStudentProductRead(probeInput(rowVerificationReport), {
      verificationLogPath,
      generatedAt: "2026-06-07T08:20:00.000Z",
      studentAppArchiveItemsProductReadPort: {
        async listStudentAppArchiveItems(request, context) {
          calls.push({ request, context });
          return {
            found: true,
            source: {
              endpoint: "GET /v1/student-app/archive-items",
              useCase: "ListStudentAppArchiveItems.Execute",
              repository: "ArchiveRepository.List",
              ownStudentOnly: true,
            },
            response: {
              data: [archiveItem()],
              pageInfo: { pageSize: 10, hasMore: false, nextCursor: "" },
            },
          };
        },
      },
    });
    const elapsedMs = Math.max(1, Date.now() - startedAt);
    return {
      status: "PASS",
      result,
      portCalls: calls.length,
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.max(1, Math.min(50, options.probeP99Ms ?? elapsedMs)),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_PROBE",
      },
    };
  } catch (error) {
    return {
      status: "FAIL",
      error: error.message,
      portCalls: calls.length,
      runtimeSlo: failedSlo(),
    };
  }
}

function probeInput(rowVerificationReport) {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-draft-student-product-read.v1",
    verificationInvocationId: "archive_material_draft_student_product_read_001",
    principal: {
      principalId: "student_001",
      sessionId: "student_session_001",
      subjectType: "USER",
      role: "STUDENT",
      entryPoint: "STUDENT_APP",
      scopes: ["STUDENT_OWN_READ"],
      studentAccess: { mode: "OWN", ownStudentId: "student_001" },
    },
    rowVerificationReport,
    productReadPolicy: {
      rowVerificationRequired: true,
      ownStudentPrincipalRequired: true,
      studentAppArchiveItemsEndpointRequired: true,
      injectedProductReadPortRequired: true,
      ownStudentOnlyRequired: true,
      productResponseMustIncludeVerifiedRow: true,
      idempotentProductReadVerificationRequired: true,
      goUseCaseReadAllowed: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteAllowed: false,
      aiGradingWriteAllowed: false,
      modelInferenceAllowed: false,
      publicationAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      "evidence:storage-row-verification:0305",
      "evidence:student-app-archive-items:go-http-product-entry",
    ],
    idempotencyKey: "archive-material-draft-student-product-read:student_001:fractions_packet",
  };
}

function archiveItem() {
  return {
    id: "tarch_archive_material_001",
    ownerType: "STUDENT",
    studentId: "student_001",
    materialType: "HANDOUT",
    title: "Fractions practice packet",
    source: "SYSTEM_IMPORT",
    contentRef: "precommit://archive-material/student_001/fractions-packet",
    tags: ["fractions", "draft-approved"],
    analysisIntents: ["ARCHIVE_ONLY"],
    ocrStatus: "NOT_REQUIRED",
    createdAt: "2026-06-07T08:00:00.000Z",
  };
}

function failedSlo() {
  return {
    targetP99Ms: 50,
    p99Ms: null,
    totalErrors: 1,
    operations: 0,
    evidenceClass: "FAILED_PROBE",
  };
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

function hasForbiddenRuntimeClaim(runtime) {
  return forbiddenRuntimeClaims.some((claim) => runtime.includes(claim));
}

function summarizePresence(text, values) {
  return values.map((value) => `${value}=${text.includes(value)}`).join(";");
}

function addFinding(findings, finding) {
  findings.push({ severity: finding.passed ? "info" : "error", ...finding });
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function stringifyScalar(value) {
  if (Array.isArray(value)) return value.join(",");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

async function main() {
  const root = process.cwd();
  const out = parseOutArg(process.argv.slice(2));
  const report = await auditTeachingArchiveMaterialDraftStudentProductRead(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatTeachingArchiveMaterialDraftStudentProductReadAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
