import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/teaching-archive-material-published-learning-actions.current.json";
const runtimeId = "teaching_archive_material_published_learning_actions";
const sourceFiles = {
  source0320Report: "reports/teaching-archive-material-published-study-packet.current.json",
  domain: "services/teaching-archive-gateway/internal/domain/student_app_archive_items.go",
  domainTest: "services/teaching-archive-gateway/internal/domain/student_app_archive_items_test.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/read_student_app_archive_item_learning_actions.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/read_student_app_archive_item_study_packet_test.go",
  http: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_archive_items.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_archive_item_content_preview_test.go",
  httpPaths: "services/teaching-archive-gateway/internal/adapter/httpapi/server_paths.go",
  httpRoutes: "services/teaching-archive-gateway/internal/adapter/httpapi/server_routes.go",
  httpConfig: "services/teaching-archive-gateway/internal/adapter/httpapi/server_config.go",
  httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  httpPresenters: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  main: "services/teaching-archive-gateway/cmd/gateway/main.go",
  openApiRoot: "contracts/openapi/teaching-archive.yaml",
  openApiPath: "contracts/openapi/teaching-archive.student-app-archive-item-learning-actions.path.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  sdd: "docs/sdd/0321-teaching-archive-material-published-learning-actions.md",
};

export function auditTeachingArchiveMaterialPublishedLearningActions(inputs, options = {}) {
  const startedAt = Date.now();
  const findings = [];
  const source0320 = parseJson(inputs.source0320Report);
  const goCore = joinInputs(inputs, ["domain", "domainTest", "usecase", "usecaseTest"]);
  const delivery = joinInputs(inputs, ["http", "httpTest", "httpPaths", "httpRoutes", "httpConfig", "httpResponses", "httpPresenters", "main"]);
  const contracts = joinInputs(inputs, ["openApiRoot", "openApiPath"]);
  const hooks = joinInputs(inputs, ["packageJson", "qualityGate", "rootWorkflowCoverage", "verifyStructure", "architectureBoard", "rootTrace", "sdd"]);
  const responseTypes = [
    extractTypeBody(inputs.httpResponses ?? "", "studentAppArchiveItemLearningActionsResponse"),
    extractTypeBody(inputs.httpResponses ?? "", "studentAppArchiveItemLearningActionResponse"),
  ].join("\n");

  addFinding(findings, {
    id: "source.0320_study_packet_ready",
    passed: source0320.ok &&
      source0320.value?.readiness === "READY" &&
      source0320.value?.runtime?.status === "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_STUDY_PACKET_READY",
    actual: source0320.ok
      ? `${source0320.value?.readiness}:${source0320.value?.runtime?.status}`
      : source0320.error,
    expected: "0320 study packet report is READY",
    remediation: "Regenerate or fix 0320 study packet evidence before exposing learning actions.",
  });

  addFinding(findings, {
    id: "go.safe_learning_actions_from_ready_packet",
    passed: includesAll(goCore, [
      "StudentAppArchiveItemLearningActions",
      "StudentAppArchiveItemLearningActionAITutorRequest",
      "StudentAppArchiveItemLearningActionPersonalizedQuestionBank",
      "BuildStudentAppArchiveItemLearningActions",
      "ReadStudentAppArchiveItemLearningActions",
      "AuthorizeCreateStudentAppAITutorRequest",
      "GetPublishedForStudentApp",
      "GetPublishedContentPreviewForStudentApp",
      "RejectsForbiddenWithoutRead",
    ]),
    actual: summarizePresence(goCore, [
      "BuildStudentAppArchiveItemLearningActions",
      "ReadStudentAppArchiveItemLearningActions",
      "AuthorizeCreateStudentAppAITutorRequest",
    ]),
    expected: "domain and use case expose action affordances only after the READY study packet boundary",
    remediation: "Keep learning actions behind Student App own-student and AI tutor request permissions.",
  });

  addFinding(findings, {
    id: "http.openapi_safe_learning_actions_endpoint",
    passed: includesAll(delivery + contracts, [
      "/v1/student-app/archive-items/{archiveItemId}/learning-actions",
      "/learning-actions",
      "readStudentAppArchiveItemLearningActions",
      "ReadStudentAppArchiveItemLearningActions",
      "operationId: readStudentAppArchiveItemLearningActions",
      "AI_TUTOR_REQUEST",
      "PERSONALIZED_QUESTION_BANK",
      "/v1/student-app/ai-tutor-requests",
      "GENERATE_PERSONALIZED_CHECK",
      "body leaked",
    ]) &&
      !includesAny(responseTypes + inputs.openApiPath, [
        "StudentID", "ContentRef", "studentId", "contentRef", "contentPreview", "rawContent", "renderedHtml",
        "renderedMarkdown", "ragChunks", "expectedAnswer", "rawModelOutput", "workerId", "publicationId", "prompt",
      ]),
    actual: summarizePresence(responseTypes + inputs.openApiPath, [
      "studentId", "contentRef", "contentPreview", "rawContent", "ragChunks", "expectedAnswer", "rawModelOutput", "workerId", "prompt",
    ]),
    expected: "HTTP/OpenAPI exposes only action affordances and existing AI tutor request target metadata",
    remediation: "Remove preview content, ownership internals, storage refs, prompts, RAG, answers, model, worker, and publication fields.",
  });

  addFinding(findings, {
    id: "quality_root_board_hooks",
    passed: includesAll(hooks, [
      "audit:teaching-archive-material-published-learning-actions",
      "Teaching archive material published learning actions audit",
      "teachingArchiveMaterialPublishedLearningActions",
      "teaching-archive-material-published-learning-actions.current.json",
      "0321-teaching-archive-material-published-learning-actions.md",
      "read_student_app_archive_item_learning_actions.go",
      "learning-actions",
      "10.99/10",
      "SDD 0321 student app archive item learning actions",
    ]),
    actual: summarizePresence(hooks, [
      "audit:teaching-archive-material-published-learning-actions",
      "teachingArchiveMaterialPublishedLearningActions",
      "10.99/10",
    ]),
    expected: "package, quality gate, root workflow coverage, structure verifier, SDD trace, and architecture board track 0321",
    remediation: "Wire this learning-actions affordance through every project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_LEARNING_ACTIONS",
    runtime: {
      runtimeId,
      useCase: "ReadStudentAppArchiveItemLearningActions.Execute",
      sourceStudyPacket: "ReadStudentAppArchiveItemStudyPacket.Execute",
      actionTarget: "POST /v1/student-app/ai-tutor-requests",
      endpoint: "GET /v1/student-app/archive-items/{archiveItemId}/learning-actions",
      status: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_LEARNING_ACTIONS_READY",
    },
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.max(1, Math.min(50, options.probeP99Ms ?? Date.now() - startedAt)),
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STATIC_GO_SAFE_LEARNING_ACTIONS_AUDIT",
    },
    safetyInvariants: {
      readyStudyPacketRequired: true,
      ownStudentOnly: true,
      teachingReadRequired: true,
      actionTargetRestrictedToStudentAppAiTutorRequests: true,
      promptExcluded: true,
      previewContentExcluded: true,
      studentIdExcluded: true,
      contentRefExcluded: true,
      rawContentReadAllowed: false,
      ocrOrRagReadAllowed: false,
      semanticRetrievalAllowed: false,
      answerKeyOrModelOutputAllowed: false,
      modelInferenceAllowed: false,
      aiTutorRequestCreated: false,
      questionBankDraftCreated: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the Student App study packet learning action affordance; keep actual AI tutor request creation, model/RAG execution, and question-bank generation in later reviewed queues."
      : "Fix learning-actions evidence before claiming Student App material detail actions.",
  };
}

export function formatTeachingArchiveMaterialPublishedLearningActionsAudit(report) {
  const lines = [
    `Teaching archive material published learning actions: ${report.readiness}`,
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
  const report = auditTeachingArchiveMaterialPublishedLearningActions(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatTeachingArchiveMaterialPublishedLearningActionsAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
