import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource,
  formatStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSourceAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source-audit.mjs";

describe("Student App AI Tutor question-bank draft answer reviewed feedback artifact controlled draft source audit", () => {
  it("passes when runtime derives a reviewed artifact from the controlled feedback draft", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource(currentInputs(), {
      generatedAt: "2026-06-07T03:40:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_CONTROLLED_DRAFT_SOURCE");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_controlled_draft_source_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource.result;
    assert.equal(result.boundary.controlledFeedbackDraftSourceVerified, true);
    assert.equal(result.boundary.studentVisibleFeedbackPublished, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSourceAudit(report), /controlled draft source runtime: READY/u);
  });

  it("fails when controlled draft source evidence is not ready", async () => {
    const inputs = currentInputs();
    const source = JSON.parse(inputs.controlledDraftReport);
    source.readiness = "NEEDS_REMEDIATION";
    source.safetyInvariants.reviewedFeedbackArtifactRecorded = true;
    inputs.controlledDraftReport = JSON.stringify(source);

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.controlled_feedback_draft_ready").passed, false);
  });

  it("fails when runtime claims publication, infrastructure, raw output, or review-time model work", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nstudentVisibleFeedbackPublished: true\nrawModelOutputStored: true\nexecuteHttpRequestAllowed: true\nmodelInferenceStarted: true\nswarmAllowed: true\n`;

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the Student App control-plane budget", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when package, quality, root coverage, structure, SDD, or board omit the runtime", async () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.qualityGate = "";
    inputs.rootWorkflowCoverage = "";
    inputs.verifyStructure = "";
    inputs.sdd = "";
    inputs.architectureBoard = "";

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_CONTROLLED_DRAFT_SOURCE_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSourcePort.recordReviewedFeedbackArtifactFromControlledDraft",
      "recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_FROM_CONTROLLED_DRAFT_RECORDED",
      "assertReviewerPrincipal",
      "FEEDBACK_REVIEW",
      "ADMIN_SYSTEM",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "controlledFeedbackDraftSourceVerified: true",
      "controlledFeedbackDraftRecorded: true",
      "sourceFeedbackDraftGenerated: true",
      "sourceModelInferenceStarted: true",
      "safeStudentResultOnly: true",
      "reviewedFeedbackArtifactRecorded: true",
      "humanReviewCompleted: true",
      "publicationApprovalRequired: true",
      "publicationApproved: false",
      "studentVisibleFeedbackPublished: false",
      "answerKeyDisclosed: false",
      "workerMetadataDisclosed: false",
      "rawModelOutputStored: false",
      "rawModelOutputDisclosed: false",
      "resultRefDisclosed: false",
      "modelInferenceStarted: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "controlledDraftSourceVerified",
      "resultRefRemoved",
      "assertLearnerFeedback",
    ].join("\n"),
    runtimeTest: [
      "records reviewed feedback artifacts from a controlled draft while keeping publication blocked",
      "uses idempotency for replay and rejects conflicting reviewed artifacts from the same draft",
      "rejects missing ports, unsafe reviewers, unsafe controlled draft reports, and unsafe policies",
      "rejects leaked fields, unsafe port results, unsafe text, and missing source evidence",
    ].join("\n"),
    controlledDraftReport: JSON.stringify(controlledDraftReport()),
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source": "node tools/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft answer reviewed feedback artifact controlled draft source runtime audit",
    rootWorkflowCoverage: [
      "studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource",
      "student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source.current.json",
      "student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_controlled_draft_source_runtime",
    ].join("\n"),
    verifyStructure: [
      "0296-student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source.md",
      "student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source-runtime.mjs",
      "student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source-audit.test.mjs",
    ].join("\n"),
    sdd: "0296 Student App AI Tutor question-bank draft answer reviewed feedback artifact controlled draft source",
    architectureBoard: "10.36/10 Student App AI Tutor question-bank draft answer reviewed feedback artifact controlled draft source STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_FROM_CONTROLLED_DRAFT_RECORDED",
  };
}

function controlledDraftReport() {
  return {
    generatedAt: "2026-06-07T03:13:39.154Z",
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT",
    runtime: {
      runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_controlled_draft_runtime",
      commandPort: "StudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraftPort.recordControlledFeedbackDraft",
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_RECORDED",
    },
    runtimeSlo: { targetP99Ms: 50, p99Ms: 8, totalErrors: 0 },
    runtimeProbes: {
      studentAppAiTutorQuestionBankDraftAnswerFeedbackControlledDraft: {
        result: {
          schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-controlled-draft-recorded.v1",
          recordType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT",
          recordId: "student_app_ai_tutor_question_bank_draft_answer_feedback_controlled_draft_001",
          runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_controlled_draft_runtime",
          commandPort: "StudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraftPort.recordControlledFeedbackDraft",
          status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_RECORDED",
          generationInvocationId: "feedback_controlled_draft_audit_001",
          inputHash: "1434b140c64d3a931fa5941a3eeba6a10ef15e4e89172223a475bde12227576c",
          studentScoringResult: {
            submissionId: "qbank_ans_sub_audit_001",
            requestId: "grading_req_qbank_answer_audit_001",
            questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
            tutoringAnalysisRequestId: "tutor_req_student_app_001",
            archiveItemId: "tarch_student_quiz_001",
            status: "SUCCEEDED",
            scoreSummary: "Question-bank answer score 16/20 (80%, PROFICIENT); items=2; artifact=qbank_answer_scoring_artifact_001",
            requestedAt: "2026-06-06T12:00:00.000Z",
            completedAt: "2026-06-06T12:05:00.000Z",
            updatedAt: "2026-06-06T12:05:00.000Z",
          },
          generationAttempt: {
            attemptId: "feedback_generation_attempt_audit_001",
            precheckId: "feedback_generation_model_precheck_audit_001",
            modelRoute: "StudentTutorAgent.generate_question_bank_answer_feedback",
            queueRef: "feedback_generation_model_queue_audit_001",
            providerClass: "CONTROLLED_AI_WORKER",
            maxPromptTokens: 2048,
            maxOutputTokens: 512,
            attemptNo: 1,
          },
          feedbackDraft: {
            artifactId: "feedback_controlled_draft_qbank_ans_sub_audit_001",
            precheckId: "feedback_generation_model_precheck_audit_001",
            requestId: "grading_req_qbank_answer_audit_001",
            submissionId: "qbank_ans_sub_audit_001",
            questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
            tutoringAnalysisRequestId: "tutor_req_student_app_001",
            archiveItemId: "tarch_student_quiz_001",
            generationAttemptId: "feedback_generation_attempt_audit_001",
            modelRoute: "StudentTutorAgent.generate_question_bank_answer_feedback",
            status: "CONTROLLED_FEEDBACK_DRAFT_READY_FOR_REVIEW_NOT_PUBLISHED",
            executionState: "CONTROLLED_FEEDBACK_DRAFT_RECORDED_NOT_REVIEWED",
            sourceScoreSummary: "Question-bank answer score 16/20 (80%, PROFICIENT); items=2; artifact=qbank_answer_scoring_artifact_001",
            draftFeedback: {
              summary: "You handled the main skill well and should review one related point before the next practice.",
              encouragement: "Keep explaining your thinking step by step.",
              nextSteps: ["Review the missed concept with your teacher.", "Try one similar practice item after review."],
              misconceptionTags: ["fraction-comparison"],
              practiceSuggestions: ["Use a number line for the next comparison exercise."],
            },
            rawModelOutputStored: false,
            answerKeyDisclosed: false,
            resultRefDisclosed: false,
            reviewedFeedbackArtifactRecorded: false,
            studentVisibleFeedbackPublished: false,
          },
          boundary: {
            controlledFeedbackDraftRecorded: true,
            modelInferenceStarted: true,
            feedbackDraftGenerated: true,
            rawModelOutputStored: false,
            answerKeyDisclosed: false,
            resultRefDisclosed: false,
            reviewedFeedbackArtifactRecorded: false,
            studentVisibleFeedbackPublished: false,
            directDatabaseAccessAllowed: false,
            executeHttpRequestAllowed: false,
            remoteDeviceControlAllowed: false,
            localToolMutationAllowed: false,
            swarmAllowed: false,
          },
          evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft-input-hash:1434"],
        },
      },
    },
    safetyInvariants: {
      sourceModelExecutionPrecheckRequired: true,
      safeStudentResultRequired: true,
      internalServiceOnly: true,
      controlledFeedbackDraftRecorded: true,
      modelInferenceAllowed: true,
      feedbackDraftGenerationAllowed: true,
      rawModelOutputStored: false,
      answerKeyDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      reviewedFeedbackArtifactRecorded: false,
      studentVisibleFeedbackAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
  };
}
