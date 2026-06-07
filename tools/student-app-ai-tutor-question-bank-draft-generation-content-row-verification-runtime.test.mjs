import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION_PORT,
  formatStudentAppAITutorQuestionBankDraftGenerationContentRowVerification,
  verifyStudentAppAITutorQuestionBankDraftGenerationContentPhysicalRow,
} from "./student-app-ai-tutor-question-bank-draft-generation-content-row-verification-runtime.mjs";

describe("Student App AI Tutor question-bank draft generation content row verification runtime", () => {
  it("verifies reviewed generated content through the injected scoped row read port", async () => {
    const port = recordingRowReadPort();
    const result = await verifyStudentAppAITutorQuestionBankDraftGenerationContentPhysicalRow(baseInput(), {
      questionBankDraftContentRowReadPort: port,
      verificationLogPath: tempVerificationLogPath(),
      generatedAt: "2026-06-06T18:10:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-content-row-verified.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_PHYSICAL_ROW_VERIFIED");
    assert.equal(result.teachingArchiveContentPhysicalRow.targetRepository, "ArchiveRepository.GetQuestionBankDraftContentForStudent");
    assert.equal(result.teachingArchiveContentPhysicalRow.targetTable, "teaching_question_bank_draft_contents");
    assert.equal(result.teachingArchiveContentPhysicalRow.studentScopedLookup, true);
    assert.equal(result.questionBankDraftContentRow.questionBankDraftRef, "local://question-bank-drafts/tutor_req_student_app_001.json");
    assert.equal(result.questionBankDraftContentRow.itemCount, 3);
    assert.equal(result.questionBankDraftContentRow.internalScoringMaterialPresent, true);
    assert.equal(result.questionBankDraftContentRow.studentAnswerKeyDisclosed, false);
    assert.equal(result.safeStudentContentPreview.excludesExpectedAnswerAndExplanation, true);
    assert.equal("expectedAnswer" in result.safeStudentContentPreview.items[0], false);
    assert.equal("explanation" in result.safeStudentContentPreview.items[0], false);
    assert.equal(result.boundary.physicalDatabaseRowVerified, true);
    assert.equal(result.boundary.requiresFutureStudentReadVerification, true);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].questionBankDraftRef, "local://question-bank-drafts/tutor_req_student_app_001.json");
    assert.equal(port.calls[0].studentId, "student_001");
    assert.match(formatStudentAppAITutorQuestionBankDraftGenerationContentRowVerification(result), /Physical row verified: true/u);
  });

  it("uses idempotency for replay and rejects conflicting content row verification", async () => {
    const verificationLogPath = tempVerificationLogPath();
    const port = recordingRowReadPort();
    const first = await verifyStudentAppAITutorQuestionBankDraftGenerationContentPhysicalRow(baseInput(), {
      questionBankDraftContentRowReadPort: port,
      verificationLogPath,
    });
    const replay = await verifyStudentAppAITutorQuestionBankDraftGenerationContentPhysicalRow(baseInput(), {
      questionBankDraftContentRowReadPort: port,
      verificationLogPath,
    });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(verificationLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.verificationInvocationId = "qbank_generation_content_row_verification_conflict";
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftGenerationContentPhysicalRow(conflicting, {
        questionBankDraftContentRowReadPort: port,
        verificationLogPath,
      }),
      /idempotency key already exists/u,
    );
  });

  it("rejects missing ports, missing rows, mismatched scoped rows, and unsafe row content", async () => {
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftGenerationContentPhysicalRow(baseInput(), { verificationLogPath: tempVerificationLogPath() }),
      /QuestionBankDraftContentRowReadPort\.getQuestionBankDraftContentForStudent is required/u,
    );

    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftGenerationContentPhysicalRow(baseInput(), {
        questionBankDraftContentRowReadPort: recordingRowReadPort({ found: false }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /result\.found must be true/u,
    );

    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftGenerationContentPhysicalRow(baseInput(), {
        questionBankDraftContentRowReadPort: recordingRowReadPort({ row: { questionBankDraftRef: "local://question-bank-drafts/tutor_req_other.json" } }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /questionBankDraftRef must be local:\/\/question-bank-drafts\/tutor_req_student_app_001\.json/u,
    );

    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftGenerationContentPhysicalRow(baseInput(), {
        questionBankDraftContentRowReadPort: recordingRowReadPort({ row: { items: [{ questionText: "<script>unsafe</script>" }] } }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /must be encoded safe text/u,
    );
  });

  it("rejects direct DB, HTTP, scoring, Swarm, leaked fields, and unsafe student preview", async () => {
    for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "studentVisiblePublishAllowed", "studentAnsweringAllowed", "scoringAllowed", "modelInferenceAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.contentRowVerificationPolicy[field] = true;
      await assert.rejects(
        () => verifyStudentAppAITutorQuestionBankDraftGenerationContentPhysicalRow(input, {
          questionBankDraftContentRowReadPort: recordingRowReadPort(),
          verificationLogPath: tempVerificationLogPath(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }

    const leaked = baseInput();
    leaked.contentStorageCommitReport.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationContentStorageCommit.result.rawModelOutput = "leak";
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftGenerationContentPhysicalRow(leaked, {
        questionBankDraftContentRowReadPort: recordingRowReadPort(),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /rawModelOutput is not allowed/u,
    );

    const previewLeak = baseInput();
    previewLeak.contentStorageCommitReport.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationContentStorageCommit.result.safeStudentContentPreview.items[0].expectedAnswer = "leak";
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftGenerationContentPhysicalRow(previewLeak, {
        questionBankDraftContentRowReadPort: recordingRowReadPort(),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /expectedAnswer is not allowed in student preview/u,
    );
  });

  it("requires storage commit evidence and keeps student read, answering, and scoring future-gated", async () => {
    const missingCommitEvidence = baseInput();
    missingCommitEvidence.evidenceRefs = ["evidence:other:content-row-verification"];
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftGenerationContentPhysicalRow(missingCommitEvidence, {
        questionBankDraftContentRowReadPort: recordingRowReadPort(),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /content storage commit evidence ref is required/u,
    );

    const result = await verifyStudentAppAITutorQuestionBankDraftGenerationContentPhysicalRow(baseInput(), {
      questionBankDraftContentRowReadPort: recordingRowReadPort(),
      verificationLogPath: tempVerificationLogPath(),
    });

    assert.equal(result.boundary.requiresFutureStudentReadVerification, true);
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal(result.boundary.studentAnsweringStarted, false);
    assert.equal(result.boundary.scoringStarted, false);
    assert.equal(result.boundary.answerKeyDisclosed, false);
  });
});

function tempVerificationLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-generation-content-row-verification-")), "verification.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-content-row-verification.v1",
    verificationInvocationId: "qbank_generation_content_row_verification_001",
    contentStorageCommitReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-content-storage-commit.current.json", "utf8")),
    contentRowVerificationPolicy: verificationPolicy(),
    evidenceRefs: [
      "evidence:content-storage-commit:student-app-ai-tutor-qbank-generation-content-storage-commit",
    ],
    idempotencyKey: "student-app-ai-tutor-qbank-generation-content-row-verification:student_001:qbank_generation_review_001",
  };
}

function verificationPolicy() {
  return {
    contentStorageCommitRequired: true,
    physicalRowVerificationRequired: true,
    injectedQuestionBankDraftContentRowReadPortRequired: true,
    archiveRepositoryScopedReadRequired: true,
    committedContentMatchRequired: true,
    safeStudentPreviewMatchRequired: true,
    internalScoringMaterialNonDisclosureRequired: true,
    idempotentRowVerificationRequired: true,
    mainDatabaseReadAllowed: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    studentVisiblePublishAllowed: false,
    studentAnsweringAllowed: false,
    scoringAllowed: false,
    answerKeyDisclosureAllowed: false,
    rawModelOutputDisclosureAllowed: false,
    modelInferenceAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function recordingRowReadPort(overrides = {}) {
  const calls = [];
  return {
    calls,
    async getQuestionBankDraftContentForStudent(questionBankDraftRef, studentId, context) {
      calls.push({ questionBankDraftRef, studentId, context });
      const commit = JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-content-storage-commit.current.json", "utf8"))
        .runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationContentStorageCommit.result;
      const row = buildRow(commit);
      return {
        found: overrides.found ?? true,
        source: overrides.source ?? {
          repositoryMethod: "ArchiveRepository.GetQuestionBankDraftContentForStudent",
          targetTable: "teaching_question_bank_draft_contents",
          studentScopedLookup: true,
        },
        row: mergeRow(row, overrides.row ?? {}),
      };
    },
  };
}

function buildRow(commit) {
  const content = commit.questionBankDraftContent;
  return {
    questionBankDraftRef: content.questionBankDraftRef,
    tutoringAnalysisRequestId: content.tutoringAnalysisRequestId,
    archiveItemId: content.archiveItemId,
    studentId: content.studentId,
    status: content.status,
    sourceArchiveMaterial: content.sourceArchiveMaterial,
    resultSummary: content.resultSummary,
    internalScoringMaterialPresent: true,
    items: commit.safeStudentContentPreview.items.map((item, index) => ({
      id: item.id,
      questionText: item.questionText,
      learningTarget: item.learningTarget,
      expectedAnswer: `Teacher rubric for row item ${index + 1}`,
      explanation: `Teacher scoring explanation for row item ${index + 1}`,
    })),
  };
}

function mergeRow(row, overrides) {
  const merged = { ...row, ...overrides };
  if (Array.isArray(overrides.items)) {
    merged.items = row.items.map((item, index) => ({ ...item, ...(overrides.items[index] ?? {}) }));
  }
  return merged;
}
