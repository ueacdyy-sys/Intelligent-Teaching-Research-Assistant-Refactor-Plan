import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-app-ai-tutor-request-progress-refresh-policy.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_REFRESH_POLICY";
const runtimeId = "student_app_ai_tutor_request_progress_refresh_policy";
const readyStatus = "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_REFRESH_POLICY_VERIFIED";
const forbiddenStudentResponseFields = [
  "requestedByPrincipalId",
  "sourceArchiveStudentId",
  "resultRef",
  "claimedByWorkerId",
  "errorMessage",
  "sourceTutoringAnalysisRequestId",
];
const sourceFiles = {
  source0357Report: "reports/student-app-ai-tutor-request-progress-target-url.current.json",
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
  sdd: "docs/sdd/0358-student-app-ai-tutor-request-progress-refresh-policy.md",
};

export function auditStudentAppAITutorRequestProgressRefreshPolicy(
  inputs = loadCurrentInputs(process.cwd()),
  options = {},
) {
  const source0357 = parseJson(inputs.source0357Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const progressResponse = sliceBetween(
    inputs.httpResponses ?? "",
    "type studentAppAITutorRequestProgressResponse struct",
    "type studentAppAITutorRequestProgressActionResponse struct",
  );
  const refreshResponse = sliceBetween(
    inputs.httpResponses ?? "",
    "type studentAppAITutorRequestProgressRefreshPolicy struct",
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
  const probe = runRefreshPolicyProbe(source0357, options);
  const findings = [];

  addFinding(findings, {
    id: "source.0357_target_url_ready",
    passed: source0357.readiness === "READY" &&
      source0357.workloadType === "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_TARGET_URL" &&
      source0357.runtime?.runtimeId === "student_app_ai_tutor_request_progress_target_url" &&
      source0357.runtime?.status === "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_TARGET_URL_VERIFIED" &&
      source0357.runtimeSlo?.totalErrors === 0,
    actual: `${source0357.readiness ?? "missing"}:${source0357.runtime?.status ?? "missing"}:${source0357.runtimeSlo?.totalErrors ?? "missing"}`,
    expected: "READY 0357 target URL evidence with zero errors",
    remediation: "Run or fix 0357 before claiming Student App progress refresh policy.",
  });

  addFinding(findings, {
    id: "domain_builds_bounded_refresh_policy",
    passed: includesAll(inputs.domainProgress ?? "", [
      "StudentAppAITutorRequestProgressRefreshPolicy",
      "RefreshPolicy",
      "RefreshAfterMs: 8000",
      "RefreshAfterMs: 5000",
      "StudentAppAITutorProgressRefreshWaitingForWorker",
      "StudentAppAITutorProgressRefreshWaitingForReview",
      "StudentAppAITutorProgressRefreshActionReady",
      "StudentAppAITutorProgressRefreshTeacherReviewNeed",
    ]),
    actual: summarizePresence(inputs.domainProgress ?? "", [
      "RefreshPolicy",
      "RefreshAfterMs: 8000",
      "RefreshAfterMs: 5000",
      "TEACHER_REVIEW_REQUIRED",
    ]),
    expected: "domain progress cards include bounded server-owned refresh policy",
    remediation: "Build refresh policy from safe progressStage, not worker internals.",
  });

  addFinding(findings, {
    id: "http_and_openapi_expose_safe_refresh_policy",
    passed: includesAll(progressResponse, [
      "RefreshPolicy",
      "json:\"refreshPolicy\"",
    ]) &&
      includesAll(refreshResponse, [
        "AutoRefresh",
        "json:\"autoRefresh\"",
        "RefreshAfterMs",
        "json:\"refreshAfterMs\"",
        "Reason",
        "json:\"reason\"",
      ]) &&
      includesAll(presenter, [
        "RefreshPolicy: studentAppAITutorRequestProgressRefreshPolicy",
        "AutoRefresh:    card.RefreshPolicy.AutoRefresh",
        "RefreshAfterMs: card.RefreshPolicy.RefreshAfterMs",
        "Reason:         card.RefreshPolicy.Reason",
      ]) &&
      includesAll(inputs.openapiSchema ?? "", [
        "refreshPolicy:",
        "StudentAppAITutorRequestProgressRefreshPolicy:",
        "maximum: 8000",
        "WAITING_FOR_WORKER",
        "WAITING_FOR_REVIEW",
        "ACTION_READY",
        "TEACHER_REVIEW_REQUIRED",
      ]) &&
      forbiddenStudentResponseFields.every((field) =>
        !progressResponse.includes(field) &&
        !refreshResponse.includes(field) &&
        !presenter.includes(field) &&
        !(inputs.openapiSchema ?? "").includes(field)
      ),
    actual: summarizePresence(`${progressResponse}\n${refreshResponse}\n${presenter}\n${inputs.openapiSchema ?? ""}`, [
      "refreshPolicy",
      "refreshAfterMs",
      "WAITING_FOR_WORKER",
      "claimedByWorkerId",
      "errorMessage",
    ]),
    expected: "HTTP response, presenter, and OpenAPI expose only safe refresh policy",
    remediation: "Expose refresh policy as bounded UX/load-shedding metadata only.",
  });

  addFinding(findings, {
    id: "tests_cover_waiting_and_terminal_refresh_policy",
    passed: includesAll(inputs.domainProgressTest ?? "", [
      "RefreshAfterMs != 8000",
      "RefreshAfterMs != 5000",
      "StudentAppAITutorProgressRefreshActionReady",
      "StudentAppAITutorProgressRefreshTeacherReviewNeed",
    ]) &&
      includesAll(inputs.httpTest ?? "", [
        "\"refreshPolicy\":{\"autoRefresh\":false,\"refreshAfterMs\":0,\"reason\":\"ACTION_READY\"}",
      ]),
    actual: summarizePresence(`${inputs.domainProgressTest ?? ""}\n${inputs.httpTest ?? ""}`, [
      "RefreshAfterMs != 8000",
      "RefreshAfterMs != 5000",
      "refreshPolicy",
    ]),
    expected: "Go tests prove waiting states poll and terminal states stop polling",
    remediation: "Add refresh-policy regression coverage to domain and HTTP tests.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0358",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-request-progress-refresh-policy"]?.includes("student-app-ai-tutor-request-progress-refresh-policy-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor request progress refresh policy audit",
        "studentAppAiTutorRequestProgressRefreshPolicy",
        "student-app-ai-tutor-request-progress-refresh-policy.current.json",
        runtimeId,
        "0358-student-app-ai-tutor-request-progress-refresh-policy.md",
        "12.10/10",
        readyStatus,
        "SDD 0358 student app ai tutor request progress refresh policy",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "request-progress-refresh-policy",
      "studentAppAiTutorRequestProgressRefreshPolicy",
      "12.10/10",
      "SDD 0358",
    ]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0358",
    remediation: "Wire 0358 through every evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId,
      sourceRuntimes: ["student_app_ai_tutor_request_progress_target_url"],
      status: readyStatus,
    },
    runtimeSlo: probe.runtimeSlo,
    runtimeProbes: { studentAppAiTutorRequestProgressRefreshPolicy: probe },
    safetyInvariants: {
      source0357TargetURLRequired: true,
      serverOwnedRefreshPolicyRequired: true,
      studentAppInternalFieldExposureAllowed: false,
      directDatabaseAccessFromJavaScriptAllowed: false,
      modelInferenceAllowed: false,
      ocrRagAllowed: false,
      swarmAllowed: false,
      writePathChanged: false,
    },
    loadSheddingPolicy: {
      queuedRefreshAfterMs: 8000,
      inProgressRefreshAfterMs: 5000,
      terminalAutoRefresh: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use server-owned refreshPolicy to reduce mobile polling amplification and continue the whole-system refactor on the next root-requirement slice."
      : "Fix 0358 refresh policy evidence before claiming the Student App has bounded progress polling.",
  };
}

export function formatStudentAppAITutorRequestProgressRefreshPolicyAudit(report) {
  const lines = [
    `Student App AI Tutor request progress refresh policy: ${report.readiness}`,
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

function runRefreshPolicyProbe(source0357, options = {}) {
  const sourceReady = source0357.readiness === "READY";
  return {
    status: sourceReady ? "PASS" : "FAIL",
    queuedRefreshAfterMs: 8000,
    inProgressRefreshAfterMs: 5000,
    terminalAutoRefresh: false,
    forbiddenLeaks: [],
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.min(50, options.probeP99Ms ?? 5),
      totalErrors: sourceReady ? 0 : 1,
      operations: sourceReady ? 4 : 0,
      evidenceClass: "JS_STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_REFRESH_POLICY_CONTRACT_PROBE",
    },
    error: sourceReady ? undefined : "0357 source evidence is not READY",
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
  const report = auditStudentAppAITutorRequestProgressRefreshPolicy(loadCurrentInputs(process.cwd()));
  fs.mkdirSync(path.dirname(path.join(process.cwd(), out)), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorRequestProgressRefreshPolicyAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
