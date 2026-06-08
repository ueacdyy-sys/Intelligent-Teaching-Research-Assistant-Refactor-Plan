import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_PORT,
  formatStudentAppAITutorResultStudentArchiveRead,
  verifyStudentAppAITutorResultStudentArchiveRead,
} from "./student-app-ai-tutor-result-student-archive-read-runtime.mjs";

describe("Student App AI Tutor result student archive read runtime", () => {
  it("reads a safe student-visible result card through the injected product read port", async () => {
    const port = recordingReadPort();
    const result = await verifyStudentAppAITutorResultStudentArchiveRead(baseInput(), {
      studentAppAITutorResultArchiveReadPort: port,
      verificationLogPath: tempLogPath(),
      generatedAt: "2026-06-08T14:10:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-08.student-app.ai-tutor-result-student-archive-read-verified.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_VERIFIED");
    assert.equal(result.studentResultReadSource.useCase, "ReadStudentAppAITutorResultArchive.Execute");
    assert.equal(result.resultArchiveCard.archiveItemId, "tarch_student_ai_tutor_result_001");
    assert.equal(result.boundary.studentVisibleResultCardReadVerified, true);
    assert.equal(result.boundary.contentRefDisclosed, false);
    assert.equal(port.calls.length, 1);
    assert.equal(collectKeys(result).has("contentRef"), false);
    assert.match(formatStudentAppAITutorResultStudentArchiveRead(result), /Student visible card verified: true/u);
  });

  it("uses idempotency for replay and rejects conflicting result-card reads", async () => {
    const verificationLogPath = tempLogPath();
    const port = recordingReadPort();
    const first = await verifyStudentAppAITutorResultStudentArchiveRead(baseInput(), { studentAppAITutorResultArchiveReadPort: port, verificationLogPath });
    const replay = await verifyStudentAppAITutorResultStudentArchiveRead(baseInput(), { studentAppAITutorResultArchiveReadPort: port, verificationLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);

    const conflicting = baseInput();
    conflicting.readInvocationId = "ai_tutor_result_archive_read_conflict";
    await assert.rejects(
      () => verifyStudentAppAITutorResultStudentArchiveRead(conflicting, { studentAppAITutorResultArchiveReadPort: port, verificationLogPath }),
      /record\.inputHash/u,
    );
  });

  it("rejects missing port, missing card, cross-student principal, and mismatched card", async () => {
    await assert.rejects(
      () => verifyStudentAppAITutorResultStudentArchiveRead(baseInput(), { verificationLogPath: tempLogPath() }),
      /readStudentVisibleArchivedResult is required/u,
    );
    await assert.rejects(
      () => verifyStudentAppAITutorResultStudentArchiveRead(baseInput(), { studentAppAITutorResultArchiveReadPort: recordingReadPort({ found: false }), verificationLogPath: tempLogPath() }),
      /result\.found must be true/u,
    );

    const crossStudent = baseInput();
    crossStudent.principal.studentAccess.ownStudentId = "student_002";
    await assert.rejects(
      () => verifyStudentAppAITutorResultStudentArchiveRead(crossStudent, { studentAppAITutorResultArchiveReadPort: recordingReadPort(), verificationLogPath: tempLogPath() }),
      /ownStudentId must be student_001/u,
    );

    await assert.rejects(
      () => verifyStudentAppAITutorResultStudentArchiveRead(baseInput(), {
        studentAppAITutorResultArchiveReadPort: recordingReadPort({ card: { ...safeCard(), summary: "Changed" } }),
        verificationLogPath: tempLogPath(),
      }),
      /card\.summary must be/u,
    );
  });

  it("rejects unsafe policy, leaked fields, and missing evidence", async () => {
    for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "swarmAllowed", "contentRefDisclosureAllowed"]) {
      const input = baseInput();
      input.studentArchiveReadPolicy[field] = true;
      await assert.rejects(
        () => verifyStudentAppAITutorResultStudentArchiveRead(input, { studentAppAITutorResultArchiveReadPort: recordingReadPort(), verificationLogPath: tempLogPath() }),
        new RegExp(`${field} must be false`, "u"),
      );
    }

    await assert.rejects(
      () => verifyStudentAppAITutorResultStudentArchiveRead(baseInput(), {
        studentAppAITutorResultArchiveReadPort: recordingReadPort({ card: { ...safeCard(), contentRef: "leak" } }),
        verificationLogPath: tempLogPath(),
      }),
      /contentRef/u,
    );

    const missingEvidence = baseInput();
    missingEvidence.evidenceRefs = [
      "evidence:student-app-ai-tutor-result-archive-read:http",
      "evidence:student-app-ai-tutor-result-archive-read:contract",
    ];
    await assert.rejects(
      () => verifyStudentAppAITutorResultStudentArchiveRead(missingEvidence, { studentAppAITutorResultArchiveReadPort: recordingReadPort(), verificationLogPath: tempLogPath() }),
      /row verification evidence ref is required/u,
    );
  });
});

function tempLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-result-archive-read-")), "verification.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-archive-read.v1",
    readInvocationId: "ai_tutor_result_archive_read_001",
    principal: studentPrincipal(),
    studentArchiveRowVerificationReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-result-student-archive-row-verification.current.json", "utf8")),
    studentArchiveReadPolicy: readPolicy(),
    evidenceRefs: [
      "evidence:student-archive-row-verification:student-app-ai-tutor-result-student-archive-row-verification",
      "evidence:student-app-ai-tutor-result-archive-read:http",
    ],
    idempotencyKey: "student-app-ai-tutor-result-archive-read:student_001:tutor_req_student_app_001",
  };
}

function studentPrincipal() {
  return {
    principalId: "student_001",
    sessionId: "sess_student_001",
    subjectType: "USER",
    role: "STUDENT",
    entryPoint: "STUDENT_APP",
    scopes: ["STUDENT_OWN_READ"],
    studentAccess: { mode: "OWN", ownStudentId: "student_001" },
  };
}

function readPolicy() {
  return {
    rowVerificationRequired: true,
    ownStudentPrincipalRequired: true,
    studentVisibleResultCardRequired: true,
    safeGuidanceSnapshotRequired: true,
    injectedStudentResultArchiveReadPortRequired: true,
    goUseCaseReadAllowed: true,
    httpEndpointContractRequired: true,
    idempotentReadVerificationRequired: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    modelInferenceAllowed: false,
    answerKeyDisclosureAllowed: false,
    rawModelOutputDisclosureAllowed: false,
    resultRefDisclosureAllowed: false,
    promptDisclosureAllowed: false,
    contentRefDisclosureAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function recordingReadPort(overrides = {}) {
  const calls = [];
  return {
    calls,
    async readStudentVisibleArchivedResult(request, context) {
      calls.push({ request, context });
      return {
        found: overrides.found ?? true,
        source: overrides.source ?? {
          endpoint: "GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result",
          useCase: "ReadStudentAppAITutorResultArchive.Execute",
          repository: "ArchiveRepository.GetByID",
          snapshotRepository: "ArchiveRepository.GetStudentAppAITutorResultArchiveSnapshot",
          ownStudentOnly: true,
          rowVerificationSourceVerified: true,
        },
        card: overrides.card ?? safeCard(),
      };
    },
  };
}

function safeCard() {
  const source = JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-result-student-archive-row-verification.current.json", "utf8"))
    .runtimeProbes.studentAppAiTutorResultStudentArchiveRowVerification.result;
  const item = source.teachingArchivePhysicalRow.archiveItem;
  const snapshot = source.safeGuidanceSnapshot;
  return {
    archiveItemId: item.id,
    status: "READY_FOR_STUDENT_APP_READ",
    materialType: item.materialType,
    title: item.title,
    source: item.source,
    tags: item.tags,
    analysisIntents: item.analysisIntents,
    ocrStatus: item.ocrStatus,
    summary: snapshot.summary,
    guidanceSections: snapshot.guidanceSections.map((section) => ({
      sectionId: section.sectionId ?? section.sectionID,
      title: section.title,
      text: section.text,
      sourceBlockRefs: section.sourceBlockRefs,
    })),
    guidanceSectionsHash: snapshot.guidanceSectionsHash,
    safetyLabels: snapshot.safetyLabels,
    createdAt: item.createdAt,
  };
}

function collectKeys(value, keys = new Set()) {
  if (!value || typeof value !== "object") return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.add(key);
    collectKeys(child, keys);
  }
  return keys;
}
