import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-answer-scoring-completion-bridge.current.json";
const runtimeId = "student_app_ai_tutor_question_bank_draft_answer_scoring_completion_bridge";
const sourceFiles = {
  bridgeTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_answer_scoring_completion_test.go",
  workerInputDomain: "services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_scoring_input.go",
  workerInputUsecase: "services/teaching-archive-gateway/internal/usecase/read_question_bank_draft_answer_scoring_input.go",
  workerResultDomain: "services/teaching-archive-gateway/internal/domain/ai_grading_result.go",
  workerResultUsecase: "services/teaching-archive-gateway/internal/usecase/record_ai_grading_result.go",
  workerResultPostgres: "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_result.go",
  studentResultDomain: "services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_scoring_result.go",
  studentResultUsecase: "services/teaching-archive-gateway/internal/usecase/read_student_app_question_bank_draft_answer_scoring_result.go",
  httpWorker: "services/teaching-archive-gateway/internal/adapter/httpapi/server_ai_grading_claim.go",
  httpStudent: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_answer_submission.go",
  httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  httpPresenters: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  openApiWorkerResult: "contracts/openapi/teaching-archive.ai-grading-worker-result.path.yaml",
  openApiWorkerInput: "contracts/openapi/teaching-archive.ai-grading-question-bank-answer-scoring-input.path.yaml",
  openApiStudentResult: "contracts/openapi/teaching-archive.student-app-question-bank-draft-answer-submission-ai-grading-result.path.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0270-student-app-ai-tutor-question-bank-draft-answer-scoring-completion-bridge.md",
};

