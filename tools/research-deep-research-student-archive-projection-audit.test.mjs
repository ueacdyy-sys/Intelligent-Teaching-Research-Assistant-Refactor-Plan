import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditDeepResearchStudentArchiveProjection,
  formatDeepResearchStudentArchiveProjectionAudit,
} from "./research-deep-research-student-archive-projection-audit.mjs";

describe("Research deep_research student archive projection audit", () => {
  it("passes when projection consumes review and writes archive projection without main DB", () => {
    const report = auditDeepResearchStudentArchiveProjection(currentInputs(), {
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION");
    assert.equal(report.runtime.runtimeId, "research_deep_research_student_archive_projection_runtime");
    assert.equal(report.runtime.commandPort, "DeepResearchStudentArchiveProjectionPort.projectReviewedStudentArchiveEntry");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 300, true);
    assert.equal(report.runtimeProbes.studentArchiveProjection.result.status, "STUDENT_ARCHIVE_PROJECTION_WRITTEN");
    assert.equal(report.runtimeProbes.studentArchiveProjection.result.boundary.studentArchiveProjectionWritten, true);
    assert.equal(report.runtimeProbes.studentArchiveProjection.result.boundary.studentArchiveWriteStarted, true);
    assert.equal(report.runtimeProbes.studentArchiveProjection.result.boundary.mainDatabaseWriteStarted, false);
    assert.match(formatDeepResearchStudentArchiveProjectionAudit(report), /Research deep_research student archive projection: READY/u);
  });

  it("fails when runtime claims main DB writes, model access, tools, Swarm, or unsafe rendering", () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nmainDatabaseWriteStarted: true\nmainDatabaseWriteAllowed: true\nexternalModelCallStarted: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = auditDeepResearchStudentArchiveProjection(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.review_consumption_and_safety_boundaries").passed, false);
  });

  it("caps the probe p99 at the async projection boundary budget", () => {
    const report = auditDeepResearchStudentArchiveProjection(currentInputs(), { probeP99Ms: 350 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 300);
  });

  it("fails when quality, structure, root workflow, SDD, or board hooks omit projection", () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage
      .replaceAll("researchDeepResearchStudentArchiveProjection", "researchDeepResearchStudentArchiveProjected")
      .replace("research-deep-research-student-archive-projection.current.json", "research-deep-research-student-archive-projected.current.json")
      .replace("research_deep_research_student_archive_projection_runtime", "research_deep_research_student_archive_projected_runtime");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("research-deep-research-student-archive-projection", "research-deep-research-student-archive-projected");
    inputs.sdd = "student archive projection runtime without required boundary wording";
    inputs.architectureBoard = "ResearchAgent.deep_research student archive projection review runtime 9.5/10; studentArchiveProjectionWritten=false";

    const report = auditDeepResearchStudentArchiveProjection(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_tracks_runtime").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_projection_report").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "structure_tracks_runtime_files").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "sdd.defines_projection_without_main_db").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "architecture_board.reflects_projection_progress").passed, false);
  });
});

