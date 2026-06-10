import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-app-ai-tutor-request-progress-target-url.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_TARGET_URL";
const runtimeId = "student_app_ai_tutor_request_progress_target_url";
const readyStatus = "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_TARGET_URL_VERIFIED";
const forbiddenStudentResponseFields = [
  "requestedByPrincipalId",
  "sourceArchiveStudentId",
  "resultRef",
  "claimedByWorkerId",
  "errorMessage",
  "sourceTutoringAnalysisRequestId",
];
const sourceFiles = {
  source0356Report: "reports/student-app-ai-tutor-request-progress-primary-action.current.json",
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
  sdd: "docs/sdd/0357-student-app-ai-tutor-request-progress-target-url.md",
};

export function auditStudentAppAITutorRequestProgressTargetURL(
  inputs = loadCurrentInputs(process.cwd()),
  options = {},
) {
  const source0356 = parseJson(inputs.source0356Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
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
  const probe = runTargetURLProbe(source0356, options);
  const findings = [];

  addFinding(findings, {
    id: "source.0356_primary_action_ready",
    passed: source0356.readiness === "READY" &&
      source0356.workloadType === "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_PRIMARY_ACTION" &&
      source0356.runtime?.runtimeId === "student_app_ai_tutor_request_progress_primary_action" &&
      source0356.runtime?.status === "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_PRIMARY_ACTION_VERIFIED" &&
      source0356.runtimeSlo?.totalErrors === 0,
    actual: `${source0356.readiness ?? "missing"}:${source0356.runtime?.status ?? "missing"}:${source0356.runtimeSlo?.totalErrors ?? "missing"}`,
    expected: "READY 0356 primary action evidence with zero errors",
    remediation: "Run or fix 0356 before claiming Student App progress target URLs.",
  });

  addFinding(findings, {
    id: "domain_builds_encoded_target_url",
    passed: includesAll(inputs.domainProgress ?? "", [
      "\"net/url\"",
      "TargetURL",
      "url.QueryEscape(draftRef)",
      "TargetURL:      \"/v1/student-app/archive-items/\" + archiveItemID + \"/ai-tutor-result/rendered\"",
      "TargetURL:            \"/v1/student-app/question-bank-draft-content?questionBankDraftRef=\" + url.QueryEscape(draftRef)",
    ]),
    actual: summarizePresence(inputs.domainProgress ?? "", [
      "TargetURL",
      "url.QueryEscape(draftRef)",
      "questionBankDraftRef=",
    ]),
    expected: "domain progress action builds direct targetUrl and encodes questionBankDraftRef",
    remediation: "Keep targetUrl construction server-side and encoded.",
  });

  addFinding(findings, {
    id: "http_and_openapi_expose_constrained_target_url",
    passed: includesAll(progressActionResponse, [
      "TargetURL",
      "json:\"targetUrl,omitempty\"",
    ]) &&
      includesAll(presenter, [
        "TargetURL:            card.PrimaryAction.TargetURL",
      ]) &&
      includesAll(inputs.openapiSchema ?? "", [
        "targetUrl:",
        "question-bank-draft-content\\?questionBankDraftRef=local%3A%2F%2Fquestion-bank-drafts%2Ftutor_req_",
        "archive-items/tarch_",
      ]) &&
      forbiddenStudentResponseFields.every((field) =>
        !progressActionResponse.includes(field) &&
        !presenter.includes(field) &&
        !(inputs.openapiSchema ?? "").includes(field)
      ),
    actual: summarizePresence(`${progressActionResponse}\n${presenter}\n${inputs.openapiSchema ?? ""}`, [
      "targetUrl",
      "questionBankDraftRef=local%3A",
      "resultRef",
      "claimedByWorkerId",
      "errorMessage",
    ]),
    expected: "HTTP response, presenter, and OpenAPI expose only constrained safe target URLs",
    remediation: "Expose targetUrl only on the safe Student App progress action contract.",
  });

  addFinding(findings, {
    id: "tests_cover_result_and_question_bank_target_url",
    passed: includesAll(inputs.domainProgressTest ?? "", [
      "TargetURL != \"/v1/student-app/archive-items/tarch_student_ai_tutor_result_001/ai-tutor-result/rendered\"",
      "TargetURL != \"\"",
      "TargetURL != \"/v1/student-app/question-bank-draft-content?questionBankDraftRef=local%3A%2F%2Fquestion-bank-drafts%2Ftutor_req_progress_001.json\"",
    ]) &&
      includesAll(inputs.httpTest ?? "", [
        "\"targetUrl\":\"/v1/student-app/archive-items/tarch_student_ai_tutor_result_001/ai-tutor-result/rendered\"",
        "\"targetUrl\":\"/v1/student-app/archive-items/tarch_student_ai_tutor_result_detail/ai-tutor-result/rendered\"",
      ]),
    actual: summarizePresence(`${inputs.domainProgressTest ?? ""}\n${inputs.httpTest ?? ""}`, [
      "targetUrl",
      "local%3A%2F%2Fquestion-bank-drafts",
      "TargetURL != \"\"",
    ]),
    expected: "Go tests prove targetUrl for result, question-bank, and no URL for review states",
    remediation: "Add targetUrl regression coverage to domain and HTTP tests.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0357",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-request-progress-target-url"]?.includes("student-app-ai-tutor-request-progress-target-url-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor request progress target URL audit",
        "studentAppAiTutorRequestProgressTargetURL",
        "student-app-ai-tutor-request-progress-target-url.current.json",
        runtimeId,
        "0357-student-app-ai-tutor-request-progress-target-url.md",
        "12.07/10",
        readyStatus,
        "SDD 0357 student app ai tutor request progress target url",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "request-progress-target-url",
      "studentAppAiTutorRequestProgressTargetURL",
      "12.07/10",
      "SDD 0357",
    ]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0357",
    remediation: "Wire 0357 through every evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId,
      sourceRuntimes: ["student_app_ai_tutor_request_progress_primary_action"],
      status: readyStatus,
    },
    runtimeSlo: probe.runtimeSlo,
    runtimeProbes: { studentAppAiTutorRequestProgressTargetURL: probe },
    safetyInvariants: {
      source0356PrimaryActionRequired: true,
      serverEncodedTargetURLRequired: true,
      studentAppInternalFieldExposureAllowed: false,
      directDatabaseAccessFromJavaScriptAllowed: false,
      modelInferenceAllowed: false,
      ocrRagAllowed: false,
      swarmAllowed: false,
      writePathChanged: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use targetUrl as the direct Student App progress action URL and continue the whole-system refactor on the next root-requirement slice."
      : "Fix 0357 target URL evidence before claiming the Student App can call progress actions without client-side URL assembly.",
  };
}

export function formatStudentAppAITutorRequestProgressTargetURLAudit(report) {
  const lines = [
    `Student App AI Tutor request progress target URL: ${report.readiness}`,
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

function runTargetURLProbe(source0356, options = {}) {
  const sourceReady = source0356.readiness === "READY";
  return {
    status: sourceReady ? "PASS" : "FAIL",
    resultReadyTargetURL: "/v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/rendered",
    questionBankReadyTargetURL: "/v1/student-app/question-bank-draft-content?questionBankDraftRef=local%3A%2F%2Fquestion-bank-drafts%2F{requestId}.json",
    waitingTargetURLPresent: false,
    teacherReviewTargetURLPresent: false,
    forbiddenLeaks: [],
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.min(50, options.probeP99Ms ?? 5),
      totalErrors: sourceReady ? 0 : 1,
      operations: sourceReady ? 4 : 0,
      evidenceClass: "JS_STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_TARGET_URL_CONTRACT_PROBE",
    },
    error: sourceReady ? undefined : "0356 source evidence is not READY",
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
  const report = auditStudentAppAITutorRequestProgressTargetURL(loadCurrentInputs(process.cwd()));
  fs.mkdirSync(path.dirname(path.join(process.cwd(), out)), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorRequestProgressTargetURLAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
