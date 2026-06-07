import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_PORT,
  formatTeachingArchiveMaterialPublicationStudentAppRead,
  verifyTeachingArchiveMaterialPublicationStudentAppRead,
} from "./teaching-archive-material-publication-student-app-read-runtime.mjs";

describe("TeachingArchiveMaterialPublicationStudentAppReadPort.verifyStudentAppPublishedMaterialRead", () => {
  it("verifies a published archive material through the injected student app product read port", async () => {
    const port = recordingPublishedMaterialReadPort();
    const result = await verifyTeachingArchiveMaterialPublicationStudentAppRead(baseInput(), {
      verificationLogPath: tempVerificationLogPath(),
      generatedAt: "2026-06-07T11:20:00.000Z",
      probeP99Ms: 8,
      studentAppPublishedArchiveMaterialsReadPort: port,
    });

    assert.equal(result.commandPort, TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_PORT);
    assert.equal(result.status, "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_VERIFIED");
    assert.equal(result.sourcePublicationRowVerification.runtimeId, "teaching_archive_material_publication_row_verification_runtime");
    assert.equal(result.sourcePublicationRowVerification.publicationId, "archive_material_publication_commit_001");
    assert.equal(result.studentProductReadSource.endpoint, "GET /v1/student-app/archive-items");
    assert.equal(result.studentProductReadSource.useCase, "ListStudentAppArchiveItems.Execute");
    assert.equal(result.studentProductReadSource.repository, "ArchiveRepository.List");
    assert.equal(result.studentProductReadSource.publicationRowSourceVerified, true);
    assert.equal(result.publishedArchiveMaterial.publicationId, "archive_material_publication_commit_001");
    assert.equal(result.publishedArchiveMaterial.archiveItem.id, "tarch_archive_material_001");
    assert.equal(result.publishedArchiveMaterial.archiveItem.studentId, "student_001");
    assert.equal(result.boundary.studentAppPublishedMaterialReadVerified, true);
    assert.equal(result.boundary.productResponseMatchedPublicationRow, true);
    assert.equal(result.boundary.publicationMetadataLeakPrevented, true);
    assert.equal(result.boundary.directDatabaseAccessAllowed, false);
    assert.equal(result.boundary.executeHttpRequestAllowed, false);
    assert.equal(result.boundary.swarmAllowed, false);
    assert.equal(result.runtimeSlo.p99Ms, 8);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].request.archiveItemId, "tarch_archive_material_001");
    assert.equal(port.calls[0].request.principal.studentAccess.ownStudentId, "student_001");
    assert.equal(port.calls[0].context.publicationId, "archive_material_publication_commit_001");
    assert.match(formatTeachingArchiveMaterialPublicationStudentAppRead(result), /Published material visible: true/u);
  });

  it("uses idempotency for replay and rejects conflicting published material reads", async () => {
    const verificationLogPath = tempVerificationLogPath();
    const port = recordingPublishedMaterialReadPort();
    const first = await verifyTeachingArchiveMaterialPublicationStudentAppRead(baseInput(), {
      verificationLogPath,
      studentAppPublishedArchiveMaterialsReadPort: port,
    });
    const replay = await verifyTeachingArchiveMaterialPublicationStudentAppRead(baseInput(), {
      verificationLogPath,
      studentAppPublishedArchiveMaterialsReadPort: recordingPublishedMaterialReadPort(),
    });

    assert.equal(first.recordId, replay.recordId);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(verificationLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.verificationInvocationId = "archive_material_publication_student_app_read_conflict";
    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationStudentAppRead(conflicting, {
        verificationLogPath,
        studentAppPublishedArchiveMaterialsReadPort: recordingPublishedMaterialReadPort(),
      }),
      /record\.inputHash/u,
    );
  });

  it("rejects unsafe publication row source, unsafe policy, missing port, and missing published material", async () => {
    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationStudentAppRead(baseInput({
        publicationRowVerificationReport: publicationRowVerificationReport({ status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_REJECTED" }),
      }), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedArchiveMaterialsReadPort: recordingPublishedMaterialReadPort(),
      }),
      /runtime\.status/u,
    );

    const unsafePolicy = baseInput();
    unsafePolicy.productReadPolicy.directDatabaseAccessAllowed = true;
    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationStudentAppRead(unsafePolicy, {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedArchiveMaterialsReadPort: recordingPublishedMaterialReadPort(),
      }),
      /directDatabaseAccessAllowed must be false/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationStudentAppRead(baseInput(), { verificationLogPath: tempVerificationLogPath() }),
      /StudentAppPublishedArchiveMaterialsReadPort\.listStudentAppPublishedArchiveMaterials is required/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationStudentAppRead(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedArchiveMaterialsReadPort: recordingPublishedMaterialReadPort({ response: { data: [otherStudentArchiveItem()] } }),
      }),
      /outside own-student scope/u,
    );
  });

  it("rejects cross-student principals, mismatched responses, leaked fields, unsafe text, and publication metadata leaks", async () => {
    const crossStudent = baseInput();
    crossStudent.principal.studentAccess.ownStudentId = "student_999";
    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationStudentAppRead(crossStudent, {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedArchiveMaterialsReadPort: recordingPublishedMaterialReadPort(),
      }),
      /ownStudentId must be student_001/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationStudentAppRead(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedArchiveMaterialsReadPort: recordingPublishedMaterialReadPort({
          response: { data: [{ ...archiveItem(), title: "Different title" }] },
        }),
      }),
      /productResponse\.title/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationStudentAppRead(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedArchiveMaterialsReadPort: recordingPublishedMaterialReadPort({
          response: { data: [{ ...archiveItem(), rawModelOutput: "leak" }] },
        }),
      }),
      /rawModelOutput is not allowed/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationStudentAppRead(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedArchiveMaterialsReadPort: recordingPublishedMaterialReadPort({
          response: { data: [{ ...archiveItem(), title: "<script>bad</script>" }] },
        }),
      }),
      /contains unsafe text/u,
    );

    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationStudentAppRead(baseInput(), {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedArchiveMaterialsReadPort: recordingPublishedMaterialReadPort({
          response: { data: [{ ...archiveItem(), publicationId: "archive_material_publication_commit_001" }] },
        }),
      }),
      /publicationId is not allowed/u,
    );
  });

  it("requires publication row verification and student app product entry evidence while keeping future work separate", async () => {
    const missingRowEvidence = baseInput();
    missingRowEvidence.evidenceRefs = ["evidence:student-app-archive-items:go-http", "evidence:other"];
    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationStudentAppRead(missingRowEvidence, {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedArchiveMaterialsReadPort: recordingPublishedMaterialReadPort(),
      }),
      /publication row verification evidence ref is required/u,
    );

    const missingProductEvidence = baseInput();
    missingProductEvidence.evidenceRefs = ["evidence:publication-row-verification:0312", "evidence:other"];
    await assert.rejects(
      () => verifyTeachingArchiveMaterialPublicationStudentAppRead(missingProductEvidence, {
        verificationLogPath: tempVerificationLogPath(),
        studentAppPublishedArchiveMaterialsReadPort: recordingPublishedMaterialReadPort(),
      }),
      /student app archive-items product entry evidence ref is required/u,
    );

    const result = await verifyTeachingArchiveMaterialPublicationStudentAppRead(baseInput(), {
      verificationLogPath: tempVerificationLogPath(),
      studentAppPublishedArchiveMaterialsReadPort: recordingPublishedMaterialReadPort(),
    });
    assert.equal(result.boundary.requiresFuturePublicationProjectionOrRagSlice, true);
    assert.equal(result.boundary.aiGradingWriteStarted, false);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.equal(result.boundary.publicationWriteStarted, false);
  });
});

function tempVerificationLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "teaching-archive-material-publication-student-app-read-")), "verification.jsonl");
}

function baseInput(overrides = {}) {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-student-app-read.v1",
    verificationInvocationId: "archive_material_publication_student_app_read_001",
    principal: {
      principalId: "student_001",
      sessionId: "student_session_001",
      subjectType: "USER",
      role: "STUDENT",
      entryPoint: "STUDENT_APP",
      scopes: ["STUDENT_OWN_READ"],
      studentAccess: { mode: "OWN", ownStudentId: "student_001" },
    },
    publicationRowVerificationReport: publicationRowVerificationReport(),
    productReadPolicy: productReadPolicy(),
    evidenceRefs: [
      "evidence:publication-row-verification:0312",
      "evidence:student-app-archive-items:go-http-product-entry",
    ],
    idempotencyKey: "archive-material-publication-student-app-read:student_001:fractions_packet",
    ...overrides,
  };
}

function productReadPolicy() {
  return {
    publicationRowVerificationRequired: true,
    ownStudentPrincipalRequired: true,
    studentAppArchiveItemsEndpointRequired: true,
    injectedPublishedArchiveMaterialReadPortRequired: true,
    ownStudentOnlyRequired: true,
    productResponseMustIncludePublishedMaterial: true,
    publicationRowMustMatchProductResponse: true,
    idempotentPublishedMaterialReadVerificationRequired: true,
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

function publicationRowVerificationReport(overrides = {}) {
  const result = {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-row-verified.v1",
    recordId: "teaching_archive_material_publication_row_verification_archive-material-publication-row-verification-student_001-fractions_packet",
    runtimeId: "teaching_archive_material_publication_row_verification_runtime",
    commandPort: "TeachingArchiveMaterialPublicationRowVerificationPort.verifyTeachingArchivePublicationPhysicalRow",
    status: overrides.status ?? "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PHYSICAL_ROW_VERIFIED",
    teachingArchivePublicationPhysicalRow: {
      targetRepository: "PublicationRepository.GetByID",
      targetStore: "TEACHING_ARCHIVE_PUBLICATION_STORE",
      targetTable: "teaching_archive_publications",
      publicationRecord: {
        ...publicationRecord(),
        ...(overrides.publicationRecordPatch ?? {}),
      },
    },
    boundary: {
      publicationStorageCommitVerified: true,
      publicationPhysicalRowVerified: true,
      mainDatabaseReadAllowed: true,
      studentVisiblePublished: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: ["evidence:publication-row:archive_material_publication_commit_001"],
    ...(overrides.resultPatch ?? {}),
  };
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION",
    runtime: {
      runtimeId: "teaching_archive_material_publication_row_verification_runtime",
      commandPort: "TeachingArchiveMaterialPublicationRowVerificationPort.verifyTeachingArchivePublicationPhysicalRow",
      status: overrides.status ?? "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PHYSICAL_ROW_VERIFIED",
    },
    runtimeSlo: { p99Ms: 8, totalErrors: 0 },
    runtimeProbes: { teachingArchiveMaterialPublicationRowVerification: { result } },
    safetyInvariants: {
      publicationStorageCommitVerified: true,
      publicationPhysicalRowVerified: true,
      mainDatabaseReadAllowed: true,
      studentVisiblePublished: true,
      futureStudentAppPublishedMaterialReadRequired: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
  };
}

function publicationRecord() {
  return {
    publicationId: "archive_material_publication_commit_001",
    publicationState: "COMMITTED_TO_PUBLICATION_STORE",
    visibilityState: "STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED",
    channel: "STUDENT_APP",
    scopeRef: {
      scopeType: "STUDENT_OWN_ARCHIVE",
      studentId: "student_001",
      archiveItemId: "tarch_archive_material_001",
    },
    approvalRecordId: "teaching_archive_material_publication_approval_archive-material-publication-approval-student_001-fractions_packet",
    approvalId: "archive_material_publication_approval_001",
    publicationCandidateId: "archive_material_pub_precheck_001",
    archiveItemId: "tarch_archive_material_001",
    studentId: "student_001",
    materialType: "HANDOUT",
    title: "Fractions practice packet",
    contentRef: "precommit://archive-material/student_001/fractions-packet",
    committedAt: "2026-06-07T10:40:00.000Z",
  };
}

function recordingPublishedMaterialReadPort(overrides = {}) {
  const calls = [];
  return {
    calls,
    async listStudentAppPublishedArchiveMaterials(request, context) {
      calls.push({ request, context });
      return {
        found: true,
        source: {
          endpoint: "GET /v1/student-app/archive-items",
          useCase: "ListStudentAppArchiveItems.Execute",
          repository: "ArchiveRepository.List",
          ownStudentOnly: true,
          publicationRowSourceVerified: true,
          ...(overrides.source ?? {}),
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
