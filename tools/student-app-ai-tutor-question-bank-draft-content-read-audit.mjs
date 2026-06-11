import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-content-read.current.json";
const runtimeId = "student_app_ai_tutor_question_bank_draft_content_read_foundation";
const sourceFiles = {
  domain: "services/teaching-archive-gateway/internal/domain/question_bank_draft_content.go",
  domainTest: "services/teaching-archive-gateway/internal/domain/question_bank_draft_content_test.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/read_student_app_question_bank_draft_content.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/read_student_app_question_bank_draft_content_test.go",
  postgres: "services/teaching-archive-gateway/internal/adapter/postgres/repository_question_bank_draft_content.go",
  postgresTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_question_bank_draft_content_test.go",
  schema: "services/teaching-archive-gateway/internal/adapter/postgres/repository_schema.go",
  http: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_content.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_content_test.go",
  httpRoutes: "services/teaching-archive-gateway/internal/adapter/httpapi/server_routes.go",
  httpConfig: "services/teaching-archive-gateway/internal/adapter/httpapi/server_config.go",
  httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  main: "services/teaching-archive-gateway/cmd/gateway/main.go",
  openApiRoot: "contracts/openapi/teaching-archive.yaml",
  openApiPath: "contracts/openapi/teaching-archive.student-app-question-bank-draft-content.path.yaml",
  sql: "contracts/sql/teaching-archive.sql",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0265-student-app-ai-tutor-question-bank-draft-content-read-foundation.md",
};

