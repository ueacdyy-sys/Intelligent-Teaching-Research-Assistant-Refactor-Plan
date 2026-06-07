import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope,
  formatStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-audit.mjs";

describe("Student App AI Tutor question-bank draft answer feedback delivery envelope audit", () => {
  it("passes when delivery creates a student-visible envelope after approval without persistence", () => {
    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope(currentInputs(), {
      generatedAt: "2026-06-06T13:10:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_RUNTIME");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope.result;
    assert.equal(result.studentFeedbackDeliveryEnvelope.visibilityState, "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED");
    assert.equal(result.boundary.studentVisibleFeedbackDeliveryEnvelopeCreated, true);
    assert.equal(result.boundary.studentVisibleFeedbackPublished, true);
    assert.equal(result.boundary.durableStudentArchivePersistenceStarted, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeAudit(report), /delivery envelope runtime: READY/u);
  });

  it("fails when publication approval evidence is missing or unsafe", () => {
    const inputs = currentInputs();
    const approval = JSON.parse(inputs.approvalReport);
    approval.runtime.status = "READY_NOT_PUBLISHED";
    inputs.approvalReport = JSON.stringify(approval);

    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "publication_approval.ready_for_delivery_not_persisted").passed, false);
  });

  it("fails when runtime claims persistence, model work, transport, tools, or leaked fields", () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\ndurableStudentArchivePersistenceStarted: true\nmainDatabaseWriteStarted: true\nstudentArchiveWriteStarted: true\nmodelInferenceAllowed: true\nexecuteHttpRequestAllowed: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.visible_envelope_without_persistence_or_model").passed, false);
  });

  it("caps probe p99 at the Student App feedback delivery budget", () => {
    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when root hooks, structure, SDD, or board omit the runtime", () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope", "studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApproval");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("feedback-delivery-envelope", "feedback-publication-approval");
    inputs.sdd = "Student App AI Tutor question-bank draft answer feedback publication approval";
    inputs.architectureBoard = "Student App AI Tutor question-bank draft answer feedback publication approval 10.13/10";

    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
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
    ].join("\n"),
    runtimeTest: [
      "records a student-visible feedback envelope while keeping durable persistence blocked",
      "uses idempotency for replay and rejects conflicting delivery envelopes",
      "rejects unsafe principals, unapproved reports, unsafe policies, and delivery mismatches",
      "rejects leaked answer, worker, result, model, persistence, internal error, and unsafe text fields",
    ].join("\n"),
    approvalReport: JSON.stringify(approvalReport()),
    approvalRuntime: "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED approvedFeedbackArtifact learnerFeedback answerKeyDisclosureBlocked workerMetadataDisclosureBlocked rawModelOutputDisclosureBlocked internalErrorsDisclosureBlocked studentVisibleDeliveryEnvelopeCreated: false durableStudentArchivePersistenceStarted: false modelInferenceStarted: false",
    approvalAudit: "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED approvedFeedbackArtifact learnerFeedback",
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope": "node tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft answer feedback delivery envelope runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope\nstudent-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope.current.json\nstudent_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_runtime",
    verifyStructure: "0274-student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope.md\nstudent-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-runtime.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-audit.test.mjs",
    sdd: "0274 Student App AI Tutor question-bank draft answer feedback delivery envelope STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED",
    architectureBoard: "10.14/10 Student App AI Tutor question-bank draft answer feedback delivery envelope STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_NOT_PERSISTED",
  };
}

function approvalReport() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_RUNTIME",
    runtime: {
      runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_runtime",
      status: "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED",
    },
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
    runtimeProbes: {
      studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApproval: {
        result: {
          recordId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_student_app_ai_tutor_feedback_publication_approval_student_001_qbank_ans_sub_feedback_001",
          runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_runtime",
          status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED",
          approvalInvocationId: "feedback_publication_approval_audit_001",
          approval: {
            approvalId: "feedback_publication_approval_qbank_001",
            reviewerPrincipalId: "teacher_001",
            decision: "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY",
            reviewedAt: "2026-06-06T12:34:00.000Z",
            reviewedFeedbackArtifactId: "feedback_artifact_qbank_001",
            submissionId: "qbank_ans_sub_feedback_001",
            requestId: "grading_req_feedback_001",
            questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
            tutoringAnalysisRequestId: "tutor_req_student_app_001",
            archiveItemId: "tarch_student_quiz_001",
            learnerFeedbackReviewed: true,
            ageAppropriateConfirmed: true,
            studentOwnScopeConfirmed: true,
            answerKeyDisclosureBlocked: true,
            workerMetadataDisclosureBlocked: true,
            rawModelOutputDisclosureBlocked: true,
            internalErrorsDisclosureBlocked: true,
            futureStudentVisibleDeliveryRuntimeRequired: true,
          },
          approvedFeedbackArtifact: {
            artifactId: "feedback_artifact_qbank_001",
            artifactKind: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_ANSWER_REVIEWED_FEEDBACK",
            submissionId: "qbank_ans_sub_feedback_001",
            requestId: "grading_req_feedback_001",
            questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
            tutoringAnalysisRequestId: "tutor_req_student_app_001",
            archiveItemId: "tarch_student_quiz_001",
            audience: "STUDENT_APP_LEARNING_SUPPORT",
            previousVisibilityState: "REVIEWED_NOT_PUBLISHED",
            approvalState: "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED",
            scoreSummary: "Score 93. The student can compare simple fractions.",
            learnerFeedback: {
              summary: "You understand the main comparison idea, but one fraction-order step still needs practice.",
              encouragement: "Keep the denominator comparison habit and slow down on the final ordering step.",
              nextSteps: ["Review how to compare fractions with unlike denominators.", "Try three short practice questions before the next quiz."],
              misconceptionTags: ["fraction-order"],
              practiceSuggestions: ["Practice two visual fraction bar questions."],
            },
          },
          boundary: {
            publicationApprovalGranted: true,
            approvedForStudentVisibleDelivery: true,
            requiresFutureStudentVisibleDeliveryRuntime: true,
            studentVisibleFeedbackPublished: false,
            studentVisibleDeliveryEnvelopeCreated: false,
            durableStudentArchivePersistenceStarted: false,
          },
          evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-input-hash:abc"],
        },
      },
    },
  };
}
