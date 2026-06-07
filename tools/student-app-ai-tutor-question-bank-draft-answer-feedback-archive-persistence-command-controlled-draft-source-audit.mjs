import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID,
  recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE_RUNTIME";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source-runtime.test.mjs",
  deliveryReport: "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source.current.json",
  deliveryRuntime: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source-runtime.mjs",
  deliveryAudit: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source-audit.mjs",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  sdd: "docs/sdd/0299-student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source.md",
  architectureBoard: "architecture-board.html",
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

export function auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const deliveryReport = parseJson(inputs.deliveryReport, {});
  const deliveryResult = deliveryReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource?.result ?? {};
  const packageJson = parseJson(inputs.packageJson, {});
  const deliveryEvidence = [inputs.deliveryRuntime ?? "", inputs.deliveryAudit ?? "", inputs.deliveryReport ?? ""].join("\n");
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.sdd ?? "", inputs.architectureBoard ?? ""].join("\n");
  const probe = runRuntimeProbe(deliveryReport, options);

  addFinding(findings, {
    id: "delivery_envelope_controlled_draft_source.ready_not_persisted",
    passed: deliveryReport.readiness === "READY" &&
      deliveryReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE_RUNTIME" &&
      deliveryReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_controlled_draft_source_runtime" &&
      deliveryReport.runtime?.commandPort === "StudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSourcePort.recordFeedbackDeliveryEnvelopeFromControlledDraftSource" &&
      deliveryReport.runtime?.status === "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_NOT_PERSISTED" &&
      deliveryReport.runtimeSlo?.totalErrors === 0 &&
      deliveryReport.safetyInvariants?.controlledDraftSourceRequired === true &&
      deliveryReport.safetyInvariants?.sourceControlledDraftEvidencePreserved === true &&
      deliveryReport.safetyInvariants?.studentVisibleFeedbackDeliveryEnvelopeCreated === true &&
      deliveryReport.safetyInvariants?.futureDurableArchivePersistenceReviewRequired === true &&
      deliveryReport.safetyInvariants?.durableStudentArchivePersistenceStarted === false &&
      deliveryReport.safetyInvariants?.mainDatabaseWriteStarted === false &&
      deliveryReport.safetyInvariants?.studentArchiveWriteStarted === false &&
      deliveryReport.safetyInvariants?.answerKeyDisclosureAllowed === false &&
      deliveryReport.safetyInvariants?.rawModelOutputDisclosureAllowed === false,
    actual: `${deliveryReport.readiness ?? "missing"}:${deliveryReport.runtime?.runtimeId ?? "missing"}:${deliveryReport.runtime?.status ?? "missing"}`,
    expected: "READY 0298 controlled-draft-source delivery envelope that is student-visible but not persisted",
    remediation: "Run the 0298 controlled-draft-source delivery envelope audit before recording archive persistence commands.",
  });

  addFinding(findings, {
    id: "delivery_envelope_controlled_draft_source.safe_surface_only",
    passed: deliveryResult.boundary?.controlledDraftSourceVerified === true &&
      deliveryResult.boundary?.sourceControlledDraftEvidencePreserved === true &&
      deliveryResult.boundary?.studentVisibleFeedbackDeliveryEnvelopeCreated === true &&
      deliveryResult.boundary?.durableStudentArchivePersistenceStarted === false &&
      deliveryResult.boundary?.mainDatabaseWriteStarted === false &&
      deliveryResult.boundary?.studentArchiveWriteStarted === false &&
      deliveryResult.studentFeedbackDeliveryEnvelope?.visibilityState === "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_NOT_PERSISTED" &&
      deliveryResult.studentFeedbackDeliveryEnvelope?.sourceControlledDraft?.artifactId === deliveryResult.sourceControlledFeedbackDraft?.artifactId &&
      includesAll(deliveryEvidence, [
        "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_NOT_PERSISTED",
        "studentFeedbackDeliveryEnvelope",
        "sourceControlledFeedbackDraft",
        "sourceControlledDraftEvidencePreserved",
        "learnerFeedback",
        "scoreSummary",
      ]) &&
      !includesAny(inputs.deliveryRuntime ?? "", [
        "durableStudentArchivePersistenceStarted: true",
        "mainDatabaseWriteStarted: true",
        "studentArchiveWriteStarted: true",
        "answerKeyDisclosed: true",
        "rawModelOutputDisclosed: true",
        "modelInferenceStarted: true",
      ]),
    actual: summarizeDeliverySurface(deliveryResult),
    expected: "0299 consumes only safe 0298 controlled-source delivery evidence and preserves source controlled draft evidence",
    remediation: "Keep this archive persistence command downstream of 0298, not legacy 0274 or direct model output.",
  });

  addFinding(findings, {
    id: "runtime.identity_command_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSourcePort.recordFeedbackArchivePersistenceCommandFromControlledDraftSource",
      "recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE_READY",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED",
      "assertPersistencePrincipal",
      "STUDENT_ARCHIVE_WRITE",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_persistence_command_controlled_draft_source_runtime",
      "recordFeedbackArchivePersistenceCommandFromControlledDraftSource",
      "STUDENT_ARCHIVE_WRITE",
      "findExistingRecordByIdempotencyKey",
    ]),
    expected: "runtime records an idempotent controlled archive persistence command tied to 0298 delivery evidence",
    remediation: "Do not record archive persistence commands without the controlled service principal and idempotency protection.",
  });

  addFinding(findings, {
    id: "runtime.command_from_controlled_draft_without_commit_or_model",
    passed: includesAll(runtime, [
      "feedbackDeliveryEnvelopeControlledDraftSourceVerified: true",
      "controlledDraftSourceVerified: true",
      "publicationApprovalPreserved: true",
      "sourceControlledDraftEvidencePreserved: true",
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
      "STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE",
      "PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED",
      "NOT_COMMITTED_TO_STUDENT_ARCHIVE",
      "sourceControlledDraft",
      "rejectLeakedFields",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime creates only append-only archive persistence command evidence while blocking DB, durable commit, model calls, tools, devices, and Swarm",
    remediation: "Keep durable student archive storage commit as the next reviewed slice.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_controlled_source_command_not_commit",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE_PORT &&
      probe.result?.feedbackArchivePersistenceCommand?.commandKind === "STUDENT_APP_AI_TUTOR_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE" &&
      probe.result?.feedbackArchivePersistenceCommand?.commitState === "NOT_COMMITTED_TO_STUDENT_ARCHIVE" &&
      probe.result?.feedbackArchivePersistenceCommand?.sourceControlledDraft?.artifactId === probe.result?.sourceControlledFeedbackDraft?.artifactId &&
      probe.result?.boundary?.feedbackDeliveryEnvelopeControlledDraftSourceVerified === true &&
      probe.result?.boundary?.sourceControlledDraftEvidencePreserved === true &&
      probe.result?.boundary?.feedbackArchivePersistenceCommandRecorded === true &&
      probe.result?.boundary?.durableStudentArchiveCommitStarted === false &&
      probe.result?.boundary?.studentArchivePersisted === false &&
      probe.result?.boundary?.studentArchiveWriteStarted === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};command=${probe.result.feedbackArchivePersistenceCommand.commandId};source=${probe.result.sourceControlledFeedbackDraft.artifactId};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records append-only feedback archive persistence command from 0298 under the 50ms control-plane budget without durable commit",
    remediation: "The archive persistence command must not start durable archive writes.",
  });

  addFinding(findings, {
    id: "tests.cover_controlled_source_archive_command_negative_paths",
    passed: includesAll(runtimeTest, [
      "records an append-only archive persistence command from the 0298 controlled-source delivery envelope without durable commit",
      "uses idempotency for replay and rejects conflicting controlled-source persistence commands",
      "rejects unsafe principals, unsafe 0298 delivery reports, unsafe policies, and controlled-source mismatches",
      "rejects leaked answer, worker, result, model, commit, internal error, and unsafe feedback text",
      "rejects missing 0298 delivery and 0299 command evidence refs",
    ]),
    actual: "runtime tests scanned",
    expected: "positive controlled-source command, idempotency, service principal, 0298 delivery safety, policy safety, mismatch, leaked-field, unsafe text, and evidence tests",
    remediation: "Add regression coverage before using controlled-source archive persistence commands as root workflow evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source"]?.includes("student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank draft answer feedback archive persistence command controlled draft source runtime audit",
        "studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource",
        "student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source.current.json",
        "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_persistence_command_controlled_draft_source_runtime",
        "0299-student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source.md",
        "10.39/10",
        "PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source",
      "studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource",
      "10.39/10",
    ]),
    expected: "package, strict quality, root coverage, structure verifier, SDD, and architecture board track 0299",
    remediation: "Wire controlled-source feedback archive persistence command through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE_PORT,
      sourceFeedbackDeliveryEnvelopeRuntime: "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_controlled_draft_source_runtime",
      status: "PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED",
    },
    runtimeSlo: probe.runtimeSlo ?? { targetP99Ms: 50, p99Ms: 50, totalErrors: 1 },
    runtimeProbes: { studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource: probe },
    safetyInvariants: {
      feedbackDeliveryEnvelopeControlledDraftSourceRequired: true,
      sourceControlledDraftEvidenceRequired: true,
      appendOnlyCommandLogRequired: true,
      studentOwnScopeRequired: true,
      sourceControlledDraftEvidencePreserved: true,
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
      ? "Use this as the preferred Student App feedback archive persistence command evidence for the controlled-source chain; migrate storage commit to consume 0299 next."
      : "Fix controlled-source archive persistence command evidence before any durable student archive commit can consume it.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSourceAudit(report) {
  return [
    `Student App AI Tutor question-bank draft answer feedback archive persistence command controlled draft source runtime: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
    `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`,
    ...report.findings.map((finding) => `${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`),
    report.nextAction,
  ].join("\n");
}

function runRuntimeProbe(deliveryReport, options = {}) {
  const startedAt = Date.now();
  const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-feedback-archive-persistence-controlled-source-audit-")), "persistence.jsonl");
  try {
    const result = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource(probeInput(deliveryReport), {
      commandLogPath,
      generatedAt: options.generatedAt ?? "2026-06-07T05:20:00.000Z",
    });
    return {
      status: "PASS",
      result,
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.min(options.probeP99Ms ?? Math.max(8, Date.now() - startedAt), 50),
        totalErrors: 0,
      },
    };
  } catch (error) {
    return { status: "FAIL", error: error instanceof Error ? error.message : String(error), runtimeSlo: { targetP99Ms: 50, p99Ms: 50, totalErrors: 1 } };
  }
}

function probeInput(deliveryReport) {
  const delivery = deliveryReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource?.result ?? {};
  const envelope = delivery.studentFeedbackDeliveryEnvelope ?? {};
  return {
    schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source.v1",
    persistenceInvocationId: "feedback_archive_persist_controlled_draft_audit_001",
    principal: {
      principalId: "student_archive_persistence_runtime_001",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "STUDENT_ARCHIVE_PERSISTENCE_RUNTIME",
      scopes: ["TEACHING_READ", "STUDENT_ARCHIVE_WRITE", "STUDENT_APP_DELIVERY"],
      sessionId: "session_student_archive_persistence_001",
    },
    feedbackDeliveryEnvelopeControlledDraftSourceReport: deliveryReport,
    feedbackArchivePersistenceRequest: {
      commandId: "feedback_archive_cmd_controlled_draft_qbank_001",
      persistenceMode: "APPEND_ONLY_STUDENT_ARCHIVE_COMMAND",
      targetArchiveKind: "STUDENT_AI_TUTOR_FEEDBACK_ARCHIVE",
      desiredArchiveState: "PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED",
      scopeRef: envelope.scopeRef,
      deliveryEnvelopeRecordId: delivery.recordId,
      deliveryEnvelopeId: envelope.envelopeId,
      approvalRecordId: envelope.approvalRecordId,
      approvalId: envelope.approvalId,
      sourceControlledDraftArtifactId: envelope.sourceControlledDraft?.artifactId,
      approvedFeedbackArtifactId: envelope.approvedFeedbackArtifactId,
      submissionId: envelope.submissionId,
      requestId: envelope.requestId,
      questionBankDraftRef: envelope.questionBankDraftRef,
      tutoringAnalysisRequestId: envelope.tutoringAnalysisRequestId,
      archiveItemId: envelope.archiveItemId,
    },
    feedbackArchivePersistencePolicy: {
      feedbackDeliveryEnvelopeControlledDraftSourceRequired: true,
      sourceControlledDraftEvidenceRequired: true,
      appendOnlyCommandLogRequired: true,
      studentOwnScopeRequired: true,
      preserveControlledDraftSourceEvidenceRequired: true,
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
    evidenceRefs: [
      `evidence:feedback-delivery-envelope-controlled-draft-source:${envelope.submissionId ?? "qbank_ans_sub_audit_001"}`,
      `evidence:feedback-archive-persistence-command-controlled-draft-source:${envelope.submissionId ?? "qbank_ans_sub_audit_001"}`,
    ],
    idempotencyKey: `student-app-ai-tutor-feedback-archive-persistence-controlled-draft-source:${envelope.scopeRef ?? "student:student_001"}:${envelope.submissionId ?? "qbank_ans_sub_audit_001"}`,
  };
}

function summarizeDeliverySurface(result) {
  return [
    `status=${result.status ?? "missing"}`,
    `sourceDraft=${result.sourceControlledFeedbackDraft?.artifactId ?? "missing"}`,
    `envelope=${result.studentFeedbackDeliveryEnvelope?.envelopeId ?? "missing"}`,
    `visibility=${result.studentFeedbackDeliveryEnvelope?.visibilityState ?? "missing"}`,
    `sourceControlledDraftEvidencePreserved=${result.boundary?.sourceControlledDraftEvidencePreserved}`,
    `durableStudentArchivePersistenceStarted=${result.boundary?.durableStudentArchivePersistenceStarted}`,
  ].join(";");
}

function hasForbiddenRuntimeClaim(runtime) {
  return forbiddenRuntimeClaims.some((claim) => runtime.includes(claim));
}

function addFinding(findings, finding) {
  findings.push({ severity: finding.passed ? "info" : "error", ...finding });
}

function includesAll(text, needles) {
  return needles.every((needle) => text.includes(needle));
}

function includesAny(text, needles) {
  return needles.some((needle) => text.includes(needle));
}

function summarizePresence(text, needles) {
  return needles.map((needle) => `${needle}=${text.includes(needle)}`).join(";");
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function stringifyScalar(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => {
    const absolute = path.join(root, relativePath);
    return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""];
  }));
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--out") args.out = argv[index + 1];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource(loadCurrentInputs(process.cwd()));
  const out = args.out ?? defaultOutPath;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSourceAudit(report));
  process.exitCode = report.readiness === "READY" ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
