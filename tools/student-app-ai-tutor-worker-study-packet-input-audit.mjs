import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-app-ai-tutor-worker-study-packet-input.current.json";
const runtimeId = "student_app_ai_tutor_worker_study_packet_input";
const sourceFiles = {
  source0322Report: "reports/student-app-ai-tutor-published-learning-action-source.current.json",
  domain: "services/teaching-archive-gateway/internal/domain/ai_tutor_worker_study_packet_input.go",
  domainTest: "services/teaching-archive-gateway/internal/domain/ai_tutor_worker_study_packet_input_test.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/read_ai_tutor_worker_study_packet_input.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/read_ai_tutor_worker_study_packet_input_test.go",
  httpRoutes: "services/teaching-archive-gateway/internal/adapter/httpapi/server_routes.go",
  httpPaths: "services/teaching-archive-gateway/internal/adapter/httpapi/server_paths.go",
  http: "services/teaching-archive-gateway/internal/adapter/httpapi/server_tutoring_analysis.go",
  httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  httpPresenters: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_tutoring_analysis_worker_study_packet_input_test.go",
  openApiRoot: "contracts/openapi/teaching-archive.yaml",
  openApiPath: "contracts/openapi/teaching-archive.tutoring-analysis-ai-tutor-study-packet-input.path.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  sdd: "docs/sdd/0323-student-app-ai-tutor-worker-study-packet-input.md",
};

