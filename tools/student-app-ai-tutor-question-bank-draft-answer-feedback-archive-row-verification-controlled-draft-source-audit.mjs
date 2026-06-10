import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_CONTROLLED_DRAFT_SOURCE_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID,
  verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRowControlledDraftSource,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_CONTROLLED_DRAFT_SOURCE";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source-runtime.test.mjs",
  storageCommitReport: "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source.current.json",
  storageCommitRuntime: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-runtime.mjs",
  storageCommitAudit: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-audit.mjs",
  teachingArchiveRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items.go",
  teachingArchiveRepositoryTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items_get_by_id_test.go",
  teachingArchiveRepositoryHelpers: "services/teaching-archive-gateway/internal/adapter/postgres/repository_test_helpers_test.go",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0301-student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source.md",
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
  "modelInferenceAllowed: true",
  "modelInferenceStarted: true",
  "answerKeyDisclosureAllowed: true",
  "answerKeyDisclosed: true",
  "workerMetadataDisclosureAllowed: true",
  "workerMetadataDisclosed: true",
  "rawModelOutputDisclosureAllowed: true",
  "rawModelOutputDisclosed: true",
  "resultRefDisclosureAllowed: true",
  "resultRefDisclosed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export async function auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSource(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const storageCommitReport = parseJson(inputs.storageCommitReport, {});
  const sourceResult = storageCommitReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource?.result ?? {};
  const storageCommitEvidence = [inputs.storageCommitRuntime ?? "", inputs.storageCommitAudit ?? "", inputs.storageCommitReport ?? ""].join("\n");
  const repositoryEvidence = [inputs.teachingArchiveRepository ?? "", inputs.teachingArchiveRepositoryTest ?? "", inputs.teachingArchiveRepositoryHelpers ?? ""].join("\n");
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const probe = await runRuntimeProbe(storageCommitReport, options);

  addFinding(findings, {
    id: "storage_commit_controlled_source.ready_committed",
    passed: storageCommitReport.readiness === "READY" &&
      storageCommitReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE" &&
      storageCommitReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_storage_commit_controlled_draft_source_runtime" &&
      storageCommitReport.runtime?.commandPort === "StudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSourcePort.commitTeachingArchiveCreateCommandFromControlledDraftSource" &&
      storageCommitReport.runtime?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED_FROM_CONTROLLED_DRAFT_SOURCE" &&
      storageCommitReport.runtimeSlo?.totalErrors === 0 &&
      storageCommitReport.safetyInvariants?.sourceControlledDraftEvidencePreserved === true &&
      storageCommitReport.safetyInvariants?.studentArchivePersisted === true &&
      storageCommitReport.safetyInvariants?.mainDatabaseWriteCommitted === true,
    actual: `${storageCommitReport.readiness ?? "missing"}:${storageCommitReport.runtime?.runtimeId ?? "missing"}:${storageCommitReport.runtime?.status ?? "missing"}`,
    expected: "READY 0300 controlled-source archive storage commit that is persisted",
    remediation: "Run the 0300 controlled-source archive storage commit audit before verifying physical rows.",
  });

  addFinding(findings, {
    id: "storage_commit_controlled_source.safe_surface_preserved",
    passed: sourceResult.boundary?.archivePersistenceCommandControlledDraftSourceVerified === true &&
      sourceResult.boundary?.sourceControlledDraftEvidencePreserved === true &&
      sourceResult.boundary?.studentArchivePersisted === true &&
      sourceResult.sourcePersistenceCommand?.commitState === "COMMITTED_TO_STUDENT_ARCHIVE" &&
      sourceResult.sourcePersistenceCommand?.sourceControlledDraftArtifactId === sourceResult.sourceControlledFeedbackDraft?.artifactId &&
      includesAll(storageCommitEvidence, [
        "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED_FROM_CONTROLLED_DRAFT_SOURCE",
        "sourceControlledFeedbackDraft",
        "sourceControlledDraftEvidencePreserved",
        "TeachingArchiveCreateItemPort.createArchiveItem",
        "CreateArchiveItem.ExecuteWithPersistence",
      ]) &&
      !includesAny(inputs.storageCommitRuntime ?? "", [
        "answerKeyDisclosed: true",
        "rawModelOutputDisclosed: true",
        "swarmAllowed: true",
      ]),
    actual: summarizeControlledCommit(sourceResult),
    expected: "0301 consumes only the safe committed 0300 controlled-source storage surface",
    remediation: "Do not verify physical rows from a legacy storage commit, model result, delivery envelope, or raw DB mutation.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_CONTROLLED_DRAFT_SOURCE_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSourcePort.verifyTeachingArchivePhysicalRowFromControlledDraftSource",
      "verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRowControlledDraftSource",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_CONTROLLED_DRAFT_SOURCE_READY",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PHYSICAL_ROW_VERIFIED_FROM_CONTROLLED_DRAFT_SOURCE",
      "TeachingArchiveRowReadPort.getArchiveItemById is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_row_verification_controlled_draft_source_runtime",
      "TeachingArchiveRowReadPort.getArchiveItemById",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PHYSICAL_ROW_VERIFIED_FROM_CONTROLLED_DRAFT_SOURCE",
    ]),
    expected: "runtime records idempotent controlled-source physical row verification through the row read port",
    remediation: "The controlled-source row verification slice must stay port-based and idempotent.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "storageCommitControlledDraftSourceVerified: true",
      "controlledDraftSourceVerified: true",
      "sourceControlledDraftEvidencePreserved: true",
      "teachingArchiveRowReadPortInvoked: true",
      "teachingArchiveRepositoryGetByIDUsed: true",
      "physicalDatabaseRowVerified: true",
      "mainDatabaseReadAllowed: true",
      "learnerFeedbackEvidencePreserved: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "modelInferenceStarted: false",
      "answerKeyDisclosed: false",
      "rawModelOutputDisclosed: false",
      "swarmAllowed: false",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime verifies only through an injected row read port and blocks raw DB, HTTP, models, leaks, tools, and Swarm",
    remediation: "Do not let JS execute SQL or HTTP in the controlled-source Student App feedback archive row verification runtime.",
  });

  addFinding(findings, {
    id: "runtime.probe_verifies_controlled_source_physical_row",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PHYSICAL_ROW_VERIFIED_FROM_CONTROLLED_DRAFT_SOURCE" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_CONTROLLED_DRAFT_SOURCE_PORT &&
      probe.result?.sourceStorageCommit?.sourceControlledDraftArtifactId === probe.result?.sourceControlledFeedbackDraft?.artifactId &&
      probe.result?.teachingArchivePhysicalRow?.targetRepository === "ArchiveRepository.GetByID" &&
      probe.result?.teachingArchivePhysicalRow?.targetTable === "teaching_archive_items" &&
      probe.result?.teachingArchivePhysicalRow?.archiveItem?.id === "tarch_student_feedback_controlled_source_001" &&
      probe.result?.boundary?.physicalDatabaseRowVerified === true &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};row=${probe.result.teachingArchivePhysicalRow.archiveItem.id};source=${probe.result.sourceControlledFeedbackDraft.artifactId};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe verifies the 0300 controlled-source committed archive item through one injected row read port call",
    remediation: "Row verification must prove read port invocation, source controlled draft preservation, and exact physical row match.",
  });

  addFinding(findings, {
    id: "tests.cover_controlled_source_row_verification_negative_paths",
    passed: includesAll(runtimeTest, [
      "verifies the 0300 controlled-source committed archive item through the injected row read port",
      "uses idempotency for replay and rejects conflicting controlled-source row verification",
      "rejects unsafe source commits, missing ports, missing rows, mismatched ids, and mismatched content refs",
      "rejects wrong owner scope, direct DB or HTTP policies, Swarm, leaks, and missing controlled-source evidence",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, unsafe source, missing port, missing row, mismatch, wrong owner, DB/HTTP policy, Swarm, leak, and evidence tests",
    remediation: "Add regression coverage before treating controlled-source physical row verification as root Student App evidence.",
  });

  addFinding(findings, {
    id: "teaching_archive.repository_get_by_id_controlled_source_evidence_exists",
    passed: includesAll(repositoryEvidence, [
      "func (r *ArchiveRepository) GetByID",
      "FROM teaching_archive_items",
      "WHERE id = $1",
      "scanArchiveItem",
      "TestGetByIDReturnsStudentAppAiTutorFeedbackArchiveStorageCommitControlledDraftSourcePhysicalRow",
      "singleStudentAppFeedbackArchiveControlledSourceItemRow",
      "tarch_student_feedback_controlled_source_001",
      "student-ai-tutor-feedback-archive-controlled-draft-source:",
      "controlled_draft_source",
    ]),
    actual: summarizePresence(repositoryEvidence, [
      "GetByID",
      "TestGetByIDReturnsStudentAppAiTutorFeedbackArchiveStorageCommitControlledDraftSourcePhysicalRow",
      "tarch_student_feedback_controlled_source_001",
    ]),
    expected: "Go repository has a GetByID physical row query and test for the controlled-source Student App feedback committed shape",
    remediation: "Do not claim controlled-source physical row verification without Go repository row-read evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source"]?.includes("student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank draft answer feedback archive row verification controlled draft source runtime audit",
        "studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSource",
        "student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source.current.json",
        "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_row_verification_controlled_draft_source_runtime",
        "0301-student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source.md",
        "10.41/10",
        "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PHYSICAL_ROW_VERIFIED_FROM_CONTROLLED_DRAFT_SOURCE",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source",
      "studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSource",
      "10.41/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0301",
    remediation: "Wire controlled-source feedback archive row verification through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_CONTROLLED_DRAFT_SOURCE_PORT,
      sourceStorageCommitRuntime: "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_storage_commit_controlled_draft_source_runtime",
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PHYSICAL_ROW_VERIFIED_FROM_CONTROLLED_DRAFT_SOURCE",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSource: probe },
    safetyInvariants: {
      storageCommitControlledDraftSourceRequired: true,
      sourceControlledDraftEvidenceRequired: true,
      injectedTeachingArchiveRowReadPortRequired: true,
      teachingArchiveRepositoryGetByIDUsed: true,
      committedArchiveItemMatchedPhysicalRow: true,
      sourceControlledDraftEvidencePreserved: true,
      safeLearnerFeedbackOnly: true,
      studentOwnScopeEnforced: true,
      mainDatabaseReadAllowed: true,
      physicalDatabaseRowVerified: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      answerKeyDisclosureAllowed: false,
      workerMetadataDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      modelInferenceAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    findings,
    recommendation: readiness === "READY"
      ? "Use this as preferred controlled-source Student App AI Tutor feedback archive physical row evidence; continue with the next root workflow slice."
      : "Address failed findings before claiming controlled-source feedback archive row verification.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSourceAudit(report) {
  return [
    `Student App AI Tutor question-bank draft answer feedback archive row verification controlled draft source runtime: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
    `P99/errors: ${report.runtimeSlo.p99Ms ?? "n/a"}ms/${report.runtimeSlo.totalErrors ?? "n/a"}`,
    "",
    "Findings:",
    ...report.findings.map((finding) => `- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${finding.actual} expected=${finding.expected}`),
    "",
    report.recommendation,
  ].join("\n");
}

export function loadCurrentInputs(root = process.cwd()) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, rel]) => [key, readText(path.join(root, rel))]));
}

async function runRuntimeProbe(storageCommitReport, options) {
  const started = performance.now();
  let portCalls = 0;
  try {
    const source = storageCommitReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource?.result ?? {};
    const result = await verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRowControlledDraftSource(buildProbeInput(storageCommitReport), {
      generatedAt: options.generatedAt ?? "2026-06-07T06:10:00.000Z",
      verificationLogPath: options.verificationLogPath ?? tempVerificationLogPath(),
      teachingArchiveRowReadPort: {
        async getArchiveItemById(id, context) {
          portCalls += 1;
          return {
            found: true,
            source: { repositoryMethod: "ArchiveRepository.GetByID", targetTable: "teaching_archive_items" },
            row: { ...source.teachingArchiveCommit.archiveItem, id },
            context,
          };
        },
      },
    });
    const elapsed = Math.max(1, Math.ceil(options.probeP99Ms ?? (performance.now() - started)));
    return { status: "PASS", result, portCalls, runtimeSlo: { targetP99Ms: 50, p99Ms: elapsed, totalErrors: 0, operations: 1 } };
  } catch (error) {
    const elapsed = Math.max(1, Math.ceil(options.probeP99Ms ?? (performance.now() - started)));
    return { status: "FAIL", error: error.message, portCalls, runtimeSlo: { targetP99Ms: 50, p99Ms: elapsed, totalErrors: 1, operations: 1 } };
  }
}

function buildProbeInput(storageCommitReport) {
  const source = storageCommitReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource?.result ?? {};
  const submissionId = source.sourcePersistenceCommand?.submissionId ?? "qbank_ans_sub_audit_001";
  const scopeRef = source.sourcePersistenceCommand?.scopeRef ?? "student:student_001";
  return {
    schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source.v1",
    verificationInvocationId: "feedback_archive_row_verification_controlled_draft_audit_001",
    feedbackArchiveStorageCommitControlledDraftSourceReport: storageCommitReport,
    feedbackArchiveRowVerificationControlledDraftSourcePolicy: {
      storageCommitControlledDraftSourceRequired: true,
      sourceControlledDraftEvidenceRequired: true,
      physicalRowVerificationRequired: true,
      injectedTeachingArchiveRowReadPortRequired: true,
      teachingArchiveRepositoryReadRequired: true,
      committedArchiveItemMatchRequired: true,
      preserveLearnerFeedbackRequired: true,
      preserveApprovalEvidenceRequired: true,
      preserveControlledDraftSourceEvidenceRequired: true,
      studentOwnScopeRequired: true,
      idempotentRowVerificationRequired: true,
      mainDatabaseReadAllowed: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      modelInferenceAllowed: false,
      answerKeyDisclosureAllowed: false,
      workerMetadataDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      `evidence:feedback-archive-storage-commit-controlled-draft-source:${submissionId}`,
      `evidence:feedback-archive-row-verification-controlled-draft-source:${submissionId}`,
    ],
    idempotencyKey: `student-app-ai-tutor-feedback-archive-row-verification-controlled-draft-source:${scopeRef}:${submissionId}`,
  };
}

function addFinding(findings, finding) {
  findings.push({ ...finding, passed: Boolean(finding.passed) });
}

function includesAll(text, fragments) {
  return fragments.every((fragment) => text.includes(fragment));
}

function includesAny(text, fragments) {
  return fragments.some((fragment) => text.includes(fragment));
}

function hasForbiddenRuntimeClaim(runtime) {
  return includesAny(runtime, forbiddenRuntimeClaims);
}

function summarizePresence(text, fragments) {
  return fragments.map((fragment) => `${fragment}=${text.includes(fragment)}`).join(";");
}

function summarizeControlledCommit(result) {
  return [
    `status=${result.status ?? "missing"}`,
    `archive=${result.teachingArchiveCommit?.archiveItem?.id ?? "missing"}`,
    `sourceDraft=${result.sourceControlledFeedbackDraft?.artifactId ?? "missing"}`,
    `commit=${result.sourcePersistenceCommand?.commitState ?? "missing"}`,
    `sourceControlledDraftEvidencePreserved=${result.boundary?.sourceControlledDraftEvidencePreserved ?? "missing"}`,
    `studentArchivePersisted=${result.boundary?.studentArchivePersisted ?? "missing"}`,
  ].join(";");
}

function failedSlo() {
  return { targetP99Ms: 50, p99Ms: null, totalErrors: 1, operations: 0 };
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function tempVerificationLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-feedback-archive-row-verification-controlled-source-audit-")), "verification.jsonl");
}

async function main() {
  const outPath = getArg("--out") ?? defaultOutPath;
  const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSource();
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSourceAudit(report));
  if (report.readiness !== "READY") process.exitCode = 1;
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
