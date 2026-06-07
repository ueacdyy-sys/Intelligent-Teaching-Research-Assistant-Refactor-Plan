import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_PORT,
  formatStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck,
  recordStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck,
} from "./student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck-runtime.mjs";

describe("Student App AI Tutor question-bank draft answer scoring model execution precheck runtime", () => {
  it("records a reviewed answer-scoring model queue precheck without starting model scoring", async () => {
    const port = recordingPrecheckPort();
    const result = await recordStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(baseInput(), {
      answerScoringModelExecutionPrecheckPort: port,
      precheckLogPath: tempPrecheckLogPath(),
      generatedAt: "2026-06-06T22:00:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-scoring-model-execution-prechecked.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECKED");
    assert.equal(result.modelExecutionPrecheck.requestId, "grading_req_qbank_answer_audit_001");
    assert.equal(result.modelExecutionPrecheck.submissionId, "qbank_ans_sub_audit_001");
    assert.equal(result.modelExecutionPrecheck.status, "PRECHECKED_FOR_REVIEWED_ANSWER_SCORING_MODEL_QUEUE");
    assert.equal(result.modelExecutionPrecheck.executionState, "MODEL_EXECUTION_PRECHECKED_NOT_STARTED");
    assert.equal(result.boundary.modelExecutionQueueAdmissionOnly, true);
    assert.equal(result.boundary.futureScoringModelExecutionApproved, true);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.equal(result.boundary.scoringExecutionStarted, false);
    assert.equal(result.boundary.resultPersistenceStarted, false);
    assert.equal(result.boundary.feedbackGenerationStarted, false);
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal("answerText" in result.scoringInputManifest, false);
    assert.equal("scoreSummary" in result.modelExecutionPrecheck, false);
    assert.equal("resultRef" in result.modelExecutionPrecheck, false);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].answerScoringRequest.requestId, "grading_req_qbank_answer_audit_001");
    assert.equal(port.calls[0].scoringInputManifest.workerId, "ai_grading_worker_scoring_001");
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(result), /Model started: false/u);
  });

  it("uses idempotency for safe replay and rejects conflicting model execution prechecks", async () => {
    const precheckLogPath = tempPrecheckLogPath();
    const port = recordingPrecheckPort();
    const first = await recordStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(baseInput(), {
      answerScoringModelExecutionPrecheckPort: port,
      precheckLogPath,
    });
    const replay = await recordStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(baseInput(), {
      answerScoringModelExecutionPrecheckPort: port,
      precheckLogPath,
    });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(precheckLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.precheckInvocationId = "qbank_answer_scoring_model_precheck_002";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(conflicting, {
        answerScoringModelExecutionPrecheckPort: port,
        precheckLogPath,
      }),
      /idempotency key already exists/u,
    );
  });

  it("rejects missing ports, unsafe principals, incomplete approvals, and unsafe policies", async () => {
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(baseInput(), { precheckLogPath: tempPrecheckLogPath() }),
      /AnswerScoringModelExecutionPrecheckPort\.recordAnswerScoringModelExecutionPrecheck is required/u,
    );

    const unsafePrincipal = baseInput();
    unsafePrincipal.principal.role = "STUDENT";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(unsafePrincipal, {
        answerScoringModelExecutionPrecheckPort: recordingPrecheckPort(),
        precheckLogPath: tempPrecheckLogPath(),
      }),
      /input\.principal\.role must be SERVICE/u,
    );

    const incompleteApproval = baseInput();
    incompleteApproval.approval.permissions = ["QUESTION_BANK_ANSWER_SCORING_REVIEW", "OTHER_REVIEW"];
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(incompleteApproval, {
        answerScoringModelExecutionPrecheckPort: recordingPrecheckPort(),
        precheckLogPath: tempPrecheckLogPath(),
      }),
      /MODEL_EXECUTION_PRECHECK_APPROVE/u,
    );

    for (const field of ["executeModelNowAllowed", "calculateScoreNowAllowed", "persistResultNowAllowed", "generateFeedbackNowAllowed", "studentVisiblePublishAllowed", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.modelExecutionPolicy[field] = true;
      await assert.rejects(
        () => recordStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(input, {
          answerScoringModelExecutionPrecheckPort: recordingPrecheckPort(),
          precheckLogPath: tempPrecheckLogPath(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }
  });

  it("rejects non-ready source reports, manifest mismatches, and broken worker-input linkage", async () => {
    const notReadyRequest = baseInput();
    notReadyRequest.answerScoringRequestVerificationReport.readiness = "NEEDS_REMEDIATION";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(notReadyRequest, {
        answerScoringModelExecutionPrecheckPort: recordingPrecheckPort(),
        precheckLogPath: tempPrecheckLogPath(),
      }),
      /input\.answerScoringRequestVerificationReport\.readiness must be READY/u,
    );

    const notReadyInput = baseInput();
    notReadyInput.answerScoringInputFoundationReport.readiness = "NEEDS_REMEDIATION";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(notReadyInput, {
        answerScoringModelExecutionPrecheckPort: recordingPrecheckPort(),
        precheckLogPath: tempPrecheckLogPath(),
      }),
      /input\.answerScoringInputFoundationReport\.readiness must be READY/u,
    );

    const mismatch = baseInput();
    mismatch.scoringInputManifest.requestId = "grading_req_other";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(mismatch, {
        answerScoringModelExecutionPrecheckPort: recordingPrecheckPort(),
        precheckLogPath: tempPrecheckLogPath(),
      }),
      /input\.scoringInputManifest\.requestId must be grading_req_qbank_answer_audit_001/u,
    );

    const itemMismatch = baseInput();
    itemMismatch.scoringInputManifest.submittedAnswerItemIds = ["qbank_plan_item_001"];
    itemMismatch.scoringInputManifest.answerItemCount = 1;
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(itemMismatch, {
        answerScoringModelExecutionPrecheckPort: recordingPrecheckPort(),
        precheckLogPath: tempPrecheckLogPath(),
      }),
      /submitted item ids must match/u,
    );
  });

  it("rejects answer leaks, unsafe port results, over-budget policies, and missing evidence", async () => {
    const leaked = baseInput();
    leaked.scoringInputManifest.answerText = "student answer leak";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(leaked, {
        answerScoringModelExecutionPrecheckPort: recordingPrecheckPort(),
        precheckLogPath: tempPrecheckLogPath(),
      }),
      /answerText is not allowed/u,
    );

    const unsafePort = recordingPrecheckPort({ modelInferenceStarted: true });
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(baseInput(), {
        answerScoringModelExecutionPrecheckPort: unsafePort,
        precheckLogPath: tempPrecheckLogPath(),
      }),
      /portResult\.modelExecutionPrecheck\.modelInferenceStarted must be false/u,
    );

    const scoreLeakPort = recordingPrecheckPort({ scoreSummary: "leak" });
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(baseInput(), {
        answerScoringModelExecutionPrecheckPort: scoreLeakPort,
        precheckLogPath: tempPrecheckLogPath(),
      }),
      /scoreSummary is not allowed/u,
    );

    const overBudget = baseInput();
    overBudget.modelExecutionPolicy.maxPromptTokens = 99999;
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(overBudget, {
        answerScoringModelExecutionPrecheckPort: recordingPrecheckPort(),
        precheckLogPath: tempPrecheckLogPath(),
      }),
      /input\.modelExecutionPolicy\.maxPromptTokens must be an integer/u,
    );

    const missingEvidence = baseInput();
    missingEvidence.evidenceRefs = [
      "evidence:answer-scoring-request-verification:student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification",
      "evidence:answer-scoring-input-foundation:student-app-ai-tutor-question-bank-draft-answer-scoring-input",
      "evidence:other",
    ];
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftAnswerScoringModelExecutionPrecheck(missingEvidence, {
        answerScoringModelExecutionPrecheckPort: recordingPrecheckPort(),
        precheckLogPath: tempPrecheckLogPath(),
      }),
      /model execution approval evidence ref is required/u,
    );
  });
});

function tempPrecheckLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-answer-scoring-model-precheck-")), "precheck.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck.v1",
    precheckInvocationId: "qbank_answer_scoring_model_precheck_001",
    answerScoringRequestVerificationReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification.current.json", "utf8")),
    answerScoringInputFoundationReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-scoring-input.current.json", "utf8")),
    principal: {
      principalId: "svc_student_tutor_agent",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      sessionId: "svc_session_student_tutor_agent",
      scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT", "ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_APPROVE"],
    },
    scoringInputManifest: scoringInputManifest(),
    approval: approval(),
    modelExecutionPolicy: modelExecutionPolicy(),
    evidenceRefs: [
      "evidence:answer-scoring-request-verification:student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification",
      "evidence:answer-scoring-input-foundation:student-app-ai-tutor-question-bank-draft-answer-scoring-input",
      "evidence:model-execution-approval:qbank_answer_scoring_model_approval_001",
    ],
    idempotencyKey: "student-app-ai-tutor-qbank-answer-scoring-model-precheck:student_001:grading_req_qbank_answer_audit_001",
  };
}

function scoringInputManifest() {
  return {
    manifestId: "qbank_answer_scoring_input_manifest_001",
    requestId: "grading_req_qbank_answer_audit_001",
    submissionId: "qbank_ans_sub_audit_001",
    questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
    tutoringAnalysisRequestId: "tutor_req_student_app_001",
    archiveItemId: "tarch_student_quiz_001",
    workerId: "ai_grading_worker_scoring_001",
    answerItemCount: 2,
    submittedAnswerItemIds: ["qbank_plan_item_001", "qbank_plan_item_002"],
    status: "WORKER_INPUT_READY_NOT_SCORED",
    protectedAnswerPackageReadiness: "WORKER_ONLY_PROTECTED_INPUT_AVAILABLE",
    sourceEndpoint: "POST /v1/teaching/ai-grading-requests/{requestId}/question-bank-answer-scoring-input",
    sourceFoundationRuntimeId: "student_app_ai_tutor_question_bank_draft_answer_scoring_input_foundation",
  };
}

