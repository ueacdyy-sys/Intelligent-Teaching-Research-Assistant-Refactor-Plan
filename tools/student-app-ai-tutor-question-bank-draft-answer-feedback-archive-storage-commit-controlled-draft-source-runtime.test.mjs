import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE_PORT,
  commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageControlledDraftSource,
  formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-runtime.mjs";

describe("Student App AI Tutor question-bank draft answer feedback archive storage commit controlled draft source runtime", () => {
  it("commits the 0299 controlled-source archive command through the injected Teaching Archive use case port", async () => {
    const port = recordingPort();
    const result = await commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageControlledDraftSource(baseInput(), {
      teachingArchiveCreateItemPort: port,
      commitLogPath: tempCommitLogPath(),
      generatedAt: "2026-06-07T05:50:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-committed.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED_FROM_CONTROLLED_DRAFT_SOURCE");
    assert.equal(result.sourcePersistenceCommand.commitState, "COMMITTED_TO_STUDENT_ARCHIVE");
    assert.equal(result.sourcePersistenceCommand.sourceControlledDraftArtifactId, sourceCommand().sourceControlledFeedbackDraft.artifactId);
    assert.equal(result.sourceControlledFeedbackDraft.artifactId, sourceCommand().sourceControlledFeedbackDraft.artifactId);
    assert.equal(result.teachingArchiveCommit.targetUseCase, "CreateArchiveItem.ExecuteWithPersistence");
    assert.equal(result.teachingArchiveCommit.archiveItem.id, "tarch_student_feedback_controlled_source_001");
    assert.equal(result.teachingArchiveCommit.persistence.status, "persisted");
    assert.equal(result.boundary.archivePersistenceCommandControlledDraftSourceVerified, true);
    assert.equal(result.boundary.sourceControlledDraftEvidencePreserved, true);
    assert.equal(result.boundary.teachingArchiveUseCasePortInvoked, true);
    assert.equal(result.boundary.mainDatabaseWriteCommitted, true);
    assert.equal(result.boundary.directDatabaseAccessAllowed, false);
    assert.equal(result.boundary.executeHttpRequestAllowed, false);
    assert.equal(result.learnerFeedbackSnapshot.safeLearnerFeedbackOnly, true);
    assert.equal(result.learnerFeedbackSnapshot.sourceControlledDraft.artifactId, sourceCommand().sourceControlledFeedbackDraft.artifactId);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].command.requestBody.studentId, "student_001");
    assert.equal(port.calls[0].command.requestBody.tags.includes("controlled_draft_source"), true);
    assert.equal(port.calls[0].context.sourceControlledDraftArtifactId, sourceCommand().sourceControlledFeedbackDraft.artifactId);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource(result), /Main DB committed: true/u);
  });

  it("uses idempotency for replay and rejects conflicting controlled-source storage commits", async () => {
    const commitLogPath = tempCommitLogPath();
    const port = recordingPort();
    const first = await commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageControlledDraftSource(baseInput(), { teachingArchiveCreateItemPort: port, commitLogPath });
    const replay = await commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageControlledDraftSource(baseInput(), { teachingArchiveCreateItemPort: port, commitLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(commitLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = clone(baseInput());
    conflicting.commitInvocationId = "feedback_archive_storage_commit_controlled_draft_conflict";
    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageControlledDraftSource(conflicting, { teachingArchiveCreateItemPort: port, commitLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects unsafe 0299 source reports, missing ports, accepted writes, invalid archive ids, and unsafe feedback text", async () => {
    const unsafeSource = clone(baseInput());
    unsafeSource.feedbackArchivePersistenceCommandControlledDraftSourceReport.runtime.status = "COMMITTED";
    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageControlledDraftSource(unsafeSource, {
        teachingArchiveCreateItemPort: recordingPort(),
        commitLogPath: tempCommitLogPath(),
      }),
      /PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED/u,
    );

    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageControlledDraftSource(baseInput(), { commitLogPath: tempCommitLogPath() }),
      /TeachingArchiveCreateItemPort.createArchiveItem is required/u,
    );
    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageControlledDraftSource(baseInput(), {
        teachingArchiveCreateItemPort: recordingPort({ persistence: { status: "accepted", commandId: "cmd_queued" } }),
        commitLogPath: tempCommitLogPath(),
      }),
      /result\.persistence\.status must be persisted/u,
    );
    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageControlledDraftSource(baseInput(), {
        teachingArchiveCreateItemPort: recordingPort({ archiveItem: { ...archiveItem(), id: "bad_id" } }),
        commitLogPath: tempCommitLogPath(),
      }),
      /archive item id must use tarch_ prefix/u,
    );
    const unsafeText = clone(baseInput());
    unsafeText.feedbackArchivePersistenceCommandControlledDraftSourceReport.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource.result.feedbackArchivePersistenceCommand.learnerFeedback.summary = "<script>unsafe</script>";
    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageControlledDraftSource(unsafeText, {
        teachingArchiveCreateItemPort: recordingPort(),
        commitLogPath: tempCommitLogPath(),
      }),
      /encoded safe text/u,
    );
  });

  it("rejects direct DB or HTTP policies, student scope mismatch, Swarm, leaked fields, and missing controlled-source evidence", async () => {
    for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "swarmAllowed"]) {
      const input = clone(baseInput());
      input.feedbackArchiveStorageCommitControlledDraftSourcePolicy[field] = true;
      await assert.rejects(
        () => commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageControlledDraftSource(input, {
          teachingArchiveCreateItemPort: recordingPort(),
          commitLogPath: tempCommitLogPath(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }

    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageControlledDraftSource(baseInput(), {
        teachingArchiveCreateItemPort: recordingPort({ archiveItem: { ...archiveItem(), studentId: "student_other" } }),
        commitLogPath: tempCommitLogPath(),
      }),
      /result\.archiveItem\.studentId must be student_001/u,
    );

    const leaked = clone(baseInput());
    leaked.feedbackArchivePersistenceCommandControlledDraftSourceReport.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource.result.feedbackArchivePersistenceCommand.rawModelOutput = "leak";
    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageControlledDraftSource(leaked, {
        teachingArchiveCreateItemPort: recordingPort(),
        commitLogPath: tempCommitLogPath(),
      }),
      /rawModelOutput/u,
    );

    const missingEvidence = clone(baseInput());
    missingEvidence.evidenceRefs = [
      "evidence:feedback-archive-persistence-command-controlled-draft-source:qbank_ans_sub_audit_001",
      "evidence:other",
    ];
    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveStorageControlledDraftSource(missingEvidence, {
        teachingArchiveCreateItemPort: recordingPort(),
        commitLogPath: tempCommitLogPath(),
      }),
      /feedback-archive-storage-commit-controlled-draft-source evidence ref is required/u,
    );
  });
});

function tempCommitLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-feedback-archive-storage-commit-controlled-source-")), "commit.jsonl");
}

function baseInput() {
  const command = sourceCommand().feedbackArchivePersistenceCommand;
  return {
    schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source.v1",
    commitInvocationId: "feedback_archive_storage_commit_controlled_draft_001",
    feedbackArchivePersistenceCommandControlledDraftSourceReport: sourceReport(),
    feedbackArchiveStorageCommitControlledDraftSourcePolicy: commitPolicy(),
    evidenceRefs: [
      `evidence:feedback-archive-persistence-command-controlled-draft-source:${command.submissionId}`,
      `evidence:feedback-archive-storage-commit-controlled-draft-source:${command.submissionId}`,
    ],
    idempotencyKey: `student-app-ai-tutor-feedback-archive-storage-commit-controlled-draft-source:${command.scopeRef}:${command.submissionId}`,
  };
}

function commitPolicy() {
  return {
    archivePersistenceCommandControlledDraftSourceRequired: true,
    sourceControlledDraftEvidenceRequired: true,
    teachingArchiveUseCaseCommitAllowed: true,
    injectedTeachingArchivePortRequired: true,
    teachingArchiveDomainValidationRequired: true,
    persistedOutcomeRequired: true,
    preserveLearnerFeedbackRequired: true,
    preserveApprovalEvidenceRequired: true,
    preserveControlledDraftSourceEvidenceRequired: true,
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
    id: "tarch_student_feedback_controlled_source_001",
    ownerType: requestBody.ownerType ?? "STUDENT",
    studentId: requestBody.studentId ?? "student_001",
    materialType: requestBody.materialType ?? "HOMEWORK",
    title: requestBody.title ?? "Student AI Tutor feedback archive controlled source qbank_ans_sub_audit_001",
    source: requestBody.source ?? "SYSTEM_IMPORT",
    contentRef: requestBody.contentRef ?? "student-ai-tutor-feedback-archive-controlled-draft-source:feedback_archive_cmd_controlled_draft_qbank_001:sha256_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    tags: requestBody.tags ?? ["student_app_ai_tutor", "feedback", "question_bank", "archive_commit", "controlled_draft_source"],
    analysisIntents: requestBody.analysisIntents ?? ["ARCHIVE_ONLY", "TUTORING"],
    ocrStatus: "NOT_REQUIRED",
    createdAt: "2026-06-07T05:50:00.000Z",
  };
}

function sourceReport() {
  return JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source.current.json", "utf8"));
}

function sourceCommand() {
  return sourceReport().runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource.result;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
