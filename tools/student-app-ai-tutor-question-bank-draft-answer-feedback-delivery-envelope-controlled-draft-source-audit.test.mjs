import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource,
  formatStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSourceAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source-audit.mjs";

describe("Student App AI Tutor question-bank draft answer feedback delivery envelope controlled draft source audit", () => {
  it("passes when delivery creates a student-visible envelope from 0297 approval without persistence", () => {
    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource(currentInputs(), {
      generatedAt: "2026-06-07T04:25:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE_RUNTIME");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_controlled_draft_source_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource.result;
    assert.equal(result.studentFeedbackDeliveryEnvelope.visibilityState, "STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_NOT_PERSISTED");
    assert.equal(result.studentFeedbackDeliveryEnvelope.sourceControlledDraft.artifactId, result.sourceControlledFeedbackDraft.artifactId);
    assert.equal(result.boundary.controlledDraftSourceVerified, true);
    assert.equal(result.boundary.sourceControlledDraftEvidencePreserved, true);
    assert.equal(result.boundary.studentVisibleFeedbackDeliveryEnvelopeCreated, true);
    assert.equal(result.boundary.durableStudentArchivePersistenceStarted, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSourceAudit(report), /controlled draft source runtime: READY/u);
  });

  it("fails when 0297 publication approval evidence is missing or unsafe", () => {
    const inputs = currentInputs();
    const approval = JSON.parse(inputs.approvalReport);
    approval.runtime.status = "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED";
    approval.safetyInvariants.controlledDraftSourceRequired = false;
    inputs.approvalReport = JSON.stringify(approval);

    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "publication_approval_controlled_source.ready_for_delivery_not_persisted").passed, false);
  });

  it("fails when runtime claims persistence, model work, transport, tools, or leaked fields", () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\ndurableStudentArchivePersistenceStarted: true\nmainDatabaseWriteStarted: true\nstudentArchiveWriteStarted: true\nmodelInferenceAllowed: true\nexecuteHttpRequestAllowed: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.visible_envelope_preserves_controlled_source_without_persistence_or_model").passed, false);
  });

  it("caps probe p99 at the Student App feedback delivery budget", () => {
    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when root hooks, structure, SDD, or board omit the runtime", () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.qualityGate = "";
    inputs.rootWorkflowCoverage = "";
    inputs.verifyStructure = "";
    inputs.sdd = "";
    inputs.architectureBoard = "";

    const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
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
    ].join("\n"),
    runtimeTest: [
      "records a student-visible feedback envelope from 0297 controlled-source approval while persistence remains blocked",
      "uses idempotency for replay and rejects conflicting controlled-source delivery envelopes",
      "rejects unsafe principals, unsafe 0297 approval reports, unsafe policies, and delivery mismatches",
      "rejects leaked answer, worker, result, model, persistence, internal error, and unsafe text fields",
      "rejects missing controlled-source delivery evidence",
    ].join("\n"),
    approvalReport: JSON.stringify(approvalReport()),
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source": "node tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft answer feedback delivery envelope controlled draft source runtime audit",
    rootWorkflowCoverage: [
      "studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource",
      "student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source.current.json",
      "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_controlled_draft_source_runtime",
    ].join("\n"),
    verifyStructure: [
      "0298-student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source.md",
      "student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source-runtime.mjs",
      "student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source-audit.test.mjs",
    ].join("\n"),
    sdd: "0298 Student App AI Tutor question-bank draft answer feedback delivery envelope controlled draft source",
    architectureBoard: "10.38/10 Student App AI Tutor question-bank draft answer feedback delivery envelope controlled draft source STUDENT_VISIBLE_FEEDBACK_DELIVERY_ENVELOPE_FROM_CONTROLLED_DRAFT_SOURCE_NOT_PERSISTED",
  };
}

