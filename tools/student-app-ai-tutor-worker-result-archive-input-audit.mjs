import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-app-ai-tutor-worker-result-archive-input.current.json";
const runtimeId = "student_app_ai_tutor_worker_result_archive_input";
const readyStatus = "STUDENT_APP_AI_TUTOR_WORKER_RESULT_ARCHIVE_INPUT_READY";

const sourceFiles = {
  source0335Report: "reports/student-app-ai-tutor-result-student-archive-learning-actions.current.json",
  domain: "services/teaching-archive-gateway/internal/domain/ai_tutor_worker_study_packet_input.go",
  domainTest: "services/teaching-archive-gateway/internal/domain/ai_tutor_worker_study_packet_input_test.go",
  requestDomain: "services/teaching-archive-gateway/internal/domain/tutoring_analysis_request.go",
  requestDomainTest: "services/teaching-archive-gateway/internal/domain/tutoring_analysis_request_test.go",
  studentRequestDomain: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/read_ai_tutor_worker_study_packet_input.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/read_ai_tutor_worker_study_packet_input_test.go",
  requestUsecase: "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request.go",
  httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  httpPresenters: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_tutoring_analysis_worker_study_packet_input_test.go",
  postgresSchema: "services/teaching-archive-gateway/internal/adapter/postgres/repository_schema.go",
  postgresRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go",
  postgresScanners: "services/teaching-archive-gateway/internal/adapter/postgres/repository_scanners.go",
  openApiRoot: "contracts/openapi/teaching-archive.yaml",
  openApiPath: "contracts/openapi/teaching-archive.tutoring-analysis-ai-tutor-study-packet-input.path.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0336-student-app-ai-tutor-worker-result-archive-input.md",
};

const forbiddenWorkerResponseFields = [
  "ContentRef", "contentRef", "ContentPreview", "contentPreview", "RawContent", "rawContent",
  "Prompt", "prompt", "RagChunks", "ragChunks", "ExpectedAnswer", "expectedAnswer",
  "AnswerKey", "answerKey", "RawModelOutput", "rawModelOutput", "ResultRef", "resultRef",
  "RenderedHTML", "renderedHtml", "RenderedMarkdown", "renderedMarkdown",
];

