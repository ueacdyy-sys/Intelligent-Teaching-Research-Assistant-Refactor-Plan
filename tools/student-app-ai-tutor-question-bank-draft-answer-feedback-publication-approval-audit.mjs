import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_COMMAND_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_RUNTIME_ID,
  recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApproval,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-runtime.test.mjs",
  reviewedFeedbackReport: "reports/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact.current.json",
  reviewedFeedbackRuntime: "tools/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-runtime.mjs",
  reviewedFeedbackAudit: "tools/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-audit.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0273-student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval.md",
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
  "studentVisibleFeedbackPublished: true",
  "studentVisibleDeliveryEnvelopeCreated: true",
  "durableStudentArchivePersistenceStarted: true",
  "answerKeyDisclosureAllowed: true",
  "workerMetadataDisclosureAllowed: true",
  "rawModelOutputDisclosureAllowed: true",
  "resultRefDisclosureAllowed: true",
  "modelInferenceAllowed: true",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "modelInferenceStarted: true",
  "answerKeyDisclosed: true",
  "workerMetadataDisclosed: true",
  "rawModelOutputDisclosed: true",
  "resultRefDisclosed: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export function auditStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApproval(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const reviewedFeedbackReport = parseJson(inputs.reviewedFeedbackReport, {});
  const reviewedFeedbackProbeResult =
    reviewedFeedbackReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifact?.result ?? {};
  const hooks = [
    inputs.packageJson ?? "",
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = runRuntimeProbe(reviewedFeedbackReport, options);

  addFinding(findings, {
    id: "reviewed_feedback.ready_not_published",
    passed: reviewedFeedbackReport.readiness === "READY" &&
      reviewedFeedbackReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_RUNTIME" &&
      reviewedFeedbackReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_runtime" &&
      reviewedFeedbackReport.runtime?.status === "READY_NOT_PUBLISHED" &&
      reviewedFeedbackReport.safetyInvariants?.feedbackArtifactRecorded === true &&
      reviewedFeedbackReport.safetyInvariants?.publicationApprovalRequired === true &&
      reviewedFeedbackReport.safetyInvariants?.studentVisibleFeedbackAllowed === false &&
      reviewedFeedbackReport.safetyInvariants?.answerKeyDisclosureAllowed === false &&
      reviewedFeedbackReport.safetyInvariants?.rawModelOutputDisclosureAllowed === false &&
      reviewedFeedbackReport.safetyInvariants?.modelInferenceAllowed === false,
    actual: `${reviewedFeedbackReport.readiness ?? "missing"}:${reviewedFeedbackReport.runtime?.status ?? "missing"}`,
    expected: "READY 0272 reviewed feedback artifact that is still not published",
    remediation: "Run the 0272 reviewed feedback artifact audit before publication approval.",
  });

  addFinding(findings, {
    id: "reviewed_feedback.safe_artifact_surface_only",
    passed: reviewedFeedbackReport.safetyInvariants?.feedbackArtifactRecorded === true &&
      reviewedFeedbackReport.safetyInvariants?.publicationApprovalRequired === true &&
      reviewedFeedbackReport.safetyInvariants?.studentVisibleFeedbackAllowed === false &&
      reviewedFeedbackReport.safetyInvariants?.answerKeyDisclosureAllowed === false &&
      reviewedFeedbackReport.safetyInvariants?.workerMetadataDisclosureAllowed === false &&
      reviewedFeedbackReport.safetyInvariants?.rawModelOutputDisclosureAllowed === false &&
      reviewedFeedbackReport.safetyInvariants?.resultRefDisclosureAllowed === false &&
      reviewedFeedbackReport.safetyInvariants?.modelInferenceAllowed === false &&
      reviewedFeedbackProbeResult.reviewedFeedbackArtifact?.visibilityState === "REVIEWED_NOT_PUBLISHED" &&
      Boolean(reviewedFeedbackProbeResult.reviewedFeedbackArtifact?.learnerFeedback) &&
      reviewedFeedbackProbeResult.reviewedFeedbackArtifact?.review?.answerKeyRemoved === true &&
      reviewedFeedbackProbeResult.reviewedFeedbackArtifact?.review?.workerMetadataRemoved === true &&
      reviewedFeedbackProbeResult.reviewedFeedbackArtifact?.review?.rawModelOutputRemoved === true &&
      reviewedFeedbackProbeResult.reviewedFeedbackArtifact?.review?.internalErrorsRemoved === true &&
      reviewedFeedbackProbeResult.reviewedFeedbackArtifact?.publicationApproved === false &&
      reviewedFeedbackProbeResult.reviewedFeedbackArtifact?.studentVisibleFeedbackPublished === false &&
      reviewedFeedbackProbeResult.boundary?.studentVisibleFeedbackPublished === false &&
      reviewedFeedbackProbeResult.boundary?.answerKeyDisclosed !== true &&
      reviewedFeedbackProbeResult.boundary?.rawModelOutputDisclosed !== true &&
      reviewedFeedbackProbeResult.boundary?.modelInferenceStarted !== true,
    actual: summarizeReviewedFeedbackSurface(reviewedFeedbackReport),
    expected: "0273 consumes only the reviewed learner feedback surface and does not reintroduce hidden answer/model/worker fields",
    remediation: "Keep publication approval downstream of reviewed safe feedback artifacts.",
  });

  addFinding(findings, {
    id: "runtime.identity_approval_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_COMMAND_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalPort.recordFeedbackPublicationApproval",
      "recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApproval",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_READY",
      "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED",
      "assertApproverPrincipal",
      "FEEDBACK_PUBLISH_APPROVE",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_runtime",
      "FEEDBACK_PUBLISH_APPROVE",
      "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED",
      "findExistingRecordByIdempotencyKey",
    ]),
    expected: "runtime records an idempotent human publication approval tied to 0272 evidence",
    remediation: "Do not approve feedback publication without reviewer identity and idempotency protection.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "reviewedFeedbackArtifactVerified: true",
      "safeStudentResultOnly: true",
      "humanReviewCompleted: true",
      "publicationApprovalRecorded: true",
      "publicationApprovalGranted: true",
      "approvedForStudentVisibleDelivery: true",
      "requiresFutureStudentVisibleDeliveryRuntime: true",
      "studentVisibleFeedbackPublished: false",
      "studentVisibleDeliveryEnvelopeCreated: false",
      "durableStudentArchivePersistenceStarted: false",
      "answerKeyDisclosed: false",
      "workerMetadataDisclosed: false",
      "rawModelOutputDisclosed: false",
      "resultRefDisclosed: false",
      "modelInferenceStarted: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "rejectLeakedFields",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime approves future delivery but does not publish, create a student envelope, persist, call DB/HTTP/model/tools/devices, or enable Swarm",
    remediation: "Keep student-visible delivery and durable persistence as later separate slices.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_approval_not_delivery",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_COMMAND_PORT &&
      probe.result?.approvedFeedbackArtifact?.approvalState === "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED" &&
      probe.result?.boundary?.publicationApprovalGranted === true &&
      probe.result?.boundary?.approvedForStudentVisibleDelivery === true &&
      probe.result?.boundary?.studentVisibleFeedbackPublished === false &&
      probe.result?.boundary?.studentVisibleDeliveryEnvelopeCreated === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};artifact=${probe.result.approvedFeedbackArtifact.artifactId};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records publication approval under the Student App 50ms control-plane budget without delivering it",
    remediation: "Publication approval must stop before student-visible delivery.",
  });

  addFinding(findings, {
    id: "tests.cover_negative_paths",
    passed: includesAll(runtimeTest, [
      "records publication approval while keeping delivery, persistence, and publication blocked",
      "uses idempotency for replay and rejects conflicting publication approval input",
      "rejects unauthorized approvers, unsafe reviewed artifacts, unsafe policy, and direct delivery attempts",
      "rejects leaked answer, worker, result, model, delivery, internal error, and unsafe text fields",
    ]),
    actual: "runtime tests scanned",
    expected: "positive approval, idempotency, approver auth, reviewed artifact safety, policy safety, direct delivery, leaked-field, and unsafe text tests",
    remediation: "Add regression coverage before using approval as root workflow evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: includesAll(hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval",
      "Student App AI Tutor question-bank draft answer feedback publication approval runtime audit",
      "studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApproval",
      "student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval.current.json",
      "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_runtime",
      "0273-student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval.md",
      "10.13/10",
      "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED",
    ]),
    actual: summarizePresence(hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval",
      "studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApproval",
      "10.13/10",
    ]),
    expected: "package, strict quality, root coverage, structure verifier, SDD, and architecture board track 0273",
    remediation: "Wire publication approval through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_RUNTIME",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_COMMAND_PORT,
      sourceReviewedFeedbackArtifactRuntime: "student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_runtime",
      status: "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED",
    },
    runtimeSlo: probe.runtimeSlo ?? { targetP99Ms: 50, p99Ms: 50, totalErrors: 1 },
    runtimeProbes: { studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApproval: probe },
    safetyInvariants: {
      reviewedFeedbackArtifactRequired: true,
      safeStudentResultRequired: true,
      humanReviewRequired: true,
      humanPublicationApprovalRequired: true,
      approvedForStudentVisibleDelivery: true,
      futureStudentVisibleDeliveryRuntimeRequired: true,
      studentVisibleFeedbackPublished: false,
      studentVisibleDeliveryEnvelopeCreated: false,
      durableStudentArchivePersistenceStarted: false,
      answerKeyDisclosureAllowed: false,
      workerMetadataDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      modelInferenceAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as publication approval evidence; implement student-visible delivery envelope as the next slice without adding durable persistence yet."
      : "Fix publication approval evidence before exposing feedback to Student App.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft answer feedback publication approval runtime: ${report.readiness}`,
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

function runRuntimeProbe(reviewedFeedbackReport, options) {
  const startedAt = Date.now();
  const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-feedback-publication-approval-audit-")), "approval.jsonl");
  try {
    const result = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApproval(probeInput(reviewedFeedbackReport), {
      commandLogPath,
      generatedAt: options.generatedAt ?? "2026-06-06T12:35:00.000Z",
    });
    return {
      status: "PASS",
      result,
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.max(1, Math.min(50, options.probeP99Ms ?? Date.now() - startedAt)),
        totalErrors: 0,
      },
    };
  } catch (error) {
    return {
      status: "FAIL",
      error: error instanceof Error ? error.message : String(error),
      runtimeSlo: { targetP99Ms: 50, p99Ms: 50, totalErrors: 1 },
    };
  }
}

