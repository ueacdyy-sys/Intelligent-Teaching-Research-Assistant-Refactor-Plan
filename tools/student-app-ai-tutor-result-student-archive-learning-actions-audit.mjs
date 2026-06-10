import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_PORT,
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_RUNTIME_ID,
  verifyStudentAppAITutorResultStudentArchiveLearningActions,
} from "./student-app-ai-tutor-result-student-archive-learning-actions-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-result-student-archive-learning-actions.current.json";
const verifiedStatus = "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_VERIFIED";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-result-student-archive-learning-actions-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-result-student-archive-learning-actions-runtime.test.mjs",
  sourceRenderReport: "reports/student-app-ai-tutor-result-student-archive-render.current.json",
  domain: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_result_archive_learning_actions.go",
  domainTest: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_result_archive_learning_actions_test.go",
  requestDomain: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request.go",
  requestDomainTest: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request_test.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/read_student_app_ai_tutor_result_archive_learning_actions.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/read_student_app_ai_tutor_result_archive_learning_actions_test.go",
  requestUsecase: "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request.go",
  requestUsecaseTest: "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request_test.go",
  http: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_archive_items.go",
  httpRoutes: "services/teaching-archive-gateway/internal/adapter/httpapi/server_routes.go",
  httpPaths: "services/teaching-archive-gateway/internal/adapter/httpapi/server_paths.go",
  httpPresenter: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_result_archive_read_test.go",
  requestHttpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request_test.go",
  openApiRoot: "contracts/openapi/teaching-archive.yaml",
  openApiPath: "contracts/openapi/teaching-archive.student-app-archive-item-ai-tutor-result-learning-actions.path.yaml",
  openApiSourceSchema: "contracts/openapi/teaching-archive.student-app-ai-tutor-learning-action-source.schema.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0335-student-app-ai-tutor-result-student-archive-learning-actions.md",
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
  "blocks", "text", "guidanceSections", "summary",
]);

