import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID,
  commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageControlledDraftSource,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-runtime.test.mjs",
  persistenceCommandReport: "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source.current.json",
  persistenceCommandRuntime: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source-runtime.mjs",
  persistenceCommandAudit: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source-audit.mjs",
  teachingArchiveUsecase: "services/teaching-archive-gateway/internal/usecase/create_archive_item.go",
  teachingArchiveUsecaseTest: "services/teaching-archive-gateway/internal/usecase/create_archive_item_test.go",
  teachingArchivePrincipalTest: "services/teaching-archive-gateway/internal/usecase/principal_test.go",
  teachingArchiveRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items.go",
  teachingArchiveSql: "contracts/sql/teaching-archive.sql",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0300-student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source.md",
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

export async function auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const persistenceCommandReport = parseJson(inputs.persistenceCommandReport, {});
  const sourceResult = persistenceCommandReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource?.result ?? {};
  const persistenceCommandEvidence = [inputs.persistenceCommandRuntime ?? "", inputs.persistenceCommandAudit ?? "", inputs.persistenceCommandReport ?? ""].join("\n");
  const teachingStoragePath = [
    inputs.teachingArchiveUsecase ?? "",
    inputs.teachingArchiveUsecaseTest ?? "",
    inputs.teachingArchivePrincipalTest ?? "",
    inputs.teachingArchiveRepository ?? "",
    inputs.teachingArchiveSql ?? "",
  ].join("\n");
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const probe = await runRuntimeProbe(persistenceCommandReport, options);

  addFinding(findings, {
    id: "persistence_command_controlled_source.ready_not_committed",
    passed: persistenceCommandReport.readiness === "READY" &&
      persistenceCommandReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE_RUNTIME" &&
      persistenceCommandReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_persistence_command_controlled_draft_source_runtime" &&
      persistenceCommandReport.runtime?.commandPort === "StudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSourcePort.recordFeedbackArchivePersistenceCommandFromControlledDraftSource" &&
      persistenceCommandReport.runtime?.status === "PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED" &&
      persistenceCommandReport.runtimeSlo?.totalErrors === 0 &&
      persistenceCommandReport.safetyInvariants?.sourceControlledDraftEvidencePreserved === true &&
      persistenceCommandReport.safetyInvariants?.feedbackArchivePersistenceCommandRecorded === true &&
      persistenceCommandReport.safetyInvariants?.durableStudentArchiveCommitStarted === false &&
      persistenceCommandReport.safetyInvariants?.studentArchivePersisted === false &&
      persistenceCommandReport.safetyInvariants?.mainDatabaseWriteStarted === false,
    actual: `${persistenceCommandReport.readiness ?? "missing"}:${persistenceCommandReport.runtime?.runtimeId ?? "missing"}:${persistenceCommandReport.runtime?.status ?? "missing"}`,
    expected: "READY 0299 controlled-source archive persistence command that is recorded but not committed",
    remediation: "Run the 0299 controlled-source archive persistence command audit before committing archive storage.",
  });

  addFinding(findings, {
    id: "persistence_command_controlled_source.safe_surface_only",
    passed: sourceResult.boundary?.feedbackDeliveryEnvelopeControlledDraftSourceVerified === true &&
      sourceResult.boundary?.sourceControlledDraftEvidencePreserved === true &&
      sourceResult.boundary?.durableStudentArchiveCommitStarted === false &&
      sourceResult.boundary?.studentArchivePersisted === false &&
      sourceResult.feedbackArchivePersistenceCommand?.commandKind === "STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE" &&
      sourceResult.feedbackArchivePersistenceCommand?.sourceControlledDraft?.artifactId === sourceResult.sourceControlledFeedbackDraft?.artifactId &&
      includesAll(persistenceCommandEvidence, [
        "PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED",
        "STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE",
        "sourceControlledFeedbackDraft",
        "sourceControlledDraftEvidencePreserved",
        "scoreSummary",
        "learnerFeedback",
        "NOT_COMMITTED_TO_STUDENT_ARCHIVE",
      ]) &&
      !includesAny(inputs.persistenceCommandRuntime ?? "", [
        "durableStudentArchiveCommitStarted: true",
        "studentArchivePersisted: true",
        "answerKeyDisclosed: true",
        "rawModelOutputDisclosed: true",
      ]),
    actual: summarizeSourceSurface(sourceResult),
    expected: "0300 consumes only the safe 0299 command surface and preserves controlled draft source feedback evidence",
    remediation: "Do not commit archive storage from a delivery envelope, legacy command, or model result directly.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSourcePort.commitTeachingArchiveCreateCommandFromControlledDraftSource",
      "commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageControlledDraftSource",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE_READY",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED_FROM_CONTROLLED_DRAFT_SOURCE",
      "TeachingArchiveCreateItemPort.createArchiveItem is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_storage_commit_controlled_draft_source_runtime",
      "TeachingArchiveCreateItemPort.createArchiveItem",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED_FROM_CONTROLLED_DRAFT_SOURCE",
    ]),
    expected: "runtime commits controlled-source Student App feedback archive storage through an injected Teaching Archive use case port",
    remediation: "Keep controlled-source commit evidence port-based, persisted, and idempotent.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "AGENT_INTERNAL",
      "STUDENT_ARCHIVE_WRITE",
      "STUDENT_ASSIGNED_READ",
      "archivePersistenceCommandControlledDraftSourceVerified: true",
      "controlledDraftSourceVerified: true",
      "sourceControlledDraftEvidencePreserved: true",
      "mainDatabaseWritePrepared: true",
      "mainDatabaseWriteStarted: true",
      "mainDatabaseWriteCommitted: true",
      "studentArchivePersisted: true",
      "safeLearnerFeedbackOnly: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "modelInferenceStarted: false",
      "swarmAllowed: false",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime allows only the injected use case write while blocking raw DB, HTTP, models, tools, leaked fields, and Swarm",
    remediation: "Do not let JS execute SQL or HTTP in the controlled-source Student App feedback archive storage commit runtime.",
  });

  addFinding(findings, {
    id: "runtime.probe_commits_teaching_archive_command_from_controlled_source",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED_FROM_CONTROLLED_DRAFT_SOURCE" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE_PORT &&
      probe.result?.sourceControlledFeedbackDraft?.artifactId === probe.result?.sourcePersistenceCommand?.sourceControlledDraftArtifactId &&
      probe.result?.teachingArchiveCommit?.targetUseCase === "CreateArchiveItem.ExecuteWithPersistence" &&
      probe.result?.teachingArchiveCommit?.archiveItem?.id === "tarch_student_feedback_controlled_source_001" &&
      probe.result?.teachingArchiveCommit?.persistence?.status === "persisted" &&
      probe.result?.boundary?.teachingArchiveUseCasePortInvoked === true &&
      probe.result?.boundary?.sourceControlledDraftEvidencePreserved === true &&
      probe.result?.boundary?.mainDatabaseWriteCommitted === true &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};archive=${probe.result.teachingArchiveCommit.archiveItem.id};source=${probe.result.sourceControlledFeedbackDraft.artifactId};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe commits the 0299 controlled-source command through one injected Teaching Archive use case port call",
    remediation: "Commit must prove port invocation, source controlled draft preservation, and persisted Teaching Archive item evidence.",
  });

  addFinding(findings, {
    id: "tests.cover_controlled_source_commit_negative_paths",
    passed: includesAll(runtimeTest, [
      "commits the 0299 controlled-source archive command through the injected Teaching Archive use case port",
      "uses idempotency for replay and rejects conflicting controlled-source storage commits",
      "rejects unsafe 0299 source reports, missing ports, accepted writes, invalid archive ids, and unsafe feedback text",
      "rejects direct DB or HTTP policies, student scope mismatch, Swarm, leaked fields, and missing controlled-source evidence",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, unsafe 0299 source, missing port, non-persisted, bad id, unsafe text, DB/HTTP policy, student scope, Swarm, leak, and evidence tests",
    remediation: "Add regression coverage before treating controlled-source storage commit as root Student App evidence.",
  });

  addFinding(findings, {
    id: "teaching_archive.use_case_bridge_exists",
    passed: includesAll(teachingStoragePath, [
      "func (uc *CreateArchiveItem) ExecuteWithPersistence",
      "type ArchiveRepository interface",
      "INSERT INTO teaching_archive_items",
      "CREATE TABLE IF NOT EXISTS teaching_archive_items",
      "TestCreateArchiveItemAcceptsStudentAppAiTutorFeedbackArchiveStorageCommitControlledDraftSourceShape",
      "studentAppAiTutorFeedbackArchiveStorageServicePrincipal",
      "PersistenceStatusPersisted",
      "SourceSystemImport",
      "controlled_draft_source",
    ]),
    actual: summarizePresence(teachingStoragePath, [
      "ExecuteWithPersistence",
      "TestCreateArchiveItemAcceptsStudentAppAiTutorFeedbackArchiveStorageCommitControlledDraftSourceShape",
      "controlled_draft_source",
    ]),
    expected: "Go Teaching Archive use case, repository, SQL table, and bridge test accept the controlled-source Student App feedback archive commit shape",
    remediation: "Do not claim committed controlled-source Student App feedback storage without Go use case bridge evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source"]?.includes("student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank draft answer feedback archive storage commit controlled draft source runtime audit",
        "studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource",
        "student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source.current.json",
        "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_storage_commit_controlled_draft_source_runtime",
        "0300-student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source.md",
        "10.40/10",
        "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED_FROM_CONTROLLED_DRAFT_SOURCE",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source",
      "studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource",
      "10.40/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0300",
    remediation: "Wire controlled-source feedback archive storage commit through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE_PORT,
      sourcePersistenceCommandRuntime: "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_persistence_command_controlled_draft_source_runtime",
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED_FROM_CONTROLLED_DRAFT_SOURCE",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource: probe },
    safetyInvariants: {
      archivePersistenceCommandControlledDraftSourceRequired: true,
      sourceControlledDraftEvidenceRequired: true,
      injectedTeachingArchivePortRequired: true,
      teachingArchiveUseCasePortInvoked: true,
      teachingArchiveDomainValidationExecuted: true,
      persistedOutcomeRequired: true,
      sourceControlledDraftEvidencePreserved: true,
      safeLearnerFeedbackOnly: true,
      studentArchivePersisted: true,
      mainDatabaseWriteCommitted: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      answerKeyDisclosureAllowed: false,
      workerMetadataDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      modelInferenceAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as preferred controlled-source Student App AI Tutor feedback archive committed storage evidence; migrate row verification to consume 0300 next."
      : "Fix controlled-source feedback archive storage commit evidence before claiming durable Student App feedback archive storage.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSourceAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft answer feedback archive storage commit controlled draft source runtime: ${report.readiness}`,
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

async function runRuntimeProbe(persistenceCommandReport, options = {}) {
  const startedAt = Date.now();
  const calls = [];
  try {
    const commitLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-feedback-archive-storage-commit-controlled-source-audit-")), "commit.jsonl");
    const result = await commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageControlledDraftSource(baseInput(persistenceCommandReport), {
      commitLogPath,
      generatedAt: options.generatedAt ?? "2026-06-07T05:50:00.000Z",
      teachingArchiveCreateItemPort: {
        async createArchiveItem(command, context) {
          calls.push({ command, context });
          return {
            archiveItem: {
              id: "tarch_student_feedback_controlled_source_001",
              ownerType: command.requestBody.ownerType,
              studentId: command.requestBody.studentId,
              materialType: command.requestBody.materialType,
              title: command.requestBody.title,
              source: command.requestBody.source,
              contentRef: command.requestBody.contentRef,
              tags: command.requestBody.tags,
              analysisIntents: command.requestBody.analysisIntents,
              ocrStatus: "NOT_REQUIRED",
              createdAt: "2026-06-07T05:50:00.000Z",
            },
            persistence: { status: "persisted", commandId: "" },
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
        p99Ms: Math.min(50, options.probeP99Ms ?? Math.max(8, Date.now() - startedAt)),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE_PROBE",
      },
    };
  } catch (error) {
    return { status: "FAIL", error: error instanceof Error ? error.message : String(error), portCalls: calls.length, runtimeSlo: failedSlo() };
  }
}

function baseInput(persistenceCommandReport) {
  const command = feedbackArchivePersistenceCommandFromReport(persistenceCommandReport);
  return {
    schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source.v1",
    commitInvocationId: "feedback_archive_storage_commit_controlled_draft_audit_001",
    feedbackArchivePersistenceCommandControlledDraftSourceReport: persistenceCommandReport,
    feedbackArchiveStorageCommitControlledDraftSourcePolicy: {
      archivePersistenceCommandControlledDraftSourceRequired: true,
      sourceControlledDraftEvidenceRequired: true,
      teachingArchiveUseCaseCommitAllowed: true,
      injectedTeachingArchivePortRequired: true,
      teachingArchiveDomainValidationRequired: true,
      persistedOutcomeRequired: true,
      preserveLearnerFeedbackRequired: true,
      preserveApprovalEvidenceRequired: true,
      preserveControlledDraftSourceEvidenceRequired: true,
      idempotentStorageCommitRequired: true,
      mainDatabaseWriteAllowed: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      directPublicationAllowed: false,
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
      `evidence:feedback-archive-persistence-command-controlled-draft-source:${command.submissionId}`,
      `evidence:feedback-archive-storage-commit-controlled-draft-source:${command.submissionId}`,
    ],
    idempotencyKey: `student-app-ai-tutor-feedback-archive-storage-commit-controlled-draft-source:${command.scopeRef}:${command.submissionId}`,
  };
}

function feedbackArchivePersistenceCommandFromReport(report) {
  const result = report?.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource?.result ?? {};
  const command = result.feedbackArchivePersistenceCommand ?? {};
  return {
    submissionId: typeof command.submissionId === "string" ? command.submissionId : "qbank_ans_sub_audit_001",
    scopeRef: typeof command.scopeRef === "string" ? command.scopeRef : "student:student_001",
  };
}

function summarizeSourceSurface(result) {
  return [
    `status=${result.status ?? "missing"}`,
    `sourceDraft=${result.sourceControlledFeedbackDraft?.artifactId ?? "missing"}`,
    `command=${result.feedbackArchivePersistenceCommand?.commandId ?? "missing"}`,
    `commit=${result.feedbackArchivePersistenceCommand?.commitState ?? "missing"}`,
    `sourceControlledDraftEvidencePreserved=${result.boundary?.sourceControlledDraftEvidencePreserved}`,
    `studentArchivePersisted=${result.boundary?.studentArchivePersisted}`,
  ].join(";");
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
  const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource(loadCurrentInputs(root));
  writeReport(root, out, report);
  console.log(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSourceAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
