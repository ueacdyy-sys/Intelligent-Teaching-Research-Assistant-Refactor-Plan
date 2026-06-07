import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource,
  formatStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSourceAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source-audit.mjs";

describe("Student App AI Tutor question-bank draft answer feedback publication approval controlled draft source audit", () => {
  it("passes when runtime approves a 0296 controlled-draft-sourced reviewed artifact", () => {
    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource(currentInputs(), {
      generatedAt: "2026-06-07T04:05:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_CONTROLLED_DRAFT_SOURCE");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_controlled_draft_source_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource.result;
    assert.equal(result.boundary.controlledDraftSourceVerified, true);
    assert.equal(result.boundary.studentVisibleFeedbackPublished, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSourceAudit(report), /controlled draft source runtime: READY/u);
  });

  it("fails when 0296 source evidence is not ready for publication approval", () => {
    const inputs = currentInputs();
    const source = JSON.parse(inputs.sourceReport);
    source.readiness = "NEEDS_REMEDIATION";
    source.safetyInvariants.controlledDraftSourceVerified = false;
    inputs.sourceReport = JSON.stringify(source);

    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.reviewed_feedback_artifact_controlled_draft_source_ready").passed, false);
  });

  it("fails when runtime claims delivery, persistence, infrastructure, model, or Swarm work", () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nstudentVisibleFeedbackPublished: true\nstudentVisibleDeliveryEnvelopeCreated: true\nexecuteHttpRequestAllowed: true\nmodelInferenceStarted: true\nswarmAllowed: true\n`;

    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the Student App control-plane budget", () => {
    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when package, quality, root coverage, structure, SDD, or board omit the runtime", () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.qualityGate = "";
    inputs.rootWorkflowCoverage = "";
    inputs.verifyStructure = "";
    inputs.sdd = "";
    inputs.architectureBoard = "";

    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_CONTROLLED_DRAFT_SOURCE_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSourcePort.recordFeedbackPublicationApprovalFromControlledDraftSource",
      "recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVED_FROM_CONTROLLED_DRAFT_SOURCE_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED",
      "assertApproverPrincipal",
      "FEEDBACK_PUBLISH_APPROVE",
      "ADMIN_SYSTEM",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "reviewedFeedbackArtifactVerified: true",
      "controlledDraftSourceVerified: true",
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
      "records publication approval from a controlled-draft-sourced reviewed artifact while delivery remains blocked",
      "uses idempotency for replay and rejects conflicting controlled-source approvals",
      "rejects unsafe approvers, unsafe 0296 source reports, unsafe policies, and direct delivery attempts",
      "rejects leaked fields, unsafe text, and missing controlled-source approval evidence",
    ].join("\n"),
    sourceReport: JSON.stringify(sourceReport()),
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source": "node tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft answer feedback publication approval controlled draft source runtime audit",
    rootWorkflowCoverage: [
      "studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource",
      "student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source.current.json",
      "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_controlled_draft_source_runtime",
    ].join("\n"),
    verifyStructure: [
      "0297-student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source.md",
      "student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source-runtime.mjs",
      "student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source-audit.test.mjs",
    ].join("\n"),
    sdd: "0297 Student App AI Tutor question-bank draft answer feedback publication approval controlled draft source",
    architectureBoard: "10.37/10 Student App AI Tutor question-bank draft answer feedback publication approval controlled draft source STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVED_FROM_CONTROLLED_DRAFT_SOURCE_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED",
  };
}

function sourceReport() {
  return {
    generatedAt: "2026-06-07T03:38:01.758Z",
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_CONTROLLED_DRAFT_SOURCE",
    runtime: {
      runtimeId: "student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_controlled_draft_source_runtime",
      commandPort: "StudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSourcePort.recordReviewedFeedbackArtifactFromControlledDraft",
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_FROM_CONTROLLED_DRAFT_RECORDED",
    },
    runtimeSlo: { targetP99Ms: 50, p99Ms: 8, totalErrors: 0 },
    runtimeProbes: {
      studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource: {
        result: {
          schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source-recorded.v1",
          recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_CONTROLLED_DRAFT_SOURCE",
          recordId: "student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_controlled_draft_source_001",
          runtimeId: "student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_controlled_draft_source_runtime",
          commandPort: "StudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSourcePort.recordReviewedFeedbackArtifactFromControlledDraft",
          status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_FROM_CONTROLLED_DRAFT_RECORDED",
          reviewInvocationId: "feedback_controlled_draft_review_audit_001",
          sourceControlledFeedbackDraft: {
            runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_controlled_draft_runtime",
            recordId: "student_app_ai_tutor_question_bank_draft_answer_feedback_controlled_draft_001",
            artifactId: "feedback_controlled_draft_qbank_ans_sub_audit_001",
            generationAttemptId: "feedback_generation_attempt_audit_001",
            executionState: "CONTROLLED_FEEDBACK_DRAFT_RECORDED_NOT_REVIEWED",
            inputHash: "1434b140c64d3a931fa5941a3eeba6a10ef15e4e89172223a475bde12227576c",
          },
          studentScoringResult: {
            submissionId: "qbank_ans_sub_audit_001",
            requestId: "grading_req_qbank_answer_audit_001",
            questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
            tutoringAnalysisRequestId: "tutor_req_student_app_001",
            archiveItemId: "tarch_student_quiz_001",
            status: "SUCCEEDED",
            scoreSummary: "Question-bank answer score 16/20 (80%, PROFICIENT); items=2; artifact=qbank_answer_scoring_artifact_001",
          },
          reviewedFeedbackArtifact: {
            artifactId: "feedback_artifact_qbank_controlled_draft_audit_001",
            artifactKind: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_ANSWER_REVIEWED_FEEDBACK",
            sourceControlledDraft: {
              runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_controlled_draft_runtime",
              recordId: "student_app_ai_tutor_question_bank_draft_answer_feedback_controlled_draft_001",
              artifactId: "feedback_controlled_draft_qbank_ans_sub_audit_001",
              generationAttemptId: "feedback_generation_attempt_audit_001",
              inputHash: "1434b140c64d3a931fa5941a3eeba6a10ef15e4e89172223a475bde12227576c",
              draftFeedbackHash: "9c4b336a359fba280a950e7a6154bc0c2c5908a87753561ab8aa85f18a2bec47",
            },
            submissionId: "qbank_ans_sub_audit_001",
            requestId: "grading_req_qbank_answer_audit_001",
            questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
            tutoringAnalysisRequestId: "tutor_req_student_app_001",
            archiveItemId: "tarch_student_quiz_001",
            audience: "STUDENT_APP_LEARNING_SUPPORT",
            visibilityState: "REVIEWED_NOT_PUBLISHED",
            scoreSummary: "Question-bank answer score 16/20 (80%, PROFICIENT); items=2; artifact=qbank_answer_scoring_artifact_001",
            learnerFeedback: {
              summary: "You handled the main skill well and should review one related point before the next practice.",
              encouragement: "Keep explaining your thinking step by step.",
              nextSteps: ["Review the missed concept with your teacher.", "Try one similar practice item after review."],
              misconceptionTags: ["fraction-comparison"],
              practiceSuggestions: ["Use a number line for the next comparison exercise."],
            },
            review: {
              reviewId: "feedback_review_audit_001",
              reviewerPrincipalId: "teacher_001",
              reviewedAt: "2026-06-07T03:38:00.000Z",
              humanReviewed: true,
              controlledDraftSourceVerified: true,
              ageAppropriate: true,
              studentOwnScopeConfirmed: true,
              answerKeyRemoved: true,
              workerMetadataRemoved: true,
              rawModelOutputRemoved: true,
              resultRefRemoved: true,
              internalErrorsRemoved: true,
              publicationApprovalRequired: true,
              publicationApproved: false,
            },
            reviewedFromControlledDraft: true,
            publicationApproved: false,
            studentVisibleFeedbackPublished: false,
          },
          boundary: {
            controlledFeedbackDraftSourceVerified: true,
            reviewedFeedbackArtifactRecorded: true,
            humanReviewCompleted: true,
            publicationApprovalRequired: true,
            publicationApproved: false,
            studentVisibleFeedbackPublished: false,
            answerKeyDisclosed: false,
            workerMetadataDisclosed: false,
            rawModelOutputStored: false,
            rawModelOutputDisclosed: false,
            resultRefDisclosed: false,
            modelInferenceStarted: false,
            directDatabaseAccessAllowed: false,
            executeHttpRequestAllowed: false,
            remoteDeviceControlAllowed: false,
            localToolMutationAllowed: false,
            swarmAllowed: false,
          },
          evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source-input-hash:3443"],
          inputHash: "3443ce0b8d1dd3c1027f4ae8d3f2e5d02872b6e3bfd64e463b15868806e54be2",
        },
      },
    },
    safetyInvariants: {
      controlledFeedbackDraftRequired: true,
      controlledDraftSourceVerified: true,
      safeStudentResultRequired: true,
      humanReviewRequired: true,
      reviewedFeedbackArtifactRecorded: true,
      publicationApprovalRequired: true,
      studentVisibleFeedbackAllowed: false,
      answerKeyDisclosureAllowed: false,
      workerMetadataDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      modelInferenceAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
  };
}
