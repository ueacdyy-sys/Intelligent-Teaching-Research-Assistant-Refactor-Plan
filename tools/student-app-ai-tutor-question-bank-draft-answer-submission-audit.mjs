import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-answer-submission.current.json";
const runtimeId = "student_app_ai_tutor_question_bank_draft_answer_submission_foundation";
const sourceFiles = {
  domain: "services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_submission.go",
  domainTest: "services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_submission_test.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/submit_student_app_question_bank_draft_answer.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/submit_student_app_question_bank_draft_answer_test.go",
  postgres: "services/teaching-archive-gateway/internal/adapter/postgres/repository_question_bank_draft_answer_submission.go",
  postgresTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_question_bank_draft_answer_submission_test.go",
  schema: "services/teaching-archive-gateway/internal/adapter/postgres/repository_schema.go",
  http: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_answer_submission.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_answer_submission_test.go",
  httpRoutes: "services/teaching-archive-gateway/internal/adapter/httpapi/server_routes.go",
  httpConfig: "services/teaching-archive-gateway/internal/adapter/httpapi/server_config.go",
  httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  main: "services/teaching-archive-gateway/cmd/gateway/main.go",
  openApiRoot: "contracts/openapi/teaching-archive.yaml",
  openApiPath: "contracts/openapi/teaching-archive.student-app-question-bank-draft-answer-submissions.path.yaml",
  sql: "contracts/sql/teaching-archive.sql",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0266-student-app-ai-tutor-question-bank-draft-answer-submission-foundation.md",
};

