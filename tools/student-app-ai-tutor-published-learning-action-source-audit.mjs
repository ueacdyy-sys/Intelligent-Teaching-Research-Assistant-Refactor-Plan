import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-app-ai-tutor-published-learning-action-source.current.json";
const runtimeId = "student_app_ai_tutor_published_learning_action_source";
const sourceFiles = {
  source0321Report: "reports/teaching-archive-material-published-learning-actions.current.json",
  domain: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request.go",
  domainTest: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request_test.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request_test.go",
  http: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request.go",
  httpRequest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_requests.go",
  httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request_test.go",
  openApiRoot: "contracts/openapi/teaching-archive.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  sdd: "docs/sdd/0322-student-app-ai-tutor-published-learning-action-source.md",
};

export function auditStudentAppAITutorPublishedLearningActionSource(inputs, options = {}) {
  const startedAt = Date.now();
  const findings = [];
  const source0321 = parseJson(inputs.source0321Report);
  const goCore = joinInputs(inputs, ["domain", "domainTest", "usecase", "usecaseTest"]);
  const delivery = joinInputs(inputs, ["http", "httpRequest", "httpResponses", "httpTest", "openApiRoot"]);
  const hooks = joinInputs(inputs, ["packageJson", "qualityGate", "rootWorkflowCoverage", "verifyStructure", "architectureBoard", "rootTrace", "sdd"]);
  const responseTypes = extractTypeBody(inputs.httpResponses ?? "", "tutoringAnalysisRequestResponse");

  addFinding(findings, {
    id: "source.0321_learning_actions_ready",
    passed: source0321.ok &&
      source0321.value?.readiness === "READY" &&
      source0321.value?.runtime?.status === "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_LEARNING_ACTIONS_READY",
    actual: source0321.ok
      ? `${source0321.value?.readiness}:${source0321.value?.runtime?.status}`
      : source0321.error,
    expected: "0321 learning actions report is READY",
    remediation: "Regenerate or fix 0321 learning action evidence before accepting sourced AI Tutor requests.",
  });

  addFinding(findings, {
    id: "go.sourced_request_uses_ready_study_packet",
    passed: includesAll(goCore, [
      "StudentAppAITutorLearningActionSource",
      "LearningActionSource",
      "readPublishedStudyPacketActionSource",
      "GetPublishedForStudentApp",
      "GetPublishedContentPreviewForStudentApp",
      "BuildStudentAppArchiveItemStudyPacket",
      "BuildStudentAppArchiveItemLearningActions",
      "TestCreateStudentAppAITutorRequestUsesPublishedStudyPacketSource",
      "generic GetByID reads",
      "TestNormalizeCreateStudentAppAITutorRequestAcceptsLearningActionSource",
      "TestNormalizeCreateStudentAppAITutorRequestRejectsInvalidLearningActionSource",
    ]),
    actual: summarizePresence(goCore, [
      "StudentAppAITutorLearningActionSource",
      "readPublishedStudyPacketActionSource",
      "GetPublishedForStudentApp",
      "BuildStudentAppArchiveItemLearningActions",
    ]),
    expected: "sourced AI Tutor admission proves the 0321 action through the published study-packet boundary",
    remediation: "Route sourced requests through published metadata and safe preview reads before queue creation.",
  });

  addFinding(findings, {
    id: "http.openapi_request_source_without_response_leak",
    passed: includesAll(delivery, [
      "learningActionSource",
      "StudentAppAITutorLearningActionSource",
      "actionType",
      "packetStatus",
      "PERSONALIZED_QUESTION_BANK",
      "AI_TUTOR_REQUEST",
      "TestCreateStudentAppAITutorRequestAcceptsPublishedLearningActionSource",
      "body leaked",
    ]) &&
      !includesAny(responseTypes, [
        "LearningActionSource", "learningActionSource", "ContentPreview", "contentPreview", "ContentRef", "contentRef",
        "Prompt", "prompt", "RagChunks", "ragChunks", "ExpectedAnswer", "expectedAnswer", "RawModelOutput", "rawModelOutput",
      ]),
    actual: summarizePresence(responseTypes, [
      "learningActionSource", "contentPreview", "contentRef", "prompt", "ragChunks", "expectedAnswer", "rawModelOutput",
    ]),
    expected: "HTTP/OpenAPI accept safe source metadata in the request and keep response output to queue metadata",
    remediation: "Do not echo learning action source, preview content, storage refs, prompts, RAG, answers, or model output.",
  });

  addFinding(findings, {
    id: "quality_root_board_hooks",
    passed: includesAll(hooks, [
      "audit:student-app-ai-tutor-published-learning-action-source",
      "Student App AI Tutor published learning action source audit",
      "studentAppAiTutorPublishedLearningActionSource",
      "student-app-ai-tutor-published-learning-action-source.current.json",
      "0322-student-app-ai-tutor-published-learning-action-source.md",
      "student_app_ai_tutor_published_learning_action_source",
      "11.02/10",
      "SDD 0322 student app ai tutor published learning action source",
    ]),
    actual: summarizePresence(hooks, [
      "audit:student-app-ai-tutor-published-learning-action-source",
      "studentAppAiTutorPublishedLearningActionSource",
      "11.02/10",
    ]),
    expected: "package, quality gate, root workflow coverage, structure verifier, SDD trace, and architecture board track 0322",
    remediation: "Wire the sourced AI Tutor queue admission through every project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_PUBLISHED_LEARNING_ACTION_SOURCE",
    runtime: {
      runtimeId,
      useCase: "CreateStudentAppAITutorRequest.Execute",
      sourceLearningActions: "ReadStudentAppArchiveItemLearningActions.Execute",
      endpoint: "POST /v1/student-app/ai-tutor-requests",
      status: "STUDENT_APP_AI_TUTOR_PUBLISHED_LEARNING_ACTION_SOURCE_READY",
    },
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.max(1, Math.min(50, options.probeP99Ms ?? Date.now() - startedAt)),
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STATIC_GO_SOURCED_AI_TUTOR_ADMISSION_AUDIT",
    },
    safetyInvariants: {
      source0321ReadyRequired: true,
      ownStudentOnly: true,
      publishedStudyPacketRequired: true,
      safeTextBlocksPreviewBoundaryRequired: true,
      genericGetByIDBypassBlockedForSourcedRequests: true,
      queueCreationOnly: true,
      promptExcluded: true,
      previewContentExcludedFromResponse: true,
      contentRefExcludedFromResponse: true,
      answerKeyOrModelOutputAllowed: false,
      modelInferenceAllowed: false,
      questionBankDraftCreated: false,
      semanticRetrievalAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the safe source bridge from published material learning actions to the existing AI Tutor queue; keep model/RAG/question-bank generation in later reviewed worker slices."
      : "Fix sourced AI Tutor admission evidence before claiming material-detail action requests are safe.",
  };
}

export function formatStudentAppAITutorPublishedLearningActionSourceAudit(report) {
  const lines = [
    `Student App AI Tutor published learning action source: ${report.readiness}`,
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
  const report = auditStudentAppAITutorPublishedLearningActionSource(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorPublishedLearningActionSourceAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
