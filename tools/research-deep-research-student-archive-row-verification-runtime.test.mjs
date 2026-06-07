import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_COMMAND_PORT,
  formatDeepResearchStudentArchiveRowVerification,
  verifyDeepResearchStudentArchivePhysicalRow,
} from "./research-deep-research-student-archive-row-verification-runtime.mjs";

describe("Research deep_research student archive physical row verification runtime", () => {
  it("verifies the committed Teaching Archive item through the injected row read port", async () => {
    const port = recordingRowReadPort();
    const result = await verifyDeepResearchStudentArchivePhysicalRow(baseInput(), {
      teachingArchiveRowReadPort: port,
      verificationLogPath: tempVerificationLogPath(),
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-05.research.deep-research-student-archive-row-verification-verified.v1");
    assert.equal(result.commandPort, RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_COMMAND_PORT);
    assert.equal(result.status, "TEACHING_ARCHIVE_PHYSICAL_ROW_VERIFIED");
    assert.equal(result.teachingArchivePhysicalRow.targetRepository, "ArchiveRepository.GetByID");
    assert.equal(result.teachingArchivePhysicalRow.targetTable, "teaching_archive_items");
    assert.equal(result.teachingArchivePhysicalRow.archiveItem.id, "tarch_deep_research_001");
    assert.equal(result.boundary.mainDatabaseWriteCommitted, true);
    assert.equal(result.boundary.physicalDatabaseRowVerified, true);
    assert.equal(result.boundary.directDatabaseAccessAllowed, false);
    assert.equal(result.boundary.executeHttpRequestAllowed, false);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].id, "tarch_deep_research_001");
    assert.match(formatDeepResearchStudentArchiveRowVerification(result), /Physical row verified: true/u);
  });

  it("uses idempotency for replay and rejects conflicting committed rows", async () => {
    const verificationLogPath = tempVerificationLogPath();
    const port = recordingRowReadPort();
    const first = await verifyDeepResearchStudentArchivePhysicalRow(baseInput(), { teachingArchiveRowReadPort: port, verificationLogPath });
    const second = await verifyDeepResearchStudentArchivePhysicalRow(baseInput(), { teachingArchiveRowReadPort: port, verificationLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(second.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(verificationLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.studentArchiveStorageCommitOutput.teachingArchiveCommit.archiveItem.contentRef = "research-deep-research-projection:other";
    await assert.rejects(
      () => verifyDeepResearchStudentArchivePhysicalRow(conflicting, { teachingArchiveRowReadPort: port, verificationLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects missing ports, missing rows, mismatched ids, and mismatched content refs", async () => {
    await assert.rejects(
      () => verifyDeepResearchStudentArchivePhysicalRow(baseInput(), { verificationLogPath: tempVerificationLogPath() }),
      /TeachingArchiveRowReadPort\.getArchiveItemById is required/u,
    );
    await assert.rejects(
      () => verifyDeepResearchStudentArchivePhysicalRow(baseInput(), {
        teachingArchiveRowReadPort: recordingRowReadPort({ found: false }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /result\.found must be true/u,
    );
    await assert.rejects(
      () => verifyDeepResearchStudentArchivePhysicalRow(baseInput(), {
        teachingArchiveRowReadPort: recordingRowReadPort({ row: { ...archiveItem(), id: "tarch_other" } }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /result\.row\.id must be tarch_deep_research_001/u,
    );
    await assert.rejects(
      () => verifyDeepResearchStudentArchivePhysicalRow(baseInput(), {
        teachingArchiveRowReadPort: recordingRowReadPort({ row: { ...archiveItem(), contentRef: "research-deep-research-projection:mismatch" } }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /result\.row\.contentRef must be/u,
    );
  });

  it("rejects wrong owner scope, direct DB or HTTP policies, and Swarm", async () => {
    await assert.rejects(
      () => verifyDeepResearchStudentArchivePhysicalRow(baseInput(), {
        teachingArchiveRowReadPort: recordingRowReadPort({ row: { ...archiveItem(), ownerType: "TEACHING" } }),
        verificationLogPath: tempVerificationLogPath(),
      }),
      /result\.row\.ownerType must be STUDENT/u,
    );

    for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.studentArchiveRowVerificationPolicy[field] = true;
      await assert.rejects(
        () => verifyDeepResearchStudentArchivePhysicalRow(input, {
          teachingArchiveRowReadPort: recordingRowReadPort(),
          verificationLogPath: tempVerificationLogPath(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }
  });
});

function tempVerificationLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-student-archive-row-verification-")), "verification.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-student-archive-row-verification.v1",
    verificationInvocationId: "deep_research_student_archive_row_verification_inv_001",
    studentArchiveStorageCommitOutput: JSON.parse(fs.readFileSync("contracts/agent/deep-research-student-archive-storage-commit.output.example.json", "utf8")),
    studentArchiveRowVerificationPolicy: verificationPolicy(),
    evidenceRefs: ["evidence:student-archive-row-verification:commit-consumed"],
    idempotencyKey: "deep-research-student-archive-row-verification:job-001",
  };
}

function verificationPolicy() {
  return {
    storageCommitRequired: true,
    physicalRowVerificationRequired: true,
    injectedTeachingArchiveRowReadPortRequired: true,
    teachingArchiveRepositoryReadRequired: true,
    committedArchiveItemMatchRequired: true,
    idempotentRowVerificationRequired: true,
    mainDatabaseReadAllowed: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    externalModelCallAllowed: false,
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
        row: overrides.row ?? archiveItem(),
      };
    },
  };
}

function archiveItem() {
  return {
    id: "tarch_deep_research_001",
    ownerType: "STUDENT",
    studentId: "student_001",
    materialType: "HANDOUT",
    title: "Evidence grounded learning support draft",
    source: "SYSTEM_IMPORT",
    contentRef: "research-deep-research-projection:deep_research_student_archive_projection_001:sha256_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    tags: ["deep_research", "student_archive", "projection", "math_unit"],
    analysisIntents: ["ARCHIVE_ONLY", "TUTORING"],
    ocrStatus: "NOT_REQUIRED",
    createdAt: "2026-06-05T00:00:00.000Z",
  };
}
