import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorRequestProgressSummaryCount } from "./student-app-ai-tutor-request-progress-summary-count-audit.mjs";

describe("Student App AI Tutor request progress summary count audit", () => {
  it("passes when summary count is a safe PostgreSQL-backed endpoint", () => {
    const report = auditStudentAppAITutorRequestProgressSummaryCount(validInputs(), {
      generatedAt: "2026-06-10T22:00:00.000Z",
      probeP99Ms: 2,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_request_progress_summary_count");
    assert.equal(report.runtimeProbes.studentAppAiTutorRequestProgressSummaryCount.countedSummary.totalCount, 5);
    assert.equal(report.summaryCountPolicy.repositoryOperation, "SELECT status, COUNT(*) GROUP BY status");
    assert.equal(report.safetyInvariants.databaseGroupedCountRequired, true);
  });

  it("fails when the source 0362 evidence is not ready", () => {
    const inputs = validInputs();
    inputs.source0362Report = JSON.stringify({ readiness: "NEEDS_REMEDIATION" });

    const report = auditStudentAppAITutorRequestProgressSummaryCount(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0362_view_filter_ready").passed, false);
  });

  it("fails when the use case reads list rows instead of counts", () => {
    const inputs = validInputs();
    inputs.usecase += "\nListTutoringAnalysisRequests(ctx, query)\n";

    const report = auditStudentAppAITutorRequestProgressSummaryCount(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "domain_usecase_own_summary_count_contract").passed, false);
  });

  it("fails when PostgreSQL aggregation is missing", () => {
    const inputs = validInputs();
    inputs.postgresRepository = inputs.postgresRepository.replaceAll("GROUP BY status", "ORDER BY created_at DESC");

    const report = auditStudentAppAITutorRequestProgressSummaryCount(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "postgres_uses_count_only_grouped_query").passed, false);
  });

  it("fails when the summary endpoint is missing from HTTP or OpenAPI", () => {
    const inputs = validInputs();
    inputs.openapiRoot = inputs.openapiRoot.replaceAll("/v1/student-app/ai-tutor-requests/summary", "/v1/student-app/ai-tutor-requests");

    const report = auditStudentAppAITutorRequestProgressSummaryCount(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "http_openapi_expose_private_count_only_summary").passed, false);
  });

  it("fails when 0363 evidence hooks are missing", () => {
    const inputs = validInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll(
      "studentAppAiTutorRequestProgressSummaryCount",
      "studentAppAiTutorRequestProgressViewFilter",
    );
    inputs.architectureBoard = "12.22/10";

    const report = auditStudentAppAITutorRequestProgressSummaryCount(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0363").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    source0362Report: "reports/student-app-ai-tutor-request-progress-view-filter.current.json",
    domainInput: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_requests.go",
    usecase: "services/teaching-archive-gateway/internal/usecase/read_student_app_ai_tutor_request_progress_summary.go",
    postgresRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go",
    postgresTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis_progress_summary_count_test.go",
    httpHandler: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_requests.go",
    httpRoutes: "services/teaching-archive-gateway/internal/adapter/httpapi/server_routes.go",
    httpPaths: "services/teaching-archive-gateway/internal/adapter/httpapi/server_paths.go",
    serverConfig: "services/teaching-archive-gateway/internal/adapter/httpapi/server_config.go",
    serverWiring: "services/teaching-archive-gateway/internal/adapter/httpapi/server.go",
    responses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
    presenter: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
    progressValidator: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_progress_validator.go",
    httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request_progress_test.go",
    domainTest: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_requests_test.go",
    usecaseTest: "services/teaching-archive-gateway/internal/usecase/read_student_app_ai_tutor_request_progress_summary_test.go",
    openapiRoot: "contracts/openapi/teaching-archive.yaml",
    openapiPath: "contracts/openapi/teaching-archive.student-app-ai-tutor-request-progress-summary.path.yaml",
    openapiSchema: "contracts/openapi/teaching-archive.student-app-ai-tutor-request-progress.schema.yaml",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0363-student-app-ai-tutor-request-progress-summary-count.md",
  }).map(([key, relativePath]) => [
    key,
    fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : "",
  ]));
}