function approval() {
  return {
    approvalId: "qbank_answer_scoring_model_approval_001",
    reviewerId: "teacher_001",
    reviewerRole: "TEACHER",
    permissions: ["QUESTION_BANK_ANSWER_SCORING_REVIEW", "MODEL_EXECUTION_PRECHECK_APPROVE"],
    reviewedRequestId: "grading_req_qbank_answer_audit_001",
    reviewedSubmissionId: "qbank_ans_sub_audit_001",
    reviewedQuestionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
    reviewedWorkerId: "ai_grading_worker_scoring_001",
    approvedForModelQueueOnly: true,
    workerInputBoundaryReviewed: true,
    answerKeyUseRestrictedToWorker: true,
    budgetReviewed: true,
    humanReviewRequiredBeforeFeedbackPublication: true,
  };
}

function modelExecutionPolicy() {
  return {
    modelRoute: "StudentTutorAgent.score_question_bank_answer",
    approvedProviderClass: "CONTROLLED_AI_WORKER",
    queueRef: "qbank_answer_scoring_model_queue_local_001",
    maxPromptTokens: 1200,
    maxOutputTokens: 400,
    maxScoringAttempts: 1,
    timeoutMs: 30000,
    storeRawModelOutputAllowed: false,
    executeModelNowAllowed: false,
    calculateScoreNowAllowed: false,
    persistResultNowAllowed: false,
    generateFeedbackNowAllowed: false,
    studentVisiblePublishAllowed: false,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    swarmAllowed: false,
    requiresFutureScoringRuntime: true,
    requiresRecordAIGradingResult: true,
    requiresReviewedFeedbackPublication: true,
  };
}

function recordingPrecheckPort(overrides = {}) {
  const calls = [];
  return {
    calls,
    async recordAnswerScoringModelExecutionPrecheck(request) {
      calls.push(request);
      return {
        modelExecutionPrecheck: {
          precheckId: "qbank_answer_scoring_model_precheck_audit_001",
          requestId: request.answerScoringRequest.requestId,
          submissionId: request.answerScoringRequest.submissionId,
          questionBankDraftRef: request.answerScoringRequest.questionBankDraftRef,
          tutoringAnalysisRequestId: request.answerScoringRequest.tutoringAnalysisRequestId,
          archiveItemId: request.answerScoringRequest.archiveItemId,
          workerId: request.scoringInputManifest.workerId,
          modelRoute: request.modelExecutionPolicy.modelRoute,
          queueRef: request.modelExecutionPolicy.queueRef,
          answerItemCount: request.answerScoringRequest.submittedAnswerItemIds.length,
          status: "PRECHECKED_FOR_REVIEWED_ANSWER_SCORING_MODEL_QUEUE",
          executionState: "MODEL_EXECUTION_PRECHECKED_NOT_STARTED",
          modelInferenceStarted: false,
          scoringExecutionStarted: false,
          resultPersistenceStarted: false,
          feedbackGenerationStarted: false,
          studentVisiblePublished: false,
          ...overrides,
        },
      };
    },
  };
}
