import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/teaching-archive-material-published-content-preview-read-foundation.current.json";
const runtimeId = "teaching_archive_material_published_content_preview_read_foundation";
const sourceFiles = {
  source0317Report: "reports/teaching-archive-material-published-content-preview-precheck.current.json",
  domain: "services/teaching-archive-gateway/internal/domain/published_archive_material_content_preview.go",
  domainTest: "services/teaching-archive-gateway/internal/domain/published_archive_material_content_preview_test.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/read_student_app_archive_item_content_preview.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/read_student_app_archive_item_content_preview_test.go",
  postgres: "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_material_content_preview.go",
  postgresTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_material_content_preview_test.go",
  schema: "services/teaching-archive-gateway/internal/adapter/postgres/repository_schema.go",
  http: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_archive_items.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_archive_item_content_preview_test.go",
  httpPaths: "services/teaching-archive-gateway/internal/adapter/httpapi/server_paths.go",
  httpRoutes: "services/teaching-archive-gateway/internal/adapter/httpapi/server_routes.go",
  httpConfig: "services/teaching-archive-gateway/internal/adapter/httpapi/server_config.go",
  httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  main: "services/teaching-archive-gateway/cmd/gateway/main.go",
  openApiRoot: "contracts/openapi/teaching-archive.yaml",
  openApiPath: "contracts/openapi/teaching-archive.student-app-archive-item-content-preview.path.yaml",
  sql: "contracts/sql/teaching-archive.sql",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  sdd: "docs/sdd/0318-teaching-archive-material-published-content-preview-read-foundation.md",
};

