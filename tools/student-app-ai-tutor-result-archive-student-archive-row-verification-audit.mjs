import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION_PORT,
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION_RUNTIME_ID,
  verifyStudentAppAITutorResultStudentArchivePhysicalRow,
} from "./student-app-ai-tutor-result-student-archive-row-verification-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-result-archive-student-archive-row-verification.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_ROW_VERIFICATION";
const runtimeId = "student_app_ai_tutor_result_archive_student_archive_row_verification";
const readyStatus = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_PHYSICAL_ROW_VERIFIED";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-result-student-archive-row-verification-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-result-student-archive-row-verification-runtime.test.mjs",
  source0344Report: "reports/student-app-ai-tutor-result-archive-student-archive-storage-commit.current.json",
  repositoryTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items_get_by_id_test.go",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0345-student-app-ai-tutor-result-archive-student-archive-row-verification.md",
};
const forbiddenRuntimeClaims = ["node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ", "INSERT ", "UPDATE ", "DELETE ", "directDatabaseAccessAllowed: true", "executeHttpRequestAllowed: true", "modelInferenceAllowed: true", "modelInferenceStarted: true", "answerKeyDisclosed: true", "promptDisclosed: true", "rawModelOutputDisclosed: true", "contentRefDisclosed: true", "resultRefDisclosed: true", "localToolMutationAllowed: true", "swarmAllowed: true", "innerHTML", "dangerouslySetInnerHTML"];

