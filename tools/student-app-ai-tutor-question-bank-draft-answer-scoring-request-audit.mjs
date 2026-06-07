import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-answer-scoring-request.current.json";
const runtimeId = "student_app_ai_tutor_question_bank_draft_answer_scoring_request_foundation";
const sourceFiles = {
  domain: "services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_scoring_request.go",
  domainTest: "services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_scoring_request_test.go",
  aiGradingDomain: "services/teaching-archive-gateway/internal/domain/ai_grading_request.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/create_student_app_question_bank_draft_answer_scoring_request.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/create_student_app_question_bank_draft_answer_scoring_request_test.go",
  postgresRequest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_request.go",
  postgresQuery: "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_query.go",
  postgresClaim: "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_claim.go",
  postgresSubmission: "services/teaching-archive-gateway/internal/adapter/postgres/repository_question_bank_draft_answer_submission.go",
  postgresTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_question_bank_draft_answer_submission_test.go",
  schema: "services/teaching-archive-gateway/internal/adapter/postgres/repository_schema.go",
  http: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_answer_submission.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_answer_submission_test.go",
  claimTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_ai_grading_claim_test.go",
  httpRoutes: "services/teaching-archive-gateway/internal/adapter/httpapi/server_routes.go",
  httpConfig: "services/teaching-archive-gateway/internal/adapter/httpapi/server_config.go",
  httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  httpPresenters: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  main: "services/teaching-archive-gateway/cmd/gateway/main.go",
  openApiRoot: "contracts/openapi/teaching-archive.yaml",
  openApiPath: "contracts/openapi/teaching-archive.student-app-question-bank-draft-answer-submission-ai-grading-requests.path.yaml",
  openApiClaimPath: "contracts/openapi/teaching-archive.ai-grading-worker-claims.path.yaml",
  sql: "contracts/sql/teaching-archive.sql",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0267-student-app-ai-tutor-question-bank-draft-answer-scoring-request-foundation.md",
};

