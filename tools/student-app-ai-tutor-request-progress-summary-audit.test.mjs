import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorRequestProgressSummary } from "./student-app-ai-tutor-request-progress-summary-audit.mjs";

describe("Student App AI Tutor request progress summary audit", () => {
  it("passes when the list response exposes safe summary counts", () => {
    const report = auditStudentAppAITutorRequestProgressSummary(validInputs(), {
      generatedAt: "2026-06-10T20:10:00.000Z",
      probeP99Ms: 3,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_request_progress_summary");
    assert.equal(report.runtimeProbes.studentAppAiTutorRequestProgressSummary.computedCounts.totalCount, 5);
    assert.equal(report.safetyInvariants.summaryDerivedFromSafeProgressCardsOnly, true);
    assert.equal(report.safetyInvariants.rawRequestInternalsAllowed, false);
  });

  it("fails when the source 0360 evidence is not ready", () => {
    const inputs = validInputs();
    inputs.source0360Report = JSON.stringify({ readiness: "NEEDS_REMEDIATION" });

    const report = auditStudentAppAITutorRequestProgressSummary(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0360_preencode_validator_ready").passed, false);
  });

  it("fails when the summary response contract is missing", () => {
    const inputs = validInputs();
    inputs.responseTypes = inputs.responseTypes.replaceAll("studentAppAITutorRequestProgressSummaryResponse", "studentAppAITutorRequestProgressMissingResponse");
    inputs.openapi = inputs.openapi.replaceAll("StudentAppAITutorRequestProgressSummary:", "");

    const report = auditStudentAppAITutorRequestProgressSummary(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "contract_exposes_summary_counts_without_shape_break").passed, false);
  });

  it("fails when summary derivation reaches raw internal fields", () => {
    const inputs = validInputs();
    inputs.presenter = inputs.presenter.replace(
      "TotalCount: len(cards),",
      "TotalCount: len(cards),\n\t\t_ = domain.TutoringAnalysisRequest{ResultRef: \"leak\"}",
    );

    const report = auditStudentAppAITutorRequestProgressSummary(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "presenter_derives_summary_from_safe_cards_only").passed, false);
  });

  it("fails when the list ETag representation version is not bumped", () => {
    const inputs = validInputs();
    inputs.progressValidator = inputs.progressValidator.replaceAll("student-app-ai-tutor-request-progress-list/v2", "student-app-ai-tutor-request-progress-list/v1");
    inputs.preencodeAudit = inputs.preencodeAudit.replaceAll("student-app-ai-tutor-request-progress-list/v2", "student-app-ai-tutor-request-progress-list/v1");

    const report = auditStudentAppAITutorRequestProgressSummary(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "etag_representation_version_bumped_for_summary_shape").passed, false);
  });

  it("fails when 0361 evidence hooks are missing", () => {
    const inputs = validInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll(
      "studentAppAiTutorRequestProgressSummary",
      "studentAppAiTutorRequestProgressPreencodeValidator",
    );
    inputs.architectureBoard = "12.16/10";

    const report = auditStudentAppAITutorRequestProgressSummary(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0361").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    source0360Report: "reports/student-app-ai-tutor-request-progress-preencode-validator.current.json",
    responseTypes: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
    presenter: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
    progressValidator: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_progress_validator.go",
    preencodeAudit: "tools/student-app-ai-tutor-request-progress-preencode-validator-audit.mjs",
    httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request_progress_test.go",
    openapi: "contracts/openapi/teaching-archive.student-app-ai-tutor-request-progress.schema.yaml",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0361-student-app-ai-tutor-request-progress-summary.md",
  }).map(([key, relativePath]) => [
    key,
    fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : "",
  ]));
}