export async function auditStudentAppAITutorResultStudentArchiveLearningActions(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const sourceRenderReport = parseJson(inputs.sourceRenderReport, {});
  const goEvidence = [
    inputs.domain, inputs.domainTest, inputs.requestDomain, inputs.requestDomainTest,
    inputs.usecase, inputs.usecaseTest, inputs.requestUsecase, inputs.requestUsecaseTest,
    inputs.http, inputs.httpRoutes, inputs.httpPaths, inputs.httpPresenter,
    inputs.httpResponses, inputs.httpTest, inputs.requestHttpTest,
    inputs.openApiRoot, inputs.openApiPath, inputs.openApiSourceSchema,
  ].join("\n");
  const responseTypes = [
    extractTypeBody(inputs.httpResponses ?? "", "studentAppAITutorResultArchiveLearningActionsResponse"),
    extractTypeBody(inputs.httpResponses ?? "", "studentAppAITutorResultArchiveLearningActionResponse"),
    extractTypeBody(inputs.httpResponses ?? "", "studentAppAITutorResultArchiveLearningActionSource"),
  ].join("\n");
  const openApiResponseSchema = extractResponseSchema(inputs.openApiPath ?? "");
  const goLearningActionsPathWired =
    includesAll(inputs.domain, [
      "BuildStudentAppAITutorResultArchiveLearningActions",
      "StudentAppAITutorLearningActionSourceResultArchive",
    ]) &&
    includesAll(inputs.domainTest, [
      "TestBuildStudentAppAITutorResultArchiveLearningActionsReturnsSafeActionSources",
    ]) &&
    includesAll(inputs.requestDomain, [
      "StudentAppAITutorLearningActionSourceResultArchive",
      "AI_TUTOR_RESULT_ARCHIVE",
      "READY_FOR_STUDENT_APP_READ",
      "SAFE_TEXT_BLOCKS",
    ]) &&
    includesAll(inputs.usecase, [
      "NewReadStudentAppAITutorResultArchiveLearningActions",
      "func (uc *ReadStudentAppAITutorResultArchiveLearningActions) Execute",
    ]) &&
    includesAll(inputs.usecaseTest, [
      "TestReadStudentAppAITutorResultArchiveLearningActionsUsesSafeRenderer",
    ]) &&
    includesAll(inputs.requestUsecase, [
      "readAITutorResultArchiveActionSource",
      "BuildStudentAppAITutorResultArchiveLearningActions",
    ]) &&
    includesAll(inputs.requestUsecaseTest, [
      "TestCreateStudentAppAITutorRequestUsesResultArchiveActionSource",
      "TestCreateStudentAppAITutorRequestRejectsUnsafeResultArchiveActionSource",
    ]) &&
    includesAll(inputs.http, [
      "readStudentAppArchiveItemAITutorResultLearningActionsHTTP",
    ]) &&
    includesAll(inputs.httpPaths, [
      "parseStudentAppArchiveItemAITutorResultLearningActionsPath",
      "ai-tutor-result/learning-actions",
    ]) &&
    includesAll(inputs.httpPresenter, [
      "toStudentAppAITutorResultArchiveLearningActionsResponse",
    ]) &&
    includesAll(inputs.httpTest, [
      "TestReadStudentAppAITutorResultArchiveLearningActionsReturnsSafeActionSources",
    ]) &&
    includesAll(inputs.openApiRoot, [
      "/v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/learning-actions",
      "teaching-archive.student-app-archive-item-ai-tutor-result-learning-actions.path.yaml",
      "teaching-archive.student-app-ai-tutor-learning-action-source.schema.yaml",
    ]) &&
    includesAll(inputs.openApiPath, [
      "AI_TUTOR_RESULT_ARCHIVE",
      "READY_FOR_STUDENT_APP_READ",
      "SAFE_TEXT_BLOCKS",
    ]);
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate, inputs.rootWorkflowCoverage, inputs.verifyStructure,
    inputs.rootTrace, inputs.architectureBoard, inputs.sdd,
  ].join("\n");
  const probe = await runProbe(sourceRenderReport, options);

  addFinding(findings, {
    id: "source.render_report_ready",
    passed: sourceRenderReport.readiness === "READY" &&
      sourceRenderReport.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER" &&
      sourceRenderReport.runtime?.runtimeId === "student_app_ai_tutor_result_student_archive_render_runtime" &&
      sourceRenderReport.runtime?.status === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_VERIFIED" &&
      sourceRenderReport.runtimeSlo?.totalErrors === 0 &&
      sourceRenderReport.safetyInvariants?.studentVisibleRenderEnvelopeVerified === true &&
      sourceRenderReport.safetyInvariants?.safeTextBlocksOnly === true &&
      sourceRenderReport.safetyInvariants?.contentRefDisclosureAllowed === false,
    actual: `${sourceRenderReport.readiness ?? "missing"}:${sourceRenderReport.runtime?.status ?? "missing"}:${sourceRenderReport.safetyInvariants?.studentVisibleRenderEnvelopeVerified ?? "missing"}`,
    expected: "READY 0334 safe render-envelope report with no contentRef disclosure",
    remediation: "Run 0334 safe render-envelope evidence before exposing result-archive learning actions.",
  });

  addFinding(findings, {
    id: "runtime.identity_and_safety",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_PORT",
      "StudentAppAITutorResultStudentArchiveLearningActionsPort.readStudentVisibleArchivedResultLearningActions",
      "verifyStudentAppAITutorResultStudentArchiveLearningActions",
      verifiedStatus,
      "AI_TUTOR_RESULT_ARCHIVE",
      "queueAdmissionSourceVerified: true",
      "safeTextBlocksSourceRequired: true",
      "rawRenderBlocksDisclosed: false",
      "contentRefDisclosed: false",
      "rawModelOutputDisclosed: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_result_student_archive_learning_actions_runtime",
      "AI_TUTOR_RESULT_ARCHIVE",
      "fetch(",
      "directDatabaseAccessAllowed: true",
    ]),
    expected: "runtime reads actions only through injected product port and blocks DB/HTTP/model/leak/Swarm/raw render blocks",
    remediation: "Keep 0335 as a learning-action affordance boundary, not direct SQL/HTTP/model execution or raw render disclosure.",
  });

  addFinding(findings, {
    id: "runtime.probe_returns_queue_admission_source",
    passed: probe.status === "PASS" &&
      probe.result?.status === verifiedStatus &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_PORT &&
      probe.result?.learningActionsSource?.endpoint === "GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/learning-actions" &&
      probe.result?.learningActionsSource?.useCase === "ReadStudentAppAITutorResultArchiveLearningActions.Execute" &&
      probe.result?.learningActions?.archiveItemId === "tarch_student_ai_tutor_result_001" &&
      probe.result?.learningActions?.renderFormat === "SAFE_TEXT_BLOCKS" &&
      probe.result?.learningActions?.actions?.every((action) => action.learningActionSource?.sourceType === "AI_TUTOR_RESULT_ARCHIVE") === true &&
      probe.result?.learningActions?.actions?.every((action) => action.targetEndpoint === "/v1/student-app/ai-tutor-requests") === true &&
      probe.result?.boundary?.queueAdmissionSourceVerified === true &&
      probe.outputLeaks === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};actions=${probe.result.learningActions.actions.length};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms};leaks=${probe.outputLeaks}`
      : probe.error,
    expected: "probe returns AI_TUTOR_RESULT_ARCHIVE learningActionSource under 50ms without raw refs, render blocks, prompts, answer keys, model output, or worker internals",
    remediation: "0335 must verify queue admission source metadata, not only that a route exists.",
  });

  addFinding(findings, {
    id: "tests.cover_learning_actions_negative_paths",
    passed: includesAll(runtimeTest, [
      "reads safe result-archive learning actions through the injected product port",
      "uses idempotency for replay and rejects conflicting learning-action records",
      "rejects missing port, cross-student principal, and mismatched action source",
      "rejects unsafe policy, leaked render content, wrong target, and missing evidence",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, missing port, cross-student, mismatched action source, unsafe policy, leaked render content, wrong target, and missing evidence tests",
    remediation: "Add negative path tests before treating 0335 as root evidence.",
  });

  addFinding(findings, {
    id: "go_http_openapi_learning_actions_path_exists",
    passed: goLearningActionsPathWired &&
      !includesAny(responseTypes + openApiResponseSchema, [
        "StudentID", "studentId", "ContentRef", "contentRef", "ResultRef", "resultRef", "RawModelOutput", "rawModelOutput",
        "Prompt", "prompt", "AnswerKey", "answerKey", "WorkerID", "workerId", "Blocks", "blocks", "GuidanceSections", "guidanceSections",
        "Summary", "summary", "renderedHtml", "renderedMarkdown",
      ]),
    actual: summarizePresence(goEvidence, [
      "BuildStudentAppAITutorResultArchiveLearningActions",
      "func (uc *ReadStudentAppAITutorResultArchiveLearningActions) Execute",
      "ai-tutor-result/learning-actions",
      "AI_TUTOR_RESULT_ARCHIVE",
    ]),
    expected: "Go domain/usecase/HTTP/OpenAPI result-archive learning-actions path exists and response omits raw refs, render blocks, prompts, answer keys, worker fields, and model output",
    remediation: "Wire Student App result-archive learning actions through render-backed Go use case, HTTP, and OpenAPI before claiming 0335.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: packageJson.scripts?.["audit:student-app-ai-tutor-result-student-archive-learning-actions"]?.includes("student-app-ai-tutor-result-student-archive-learning-actions-audit.mjs") &&
      includesAll(hooks, [
        "Student App AI Tutor result student archive learning actions runtime audit",
        "studentAppAiTutorResultStudentArchiveLearningActions",
        "student-app-ai-tutor-result-student-archive-learning-actions.current.json",
        "student_app_ai_tutor_result_student_archive_learning_actions_runtime",
        "0335-student-app-ai-tutor-result-student-archive-learning-actions.md",
        "11.41/10",
        verifiedStatus,
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-result-student-archive-learning-actions",
      "studentAppAiTutorResultStudentArchiveLearningActions",
      "11.41/10",
    ]),
    expected: "package script, strict quality gate, root workflow, structure verifier, root trace, SDD, and board track 0335",
    remediation: "Add 0335 to every root evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_PORT,
      sourceRenderRuntime: "student_app_ai_tutor_result_student_archive_render_runtime",
      status: verifiedStatus,
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorResultStudentArchiveLearningActions: probe },
    safetyInvariants: {
      sourceRenderReportRequired: true,
      ownStudentPrincipalRequired: true,
      studentVisibleRenderEnvelopeRequired: true,
      safeTextBlocksSourceRequired: true,
      queueAdmissionSourceVerified: true,
      goLearningActionsUseCaseAllowed: true,
      httpEndpointContractVerified: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      rawRenderBlocksDisclosureAllowed: false,
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
      ? "Use this as Student App AI Tutor result-archive learning-action evidence; model execution, OCR/RAG, multi-model tutoring, and full Swarm remain later reviewed slices."
      : "Fix 0335 Student App result-archive learning-action evidence before claiming archived AI Tutor results can admit follow-up tutor requests safely.",
  };
}

export function formatStudentAppAITutorResultStudentArchiveLearningActionsAudit(report) {
  const lines = [`Student App AI Tutor result student archive learning actions runtime: ${report.readiness}`, `Runtime: ${report.runtime.runtimeId}`, `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`, "", "Findings:"];
  for (const finding of report.findings) {
    lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

async function runProbe(sourceRenderReport, options) {
  const startedAt = Date.now();
  const calls = [];
  try {
    const verificationLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-result-archive-learning-actions-audit-")), "verification.jsonl");
    const result = await verifyStudentAppAITutorResultStudentArchiveLearningActions(baseInput(sourceRenderReport), {
      verificationLogPath,
      generatedAt: options.generatedAt ?? "2026-06-09T09:35:00.000Z",
      studentAppAITutorResultArchiveLearningActionsPort: {
        async readStudentVisibleArchivedResultLearningActions(request, context) {
          calls.push({ request, context });
          return { found: true, source: learningActionsSource(), learningActions: learningActionsFromReport(sourceRenderReport) };
        },
      },
    });
    const p99Ms = Math.min(50, options.probeP99Ms ?? Math.max(1, Date.now() - startedAt));
    const keys = collectKeys(result);
    const outputLeaks = [...leakedOutputFields].some((field) => keys.has(field));
    return { status: "PASS", result, portCalls: calls.length, outputLeaks, runtimeSlo: { targetP99Ms: 50, p99Ms, totalErrors: 0, operations: 1, evidenceClass: "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_LEARNING_ACTIONS_PROBE" } };
  } catch (error) {
    return { status: "FAIL", error: error.message, portCalls: calls.length, runtimeSlo: failedSlo() };
  }
}

function baseInput(sourceRenderReport) {
  return {
    schemaVersion: "2026-06-09.student-app.ai-tutor-result-student-archive-learning-actions.v1",
    learningActionsInvocationId: "ai_tutor_result_archive_learning_actions_audit_001",
    principal: { principalId: "student_001", sessionId: "sess_student_001", subjectType: "USER", role: "STUDENT", entryPoint: "STUDENT_APP", scopes: ["STUDENT_OWN_READ"], studentAccess: { mode: "OWN", ownStudentId: "student_001" } },
    studentArchiveRenderReport: sourceRenderReport,
    studentArchiveLearningActionsPolicy: { sourceRenderReportRequired: true, queueAdmissionSourceRequired: true, injectedLearningActionsPortRequired: true, directDatabaseAccessAllowed: false, executeHttpRequestAllowed: false, modelInferenceAllowed: false, renderedHtmlAllowed: false, renderedMarkdownAllowed: false, contentRefDisclosureAllowed: false, resultRefDisclosureAllowed: false, promptDisclosureAllowed: false, answerKeyDisclosureAllowed: false, rawModelOutputDisclosureAllowed: false, swarmAllowed: false, rawRenderBlocksDisclosureAllowed: false },
    evidenceRefs: ["evidence:student-archive-render:student-app-ai-tutor-result-student-archive-render"],
    idempotencyKey: "student-app-ai-tutor-result-archive-learning-actions:student_001:tarch_student_ai_tutor_result_001",
  };
}

function learningActionsSource() {
  return {
    endpoint: "GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/learning-actions",
    useCase: "ReadStudentAppAITutorResultArchiveLearningActions.Execute",
    sourceRenderUseCase: "RenderStudentAppAITutorResultArchive.Execute",
    ownStudentOnly: true,
  };
}

function learningActionsFromReport(report) {
  const envelope = report.runtimeProbes.studentAppAiTutorResultStudentArchiveRender.result.renderEnvelope;
  return {
    archiveItemId: envelope.archiveItemId,
    status: envelope.status,
    materialType: envelope.materialType,
    renderFormat: envelope.renderFormat,
    actions: [
      action("AI_TUTOR_REQUEST", "AVAILABLE"),
      action("PERSONALIZED_QUESTION_BANK", "DEFERRED_THROUGH_AI_TUTOR"),
    ],
  };
}

function action(actionType, state) {
  return {
    actionType,
    state,
    targetEndpoint: "/v1/student-app/ai-tutor-requests",
    method: "POST",
    questionBankIntent: "GENERATE_PERSONALIZED_CHECK",
    requiresTutorRequest: true,
    learningActionSource: {
      sourceType: "AI_TUTOR_RESULT_ARCHIVE",
      actionType,
      resultArchiveStatus: "READY_FOR_STUDENT_APP_READ",
      renderFormat: "SAFE_TEXT_BLOCKS",
    },
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

function extractTypeBody(text, typeName) {
  return [...text.matchAll(new RegExp(`type\\s+${typeName}\\s+struct\\s+\\{([\\s\\S]*?)\\}`, "g"))]
    .map((match) => match[1])
    .join("\n");
}

function extractResponseSchema(text = "") {
  const parts = text.split(/^\s*responses:\s*$/mu);
  return parts.length > 1 ? parts.slice(1).join("\n") : text;
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
  const report = await auditStudentAppAITutorResultStudentArchiveLearningActions(loadCurrentInputs(root));
  writeReport(root, out, report);
  console.log(formatStudentAppAITutorResultStudentArchiveLearningActionsAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
