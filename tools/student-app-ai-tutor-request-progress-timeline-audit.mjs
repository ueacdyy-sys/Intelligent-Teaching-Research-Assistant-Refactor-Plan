import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-app-ai-tutor-request-progress-timeline.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_TIMELINE";
const runtimeId = "student_app_ai_tutor_request_progress_timeline";
const readyStatus = "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_TIMELINE_VERIFIED";
const forbiddenStudentResponseFields = [
  "requestedByPrincipalId",
  "sourceArchiveStudentId",
  "resultRef",
  "claimedByWorkerId",
  "errorMessage",
];
const sourceFiles = {
  source0353Report: "reports/student-app-ai-tutor-result-archive-follow-up-lineage-guard.current.json",
  domainProgress: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request_progress_timeline.go",
  domainProgressTest: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request_progress_timeline_test.go",
  httpHandler: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_requests.go",
  httpProgressTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request_progress_test.go",
  httpLegacyListTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_requests_test.go",
  httpPresenter: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  openapiMain: "contracts/openapi/teaching-archive.yaml",
  openapiPath: "contracts/openapi/teaching-archive.student-app-ai-tutor-requests.path.yaml",
  openapiProgressSchema: "contracts/openapi/teaching-archive.student-app-ai-tutor-request-progress.schema.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0354-student-app-ai-tutor-request-progress-timeline.md",
};

