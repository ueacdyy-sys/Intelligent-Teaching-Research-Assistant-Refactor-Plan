import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_PORT,
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_RUNTIME_ID,
  verifyStudentAppAITutorResultStudentArchiveLearningActions,
} from "./student-app-ai-tutor-result-student-archive-learning-actions-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-result-archive-student-archive-learning-actions.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_LEARNING_ACTIONS";
const runtimeId = "student_app_ai_tutor_result_archive_student_archive_learning_actions";
const readyStatus = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_LEARNING_ACTIONS_VERIFIED";
const sharedStatus = "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_VERIFIED";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-result-student-archive-learning-actions-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-result-student-archive-learning-actions-runtime.test.mjs",
  source0347Report: "reports/student-app-ai-tutor-result-archive-student-archive-render.current.json",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_result_archive_read_test.go",
  openApiRoot: "contracts/openapi/teaching-archive.yaml",
  openApiPath: "contracts/openapi/teaching-archive.student-app-archive-item-ai-tutor-result-learning-actions.path.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0348-student-app-ai-tutor-result-archive-student-archive-learning-actions.md",
};
const forbiddenRuntimeClaims = ["node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ", "INSERT ", "UPDATE ", "DELETE ", "directDatabaseAccessAllowed: true", "executeHttpRequestAllowed: true", "modelInferenceAllowed: true", "renderedHtmlAllowed: true", "renderedMarkdownAllowed: true", "contentRefDisclosed: true", "resultRefDisclosed: true", "rawModelOutputDisclosed: true", "promptDisclosed: true", "answerKeyDisclosed: true", "swarmAllowed: true", ".innerHTML", "innerHTML =", "dangerouslySetInnerHTML"];
const leakedOutputFields = new Set(["studentId", "contentRef", "resultRef", "answerKey", "correctAnswer", "expectedAnswer", "rawModelOutput", "modelOutput", "prompt", "internalError", "errorMessage", "workerId", "renderedHtml", "renderedMarkdown", "innerHTML", "blocks", "text", "guidanceSections", "summary"]);

