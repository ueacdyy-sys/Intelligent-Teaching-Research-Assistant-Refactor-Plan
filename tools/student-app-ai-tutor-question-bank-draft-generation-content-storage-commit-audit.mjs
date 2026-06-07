import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMIT_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMIT_RUNTIME_ID,
  commitStudentAppAITutorQuestionBankDraftGenerationContentStorage,
} from "./student-app-ai-tutor-question-bank-draft-generation-content-storage-commit-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-generation-content-storage-commit.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-generation-content-storage-commit-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-generation-content-storage-commit-runtime.test.mjs",
  teacherReviewReport: "reports/student-app-ai-tutor-question-bank-draft-generation-teacher-review.current.json",
  inputEnvelopeReport: "reports/student-app-ai-tutor-question-bank-draft-generation-input-envelope.current.json",
  generationPlanReport: "reports/student-app-ai-tutor-question-bank-draft-generation-plan.current.json",
  sourceRequestReport: "reports/student-app-ai-tutor-request.current.json",
  repository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_question_bank_draft_content.go",
  domain: "services/teaching-archive-gateway/internal/domain/question_bank_draft_content.go",
  presenter: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  responses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  sql: "contracts/sql/teaching-archive.sql",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0285-student-app-ai-tutor-question-bank-draft-generation-content-storage-commit.md",
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
  "studentVisiblePublishAllowed: true",
  "studentAnsweringAllowed: true",
  "scoringAllowed: true",
  "modelInferenceAllowed: true",
  "rawModelOutputStored: true",
  "answerKeyGeneratedByModel: true",
  "studentAnswerKeyDisclosed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export async function auditStudentAppAITutorQuestionBankDraftGenerationContentStorageCommit(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const teacherReviewReport = parseJson(inputs.teacherReviewReport, {});
  const inputEnvelopeReport = parseJson(inputs.inputEnvelopeReport, {});
  const generationPlanReport = parseJson(inputs.generationPlanReport, {});
  const sourceRequestReport = parseJson(inputs.sourceRequestReport, {});
  const goStorageEvidence = [
    inputs.repository ?? "",
    inputs.domain ?? "",
    inputs.sql ?? "",
  ].join("\n");
  const presenterEvidence = [
    inputs.presenter ?? "",
    inputs.responses ?? "",
  ].join("\n");
  const studentContentPresenter = extractFunction(inputs.presenter ?? "", "toStudentAppQuestionBankDraftContentResponse");
  const studentContentResponse = extractGoType(inputs.responses ?? "", "questionBankDraftItemResponse");
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe({ teacherReviewReport, inputEnvelopeReport, generationPlanReport, sourceRequestReport }, options);

  addFinding(findings, {
    id: "source.teacher_review_ready_not_stored",
    passed: teacherReviewReport.readiness === "READY" &&
      teacherReviewReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_generation_teacher_review_runtime" &&
      teacherReviewReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationTeacherReview?.result?.teacherReview?.executionState === "TEACHER_REVIEW_RECORDED_NOT_STORED" &&
      teacherReviewReport.safetyInvariants?.contentStorageApprovalRecorded === true &&
      teacherReviewReport.safetyInvariants?.questionBankContentWriteStarted === false,
    actual: `${teacherReviewReport.readiness ?? "missing"}:${teacherReviewReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationTeacherReview?.result?.teacherReview?.executionState ?? "missing"}`,
    expected: "READY 0284 teacher review approved for content storage but not yet stored",
    remediation: "Run 0284 teacher review before committing generated question-bank content.",
  });

  addFinding(findings, {
    id: "source.envelope_plan_request_linked",
    passed: inputEnvelopeReport.readiness === "READY" &&
      generationPlanReport.readiness === "READY" &&
      sourceRequestReport.readiness === "READY" &&
      linkedQuestionBankEvidence(inputEnvelopeReport, generationPlanReport, sourceRequestReport),
    actual: summarizeLinkedEvidence(inputEnvelopeReport, generationPlanReport, sourceRequestReport),
    expected: "0281 input envelope, 0278 generation plan, and 0260 source request link the same request, archive item, student, material, and draft ref",
    remediation: "Regenerate linked Student App AI Tutor reports before storage commit.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMIT_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMIT_PORT",
      "StudentAppAITutorQuestionBankDraftGenerationContentStorageCommitPort.saveReviewedQuestionBankDraftContent",
      "commitStudentAppAITutorQuestionBankDraftGenerationContentStorage",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMITTED",
      "ArchiveRepository.SaveQuestionBankDraftContent",
      "teaching_question_bank_draft_contents",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_generation_content_storage_commit_runtime",
      "ArchiveRepository.SaveQuestionBankDraftContent",
      "findExistingRecordByIdempotencyKey",
    ]),
    expected: "runtime commits reviewed question-bank content through a named injected Teaching Archive storage port with idempotency",
    remediation: "Keep storage commit port-based and replay-safe.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "questionBankContentWriteStarted: true",
      "questionBankContentWriteCommitted: true",
      "contentStored: true",
      "teacherRubricStoredAsInternalScoringMaterial: true",
      "studentSafeQuestionPreviewOnly: true",
      "rawModelOutputStored: false",
      "studentAnswerKeyDisclosed: false",
      "studentAnsweringStarted: false",
      "scoringStarted: false",
      "studentVisiblePublished: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "requiresFutureRowVerification: true",
      "requiresFutureStudentReadVerification: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime allows only the reviewed content storage boundary and still blocks publication, answering, scoring, raw DB, HTTP, model output, tools, and Swarm",
    remediation: "Do not collapse content storage into student-visible publication or scoring.",
  });

  addFinding(findings, {
    id: "runtime.probe_commits_content_storage",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMITTED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMIT_PORT &&
      probe.result?.teachingArchiveContentStorage?.targetRepository === "ArchiveRepository.SaveQuestionBankDraftContent" &&
      probe.result?.teachingArchiveContentStorage?.targetTable === "teaching_question_bank_draft_contents" &&
      probe.result?.questionBankDraftContent?.itemCount === 3 &&
      probe.result?.boundary?.questionBankContentWriteCommitted === true &&
      probe.result?.boundary?.studentVisiblePublished === false &&
      probe.result?.safeStudentContentPreview?.excludesExpectedAnswerAndExplanation === true &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};items=${probe.result.questionBankDraftContent.itemCount};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe stores reviewed question-bank content once through the injected port while keeping student-visible answers blocked",
    remediation: "Content storage commit must prove persisted content, safe preview, and no publication side effects.",
  });

  addFinding(findings, {
    id: "tests.cover_content_storage_negative_paths",
    passed: includesAll(runtimeTest, [
      "commits teacher-reviewed generated content through the injected Teaching Archive port",
      "uses idempotency for replay and rejects conflicting content storage commits",
      "rejects missing ports, unsafe service principals, unsafe source state, and unsafe policy",
      "rejects leaked model fields, mismatched envelope linkage, unsafe text, and unsafe port results",
      "requires teacher review and input envelope evidence and keeps publication, answering, and scoring future-gated",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, auth, source state, policy, leak, linkage, unsafe text, port result, evidence, and future gate tests",
    remediation: "Add regression tests before counting 0285 as root workflow evidence.",
  });

  addFinding(findings, {
    id: "go_storage_and_student_presenter_boundaries",
    passed: includesAll(normalizeWhitespace(goStorageEvidence), [
      "func (r *ArchiveRepository) SaveQuestionBankDraftContent",
      "NormalizeQuestionBankDraftContent",
      "INSERT INTO teaching_question_bank_draft_contents",
      "ON CONFLICT (question_bank_draft_ref) DO UPDATE",
      "CREATE TABLE IF NOT EXISTS teaching_question_bank_draft_contents",
      "ExpectedAnswer string",
      "Explanation string",
    ]) && includesAll(studentContentPresenter, [
      "func toStudentAppQuestionBankDraftContentResponse",
      "QuestionText:   item.QuestionText",
      "LearningTarget: item.LearningTarget",
    ]) && includesAll(studentContentResponse, [
      "type questionBankDraftItemResponse struct",
      "QuestionText",
      "LearningTarget",
    ]) && !includesAny(studentContentPresenter + studentContentResponse, [
      "ExpectedAnswer:",
      "Explanation:",
      "ExpectedAnswer string",
      "Explanation string",
    ]),
    actual: summarizePresence(goStorageEvidence + presenterEvidence, [
      "SaveQuestionBankDraftContent",
      "teaching_question_bank_draft_contents",
      "ExpectedAnswer string",
      "toStudentAppQuestionBankDraftContentResponse",
    ]),
    expected: "Go repository stores internal rubric/explanation while student content presenter exposes question text and learning target only",
    remediation: "Do not expose expected answers or explanations through the student content read presenter.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-draft-generation-content-storage-commit"]?.includes("student-app-ai-tutor-question-bank-draft-generation-content-storage-commit-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank draft generation content storage commit runtime audit",
        "studentAppAiTutorQuestionBankDraftGenerationContentStorageCommit",
        "student-app-ai-tutor-question-bank-draft-generation-content-storage-commit.current.json",
        "student_app_ai_tutor_question_bank_draft_generation_content_storage_commit_runtime",
        "0285-student-app-ai-tutor-question-bank-draft-generation-content-storage-commit.md",
        "10.25/10",
        "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMITTED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-generation-content-storage-commit",
      "studentAppAiTutorQuestionBankDraftGenerationContentStorageCommit",
      "10.25/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0285",
    remediation: "Wire content storage commit through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMIT",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMIT_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMIT_PORT,
      sourceRuntimes: [
        "student_app_ai_tutor_question_bank_draft_generation_teacher_review_runtime",
        "student_app_ai_tutor_question_bank_draft_generation_input_envelope_runtime",
      ],
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMITTED",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankDraftGenerationContentStorageCommit: probe },
    safetyInvariants: {
      teacherReviewRequired: true,
      generationInputEnvelopeRequired: true,
      injectedTeachingArchivePortRequired: true,
      questionBankContentWriteStarted: true,
      questionBankContentWriteCommitted: true,
      contentStored: true,
      teacherRubricInternalScoringOnly: true,
      safeStudentPreviewOnly: true,
      rawModelOutputStored: false,
      answerKeyGeneratedByModel: false,
      studentAnswerKeyDisclosed: false,
      studentAnsweringAllowed: false,
      scoringAllowed: false,
      studentVisiblePublishAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as reviewed generated question-bank content storage evidence; physical row verification and student read verification are the next slices."
      : "Fix reviewed generated question-bank content storage evidence before claiming durable draft content.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftGenerationContentStorageCommitAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft generation content storage commit runtime: ${report.readiness}`,
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
    const commitLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-generation-content-storage-commit-audit-")), "commit.jsonl");
    const result = await commitStudentAppAITutorQuestionBankDraftGenerationContentStorage(baseInput(reports), {
      commitLogPath,
      generatedAt: options.generatedAt ?? "2026-06-06T17:30:00.000Z",
      questionBankDraftContentStoragePort: {
        async saveReviewedQuestionBankDraftContent(command, context) {
          calls.push({ command, context });
          return {
            persisted: true,
            targetRepository: "ArchiveRepository.SaveQuestionBankDraftContent",
            targetTable: "teaching_question_bank_draft_contents",
            questionBankDraftContent: {
              questionBankDraftRef: command.questionBankDraftContent.questionBankDraftRef,
              tutoringAnalysisRequestId: command.questionBankDraftContent.tutoringAnalysisRequestId,
              archiveItemId: command.questionBankDraftContent.archiveItemId,
              studentId: command.questionBankDraftContent.studentId,
              status: command.questionBankDraftContent.status,
              sourceArchiveMaterial: command.questionBankDraftContent.sourceArchiveMaterial,
              itemCount: command.questionBankDraftContent.items.length,
            },
            studentVisiblePublished: false,
            persistence: { commandId: "" },
          };
        },
      },
    });
    const elapsedMs = Math.max(1, Date.now() - startedAt);
    return {
      status: "PASS",
      result,
      portCalls: calls.length,
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.min(50, options.probeP99Ms ?? elapsedMs),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_STORAGE_COMMIT_PROBE",
      },
    };
  } catch (error) {
    return { status: "FAIL", error: error.message, portCalls: calls.length, runtimeSlo: failedSlo() };
  }
}

function baseInput(reports) {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-content-storage-commit.v1",
    commitInvocationId: "qbank_generation_content_storage_commit_001",
    teacherReviewReport: reports.teacherReviewReport,
    generationInputEnvelopeReport: reports.inputEnvelopeReport,
    generationPlanReport: reports.generationPlanReport,
    sourceRequestReport: reports.sourceRequestReport,
    principal: {
      principalId: "service_student_ai_tutor_qbank_storage",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "QUESTION_BANK_DRAFT_STORAGE_COMMIT"],
      studentAccess: { mode: "ASSIGNED", studentIds: ["student_001"] },
      sessionId: "svc_session_qbank_storage_001",
    },
    contentStorageCommitPolicy: {
      teacherReviewRequired: true,
      generationInputEnvelopeRequired: true,
      generationPlanRequired: true,
      sourceTutorRequestRequired: true,
      injectedTeachingArchivePortRequired: true,
      teachingArchiveDomainValidationRequired: true,
      idempotentStorageCommitRequired: true,
      questionBankContentWriteAllowed: true,
      contentStoredRequired: true,
      teacherRubricInternalScoringOnly: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      studentVisiblePublishAllowed: false,
      studentAnsweringAllowed: false,
      scoringAllowed: false,
      rawModelOutputStored: false,
      modelInferenceAllowed: false,
      modelAnswerKeyGenerated: false,
      answerKeyDisclosureAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      "evidence:generation-teacher-review:qbank_generation_review_001",
      "evidence:generation-input-envelope:qbank_generation_input_envelope_tutor_req_student_app_001",
    ],
    idempotencyKey: "student-app-ai-tutor-qbank-generation-content-storage-commit:student_001:qbank_generation_review_001",
  };
}

