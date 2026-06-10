import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION_PORT,
  formatStudentAppAITutorResultStudentArchiveRowVerification,
  verifyStudentAppAITutorResultStudentArchivePhysicalRow,
} from "./student-app-ai-tutor-result-student-archive-row-verification-runtime.mjs";

describe("Student App AI Tutor result student archive row verification runtime", () => {
  it("verifies the committed result archive item through the injected row read port", async () => {
    const port = recordingRowReadPort();
    const result = await verifyStudentAppAITutorResultStudentArchivePhysicalRow(baseInput(), {
      teachingArchiveRowReadPort: port,
      verificationLogPath: tempVerificationLogPath(),
      generatedAt: "2026-06-08T12:30:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-08.student-app.ai-tutor-result-student-archive-row-verified.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_ROW_VERIFICATION_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PHYSICAL_ROW_VERIFIED");
    assert.equal(result.sourceStorageCommit.archiveItemId, "tarch_student_ai_tutor_result_001");
    assert.equal(result.teachingArchivePhysicalRow.targetRepository, "ArchiveRepository.GetByID");
    assert.equal(result.teachingArchivePhysicalRow.archiveItem.id, "tarch_student_ai_tutor_result_001");
    assert.equal(result.boundary.teachingArchiveRowReadPortInvoked, true);
    assert.equal(result.boundary.physicalDatabaseRowVerified, true);
    assert.equal(result.boundary.directDatabaseAccessAllowed, false);
    assert.equal(result.safeGuidanceSnapshot.safeGuidanceOnly, true);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].id, "tarch_student_ai_tutor_result_001");
    assert.match(formatStudentAppAITutorResultStudentArchiveRowVerification(result), /Physical row verified: true/u);
  });

  it("uses idempotency for replay and rejects conflicting committed rows", async () => {
    const verificationLogPath = tempVerificationLogPath();
    const port = recordingRowReadPort();
    const first = await verifyStudentAppAITutorResultStudentArchivePhysicalRow(baseInput(), { teachingArchiveRowReadPort: port, verificationLogPath });
    const replay = await verifyStudentAppAITutorResultStudentArchivePhysicalRow(baseInput(), { teachingArchiveRowReadPort: port, verificationLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(verificationLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.verificationInvocationId = "ai_tutor_result_archive_row_verification_conflict";
    await assert.rejects(
      () => verifyStudentAppAITutorResultStudentArchivePhysicalRow(conflicting, { teachingArchiveRowReadPort: port, verificationLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects missing ports, missing rows, mismatched ids, and mismatched content refs", async () => {
    await assert.rejects(
      () => verifyStudentAppAITutorResultStudentArchivePhysicalRow(baseInput(), { verificationLogPath: tempVerificationLogPath() }),
      /TeachingArchiveRowReadPort\.getArchiveItemById is required/u,
    );
    await assert.rejects(
      () => verifyStudentAppAITutorResultStudentArchivePhysicalRow(baseInput(), {
        teachingArchiveRowReadPort: recordingRowReadPort({ found: false }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /TeachingArchiveRowReadPort result\.found must be true/u,
    );
    await assert.rejects(
      () => verifyStudentAppAITutorResultStudentArchivePhysicalRow(baseInput(), {
        teachingArchiveRowReadPort: recordingRowReadPort({ row: { ...committedArchiveItem(), id: "tarch_other" } }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /TeachingArchiveRowReadPort result\.row\.id must be tarch_student_ai_tutor_result_001/u,
    );
    await assert.rejects(
      () => verifyStudentAppAITutorResultStudentArchivePhysicalRow(baseInput(), {
        teachingArchiveRowReadPort: recordingRowReadPort({ row: { ...committedArchiveItem(), contentRef: "student-ai-tutor-result-archive:changed:sha256_bad" } }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /TeachingArchiveRowReadPort result\.row\.contentRef must be/u,
    );
  });

  it("rejects wrong owner scope, direct DB or HTTP policies, Swarm, and leaked fields", async () => {
    await assert.rejects(
      () => verifyStudentAppAITutorResultStudentArchivePhysicalRow(baseInput(), {
        teachingArchiveRowReadPort: recordingRowReadPort({ row: { ...committedArchiveItem(), ownerType: "TEACHING" } }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /ownerType must be STUDENT/u,
    );

    for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.studentArchiveRowVerificationPolicy[field] = true;
      await assert.rejects(
        () => verifyStudentAppAITutorResultStudentArchivePhysicalRow(input, {
          teachingArchiveRowReadPort: recordingRowReadPort(),
          verificationLogPath: tempVerificationLogPath(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }

    const leaked = baseInput();
    leaked.studentArchiveStorageCommitReport.runtimeProbes.studentAppAiTutorResultStudentArchiveStorageCommit.result.rawModelOutput = "leak";
    await assert.rejects(
      () => verifyStudentAppAITutorResultStudentArchivePhysicalRow(leaked, {
        teachingArchiveRowReadPort: recordingRowReadPort(),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /rawModelOutput/u,
    );
  });

  it("verifies a result-archive-sourced committed row through the same row read port", async () => {
    const port = recordingRowReadPort({ row: resultArchiveCommittedArchiveItem() });
    const result = await verifyStudentAppAITutorResultStudentArchivePhysicalRow(resultArchiveInput(), {
      teachingArchiveRowReadPort: port,
      verificationLogPath: tempVerificationLogPath(),
      generatedAt: "2026-06-09T14:10:00.000Z",
    });

    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PHYSICAL_ROW_VERIFIED");
    assert.equal(result.sourceStorageCommit.learningActionSource, "AI_TUTOR_RESULT_ARCHIVE");
    assert.equal(result.sourceStorageCommit.resultArchiveStatus, "READY_FOR_STUDENT_APP_READ");
    assert.equal(result.safeGuidanceSnapshot.learningActionSource, "AI_TUTOR_RESULT_ARCHIVE");
    assert.equal(result.safeGuidanceSnapshot.guidanceSectionsHash, "747203bfbeca35e36a136f3998121af114471e4a5c02f51c843a4dfee159292c");
    assert.equal(result.teachingArchivePhysicalRow.archiveItem.contentRef, resultArchiveCommittedArchiveItem().contentRef);
    assert.equal(result.boundary.physicalDatabaseRowVerified, true);
    assert.equal(port.calls.length, 1);
  });

  it("rejects unsafe result-archive row verification source metadata", async () => {
    const unsafeSource = resultArchiveInput();
    unsafeSource.studentArchiveStorageCommitReport.runtimeProbes.studentAppAiTutorResultArchiveStudentArchiveStorageCommit.result.sourcePersistenceCommand.learningActionSource = "PUBLISHED_ARCHIVE_ITEM";
    await assert.rejects(
      () => verifyStudentAppAITutorResultStudentArchivePhysicalRow(unsafeSource, {
        teachingArchiveRowReadPort: recordingRowReadPort({ row: resultArchiveCommittedArchiveItem() }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /learningActionSource/u,
    );

    const unsafeReport = resultArchiveInput();
    unsafeReport.studentArchiveStorageCommitReport.safetyInvariants.resultArchiveStatusRequired = "STALE_RESULT_ARCHIVE";
    await assert.rejects(
      () => verifyStudentAppAITutorResultStudentArchivePhysicalRow(unsafeReport, {
        teachingArchiveRowReadPort: recordingRowReadPort({ row: resultArchiveCommittedArchiveItem() }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /resultArchiveStatusRequired/u,
    );
  });
});

function tempVerificationLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-result-archive-row-verification-")), "verification.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-archive-row-verification.v1",
    verificationInvocationId: "ai_tutor_result_archive_row_verification_001",
    studentArchiveStorageCommitReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-result-student-archive-storage-commit.current.json", "utf8")),
    studentArchiveRowVerificationPolicy: rowVerificationPolicy(),
    evidenceRefs: ["evidence:student-app-ai-tutor-result-student-archive-storage-commit:tutor_req_student_app_001"],
    idempotencyKey: "student-app-ai-tutor-result-archive-row-verification:student_001:tutor_req_student_app_001",
  };
}

function resultArchiveInput() {
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-archive-row-verification.v1",
    verificationInvocationId: "ai_tutor_result_archive_row_verification_result_archive_001",
    studentArchiveStorageCommitReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-result-archive-student-archive-storage-commit.current.json", "utf8")),
    studentArchiveRowVerificationPolicy: rowVerificationPolicy(),
    evidenceRefs: ["evidence:student-app-ai-tutor-result-archive-student-archive-storage-commit:tutor_req_student_app_result_archive_001"],
    idempotencyKey: "student-app-ai-tutor-result-archive-row-verification:student_001:tutor_req_student_app_result_archive_001",
  };
}

function rowVerificationPolicy() {
  return {
    storageCommitRequired: true,
    physicalRowVerificationRequired: true,
    injectedTeachingArchiveRowReadPortRequired: true,
    teachingArchiveRepositoryReadRequired: true,
    committedArchiveItemMatchRequired: true,
    preserveSafeGuidanceRequired: true,
    preserveStudentVisibilityEvidenceRequired: true,
    studentOwnScopeRequired: true,
    idempotentRowVerificationRequired: true,
    mainDatabaseReadAllowed: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    modelInferenceAllowed: false,
    answerKeyDisclosureAllowed: false,
    rawModelOutputDisclosureAllowed: false,
    resultRefDisclosureAllowed: false,
    promptDisclosureAllowed: false,
    contentRefDisclosureAllowed: false,
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
  const report = JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-result-student-archive-storage-commit.current.json", "utf8"));
  return report.runtimeProbes.studentAppAiTutorResultStudentArchiveStorageCommit.result.teachingArchiveCommit.archiveItem;
}

function resultArchiveCommittedArchiveItem() {
  const report = JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-result-archive-student-archive-storage-commit.current.json", "utf8"));
  return report.runtimeProbes.studentAppAiTutorResultArchiveStudentArchiveStorageCommit.result.teachingArchiveCommit.archiveItem;
}
