import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditDeepResearchStudentVisibilityReview,
  formatDeepResearchStudentVisibilityReviewAudit,
} from "./research-deep-research-student-visibility-review-audit.mjs";

describe("Research deep_research student visibility review audit", () => {
  it("passes when student visibility review consumes teacher delivery and remains undelivered", () => {
    const report = auditDeepResearchStudentVisibilityReview(currentInputs(), {
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW");
    assert.equal(report.runtime.runtimeId, "research_deep_research_student_visibility_review_runtime");
    assert.equal(report.runtime.commandPort, "DeepResearchStudentVisibilityReviewPort.recordStudentVisibilityReview");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 300, true);
    assert.equal(report.runtimeProbes.studentVisibilityReview.result.status, "STUDENT_VISIBILITY_REVIEW_APPROVED_NOT_DELIVERED");
    assert.equal(report.runtimeProbes.studentVisibilityReview.result.boundary.studentVisible, false);
    assert.equal(report.runtimeProbes.studentVisibilityReview.result.boundary.studentDeliveryStarted, false);
    assert.match(formatDeepResearchStudentVisibilityReviewAudit(report), /Research deep_research student visibility review: READY/u);
  });

  it("fails when runtime claims student delivery, writes, model access, tools, or unsafe rendering", () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nstudentVisible: true\nstudentDeliveryStarted: true\nstudentArchiveWriteStarted: true\ninnerHTML\n`;

    const report = auditDeepResearchStudentVisibilityReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.teacher_delivery_review_and_safety_boundaries").passed, false);
  });

  it("caps the probe p99 at the async student visibility review boundary budget", () => {
    const report = auditDeepResearchStudentVisibilityReview(currentInputs(), { probeP99Ms: 350 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 300);
  });

  it("fails when quality, structure, root workflow, SDD, or board hooks omit student visibility review", () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage
      .replaceAll("researchDeepResearchStudentVisibilityReview", "researchDeepResearchStudentDelivery")
      .replace("research-deep-research-student-visibility-review.current.json", "research-deep-research-student-delivery.current.json")
      .replace("research_deep_research_student_visibility_review_runtime", "research_deep_research_student_delivery_runtime");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("research-deep-research-student-visibility-review", "research-deep-research-student-delivery");
    inputs.sdd = "student visibility review runtime without required boundary wording";
    inputs.architectureBoard = "ResearchAgent.deep_research teacher delivery runtime 9.1/10; 9.0/10 publication precheck";

    const report = auditDeepResearchStudentVisibilityReview(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_tracks_runtime").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_student_visibility_review_report").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "structure_tracks_runtime_files").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "sdd.explicitly_defers_student_delivery").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "architecture_board.reflects_student_visibility_review_progress").passed, false);
  });
});

function currentInputs() {
  return {
    inputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-student-visibility-review.v1" },
        teacherDeliveryRecord: {
          properties: {
            runtimeId: { const: "research_deep_research_teacher_delivery_runtime" },
            status: { const: "TEACHER_DELIVERY_PACKAGE_READY_NOT_STUDENT_VISIBLE" },
          },
        },
        studentVisibilityPolicy: { properties: { studentVisibleDeliveryAllowed: { const: false } } },
      },
    }),
    outputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-student-visibility-review-recorded.v1" },
        runtimeId: { const: "research_deep_research_student_visibility_review_runtime" },
        commandPort: { const: "DeepResearchStudentVisibilityReviewPort.recordStudentVisibilityReview" },
        boundary: { properties: { requiresFutureStudentDeliveryRuntime: { const: true } } },
      },
    }),
    inputExample: JSON.stringify({
      teacherDeliveryRecord: { status: "TEACHER_DELIVERY_PACKAGE_READY_NOT_STUDENT_VISIBLE" },
      studentVisibilityPolicy: { studentVisibleDeliveryAllowed: false },
    }),
    outputExample: JSON.stringify({
      status: "STUDENT_VISIBILITY_REVIEW_APPROVED_NOT_DELIVERED",
      boundary: { humanStudentVisibilityReviewRecorded: true, studentVisible: false },
    }),
    runtime: [
      'export const RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_RUNTIME_ID = "research_deep_research_student_visibility_review_runtime";',
      'export const RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_COMMAND_PORT = "DeepResearchStudentVisibilityReviewPort.recordStudentVisibilityReview";',
      "RESEARCH_DEEP_RESEARCH_STUDENT_VISIBILITY_REVIEW_READY",
      "recordDeepResearchStudentVisibilityReview",
      "STUDENT_VISIBILITY_REVIEW_APPROVED_NOT_DELIVERED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "input.teacherDeliveryRecord.runtimeId",
      "research_deep_research_teacher_delivery_runtime",
      "TEACHER_DELIVERY_PACKAGE_READY_NOT_STUDENT_VISIBLE",
      "student visibility review requires a human teacher or admin",
      "STUDENT_VISIBILITY_REVIEW",
      "requireSafeText",
      "HIGH risk",
      "teacherDeliveryVerified: true",
      "humanStudentVisibilityReviewRecorded: true",
      "studentVisibilityApprovedForFutureDelivery: true",
      "studentVisible: false",
      "studentDeliveryStarted: false",
      "requiresFutureStudentDeliveryRuntime: true",
      "requiresFuturePersistenceReview: true",
    ].join("\n"),
    runtimeTest: [
      "records a human student visibility review without delivering to students",
      "uses idempotency for safe replay and rejects conflicting reviews",
      "rejects students, services, unsafe text, revision decisions, and high-risk packages",
      "rejects direct student visibility, DB writes, delivery starts, and mismatched package reviews",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:research-deep-research-student-visibility-review": "node tools/research-deep-research-student-visibility-review-audit.mjs --out reports/research-deep-research-student-visibility-review.current.json",
      },
    }),
    qualityGate: "Research deep_research student visibility review audit",
    rootWorkflowCoverage: [
      "researchDeepResearchStudentVisibilityReview",
      "research-deep-research-student-visibility-review.current.json",
      "research_deep_research_student_visibility_review_runtime",
    ].join("\n"),
    verifyStructure: [
      "0252-research-deep-research-student-visibility-review-runtime.md",
      "deep-research-student-visibility-review.input.schema.json",
      "deep-research-student-visibility-review.output.schema.json",
      "deep-research-student-visibility-review.input.example.json",
      "deep-research-student-visibility-review.output.example.json",
      "research-deep-research-student-visibility-review-runtime.mjs",
      "research-deep-research-student-visibility-review-runtime.test.mjs",
      "research-deep-research-student-visibility-review-audit.mjs",
      "research-deep-research-student-visibility-review-audit.test.mjs",
    ].join("\n"),
    architectureBoard: "ResearchAgent.deep_research student visibility review runtime 9.2/10; 9.1/10 teacher delivery; 9.0/10 publication precheck",
    sdd: [
      "student visibility review runtime",
      "DeepResearchStudentVisibilityReviewPort.recordStudentVisibilityReview",
      "This is not student delivery",
      "requiresFutureStudentDeliveryRuntime=true",
    ].join("\n"),
  };
}