function currentInputs() {
  return {
    inputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-student-archive-projection.v1" },
        studentArchiveProjectionReviewRecord: {
          properties: {
            runtimeId: { const: "research_deep_research_student_archive_projection_review_runtime" },
            status: { const: "STUDENT_ARCHIVE_PROJECTION_REVIEW_APPROVED_NOT_WRITTEN" },
          },
        },
        studentArchiveProjectionPolicy: {
          properties: {
            durableStudentArchiveProjectionAllowed: { const: true },
            studentArchiveProjectionWriteAllowed: { const: true },
            mainDatabaseWriteAllowed: { const: false },
          },
        },
      },
    }),
    outputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-student-archive-projection-recorded.v1" },
        runtimeId: { const: "research_deep_research_student_archive_projection_runtime" },
        commandPort: { const: "DeepResearchStudentArchiveProjectionPort.projectReviewedStudentArchiveEntry" },
        status: { const: "STUDENT_ARCHIVE_PROJECTION_WRITTEN" },
        boundary: {
          properties: {
            studentArchiveProjectionWritten: { const: true },
            mainDatabaseWriteStarted: { const: false },
          },
        },
      },
    }),
    inputExample: JSON.stringify({
      studentArchiveProjectionReviewRecord: { status: "STUDENT_ARCHIVE_PROJECTION_REVIEW_APPROVED_NOT_WRITTEN" },
      studentArchiveProjectionPolicy: { studentArchiveProjectionWriteAllowed: true, mainDatabaseWriteAllowed: false },
    }),
    outputExample: JSON.stringify({
      status: "STUDENT_ARCHIVE_PROJECTION_WRITTEN",
      studentArchiveProjectionRecord: {
        projectionKind: "DURABLE_STUDENT_ARCHIVE_PROJECTION_RECORD",
        projectionState: "PROJECTED_TO_STUDENT_ARCHIVE",
      },
      boundary: { studentArchiveProjectionWritten: true, mainDatabaseWriteStarted: false },
    }),
    runtime: [
      'export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_RUNTIME_ID = "research_deep_research_student_archive_projection_runtime";',
      'export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_COMMAND_PORT = "DeepResearchStudentArchiveProjectionPort.projectReviewedStudentArchiveEntry";',
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_READY",
      "projectReviewedStudentArchiveEntry",
      "STUDENT_ARCHIVE_PROJECTION_WRITTEN",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "input.studentArchiveProjectionReviewRecord.runtimeId",
      "research_deep_research_student_archive_projection_review_runtime",
      "STUDENT_ARCHIVE_PROJECTION_REVIEW_APPROVED_NOT_WRITTEN",
      "controlled projection service principal",
      "STUDENT_ARCHIVE_PROJECTION_WRITE",
      "HIGH risk",
      "studentArchiveProjectionReviewVerified: true",
      "durableStudentArchiveProjectionRecorded: true",
      "studentArchivePersisted: true",
      "studentArchiveProjectionWritten: true",
      "studentArchiveWriteStarted: true",
      "mainDatabaseWriteStarted: false",
      "externalModelCallStarted: false",
      "swarmAllowed: false",
    ].join("\n"),
    runtimeTest: [
      "records a durable student archive projection from an approved review",
      "uses idempotency for safe replay and rejects conflicting projections",
      "rejects non-service principals, missing scopes, unsafe text, and high-risk reviews",
      "rejects missing review, previous projection, main DB writes, model access, Swarm, and mismatched scope",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:research-deep-research-student-archive-projection": "node tools/research-deep-research-student-archive-projection-audit.mjs --out reports/research-deep-research-student-archive-projection.current.json",
      },
    }),
    qualityGate: "Research deep_research student archive projection audit",
    rootWorkflowCoverage: [
      "researchDeepResearchStudentArchiveProjection",
      "research-deep-research-student-archive-projection.current.json",
      "research_deep_research_student_archive_projection_runtime",
    ].join("\n"),
    verifyStructure: [
      "0256-research-deep-research-student-archive-projection-runtime.md",
      "deep-research-student-archive-projection.input.schema.json",
      "deep-research-student-archive-projection.output.schema.json",
      "deep-research-student-archive-projection.input.example.json",
      "deep-research-student-archive-projection.output.example.json",
      "research-deep-research-student-archive-projection-runtime.mjs",
      "research-deep-research-student-archive-projection-runtime.test.mjs",
      "research-deep-research-student-archive-projection-audit.mjs",
      "research-deep-research-student-archive-projection-audit.test.mjs",
    ].join("\n"),
    architectureBoard: "ResearchAgent.deep_research student archive projection runtime 9.6/10; studentArchiveProjectionWritten=true; 9.5/10 student archive projection review runtime",
    sdd: [
      "student archive projection runtime",
      "DeepResearchStudentArchiveProjectionPort.projectReviewedStudentArchiveEntry",
      "studentArchiveProjectionWritten=true",
      "not general-purpose main database integration",
    ].join("\n"),
  };
}
