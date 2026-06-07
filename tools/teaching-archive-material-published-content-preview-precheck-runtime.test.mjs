import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_PORT,
  recordTeachingArchiveMaterialPublishedContentPreviewPrecheck,
} from "./teaching-archive-material-published-content-preview-precheck-runtime.mjs";

test("blocks published material content preview until a safe preview store and renderer exist", () => {
  const { logPath, cleanup } = tempLog();
  try {
    const result = recordTeachingArchiveMaterialPublishedContentPreviewPrecheck(validInput(), {
      precheckLogPath: logPath,
      generatedAt: "2026-06-07T14:00:00.000Z",
      probeP99Ms: 5,
    });
    assert.equal(result.status, "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_BLOCKED_UNTIL_SAFE_CONTENT_STORE");
    assert.equal(result.commandPort, TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_PORT);
    assert.equal(result.precheckDecision.contentPreviewAccessDecision, "BLOCK_UNTIL_SAFE_CONTENT_PREVIEW_STORE");
    assert.equal(result.precheckDecision.contentPreviewReadAllowed, false);
    assert.equal(result.precheckDecision.rawContentReadAllowed, false);
    assert.equal(result.precheckDecision.contentRefDisclosureAllowed, false);
    assert.equal(result.boundary.detailMetadataEvidenceVerified, true);
    assert.equal(result.boundary.contentPreviewPrecheckOnly, true);
    assert.equal(result.boundary.contentPreviewReadStarted, false);
    assert.equal(result.boundary.objectStorageReadStarted, false);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.equal(result.selectedArchiveItem.archiveItemId, "tarch_archive_material_001");
    assert.equal(result.contentRef, undefined);
    assert.equal(result.rawContent, undefined);
  } finally {
    cleanup();
  }
});

test("uses idempotency for replay and rejects conflicting content preview precheck inputs", () => {
  const { logPath, cleanup } = tempLog();
  try {
    const first = recordTeachingArchiveMaterialPublishedContentPreviewPrecheck(validInput(), { precheckLogPath: logPath });
    const replay = recordTeachingArchiveMaterialPublishedContentPreviewPrecheck(validInput(), { precheckLogPath: logPath });
    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.inputHash, first.inputHash);

    assert.throws(
      () => recordTeachingArchiveMaterialPublishedContentPreviewPrecheck({
        ...validInput(),
        precheckInvocationId: "archive_material_published_content_preview_precheck_002",
      }, { precheckLogPath: logPath }),
      /idempotency key already exists/u,
    );
  } finally {
    cleanup();
  }
});

test("rejects unsafe 0316 source report, unsafe principal, unsafe policy, and missing evidence", () => {
  assert.throws(
    () => recordTeachingArchiveMaterialPublishedContentPreviewPrecheck({
      ...validInput(),
      publishedDetailMetadataReadReport: { ...sourceReport(), readiness: "NEEDS_REMEDIATION" },
    }, { precheckLogPath: tempLog().logPath }),
    /readiness/u,
  );
  assert.throws(
    () => recordTeachingArchiveMaterialPublishedContentPreviewPrecheck({
      ...validInput(),
      principal: { ...studentPrincipal(), role: "TEACHER" },
    }, { precheckLogPath: tempLog().logPath }),
    /role/u,
  );
  assert.throws(
    () => recordTeachingArchiveMaterialPublishedContentPreviewPrecheck({
      ...validInput(),
      contentPreviewPrecheckPolicy: { ...previewPolicy(), authoritativeContentPreviewStoreAvailable: true },
    }, { precheckLogPath: tempLog().logPath }),
    /authoritativeContentPreviewStoreAvailable/u,
  );
  assert.throws(
    () => recordTeachingArchiveMaterialPublishedContentPreviewPrecheck({
      ...validInput(),
      evidenceRefs: ["evidence:published-detail-metadata-read:0316"],
    }, { precheckLogPath: tempLog().logPath }),
    /0317 content preview precheck evidence ref/u,
  );
});

test("rejects contentRef, raw content, preview artifacts, answer, model, publication, and worker leaks", () => {
  for (const field of ["contentRef", "rawContent", "previewText", "renderedHtml", "objectStorageKey", "ocrText", "ragChunks", "embedding", "answerKey", "rawModelOutput", "publicationState", "workerId"]) {
    const input = validInput();
    input.publishedDetailMetadataReadReport.runtimeProbes.teachingArchiveMaterialPublishedDetailMetadataRead.result.responseMetadata[field] = "leak";
    assert.throws(
      () => recordTeachingArchiveMaterialPublishedContentPreviewPrecheck(input, { precheckLogPath: tempLog().logPath }),
      new RegExp(field, "u"),
    );
  }
  assert.throws(
    () => recordTeachingArchiveMaterialPublishedContentPreviewPrecheck({
      ...validInput(),
      selectedArchiveItem: { ...safeArchiveItem(), contentPreview: "first page text" },
    }, { precheckLogPath: tempLog().logPath }),
    /contentPreview/u,
  );
});