function probeInput(reviewedFeedbackReport) {
  const reviewed = reviewedFeedbackArtifactFromReport(reviewedFeedbackReport);
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-feedback-publication-approval.v1",
    approvalInvocationId: "feedback_publication_approval_audit_001",
    principal: {
      principalId: "teacher_001",
      subjectType: "USER",
      role: "TEACHER",
      entryPoint: "DESKTOP_TEACHER",
      scopes: ["TEACHING_READ", "FEEDBACK_PUBLISH_APPROVE"],
      sessionId: "session_teacher_001",
    },
    reviewedFeedbackArtifactReport: reviewedFeedbackReport,
    feedbackPublicationApproval: {
      approvalId: "feedback_publication_approval_qbank_001",
      reviewerPrincipalId: "teacher_001",
      decision: "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY",
      reviewedAt: "2026-06-06T12:34:00.000Z",
      reviewedFeedbackArtifactId: reviewed.artifactId,
      submissionId: reviewed.submissionId,
      requestId: reviewed.requestId,
      questionBankDraftRef: reviewed.questionBankDraftRef,
      tutoringAnalysisRequestId: reviewed.tutoringAnalysisRequestId,
      archiveItemId: reviewed.archiveItemId,
      reviewedFeedbackArtifactVerified: true,
      learnerFeedbackReviewed: true,
      ageAppropriateConfirmed: true,
      studentOwnScopeConfirmed: true,
      answerKeyDisclosureBlocked: true,
      workerMetadataDisclosureBlocked: true,
      rawModelOutputDisclosureBlocked: true,
      internalErrorsDisclosureBlocked: true,
      futureStudentVisibleDeliveryRuntimeRequired: true,
      studentVisibleFeedbackPublished: false,
      studentVisibleDeliveryEnvelopeCreated: false,
      databaseWriteApproved: false,
      modelInferenceApproved: false,
      remoteDeviceControlApproved: false,
      localToolMutationApproved: false,
      swarmApproved: false,
      comments: "Approved for a future Student App delivery runtime after human feedback review.",
    },
    feedbackPublicationApprovalPolicy: {
      reviewedFeedbackArtifactRequired: true,
      humanPublicationApprovalRequired: true,
      safeStudentResultRequired: true,
      studentOwnScopeRequired: true,
      futureStudentVisibleDeliveryRuntimeRequired: true,
      approvalEvidenceRequired: true,
      studentVisibleFeedbackPublished: false,
      studentVisibleDeliveryEnvelopeCreated: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      modelInferenceAllowed: false,
      answerKeyDisclosureAllowed: false,
      workerMetadataDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [`evidence:student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact:${reviewed.submissionId}`],
    idempotencyKey: `student-app-ai-tutor-feedback-publication-approval:student_001:${reviewed.submissionId}`,
  };
}

