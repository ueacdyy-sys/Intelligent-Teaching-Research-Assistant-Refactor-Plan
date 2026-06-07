import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditDeepResearchStudentArchiveStorageCommit,
  formatDeepResearchStudentArchiveStorageCommitAudit,
} from "./research-deep-research-student-archive-storage-commit-audit.mjs";

describe("Research deep_research student archive storage commit audit", () => {
  it("passes when commit invokes the Teaching Archive use case port and persists", async () => {
    const report = await auditDeepResearchStudentArchiveStorageCommit(currentInputs(), {
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT");
    assert.equal(report.runtime.runtimeId, "research_deep_research_student_archive_storage_commit_runtime");
    assert.equal(report.runtime.commandPort, "DeepResearchStudentArchiveStorageCommitPort.commitTeachingArchiveCreateCommand");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 300, true);
    const result = report.runtimeProbes.studentArchiveStorageCommit.result;
    assert.equal(result.status, "TEACHING_ARCHIVE_MAIN_DB_STORAGE_COMMITTED");
    assert.equal(result.teachingArchiveCommit.archiveItem.id, "tarch_deep_research_001");
    assert.equal(result.teachingArchiveCommit.persistence.status, "persisted");
    assert.equal(result.boundary.mainDatabaseWriteStarted, true);
    assert.equal(result.boundary.mainDatabaseWriteCommitted, true);
    assert.match(formatDeepResearchStudentArchiveStorageCommitAudit(report), /Research deep_research student archive storage commit: READY/u);
  });

  it("fails when runtime claims raw DB, HTTP, models, tools, Swarm, or unsafe rendering", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\ndirectDatabaseAccessAllowed: true\nexecuteHttpRequestAllowed: true\nfetch(\nexternalModelCallStarted: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = await auditDeepResearchStudentArchiveStorageCommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps the probe p99 at the async commit boundary budget", async () => {
    const report = await auditDeepResearchStudentArchiveStorageCommit(currentInputs(), { probeP99Ms: 350 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 300);
  });

  it("fails when Go bridge or root hooks omit commit", async () => {
    const inputs = currentInputs();
    inputs.teachingArchiveUsecaseTest = "package usecase_test";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage
      .replaceAll("researchDeepResearchStudentArchiveStorageCommit", "researchDeepResearchStudentArchiveStoragePrecommit")
      .replace("research-deep-research-student-archive-storage-commit.current.json", "research-deep-research-student-archive-storage-precommit.current.json")
      .replace("research_deep_research_student_archive_storage_commit_runtime", "research_deep_research_student_archive_storage_precommit_runtime");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("research-deep-research-student-archive-storage-commit", "research-deep-research-student-archive-storage-precommit");
    inputs.sdd = "student archive storage commit runtime without direct DB wording";
    inputs.architectureBoard = "ResearchAgent.deep_research student archive storage precommit runtime 9.7/10";

    const report = await auditDeepResearchStudentArchiveStorageCommit(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "teaching_archive.use_case_bridge_exists").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_tracks_runtime").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_storage_commit_report").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "structure_tracks_runtime_files").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "sdd.defines_commit_without_direct_db").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "architecture_board.reflects_storage_commit_progress").passed, false);
  });
});

