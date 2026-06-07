import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_READ_PORT,
  listStudentAppAITutorQuestionBankDraftVisibility,
} from "./student-app-ai-tutor-question-bank-draft-visibility-runtime.mjs";

describe("Student App AI Tutor question-bank draft visibility runtime", () => {
  it("lists own succeeded question-bank draft metadata through the injected use case port", async () => {
    const calls = [];
    const result = await listStudentAppAITutorQuestionBankDraftVisibility(baseInput(), {
      studentAppAITutorQuestionBankDraftVisibilityPort: {
        async listStudentAppQuestionBankDrafts(request) {
          calls.push(request);
          return portResult();
        },
      },
    }, { visibilityLogPath: tempLog(), generatedAt: "2026-06-05T00:02:00.000Z" });

    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_LISTED");
    assert.equal(result.readPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_READ_PORT);
    assert.equal(result.source.targetUseCase, "ListStudentAppQuestionBankDrafts.Execute");
    assert.equal(result.source.repositoryOperation, "ArchiveRepository.ListTutoringAnalysisRequests");
    assert.equal(result.draftVisibilityPage.items[0].tutoringAnalysisRequestId, "tutor_req_student_app_001");
    assert.equal(result.draftVisibilityPage.items[0].questionBankDraftRef, "local://question-bank-drafts/tutor_req_student_app_001.json");
    assert.equal(result.boundary.ownStudentOnly, true);
    assert.equal(result.boundary.draftContentRead, false);
    assert.equal(result.boundary.questionGenerationStarted, false);
    assert.equal(result.boundary.studentAnsweringStarted, false);
    assert.equal(result.boundary.scoringStarted, false);
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].filters.ownStudentId, "student_001");
    assert.equal(calls[0].safety.questionGenerationAllowed, false);
  });

  it("uses idempotency for replay and rejects conflicting visibility inputs", async () => {
    const visibilityLogPath = tempLog();
    const first = await listStudentAppAITutorQuestionBankDraftVisibility(baseInput(), baseDeps(), { visibilityLogPath });
    const replay = await listStudentAppAITutorQuestionBankDraftVisibility(baseInput(), {
      studentAppAITutorQuestionBankDraftVisibilityPort: {
        async listStudentAppQuestionBankDrafts() {
          throw new Error("port should not be called for replay");
        },
      },
    }, { visibilityLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.draftVisibilityPage.items[0].archiveItemId, first.draftVisibilityPage.items[0].archiveItemId);

    await assert.rejects(
      () => listStudentAppAITutorQuestionBankDraftVisibility({
        ...baseInput(),
        query: { ...baseInput().query, pageSize: 10 },
      }, baseDeps(), { visibilityLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects missing ports, non-student principals, non-own access, and invalid pagination", async () => {
    await assert.rejects(
      () => listStudentAppAITutorQuestionBankDraftVisibility(baseInput(), {}, { visibilityLogPath: tempLog() }),
      /listStudentAppQuestionBankDrafts is required/u,
    );
    await assert.rejects(
      () => listStudentAppAITutorQuestionBankDraftVisibility({
        ...baseInput(),
        principal: { ...baseInput().principal, role: "TEACHER" },
      }, baseDeps(), { visibilityLogPath: tempLog() }),
      /role/u,
    );
    await assert.rejects(
      () => listStudentAppAITutorQuestionBankDraftVisibility({
        ...baseInput(),
        principal: { ...baseInput().principal, studentAccess: { mode: "ALL", ownStudentId: "student_001" } },
      }, baseDeps(), { visibilityLogPath: tempLog() }),
      /studentAccess\.mode/u,
    );
    await assert.rejects(
      () => listStudentAppAITutorQuestionBankDraftVisibility({
        ...baseInput(),
        query: { pageSize: 101 },
      }, baseDeps(), { visibilityLogPath: tempLog() }),
      /pageSize/u,
    );
  });

  it("rejects draft content, generation, answering, scoring, publication, DB/HTTP, tools, and Swarm", async () => {
    for (const field of [
      "draftContentReadAllowed",
      "questionGenerationAllowed",
      "studentAnsweringAllowed",
      "scoringAllowed",
      "studentVisiblePublishAllowed",
      "directDatabaseAccessAllowed",
      "executeHttpRequestAllowed",
      "localToolMutationAllowed",
      "swarmAllowed",
    ]) {
      await assert.rejects(
        () => listStudentAppAITutorQuestionBankDraftVisibility({
          ...baseInput(),
          visibilityPolicy: { ...baseInput().visibilityPolicy, [field]: true },
        }, baseDeps(), { visibilityLogPath: tempLog() }),
        new RegExp(field, "u"),
      );
    }
  });

  it("rejects leaked student, worker, draft content, answer, score, and publish fields from the port result", async () => {
    for (const field of ["studentId", "sourceArchiveStudentId", "draftContent", "questions", "answers", "score", "publishedAt"]) {
      await assert.rejects(
        () => listStudentAppAITutorQuestionBankDraftVisibility(baseInput(), {
          studentAppAITutorQuestionBankDraftVisibilityPort: {
            async listStudentAppQuestionBankDrafts() {
              const result = portResult();
              result.page.items[0][field] = field === "score" ? 100 : "leak";
              return result;
            },
          },
        }, { visibilityLogPath: tempLog() }),
        new RegExp(field, "u"),
      );
    }
  });
});

function baseDeps() {
  return {
    studentAppAITutorQuestionBankDraftVisibilityPort: {
      async listStudentAppQuestionBankDrafts() {
        return portResult();
      },
    },
  };
}

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-draft-visibility-")), "visibility.jsonl");
}

function portResult() {
  return {
    source: {
      targetUseCase: "ListStudentAppQuestionBankDrafts.Execute",
      repositoryOperation: "ArchiveRepository.ListTutoringAnalysisRequests",
      openApiOperation: "listStudentAppQuestionBankDrafts",
      sourceStatusRequired: "SUCCEEDED",
      sourceOwnerTypeRequired: "STUDENT",
      ownStudentOnly: true,
      questionBankDraftRefRequired: true,
    },
    page: {
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
      pageInfo: {
        pageSize: 20,
        hasMore: false,
        nextCursor: "",
      },
    },
  };
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.student-app.ai-tutor-question-bank-draft-visibility.v1",
    visibilityInvocationId: "student_app_ai_tutor_question_bank_draft_visibility_001",
    principal: {
      principalId: "user_student_001",
      subjectType: "USER",
      role: "STUDENT",
      entryPoint: "STUDENT_APP",
      scopes: ["STUDENT_OWN_READ", "TEACHING_READ"],
      sessionId: "session_student_001",
      studentAccess: {
        mode: "OWN",
        ownStudentId: "student_001",
      },
    },
    query: {
      pageSize: 20,
      cursor: "",
    },
    visibilityPolicy: {
      targetUseCase: "ListStudentAppQuestionBankDrafts.Execute",
      repositoryOperation: "ArchiveRepository.ListTutoringAnalysisRequests",
      openApiOperation: "listStudentAppQuestionBankDrafts",
      sourceStatusRequired: "SUCCEEDED",
      sourceOwnerTypeRequired: "STUDENT",
      ownStudentOnly: true,
      questionBankDraftRefRequired: true,
      draftContentReadAllowed: false,
      questionGenerationAllowed: false,
      studentAnsweringAllowed: false,
      scoringAllowed: false,
      studentVisiblePublishAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: ["evidence:student-app-ai-tutor-result:tutor_req_student_app_001"],
    idempotencyKey: "student-app-ai-tutor-question-bank-draft-visibility:student_001:page_1",
  };
}
