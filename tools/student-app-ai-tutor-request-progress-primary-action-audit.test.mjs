import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorRequestProgressPrimaryAction } from "./student-app-ai-tutor-request-progress-primary-action-audit.mjs";

describe("Student App AI Tutor request progress primary action audit", () => {
  it("passes when Student App progress responses expose safe primary actions", () => {
    const report = auditStudentAppAITutorRequestProgressPrimaryAction(validInputs(), {
      generatedAt: "2026-06-10T14:20:00.000Z",
      probeP99Ms: 5,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_request_progress_primary_action");
    assert.equal(report.runtimeProbes.studentAppAiTutorRequestProgressPrimaryAction.waitingEndpointPresent, false);
    assert.equal(report.safetyInvariants.writePathChanged, false);
  });

  it("fails when the domain primary action builder is removed", () => {
    const inputs = validInputs();
    inputs.domainProgress = inputs.domainProgress.replaceAll(
      "buildStudentAppAITutorRequestProgressPrimaryAction",
      "buildStudentAppAITutorRequestProgressLabel",
    );

    const report = auditStudentAppAITutorRequestProgressPrimaryAction(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "domain_builds_server_driven_primary_action").passed, false);
  });

  it("fails when HTTP or OpenAPI omit primaryAction", () => {
    const inputs = validInputs();
    inputs.httpResponses = inputs.httpResponses.replaceAll("PrimaryAction", "PrimaryLabel");
    inputs.openapiSchema = inputs.openapiSchema.replaceAll("primaryAction", "primaryLabel");

    const report = auditStudentAppAITutorRequestProgressPrimaryAction(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "http_and_openapi_expose_safe_primary_action").passed, false);
  });

  it("fails when the 0356 evidence hooks are missing", () => {
    const inputs = validInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("studentAppAiTutorRequestProgressPrimaryAction", "studentAppAiTutorRequestProgressDetail");
    inputs.architectureBoard = "12.01/10";

    const report = auditStudentAppAITutorRequestProgressPrimaryAction(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0356").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    source0355Report: "reports/student-app-ai-tutor-request-progress-detail.current.json",
    domainProgress: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request_progress_timeline.go",
    domainProgressTest: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request_progress_timeline_test.go",
    httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
    httpPresenter: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
    httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request_progress_test.go",
    openapiSchema: "contracts/openapi/teaching-archive.student-app-ai-tutor-request-progress.schema.yaml",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0356-student-app-ai-tutor-request-progress-primary-action.md",
  }).map(([key, relativePath]) => [
    key,
    fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : "",
  ]));
}
