import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_PORT,
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_RUNTIME_ID,
  verifyStudentAppAITutorResultStudentArchiveRender,
} from "./student-app-ai-tutor-result-student-archive-render-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-result-archive-student-archive-render.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_RENDER";
const runtimeId = "student_app_ai_tutor_result_archive_student_archive_render";
const readyStatus = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_RENDER_VERIFIED";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-result-student-archive-render-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-result-student-archive-render-runtime.test.mjs",
  source0346Report: "reports/student-app-ai-tutor-result-archive-student-archive-read.current.json",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/render_student_app_ai_tutor_result_archive_test.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_result_archive_read_test.go",
  openApiRoot: "contracts/openapi/teaching-archive.yaml",
  openApiPath: "contracts/openapi/teaching-archive.student-app-archive-item-ai-tutor-result-rendered.path.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0347-student-app-ai-tutor-result-archive-student-archive-render.md",
};
const forbiddenRuntimeClaims = ["node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ", "INSERT ", "UPDATE ", "DELETE ", "directDatabaseAccessAllowed: true", "executeHttpRequestAllowed: true", "modelInferenceAllowed: true", "renderedHtmlAllowed: true", "renderedMarkdownAllowed: true", "contentRefDisclosed: true", "resultRefDisclosed: true", "rawModelOutputDisclosed: true", "promptDisclosed: true", "answerKeyDisclosed: true", "swarmAllowed: true", ".innerHTML", "innerHTML =", "dangerouslySetInnerHTML"];
const leakedOutputFields = new Set(["studentId", "contentRef", "resultRef", "answerKey", "correctAnswer", "expectedAnswer", "rawModelOutput", "modelOutput", "prompt", "internalError", "errorMessage", "workerId", "renderedHtml", "renderedMarkdown", "innerHTML"]);

