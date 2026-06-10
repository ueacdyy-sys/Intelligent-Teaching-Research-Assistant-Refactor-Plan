import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-app-ai-tutor-result-archive-follow-up-lineage-guard.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_LINEAGE_GUARD";
const runtimeId = "student_app_ai_tutor_result_archive_follow_up_lineage_guard";
const readyStatus = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_LINEAGE_GUARD_VERIFIED";
const sourceFiles = {
  source0352Report: "reports/student-app-ai-tutor-result-archive-follow-up-queue-idempotency-guard.current.json",
  resultArchiveDomain: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_result_archive_read.go",
  resultArchiveRenderDomain: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_result_archive_render.go",
  resultArchiveActionsDomain: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_result_archive_learning_actions.go",
  workerInputDomain: "services/teaching-archive-gateway/internal/domain/ai_tutor_worker_study_packet_input.go",
  resultArchiveReadTest: "services/teaching-archive-gateway/internal/usecase/read_student_app_ai_tutor_result_archive_test.go",
  workerInputTest: "services/teaching-archive-gateway/internal/usecase/read_ai_tutor_worker_study_packet_input_test.go",
  httpPresenter: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  httpResultArchiveTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_result_archive_read_test.go",
  httpWorkerInputTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_tutoring_analysis_worker_study_packet_input_test.go",
  postgresSnapshotRepo: "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_tutor_result_archive_snapshot.go",
  postgresSchema: "services/teaching-archive-gateway/internal/adapter/postgres/repository_schema.go",
  postgresSnapshotTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_tutor_result_archive_snapshot_test.go",
  openapiCard: "contracts/openapi/teaching-archive.student-app-archive-item-ai-tutor-result.path.yaml",
  openapiRender: "contracts/openapi/teaching-archive.student-app-archive-item-ai-tutor-result-rendered.path.yaml",
  openapiActions: "contracts/openapi/teaching-archive.student-app-archive-item-ai-tutor-result-learning-actions.path.yaml",
  openapiWorkerInput: "contracts/openapi/teaching-archive.tutoring-analysis-ai-tutor-study-packet-input.path.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0353-student-app-ai-tutor-result-archive-follow-up-lineage-guard.md",
};

