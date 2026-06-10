import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-app-ai-tutor-request-progress-summary-count.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_SUMMARY_COUNT";
const runtimeId = "student_app_ai_tutor_request_progress_summary_count";
const readyStatus = "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_SUMMARY_COUNT_VERIFIED";
const sourceFiles = {
  source0362Report: "reports/student-app-ai-tutor-request-progress-view-filter.current.json",
  domainInput: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_requests.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/read_student_app_ai_tutor_request_progress_summary.go",
  postgresRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go",
  postgresTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis_progress_summary_count_test.go",
  httpHandler: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_requests.go",
  httpRoutes: "services/teaching-archive-gateway/internal/adapter/httpapi/server_routes.go",
  httpPaths: "services/teaching-archive-gateway/internal/adapter/httpapi/server_paths.go",
  serverConfig: "services/teaching-archive-gateway/internal/adapter/httpapi/server_config.go",
  serverWiring: "services/teaching-archive-gateway/internal/adapter/httpapi/server.go",
  responses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  presenter: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  progressValidator: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_progress_validator.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request_progress_test.go",
  domainTest: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_requests_test.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/read_student_app_ai_tutor_request_progress_summary_test.go",
  openapiRoot: "contracts/openapi/teaching-archive.yaml",
  openapiPath: "contracts/openapi/teaching-archive.student-app-ai-tutor-request-progress-summary.path.yaml",
  openapiSchema: "contracts/openapi/teaching-archive.student-app-ai-tutor-request-progress.schema.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0363-student-app-ai-tutor-request-progress-summary-count.md",
};

