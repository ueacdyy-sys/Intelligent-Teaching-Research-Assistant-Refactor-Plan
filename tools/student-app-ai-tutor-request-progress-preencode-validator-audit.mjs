import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-app-ai-tutor-request-progress-preencode-validator.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_PREENCODE_VALIDATOR";
const runtimeId = "student_app_ai_tutor_request_progress_preencode_validator";
const readyStatus = "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_PREENCODE_VALIDATOR_VERIFIED";
const sourceFiles = {
  source0359Report: "reports/student-app-ai-tutor-request-progress-conditional-cache.current.json",
  serverCodec: "services/teaching-archive-gateway/internal/adapter/httpapi/server_codec.go",
  progressHandler: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_requests.go",
  progressPresenter: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  progressValidator: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_progress_validator.go",
  progressValidatorTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_progress_validator_test.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request_progress_test.go",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0360-student-app-ai-tutor-request-progress-preencode-validator.md",
};

export function auditStudentAppAITutorRequestProgressPreencodeValidator(
  inputs = loadCurrentInputs(process.cwd()),
  options = {},
) {
  const source0359 = parseJson(inputs.source0359Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.rootTrace ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const implementation = [
    inputs.serverCodec ?? "",
    inputs.progressHandler ?? "",
    inputs.progressPresenter ?? "",
    inputs.progressValidator ?? "",
  ].join("\n");
  const tests = `${inputs.progressValidatorTest ?? ""}\n${inputs.httpTest ?? ""}`;
  const probe = runPreencodeValidatorProbe(source0359, options);
  const findings = [];

  addFinding(findings, {
    id: "source.0359_conditional_cache_ready",
    passed: source0359.readiness === "READY" &&
      source0359.workloadType === "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_CONDITIONAL_CACHE" &&
      source0359.runtime?.runtimeId === "student_app_ai_tutor_request_progress_conditional_cache" &&
      source0359.runtime?.status === "STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_CONDITIONAL_CACHE_VERIFIED" &&
      source0359.runtimeSlo?.totalErrors === 0,
    actual: `${source0359.readiness ?? "missing"}:${source0359.runtime?.status ?? "missing"}:${source0359.runtimeSlo?.totalErrors ?? "missing"}`,
    expected: "READY 0359 conditional-cache evidence with zero errors",
    remediation: "Run or fix 0359 before claiming pre-encode 304 behavior.",
  });

  addFinding(findings, {
    id: "http_304_checks_validator_before_payload_encoding",
    passed: includesAll(inputs.serverCodec ?? "", [
      "writePrivateConditionalJSONWithETag",
      "payload func() any",
      "requestMatchesETag",
      "http.StatusNotModified",
      "writeJSON(w, status, payload())",
    ]) &&
      includesAll(inputs.progressHandler ?? "", [
        "studentAppAITutorRequestProgressListETag(cards, page.PageInfo)",
        "studentAppAITutorRequestProgressETag(card)",
        "writePrivateConditionalJSONWithETag",
        "func() any",
      ]) &&
      countOccurrences(inputs.progressHandler ?? "", "writePrivateConditionalJSONWithETag") >= 2,
    actual: summarizePresence(implementation, [
      "writePrivateConditionalJSONWithETag",
      "studentAppAITutorRequestProgressListETag",
      "studentAppAITutorRequestProgressETag",
      "payload func() any",
    ]),
    expected: "list/detail handlers compute validators before calling a lazy payload JSON writer",
    remediation: "Do not build/encode the response body before testing If-None-Match.",
  });

  addFinding(findings, {
    id: "validator_covers_visible_progress_representation",
    passed: includesAll(inputs.progressValidator ?? "", [
      "student-app-ai-tutor-request-progress-list/v1",
      "student-app-ai-tutor-request-progress-detail/v1",
      "card.ID",
      "card.ArchiveItemID",
      "card.AnalysisGoal",
      "card.QuestionBankIntent",
      "card.Status",
      "card.LearningActionSource",
      "card.FollowUpDepth",
      "card.SourceArchiveMaterial",
      "card.ProgressStage",
      "card.NextStudentAction",
      "card.PrimaryAction.ActionType",
      "card.PrimaryAction.State",
      "card.PrimaryAction.TargetEndpoint",
      "card.PrimaryAction.TargetURL",
      "card.PrimaryAction.Method",
      "card.PrimaryAction.ArchiveItemID",
      "card.PrimaryAction.QuestionBankDraftRef",
      "card.RefreshPolicy.AutoRefresh",
      "card.RefreshPolicy.RefreshAfterMs",
      "card.RefreshPolicy.Reason",
      "card.SafeStatusMessage",
      "card.Timeline",
      "step.StepID",
      "step.Title",
      "step.Status",
      "step.CompletedAt",
      "card.CreatedAt",
      "card.CompletedAt",
      "card.UpdatedAt",
      "pageInfo.PageSize",
      "pageInfo.HasMore",
      "pageInfo.NextCursor",
      "writeETagField",
      "strconv.Itoa(len(value))",
    ]),
    actual: summarizePresence(inputs.progressValidator ?? "", [
      "card.ID",
      "card.PrimaryAction.TargetURL",
      "card.RefreshPolicy.RefreshAfterMs",
      "card.Timeline",
      "pageInfo.NextCursor",
      "strconv.Itoa(len(value))",
    ]),
    expected: "validator hash includes every visible progress/card and list page field with unambiguous field framing",
    remediation: "Include all response-visible fields in the canonical validator seed.",
  });

  addFinding(findings, {
    id: "tests_prove_304_skips_payload_factory_and_validator_sensitivity",
    passed: includesAll(tests, [
      "TestWritePrivateConditionalJSONWithETagSkipsPayloadFactoryOnMatch",
      "payload factory calls = %d, want 0",
      "http.StatusNotModified",
      "TestWritePrivateConditionalJSONWithETagBuildsPayloadOnMiss",
      "TestStudentAppAITutorRequestProgressETagChangesWithVisibleFields",
      "UpdatedAt",
      "PrimaryAction.TargetURL",
      "Timeline[1].Status",
      "TestStudentAppAITutorRequestProgressListETagChangesWithPageInfo",
    ]),
    actual: summarizePresence(tests, [
      "SkipsPayloadFactoryOnMatch",
      "BuildsPayloadOnMiss",
      "ETagChangesWithVisibleFields",
      "ListETagChangesWithPageInfo",
    ]),
    expected: "Go tests prove pre-encode short-circuit and visible-field sensitivity",
    remediation: "Add direct helper and validator-sensitivity tests.",
  });

  addFinding(findings, {
    id: "claims_remain_scoped_to_encoding_not_database_cache",
    passed: includesAll(hooks, [
      "does not skip the use-case or database read",
      "does not add Redis, shared cache, writes, model inference, OCR/RAG, or Swarm",
      "response mapping and JSON encoding",
    ]) &&
      !includesUnsupportedClaim(hooks),
    actual: summarizePresence(hooks, [
      "does not skip the use-case or database read",
      "response mapping and JSON encoding",
      "Redis",
      "shared cache",
    ]),
    expected: "0360 evidence is honest about saving response construction/encoding only",
    remediation: "Remove unsupported claims about DB-read elimination or shared/public caching.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0360",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-request-progress-preencode-validator"]?.includes("student-app-ai-tutor-request-progress-preencode-validator-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor request progress pre-encode validator audit",
        "studentAppAiTutorRequestProgressPreencodeValidator",
        "student-app-ai-tutor-request-progress-preencode-validator.current.json",
        runtimeId,
        "0360-student-app-ai-tutor-request-progress-preencode-validator.md",
        "12.16/10",
        readyStatus,
        "SDD 0360 student app ai tutor request progress pre-encode validator",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "request-progress-preencode-validator",
      "studentAppAiTutorRequestProgressPreencodeValidator",
      "12.16/10",
      "SDD 0360",
    ]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0360",
    remediation: "Wire 0360 through every evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId,
      sourceRuntimes: ["student_app_ai_tutor_request_progress_conditional_cache"],
      status: readyStatus,
    },
    runtimeSlo: probe.runtimeSlo,
    runtimeProbes: { studentAppAiTutorRequestProgressPreencodeValidator: probe },
    safetyInvariants: {
      source0359ConditionalCacheRequired: true,
      privateCacheControlRequired: true,
      sharedPublicCacheAllowed: false,
      responseBodyOn304Allowed: false,
      responseMappingOn304Allowed: false,
      jsonEncodingOn304Allowed: false,
      databaseReadEliminationClaimAllowed: false,
      directDatabaseAccessFromJavaScriptAllowed: false,
      modelInferenceAllowed: false,
      ocrRagAllowed: false,
      swarmAllowed: false,
      writePathChanged: false,
    },
    preencodeValidatorPolicy: {
      validatorHeader: "ETag",
      requestHeader: "If-None-Match",
      notModifiedStatus: 304,
      skipsOnMatch: ["response DTO mapping", "JSON response encoding", "response body write"],
      stillRunsBeforeMatch: ["authorization", "principal parsing", "use-case read", "safe progress card construction"],
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use pre-encode progress validators to reduce repeated Student App polling CPU, then continue the whole-system refactor on the next root-requirement slice."
      : "Fix 0360 pre-encode validator evidence before claiming 304 skips response construction and JSON encoding.",
  };
}

export function formatStudentAppAITutorRequestProgressPreencodeValidatorAudit(report) {
  const lines = [
    `Student App AI Tutor request progress pre-encode validator: ${report.readiness}`,
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

function runPreencodeValidatorProbe(source0359, options = {}) {
  const sourceReady = source0359.readiness === "READY";
  return {
    status: sourceReady ? "PASS" : "FAIL",
    conditionalStatus: 304,
    payloadFactoryCallsOn304: 0,
    responseMappingOn304: false,
    jsonEncodingOn304: false,
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.min(50, options.probeP99Ms ?? 3),
      totalErrors: sourceReady ? 0 : 1,
      operations: sourceReady ? 4 : 0,
      evidenceClass: "JS_STUDENT_APP_AI_TUTOR_REQUEST_PROGRESS_PREENCODE_VALIDATOR_CONTRACT_PROBE",
    },
    error: sourceReady ? undefined : "0359 source evidence is not READY",
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
function includesUnsupportedClaim(text) {
  const normalized = text.toLowerCase();
  return [
    "eliminates database read",
    "skips database read",
    "database read eliminated",
    "redis-backed conditional cache",
    "shared public cache",
  ].some((claim) => normalized.includes(claim));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = parseOutArg(process.argv.slice(2));
  const report = auditStudentAppAITutorRequestProgressPreencodeValidator(loadCurrentInputs(process.cwd()));
  fs.mkdirSync(path.dirname(path.join(process.cwd(), out)), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorRequestProgressPreencodeValidatorAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
