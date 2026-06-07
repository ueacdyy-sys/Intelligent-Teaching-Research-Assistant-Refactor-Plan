import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_PORT,
  formatTeachingArchiveMaterialDraftStudentProductRead,
  verifyTeachingArchiveMaterialDraftStudentProductRead,
} from "./teaching-archive-material-draft-student-product-read-runtime.mjs";

describe("TeachingArchiveMaterialDraftStudentProductReadPort.verifyStudentAppArchiveItemsRead", () => {
  it("verifies a student product read through the injected product read port", async () => {
    const port = recordingProductReadPort();
    const result = await verifyTeachingArchiveMaterialDraftStudentProductRead(baseInput(), {
      verificationLogPath: tempVerificationLogPath(),
      generatedAt: "2026-06-07T08:20:00.000Z",
      studentAppArchiveItemsProductReadPort: port,
    });

    assert.equal(result.commandPort, TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_PORT);
    assert.equal(result.status, "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_VERIFIED");
    assert.equal(result.studentProductReadSource.endpoint, "GET /v1/student-app/archive-items");
    assert.equal(result.studentProductReadSource.useCase, "ListStudentAppArchiveItems.Execute");
    assert.equal(result.studentProductReadSource.repository, "ArchiveRepository.List");
    assert.equal(result.studentProductArchiveItem.id, "tarch_archive_material_001");
    assert.equal(result.studentProductArchiveItem.studentId, "student_001");
    assert.equal(result.boundary.ownStudentProductReadVerified, true);
    assert.equal(result.boundary.productResponseMatchedPhysicalRow, true);
    assert.equal(result.boundary.directDatabaseAccessAllowed, false);
    assert.equal(result.boundary.executeHttpRequestAllowed, false);
    assert.equal(result.boundary.swarmAllowed, false);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].request.materialType, "HANDOUT");
    assert.equal(port.calls[0].request.principal.studentAccess.ownStudentId, "student_001");
    assert.match(formatTeachingArchiveMaterialDraftStudentProductRead(result), /Own-student product read verified: true/u);
  });

  it("uses idempotency for replay and rejects conflicting product read verification", async () => {
    const verificationLogPath = tempVerificationLogPath();
    const port = recordingProductReadPort();
    const first = await verifyTeachingArchiveMaterialDraftStudentProductRead(baseInput(), {
      verificationLogPath,
      studentAppArchiveItemsProductReadPort: port,
    });
    const replay = await verifyTeachingArchiveMaterialDraftStudentProductRead(baseInput(), {
      verificationLogPath,
      studentAppArchiveItemsProductReadPort: recordingProductReadPort(),
    });

    assert.equal(first.recordId, replay.recordId);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(verificationLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.verificationInvocationId = "archive_material_draft_student_product_read_conflict";
    await assert.rejects(
      () => verifyTeachingArchiveMaterialDraftStudentProductRead(conflicting, {
        verificationLogPath,
        studentAppArchiveItemsProductReadPort: recordingProductReadPort(),
      }),
      /record\.inputHash/u,
    );
  });

  it("rejects missing port, cross-student principal, missing product row, and mismatched product response", async () => {
    await assert.rejects(
      () => verifyTeachingArchiveMaterialDraftStudentProductRead(baseInput(), { verificationLogPath: tempVerificationLogPath() }),
      /StudentAppArchiveItemsProductReadPort\.listStudentAppArchiveItems is required/u,
    );

    const crossStudent = baseInput();
    crossStudent.principal.studentAccess.ownStudentId = "student_999";
    await assert.rejects(
      () => verifyTeachingArchiveMaterialDraftStudentProductRead(crossStudent, {
        verificationLogPath: tempVerificationLogPath(),
        studentAppArchiveItemsProductReadPort: recordingProductReadPort(),
      }),
      /ownStudentId must be student_001/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialDraftStudentProductRead(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppArchiveItemsProductReadPort: recordingProductReadPort({ response: { data: [otherStudentArchiveItem()] } }),
      }),
      /outside own-student scope/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialDraftStudentProductRead(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppArchiveItemsProductReadPort: recordingProductReadPort({ response: { data: [{ ...archiveItem(), title: "Different title" }] } }),
      }),
      /productResponse\.title/u,
    );
  });

  it("rejects unsafe policy, leaked fields, unsafe text, product HTTP or raw DB claims, and future work collapse", async () => {
    for (const field of ["directDatabaseAccessAllowed", "executeHttpRequestAllowed", "ocrOrRagJobWriteAllowed", "aiGradingWriteAllowed", "modelInferenceAllowed", "publicationAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.productReadPolicy[field] = true;
      await assert.rejects(
        () => verifyTeachingArchiveMaterialDraftStudentProductRead(input, {
          verificationLogPath: tempVerificationLogPath(),
          studentAppArchiveItemsProductReadPort: recordingProductReadPort(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }

    await assert.rejects(
      () => verifyTeachingArchiveMaterialDraftStudentProductRead(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppArchiveItemsProductReadPort: recordingProductReadPort({ response: { data: [{ ...archiveItem(), rawModelOutput: "leak" }] } }),
      }),
      /rawModelOutput is not allowed/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialDraftStudentProductRead(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppArchiveItemsProductReadPort: recordingProductReadPort({ response: { data: [{ ...archiveItem(), title: "<script>bad</script>" }] } }),
      }),
      /contains unsafe text/u,
    );
  });

  it("requires row verification and student app product entry evidence", async () => {
    const missingRowEvidence = baseInput();
    missingRowEvidence.evidenceRefs = ["evidence:student-app-archive-items:go-http", "evidence:other"];
    await assert.rejects(
      () => verifyTeachingArchiveMaterialDraftStudentProductRead(missingRowEvidence, {
        verificationLogPath: tempVerificationLogPath(),
        studentAppArchiveItemsProductReadPort: recordingProductReadPort(),
      }),
      /storage row verification evidence ref is required/u,
    );

    const missingProductEvidence = baseInput();
    missingProductEvidence.evidenceRefs = ["evidence:storage-row-verification:0305", "evidence:other"];
    await assert.rejects(
      () => verifyTeachingArchiveMaterialDraftStudentProductRead(missingProductEvidence, {
        verificationLogPath: tempVerificationLogPath(),
        studentAppArchiveItemsProductReadPort: recordingProductReadPort(),
      }),
      /student app archive items product entry evidence ref is required/u,
    );

    const result = await verifyTeachingArchiveMaterialDraftStudentProductRead(baseInput(), {
      verificationLogPath: tempVerificationLogPath(),
      studentAppArchiveItemsProductReadPort: recordingProductReadPort(),
    });
    assert.equal(result.boundary.requiresFuturePublicationOrRagSlice, true);
    assert.equal(result.boundary.aiGradingWriteStarted, false);
    assert.equal(result.boundary.modelInferenceStarted, false);
  });
});

function tempVerificationLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "teaching-archive-material-product-read-")), "verification.jsonl");
}

