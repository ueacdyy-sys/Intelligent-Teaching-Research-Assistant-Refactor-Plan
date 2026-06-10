import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorRequestProgressTimeline } from "./student-app-ai-tutor-request-progress-timeline-audit.mjs";

describe("Student App AI Tutor request progress timeline audit", () => {
  it("passes when the Student App request list exposes a safe progress timeline", () => {
    const report = auditStudentAppAITutorRequestProgressTimeline(validInputs(), {
      generatedAt: "2026-06-10T12:10:00.000Z",
      probeP99Ms: 5,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_request_progress_timeline");
    assert.equal(report.runtimeProbes.studentAppAiTutorRequestProgressTimeline.timelineSteps, 4);
    assert.equal(report.safetyInvariants.studentAppInternalFieldExposureAllowed, false);
  });

  it("fails when the domain progress builder is removed", () => {
    const inputs = validInputs();
    inputs.domainProgress = inputs.domainProgress.replaceAll(
      "BuildStudentAppAITutorRequestProgressCard",
      "RemovedStudentAppAITutorRequestProgressCard",
    );

    const report = auditStudentAppAITutorRequestProgressTimeline(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "domain_progress_card_maps_safe_stage_action_timeline").passed, false);
  });

  it("fails when Student App GET falls back to generic request serialization", () => {
    const inputs = validInputs();
    inputs.httpHandler = inputs.httpHandler.replace(
      "toStudentAppAITutorRequestProgressListResponseFromCards(cards, page.PageInfo)",
      "toTutoringAnalysisRequestListResponse(page)",
    );

    const report = auditStudentAppAITutorRequestProgressTimeline(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "student_http_uses_progress_response_not_generic_request").passed, false);
  });

  it("fails when OpenAPI progress schema leaks internal request fields", () => {
    const inputs = validInputs();
    inputs.openapiProgressSchema = inputs.openapiProgressSchema.replace(
      "safeStatusMessage:",
      "requestedByPrincipalId:\n          type: string\n        safeStatusMessage:",
    );

    const report = auditStudentAppAITutorRequestProgressTimeline(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "openapi_documents_safe_progress_contract").passed, false);
  });

  it("fails when hooks omit the 0354 evidence", () => {
    const inputs = validInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = "";
    inputs.architectureBoard = "11.95/10";

    const report = auditStudentAppAITutorRequestProgressTimeline(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0354").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    source0353Report: "reports/student-app-ai-tutor-result-archive-follow-up-lineage-guard.current.json",
    domainProgress: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request_progress_timeline.go",
    domainProgressTest: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request_progress_timeline_test.go",
    httpHandler: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_requests.go",
    httpProgressTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request_progress_test.go",
    httpLegacyListTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_requests_test.go",
    httpPresenter: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
    httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
    openapiMain: "contracts/openapi/teaching-archive.yaml",
    openapiPath: "contracts/openapi/teaching-archive.student-app-ai-tutor-requests.path.yaml",
    openapiProgressSchema: "contracts/openapi/teaching-archive.student-app-ai-tutor-request-progress.schema.yaml",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0354-student-app-ai-tutor-request-progress-timeline.md",
  }).map(([key, relativePath]) => [
    key,
    fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : "",
  ]));
}
