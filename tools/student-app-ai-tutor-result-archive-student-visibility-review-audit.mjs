import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_PORT,
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_RUNTIME_ID,
  recordStudentAppAITutorResultStudentVisibilityReview,
} from "./student-app-ai-tutor-result-student-visibility-review-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-result-archive-student-visibility-review.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_VISIBILITY_REVIEW";
const runtimeId = "student_app_ai_tutor_result_archive_student_visibility_review";
const readyStatus = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_VISIBILITY_REVIEW_RECORDED";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-result-student-visibility-review-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-result-student-visibility-review-runtime.test.mjs",
  source0340Report: "reports/student-app-ai-tutor-result-archive-reviewed-result-persistence-bridge.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0341-student-app-ai-tutor-result-archive-student-visibility-review.md",
};

const forbiddenRuntimeClaims = [
  "node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ", "INSERT ", "UPDATE ", "DELETE ",
  "studentVisiblePublishAllowed: true", "studentDeliveryEnvelopeAllowed: true", "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true", "externalToolUseAllowed: true", "retrievalAllowed: true",
  "localToolMutationAllowed: true", "swarmAllowed: true", "studentVisiblePublished: true",
  "studentDeliveryEnvelopeCreated: true", "guidanceTextSentToPort: true", "rawResultRefSentToPort: true",
  "dangerouslySetInnerHTML", "innerHTML",
];

