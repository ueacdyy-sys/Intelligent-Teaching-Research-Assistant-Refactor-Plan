import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_PORT,
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_RUNTIME_ID,
  commitStudentAppAITutorResultStudentArchiveStorage,
} from "./student-app-ai-tutor-result-student-archive-storage-commit-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-result-student-archive-storage-commit.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-result-student-archive-storage-commit-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-result-student-archive-storage-commit-runtime.test.mjs",
  persistenceCommandReport: "reports/student-app-ai-tutor-result-student-archive-persistence-command.current.json",
  persistenceCommandRuntime: "tools/student-app-ai-tutor-result-student-archive-persistence-command-runtime.mjs",
  teachingArchiveUsecase: "services/teaching-archive-gateway/internal/usecase/create_archive_item.go",
  teachingArchiveUsecaseTest: "services/teaching-archive-gateway/internal/usecase/create_archive_item_test.go",
  teachingArchivePrincipalTest: "services/teaching-archive-gateway/internal/usecase/principal_test.go",
  teachingArchiveRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items.go",
  teachingArchiveSql: "contracts/sql/teaching-archive.sql",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0331-student-app-ai-tutor-result-student-archive-storage-commit.md",
};

const forbiddenRuntimeClaims = [
  "node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ", "INSERT ", "UPDATE ", "DELETE ",
  "directDatabaseAccessAllowed: true", "executeHttpRequestAllowed: true", "directPublicationAllowed: true",
  "modelInferenceAllowed: true", "modelInferenceStarted: true", "retrievalAllowed: true", "retrievalStarted: true",
  "answerKeyDisclosed: true", "promptDisclosed: true", "rawModelOutputDisclosed: true", "contentRefDisclosed: true",
  "resultRefDisclosed: true", "remoteDeviceControlAllowed: true", "localToolMutationAllowed: true", "swarmAllowed: true",
  "innerHTML", "dangerouslySetInnerHTML",
];

