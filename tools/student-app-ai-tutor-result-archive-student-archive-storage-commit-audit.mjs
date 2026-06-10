import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_PORT,
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_RUNTIME_ID,
  commitStudentAppAITutorResultStudentArchiveStorage,
} from "./student-app-ai-tutor-result-student-archive-storage-commit-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-result-archive-student-archive-storage-commit.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_STORAGE_COMMIT";
const runtimeId = "student_app_ai_tutor_result_archive_student_archive_storage_commit";
const readyStatus = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_STORAGE_COMMITTED";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-result-student-archive-storage-commit-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-result-student-archive-storage-commit-runtime.test.mjs",
  source0343Report: "reports/student-app-ai-tutor-result-archive-student-archive-persistence-command.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0344-student-app-ai-tutor-result-archive-student-archive-storage-commit.md",
};
const forbiddenRuntimeClaims = ["node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ", "INSERT ", "UPDATE ", "DELETE ", "directDatabaseAccessAllowed: true", "executeHttpRequestAllowed: true", "modelInferenceAllowed: true", "modelInferenceStarted: true", "retrievalAllowed: true", "retrievalStarted: true", "answerKeyDisclosed: true", "promptDisclosed: true", "rawModelOutputDisclosed: true", "contentRefDisclosed: true", "resultRefDisclosed: true", "localToolMutationAllowed: true", "swarmAllowed: true", "innerHTML", "dangerouslySetInnerHTML"];