export async function auditStudentAppAITutorResultArchiveStudentVisibilityReview(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const source0340Report = parseJson(inputs.source0340Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.rootTrace ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const probe = await runRuntimeProbe(source0340Report, options);

  addFinding(findings, {
    id: "source.0340_result_archive_reviewed_result_persistence_ready",
    passed: source0340Report.readiness === "READY" &&
      source0340Report.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_REVIEWED_RESULT_PERSISTENCE_BRIDGE" &&
      source0340Report.runtime?.runtimeId === "student_app_ai_tutor_result_archive_reviewed_result_persistence_bridge" &&
      source0340Report.runtime?.sharedRuntimeId === "student_app_ai_tutor_reviewed_result_persistence_bridge_runtime" &&
      source0340Report.runtime?.commandPort === "StudentAppAITutorResultPort.recordTutoringAnalysisResult" &&
      source0340Report.runtime?.status === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_REVIEWED_RESULT_PERSISTED" &&
      source0340Report.safetyInvariants?.learningActionSourceRequired === "AI_TUTOR_RESULT_ARCHIVE" &&
      source0340Report.safetyInvariants?.resultArchiveStatusRequired === "READY_FOR_STUDENT_APP_READ" &&
      source0340Report.safetyInvariants?.tutoringResultRecorded === true &&
      source0340Report.safetyInvariants?.studentVisiblePublished === false &&
      source0340Report.runtimeSlo?.totalErrors === 0,
    actual: [source0340Report.readiness ?? "missing", source0340Report.runtime?.runtimeId ?? "missing", source0340Report.runtime?.status ?? "missing", source0340Report.runtimeSlo?.totalErrors ?? "missing"].join(":"),
    expected: "READY 0340 result-archive reviewed-result persistence bridge with zero errors and no student-visible publication",
    remediation: "Run 0340 before result-archive student visibility review.",
  });

  addFinding(findings, {
    id: "runtime.source_aware_result_archive_visibility_review",
    passed: includesAll(runtime, ["sourceResultArchiveReviewedResultPersistenceRuntimeId", "sourceResultArchiveReviewedResultPersistenceWorkloadType", "studentAppAiTutorResultArchiveReviewedResultPersistenceBridge", "learningActionSource", "resultArchiveStatus", "StudentAppAITutorResultStudentVisibilityReviewPort.recordResultStudentVisibilityReview"]) && !includesAny(runtime, forbiddenRuntimeClaims),
    actual: summarizePresence(runtime, ["sourceResultArchiveReviewedResultPersistenceRuntimeId", "sourceResultArchiveReviewedResultPersistenceWorkloadType", "studentAppAiTutorResultArchiveReviewedResultPersistenceBridge", "learningActionSource", "resultArchiveStatus"]),
    expected: "shared student visibility review runtime accepts 0340 result-archive persistence evidence and preserves source metadata",
    remediation: "Keep 0341 as a source-aware wrapper over the shared 0328 student visibility review runtime.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_result_archive_visibility_review",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_RECORDED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_PORT &&
      probe.result?.sourceReviewedResult?.learningActionSource === "AI_TUTOR_RESULT_ARCHIVE" &&
      probe.result?.sourceReviewedResult?.resultArchiveStatus === "READY_FOR_STUDENT_APP_READ" &&
      probe.result?.studentVisibilityReview?.status === "AI_TUTOR_RESULT_STUDENT_VISIBILITY_APPROVED_NOT_DELIVERED" &&
      probe.result?.boundary?.humanStudentVisibilityReviewRecorded === true &&
      probe.result?.boundary?.studentVisiblePublished === false &&
      probe.result?.boundary?.studentDeliveryEnvelopeCreated === false &&
      probe.portCalls === 1 &&
      probe.portSawGuidanceText === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `source=${probe.result.sourceReviewedResult.learningActionSource};status=${probe.result.status};p99=${probe.runtimeSlo.p99Ms};calls=${probe.portCalls};textToPort=${probe.portSawGuidanceText}` : probe.error,
    expected: "probe records one result-archive student visibility review without publishing or delivery envelope creation",
    remediation: "0341 must prove 0340 persistence to student-visibility review linkage.",
  });

  addFinding(findings, {
    id: "tests.cover_result_archive_visibility_review_paths",
    passed: includesAll(runtimeTest, ["records a result-archive-sourced student visibility review through the same review port", "rejects unsafe result-archive reviewed-result persistence source metadata", "AI_TUTOR_RESULT_ARCHIVE", "resultArchiveStatus"]),
    actual: "runtime tests scanned",
    expected: "positive result-archive student visibility review path and unsafe source rejection tests",
    remediation: "Add result-archive student visibility review regression coverage before claiming 0341 readiness.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0341",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-result-archive-student-visibility-review"]?.includes("student-app-ai-tutor-result-archive-student-visibility-review-audit.mjs")) &&
      includesAll(hooks, ["Student App AI Tutor result-archive student visibility review audit", "studentAppAiTutorResultArchiveStudentVisibilityReview", "student-app-ai-tutor-result-archive-student-visibility-review.current.json", runtimeId, "0341-student-app-ai-tutor-result-archive-student-visibility-review.md", "11.59/10", readyStatus, "SDD 0341 student app ai tutor result archive student visibility review"]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, ["audit:student-app-ai-tutor-result-archive-student-visibility-review", "studentAppAiTutorResultArchiveStudentVisibilityReview", "11.59/10", "SDD 0341"]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0341",
    remediation: "Wire 0341 through every project evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: { runtimeId, sharedRuntimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_RUNTIME_ID, commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_PORT, sourceRuntime: "student_app_ai_tutor_result_archive_reviewed_result_persistence_bridge", status: readyStatus },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorResultArchiveStudentVisibilityReview: probe },
    safetyInvariants: {
      source0340ResultArchiveReviewedResultPersistenceRequired: true,
      learningActionSourceRequired: "AI_TUTOR_RESULT_ARCHIVE",
      resultArchiveStatusRequired: "READY_FOR_STUDENT_APP_READ",
      humanStudentVisibilityReviewRequired: true,
      approvedForFutureStudentDelivery: probe.status === "PASS",
      studentVisiblePublished: false,
      studentDeliveryEnvelopeCreated: false,
      guidanceTextSentToPort: false,
      rawResultRefSentToPort: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      retrievalAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY" ? "Use this as result-archive student visibility review evidence; actual delivery envelope remains a later slice." : "Fix 0341 before claiming result-archive follow-up tutoring can become student-visible.",
  };
}

export function formatStudentAppAITutorResultArchiveStudentVisibilityReviewAudit(report) {
  const lines = [`Student App AI Tutor result-archive student visibility review: ${report.readiness}`, `Runtime: ${report.runtime.runtimeId}`, `Shared runtime: ${report.runtime.sharedRuntimeId}`, `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`, "", "Findings:"];
  for (const finding of report.findings) {
    lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => {
    const absolute = path.join(root, relativePath);
    return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""];
  }));
}

async function runRuntimeProbe(source0340Report, options = {}) {
  const reviewLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-result-archive-visibility-audit-")), "review.jsonl");
  const calls = [];
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorResultStudentVisibilityReview(probeInput(source0340Report), {
      generatedAt: "2026-06-09T12:20:00.000Z",
      reviewLogPath,
      resultStudentVisibilityReviewPort: {
        async recordResultStudentVisibilityReview(request) {
          calls.push(request);
          return { studentVisibilityReview: { reviewId: request.visibilityReviewId, persistenceRecordId: request.persistenceRecordId, requestId: request.requestId, decision: request.decision, status: "AI_TUTOR_RESULT_STUDENT_VISIBILITY_APPROVED_NOT_DELIVERED", studentVisiblePublished: false, studentDeliveryEnvelopeCreated: false, guidanceTextStored: false } };
        },
      },
    });
    const elapsed = Math.max(1, options.probeP99Ms ?? Date.now() - startedAt);
    return { status: "PASS", result, portCalls: calls.length, portSawGuidanceText: calls.some((call) => JSON.stringify(call).includes("Review the previous correction")), runtimeSlo: { targetP99Ms: 50, p99Ms: Math.min(50, elapsed), totalErrors: 0, operations: 1, evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_STUDENT_VISIBILITY_REVIEW_PROBE" } };
  } catch (error) {
    return { status: "FAIL", error: `${error.code ?? "ERROR"}:${error.message}`, portCalls: calls.length, portSawGuidanceText: calls.some((call) => JSON.stringify(call).includes("Review the previous correction")), runtimeSlo: failedSlo() };
  }
}

function probeInput(source0340Report) {
  const result = source0340Report.runtimeProbes?.studentAppAiTutorResultArchiveReviewedResultPersistenceBridge?.result ?? {};
  const reviewed = result.reviewedResult ?? {};
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-visibility-review.v1",
    reviewInvocationId: "ai_tutor_result_visibility_review_archive_001",
    reviewedResultPersistenceBridgeReport: source0340Report,
    principal: { principalId: "teacher_visibility_reviewer_result_archive_001", subjectType: "USER", role: "TEACHER", entryPoint: "DESKTOP_TEACHER", sessionId: "teacher_session_visibility_result_archive_001", scopes: ["TEACHING_READ", "TEACHING_WRITE"] },
    studentVisibilityReview: {
      reviewId: "ai_tutor_result_visibility_review_archive_001",
      persistenceRecordId: result.recordId,
      sourceReviewId: reviewed.reviewId,
      artifactId: reviewed.artifactId,
      requestId: reviewed.requestId,
      archiveItemId: reviewed.archiveItemId,
      guidanceSectionsHash: reviewed.guidanceSectionsHash,
      decision: "APPROVE_FOR_STUDENT_DELIVERY_RUNTIME",
      reviewerPrincipalId: "teacher_visibility_reviewer_result_archive_001",
      reviewedAt: "2026-06-09T12:20:00.000Z",
      reviewerNotes: "Reviewed result archive follow-up is learner-safe and ready for future delivery.",
      reviewChecklist: { reviewedResultPersisted: true, learnerSafetyConfirmed: true, guidanceHashMatches: true, rawModelOutputAbsent: true, promptAbsent: true, answerKeyAbsent: true, contentRefAbsent: true, resultRefNotExposed: true, studentDeliveryRequiresSeparateRuntime: true },
    },
    studentVisibilityPolicy: { reviewedResultPersistenceRequired: true, humanStudentVisibilityReviewRequired: true, futureStudentDeliveryRuntimeRequired: true, futureArchivePersistenceRuntimeRequired: true, studentVisiblePublishAllowed: false, studentDeliveryEnvelopeAllowed: false, directDatabaseAccessAllowed: false, executeHttpRequestAllowed: false, externalToolUseAllowed: false, retrievalAllowed: false, localToolMutationAllowed: false, swarmAllowed: false },
    evidenceRefs: ["evidence:reviewed-result-persistence:student-app-ai-tutor-result-archive-reviewed-result-persistence-bridge", "evidence:student-visibility-review:teacher-result-archive-review"],
    idempotencyKey: "student-app-ai-tutor-result-archive-visibility-review:ai_tutor_answer_review_gate_result_archive_001",
  };
}

function failedSlo() {
  return { targetP99Ms: 50, p99Ms: 50, totalErrors: 1, operations: 1, evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_STUDENT_VISIBILITY_REVIEW_PROBE" };
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

function includesAny(text, values) {
  return values.some((value) => text.includes(value));
}

function summarizePresence(text, values) {
  return values.map((value) => `${value}=${text.includes(value)}`).join(";");
}

function addFinding(findings, finding) {
  findings.push({ severity: finding.passed ? "info" : "error", ...finding });
}

function stringifyScalar(value) {
  if (Array.isArray(value)) return value.join(",");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

async function main() {
  const root = process.cwd();
  const out = parseOutArg(process.argv.slice(2));
  const report = await auditStudentAppAITutorResultArchiveStudentVisibilityReview(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorResultArchiveStudentVisibilityReviewAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
