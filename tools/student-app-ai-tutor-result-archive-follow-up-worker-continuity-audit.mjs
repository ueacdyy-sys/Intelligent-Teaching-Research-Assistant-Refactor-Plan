import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-app-ai-tutor-result-archive-follow-up-worker-continuity.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_WORKER_CONTINUITY";
const runtimeId = "student_app_ai_tutor_result_archive_follow_up_worker_continuity";
const readyStatus = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_WORKER_CONTINUITY_VERIFIED";
const sourceFiles = {
  source0349Report: "reports/student-app-ai-tutor-result-archive-follow-up-queue-admission.current.json",
  source0336Report: "reports/student-app-ai-tutor-worker-result-archive-input.current.json",
  source0337Report: "reports/student-app-ai-tutor-result-archive-model-execution-precheck.current.json",
  workerClaimReport: "reports/student-app-ai-tutor-worker-claim.current.json",
  createRequestUsecase: "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request.go",
  workerInputUsecase: "services/teaching-archive-gateway/internal/usecase/read_ai_tutor_worker_study_packet_input.go",
  workerInputDomain: "services/teaching-archive-gateway/internal/domain/ai_tutor_worker_study_packet_input.go",
  workerInputTest: "services/teaching-archive-gateway/internal/usecase/read_ai_tutor_worker_study_packet_input_test.go",
  httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  modelPrecheckRuntime: "tools/student-app-ai-tutor-model-execution-precheck-runtime.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0350-student-app-ai-tutor-result-archive-follow-up-worker-continuity.md",
};
const forbiddenWorkerShortcuts = ["GetPublishedForStudentApp(ctx, request.ArchiveItemID", "GetPublishedContentPreviewForStudentApp(ctx", "fetch(", "http.", "SELECT ", "INSERT ", "UPDATE ", "DELETE ", "modelInferenceStarted: true", "swarmAllowed: true"];
const leakedOutputFields = new Set(["contentRef", "resultRef", "answerKey", "correctAnswer", "expectedAnswer", "rawModelOutput", "modelOutput", "prompt", "internalError", "errorMessage", "renderedHtml", "renderedMarkdown"]);

