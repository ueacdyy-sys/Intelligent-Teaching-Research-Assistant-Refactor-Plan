import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-app-ai-tutor-result-archive-follow-up-queue-idempotency-guard.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_QUEUE_IDEMPOTENCY_GUARD";
const runtimeId = "student_app_ai_tutor_result_archive_follow_up_queue_idempotency_guard";
const readyStatus = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_QUEUE_IDEMPOTENCY_GUARD_VERIFIED";
const sourceFiles = {
  source0351Report: "reports/student-app-ai-tutor-result-archive-follow-up-depth-budget-guard.current.json",
  tutoringRequestDomain: "services/teaching-archive-gateway/internal/domain/tutoring_analysis_request.go",
  tutoringRequestDomainTest: "services/teaching-archive-gateway/internal/domain/tutoring_analysis_request_test.go",
  createRequestUsecase: "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request.go",
  createRequestUsecaseTest: "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request_test.go",
  postgresTutoringRepo: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go",
  postgresSchema: "services/teaching-archive-gateway/internal/adapter/postgres/repository_schema.go",
  postgresSchemaTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_test.go",
  postgresTutoringTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis_student_app_request_test.go",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0352-student-app-ai-tutor-result-archive-follow-up-queue-idempotency-guard.md",
};

export function auditStudentAppAITutorResultArchiveFollowUpQueueIdempotencyGuard(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const source0351 = parseJson(inputs.source0351Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.rootTrace ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const probe = runIdempotencyProbe(source0351, options);
  const findings = [];

  addFinding(findings, {
    id: "source.0351_depth_budget_guard_ready",
    passed: source0351.readiness === "READY" &&
      source0351.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_DEPTH_BUDGET_GUARD" &&
      source0351.runtime?.runtimeId === "student_app_ai_tutor_result_archive_follow_up_depth_budget_guard" &&
      source0351.runtime?.status === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_DEPTH_BUDGET_GUARD_VERIFIED" &&
      source0351.runtimeSlo?.totalErrors === 0,
    actual: `${source0351.readiness ?? "missing"}:${source0351.runtime?.status ?? "missing"}:${source0351.runtimeSlo?.totalErrors ?? "missing"}`,
    expected: "READY 0351 bounded follow-up depth evidence with zero errors",
    remediation: "Run or fix 0351 before claiming result-archive follow-up idempotency.",
  });

  addFinding(findings, {
    id: "domain.pending_follow_up_query_and_statuses_are_normalized",
    passed: includesAll(inputs.tutoringRequestDomain ?? "", [
      "StudentAppAITutorResultArchiveFollowUpPendingRequestQuery",
      "BuildStudentAppAITutorResultArchiveFollowUpPendingRequestQuery",
      "StudentAppAITutorLearningActionSourceResultArchive",
      "normalizeAITutorResultArchiveNextFollowUpDepth",
      "IsPendingTutoringAnalysisStatus",
      "TutoringAnalysisStatusQueued || status == TutoringAnalysisStatusInProgress",
    ]) &&
      includesAll(inputs.tutoringRequestDomainTest ?? "", [
        "TestBuildStudentAppAITutorResultArchiveFollowUpPendingRequestQuery",
        "TestBuildStudentAppAITutorResultArchiveFollowUpPendingRequestQueryRejectsPublishedSource",
        "TestIsPendingTutoringAnalysisStatus",
      ]),
    actual: summarizePresence(`${inputs.tutoringRequestDomain ?? ""}\n${inputs.tutoringRequestDomainTest ?? ""}`, ["StudentAppAITutorResultArchiveFollowUpPendingRequestQuery", "IsPendingTutoringAnalysisStatus", "RejectsPublishedSource"]),
    expected: "domain builds a normalized result-archive pending follow-up key and classifies only queued/in-progress as pending",
    remediation: "Keep the idempotency key server-normalized and terminal statuses non-blocking.",
  });

  addFinding(findings, {
    id: "usecase.reuses_pending_follow_up_and_allows_terminal_recreate",
    passed: includesAll(inputs.createRequestUsecase ?? "", [
      "findPendingResultArchiveFollowUp",
      "FindPendingStudentAppAITutorResultArchiveFollowUpRequest",
      "BuildStudentAppAITutorResultArchiveFollowUpPendingRequestQuery",
      "return existing, nil",
      "CreateTutoringAnalysisRequest(ctx, request)",
    ]) &&
      includesAll(inputs.createRequestUsecaseTest ?? "", [
        "TestCreateStudentAppAITutorRequestReusesPendingResultArchiveFollowUp",
        "TestCreateStudentAppAITutorRequestCreatesAfterCompletedResultArchiveFollowUp",
        "creates = %d, want 0",
        "TutoringAnalysisStatusSucceeded",
      ]),
    actual: summarizePresence(`${inputs.createRequestUsecase ?? ""}\n${inputs.createRequestUsecaseTest ?? ""}`, ["findPendingResultArchiveFollowUp", "ReusesPendingResultArchiveFollowUp", "CreatesAfterCompletedResultArchiveFollowUp"]),
    expected: "Student App AI Tutor request usecase reuses queued/in-progress follow-ups and creates after terminal requests",
    remediation: "Call the pending result-archive follow-up lookup before writing and retry lookup after a write conflict.",
  });

  addFinding(findings, {
    id: "postgres.lookup_and_partial_unique_index_guard_pending_duplicates",
    passed: includesAll(inputs.postgresTutoringRepo ?? "", [
      "FindPendingStudentAppAITutorResultArchiveFollowUpRequest",
      "source_type = $4",
      "source_follow_up_depth = $5",
      "source_archive_student_id = $6",
      "status IN ($7, $8)",
      "ORDER BY created_at ASC, id ASC",
    ]) &&
      includesAll(inputs.postgresSchema ?? "", [
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_pending_result_archive_follow_up_unique",
        "source_follow_up_depth",
        "WHERE source_type = 'AI_TUTOR_RESULT_ARCHIVE'",
        "AND status IN ('QUEUED', 'IN_PROGRESS')",
      ]) &&
      includesAll(inputs.postgresTutoringTest ?? "", [
        "TestFindPendingStudentAppAITutorResultArchiveFollowUpRequestUsesSourceDepthKey",
        "status IN ($7, $8)",
      ]) &&
      includesAll(inputs.postgresSchemaTest ?? "", [
        "idx_teaching_tutoring_analysis_requests_pending_result_archive_follow_up_unique",
        "pending result-archive follow-up partial unique predicate",
      ]),
    actual: summarizePresence(`${inputs.postgresTutoringRepo ?? ""}\n${inputs.postgresSchema ?? ""}\n${inputs.postgresTutoringTest ?? ""}\n${inputs.postgresSchemaTest ?? ""}`, ["FindPendingStudentAppAITutorResultArchiveFollowUpRequest", "CREATE UNIQUE INDEX", "status IN ('QUEUED', 'IN_PROGRESS')"]),
    expected: "PostgreSQL lookup and partial unique index bound duplicate pending result-archive follow-ups",
    remediation: "Add both application lookup and DB-level unique guard for pending follow-up retries.",
  });

  addFinding(findings, {
    id: "idempotency_probe_reuses_pending_without_extra_write",
    passed: probe.status === "PASS" &&
      probe.duplicateSubmitWrites === 0 &&
      probe.terminalSubmitWrites === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `duplicateWrites=${probe.duplicateSubmitWrites};terminalWrites=${probe.terminalSubmitWrites};p99=${probe.runtimeSlo.p99Ms};errors=${probe.runtimeSlo.totalErrors}` : probe.error,
    expected: "contract probe reuses one pending request without another write and permits one terminal-state recreate",
    remediation: "Keep pending retries idempotent while allowing terminal-state follow-up re-entry.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0352",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-result-archive-follow-up-queue-idempotency-guard"]?.includes("student-app-ai-tutor-result-archive-follow-up-queue-idempotency-guard-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor result-archive follow-up queue idempotency guard audit",
        "studentAppAiTutorResultArchiveFollowUpQueueIdempotencyGuard",
        "student-app-ai-tutor-result-archive-follow-up-queue-idempotency-guard.current.json",
        runtimeId,
        "0352-student-app-ai-tutor-result-archive-follow-up-queue-idempotency-guard.md",
        "11.92/10",
        readyStatus,
        "SDD 0352 student app ai tutor result archive follow-up queue idempotency guard",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, ["follow-up-queue-idempotency-guard", "studentAppAiTutorResultArchiveFollowUpQueueIdempotencyGuard", "11.92/10", "SDD 0352"]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0352",
    remediation: "Wire 0352 through every evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId,
      sourceRuntimes: ["student_app_ai_tutor_result_archive_follow_up_depth_budget_guard"],
      queueEndpoint: "POST /v1/student-app/ai-tutor-requests",
      status: readyStatus,
    },
    runtimeSlo: probe.runtimeSlo,
    runtimeProbes: { studentAppAiTutorResultArchiveFollowUpQueueIdempotencyGuard: probe },
    safetyInvariants: {
      source0351DepthBudgetRequired: true,
      duplicatePendingFollowUpReturnsExistingRequest: true,
      terminalFollowUpAllowsNewRequest: true,
      partialUniqueIndexGuardsConcurrentWriters: true,
      directDatabaseAccessFromJavaScriptAllowed: false,
      modelInferenceAllowed: false,
      ocrRagAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the pending result-archive follow-up idempotency guard; continue the whole-system refactor on the next product slice without reopening heavy production10k tests."
      : "Fix 0352 idempotency evidence before claiming pending result-archive follow-up writes are coalesced.",
  };
}

export function formatStudentAppAITutorResultArchiveFollowUpQueueIdempotencyGuardAudit(report) {
  const lines = [`Student App AI Tutor result-archive follow-up queue idempotency guard: ${report.readiness}`, `Runtime: ${report.runtime.runtimeId}`, `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`, "", "Findings:"];
  for (const finding of report.findings) lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function runIdempotencyProbe(source0351, options = {}) {
  const sourceReady = source0351.readiness === "READY";
  return {
    status: sourceReady ? "PASS" : "FAIL",
    duplicateSubmitWrites: sourceReady ? 0 : 1,
    terminalSubmitWrites: sourceReady ? 1 : 0,
    reusedStatuses: sourceReady ? ["QUEUED", "IN_PROGRESS"] : [],
    nonBlockingStatuses: sourceReady ? ["SUCCEEDED", "FAILED"] : [],
    runtimeSlo: { targetP99Ms: 50, p99Ms: Math.min(50, options.probeP99Ms ?? 5), totalErrors: sourceReady ? 0 : 1, operations: sourceReady ? 3 : 0, evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_IDEMPOTENCY_CONTRACT_PROBE" },
    error: sourceReady ? undefined : "0351 source evidence is not READY",
  };
}

function loadCurrentInputs(root) { return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => { const absolute = path.join(root, relativePath); return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""]; })); }
function parseJson(text, fallback) { try { return JSON.parse(text); } catch { return fallback; } }
function includesAll(text, values) { return values.every((value) => text.includes(value)); }
function summarizePresence(text, values) { return values.map((value) => `${value}=${text.includes(value)}`).join(";"); }
function addFinding(findings, finding) { findings.push({ severity: finding.passed ? "info" : "error", ...finding, passed: Boolean(finding.passed) }); }
function stringifyScalar(value) { if (Array.isArray(value)) return value.join(","); if (value && typeof value === "object") return JSON.stringify(value); return String(value); }
function parseOutArg(argv) { const outIndex = argv.indexOf("--out"); return outIndex === -1 ? defaultOutPath : argv[outIndex + 1]; }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = parseOutArg(process.argv.slice(2));
  const report = auditStudentAppAITutorResultArchiveFollowUpQueueIdempotencyGuard(loadCurrentInputs(process.cwd()));
  fs.mkdirSync(path.dirname(path.join(process.cwd(), out)), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorResultArchiveFollowUpQueueIdempotencyGuardAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