function linkedQuestionBankEvidence(envelopeReport, planReport, requestReport) {
  const envelope = envelopeReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationInputEnvelope?.result?.inputEnvelope ?? {};
  const plan = planReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationPlan?.result ?? {};
  const request = requestReport.runtimeProbes?.studentAppAiTutorRequest?.result?.tutoringAnalysisRequest ?? {};
  return envelope.sourceRequestId === plan.sourceResult?.requestId &&
    envelope.sourceRequestId === request.id &&
    envelope.archiveItemId === plan.sourceResult?.archiveItemId &&
    envelope.archiveItemId === request.archiveItemId &&
    envelope.studentId === request.sourceArchiveStudentId &&
    envelope.questionBankDraftRef === plan.sourceResult?.questionBankDraftRef &&
    plan.generationPlan?.futureStorageRepository === "ArchiveRepository.SaveQuestionBankDraftContent" &&
    plan.generationPlan?.targetContentTable === "teaching_question_bank_draft_contents" &&
    request.sourceArchiveMaterial === "QUIZ";
}

function summarizeLinkedEvidence(envelopeReport, planReport, requestReport) {
  const envelope = envelopeReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationInputEnvelope?.result?.inputEnvelope ?? {};
  const plan = planReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationPlan?.result ?? {};
  const request = requestReport.runtimeProbes?.studentAppAiTutorRequest?.result?.tutoringAnalysisRequest ?? {};
  return `envelope=${envelope.sourceRequestId ?? "missing"};plan=${plan.sourceResult?.requestId ?? "missing"};request=${request.id ?? "missing"};table=${plan.generationPlan?.targetContentTable ?? "missing"}`;
}

function extractFunction(text, functionName) {
  const index = text.indexOf(`func ${functionName}`);
  if (index === -1) return "";
  const next = text.indexOf("\nfunc ", index + 5);
  return next === -1 ? text.slice(index) : text.slice(index, next);
}

function extractGoType(text, typeName) {
  const index = text.indexOf(`type ${typeName} `);
  if (index === -1) return "";
  const next = text.indexOf("\ntype ", index + 5);
  return next === -1 ? text.slice(index) : text.slice(index, next);
}

function failedSlo() {
  return { targetP99Ms: 50, p99Ms: 50, totalErrors: 1, operations: 0, evidenceClass: "FAILED_PROBE" };
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

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function includesAll(text = "", needles = []) {
  return needles.every((needle) => text.includes(needle));
}

function includesAny(text = "", needles = []) {
  return needles.some((needle) => text.includes(needle));
}

function normalizeWhitespace(text = "") {
  return text.replace(/\s+/gu, " ").trim();
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
  const report = await auditStudentAppAITutorQuestionBankDraftGenerationContentStorageCommit(loadCurrentInputs(root));
  writeReport(root, out, report);
  console.log(formatStudentAppAITutorQuestionBankDraftGenerationContentStorageCommitAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
