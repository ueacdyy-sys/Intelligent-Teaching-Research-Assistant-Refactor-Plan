import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION_PORT,
  formatStudentAppAITutorQuestionBankDraftAnswerScoringRequestVerification,
  verifyStudentAppAITutorQuestionBankDraftAnswerScoringRequest,
} from "./student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification-runtime.mjs";

describe("Student App AI Tutor question-bank draft answer scoring request verification runtime", () => {
  it("verifies own-student answer scoring requests through the injected scoring request port", async () => {
    const port = recordingScoringRequestPort();
    const result = await verifyStudentAppAITutorQuestionBankDraftAnswerScoringRequest(baseInput(), {
      studentQuestionBankDraftAnswerScoringRequestPort: port,
      verificationLogPath: tempVerificationLogPath(),
      generatedAt: "2026-06-06T21:00:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-scoring-request-verified.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFIED");
    assert.equal(result.answerScoringRequestSource.targetUseCase, "CreateStudentAppQuestionBankDraftAnswerScoringRequest.Execute");
    assert.equal(result.answerScoringRequestSource.repository, "ArchiveRepository.CreateAIGradingRequest");
    assert.equal(result.answerScoringRequestSource.endpoint, "POST /v1/student-app/question-bank-draft-answer-submissions/{submissionId}/ai-grading-requests");
    assert.equal(result.studentQuestionBankDraftAnswerScoringRequest.id, "grading_req_runtime_001");
    assert.equal(result.studentQuestionBankDraftAnswerScoringRequest.submissionId, "qbank_ans_sub_audit_001");
    assert.equal(result.studentQuestionBankDraftAnswerScoringRequest.status, "QUEUED");
    assert.deepEqual(result.studentQuestionBankDraftAnswerScoringRequest.submittedAnswerItemIds, ["qbank_plan_item_001", "qbank_plan_item_002"]);
    assert.equal("answerText" in result.studentQuestionBankDraftAnswerScoringRequest, false);
    assert.equal("scoreSummary" in result.studentQuestionBankDraftAnswerScoringRequest, false);
    assert.equal("resultRef" in result.studentQuestionBankDraftAnswerScoringRequest, false);
    assert.equal(result.boundary.scoringRequestQueued, true);
    assert.equal(result.boundary.scoringExecutionStarted, false);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.equal(result.boundary.feedbackPublicationStarted, false);
    assert.equal(result.boundary.requiresFutureWorkerScoringAndReviewedFeedback, true);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].request.principal.studentAccess.ownStudentId, "student_001");
    assert.equal(port.calls[0].request.submissionId, "qbank_ans_sub_audit_001");
    assert.equal(port.calls[0].request.gradingInstructions, "Score the submitted answer metadata under the reviewed rubric.");
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerScoringRequestVerification(result), /Scoring request queued: true/u);
  });

  it("uses idempotency for replay and rejects conflicting scoring request verification", async () => {
    const verificationLogPath = tempVerificationLogPath();
    const port = recordingScoringRequestPort();
    const first = await verifyStudentAppAITutorQuestionBankDraftAnswerScoringRequest(baseInput(), {
      studentQuestionBankDraftAnswerScoringRequestPort: port,
      verificationLogPath,
    });
    const replay = await verifyStudentAppAITutorQuestionBankDraftAnswerScoringRequest(baseInput(), {
      studentQuestionBankDraftAnswerScoringRequestPort: port,
      verificationLogPath,
    });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(verificationLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.scoringRequest.gradingInstructions = "different instructions";
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerScoringRequest(conflicting, {
        studentQuestionBankDraftAnswerScoringRequestPort: port,
        verificationLogPath,
      }),
      /idempotency key already exists/u,
    );
  });

  it("rejects missing port, missing queue result, cross-student principal, response mismatch, and item mismatch", async () => {
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerScoringRequest(baseInput(), { verificationLogPath: tempVerificationLogPath() }),
      /StudentQuestionBankDraftAnswerScoringRequestPort\.createStudentAppQuestionBankDraftAnswerScoringRequest is required/u,
    );

    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerScoringRequest(baseInput(), {
        studentQuestionBankDraftAnswerScoringRequestPort: recordingScoringRequestPort({ queued: false }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /result\.queued must be true/u,
    );

    const crossStudent = baseInput();
    crossStudent.principal.principalId = "student_principal_999";
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerScoringRequest(crossStudent, {
        studentQuestionBankDraftAnswerScoringRequestPort: recordingScoringRequestPort(),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /answer\.submission\.source\.principalId must be student_principal_999/u,
    );

    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerScoringRequest(baseInput(), {
        studentQuestionBankDraftAnswerScoringRequestPort: recordingScoringRequestPort({ response: { submissionId: "qbank_ans_sub_other" } }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /result\.response\.submissionId must be qbank_ans_sub_audit_001/u,
    );

    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerScoringRequest(baseInput(), {
        studentQuestionBankDraftAnswerScoringRequestPort: recordingScoringRequestPort({ response: { submittedAnswerItemIds: ["qbank_plan_item_001"] } }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /submitted item ids must match/u,
    );
  });

  it("rejects answer text, answer key, score, result ref, worker, DB, HTTP, model, tool, and Swarm leaks", async () => {
    for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "scoringExecutionAllowed", "modelInferenceAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.answerScoringRequestVerificationPolicy[field] = true;
      await assert.rejects(
        () => verifyStudentAppAITutorQuestionBankDraftAnswerScoringRequest(input, {
          studentQuestionBankDraftAnswerScoringRequestPort: recordingScoringRequestPort(),
          verificationLogPath: tempVerificationLogPath(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }

    for (const leakedField of ["answerText", "expectedAnswer", "explanation", "answerKey", "scoreSummary", "resultRef", "workerId"]) {
      await assert.rejects(
        () => verifyStudentAppAITutorQuestionBankDraftAnswerScoringRequest(baseInput(), {
          studentQuestionBankDraftAnswerScoringRequestPort: recordingScoringRequestPort({ response: { [leakedField]: "leak" } }),
          verificationLogPath: tempVerificationLogPath(),
        }),
        new RegExp(`${leakedField} is not allowed`, "u"),
      );
    }
  });

  it("requires answer submission verification and scoring request foundation evidence while future-gating scoring and feedback", async () => {
    const missingSubmissionEvidence = baseInput();
    missingSubmissionEvidence.evidenceRefs = ["evidence:answer-scoring-request-foundation:0267", "evidence:other"];
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerScoringRequest(missingSubmissionEvidence, {
        studentQuestionBankDraftAnswerScoringRequestPort: recordingScoringRequestPort(),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /answer submission verification evidence ref is required/u,
    );

    const missingFoundationEvidence = baseInput();
    missingFoundationEvidence.evidenceRefs = ["evidence:answer-submission-verification:0288", "evidence:other"];
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerScoringRequest(missingFoundationEvidence, {
        studentQuestionBankDraftAnswerScoringRequestPort: recordingScoringRequestPort(),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /answer scoring request foundation evidence ref is required/u,
    );

    const result = await verifyStudentAppAITutorQuestionBankDraftAnswerScoringRequest(baseInput(), {
      studentQuestionBankDraftAnswerScoringRequestPort: recordingScoringRequestPort(),
      verificationLogPath: tempVerificationLogPath(),
    });

    assert.equal(result.boundary.workerClaimStarted, false);
    assert.equal(result.boundary.scoringExecutionStarted, false);
    assert.equal(result.boundary.feedbackPublicationStarted, false);
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.equal(result.boundary.requiresFutureWorkerScoringAndReviewedFeedback, true);
  });
});

function tempVerificationLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-scoring-request-verification-")), "verification.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-scoring-request-verification.v1",
    verificationInvocationId: "qbank_answer_scoring_request_verification_001",
    principal: {
      principalId: "student_principal_001",
      sessionId: "student_session_001",
      subjectType: "USER",
      role: "STUDENT",
      entryPoint: "STUDENT_APP",
      scopes: ["STUDENT_OWN_READ", "STUDENT_OWN_WRITE"],
      studentAccess: { mode: "OWN", ownStudentId: "student_001" },
    },
    answerSubmissionVerificationReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-submission-verification.current.json", "utf8")),
    answerScoringRequestFoundationReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-scoring-request.current.json", "utf8")),
    answerScoringRequestVerificationPolicy: verificationPolicy(),
    scoringRequest: {
      gradingInstructions: "Score the submitted answer metadata under the reviewed rubric.",
      rubricRef: "local://rubrics/question-bank-answer-default.json",
    },
    evidenceRefs: [
      "evidence:answer-submission-verification:student-app-ai-tutor-question-bank-draft-answer-submission-verification",
      "evidence:answer-scoring-request-foundation:student-app-ai-tutor-question-bank-draft-answer-scoring-request",
    ],
    idempotencyKey: "student-app-ai-tutor-qbank-answer-scoring-request-verification:student_001:qbank_ans_sub_audit_001",
  };
}

function verificationPolicy() {
  return {
    answerSubmissionVerificationRequired: true,
    answerScoringRequestFoundationRequired: true,
    injectedScoringRequestPortRequired: true,
    ownStudentPrincipalRequired: true,
    ownStudentWriteScopeRequired: true,
    verifiedSubmissionRequired: true,
    existingAIGradingRequestQueueRequired: true,
    responseMetadataOnlyRequired: true,
    idempotentScoringRequestVerificationRequired: true,
    goUseCaseScoringRequestAllowed: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    answerTextDisclosureAllowed: false,
    expectedAnswerDisclosureAllowed: false,
    explanationDisclosureAllowed: false,
    answerKeyDisclosureAllowed: false,
    scoreDisclosureAllowed: false,
    resultRefDisclosureAllowed: false,
    workerClaimAllowed: false,
    scoringExecutionAllowed: false,
    feedbackPublicationAllowed: false,
    studentVisiblePublishAllowed: false,
    modelInferenceAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function recordingScoringRequestPort(overrides = {}) {
  const calls = [];
  return {
    calls,
    async createStudentAppQuestionBankDraftAnswerScoringRequest(request, context) {
      calls.push({ request, context });
      const submission = JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-submission-verification.current.json", "utf8"))
        .runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerSubmissionVerification.result.studentQuestionBankDraftAnswerSubmission;
      return {
        queued: overrides.queued ?? true,
        source: overrides.source ?? {
          targetUseCase: "CreateStudentAppQuestionBankDraftAnswerScoringRequest.Execute",
          repository: "ArchiveRepository.CreateAIGradingRequest",
          endpoint: "POST /v1/student-app/question-bank-draft-answer-submissions/{submissionId}/ai-grading-requests",
          ownStudentOnly: true,
          ownStudentWrite: true,
          submissionScopedLookup: true,
          draftContentScopedLookup: true,
          reusedAIGradingRequestQueue: true,
          principalId: request.principal.principalId,
        },
        response: {
          id: "grading_req_runtime_001",
          submissionId: submission.id,
          questionBankDraftRef: submission.questionBankDraftRef,
          tutoringAnalysisRequestId: submission.tutoringAnalysisRequestId,
          archiveItemId: submission.archiveItemId,
          status: "QUEUED",
          sourceArchiveOwnerType: "STUDENT",
          sourceArchiveContentRef: submission.questionBankDraftRef,
          sourceQuestionBankDraftRef: submission.questionBankDraftRef,
          sourceQuestionBankAnswerSubmissionId: submission.id,
          submittedAnswerItemIds: submission.submittedAnswerItemIds,
          requestedAt: "2026-06-06T21:02:00.000Z",
          ...(overrides.response ?? {}),
        },
      };
    },
  };
}
