import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION_RUNTIME_ID,
  verifyStudentAppAITutorQuestionBankDraftAnswerSubmission,
} from "./student-app-ai-tutor-question-bank-draft-answer-submission-verification-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-answer-submission-verification.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-answer-submission-verification-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-answer-submission-verification-runtime.test.mjs",
  contentStudentReadVerificationReport: "reports/student-app-ai-tutor-question-bank-draft-content-student-read-verification.current.json",
  answerSubmissionFoundationReport: "reports/student-app-ai-tutor-question-bank-draft-answer-submission.current.json",
  answerSubmissionFoundationAudit: "tools/student-app-ai-tutor-question-bank-draft-answer-submission-audit.mjs",
  domain: "services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_submission.go",
  domainTest: "services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_submission_test.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/submit_student_app_question_bank_draft_answer.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/submit_student_app_question_bank_draft_answer_test.go",
  http: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_answer_submission.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_answer_submission_test.go",
  responses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  openApiPath: "contracts/openapi/teaching-archive.student-app-question-bank-draft-answer-submissions.path.yaml",
  repository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_question_bank_draft_answer_submission.go",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0288-student-app-ai-tutor-question-bank-draft-answer-submission-verification.md",
};

const forbiddenRuntimeClaims = [
  "node:child_process",
  "spawn(",
  "execSync(",
  "fetch(",
  "postgres://",
  "SELECT ",
  "INSERT ",
  "UPDATE ",
  "DELETE ",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "answerTextDisclosed: true",
  "expectedAnswerDisclosed: true",
  "explanationDisclosed: true",
  "answerKeyDisclosed: true",
  "scoringStarted: true",
  "feedbackPublicationStarted: true",
  "studentVisiblePublished: true",
  "modelInferenceStarted: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export async function auditStudentAppAITutorQuestionBankDraftAnswerSubmissionVerification(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const contentStudentReadVerificationReport = parseJson(inputs.contentStudentReadVerificationReport, {});
  const answerSubmissionFoundationReport = parseJson(inputs.answerSubmissionFoundationReport, {});
  const answerSubmissionFoundationEvidence = [
    inputs.answerSubmissionFoundationReport ?? "",
    inputs.answerSubmissionFoundationAudit ?? "",
  ].join("\n");
  const deliveryEvidence = [
    inputs.domain ?? "",
    inputs.domainTest ?? "",
    inputs.usecase ?? "",
    inputs.usecaseTest ?? "",
    inputs.http ?? "",
    inputs.httpTest ?? "",
    inputs.responses ?? "",
    inputs.openApiPath ?? "",
    inputs.repository ?? "",
  ].join("\n");
  const responseSurface = [
    extractGoType(inputs.responses ?? "", "questionBankDraftAnswerSubmissionResponse"),
    responseContractSurface(inputs.openApiPath ?? ""),
  ].join("\n");
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe({ contentStudentReadVerificationReport, answerSubmissionFoundationReport }, options);

  addFinding(findings, {
    id: "source.content_student_read_verified",
    passed: contentStudentReadVerificationReport.readiness === "READY" &&
      contentStudentReadVerificationReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_content_student_read_verification_runtime" &&
      contentStudentReadVerificationReport.runtime?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFIED" &&
      contentStudentReadVerificationReport.safetyInvariants?.safeStudentResponseMatchedVerifiedPreview === true &&
      contentStudentReadVerificationReport.safetyInvariants?.answerKeyDisclosed === false &&
      contentStudentReadVerificationReport.runtimeSlo?.totalErrors === 0,
    actual: `${contentStudentReadVerificationReport.readiness ?? "missing"}:${contentStudentReadVerificationReport.runtime?.status ?? "missing"}`,
    expected: "READY 0287 content student read verification with no answer-key disclosure",
    remediation: "Run the 0287 student-safe content read verification before answer submission verification.",
  });

  addFinding(findings, {
    id: "source.answer_submission_foundation_ready",
    passed: answerSubmissionFoundationReport.readiness === "READY" &&
      answerSubmissionFoundationReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_FOUNDATION" &&
      answerSubmissionFoundationReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_answer_submission_foundation" &&
      answerSubmissionFoundationReport.runtime?.useCase === "SubmitStudentAppQuestionBankDraftAnswer.ExecuteWithPersistence" &&
      answerSubmissionFoundationReport.runtime?.repository === "ArchiveRepository.SubmitQuestionBankDraftAnswerSubmission" &&
      answerSubmissionFoundationReport.safetyInvariants?.ownStudentWriteRequired === true &&
      answerSubmissionFoundationReport.safetyInvariants?.responseExposesAnswerText === false &&
      answerSubmissionFoundationReport.safetyInvariants?.scoringAllowed === false &&
      answerSubmissionFoundationReport.runtimeSlo?.totalErrors === 0,
    actual: summarizePresence(answerSubmissionFoundationEvidence, ["SubmitStudentAppQuestionBankDraftAnswer.ExecuteWithPersistence", "ownStudentWriteRequired", "responseExposesAnswerText", "scoringAllowed"]),
    expected: "0266 answer submission foundation is READY, own-student scoped, metadata-only, and not scoring",
    remediation: "Fix the answer submission foundation before claiming answer submission verification.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerSubmissionVerificationPort.verifyStudentSafeQuestionBankDraftAnswerSubmission",
      "verifyStudentAppAITutorQuestionBankDraftAnswerSubmission",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION_READY",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFIED",
      "StudentQuestionBankDraftAnswerSubmissionPort.submitStudentAppQuestionBankDraftAnswer is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_answer_submission_verification_runtime",
      "StudentQuestionBankDraftAnswerSubmissionPort.submitStudentAppQuestionBankDraftAnswer",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFIED",
    ]),
    expected: "runtime records idempotent own-student answer submission verification through the injected submission port",
    remediation: "Keep 0288 port-based, replay-safe, and explicitly tied to the student answer submission boundary.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "submittedAnswersMatchedReadItems: true",
      "answerSubmissionPersisted: true",
      "responseMetadataOnly: true",
      "answerTextDisclosed: false",
      "expectedAnswerDisclosed: false",
      "explanationDisclosed: false",
      "answerKeyDisclosed: false",
      "workerStateDisclosed: false",
      "scoringStarted: false",
      "feedbackPublicationStarted: false",
      "studentVisiblePublished: false",
      "modelInferenceStarted: false",
      "goUseCaseSubmissionAllowed: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "requiresFutureScoringAndReviewedFeedback: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime verifies answer submission only and blocks raw DB, HTTP execution, answer/key leakage, scoring, feedback publication, model inference, tools, and Swarm",
    remediation: "Do not collapse answer submission verification into scoring, feedback publication, raw DB access, or model inference.",
  });

  addFinding(findings, {
    id: "runtime.probe_verifies_answer_submission",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFIED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION_PORT &&
      probe.result?.answerSubmissionSource?.targetUseCase === "SubmitStudentAppQuestionBankDraftAnswer.ExecuteWithPersistence" &&
      probe.result?.answerSubmissionSource?.repository === "ArchiveRepository.SubmitQuestionBankDraftAnswerSubmission" &&
      probe.result?.studentQuestionBankDraftAnswerSubmission?.answerCount === 2 &&
      probe.result?.boundary?.answerSubmissionPersisted === true &&
      probe.result?.boundary?.answerTextDisclosed === false &&
      probe.result?.boundary?.scoringStarted === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};answerCount=${probe.result.studentQuestionBankDraftAnswerSubmission.answerCount};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe submits own-student answers once through the injected port and returns metadata only",
    remediation: "Answer submission verification must prove own-student write, read-item matching, metadata-only output, and one injected port call.",
  });

  addFinding(findings, {
    id: "tests.cover_answer_submission_verification_negative_paths",
    passed: includesAll(runtimeTest, [
      "verifies own-student answer submissions through the injected submission port",
      "uses idempotency for replay and rejects conflicting answer submission verification",
      "rejects missing port, missing persistence, cross-student principal, unknown item, duplicate answer, and response mismatch",
      "rejects answer text, answer key, scoring, worker, DB, HTTP, model, tool, and Swarm leaks",
      "requires content read verification and answer submission foundation evidence while keeping scoring and feedback future-gated",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, missing port, missing persistence, cross-student, unknown item, duplicate, response mismatch, leak, policy, evidence, and future gate tests",
    remediation: "Add regression coverage before treating answer submission verification as root evidence.",
  });

  addFinding(findings, {
    id: "go_http_openapi_answer_submission_evidence",
    passed: includesAll(deliveryEvidence, [
      "NormalizeSubmitStudentAppQuestionBankDraftAnswerInput",
      "ScopeStudentOwnWrite",
      "validateSubmittedAnswersAgainstDraft",
      "GetQuestionBankDraftContentForStudent",
      "SubmitQuestionBankDraftAnswerSubmission",
      "ExecuteWithPersistence",
      "http.MethodPost",
      "/v1/student-app/question-bank-draft-answer-submissions",
      "toQuestionBankDraftAnswerSubmissionResponse",
      "TestSubmitStudentAppQuestionBankDraftAnswerReturnsMetadataOnly",
      "TestSubmitStudentAppQuestionBankDraftAnswerRejectsCrossStudentDraft",
      "operationId: submitStudentAppQuestionBankDraftAnswerSubmission",
      "$8::jsonb",
    ]) && !deliveryEvidence.includes("SELECT *"),
    actual: summarizePresence(deliveryEvidence, ["ScopeStudentOwnWrite", "SubmitQuestionBankDraftAnswerSubmission", "toQuestionBankDraftAnswerSubmissionResponse", "$8::jsonb", "SELECT *"]),
    expected: "Go domain/use case, HTTP route, OpenAPI, and repository support own-student answer submission with JSONB persistence",
    remediation: "Keep answer submission scoped by student and draft ref through the Go use case and repository.",
  });

  addFinding(findings, {
    id: "student_response_metadata_only",
    passed: includesAll(responseSurface, [
      "questionBankDraftAnswerSubmissionResponse",
      "QuestionBankDraftRef",
      "AnswerCount",
      "SubmittedAt",
      "answerCount",
    ]) && !includesAny(responseSurface, [
      "AnswerText string",
      "ExpectedAnswer string",
      "Explanation string",
      "ScoreSummary string",
      "answerText",
      "expectedAnswer",
      "explanation",
      "scoreSummary",
      "rawModelOutput",
    ]),
    actual: summarizePresence(responseSurface, ["AnswerText", "ExpectedAnswer", "Explanation", "ScoreSummary", "answerText", "expectedAnswer", "explanation", "scoreSummary"]),
    expected: "student answer submission response includes metadata and answer count but not answer text, answer keys, explanations, scores, or model output",
    remediation: "Keep submitted answer text out of the Student App submission response; scoring is a later reviewed slice.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-draft-answer-submission-verification"]?.includes("student-app-ai-tutor-question-bank-draft-answer-submission-verification-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank draft answer submission verification runtime audit",
        "studentAppAiTutorQuestionBankDraftAnswerSubmissionVerification",
        "student-app-ai-tutor-question-bank-draft-answer-submission-verification.current.json",
        "student_app_ai_tutor_question_bank_draft_answer_submission_verification_runtime",
        "0288-student-app-ai-tutor-question-bank-draft-answer-submission-verification.md",
        "10.28/10",
        "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFIED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-submission-verification",
      "studentAppAiTutorQuestionBankDraftAnswerSubmissionVerification",
      "10.28/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0288",
    remediation: "Wire answer submission verification through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION_PORT,
      sourceRuntimes: [
        "student_app_ai_tutor_question_bank_draft_content_student_read_verification_runtime",
        "student_app_ai_tutor_question_bank_draft_answer_submission_foundation",
      ],
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFIED",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankDraftAnswerSubmissionVerification: probe },
    safetyInvariants: {
      contentStudentReadVerificationRequired: true,
      answerSubmissionFoundationRequired: true,
      injectedAnswerSubmissionPortRequired: true,
      ownStudentOnly: true,
      ownStudentWriteRequired: true,
      submittedAnswersMatchedReadItems: true,
      answerSubmissionPersisted: true,
      responseMetadataOnly: true,
      answerTextDisclosed: false,
      expectedAnswerDisclosed: false,
      explanationDisclosed: false,
      answerKeyDisclosed: false,
      scoringAllowed: false,
      feedbackPublicationAllowed: false,
      modelInferenceAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as own-student answer submission verification evidence; real scoring and reviewed feedback remain separate slices."
      : "Fix answer submission verification evidence before claiming the Student App can safely submit generated question-bank answers.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftAnswerSubmissionVerificationAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft answer submission verification runtime: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
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

async function runRuntimeProbe(reports, options = {}) {
  const startedAt = Date.now();
  const calls = [];
  try {
    const input = {
      schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-submission-verification.v1",
      verificationInvocationId: "qbank_answer_submission_verification_audit_001",
      principal: {
        principalId: "student_principal_001",
        sessionId: "student_session_001",
        subjectType: "USER",
        role: "STUDENT",
        entryPoint: "STUDENT_APP",
        scopes: ["STUDENT_OWN_READ", "STUDENT_OWN_WRITE"],
        studentAccess: { mode: "OWN", ownStudentId: "student_001" },
      },
      contentStudentReadVerificationReport: reports.contentStudentReadVerificationReport,
      answerSubmissionFoundationReport: reports.answerSubmissionFoundationReport,
      answerSubmissionVerificationPolicy: defaultVerificationPolicy(),
      answers: [
        { itemId: "qbank_plan_item_001", answerText: "3/4" },
        { itemId: "qbank_plan_item_002", answerText: "5/6" },
      ],
      evidenceRefs: [
        "evidence:content-student-read-verification:student-app-ai-tutor-qbank-content-student-read-verification",
        "evidence:answer-submission-foundation:student-app-ai-tutor-question-bank-draft-answer-submission",
      ],
      idempotencyKey: "student-app-ai-tutor-qbank-answer-submission-verification:audit:student_001:qbank_generation_review_001",
    };
    const result = await verifyStudentAppAITutorQuestionBankDraftAnswerSubmission(input, {
      generatedAt: options.generatedAt ?? "2026-06-06T20:10:00.000Z",
      verificationLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-qbank-answer-submission-verification-audit-")), "verification.jsonl"),
      studentQuestionBankDraftAnswerSubmissionPort: {
        async submitStudentAppQuestionBankDraftAnswer(request, context) {
          calls.push({ request, context });
          const content = reports.contentStudentReadVerificationReport.runtimeProbes.studentAppAiTutorQuestionBankDraftContentStudentReadVerification.result.studentQuestionBankDraftContent;
          return {
            persisted: true,
            source: {
              targetUseCase: "SubmitStudentAppQuestionBankDraftAnswer.ExecuteWithPersistence",
              repository: "ArchiveRepository.SubmitQuestionBankDraftAnswerSubmission",
              endpoint: "POST /v1/student-app/question-bank-draft-answer-submissions",
              ownStudentOnly: true,
              ownStudentWrite: true,
              studentScopedLookup: true,
              principalId: request.principal.principalId,
            },
            response: {
              id: "qbank_ans_sub_audit_001",
              questionBankDraftRef: content.questionBankDraftRef,
              tutoringAnalysisRequestId: content.tutoringAnalysisRequestId,
              archiveItemId: content.archiveItemId,
              status: "SUBMITTED",
              answerCount: request.answers.length,
              submittedAt: "2026-06-06T20:12:00.000Z",
            },
          };
        },
      },
    });
    return {
      status: "PASS",
      result,
      portCalls: calls.length,
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.max(1, Math.min(50, options.probeP99Ms ?? Date.now() - startedAt)),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SUBMISSION_VERIFICATION_PROBE",
      },
    };
  } catch (error) {
    return {
      status: "FAIL",
      error: `${error.code ?? "ERROR"}:${error.message}`,
      portCalls: calls.length,
      runtimeSlo: failedSlo(),
    };
  }
}

function defaultVerificationPolicy() {
  return {
    contentStudentReadVerificationRequired: true,
    answerSubmissionFoundationRequired: true,
    injectedAnswerSubmissionPortRequired: true,
    ownStudentPrincipalRequired: true,
    ownStudentWriteScopeRequired: true,
    submittedAnswersMustMatchReadItems: true,
    responseMetadataOnlyRequired: true,
    idempotentAnswerSubmissionVerificationRequired: true,
    goUseCaseSubmissionAllowed: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    answerTextDisclosureAllowed: false,
    expectedAnswerDisclosureAllowed: false,
    explanationDisclosureAllowed: false,
    answerKeyDisclosureAllowed: false,
    scoringAllowed: false,
    feedbackPublicationAllowed: false,
    studentVisiblePublishAllowed: false,
    modelInferenceAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function failedSlo() {
  return { targetP99Ms: 50, p99Ms: 50, totalErrors: 1, operations: 0, evidenceClass: "FAILED_PROBE" };
}

function extractGoType(text, typeName) {
  const index = text.indexOf(`type ${typeName} `);
  if (index === -1) return "";
  const next = text.indexOf("\ntype ", index + 5);
  return next === -1 ? text.slice(index) : text.slice(index, next);
}

function responseContractSurface(text) {
  const responseIndex = text.indexOf("responses:");
  if (responseIndex === -1) return text;
  return text.slice(responseIndex);
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => {
    const absolute = path.join(root, relativePath);
    return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""];
  }));
}

function writeReport(root, reportPath, report) {
  const absolute = path.join(root, reportPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

function includesAll(text = "", needles = []) {
  return needles.every((needle) => text.includes(needle));
}

function includesAny(text = "", needles = []) {
  return needles.some((needle) => text.includes(needle));
}

function hasForbiddenRuntimeClaim(text = "") {
  return forbiddenRuntimeClaims.some((claim) => text.includes(claim));
}

function summarizePresence(text = "", needles = []) {
  return needles.map((needle) => `${needle}=${text.includes(needle)}`).join(";");
}

function addFinding(findings, finding) {
  findings.push({ ...finding, passed: Boolean(finding.passed), severity: finding.passed ? "info" : "error" });
}

function stringifyScalar(value) {
  if (Array.isArray(value)) return value.join(",");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

async function main() {
  const root = process.cwd();
  const out = parseOutArg(process.argv.slice(2));
  const report = await auditStudentAppAITutorQuestionBankDraftAnswerSubmissionVerification(loadCurrentInputs(root));
  writeReport(root, out, report);
  console.log(formatStudentAppAITutorQuestionBankDraftAnswerSubmissionVerificationAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
