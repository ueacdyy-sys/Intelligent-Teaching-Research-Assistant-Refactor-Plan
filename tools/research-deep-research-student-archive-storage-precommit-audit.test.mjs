import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditDeepResearchStudentArchiveStoragePrecommit,
  formatDeepResearchStudentArchiveStoragePrecommitAudit,
} from "./research-deep-research-student-archive-storage-precommit-audit.mjs";

describe("Research deep_research student archive storage precommit audit", () => {
  it("passes when precommit prepares a Teaching Archive command without writing the main DB", () => {
    const report = auditDeepResearchStudentArchiveStoragePrecommit(currentInputs(), {
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT");
    assert.equal(report.runtime.runtimeId, "research_deep_research_student_archive_storage_precommit_runtime");
    assert.equal(report.runtime.commandPort, "DeepResearchStudentArchiveStoragePrecommitPort.prepareTeachingArchiveCreateCommand");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 300, true);
    const result = report.runtimeProbes.studentArchiveStoragePrecommit.result;
    assert.equal(result.status, "TEACHING_ARCHIVE_MAIN_DB_STORAGE_PRECOMMIT_PREPARED");
    assert.equal(result.teachingArchiveCreateCommand.operationId, "createTeachingArchiveItem");
    assert.equal(result.teachingArchiveCreateCommand.targetTable, "teaching_archive_items");
    assert.equal(result.boundary.mainDatabaseWritePrepared, true);
    assert.equal(result.boundary.mainDatabaseWriteStarted, false);
    assert.equal(result.boundary.mainDatabaseWriteCommitted, false);
    assert.match(formatDeepResearchStudentArchiveStoragePrecommitAudit(report), /Research deep_research student archive storage precommit: READY/u);
  });

  it("fails when runtime claims DB writes, HTTP execution, models, tools, Swarm, or unsafe rendering", () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nmainDatabaseWriteStarted: true\nmainDatabaseWriteCommitted: true\nexecuteHttpRequestAllowed: true\nfetch(\nexternalModelCallStarted: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = auditDeepResearchStudentArchiveStoragePrecommit(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps the probe p99 at the async precommit boundary budget", () => {
    const report = auditDeepResearchStudentArchiveStoragePrecommit(currentInputs(), { probeP99Ms: 350 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 300);
  });

  it("fails when Teaching Archive storage path or root hooks omit precommit", () => {
    const inputs = currentInputs();
    inputs.teachingArchiveRepository = "package postgres";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage
      .replaceAll("researchDeepResearchStudentArchiveStoragePrecommit", "researchDeepResearchStudentArchiveStoragePrepared")
      .replace("research-deep-research-student-archive-storage-precommit.current.json", "research-deep-research-student-archive-storage-prepared.current.json")
      .replace("research_deep_research_student_archive_storage_precommit_runtime", "research_deep_research_student_archive_storage_prepared_runtime");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("research-deep-research-student-archive-storage-precommit", "research-deep-research-student-archive-storage-prepared");
    inputs.sdd = "student archive storage precommit runtime without commit boundary wording";
    inputs.architectureBoard = "ResearchAgent.deep_research student archive projection runtime 9.6/10";

    const report = auditDeepResearchStudentArchiveStoragePrecommit(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "teaching_archive.storage_path_exists").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_tracks_runtime").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_storage_precommit_report").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "structure_tracks_runtime_files").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "sdd.defines_precommit_without_commit").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "architecture_board.reflects_storage_precommit_progress").passed, false);
  });
});

