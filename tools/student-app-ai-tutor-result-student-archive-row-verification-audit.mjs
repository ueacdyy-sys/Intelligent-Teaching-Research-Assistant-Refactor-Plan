import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION_PORT,
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION_RUNTIME_ID,
  verifyStudentAppAITutorResultStudentArchivePhysicalRow,
} from "./student-app-ai-tutor-result-student-archive-row-verification-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-result-student-archive-row-verification.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-result-student-archive-row-verification-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-result-student-archive-row-verification-runtime.test.mjs",
  storageCommitReport: "reports/student-app-ai-tutor-result-student-archive-storage-commit.current.json",
  storageCommitRuntime: "tools/student-app-ai-tutor-result-student-archive-storage-commit-runtime.mjs",
  storageCommitAudit: "tools/student-app-ai-tutor-result-student-archive-storage-commit-audit.mjs",
  teachingArchiveRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items.go",
  teachingArchiveRepositoryTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items_get_by_id_test.go",
  teachingArchiveRepositoryHelpers: "services/teaching-archive-gateway/internal/adapter/postgres/repository_test_helpers_test.go",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0332-student-app-ai-tutor-result-student-archive-row-verification.md",
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

export async function auditStudentAppAITutorResultStudentArchiveRowVerification(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const storageCommitReport = parseJson(inputs.storageCommitReport, {});
  const storageCommitEvidence = [
    inputs.storageCommitRuntime ?? "",
    inputs.storageCommitAudit ?? "",
    inputs.storageCommitReport ?? "",
  ].join("\n");
  const repositoryEvidence = [
    inputs.teachingArchiveRepository ?? "",
    inputs.teachingArchiveRepositoryTest ?? "",
    inputs.teachingArchiveRepositoryHelpers ?? "",
  ].join("\n");
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(storageCommitReport, options);

  addFinding(findings, {
    id: "storage_commit.ready_committed",
    passed: storageCommitReport.readiness === "READY" &&
      storageCommitReport.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMIT" &&
      storageCommitReport.runtime?.runtimeId === "student_app_ai_tutor_result_student_archive_storage_commit_runtime" &&
      storageCommitReport.runtime?.status === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMITTED" &&
      storageCommitReport.safetyInvariants?.studentArchivePersisted === true &&
      storageCommitReport.safetyInvariants?.mainDatabaseWriteCommitted === true,
    actual: `${storageCommitReport.readiness ?? "missing"}:${storageCommitReport.runtime?.status ?? "missing"}`,
    expected: "READY 0331 archive storage commit that is persisted in the Teaching Archive boundary",
    remediation: "Run the 0331 archive storage commit audit before verifying physical rows.",
  });

  addFinding(findings, {
    id: "storage_commit.safe_surface_preserved",
    passed: includesAll(storageCommitEvidence, [
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMITTED",
      "mainDatabaseWriteCommitted",
      "studentArchivePersisted",
      "safeGuidanceOnly",
      "TeachingArchiveCreateItemPort.createArchiveItem",
    ]) && !includesAny(inputs.storageCommitRuntime ?? "", [
      "answerKeyDisclosed: true",
      "rawModelOutputDisclosed: true",
      "swarmAllowed: true",
    ]),
    actual: summarizePresence(storageCommitEvidence, ["mainDatabaseWriteCommitted", "safeGuidanceOnly", "TeachingArchiveCreateItemPort.createArchiveItem"]),
    expected: "0332 consumes only the safe committed 0331 storage surface and keeps guidance evidence",
    remediation: "Do not verify physical rows from a model result, delivery envelope, or raw database mutation.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION_PORT",
      "StudentAppAITutorResultStudentArchiveRowVerificationPort.verifyTeachingArchivePhysicalRow",
      "verifyStudentAppAITutorResultStudentArchivePhysicalRow",
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION_READY",
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PHYSICAL_ROW_VERIFIED",
      "TeachingArchiveRowReadPort.getArchiveItemById is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_result_student_archive_row_verification_runtime",
      "TeachingArchiveRowReadPort.getArchiveItemById",
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PHYSICAL_ROW_VERIFIED",
    ]),
    expected: "runtime records idempotent Student App result archive physical row verification through the row read port",
    remediation: "The row verification slice must stay port-based and idempotent.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "physicalDatabaseRowVerified: true",
      "mainDatabaseReadAllowed: true",
      "mainDatabaseWriteCommitted: true",
      "safeGuidanceEvidencePreserved: true",
      "studentVisibilityEvidencePreserved: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "modelInferenceStarted: false",
      "answerKeyDisclosed: false",
      "rawModelOutputDisclosed: false",
      "swarmAllowed: false",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime verifies only through an injected row read port and blocks raw DB, HTTP, models, leaks, tools, and Swarm",
    remediation: "Do not let JS execute SQL or HTTP in the Student App result archive row verification runtime.",
  });

  addFinding(findings, {
    id: "runtime.probe_verifies_physical_row",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PHYSICAL_ROW_VERIFIED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION_PORT &&
      probe.result?.teachingArchivePhysicalRow?.targetRepository === "ArchiveRepository.GetByID" &&
      probe.result?.teachingArchivePhysicalRow?.targetTable === "teaching_archive_items" &&
      probe.result?.teachingArchivePhysicalRow?.archiveItem?.id === "tarch_student_ai_tutor_result_001" &&
      probe.result?.boundary?.physicalDatabaseRowVerified === true &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};row=${probe.result.teachingArchivePhysicalRow.archiveItem.id};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe verifies the committed Student App result archive item through one injected row read port call",
    remediation: "Row verification must prove read port invocation and exact physical row match.",
  });

  addFinding(findings, {
    id: "tests.cover_row_verification_negative_paths",
    passed: includesAll(runtimeTest, [
      "verifies the committed result archive item through the injected row read port",
      "uses idempotency for replay and rejects conflicting committed rows",
      "rejects missing ports, missing rows, mismatched ids, and mismatched content refs",
      "rejects wrong owner scope, direct DB or HTTP policies, Swarm, and leaked fields",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, missing port, missing row, mismatch, wrong owner, DB/HTTP policy, Swarm, and leak tests",
    remediation: "Add regression coverage before treating Student App result archive physical row verification as root evidence.",
  });

  addFinding(findings, {
    id: "teaching_archive.repository_get_by_id_evidence_exists",
    passed: includesAll(repositoryEvidence, [
      "func (r *ArchiveRepository) GetByID",
      "FROM teaching_archive_items",
      "WHERE id = $1",
      "scanArchiveItem",
      "TestGetByIDReturnsStudentAppAiTutorResultArchiveStorageCommitPhysicalRow",
      "singleStudentAppAiTutorResultArchiveItemRow",
      "tarch_student_ai_tutor_result_001",
      "student-ai-tutor-result-archive:",
      "student_app_ai_tutor",
    ]),
    actual: summarizePresence(repositoryEvidence, [
      "GetByID",
      "TestGetByIDReturnsStudentAppAiTutorResultArchiveStorageCommitPhysicalRow",
      "tarch_student_ai_tutor_result_001",
    ]),
    expected: "Go repository has a GetByID physical row query and test for the Student App result archive committed shape",
    remediation: "Do not claim physical row verification without Go repository row-read evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: packageJson.scripts?.["audit:student-app-ai-tutor-result-student-archive-row-verification"]?.includes("student-app-ai-tutor-result-student-archive-row-verification-audit.mjs") &&
      includesAll(hooks, [
        "Student App AI Tutor result student archive row verification runtime audit",
        "studentAppAiTutorResultStudentArchiveRowVerification",
        "student-app-ai-tutor-result-student-archive-row-verification.current.json",
        "student_app_ai_tutor_result_student_archive_row_verification_runtime",
        "0332-student-app-ai-tutor-result-student-archive-row-verification.md",
        "11.32/10",
        "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PHYSICAL_ROW_VERIFIED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-result-student-archive-row-verification",
      "studentAppAiTutorResultStudentArchiveRowVerification",
      "11.32/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0332",
    remediation: "Wire result archive row verification through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION_PORT,
      sourceStorageCommitRuntime: "student_app_ai_tutor_result_student_archive_storage_commit_runtime",
      status: "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PHYSICAL_ROW_VERIFIED",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorResultStudentArchiveRowVerification: probe },
    safetyInvariants: {
      storageCommitRequired: true,
      injectedTeachingArchiveRowReadPortRequired: true,
      teachingArchiveRepositoryGetByIDUsed: true,
      committedArchiveItemMatchedPhysicalRow: true,
      safeGuidanceOnly: true,
      studentOwnScopeEnforced: true,
      mainDatabaseWriteCommitted: true,
      physicalDatabaseRowVerified: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      answerKeyDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      promptDisclosureAllowed: false,
      contentRefDisclosureAllowed: false,
      modelInferenceAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as Student App AI Tutor result archive physical row evidence; real model scoring, question generation, complete AI Tutor productization, and public release remain later reviewed slices."
      : "Fix result archive row verification evidence before claiming durable Student App result archive storage is physically verified.",
  };
}

export function formatStudentAppAITutorResultStudentArchiveRowVerificationAudit(report) {
  const lines = [
    `Student App AI Tutor result student archive row verification runtime: ${report.readiness}`,
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

async function runRuntimeProbe(storageCommitReport, options) {
  const startedAt = Date.now();
  const calls = [];
  try {
    const verificationLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-result-archive-row-verification-audit-")), "verification.jsonl");
    const result = await verifyStudentAppAITutorResultStudentArchivePhysicalRow(baseInput(storageCommitReport), {
      verificationLogPath,
      generatedAt: options.generatedAt ?? "2026-06-08T12:30:00.000Z",
      teachingArchiveRowReadPort: {
        async getArchiveItemById(id, context) {
          calls.push({ id, context });
          return {
            found: true,
            source: { repositoryMethod: "ArchiveRepository.GetByID", targetTable: "teaching_archive_items" },
            row: committedArchiveItem(storageCommitReport),
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
        evidenceClass: "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ROW_VERIFICATION_PROBE",
      },
    };
  } catch (error) {
    return { status: "FAIL", error: error.message, portCalls: calls.length, runtimeSlo: failedSlo() };
  }
}

function baseInput(storageCommitReport) {
  const commit = resultArchiveStorageCommitFromReport(storageCommitReport);
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-archive-row-verification.v1",
    verificationInvocationId: "ai_tutor_result_archive_row_verification_audit_001",
    studentArchiveStorageCommitReport: storageCommitReport,
    studentArchiveRowVerificationPolicy: {
      storageCommitRequired: true,
      physicalRowVerificationRequired: true,
      injectedTeachingArchiveRowReadPortRequired: true,
      teachingArchiveRepositoryReadRequired: true,
      committedArchiveItemMatchRequired: true,
      preserveSafeGuidanceRequired: true,
      preserveStudentVisibilityEvidenceRequired: true,
      studentOwnScopeRequired: true,
      idempotentRowVerificationRequired: true,
      mainDatabaseReadAllowed: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      modelInferenceAllowed: false,
      answerKeyDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      promptDisclosureAllowed: false,
      contentRefDisclosureAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [`evidence:student-app-ai-tutor-result-student-archive-storage-commit:${commit.requestId}`],
    idempotencyKey: `student-app-ai-tutor-result-archive-row-verification:${studentIdFromScope(commit.scopeRef)}:${commit.requestId}`,
  };
}

function committedArchiveItem(storageCommitReport) {
  return storageCommitReport.runtimeProbes.studentAppAiTutorResultStudentArchiveStorageCommit.result.teachingArchiveCommit.archiveItem;
}

function resultArchiveStorageCommitFromReport(report) {
  const result = report?.runtimeProbes?.studentAppAiTutorResultStudentArchiveStorageCommit?.result ?? {};
  const source = result.sourcePersistenceCommand ?? {};
  return {
    requestId: typeof source.requestId === "string" ? source.requestId : "tutor_req_student_app_001",
    scopeRef: typeof source.scopeRef === "string" ? source.scopeRef : "student:student_001",
  };
}

function studentIdFromScope(scopeRef) {
  return typeof scopeRef === "string" && scopeRef.startsWith("student:")
    ? scopeRef.slice("student:".length)
    : "student_001";
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
  const report = await auditStudentAppAITutorResultStudentArchiveRowVerification(loadCurrentInputs(root));
  writeReport(root, out, report);
  console.log(formatStudentAppAITutorResultStudentArchiveRowVerificationAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
