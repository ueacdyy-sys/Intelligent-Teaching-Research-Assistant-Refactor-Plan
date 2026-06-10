import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorRequestProgressViewFilter } from "./student-app-ai-tutor-request-progress-view-filter-audit.mjs";

describe("Student App AI Tutor request progress view filter audit", () => {
  it("passes when progressView is a safe SQL-backed list filter", () => {
    const report = auditStudentAppAITutorRequestProgressViewFilter(validInputs(), {
      generatedAt: "2026-06-10T21:00:00.000Z",
      probeP99Ms: 3,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_request_progress_view_filter");
    assert.equal(report.runtimeProbes.studentAppAiTutorRequestProgressViewFilter.filteredCounts.totalCount, 2);
    assert.deepEqual(report.progressViewPolicy.statusMapping.AUTO_REFRESH, ["QUEUED", "IN_PROGRESS"]);
    assert.equal(report.safetyInvariants.repositoryStatusPredicateRequired, true);
  });

  it("fails when the source 0361 evidence is not ready", () => {
    const inputs = validInputs();
    inputs.source0361Report = JSON.stringify({ readiness: "NEEDS_REMEDIATION" });

    const report = auditStudentAppAITutorRequestProgressViewFilter(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0361_summary_ready").passed, false);
  });

  it("fails when progressView mapping is missing from the domain", () => {
    const inputs = validInputs();
    inputs.domainInput = inputs.domainInput.replaceAll("StudentAppAITutorRequestProgressViewAutoRefresh", "StudentAppAITutorRequestProgressViewMissing");

    const report = auditStudentAppAITutorRequestProgressViewFilter(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "domain_maps_progress_view_to_safe_statuses").passed, false);
  });

  it("fails when repository filtering is not pushed into SQL", () => {
    const inputs = validInputs();
    inputs.postgresRepository = inputs.postgresRepository.replaceAll("status = ANY(", "status = ");

    const report = auditStudentAppAITutorRequestProgressViewFilter(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "repository_pushes_view_filter_to_sql").passed, false);
  });

  it("fails when HTTP/OpenAPI does not expose progressView", () => {
    const inputs = validInputs();
    inputs.openapiPath = inputs.openapiPath.replaceAll("progressView", "progressMode");

    const report = auditStudentAppAITutorRequestProgressViewFilter(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "http_openapi_expose_additive_progress_view_filter").passed, false);
  });

  it("fails when 0362 evidence hooks are missing", () => {
    const inputs = validInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll(
      "studentAppAiTutorRequestProgressViewFilter",
      "studentAppAiTutorRequestProgressSummary",
    );
    inputs.architectureBoard = "12.19/10";

    const report = auditStudentAppAITutorRequestProgressViewFilter(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0362").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    source0361Report: "reports/student-app-ai-tutor-request-progress-summary.current.json",
    domainInput: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_requests.go",
    queryDomain: "services/teaching-archive-gateway/internal/domain/tutoring_analysis_query.go",
    usecase: "services/teaching-archive-gateway/internal/usecase/list_student_app_ai_tutor_requests.go",
    postgresRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go",
    httpHandler: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_requests.go",
    domainTest: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_requests_test.go",
    usecaseTest: "services/teaching-archive-gateway/internal/usecase/list_student_app_ai_tutor_requests_test.go",
    postgresTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_test.go",
    postgresProgressViewTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis_progress_view_filter_test.go",
    httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request_progress_test.go",
    openapiPath: "contracts/openapi/teaching-archive.student-app-ai-tutor-requests.path.yaml",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0362-student-app-ai-tutor-request-progress-view-filter.md",
  }).map(([key, relativePath]) => [
    key,
    fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : "",
  ]));
}
