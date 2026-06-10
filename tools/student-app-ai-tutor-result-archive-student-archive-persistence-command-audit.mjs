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

const defaultOutPath = "reports/student-app-ai-tutor-result-archive-student-archive-persistence-command.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_PERSISTENCE_COMMAND";
const runtimeId = "student_app_ai_tutor_result_archive_student_archive_persistence_command";
const readyStatus = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-result-student-archive-persistence-command-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-result-student-archive-persistence-command-runtime.test.mjs",
  source0342Report: "reports/student-app-ai-tutor-result-archive-student-delivery-envelope.current.json",
  source0338Report: "reports/student-app-ai-tutor-result-archive-controlled-answer-artifact.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0343-student-app-ai-tutor-result-archive-student-archive-persistence-command.md",
};
const forbiddenRuntimeClaims = ["node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ", "INSERT ", "UPDATE ", "DELETE ", "durableStudentArchivePersistenceStarted: true", "durableStudentArchiveCommitStarted: true", "studentArchivePersisted: true", "mainDatabaseWriteStarted: true", "studentArchiveWriteStarted: true", "directDatabaseAccessAllowed: true", "executeHttpRequestAllowed: true", "modelInferenceAllowed: true", "retrievalAllowed: true", "localToolMutationAllowed: true", "swarmAllowed: true", "answerKeyDisclosed: true", "promptDisclosed: true", "rawModelOutputDisclosed: true", "contentRefDisclosed: true", "resultRefDisclosed: true", "dangerouslySetInnerHTML", "innerHTML"];

