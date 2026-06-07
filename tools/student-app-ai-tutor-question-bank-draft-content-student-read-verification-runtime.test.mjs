import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION_PORT,
  formatStudentAppAITutorQuestionBankDraftContentStudentReadVerification,
  verifyStudentAppAITutorQuestionBankDraftContentStudentRead,
} from "./student-app-ai-tutor-question-bank-draft-content-student-read-verification-runtime.mjs";

describe("Student App AI Tutor question-bank draft content student read verification runtime", () => {
  it("verifies own-student safe content reads through the injected read port", async () => {
    const port = recordingStudentReadPort();
    const result = await verifyStudentAppAITutorQuestionBankDraftContentStudentRead(baseInput(), {
      studentQuestionBankDraftContentReadPort: port,
      verificationLogPath: tempVerificationLogPath(),
      generatedAt: "2026-06-06T19:00:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-06.student-app.ai-tutor-question-bank-draft-content-student-read-verified.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFIED");
    assert.equal(result.studentReadSource.targetUseCase, "ReadStudentAppQuestionBankDraftContent.Execute");
    assert.equal(result.studentReadSource.repository, "ArchiveRepository.GetQuestionBankDraftContentForStudent");
    assert.equal(result.studentReadSource.endpoint, "GET /v1/student-app/question-bank-draft-content");
    assert.equal(result.studentQuestionBankDraftContent.questionBankDraftRef, "local://question-bank-drafts/tutor_req_student_app_001.json");
    assert.equal(result.studentQuestionBankDraftContent.items.length, 3);
    assert.equal("expectedAnswer" in result.studentQuestionBankDraftContent.items[0], false);
    assert.equal("explanation" in result.studentQuestionBankDraftContent.items[0], false);
    assert.equal("studentId" in result.studentQuestionBankDraftContent, false);
    assert.equal(result.boundary.ownStudentSafeReadVerified, true);
    assert.equal(result.boundary.safeStudentResponseMatchedVerifiedPreview, true);
    assert.equal(result.boundary.requiresFutureAnsweringAndScoring, true);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].request.principal.studentAccess.ownStudentId, "student_001");
    assert.equal(port.calls[0].request.questionBankDraftRef, "local://question-bank-drafts/tutor_req_student_app_001.json");
    assert.match(formatStudentAppAITutorQuestionBankDraftContentStudentReadVerification(result), /Own-student safe read verified: true/u);
  });

  it("uses idempotency for replay and rejects conflicting student read verification", async () => {
    const verificationLogPath = tempVerificationLogPath();
    const port = recordingStudentReadPort();
    const first = await verifyStudentAppAITutorQuestionBankDraftContentStudentRead(baseInput(), {
      studentQuestionBankDraftContentReadPort: port,
      verificationLogPath,
    });
    const replay = await verifyStudentAppAITutorQuestionBankDraftContentStudentRead(baseInput(), {
      studentQuestionBankDraftContentReadPort: port,
      verificationLogPath,
    });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(verificationLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.verificationInvocationId = "qbank_content_student_read_verification_conflict";
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftContentStudentRead(conflicting, {
        studentQuestionBankDraftContentReadPort: port,
        verificationLogPath,
      }),
      /idempotency key already exists/u,
    );
  });

  it("rejects missing port, missing content, cross-student principal, and mismatched safe responses", async () => {
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftContentStudentRead(baseInput(), { verificationLogPath: tempVerificationLogPath() }),
      /StudentQuestionBankDraftContentReadPort\.readStudentAppQuestionBankDraftContent is required/u,
    );

    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftContentStudentRead(baseInput(), {
        studentQuestionBankDraftContentReadPort: recordingStudentReadPort({ found: false }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /result\.found must be true/u,
    );

    const crossStudent = baseInput();
    crossStudent.principal.studentAccess.ownStudentId = "student_999";
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftContentStudentRead(crossStudent, {
        studentQuestionBankDraftContentReadPort: recordingStudentReadPort(),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /ownStudentId must be student_001/u,
    );

    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftContentStudentRead(baseInput(), {
        studentQuestionBankDraftContentReadPort: recordingStudentReadPort({ response: { items: [{ questionText: "Different safe text" }] } }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /result\.response\.safeItems must be/u,
    );
  });

  it("rejects answer, explanation, student id, worker, score, unsafe text, DB, HTTP, model, and Swarm leaks", async () => {
    for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "studentAnsweringAllowed", "scoringAllowed", "modelInferenceAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.studentReadVerificationPolicy[field] = true;
      await assert.rejects(
        () => verifyStudentAppAITutorQuestionBankDraftContentStudentRead(input, {
          studentQuestionBankDraftContentReadPort: recordingStudentReadPort(),
          verificationLogPath: tempVerificationLogPath(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }

    for (const leakedField of ["expectedAnswer", "explanation", "studentId", "workerId", "score"]) {
      await assert.rejects(
        () => verifyStudentAppAITutorQuestionBankDraftContentStudentRead(baseInput(), {
          studentQuestionBankDraftContentReadPort: recordingStudentReadPort({ response: leakedField === "studentId" ? { studentId: "student_001" } : { items: [{ [leakedField]: "leak" }] } }),
          verificationLogPath: tempVerificationLogPath(),
        }),
        new RegExp(`${leakedField} is not allowed`, "u"),
      );
    }

    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftContentStudentRead(baseInput(), {
        studentQuestionBankDraftContentReadPort: recordingStudentReadPort({ response: { items: [{ questionText: "<script>unsafe</script>" }] } }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /must be encoded safe text/u,
    );
  });

  it("requires row verification and content read foundation evidence while keeping answering and scoring future-gated", async () => {
    const missingRowEvidence = baseInput();
    missingRowEvidence.evidenceRefs = ["evidence:content-read-foundation:0265", "evidence:other"];
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftContentStudentRead(missingRowEvidence, {
        studentQuestionBankDraftContentReadPort: recordingStudentReadPort(),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /content row verification evidence ref is required/u,
    );

    const missingReadEvidence = baseInput();
    missingReadEvidence.evidenceRefs = ["evidence:content-row-verification:0286", "evidence:other"];
    await assert.rejects(
      () => verifyStudentAppAITutorQuestionBankDraftContentStudentRead(missingReadEvidence, {
        studentQuestionBankDraftContentReadPort: recordingStudentReadPort(),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /content read foundation evidence ref is required/u,
    );

    const result = await verifyStudentAppAITutorQuestionBankDraftContentStudentRead(baseInput(), {
      studentQuestionBankDraftContentReadPort: recordingStudentReadPort(),
      verificationLogPath: tempVerificationLogPath(),
    });

    assert.equal(result.boundary.studentAnsweringStarted, false);
    assert.equal(result.boundary.scoringStarted, false);
    assert.equal(result.boundary.answerKeyDisclosed, false);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.equal(result.boundary.requiresFutureAnsweringAndScoring, true);
  });
});

function tempVerificationLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-content-student-read-verification-")), "verification.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-content-student-read-verification.v1",
    verificationInvocationId: "qbank_content_student_read_verification_001",
    principal: {
      principalId: "student_principal_001",
      sessionId: "student_session_001",
      subjectType: "USER",
      role: "STUDENT",
      entryPoint: "STUDENT_APP",
      scopes: ["STUDENT_OWN_READ"],
      studentAccess: { mode: "OWN", ownStudentId: "student_001" },
    },
    contentRowVerificationReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-content-row-verification.current.json", "utf8")),
    contentReadFoundationReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-content-read.current.json", "utf8")),
    studentReadVerificationPolicy: verificationPolicy(),
    evidenceRefs: [
      "evidence:content-row-verification:student-app-ai-tutor-qbank-generation-content-row-verification",
      "evidence:content-read-foundation:student-app-ai-tutor-question-bank-draft-content-read",
    ],
    idempotencyKey: "student-app-ai-tutor-qbank-content-student-read-verification:student_001:qbank_generation_review_001",
  };
}

function verificationPolicy() {
  return {
    contentRowVerificationRequired: true,
    contentReadFoundationRequired: true,
    injectedStudentContentReadPortRequired: true,
    ownStudentPrincipalRequired: true,
    safeStudentResponseRequired: true,
    safePreviewMatchRequired: true,
    idempotentStudentReadVerificationRequired: true,
    goUseCaseReadAllowed: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    studentAnsweringAllowed: false,
    scoringAllowed: false,
    answerKeyDisclosureAllowed: false,
    expectedAnswerDisclosureAllowed: false,
    explanationDisclosureAllowed: false,
    studentIdDisclosureAllowed: false,
    workerStateDisclosureAllowed: false,
    modelInferenceAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function recordingStudentReadPort(overrides = {}) {
  const calls = [];
  return {
    calls,
    async readStudentAppQuestionBankDraftContent(request, context) {
      calls.push({ request, context });
      const rowVerification = JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-question-bank-draft-generation-content-row-verification.current.json", "utf8"))
        .runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationContentRowVerification.result;
      const response = buildSafeResponse(rowVerification);
      return {
        found: overrides.found ?? true,
        source: overrides.source ?? {
          targetUseCase: "ReadStudentAppQuestionBankDraftContent.Execute",
          repository: "ArchiveRepository.GetQuestionBankDraftContentForStudent",
          endpoint: "GET /v1/student-app/question-bank-draft-content",
          ownStudentOnly: true,
          studentScopedLookup: true,
          principalId: request.principal.principalId,
        },
        response: mergeResponse(response, overrides.response ?? {}),
      };
    },
  };
}

function buildSafeResponse(rowVerification) {
  const row = rowVerification.questionBankDraftContentRow;
  return {
    questionBankDraftRef: row.questionBankDraftRef,
    tutoringAnalysisRequestId: row.tutoringAnalysisRequestId,
    archiveItemId: row.archiveItemId,
    sourceArchiveMaterial: row.sourceArchiveMaterial,
    resultSummary: row.resultSummary,
    items: rowVerification.safeStudentContentPreview.items.map((item) => ({ ...item })),
    createdAt: "2026-06-06T18:00:00.000Z",
    updatedAt: "2026-06-06T18:05:00.000Z",
  };
}

function mergeResponse(response, overrides) {
  const merged = { ...response, ...overrides };
  if (Array.isArray(overrides.items)) {
    merged.items = response.items.map((item, index) => ({ ...item, ...(overrides.items[index] ?? {}) }));
  }
  return merged;
}