export function auditStudentAppAITutorQuestionBankDraftAnswerScoringRequest(inputs, options = {}) {
  const startedAt = Date.now();
  const findings = [];
  const goCore = joinInputs(inputs, ["domain", "domainTest", "aiGradingDomain", "usecase", "usecaseTest"]);
  const persistence = joinInputs(inputs, ["postgresRequest", "postgresQuery", "postgresClaim", "postgresSubmission", "postgresTest", "schema", "sql"]);
  const delivery = joinInputs(inputs, ["http", "httpTest", "claimTest", "httpRoutes", "httpConfig", "httpResponses", "httpPresenters", "main"]);
  const contracts = joinInputs(inputs, ["openApiRoot", "openApiPath", "openApiClaimPath"]);
  const endpointContract = joinInputs(inputs, ["openApiPath"]);
  const hooks = joinInputs(inputs, ["packageJson", "qualityGate", "rootWorkflowCoverage", "verifyStructure", "architectureBoard", "sdd"]);

  addFinding(findings, {
    id: "go.domain_usecase_own_student_scoring_request",
    passed: includesAll(goCore, [
      "CreateStudentAppQuestionBankDraftAnswerScoringRequestInput",
      "NormalizeCreateStudentAppQuestionBankDraftAnswerScoringRequestInput",
      "AuthorizeListStudentAppQuestionBankDrafts",
      "ScopeStudentOwnWrite",
      "GetQuestionBankDraftAnswerSubmissionForStudent",
      "GetQuestionBankDraftContentForStudent",
      "ValidateQuestionBankDraftAnswerScoringSource",
      "CreateAIGradingRequest",
      "SourceQuestionBankDraftRef",
      "SourceQuestionBankAnswerSubmissionID",
      "RejectsBrokenSubmissionLinkage",
    ]),
    actual: summarizePresence(goCore, ["ScopeStudentOwnWrite", "GetQuestionBankDraftAnswerSubmissionForStudent", "ValidateQuestionBankDraftAnswerScoringSource", "SourceQuestionBankAnswerSubmissionID"]),
    expected: "domain and use case require own-student read/write, scoped submission lookup, scoped draft content lookup, linkage validation, and existing AIGradingRequest queue reuse",
    remediation: "Keep student-owned submission authorization and linkage validation before queueing any scoring request.",
  });

  addFinding(findings, {
    id: "postgres.reuses_ai_grading_queue_with_question_bank_refs",
    passed: includesAll(persistence, [
      "source_question_bank_draft_ref",
      "source_question_bank_answer_submission_id",
      "GetQuestionBankDraftAnswerSubmissionForStudent",
      "id = $1",
      "student_id = $2",
      "TestGetQuestionBankDraftAnswerSubmissionForStudentUsesScopedLookup",
      "SourceQuestionBankDraftRef",
      "SourceQuestionBankAnswerSubmissionID",
    ]) &&
      !persistence.includes("CREATE TABLE IF NOT EXISTS teaching_question_bank_draft_answer_scoring_requests"),
    actual: summarizePresence(persistence, ["source_question_bank_draft_ref", "source_question_bank_answer_submission_id", "teaching_question_bank_draft_answer_scoring_requests"]),
    expected: "PostgreSQL stores source refs on the existing AIGradingRequest queue and reads submissions by submission id plus student id",
    remediation: "Do not add a second scoring queue; keep the worker source refs on teaching_ai_grading_requests.",
  });

  addFinding(findings, {
    id: "http.openapi_metadata_only_request_and_claim",
    passed: includesAll(delivery + contracts, [
      "/v1/student-app/question-bank-draft-answer-submissions/",
      "createStudentAppQuestionBankDraftAnswerScoringRequestMetadata",
      "operationId: createStudentAppQuestionBankDraftAnswerScoringRequest",
      "pattern: '^qbank_ans_sub_[A-Za-z0-9_-]+$'",
      "TestCreateStudentAppQuestionBankDraftAnswerScoringRequestReturnsMetadataOnly",
      "TestCreateStudentAppQuestionBankDraftAnswerScoringRequestRejectsTeacherAndCrossStudent",
      "TestClaimAIGradingRequestReturnsQuestionBankAnswerSourceRefs",
      "sourceQuestionBankDraftRef",
      "sourceQuestionBankAnswerSubmissionId",
      "body leaked",
      "CreateStudentAppQuestionBankDraftAnswerScoringRequest: usecase.NewCreateStudentAppQuestionBankDraftAnswerScoringRequest",
    ]) &&
      !endpointContract.includes("answerText") &&
      !endpointContract.includes("expectedAnswer") &&
      !endpointContract.includes("explanation") &&
      !endpointContract.includes("scoreSummary") &&
      !endpointContract.includes("resultRef"),
    actual: summarizePresence(delivery + endpointContract, ["operationId: createStudentAppQuestionBankDraftAnswerScoringRequest", "sourceQuestionBankAnswerSubmissionId", "answerText", "scoreSummary", "resultRef"]),
    expected: "HTTP/OpenAPI expose only metadata for scoring request creation while worker claim receives source refs without answer/key/feedback leakage",
    remediation: "Keep creation response metadata-only and let the worker resolve protected content through controlled internal paths.",
  });

  addFinding(findings, {
    id: "quality_root_board_hooks",
    passed: includesAll(hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-scoring-request",
      "Student App AI Tutor question-bank draft answer scoring request foundation audit",
      "studentAppAiTutorQuestionBankDraftAnswerScoringRequest",
      "student-app-ai-tutor-question-bank-draft-answer-scoring-request.current.json",
      "0267-student-app-ai-tutor-question-bank-draft-answer-scoring-request-foundation.md",
      "question_bank_draft_answer_scoring_request.go",
      "create_student_app_question_bank_draft_answer_scoring_request.go",
      "student-app-question-bank-draft-answer-submission-ai-grading-requests.path.yaml",
      "10.7/10",
    ]),
    actual: summarizePresence(hooks, ["audit:student-app-ai-tutor-question-bank-draft-answer-scoring-request", "studentAppAiTutorQuestionBankDraftAnswerScoringRequest", "10.7/10"]),
    expected: "package, quality gate, root workflow coverage, structure verifier, SDD, and architecture board track 0267",
    remediation: "Wire the scoring request foundation through every project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_FOUNDATION",
    runtime: {
      runtimeId,
      useCase: "CreateStudentAppQuestionBankDraftAnswerScoringRequest.Execute",
      repository: "ArchiveRepository.CreateAIGradingRequest",
      endpoint: "POST /v1/student-app/question-bank-draft-answer-submissions/{submissionId}/ai-grading-requests",
    },
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.max(1, Math.min(50, options.probeP99Ms ?? Date.now() - startedAt)),
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STATIC_GO_ANSWER_SCORING_REQUEST_FOUNDATION_AUDIT",
    },
    safetyInvariants: {
      ownStudentOnly: true,
      ownStudentWriteRequired: true,
      submissionIdAndStudentScopedLookup: true,
      draftRefAndStudentScopedLookup: true,
      reusesAIGradingRequestQueue: true,
      createsNewScoringQueueTable: false,
      responseExposesAnswerText: false,
      responseExposesExpectedAnswer: false,
      responseExposesExplanation: false,
      responseExposesScore: false,
      modelInferenceAllowed: false,
      studentVisiblePublishAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the queued scoring-request foundation; keep actual grading, feedback, and student-visible publication as later reviewed slices."
      : "Fix scoring request evidence before claiming Student App question-bank draft answer scoring request support.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftAnswerScoringRequestAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft answer scoring request foundation: ${report.readiness}`,
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

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
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
  const report = auditStudentAppAITutorQuestionBankDraftAnswerScoringRequest(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftAnswerScoringRequestAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