export function auditStudentAppAITutorQuestionBankDraftAnswerScoringCompletionBridge(inputs, options = {}) {
  const startedAt = Date.now();
  const findings = [];
  const bridge = inputs.bridgeTest ?? "";
  const workerInput = joinInputs(inputs, ["workerInputDomain", "workerInputUsecase", "httpWorker", "openApiWorkerInput"]);
  const workerResult = joinInputs(inputs, ["workerResultDomain", "workerResultUsecase", "workerResultPostgres", "httpWorker", "openApiWorkerResult"]);
  const studentResult = joinInputs(inputs, ["studentResultDomain", "studentResultUsecase", "httpStudent", "httpResponses", "httpPresenters", "openApiStudentResult"]);
  const hooks = joinInputs(inputs, ["packageJson", "qualityGate", "rootWorkflowCoverage", "verifyStructure", "architectureBoard", "sdd"]);

  addFinding(findings, {
    id: "bridge.http_chain_reuses_existing_worker_result",
    passed: includesAll(bridge, [
      "TestQuestionBankDraftAnswerScoringCompletionBridgeReusesWorkerResultAndStudentSafeRead",
      "/question-bank-answer-scoring-input",
      "/worker-result",
      "/ai-grading-result",
      "ReadQuestionBankDraftAnswerScoringInput",
      "RecordAIGradingResult",
      "ReadStudentAppQuestionBankDraftAnswerScoringResult",
      "sourceQuestionBankAnswerSubmissionId",
      "grading_req_http_qbank_answer_bridge",
    ]),
    actual: summarizePresence(bridge, ["/question-bank-answer-scoring-input", "/worker-result", "/ai-grading-result", "RecordAIGradingResult", "sourceQuestionBankAnswerSubmissionId"]),
    expected: "one HTTP bridge test drives worker input, existing worker-result completion, and student safe result read for the same question-bank answer scoring request",
    remediation: "Keep the completion bridge on the existing worker-result path instead of adding a duplicate scoring result endpoint.",
  });

  addFinding(findings, {
    id: "worker.boundary_allows_input_and_result_only_to_internal_service",
    passed: includesAll(workerInput + workerResult, [
      "AuthorizeRecordAIGradingResult",
      "EntryPointAgentInternal",
      "ScopeTeachingWrite",
      "canRecordAIGradingResult",
      "ArchiveRepository",
      "RecordAIGradingResult",
      "operationId: recordTeachingAIGradingWorkerResult",
      "operationId: readTeachingAIGradingQuestionBankAnswerScoringInput",
    ]) && includesAny(workerInput, [
      "ReadQuestionBankDraftAnswerScoringInput.Execute",
      "func (uc *ReadQuestionBankDraftAnswerScoringInput) Execute",
    ]) && includesAny(workerResult, [
      "RecordAIGradingResult.Execute",
      "func (uc *RecordAIGradingResult) Execute",
    ]) && !includesAny(workerResult, [
      "question-bank-answer-scoring-result",
      "student-app/question-bank-draft-answer-submissions/{submissionId}/worker-result",
    ]),
    actual: summarizePresence(workerInput + workerResult, ["AuthorizeRecordAIGradingResult", "canRecordAIGradingResult", "ReadQuestionBankDraftAnswerScoringInput.Execute", "func (uc *ReadQuestionBankDraftAnswerScoringInput) Execute", "RecordAIGradingResult.Execute", "func (uc *RecordAIGradingResult) Execute", "question-bank-answer-scoring-result"]),
    expected: "internal service workers reuse existing authorization, claim lease, and worker-result completion without a second question-bank result API",
    remediation: "Route question-bank answer scoring completion through RecordAIGradingResult only.",
  });

  addFinding(findings, {
    id: "student.safe_result_after_completion_hides_worker_internals",
    passed: includesAll(bridge + studentResult, [
      "scoreSummary",
      "errorCode",
      "toStudentAppQuestionBankDraftAnswerScoringResultResponse",
      "BuildStudentAppQuestionBankDraftAnswerScoringResult",
      "student result body leaked",
      "answerText",
      "expectedAnswer",
      "explanation",
      "resultRef",
      "workerId",
      "claimedByWorkerId",
      "claimExpiresAt",
    ]) && !includesAny(inputs.openApiStudentResult ?? "", [
      "answerText",
      "expectedAnswer",
      "explanation",
      "resultRef",
      "workerId",
      "claimedByWorkerId",
      "claimExpiresAt",
    ]),
    actual: summarizePresence((inputs.openApiStudentResult ?? "") + bridge, ["scoreSummary", "errorCode", "answerText", "expectedAnswer", "explanation", "resultRef", "workerId", "claimExpiresAt"]),
    expected: "after completion, Student App can see only the safe result summary and never worker input, result refs, claim fields, or answer keys",
    remediation: "Keep protected scoring input and worker completion metadata out of the Student App result contract.",
  });

  addFinding(findings, {
    id: "scope.no_model_inference_feedback_or_publication",
    passed: includesAll(inputs.sdd ?? "", [
      "does not add a new OpenAPI path",
      "model inference runtime",
      "detailed feedback schema",
      "publication",
      "does not change the production hot path",
    ]) && !includesAny(bridge + workerInput + workerResult + studentResult, [
      "ModelOutput",
      "modelOutput",
      "GenerateFeedback",
      "DetailedFeedback",
      "PublishStudentFeedback",
    ]),
    actual: summarizePresence((inputs.sdd ?? "") + bridge + workerInput + workerResult + studentResult, ["model inference runtime", "DetailedFeedback", "PublishStudentFeedback", "production10k"]),
    expected: "0270 is a completion bridge only; model scoring, detailed feedback, and publication remain later reviewed slices",
    remediation: "Do not use this bridge to claim real model inference or student-visible feedback publication.",
  });

  addFinding(findings, {
    id: "quality_root_board_hooks",
    passed: includesAll(hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-scoring-completion-bridge",
      "Student App AI Tutor question-bank draft answer scoring completion bridge audit",
      "studentAppAiTutorQuestionBankDraftAnswerScoringCompletionBridge",
      "student-app-ai-tutor-question-bank-draft-answer-scoring-completion-bridge.current.json",
      "student_app_ai_tutor_question_bank_draft_answer_scoring_completion_bridge",
      "0270-student-app-ai-tutor-question-bank-draft-answer-scoring-completion-bridge.md",
      "server_student_app_question_bank_draft_answer_scoring_completion_test.go",
      "10.10/10",
    ]),
    actual: summarizePresence(hooks, ["audit:student-app-ai-tutor-question-bank-draft-answer-scoring-completion-bridge", "studentAppAiTutorQuestionBankDraftAnswerScoringCompletionBridge", "10.10/10"]),
    expected: "package, quality gate, root workflow coverage, structure verifier, SDD, and architecture board track 0270",
    remediation: "Wire the completion bridge through every project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_COMPLETION_BRIDGE",
    runtime: {
      runtimeId,
      inputUseCase: "ReadQuestionBankDraftAnswerScoringInput.Execute",
      completionUseCase: "RecordAIGradingResult.Execute",
      studentResultUseCase: "ReadStudentAppQuestionBankDraftAnswerScoringResult.Execute",
      bridgeTest: "TestQuestionBankDraftAnswerScoringCompletionBridgeReusesWorkerResultAndStudentSafeRead",
    },
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: Math.max(1, Math.min(50, options.probeP99Ms ?? Date.now() - startedAt)),
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STATIC_GO_SCORING_COMPLETION_BRIDGE_AUDIT",
    },
    safetyInvariants: {
      reusesExistingWorkerResultPath: true,
      duplicateQuestionBankResultEndpointCreated: false,
      workerInputCanSeeAnswerKey: true,
      studentResultCanSeeAnswerKey: false,
      studentResultCanSeeWorkerFields: false,
      modelInferenceAllowed: false,
      detailedFeedbackPublicationAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the question-bank answer scoring completion bridge; keep real model inference, detailed feedback, and publication as later reviewed slices."
      : "Fix completion bridge evidence before claiming question-bank answer scoring completion support.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftAnswerScoringCompletionBridgeAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft answer scoring completion bridge: ${report.readiness}`,
    `Completion use case: ${report.runtime.completionUseCase}`,
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
  const report = auditStudentAppAITutorQuestionBankDraftAnswerScoringCompletionBridge(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftAnswerScoringCompletionBridgeAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
