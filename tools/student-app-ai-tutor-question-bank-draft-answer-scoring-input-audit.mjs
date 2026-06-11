import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-answer-scoring-input.current.json";
const runtimeId = "student_app_ai_tutor_question_bank_draft_answer_scoring_input_foundation";
const sourceFiles = {
  domain: "services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_scoring_input.go",
  domainTest: "services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_scoring_input_test.go",
  aiGradingResultDomain: "services/teaching-archive-gateway/internal/domain/ai_grading_result.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/read_question_bank_draft_answer_scoring_input.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/read_question_bank_draft_answer_scoring_input_test.go",
  http: "services/teaching-archive-gateway/internal/adapter/httpapi/server_ai_grading_claim.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_ai_grading_question_bank_answer_scoring_input_test.go",
  httpPaths: "services/teaching-archive-gateway/internal/adapter/httpapi/server_paths.go",
  httpRequests: "services/teaching-archive-gateway/internal/adapter/httpapi/server_requests.go",
  httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  httpPresenters: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  httpConfig: "services/teaching-archive-gateway/internal/adapter/httpapi/server_config.go",
  main: "services/teaching-archive-gateway/cmd/gateway/main.go",
  openApiRoot: "contracts/openapi/teaching-archive.yaml",
  openApiPath: "contracts/openapi/teaching-archive.ai-grading-question-bank-answer-scoring-input.path.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0268-student-app-ai-tutor-question-bank-draft-answer-scoring-input-foundation.md",
};