function baseInput(overrides = {}) {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-draft-student-product-read.v1",
    verificationInvocationId: "archive_material_draft_student_product_read_001",
    principal: {
      principalId: "student_001",
      sessionId: "student_session_001",
      subjectType: "USER",
      role: "STUDENT",
      entryPoint: "STUDENT_APP",
      scopes: ["STUDENT_OWN_READ"],
      studentAccess: { mode: "OWN", ownStudentId: "student_001" },
    },
    rowVerificationReport: rowVerificationReport(),
    productReadPolicy: productReadPolicy(),
    evidenceRefs: [
      "evidence:storage-row-verification:0305",
      "evidence:student-app-archive-items:go-http-product-entry",
    ],
    idempotencyKey: "archive-material-draft-student-product-read:student_001:fractions_packet",
    ...overrides,
  };
}

function productReadPolicy() {
  return {
    rowVerificationRequired: true,
    ownStudentPrincipalRequired: true,
    studentAppArchiveItemsEndpointRequired: true,
    injectedProductReadPortRequired: true,
    ownStudentOnlyRequired: true,
    productResponseMustIncludeVerifiedRow: true,
    idempotentProductReadVerificationRequired: true,
    goUseCaseReadAllowed: true,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    ocrOrRagJobWriteAllowed: false,
    aiGradingWriteAllowed: false,
    modelInferenceAllowed: false,
    publicationAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function rowVerificationReport() {
  const result = {
    schemaVersion: "2026-06-07.teaching.archive-material-draft-storage-row-verified.v1",
    runtimeId: "teaching_archive_material_draft_storage_row_verification_runtime",
    commandPort: "TeachingArchiveMaterialDraftStorageRowVerificationPort.verifyTeachingArchivePhysicalRow",
    status: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PHYSICAL_ROW_VERIFIED",
    recordId: "teaching_archive_material_draft_storage_row_verification_archive-material-draft-storage-row-verification_student_001_fractions_packet",
    teachingArchivePhysicalRow: {
      operationId: "getTeachingArchiveItemById",
      targetRepository: "ArchiveRepository.GetByID",
      targetTable: "teaching_archive_items",
      archiveItem: archiveItem(),
    },
    boundary: {
      physicalDatabaseRowVerified: true,
      directDatabaseAccessAllowed: false,
    },
    evidenceRefs: ["evidence:teaching-archive-physical-row:tarch_archive_material_001"],
  };
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_ROW_VERIFICATION",
    runtime: {
      runtimeId: "teaching_archive_material_draft_storage_row_verification_runtime",
      status: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PHYSICAL_ROW_VERIFIED",
    },
    runtimeSlo: { p99Ms: 7, totalErrors: 0 },
    runtimeProbes: { teachingArchiveMaterialDraftStorageRowVerification: { result } },
    safetyInvariants: {
      storageCommitVerified: true,
      teachingArchiveRowReadPortInvoked: true,
      teachingArchiveRepositoryGetByIDUsed: true,
      committedArchiveItemMatchedPhysicalRow: true,
      physicalDatabaseRowVerified: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      swarmAllowed: false,
    },
  };
}

function recordingProductReadPort(overrides = {}) {
  const calls = [];
  return {
    calls,
    async listStudentAppArchiveItems(request, context) {
      calls.push({ request, context });
      return {
        found: true,
        source: {
          endpoint: "GET /v1/student-app/archive-items",
          useCase: "ListStudentAppArchiveItems.Execute",
          repository: "ArchiveRepository.List",
          ownStudentOnly: true,
        },
        response: {
          data: [archiveItem()],
          pageInfo: { pageSize: 10, hasMore: false, nextCursor: "" },
          ...(overrides.response ?? {}),
        },
        ...overrides,
      };
    },
  };
}

function archiveItem() {
  return {
    id: "tarch_archive_material_001",
    ownerType: "STUDENT",
    studentId: "student_001",
    materialType: "HANDOUT",
    title: "Fractions practice packet",
    source: "SYSTEM_IMPORT",
    contentRef: "precommit://archive-material/student_001/fractions-packet",
    tags: ["fractions", "draft-approved"],
    analysisIntents: ["ARCHIVE_ONLY"],
    ocrStatus: "NOT_REQUIRED",
    createdAt: "2026-06-07T08:00:00.000Z",
  };
}

function otherStudentArchiveItem() {
  return {
    ...archiveItem(),
    id: "tarch_archive_material_other",
    studentId: "student_002",
  };
}
