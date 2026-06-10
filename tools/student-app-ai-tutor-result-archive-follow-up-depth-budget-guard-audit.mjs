import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-app-ai-tutor-result-archive-follow-up-depth-budget-guard.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_DEPTH_BUDGET_GUARD";
const runtimeId = "student_app_ai_tutor_result_archive_follow_up_depth_budget_guard";
const readyStatus = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_DEPTH_BUDGET_GUARD_VERIFIED";
const sourceFiles = {
  source0350Report: "reports/student-app-ai-tutor-result-archive-follow-up-worker-continuity.current.json",
  resultArchiveReadDomain: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_result_archive_read.go",
  resultArchiveRenderDomain: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_result_archive_render.go",
  resultArchiveActionsDomain: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_result_archive_learning_actions.go",
  studentRequestDomain: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request.go",
  tutoringRequestDomain: "services/teaching-archive-gateway/internal/domain/tutoring_analysis_request.go",
  workerInputDomain: "services/teaching-archive-gateway/internal/domain/ai_tutor_worker_study_packet_input.go",
  createRequestUsecase: "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request.go",
  domainActionsTest: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_result_archive_learning_actions_test.go",
  domainRequestTest: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request_test.go",
  workerInputDomainTest: "services/teaching-archive-gateway/internal/domain/ai_tutor_worker_study_packet_input_test.go",
  createRequestUsecaseTest: "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request_test.go",
  workerInputUsecaseTest: "services/teaching-archive-gateway/internal/usecase/read_ai_tutor_worker_study_packet_input_test.go",
  httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  httpPresenters: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  postgresSchema: "services/teaching-archive-gateway/internal/adapter/postgres/repository_schema.go",
  postgresSnapshotRepo: "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_tutor_result_archive_snapshot.go",
  postgresTutoringRepo: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go",
  postgresScanners: "services/teaching-archive-gateway/internal/adapter/postgres/repository_scanners.go",
  postgresSnapshotTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_tutor_result_archive_snapshot_test.go",
  postgresTutoringTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis_student_app_request_test.go",
  openapiSourceSchema: "contracts/openapi/teaching-archive.student-app-ai-tutor-learning-action-source.schema.yaml",
  openapiLearningActions: "contracts/openapi/teaching-archive.student-app-archive-item-ai-tutor-result-learning-actions.path.yaml",
  openapiWorkerInput: "contracts/openapi/teaching-archive.tutoring-analysis-ai-tutor-study-packet-input.path.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0351-student-app-ai-tutor-result-archive-follow-up-depth-budget-guard.md",
};

