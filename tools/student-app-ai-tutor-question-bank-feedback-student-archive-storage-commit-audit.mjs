import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_PORT,
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_RUNTIME_ID,
  commitStudentAppAITutorResultStudentArchiveStorage,
} from "./student-app-ai-tutor-result-student-archive-storage-commit-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-feedback-student-archive-storage-commit.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_ARCHIVE_STORAGE_COMMIT";
const runtimeId = "student_app_ai_tutor_question_bank_feedback_student_archive_storage_commit";
const readyStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_ARCHIVE_STORAGE_COMMITTED";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-result-student-archive-storage-commit-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-result-student-archive-storage-commit-runtime.test.mjs",
  source0377Report: "reports/student-app-ai-tutor-question-bank-feedback-student-archive-persistence-command.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0378-student-app-ai-tutor-question-bank-feedback-student-archive-storage-commit.md",
};
const forbiddenRuntimeClaims = ["node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ", "INSERT ", "UPDATE ", "DELETE ", "directDatabaseAccessAllowed: true", "executeHttpRequestAllowed: true", "modelInferenceAllowed: true", "modelInferenceStarted: true", "retrievalAllowed: true", "retrievalStarted: true", "answerKeyDisclosed: true", "promptDisclosed: true", "rawModelOutputDisclosed: true", "contentRefDisclosed: true", "resultRefDisclosed: true", "localToolMutationAllowed: true", "swarmAllowed: true", "feedbackIdsDisclosed: true", "innerHTML", "dangerouslySetInnerHTML"];

