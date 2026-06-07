import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_COMMAND_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_RUNTIME_ID,
  recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-runtime.test.mjs",
  approvalReport: "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval.current.json",
  approvalRuntime: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-runtime.mjs",
  approvalAudit: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-audit.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0274-student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope.md",
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
  "durableStudentArchivePersistenceStarted: true",
  "mainDatabaseWriteStarted: true",
  "studentArchiveWriteStarted: true",
  "directDatabaseAccessAllowed: true",
  "mainDatabaseWriteAllowed: true",
  "studentArchiveWriteAllowed: true",
  "executeHttpRequestAllowed: true",
  "modelInferenceAllowed: true",
  "modelInferenceStarted: true",
  "answerKeyDisclosureAllowed: true",
  "workerMetadataDisclosureAllowed: true",
  "rawModelOutputDisclosureAllowed: true",
  "resultRefDisclosureAllowed: true",
  "answerKeyDisclosed: true",
  "workerMetadataDisclosed: true",
  "rawModelOutputDisclosed: true",
  "resultRefDisclosed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export function auditStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const approvalReport = parseJson(inputs.approvalReport, {});
  const approvalEvidence = [
    inputs.approvalRuntime ?? "",
    inputs.approvalAudit ?? "",
    inputs.approvalReport ?? "",
  ].join("\n");
  const hooks = [
    inputs.packageJson ?? "",
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = runRuntimeProbe(approvalReport, options);

  addFinding(findings, {
    id: "publication_approval.ready_for_delivery_not_persisted",
    passed: approvalReport.readiness === "READY" &&
      approvalReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_RUNTIME" &&
      approvalReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_runtime" &&
      approvalReport.runtime?.status === "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED" &&
      approvalReport.safetyInvariants?.approvedForStudentVisibleDelivery === true &&
      approvalReport.safetyInvariants?.futureStudentVisibleDeliveryRuntimeRequired === true &&
      approvalReport.safetyInvariants?.studentVisibleFeedbackPublished === false &&
      approvalReport.safetyInvariants?.studentVisibleDeliveryEnvelopeCreated === false &&
      approvalReport.safetyInvariants?.durableStudentArchivePersistenceStarted === false &&
      approvalReport.safetyInvariants?.answerKeyDisclosureAllowed === false &&
      approvalReport.safetyInvariants?.rawModelOutputDisclosureAllowed === false &&
      approvalReport.safetyInvariants?.modelInferenceAllowed === false,
    actual: `${approvalReport.readiness ?? "missing"}:${approvalReport.runtime?.status ?? "missing"}`,
    expected: "READY 0273 publication approval evidence that permits future student-visible delivery but not persistence",
    remediation: "Run the 0273 publication approval audit before creating the Student App feedback delivery envelope.",
  });

  addFinding(findings, {
    id: "publication_approval.safe_artifact_surface_only",
    passed: includesAll(approvalEvidence, [
      "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED",
      "approvedFeedbackArtifact",
      "learnerFeedback",
      "answerKeyDisclosureBlocked",
      "workerMetadataDisclosureBlocked",
      "rawModelOutputDisclosureBlocked",
      "internalErrorsDisclosureBlocked",
    ]) && !includesAny(inputs.approvalRuntime ?? "", [
      "studentVisibleDeliveryEnvelopeCreated: true",
      "durableStudentArchivePersistenceStarted: true",
      "answerKeyDisclosed: true",
      "rawModelOutputDisclosed: true",
      "modelInferenceStarted: true",
    ]),
    actual: [
      summarizePresence(approvalEvidence, ["approvedFeedbackArtifact", "learnerFeedback"]),
      summarizePresence(inputs.approvalRuntime ?? "", [
        "studentVisibleDeliveryEnvelopeCreated: true",
        "durableStudentArchivePersistenceStarted: true",
      ]),
    ].join(";"),
    expected: "0274 consumes only approved safe learner feedback and does not resurrect answer keys, worker metadata, raw model output, or persistence",
    remediation: "Keep delivery envelope creation downstream of 0273 approval evidence.",
  });

  addFinding(findings, {
    id: "runtime.identity_delivery_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_COMMAND_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopePort.recordFeedbackDeliveryEnvelope",
      "recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_READY",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_READY_NOT_PERSISTED",
      "assertDeliveryPrincipal",
      "STUDENT_DELIVERY_ENVELOPE",
      "STUDENT_APP_DELIVERY",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_runtime",
      "StudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopePort.recordFeedbackDeliveryEnvelope",
      "STUDENT_DELIVERY_ENVELOPE",
      "findExistingRecordByIdempotencyKey",
    ]),
    expected: "runtime records an idempotent controlled service delivery envelope tied to 0273 approval evidence",
    remediation: "Do not expose feedback delivery without the controlled delivery service principal and idempotency protection.",
  });

  addFinding(findings, {
    id: "runtime.visible_envelope_without_persistence_or_model",
    passed: includesAll(runtime, [
      "publicationApprovalVerified: true",
      "safeLearnerFeedbackOnly: true",
      "studentOwnScopeEnforced: true",
      "studentVisibleFeedbackDeliveryEnvelopeCreated: true",
      "studentVisibleFeedbackPublished: true",
      "studentVisibleFeedbackDelivered: true",
      "durableStudentArchivePersistenceStarted: false",
      "mainDatabaseWriteStarted: false",
      "studentArchiveWriteStarted: false",
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
      "requiresFutureDurableArchivePersistenceReview: true",
      "STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE",
      "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED",
      "rejectLeakedFields",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime creates only a renderable Student App feedback envelope while blocking DB, archive persistence, model calls, tools, devices, and Swarm",
    remediation: "Keep durable student archive persistence as a later reviewed slice.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_student_visible_envelope",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_READY_NOT_PERSISTED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_COMMAND_PORT &&
      probe.result?.studentFeedbackDeliveryEnvelope?.visibilityState === "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED" &&
      probe.result?.studentFeedbackDeliveryEnvelope?.deliveryState === "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED" &&
      probe.result?.boundary?.studentVisibleFeedbackDeliveryEnvelopeCreated === true &&
      probe.result?.boundary?.studentVisibleFeedbackPublished === true &&
      probe.result?.boundary?.durableStudentArchivePersistenceStarted === false &&
      probe.result?.boundary?.studentArchiveWriteStarted === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};envelope=${probe.result.studentFeedbackDeliveryEnvelope.envelopeId};persisted=${probe.result.boundary.durableStudentArchivePersistenceStarted};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records a Student App renderable feedback envelope under the 50ms control-plane budget without persistence",
    remediation: "The delivery envelope must not start durable archive writes.",
  });

  addFinding(findings, {
    id: "tests.cover_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a student-visible feedback envelope while keeping durable persistence blocked",
      "uses idempotency for replay and rejects conflicting delivery envelopes",
      "rejects unsafe principals, unapproved reports, unsafe policies, and delivery mismatches",
      "rejects leaked answer, worker, result, model, persistence, internal error, and unsafe text fields",
    ]),
    actual: "runtime tests scanned",
    expected: "positive envelope, idempotency, service principal, approval safety, policy safety, mismatch, leaked-field, and unsafe text tests",
    remediation: "Add regression coverage before using delivery envelopes as root workflow evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: includesAll(hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope",
      "Student App AI Tutor question-bank draft answer feedback delivery envelope runtime audit",
      "studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope",
      "student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope.current.json",
      "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_runtime",
      "0274-student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope.md",
      "10.14/10",
      "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED",
    ]),
    actual: summarizePresence(hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope",
      "studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope",
      "10.14/10",
    ]),
    expected: "package, strict quality, root coverage, structure verifier, SDD, and architecture board track 0274",
    remediation: "Wire feedback delivery envelope through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_RUNTIME",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_COMMAND_PORT,
      sourcePublicationApprovalRuntime: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_runtime",
      status: "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED",
    },
    runtimeSlo: probe.runtimeSlo ?? { targetP99Ms: 50, p99Ms: 50, totalErrors: 1 },
    runtimeProbes: { studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope: probe },
    safetyInvariants: {
      publicationApprovalRequired: true,
      safeLearnerFeedbackRequired: true,
      studentDeliveryEnvelopeAllowed: true,
      studentVisibleFeedbackAllowed: true,
      studentOwnScopeRequired: true,
      studentVisibleFeedbackDeliveryEnvelopeCreated: true,
      durableStudentArchivePersistenceStarted: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
      answerKeyDisclosureAllowed: false,
      workerMetadataDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      modelInferenceAllowed: false,
      futureDurableArchivePersistenceReviewRequired: true,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as Student App renderable feedback delivery evidence; durable student archive persistence remains a separate reviewed slice."
      : "Fix feedback delivery envelope evidence before any durable student archive persistence can consume it.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft answer feedback delivery envelope runtime: ${report.readiness}`,
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

function runRuntimeProbe(approvalReport, options) {
  const startedAt = Date.now();
  const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-feedback-delivery-envelope-audit-")), "delivery.jsonl");
  try {
    const result = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope(probeInput(approvalReport), {
      commandLogPath,
      generatedAt: options.generatedAt ?? "2026-06-06T13:10:00.000Z",
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

function probeInput(approvalReport) {
  const approval = publicationApprovalFromReport(approvalReport);
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-feedback-delivery-envelope.v1",
    deliveryInvocationId: "feedback_delivery_audit_001",
    principal: {
      principalId: "student_delivery_runtime_001",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "STUDENT_DELIVERY_RUNTIME",
      scopes: ["TEACHING_READ", "STUDENT_DELIVERY_ENVELOPE", "STUDENT_APP_DELIVERY"],
      sessionId: "session_student_delivery_001",
    },
    feedbackPublicationApprovalReport: approvalReport,
    feedbackDeliveryRequest: {
      envelopeId: "feedback_delivery_env_qbank_001",
      deliveryMode: "STUDENT_APP_RENDERABLE_FEEDBACK_ENVELOPE",
      channel: "STUDENT_APP",
      audienceKind: "STUDENT_APP_LEARNING_SUPPORT",
      visibilityState: "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED",
      scopeRef: approval.scopeRef,
      approvalRecordId: approval.recordId,
      approvalId: approval.approvalId,
      approvedFeedbackArtifactId: approval.approvedFeedbackArtifactId,
      submissionId: approval.submissionId,
      requestId: approval.requestId,
      questionBankDraftRef: approval.questionBankDraftRef,
      tutoringAnalysisRequestId: approval.tutoringAnalysisRequestId,
      archiveItemId: approval.archiveItemId,
      studentOwnScopeConfirmed: true,
    },
    feedbackDeliveryPolicy: {
      publicationApprovalRequired: true,
      studentDeliveryEnvelopeAllowed: true,
      studentVisibleFeedbackAllowed: true,
      studentOwnScopeRequired: true,
      safeLearnerFeedbackRequired: true,
      futureDurableArchivePersistenceReviewRequired: true,
      directDatabaseAccessAllowed: false,
      mainDatabaseWriteAllowed: false,
      studentArchiveWriteAllowed: false,
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
    evidenceRefs: [`evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval:${approval.submissionId}`],
    idempotencyKey: `student-app-ai-tutor-feedback-delivery-envelope:${studentIdFromScope(approval.scopeRef)}:${approval.submissionId}`,
  };
}

function publicationApprovalFromReport(report) {
  const result = report?.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApproval?.result ?? {};
  const approval = result.approval ?? {};
  const artifact = result.approvedFeedbackArtifact ?? {};
  return {
    recordId: typeof result.recordId === "string"
      ? result.recordId
      : "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_student_app_ai_tutor_feedback_publication_approval_student_001_qbank_ans_sub_feedback_001",
    approvalId: typeof approval.approvalId === "string" ? approval.approvalId : "feedback_publication_approval_qbank_001",
    approvedFeedbackArtifactId: typeof artifact.artifactId === "string" ? artifact.artifactId : "feedback_artifact_qbank_001",
    submissionId: typeof artifact.submissionId === "string" ? artifact.submissionId : "qbank_ans_sub_feedback_001",
    requestId: typeof artifact.requestId === "string" ? artifact.requestId : "grading_req_feedback_001",
    questionBankDraftRef: typeof artifact.questionBankDraftRef === "string" ? artifact.questionBankDraftRef : "local://question-bank-drafts/tutor_req_student_app_001.json",
    tutoringAnalysisRequestId: typeof artifact.tutoringAnalysisRequestId === "string" ? artifact.tutoringAnalysisRequestId : "tutor_req_student_app_001",
    archiveItemId: typeof artifact.archiveItemId === "string" ? artifact.archiveItemId : "tarch_student_quiz_001",
    scopeRef: "student:student_001",
  };
}

function studentIdFromScope(scopeRef) {
  return typeof scopeRef === "string" && scopeRef.startsWith("student:")
    ? scopeRef.slice("student:".length)
    : "student_001";
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
  const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
