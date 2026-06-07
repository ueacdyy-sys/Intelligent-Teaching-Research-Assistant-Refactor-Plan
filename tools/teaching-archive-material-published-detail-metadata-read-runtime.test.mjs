import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_PORT,
  verifyTeachingArchiveMaterialPublishedDetailMetadataRead,
} from "./teaching-archive-material-published-detail-metadata-read-runtime.mjs";

test("verifies published material safe detail metadata through the Student App archive item path", async () => {
  const { logPath, cleanup } = tempLog();
  try {
    let calls = 0;
    const result = await verifyTeachingArchiveMaterialPublishedDetailMetadataRead(validInput(), {
      verificationLogPath: logPath,
      generatedAt: "2026-06-07T13:10:00.000Z",
      probeP99Ms: 6,
      studentAppPublishedMaterialDetailMetadataReadPort: {
        async getPublishedArchiveMaterialMetadata(request, metadata) {
          calls += 1;
          assert.equal(request.archiveItemId, "tarch_archive_material_001");
          assert.equal(request.principal.studentAccess.ownStudentId, "student_001");
          assert.equal(metadata.sourceSearchRecordId, "teaching_archive_material_published_search_foundation_record");
          return validPortResult();
        },
      },
    });
    assert.equal(result.status, "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_VERIFIED");
    assert.equal(result.commandPort, TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_PORT);
    assert.equal(result.studentProductDetailSource.endpoint, "GET /v1/student-app/archive-items/{archiveItemId}");
    assert.equal(result.studentProductDetailSource.repository, "ArchiveRepository.GetPublishedForStudentApp");
    assert.equal(result.boundary.contentRefExcluded, true);
    assert.equal(result.responseMetadata.contentRef, undefined);
    assert.equal(calls, 1);
  } finally {
    cleanup();
  }
});

test("uses idempotency for replay and rejects conflicting detail verification", async () => {
  const { logPath, cleanup } = tempLog();
  try {
    const port = { async getPublishedArchiveMaterialMetadata() { return validPortResult(); } };
    const first = await verifyTeachingArchiveMaterialPublishedDetailMetadataRead(validInput(), {
      verificationLogPath: logPath,
      studentAppPublishedMaterialDetailMetadataReadPort: port,
    });
    const replay = await verifyTeachingArchiveMaterialPublishedDetailMetadataRead(validInput(), {
      verificationLogPath: logPath,
      studentAppPublishedMaterialDetailMetadataReadPort: {
        async getPublishedArchiveMaterialMetadata() {
          throw new Error("port should not be called on replay");
        },
      },
    });
    assert.equal(first.inputHash, replay.inputHash);
    assert.equal(replay.idempotentReplay, true);

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublishedDetailMetadataRead({
        ...validInput(),
        archiveItemId: "tarch_archive_material_002",
        expectedArchiveItem: { ...safeArchiveItem(), id: "tarch_archive_material_002" },
      }, {
        verificationLogPath: logPath,
        studentAppPublishedMaterialDetailMetadataReadPort: port,
      }),
      /source\.search\.matchedArchiveItemId|input\.archiveItemId/u,
    );
  } finally {
    cleanup();
  }
});

test("rejects unsafe source, unsafe policy, missing port, unsafe id, and missing expected material", async () => {
  await assert.rejects(
    () => verifyTeachingArchiveMaterialPublishedDetailMetadataRead({
      ...validInput(),
      publishedSearchFoundationReport: { ...sourceReport(), readiness: "NEEDS_REMEDIATION" },
    }, { studentAppPublishedMaterialDetailMetadataReadPort: validPort() }),
    /readiness/u,
  );
  await assert.rejects(
    () => verifyTeachingArchiveMaterialPublishedDetailMetadataRead({
      ...validInput(),
      detailMetadataReadPolicy: { ...detailPolicy(), rawContentReadAllowed: true },
    }, { studentAppPublishedMaterialDetailMetadataReadPort: validPort() }),
    /rawContentReadAllowed/u,
  );
  await assert.rejects(
    () => verifyTeachingArchiveMaterialPublishedDetailMetadataRead(validInput(), {}),
    /getPublishedArchiveMaterialMetadata is required/u,
  );
  await assert.rejects(
    () => verifyTeachingArchiveMaterialPublishedDetailMetadataRead({
      ...validInput(),
      archiveItemId: "archive_material_001",
    }, { studentAppPublishedMaterialDetailMetadataReadPort: validPort() }),
    /archiveItemId/u,
  );
  await assert.rejects(
    () => verifyTeachingArchiveMaterialPublishedDetailMetadataRead(validInput(), {
      studentAppPublishedMaterialDetailMetadataReadPort: {
        async getPublishedArchiveMaterialMetadata() {
          return { ...validPortResult(), found: false };
        },
      },
    }),
    /result\.found/u,
  );
});