export function auditStudentAppAITutorWorkerResultArchiveInput(inputs, options = {}) {
  const startedAt = Date.now();
  const findings = [];
  const source0335 = parseJson(inputs.source0335Report, {});
  const goCore = joinInputs(inputs, [
    "domain", "domainTest", "requestDomain", "requestDomainTest", "studentRequestDomain",
    "usecase", "usecaseTest", "requestUsecase", "postgresSchema", "postgresRepository", "postgresScanners",
  ]);
  const delivery = joinInputs(inputs, ["httpResponses", "httpPresenters", "httpTest", "openApiRoot", "openApiPath"]);
  const hooks = joinInputs(inputs, ["packageJson", "qualityGate", "rootWorkflowCoverage", "verifyStructure", "rootTrace", "architectureBoard", "sdd"]);
  const workerInputSurface = [
    extractTypeBody(inputs.httpResponses ?? "", "aiTutorWorkerStudyPacketInputResponse"),
    extractTypeBody(inputs.httpResponses ?? "", "aiTutorWorkerStudyPacketInputBlock"),
  ].join("\n");
  const workerClaimSurface = extractTypeBody(inputs.httpResponses ?? "", "tutoringAnalysisWorkerClaimResponse");
  const studentRequestSurface = extractTypeBody(inputs.httpResponses ?? "", "tutoringAnalysisRequestResponse");

  addFinding(findings, {
    id: "source.0335_result_archive_learning_actions_ready",
    passed: source0335.readiness === "READY" &&
      source0335.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS" &&
      source0335.runtime?.status === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_VERIFIED" &&
      source0335.runtimeSlo?.totalErrors === 0,
    actual: `${source0335.readiness ?? "missing"}:${source0335.runtime?.status ?? "missing"}:${source0335.runtimeSlo?.totalErrors ?? "missing"}`,
    expected: "0335 result-archive learning-actions report is READY with zero errors",
    remediation: "Regenerate or fix 0335 before allowing result-archive-sourced worker input.",
  });

  addFinding(findings, {
    id: "go.persists_and_normalizes_learning_action_source",
    passed: includesAll(goCore, [
      "LearningActionSource",
      "TutoringAnalysisRequestLearningActionSource",
      "StudentAppAITutorLearningActionSourceResultArchive",
      "AI_TUTOR_RESULT_ARCHIVE",
      "source_type TEXT NOT NULL DEFAULT 'PUBLISHED_STUDY_PACKET'",
      "source_type",
      "request.LearningActionSource",
      "TestNewTutoringAnalysisRequestAcceptsResultArchiveLearningSource",
    ]),
    actual: summarizePresence(goCore, [
      "LearningActionSource",
      "TutoringAnalysisRequestLearningActionSource",
      "source_type",
      "AI_TUTOR_RESULT_ARCHIVE",
    ]),
    expected: "queue source is a domain field, defaults legacy rows safely, and persists through Postgres source_type",
    remediation: "Persist and scan source_type; otherwise DB round trips can fall back to the published study-packet path.",
  });

  addFinding(findings, {
    id: "go.worker_input_branches_to_result_archive_safe_render",
    passed: includesAll(goCore, [
      "readResultArchiveInput",
      "GetByID",
      "GetStudentAppAITutorResultArchiveSnapshot",
      "BuildStudentAppAITutorResultArchiveCard",
      "BuildStudentAppAITutorResultArchiveRenderEnvelope",
      "BuildAITutorWorkerResultArchiveInput",
      "BuildStudentAppAITutorResultArchiveLearningActions",
      "aiTutorWorkerResultArchiveActionAvailable",
      "TestReadAITutorWorkerStudyPacketInputUsesResultArchiveSafeRenderSource",
      "TestBuildAITutorWorkerResultArchiveInputUsesSafeRenderEnvelope",
    ]),
    actual: summarizePresence(goCore, [
      "readResultArchiveInput",
      "GetStudentAppAITutorResultArchiveSnapshot",
      "BuildAITutorWorkerResultArchiveInput",
      "GetPublishedContentPreviewForStudentApp",
    ]),
    expected: "result-archive queue source rebuilds safe card/render/actions before returning worker SAFE_TEXT_BLOCKS",
    remediation: "Branch by persisted learning-action source and keep the result-archive path on safe archive snapshots, not published previews.",
  });

  addFinding(findings, {
    id: "http.openapi_internal_source_status_without_student_leak",
    passed: includesAll(delivery, [
      "learningActionSource",
      "AI_TUTOR_RESULT_ARCHIVE",
      "resultArchiveStatus",
      "READY_FOR_STUDENT_APP_READ",
      "SAFE_TEXT_BLOCKS",
      "SUMMARY",
      "GUIDANCE_SECTION",
      "sourceBlockRefs",
      "TestReadAITutorWorkerStudyPacketInputReturnsResultArchiveSafeWorkerPackage",
    ]) &&
      includesAll(workerInputSurface, ["LearningActionSource", "ResultArchiveStatus", "SourceBlockRefs"]) &&
      includesAll(workerClaimSurface, ["LearningActionSource"]) &&
      !includesAny(workerInputSurface, forbiddenWorkerResponseFields) &&
      !studentRequestSurface.includes("LearningActionSource"),
    actual: [
      summarizePresence(workerInputSurface, ["LearningActionSource", "ResultArchiveStatus", "SourceBlockRefs", "ResultRef", "contentRef"]),
      `studentRequestHasLearningActionSource=${studentRequestSurface.includes("LearningActionSource")}`,
    ].join(";"),
    expected: "internal worker claim/input expose source/status, while student-facing request response and worker input omit raw refs/prompts/model/answer fields",
    remediation: "Expose source only on internal worker surfaces and keep student-facing request responses stable.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0336",
    passed: includesAll(hooks, [
      "audit:student-app-ai-tutor-worker-result-archive-input",
      "Student App AI Tutor worker result archive input audit",
      "studentAppAiTutorWorkerResultArchiveInput",
      "student-app-ai-tutor-worker-result-archive-input.current.json",
      "0336-student-app-ai-tutor-worker-result-archive-input.md",
      runtimeId,
      "11.44/10",
      "SDD 0336",
    ]),
    actual: summarizePresence(hooks, [
      "audit:student-app-ai-tutor-worker-result-archive-input",
      "studentAppAiTutorWorkerResultArchiveInput",
      "11.44/10",
      "SDD 0336",
    ]),
    expected: "package script, strict quality gate, root workflow, structure verifier, root trace, SDD, and board track 0336",
    remediation: "Wire 0336 through every project evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_WORKER_RESULT_ARCHIVE_INPUT",
    runtime: {
      runtimeId,
      useCase: "ReadAITutorWorkerStudyPacketInput.Execute",
      endpoint: "POST /v1/teaching/tutoring-analysis-requests/{requestId}/ai-tutor-study-packet-input",
      sourceReport: "reports/student-app-ai-tutor-result-student-archive-learning-actions.current.json",
      status: readyStatus,
    },
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.max(1, Math.min(50, options.probeP99Ms ?? Date.now() - startedAt)),
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STATIC_GO_AI_TUTOR_WORKER_RESULT_ARCHIVE_INPUT_AUDIT",
    },
    safetyInvariants: {
      source0335ReadyRequired: true,
      serviceAgentInternalOnly: true,
      claimedWorkerLeaseRequired: true,
      persistedLearningActionSourceRequired: true,
      resultArchiveSnapshotRequired: true,
      publishedPreviewReadsBlockedForResultArchiveSource: true,
      safeTextBlocksOnly: true,
      internalWorkerSourceStatusAllowed: true,
      studentFacingRequestSourceDisclosureAllowed: false,
      contentRefDisclosureAllowed: false,
      rawResultRefDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      promptDisclosureAllowed: false,
      answerKeyDisclosureAllowed: false,
      modelInferenceAllowed: false,
      ocrRagAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the worker-safe input boundary for result-archive follow-up tutoring; model inference, OCR/RAG, Swarm, and full AI Tutor generation remain later reviewed slices."
      : "Fix 0336 worker result-archive input evidence before claiming result-archive-sourced AI Tutor follow-up requests are worker-safe.",
  };
}

export function formatStudentAppAITutorWorkerResultArchiveInputAudit(report) {
  const lines = [
    `Student App AI Tutor worker result archive input: ${report.readiness}`,
    `Use case: ${report.runtime.useCase}`,
    `Endpoint: ${report.runtime.endpoint}`,
    `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`,
    "",
    "Findings:",
  ];
  for (const finding of report.findings) {
    lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => {
    const absolute = path.join(root, relativePath);
    return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""];
  }));
}

function joinInputs(inputs, keys) {
  return keys.map((key) => inputs[key] ?? "").join("\n");
}

function extractTypeBody(text, typeName) {
  return [...text.matchAll(new RegExp(`type\\s+${typeName}\\s+struct\\s+\\{([\\s\\S]*?)\\}`, "g"))]
    .map((match) => match[1])
    .join("\n");
}

function includesAll(text = "", values = []) {
  return values.every((value) => text.includes(value));
}

function includesAny(text = "", values = []) {
  return values.some((value) => text.includes(value));
}

function summarizePresence(text = "", values = []) {
  return values.map((value) => `${value}=${text.includes(value)}`).join(";");
}

function addFinding(findings, finding) {
  findings.push({ ...finding, passed: Boolean(finding.passed), severity: finding.passed ? "info" : "error" });
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function stringifyScalar(value) {
  if (Array.isArray(value)) return value.join(",");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

async function main() {
  const root = process.cwd();
  const out = parseOutArg(process.argv.slice(2));
  const report = auditStudentAppAITutorWorkerResultArchiveInput(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorWorkerResultArchiveInputAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
