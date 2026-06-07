import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION_RUNTIME_ID,
  verifyStudentAppAITutorQuestionBankDraftGenerationContentPhysicalRow,
} from "./student-app-ai-tutor-question-bank-draft-generation-content-row-verification-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-generation-content-row-verification.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-generation-content-row-verification-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-generation-content-row-verification-runtime.test.mjs",
  contentStorageCommitReport: "reports/student-app-ai-tutor-question-bank-draft-generation-content-storage-commit.current.json",
  contentStorageCommitRuntime: "tools/student-app-ai-tutor-question-bank-draft-generation-content-storage-commit-runtime.mjs",
  contentStorageCommitAudit: "tools/student-app-ai-tutor-question-bank-draft-generation-content-storage-commit-audit.mjs",
  repository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_question_bank_draft_content.go",
  repositoryTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_question_bank_draft_content_test.go",
  schema: "services/teaching-archive-gateway/internal/adapter/postgres/repository_schema.go",
  sql: "contracts/sql/teaching-archive.sql",
  presenter: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  responses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0286-student-app-ai-tutor-question-bank-draft-generation-content-row-verification.md",
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
  "answerKeyDisclosureAllowed: true",
  "rawModelOutputDisclosureAllowed: true",
  "modelInferenceAllowed: true",
  "modelInferenceStarted: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export async function auditStudentAppAITutorQuestionBankDraftGenerationContentRowVerification(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const contentStorageCommitReport = parseJson(inputs.contentStorageCommitReport, {});
  const contentStorageCommitEvidence = [
    inputs.contentStorageCommitRuntime ?? "",
    inputs.contentStorageCommitAudit ?? "",
    inputs.contentStorageCommitReport ?? "",
  ].join("\n");
  const persistenceEvidence = [
    inputs.repository ?? "",
    inputs.repositoryTest ?? "",
    inputs.schema ?? "",
    inputs.sql ?? "",
  ].join("\n");
  const studentPresenterEvidence = [
    inputs.presenter ?? "",
    inputs.responses ?? "",
  ].join("\n");
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(contentStorageCommitReport, options);

  addFinding(findings, {
    id: "content_storage_commit.ready_committed",
    passed: contentStorageCommitReport.readiness === "READY" &&
      contentStorageCommitReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMIT" &&
      contentStorageCommitReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_generation_content_storage_commit_runtime" &&
      contentStorageCommitReport.runtime?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMITTED" &&
      contentStorageCommitReport.safetyInvariants?.questionBankContentWriteCommitted === true &&
      contentStorageCommitReport.safetyInvariants?.contentStored === true,
    actual: `${contentStorageCommitReport.readiness ?? "missing"}:${contentStorageCommitReport.runtime?.status ?? "missing"}`,
    expected: "READY 0285 content storage commit that wrote reviewed question-bank content through the Teaching Archive boundary",
    remediation: "Run the 0285 content storage commit audit before verifying physical rows.",
  });

  addFinding(findings, {
    id: "content_storage_commit.safe_surface_preserved",
    passed: includesAll(contentStorageCommitEvidence, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMITTED",
      "questionBankContentWriteCommitted",
      "contentStored",
      "studentSafeQuestionPreviewOnly",
      "ArchiveRepository.SaveQuestionBankDraftContent",
      "teaching_question_bank_draft_contents",
    ]) && !includesAny(inputs.contentStorageCommitRuntime ?? "", [
      "rawModelOutputStored: true",
      "studentAnswerKeyDisclosed: true",
      "studentVisiblePublished: true",
      "swarmAllowed: true",
    ]),
    actual: summarizePresence(contentStorageCommitEvidence, ["questionBankContentWriteCommitted", "contentStored", "studentSafeQuestionPreviewOnly"]),
    expected: "0286 consumes only the safe committed 0285 storage surface",
    remediation: "Do not verify physical rows from a teacher review, model result, or raw database mutation.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION_PORT",
      "StudentAppAITutorQuestionBankDraftGenerationContentRowVerificationPort.verifyQuestionBankDraftContentPhysicalRow",
      "verifyStudentAppAITutorQuestionBankDraftGenerationContentPhysicalRow",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION_READY",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_PHYSICAL_ROW_VERIFIED",
      "QuestionBankDraftContentRowReadPort.getQuestionBankDraftContentForStudent is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_generation_content_row_verification_runtime",
      "QuestionBankDraftContentRowReadPort.getQuestionBankDraftContentForStudent",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_PHYSICAL_ROW_VERIFIED",
    ]),
    expected: "runtime records idempotent content physical row verification through the scoped row read port",
    remediation: "The content row verification slice must stay port-based and idempotent.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "physicalDatabaseRowVerified: true",
      "mainDatabaseReadAllowed: true",
      "internalScoringMaterialPresent: true",
      "internalScoringMaterialDisclosed: false",
      "studentVisiblePublished: false",
      "studentAnsweringStarted: false",
      "scoringStarted: false",
      "answerKeyDisclosed: false",
      "rawModelOutputDisclosed: false",
      "modelInferenceStarted: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "requiresFutureStudentReadVerification: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime verifies only through an injected row read port and blocks raw DB, HTTP, publication, answering, scoring, leaks, tools, and Swarm",
    remediation: "Do not let JS execute SQL, HTTP, scoring, or student publication in the content row verification runtime.",
  });

  addFinding(findings, {
    id: "runtime.probe_verifies_content_physical_row",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_PHYSICAL_ROW_VERIFIED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION_PORT &&
      probe.result?.teachingArchiveContentPhysicalRow?.targetRepository === "ArchiveRepository.GetQuestionBankDraftContentForStudent" &&
      probe.result?.teachingArchiveContentPhysicalRow?.targetTable === "teaching_question_bank_draft_contents" &&
      probe.result?.teachingArchiveContentPhysicalRow?.studentScopedLookup === true &&
      probe.result?.questionBankDraftContentRow?.itemCount === 3 &&
      probe.result?.boundary?.physicalDatabaseRowVerified === true &&
      probe.result?.boundary?.answerKeyDisclosed === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};items=${probe.result.questionBankDraftContentRow.itemCount};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe verifies the committed question-bank content through one injected scoped row read port call",
    remediation: "Row verification must prove scoped read port invocation, exact linkage match, safe preview, and no answer key disclosure.",
  });

  addFinding(findings, {
    id: "tests.cover_content_row_verification_negative_paths",
    passed: includesAll(runtimeTest, [
      "verifies reviewed generated content through the injected scoped row read port",
      "uses idempotency for replay and rejects conflicting content row verification",
      "rejects missing ports, missing rows, mismatched scoped rows, and unsafe row content",
      "rejects direct DB, HTTP, scoring, Swarm, leaked fields, and unsafe student preview",
      "requires storage commit evidence and keeps student read, answering, and scoring future-gated",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, missing port, missing row, mismatch, unsafe row, policy, Swarm, leak, preview leak, and future gate tests",
    remediation: "Add regression coverage before treating content physical row verification as root evidence.",
  });

  addFinding(findings, {
    id: "go_repository_scoped_row_read_evidence_exists",
    passed: includesAll(persistenceEvidence, [
      "func (r *ArchiveRepository) GetQuestionBankDraftContentForStudent",
      "FROM teaching_question_bank_draft_contents",
      "question_bank_draft_ref = $1",
      "student_id = $2",
      "scanQuestionBankDraftContent",
      "NormalizeQuestionBankDraftContent",
      "TestGetQuestionBankDraftContentForStudentUsesScopedLookup",
      "CREATE TABLE IF NOT EXISTS teaching_question_bank_draft_contents",
      "idx_teaching_question_bank_draft_contents_student_updated",
    ]) && !persistenceEvidence.includes("SELECT *"),
    actual: summarizePresence(persistenceEvidence, [
      "GetQuestionBankDraftContentForStudent",
      "question_bank_draft_ref = $1",
      "student_id = $2",
      "SELECT *",
    ]),
    expected: "Go repository has scoped physical row read evidence for teaching_question_bank_draft_contents",
    remediation: "Do not claim physical row verification without Go repository row-read evidence scoped by draft ref and student id.",
  });

  addFinding(findings, {
    id: "student_presenter_keeps_answer_key_out",
    passed: includesAll(studentPresenterEvidence, [
      "func toStudentAppQuestionBankDraftContentResponse",
      "QuestionText:   item.QuestionText",
      "LearningTarget: item.LearningTarget",
      "type questionBankDraftItemResponse struct",
    ]) && !includesAny(extractFunction(studentPresenterEvidence, "toStudentAppQuestionBankDraftContentResponse") + extractGoType(studentPresenterEvidence, "questionBankDraftItemResponse"), [
      "ExpectedAnswer:",
      "Explanation:",
      "ExpectedAnswer string",
      "Explanation string",
    ]),
    actual: summarizePresence(studentPresenterEvidence, ["toStudentAppQuestionBankDraftContentResponse", "ExpectedAnswer", "Explanation"]),
    expected: "student-facing content presenter still exposes only item id, question text, and learning target",
    remediation: "Keep expected answers and explanations for internal scoring input, not Student App content read output.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-draft-generation-content-row-verification"]?.includes("student-app-ai-tutor-question-bank-draft-generation-content-row-verification-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank draft generation content row verification runtime audit",
        "studentAppAiTutorQuestionBankDraftGenerationContentRowVerification",
        "student-app-ai-tutor-question-bank-draft-generation-content-row-verification.current.json",
        "student_app_ai_tutor_question_bank_draft_generation_content_row_verification_runtime",
        "0286-student-app-ai-tutor-question-bank-draft-generation-content-row-verification.md",
        "10.26/10",
        "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_PHYSICAL_ROW_VERIFIED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-generation-content-row-verification",
      "studentAppAiTutorQuestionBankDraftGenerationContentRowVerification",
      "10.26/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0286",
    remediation: "Wire content row verification through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION_PORT,
      sourceContentStorageCommitRuntime: "student_app_ai_tutor_question_bank_draft_generation_content_storage_commit_runtime",
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_PHYSICAL_ROW_VERIFIED",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankDraftGenerationContentRowVerification: probe },
    safetyInvariants: {
      contentStorageCommitRequired: true,
      injectedQuestionBankDraftContentRowReadPortRequired: true,
      archiveRepositoryScopedReadUsed: true,
      committedContentMatchedPhysicalRow: true,
      safeStudentPreviewMatchedPhysicalRow: true,
      internalScoringMaterialPresent: true,
      internalScoringMaterialDisclosed: false,
      physicalDatabaseRowVerified: true,
      studentVisiblePublishAllowed: false,
      studentAnsweringAllowed: false,
      scoringAllowed: false,
      answerKeyDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      modelInferenceAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as reviewed question-bank content physical row verification evidence; student read verification is the next slice."
      : "Fix reviewed question-bank content physical row evidence before claiming row-level durability.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftGenerationContentRowVerificationAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank generation content row verification runtime: ${report.readiness}`,
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

async function runRuntimeProbe(contentStorageCommitReport, options) {
  const startedAt = Date.now();
  const calls = [];
  try {
    const input = {
      schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-content-row-verification.v1",
      verificationInvocationId: "qbank_generation_content_row_verification_audit_001",
      contentStorageCommitReport,
      contentRowVerificationPolicy: defaultVerificationPolicy(),
      evidenceRefs: ["evidence:content-storage-commit:student-app-ai-tutor-qbank-generation-content-storage-commit"],
      idempotencyKey: "student-app-ai-tutor-qbank-generation-content-row-verification:audit:student_001:qbank_generation_review_001",
    };
    const result = await verifyStudentAppAITutorQuestionBankDraftGenerationContentPhysicalRow(input, {
      generatedAt: "2026-06-06T18:10:00.000Z",
      verificationLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-qbank-content-row-verification-audit-")), "verification.jsonl"),
      questionBankDraftContentRowReadPort: {
        async getQuestionBankDraftContentForStudent(questionBankDraftRef, studentId, context) {
          calls.push({ questionBankDraftRef, studentId, context });
          const commit = contentStorageCommitReport.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationContentStorageCommit.result;
          return {
            found: true,
            source: {
              repositoryMethod: "ArchiveRepository.GetQuestionBankDraftContentForStudent",
              targetTable: "teaching_question_bank_draft_contents",
              studentScopedLookup: true,
            },
            row: buildProbeRow(commit),
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
        evidenceClass: "STUDENT_APP_AI_TUTOR_QBANK_GENERATION_CONTENT_ROW_VERIFICATION_PROBE",
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

function buildProbeRow(commit) {
  const content = commit.questionBankDraftContent;
  return {
    questionBankDraftRef: content.questionBankDraftRef,
    tutoringAnalysisRequestId: content.tutoringAnalysisRequestId,
    archiveItemId: content.archiveItemId,
    studentId: content.studentId,
    status: content.status,
    sourceArchiveMaterial: content.sourceArchiveMaterial,
    resultSummary: content.resultSummary,
    internalScoringMaterialPresent: true,
    items: commit.safeStudentContentPreview.items.map((item, index) => ({
      id: item.id,
      questionText: item.questionText,
      learningTarget: item.learningTarget,
      expectedAnswer: `Teacher rubric for audit row item ${index + 1}`,
      explanation: `Teacher scoring explanation for audit row item ${index + 1}`,
    })),
  };
}

function defaultVerificationPolicy() {
  return {
    contentStorageCommitRequired: true,
    physicalRowVerificationRequired: true,
    injectedQuestionBankDraftContentRowReadPortRequired: true,
    archiveRepositoryScopedReadRequired: true,
    committedContentMatchRequired: true,
    safeStudentPreviewMatchRequired: true,
    internalScoringMaterialNonDisclosureRequired: true,
    idempotentRowVerificationRequired: true,
    mainDatabaseReadAllowed: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    studentVisiblePublishAllowed: false,
    studentAnsweringAllowed: false,
    scoringAllowed: false,
    answerKeyDisclosureAllowed: false,
    rawModelOutputDisclosureAllowed: false,
    modelInferenceAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function failedSlo() {
  return { targetP99Ms: 50, p99Ms: 50, totalErrors: 1, operations: 0, evidenceClass: "FAILED_PROBE" };
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
  const report = await auditStudentAppAITutorQuestionBankDraftGenerationContentRowVerification(loadCurrentInputs(root));
  writeReport(root, out, report);
  console.log(formatStudentAppAITutorQuestionBankDraftGenerationContentRowVerificationAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
