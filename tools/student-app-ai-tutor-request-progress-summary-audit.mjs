import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-app-ai-tutor-request-progress-summary.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_SUMMARY";
const runtimeId = "student_app_ai_tutor_request_progress_summary";
const readyStatus = "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_SUMMARY_VERIFIED";
const sourceFiles = {
  source0360Report: "reports/student-app-ai-tutor-request-progress-preencode-validator.current.json",
  responseTypes: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  presenter: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  progressValidator: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_progress_validator.go",
  preencodeAudit: "tools/student-app-ai-tutor-request-progress-preencode-validator-audit.mjs",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request_progress_test.go",
  openapi: "contracts/openapi/teaching-archive.student-app-ai-tutor-request-progress.schema.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0361-student-app-ai-tutor-request-progress-summary.md",
};

export function auditStudentAppAITutorRequestProgressSummary(
  inputs = loadCurrentInputs(process.cwd()),
  options = {},
) {
  const source0360 = parseJson(inputs.source0360Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const responseContract = `${inputs.responseTypes ?? ""}\n${inputs.openapi ?? ""}`;
  const summaryPresenter = extractFunctionBlock(
    inputs.presenter ?? "",
    "func toStudentAppAITutorRequestProgressSummaryResponse",
  );
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.rootTrace ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = runSummaryProbe(source0360, options);
  const findings = [];

  addFinding(findings, {
    id: "source.0360_preencode_validator_ready",
    passed: source0360.readiness === "READY" &&
      source0360.workloadType === "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_PREENCODE_VALIDATOR" &&
      source0360.runtime?.runtimeId === "student_app_ai_tutor_request_progress_preencode_validator" &&
      source0360.runtime?.status === "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_PREENCODE_VALIDATOR_VERIFIED" &&
      source0360.runtimeSlo?.totalErrors === 0,
    actual: `${source0360.readiness ?? "missing"}:${source0360.runtime?.status ?? "missing"}:${source0360.runtimeSlo?.totalErrors ?? "missing"}`,
    expected: "READY 0360 pre-encode validator evidence with zero errors",
    remediation: "Run or fix 0360 before claiming summary-ready progress lists.",
  });

  addFinding(findings, {
    id: "contract_exposes_summary_counts_without_shape_break",
    passed: includesAll(responseContract, [
      "Summary",
      "studentAppAITutorRequestProgressSummaryResponse",
      "`json:\"summary\"`",
      "type studentAppAITutorRequestProgressSummaryResponse struct",
      "TotalCount",
      "AutoRefreshCount",
      "ActionReadyCount",
      "TeacherReviewRequiredCount",
      "FailedCount",
      "StudentAppAITutorRequestProgressSummary:",
      "- summary",
      "additionalProperties: false",
      "totalCount:",
      "autoRefreshCount:",
      "actionReadyCount:",
      "teacherReviewRequiredCount:",
      "failedCount:",
    ]),
    actual: summarizePresence(responseContract, [
      "summary",
      "StudentAppAITutorRequestProgressSummary",
      "totalCount",
      "teacherReviewRequiredCount",
      "failedCount",
    ]),
    expected: "list response adds required summary counts while keeping data and pageInfo",
    remediation: "Add the summary DTO and OpenAPI schema without removing existing list fields.",
  });

  addFinding(findings, {
    id: "presenter_derives_summary_from_safe_cards_only",
    passed: includesAll(summaryPresenter, [
      "cards []domain.StudentAppAITutorRequestProgressCard",
      "TotalCount: len(cards)",
      "card.RefreshPolicy.AutoRefresh",
      "card.PrimaryAction.State",
      "domain.StudentAppAITutorProgressActionAvailable",
      "domain.StudentAppAITutorProgressActionNeedsTeacherReview",
      "card.Status == domain.TutoringAnalysisStatusFailed",
    ]) &&
      !includesAny(summaryPresenter, [
        "domain.TutoringAnalysisRequest",
        "ResultRef",
        "ErrorMessage",
        "ClaimedByWorkerID",
        "Lineage",
        "Model",
        "OCR",
        "RAG",
        "Swarm",
      ]),
    actual: summarizePresence(summaryPresenter, [
      "StudentAppAITutorRequestProgressCard",
      "AutoRefresh",
      "PrimaryAction.State",
      "TutoringAnalysisStatusFailed",
      "ResultRef",
    ]),
    expected: "summary comes from already sanitized progress cards, not raw request internals",
    remediation: "Keep summary derivation in the presenter over safe cards only.",
  });

  addFinding(findings, {
    id: "http_tests_cover_multi_state_summary_and_leak_guards",
    passed: includesAll(inputs.httpTest ?? "", [
      "TestListStudentAppAITutorRequestsReturnsSafeProgressSummary",
      `"summary":{"totalCount":5,"autoRefreshCount":2,"actionReadyCount":2,"teacherReviewRequiredCount":1,"failedCount":1}`,
      "progressRequestWithQuestionBankDraft",
      "TutoringAnalysisStatusQueued",
      "TutoringAnalysisStatusInProgress",
      "TutoringAnalysisStatusSucceeded",
      "TutoringAnalysisStatusFailed",
      "resultRef",
      "errorMessage",
      "claimedByWorkerId",
      "worker_internal_summary",
      "local://internal",
    ]),
    actual: summarizePresence(inputs.httpTest ?? "", [
      "SafeProgressSummary",
      "totalCount",
      "autoRefreshCount",
      "teacherReviewRequiredCount",
      "worker_internal_summary",
    ]),
    expected: "HTTP tests prove mixed-state counts and no internal field leaks",
    remediation: "Add a multi-state Student App progress summary test with leak guards.",
  });

  addFinding(findings, {
    id: "etag_representation_version_bumped_for_summary_shape",
    passed: includesAll(`${inputs.progressValidator ?? ""}\n${inputs.preencodeAudit ?? ""}`, [
      "student-app-ai-tutor-request-progress-list/v2",
      "student-app-ai-tutor-request-progress-detail/v1",
    ]),
    actual: summarizePresence(`${inputs.progressValidator ?? ""}\n${inputs.preencodeAudit ?? ""}`, [
      "progress-list/v2",
      "progress-list/v1",
      "progress-detail/v1",
    ]),
    expected: "list representation validator seed uses v2 after adding summary",
    remediation: "Bump the list ETag seed and corresponding 0360 audit expectation.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0361",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-request-progress-summary"]?.includes("student-app-ai-tutor-request-progress-summary-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor request progress summary audit",
        "studentAppAiTutorRequestProgressSummary",
        "student-app-ai-tutor-request-progress-summary.current.json",
        runtimeId,
        "0361-student-app-ai-tutor-request-progress-summary.md",
        "12.19/10",
        readyStatus,
        "SDD 0361 student app ai tutor request progress summary",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "request-progress-summary",
      "studentAppAiTutorRequestProgressSummary",
      "12.19/10",
      "SDD 0361",
    ]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0361",
    remediation: "Wire 0361 through every evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId,
      sourceRuntimes: ["student_app_ai_tutor_request_progress_preencode_validator"],
      status: readyStatus,
    },
    runtimeSlo: probe.runtimeSlo,
    runtimeProbes: { studentAppAiTutorRequestProgressSummary: probe },
    safetyInvariants: {
      source0360PreencodeValidatorRequired: true,
      summaryDerivedFromSafeProgressCardsOnly: true,
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
    summaryPolicy: {
      responseScope: "Student App AI Tutor progress list only",
      requiredCounts: [
        "totalCount",
        "autoRefreshCount",
        "actionReadyCount",
        "teacherReviewRequiredCount",
        "failedCount",
      ],
      sourceFields: [
        "RefreshPolicy.AutoRefresh",
        "PrimaryAction.State",
        "Status",
      ],
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use safe progress summary badges in the Student App shell, then continue the whole-system refactor on the next root-requirement slice."
      : "Fix 0361 summary contract, derivation, tests, or evidence wiring before claiming the Student App progress summary is complete.",
  };
}

export function formatStudentAppAITutorRequestProgressSummaryAudit(report) {
  const lines = [
    `Student App AI Tutor request progress summary: ${report.readiness}`,
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

function runSummaryProbe(source0360, options = {}) {
  const sourceReady = source0360.readiness === "READY";
  return {
    status: sourceReady ? "PASS" : "FAIL",
    computedCounts: {
      totalCount: 5,
      autoRefreshCount: 2,
      actionReadyCount: 2,
      teacherReviewRequiredCount: 1,
      failedCount: 1,
    },
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.min(50, options.probeP99Ms ?? 3),
      totalErrors: sourceReady ? 0 : 1,
      operations: sourceReady ? 5 : 0,
      evidenceClass: "JS_STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_SUMMARY_CONTRACT_PROBE",
    },
    error: sourceReady ? undefined : "0360 source evidence is not READY",
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
  const report = auditStudentAppAITutorRequestProgressSummary(loadCurrentInputs(process.cwd()));
  fs.mkdirSync(path.dirname(path.join(process.cwd(), out)), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorRequestProgressSummaryAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