function currentInputs() {
  return {
    inputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-student-archive-storage-commit.v1" },
        studentArchiveStoragePrecommitOutput: { properties: { runtimeId: { const: "research_deep_research_student_archive_storage_precommit_runtime" } } },
        studentArchiveCommitPolicy: { properties: { teachingArchiveUseCaseCommitAllowed: { const: true }, directDatabaseAccessAllowed: { const: false }, executeHttpRequestAllowed: { const: false } } },
      },
    }),
    outputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-student-archive-storage-commit-committed.v1" },
        runtimeId: { const: "research_deep_research_student_archive_storage_commit_runtime" },
        commandPort: { const: "DeepResearchStudentArchiveStorageCommitPort.commitTeachingArchiveCreateCommand" },
        status: { const: "TEACHING_ARCHIVE_MAIN_DB_STORAGE_COMMITTED" },
        teachingArchiveCommit: { properties: { persistence: { properties: { status: { const: "persisted" } } } } },
        boundary: { properties: { mainDatabaseWriteCommitted: { const: true } } },
      },
    }),
    inputExample: JSON.stringify({ studentArchiveCommitPolicy: { injectedTeachingArchivePortRequired: true, directDatabaseAccessAllowed: false } }),
    outputExample: JSON.stringify({ teachingArchiveCommit: { archiveItem: { id: "tarch_deep_research_001" }, persistence: { status: "persisted" } }, boundary: { mainDatabaseWriteCommitted: true } }),
    precommitReport: JSON.stringify({ readiness: "READY", runtime: { runtimeId: "research_deep_research_student_archive_storage_precommit_runtime" } }),
    runtime: [
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_RUNTIME_ID",
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_COMMAND_PORT",
      "DeepResearchStudentArchiveStorageCommitPort.commitTeachingArchiveCreateCommand",
      "commitTeachingArchiveStorage",
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_COMMIT_READY",
      "TEACHING_ARCHIVE_MAIN_DB_STORAGE_COMMITTED",
      "TeachingArchiveCreateItemPort.createArchiveItem is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "AGENT_INTERNAL",
      "STUDENT_ARCHIVE_WRITE",
      "STUDENT_ASSIGNED_READ",
      "mainDatabaseWritePrepared: true",
      "mainDatabaseWriteStarted: true",
      "mainDatabaseWriteCommitted: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "externalModelCallStarted: false",
      "swarmAllowed: false",
    ].join("\n"),
    runtimeTest: [
      "commits a prepared Teaching Archive command through the injected use case port",
      "uses idempotency for replay and rejects conflicting commit commands",
      "rejects missing ports, accepted writes, invalid archive ids, and unsafe command text",
      "rejects direct DB or HTTP policies, student scope mismatch, and Swarm",
    ].join("\n"),
    teachingArchiveUsecase: "func (uc *CreateArchiveItem) ExecuteWithPersistence\ntype ArchiveRepository interface\nPersistenceStatusPersisted",
    teachingArchiveUsecaseTest: "TestCreateArchiveItemAcceptsDeepResearchStorageCommitCommandShape\nSourceSystemImport",
    teachingArchivePrincipalTest: "studentArchiveStorageServicePrincipal",
    teachingArchiveRepository: "INSERT INTO teaching_archive_items",
    teachingArchiveSql: "CREATE TABLE IF NOT EXISTS teaching_archive_items",
    packageJson: JSON.stringify({ scripts: { "audit:research-deep-research-student-archive-storage-commit": "node tools/research-deep-research-student-archive-storage-commit-audit.mjs" } }),
    qualityGate: "Research deep_research student archive storage commit audit",
    rootWorkflowCoverage: "researchDeepResearchStudentArchiveStorageCommit\nresearch-deep-research-student-archive-storage-commit.current.json\nresearch_deep_research_student_archive_storage_commit_runtime\nPERFORMANCE_DECISION_AND_RESEARCH_ASYNC_STUDENT_ARCHIVE_ROW_VERIFICATION_RUNTIME",
    verifyStructure: "0258-research-deep-research-student-archive-storage-commit-runtime.md\ndeep-research-student-archive-storage-commit.input.schema.json\ndeep-research-student-archive-storage-commit.output.schema.json\ndeep-research-student-archive-storage-commit.input.example.json\ndeep-research-student-archive-storage-commit.output.example.json\nresearch-deep-research-student-archive-storage-commit-runtime.mjs\nresearch-deep-research-student-archive-storage-commit-runtime.test.mjs\nresearch-deep-research-student-archive-storage-commit-audit.mjs\nresearch-deep-research-student-archive-storage-commit-audit.test.mjs",
    architectureBoard: "ResearchAgent.deep_research student archive storage commit runtime 9.8/10 mainDatabaseWriteCommitted=true student archive physical row verification runtime 9.9/10",
    sdd: "student archive storage commit runtime\nDeepResearchStudentArchiveStorageCommitPort.commitTeachingArchiveCreateCommand\nTeachingArchiveCreateItemPort.createArchiveItem\nmainDatabaseWriteCommitted=true\nnot a JS direct database write",
  };
}
