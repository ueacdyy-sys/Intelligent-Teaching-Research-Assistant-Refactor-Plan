import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditDeepResearchStudentArchiveProjectionReview,
  formatDeepResearchStudentArchiveProjectionReviewAudit,
} from "./research-deep-research-student-archive-projection-review-audit.mjs";

describe("Research deep_research student archive projection review audit", () => {
  it("passes when projection review consumes persistence command and defers durable projection", () => {
    const report = auditDeepResearchStudentArchiveProjectionReview(currentInputs(), {
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW");
    assert.equal(report.runtime.runtimeId, "research_deep_research_student_archive_projection_review_runtime");
    assert.equal(report.runtime.commandPort, "DeepResearchStudentArchiveProjectionReviewPort.recordStudentArchiveProjectionReview");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 300, true);
    assert.equal(report.runtimeProbes.studentArchiveProjectionReview.result.status, "STUDENT_ARCHIVE_PROJECTION_REVIEW_APPROVED_NOT_WRITTEN");
    assert.equal(report.runtimeProbes.studentArchiveProjectionReview.result.boundary.humanProjectionReviewRecorded, true);
    assert.equal(report.runtimeProbes.studentArchiveProjectionReview.result.boundary.studentArchiveProjectionWritten, false);
    assert.equal(report.runtimeProbes.studentArchiveProjectionReview.result.boundary.studentArchiveWriteStarted, false);
    assert.match(formatDeepResearchStudentArchiveProjectionReviewAudit(report), /Research deep_research student archive projection review: READY/u);
  });

  it("fails when runtime claims durable projection, DB writes, model access, tools, Swarm, or unsafe rendering", () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nstudentArchiveProjectionWritten: true\nstudentArchiveWriteStarted: true\nmainDatabaseWriteStarted: true\nexternalModelCallStarted: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = auditDeepResearchStudentArchiveProjectionReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.persistence_consumption_and_safety_boundaries").passed, false);
  });

  it("caps the probe p99 at the async projection review boundary budget", () => {
    const report = auditDeepResearchStudentArchiveProjectionReview(currentInputs(), { probeP99Ms: 350 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 300);
  });

  it("fails when quality, structure, root workflow, SDD, or board hooks omit projection review", () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage
      .replaceAll("researchDeepResearchStudentArchiveProjectionReview", "researchDeepResearchStudentArchiveProjection")
      .replace("research-deep-research-student-archive-projection-review.current.json", "research-deep-research-student-archive-projection.current.json")
      .replace("research_deep_research_student_archive_projection_review_runtime", "research_deep_research_student_archive_projection_runtime");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("research-deep-research-student-archive-projection-review", "research-deep-research-student-archive-projection");
    inputs.sdd = "student archive projection review runtime without required boundary wording";
    inputs.architectureBoard = "ResearchAgent.deep_research student archive persistence command runtime 9.4/10; studentArchiveProjectionWritten=false";

    const report = auditDeepResearchStudentArchiveProjectionReview(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_tracks_runtime").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_projection_review_report").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "structure_tracks_runtime_files").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "sdd.explicitly_defers_durable_projection").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "architecture_board.reflects_projection_review_progress").passed, false);
  });
});