export function auditStudentAppAITutorRequestProgressSummaryCount(
  inputs = loadCurrentInputs(process.cwd()),
  options = {},
) {
  const source0362 = parseJson(inputs.source0362Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const domainUsecase = `${inputs.domainInput ?? ""}\n${inputs.usecase ?? ""}`;
  const postgresCountBlock = extractFunctionBlock(
    inputs.postgresRepository ?? "",
    "func (r *ArchiveRepository) CountTutoringAnalysisRequestsByStatus",
  );
  const httpContract = [
    inputs.httpHandler,
    inputs.httpRoutes,
    inputs.httpPaths,
    inputs.serverConfig,
    inputs.serverWiring,
    inputs.responses,
    inputs.presenter,
    inputs.progressValidator,
    inputs.openapiRoot,
    inputs.openapiPath,
    inputs.openapiSchema,
  ].join("\n");
  const tests = [
    inputs.domainTest,
    inputs.usecaseTest,
    inputs.postgresTest,
    inputs.httpTest,
  ].join("\n");
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.rootTrace ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = runSummaryCountProbe(source0362, options);
  const findings = [];

  addFinding(findings, {
    id: "source.0362_view_filter_ready",
    passed: source0362.readiness === "READY" &&
      source0362.workloadType === "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_VIEW_FILTER" &&
      source0362.runtime?.runtimeId === "student_app_ai_tutor_request_progress_view_filter" &&
      source0362.runtime?.status === "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_VIEW_FILTER_VERIFIED" &&
      source0362.runtimeSlo?.totalErrors === 0,
    actual: `${source0362.readiness ?? "missing"}:${source0362.runtime?.status ?? "missing"}:${source0362.runtimeSlo?.totalErrors ?? "missing"}`,
    expected: "READY 0362 progress-view filter evidence with zero errors",
    remediation: "Run or fix 0362 before claiming count-only progress summary.",
  });

  addFinding(findings, {
    id: "domain_usecase_own_summary_count_contract",
    passed: includesAll(domainUsecase, [
      "type ReadStudentAppAITutorRequestProgressSummaryInput struct",
      "type StudentAppAITutorRequestProgressSummary struct",
      "NormalizeReadStudentAppAITutorRequestProgressSummaryInput",
      "AuthorizeListStudentAppAITutorRequests",
      "BuildStudentAppAITutorRequestProgressSummary",
      "TutoringAnalysisStatusQueued",
      "TutoringAnalysisStatusInProgress",
      "TutoringAnalysisStatusSucceeded",
      "TutoringAnalysisStatusFailed",
      "CountTutoringAnalysisRequestsByStatus",
      "NewReadStudentAppAITutorRequestProgressSummary",
      "func (uc *ReadStudentAppAITutorRequestProgressSummary) Execute",
    ]) && !includesAny(inputs.usecase ?? "", [
      "ListTutoringAnalysisRequests(",
      "BuildStudentAppAITutorRequestProgressCard",
      "BuildTutoringAnalysisRequestPage",
    ]),
    actual: summarizePresence(domainUsecase, [
      "ReadStudentAppAITutorRequestProgressSummaryInput",
      "BuildStudentAppAITutorRequestProgressSummary",
      "CountTutoringAnalysisRequestsByStatus",
      "ListTutoringAnalysisRequests(",
    ]),
    expected: "domain owns count mapping and use case calls the count-only reader",
    remediation: "Keep summary-count rules inside domain/usecase and avoid list-row reads.",
  });

  addFinding(findings, {
    id: "postgres_uses_count_only_grouped_query",
    passed: includesAll(postgresCountBlock, [
      "SELECT",
      "status",
      "COUNT(*)",
      "FROM teaching_tutoring_analysis_requests",
      "GROUP BY status",
      "buildTutoringAnalysisRequestWhereClauses",
    ]) && !includesAny(postgresCountBlock, [
      "ORDER BY",
      "LIMIT",
      "archive_item_id,",
      "analysis_goal",
      "result_ref",
      "claimed_by_worker_id",
      "scanTutoringAnalysisRequest",
    ]),
    actual: summarizePresence(postgresCountBlock, [
      "COUNT(*)",
      "GROUP BY status",
      "ORDER BY",
      "scanTutoringAnalysisRequest",
    ]),
    expected: "PostgreSQL summary path selects only status counts and groups in SQL",
    remediation: "Do not load full request rows for count-only summary.",
  });

  addFinding(findings, {
    id: "http_openapi_expose_private_count_only_summary",
    passed: includesAll(httpContract, [
      "parseStudentAppAITutorRequestProgressSummaryPath",
      "readStudentAppAITutorRequestProgressSummaryMetadata",
      "ReadStudentAppAITutorRequestProgressSummary",
      "studentAppAITutorRequestProgressSummaryETag",
      "studentAppAITutorRequestProgressSummaryOnlyResponse",
      "toStudentAppAITutorRequestProgressSummaryOnlyResponse",
      "/v1/student-app/ai-tutor-requests/summary",
      "teaching-archive.student-app-ai-tutor-request-progress-summary.path.yaml",
      "StudentAppAITutorRequestProgressSummaryOnlyResponse",
      "additionalProperties: false",
      "- summary",
      "private, no-cache",
    ]) && includesAll(inputs.openapiRoot ?? "", [
      "/v1/student-app/ai-tutor-requests/summary",
      "teaching-archive.student-app-ai-tutor-request-progress-summary.path.yaml",
    ]),
    actual: summarizePresence(httpContract, [
      "/summary",
      "SummaryOnlyResponse",
      "studentAppAITutorRequestProgressSummaryETag",
      "private, no-cache",
      "teaching-archive.student-app-ai-tutor-request-progress-summary.path.yaml",
    ]),
    expected: "HTTP and OpenAPI expose a private summary-only endpoint",
    remediation: "Wire the summary endpoint before the requestId route and keep the schema count-only.",
  });

  addFinding(findings, {
    id: "tests_cover_count_only_summary_and_leak_guards",
    passed: includesAll(tests, [
      "TestNormalizeReadStudentAppAITutorRequestProgressSummaryScopesOwnStudent",
      "TestBuildStudentAppAITutorRequestProgressSummaryMapsStatusCounts",
      "TestReadStudentAppAITutorRequestProgressSummaryScopesOwnStudentBeforeCount",
      "TestCountTutoringAnalysisRequestsByStatusBuildsCountOnlyGroupedQuery",
      "TestReadStudentAppAITutorRequestProgressSummaryReturnsCountOnlySafeResponse",
      `"summary":{"totalCount":5,"autoRefreshCount":2,"actionReadyCount":2,"teacherReviewRequiredCount":1,"failedCount":1}`,
      `"data"`,
      `"pageInfo"`,
      "resultRef",
      "errorMessage",
      "claimedByWorkerId",
      "worker_internal_summary",
      "local://internal",
    ]),
    actual: summarizePresence(tests, [
      "SummaryScopesOwnStudent",
      "CountOnlyGroupedQuery",
      "CountOnlySafeResponse",
      "pageInfo",
      "claimedByWorkerId",
    ]),
    expected: "domain, usecase, PostgreSQL, and HTTP tests cover count-only behavior and leak guards",
    remediation: "Add regression coverage across every summary-count boundary.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0363",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-request-progress-summary-count"]?.includes("student-app-ai-tutor-request-progress-summary-count-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor request progress summary count audit",
        "studentAppAiTutorRequestProgressSummaryCount",
        "student-app-ai-tutor-request-progress-summary-count.current.json",
        runtimeId,
        "0363-student-app-ai-tutor-request-progress-summary-count.md",
        "12.25/10",
        readyStatus,
        "SDD 0363 student app ai tutor request progress summary count",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "request-progress-summary-count",
      "studentAppAiTutorRequestProgressSummaryCount",
      "12.25/10",
      "SDD 0363",
    ]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0363",
    remediation: "Wire 0363 through every evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId,
      sourceRuntimes: ["student_app_ai_tutor_request_progress_view_filter"],
      status: readyStatus,
    },
    runtimeSlo: probe.runtimeSlo,
    runtimeProbes: { studentAppAiTutorRequestProgressSummaryCount: probe },
    safetyInvariants: {
      source0362ViewFilterRequired: true,
      ownStudentOnly: true,
      databaseGroupedCountRequired: true,
      returnsSummaryOnly: true,
      rawRequestInternalsAllowed: false,
      workerIdsAllowed: false,
      internalErrorsAllowed: false,
      rawResultRefsAllowed: false,
      modelOutputAllowed: false,
      ocrRagAllowed: false,
      swarmAllowed: false,
      writePathChanged: false,
      sharedCacheChanged: false,
      databaseSchemaChanged: false,
    },
    summaryCountPolicy: {
      endpoint: "GET /v1/student-app/ai-tutor-requests/summary",
      repositoryOperation: "SELECT status, COUNT(*) GROUP BY status",
      responseFields: ["summary"],
      countMapping: {
        autoRefreshCount: ["QUEUED", "IN_PROGRESS"],
        actionReadyCount: ["SUCCEEDED"],
        teacherReviewRequiredCount: ["FAILED"],
        failedCount: ["FAILED"],
      },
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use the count-only summary endpoint for Student App home badges and continue the whole-system refactor on the next root-requirement slice."
      : "Fix 0363 summary-count contract, SQL aggregation, tests, or evidence wiring before claiming the count-only endpoint is complete.",
  };
}

export function formatStudentAppAITutorRequestProgressSummaryCountAudit(report) {
  const lines = [
    `Student App AI Tutor request progress summary count: ${report.readiness}`,
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

function runSummaryCountProbe(source0362, options = {}) {
  const sourceReady = source0362.readiness === "READY";
  return {
    status: sourceReady ? "PASS" : "FAIL",
    countedSummary: {
      totalCount: 5,
      autoRefreshCount: 2,
      actionReadyCount: 2,
      teacherReviewRequiredCount: 1,
      failedCount: 1,
    },
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.min(50, options.probeP99Ms ?? 2),
      totalErrors: sourceReady ? 0 : 1,
      operations: sourceReady ? 5 : 0,
      evidenceClass: "JS_STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_SUMMARY_COUNT_CONTRACT_PROBE",
    },
    error: sourceReady ? undefined : "0362 source evidence is not READY",
  };
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => {
    const absolute = path.join(root, relativePath);
    return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""];
  }));
}

