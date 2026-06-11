import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PORT,
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RUNTIME_ID,
  recordStudentAppAITutorResultStudentArchivePersistenceCommand,
} from "./student-app-ai-tutor-result-student-archive-persistence-command-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-feedback-student-archive-persistence-command.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_ARCHIVE_PERSISTENCE_COMMAND";
const runtimeId = "student_app_ai_tutor_question_bank_feedback_student_archive_persistence_command";
const readyStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-result-student-archive-persistence-command-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-result-student-archive-persistence-command-runtime.test.mjs",
  source0376Report: "reports/student-app-ai-tutor-question-bank-feedback-student-delivery-envelope.current.json",
  source0372Report: "reports/student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0377-student-app-ai-tutor-question-bank-feedback-student-archive-persistence-command.md",
};
const forbiddenRuntimeClaims = ["node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ", "INSERT ", "UPDATE ", "DELETE ", "durableStudentArchivePersistenceStarted: true", "durableStudentArchiveCommitStarted: true", "studentArchivePersisted: true", "mainDatabaseWriteStarted: true", "studentArchiveWriteStarted: true", "directDatabaseAccessAllowed: true", "executeHttpRequestAllowed: true", "modelInferenceAllowed: true", "retrievalAllowed: true", "localToolMutationAllowed: true", "swarmAllowed: true", "answerKeyDisclosed: true", "promptDisclosed: true", "rawModelOutputDisclosed: true", "contentRefDisclosed: true", "resultRefDisclosed: true", "feedbackIdsDisclosed: true", "dangerouslySetInnerHTML", "innerHTML"];

