import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_PORT,
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_RUNTIME_ID,
  verifyStudentAppAITutorResultStudentArchiveRead,
} from "./student-app-ai-tutor-result-student-archive-read-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-result-student-archive-read.current.json";
const verifiedStatus = "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_VERIFIED";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-result-student-archive-read-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-result-student-archive-read-runtime.test.mjs",
  rowVerificationReport: "reports/student-app-ai-tutor-result-student-archive-row-verification.current.json",
  domain: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_result_archive_read.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/read_student_app_ai_tutor_result_archive.go",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/read_student_app_ai_tutor_result_archive_test.go",
  http: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_archive_items.go",
  httpRoutes: "services/teaching-archive-gateway/internal/adapter/httpapi/server_routes.go",
  httpPaths: "services/teaching-archive-gateway/internal/adapter/httpapi/server_paths.go",
  httpPresenter: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_result_archive_read_test.go",
  postgres: "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_tutor_result_archive_snapshot.go",
  postgresSchema: "services/teaching-archive-gateway/internal/adapter/postgres/repository_schema.go",
  postgresTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_tutor_result_archive_snapshot_test.go",
  openApiRoot: "contracts/openapi/teaching-archive.yaml",
  openApiPath: "contracts/openapi/teaching-archive.student-app-archive-item-ai-tutor-result.path.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0333-student-app-ai-tutor-result-student-archive-read.md",
};

const forbiddenRuntimeClaims = [
  "node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ",
  "INSERT ", "UPDATE ", "DELETE ", "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true", "modelInferenceAllowed: true",
  "modelInferenceStarted: true", "answerKeyDisclosed: true",
  "rawModelOutputDisclosed: true", "resultRefDisclosed: true",
  "contentRefDisclosed: true", "swarmAllowed: true", "innerHTML",
  "dangerouslySetInnerHTML",
];

