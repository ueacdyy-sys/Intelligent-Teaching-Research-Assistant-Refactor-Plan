import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_COMMAND_PORT,
  recordStudentAppAITutorQuestionBankDraftContentPrecheck,
} from "./student-app-ai-tutor-question-bank-draft-content-precheck-runtime.mjs";

describe("Student App AI Tutor question-bank draft content precheck runtime", () => {
  it("blocks draft content retrieval until a real own-student content store exists", () => {
    const result = recordStudentAppAITutorQuestionBankDraftContentPrecheck(baseInput(), {
      commandLogPath: tempLog(),
      generatedAt: "2026-06-05T00:03:00.000Z",
    });

    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_BLOCKED_UNTIL_CONTENT_STORE");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_COMMAND_PORT);
    assert.equal(result.selectedDraft.questionBankDraftRef, "local://question-bank-drafts/tutor_req_student_app_001.json");
    assert.equal(result.precheckDecision.contentAccessDecision, "BLOCK_UNTIL_CONTENT_STORE");
    assert.equal(result.precheckDecision.contentReadAllowed, false);
    assert.equal(result.boundary.visibilityEvidenceVerified, true);
    assert.equal(result.boundary.contentPrecheckOnly, true);
    assert.equal(result.boundary.draftContentReadStarted, false);
    assert.equal(result.boundary.questionGenerationStarted, false);
    assert.equal(result.boundary.studentAnsweringStarted, false);
    assert.equal(result.boundary.scoringStarted, false);
    assert.equal(result.boundary.studentVisiblePublished, false);
  });

  it("uses idempotency for replay and rejects conflicting content precheck inputs", () => {
    const commandLogPath = tempLog();
    const first = recordStudentAppAITutorQuestionBankDraftContentPrecheck(baseInput(), { commandLogPath });
    const replay = recordStudentAppAITutorQuestionBankDraftContentPrecheck(baseInput(), { commandLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.selectedDraft.archiveItemId, first.selectedDraft.archiveItemId);

    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftContentPrecheck({
        ...baseInput(),
        precheckInvocationId: "student_app_ai_tutor_question_bank_draft_content_precheck_002",
      }, { commandLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects non-student principals, missing own access, missing visibility evidence, and unsafe policy", () => {
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftContentPrecheck({
        ...baseInput(),
        principal: { ...baseInput().principal, role: "TEACHER" },
      }, { commandLogPath: tempLog() }),
      /role/u,
    );
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftContentPrecheck({
        ...baseInput(),
        principal: { ...baseInput().principal, studentAccess: { mode: "ALL", ownStudentId: "student_001" } },
      }, { commandLogPath: tempLog() }),
      /studentAccess\.mode/u,
    );
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftContentPrecheck({
        ...baseInput(),
        evidenceRefs: ["evidence:student-app-ai-tutor-result:tutor_req_student_app_001"],
      }, { commandLogPath: tempLog() }),
      /visibility evidence ref/u,
    );
    for (const field of ["authoritativeContentStoreAvailable", "draftContentReadAllowed", "questionGenerationAllowed", "scoringAllowed", "executeHttpRequestAllowed", "swarmAllowed"]) {
      assert.throws(
        () => recordStudentAppAITutorQuestionBankDraftContentPrecheck({
          ...baseInput(),
          contentPrecheckPolicy: { ...baseInput().contentPrecheckPolicy, [field]: true },
        }, { commandLogPath: tempLog() }),
        new RegExp(field, "u"),
      );
    }
  });

  it("rejects selected drafts that are not present in the verified visibility page", () => {
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftContentPrecheck({
        ...baseInput(),
        selectedDraft: { ...baseInput().selectedDraft, questionBankDraftRef: "local://question-bank-drafts/missing.json" },
      }, { commandLogPath: tempLog() }),
      /selectedDraft must come from the verified visibility page/u,
    );
  });

  it("rejects draft content, question, answer, score, publish, and worker fields from visibility evidence or selection", () => {
    for (const field of ["draftContent", "questions", "answers", "answerKey", "score", "publishedAt", "claimedByWorkerId"]) {
      const input = baseInput();
      input.draftVisibilityResult.draftVisibilityPage.items[0][field] = field === "score" ? 100 : "leak";
      assert.throws(
        () => recordStudentAppAITutorQuestionBankDraftContentPrecheck(input, { commandLogPath: tempLog() }),
        new RegExp(field, "u"),
      );
    }
    assert.throws(
      () => recordStudentAppAITutorQuestionBankDraftContentPrecheck({
        ...baseInput(),
        draftVisibilityResult: {
          ...baseInput().draftVisibilityResult,
          boundary: { ...baseInput().draftVisibilityResult.boundary, draftContentRead: true },
        },
      }, { commandLogPath: tempLog() }),
      /draftContentRead/u,
    );
  });
});

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-draft-content-precheck-")), "precheck.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.student-app.ai-tutor-question-bank-draft-content-precheck.v1",
    precheckInvocationId: "student_app_ai_tutor_question_bank_draft_content_precheck_001",
    principal: {
      principalId: "user_student_001",
      subjectType: "USER",
      role: "STUDENT",
      entryPoint: "STUDENT_APP",
      scopes: ["STUDENT_OWN_READ", "TEACHING_READ"],
      sessionId: "session_student_001",
      studentAccess: { mode: "OWN", ownStudentId: "student_001" },
    },
    draftVisibilityResult: draftVisibilityResult(),
    selectedDraft: {
      tutoringAnalysisRequestId: "tutor_req_student_app_001",
      archiveItemId: "tarch_student_quiz_001",
      resultRef: "local://student-app-ai-tutor/tutor_req_student_app_001/result.json",
      questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
    },
    contentPrecheckPolicy: {
      sourceVisibilityRuntime: "student_app_ai_tutor_question_bank_draft_visibility_runtime",
      sourceVisibilityStatus: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_LISTED",
      sourceVisibilityReadPort: "StudentAppAITutorQuestionBankDraftVisibilityPort.listStudentAppQuestionBankDrafts",
      contentPrecheckOnly: true,
      contentStoreRequiredBeforeRead: true,
      authoritativeContentStoreAvailable: false,
      futureContentUseCase: "ReadStudentAppQuestionBankDraftContent.Execute",
      futureContentRepository: "QuestionBankDraftContentRepository.GetOwnDraftContent",
      ownStudentOnly: true,
      draftContentReadAllowed: false,
      questionGenerationAllowed: false,
      studentAnsweringAllowed: false,
      scoringAllowed: false,
      studentVisiblePublishAllowed: false,
      modelInferenceAllowed: false,
      vectorSearchAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-visibility:tutor_req_student_app_001"],
    idempotencyKey: "student-app-ai-tutor-question-bank-draft-content-precheck:student_001:tutor_req_student_app_001",
  };
}

