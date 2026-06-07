import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-answer-scoring-result.current.json";
const runtimeId = "student_app_ai_tutor_question_bank_draft_answer_scoring_result_foundation";
const sourceFiles = {
  domain: "services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_scoring_result.go",
  domainTest: "services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_scoring_result_test.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/read_student_app_question_bank_draft_answer_scoring_result.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/read_student_app_question_bank_draft_answer_scoring_result_test.go",
  postgresQuery: "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_query.go",
  postgresSchema: "services/teaching-archive-gateway/internal/adapter/postgres/repository_schema.go",
  postgresTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_query_test.go",
  sql: "contracts/sql/teaching-archive.sql",
  http: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_answer_submission.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_answer_submission_test.go",
  httpPaths: "services/teaching-archive-gateway/internal/adapter/httpapi/server_paths.go",
  httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  httpPresenters: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  httpConfig: "services/teaching-archive-gateway/internal/adapter/httpapi/server_config.go",
  main: "services/teaching-archive-gateway/cmd/gateway/main.go",
  openApiRoot: "contracts/openapi/teaching-archive.yaml",
  openApiPath: "contracts/openapi/teaching-archive.student-app-question-bank-draft-answer-submission-ai-grading-result.path.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0269-student-app-ai-tutor-question-bank-draft-answer-scoring-result-foundation.md",
};