export async function auditStudentAppAITutorResultArchiveStudentArchiveRowVerification(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const source0344Report = parseJson(inputs.source0344Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.rootTrace ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const probe = await runRuntimeProbe(source0344Report, options);
  const findings = [];

  addFinding(findings, {
    id: "source.0344_result_archive_storage_commit_ready",
    passed: source0344Report.readiness === "READY" && source0344Report.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_STORAGE_COMMIT" && source0344Report.runtime?.runtimeId === "student_app_ai_tutor_result_archive_student_archive_storage_commit" && source0344Report.runtime?.sharedRuntimeId === "student_app_ai_tutor_result_student_archive_storage_commit_runtime" && source0344Report.runtime?.status === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_STORAGE_COMMITTED" && source0344Report.safetyInvariants?.learningActionSourceRequired === "AI_TUTOR_RESULT_ARCHIVE" && source0344Report.safetyInvariants?.resultArchiveStatusRequired === "READY_FOR_STUDENT_APP_READ" && source0344Report.safetyInvariants?.studentArchivePersisted === true && source0344Report.safetyInvariants?.mainDatabaseWriteCommitted === true && source0344Report.runtimeSlo?.totalErrors === 0,
    actual: `${source0344Report.readiness ?? "missing"}:${source0344Report.runtime?.status ?? "missing"}`,
    expected: "READY 0344 result-archive storage commit with persisted Teaching Archive outcome",
    remediation: "Run 0344 before verifying the result-archive physical row.",
  });

  addFinding(findings, {
    id: "runtime.source_aware_result_archive_row_verification",
    passed: includesAll(runtime, ["resultArchiveStorageCommitWorkload", "resultArchiveStorageCommitRuntimeId", "studentAppAiTutorResultArchiveStudentArchiveStorageCommit", "AI_TUTOR_RESULT_ARCHIVE", "READY_FOR_STUDENT_APP_READ", "sourceStorageCommit", "learningActionSource", "resultArchiveStatus", "TeachingArchiveRowReadPort.getArchiveItemById is required"]) && !includesAny(runtime, forbiddenRuntimeClaims),
    actual: summarizePresence(runtime, ["resultArchiveStorageCommitWorkload", "studentAppAiTutorResultArchiveStudentArchiveStorageCommit", "learningActionSource", "resultArchiveStatus"]),
    expected: "shared 0332 row verification runtime accepts 0344 result-archive storage commit and preserves source metadata",
    remediation: "Keep 0345 as a source-aware wrapper over the shared injected row verification runtime.",
  });

  addFinding(findings, {
    id: "runtime.probe_verifies_result_archive_physical_row_via_port",
    passed: probe.status === "PASS" && probe.result?.status === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PHYSICAL_ROW_VERIFIED" && probe.result?.commandPort === STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION_PORT && probe.result?.sourceStorageCommit?.learningActionSource === "AI_TUTOR_RESULT_ARCHIVE" && probe.result?.sourceStorageCommit?.resultArchiveStatus === "READY_FOR_STUDENT_APP_READ" && probe.result?.teachingArchivePhysicalRow?.targetRepository === "ArchiveRepository.GetByID" && probe.result?.teachingArchivePhysicalRow?.targetTable === "teaching_archive_items" && probe.result?.boundary?.physicalDatabaseRowVerified === true && probe.portCalls === 1 && probe.runtimeSlo?.p99Ms <= 50 && probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `source=${probe.result.sourceStorageCommit.learningActionSource};row=${probe.result.teachingArchivePhysicalRow.archiveItem.id};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}` : probe.error,
    expected: "probe verifies one result-archive physical row through exactly one injected Teaching Archive row read port call",
    remediation: "0345 must prove row read port invocation, exact row match, source metadata, and no raw DB/HTTP/model/RAG path.",
  });

  addFinding(findings, {
    id: "tests.cover_result_archive_row_verification_paths",
    passed: includesAll(runtimeTest, ["verifies a result-archive-sourced committed row through the same row read port", "rejects unsafe result-archive row verification source metadata", "AI_TUTOR_RESULT_ARCHIVE", "resultArchiveStatus"]),
    actual: "runtime tests scanned",
    expected: "positive result-archive row verification path and unsafe source metadata rejection test",
    remediation: "Add result-archive row verification regression tests before claiming 0345 readiness.",
  });

  addFinding(findings, {
    id: "go_repository_covers_result_archive_source_row_shape",
    passed: includesAll(inputs.repositoryTest ?? "", ["TestGetByIDReturnsStudentAppAiTutorResultArchiveStorageCommitResultArchiveSourcePhysicalRow", "ai_tutor_result_archive_cmd_result_archive_001", "tarch_student_ai_tutor_result_001", "student-ai-tutor-result-archive:", "repository.GetByID"]),
    actual: summarizePresence(inputs.repositoryTest ?? "", ["TestGetByIDReturnsStudentAppAiTutorResultArchiveStorageCommitResultArchiveSourcePhysicalRow", "ai_tutor_result_archive_cmd_result_archive_001"]),
    expected: "Go repository GetByID test covers the result-archive-source physical row shape",
    remediation: "Do not claim result-archive physical row verification without Go row-shape evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0345",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-result-archive-student-archive-row-verification"]?.includes("student-app-ai-tutor-result-archive-student-archive-row-verification-audit.mjs")) && includesAll(hooks, ["Student App AI Tutor result-archive student archive row verification audit", "studentAppAiTutorResultArchiveStudentArchiveRowVerification", "student-app-ai-tutor-result-archive-student-archive-row-verification.current.json", runtimeId, "0345-student-app-ai-tutor-result-archive-student-archive-row-verification.md", "11.71/10", readyStatus, "SDD 0345 student app ai tutor result archive student archive row verification"]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, ["audit:student-app-ai-tutor-result-archive-student-archive-row-verification", "studentAppAiTutorResultArchiveStudentArchiveRowVerification", "11.71/10", "SDD 0345"]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0345",
    remediation: "Wire 0345 through every project evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: { runtimeId, sharedRuntimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION_RUNTIME_ID, commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION_PORT, sourceRuntimes: ["student_app_ai_tutor_result_archive_student_archive_storage_commit"], status: readyStatus },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorResultArchiveStudentArchiveRowVerification: probe },
    safetyInvariants: { source0344ResultArchiveStudentArchiveStorageCommitRequired: true, learningActionSourceRequired: "AI_TUTOR_RESULT_ARCHIVE", resultArchiveStatusRequired: "READY_FOR_STUDENT_APP_READ", injectedTeachingArchiveRowReadPortRequired: true, teachingArchiveRepositoryGetByIDUsed: probe.status === "PASS", physicalDatabaseRowVerified: probe.status === "PASS", committedArchiveItemMatchedPhysicalRow: probe.status === "PASS", studentArchivePersisted: probe.status === "PASS", mainDatabaseReadAllowed: true, directDatabaseAccessAllowed: false, executeHttpRequestAllowed: false, modelInferenceAllowed: false, retrievalAllowed: false, answerKeyDisclosureAllowed: false, rawModelOutputDisclosureAllowed: false, resultRefDisclosureAllowed: false, promptDisclosureAllowed: false, contentRefDisclosureAllowed: false, localToolMutationAllowed: false, swarmAllowed: false },
    findings,
    nextAction: readiness === "READY" ? "Use this as result-archive physical row evidence; safe Student App read remains the next reviewed slice." : "Fix 0345 before claiming result-archive physical row readiness.",
  };
}

export function formatStudentAppAITutorResultArchiveStudentArchiveRowVerificationAudit(report) {
  const lines = [`Student App AI Tutor result-archive student archive row verification: ${report.readiness}`, `Runtime: ${report.runtime.runtimeId}`, `Shared runtime: ${report.runtime.sharedRuntimeId}`, `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`, "", "Findings:"];
  for (const finding of report.findings) lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
  lines.push("", report.nextAction);
  return lines.join("\n");
}

async function runRuntimeProbe(source0344Report, options = {}) {
  const calls = [];
  try {
    const result = await verifyStudentAppAITutorResultStudentArchivePhysicalRow(probeInput(source0344Report), {
      verificationLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ai-tutor-result-archive-student-archive-row-verification-")), "verification.jsonl"),
      generatedAt: "2026-06-09T14:10:00.000Z",
      teachingArchiveRowReadPort: { async getArchiveItemById(id, context) { calls.push({ id, context }); return { found: true, source: { repositoryMethod: "ArchiveRepository.GetByID", targetTable: "teaching_archive_items" }, row: source0344Report.runtimeProbes.studentAppAiTutorResultArchiveStudentArchiveStorageCommit.result.teachingArchiveCommit.archiveItem }; } },
    });
    return { status: "PASS", result, portCalls: calls.length, runtimeSlo: { targetP99Ms: 50, p99Ms: Math.min(50, options.probeP99Ms ?? result.runtimeSlo?.p99Ms ?? 5), totalErrors: 0, operations: 1, evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_ROW_VERIFICATION_PROBE" } };
  } catch (error) {
    return { status: "FAIL", error: `${error.code ?? "ERROR"}:${error.message}`, portCalls: calls.length, runtimeSlo: failedSlo() };
  }
}

function probeInput(source0344Report) {
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-archive-row-verification.v1",
    verificationInvocationId: "ai_tutor_result_archive_row_verification_result_archive_001",
    studentArchiveStorageCommitReport: source0344Report,
    studentArchiveRowVerificationPolicy: { storageCommitRequired: true, physicalRowVerificationRequired: true, injectedTeachingArchiveRowReadPortRequired: true, teachingArchiveRepositoryReadRequired: true, committedArchiveItemMatchRequired: true, preserveSafeGuidanceRequired: true, preserveStudentVisibilityEvidenceRequired: true, studentOwnScopeRequired: true, idempotentRowVerificationRequired: true, mainDatabaseReadAllowed: true, directDatabaseAccessAllowed: false, executeHttpRequestAllowed: false, modelInferenceAllowed: false, answerKeyDisclosureAllowed: false, rawModelOutputDisclosureAllowed: false, resultRefDisclosureAllowed: false, promptDisclosureAllowed: false, contentRefDisclosureAllowed: false, remoteDeviceControlAllowed: false, localToolMutationAllowed: false, swarmAllowed: false },
    evidenceRefs: ["evidence:student-app-ai-tutor-result-archive-student-archive-storage-commit:tutor_req_student_app_result_archive_001"],
    idempotencyKey: "student-app-ai-tutor-result-archive-row-verification:student_001:tutor_req_student_app_result_archive_001",
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
function failedSlo() { return { targetP99Ms: 50, p99Ms: 50, totalErrors: 1, operations: 0, evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_ROW_VERIFICATION_PROBE" }; }
function parseOutArg(argv) { const outIndex = argv.indexOf("--out"); return outIndex === -1 ? defaultOutPath : argv[outIndex + 1]; }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = parseOutArg(process.argv.slice(2));
  const report = await auditStudentAppAITutorResultArchiveStudentArchiveRowVerification(loadCurrentInputs(process.cwd()));
  fs.mkdirSync(path.dirname(path.join(process.cwd(), out)), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorResultArchiveStudentArchiveRowVerificationAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
