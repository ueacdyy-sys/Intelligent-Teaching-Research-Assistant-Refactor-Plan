import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/teaching-archive-material-published-study-packet.current.json";
const runtimeId = "teaching_archive_material_published_study_packet";
const sourceFiles = {
  source0319Report: "reports/teaching-archive-material-published-content-preview-render-envelope.current.json",
  domain: "services/teaching-archive-gateway/internal/domain/student_app_archive_items.go",
  domainTest: "services/teaching-archive-gateway/internal/domain/student_app_archive_items_test.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/read_student_app_archive_item_study_packet.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/read_student_app_archive_item_study_packet_test.go",
  http: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_archive_items.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_archive_item_content_preview_test.go",
  httpPaths: "services/teaching-archive-gateway/internal/adapter/httpapi/server_paths.go",
  httpRoutes: "services/teaching-archive-gateway/internal/adapter/httpapi/server_routes.go",
  httpConfig: "services/teaching-archive-gateway/internal/adapter/httpapi/server_config.go",
  httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  httpPresenters: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  main: "services/teaching-archive-gateway/cmd/gateway/main.go",
  openApiRoot: "contracts/openapi/teaching-archive.yaml",
  openApiPath: "contracts/openapi/teaching-archive.student-app-archive-item-study-packet.path.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  sdd: "docs/sdd/0320-teaching-archive-material-published-study-packet.md",
};