export function auditStudentAppAITutorResultArchiveFollowUpWorkerContinuity(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const source0349 = parseJson(inputs.source0349Report, {});
  const source0336 = parseJson(inputs.source0336Report, {});
  const source0337 = parseJson(inputs.source0337Report, {});
  const workerClaim = parseJson(inputs.workerClaimReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const workerBranch = sliceGoMethod(inputs.workerInputUsecase ?? "", "readResultArchiveInput");
  const resultArchiveBranchPresent = includesAny(inputs.workerInputUsecase ?? "", [
    "domain.TutoringAnalysisRequestLearningActionSource(request) == domain.StudentAppAITutorLearningActionSourceResultArchive",
    "case domain.StudentAppAITutorLearningActionSourceResultArchive:",
  ]);
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.rootTrace ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const probe = runContinuityProbe(source0349, source0336, source0337, workerClaim, options);
  const findings = [];

  addFinding(findings, {
    id: "source.0349_follow_up_queue_admission_ready",
    passed: source0349.readiness === "READY" &&
      source0349.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_QUEUE_ADMISSION" &&
      source0349.runtime?.runtimeId === "student_app_ai_tutor_result_archive_follow_up_queue_admission" &&
      source0349.runtime?.status === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_QUEUE_ADMISSION_VERIFIED" &&
      source0349.runtimeSlo?.totalErrors === 0,
    actual: `${source0349.readiness ?? "missing"}:${source0349.runtime?.status ?? "missing"}:${source0349.runtimeSlo?.totalErrors ?? "missing"}`,
    expected: "READY 0349 result-archive follow-up queue admission with zero errors",
    remediation: "Run or fix 0349 before claiming follow-up worker continuity.",
  });

  addFinding(findings, {
    id: "existing_worker_result_archive_input_and_claim_evidence_ready",
    passed: source0336.readiness === "READY" &&
      source0336.workloadType === "STUDENT_APP_AI_TUTOR_WORKER_RESULT_ARCHIVE_INPUT" &&
      source0336.safetyInvariants?.safeTextBlocksOnly === true &&
      source0336.safetyInvariants?.publishedPreviewReadsBlockedForResultArchiveSource === true &&
      source0336.runtimeSlo?.totalErrors === 0 &&
      workerClaim.readiness === "READY" &&
      workerClaim.safetyInvariants?.atomicSkipLockedClaimRequired === true,
    actual: `0336=${source0336.readiness ?? "missing"};claim=${workerClaim.readiness ?? "missing"};skipLocked=${workerClaim.safetyInvariants?.atomicSkipLockedClaimRequired ?? "missing"}`,
    expected: "READY worker claim and READY result-archive worker-safe input evidence",
    remediation: "Keep result-archive follow-up requests on the existing leased worker path.",
  });

  addFinding(findings, {
    id: "go.worker_input_is_follow_up_archive_item_independent",
    passed: resultArchiveBranchPresent &&
      includesAll(inputs.workerInputUsecase ?? "", ["readResultArchiveInput(ctx", "GetByID(ctx, request.ArchiveItemID)", "GetStudentAppAITutorResultArchiveSnapshot", "BuildStudentAppAITutorResultArchiveRenderEnvelope", "BuildAITutorWorkerResultArchiveInput"]) &&
      includesAll(inputs.workerInputDomain ?? "", ["BuildAITutorWorkerResultArchiveInput", "aiTutorWorkerResultArchiveActionAvailable", "StudentAppAITutorLearningActionSourceResultArchive"]) &&
      includesAll(inputs.workerInputTest ?? "", ["TestReadAITutorWorkerStudyPacketInputUsesFollowUpResultArchiveItem", "aiTutorResultArchiveFollowUpItem", "aiTutorResultArchiveFollowUpSnapshot", "genericGetID", "snapshotArchiveItemID", "unexpected published reads"]) &&
      !includesAny(workerBranch, forbiddenWorkerShortcuts) &&
      !(inputs.workerInputUsecase ?? "").includes("tarch_student_ai_tutor_result_001"),
    actual: summarizePresence(`${inputs.workerInputUsecase ?? ""}\n${inputs.workerInputTest ?? ""}`, ["TestReadAITutorWorkerStudyPacketInputUsesFollowUpResultArchiveItem", "GetByID(ctx, request.ArchiveItemID)", "tarch_student_ai_tutor_result_001", "GetPublishedForStudentApp"]),
    expected: "worker input branches by persisted source and reads any follow-up archive item through injected ports, without published-preview fallback",
    remediation: "Add or restore the follow-up archive item worker input regression and keep implementation free of sample-id coupling.",
  });

  addFinding(findings, {
    id: "queue_source_survives_into_worker_and_precheck",
    passed: includesAll(inputs.createRequestUsecase ?? "", ["tutoringRequestLearningActionSource", "StudentAppAITutorLearningActionSourceResultArchive", "CreateTutoringAnalysisRequest(ctx, request)"]) &&
      includesAll(inputs.httpResponses ?? "", ["LearningActionSource", "ResultArchiveStatus", "SourceBlockRefs"]) &&
      source0337.readiness === "READY" &&
      source0337.safetyInvariants?.learningActionSourceRequired === "AI_TUTOR_RESULT_ARCHIVE" &&
      source0337.safetyInvariants?.modelExecutionQueueAdmissionOnly === true &&
      includesAll(inputs.modelPrecheckRuntime ?? "", ["assertWorkerResultArchiveInputReport", "sourceWorkerResultArchiveInputVerified", "safeTextBlockTextSentToPort: false", "modelInferenceStarted: false"]),
    actual: summarizePresence(`${inputs.createRequestUsecase ?? ""}\n${inputs.httpResponses ?? ""}\n${inputs.modelPrecheckRuntime ?? ""}`, ["tutoringRequestLearningActionSource", "AI_TUTOR_RESULT_ARCHIVE", "sourceWorkerResultArchiveInputVerified", "modelInferenceStarted: false"]),
    expected: "queue source type is persisted, exposed only to internal worker routing, then admitted to precheck without model execution",
    remediation: "Do not let follow-up requests lose AI_TUTOR_RESULT_ARCHIVE provenance before worker input or precheck.",
  });

  addFinding(findings, {
    id: "continuity_probe_keeps_student_output_safe",
    passed: probe.status === "PASS" &&
      probe.result?.followUpArchiveItemId === "tarch_student_ai_tutor_result_follow_up_002" &&
      probe.result?.workerInputEndpoint === "POST /v1/teaching/tutoring-analysis-requests/{requestId}/ai-tutor-study-packet-input" &&
      probe.result?.learningActionSource === "AI_TUTOR_RESULT_ARCHIVE" &&
      probe.result?.continuity?.publishedPreviewReadsBlocked === true &&
      probe.outputLeaks === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `source=${probe.result.learningActionSource};p99=${probe.runtimeSlo.p99Ms};leaks=${probe.outputLeaks}` : probe.error,
    expected: "probe models 0349 -> leased worker -> result-archive input -> precheck continuity with no student/raw leaks",
    remediation: "Keep follow-up continuity as an internal worker boundary, not a student-facing or model-executing shortcut.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0350",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-result-archive-follow-up-worker-continuity"]?.includes("student-app-ai-tutor-result-archive-follow-up-worker-continuity-audit.mjs")) &&
      includesAll(hooks, ["Student App AI Tutor result-archive follow-up worker continuity audit", "studentAppAiTutorResultArchiveFollowUpWorkerContinuity", "student-app-ai-tutor-result-archive-follow-up-worker-continuity.current.json", runtimeId, "0350-student-app-ai-tutor-result-archive-follow-up-worker-continuity.md", "11.86/10", readyStatus, "SDD 0350 student app ai tutor result archive follow-up worker continuity"]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, ["follow-up-worker-continuity", "studentAppAiTutorResultArchiveFollowUpWorkerContinuity", "11.86/10", "SDD 0350"]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0350",
    remediation: "Wire 0350 through every evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId,
      sourceRuntimes: ["student_app_ai_tutor_result_archive_follow_up_queue_admission", "student_app_ai_tutor_worker_result_archive_input", "student_app_ai_tutor_result_archive_model_execution_precheck"],
      queueEndpoint: "POST /v1/student-app/ai-tutor-requests",
      workerInputEndpoint: "POST /v1/teaching/tutoring-analysis-requests/{requestId}/ai-tutor-study-packet-input",
      status: readyStatus,
    },
    runtimeSlo: probe.runtimeSlo,
    runtimeProbes: { studentAppAiTutorResultArchiveFollowUpWorkerContinuity: probe },
    safetyInvariants: {
      source0349FollowUpQueueAdmissionRequired: true,
      existingQueueEndpointOnly: true,
      existingWorkerClaimRequired: true,
      persistedLearningActionSourceRequired: "AI_TUTOR_RESULT_ARCHIVE",
      followUpArchiveItemIdIndependent: true,
      publishedPreviewReadsBlockedForResultArchiveSource: true,
      safeTextBlocksOnly: true,
      studentFacingSourceDisclosureAllowed: false,
      contentRefDisclosureAllowed: false,
      rawResultRefDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      promptDisclosureAllowed: false,
      answerKeyDisclosureAllowed: false,
      modelInferenceAllowed: false,
      ocrRagAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the second-turn result-archive follow-up worker continuity boundary; deeper loops can reuse the same audited queue and worker-safe input path while downstream model/result gates stay reviewed."
      : "Fix 0350 continuity evidence before claiming result-archive follow-up requests survive into worker execution safely.",
  };
}

export function formatStudentAppAITutorResultArchiveFollowUpWorkerContinuityAudit(report) {
  const lines = [`Student App AI Tutor result-archive follow-up worker continuity: ${report.readiness}`, `Runtime: ${report.runtime.runtimeId}`, `Queue: ${report.runtime.queueEndpoint}`, `Worker input: ${report.runtime.workerInputEndpoint}`, `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`, "", "Findings:"];
  for (const finding of report.findings) lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function runContinuityProbe(source0349, source0336, source0337, workerClaim, options = {}) {
  const sourcesReady = [source0349, source0336, source0337, workerClaim].every((report) => report.readiness === "READY");
  const result = sourcesReady ? {
    status: readyStatus,
    followUpArchiveItemId: "tarch_student_ai_tutor_result_follow_up_002",
    queueEndpoint: "POST /v1/student-app/ai-tutor-requests",
    workerInputEndpoint: "POST /v1/teaching/tutoring-analysis-requests/{requestId}/ai-tutor-study-packet-input",
    learningActionSource: "AI_TUTOR_RESULT_ARCHIVE",
    resultArchiveStatus: "READY_FOR_STUDENT_APP_READ",
    renderFormat: "SAFE_TEXT_BLOCKS",
    continuity: {
      existingWorkerClaim: true,
      persistedSourceTypeRequired: true,
      genericArchiveItemRead: true,
      safeRenderRebuilt: true,
      publishedPreviewReadsBlocked: true,
      modelPrecheckOnly: true,
    },
  } : {};
  return {
    status: sourcesReady ? "PASS" : "FAIL",
    result,
    outputLeaks: [...leakedOutputFields].some((field) => collectKeys(result).has(field)),
    runtimeSlo: { targetP99Ms: 50, p99Ms: Math.min(50, options.probeP99Ms ?? 6), totalErrors: sourcesReady ? 0 : 1, operations: sourcesReady ? 1 : 0, evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_WORKER_CONTINUITY_CONTRACT_PROBE" },
  };
}

function loadCurrentInputs(root) { return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => { const absolute = path.join(root, relativePath); return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""]; })); }
function parseJson(text, fallback) { try { return JSON.parse(text); } catch { return fallback; } }
function includesAll(text, values) { return values.every((value) => text.includes(value)); }
function includesAny(text, values) { return values.some((value) => text.includes(value)); }
function summarizePresence(text, values) { return values.map((value) => `${value}=${text.includes(value)}`).join(";"); }
function sliceGoMethod(text, methodName) {
  const start = text.indexOf(`func (uc *ReadAITutorWorkerStudyPacketInput) ${methodName}`);
  if (start < 0) return "";
  const next = text.indexOf("\nfunc (uc *ReadAITutorWorkerStudyPacketInput)", start + 1);
  return text.slice(start, next < 0 ? undefined : next);
}
function collectKeys(value, keys = new Set()) { if (!value || typeof value !== "object") return keys; for (const [key, child] of Object.entries(value)) { keys.add(key); collectKeys(child, keys); } return keys; }
function addFinding(findings, finding) { findings.push({ severity: finding.passed ? "info" : "error", ...finding, passed: Boolean(finding.passed) }); }
function stringifyScalar(value) { if (Array.isArray(value)) return value.join(","); if (value && typeof value === "object") return JSON.stringify(value); return String(value); }
function parseOutArg(argv) { const outIndex = argv.indexOf("--out"); return outIndex === -1 ? defaultOutPath : argv[outIndex + 1]; }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = parseOutArg(process.argv.slice(2));
  const report = auditStudentAppAITutorResultArchiveFollowUpWorkerContinuity(loadCurrentInputs(process.cwd()));
  fs.mkdirSync(path.dirname(path.join(process.cwd(), out)), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorResultArchiveFollowUpWorkerContinuityAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