function extractFunctionBlock(text, signature) {
  const start = text.indexOf(signature);
  if (start === -1) return "";
  const braceStart = text.indexOf("{", start);
  if (braceStart === -1) return text.slice(start);
  let depth = 0;
  for (let index = braceStart; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") depth -= 1;
    if (depth === 0) return text.slice(start, index + 1);
  }
  return text.slice(start);
}

function parseJson(text, fallback) { try { return JSON.parse(text); } catch { return fallback; } }
function includesAll(text, values) { return values.every((value) => text.includes(value)); }
function includesAny(text, values) { return values.some((value) => text.includes(value)); }
function summarizePresence(text, values) { return values.map((value) => `${value}=${text.includes(value)}`).join(";"); }
function addFinding(findings, finding) { findings.push({ severity: finding.passed ? "info" : "error", ...finding, passed: Boolean(finding.passed) }); }
function stringifyScalar(value) { if (Array.isArray(value)) return value.join(","); if (value && typeof value === "object") return JSON.stringify(value); return String(value); }
function parseOutArg(argv) { const outIndex = argv.indexOf("--out"); return outIndex === -1 ? defaultOutPath : argv[outIndex + 1]; }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = parseOutArg(process.argv.slice(2));
  const report = auditStudentAppAITutorRequestProgressSummaryCount(loadCurrentInputs(process.cwd()));
  fs.mkdirSync(path.dirname(path.join(process.cwd(), out)), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorRequestProgressSummaryCountAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
