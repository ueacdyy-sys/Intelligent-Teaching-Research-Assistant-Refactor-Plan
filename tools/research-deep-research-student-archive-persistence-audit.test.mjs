import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditDeepResearchStudentArchivePersistence,
  formatDeepResearchStudentArchivePersistenceAudit,
} from "./research-deep-research-student-archive-persistence-audit.mjs";

describe("Research deep_research student archive persistence command audit", () => {
  it("passes when student archive persistence consumes delivery and defers projection", () => {
    const report = auditDeepResearchStudentArchivePersistence(currentInputs(), {
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_COMMAND");
    assert.equal(report.runtime.runtimeId, "research_deep_research_student_archive_persistence_runtime");
    assert.equal(report.runtime.commandPort, "DeepResearchStudentArchivePersistencePort.recordStudentArchivePersistenceCommand");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 300, true);
    assert.equal(report.runtimeProbes.studentArchivePersistence.result.status, "STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED");
    assert.equal(report.runtimeProbes.studentArchivePersistence.result.boundary.studentArchivePersistenceCommandRecorded, true);
    assert.equal(report.runtimeProbes.studentArchivePersistence.result.boundary.studentArchiveProjectionWritten, false);
    assert.equal(report.runtimeProbes.studentArchivePersistence.result.boundary.studentArchiveWriteStarted, false);
    assert.match(formatDeepResearchStudentArchivePersistenceAudit(report), /Research deep_research student archive persistence: READY/u);
  });

  it("fails when runtime claims durable projection, DB writes, model access, tools, Swarm, or unsafe rendering", () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nstudentArchiveProjectionWritten: true\nstudentArchiveWriteStarted: true\nmainDatabaseWriteStarted: true\nexternalModelCallStarted: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = auditDeepResearchStudentArchivePersistence(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.delivery_consumption_and_safety_boundaries").passed, false);
  });

  it("caps the probe p99 at the async persistence command boundary budget", () => {
    const report = auditDeepResearchStudentArchivePersistence(currentInputs(), { probeP99Ms: 350 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 300);
  });

  it("fails when quality, structure, root workflow, SDD, or board hooks omit archive persistence", () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage
      .replaceAll("researchDeepResearchStudentArchivePersistence", "researchDeepResearchStudentArchiveProjection")
      .replace("research-deep-research-student-archive-persistence.current.json", "research-deep-research-student-archive-projection.current.json")
      .replace("research_deep_research_student_archive_persistence_runtime", "research_deep_research_student_archive_projection_runtime");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("research-deep-research-student-archive-persistence", "research-deep-research-student-archive-projection");
    inputs.sdd = "student archive persistence command runtime without required boundary wording";
    inputs.architectureBoard = "ResearchAgent.deep_research student delivery runtime 9.3/10; 9.2/10 student visibility review";

    const report = auditDeepResearchStudentArchivePersistence(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_tracks_runtime").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_persistence_command_report").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "structure_tracks_runtime_files").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "sdd.explicitly_defers_projection").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "architecture_board.reflects_persistence_progress").passed, false);
  });
});

function currentInputs() {
  return {
    inputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-student-archive-persistence.v1" },
        studentDeliveryRecord: {
          properties: {
            runtimeId: { const: "research_deep_research_student_delivery_runtime" },
            status: { const: "STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED" },
          },
        },
        studentArchivePersistencePolicy: {
          properties: {
            studentArchivePersistenceCommandAllowed: { const: true },
            studentArchiveProjectionWriteAllowed: { const: false },
          },
        },
      },
    }),
    outputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-student-archive-persistence-recorded.v1" },
        runtimeId: { const: "research_deep_research_student_archive_persistence_runtime" },
        commandPort: { const: "DeepResearchStudentArchivePersistencePort.recordStudentArchivePersistenceCommand" },
        status: { const: "STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED" },
        boundary: {
          properties: {
            studentArchivePersistenceCommandRecorded: { const: true },
            studentArchiveProjectionWritten: { const: false },
          },
        },
      },
    }),
    inputExample: JSON.stringify({
      studentDeliveryRecord: { status: "STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED" },
      studentArchivePersistencePolicy: { studentArchivePersistenceCommandAllowed: true, studentArchiveProjectionWriteAllowed: false },
    }),
    outputExample: JSON.stringify({
      status: "STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED",
      studentArchivePersistenceCommand: { commandKind: "EVIDENCE_GROUNDED_STUDENT_ARCHIVE_PERSISTENCE_COMMAND" },
      boundary: { studentArchivePersistenceCommandRecorded: true, studentArchiveProjectionWritten: false },
    }),
    runtime: [
      'export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_RUNTIME_ID = "research_deep_research_student_archive_persistence_runtime";',
      'export const RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PORT = "DeepResearchStudentArchivePersistencePort.recordStudentArchivePersistenceCommand";',
      "RESEARCH_DEEP_RESEARCH_STUDENT_ARCHIVE_PERSISTENCE_READY",
      "recordDeepResearchStudentArchivePersistenceCommand",
      "STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_PROJECTED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "input.studentDeliveryRecord.runtimeId",
      "research_deep_research_student_delivery_runtime",
      "STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED",
      "controlled persistence service principal",
      "STUDENT_ARCHIVE_PERSISTENCE",
      "HIGH risk",
      "studentArchivePersistenceCommandRecorded: true",
      "appendOnlyCommandLogRecorded: true",
      "studentArchivePersisted: false",
      "studentArchiveProjectionWritten: false",
      "mainDatabaseWriteStarted: false",
      "studentArchiveWriteStarted: false",
      "externalModelCallStarted: false",
      "swarmAllowed: false",
      "requiresFutureDurableProjectionReview: true",
    ].join("\n"),
    runtimeTest: [
      "records an append-only student archive persistence command without projection",
      "uses idempotency for safe replay and rejects conflicting commands",
      "rejects non-service principals, missing scopes, unsafe text, and high-risk envelopes",
      "rejects missing delivery, projection writes, DB writes, model access, Swarm, and mismatched scope",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:research-deep-research-student-archive-persistence": "node tools/research-deep-research-student-archive-persistence-audit.mjs --out reports/research-deep-research-student-archive-persistence.current.json",
      },
    }),
    qualityGate: "Research deep_research student archive persistence audit",
    rootWorkflowCoverage: [
      "researchDeepResearchStudentArchivePersistence",
      "research-deep-research-student-archive-persistence.current.json",
      "research_deep_research_student_archive_persistence_runtime",
    ].join("\n"),
    verifyStructure: [
      "0254-research-deep-research-student-archive-persistence-runtime.md",
      "deep-research-student-archive-persistence.input.schema.json",
      "deep-research-student-archive-persistence.output.schema.json",
      "deep-research-student-archive-persistence.input.example.json",
      "deep-research-student-archive-persistence.output.example.json",
      "research-deep-research-student-archive-persistence-runtime.mjs",
      "research-deep-research-student-archive-persistence-runtime.test.mjs",
      "research-deep-research-student-archive-persistence-audit.mjs",
      "research-deep-research-student-archive-persistence-audit.test.mjs",
    ].join("\n"),
    architectureBoard: "ResearchAgent.deep_research student archive persistence command runtime 9.4/10; studentArchiveProjectionWritten=false; 9.3/10 student delivery; 9.2/10 student visibility review",
    sdd: [
      "student archive persistence command runtime",
      "DeepResearchStudentArchivePersistencePort.recordStudentArchivePersistenceCommand",
      "This is not durable student archive projection",
      "studentArchiveProjectionWritten=false",
    ].join("\n"),
  };
}