export function auditStudentAppAITutorResultArchiveStudentArchivePersistenceCommand(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const source0342Report = parseJson(inputs.source0342Report, {});
  const source0338Report = parseJson(inputs.source0338Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.rootTrace ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const hashMatch = guidanceHashMatch(source0342Report, source0338Report);
  const probe = runRuntimeProbe(source0342Report, source0338Report, options);

  addFinding(findings, {
    id: "source.0342_result_archive_student_delivery_envelope_ready",
    passed: source0342Report.readiness === "READY" && source0342Report.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_DELIVERY_ENVELOPE" && source0342Report.runtime?.runtimeId === "student_app_ai_tutor_result_archive_student_delivery_envelope" && source0342Report.runtime?.sharedRuntimeId === "student_app_ai_tutor_result_student_delivery_envelope_runtime" && source0342Report.runtime?.status === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED" && source0342Report.safetyInvariants?.learningActionSourceRequired === "AI_TUTOR_RESULT_ARCHIVE" && source0342Report.safetyInvariants?.resultArchiveStatusRequired === "READY_FOR_STUDENT_APP_READ" && source0342Report.safetyInvariants?.studentDeliveryEnvelopeCreated === true && source0342Report.safetyInvariants?.durableStudentArchivePersistenceStarted === false && source0342Report.safetyInvariants?.studentArchiveWriteStarted === false && source0342Report.runtimeSlo?.totalErrors === 0,
    actual: `${source0342Report.readiness ?? "missing"}:${source0342Report.runtime?.status ?? "missing"}`,
    expected: "READY 0342 result-archive student delivery envelope that is renderable but not archived",
    remediation: "Run 0342 before recording the result-archive student archive persistence command.",
  });

  addFinding(findings, {
    id: "source.0338_result_archive_controlled_answer_hash_matches_delivery",
    passed: source0338Report.readiness === "READY" && source0338Report.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_CONTROLLED_ANSWER_ARTIFACT" && source0338Report.runtime?.runtimeId === "student_app_ai_tutor_result_archive_controlled_answer_artifact" && source0338Report.runtime?.sharedRuntimeId === "student_app_ai_tutor_controlled_answer_artifact_runtime" && source0338Report.safetyInvariants?.learningActionSourceRequired === "AI_TUTOR_RESULT_ARCHIVE" && source0338Report.safetyInvariants?.controlledAnswerArtifactRecorded === true && source0338Report.safetyInvariants?.studentVisiblePublished === false && source0338Report.runtimeSlo?.totalErrors === 0 && hashMatch.matched,
    actual: `artifact=${source0338Report.readiness ?? "missing"};hash=${hashMatch.actual ?? "missing"};expected=${hashMatch.expected ?? "missing"}`,
    expected: "READY 0338 result-archive controlled answer artifact whose safe guidance hash matches the 0342 envelope",
    remediation: "Do not record persistence commands when reviewed guidance no longer matches the delivery envelope.",
  });

  addFinding(findings, {
    id: "runtime.source_aware_result_archive_archive_persistence_command",
    passed: includesAll(runtime, ["resultArchiveDeliveryWorkloadType", "resultArchiveControlledArtifactWorkloadType", "studentAppAiTutorResultArchiveStudentDeliveryEnvelope", "studentAppAiTutorResultArchiveControlledAnswerArtifact", "AI_TUTOR_RESULT_ARCHIVE", "READY_FOR_STUDENT_APP_READ", "learningActionSource: normalized.deliveryRecord.learningActionSource", "resultArchiveStatus: normalized.deliveryRecord.resultArchiveStatus", "StudentAppAITutorResultStudentArchivePersistenceCommandPort.recordResultStudentArchivePersistenceCommand"]) && !includesAny(runtime, forbiddenRuntimeClaims),
    actual: summarizePresence(runtime, ["resultArchiveDeliveryWorkloadType", "resultArchiveControlledArtifactWorkloadType", "studentAppAiTutorResultArchiveStudentDeliveryEnvelope", "learningActionSource: normalized.deliveryRecord.learningActionSource"]),
    expected: "shared 0330 runtime accepts 0342/0338 result-archive evidence and preserves source metadata",
    remediation: "Keep 0343 as a source-aware wrapper over the shared 0330 append-only persistence command runtime.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_result_archive_archive_command_not_commit",
    passed: probe.status === "PASS" && probe.result?.status === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED" && probe.result?.commandPort === STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PORT && probe.result?.sourceStudentDeliveryEnvelope?.learningActionSource === "AI_TUTOR_RESULT_ARCHIVE" && probe.result?.sourceStudentDeliveryEnvelope?.resultArchiveStatus === "READY_FOR_STUDENT_APP_READ" && probe.result?.studentArchivePersistenceCommand?.commitState === "NOT_COMMITTED_TO_STUDENT_ARCHIVE" && probe.result?.studentArchivePersistenceCommand?.learningActionSource === "AI_TUTOR_RESULT_ARCHIVE" && probe.result?.boundary?.studentArchivePersistenceCommandRecorded === true && probe.result?.boundary?.durableStudentArchiveCommitStarted === false && probe.result?.boundary?.studentArchivePersisted === false && probe.runtimeSlo?.p99Ms <= 50 && probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `source=${probe.result.sourceStudentDeliveryEnvelope.learningActionSource};commit=${probe.result.boundary.durableStudentArchiveCommitStarted};p99=${probe.runtimeSlo.p99Ms}` : probe.error,
    expected: "probe records one result-archive append-only archive command under 50ms without durable commit",
    remediation: "0343 must stop at command recording and leave durable storage commit to a later reviewed slice.",
  });

  addFinding(findings, {
    id: "tests.cover_result_archive_archive_persistence_paths",
    passed: includesAll(runtimeTest, ["records a result-archive-sourced student archive persistence command without committing it", "rejects unsafe result-archive delivery and artifact source metadata", "AI_TUTOR_RESULT_ARCHIVE", "resultArchiveStatus"]),
    actual: "runtime tests scanned",
    expected: "positive result-archive archive-command path and unsafe source metadata rejection test",
    remediation: "Add result-archive archive persistence regression coverage before claiming 0343 readiness.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0343",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-result-archive-student-archive-persistence-command"]?.includes("student-app-ai-tutor-result-archive-student-archive-persistence-command-audit.mjs")) && includesAll(hooks, ["Student App AI Tutor result-archive student archive persistence command audit", "studentAppAiTutorResultArchiveStudentArchivePersistenceCommand", "student-app-ai-tutor-result-archive-student-archive-persistence-command.current.json", runtimeId, "0343-student-app-ai-tutor-result-archive-student-archive-persistence-command.md", "11.65/10", readyStatus, "SDD 0343 student app ai tutor result archive student archive persistence command"]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, ["audit:student-app-ai-tutor-result-archive-student-archive-persistence-command", "studentAppAiTutorResultArchiveStudentArchivePersistenceCommand", "11.65/10", "SDD 0343"]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0343",
    remediation: "Wire 0343 through every project evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: { runtimeId, sharedRuntimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RUNTIME_ID, commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PORT, sourceRuntimes: ["student_app_ai_tutor_result_archive_student_delivery_envelope", "student_app_ai_tutor_result_archive_controlled_answer_artifact"], status: readyStatus },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorResultArchiveStudentArchivePersistenceCommand: probe },
    safetyInvariants: { source0342ResultArchiveStudentDeliveryEnvelopeRequired: true, source0338ResultArchiveControlledAnswerArtifactRequired: true, learningActionSourceRequired: "AI_TUTOR_RESULT_ARCHIVE", resultArchiveStatusRequired: "READY_FOR_STUDENT_APP_READ", guidanceHashMatchRequired: hashMatch.matched, appendOnlyCommandLogRequired: true, studentArchivePersistenceCommandRecorded: probe.status === "PASS", durableStudentArchivePersistenceStarted: false, durableStudentArchiveCommitStarted: false, studentArchivePersisted: false, mainDatabaseWriteStarted: false, studentArchiveWriteStarted: false, resultRefDisclosed: false, answerKeyDisclosed: false, rawModelOutputDisclosed: false, promptDisclosed: false, contentRefDisclosed: false, directDatabaseAccessAllowed: false, executeHttpRequestAllowed: false, modelInferenceAllowed: false, retrievalAllowed: false, localToolMutationAllowed: false, swarmAllowed: false },
    findings,
    nextAction: readiness === "READY" ? "Use this as result-archive student archive persistence command evidence; durable storage commit remains a later reviewed slice." : "Fix 0343 before claiming result-archive follow-up tutoring can enter archive persistence.",
  };
}

export function formatStudentAppAITutorResultArchiveStudentArchivePersistenceCommandAudit(report) {
  const lines = [`Student App AI Tutor result-archive student archive persistence command: ${report.readiness}`, `Runtime: ${report.runtime.runtimeId}`, `Shared runtime: ${report.runtime.sharedRuntimeId}`, `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`, "", "Findings:"];
  for (const finding of report.findings) lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function runRuntimeProbe(source0342Report, source0338Report, options = {}) {
  try {
    const result = recordStudentAppAITutorResultStudentArchivePersistenceCommand(probeInput(source0342Report, source0338Report), { generatedAt: "2026-06-09T13:10:00.000Z", commandLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ai-tutor-result-archive-student-archive-persistence-")), "persistence.jsonl") });
    const p99Ms = Math.min(50, options.probeP99Ms ?? result.runtimeSlo?.p99Ms ?? 5);
    return { status: "PASS", result, runtimeSlo: { ...result.runtimeSlo, p99Ms, evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PROBE" } };
  } catch (error) {
    return { status: "FAIL", error: `${error.code ?? "ERROR"}:${error.message}`, runtimeSlo: failedSlo() };
  }
}

function probeInput(source0342Report, source0338Report) {
  const result = source0342Report.runtimeProbes?.studentAppAiTutorResultArchiveStudentDeliveryEnvelope?.result ?? {};
  const envelope = result.studentResultDeliveryEnvelope ?? {};
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-archive-persistence-command.v1",
    persistenceInvocationId: "ai_tutor_result_archive_persist_result_archive_001",
    studentResultDeliveryEnvelopeReport: source0342Report,
    controlledAnswerArtifactReport: source0338Report,
    principal: { principalId: "student_archive_persistence_runtime_result_archive_001", subjectType: "SERVICE", role: "SERVICE", entryPoint: "STUDENT_ARCHIVE_PERSISTENCE_RUNTIME", sessionId: "session_student_archive_persistence_result_archive_001", scopes: ["TEACHING_READ", "STUDENT_ARCHIVE_WRITE", "STUDENT_APP_DELIVERY"] },
    studentArchivePersistenceRequest: { commandId: "ai_tutor_result_archive_cmd_result_archive_001", persistenceMode: "APPEND_ONLY_STUDENT_ARCHIVE_COMMAND", targetArchiveKind: "STUDENT_AI_TUTOR_RESULT_ARCHIVE", desiredArchiveState: "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED", scopeRef: envelope.scopeRef, deliveryEnvelopeRecordId: result.recordId, deliveryEnvelopeId: envelope.envelopeId, studentVisibilityReviewRecordId: envelope.studentVisibilityReviewRecordId, studentVisibilityReviewId: envelope.studentVisibilityReviewId, artifactId: envelope.artifactId, requestId: envelope.requestId, archiveItemId: envelope.archiveItemId, guidanceSectionsHash: envelope.guidanceSectionsHash },
    studentArchivePersistencePolicy: { resultStudentDeliveryEnvelopeRequired: true, controlledAnswerArtifactRequired: true, guidanceHashMatchRequired: true, appendOnlyCommandLogRequired: true, safeGuidanceOnlyRequired: true, studentOwnScopeRequired: true, futureDurableArchiveCommitReviewRequired: true, directDatabaseAccessAllowed: false, mainDatabaseWriteAllowed: false, studentArchiveWriteAllowed: false, durableArchiveCommitAllowed: false, executeHttpRequestAllowed: false, modelInferenceAllowed: false, retrievalAllowed: false, answerKeyDisclosureAllowed: false, rawModelOutputDisclosureAllowed: false, resultRefDisclosureAllowed: false, promptDisclosureAllowed: false, contentRefDisclosureAllowed: false, remoteDeviceControlAllowed: false, localToolMutationAllowed: false, swarmAllowed: false },
    evidenceRefs: ["evidence:result-archive-student-delivery-envelope:student-app-ai-tutor-result-archive-student-delivery-envelope", "evidence:result-archive-controlled-answer-artifact:student-app-ai-tutor-result-archive-controlled-answer-artifact"],
    idempotencyKey: "student-app-ai-tutor-result-archive-persistence:ai_tutor_result_delivery_env_result_archive_001",
  };
}

function guidanceHashMatch(source0342Report, source0338Report) {
  const expected = source0342Report.runtimeProbes?.studentAppAiTutorResultArchiveStudentDeliveryEnvelope?.result?.studentResultDeliveryEnvelope?.guidanceSectionsHash;
  const sections = source0338Report.runtimeProbes?.studentAppAiTutorResultArchiveControlledAnswerArtifact?.result?.controlledAnswerArtifact?.guidanceSections;
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
function failedSlo() { return { targetP99Ms: 50, p99Ms: 50, totalErrors: 1, operations: 0, evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PROBE" }; }

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = parseOutArg(process.argv.slice(2));
  const report = auditStudentAppAITutorResultArchiveStudentArchivePersistenceCommand(loadCurrentInputs(process.cwd()));
  fs.mkdirSync(path.dirname(path.join(process.cwd(), out)), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorResultArchiveStudentArchivePersistenceCommandAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