test("rejects attempts to turn the precheck into DB, HTTP, object storage, OCR/RAG, model, publication, tool, or Swarm work", () => {
  for (const field of [
    "rawContentReadAllowed",
    "contentRefDisclosureAllowed",
    "objectStorageReadAllowed",
    "directDatabaseAccessAllowed",
    "executeHttpRequestAllowed",
    "ocrOrRagJobWriteAllowed",
    "semanticRetrievalAllowed",
    "aiGradingWriteAllowed",
    "modelInferenceAllowed",
    "publicationWriteAllowed",
    "remoteDeviceControlAllowed",
    "localToolMutationAllowed",
    "swarmAllowed",
  ]) {
    assert.throws(
      () => recordTeachingArchiveMaterialPublishedContentPreviewPrecheck({
        ...validInput(),
        contentPreviewPrecheckPolicy: { ...previewPolicy(), [field]: true },
      }, { precheckLogPath: tempLog().logPath }),
      new RegExp(field, "u"),
    );
  }
});

function validInput() {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-published-content-preview-precheck.v1",
    precheckInvocationId: "archive_material_published_content_preview_precheck_001",
    principal: studentPrincipal(),
    publishedDetailMetadataReadReport: sourceReport(),
    archiveItemId: "tarch_archive_material_001",
    selectedArchiveItem: safeArchiveItem(),
    contentPreviewPrecheckPolicy: previewPolicy(),
    evidenceRefs: [
      "evidence:published-detail-metadata-read:0316",
      "evidence:published-content-preview-precheck:0317",
    ],
    idempotencyKey: "archive-material-published-content-preview-precheck:student_001:tarch_archive_material_001",
  };
}

function sourceReport() {
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ",
    runtime: {
      runtimeId: "teaching_archive_material_published_detail_metadata_read_runtime",
      commandPort: "TeachingArchiveMaterialPublishedDetailMetadataReadPort.verifyStudentAppPublishedMaterialDetailMetadataRead",
      status: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_VERIFIED",
    },
    runtimeSlo: { totalErrors: 0 },
    runtimeProbes: {
      teachingArchiveMaterialPublishedDetailMetadataRead: {
        result: {
          recordId: "teaching_archive_material_published_detail_metadata_read_record",
          runtimeId: "teaching_archive_material_published_detail_metadata_read_runtime",
          commandPort: "TeachingArchiveMaterialPublishedDetailMetadataReadPort.verifyStudentAppPublishedMaterialDetailMetadataRead",
          status: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_VERIFIED",
          principal: studentPrincipal(),
          studentProductDetailSource: {
            repository: "ArchiveRepository.GetPublishedForStudentApp",
            projectionTable: "teaching_archive_publications",
          },
          responseMetadata: safeArchiveItem(),
          boundary: {
            contentRefExcluded: true,
            rawContentReadAllowed: false,
          },
          evidenceRefs: ["evidence:published-detail-metadata-read:0316"],
        },
      },
    },
    safetyInvariants: {
      sourceSearchFoundationRequired: true,
      publishedProjectionDetailPortInvoked: true,
      goUseCaseReadAllowed: true,
      archiveItemIdNormalized: true,
      publicationStoreFiltered: true,
      ownStudentOnly: true,
      safeMetadataOnly: true,
      contentRefExcluded: true,
      publicationMetadataExcluded: true,
      answerKeyAndModelOutputExcluded: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      rawContentReadAllowed: false,
      fullTextContentReadAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      publicationWriteStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      futureContentPreviewSliceRequired: true,
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

function previewPolicy() {
  return {
    sourceDetailMetadataReadRequired: true,
    contentPreviewPrecheckOnly: true,
    safeContentPreviewStoreRequiredBeforeRead: true,
    authoritativeContentPreviewStoreAvailable: false,
    futureContentPreviewUseCase: "PreviewStudentAppArchiveItemContent.Execute",
    futureContentPreviewRepository: "ArchiveMaterialContentPreviewRepository.GetOwnPublishedPreview",
    ownStudentOnlyRequired: true,
    safeRendererRequiredBeforeRead: true,
    previewArtifactBoundaryRequired: true,
    rawContentReadAllowed: false,
    contentRefDisclosureAllowed: false,
    objectStorageReadAllowed: false,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    ocrOrRagJobWriteAllowed: false,
    semanticRetrievalAllowed: false,
    aiGradingWriteAllowed: false,
    modelInferenceAllowed: false,
    publicationWriteAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function tempLog() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ita-0317-"));
  return {
    logPath: path.join(dir, "records.jsonl"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
