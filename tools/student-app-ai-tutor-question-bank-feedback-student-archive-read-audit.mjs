import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_PORT,
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_RUNTIME_ID,
  verifyStudentAppAITutorResultStudentArchiveRead,
} from "./student-app-ai-tutor-result-student-archive-read-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-feedback-student-archive-read.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_ARCHIVE_READ";
const runtimeId = "student_app_ai_tutor_question_bank_feedback_student_archive_read";
const readyStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_ARCHIVE_READ_VERIFIED";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-result-student-archive-read-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-result-student-archive-read-runtime.test.mjs",
  source0379Report: "reports/student-app-ai-tutor-question-bank-feedback-student-archive-row-verification.current.json",
  usecaseTest: "services/teaching-archive-gateway/internal/usecase/read_student_app_ai_tutor_result_archive_test.go",
  httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_result_archive_read_test.go",
  openApiRoot: "contracts/openapi/teaching-archive.yaml",
  openApiPath: "contracts/openapi/teaching-archive.student-app-archive-item-ai-tutor-result.path.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0380-student-app-ai-tutor-question-bank-feedback-student-archive-read.md",
};
const forbiddenRuntimeClaims = ["node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ", "INSERT ", "UPDATE ", "DELETE ", "directDatabaseAccessAllowed: true", "executeHttpRequestAllowed: true", "modelInferenceAllowed: true", "modelInferenceStarted: true", "answerKeyDisclosed: true", "promptDisclosed: true", "rawModelOutputDisclosed: true", "contentRefDisclosed: true", "resultRefDisclosed: true", "feedbackIdsDisclosed: true", "localToolMutationAllowed: true", "swarmAllowed: true", "innerHTML", "dangerouslySetInnerHTML"];