function draftVisibilityResult() {
  return {
    schemaVersion: "2026-06-05.student-app.ai-tutor-question-bank-draft-visibility-listed.v1",
    runtimeId: "student_app_ai_tutor_question_bank_draft_visibility_runtime",
    readPort: "StudentAppAITutorQuestionBankDraftVisibilityPort.listStudentAppQuestionBankDrafts",
    status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_LISTED",
    source: {
      targetUseCase: "ListStudentAppQuestionBankDrafts.Execute",
      repositoryOperation: "ArchiveRepository.ListTutoringAnalysisRequests",
      openApiOperation: "listStudentAppQuestionBankDrafts",
      sourceStatusRequired: "SUCCEEDED",
      sourceOwnerTypeRequired: "STUDENT",
      ownStudentOnly: true,
      questionBankDraftRefRequired: true,
    },
    draftVisibilityPage: {
      items: [
        {
          tutoringAnalysisRequestId: "tutor_req_student_app_001",
          archiveItemId: "tarch_student_quiz_001",
          sourceArchiveMaterial: "QUIZ_SUBMISSION",
          resultSummary: "The student understands fractions but needs more mixed-operation practice.",
          resultRef: "local://student-app-ai-tutor/tutor_req_student_app_001/result.json",
          questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
          createdAt: "2026-06-05T00:00:00.000Z",
          completedAt: "2026-06-05T00:01:00.000Z",
        },
      ],
      pageInfo: { pageSize: 20, hasMore: false, nextCursor: "" },
    },
    boundary: {
      ownStudentOnly: true,
      succeededAnalysisOnly: true,
      questionBankDraftRefRequired: true,
      draftContentRead: false,
      questionGenerationStarted: false,
      studentAnsweringStarted: false,
      scoringStarted: false,
      studentVisiblePublished: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
  };
}
