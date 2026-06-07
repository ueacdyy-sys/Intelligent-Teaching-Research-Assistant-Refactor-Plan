import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact,
  formatStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactAudit,
} from "./student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-audit.mjs";

describe("Student App AI Tutor question-bank draft answer reviewed feedback artifact audit", () => {
  it("passes when reviewed feedback artifact admission stays behind the feedback publication precheck", () => {
    const report = auditStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact(currentInputs(), {
      generatedAt: "2026-06-06T12:20:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_RUNTIME");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifact.result;
    assert.equal(result.reviewedFeedbackArtifact.visibilityState, "REVIEWED_NOT_PUBLISHED");
    assert.equal(result.boundary.humanReviewCompleted, true);
    assert.equal(result.boundary.studentVisibleFeedbackPublished, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactAudit(report), /reviewed feedback artifact runtime: READY/u);
  });

  it("fails when precheck evidence is missing or unsafe", () => {
    const inputs = currentInputs();
    const precheck = JSON.parse(inputs.precheckReport);
    precheck.safetyInvariants.studentVisibleFeedbackAllowed = true;
    inputs.precheckReport = JSON.stringify(precheck);

    const report = auditStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "precheck.ready_and_blocks_publication").passed, false);
  });

  it("fails when runtime claims publication, model work, unsafe transport, or leaked fields", () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nstudentVisibleFeedbackPublished: true\npublicationApproved: true\nmodelInferenceAllowed: true\nexecuteHttpRequestAllowed: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = auditStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the Student App reviewed feedback artifact budget", () => {
    const report = auditStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when root hooks, structure, SDD, or board omit the runtime", () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifact", "studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationPrecheck");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("reviewed-feedback-artifact", "feedback-publication-precheck");
    inputs.sdd = "Student App AI Tutor question-bank draft answer feedback publication precheck";
    inputs.architectureBoard = "Student App AI Tutor question-bank draft answer feedback publication precheck 10.11/10";

    const report = auditStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_COMMAND_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactPort.recordReviewedFeedbackArtifact",
      "recordStudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifact",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_READY",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_READY_NOT_PUBLISHED",
      "assertReviewerPrincipal",
      "FEEDBACK_REVIEW",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "feedbackPublicationPrecheckVerified: true",
      "safeStudentResultOnly: true",
      "reviewedFeedbackArtifactRecorded: true",
      "humanReviewCompleted: true",
      "publicationApprovalRequired: true",
      "publicationApproved: false",
      "studentVisibleFeedbackPublished: false",
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
      "records reviewed feedback artifacts while keeping student publication blocked",
      "uses idempotency for replay and rejects conflicting reviewed feedback artifacts",
      "rejects non-human reviewers, unsafe precheck reports, unsafe policy, and publication approval",
      "rejects leaked answer, worker, result, model, publication, internal error, and unsafe text fields",
    ].join("\n"),
    precheckReport: JSON.stringify(precheckReport()),
    precheckRuntime: "scoreSummary safeStudentResultRequired studentVisibleFeedbackAllowed answerKeyDisclosureAllowed rawModelOutputDisclosureAllowed BLOCK_UNTIL_REVIEWED_FEEDBACK feedbackGenerated: false modelInferenceStarted: false",
    precheckAudit: "safeStudentResultRequired answerKeyDisclosureAllowed rawModelOutputDisclosureAllowed BLOCK_UNTIL_REVIEWED_FEEDBACK",
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact": "node tools/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft answer reviewed feedback artifact runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifact\nstudent-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact.current.json\nstudent_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_runtime",
    verifyStructure: "0272-student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact.md\nstudent-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-runtime.mjs\nstudent-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-audit.test.mjs",
    sdd: "0272 Student App AI Tutor question-bank draft answer reviewed feedback artifact READY_NOT_PUBLISHED",
    architectureBoard: "10.12/10 Student App AI Tutor question-bank draft answer reviewed feedback artifact READY_NOT_PUBLISHED",
  };
}

function precheckReport() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_RUNTIME",
    runtime: { runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_runtime", decision: "BLOCK_UNTIL_REVIEWED_FEEDBACK" },
    safetyInvariants: {
      scoringResultPersistenceRequired: true,
      safeStudentResultRequired: true,
      humanReviewRequired: true,
      feedbackArtifactRequired: true,
      studentVisibleFeedbackAllowed: false,
      answerKeyDisclosureAllowed: false,
      workerMetadataDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      modelInferenceAllowed: false,
    },
    runtimeProbes: {
      studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationPrecheck: {
        result: {
          recordId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_001",
          runtimeId: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_runtime",
          precheckInvocationId: "feedback_pub_precheck_audit_001",
          precheckDecision: { feedbackPublicationDecision: "BLOCK_UNTIL_REVIEWED_FEEDBACK", studentVisibleFeedbackAllowed: false },
          boundary: { feedbackPublicationPrecheckOnly: true, studentVisibleFeedbackPublished: false },
          studentScoringResult: {
            submissionId: "qbank_ans_sub_feedback_001",
            requestId: "grading_req_feedback_001",
            questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
            tutoringAnalysisRequestId: "tutor_req_student_app_001",
            archiveItemId: "tarch_student_quiz_001",
            status: "SUCCEEDED",
            scoreSummary: "Score 93. The student can compare simple fractions.",
            requestedAt: "2026-06-06T12:00:00.000Z",
            completedAt: "2026-06-06T12:05:00.000Z",
            updatedAt: "2026-06-06T12:05:00.000Z",
          },
          evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge:qbank_ans_sub_feedback_001"],
        },
      },
    },
  };
}