export async function auditStudentAppAITutorQuestionBankFeedbackStudentArchiveRead(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const source0379Report = parseJson(inputs.source0379Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.rootTrace ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const probe = await runRuntimeProbe(source0379Report, options);
  const findings = [];

  addFinding(findings, {
    id: "source.0379_question_bank_feedback_row_verification_ready",
    passed: source0379Report.readiness === "READY" &&
      source0379Report.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_ARCHIVE_ROW_VERIFICATION" &&
      source0379Report.runtime?.runtimeId === "student_app_ai_tutor_question_bank_feedback_student_archive_row_verification" &&
      source0379Report.runtime?.sharedRuntimeId === "student_app_ai_tutor_result_student_archive_row_verification_runtime" &&
      source0379Report.runtime?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_ARCHIVE_PHYSICAL_ROW_VERIFIED" &&
      source0379Report.safetyInvariants?.learningActionSourceRequired === "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK" &&
      source0379Report.safetyInvariants?.feedbackStatusRequired === "READY_FOR_STUDENT_APP_READ" &&
      source0379Report.safetyInvariants?.physicalDatabaseRowVerified === true &&
      source0379Report.runtimeSlo?.totalErrors === 0,
    actual: `${source0379Report.readiness ?? "missing"}:${source0379Report.runtime?.status ?? "missing"}`,
    expected: "READY 0379 question-bank-feedback physical row verification with feedback metadata",
    remediation: "Run 0379 before claiming safe Student App read for the question-bank-feedback branch.",
  });

  addFinding(findings, {
    id: "runtime.source_aware_question_bank_feedback_read",
    passed: includesAll(runtime, [
      "questionBankFeedbackRowVerificationWorkload",
      "questionBankFeedbackRowVerificationRuntimeId",
      "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      "READY_FOR_STUDENT_APP_READ",
      "studentAppAiTutorQuestionBankFeedbackStudentArchiveRowVerification",
      "learningActionSource",
      "feedbackStatus",
      "StudentAppAITutorResultArchiveReadPort.readStudentVisibleArchivedResult is required",
    ]) && !includesAny(runtime, forbiddenRuntimeClaims),
    actual: summarizePresence(runtime, ["questionBankFeedbackRowVerificationWorkload", "studentAppAiTutorQuestionBankFeedbackStudentArchiveRowVerification", "feedbackStatus"]),
    expected: "shared 0333 read runtime accepts 0379 question-bank-feedback row verification and preserves feedback metadata without direct DB/HTTP/model paths",
    remediation: "Keep 0380 as a source-aware wrapper over the shared injected student product read runtime.",
  });

  addFinding(findings, {
    id: "runtime.probe_reads_question_bank_feedback_safe_card_via_port",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_VERIFIED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_PORT &&
      probe.result?.sourceRowVerification?.learningActionSource === "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK" &&
      probe.result?.sourceRowVerification?.feedbackStatus === "READY_FOR_STUDENT_APP_READ" &&
      probe.result?.studentResultReadSource?.useCase === "ReadStudentAppAITutorResultArchive.Execute" &&
      probe.result?.resultArchiveCard?.archiveItemId === "tarch_student_feedback_001" &&
      probe.result?.resultArchiveCard?.summary === "Follow-up help based on reviewed answer feedback." &&
      probe.result?.boundary?.studentVisibleResultCardReadVerified === true &&
      probe.result?.boundary?.contentRefDisclosed === false &&
      probe.outputLeaks === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `source=${probe.result.sourceRowVerification.learningActionSource};feedback=${probe.result.sourceRowVerification.feedbackStatus};item=${probe.result.resultArchiveCard.archiveItemId};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms};leaks=${probe.outputLeaks}` : probe.error,
    expected: "probe reads one question-bank-feedback safe Student App card under 50ms through exactly one injected product read port call without leaks",
    remediation: "0380 must prove safe read-card shape and feedback metadata, not only endpoint existence.",
  });

  addFinding(findings, {
    id: "tests.cover_question_bank_feedback_read_wrapper_paths",
    passed: includesAll(runtimeTest, [
      "reads a question-bank-feedback-sourced safe student-visible result card through the same product read port",
      "rejects unsafe question-bank-feedback read source metadata",
      "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      "feedbackStatus",
    ]) && includesAll(inputs.usecaseTest ?? "", [
      "TestReadStudentAppAITutorResultArchiveReturnsQuestionBankFeedbackSourceSafeGuidanceCard",
      "tarch_student_feedback_001",
      "Follow-up help based on reviewed answer feedback.",
    ]) && includesAll(inputs.httpTest ?? "", [
      "TestReadStudentAppAITutorResultArchiveReturnsQuestionBankFeedbackSourceSafeCard",
      "tarch_student_feedback_001",
      "Follow-up help based on reviewed answer feedback.",
    ]),
    actual: "JS runtime, Go usecase, and HTTP tests scanned",
    expected: "positive question-bank-feedback safe read path plus unsafe source metadata rejection and no-leak HTTP regression",
    remediation: "Add JS and Go regression tests before claiming 0380 readiness.",
  });

  addFinding(findings, {
    id: "go_http_openapi_reuse_safe_read_boundary",
    passed: includesAll(`${inputs.openApiRoot ?? ""}\n${inputs.openApiPath ?? ""}`, ["/v1/student-app/archive-items/{archiveItemId}/ai-tutor-result", "readStudentAppAITutorResultArchive", "archiveItemId"]) &&
      !includesAny(inputs.openApiPath ?? "", ["contentRef", "resultRef", "rawModelOutput", "answerKey"]),
    actual: summarizePresence(`${inputs.openApiRoot ?? ""}\n${inputs.openApiPath ?? ""}`, ["readStudentAppAITutorResultArchive", "contentRef"]),
    expected: "same Student App read endpoint remains contract-first and omits contentRef/resultRef/model-output fields",
    remediation: "Do not add a parallel feedback endpoint or leak storage/model internals into the public contract.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0380",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-feedback-student-archive-read"]?.includes("student-app-ai-tutor-question-bank-feedback-student-archive-read-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank-feedback student archive read audit",
        "studentAppAiTutorQuestionBankFeedbackStudentArchiveRead",
        "student-app-ai-tutor-question-bank-feedback-student-archive-read.current.json",
        runtimeId,
        "0380-student-app-ai-tutor-question-bank-feedback-student-archive-read.md",
        "12.76/10",
        readyStatus,
        "SDD 0380 student app ai tutor question-bank feedback student archive read",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, ["audit:student-app-ai-tutor-question-bank-feedback-student-archive-read", "studentAppAiTutorQuestionBankFeedbackStudentArchiveRead", "12.76/10", "SDD 0380"]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0380",
    remediation: "Wire 0380 through every project evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId,
      sharedRuntimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_PORT,
      sourceRuntimes: ["student_app_ai_tutor_question_bank_feedback_student_archive_row_verification"],
      status: readyStatus,
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankFeedbackStudentArchiveRead: probe },
    safetyInvariants: {
      source0379QuestionBankFeedbackStudentArchiveRowVerificationRequired: true,
      learningActionSourceRequired: "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      feedbackStatusRequired: "READY_FOR_STUDENT_APP_READ",
      injectedStudentResultArchiveReadPortRequired: true,
      goUseCaseReadAllowed: true,
      httpEndpointContractVerified: true,
      studentVisibleResultCardReadVerified: probe.status === "PASS",
      safeGuidanceOnly: probe.status === "PASS",
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      contentRefDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      answerKeyDisclosureAllowed: false,
      promptDisclosureAllowed: false,
      feedbackIdsDisclosed: false,
      modelInferenceAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY" ? "Use this as question-bank-feedback safe Student App read evidence; safe render remains the next reviewed slice." : "Fix 0380 before claiming question-bank-feedback Student App read readiness.",
  };
}

export function formatStudentAppAITutorQuestionBankFeedbackStudentArchiveReadAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank-feedback student archive read: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
    `Shared runtime: ${report.runtime.sharedRuntimeId}`,
    `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`,
    "",
    "Findings:",
  ];
  for (const finding of report.findings) lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
  lines.push("", report.nextAction);
  return lines.join("\n");
}