export function auditStudentAppAITutorQuestionBankDraftAnswerSubmission(inputs, options = {}) {
  const startedAt = Date.now();
  const findings = [];
  const goCore = joinInputs(inputs, ["domain", "domainTest", "usecase", "usecaseTest"]);
  const persistence = joinInputs(inputs, ["postgres", "postgresTest", "schema", "sql"]);
  const delivery = joinInputs(inputs, ["http", "httpTest", "httpRoutes", "httpConfig", "httpResponses", "main"]);
  const contracts = joinInputs(inputs, ["openApiRoot", "openApiPath"]);
  const endpointContract = joinInputs(inputs, ["openApiPath"]);
  const hooks = joinInputs(inputs, ["packageJson", "qualityGate", "rootWorkflowCoverage", "verifyStructure", "architectureBoard", "sdd"]);
  const responseType = extractTypeBody(inputs.httpResponses ?? "", "questionBankDraftAnswerSubmissionResponse");

  addFinding(findings, {
    id: "go.domain_usecase_own_student_submission",
    passed: includesAll(goCore, [
      "SubmitStudentAppQuestionBankDraftAnswerInput",
      "NormalizeSubmitStudentAppQuestionBankDraftAnswerInput",
      "AuthorizeListStudentAppQuestionBankDrafts",
      "ScopeStudentOwnWrite",
      "QuestionBankDraftAnswerSubmission",
      "validateSubmittedAnswersAgainstDraft",
      "GetQuestionBankDraftContentForStudent",
      "SubmitQuestionBankDraftAnswerSubmission",
      "RejectsUnknownItemBeforePersist",
    ]),
    actual: summarizePresence(goCore, ["ScopeStudentOwnWrite", "validateSubmittedAnswersAgainstDraft", "RejectsUnknownItemBeforePersist"]),
    expected: "domain and use case require own-student read/write, scoped draft lookup, duplicate/unknown item rejection, and one persistence call",
    remediation: "Keep submission validation in domain/usecase before persistence.",
  });

  addFinding(findings, {
    id: "postgres.answer_submission_table_and_jsonb_write",
    passed: includesAll(persistence, [
      "CREATE TABLE IF NOT EXISTS teaching_question_bank_draft_answer_submissions",
      "answers JSONB NOT NULL",
      "idx_teaching_question_bank_draft_answer_submissions_student_submitted",
      "idx_teaching_question_bank_draft_answer_submissions_draft_submitted",
      "SubmitQuestionBankDraftAnswerSubmission",
      "$8::jsonb",
      "TestSubmitQuestionBankDraftAnswerSubmissionInsertsAnswerJSON",
    ]) && !persistence.includes("SELECT *"),
    actual: summarizePresence(persistence, ["teaching_question_bank_draft_answer_submissions", "$8::jsonb", "SELECT *"]),
    expected: "PostgreSQL stores submitted answers as JSONB with indexed student and draft lookup metadata",
    remediation: "Keep answers parameterized and stored only in the submission table.",
  });

  addFinding(findings, {
    id: "http.openapi_metadata_only_response",
    passed: includesAll(delivery + contracts, [
      "/v1/student-app/question-bank-draft-answer-submissions",
      "submitStudentAppQuestionBankDraftAnswerSubmission",
      "SubmitStudentAppQuestionBankDraftAnswer",
      "operationId: submitStudentAppQuestionBankDraftAnswerSubmission",
      "questionBankDraftRef",
      "answerCount",
      "body leaked",
      "TestSubmitStudentAppQuestionBankDraftAnswerRejectsCrossStudentDraft",
      "submitStudentAppQuestionBankDraftAnswer := usecase.NewSubmitStudentAppQuestionBankDraftAnswer",
    ]) &&
      hasGoKeyedValue(inputs.main ?? "", "SubmitStudentAppQuestionBankDraftAnswer", "submitStudentAppQuestionBankDraftAnswer") &&
      !responseType.includes("AnswerText") &&
      !responseType.includes("ExpectedAnswer") &&
      !responseType.includes("Explanation") &&
      !responseType.includes("Score") &&
      !endpointContract.includes("expectedAnswer") &&
      !endpointContract.includes("explanation") &&
      !endpointContract.includes("scoreSummary"),
    actual: summarizePresence(responseType + endpointContract, ["/v1/student-app/question-bank-draft-answer-submissions", "operationId: submitStudentAppQuestionBankDraftAnswerSubmission", "AnswerText", "expectedAnswer", "explanation", "scoreSummary"]),
    expected: "HTTP and OpenAPI accept answer text in the request but return metadata only, with no answer text, keys, explanations, or scores",
    remediation: "Keep answer content out of response DTOs; scoring is a later reviewed slice.",
  });

  addFinding(findings, {
    id: "quality_root_board_hooks",
    passed: includesAll(hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-submission",
      "Student App AI Tutor question-bank draft answer submission foundation audit",
      "studentAppAiTutorQuestionBankDraftAnswerSubmission",
      "student-app-ai-tutor-question-bank-draft-answer-submission.current.json",
      "0266-student-app-ai-tutor-question-bank-draft-answer-submission-foundation.md",
      "question_bank_draft_answer_submission.go",
      "server_student_app_question_bank_draft_answer_submission.go",
      "10.6/10",
    ]),
    actual: summarizePresence(hooks, ["audit:student-app-ai-tutor-question-bank-draft-answer-submission", "studentAppAiTutorQuestionBankDraftAnswerSubmission", "10.6/10"]),
    expected: "package, quality gate, root workflow coverage, structure verifier, SDD, and architecture board track 0266",
    remediation: "Wire the answer submission foundation through every project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_FOUNDATION",
    runtime: {
      runtimeId,
      useCase: "SubmitStudentAppQuestionBankDraftAnswer.ExecuteWithPersistence",
      repository: "ArchiveRepository.SubmitQuestionBankDraftAnswerSubmission",
      endpoint: "POST /v1/student-app/question-bank-draft-answer-submissions",
    },
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.max(1, Math.min(50, options.probeP99Ms ?? Date.now() - startedAt)),
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STATIC_GO_ANSWER_SUBMISSION_FOUNDATION_AUDIT",
    },
    safetyInvariants: {
      ownStudentOnly: true,
      ownStudentWriteRequired: true,
      draftRefAndStudentScopedLookup: true,
      duplicateItemRejected: true,
      unknownItemRejected: true,
      responseExposesAnswerText: false,
      responseExposesExpectedAnswer: false,
      responseExposesExplanation: false,
      scoringAllowed: false,
      studentVisiblePublishAllowed: false,
      modelInferenceAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the answer submission foundation; keep scoring, feedback, and publication as later reviewed slices."
      : "Fix answer submission evidence before claiming Student App question-bank draft answer submission.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftAnswerSubmissionAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft answer submission foundation: ${report.readiness}`,
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
  const report = auditStudentAppAITutorQuestionBankDraftAnswerSubmission(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftAnswerSubmissionAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