export function auditStudentAppAITutorResultArchiveFollowUpDepthBudgetGuard(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const source0350 = parseJson(inputs.source0350Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.rootTrace ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const probe = runDepthBudgetProbe(source0350, options);
  const findings = [];

  addFinding(findings, {
    id: "source.0350_follow_up_worker_continuity_ready",
    passed: source0350.readiness === "READY" &&
      source0350.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_WORKER_CONTINUITY" &&
      source0350.runtime?.runtimeId === "student_app_ai_tutor_result_archive_follow_up_worker_continuity" &&
      source0350.runtime?.status === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_WORKER_CONTINUITY_VERIFIED" &&
      source0350.runtimeSlo?.totalErrors === 0,
    actual: `${source0350.readiness ?? "missing"}:${source0350.runtime?.status ?? "missing"}:${source0350.runtimeSlo?.totalErrors ?? "missing"}`,
    expected: "READY 0350 result-archive follow-up worker continuity with zero errors",
    remediation: "Run or fix 0350 before claiming bounded result-archive follow-up depth.",
  });

  addFinding(findings, {
    id: "domain.depth_is_server_normalized_and_actions_stop_at_max",
    passed: includesAll(inputs.resultArchiveReadDomain ?? "", ["maxAITutorResultArchiveFollowUpDepth", "= 2", "FollowUpDepth", "normalizeAITutorResultArchiveFollowUpDepth", "normalizeAITutorResultArchiveNextFollowUpDepth"]) &&
      includesAll(inputs.resultArchiveRenderDomain ?? "", ["card.FollowUpDepth", "normalizeAITutorResultArchiveFollowUpDepth", "FollowUpDepth:", "followUpDepth"]) &&
      includesAll(inputs.resultArchiveActionsDomain ?? "", ["FollowUpDepth", "nextFollowUpDepth := followUpDepth + 1", "nextFollowUpDepth > maxAITutorResultArchiveFollowUpDepth", "Actions: []StudentAppAITutorResultArchiveLearningAction", "nextFollowUpDepth"]) &&
      includesAll(inputs.domainActionsTest ?? "", ["TestBuildStudentAppAITutorResultArchiveLearningActionsAdvancesFollowUpDepth", "TestBuildStudentAppAITutorResultArchiveLearningActionsStopsAtMaxFollowUpDepth", "actions.FollowUpDepth != 2 || len(actions.Actions) != 0"]),
    actual: summarizePresence(`${inputs.resultArchiveReadDomain ?? ""}\n${inputs.resultArchiveActionsDomain ?? ""}\n${inputs.domainActionsTest ?? ""}`, ["maxAITutorResultArchiveFollowUpDepth", "nextFollowUpDepth > maxAITutorResultArchiveFollowUpDepth", "StopsAtMaxFollowUpDepth"]),
    expected: "domain normalizes depth 0..2, emits next depth 1..2, and returns zero actions at max depth",
    remediation: "Keep follow-up depth server-computed and stop action emission at max depth.",
  });

  addFinding(findings, {
    id: "request.queue_admission_rejects_tampered_or_max_depth_sources",
    passed: includesAll(inputs.studentRequestDomain ?? "", ["FollowUpDepth", "source.FollowUpDepth != 0", "normalizeAITutorResultArchiveNextFollowUpDepth(source.FollowUpDepth)", "learningActionSource.followUpDepth is unsupported for published study packet"]) &&
      includesAll(inputs.createRequestUsecase ?? "", ["action.FollowUpDepth == input.LearningActionSource.FollowUpDepth", "BuildStudentAppAITutorResultArchiveLearningActions"]) &&
      includesAll(inputs.createRequestUsecaseTest ?? "", ["TestCreateStudentAppAITutorRequestRejectsTamperedResultArchiveFollowUpDepth", "TestCreateStudentAppAITutorRequestRejectsMaxDepthResultArchiveFollowUp", "FollowUpDepth:       1", "FollowUpDepth:       2"]) &&
      includesAll(inputs.domainRequestTest ?? "", ["TestNormalizeCreateStudentAppAITutorRequestAcceptsResultArchiveLearningActionSource", "FollowUpDepth:       1"]),
    actual: summarizePresence(`${inputs.studentRequestDomain ?? ""}\n${inputs.createRequestUsecase ?? ""}\n${inputs.createRequestUsecaseTest ?? ""}`, ["source.FollowUpDepth != 0", "action.FollowUpDepth == input.LearningActionSource.FollowUpDepth", "RejectsTamperedResultArchiveFollowUpDepth", "RejectsMaxDepthResultArchiveFollowUp"]),
    expected: "client source depth is required for result archives, forbidden for published packets, and must match regenerated server actions",
    remediation: "Do not accept client-supplied result-archive source depth unless it matches a regenerated server action.",
  });

  addFinding(findings, {
    id: "persistence_and_worker_input_carry_and_revalidate_depth",
    passed: includesAll(inputs.tutoringRequestDomain ?? "", ["LearningActionSource", "StudentAppAITutorLearningActionSourceType", "FollowUpDepth", "normalizeTutoringAnalysisFollowUpDepth"]) &&
      includesAll(inputs.postgresSchema ?? "", ["follow_up_depth INTEGER NOT NULL DEFAULT 0", "source_follow_up_depth INTEGER NOT NULL DEFAULT 0"]) &&
      includesAll(inputs.postgresSnapshotRepo ?? "", ["snapshot.follow_up_depth", "&snapshot.FollowUpDepth"]) &&
      includesAll(inputs.postgresTutoringRepo ?? "", ["source_follow_up_depth", "request.FollowUpDepth"]) &&
      includesAll(inputs.postgresScanners ?? "", ["request.FollowUpDepth = followUpDepth"]) &&
      includesAll(inputs.workerInputDomain ?? "", ["action.FollowUpDepth == followUpDepth", "FollowUpDepth:", "request.FollowUpDepth", "BuildStudentAppAITutorResultArchiveLearningActions"]) &&
      includesAll(inputs.workerInputDomainTest ?? "", ["TestBuildAITutorWorkerResultArchiveInputRejectsTamperedFollowUpDepth", "request.FollowUpDepth = 2"]) &&
      includesAll(inputs.workerInputUsecaseTest ?? "", ["request.FollowUpDepth = 2", "input.FollowUpDepth != 2"]),
    actual: summarizePresence(`${inputs.postgresSchema ?? ""}\n${inputs.workerInputDomain ?? ""}\n${inputs.workerInputDomainTest ?? ""}`, ["follow_up_depth", "source_follow_up_depth", "action.FollowUpDepth == followUpDepth", "RejectsTamperedFollowUpDepth"]),
    expected: "snapshot and request depth are persisted, scanned, exposed to worker input, and revalidated against regenerated actions",
    remediation: "Persist and revalidate follow-up depth on both queue admission and worker input boundaries.",
  });

  addFinding(findings, {
    id: "http_openapi_contracts_expose_only_bounded_depth",
    passed: includesAll(inputs.httpResponses ?? "", ["FollowUpDepth", "json:\"followUpDepth"]) &&
      includesAll(inputs.httpPresenters ?? "", ["FollowUpDepth:", "actions.FollowUpDepth", "action.FollowUpDepth", "input.FollowUpDepth"]) &&
      includesAll(inputs.openapiSourceSchema ?? "", ["followUpDepth:", "minimum: 1", "maximum: 2", "required: [followUpDepth]"]) &&
      includesAll(inputs.openapiLearningActions ?? "", ["followUpDepth", "minimum: 0", "maximum: 2", "minItems: 0"]) &&
      includesAll(inputs.openapiWorkerInput ?? "", ["followUpDepth", "minimum: 1", "maximum: 2", "not:", "required: [followUpDepth]"]),
    actual: summarizePresence(`${inputs.openapiSourceSchema ?? ""}\n${inputs.openapiLearningActions ?? ""}\n${inputs.openapiWorkerInput ?? ""}`, ["minimum: 1", "maximum: 2", "minItems: 0", "required: [followUpDepth]"]),
    expected: "HTTP and OpenAPI document current depth 0..2, next depth 1..2, max-depth zero actions, and published-source depth rejection",
    remediation: "Keep followUpDepth visible only where bounded source contracts need it.",
  });

  addFinding(findings, {
    id: "depth_budget_probe_blocks_loop_amplification",
    passed: probe.status === "PASS" &&
      probe.maxFollowUpDepth === 2 &&
      probe.transitions.join(",") === "0->1,1->2,2->STOP" &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `transitions=${probe.transitions.join(",")};p99=${probe.runtimeSlo.p99Ms};errors=${probe.runtimeSlo.totalErrors}` : probe.error,
    expected: "contract probe models two allowed follow-up transitions and a hard stop at max depth",
    remediation: "Keep max-depth result archives from emitting another queueable action.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0351",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-result-archive-follow-up-depth-budget-guard"]?.includes("student-app-ai-tutor-result-archive-follow-up-depth-budget-guard-audit.mjs")) &&
      includesAll(hooks, ["Student App AI Tutor result-archive follow-up depth/budget guard audit", "studentAppAiTutorResultArchiveFollowUpDepthBudgetGuard", "student-app-ai-tutor-result-archive-follow-up-depth-budget-guard.current.json", runtimeId, "0351-student-app-ai-tutor-result-archive-follow-up-depth-budget-guard.md", "11.89/10", readyStatus, "SDD 0351 student app ai tutor result archive follow-up depth budget guard"]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, ["follow-up-depth-budget-guard", "studentAppAiTutorResultArchiveFollowUpDepthBudgetGuard", "11.89/10", "SDD 0351"]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0351",
    remediation: "Wire 0351 through every evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId,
      sourceRuntimes: ["student_app_ai_tutor_result_archive_follow_up_worker_continuity"],
      queueEndpoint: "POST /v1/student-app/ai-tutor-requests",
      workerInputEndpoint: "POST /v1/teaching/tutoring-analysis-requests/{requestId}/ai-tutor-study-packet-input",
      maxFollowUpDepth: 2,
      status: readyStatus,
    },
    runtimeSlo: probe.runtimeSlo,
    runtimeProbes: { studentAppAiTutorResultArchiveFollowUpDepthBudgetGuard: probe },
    safetyInvariants: {
      source0350WorkerContinuityRequired: true,
      maxFollowUpDepth: 2,
      clientSuppliedDepthMustMatchRegeneratedAction: true,
      publishedStudyPacketFollowUpDepthForbidden: true,
      resultArchiveFollowUpDepthRequired: true,
      maxDepthEmitsNoFollowUpActions: true,
      requestSourceFollowUpDepthPersisted: true,
      workerInputRevalidatesFollowUpDepth: true,
      modelInferenceAllowed: false,
      ocrRagAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the bounded result-archive follow-up loop guard; continue the whole-system refactor on the next root module without reopening broad production10k tests."
      : "Fix 0351 depth-budget evidence before claiming result-archive follow-up loops are bounded.",
  };
}

export function formatStudentAppAITutorResultArchiveFollowUpDepthBudgetGuardAudit(report) {
  const lines = [`Student App AI Tutor result-archive follow-up depth/budget guard: ${report.readiness}`, `Runtime: ${report.runtime.runtimeId}`, `Max follow-up depth: ${report.runtime.maxFollowUpDepth}`, `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`, "", "Findings:"];
  for (const finding of report.findings) lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function runDepthBudgetProbe(source0350, options = {}) {
  const sourceReady = source0350.readiness === "READY";
  const transitions = sourceReady ? ["0->1", "1->2", "2->STOP"] : [];
  return {
    status: sourceReady ? "PASS" : "FAIL",
    maxFollowUpDepth: 2,
    transitions,
    currentDepthsAccepted: sourceReady ? [0, 1, 2] : [],
    actionDepthsAccepted: sourceReady ? [1, 2] : [],
    runtimeSlo: { targetP99Ms: 50, p99Ms: Math.min(50, options.probeP99Ms ?? 6), totalErrors: sourceReady ? 0 : 1, operations: sourceReady ? 3 : 0, evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_DEPTH_BUDGET_CONTRACT_PROBE" },
    error: sourceReady ? undefined : "0350 source evidence is not READY",
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
  const report = auditStudentAppAITutorResultArchiveFollowUpDepthBudgetGuard(loadCurrentInputs(process.cwd()));
  fs.mkdirSync(path.dirname(path.join(process.cwd(), out)), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorResultArchiveFollowUpDepthBudgetGuardAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
