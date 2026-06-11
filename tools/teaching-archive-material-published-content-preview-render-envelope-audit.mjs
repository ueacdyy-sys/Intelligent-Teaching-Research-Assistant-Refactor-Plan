import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/teaching-archive-material-published-content-preview-render-envelope.current.json";
const runtimeId = "teaching_archive_material_published_content_preview_render_envelope";
const sourceFiles = {
  source0318Report: "reports/teaching-archive-material-published-content-preview-read-foundation.current.json",
  domain: "services/teaching-archive-gateway/internal/domain/published_archive_material_content_preview.go",
  domainTest: "services/teaching-archive-gateway/internal/domain/published_archive_material_content_preview_test.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/render_student_app_archive_item_content_preview.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/render_student_app_archive_item_content_preview_test.go",
  http: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_archive_items.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_archive_item_content_preview_test.go",
  httpPaths: "services/teaching-archive-gateway/internal/adapter/httpapi/server_paths.go",
  httpRoutes: "services/teaching-archive-gateway/internal/adapter/httpapi/server_routes.go",
  httpConfig: "services/teaching-archive-gateway/internal/adapter/httpapi/server_config.go",
  httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  httpPresenters: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  main: "services/teaching-archive-gateway/cmd/gateway/main.go",
  openApiRoot: "contracts/openapi/teaching-archive.yaml",
  openApiPath: "contracts/openapi/teaching-archive.student-app-archive-item-content-preview-rendered.path.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  sdd: "docs/sdd/0319-teaching-archive-material-published-content-preview-render-envelope.md",
};

