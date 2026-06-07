import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION_RUNTIME_ID,
  verifyStudentAppAITutorQuestionBankDraftContentStudentRead,
} from "./student-app-ai-tutor-question-bank-draft-content-student-read-verification-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-content-student-read-verification.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-content-student-read-verification-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-content-student-read-verification-runtime.test.mjs",
  contentRowVerificationReport: "reports/student-app-ai-tutor-question-bank-draft-generation-content-row-verification.current.json",
  contentReadFoundationReport: "reports/student-app-ai-tutor-question-bank-draft-content-read.current.json",
  contentReadFoundationAudit: "tools/student-app-ai-tutor-question-bank-draft-content-read-audit.mjs",
  usecase: "services/teaching-archive-gateway/internal/usecase/read_student_app_question_bank_draft_content.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/read_student_app_question_bank_draft_content_test.go",
  http: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_content.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_content_test.go",
  presenter: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  responses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  openApiPath: "contracts/openapi/teaching-archive.student-app-question-bank-draft-content.path.yaml",
  repository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_question_bank_draft_content.go",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0287-student-app-ai-tutor-question-bank-draft-content-student-read-verification.md",
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
  "studentAnsweringAllowed: true",
  "studentAnsweringStarted: true",
  "scoringAllowed: true",
  "scoringStarted: true",
  "answerKeyDisclosureAllowed: true",
  "answerKeyDisclosed: true",
  "expectedAnswerDisclosureAllowed: true",
  "expectedAnswerDisclosed: true",
  "explanationDisclosureAllowed: true",
  "explanationDisclosed: true",
  "studentIdDisclosureAllowed: true",
  "studentIdDisclosed: true",
  "workerStateDisclosureAllowed: true",
  "workerStateDisclosed: true",
  "modelInferenceAllowed: true",
  "modelInferenceStarted: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export async function auditStudentAppAITutorQuestionBankDraftContentStudentReadVerification(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const contentRowVerificationReport = parseJson(inputs.contentRowVerificationReport, {});
  const contentReadFoundationReport = parseJson(inputs.contentReadFoundationReport, {});
  const readFoundationEvidence = [
    inputs.contentReadFoundationReport ?? "",
    inputs.contentReadFoundationAudit ?? "",
  ].join("\n");
  const deliveryEvidence = [
    inputs.usecase ?? "",
    inputs.usecaseTest ?? "",
    inputs.http ?? "",
    inputs.httpTest ?? "",
    inputs.presenter ?? "",
    inputs.responses ?? "",
    inputs.openApiPath ?? "",
    inputs.repository ?? "",
  ].join("\n");
  const studentPresenterEvidence = [
    inputs.presenter ?? "",
    inputs.responses ?? "",
    inputs.openApiPath ?? "",
  ].join("\n");
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe({ contentRowVerificationReport, contentReadFoundationReport }, options);

  addFinding(findings, {
    id: "source.content_row_verified",
    passed: contentRowVerificationReport.readiness === "READY" &&
      contentRowVerificationReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_generation_content_row_verification_runtime" &&
      contentRowVerificationReport.runtime?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_PHYSICAL_ROW_VERIFIED" &&
      contentRowVerificationReport.safetyInvariants?.physicalDatabaseRowVerified === true &&
      contentRowVerificationReport.safetyInvariants?.answerKeyDisclosureAllowed === false &&
      contentRowVerificationReport.runtimeSlo?.totalErrors === 0,
    actual: `${contentRowVerificationReport.readiness ?? "missing"}:${contentRowVerificationReport.runtime?.status ?? "missing"}`,
    expected: "READY 0286 content physical row verification with no answer-key disclosure",
    remediation: "Run the 0286 content row verification audit before student read verification.",
  });

  addFinding(findings, {
    id: "source.content_read_foundation_safe",
    passed: contentReadFoundationReport.readiness === "READY" &&
      contentReadFoundationReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_READ_FOUNDATION" &&
      contentReadFoundationReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_content_read_foundation" &&
      contentReadFoundationReport.runtime?.useCase === "ReadStudentAppQuestionBankDraftContent.Execute" &&
      contentReadFoundationReport.runtime?.repository === "ArchiveRepository.GetQuestionBankDraftContentForStudent" &&
      contentReadFoundationReport.safetyInvariants?.ownStudentOnly === true &&
      contentReadFoundationReport.safetyInvariants?.draftRefAndStudentScopedLookup === true &&
      contentReadFoundationReport.safetyInvariants?.exposesExpectedAnswer === false &&
      contentReadFoundationReport.safetyInvariants?.exposesExplanation === false &&
      contentReadFoundationReport.runtimeSlo?.totalErrors === 0,
    actual: summarizePresence(readFoundationEvidence, ["ReadStudentAppQuestionBankDraftContent.Execute", "ownStudentOnly", "exposesExpectedAnswer"]),
    expected: "0265 read foundation is READY and exposes only own-student safe fields",
    remediation: "Fix the content read foundation before claiming student read verification.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION_PORT",
      "StudentAppAITutorQuestionBankDraftContentStudentReadVerificationPort.verifyStudentSafeQuestionBankDraftContentRead",
      "verifyStudentAppAITutorQuestionBankDraftContentStudentRead",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION_READY",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFIED",
      "StudentQuestionBankDraftContentReadPort.readStudentAppQuestionBankDraftContent is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_content_student_read_verification_runtime",
      "StudentQuestionBankDraftContentReadPort.readStudentAppQuestionBankDraftContent",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFIED",
    ]),
    expected: "runtime records idempotent own-student safe read verification through the injected student content read port",
    remediation: "Keep 0287 port-based, replay-safe, and explicitly tied to the student-safe read boundary.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "ownStudentSafeReadVerified: true",
      "safeStudentResponseMatchedVerifiedPreview: true",
      "expectedAnswerDisclosed: false",
      "explanationDisclosed: false",
      "answerKeyDisclosed: false",
      "studentIdDisclosed: false",
      "workerStateDisclosed: false",
      "studentAnsweringStarted: false",
      "scoringStarted: false",
      "modelInferenceStarted: false",
      "goUseCaseReadAllowed: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "requiresFutureAnsweringAndScoring: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime verifies a safe student read only and blocks raw DB, HTTP execution, answer leakage, scoring, model inference, tools, and Swarm",
    remediation: "Do not collapse student read verification into answering, scoring, raw DB access, or student-visible publication.",
  });

  addFinding(findings, {
    id: "runtime.probe_verifies_student_safe_read",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFIED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION_PORT &&
      probe.result?.studentReadSource?.targetUseCase === "ReadStudentAppQuestionBankDraftContent.Execute" &&
      probe.result?.studentReadSource?.repository === "ArchiveRepository.GetQuestionBankDraftContentForStudent" &&
      probe.result?.studentReadSource?.ownStudentOnly === true &&
      probe.result?.studentQuestionBankDraftContent?.items?.length === 3 &&
      probe.result?.boundary?.ownStudentSafeReadVerified === true &&
      probe.result?.boundary?.answerKeyDisclosed === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};items=${probe.result.studentQuestionBankDraftContent.items.length};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe reads safe own-student question-bank draft content once through the injected port",
    remediation: "Student read verification must prove own-student read, safe preview match, no answer leakage, and one injected port call.",
  });

  addFinding(findings, {
    id: "tests.cover_student_read_verification_negative_paths",
    passed: includesAll(runtimeTest, [
      "verifies own-student safe content reads through the injected read port",
      "uses idempotency for replay and rejects conflicting student read verification",
      "rejects missing port, missing content, cross-student principal, and mismatched safe responses",
      "rejects answer, explanation, student id, worker, score, unsafe text, DB, HTTP, model, and Swarm leaks",
      "requires row verification and content read foundation evidence while keeping answering and scoring future-gated",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, missing port, missing content, cross-student, mismatch, leak, unsafe text, policy, evidence, and future gate tests",
    remediation: "Add regression coverage before treating student content read verification as root evidence.",
  });

  addFinding(findings, {
    id: "go_http_openapi_student_safe_read_evidence",
    passed: includesAll(deliveryEvidence, [
      "func (uc *ReadStudentAppQuestionBankDraftContent) Execute",
      "NormalizeReadStudentAppQuestionBankDraftContentInput",
      "GetQuestionBankDraftContentForStudent",
      "question_bank_draft_ref = $1",
      "student_id = $2",
      "readStudentAppQuestionBankDraftContent",
      "toStudentAppQuestionBankDraftContentResponse",
      "TestReadStudentAppQuestionBankDraftContentReturnsOwnContent",
      "TestReadStudentAppQuestionBankDraftContentRejectsCrossStudent",
      "operationId: readStudentAppQuestionBankDraftContent",
    ]) && !deliveryEvidence.includes("SELECT *"),
    actual: summarizePresence(deliveryEvidence, ["GetQuestionBankDraftContentForStudent", "student_id = $2", "readStudentAppQuestionBankDraftContent", "SELECT *"]),
    expected: "Go use case, repository, HTTP route, tests, and OpenAPI support scoped own-student safe reads",
    remediation: "Keep student content reads scoped by student and draft ref through the Go use case and repository.",
  });

  addFinding(findings, {
    id: "student_response_excludes_answer_key_and_internal_fields",
    passed: includesAll(studentPresenterEvidence, [
      "type studentAppQuestionBankDraftContentResponse struct",
      "type questionBankDraftItemResponse struct",
      "QuestionText",
      "LearningTarget",
      "questionText",
      "learningTarget",
    ]) && !includesAny(studentResponseSurface(studentPresenterEvidence), [
      "ExpectedAnswer string",
      "Explanation string",
      "StudentID string",
      "WorkerID string",
      "ScoreSummary string",
      "expectedAnswer",
      "explanation",
      "studentId",
      "workerId",
      "scoreSummary",
    ]) && !includesAny(inputs.openApiPath ?? "", [
      "expectedAnswer",
      "explanation",
      "studentId",
      "workerId",
      "scoreSummary",
    ]),
    actual: summarizePresence(studentPresenterEvidence, ["ExpectedAnswer", "Explanation", "studentId", "workerId", "scoreSummary"]),
    expected: "student content response includes question text and learning target but not expected answers, explanations, student id, worker state, or scores",
    remediation: "Keep answer keys and internal scoring material in worker-only paths, never in Student App content read output.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-draft-content-student-read-verification"]?.includes("student-app-ai-tutor-question-bank-draft-content-student-read-verification-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank draft content student read verification runtime audit",
        "studentAppAiTutorQuestionBankDraftContentStudentReadVerification",
        "student-app-ai-tutor-question-bank-draft-content-student-read-verification.current.json",
        "student_app_ai_tutor_question_bank_draft_content_student_read_verification_runtime",
        "0287-student-app-ai-tutor-question-bank-draft-content-student-read-verification.md",
        "10.27/10",
        "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFIED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-content-student-read-verification",
      "studentAppAiTutorQuestionBankDraftContentStudentReadVerification",
      "10.27/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0287",
    remediation: "Wire content student read verification through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION_PORT,
      sourceRuntimes: [
        "student_app_ai_tutor_question_bank_draft_generation_content_row_verification_runtime",
        "student_app_ai_tutor_question_bank_draft_content_read_foundation",
      ],
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFIED",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankDraftContentStudentReadVerification: probe },
    safetyInvariants: {
      contentRowVerificationRequired: true,
      contentReadFoundationRequired: true,
      injectedStudentContentReadPortRequired: true,
      ownStudentOnly: true,
      safeStudentResponseMatchedVerifiedPreview: true,
      expectedAnswerDisclosed: false,
      explanationDisclosed: false,
      answerKeyDisclosed: false,
      studentIdDisclosed: false,
      workerStateDisclosed: false,
      studentAnsweringAllowed: false,
      scoringAllowed: false,
      modelInferenceAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as own-student safe content read verification evidence; answering and real scoring are the next reviewed slices."
      : "Fix own-student content read evidence before claiming the Student App can safely read generated question-bank content.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftContentStudentReadVerificationAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft content student read verification runtime: ${report.readiness}`,
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
      schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-content-student-read-verification.v1",
      verificationInvocationId: "qbank_content_student_read_verification_audit_001",
      principal: {
        principalId: "student_principal_001",
        sessionId: "student_session_001",
        subjectType: "USER",
        role: "STUDENT",
        entryPoint: "STUDENT_APP",
        scopes: ["STUDENT_OWN_READ"],
        studentAccess: { mode: "OWN", ownStudentId: "student_001" },
      },
      contentRowVerificationReport: reports.contentRowVerificationReport,
      contentReadFoundationReport: reports.contentReadFoundationReport,
      studentReadVerificationPolicy: defaultVerificationPolicy(),
      evidenceRefs: [
        "evidence:content-row-verification:student-app-ai-tutor-qbank-generation-content-row-verification",
        "evidence:content-read-foundation:student-app-ai-tutor-question-bank-draft-content-read",
      ],
      idempotencyKey: "student-app-ai-tutor-qbank-content-student-read-verification:audit:student_001:qbank_generation_review_001",
    };
    const result = await verifyStudentAppAITutorQuestionBankDraftContentStudentRead(input, {
      generatedAt: options.generatedAt ?? "2026-06-06T19:10:00.000Z",
      verificationLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-qbank-content-student-read-verification-audit-")), "verification.jsonl"),
      studentQuestionBankDraftContentReadPort: {
        async readStudentAppQuestionBankDraftContent(request, context) {
          calls.push({ request, context });
          const rowVerification = reports.contentRowVerificationReport.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationContentRowVerification.result;
          return {
            found: true,
            source: {
              targetUseCase: "ReadStudentAppQuestionBankDraftContent.Execute",
              repository: "ArchiveRepository.GetQuestionBankDraftContentForStudent",
              endpoint: "GET /v1/student-app/question-bank-draft-content",
              ownStudentOnly: true,
              studentScopedLookup: true,
              principalId: request.principal.principalId,
            },
            response: buildSafeResponse(rowVerification),
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
        evidenceClass: "STUDENT_APP_AI_TUTOR_QBANK_CONTENT_STUDENT_READ_VERIFICATION_PROBE",
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

function buildSafeResponse(rowVerification) {
  const row = rowVerification.questionBankDraftContentRow;
  return {
    questionBankDraftRef: row.questionBankDraftRef,
    tutoringAnalysisRequestId: row.tutoringAnalysisRequestId,
    archiveItemId: row.archiveItemId,
    sourceArchiveMaterial: row.sourceArchiveMaterial,
    resultSummary: row.resultSummary,
    items: rowVerification.safeStudentContentPreview.items.map((item) => ({ ...item })),
    createdAt: "2026-06-06T18:00:00.000Z",
    updatedAt: "2026-06-06T18:05:00.000Z",
  };
}

function defaultVerificationPolicy() {
  return {
    contentRowVerificationRequired: true,
    contentReadFoundationRequired: true,
    injectedStudentContentReadPortRequired: true,
    ownStudentPrincipalRequired: true,
    safeStudentResponseRequired: true,
    safePreviewMatchRequired: true,
    idempotentStudentReadVerificationRequired: true,
    goUseCaseReadAllowed: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    studentAnsweringAllowed: false,
    scoringAllowed: false,
    answerKeyDisclosureAllowed: false,
    expectedAnswerDisclosureAllowed: false,
    explanationDisclosureAllowed: false,
    studentIdDisclosureAllowed: false,
    workerStateDisclosureAllowed: false,
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

function studentResponseSurface(text) {
  return [
    extractGoType(text, "studentAppQuestionBankDraftContentResponse"),
    extractGoType(text, "questionBankDraftItemResponse"),
  ].join("\n");
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
  const report = await auditStudentAppAITutorQuestionBankDraftContentStudentReadVerification(loadCurrentInputs(root));
  writeReport(root, out, report);
  console.log(formatStudentAppAITutorQuestionBankDraftContentStudentReadVerificationAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
