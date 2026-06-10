import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorRequestProgressRefreshPolicy } from "./student-app-ai-tutor-request-progress-refresh-policy-audit.mjs";

describe("Student App AI Tutor request progress refresh policy audit", () => {
  it("passes when Student App progress cards include bounded refresh policy", () => {
    const report = auditStudentAppAITutorRequestProgressRefreshPolicy(validInputs(), {
      generatedAt: "2026-06-10T16:10:00.000Z",
      probeP99Ms: 5,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_request_progress_refresh_policy");
    assert.equal(report.runtimeProbes.studentAppAiTutorRequestProgressRefreshPolicy.queuedRefreshAfterMs, 8000);
    assert.equal(report.runtimeProbes.studentAppAiTutorRequestProgressRefreshPolicy.terminalAutoRefresh, false);
    assert.equal(report.safetyInvariants.writePathChanged, false);
  });

  it("fails when the source 0357 evidence is not ready", () => {
    const inputs = validInputs();
    inputs.source0357Report = JSON.stringify({ readiness: "NEEDS_REMEDIATION" });

    const report = auditStudentAppAITutorRequestProgressRefreshPolicy(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0357_target_url_ready").passed, false);
  });

  it("fails when the domain omits bounded refresh policy values", () => {
    const inputs = validInputs();
    inputs.domainProgress = inputs.domainProgress.replace("RefreshAfterMs: 8000", "RefreshAfterMs: 1000");

    const report = auditStudentAppAITutorRequestProgressRefreshPolicy(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "domain_builds_bounded_refresh_policy").passed, false);
  });

  it("fails when HTTP or OpenAPI omit refreshPolicy", () => {
    const inputs = validInputs();
    inputs.httpResponses = inputs.httpResponses.replaceAll("RefreshPolicy", "PollingPolicy");
    inputs.openapiSchema = inputs.openapiSchema.replaceAll("refreshPolicy", "pollingPolicy");

    const report = auditStudentAppAITutorRequestProgressRefreshPolicy(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "http_and_openapi_expose_safe_refresh_policy").passed, false);
  });

  it("fails when the 0358 evidence hooks are missing", () => {
    const inputs = validInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("studentAppAiTutorRequestProgressRefreshPolicy", "studentAppAiTutorRequestProgressTargetURL");
    inputs.architectureBoard = "12.07/10";

    const report = auditStudentAppAITutorRequestProgressRefreshPolicy(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0358").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    source0357Report: "reports/student-app-ai-tutor-request-progress-target-url.current.json",
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
    sdd: "docs/sdd/0358-student-app-ai-tutor-request-progress-refresh-policy.md",
  }).map(([key, relativePath]) => [
    key,
    fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : "",
  ]));
}
