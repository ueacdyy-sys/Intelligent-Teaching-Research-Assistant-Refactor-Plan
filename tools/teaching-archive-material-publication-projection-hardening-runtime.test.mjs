import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_PORT,
  formatTeachingArchiveMaterialPublicationProjectionHardening,
  verifyTeachingArchiveMaterialPublicationProjectionHardening,
} from "./teaching-archive-material-publication-projection-hardening-runtime.mjs";

describe("TeachingArchiveMaterialPublicationProjectionHardeningPort.verifyStudentAppPublishedMaterialProjection", () => {
  it("hardens student app archive material reads through the publication projection", async () => {
    const port = recordingProjectionReadPort();
    const result = await verifyTeachingArchiveMaterialPublicationProjectionHardening(baseInput(), {
      verificationLogPath: tempVerificationLogPath(),
      generatedAt: "2026-06-07T12:10:00.000Z",
      probeP99Ms: 8,
      studentAppPublishedMaterialProjectionReadPort: port,
    });

    assert.equal(result.commandPort, TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING_PORT);
    assert.equal(result.status, "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENED");
    assert.equal(result.sourceStudentAppRead.runtimeId, "teaching_archive_material_publication_student_app_read_runtime");
    assert.equal(result.studentProductReadSource.endpoint, "GET /v1/student-app/archive-items");
    assert.equal(result.studentProductReadSource.repository, "ArchiveRepository.ListPublishedForStudentApp");
    assert.equal(result.studentProductReadSource.targetTable, "teaching_archive_publications");
    assert.equal(result.studentProductReadSource.publicationStoreFiltered, true);
    assert.equal(result.projectionExclusions.unpublishedArchiveItemsExcluded, true);
    assert.equal(result.projectionExclusions.crossStudentArchiveItemsExcluded, true);
    assert.equal(result.hardenedPublishedArchiveMaterial.archiveItem.id, "tarch_archive_material_001");
    assert.equal(result.boundary.unpublishedArchiveItemsExcluded, true);
    assert.equal(result.boundary.draftOnlyArchiveItemsExcluded, true);
    assert.equal(result.boundary.crossStudentArchiveItemsExcluded, true);
    assert.equal(result.boundary.publicationMetadataLeakPrevented, true);
    assert.equal(result.boundary.directDatabaseAccessAllowed, false);
    assert.equal(result.boundary.executeHttpRequestAllowed, false);
    assert.equal(result.boundary.swarmAllowed, false);
    assert.equal(result.runtimeSlo.p99Ms, 8);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].request.archiveItemId, "tarch_archive_material_001");
    assert.equal(port.calls[0].context.sourcePublicationId, "archive_material_publication_commit_001");
    assert.match(formatTeachingArchiveMaterialPublicationProjectionHardening(result), /Unpublished excluded: true/u);
  });

  it("uses idempotency for replay and rejects conflicting projection verification", async () => {
    const verificationLogPath = tempVerificationLogPath();
    const port = recordingProjectionReadPort();
    const first = await verifyTeachingArchiveMaterialPublicationProjectionHardening(baseInput(), {
      verificationLogPath,
      studentAppPublishedMaterialProjectionReadPort: port,
    });
    const replay = await verifyTeachingArchiveMaterialPublicationProjectionHardening(baseInput(), {
      verificationLogPath,
      studentAppPublishedMaterialProjectionReadPort: recordingProjectionReadPort(),
    });

    assert.equal(first.recordId, replay.recordId);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(verificationLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.verificationInvocationId = "archive_material_publication_projection_hardening_conflict";
    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationProjectionHardening(conflicting, {
        verificationLogPath,
        studentAppPublishedMaterialProjectionReadPort: recordingProjectionReadPort(),
      }),
      /record\.inputHash/u,
    );
  });

  it("rejects unsafe source, unsafe policy, missing port, and missing published material", async () => {
    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationProjectionHardening(baseInput({
        publicationStudentAppReadReport: publicationStudentAppReadReport({ status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_REJECTED" }),
      }), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedMaterialProjectionReadPort: recordingProjectionReadPort(),
      }),
      /runtime\.status/u,
    );

    const unsafePolicy = baseInput();
    unsafePolicy.projectionHardeningPolicy.directDatabaseAccessAllowed = true;
    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationProjectionHardening(unsafePolicy, {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedMaterialProjectionReadPort: recordingProjectionReadPort(),
      }),
      /directDatabaseAccessAllowed must be false/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationProjectionHardening(baseInput(), { verificationLogPath: tempVerificationLogPath() }),
      /StudentAppPublishedMaterialProjectionReadPort\.listPublishedArchiveMaterials is required/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationProjectionHardening(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedMaterialProjectionReadPort: recordingProjectionReadPort({ response: { data: [otherStudentArchiveItem()] } }),
      }),
      /outside own-student scope/u,
    );
  });

  it("rejects generic archive sources, missing exclusion proof, mismatched responses, leaked fields, and publication metadata", async () => {
    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationProjectionHardening(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedMaterialProjectionReadPort: recordingProjectionReadPort({
          source: { repository: "ArchiveRepository.List" },
        }),
      }),
      /source\.repository/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationProjectionHardening(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedMaterialProjectionReadPort: recordingProjectionReadPort({
          exclusions: { unpublishedArchiveItemsExcluded: false },
        }),
      }),
      /unpublishedArchiveItemsExcluded must be true/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationProjectionHardening(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedMaterialProjectionReadPort: recordingProjectionReadPort({
          response: { data: [{ ...archiveItem(), title: "Different title" }] },
        }),
      }),
      /projectionResponse\.title/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationProjectionHardening(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedMaterialProjectionReadPort: recordingProjectionReadPort({
          response: { data: [{ ...archiveItem(), rawModelOutput: "leak" }] },
        }),
      }),
      /rawModelOutput is not allowed/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationProjectionHardening(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedMaterialProjectionReadPort: recordingProjectionReadPort({
          response: { data: [{ ...archiveItem(), publicationId: "archive_material_publication_commit_001" }] },
        }),
      }),
      /publicationId is not allowed/u,
    );
  });

  it("requires student app read, projection hardening, and Go evidence refs", async () => {
    for (const evidenceRefs of [
      ["evidence:publication-projection-hardening:0314", "evidence:go-list-published-for-student-app:repository", "evidence:other"],
      ["evidence:publication-student-app-read:0313", "evidence:go-list-published-for-student-app:repository", "evidence:other"],
      ["evidence:publication-student-app-read:0313", "evidence:publication-projection-hardening:0314", "evidence:other"],
    ]) {
      const input = baseInput({ evidenceRefs });
      await assert.rejects(
        () => verifyTeachingArchiveMaterialPublicationProjectionHardening(input, {
          verificationLogPath: tempVerificationLogPath(),
          studentAppPublishedMaterialProjectionReadPort: recordingProjectionReadPort(),
        }),
        /evidence/u,
      );
    }
  });
});

function tempVerificationLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "teaching-archive-material-publication-projection-hardening-")), "verification.jsonl");
}

function baseInput(overrides = {}) {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-projection-hardening.v1",
    verificationInvocationId: "archive_material_publication_projection_hardening_001",
    principal: {
      principalId: "student_001",
      sessionId: "student_session_001",
      subjectType: "USER",
      role: "STUDENT",
      entryPoint: "STUDENT_APP",
      scopes: ["STUDENT_OWN_READ"],
      studentAccess: { mode: "OWN", ownStudentId: "student_001" },
    },
    publicationStudentAppReadReport: publicationStudentAppReadReport(),
    projectionHardeningPolicy: projectionHardeningPolicy(),
    evidenceRefs: [
      "evidence:publication-student-app-read:0313",
      "evidence:publication-projection-hardening:0314",
      "evidence:go-list-published-for-student-app:repository",
    ],
    idempotencyKey: "archive-material-publication-projection-hardening:student_001:fractions_packet",
    ...overrides,
  };
}

function projectionHardeningPolicy() {
  return {
    sourceStudentAppReadRequired: true,
    publishedProjectionReadPortRequired: true,
    publicationStoreFilterRequired: true,
    publicationStateFilterRequired: true,
    visibilityStateFilterRequired: true,
    studentAppChannelFilterRequired: true,
    ownStudentOnlyRequired: true,
    unpublishedItemsExcludedRequired: true,
    draftOnlyItemsExcludedRequired: true,
    crossStudentItemsExcludedRequired: true,
    responseMustMatchPublishedMaterial: true,
    publicationMetadataLeakBlocked: true,
    idempotentProjectionVerificationRequired: true,
    goUseCaseReadAllowed: true,
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

function publicationStudentAppReadReport(overrides = {}) {
  const result = {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-student-app-read-verified.v1",
    recordId: "teaching_archive_material_publication_student_app_read_archive-material-publication-student-app-read_student_001_fractions_packet",
    runtimeId: "teaching_archive_material_publication_student_app_read_runtime",
    commandPort: "TeachingArchiveMaterialPublicationStudentAppReadPort.verifyStudentAppPublishedMaterialRead",
    status: overrides.status ?? "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_VERIFIED",
    studentProductReadSource: {
      endpoint: "GET /v1/student-app/archive-items",
      useCase: "ListStudentAppArchiveItems.Execute",
      repository: "ArchiveRepository.List",
      ownStudentOnly: true,
      publicationRowSourceVerified: true,
    },
    publishedArchiveMaterial: {
      publicationId: "archive_material_publication_commit_001",
      visibilityState: "STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED",
      archiveItem: archiveItem(),
    },
    boundary: {
      studentAppPublishedMaterialReadVerified: true,
      productResponseMatchedPublicationRow: true,
      publicationMetadataLeakPrevented: true,
      crossStudentLeakPrevented: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      publicationWriteStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFuturePublicationProjectionOrRagSlice: true,
    },
    evidenceRefs: ["evidence:student-app-published-archive-material:tarch_archive_material_001"],
  };
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ",
    runtime: {
      runtimeId: "teaching_archive_material_publication_student_app_read_runtime",
      commandPort: "TeachingArchiveMaterialPublicationStudentAppReadPort.verifyStudentAppPublishedMaterialRead",
      status: overrides.status ?? "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_VERIFIED",
    },
    runtimeSlo: { p99Ms: 8, totalErrors: 0 },
    runtimeProbes: { teachingArchiveMaterialPublicationStudentAppRead: { result } },
    safetyInvariants: {
      studentAppPublishedMaterialReadVerified: true,
      productResponseMatchedPublicationRow: true,
      publicationMetadataLeakPrevented: true,
      crossStudentLeakPrevented: true,
      futurePublicationProjectionOrRagRequired: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
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

function recordingProjectionReadPort(overrides = {}) {
  const {
    source: sourceOverrides = {},
    exclusions: exclusionOverrides = {},
    response: responseOverrides = {},
    ...resultOverrides
  } = overrides;
  const calls = [];
  return {
    calls,
    async listPublishedArchiveMaterials(request, context) {
      calls.push({ request, context });
      return {
        found: true,
        source: {
          endpoint: "GET /v1/student-app/archive-items",
          useCase: "ListStudentAppArchiveItems.Execute",
          repository: "ArchiveRepository.ListPublishedForStudentApp",
          targetTable: "teaching_archive_publications",
          schemaIndex: "idx_teaching_archive_publications_student_app_visible_lookup",
          publicationStoreFiltered: true,
          publicationStateFiltered: true,
          visibilityStateFiltered: true,
          studentAppChannelFiltered: true,
          ownStudentOnly: true,
          ...sourceOverrides,
        },
        exclusions: {
          unpublishedArchiveItemsExcluded: true,
          draftOnlyArchiveItemsExcluded: true,
          crossStudentArchiveItemsExcluded: true,
          publicationMetadataRemovedFromResponse: true,
          ...exclusionOverrides,
        },
        response: {
          data: [archiveItem()],
          pageInfo: { pageSize: 10, hasMore: false, nextCursor: "" },
          ...responseOverrides,
        },
        ...resultOverrides,
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
    tags: ["fractions", "published"],
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