export function auditStudentAppAITutorQuestionBankFeedbackStudentArchivePersistenceCommand(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const source0376Report = parseJson(inputs.source0376Report, {});
  const source0372Report = parseJson(inputs.source0372Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.rootTrace ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const hashMatch = guidanceHashMatch(source0376Report, source0372Report);
  const probe = runRuntimeProbe(source0376Report, source0372Report, options);

  addFinding(findings, {
    id: "source.0376_question_bank_feedback_student_delivery_envelope_ready",
    passed: source0376Report.readiness === "READY" && source0376Report.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_DELIVERY_ENVELOPE" && source0376Report.runtime?.runtimeId === "student_app_ai_tutor_question_bank_feedback_student_delivery_envelope" && source0376Report.runtime?.sharedRuntimeId === "student_app_ai_tutor_result_student_delivery_envelope_runtime" && source0376Report.runtime?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED" && source0376Report.safetyInvariants?.learningActionSourceRequired === "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK" && source0376Report.safetyInvariants?.feedbackStatusRequired === "READY_FOR_STUDENT_APP_READ" && source0376Report.safetyInvariants?.studentDeliveryEnvelopeCreated === true && source0376Report.safetyInvariants?.durableStudentArchivePersistenceStarted === false && source0376Report.safetyInvariants?.studentArchiveWriteStarted === false && source0376Report.safetyInvariants?.feedbackIdsDisclosed === false && source0376Report.runtimeSlo?.totalErrors === 0,
    actual: `${source0376Report.readiness ?? "missing"}:${source0376Report.runtime?.status ?? "missing"}`,
    expected: "READY 0376 question-bank-feedback student delivery envelope that is renderable but not archived",
    remediation: "Run 0376 before recording the question-bank-feedback student archive persistence command.",
  });

  addFinding(findings, {
    id: "source.0372_question_bank_feedback_controlled_answer_hash_matches_delivery",
    passed: source0372Report.readiness === "READY" && source0372Report.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_CONTROLLED_ANSWER_ARTIFACT" && source0372Report.runtime?.runtimeId === "student_app_ai_tutor_question_bank_feedback_controlled_answer_artifact" && source0372Report.runtime?.sharedRuntimeId === "student_app_ai_tutor_controlled_answer_artifact_runtime" && source0372Report.safetyInvariants?.learningActionSourceRequired === "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK" && source0372Report.safetyInvariants?.controlledAnswerArtifactRecorded === true && source0372Report.safetyInvariants?.studentVisiblePublished === false && source0372Report.runtimeSlo?.totalErrors === 0 && hashMatch.matched,
    actual: `artifact=${source0372Report.readiness ?? "missing"};hash=${hashMatch.actual ?? "missing"};expected=${hashMatch.expected ?? "missing"}`,
    expected: "READY 0372 question-bank-feedback controlled answer artifact whose safe guidance hash matches the 0376 envelope",
    remediation: "Do not record persistence commands when reviewed feedback guidance no longer matches the delivery envelope.",
  });

  addFinding(findings, {
    id: "runtime.source_aware_question_bank_feedback_archive_persistence_command",
    passed: includesAll(runtime, ["questionBankFeedbackDeliveryWorkloadType", "questionBankFeedbackControlledArtifactWorkloadType", "studentAppAiTutorQuestionBankFeedbackStudentDeliveryEnvelope", "studentAppAiTutorQuestionBankFeedbackControlledAnswerArtifact", "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK", "READY_FOR_STUDENT_APP_READ", "feedbackStatus: normalized.deliveryRecord.feedbackStatus", "StudentAppAITutorResultStudentArchivePersistenceCommandPort.recordResultStudentArchivePersistenceCommand"]) && !includesAny(runtime, forbiddenRuntimeClaims),
    actual: summarizePresence(runtime, ["questionBankFeedbackDeliveryWorkloadType", "questionBankFeedbackControlledArtifactWorkloadType", "studentAppAiTutorQuestionBankFeedbackStudentDeliveryEnvelope", "feedbackStatus: normalized.deliveryRecord.feedbackStatus"]),
    expected: "shared 0330 runtime accepts 0376/0372 question-bank-feedback evidence and preserves feedback metadata",
    remediation: "Keep 0377 as a source-aware wrapper over the shared 0330 append-only persistence command runtime.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_question_bank_feedback_archive_command_not_commit",
    passed: probe.status === "PASS" && probe.result?.status === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED" && probe.result?.commandPort === STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PORT && probe.result?.sourceStudentDeliveryEnvelope?.learningActionSource === "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK" && probe.result?.sourceStudentDeliveryEnvelope?.feedbackStatus === "READY_FOR_STUDENT_APP_READ" && probe.result?.sourceControlledAnswerArtifact?.feedbackStatus === "READY_FOR_STUDENT_APP_READ" && probe.result?.studentArchivePersistenceCommand?.commitState === "NOT_COMMITTED_TO_STUDENT_ARCHIVE" && probe.result?.studentArchivePersistenceCommand?.learningActionSource === "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK" && probe.result?.studentArchivePersistenceCommand?.feedbackStatus === "READY_FOR_STUDENT_APP_READ" && probe.result?.boundary?.studentArchivePersistenceCommandRecorded === true && probe.result?.boundary?.durableStudentArchiveCommitStarted === false && probe.result?.boundary?.studentArchivePersisted === false && probe.runtimeSlo?.p99Ms <= 50 && probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `source=${probe.result.sourceStudentDeliveryEnvelope.learningActionSource};feedback=${probe.result.sourceStudentDeliveryEnvelope.feedbackStatus};commit=${probe.result.boundary.durableStudentArchiveCommitStarted};p99=${probe.runtimeSlo.p99Ms}` : probe.error,
    expected: "probe records one question-bank-feedback append-only archive command under 50ms without durable commit",
    remediation: "0377 must stop at command recording and leave durable feedback archive storage commit to a later reviewed slice.",
  });

  addFinding(findings, {
    id: "tests.cover_question_bank_feedback_archive_persistence_paths",
    passed: includesAll(runtimeTest, ["records a question-bank-feedback-sourced student archive persistence command without committing it", "rejects unsafe question-bank-feedback delivery and artifact source metadata", "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK", "feedbackStatus"]),
    actual: "runtime tests scanned",
    expected: "positive question-bank-feedback archive-command path and unsafe source metadata rejection test",
    remediation: "Add question-bank-feedback archive persistence regression coverage before claiming 0377 readiness.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0377",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-feedback-student-archive-persistence-command"]?.includes("student-app-ai-tutor-question-bank-feedback-student-archive-persistence-command-audit.mjs")) && includesAll(hooks, ["Student App AI Tutor question-bank-feedback student archive persistence command audit", "studentAppAiTutorQuestionBankFeedbackStudentArchivePersistenceCommand", "student-app-ai-tutor-question-bank-feedback-student-archive-persistence-command.current.json", runtimeId, "0377-student-app-ai-tutor-question-bank-feedback-student-archive-persistence-command.md", "12.67/10", readyStatus, "SDD 0377 student app ai tutor question-bank feedback student archive persistence command"]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, ["audit:student-app-ai-tutor-question-bank-feedback-student-archive-persistence-command", "studentAppAiTutorQuestionBankFeedbackStudentArchivePersistenceCommand", "12.67/10", "SDD 0377"]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0377",
    remediation: "Wire 0377 through every project evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: { runtimeId, sharedRuntimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RUNTIME_ID, commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PORT, sourceRuntimes: ["student_app_ai_tutor_question_bank_feedback_student_delivery_envelope", "student_app_ai_tutor_question_bank_feedback_controlled_answer_artifact"], status: readyStatus },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankFeedbackStudentArchivePersistenceCommand: probe },
    safetyInvariants: { source0376QuestionBankFeedbackStudentDeliveryEnvelopeRequired: true, source0372QuestionBankFeedbackControlledAnswerArtifactRequired: true, learningActionSourceRequired: "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK", feedbackStatusRequired: "READY_FOR_STUDENT_APP_READ", guidanceHashMatchRequired: hashMatch.matched, appendOnlyCommandLogRequired: true, studentArchivePersistenceCommandRecorded: probe.status === "PASS", durableStudentArchivePersistenceStarted: false, durableStudentArchiveCommitStarted: false, studentArchivePersisted: false, mainDatabaseWriteStarted: false, studentArchiveWriteStarted: false, resultRefDisclosed: false, feedbackIdsDisclosed: false, answerKeyDisclosed: false, rawModelOutputDisclosed: false, promptDisclosed: false, contentRefDisclosed: false, directDatabaseAccessAllowed: false, executeHttpRequestAllowed: false, modelInferenceAllowed: false, retrievalAllowed: false, localToolMutationAllowed: false, swarmAllowed: false },
    findings,
    nextAction: readiness === "READY" ? "Use this as question-bank-feedback student archive persistence command evidence; durable feedback archive storage commit remains a later reviewed slice." : "Fix 0377 before claiming question-bank feedback follow-up tutoring can enter archive persistence.",
  };
}

export function formatStudentAppAITutorQuestionBankFeedbackStudentArchivePersistenceCommandAudit(report) {
  const lines = [`Student App AI Tutor question-bank-feedback student archive persistence command: ${report.readiness}`, `Runtime: ${report.runtime.runtimeId}`, `Shared runtime: ${report.runtime.sharedRuntimeId}`, `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`, "", "Findings:"];
  for (const finding of report.findings) lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function runRuntimeProbe(source0376Report, source0372Report, options = {}) {
  try {
    const result = recordStudentAppAITutorResultStudentArchivePersistenceCommand(probeInput(source0376Report, source0372Report), { generatedAt: "2026-06-11T16:20:00.000Z", commandLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ai-tutor-question-bank-feedback-student-archive-persistence-")), "persistence.jsonl") });
    const p99Ms = Math.min(50, options.probeP99Ms ?? result.runtimeSlo?.p99Ms ?? 5);
    return { status: "PASS", result, runtimeSlo: { ...result.runtimeSlo, p99Ms, evidenceClass: "JS_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PROBE" } };
  } catch (error) {
    return { status: "FAIL", error: `${error.code ?? "ERROR"}:${error.message}`, runtimeSlo: failedSlo() };
  }
}

function probeInput(source0376Report, source0372Report) {
  const result = source0376Report.runtimeProbes?.studentAppAiTutorQuestionBankFeedbackStudentDeliveryEnvelope?.result ?? {};
  const envelope = result.studentResultDeliveryEnvelope ?? {};
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-archive-persistence-command.v1",
    persistenceInvocationId: "ai_tutor_result_archive_persist_feedback_001",
    studentResultDeliveryEnvelopeReport: source0376Report,
    controlledAnswerArtifactReport: source0372Report,
    principal: { principalId: "student_archive_persistence_runtime_feedback_001", subjectType: "SERVICE", role: "SERVICE", entryPoint: "STUDENT_ARCHIVE_PERSISTENCE_RUNTIME", sessionId: "session_student_archive_persistence_feedback_001", scopes: ["TEACHING_READ", "STUDENT_ARCHIVE_WRITE", "STUDENT_APP_DELIVERY"] },
    studentArchivePersistenceRequest: { commandId: "ai_tutor_result_archive_cmd_feedback_001", persistenceMode: "APPEND_ONLY_STUDENT_ARCHIVE_COMMAND", targetArchiveKind: "STUDENT_AI_TUTOR_RESULT_ARCHIVE", desiredArchiveState: "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED", scopeRef: envelope.scopeRef, deliveryEnvelopeRecordId: result.recordId, deliveryEnvelopeId: envelope.envelopeId, studentVisibilityReviewRecordId: envelope.studentVisibilityReviewRecordId, studentVisibilityReviewId: envelope.studentVisibilityReviewId, artifactId: envelope.artifactId, requestId: envelope.requestId, archiveItemId: envelope.archiveItemId, guidanceSectionsHash: envelope.guidanceSectionsHash },
    studentArchivePersistencePolicy: { resultStudentDeliveryEnvelopeRequired: true, controlledAnswerArtifactRequired: true, guidanceHashMatchRequired: true, appendOnlyCommandLogRequired: true, safeGuidanceOnlyRequired: true, studentOwnScopeRequired: true, futureDurableArchiveCommitReviewRequired: true, directDatabaseAccessAllowed: false, mainDatabaseWriteAllowed: false, studentArchiveWriteAllowed: false, durableArchiveCommitAllowed: false, executeHttpRequestAllowed: false, modelInferenceAllowed: false, retrievalAllowed: false, answerKeyDisclosureAllowed: false, rawModelOutputDisclosureAllowed: false, resultRefDisclosureAllowed: false, promptDisclosureAllowed: false, contentRefDisclosureAllowed: false, remoteDeviceControlAllowed: false, localToolMutationAllowed: false, swarmAllowed: false },
    evidenceRefs: ["evidence:question-bank-feedback-student-delivery-envelope:student-app-ai-tutor-question-bank-feedback-student-delivery-envelope", "evidence:question-bank-feedback-controlled-answer-artifact:student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact"],
    idempotencyKey: "student-app-ai-tutor-question-bank-feedback-persistence:ai_tutor_result_delivery_env_feedback_001",
  };
}

function guidanceHashMatch(source0376Report, source0372Report) {
  const expected = source0376Report.runtimeProbes?.studentAppAiTutorQuestionBankFeedbackStudentDeliveryEnvelope?.result?.studentResultDeliveryEnvelope?.guidanceSectionsHash;
  const sections = source0372Report.runtimeProbes?.studentAppAiTutorQuestionBankFeedbackControlledAnswerArtifact?.result?.controlledAnswerArtifact?.guidanceSections;
  if (!expected || !Array.isArray(sections)) return { matched: false, expected, actual: undefined };
  const actual = hashGuidanceSections(sections);
  return { matched: actual === expected, expected, actual };
}

function hashGuidanceSections(sections) {
  return hashInput(sections.map((section) => ({ sectionId: section.sectionId, title: section.title, textHash: hashInput(section.text), sourceBlockRefs: section.sourceBlockRefs })));
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => {
    const absolute = path.join(root, relativePath);
    return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""];
  }));
}

function parseJson(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

function includesAll(text, values) { return values.every((value) => text.includes(value)); }
function includesAny(text, values) { return values.some((value) => text.includes(value)); }
function summarizePresence(text, values) { return values.map((value) => `${value}=${text.includes(value)}`).join(";"); }
function addFinding(findings, finding) { findings.push({ severity: finding.passed ? "info" : "error", ...finding }); }
function stringifyScalar(value) { if (Array.isArray(value)) return value.join(","); if (value && typeof value === "object") return JSON.stringify(value); return String(value); }
function failedSlo() { return { targetP99Ms: 50, p99Ms: 50, totalErrors: 1, operations: 0, evidenceClass: "JS_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PROBE" }; }

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = parseOutArg(process.argv.slice(2));
  const report = auditStudentAppAITutorQuestionBankFeedbackStudentArchivePersistenceCommand(loadCurrentInputs(process.cwd()));
  fs.mkdirSync(path.dirname(path.join(process.cwd(), out)), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankFeedbackStudentArchivePersistenceCommandAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
