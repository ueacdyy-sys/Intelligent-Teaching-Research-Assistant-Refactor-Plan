import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorRequestProgressTargetURL } from "./student-app-ai-tutor-request-progress-target-url-audit.mjs";

describe("Student App AI Tutor request progress target URL audit", () => {
  it("passes when Student App progress actions include safe direct target URLs", () => {
    const report = auditStudentAppAITutorRequestProgressTargetURL(validInputs(), {
      generatedAt: "2026-06-10T15:10:00.000Z",
      probeP99Ms: 5,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_request_progress_target_url");
    assert.equal(report.runtimeProbes.studentAppAiTutorRequestProgressTargetURL.waitingTargetURLPresent, false);
    assert.equal(report.safetyInvariants.writePathChanged, false);
  });

  it("fails when questionBankDraftRef is no longer encoded by the domain", () => {
    const inputs = validInputs();
    inputs.domainProgress = inputs.domainProgress.replace("url.QueryEscape(draftRef)", "draftRef");

    const report = auditStudentAppAITutorRequestProgressTargetURL(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "domain_builds_encoded_target_url").passed, false);
  });

  it("fails when HTTP or OpenAPI omit targetUrl", () => {
    const inputs = validInputs();
    inputs.httpResponses = inputs.httpResponses.replaceAll("TargetURL", "TargetPath");
    inputs.openapiSchema = inputs.openapiSchema.replaceAll("targetUrl", "targetPath");

    const report = auditStudentAppAITutorRequestProgressTargetURL(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "http_and_openapi_expose_constrained_target_url").passed, false);
  });

  it("fails when the 0357 evidence hooks are missing", () => {
    const inputs = validInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("studentAppAiTutorRequestProgressTargetURL", "studentAppAiTutorRequestProgressPrimaryAction");
    inputs.architectureBoard = "12.04/10";

    const report = auditStudentAppAITutorRequestProgressTargetURL(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0357").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    source0356Report: "reports/student-app-ai-tutor-request-progress-primary-action.current.json",
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
    sdd: "docs/sdd/0357-student-app-ai-tutor-request-progress-target-url.md",
  }).map(([key, relativePath]) => [
    key,
    fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : "",
  ]));
}
