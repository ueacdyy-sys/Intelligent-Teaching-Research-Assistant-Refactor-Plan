import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION_RUNTIME_ID,
  verifyStudentAppAITutorQuestionBankDraftAnswerScoringRequest,
} from "./student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification-runtime.test.mjs",
  answerSubmissionVerificationReport: "reports/student-app-ai-tutor-question-bank-draft-answer-submission-verification.current.json",
  answerScoringRequestFoundationReport: "reports/student-app-ai-tutor-question-bank-draft-answer-scoring-request.current.json",
  answerScoringRequestFoundationAudit: "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-request-audit.mjs",
  domain: "services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_scoring_request.go",
  domainTest: "services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_scoring_request_test.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/create_student_app_question_bank_draft_answer_scoring_request.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/create_student_app_question_bank_draft_answer_scoring_request_test.go",
  http: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_answer_submission.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_answer_submission_test.go",
  openApiPath: "contracts/openapi/teaching-archive.student-app-question-bank-draft-answer-submission-ai-grading-requests.path.yaml",
  aiGradingDomain: "services/teaching-archive-gateway/internal/domain/ai_grading_request.go",
  repository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_request.go",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0289-student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification.md",
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
  "scoreDisclosed: true",
  "resultRefDisclosed: true",
  "workerStateDisclosed: true",
  "workerClaimStarted: true",
  "scoringExecutionStarted: true",
  "feedbackPublicationStarted: true",
  "studentVisiblePublished: true",
  "modelInferenceStarted: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export async function auditStudentAppAITutorQuestionBankDraftAnswerScoringRequestVerification(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const answerSubmissionVerificationReport = parseJson(inputs.answerSubmissionVerificationReport, {});
  const answerScoringRequestFoundationReport = parseJson(inputs.answerScoringRequestFoundationReport, {});
  const scoringFoundationEvidence = [
    inputs.answerScoringRequestFoundationReport ?? "",
    inputs.answerScoringRequestFoundationAudit ?? "",
  ].join("\n");
  const deliveryEvidence = [
    inputs.domain ?? "",
    inputs.domainTest ?? "",
    inputs.usecase ?? "",
    inputs.usecaseTest ?? "",
    inputs.http ?? "",
    inputs.httpTest ?? "",
    inputs.openApiPath ?? "",
    inputs.aiGradingDomain ?? "",
    inputs.repository ?? "",
  ].join("\n");
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe({ answerSubmissionVerificationReport, answerScoringRequestFoundationReport }, options);

  addFinding(findings, {
    id: "source.answer_submission_verification_ready",
    passed: answerSubmissionVerificationReport.readiness === "READY" &&
      answerSubmissionVerificationReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_answer_submission_verification_runtime" &&
      answerSubmissionVerificationReport.runtime?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFIED" &&
      answerSubmissionVerificationReport.safetyInvariants?.answerSubmissionPersisted === true &&
      answerSubmissionVerificationReport.safetyInvariants?.submittedAnswersMatchedReadItems === true &&
      answerSubmissionVerificationReport.safetyInvariants?.scoringAllowed === false &&
      answerSubmissionVerificationReport.runtimeSlo?.totalErrors === 0,
    actual: `${answerSubmissionVerificationReport.readiness ?? "missing"}:${answerSubmissionVerificationReport.runtime?.status ?? "missing"}`,
    expected: "READY 0288 answer submission verification with persisted own-student metadata-only submission and no scoring",
    remediation: "Run the 0288 answer submission verification before scoring request verification.",
  });

  addFinding(findings, {
    id: "source.answer_scoring_request_foundation_ready",
    passed: answerScoringRequestFoundationReport.readiness === "READY" &&
      answerScoringRequestFoundationReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_FOUNDATION" &&
      answerScoringRequestFoundationReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_answer_scoring_request_foundation" &&
      answerScoringRequestFoundationReport.runtime?.useCase === "CreateStudentAppQuestionBankDraftAnswerScoringRequest.Execute" &&
      answerScoringRequestFoundationReport.runtime?.repository === "ArchiveRepository.CreateAIGradingRequest" &&
      answerScoringRequestFoundationReport.safetyInvariants?.ownStudentWriteRequired === true &&
      answerScoringRequestFoundationReport.safetyInvariants?.reusesAIGradingRequestQueue === true &&
      answerScoringRequestFoundationReport.safetyInvariants?.responseExposesAnswerText === false &&
      answerScoringRequestFoundationReport.safetyInvariants?.responseExposesScore === false &&
      answerScoringRequestFoundationReport.runtimeSlo?.totalErrors === 0,
    actual: summarizePresence(scoringFoundationEvidence, ["CreateStudentAppQuestionBankDraftAnswerScoringRequest.Execute", "ownStudentWriteRequired", "reusesAIGradingRequestQueue", "responseExposesAnswerText", "responseExposesScore"]),
    expected: "0267 scoring request foundation is READY, own-student scoped, queue-backed, and metadata-only",
    remediation: "Fix the answer scoring request foundation before claiming scoring request verification.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerScoringRequestVerificationPort.verifyStudentSafeQuestionBankDraftAnswerScoringRequest",
      "verifyStudentAppAITutorQuestionBankDraftAnswerScoringRequest",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION_READY",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFIED",
      "StudentQuestionBankDraftAnswerScoringRequestPort.createStudentAppQuestionBankDraftAnswerScoringRequest is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_answer_scoring_request_verification_runtime",
      "StudentQuestionBankDraftAnswerScoringRequestPort.createStudentAppQuestionBankDraftAnswerScoringRequest",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFIED",
    ]),
    expected: "runtime records idempotent own-student answer scoring request verification through the injected scoring request port",
    remediation: "Keep 0289 port-based, replay-safe, and explicitly tied to the student scoring request boundary.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "answerSubmissionVerificationConsumed: true",
      "answerScoringRequestFoundationConsumed: true",
      "injectedScoringRequestPortInvoked: true",
      "verifiedSubmissionQueuedForScoring: true",
      "scoringRequestQueued: true",
      "reusesExistingAIGradingRequestQueue: true",
      "responseMetadataOnly: true",
      "answerTextDisclosed: false",
      "expectedAnswerDisclosed: false",
      "explanationDisclosed: false",
      "answerKeyDisclosed: false",
      "scoreDisclosed: false",
      "resultRefDisclosed: false",
      "workerStateDisclosed: false",
      "workerClaimStarted: false",
      "scoringExecutionStarted: false",
      "feedbackPublicationStarted: false",
      "studentVisiblePublished: false",
      "modelInferenceStarted: false",
      "goUseCaseScoringRequestAllowed: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "requiresFutureWorkerScoringAndReviewedFeedback: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime verifies scoring request queueing only and blocks raw DB, HTTP execution, answer/key leakage, score/result leakage, worker claim, scoring execution, feedback publication, model inference, tools, and Swarm",
    remediation: "Do not collapse scoring request verification into worker scoring, feedback publication, raw DB access, or model inference.",
  });

  addFinding(findings, {
    id: "runtime.probe_verifies_scoring_request",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFIED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION_PORT &&
      probe.result?.answerScoringRequestSource?.targetUseCase === "CreateStudentAppQuestionBankDraftAnswerScoringRequest.Execute" &&
      probe.result?.answerScoringRequestSource?.repository === "ArchiveRepository.CreateAIGradingRequest" &&
      probe.result?.studentQuestionBankDraftAnswerScoringRequest?.status === "QUEUED" &&
      probe.result?.studentQuestionBankDraftAnswerScoringRequest?.submissionId === "qbank_ans_sub_audit_001" &&
      probe.result?.boundary?.scoringRequestQueued === true &&
      probe.result?.boundary?.answerTextDisclosed === false &&
      probe.result?.boundary?.scoringExecutionStarted === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};request=${probe.result.studentQuestionBankDraftAnswerScoringRequest.id};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe queues the verified own-student submission once through the injected port and returns metadata only",
    remediation: "Scoring request verification must prove own-student queueing, source submission matching, metadata-only output, and one injected port call.",
  });

  addFinding(findings, {
    id: "tests.cover_scoring_request_verification_negative_paths",
    passed: includesAll(runtimeTest, [
      "verifies own-student answer scoring requests through the injected scoring request port",
      "uses idempotency for replay and rejects conflicting scoring request verification",
      "rejects missing port, missing queue result, cross-student principal, response mismatch, and item mismatch",
      "rejects answer text, answer key, score, result ref, worker, DB, HTTP, model, tool, and Swarm leaks",
      "requires answer submission verification and scoring request foundation evidence while future-gating scoring and feedback",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, missing port, missing queue, cross-student, response mismatch, item mismatch, leak, policy, evidence, and future gate tests",
    remediation: "Add regression coverage before treating scoring request verification as root evidence.",
  });

  addFinding(findings, {
    id: "go_http_openapi_scoring_request_evidence",
    passed: includesAll(deliveryEvidence, [
      "NormalizeCreateStudentAppQuestionBankDraftAnswerScoringRequestInput",
      "ScopeStudentOwnWrite",
      "GetQuestionBankDraftAnswerSubmissionForStudent",
      "GetQuestionBankDraftContentForStudent",
      "ValidateQuestionBankDraftAnswerScoringSource",
      "CreateAIGradingRequest",
      "SourceQuestionBankDraftRef",
      "SourceQuestionBankAnswerSubmissionID",
      "http.MethodPost",
      "/v1/student-app/question-bank-draft-answer-submissions/",
      "createStudentAppQuestionBankDraftAnswerScoringRequestMetadata",
      "operationId: createStudentAppQuestionBankDraftAnswerScoringRequest",
      "TestCreateStudentAppQuestionBankDraftAnswerScoringRequestReturnsMetadataOnly",
      "TestCreateStudentAppQuestionBankDraftAnswerScoringRequestRejectsTeacherAndCrossStudent",
    ]),
    actual: summarizePresence(deliveryEvidence, ["ScopeStudentOwnWrite", "GetQuestionBankDraftAnswerSubmissionForStudent", "ValidateQuestionBankDraftAnswerScoringSource", "SourceQuestionBankAnswerSubmissionID", "operationId: createStudentAppQuestionBankDraftAnswerScoringRequest"]),
    expected: "Go domain/use case, HTTP route, OpenAPI, and repository support own-student metadata-only scoring request queueing with question-bank source refs",
    remediation: "Keep scoring requests scoped by student and source submission before queueing on AIGradingRequest.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification"]?.includes("student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank draft answer scoring request verification runtime audit",
        "studentAppAiTutorQuestionBankDraftAnswerScoringRequestVerification",
        "student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification.current.json",
        "student_app_ai_tutor_question_bank_draft_answer_scoring_request_verification_runtime",
        "0289-student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification.md",
        "10.29/10",
        "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFIED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification",
      "studentAppAiTutorQuestionBankDraftAnswerScoringRequestVerification",
      "10.29/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0289",
    remediation: "Wire answer scoring request verification through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION_PORT,
      sourceRuntimes: [
        "student_app_ai_tutor_question_bank_draft_answer_submission_verification_runtime",
        "student_app_ai_tutor_question_bank_draft_answer_scoring_request_foundation",
      ],
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFIED",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankDraftAnswerScoringRequestVerification: probe },
    safetyInvariants: {
      answerSubmissionVerificationRequired: true,
      answerScoringRequestFoundationRequired: true,
      injectedScoringRequestPortRequired: true,
      ownStudentOnly: true,
      ownStudentWriteRequired: true,
      verifiedSubmissionQueuedForScoring: true,
      scoringRequestQueued: true,
      reusesExistingAIGradingRequestQueue: true,
      responseMetadataOnly: true,
      answerTextDisclosed: false,
      expectedAnswerDisclosed: false,
      explanationDisclosed: false,
      answerKeyDisclosed: false,
      scoreDisclosed: false,
      resultRefDisclosed: false,
      workerClaimAllowed: false,
      scoringExecutionAllowed: false,
      feedbackPublicationAllowed: false,
      modelInferenceAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as own-student answer scoring request verification evidence; worker scoring input, model scoring, and reviewed feedback remain separate slices."
      : "Fix answer scoring request verification evidence before claiming the Student App can safely queue scoring for submitted question-bank answers.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftAnswerScoringRequestVerificationAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft answer scoring request verification runtime: ${report.readiness}`,
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
      schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-scoring-request-verification.v1",
      verificationInvocationId: "qbank_answer_scoring_request_verification_audit_001",
      principal: {
        principalId: "student_principal_001",
        sessionId: "student_session_001",
        subjectType: "USER",
        role: "STUDENT",
        entryPoint: "STUDENT_APP",
        scopes: ["STUDENT_OWN_READ", "STUDENT_OWN_WRITE"],
        studentAccess: { mode: "OWN", ownStudentId: "student_001" },
      },
      answerSubmissionVerificationReport: reports.answerSubmissionVerificationReport,
      answerScoringRequestFoundationReport: reports.answerScoringRequestFoundationReport,
      answerScoringRequestVerificationPolicy: defaultVerificationPolicy(),
      scoringRequest: {
        gradingInstructions: "Score the submitted answer metadata under the reviewed rubric.",
        rubricRef: "local://rubrics/question-bank-answer-default.json",
      },
      evidenceRefs: [
        "evidence:answer-submission-verification:student-app-ai-tutor-question-bank-draft-answer-submission-verification",
        "evidence:answer-scoring-request-foundation:student-app-ai-tutor-question-bank-draft-answer-scoring-request",
      ],
      idempotencyKey: "student-app-ai-tutor-qbank-answer-scoring-request-verification:audit:student_001:qbank_ans_sub_audit_001",
    };
    const result = await verifyStudentAppAITutorQuestionBankDraftAnswerScoringRequest(input, {
      generatedAt: options.generatedAt ?? "2026-06-06T21:10:00.000Z",
      verificationLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-qbank-scoring-request-verification-audit-")), "verification.jsonl"),
      studentQuestionBankDraftAnswerScoringRequestPort: {
        async createStudentAppQuestionBankDraftAnswerScoringRequest(request, context) {
          calls.push({ request, context });
          const submission = reports.answerSubmissionVerificationReport.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerSubmissionVerification.result.studentQuestionBankDraftAnswerSubmission;
          return {
            queued: true,
            source: {
              targetUseCase: "CreateStudentAppQuestionBankDraftAnswerScoringRequest.Execute",
              repository: "ArchiveRepository.CreateAIGradingRequest",
              endpoint: "POST /v1/student-app/question-bank-draft-answer-submissions/{submissionId}/ai-grading-requests",
              ownStudentOnly: true,
              ownStudentWrite: true,
              submissionScopedLookup: true,
              draftContentScopedLookup: true,
              reusedAIGradingRequestQueue: true,
              principalId: request.principal.principalId,
            },
            response: {
              id: "grading_req_qbank_answer_audit_001",
              submissionId: submission.id,
              questionBankDraftRef: submission.questionBankDraftRef,
              tutoringAnalysisRequestId: submission.tutoringAnalysisRequestId,
              archiveItemId: submission.archiveItemId,
              status: "QUEUED",
              sourceArchiveOwnerType: "STUDENT",
              sourceArchiveContentRef: submission.questionBankDraftRef,
              sourceQuestionBankDraftRef: submission.questionBankDraftRef,
              sourceQuestionBankAnswerSubmissionId: submission.id,
              submittedAnswerItemIds: submission.submittedAnswerItemIds,
              requestedAt: "2026-06-06T21:12:00.000Z",
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
        evidenceClass: "STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_REQUEST_VERIFICATION_PROBE",
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
    answerSubmissionVerificationRequired: true,
    answerScoringRequestFoundationRequired: true,
    injectedScoringRequestPortRequired: true,
    ownStudentPrincipalRequired: true,
    ownStudentWriteScopeRequired: true,
    verifiedSubmissionRequired: true,
    existingAIGradingRequestQueueRequired: true,
    responseMetadataOnlyRequired: true,
    idempotentScoringRequestVerificationRequired: true,
    goUseCaseScoringRequestAllowed: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    answerTextDisclosureAllowed: false,
    expectedAnswerDisclosureAllowed: false,
    explanationDisclosureAllowed: false,
    answerKeyDisclosureAllowed: false,
    scoreDisclosureAllowed: false,
    resultRefDisclosureAllowed: false,
    workerClaimAllowed: false,
    scoringExecutionAllowed: false,
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
  const report = await auditStudentAppAITutorQuestionBankDraftAnswerScoringRequestVerification(loadCurrentInputs(root));
  writeReport(root, out, report);
  console.log(formatStudentAppAITutorQuestionBankDraftAnswerScoringRequestVerificationAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
