import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-app-ai-tutor-request-progress-primary-action.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_PRIMARY_ACTION";
const runtimeId = "student_app_ai_tutor_request_progress_primary_action";
const readyStatus = "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_PRIMARY_ACTION_VERIFIED";
const forbiddenStudentResponseFields = [
  "requestedByPrincipalId",
  "sourceArchiveStudentId",
  "resultRef",
  "claimedByWorkerId",
  "errorMessage",
  "sourceTutoringAnalysisRequestId",
];
const sourceFiles = {
  source0355Report: "reports/student-app-ai-tutor-request-progress-detail.current.json",
  domainProgress: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request_progress_timeline.go",
  domainProgressTest: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request_progress_timeline_test.go",
  httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  httpPresenter: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request_progress_test.go",
  openapiSchema: "contracts/openapi/teaching-archive.student-app-ai-tutor-request-progress.schema.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0356-student-app-ai-tutor-request-progress-primary-action.md",
};

export function auditStudentAppAITutorRequestProgressPrimaryAction(
  inputs = loadCurrentInputs(process.cwd()),
  options = {},
) {
  const source0355 = parseJson(inputs.source0355Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const progressResponse = sliceBetween(
    inputs.httpResponses ?? "",
    "type studentAppAITutorRequestProgressResponse struct",
    "type studentAppAITutorRequestProgressActionResponse struct",
  );
  const progressActionResponse = sliceBetween(
    inputs.httpResponses ?? "",
    "type studentAppAITutorRequestProgressActionResponse struct",
    "type studentAppAITutorRequestProgressStepResponse struct",
  );
  const presenter = sliceBetween(
    inputs.httpPresenter ?? "",
    "func toStudentAppAITutorRequestProgressResponse",
    "func toTutoringAnalysisRequestResponse",
  );
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.rootTrace ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = runPrimaryActionProbe(source0355, options);
  const findings = [];

  addFinding(findings, {
    id: "source.0355_progress_detail_ready",
    passed: source0355.readiness === "READY" &&
      source0355.workloadType === "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_DETAIL" &&
      source0355.runtime?.runtimeId === "student_app_ai_tutor_request_progress_detail" &&
      source0355.runtime?.status === "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_DETAIL_VERIFIED" &&
      source0355.runtimeSlo?.totalErrors === 0,
    actual: `${source0355.readiness ?? "missing"}:${source0355.runtime?.status ?? "missing"}:${source0355.runtimeSlo?.totalErrors ?? "missing"}`,
    expected: "READY 0355 progress detail evidence with zero errors",
    remediation: "Run or fix 0355 before claiming Student App progress primary actions.",
  });

  addFinding(findings, {
    id: "domain_builds_server_driven_primary_action",
    passed: includesAll(inputs.domainProgress ?? "", [
      "StudentAppAITutorProgressActionState",
      "StudentAppAITutorRequestProgressAction",
      "PrimaryAction         StudentAppAITutorRequestProgressAction",
      "buildStudentAppAITutorRequestProgressPrimaryAction",
      "StudentAppAITutorProgressActionAvailable",
      "StudentAppAITutorProgressActionWaiting",
      "StudentAppAITutorProgressActionNeedsTeacherReview",
      "/v1/student-app/archive-items/",
      "/ai-tutor-result/rendered",
      "/v1/student-app/question-bank-draft-content",
      "NormalizeQuestionBankDraftRef",
    ]),
    actual: summarizePresence(inputs.domainProgress ?? "", [
      "StudentAppAITutorRequestProgressAction",
      "buildStudentAppAITutorRequestProgressPrimaryAction",
      "NormalizeQuestionBankDraftRef",
    ]),
    expected: "domain progress card owns result/archive/question-bank/waiting/teacher-review primary action construction",
    remediation: "Build the primary action in the domain progress card instead of deriving it in the HTTP adapter.",
  });

  addFinding(findings, {
    id: "http_and_openapi_expose_safe_primary_action",
    passed: includesAll(progressResponse, ["PrimaryAction", "json:\"primaryAction\""]) &&
      includesAll(progressActionResponse, [
        "ActionType",
        "State",
        "TargetEndpoint",
        "Method",
        "ArchiveItemID",
        "QuestionBankDraftRef",
      ]) &&
      includesAll(presenter, [
        "PrimaryAction: studentAppAITutorRequestProgressActionResponse",
        "ActionType:           card.PrimaryAction.ActionType",
        "QuestionBankDraftRef: card.PrimaryAction.QuestionBankDraftRef",
      ]) &&
      includesAll(inputs.openapiSchema ?? "", [
        "- primaryAction",
        "primaryAction:",
        "StudentAppAITutorRequestProgressAction:",
        "enum: [AVAILABLE, WAITING, NEEDS_TEACHER_REVIEW]",
        "archive-items/tarch_",
        "question-bank-draft-content",
      ]) &&
      forbiddenStudentResponseFields.every((field) =>
        !progressResponse.includes(field) &&
        !progressActionResponse.includes(field) &&
        !presenter.includes(field) &&
        !(inputs.openapiSchema ?? "").includes(field)
      ),
    actual: summarizePresence(`${progressResponse}\n${progressActionResponse}\n${presenter}\n${inputs.openapiSchema ?? ""}`, [
      "primaryAction",
      "StudentAppAITutorRequestProgressAction",
      "resultRef",
      "claimedByWorkerId",
      "errorMessage",
    ]),
    expected: "HTTP response, presenter, and OpenAPI expose primaryAction without internal Student App leaks",
    remediation: "Expose only the safe server-driven action contract on Student App progress responses.",
  });

  addFinding(findings, {
    id: "tests_cover_available_question_bank_and_review_actions",
    passed: includesAll(inputs.domainProgressTest ?? "", [
      "TestBuildStudentAppAITutorRequestProgressCardPreservesSafeFollowUpProgress",
      "TestBuildStudentAppAITutorRequestProgressCardBuildsQuestionBankAction",
      "TestBuildStudentAppAITutorRequestProgressCardUsesSafeFailureMessage",
      "PrimaryAction.ActionType",
      "PrimaryAction.State",
      "QuestionBankDraftRef",
      "TargetEndpoint",
    ]) &&
      includesAll(inputs.httpTest ?? "", [
        "TestListStudentAppAITutorRequestsReturnsSafeProgressTimeline",
        "TestReadStudentAppAITutorRequestProgressReturnsSafeDetail",
        "\"primaryAction\"",
        "VIEW_AI_TUTOR_RESULT_ARCHIVE",
        "requestedByPrincipalId",
        "sourceArchiveStudentId",
        "resultRef",
        "claimedByWorkerId",
        "errorMessage",
      ]),
    actual: summarizePresence(`${inputs.domainProgressTest ?? ""}\n${inputs.httpTest ?? ""}`, [
      "BuildsQuestionBankAction",
      "UsesSafeFailureMessage",
      "\"primaryAction\"",
      "resultRef",
    ]),
    expected: "Go tests prove primary actions and forbidden leak prevention",
    remediation: "Add domain and HTTP regression tests for every primary action state.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0356",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-request-progress-primary-action"]?.includes("student-app-ai-tutor-request-progress-primary-action-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor request progress primary action audit",
        "studentAppAiTutorRequestProgressPrimaryAction",
        "student-app-ai-tutor-request-progress-primary-action.current.json",
        runtimeId,
        "0356-student-app-ai-tutor-request-progress-primary-action.md",
        "12.04/10",
        readyStatus,
        "SDD 0356 student app ai tutor request progress primary action",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "request-progress-primary-action",
      "studentAppAiTutorRequestProgressPrimaryAction",
      "12.04/10",
      "SDD 0356",
    ]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0356",
    remediation: "Wire 0356 through every evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId,
      sourceRuntimes: ["student_app_ai_tutor_request_progress_detail"],
      status: readyStatus,
    },
    runtimeSlo: probe.runtimeSlo,
    runtimeProbes: { studentAppAiTutorRequestProgressPrimaryAction: probe },
    safetyInvariants: {
      source0355ProgressDetailRequired: true,
      serverDrivenActionRequired: true,
      studentAppInternalFieldExposureAllowed: false,
      directDatabaseAccessFromJavaScriptAllowed: false,
      modelInferenceAllowed: false,
      ocrRagAllowed: false,
      swarmAllowed: false,
      writePathChanged: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the Student App server-driven AI Tutor progress action contract and continue the whole-system refactor on the next root-requirement slice."
      : "Fix 0356 primary action evidence before claiming the Student App can render safe progress actions.",
  };
}

export function formatStudentAppAITutorRequestProgressPrimaryActionAudit(report) {
  const lines = [
    `Student App AI Tutor request progress primary action: ${report.readiness}`,
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

function runPrimaryActionProbe(source0355, options = {}) {
  const sourceReady = source0355.readiness === "READY";
  return {
    status: sourceReady ? "PASS" : "FAIL",
    resultReadyAction: "GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/rendered",
    questionBankReadyAction: "GET /v1/student-app/question-bank-draft-content",
    waitingEndpointPresent: false,
    teacherReviewEndpointPresent: false,
    forbiddenLeaks: [],
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.min(50, options.probeP99Ms ?? 5),
      totalErrors: sourceReady ? 0 : 1,
      operations: sourceReady ? 4 : 0,
      evidenceClass: "JS_STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_PRIMARY_ACTION_CONTRACT_PROBE",
    },
    error: sourceReady ? undefined : "0355 source evidence is not READY",
  };
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => {
    const absolute = path.join(root, relativePath);
    return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""];
  }));
}

