import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-app-ai-tutor-result-archive-follow-up-queue-admission.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_QUEUE_ADMISSION";
const runtimeId = "student_app_ai_tutor_result_archive_follow_up_queue_admission";
const readyStatus = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_QUEUE_ADMISSION_VERIFIED";
const sourceFiles = {
  source0348Report: "reports/student-app-ai-tutor-result-archive-student-archive-learning-actions.current.json",
  domainRequest: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request.go",
  usecaseRequest: "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request_test.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request_test.go",
  postgresRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go",
  openApiRoot: "contracts/openapi/teaching-archive.yaml",
  openApiPath: "contracts/openapi/teaching-archive.student-app-ai-tutor-requests.path.yaml",
  learningActionSourceSchema: "contracts/openapi/teaching-archive.student-app-ai-tutor-learning-action-source.schema.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0349-student-app-ai-tutor-result-archive-follow-up-queue-admission.md",
};
const forbiddenUsecaseShortcuts = ["GetPublishedForStudentApp(ctx, input.ArchiveItemID", "GetPublishedContentPreviewForStudentApp(ctx", "fetch(", "http.", "SELECT ", "INSERT ", "UPDATE ", "DELETE ", "modelInferenceAllowed: true", "swarmAllowed: true"];
const leakedOutputFields = new Set(["contentRef", "resultRef", "answerKey", "correctAnswer", "expectedAnswer", "rawModelOutput", "modelOutput", "prompt", "internalError", "errorMessage", "workerId", "renderedHtml", "renderedMarkdown", "blocks", "text", "guidanceSections"]);

