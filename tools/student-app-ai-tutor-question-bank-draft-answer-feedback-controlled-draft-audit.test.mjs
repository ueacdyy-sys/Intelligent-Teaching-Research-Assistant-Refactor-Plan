import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft,
  formatStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraftAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft-audit.mjs";

describe("Student App AI Tutor question-bank draft answer feedback controlled draft audit", () => {
  it("passes when runtime records only a controlled feedback draft", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft(currentInputs(), {
      generatedAt: "2026-06-07T03:20:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_feedback_controlled_draft_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackControlledDraft.result;
    assert.equal(result.boundary.feedbackDraftGenerated, true);
    assert.equal(result.boundary.studentVisibleFeedbackPublished, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraftAudit(report), /controlled draft runtime: READY/u);
  });

  it("fails when source model precheck is not ready for feedback draft generation", async () => {
    const inputs = currentInputs();
    const source = JSON.parse(inputs.sourceModelPrecheckReport);
    source.safetyInvariants.futureFeedbackDraftGenerationApproved = false;
    source.safetyInvariants.feedbackDraftGenerated = true;
    inputs.sourceModelPrecheckReport = JSON.stringify(source);

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.feedback_generation_model_precheck_ready").passed, false);
  });

  it("fails when runtime claims raw output, publication, infrastructure, or reviewed artifact work", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nrawModelOutputStored: true\nreviewedFeedbackArtifactRecorded: true\nstudentVisibleFeedbackPublished: true\nexecuteHttpRequestAllowed: true\nswarmAllowed: true\n`;

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the Student App control-plane budget", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft(currentInputs(), { probeP99Ms: 80 });

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

    const report = await auditStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraftPort.recordControlledFeedbackDraft",
      "recordStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_RECORDED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "sourceModelPrecheckVerified: true",
      "safeStudentResultOnly: true",
      "controlledFeedbackDraftRecorded: true",
      "modelInferenceStarted: true",
      "feedbackDraftGenerated: true",
      "rawModelOutputStored: false",
      "answerKeyDisclosed: false",
      "resultRefDisclosed: false",
      "reviewedFeedbackArtifactRecorded: false",
      "studentVisibleFeedbackPublished: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "requiresFutureHumanReview: true",
      "requiresFutureReviewedArtifact: true",
      "requiresFuturePublicationApproval: true",
      "requireLearnerSafeText",
    ].join("\n"),
    runtimeTest: [
      "records a sanitized feedback draft without review, storage, or publication",
      "uses idempotency for replay and rejects conflicting feedback draft attempts",
      "rejects missing ports, unsafe principals, unsafe output policy, and unsafe source prechecks",
      "rejects leaked source fields, unsafe port results, unsafe text, and missing evidence",
    ].join("\n"),
    sourceModelPrecheckReport: JSON.stringify(sourceModelPrecheckReport()),
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft": "node tools/student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft answer feedback controlled draft runtime audit",
    rootWorkflowCoverage: [
      "studentAppAiTutorQuestionBankDraftAnswerFeedbackControlledDraft",
      "student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft.current.json",
      "student_app_ai_tutor_question_bank_draft_answer_feedback_controlled_draft_runtime",
    ].join("\n"),
    verifyStructure: [
      "0295-student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft.md",
      "student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft-runtime.mjs",
      "student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft-audit.test.mjs",
    ].join("\n"),
    sdd: "0295 Student App AI Tutor question-bank draft answer feedback controlled draft",
    architectureBoard: "10.35/10 Student App AI Tutor question-bank draft answer feedback controlled draft STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_RECORDED",
  };
}

function sourceModelPrecheckReport() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECK_RUNTIME",
    runtime: {
      runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_generation_model_execution_precheck_runtime",
      commandPort: "StudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheckPort.recordFeedbackGenerationModelExecutionPrecheck",
      modelRoute: "StudentTutorAgent.generate_question_bank_answer_feedback",
      status: "MODEL_EXECUTION_PRECHECKED_NOT_STARTED",
    },
    runtimeSlo: { targetP99Ms: 50, p99Ms: 6, totalErrors: 0 },
    safetyInvariants: {
      sourceFeedbackPublicationPrecheckRequired: true,
      scoringResultPersistenceRequired: true,
      safeStudentResultRequired: true,
      approvalRequired: true,
      feedbackGenerationQueueAdmissionOnly: true,
      futureFeedbackDraftGenerationApproved: true,
      modelInferenceStarted: false,
      feedbackDraftGenerated: false,
      reviewedFeedbackArtifactRecorded: false,
      studentVisibleFeedbackAllowed: false,
      answerKeyDisclosureAllowed: false,
      rawModelOutputPersistenceAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      swarmAllowed: false,
    },
    runtimeProbes: {
      studentAppAiTutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck: {
        result: {
          schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-prechecked.v1",
          recordId: "student_app_ai_tutor_question_bank_draft_answer_feedback_generation_model_execution_precheck_001",
          runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_generation_model_execution_precheck_runtime",
          commandPort: "StudentAppAITutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheckPort.recordFeedbackGenerationModelExecutionPrecheck",
          status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECKED",
          precheckInvocationId: "feedback_generation_model_precheck_001",
          studentScoringResult: {
            submissionId: "qbank_ans_sub_feedback_001",
            requestId: "grading_req_feedback_001",
            questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
            tutoringAnalysisRequestId: "tutor_req_student_app_001",
            archiveItemId: "tarch_student_quiz_001",
            status: "SUCCEEDED",
            scoreSummary: "Score 16/20; the main skill is fraction comparison.",
            requestedAt: "2026-06-06T12:00:00.000Z",
            completedAt: "2026-06-06T12:05:00.000Z",
            updatedAt: "2026-06-06T12:05:00.000Z",
          },
          feedbackGenerationModelPrecheck: {
            precheckId: "feedback_generation_model_precheck_001",
            queueRef: "feedback_generation_model_queue_001",
            modelRoute: "StudentTutorAgent.generate_question_bank_answer_feedback",
            requestId: "grading_req_feedback_001",
            submissionId: "qbank_ans_sub_feedback_001",
            status: "FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECKED_NOT_STARTED",
            queueAdmissionOnly: true,
            modelInferenceStarted: false,
            feedbackDraftGenerated: false,
            studentVisiblePublished: false,
            questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
            tutoringAnalysisRequestId: "tutor_req_student_app_001",
            archiveItemId: "tarch_student_quiz_001",
            scoreSummary: "Score 16/20; the main skill is fraction comparison.",
          },
          boundary: {
            feedbackGenerationQueueAdmitted: true,
            modelInferenceStarted: false,
            feedbackDraftGenerated: false,
            reviewedFeedbackArtifactRecorded: false,
            studentVisibleFeedbackPublished: false,
          },
          evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck:feedback_generation_model_precheck_001"],
        },
      },
    },
  };
}
