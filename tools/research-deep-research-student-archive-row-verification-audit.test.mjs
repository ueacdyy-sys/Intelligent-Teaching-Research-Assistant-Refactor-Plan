import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditDeepResearchStudentArchiveRowVerification,
  formatDeepResearchStudentArchiveRowVerificationAudit,
} from "./research-deep-research-student-archive-row-verification-audit.mjs";

describe("Research deep_research student archive row verification audit", () => {
  it("passes when row verification uses an injected read port and Go GetByID evidence", async () => {
    const report = await auditDeepResearchStudentArchiveRowVerification(currentInputs(), {
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION");
    assert.equal(report.runtime.runtimeId, "research_deep_research_student_archive_row_verification_runtime");
    assert.equal(report.runtime.commandPort, "DeepResearchStudentArchiveRowVerificationPort.verifyTeachingArchivePhysicalRow");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 300, true);
    const result = report.runtimeProbes.studentArchiveRowVerification.result;
    assert.equal(result.status, "TEACHING_ARCHIVE_PHYSICAL_ROW_VERIFIED");
    assert.equal(result.teachingArchivePhysicalRow.targetRepository, "ArchiveRepository.GetByID");
    assert.equal(result.teachingArchivePhysicalRow.archiveItem.id, "tarch_deep_research_001");
    assert.equal(result.boundary.physicalDatabaseRowVerified, true);
    assert.match(formatDeepResearchStudentArchiveRowVerificationAudit(report), /Research deep_research student archive row verification: READY/u);
  });

  it("fails when runtime claims raw DB, HTTP, models, tools, Swarm, or unsafe rendering", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\ndirectDatabaseAccessAllowed: true\nexecuteHttpRequestAllowed: true\nfetch(\nexternalModelCallStarted: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = await auditDeepResearchStudentArchiveRowVerification(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps the probe p99 at the async row verification boundary budget", async () => {
    const report = await auditDeepResearchStudentArchiveRowVerification(currentInputs(), { probeP99Ms: 350 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 300);
  });

  it("fails when Go evidence or root hooks omit row verification", async () => {
    const inputs = currentInputs();
    inputs.teachingArchiveRepositoryTest = "package postgres_test";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage
      .replaceAll("researchDeepResearchStudentArchiveRowVerification", "researchDeepResearchStudentArchiveStorageCommit")
      .replace("research-deep-research-student-archive-row-verification.current.json", "research-deep-research-student-archive-storage-commit.current.json")
      .replace("research_deep_research_student_archive_row_verification_runtime", "research_deep_research_student_archive_storage_commit_runtime");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("research-deep-research-student-archive-row-verification", "research-deep-research-student-archive-storage-commit");
    inputs.sdd = "student archive physical row verification runtime without direct read wording";
    inputs.architectureBoard = "ResearchAgent.deep_research student archive storage commit runtime 9.8/10";

    const report = await auditDeepResearchStudentArchiveRowVerification(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "teaching_archive.repository_get_by_id_evidence_exists").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_and_root_hooks_track_runtime").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "structure_sdd_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    inputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-student-archive-row-verification.v1" },
        studentArchiveStorageCommitOutput: { properties: { runtimeId: { const: "research_deep_research_student_archive_storage_commit_runtime" } } },
        studentArchiveRowVerificationPolicy: { properties: { physicalRowVerificationRequired: { const: true }, directDatabaseAccessAllowed: { const: false } } },
      },
    }),
    outputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-student-archive-row-verification-verified.v1" },
        runtimeId: { const: "research_deep_research_student_archive_row_verification_runtime" },
        commandPort: { const: "DeepResearchStudentArchiveRowVerificationPort.verifyTeachingArchivePhysicalRow" },
        status: { const: "TEACHING_ARCHIVE_PHYSICAL_ROW_VERIFIED" },
        teachingArchivePhysicalRow: { properties: { targetRepository: { const: "ArchiveRepository.GetByID" } } },
        boundary: { properties: { physicalDatabaseRowVerified: { const: true } } },
      },
    }),
    inputExample: JSON.stringify({ studentArchiveRowVerificationPolicy: { injectedTeachingArchiveRowReadPortRequired: true, directDatabaseAccessAllowed: false } }),
    outputExample: JSON.stringify({ teachingArchivePhysicalRow: { archiveItem: { id: "tarch_deep_research_001" } } }),
    commitReport: JSON.stringify({ readiness: "READY", runtime: { runtimeId: "research_deep_research_student_archive_storage_commit_runtime" } }),
    runtime: [
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_RUNTIME_ID",
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_COMMAND_PORT",
      "DeepResearchStudentArchiveRowVerificationPort.verifyTeachingArchivePhysicalRow",
      "verifyDeepResearchStudentArchivePhysicalRow",
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_ROW_VERIFICATION_READY",
      "TEACHING_ARCHIVE_PHYSICAL_ROW_VERIFIED",
      "TeachingArchiveRowReadPort.getArchiveItemById is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "mainDatabaseWritePrepared: true",
      "mainDatabaseWriteStarted: true",
      "mainDatabaseWriteCommitted: true",
      "physicalDatabaseRowVerified: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "externalModelCallStarted: false",
      "swarmAllowed: false",
    ].join("\n"),
    runtimeTest: [
      "verifies the committed Teaching Archive item through the injected row read port",
      "uses idempotency for replay and rejects conflicting committed rows",
      "rejects missing ports, missing rows, mismatched ids, and mismatched content refs",
      "rejects wrong owner scope, direct DB or HTTP policies, and Swarm",
    ].join("\n"),
    teachingArchiveRepository: "func (r *ArchiveRepository) GetByID\nFROM teaching_archive_items\nWHERE id = $1\nscanArchiveItem",
    teachingArchiveRepositoryTest: "TestGetByIDReturnsDeepResearchStorageCommitPhysicalRow\ntarch_deep_research_001",
    teachingArchiveRepositoryHelpers: "singleArchiveItemRow",
    packageJson: JSON.stringify({ scripts: { "audit:research-deep-research-student-archive-row-verification": "node tools/research-deep-research-student-archive-row-verification-audit.mjs" } }),
    qualityGate: "Research deep_research student archive row verification audit",
    rootWorkflowCoverage: "researchDeepResearchStudentArchiveRowVerification\nresearch-deep-research-student-archive-row-verification.current.json\nresearch_deep_research_student_archive_row_verification_runtime\nPERFORMANCE_DECISION_AND_RESEARCH_ASYNC_STUDENT_ARCHIVE_ROW_VERIFICATION_RUNTIME",
    verifyStructure: "0259-research-deep-research-student-archive-row-verification-runtime.md\ndeep-research-student-archive-row-verification.input.schema.json\ndeep-research-student-archive-row-verification.output.schema.json\nresearch-deep-research-student-archive-row-verification-runtime.mjs\nresearch-deep-research-student-archive-row-verification-audit.test.mjs",
    sdd: "student archive physical row verification runtime\nDeepResearchStudentArchiveRowVerificationPort.verifyTeachingArchivePhysicalRow\nTeachingArchiveRowReadPort.getArchiveItemById\nphysicalDatabaseRowVerified=true\nnot a JS direct database read",
    architectureBoard: "student archive physical row verification runtime 9.9/10 physicalDatabaseRowVerified=true 22,435.1 read/write RPS",
  };
}