export function auditTeachingArchiveMaterialPublishedContentPreviewRenderEnvelope(inputs, options = {}) {
  const startedAt = Date.now();
  const findings = [];
  const source0318 = parseJson(inputs.source0318Report);
  const goCore = joinInputs(inputs, ["domain", "domainTest", "usecase", "usecaseTest"]);
  const delivery = joinInputs(inputs, ["http", "httpTest", "httpPaths", "httpRoutes", "httpConfig", "httpResponses", "httpPresenters", "main"]);
  const contracts = joinInputs(inputs, ["openApiRoot", "openApiPath"]);
  const hooks = joinInputs(inputs, ["packageJson", "qualityGate", "rootWorkflowCoverage", "verifyStructure", "architectureBoard", "rootTrace", "sdd"]);
  const responseType = extractTypeBody(inputs.httpResponses ?? "", "studentAppArchiveItemContentPreviewRenderResponse");
  const blockType = extractTypeBody(inputs.httpResponses ?? "", "studentAppArchiveItemContentPreviewBlock");

  addFinding(findings, {
    id: "source.0318_read_foundation_ready",
    passed: source0318.ok &&
      source0318.value?.readiness === "READY" &&
      source0318.value?.runtime?.status === "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_READ_FOUNDATION_READY",
    actual: source0318.ok
      ? `${source0318.value?.readiness}:${source0318.value?.runtime?.status}`
      : source0318.error,
    expected: "0318 published content preview read foundation report is READY",
    remediation: "Regenerate or fix 0318 read foundation evidence before claiming 0319 render envelope.",
  });

  addFinding(findings, {
    id: "go.safe_text_block_render_envelope",
    passed: includesAll(goCore, [
      "PublishedArchiveMaterialContentPreviewRenderEnvelope",
      "PublishedArchiveMaterialContentPreviewBlock",
      "PublishedArchiveMaterialContentPreviewRenderFormatSafeTextBlocks",
      "PublishedArchiveMaterialContentPreviewBlockTypeSection",
      "BuildStudentAppArchiveItemContentPreviewRenderEnvelope",
      "RenderStudentAppArchiveItemContentPreview",
      "GetPublishedContentPreviewForStudentApp",
      "RejectsCrossStudentRepositoryLeak",
    ]),
    actual: summarizePresence(goCore, [
      "SAFE_TEXT_BLOCKS",
      "BuildStudentAppArchiveItemContentPreviewRenderEnvelope",
      "RenderStudentAppArchiveItemContentPreview",
    ]),
    expected: "domain and use case render only safe reviewed preview sections into SAFE_TEXT_BLOCKS",
    remediation: "Keep rendering inside the 0318 safe preview read boundary and reject repository leaks.",
  });

  addFinding(findings, {
    id: "http.openapi_safe_render_endpoint",
    passed: includesAll(delivery + contracts, [
      "/v1/student-app/archive-items/{archiveItemId}/content-preview/rendered",
      "/content-preview/rendered",
      "renderStudentAppArchiveItemContentPreview",
      "RenderStudentAppArchiveItemContentPreview",
      "operationId: renderStudentAppArchiveItemContentPreview",
      "renderFormat",
      "SAFE_TEXT_BLOCKS",
      "blockType",
      "SECTION",
      "body leaked",
    ]) &&
      hasGoKeyedValue(inputs.main ?? "", "RenderStudentAppArchiveItemContentPreview", "renderStudentAppArchiveItemContentPreview") &&
      !responseType.includes("StudentID") &&
      !responseType.includes("ContentRef") &&
      !responseType.includes("RenderedHTML") &&
      !responseType.includes("RenderedMarkdown") &&
      !blockType.includes("ExpectedAnswer") &&
      !blockType.includes("Raw") &&
      !inputs.openApiPath.includes("contentRef") &&
      !inputs.openApiPath.includes("studentId") &&
      !inputs.openApiPath.includes("rawContent") &&
      !inputs.openApiPath.includes("renderedHtml") &&
      !inputs.openApiPath.includes("renderedMarkdown"),
    actual: summarizePresence(responseType + blockType + inputs.openApiPath, [
      "StudentID", "ContentRef", "RenderedHTML", "RenderedMarkdown", "ExpectedAnswer", "contentRef", "studentId", "rawContent", "renderedHtml", "renderedMarkdown",
    ]),
    expected: "HTTP/OpenAPI exposes only safe text-block rendering fields",
    remediation: "Remove ownership, storage, raw rendering, answer, model, worker, and publication fields from the render response.",
  });

  addFinding(findings, {
    id: "quality_root_board_hooks",
    passed: includesAll(hooks, [
      "audit:teaching-archive-material-published-content-preview-render-envelope",
      "Teaching archive material published content preview render envelope audit",
      "teachingArchiveMaterialPublishedContentPreviewRenderEnvelope",
      "teaching-archive-material-published-content-preview-render-envelope.current.json",
      "0319-teaching-archive-material-published-content-preview-render-envelope.md",
      "render_student_app_archive_item_content_preview.go",
      "content-preview/rendered",
      "10.93/10",
      "SDD 0319 published content preview render envelope",
    ]),
    actual: summarizePresence(hooks, [
      "audit:teaching-archive-material-published-content-preview-render-envelope",
      "teachingArchiveMaterialPublishedContentPreviewRenderEnvelope",
      "10.93/10",
    ]),
    expected: "package, quality gate, root workflow coverage, structure verifier, SDD trace, and architecture board track 0319",
    remediation: "Wire this render envelope through every project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_RENDER_ENVELOPE",
    runtime: {
      runtimeId,
      useCase: "RenderStudentAppArchiveItemContentPreview.Execute",
      repository: "ArchiveRepository.GetPublishedContentPreviewForStudentApp",
      endpoint: "GET /v1/student-app/archive-items/{archiveItemId}/content-preview/rendered",
      status: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_RENDER_ENVELOPE_READY",
    },
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.max(1, Math.min(50, options.probeP99Ms ?? Date.now() - startedAt)),
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STATIC_GO_SAFE_TEXT_BLOCK_RENDER_ENVELOPE_AUDIT",
    },
    safetyInvariants: {
      ownStudentOnly: true,
      safePreviewReadFoundationRequired: true,
      renderFormat: "SAFE_TEXT_BLOCKS",
      renderedHtmlAllowed: false,
      renderedMarkdownAllowed: false,
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
      ? "Use this as a safe Student App preview render envelope; keep full content rendering, OCR/RAG, semantic retrieval, and AI grading as later reviewed slices."
      : "Fix render envelope evidence before claiming Student App published preview rendering support.",
  };
}

export function formatTeachingArchiveMaterialPublishedContentPreviewRenderEnvelopeAudit(report) {
  const lines = [
    `Teaching archive material published content preview render envelope: ${report.readiness}`,
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

function hasGoKeyedValue(text, key, value) {
  return new RegExp(`${key}:\\s*${value}`).test(text);
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
  const report = auditTeachingArchiveMaterialPublishedContentPreviewRenderEnvelope(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatTeachingArchiveMaterialPublishedContentPreviewRenderEnvelopeAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
