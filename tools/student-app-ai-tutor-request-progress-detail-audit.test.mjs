import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorRequestProgressDetail } from "./student-app-ai-tutor-request-progress-detail-audit.mjs";

describe("Student App AI Tutor request progress detail audit", () => {
  it("passes when Student App can read one safe request progress detail", () => {
    const report = auditStudentAppAITutorRequestProgressDetail(validInputs(), {
      generatedAt: "2026-06-10T13:30:00.000Z",
      probeP99Ms: 5,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_request_progress_detail");
    assert.equal(report.runtimeProbes.studentAppAiTutorRequestProgressDetail.crossStudentStatus, 404);
    assert.equal(report.safetyInvariants.studentAppInternalFieldExposureAllowed, false);
  });

  it("fails when detail domain scoping is removed", () => {
    const inputs = validInputs();
    inputs.domainInput = inputs.domainInput.replace("query.ID = requestID", "query.Status = TutoringAnalysisStatusQueued");

    const report = auditStudentAppAITutorRequestProgressDetail(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "domain_scopes_detail_query_before_repository").passed, false);
  });

  it("fails when the detail use case returns raw request evidence instead of a progress card", () => {
    const inputs = validInputs();
    inputs.usecase = inputs.usecase.replaceAll(
      "BuildStudentAppAITutorRequestProgressCard",
      "toTutoringAnalysisRequestResponse",
    );

    const report = auditStudentAppAITutorRequestProgressDetail(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "usecase_reads_safe_progress_card_not_raw_request").passed, false);
  });

  it("fails when OpenAPI or hooks omit the 0355 detail evidence", () => {
    const inputs = validInputs();
    inputs.openapiMain = inputs.openapiMain.replace("/v1/student-app/ai-tutor-requests/{requestId}", "/v1/student-app/ai-tutor-requests");
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.architectureBoard = "11.98/10";

    const report = auditStudentAppAITutorRequestProgressDetail(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "openapi_documents_single_detail_contract").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0355").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    source0354Report: "reports/student-app-ai-tutor-request-progress-timeline.current.json",
    domainInput: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_requests.go",
    domainInputTest: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_requests_test.go",
    domainQuery: "services/teaching-archive-gateway/internal/domain/tutoring_analysis_query.go",
    usecase: "services/teaching-archive-gateway/internal/usecase/read_student_app_ai_tutor_request_progress.go",
    usecaseTest: "services/teaching-archive-gateway/internal/usecase/read_student_app_ai_tutor_request_progress_test.go",
    postgresRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go",
    httpRoutes: "services/teaching-archive-gateway/internal/adapter/httpapi/server_routes.go",
    httpPaths: "services/teaching-archive-gateway/internal/adapter/httpapi/server_paths.go",
    httpHandler: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_requests.go",
    httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request_progress_test.go",
    httpPresenter: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
    httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
    openapiMain: "contracts/openapi/teaching-archive.yaml",
    openapiPath: "contracts/openapi/teaching-archive.student-app-ai-tutor-request.path.yaml",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0355-student-app-ai-tutor-request-progress-detail.md",
  }).map(([key, relativePath]) => [
    key,
    fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : "",
  ]));
}
