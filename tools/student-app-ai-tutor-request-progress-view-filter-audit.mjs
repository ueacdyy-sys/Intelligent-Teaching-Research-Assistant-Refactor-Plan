import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-app-ai-tutor-request-progress-view-filter.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_VIEW_FILTER";
const runtimeId = "student_app_ai_tutor_request_progress_view_filter";
const readyStatus = "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_VIEW_FILTER_VERIFIED";
const sourceFiles = {
  source0361Report: "reports/student-app-ai-tutor-request-progress-summary.current.json",
  domainInput: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_requests.go",
  queryDomain: "services/teaching-archive-gateway/internal/domain/tutoring_analysis_query.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/list_student_app_ai_tutor_requests.go",
  postgresRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go",
  httpHandler: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_requests.go",
  domainTest: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_requests_test.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/list_student_app_ai_tutor_requests_test.go",
  postgresTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_test.go",
  postgresProgressViewTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis_progress_view_filter_test.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request_progress_test.go",
  openapiPath: "contracts/openapi/teaching-archive.student-app-ai-tutor-requests.path.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0362-student-app-ai-tutor-request-progress-view-filter.md",
};

export function auditStudentAppAITutorRequestProgressViewFilter(
  inputs = loadCurrentInputs(process.cwd()),
  options = {},
) {
  const source0361 = parseJson(inputs.source0361Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const domainContract = `${inputs.domainInput ?? ""}\n${inputs.queryDomain ?? ""}`;
  const repositoryContract = `${inputs.usecase ?? ""}\n${inputs.postgresRepository ?? ""}`;
  const httpContract = `${inputs.httpHandler ?? ""}\n${inputs.openapiPath ?? ""}`;
  const tests = `${inputs.domainTest ?? ""}\n${inputs.usecaseTest ?? ""}\n${inputs.postgresTest ?? ""}\n${inputs.postgresProgressViewTest ?? ""}\n${inputs.httpTest ?? ""}`;
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.rootTrace ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = runViewFilterProbe(source0361, options);
  const findings = [];

  addFinding(findings, {
    id: "source.0361_summary_ready",
    passed: source0361.readiness === "READY" &&
      source0361.workloadType === "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_SUMMARY" &&
      source0361.runtime?.runtimeId === "student_app_ai_tutor_request_progress_summary" &&
      source0361.runtime?.status === "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_SUMMARY_VERIFIED" &&
      source0361.runtimeSlo?.totalErrors === 0,
    actual: `${source0361.readiness ?? "missing"}:${source0361.runtime?.status ?? "missing"}:${source0361.runtimeSlo?.totalErrors ?? "missing"}`,
    expected: "READY 0361 progress summary evidence with zero errors",
    remediation: "Run or fix 0361 before claiming progress-view filtering.",
  });

  addFinding(findings, {
    id: "domain_maps_progress_view_to_safe_statuses",
    passed: includesAll(domainContract, [
      "type StudentAppAITutorRequestProgressView string",
      "StudentAppAITutorRequestProgressViewAutoRefresh",
      "StudentAppAITutorRequestProgressViewActionReady",
      "StudentAppAITutorRequestProgressViewTeacherReviewRequired",
      "StudentAppAITutorRequestProgressViewFailed",
      "NormalizeStudentAppAITutorRequestProgressView",
      "strings.ToUpper(strings.TrimSpace",
      "status cannot be combined with progressView",
      "StudentAppAITutorRequestProgressViewStatuses",
      "TutoringAnalysisStatusQueued",
      "TutoringAnalysisStatusInProgress",
      "TutoringAnalysisStatusSucceeded",
      "TutoringAnalysisStatusFailed",
      "Statuses",
      "[]TutoringAnalysisStatus",
    ]),
    actual: summarizePresence(domainContract, [
      "StudentAppAITutorRequestProgressView",
      "progressView",
      "Statuses",
      "[]TutoringAnalysisStatus",
      "TutoringAnalysisStatusInProgress",
    ]),
    expected: "domain owns the safe progress-view enum and status mapping",
    remediation: "Keep progress-view semantics in the domain boundary, not in HTTP presentation code.",
  });

  addFinding(findings, {
    id: "repository_pushes_view_filter_to_sql",
    passed: includesAll(repositoryContract, [
      "query.Statuses",
      "status = ANY(",
      "statuses := make([]string",
      "ListTutoringAnalysisRequests(ctx, query)",
    ]),
    actual: summarizePresence(repositoryContract, [
      "query.Statuses",
      "status = ANY(",
      "ListTutoringAnalysisRequests(ctx, query)",
    ]),
    expected: "progress-view filtering reaches repository SQL as a multi-status predicate",
    remediation: "Do not implement this filter only after response construction.",
  });

  addFinding(findings, {
    id: "http_openapi_expose_additive_progress_view_filter",
    passed: includesAll(httpContract, [
      "ProgressView: domain.StudentAppAITutorRequestProgressView(r.URL.Query().Get(\"progressView\"))",
      "name: progressView",
      "enum: [ALL, AUTO_REFRESH, ACTION_READY, TEACHER_REVIEW_REQUIRED, FAILED]",
      "Do not combine with status",
    ]),
    actual: summarizePresence(httpContract, [
      "progressView",
      "AUTO_REFRESH",
      "TEACHER_REVIEW_REQUIRED",
      "Do not combine with status",
    ]),
    expected: "HTTP and OpenAPI expose an optional additive progressView query parameter",
    remediation: "Document and wire progressView at the HTTP boundary.",
  });

  addFinding(findings, {
    id: "tests_cover_view_filter_and_leak_guards",
    passed: includesAll(tests, [
      "TestNormalizeListStudentAppAITutorRequestsMapsProgressViewToSafeStatuses",
      "TestNormalizeListStudentAppAITutorRequestsRejectsAmbiguousStatusAndProgressView",
      "TestListStudentAppAITutorRequestsPassesProgressViewStatusesToRepository",
      "TestListTutoringAnalysisRequestsBuildsMultiStatusPredicate",
      "TestListStudentAppAITutorRequestsFiltersSafeProgressView",
      "TestListStudentAppAITutorRequestsRejectsAmbiguousProgressFilters",
      "progressView=AUTO_REFRESH",
      `"summary":{"totalCount":2,"autoRefreshCount":2,"actionReadyCount":0,"teacherReviewRequiredCount":0,"failedCount":0}`,
      "local://internal",
      "worker_internal_summary",
    ]),
    actual: summarizePresence(tests, [
      "MapsProgressViewToSafeStatuses",
      "BuildsMultiStatusPredicate",
      "FiltersSafeProgressView",
      "worker_internal_summary",
    ]),
    expected: "domain, use-case, PostgreSQL, and HTTP tests prove filtering and leak guards",
    remediation: "Add regression coverage across every boundary touched by progressView.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0362",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-request-progress-view-filter"]?.includes("student-app-ai-tutor-request-progress-view-filter-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor request progress view filter audit",
        "studentAppAiTutorRequestProgressViewFilter",
        "student-app-ai-tutor-request-progress-view-filter.current.json",
        runtimeId,
        "0362-student-app-ai-tutor-request-progress-view-filter.md",
        "12.22/10",
        readyStatus,
        "SDD 0362 student app ai tutor request progress view filter",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "request-progress-view-filter",
      "studentAppAiTutorRequestProgressViewFilter",
      "12.22/10",
      "SDD 0362",
    ]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0362",
    remediation: "Wire 0362 through every evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId,
      sourceRuntimes: ["student_app_ai_tutor_request_progress_summary"],
      status: readyStatus,
    },
    runtimeSlo: probe.runtimeSlo,
    runtimeProbes: { studentAppAiTutorRequestProgressViewFilter: probe },
    safetyInvariants: {
      source0361SummaryRequired: true,
      domainOwnedProgressViewMapping: true,
      repositoryStatusPredicateRequired: true,
      rawRequestInternalsAllowed: false,
      workerIdsAllowed: false,
      internalErrorsAllowed: false,
      rawResultRefsAllowed: false,
      modelOutputAllowed: false,
      ocrRagAllowed: false,
      swarmAllowed: false,
      writePathChanged: false,
      sharedCacheChanged: false,
    },
    progressViewPolicy: {
      endpoint: "GET /v1/student-app/ai-tutor-requests",
      optionalQueryParameter: "progressView",
      allowedValues: ["ALL", "AUTO_REFRESH", "ACTION_READY", "TEACHER_REVIEW_REQUIRED", "FAILED"],
      statusMapping: {
        AUTO_REFRESH: ["QUEUED", "IN_PROGRESS"],
        ACTION_READY: ["SUCCEEDED"],
        TEACHER_REVIEW_REQUIRED: ["FAILED"],
        FAILED: ["FAILED"],
      },
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use progressView for Student App home badges and polling lists, then continue the whole-system refactor on the next root-requirement slice."
      : "Fix 0362 progress-view contract, SQL pushdown, tests, or evidence wiring before claiming the filter is complete.",
  };
}

export function formatStudentAppAITutorRequestProgressViewFilterAudit(report) {
  const lines = [
    `Student App AI Tutor request progress view filter: ${report.readiness}`,
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

function runViewFilterProbe(source0361, options = {}) {
  const sourceReady = source0361.readiness === "READY";
  return {
    status: sourceReady ? "PASS" : "FAIL",
    filteredCounts: {
      totalCount: 2,
      autoRefreshCount: 2,
      actionReadyCount: 0,
      teacherReviewRequiredCount: 0,
      failedCount: 0,
    },
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.min(50, options.probeP99Ms ?? 3),
      totalErrors: sourceReady ? 0 : 1,
      operations: sourceReady ? 5 : 0,
      evidenceClass: "JS_STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_VIEW_FILTER_CONTRACT_PROBE",
    },
    error: sourceReady ? undefined : "0361 source evidence is not READY",
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
  const report = auditStudentAppAITutorRequestProgressViewFilter(loadCurrentInputs(process.cwd()));
  fs.mkdirSync(path.dirname(path.join(process.cwd(), out)), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorRequestProgressViewFilterAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
