import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_PORT,
  prepareTeachingArchiveMaterialDraftStoragePrecommit,
} from "./teaching-archive-material-draft-storage-precommit-runtime.mjs";

describe("TeachingArchiveMaterialDraftStoragePrecommitPort.prepareArchiveMaterialDraftStorageCommand", () => {
  it("prepares a Teaching Archive create command after approved human review", async () => {
    const precommitLogPath = tempPrecommitLogPath();
    const result = await prepareTeachingArchiveMaterialDraftStoragePrecommit(baseInput(), {
      precommitLogPath,
      generatedAt: "2026-06-07T07:30:00.000Z",
      storagePrecommitPort: approvingPort(),
    });

    assert.equal(result.commandPort, TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_PORT);
    assert.equal(result.status, "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_READY");
    assert.equal(result.teachingArchiveCreateCommand.operationId, "createTeachingArchiveItem");
    assert.equal(result.teachingArchiveCreateCommand.targetUseCase, "CreateArchiveItem.ExecuteWithPersistence");
    assert.equal(result.teachingArchiveCreateCommand.targetTable, "teaching_archive_items");
    assert.equal(result.teachingArchiveCreateCommand.requestBody.ownerType, "STUDENT");
    assert.equal(result.teachingArchiveCreateCommand.requestBody.analysisIntents[0], "ARCHIVE_ONLY");
    assert.equal(result.boundary.mainDatabaseWritePrepared, true);
    assert.equal(result.boundary.mainDatabaseWriteStarted, false);
    assert.equal(result.boundary.ocrOrRagJobWriteStarted, false);
    assert.equal(result.boundary.aiGradingWriteStarted, false);
    assert.equal(result.boundary.swarmAllowed, false);
    assert.equal(result.runtimeSlo.p99Ms, 6);

    const records = readRecords(precommitLogPath);
    assert.equal(records.length, 1);
    assert.equal(records[0].runtimeId, "teaching_archive_material_draft_storage_precommit_runtime");
  });

  it("uses idempotency for replay and rejects conflicting storage commands", async () => {
    const precommitLogPath = tempPrecommitLogPath();
    const first = await prepareTeachingArchiveMaterialDraftStoragePrecommit(baseInput(), {
      precommitLogPath,
      generatedAt: "2026-06-07T07:30:00.000Z",
      storagePrecommitPort: approvingPort(),
    });
    const second = await prepareTeachingArchiveMaterialDraftStoragePrecommit(baseInput(), {
      precommitLogPath,
      generatedAt: "2026-06-07T07:35:00.000Z",
      storagePrecommitPort: approvingPort(),
    });

    assert.equal(first.recordId, second.recordId);
    assert.equal(second.idempotentReplay, true);
    assert.equal(readRecords(precommitLogPath).length, 1);

    await assert.rejects(
      () => prepareTeachingArchiveMaterialDraftStoragePrecommit(baseInput({
        principal: { ...teacherPrincipal(), principalId: "admin_001", role: "ADMIN" },
      }), { precommitLogPath, storagePrecommitPort: approvingPort() }),
      /record\.inputHash/u,
    );
  });

  it("rejects unapproved human review and unsafe source mismatch", async () => {
    await assert.rejects(
      () => prepareTeachingArchiveMaterialDraftStoragePrecommit(baseInput({
        humanReviewReport: humanReviewReport({ status: "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_REVISION_REQUIRED" }),
      }), { precommitLogPath: tempPrecommitLogPath(), storagePrecommitPort: approvingPort() }),
      /runtime\.status/u,
    );

    await assert.rejects(
      () => prepareTeachingArchiveMaterialDraftStoragePrecommit(baseInput({
        draftIntentSnapshot: { ...draftIntentSnapshot(), draftArtifactRef: "draft://archive-material/wrong" },
      }), { precommitLogPath: tempPrecommitLogPath(), storagePrecommitPort: approvingPort() }),
      /draftArtifactRef/u,
    );
  });

  it("rejects unsafe principal, student scope mismatch, policy, and analysis intents", async () => {
    await assert.rejects(
      () => prepareTeachingArchiveMaterialDraftStoragePrecommit(baseInput({
        principal: { ...teacherPrincipal(), scopes: ["TEACHING_WRITE", "HARNESS_APPROVE", "TEACHING_READ"] },
      }), { precommitLogPath: tempPrecommitLogPath(), storagePrecommitPort: approvingPort() }),
      /STUDENT_ARCHIVE_WRITE/u,
    );

    await assert.rejects(
      () => prepareTeachingArchiveMaterialDraftStoragePrecommit(baseInput({
        principal: {
          ...teacherPrincipal(),
          studentAccess: { mode: "ASSIGNED", studentIds: ["student_999"] },
        },
      }), { precommitLogPath: tempPrecommitLogPath(), storagePrecommitPort: approvingPort() }),
      /studentAccess must include target studentId/u,
    );

    await assert.rejects(
      () => prepareTeachingArchiveMaterialDraftStoragePrecommit(baseInput({
        storagePolicy: { ...storagePolicy(), mainDatabaseWriteAllowed: true },
      }), { precommitLogPath: tempPrecommitLogPath(), storagePrecommitPort: approvingPort() }),
      /mainDatabaseWriteAllowed/u,
    );

    await assert.rejects(
      () => prepareTeachingArchiveMaterialDraftStoragePrecommit(baseInput({
        storageRequest: { ...storageRequest(), analysisIntents: ["ARCHIVE_ONLY", "AI_GRADING"] },
      }), { precommitLogPath: tempPrecommitLogPath(), storagePrecommitPort: approvingPort() }),
      /ARCHIVE_ONLY only/u,
    );
  });

  it("rejects missing ports, leaked fields, unsafe content refs, and unsafe port results", async () => {
    const precommitLogPath = tempPrecommitLogPath();

    await assert.rejects(
      () => prepareTeachingArchiveMaterialDraftStoragePrecommit(baseInput(), { precommitLogPath }),
      /prepareArchiveMaterialDraftStorageCommand/u,
    );
    assert.equal(existsSync(precommitLogPath), false);

    await assert.rejects(
      () => prepareTeachingArchiveMaterialDraftStoragePrecommit(baseInput({
        storageRequest: { ...storageRequest(), directSql: "blocked" },
      }), { precommitLogPath, storagePrecommitPort: approvingPort() }),
      /directSql/u,
    );

    await assert.rejects(
      () => prepareTeachingArchiveMaterialDraftStoragePrecommit(baseInput({
        storageRequest: { ...storageRequest(), contentRef: "http://example.test/material" },
      }), { precommitLogPath, storagePrecommitPort: approvingPort() }),
      /controlled archive material ref/u,
    );

    await assert.rejects(
      () => prepareTeachingArchiveMaterialDraftStoragePrecommit(baseInput(), {
        precommitLogPath,
        storagePrecommitPort: {
          async prepareArchiveMaterialDraftStorageCommand(request) {
            return {
              precommit: {
                precommitId: "archive_material_draft_storage_precommit_001",
                commandId: request.teachingArchiveCreateCommand.commandId,
                status: "WRONG",
                executionState: "STORAGE_PRECOMMIT_RECORDED_NOT_COMMITTED",
              },
            };
          },
        },
      }),
      /status/u,
    );
  });
});

