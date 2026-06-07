import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_PORT,
  formatStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft,
  recordStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft-runtime.mjs";

describe("Student App AI Tutor question-bank draft answer feedback controlled draft runtime", () => {
  it("records a sanitized feedback draft without review, storage, or publication", async () => {
    const port = recordingControlledFeedbackDraftPort();
    const result = await recordStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft(baseInput(), {
      commandLogPath: tempLog(),
      controlledFeedbackDraftPort: port,
      generatedAt: "2026-06-07T03:20:00.000Z",
    });

    assert.equal(port.calls.length, 1);
    assert.equal(result.schemaVersion, "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-controlled-draft-recorded.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_RECORDED");
    assert.equal(result.feedbackDraft.artifactId, "feedback_controlled_draft_qbank_ans_sub_audit_001");
    assert.equal(result.feedbackDraft.executionState, "CONTROLLED_FEEDBACK_DRAFT_RECORDED_NOT_REVIEWED");
    assert.equal(result.feedbackDraft.draftFeedback.nextSteps.length, 2);
    assert.equal(result.boundary.modelInferenceStarted, true);
    assert.equal(result.boundary.feedbackDraftGenerated, true);
    assert.equal(result.boundary.reviewedFeedbackArtifactRecorded, false);
    assert.equal(result.boundary.studentVisibleFeedbackPublished, false);
    assert.equal(result.boundary.rawModelOutputStored, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft(result), /Student-visible published: false/u);
  });

  it("uses idempotency for replay and rejects conflicting feedback draft attempts", async () => {
    const commandLogPath = tempLog();
    const port = recordingControlledFeedbackDraftPort();
    const first = await recordStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft(baseInput(), {
      commandLogPath,
      controlledFeedbackDraftPort: port,
    });
    const replay = await recordStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft(baseInput(), {
      commandLogPath,
      controlledFeedbackDraftPort: port,
    });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.generationAttempt.maxOutputTokens = 640;
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft(conflicting, {
        commandLogPath,
        controlledFeedbackDraftPort: port,
      }),
      /record\.inputHash must be/u,
    );
  });

  it("rejects missing ports, unsafe principals, unsafe output policy, and unsafe source prechecks", async () => {
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft(baseInput(), { commandLogPath: tempLog() }),
      /ControlledFeedbackDraftPort\.recordControlledFeedbackDraft is required/u,
    );

    const unsafePrincipal = baseInput();
    unsafePrincipal.principal.entryPoint = "STUDENT_APP";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft(unsafePrincipal, {
        commandLogPath: tempLog(),
        controlledFeedbackDraftPort: recordingControlledFeedbackDraftPort(),
      }),
      /input\.principal\.entryPoint/u,
    );

    for (const field of ["rawModelOutputStored", "studentVisiblePublicationAllowed", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.outputPolicy[field] = true;
      await assert.rejects(
        () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft(input, {
          commandLogPath: tempLog(),
          controlledFeedbackDraftPort: recordingControlledFeedbackDraftPort(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }

    const unsafeSource = baseInput();
    unsafeSource.feedbackGenerationModelExecutionPrecheckReport.safetyInvariants.feedbackDraftGenerated = true;
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft(unsafeSource, {
        commandLogPath: tempLog(),
        controlledFeedbackDraftPort: recordingControlledFeedbackDraftPort(),
      }),
      /feedbackDraftGenerated/u,
    );
  });

  it("rejects leaked source fields, unsafe port results, unsafe text, and missing evidence", async () => {
    const leaked = baseInput();
    leaked.feedbackGenerationModelExecutionPrecheckReport.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck.result.studentScoringResult.answerText = "leak";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft(leaked, {
        commandLogPath: tempLog(),
        controlledFeedbackDraftPort: recordingControlledFeedbackDraftPort(),
      }),
      /answerText is not allowed/u,
    );

    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft(baseInput(), {
        commandLogPath: tempLog(),
        controlledFeedbackDraftPort: recordingControlledFeedbackDraftPort({ studentVisibleFeedbackPublished: true }),
      }),
      /studentVisibleFeedbackPublished must be false/u,
    );

    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft(baseInput(), {
        commandLogPath: tempLog(),
        controlledFeedbackDraftPort: recordingControlledFeedbackDraftPort({}, { unsafeText: true }),
      }),
      /answer keys/u,
    );

    const missingEvidence = baseInput();
    missingEvidence.evidenceRefs = [
      "evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck:feedback_generation_model_precheck_audit_001",
      "evidence:other",
    ];
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerFeedbackControlledDraft(missingEvidence, {
        commandLogPath: tempLog(),
        controlledFeedbackDraftPort: recordingControlledFeedbackDraftPort(),
      }),
      /controlled-feedback-draft-generation evidence ref is required/u,
    );
  });
});

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-feedback-controlled-draft-")), "draft.jsonl");
}

