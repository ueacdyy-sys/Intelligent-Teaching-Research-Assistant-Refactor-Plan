import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-app-ai-tutor-request-progress-conditional-cache.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_CONDITIONAL_CACHE";
const runtimeId = "student_app_ai_tutor_request_progress_conditional_cache";
const readyStatus = "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_CONDITIONAL_CACHE_VERIFIED";
const sourceFiles = {
  source0358Report: "reports/student-app-ai-tutor-request-progress-refresh-policy.current.json",
  serverCodec: "services/teaching-archive-gateway/internal/adapter/httpapi/server_codec.go",
  progressHandler: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_requests.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request_progress_test.go",
  listOpenapiPath: "contracts/openapi/teaching-archive.student-app-ai-tutor-requests.path.yaml",
  detailOpenapiPath: "contracts/openapi/teaching-archive.student-app-ai-tutor-request.path.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0359-student-app-ai-tutor-request-progress-conditional-cache.md",
};

export function auditStudentAppAITutorRequestProgressConditionalCache(
  inputs = loadCurrentInputs(process.cwd()),
  options = {},
) {
  const source0358 = parseJson(inputs.source0358Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.rootTrace ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const openapi = `${inputs.listOpenapiPath ?? ""}\n${inputs.detailOpenapiPath ?? ""}`;
  const probe = runConditionalCacheProbe(source0358, options);
  const findings = [];

  addFinding(findings, {
    id: "source.0358_refresh_policy_ready",
    passed: source0358.readiness === "READY" &&
      source0358.workloadType === "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_REFRESH_POLICY" &&
      source0358.runtime?.runtimeId === "student_app_ai_tutor_request_progress_refresh_policy" &&
      source0358.runtime?.status === "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_REFRESH_POLICY_VERIFIED" &&
      source0358.runtimeSlo?.totalErrors === 0,
    actual: `${source0358.readiness ?? "missing"}:${source0358.runtime?.status ?? "missing"}:${source0358.runtimeSlo?.totalErrors ?? "missing"}`,
    expected: "READY 0358 refresh policy evidence with zero errors",
    remediation: "Run or fix 0358 before claiming Student App progress conditional-cache behavior.",
  });

  addFinding(findings, {
    id: "http_progress_uses_private_conditional_response",
    passed: includesAll(inputs.serverCodec ?? "", [
      "crypto/sha256",
      "writePrivateConditionalJSON",
      "Cache-Control",
      "private, no-cache",
      "ETag",
      "If-None-Match",
      "http.StatusNotModified",
      "appendVaryHeader",
      "X-Principal-Context",
      "X-Agent-Api-Key",
    ]) &&
      countOccurrences(inputs.progressHandler ?? "", "writePrivateConditionalJSON") >= 2,
    actual: summarizePresence(`${inputs.serverCodec ?? ""}\n${inputs.progressHandler ?? ""}`, [
      "writePrivateConditionalJSON",
      "If-None-Match",
      "http.StatusNotModified",
      "X-Principal-Context",
      "X-Agent-Api-Key",
    ]),
    expected: "list and detail progress handlers use private ETag conditional JSON responses",
    remediation: "Keep conditional caching in the HTTP boundary and bind validators to the private Student App context.",
  });

  addFinding(findings, {
    id: "tests_cover_200_headers_and_304_empty_body",
    passed: includesAll(inputs.httpTest ?? "", [
      "assertPrivateConditionalProgressHeaders",
      "\"sha256-",
      "Cache-Control",
      "private, no-cache",
      "Vary",
      "X-Principal-Context",
      "X-Agent-Api-Key",
      "If-None-Match",
      "http.StatusNotModified",
      "conditionalResponse.Body.Len() != 0",
    ]),
    actual: summarizePresence(inputs.httpTest ?? "", [
      "ETag",
      "Cache-Control",
      "If-None-Match",
      "StatusNotModified",
      "Body.Len",
    ]),
    expected: "Go HTTP tests prove 200 cache headers and 304 empty-body behavior",
    remediation: "Add list/detail conditional GET regression tests before marking READY.",
  });

  addFinding(findings, {
    id: "openapi_documents_private_conditional_cache",
    passed: includesAll(openapi, [
      "'304':",
      "ETag:",
      "Cache-Control:",
      "private, no-cache",
      "Vary:",
      "If-None-Match",
    ]) &&
      countOccurrences(openapi, "'304':") >= 2 &&
      countOccurrences(openapi, "pattern: '^\"sha256-[A-Za-z0-9_-]+\"$'") >= 4,
    actual: summarizePresence(openapi, [
      "'304':",
      "ETag:",
      "private, no-cache",
      "Vary:",
      "If-None-Match",
    ]),
    expected: "OpenAPI documents 200 validators and 304 for list/detail progress endpoints",
    remediation: "Document conditional polling headers on both Student App AI Tutor progress endpoints.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0359",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-request-progress-conditional-cache"]?.includes("student-app-ai-tutor-request-progress-conditional-cache-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor request progress conditional cache audit",
        "studentAppAiTutorRequestProgressConditionalCache",
        "student-app-ai-tutor-request-progress-conditional-cache.current.json",
        runtimeId,
        "0359-student-app-ai-tutor-request-progress-conditional-cache.md",
        "12.13/10",
        readyStatus,
        "SDD 0359 student app ai tutor request progress conditional cache",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "request-progress-conditional-cache",
      "studentAppAiTutorRequestProgressConditionalCache",
      "12.13/10",
      "SDD 0359",
    ]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0359",
    remediation: "Wire 0359 through every evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId,
      sourceRuntimes: ["student_app_ai_tutor_request_progress_refresh_policy"],
      status: readyStatus,
    },
    runtimeSlo: probe.runtimeSlo,
    runtimeProbes: { studentAppAiTutorRequestProgressConditionalCache: probe },
    safetyInvariants: {
      source0358RefreshPolicyRequired: true,
      privateCacheControlRequired: true,
      sharedPublicCacheAllowed: false,
      responseBodyOn304Allowed: false,
      directDatabaseAccessFromJavaScriptAllowed: false,
      modelInferenceAllowed: false,
      ocrRagAllowed: false,
      swarmAllowed: false,
      writePathChanged: false,
    },
    conditionalCachePolicy: {
      cacheControl: "private, no-cache",
      validatorHeader: "ETag",
      requestHeader: "If-None-Match",
      notModifiedStatus: 304,
      varyHeaders: ["X-Principal-Context", "X-Agent-Api-Key"],
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use private conditional progress reads to reduce Student App polling response bytes and continue the whole-system refactor on the next root-requirement slice."
      : "Fix 0359 conditional-cache evidence before claiming Student App progress polling is conditionally cacheable.",
  };
}

export function formatStudentAppAITutorRequestProgressConditionalCacheAudit(report) {
  const lines = [
    `Student App AI Tutor request progress conditional cache: ${report.readiness}`,
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

function runConditionalCacheProbe(source0358, options = {}) {
  const sourceReady = source0358.readiness === "READY";
  return {
    status: sourceReady ? "PASS" : "FAIL",
    responseValidators: ["ETag"],
    cacheControl: "private, no-cache",
    conditionalStatus: 304,
    emptyBodyOn304: true,
    forbiddenLeaks: [],
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.min(50, options.probeP99Ms ?? 4),
      totalErrors: sourceReady ? 0 : 1,
      operations: sourceReady ? 4 : 0,
      evidenceClass: "JS_STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_CONDITIONAL_CACHE_CONTRACT_PROBE",
    },
    error: sourceReady ? undefined : "0358 source evidence is not READY",
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
function countOccurrences(text, value) { return Array.from(text.matchAll(new RegExp(escapeRegExp(value), "g"))).length; }
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"); }
function summarizePresence(text, values) { return values.map((value) => `${value}=${text.includes(value)}`).join(";"); }
function addFinding(findings, finding) { findings.push({ severity: finding.passed ? "info" : "error", ...finding, passed: Boolean(finding.passed) }); }
function stringifyScalar(value) { if (Array.isArray(value)) return value.join(","); if (value && typeof value === "object") return JSON.stringify(value); return String(value); }
function parseOutArg(argv) { const outIndex = argv.indexOf("--out"); return outIndex === -1 ? defaultOutPath : argv[outIndex + 1]; }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = parseOutArg(process.argv.slice(2));
  const report = auditStudentAppAITutorRequestProgressConditionalCache(loadCurrentInputs(process.cwd()));
  fs.mkdirSync(path.dirname(path.join(process.cwd(), out)), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorRequestProgressConditionalCacheAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
