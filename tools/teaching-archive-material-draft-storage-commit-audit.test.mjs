import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditTeachingArchiveMaterialDraftStorageCommit,
  formatTeachingArchiveMaterialDraftStorageCommitAudit,
} from "./teaching-archive-material-draft-storage-commit-audit.mjs";

describe("Teaching archive material draft storage commit runtime audit", () => {
  it("passes when storage commit invokes the Teaching Archive use case port", async () => {
    const report = await auditTeachingArchiveMaterialDraftStorageCommit(currentInputs(), {
      generatedAt: "2026-06-07T08:05:00.000Z",
      probeP99Ms: 8,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT");
    assert.equal(report.runtime.runtimeId, "teaching_archive_material_draft_storage_commit_runtime");
    assert.equal(report.runtime.commandPort, "TeachingArchiveMaterialDraftStorageCommitPort.commitArchiveMaterialDraftStorageCommand");
    assert.equal(report.runtimeSlo.p99Ms, 8);
    assert.equal(report.safetyInvariants.mainDatabaseWriteCommitted, true);
    assert.equal(report.safetyInvariants.directDatabaseAccessAllowed, false);
    assert.equal(report.runtimeProbes.teachingArchiveMaterialDraftStorageCommit.result.teachingArchiveCommit.archiveItem.id, "tarch_archive_material_001");
    assert.match(formatTeachingArchiveMaterialDraftStorageCommitAudit(report), /Teaching archive material draft storage commit runtime: READY/u);
  });

  it("fails when the source precommit is not ready or already committed", async () => {
    const inputs = currentInputs();
    const source = JSON.parse(inputs.precommitReport);
    source.runtime.status = "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_REJECTED";
    source.runtimeProbes.teachingArchiveMaterialDraftStoragePrecommit.result.boundary.mainDatabaseWriteCommitted = true;
    inputs.precommitReport = JSON.stringify(source);

    const report = await auditTeachingArchiveMaterialDraftStorageCommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source_precommit.ready_uncommitted").passed, false);
  });

  it("fails when runtime claims raw DB, HTTP, OCR/RAG, AI grading, tools, or Swarm side effects", async () => {
    const inputs = currentInputs();
    inputs.runtime += "\nconst forbidden = 'directDatabaseAccessAllowed: true';\nfetch('http://127.0.0.1');\nocrOrRagJobWriteStarted: true\naiGradingWriteStarted: true\nswarmAllowed: true\n";

    const report = await auditTeachingArchiveMaterialDraftStorageCommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("fails when tests no longer cover commit safety regressions", async () => {
    const inputs = currentInputs();
    inputs.runtimeTest = inputs.runtimeTest.replace(
      "rejects leaked fields, unsafe port results, and archive item mismatch",
      "rejects one unsafe port result",
    );

    const report = await auditTeachingArchiveMaterialDraftStorageCommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_commit_negative_paths").passed, false);
  });

  it("fails when quality, root coverage, structure, SDD, or board hooks are missing", async () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.qualityGate = "";
    inputs.rootWorkflowCoverage = "";
    inputs.verifyStructure = "";
    inputs.architectureBoard = "";
    inputs.sdd = "";

    const report = await auditTeachingArchiveMaterialDraftStorageCommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_PORT",
      "TeachingArchiveMaterialDraftStorageCommitPort.commitArchiveMaterialDraftStorageCommand",
      "commitTeachingArchiveMaterialDraftStorage",
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMITTED",
      "TeachingArchiveCreateItemPort.createArchiveItem is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "storagePrecommitVerified: true",
      "teachingArchiveCreateItemPortInjected: true",
      "mainDatabaseWriteAllowedViaUseCasePort: true",
      "mainDatabaseWritePrepared: true",
      "mainDatabaseWriteStarted: true",
      "mainDatabaseWriteCommitted: true",
      "finalArchiveItemCreated: true",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "executeHttpRequestAllowed: false",
      "directDatabaseAccessAllowed: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "requiresFutureRowVerification: true",
      "rejectLeakedFields",
      "teaching_archive_material_draft_storage_commit_runtime",
    ].join("\n"),
    runtimeTest: [
      "commits a precommitted archive material draft through the injected Teaching Archive port",
      "uses idempotency for replay and rejects conflicting commits",
      "rejects unsafe precommit source, policy, analysis intent, and missing port",
      "rejects leaked fields, unsafe port results, and archive item mismatch",
    ].join("\n"),
    precommitReport: JSON.stringify(precommitReport()),
    teachingArchiveOpenapi: "operationId: createTeachingArchiveItem CreateArchiveItemRequest",
    teachingArchiveSql: "CREATE TABLE IF NOT EXISTS teaching_archive_items INSERT INTO teaching_archive_items",
    teachingArchiveDomain: "OwnerTypeStudent",
    teachingArchivePrincipal: "ScopeStudentArchiveWrite",
    teachingArchiveUsecase: "func (uc *CreateArchiveItem) ExecuteWithPersistence type ArchiveRepository interface",
    teachingArchiveRepository: "INSERT INTO teaching_archive_items",
    packageJson: JSON.stringify({
      scripts: {
        "audit:teaching-archive-material-draft-storage-commit": "node tools/teaching-archive-material-draft-storage-commit-audit.mjs --out reports/teaching-archive-material-draft-storage-commit.current.json",
      },
    }),
    qualityGate: "Teaching archive material draft storage commit runtime audit",
    rootWorkflowCoverage: "teachingArchiveMaterialDraftStorageCommit reports/teaching-archive-material-draft-storage-commit.current.json teaching_archive_material_draft_storage_commit_runtime",
    verifyStructure: "0304-teaching-archive-material-draft-storage-commit.md teaching-archive-material-draft-storage-commit-runtime.mjs teaching-archive-material-draft-storage-commit-audit.mjs teaching_archive_material_draft_storage_commit_runtime",
    architectureBoard: "10.48/10 TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMITTED",
    sdd: "0304-teaching-archive-material-draft-storage-commit.md",
  };
}

function precommitReport() {
  const requestBody = {
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
  const command = {
    commandId: "archive_material_draft_storage_precommit_command_archive_material_draft_intent_001_student_student_001",
    operationId: "createTeachingArchiveItem",
    targetUseCase: "CreateArchiveItem.ExecuteWithPersistence",
    targetRepository: "ArchiveRepository.Create",
    targetTable: "teaching_archive_items",
    sourceHumanReviewRecordId: "teaching_archive_material_draft_human_review_archive-material-draft-review_student_001_fractions_packet",
    sourceDraftIntentId: "archive_material_draft_intent_001",
    requestBody,
    authorization: {
      principalId: "teacher_001",
      requiredScopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "HARNESS_APPROVE"],
      studentAccess: { mode: "ASSIGNED", studentIds: ["student_001"] },
    },
  };
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT",
    runtime: {
      runtimeId: "teaching_archive_material_draft_storage_precommit_runtime",
      commandPort: "TeachingArchiveMaterialDraftStoragePrecommitPort.prepareArchiveMaterialDraftStorageCommand",
      status: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_READY",
    },
    runtimeSlo: { p99Ms: 4, totalErrors: 0 },
    runtimeProbes: {
      teachingArchiveMaterialDraftStoragePrecommit: {
        result: {
          schemaVersion: "2026-06-07.teaching.archive-material-draft-storage-precommit-prepared.v1",
          runtimeId: "teaching_archive_material_draft_storage_precommit_runtime",
          commandPort: "TeachingArchiveMaterialDraftStoragePrecommitPort.prepareArchiveMaterialDraftStorageCommand",
          status: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_READY",
          recordId: "teaching_archive_material_draft_storage_precommit_archive-material-draft-storage-precommit_student_001_fractions_packet",
          sourceHumanReview: {
            recordId: "teaching_archive_material_draft_human_review_archive-material-draft-review_student_001_fractions_packet",
          },
          precommit: {
            precommitId: "archive_material_draft_storage_precommit_001",
            commandId: command.commandId,
            executionState: "STORAGE_PRECOMMIT_RECORDED_NOT_COMMITTED",
          },
          teachingArchiveCreateCommand: command,
          boundary: {
            mainDatabaseWritePrepared: true,
            mainDatabaseWriteStarted: false,
            mainDatabaseWriteCommitted: false,
            ocrOrRagJobWriteStarted: false,
            aiGradingWriteStarted: false,
          },
          evidenceRefs: ["evidence:archive-material-draft-storage-precommit-input-hash:abc"],
        },
      },
    },
  };
}