function currentInputs() {
  return {
    inputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-student-archive-storage-precommit.v1" },
        principal: { properties: { entryPoint: { const: "AGENT_INTERNAL" } } },
        studentArchiveProjectionOutput: { properties: { runtimeId: { const: "research_deep_research_student_archive_projection_runtime" } } },
        studentArchiveStoragePolicy: {
          properties: {
            mainDatabaseWriteAllowed: { const: false },
            executeHttpRequestAllowed: { const: false },
          },
        },
      },
    }),
    outputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-student-archive-storage-precommit-prepared.v1" },
        runtimeId: { const: "research_deep_research_student_archive_storage_precommit_runtime" },
        commandPort: { const: "DeepResearchStudentArchiveStoragePrecommitPort.prepareTeachingArchiveCreateCommand" },
        status: { const: "TEACHING_ARCHIVE_MAIN_DB_STORAGE_PRECOMMIT_PREPARED" },
        boundary: {
          properties: {
            mainDatabaseWritePrepared: { const: true },
            mainDatabaseWriteStarted: { const: false },
          },
        },
      },
    }),
    inputExample: JSON.stringify({
      studentArchiveStoragePolicy: { mainDatabaseWriteAllowed: false, executeHttpRequestAllowed: false },
    }),
    outputExample: JSON.stringify({
      teachingArchiveCreateCommand: { operationId: "createTeachingArchiveItem", targetTable: "teaching_archive_items" },
      boundary: { mainDatabaseWritePrepared: true, mainDatabaseWriteStarted: false },
    }),
    runtime: [
      'export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_RUNTIME_ID = "research_deep_research_student_archive_storage_precommit_runtime";',
      'export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_COMMAND_PORT = "DeepResearchStudentArchiveStoragePrecommitPort.prepareTeachingArchiveCreateCommand";',
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_STORAGE_PRECOMMIT_READY",
      "prepareTeachingArchiveStoragePrecommit",
      "TEACHING_ARCHIVE_MAIN_DB_STORAGE_PRECOMMIT_PREPARED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "AGENT_INTERNAL",
      "STUDENT_ARCHIVE_WRITE",
      "STUDENT_ASSIGNED_READ",
      "studentAccess must include targetStudentId",
      "mainDatabaseWritePrepared: true",
      "mainDatabaseWriteStarted: false",
      "mainDatabaseWriteCommitted: false",
      "executeHttpRequestAllowed: false",
      "directDatabaseAccessAllowed: false",
      "externalModelCallStarted: false",
      "swarmAllowed: false",
    ].join("\n"),
    runtimeTest: [
      "prepares a Teaching Archive create command from a durable projection",
      "uses idempotency for safe replay and rejects conflicting storage commands",
      "rejects invalid write principals, student scope mismatch, and AI grading intent",
      "rejects missing projection output, main DB writes, high risk, and unsafe title",
    ].join("\n"),
    teachingArchiveOpenapi: "operationId: createTeachingArchiveItem\nCreateArchiveItemRequest",
    teachingArchiveSql: "CREATE TABLE IF NOT EXISTS teaching_archive_items",
    teachingArchiveDomain: "OwnerTypeStudent",
    teachingArchivePrincipal: "ScopeStudentArchiveWrite",
    teachingArchiveUsecase: "type ArchiveRepository interface\nfunc (uc *CreateArchiveItem) ExecuteWithPersistence",
    teachingArchiveRepository: "INSERT INTO teaching_archive_items",
    packageJson: JSON.stringify({
      scripts: {
        "audit:research-deep-research-student-archive-storage-precommit": "node tools/research-deep-research-student-archive-storage-precommit-audit.mjs --out reports/research-deep-research-student-archive-storage-precommit.current.json",
      },
    }),
    qualityGate: "Research deep_research student archive storage precommit audit",
    rootWorkflowCoverage: [
      "researchDeepResearchStudentArchiveStoragePrecommit",
      "research-deep-research-student-archive-storage-precommit.current.json",
      "research_deep_research_student_archive_storage_precommit_runtime",
    ].join("\n"),
    verifyStructure: [
      "0257-research-deep-research-student-archive-storage-precommit-runtime.md",
      "deep-research-student-archive-storage-precommit.input.schema.json",
      "deep-research-student-archive-storage-precommit.output.schema.json",
      "deep-research-student-archive-storage-precommit.input.example.json",
      "deep-research-student-archive-storage-precommit.output.example.json",
      "research-deep-research-student-archive-storage-precommit-runtime.mjs",
      "research-deep-research-student-archive-storage-precommit-runtime.test.mjs",
      "research-deep-research-student-archive-storage-precommit-audit.mjs",
      "research-deep-research-student-archive-storage-precommit-audit.test.mjs",
    ].join("\n"),
    architectureBoard: "ResearchAgent.deep_research student archive storage precommit runtime 9.7/10; 9.6/10; mainDatabaseWritePrepared=true; mainDatabaseWriteStarted=false",
    sdd: [
      "student archive storage precommit runtime",
      "DeepResearchStudentArchiveStoragePrecommitPort.prepareTeachingArchiveCreateCommand",
      "mainDatabaseWritePrepared=true",
      "mainDatabaseWriteStarted=false",
      "not the final database commit",
    ].join("\n"),
  };
}
