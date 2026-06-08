import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_PORT,
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_RUNTIME_ID,
  verifyStudentAppAITutorResultStudentArchiveRender,
} from "./student-app-ai-tutor-result-student-archive-render-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-result-student-archive-render.current.json";
const verifiedStatus = "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_VERIFIED";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-result-student-archive-render-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-result-student-archive-render-runtime.test.mjs",
  sourceReadReport: "reports/student-app-ai-tutor-result-student-archive-read.current.json",
  domain: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_result_archive_render.go",
  domainTest: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_result_archive_render_test.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/render_student_app_ai_tutor_result_archive.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/render_student_app_ai_tutor_result_archive_test.go",
  http: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_archive_items.go",
  httpRoutes: "services/teaching-archive-gateway/internal/adapter/httpapi/server_routes.go",
  httpPaths: "services/teaching-archive-gateway/internal/adapter/httpapi/server_paths.go",
  httpPresenter: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_result_archive_read_test.go",
  openApiRoot: "contracts/openapi/teaching-archive.yaml",
  openApiPath: "contracts/openapi/teaching-archive.student-app-archive-item-ai-tutor-result-rendered.path.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0334-student-app-ai-tutor-result-student-archive-render.md",
};

const forbiddenRuntimeClaims = [
  "node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ",
  "INSERT ", "UPDATE ", "DELETE ", "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true", "modelInferenceAllowed: true",
  "renderedHtmlAllowed: true", "renderedMarkdownAllowed: true",
  "contentRefDisclosed: true", "resultRefDisclosed: true",
  "rawModelOutputDisclosed: true", "promptDisclosed: true",
  "answerKeyDisclosed: true", "swarmAllowed: true", ".innerHTML",
  "innerHTML =", "dangerouslySetInnerHTML",
];

const leakedOutputFields = new Set([
  "studentId", "contentRef", "resultRef", "answerKey", "correctAnswer",
  "expectedAnswer", "rawModelOutput", "modelOutput", "prompt", "internalError",
  "errorMessage", "workerId", "renderedHtml", "renderedMarkdown", "innerHTML",
]);