function baseInput(overrides = {}) {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-draft-storage-precommit.v1",
    precommitInvocationId: "archive_material_draft_storage_precommit_001",
    humanReviewReport: humanReviewReport(),
    draftIntentSnapshot: draftIntentSnapshot(),
    principal: teacherPrincipal(),
    storageRequest: storageRequest(),
    storagePolicy: storagePolicy(),
    evidenceRefs: [
      "evidence:archive-material-draft-intent:archive_material_draft_intent_001",
      "evidence:archive-material-draft-human-review:archive_material_draft_review_001",
    ],
    idempotencyKey: "archive-material-draft-storage-precommit:student_001:fractions_packet",
    ...overrides,
  };
}

function humanReviewReport(overrides = {}) {
  const status = overrides.status ?? "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_APPROVED_FOR_PRECOMMIT";
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW",
    runtime: {
      runtimeId: "teaching_archive_material_draft_human_review_runtime",
      commandPort: "TeachingArchiveMaterialDraftReviewPort.recordArchiveMaterialDraftHumanReview",
      status,
    },
    runtimeSlo: { p99Ms: 6, totalErrors: 0 },
    runtimeProbes: {
      teachingArchiveMaterialDraftHumanReview: {
        result: {
          runtimeId: "teaching_archive_material_draft_human_review_runtime",
          commandPort: "TeachingArchiveMaterialDraftReviewPort.recordArchiveMaterialDraftHumanReview",
          status,
          recordId: "teaching_archive_material_draft_human_review_archive-material-draft-review_student_001_fractions_packet",
          sourceDraftIntent: {
            draftIntentId: "archive_material_draft_intent_001",
            draftArtifactRef: "draft://archive-material/student_001/fractions-packet",
          },
          humanReview: {
            reviewId: "archive_material_draft_review_001",
            decision: status.endsWith("APPROVED_FOR_PRECOMMIT") ? "APPROVED_FOR_PRECOMMIT" : "REVISION_REQUIRED",
            executionState: "HUMAN_REVIEW_RECORDED_NOT_COMMITTED",
          },
          boundary: {
            precommitCandidateAllowed: status.endsWith("APPROVED_FOR_PRECOMMIT"),
            finalArchiveItemWriteStarted: false,
            mainDatabaseWriteStarted: false,
            ocrOrRagJobWriteStarted: false,
            aiGradingWriteStarted: false,
          },
          evidenceRefs: ["evidence:archive-material-draft-human-review-input-hash:abc"],
        },
      },
    },
  };
}