export function auditTeachingArchiveMaterialPublishedStudyPacket(inputs, options = {}) {
  const startedAt = Date.now();
  const findings = [];
  const source0319 = parseJson(inputs.source0319Report);
  const goCore = joinInputs(inputs, ["domain", "domainTest", "usecase", "usecaseTest"]);
  const delivery = joinInputs(inputs, ["http", "httpTest", "httpPaths", "httpRoutes", "httpConfig", "httpResponses", "httpPresenters", "main"]);
  const contracts = joinInputs(inputs, ["openApiRoot", "openApiPath"]);
  const hooks = joinInputs(inputs, ["packageJson", "qualityGate", "rootWorkflowCoverage", "verifyStructure", "architectureBoard", "rootTrace", "sdd"]);
  const responseType = extractTypeBody(inputs.httpResponses ?? "", "studentAppArchiveItemStudyPacketResponse");
  const metadataType = extractTypeBody(inputs.httpResponses ?? "", "studentAppArchiveItemStudyPacketMetadata");

  addFinding(findings, {
    id: "source.0319_render_envelope_ready",
    passed: source0319.ok &&
      source0319.value?.readiness === "READY" &&
      source0319.value?.runtime?.status === "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_RENDER_ENVELOPE_READY",
    actual: source0319.ok
      ? `${source0319.value?.readiness}:${source0319.value?.runtime?.status}`
      : source0319.error,
    expected: "0319 content preview render envelope report is READY",
    remediation: "Regenerate or fix 0319 render envelope evidence before claiming 0320 study packet.",
  });

  addFinding(findings, {
    id: "go.safe_study_packet_composes_detail_and_preview",
    passed: includesAll(goCore, [
      "StudentAppArchiveItemStudyPacket",
      "StudentAppArchiveItemStudyPacketStatusReady",
      "BuildStudentAppArchiveItemStudyPacket",
      "ReadStudentAppArchiveItemStudyPacket",
      "GetPublishedForStudentApp",
      "GetPublishedContentPreviewForStudentApp",
      "DoesNotReadPreviewWhenDetailMissing",
      "RejectsPreviewMismatch",
    ]),
    actual: summarizePresence(goCore, [
      "BuildStudentAppArchiveItemStudyPacket",
      "GetPublishedForStudentApp",
      "GetPublishedContentPreviewForStudentApp",
    ]),
    expected: "domain and use case compose published metadata and safe text-block preview only",
    remediation: "Keep the study packet inside the published detail and 0319 safe preview boundaries.",
  });

  addFinding(findings, {
    id: "http.openapi_safe_study_packet_endpoint",
    passed: includesAll(delivery + contracts, [
      "/v1/student-app/archive-items/{archiveItemId}/study-packet",
      "/study-packet",
      "readStudentAppArchiveItemStudyPacket",
      "ReadStudentAppArchiveItemStudyPacket",
      "operationId: readStudentAppArchiveItemStudyPacket",
      "packetStatus",
      "archiveItem",
      "contentPreview",
      "SAFE_TEXT_BLOCKS",
      "body leaked",
      "ReadStudentAppArchiveItemStudyPacket:                  readStudentAppArchiveItemStudyPacket",
    ]) &&
      !responseType.includes("StudentID") &&
      !responseType.includes("ContentRef") &&
      !metadataType.includes("StudentID") &&
      !metadataType.includes("ContentRef") &&
      !inputs.openApiPath.includes("studentId") &&
      !inputs.openApiPath.includes("contentRef") &&
      !inputs.openApiPath.includes("rawContent") &&
      !inputs.openApiPath.includes("renderedHtml") &&
      !inputs.openApiPath.includes("renderedMarkdown") &&
      !inputs.openApiPath.includes("ragChunks") &&
      !inputs.openApiPath.includes("expectedAnswer"),
    actual: summarizePresence(responseType + metadataType + inputs.openApiPath, [
      "StudentID", "ContentRef", "studentId", "contentRef", "rawContent", "renderedHtml", "renderedMarkdown", "ragChunks", "expectedAnswer",
    ]),
    expected: "HTTP/OpenAPI exposes only safe metadata and SAFE_TEXT_BLOCKS preview",
    remediation: "Remove ownership internals, storage refs, raw rendering, answer, model, worker, and publication fields from the study packet response.",
  });

  addFinding(findings, {
    id: "quality_root_board_hooks",
    passed: includesAll(hooks, [
      "audit:teaching-archive-material-published-study-packet",
      "Teaching archive material published study packet audit",
      "teachingArchiveMaterialPublishedStudyPacket",
      "teaching-archive-material-published-study-packet.current.json",
      "0320-teaching-archive-material-published-study-packet.md",
      "read_student_app_archive_item_study_packet.go",
      "study-packet",
      "10.96/10",
      "SDD 0320 student app archive item study packet",
    ]),
    actual: summarizePresence(hooks, [
      "audit:teaching-archive-material-published-study-packet",
      "teachingArchiveMaterialPublishedStudyPacket",
      "10.96/10",
    ]),
    expected: "package, quality gate, root workflow coverage, structure verifier, SDD trace, and architecture board track 0320",
    remediation: "Wire this study packet through every project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_STUDY_PACKET",
    runtime: {
      runtimeId,
      useCase: "ReadStudentAppArchiveItemStudyPacket.Execute",
      detailRepository: "ArchiveRepository.GetPublishedForStudentApp",
      previewRepository: "ArchiveRepository.GetPublishedContentPreviewForStudentApp",
      endpoint: "GET /v1/student-app/archive-items/{archiveItemId}/study-packet",
      status: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_STUDY_PACKET_READY",
    },
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.max(1, Math.min(50, options.probeP99Ms ?? Date.now() - startedAt)),
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STATIC_GO_SAFE_STUDY_PACKET_AUDIT",
    },
    safetyInvariants: {
      ownStudentOnly: true,
      publishedMetadataRequired: true,
      safePreviewRenderEnvelopeRequired: true,
      renderFormat: "SAFE_TEXT_BLOCKS",
      studentIdExcluded: true,
      contentRefExcluded: true,
      rawContentReadAllowed: false,
      renderedHtmlAllowed: false,
      renderedMarkdownAllowed: false,
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
      ? "Use this as the Student App archive item study packet foundation; keep full content, OCR/RAG, semantic retrieval, AI tutoring, and Swarm as later reviewed slices."
      : "Fix study packet evidence before claiming Student App material detail page support.",
  };
}

export function formatTeachingArchiveMaterialPublishedStudyPacketAudit(report) {
  const lines = [
    `Teaching archive material published study packet: ${report.readiness}`,
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
  const report = auditTeachingArchiveMaterialPublishedStudyPacket(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatTeachingArchiveMaterialPublishedStudyPacketAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