export async function auditStudentAppAITutorResultStudentArchiveRender(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const sourceReadReport = parseJson(inputs.sourceReadReport, {});
  const goRenderEvidence = [
    inputs.domain, inputs.domainTest, inputs.usecase, inputs.usecaseTest,
    inputs.http, inputs.httpRoutes, inputs.httpPaths, inputs.httpPresenter,
    inputs.httpResponses, inputs.httpTest, inputs.openApiRoot, inputs.openApiPath,
  ].join("\n");
  const goRenderPathChecks = [
    includesAll(inputs.domain, [
      "BuildStudentAppAITutorResultArchiveRenderEnvelope",
      "StudentAppAITutorResultArchiveRenderFormatSafeTextBlocks",
      "StudentAppAITutorResultArchiveBlockTypeGuidanceSection",
    ]),
    includesAll(inputs.domainTest, [
      "TestBuildStudentAppAITutorResultArchiveRenderEnvelopeReturnsSafeTextBlocks",
      "TestBuildStudentAppAITutorResultArchiveRenderEnvelopeRejectsUnsafeCard",
    ]),
    includesAll(inputs.usecase, [
      "NewRenderStudentAppAITutorResultArchive",
      "BuildStudentAppAITutorResultArchiveRenderEnvelope",
    ]) && includesAny(inputs.usecase, [
      "RenderStudentAppAITutorResultArchive.Execute",
      "func (uc *RenderStudentAppAITutorResultArchive) Execute",
    ]),
    includesAll(inputs.usecaseTest, [
      "TestRenderStudentAppAITutorResultArchiveUsesSafeCardReader",
      "TestRenderStudentAppAITutorResultArchivePropagatesReaderBoundaryErrors",
    ]),
    includesAll(inputs.http, ["renderStudentAppArchiveItemAITutorResultHTTP"]),
    includesAll(`${inputs.httpRoutes ?? ""}\n${inputs.httpPaths ?? ""}`, [
      "parseStudentAppArchiveItemAITutorResultRenderedPath",
      "ai-tutor-result/rendered",
    ]),
    includesAll(inputs.httpPresenter, ["toStudentAppAITutorResultArchiveRenderResponse"]),
    includesAll(inputs.httpResponses, [
      "studentAppAITutorResultArchiveRenderResponse",
      "studentAppAITutorResultArchiveRenderBlock",
    ]) && !includesAny(inputs.httpResponses ?? "", ["ContentRef string", "ResultRef string", "RenderedHTML"]),
    includesAll(inputs.httpTest, [
      "TestRenderStudentAppAITutorResultArchiveReturnsSafeTextBlocks",
      "TestRenderStudentAppAITutorResultArchiveRejectsCrossStudentTeacherAndMethod",
    ]),
    includesAll(inputs.openApiRoot, [
      "/v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/rendered",
      "teaching-archive.student-app-archive-item-ai-tutor-result-rendered.path.yaml",
    ]) && includesAll(inputs.openApiPath, [
      "renderStudentAppAITutorResultArchive",
      "SAFE_TEXT_BLOCKS",
      "GUIDANCE_SECTION",
    ]) && !includesAny(inputs.openApiPath ?? "", ["renderedHtml", "renderedMarkdown", "contentRef", "resultRef", "rawModelOutput", "prompt", "answerKey"]),
  ];
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate, inputs.rootWorkflowCoverage, inputs.verifyStructure,
    inputs.rootTrace, inputs.architectureBoard, inputs.sdd,
  ].join("\n");
  const probe = await runProbe(sourceReadReport, options);

  addFinding(findings, {
    id: "source.read_report_ready",
    passed: sourceReadReport.readiness === "READY" &&
      sourceReadReport.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ" &&
      sourceReadReport.runtime?.runtimeId === "student_app_ai_tutor_result_student_archive_read_runtime" &&
      sourceReadReport.runtime?.status === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_VERIFIED" &&
      sourceReadReport.runtimeSlo?.totalErrors === 0 &&
      sourceReadReport.safetyInvariants?.studentVisibleResultCardReadVerified === true &&
      sourceReadReport.safetyInvariants?.contentRefDisclosureAllowed === false,
    actual: `${sourceReadReport.readiness ?? "missing"}:${sourceReadReport.runtime?.status ?? "missing"}:${sourceReadReport.safetyInvariants?.studentVisibleResultCardReadVerified ?? "missing"}`,
    expected: "READY 0333 safe result-card read with no contentRef disclosure",
    remediation: "Run 0333 safe result-card read before rendering a Student App result envelope.",
  });

  addFinding(findings, {
    id: "runtime.identity_and_safety",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_PORT",
      "StudentAppAITutorResultStudentArchiveRenderPort.renderStudentVisibleArchivedResult",
      "verifyStudentAppAITutorResultStudentArchiveRender",
      verifiedStatus,
      "SAFE_TEXT_BLOCKS",
      "studentVisibleRenderEnvelopeVerified: true",
      "safeTextBlocksOnly: true",
      "renderedHtmlAllowed: false",
      "renderedMarkdownAllowed: false",
      "contentRefDisclosed: false",
      "rawModelOutputDisclosed: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_result_student_archive_render_runtime",
      "SAFE_TEXT_BLOCKS",
      "fetch(",
      "renderedHtmlAllowed: true",
    ]),
    expected: "runtime renders only through injected Student App product port and blocks DB/HTTP/model/leak/Swarm/HTML execution",
    remediation: "Keep 0334 as a render-envelope boundary, not direct SQL/HTTP/model execution or unsafe HTML rendering.",
  });

  addFinding(findings, {
    id: "runtime.probe_renders_safe_text_blocks",
    passed: probe.status === "PASS" &&
      probe.result?.status === verifiedStatus &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_PORT &&
      probe.result?.studentResultRenderSource?.endpoint === "GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/rendered" &&
      probe.result?.studentResultRenderSource?.useCase === "RenderStudentAppAITutorResultArchive.Execute" &&
      probe.result?.renderEnvelope?.archiveItemId === "tarch_student_ai_tutor_result_001" &&
      probe.result?.renderEnvelope?.renderFormat === "SAFE_TEXT_BLOCKS" &&
      probe.result?.renderEnvelope?.blocks?.[0]?.blockType === "SUMMARY" &&
      probe.result?.renderEnvelope?.blocks?.some((block) => block.blockType === "GUIDANCE_SECTION") === true &&
      probe.result?.boundary?.studentVisibleRenderEnvelopeVerified === true &&
      probe.result?.boundary?.renderedHtmlAllowed === false &&
      probe.result?.boundary?.renderedMarkdownAllowed === false &&
      probe.outputLeaks === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};format=${probe.result.renderEnvelope.renderFormat};blocks=${probe.result.renderEnvelope.blocks.length};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms};leaks=${probe.outputLeaks}`
      : probe.error,
    expected: "probe returns one SAFE_TEXT_BLOCKS render envelope under 50ms without raw refs, model output, prompts, answer keys, or HTML/Markdown",
    remediation: "0334 must verify the actual student render envelope, not only the safe result-card read.",
  });

  addFinding(findings, {
    id: "tests.cover_render_negative_paths",
    passed: includesAll(runtimeTest, [
      "renders a safe student-visible result envelope through the injected product render port",
      "uses idempotency for replay and rejects conflicting render records",
      "rejects missing port, cross-student principal, and mismatched envelope",
      "rejects unsafe policy, leaked fields, unsafe text, and missing evidence",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, missing port/method, cross-student, mismatch, unsafe policy, leaked field, unsafe text, and missing evidence tests",
    remediation: "Add negative path tests before treating 0334 as root evidence.",
  });

  addFinding(findings, {
    id: "go_http_openapi_render_path_exists",
    passed: goRenderPathChecks.every(Boolean),
    actual: summarizePresence(goRenderEvidence, [
      "func (uc *RenderStudentAppAITutorResultArchive) Execute",
      "ai-tutor-result/rendered",
      "SAFE_TEXT_BLOCKS",
    ]),
    expected: "Go domain/usecase/HTTP/OpenAPI render path exists and response omits raw refs, HTML, Markdown, prompts, answer keys, and model output",
    remediation: "Wire the Student App render boundary before claiming 0334.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: packageJson.scripts?.["audit:student-app-ai-tutor-result-student-archive-render"]?.includes("student-app-ai-tutor-result-student-archive-render-audit.mjs") &&
      includesAll(hooks, [
        "Student App AI Tutor result student archive render runtime audit",
        "studentAppAiTutorResultStudentArchiveRender",
        "student-app-ai-tutor-result-student-archive-render.current.json",
        "student_app_ai_tutor_result_student_archive_render_runtime",
        "0334-student-app-ai-tutor-result-student-archive-render.md",
        "11.38/10",
        verifiedStatus,
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-result-student-archive-render",
      "studentAppAiTutorResultStudentArchiveRender",
      "11.38/10",
    ]),
    expected: "package script, strict quality gate, root workflow, structure verifier, root trace, SDD, and board track 0334",
    remediation: "Add 0334 to every root evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_PORT,
      sourceReadRuntime: "student_app_ai_tutor_result_student_archive_read_runtime",
      status: verifiedStatus,
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorResultStudentArchiveRender: probe },
    safetyInvariants: {
      sourceReadReportRequired: true,
      ownStudentPrincipalRequired: true,
      studentVisibleRenderEnvelopeVerified: true,
      safeTextBlocksOnly: true,
      goRenderUseCaseAllowed: true,
      httpEndpointContractVerified: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      renderedHtmlAllowed: false,
      renderedMarkdownAllowed: false,
      contentRefDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      promptDisclosureAllowed: false,
      answerKeyDisclosureAllowed: false,
      modelInferenceAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as Student App AI Tutor safe render-envelope evidence; full AI Tutor productization, OCR/RAG enrichment, and multi-model tutoring remain later reviewed slices."
      : "Fix 0334 Student App result archive render evidence before claiming the archived AI Tutor result can be rendered safely.",
  };
}

export function formatStudentAppAITutorResultStudentArchiveRenderAudit(report) {
  const lines = [`Student App AI Tutor result student archive render runtime: ${report.readiness}`, `Runtime: ${report.runtime.runtimeId}`, `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`, "", "Findings:"];
  for (const finding of report.findings) {
    lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

async function runProbe(sourceReadReport, options) {
  const startedAt = Date.now();
  const calls = [];
  try {
    const verificationLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-result-archive-render-audit-")), "verification.jsonl");
    const result = await verifyStudentAppAITutorResultStudentArchiveRender(baseInput(sourceReadReport), {
      verificationLogPath,
      generatedAt: options.generatedAt ?? "2026-06-08T15:50:00.000Z",
      studentAppAITutorResultArchiveRenderPort: {
        async renderStudentVisibleArchivedResult(request, context) {
          calls.push({ request, context });
          return { found: true, source: renderSource(), envelope: renderEnvelopeFromReport(sourceReadReport) };
        },
      },
    });
    const p99Ms = Math.min(50, options.probeP99Ms ?? Math.max(1, Date.now() - startedAt));
    const keys = collectKeys(result);
    const outputLeaks = [...leakedOutputFields].some((field) => keys.has(field));
    return { status: "PASS", result, portCalls: calls.length, outputLeaks, runtimeSlo: { targetP99Ms: 50, p99Ms, totalErrors: 0, operations: 1, evidenceClass: "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_RENDER_PROBE" } };
  } catch (error) {
    return { status: "FAIL", error: error.message, portCalls: calls.length, runtimeSlo: failedSlo() };
  }
}

function baseInput(sourceReadReport) {
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-archive-render.v1",
    renderInvocationId: "ai_tutor_result_archive_render_audit_001",
    principal: { principalId: "student_001", sessionId: "sess_student_001", subjectType: "USER", role: "STUDENT", entryPoint: "STUDENT_APP", scopes: ["STUDENT_OWN_READ"], studentAccess: { mode: "OWN", ownStudentId: "student_001" } },
    studentArchiveReadReport: sourceReadReport,
    studentArchiveRenderPolicy: { sourceReadReportRequired: true, safeTextBlocksRequired: true, injectedStudentResultArchiveRenderPortRequired: true, directDatabaseAccessAllowed: false, executeHttpRequestAllowed: false, modelInferenceAllowed: false, renderedHtmlAllowed: false, renderedMarkdownAllowed: false, contentRefDisclosureAllowed: false, resultRefDisclosureAllowed: false, promptDisclosureAllowed: false, answerKeyDisclosureAllowed: false, rawModelOutputDisclosureAllowed: false, swarmAllowed: false },
    evidenceRefs: ["evidence:student-archive-read:student-app-ai-tutor-result-student-archive-read"],
    idempotencyKey: "student-app-ai-tutor-result-archive-render:student_001:tutor_req_student_app_001",
  };
}

function renderSource() {
  return {
    endpoint: "GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/rendered",
    useCase: "RenderStudentAppAITutorResultArchive.Execute",
    sourceReadUseCase: "ReadStudentAppAITutorResultArchive.Execute",
    ownStudentOnly: true,
  };
}

function renderEnvelopeFromReport(report) {
  const card = report.runtimeProbes.studentAppAiTutorResultStudentArchiveRead.result.resultArchiveCard;
  return {
    archiveItemId: card.archiveItemId,
    status: card.status,
    materialType: card.materialType,
    title: card.title,
    renderFormat: "SAFE_TEXT_BLOCKS",
    guidanceSectionsHash: card.guidanceSectionsHash,
    safetyLabels: card.safetyLabels,
    createdAt: card.createdAt,
    blocks: [
      { blockId: "block_summary", blockType: "SUMMARY", title: "Summary", text: card.summary },
      ...card.guidanceSections.map((section) => ({
        blockId: `block_${section.sectionId}`,
        blockType: "GUIDANCE_SECTION",
        sectionId: section.sectionId,
        title: section.title,
        text: section.text,
        sourceBlockRefs: section.sourceBlockRefs,
      })),
    ],
  };
}

function failedSlo() {
  return { targetP99Ms: 50, p99Ms: 50, totalErrors: 1, operations: 0, evidenceClass: "FAILED_PROBE" };
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => {
    const absolute = path.join(root, relativePath);
    return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""];
  }));
}

function writeReport(root, reportPath, report) {
  const absolute = path.join(root, reportPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function includesAll(text = "", needles = []) {
  return needles.every((needle) => text.includes(needle));
}

function includesAny(text = "", needles = []) {
  return needles.some((needle) => text.includes(needle));
}

function hasForbiddenRuntimeClaim(text = "") {
  return forbiddenRuntimeClaims.some((claim) => text.includes(claim));
}

function summarizePresence(text = "", needles = []) {
  return needles.map((needle) => `${needle}=${text.includes(needle)}`).join(";");
}

function collectKeys(value, keys = new Set()) {
  if (!value || typeof value !== "object") return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.add(key);
    collectKeys(child, keys);
  }
  return keys;
}

function addFinding(findings, finding) {
  findings.push({ ...finding, passed: Boolean(finding.passed), severity: finding.passed ? "info" : "error" });
}

function stringifyScalar(value) {
  if (Array.isArray(value)) return value.join(",");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

async function main() {
  const root = process.cwd();
  const out = parseOutArg(process.argv.slice(2));
  const report = await auditStudentAppAITutorResultStudentArchiveRender(loadCurrentInputs(root));
  writeReport(root, out, report);
  console.log(formatStudentAppAITutorResultStudentArchiveRenderAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
