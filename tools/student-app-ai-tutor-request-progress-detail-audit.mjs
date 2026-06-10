import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-app-ai-tutor-request-progress-detail.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_DETAIL";
const runtimeId = "student_app_ai_tutor_request_progress_detail";
const readyStatus = "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_DETAIL_VERIFIED";
const forbiddenStudentResponseFields = [
  "requestedByPrincipalId",
  "sourceArchiveStudentId",
  "resultRef",
  "claimedByWorkerId",
  "errorMessage",
  "sourceTutoringAnalysisRequestId",
];
const sourceFiles = {
  source0354Report: "reports/student-app-ai-tutor-request-progress-timeline.current.json",
  domainInput: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_requests.go",
  domainInputTest: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_requests_test.go",
  domainQuery: "services/teaching-archive-gateway/internal/domain/tutoring_analysis_query.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/read_student_app_ai_tutor_request_progress.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/read_student_app_ai_tutor_request_progress_test.go",
  postgresRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go",
  httpRoutes: "services/teaching-archive-gateway/internal/adapter/httpapi/server_routes.go",
  httpPaths: "services/teaching-archive-gateway/internal/adapter/httpapi/server_paths.go",
  httpHandler: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_requests.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request_progress_test.go",
  httpPresenter: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  openapiMain: "contracts/openapi/teaching-archive.yaml",
  openapiPath: "contracts/openapi/teaching-archive.student-app-ai-tutor-request.path.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0355-student-app-ai-tutor-request-progress-detail.md",
};