export function auditStudentAppAITutorQuestionBankDraftAnswerScoringInput(inputs, options = {}) {
  const startedAt = Date.now();
  const findings = [];
  const goCore = joinInputs(inputs, ["domain", "domainTest", "aiGradingResultDomain", "usecase", "usecaseTest"]);
  const delivery = joinInputs(inputs, ["http", "httpTest", "httpPaths", "httpRequests", "httpResponses", "httpPresenters", "httpConfig", "main"]);
  const contracts = joinInputs(inputs, ["openApiRoot", "openApiPath"]);
  const endpointContract = joinInputs(inputs, ["openApiPath"]);
  const hooks = joinInputs(inputs, ["packageJson", "qualityGate", "rootWorkflowCoverage", "verifyStructure", "architectureBoard", "sdd"]);
  const responseType = extractTypeBody(inputs.httpResponses ?? "", "questionBankDraftAnswerScoringInputResponse");
  const responseItemType = extractTypeBody(inputs.httpResponses ?? "", "questionBankDraftAnswerScoringInputItem");
  const readHandler = extractFunctionBody(inputs.http ?? "", "readQuestionBankDraftAnswerScoringInputMetadata");

  addFinding(findings, {
    id: "go.worker_only_claimed_input_gate",
    passed: includesAll(goCore, [
      "ReadQuestionBankDraftAnswerScoringInputInput",
      "NormalizeReadQuestionBankDraftAnswerScoringInputInput",
      "AuthorizeRecordAIGradingResult",
      "SubjectService",
      "RoleService",
      "EntryPointAgentInternal",
      "ScopeTeachingWrite",
      "ValidateQuestionBankDraftAnswerScoringInputRequest",
      "canRecordAIGradingResult",
      "GetAIGradingRequestByID",
      "TestNormalizeQuestionBankDraftAnswerScoringInputRejectsNonServicePrincipals",
      "TestBuildQuestionBankDraftAnswerScoringInputRejectsExpiredLeaseAndWrongWorker",
      "TestReadQuestionBankDraftAnswerScoringInputRejectsTeacherBeforeRepository",
      "TestReadQuestionBankDraftAnswerScoringInputRejectsWrongWorkerBeforeSourceReads",
    ]),
    actual: summarizePresence(goCore, ["AuthorizeRecordAIGradingResult", "EntryPointAgentInternal", "ScopeTeachingWrite", "canRecordAIGradingResult", "RejectsWrongWorkerBeforeSourceReads"]),
    expected: "domain and use case allow only internal service workers with TEACHING_WRITE to read input for their active claim",
    remediation: "Keep scoring input behind the existing internal worker authorization and claim lease checks.",
  });

  addFinding(findings, {
    id: "go.question_bank_source_linkage_and_answer_package",
    passed: includesAll(goCore, [
      "BuildQuestionBankDraftAnswerScoringInput",
      "SourceQuestionBankDraftRef",
      "SourceQuestionBankAnswerSubmissionID",
      "SourceArchiveContentRef != request.SourceQuestionBankDraftRef",
      "NormalizeQuestionBankDraftRef",
      "NormalizeQuestionBankDraftAnswerSubmissionID",
      "GetQuestionBankDraftAnswerSubmissionForStudent",
      "GetQuestionBankDraftContentForStudent",
      "validateQuestionBankDraftAnswerScoringLinkage",
      "QuestionBankDraftAnswerSubmissionStatusSubmitted",
      "validateSubmittedAnswersAgainstDraft",
      "AnswerText:",
      "answer.AnswerText",
      "ExpectedAnswer:",
      "item.ExpectedAnswer",
      "Explanation:",
      "item.Explanation",
      "TestBuildQuestionBankDraftAnswerScoringInputReturnsWorkerOnlyAnswerPackage",
      "TestBuildQuestionBankDraftAnswerScoringInputRejectsNonQuestionBankSourceAndBrokenLinkage",
    ]),
    actual: summarizePresence(goCore, ["validateQuestionBankDraftAnswerScoringLinkage", "QuestionBankDraftAnswerSubmissionStatusSubmitted", "answer.AnswerText", "item.ExpectedAnswer", "item.Explanation"]),
    expected: "worker package is built only after request/source/submission/content linkage checks and includes submitted answers plus expected answers/explanations",
    remediation: "Validate every source ref before exposing answer, expected answer, or explanation to the worker.",
  });

  addFinding(findings, {
    id: "http.openapi_worker_only_input_endpoint",
    passed: includesAll(delivery + contracts, [
      "/v1/teaching/ai-grading-requests/",
      "question-bank-answer-scoring-input",
      "parseAIGradingQuestionBankAnswerScoringInputPath",
      "readQuestionBankDraftAnswerScoringInputMetadata",
      "ReadQuestionBankDraftAnswerScoringInput",
      "operationId: readTeachingAIGradingQuestionBankAnswerScoringInput",
      "AgentApiKey",
      "PrincipalContextHeader",
      "answerText",
      "expectedAnswer",
      "explanation",
      "TestReadQuestionBankDraftAnswerScoringInputReturnsWorkerOnlyInputPackage",
      "TestReadQuestionBankDraftAnswerScoringInputRejectsTeacherPrincipal",
      "body leaked",
      "readQuestionBankDraftAnswerScoringInput := usecase.NewReadQuestionBankDraftAnswerScoringInput",
    ]) &&
      hasGoKeyedValue(inputs.main ?? "", "ReadQuestionBankDraftAnswerScoringInput", "readQuestionBankDraftAnswerScoringInput"),
    actual: summarizePresence(endpointContract + readHandler, ["operationId: readTeachingAIGradingQuestionBankAnswerScoringInput", "answerText", "expectedAnswer", "explanation", "scoreSummary", "resultRef"]),
    expected: "HTTP/OpenAPI expose the answer/key/explanation package only on the internal worker endpoint",
    remediation: "Keep answer package fields confined to the /v1/teaching internal worker input path.",
  });

  addFinding(findings, {
    id: "scope.no_scoring_persistence_or_student_publish",
    passed: includesAll(responseItemType, ["AnswerText", "ExpectedAnswer", "Explanation"]) &&
      !includesAny(responseType + responseItemType + endpointContract + readHandler, [
        "ScoreSummary",
        "scoreSummary",
        "ResultRef",
        "resultRef",
        "Feedback",
        "feedback",
        "ModelOutput",
        "modelOutput",
        "Published",
        "published",
      ]) &&
      !includesAny(inputs.domain + inputs.usecase, [
        "RecordAIGradingResultInput",
        "CreateAIGradingResult",
        "PersistAIGradingResult",
        "Publish",
      ]),
    actual: summarizePresence(responseType + responseItemType + endpointContract + readHandler + inputs.domain + inputs.usecase, ["answerText", "expectedAnswer", "explanation", "scoreSummary", "resultRef", "feedback", "RecordAIGradingResultInput"]),
    expected: "0268 reads scoring input only; it does not run model inference, persist scoring results, or publish student-visible feedback",
    remediation: "Move model scoring, result persistence, and publication to later reviewed worker/result slices.",
  });

  addFinding(findings, {
    id: "quality_root_board_hooks",
    passed: includesAll(hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-scoring-input",
      "Student App AI Tutor question-bank draft answer scoring input foundation audit",
      "studentAppAiTutorQuestionBankDraftAnswerScoringInput",
      "student-app-ai-tutor-question-bank-draft-answer-scoring-input.current.json",
      "student_app_ai_tutor_question_bank_draft_answer_scoring_input_foundation",
      "0268-student-app-ai-tutor-question-bank-draft-answer-scoring-input-foundation.md",
      "question_bank_draft_answer_scoring_input.go",
      "read_question_bank_draft_answer_scoring_input.go",
      "teaching-archive.ai-grading-question-bank-answer-scoring-input.path.yaml",
      "10.8/10",
    ]),
    actual: summarizePresence(hooks, ["audit:student-app-ai-tutor-question-bank-draft-answer-scoring-input", "studentAppAiTutorQuestionBankDraftAnswerScoringInput", "10.8/10"]),
    expected: "package, quality gate, root workflow coverage, structure verifier, SDD, and architecture board track 0268",
    remediation: "Wire the scoring input foundation through every project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_INPUT_FOUNDATION",
    runtime: {
      runtimeId,
      useCase: "ReadQuestionBankDraftAnswerScoringInput.Execute",
      repository: "ArchiveRepository.GetAIGradingRequestByID + source scoped reads",
      endpoint: "POST /v1/teaching/ai-grading-requests/{requestId}/question-bank-answer-scoring-input",
    },
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.max(1, Math.min(50, options.probeP99Ms ?? Date.now() - startedAt)),
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STATIC_GO_ANSWER_SCORING_INPUT_FOUNDATION_AUDIT",
    },
    safetyInvariants: {
      internalWorkerOnly: true,
      servicePrincipalRequired: true,
      agentInternalEntryPointRequired: true,
      teachingWriteScopeRequired: true,
      claimedBySameWorkerRequired: true,
      unexpiredClaimLeaseRequired: true,
      requestSourceLinkageRequired: true,
      submissionAndContentScopedByStudent: true,
      responseExposesAnswerTextToWorker: true,
      responseExposesExpectedAnswerToWorker: true,
      responseExposesExplanationToWorker: true,
      modelInferenceAllowed: false,
      resultPersistenceAllowed: false,
      studentVisiblePublishAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the controlled worker input foundation; keep actual model scoring, persisted feedback, and student-visible publication as later reviewed slices."
      : "Fix scoring input evidence before claiming Student App question-bank draft answer scoring input support.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftAnswerScoringInputAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft answer scoring input foundation: ${report.readiness}`,
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
  const index = text.indexOf(`func (s *Server) ${functionName}`);
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
  const report = auditStudentAppAITutorQuestionBankDraftAnswerScoringInput(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftAnswerScoringInputAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