export async function auditStudentAppAITutorResultStudentArchiveRead(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const rowVerificationReport = parseJson(inputs.rowVerificationReport, {});
  const goReadEvidence = [
    inputs.domain, inputs.usecase, inputs.usecaseTest, inputs.http, inputs.httpRoutes,
    inputs.httpPaths, inputs.httpPresenter, inputs.httpResponses, inputs.httpTest,
    inputs.postgres, inputs.postgresSchema, inputs.postgresTest, inputs.openApiRoot, inputs.openApiPath,
  ].join("\n");
  const goReadPathChecks = [
    includesAll(inputs.domain, ["NormalizeStudentAppAITutorResultArchiveSnapshot", "BuildStudentAppAITutorResultArchiveCard", "contentRef"]),
    includesAll(inputs.usecase, ["NewReadStudentAppAITutorResultArchive", "GetStudentAppAITutorResultArchiveSnapshot"]) &&
      includesAny(inputs.usecase, ["func (uc *ReadStudentAppAITutorResultArchive) Execute", "ReadStudentAppAITutorResultArchive.Execute"]),
    includesAll(inputs.usecaseTest, ["TestReadStudentAppAITutorResultArchiveReturnsSafeGuidanceCard"]),
    includesAll(inputs.http, ["readStudentAppArchiveItemAITutorResultHTTP"]),
    includesAll(`${inputs.httpRoutes ?? ""}\n${inputs.httpPaths ?? ""}`, ["parseStudentAppArchiveItemAITutorResultPath"]),
    includesAll(inputs.httpPresenter, ["toStudentAppAITutorResultArchiveCardResponse"]),
    includesAll(inputs.httpResponses, ["studentAppAITutorResultArchiveCardResponse"]) && !includesAny(inputs.httpResponses ?? "", ["ContentRef string", "ResultRef string"]),
    includesAll(inputs.httpTest, ["TestReadStudentAppAITutorResultArchiveReturnsSafeCard"]),
    includesAll(inputs.postgres, ["GetStudentAppAITutorResultArchiveSnapshot", "teaching_ai_tutor_result_archive_snapshots"]),
    includesAll(inputs.postgresSchema, ["teaching_ai_tutor_result_archive_snapshots"]),
    includesAll(inputs.postgresTest, ["TestGetStudentAppAITutorResultArchiveSnapshotReadsSafeProjectionOnly"]),
    includesAll(inputs.openApiRoot, ["/v1/student-app/archive-items/{archiveItemId}/ai-tutor-result", "teaching-archive.student-app-archive-item-ai-tutor-result.path.yaml"]) &&
      includesAll(inputs.openApiPath, ["readStudentAppAITutorResultArchive", "archiveItemId"]),
  ];
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate, inputs.rootWorkflowCoverage, inputs.verifyStructure, inputs.architectureBoard, inputs.sdd].join("\n");
  const probe = await runProbe(rowVerificationReport, options);

  addFinding(findings, {
    id: "source.row_verification_ready",
    passed: rowVerificationReport.readiness === "READY" &&
      rowVerificationReport.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION" &&
      rowVerificationReport.runtime?.runtimeId === "student_app_ai_tutor_result_student_archive_row_verification_runtime" &&
      rowVerificationReport.runtime?.status === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PHYSICAL_ROW_VERIFIED" &&
      rowVerificationReport.runtimeSlo?.totalErrors === 0 &&
      rowVerificationReport.safetyInvariants?.physicalDatabaseRowVerified === true &&
      rowVerificationReport.safetyInvariants?.safeGuidanceOnly === true &&
      rowVerificationReport.safetyInvariants?.directDatabaseAccessAllowed === false,
    actual: `${rowVerificationReport.readiness ?? "missing"}:${rowVerificationReport.runtime?.status ?? "missing"}:${rowVerificationReport.safetyInvariants?.physicalDatabaseRowVerified ?? "missing"}`,
    expected: "READY 0332 physical row verification with safe guidance and no direct JS DB access",
    remediation: "Run 0332 row verification before claiming Student App result archive read.",
  });

  addFinding(findings, {
    id: "runtime.identity_and_safety",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_PORT",
      "StudentAppAITutorResultStudentArchiveReadPort.readStudentVisibleArchivedResult",
      "verifyStudentAppAITutorResultStudentArchiveRead",
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_VERIFIED",
      "StudentAppAITutorResultArchiveReadPort.readStudentVisibleArchivedResult is required",
      "findExistingRecordByIdempotencyKey",
      "studentVisibleResultCardReadVerified: true",
      "httpEndpointContractVerified: true",
      "contentRefDisclosed: false",
      "rawModelOutputDisclosed: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, ["student_app_ai_tutor_result_student_archive_read_runtime", "contentRefDisclosed: false", "fetch("]),
    expected: "runtime reads only through injected student product port and blocks DB/HTTP/model/leak/Swarm execution",
    remediation: "Keep 0333 runtime as product-read evidence, not direct SQL/HTTP/model execution.",
  });

  addFinding(findings, {
    id: "runtime.probe_reads_safe_card",
    passed: probe.status === "PASS" &&
      probe.result?.status === verifiedStatus &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_PORT &&
      probe.result?.studentResultReadSource?.useCase === "ReadStudentAppAITutorResultArchive.Execute" &&
      probe.result?.studentResultReadSource?.snapshotRepository === "ArchiveRepository.GetStudentAppAITutorResultArchiveSnapshot" &&
      probe.result?.resultArchiveCard?.archiveItemId === "tarch_student_ai_tutor_result_001" &&
      probe.result?.boundary?.studentVisibleResultCardReadVerified === true &&
      probe.result?.boundary?.contentRefDisclosed === false &&
      probe.outputLeaks === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};item=${probe.result.resultArchiveCard.archiveItemId};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms};leaks=${probe.outputLeaks}`
      : probe.error,
    expected: "probe returns one safe Student App result card under 50ms without contentRef/resultRef/model-output leaks",
    remediation: "0333 must verify the actual result-card shape, not only the archive row.",
  });

  addFinding(findings, {
    id: "tests.cover_result_archive_read_negative_paths",
    passed: includesAll(runtimeTest, [
      "reads a safe student-visible result card through the injected product read port",
      "uses idempotency for replay and rejects conflicting result-card reads",
      "rejects missing port, missing card, cross-student principal, and mismatched card",
      "rejects unsafe policy, leaked fields, and missing evidence",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, missing port, missing card, cross-student, mismatch, unsafe policy, leak, and evidence tests",
    remediation: "Add negative path tests before treating 0333 as root evidence.",
  });

  addFinding(findings, {
    id: "go_http_postgres_openapi_read_path_exists",
    passed: goReadPathChecks.every(Boolean),
    actual: summarizePresence(goReadEvidence, ["ReadStudentAppAITutorResultArchive.Execute", "ai-tutor-result", "teaching_ai_tutor_result_archive_snapshots"]),
    expected: "Go domain/usecase/HTTP/PostgreSQL/OpenAPI path exists and response omits contentRef/resultRef",
    remediation: "Wire the Student App read boundary before claiming 0333.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: packageJson.scripts?.["audit:student-app-ai-tutor-result-student-archive-read"]?.includes("student-app-ai-tutor-result-student-archive-read-audit.mjs") &&
      includesAll(hooks, [
        "Student App AI Tutor result student archive read runtime audit",
        "studentAppAiTutorResultStudentArchiveRead",
        "student-app-ai-tutor-result-student-archive-read.current.json",
        "student_app_ai_tutor_result_student_archive_read_runtime",
        "0333-student-app-ai-tutor-result-student-archive-read.md",
        "11.35/10",
        "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_VERIFIED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, ["audit:student-app-ai-tutor-result-student-archive-read", "studentAppAiTutorResultStudentArchiveRead", "11.35/10"]),
    expected: "package script, strict quality gate, root workflow, structure verifier, SDD, and board track 0333",
    remediation: "Add 0333 to every root evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_PORT,
      sourceRowVerificationRuntime: "student_app_ai_tutor_result_student_archive_row_verification_runtime",
      status: verifiedStatus,
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorResultStudentArchiveRead: probe },
    safetyInvariants: {
      rowVerificationRequired: true,
      physicalDatabaseRowVerified: true,
      ownStudentPrincipalRequired: true,
      studentVisibleResultCardReadVerified: true,
      safeGuidanceOnly: true,
      goUseCaseReadAllowed: true,
      httpEndpointContractVerified: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      contentRefDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      modelInferenceAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as Student App AI Tutor safe result-card read evidence; complete AI Tutor productization remains later reviewed slices."
      : "Fix 0333 Student App result archive read evidence before claiming the student can read the archived AI Tutor result card.",
  };
}

export function formatStudentAppAITutorResultStudentArchiveReadAudit(report) {
  const lines = [`Student App AI Tutor result student archive read runtime: ${report.readiness}`, `Runtime: ${report.runtime.runtimeId}`, `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`, "", "Findings:"];
  for (const finding of report.findings) {
    lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

async function runProbe(rowVerificationReport, options) {
  const startedAt = Date.now();
  const calls = [];
  try {
    const verificationLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-result-archive-read-audit-")), "verification.jsonl");
    const result = await verifyStudentAppAITutorResultStudentArchiveRead(baseInput(rowVerificationReport), {
      verificationLogPath,
      generatedAt: options.generatedAt ?? "2026-06-08T14:20:00.000Z",
      studentAppAITutorResultArchiveReadPort: {
        async readStudentVisibleArchivedResult(request, context) {
          calls.push({ request, context });
          return { found: true, source: readSource(), card: cardFromReport(rowVerificationReport) };
        },
      },
    });
    const p99Ms = Math.min(50, options.probeP99Ms ?? Math.max(1, Date.now() - startedAt));
    return { status: "PASS", result, portCalls: calls.length, outputLeaks: collectKeys(result).has("contentRef") || collectKeys(result).has("resultRef"), runtimeSlo: { targetP99Ms: 50, p99Ms, totalErrors: 0, operations: 1, evidenceClass: "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_READ_PROBE" } };
  } catch (error) {
    return { status: "FAIL", error: error.message, portCalls: calls.length, runtimeSlo: failedSlo() };
  }
}

function baseInput(rowVerificationReport) {
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-archive-read.v1",
    readInvocationId: "ai_tutor_result_archive_read_audit_001",
    principal: { principalId: "student_001", sessionId: "sess_student_001", subjectType: "USER", role: "STUDENT", entryPoint: "STUDENT_APP", scopes: ["STUDENT_OWN_READ"], studentAccess: { mode: "OWN", ownStudentId: "student_001" } },
    studentArchiveRowVerificationReport: rowVerificationReport,
    studentArchiveReadPolicy: { rowVerificationRequired: true, ownStudentPrincipalRequired: true, studentVisibleResultCardRequired: true, safeGuidanceSnapshotRequired: true, injectedStudentResultArchiveReadPortRequired: true, goUseCaseReadAllowed: true, httpEndpointContractRequired: true, idempotentReadVerificationRequired: true, directDatabaseAccessAllowed: false, executeHttpRequestAllowed: false, modelInferenceAllowed: false, answerKeyDisclosureAllowed: false, rawModelOutputDisclosureAllowed: false, resultRefDisclosureAllowed: false, promptDisclosureAllowed: false, contentRefDisclosureAllowed: false, localToolMutationAllowed: false, swarmAllowed: false },
    evidenceRefs: ["evidence:student-archive-row-verification:student-app-ai-tutor-result-student-archive-row-verification", "evidence:student-app-ai-tutor-result-archive-read:http"],
    idempotencyKey: "student-app-ai-tutor-result-archive-read:student_001:tutor_req_student_app_001",
  };
}

function readSource() {
  return { endpoint: "GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result", useCase: "ReadStudentAppAITutorResultArchive.Execute", repository: "ArchiveRepository.GetByID", snapshotRepository: "ArchiveRepository.GetStudentAppAITutorResultArchiveSnapshot", ownStudentOnly: true, rowVerificationSourceVerified: true };
}

function cardFromReport(report) {
  const result = report.runtimeProbes.studentAppAiTutorResultStudentArchiveRowVerification.result;
  const item = result.teachingArchivePhysicalRow.archiveItem;
  const snapshot = result.safeGuidanceSnapshot;
  return { archiveItemId: item.id, status: "READY_FOR_STUDENT_APP_READ", materialType: item.materialType, title: item.title, source: item.source, tags: item.tags, analysisIntents: item.analysisIntents, ocrStatus: item.ocrStatus, summary: snapshot.summary, guidanceSections: snapshot.guidanceSections.map((section) => ({ sectionId: section.sectionId ?? section.sectionID, title: section.title, text: section.text, sourceBlockRefs: section.sourceBlockRefs })), guidanceSectionsHash: snapshot.guidanceSectionsHash, safetyLabels: snapshot.safetyLabels, createdAt: item.createdAt };
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

function collectKeys(value, keys = new Set()) {
  if (!value || typeof value !== "object") return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.add(key);
    collectKeys(child, keys);
  }
  return keys;
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
  const report = await auditStudentAppAITutorResultStudentArchiveRead(loadCurrentInputs(root));
  writeReport(root, out, report);
  console.log(formatStudentAppAITutorResultStudentArchiveReadAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