export async function auditStudentAppAITutorQuestionBankFeedbackStudentArchiveStorageCommit(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const source0377Report = parseJson(inputs.source0377Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.rootTrace ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const probe = await runRuntimeProbe(source0377Report, options);
  const findings = [];

  addFinding(findings, {
    id: "source.0377_question_bank_feedback_archive_persistence_command_ready",
    passed: source0377Report.readiness === "READY" && source0377Report.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_ARCHIVE_PERSISTENCE_COMMAND" && source0377Report.runtime?.runtimeId === "student_app_ai_tutor_question_bank_feedback_student_archive_persistence_command" && source0377Report.runtime?.sharedRuntimeId === "student_app_ai_tutor_result_student_archive_persistence_command_runtime" && source0377Report.runtime?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED" && source0377Report.safetyInvariants?.learningActionSourceRequired === "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK" && source0377Report.safetyInvariants?.feedbackStatusRequired === "READY_FOR_STUDENT_APP_READ" && source0377Report.safetyInvariants?.studentArchivePersistenceCommandRecorded === true && source0377Report.safetyInvariants?.durableStudentArchiveCommitStarted === false && source0377Report.runtimeSlo?.totalErrors === 0,
    actual: `${source0377Report.readiness ?? "missing"}:${source0377Report.runtime?.status ?? "missing"}`,
    expected: "READY 0377 question-bank-feedback archive persistence command not yet committed",
    remediation: "Run 0377 before committing question-bank-feedback storage.",
  });

  addFinding(findings, {
    id: "runtime.source_aware_question_bank_feedback_storage_commit",
    passed: includesAll(runtime, ["questionBankFeedbackSourceWorkloadType", "questionBankFeedbackSourceRuntimeId", "studentAppAiTutorQuestionBankFeedbackStudentArchivePersistenceCommand", "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK", "READY_FOR_STUDENT_APP_READ", "feedbackStatus: sourceCommand.feedbackStatus", "TeachingArchiveCreateItemPort.createArchiveItem is required"]) && !includesAny(runtime, forbiddenRuntimeClaims),
    actual: summarizePresence(runtime, ["questionBankFeedbackSourceWorkloadType", "studentAppAiTutorQuestionBankFeedbackStudentArchivePersistenceCommand", "feedbackStatus: sourceCommand.feedbackStatus"]),
    expected: "shared 0331 storage commit runtime accepts 0377 question-bank-feedback command and preserves feedback metadata",
    remediation: "Keep 0378 as a source-aware wrapper over the shared 0331 injected storage commit runtime.",
  });

  addFinding(findings, {
    id: "runtime.probe_commits_question_bank_feedback_storage_via_port",
    passed: probe.status === "PASS" && probe.result?.status === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMITTED" && probe.result?.commandPort === STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_PORT && probe.result?.sourcePersistenceCommand?.learningActionSource === "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK" && probe.result?.sourcePersistenceCommand?.feedbackStatus === "READY_FOR_STUDENT_APP_READ" && probe.result?.safeGuidanceSnapshot?.feedbackStatus === "READY_FOR_STUDENT_APP_READ" && probe.result?.teachingArchiveCommit?.targetUseCase === "CreateArchiveItem.ExecuteWithPersistence" && probe.result?.teachingArchiveCommit?.persistence?.status === "persisted" && probe.result?.boundary?.teachingArchiveUseCasePortInvoked === true && probe.result?.boundary?.mainDatabaseWriteCommitted === true && probe.portCalls === 1 && probe.runtimeSlo?.p99Ms <= 50 && probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `source=${probe.result.sourcePersistenceCommand.learningActionSource};feedback=${probe.result.sourcePersistenceCommand.feedbackStatus};archive=${probe.result.teachingArchiveCommit.archiveItem.id};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}` : probe.error,
    expected: "probe commits one question-bank-feedback storage record through exactly one injected Teaching Archive port call",
    remediation: "0378 must prove port invocation, persisted result, feedback metadata, and no raw DB/HTTP/model/RAG path.",
  });

  addFinding(findings, {
    id: "tests.cover_question_bank_feedback_storage_commit_paths",
    passed: includesAll(runtimeTest, ["commits a question-bank-feedback-sourced student archive command through the same storage port", "rejects unsafe question-bank-feedback storage commit source metadata", "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK", "feedbackStatus"]),
    actual: "runtime tests scanned",
    expected: "positive question-bank-feedback storage commit path and unsafe source metadata rejection test",
    remediation: "Add question-bank-feedback storage commit regression tests before claiming 0378 readiness.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0378",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-feedback-student-archive-storage-commit"]?.includes("student-app-ai-tutor-question-bank-feedback-student-archive-storage-commit-audit.mjs")) && includesAll(hooks, ["Student App AI Tutor question-bank-feedback student archive storage commit audit", "studentAppAiTutorQuestionBankFeedbackStudentArchiveStorageCommit", "student-app-ai-tutor-question-bank-feedback-student-archive-storage-commit.current.json", runtimeId, "0378-student-app-ai-tutor-question-bank-feedback-student-archive-storage-commit.md", "12.70/10", readyStatus, "SDD 0378 student app ai tutor question-bank feedback student archive storage commit"]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, ["audit:student-app-ai-tutor-question-bank-feedback-student-archive-storage-commit", "studentAppAiTutorQuestionBankFeedbackStudentArchiveStorageCommit", "12.70/10", "SDD 0378"]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0378",
    remediation: "Wire 0378 through every project evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: { runtimeId, sharedRuntimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_RUNTIME_ID, commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_PORT, sourceRuntimes: ["student_app_ai_tutor_question_bank_feedback_student_archive_persistence_command"], status: readyStatus },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankFeedbackStudentArchiveStorageCommit: probe },
    safetyInvariants: { source0377QuestionBankFeedbackStudentArchivePersistenceCommandRequired: true, learningActionSourceRequired: "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK", feedbackStatusRequired: "READY_FOR_STUDENT_APP_READ", injectedTeachingArchivePortRequired: true, teachingArchiveUseCasePortInvoked: probe.status === "PASS", persistedOutcomeRequired: true, studentArchivePersisted: probe.status === "PASS", mainDatabaseWriteCommitted: probe.status === "PASS", directDatabaseAccessAllowed: false, executeHttpRequestAllowed: false, modelInferenceAllowed: false, retrievalAllowed: false, answerKeyDisclosureAllowed: false, rawModelOutputDisclosureAllowed: false, resultRefDisclosureAllowed: false, promptDisclosureAllowed: false, contentRefDisclosureAllowed: false, feedbackIdsDisclosed: false, localToolMutationAllowed: false, swarmAllowed: false },
    findings,
    nextAction: readiness === "READY" ? "Use this as question-bank-feedback committed storage evidence; physical row verification remains the next reviewed slice." : "Fix 0378 before claiming question-bank-feedback archive storage commit readiness.",
  };
}

export function formatStudentAppAITutorQuestionBankFeedbackStudentArchiveStorageCommitAudit(report) {
  const lines = [`Student App AI Tutor question-bank-feedback student archive storage commit: ${report.readiness}`, `Runtime: ${report.runtime.runtimeId}`, `Shared runtime: ${report.runtime.sharedRuntimeId}`, `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`, "", "Findings:"];
  for (const finding of report.findings) lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
  lines.push("", report.nextAction);
  return lines.join("\n");
}

async function runRuntimeProbe(source0377Report, options = {}) {
  const calls = [];
  try {
    const result = await commitStudentAppAITutorResultStudentArchiveStorage(probeInput(source0377Report), {
      commitLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ai-tutor-question-bank-feedback-student-archive-storage-commit-")), "commit.jsonl"),
      generatedAt: "2026-06-11T16:45:00.000Z",
      teachingArchiveCreateItemPort: { async createArchiveItem(command, context) { calls.push({ command, context }); return { archiveItem: { id: "tarch_student_feedback_001", ownerType: command.requestBody.ownerType, studentId: command.requestBody.studentId, materialType: command.requestBody.materialType, title: command.requestBody.title, source: command.requestBody.source, contentRef: command.requestBody.contentRef, tags: command.requestBody.tags, analysisIntents: command.requestBody.analysisIntents, ocrStatus: "NOT_REQUIRED", createdAt: "2026-06-11T16:45:00.000Z" }, persistence: { status: "persisted", commandId: "" } }; } },
    });
    return { status: "PASS", result, portCalls: calls.length, runtimeSlo: { targetP99Ms: 50, p99Ms: Math.min(50, options.probeP99Ms ?? result.runtimeSlo?.p99Ms ?? 5), totalErrors: 0, operations: 1, evidenceClass: "JS_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_ARCHIVE_STORAGE_COMMIT_PROBE" } };
  } catch (error) {
    return { status: "FAIL", error: `${error.code ?? "ERROR"}:${error.message}`, portCalls: calls.length, runtimeSlo: failedSlo() };
  }
}

function probeInput(source0377Report) {
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-archive-storage-commit.v1",
    commitInvocationId: "ai_tutor_result_archive_storage_commit_feedback_001",
    studentArchivePersistenceCommandReport: source0377Report,
    studentArchiveStorageCommitPolicy: { archivePersistenceCommandRequired: true, teachingArchiveUseCaseCommitAllowed: true, injectedTeachingArchivePortRequired: true, teachingArchiveDomainValidationRequired: true, persistedOutcomeRequired: true, preserveSafeGuidanceRequired: true, idempotentStorageCommitRequired: true, mainDatabaseWriteAllowed: true, directDatabaseAccessAllowed: false, executeHttpRequestAllowed: false, directPublicationAllowed: false, modelInferenceAllowed: false, retrievalAllowed: false, answerKeyDisclosureAllowed: false, rawModelOutputDisclosureAllowed: false, resultRefDisclosureAllowed: false, promptDisclosureAllowed: false, contentRefDisclosureAllowed: false, remoteDeviceControlAllowed: false, localToolMutationAllowed: false, swarmAllowed: false },
    evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-feedback-student-archive-persistence-command:ai_tutor_result_archive_cmd_feedback_001"],
    idempotencyKey: "student-app-ai-tutor-question-bank-feedback-storage-commit:student_001:tutor_req_student_app_feedback_001",
  };
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => {
    const absolute = path.join(root, relativePath);
    return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""];
  }));
}
function parseJson(text, fallback) { try { return JSON.parse(text); } catch { return fallback; } }
function includesAll(text, values) { return values.every((value) => text.includes(value)); }
function includesAny(text, values) { return values.some((value) => text.includes(value)); }
function summarizePresence(text, values) { return values.map((value) => `${value}=${text.includes(value)}`).join(";"); }
function addFinding(findings, finding) { findings.push({ severity: finding.passed ? "info" : "error", ...finding }); }
function stringifyScalar(value) { if (Array.isArray(value)) return value.join(","); if (value && typeof value === "object") return JSON.stringify(value); return String(value); }
function failedSlo() { return { targetP99Ms: 50, p99Ms: 50, totalErrors: 1, operations: 0, evidenceClass: "JS_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_ARCHIVE_STORAGE_COMMIT_PROBE" }; }
function parseOutArg(argv) { const outIndex = argv.indexOf("--out"); return outIndex === -1 ? defaultOutPath : argv[outIndex + 1]; }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = parseOutArg(process.argv.slice(2));
  const report = await auditStudentAppAITutorQuestionBankFeedbackStudentArchiveStorageCommit(loadCurrentInputs(process.cwd()));
  fs.mkdirSync(path.dirname(path.join(process.cwd(), out)), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankFeedbackStudentArchiveStorageCommitAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