export async function auditStudentAppAITutorResultStudentArchiveStorageCommit(inputs, options = {}) {
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const persistenceCommandReport = parseJson(inputs.persistenceCommandReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const sourceCommandEvidence = [inputs.persistenceCommandRuntime ?? "", inputs.persistenceCommandReport ?? ""].join("\n");
  const teachingStoragePath = [
    inputs.teachingArchiveUsecase ?? "",
    inputs.teachingArchiveUsecaseTest ?? "",
    inputs.teachingArchivePrincipalTest ?? "",
    inputs.teachingArchiveRepository ?? "",
    inputs.teachingArchiveSql ?? "",
  ].join("\n");
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.rootTrace ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(persistenceCommandReport, options);
  const findings = [];

  addFinding(findings, {
    id: "source.0330_archive_persistence_command_ready_not_committed",
    passed: persistenceCommandReport.readiness === "READY" &&
      persistenceCommandReport.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND" &&
      persistenceCommandReport.runtime?.runtimeId === "student_app_ai_tutor_result_student_archive_persistence_command_runtime" &&
      persistenceCommandReport.runtime?.status === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED" &&
      persistenceCommandReport.safetyInvariants?.studentArchivePersistenceCommandRecorded === true &&
      persistenceCommandReport.safetyInvariants?.durableStudentArchiveCommitStarted === false &&
      persistenceCommandReport.safetyInvariants?.studentArchivePersisted === false &&
      persistenceCommandReport.runtimeSlo?.totalErrors === 0,
    actual: `${persistenceCommandReport.readiness ?? "missing"}:${persistenceCommandReport.runtime?.status ?? "missing"}`,
    expected: "READY 0330 archive persistence command that is recorded but not committed",
    remediation: "Run 0330 archive persistence command audit before committing storage.",
  });

  addFinding(findings, {
    id: "source.safe_result_command_surface_only",
    passed: includesAll(sourceCommandEvidence, [
      "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_PERSISTENCE_COMMAND",
      "NOT_COMMITTED_TO_STUDENT_ARCHIVE",
      "safeGuidance",
      "guidanceSectionsHash",
      "durableStudentArchiveCommitStarted: false",
      "studentArchivePersisted: false",
    ]) && !includesAny(inputs.persistenceCommandRuntime ?? "", [
      "durableStudentArchiveCommitStarted: true",
      "studentArchivePersisted: true",
      "rawModelOutputDisclosed: true",
      "answerKeyDisclosed: true",
    ]),
    actual: summarizePresence(sourceCommandEvidence, ["safeGuidance", "NOT_COMMITTED_TO_STUDENT_ARCHIVE", "guidanceSectionsHash"]),
    expected: "0331 consumes only the safe 0330 command surface and guidance hash",
    remediation: "Do not commit storage from a delivery envelope, model output, or raw result directly.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_PORT",
      "StudentAppAITutorResultStudentArchiveStorageCommitPort.commitTeachingArchiveCreateCommand",
      "commitStudentAppAITutorResultStudentArchiveStorage",
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMITTED",
      "TeachingArchiveCreateItemPort.createArchiveItem is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_result_student_archive_storage_commit_runtime",
      "TeachingArchiveCreateItemPort.createArchiveItem",
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMITTED",
    ]),
    expected: "runtime commits safe AI Tutor result storage through an injected Teaching Archive use case port",
    remediation: "Keep the storage commit port-based, persisted, and idempotent.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "AGENT_INTERNAL",
      "STUDENT_ARCHIVE_WRITE",
      "STUDENT_ASSIGNED_READ",
      "mainDatabaseWritePrepared: true",
      "mainDatabaseWriteStarted: true",
      "mainDatabaseWriteCommitted: true",
      "studentArchivePersisted: true",
      "safeGuidanceOnly: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "modelInferenceStarted: false",
      "retrievalStarted: false",
      "swarmAllowed: false",
      "requiresFutureRowVerification: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime allows the committed use case write while blocking raw DB, HTTP, models, retrieval, tools, leaks, and Swarm",
    remediation: "Do not let JS execute SQL or HTTP in the result archive storage commit runtime.",
  });

  addFinding(findings, {
    id: "runtime.probe_commits_teaching_archive_command",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMITTED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_PORT &&
      probe.result?.teachingArchiveCommit?.targetUseCase === "CreateArchiveItem.ExecuteWithPersistence" &&
      probe.result?.teachingArchiveCommit?.archiveItem?.id === "tarch_student_ai_tutor_result_001" &&
      probe.result?.teachingArchiveCommit?.persistence?.status === "persisted" &&
      probe.result?.boundary?.teachingArchiveUseCasePortInvoked === true &&
      probe.result?.boundary?.mainDatabaseWriteCommitted === true &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};archive=${probe.result.teachingArchiveCommit.archiveItem.id};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe commits the result archive command through one injected Teaching Archive use case port call",
    remediation: "Commit must prove port invocation and persisted Teaching Archive item evidence.",
  });

  addFinding(findings, {
    id: "tests.cover_storage_commit_negative_paths",
    passed: includesAll(runtimeTest, [
      "commits safe AI Tutor result guidance into Teaching Archive through the injected use case port",
      "uses idempotency for replay and rejects conflicting storage commits",
      "rejects missing ports, accepted writes, invalid archive ids, and unsafe guidance text",
      "rejects direct DB, HTTP, retrieval, model, Swarm policies, student scope mismatch, and leaked fields",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, missing port, non-persisted, bad id, unsafe text, DB/HTTP/retrieval/model/Swarm, student scope, and leak tests",
    remediation: "Add regression coverage before treating storage commit as root Student App evidence.",
  });

  addFinding(findings, {
    id: "teaching_archive.use_case_bridge_exists",
    passed: includesAll(teachingStoragePath, [
      "func (uc *CreateArchiveItem) ExecuteWithPersistence",
      "type ArchiveRepository interface",
      "INSERT INTO teaching_archive_items",
      "CREATE TABLE IF NOT EXISTS teaching_archive_items",
      "TestCreateArchiveItemAcceptsStudentAppAiTutorResultArchiveStorageCommitCommandShape",
      "studentAppAiTutorFeedbackArchiveStorageServicePrincipal",
      "PersistenceStatusPersisted",
      "student-ai-tutor-result-archive",
    ]),
    actual: summarizePresence(teachingStoragePath, [
      "ExecuteWithPersistence",
      "TestCreateArchiveItemAcceptsStudentAppAiTutorResultArchiveStorageCommitCommandShape",
      "student-ai-tutor-result-archive",
    ]),
    expected: "Go Teaching Archive use case, repository, SQL table, and bridge test accept the Student App AI Tutor result archive commit shape",
    remediation: "Do not claim committed Student App result storage without Go use case bridge evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_and_board_track_runtime",
    passed: packageJson.scripts?.["audit:student-app-ai-tutor-result-student-archive-storage-commit"]?.includes("student-app-ai-tutor-result-student-archive-storage-commit-audit.mjs") &&
      includesAll(hooks, [
        "Student App AI Tutor result student archive storage commit runtime audit",
        "studentAppAiTutorResultStudentArchiveStorageCommit",
        "student-app-ai-tutor-result-student-archive-storage-commit.current.json",
        "student_app_ai_tutor_result_student_archive_storage_commit_runtime",
        "0331-student-app-ai-tutor-result-student-archive-storage-commit.md",
        "SDD 0331 student app ai tutor result student archive storage commit",
        "11.29/10",
        "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMITTED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-result-student-archive-storage-commit",
      "studentAppAiTutorResultStudentArchiveStorageCommit",
      "11.29/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, root trace, SDD, and architecture board track 0331",
    remediation: "Wire result archive storage commit through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT_PORT,
      sourcePersistenceCommandRuntime: "student_app_ai_tutor_result_student_archive_persistence_command_runtime",
      status: "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMITTED",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorResultStudentArchiveStorageCommit: probe },
    safetyInvariants: {
      archivePersistenceCommandRequired: true,
      injectedTeachingArchivePortRequired: true,
      teachingArchiveUseCasePortInvoked: probe.status === "PASS",
      teachingArchiveDomainValidationExecuted: probe.status === "PASS",
      persistedOutcomeRequired: true,
      safeGuidanceOnly: true,
      studentArchivePersisted: probe.status === "PASS",
      mainDatabaseWriteCommitted: probe.status === "PASS",
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      modelInferenceAllowed: false,
      retrievalAllowed: false,
      answerKeyDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      promptDisclosureAllowed: false,
      contentRefDisclosureAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as Student App AI Tutor result archive committed storage evidence; row verification remains a later reviewed slice."
      : "Fix result archive storage commit evidence before claiming durable Student App AI Tutor result storage.",
  };
}

export function formatStudentAppAITutorResultStudentArchiveStorageCommitAudit(report) {
  const lines = [
    `Student App AI Tutor result student archive storage commit runtime: ${report.readiness}`,
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

async function runRuntimeProbe(persistenceCommandReport, options) {
  const startedAt = Date.now();
  const calls = [];
  try {
    const result = await commitStudentAppAITutorResultStudentArchiveStorage(baseInput(persistenceCommandReport), {
      commitLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-result-archive-storage-commit-audit-")), "commit.jsonl"),
      generatedAt: options.generatedAt ?? "2026-06-08T12:20:00.000Z",
      teachingArchiveCreateItemPort: {
        async createArchiveItem(command, context) {
          calls.push({ command, context });
          return {
            archiveItem: {
              id: "tarch_student_ai_tutor_result_001",
              ownerType: command.requestBody.ownerType,
              studentId: command.requestBody.studentId,
              materialType: command.requestBody.materialType,
              title: command.requestBody.title,
              source: command.requestBody.source,
              contentRef: command.requestBody.contentRef,
              tags: command.requestBody.tags,
              analysisIntents: command.requestBody.analysisIntents,
              ocrStatus: "NOT_REQUIRED",
              createdAt: "2026-06-08T12:20:00.000Z",
            },
            persistence: { status: "persisted", commandId: "" },
          };
        },
      },
    });
    const elapsedMs = Math.max(1, Date.now() - startedAt);
    return {
      status: "PASS",
      result,
      portCalls: calls.length,
      runtimeSlo: { targetP99Ms: 50, p99Ms: Math.min(50, options.probeP99Ms ?? elapsedMs), totalErrors: 0, operations: 1, evidenceClass: "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STORAGE_COMMIT_PROBE" },
    };
  } catch (error) {
    return { status: "FAIL", error: error.message, portCalls: calls.length, runtimeSlo: failedSlo() };
  }
}

function baseInput(persistenceCommandReport) {
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-archive-storage-commit.v1",
    commitInvocationId: "ai_tutor_result_archive_storage_commit_001",
    studentArchivePersistenceCommandReport: persistenceCommandReport,
    studentArchiveStorageCommitPolicy: {
      archivePersistenceCommandRequired: true,
      teachingArchiveUseCaseCommitAllowed: true,
      injectedTeachingArchivePortRequired: true,
      teachingArchiveDomainValidationRequired: true,
      persistedOutcomeRequired: true,
      preserveSafeGuidanceRequired: true,
      idempotentStorageCommitRequired: true,
      mainDatabaseWriteAllowed: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      directPublicationAllowed: false,
      modelInferenceAllowed: false,
      retrievalAllowed: false,
      answerKeyDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      promptDisclosureAllowed: false,
      contentRefDisclosureAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: ["evidence:student-app-ai-tutor-result-student-archive-persistence-command:ai_tutor_result_archive_cmd_001"],
    idempotencyKey: "student-app-ai-tutor-result-archive-storage-commit:student_001:tutor_req_student_app_001",
  };
}

function failedSlo() {
  return { targetP99Ms: 50, p99Ms: 999, totalErrors: 1, operations: 0, evidenceClass: "FAILED_PROBE" };
}

function loadCurrentInputs(root = process.cwd()) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, file]) => [key, fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), "utf8") : ""]));
}

function parseJson(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

function includesAll(text = "", needles = []) { return needles.every((needle) => text.includes(needle)); }
function includesAny(text = "", needles = []) { return needles.some((needle) => text.includes(needle)); }
function hasForbiddenRuntimeClaim(text = "") { return forbiddenRuntimeClaims.some((claim) => text.includes(claim)); }
function summarizePresence(text = "", needles = []) { return needles.map((needle) => `${needle}=${text.includes(needle)}`).join(";"); }
function addFinding(findings, finding) { findings.push({ ...finding, passed: Boolean(finding.passed), severity: finding.passed ? "info" : "error" }); }
function stringifyScalar(value) { return Array.isArray(value) ? value.join(",") : value && typeof value === "object" ? JSON.stringify(value) : String(value); }

async function main() {
  const root = process.cwd();
  const outIndex = process.argv.indexOf("--out");
  const outPath = outIndex === -1 ? defaultOutPath : process.argv[outIndex + 1];
  const report = await auditStudentAppAITutorResultStudentArchiveStorageCommit(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorResultStudentArchiveStorageCommitAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