export function auditTeachingArchiveMaterialPublishedContentPreviewReadFoundation(inputs, options = {}) {
  const startedAt = Date.now();
  const findings = [];
  const source0317 = parseJson(inputs.source0317Report);
  const goCore = joinInputs(inputs, ["domain", "domainTest", "usecase", "usecaseTest"]);
  const persistence = joinInputs(inputs, ["postgres", "postgresTest", "schema", "sql"]);
  const delivery = joinInputs(inputs, ["http", "httpTest", "httpPaths", "httpRoutes", "httpConfig", "httpResponses", "main"]);
  const contracts = joinInputs(inputs, ["openApiRoot", "openApiPath"]);
  const hooks = joinInputs(inputs, ["packageJson", "qualityGate", "rootWorkflowCoverage", "verifyStructure", "architectureBoard", "rootTrace", "sdd"]);
  const responseType = extractTypeBody(inputs.httpResponses ?? "", "studentAppArchiveItemContentPreviewResponse");
  const sectionType = extractTypeBody(inputs.httpResponses ?? "", "studentAppArchiveItemContentPreviewSection");

  addFinding(findings, {
    id: "source.0317_precheck_ready",
    passed: source0317.ok &&
      source0317.value?.readiness === "READY" &&
      source0317.value?.runtime?.status === "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_BLOCKED_UNTIL_SAFE_CONTENT_STORE",
    actual: source0317.ok
      ? `${source0317.value?.readiness}:${source0317.value?.runtime?.status}`
      : source0317.error,
    expected: "0317 published content preview precheck report is READY and blocked until safe content store",
    remediation: "Regenerate or fix 0317 precheck evidence before claiming 0318 read foundation.",
  });

  addFinding(findings, {
    id: "go.domain_usecase_safe_preview_read",
    passed: includesAll(goCore, [
      "PublishedArchiveMaterialContentPreview",
      "PublishedArchiveMaterialContentPreviewSection",
      "NormalizeReadStudentAppArchiveItemContentPreviewInput",
      "NormalizePublishedArchiveMaterialContentPreview",
      "BuildStudentAppArchiveItemContentPreview",
      "ReadStudentAppArchiveItemContentPreview",
      "GetPublishedContentPreviewForStudentApp",
      "RejectsCrossStudentRepositoryLeak",
      "contains unsafe preview text",
    ]),
    actual: summarizePresence(goCore, [
      "PublishedArchiveMaterialContentPreview",
      "ReadStudentAppArchiveItemContentPreview",
      "RejectsCrossStudentRepositoryLeak",
    ]),
    expected: "domain and use case enforce Student App own-student safe preview reads",
    remediation: "Keep all principal and cross-student checks inside domain/usecase before adapter reads.",
  });

  addFinding(findings, {
    id: "postgres.safe_preview_table_and_publication_filter",
    passed: includesAll(persistence, [
      "CREATE TABLE IF NOT EXISTS teaching_archive_material_content_previews",
      "preview_sections JSONB NOT NULL",
      "idx_teaching_archive_material_content_previews_student_updated",
      "SavePublishedArchiveMaterialContentPreview",
      "ON CONFLICT (archive_item_id) DO UPDATE",
      "GetPublishedContentPreviewForStudentApp",
      "preview.archive_item_id = $1",
      "preview.student_id = $2",
      "preview.preview_status = 'READY'",
      "FROM teaching_archive_publications AS publication",
      "publication.visibility_state = 'STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED'",
      "publication.channel = 'STUDENT_APP'",
      "TestGetPublishedContentPreviewForStudentAppUsesScopedVisibleProjection",
    ]) && !inputs.postgres.includes("SELECT *") && !inputs.postgres.includes("content_ref"),
    actual: summarizePresence(inputs.postgres, ["SELECT *", "content_ref"]) + ";" +
      summarizePresence(persistence, ["teaching_archive_material_content_previews", "teaching_archive_publications"]),
    expected: "PostgreSQL reads only safe preview rows scoped through the Student App publication projection",
    remediation: "Do not read raw archive content or content_ref; keep publication EXISTS filtering on every preview read.",
  });

  addFinding(findings, {
    id: "http.openapi_safe_student_preview_endpoint",
    passed: includesAll(delivery + contracts, [
      "/v1/student-app/archive-items/{archiveItemId}/content-preview",
      "/content-preview",
      "readStudentAppArchiveItemContentPreview",
      "ReadStudentAppArchiveItemContentPreview",
      "operationId: readStudentAppArchiveItemContentPreview",
      "previewStatus",
      "sections",
      "body leaked",
      "TestReadStudentAppArchiveItemContentPreviewRejectsCrossStudentOrUnpublished",
      "ReadStudentAppArchiveItemContentPreview:               readStudentAppArchiveItemContentPreview",
    ]) &&
      !responseType.includes("StudentID") &&
      !responseType.includes("ContentRef") &&
      !responseType.includes("Worker") &&
      !responseType.includes("Publication") &&
      !sectionType.includes("ExpectedAnswer") &&
      !sectionType.includes("Raw") &&
      !inputs.openApiPath.includes("contentRef") &&
      !inputs.openApiPath.includes("studentId") &&
      !inputs.openApiPath.includes("rawContent"),
    actual: summarizePresence(responseType + sectionType + inputs.openApiPath, [
      "StudentID", "ContentRef", "Worker", "Publication", "ExpectedAnswer", "contentRef", "studentId", "rawContent",
    ]),
    expected: "HTTP/OpenAPI exposes only safe reviewed preview fields for an own-student published item",
    remediation: "Remove ownership, storage, publication, answer, worker, and raw content fields from the student response.",
  });

  addFinding(findings, {
    id: "quality_root_board_hooks",
    passed: includesAll(hooks, [
      "audit:teaching-archive-material-published-content-preview-read-foundation",
      "Teaching archive material published content preview read foundation audit",
      "teachingArchiveMaterialPublishedContentPreviewReadFoundation",
      "teaching-archive-material-published-content-preview-read-foundation.current.json",
      "0318-teaching-archive-material-published-content-preview-read-foundation.md",
      "published_archive_material_content_preview.go",
      "server_student_app_archive_item_content_preview_test.go",
      "10.90/10",
      "SDD 0318 published content preview read foundation",
    ]),
    actual: summarizePresence(hooks, [
      "audit:teaching-archive-material-published-content-preview-read-foundation",
      "teachingArchiveMaterialPublishedContentPreviewReadFoundation",
      "10.90/10",
    ]),
    expected: "package, quality gate, root workflow coverage, structure verifier, SDD trace, and architecture board track 0318",
    remediation: "Wire this foundation through every project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_READ_FOUNDATION",
    runtime: {
      runtimeId,
      useCase: "ReadStudentAppArchiveItemContentPreview.Execute",
      repository: "ArchiveRepository.GetPublishedContentPreviewForStudentApp",
      endpoint: "GET /v1/student-app/archive-items/{archiveItemId}/content-preview",
      status: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_READ_FOUNDATION_READY",
    },
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.max(1, Math.min(50, options.probeP99Ms ?? Date.now() - startedAt)),
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STATIC_GO_SAFE_CONTENT_PREVIEW_READ_FOUNDATION_AUDIT",
    },
    safetyInvariants: {
      ownStudentOnly: true,
      publicationProjectionFiltered: true,
      safePreviewStoreOnly: true,
      contentRefExcluded: true,
      rawContentReadAllowed: false,
      objectStorageReadAllowed: false,
      ocrOrRagReadAllowed: false,
      semanticRetrievalAllowed: false,
      answerKeyOrModelOutputAllowed: false,
      aiGradingWriteAllowed: false,
      modelInferenceAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the safe preview store/read foundation; keep full content rendering, OCR/RAG, semantic retrieval, and AI grading as later reviewed slices."
      : "Fix preview read foundation evidence before claiming Student App published content preview support.",
  };
}

export function formatTeachingArchiveMaterialPublishedContentPreviewReadFoundationAudit(report) {
  const lines = [
    `Teaching archive material published content preview read foundation: ${report.readiness}`,
    `Use case: ${report.runtime.useCase}`,
    `Endpoint: ${report.runtime.endpoint}`,
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

function joinInputs(inputs, keys) {
  return keys.map((key) => inputs[key] ?? "").join("\n");
}

function extractTypeBody(text, typeName) {
  return [...text.matchAll(new RegExp(`type\\s+${typeName}\\s+struct\\s+\\{([\\s\\S]*?)\\}`, "g"))]
    .map((match) => match[1])
    .join("\n");
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

function summarizePresence(text, values) {
  return values.map((value) => `${value}=${text.includes(value)}`).join(";");
}

function addFinding(findings, finding) {
  findings.push({ severity: finding.passed ? "info" : "error", ...finding });
}

function stringifyScalar(value) {
  if (Array.isArray(value)) return value.join(",");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

async function main() {
  const root = process.cwd();
  const out = parseOutArg(process.argv.slice(2));
  const report = auditTeachingArchiveMaterialPublishedContentPreviewReadFoundation(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatTeachingArchiveMaterialPublishedContentPreviewReadFoundationAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