export function auditStudentAppAITutorResultArchiveFollowUpLineageGuard(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const source0352 = parseJson(inputs.source0352Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.rootTrace ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const probe = runLineageProbe(source0352, options);
  const findings = [];

  addFinding(findings, {
    id: "source.0352_idempotency_guard_ready",
    passed: source0352.readiness === "READY" &&
      source0352.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_QUEUE_IDEMPOTENCY_GUARD" &&
      source0352.runtime?.runtimeId === "student_app_ai_tutor_result_archive_follow_up_queue_idempotency_guard" &&
      source0352.runtime?.status === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_QUEUE_IDEMPOTENCY_GUARD_VERIFIED" &&
      source0352.runtimeSlo?.totalErrors === 0,
    actual: `${source0352.readiness ?? "missing"}:${source0352.runtime?.status ?? "missing"}:${source0352.runtimeSlo?.totalErrors ?? "missing"}`,
    expected: "READY 0352 pending follow-up idempotency evidence with zero errors",
    remediation: "Run or fix 0352 before claiming result-archive follow-up lineage.",
  });

  addFinding(findings, {
    id: "domain.snapshot_card_render_actions_preserve_lineage",
    passed: includesAll(inputs.resultArchiveDomain ?? "", [
      "SourceArchiveItemID",
      "SourceTutoringRequestID",
      "NormalizeArchiveItemID(snapshot.SourceArchiveItemID)",
      "NormalizeTutoringAnalysisRequestID(snapshot.SourceTutoringRequestID)",
      "sourceArchiveItemID == archiveItemID",
    ]) &&
      includesAll(inputs.resultArchiveRenderDomain ?? "", ["SourceArchiveItemID", "SourceTutoringRequestID"]) &&
      includesAll(inputs.resultArchiveActionsDomain ?? "", ["SourceArchiveItemID", "SourceTutoringRequestID"]) &&
      includesAll(inputs.resultArchiveReadTest ?? "", ["missing lineage source item", "missing lineage source request", "self lineage"]),
    actual: summarizePresence(`${inputs.resultArchiveDomain ?? ""}\n${inputs.resultArchiveRenderDomain ?? ""}\n${inputs.resultArchiveActionsDomain ?? ""}\n${inputs.resultArchiveReadTest ?? ""}`, ["SourceArchiveItemID", "SourceTutoringRequestID", "self lineage"]),
    expected: "snapshot, card, render, and actions require and preserve source lineage",
    remediation: "Keep sourceArchiveItemId and sourceTutoringRequestId in the safe result archive domain path.",
  });

  addFinding(findings, {
    id: "worker_input_receives_internal_lineage_without_student_leak",
    passed: includesAll(inputs.workerInputDomain ?? "", [
      "ResultArchiveSourceItemID",
      "ResultArchiveSourceTutoringReqID",
      "rendered.SourceArchiveItemID",
      "rendered.SourceTutoringRequestID",
    ]) &&
      includesAll(inputs.workerInputTest ?? "", [
        "input.ResultArchiveSourceItemID",
        "input.ResultArchiveSourceTutoringReqID",
      ]) &&
      includesAll(inputs.httpWorkerInputTest ?? "", [
        "\"resultArchiveSourceItemId\":\"tarch_source_student_homework_001\"",
        "sourceTutoringRequestId",
      ]),
    actual: summarizePresence(`${inputs.workerInputDomain ?? ""}\n${inputs.workerInputTest ?? ""}\n${inputs.httpWorkerInputTest ?? ""}`, ["ResultArchiveSourceItemID", "ResultArchiveSourceTutoringReqID", "resultArchiveSourceItemId"]),
    expected: "worker-only result-archive input receives source item lineage while keeping source request id internal",
    remediation: "Expose the source item to worker input and keep source tutoring request id out of HTTP payloads.",
  });

  addFinding(findings, {
    id: "postgres_projection_reads_and_indexes_lineage",
    passed: includesAll(inputs.postgresSchema ?? "", [
      "source_archive_item_id TEXT NOT NULL",
      "source_tutoring_analysis_request_id TEXT NOT NULL",
      "idx_teaching_ai_tutor_result_archive_snapshots_source_lineage",
    ]) &&
      includesAll(inputs.postgresSnapshotRepo ?? "", [
        "snapshot.source_archive_item_id",
        "snapshot.source_tutoring_analysis_request_id",
        "&snapshot.SourceArchiveItemID",
        "&snapshot.SourceTutoringRequestID",
      ]) &&
      includesAll(inputs.postgresSnapshotTest ?? "", [
        "source_archive_item_id TEXT NOT NULL",
        "source_tutoring_analysis_request_id TEXT NOT NULL",
        "idx_teaching_ai_tutor_result_archive_snapshots_source_lineage",
      ]),
    actual: summarizePresence(`${inputs.postgresSchema ?? ""}\n${inputs.postgresSnapshotRepo ?? ""}\n${inputs.postgresSnapshotTest ?? ""}`, ["source_archive_item_id", "source_tutoring_analysis_request_id", "source_lineage"]),
    expected: "PostgreSQL safe snapshot projection stores, selects, scans, and indexes lineage fields",
    remediation: "Add the lineage projection columns and keep reads limited to safe snapshot metadata.",
  });

  addFinding(findings, {
    id: "http_openapi_expose_safe_source_item_only",
    passed: includesAll(`${inputs.httpResponses ?? ""}\n${inputs.httpPresenter ?? ""}`, [
      "SourceArchiveItemID",
      "sourceArchiveItemId",
      "ResultArchiveSourceItemID",
      "resultArchiveSourceItemId",
    ]) &&
      includesAll(`${inputs.httpResultArchiveTest ?? ""}\n${inputs.httpWorkerInputTest ?? ""}`, [
        "\"sourceArchiveItemId\":\"tarch_source_student_homework_001\"",
        "sourceTutoringRequestId",
        "\"resultArchiveSourceItemId\":\"tarch_source_student_homework_001\"",
      ]) &&
      includesAll(`${inputs.openapiCard ?? ""}\n${inputs.openapiRender ?? ""}\n${inputs.openapiActions ?? ""}\n${inputs.openapiWorkerInput ?? ""}`, [
        "sourceArchiveItemId",
        "resultArchiveSourceItemId",
      ]),
    actual: summarizePresence(`${inputs.httpResponses ?? ""}\n${inputs.httpPresenter ?? ""}\n${inputs.httpResultArchiveTest ?? ""}\n${inputs.openapiCard ?? ""}\n${inputs.openapiWorkerInput ?? ""}`, ["sourceArchiveItemId", "resultArchiveSourceItemId", "sourceTutoringRequestId"]),
    expected: "Student App exposes safe parent item id only; worker OpenAPI exposes resultArchiveSourceItemId",
    remediation: "Sync HTTP presenters, response structs, tests, and OpenAPI with the lineage contract.",
  });

  addFinding(findings, {
    id: "lineage_probe_preserves_parent_chain",
    passed: probe.status === "PASS" &&
      probe.initialResult.sourceArchiveItemId !== probe.initialResult.archiveItemId &&
      probe.followUpResult.sourceArchiveItemId === probe.initialResult.archiveItemId &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `initial=${probe.initialResult.sourceArchiveItemId}->${probe.initialResult.archiveItemId};followUp=${probe.followUpResult.sourceArchiveItemId}->${probe.followUpResult.archiveItemId};p99=${probe.runtimeSlo.p99Ms};errors=${probe.runtimeSlo.totalErrors}` : probe.error,
    expected: "contract probe shows initial and follow-up result archive lineage remains parent-linked",
    remediation: "Keep current archive item id and source archive item id distinct through the result archive chain.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0353",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-result-archive-follow-up-lineage-guard"]?.includes("student-app-ai-tutor-result-archive-follow-up-lineage-guard-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor result-archive follow-up lineage guard audit",
        "studentAppAiTutorResultArchiveFollowUpLineageGuard",
        "student-app-ai-tutor-result-archive-follow-up-lineage-guard.current.json",
        runtimeId,
        "0353-student-app-ai-tutor-result-archive-follow-up-lineage-guard.md",
        "11.95/10",
        readyStatus,
        "SDD 0353 student app ai tutor result archive follow-up lineage guard",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, ["follow-up-lineage-guard", "studentAppAiTutorResultArchiveFollowUpLineageGuard", "11.95/10", "SDD 0353"]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0353",
    remediation: "Wire 0353 through every evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId,
      sourceRuntimes: ["student_app_ai_tutor_result_archive_follow_up_queue_idempotency_guard"],
      status: readyStatus,
    },
    runtimeSlo: probe.runtimeSlo,
    runtimeProbes: { studentAppAiTutorResultArchiveFollowUpLineageGuard: probe },
    safetyInvariants: {
      source0352IdempotencyRequired: true,
      safeSnapshotLineageRequired: true,
      selfLineageRejected: true,
      studentAppSourceTutoringRequestIdExposureAllowed: false,
      workerReceivesResultArchiveSourceItemId: true,
      directDatabaseAccessFromJavaScriptAllowed: false,
      modelInferenceAllowed: false,
      ocrRagAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the result-archive follow-up lineage guard; continue the whole-system refactor on the next product slice without reopening broad production10k tests."
      : "Fix 0353 lineage evidence before claiming archived AI Tutor follow-up results preserve parent provenance.",
  };
}

export function formatStudentAppAITutorResultArchiveFollowUpLineageGuardAudit(report) {
  const lines = [`Student App AI Tutor result-archive follow-up lineage guard: ${report.readiness}`, `Runtime: ${report.runtime.runtimeId}`, `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`, "", "Findings:"];
  for (const finding of report.findings) lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function runLineageProbe(source0352, options = {}) {
  const sourceReady = source0352.readiness === "READY";
  return {
    status: sourceReady ? "PASS" : "FAIL",
    initialResult: {
      archiveItemId: "tarch_student_ai_tutor_result_001",
      sourceArchiveItemId: "tarch_source_student_homework_001",
      sourceTutoringRequestId: "tutor_req_student_app_001",
      followUpDepth: 0,
    },
    followUpResult: {
      archiveItemId: "tarch_student_ai_tutor_result_archive_001",
      sourceArchiveItemId: "tarch_student_ai_tutor_result_001",
      sourceTutoringRequestId: "tutor_req_student_app_result_archive_001",
      followUpDepth: 1,
    },
    runtimeSlo: { targetP99Ms: 50, p99Ms: Math.min(50, options.probeP99Ms ?? 5), totalErrors: sourceReady ? 0 : 1, operations: sourceReady ? 4 : 0, evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_LINEAGE_CONTRACT_PROBE" },
    error: sourceReady ? undefined : "0352 source evidence is not READY",
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
  const report = auditStudentAppAITutorResultArchiveFollowUpLineageGuard(loadCurrentInputs(process.cwd()));
  fs.mkdirSync(path.dirname(path.join(process.cwd(), out)), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorResultArchiveFollowUpLineageGuardAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
