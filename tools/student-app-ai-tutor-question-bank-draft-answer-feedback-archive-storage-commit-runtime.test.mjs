import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_PORT,
  commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorage,
  formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommit,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-runtime.mjs";

describe("Student App AI Tutor question-bank draft answer feedback archive storage commit runtime", () => {
  it("commits safe feedback into Teaching Archive through the injected use case port", async () => {
    const port = recordingPort();
    const result = await commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorage(baseInput(), {
      teachingArchiveCreateItemPort: port,
      commitLogPath: tempCommitLogPath(),
      generatedAt: "2026-06-06T14:00:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-storage-committed.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED");
    assert.equal(result.sourcePersistenceCommand.commitState, "COMMITTED_TO_STUDENT_ARCHIVE");
    assert.equal(result.teachingArchiveCommit.targetUseCase, "CreateArchiveItem.ExecuteWithPersistence");
    assert.equal(result.teachingArchiveCommit.archiveItem.id, "tarch_student_feedback_001");
    assert.equal(result.teachingArchiveCommit.persistence.status, "persisted");
    assert.equal(result.boundary.teachingArchiveUseCasePortInvoked, true);
    assert.equal(result.boundary.mainDatabaseWriteStarted, true);
    assert.equal(result.boundary.mainDatabaseWriteCommitted, true);
    assert.equal(result.boundary.directDatabaseAccessAllowed, false);
    assert.equal(result.boundary.executeHttpRequestAllowed, false);
    assert.equal(result.learnerFeedbackSnapshot.safeLearnerFeedbackOnly, true);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].command.requestBody.studentId, "student_001");
    assert.equal(port.calls[0].command.requestBody.materialType, "HOMEWORK");
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommit(result), /Main DB committed: true/u);
  });

  it("uses idempotency for replay and rejects conflicting storage commits", async () => {
    const commitLogPath = tempCommitLogPath();
    const port = recordingPort();
    const first = await commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorage(baseInput(), { teachingArchiveCreateItemPort: port, commitLogPath });
    const replay = await commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorage(baseInput(), { teachingArchiveCreateItemPort: port, commitLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(commitLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.commitInvocationId = "feedback_archive_storage_commit_conflict";
    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorage(conflicting, { teachingArchiveCreateItemPort: port, commitLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects missing ports, accepted writes, invalid archive ids, and unsafe feedback text", async () => {
    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorage(baseInput(), { commitLogPath: tempCommitLogPath() }),
      /TeachingArchiveCreateItemPort.createArchiveItem is required/u,
    );
    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorage(baseInput(), {
        teachingArchiveCreateItemPort: recordingPort({ persistence: { status: "accepted", commandId: "cmd_queued" } }),
        commitLogPath: tempCommitLogPath(),
      }),
      /result\.persistence\.status must be persisted/u,
    );
    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorage(baseInput(), {
        teachingArchiveCreateItemPort: recordingPort({ archiveItem: { ...archiveItem(), id: "bad_id" } }),
        commitLogPath: tempCommitLogPath(),
      }),
      /archive item id must use tarch_ prefix/u,
    );
    const unsafe = baseInput();
    unsafe.feedbackArchivePersistenceCommandReport.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand.result.feedbackArchivePersistenceCommand.learnerFeedback.summary = "<script>unsafe</script>";
    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorage(unsafe, {
        teachingArchiveCreateItemPort: recordingPort(),
        commitLogPath: tempCommitLogPath(),
      }),
      /encoded safe text/u,
    );
  });

  it("rejects direct DB or HTTP policies, student scope mismatch, Swarm, and leaked fields", async () => {
    for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.feedbackArchiveStorageCommitPolicy[field] = true;
      await assert.rejects(
        () => commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorage(input, {
          teachingArchiveCreateItemPort: recordingPort(),
          commitLogPath: tempCommitLogPath(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }

    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorage(baseInput(), {
        teachingArchiveCreateItemPort: recordingPort({ archiveItem: { ...archiveItem(), studentId: "student_other" } }),
        commitLogPath: tempCommitLogPath(),
      }),
      /result\.archiveItem\.studentId must be student_001/u,
    );

    const leaked = baseInput();
    leaked.feedbackArchivePersistenceCommandReport.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand.result.feedbackArchivePersistenceCommand.rawModelOutput = "leak";
    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorage(leaked, {
        teachingArchiveCreateItemPort: recordingPort(),
        commitLogPath: tempCommitLogPath(),
      }),
      /rawModelOutput/u,
    );
  });
});

function tempCommitLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-feedback-archive-storage-commit-")), "commit.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit.v1",
    commitInvocationId: "feedback_archive_storage_commit_001",
    feedbackArchivePersistenceCommandReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command.current.json", "utf8")),
    feedbackArchiveStorageCommitPolicy: commitPolicy(),
    evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command:qbank_ans_sub_feedback_001"],
    idempotencyKey: "student-app-ai-tutor-feedback-archive-storage-commit:student_001:qbank_ans_sub_feedback_001",
  };
}

function commitPolicy() {
  return {
    archivePersistenceCommandRequired: true,
    teachingArchiveUseCaseCommitAllowed: true,
    injectedTeachingArchivePortRequired: true,
    teachingArchiveDomainValidationRequired: true,
    persistedOutcomeRequired: true,
    preserveLearnerFeedbackRequired: true,
    preserveApprovalEvidenceRequired: true,
    idempotentStorageCommitRequired: true,
    mainDatabaseWriteAllowed: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    directPublicationAllowed: false,
    modelInferenceAllowed: false,
    answerKeyDisclosureAllowed: false,
    workerMetadataDisclosureAllowed: false,
    rawModelOutputDisclosureAllowed: false,
    resultRefDisclosureAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function recordingPort(overrides = {}) {
  const calls = [];
  return {
    calls,
    async createArchiveItem(command, context) {
      calls.push({ command, context });
      return {
        archiveItem: overrides.archiveItem ?? archiveItem(command.requestBody),
        persistence: overrides.persistence ?? { status: "persisted", commandId: "" },
      };
    },
  };
}

function archiveItem(requestBody = {}) {
  return {
    id: "tarch_student_feedback_001",
    ownerType: requestBody.ownerType ?? "STUDENT",
    studentId: requestBody.studentId ?? "student_001",
    materialType: requestBody.materialType ?? "HOMEWORK",
    title: requestBody.title ?? "Student AI Tutor feedback archive qbank_ans_sub_feedback_001",
    source: requestBody.source ?? "SYSTEM_IMPORT",
    contentRef: requestBody.contentRef ?? "student-ai-tutor-feedback-archive:feedback_archive_cmd_qbank_001:sha256_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    tags: requestBody.tags ?? ["student_app_ai_tutor", "feedback", "question_bank", "archive_commit"],
    analysisIntents: requestBody.analysisIntents ?? ["ARCHIVE_ONLY", "TUTORING"],
    ocrStatus: "NOT_REQUIRED",
    createdAt: "2026-06-06T14:00:00.000Z",
  };
}
