import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_PORT,
  formatTeachingArchiveMaterialPublishedSearchFoundation,
  verifyTeachingArchiveMaterialPublishedSearchFoundation,
} from "./teaching-archive-material-published-search-foundation-runtime.mjs";

describe("TeachingArchiveMaterialPublishedSearchFoundationPort.verifyStudentAppPublishedMaterialSearch", () => {
  it("verifies published material metadata search through the Student App archive-items query path", async () => {
    const port = recordingSearchPort();
    const result = await verifyTeachingArchiveMaterialPublishedSearchFoundation(baseInput({
      searchQuery: "  fractions   ",
    }), {
      verificationLogPath: tempVerificationLogPath(),
      generatedAt: "2026-06-07T12:40:00.000Z",
      probeP99Ms: 8,
      studentAppPublishedMaterialSearchPort: port,
    });

    assert.equal(result.commandPort, TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_PORT);
    assert.equal(result.status, "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_SEARCH_FOUNDATION_VERIFIED");
    assert.equal(result.sourceProjectionHardening.runtimeId, "teaching_archive_material_publication_projection_hardening_runtime");
    assert.equal(result.studentProductSearchSource.endpoint, "GET /v1/student-app/archive-items?query=");
    assert.equal(result.studentProductSearchSource.repository, "ArchiveRepository.ListPublishedForStudentApp");
    assert.equal(result.studentProductSearchSource.projectionTable, "teaching_archive_publications");
    assert.equal(result.studentProductSearchSource.searchIndexProfile, "idx_teaching_archive_items_student_material_search_scope");
    assert.equal(result.search.query, "fractions");
    assert.equal(result.search.matchedArchiveItemId, "tarch_archive_material_001");
    assert.equal(result.searchExclusions.nonMatchingPublishedMaterialsExcluded, true);
    assert.equal(result.boundary.titleAndTagSearchOnly, true);
    assert.equal(result.boundary.responseMetadataOnly, true);
    assert.equal(result.boundary.requiresFutureOcrRagSemanticSearchSlice, true);
    assert.equal(result.boundary.directDatabaseAccessAllowed, false);
    assert.equal(result.boundary.executeHttpRequestAllowed, false);
    assert.equal(result.boundary.swarmAllowed, false);
    assert.equal(result.runtimeSlo.p99Ms, 8);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].request.query, "fractions");
    assert.equal(port.calls[0].request.materialType, "HANDOUT");
    assert.equal(port.calls[0].context.sourceProjectionRecordId, "teaching_archive_material_publication_projection_hardening_archive-material-publication-projection-hardening_student_001_fractions_packet");
    assert.match(formatTeachingArchiveMaterialPublishedSearchFoundation(result), /Excluded non-matches: true/u);
  });

  it("uses idempotency for replay and rejects conflicting published search verification", async () => {
    const verificationLogPath = tempVerificationLogPath();
    const port = recordingSearchPort();
    const first = await verifyTeachingArchiveMaterialPublishedSearchFoundation(baseInput(), {
      verificationLogPath,
      studentAppPublishedMaterialSearchPort: port,
    });
    const replay = await verifyTeachingArchiveMaterialPublishedSearchFoundation(baseInput(), {
      verificationLogPath,
      studentAppPublishedMaterialSearchPort: recordingSearchPort(),
    });

    assert.equal(first.recordId, replay.recordId);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(verificationLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput({ searchQuery: "algebra" });
    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublishedSearchFoundation(conflicting, {
        verificationLogPath,
        studentAppPublishedMaterialSearchPort: recordingSearchPort(),
      }),
      /record\.inputHash/u,
    );
  });

  it("rejects unsafe source, unsafe policy, missing port, unsafe query, and missing expected material", async () => {
    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublishedSearchFoundation(baseInput({
        publicationProjectionHardeningReport: publicationProjectionHardeningReport({ status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_REJECTED" }),
      }), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedMaterialSearchPort: recordingSearchPort(),
      }),
      /runtime\.status/u,
    );

    const unsafePolicy = baseInput();
    unsafePolicy.searchFoundationPolicy.modelInferenceAllowed = true;
    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublishedSearchFoundation(unsafePolicy, {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedMaterialSearchPort: recordingSearchPort(),
      }),
      /modelInferenceAllowed must be false/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublishedSearchFoundation(baseInput(), { verificationLogPath: tempVerificationLogPath() }),
      /StudentAppPublishedMaterialSearchPort\.searchPublishedArchiveMaterials is required/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublishedSearchFoundation(baseInput({ searchQuery: "fractions\npacket" }), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedMaterialSearchPort: recordingSearchPort(),
      }),
      /contains unsafe text/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublishedSearchFoundation(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedMaterialSearchPort: recordingSearchPort({ response: { data: [matchingOtherMaterial()] } }),
      }),
      /tarch_archive_material_001 was not returned by search/u,
    );
  });

  it("rejects generic sources, non-matches, scope leaks, exclusion gaps, and product metadata leaks", async () => {
    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublishedSearchFoundation(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedMaterialSearchPort: recordingSearchPort({ source: { repository: "ArchiveRepository.List" } }),
      }),
      /source\.repository/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublishedSearchFoundation(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedMaterialSearchPort: recordingSearchPort({ response: { data: [{ ...archiveItem(), title: "Algebra study guide", tags: ["algebra"] }] } }),
      }),
      /does not match query/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublishedSearchFoundation(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedMaterialSearchPort: recordingSearchPort({ response: { data: [{ ...archiveItem(), studentId: "student_002" }] } }),
      }),
      /outside own-student scope/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublishedSearchFoundation(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedMaterialSearchPort: recordingSearchPort({ exclusions: { unpublishedArchiveItemsExcluded: false } }),
      }),
      /unpublishedArchiveItemsExcluded must be true/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublishedSearchFoundation(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedMaterialSearchPort: recordingSearchPort({ response: { data: [{ ...archiveItem(), publicationId: "archive_material_publication_commit_001" }] } }),
      }),
      /publicationId is not allowed/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublishedSearchFoundation(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedMaterialSearchPort: recordingSearchPort({ response: { data: [{ ...archiveItem(), rawModelOutput: "leak" }] } }),
      }),
      /rawModelOutput is not allowed/u,
    );
  });

  it("requires projection hardening, published search, and Go query evidence refs", async () => {
    for (const evidenceRefs of [
      ["evidence:published-search-foundation:0315", "evidence:go-student-app-archive-query:http", "evidence:other"],
      ["evidence:publication-projection-hardening:0314", "evidence:go-student-app-archive-query:http", "evidence:other"],
      ["evidence:publication-projection-hardening:0314", "evidence:published-search-foundation:0315", "evidence:other"],
    ]) {
      await assert.rejects(
        () => verifyTeachingArchiveMaterialPublishedSearchFoundation(baseInput({ evidenceRefs }), {
          verificationLogPath: tempVerificationLogPath(),
          studentAppPublishedMaterialSearchPort: recordingSearchPort(),
        }),
        /evidence/u,
      );
    }
  });
});

function tempVerificationLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "teaching-archive-material-published-search-foundation-")), "verification.jsonl");
}

function baseInput(overrides = {}) {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-published-search-foundation.v1",
    verificationInvocationId: "archive_material_published_search_foundation_001",
    principal: {
      principalId: "student_001",
      sessionId: "student_session_001",
      subjectType: "USER",
      role: "STUDENT",
      entryPoint: "STUDENT_APP",
      scopes: ["STUDENT_OWN_READ"],
      studentAccess: { mode: "OWN", ownStudentId: "student_001" },
    },
    publicationProjectionHardeningReport: publicationProjectionHardeningReport(),
    searchQuery: "fractions",
    materialType: "HANDOUT",
    searchFoundationPolicy: searchFoundationPolicy(),
    evidenceRefs: [
      "evidence:publication-projection-hardening:0314",
      "evidence:published-search-foundation:0315",
      "evidence:go-student-app-archive-query:http",
    ],
    idempotencyKey: "archive-material-published-search-foundation:student_001:fractions",
    ...overrides,
  };
}

function searchFoundationPolicy() {
  return {
    sourceProjectionHardeningRequired: true,
    publishedProjectionSearchPortRequired: true,
    queryNormalizationRequired: true,
    titleAndTagSearchOnly: true,
    publicationStoreFilterRequired: true,
    ownStudentOnlyRequired: true,
    nonMatchingPublishedMaterialsExcludedRequired: true,
    unpublishedItemsExcludedRequired: true,
    responseMetadataOnlyRequired: true,
    goUseCaseReadAllowed: true,
    fullTextContentReadAllowed: false,
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

function publicationProjectionHardeningReport(overrides = {}) {
  const result = {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-projection-hardened.v1",
    recordId: "teaching_archive_material_publication_projection_hardening_archive-material-publication-projection-hardening_student_001_fractions_packet",
    runtimeId: "teaching_archive_material_publication_projection_hardening_runtime",
    commandPort: "TeachingArchiveMaterialPublicationProjectionHardeningPort.verifyStudentAppPublishedMaterialProjection",
    status: overrides.status ?? "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENED",
    studentProductReadSource: {
      endpoint: "GET /v1/student-app/archive-items",
      useCase: "ListStudentAppArchiveItems.Execute",
      repository: "ArchiveRepository.ListPublishedForStudentApp",
      targetTable: "teaching_archive_publications",
      schemaIndex: "idx_teaching_archive_publications_student_app_visible_lookup",
      publicationStoreFiltered: true,
      ownStudentOnly: true,
    },
    hardenedPublishedArchiveMaterial: {
      publicationId: "archive_material_publication_commit_001",
      archiveItem: archiveItem(),
    },
    boundary: {
      publicationStoreFiltered: true,
      unpublishedArchiveItemsExcluded: true,
      draftOnlyArchiveItemsExcluded: true,
      crossStudentArchiveItemsExcluded: true,
      publicationMetadataLeakPrevented: true,
    },
    evidenceRefs: ["evidence:publication-projection-hardening:0314"],
  };
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING",
    runtime: {
      runtimeId: "teaching_archive_material_publication_projection_hardening_runtime",
      commandPort: "TeachingArchiveMaterialPublicationProjectionHardeningPort.verifyStudentAppPublishedMaterialProjection",
      status: overrides.status ?? "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENED",
    },
    runtimeSlo: { p99Ms: 8, totalErrors: 0 },
    runtimeProbes: { teachingArchiveMaterialPublicationProjectionHardening: { result } },
    safetyInvariants: {
      publicationStoreFiltered: true,
      studentAppChannelFiltered: true,
      ownStudentOnly: true,
      unpublishedArchiveItemsExcluded: true,
      draftOnlyArchiveItemsExcluded: true,
      crossStudentArchiveItemsExcluded: true,
      publicationMetadataLeakPrevented: true,
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

function recordingSearchPort(overrides = {}) {
  const {
    source: sourceOverrides = {},
    exclusions: exclusionOverrides = {},
    response: responseOverrides = {},
    ...resultOverrides
  } = overrides;
  const calls = [];
  return {
    calls,
    async searchPublishedArchiveMaterials(request, context) {
      calls.push({ request, context });
      return {
        found: true,
        source: {
          endpoint: "GET /v1/student-app/archive-items?query=",
          useCase: "ListStudentAppArchiveItems.Execute",
          repository: "ArchiveRepository.ListPublishedForStudentApp",
          projectionTable: "teaching_archive_publications",
          searchIndexProfile: "idx_teaching_archive_items_student_material_search_scope",
          queryNormalized: true,
          titleTagSearchOnly: true,
          publicationStoreFiltered: true,
          ownStudentOnly: true,
          ...sourceOverrides,
        },
        exclusions: {
          nonMatchingPublishedMaterialsExcluded: true,
          unpublishedArchiveItemsExcluded: true,
          draftOnlyArchiveItemsExcluded: true,
          crossStudentArchiveItemsExcluded: true,
          answerKeyAndModelOutputExcluded: true,
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

function matchingOtherMaterial() {
  return {
    ...archiveItem(),
    id: "tarch_archive_material_other",
    title: "Fractions optional packet",
  };
}