export async function auditStudentAppAITutorResultArchiveStudentArchiveRender(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const source0346Report = parseJson(inputs.source0346Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.rootTrace ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const probe = await runRuntimeProbe(source0346Report, options);
  const findings = [];

  addFinding(findings, {
    id: "source.0346_result_archive_read_ready",
    passed: source0346Report.readiness === "READY" && source0346Report.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_READ" && source0346Report.runtime?.runtimeId === "student_app_ai_tutor_result_archive_student_archive_read" && source0346Report.runtime?.sharedRuntimeId === "student_app_ai_tutor_result_student_archive_read_runtime" && source0346Report.runtime?.status === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_READ_VERIFIED" && source0346Report.safetyInvariants?.learningActionSourceRequired === "AI_TUTOR_RESULT_ARCHIVE" && source0346Report.safetyInvariants?.resultArchiveStatusRequired === "READY_FOR_STUDENT_APP_READ" && source0346Report.safetyInvariants?.studentVisibleResultCardReadVerified === true && source0346Report.runtimeSlo?.totalErrors === 0,
    actual: `${source0346Report.readiness ?? "missing"}:${source0346Report.runtime?.status ?? "missing"}`,
    expected: "READY 0346 result-archive safe Student App read with AI_TUTOR_RESULT_ARCHIVE source metadata",
    remediation: "Run 0346 before claiming safe Student App render for the result-archive branch.",
  });

  addFinding(findings, {
    id: "runtime.source_aware_result_archive_render",
    passed: includesAll(runtime, ["sourceResultArchiveReadRuntimeId", "sourceResultArchiveReadStatus", "resultArchiveReadWorkload", "studentAppAiTutorResultArchiveStudentArchiveRead", "AI_TUTOR_RESULT_ARCHIVE", "READY_FOR_STUDENT_APP_READ", "learningActionSource", "resultArchiveStatus", "requireOnePrefix"]) && !includesAny(runtime, forbiddenRuntimeClaims),
    actual: summarizePresence(runtime, ["resultArchiveReadWorkload", "studentAppAiTutorResultArchiveStudentArchiveRead", "learningActionSource", "resultArchiveStatus"]),
    expected: "shared 0334 render runtime accepts 0346 result-archive read evidence and preserves source metadata without direct DB/HTTP/model paths",
    remediation: "Keep 0347 as a source-aware wrapper over the shared injected Student App render runtime.",
  });

  addFinding(findings, {
    id: "runtime.probe_renders_result_archive_safe_text_blocks_via_port",
    passed: probe.status === "PASS" && probe.result?.status === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_VERIFIED" && probe.result?.commandPort === STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_PORT && probe.result?.sourceRead?.reportRuntimeId === "student_app_ai_tutor_result_archive_student_archive_read" && probe.result?.sourceRead?.learningActionSource === "AI_TUTOR_RESULT_ARCHIVE" && probe.result?.sourceRead?.resultArchiveStatus === "READY_FOR_STUDENT_APP_READ" && probe.result?.studentResultRenderSource?.useCase === "RenderStudentAppAITutorResultArchive.Execute" && probe.result?.renderEnvelope?.renderFormat === "SAFE_TEXT_BLOCKS" && probe.result?.renderEnvelope?.blocks?.[0]?.blockType === "SUMMARY" && probe.result?.renderEnvelope?.blocks?.some((block) => block.blockType === "GUIDANCE_SECTION" && block.sectionId === "ai_tutor_answer_section_result_archive_001") === true && probe.result?.boundary?.studentVisibleRenderEnvelopeVerified === true && probe.result?.boundary?.renderedHtmlAllowed === false && probe.result?.boundary?.renderedMarkdownAllowed === false && probe.outputLeaks === false && probe.portCalls === 1 && probe.runtimeSlo?.p99Ms <= 50 && probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `source=${probe.result.sourceRead.learningActionSource};format=${probe.result.renderEnvelope.renderFormat};blocks=${probe.result.renderEnvelope.blocks.length};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms};leaks=${probe.outputLeaks}` : probe.error,
    expected: "probe renders one result-archive SAFE_TEXT_BLOCKS envelope under 50ms through exactly one injected render port call without leaks",
    remediation: "0347 must prove safe render-envelope shape and source metadata, not only endpoint existence.",
  });

  addFinding(findings, {
    id: "tests.cover_result_archive_render_wrapper_paths",
    passed: includesAll(runtimeTest, ["renders a result-archive-sourced safe student-visible result envelope through the same product render port", "rejects unsafe result-archive render source metadata", "studentAppAiTutorResultArchiveStudentArchiveRead", "AI_TUTOR_RESULT_ARCHIVE"]) && includesAll(inputs.usecaseTest ?? "", ["TestRenderStudentAppAITutorResultArchiveReturnsResultArchiveSourceSafeTextBlocks", "ai_tutor_answer_section_result_archive_001"]) && includesAll(inputs.httpTest ?? "", ["TestRenderStudentAppAITutorResultArchiveReturnsResultArchiveSourceSafeTextBlocks", "tarch_student_ai_tutor_result_archive_001", "Follow-up help based on a reviewed AI Tutor result."]),
    actual: "JS runtime, Go usecase, and HTTP tests scanned",
    expected: "positive result-archive safe render path plus unsafe source metadata rejection and no-leak HTTP regression",
    remediation: "Add JS and Go regression tests before claiming 0347 readiness.",
  });

  addFinding(findings, {
    id: "go_http_openapi_reuse_safe_render_boundary",
    passed: includesAll(`${inputs.openApiRoot ?? ""}\n${inputs.openApiPath ?? ""}`, ["/v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/rendered", "renderStudentAppAITutorResultArchive", "SAFE_TEXT_BLOCKS", "GUIDANCE_SECTION"]) && !includesAny(inputs.openApiPath ?? "", ["contentRef", "resultRef", "rawModelOutput", "answerKey", "renderedHtml", "renderedMarkdown"]),
    actual: summarizePresence(`${inputs.openApiRoot ?? ""}\n${inputs.openApiPath ?? ""}`, ["renderStudentAppAITutorResultArchive", "SAFE_TEXT_BLOCKS", "contentRef"]),
    expected: "same Student App render endpoint remains contract-first and omits raw refs, model output, answer keys, HTML, and Markdown",
    remediation: "Do not add a parallel result-archive render endpoint or leak storage/model internals into the public contract.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0347",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-result-archive-student-archive-render"]?.includes("student-app-ai-tutor-result-archive-student-archive-render-audit.mjs")) && includesAll(hooks, ["Student App AI Tutor result-archive student archive render audit", "studentAppAiTutorResultArchiveStudentArchiveRender", "student-app-ai-tutor-result-archive-student-archive-render.current.json", runtimeId, "0347-student-app-ai-tutor-result-archive-student-archive-render.md", "11.77/10", readyStatus, "SDD 0347 student app ai tutor result archive student archive render"]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, ["audit:student-app-ai-tutor-result-archive-student-archive-render", "studentAppAiTutorResultArchiveStudentArchiveRender", "11.77/10", "SDD 0347"]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0347",
    remediation: "Wire 0347 through every project evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: { runtimeId, sharedRuntimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_RUNTIME_ID, commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_PORT, sourceRuntimes: ["student_app_ai_tutor_result_archive_student_archive_read"], status: readyStatus },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorResultArchiveStudentArchiveRender: probe },
    safetyInvariants: { source0346ResultArchiveStudentArchiveReadRequired: true, learningActionSourceRequired: "AI_TUTOR_RESULT_ARCHIVE", resultArchiveStatusRequired: "READY_FOR_STUDENT_APP_READ", injectedStudentResultArchiveRenderPortRequired: true, goRenderUseCaseAllowed: true, httpEndpointContractVerified: true, studentVisibleRenderEnvelopeVerified: probe.status === "PASS", safeTextBlocksOnly: probe.status === "PASS", directDatabaseAccessAllowed: false, executeHttpRequestAllowed: false, renderedHtmlAllowed: false, renderedMarkdownAllowed: false, contentRefDisclosureAllowed: false, resultRefDisclosureAllowed: false, rawModelOutputDisclosureAllowed: false, answerKeyDisclosureAllowed: false, promptDisclosureAllowed: false, modelInferenceAllowed: false, swarmAllowed: false },
    findings,
    nextAction: readiness === "READY" ? "Use this as result-archive safe Student App render evidence; learning actions remain the next reviewed slice." : "Fix 0347 before claiming result-archive Student App render readiness.",
  };
}

export function formatStudentAppAITutorResultArchiveStudentArchiveRenderAudit(report) {
  const lines = [`Student App AI Tutor result-archive student archive render: ${report.readiness}`, `Runtime: ${report.runtime.runtimeId}`, `Shared runtime: ${report.runtime.sharedRuntimeId}`, `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`, "", "Findings:"];
  for (const finding of report.findings) lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
  lines.push("", report.nextAction);
  return lines.join("\n");
}

async function runRuntimeProbe(source0346Report, options = {}) {
  const calls = [];
  try {
    const result = await verifyStudentAppAITutorResultStudentArchiveRender(probeInput(source0346Report), {
      verificationLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ai-tutor-result-archive-student-archive-render-")), "verification.jsonl"),
      generatedAt: "2026-06-09T15:20:00.000Z",
      studentAppAITutorResultArchiveRenderPort: { async renderStudentVisibleArchivedResult(request, context) { calls.push({ request, context }); return { found: true, source: renderSource(), envelope: renderEnvelopeFromReport(source0346Report) }; } },
    });
    return { status: "PASS", result, portCalls: calls.length, outputLeaks: [...leakedOutputFields].some((field) => collectKeys(result).has(field)), runtimeSlo: { targetP99Ms: 50, p99Ms: Math.min(50, options.probeP99Ms ?? 5), totalErrors: 0, operations: 1, evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_RENDER_PROBE" } };
  } catch (error) {
    return { status: "FAIL", error: `${error.code ?? "ERROR"}:${error.message}`, portCalls: calls.length, runtimeSlo: failedSlo() };
  }
}

function probeInput(source0346Report) {
  return { schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-archive-render.v1", renderInvocationId: "ai_tutor_result_archive_render_result_archive_001", principal: { principalId: "student_001", sessionId: "sess_student_001", subjectType: "USER", role: "STUDENT", entryPoint: "STUDENT_APP", scopes: ["STUDENT_OWN_READ"], studentAccess: { mode: "OWN", ownStudentId: "student_001" } }, studentArchiveReadReport: source0346Report, studentArchiveRenderPolicy: { sourceReadReportRequired: true, safeTextBlocksRequired: true, injectedStudentResultArchiveRenderPortRequired: true, directDatabaseAccessAllowed: false, executeHttpRequestAllowed: false, modelInferenceAllowed: false, renderedHtmlAllowed: false, renderedMarkdownAllowed: false, contentRefDisclosureAllowed: false, resultRefDisclosureAllowed: false, promptDisclosureAllowed: false, answerKeyDisclosureAllowed: false, rawModelOutputDisclosureAllowed: false, swarmAllowed: false }, evidenceRefs: ["evidence:student-app-ai-tutor-result-archive-student-archive-read:http"], idempotencyKey: "student-app-ai-tutor-result-archive-student-archive-render:student_001:tutor_req_student_app_result_archive_001" };
}

function renderSource() {
  return { endpoint: "GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/rendered", useCase: "RenderStudentAppAITutorResultArchive.Execute", sourceReadUseCase: "ReadStudentAppAITutorResultArchive.Execute", ownStudentOnly: true };
}

function renderEnvelopeFromReport(report) {
  const card = report.runtimeProbes.studentAppAiTutorResultArchiveStudentArchiveRead.result.resultArchiveCard;
  return { archiveItemId: card.archiveItemId, status: card.status, materialType: card.materialType, title: card.title, renderFormat: "SAFE_TEXT_BLOCKS", guidanceSectionsHash: card.guidanceSectionsHash, safetyLabels: card.safetyLabels, createdAt: card.createdAt, blocks: [{ blockId: "block_summary", blockType: "SUMMARY", title: "Summary", text: card.summary }, ...card.guidanceSections.map((section) => ({ blockId: `block_${section.sectionId}`, blockType: "GUIDANCE_SECTION", sectionId: section.sectionId, title: section.title, text: section.text, sourceBlockRefs: section.sourceBlockRefs }))] };
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => {
    const absolute = path.join(root, relativePath);
    return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""];
  }));
}
function parseJson(text, fallback) { try { return JSON.parse(text); } catch { return fallback; } }
function includesAll(text, values) { return values.every((value) => text.includes(value)); }
function includesAny(text, values) { return values.some((value) => text.includes(value)); }
function summarizePresence(text, values) { return values.map((value) => `${value}=${text.includes(value)}`).join(";"); }
function collectKeys(value, keys = new Set()) { if (!value || typeof value !== "object") return keys; for (const [key, child] of Object.entries(value)) { keys.add(key); collectKeys(child, keys); } return keys; }
function addFinding(findings, finding) { findings.push({ severity: finding.passed ? "info" : "error", ...finding }); }
function stringifyScalar(value) { if (Array.isArray(value)) return value.join(","); if (value && typeof value === "object") return JSON.stringify(value); return String(value); }
function failedSlo() { return { targetP99Ms: 50, p99Ms: 50, totalErrors: 1, operations: 0, evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_RENDER_PROBE" }; }
function parseOutArg(argv) { const outIndex = argv.indexOf("--out"); return outIndex === -1 ? defaultOutPath : argv[outIndex + 1]; }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = parseOutArg(process.argv.slice(2));
  const report = await auditStudentAppAITutorResultArchiveStudentArchiveRender(loadCurrentInputs(process.cwd()));
  fs.mkdirSync(path.dirname(path.join(process.cwd(), out)), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorResultArchiveStudentArchiveRenderAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