function currentInputs() {
  return {
    inputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-student-archive-projection-review.v1" },
        studentArchivePersistenceRecord: {
          properties: {
            runtimeId: { const: "research_deep_research_student_archive_persistence_runtime" },
            status: { const: "STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED" },
          },
        },
        studentArchiveProjectionReviewPolicy: {
          properties: {
            durableProjectionReviewAllowed: { const: true },
            studentArchiveProjectionWriteAllowed: { const: false },
          },
        },
      },
    }),
    outputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-student-archive-projection-review-recorded.v1" },
        runtimeId: { const: "research_deep_research_student_archive_projection_review_runtime" },
        commandPort: { const: "DeepResearchStudentArchiveProjectionReviewPort.recordStudentArchiveProjectionReview" },
        status: { const: "STUDENT_ARCHIVE_PROJECTION_REVIEW_APPROVED_NOT_WRITTEN" },
        boundary: {
          properties: {
            humanProjectionReviewRecorded: { const: true },
            studentArchiveProjectionWritten: { const: false },
          },
        },
      },
    }),
    inputExample: JSON.stringify({
      studentArchivePersistenceRecord: { status: "STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED" },
      studentArchiveProjectionReviewPolicy: { durableProjectionReviewAllowed: true, studentArchiveProjectionWriteAllowed: false },
    }),
    outputExample: JSON.stringify({
      status: "STUDENT_ARCHIVE_PROJECTION_REVIEW_APPROVED_NOT_WRITTEN",
      studentArchiveProjectionReview: {
        reviewKind: "DURABLE_STUDENT_ARCHIVE_PROJECTION_REVIEW",
        projectionState: "REVIEWED_NOT_PROJECTED_TO_STUDENT_ARCHIVE",
      },
      boundary: { humanProjectionReviewRecorded: true, studentArchiveProjectionWritten: false },
    }),
    runtime: [
      'export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_RUNTIME_ID = "research_deep_research_student_archive_projection_review_runtime";',
      'export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_COMMAND_PORT = "DeepResearchStudentArchiveProjectionReviewPort.recordStudentArchiveProjectionReview";',
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PROJECTION_REVIEW_READY",
      "recordDeepResearchStudentArchiveProjectionReview",
      "STUDENT_ARCHIVE_PROJECTION_REVIEW_APPROVED_NOT_WRITTEN",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "input.studentArchivePersistenceRecord.runtimeId",
      "research_deep_research_student_archive_persistence_runtime",
      "STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED",
      "controlled projection review service principal",
      "STUDENT_ARCHIVE_PROJECTION_REVIEW",
      "HIGH risk",
      "studentArchivePersistenceCommandVerified: true",
      "humanProjectionReviewRecorded: true",
      "approvedForFutureDurableProjection: true",
      "studentArchivePersisted: false",
      "studentArchiveProjectionWritten: false",
      "mainDatabaseWriteStarted: false",
      "studentArchiveWriteStarted: false",
      "externalModelCallStarted: false",
      "swarmAllowed: false",
      "requiresFutureDurableProjectionRuntime: true",
    ].join("\n"),
    runtimeTest: [
      "records a durable projection review without writing the student archive",
      "uses idempotency for safe replay and rejects conflicting projection reviews",
      "rejects non-service principals, missing scopes, unsafe comments, and high-risk commands",
      "rejects missing persistence command, projection writes, DB writes, model access, Swarm, and mismatched scope",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:research-deep-research-student-archive-projection-review": "node tools/research-deep-research-student-archive-projection-review-audit.mjs --out reports/research-deep-research-student-archive-projection-review.current.json",
      },
    }),
    qualityGate: "Research deep_research student archive projection review audit",
    rootWorkflowCoverage: [
      "researchDeepResearchStudentArchiveProjectionReview",
      "research-deep-research-student-archive-projection-review.current.json",
      "research_deep_research_student_archive_projection_review_runtime",
    ].join("\n"),
    verifyStructure: [
      "0255-research-deep-research-student-archive-projection-review-runtime.md",
      "deep-research-student-archive-projection-review.input.schema.json",
      "deep-research-student-archive-projection-review.output.schema.json",
      "deep-research-student-archive-projection-review.input.example.json",
      "deep-research-student-archive-projection-review.output.example.json",
      "research-deep-research-student-archive-projection-review-runtime.mjs",
      "research-deep-research-student-archive-projection-review-runtime.test.mjs",
      "research-deep-research-student-archive-projection-review-audit.mjs",
      "research-deep-research-student-archive-projection-review-audit.test.mjs",
    ].join("\n"),
    architectureBoard: "ResearchAgent.deep_research student archive projection review runtime 9.5/10; studentArchiveProjectionWritten=false; 9.4/10 student archive persistence command runtime",
    sdd: [
      "student archive projection review runtime",
      "DeepResearchStudentArchiveProjectionReviewPort.recordStudentArchiveProjectionReview",
      "This is not final durable student archive projection",
      "studentArchiveProjectionWritten=false",
    ].join("\n"),
  };
}
