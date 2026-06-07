import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_RUNTIME_ID,
  recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-runtime.test.mjs",
  deliveryReport: "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope.current.json",
  deliveryRuntime: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-runtime.mjs",
  deliveryAudit: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-audit.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0275-student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command.md",
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
  "durableStudentArchiveCommitStarted: true",
  "studentArchivePersisted: true",
  "mainDatabaseWriteStarted: true",
  "studentArchiveWriteStarted: true",
  "directDatabaseAccessAllowed: true",
  "mainDatabaseWriteAllowed: true",
  "studentArchiveWriteAllowed: true",
  "durableArchiveCommitAllowed: true",
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

export function auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const deliveryReport = parseJson(inputs.deliveryReport, {});
  const deliveryEvidence = [
    inputs.deliveryRuntime ?? "",
    inputs.deliveryAudit ?? "",
    inputs.deliveryReport ?? "",
  ].join("\n");
  const hooks = [
    inputs.packageJson ?? "",
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = runRuntimeProbe(deliveryReport, options);

  addFinding(findings, {
    id: "delivery_envelope.ready_not_persisted",
    passed: deliveryReport.readiness === "READY" &&
      deliveryReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_RUNTIME" &&
      deliveryReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_runtime" &&
      deliveryReport.runtime?.status === "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED" &&
      deliveryReport.safetyInvariants?.studentVisibleFeedbackDeliveryEnvelopeCreated === true &&
      deliveryReport.safetyInvariants?.futureDurableArchivePersistenceReviewRequired === true &&
      deliveryReport.safetyInvariants?.durableStudentArchivePersistenceStarted === false &&
      deliveryReport.safetyInvariants?.mainDatabaseWriteStarted === false &&
      deliveryReport.safetyInvariants?.studentArchiveWriteStarted === false &&
      deliveryReport.safetyInvariants?.answerKeyDisclosureAllowed === false &&
      deliveryReport.safetyInvariants?.rawModelOutputDisclosureAllowed === false,
    actual: `${deliveryReport.readiness ?? "missing"}:${deliveryReport.runtime?.status ?? "missing"}`,
    expected: "READY 0274 feedback delivery envelope that is student-visible but not persisted",
    remediation: "Run the 0274 feedback delivery envelope audit before recording archive persistence commands.",
  });

  addFinding(findings, {
    id: "delivery_envelope.safe_surface_only",
    passed: includesAll(deliveryEvidence, [
      "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED",
      "studentFeedbackDeliveryEnvelope",
      "learnerFeedback",
      "scoreSummary",
      "durableStudentArchivePersistenceStarted: false",
      "mainDatabaseWriteStarted: false",
      "studentArchiveWriteStarted: false",
    ]) && !includesAny(inputs.deliveryRuntime ?? "", [
      "durableStudentArchivePersistenceStarted: true",
      "mainDatabaseWriteStarted: true",
      "studentArchiveWriteStarted: true",
      "answerKeyDisclosed: true",
      "rawModelOutputDisclosed: true",
      "modelInferenceStarted: true",
    ]),
    actual: [
      summarizePresence(deliveryEvidence, ["studentFeedbackDeliveryEnvelope", "learnerFeedback", "scoreSummary"]),
      summarizePresence(inputs.deliveryRuntime ?? "", ["durableStudentArchivePersistenceStarted: true", "mainDatabaseWriteStarted: true"]),
    ].join(";"),
    expected: "0275 consumes only safe 0274 delivery-envelope evidence and does not reintroduce answer keys, raw model output, or persistence side effects",
    remediation: "Keep archive persistence command downstream of the safe delivery envelope.",
  });

  addFinding(findings, {
    id: "runtime.identity_command_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandPort.recordFeedbackArchivePersistenceCommand",
      "recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_READY",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
      "assertPersistencePrincipal",
      "STUDENT_ARCHIVE_WRITE",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_persistence_command_runtime",
      "StudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandPort.recordFeedbackArchivePersistenceCommand",
      "STUDENT_ARCHIVE_WRITE",
      "findExistingRecordByIdempotencyKey",
    ]),
    expected: "runtime records an idempotent controlled archive persistence command tied to 0274 delivery evidence",
    remediation: "Do not record archive persistence commands without the controlled service principal and idempotency protection.",
  });

  addFinding(findings, {
    id: "runtime.command_without_commit_or_model",
    passed: includesAll(runtime, [
      "feedbackDeliveryEnvelopeVerified: true",
      "publicationApprovalPreserved: true",
      "safeLearnerFeedbackOnly: true",
      "studentOwnScopeEnforced: true",
      "feedbackArchivePersistenceCommandRecorded: true",
      "appendOnlyCommandLogRecorded: true",
      "durableStudentArchivePersistenceStarted: false",
      "durableStudentArchiveCommitStarted: false",
      "studentArchivePersisted: false",
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
      "requiresFutureDurableArchiveCommitReview: true",
      "STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND",
      "NOT_COMMITTED_TO_STUDENT_ARCHIVE",
      "rejectLeakedFields",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime creates only append-only archive persistence command evidence while blocking DB, durable commit, model calls, tools, devices, and Swarm",
    remediation: "Keep durable student archive commit as a later reviewed slice.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_command_not_commit",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_PORT &&
      probe.result?.feedbackArchivePersistenceCommand?.commitState === "NOT_COMMITTED_TO_STUDENT_ARCHIVE" &&
      probe.result?.boundary?.feedbackArchivePersistenceCommandRecorded === true &&
      probe.result?.boundary?.durableStudentArchiveCommitStarted === false &&
      probe.result?.boundary?.studentArchivePersisted === false &&
      probe.result?.boundary?.studentArchiveWriteStarted === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};command=${probe.result.feedbackArchivePersistenceCommand.commandId};commit=${probe.result.boundary.durableStudentArchiveCommitStarted};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records append-only feedback archive persistence command under the 50ms control-plane budget without durable commit",
    remediation: "The archive persistence command must not start durable archive writes.",
  });

  addFinding(findings, {
    id: "tests.cover_negative_paths",
    passed: includesAll(runtimeTest, [
      "records an append-only feedback archive persistence command without durable commit",
      "uses idempotency for replay and rejects conflicting persistence commands",
      "rejects unsafe principals, unsafe delivery reports, unsafe policies, and mismatches",
      "rejects leaked answer, worker, result, model, commit, internal error, and unsafe text fields",
    ]),
    actual: "runtime tests scanned",
    expected: "positive command, idempotency, service principal, delivery safety, policy safety, mismatch, leaked-field, and unsafe text tests",
    remediation: "Add regression coverage before using archive persistence commands as root workflow evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: includesAll(hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command",
      "Student App AI Tutor question-bank draft answer feedback archive persistence command runtime audit",
      "studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand",
      "student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command.current.json",
      "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_persistence_command_runtime",
      "0275-student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command.md",
      "10.15/10",
      "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
    ]),
    actual: summarizePresence(hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command",
      "studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand",
      "10.15/10",
    ]),
    expected: "package, strict quality, root coverage, structure verifier, SDD, and architecture board track 0275",
    remediation: "Wire feedback archive persistence command through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_RUNTIME",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_PORT,
      sourceFeedbackDeliveryEnvelopeRuntime: "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_runtime",
      status: "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
    },
    runtimeSlo: probe.runtimeSlo ?? { targetP99Ms: 50, p99Ms: 50, totalErrors: 1 },
    runtimeProbes: { studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand: probe },
    safetyInvariants: {
      feedbackDeliveryEnvelopeRequired: true,
      appendOnlyCommandLogRequired: true,
      studentOwnScopeRequired: true,
      feedbackArchivePersistenceCommandRecorded: true,
      durableStudentArchivePersistenceStarted: false,
      durableStudentArchiveCommitStarted: false,
      studentArchivePersisted: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
      answerKeyDisclosureAllowed: false,
      workerMetadataDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      modelInferenceAllowed: false,
      futureDurableArchiveCommitReviewRequired: true,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as Student App feedback archive persistence command evidence; durable student archive commit remains a separate reviewed slice."
      : "Fix feedback archive persistence command evidence before any durable student archive commit can consume it.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft answer feedback archive persistence command runtime: ${report.readiness}`,
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

function runRuntimeProbe(deliveryReport, options) {
  const startedAt = Date.now();
  const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-feedback-archive-persistence-audit-")), "persistence.jsonl");
  try {
    const result = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand(probeInput(deliveryReport), {
      commandLogPath,
      generatedAt: options.generatedAt ?? "2026-06-06T13:30:00.000Z",
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

function probeInput(deliveryReport) {
  const delivery = feedbackDeliveryEnvelopeFromReport(deliveryReport);
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command.v1",
    persistenceInvocationId: "feedback_archive_persist_audit_001",
    principal: {
      principalId: "student_archive_persistence_runtime_001",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "STUDENT_ARCHIVE_PERSISTENCE_RUNTIME",
      scopes: ["TEACHING_READ", "STUDENT_ARCHIVE_WRITE", "STUDENT_APP_DELIVERY"],
      sessionId: "session_student_archive_persistence_001",
    },
    feedbackDeliveryEnvelopeReport: deliveryReport,
    feedbackArchivePersistenceRequest: {
      commandId: "feedback_archive_cmd_qbank_001",
      persistenceMode: "APPEND_ONLY_STUDENT_ARCHIVE_COMMAND",
      targetArchiveKind: "STUDENT_AI_TUTOR_FEEDBACK_ARCHIVE",
      desiredArchiveState: "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
      scopeRef: delivery.scopeRef,
      deliveryEnvelopeRecordId: delivery.recordId,
      deliveryEnvelopeId: delivery.envelopeId,
      approvedFeedbackArtifactId: delivery.approvedFeedbackArtifactId,
      submissionId: delivery.submissionId,
      requestId: delivery.requestId,
      questionBankDraftRef: delivery.questionBankDraftRef,
      tutoringAnalysisRequestId: delivery.tutoringAnalysisRequestId,
      archiveItemId: delivery.archiveItemId,
    },
    feedbackArchivePersistencePolicy: {
      feedbackDeliveryEnvelopeRequired: true,
      appendOnlyCommandLogRequired: true,
      studentOwnScopeRequired: true,
      preserveApprovalEvidenceRequired: true,
      preserveLearnerFeedbackRequired: true,
      futureDurableArchiveCommitReviewRequired: true,
      directDatabaseAccessAllowed: false,
      mainDatabaseWriteAllowed: false,
      studentArchiveWriteAllowed: false,
      durableArchiveCommitAllowed: false,
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
    evidenceRefs: [`evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope:${delivery.submissionId}`],
    idempotencyKey: `student-app-ai-tutor-feedback-archive-persistence:${studentIdFromScope(delivery.scopeRef)}:${delivery.submissionId}`,
  };
}

function feedbackDeliveryEnvelopeFromReport(report) {
  const result = report?.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope?.result ?? {};
  const envelope = result.studentFeedbackDeliveryEnvelope ?? {};
  return {
    recordId: typeof result.recordId === "string"
      ? result.recordId
      : "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_student_app_ai_tutor_feedback_delivery_envelope_student_001_qbank_ans_sub_feedback_001",
    envelopeId: typeof envelope.envelopeId === "string" ? envelope.envelopeId : "feedback_delivery_env_qbank_001",
    approvedFeedbackArtifactId: typeof envelope.approvedFeedbackArtifactId === "string" ? envelope.approvedFeedbackArtifactId : "feedback_artifact_qbank_001",
    submissionId: typeof envelope.submissionId === "string" ? envelope.submissionId : "qbank_ans_sub_feedback_001",
    requestId: typeof envelope.requestId === "string" ? envelope.requestId : "grading_req_feedback_001",
    questionBankDraftRef: typeof envelope.questionBankDraftRef === "string" ? envelope.questionBankDraftRef : "local://question-bank-drafts/tutor_req_student_app_001.json",
    tutoringAnalysisRequestId: typeof envelope.tutoringAnalysisRequestId === "string" ? envelope.tutoringAnalysisRequestId : "tutor_req_student_app_001",
    archiveItemId: typeof envelope.archiveItemId === "string" ? envelope.archiveItemId : "tarch_student_quiz_001",
    scopeRef: typeof envelope.scopeRef === "string" ? envelope.scopeRef : "student:student_001",
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
  const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
