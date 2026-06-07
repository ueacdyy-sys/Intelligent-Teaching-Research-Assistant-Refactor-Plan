import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand,
  formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-audit.mjs";

describe("Student App AI Tutor question-bank draft answer feedback archive persistence command audit", () => {
  it("passes when archive persistence records a command after delivery without durable commit", () => {
    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand(currentInputs(), {
      generatedAt: "2026-06-06T13:30:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_RUNTIME");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_persistence_command_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand.result;
    assert.equal(result.feedbackArchivePersistenceCommand.commitState, "NOT_COMMITTED_TO_STUDENT_ARCHIVE");
    assert.equal(result.boundary.feedbackArchivePersistenceCommandRecorded, true);
    assert.equal(result.boundary.durableStudentArchiveCommitStarted, false);
    assert.equal(result.boundary.studentArchivePersisted, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandAudit(report), /archive persistence command runtime: READY/u);
  });

  it("fails when delivery envelope evidence is missing or unsafe", () => {
    const inputs = currentInputs();
    const delivery = JSON.parse(inputs.deliveryReport);
    delivery.runtime.status = "PERSISTED";
    inputs.deliveryReport = JSON.stringify(delivery);

    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "delivery_envelope.ready_not_persisted").passed, false);
  });

  it("fails when runtime claims commit, DB writes, model work, transport, tools, or leaked fields", () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\ndurableStudentArchiveCommitStarted: true\nstudentArchivePersisted: true\nmainDatabaseWriteStarted: true\nstudentArchiveWriteStarted: true\nmodelInferenceAllowed: true\nexecuteHttpRequestAllowed: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.command_without_commit_or_model").passed, false);
  });

  it("caps probe p99 at the Student App archive persistence command budget", () => {
    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when root hooks, structure, SDD, or board omit the runtime", () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand", "studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("feedback-archive-persistence-command", "feedback-delivery-envelope");
    inputs.sdd = "Student App AI Tutor question-bank draft answer feedback delivery envelope";
    inputs.architectureBoard = "Student App AI Tutor question-bank draft answer feedback delivery envelope 10.14/10";

    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
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
    ].join("\n"),
    runtimeTest: [
      "records an append-only feedback archive persistence command without durable commit",
      "uses idempotency for replay and rejects conflicting persistence commands",
      "rejects unsafe principals, unsafe delivery reports, unsafe policies, and mismatches",
      "rejects leaked answer, worker, result, model, commit, internal error, and unsafe text fields",
    ].join("\n"),
    deliveryReport: JSON.stringify(deliveryReport()),
    deliveryRuntime: "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED studentFeedbackDeliveryEnvelope learnerFeedback scoreSummary durableStudentArchivePersistenceStarted: false mainDatabaseWriteStarted: false studentArchiveWriteStarted: false",
    deliveryAudit: "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED studentFeedbackDeliveryEnvelope learnerFeedback scoreSummary",
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command": "node tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft answer feedback archive persistence command runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand\nstudent-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command.current.json\nstudent_app_ai_tutor_question_bank_draft_answer_feedback_archive_persistence_command_runtime",
    verifyStructure: "0275-student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command.md\nstudent-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-runtime.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-audit.test.mjs",
    sdd: "0275 Student App AI Tutor question-bank draft answer feedback archive persistence command PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
    architectureBoard: "10.15/10 Student App AI Tutor question-bank draft answer feedback archive persistence command PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
  };
}

function deliveryReport() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_RUNTIME",
    runtime: {
      runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_runtime",
      status: "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED",
    },
    safetyInvariants: {
      publicationApprovalRequired: true,
      safeLearnerFeedbackRequired: true,
      studentDeliveryEnvelopeAllowed: true,
      studentVisibleFeedbackAllowed: true,
      studentOwnScopeRequired: true,
      studentVisibleFeedbackDeliveryEnvelopeCreated: true,
      futureDurableArchivePersistenceReviewRequired: true,
      durableStudentArchivePersistenceStarted: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
      answerKeyDisclosureAllowed: false,
      workerMetadataDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      modelInferenceAllowed: false,
    },
    runtimeProbes: {
      studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope: {
        result: {
          recordId: "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_student_app_ai_tutor_feedback_delivery_envelope_student_001_qbank_ans_sub_feedback_001",
          runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_runtime",
          status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_READY_NOT_PERSISTED",
          deliveryInvocationId: "feedback_delivery_audit_001",
          sourcePublicationApproval: {
            runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_runtime",
            recordId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_001",
            approvalId: "feedback_publication_approval_qbank_001",
            approvedFeedbackArtifactId: "feedback_artifact_qbank_001",
          },
          studentFeedbackDeliveryEnvelope: {
            envelopeId: "feedback_delivery_env_qbank_001",
            envelopeKind: "STUDENT_APP_AI_TUTOR_FEEDBACK_DELIVERY_ENVELOPE",
            deliveryMode: "STUDENT_APP_RENDERABLE_FEEDBACK_ENVELOPE",
            channel: "STUDENT_APP",
            audience: "STUDENT_APP_LEARNING_SUPPORT",
            visibilityState: "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED",
            deliveryState: "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED",
            scopeRef: "student:student_001",
            approvalRecordId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_001",
            approvalId: "feedback_publication_approval_qbank_001",
            approvedFeedbackArtifactId: "feedback_artifact_qbank_001",
            submissionId: "qbank_ans_sub_feedback_001",
            requestId: "grading_req_feedback_001",
            questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
            tutoringAnalysisRequestId: "tutor_req_student_app_001",
            archiveItemId: "tarch_student_quiz_001",
            scoreSummary: "Score 93. The student can compare simple fractions.",
            learnerFeedback: {
              summary: "You understand the main comparison idea, but one fraction-order step still needs practice.",
              encouragement: "Keep the denominator comparison habit and slow down on the final ordering step.",
              nextSteps: ["Review how to compare fractions with unlike denominators.", "Try three short practice questions before the next quiz."],
              misconceptionTags: ["fraction-order"],
              practiceSuggestions: ["Practice two visual fraction bar questions."],
            },
            evidencePreserved: true,
            approvalPreserved: true,
            studentOwnScopeEnforced: true,
          },
          boundary: {
            studentVisibleFeedbackDeliveryEnvelopeCreated: true,
            studentVisibleFeedbackDelivered: true,
            studentOwnScopeEnforced: true,
            durableStudentArchivePersistenceStarted: false,
            mainDatabaseWriteStarted: false,
            studentArchiveWriteStarted: false,
          },
          evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-input-hash:abc"],
        },
      },
    },
  };
}