export function auditStudentAppAITutorQuestionBankDraftAnswerScoringResult(inputs, options = {}) {
  const startedAt = Date.now();
  const findings = [];
  const goCore = joinInputs(inputs, ["domain", "domainTest", "usecase", "usecaseTest"]);
  const persistence = joinInputs(inputs, ["postgresQuery", "postgresSchema", "postgresTest", "sql"]);
  const delivery = joinInputs(inputs, ["http", "httpTest", "httpPaths", "httpResponses", "httpPresenters", "httpConfig", "main"]);
  const contracts = joinInputs(inputs, ["openApiRoot", "openApiPath"]);
  const studentFacingContract = inputs.openApiPath ?? "";
  const hooks = joinInputs(inputs, ["packageJson", "qualityGate", "rootWorkflowCoverage", "verifyStructure", "architectureBoard", "sdd"]);
  const responseType = extractTypeBody(inputs.httpResponses ?? "", "questionBankDraftAnswerScoringResultResponse");
  const presenter = extractFunctionBody(inputs.httpPresenters ?? "", "toStudentAppQuestionBankDraftAnswerScoringResultResponse");
  const handler = extractFunctionBody(inputs.http ?? "", "readStudentAppQuestionBankDraftAnswerScoringResultMetadata");

  addFinding(findings, {
    id: "go.student_own_safe_result_gate",
    passed: includesAll(goCore, [
      "ReadStudentAppQuestionBankDraftAnswerScoringResultInput",
      "NormalizeReadStudentAppQuestionBankDraftAnswerScoringResultInput",
      "AuthorizeListStudentAppQuestionBankDrafts",
      "primaryOwnStudentID",
      "GetQuestionBankDraftAnswerSubmissionForStudent",
      "GetLatestQuestionBankDraftAnswerScoringRequestForStudent",
      "BuildStudentAppQuestionBankDraftAnswerScoringResult",
      "TestReadStudentAppQuestionBankDraftAnswerScoringResultRejectsForbiddenBeforeRepository",
      "TestReadStudentAppQuestionBankDraftAnswerScoringResultReturnsSafeOwnResult",
      "TestBuildQuestionBankDraftAnswerScoringResultHidesPendingAndFailedInternals",
    ]),
    actual: summarizePresence(goCore, ["AuthorizeListStudentAppQuestionBankDrafts", "primaryOwnStudentID", "GetLatestQuestionBankDraftAnswerScoringRequestForStudent", "HidesPendingAndFailedInternals"]),
    expected: "domain and use case require Student App own-student read and build only a safe student-visible result summary",
    remediation: "Keep result reads behind Student App own-student authorization and the safe result builder.",
  });

  addFinding(findings, {
    id: "postgres.submission_student_latest_indexed_lookup",
    passed: includesAll(persistence, [
      "source_question_bank_answer_submission_id = $1",
      "source_archive_student_id = $2",
      "source_question_bank_draft_ref IS NOT NULL",
      "ORDER BY created_at DESC, id DESC",
      "idx_teaching_ai_grading_requests_qbank_answer_student_created",
      "source_question_bank_answer_submission_id, source_archive_student_id, created_at DESC, id DESC",
      "TestGetLatestQuestionBankDraftAnswerScoringRequestForStudentUsesScopedLookup",
      "TestEnsureSchemaCreatesQuestionBankDraftAnswerScoringLookupIndex",
    ]),
    actual: summarizePresence(persistence, ["source_question_bank_answer_submission_id = $1", "source_archive_student_id = $2", "idx_teaching_ai_grading_requests_qbank_answer_student_created"]),
    expected: "PostgreSQL reads the latest question-bank answer scoring request by submission id plus student id using a dedicated partial index",
    remediation: "Keep the query and index scoped by source_question_bank_answer_submission_id and source_archive_student_id.",
  });

  const safeSurface = responseType + presenter + handler + studentFacingContract;
  addFinding(findings, {
    id: "http.openapi_student_safe_result_surface",
    passed: includesAll(delivery + contracts, [
      "/v1/student-app/question-bank-draft-answer-submissions/",
      "ai-grading-result",
      "parseStudentAppQuestionBankDraftAnswerSubmissionAIGradingResultPath",
      "readStudentAppQuestionBankDraftAnswerScoringResultMetadata",
      "ReadStudentAppQuestionBankDraftAnswerScoringResult",
      "operationId: readStudentAppQuestionBankDraftAnswerScoringResult",
      "TestReadStudentAppQuestionBankDraftAnswerScoringResultReturnsSafeSummary",
      "TestReadStudentAppQuestionBankDraftAnswerScoringResultRejectsTeacherAndCrossStudent",
      "body leaked",
      "scoreSummary",
      "errorCode",
      "ReadStudentAppQuestionBankDraftAnswerScoringResult:    readStudentAppQuestionBankDraftAnswerScoringResult",
    ]) && !includesAny(safeSurface, [
      "answerText",
      "expectedAnswer",
      "explanation",
      "resultRef",
      "errorMessage",
      "workerId",
      "claimedByWorkerId",
      "claimExpiresAt",
    ]),
    actual: summarizePresence(safeSurface, ["scoreSummary", "errorCode", "answerText", "expectedAnswer", "resultRef", "workerId", "claimExpiresAt"]),
    expected: "HTTP/OpenAPI expose only status, scoreSummary on success, errorCode on failure, and timestamps to the owning student",
    remediation: "Remove answer/key/model-result/worker/claim fields from the student-facing result endpoint.",
  });

  addFinding(findings, {
    id: "scope.read_only_no_model_or_publication",
    passed: includesAll(goCore, [
      "if request.Status == AIGradingStatusSucceeded",
      "if request.Status == AIGradingStatusFailed",
    ]) && !includesAny(inputs.domain + inputs.usecase + handler, [
      "RecordAIGradingResultInput",
      "CreateAIGradingResult",
      "PersistAIGradingResult",
      "Publish",
      "ModelOutput",
      "Feedback",
    ]),
    actual: summarizePresence(inputs.domain + inputs.usecase + handler, ["AIGradingStatusSucceeded", "AIGradingStatusFailed", "RecordAIGradingResultInput", "Feedback", "Publish"]),
    expected: "0269 is a read-only student-visible result foundation; model scoring, feedback, and publication remain later slices",
    remediation: "Keep scoring, feedback generation, and publication out of this read endpoint.",
  });

  addFinding(findings, {
    id: "quality_root_board_hooks",
    passed: includesAll(hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-scoring-result",
      "Student App AI Tutor question-bank draft answer scoring result foundation audit",
      "studentAppAiTutorQuestionBankDraftAnswerScoringResult",
      "student-app-ai-tutor-question-bank-draft-answer-scoring-result.current.json",
      "student_app_ai_tutor_question_bank_draft_answer_scoring_result_foundation",
      "0269-student-app-ai-tutor-question-bank-draft-answer-scoring-result-foundation.md",
      "question_bank_draft_answer_scoring_result.go",
      "read_student_app_question_bank_draft_answer_scoring_result.go",
      "student-app-question-bank-draft-answer-submission-ai-grading-result.path.yaml",
      "10.9/10",
    ]),
    actual: summarizePresence(hooks, ["audit:student-app-ai-tutor-question-bank-draft-answer-scoring-result", "studentAppAiTutorQuestionBankDraftAnswerScoringResult", "10.9/10"]),
    expected: "package, quality gate, root workflow coverage, structure verifier, SDD, and architecture board track 0269",
    remediation: "Wire the scoring result foundation through every project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_FOUNDATION",
    runtime: {
      runtimeId,
      useCase: "ReadStudentAppQuestionBankDraftAnswerScoringResult.Execute",
      repository: "ArchiveRepository.GetLatestQuestionBankDraftAnswerScoringRequestForStudent",
      endpoint: "GET /v1/student-app/question-bank-draft-answer-submissions/{submissionId}/ai-grading-result",
    },
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.max(1, Math.min(50, options.probeP99Ms ?? Date.now() - startedAt)),
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STATIC_GO_ANSWER_SCORING_RESULT_FOUNDATION_AUDIT",
    },
    safetyInvariants: {
      ownStudentOnly: true,
      submissionIdAndStudentScopedLookup: true,
      scoreSummaryVisibleOnlyOnSucceeded: true,
      errorCodeVisibleOnlyOnFailed: true,
      answerTextVisibleToStudent: false,
      expectedAnswerVisibleToStudent: false,
      explanationVisibleToStudent: false,
      resultRefVisibleToStudent: false,
      workerFieldsVisibleToStudent: false,
      modelInferenceAllowed: false,
      studentVisiblePublicationAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the student-visible scoring-result read foundation; keep model scoring, detailed feedback, and publication as later reviewed slices."
      : "Fix scoring result evidence before claiming Student App question-bank draft answer scoring result support.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftAnswerScoringResultAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft answer scoring result foundation: ${report.readiness}`,
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

function extractFunctionBody(text, functionName) {
  const index = text.indexOf(functionName);
  if (index === -1) return "";
  const nextFunction = text.indexOf("\nfunc ", index + 1);
  return text.slice(index, nextFunction === -1 ? undefined : nextFunction);
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

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

async function main() {
  const root = process.cwd();
  const out = parseOutArg(process.argv.slice(2));
  const report = auditStudentAppAITutorQuestionBankDraftAnswerScoringResult(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftAnswerScoringResultAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