function draftIntentSnapshot() {
  return {
    draftIntentId: "archive_material_draft_intent_001",
    ownerType: "STUDENT",
    studentId: "student_001",
    materialType: "HANDOUT",
    source: "AGENT_DRAFT",
    title: "Fractions practice packet",
    draftArtifactRef: "draft://archive-material/student_001/fractions-packet",
    sourceRefs: ["source://lesson/fractions/week-01"],
  };
}

function teacherPrincipal() {
  return {
    principalId: "teacher_001",
    subjectType: "USER",
    role: "TEACHER",
    entryPoint: "DESKTOP_TEACHER",
    sessionId: "teacher_session_001",
    scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "HARNESS_APPROVE"],
    studentAccess: { mode: "ASSIGNED", studentIds: ["student_001"] },
  };
}

function storageRequest() {
  return {
    ownerType: "STUDENT",
    studentId: "student_001",
    materialType: "HANDOUT",
    title: "Fractions practice packet",
    source: "SYSTEM_IMPORT",
    contentRef: "precommit://archive-material/student_001/fractions-packet",
    tags: ["fractions", "draft-approved"],
    analysisIntents: ["ARCHIVE_ONLY"],
    ocrReserved: false,
  };
}

function storagePolicy() {
  return {
    humanReviewRequired: true,
    humanReviewApproved: true,
    storagePrecommitAllowed: true,
    idempotentStorageCommandRequired: true,
    preserveDraftEvidenceRequired: true,
    requiresFutureStorageCommit: true,
    mainDatabaseWriteAllowed: false,
    mainDatabaseWriteStarted: false,
    mainDatabaseWriteCommitted: false,
    ocrOrRagJobWriteAllowed: false,
    ocrOrRagJobWriteStarted: false,
    aiGradingWriteAllowed: false,
    executeHttpRequestAllowed: false,
    directDatabaseAccessAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function approvingPort() {
  return {
    async prepareArchiveMaterialDraftStorageCommand(request) {
      return {
        precommit: {
          precommitId: "archive_material_draft_storage_precommit_001",
          commandId: request.teachingArchiveCreateCommand.commandId,
          status: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_READY",
          executionState: "STORAGE_PRECOMMIT_RECORDED_NOT_COMMITTED",
        },
      };
    },
  };
}

function tempPrecommitLogPath() {
  return join(mkdtempSync(join(tmpdir(), "teaching-archive-material-storage-precommit-")), "precommit.jsonl");
}

function readRecords(precommitLogPath) {
  return readFileSync(precommitLogPath, "utf8")
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
