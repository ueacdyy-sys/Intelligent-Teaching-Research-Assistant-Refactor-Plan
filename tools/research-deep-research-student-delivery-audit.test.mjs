import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditDeepResearchStudentDelivery,
  formatDeepResearchStudentDeliveryAudit,
} from "./research-deep-research-student-delivery-audit.mjs";

describe("Research deep_research student delivery audit", () => {
  it("passes when student delivery consumes visibility review and defers persistence", () => {
    const report = auditDeepResearchStudentDelivery(currentInputs(), {
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY");
    assert.equal(report.runtime.runtimeId, "research_deep_research_student_delivery_runtime");
    assert.equal(report.runtime.commandPort, "DeepResearchStudentDeliveryPort.recordStudentDeliveryEnvelope");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 300, true);
    assert.equal(report.runtimeProbes.studentDelivery.result.status, "STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED");
    assert.equal(report.runtimeProbes.studentDelivery.result.boundary.studentVisible, true);
    assert.equal(report.runtimeProbes.studentDelivery.result.boundary.studentDeliveryPersisted, false);
    assert.equal(report.runtimeProbes.studentDelivery.result.boundary.studentArchiveWriteStarted, false);
    assert.match(formatDeepResearchStudentDeliveryAudit(report), /Research deep_research student delivery: READY/u);
  });

  it("fails when runtime claims durable persistence, DB writes, model access, tools, Swarm, or unsafe rendering", () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nstudentDeliveryPersisted: true\nstudentArchiveWriteStarted: true\nmainDatabaseWriteStarted: true\nexternalModelCallStarted: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = auditDeepResearchStudentDelivery(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.review_consumption_and_safety_boundaries").passed, false);
  });

  it("caps the probe p99 at the async student delivery boundary budget", () => {
    const report = auditDeepResearchStudentDelivery(currentInputs(), { probeP99Ms: 350 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 300);
  });

  it("fails when quality, structure, root workflow, SDD, or board hooks omit student delivery", () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage
      .replaceAll("researchDeepResearchStudentDelivery", "researchDeepResearchStudentPersistence")
      .replace("research-deep-research-student-delivery.current.json", "research-deep-research-student-persistence.current.json")
      .replace("research_deep_research_student_delivery_runtime", "research_deep_research_student_persistence_runtime");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("research-deep-research-student-delivery", "research-deep-research-student-persistence");
    inputs.sdd = "student delivery runtime without required boundary wording";
    inputs.architectureBoard = "ResearchAgent.deep_research student visibility review runtime 9.2/10; 9.1/10 teacher delivery";

    const report = auditDeepResearchStudentDelivery(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_tracks_runtime").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_student_delivery_report").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "structure_tracks_runtime_files").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "sdd.explicitly_defers_persistence").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "architecture_board.reflects_student_delivery_progress").passed, false);
  });
});

function currentInputs() {
  return {
    inputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-student-delivery.v1" },
        studentVisibilityReviewRecord: {
          properties: {
            runtimeId: { const: "research_deep_research_student_visibility_review_runtime" },
            status: { const: "STUDENT_VISIBILITY_REVIEW_APPROVED_NOT_DELIVERED" },
          },
        },
        studentDeliveryPolicy: {
          properties: {
            studentDeliveryEnvelopeAllowed: { const: true },
            studentArchiveWriteAllowed: { const: false },
          },
        },
      },
    }),
    outputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-student-delivery-recorded.v1" },
        runtimeId: { const: "research_deep_research_student_delivery_runtime" },
        commandPort: { const: "DeepResearchStudentDeliveryPort.recordStudentDeliveryEnvelope" },
        status: { const: "STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED" },
        boundary: {
          properties: {
            studentVisible: { const: true },
            studentDeliveryPersisted: { const: false },
          },
        },
      },
    }),
    inputExample: JSON.stringify({
      studentVisibilityReviewRecord: { status: "STUDENT_VISIBILITY_REVIEW_APPROVED_NOT_DELIVERED" },
      studentDeliveryPolicy: { studentDeliveryEnvelopeAllowed: true, studentArchiveWriteAllowed: false },
    }),
    outputExample: JSON.stringify({
      status: "STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED",
      studentDeliveryEnvelope: { envelopeKind: "EVIDENCE_GROUNDED_STUDENT_DELIVERY_ENVELOPE" },
      boundary: { studentVisible: true, studentDeliveryPersisted: false },
    }),
    runtime: [
      'export const RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_RUNTIME_ID = "research_deep_research_student_delivery_runtime";',
      'export const RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_COMMAND_PORT = "DeepResearchStudentDeliveryPort.recordStudentDeliveryEnvelope";',
      "RESEARCH_DEEP_RESEARCH_STUDENT_DELIVERY_READY",
      "recordDeepResearchStudentDeliveryEnvelope",
      "STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "input.studentVisibilityReviewRecord.runtimeId",
      "research_deep_research_student_visibility_review_runtime",
      "STUDENT_VISIBILITY_REVIEW_APPROVED_NOT_DELIVERED",
      "controlled delivery service principal",
      "STUDENT_DELIVERY_ENVELOPE",
      "STUDENT_APP_DELIVERY",
      "HIGH risk",
      "studentDeliveryEnvelopeCreated: true",
      "studentVisible: true",
      "studentDeliveryStarted: true",
      "studentDeliveryPersisted: false",
      "mainDatabaseWriteStarted: false",
      "studentArchiveWriteStarted: false",
      "externalModelCallStarted: false",
      "swarmAllowed: false",
      "requiresFuturePersistenceReview: true",
    ].join("\n"),
    runtimeTest: [
      "records a student app delivery envelope without durable persistence",
      "uses idempotency for safe replay and rejects conflicting envelopes",
      "rejects non-service principals, missing scopes, unsafe text, and high-risk packages",
      "rejects missing human review, DB writes, persistence, model access, Swarm, and mismatched audience",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:research-deep-research-student-delivery": "node tools/research-deep-research-student-delivery-audit.mjs --out reports/research-deep-research-student-delivery.current.json",
      },
    }),
    qualityGate: "Research deep_research student delivery audit",
    rootWorkflowCoverage: [
      "researchDeepResearchStudentDelivery",
      "research-deep-research-student-delivery.current.json",
      "research_deep_research_student_delivery_runtime",
    ].join("\n"),
    verifyStructure: [
      "0253-research-deep-research-student-delivery-runtime.md",
      "deep-research-student-delivery.input.schema.json",
      "deep-research-student-delivery.output.schema.json",
      "deep-research-student-delivery.input.example.json",
      "deep-research-student-delivery.output.example.json",
      "research-deep-research-student-delivery-runtime.mjs",
      "research-deep-research-student-delivery-runtime.test.mjs",
      "research-deep-research-student-delivery-audit.mjs",
      "research-deep-research-student-delivery-audit.test.mjs",
    ].join("\n"),
    architectureBoard: "ResearchAgent.deep_research student delivery runtime 9.3/10; student delivery envelope; 9.2/10 student visibility review; 9.1/10 teacher delivery",
    sdd: [
      "student delivery runtime",
      "DeepResearchStudentDeliveryPort.recordStudentDeliveryEnvelope",
      "This is not durable student archive persistence",
      "studentDeliveryPersisted=false",
    ].join("\n"),
  };
}