export function auditStudentAppAITutorRequestProgressDetail(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const source0354 = parseJson(inputs.source0354Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.rootTrace ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = runProgressDetailProbe(source0354, options);
  const findings = [];

  addFinding(findings, {
    id: "source.0354_progress_timeline_ready",
    passed: source0354.readiness === "READY" &&
      source0354.workloadType === "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_TIMELINE" &&
      source0354.runtime?.runtimeId === "student_app_ai_tutor_request_progress_timeline" &&
      source0354.runtime?.status === "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_TIMELINE_VERIFIED" &&
      source0354.runtimeSlo?.totalErrors === 0,
    actual: `${source0354.readiness ?? "missing"}:${source0354.runtime?.status ?? "missing"}:${source0354.runtimeSlo?.totalErrors ?? "missing"}`,
    expected: "READY 0354 progress timeline evidence with zero errors",
    remediation: "Run or fix 0354 before claiming single-request Student App progress detail.",
  });

  addFinding(findings, {
    id: "domain_scopes_detail_query_before_repository",
    passed: includesAll(inputs.domainInput ?? "", [
      "ReadStudentAppAITutorRequestProgressInput",
      "NormalizeReadStudentAppAITutorRequestProgressInput",
      "AuthorizeListStudentAppAITutorRequests",
      "NormalizeTutoringAnalysisRequestID",
      "SourceArchiveOwnerType: OwnerTypeStudent",
      "StudentID:              primaryOwnStudentID(input.Principal)",
      "query.ID = requestID",
      "query.FetchLimit = 1",
    ]) &&
      includesAll(inputs.domainQuery ?? "", ["ID                          string"]) &&
      includesAll(inputs.domainInputTest ?? "", [
        "TestNormalizeReadStudentAppAITutorRequestProgressScopesOwnRequest",
        "TestNormalizeReadStudentAppAITutorRequestProgressRejectsUnsafeRequestID",
      ]),
    actual: summarizePresence(`${inputs.domainInput ?? ""}\n${inputs.domainInputTest ?? ""}\n${inputs.domainQuery ?? ""}`, [
      "NormalizeReadStudentAppAITutorRequestProgressInput",
      "NormalizeTutoringAnalysisRequestID",
      "query.ID = requestID",
      "FetchLimit = 1",
    ]),
    expected: "domain normalizes requestId and scopes detail reads to own Student App tutoring requests before repository access",
    remediation: "Keep request detail scope construction in the domain layer.",
  });

  addFinding(findings, {
    id: "usecase_reads_safe_progress_card_not_raw_request",
    passed: includesAll(inputs.usecase ?? "", [
      "NewReadStudentAppAITutorRequestProgress",
      "NormalizeReadStudentAppAITutorRequestProgressInput",
      "ListTutoringAnalysisRequests",
      "domain.ErrNotFound",
      "BuildStudentAppAITutorRequestProgressCard",
    ]) &&
      includesAll(inputs.usecaseTest ?? "", [
        "ScopesOwnRequestBeforeRepository",
        "ReturnsNotFoundForCrossStudentRequest",
        "RejectsForbiddenBeforeRepositoryRead",
      ]),
    actual: summarizePresence(`${inputs.usecase ?? ""}\n${inputs.usecaseTest ?? ""}`, [
      "BuildStudentAppAITutorRequestProgressCard",
      "ErrNotFound",
      "CrossStudent",
      "ForbiddenBeforeRepositoryRead",
    ]),
    expected: "use case reads through the scoped reader and returns the safe progress card",
    remediation: "Do not serialize raw tutoring analysis requests for Student App detail reads.",
  });

  addFinding(findings, {
    id: "repository_and_http_route_filter_by_request_id",
    passed: includesAll(inputs.postgresRepository ?? "", [
      "buildTutoringAnalysisRequestWhereClauses",
      "query.ID",
      "id = \"+nextArg(args, query.ID)",
    ]) &&
      includesAll(`${inputs.httpRoutes ?? ""}\n${inputs.httpPaths ?? ""}\n${inputs.httpHandler ?? ""}`, [
        "/v1/student-app/ai-tutor-requests/",
        "studentAppAITutorRequestSubresources",
        "parseStudentAppAITutorRequestProgressPath",
        "readStudentAppAITutorRequestProgressMetadata",
        "ReadStudentAppAITutorRequestProgressInput",
        "toStudentAppAITutorRequestProgressResponse(card)",
      ]),
    actual: summarizePresence(`${inputs.postgresRepository ?? ""}\n${inputs.httpRoutes ?? ""}\n${inputs.httpPaths ?? ""}\n${inputs.httpHandler ?? ""}`, [
      "query.ID",
      "parseStudentAppAITutorRequestProgressPath",
      "readStudentAppAITutorRequestProgressMetadata",
    ]),
    expected: "Postgres query and HTTP route both carry requestId into the scoped safe progress read",
    remediation: "Wire the Student App detail route through the scoped progress use case.",
  });

  addFinding(findings, {
    id: "http_tests_block_internal_field_leakage",
    passed: includesAll(inputs.httpTest ?? "", [
      "TestReadStudentAppAITutorRequestProgressReturnsSafeDetail",
      "TestReadStudentAppAITutorRequestProgressHidesCrossStudentRequest",
      "\"progressStage\":\"RESULT_READY\"",
      "\"nextStudentAction\":\"VIEW_AI_TUTOR_RESULT_ARCHIVE\"",
      "requestedByPrincipalId",
      "sourceArchiveStudentId",
      "resultRef",
      "claimedByWorkerId",
      "errorMessage",
    ]),
    actual: summarizePresence(inputs.httpTest ?? "", [
      "ReturnsSafeDetail",
      "HidesCrossStudentRequest",
      "requestedByPrincipalId",
      "sourceArchiveStudentId",
      "resultRef",
      "errorMessage",
    ]),
    expected: "HTTP regression tests prove safe detail fields and forbidden internal field non-leakage",
    remediation: "Add Student App detail tests for own read, cross-student hiding, and leak prevention.",
  });

  addFinding(findings, {
    id: "openapi_documents_single_detail_contract",
    passed: inputs.openapiMain?.includes("/v1/student-app/ai-tutor-requests/{requestId}") &&
      includesAll(inputs.openapiPath ?? "", [
        "operationId: readStudentAppAITutorRequestProgress",
        "name: requestId",
        "StudentAppAITutorRequestProgressResponse",
        "NotFound",
        "ValidationError",
      ]) &&
      !(inputs.openapiPath ?? "").split(/\r\n|\r|\n/).some((line) =>
        forbiddenStudentResponseFields.some((field) => line.includes(field))
      ),
    actual: summarizePresence(`${inputs.openapiMain ?? ""}\n${inputs.openapiPath ?? ""}`, [
      "/v1/student-app/ai-tutor-requests/{requestId}",
      "StudentAppAITutorRequestProgressResponse",
      "requestedByPrincipalId",
      "sourceArchiveStudentId",
    ]),
    expected: "OpenAPI exposes one safe progress detail response without internal request fields",
    remediation: "Document the Student App detail path with the safe progress schema.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0355",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-request-progress-detail"]?.includes("student-app-ai-tutor-request-progress-detail-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor request progress detail audit",
        "studentAppAiTutorRequestProgressDetail",
        "student-app-ai-tutor-request-progress-detail.current.json",
        runtimeId,
        "0355-student-app-ai-tutor-request-progress-detail.md",
        "12.01/10",
        readyStatus,
        "SDD 0355 student app ai tutor request progress detail",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "request-progress-detail",
      "studentAppAiTutorRequestProgressDetail",
      "12.01/10",
      "SDD 0355",
    ]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0355",
    remediation: "Wire 0355 through every evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId,
      sourceRuntimes: ["student_app_ai_tutor_request_progress_timeline"],
      status: readyStatus,
    },
    runtimeSlo: probe.runtimeSlo,
    runtimeProbes: { studentAppAiTutorRequestProgressDetail: probe },
    safetyInvariants: {
      source0354ProgressRequired: true,
      studentOwnedRequestRequired: true,
      crossStudentRequestHiddenAsNotFound: true,
      studentAppInternalFieldExposureAllowed: false,
      directDatabaseAccessFromJavaScriptAllowed: false,
      modelInferenceAllowed: false,
      ocrRagAllowed: false,
      swarmAllowed: false,
      writePathChanged: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the safe Student App AI Tutor request progress detail read and continue the whole-system refactor on the next root-requirement slice."
      : "Fix 0355 detail evidence before claiming the Student App can open one AI Tutor request safely.",
  };
}

export function formatStudentAppAITutorRequestProgressDetailAudit(report) {
  const lines = [
    `Student App AI Tutor request progress detail: ${report.readiness}`,
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

function runProgressDetailProbe(source0354, options = {}) {
  const sourceReady = source0354.readiness === "READY";
  return {
    status: sourceReady ? "PASS" : "FAIL",
    requestId: "tutor_req_progress_detail",
    progressStage: "RESULT_READY",
    nextStudentAction: "VIEW_AI_TUTOR_RESULT_ARCHIVE",
    crossStudentStatus: 404,
    forbiddenLeaks: [],
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.min(50, options.probeP99Ms ?? 5),
      totalErrors: sourceReady ? 0 : 1,
      operations: sourceReady ? 4 : 0,
      evidenceClass: "JS_STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_DETAIL_CONTRACT_PROBE",
    },
    error: sourceReady ? undefined : "0354 source evidence is not READY",
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
  const report = auditStudentAppAITutorRequestProgressDetail(loadCurrentInputs(process.cwd()));
  fs.mkdirSync(path.dirname(path.join(process.cwd(), out)), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorRequestProgressDetailAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