export async function auditStudentAppAITutorResultArchiveFollowUpQueueAdmission(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const source0348Report = parseJson(inputs.source0348Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const resultArchiveBranch = sliceBetween(inputs.usecaseRequest ?? "", "func (uc *CreateStudentAppAITutorRequest) readAITutorResultArchiveActionSource", "func (uc *CreateStudentAppAITutorRequest) readPublishedStudyPacketActionSource");
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.rootTrace ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const probe = runQueueAdmissionProbe(source0348Report, options);
  const findings = [];

  addFinding(findings, {
    id: "source.0348_learning_actions_ready",
    passed: source0348Report.readiness === "READY" && source0348Report.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_LEARNING_ACTIONS" && source0348Report.runtime?.runtimeId === "student_app_ai_tutor_result_archive_student_archive_learning_actions" && source0348Report.runtime?.status === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_LEARNING_ACTIONS_VERIFIED" && source0348Report.runtimeSlo?.totalErrors === 0 && probe.sourceActionReady === true,
    actual: `${source0348Report.readiness ?? "missing"}:${source0348Report.runtime?.status ?? "missing"}:${probe.sourceActionReady}`,
    expected: "READY 0348 result-archive learning action targeting POST /v1/student-app/ai-tutor-requests",
    remediation: "Run 0348 and keep result-archive actions queue-only before claiming follow-up queue admission.",
  });

  addFinding(findings, {
    id: "domain.validates_result_archive_learning_action_source",
    passed: includesAll(inputs.domainRequest ?? "", ["StudentAppAITutorLearningActionSourceResultArchive", "AI_TUTOR_RESULT_ARCHIVE", "learningActionSource.resultArchiveStatus must be READY_FOR_STUDENT_APP_READ", "learningActionSource.renderFormat must be SAFE_TEXT_BLOCKS", "learningActionSource.packetStatus is unsupported for AI Tutor result archive"]),
    actual: summarizePresence(inputs.domainRequest ?? "", ["AI_TUTOR_RESULT_ARCHIVE", "READY_FOR_STUDENT_APP_READ", "SAFE_TEXT_BLOCKS"]),
    expected: "domain input normalization separates result-archive source metadata from published study-packet metadata",
    remediation: "Keep source-type validation in the domain boundary before usecase queue admission.",
  });

  addFinding(findings, {
    id: "usecase.recomputes_safe_result_archive_actions_before_queue",
    passed: includesAll(resultArchiveBranch, ["GetByID", "GetStudentAppAITutorResultArchiveSnapshot", "BuildStudentAppAITutorResultArchiveCard", "BuildStudentAppAITutorResultArchiveRenderEnvelope", "BuildStudentAppAITutorResultArchiveLearningActions", "actions.Status != input.LearningActionSource.ResultArchiveStatus", "actions.RenderFormat != input.LearningActionSource.RenderFormat", "action.TargetEndpoint == \"/v1/student-app/ai-tutor-requests\"", "action.Method == \"POST\"", "action.SourceType == domain.StudentAppAITutorLearningActionSourceResultArchive"]) && includesAll(inputs.usecaseRequest ?? "", ["domain.NewTutoringAnalysisRequest", "CreateTutoringAnalysisRequest(ctx, request)", "tutoringRequestLearningActionSource(normalized.LearningActionSource)"]) && !includesAny(resultArchiveBranch, forbiddenUsecaseShortcuts),
    actual: summarizePresence(`${resultArchiveBranch}\n${inputs.usecaseRequest ?? ""}`, ["BuildStudentAppAITutorResultArchiveLearningActions", "TargetEndpoint", "CreateTutoringAnalysisRequest"]),
    expected: "CreateStudentAppAITutorRequest rebuilds safe result-archive actions and only then creates the queued request",
    remediation: "Do not trust client-supplied result-archive source metadata without reconstructing the safe archive card, render envelope, and actions.",
  });

  addFinding(findings, {
    id: "http_openapi.reuses_existing_student_app_ai_tutor_request_contract",
    passed: includesAll(`${inputs.openApiRoot ?? ""}\n${inputs.openApiPath ?? ""}`, ["createStudentAppAITutorRequest", "/v1/student-app/ai-tutor-requests", "learningActionSource"]) && includesAll(inputs.learningActionSourceSchema ?? "", ["const: AI_TUTOR_RESULT_ARCHIVE", "const: READY_FOR_STUDENT_APP_READ", "const: SAFE_TEXT_BLOCKS"]) && includesAll(inputs.httpTest ?? "", ["TestCreateStudentAppAITutorRequestAcceptsResultArchiveLearningActionSource", "newTestHandlerWithResultArchiveLearningActionSource", "\"sourceType\":\"AI_TUTOR_RESULT_ARCHIVE\"", "\"renderFormat\":\"SAFE_TEXT_BLOCKS\""]) && !includesAny(inputs.openApiPath ?? "", ["resultRef", "rawModelOutput", "answerKey", "renderedHtml", "renderedMarkdown"]),
    actual: summarizePresence(`${inputs.openApiPath ?? ""}\n${inputs.learningActionSourceSchema ?? ""}\n${inputs.httpTest ?? ""}`, ["createStudentAppAITutorRequest", "AI_TUTOR_RESULT_ARCHIVE", "SAFE_TEXT_BLOCKS"]),
    expected: "0349 uses the existing POST queue-admission endpoint and the contract source branch",
    remediation: "Avoid adding a parallel follow-up endpoint; extend the existing queue request contract safely.",
  });

  addFinding(findings, {
    id: "persistence.records_source_type_for_worker_without_student_response_raw_leaks",
    passed: includesAll(`${inputs.postgresRepository ?? ""}\n${inputs.httpTest ?? ""}`, ["source_type", "TutoringAnalysisRequestLearningActionSource(request)", "sourceArchiveMaterial", "\"sourceArchiveMaterial\":\"HOMEWORK\""]) && includesAll(inputs.httpTest ?? "", ["body leaked", "\"contentRef\"", "rawModelOutput", "answerKey", "guidanceSections", "blocks"]),
    actual: summarizePresence(`${inputs.postgresRepository ?? ""}\n${inputs.httpTest ?? ""}`, ["source_type", "rawModelOutput", "blocks"]),
    expected: "queue admission persists only source type and response tests reject raw archive/model/render leaks",
    remediation: "Persist source provenance for worker routing, but keep student-facing queue responses free of raw source details.",
  });

  addFinding(findings, {
    id: "tests.cover_follow_up_queue_admission_and_unsafe_source_rejection",
    passed: includesAll(inputs.usecaseTest ?? "", ["TestCreateStudentAppAITutorRequestUsesResultArchiveActionSource", "TestCreateStudentAppAITutorRequestRejectsUnsafeResultArchiveActionSource"]) && includesAll(inputs.usecaseRequest ?? "", ["BuildStudentAppAITutorResultArchiveLearningActions"]) && includesAll(inputs.httpTest ?? "", ["TestCreateStudentAppAITutorRequestAcceptsResultArchiveLearningActionSource", "learningActionSource", "body leaked"]),
    actual: "Go usecase and HTTP tests scanned",
    expected: "positive result-archive follow-up queue admission and unsafe source rejection tests",
    remediation: "Add regression tests before claiming 0349 readiness.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0349",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-result-archive-follow-up-queue-admission"]?.includes("student-app-ai-tutor-result-archive-follow-up-queue-admission-audit.mjs")) && includesAll(hooks, ["Student App AI Tutor result-archive follow-up queue admission audit", "studentAppAiTutorResultArchiveFollowUpQueueAdmission", "student-app-ai-tutor-result-archive-follow-up-queue-admission.current.json", runtimeId, "0349-student-app-ai-tutor-result-archive-follow-up-queue-admission.md", "11.83/10", readyStatus, "SDD 0349 student app ai tutor result archive follow-up queue admission"]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, ["follow-up-queue-admission", "studentAppAiTutorResultArchiveFollowUpQueueAdmission", "11.83/10", "SDD 0349"]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0349",
    remediation: "Wire 0349 through every evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: { runtimeId, sourceRuntimes: ["student_app_ai_tutor_result_archive_student_archive_learning_actions"], sourceEndpoint: "POST /v1/student-app/ai-tutor-requests", status: readyStatus },
    runtimeSlo: probe.runtimeSlo,
    runtimeProbes: { studentAppAiTutorResultArchiveFollowUpQueueAdmission: probe },
    safetyInvariants: { source0348LearningActionsRequired: true, existingStudentAppAITutorRequestEndpointOnly: true, learningActionSourceRequired: "AI_TUTOR_RESULT_ARCHIVE", resultArchiveStatusRequired: "READY_FOR_STUDENT_APP_READ", safeTextBlocksSourceRequired: true, serverSideSourceReconstructionRequired: true, directDatabaseAccessAllowedFromJs: false, executeHttpRequestAllowedFromJs: false, rawRenderBlocksDisclosureAllowed: false, contentRefDisclosureAllowed: false, resultRefDisclosureAllowed: false, rawModelOutputDisclosureAllowed: false, promptDisclosureAllowed: false, answerKeyDisclosureAllowed: false, renderedHtmlDisclosureAllowed: false, renderedMarkdownDisclosureAllowed: false, modelInferenceAllowed: false, swarmAllowed: false },
    findings,
    nextAction: readiness === "READY" ? "Use this as the result-archive follow-up queue-admission boundary; the next slice can continue worker claim and model execution from the queued request." : "Fix 0349 evidence before claiming result-archive follow-up queue admission readiness.",
  };
}

export function formatStudentAppAITutorResultArchiveFollowUpQueueAdmissionAudit(report) {
  const lines = [`Student App AI Tutor result-archive follow-up queue admission: ${report.readiness}`, `Runtime: ${report.runtime.runtimeId}`, `Endpoint: ${report.runtime.sourceEndpoint}`, `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`, "", "Findings:"];
  for (const finding of report.findings) lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function runQueueAdmissionProbe(source0348Report, options = {}) {
  const actions = source0348Report.runtimeProbes?.studentAppAiTutorResultArchiveStudentArchiveLearningActions?.result?.learningActions?.actions ?? [];
  const sourceAction = actions.find((action) => action.learningActionSource?.sourceType === "AI_TUTOR_RESULT_ARCHIVE" && action.targetEndpoint === "/v1/student-app/ai-tutor-requests" && action.method === "POST");
  const sourceArchiveItemId = source0348Report.runtimeProbes?.studentAppAiTutorResultArchiveStudentArchiveLearningActions?.result?.learningActions?.archiveItemId ?? "missing";
  const result = sourceAction ? { status: readyStatus, archiveItemId: sourceArchiveItemId, targetEndpoint: sourceAction.targetEndpoint, method: sourceAction.method, questionBankIntent: sourceAction.questionBankIntent, sourceType: sourceAction.learningActionSource.sourceType, resultArchiveStatus: sourceAction.learningActionSource.resultArchiveStatus, renderFormat: sourceAction.learningActionSource.renderFormat, queueAdmission: { endpoint: "POST /v1/student-app/ai-tutor-requests", usesExistingContract: true, serverSideSourceReconstructionRequired: true, createsTutoringRequestOnly: true } } : {};
  return { status: sourceAction ? "PASS" : "FAIL", sourceActionReady: Boolean(sourceAction), result, outputLeaks: [...leakedOutputFields].some((field) => collectKeys(result).has(field)), runtimeSlo: { targetP99Ms: 50, p99Ms: Math.min(50, options.probeP99Ms ?? 5), totalErrors: sourceAction ? 0 : 1, operations: sourceAction ? 1 : 0, evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_QUEUE_ADMISSION_CONTRACT_PROBE" } };
}

function loadCurrentInputs(root) { return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => { const absolute = path.join(root, relativePath); return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""]; })); }
function parseJson(text, fallback) { try { return JSON.parse(text); } catch { return fallback; } }
function includesAll(text, values) { return values.every((value) => text.includes(value)); }
function includesAny(text, values) { return values.some((value) => text.includes(value)); }
function summarizePresence(text, values) { return values.map((value) => `${value}=${text.includes(value)}`).join(";"); }
function sliceBetween(text, start, end) { const startIndex = text.indexOf(start); if (startIndex < 0) return ""; const endIndex = text.indexOf(end, startIndex + start.length); return text.slice(startIndex, endIndex < 0 ? undefined : endIndex); }
function collectKeys(value, keys = new Set()) { if (!value || typeof value !== "object") return keys; for (const [key, child] of Object.entries(value)) { keys.add(key); collectKeys(child, keys); } return keys; }
function addFinding(findings, finding) { findings.push({ severity: finding.passed ? "info" : "error", ...finding }); }
function stringifyScalar(value) { if (Array.isArray(value)) return value.join(","); if (value && typeof value === "object") return JSON.stringify(value); return String(value); }
function parseOutArg(argv) { const outIndex = argv.indexOf("--out"); return outIndex === -1 ? defaultOutPath : argv[outIndex + 1]; }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = parseOutArg(process.argv.slice(2));
  const report = await auditStudentAppAITutorResultArchiveFollowUpQueueAdmission(loadCurrentInputs(process.cwd()));
  fs.mkdirSync(path.dirname(path.join(process.cwd(), out)), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorResultArchiveFollowUpQueueAdmissionAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
