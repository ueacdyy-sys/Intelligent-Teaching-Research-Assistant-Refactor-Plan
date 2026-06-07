import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_CONTROLLED_DRAFT_SOURCE_PORT,
  formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSource,
  verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRowControlledDraftSource,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source-runtime.mjs";

describe("Student App AI Tutor question-bank draft answer feedback archive row verification controlled draft source runtime", () => {
  it("verifies the 0300 controlled-source committed archive item through the injected row read port", async () => {
    const port = recordingRowReadPort();
    const result = await verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRowControlledDraftSource(baseInput(), {
      teachingArchiveRowReadPort: port,
      verificationLogPath: tempVerificationLogPath(),
      generatedAt: "2026-06-07T06:10:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source-verified.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_CONTROLLED_DRAFT_SOURCE_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PHYSICAL_ROW_VERIFIED_FROM_CONTROLLED_DRAFT_SOURCE");
    assert.equal(result.sourceStorageCommit.archiveItemId, "tarch_student_feedback_controlled_source_001");
    assert.equal(result.sourceStorageCommit.sourceControlledDraftArtifactId, sourceCommit().sourceControlledFeedbackDraft.artifactId);
    assert.equal(result.sourceControlledFeedbackDraft.artifactId, sourceCommit().sourceControlledFeedbackDraft.artifactId);
    assert.equal(result.teachingArchivePhysicalRow.targetRepository, "ArchiveRepository.GetByID");
    assert.equal(result.teachingArchivePhysicalRow.archiveItem.id, "tarch_student_feedback_controlled_source_001");
    assert.equal(result.boundary.storageCommitControlledDraftSourceVerified, true);
    assert.equal(result.boundary.physicalDatabaseRowVerified, true);
    assert.equal(result.boundary.directDatabaseAccessAllowed, false);
    assert.equal(result.learnerFeedbackSnapshot.safeLearnerFeedbackOnly, true);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].id, "tarch_student_feedback_controlled_source_001");
    assert.equal(port.calls[0].context.sourceControlledDraftArtifactId, sourceCommit().sourceControlledFeedbackDraft.artifactId);
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSource(result), /Physical row verified: true/u);
  });

  it("uses idempotency for replay and rejects conflicting controlled-source row verification", async () => {
    const verificationLogPath = tempVerificationLogPath();
    const port = recordingRowReadPort();
    const first = await verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRowControlledDraftSource(baseInput(), { teachingArchiveRowReadPort: port, verificationLogPath });
    const replay = await verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRowControlledDraftSource(baseInput(), { teachingArchiveRowReadPort: port, verificationLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(verificationLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = clone(baseInput());
    conflicting.verificationInvocationId = "feedback_archive_row_verification_controlled_draft_conflict";
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRowControlledDraftSource(conflicting, { teachingArchiveRowReadPort: port, verificationLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects unsafe source commits, missing ports, missing rows, mismatched ids, and mismatched content refs", async () => {
    const unsafeSource = clone(baseInput());
    unsafeSource.feedbackArchiveStorageCommitControlledDraftSourceReport.runtime.status = "STORAGE_COMMITTED";
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRowControlledDraftSource(unsafeSource, {
        teachingArchiveRowReadPort: recordingRowReadPort(),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED_FROM_CONTROLLED_DRAFT_SOURCE/u,
    );

    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRowControlledDraftSource(baseInput(), { verificationLogPath: tempVerificationLogPath() }),
      /TeachingArchiveRowReadPort\.getArchiveItemById is required/u,
    );
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRowControlledDraftSource(baseInput(), {
        teachingArchiveRowReadPort: recordingRowReadPort({ found: false }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /TeachingArchiveRowReadPort result\.found must be true/u,
    );
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRowControlledDraftSource(baseInput(), {
        teachingArchiveRowReadPort: recordingRowReadPort({ row: { ...committedArchiveItem(), id: "tarch_other" } }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /TeachingArchiveRowReadPort result\.row\.id must be tarch_student_feedback_controlled_source_001/u,
    );
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRowControlledDraftSource(baseInput(), {
        teachingArchiveRowReadPort: recordingRowReadPort({ row: { ...committedArchiveItem(), contentRef: "student-ai-tutor-feedback-archive-controlled-draft-source:changed:sha256_bad" } }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /TeachingArchiveRowReadPort result\.row\.contentRef must be/u,
    );
  });

  it("rejects wrong owner scope, direct DB or HTTP policies, Swarm, leaks, and missing controlled-source evidence", async () => {
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRowControlledDraftSource(baseInput(), {
        teachingArchiveRowReadPort: recordingRowReadPort({ row: { ...committedArchiveItem(), ownerType: "TEACHING" } }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /ownerType must be STUDENT/u,
    );

    for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "swarmAllowed"]) {
      const input = clone(baseInput());
      input.feedbackArchiveRowVerificationControlledDraftSourcePolicy[field] = true;
      await assert.rejects(
        () => verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRowControlledDraftSource(input, {
          teachingArchiveRowReadPort: recordingRowReadPort(),
          verificationLogPath: tempVerificationLogPath(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }

    const leaked = clone(baseInput());
    leaked.feedbackArchiveStorageCommitControlledDraftSourceReport.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource.result.rawModelOutput = "leak";
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRowControlledDraftSource(leaked, {
        teachingArchiveRowReadPort: recordingRowReadPort(),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /rawModelOutput/u,
    );

    const missingEvidence = clone(baseInput());
    missingEvidence.evidenceRefs = [
      "evidence:feedback-archive-storage-commit-controlled-draft-source:qbank_ans_sub_audit_001",
      "evidence:other",
    ];
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRowControlledDraftSource(missingEvidence, {
        teachingArchiveRowReadPort: recordingRowReadPort(),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /feedback-archive-row-verification-controlled-draft-source evidence ref is required/u,
    );
  });
});

function tempVerificationLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-feedback-archive-row-verification-controlled-source-")), "verification.jsonl");
}

function baseInput() {
  const commit = sourceCommit();
  return {
    schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source.v1",
    verificationInvocationId: "feedback_archive_row_verification_controlled_draft_001",
    feedbackArchiveStorageCommitControlledDraftSourceReport: sourceReport(),
    feedbackArchiveRowVerificationControlledDraftSourcePolicy: rowVerificationPolicy(),
    evidenceRefs: [
      `evidence:feedback-archive-storage-commit-controlled-draft-source:${commit.sourcePersistenceCommand.submissionId}`,
      `evidence:feedback-archive-row-verification-controlled-draft-source:${commit.sourcePersistenceCommand.submissionId}`,
    ],
    idempotencyKey: `student-app-ai-tutor-feedback-archive-row-verification-controlled-draft-source:${commit.sourcePersistenceCommand.scopeRef}:${commit.sourcePersistenceCommand.submissionId}`,
  };
}

function rowVerificationPolicy() {
  return {
    storageCommitControlledDraftSourceRequired: true,
    sourceControlledDraftEvidenceRequired: true,
    physicalRowVerificationRequired: true,
    injectedTeachingArchiveRowReadPortRequired: true,
    teachingArchiveRepositoryReadRequired: true,
    committedArchiveItemMatchRequired: true,
    preserveLearnerFeedbackRequired: true,
    preserveApprovalEvidenceRequired: true,
    preserveControlledDraftSourceEvidenceRequired: true,
    studentOwnScopeRequired: true,
    idempotentRowVerificationRequired: true,
    mainDatabaseReadAllowed: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
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

function recordingRowReadPort(overrides = {}) {
  const calls = [];
  return {
    calls,
    async getArchiveItemById(id, context) {
      calls.push({ id, context });
      return {
        found: overrides.found ?? true,
        source: overrides.source ?? { repositoryMethod: "ArchiveRepository.GetByID", targetTable: "teaching_archive_items" },
        row: overrides.row ?? committedArchiveItem(),
      };
    },
  };
}

function committedArchiveItem() {
  return clone(sourceCommit().teachingArchiveCommit.archiveItem);
}

function sourceReport() {
  return JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source.current.json", "utf8"));
}

function sourceCommit() {
  return sourceReport().runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource.result;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