function approvalReport() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_CONTROLLED_DRAFT_SOURCE",
    runtime: {
      runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_controlled_draft_source_runtime",
      commandPort: "StudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSourcePort.recordFeedbackPublicationApprovalFromControlledDraftSource",
      sourceRuntimes: ["student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_controlled_draft_source_runtime"],
      status: "APPROVED_FROM_CONTROLLED_DRAFT_SOURCE_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED",
    },
    runtimeSlo: { targetP99Ms: 50, p99Ms: 8, totalErrors: 0 },
    runtimeProbes: {
      studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource: {
        result: {
          schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source-recorded.v1",
          recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_CONTROLLED_DRAFT_SOURCE",
          recordId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_controlled_draft_source_001",
          runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_controlled_draft_source_runtime",
          commandPort: "StudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSourcePort.recordFeedbackPublicationApprovalFromControlledDraftSource",
          status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVED_FROM_CONTROLLED_DRAFT_SOURCE_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED",
          approvalInvocationId: "feedback_publication_approval_controlled_draft_audit_001",
          sourceControlledFeedbackDraft: {
            runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_controlled_draft_runtime",
            recordId: "student_app_ai_tutor_question_bank_draft_answer_feedback_controlled_draft_001",
            artifactId: "feedback_controlled_draft_qbank_ans_sub_audit_001",
            generationAttemptId: "feedback_generation_attempt_audit_001",
            executionState: "CONTROLLED_FEEDBACK_DRAFT_RECORDED_NOT_REVIEWED",
            inputHash: "1434b140c64d3a931fa5941a3eeba6a10ef15e4e89172223a475bde12227576c",
          },
          approval: {
            approvalId: "feedback_publication_approval_controlled_draft_qbank_001",
            reviewerPrincipalId: "teacher_001",
            decision: "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY",
            reviewedAt: "2026-06-07T04:04:00.000Z",
            reviewedFeedbackArtifactId: "feedback_artifact_qbank_controlled_draft_audit_001",
            sourceControlledDraftArtifactId: "feedback_controlled_draft_qbank_ans_sub_audit_001",
            submissionId: "qbank_ans_sub_audit_001",
            requestId: "grading_req_qbank_answer_audit_001",
            questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
            tutoringAnalysisRequestId: "tutor_req_student_app_001",
            archiveItemId: "tarch_student_quiz_001",
            reviewedFeedbackArtifactVerified: true,
            controlledDraftSourceVerified: true,
            learnerFeedbackReviewed: true,
            ageAppropriateConfirmed: true,
            studentOwnScopeConfirmed: true,
            answerKeyDisclosureBlocked: true,
            workerMetadataDisclosureBlocked: true,
            rawModelOutputDisclosureBlocked: true,
            resultRefDisclosureBlocked: true,
            internalErrorsDisclosureBlocked: true,
            futureStudentVisibleDeliveryRuntimeRequired: true,
          },
          approvedFeedbackArtifact: {
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
            previousVisibilityState: "REVIEWED_NOT_PUBLISHED",
            approvalState: "APPROVED_FROM_CONTROLLED_DRAFT_SOURCE_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED",
            scoreSummary: "Question-bank answer score 16/20 (80%, PROFICIENT); items=2; artifact=qbank_answer_scoring_artifact_001",
            learnerFeedback: {
              summary: "You handled the main skill well and should review one related point before the next practice.",
              encouragement: "Keep explaining your thinking step by step.",
              nextSteps: ["Review the missed concept with your teacher.", "Try one similar practice item after review."],
              misconceptionTags: ["fraction-comparison"],
              practiceSuggestions: ["Use a number line for the next comparison exercise."],
            },
          },
          boundary: {
            reviewedFeedbackArtifactVerified: true,
            controlledDraftSourceVerified: true,
            humanReviewCompleted: true,
            publicationApprovalRecorded: true,
            publicationApprovalGranted: true,
            approvedForStudentVisibleDelivery: true,
            requiresFutureStudentVisibleDeliveryRuntime: true,
            studentVisibleFeedbackPublished: false,
            studentVisibleDeliveryEnvelopeCreated: false,
            durableStudentArchivePersistenceStarted: false,
            answerKeyDisclosed: false,
            workerMetadataDisclosed: false,
            rawModelOutputDisclosed: false,
            resultRefDisclosed: false,
            modelInferenceStarted: false,
            directDatabaseAccessAllowed: false,
            executeHttpRequestAllowed: false,
            remoteDeviceControlAllowed: false,
            localToolMutationAllowed: false,
            swarmAllowed: false,
          },
          evidenceRefs: ["evidence:feedback-publication-approval-controlled-draft-source:feedback_publication_approval_controlled_draft_qbank_001"],
          inputHash: "b775d025f523638bff6e170e71c3b1e1389aac8ad07c5e7e2fa6572fc4d0cea0",
        },
      },
    },
    safetyInvariants: {
      reviewedFeedbackArtifactRequired: true,
      controlledDraftSourceRequired: true,
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
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
  };
}
