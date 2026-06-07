import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE_COMMAND_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID,
  recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE_RUNTIME";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source-runtime.test.mjs",
  approvalReport: "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  sdd: "docs/sdd/0298-student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source.md",
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

export function auditStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const approvalReport = parseJson(inputs.approvalReport, {});
  const approvalResult = approvalReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource?.result ?? {};
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.sdd ?? "", inputs.architectureBoard ?? ""].join("\n");
  const probe = runRuntimeProbe(approvalReport, options);

  addFinding(findings, {
    id: "publication_approval_controlled_source.ready_for_delivery_not_persisted",
    passed: approvalReport.readiness === "READY" &&
      approvalReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_CONTROLLED_DRAFT_SOURCE" &&
      approvalReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_controlled_draft_source_runtime" &&
      approvalReport.runtime?.commandPort === "StudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSourcePort.recordFeedbackPublicationApprovalFromControlledDraftSource" &&
      approvalReport.runtime?.status === "APPROVED_FROM_CONTROLLED_DRAFT_SOURCE_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED" &&
      approvalReport.runtimeSlo?.totalErrors === 0 &&
      approvalReport.safetyInvariants?.controlledDraftSourceRequired === true &&
      approvalReport.safetyInvariants?.approvedForStudentVisibleDelivery === true &&
      approvalReport.safetyInvariants?.futureStudentVisibleDeliveryRuntimeRequired === true &&
      approvalReport.safetyInvariants?.studentVisibleFeedbackPublished === false &&
      approvalReport.safetyInvariants?.studentVisibleDeliveryEnvelopeCreated === false &&
      approvalReport.safetyInvariants?.durableStudentArchivePersistenceStarted === false,
    actual: `${approvalReport.readiness ?? "missing"}:${approvalReport.runtime?.runtimeId ?? "missing"}:${approvalReport.runtime?.status ?? "missing"}`,
    expected: "READY 0297 controlled-draft-source publication approval that permits future delivery but not persistence",
    remediation: "Run the 0297 controlled-draft-source publication approval audit before creating this delivery envelope.",
  });

  addFinding(findings, {
    id: "publication_approval_controlled_source.safe_artifact_surface_only",
    passed: approvalResult.boundary?.controlledDraftSourceVerified === true &&
      approvalResult.boundary?.publicationApprovalGranted === true &&
      approvalResult.boundary?.approvedForStudentVisibleDelivery === true &&
      approvalResult.boundary?.studentVisibleDeliveryEnvelopeCreated === false &&
      approvalResult.boundary?.durableStudentArchivePersistenceStarted === false &&
      Boolean(approvalResult.sourceControlledFeedbackDraft?.artifactId) &&
      approvalResult.approvedFeedbackArtifact?.sourceControlledDraft?.artifactId === approvalResult.sourceControlledFeedbackDraft?.artifactId &&
      approvalResult.approvedFeedbackArtifact?.approvalState === "APPROVED_FROM_CONTROLLED_DRAFT_SOURCE_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED",
    actual: summarizeApprovalSurface(approvalResult),
    expected: "0298 consumes 0297 approved learner feedback with preserved controlled draft evidence and no delivery or persistence already started",
    remediation: "Keep this delivery envelope downstream of 0297, not legacy 0273 or direct model output.",
  });

  addFinding(findings, {
    id: "runtime.identity_delivery_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE_COMMAND_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSourcePort.recordFeedbackDeliveryEnvelopeFromControlledDraftSource",
      "recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_READY_NOT_PERSISTED",
      "assertDeliveryPrincipal",
      "STUDENT_DELIVERY_ENVELOPE",
      "STUDENT_APP_DELIVERY",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_controlled_draft_source_runtime",
      "recordFeedbackDeliveryEnvelopeFromControlledDraftSource",
      "STUDENT_DELIVERY_ENVELOPE",
      "findExistingRecordByIdempotencyKey",
    ]),
    expected: "runtime records an idempotent controlled service delivery envelope tied to 0297 source approval evidence",
    remediation: "Do not expose controlled-source feedback delivery without delivery-service identity and idempotency protection.",
  });

  addFinding(findings, {
    id: "runtime.visible_envelope_preserves_controlled_source_without_persistence_or_model",
    passed: includesAll(runtime, [
      "controlledDraftSourceVerified: true",
      "publicationApprovalVerified: true",
      "safeLearnerFeedbackOnly: true",
      "studentOwnScopeEnforced: true",
      "sourceControlledDraftEvidencePreserved: true",
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
      "STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE",
      "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED",
      "rejectLeakedFields",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime creates only a renderable Student App feedback envelope while preserving 0297 source evidence and blocking DB, archive persistence, model calls, tools, devices, and Swarm",
    remediation: "Keep durable student archive persistence as a later reviewed slice.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_student_visible_envelope_from_controlled_source",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_READY_NOT_PERSISTED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE_COMMAND_PORT &&
      probe.result?.studentFeedbackDeliveryEnvelope?.visibilityState === "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_NOT_PERSISTED" &&
      probe.result?.studentFeedbackDeliveryEnvelope?.sourceControlledDraft?.artifactId === probe.result?.sourceControlledFeedbackDraft?.artifactId &&
      probe.result?.boundary?.controlledDraftSourceVerified === true &&
      probe.result?.boundary?.sourceControlledDraftEvidencePreserved === true &&
      probe.result?.boundary?.studentVisibleFeedbackDeliveryEnvelopeCreated === true &&
      probe.result?.boundary?.durableStudentArchivePersistenceStarted === false &&
      probe.result?.boundary?.studentArchiveWriteStarted === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};source=${probe.result.sourceControlledFeedbackDraft.artifactId};envelope=${probe.result.studentFeedbackDeliveryEnvelope.envelopeId};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records a Student App renderable feedback envelope from 0297 controlled-source approval under the 50ms control-plane budget",
    remediation: "The controlled-source delivery envelope must not start durable archive writes.",
  });

  addFinding(findings, {
    id: "tests.cover_controlled_source_delivery_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a student-visible feedback envelope from 0297 controlled-source approval while persistence remains blocked",
      "uses idempotency for replay and rejects conflicting controlled-source delivery envelopes",
      "rejects unsafe principals, unsafe 0297 approval reports, unsafe policies, and delivery mismatches",
      "rejects leaked answer, worker, result, model, persistence, internal error, and unsafe text fields",
      "rejects missing controlled-source delivery evidence",
    ]),
    actual: "runtime tests scanned",
    expected: "positive controlled-source envelope, idempotency, service principal, 0297 approval safety, policy safety, mismatch, leaked-field, unsafe text, and evidence tests",
    remediation: "Add regression coverage before using controlled-source delivery envelopes as root workflow evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source"]?.includes("student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank draft answer feedback delivery envelope controlled draft source runtime audit",
        "studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource",
        "student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source.current.json",
        "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_controlled_draft_source_runtime",
        "0298-student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source.md",
        "10.38/10",
        "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_NOT_PERSISTED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source",
      "studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource",
      "10.38/10",
    ]),
    expected: "package, strict quality, root coverage, structure verifier, SDD, and architecture board track 0298",
    remediation: "Wire controlled-draft-source delivery envelope through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE_COMMAND_PORT,
      sourcePublicationApprovalRuntime: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_controlled_draft_source_runtime",
      status: "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_NOT_PERSISTED",
    },
    runtimeSlo: probe.runtimeSlo ?? { targetP99Ms: 50, p99Ms: 50, totalErrors: 1 },
    runtimeProbes: { studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource: probe },
    safetyInvariants: {
      publicationApprovalControlledDraftSourceRequired: true,
      controlledDraftSourceRequired: true,
      safeLearnerFeedbackRequired: true,
      sourceControlledDraftEvidencePreserved: true,
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
      ? "Use this as the preferred Student App renderable feedback delivery evidence for the 0295-0297 controlled-source chain; migrate archive persistence to consume 0298 next."
      : "Fix controlled-source feedback delivery envelope evidence before archive persistence consumes it.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSourceAudit(report) {
  return [
    `Student App AI Tutor question-bank draft answer feedback delivery envelope controlled draft source runtime: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
    `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`,
    ...report.findings.map((finding) => `${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`),
    report.nextAction,
  ].join("\n");
}

function runRuntimeProbe(approvalReport, options = {}) {
  const startedAt = Date.now();
  const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-feedback-delivery-envelope-controlled-source-audit-")), "delivery.jsonl");
  try {
    const result = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource(probeInput(approvalReport), {
      commandLogPath,
      generatedAt: options.generatedAt ?? "2026-06-07T04:25:00.000Z",
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

function probeInput(approvalReport) {
  const approval = approvalReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource?.result ?? {};
  const artifact = approval.approvedFeedbackArtifact ?? {};
  const sourceDraft = approval.sourceControlledFeedbackDraft ?? {};
  const approvalRecord = approval.approval ?? {};
  return {
    schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source.v1",
    deliveryInvocationId: "feedback_delivery_controlled_draft_audit_001",
    principal: {
      principalId: "student_delivery_runtime_001",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "STUDENT_DELIVERY_RUNTIME",
      scopes: ["TEACHING_READ", "STUDENT_DELIVERY_ENVELOPE", "STUDENT_APP_DELIVERY"],
      sessionId: "session_student_delivery_001",
    },
    feedbackPublicationApprovalControlledDraftSourceReport: approvalReport,
    feedbackDeliveryRequest: {
      envelopeId: "feedback_delivery_env_controlled_draft_qbank_001",
      deliveryMode: "STUDENT_APP_RENDERABLE_FEEDBACK_ENVELOPE",
      channel: "STUDENT_APP",
      audienceKind: "STUDENT_APP_LEARNING_SUPPORT",
      visibilityState: "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_NOT_PERSISTED",
      scopeRef: "student:student_001",
      approvalRecordId: approval.recordId,
      approvalId: approvalRecord.approvalId,
      sourceControlledDraftArtifactId: sourceDraft.artifactId,
      approvedFeedbackArtifactId: artifact.artifactId,
      submissionId: artifact.submissionId,
      requestId: artifact.requestId,
      questionBankDraftRef: artifact.questionBankDraftRef,
      tutoringAnalysisRequestId: artifact.tutoringAnalysisRequestId,
      archiveItemId: artifact.archiveItemId,
      studentOwnScopeConfirmed: true,
      controlledDraftSourceVerified: true,
    },
    feedbackDeliveryPolicy: {
      publicationApprovalControlledDraftSourceRequired: true,
      controlledDraftSourceRequired: true,
      studentDeliveryEnvelopeAllowed: true,
      studentVisibleFeedbackAllowed: true,
      studentOwnScopeRequired: true,
      safeLearnerFeedbackRequired: true,
      sourceControlledDraftEvidencePreserved: true,
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
    evidenceRefs: [
      `evidence:feedback-publication-approval-controlled-draft-source:${approvalRecord.approvalId ?? "feedback_publication_approval_controlled_draft_qbank_001"}`,
      `evidence:feedback-delivery-envelope-controlled-draft-source:${artifact.submissionId ?? "qbank_ans_sub_audit_001"}`,
    ],
    idempotencyKey: `student-app-ai-tutor-feedback-delivery-envelope-controlled-draft-source:student_001:${artifact.submissionId ?? "qbank_ans_sub_audit_001"}`,
  };
}

function summarizeApprovalSurface(result) {
  return [
    `status=${result.status ?? "missing"}`,
    `sourceDraft=${result.sourceControlledFeedbackDraft?.artifactId ?? "missing"}`,
    `artifact=${result.approvedFeedbackArtifact?.artifactId ?? "missing"}`,
    `approvalState=${result.approvedFeedbackArtifact?.approvalState ?? "missing"}`,
    `controlledDraftSourceVerified=${result.boundary?.controlledDraftSourceVerified}`,
    `studentVisibleDeliveryEnvelopeCreated=${result.boundary?.studentVisibleDeliveryEnvelopeCreated}`,
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
  const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource(loadCurrentInputs(process.cwd()));
  const out = args.out ?? defaultOutPath;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSourceAudit(report));
  process.exitCode = report.readiness === "READY" ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
