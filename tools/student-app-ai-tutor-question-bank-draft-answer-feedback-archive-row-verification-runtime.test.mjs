import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_PORT,
  formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerification,
  verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRow,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-runtime.mjs";

describe("Student App AI Tutor question-bank draft answer feedback archive row verification runtime", () => {
  it("verifies the committed feedback archive item through the injected row read port", async () => {
    const port = recordingRowReadPort();
    const result = await verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRow(baseInput(), {
      teachingArchiveRowReadPort: port,
      verificationLogPath: tempVerificationLogPath(),
      generatedAt: "2026-06-06T14:30:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-row-verified.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PHYSICAL_ROW_VERIFIED");
    assert.equal(result.sourceStorageCommit.archiveItemId, "tarch_student_feedback_001");
    assert.equal(result.teachingArchivePhysicalRow.targetRepository, "ArchiveRepository.GetByID");
    assert.equal(result.teachingArchivePhysicalRow.archiveItem.id, "tarch_student_feedback_001");
    assert.equal(result.boundary.teachingArchiveRowReadPortInvoked, true);
    assert.equal(result.boundary.physicalDatabaseRowVerified, true);
    assert.equal(result.boundary.directDatabaseAccessAllowed, false);
    assert.equal(result.learnerFeedbackSnapshot.safeLearnerFeedbackOnly, true);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].id, "tarch_student_feedback_001");
    assert.match(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackArchiveRowVerification(result), /Physical row verified: true/u);
  });

  it("uses idempotency for replay and rejects conflicting committed rows", async () => {
    const verificationLogPath = tempVerificationLogPath();
    const port = recordingRowReadPort();
    const first = await verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRow(baseInput(), { teachingArchiveRowReadPort: port, verificationLogPath });
    const replay = await verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRow(baseInput(), { teachingArchiveRowReadPort: port, verificationLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(verificationLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.verificationInvocationId = "feedback_archive_row_verification_conflict";
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRow(conflicting, { teachingArchiveRowReadPort: port, verificationLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects missing ports, missing rows, mismatched ids, and mismatched content refs", async () => {
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRow(baseInput(), { verificationLogPath: tempVerificationLogPath() }),
      /TeachingArchiveRowReadPort\.getArchiveItemById is required/u,
    );
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRow(baseInput(), {
        teachingArchiveRowReadPort: recordingRowReadPort({ found: false }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /TeachingArchiveRowReadPort result\.found must be true/u,
    );
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRow(baseInput(), {
        teachingArchiveRowReadPort: recordingRowReadPort({ row: { ...committedArchiveItem(), id: "tarch_other" } }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /TeachingArchiveRowReadPort result\.row\.id must be tarch_student_feedback_001/u,
    );
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRow(baseInput(), {
        teachingArchiveRowReadPort: recordingRowReadPort({ row: { ...committedArchiveItem(), contentRef: "student-ai-tutor-feedback-archive:changed:sha256_bad" } }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /TeachingArchiveRowReadPort result\.row\.contentRef must be/u,
    );
  });

  it("rejects wrong owner scope, direct DB or HTTP policies, Swarm, and leaked fields", async () => {
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRow(baseInput(), {
        teachingArchiveRowReadPort: recordingRowReadPort({ row: { ...committedArchiveItem(), ownerType: "TEACHING" } }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /ownerType must be STUDENT/u,
    );

    for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.feedbackArchiveRowVerificationPolicy[field] = true;
      await assert.rejects(
        () => verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRow(input, {
          teachingArchiveRowReadPort: recordingRowReadPort(),
          verificationLogPath: tempVerificationLogPath(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }

    const leaked = baseInput();
    leaked.feedbackArchiveStorageCommitReport.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommit.result.rawModelOutput = "leak";
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftAnswerFeedbackArchivePhysicalRow(leaked, {
        teachingArchiveRowReadPort: recordingRowReadPort(),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /rawModelOutput/u,
    );
  });
});

function tempVerificationLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-feedback-archive-row-verification-")), "verification.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-answer-feedback-archive-row-verification.v1",
    verificationInvocationId: "feedback_archive_row_verification_001",
    feedbackArchiveStorageCommitReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit.current.json", "utf8")),
    feedbackArchiveRowVerificationPolicy: rowVerificationPolicy(),
    evidenceRefs: ["evidence:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit:qbank_ans_sub_feedback_001"],
    idempotencyKey: "student-app-ai-tutor-feedback-archive-row-verification:student_001:qbank_ans_sub_feedback_001",
  };
}

function rowVerificationPolicy() {
  return {
    storageCommitRequired: true,
    physicalRowVerificationRequired: true,
    injectedTeachingArchiveRowReadPortRequired: true,
    teachingArchiveRepositoryReadRequired: true,
    committedArchiveItemMatchRequired: true,
    preserveLearnerFeedbackRequired: true,
    preserveApprovalEvidenceRequired: true,
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
  const report = JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit.current.json", "utf8"));
  return report.runtimeProbes.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommit.result.teachingArchiveCommit.archiveItem;
}
