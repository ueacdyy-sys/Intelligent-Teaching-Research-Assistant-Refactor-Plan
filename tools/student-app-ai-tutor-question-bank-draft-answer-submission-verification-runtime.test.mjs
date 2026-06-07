import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION_PORT,
  formatStudentAppAITutorQuestionBankDraftAnswerSubmissionVerification,
  verifyStudentAppAITutorQuestionBankDraftAnswerSubmission,
} from "./student-app-ai-tutor-question-bank-draft-answer-submission-verification-runtime.mjs";

describe("Student App AI Tutor question-bank draft answer submission verification runtime", () => {
  it("verifies own-student answer submissions through the injected submission port", async () => {
    const port = recordingAnswerSubmissionPort();
    const result = await verifyStudentAppAITutorQuestionBankDraftAnswerSubmission(baseInput(), {
      studentQuestionBankDraftAnswerSubmissionPort: port,
      verificationLogPath: tempVerificationLogPath(),
      generatedAt: "2026-06-06T20:00:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-submission-verified.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFIED");
    assert.equal(result.answerSubmissionSource.targetUseCase, "SubmitStudentAppQuestionBankDraftAnswer.ExecuteWithPersistence");
    assert.equal(result.answerSubmissionSource.repository, "ArchiveRepository.SubmitQuestionBankDraftAnswerSubmission");
    assert.equal(result.answerSubmissionSource.endpoint, "POST /v1/student-app/question-bank-draft-answer-submissions");
    assert.equal(result.studentQuestionBankDraftAnswerSubmission.id, "qbank_ans_sub_runtime_001");
    assert.equal(result.studentQuestionBankDraftAnswerSubmission.answerCount, 2);
    assert.deepEqual(result.studentQuestionBankDraftAnswerSubmission.submittedAnswerItemIds, ["qbank_plan_item_001", "qbank_plan_item_002"]);
    assert.equal("answerText" in result.studentQuestionBankDraftAnswerSubmission, false);
    assert.equal("expectedAnswer" in result.studentQuestionBankDraftAnswerSubmission, false);
    assert.equal(result.boundary.answerSubmissionPersisted, true);
    assert.equal(result.boundary.scoringStarted, false);
    assert.equal(result.boundary.feedbackPublicationStarted, false);
    assert.equal(result.boundary.requiresFutureScoringAndReviewedFeedback, true);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].request.principal.studentAccess.ownStudentId, "student_001");
    assert.equal(port.calls[0].request.questionBankDraftRef, "local://question-bank-drafts/tutor_req_student_app_001.json");
    assert.equal(port.calls[0].request.answers[0].answerText, "3/4");
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerSubmissionVerification(result), /Answer submission persisted: true/u);
  });

  it("uses idempotency for replay and rejects conflicting answer submission verification", async () => {
    const verificationLogPath = tempVerificationLogPath();
    const port = recordingAnswerSubmissionPort();
    const first = await verifyStudentAppAITutorQuestionBankDraftAnswerSubmission(baseInput(), {
      studentQuestionBankDraftAnswerSubmissionPort: port,
      verificationLogPath,
    });
    const replay = await verifyStudentAppAITutorQuestionBankDraftAnswerSubmission(baseInput(), {
      studentQuestionBankDraftAnswerSubmissionPort: port,
      verificationLogPath,
    });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(verificationLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.answers[0].answerText = "different answer";
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerSubmission(conflicting, {
        studentQuestionBankDraftAnswerSubmissionPort: port,
        verificationLogPath,
      }),
      /idempotency key already exists/u,
    );
  });

  it("rejects missing port, missing persistence, cross-student principal, unknown item, duplicate answer, and response mismatch", async () => {
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerSubmission(baseInput(), { verificationLogPath: tempVerificationLogPath() }),
      /StudentQuestionBankDraftAnswerSubmissionPort\.submitStudentAppQuestionBankDraftAnswer is required/u,
    );

    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerSubmission(baseInput(), {
        studentQuestionBankDraftAnswerSubmissionPort: recordingAnswerSubmissionPort({ persisted: false }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /result\.persisted must be true/u,
    );

    const crossStudent = baseInput();
    crossStudent.principal.principalId = "student_principal_999";
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerSubmission(crossStudent, {
        studentQuestionBankDraftAnswerSubmissionPort: recordingAnswerSubmissionPort(),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /principalId must be student_principal_001/u,
    );

    const unknownItem = baseInput();
    unknownItem.answers = [{ itemId: "qbank_missing", answerText: "3/4" }];
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerSubmission(unknownItem, {
        studentQuestionBankDraftAnswerSubmissionPort: recordingAnswerSubmissionPort(),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /is not in the verified safe content/u,
    );

    const duplicate = baseInput();
    duplicate.answers = [
      { itemId: "qbank_plan_item_001", answerText: "3/4" },
      { itemId: "qbank_plan_item_001", answerText: "duplicate" },
    ];
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerSubmission(duplicate, {
        studentQuestionBankDraftAnswerSubmissionPort: recordingAnswerSubmissionPort(),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /is duplicated/u,
    );

    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerSubmission(baseInput(), {
        studentQuestionBankDraftAnswerSubmissionPort: recordingAnswerSubmissionPort({ response: { answerCount: 1 } }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /result\.response\.answerCount must be 2/u,
    );
  });

  it("rejects answer text, answer key, scoring, worker, DB, HTTP, model, tool, and Swarm leaks", async () => {
    for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "scoringAllowed", "modelInferenceAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.answerSubmissionVerificationPolicy[field] = true;
      await assert.rejects(
        () => verifyStudentAppAITutorQuestionBankDraftAnswerSubmission(input, {
          studentQuestionBankDraftAnswerSubmissionPort: recordingAnswerSubmissionPort(),
          verificationLogPath: tempVerificationLogPath(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }

    for (const leakedField of ["answerText", "expectedAnswer", "explanation", "answerKey", "workerId", "scoreSummary"]) {
      await assert.rejects(
        () => verifyStudentAppAITutorQuestionBankDraftAnswerSubmission(baseInput(), {
          studentQuestionBankDraftAnswerSubmissionPort: recordingAnswerSubmissionPort({ response: { [leakedField]: "leak" } }),
          verificationLogPath: tempVerificationLogPath(),
        }),
        new RegExp(`${leakedField} is not allowed`, "u"),
      );
    }
  });

  it("requires content read verification and answer submission foundation evidence while keeping scoring and feedback future-gated", async () => {
    const missingReadEvidence = baseInput();
    missingReadEvidence.evidenceRefs = ["evidence:answer-submission-foundation:0266", "evidence:other"];
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerSubmission(missingReadEvidence, {
        studentQuestionBankDraftAnswerSubmissionPort: recordingAnswerSubmissionPort(),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /content student read verification evidence ref is required/u,
    );

    const missingFoundationEvidence = baseInput();
    missingFoundationEvidence.evidenceRefs = ["evidence:content-student-read-verification:0287", "evidence:other"];
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerSubmission(missingFoundationEvidence, {
        studentQuestionBankDraftAnswerSubmissionPort: recordingAnswerSubmissionPort(),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /answer submission foundation evidence ref is required/u,
    );

    const result = await verifyStudentAppAITutorQuestionBankDraftAnswerSubmission(baseInput(), {
      studentQuestionBankDraftAnswerSubmissionPort: recordingAnswerSubmissionPort(),
      verificationLogPath: tempVerificationLogPath(),
    });

    assert.equal(result.boundary.scoringStarted, false);
    assert.equal(result.boundary.feedbackPublicationStarted, false);
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.equal(result.boundary.requiresFutureScoringAndReviewedFeedback, true);
  });
});

function tempVerificationLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-answer-submission-verification-")), "verification.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-submission-verification.v1",
    verificationInvocationId: "qbank_answer_submission_verification_001",
    principal: {
      principalId: "student_principal_001",
      sessionId: "student_session_001",
      subjectType: "USER",
      role: "STUDENT",
      entryPoint: "STUDENT_APP",
      scopes: ["STUDENT_OWN_READ", "STUDENT_OWN_WRITE"],
      studentAccess: { mode: "OWN", ownStudentId: "student_001" },
    },
    contentStudentReadVerificationReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-content-student-read-verification.current.json", "utf8")),
    answerSubmissionFoundationReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-submission.current.json", "utf8")),
    answerSubmissionVerificationPolicy: verificationPolicy(),
    answers: [
      { itemId: "qbank_plan_item_001", answerText: "3/4" },
      { itemId: "qbank_plan_item_002", answerText: "5/6" },
    ],
    evidenceRefs: [
      "evidence:content-student-read-verification:student-app-ai-tutor-qbank-content-student-read-verification",
      "evidence:answer-submission-foundation:student-app-ai-tutor-question-bank-draft-answer-submission",
    ],
    idempotencyKey: "student-app-ai-tutor-qbank-answer-submission-verification:student_001:qbank_generation_review_001",
  };
}

function verificationPolicy() {
  return {
    contentStudentReadVerificationRequired: true,
    answerSubmissionFoundationRequired: true,
    injectedAnswerSubmissionPortRequired: true,
    ownStudentPrincipalRequired: true,
    ownStudentWriteScopeRequired: true,
    submittedAnswersMustMatchReadItems: true,
    responseMetadataOnlyRequired: true,
    idempotentAnswerSubmissionVerificationRequired: true,
    goUseCaseSubmissionAllowed: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    answerTextDisclosureAllowed: false,
    expectedAnswerDisclosureAllowed: false,
    explanationDisclosureAllowed: false,
    answerKeyDisclosureAllowed: false,
    scoringAllowed: false,
    feedbackPublicationAllowed: false,
    studentVisiblePublishAllowed: false,
    modelInferenceAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function recordingAnswerSubmissionPort(overrides = {}) {
  const calls = [];
  return {
    calls,
    async submitStudentAppQuestionBankDraftAnswer(request, context) {
      calls.push({ request, context });
      const content = JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-content-student-read-verification.current.json", "utf8"))
        .runtimeProbes.studentAppAiTutorQuestionBankDraftContentStudentReadVerification.result.studentQuestionBankDraftContent;
      return {
        persisted: overrides.persisted ?? true,
        source: overrides.source ?? {
          targetUseCase: "SubmitStudentAppQuestionBankDraftAnswer.ExecuteWithPersistence",
          repository: "ArchiveRepository.SubmitQuestionBankDraftAnswerSubmission",
          endpoint: "POST /v1/student-app/question-bank-draft-answer-submissions",
          ownStudentOnly: true,
          ownStudentWrite: true,
          studentScopedLookup: true,
          principalId: request.principal.principalId,
        },
        response: {
          id: "qbank_ans_sub_runtime_001",
          questionBankDraftRef: content.questionBankDraftRef,
          tutoringAnalysisRequestId: content.tutoringAnalysisRequestId,
          archiveItemId: content.archiveItemId,
          status: "SUBMITTED",
          answerCount: request.answers.length,
          submittedAt: "2026-06-06T20:02:00.000Z",
          ...(overrides.response ?? {}),
        },
      };
    },
  };
}