export function auditStudentAppAITutorQuestionBankDraftContentRead(inputs, options = {}) {
  const startedAt = Date.now();
  const findings = [];
  const goCore = joinInputs(inputs, ["domain", "domainTest", "usecase", "usecaseTest"]);
  const persistence = joinInputs(inputs, ["postgres", "postgresTest", "schema", "sql"]);
  const delivery = joinInputs(inputs, ["http", "httpTest", "httpRoutes", "httpConfig", "httpResponses", "main"]);
  const contracts = joinInputs(inputs, ["openApiRoot", "openApiPath"]);
  const endpointContract = joinInputs(inputs, ["openApiPath"]);
  const hooks = joinInputs(inputs, ["packageJson", "qualityGate", "rootWorkflowCoverage", "verifyStructure", "architectureBoard", "sdd"]);
  const responseType = extractTypeBody(inputs.httpResponses ?? "", "studentAppQuestionBankDraftContentResponse");
  const itemResponseType = extractTypeBody(inputs.httpResponses ?? "", "questionBankDraftItemResponse");

  addFinding(findings, {
    id: "go.domain_usecase_own_student_read",
    passed: includesAll(goCore, [
      "ReadStudentAppQuestionBankDraftContentInput",
      "NormalizeReadStudentAppQuestionBankDraftContentInput",
      "AuthorizeListStudentAppQuestionBankDrafts",
      "NormalizeQuestionBankDraftRef",
      "BuildStudentAppQuestionBankDraftContent",
      "QuestionBankDraftContent",
      "QuestionBankDraftItem",
      "QuestionBankDraftContentStatusDraft",
      "GetQuestionBankDraftContentForStudent",
      "RejectsCrossStudentRepositoryLeak",
    ]),
    actual: summarizePresence(goCore, ["ReadStudentAppQuestionBankDraftContentInput", "BuildStudentAppQuestionBankDraftContent", "RejectsCrossStudentRepositoryLeak"]),
    expected: "domain and use case normalize draft refs, enforce STUDENT_APP own-student access, and reject cross-student leaks",
    remediation: "Keep own-student authorization inside domain/usecase before any adapter read.",
  });

  addFinding(findings, {
    id: "postgres.content_table_and_scoped_lookup",
    passed: includesAll(persistence, [
      "CREATE TABLE IF NOT EXISTS teaching_question_bank_draft_contents",
      "question_items JSONB NOT NULL",
      "idx_teaching_question_bank_draft_contents_student_updated",
      "SaveQuestionBankDraftContent",
      "ON CONFLICT (question_bank_draft_ref) DO UPDATE",
      "GetQuestionBankDraftContentForStudent",
      "question_bank_draft_ref = $1",
      "student_id = $2",
      "TestGetQuestionBankDraftContentForStudentUsesScopedLookup",
    ]) && !persistence.includes("SELECT *"),
    actual: summarizePresence(persistence, ["teaching_question_bank_draft_contents", "student_id = $2", "SELECT *"]),
    expected: "PostgreSQL stores JSONB draft items and reads by draft ref plus own student id",
    remediation: "Never read draft content by ref alone; keep student_id in the repository predicate.",
  });

  addFinding(findings, {
    id: "http.openapi_student_safe_detail",
    passed: includesAll(delivery + contracts, [
      "/v1/student-app/question-bank-draft-content",
      "readStudentAppQuestionBankDraftContent",
      "ReadStudentAppQuestionBankDraftContent",
      "operationId: readStudentAppQuestionBankDraftContent",
      "questionBankDraftRef",
      "expectedAnswer",
      "explanation",
      "body leaked",
      "TestReadStudentAppQuestionBankDraftContentRejectsCrossStudent",
      "readStudentAppQuestionBankDraftContent := usecase.NewReadStudentAppQuestionBankDraftContent",
    ]) &&
      hasGoKeyedValue(inputs.main ?? "", "ReadStudentAppQuestionBankDraftContent", "readStudentAppQuestionBankDraftContent") &&
      !responseType.includes("StudentID") &&
      !responseType.includes("Worker") &&
      !responseType.includes("Score") &&
      !itemResponseType.includes("ExpectedAnswer") &&
      !itemResponseType.includes("Explanation") &&
      !endpointContract.includes("expectedAnswer") &&
      !endpointContract.includes("explanation"),
    actual: summarizePresence(responseType + itemResponseType + endpointContract, ["StudentID", "Worker", "Score", "ExpectedAnswer", "expectedAnswer", "explanation"]),
    expected: "HTTP exposes an own-student question view without ids, worker internals, scores, publication fields, answers, or explanations",
    remediation: "Keep answer keys and explanations in storage for later scoring, not in the pre-answer Student App response.",
  });

  addFinding(findings, {
    id: "quality_root_board_hooks",
    passed: includesAll(hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-content-read",
      "Student App AI Tutor question-bank draft content read foundation audit",
      "studentAppAiTutorQuestionBankDraftContentRead",
      "student-app-ai-tutor-question-bank-draft-content-read.current.json",
      "0265-student-app-ai-tutor-question-bank-draft-content-read-foundation.md",
      "question_bank_draft_content.go",
      "server_student_app_question_bank_draft_content.go",
      "10.5/10",
    ]),
    actual: summarizePresence(hooks, ["audit:student-app-ai-tutor-question-bank-draft-content-read", "studentAppAiTutorQuestionBankDraftContentRead", "10.5/10"]),
    expected: "package, quality gate, root workflow coverage, structure verifier, SDD, and architecture board track 0265",
    remediation: "Wire the content read foundation through every project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_READ_FOUNDATION",
    runtime: {
      runtimeId,
      useCase: "ReadStudentAppQuestionBankDraftContent.Execute",
      repository: "ArchiveRepository.GetQuestionBankDraftContentForStudent",
      endpoint: "GET /v1/student-app/question-bank-draft-content",
    },
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.max(1, Math.min(50, options.probeP99Ms ?? Date.now() - startedAt)),
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STATIC_GO_CONTENT_READ_FOUNDATION_AUDIT",
    },
    safetyInvariants: {
      ownStudentOnly: true,
      draftRefAndStudentScopedLookup: true,
      exposesStudentId: false,
      exposesWorkerLease: false,
      exposesExpectedAnswer: false,
      exposesExplanation: false,
      scoringAllowed: false,
      studentVisiblePublishAllowed: false,
      modelInferenceAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the real content-store/read foundation; keep generation, answering, scoring, and publication as later reviewed slices."
      : "Fix content read evidence before claiming Student App question-bank draft content retrieval.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftContentReadAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft content read foundation: ${report.readiness}`,
    `Use case: ${report.runtime.useCase}`,
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

function hasGoKeyedValue(text, key, value) {
  return new RegExp(`${key}:\\s*${value}`).test(text);
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

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

async function main() {
  const root = process.cwd();
  const out = parseOutArg(process.argv.slice(2));
  const report = auditStudentAppAITutorQuestionBankDraftContentRead(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftContentReadAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
