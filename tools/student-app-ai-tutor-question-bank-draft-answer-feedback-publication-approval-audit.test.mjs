import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApproval,
  formatStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-audit.mjs";

describe("Student App AI Tutor question-bank draft answer feedback publication approval audit", () => {
  it("passes when publication approval stays behind reviewed feedback and before student delivery", () => {
    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApproval(currentInputs(), {
      generatedAt: "2026-06-06T12:35:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_RUNTIME");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApproval.result;
    assert.equal(result.approvedFeedbackArtifact.approvalState, "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED");
    assert.equal(result.boundary.publicationApprovalGranted, true);
    assert.equal(result.boundary.studentVisibleFeedbackPublished, false);
    assert.equal(result.boundary.studentVisibleDeliveryEnvelopeCreated, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalAudit(report), /publication approval runtime: READY/u);
  });

  it("fails when reviewed feedback evidence is missing or unsafe", () => {
    const inputs = currentInputs();
    const reviewed = JSON.parse(inputs.reviewedFeedbackReport);
    reviewed.runtime.status = "PUBLISHED";
    inputs.reviewedFeedbackReport = JSON.stringify(reviewed);

    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApproval(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "reviewed_feedback.ready_not_published").passed, false);
  });

  it("fails when runtime claims delivery, persistence, model work, transport, or leaked fields", () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nstudentVisibleFeedbackPublished: true\nstudentVisibleDeliveryEnvelopeCreated: true\ndurableStudentArchivePersistenceStarted: true\nmodelInferenceAllowed: true\nexecuteHttpRequestAllowed: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApproval(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the Student App publication approval budget", () => {
    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApproval(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when root hooks, structure, SDD, or board omit the runtime", () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApproval", "studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifact");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("feedback-publication-approval", "reviewed-feedback-artifact");
    inputs.sdd = "Student App AI Tutor question-bank draft answer reviewed feedback artifact";
    inputs.architectureBoard = "Student App AI Tutor question-bank draft answer reviewed feedback artifact 10.12/10";

    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApproval(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
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
    ].join("\n"),
    runtimeTest: [
      "records publication approval while keeping delivery, persistence, and publication blocked",
      "uses idempotency for replay and rejects conflicting publication approval input",
      "rejects unauthorized approvers, unsafe reviewed artifacts, unsafe policy, and direct delivery attempts",
      "rejects leaked answer, worker, result, model, delivery, internal error, and unsafe text fields",
    ].join("\n"),
    reviewedFeedbackReport: JSON.stringify(reviewedFeedbackReport()),
    reviewedFeedbackRuntime: "READY_NOT_PUBLISHED learnerFeedback answerKeyRemoved workerMetadataRemoved rawModelOutputRemoved internalErrorsRemoved publicationApprovalRequired studentVisibleFeedbackPublished: false modelInferenceStarted: false",
    reviewedFeedbackAudit: "READY_NOT_PUBLISHED learnerFeedback answerKeyRemoved rawModelOutputRemoved publicationApprovalRequired",
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval": "node tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft answer feedback publication approval runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApproval\nstudent-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval.current.json\nstudent_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_runtime",
    verifyStructure: "0273-student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval.md\nstudent-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-runtime.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-audit.test.mjs",
    sdd: "0273 Student App AI Tutor question-bank draft answer feedback publication approval APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED",
    architectureBoard: "10.13/10 Student App AI Tutor question-bank draft answer feedback publication approval APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED",
  };
}

function reviewedFeedbackReport() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_RUNTIME",
    runtime: {
      runtimeId: "student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_runtime",
      status: "READY_NOT_PUBLISHED",
    },
    safetyInvariants: {
      feedbackPublicationPrecheckRequired: true,
      safeStudentResultRequired: true,
      humanReviewRequired: true,
      feedbackArtifactRecorded: true,
      publicationApprovalRequired: true,
      studentVisibleFeedbackAllowed: false,
      answerKeyDisclosureAllowed: false,
      workerMetadataDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      modelInferenceAllowed: false,
    },
    runtimeProbes: {
      studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifact: {
        result: {
          recordId: "student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_001",
          runtimeId: "student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_runtime",
          status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_READY_NOT_PUBLISHED",
          reviewInvocationId: "feedback_artifact_review_001",
          reviewedFeedbackArtifact: {
            artifactId: "feedback_artifact_qbank_001",
            artifactKind: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_ANSWER_REVIEWED_FEEDBACK",
            submissionId: "qbank_ans_sub_feedback_001",
            requestId: "grading_req_feedback_001",
            questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
            tutoringAnalysisRequestId: "tutor_req_student_app_001",
            archiveItemId: "tarch_student_quiz_001",
            audience: "STUDENT_APP_LEARNING_SUPPORT",
            visibilityState: "REVIEWED_NOT_PUBLISHED",
            scoreSummary: "Score 93. The student can compare simple fractions.",
            learnerFeedback: {
              summary: "You understand the main comparison idea, but one fraction-order step still needs practice.",
              encouragement: "Keep the denominator comparison habit and slow down on the final ordering step.",
              nextSteps: ["Review how to compare fractions with unlike denominators.", "Try three short practice questions before the next quiz."],
              misconceptionTags: ["fraction-order"],
              practiceSuggestions: ["Practice two visual fraction bar questions."],
            },
            review: {
              reviewId: "feedback_review_001",
              reviewerPrincipalId: "teacher_001",
              reviewedAt: "2026-06-06T12:18:00.000Z",
              humanReviewed: true,
              ageAppropriate: true,
              studentOwnScopeConfirmed: true,
              answerKeyRemoved: true,
              workerMetadataRemoved: true,
              rawModelOutputRemoved: true,
              internalErrorsRemoved: true,
              publicationApprovalRequired: true,
              publicationApproved: false,
            },
            publicationApproved: false,
            studentVisibleFeedbackPublished: false,
          },
          boundary: {
            humanReviewCompleted: true,
            publicationApprovalRequired: true,
            publicationApproved: false,
            studentVisibleFeedbackPublished: false,
          },
          evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-input-hash:abc"],
        },
      },
    },
  };
}
