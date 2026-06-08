import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_PORT,
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_RUNTIME_ID,
  recordStudentAppAITutorResultStudentVisibilityReview,
} from "./student-app-ai-tutor-result-student-visibility-review-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-result-student-visibility-review.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-result-student-visibility-review-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-result-student-visibility-review-runtime.test.mjs",
  reviewedResultPersistenceBridgeReport: "reports/student-app-ai-tutor-reviewed-result-persistence-bridge.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0328-student-app-ai-tutor-result-student-visibility-review.md",
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
  "studentVisiblePublishAllowed: true",
  "studentDeliveryEnvelopeAllowed: true",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "externalToolUseAllowed: true",
  "retrievalAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "studentVisiblePublished: true",
  "studentDeliveryEnvelopeCreated: true",
  "guidanceTextSentToPort: true",
  "rawResultRefSentToPort: true",
  "dangerouslySetInnerHTML",
  "innerHTML",
];

export async function auditStudentAppAITutorResultStudentVisibilityReview(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const sourceReport = parseJson(inputs.reviewedResultPersistenceBridgeReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.rootTrace ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(sourceReport, options);

  addFinding(findings, {
    id: "source.0327_reviewed_result_persistence_ready",
    passed: sourceReport.readiness === "READY" &&
      sourceReport.workloadType === "STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE" &&
      sourceReport.runtime?.runtimeId === "student_app_ai_tutor_reviewed_result_persistence_bridge_runtime" &&
      sourceReport.runtime?.status === "STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTED" &&
      sourceReport.safetyInvariants?.resultPersistenceCommitted === true &&
      sourceReport.safetyInvariants?.tutoringResultRecorded === true &&
      sourceReport.safetyInvariants?.resultRefExposed === false &&
      sourceReport.safetyInvariants?.studentVisiblePublished === false &&
      sourceReport.runtimeSlo?.totalErrors === 0,
    actual: `${sourceReport.readiness ?? "missing"}:${sourceReport.runtime?.status ?? "missing"}`,
    expected: "READY 0327 reviewed result persistence bridge with no student-visible publication",
    remediation: "Run 0327 reviewed result persistence bridge audit before student visibility review.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_PORT",
      "StudentAppAITutorResultStudentVisibilityReviewPort.recordResultStudentVisibilityReview",
      "recordStudentAppAITutorResultStudentVisibilityReview",
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_RECORDED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_result_student_visibility_review_runtime",
      "StudentAppAITutorResultStudentVisibilityReviewPort.recordResultStudentVisibilityReview",
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_RECORDED",
    ]),
    expected: "runtime records an idempotent student visibility review through a named port",
    remediation: "Keep 0328 port-based, idempotent, and tied to 0327 reviewed result persistence evidence.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "reviewedResultPersistenceRequired: true",
      "humanStudentVisibilityReviewRecorded: true",
      "approvedForFutureStudentDelivery: true",
      "guidanceTextSentToPort: false",
      "rawResultRefSentToPort: false",
      "studentVisiblePublished: false",
      "studentDeliveryEnvelopeCreated: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "externalToolUseAllowed: false",
      "retrievalAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "futureStudentDeliveryRequiresSeparateRuntime: true",
      "futureArchivePersistenceRequiresSeparateRuntime: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime approves only a future delivery runtime and blocks publication, delivery envelope creation, DB, HTTP, tools, Swarm, guidance text, and raw result refs",
    remediation: "Do not collapse 0328 into student delivery or durable archive persistence.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_visibility_review",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_RECORDED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_PORT &&
      probe.result?.studentVisibilityReview?.status === "AI_TUTOR_RESULT_STUDENT_VISIBILITY_APPROVED_NOT_DELIVERED" &&
      probe.result?.boundary?.humanStudentVisibilityReviewRecorded === true &&
      probe.result?.boundary?.studentVisiblePublished === false &&
      probe.result?.boundary?.studentDeliveryEnvelopeCreated === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};visible=${probe.result.boundary.studentVisiblePublished};p99=${probe.runtimeSlo.p99Ms};calls=${probe.portCalls}`
      : probe.error,
    expected: "probe records one reviewed-result student visibility review without publishing or delivery envelope creation",
    remediation: "0328 must prove the student visibility review boundary before any future delivery slice consumes it.",
  });

  addFinding(findings, {
    id: "tests.cover_visibility_review_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a human student visibility review without publishing or delivery envelope creation",
      "uses idempotency for safe replay and rejects conflicting student visibility reviews",
      "rejects missing ports, unsafe reviewers, non-ready sources, and non-approved decisions",
      "rejects unsafe policies, leaked fields, unsafe review notes, unsafe port results, and missing evidence",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, missing port, unsafe reviewer, bad source, rejected decision, unsafe policy, leak, unsafe notes, unsafe port, and evidence tests",
    remediation: "Add regression coverage before using 0328 as student visibility review evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-result-student-visibility-review"]?.includes("student-app-ai-tutor-result-student-visibility-review-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor result student visibility review runtime audit",
        "studentAppAiTutorResultStudentVisibilityReview",
        "student-app-ai-tutor-result-student-visibility-review.current.json",
        "student_app_ai_tutor_result_student_visibility_review_runtime",
        "0328-student-app-ai-tutor-result-student-visibility-review.md",
        "SDD 0328 student app ai tutor result student visibility review",
        "11.20/10",
        "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_RECORDED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-result-student-visibility-review",
      "studentAppAiTutorResultStudentVisibilityReview",
      "11.20/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, root trace, SDD, and architecture board track 0328",
    remediation: "Wire student visibility review evidence through every root project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_PORT,
      sourceRuntime: "student_app_ai_tutor_reviewed_result_persistence_bridge_runtime",
      status: "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_RECORDED",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorResultStudentVisibilityReview: probe },
    safetyInvariants: {
      reviewedResultPersistenceRequired: true,
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
    nextAction: readiness === "READY"
      ? "Use this as the AI Tutor result student visibility review evidence; actual student delivery and durable archive persistence remain later slices."
      : "Fix 0328 student visibility review evidence before claiming student-delivery readiness.",
  };
}

export function formatStudentAppAITutorResultStudentVisibilityReviewAudit(report) {
  const lines = [
    `Student App AI Tutor result student visibility review runtime: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
    `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`,
    "",
    "Findings:",
  ];
  for (const finding of report.findings) lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: ${finding.actual}`);
  lines.push("", `Next: ${report.nextAction}`);
  return lines.join("\n");
}

function runRuntimeProbe(sourceReport, options) {
  const calls = [];
  return recordStudentAppAITutorResultStudentVisibilityReview(probeInput(sourceReport), {
    generatedAt: "2026-06-08T10:40:00.000Z",
    reviewLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ai-tutor-result-visibility-review-")), "review.jsonl"),
    resultStudentVisibilityReviewPort: {
      async recordResultStudentVisibilityReview(request) {
        calls.push(request);
        return {
          studentVisibilityReview: {
            reviewId: request.visibilityReviewId,
            persistenceRecordId: request.persistenceRecordId,
            requestId: request.requestId,
            decision: request.decision,
            status: "AI_TUTOR_RESULT_STUDENT_VISIBILITY_APPROVED_NOT_DELIVERED",
            studentVisiblePublished: false,
            studentDeliveryEnvelopeCreated: false,
            guidanceTextStored: false,
          },
        };
      },
    },
  }).then((result) => ({
    status: "PASS",
    result,
    portCalls: calls.length,
    runtimeSlo: result.runtimeSlo,
  })).catch((error) => ({
    status: "FAIL",
    error: error.message,
    portCalls: calls.length,
    runtimeSlo: failedSlo(),
  }));
}

function probeInput(sourceReport) {
  const result = sourceReport.runtimeProbes?.studentAppAiTutorReviewedResultPersistenceBridge?.result ?? {};
  const reviewed = result.reviewedResult ?? {};
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-visibility-review.v1",
    reviewInvocationId: "ai_tutor_result_visibility_review_001",
    reviewedResultPersistenceBridgeReport: sourceReport,
    principal: {
      principalId: "teacher_visibility_reviewer_001",
      subjectType: "USER",
      role: "TEACHER",
      entryPoint: "DESKTOP_TEACHER",
      sessionId: "teacher_session_visibility_001",
      scopes: ["TEACHING_READ", "TEACHING_WRITE"],
    },
    studentVisibilityReview: {
      reviewId: "ai_tutor_result_visibility_review_001",
      persistenceRecordId: result.recordId,
      sourceReviewId: reviewed.reviewId,
      artifactId: reviewed.artifactId,
      requestId: reviewed.requestId,
      archiveItemId: reviewed.archiveItemId,
      guidanceSectionsHash: reviewed.guidanceSectionsHash,
      decision: "APPROVE_FOR_STUDENT_DELIVERY_RUNTIME",
      reviewerPrincipalId: "teacher_visibility_reviewer_001",
      reviewedAt: "2026-06-08T10:40:00.000Z",
      reviewerNotes: "Reviewed result is learner-safe and ready for a future delivery envelope runtime.",
      reviewChecklist: {
        reviewedResultPersisted: true,
        learnerSafetyConfirmed: true,
        guidanceHashMatches: true,
        rawModelOutputAbsent: true,
        promptAbsent: true,
        answerKeyAbsent: true,
        contentRefAbsent: true,
        resultRefNotExposed: true,
        studentDeliveryRequiresSeparateRuntime: true,
      },
    },
    studentVisibilityPolicy: {
      reviewedResultPersistenceRequired: true,
      humanStudentVisibilityReviewRequired: true,
      futureStudentDeliveryRuntimeRequired: true,
      futureArchivePersistenceRuntimeRequired: true,
      studentVisiblePublishAllowed: false,
      studentDeliveryEnvelopeAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      retrievalAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      "evidence:reviewed-result-persistence:student-app-ai-tutor-reviewed-result-persistence-bridge",
      "evidence:student-visibility-review:teacher-human-review",
    ],
    idempotencyKey: "student-app-ai-tutor-result-visibility-review:ai_tutor_answer_review_gate_001",
  };
}

function loadCurrentInputs(root = process.cwd()) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, file]) => [key, readOptional(path.join(root, file))]));
}

function readOptional(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function includesAll(text, needles) {
  return needles.every((needle) => text.includes(needle));
}

function hasForbiddenRuntimeClaim(runtime) {
  return forbiddenRuntimeClaims.some((claim) => runtime.includes(claim));
}

function summarizePresence(text, needles) {
  return needles.map((needle) => `${needle}=${text.includes(needle)}`).join(";");
}

function addFinding(findings, finding) {
  findings.push({ severity: finding.passed ? "info" : "error", ...finding });
}

function failedSlo() {
  return { targetP99Ms: 50, p99Ms: 999, totalErrors: 1, operations: 0, evidenceClass: "JS_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_PROBE" };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outIndex = process.argv.indexOf("--out");
  const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : defaultOutPath;
  const report = await auditStudentAppAITutorResultStudentVisibilityReview(loadCurrentInputs());
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorResultStudentVisibilityReviewAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