test("rejects generic sources, scope leaks, unpublished gaps, product metadata leaks, and missing evidence refs", async () => {
  await assert.rejects(
    () => verifyTeachingArchiveMaterialPublishedDetailMetadataRead(validInput(), {
      studentAppPublishedMaterialDetailMetadataReadPort: {
        async getPublishedArchiveMaterialMetadata() {
          return {
            ...validPortResult(),
            source: { ...validPortResult().source, repository: "ArchiveRepository.GetByID" },
          };
        },
      },
    }),
    /repository/u,
  );
  await assert.rejects(
    () => verifyTeachingArchiveMaterialPublishedDetailMetadataRead(validInput(), {
      studentAppPublishedMaterialDetailMetadataReadPort: {
        async getPublishedArchiveMaterialMetadata() {
          return {
            ...validPortResult(),
            response: { ...safeArchiveItem(), studentId: "student_002" },
          };
        },
      },
    }),
    /studentId/u,
  );
  await assert.rejects(
    () => verifyTeachingArchiveMaterialPublishedDetailMetadataRead(validInput(), {
      studentAppPublishedMaterialDetailMetadataReadPort: {
        async getPublishedArchiveMaterialMetadata() {
          return {
            ...validPortResult(),
            response: { ...safeArchiveItem(), contentRef: "precommit://archive-material/student_001/fractions-packet" },
          };
        },
      },
    }),
    /contentRef/u,
  );
  await assert.rejects(
    () => verifyTeachingArchiveMaterialPublishedDetailMetadataRead(validInput(), {
      studentAppPublishedMaterialDetailMetadataReadPort: {
        async getPublishedArchiveMaterialMetadata() {
          return {
            ...validPortResult(),
            response: { ...safeArchiveItem(), publicationState: "COMMITTED_TO_PUBLICATION_STORE" },
          };
        },
      },
    }),
    /publicationState/u,
  );
  await assert.rejects(
    () => verifyTeachingArchiveMaterialPublishedDetailMetadataRead({
      ...validInput(),
      evidenceRefs: [
        "evidence:published-search-foundation:0315",
        "evidence:published-detail-metadata-read:0316",
        "evidence:missing-go-detail",
      ],
    }, { studentAppPublishedMaterialDetailMetadataReadPort: validPort() }),
    /Go detail route/u,
  );
});

function validInput() {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-published-detail-metadata-read.v1",
    verificationInvocationId: "archive_material_published_detail_metadata_read_001",
    principal: studentPrincipal(),
    publishedSearchFoundationReport: sourceReport(),
    archiveItemId: "tarch_archive_material_001",
    expectedArchiveItem: safeArchiveItem(),
    detailMetadataReadPolicy: detailPolicy(),
    evidenceRefs: [
      "evidence:published-search-foundation:0315",
      "evidence:published-detail-metadata-read:0316",
      "evidence:go-student-app-archive-detail:http-usecase-repository",
    ],
    idempotencyKey: "archive-material-published-detail-metadata-read:student_001:tarch_archive_material_001",
  };
}

function sourceReport() {
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION",
    runtime: {
      runtimeId: "teaching_archive_material_published_search_foundation_runtime",
      commandPort: "TeachingArchiveMaterialPublishedSearchFoundationPort.verifyStudentAppPublishedMaterialSearch",
      status: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_VERIFIED",
    },
    runtimeSlo: { totalErrors: 0 },
    runtimeProbes: {
      teachingArchiveMaterialPublishedSearchFoundation: {
        result: {
          recordId: "teaching_archive_material_published_search_foundation_record",
          runtimeId: "teaching_archive_material_published_search_foundation_runtime",
          status: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_VERIFIED",
          principal: studentPrincipal(),
          search: { matchedArchiveItemId: "tarch_archive_material_001" },
          studentProductSearchSource: { repository: "ArchiveRepository.ListPublishedForStudentApp" },
          evidenceRefs: ["evidence:published-search-foundation:0315"],
        },
      },
    },
    safetyInvariants: {
      publicationStoreFiltered: true,
      ownStudentOnly: true,
      unpublishedArchiveItemsExcluded: true,
      draftOnlyArchiveItemsExcluded: true,
      crossStudentArchiveItemsExcluded: true,
      responseMetadataOnly: true,
      answerKeyAndModelOutputExcluded: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      fullTextContentReadAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      publicationWriteStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
  };
}

function studentPrincipal() {
  return {
    principalId: "student_001",
    sessionId: "student_session_001",
    subjectType: "USER",
    role: "STUDENT",
    entryPoint: "STUDENT_APP",
    scopes: ["STUDENT_OWN_READ"],
    studentAccess: { mode: "OWN", ownStudentId: "student_001" },
  };
}

function safeArchiveItem() {
  return {
    id: "tarch_archive_material_001",
    ownerType: "STUDENT",
    studentId: "student_001",
    materialType: "HANDOUT",
    title: "Fractions practice packet",
    source: "SYSTEM_IMPORT",
    tags: ["fractions", "draft-approved"],
    analysisIntents: ["ARCHIVE_ONLY"],
    ocrStatus: "NOT_REQUIRED",
    createdAt: "2026-06-07T08:00:00Z",
  };
}

function detailPolicy() {
  return {
    sourceSearchFoundationRequired: true,
    publishedProjectionDetailPortRequired: true,
    archiveItemIdNormalizationRequired: true,
    publicationStoreFilterRequired: true,
    ownStudentOnlyRequired: true,
    safeMetadataOnlyRequired: true,
    contentRefExcludedRequired: true,
    goUseCaseReadAllowed: true,
    rawContentReadAllowed: false,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    ocrOrRagJobWriteAllowed: false,
    aiGradingWriteAllowed: false,
    modelInferenceAllowed: false,
    publicationWriteAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function validPort() {
  return {
    async getPublishedArchiveMaterialMetadata() {
      return validPortResult();
    },
  };
}

function validPortResult() {
  return {
    found: true,
    source: {
      endpoint: "GET /v1/student-app/archive-items/{archiveItemId}",
      useCase: "ReadStudentAppArchiveItem.Execute",
      repository: "ArchiveRepository.GetPublishedForStudentApp",
      projectionTable: "teaching_archive_publications",
      archiveItemIdNormalized: true,
      publicationStoreFiltered: true,
      ownStudentOnly: true,
      genericGetByIDBypassed: true,
      contentRefExcluded: true,
    },
    response: safeArchiveItem(),
  };
}

function tempLog() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ita-0316-"));
  return {
    logPath: path.join(dir, "records.jsonl"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