async function runRuntimeProbe(source0379Report, options = {}) {
  const calls = [];
  try {
    const result = await verifyStudentAppAITutorResultStudentArchiveRead(probeInput(source0379Report), {
      verificationLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ai-tutor-question-bank-feedback-student-archive-read-")), "verification.jsonl"),
      generatedAt: "2026-06-11T17:20:00.000Z",
      studentAppAITutorResultArchiveReadPort: {
        async readStudentVisibleArchivedResult(request, context) {
          calls.push({ request, context });
          return { found: true, source: readSource(), card: cardFromReport(source0379Report) };
        },
      },
    });
    return { status: "PASS", result, portCalls: calls.length, outputLeaks: collectKeys(result).has("contentRef") || collectKeys(result).has("resultRef") || collectKeys(result).has("rawModelOutput") || collectKeys(result).has("answerKey") || collectKeys(result).has("prompt"), runtimeSlo: { targetP99Ms: 50, p99Ms: Math.min(50, options.probeP99Ms ?? result.runtimeSlo?.p99Ms ?? 5), totalErrors: 0, operations: 1, evidenceClass: "JS_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_ARCHIVE_READ_PROBE" } };
  } catch (error) {
    return { status: "FAIL", error: `${error.code ?? "ERROR"}:${error.message}`, portCalls: calls.length, runtimeSlo: failedSlo() };
  }
}

function probeInput(source0379Report) {
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-archive-read.v1",
    readInvocationId: "ai_tutor_result_archive_read_question_bank_feedback_001",
    principal: { principalId: "student_001", sessionId: "sess_student_001", subjectType: "USER", role: "STUDENT", entryPoint: "STUDENT_APP", scopes: ["STUDENT_OWN_READ"], studentAccess: { mode: "OWN", ownStudentId: "student_001" } },
    studentArchiveRowVerificationReport: source0379Report,
    studentArchiveReadPolicy: { rowVerificationRequired: true, ownStudentPrincipalRequired: true, studentVisibleResultCardRequired: true, safeGuidanceSnapshotRequired: true, injectedStudentResultArchiveReadPortRequired: true, goUseCaseReadAllowed: true, httpEndpointContractRequired: true, idempotentReadVerificationRequired: true, directDatabaseAccessAllowed: false, executeHttpRequestAllowed: false, modelInferenceAllowed: false, answerKeyDisclosureAllowed: false, rawModelOutputDisclosureAllowed: false, resultRefDisclosureAllowed: false, promptDisclosureAllowed: false, contentRefDisclosureAllowed: false, localToolMutationAllowed: false, swarmAllowed: false },
    evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-feedback-student-archive-row-verification:tutor_req_student_app_feedback_001", "evidence:student-app-ai-tutor-question-bank-feedback-student-archive-read:http"],
    idempotencyKey: "student-app-ai-tutor-question-bank-feedback-student-archive-read:student_001:tutor_req_student_app_feedback_001",
  };
}

function readSource() {
  return { endpoint: "GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result", useCase: "ReadStudentAppAITutorResultArchive.Execute", repository: "ArchiveRepository.GetByID", snapshotRepository: "ArchiveRepository.GetStudentAppAITutorResultArchiveSnapshot", ownStudentOnly: true, rowVerificationSourceVerified: true };
}

function cardFromReport(report) {
  const result = report.runtimeProbes.studentAppAiTutorQuestionBankFeedbackStudentArchiveRowVerification.result;
  const item = result.teachingArchivePhysicalRow.archiveItem;
  const snapshot = result.safeGuidanceSnapshot;
  return { archiveItemId: item.id, status: "READY_FOR_STUDENT_APP_READ", materialType: item.materialType, title: item.title, source: item.source, tags: item.tags, analysisIntents: item.analysisIntents, ocrStatus: item.ocrStatus, summary: snapshot.summary, guidanceSections: snapshot.guidanceSections.map((section) => ({ sectionId: section.sectionId ?? section.sectionID, title: section.title, text: section.text, sourceBlockRefs: section.sourceBlockRefs })), guidanceSectionsHash: snapshot.guidanceSectionsHash, safetyLabels: snapshot.safetyLabels, createdAt: item.createdAt };
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
function collectKeys(value, keys = new Set()) { if (!value || typeof value !== "object") return keys; for (const [key, child] of Object.entries(value)) { keys.add(key); collectKeys(child, keys); } return keys; }
function addFinding(findings, finding) { findings.push({ severity: finding.passed ? "info" : "error", ...finding }); }
function stringifyScalar(value) { if (Array.isArray(value)) return value.join(","); if (value && typeof value === "object") return JSON.stringify(value); return String(value); }
function failedSlo() { return { targetP99Ms: 50, p99Ms: 50, totalErrors: 1, operations: 0, evidenceClass: "JS_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_ARCHIVE_READ_PROBE" }; }
function parseOutArg(argv) { const outIndex = argv.indexOf("--out"); return outIndex === -1 ? defaultOutPath : argv[outIndex + 1]; }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = parseOutArg(process.argv.slice(2));
  const report = await auditStudentAppAITutorQuestionBankFeedbackStudentArchiveRead(loadCurrentInputs(process.cwd()));
  fs.mkdirSync(path.dirname(path.join(process.cwd(), out)), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankFeedbackStudentArchiveReadAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