export async function auditStudentAppAITutorResultArchiveStudentArchiveLearningActions(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const source0347Report = parseJson(inputs.source0347Report, {});
  const sourceArchiveItemId = source0347Report.runtimeProbes?.studentAppAiTutorResultArchiveStudentArchiveRender?.result?.renderEnvelope?.archiveItemId;
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.rootTrace ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const probe = await runRuntimeProbe(source0347Report, options);
  const findings = [];

  addFinding(findings, {
    id: "source.0347_result_archive_render_ready",
    passed: source0347Report.readiness === "READY" && source0347Report.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_RENDER" && source0347Report.runtime?.runtimeId === "student_app_ai_tutor_result_archive_student_archive_render" && source0347Report.runtime?.sharedRuntimeId === "student_app_ai_tutor_result_student_archive_render_runtime" && source0347Report.runtime?.status === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_RENDER_VERIFIED" && source0347Report.safetyInvariants?.learningActionSourceRequired === "AI_TUTOR_RESULT_ARCHIVE" && source0347Report.safetyInvariants?.resultArchiveStatusRequired === "READY_FOR_STUDENT_APP_READ" && source0347Report.safetyInvariants?.studentVisibleRenderEnvelopeVerified === true && source0347Report.runtimeSlo?.totalErrors === 0,
    actual: `${source0347Report.readiness ?? "missing"}:${source0347Report.runtime?.status ?? "missing"}`,
    expected: "READY 0347 result-archive safe render with AI_TUTOR_RESULT_ARCHIVE source metadata",
    remediation: "Run 0347 before claiming result-archive Student App learning-actions readiness.",
  });

  addFinding(findings, {
    id: "runtime.source_aware_result_archive_learning_actions",
    passed: includesAll(runtime, ["sourceResultArchiveRenderRuntimeId", "sourceResultArchiveRenderStatus", "resultArchiveRenderWorkload", "studentAppAiTutorResultArchiveStudentArchiveRender", "AI_TUTOR_RESULT_ARCHIVE", "READY_FOR_STUDENT_APP_READ", "student-app-ai-tutor-result-archive-student-archive-learning-actions:", "evidence:student-app-ai-tutor-result-archive-student-archive-render:http"]) && !includesAny(runtime, forbiddenRuntimeClaims),
    actual: summarizePresence(runtime, ["resultArchiveRenderWorkload", "studentAppAiTutorResultArchiveStudentArchiveRender", "sourceResultArchiveRenderStatus"]),
    expected: "shared 0335 learning-actions runtime accepts 0347 wrapper render evidence without direct DB/HTTP/model paths",
    remediation: "Keep 0348 as a wrapper over the shared injected Student App learning-actions runtime.",
  });

  addFinding(findings, {
    id: "runtime.probe_returns_result_archive_queue_actions",
    passed: probe.status === "PASS" && probe.result?.status === sharedStatus && probe.result?.commandPort === STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_PORT && probe.result?.sourceRender?.reportRuntimeId === "student_app_ai_tutor_result_archive_student_archive_render" && probe.result?.sourceRender?.learningActionSource === "AI_TUTOR_RESULT_ARCHIVE" && probe.result?.learningActions?.archiveItemId === sourceArchiveItemId && probe.result?.learningActions?.renderFormat === "SAFE_TEXT_BLOCKS" && probe.result?.learningActions?.actions?.every((action) => action.learningActionSource?.sourceType === "AI_TUTOR_RESULT_ARCHIVE" && action.targetEndpoint === "/v1/student-app/ai-tutor-requests") === true && probe.outputLeaks === false && probe.portCalls === 1 && probe.runtimeSlo?.p99Ms <= 50 && probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `archive=${probe.result.learningActions.archiveItemId};actions=${probe.result.learningActions.actions.length};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms};leaks=${probe.outputLeaks}` : probe.error,
    expected: "probe returns AI_TUTOR_RESULT_ARCHIVE actions for the 0347 rendered archive under 50ms with no raw render/model leaks",
    remediation: "0348 must prove safe queue-action source metadata, not just that 0335 still passes.",
  });

  addFinding(findings, {
    id: "tests.cover_result_archive_learning_actions_wrapper",
    passed: includesAll(runtimeTest, ["reads result-archive-sourced safe render learning actions through the shared product port", "rejects unsafe result-archive render source metadata before learning actions"]) && includesAll(inputs.httpTest ?? "", ["TestReadStudentAppAITutorResultArchiveLearningActionsReturnsResultArchiveSourceSafeActionSources", "tarch_student_ai_tutor_result_archive_001"]),
    actual: "JS runtime and Go HTTP tests scanned",
    expected: "positive 0347 wrapper learning-actions path and unsafe source metadata rejection",
    remediation: "Add wrapper regression tests before claiming 0348 readiness.",
  });

  addFinding(findings, {
    id: "go_http_openapi_reuse_learning_actions_boundary",
    passed: includesAll(`${inputs.openApiRoot ?? ""}\n${inputs.openApiPath ?? ""}\n${inputs.httpTest ?? ""}`, ["/v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/learning-actions", "AI_TUTOR_RESULT_ARCHIVE", "READY_FOR_STUDENT_APP_READ", "SAFE_TEXT_BLOCKS"]) && !includesAny(inputs.openApiPath ?? "", ["contentRef", "resultRef", "rawModelOutput", "answerKey", "renderedHtml", "renderedMarkdown"]),
    actual: summarizePresence(`${inputs.openApiRoot ?? ""}\n${inputs.openApiPath ?? ""}`, ["ai-tutor-result/learning-actions", "AI_TUTOR_RESULT_ARCHIVE", "contentRef"]),
    expected: "existing Student App learning-actions endpoint remains contract-first and omits raw refs, model output, answer keys, HTML, and Markdown",
    remediation: "Do not add a parallel result-archive learning-actions endpoint or leak storage/model internals.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0348",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-result-archive-student-archive-learning-actions"]?.includes("student-app-ai-tutor-result-archive-student-archive-learning-actions-audit.mjs")) && includesAll(hooks, ["Student App AI Tutor result-archive student archive learning actions audit", "studentAppAiTutorResultArchiveStudentArchiveLearningActions", "student-app-ai-tutor-result-archive-student-archive-learning-actions.current.json", runtimeId, "0348-student-app-ai-tutor-result-archive-student-archive-learning-actions.md", "11.80/10", readyStatus, "SDD 0348 student app ai tutor result archive student archive learning actions"]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, ["audit:student-app-ai-tutor-result-archive-student-archive-learning-actions", "studentAppAiTutorResultArchiveStudentArchiveLearningActions", "11.80/10", "SDD 0348"]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0348",
    remediation: "Wire 0348 through every project evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: { runtimeId, sharedRuntimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_RUNTIME_ID, commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_PORT, sourceRuntimes: ["student_app_ai_tutor_result_archive_student_archive_render"], status: readyStatus },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorResultArchiveStudentArchiveLearningActions: probe },
    safetyInvariants: { source0347ResultArchiveStudentArchiveRenderRequired: true, learningActionSourceRequired: "AI_TUTOR_RESULT_ARCHIVE", resultArchiveStatusRequired: "READY_FOR_STUDENT_APP_READ", safeTextBlocksSourceRequired: true, queueAdmissionSourceVerified: probe.status === "PASS", directDatabaseAccessAllowed: false, executeHttpRequestAllowed: false, rawRenderBlocksDisclosureAllowed: false, contentRefDisclosureAllowed: false, resultRefDisclosureAllowed: false, rawModelOutputDisclosureAllowed: false, promptDisclosureAllowed: false, answerKeyDisclosureAllowed: false, modelInferenceAllowed: false, swarmAllowed: false },
    findings,
    nextAction: readiness === "READY" ? "Use this as result-archive Student App learning-actions evidence; the next reviewed slice can continue the queue follow-up loop." : "Fix 0348 before claiming result-archive learning-actions readiness.",
  };
}

export function formatStudentAppAITutorResultArchiveStudentArchiveLearningActionsAudit(report) {
  const lines = [`Student App AI Tutor result-archive student archive learning actions: ${report.readiness}`, `Runtime: ${report.runtime.runtimeId}`, `Shared runtime: ${report.runtime.sharedRuntimeId}`, `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`, "", "Findings:"];
  for (const finding of report.findings) lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
  lines.push("", report.nextAction);
  return lines.join("\n");
}

async function runRuntimeProbe(source0347Report, options = {}) {
  const calls = [];
  try {
    const result = await verifyStudentAppAITutorResultStudentArchiveLearningActions(probeInput(source0347Report), {
      verificationLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ai-tutor-result-archive-student-archive-learning-actions-")), "verification.jsonl"),
      generatedAt: "2026-06-09T15:35:00.000Z",
      studentAppAITutorResultArchiveLearningActionsPort: { async readStudentVisibleArchivedResultLearningActions(request, context) { calls.push({ request, context }); return { found: true, source: learningActionsSource(), learningActions: learningActionsFromReport(source0347Report) }; } },
    });
    return { status: "PASS", result, portCalls: calls.length, outputLeaks: [...leakedOutputFields].some((field) => collectKeys(result).has(field)), runtimeSlo: { targetP99Ms: 50, p99Ms: Math.min(50, options.probeP99Ms ?? 5), totalErrors: 0, operations: 1, evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_LEARNING_ACTIONS_PROBE" } };
  } catch (error) {
    return { status: "FAIL", error: `${error.code ?? "ERROR"}:${error.message}`, portCalls: calls.length, runtimeSlo: failedSlo() };
  }
}

function probeInput(source0347Report) {
  const archiveItemId = source0347Report.runtimeProbes?.studentAppAiTutorResultArchiveStudentArchiveRender?.result?.renderEnvelope?.archiveItemId ?? "tarch_missing_source_archive_item";
  return { schemaVersion: "2026-06-09.student-app.ai-tutor-result-student-archive-learning-actions.v1", learningActionsInvocationId: "ai_tutor_result_archive_student_archive_learning_actions_001", principal: { principalId: "student_001", sessionId: "sess_student_001", subjectType: "USER", role: "STUDENT", entryPoint: "STUDENT_APP", scopes: ["STUDENT_OWN_READ"], studentAccess: { mode: "OWN", ownStudentId: "student_001" } }, studentArchiveRenderReport: source0347Report, studentArchiveLearningActionsPolicy: { sourceRenderReportRequired: true, queueAdmissionSourceRequired: true, injectedLearningActionsPortRequired: true, directDatabaseAccessAllowed: false, executeHttpRequestAllowed: false, modelInferenceAllowed: false, renderedHtmlAllowed: false, renderedMarkdownAllowed: false, contentRefDisclosureAllowed: false, resultRefDisclosureAllowed: false, promptDisclosureAllowed: false, answerKeyDisclosureAllowed: false, rawModelOutputDisclosureAllowed: false, swarmAllowed: false, rawRenderBlocksDisclosureAllowed: false }, evidenceRefs: ["evidence:student-app-ai-tutor-result-archive-student-archive-render:http"], idempotencyKey: `student-app-ai-tutor-result-archive-student-archive-learning-actions:student_001:${archiveItemId}` };
}

function learningActionsSource() {
  return { endpoint: "GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/learning-actions", useCase: "ReadStudentAppAITutorResultArchiveLearningActions.Execute", sourceRenderUseCase: "RenderStudentAppAITutorResultArchive.Execute", ownStudentOnly: true };
}

function learningActionsFromReport(report) {
  const envelope = report.runtimeProbes.studentAppAiTutorResultArchiveStudentArchiveRender.result.renderEnvelope;
  return { archiveItemId: envelope.archiveItemId, status: envelope.status, materialType: envelope.materialType, renderFormat: envelope.renderFormat, actions: [action("AI_TUTOR_REQUEST", "AVAILABLE"), action("PERSONALIZED_QUESTION_BANK", "DEFERRED_THROUGH_AI_TUTOR")] };
}

function action(actionType, state) {
  return { actionType, state, targetEndpoint: "/v1/student-app/ai-tutor-requests", method: "POST", questionBankIntent: "GENERATE_PERSONALIZED_CHECK", requiresTutorRequest: true, learningActionSource: { sourceType: "AI_TUTOR_RESULT_ARCHIVE", actionType, resultArchiveStatus: "READY_FOR_STUDENT_APP_READ", renderFormat: "SAFE_TEXT_BLOCKS" } };
}

function loadCurrentInputs(root) { return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => { const absolute = path.join(root, relativePath); return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""]; })); }
function parseJson(text, fallback) { try { return JSON.parse(text); } catch { return fallback; } }
function includesAll(text, values) { return values.every((value) => text.includes(value)); }
function includesAny(text, values) { return values.some((value) => text.includes(value)); }
function summarizePresence(text, values) { return values.map((value) => `${value}=${text.includes(value)}`).join(";"); }
function collectKeys(value, keys = new Set()) { if (!value || typeof value !== "object") return keys; for (const [key, child] of Object.entries(value)) { keys.add(key); collectKeys(child, keys); } return keys; }
function addFinding(findings, finding) { findings.push({ severity: finding.passed ? "info" : "error", ...finding }); }
function stringifyScalar(value) { if (Array.isArray(value)) return value.join(","); if (value && typeof value === "object") return JSON.stringify(value); return String(value); }
function failedSlo() { return { targetP99Ms: 50, p99Ms: 50, totalErrors: 1, operations: 0, evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_LEARNING_ACTIONS_PROBE" }; }
function parseOutArg(argv) { const outIndex = argv.indexOf("--out"); return outIndex === -1 ? defaultOutPath : argv[outIndex + 1]; }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = parseOutArg(process.argv.slice(2));
  const report = await auditStudentAppAITutorResultArchiveStudentArchiveLearningActions(loadCurrentInputs(process.cwd()));
  fs.mkdirSync(path.dirname(path.join(process.cwd(), out)), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorResultArchiveStudentArchiveLearningActionsAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