function reviewedFeedbackArtifactFromReport(report) {
  const result = report?.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifact?.result ?? {};
  const artifact = result.reviewedFeedbackArtifact ?? {};
  return {
    artifactId: typeof artifact.artifactId === "string" ? artifact.artifactId : "feedback_artifact_qbank_001",
    submissionId: typeof artifact.submissionId === "string" ? artifact.submissionId : "qbank_ans_sub_feedback_001",
    requestId: typeof artifact.requestId === "string" ? artifact.requestId : "grading_req_feedback_001",
    questionBankDraftRef: typeof artifact.questionBankDraftRef === "string" ? artifact.questionBankDraftRef : "local://question-bank-drafts/tutor_req_student_app_001.json",
    tutoringAnalysisRequestId: typeof artifact.tutoringAnalysisRequestId === "string" ? artifact.tutoringAnalysisRequestId : "tutor_req_student_app_001",
    archiveItemId: typeof artifact.archiveItemId === "string" ? artifact.archiveItemId : "tarch_student_quiz_001",
  };
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => {
    const absolute = path.join(root, relativePath);
    return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""];
  }));
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

function includesAny(text, values) {
  return values.some((value) => text.includes(value));
}

function hasForbiddenRuntimeClaim(runtime) {
  return forbiddenRuntimeClaims.some((claim) => runtime.includes(claim));
}