function baseInput() {
  const sourceReport = JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck.current.json", "utf8"));
  const precheck = sourceReport.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck.result.feedbackGenerationModelPrecheck;
  return {
    schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-controlled-draft.v1",
    generationInvocationId: "feedback_controlled_draft_001",
    feedbackGenerationModelExecutionPrecheckReport: sourceReport,
    principal: {
      principalId: "student_tutor_agent_service_001",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT", "FEEDBACK_DRAFT_GENERATE"],
      sessionId: "session_agent_001",
    },
    generationAttempt: {
      attemptId: "feedback_generation_attempt_001",
      precheckId: precheck.precheckId,
      modelRoute: "StudentTutorAgent.generate_question_bank_answer_feedback",
      queueRef: precheck.queueRef,
      providerClass: "CONTROLLED_AI_WORKER",
      maxPromptTokens: 2048,
      maxOutputTokens: 512,
      attemptNo: 1,
    },
    outputPolicy: outputPolicy(),
    evidenceRefs: [
      `evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck:${precheck.precheckId}`,
      "evidence:controlled-feedback-draft-generation:feedback_generation_attempt_001",
    ],
    idempotencyKey: `student-app-ai-tutor-feedback-controlled-draft:student_001:${precheck.submissionId}`,
  };
}

function outputPolicy() {
  return {
    sanitizedFeedbackDraftOnly: true,
    sourceScoreSummaryOnly: true,
    requiresFutureHumanReview: true,
    requiresFutureReviewedArtifact: true,
    requiresFuturePublicationApproval: true,
    rawModelOutputStored: false,
    answerKeyDisclosureAllowed: false,
    resultRefDisclosureAllowed: false,
    reviewedFeedbackArtifactRecorded: false,
    studentVisiblePublicationAllowed: false,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function recordingControlledFeedbackDraftPort(overrides = {}, behavior = {}) {
  const calls = [];
  return {
    calls,
    async recordControlledFeedbackDraft(request) {
      calls.push(request);
      const scoring = request.sourceStudentScoringResult;
      const precheck = request.sourceModelPrecheck;
      return {
        feedbackDraft: {
          artifactId: `feedback_controlled_draft_${scoring.submissionId}`,
          precheckId: precheck.precheckId,
          requestId: scoring.requestId,
          submissionId: scoring.submissionId,
          questionBankDraftRef: scoring.questionBankDraftRef,
          tutoringAnalysisRequestId: scoring.tutoringAnalysisRequestId,
          archiveItemId: scoring.archiveItemId,
          generationAttemptId: request.generationAttempt.attemptId,
          modelRoute: request.modelRoute,
          status: "CONTROLLED_FEEDBACK_DRAFT_READY_FOR_REVIEW_NOT_PUBLISHED",
          executionState: "CONTROLLED_FEEDBACK_DRAFT_RECORDED_NOT_REVIEWED",
          sourceScoreSummary: scoring.scoreSummary,
          draftFeedback: {
            summary: behavior.unsafeText ? "This includes the answer key." : "You handled the main idea well and should review one skill before the next practice.",
            encouragement: "Keep the same pace and explain your reasoning in the next answer.",
            nextSteps: ["Review the missed concept with your teacher.", "Try one similar practice item after review."],
            misconceptionTags: ["fraction-comparison"],
            practiceSuggestions: ["Use a number line to compare two examples."],
          },
          rawModelOutputStored: false,
          answerKeyDisclosed: false,
          resultRefDisclosed: false,
          reviewedFeedbackArtifactRecorded: false,
          studentVisibleFeedbackPublished: false,
          ...overrides,
        },
      };
    },
  };
}