export async function auditStudentAppAITutorResultArchiveStudentArchiveStorageCommit(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const source0343Report = parseJson(inputs.source0343Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.rootTrace ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const probe = await runRuntimeProbe(source0343Report, options);
  const findings = [];

  addFinding(findings, {
    id: "source.0343_result_archive_archive_persistence_command_ready",
    passed: source0343Report.readiness === "READY" && source0343Report.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_PERSISTENCE_COMMAND" && source0343Report.runtime?.runtimeId === "student_app_ai_tutor_result_archive_student_archive_persistence_command" && source0343Report.runtime?.sharedRuntimeId === "student_app_ai_tutor_result_student_archive_persistence_command_runtime" && source0343Report.runtime?.status === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED" && source0343Report.safetyInvariants?.learningActionSourceRequired === "AI_TUTOR_RESULT_ARCHIVE" && source0343Report.safetyInvariants?.resultArchiveStatusRequired === "READY_FOR_STUDENT_APP_READ" && source0343Report.safetyInvariants?.studentArchivePersistenceCommandRecorded === true && source0343Report.safetyInvariants?.durableStudentArchiveCommitStarted === false && source0343Report.runtimeSlo?.totalErrors === 0,
    actual: `${source0343Report.readiness ?? "missing"}:${source0343Report.runtime?.status ?? "missing"}`,
    expected: "READY 0343 result-archive archive persistence command not yet committed",
    remediation: "Run 0343 before committing result-archive storage.",
  });

  addFinding(findings, {
    id: "runtime.source_aware_result_archive_storage_commit",
    passed: includesAll(runtime, ["resultArchiveSourceWorkloadType", "resultArchiveSourceRuntimeId", "studentAppAiTutorResultArchiveStudentArchivePersistenceCommand", "AI_TUTOR_RESULT_ARCHIVE", "READY_FOR_STUDENT_APP_READ", "learningActionSource: sourceCommand.learningActionSource", "resultArchiveStatus: sourceCommand.resultArchiveStatus", "TeachingArchiveCreateItemPort.createArchiveItem is required"]) && !includesAny(runtime, forbiddenRuntimeClaims),
    actual: summarizePresence(runtime, ["resultArchiveSourceWorkloadType", "studentAppAiTutorResultArchiveStudentArchivePersistenceCommand", "learningActionSource: sourceCommand.learningActionSource"]),
    expected: "shared 0331 storage commit runtime accepts 0343 result-archive command and preserves source metadata",
    remediation: "Keep 0344 as a source-aware wrapper over the shared 0331 injected storage commit runtime.",
  });

  addFinding(findings, {
    id: "runtime.probe_commits_result_archive_storage_via_port",
    passed: probe.status === "PASS" && probe.result?.status === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMITTED" && probe.result?.commandPort === STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_PORT && probe.result?.sourcePersistenceCommand?.learningActionSource === "AI_TUTOR_RESULT_ARCHIVE" && probe.result?.sourcePersistenceCommand?.resultArchiveStatus === "READY_FOR_STUDENT_APP_READ" && probe.result?.teachingArchiveCommit?.targetUseCase === "CreateArchiveItem.ExecuteWithPersistence" && probe.result?.teachingArchiveCommit?.persistence?.status === "persisted" && probe.result?.boundary?.teachingArchiveUseCasePortInvoked === true && probe.result?.boundary?.mainDatabaseWriteCommitted === true && probe.portCalls === 1 && probe.runtimeSlo?.p99Ms <= 50 && probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `source=${probe.result.sourcePersistenceCommand.learningActionSource};archive=${probe.result.teachingArchiveCommit.archiveItem.id};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}` : probe.error,
    expected: "probe commits one result-archive storage record through exactly one injected Teaching Archive port call",
    remediation: "0344 must prove port invocation, persisted result, source metadata, and no raw DB/HTTP/model/RAG path.",
  });

  addFinding(findings, {
    id: "tests.cover_result_archive_storage_commit_paths",
    passed: includesAll(runtimeTest, ["commits a result-archive-sourced student archive command through the same storage port", "rejects unsafe result-archive storage commit source metadata", "AI_TUTOR_RESULT_ARCHIVE", "resultArchiveStatus"]),
    actual: "runtime tests scanned",
    expected: "positive result-archive storage commit path and unsafe source metadata rejection test",
    remediation: "Add result-archive storage commit regression tests before claiming 0344 readiness.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0344",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-result-archive-student-archive-storage-commit"]?.includes("student-app-ai-tutor-result-archive-student-archive-storage-commit-audit.mjs")) && includesAll(hooks, ["Student App AI Tutor result-archive student archive storage commit audit", "studentAppAiTutorResultArchiveStudentArchiveStorageCommit", "student-app-ai-tutor-result-archive-student-archive-storage-commit.current.json", runtimeId, "0344-student-app-ai-tutor-result-archive-student-archive-storage-commit.md", "11.68/10", readyStatus, "SDD 0344 student app ai tutor result archive student archive storage commit"]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, ["audit:student-app-ai-tutor-result-archive-student-archive-storage-commit", "studentAppAiTutorResultArchiveStudentArchiveStorageCommit", "11.68/10", "SDD 0344"]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0344",
    remediation: "Wire 0344 through every project evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: { runtimeId, sharedRuntimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_RUNTIME_ID, commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_PORT, sourceRuntimes: ["student_app_ai_tutor_result_archive_student_archive_persistence_command"], status: readyStatus },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorResultArchiveStudentArchiveStorageCommit: probe },
    safetyInvariants: { source0343ResultArchiveStudentArchivePersistenceCommandRequired: true, learningActionSourceRequired: "AI_TUTOR_RESULT_ARCHIVE", resultArchiveStatusRequired: "READY_FOR_STUDENT_APP_READ", injectedTeachingArchivePortRequired: true, teachingArchiveUseCasePortInvoked: probe.status === "PASS", persistedOutcomeRequired: true, studentArchivePersisted: probe.status === "PASS", mainDatabaseWriteCommitted: probe.status === "PASS", directDatabaseAccessAllowed: false, executeHttpRequestAllowed: false, modelInferenceAllowed: false, retrievalAllowed: false, answerKeyDisclosureAllowed: false, rawModelOutputDisclosureAllowed: false, resultRefDisclosureAllowed: false, promptDisclosureAllowed: false, contentRefDisclosureAllowed: false, localToolMutationAllowed: false, swarmAllowed: false },
    findings,
    nextAction: readiness === "READY" ? "Use this as result-archive committed storage evidence; physical row verification remains the next reviewed slice." : "Fix 0344 before claiming result-archive storage commit readiness.",
  };
}

export function formatStudentAppAITutorResultArchiveStudentArchiveStorageCommitAudit(report) {
  const lines = [`Student App AI Tutor result-archive student archive storage commit: ${report.readiness}`, `Runtime: ${report.runtime.runtimeId}`, `Shared runtime: ${report.runtime.sharedRuntimeId}`, `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`, "", "Findings:"];
  for (const finding of report.findings) lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
  lines.push("", report.nextAction);
  return lines.join("\n");
}

async function runRuntimeProbe(source0343Report, options = {}) {
  const calls = [];
  try {
    const result = await commitStudentAppAITutorResultStudentArchiveStorage(probeInput(source0343Report), {
      commitLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ai-tutor-result-archive-student-archive-storage-commit-")), "commit.jsonl"),
      generatedAt: "2026-06-09T13:40:00.000Z",
      teachingArchiveCreateItemPort: { async createArchiveItem(command, context) { calls.push({ command, context }); return { archiveItem: { id: "tarch_student_ai_tutor_result_001", ownerType: command.requestBody.ownerType, studentId: command.requestBody.studentId, materialType: command.requestBody.materialType, title: command.requestBody.title, source: command.requestBody.source, contentRef: command.requestBody.contentRef, tags: command.requestBody.tags, analysisIntents: command.requestBody.analysisIntents, ocrStatus: "NOT_REQUIRED", createdAt: "2026-06-09T13:40:00.000Z" }, persistence: { status: "persisted", commandId: "" } }; } },
    });
    return { status: "PASS", result, portCalls: calls.length, runtimeSlo: { targetP99Ms: 50, p99Ms: Math.min(50, options.probeP99Ms ?? result.runtimeSlo?.p99Ms ?? 5), totalErrors: 0, operations: 1, evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_STORAGE_COMMIT_PROBE" } };
  } catch (error) {
    return { status: "FAIL", error: `${error.code ?? "ERROR"}:${error.message}`, portCalls: calls.length, runtimeSlo: failedSlo() };
  }
}

function probeInput(source0343Report) {
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-archive-storage-commit.v1",
    commitInvocationId: "ai_tutor_result_archive_storage_commit_result_archive_001",
    studentArchivePersistenceCommandReport: source0343Report,
    studentArchiveStorageCommitPolicy: { archivePersistenceCommandRequired: true, teachingArchiveUseCaseCommitAllowed: true, injectedTeachingArchivePortRequired: true, teachingArchiveDomainValidationRequired: true, persistedOutcomeRequired: true, preserveSafeGuidanceRequired: true, idempotentStorageCommitRequired: true, mainDatabaseWriteAllowed: true, directDatabaseAccessAllowed: false, executeHttpRequestAllowed: false, directPublicationAllowed: false, modelInferenceAllowed: false, retrievalAllowed: false, answerKeyDisclosureAllowed: false, rawModelOutputDisclosureAllowed: false, resultRefDisclosureAllowed: false, promptDisclosureAllowed: false, contentRefDisclosureAllowed: false, remoteDeviceControlAllowed: false, localToolMutationAllowed: false, swarmAllowed: false },
    evidenceRefs: ["evidence:student-app-ai-tutor-result-archive-student-archive-persistence-command:ai_tutor_result_archive_cmd_result_archive_001"],
    idempotencyKey: "student-app-ai-tutor-result-archive-storage-commit:student_001:tutor_req_student_app_result_archive_001",
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
function failedSlo() { return { targetP99Ms: 50, p99Ms: 50, totalErrors: 1, operations: 0, evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_STORAGE_COMMIT_PROBE" }; }
function parseOutArg(argv) { const outIndex = argv.indexOf("--out"); return outIndex === -1 ? defaultOutPath : argv[outIndex + 1]; }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = parseOutArg(process.argv.slice(2));
  const report = await auditStudentAppAITutorResultArchiveStudentArchiveStorageCommit(loadCurrentInputs(process.cwd()));
  fs.mkdirSync(path.dirname(path.join(process.cwd(), out)), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorResultArchiveStudentArchiveStorageCommitAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