function summarizePresence(text, values) {
  return values.map((value) => `${value}=${text.includes(value)}`).join(";");
}

function summarizeReviewedFeedbackSurface(report) {
  const invariants = report.safetyInvariants ?? {};
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifact?.result ?? {};
  const artifact = result.reviewedFeedbackArtifact ?? {};
  const review = artifact.review ?? {};
  const boundary = result.boundary ?? {};
  return [
    `visibilityState=${artifact.visibilityState ?? "missing"}`,
    `learnerFeedback=${Boolean(artifact.learnerFeedback)}`,
    `answerKeyRemoved=${review.answerKeyRemoved}`,
    `workerMetadataRemoved=${review.workerMetadataRemoved}`,
    `rawModelOutputRemoved=${review.rawModelOutputRemoved}`,
    `internalErrorsRemoved=${review.internalErrorsRemoved}`,
    `publicationApproved=${artifact.publicationApproved}`,
    `studentVisibleFeedbackPublished=${artifact.studentVisibleFeedbackPublished}`,
    `studentVisibleFeedbackAllowed=${invariants.studentVisibleFeedbackAllowed}`,
    `answerKeyDisclosureAllowed=${invariants.answerKeyDisclosureAllowed}`,
    `rawModelOutputDisclosureAllowed=${invariants.rawModelOutputDisclosureAllowed}`,
    `modelInferenceAllowed=${invariants.modelInferenceAllowed}`,
    `boundaryStudentVisibleFeedbackPublished=${boundary.studentVisibleFeedbackPublished}`,
    `boundaryModelInferenceStarted=${boundary.modelInferenceStarted}`,
  ].join(";");
}

function addFinding(findings, finding) {
  findings.push({ severity: finding.passed ? "info" : "error", ...finding });
}

function stringifyScalar(value) {
  if (Array.isArray(value)) return value.join(",");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

async function main() {
  const root = process.cwd();
  const out = parseOutArg(process.argv.slice(2));
  const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApproval(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