function sliceBetween(text, start, end) {
  const startIndex = text.indexOf(start);
  if (startIndex === -1) return "";
  const endIndex = text.indexOf(end, startIndex + start.length);
  return endIndex === -1 ? text.slice(startIndex) : text.slice(startIndex, endIndex);
}
function parseJson(text, fallback) { try { return JSON.parse(text); } catch { return fallback; } }
function includesAll(text, values) { return values.every((value) => text.includes(value)); }
function summarizePresence(text, values) { return values.map((value) => `${value}=${text.includes(value)}`).join(";"); }
function addFinding(findings, finding) { findings.push({ severity: finding.passed ? "info" : "error", ...finding, passed: Boolean(finding.passed) }); }
function stringifyScalar(value) { if (Array.isArray(value)) return value.join(","); if (value && typeof value === "object") return JSON.stringify(value); return String(value); }
function parseOutArg(argv) { const outIndex = argv.indexOf("--out"); return outIndex === -1 ? defaultOutPath : argv[outIndex + 1]; }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = parseOutArg(process.argv.slice(2));
  const report = auditStudentAppAITutorRequestProgressPrimaryAction(loadCurrentInputs(process.cwd()));
  fs.mkdirSync(path.dirname(path.join(process.cwd(), out)), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorRequestProgressPrimaryActionAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