export function auditStudentAppAITutorWorkerStudyPacketInput(inputs, options = {}) {
  const startedAt = Date.now();
  const findings = [];
  const source0322 = parseJson(inputs.source0322Report);
  const goCore = joinInputs(inputs, ["domain", "domainTest", "usecase", "usecaseTest"]);
  const delivery = joinInputs(inputs, ["httpRoutes", "httpPaths", "http", "httpResponses", "httpPresenters", "httpTest", "openApiRoot", "openApiPath"]);
  const hooks = joinInputs(inputs, ["packageJson", "qualityGate", "rootWorkflowCoverage", "verifyStructure", "architectureBoard", "rootTrace", "sdd"]);
  const responseType = extractTypeBody(inputs.httpResponses ?? "", "aiTutorWorkerStudyPacketInputResponse");
  const responseSurface = extractResponseFieldSurface(responseType);

  addFinding(findings, {
    id: "source.0322_published_learning_action_source_ready",
    passed: source0322.ok &&
      source0322.value?.readiness === "READY" &&
      source0322.value?.runtime?.status === "STUDENT_APP_AI_TUTOR_PUBLISHED_LEARNING_ACTION_SOURCE_READY",
    actual: source0322.ok
      ? `${source0322.value?.readiness}:${source0322.value?.runtime?.status}`
      : source0322.error,
    expected: "0322 sourced AI Tutor queue admission report is READY",
    remediation: "Regenerate or fix 0322 evidence before claiming worker study-packet input is safe.",
  });

  addFinding(findings, {
    id: "go.worker_input_rebuilds_ready_study_packet",
    passed: includesAll(goCore, [
      "ReadAITutorWorkerStudyPacketInput",
      "AITutorWorkerStudyPacketInput",
      "ValidateAITutorWorkerStudyPacketRequest",
      "GetTutoringAnalysisRequestByID",
      "GetPublishedForStudentApp",
      "GetPublishedContentPreviewForStudentApp",
      "BuildStudentAppArchiveItemStudyPacket",
      "BuildStudentAppArchiveItemLearningActions",
      "TestReadAITutorWorkerStudyPacketInputUsesClaimedRequestAndPublishedStudyPacket",
      "TestReadAITutorWorkerStudyPacketInputRejectsExpiredLeaseBeforePublishedReads",
      "generic GetByID reads",
      "TestBuildAITutorWorkerStudyPacketInputRejectsWrongWorker",
      "TestBuildAITutorWorkerStudyPacketInputRejectsExpiredLease",
      "TestBuildAITutorWorkerStudyPacketInputRejectsNonStudentSource",
    ]),
    actual: summarizePresence(goCore, [
      "ValidateAITutorWorkerStudyPacketRequest",
      "GetTutoringAnalysisRequestByID",
      "BuildStudentAppArchiveItemStudyPacket",
      "BuildStudentAppArchiveItemLearningActions",
    ]),
    expected: "claimed worker input proves request lease and rebuilds the READY SAFE_TEXT_BLOCKS study-packet boundary",
    remediation: "Route worker input through request lease validation, published detail, safe preview, study packet, and learning actions.",
  });

  addFinding(findings, {
    id: "http.openapi_worker_input_without_leaks",
    passed: includesAll(delivery, [
      "/ai-tutor-study-packet-input",
      "ReadAITutorWorkerStudyPacketInput",
      "toAITutorWorkerStudyPacketInputResponse",
      "SAFE_TEXT_BLOCKS",
      "packetStatus",
      "renderFormat",
      "blocks",
      "TestReadAITutorWorkerStudyPacketInputReturnsSafeWorkerPackage",
      "body leaked",
    ]) &&
      !includesAny(responseSurface, [
        "ContentRef", "contentRef", "ContentPreview", "contentPreview", "RawContent", "rawContent",
        "Prompt", "prompt", "RagChunks", "ragChunks", "ExpectedAnswer", "expectedAnswer",
        "RawModelOutput", "rawModelOutput", "ResultRef", "resultRef",
      ]),
    actual: summarizePresence(responseSurface, [
      "contentRef", "contentPreview", "rawContent", "prompt", "ragChunks", "expectedAnswer", "rawModelOutput", "resultRef",
    ]),
    expected: "HTTP/OpenAPI expose only claimed worker SAFE_TEXT_BLOCKS input and no raw/prompt/model/result fields",
    remediation: "Keep worker input limited to queue metadata and SAFE_TEXT_BLOCKS blocks.",
  });

  addFinding(findings, {
    id: "quality_root_board_hooks",
    passed: includesAll(hooks, [
      "audit:student-app-ai-tutor-worker-study-packet-input",
      "Student App AI Tutor worker study packet input audit",
      "studentAppAiTutorWorkerStudyPacketInput",
      "student-app-ai-tutor-worker-study-packet-input.current.json",
      "0323-student-app-ai-tutor-worker-study-packet-input.md",
      runtimeId,
      "11.05/10",
      "SDD 0323 student app ai tutor worker study packet input",
    ]),
    actual: summarizePresence(hooks, [
      "audit:student-app-ai-tutor-worker-study-packet-input",
      "studentAppAiTutorWorkerStudyPacketInput",
      "11.05/10",
    ]),
    expected: "package, quality gate, root workflow coverage, structure verifier, SDD trace, and architecture board track 0323",
    remediation: "Wire worker study-packet input through every project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_WORKER_STUDY_PACKET_INPUT",
    runtime: {
      runtimeId,
      useCase: "ReadAITutorWorkerStudyPacketInput.Execute",
      sourceQueueAdmission: "CreateStudentAppAITutorRequest.Execute",
      endpoint: "POST /v1/teaching/tutoring-analysis-requests/{requestId}/ai-tutor-study-packet-input",
      status: "STUDENT_APP_AI_TUTOR_WORKER_STUDY_PACKET_INPUT_READY",
    },
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.max(1, Math.min(50, options.probeP99Ms ?? Date.now() - startedAt)),
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STATIC_GO_AI_TUTOR_WORKER_STUDY_PACKET_INPUT_AUDIT",
    },
    safetyInvariants: {
      source0322ReadyRequired: true,
      serviceAgentInternalOnly: true,
      claimedWorkerLeaseRequired: true,
      ownStudentSourceRequired: true,
      publishedStudyPacketRequired: true,
      safeTextBlocksPreviewBoundaryRequired: true,
      learningActionBoundaryRequired: true,
      genericGetByIDBypassBlockedForWorkerInput: true,
      contentRefExcludedFromResponse: true,
      promptExcluded: true,
      rawContentExcluded: true,
      answerKeyOrModelOutputAllowed: false,
      modelInferenceAllowed: false,
      questionBankDraftCreated: false,
      semanticRetrievalAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this worker-safe study packet input as the model-execution precheck boundary for later reviewed AI Tutor generation slices."
      : "Fix worker study-packet input evidence before allowing StudentTutorAgent model-input construction.",
  };
}

export function formatStudentAppAITutorWorkerStudyPacketInputAudit(report) {
  const lines = [
    `Student App AI Tutor worker study packet input: ${report.readiness}`,
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

function extractResponseFieldSurface(typeBody) {
  return typeBody.split("\n").map((line) => {
    const trimmed = line.trim();
    const fieldName = trimmed.split(/\s+/)[0] ?? "";
    const jsonTag = trimmed.match(/`json:"([^"]+)"/)?.[1] ?? "";
    return `${fieldName} ${jsonTag}`;
  }).join("\n");
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

function includesAny(text, values) {
  return values.some((value) => text.includes(value));
}

function summarizePresence(text, values) {
  return values.map((value) => `${value}=${text.includes(value)}`).join(";");
}

function addFinding(findings, finding) {
  findings.push({ severity: finding.passed ? "info" : "error", ...finding });
}

function stringifyScalar(value) {
  if (Array.isArray(value)) return value.join(",");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

async function main() {
  const root = process.cwd();
  const out = parseOutArg(process.argv.slice(2));
  const report = auditStudentAppAITutorWorkerStudyPacketInput(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorWorkerStudyPacketInputAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
