import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditTeachingArchiveMaterialDraftStoragePrecommit,
  formatTeachingArchiveMaterialDraftStoragePrecommitAudit,
} from "./teaching-archive-material-draft-storage-precommit-audit.mjs";

describe("Teaching archive material draft storage precommit runtime audit", () => {
  it("passes when storage precommit prepares a command without final writes", async () => {
    const report = await auditTeachingArchiveMaterialDraftStoragePrecommit(currentInputs(), {
      generatedAt: "2026-06-07T07:45:00.000Z",
      probeP99Ms: 6,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT");
    assert.equal(report.runtime.runtimeId, "teaching_archive_material_draft_storage_precommit_runtime");
    assert.equal(report.runtimeSlo.p99Ms, 6);
    assert.equal(report.safetyInvariants.mainDatabaseWriteStarted, false);
    assert.match(formatTeachingArchiveMaterialDraftStoragePrecommitAudit(report), /Teaching archive material draft storage precommit runtime: READY/u);
  });

  it("fails when human review is not approved for precommit", async () => {
    const inputs = currentInputs();
    const source = JSON.parse(inputs.humanReviewReport);
    source.runtime.status = "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_REVISION_REQUIRED";
    inputs.humanReviewReport = JSON.stringify(source);

    const report = await auditTeachingArchiveMaterialDraftStoragePrecommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source_human_review.ready_approved_for_precommit").passed, false);
  });

  it("fails when runtime claims DB, HTTP, OCR/RAG, or Swarm side effects", async () => {
    const inputs = currentInputs();
    inputs.runtime += "\nconst forbidden = 'mainDatabaseWriteStarted: true';\nfetch('http://127.0.0.1');\n";

    const report = await auditTeachingArchiveMaterialDraftStoragePrecommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("fails when tests no longer cover policy and source-state paths", async () => {
    const inputs = currentInputs();
    inputs.runtimeTest = inputs.runtimeTest.replace(
      "rejects unsafe principal, student scope mismatch, policy, and analysis intents",
      "rejects unsafe principal only",
    );

    const report = await auditTeachingArchiveMaterialDraftStoragePrecommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_precommit_negative_paths").passed, false);
  });

  it("fails when quality, root coverage, structure, SDD, or board hooks are missing", async () => {
    const inputs = currentInputs();
    inputs.qualityGate = "";
    inputs.rootWorkflowCoverage = "";
    inputs.verifyStructure = "";
    inputs.architectureBoard = "";
    inputs.sdd = "";

    const report = await auditTeachingArchiveMaterialDraftStoragePrecommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_PORT",
      "TeachingArchiveMaterialDraftStoragePrecommitPort.prepareArchiveMaterialDraftStorageCommand",
      "prepareTeachingArchiveMaterialDraftStoragePrecommit",
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_READY",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "humanReviewVerified: true",
      "draftIntentVerified: true",
      "storageCommandPrepared: true",
      "mainDatabaseWritePrepared: true",
      "finalArchiveItemWriteStarted: false",
      "mainDatabaseWriteStarted: false",
      "mainDatabaseWriteCommitted: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "executeHttpRequestAllowed: false",
      "directDatabaseAccessAllowed: false",
      "swarmAllowed: false",
      "requiresFutureStorageCommit: true",
      "rejectLeakedFields",
      "teaching_archive_material_draft_storage_precommit_runtime",
    ].join("\n"),
    runtimeTest: [
      "prepares a Teaching Archive create command after approved human review",
      "uses idempotency for replay and rejects conflicting storage commands",
      "rejects unapproved human review and unsafe source mismatch",
      "rejects unsafe principal, student scope mismatch, policy, and analysis intents",
      "rejects missing ports, leaked fields, unsafe content refs, and unsafe port results",
    ].join("\n"),
    humanReviewReport: JSON.stringify({
      readiness: "READY",
      workloadType: "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW",
      runtime: {
        runtimeId: "teaching_archive_material_draft_human_review_runtime",
        commandPort: "TeachingArchiveMaterialDraftReviewPort.recordArchiveMaterialDraftHumanReview",
        status: "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_APPROVED_FOR_PRECOMMIT",
      },
      runtimeSlo: { p99Ms: 6, totalErrors: 0 },
      runtimeProbes: {
        teachingArchiveMaterialDraftHumanReview: {
          result: {
            runtimeId: "teaching_archive_material_draft_human_review_runtime",
            commandPort: "TeachingArchiveMaterialDraftReviewPort.recordArchiveMaterialDraftHumanReview",
            status: "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_APPROVED_FOR_PRECOMMIT",
            recordId: "teaching_archive_material_draft_human_review_archive-material-draft-review_student_001_fractions_packet",
            sourceDraftIntent: {
              draftIntentId: "archive_material_draft_intent_001",
              draftArtifactRef: "draft://archive-material/student_001/fractions-packet",
            },
            humanReview: {
              reviewId: "archive_material_draft_review_001",
              decision: "APPROVED_FOR_PRECOMMIT",
              executionState: "HUMAN_REVIEW_RECORDED_NOT_COMMITTED",
            },
            boundary: {
              precommitCandidateAllowed: true,
              finalArchiveItemWriteStarted: false,
              mainDatabaseWriteStarted: false,
              ocrOrRagJobWriteStarted: false,
              aiGradingWriteStarted: false,
            },
            evidenceRefs: ["evidence:archive-material-draft-human-review-input-hash:abc"],
          },
        },
      },
    }),
    teachingArchiveOpenapi: "operationId: createTeachingArchiveItem CreateArchiveItemRequest",
    teachingArchiveSql: "CREATE TABLE IF NOT EXISTS teaching_archive_items INSERT INTO teaching_archive_items",
    teachingArchiveDomain: "OwnerTypeStudent",
    teachingArchivePrincipal: "ScopeStudentArchiveWrite",
    teachingArchiveUsecase: "func (uc *CreateArchiveItem) ExecuteWithPersistence type ArchiveRepository interface",
    teachingArchiveRepository: "INSERT INTO teaching_archive_items",
    packageJson: JSON.stringify({
      scripts: {
        "audit:teaching-archive-material-draft-storage-precommit": "node tools/teaching-archive-material-draft-storage-precommit-audit.mjs --out reports/teaching-archive-material-draft-storage-precommit.current.json",
      },
    }),
    qualityGate: "Teaching archive material draft storage precommit runtime audit",
    rootWorkflowCoverage: "teachingArchiveMaterialDraftStoragePrecommit reports/teaching-archive-material-draft-storage-precommit.current.json teaching_archive_material_draft_storage_precommit_runtime",
    verifyStructure: "0303-teaching-archive-material-draft-storage-precommit.md teaching-archive-material-draft-storage-precommit-runtime.mjs teaching-archive-material-draft-storage-precommit-audit.mjs teaching_archive_material_draft_storage_precommit_runtime",
    architectureBoard: "10.45/10 TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_READY",
    sdd: "0303-teaching-archive-material-draft-storage-precommit.md",
  };
}