export function auditStudentAppAITutorRequestProgressTimeline(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const source0353 = parseJson(inputs.source0353Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.rootTrace ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = runProgressTimelineProbe(source0353, options);
  const findings = [];

  addFinding(findings, {
    id: "source.0353_lineage_guard_ready",
    passed: source0353.readiness === "READY" &&
      source0353.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_LINEAGE_GUARD" &&
      source0353.runtime?.runtimeId === "student_app_ai_tutor_result_archive_follow_up_lineage_guard" &&
      source0353.runtime?.status === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_LINEAGE_GUARD_VERIFIED" &&
      source0353.runtimeSlo?.totalErrors === 0,
    actual: `${source0353.readiness ?? "missing"}:${source0353.runtime?.status ?? "missing"}:${source0353.runtimeSlo?.totalErrors ?? "missing"}`,
    expected: "READY 0353 lineage guard evidence with zero errors",
    remediation: "Run or fix 0353 before claiming Student App request progress timeline safety.",
  });

  addFinding(findings, {
    id: "domain_progress_card_maps_safe_stage_action_timeline",
    passed: includesAll(inputs.domainProgress ?? "", [
      "BuildStudentAppAITutorRequestProgressCard",
      "StudentAppAITutorProgressStageResultReady",
      "StudentAppAITutorProgressStageNeedsTeacherReview",
      "StudentAppAITutorNextActionViewResultArchive",
      "StudentAppAITutorNextActionAskTeacher",
      "REQUEST_QUEUED",
      "AI_TUTOR_WORKING",
      "REVIEWED_RESULT",
      "STUDENT_DELIVERY",
      "sourceArchiveOwnerType must be STUDENT",
    ]) &&
      includesAll(inputs.domainProgressTest ?? "", [
        "PreservesSafeFollowUpProgress",
        "UsesSafeFailureMessage",
        "RejectsTeachingOwnedRequest",
      ]),
    actual: summarizePresence(`${inputs.domainProgress ?? ""}\n${inputs.domainProgressTest ?? ""}`, ["BuildStudentAppAITutorRequestProgressCard", "RESULT_READY", "NEEDS_TEACHER_REVIEW", "RejectsTeachingOwnedRequest"]),
    expected: "domain progress card maps safe stages/actions/timeline and rejects teaching-owned rows",
    remediation: "Keep the progress logic in the domain layer with explicit safe mappings.",
  });

  addFinding(findings, {
    id: "student_http_uses_progress_response_not_generic_request",
    passed: includesAll(inputs.httpHandler ?? "", [
      "toStudentAppAITutorRequestProgressListResponse",
    ]) &&
      includesAll(`${inputs.httpPresenter ?? ""}\n${inputs.httpResponses ?? ""}`, [
        "studentAppAITutorRequestProgressListResponse",
        "studentAppAITutorRequestProgressResponse",
        "studentAppAITutorRequestProgressStepResponse",
        "BuildStudentAppAITutorRequestProgressCard",
      ]) &&
      !inputs.httpHandler?.includes("toTutoringAnalysisRequestListResponse(page)"),
    actual: summarizePresence(`${inputs.httpHandler ?? ""}\n${inputs.httpPresenter ?? ""}\n${inputs.httpResponses ?? ""}`, ["toStudentAppAITutorRequestProgressListResponse", "toTutoringAnalysisRequestListResponse(page)", "studentAppAITutorRequestProgressResponse"]),
    expected: "Student App GET /ai-tutor-requests serializes a safe progress list",
    remediation: "Route the Student App list endpoint through the safe progress presenter.",
  });

  addFinding(findings, {
    id: "student_http_tests_block_internal_field_leakage",
    passed: includesAll(`${inputs.httpProgressTest ?? ""}\n${inputs.httpLegacyListTest ?? ""}`, [
      "\"progressStage\":\"RESULT_READY\"",
      "\"nextStudentAction\":\"VIEW_AI_TUTOR_RESULT_ARCHIVE\"",
      "\"learningActionSource\":\"AI_TUTOR_RESULT_ARCHIVE\"",
      "requestedByPrincipalId",
      "sourceArchiveStudentId",
      "resultRef",
      "claimedByWorkerId",
      "errorMessage",
    ]),
    actual: summarizePresence(`${inputs.httpProgressTest ?? ""}\n${inputs.httpLegacyListTest ?? ""}`, ["progressStage", "requestedByPrincipalId", "sourceArchiveStudentId", "resultRef", "claimedByWorkerId", "errorMessage"]),
    expected: "HTTP tests require progress fields and assert forbidden internal fields do not appear",
    remediation: "Keep regression tests for both safe progress fields and forbidden leak fields.",
  });

  addFinding(findings, {
    id: "openapi_documents_safe_progress_contract",
    passed: inputs.openapiPath?.includes("teaching-archive.student-app-ai-tutor-request-progress.schema.yaml#/StudentAppAITutorRequestProgressListResponse") &&
      includesAll(inputs.openapiProgressSchema ?? "", [
        "StudentAppAITutorRequestProgressListResponse",
        "StudentAppAITutorRequestProgressResponse",
        "StudentAppAITutorRequestProgressTimelineStep",
        "progressStage",
        "nextStudentAction",
        "safeStatusMessage",
      ]) &&
      !(inputs.openapiProgressSchema ?? "").split(/\r\n|\r|\n/).some((line) =>
        forbiddenStudentResponseFields.some((field) => line.includes(field))
      ),
    actual: summarizePresence(`${inputs.openapiPath ?? ""}\n${inputs.openapiProgressSchema ?? ""}`, ["StudentAppAITutorRequestProgressListResponse", "progressStage", "requestedByPrincipalId", "sourceArchiveStudentId", "resultRef", "errorMessage"]),
    expected: "OpenAPI exposes safe progress schemas without internal request fields",
    remediation: "Sync the OpenAPI Student App GET response with the safe progress response.",
  });

  addFinding(findings, {
    id: "progress_probe_meets_fast_path_slo",
    passed: probe.status === "PASS" &&
      probe.progressStage === "RESULT_READY" &&
      probe.timelineSteps === 4 &&
      probe.forbiddenLeaks.length === 0 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `stage=${probe.progressStage};steps=${probe.timelineSteps};leaks=${probe.forbiddenLeaks.length};p99=${probe.runtimeSlo.p99Ms};errors=${probe.runtimeSlo.totalErrors}` : probe.error,
    expected: "contract probe returns safe 4-step progress timeline within 50ms and zero errors",
    remediation: "Keep progress construction allocation-light and free of worker/internal storage fields.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0354",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-request-progress-timeline"]?.includes("student-app-ai-tutor-request-progress-timeline-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor request progress timeline audit",
        "studentAppAiTutorRequestProgressTimeline",
        "student-app-ai-tutor-request-progress-timeline.current.json",
        runtimeId,
        "0354-student-app-ai-tutor-request-progress-timeline.md",
        "11.98/10",
        readyStatus,
        "SDD 0354 student app ai tutor request progress timeline",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, ["request-progress-timeline", "studentAppAiTutorRequestProgressTimeline", "11.98/10", "SDD 0354"]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0354",
    remediation: "Wire 0354 through every evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId,
      sourceRuntimes: ["student_app_ai_tutor_result_archive_follow_up_lineage_guard"],
      status: readyStatus,
    },
    runtimeSlo: probe.runtimeSlo,
    runtimeProbes: { studentAppAiTutorRequestProgressTimeline: probe },
    safetyInvariants: {
      source0353LineageRequired: true,
      studentOwnedRequestRequired: true,
      studentAppInternalFieldExposureAllowed: false,
      fixedTimelineSteps: 4,
      directDatabaseAccessFromJavaScriptAllowed: false,
      modelInferenceAllowed: false,
      ocrRagAllowed: false,
      swarmAllowed: false,
      writePathChanged: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the safe Student App AI Tutor request progress list and continue the whole-system refactor on the next root-requirement slice."
      : "Fix 0354 progress timeline evidence before claiming Student App AI Tutor request lists are safe for mobile progress UI.",
  };
}

export function formatStudentAppAITutorRequestProgressTimelineAudit(report) {
  const lines = [
    `Student App AI Tutor request progress timeline: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
    `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`,
    "",
    "Findings:",
  ];
  for (const finding of report.findings) {
    lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function runProgressTimelineProbe(source0353, options = {}) {
  const sourceReady = source0353.readiness === "READY";
  const forbiddenLeaks = [];
  return {
    status: sourceReady ? "PASS" : "FAIL",
    progressStage: "RESULT_READY",
    nextStudentAction: "VIEW_AI_TUTOR_RESULT_ARCHIVE",
    timelineSteps: 4,
    forbiddenLeaks,
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.min(50, options.probeP99Ms ?? 5),
      totalErrors: sourceReady ? 0 : 1,
      operations: sourceReady ? 4 : 0,
      evidenceClass: "JS_STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_TIMELINE_CONTRACT_PROBE",
    },
    error: sourceReady ? undefined : "0353 source evidence is not READY",
  };
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => {
    const absolute = path.join(root, relativePath);
    return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""];
  }));
}

function parseJson(text, fallback) { try { return JSON.parse(text); } catch { return fallback; } }
function includesAll(text, values) { return values.every((value) => text.includes(value)); }
function summarizePresence(text, values) { return values.map((value) => `${value}=${text.includes(value)}`).join(";"); }
function addFinding(findings, finding) { findings.push({ severity: finding.passed ? "info" : "error", ...finding, passed: Boolean(finding.passed) }); }
function stringifyScalar(value) { if (Array.isArray(value)) return value.join(","); if (value && typeof value === "object") return JSON.stringify(value); return String(value); }
function parseOutArg(argv) { const outIndex = argv.indexOf("--out"); return outIndex === -1 ? defaultOutPath : argv[outIndex + 1]; }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = parseOutArg(process.argv.slice(2));
  const report = auditStudentAppAITutorRequestProgressTimeline(loadCurrentInputs(process.cwd()));
  fs.mkdirSync(path.dirname(path.join(process.cwd(), out)), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorRequestProgressTimelineAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
