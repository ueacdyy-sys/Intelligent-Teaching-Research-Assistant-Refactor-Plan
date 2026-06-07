import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMIT_PORT,
  commitStudentAppAITutorQuestionBankDraftGenerationContentStorage,
  formatStudentAppAITutorQuestionBankDraftGenerationContentStorageCommit,
} from "./student-app-ai-tutor-question-bank-draft-generation-content-storage-commit-runtime.mjs";

describe("Student App AI Tutor question-bank draft generation content storage commit runtime", () => {
  it("commits teacher-reviewed generated content through the injected Teaching Archive port", async () => {
    const port = recordingPort();
    const result = await commitStudentAppAITutorQuestionBankDraftGenerationContentStorage(baseInput(), {
      questionBankDraftContentStoragePort: port,
      commitLogPath: tempCommitLogPath(),
      generatedAt: "2026-06-06T17:30:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-content-storage-committed.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMIT_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMITTED");
    assert.equal(result.teachingArchiveContentStorage.targetRepository, "ArchiveRepository.SaveQuestionBankDraftContent");
    assert.equal(result.teachingArchiveContentStorage.targetTable, "teaching_question_bank_draft_contents");
    assert.equal(result.questionBankDraftContent.questionBankDraftRef, "local://question-bank-drafts/tutor_req_student_app_001.json");
    assert.equal(result.questionBankDraftContent.itemCount, 3);
    assert.equal(result.questionBankDraftContent.internalScoringMaterialStored, true);
    assert.equal(result.safeStudentContentPreview.excludesExpectedAnswerAndExplanation, true);
    assert.equal("expectedAnswer" in result.safeStudentContentPreview.items[0], false);
    assert.equal("explanation" in result.safeStudentContentPreview.items[0], false);
    assert.equal(result.boundary.questionBankContentWriteCommitted, true);
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal(result.boundary.studentAnswerKeyDisclosed, false);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].command.questionBankDraftContent.items[0].expectedAnswer.startsWith("Teacher rubric"), true);
    assert.match(formatStudentAppAITutorQuestionBankDraftGenerationContentStorageCommit(result), /Content stored: true/u);
  });

  it("uses idempotency for replay and rejects conflicting content storage commits", async () => {
    const commitLogPath = tempCommitLogPath();
    const port = recordingPort();
    const first = await commitStudentAppAITutorQuestionBankDraftGenerationContentStorage(baseInput(), {
      questionBankDraftContentStoragePort: port,
      commitLogPath,
    });
    const replay = await commitStudentAppAITutorQuestionBankDraftGenerationContentStorage(baseInput(), {
      questionBankDraftContentStoragePort: port,
      commitLogPath,
    });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(commitLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.commitInvocationId = "qbank_generation_content_storage_commit_conflict";
    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftGenerationContentStorage(conflicting, {
        questionBankDraftContentStoragePort: port,
        commitLogPath,
      }),
      /idempotency key already exists/u,
    );
  });

  it("rejects missing ports, unsafe service principals, unsafe source state, and unsafe policy", async () => {
    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftGenerationContentStorage(baseInput(), { commitLogPath: tempCommitLogPath() }),
      /QuestionBankDraftContentStoragePort\.saveReviewedQuestionBankDraftContent is required/u,
    );

    const unsafePrincipal = baseInput();
    unsafePrincipal.principal.role = "TEACHER";
    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftGenerationContentStorage(unsafePrincipal, {
        questionBankDraftContentStoragePort: recordingPort(),
        commitLogPath: tempCommitLogPath(),
      }),
      /input\.principal\.role must be SERVICE/u,
    );

    const unsafeSource = baseInput();
    unsafeSource.teacherReviewReport.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationTeacherReview.result.teacherReview.executionState = "TEACHER_REVIEW_STORED";
    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftGenerationContentStorage(unsafeSource, {
        questionBankDraftContentStoragePort: recordingPort(),
        commitLogPath: tempCommitLogPath(),
      }),
      /source\.teacherReview\.executionState must be TEACHER_REVIEW_RECORDED_NOT_STORED/u,
    );

    for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "studentVisiblePublishAllowed", "studentAnsweringAllowed", "scoringAllowed", "modelInferenceAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.contentStorageCommitPolicy[field] = true;
      await assert.rejects(
        () => commitStudentAppAITutorQuestionBankDraftGenerationContentStorage(input, {
          questionBankDraftContentStoragePort: recordingPort(),
          commitLogPath: tempCommitLogPath(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }
  });

  it("rejects leaked model fields, mismatched envelope linkage, unsafe text, and unsafe port results", async () => {
    const leaked = baseInput();
    leaked.teacherReviewReport.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationTeacherReview.result.rawModelOutput = "leak";
    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftGenerationContentStorage(leaked, {
        questionBankDraftContentStoragePort: recordingPort(),
        commitLogPath: tempCommitLogPath(),
      }),
      /rawModelOutput is not allowed/u,
    );

    const mismatchedEnvelope = baseInput();
    mismatchedEnvelope.generationInputEnvelopeReport.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationInputEnvelope.result.inputEnvelope.studentId = "student_other";
    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftGenerationContentStorage(mismatchedEnvelope, {
        questionBankDraftContentStoragePort: recordingPort(),
        commitLogPath: tempCommitLogPath(),
      }),
      /source\.inputEnvelope\.studentId must be student_001/u,
    );

    const unsafeText = baseInput();
    unsafeText.teacherReviewReport.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationTeacherReview.result.teacherReview.reviewedItems[0].questionText = "<script>unsafe</script>";
    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftGenerationContentStorage(unsafeText, {
        questionBankDraftContentStoragePort: recordingPort(),
        commitLogPath: tempCommitLogPath(),
      }),
      /must be encoded safe text/u,
    );

    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftGenerationContentStorage(baseInput(), {
        questionBankDraftContentStoragePort: recordingPort({ persisted: false }),
        commitLogPath: tempCommitLogPath(),
      }),
      /result\.persisted must be true/u,
    );
  });

  it("requires teacher review and input envelope evidence and keeps publication, answering, and scoring future-gated", async () => {
    const missingReviewEvidence = baseInput();
    missingReviewEvidence.evidenceRefs = [
      "evidence:generation-input-envelope:qbank_generation_input_envelope_tutor_req_student_app_001",
      "evidence:other:teacher-review-missing",
    ];
    await assert.rejects(
      () => commitStudentAppAITutorQuestionBankDraftGenerationContentStorage(missingReviewEvidence, {
        questionBankDraftContentStoragePort: recordingPort(),
        commitLogPath: tempCommitLogPath(),
      }),
      /teacher review evidence ref is required/u,
    );

    const result = await commitStudentAppAITutorQuestionBankDraftGenerationContentStorage(baseInput(), {
      questionBankDraftContentStoragePort: recordingPort(),
      commitLogPath: tempCommitLogPath(),
    });

    assert.equal(result.boundary.requiresFutureRowVerification, true);
    assert.equal(result.boundary.requiresFutureStudentReadVerification, true);
    assert.equal(result.boundary.studentAnsweringStarted, false);
    assert.equal(result.boundary.scoringStarted, false);
    assert.equal(result.boundary.studentVisiblePublished, false);
  });
});

function tempCommitLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-generation-content-storage-commit-")), "commit.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-content-storage-commit.v1",
    commitInvocationId: "qbank_generation_content_storage_commit_001",
    teacherReviewReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-teacher-review.current.json", "utf8")),
    generationInputEnvelopeReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-input-envelope.current.json", "utf8")),
    generationPlanReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-plan.current.json", "utf8")),
    sourceRequestReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-request.current.json", "utf8")),
    principal: {
      principalId: "service_student_ai_tutor_qbank_storage",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "QUESTION_BANK_DRAFT_STORAGE_COMMIT"],
      studentAccess: { mode: "ASSIGNED", studentIds: ["student_001"] },
      sessionId: "svc_session_qbank_storage_001",
    },
    contentStorageCommitPolicy: commitPolicy(),
    evidenceRefs: [
      "evidence:generation-teacher-review:qbank_generation_review_001",
      "evidence:generation-input-envelope:qbank_generation_input_envelope_tutor_req_student_app_001",
    ],
    idempotencyKey: "student-app-ai-tutor-qbank-generation-content-storage-commit:student_001:qbank_generation_review_001",
  };
}

function commitPolicy() {
  return {
    teacherReviewRequired: true,
    generationInputEnvelopeRequired: true,
    generationPlanRequired: true,
    sourceTutorRequestRequired: true,
    injectedTeachingArchivePortRequired: true,
    teachingArchiveDomainValidationRequired: true,
    idempotentStorageCommitRequired: true,
    questionBankContentWriteAllowed: true,
    contentStoredRequired: true,
    teacherRubricInternalScoringOnly: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    studentVisiblePublishAllowed: false,
    studentAnsweringAllowed: false,
    scoringAllowed: false,
    rawModelOutputStored: false,
    modelInferenceAllowed: false,
    modelAnswerKeyGenerated: false,
    answerKeyDisclosureAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function recordingPort(overrides = {}) {
  const calls = [];
  return {
    calls,
    async saveReviewedQuestionBankDraftContent(command, context) {
      calls.push({ command, context });
      return {
        persisted: overrides.persisted ?? true,
        targetRepository: overrides.targetRepository ?? "ArchiveRepository.SaveQuestionBankDraftContent",
        targetTable: overrides.targetTable ?? "teaching_question_bank_draft_contents",
        questionBankDraftContent: overrides.questionBankDraftContent ?? {
          questionBankDraftRef: command.questionBankDraftContent.questionBankDraftRef,
          tutoringAnalysisRequestId: command.questionBankDraftContent.tutoringAnalysisRequestId,
          archiveItemId: command.questionBankDraftContent.archiveItemId,
          studentId: command.questionBankDraftContent.studentId,
          status: command.questionBankDraftContent.status,
          sourceArchiveMaterial: command.questionBankDraftContent.sourceArchiveMaterial,
          itemCount: command.questionBankDraftContent.items.length,
        },
        studentVisiblePublished: overrides.studentVisiblePublished ?? false,
        persistence: overrides.persistence ?? { commandId: "" },
      };
    },
  };
}
