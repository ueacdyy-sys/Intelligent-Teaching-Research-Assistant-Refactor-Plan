import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditTeachingArchiveMaterialDraftHumanReview,
  formatTeachingArchiveMaterialDraftHumanReviewAudit,
} from "./teaching-archive-material-draft-human-review-audit.mjs";

describe("Teaching archive material draft human review runtime audit", () => {
  it("passes when human review is recorded without storage side effects", async () => {
    const report = await auditTeachingArchiveMaterialDraftHumanReview(currentInputs(), {
      generatedAt: "2026-06-07T07:20:00.000Z",
      probeP99Ms: 6,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW");
    assert.equal(report.runtime.runtimeId, "teaching_archive_material_draft_human_review_runtime");
    assert.equal(report.runtimeSlo.p99Ms, 6);
    assert.equal(report.safetyInvariants.finalArchiveItemWriteStarted, false);
    assert.match(formatTeachingArchiveMaterialDraftHumanReviewAudit(report), /Teaching archive material draft human review runtime: READY/u);
  });

  it("fails when the source draft intent is no longer review-only", async () => {
    const inputs = currentInputs();
    const source = JSON.parse(inputs.sourceDraftIntentReport);
    source.boundary.finalArchiveItemWriteAllowed = true;
    inputs.sourceDraftIntentReport = JSON.stringify(source);

    const report = await auditTeachingArchiveMaterialDraftHumanReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source_archive_material_draft_intent.ready_review_only").passed, false);
  });

  it("fails when runtime claims direct storage or HTTP side effects", async () => {
    const inputs = currentInputs();
    inputs.runtime += "\nconst forbidden = 'finalArchiveItemWriteStarted: true';\nfetch('http://127.0.0.1');\n";

    const report = await auditTeachingArchiveMaterialDraftHumanReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("fails when tests no longer cover unsafe policy paths", async () => {
    const inputs = currentInputs();
    inputs.runtimeTest = inputs.runtimeTest.replace(
      "rejects missing ports, unsafe reviewers, unsafe source state, and unsafe policy",
      "rejects missing ports only",
    );

    const report = await auditTeachingArchiveMaterialDraftHumanReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_human_review_negative_paths").passed, false);
  });

  it("fails when root quality hooks do not track the slice", async () => {
    const inputs = currentInputs();
    inputs.qualityGate = "";
    inputs.rootWorkflowCoverage = "";
    inputs.verifyStructure = "";
    inputs.architectureBoard = "";
    inputs.sdd = "";

    const report = await auditTeachingArchiveMaterialDraftHumanReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_PORT",
      "TeachingArchiveMaterialDraftReviewPort.recordArchiveMaterialDraftHumanReview",
      "recordTeachingArchiveMaterialDraftHumanReview",
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_APPROVED_FOR_PRECOMMIT",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "humanReviewRecorded: true",
      "archiveMaterialDraftIntentVerified: true",
      "precommitCandidateAllowed: approved",
      "finalArchiveItemWriteStarted: false",
      "mainDatabaseWriteStarted: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "executionCandidateAllowed: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "requiresFutureStoragePrecommit: approved",
      "rejectLeakedFields",
      "teaching_archive_material_draft_human_review_runtime",
    ].join("\n"),
    runtimeTest: [
      "records approved human review without final archive writes",
      "records revision-required human review and blocks precommit",
      "uses idempotency for replay and rejects conflicting reviews",
      "rejects missing ports, unsafe reviewers, unsafe source state, and unsafe policy",
      "rejects leaked fields, missing checklist, missing evidence, and unsafe port results",
    ].join("\n"),
    sourceDraftIntentReport: JSON.stringify({
      readiness: "READY",
      workloadType: "TEACHING_ARCHIVE_MATERIAL_DRAFT_INTENT_RUNTIME",
      commandPort: "TeachingDraftCommandPort.submitArchiveMaterialDraftIntent",
      boundary: {
        status: "REVIEW_REQUIRED",
        executionCandidateAllowed: false,
        finalArchiveItemWriteAllowed: false,
        ocrOrRagJobWriteAllowed: false,
        finalAiGradingWriteAllowed: false,
      },
    }),
    packageJson: JSON.stringify({
      scripts: {
        "audit:teaching-archive-material-draft-human-review": "node tools/teaching-archive-material-draft-human-review-audit.mjs --out reports/teaching-archive-material-draft-human-review.current.json",
      },
    }),
    qualityGate: "Teaching archive material draft human review runtime audit",
    rootWorkflowCoverage: "teachingArchiveMaterialDraftHumanReview reports/teaching-archive-material-draft-human-review.current.json",
    verifyStructure: [
      "teaching-archive-material-draft-human-review-runtime.mjs",
      "teaching-archive-material-draft-human-review-audit.mjs",
      "0302-teaching-archive-material-draft-human-review.md",
      "teaching_archive_material_draft_human_review_runtime",
    ].join("\n"),
    architectureBoard: "10.42/10 TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_APPROVED_FOR_PRECOMMIT",
    sdd: "0302-teaching-archive-material-draft-human-review.md",
  };
}
