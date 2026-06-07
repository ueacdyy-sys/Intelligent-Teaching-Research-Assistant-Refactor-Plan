import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditDeepResearchTeacherDelivery,
  formatDeepResearchTeacherDeliveryAudit,
} from "./research-deep-research-teacher-delivery-audit.mjs";

describe("Research deep_research teacher delivery audit", () => {
  it("passes when teacher delivery consumes approved precheck and remains student-invisible", () => {
    const report = auditDeepResearchTeacherDelivery(currentInputs(), {
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY");
    assert.equal(report.runtime.runtimeId, "research_deep_research_teacher_delivery_runtime");
    assert.equal(report.runtime.commandPort, "DeepResearchTeacherDeliveryPort.recordTeacherDeliveryPackage");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 300, true);
    assert.equal(report.runtimeProbes.teacherDelivery.result.status, "TEACHER_DELIVERY_PACKAGE_READY_NOT_STUDENT_VISIBLE");
    assert.equal(report.runtimeProbes.teacherDelivery.result.boundary.teacherAccessible, true);
    assert.equal(report.runtimeProbes.teacherDelivery.result.boundary.studentVisible, false);
    assert.match(formatDeepResearchTeacherDeliveryAudit(report), /Research deep_research teacher delivery: READY/u);
  });

  it("fails when runtime claims student delivery, publication, writes, model access, or unsafe rendering", () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nstudentVisible: true\nmainDatabaseWriteStarted: true\ninnerHTML\n`;

    const report = auditDeepResearchTeacherDelivery(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.precheck_preview_and_safety_boundaries").passed, false);
  });

  it("caps the probe p99 at the async teacher delivery boundary budget", () => {
    const report = auditDeepResearchTeacherDelivery(currentInputs(), { probeP99Ms: 350 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 300);
  });

  it("fails when quality, structure, root workflow, SDD, or board hooks omit teacher delivery", () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage
      .replaceAll("researchDeepResearchTeacherDelivery", "researchDeepResearchStudentDelivery")
      .replace("research-deep-research-teacher-delivery.current.json", "research-deep-research-student-delivery.current.json")
      .replace("research_deep_research_teacher_delivery_runtime", "research_deep_research_student_delivery_runtime");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("research-deep-research-teacher-delivery", "research-deep-research-student-delivery");
    inputs.sdd = "teacher delivery runtime without required boundary wording";
    inputs.architectureBoard = "ResearchAgent.deep_research publication precheck runtime 9.0/10";

    const report = auditDeepResearchTeacherDelivery(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_tracks_runtime").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_teacher_delivery_report").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "structure_tracks_runtime_files").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "sdd.explicitly_defers_student_delivery").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "architecture_board.reflects_teacher_delivery_progress").passed, false);
  });
});

function currentInputs() {
  return {
    inputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-teacher-delivery.v1" },
        publicationPrecheckRecord: {
          properties: {
            runtimeId: { const: "research_deep_research_publication_precheck_runtime" },
            status: { const: "PUBLICATION_PRECHECK_APPROVED_NOT_DELIVERED" },
          },
        },
        deliveryPolicy: { properties: { studentVisibleDeliveryAllowed: { const: false } } },
      },
    }),
    outputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-teacher-delivery-recorded.v1" },
        runtimeId: { const: "research_deep_research_teacher_delivery_runtime" },
        commandPort: { const: "DeepResearchTeacherDeliveryPort.recordTeacherDeliveryPackage" },
        boundary: { properties: { requiresFutureStudentDeliveryReview: { const: true } } },
      },
    }),
    inputExample: JSON.stringify({
      publicationPrecheckRecord: { status: "PUBLICATION_PRECHECK_APPROVED_NOT_DELIVERED" },
      deliveryPolicy: { studentVisibleDeliveryAllowed: false },
    }),
    outputExample: JSON.stringify({
      status: "TEACHER_DELIVERY_PACKAGE_READY_NOT_STUDENT_VISIBLE",
      boundary: { teacherAccessible: true, studentVisible: false },
    }),
    runtime: [
      'export const RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_RUNTIME_ID = "research_deep_research_teacher_delivery_runtime";',
      'export const RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_COMMAND_PORT = "DeepResearchTeacherDeliveryPort.recordTeacherDeliveryPackage";',
      "RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_READY",
      "recordDeepResearchTeacherDelivery",
      "TEACHER_DELIVERY_PACKAGE_READY_NOT_STUDENT_VISIBLE",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "input.publicationPrecheckRecord.runtimeId",
      "research_deep_research_publication_precheck_runtime",
      "PUBLICATION_PRECHECK_APPROVED_NOT_DELIVERED",
      "input.renderPreviewRecord.runtimeId",
      "research_deep_research_render_preview_runtime",
      "teacher delivery requires a human research teacher or admin",
      "teacherAccessible: true",
      "studentVisible: false",
      "mainDatabaseWriteStarted: false",
      "requiresFutureStudentDeliveryReview: true",
      "requiresFuturePersistenceReview: true",
      "HIGH risk",
    ].join("\n"),
    runtimeTest: [
      "records a teacher-only delivery package without publishing to students",
      "uses idempotency for safe replay and rejects conflicting delivery packages",
      "rejects unapproved precheck records, unsafe text, students, and service principals",
      "rejects student delivery policy, direct publication, DB writes, and mismatched previews",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:research-deep-research-teacher-delivery": "node tools/research-deep-research-teacher-delivery-audit.mjs --out reports/research-deep-research-teacher-delivery.current.json",
      },
    }),
    qualityGate: "Research deep_research teacher delivery audit",
    rootWorkflowCoverage: [
      "researchDeepResearchTeacherDelivery",
      "research-deep-research-teacher-delivery.current.json",
      "research_deep_research_teacher_delivery_runtime",
    ].join("\n"),
    verifyStructure: [
      "0251-research-deep-research-teacher-delivery-runtime.md",
      "deep-research-teacher-delivery.input.schema.json",
      "deep-research-teacher-delivery.output.schema.json",
      "deep-research-teacher-delivery.input.example.json",
      "deep-research-teacher-delivery.output.example.json",
      "research-deep-research-teacher-delivery-runtime.mjs",
      "research-deep-research-teacher-delivery-runtime.test.mjs",
      "research-deep-research-teacher-delivery-audit.mjs",
      "research-deep-research-teacher-delivery-audit.test.mjs",
    ].join("\n"),
    architectureBoard: "ResearchAgent.deep_research teacher delivery runtime 9.1/10; 9.0/10 publication precheck; 8.9/10 render preview",
    sdd: [
      "teacher delivery runtime",
      "DeepResearchTeacherDeliveryPort.recordTeacherDeliveryPackage",
      "This is not student delivery",
      "requiresFutureStudentDeliveryReview=true",
    ].join("\n"),
  };
}
